/**
 * The move generator, held to the only standard that means anything: perft.
 *
 * A generator that is fast and subtly wrong is worse than the slow one it replaced, because every
 * number the engine produces afterwards is quietly false. Perft counts every legal move sequence to
 * a given depth, and the counts below have been published and independently reproduced for decades
 * from positions chosen precisely because they break naive implementations — en passant that would
 * expose the king, castling rights lost by a *captured* rook, promotions that give check.
 *
 * Perft can in principle hide two mistakes that cancel out, so it is not the only test here: the
 * generated move list is also compared square-for-square against `chess.js` across thousands of
 * positions reached by random play. `chess.js` is the authority on the rules everywhere else in this
 * project, and this is where the fast board earns the right to disagree with nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  Position,
  moveFrom,
  moveTo,
  movePromotion,
  perft,
  perftDivide,
  squareName,
} from '../src/position.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** "Kiwipete" — the standard second test, dense with castling, pins and en passant. */
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
/** An endgame full of promotions and discovered checks. */
const POSITION_3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
/** Deliberately asymmetric, and the one that catches a wrong promotion-capture. */
const POSITION_4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
/** Known for breaking generators that mishandle castling rights after a rook is taken. */
const POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
/** Steven Edwards's position 6 — a quiet middlegame with a very large tree. */
const POSITION_6 = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';

/**
 * Where the count came from, for anybody checking the numbers rather than trusting them.
 *
 * These are the standard perft results published on the Chess Programming Wiki and reproduced by
 * every engine that has ever been written. They are not our numbers and they are not negotiable: a
 * disagreement here is our bug, every time.
 */
const CASES: [name: string, fen: string, counts: number[]][] = [
  ['the starting position', START, [20, 400, 8902, 197_281, 4_865_609]],
  ['Kiwipete', KIWIPETE, [48, 2039, 97_862, 4_085_603]],
  ['a promotion endgame', POSITION_3, [14, 191, 2812, 43_238, 674_624]],
  ['an asymmetric middlegame', POSITION_4, [6, 264, 9467, 422_333]],
  ['rights lost to a captured rook', POSITION_5, [44, 1486, 62_379, 2_103_487]],
  ['a quiet middlegame', POSITION_6, [46, 2079, 89_890]],
];

for (const [name, fen, counts] of CASES) {
  for (const [index, expected] of counts.entries()) {
    const depth = index + 1;
    test(`perft ${depth} of ${name}`, () => {
      const position = Position.fromFen(fen);
      const actual = perft(position, depth);
      if (actual !== expected) {
        // The divide is what anybody has ever used to find the one move that is wrong. Printing it
        // on failure turns "the number is off by 137" into a first move to look at.
        const divide = [...perftDivide(Position.fromFen(fen), depth)]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([move, total]) => `${move} ${total}`)
          .join('\n');
        assert.fail(`perft(${depth}) = ${actual}, expected ${expected}\n${divide}`);
      }
      assert.equal(position.fen(), fen, 'and the position is put back exactly as it was found');
    });
  }
}

/**
 * How fast it actually is, on whatever machine is running this.
 *
 * The README claims a rate, and a rate is hardware-dependent — so this prints the number *this*
 * machine reaches rather than asserting the one the claim was written from. What it does assert is a
 * **floor**, well below any plausible machine, because the point of this board is speed: the search
 * it replaced managed about six thousand nodes a second on `chess.js`, and anything in that region
 * means something has gone badly wrong rather than that the laptop is slow.
 */
test('⭐ and it is fast enough to be worth having', () => {
  const position = Position.fromFen(KIWIPETE);
  const started = process.hrtime.bigint();
  const nodes = perft(position, 4);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  const rate = nodes / seconds;

  // `toLocaleString` follows the machine's locale and printed `40,85,603` here, which reads as a
  // different number to most of the world. Grouped explicitly instead.
  const grouped = String(nodes).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  console.log(`      ${(rate / 1e6).toFixed(1)} million nodes a second (${grouped} in ${seconds.toFixed(2)}s)`);
  assert.ok(
    rate > 500_000,
    `${Math.round(rate).toLocaleString()} nodes a second — the chess.js search managed about 6,000, so this is a regression rather than a slow machine`,
  );
});

/* ------------------------------------------------------------------ against chess.js */

/** Every legal move from a position, as `e2e4` / `e7e8q`, for comparison with chess.js. */
function ourMoves(position: Position): string[] {
  const buffer = new Int32Array(256);
  const count = position.generate(buffer);
  const moves: string[] = [];
  for (let index = 0; index < count; index++) {
    const move = buffer[index]!;
    if (!position.makeMove(move)) continue;
    position.unmakeMove();
    const promotion = movePromotion(move);
    moves.push(
      squareName(moveFrom(move)) + squareName(moveTo(move)) + (promotion ? ' pnbrqk'[promotion]! : ''),
    );
  }
  return moves.sort();
}

function theirMoves(chess: Chess): string[] {
  return chess
    .moves({ verbose: true })
    .map((move) => move.from + move.to + (move.promotion ?? ''))
    .sort();
}

test('⭐ it agrees with chess.js move for move, over thousands of random positions', () => {
  /*
   * Random play rather than a fixed list, because the positions that break a generator are the ones
   * nobody thought to write down. A seeded generator keeps it reproducible: a failure here must be
   * the same failure tomorrow.
   */
  let seed = 20260907;
  const random = (): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return Math.abs(seed) / 2 ** 31;
  };

  let positions = 0;
  for (let game = 0; game < 60; game++) {
    const chess = new Chess();
    const position = Position.fromFen(chess.fen());

    for (let ply = 0; ply < 60; ply++) {
      const theirs = theirMoves(chess);
      const ours = ourMoves(position);
      assert.deepEqual(ours, theirs, `after ${chess.history().join(' ')}\n${chess.fen()}`);
      positions += 1;

      if (theirs.length === 0 || chess.isGameOver()) break;

      const verbose = chess.moves({ verbose: true });
      const pick = verbose[Math.floor(random() * verbose.length) % verbose.length]!;
      chess.move(pick);

      // The same move on our board, found by from/to/promotion — the only shared language.
      const buffer = new Int32Array(256);
      const count = position.generate(buffer);
      let played = false;
      for (let index = 0; index < count; index++) {
        const move = buffer[index]!;
        if (squareName(moveFrom(move)) !== pick.from) continue;
        if (squareName(moveTo(move)) !== pick.to) continue;
        if ((movePromotion(move) ? ' pnbrqk'[movePromotion(move)] : undefined) !== pick.promotion) continue;
        played = position.makeMove(move);
        break;
      }
      assert.ok(played, `could not play ${pick.san} on the fast board`);
      assert.equal(position.fen(), chess.fen(), `boards diverged after ${pick.san}`);
    }
  }

  assert.ok(positions > 2000, `only ${positions} positions compared`);
});

/* ------------------------------------------------------------------ the hash */

test('the hash is maintained by the moves, not recomputed', () => {
  /*
   * Every make and unmake XORs the hash rather than rebuilding it, and a single missed term — a
   * castling right, an en passant file, the side to move — makes the transposition table return
   * another position's score. That corrupts the search silently and looks like a bad evaluation.
   */
  const position = Position.fromFen(KIWIPETE);
  const buffer = new Int32Array(256);
  const count = position.generate(buffer);

  for (let index = 0; index < count; index++) {
    if (!position.makeMove(buffer[index]!)) continue;

    const incremental = position.key();
    const from = Position.fromFen(position.fen());
    assert.equal(incremental, from.key(), `after ${Position.describe(buffer[index]!)}`);

    position.unmakeMove();
  }
});

test('and unmaking restores it exactly', () => {
  const position = Position.fromFen(KIWIPETE);
  const before = position.key();
  const buffer = new Int32Array(256);
  const count = position.generate(buffer);
  for (let index = 0; index < count; index++) {
    if (!position.makeMove(buffer[index]!)) continue;
    position.unmakeMove();
    assert.equal(position.key(), before);
  }
});

test('a null move passes the turn and takes it back', () => {
  const position = Position.fromFen(KIWIPETE);
  const before = position.fen();
  const key = position.key();
  position.makeNull();
  assert.notEqual(position.key(), key, 'the side to move is part of the hash');
  assert.notEqual(position.turn, Position.fromFen(before).turn);
  position.unmakeNull();
  assert.equal(position.fen(), before);
  assert.equal(position.key(), key);
});

/* ------------------------------------------------------------------ the awkward rules */

test('a king may not castle out of check', () => {
  // e1 is attacked along the file. Castling is legal-looking in every other respect.
  const position = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const attacked = Position.fromFen('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');
  assert.ok(ourMoves(position).includes('e1g1'), 'castling is available when nothing is wrong');
  assert.ok(!ourMoves(attacked).includes('e1g1'), 'castled out of check');
  assert.ok(!ourMoves(attacked).includes('e1c1'), 'castled out of check the other way');
});

test('and not through an attacked square', () => {
  // f1 is attacked, so the king would pass through check on the way to g1.
  const position = Position.fromFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
  assert.ok(!ourMoves(position).includes('e1g1'), 'castled through an attacked square');
  assert.ok(ourMoves(position).includes('e1c1'), 'the other side was still available');
});

test('but b1 being attacked does not stop queen-side castling', () => {
  // The king never stands on b1. Only the rook passes over it, and rooks are not checked.
  const position = Position.fromFen('r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1');
  assert.ok(ourMoves(position).includes('e1c1'));
});

test('⭐ en passant that would expose the king is illegal', () => {
  /*
   * The rule every generator gets wrong, because *two* pawns leave the rank at once and the king is
   * suddenly on an open file with a rook. Nothing else in chess removes two pieces from one line in
   * one move, so nothing else exercises this path.
   */
  const position = Position.fromFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
  assert.ok(!ourMoves(position).includes('e5d6'), 'took en passant into check');
});

test('a rook captured on its home square costs the castling right', () => {
  const position = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const buffer = new Int32Array(256);
  const count = position.generate(buffer);
  for (let index = 0; index < count; index++) {
    const move = buffer[index]!;
    if (squareName(moveFrom(move)) !== 'a1' || squareName(moveTo(move)) !== 'a8') continue;
    assert.ok(position.makeMove(move));
    assert.ok(!position.fen().includes('q'), `black kept the queen-side right: ${position.fen()}`);
    return;
  }
  assert.fail('Rxa8 was never generated');
});

test('a promotion offers all four pieces, not just a queen', () => {
  const position = Position.fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const moves = ourMoves(position);
  for (const promotion of ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']) {
    assert.ok(moves.includes(promotion), `missing ${promotion}`);
  }
});

test('captures-only generation is exactly the captures', () => {
  // The quiescence search leans on this entirely: a "captures" list that quietly included a quiet
  // move would make the engine search forever, and one that dropped en passant would hide a tactic.
  const position = Position.fromFen(KIWIPETE);
  const all = new Int32Array(256);
  const allCount = position.generate(all);
  const loud = new Int32Array(256);
  const loudCount = position.generate(loud, true);

  const captures = new Set<number>();
  for (let index = 0; index < allCount; index++) {
    const move = all[index]!;
    const to = moveTo(move);
    if (position.board[to] !== 0) captures.add(move);
  }

  assert.equal(loudCount, captures.size, 'the two lists are different sizes');
  for (let index = 0; index < loudCount; index++) {
    assert.ok(captures.has(loud[index]!), `${Position.describe(loud[index]!)} is not a capture`);
  }
});

test('a FEN survives the round trip', () => {
  for (const fen of [START, KIWIPETE, POSITION_3, POSITION_4, POSITION_5, POSITION_6]) {
    assert.equal(Position.fromFen(fen).fen(), fen);
  }
});
