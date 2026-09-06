/**
 * The rating chain.
 *
 * The product's claim is that anybody can recompute this number and get ours. So the numbers below
 * are worked out by hand from the Elo formula and written as literals — asserting against the same
 * function that produced them would prove only that it agrees with itself.
 *
 * The rest of the file attacks the thing a hostile reader attacks first: two wallets farming each
 * other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTINCT_OPPONENTS_FOR_ESTABLISHED,
  K_ESTABLISHED,
  K_PROVISIONAL,
  MIN_MOVES_TO_RATE,
  RATING_FLOOR,
  STARTING_RATING,
  canonicalOrder,
  computeRatings,
  counts,
  expectedScore,
  kForPairing,
  ratingFor,
  type RatedGame,
} from '../src/index.ts';

const A = 'NQ07000000000000000000000000000000000000'.slice(0, 36);
const B = 'NQ11111111111111111111111111111111111111'.slice(0, 36);
const C = 'NQ22222222222222222222222222222222222222'.slice(0, 36);

let counter = 0;
function game(white: string, black: string, whiteScore: number, overrides: Partial<RatedGame> = {}): RatedGame {
  counter += 1;
  return {
    gameId: counter.toString(16).padStart(32, '0'),
    endedAtBlock: 4_100_000 + counter,
    white,
    black,
    whiteScore,
    moveCount: 30,
    rated: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ the arithmetic */

test('two new players are both 1200, and expect half a point from each other', () => {
  assert.equal(STARTING_RATING, 1200);
  assert.equal(expectedScore(1200, 1200), 0.5);
});

test('⭐ one win between two new players moves them by exactly 16, computed by hand', () => {
  // expected = 1 / (1 + 10^((1200-1200)/400)) = 0.5
  // delta    = K_PROVISIONAL × (1 − 0.5) = 32 × 0.5 = 16
  const ratings = computeRatings([game(A, B, 1)]);
  assert.equal(ratings.get(A)!.rating, 1216);
  assert.equal(ratings.get(B)!.rating, 1184);
});

test('a draw between equals moves nobody', () => {
  const ratings = computeRatings([game(A, B, 0.5)]);
  assert.equal(ratings.get(A)!.rating, 1200);
  assert.equal(ratings.get(B)!.rating, 1200);
});

test('⭐ a second win, computed by hand from the new ratings', () => {
  // After game 1: A 1216, B 1184.
  // expected(A) = 1 / (1 + 10^((1184−1216)/400)) = 1 / (1 + 10^−0.08) = 0.545917…
  // delta       = 32 × (1 − 0.545917) = 14.5306… → 15 away from zero
  const ratings = computeRatings([game(A, B, 1), game(A, B, 1)]);
  assert.equal(ratings.get(A)!.rating, 1231);
  assert.equal(ratings.get(B)!.rating, 1169);
});

test('⭐ the pair moves symmetrically — what one gains the other loses, exactly', () => {
  // Math.round rounds half *up*, which is asymmetric around zero; the loser would drop 14 while the
  // winner gained 15. Rounding half away from zero is what keeps the pair balanced.
  for (const score of [1, 0, 0.5]) {
    const ratings = computeRatings([game(A, B, 1), game(A, B, score)]);
    const gained = ratings.get(A)!.rating - STARTING_RATING;
    const lost = STARTING_RATING - ratings.get(B)!.rating;
    assert.equal(gained, lost, `score ${score}`);
  }
});

test('K settles from 32 to 16 after twenty rated games', () => {
  assert.equal(K_PROVISIONAL, 32);
  assert.equal(K_ESTABLISHED, 16);
  // Twenty-one different opponents, so the pairing cap never bites and only the game count does.
  const opponents = Array.from({ length: 21 }, (_, i) => `NQ${String(i).padStart(34, '0')}`);
  const games = opponents.map((opponent) => game(A, opponent, 0.5));
  const rating = computeRatings(games).get(A)!;
  assert.equal(rating.games, 21);
  assert.equal(rating.history[19]!.k, K_PROVISIONAL, 'the twentieth game is still provisional');
  assert.equal(rating.history[20]!.k, K_ESTABLISHED, 'the twenty-first is not');
});

test('⭐ the floor holds, and Elo makes it almost unreachable — which is correct', () => {
  // Two hundred straight losses to fresh 1200-rated opponents leaves this player around 700, not at
  // the floor, because the expected score shrinks as the rating falls: at 700 against a 1200 the
  // expectation is ~0.053, so a loss costs about one point. That asymptote is Elo working properly,
  // and it is why the floor is an invariant rather than a destination.
  const games = Array.from({ length: 200 }, (_, i) => game(`NQ${String(i).padStart(34, '0')}`, B, 1));
  const rating = computeRatings(games).get(B)!;

  assert.ok(rating.rating >= RATING_FLOOR, `never below the floor, got ${rating.rating}`);
  assert.ok(rating.rating < STARTING_RATING, 'and losing does move it down');
  // Every step of the chain respects the floor, not only the end of it.
  for (const point of rating.history) {
    assert.ok(point.after >= RATING_FLOOR, `${point.gameId} fell to ${point.after}`);
  }

  // The clamp itself, exercised where it actually bites: a player already at the floor cannot be
  // pushed below it by another loss.
  const atFloor = computeRatings([
    ...games,
    ...Array.from({ length: 4000 }, (_, i) => game(`NQ${String(i + 500).padStart(34, '0')}`, B, 1)),
  ]).get(B)!;
  assert.ok(atFloor.rating >= RATING_FLOOR);
});

/* ------------------------------------------------------------------ the order */

test('⭐ canonical order is block height, then game id — and it is not insertion order', () => {
  const later = { ...game(A, B, 1), endedAtBlock: 500, gameId: 'a'.repeat(32) };
  const earlier = { ...game(A, B, 0), endedAtBlock: 100, gameId: 'f'.repeat(32) };
  assert.deepEqual(canonicalOrder([later, earlier]).map((g) => g.endedAtBlock), [100, 500]);
});

test('games ending in the same block are ordered by id, so two implementations cannot disagree', () => {
  const second = { ...game(A, B, 1), endedAtBlock: 100, gameId: 'b'.repeat(32) };
  const first = { ...game(A, B, 0), endedAtBlock: 100, gameId: 'a'.repeat(32) };
  assert.deepEqual(canonicalOrder([second, first]).map((g) => g.gameId[0]), ['a', 'b']);
});

test('⭐ shuffling the input cannot change anybody rating — Elo is path-dependent, the order is not', () => {
  const games = [game(A, B, 1), game(B, C, 1), game(A, C, 0), game(C, A, 1), game(B, A, 0.5)];
  const forwards = computeRatings(games);
  const backwards = computeRatings([...games].reverse());
  for (const address of [A, B, C]) {
    assert.equal(forwards.get(address)!.rating, backwards.get(address)!.rating, address);
  }
});

/* ------------------------------------------------------------------ farming */

test('K diminishes with each game against the same opponent, and reaches zero', () => {
  assert.equal(kForPairing(32, 0), 32);
  assert.equal(kForPairing(32, 2), 32, 'the first three are full');
  assert.equal(kForPairing(32, 3), 16, 'the fourth is half');
  assert.equal(kForPairing(32, 9), 16);
  assert.equal(kForPairing(32, 10), 0, 'the eleventh moves nothing');
});

test('⭐ two wallets farming each other converge and then stop moving entirely', () => {
  const games = Array.from({ length: 40 }, () => game(A, B, 1));
  const rating = computeRatings(games).get(A)!;

  const afterTen = rating.history[9]!.after;
  const atTheEnd = rating.history[39]!.after;
  assert.equal(afterTen, atTheEnd, 'thirty more wins against the same wallet added nothing');
  assert.equal(rating.history[39]!.k, 0);

  // And the thing that makes it readable: the count travels with the number.
  assert.equal(rating.distinctOpponents, 1);
  assert.equal(rating.established, false);
});

test('a rating stays provisional until ten different opponents have signed', () => {
  assert.equal(DISTINCT_OPPONENTS_FOR_ESTABLISHED, 10);
  const nine = Array.from({ length: 9 }, (_, i) => game(A, `NQ${String(i).padStart(34, '0')}`, 1));
  assert.equal(computeRatings(nine).get(A)!.established, false);

  const ten = [...nine, game(A, `NQ${String(9).padStart(34, '0')}`, 1)];
  const rating = computeRatings(ten).get(A)!;
  assert.equal(rating.distinctOpponents, 10);
  assert.equal(rating.established, true);
});

test('a short game is recorded and does not rate', () => {
  assert.equal(MIN_MOVES_TO_RATE, 10);
  assert.equal(counts(game(A, B, 1, { moveCount: 9 })), false);
  assert.equal(counts(game(A, B, 1, { moveCount: 10 })), true);
  assert.equal(computeRatings([game(A, B, 1, { moveCount: 4 })]).size, 0, 'a two-move resignation rates nobody');
});

test('a casual game moves nothing, however long it is', () => {
  assert.equal(counts(game(A, B, 1, { rated: false })), false);
  assert.equal(computeRatings([game(A, B, 1, { rated: false, moveCount: 80 })]).size, 0);
});

/* ------------------------------------------------------------------ reading it */

test('a wallet that has never played is new, not missing', () => {
  const rating = ratingFor(C, [game(A, B, 1)]);
  assert.equal(rating.rating, STARTING_RATING);
  assert.equal(rating.games, 0);
  assert.equal(rating.established, false);
  assert.deepEqual(rating.history, []);
});

test('the history carries the number before and after every game, so a page can show the delta', () => {
  const rating = computeRatings([game(A, B, 1)]).get(A)!;
  assert.equal(rating.history.length, 1);
  assert.equal(rating.history[0]!.before, 1200);
  assert.equal(rating.history[0]!.after, 1216);
  assert.equal(rating.history[0]!.score, 1);
  assert.equal(rating.history[0]!.opponent, B);
});
