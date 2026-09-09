/*
 * Can the fair-play signals actually tell an assisted player from a strong one?
 *
 * There is no labelled corpus of our own players, and there will not be one for a long time. The
 * research's answer is the only honest starting point: **generate games at known assistance levels
 * and measure detection power against a ground truth we constructed**, exactly as the paper that
 * quantified this did, whose own stated purpose is to measure the effectiveness of cheating "as part
 * of the effort to contain and detect it".
 *
 * So this builds four populations and runs the real `assess` over them:
 *
 *   honest    — a club-strength bot playing its own moves
 *   light     — the same bot, with 15% of its moves replaced by the engine's best
 *   heavy     — 50% replaced
 *   full      — every move the engine's best
 *
 * "Honest" is a bot rather than a human, and that is a real limitation stated up front: a bot's
 * mistakes are not distributed like a person's, so the honest population here is *easier* to separate
 * than a real one would be. **Every number this prints is therefore an optimistic bound.** If the
 * detector cannot separate these, it certainly cannot separate people.
 *
 * What is being measured is not "does it catch cheats". It is **how many innocent players it would
 * flag**, because that is the number that decides whether a detector may touch anybody's money.
 *
 *   node --experimental-strip-types scripts/fairplay-calibrate.mjs [players-per-group] [games-each]
 */
import { Chess } from 'chess.js';
import { LEVELS, chooseMove } from '../packages/core/src/engine.ts';
import { analyseGame } from '../packages/core/src/analysis.ts';
import { assess, MIN_MOVES } from '../packages/core/src/fairplay.ts';

const perGroup = Number(process.argv[2] ?? 3);
const gamesEach = Number(process.argv[3] ?? 6);

/** Club strength: the level a real opponent in this app most often is. */
const HUMANLIKE = LEVELS[1];
/** The "engine beside the board" — what somebody would actually have open on a second device. */
const BEST = LEVELS[2];

/*
 * The budgets, and why they are set here rather than taken from the levels.
 *
 * Generating a whole population and reviewing every game of it is expensive: at the levels' shipped
 * budgets this took longer than ten minutes and had to be killed. These are the numbers that make it
 * finish, and each one makes the measurement **harder** rather than easier, which is the only
 * direction it is safe to economise in:
 *
 *  - The assisting engine gets 100 ms rather than 400. A weaker assistant is *harder* to distinguish
 *    from strong play, so the detection numbers below are pessimistic rather than flattering.
 *  - Games stop at 48 plies, which gives the subject twenty-four moves — just over the twenty
 *    `assess` needs before it will say anything. Shorter than that and every player lands in the
 *    "insufficient" band, which is what the first run of this did: four games a player, everybody
 *    unjudgeable, and a gate that cheerfully passed on a measurement of nothing.
 *  - Review runs at 30 ms a position, which is the least generous the analysis ever gets.
 */
const ASSIST_MS = 100;
const HUMAN_MS = 30;
const REVIEW_MS = 30;
const MAX_PLIES = 48;

const OPENINGS = [[], ['e4', 'e5'], ['d4', 'd5'], ['e4', 'c5'], ['Nf3', 'd5'], ['c4', 'e5']];

function seeded(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * One game where the *subject* plays White with a given rate of engine assistance.
 *
 * The opponent is always the club bot, so the only thing that differs between populations is how
 * often the subject reached for help.
 */
function playGame(assistance, opening, random) {
  const chess = new Chess();
  for (const san of opening) chess.move(san);

  const subjectMoves = [];
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    if (chess.isGameOver()) break;
    const isSubject = chess.turn() === 'w';
    const assisted = isSubject && random() < assistance;
    const level = assisted ? BEST : HUMANLIKE;

    const choice = chooseMove(chess, level, {
      useBook: false,
      random,
      budgetMs: assisted ? ASSIST_MS : HUMAN_MS,
    });
    if (!choice) break;
    try {
      const played = chess.move({ from: choice.from, to: choice.to, promotion: choice.promotion ?? 'q' });
      if (isSubject) subjectMoves.push(played.san);
    } catch {
      break;
    }
  }
  return { moves: chess.history(), subjectMoves };
}

/** Turn one played game into the signals `assess` consumes, using the real review pipeline. */
function signalsFor(game) {
  const analysis = analyseGame(game.moves, { budgetMs: REVIEW_MS });
  const mine = analysis.moves.filter((move) => move.side === 'w');
  if (mine.length === 0) return null;

  const matched = mine.filter((move) => move.best === null || move.best === move.san).length;
  const loss = mine.reduce((sum, move) => sum + move.lost, 0) / mine.length;

  return {
    engineAgreement: matched / mine.length,
    averageLoss: loss,
    moves: mine.length,
    // Timing is not simulated: a generated game has no clock, and inventing one would calibrate the
    // detector against a fiction. The signal is simply absent here, which is what `assess` expects.
  };
}

const GROUPS = [
  { name: 'honest', assistance: 0 },
  { name: 'light 15%', assistance: 0.15 },
  { name: 'heavy 50%', assistance: 0.5 },
  { name: 'full 100%', assistance: 1 },
];

console.log(`${perGroup} players a group, ${gamesEach} games each, club bot as the opponent\n`);

const table = [];

for (const group of GROUPS) {
  const bands = { insufficient: 0, normal: 0, review: 0, 'high-risk': 0 };
  let scored = 0;

  for (let player = 0; player < perGroup; player++) {
    const random = seeded(group.assistance * 1000 + player * 31 + 7);
    const signals = [];

    for (let game = 0; game < gamesEach; game++) {
      const opening = OPENINGS[(player + game) % OPENINGS.length];
      const played = playGame(group.assistance, opening, random);
      // Short games are kept: a 40-ply game gives the subject twenty moves, and `assess` applies
      // its own `MIN_MOVES` bar to each one. Filtering here as well would silently empty the
      // sample and report a confident zero.
      if (played.subjectMoves.length < 8) continue;
      const signal = signalsFor(played);
      if (signal) signals.push(signal);
    }

    const verdict = assess(signals);
    bands[verdict.band] += 1;
    scored += verdict.score;
  }

  table.push({ name: group.name, bands, mean: scored / perGroup });
}

console.log('  group        normal  review  high-risk  insufficient   mean score');
for (const row of table) {
  console.log(
    `  ${row.name.padEnd(11)}` +
      `${String(row.bands.normal).padStart(6)}` +
      `${String(row.bands.review).padStart(8)}` +
      `${String(row.bands['high-risk']).padStart(11)}` +
      `${String(row.bands.insufficient).padStart(14)}` +
      `${row.mean.toFixed(1).padStart(13)}`,
  );
}

/*
 * The two numbers that decide whether this may ever touch money.
 *
 * **False-positive rate** is honest players flagged at all. It is the one that matters: a detector
 * that catches every cheat and flags a fifth of everybody else is not usable, because at any
 * realistic rate of cheating most of what it flags is innocent.
 */
const honest = table[0];
const flaggedHonest = honest.bands.review + honest.bands['high-risk'];
const falsePositive = flaggedHonest / perGroup;

const caught = table
  .slice(1)
  .reduce((sum, row) => sum + row.bands.review + row.bands['high-risk'], 0);
const cheats = (GROUPS.length - 1) * perGroup;
const recall = caught / cheats;

console.log('');
console.log(`  honest players flagged      ${flaggedHonest} of ${perGroup}   ${(falsePositive * 100).toFixed(0)}%`);
console.log(`  assisted players flagged    ${caught} of ${cheats}   ${(recall * 100).toFixed(0)}%`);

console.log('');
console.log('every number above is an OPTIMISTIC bound: the honest population is a bot, whose mistakes');
console.log('are more regular than a person\'s and therefore easier to separate from an engine\'s. A real');
console.log('honest population would be harder, not easier.');
console.log('');

/*
 * The gate.
 *
 * Not "does it catch cheats" — a detector that flagged everybody would score perfectly on that. The
 * gate is that it does **not** flag honest play, because the whole design promise is that a band
 * never costs an innocent player anything automatically, and the calibration is what keeps that
 * promise checkable rather than stated.
 */
/*
 * A measurement of nothing must not pass.
 *
 * The first run of this put every player in the "insufficient" band — too few judgeable games — and
 * then reported "0% of honest players flagged, 0% of assisted ones caught" as a **pass**. Both
 * numbers were true and neither meant anything. A gate that green-lights an empty sample is worse
 * than no gate, because it produces a number somebody will later quote.
 */
const judged = table.reduce((sum, row) => sum + perGroup - row.bands.insufficient, 0);
if (judged === 0) {
  console.log('INCONCLUSIVE  every player fell below the evidence bar, so nothing was measured.');
  console.log('              run more games a player; this is not a result.');
  process.exitCode = 1;
} else if (falsePositive > 0.2) {
  console.log(`FAIL  ${(falsePositive * 100).toFixed(0)}% of honest players were flagged; that is too many to act on`);
  process.exitCode = 1;
} else {
  console.log(`PASS  ${(falsePositive * 100).toFixed(0)}% of honest players flagged — the safety property holds`);
  console.log(`      ${judged} of ${perGroup * GROUPS.length} players had enough judgeable games to assess at all`);

  /*
   * Recall is reported separately and is **not** a pass condition, deliberately.
   *
   * The gate exists to stop the detector harming innocent players, and that is the property that can
   * be enforced. Making recall a pass condition would create pressure to move thresholds until this
   * synthetic population separates — which is fitting to a fiction, and the fastest way to build
   * something that flags real people confidently and wrongly.
   */
  if (recall === 0) {
    console.log('');
    console.log(`      ⚠ ${(recall * 100).toFixed(0)}% of assisted players were caught — including the group whose every`);
    console.log('        move came from the engine. On this evidence these aggregate signals have NO');
    console.log('        demonstrated detection power, which matches what the literature predicts for');
    console.log('        engine-agreement and centipawn-loss on their own. They must not gate a payout.');
  } else {
    console.log(`      ${(recall * 100).toFixed(0)}% of assisted players caught (reported, not gated — see the note in this file)`);
  }
}
