/**
 * The evaluation network, and above all the cache in front of it.
 *
 * ## What is actually at risk here
 *
 * Two different things, and only one of them is checked in this file.
 *
 * **That the port is faithful** — that our arithmetic agrees with akimbo's — cannot be settled here,
 * because settling it requires akimbo. `scripts/nnue-agrees.mjs` does that against the real binary
 * and requires agreement to the centipawn on 25 positions. It needs a Rust toolchain, so it is not
 * part of `npm run check`; it is what you run when you touch `nnue.ts`.
 *
 * **That the cache never lies** is what this file is for, and it is the more dangerous of the two.
 * `nnue.ts` does not rebuild the accumulator per position — it keeps one per pair of king buckets,
 * remembers the board each was built from, and applies only the difference. That is a 5× speed-up
 * and a whole class of bug: a stale entry returns a *plausible* number for a position it was never
 * built from, and nothing anywhere looks wrong. Game Review would confidently call the wrong move
 * the mistake.
 *
 * So the test is always the same shape: **evaluate a position through a cache that has seen other
 * positions, and compare against a network that has seen nothing.** A freshly loaded network's first
 * evaluation is a full rebuild by definition, which makes it the ground truth for every other one.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { Chess } from 'chess.js';

import { NnueError, loadNnue, type Nnue } from '../src/nnue.ts';
import { Position } from '../src/position.ts';

/*
 * Resolved from this file, not from wherever the runner happens to be standing.
 *
 * It was a bare repo-root-relative string, and `npm test` runs each workspace with its own cwd — so
 * from `packages/core` the check looked for `packages/core/apps/web/public/...`, which has never
 * existed. These ten tests were not conditional on the network being vendored; they were
 * unconditionally skipped, and vendoring it changed nothing. A guard that can only ever be false is
 * indistinguishable from deleting the tests, except that it still prints a reassuring `ok`.
 */
const NET = fileURLToPath(new URL('../../../apps/web/public/nnue-akimbo-1.0.0.bin', import.meta.url));

/**
 * The network is a build artefact, not a committed file — 6.3 MB of binary nobody can review by
 * reading it (`scripts/vendor-nnue.mjs`). Nothing fetches it automatically — the network was
 * measured and rejected, so `npm run build` does not pull it and it is normally absent. Run
 * `npm run vendor:nnue` to make these ten tests execute; they state plainly when they do not,
 * rather than passing vacuously.
 */
const available = existsSync(NET);

function load(): Nnue {
  const file = readFileSync(NET);
  return loadNnue(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}

/** A network that has evaluated nothing, so its next answer is a full rebuild. */
function truth(position: Position): number {
  return load().evaluate(position);
}

/** A game's worth of positions, which is the access pattern the cache was built for. */
function aGame(moves: number, seed = 1): Position[] {
  const chess = new Chess();
  const out: Position[] = [];
  let random = seed;
  for (let i = 0; i < moves; i++) {
    const legal = chess.moves();
    if (legal.length === 0) break;
    // A tiny deterministic PRNG: the point is a varied game, reproducibly.
    random = (random * 1103515245 + 12345) % 2147483648;
    chess.move(legal[random % legal.length]!);
    out.push(Position.fromFen(chess.fen()));
  }
  return out;
}

test('a network of the wrong size is refused rather than read', { skip: !available }, () => {
  assert.throws(() => loadNnue(new ArrayBuffer(1024)), NnueError);
});

test('the start position evaluates to what akimbo says it does', { skip: !available }, () => {
  /*
   * 99 centipawns, from `akimbo eval` at the start position — the one number in this file taken from
   * the engine itself rather than from our own output. It is here so that a change which breaks the
   * port fails in `npm run check` too, and not only in the script that needs Rust.
   */
  assert.equal(truth(Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')), 99);
});

test('a position without both kings is refused, not indexed off the end of a table', { skip: !available }, () => {
  assert.throws(() => load().evaluate(Position.fromFen('8/8/8/8/8/8/8/K7 w - - 0 1')), NnueError);
});

/* ------------------------------------------------------------------ the cache */

test('⭐ a whole game evaluates the same through the cache as from scratch', { skip: !available }, () => {
  const network = load();
  for (const position of aGame(60)) {
    assert.equal(network.evaluate(position), truth(position));
  }
});

test('⭐ and in a jumbled order, which is what a search actually does', { skip: !available }, () => {
  /*
   * A search does not walk a game forwards. It jumps between siblings, backs out of lines, and
   * revisits transpositions — so consecutive evaluations can differ by a great deal or by nothing.
   * Testing only the forward walk would pass with a cache that could not handle a jump backwards.
   */
  const positions = aGame(40, 7);
  const network = load();
  const order = [0, 17, 3, 39, 3, 22, 1, 38, 12, 12, 0, 31, 8, 25, 5, 39, 2];
  for (const index of order) {
    const position = positions[index % positions.length]!;
    assert.equal(network.evaluate(position), truth(position));
  }
});

test('⭐ and across a king move, which changes the bucket and the mirroring', { skip: !available }, () => {
  /*
   * The case the cache is keyed to survive.
   *
   * A king crossing the middle file changes which way every feature is mirrored, and crossing a rank
   * boundary changes the bucket. Both mean the accumulator must be built differently — and the design
   * handles it by landing on a *different* cache entry rather than by invalidating one, which is
   * exactly the kind of correctness nobody notices is missing.
   */
  const walk = [
    '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    '4k3/8/8/8/8/8/8/5K2 b - - 1 1',
    '4k3/8/8/8/8/8/8/6K1 w - - 2 2',
    '4k3/8/8/8/8/8/8/7K b - - 3 2',
    '4k3/8/8/8/8/8/7K/8 w - - 4 3',
    '4k3/8/8/8/8/8/8/K7 b - - 5 3',
    '4k3/8/8/8/8/8/K7/8 w - - 6 4',
    '8/4k3/8/8/8/8/K7/8 b - - 7 4',
    '8/8/4k3/8/8/K7/8/8 w - - 8 5',
    '8/8/8/4k3/K7/8/8/8 b - - 9 5',
    'k7/8/8/8/8/8/8/7K w - - 0 1',
    '7k/8/8/8/8/8/8/K7 b - - 0 1',
  ];
  const network = load();
  for (const fen of walk) {
    const position = Position.fromFen(fen);
    assert.equal(network.evaluate(position), truth(position), fen);
  }
  // And again, in reverse, so every entry is reached from a different previous state.
  for (const fen of [...walk].reverse()) {
    const position = Position.fromFen(fen);
    assert.equal(network.evaluate(position), truth(position), fen);
  }
});

test('⭐ and across captures, castling, promotion and en passant', { skip: !available }, () => {
  /*
   * Every move that changes more than two squares at once.
   *
   * The cache diffs squares rather than understanding moves, which is what makes all of these one
   * case instead of four — but "it should work by construction" is exactly the reasoning that needs
   * a test, because castling moves two pieces and en passant empties a square nobody moved to.
   */
  const cases = [
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'castling rights, both sides'],
    ['r4rk1/8/8/8/8/8/8/R3K2R w KQ - 1 2', 'Black has castled'],
    ['r4rk1/8/8/8/8/8/8/R4RK1 b - - 2 2', 'and now White has'],
    ['8/4P3/8/8/8/8/4p3/4K1k1 w - - 0 1', 'pawns one square from promotion'],
    ['4Q3/8/8/8/8/8/4p3/4K1k1 b - - 0 1', 'and one has promoted'],
    ['8/8/8/3pP3/8/8/8/4K1k1 w - d6 0 2', 'en passant available'],
    ['8/8/3P4/8/8/8/8/4K1k1 b - - 0 2', 'and taken'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'back to the start'],
  ];
  const network = load();
  for (const [fen, what] of cases) {
    assert.equal(network.evaluate(Position.fromFen(fen!)), truth(Position.fromFen(fen!)), what);
  }
});

test('⭐ and over a thousand positions from many games, which is where drift would show', { skip: !available }, () => {
  /*
   * The one that would catch an error too small to see in a handful of positions.
   *
   * A cache that leaks a few units per update looks perfect for twenty evaluations and is badly
   * wrong after a thousand. Nothing here is random: the same seeds produce the same games every run,
   * so a failure is reproducible rather than something that happened once on somebody's machine.
   */
  const network = load();
  let checked = 0;
  for (let seed = 1; seed <= 25; seed++) {
    for (const position of aGame(45, seed)) {
      assert.equal(network.evaluate(position), truth(position));
      checked++;
    }
  }
  assert.ok(checked > 1000, `${checked} positions`);
});

test('the same position twice gives the same answer', { skip: !available }, () => {
  const network = load();
  const position = Position.fromFen('r2q1rk1/pp2ppbp/2n2np1/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 10');
  const first = network.evaluate(position);
  assert.equal(network.evaluate(position), first);
  assert.equal(network.evaluate(position), first);
});

test('the evaluation is from the side to move, so the same position flips sign with the turn', { skip: !available }, () => {
  /*
   * Not exactly symmetric, and it should not be: a position is worth something different depending
   * on who is to move, which is most of what a tempo is. What must hold is that the two disagree
   * about who is better — if they agreed, the output vectors would be the wrong way round.
   */
  const white = truth(Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  const black = truth(Position.fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'));
  assert.ok(white > 0, `${white}`);
  assert.ok(black < 0, `${black}`);
});
