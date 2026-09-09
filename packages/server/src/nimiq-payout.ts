/**
 * Paying out in real NIM.
 *
 * The one file that touches money. Everything above it — eligibility, the abuse limits, the daily
 * ceiling — is pure and tested; this is the part that needs a funded wallet and a node, and it is
 * kept small and separate for exactly that reason.
 *
 * **The transaction is built and signed here, and only broadcast by the node.** The private key
 * never leaves this process and is never sent anywhere: `@nimiq/core` builds the transaction
 * offline, signs it, and what goes to the RPC endpoint is the serialised, already-signed bytes. That
 * matters because a public RPC node is somebody else's server, and handing it a key would be handing
 * it the pool.
 *
 * ## What is needed to turn it on
 *
 * Two environment variables, and nothing else:
 *
 *  - `POOL_PRIVATE_KEY` — 64 hex characters, the pool wallet's private key.
 *  - `NIMIQ_RPC` — a node that accepts `sendRawTransaction`. The default public one does.
 *
 * Without the key the pool reports itself unfunded and every screen says so plainly (`pool.ts`).
 * **The path is complete either way** — this is not a stub, and nothing about it changes when the
 * key arrives.
 */

import {
  Address,
  KeyPair,
  PrivateKey,
  SignatureProof,
  Transaction,
  TransactionFlag,
} from '@nimiq/core';
import type { Payout } from './pool.ts';

/** Nimiq's mainnet network id. Transactions carry it, so one cannot be replayed on another network. */
const MAINNET_ID = 24;
const TESTNET_ID = 5;

/**
 * How long a transaction stays valid, in blocks.
 *
 * Nimiq refuses a transaction whose validity start height is too far from the head, so this cannot
 * be generous. Two hundred blocks is a few minutes — long enough for a slow node, short enough that
 * a transaction built during an outage does not land unexpectedly an hour later.
 */
const VALIDITY_WINDOW = 200;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: { data?: T } | T; error?: { message?: string } };
  if (payload.error) throw new Error(`${method}: ${payload.error.message ?? 'rejected'}`);
  // Nimiq's RPC wraps results in `{ data }`; some proxies do not.
  const result = payload.result as { data?: T } | T | undefined;
  if (result && typeof result === 'object' && 'data' in result) return (result as { data: T }).data;
  return result as T;
}

/**
 * Build a payout that can actually send.
 *
 * Returns `undefined` when there is no key, which is how `pool.ts` learns that the pool is not
 * funded — a state, not an error.
 */
export function createNimiqPayout(options: {
  privateKeyHex: string | undefined;
  rpcUrl: string;
  network?: 'main' | 'test';
}): Payout | undefined {
  if (!options.privateKeyHex || !/^[0-9a-f]{64}$/i.test(options.privateKeyHex)) return undefined;

  const keyPair = KeyPair.derive(PrivateKey.fromHex(options.privateKeyHex));
  const from = keyPair.toAddress();
  const networkId = options.network === 'test' ? TESTNET_ID : MAINNET_ID;
  const encoder = new TextEncoder();

  return {
    async spendable(): Promise<number | null> {
      try {
        const account = await rpc<{ balance?: number }>(options.rpcUrl, 'getAccountByAddress', [
          from.toUserFriendlyAddress(),
        ]);
        return typeof account?.balance === 'number' ? account.balance : null;
      } catch {
        // Unreadable balance is not "no money" — it is "we do not know". The caller treats `null` as
        // unknown and goes ahead, because refusing to pay because a node was slow is the worse error.
        return null;
      }
    },

    async send(to: string, amount: number, memo: string): Promise<string> {
      const height = await rpc<number>(options.rpcUrl, 'getBlockNumber', []);

      /*
       * An extended transaction, because a basic one has nowhere to put the memo.
       *
       * `SPEC.md` P2 is the whole reason: the sixty-four data bytes carry the puzzle id, so the
       * payout explains itself on chain forever with no server involved. A basic transaction would
       * be cheaper and would make the pool's history a list of unexplained transfers.
       */
      const data = encoder.encode(memo);
      if (data.length > 64) throw new Error('the memo is longer than Nimiq allows');

      const transaction = new Transaction(
        from,
        0, // sender type: basic
        new Uint8Array(0),
        Address.fromUserFriendlyAddress(to),
        0, // recipient type: basic
        data,
        BigInt(amount),
        BigInt(0), // Nimiq's fee is zero for a transaction this size.
        TransactionFlag.None,
        Math.max(1, height - 1),
        networkId,
      );

      /*
       * A `SignatureProof`, not a raw signature.
       *
       * Nimiq's proof field carries a public key, a merkle path and a signature — not the 64 bytes
       * `sign()` returns. Assigning the raw signature produced a transaction that serialised without
       * complaint and failed `verify()` with "Invalid serialization", which a node would have
       * rejected after the pool had already recorded the claim. It was caught by building one and
       * verifying it, which is what `nimiq-payout.test.ts` now does on every run.
       */
      const signature = keyPair.sign(transaction.serializeContent());
      transaction.proof = SignatureProof.singleSig(keyPair.publicKey, signature).serialize();
      // Signed locally; only the finished bytes are handed to somebody else's node.
      const raw = Buffer.from(transaction.serialize()).toString('hex');
      return rpc<string>(options.rpcUrl, 'sendRawTransaction', [raw]);
    },
  };
}

/** The pool's own address, for a screen that wants to link to it. Derived, never written down. */
export function poolAddress(privateKeyHex: string | undefined): string | null {
  if (!privateKeyHex || !/^[0-9a-f]{64}$/i.test(privateKeyHex)) return null;
  return KeyPair.derive(PrivateKey.fromHex(privateKeyHex)).toAddress().toUserFriendlyAddress();
}

export { VALIDITY_WINDOW };
