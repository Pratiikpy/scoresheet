/**
 * Puzzles: loading them, choosing them, and judging a solution.
 *
 * This is the retention loop (`SPEC.md` H1, P4) — the answer to the Tuesday problem, which is that
 * nobody wants a whole game every day but almost everybody wants one puzzle. A game is twenty
 * minutes and a decision to make; a puzzle is forty seconds and a reason to open the app.
 *
 * Three things here are load-bearing:
 *
 *  1. **The data is loaded on demand and never in the main bundle.** 442 KB of puzzles has no
 *     business delaying the board, which is what somebody opening this app came for. The dynamic
 *     `import()` is what makes Vite emit it as its own chunk; a static import would inline it.
 *  2. **A solution is judged by the board, not by string equality.** Lichess stores one line, but a
 *     position can have a second move that mates just as fast, and telling a player they are wrong
 *     when they are right is the one mistake a puzzle trainer cannot survive. Alternative mates are
 *     accepted, and so is any move in a position with a single legal reply.
 *  3. **Nothing here touches the DOM.** The screens are separate, so this is testable — and a puzzle
 *     judge that cannot be tested against real positions is a puzzle judge nobody should trust.
 */

import { Chess } from 'chess.js';
import type { Puzzle } from '@scoresheet/core';
import type { Key } from './i18n.ts';

/*
 * The set itself, the daily, the rating-window search, the identities and the rating maths all come
 * from `@scoresheet/core` — see `puzzle-set.ts` for why. They are re-exported here so the screens
 * keep importing puzzles from one place, but there is exactly one implementation and the server
 * imports the same one. A second copy of "which puzzle is today's" would be a second answer.
 */
export {
  PUZZLE_FLOOR,
  PUZZLE_K,
  PUZZLE_START,
  dailyPuzzle,
  dayKey,
  hashString,
  loadPuzzles,
  nextPuzzleRating,
  parsePuzzles,
  puzzleId,
  puzzleNear,
  shortPuzzleId,
  type Puzzle,
} from '@scoresheet/core';

/**
 * The themes worth offering, in the order a player would look for them.
 *
 * Not every theme in the data: several are bookkeeping (`middlegame`, `opening`) or restate the
 * rating, and a list of forty is not a choice, it is a search problem. These are the ones somebody
 * would actually set out to practise.
 */
export const TRAINABLE_THEMES: readonly { theme: string; key: Key }[] = [
  { theme: 'mateIn1', key: 'theme.mateIn1' },
  { theme: 'mateIn2', key: 'theme.mateIn2' },
  { theme: 'backRankMate', key: 'theme.backRankMate' },
  { theme: 'fork', key: 'theme.fork' },
  { theme: 'pin', key: 'theme.pin' },
  { theme: 'skewer', key: 'theme.skewer' },
  { theme: 'discoveredAttack', key: 'theme.discoveredAttack' },
  { theme: 'deflection', key: 'theme.deflection' },
  { theme: 'sacrifice', key: 'theme.sacrifice' },
  { theme: 'hangingPiece', key: 'theme.hangingPiece' },
  { theme: 'endgame', key: 'theme.endgame' },
  { theme: 'promotion', key: 'theme.promotion' },
];

export type MoveVerdict = 'correct' | 'wrong' | 'solved';

export interface PuzzleRun {
  /** The board as it stands, for rendering. */
  readonly chess: Chess;
  /** Whose pieces the solver is moving. */
  readonly side: 'w' | 'b';
  /** The opponent's blunder, to be animated in before the solver is asked anything. */
  readonly opening: { from: string; to: string; promotion?: string | undefined };
  /** How many of the solver's moves are still to come. */
  readonly remaining: number;
  /** True once the whole line is done. */
  readonly solved: boolean;
  /**
   * Try a move. `correct` means play on, `solved` means the puzzle is finished, `wrong` means the
   * board should snap back and say so — nothing is played in that case.
   */
  attempt: (from: string, to: string, promotion?: string) => MoveVerdict;
  /** The move the solver was supposed to find, in SAN, for showing the answer after a failure. */
  expectedSan: () => string | null;
  /** Play the expected move, for the "show me" path. */
  playExpected: () => void;
}

/** UCI `e7e8q` → its parts. Lichess writes promotions this way and nothing else is five characters. */
function parseUci(uci: string): { from: string; to: string; promotion?: string | undefined } {
  return uci.length >= 5
    ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
    : { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

/**
 * Start solving a puzzle.
 *
 * The opponent's blunder is applied immediately, so `chess` is the position the solver actually
 * faces, and `opening` is handed back for the screen to animate. Doing it here rather than in the UI
 * means the position and the animation can never disagree about what just happened.
 */
export function startPuzzle(puzzle: Puzzle): PuzzleRun {
  const chess = new Chess(puzzle.fen);
  const first = parseUci(puzzle.moves[0]!);
  chess.move({ from: first.from, to: first.to, promotion: first.promotion ?? 'q' });

  const side = chess.turn();
  let index = 1;

  /**
   * Is this move an acceptable answer?
   *
   * Not string equality, and this is the difference between a puzzle trainer people trust and one
   * they argue with. Three cases count as correct:
   *
   *  1. **It is the stored move.** The common case.
   *  2. **It mates, and the stored move mates too.** Many positions have a second mate in one, and
   *     Lichess stores one line. Rejecting the other is telling a player they are wrong when they
   *     have just found a forced mate, which is the fastest way to lose them.
   *  3. **It is the only legal move.** Then there is nothing to get wrong.
   */
  function accepts(from: string, to: string, promotion: string | undefined, expected: string): boolean {
    const wanted = parseUci(expected);
    if (from === wanted.from && to === wanted.to && (promotion ?? 'q') === (wanted.promotion ?? 'q')) {
      return true;
    }

    const probe = new Chess(chess.fen());
    let played;
    try {
      played = probe.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    if (!played) return false;
    if (probe.moves().length === 0 && probe.isCheckmate()) {
      const reference = new Chess(chess.fen());
      try {
        reference.move({ from: wanted.from, to: wanted.to, promotion: wanted.promotion ?? 'q' });
      } catch {
        return false;
      }
      // Both mate. Two ways to end the game in one move are two right answers.
      return reference.isCheckmate();
    }
    return chess.moves().length === 1;
  }

  const run: PuzzleRun = {
    chess,
    side,
    opening: first,
    get remaining() {
      return Math.ceil((puzzle.moves.length - index) / 2);
    },
    get solved() {
      return index >= puzzle.moves.length;
    },
    attempt(from, to, promotion) {
      const expected = puzzle.moves[index];
      if (expected === undefined) return 'solved';
      if (!accepts(from, to, promotion, expected)) return 'wrong';

      /*
       * The *stored* move is played, not the one the solver made.
       *
       * When an alternative mate is accepted the two differ, and playing the solver's move would
       * leave the board in a position the rest of the stored line does not follow from. A mate ends
       * the line anyway, so the difference is invisible — and the invariant is worth keeping exact
       * rather than nearly right.
       */
      const mine = parseUci(expected);
      chess.move({ from: mine.from, to: mine.to, promotion: mine.promotion ?? 'q' });
      index += 1;

      const reply = puzzle.moves[index];
      if (reply === undefined) return 'solved';

      // The opponent's answer is forced and part of the puzzle, so it is played straight away.
      const theirs = parseUci(reply);
      chess.move({ from: theirs.from, to: theirs.to, promotion: theirs.promotion ?? 'q' });
      index += 1;

      return index >= puzzle.moves.length ? 'solved' : 'correct';
    },
    expectedSan() {
      const expected = puzzle.moves[index];
      if (expected === undefined) return null;
      const probe = new Chess(chess.fen());
      const move = parseUci(expected);
      try {
        return probe.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' }).san;
      } catch {
        return null;
      }
    },
    playExpected() {
      const expected = puzzle.moves[index];
      if (expected === undefined) return;
      const move = parseUci(expected);
      chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
      index += 1;
      const reply = puzzle.moves[index];
      if (reply === undefined) return;
      const theirs = parseUci(reply);
      chess.move({ from: theirs.from, to: theirs.to, promotion: theirs.promotion ?? 'q' });
      index += 1;
    },
  };

  return run;
}

/* ------------------------------------------------------------------ the player's puzzle rating */

