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

export function createGame(level: Level = LEVELS[1]!): GameHandle {
  const chess = new Chess();
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

  bar.append(
    button('Flip board', () => {
      board.flip();
      haptic(6);
    }),
    sound,
    button('New game', () => restart()),
    button('Play the other colour', () => restart(playAs === 'w' ? 'b' : 'w')),
  );

  el.append(board.el, status, moveList.el, bar);

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
