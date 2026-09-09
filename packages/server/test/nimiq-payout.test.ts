/**
 * The one file that spends money, checked without spending any.
 *
 * A payout is built, signed and verified entirely offline — `@nimiq/core` does all three — so the
 * transaction that would go on chain is examined here in full: its signature, its recipient, its
 * amount, and the memo that makes the pool auditable by a stranger.
 *
 * This is not ceremony. The first version assigned the raw 64-byte signature to the proof field
 * instead of a `SignatureProof`. It serialised without complaint, looked entirely correct, and
 * `verify()` refused it — meaning a real node would have rejected the transaction *after* the pool
 * had recorded the claim, and the player would have been marked paid and received nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair, PrivateKey, Transaction } from '@nimiq/core';
import { createNimiqPayout, poolAddress } from '../src/nimiq-payout.ts';
import { LUNA_PER_NIM, memoFor } from '../src/pool.ts';

const KEY = '11'.repeat(32);
const TO = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';

/** A fetch that answers the two RPC calls a payout makes, and keeps what it was asked to broadcast. */
function fakeNode() {
  const sent: string[] = [];
  const fetchImpl = async (_url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { method: string; params: unknown[] };
    if (body.method === 'getBlockNumber') {
      return new Response(JSON.stringify({ result: { data: 4_200_000 } }), { status: 200 });
    }
    if (body.method === 'getAccountByAddress') {
      return new Response(JSON.stringify({ result: { data: { balance: 500 * LUNA_PER_NIM } } }), { status: 200 });
    }
    if (body.method === 'sendRawTransaction') {
      sent.push(String(body.params[0]));
      return new Response(JSON.stringify({ result: { data: 'abc123' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'unknown method' } }), { status: 400 });
  };
  return { sent, fetchImpl };
}

test('no key means no payout, which is a state rather than a failure', () => {
  assert.equal(createNimiqPayout({ privateKeyHex: undefined, rpcUrl: 'http://x' }), undefined);
  assert.equal(createNimiqPayout({ privateKeyHex: 'not hex', rpcUrl: 'http://x' }), undefined);
  assert.equal(createNimiqPayout({ privateKeyHex: 'ab', rpcUrl: 'http://x' }), undefined);
});

test('the pool address is derived from the key, never written down', () => {
  const derived = poolAddress(KEY);
  assert.ok(derived);
  assert.equal(derived, KeyPair.derive(PrivateKey.fromHex(KEY)).toAddress().toUserFriendlyAddress());
  assert.equal(poolAddress(undefined), null);
});

test('⭐ the transaction it would send is valid, and says what it is for', async () => {
  const node = fakeNode();
  const original = globalThis.fetch;
  globalThis.fetch = node.fetchImpl as typeof fetch;
  try {
    const payout = createNimiqPayout({ privateKeyHex: KEY, rpcUrl: 'http://node.test' })!;
    const memo = memoFor('a-puzzle-id', '2026-09-07');
    const hash = await payout.send(TO, 0.5 * LUNA_PER_NIM, memo);
    assert.equal(hash, 'abc123');
    assert.equal(node.sent.length, 1);

    // What the node was actually handed, read back the way the node reads it.
    const raw = Uint8Array.from(Buffer.from(node.sent[0]!, 'hex'));
    const transaction = Transaction.deserialize(raw);

    assert.doesNotThrow(() => transaction.verify(24), 'the signature must be valid or a node refuses it');
    assert.equal(transaction.recipient.toUserFriendlyAddress().replace(/\s/g, ''), TO);
    assert.equal(transaction.value, BigInt(0.5 * LUNA_PER_NIM));
    assert.equal(new TextDecoder().decode(transaction.data), memo, 'the memo survives the round trip');
    assert.equal(
      transaction.sender.toUserFriendlyAddress(),
      KeyPair.derive(PrivateKey.fromHex(KEY)).toAddress().toUserFriendlyAddress(),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('the balance is read, and an unreadable one is "unknown" rather than zero', async () => {
  const original = globalThis.fetch;
  const node = fakeNode();
  globalThis.fetch = node.fetchImpl as typeof fetch;
  try {
    const payout = createNimiqPayout({ privateKeyHex: KEY, rpcUrl: 'http://node.test' })!;
    assert.equal(await payout.spendable(), 500 * LUNA_PER_NIM);
  } finally {
    globalThis.fetch = original;
  }

  // A node that is down must not be read as "the pool is empty" — refusing to pay because somebody
  // else's server was slow is the worse of the two errors.
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  try {
    const payout = createNimiqPayout({ privateKeyHex: KEY, rpcUrl: 'http://node.test' })!;
    assert.equal(await payout.spendable(), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('a memo longer than Nimiq allows is refused before it is signed', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = fakeNode().fetchImpl as typeof fetch;
  try {
    const payout = createNimiqPayout({ privateKeyHex: KEY, rpcUrl: 'http://node.test' })!;
    await assert.rejects(() => payout.send(TO, 1000, 'x'.repeat(65)), /longer than Nimiq allows/);
  } finally {
    globalThis.fetch = original;
  }
});
