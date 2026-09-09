/**
 * The puzzle card, tested the way the scoresheet is tested.
 *
 * The cases that matter are not the happy one. They are the ones where two different byte strings
 * could mean the same thing, where a card could be moved to a different place in a history, and
 * where somebody could witness themselves — because each of those turns a signature from proof into
 * decoration, and none of them looks wrong while it is happening.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PUZZLE_CARD_VERSION,
  PuzzleCardError,
  canonicalCardOrder,
  canonicalisePuzzleCard,
  computePuzzleRating,
  hashAttempts,
  parsePuzzleCard,
  type PuzzleAttempt,
  type PuzzleCard,
} from '../src/puzzlecard.ts';
import { PUZZLE_START, nextPuzzleRating } from '../src/puzzle-set.ts';

const SOLVER = 'NQ84BAFBNAMP3U04TQMYQTMC3BQEPFL6PMTP';
const WITNESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000';

const attempts: PuzzleAttempt[] = [
  { id: '8/8/8/8/8/8/8/K6k w - - 0 1|a1b1', rating: 1100, solved: true },
  { id: '8/8/8/8/8/8/8/K6k b - - 0 1|h1g1', rating: 1500, solved: false },
];

function card(changes: Partial<PuzzleCard> = {}): PuzzleCard {
  return {
    chain: 'test',
    sessionId: 'a'.repeat(32),
    solver: SOLVER,
    witness: WITNESS,
    mode: 'training',
    attempted: 2,
    solved: 1,
    ratingBefore: 1200,
    ratingAfter: 1198,
    startedAtBlock: 100,
    endedAtBlock: 120,
    resultsHash: hashAttempts(attempts),
    ...changes,
  };
}

test('a card canonicalises to thirteen lines and a trailing newline', () => {
  const text = canonicalisePuzzleCard(card());
  const lines = text.split('\n');
  assert.equal(lines.length, 14);
  assert.equal(lines[13], '');
  assert.equal(lines[0], PUZZLE_CARD_VERSION);
});

test('and round-trips through the parser unchanged', () => {
  const text = canonicalisePuzzleCard(card());
  assert.equal(canonicalisePuzzleCard(parsePuzzleCard(text)), text);
});

test('addresses are normalised, so spacing cannot change the bytes', () => {
  const spaced = canonicalisePuzzleCard(card({ witness: WITNESS }));
  const tight = canonicalisePuzzleCard(card({ witness: WITNESS.replace(/\s/g, '') }));
  assert.equal(spaced, tight);
});

test('a solver cannot witness their own run', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ witness: SOLVER })), PuzzleCardError);
});

test('a run with no puzzles is not a run', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ attempted: 0, solved: 0 })), PuzzleCardError);
});

test('more solved than attempted is refused', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ attempted: 2, solved: 3 })), PuzzleCardError);
});

test('a run cannot end before it started', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ startedAtBlock: 200, endedAtBlock: 100 })), PuzzleCardError);
});

test('a rating below the floor is refused', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ ratingAfter: 399 })), PuzzleCardError);
});

test('an unknown mode is refused rather than passed through', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ mode: 'blitz' as never })), PuzzleCardError);
});

test('block heights of zero are refused — a real height is what orders a card', () => {
  assert.throws(() => canonicalisePuzzleCard(card({ startedAtBlock: 0 })), PuzzleCardError);
  assert.throws(() => canonicalisePuzzleCard(card({ endedAtBlock: 0 })), PuzzleCardError);
});

test('a non-canonical number is refused, not coerced', () => {
  const text = canonicalisePuzzleCard(card());
  // `2` is the attempted count on line seven. `02` means the same to a human and must not parse.
  const bent = text.split('\n');
  bent[6] = '02';
  assert.throws(() => parsePuzzleCard(bent.join('\n')), PuzzleCardError);
});

test('a card with a line added is refused', () => {
  assert.throws(() => parsePuzzleCard(`${canonicalisePuzzleCard(card())}extra\n`), PuzzleCardError);
});

test('an unknown version is refused', () => {
  const text = canonicalisePuzzleCard(card()).replace(PUZZLE_CARD_VERSION, 'chess/2 puzzle card');
  assert.throws(() => parsePuzzleCard(text), PuzzleCardError);
});

/* ------------------------------------------------------------------ the hash */

test('the attempt hash depends on the order they were served in', () => {
  assert.notEqual(hashAttempts(attempts), hashAttempts([...attempts].reverse()));
});

test('and on whether each one was solved', () => {
  const flipped = attempts.map((attempt) => ({ ...attempt, solved: !attempt.solved }));
  assert.notEqual(hashAttempts(attempts), hashAttempts(flipped));
});

/* ------------------------------------------------------------------ the rating */

test('no cards means the starting rating', () => {
  const found = computePuzzleRating([]);
  assert.equal(found.rating, PUZZLE_START);
  assert.equal(found.runs, 0);
  assert.equal(found.brokenAt, null);
});

test('a card replays to exactly the rating its attempts produce', () => {
  let expected = PUZZLE_START;
  for (const attempt of attempts) expected = nextPuzzleRating(expected, attempt.rating, attempt.solved);

  const found = computePuzzleRating([card({ ratingAfter: expected })], () => attempts);
  assert.equal(found.rating, expected);
  assert.equal(found.attempted, 2);
  assert.equal(found.solved, 1);
  assert.equal(found.brokenAt, null);
});

test('a card whose own ratingAfter disagrees with its attempts is reported, not believed', () => {
  const found = computePuzzleRating([card({ ratingAfter: 9999 })], () => attempts);
  assert.equal(found.brokenAt, 'a'.repeat(32));
});

test('a card with no attempt list still counts — a rating cannot be erased by withholding a file', () => {
  const found = computePuzzleRating([card({ ratingAfter: 1198 })]);
  assert.equal(found.rating, 1198);
  assert.equal(found.brokenAt, null);
});

test('attempts that do not hash to what was signed are ignored, and the signed number stands', () => {
  const found = computePuzzleRating([card({ ratingAfter: 1198 })], () => [
    { id: 'not the puzzles that were signed for', rating: 800, solved: true },
  ]);
  assert.equal(found.rating, 1198);
});

test('a gap in the chain names the card that broke it', () => {
  const first = card({ sessionId: 'a'.repeat(32), ratingBefore: 1200, ratingAfter: 1210, endedAtBlock: 100 });
  // Starts from 1300 rather than the 1210 the first one ended at — a card is missing between them.
  const second = card({ sessionId: 'b'.repeat(32), ratingBefore: 1300, ratingAfter: 1320, endedAtBlock: 200 });
  const found = computePuzzleRating([first, second]);
  assert.equal(found.brokenAt, 'b'.repeat(32));
  assert.equal(found.rating, 1320);
});

test('cards are ordered by block height, and by session id inside one block', () => {
  const later = card({ sessionId: 'b'.repeat(32), endedAtBlock: 200 });
  const earlier = card({ sessionId: 'a'.repeat(32), endedAtBlock: 100 });
  const sameBlock = card({ sessionId: 'c'.repeat(32), endedAtBlock: 100 });

  const order = canonicalCardOrder([later, sameBlock, earlier]).map((one) => one.sessionId[0]);
  assert.deepEqual(order, ['a', 'c', 'b']);
});

test('the order does not depend on the order they were handed over in', () => {
  const one = card({ sessionId: 'a'.repeat(32), endedAtBlock: 100 });
  const two = card({ sessionId: 'b'.repeat(32), endedAtBlock: 200 });
  assert.deepEqual(canonicalCardOrder([one, two]), canonicalCardOrder([two, one]));
});
