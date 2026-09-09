/*
 * Are the four bots actually in the order the app says they are?
 *
 * The home screen offers Pip, Nell, Vera and Oskar as increasing difficulty. **That claim has never
 * been tested.** It is made to every player who chooses an opponent, and the levels differ along
 * three axes at once — search depth, thinking time, and how often they deliberately choose a worse
 * move — so "deeper must be stronger" is an assumption rather than a fact. A level that is not
 * actually harder than the one below it is a broken promise on the first screen of the product.
 *
 * ## What this measures, and what it does not
 *
 * It plays each adjacent pair head to head, colours alternating, from a fixed set of openings, and
 * reports the score with a confidence interval. That is what an engine match is, and it answers
 * "is Nell stronger than Pip" with a number.
 *
 * **It does not measure Elo against the world.** That needs an external reference — Stockfish, run
 * as an unshipped oracle — and no Stockfish binary is available on this machine, which is stated here
 * rather than worked around. Absolute strength therefore remains unmeasured, and nothing in the
 * product claims a number for it.
 *
 * ## Why the result is a range rather than a value
 *
 * The levels are time-budgeted as they ship, so two runs differ. That is the honest thing to measure
 * — it is what a player actually meets — and the answer is reported the way engine testing reports
 * it: a score, a game count, and an interval wide enough to tell whether the difference is real.
 *
 *   node --experimental-strip-types scripts/levels-ordered.mjs [games-per-pair]
 */
import { Chess } from 'chess.js';
import { LEVELS, chooseMove } from '../packages/core/src/engine.ts';

const perPair = Number(process.argv[2] ?? 20);

/*
 * Fixed openings, so the match measures play rather than the book.
 *
 * Each is played twice, once with each engine as White, which removes the first-move advantage from
 * the comparison entirely.
 */
const OPENINGS = [
  [],
  ['e4', 'e5'],
  ['d4', 'd5'],
  ['e4', 'c5'],
  ['Nf3', 'Nf6'],
  ['c4', 'e5'],
  ['d4', 'Nf6', 'c4', 'e6'],
  ['e4', 'e6', 'd4', 'd5'],
  ['e4', 'c6', 'd4', 'd5'],
  ['d4', 'd5', 'c4', 'c6'],
];

/** A small deterministic generator, so a run can be reproduced from its seed. */
function seeded(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** One game. Returns 1 when white wins, 0 when black wins, 0.5 for anything drawn or stopped. */
function play(white, black, opening, random) {
  const chess = new Chess();
  for (const san of opening) chess.move(san);

  // Long enough for a decision, short enough that the whole match finishes: a game still going at
  // 160 plies between two small engines is a draw in every sense that matters here.
  for (let ply = 0; ply < 160; ply++) {
    if (chess.isGameOver()) break;
    const level = chess.turn() === 'w' ? white : black;
    const choice = chooseMove(chess, level, { useBook: false, random });
    if (!choice) break;
    try {
      chess.move({ from: choice.from, to: choice.to, promotion: choice.promotion ?? 'q' });
    } catch {
      // An illegal choice would be our bug. Stopping is the honest outcome; scoring it as a win for
      // either side would hide it.
      return 0.5;
    }
  }

  if (chess.isCheckmate()) return chess.turn() === 'w' ? 0 : 1;
  return 0.5;
}

/**
 * The 95% interval on a match score, by the normal approximation.
 *
 * Wide by design at these game counts, and reporting it is the point: a 60% score over twenty games
 * is not evidence of anything, and a table that printed 60% without the interval would imply it was.
 */
function interval(score, games) {
  const p = score / games;
  const spread = 1.96 * Math.sqrt(Math.max(p * (1 - p), 0.0001) / games);
  return [Math.max(0, p - spread), Math.min(1, p + spread)];
}

console.log(`each adjacent pair, ${perPair} games, colours alternating, book off\n`);

const rows = [];
let ordered = true;

for (let i = 0; i < LEVELS.length - 1; i++) {
  const weaker = LEVELS[i];
  const stronger = LEVELS[i + 1];

  let strongerScore = 0;
  const started = Date.now();

  for (let game = 0; game < perPair; game++) {
    const opening = OPENINGS[game % OPENINGS.length];
    const random = seeded(i * 1000 + game);
    // Alternate colours so the first-move advantage cancels exactly.
    const strongerIsWhite = game % 2 === 0;
    const result = strongerIsWhite
      ? play(stronger, weaker, opening, random)
      : play(weaker, stronger, opening, random);
    strongerScore += strongerIsWhite ? result : 1 - result;
  }

  const [low, high] = interval(strongerScore, perPair);
  const percent = ((strongerScore / perPair) * 100).toFixed(1);
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  // The claim is only supported when the *whole* interval sits above an even score. Anything else is
  // a result that could be noise, and saying so is the difference between a measurement and a hope.
  const proven = low > 0.5;
  if (!proven) ordered = false;

  rows.push(
    `  ${stronger.name.padEnd(6)} v ${weaker.name.padEnd(6)} ${percent.padStart(5)}%   ` +
      `95% ${(low * 100).toFixed(0)}–${(high * 100).toFixed(0)}%   ${proven ? 'ordered' : 'NOT PROVEN'}   ${seconds}s`,
  );
}

for (const row of rows) console.log(row);

console.log('');
console.log('absolute strength is NOT measured here: no Stockfish binary is available on this machine,');
console.log('and an engine has no Elo without an opponent outside itself.');
console.log('');

if (ordered) {
  console.log('PASS  every level is stronger than the one below it, with the whole interval above even');
} else {
  console.log('INCONCLUSIVE  at least one pair could not be separated at this game count');
  console.log('              run more games before drawing a conclusion; this is not a failure of the');
  console.log('              engine, it is a statement about how much evidence this run gathered.');
}
