/**
 * A live game against another person.
 *
 * `SPEC.md` step 5, and the share link is the whole distribution strategy: a game you can hand to
 * somebody with a URL is a game they can play without installing anything, having a wallet, or
 * knowing what Nimiq is. That link is the growth loop and the demo at once.
 *
 * **The server is the authority and this screen knows it.** The countdown here is for feel; the
 * number that decides anything comes from the server (`SPEC.md` I3). The board is redrawn from the
 * server's move list on every change rather than from local state, so there is exactly one story
 * about what has happened and this screen is never the one telling it.
 *
 * The two moments that are easy to get wrong, and are not:
 *
 *  - **Waiting for an opponent is a state, not a blank board.** The link is the only thing on screen
 *    while the second seat is empty, because handing it over is the only useful thing to do.
 *  - **A won game on time is claimed, never taken.** The button appears; nothing happens by itself
 *    (`SPEC.md` I2).
 */

import { Chess } from 'chess.js';
import { signServerGame } from './sign-game.ts';
import { createBoard, positionFromFen, type Square } from './board.ts';
import { createMaterialTray, materialOf } from './material.ts';
import { createMoveList } from './movelist.ts';
import { haptic, play, playMoveSound } from './sound.ts';
import { settings } from './settings.ts';
import { saveGame } from './store.ts';
import { shareActions } from './share-actions.ts';
import { handOver } from './study.ts';
import { recordToday } from './today.ts';
import { TIP_AMOUNTS, sendNim, tipMemo } from './send-nim.ts';
import { shortAddress } from './record.ts';
import { connect, rememberedAddress, tier } from './wallet.ts';
import {
  ApiError,
  askRematch,
  joinGame,
  pollGame,
  sendAction,
  sendMove,
  sendSignature,
  type Poller,
} from './online.ts';
import type { GameView } from './online-types.ts';
import { explainFailure } from './failures.ts';
import type { Termination } from '@scoresheet/core';
import { t, type Key } from './i18n.ts';
import { createIdenticon } from './identicon.ts';

export interface OnlineScreenOptions {
  id: string;
  onBack: () => void;
  onRecord: (address: string) => void;
  /** Go to another live game — a rematch, which is a different game with its own address. */
  onGame: (id: string) => void;
  /** Go and review the game that just finished. */
  onStudy: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', 'btn', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** `183000` → `3:03`. Under ten seconds it gains a decimal, which is what blitz players expect. */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10_000) return (total / 1000).toFixed(1);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The server's termination, narrowed to the scoresheet's own union.
 *
 * The server sends a string and the scoresheet signs a typed reason, so the boundary is checked
 * rather than cast. Anything unrecognised becomes `abandoned`, which is the honest reading of "this
 * game ended for a reason this version does not know about" — and it keeps a future server that
 * grows a new termination from producing a scoresheet nobody can parse.
 */
function terminationOf(reason: string | null): Termination {
  const known: readonly Termination[] = [
    'checkmate', 'resignation', 'timeout', 'stalemate',
    'agreement', 'insufficient', 'repetition', 'fifty-move', 'abandoned',
  ];
  return known.find((candidate) => candidate === reason) ?? 'abandoned';
}

const RESULT_WORDS: Record<string, Key> = {
  checkmate: 'live.checkmate',
  resignation: 'live.resignation',
  timeout: 'live.timeout',
  stalemate: 'live.stalemate',
  insufficient: 'live.insufficient',
  repetition: 'live.repetition',
  'fifty-move': 'live.fiftyMove',
  agreement: 'live.agreement',
};

export function createOnlineScreen(options: OnlineScreenOptions): HTMLElement {
  const el = element('div', 'online');

  let game: GameView | null = null;
  let me: string | null = null;
  let mySide: 'w' | 'b' | null = null;
  let poller: Poller | null = null;
  /** Set while a move is in flight, so the board cannot send a second one from a stale position. */
  let sending = false;
  /**
   * The newest version this screen has drawn, so the poller can start cheap.
   *
   * Tracked separately from `game` because the compiler cannot see through `render`'s assignment
   * from inside the async start-up block — and threading it explicitly is clearer than a cast that
   * says "trust me" about the one number the poller depends on.
   */
  let version = 0;

  /*
   * No Back button: the navigation is global now.
   *
   * Every screen used to carry its own "Back to the board", which was the only way out when the nav
   * lived inside the bot-game screen. With three sections above every screen it is a second control
   * doing the same job in a different place — and two ways to do one thing is how a small app starts
   * feeling like a big one.
   */

  const status = element('p', 'online__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  /*
   * Who is on the other side of the board, with a face.
   *
   * A live game shows an address and nothing else about the opponent. The identicon is what makes
   * "the person I am playing" a thing you recognise rather than a string you scroll past — and it is
   * the same face they will see on the certificate afterwards.
   */
  const opponentLine = element('div', 'online__opponent');
  opponentLine.hidden = true;

  const opponentClock = element('div', 'online__clock online__clock--opponent');
  const myClock = element('div', 'online__clock online__clock--mine');

  /*
   * The trays are built per side and swapped once the seat is known.
   *
   * A live game is not always played as white, so which tray goes on top depends on the seat — and
   * the seat is only known after joining. They are created for both colours and assigned in
   * `paintBoard`, which already runs on every change.
   */
  const topTray = createMaterialTray();
  const bottomTray = createMaterialTray();

  const board = createBoard({
    legalMoves(from: Square) {
      if (!game || !mySide || sending || game.result !== null) return [];
      if (game.turn !== mySide) return [];
      const chess = new Chess(game.fen);
      return chess.moves({ square: from as never, verbose: true }).map((move) => move.to);
    },
    onMove(move) {
      if (!game || !mySide || sending || game.result !== null || game.turn !== mySide) return false;
      const chess = new Chess(game.fen);
      let san: string;
      try {
        san = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' }).san;
      } catch {
        return false;
      }
      void submit(san);
      return true;
    },
    autoQueen: () => settings().autoQueen,
  });

  /*
   * The move list scrubs here too — and it did not, which was a real regression against our own
   * bot screen.
   *
   * `onScrub` was `() => undefined`: tapping an earlier move in a live game did nothing at all,
   * while the identical control on the bot screen walked the game. `movelist.ts`'s own header says
   * people do this *mid-game, constantly, to check what just happened* — and a live game is exactly
   * when they do it, because there is an opponent and a clock and something just happened.
   *
   * Reviewing never touches the game: the board is redrawn from a replay, the pieces are unliftable
   * while looking back, and the next server update pulls the view forward to live.
   */
  let viewing: number | null = null;

  const moveList = createMoveList({
    onScrub(ply) {
      viewing = ply;
      paintBoard();
    },
  });
  const actions = element('div', 'online__actions');
  const ending = element('div', 'ending');
  ending.hidden = true;

  const share = element('div', 'online__share');
  share.hidden = true;

  el.append(
    share,
    opponentLine,
    opponentClock,
    topTray.el,
    board.el,
    bottomTray.el,
    status,
    myClock,
    ending,
    moveList.el,
    actions,
  );

  /* ------------------------------------------------------------------ drawing */

  /**
   * The local countdown, for feel only.
   *
   * It ticks four times a second between polls so the clock does not visibly jump, and every server
   * answer overwrites it. It is never allowed to *decide* anything — a client that flagged its own
   * opponent would be a client worth lying from.
   */
  let ticking: number | null = null;
  let localWhiteMs = 0;
  let localBlackMs = 0;
  let lastSync = 0;

  function startTicking(): void {
    if (ticking !== null) return;
    ticking = window.setInterval(() => {
      if (!game || game.result !== null || game.initialMs === 0) return;
      if (game.white === null || game.black === null) return;
      const elapsed = Date.now() - lastSync;
      const white = game.turn === 'w' ? Math.max(0, game.whiteMs - elapsed) : game.whiteMs;
      const black = game.turn === 'b' ? Math.max(0, game.blackMs - elapsed) : game.blackMs;
      localWhiteMs = white;
      localBlackMs = black;
      paintClocks();
    }, 250);
  }

  function paintClocks(): void {
    if (!game) return;
    if (game.initialMs === 0) {
      opponentClock.hidden = true;
      myClock.hidden = true;
      return;
    }
    opponentClock.hidden = false;
    myClock.hidden = false;

    const mine = mySide === 'b' ? localBlackMs : localWhiteMs;
    const theirs = mySide === 'b' ? localWhiteMs : localBlackMs;
    myClock.textContent = formatClock(mine);
    opponentClock.textContent = formatClock(theirs);

    // Whose clock is running, and whether either is nearly out — both said with a class and with the
    // number itself, never with colour alone.
    const myTurn = mySide !== null && game.turn === mySide;
    myClock.classList.toggle('online__clock--running', myTurn && game.result === null);
    opponentClock.classList.toggle('online__clock--running', !myTurn && game.result === null);
    myClock.classList.toggle('online__clock--low', mine < 15_000);
    opponentClock.classList.toggle('online__clock--low', theirs < 15_000);
  }

  function say(message: string, tone: 'calm' | 'bad' = 'calm'): void {
    status.textContent = message;
    status.className = `online__status online__status--${tone}`;
    board.announce(message);
  }

  function render(next: GameView): void {
    const previous = game;
    game = next;
    version = next.version;
    lastSync = Date.now();
    localWhiteMs = next.whiteMs;
    localBlackMs = next.blackMs;

    mySide = me === null ? null : next.white === me ? 'w' : next.black === me ? 'b' : null;

    // A move that arrived from the opponent gets its sound; our own already made one.
    if (previous && next.moves.length > previous.moves.length) {
      const last = next.moves[next.moves.length - 1]!;
      if (next.turn === mySide) playMoveSound(last);
    }

    /*
     * A move arriving pulls the view back to live.
     *
     * Somebody reviewing an earlier position wants to see the move that just landed — that is why
     * they were looking. Leaving them in the past while the game moves on is how a reviewer misses
     * their own turn.
     */
    if (previous && next.moves.length > previous.moves.length) viewing = null;

    moveList.setMoves(next.moves);
    moveList.setViewing(viewing);
    paintBoard();
    paintClocks();
    startTicking();

    /*
     * Who is on the other side, with their face, as soon as there is somebody there.
     *
     * Hidden while the seat is empty rather than showing a placeholder — there is nobody yet, and a
     * greyed-out face for a person who has not arrived is a thing to wonder about.
     */
    const other = mySide === null ? null : mySide === 'w' ? next.black : next.white;
    if (other && opponentLine.childElementCount === 0) {
      opponentLine.hidden = false;
      opponentLine.append(
        createIdenticon(other, 24),
        element('span', 'online__opponent-name', shortAddress(other)),
      );
    }

    // Waiting for an opponent: the link is the only useful thing on the screen.
    const waiting = next.white === null || next.black === null;
    share.hidden = !waiting;
    if (waiting) paintShare();

    paintActions();

    if (next.result !== null) {
      onFinished(next);
      return;
    }
    if (waiting) {
      say(t('live.waitingForSomebody'));
      return;
    }
    if (mySide === null) {
      say(t('live.watching'));
      return;
    }
    say(t(next.turn === mySide ? 'live.yourMove' : 'live.theirMove'));
  }

  /**
   * Draw the board, at the position being *looked at* rather than the position being played.
   *
   * The replay is built from the server's move list, so a reviewed position can never disagree with
   * the game — there is one source for what happened and this is not it.
   */
  function paintBoard(): void {
    if (!game) return;

    const live = viewing === null;
    const replay = new Chess();
    const upTo = viewing === null ? game.moves : game.moves.slice(0, viewing + 1);
    for (const san of upTo) replay.move(san);

    board.setPosition(replay.fen());
    board.setOrientation(mySide ?? 'w');

    // Counted from the position on screen, so scrubbing back walks the trays back with it.
    const material = materialOf(positionFromFen(replay.fen()));
    /*
     * The lower tray belongs to whoever is sitting at the bottom of the board.
     *
     * A spectator has no seat, so the board is shown from white's side and the trays follow it.
     */
    const below = mySide ?? 'w';
    bottomTray.update(material, below);
    topTray.update(material, below === 'w' ? 'b' : 'w');
    // Nothing may be lifted off a past position: a move made against a board that is not the game is
    // the worst kind of bug, and the one this screen is most exposed to.
    board.setPlaying(
      live && game.result === null && mySide !== null && game.turn === mySide && !sending ? mySide : null,
    );
    board.setCheck(replay.isCheck() ? kingSquare(replay) : null);

    const verbose = replay.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    board.setLastMove((last?.from ?? null) as Square | null, (last?.to ?? null) as Square | null);

    el.classList.toggle('online--reviewing', !live);
  }

  function kingSquare(chess: Chess): Square | null {
    const turn = chess.turn();
    for (const row of chess.board()) {
      for (const square of row) {
        if (square?.type === 'k' && square.color === turn) return square.square as Square;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ the share link */

  function paintShare(): void {
    if (share.childElementCount > 0) return;
    const url = `${window.location.origin}/g/${options.id}`;

    share.append(element('p', 'online__share-title', t('live.sendThisLink')));

    const field = element('div', 'online__share-row');
    const input = element('input', 'online__link');
    input.value = url;
    input.readOnly = true;
    input.setAttribute('aria-label', t('live.linkLabel'));
    // Selecting the whole thing on focus is what makes a link field usable without a copy button.
    input.addEventListener('focus', () => input.select());

    const copy = button(t('live.copy'), () => {
      void (async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = t('live.copied');
          window.setTimeout(() => (copy.textContent = t('live.copy')), 2000);
        } catch {
          // Clipboard access is refused in plenty of contexts, and an error here would be noise.
          // The field is right there and already selected, which is the fallback everybody knows.
          input.focus();
          copy.textContent = t('live.pressToCopy');
        }
      })();
    });
    field.append(input, copy);
    share.append(field);
  }

  /* ------------------------------------------------------------------ actions */

  function paintActions(): void {
    actions.replaceChildren();
    if (!game || mySide === null || game.result !== null) return;
    if (game.white === null || game.black === null) return;

    /*
     * Claim the win, and only when it is genuinely there.
     *
     * The button appears the moment the opponent's clock is out, and nothing happens without it —
     * `SPEC.md` I2. The server checks the same thing again, so a client showing it early cannot
     * turn it into a win.
     */
    if (game.claimable && game.turn !== mySide) {
      const claim = button(t('live.claimWin'), () => void act('claim'));
      claim.classList.add('btn--primary');
      claim.dataset['action'] = 'claim';
      actions.append(claim);
    }

    const resign = button(t('game.resign'), () => {
      if (resign.dataset['confirming'] !== 'yes') {
        resign.dataset['confirming'] = 'yes';
        resign.textContent = t('game.resignAgain');
        resign.classList.add('btn--danger');
        window.setTimeout(() => {
          if (resign.dataset['confirming'] !== 'yes') return;
          delete resign.dataset['confirming'];
          resign.textContent = t('game.resign');
          resign.classList.remove('btn--danger');
        }, 4000);
        return;
      }
      void act('resign');
    });
    resign.dataset['action'] = 'resign';

    const draw = button(t('live.offerDraw'), () => void act('draw'));
    draw.dataset['action'] = 'draw';

    actions.append(resign, draw);
  }

  async function act(action: 'resign' | 'claim' | 'draw'): Promise<void> {
    if (!me) return;
    try {
      render(await sendAction(options.id, me, action));
      haptic(10);
    } catch (error) {
      const failure = explainFailure(error);
      say(failure.message, failure.tone);
    }
  }

  async function submit(san: string): Promise<void> {
    if (!me) return;
    sending = true;
    board.setPlaying(null);
    playMoveSound(san);
    try {
      render(await sendMove(options.id, me, san));
    } catch (error) {
      /*
       * A rejected move puts the board back where the server says it is.
       *
       * Not where this screen thought it was: if the two disagree, the server is right by
       * definition, and showing a position the server does not have is how a player makes a second
       * move against a game that has moved on.
       */
      // Back to whatever the server says, through the one painter, so a rejection cannot leave the
      // board showing a position nothing else agrees with.
      viewing = null;
      paintBoard();
      const failure = explainFailure(error);
      say(failure.message, failure.tone);
    } finally {
      sending = false;
      poller?.nudge();
    }
  }

  /* ------------------------------------------------------------------ the ending */

  let endingShown = false;
  /** Whether this device asked for the rematch, so the offer is never shown back to its sender. */
  let asked = false;

  function onFinished(view: GameView): void {
    if (ticking !== null) {
      window.clearInterval(ticking);
      ticking = null;
    }
    board.setPlaying(null);
    actions.replaceChildren();

    const won = mySide !== null && view.result === (mySide === 'w' ? '1-0' : '0-1');
    const drew = view.result === '1/2-1/2';
    const reason = t(RESULT_WORDS[view.termination ?? ''] ?? 'result.gameOver');
    say(
      mySide === null || drew
        ? `${reason}.`
        : t(won ? 'live.reasonYouWinStop' : 'live.reasonYouLoseStop', { reason }),
    );

    /*
     * The rematch offer is refreshed on every poll, not only when the game ends.
     *
     * The other player may press Rematch a minute after the result — long after this panel was
     * built — and the invitation arrives on an ordinary poll. Returning early here without updating
     * it would leave the second player looking at a screen that never mentions the game waiting for
     * them.
     */
    paintRematch(view);
    if (endingShown) return;
    endingShown = true;
    play('end');
    // Today's tally. Only for somebody who was playing — a spectator finished nothing.
    if (mySide !== null) recordToday({ games: 1, wins: won ? 1 : 0 });

    ending.hidden = false;
    ending.replaceChildren();
    ending.append(
      element(
        'p',
        'ending__result',
        mySide === null
          ? reason
          : t(drew ? 'live.reasonDraw' : won ? 'live.reasonYouWin' : 'live.reasonYouLose', { reason }),
      ),
    );

    if (mySide === null || !me) {
      ending.append(button(t('common.backToBoard'), options.onBack));
      return;
    }

    /*
     * Signing is the point of the whole product, so it is the primary action here.
     *
     * The scoresheet is built from the server's own record of the game — its move list, its result,
     * its block height — because both players must sign *the same bytes*. Rebuilding it from what
     * this screen believes would produce two nearly-identical texts and two signatures that verify
     * against neither.
     */
    const signButton = element('button', 'btn btn--primary', t('live.sign'));
    signButton.type = 'button';
    signButton.dataset['action'] = 'sign';
    signButton.addEventListener('click', () => void doSign(view, signButton));
    ending.append(signButton);
    ending.append(
      element(
        'p',
        'ending__note',
        t('live.bothSignatures'),
      ),
    );
    ending.append(rematchRow);
    paintRematch(view);

    /*
     * And the review, offered whether or not anybody signs.
     *
     * A game that has just been lost is the one somebody most wants explained, and that has nothing
     * to do with whether it was recorded on a chain.
     */
    const review = element('button', 'btn', t('game.review'));
    review.type = 'button';
    review.dataset['action'] = 'study';
    review.addEventListener('click', () => {
      const white = view.white ? shortAddress(view.white) : t('colour.white');
      const black = view.black ? shortAddress(view.black) : t('colour.black');
      handOver({
        moves: [...view.moves],
        title: t('live.gameTitle', { white, black, moves: Math.ceil(view.moves.length / 2) }),
      });
      options.onStudy();
    });
    ending.append(review);
    ending.append(tipRow(view));
  }

  /* ------------------------------------------------------------------ tipping */

  /**
   * Send the opponent NIM, from the player's own wallet.
   *
   * `SPEC.md` P1's one honest gap: every transaction in this app came from the *pool*, and none from
   * a player. This is the smallest thing that closes it and the only one that makes sense in a chess
   * app — a gift after a good game, decided when the result is already settled, changing nothing
   * about who won.
   *
   * **Not a wager.** The rules ban games of chance outright, and a stake on a result would need an
   * escrow the framework has no method for (`SPEC.md` K8). This is money moving after the fact,
   * straight from one wallet to another, with our server not involved at all.
   */
  function tipRow(view: GameView): HTMLElement {
    const row = element('div', 'ending__tip');
    const other = mySide === null ? null : mySide === 'w' ? view.black : view.white;

    // Nothing to tip without an opponent, without a wallet of our own, or outside Nimiq Pay.
    if (!other || !me || other === me || tier() === 'none') return row;

    row.append(element('p', 'ending__tip-title', t('send.tipTitle')));
    row.append(element('p', 'ending__note', t('send.tipNote')));

    const line = element('p', 'ending__note');
    line.setAttribute('role', 'status');
    line.hidden = true;

    const buttons = element('div', 'ending__tip-amounts');
    for (const amount of TIP_AMOUNTS) {
      const send = element('button', 'btn', t('send.tip', { amount }));
      send.type = 'button';
      send.dataset['tip'] = String(amount);
      send.addEventListener('click', () => {
        for (const node of buttons.children) (node as HTMLButtonElement).disabled = true;
        send.textContent = t('send.sending');
        line.hidden = true;

        void sendNim({ to: other, nim: amount, memo: tipMemo(view.id) }).then((outcome) => {
          line.hidden = false;
          if (outcome.ok) {
            play('end');
            haptic(14);
            buttons.remove();
            line.className = 'ending__note ending__note--paid';
            line.textContent = t('send.tipSent', { amount });
            return;
          }
          for (const node of buttons.children) (node as HTMLButtonElement).disabled = false;
          send.textContent = t('send.tip', { amount });
          line.className = `ending__note ending__note--${outcome.tone === 'bad' ? 'bad' : 'calm'}`;
          line.textContent = outcome.message;
        });
      });
      buttons.append(send);
    }

    row.append(buttons, line);
    return row;
  }

  /* ------------------------------------------------------------------ another game */

  /**
   * Play them again, colours swapped.
   *
   * Most games end with both people wanting another, and sending them back to the lobby to pick a
   * time control and generate a fresh link is enough friction that they stop instead. The server
   * makes it idempotent from either side — whoever presses second joins the game the first one made
   * — so this button is safe to press at the same moment as the opponent, which is the normal case.
   */
  const rematchRow = element('div', 'ending__rematch');

  function paintRematch(view: GameView): void {
    if (mySide === null || !me) return;
    rematchRow.replaceChildren();

    /*
     * Their offer, if there is one and this device did not make it.
     *
     * `asked` is what tells the two apart: the same field means "waiting for them" to whoever
     * pressed and "they are waiting for you" to the other person, and getting that backwards would
     * show an invitation to the person who sent it.
     */
    if (view.rematchId && !asked) {
      const join = element('button', 'btn btn--primary', t('live.theyWantAnother'));
      join.type = 'button';
      join.dataset['action'] = 'rematch-join';
      join.addEventListener('click', () => options.onGame(view.rematchId!));
      rematchRow.append(join);
      return;
    }

    if (asked) {
      rematchRow.append(element('p', 'ending__note', t('live.waitingForRematch')));
      return;
    }

    const again = element('button', 'btn', t('live.playAgain'));
    again.type = 'button';
    again.dataset['action'] = 'rematch';
    again.addEventListener('click', () => {
      if (!me) return;
      again.disabled = true;
      again.textContent = t('live.settingUp');
      void askRematch(options.id, me)
        .then((next) => {
          asked = true;
          options.onGame(next.id);
        })
        .catch((error) => {
          again.disabled = false;
          again.textContent = t('live.playAgain');
          rematchRow.append(element('p', 'ending__note ending__note--bad', explainFailure(error).message));
        });
    });
    rematchRow.append(again);
  }

  async function doSign(view: GameView, trigger: HTMLButtonElement): Promise<void> {
    if (!me || !mySide || !view.result) return;

    /*
     * No height, no signature — and it is said in words rather than sent as a zero.
     *
     * `endedAtBlock` is the ordering key every rating is derived from, and the scoresheet refuses to
     * be built without a real one. Passing `0` produced exactly that refusal, surfaced as "your
     * wallet reported: endedAtBlock must be a real block height" — an internal message, blamed on
     * the wallet, in front of somebody who had just won a game. The server retries the height on
     * every read, so waiting is genuinely the right advice.
     */
    if (view.endedAtBlock === null) {
      ending.append(
        element(
          'p',
          'ending__note',
          t('live.noHeightYet'),
        ),
      );
      poller?.nudge();
      return;
    }

    trigger.disabled = true;
    trigger.textContent = t('sign.waiting');

    /*
     * Every field comes from the server's view, `endedAtBlock` included.
     *
     * Both players have to sign the same bytes. If each device asked its own wallet for a block
     * height they would get numbers a few seconds apart, and the two signatures would verify against
     * neither text. The server is the authority on what happened, and this is that principle carried
     * through to the artefact that outlives the game.
     */
    const outcome = await signServerGame({
      gameId: view.id,
      chain: 'main',
      white: view.white ?? '',
      black: view.black ?? '',
      moves: view.moves,
      result: view.result,
      termination: terminationOf(view.termination),
      endedAtBlock: view.endedAtBlock,
      rated: Math.floor(view.moves.length / 2) >= 10,
    });

    if (!outcome.ok) {
      trigger.disabled = false;
      trigger.textContent = t('live.sign');
      ending.append(element('p', `ending__note ending__note--${outcome.tone}`, outcome.message));
      return;
    }

    saveGame({
      sheet: outcome.signed.sheet,
      side: mySide === 'w' ? 'white' : 'black',
      signature: outcome.signed.signature,
      moves: outcome.signed.moves,
    });
    /*
     * The server is told, and a failure to tell it is not a failure to sign.
     *
     * The signature is already saved on this device and is the thing that counts. Posting it lets
     * the *other* player collect it whenever they open the link, which is a convenience — losing it
     * costs them a second signature request, not the game.
     */
    await sendSignature(options.id, me, outcome.signed.signature).catch(() => undefined);

    trigger.textContent = t('live.signed');
    ending.append(
      element('p', 'ending__done', t('sign.done')),
    );

    const toRecord = element('a', 'btn');
    toRecord.href = `/r/${me}`;
    toRecord.textContent = t('game.seeRecord');
    toRecord.addEventListener('click', (event) => {
      event.preventDefault();
      options.onRecord(me!);
    });
    ending.append(toRecord);

    /*
     * The same two ways out as the bot game, from the same helper.
     *
     * A live game is the one most worth sending — it is a result against a real person — so leaving
     * these off the live ending and only offering them against the bot would put the weaker artefact
     * in front of the sharing path.
     */
    ending.append(shareActions(outcome.signed.canonical, outcome.signed.sheet));

    /*
     * The public page for this game, offered the moment it becomes worth sending.
     *
     * A link a stranger can open and *check* is a stronger thing to send than an image, and this is
     * the point at which somebody most wants to send one — they have just won.
     */
    const publicLink = element('a', 'btn');
    publicLink.href = `/c/${options.id}`;
    publicLink.textContent = t('live.publicLink');
    publicLink.dataset['action'] = 'public-link';
    publicLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.history.pushState({}, '', `/c/${options.id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    ending.append(publicLink);
  }

  /* ------------------------------------------------------------------ start */

  const trouble = element('p', 'online__trouble');
  trouble.hidden = true;
  trouble.textContent = t('live.trouble');
  el.insertBefore(trouble, status);

  say(t('live.opening'));

  void (async () => {
    /*
     * The address, without a wallet dialog on arrival.
     *
     * A remembered address is used if there is one, and `connect()` is only called inside Nimiq Pay
     * — asking for a wallet the moment somebody opens a shared link would put a permission prompt in
     * front of a person who has not yet seen a chessboard, which is the opposite of how the rest of
     * this app behaves.
     */
    me = rememberedAddress();
    if (!me && tier() !== 'none') {
      me = await connect().catch(() => null);
    }

    if (!me) {
      /*
       * No wallet: watch, do not play.
       *
       * Taking a seat needs an address, because the seat is what the scoresheet will be signed
       * against. Saying so plainly beats a disabled board with no explanation, and watching is a
       * genuinely useful thing to be able to do with a link somebody sent you.
       */
      say(t('live.watchOnly'));
    } else {
      try {
        render(await joinGame(options.id, me));
      } catch (error) {
        if (error instanceof ApiError && error.code === 'game-full') {
          // Two people are already playing; this is a spectator, which is fine and is said as such.
          say(t('live.alreadyTwo'));
        } else if (error instanceof ApiError && error.code === 'no-game') {
          say(t('live.expired'), 'bad');
          return;
        } else {
          const failure = explainFailure(error);
          say(failure.message, failure.tone);
        }
      }
    }

    poller = pollGame(options.id, {
      since: version,
      mySide: () => mySide,
      over: () => game?.result != null,
      onGame: render,
      onTrouble: (inTrouble) => {
        trouble.hidden = !inTrouble;
      },
    });
  })();

  /* ------------------------------------------------------------------ leaving by accident */

  /*
   * Back does not silently abandon a live game.
   *
   * `SPEC.md` N2 calls this the worst possible back behaviour, and it is: a rated game against a
   * real person, whose clock keeps running, left by a gesture people make without looking. Half of
   * all online chess games end with somebody closing a tab; this is the other half, where they meant
   * to go back one screen.
   *
   * **The router asks this screen**, rather than the screen racing the router for the `popstate`
   * event. That was the first attempt and it lost: `main.ts` listens at module load, so it re-routed
   * — and re-created this very screen — before a listener added here could run, and the confirmation
   * was appended to an element that had already been thrown away. A question the router asks cannot
   * lose that race because there is no race.
   *
   * It returns `true` to mean "I have handled this, do not leave". Nothing is trapped: a deliberate
   * "Leave anyway" goes straight through.
   */
  (el as HTMLElement & { confirmLeave?: () => boolean }).confirmLeave = (): boolean => {
    if (!leavingIsRisky()) return false;
    askBeforeLeaving();
    return true;
  };

  function leavingIsRisky(): boolean {
    return Boolean(game && game.result === null && game.white && game.black && mySide !== null);
  }

  function askBeforeLeaving(): void {
    if (el.querySelector('.online__leaving')) return;

    const ask = element('div', 'online__leaving');
    ask.setAttribute('role', 'alertdialog');
    ask.append(
      element(
        'p',
        'online__leaving-line',
        t('live.leaveWarning'),
      ),
    );

    const stay = button(t('live.stay'), () => ask.remove());
    stay.classList.add('btn--primary');

    const leave = button(t('live.leaveAnyway'), () => {
      // Stood down first, or the router would ask again on the way out. Returning `false` is the
      // same as having no guard, and is cleaner than deleting a property under `exactOptionalPropertyTypes`.
      (el as HTMLElement & { confirmLeave?: () => boolean }).confirmLeave = () => false;
      ask.remove();
      options.onBack();
    });
    leave.dataset['action'] = 'leave-game';

    const row = element('div', 'online__leaving-row');
    row.append(stay, leave);
    ask.append(row);
    el.insertBefore(ask, el.firstChild);
    stay.focus();
  }

  /*
   * Nothing may outlive the screen.
   *
   * A poller and a clock left running against a detached board would keep asking the server about a
   * game nobody is watching, forever. `main.ts` calls this when it routes away.
   */
  (el as HTMLElement & { destroy?: () => void }).destroy = () => {
    poller?.stop();
    if (ticking !== null) window.clearInterval(ticking);
  };

  return el;
}
