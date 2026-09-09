/**
 * The preferences store, and specifically what it does with rubbish.
 *
 * `localStorage` is not ours. It is shared with whoever is using the browser, it outlives every
 * version this app will ever ship, and it can hold anything — a value written by a future version, a
 * value left by an older one, a hand-edited string, or nothing at all. None of that is exotic; it is
 * the normal life of a key that lives for years.
 *
 * The failure mode is what makes it worth testing. A bad value does not throw: it flows into
 * `board.setShowCoords(undefined)` and `LEVELS[9.5]`, and the app renders wrong or crashes somewhere
 * far away from the cause. So every field is validated on read, and these tests are the proof.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ a localStorage to test with */

/**
 * A stand-in for `localStorage`, installed before the module under test is imported.
 *
 * Node has no DOM, and the alternative — mocking the module's internals — would test the mock. This
 * is the same shape the browser exposes, so what is exercised is the real code path.
 */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  /** Set to make every access throw, the way a private window or a disabled-storage browser does. */
  hostile = false;

  getItem(key: string): string | null {
    if (this.hostile) throw new DOMException('denied');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.hostile) throw new DOMException('quota');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
(globalThis as { window?: unknown }).window = { localStorage: storage };

const { LEVEL_COUNT, onSettingsChange, reloadSettings, resetSettings, settings, updateSettings } = await import('../src/settings.ts');

const KEY = 'scoresheet:settings';

beforeEach(() => {
  storage.hostile = false;
  storage.clear();
  resetSettings();
});

/* ------------------------------------------------------------------ defaults */

test('a browser with nothing stored gets sensible defaults', () => {
  storage.clear();
  resetSettings();
  const chosen = settings();
  assert.equal(chosen.sound, true);
  assert.equal(chosen.autoQueen, true, 'a queen is the right answer almost every time');
  assert.equal(chosen.zen, false, 'zen hides most of the app, so it is never the state you arrive in');
  assert.ok(chosen.level >= 0 && chosen.level < LEVEL_COUNT);
});

/* ------------------------------------------------------------------ rubbish */

test('⭐ a corrupt value falls back rather than reaching the board', () => {
  /*
   * Each of these is something `localStorage` can genuinely contain, and none of them throws on
   * read. Without validation they arrive at `board.setShowCoords(undefined)` and `LEVELS[NaN]`,
   * where the failure is far from its cause and looks like a rendering bug.
   */
  for (const rubbish of ['null', '"a string"', '42', '[]', '{"sound":"yes"}', 'not json at all', '']) {
    storage.setItem(KEY, rubbish);
    // Re-read the way a fresh page load would, so `coerce` is what is being exercised.
    const fresh = reloadSettings();
    assert.equal(typeof fresh.sound, 'boolean', rubbish);
    assert.equal(typeof fresh.zen, 'boolean', rubbish);
    assert.ok(Number.isInteger(fresh.level), rubbish);
  }
});

test('⭐ a level from another version can never select a bot that does not exist', () => {
  // The list of bots will change. A stored index of 9 from a future version, or -1 from a bug, must
  // not index past `LEVELS` — where the result is `undefined` and the game has no opponent at all.
  for (const level of [-1, 99, 1.5, Number.NaN, Infinity, '2', null]) {
    storage.setItem(KEY, JSON.stringify({ level }));
    const fresh = reloadSettings();
    assert.ok(
      Number.isInteger(fresh.level) && fresh.level >= 0 && fresh.level < LEVEL_COUNT,
      `level ${String(level)} survived as ${fresh.level}`,
    );
  }
});

test('a partial object keeps its good fields and defaults the rest', () => {
  storage.setItem(KEY, JSON.stringify({ sound: false, level: 3 }));
  const fresh = reloadSettings();
  assert.equal(fresh.sound, false, 'what was stored is honoured');
  assert.equal(fresh.level, 3);
  assert.equal(fresh.coordinates, true, 'and what was missing takes its default');
});

/* ------------------------------------------------------------------ writing */

test('a change persists and is readable again', () => {
  updateSettings({ zen: true, level: 2 });
  assert.equal(settings().zen, true);
  const stored = JSON.parse(storage.getItem(KEY)!);
  assert.equal(stored.zen, true);
  assert.equal(stored.level, 2);
});

test('⭐ storage that refuses to be written still changes the setting', () => {
  /*
   * Private windows, disabled site data and quota errors all throw on write. An app that will not
   * turn the sound off because it could not save the preference has its priorities exactly backwards
   * — the setting applies now, and simply does not survive a reload.
   */
  storage.hostile = true;
  assert.doesNotThrow(() => updateSettings({ sound: false }));
  assert.equal(settings().sound, false);
});

test('storage that refuses to be read gives defaults rather than a blank screen', () => {
  storage.hostile = true;
  assert.doesNotThrow(() => reloadSettings());
  storage.hostile = false;
});

/* ------------------------------------------------------------------ broadcast */

test('⭐ every listener hears a change, so two screens cannot disagree', () => {
  // The board, the sheet and the game all reflect the same state. A sheet that only updated the
  // screen it was opened from is how an app ends up with two opinions about whether sound is on.
  const heard: boolean[] = [];
  const stop = onSettingsChange((next) => heard.push(next.moveDots));
  updateSettings({ moveDots: false });
  updateSettings({ moveDots: true });
  stop();
  updateSettings({ moveDots: false });
  assert.deepEqual(heard, [false, true], 'and unsubscribing really stops it');
});
