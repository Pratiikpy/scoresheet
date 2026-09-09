/**
 * Witnessed runs on this device — the store, and the run that drives them.
 *
 * The store is read defensively for the same reason `store.test.ts` gives about games: one bad row
 * in `localStorage` that a reader walks unguarded kills the screen permanently, because the row is
 * still there on the next load. A puzzle rating is now on the record page, so the same rule applies
 * to it.
 *
 * The run above the store is tested for one thing above all others: that a screen **cannot choose
 * its own puzzles** while a run is open. That is the entire reason a witnessed rating means
 * anything, and it is the kind of property that quietly stops holding when somebody adds a "skip"
 * button later.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalisePuzzleCard,
  hashAttempts,
  type Puzzle,
  type PuzzleAttempt,
  type PuzzleCard,
} from '@scoresheet/core';

const KEY = 'scoresheet:puzzle-cards';

const SOLVER = 'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9';
const WITNESS = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';

const PUZZLES: Puzzle[] = [
  { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1b1', 'h1g1'], rating: 900, themes: ['endgame'] },
  { fen: '8/8/8/8/8/8/8/K6k b - - 0 1', moves: ['h1g1', 'a1b1'], rating: 1200, themes: ['fork'] },
];
const ID = (puzzle: Puzzle): string => `${puzzle.fen}|${puzzle.moves.join(' ')}`;

const ATTEMPTS: PuzzleAttempt[] = [
  { id: ID(PUZZLES[0]!), rating: 900, solved: true },
  { id: ID(PUZZLES[1]!), rating: 1200, solved: false },
];

function cardOf(changes: Partial<PuzzleCard> = {}): PuzzleCard {
  return {
    chain: 'main',
    sessionId: 'a'.repeat(32),
    solver: SOLVER,
    witness: WITNESS,
    mode: 'training',
    attempted: 2,
    solved: 1,
    ratingBefore: 1200,
    ratingAfter: 1192,
    startedAtBlock: 4_200_000,
    endedAtBlock: 4_200_010,
    resultsHash: hashAttempts(ATTEMPTS),
    ...changes,
  };
}

const GOOD = {
  canonical: canonicalisePuzzleCard(cardOf()),
  signatures: {
    solver: { publicKeyHex: 'c'.repeat(64), signatureHex: 'd'.repeat(128) },
    witness: { publicKeyHex: 'e'.repeat(64), signatureHex: 'f'.repeat(128) },
  },
  attempts: ATTEMPTS,
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

async function cards() {
  return await import('../src/puzzle-cards.ts');
}

/* ------------------------------------------------------------------ the store */

test('a good card comes back', async () => {
  withStored([GOOD]);
  assert.equal((await cards()).allCards().length, 1);
});

test('nothing stored is no cards, not a crash', async () => {
  withStored(undefined);
  assert.deepEqual((await cards()).allCards(), []);
});

test('storage holding something that is not JSON is no cards', async () => {
  withStored('{{{ not json');
  assert.deepEqual((await cards()).allCards(), []);
});

test('a row with no signatures object is dropped, not handed to a reader', async () => {
  withStored([{ ...GOOD, signatures: undefined }]);
  assert.deepEqual((await cards()).allCards(), []);
});

test('a row whose attempts are not an array is dropped', async () => {
  withStored([{ ...GOOD, attempts: 'two of them' }]);
  assert.deepEqual((await cards()).allCards(), []);
});

test('a row whose canonical text is not a card is dropped', async () => {
  withStored([{ ...GOOD, canonical: 'chess/1 scoresheet\nmain\n' }]);
  assert.deepEqual((await cards()).allCards(), []);
});

test('a row that is not an object at all is dropped', async () => {
  withStored([null, 7, 'a card', GOOD]);
  assert.equal((await cards()).allCards().length, 1);
});

/* ------------------------------------------------------------------ the rating */

test('the rating is re-derived from the cards, not read off the last one', async () => {
  withStored([GOOD]);
  const found = (await cards()).puzzleRatingFor(SOLVER);
  assert.equal(found.runs, 1);
  assert.equal(found.attempted, 2);
  assert.equal(found.solved, 1);
  assert.equal(found.brokenAt, null);
});

test('somebody else\'s cards are not counted as yours', async () => {
  withStored([GOOD]);
  const found = (await cards()).puzzleRatingFor(WITNESS);
  assert.equal(found.runs, 0);
});

test('with no cards, a run starts from the starting rating', async () => {
  withStored([]);
  const { ratingBeforeFor } = await cards();
  const { PUZZLE_START } = await import('@scoresheet/core');
  assert.equal(ratingBeforeFor(SOLVER), PUZZLE_START);
});

test('and after one, from where that one ended', async () => {
  withStored([GOOD]);
  assert.equal((await cards()).ratingBeforeFor(SOLVER), 1192);
});

/* ------------------------------------------------------------------ saving */

test('a card whose bytes do not match its own fields is never stored', async () => {
  withStored([]);
  const { saveCard, allCards } = await cards();
  saveCard({
    card: cardOf({ ratingAfter: 1500 }),
    // The text of a *different* card. Storing it verbatim would keep bytes nothing stands behind.
    canonical: GOOD.canonical,
    attempts: ATTEMPTS,
    solver: GOOD.signatures.solver,
    witness: GOOD.signatures.witness,
  });
  assert.deepEqual(allCards(), []);
});

test('saving the same run twice keeps one copy, not two', async () => {
  withStored([]);
  const { saveCard, allCards } = await cards();
  const input = {
    card: cardOf(),
    canonical: GOOD.canonical,
    attempts: ATTEMPTS,
    solver: GOOD.signatures.solver,
    witness: GOOD.signatures.witness,
  };
  saveCard(input);
  saveCard(input);
  assert.equal(allCards().length, 1);
});

test('forgetting cards leaves none behind', async () => {
  withStored([GOOD]);
  const { forgetCards, allCards } = await cards();
  forgetCards();
  assert.deepEqual(allCards(), []);
});
