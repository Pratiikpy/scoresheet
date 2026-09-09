/**
 * The staked pool, and the one property that has to hold: **the principal is never spent**.
 *
 * `SPEC.md` K7 makes that claim, and a claim about money is worth exactly as much as the test behind
 * it. So most of what is here is arithmetic pushed at its edges — a stake that has earned nothing, a
 * stake worth less than it started, a wallet holding principal that was never staked — and the
 * assertion is always the same: whatever comes out, it is smaller than what went in.
 *
 * The staking transactions themselves are built, signed and verified offline with `@nimiq/core`, so
 * what would go on chain is examined here without a chain.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transaction } from '@nimiq/core';
import { LUNA_PER_NIM } from '../src/pool.ts';
import { budgetFor, createStaking, type StakeReport, type StakingRpc } from '../src/staking.ts';

const KEY = '7f'.repeat(32);
const VALIDATOR = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';

function fakeChain(state: { staked?: number; liquid?: number; delegation?: string | null } = {}) {
  const broadcast: string[] = [];
  const rpc: StakingRpc = {
    blockNumber: async () => 4_200_123,
    staker: async () =>
      state.staked === undefined ? null : { balance: state.staked, delegation: state.delegation ?? VALIDATOR },
    balance: async () => state.liquid ?? 0,
    send: async (raw) => {
      // A node deserialises and verifies before it accepts, and so does this.
      const transaction = Transaction.deserialize(Uint8Array.from(Buffer.from(raw, 'hex')));
      transaction.verify(24);
      broadcast.push(raw);
      return `hash-${broadcast.length}`;
    },
  };
  return { rpc, broadcast };
}

const report = (over: Partial<StakeReport> = {}): StakeReport => ({
  stakedLuna: 1000 * LUNA_PER_NIM,
  validator: VALIDATOR,
  liquidLuna: 0,
  principalLuna: 1000 * LUNA_PER_NIM,
  earnedLuna: 0,
  ...over,
});

/* ------------------------------------------------------------------ the promise */

test('⭐ a stake that has earned nothing pays out nothing', async () => {
  // The day after delegating. There is a thousand NIM sitting there and none of it is ours to spend.
  assert.equal(budgetFor(report()), 0);
});

test('⭐ the budget never exceeds what was earned, at any input', () => {
  /*
   * The property the whole design rests on, swept rather than sampled. Whatever the stake, the
   * liquid balance and the principal, what may be paid out is less than what was earned — so no
   * combination of numbers can reach into the principal.
   */
  for (const principal of [0, 1, 500, 1000, 100_000]) {
    for (const staked of [0, 500, 1000, 100_000]) {
      for (const liquid of [0, 1, 50, 5_000]) {
        const earned = Math.max(0, staked + liquid - principal);
        const budget = budgetFor({
          stakedLuna: staked * LUNA_PER_NIM,
          validator: VALIDATOR,
          liquidLuna: liquid * LUNA_PER_NIM,
          principalLuna: principal * LUNA_PER_NIM,
          earnedLuna: earned * LUNA_PER_NIM,
        });
        assert.ok(budget >= 0, 'a budget is never negative');
        assert.ok(
          budget <= earned * LUNA_PER_NIM,
          `principal ${principal}, staked ${staked}, liquid ${liquid}: budget ${budget} exceeds ${earned * LUNA_PER_NIM} earned`,
        );
      }
    }
  }
});

test('a stake worth less than it started pays out nothing rather than a negative', async () => {
  // Slashing, or a mis-recorded principal. Either way the answer is zero and not an exception.
  assert.equal(budgetFor(report({ stakedLuna: 900 * LUNA_PER_NIM, earnedLuna: 0 })), 0);
});

test('⭐ rewards that have not been paid out yet cannot be spent', async () => {
  /*
   * Earnings can exist on paper — compounded into the stake — while the wallet holds nothing. The
   * budget is bounded by *both*, because a payout is an actual transaction from an actual balance:
   * a pool that promised what it could not send would fail at the moment somebody claimed.
   */
  const onPaper = budgetFor(report({ earnedLuna: 100 * LUNA_PER_NIM, liquidLuna: 0 }));
  assert.equal(onPaper, 0, 'earned but not liquid is not spendable');

  const inHand = budgetFor(report({ earnedLuna: 100 * LUNA_PER_NIM, liquidLuna: 100 * LUNA_PER_NIM }));
  assert.ok(inHand > 0);
});

test('the budget is a day of a fortnight, less a margin', () => {
  // Rewards arrive in lumps and payouts happen continuously. Paying everything the day it arrives
  // would empty the pool for the fortnight until the next one.
  const budget = budgetFor(report({ earnedLuna: 140 * LUNA_PER_NIM, liquidLuna: 140 * LUNA_PER_NIM }));
  assert.equal(budget, Math.floor((140 * LUNA_PER_NIM * 0.9) / 14));
  assert.ok(budget < 140 * LUNA_PER_NIM / 14, 'and the margin really is kept back');
});

/* ------------------------------------------------------------------ the transactions */

test('no key means no staking, which is a state rather than a failure', () => {
  const { rpc } = fakeChain();
  assert.equal(createStaking({ privateKeyHex: undefined, rpc, principalLuna: 0 }), undefined);
  assert.equal(createStaking({ privateKeyHex: 'nope', rpc, principalLuna: 0 }), undefined);
});

test('⭐ delegating produces a transaction a node accepts', async () => {
  const chain = fakeChain();
  const staking = createStaking({ privateKeyHex: KEY, rpc: chain.rpc, principalLuna: 0 })!;
  const hash = await staking.delegate(VALIDATOR, 1000 * LUNA_PER_NIM);

  assert.equal(hash, 'hash-1');
  const transaction = Transaction.deserialize(Uint8Array.from(Buffer.from(chain.broadcast[0]!, 'hex')));
  // Already verified inside the fake node; asserted again here so the reason is visible.
  assert.doesNotThrow(() => transaction.verify(24));
  assert.equal(transaction.value, BigInt(1000 * LUNA_PER_NIM));
  assert.equal(transaction.sender.toUserFriendlyAddress(), staking.address);
});

test('adding to an existing stake is a different transaction, and also valid', async () => {
  // Creating a staker that already exists is refused by the chain, so the two are separate calls.
  const chain = fakeChain({ staked: 1000 * LUNA_PER_NIM });
  const staking = createStaking({ privateKeyHex: KEY, rpc: chain.rpc, principalLuna: 0 })!;
  await staking.addStake(10 * LUNA_PER_NIM);

  const transaction = Transaction.deserialize(Uint8Array.from(Buffer.from(chain.broadcast[0]!, 'hex')));
  assert.doesNotThrow(() => transaction.verify(24));
  assert.equal(transaction.value, BigInt(10 * LUNA_PER_NIM));
});

/* ------------------------------------------------------------------ reading the stake */

test('⭐ the report counts the stake and the wallet, minus the principal', async () => {
  /*
   * Rewards land in the wallet rather than compounding into the stake, so counting only the staked
   * balance would report zero earnings forever — and counting only the wallet would treat unstaked
   * principal as profit. Both, minus the principal, is the honest sum.
   */
  const chain = fakeChain({ staked: 1000 * LUNA_PER_NIM, liquid: 7 * LUNA_PER_NIM });
  const staking = createStaking({
    privateKeyHex: KEY,
    rpc: chain.rpc,
    principalLuna: 1000 * LUNA_PER_NIM,
  })!;

  const state = await staking.report();
  assert.equal(state.stakedLuna, 1000 * LUNA_PER_NIM);
  assert.equal(state.liquidLuna, 7 * LUNA_PER_NIM);
  assert.equal(state.earnedLuna, 7 * LUNA_PER_NIM);
  assert.equal(state.validator, VALIDATOR);
});

test('a wallet that has never staked reports zero rather than throwing', async () => {
  const chain = fakeChain();
  const staking = createStaking({ privateKeyHex: KEY, rpc: chain.rpc, principalLuna: 0 })!;
  const state = await staking.report();
  assert.equal(state.stakedLuna, 0);
  assert.equal(state.validator, null);
});

test('a node that cannot be reached reports zero, and the budget follows', async () => {
  // A staking pool that paid out because it could not read its own balance would be the single worst
  // failure available here. Unreadable means zero, and zero means nothing is offered.
  const rpc: StakingRpc = {
    blockNumber: async () => 1,
    staker: async () => {
      throw new Error('node down');
    },
    balance: async () => {
      throw new Error('node down');
    },
    send: async () => 'x',
  };
  const staking = createStaking({ privateKeyHex: KEY, rpc, principalLuna: 1000 * LUNA_PER_NIM })!;
  const state = await staking.report();
  assert.equal(state.earnedLuna, 0);
  assert.equal(budgetFor(state), 0);
});
