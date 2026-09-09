/**
 * Sending NIM from the player's own wallet.
 *
 * The guards matter more than the happy path here, because this is the one part of the app that
 * moves somebody's money. Three of them are load-bearing:
 *
 *  - **A memo that would not fit is refused before anything is sent.** Nimiq's data field is 64
 *    bytes; the pool's first version let a memo truncate and produced one that identified nothing.
 *  - **A resolved promise is not a success.** The provider is documented as returning
 *    `Promise<string | ErrorResponse>`, so treating any resolve as "sent" is how an app reports a
 *    payment the person declined.
 *  - **Declining is calm, not an error.** It is the commoner of the two outcomes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LUNA_PER_NIM, memoFits, poolMemo, tipMemo } from '../src/send-nim.ts';

const A = 'NQ84BAFBNAMP3U04TQMYQTMC3BQEPFL6PMTP';

/** A window with a provider that records what it was given. */
function withProvider(send: (tx: unknown) => Promise<unknown>): { calls: unknown[] } {
  const calls: unknown[] = [];
  (globalThis as { window?: unknown }).window = {
    nimiq: {
      sendBasicTransactionWithData: (tx: unknown) => {
        calls.push(tx);
        return send(tx);
      },
    },
    nimiqPay: { language: 'en' },
    navigator: { language: 'en' },
  };
  // `i18n.ts` reads `window.nimiqPay` and `navigator.language`; both must exist for `t()` to work.
  (globalThis as { navigator?: unknown }).navigator ??= { language: 'en' };
  return { calls };
}

/* ------------------------------------------------------------------ the memo */

test('a memo fits in a Nimiq data field', () => {
  assert.equal(memoFits('chess tip 0123456789abcdef'), true);
  assert.equal(memoFits('chess pool 2026-09-07'), true);
});

test('and one that would not fit is refused', () => {
  assert.equal(memoFits('x'.repeat(64)), true);
  assert.equal(memoFits('x'.repeat(65)), false);
});

test('⭐ and it is measured in bytes, not characters', () => {
  // Sixty-four accented characters are 128 bytes. A length check on `.length` would let it through
  // and the chain would truncate it — which is exactly how the pool's first memo lost its meaning.
  assert.equal(memoFits('é'.repeat(64)), false);
  assert.equal(memoFits('é'.repeat(32)), true);
});

test('a tip memo names the game, and fits', () => {
  const memo = tipMemo('0123456789abcdef0123456789abcdef');
  assert.ok(memo.includes('0123456789abcdef'));
  assert.ok(memoFits(memo), memo);
});

test('a pool memo names the day, and fits', () => {
  const memo = poolMemo('2026-09-07');
  assert.ok(memo.includes('2026-09-07'));
  assert.ok(memoFits(memo), memo);
});

/* ------------------------------------------------------------------ sending */

test('the amount is converted to luna', async () => {
  const { calls } = withProvider(async () => 'a'.repeat(64));
  const { sendNim } = await import('../src/send-nim.ts');
  const outcome = await sendNim({ to: A, nim: 25, memo: 'chess tip abc' });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls[0], { recipient: A, value: 25 * LUNA_PER_NIM, data: 'chess tip abc' });
});

test('⭐ an error object is not a success', async () => {
  /*
   * The provider resolves with `string | ErrorResponse`. An app that took any resolve as "sent"
   * would tell somebody their money had moved when they had just tapped "no".
   */
  withProvider(async () => ({ error: { type: 'CANCELED', message: 'no' } }));
  const { sendNim } = await import('../src/send-nim.ts');
  const outcome = await sendNim({ to: A, nim: 5, memo: 'chess tip abc' });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.tone, 'calm', 'declining must not read as a failure');
});

test('and an empty string is not a transaction hash', async () => {
  withProvider(async () => '');
  const { sendNim } = await import('../src/send-nim.ts');
  assert.equal((await sendNim({ to: A, nim: 5, memo: 'x' })).ok, false);
});

test('a memo that would not fit never reaches the wallet', async () => {
  const { calls } = withProvider(async () => 'a'.repeat(64));
  const { sendNim } = await import('../src/send-nim.ts');
  const outcome = await sendNim({ to: A, nim: 5, memo: 'x'.repeat(80) });
  assert.equal(outcome.ok, false);
  assert.equal(calls.length, 0, 'a bad memo was sent to the wallet anyway');
});

test('and neither does an impossible amount', async () => {
  const { calls } = withProvider(async () => 'a'.repeat(64));
  const { sendNim } = await import('../src/send-nim.ts');
  for (const nim of [0, -5, Number.NaN]) {
    assert.equal((await sendNim({ to: A, nim, memo: 'x' })).ok, false, `${nim} was allowed`);
  }
  assert.equal(calls.length, 0);
});

test('a wallet that throws is reported, not crashed through', async () => {
  withProvider(async () => {
    throw new Error('the user rejected the request');
  });
  const { sendNim } = await import('../src/send-nim.ts');
  const outcome = await sendNim({ to: A, nim: 5, memo: 'x' });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.tone, 'calm', 'a rejection is not our failure');
});

test('and no provider at all says where to find one', async () => {
  (globalThis as { window?: unknown }).window = { nimiqPay: { language: 'en' } };
  const { sendNim } = await import('../src/send-nim.ts');
  const outcome = await sendNim({ to: A, nim: 5, memo: 'x' });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.message, /Nimiq Pay/);
});
