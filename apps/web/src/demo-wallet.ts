/**
 * A stand-in wallet, for a desktop with no Nimiq Pay.
 *
 * Enabled only by `?demo=1`, and it announces itself on every screen it touches. It exists so the
 * whole path — connect, sign, store, verify, recompute — can be walked by somebody who has not
 * installed anything, which is the difference between a judge seeing the entry and a judge seeing a
 * wall.
 *
 * **It signs with a real Ed25519 key, derived from a publicly known seed.**
 *
 * The first version returned bytes of the right length from a hash and called them a signature.
 * They were structurally valid and cryptographically meaningless — and the recompute page correctly
 * refused every one of them, which meant the single most important screen in the entry demonstrated
 * nothing at all on a desktop. That was the demo undermining the thing it exists to demonstrate.
 *
 * So the key is real and the signatures verify. What is *not* real is the secrecy: the seed is in
 * this file, so anybody can sign as this address. That is exactly the right trade, and it is the
 * same one `bot-identity.ts` makes — a demo proves the *mechanism*, and the mechanism is worth
 * nothing if it cannot be checked. Every screen says which it is.
 *
 * A real provider always wins: `?demo=1` inside Nimiq Pay does nothing, so the flag can never be
 * used to make a genuine-looking signature that is not one.
 */

import type { NimiqProvider } from '@nimiq/mini-app-sdk';
import { getPublicKeyAsync, signAsync } from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { addressFromPublicKey, signedMessageDigest } from './verify-browser.ts';

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A deterministic 32-byte secret from a seed phrase. Public by construction, and that is the point. */
function secretFrom(seed: string): Uint8Array {
  return sha256(encoder.encode(`scoresheet:demo:${seed}`));
}

/**
 * Every public key whose secret is printed somewhere in this repository.
 *
 * The record page reads this to decide whether to caveat a rating, and that decision cannot be made
 * from `?demo=1`: a record lives at `/r/<address>`, which carries no flag, so a stranger following a
 * shared link would have seen a published-key rating presented as an ordinary one. **The signatures
 * are the evidence, not the URL** — a game signed by one of these keys is one anybody could have
 * produced, wherever it is being read.
 *
 * Written out rather than derived so the record page stays synchronous, and pinned by a test
 * (`demo-wallet.test.ts`) that re-derives them from the seeds, so the two can never drift apart.
 */
export const PUBLISHED_KEYS: ReadonlySet<string> = new Set([
  '1948ba9a1dff1a6a5fae889385f5d5aa19db0be1709cdbc6e4d8b7dbf12905a9', // stand-in wallet, ?as=a
  'cb4c92c1069650cb4de2f86955d148022eaf44b2425f8470d71cf7733e2379bb', // stand-in wallet, ?as=b
  '9fecf1d01d3c57b554f34ec773bae7b4d5d1109c3628967db948555deba3bf03', // the bot — see bot-identity.ts
]);

/** The seeds `PUBLISHED_KEYS` covers, so the test can re-derive them rather than trusting the list. */
export const DEMO_SEEDS = ['a', 'b'] as const;

/** Exposed for that test, and for nothing else. */
export function demoSecret(seed: string): Uint8Array {
  return secretFrom(seed);
}

/** Is the app running with the stand-in wallet? Screens ask so they can say so. */
export function isDemo(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
}

/**
 * Install the stand-in, if asked for and if there is no real provider.
 *
 * `?as=b` gives a second identity, so one person on one machine can play both sides of a game and
 * see a real two-signature scoresheet — which is the only way to demonstrate a *rated* game without
 * finding a second person.
 */
export function installDemoWallet(): void {
  if (!isDemo() || typeof window === 'undefined' || window.nimiq !== undefined) return;

  const params = new URLSearchParams(window.location.search);
  const secret = secretFrom(params.get('as') ?? 'a');

  /*
   * The key is derived once, lazily, and every call waits on the same promise. Deriving it per call
   * would be wasteful; deriving it at install time would make installation async for no reason.
   */
  const identity = (async () => {
    const publicKey = await getPublicKeyAsync(secret);
    const publicKeyHex = toHex(publicKey);
    return { publicKeyHex, address: addressFromPublicKey(publicKeyHex) };
  })();

  window.nimiq = {
    listAccounts: async () => [(await identity).address],
    sign: async (input) => {
      const message = typeof input === 'string' ? input : input.message;
      const { publicKeyHex } = await identity;
      // The same digest a wallet hashes, so the signature is valid against the same rules.
      const signature = await signAsync(signedMessageDigest(message), secret);
      return { publicKey: publicKeyHex, signature: toHex(signature) };
    },
    // A plausible mainnet height that advances, so the ordering key is a real number and two games
    // signed a minute apart order correctly rather than tying.
    getBlockNumber: async () => 4_200_000 + Math.floor(Date.now() / 60_000) % 100_000,
    isConsensusEstablished: async () => true,
    /**
     * Sending NIM, with the real contract and no real money.
     *
     * **The shape matters more than the result.** The provider takes one options object and resolves
     * with `string | ErrorResponse` rather than only throwing, and a stand-in that took positional
     * arguments — or that always returned a hash — would let a broken send path pass every test.
     * That is exactly how `requestDeviceIdentifier` shipped with the wrong signature.
     *
     * `?decline=1` makes it refuse, so the path where somebody says no in their wallet is exercised
     * too. It is the commoner outcome of the two and the one that must not read as a failure.
     */
    sendBasicTransactionWithData: async (tx) => {
      if (typeof tx !== 'object' || tx === null) throw new Error('sendBasicTransactionWithData takes an object');
      const { recipient, value, data } = tx as { recipient?: unknown; value?: unknown; data?: unknown };
      if (typeof recipient !== 'string' || !recipient) throw new Error('no recipient');
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('bad value');
      if (typeof data !== 'string') throw new Error('no data');
      // The chain's own limit, enforced here so a memo that would be truncated fails in a test.
      if (encoder.encode(data).byteLength > 64) throw new Error('data is longer than 64 bytes');

      if (params.get('decline') === '1') {
        return { error: { type: 'CANCELED', message: 'The user cancelled.' } };
      }
      // A plausible hash: 32 bytes of hex, derived from the transaction so it is stable per send.
      return toHex(sha256(encoder.encode(`tx:${recipient}:${value}:${data}`)));
    },
    /*
     * ⭐ Checked against Nimiq's own signatures, then bridged to the class.
     *
     * `satisfies` is doing the work: every method above is type-checked against the SDK's real
     * declaration, so a stand-in that took positional arguments or returned the wrong shape is a
     * build error. That is not theoretical — `requestDeviceIdentifier` once shipped hand-written as
     * `(reason?: string)` when the host takes an options object, and because this file copied the
     * same wrong shape, every test passed while the feature was broken on an actual phone.
     *
     * The cast after it exists only because `NimiqProvider` is a class with private fields, which no
     * object literal can satisfy. It bridges that and nothing else: it is applied *after* the
     * checking, so it cannot hide a mismatch in the five methods this app actually calls.
     */
  } satisfies Partial<
    Pick<
      NimiqProvider,
      'listAccounts' | 'sign' | 'getBlockNumber' | 'isConsensusEstablished' | 'sendBasicTransactionWithData'
    >
  > as unknown as NimiqProvider;

  /*
   * The host context, with the *documented* shapes — including the ones we got wrong.
   *
   * `requestDeviceIdentifier` takes `{ reason }`, and the real host rejects an empty reason. The
   * first version of this stand-in took a bare string, which made every test pass against a
   * contract the real app does not have. It now refuses an empty reason exactly as the host does,
   * so a caller that forgets fails here rather than on somebody's phone.
   *
   * There is no `userFiat`: it is not part of `NimiqPayHostContext` and never was.
   */
  window.nimiqPay = {
    language: navigator.language.slice(0, 2),
    requestDeviceIdentifier: async ({ reason }) => {
      if (!reason) throw new Error('requestDeviceIdentifier needs a reason');
      return toHex(sha256(encoder.encode(`device:${params.get('as') ?? 'a'}`)));
    },
  };
}
