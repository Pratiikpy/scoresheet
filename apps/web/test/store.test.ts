/**
 * The store that holds signed games — read defensively, because it holds the product's only claim.
 *
 * `localStorage` outlives versions, is shared with everything else on the origin, and can contain
 * anything at all. A row this module hands back is drawn on the record page, which is the screen the
 * whole product is an argument for — and a crash there cannot be recovered by reloading, because the
 * bad row is still in storage on the next load. The only way out for a person would be clearing
 * their site data, which also destroys every signature they own.
 *
 * So the rule is: **a row that cannot be stood behind is dropped, never handed on.**
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'scoresheet:games';

const CANONICAL = [
  'chess/1 scoresheet',
  'main',
  'a'.repeat(32),
  'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9',
  'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7',
  '1-0',
  'resignation',
  '3',
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  '4200000',
  'b'.repeat(64),
  'rated',
  '',
].join('\n');

/** A good row, and the shape everything below deviates from. */
const GOOD = {
  canonical: CANONICAL,
  signatures: { white: { publicKeyHex: 'c'.repeat(64), signatureHex: 'd'.repeat(128) } },
  moves: ['e4', 'e5', 'Nf3'],
  savedAt: 1_700_000_000_000,
};

/** A `window` with a `localStorage` that lives in a variable, so this runs in Node. */
function withStored(value: unknown): void {
  const store = new Map<string, string>();
  if (value !== undefined) store.set(KEY, typeof value === 'string' ? value : JSON.stringify(value));
  (globalThis as { window?: unknown; localStorage?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, next: string) => store.set(key, next),
      removeItem: (key: string) => store.delete(key),
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = (
    (globalThis as { window: { localStorage: unknown } }).window
  ).localStorage;
}

async function games(): Promise<unknown[]> {
  const { allGames } = await import('../src/store.ts');
  return allGames();
}

test('a good row comes back', async () => {
  withStored([GOOD]);
  assert.equal((await games()).length, 1);
});

test('nothing stored is no games, not a crash', async () => {
  withStored(undefined);
  assert.deepEqual(await games(), []);
});

test('and neither is nonsense', async () => {
  withStored('{not json');
  assert.deepEqual(await games(), []);
});

test('something that is not a list is not a list of games', async () => {
  withStored({ games: 'lots' });
  assert.deepEqual(await games(), []);
});

test('a row with no scoresheet in it is dropped', async () => {
  withStored([GOOD, { ...GOOD, canonical: 'not a scoresheet' }]);
  assert.equal((await games()).length, 1);
});

test('⭐ and so is a row with no signatures object', async () => {
  /*
   * The defect this exists for, and it would have been permanent. Only `canonical` was validated,
   * and every reader walks `game.signatures` unguarded — `record.ts` calls
   * `Object.values(game.signatures)` on the first line it draws, and `Object.values(undefined)`
   * throws. One row written by an older version, and the record page is dead until somebody clears
   * their site data, which destroys every signature they own.
   */
  withStored([GOOD, { canonical: CANONICAL, moves: [], savedAt: 1 }]);
  assert.equal((await games()).length, 1, 'a row with no signatures survived');

  withStored([{ ...GOOD, signatures: null }]);
  assert.deepEqual(await games(), [], 'a null signatures survived');

  withStored([{ ...GOOD, signatures: 'both' }]);
  assert.deepEqual(await games(), [], 'a string signatures survived');
});

test('and a row whose moves are not a list', async () => {
  withStored([{ ...GOOD, moves: 'e4 e5' }]);
  assert.deepEqual(await games(), []);
});

test('a row that is not an object at all', async () => {
  withStored([GOOD, null, 42, 'a game', []]);
  assert.equal((await games()).length, 1);
});

test('⭐ every survivor is safe to read the way the record page reads it', async () => {
  /*
   * The property that actually matters, stated as the readers state it: whatever comes back, the
   * page must be able to walk `signatures` and `moves` without a guard of its own. If this holds,
   * no reader can be crashed by storage.
   */
  withStored([
    GOOD,
    null,
    { canonical: CANONICAL },
    { ...GOOD, signatures: undefined },
    { ...GOOD, signatures: 0 },
    { ...GOOD, moves: null },
    { canonical: 42, signatures: {}, moves: [] },
  ]);

  for (const game of (await games()) as { signatures: unknown; moves: unknown; canonical: unknown }[]) {
    assert.equal(typeof game.canonical, 'string');
    assert.doesNotThrow(() => Object.values(game.signatures as object));
    assert.ok(Array.isArray(game.moves));
  }
});

test('⭐ and the crash it prevents is real, not theoretical', () => {
  /*
   * The reader's own line, run against the row that used to survive validation. This is what
   * `record.ts` does before it draws anything, and it is why an unvalidated `signatures` was fatal
   * rather than untidy.
   */
  const rowThatUsedToSurvive = { canonical: CANONICAL, moves: [], savedAt: 1 } as {
    signatures?: Record<string, unknown>;
  };
  assert.throws(
    () => Object.values(rowThatUsedToSurvive.signatures as Record<string, unknown>),
    TypeError,
    'if this no longer throws, the reason for the guard has changed and the guard should be re-argued',
  );
});
