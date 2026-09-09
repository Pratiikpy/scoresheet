/**
 * The pool, tested as somebody trying to drain it.
 *
 * A faucet with a weak limit is a faucet that is empty by lunchtime, and the failure is silent: the
 * app keeps working, nobody complains, and the money is simply gone. So most of what is here is an
 * attack — a thousand fresh wallets, one device; one wallet, a thousand devices; a send that fails
 * at the worst possible moment; a budget nudged one luna past its ceiling.
 *
 * The pure parts make that cheap: the clock is injected, the payout is injected, and the store is a
 * map. Nothing here touches a chain.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LUNA_PER_NIM, createPool, memoFor, type Claim, type ClaimStore, type Payout } from '../src/pool.ts';

const DAY = '2026-09-07';
const PUZZLE = 'r1bqkb1r/pppp1ppp/2n2n2/4p3|e4e5';

function harness(options: { funded?: boolean; budgetNim?: number; rewardNim?: number } = {}) {
  const claims: Claim[] = [];
  const sent: { to: string; amount: number; memo: string }[] = [];
  let balance = 1000 * LUNA_PER_NIM;
  let sendFails = false;

  const store: ClaimStore = {
    forDay: async (day) => claims.filter((claim) => claim.day === day),
    record: async (claim) => {
      // The real stores replace by (day, address); this mirrors that so a re-record is not a second
      // claim — which is exactly the shape the double-payment tests depend on.
      const at = claims.findIndex((existing) => existing.day === claim.day && existing.address === claim.address);
      if (at === -1) claims.push(claim);
      else claims[at] = claim;
    },
  };

  const payout: Payout = {
    send: async (to, amount, memo) => {
      if (sendFails) throw new Error('the node refused it');
      sent.push({ to, amount, memo });
      balance -= amount;
      return `hash-${sent.length}`;
    },
    spendable: async () => balance,
  };

  const pool = createPool({
    store,
    now: () => 1_700_000_000_000,
    config: {
      rewardLuna: (options.rewardNim ?? 0.5) * LUNA_PER_NIM,
      dailyBudgetLuna: (options.budgetNim ?? 10) * LUNA_PER_NIM,
    },
    payout: options.funded === false ? undefined : payout,
  });

  return {
    pool,
    claims,
    sent,
    setBalance: (nim: number) => {
      balance = nim * LUNA_PER_NIM;
    },
    breakSending: () => {
      sendFails = true;
    },
  };
}

const claimAs = (address: string, device: string) => ({ address, device, day: DAY, puzzleId: PUZZLE });

/* ------------------------------------------------------------------ the happy path */

test('a solved daily puzzle pays, once', async () => {
  const kit = harness();
  const first = await kit.pool.claim(claimAs('NQ01', 'device-a'));
  assert.equal(first.ok, true);
  assert.equal(kit.sent.length, 1);
  assert.equal(kit.sent[0]!.amount, 0.5 * LUNA_PER_NIM);
});

test('⭐ every payout carries the puzzle in its memo', async () => {
  /*
   * `SPEC.md` P2, and the difference between "every payout is public" meaning something and meaning
   * "trust our page". Sixty-four bytes make the pool's whole history auditable by a stranger with a
   * block explorer and nothing else.
   */
  const kit = harness();
  await kit.pool.claim(claimAs('NQ01', 'device-a'));
  const memo = kit.sent[0]!.memo;
  assert.ok(memo.includes(DAY), memo);
  assert.ok(memo.length <= 64, `${memo.length} bytes is past Nimiq's limit`);
  assert.match(memo, /^[\x20-\x7e]+$/, 'readable as text in any explorer');
});

test('a very long puzzle id still fits the field', () => {
  // Nimiq's data field is 64 bytes. A memo that overflows is a transaction that is refused, and the
  // payout would fail for the one puzzle whose id happened to be long.
  const memo = memoFor('x'.repeat(400), DAY);
  assert.ok(memo.length <= 64, `${memo.length} bytes`);
});

/* ------------------------------------------------------------------ draining it */

test('⭐ one wallet cannot claim twice in a day', async () => {
  const kit = harness();
  await kit.pool.claim(claimAs('NQ01', 'device-a'));
  const second = await kit.pool.claim(claimAs('NQ01', 'device-a'));
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.reason, 'already-claimed');
  assert.equal(kit.sent.length, 1);
});

test('⭐ a thousand fresh wallets from one device get one payout between them', async () => {
  /*
   * The attack that matters, and the reason a per-address limit alone is no limit at all: wallets
   * are free and unlimited, and a script can make a thousand in a second. The device identifier is
   * what stands between the pool and a shell loop.
   */
  const kit = harness({ budgetNim: 1000 });
  for (let i = 0; i < 1000; i++) {
    await kit.pool.claim(claimAs(`NQ${String(i).padStart(4, '0')}`, 'one-device'));
  }
  assert.equal(kit.sent.length, 1, `${kit.sent.length} payouts went to one device`);
});

test('and one wallet across many devices also gets one', async () => {
  const kit = harness({ budgetNim: 1000 });
  for (let i = 0; i < 50; i++) {
    await kit.pool.claim(claimAs('NQ01', `device-${i}`));
  }
  assert.equal(kit.sent.length, 1);
});

test('⭐ the daily budget is a ceiling nothing can cross', async () => {
  /*
   * "The principal is never touched" (K7) has to be true in code, not only in prose. The budget is
   * the day's staking reward less a margin, and when it is reached the pool stops paying — it does
   * not pay a little more and take the difference from the stake.
   */
  const kit = harness({ rewardNim: 1, budgetNim: 3 });
  for (let i = 0; i < 10; i++) {
    await kit.pool.claim(claimAs(`NQ${i}`, `device-${i}`));
  }
  assert.equal(kit.sent.length, 3, 'exactly the budget, and not one payout more');

  const refused = await kit.pool.claim(claimAs('NQ99', 'device-99'));
  assert.equal(refused.ok === false && refused.reason, 'budget-spent');
});

test('a reward that would cross the ceiling is refused rather than trimmed', async () => {
  // Paying a partial reward would be a worse answer than paying none: it is a surprise, it is
  // impossible to explain on a screen, and it still spends past what the rewards covered.
  const kit = harness({ rewardNim: 2, budgetNim: 3 });
  assert.equal((await kit.pool.claim(claimAs('NQ01', 'a'))).ok, true);
  const second = await kit.pool.claim(claimAs('NQ02', 'b'));
  assert.equal(second.ok === false && second.reason, 'budget-spent');
  assert.equal(kit.sent.length, 1);
});

test('tomorrow is a new budget and a new claim', async () => {
  const kit = harness({ rewardNim: 1, budgetNim: 1 });
  await kit.pool.claim(claimAs('NQ01', 'a'));
  const tomorrow = await kit.pool.claim({ address: 'NQ01', device: 'a', day: '2026-09-08', puzzleId: PUZZLE });
  assert.equal(tomorrow.ok, true);
  assert.equal(kit.sent.length, 2);
});

/* ------------------------------------------------------------------ an unfunded pool */

test('⭐ an unfunded pool says so, and is not a failure', async () => {
  /*
   * A pool with no key is a normal state: it is how this runs in development, in every test, and on
   * the day before the wallet is funded. The whole path is built either way, and the app says the
   * pool is not funded rather than pretending a claim worked.
   */
  const kit = harness({ funded: false });
  const outcome = await kit.pool.claim(claimAs('NQ01', 'a'));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, 'not-funded');
  assert.equal(outcome.ok === false && outcome.retryTomorrow, false, 'tomorrow will not help');

  const status = await kit.pool.status(DAY);
  assert.equal(status.funded, false);
});

test('a pool that has run out of balance refuses rather than failing to send', async () => {
  const kit = harness();
  kit.setBalance(0.1);
  const outcome = await kit.pool.claim(claimAs('NQ01', 'a'));
  assert.equal(outcome.ok === false && outcome.reason, 'not-funded');
  assert.equal(kit.sent.length, 0);
});

/* ------------------------------------------------------------------ when sending breaks */

test('⭐ a send that fails does not become a second chance to be paid', async () => {
  /*
   * The claim is recorded before the send, on purpose. A failed send therefore leaves a claim with
   * no hash, which an operator can see and reissue by hand — and the alternative, reversing the
   * claim, hands a caller who can make sending fail a way to be paid repeatedly. One of those two
   * mistakes is recoverable and the other is not.
   */
  const kit = harness();
  kit.breakSending();
  const outcome = await kit.pool.claim(claimAs('NQ01', 'a'));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok === true && outcome.hash, null, 'and it is honest that nothing went out');

  const again = await kit.pool.claim(claimAs('NQ01', 'a'));
  assert.equal(again.ok, false, 'the claim still stands');
  assert.equal(kit.claims.filter((claim) => claim.address === 'NQ01').length, 1);
});

/* ------------------------------------------------------------------ what a screen can say */

test('status reports what is left today, so a screen can be honest about it', async () => {
  const kit = harness({ rewardNim: 1, budgetNim: 5 });
  await kit.pool.claim(claimAs('NQ01', 'a'));
  await kit.pool.claim(claimAs('NQ02', 'b'));

  const status = await kit.pool.status(DAY);
  assert.equal(status.funded, true);
  assert.equal(status.spentTodayLuna, 2 * LUNA_PER_NIM);
  assert.equal(status.remainingTodayLuna, 3 * LUNA_PER_NIM);
});
