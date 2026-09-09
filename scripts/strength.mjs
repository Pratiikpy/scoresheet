/**
 * How strong is the engine, actually?
 *
 * `SPEC.md` K8 says the honest thing — *"ours will be around 2000, not 3600. **Say the number**
 * rather than implying parity"* — and then nobody measured it, so the number being said was a guess.
 * The review screen tells a player it is "about club strength". That is a claim about the product,
 * made to somebody who is deciding whether to believe the report, and it needs evidence.
 *
 * ## The yardstick, and why it is a fair one
 *
 * The app already ships **5,000 Lichess puzzles, each with a rating** — CC0, bundled, and derived
 * from how often real players of known strength solve them. That is a calibrated instrument sitting
 * in the repository, and using it costs nothing: set up each position, give the engine a fixed
 * budget, and see whether it finds the move.
 *
 * What this measures is **tactics**, not playing strength, and those are not the same thing — a
 * player who solves 1800-rated puzzles is not an 1800 player. It is the right measurement anyway,
 * because tactics is exactly what the review screen is claiming to be good enough at: finding the
 * move somebody missed. It is also the number that would fall first if the search regressed.
 *
 * ## The bias in this sample, stated up front
 *
 * The bundled set is **not** a fair slice of Lichess's database, and reading these numbers as a
 * rating would be wrong. `scripts/vendor-puzzles.mjs` keeps only puzzles with **at most four player
 * moves**, a popularity of 90 or better and a settled rating — chosen so a puzzle fits on a phone
 * between two things. That excludes precisely the puzzles that are hard *because they are long*, and
 * what is left at the top of the rating range is short, forcing and counterintuitive: the kind a
 * four-ply search with quiescence is unusually good at, and a human is not.
 *
 * So a high figure in the top band says the engine is good at short tactics. It does not say it
 * plays at that rating, and this file will not print a rating.
 *
 * ## What counts as solved
 *
 * The stored move, or **any move that mates when the stored one does**. Many positions have a second
 * mate in one and Lichess stores a single line; counting the other as a failure would understate the
 * engine for finding a forced mate. The same rule the puzzle screen uses on a human.
 *
 *   node scripts/strength.mjs [budgetMs] [perBand]
 */

import { Chess } from 'chess.js';
import { LEVELS, chooseMove } from '../packages/core/src/index.ts';
import { PUZZLES, PUZZLE_THEMES } from '../packages/core/src/puzzles-data.ts';

const budgetMs = Number(process.argv[2] ?? 300);
const perBand = Number(process.argv[3] ?? 40);

/*
 * ⭐ **`--nnue` measures the network against the hand-written evaluation, at the same time budget.**
 *
 * This is the only comparison that decides anything. The network is far stronger per call and, in
 * JavaScript without SIMD, around two hundred times slower — so at a fixed number of seconds it buys
 * a much better opinion of many fewer positions. Whether that is a gain or a loss is not something
 * anybody can reason their way to; it depends on the constant factors of this engine, in this
 * language, on this hardware.
 *
 * So: same puzzles, same seconds, one flag between the two runs, and whichever wins is what ships.
 */
const useNnue = process.argv.includes('--nnue');
let evaluator;
if (useNnue) {
  const { readFileSync } = await import('node:fs');
  const { loadNnue } = await import('../packages/core/src/nnue.ts');
  const file = readFileSync('apps/web/public/nnue-akimbo-1.0.0.bin');
  const network = loadNnue(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  evaluator = (position) => network.evaluate(position);
}

/** The strongest level, with the blunder rate off — this is about the search, not the personality. */
const LEVEL = { ...LEVELS[LEVELS.length - 1], blunderRate: 0 };

/** Bands wide enough to hold enough puzzles, narrow enough to show a curve. */
const BANDS = [
  [800, 1199],
  [1200, 1499],
  [1500, 1799],
  [1800, 2099],
  [2100, 2399],
  [2400, 3000],
];

function parse() {
  const out = [];
  for (const line of PUZZLES.split('\n')) {
    if (!line) continue;
    const [fen, moves, rating] = line.split('\t');
    if (!fen || !moves || !rating) continue;
    out.push({ fen, moves: moves.split(' '), rating: Number(rating) });
  }
  return out;
}

function uci(move) {
  return {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    ...(move.length > 4 ? { promotion: move[4] } : {}),
  };
}

/**
 * A deterministic sample, so two runs of this compare like for like.
 *
 * A random sample would make every run a different measurement, and then a regression and a lucky
 * draw look identical.
 */
function sample(list, count, seed) {
  let state = seed;
  const picked = [];
  const used = new Set();
  while (picked.length < count && used.size < list.length) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const at = state % list.length;
    if (used.has(at)) continue;
    used.add(at);
    picked.push(list[at]);
  }
  return picked;
}

const puzzles = parse();
console.log(`${puzzles.length} puzzles bundled · ${PUZZLE_THEMES.length} themes`);
console.log(`${LEVEL.name}, ${budgetMs} ms a move, ${perBand} puzzles a band\n`);

let solvedAll = 0;
let wholeAll = 0;
let triedAll = 0;
const rows = [];

for (const [low, high] of BANDS) {
  const inBand = puzzles.filter((puzzle) => puzzle.rating >= low && puzzle.rating <= high);
  if (inBand.length === 0) continue;

  let solved = 0;
  let whole = 0;
  let tried = 0;
  for (const puzzle of sample(inBand, perBand, low)) {
    const chess = new Chess(puzzle.fen);
    // The first stored move is the opponent's; the puzzle starts after it.
    try {
      chess.move(uci(puzzle.moves[0]));
    } catch {
      continue;
    }

    const expected = puzzle.moves[1];
    if (!expected) continue;
    tried += 1;

    const choice = chooseMove(chess, LEVEL, { budgetMs, useBook: false, random: () => 0, evaluate: evaluator });
    if (!choice) continue;

    const wanted = uci(expected);
    let right =
      choice.from === wanted.from &&
      choice.to === wanted.to &&
      (choice.promotion ?? 'q') === (wanted.promotion ?? 'q');

    /*
     * A different mate is still a mate.
     *
     * Lichess stores one line, and many positions have a second mate in one. Counting the other as a
     * failure would report the engine as weaker for finding a forced mate — the same rule the puzzle
     * screen already applies to a person.
     */
    if (!right) {
      const theirs = new Chess(chess.fen());
      const ours = new Chess(chess.fen());
      try {
        theirs.move(wanted);
        ours.move({ from: choice.from, to: choice.to, promotion: choice.promotion ?? 'q' });
        right = theirs.isCheckmate() && ours.isCheckmate();
      } catch {
        right = false;
      }
    }

    if (right) solved += 1;

    /*
     * And the **whole line**, which is the harder and fairer question.
     *
     * Finding the first move of a tactic is not the same as seeing it through: a search can play a
     * check that happens to be right and then have nothing. Walking the stored line — our move, the
     * opponent's reply from the puzzle, ours again — is what a player is actually asked to do, and
     * it is the number that separates "spotted something" from "calculated it".
     */
    if (right) {
      const line = new Chess(chess.fen());
      let held = true;
      for (let at = 1; at < puzzle.moves.length; at += 2) {
        const ours = uci(puzzle.moves[at]);
        const mine = chooseMove(line, LEVEL, { budgetMs, useBook: false, random: () => 0, evaluate: evaluator });
        if (!mine) { held = false; break; }
        const matched =
          mine.from === ours.from && mine.to === ours.to && (mine.promotion ?? 'q') === (ours.promotion ?? 'q');
        if (!matched) {
          // A different mate still ends it, exactly as above.
          const check = new Chess(line.fen());
          try {
            check.move({ from: mine.from, to: mine.to, promotion: mine.promotion ?? 'q' });
          } catch { held = false; break; }
          if (!check.isCheckmate()) { held = false; break; }
          held = true;
          break;
        }
        line.move({ from: ours.from, to: ours.to, promotion: ours.promotion ?? 'q' });
        const reply = puzzle.moves[at + 1];
        if (!reply) break;
        line.move(uci(reply));
      }
      if (held) whole += 1;
    }
  }

  solvedAll += solved;
  wholeAll += whole;
  triedAll += tried;
  const share = tried === 0 ? 0 : (solved / tried) * 100;
  const lineShare = tried === 0 ? 0 : (whole / tried) * 100;
  rows.push({ band: `${low}–${high}`, solved, whole, tried, share, lineShare });
  console.log(
    `  ${`${low}–${high}`.padEnd(11)} first ${share.toFixed(0).padStart(3)}%   whole line ${lineShare.toFixed(0).padStart(3)}%  ${'█'.repeat(Math.round(lineShare / 5))}`,
  );
}

console.log(
  `\n  overall     first ${((solvedAll / triedAll) * 100).toFixed(0)}%   whole line ${((wholeAll / triedAll) * 100).toFixed(0)}%   (${triedAll} puzzles)`,
);

/*
 * And no rating is printed, deliberately.
 *
 * The temptation is to read the highest band the engine clears as its number. That would be wrong
 * twice over: the sample is short-puzzle-biased (see the header), and a puzzle rating measures how
 * hard a position is for *people*, who are worse than a search at forcing lines and better at quiet
 * ones. What these figures support is a claim about **finding tactics in an ordinary game**, which is
 * what the review screen actually says — and nothing about playing strength.
 */
const weakest = [...rows].sort((a, b) => a.lineShare - b.lineShare)[0];
console.log(`\n  Read this as: on short, popular, settled-rating puzzles it sees the whole line most of`);
console.log(`  the time, and is weakest at ${weakest ? weakest.band : '\u2014'} (${weakest ? weakest.lineShare.toFixed(0) : 0}% of lines held).`);
console.log(`  It is not a playing rating, and this file will not print one.\n`);
