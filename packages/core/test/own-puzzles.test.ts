/**
 * Own-blunder puzzles — tested for what they **refuse**, which is the whole design.
 *
 * Turning a mistake into a puzzle is easy and half a dozen products already do it. The hard half,
 * which none of them publish, is deciding which mistakes are *allowed* to become puzzles: a position
 * with two equally good answers marks a player wrong for finding one of them, and that is worse than
 * having no feature at all.
 *
 * So most of this file asserts that a candidate is thrown out, and each refusal names its reason —
 * a generator that quietly drops nine mistakes in ten is indistinguishable from a broken one, and
 * only the reasons tell them apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  asPuzzle,
  MARGIN_CAP,
  MATE,
  MIN_MISTAKE_COST,
  MIN_UNIQUE_MARGIN,
  alreadyQueued,
  considerMistake,
  queueOrder,
  stillSound,
  type OwnPuzzle,
} from '../src/index.ts';

/** A position where White has a clean, forcing, uniquely best capture: Qxd8 wins the queen. */
const TACTIC = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1';
/** One move earlier: Black's queen steps to d8 and walks into it. */
const SETUP = '4k3/3q4/8/8/8/8/8/3QK3 b - - 0 1';

function candidate(overrides: Partial<Parameters<typeof considerMistake>[0]> = {}) {
  return considerMistake({
    fen: TACTIC,
    setupFen: SETUP,
    setupUci: 'd7d8',
    played: 'Ke2',
    ranked: [
      { san: 'Qxd8+', score: 900 },
      { san: 'Qd7+', score: 100 },
      { san: 'Ke2', score: 0 },
    ],
    cost: 400,
    fromBlock: 4_100_000,
    gameId: 'a'.repeat(32),
    ...overrides,
  });
}

/* ------------------------------------------------------------------ what is accepted */

test('a big, unique, forcing mistake becomes a puzzle', () => {
  const { puzzle, refused } = candidate();
  assert.equal(refused, null);
  assert.ok(puzzle);
  assert.equal(puzzle.answer, 'Qxd8+');
  assert.equal(puzzle.played, 'Ke2');
  assert.equal(puzzle.margin, 800);
});

/* ------------------------------------------------------------------ what is refused */

test('⭐ a position with two nearly equal answers is refused, because it is a trick question', () => {
  // The gate that matters most, and the one every naive implementation skips. If the runner-up is
  // nearly as good, a player who finds it is marked wrong for being right.
  const { puzzle, refused } = candidate({
    ranked: [
      { san: 'Qxd8+', score: 900 },
      { san: 'Qd7+', score: 850 },
    ],
  });
  assert.equal(puzzle, null);
  assert.equal(refused, 'not-unique');
});

test('the margin has to clear the threshold, not merely exist', () => {
  const justUnder = candidate({
    ranked: [
      { san: 'Qxd8+', score: 900 },
      { san: 'Qd7+', score: 900 - MIN_UNIQUE_MARGIN + 1 },
    ],
  });
  assert.equal(justUnder.refused, 'not-unique');

  const justOver = candidate({
    ranked: [
      { san: 'Qxd8+', score: 900 },
      { san: 'Qd7+', score: 900 - MIN_UNIQUE_MARGIN },
    ],
  });
  assert.equal(justOver.refused, null);
});

test('a small mistake is not worth meeting again', () => {
  const { puzzle, refused } = candidate({ cost: MIN_MISTAKE_COST - 1 });
  assert.equal(puzzle, null);
  assert.equal(refused, 'too-small');
});

test('⭐ a quiet best move is refused, however winning it is', () => {
  // A puzzle whose answer is a positional move is not a puzzle, it is an opinion. The answer has to
  // be the kind of move a human scans for: a capture, a check, or a promotion.
  const { puzzle, refused } = candidate({
    fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
    played: 'Kd1',
    ranked: [
      { san: 'e4', score: 900 },
      { san: 'Kd2', score: 100 },
    ],
  });
  assert.equal(puzzle, null);
  assert.equal(refused, 'not-findable');
});

test('a position with only one legal move has no second best, and is refused', () => {
  const { refused } = candidate({ ranked: [{ san: 'Qxd8+', score: 900 }] });
  assert.equal(refused, 'not-unique');
});

test('no candidate move at all is refused, and named separately', () => {
  const { refused } = candidate({ ranked: [] });
  assert.equal(refused, 'no-answer');
});

test('a played move that is not legal in the position is refused', () => {
  const { puzzle, refused } = candidate({ played: 'Qh8' });
  assert.equal(puzzle, null);
  assert.equal(refused, 'illegal');
});

/* ------------------------------------------------------------------ mate scores */

test('⭐ a mate score does not produce a margin of a million', () => {
  // The bug this exists for. A mate score is a million-ish, so subtracting an ordinary evaluation
  // from it reported a "winning margin" of 1,000,129 centipawns — which is what
  // `scripts/own-puzzles-yield.mjs` printed, and which is not a number anybody can read. It also
  // made the queue sort on an artefact of how mate is encoded rather than on how bad the mistake was.
  const { puzzle, refused } = candidate({
    ranked: [
      { san: 'Qxd8+', score: MATE - 3 },
      { san: 'Qd7+', score: 129 },
    ],
  });
  assert.equal(refused, null);
  assert.ok(puzzle);
  assert.equal(puzzle.margin, MARGIN_CAP);
});

test('⭐ two mates of the same length are both winning, so neither is the answer', () => {
  // A puzzle demanding one of two equally fast mates marks a winning move wrong.
  const { puzzle, refused } = candidate({
    ranked: [
      { san: 'Qxd8+', score: MATE - 5 },
      { san: 'Qd7+', score: MATE - 5 },
    ],
  });
  assert.equal(puzzle, null);
  assert.equal(refused, 'not-unique');
});

test('but a faster mate is a real distinction and is allowed', () => {
  const { refused } = candidate({
    ranked: [
      { san: 'Qxd8+', score: MATE - 3 },
      { san: 'Qd7+', score: MATE - 9 },
    ],
  });
  assert.equal(refused, null);
});

test('every margin stays inside the cap, so the queue sorts on something readable', () => {
  const { puzzle } = candidate({
    ranked: [
      { san: 'Qxd8+', score: MATE - 1 },
      { san: 'Qd7+', score: -MATE + 1 },
    ],
  });
  assert.ok(puzzle);
  assert.ok(puzzle.margin <= MARGIN_CAP, String(puzzle.margin));
});

/* ------------------------------------------------------------------ the second look */

test('⭐ a puzzle whose answer changes under a deeper look is dropped', () => {
  const { puzzle } = candidate();
  assert.ok(puzzle);
  assert.equal(
    stillSound(puzzle, [
      { san: 'Qd7+', score: 950 },
      { san: 'Qxd8+', score: 400 },
    ]),
    false,
  );
});

test('and one whose margin collapses under a deeper look is dropped too', () => {
  const { puzzle } = candidate();
  assert.ok(puzzle);
  assert.equal(
    stillSound(puzzle, [
      { san: 'Qxd8+', score: 900 },
      { san: 'Qd7+', score: 880 },
    ]),
    false,
  );
});

test('a puzzle that holds up is kept', () => {
  const { puzzle } = candidate();
  assert.ok(puzzle);
  assert.equal(
    stillSound(puzzle, [
      { san: 'Qxd8+', score: 950 },
      { san: 'Qd7+', score: 120 },
    ]),
    true,
  );
});

/* ------------------------------------------------------------------ the queue */

function puzzleAt(cost: number, block: number, fen = TACTIC): OwnPuzzle {
  return {
    fen,
    setupFen: SETUP,
    setupUci: 'd7d8',
    answerUci: 'd1d8',
    answer: 'Qxd8+',
    played: 'Ke2',
    cost,
    margin: 800,
    fromBlock: block,
    gameId: 'a'.repeat(32),
  };
}

test('⭐ the same position from a rematch is the same puzzle, counters notwithstanding', () => {
  // The halfmove and fullmove counters differ between two arrivals at one position and have nothing
  // to do with the tactic. Comparing whole FENs would let the identical puzzle in twice.
  const queue = [puzzleAt(400, 1, '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1')];
  assert.equal(alreadyQueued(queue, '3qk3/8/8/8/8/8/8/3QK3 w - - 14 37'), true);
  assert.equal(alreadyQueued(queue, '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'), false);
});

test('the dearest mistakes come first, and the oldest breaks a tie', () => {
  const order = queueOrder([
    puzzleAt(200, 5),
    puzzleAt(900, 9),
    puzzleAt(900, 2),
    puzzleAt(500, 1),
  ]);
  assert.deepEqual(
    order.map((puzzle) => [puzzle.cost, puzzle.fromBlock]),
    [
      [900, 2],
      [900, 9],
      [500, 1],
      [200, 5],
    ],
  );
});

test('ordering does not mutate the queue it was given', () => {
  const queue = [puzzleAt(200, 5), puzzleAt(900, 9)];
  queueOrder(queue);
  assert.equal(queue[0]!.cost, 200);
});

/* ------------------------------------------------------------------ the shape it is played in */

test('⭐ a queued puzzle plays through the existing solving screen without adaptation', () => {
  // A bundled Lichess puzzle is `{ fen, moves }` where the first move is the opponent's blunder and
  // the puzzle starts after it. Storing only the position to solve would have needed a second code
  // path through the whole solving screen, and two paths for one thing is how they drift apart.
  const { puzzle } = candidate();
  assert.ok(puzzle);

  const playable = asPuzzle(puzzle);
  assert.equal(playable.fen, SETUP);
  assert.deepEqual(playable.moves, ['d7d8', 'd1d8']);

  // And it really replays: the setup move is legal, and the answer is legal after it.
  const board = new Chess(playable.fen);
  const setup = board.move({ from: 'd7', to: 'd8' });
  assert.ok(setup);
  assert.equal(board.fen().split(' ').slice(0, 4).join(' '), TACTIC.split(' ').slice(0, 4).join(' '));
  const answer = board.move({ from: 'd1', to: 'd8' });
  assert.equal(answer.san, 'Qxd8+');
});

test('the difficulty shown is the cost of the mistake, not a borrowed crowd rating', () => {
  const { puzzle } = candidate({ cost: 400 });
  assert.ok(puzzle);
  assert.equal(asPuzzle(puzzle).rating, 1200);
  assert.deepEqual(asPuzzle(puzzle).themes, ['yourMistake']);
});
