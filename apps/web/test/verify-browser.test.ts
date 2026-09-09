/**
 * The browser's own verification, checked against the real thing.
 *
 * The product's central claim — a rating nobody can take away from you — is only true if a stranger
 * can check it on their own device. A check that phones home is a check we could switch off. So the
 * recompute page verifies locally, from two small MIT libraries instead of a 50 MB WASM bundle.
 *
 * That is only safe if the small version agrees with the real one **exactly**. Deriving an address
 * slightly differently from the wallet would not throw; it would silently attribute every signature
 * to the wrong person, and every rating in the app would be wrong in a way nobody could see.
 *
 * So these tests compare against `@nimiq/core`'s own output over many random keys, and sign with a
 * real Nimiq key rather than a fixture.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair } from '@nimiq/core';
import { canonicaliseScoresheet, hashMoves, type Scoresheet } from '@scoresheet/core';
import { nimiqSignedMessageDigest } from '@scoresheet/verify';
import { addressBytes, addressFromPublicKey, signedMessageDigest, verifyScoresheetInBrowser } from '../src/verify-browser.ts';

const encoder = new TextEncoder();

test('⭐ address derivation matches @nimiq/core over a hundred random keys', () => {
  // One mismatch in a hundred would be a bug that attributes signatures to the wrong wallet, and
  // nothing in the app would look wrong while it happened.
  for (let i = 0; i < 100; i++) {
    const keyPair = KeyPair.generate();
    const official = keyPair.toAddress();
    const publicKeyHex = keyPair.publicKey.toHex();

    assert.equal(
      Buffer.from(addressBytes(publicKeyHex)).toString('hex'),
      official.toHex().toLowerCase(),
      'the 20 address bytes are Blake2b-256 of the public key, truncated',
    );
    assert.equal(
      addressFromPublicKey(publicKeyHex),
      official.toUserFriendlyAddress().replace(/\s/g, ''),
      'and the user-friendly form, check digits and all',
    );
  }
});

test("⭐ addresses use Nimiq’s alphabet, and only it", () => {
  /*
   * This test used to check one random address against an alphabet that excluded `U`, and `U` is
   * legal. With 32 characters drawn from 32 symbols that passes about a third of the time, so it sat
   * in the suite as a green check that was really a coin flip, and it took a run that happened to
   * land on a `U` to notice. Two things are fixed: the excluded set is now the real one — `I`, `O`,
   * `W` and `Z`, confirmed by generating four hundred addresses with `@nimiq/core` and taking the
   * union of their characters — and enough keys are drawn that the alphabet is actually exercised
   * rather than sampled.
   */
  const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY';
  const seen = new Set<string>();

  for (let i = 0; i < 200; i++) {
    const address = addressFromPublicKey(KeyPair.generate().publicKey.toHex());
    assert.match(address, /^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/, `NQ, two check digits, 32 base-32 characters: ${address}`);
    for (const character of address.slice(4)) seen.add(character);
  }

  const strays = [...seen].filter((character) => !ALPHABET.includes(character));
  assert.deepEqual(strays, [], "every character comes from Nimiq’s alphabet");
  // I, O, W and Z are excluded so a letter is never mistaken for a digit or another letter.
  assert.ok(!/[IOWZ]/.test([...seen].join('')), 'no ambiguous letters in 200 addresses');
  assert.ok(seen.size > 28, `200 addresses should exercise most of the alphabet, saw ${seen.size}`);
});

test('⭐ the signed-message digest matches the server implementation exactly', () => {
  // Two independent implementations of the same scheme: this one built on @noble/hashes, the other
  // on @nimiq/core's WASM. They must agree byte for byte or nothing verifies anywhere.
  for (const text of ['hello', '', 'chess/1 scoresheet\ntest\n', 'café ♟️', 'x'.repeat(500)]) {
    assert.deepEqual(
      Buffer.from(signedMessageDigest(text)),
      Buffer.from(nimiqSignedMessageDigest(encoder.encode(text))),
      JSON.stringify(text.slice(0, 20)),
    );
  }
});

/* ------------------------------------------------------------------ whole scoresheets */

function game(overrides: Partial<Scoresheet> = {}) {
  const whiteKey = KeyPair.generate();
  const blackKey = KeyPair.generate();
  const sheet: Scoresheet = {
    chain: 'test',
    gameId: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    white: whiteKey.toAddress().toUserFriendlyAddress(),
    black: blackKey.toAddress().toUserFriendlyAddress(),
    result: '1-0',
    termination: 'resignation',
    moveCount: 24,
    finalFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    endedAtBlock: 4_200_123,
    movesHash: hashMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']),
    rated: true,
    ...overrides,
  };
  const text = canonicaliseScoresheet(sheet);
  const sign = (key: KeyPair) => ({
    publicKeyHex: key.publicKey.toHex(),
    signatureHex: key.sign(nimiqSignedMessageDigest(encoder.encode(text))).toHex(),
  });
  return { whiteKey, blackKey, sheet, text, sign };
}

test('⭐ a real two-signature scoresheet verifies in the browser, with no server', () => {
  const { whiteKey, blackKey, text, sign } = game();
  return verifyScoresheetInBrowser(text, { white: sign(whiteKey), black: sign(blackKey) }).then((result) => {
    assert.equal(result.ok, true, result.failure);
    assert.equal(result.white.ok, true);
    assert.equal(result.black.ok, true);
    assert.equal(result.sheet?.result, '1-0');
  });
});

test('one signature is not enough, here as anywhere', async () => {
  const { whiteKey, text, sign } = game();
  const result = await verifyScoresheetInBrowser(text, { white: sign(whiteKey), black: sign(whiteKey) });
  assert.equal(result.ok, false);
  assert.equal(result.white.ok, true);
  assert.equal(result.black.failure, 'not-a-player');
});

test('⭐ altering the result after signing breaks it', async () => {
  const { whiteKey, blackKey, sheet, sign } = game({ result: '1-0' });
  const signatures = { white: sign(whiteKey), black: sign(blackKey) };
  const forged = canonicaliseScoresheet({ ...sheet, result: '0-1' });
  const result = await verifyScoresheetInBrowser(forged, signatures);
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'bad-signature');
});

test('a stranger signature is named as such, not collapsed to invalid', async () => {
  const { whiteKey, text, sign } = game();
  const stranger = KeyPair.generate();
  const result = await verifyScoresheetInBrowser(text, { white: sign(whiteKey), black: sign(stranger) });
  assert.equal(result.black.failure, 'not-a-player');
  assert.ok(result.black.derivedAddress, 'and the page can say whose signature it really is');
});

test('nonsense is refused with a reason', async () => {
  const result = await verifyScoresheetInBrowser('not a scoresheet', {
    white: { publicKeyHex: 'aa', signatureHex: 'bb' },
    black: { publicKeyHex: 'cc', signatureHex: 'dd' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'malformed-scoresheet');
});
