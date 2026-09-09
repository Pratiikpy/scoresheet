/**
 * The published keys, pinned to what they are actually derived from.
 *
 * `PUBLISHED_KEYS` is written out by hand so the record page can decide synchronously whether to
 * caveat a rating. A hand-written list is a list that can drift, and drift here is silent and
 * one-directional: change a seed, or add a third stand-in identity, and the record page simply stops
 * caveating games it should caveat. Nothing throws, nothing looks wrong, and the single screen whose
 * entire value is not overstating what it knows begins overstating what it knows.
 *
 * So the list is re-derived here from the seeds themselves, and the bot's entry is re-derived from
 * the bot's own secret. If they ever disagree, this fails rather than the product quietly lying.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicKeyAsync } from '@noble/ed25519';
import { DEMO_SEEDS, PUBLISHED_KEYS, demoSecret } from '../src/demo-wallet.ts';
import { BOT_PUBLIC_KEY_HEX } from '../src/bot-identity.ts';
import { addressFromPublicKey } from '../src/verify-browser.ts';

const toHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

test('⭐ every stand-in seed derives to a key the record page knows about', async () => {
  for (const seed of DEMO_SEEDS) {
    const publicKey = toHex(await getPublicKeyAsync(demoSecret(seed)));
    assert.ok(
      PUBLISHED_KEYS.has(publicKey),
      `seed "${seed}" derives to ${publicKey}, which PUBLISHED_KEYS does not contain — the record page would present its games as ordinary ones`,
    );
  }
});

test('the bot is in the list too', () => {
  assert.ok(PUBLISHED_KEYS.has(BOT_PUBLIC_KEY_HEX));
});

test('the list contains nothing else — an unexplained key would caveat honest games', () => {
  assert.equal(PUBLISHED_KEYS.size, DEMO_SEEDS.length + 1);
});

test('⭐ the stand-in addresses are real Nimiq addresses, not plausible-looking strings', async () => {
  // The first stand-in built an address out of a hash and produced `NQS8HFX8…`, where the two
  // characters after `NQ` are check digits and can only be digits. It sat on screen unchallenged.
  for (const seed of DEMO_SEEDS) {
    const address = addressFromPublicKey(toHex(await getPublicKeyAsync(demoSecret(seed))));
    assert.match(address, /^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/, `seed "${seed}" → ${address}`);
  }
});

/* ------------------------------------------------------------------ the host context */

/**
 * Install the stand-in wallet against a fake `window`, and hand back what it declared.
 *
 * The module reads `window.location.search` and writes `window.nimiq` / `window.nimiqPay`, so a
 * minimal object is enough to run the real code rather than a description of it.
 */
async function installedHost(): Promise<Record<string, unknown>> {
  const fake = {
    location: { search: '?demo=1&as=a' },
    nimiq: undefined as unknown,
    nimiqPay: undefined as unknown,
  };
  const globals = globalThis as { window?: unknown };
  const had = globals.window;
  globals.window = fake;
  try {
    const { installDemoWallet } = await import('../src/demo-wallet.ts');
    installDemoWallet();
    return (fake.nimiqPay ?? {}) as Record<string, unknown>;
  } finally {
    if (had === undefined) delete globals.window;
    else globals.window = had;
  }
}

test('⭐ the device identifier takes an options object, as the host does', async () => {
  /*
   * The bug this exists to prevent, and it shipped: `requestDeviceIdentifier` was declared as
   * `(reason?: string)` and called with a bare string. The real host takes `{ reason }`, so it would
   * have seen an empty reason and **rejected** — and the documentation is explicit that an empty
   * reason throws. Every test passed while the puzzle pool was unclaimable on an actual phone,
   * because this stand-in had copied the same wrong shape.
   */
  const host = await installedHost();
  const request = host['requestDeviceIdentifier'] as (options: { reason: string }) => Promise<string>;
  assert.equal(typeof request, 'function');

  const id = await request({ reason: 'a test' });
  assert.match(id, /^[0-9a-f]{64}$/, 'the host returns a 64-character hex digest');

  await assert.rejects(
    () => request({ reason: '' }),
    'an empty reason must be refused, exactly as the real host refuses it',
  );
});

test('and the host context carries nothing it does not really have', async () => {
  // `userFiat` was declared here and in `wallet.ts` and does not exist in the SDK's own
  // `NimiqPayHostContext`. A fabricated capability in our own types is worse than a missing one:
  // it is the sort of thing that gets written into a claim about what the app integrates with.
  const host = await installedHost();
  assert.deepEqual(Object.keys(host).sort(), ['language', 'requestDeviceIdentifier']);
});
