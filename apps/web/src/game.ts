/**
 * A game against the bot.
 *
 * The cold open (`SPEC.md` E3): somebody opens this alone at a random hour with nobody else online,
 * and something has to be playable in one tap — no wallet, no opponent, no wait. This is that
 * screen, and it is the first thing built for exactly that reason.
 *
 * The board knows nothing about chess and this file knows nothing about drawing. `chess.js` holds
 * legality, `@scoresheet/core` holds the two rules it lacks and the engine, and this joins them.
 */

import { Chess } from 'chess.js';
import { LEVELS, chooseMove, outcomeOf, type Level } from '@scoresheet/core';
import { createBoard, positionFromFen, type BoardHandle, type BoardMove, type Square } from './board.ts';
import { createMoveList } from './movelist.ts';
import { createMaterialTray, materialOf } from './material.ts';
import { haptic, play, playMoveSound } from './sound.ts';
import { newGameId, signFinishedGame, type SignedGame } from './sign-game.ts';
import { isDemo } from './demo-wallet.ts';
import { createSettingsPanel } from './settings-panel.ts';
import { onSettingsChange, settings } from './settings.ts';
import { tier } from './wallet.ts';
import { allGames, saveGame } from './store.ts';
import { MoveClock, saveTimings } from './move-timing.ts';
import { shareActions } from './share-actions.ts';
import { BOT_ADDRESS, signAsBot } from './bot-identity.ts';
import { createIdenticon } from './identicon.ts';
import { handOver } from './study.ts';
import { recordToday } from './today.ts';
import { createClock, formatClock, type ClockState } from './clock.ts';
import { t, type Key } from './i18n.ts';

export interface GameHandle {
  readonly el: HTMLElement;
  restart: (playAs?: 'w' | 'b') => void;
  readonly board: BoardHandle;
}

const RESULT_TEXT: Record<string, Key> = {
  checkmate: 'result.checkmate',
  stalemate: 'result.stalemate',
  insufficient: 'result.insufficient',
  'fifty-move': 'result.fiftyMove',
  repetition: 'result.repetition',
};

export interface GameOptions {
  /** Where to go when somebody asks to see a record. Injected so this file never routes. */
  onRecord?: (address: string) => void;
  /** Where to go to review the game just played. Injected for the same reason. */
  onStudy?: () => void;
  /** Where the lobby is. Injected so this file never routes. */
  onLobby?: () => void;
}

export function createGame(initialLevel?: Level, options: GameOptions = {}): GameHandle {
  /*
   * The opponent comes from the player's own settings, not from the caller.
   *
   * Before the sheet existed the level was hardcoded at the call site and there was no way to change
   * it — the app shipped with one bot and three unreachable ones. An explicit argument still wins,
   * so a puzzle or a test can pin a level without touching what the player chose.
   */
  let level: Level = initialLevel ?? LEVELS[settings().level] ?? LEVELS[1]!;
  const onRecord = options.onRecord ?? ((address: string) => {
    window.history.pushState({}, '', `/r/${encodeURIComponent(address.replace(/\s/g, ''))}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const onStudy = options.onStudy ?? (() => {
    window.history.pushState({}, '', '/study');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const onLobby = options.onLobby ?? (() => {
    window.history.pushState({}, '', '/play');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const chess = new Chess();
  const gameId = newGameId();
  let signed: SignedGame | null = null;
  /** Set when somebody resigned. The position cannot say so, and the scoresheet must. */
  let resigned: 'w' | 'b' | null = null;
  let playAs: 'w' | 'b' = 'w';
  let thinking = false;
  /** The move queued while the bot thinks, played the instant its reply lands. */
  let premove: BoardMove | null = null;
  /** Which ply is being looked at. `null` is the live position, and it is almost always null. */
  let viewing: number | null = null;

  /*
   * The clock, and it is rebuilt on every new game rather than reconfigured.
   *
   * The control is a setting, so changing it starts a new game the same way changing the opponent
   * does — a clock that appeared mid-game with a full allowance would be a different game.
   */
  let clock = createClock({ control: settings().botClock });
  /** One snapshot per ply, so a takeback puts the clocks back where they were. */
  const clockHistory: ClockState[] = [];
  /** Repaints the clocks between moves and notices a flag. Only running in a timed game. */
  let ticking: number | null = null;
  /** Set when somebody ran out of time, so the scoresheet can say `timeout`. */
  let flagged: 'w' | 'b' | null = null;

  const el = document.createElement('div');
  el.className = 'game';

  /*
   * The captured-piece trays, above and below the board — the side you are playing is the lower one.
   *
   * Both reference boards put them here and a player's eye already goes here, so anywhere else would
   * be a novelty rather than a design. They take no room while nothing has been taken, so an even
   * game looks like an even game rather than like two empty shelves.
   */
  const theirTray = createMaterialTray();
  const myTray = createMaterialTray();

  const status = document.createElement('p');
  status.className = 'game__status';
  status.setAttribute('role', 'status');

  const board = createBoard({
    orientation: playAs,
    playing: playAs,
    legalMoves(from: Square) {
      // Nothing is liftable while the bot is thinking or while an earlier position is being viewed:
      // a move made against a position that is not on the board is the worst kind of bug.
      if (thinking || viewing !== null || chess.turn() !== playAs) return [];
      return chess.moves({ square: from as never, verbose: true }).map((move) => move.to);
    },
    onMove(move) {
      if (thinking || viewing !== null || chess.turn() !== playAs) return false;
      try {
        legalBeforeMove = chess.moves().length;
        const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        afterMove(played.san);
        return true;
      } catch {
        // chess.js throws on an illegal move; the board turns a false into a snap-back and a shake.
        return false;
      }
    },
    /*
     * Where a piece goes *if it were your turn* — the question a premove actually answers.
     *
     * Asked of a copy with the side-to-move flipped, so `chess.js` generates this player's moves in
     * a position where it is not this player's turn. That is close to right and deliberately not
     * exact: a premove is a bet about a position that does not exist yet, so a target that turns out
     * to be illegal is a normal outcome, not an error. The game discards it and the player loses
     * nothing but the tempo they were trying to save.
     */
    premoveTargets(from: Square) {
      if (viewing !== null) return [];
      const speculative = new Chess(flipTurn(chess.fen()));
      return speculative.moves({ square: from as never, verbose: true }).map((move) => move.to);
    },
    onPremove(move) {
      premove = move;
    },
    autoQueen: () => settings().autoQueen,
  });

  /*
   * The front door — see `movelist.ts` for where it goes and why it goes there rather than above the
   * board. It is offered only until this device holds a signed game: after that the sentence has
   * been demonstrated rather than claimed, and repeating it would be decoration.
   *
   * ⭐ **Translated, which it was not.** This is the first sentence anybody reads and the one the
   * whole entry is judged on for first impression — and it was the single hardcoded English string
   * in an app that ships five languages. A Spanish, German, French or Portuguese reader met the most
   * important line in the product in a language they had not asked for, on the one screen where
   * there is nothing else to go on.
   */
  const proven = allGames().some((game) => game.signatures.white && game.signatures.black);
  const moveList = createMoveList({
    claim: proven ? undefined : t('game.claim'),
    onScrub(ply) {
      viewing = ply;
      draw();
    },
  });

  const bar = document.createElement('div');
  bar.className = 'game__bar';

  /*
   * Resign, behind a confirmation.
   *
   * Every chess app confirms this and the reason is obvious the first time somebody loses a won
   * game to a mis-tap. The button carries its own confirm rather than opening a dialog, so the
   * board is never covered by something asking a question about it.
   */
  const resign = button(t('game.resign'), () => {
    if (resign.dataset['confirming'] !== 'yes') {
      resign.dataset['confirming'] = 'yes';
      resign.textContent = t('game.resignAgain');
      resign.classList.add('btn--danger');
      // It goes back on its own. A button left in a confirming state is a trap for the next tap.
      window.setTimeout(() => {
        if (resign.dataset['confirming'] !== 'yes') return;
        delete resign.dataset['confirming'];
        resign.textContent = t('game.resign');
        resign.classList.remove('btn--danger');
      }, 4000);
      return;
    }
    delete resign.dataset['confirming'];
    resign.textContent = t('game.resign');
    resign.classList.remove('btn--danger');
    doResign();
  });
  // A stable hook: the label changes when it asks for confirmation, so nothing may select on text.
  resign.dataset['action'] = 'resign';

  /**
   * Take a move back.
   *
   * Two plies, not one: undoing only the player's move would leave the bot on move, it would
   * immediately reply, and the position would be *different* rather than restored — which is not
   * what anybody means by taking a move back.
   *
   * **It is offered against the bot and nowhere else.** A takeback in a rated game between two
   * people is a request the opponent has to grant, and quietly rewinding a signed game would make
   * the scoresheet a lie. This screen is a bot game, so it needs no permission; the multiplayer
   * screen will ask for one.
   */
  const takeback = button(t('game.takeback'), () => {
    if (thinking || signed || resigned || outcomeOf(chess).over) return;
    if (chess.history().length === 0) return;

    premove = null;
    board.setPremove(null);
    // One ply if the bot has not replied yet — which happens when the player moved and then
    // immediately took it back — and two whenever there is a reply to undo as well.
    chess.undo();
    clockHistory.pop();
    if (chess.turn() !== playAs) {
      chess.undo();
      clockHistory.pop();
    }
    /*
     * The clocks go back with the moves.
     *
     * Taking a move back and finding the time gone reads as a bug, and there is nothing to farm: a
     * game against the bot is never rated (`SPEC.md` P3). With no snapshot left the game is back at
     * the start, so the clock is too.
     */
    if (clock.timed) {
      const previous = clockHistory[clockHistory.length - 1];
      if (previous) clock.restore(previous);
      else clock.reset();
      clock.start(playAs);
      startTicking();
    }

    viewing = null;
    moveList.setMoves(chess.history());
    moveList.setViewing(null);
    draw();
    haptic(6);
    say(t(chess.history().length === 0 ? 'game.backToStart' : 'game.takenBack'));
  });
  takeback.dataset['action'] = 'takeback';

  const openSettings = button(t('settings.title'), () => panel.open());
  openSettings.dataset['action'] = 'settings';

  /*
   * ⭐ **Play a friend** — the control that was missing entirely.
   *
   * The lobby has lived at `/play` since it was built and **nothing in the app linked to it**. Every
   * test reached it by typing the URL, so nothing caught it: a real player could beat the bot, solve
   * puzzles and study a game, and had no way at all to start one against a person. That is the share
   * link — which `SPEC.md` step 5 and the README both call the whole distribution strategy — the only
   * rated games there are, and therefore the only way a record page ever gets anything on it.
   *
   * It belongs on the bar rather than in the navigation: the navigation says *where you are*, and
   * this is something you *do*, thought of while sitting in front of a board playing alone.
   */
  const friend = button(t('game.playFriend'), () => onLobby());
  friend.classList.add('btn--primary');
  friend.dataset['action'] = 'play-friend';

  bar.append(
    friend,
    button(t('game.flip'), () => {
      board.flip();
      haptic(6);
    }),
    takeback,
    resign,
    button(t('game.newGame'), () => restart()),
    openSettings,
  );

  /*
   * The settings sheet, and the live wiring that makes it worth having.
   *
   * Every switch takes effect on the board underneath as it is tapped. That is the entire argument
   * for a sheet over a settings route, and it only holds if the board is actually listening.
   */
  const panel = createSettingsPanel({
    onLevel(index) {
      level = LEVELS[index] ?? level;
      paintOpponent();
      restart(playAs);
      say(t('game.newGameAgainst', { bot: level.name }));
    },
    onClock() {
      restart(playAs);
    },
  });

  /*
   * The way out of zen, and it is not optional.
   *
   * Zen hides the control bar, and the control bar is where the settings button lives — so without
   * this, turning zen on would remove every route back to the setting that turned it on. The only
   * escape from the app's most drastic option would have been clearing site data. It is one small
   * control, visible only in zen, and it puts the sheet back on screen.
   */
  const zenExit = button(t('settings.title'), () => panel.open());
  zenExit.className = 'btn game__zen-exit';
  zenExit.dataset['action'] = 'zen-exit';
  zenExit.setAttribute('aria-label', t('game.leaveZen'));

  function applySettings(): void {
    const chosen = settings();
    board.setShowDests(chosen.moveDots);
    board.setShowCoords(chosen.coordinates);
    el.classList.toggle('game--zen', chosen.zen);
    /*
     * Blindfold hides the pieces and keeps everything else.
     *
     * The move list is what a blindfold player follows, so hiding that too would not be blindfold
     * chess — it would be no chess. The squares stay tappable, which is the point: the game is
     * played on a board you cannot see rather than in your head alone.
     */
    el.classList.toggle('game--blindfold', chosen.blindfold);
  }
  applySettings();
  onSettingsChange(applySettings);

  function doResign(): void {
    if (resigned || outcomeOf(chess).over) return;
    resigned = playAs;
    viewing = null;
    board.setPlaying(null);
    play('end');
    say(t(playAs === 'w' ? 'game.resignedBlackWins' : 'game.resignedWhiteWins'));
    draw();
    showEnding();
  }

  /*
   * The end-of-game panel. Empty until there is a result, so it never occupies the screen during
   * play, and it is the only place in the app that asks for a wallet.
   */
  const ending = document.createElement('div');
  ending.className = 'ending';
  ending.hidden = true;

  /*
   * Two clocks, above and below the board, on the same geometry as the live game's.
   *
   * Hidden entirely in an untimed game rather than shown as a dash: the default is no clock, and a
   * pair of empty boxes on the first screen a stranger sees would be two things to wonder about.
   */
  const theirClock = document.createElement('div');
  theirClock.className = 'game__clock game__clock--opponent';
  const myClock = document.createElement('div');
  myClock.className = 'game__clock game__clock--mine';

  /*
   * Who you are playing, with their face, above the board.
   *
   * The settings sheet grew faces for the four bots and the board did not, so a player could pick
   * Nell and then never see her again. The live game shows the opponent this way; a bot is an
   * opponent, and the screen should say which one without being opened.
   */
  const opponentLine = document.createElement('div');
  opponentLine.className = 'game__opponent';

  function paintOpponent(): void {
    opponentLine.replaceChildren(
      createIdenticon(`${BOT_ADDRESS}:${level.name}`, 24),
      (() => {
        const name = document.createElement('span');
        name.className = 'game__opponent-name';
        name.textContent = level.name;
        return name;
      })(),
    );
  }
  paintOpponent();

  el.append(
    opponentLine,
    theirClock,
    theirTray.el,
    board.el,
    myTray.el,
    myClock,
    status,
    ending,
    moveList.el,
    bar,
    zenExit,
    panel.el,
  );

  /**
   * Play the same opponent again, same colour, one tap.
   *
   * Every chess site has this and it is the commonest thing anybody does at the end of a game — the
   * alternative here was "New game", which is the same thing minus the certainty that nothing has
   * changed. A rematch is a promise that the next game is the one you just asked for.
   */
  function rematchButton(): HTMLButtonElement {
    const again = button(t('game.rematch'), () => restart(playAs));
    again.classList.add('btn--primary');
    again.dataset['action'] = 'rematch';
    return again;
  }

  /**
   * The other thing everybody wants when a game ends: to know where it went wrong.
   *
   * `SPEC.md` J9 calls Chess.com's Game Review the most-loved feature in chess software by a
   * distance. It is offered on every ending, signed or not — a lost game against a bot is exactly
   * the game somebody most wants explained, and it has nothing to do with whether it was recorded.
   */
  function reviewButton(): HTMLButtonElement {
    const review = button(t('game.review'), () => {
      handOver({
        moves: chess.history(),
        title: t('game.youVs', { bot: level.name, moves: Math.ceil(chess.history().length / 2) }),
      });
      onStudy();
    });
    review.dataset['action'] = 'study';
    return review;
  }

  /** Counted once per game, not once per repaint of the ending. */
  let counted = false;

  function showEnding(): void {
    ending.replaceChildren();
    ending.hidden = false;
    resign.hidden = true;
    stopTicking();
    clock.stop();
    paintClocks();

    /*
     * Today's tally, recorded here because this is the one place every ending passes through —
     * checkmate, resignation, a flag and a draw all arrive at `showEnding`.
     */
    if (!counted) {
      counted = true;
      const outcome = outcomeOf(chess);
      const result = resigned ? (resigned === 'w' ? '0-1' : '1-0')
        : flagged ? (flagged === 'w' ? '0-1' : '1-0')
        : outcome.result;
      const won = result === (playAs === 'w' ? '1-0' : '0-1');
      recordToday({ games: 1, wins: won ? 1 : 0 });
    }

    if (signed) {
      const done = document.createElement('p');
      done.className = 'ending__done';
      done.textContent = isDemo()
        ? t('sign.demoDone')
        : t('sign.done');
      ending.append(done);

      const proof = document.createElement('details');
      proof.className = 'ending__proof';
      const summary = document.createElement('summary');
      summary.textContent = t('sign.whatWasSigned');
      const pre = document.createElement('pre');
      pre.className = 'ending__canonical';
      // The exact bytes, shown. The claim is that a stranger can re-check this; hiding it would
      // make that a promise rather than something anybody can act on.
      pre.textContent = signed.canonical;
      proof.append(summary, pre);
      ending.append(proof);

      // The record is where a signature stops being a fact about one game and starts being a
      // rating. It is also the only link here worth sending to somebody who has never heard of us.
      const toRecord = document.createElement('a');
      toRecord.className = 'btn';
      toRecord.href = `/r/${encodeURIComponent(signed.by.replace(/\s/g, ''))}`;
      toRecord.textContent = t('game.seeRecord');
      toRecord.addEventListener('click', (event) => {
        event.preventDefault();
        onRecord(signed!.by);
      });
      ending.append(toRecord);
      ending.append(shareActions(signed.canonical, signed.sheet));
      ending.append(rematchButton());
      ending.append(reviewButton());
      return;
    }

    const line = document.createElement('p');
    line.className = 'ending__line';
    line.textContent =
      tier() === 'none'
        ? t('sign.needsNimiqPay')
        : t('sign.invitation');
    ending.append(line);

    if (tier() !== 'none') {
      const signButton = document.createElement('button');
      signButton.type = 'button';
      signButton.className = 'btn btn--primary';
      // A verb about the game, not a noun about infrastructure. Nobody should need to be told why.
      signButton.textContent = t('sign.button');
      signButton.dataset['action'] = 'sign';
      signButton.addEventListener('click', () => void doSign(signButton));
      ending.append(signButton);
    }

    /*
     * Another game, and an explanation of this one — **whether or not there is a wallet**.
     *
     * These two sat inside the branch above, so somebody browsing without Nimiq Pay finished a game
     * and was offered nothing but a sentence about signing. Neither has anything to do with a
     * wallet: wanting to play again is the commonest thing that happens at the end of a game, and a
     * lost game is the one somebody most wants explained.
     */
    ending.append(rematchButton());
    ending.append(reviewButton());
  }

  async function doSign(trigger: HTMLButtonElement): Promise<void> {
    const original = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = t('sign.waiting');

    const outcome = await signFinishedGame({
      chess,
      gameId,
      chain: 'test',
      playedAs: playAs,
      opponent: BOT_ADDRESS,
      // Never. A rating against an opponent you control is not a rating.
      rated: false,
      resigned,
      flagged,
    });

    trigger.disabled = false;
    trigger.textContent = original;

    if (!outcome.ok) {
      const note = document.createElement('p');
      note.className = `ending__note ending__note--${outcome.tone}`;
      note.setAttribute('role', 'status');
      note.textContent = outcome.message;
      ending.append(note);
      return;
    }

    signed = outcome.signed;

    /*
     * Saved the moment it is signed.
     *
     * A signature that exists only in a variable is a signature that a refresh destroys, and the
     * one thing this product promises is that the result is *yours*. The bot's side is never
     * signed, so this game stays visibly incomplete on the record — which is honest: a bot cannot
     * agree to anything.
     */
    saveGame({
      sheet: outcome.signed.sheet,
      side: playAs === 'w' ? 'white' : 'black',
      signature: outcome.signed.signature,
      moves: outcome.signed.moves,
    });

    /*
     * And the bot signs its own side.
     *
     * Without this, a game played alone would sit on the record as "not signed by both players"
     * forever, and the recompute button — the single most important screen in the entry — would
     * report zero verified games to anybody who has not found a second person.
     *
     * It is a real signature from a real key, published openly in `bot-identity.ts`. What stops a
     * rating being farmed is not the secrecy of that key; it is the word `casual` inside the bytes
     * both sides signed.
     */
    saveGame({
      sheet: outcome.signed.sheet,
      side: playAs === 'w' ? 'black' : 'white',
      signature: await signAsBot(outcome.signed.canonical),
      moves: outcome.signed.moves,
    });

    /*
     * The timings go beside the game, joined by the canonical text.
     *
     * After the signature rather than before it: the canonical text is the join key, and until the
     * game is signed there is nothing stable to join to.
     */
    saveTimings(outcome.signed.canonical, moveClock.collected());

    play('end');
    showEnding();
  }

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn';
    element.textContent = label;
    element.addEventListener('click', onClick);
    return element;
  }

  /** The king's square, so the board can mark it — only when there actually is a check. */
  function checkSquare(position: Chess): Square | null {
    if (!position.isCheck()) return null;
    const turn = position.turn();
    for (const row of position.board()) {
      for (const piece of row) {
        if (piece?.type === 'k' && piece.color === turn) return piece.square;
      }
    }
    return null;
  }

  /**
   * Rebuild the position being *looked at*, which is not always the position being played.
   *
   * Replaying from the start rather than keeping a stack of positions: a game is at most a few
   * hundred plies, replaying one is microseconds, and a second source of truth for the position is
   * how a board and a game quietly drift apart.
   */
  function shown(): Chess {
    if (viewing === null) return chess;
    const replay = new Chess();
    const history = chess.history();
    for (let ply = 0; ply <= viewing && ply < history.length; ply++) replay.move(history[ply]!);
    return replay;
  }

  function draw(): void {
    const position = shown();
    board.setPosition(position.fen());

    /*
     * Counted from the position being *shown*, not the live one.
     *
     * Scrubbing back through the game walks the trays back with it, which is what makes them useful
     * while reviewing — "when did I lose that rook" is answered by the tray changing.
     */
    const material = materialOf(positionFromFen(position.fen()));
    // The board is oriented to the side being played, so the lower tray is always this player's.
    theirTray.update(material, playAs === 'w' ? 'b' : 'w');
    myTray.update(material, playAs);
    board.setCheck(checkSquare(position));

    const verbose = position.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    board.setLastMove(last?.from ?? null, last?.to ?? null);

    /*
     * Nothing may be picked up off a past position, nothing while the bot is thinking, and nothing
     * once the game is over — **however it ended**.
     *
     * The last of those was wrong and it was a real bug: this asked only `outcomeOf(chess).over`,
     * which reads the *position*. A resignation and a flag both leave an ordinary position behind,
     * and `doResign` calls `draw()` immediately after clearing `playing` — so the board handed
     * itself straight back and the game could be played on after being resigned.
     */
    const over = outcomeOf(chess).over || resigned !== null || flagged !== null;
    const live = viewing === null && !thinking && !over;
    board.setPlaying(live ? playAs : null);
    el.classList.toggle('game--reviewing', viewing !== null);
  }

  function say(message: string): void {
    status.textContent = message;
    board.announce(message);
  }

  function paintClocks(): void {
    theirClock.hidden = !clock.timed;
    myClock.hidden = !clock.timed;
    if (!clock.timed) return;

    const left = clock.left;
    const mine = playAs === 'w' ? left.w : left.b;
    const theirs = playAs === 'w' ? left.b : left.w;
    myClock.textContent = formatClock(mine);
    theirClock.textContent = formatClock(theirs);

    // Whose clock is running, and whether either is nearly out — said with a class, and the class is
    // what the contrast checks measure.
    const over = outcomeOf(chess).over || flagged !== null || signed !== null || resigned !== null;
    myClock.classList.toggle('game__clock--running', !over && clock.running === playAs);
    theirClock.classList.toggle('game__clock--running', !over && clock.running !== null && clock.running !== playAs);
    myClock.classList.toggle('game__clock--low', mine < 15_000);
    theirClock.classList.toggle('game__clock--low', theirs < 15_000);
  }

  /**
   * Repaint the clocks four times a second, and end the game the moment one runs out.
   *
   * Four is enough that the tenths under ten seconds move smoothly and cheap enough to leave running
   * for a ten-minute game. The flag is noticed here rather than only on a move, because the whole
   * point of running out of time is that it happens when you are *not* moving.
   */
  function startTicking(): void {
    stopTicking();
    if (!clock.timed) return;
    ticking = window.setInterval(() => {
      paintClocks();
      const out = clock.flagged();
      if (out !== null) onFlag(out);
    }, 250);
  }

  function stopTicking(): void {
    if (ticking !== null) window.clearInterval(ticking);
    ticking = null;
  }

  function onFlag(side: 'w' | 'b'): void {
    if (flagged !== null || outcomeOf(chess).over) return;
    flagged = side;
    clock.stop();
    stopTicking();
    viewing = null;
    board.setPlaying(null);
    play('end');
    say(t(side === playAs ? 'game.youFlagged' : 'game.theyFlagged'));
    draw();
    showEnding();
  }

  /*
   * ⭐ **How long each move took, and how much choice there was.**
   *
   * Recorded from now on because it cannot be recorded later: an analysis that needs move timings
   * can be written next month, but the timings of games played this month are gone unless something
   * writes them down today. `move-timing.ts` says what this is and, more importantly, what it is
   * not — it is never signed, never part of the scoresheet, and never evidence on its own.
   *
   * **Only this player's moves are counted.** The bot's "thinking time" is a millisecond budget in
   * `engine.ts`, so including it would mix a constant into a record that exists to describe a
   * person. `legalBeforeMove` is captured at each of the three places a move is applied, because by
   * the time `afterMove` runs the position it describes is already gone.
   */
  const moveClock = new MoveClock();
  let legalBeforeMove = 0;

  function afterMove(san: string): void {
    /*
     * The clock is charged before anything is drawn.
     *
     * The mover's time stops the instant the move is made, not when the screen catches up — the
     * alternative charges somebody for our own rendering.
     */
    const mover = chess.turn() === 'w' ? 'b' : 'w';

    // Only this player's own moves, and only after a move has actually been applied.
    if (mover === playAs) moveClock.played(legalBeforeMove);
    else moveClock.ready();

    if (clock.timed) {
      const out = clock.played(mover);
      clockHistory.push(clock.snapshot());
      if (out) {
        onFlag(mover);
        return;
      }
    }

    playMoveSound(san);
    // A move arriving pulls the view back to live: the player made it, so they want to see it.
    viewing = null;
    moveList.setMoves(chess.history());
    moveList.setViewing(null);
    draw();

    const outcome = outcomeOf(chess);
    if (outcome.over) {
      board.setPlaying(null);
      play('end');
      const who =
        outcome.result === '1/2-1/2' ? '' : t(outcome.result === '1-0' ? 'result.whiteWins' : 'result.blackWins');
      say(`${t(RESULT_TEXT[outcome.termination ?? ''] ?? 'result.gameOver')}${who}`);
      showEnding();
      return;
    }
    say(`${san}${chess.isCheck() ? t('result.check') : ''}`);
    // Handed over only once the game is known to continue, so a clock never runs on a finished game.
    if (clock.timed) {
      clock.start(chess.turn());
      startTicking();
      paintClocks();
    }
    if (chess.turn() !== playAs) void botMove();
  }

  async function botMove(): Promise<void> {
    thinking = true;
    board.setPlaying(null);
    // The player keeps their pieces while the bot thinks — they just queue instead of moving.
    board.setPremoving(playAs);
    // A frame, so the player's own move is painted before the bot starts thinking. Without it the
    // board appears to freeze on their move rather than on the reply.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const started = Date.now();
    const choice = chooseMove(chess, level);
    await pause(MIN_REPLY_MS - (Date.now() - started));
    thinking = false;
    board.setPremoving(null);
    if (!choice) return;
    legalBeforeMove = chess.moves().length;
    afterMove(chess.move(choice.san).san);
    playPremove();
  }

  /**
   * Play the queued move, if it is still legal, the instant the opponent has moved.
   *
   * **An illegal premove is a normal outcome, not an error.** The player bet on a position that had
   * not happened yet and it did not happen; the queue clears, the board is theirs again, and nothing
   * is said about it. Announcing a "failed premove" would turn a normal part of fast chess into an
   * error message several times a game.
   *
   * It runs after `afterMove`, so a premove into a finished game is impossible: `afterMove` clears
   * `playing` when the game ends, and the guard below sees it.
   */
  function playPremove(): void {
    const queued = premove;
    premove = null;
    board.setPremove(null);
    if (!queued || outcomeOf(chess).over || chess.turn() !== playAs) return;

    try {
      legalBeforeMove = chess.moves().length;
      const played = chess.move({ from: queued.from, to: queued.to, promotion: queued.promotion ?? 'q' });
      afterMove(played.san);
    } catch {
      // It stopped being legal. That is what a premove risks, and it costs nothing to abandon.
    }
  }

  function restart(colour: 'w' | 'b' = playAs): void {
    playAs = colour;
    viewing = null;
    premove = null;
    board.setPremove(null);
    board.setPremoving(null);
    signed = null;
    resigned = null;
    ending.hidden = true;
    ending.replaceChildren();
    resign.hidden = false;
    delete resign.dataset['confirming'];
    resign.textContent = t('game.resign');
    resign.classList.remove('btn--danger');
    chess.reset();
    /*
     * A fresh clock on the control that is set *now*.
     *
     * Rebuilt rather than reset, because the setting may have changed since the last game — which is
     * exactly how the control is chosen: pick one in the sheet, and the next game has it.
     */
    flagged = null;
    counted = false;
    clockHistory.length = 0;
    clock = createClock({ control: settings().botClock });
    if (clock.timed) {
      clock.start('w');
      startTicking();
    } else {
      stopTicking();
    }
    paintClocks();
    board.setOrientation(playAs);
    moveList.setMoves([]);
    moveList.setViewing(null);
    draw();
    say(
      playAs === 'w'
        ? t('game.yourMoveAsWhite', { bot: level.name })
        : t('game.botIsWhite', { bot: level.name }),
    );
    if (chess.turn() !== playAs) void botMove();
  }

  /*
   * Arrow keys walk the move list, which is what every chess site does and what people reach for
   * without being told. Ignored while typing, so it cannot fight a text field later.
   */
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable]')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveList.step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveList.step(1);
    } else if (event.key === 'f' && !event.metaKey && !event.ctrlKey) {
      board.flip();
    }
  });

  restart('w');
  return { el, restart, board };
}


/**
 * The floor on how fast the bot answers.
 *
 * **Found by testing premoves, and it is a real defect on its own.** An opening-book move needs no
 * search, so the bot replied in under a millisecond — the reply was on the board before the player's
 * own move had finished animating. Two things are wrong with that, and only one of them is about
 * premoves:
 *
 *  1. **It does not read as an opponent.** An instant answer reads as a table lookup, because that
 *     is exactly what it is. Every chess app pauses its bots, and this is why.
 *  2. **A premove needs a window to live in.** With an instant reply there is no interval in which
 *     to queue anything, so the feature that defines fast chess would have existed in the code and
 *     never once in the product — working perfectly, mid-game, where nobody is in a hurry.
 *
 * 450 ms is long enough to read as a considered reply and short enough that nobody waits. Searched
 * moves usually take longer than this and are unaffected; the floor only ever applies to book moves
 * and to trivially forced positions.
 */
const MIN_REPLY_MS = 450;

/** Wait, or return immediately for anything already elapsed. */
function pause(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The same position, with the other side to move.
 *
 * A premove asks where a piece goes *if it were your turn*, and `chess.js` will only generate moves
 * for the side to move. Flipping the field in the FEN is the whole trick, and the en-passant square
 * has to go with it: it belongs to the move that was just played, and keeping it would let the
 * speculative board offer an en-passant capture that the real position cannot have. Halfmove and
 * fullmove counters are left alone — nothing here depends on them, and rewriting them would make
 * this function look like it produced a position that could actually occur.
 */
function flipTurn(fen: string): string {
  const fields = fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  return fields.join(' ');
}
