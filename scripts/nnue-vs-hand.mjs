/**
 * Which evaluation is actually stronger: the network, or the hand-written one?
 *
 * ## Why this exists when `strength.mjs` already runs
 *
 * Because `strength.mjs` could not answer it. On the Lichess puzzle suite the two are
 * indistinguishable — 91%/87% against 91%/88% at 300 ms, and 95%/93% against 95%/93% at 1000 ms.
 * That is a real result and it is the wrong question: puzzles are **tactics**, and tactics are
 * bought with depth. The network is 15× slower per call, so it searches 15× fewer positions, and a
 * tie there means the two effects cancelled — not that the evaluations are equally good.
 *
 * The question Game Review actually depends on is **judgement**: given an ordinary position, which
 * evaluation is closer to right? There is no reference to check that against. Stockfish is GPL and
 * off limits; akimbo *is* the network, so using it as a referee would be circular.
 *
 * ## So: self-play, which needs no referee at all
 *
 * The two configurations play each other. Same engine, same search, same time budget, one difference
 * — the evaluation function. Whoever wins more games is stronger, and that is the whole argument.
 * It is how engine changes are actually tested, and it settles the question without an authority.
 *
 * ## What is controlled, and why each of those matters
 *
 *  - **Colours alternate.** White scores about 4% better than Black between equal players, so an
 *    odd number of games or a fixed assignment measures the first-move advantage.
 *  - **Openings are supplied**, two games per opening, one from each side. Two deterministic engines
 *    from the start position play the same game every time — a hundred of which is one game.
 *  - **Time, not depth, is the budget**, because that is how the app runs. A depth-limited match
 *    would hand the slower evaluation unlimited time and measure nothing about a phone.
 *  - **Adjudication is on material and move count**, not on either engine's opinion. Asking a player
 *    whether it has won is how a match measures confidence instead of strength.
 *
 *   node scripts/nnue-vs-hand.mjs [msPerMove] [pairs]
 */

import { readFileSync } from 'node:fs';

import { Chess } from 'chess.js';

const { chooseMove, LEVELS } = await import('../packages/core/src/index.ts');
const { loadNnue } = await import('../packages/core/src/nnue.ts');

const msPerMove = Number(process.argv[2] ?? 100);
const pairs = Number(process.argv[3] ?? 30);

const file = readFileSync('apps/web/public/nnue-akimbo-1.0.0.bin');
const network = loadNnue(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const withNnue = (position) => network.evaluate(position);

/** The strongest level with the blunder rate off: this is about the evaluation, not a personality. */
const LEVEL = { ...LEVELS[LEVELS.length - 1], blunderRate: 0 };

/**
 * Opening positions, played from both sides.
 *
 * Ordinary, balanced, and varied enough that no single structure decides the match. Taken as move
 * sequences rather than FENs so the games are legal by construction.
 */
const OPENINGS = [
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4'],
  ['e4', 'c5', 'Nc3', 'Nc6'],
  ['e4', 'e6', 'd4', 'd5'],
  ['e4', 'c6', 'd4', 'd5'],
  ['d4', 'd5', 'c4', 'e6'],
  ['d4', 'd5', 'c4', 'c6'],
  ['d4', 'Nf6', 'c4', 'e6'],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3'],
  ['Nf3', 'd5', 'g3', 'Nf6'],
  ['c4', 'e5', 'Nc3', 'Nf6'],
  ['e4', 'd5', 'exd5', 'Qxd5'],
  ['d4', 'f5', 'g3'],
  ['e4', 'Nf6', 'e5', 'Nd5'],
];

const MATERIAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material as seen from White, for the adjudication that neither engine gets a say in. */
function balance(chess) {
  let score = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square) continue;
      score += (square.color === 'w' ? 1 : -1) * MATERIAL[square.type];
    }
  }
  return score;
}

/**
 * One game. Returns 1 if the network's side won, 0 if it lost, 0.5 for a draw.
 *
 * `nnueIsWhite` says which seat the network has, so a caller can play the same opening twice and
 * cancel the first-move advantage exactly rather than on average.
 */
function play(openingMoves, nnueIsWhite) {
  const chess = new Chess();
  for (const move of openingMoves) chess.move(move);

  for (let ply = 0; ply < 300 && !chess.isGameOver(); ply++) {
    const isWhite = chess.turn() === 'w';
    const useNetwork = isWhite === nnueIsWhite;
    const choice = chooseMove(chess, LEVEL, {
      budgetMs: msPerMove,
      useBook: false,
      random: () => 0,
      ...(useNetwork ? { evaluate: withNnue } : {}),
    });
    if (!choice) break;
    chess.move(choice.san);
  }

  if (chess.isCheckmate()) {
    // The side to move is mated, so the other one won.
    const whiteWon = chess.turn() === 'b';
    return whiteWon === nnueIsWhite ? 1 : 0;
  }
  if (chess.isGameOver()) return 0.5;

  /*
   * Ran out of plies. Adjudicated on material by **more than a piece**, and a draw otherwise.
   *
   * Neither engine is asked its opinion. A match adjudicated on the players' own evaluations
   * measures which one is more confident, which is the opposite of what this is for.
   */
  const material = balance(chess);
  if (Math.abs(material) < 4) return 0.5;
  const whiteAhead = material > 0;
  return whiteAhead === nnueIsWhite ? 1 : 0;
}

console.log(`network against hand-written evaluation — ${msPerMove}ms a move, ${pairs * 2} games\n`);

let score = 0;
let wins = 0;
let losses = 0;
let draws = 0;

for (let pair = 0; pair < pairs; pair++) {
  const opening = OPENINGS[pair % OPENINGS.length];
  for (const nnueIsWhite of [true, false]) {
    const result = play(opening, nnueIsWhite);
    score += result;
    if (result === 1) wins++;
    else if (result === 0) losses++;
    else draws++;

    const played = wins + losses + draws;
    process.stdout.write(
      `\r  ${played} games — network ${wins}W ${draws}D ${losses}L, scoring ${((score / played) * 100).toFixed(1)}%   `,
    );
  }
}

const games = wins + losses + draws;
const percent = score / games;

/*
 * The Elo difference the score implies, and an honest interval around it.
 *
 * The standard error of a match score is roughly `sqrt(p(1-p)/n)`, and ±2 of those is a 95%
 * interval. It is printed because a raw "+30 Elo" from sixty games is not a finding — the interval
 * on sixty games is around ±100, and saying so is the difference between a measurement and a claim.
 */
const elo = percent === 0 || percent === 1 ? null : -400 * Math.log10(1 / percent - 1);
const error = Math.sqrt((percent * (1 - percent)) / games);
const low = percent - 2 * error;
const high = percent + 2 * error;
const eloOf = (p) => (p <= 0 || p >= 1 ? null : -400 * Math.log10(1 / p - 1));

console.log('\n');
console.log(`  network scored ${(percent * 100).toFixed(1)}% over ${games} games`);
if (elo !== null) {
  const lowElo = eloOf(low);
  const highElo = eloOf(high);
  console.log(
    `  ${elo > 0 ? '+' : ''}${elo.toFixed(0)} Elo, 95% interval ${lowElo === null ? '−∞' : lowElo.toFixed(0)} to ${
      highElo === null ? '+∞' : highElo.toFixed(0)
    }`,
  );
  if (low < 0.5 && high > 0.5) {
    console.log('  The interval includes 50%, so this match does not show a difference either way.');
  } else if (low > 0.5) {
    console.log('  The interval is entirely above 50%: the network is stronger at this time control.');
  } else {
    console.log('  The interval is entirely below 50%: the hand-written evaluation is stronger here.');
  }
}
