/**
 * The coordinate trainer's rules.
 *
 * Small surface, and every rule in it exists because getting it wrong would flatter the player:
 * repeating a square makes the next answer free, staying on a square until it is right turns thirty
 * seconds into one square, and a shared average hides the thing the exercise is for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUN_SECONDS, allSquares, averageScore, nextSquare, startRun } from '../src/coordinates.ts';

/** A deterministic source, so a run is the same run twice. */
function seeded(seed = 7): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

test('there are sixty-four squares and no duplicates', () => {
  const squares = allSquares();
  assert.equal(squares.length, 64);
  assert.equal(new Set(squares).size, 64);
  assert.ok(squares.includes('a1'));
  assert.ok(squares.includes('h8'));
});

test('a run is thirty seconds, which is the number Lichess uses', () => {
  assert.equal(RUN_SECONDS, 30);
});

test('⭐ the same square is never asked twice in a row', () => {
  /*
   * Repeating a square gives two correct answers for one piece of knowledge — the one way a trainer
   * can flatter somebody without looking broken.
   */
  const random = seeded();
  let previous = 'e4';
  for (let step = 0; step < 500; step++) {
    const next = nextSquare(previous, random);
    assert.notEqual(next, previous, `repeated ${previous} at step ${step}`);
    assert.ok(allSquares().includes(next), `${next} is not a square`);
    previous = next;
  }
});

test('a right answer counts, and moves on', () => {
  const run = startRun({ side: 'w', random: seeded() });
  const asked = run.square;
  assert.equal(run.answer(asked), true);
  assert.equal(run.correct, 1);
  assert.equal(run.wrong, 0);
  assert.notEqual(run.square, asked, 'it stayed on a square that was already answered');
});

test('⭐ and a wrong answer moves on too', () => {
  /*
   * Staying put until it is right turns a timed run into a wall: somebody who cannot find `b7` loses
   * the whole thirty seconds to it and learns nothing about the other sixty-three squares.
   */
  const run = startRun({ side: 'w', random: seeded() });
  const asked = run.square;
  const wrong = allSquares().find((square) => square !== asked)!;
  assert.equal(run.answer(wrong), false);
  assert.equal(run.correct, 0);
  assert.equal(run.wrong, 1);
  assert.notEqual(run.square, asked);
});

test('an orientation is chosen once, at the start', () => {
  assert.equal(startRun({ side: 'w', random: seeded() }).side, 'w');
  assert.equal(startRun({ side: 'b', random: seeded() }).side, 'b');
});

test('and random really is one of the two', () => {
  const sides = new Set<string>();
  for (let seed = 1; seed < 40; seed++) sides.add(startRun({ side: 'random', random: seeded(seed) }).side);
  assert.deepEqual([...sides].sort(), ['b', 'w'], 'random produced only one orientation');
});

test('an average needs a run to average', () => {
  assert.equal(averageScore(0, 0), null);
  assert.equal(averageScore(40, 0), null);
});

test('and is reported to one decimal', () => {
  assert.equal(averageScore(30, 4), 7.5);
  assert.equal(averageScore(10, 3), 3.3);
  assert.equal(averageScore(12, 1), 12);
});
