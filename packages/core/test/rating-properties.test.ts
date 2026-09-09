/**
 * The rating, attacked as a system rather than checked as a function.
 *
 * `elo.test.ts` proves the arithmetic: hand-computed numbers, the farming caps, the floor. This file
 * asks a different question. The rating **is** the product — the whole claim is that anybody can
 * recompute it and that nobody can take it away — so the properties it must hold under adversarial
 * play deserve to be executable, not a paragraph in a design document.
 *
 * Twelve properties, each stated as the sentence a hostile reader would try to falsify. Where a
 * property is only *partly* true, the test says so in its name rather than asserting a comfortable
 * version of it: `RATING.md` in `research/13-protocol/` is generated against this behaviour, and a
 * specification that overclaims is worse than one that admits a limit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTINCT_OPPONENTS_FOR_ESTABLISHED,
  K_HALF_GAMES_PER_OPPONENT,
  MIN_MOVES_TO_RATE,
  PROVISIONAL_GAMES,
  RATING_FLOOR,
  STARTING_RATING,
  computeRatings,
  ratingFor,
  type RatedGame,
} from '../src/index.ts';

function address(seed: number): string {
  return `NQ${seed.toString().padStart(2, '0')}${String(seed).repeat(40)}`.slice(0, 36);
}

const A = address(7);
const B = address(11);
const C = address(22);

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

/** A beats each of `n` fresh opponents `each` times. The honest way to a high rating. */
function beatManyPeople(n: number, each = 1): RatedGame[] {
  const games: RatedGame[] = [];
  for (let person = 0; person < n; person++) {
    const opponent = address(100 + person);
    for (let time = 0; time < each; time++) games.push(game(A, opponent, 1));
  }
  return games;
}

/* ------------------------------------------------------------------ determinism */

test('property: the input order of the games cannot change the answer', () => {
  // Elo is path-dependent, so the *canonical* order matters enormously — which is exactly why it is
  // derived from signed fields. What must never matter is the order our database happened to hand
  // them over in. Shuffled input, identical output, or the recompute page and the server disagree.
  const games = [...beatManyPeople(6), game(B, A, 1), game(A, C, 0.5)];
  const forwards = computeRatings(games);
  const backwards = computeRatings([...games].reverse());

  for (const [addr, rating] of forwards) {
    assert.equal(backwards.get(addr)!.rating, rating.rating, `${addr} disagreed`);
    assert.equal(backwards.get(addr)!.games, rating.games);
    assert.equal(backwards.get(addr)!.distinctOpponents, rating.distinctOpponents);
  }
});

test('property: recomputing twice gives an identical history, not merely an identical number', () => {
  const games = beatManyPeople(4, 2);
  assert.deepEqual(ratingFor(A, games).history, ratingFor(A, games).history);
});

test('property: a later game never rewrites an earlier one — the history is a prefix chain', () => {
  // If adding tomorrow's game changed what yesterday's game did, no certificate printed today would
  // still verify tomorrow.
  const early = beatManyPeople(5);
  const late = [...early, game(A, B, 0), game(A, C, 1)];
  const before = ratingFor(A, early).history;
  const after = ratingFor(A, late).history;

  assert.ok(after.length > before.length);
  assert.deepEqual(after.slice(0, before.length), before);
});

/* ------------------------------------------------------------------ monotonicity */

test('property: winning never lowers your rating and losing never raises it', () => {
  const base = beatManyPeople(12);
  const start = ratingFor(A, base).rating;

  const won = ratingFor(A, [...base, game(A, B, 1)]).rating;
  const lost = ratingFor(A, [...base, game(A, B, 0)]).rating;

  assert.ok(won >= start, `a win moved ${start} to ${won}`);
  assert.ok(lost <= start, `a loss moved ${start} to ${lost}`);
});

test('property: beating a stronger player is worth more than beating a weaker one', () => {
  // The one behaviour every chess player checks first. If this were false the number would be
  // measuring participation rather than skill.
  const strong = address(200);
  const weak = address(201);
  // Give `strong` a rating well above 1200 and `weak` one well below, honestly, by playing.
  const setup: RatedGame[] = [];
  for (let i = 0; i < 12; i++) setup.push(game(strong, address(300 + i), 1));
  for (let i = 0; i < 12; i++) setup.push(game(weak, address(400 + i), 0));

  const strongRating = ratingFor(strong, setup).rating;
  const weakRating = ratingFor(weak, setup).rating;
  assert.ok(strongRating > weakRating, 'the fixture failed to separate them');

  const base = [...setup, ...beatManyPeople(12)];
  const start = ratingFor(A, base).rating;
  const overStrong = ratingFor(A, [...base, game(A, strong, 1)]).rating - start;
  const overWeak = ratingFor(A, [...base, game(A, weak, 1)]).rating - start;

  assert.ok(overStrong > overWeak, `strong ${overStrong} was not worth more than weak ${overWeak}`);
});

/* ------------------------------------------------------------------ farming and collusion */

test('property: two wallets playing each other forever stop moving each other entirely', () => {
  // Wallets are free. This cannot be prevented; it can be made pointless, and that is the claim.
  const many: RatedGame[] = [];
  for (let i = 0; i < K_HALF_GAMES_PER_OPPONENT + 40; i++) many.push(game(A, B, 1));

  const history = ratingFor(A, many).history;
  const tail = history.slice(K_HALF_GAMES_PER_OPPONENT);
  assert.ok(tail.length > 0, 'the fixture did not reach the cap');
  for (const point of tail) {
    assert.equal(point.k, 0, 'a game past the cap still moved the rating');
    assert.equal(point.before, point.after);
  }
});

test('property: 200 wins over one wallet beat fewer people than 3 wins over ten, and are worth less', () => {
  const farmed = [];
  for (let i = 0; i < 200; i++) farmed.push(game(A, B, 1));
  const earned = beatManyPeople(10, 3);

  const farmedRating = ratingFor(A, farmed);
  const earnedRating = ratingFor(A, earned);

  assert.equal(farmedRating.distinctOpponents, 1);
  assert.equal(earnedRating.distinctOpponents, 10);
  assert.ok(
    earnedRating.rating > farmedRating.rating,
    `farming 200 games reached ${farmedRating.rating}, honest play reached ${earnedRating.rating}`,
  );
});

test('property: no number of games against too few people can make a rating established', () => {
  const many: RatedGame[] = [];
  for (let i = 0; i < 500; i++) many.push(game(A, i % 2 === 0 ? B : C, 1));
  const rating = ratingFor(A, many);

  assert.equal(rating.distinctOpponents, 2);
  assert.equal(rating.established, false);
  assert.ok(DISTINCT_OPPONENTS_FOR_ESTABLISHED > 2);
});

test('property: two colluding wallets cannot move a third party who never played them', () => {
  // Collusion can only ever move the colluders. A rating derived solely from games you are in has
  // this for free — it is worth an executable test precisely because it is the property that would
  // silently disappear if anyone ever added a "network" or "reputation" term to the formula.
  const outsider = ratingFor(C, beatManyPeople(11)).rating;
  const withCollusion: RatedGame[] = [...beatManyPeople(11)];
  for (let i = 0; i < 50; i++) withCollusion.push(game(A, B, i % 2));

  assert.equal(ratingFor(C, withCollusion).rating, outsider);
});

/* ------------------------------------------------------------------ what does not count */

test('property: a game too short to be chess does not move anything', () => {
  const short = game(A, B, 1, { moveCount: MIN_MOVES_TO_RATE - 1 });
  const ratings = computeRatings([short]);
  assert.equal(ratings.size, 0, 'a resignation on move two rated somebody');
});

test('property: an agreed draw between two equals moves neither of them', () => {
  const ratings = computeRatings([game(A, B, 0.5)]);
  assert.equal(ratings.get(A)!.rating, STARTING_RATING);
  assert.equal(ratings.get(B)!.rating, STARTING_RATING);
});

test('property: a casual game is recorded and never rated', () => {
  const ratings = computeRatings([game(A, B, 1, { rated: false })]);
  assert.equal(ratings.size, 0);
});

/* ------------------------------------------------------------------ the boundaries */

test('property: losing forever stops at the floor and never goes through it', () => {
  const losses: RatedGame[] = [];
  for (let person = 0; person < 60; person++) losses.push(game(A, address(500 + person), 0));
  const rating = ratingFor(A, losses).rating;

  assert.ok(rating >= RATING_FLOOR, `fell to ${rating}, below the floor of ${RATING_FLOOR}`);
});

test('property: a closed pool on settled K neither inflates nor deflates in total', () => {
  // Every rated game moves the two players by equal and opposite amounts once both are past the
  // provisional window and under the same pairing cap, so a closed group cannot manufacture rating
  // out of nothing. Asserted on the *sum*, which is the quantity inflation would move.
  const people = Array.from({ length: 12 }, (_, i) => address(600 + i));
  const games: RatedGame[] = [];

  // Settle everybody first: enough games, enough distinct opponents, alternating results.
  for (let round = 0; round < PROVISIONAL_GAMES + 4; round++) {
    for (let i = 0; i < people.length; i += 2) {
      const white = people[(i + round) % people.length]!;
      const black = people[(i + round + 1) % people.length]!;
      if (white !== black) games.push(game(white, black, round % 2));
    }
  }

  const ratings = computeRatings(games);
  const total = [...ratings.values()].reduce((sum, r) => sum + r.rating, 0);
  const expected = ratings.size * STARTING_RATING;

  // Not exactly equal: integer rounding of each delta loses fractions, and the provisional window
  // gives newer players a larger K than their opponent for a while. The honest property is that the
  // drift stays small and bounded rather than compounding — a few points per player, not hundreds.
  const driftPerPlayer = Math.abs(total - expected) / ratings.size;
  assert.ok(driftPerPlayer < 25, `drifted ${driftPerPlayer.toFixed(1)} points a player`);
});

test('property: inactivity does nothing at all, because nothing here is time-based', () => {
  // Worth pinning: many rating systems decay, and every decay rule needs a clock. A clock is state
  // outside the signed games, and the moment one exists the number stops being recomputable from
  // the signatures alone. This test fails the day somebody adds one.
  const games = beatManyPeople(11);
  const now = ratingFor(A, games).rating;
  const muchLater = ratingFor(
    A,
    games.map((g) => ({ ...g, endedAtBlock: g.endedAtBlock + 50_000_000 })),
  ).rating;

  assert.equal(muchLater, now);
});
