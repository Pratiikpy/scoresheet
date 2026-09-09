/**
 * Turning your own mistakes into puzzles — and refusing the ones that would be unfair.
 *
 * The idea is obvious and half a dozen small products already sell it: you blundered, so here is the
 * position again as a puzzle. What none of them publish is the hard half, which is **deciding which
 * mistakes are allowed to become puzzles**. Get that wrong and the feature actively teaches badly:
 * a position with two equally good answers marks the player wrong for finding one of them, and a
 * position whose only answer is a nine-ply engine line marks them wrong for being human.
 *
 * So this file is mostly a set of refusals. Four gates, each with a reason:
 *
 * 1. **The answer must be uniquely best**, by a real margin over the second-best move. This is the
 *    gate that matters most and the one every naive implementation skips. Lichess's own puzzle
 *    generator uses a win-probability margin for exactly this, and a puzzle whose second-best move is
 *    nearly as good is not a puzzle — it is a trick question.
 * 2. **The mistake must have cost something real.** Training on a move that lost three centipawns
 *    teaches nothing and fills the queue with noise.
 * 3. **The answer must be findable.** A position where the best move is quiet and the gain is
 *    positional is a fine thing to review and a terrible thing to be quizzed on, so the answer has to
 *    be forcing — a capture, a check, or a promotion — or produce a decisive material swing.
 * 4. **It must not already be in the queue.** The same position from a rematch is the same puzzle.
 *
 * **And the whole thing is re-verified before it is ever shown**, at a deeper budget than the one
 * that generated it. The research is blunt that engine-derived labels validated by the same engine
 * are circular; re-checking at greater depth is not a proof, but it does catch the case where a
 * shallow search invented a tactic that is not there — which is the failure that would put a wrong
 * answer in front of somebody who then loses trust in every other answer.
 */

import { Chess } from 'chess.js';
import { MATE_THRESHOLD } from './search.ts';

/**
 * One position a player got wrong, kept so they can meet it again.
 *
 * **Shaped so the existing puzzle screen can play it without adaptation.** A bundled Lichess puzzle
 * is `{ fen, moves }` where `fen` is the position *before* the opponent's blunder and `moves[0]` is
 * that blunder — the puzzle starts after it, which is what gives a puzzle its little run-up. Storing
 * only the position to solve would have meant a second code path through the whole solving screen,
 * and two code paths for one thing is how they drift apart.
 *
 * So the setup move travels with it, and `asPuzzle` hands back exactly the shape the screen already
 * eats.
 */
export interface OwnPuzzle {
  /** The position they faced, before their mistake. */
  fen: string;
  /** The position one move earlier, so the puzzle can open with the opponent's move. */
  setupFen: string;
  /** The opponent's move into `fen`, in UCI. */
  setupUci: string;
  /** The move that works, in UCI — the form the solving screen compares against. */
  answerUci: string;
  /** The move that works, in SAN. The single accepted answer, for showing to a person. */
  answer: string;
  /** What they actually played, so the puzzle can say "you played X here". */
  played: string;
  /** Centipawns the mistake cost, at the time it was judged. */
  cost: number;
  /** How far ahead of the second-best move the answer is, in centipawns. The fairness margin. */
  margin: number;
  /** Block height of the game it came from, so the queue can be ordered without a clock. */
  fromBlock: number;
  /** Which game, so a player can go back and look at it. */
  gameId: string;
}

/**
 * How far ahead of the runner-up the answer has to be.
 *
 * Two hundred centipawns is deliberately strict — a clear piece, near enough. A smaller margin
 * produces more puzzles and more of them are arguable, and an arguable puzzle that marks a good move
 * wrong does more damage than a missing puzzle does.
 */
export const MIN_UNIQUE_MARGIN = 200;

/**
 * The largest margin worth reporting.
 *
 * A mate score is a million-ish, so subtracting one from an ordinary evaluation produces a "winning
 * margin" of 1,000,129 centipawns — which is what the yield measurement printed before this existed,
 * and which is not a number anybody can read. Every margin above this is decisive anyway, so capping
 * loses nothing and stops the queue from sorting on an artefact of how mate is encoded.
 */
export const MARGIN_CAP = 2000;

function isMate(score: number): boolean {
  return Math.abs(score) >= MATE_THRESHOLD;
}

/**
 * How far the best move is ahead of the runner-up, in a form that survives mate scores.
 *
 * Three cases, and only the middle one is subtle:
 *
 * - **Neither is mate** — an ordinary difference, capped so it stays readable.
 * - **Both are mate for the mover** — the higher score is the *faster* mate. Two mates of the same
 *   length are both winning, so a puzzle demanding one of them would mark a winning move wrong; that
 *   is not unique and is refused. A faster mate is a real, findable distinction and is allowed.
 * - **Only the best is mate** — decisive by definition, reported at the cap.
 */
function marginOf(best: number, second: number): number {
  if (isMate(best) && isMate(second)) {
    // Both winning: the difference is a mate-distance, so scale it into something comparable rather
    // than pretending a two-move difference is worth two centipawns.
    const faster = best - second;
    return faster <= 0 ? 0 : Math.min(MARGIN_CAP, faster * 100);
  }
  if (isMate(best)) return MARGIN_CAP;
  // The best move being worse than mate for the opponent is still just arithmetic from here.
  return Math.min(MARGIN_CAP, Math.max(0, best - second));
}

/** Below this, the mistake was not big enough to be worth meeting again. */
export const MIN_MISTAKE_COST = 150;

export interface CandidateInput {
  fen: string;
  /** The position one move earlier, and the move that reached `fen`. Both in the same terms. */
  setupFen: string;
  setupUci: string;
  played: string;
  /** The engine's move and every root move it ranked, best first, in centipawns. */
  ranked: { san: string; score: number }[];
  cost: number;
  fromBlock: number;
  gameId: string;
}

export type RefusalReason =
  | 'too-small'
  | 'not-unique'
  | 'not-findable'
  | 'no-answer'
  | 'illegal';

export interface CandidateResult {
  puzzle: OwnPuzzle | null;
  /** Why not, when not. Kept so the behaviour can be measured rather than guessed at. */
  refused: RefusalReason | null;
}

/**
 * Is the answer forcing enough for a person to find?
 *
 * A puzzle whose solution is a quiet positional move is not a puzzle, it is an opinion. Captures,
 * checks and promotions are the moves a human scans first and the ones a tactic is actually made of.
 */
function isForcing(fen: string, san: string): boolean {
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    return Boolean(move.captured) || board.inCheck() || Boolean(move.promotion);
  } catch {
    return false;
  }
}

/**
 * Decide whether one mistake earns a place in the queue.
 *
 * Returns the reason for a refusal rather than just `null`, because the refusals are the interesting
 * part: a generator that quietly drops nine mistakes in ten looks identical to one that is broken,
 * and only counting the reasons tells them apart.
 */
export function considerMistake(input: CandidateInput): CandidateResult {
  if (input.cost < MIN_MISTAKE_COST) return { puzzle: null, refused: 'too-small' };

  const [best, second] = input.ranked;
  if (!best) return { puzzle: null, refused: 'no-answer' };

  // A position with one legal move is not a puzzle either, and it has no second-best to compare to.
  if (!second) return { puzzle: null, refused: 'not-unique' };

  const margin = marginOf(best.score, second.score);
  if (margin < MIN_UNIQUE_MARGIN) return { puzzle: null, refused: 'not-unique' };

  if (!isForcing(input.fen, best.san)) return { puzzle: null, refused: 'not-findable' };

  // The played move must be legal in this position, or the record is not what it claims to be.
  try {
    new Chess(input.fen).move(input.played);
  } catch {
    return { puzzle: null, refused: 'illegal' };
  }

  // The answer is stored in both forms: UCI is what the solving screen compares against, SAN is what
  // a person reads. Deriving one from the other later would need the position again, and a record
  // that cannot be read without replaying a game is not a record.
  let answerUci: string;
  try {
    const board = new Chess(input.fen);
    const move = board.move(best.san);
    answerUci = `${move.from}${move.to}${move.promotion ?? ''}`;
  } catch {
    return { puzzle: null, refused: 'no-answer' };
  }

  return {
    puzzle: {
      fen: input.fen,
      setupFen: input.setupFen,
      setupUci: input.setupUci,
      answerUci,
      answer: best.san,
      played: input.played,
      cost: Math.round(input.cost),
      margin: Math.round(margin),
      fromBlock: input.fromBlock,
      gameId: input.gameId,
    },
    refused: null,
  };
}

/**
 * Re-check a puzzle before it is shown, with whatever the caller considers a deeper look.
 *
 * The generating search and the checking search are the same engine, so this is not independent
 * verification and does not pretend to be — the research is explicit that engine-derived labels
 * checked by the same engine are circular. What it does catch is the shallow search that saw a
 * tactic which is not there, which is the difference between a hard puzzle and a wrong one.
 *
 * `deeperRanked` is supplied by the caller because only the caller knows what budget it can afford.
 */
export function stillSound(puzzle: OwnPuzzle, deeperRanked: { san: string; score: number }[]): boolean {
  const [best, second] = deeperRanked;
  if (!best || !second) return false;
  if (best.san !== puzzle.answer) return false;
  return marginOf(best.score, second.score) >= MIN_UNIQUE_MARGIN;
}

/**
 * The same puzzle in the shape the solving screen already understands.
 *
 * `rating` is the player's own mistake cost rather than a crowd-derived difficulty, and the theme
 * says where it came from — both are honest about being different in kind from a bundled puzzle's
 * numbers, which were measured across thousands of solvers.
 */
export function asPuzzle(own: OwnPuzzle): {
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
} {
  return {
    fen: own.setupFen,
    moves: [own.setupUci, own.answerUci],
    // Not a crowd difficulty and not presented as one: it is how much this cost *you*.
    rating: Math.min(2500, 800 + own.cost),
    themes: ['yourMistake'],
  };
}

/** Is this position already in the queue? The same position from a rematch is the same puzzle. */
export function alreadyQueued(queue: readonly OwnPuzzle[], fen: string): boolean {
  // Compared on the placement, side to move and castling rights only: the halfmove and fullmove
  // counters differ between two arrivals at the same position and have nothing to do with the
  // tactic, so including them would let the same puzzle in twice.
  const key = (value: string): string => value.split(' ').slice(0, 4).join(' ');
  const wanted = key(fen);
  return queue.some((puzzle) => key(puzzle.fen) === wanted);
}

/**
 * The order to meet them in: dearest mistakes first, then oldest.
 *
 * Cost first because the point is to stop losing games the same way, and the most expensive habit is
 * the one worth breaking. Oldest as the tiebreak so the queue drains rather than churning.
 */
export function queueOrder(queue: readonly OwnPuzzle[]): OwnPuzzle[] {
  return [...queue].sort((a, b) => b.cost - a.cost || a.fromBlock - b.fromBlock);
}
