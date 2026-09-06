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
import { createBoard, type BoardHandle, type Square } from './board.ts';
import { createMoveList } from './movelist.ts';
import { haptic, isMuted, play, playMoveSound, setMuted } from './sound.ts';
import { newGameId, signFinishedGame, type SignedGame } from './sign-game.ts';
import { isDemo } from './demo-wallet.ts';
import { tier } from './wallet.ts';

export interface GameHandle {
  readonly el: HTMLElement;
  restart: (playAs?: 'w' | 'b') => void;
  readonly board: BoardHandle;
}

const RESULT_TEXT: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate — a draw',
  insufficient: 'Not enough material to mate — a draw',
  'fifty-move': 'Fifty moves without a capture or a pawn — a draw',
  repetition: 'The same position five times — a draw',
};

/**
 * The bot's side of a scoresheet.
 *
 * A scoresheet names two wallets, and the bot does not have one. This is a fixed, obviously-fake
 * address that can never be a real wallet, because its checksum is not computed — and every screen
 * showing a bot game says the game is unrated.
 *
 * Which is the point: a bot game is signed so the whole path works with nobody else online, and it
 * is never rated so nobody can manufacture a rating against an opponent they control.
 *
 * It reads `B0T` with a zero, and that is not a typo. Nimiq's base-32 alphabet is
 * `0123456789ABCDEFGHJKLMNPQRSTUVXY` — no `I`, `O`, `U` or `W`, so that letters cannot be misread
 * as digits. The first draft spelled it `BOT` and was also one character short at 33, and both
 * defects sat in a single hand-counted string until the address was checked by running it rather
 * than by looking at it.
 */
const BOT_ADDRESS = `NQB0T${'0'.repeat(31)}`;

export function createGame(level: Level = LEVELS[1]!): GameHandle {
  const chess = new Chess();
  const gameId = newGameId();
  let signed: SignedGame | null = null;
  /** Set when somebody resigned. The position cannot say so, and the scoresheet must. */
  let resigned: 'w' | 'b' | null = null;
  let playAs: 'w' | 'b' = 'w';
  let thinking = false;
  /** Which ply is being looked at. `null` is the live position, and it is almost always null. */
  let viewing: number | null = null;

  const el = document.createElement('div');
  el.className = 'game';

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
        const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        afterMove(played.san);
        return true;
      } catch {
        // chess.js throws on an illegal move; the board turns a false into a snap-back and a shake.
        return false;
      }
    },
  });

  const moveList = createMoveList({
    onScrub(ply) {
      viewing = ply;
      draw();
    },
  });

  const bar = document.createElement('div');
  bar.className = 'game__bar';

  const sound = button(isMuted() ? 'Sound off' : 'Sound on', () => {
    setMuted(!isMuted());
    sound.textContent = isMuted() ? 'Sound off' : 'Sound on';
    sound.setAttribute('aria-pressed', String(!isMuted()));
    if (!isMuted()) play('move');
  });
  sound.setAttribute('aria-pressed', String(!isMuted()));

  /*
   * Resign, behind a confirmation.
   *
   * Every chess app confirms this and the reason is obvious the first time somebody loses a won
   * game to a mis-tap. The button carries its own confirm rather than opening a dialog, so the
   * board is never covered by something asking a question about it.
   */
  const resign = button('Resign', () => {
    if (resign.dataset['confirming'] !== 'yes') {
      resign.dataset['confirming'] = 'yes';
      resign.textContent = 'Tap again to resign';
      resign.classList.add('btn--danger');
      // It goes back on its own. A button left in a confirming state is a trap for the next tap.
      window.setTimeout(() => {
        if (resign.dataset['confirming'] !== 'yes') return;
        delete resign.dataset['confirming'];
        resign.textContent = 'Resign';
        resign.classList.remove('btn--danger');
      }, 4000);
      return;
    }
    delete resign.dataset['confirming'];
    resign.textContent = 'Resign';
    resign.classList.remove('btn--danger');
    doResign();
  });
  // A stable hook: the label changes when it asks for confirmation, so nothing may select on text.
  resign.dataset['action'] = 'resign';

  bar.append(
    button('Flip board', () => {
      board.flip();
      haptic(6);
    }),
    sound,
    resign,
    button('New game', () => restart()),
    button('Play the other colour', () => restart(playAs === 'w' ? 'b' : 'w')),
  );

  function doResign(): void {
    if (resigned || outcomeOf(chess).over) return;
    resigned = playAs;
    viewing = null;
    board.setPlaying(null);
    play('end');
    say(playAs === 'w' ? 'You resigned — Black wins' : 'You resigned — White wins');
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

  el.append(board.el, status, ending, moveList.el, bar);

  function showEnding(): void {
    ending.replaceChildren();
    ending.hidden = false;
    resign.hidden = true;

    if (signed) {
      const done = document.createElement('p');
      done.className = 'ending__done';
      done.textContent = isDemo()
        ? 'Signed with the stand-in wallet — structurally valid, cryptographically meaningless.'
        : 'Signed. This result is yours, and anyone can check it without us.';
      ending.append(done);

      const proof = document.createElement('details');
      proof.className = 'ending__proof';
      const summary = document.createElement('summary');
      summary.textContent = 'What was signed';
      const pre = document.createElement('pre');
      pre.className = 'ending__canonical';
      // The exact bytes, shown. The claim is that a stranger can re-check this; hiding it would
      // make that a promise rather than something anybody can act on.
      pre.textContent = signed.canonical;
      proof.append(summary, pre);
      ending.append(proof);
      return;
    }

    const line = document.createElement('p');
    line.className = 'ending__line';
    line.textContent =
      tier() === 'none'
        ? 'Signing happens in the Nimiq Pay app. Open this there and the result becomes yours.'
        : 'Sign the result and it becomes yours — a record nobody can revoke, checkable without us.';
    ending.append(line);

    if (tier() !== 'none') {
      const signButton = document.createElement('button');
      signButton.type = 'button';
      signButton.className = 'btn btn--primary';
      // A verb about the game, not a noun about infrastructure. Nobody should need to be told why.
      signButton.textContent = 'Sign the result so it counts';
      signButton.addEventListener('click', () => void doSign(signButton));
      ending.append(signButton);
    }
  }

  async function doSign(trigger: HTMLButtonElement): Promise<void> {
    const original = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = 'Waiting for your wallet…';

    const outcome = await signFinishedGame({
      chess,
      gameId,
      chain: 'test',
      playedAs: playAs,
      opponent: BOT_ADDRESS,
      // Never. A rating against an opponent you control is not a rating.
      rated: false,
      resigned,
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
    board.setCheck(checkSquare(position));

    const verbose = position.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    board.setLastMove(last?.from ?? null, last?.to ?? null);

    // Nothing may be picked up off a past position, and nothing while the bot is thinking.
    const live = viewing === null && !thinking && !outcomeOf(chess).over;
    board.setPlaying(live ? playAs : null);
    el.classList.toggle('game--reviewing', viewing !== null);
  }

  function say(message: string): void {
    status.textContent = message;
    board.announce(message);
  }

  function afterMove(san: string): void {
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
      const who = outcome.result === '1/2-1/2' ? '' : outcome.result === '1-0' ? ' — White wins' : ' — Black wins';
      say(`${RESULT_TEXT[outcome.termination ?? ''] ?? 'Game over'}${who}`);
      showEnding();
      return;
    }
    say(`${san}${chess.isCheck() ? ' — check' : ''}`);
    if (chess.turn() !== playAs) void botMove();
  }

  async function botMove(): Promise<void> {
    thinking = true;
    board.setPlaying(null);
    // A frame, so the player's own move is painted before the bot starts thinking. Without it the
    // board appears to freeze on their move rather than on the reply.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const choice = chooseMove(chess, level);
    thinking = false;
    if (!choice) return;
    afterMove(chess.move(choice.san).san);
  }

  function restart(colour: 'w' | 'b' = playAs): void {
    playAs = colour;
    viewing = null;
    signed = null;
    resigned = null;
    ending.hidden = true;
    ending.replaceChildren();
    resign.hidden = false;
    delete resign.dataset['confirming'];
    resign.textContent = 'Resign';
    resign.classList.remove('btn--danger');
    chess.reset();
    board.setOrientation(playAs);
    moveList.setMoves([]);
    moveList.setViewing(null);
    draw();
    say(playAs === 'w' ? `Your move. You are White, against ${level.name}.` : `${level.name} is White. Their move.`);
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
