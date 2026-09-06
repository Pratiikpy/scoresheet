/**
 * A whole scoresheet, verified the way a stranger would verify it.
 *
 * The product's claim is that these survive us: signature, public key and canonical text are enough
 * for anyone to re-check a game with an Ed25519 library and no server. So the tests here are the
 * attacks a hostile reader would try — one signature instead of two, a genuine signature from the
 * wrong wallet, a text that is nearly canonical, a testnet game replayed on mainnet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair } from '@nimiq/core';
import { canonicaliseScoresheet, hashMoves, type Scoresheet } from '@scoresheet/core';
import { nimiqSignedMessageDigest, verifyScoresheet } from '../src/index.ts';

const encoder = new TextEncoder();

function sign(keyPair: KeyPair, text: string) {
  return {
    publicKeyHex: keyPair.publicKey.toHex(),
    signatureHex: keyPair.sign(nimiqSignedMessageDigest(encoder.encode(text))).toHex(),
  };
}

/** A real game between two real keys, ready to be attacked. */
function played(overrides: Partial<Scoresheet> = {}) {
  const whiteKey = KeyPair.generate();
  const blackKey = KeyPair.generate();
  const sheet: Scoresheet = {
    chain: 'test',
    gameId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    white: whiteKey.toAddress().toUserFriendlyAddress(),
    black: blackKey.toAddress().toUserFriendlyAddress(),
    result: '0-1',
    termination: 'checkmate',
    moveCount: 4,
    finalFen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    endedAtBlock: 4_100_777,
    movesHash: hashMoves(['f3', 'e5', 'g4', 'Qh4#']),
    rated: true,
    ...overrides,
  };
  const text = canonicaliseScoresheet(sheet);
  return { whiteKey, blackKey, sheet, text };
}

test('⭐ two real signatures over the same text verify, and the sheet comes back', () => {
  const { whiteKey, blackKey, text } = played();
  const result = verifyScoresheet(text, { white: sign(whiteKey, text), black: sign(blackKey, text) });

  assert.equal(result.ok, true, result.detail);
  assert.equal(result.white.ok, true);
  assert.equal(result.black.ok, true);
  assert.equal(result.sheet?.result, '0-1');
  assert.equal(result.sheet?.termination, 'checkmate');
});

test('⭐ one signature proves nothing — both, or it is not a scoresheet', () => {
  // Either player could otherwise claim any result they liked.
  const { whiteKey, text } = played();
  const result = verifyScoresheet(text, { white: sign(whiteKey, text), black: sign(whiteKey, text) });

  assert.equal(result.ok, false);
  assert.equal(result.white.ok, true, 'white signature is genuine');
  assert.equal(result.black.ok, false, 'but black never signed');
  assert.equal(result.failure, 'not-a-player');
});

test('⭐ a genuine signature from a wallet not in the game is refused', () => {
  const { whiteKey, text } = played();
  const stranger = KeyPair.generate();
  const result = verifyScoresheet(text, { white: sign(whiteKey, text), black: sign(stranger, text) });

  assert.equal(result.ok, false);
  assert.equal(result.failure, 'not-a-player');
  // Named rather than collapsed: the signature is real, it is just not from who it must be.
  assert.match(result.detail ?? '', /different wallet/i);
});

test('⭐ swapping the result after signing breaks both signatures', () => {
  // The attack this whole design exists to stop: a loser storing the game as a win.
  const { whiteKey, blackKey, sheet, text } = played({ result: '0-1' });
  const signatures = { white: sign(whiteKey, text), black: sign(blackKey, text) };

  const forged = canonicaliseScoresheet({ ...sheet, result: '1-0' });
  const result = verifyScoresheet(forged, signatures);

  assert.equal(result.ok, false);
  assert.equal(result.failure, 'bad-signature');
});

test('a text that is nearly canonical does not verify', () => {
  // A signature must be over the exact bytes the format defines, never over whatever arrived.
  const { whiteKey, blackKey, text } = played();
  const signatures = { white: sign(whiteKey, text), black: sign(blackKey, text) };
  const almost = text.replace('\n4\n', '\n04\n');

  const result = verifyScoresheet(almost, signatures);
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'malformed-scoresheet');
});

test('⭐ a testnet game does not verify on a mainnet service', () => {
  // `sign()` has no domain separation, so without the chain inside the signed bytes a play-money
  // game would verify byte-for-byte as a real one.
  const { whiteKey, blackKey, text } = played({ chain: 'test' });
  const signatures = { white: sign(whiteKey, text), black: sign(blackKey, text) };

  assert.equal(verifyScoresheet(text, signatures, 'test').ok, true);
  const wrong = verifyScoresheet(text, signatures, 'main');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.failure, 'wrong-chain');
});

test('a rated game and a casual one are different texts, so one cannot be passed off as the other', () => {
  const { whiteKey, blackKey, sheet, text } = played({ rated: false });
  const signatures = { white: sign(whiteKey, text), black: sign(blackKey, text) };

  assert.equal(verifyScoresheet(text, signatures).ok, true);
  const relabelled = canonicaliseScoresheet({ ...sheet, rated: true });
  assert.equal(verifyScoresheet(relabelled, signatures).ok, false);
});

test('nonsense in place of a scoresheet is refused, and says so', () => {
  const result = verifyScoresheet('not a scoresheet at all', {
    white: { publicKeyHex: 'a', signatureHex: 'b' },
    black: { publicKeyHex: 'c', signatureHex: 'd' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'malformed-scoresheet');
});

test('the move hash binds the moves without carrying them', () => {
  // Anyone holding the move list can re-derive the hash and check it against the signed sheet.
  const { text } = played();
  assert.ok(text.includes(hashMoves(['f3', 'e5', 'g4', 'Qh4#'])));
  assert.ok(!text.includes('Qh4'), 'and the moves themselves are not in the signed text');
});
