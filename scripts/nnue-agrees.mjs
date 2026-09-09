/**
 * Prove the network port is faithful, by asking the engine it was ported from.
 *
 * `packages/core/src/nnue.ts` reads akimbo v1.0.0's network. Every constant in it — the king-bucket
 * table, the file mirroring, where each truncating division falls — was read out of akimbo's own
 * source, and reading source carefully is not evidence. A port that is subtly wrong does not crash:
 * it returns a plausible number for every position and is wrong about which move was the mistake,
 * which is the one thing Game Review exists to say.
 *
 * So this runs the same positions through **the real akimbo binary** and through our TypeScript, and
 * requires them to agree **exactly**. The arithmetic is integer end to end, so there is no rounding
 * to allow for: a single centipawn of difference means a real difference in the code, and the script
 * fails rather than reporting a tolerance.
 *
 * ## Running it
 *
 * It needs akimbo built, which needs Rust, so it is **not** part of `npm run check` — a suite that
 * fails on a machine without a Rust toolchain is a suite people learn to ignore. It is the thing you
 * run when you touch `nnue.ts`, and its result is quoted in `README.md`.
 *
 *   git clone --depth 1 --branch v1.0.0 https://github.com/jw1912/akimbo
 *   cd akimbo && EVALFILE=resources/net.bin cargo build --release
 *   node scripts/nnue-agrees.mjs <path-to-akimbo-binary>
 *
 * ## Which positions
 *
 * Positions from real games rather than made-up ones, plus every structurally interesting case the
 * indexing could get wrong: kings on both wings (the file mirroring), kings on every rank (the
 * bucket table), lone kings and heavy middlegames (the material scaling), and both sides to move
 * (the side-relative output). A suite of quiet middlegames would pass with the mirroring inverted.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const binary = process.argv[2];
if (!binary) {
  console.error('usage: node scripts/nnue-agrees.mjs <path-to-akimbo-binary>');
  process.exit(2);
}

const { Position } = await import('../packages/core/src/position.ts');
const { loadNnue } = await import('../packages/core/src/nnue.ts');

const file = readFileSync('apps/web/public/nnue-akimbo-1.0.0.bin');
const nnue = loadNnue(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

/**
 * The positions, chosen for what they could break rather than for looking like chess.
 *
 * The comment on each says which part of the indexing it exercises, because a suite whose coverage
 * is not written down is a suite that stops covering things.
 */
const POSITIONS = [
  // The ordinary case, and the number a person can check by hand against `eval` at startpos.
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'the start position'],
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 'and with Black to move'],

  // Both kings castled kingside: the file mirroring fires for both perspectives at once.
  ['r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 6 6', 'both kings mirrored'],
  // White castled, Black queenside: the two perspectives mirror differently, which is the case a
  // port gets wrong by mirroring once and applying it to both.
  ['2kr1bnr/pppq1ppp/2np4/4p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 8', 'one king mirrored, one not'],
  ['2kr1bnr/pppq1ppp/2np4/4p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 0 8', 'the same, other side to move'],

  // Kings on ranks 1 through 8: every row of the bucket table, which a startpos-only test never reads.
  ['8/8/8/8/8/8/4k3/4K3 w - - 0 1', 'kings on the first two ranks'],
  ['8/4k3/8/8/8/8/8/4K3 w - - 0 1', 'a king on the seventh'],
  ['4k3/8/8/8/8/8/8/4K3 b - - 0 1', 'kings on the back ranks, Black to move'],
  ['8/8/3k4/8/8/4K3/8/8 w - - 0 1', 'kings in the middle'],
  ['7k/8/8/8/8/8/8/K7 w - - 0 1', 'kings in opposite corners'],
  ['k7/8/8/8/8/8/8/7K b - - 0 1', 'and the mirror of that'],

  // Material scaling: the factor is 700 + material/32, so these three should not merely differ in
  // sign but in how much the network's opinion is worth.
  ['4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'a king and pawn ending'],
  ['3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'queens only'],
  ['r2q1rk1/pp2ppbp/2n2np1/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 10', 'a full middlegame'],

  // Real positions from real games, which is what Game Review actually sees.
  ['r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', 'the Italian'],
  ['rnbqkb1r/pp3ppp/4pn2/2pp4/2PP4/5NP1/PP2PPBP/RNBQK2R w KQkq - 0 5', 'a Catalan'],
  ['r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5', 'a Giuoco Piano'],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 'a rook ending, Kb5'],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 'Kiwipete'],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 0 1', 'and the same with Black to move'],

  // Promotion-heavy and lopsided positions: large evaluations, where a truncating division that
  // rounds the wrong way for negatives would show up.
  ['8/PPPk4/8/8/8/8/4Kppp/8 w - - 0 1', 'pawns about to promote, both sides'],
  ['8/PPPk4/8/8/8/8/4Kppp/8 b - - 0 1', 'the same, Black to move'],
  ['rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', "before Fool's Mate"],
  ['q6k/8/8/8/8/8/8/K7 w - - 0 1', 'a hopeless position for the side to move'],
  ['Q6K/8/8/8/8/8/8/k7 b - - 0 1', 'and its mirror'],
];

/** Ask the real engine, one position at a time, through its own UCI interface. */
async function akimboEvals(fens) {
  const engine = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  engine.stdout.on('data', (chunk) => {
    out += String(chunk);
  });

  for (const fen of fens) engine.stdin.write(`position fen ${fen}\neval\n`);
  engine.stdin.write('quit\n');

  await new Promise((resolve) => engine.on('close', resolve));

  const found = [...out.matchAll(/eval: (-?\d+)cp/g)].map((match) => Number(match[1]));
  if (found.length !== fens.length) {
    console.error(`asked for ${fens.length} evaluations and got ${found.length}`);
    process.exit(1);
  }
  return found;
}

const fens = POSITIONS.map(([fen]) => fen);
const theirs = await akimboEvals(fens);

let disagreements = 0;
console.log('position'.padEnd(42) + 'akimbo'.padStart(8) + 'ours'.padStart(8));

for (const [index, [fen, what]] of POSITIONS.entries()) {
  const ours = nnue.evaluate(Position.fromFen(fen));
  const them = theirs[index];
  const same = ours === them;
  if (!same) disagreements++;
  console.log(
    `${same ? '  ' : '✗ '}${what}`.padEnd(42) + String(them).padStart(8) + String(ours).padStart(8),
  );
}

console.log('');
if (disagreements === 0) {
  console.log(`all ${POSITIONS.length} positions agree with akimbo v1.0.0, exactly`);
} else {
  console.log(`${disagreements} of ${POSITIONS.length} positions disagree — the port is not faithful`);
  process.exit(1);
}
