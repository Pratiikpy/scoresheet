/*
 * A deterministic A/B for one search change.
 *
 * `scripts/strength.mjs` is time-budgeted, so two runs of it on identical code disagree — two
 * separate runs on 8 September 2026 produced 92%/89% and 91%/86%. That makes it useless for
 * deciding whether a change to the search helped, because the noise is wider than most effects.
 *
 * This script removes the clock instead. `SearchLimits.now` exists so a test can move time; freeze
 * it and `outOfTime()` is never true, so the search runs to exactly `depth` plies every time and
 * the same input always produces the same answer. What is measured is then a property of the code
 * and of nothing else.
 *
 * It samples `mateIn*` puzzles on purpose: the change under test is quiescence's handling of being
 * in check, and a mating line is where a check at the horizon actually decides the answer.
 *
 *   node --experimental-strip-types scripts/quiescence-ab.mjs [depth] [count]
 */
import { Chess } from 'chess.js';
import { loadPuzzles } from '../packages/core/src/puzzle-set.ts';
import { Position, moveFrom, moveTo, movePromotion } from '../packages/core/src/position.ts';
import { findBestMove, createTable, mateIn } from '../packages/core/src/search.ts';

const depth = Number(process.argv[2] ?? 5);
const wanted = Number(process.argv[3] ?? 200);

const FILES = 'abcdefgh';
const PROMOTION = ['', '', 'n', 'b', 'r', 'q', ''];

/** 0x88: index = rank * 16 + file, rank 0 being White's first rank. */
function square(index) {
  return `${FILES[index & 7]}${(index >> 4) + 1}`;
}

function uciOf(move) {
  const promotion = movePromotion(move);
  return square(moveFrom(move)) + square(moveTo(move)) + (promotion ? PROMOTION[promotion] : '');
}

const puzzles = await loadPuzzles();
const mates = puzzles.filter((p) => p.themes.some((t) => t.startsWith('mateIn'))).slice(0, wanted);

let correct = 0;
let sawMate = 0;
let tried = 0;
let nodes = 0;

for (const puzzle of mates) {
  const chess = new Chess(puzzle.fen);
  // A Lichess puzzle's FEN is the position before the opponent's blunder; the puzzle starts after.
  const first = puzzle.moves[0];
  try {
    chess.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] });
  } catch {
    continue;
  }

  const expected = puzzle.moves[1];
  if (!expected) continue;
  tried += 1;

  const position = Position.fromFen(chess.fen());
  const result = findBestMove(position, {
    depth,
    budgetMs: Number.MAX_SAFE_INTEGER,
    table: createTable(),
    now: () => 0,
  });

  nodes += result.nodes;
  if (mateIn(result.score) !== null) sawMate += 1;

  const got = uciOf(result.move);
  if (got === expected || got.slice(0, 4) === expected.slice(0, 4)) correct += 1;
}

const pct = (n) => `${((n / tried) * 100).toFixed(1)}%`;
console.log(`depth ${depth}, ${tried} mateIn* puzzles, clock frozen`);
console.log(`  first move correct   ${correct}/${tried}  ${pct(correct)}`);
console.log(`  scored as a mate     ${sawMate}/${tried}  ${pct(sawMate)}`);
console.log(`  nodes                ${nodes.toLocaleString()}`);
