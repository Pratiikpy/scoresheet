/**
 * A witnessed run, as a small state machine the puzzle screen drives.
 *
 * The screen already knows how to show a puzzle and judge a move; what it does not know is that a
 * run can be *witnessed*, which changes exactly two things: where the next puzzle comes from, and
 * what happens when the last one is done. Putting that here rather than inline keeps it testable
 * without a DOM — and a rating that decides whether the product's central claim reaches a person
 * playing alone should not be the one part of the app with no tests.
 *
 * ## The rule that shapes everything else
 *
 * **When a run is open, the puzzles come from the witness and nowhere else.** The screen may not
 * choose, skip, reorder or substitute one. That is not a style preference: a client that picks its
 * own puzzles can pick the easiest in the set every time, and the rating stops meaning anything.
 * `packages/server/src/witness.ts` refuses results that are not the puzzles it served, in the order
 * it served them, so a screen that wandered off would simply fail at the end — this makes it fail
 * at the point of the mistake instead.
 *
 * ## What happens when there is no witness
 *
 * Nothing. `open()` returns false, the screen keeps choosing puzzles the way it always has, and the
 * run is unrated. No server, no wallet, offline, a witness key that was never configured — all four
 * land in the same place, which is the honest one: the puzzles still work.
 */

import type { Puzzle, PuzzleMode } from '@scoresheet/core';

import {
  finishRun,
  ratingBeforeFor,
  signRun,
  startRun,
  witnessStatus,
  type SignRunOutcome,
} from './puzzle-cards.ts';

export interface WitnessedRunOptions {
  /** The solver's wallet. A run cannot be witnessed for somebody who has not connected one. */
  address: string | null;
  mode: PuzzleMode;
  /** How many puzzles this run covers. One signature at the end pays for all of them. */
  count: number;
  theme?: string | undefined;
  day?: string | undefined;
  /** Every puzzle, by id, so a served id becomes a position to show. */
  byId: ReadonlyMap<string, Puzzle>;
  /** Puzzles already seen, so a run does not serve one twice. */
  seen?: readonly string[] | undefined;
  now?: (() => number) | undefined;
}

export interface WitnessedRun {
  /** True once the witness has served a run and the screen should take its puzzles from here. */
  readonly open: boolean;
  /** How many of the served puzzles are still to come. */
  readonly remaining: number;
  /** How many have been answered so far, and how many of those were solved. */
  readonly answered: number;
  readonly solved: number;
  /** The rating this run started from, for a screen that wants to show the change. */
  readonly ratingBefore: number;

  /** Ask the witness for a run. False when runs cannot be rated here, for any reason. */
  begin(): Promise<boolean>;
  /** The next served puzzle, and the clock starts. Null when the run is finished. */
  next(): Puzzle | null;
  /** Record the current puzzle's outcome. Ignored when no puzzle is outstanding. */
  record(solved: boolean): void;
  /**
   * Hand the results back, get the witness's signature, and ask the wallet for the solver's.
   *
   * Null when there is nothing to sign. Otherwise the outcome, including a declined signature —
   * which is a choice rather than a failure, and the screen says so.
   */
  settle(): Promise<SignRunOutcome | null>;
}

export function createWitnessedRun(options: WitnessedRunOptions): WitnessedRun {
  const now = options.now ?? (() => Date.now());

  let sessionId: string | null = null;
  let served: { id: string; rating: number }[] = [];
  let at = 0;
  let startedAt = 0;
  let ratingBefore = 0;
  const results: { id: string; solved: boolean; ms: number }[] = [];

  return {
    get open() {
      return sessionId !== null;
    },
    get remaining() {
      return sessionId === null ? 0 : served.length - results.length;
    },
    get answered() {
      return results.length;
    },
    get solved() {
      return results.filter((result) => result.solved).length;
    },
    get ratingBefore() {
      return ratingBefore;
    },

    async begin() {
      if (!options.address) return false;

      const status = await witnessStatus();
      if (!status.available) return false;

      ratingBefore = ratingBeforeFor(options.address);
      try {
        const issued = await startRun({
          address: options.address,
          mode: options.mode,
          count: options.count,
          ratingBefore,
          theme: options.theme,
          seen: options.seen,
          day: options.day,
        });

        /*
         * A served puzzle this client cannot show is a run that cannot be completed, so the whole
         * run is abandoned rather than started and failed halfway. It means the server's set and
         * this bundle disagree — which should be impossible, since `puzzle-set.ts` is the one copy
         * both import, and is exactly the kind of impossible worth checking.
         */
        if (issued.puzzles.some((puzzle) => !options.byId.has(puzzle.id))) return false;

        sessionId = issued.sessionId;
        served = issued.puzzles;
        at = 0;
        return true;
      } catch {
        // A refusal here is not worth a message: nothing has happened yet, and the run is unrated.
        return false;
      }
    },

    next() {
      if (sessionId === null || at >= served.length) return null;
      const puzzle = options.byId.get(served[at]!.id) ?? null;
      startedAt = now();
      return puzzle;
    },

    record(solved) {
      if (sessionId === null || at >= served.length) return;
      results.push({ id: served[at]!.id, solved, ms: Math.max(0, now() - startedAt) });
      at += 1;
    },

    async settle() {
      if (sessionId === null || results.length === 0) return null;
      /*
       * A run is settled once. The session is cleared *before* the network call rather than after,
       * so a screen that settles twice — a finish that races a "leave" — cannot spend the same run
       * twice and land on the server's `no-session` refusal, which would read to the person as a
       * failure of something that had already succeeded.
       */
      const id = sessionId;
      const answers = [...results];
      sessionId = null;

      try {
        const run = await finishRun(id, answers);
        return await signRun(run);
      } catch (error) {
        return {
          ok: false,
          tone: 'calm',
          message: error instanceof Error ? error.message : 'That run could not be witnessed.',
        };
      }
    },
  };
}
