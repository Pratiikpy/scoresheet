/**
 * The analysis, off the main thread.
 *
 * Reviewing a forty-ply game is about twelve seconds of solid arithmetic. On the main thread that is
 * twelve seconds in which the board does not repaint, the scroll does not move and the tab is
 * reported as unresponsive — and a phone browser may simply kill it. In a worker it is twelve
 * seconds during which the player watches a progress bar and can walk through the game while it
 * fills.
 *
 * The protocol is deliberately one-shot: a game goes in, progress comes out, a report comes out.
 * There is no cancel message, because terminating the worker is both simpler and more certain than
 * asking a busy thread to please stop.
 */

import { Chess } from 'chess.js';
import {
  ANALYSIS_LEVEL,
  Position,
  analyseGame,
  createTable,
  findBestMove,
  moveFrom,
  movePromotion,
  moveTo,
  type AnalysedMove,
  type GameAnalysis,
} from '@scoresheet/core';

/*
 * ## The evaluation network is deliberately not used here
 *
 * `packages/core/src/nnue.ts` is a complete, exact port of akimbo v1.0.0's network — verified
 * against the real engine on 25 positions, cached correctly across a thousand more, and made five
 * times faster than the naive version. It could be plugged in on the line below and it is not,
 * because it was measured and it makes this feature **worse**.
 *
 * The measurement, in full, is in `README.md`. The short version is that the network costs 15× per
 * evaluation, so at a fixed time budget it searches 15× fewer positions — and grading a game is
 * exactly the task where that hurts. Reviewing Byrne–Fischer 1956 at 300 ms a position, it called
 * **17...Rfe8+ a blunder**: one of the most celebrated moves ever played. The hand-written
 * evaluation, at the same budget, flagged only the two moves that are genuinely criticised.
 *
 * Raising the budget to 2500 ms does fix it — and takes a hundred seconds a game instead of twelve.
 *
 * So the seam stays (`AnalyseOptions.evaluate`), the port stays, and the network does not ship. A
 * 6.3 MB download that makes the review worse is not a feature, and shipping it because it sounds
 * impressive is the kind of decision this repository exists to argue against.
 */

export interface AnalysisRequest {
  moves: string[];
  /** Milliseconds per position. The caller decides how long it is willing to wait. */
  budgetMs?: number;
  /**
   * Judge only the last move, rather than the whole game.
   *
   * Try Again needs one number about one move a player has just invented, and analysing the whole
   * game again to get it would take twelve seconds to answer a question about one position. The
   * engine call is identical; only the amount of work around it changes.
   */
  lastOnly?: boolean;
  /**
   * Rank every legal move in the final position, instead of judging anything.
   *
   * Own-blunder puzzles live or die on the second-best move: a position whose runner-up is nearly as
   * good is a trick question, not a puzzle, and the only way to know is to ask the engine for the
   * whole ranked root. `analyseGame` deliberately does not carry that — it reports one move's
   * judgement — so this is a separate question rather than a wider answer to the old one.
   */
  rank?: boolean;
}

export type AnalysisMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; analysis: GameAnalysis }
  | { type: 'judged'; move: AnalysedMove }
  | { type: 'ranked'; moves: { san: string; score: number }[] }
  | { type: 'failed'; message: string };

self.addEventListener('message', (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  try {
    if (request.rank) {
      /*
       * Replay to the position, then ask the engine for every root move it considered.
       *
       * The same `findBestMove` the analysis uses, at the same level, so the ranking a puzzle is
       * gated on and the judgement the review showed cannot come from different opinions.
       */
      const board = new Chess();
      for (const san of request.moves) board.move(san);

      const result = findBestMove(Position.fromFen(board.fen()), {
        depth: ANALYSIS_LEVEL.depth,
        budgetMs: request.budgetMs ?? 300,
        table: createTable(),
      });

      const files = 'abcdefgh';
      const promotions = ['', '', 'n', 'b', 'r', 'q', ''];
      const nameOf = (index: number): string => `${files[index & 7]}${(index >> 4) + 1}`;

      const moves: { san: string; score: number }[] = [];
      for (const entry of result.ranked) {
        const from = nameOf(moveFrom(entry.move));
        const to = nameOf(moveTo(entry.move));
        const promotion = movePromotion(entry.move) ? promotions[movePromotion(entry.move)] : undefined;
        const probe = new Chess(board.fen());
        try {
          const played = probe.move({ from, to, ...(promotion ? { promotion } : {}) } as never);
          moves.push({ san: played.san, score: entry.score });
        } catch {
          // A root move that will not replay would be our bug. Dropping it can only ever remove a
          // puzzle, never invent one, so it is the safe direction to fail in.
        }
      }

      self.postMessage({ type: 'ranked', moves } satisfies AnalysisMessage);
      return;
    }

    if (request.lastOnly) {
      /*
       * One move, judged on its own terms.
       *
       * The prefix still has to be replayed to reach the position — chess has no way around that —
       * but only the final move is evaluated, so the cost is one engine call rather than one per
       * move of the game. The same `analyseGame` produces it, so a move judged here and the same
       * move judged in a full report cannot disagree.
       */
      const judged = analyseGame(request.moves, {
        ...(request.budgetMs === undefined ? {} : { budgetMs: request.budgetMs }),
        from: request.moves.length - 1,
      });
      const move = judged.moves[judged.moves.length - 1];
      if (!move) throw new Error('There was no move to judge.');
      self.postMessage({ type: 'judged', move } satisfies AnalysisMessage);
      return;
    }

    const analysis = analyseGame(request.moves, {
      ...(request.budgetMs === undefined ? {} : { budgetMs: request.budgetMs }),
      onProgress(done, total) {
        const message: AnalysisMessage = { type: 'progress', done, total };
        self.postMessage(message);
      },
    });
    const message: AnalysisMessage = { type: 'done', analysis };
    self.postMessage(message);
  } catch (error) {
    /*
     * A failure here is our bug, and it is said as one.
     *
     * The alternative — a worker that dies silently — leaves a progress bar at 40% forever, which
     * the player reads as their phone being broken rather than as our code being wrong.
     */
    const message: AnalysisMessage = {
      type: 'failed',
      message: error instanceof Error ? error.message : 'The analysis stopped unexpectedly.',
    };
    self.postMessage(message);
  }
});
