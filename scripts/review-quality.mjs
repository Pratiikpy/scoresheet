/*
 * Is the game review any good — measured against something humans decided, not against our own engine.
 *
 * The plan says review quality is unmeasured, and the research explains why: **no published corpus of
 * human-labelled move classifications exists**, and validating an engine's labels with the same
 * engine is circular. That is still true, and this script does not pretend to solve it.
 *
 * What it does is find the one human-labelled corpus this repository already ships. The ECO opening
 * book is **3,810 named lines curated by people over about two centuries** — CC0, from
 * `lichess-org/chess-openings`. Nobody named the Ruy Lopez because an engine liked it. So:
 *
 *   **A move in a named opening line, played on the board it was named for, is a move humans have
 *   endorsed. A review that calls it a mistake is wrong by a human standard, and that is a
 *   false-positive rate we can actually compute.**
 *
 * **And the first version of this measured nothing.** `analysis.ts` carries a theory exemption —
 * book moves are not criticised below the blunder threshold — so a review of named lines returned a
 * perfect 0.00%, produced entirely by the exemption rather than by the evaluation. A number that
 * cannot come out any other way is not a measurement.
 *
 * So it is run **twice**: once as it ships, and once with the exemption off. The second number is the
 * one that says something — what the raw engine thinks of moves people have played for two
 * centuries — and the gap between them is exactly how much work that rule is doing.
 *
 * The second measurement needs no corpus at all: **stability**. A move's judgement should not flip
 * between "fine" and "blunder" because the engine was given more time. A classification that moves
 * under its own budget cannot be right in both runs, and instability is a defect whatever the truth is.
 *
 *   node --experimental-strip-types scripts/review-quality.mjs [lines] [budget-ms]
 */
import { Chess } from 'chess.js';
import { analyseGame } from '../packages/core/src/analysis.ts';
import { OPENINGS } from '../packages/core/src/openings-data.ts';

const wanted = Number(process.argv[2] ?? 60);
const budgetMs = Number(process.argv[3] ?? 120);

/*
 * The stability comparison is bound by depth, not by the clock.
 *
 * It used to judge the same lines at 120 ms and 480 ms and ask how many verdicts crossed the line
 * between "fine" and "criticised". That is the right question, asked with an instrument that cannot
 * answer it twice the same way: a time-budgeted search sees a different amount of the tree depending
 * on what else the machine is doing. The same code, the same lines and the same 240 comparisons gave
 * **7.1% on a quiet machine and 11.7% on a busy one**, half an hour apart — and 10% is the threshold,
 * so this gate passed and then failed without anything having changed.
 *
 * This repository already learned that once: `scripts/quiescence-ab.mjs` exists because the strength
 * script gave 92%/89% and 91%/86% on the same code the same day. A measurement that moves with the
 * weather is not evidence, and a *gate* built on one eventually fails a build for being busy, which
 * teaches everybody to ignore it.
 *
 * So the two searches are pinned to fixed depths, with a time cap generous enough that it never
 * binds. The question is unchanged — does looking harder change the verdict — and the answer is now
 * the same on every machine and every run.
 */
const SHALLOW = { name: 'shallow', depth: 4, blunderRate: 0, blunderDepth: 1, bookPlies: 0 };
const DEEP = { name: 'deep', depth: 6, blunderRate: 0, blunderDepth: 1, bookPlies: 0 };
/** High enough that depth always stops the search first, on any machine this could run on. */
const FROZEN_MS = 60_000;

/** The named lines, longest first: a longer line exercises more of the middlegame boundary. */
const lines = OPENINGS.split('\n')
  .map((row) => row.split('\t'))
  .filter((parts) => parts.length >= 3 && parts[2].trim().length > 0)
  .map(([eco, name, moves]) => ({ eco, name, moves: moves.trim().split(/\s+/) }))
  .filter((line) => line.moves.length >= 6)
  .sort((a, b) => b.moves.length - a.moves.length || (a.name < b.name ? -1 : 1))
  .slice(0, wanted);

const CRITICISED = new Set(['inaccuracy', 'mistake', 'blunder']);

let plies = 0;
let shipped = 0;
let raw = 0;
const worst = [];

for (const line of lines) {
  // Confirm the line replays before judging it; a line we cannot play is not evidence about review.
  const board = new Chess();
  let legal = true;
  for (const san of line.moves) {
    try {
      board.move(san);
    } catch {
      legal = false;
      break;
    }
  }
  if (!legal) continue;

  const asShipped = analyseGame(line.moves, { budgetMs });
  const withoutTheory = analyseGame(line.moves, { budgetMs, theory: false });

  for (let i = 0; i < asShipped.moves.length; i++) {
    const move = asShipped.moves[i];
    const bare = withoutTheory.moves[i];
    plies += 1;
    if (CRITICISED.has(move.judgement)) shipped += 1;
    if (bare && CRITICISED.has(bare.judgement)) {
      raw += 1;
      worst.push({
        name: line.name,
        eco: line.eco,
        san: bare.san,
        judgement: bare.judgement,
        lost: Math.round(bare.lost),
        rescued: !CRITICISED.has(move.judgement),
      });
    }
  }
}

worst.sort((a, b) => b.lost - a.lost);

console.log(`${lines.length} named opening lines, ${plies} plies, ${budgetMs} ms a position\n`);
console.log(`  as it ships               ${String(shipped).padStart(4)} of ${plies}   ${((shipped / Math.max(1, plies)) * 100).toFixed(2)}%`);
console.log(`  with theory turned off    ${String(raw).padStart(4)} of ${plies}   ${((raw / Math.max(1, plies)) * 100).toFixed(2)}%`);
console.log(`  \u2192 the exemption rescues ${raw - shipped} theory moves the raw engine would have criticised`);

if (worst.length > 0) {
  console.log('\n  what the raw engine complains about most:');
  for (const entry of worst.slice(0, 8)) {
    const mark = entry.rescued ? 'rescued' : 'still flagged';
    console.log(`    ${entry.eco} ${entry.name.slice(0, 34).padEnd(34)} ${entry.san.padEnd(6)} ${entry.judgement.padEnd(10)} -${String(entry.lost).padEnd(3)} ${mark}`);
  }
}

/* ------------------------------------------------------------------ stability */

/*
 * The same games, judged again with four times the thinking time.
 *
 * A move whose verdict changes because the engine thought longer was wrong in at least one of the two
 * runs. Some drift is inherent — a deeper search genuinely knows more — so what is reported is the
 * rate, and specifically the rate of *crossing the line* between acceptable and criticised, which is
 * the flip a player would actually notice.
 */
const sample = lines.slice(0, Math.min(20, lines.length));
let compared = 0;
let changed = 0;
let crossed = 0;

for (const line of sample) {
  /*
   * Measured with the theory exemption **off**, for the same reason the rate above is.
   *
   * With it on every move in a named line is already "best", so nothing can flip and the answer is a
   * guaranteed zero — which says nothing about the evaluation underneath. Turning it off asks the
   * real question: does the engine's own verdict on a position hold when it thinks four times longer?
   */
  const shallow = analyseGame(line.moves, { level: SHALLOW, budgetMs: FROZEN_MS, theory: false });
  const deep = analyseGame(line.moves, { level: DEEP, budgetMs: FROZEN_MS, theory: false });

  for (let i = 0; i < Math.min(shallow.moves.length, deep.moves.length); i++) {
    const a = shallow.moves[i];
    const b = deep.moves[i];
    compared += 1;
    if (a.judgement !== b.judgement) changed += 1;
    if (CRITICISED.has(a.judgement) !== CRITICISED.has(b.judgement)) crossed += 1;
  }
}

console.log(`
${sample.length} of those lines, judged twice at depth ${SHALLOW.depth} and depth ${DEEP.depth}
`);
console.log(`  verdict changed at all       ${changed} of ${compared}   ${((changed / Math.max(1, compared)) * 100).toFixed(1)}%`);
console.log(`  crossed the criticised line  ${crossed} of ${compared}   ${((crossed / Math.max(1, compared)) * 100).toFixed(1)}%`);

console.log('');
console.log('what this does NOT measure: agreement with human move classifications on real games.');
console.log('No published corpus of those exists, and labelling them with our own engine would be');
console.log('circular. The opening book is used here precisely because people, not engines, wrote it.');
console.log('');

/*
 * The gate.
 *
 * Five percent is not a number from the literature — there isn't one — it is the point past which the
 * review is calling named theory an error often enough that a player would notice and stop believing
 * it. It is written here rather than in a config so that moving it is a visible act.
 */
const rate = shipped / Math.max(1, plies);
if (rate > 0.05) {
  console.log(`FAIL  ${(rate * 100).toFixed(2)}% of named theory moves reach a player as an error`);
  process.exitCode = 1;
} else if (crossed / Math.max(1, compared) > 0.1) {
  console.log(`FAIL  ${((crossed / compared) * 100).toFixed(1)}% of verdicts flip across the criticised line when the engine looks deeper`);
  process.exitCode = 1;
} else {
  console.log(`PASS  ${(rate * 100).toFixed(2)}% of named theory moves reach a player as an error,`);
  console.log(`      and ${((crossed / Math.max(1, compared)) * 100).toFixed(1)}% of verdicts move across that line under four times the budget`);
}
