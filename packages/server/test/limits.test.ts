/**
 * The rate limits, tested from both sides: does it stop a script, and does it stay out of the way
 * of somebody playing bullet?
 *
 * The second half matters as much as the first. A limit that made a player lose on time because
 * they moved quickly would be worse than the abuse it prevents, so the move bucket is checked
 * against a faster game than any human plays.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, createRateLimiter, limitFor } from '../src/limits.ts';

/** A limiter whose clock a test can move. */
function harness(startAt = 1_000_000) {
  let clock = startAt;
  return {
    limiter: createRateLimiter(() => clock),
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

test('a burst within the bucket is allowed', () => {
  const kit = harness();
  for (let i = 0; i < LIMITS.create.capacity; i++) {
    assert.equal(kit.limiter.take('someone', 'create'), true, `refused at ${i}`);
  }
});

test('⭐ and the one after it is refused', () => {
  const kit = harness();
  for (let i = 0; i < LIMITS.create.capacity; i++) kit.limiter.take('someone', 'create');
  assert.equal(kit.limiter.take('someone', 'create'), false);
});

test('⭐ a script cannot make a million games', () => {
  // The failure this exists to prevent: a loop that fills a disk and takes the server down for
  // everybody mid-match.
  const kit = harness();
  let allowed = 0;
  for (let i = 0; i < 1000; i++) if (kit.limiter.take('a-script', 'create')) allowed += 1;
  assert.equal(allowed, LIMITS.create.capacity, `${allowed} of 1000 got through`);
});

test('⭐ but somebody playing bullet is never stopped', () => {
  /*
   * The half that is easy to forget. Bullet is a move a second and a scramble is faster; a limit
   * that flagged a player for moving quickly would cost them the game, which is worse than the
   * abuse it prevents.
   *
   * Two moves a second for three minutes — faster than any human sustains — must pass entirely.
   */
  const kit = harness();
  for (let move = 0; move < 360; move++) {
    assert.equal(kit.limiter.take('a-player', 'move'), true, `refused at move ${move}`);
    kit.tick(500);
  }
});

test('and polling a game all day is fine', () => {
  // Every open game polls a few times a second. If this were tight, the product would rate-limit
  // its own real-time layer.
  const kit = harness();
  for (let poll = 0; poll < 2000; poll++) {
    assert.equal(kit.limiter.take('a-player', 'poll'), true, `refused at poll ${poll}`);
    kit.tick(500);
  }
});

test('the bucket refills over time, so a refusal is never permanent', () => {
  const kit = harness();
  for (let i = 0; i < LIMITS.create.capacity; i++) kit.limiter.take('someone', 'create');
  assert.equal(kit.limiter.take('someone', 'create'), false);

  // Six seconds a token, so a minute restores the lot.
  kit.tick(60_000);
  assert.equal(kit.limiter.take('someone', 'create'), true);
});

test('⭐ being refused does not restart the refill', () => {
  /*
   * The bug a naive implementation has: stamping the clock on every attempt means somebody hammering
   * the endpoint never accrues anything at all — so a client retrying in a loop is locked out
   * forever, and a polite caller recovers faster than a rude one, which is backwards.
   *
   * The assertion is that *some* of a long run of retries get through. It cannot be "the last one
   * succeeds": each success spends the token that accrued, so a hammering caller hovers near empty
   * by design. The first version of this test asserted the last attempt and failed for that reason —
   * the limiter was right and the expectation was not.
   */
  const kit = harness();
  for (let i = 0; i < LIMITS.create.capacity; i++) kit.limiter.take('someone', 'create');
  assert.equal(kit.limiter.take('someone', 'create'), false, 'empty to start with');

  let letThrough = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (kit.limiter.take('someone', 'create')) letThrough += 1;
    kit.tick(1000);
  }

  // Sixty seconds at ten a minute is ten tokens, and they were earned while being refused.
  assert.ok(letThrough >= 8, `only ${letThrough} got through in a minute of retrying`);
  assert.ok(letThrough <= 12, `${letThrough} is more than the bucket should ever refill`);
});

test('one caller cannot spend another caller’s allowance', () => {
  const kit = harness();
  for (let i = 0; i < LIMITS.create.capacity; i++) kit.limiter.take('noisy', 'create');
  assert.equal(kit.limiter.take('noisy', 'create'), false);
  assert.equal(kit.limiter.take('quiet', 'create'), true, 'a different caller is unaffected');
});

test('and the buckets are separate per kind, so moving does not cost a claim', () => {
  const kit = harness();
  for (let i = 0; i < LIMITS.move.capacity; i++) kit.limiter.take('someone', 'move');
  assert.equal(kit.limiter.take('someone', 'move'), false);
  assert.equal(kit.limiter.take('someone', 'claim'), true);
});

test('⭐ a stream of unique callers cannot grow the table without bound', () => {
  // Every distinct key makes an entry, and an attacker produces keys faster than players do. A
  // bucket that has been full for a while is indistinguishable from one that never existed.
  const kit = harness();
  for (let i = 0; i < 12_000; i++) kit.limiter.take(`caller-${i}`, 'other');
  const before = kit.limiter.size();

  kit.tick(10 * 60 * 1000);
  for (let i = 0; i < 12_000; i++) kit.limiter.take(`later-${i}`, 'other');
  assert.ok(kit.limiter.size() < before + 12_000, `grew to ${kit.limiter.size()} from ${before}`);
});

test('the limit a request falls under is decided by the route, not by the caller', () => {
  // Nothing a caller sends may talk it out of the tight bucket.
  assert.equal(limitFor('POST', '/api/game'), 'create');
  assert.equal(limitFor('POST', '/api/game/abc/move'), 'move');
  assert.equal(limitFor('POST', '/api/pool/claim'), 'claim');
  assert.equal(limitFor('GET', '/api/game/abc'), 'poll');
  assert.equal(limitFor('GET', '/api/health'), 'other');
});
