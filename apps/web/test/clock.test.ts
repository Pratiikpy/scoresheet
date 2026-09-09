/**
 * The clock, tested where being wrong costs somebody a game.
 *
 * Every failure here is a real one: time charged to the wrong side, an increment that pays somebody
 * who has already flagged, a takeback that quietly eats a minute. None of them look like bugs on
 * screen — the clock just says a number, and the number is wrong.
 *
 * The clock's `now` is injected, so all of this runs without waiting a single real second.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, formatClock } from '../src/clock.ts';

/** A clock whose time a test can move. */
function harness(control: 'none' | 'bullet' | 'blitz' | 'rapid' = 'blitz') {
  let at = 1_000_000;
  const clock = createClock({ control, now: () => at });
  return { clock, tick: (ms: number) => (at += ms), at: () => at };
}

/* ------------------------------------------------------------------ reading a clock */

test('a clock reads the way a chess clock reads', () => {
  assert.equal(formatClock(183_000), '3:03');
  assert.equal(formatClock(600_000), '10:00');
  assert.equal(formatClock(60_000), '1:00');
  assert.equal(formatClock(65_400), '1:05');
});

test('and gains a decimal under ten seconds, which is what blitz players expect', () => {
  assert.equal(formatClock(9_900), '9.9');
  assert.equal(formatClock(1_500), '1.5');
  assert.equal(formatClock(0), '0.0');
});

test('a clock never reads below zero', () => {
  assert.equal(formatClock(-5_000), '0.0');
});

/* ------------------------------------------------------------------ what a clock is for */

test('an untimed game has a clock that does nothing', () => {
  // `'none'` is a clock that is present and inert rather than a `null` every caller has to test.
  const { clock, tick } = harness('none');
  assert.equal(clock.timed, false);
  clock.start('w');
  tick(60_000);
  assert.equal(clock.flagged(), null, 'nobody can run out of a clock that is not running');
});

test('a timed game starts both sides with the same time', () => {
  const { clock } = harness('blitz');
  assert.equal(clock.timed, true);
  assert.deepEqual(clock.left, { w: 180_000, b: 180_000 });
});

test('⭐ only the side to move is charged', () => {
  const { clock, tick } = harness('blitz');
  clock.start('w');
  tick(5_000);
  assert.equal(clock.left.w, 175_000);
  assert.equal(clock.left.b, 180_000, 'the side not to move was charged');
});

test('and the charge is banked when the move is played', () => {
  const { clock, tick } = harness('rapid');
  clock.start('w');
  tick(4_000);
  clock.played('w');
  tick(60_000); // Nobody is running now.
  assert.equal(clock.left.w, 596_000 + 5_000, 'the increment is missing or the clock kept running');
});

test('⭐ the increment is added after the move, not before', () => {
  /*
   * The one way a Fischer increment goes wrong: paid first, somebody who is already out of time
   * gets two seconds and moves again. Their clock reached zero — that is a flag, increment or not.
   */
  const { clock, tick } = harness('blitz');
  clock.start('w');
  tick(200_000); // Well past their three minutes.
  assert.equal(clock.played('w'), true, 'running out was not reported');
  assert.equal(clock.left.w, 0, 'a flagged player was paid an increment');
});

test('a side that has not run out is paid its increment', () => {
  const { clock, tick } = harness('blitz');
  clock.start('b');
  tick(1_000);
  assert.equal(clock.played('b'), false);
  assert.equal(clock.left.b, 179_000 + 2_000);
});

test('running out is noticed between moves, not only on one', () => {
  // The whole point of losing on time is that it happens while you are *not* moving.
  const { clock, tick } = harness('bullet');
  clock.start('w');
  assert.equal(clock.flagged(), null);
  tick(60_001);
  assert.equal(clock.flagged(), 'w');
});

test('and the side that is not to move cannot flag', () => {
  const { clock, tick } = harness('bullet');
  clock.start('w');
  tick(60_001);
  assert.notEqual(clock.flagged(), 'b');
});

test('stopping the clock says whether that side had run out', () => {
  const { clock, tick } = harness('bullet');
  clock.start('b');
  tick(30_000);
  assert.equal(clock.stop(), false);

  clock.start('b');
  tick(40_000);
  assert.equal(clock.stop(), true);
});

test('stopping twice charges once', () => {
  const { clock, tick } = harness('rapid');
  clock.start('w');
  tick(10_000);
  clock.stop();
  const after = clock.left.w;
  tick(10_000);
  clock.stop();
  assert.equal(clock.left.w, after, 'time was charged to a stopped clock');
});

/* ------------------------------------------------------------------ taking a move back */

test('⭐ a takeback puts the clocks back where they were', () => {
  /*
   * Taking a move back and finding the time gone reads as a bug, and there is nothing to farm: a
   * game against the bot is never rated (`SPEC.md` P3).
   */
  const { clock, tick } = harness('blitz');
  clock.start('w');
  tick(10_000);
  const before = clock.snapshot();

  clock.played('w');
  clock.start('b');
  tick(30_000);
  clock.played('b');

  clock.restore(before);
  clock.start('w');
  assert.equal(clock.left.w, 170_000, 'White did not get their time back');
  assert.equal(clock.left.b, 180_000, 'Black did not get their time back');
});

test('a new game is a new clock', () => {
  const { clock, tick } = harness('bullet');
  clock.start('w');
  tick(50_000);
  clock.reset();
  assert.deepEqual(clock.left, { w: 60_000, b: 60_000 });
  assert.equal(clock.running, null);
});
