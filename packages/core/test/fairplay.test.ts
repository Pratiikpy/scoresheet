/**
 * Fair play — tested for the promises it makes about *not* harming people.
 *
 * The detector has no measured detection power (`scripts/fairplay-calibrate.mjs` puts it at 0% of
 * assisted players caught, which is written down rather than tuned away). So the interesting tests
 * are not "does it catch a cheat" — it does not, and pretending otherwise here would be worse than
 * the weakness itself.
 *
 * What is tested is every promise the design makes in the other direction, because those are the ones
 * that protect somebody who has done nothing wrong:
 *
 *  - a player with no history is **not** treated as clean
 *  - the caveat travels with every assessment, so no screen can show a band without it
 *  - no band's stated consequence is an automatic forfeit
 *  - strong play alone, without a lot of it, never reaches the top band
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_CONSEQUENCE,
  FAIR_PLAY_CAVEAT,
  MIN_GAMES_FOR_BASELINE,
  MIN_MOVES,
  assess,
  type GameSignals,
} from '../src/index.ts';

function game(overrides: Partial<GameSignals> = {}): GameSignals {
  return { engineAgreement: 0.5, averageLoss: 60, moves: 40, ...overrides };
}

function many(count: number, overrides: Partial<GameSignals> = {}): GameSignals[] {
  return Array.from({ length: count }, () => game(overrides));
}

/* ------------------------------------------------------------------ the cold start */

test('⭐ a player with no games is "insufficient", which is not the same as clean', () => {
  const verdict = assess([]);
  assert.equal(verdict.band, 'insufficient');
  assert.notEqual(verdict.band, 'normal');
});

test('and a player just under the bar is still insufficient', () => {
  const verdict = assess(many(MIN_GAMES_FOR_BASELINE - 1, { engineAgreement: 0.99, averageLoss: 1 }));
  assert.equal(verdict.band, 'insufficient');
});

test('⭐ short games do not count towards the bar, however many there are', () => {
  // Twenty two-move games are not evidence about anybody. Counting them would let a flood of
  // resignations push somebody over the threshold for assessment.
  const verdict = assess(many(20, { moves: MIN_MOVES - 1, engineAgreement: 1, averageLoss: 0 }));
  assert.equal(verdict.band, 'insufficient');
});

test('the insufficient verdict says how much was actually usable', () => {
  const verdict = assess([game({ moves: 5 }), game({ moves: 5 })]);
  assert.match(verdict.reasons.join(' '), /0 of 2/);
});

/* ------------------------------------------------------------------ the ordinary case */

test('ordinary play is normal, and says nothing about the player', () => {
  const verdict = assess(many(10));
  assert.equal(verdict.band, 'normal');
  assert.deepEqual(verdict.reasons, []);
});

test('a strong player who is merely accurate does not reach the top band on that alone', () => {
  // 85% agreement and low loss is a good club player having a good month. It is worth a look and it
  // is not, on its own, the strongest thing this can say about somebody.
  const verdict = assess(many(10, { engineAgreement: 0.85, averageLoss: 20 }));
  assert.notEqual(verdict.band, 'high-risk');
});

/* ------------------------------------------------------------------ the bands that mean something */

test('near-perfect agreement across many games reaches review or higher', () => {
  const verdict = assess(many(10, { engineAgreement: 0.95, averageLoss: 5 }));
  assert.ok(verdict.band === 'review' || verdict.band === 'high-risk', verdict.band);
  assert.ok(verdict.reasons.length > 0, 'a band above normal must say why');
});

test('⭐ and the reasons are readable sentences, not codes', () => {
  const verdict = assess(many(10, { engineAgreement: 0.95, averageLoss: 5 }));
  for (const reason of verdict.reasons) {
    assert.match(reason, /^[a-z]/, `not a sentence: ${reason}`);
    assert.ok(reason.length > 15, `too terse to be useful: ${reason}`);
  }
});

test('uniform thinking time regardless of difficulty contributes, when it is there', () => {
  const without = assess(many(10, { engineAgreement: 0.85, averageLoss: 20 }));
  const with_ = assess(many(10, { engineAgreement: 0.85, averageLoss: 20, timeVersusChoice: 0 }));
  assert.ok(with_.score > without.score, `${with_.score} was not above ${without.score}`);
});

test('a normal human time pattern does not contribute', () => {
  const verdict = assess(many(10, { engineAgreement: 0.85, averageLoss: 20, timeVersusChoice: 0.4 }));
  assert.ok(!verdict.reasons.some((reason) => /same time/.test(reason)));
});

test('the score never exceeds its own scale', () => {
  const verdict = assess(many(10, { engineAgreement: 1, averageLoss: 0, timeVersusChoice: -0.2 }));
  assert.ok(verdict.score <= 100, String(verdict.score));
});

/* ------------------------------------------------------------------ the promises */

test('⭐ every assessment carries the caveat, whatever the band', () => {
  // The one line that must never be separable from a band. If a future screen forgets it, the
  // sentence is still in the object it was handed.
  for (const games of [[], many(10), many(10, { engineAgreement: 0.99, averageLoss: 1 })]) {
    assert.equal(assess(games).caveat, FAIR_PLAY_CAVEAT);
  }
});

test('⭐ the caveat says the quiet part: strong play looks like this too', () => {
  assert.match(FAIR_PLAY_CAVEAT, /strong play looks like this too/i);
  assert.match(FAIR_PLAY_CAVEAT, /not a finding/i);
});

test('⭐ no band, at any level, forfeits anything automatically', () => {
  // The commitment the whole design rests on. A future edit that made high-risk auto-forfeit would
  // have to delete this test to do it, which is the point of writing it down as a test rather than
  // as a paragraph.
  for (const [band, consequence] of Object.entries(BAND_CONSEQUENCE)) {
    assert.doesNotMatch(consequence, /\bautomatic(ally)? (forfeit|ban|close)/i, band);
    assert.doesNotMatch(consequence, /\bbanned\b/i, band);
  }
  assert.match(BAND_CONSEQUENCE['high-risk'], /person looks/i);
  assert.match(BAND_CONSEQUENCE['high-risk'], /no forfeit is automatic/i);
});

test('and the two bands that do nothing say so plainly', () => {
  assert.match(BAND_CONSEQUENCE.normal, /^Nothing\./);
  assert.match(BAND_CONSEQUENCE.insufficient, /not the same as clean/i);
});

test('the assessment is a pure function of the games, in any order', () => {
  const games = [
    game({ engineAgreement: 0.9, averageLoss: 8 }),
    game({ engineAgreement: 0.7, averageLoss: 40 }),
    game({ engineAgreement: 0.95, averageLoss: 4 }),
    game({ engineAgreement: 0.6, averageLoss: 55 }),
    game({ engineAgreement: 0.8, averageLoss: 25 }),
    game({ engineAgreement: 0.88, averageLoss: 12 }),
  ];
  assert.deepEqual(assess(games), assess([...games].reverse()));
});
