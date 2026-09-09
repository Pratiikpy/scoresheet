/**
 * Today's tally.
 *
 * Two rules, and both are the sort of thing that is wrong for a whole day before anybody notices:
 * the day must turn at *local* midnight — the same rule the daily puzzle uses, or the two disagree
 * for hours — and yesterday's counts must not be added to today's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A `localStorage` that lives in a variable, so this runs in Node with no browser. */
function fakeWindow(seed: Record<string, string> = {}): void {
  const store = new Map(Object.entries(seed));
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
}

const KEY = 'scoresheet:today';

test('the day turns at local midnight, not UTC', async () => {
  fakeWindow();
  const { todayKey } = await import('../src/today.ts');
  /*
   * The daily puzzle uses local midnight, so this must too. A UTC day would put the two out of step
   * for up to fourteen hours — long enough that "solve the puzzle of the day" could be ticked for a
   * puzzle from a different day.
   */
  const noon = new Date(2026, 8, 7, 12, 0, 0);
  const lateEvening = new Date(2026, 8, 7, 23, 59, 0);
  const justAfter = new Date(2026, 8, 8, 0, 1, 0);

  assert.equal(todayKey(noon), '2026-09-07');
  assert.equal(todayKey(lateEvening), '2026-09-07', 'the day turned early');
  assert.equal(todayKey(justAfter), '2026-09-08', 'the day did not turn');
});

test('a fresh device has done nothing today', async () => {
  fakeWindow();
  const { today } = await import('../src/today.ts');
  const now = today();
  assert.equal(now.puzzles, 0);
  assert.equal(now.games, 0);
  assert.equal(now.wins, 0);
});

test('what is recorded is what comes back', async () => {
  fakeWindow();
  const { today, recordToday } = await import('../src/today.ts');
  recordToday({ puzzles: 1 });
  recordToday({ games: 1, wins: 1 });
  recordToday({ games: 1 });

  const now = today();
  assert.equal(now.puzzles, 1);
  assert.equal(now.games, 2);
  assert.equal(now.wins, 1);
});

test('⭐ yesterday does not count towards today', async () => {
  /*
   * The failure this prevents: a card that says the daily is done because it was done yesterday.
   * The reset is a *read* rather than a scheduled job, because nothing tells a page that midnight
   * has passed — the only reliable moment to notice is when somebody looks.
   */
  fakeWindow({ [KEY]: JSON.stringify({ day: '1999-01-01', puzzles: 9, games: 9, wins: 9 }) });
  const { today } = await import('../src/today.ts');
  const now = today();
  assert.equal(now.puzzles, 0);
  assert.equal(now.games, 0);
  assert.equal(now.wins, 0);
});

test('nonsense in storage is not believed', async () => {
  fakeWindow({ [KEY]: '{"day":"' + '2026-09-07' + '","puzzles":"lots","games":-4,"wins":null}' });
  const { today, todayKey } = await import('../src/today.ts');
  const now = today();
  // Only meaningful when the stored day happens to be today; either way nothing may be negative or
  // non-numeric, which is the property being asserted.
  assert.ok(now.puzzles >= 0 && Number.isInteger(now.puzzles), `${now.puzzles}`);
  assert.ok(now.games >= 0 && Number.isInteger(now.games), `${now.games}`);
  assert.ok(now.wins >= 0 && Number.isInteger(now.wins), `${now.wins}`);
  assert.equal(now.day, todayKey());
});

test('and neither is a storage that throws', async () => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    },
  };
  const { today, recordToday } = await import('../src/today.ts');
  assert.equal(today().games, 0);
  // Recording must not throw either: a browser that refuses to store loses a count, not a game.
  assert.doesNotThrow(() => recordToday({ games: 1 }));
});
