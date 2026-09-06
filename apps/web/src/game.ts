/**
 * A game against the bot.
 *
 * The cold open (`SPEC.md` E3): a judge, or anybody, opens this alone at a random hour with nobody
 * else online, and something has to be playable in one tap — no wallet, no opponent, no wait. This
 * is that screen, and it is the first thing built for exactly that reason.
 *
 * The board knows nothing about chess and this file knows nothing about drawing. `chess.js` holds
 * legality, `@scoresheet/core` holds the rules the two references disagree on and the engine, and
 * this joins them.
 */

import { Chess } from 'chess.js';
import { LEVELS, chooseMove, outcomeOf, type Level } from '@scoresheet/core';
import { createBoard, type BoardHandle, type Square } from './board.ts';

export interface GameHandle {
  readonly el: HTMLElement;
  /** Start again, optionally as the other colour. */
  restart: (playAs?: 'w' | 'b') => void;
  readonly board: BoardHandle;
}

/** Long names, so a status line reads like a person wrote it. */
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

  const el = document.createElement('div');
  el.className = 'game';

  const status = document.createElement('p');
  status.className = 'game__status';
  status.setAttribute('role', 'status');

  const board = createBoard({
    orientation: playAs,
    playing: playAs,
    legalMoves(from: Square) {
      // Asked fresh every time a piece is lifted, so the board never holds a stale idea of legality.
      if (thinking || chess.turn() !== playAs) return [];
      return chess.moves({ square: from as never, verbose: true }).map((move) => move.to);
    },
    onMove(move) {
      if (thinking || chess.turn() !== playAs) return false;
      try {
        const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        afterMove(played.san, played.from, played.to);
        return true;
      } catch {
        // chess.js throws on an illegal move. The board turns a false into a snap-back and a shake.
        return false;
      }
    },
  });

  const bar = document.createElement('div');
  bar.className = 'game__bar';

  const flip = button('Flip board', () => board.flip());
  const again = button('New game', () => restart());
  const swap = button('Play the other colour', () => restart(playAs === 'w' ? 'b' : 'w'));
  bar.append(flip, again, swap);

  el.append(board.el, status, bar);

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn';
    element.textContent = label;
    element.addEventListener('click', onClick);
    return element;
  }

  /** The king's square, so the board can mark it — only when there actually is a check. */
  function checkSquare(): Square | null {
    if (!chess.isCheck()) return null;
    const turn = chess.turn();
    for (const row of chess.board()) {
      for (const piece of row) {
        if (piece?.type === 'k' && piece.color === turn) return piece.square;
      }
    }
    return null;
  }

  function draw(): void {
    board.setPosition(chess.fen());
    board.setCheck(checkSquare());
    const history = chess.history({ verbose: true });
    const last = history[history.length - 1];
    board.setLastMove(last?.from ?? null, last?.to ?? null);
  }

  function say(message: string): void {
    status.textContent = message;
    board.announce(message);
  }

  function afterMove(san: string, from: Square, to: Square): void {
    draw();
    const outcome = outcomeOf(chess);
    if (outcome.over) {
      board.setPlaying(null);
      const who = outcome.result === '1/2-1/2' ? '' : outcome.result === '1-0' ? ' — White wins' : ' — Black wins';
      say(`${RESULT_TEXT[outcome.termination ?? ''] ?? 'Game over'}${who}`);
      return;
    }
    say(`${san}${chess.isCheck() ? ' — check' : ''}`);
    void (from && to);
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
    const played = chess.move(choice.san);
    board.setPlaying(playAs);
    afterMove(played.san, played.from, played.to);
  }

  function restart(colour: 'w' | 'b' = playAs): void {
    playAs = colour;
    chess.reset();
    board.setOrientation(playAs);
    board.setPlaying(playAs);
    draw();
    say(playAs === 'w' ? `Your move. You are White, against ${level.name}.` : `${level.name} is White. Their move.`);
    if (chess.turn() !== playAs) void botMove();
  }

  restart('w');
  return { el, restart, board };
}
