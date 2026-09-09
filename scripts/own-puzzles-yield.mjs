/*
 * How many real mistakes actually become puzzles — and why the rest do not.
 *
 * `own-puzzles.ts` is mostly a set of refusals, and refusals are the part that cannot be judged from
 * unit tests: a gate that throws out 99% of candidates passes every test it was written against and
 * produces a feature nobody ever sees. So this runs the real generator over real mistakes and reports
 * the yield **with the reason for every refusal**, because a generator that quietly drops nine in ten
 * is indistinguishable from a broken one and only the reasons tell them apart.
 *
 * The mistakes are real: for each bundled Lichess puzzle, a legal move that is *not* the solution is
 * played in the tactical position. In a tactics position almost every alternative to the solution is
 * a genuine error, which makes this an honest proxy — and it is labelled a proxy rather than
 * presented as a blunder corpus.
 *
 * The engine's own ranked root moves supply both the answer and the runner-up, so the uniqueness
 * margin is measured rather than assumed.
 *
 *   node --experimental-strip-types scripts/own-puzzles-yield.mjs [candidates] [ms]
 */
import { Chess } from 'chess.js';
import { loadPuzzles } from '../packages/core/src/puzzle-set.ts';
import { considerMistake, stillSound, alreadyQueued } from '../packages/core/src/own-puzzles.ts';
import { Position, moveFrom, moveTo, movePromotion } from '../packages/core/src/position.ts';
import { findBestMove, createTable } from '../packages/core/src/search.ts';
import { ANALYSIS_LEVEL } from '../packages/core/src/analysis.ts';

const wanted = Number(process.argv[2] ?? 200);
const budgetMs = Number(process.argv[3] ?? 150);

const FILES = 'abcdefgh';
const PROMOTION = ['', '', 'n', 'b', 'r', 'q', ''];
const square = (index) => `${FILES[index & 7]}${(index >> 4) + 1}`;
const uciOf = (move) =>
  square(moveFrom(move)) + square(moveTo(move)) + (movePromotion(move) ? PROMOTION[movePromotion(move)] : '');

/** The engine's root moves for one position, as SAN, best first. */
function rankedFor(fen, ms) {
  const position = Position.fromFen(fen);
  const result = findBestMove(position, {
    depth: ANALYSIS_LEVEL.depth,
    budgetMs: ms,
    table: createTable(),
  });

  const board = new Chess(fen);
  const out = [];
  for (const entry of result.ranked) {
    const uci = uciOf(entry.move);
    const probe = new Chess(fen);
    try {
      const played = probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push({ san: played.san, score: entry.score });
    } catch {
      // A root move that will not replay is our bug, not a candidate. Skipping it is safe: it can
      // only ever remove a puzzle, never invent one.
    }
  }
  void board;
  return out;
}

const puzzles = await loadPuzzles();
const refusals = new Map();
const queue = [];
let considered = 0;
let accepted = 0;
let droppedOnSecondLook = 0;
let duplicates = 0;
const margins = [];

for (const puzzle of puzzles) {
  if (considered >= wanted) break;

  const chess = new Chess(puzzle.fen);
  try {
    const first = puzzle.moves[0];
    chess.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] });
  } catch {
    continue;
  }

  const solution = puzzle.moves[1];
  if (!solution) continue;

  const alternatives = chess
    .moves({ verbose: true })
    .filter((move) => `${move.from}${move.to}${move.promotion ?? ''}` !== solution);
  if (alternatives.length === 0) continue;

  // Deterministic pick, so two runs of this script compare like with like.
  const mistake = alternatives[puzzle.rating % alternatives.length];
  const fen = chess.fen();
  considered += 1;

  const ranked = rankedFor(fen, budgetMs);
  if (ranked.length === 0) continue;

  // The cost of the mistake, in the same units the gate expects: how far the played move is behind
  // the best one, read off the same ranking.
  const best = ranked[0];
  const played = ranked.find((entry) => entry.san === mistake.san);
  const cost = played ? best.score - played.score : 0;

  const { puzzle: made, refused } = considerMistake({
    fen,
    played: mistake.san,
    ranked,
    cost,
    fromBlock: 4_100_000 + considered,
    gameId: 'a'.repeat(32),
  });

  if (refused) {
    refusals.set(refused, (refusals.get(refused) ?? 0) + 1);
    continue;
  }

  if (alreadyQueued(queue, made.fen)) {
    duplicates += 1;
    continue;
  }

  // The second look, deeper than the one that made it.
  const deeper = rankedFor(fen, budgetMs * 4);
  if (!stillSound(made, deeper)) {
    droppedOnSecondLook += 1;
    continue;
  }

  accepted += 1;
  margins.push(made.margin);
  queue.push(made);
}

const pct = (n) => `${((n / Math.max(1, considered)) * 100).toFixed(1)}%`;

console.log(`${considered} real mistakes considered, ${budgetMs} ms a position\n`);
console.log(`  became a puzzle        ${String(accepted).padStart(5)}   ${pct(accepted)}`);
console.log(`  dropped on second look ${String(droppedOnSecondLook).padStart(5)}   ${pct(droppedOnSecondLook)}`);
console.log(`  already in the queue   ${String(duplicates).padStart(5)}   ${pct(duplicates)}`);
console.log('\n  refused, and why:');
for (const [reason, count] of [...refusals].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${reason.padEnd(16)} ${String(count).padStart(5)}   ${pct(count)}`);
}

if (margins.length > 0) {
  const sorted = [...margins].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`\n  median winning margin  ${median} centipawns`);
}

/*
 * What counts as a failure here.
 *
 * Not a low yield — the gates exist to be strict, and a strict gate that produces a few good puzzles
 * is the design working. What would be a failure is producing **none at all**, which would mean the
 * feature can never fire, or accepting everything, which would mean the gates do nothing.
 */
if (accepted === 0) {
  console.log('\nFAIL  no mistake in the sample could ever become a puzzle');
  process.exitCode = 1;
} else if (refusals.size === 0 && droppedOnSecondLook === 0) {
  console.log('\nFAIL  nothing was refused, so the gates are not doing anything');
  process.exitCode = 1;
} else {
  console.log(`\nPASS  ${accepted} sound puzzles, and every refusal accounted for`);
}
