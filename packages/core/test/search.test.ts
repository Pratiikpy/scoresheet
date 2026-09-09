/**
 * The search, held to what an engine is actually for: finding the move.
 *
 * Perft in `position.test.ts` proves the *rules* are right. Nothing there would notice a search that
 * returned the wrong move, missed a mate in one, or reported a losing position as won — and each of
 * those is a defect a player sees immediately. So these are positions with a known answer: mates,
 * hanging pieces, forks, and the two failures that are invisible from the outside — a sign error and
 * a budget that is not honoured.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATE_THRESHOLD,
  Position,
  createTable,
  findBestMove,
  mateIn,
  evaluatePosition,
} from '../src/index.ts';

/** Find the best move from a FEN and report it as `e2e4`. */
function best(fen: string, budgetMs = 1000, depth = 30): { move: string; score: number; depth: number } {
  const position = Position.fromFen(fen);
  const result = findBestMove(position, { depth, budgetMs, table: createTable() });
  assert.equal(position.fen(), fen, 'the search left the position where it found it');
  return { move: Position.describe(result.move), score: result.score, depth: result.depth };
}

/* ------------------------------------------------------------------ mates */

test('it plays mate in one', () => {
  const found = best('6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1', 300);
  assert.equal(found.move, 'a1a8');
  assert.equal(mateIn(found.score), 1);
});

test('and it sees a mate in two', () => {
  /*
   * King and rook against a bare king: `Kb6` takes the escape squares away, `Kb8` is forced, `Rh8#`.
   *
   * The point is not the mate but the *number*: without the ply term in the mate score the engine
   * rates every forced mate equally, and an engine that cannot tell a mate in two from a mate in
   * eight shuffles instead of finishing — the single most infuriating thing a weak engine does.
   */
  const found = best('k7/8/2K5/8/8/8/8/7R w - - 0 1', 1500);
  assert.equal(mateIn(found.score), 2, `found ${found.move} at ${found.score}`);
});

test('and it takes the mate in one when there is one', () => {
  const found = best('6k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1', 800);
  assert.equal(found.move, 'c1c8');
  assert.equal(mateIn(found.score), 1);
});

test('and it knows when it is being mated', () => {
  // Black to move, already lost. A search that reported this as equal would be inverting its sign.
  const found = best('R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1', 500);
  assert.ok(found.score < 0, `${found.score}`);
});

/* ------------------------------------------------------------------ material */

test('⭐ it does not take a defended pawn with its queen', () => {
  // The quiescence test. A fixed-depth search that stops mid-exchange scores this as winning a pawn
  // because the recapture is one ply past the horizon.
  const found = best('4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1', 500);
  assert.notEqual(found.move, 'd2d5', 'took a pawn defended by a pawn');
});

test('but it does take a free rook', () => {
  /*
   * The other half, and it needs saying: an engine too timid to take free material is as broken as
   * one that hangs its queen, and a test suite that only ever checks the refusal would never notice.
   *
   * A rook rather than a pawn, and with pawns still on the board, because in a bare king-and-queen
   * ending *everything* wins and the engine is right to prefer whatever mates soonest.
   */
  const found = best('4k3/pppp4/8/3r4/8/8/PPP5/3QK3 w - - 0 1', 800);
  assert.equal(found.move, 'd1d5');
});

test('it wins a hanging queen', () => {
  const found = best('4k3/8/8/8/8/4q3/4R3/4K3 w - - 0 1', 500);
  assert.equal(found.move, 'e2e3');
});

test('and it forks when a fork is there', () => {
  // The knight forks king and rook on c7, and there is nothing better on the board.
  const found = best('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 800);
  assert.equal(found.move, 'd5c7');
});

test('it promotes a pawn that can promote', () => {
  const found = best('8/P6k/8/8/8/8/8/K7 w - - 0 1', 500);
  assert.equal(found.move, 'a7a8q');
});

/* ------------------------------------------------------------------ the evaluation */

test('the starting position is level', () => {
  assert.equal(evaluatePosition(Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')), 0);
});

test('⭐ and the evaluation is from the side to move, both ways', () => {
  /*
   * The sign error that is invisible from the outside: every number still looks plausible, and every
   * judgement is inverted. Checking the same position from both sides is the only way to catch it.
   */
  const white = evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'));
  const black = evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/3QK3 b - - 0 1'));
  assert.ok(white > 800, `a queen up should be worth a queen: ${white}`);
  assert.equal(white, -black);
});

test('a knight in the centre is worth more than one in the corner', () => {
  const centre = evaluatePosition(Position.fromFen('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1'));
  const corner = evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'));
  assert.ok(centre > corner, `${centre} vs ${corner}`);
});

test('the bishop pair is worth something', () => {
  const pair = evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1'));
  const one = evaluatePosition(Position.fromFen('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'));
  const bishop = 330;
  assert.ok(pair - one > bishop, `two bishops should beat one plus a bishop: ${pair} vs ${one}`);
});

test('doubled pawns are worth less than spread ones', () => {
  const doubled = evaluatePosition(Position.fromFen('4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1'));
  const spread = evaluatePosition(Position.fromFen('4k3/8/8/8/8/2P5/3P4/4K3 w - - 0 1'));
  assert.ok(spread > doubled, `${spread} vs ${doubled}`);
});

/* ------------------------------------------------------------------ the promises */

test('⭐ the budget is honoured', () => {
  /*
   * The promise the whole product rests on: the bot answers, always. A search that overran would
   * make the app feel hung at exactly the moment a player is waiting for a reply.
   */
  for (const budget of [50, 200, 600]) {
    const started = Date.now();
    findBestMove(Position.fromFen('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 w - - 0 10'), {
      depth: 30,
      budgetMs: budget,
      table: createTable(),
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < budget + 400, `a ${budget}ms budget took ${elapsed}ms`);
  }
});

test('and even an impossible budget returns a legal move', () => {
  // Depth one is always allowed to finish, so there is no budget so small that the engine plays
  // whichever move happened to be generated first.
  const found = best('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 w - - 0 10', 1);
  assert.match(found.move, /^[a-h][1-8][a-h][1-8]$/);
  assert.ok(found.depth >= 1);
});

test('more time is never worse', () => {
  /*
   * Not a strict inequality — a deeper search can legitimately revise a score downward when it sees
   * further. What must hold is that it keeps searching: a budget that bought no extra depth would
   * mean iterative deepening or the transposition table had stopped working.
   */
  const fen = 'r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 w - - 0 10';
  const quick = best(fen, 100);
  const slow = best(fen, 800);
  assert.ok(slow.depth > quick.depth, `${slow.depth} was not deeper than ${quick.depth}`);
});

test('a position with no moves is reported rather than crashed into', () => {
  const mated = Position.fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  const result = findBestMove(mated, { depth: 5, budgetMs: 200, table: createTable() });
  assert.equal(result.move, 0);
  assert.ok(result.score <= -MATE_THRESHOLD, `${result.score}`);
});

test('a stalemate is a draw, not a loss', () => {
  const drawn = Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const result = findBestMove(drawn, { depth: 5, budgetMs: 200, table: createTable() });
  assert.equal(result.move, 0);
  assert.equal(result.score, 0);
});

test('the root is ranked, so a weak level has a second-best move to play', () => {
  const position = Position.fromFen('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 w - - 0 10');
  const result = findBestMove(position, { depth: 6, budgetMs: 500, table: createTable() });
  assert.ok(result.ranked.length > 20, `${result.ranked.length} root moves`);
  assert.equal(result.ranked[0]!.move, result.move, 'the best move is the top of the ranking');
  for (let index = 1; index < result.ranked.length; index++) {
    assert.ok(
      result.ranked[index - 1]!.score >= result.ranked[index]!.score,
      'the ranking is not sorted',
    );
  }
});

test('a shared table makes a related position faster, not wrong', () => {
  /*
   * Analysis reuses one table across a whole game, which is the largest saving available. The risk
   * is a stale entry answering for the wrong position — so the same search is run twice, once with a
   * table warmed on a *different* position, and the answer must not change.
   */
  const fen = '4k3/8/8/8/8/4q3/4R3/4K3 w - - 0 1';
  const table = createTable();
  findBestMove(Position.fromFen('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 w - - 0 10'), {
    depth: 6, budgetMs: 300, table,
  });
  const warm = findBestMove(Position.fromFen(fen), { depth: 8, budgetMs: 300, table });
  const cold = findBestMove(Position.fromFen(fen), { depth: 8, budgetMs: 300, table: createTable() });
  assert.equal(Position.describe(warm.move), Position.describe(cold.move));
});

test('it reports the line it expects, and the line is playable', () => {
  const position = Position.fromFen('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 w - - 0 10');
  const result = findBestMove(position, { depth: 8, budgetMs: 600, table: createTable() });
  assert.ok(result.line.length >= 2, `${result.line.length} moves of line`);
  for (const move of result.line) {
    assert.ok(position.makeMove(move), `${Position.describe(move)} was not legal in the line`);
  }
  for (const _ of result.line) position.unmakeMove();
});

test('mateIn reads a score the way a person would', () => {
  assert.equal(mateIn(0), null);
  assert.equal(mateIn(500), null);
  assert.equal(mateIn(1_000_000 - 1), 1);
  assert.equal(mateIn(1_000_000 - 3), 2);
  assert.equal(mateIn(-(1_000_000 - 3)), -2);
});


/*
 * ## Quiescence, while in check — and an honest note about what these three tests prove
 *
 * Quiescence stands pat: it takes the static evaluation as a floor, on the reasoning that the side
 * to move could always decline to capture. **While in check that reasoning is false** — the check
 * must be answered — and the generator was asked for captures only, so a position whose only
 * escapes were a king step or an interposition produced no legal moves at all and was scored as
 * though the side to move could pass. That was the code until 8 September 2026, and the in-check
 * guard added that day is the fix.
 *
 * **These tests do not demonstrate the bug.** They were written to, and they were then run against
 * the pre-fix code, and all three passed there too. The reason is `search()`'s own check extension:
 * a checking move is searched a ply deeper, so a checked position is rarely the one handed to
 * quiescence in the first place, and the constructed positions below never reach the broken path.
 * They are kept because the properties are worth pinning regardless — but calling them regression
 * tests for that fix would be a claim the evidence does not support.
 *
 * What the fix is actually justified by: soundness, which is a reading of the code rather than a
 * measurement, plus `scripts/quiescence-ab.mjs`, which is deterministic and found mate recognition
 * on 400 `mateIn*` puzzles rising from 389 to 395 at depth 2 while staying level at depth 3 and 5,
 * for 4-9% fewer nodes. Depth 2 is not hypothetical: two shipped bot levels search at depth 1 and 3.
 *
 * All three are written with the clock frozen (`now: () => 0`), so they measure the code and never
 * the machine. A time-budgeted assertion passes or fails on what else the laptop is doing, which is
 * exactly why `scripts/strength.mjs` cannot settle a question like this one.
 */

/** A fixed-depth search with the clock stopped, so the result is a property of the code alone. */
function exact(fen: string, depth: number): { move: string; score: number } {
  const position = Position.fromFen(fen);
  const result = findBestMove(position, {
    depth,
    budgetMs: Number.MAX_SAFE_INTEGER,
    table: createTable(),
    now: () => 0,
  });
  return { move: Position.describe(result.move), score: result.score };
}

test('a mate is still a mate when the escape square is quiet, not a capture', () => {
  // Back-rank mate: Ra8# is answered by nothing, and no capture is available to either side, so a
  // quiescence that generated captures only would find no move and report the static evaluation.
  const { score } = exact('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 2);
  assert.ok(score >= MATE_THRESHOLD, `expected a mate score, got ${score}`);
  assert.equal(mateIn(score), 1);
});

test('being in check is never scored as though the side to move could pass', () => {
  // Black is in check from the rook and every legal reply is a quiet king move — no captures exist.
  // Standing pat here would hand back a material count that ignores the check entirely.
  const position = Position.fromFen('4k3/8/8/8/8/8/8/4RK2 b - - 0 1');
  const result = findBestMove(position, {
    depth: 3,
    budgetMs: Number.MAX_SAFE_INTEGER,
    table: createTable(),
    now: () => 0,
  });
  assert.notEqual(result.move, 0, 'a legal escape exists and must be found');
  const chosen = Position.describe(result.move);
  assert.ok(chosen.startsWith('e8'), `expected a king move, got ${chosen}`);
});

test('the same position searched twice with the clock frozen gives the same answer', () => {
  // The guard on every measurement in this repo: `scripts/strength.mjs` is time-budgeted and two
  // runs of it disagree, which is why a search change is judged with a frozen clock instead.
  const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  const first = exact(fen, 4);
  const second = exact(fen, 4);
  assert.deepEqual(first, second);
});
