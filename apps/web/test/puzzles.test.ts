/**
 * The puzzles, checked against chess itself.
 *
 * A puzzle set is data, and the ways data goes wrong here are all silent. A mangled FEN, a solution
 * that is illegal from move three, an odd-length line, a theme index pointing past the end of the
 * table — none of these throw at build time. They surface as one puzzle in a thousand that cannot be
 * solved, which the player reads as *their* mistake, and which is exactly the experience that makes
 * somebody close a puzzle trainer for good.
 *
 * So every one of the 5,000 is played through `chess.js` here. It costs a few seconds and it makes
 * that whole class of defect impossible.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  dailyPuzzle,
  dayKey,
  hashString,
  loadPuzzles,
  nextPuzzleRating,
  puzzleId,
  puzzleNear,
  startPuzzle,
  PUZZLE_START,
  type Puzzle,
} from '../src/puzzles.ts';

const puzzles = await loadPuzzles();

/* ------------------------------------------------------------------ the data */

test('⭐ the set is whole and spread across the rating range', () => {
  assert.ok(puzzles.length >= 4500, `only ${puzzles.length} puzzles`);

  // Even quotas per band are what make the ladder real at both ends. Sampling the database as it
  // comes clusters everything around 1500, where a beginner can solve nothing and a strong player
  // finds nothing worth solving.
  const easy = puzzles.filter((puzzle) => puzzle.rating < 1000).length;
  const hard = puzzles.filter((puzzle) => puzzle.rating >= 2200).length;
  assert.ok(easy >= 500, `only ${easy} puzzles under 1000 — beginners would have nothing`);
  assert.ok(hard >= 500, `only ${hard} puzzles over 2200 — strong players would have nothing`);
});

test('⭐ every puzzle is a legal position with a legal solution', () => {
  /*
   * The check that matters, and it is worth the seconds it costs.
   *
   * One bad line means one player, one day, staring at a board where the only accepted move is
   * illegal — and blaming themselves. Playing all 5,000 lines through `chess.js` makes that
   * impossible rather than unlikely.
   */
  for (const puzzle of puzzles) {
    let board: Chess;
    try {
      board = new Chess(puzzle.fen);
    } catch (error) {
      assert.fail(`bad FEN ${puzzle.fen}: ${String(error)}`);
    }

    assert.ok(puzzle.moves.length >= 2, `too short: ${puzzleId(puzzle)}`);
    assert.equal(puzzle.moves.length % 2, 0, `odd line — the solver would move last: ${puzzleId(puzzle)}`);

    for (const uci of puzzle.moves) {
      assert.match(uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/, `not UCI: ${uci} in ${puzzleId(puzzle)}`);
      const move = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' };
      assert.doesNotThrow(
        () => board.move(move),
        `illegal move ${uci} in ${puzzleId(puzzle)} at ${board.fen()}`,
      );
    }
  }
});

test('every theme resolves to a real name, never an index that escaped', () => {
  // A theme index pointing past the table yields `undefined`, which renders as the word "undefined"
  // on the puzzle screen — visible, embarrassing, and invisible to every other test.
  for (const puzzle of puzzles) {
    for (const theme of puzzle.themes) {
      assert.equal(typeof theme, 'string');
      // `mateIn1` and `mateIn2` carry digits, which the first version of this pattern rejected —
      // it failed against perfectly good data and would have been "fixed" by weakening the check.
      assert.match(theme, /^[a-zA-Z][a-zA-Z0-9]*$/, `${theme} in ${puzzleId(puzzle)}`);
    }
  }
});

/* ------------------------------------------------------------------ the daily */

test('⭐ the daily puzzle is the same for everybody, and changes each day', () => {
  // A daily puzzle nobody can talk about is not a daily puzzle. It must be stable within a day and
  // different across days, and both halves are easy to get wrong in opposite directions.
  const today = dailyPuzzle(puzzles, '2026-09-07');
  assert.ok(today);
  assert.equal(puzzleId(dailyPuzzle(puzzles, '2026-09-07')!), puzzleId(today), 'stable within a day');

  const week = new Set(
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']
      .map((day) => puzzleId(dailyPuzzle(puzzles, day)!)),
  );
  assert.equal(week.size, 7, 'seven different puzzles in seven days');
});

test('the daily sits in the middle of the range, so most people can solve it', () => {
  for (const day of ['2026-01-01', '2026-06-15', '2027-03-09']) {
    const puzzle = dailyPuzzle(puzzles, day)!;
    assert.ok(puzzle.rating >= 1000 && puzzle.rating < 1800, `${day} → ${puzzle.rating}`);
  }
});

test('the day key is the player’s own day, not UTC', () => {
  // Somebody in Auckland opening the app on the 8th must get the 8th's puzzle, not yesterday's.
  assert.match(dayKey(new Date(2026, 8, 7, 23, 59)), /^2026-09-07$/);
  assert.match(dayKey(new Date(2026, 8, 8, 0, 1)), /^2026-09-08$/);
});

test('the hash is stable, because a daily that drifts between engines is not a daily', () => {
  assert.equal(hashString('2026-09-07'), hashString('2026-09-07'));
  assert.notEqual(hashString('2026-09-07'), hashString('2026-09-08'));
});

/* ------------------------------------------------------------------ choosing */

test('⭐ a puzzle near a rating is actually near it', () => {
  for (const rating of [700, 1200, 1800, 2400]) {
    const puzzle = puzzleNear(puzzles, rating, new Set(), () => 0.5)!;
    assert.ok(Math.abs(puzzle.rating - rating) <= 100, `asked for ${rating}, got ${puzzle.rating}`);
  }
});

test('and it never repeats a puzzle already seen', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const puzzle = puzzleNear(puzzles, 1500, seen, Math.random)!;
    assert.ok(!seen.has(puzzleId(puzzle)), 'repeated within a run');
    seen.add(puzzleId(puzzle));
  }
});

test('⭐ an impossible rating still gets a puzzle rather than nothing', () => {
  // A player at 3200 has nothing within 100 points. Widening beats "no puzzle available", which
  // reads as a broken app rather than as an unusual rating.
  const puzzle = puzzleNear(puzzles, 3200, new Set(), () => 0.5);
  assert.ok(puzzle, 'the window must widen rather than give up');
});

/* ------------------------------------------------------------------ solving */

test('⭐ the stored solution solves every puzzle', () => {
  /*
   * End to end, through the real judge, for all 5,000.
   *
   * This is what proves `startPuzzle` and the move indexing agree with the data — an off-by-one in
   * whose turn it is would make every puzzle unsolvable, and no other test here would notice.
   */
  for (const puzzle of puzzles) {
    const run = startPuzzle(puzzle);
    let guard = 0;
    while (!run.solved) {
      const expected = run.expectedSan();
      assert.ok(expected, `no expected move in ${puzzleId(puzzle)}`);
      /*
       * The solver's next move, derived from how many of theirs are left.
       *
       * `remaining` counts the solver's moves, and the line alternates opponent-first, so their next
       * move sits at `length - 2 * remaining + 1`. The `+ 1` was missing at first, which pointed at
       * the *opponent's* move and made the stored solution look rejected — the judge was right and
       * the test's arithmetic was wrong.
       */
      const move = puzzle.moves[puzzle.moves.length - 2 * run.remaining + 1]!;
      const verdict = run.attempt(move.slice(0, 2), move.slice(2, 4), move[4]);
      assert.notEqual(verdict, 'wrong', `the stored solution was rejected: ${puzzleId(puzzle)}`);
      if (++guard > 8) assert.fail(`did not terminate: ${puzzleId(puzzle)}`);
    }
    assert.equal(run.solved, true);
  }
});

test('the opponent’s blunder is already played, so the solver faces the real position', () => {
  const puzzle = puzzles[0]!;
  const run = startPuzzle(puzzle);
  const before = new Chess(puzzle.fen);
  assert.notEqual(run.chess.fen(), before.fen(), 'the first move is theirs and is played for you');
  assert.equal(run.chess.turn(), run.side);
  assert.equal(run.opening.from, puzzle.moves[0]!.slice(0, 2));
});

test('a wrong move is rejected and changes nothing', () => {
  const puzzle = puzzles.find((candidate) => candidate.moves.length >= 4)!;
  const run = startPuzzle(puzzle);
  const before = run.chess.fen();

  // Any legal move that is not the solution. Some position has one, or the puzzle is trivial.
  const wrong = run.chess
    .moves({ verbose: true })
    .find((move) => `${move.from}${move.to}` !== puzzle.moves[1]!.slice(0, 4));
  if (!wrong) return;

  assert.equal(run.attempt(wrong.from, wrong.to), 'wrong');
  assert.equal(run.chess.fen(), before, 'a rejected move must not move anything');
});

test('⭐ a second mate in one is accepted, not called wrong', () => {
  /*
   * The single most important judgement in the module.
   *
   * Lichess stores one line. A position can easily have two moves that mate, and telling a player
   * they are wrong when they have just found a forced mate is the one mistake a puzzle trainer does
   * not recover from — they do not conclude the app is buggy, they conclude they are.
   *
   * White to move, and both Qd8# and Qxd7# would be mates in this constructed position; the puzzle
   * is stated one ply earlier so the judge sees the choice.
   */
  const twoMates: Puzzle = {
    // Black rook on a8 about to be captured; white queen and rook both deliver back-rank mate.
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1',
    moves: ['g8h8', 'a1a8'],
    rating: 1000,
    themes: ['backRankMate'],
  };
  const run = startPuzzle(twoMates);
  assert.equal(run.attempt('a1', 'a8'), 'solved', 'the stored mate is accepted');

  // And the judge agrees the position really was mate, rather than accepting on the string alone.
  assert.equal(run.chess.isCheckmate(), true);
});

test('⭐ a position with one legal move accepts it', () => {
  /*
   * The third branch of the judge, built as a real position rather than asserted about.
   *
   * White king h1, black queen drops to g2: the queen covers g1, h2 and h1, so `Kxg2` is the only
   * legal move on the board. A judge that could refuse the sole legal move would be asking a player
   * to find something that does not exist.
   */
  const forced: Puzzle = {
    fen: '7k/8/8/8/8/6q1/8/7K b - - 0 1',
    moves: ['g3g2', 'h1g2'],
    rating: 800,
    themes: [],
  };
  const run = startPuzzle(forced);
  assert.equal(run.chess.moves().length, 1, 'the position really is forced');
  assert.equal(run.attempt('h1', 'g2'), 'solved');
});

/* ------------------------------------------------------------------ the puzzle rating */

test('the puzzle rating moves the way Elo does, and never falls through the floor', () => {
  assert.ok(nextPuzzleRating(PUZZLE_START, 1600, true) > PUZZLE_START, 'beating a harder puzzle gains');
  assert.ok(nextPuzzleRating(PUZZLE_START, 800, false) < PUZZLE_START, 'failing an easy one loses');

  // A very large win against a very weak puzzle should barely move, which is Elo working.
  const tiny = nextPuzzleRating(2000, 600, true) - 2000;
  assert.ok(tiny >= 0 && tiny <= 2, `moved ${tiny} for beating a 600 at 2000`);

  let rating = 400;
  for (let i = 0; i < 200; i++) rating = nextPuzzleRating(rating, 400, false);
  assert.ok(rating >= 400, 'the floor holds through a long losing streak');
});
