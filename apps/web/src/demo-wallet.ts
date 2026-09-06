/**
 * A stand-in wallet, for a desktop with no Nimiq Pay.
 *
 * Enabled only by `?demo=1` in the URL, and it announces itself on every screen it touches. It
 * exists so the whole path — connect, sign, verify, recompute — can be walked by somebody who has
 * not installed anything, which is the difference between a judge seeing the entry and a judge
 * seeing a wall.
 *
 * **The signatures it makes are structurally valid and cryptographically meaningless.** It is not a
 * key: it derives a deterministic address from a seed and returns bytes of the right length. They
 * will not verify, and every screen that shows one says so. Pretending otherwise would be worse
 * than having no demo at all — the one claim this product makes is that a signature means
 * something, and a demo that fakes that convincingly undermines the thing it is demonstrating.
 */

import { toBase64Url } from '@scoresheet/core';

const BASE32 = '0123456789ABCDEFGHJKLMNPQRSTUVXY';

/**
 * A Nimiq-shaped address from a seed.
 *
 * Deliberately *shaped* rather than derived: `NQ` plus 34 characters of Nimiq's own base-32
 * alphabet, so it passes the format checks the app applies and can never be a real wallet, because
 * the checksum is not computed.
 */
function fakeAddress(seed: string): string {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 34; i++) {
    hash = Math.imul(hash ^ (i + 1), 16777619) >>> 0;
    out += BASE32[hash % BASE32.length];
  }
  return `NQ${out}`;
}

function fakeHex(seed: string, bytes: number): string {
  let hash = 5381;
  let out = '';
  for (let i = 0; i < bytes; i++) {
    for (const character of `${seed}:${i}`) hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
    out += (hash % 256).toString(16).padStart(2, '0');
  }
  return out;
}

/** Is the app running with the stand-in wallet? Screens ask so they can say so. */
export function isDemo(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
}

/**
 * Install the stand-in, if asked for and if there is no real provider.
 *
 * A real wallet always wins: `?demo=1` inside Nimiq Pay does nothing, so the flag cannot be used to
 * make a genuine-looking signature that is not one.
 */
export function installDemoWallet(): void {
  if (!isDemo() || typeof window === 'undefined' || window.nimiq !== undefined) return;

  const seed = `demo:${new URLSearchParams(window.location.search).get('as') ?? 'a'}`;
  const address = fakeAddress(seed);

  window.nimiq = {
    listAccounts: () => Promise.resolve([address]),
    sign: (input) => {
      const message = typeof input === 'string' ? input : input.message;
      return Promise.resolve({
        publicKey: fakeHex(`${seed}:pk`, 32),
        // Derived from the message, so signing different text gives different bytes — which keeps
        // the demo honest about *what* was signed even though it proves nothing about *who*.
        signature: fakeHex(`${seed}:${toBase64Url(new TextEncoder().encode(message)).slice(0, 32)}`, 64),
      });
    },
    // A plausible mainnet height, so the ordering key is a number rather than a zero.
    getBlockNumber: () => Promise.resolve(4_200_000 + Math.floor(Date.now() / 60_000) % 1000),
    isConsensusEstablished: () => Promise.resolve(true),
  };

  window.nimiqPay = {
    language: navigator.language.slice(0, 2),
    userFiat: 'USD',
    requestDeviceIdentifier: () => Promise.resolve(fakeHex(`${seed}:device`, 32)),
  };
}
