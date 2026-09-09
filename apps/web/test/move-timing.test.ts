/**
 * Move timing — the recording, and the one number computed from it.
 *
 * The storage half needs a browser and is exercised by `npm run look`. What is tested here is the
 * part that has to be right before any of it means anything: the clock, and the rank correlation
 * between time taken and how much choice a position offered.
 *
 * The correlation is tested against **hand-built** data with a known answer rather than against
 * itself — perfect agreement, perfect disagreement, no relationship, and the tie cases that break
 * naive implementations. A statistic nobody has checked against a known value is a number, not a
 * measurement, and this one is eventually going to sit near somebody's money.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoveClock, summarise, type MoveTiming } from '../src/move-timing.ts';

function timings(pairs: [number, number][]): MoveTiming[] {
  return pairs.map(([ms, legal]) => ({ ms, legal }));
}

/* ------------------------------------------------------------------ the clock */

test('the clock measures the gap between the position appearing and the move', () => {
  let now = 1000;
  const clock = new MoveClock(() => now);

  now = 1500;
  clock.played(20);
  now = 1700;
  clock.played(31);

  assert.deepEqual(clock.collected(), [
    { ms: 500, legal: 20 },
    { ms: 200, legal: 31 },
  ]);
});

test('ready() restarts the count, so waiting for an opponent is not counted as thinking', () => {
  // Without this, every move in a live game would carry the opponent's thinking time as well as its
  // own, which would make the whole record describe the pair rather than the player.
  let now = 0;
  const clock = new MoveClock(() => now);

  now = 10_000; // the opponent thought for ten seconds
  clock.ready();
  now = 11_000; // and this player took one
  clock.played(25);

  assert.deepEqual(clock.collected(), [{ ms: 1000, legal: 25 }]);
});

test('a clock that goes backwards records zero rather than a negative', () => {
  // A device sleeping, or a manual time change. A negative duration would poison every later
  // average, and defending against it here is cheaper than defending against it everywhere else.
  let now = 5000;
  const clock = new MoveClock(() => now);
  now = 4000;
  clock.played(20);

  assert.deepEqual(clock.collected(), [{ ms: 0, legal: 20 }]);
});

test('what it collected cannot be mutated from outside', () => {
  const clock = new MoveClock(() => 0);
  clock.played(20);
  const first = clock.collected();
  first[0]!.ms = 999;
  assert.equal(clock.collected()[0]!.ms, 0);
});

/* ------------------------------------------------------------------ the summary */

test('an empty game summarises to zeroes rather than to NaN', () => {
  assert.deepEqual(summarise([]), { moves: 0, medianMs: 0, timeVersusChoice: 0 });
});

test('the median is the middle, and it is not the mean', () => {
  // One move in a game can take a minute while the rest take two seconds. The mean would describe
  // that move; the median describes the player, which is the reason this is a median at all.
  const summary = summarise(timings([[1000, 20], [1200, 22], [60_000, 30], [1100, 25], [1300, 28]]));
  assert.equal(summary.moves, 5);
  assert.equal(summary.medianMs, 1200);
});

test('an even number of moves averages the two middle values', () => {
  assert.equal(summarise(timings([[100, 5], [300, 6], [500, 7], [900, 8]])).medianMs, 400);
});

test('⭐ thinking longer when there is more to consider reads as +1', () => {
  const summary = summarise(timings([[100, 2], [200, 5], [300, 9], [400, 14], [500, 20]]));
  assert.equal(summary.timeVersusChoice, 1);
});

test('⭐ and being slowest where there is least to consider reads as −1', () => {
  const summary = summarise(timings([[500, 2], [400, 5], [300, 9], [200, 14], [100, 20]]));
  assert.equal(summary.timeVersusChoice, -1);
});

test('⭐ uniform speed regardless of difficulty reads as no relationship', () => {
  // The pattern the literature describes, and the reason `legal` is recorded at all. Every move
  // takes the same time whether the position was forced or wide open.
  const summary = summarise(timings([[1000, 2], [1000, 6], [1000, 11], [1000, 18], [1000, 30]]));
  assert.equal(summary.timeVersusChoice, 0);
});

test('one varied side and one flat side is no relationship, not a division by zero', () => {
  const summary = summarise(timings([[100, 7], [900, 7], [400, 7], [1500, 7]]));
  assert.equal(summary.timeVersusChoice, 0);
  assert.ok(Number.isFinite(summary.timeVersusChoice));
});

test('ties share a rank instead of being ordered arbitrarily', () => {
  // Two positions with the same number of legal moves are equally hard by this measure, and the
  // result must not depend on which of them happened to be stored first.
  const forwards = summarise(timings([[100, 5], [200, 5], [900, 20], [950, 21]]));
  const shuffled = summarise(timings([[200, 5], [100, 5], [950, 21], [900, 20]]));
  assert.equal(forwards.timeVersusChoice, shuffled.timeVersusChoice);
});

test('two moves are too few to correlate, and it says so rather than guessing', () => {
  assert.equal(summarise(timings([[100, 5], [900, 30]])).timeVersusChoice, 0);
});

test('the correlation stays inside −1..1 for awkward real data', () => {
  const rough = timings([
    [50, 30], [12_000, 4], [800, 18], [3, 1], [45_000, 27], [900, 9], [120, 33], [7000, 2],
  ]);
  const value = summarise(rough).timeVersusChoice;
  assert.ok(value >= -1 && value <= 1, `out of range: ${value}`);
});
