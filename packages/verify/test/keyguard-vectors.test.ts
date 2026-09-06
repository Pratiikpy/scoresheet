/**
 * The signing scheme, pinned to Nimiq's own published vectors.
 *
 * A local test of a signing scheme proves almost nothing: both sides use the same implementation, so
 * it agrees with itself and can still be wrong on a real phone. The only test worth having is one
 * against values somebody else published.
 *
 * These two come from `nimiq/keyguard`'s own `tests/lib/Key.spec.js` — the test suite the wallet's
 * signer is developed against — read from the repository on 6 September 2026:
 *
 *     Nimiq.BufferUtils.fromUtf8('\x16Nimiq Signed Message:\n5hello')
 *     Array.from(Nimiq.BufferUtils.fromUtf8('\x16Nimiq Signed Message:\n6')).concat([1,2,3,4,5,6])
 *
 * and the digest in both cases is `Nimiq.Hash.computeSha256` of that.
 *
 * **The comparison uses Node's own SHA-256, not `@nimiq/core`'s.** If both sides of the test used
 * the same library, the test would prove only that the library agrees with itself — which is exactly
 * the failure mode it exists to catch. Two independent implementations have to arrive at the same
 * bytes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KeyPair } from '@nimiq/core';
import { NIMIQ_SIGN_MESSAGE_PREFIX, nimiqSignedMessageDigest, verifySignedText } from '../src/index.ts';

/** Node's SHA-256 — deliberately a different implementation from the one under test. */
function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

const encoder = new TextEncoder();

test('the prefix is exactly what the Keyguard writes, length byte and all', () => {
  // The leading byte is 0x16 — decimal 22 — which is the length of the text after it. Both parts
  // are hashed, so leaving the byte out produces a digest no wallet will ever agree with.
  assert.equal(NIMIQ_SIGN_MESSAGE_PREFIX, '\x16Nimiq Signed Message:\n');
  assert.equal(NIMIQ_SIGN_MESSAGE_PREFIX.charCodeAt(0), 0x16);
  assert.equal(NIMIQ_SIGN_MESSAGE_PREFIX.slice(1).length, 0x16, 'the byte really is the length of the rest');
});

test('⭐ vector one: "hello", from Keyguard Key.spec.js', () => {
  // Their line: Nimiq.BufferUtils.fromUtf8('\x16Nimiq Signed Message:\n5hello')
  const expected = sha256(encoder.encode('\x16Nimiq Signed Message:\n5hello'));
  const ours = nimiqSignedMessageDigest(encoder.encode('hello'));
  assert.deepEqual(Buffer.from(ours), Buffer.from(expected));
});

test('⭐ vector two: six raw bytes, from Keyguard Key.spec.js', () => {
  // Their line: fromUtf8('\x16Nimiq Signed Message:\n6') concat [1,2,3,4,5,6]
  const message = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const prefix = encoder.encode('\x16Nimiq Signed Message:\n6');
  const buffer = new Uint8Array(prefix.length + message.length);
  buffer.set(prefix, 0);
  buffer.set(message, prefix.length);

  assert.deepEqual(Buffer.from(nimiqSignedMessageDigest(message)), Buffer.from(sha256(buffer)));
});

test('⭐ the length is the BYTE length — the bug in Nimiq own published snippet', () => {
  /*
   * `message.length` in JavaScript counts UTF-16 code units. For ASCII the two are the same, which
   * is why this is silently correct until it is not.
   *
   * "café" is four characters and five bytes. A digest built with `4` and one built with `5` are
   * different digests, so a wallet signing one and a server checking the other never agree — and
   * the failure looks like "every signature is suddenly invalid", with no clue why.
   */
  const text = 'café';
  assert.equal(text.length, 4, 'JavaScript counts four');
  assert.equal(encoder.encode(text).byteLength, 5, 'and it is five bytes');

  const correct = sha256(encoder.encode(`\x16Nimiq Signed Message:\n5${text}`));
  const wrong = sha256(encoder.encode(`\x16Nimiq Signed Message:\n4${text}`));
  assert.notDeepEqual(Buffer.from(correct), Buffer.from(wrong), 'the two really are different digests');

  assert.deepEqual(Buffer.from(nimiqSignedMessageDigest(encoder.encode(text))), Buffer.from(correct));
});

test('an emoji is four bytes and two code units, and we count the bytes', () => {
  const text = '♟️';
  const bytes = encoder.encode(text).byteLength;
  assert.notEqual(text.length, bytes, 'the two counts differ, which is the whole point');
  const expected = sha256(encoder.encode(`\x16Nimiq Signed Message:\n${bytes}${text}`));
  assert.deepEqual(Buffer.from(nimiqSignedMessageDigest(encoder.encode(text))), Buffer.from(expected));
});

test('an empty message still has a well-defined digest', () => {
  const expected = sha256(encoder.encode('\x16Nimiq Signed Message:\n0'));
  assert.deepEqual(Buffer.from(nimiqSignedMessageDigest(new Uint8Array())), Buffer.from(expected));
});

/* ------------------------------------------------------------------ round trip */

test('⭐ a real key signs, and we verify — with the address derived, not supplied', () => {
  const keyPair = KeyPair.generate();
  const address = keyPair.toAddress().toUserFriendlyAddress();
  const text = 'chess/1 scoresheet\ntest\n';
  const signature = keyPair.sign(nimiqSignedMessageDigest(encoder.encode(text)));

  const result = verifySignedText({
    text,
    publicKeyHex: keyPair.publicKey.toHex(),
    signatureHex: signature.toHex(),
    expectedAddress: address,
  });

  assert.equal(result.ok, true, result.detail);
  assert.equal(result.derivedAddress, address);
});

test('a signature over different words does not verify', () => {
  const keyPair = KeyPair.generate();
  const signature = keyPair.sign(nimiqSignedMessageDigest(encoder.encode('one thing')));
  const result = verifySignedText({
    text: 'another thing',
    publicKeyHex: keyPair.publicKey.toHex(),
    signatureHex: signature.toHex(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'bad-signature');
});

test('⭐ a valid signature from the wrong wallet is refused, and named as such', () => {
  // The important distinction: the signature is genuine, it is simply not from who it should be.
  const signer = KeyPair.generate();
  const someoneElse = KeyPair.generate();
  const text = 'a scoresheet';
  const signature = signer.sign(nimiqSignedMessageDigest(encoder.encode(text)));

  const result = verifySignedText({
    text,
    publicKeyHex: signer.publicKey.toHex(),
    signatureHex: signature.toHex(),
    expectedAddress: someoneElse.toAddress().toUserFriendlyAddress(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure, 'not-a-player', 'named, not collapsed to false');
});

test('a malformed key or signature is named separately from a wrong one', () => {
  const keyPair = KeyPair.generate();
  assert.equal(
    verifySignedText({ text: 'x', publicKeyHex: 'nonsense', signatureHex: 'ff'.repeat(64) }).failure,
    'malformed-public-key',
  );
  assert.equal(
    verifySignedText({ text: 'x', publicKeyHex: keyPair.publicKey.toHex(), signatureHex: 'nope' }).failure,
    'malformed-signature',
  );
});

test('address comparison ignores display spacing and case', () => {
  const keyPair = KeyPair.generate();
  const text = 'x';
  const signature = keyPair.sign(nimiqSignedMessageDigest(encoder.encode(text)));
  const spaced = keyPair.toAddress().toUserFriendlyAddress();

  for (const form of [spaced, spaced.replace(/\s/g, ''), spaced.toLowerCase()]) {
    const result = verifySignedText({
      text,
      publicKeyHex: keyPair.publicKey.toHex(),
      signatureHex: signature.toHex(),
      expectedAddress: form,
    });
    assert.equal(result.ok, true, form);
  }
});
