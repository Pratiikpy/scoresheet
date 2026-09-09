/**
 * What went wrong, move by move.
 *
 * This is the single feature people name when asked why they use Lichess or Chess.com rather than
 * playing over a board: the game ends and the site tells them where they lost it. Without it a chess
 * app is a place to play; with it, it is a place to get better, and the second one is why anybody
 * opens it tomorrow.
 *
 * ## Built on published technique, not on anybody's source
 *
 * The evaluation is our own engine (`engine.ts`, written from the Chess Programming Wiki so the
 * bundle can stay MIT). The two formulas that turn centipawns into something a person understands
 * are **Lichess's published accuracy method** — the page at `lichess.org/page/accuracy`, which
 * exists specifically to document it — not their code, which is AGPL and off limits under
 * `SPEC.md` Part L:
 *
 *   Win%      = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
 *   Accuracy% = 103.1668 * exp(-0.04354 * (winBefore - winAfter)) - 3.1669
 *
 * and the game figure is *"the average of the volatility weighted mean and the harmonic mean"* of
 * the move accuracies. All three are implemented below, from that description.
 *
 * ## Why win percentage rather than centipawns
 *
 * Because a centipawn is not a unit of anything a player feels. Losing 100 centipawns from a level
 * position is a disaster; losing 100 from nine pawns up is nothing at all, and a tool that calls
 * both "a mistake" teaches the wrong lesson. Win percentage is flat at the extremes and steep in the
 * middle, which is exactly how much a move actually mattered.
 */

import { Chess } from 'chess.js';

import type { Position } from './position.ts';
import { chooseMove, type Level } from './engine.ts';
import { createTable, type SearchTable } from './search.ts';
import { bookMoves } from './openings.ts';

/** How a move is described to the player. */
export type Judgement = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * Centipawns to a winning chance, 0–100.
 *
 * Lichess's published curve. The constant is what makes +100 centipawns read as about 59% rather
 * than as a number nobody can interpret.
 */
export function winPercent(centipawns: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
}

/**
 * How good one move was, 0–100, from what it cost in winning chances.
 *
 * Lichess's published formula. A move that lost nothing scores 99.9999 rather than a round 100 —
 * that is the curve, not a rounding error, and it is left alone: a perfect game still displays as
 * 100.0 once the game figure is rounded to a tenth. The floor at zero is real, though; a
 * catastrophic move drives the curve negative, and nobody should be shown a negative accuracy.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const lost = Math.max(0, winBefore - winAfter);
  return Math.max(0, 103.1668 * Math.exp(-0.04354 * lost) - 3.1669);
}

/*
 * The thresholds, derived rather than picked.
 *
 * Chess has used half a pawn, a pawn and two pawns as inaccuracy / mistake / blunder for decades,
 * and those are the numbers everybody who has ever read an engine report already has in their head.
 * Pushing each of them through the same win% curve keeps that shared meaning while making the
 * judgement depend on the position — which is the entire reason for working in win% at all.
 *
 * From an equal position they come out at about 4.6, 9.1 and 17.6 points of winning chance.
 */
const EVEN = winPercent(0);
export const INACCURACY_AT = EVEN - winPercent(-50);
export const MISTAKE_AT = EVEN - winPercent(-100);
export const BLUNDER_AT = EVEN - winPercent(-200);

/** What to call a move that cost this much winning chance, given whether it was the engine's own. */
export function judge(lost: number, wasBest: boolean): Judgement {
  if (wasBest) return 'best';
  if (lost >= BLUNDER_AT) return 'blunder';
  if (lost >= MISTAKE_AT) return 'mistake';
  if (lost >= INACCURACY_AT) return 'inaccuracy';
  return 'good';
}

export interface AnalysedMove {
  /** Zero-based ply. Ply 0 is White's first move. */
  ply: number;
  side: 'w' | 'b';
  san: string;
  /** Centipawns from the mover's point of view, before and after their move. */
  before: number;
  after: number;
  /** The same two, as winning chances for the mover. */
  winBefore: number;
  winAfter: number;
  /** How much winning chance the move cost its own player. Never negative. */
  lost: number;
  /** 0–100 for this one move. */
  accuracy: number;
  judgement: Judgement;
  /** What the engine would have played, when that was something else. */
  best: string | null;
}

export interface GameAnalysis {
  moves: AnalysedMove[];
  /** 0–100 per side, by the published aggregation. */
  accuracy: { w: number; b: number };
  /**
   * Average centipawn loss, per side — the number strong players actually quote.
   *
   * Lichess reports it beside accuracy (`averageCentipawnLoss` in their own translation source), and
   * it says a different thing: accuracy is win-percentage weighted, so a blunder in a already-lost
   * position barely moves it, while ACPL is flat and counts every centipawn the same. Somebody who
   * wants to know "how cleanly did I play" reads accuracy; somebody comparing two of their own games
   * reads ACPL. Showing one without the other loses half the answer.
   */
  acpl: { w: number; b: number };
  /** How many of each kind, per side — the summary line every report opens with. */
  counts: { w: Record<Judgement, number>; b: Record<Judgement, number> };
}

export interface AnalyseOptions {
  /** How hard to look at each position. Deeper is better and slower; the caller decides. */
  level?: Level;
  /** Milliseconds per position — and there is one position per ply, plus the starting one. */
  budgetMs?: number;
  /** Called after each ply, so a screen can show progress instead of freezing. */
  onProgress?: (done: number, total: number) => void;
  /** Return `true` to stop early — somebody navigating away should not be waited for. */
  cancelled?: () => boolean;
  /**
   * Let opening theory overrule the engine's small complaints. On by default.
   *
   * Off only for measurement. With it on, a review of a named opening line criticises nothing — which
   * is correct behaviour and a useless measurement, because the exemption is what produced the zero
   * rather than the evaluation. `scripts/review-quality.mjs` turns it off to ask the question the
   * exemption is hiding: **what would the raw engine say about moves humans have played for two
   * centuries?** The gap between the two numbers is exactly how much work this rule is doing.
   */
  theory?: boolean;
  /**
   * Judge only from this ply onwards, replaying everything before it without searching.
   *
   * For "try again": a player invents a move and wants to know whether it was better, and analysing
   * the whole game to answer that would take twelve seconds to say something about one position.
   * The moves before still have to be replayed — chess offers no way to reach a position without
   * passing through the ones before it — but they are not evaluated.
   *
   * **The arithmetic is identical either way.** The same `bestOf` produces the same numbers from the
   * same position, so a move judged alone and the same move judged inside a full report cannot
   * disagree. That is the property worth protecting: two different answers about one move is how a
   * review starts contradicting itself.
   */
  from?: number;
  /**
   * An evaluation to use instead of the hand-written one — `nnue.ts`, when its network is available.
   *
   * Optional on purpose, and the fallback is not a degraded mode: the review works exactly as it
   * always has without it. The network is a 6.3 MB download, so a person on a slow connection, or
   * offline, or on a build where it was never fetched, gets the review rather than an error.
   */
  evaluate?: ((position: Position) => number) | undefined;
}

/**
 * The level used when the caller does not choose.
 *
 * No blunder rate at all — an analyser that occasionally declined its own best move would report the
 * player's good move as a mistake, which is worse than having no analysis — and no book, because a
 * book move is a choice from theory rather than an evaluation.
 *
 * The depth is set far beyond what will be reached so that **time**, not depth, is what stops the
 * search. That is the property worth having on a phone: the analysis takes the same number of
 * seconds on every device and simply sees less on a slower one, rather than taking four times as
 * long and looking broken.
 */
export const ANALYSIS_LEVEL: Level = {
  name: 'analysis',
  depth: 30,
  blunderRate: 0,
  blunderDepth: 1,
  bookPlies: 0,
};

/** Search one position and report the best move and its score, from the side to move's view. */
function bestOf(
  chess: Chess,
  level: Level,
  budgetMs: number,
  table: SearchTable,
  evaluate?: ((position: Position) => number) | undefined,
): { san: string | null; score: number } {
  // No legal moves: the position is already over, and its value is decided rather than searched.
  if (chess.moves().length === 0) {
    return { san: null, score: chess.isCheckmate() ? -100_000 : 0 };
  }
  // The book is off. A book move is a *choice from theory*, not the engine's evaluation, and using
  // one as the yardstick would score every opening move against an opinion rather than a search.
  const choice = chooseMove(chess, level, { budgetMs, useBook: false, random: () => 0, table, evaluate });
  return choice ? { san: choice.san, score: choice.score } : { san: null, score: 0 };
}

/**
 * Analyse a game from its moves in SAN.
 *
 * Two searches per ply: the position before the move, which gives both the best move available and
 * what the position was worth, and the position after it, which gives what it is worth now. The
 * difference is what the move cost.
 *
 * **A move that matches the engine's own is worth exactly zero, by construction.** Without that
 * rule, two searches from different roots at the same depth can disagree by a few centipawns and the
 * report tells somebody their best move was an inaccuracy — the one mistake that would make the
 * whole feature untrustworthy.
 */
/** Nothing to report — used when the moves handed in are not a game that can be replayed. */
function empty(): GameAnalysis {
  const none = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 } as Record<Judgement, number>;
  return {
    moves: [],
    accuracy: { w: 0, b: 0 },
    acpl: { w: 0, b: 0 },
    counts: { w: { ...none }, b: { ...none } },
  };
}

export function analyseGame(moves: readonly string[], options: AnalyseOptions = {}): GameAnalysis {
  const level = options.level ?? ANALYSIS_LEVEL;
  /*
   * Three hundred milliseconds a position, measured rather than guessed.
   *
   * On Byrne–Fischer 1956 — a deliberately unfair test, since `SPEC.md` K8 says this engine reviews
   * amateur games rather than correcting grandmasters — the figures come out at:
   *
   *     budget    time (34 plies)    Fischer    verdict on 17...Be6
   *     150 ms          0.6 s          83 %     inaccuracy
   *     300 ms         10.7 s        90.8 %     not flagged
   *     800 ms         28.2 s        93.2 %     not flagged
   *
   * Three hundred is where the report stops disagreeing with the players and starts agreeing with
   * the history books, at a wait comparable to the game reviews people already sit through.
   */
  const budgetMs = options.budgetMs ?? 300;
  const chess = new Chess();
  const analysed: AnalysedMove[] = [];

  /*
   * One table for the whole game.
   *
   * Consecutive positions are one move apart, so nearly every subtree searched at position *n* is
   * searched again at position *n+1*. Carrying the table across is the largest saving available
   * without writing a faster move generator, and it costs one object.
   */
  const table: SearchTable = createTable();

  /*
   * **One search per position, not two per move.**
   *
   * The position after White's move *is* the position before Black's, so searching each position
   * once and reading each move's before and after from adjacent entries halves the work — and, more
   * importantly, makes them agree. Two searches of the same position from different roots can
   * return slightly different numbers, and a report where "after move 12" and "before move 13"
   * disagree is a report with a visible seam in it.
   */
  const history: string[] = [];

  /*
   * Fast-forward to where the judging starts, if the caller asked for one move rather than a game.
   *
   * Replayed without searching: reaching the position is cheap, and looking at it is what costs.
   */
  const from = Math.max(0, Math.min(options.from ?? 0, moves.length));
  for (let ply = 0; ply < from; ply++) {
    const san = moves[ply]!;
    try {
      chess.move(san);
    } catch {
      // The prefix is not a real game, so there is nothing beyond it to judge.
      return empty();
    }
    history.push(san);
  }

  let previous = bestOf(chess, level, budgetMs, table, options.evaluate);

  for (let ply = from; ply < moves.length; ply++) {
    if (options.cancelled?.()) break;

    const san = moves[ply]!;
    const side = chess.turn();

    let played;
    try {
      played = chess.move(san);
    } catch {
      // An illegal move means the game is not what it claimed to be. Everything up to here is real
      // and is kept; going on would be analysing a position that never existed.
      break;
    }

    const next = bestOf(chess, level, budgetMs, table, options.evaluate);
    /*
     * The score of the new position is the *opponent's*, so it is negated.
     *
     * Getting this wrong is the classic analysis bug and it is invisible: every judgement inverts,
     * blunders read as brilliancies, and the numbers still look plausible all the way through.
     */
    const after = -next.score;

    const winBefore = winPercent(previous.score);
    const rawLost = Math.max(0, winBefore - winPercent(after));

    /*
     * Theory overrules the engine's small complaints, and only the small ones.
     *
     * Our engine is deliberately tiny (`engine.ts`), and a tiny engine asked about the Ruy Lopez
     * calls `Bb5` an inaccuracy — measured: a book Ruy Lopez scored **67%** before this rule, which
     * would have told a player that four of the most-played moves in chess were errors.
     *
     * But the book is not a book of *good* moves. It contains every opening anybody bothered to
     * name, Fool's Mate among them — `1. f3 e5 2. g4 Qh4#` is a named line, and an unconditional
     * exemption scored that game 100% for the player who got mated in two. So the exemption stops at
     * the blunder threshold: theory is trusted to overrule "that was slightly imprecise", never to
     * excuse losing the game.
     */
    const booked = (options.theory ?? true) && bookMoves(history).some((option) => option.san === played.san);
    const theory = booked && rawLost < BLUNDER_AT;

    /*
     * A move the engine itself would play is worth exactly zero, by construction.
     *
     * Even with one search per position the two numbers come from different searches, and a few
     * centipawns of drift would let the report tell somebody their best move was an inaccuracy —
     * the one result that would make the whole feature untrustworthy.
     */
    const wasBest = theory || (previous.san !== null && played.san === previous.san);
    const winAfter = wasBest ? winBefore : winPercent(after);
    const lost = Math.max(0, winBefore - winAfter);

    analysed.push({
      ply,
      side,
      san: played.san,
      before: previous.score,
      after: wasBest ? previous.score : after,
      winBefore,
      winAfter,
      lost,
      accuracy: moveAccuracy(winBefore, winAfter),
      judgement: judge(lost, wasBest),
      best: wasBest ? null : previous.san,
    });

    history.push(played.san);
    previous = next;
    options.onProgress?.(ply + 1 - from, moves.length - from);
  }

  return {
    moves: analysed,
    accuracy: {
      w: gameAccuracy(analysed.filter((move) => move.side === 'w')),
      b: gameAccuracy(analysed.filter((move) => move.side === 'b')),
    },
    acpl: { w: acplOf(analysed, 'w'), b: acplOf(analysed, 'b') },
    counts: { w: countsOf(analysed, 'w'), b: countsOf(analysed, 'b') },
  };
}

/**
 * Average centipawn loss for one side.
 *
 * Two rules, and both stop one move from swallowing the number:
 *
 *  - **Each move's loss is capped.** A missed mate is worth a million centipawns, and one of those
 *    in a forty-move game would report an ACPL of twenty-five thousand. A thousand — a queen — is
 *    the conventional cap and is as much as any single move can meaningfully cost.
 *  - **A move the engine itself would play, or a book move, costs nothing.** The same rule the
 *    judgement uses, for the same reason: our own search disagreeing with itself by a few centipawns
 *    must not show up as a player's error.
 */
export function acplOf(moves: readonly AnalysedMove[], side: 'w' | 'b'): number {
  const mine = moves.filter((move) => move.side === side);
  if (mine.length === 0) return 0;
  const total = mine.reduce((sum, move) => {
    if (move.best === null) return sum;
    return sum + Math.min(1000, Math.max(0, move.before - move.after));
  }, 0);
  return Math.round(total / mine.length);
}

function countsOf(moves: readonly AnalysedMove[], side: 'w' | 'b'): Record<Judgement, number> {
  const counts: Record<Judgement, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const move of moves) if (move.side === side) counts[move.judgement] += 1;
  return counts;
}

/**
 * One number for a whole side, by the published method.
 *
 * *"The average of the volatility weighted mean and the harmonic mean"* of the move accuracies, and
 * both halves earn their place:
 *
 *  - The **harmonic mean** refuses to let a run of forced recaptures paper over a lost queen. One
 *    move at 20% drags the figure down far more than an arithmetic mean would allow, which is what
 *    a player means when they say a game was thrown away by a single move.
 *  - The **volatility weighting** stops the opposite failure. Twenty quiet moves in a drawn endgame
 *    are trivially accurate and should not be allowed to average away the one moment that decided
 *    the game, so each move is weighted by how much the evaluation was actually swinging around it.
 *
 * The window is sized from the length of the game: too small and the standard deviation is noise,
 * too large and every move gets the same weight, which is the unweighted mean again.
 */
export function gameAccuracy(moves: readonly AnalysedMove[]): number {
  if (moves.length === 0) return 100;

  const accuracies = moves.map((move) => move.accuracy);
  /*
   * Winning chances *from White's point of view*, throughout.
   *
   * The volatility of a game is a property of the game, not of who is looking at it. Measuring each
   * side's spread in its own frame would give two different volatilities for the same swing.
   */
  const series = moves.map((move) => (move.side === 'w' ? move.winAfter : 100 - move.winAfter));

  const window = Math.max(2, Math.min(8, Math.ceil(moves.length / 5)));
  const weights = accuracies.map((_, index) => {
    const from = Math.max(0, index - Math.floor(window / 2));
    const slice = series.slice(from, from + window);
    const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;
    // A floor, so a perfectly flat game still has a defined weighted mean rather than 0/0.
    return Math.max(0.5, Math.sqrt(variance));
  });

  const weighted =
    accuracies.reduce((sum, value, index) => sum + value * weights[index]!, 0) /
    weights.reduce((sum, value) => sum + value, 0);

  // Clamped away from zero: one move at exactly 0% would otherwise make the harmonic mean 0 and
  // report a whole game as worthless because of a single lost piece.
  const harmonic =
    accuracies.length / accuracies.reduce((sum, value) => sum + 1 / Math.max(1, value), 0);

  return Math.round(((weighted + harmonic) / 2) * 10) / 10;
}
