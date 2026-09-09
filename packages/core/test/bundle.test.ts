/**
 * The portable record.
 *
 * Two things are being proved here and they are different in kind.
 *
 * **The tree is RFC 9162's, and that is checked against the RFC rather than against itself.** A
 * Merkle root is only useful if an independent implementation agrees, so the first block below
 * computes small trees *by hand* from the RFC's own definitions and asserts the literals. Asserting
 * `merkleRoot(x) === merkleRoot(x)` would prove nothing at all; asserting against a hand-built
 * `SHA-256(0x01 ‖ SHA-256(0x00 ‖ a) ‖ SHA-256(0x00 ‖ b))` proves the construction.
 *
 * **The bundle is hostile-input tested.** Every rejection path has a test, because a verifier that
 * silently drops a record it does not understand is worse than one that refuses the file: the
 * silent one produces a smaller history that still looks complete.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  BUNDLE_VERSION,
  BundleError,
  anchorData,
  buildBundle,
  checkBundle,
  inclusionProof,
  merkleRoot,
  toBase64Url,
  verifyInclusion,
  canonicaliseScoresheet,
  type BundledScoresheet,
  type Scoresheet,
} from '../src/index.ts';

/* ------------------------------------------------------------------ the tree, against the RFC */

/** `SHA-256(0x00 ‖ text)` — RFC 9162 §2.1.1's leaf hash, spelled out. */
function leaf(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const buffer = new Uint8Array(1 + body.length);
  buffer[0] = 0x00;
  buffer.set(body, 1);
  return sha256(buffer);
}

/** `SHA-256(0x01 ‖ left ‖ right)` — the interior node. */
function node(left: Uint8Array, right: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(1 + left.length + right.length);
  buffer[0] = 0x01;
  buffer.set(left, 1);
  buffer.set(right, 1 + left.length);
  return sha256(buffer);
}

test('⭐ one leaf is the leaf hash itself, not a node over it', () => {
  // RFC 9162: MTH({d0}) = SHA-256(0x00 ‖ d0). Wrapping a single leaf in a node is the classic
  // off-by-one, and it silently changes every root a one-game bundle ever produces.
  assert.equal(merkleRoot(['a']), toBase64Url(leaf('a')));
});

test('⭐ two leaves hash as one node, in order', () => {
  assert.equal(merkleRoot(['a', 'b']), toBase64Url(node(leaf('a'), leaf('b'))));
});

test('⭐ three leaves split at two, not at the middle', () => {
  // The split is the largest power of two *strictly less than* n. For n=3 that is 2, giving
  // ((a,b),c) — not (a,(b,c)), which is what a naive midpoint split produces.
  const expected = node(node(leaf('a'), leaf('b')), leaf('c'));
  assert.equal(merkleRoot(['a', 'b', 'c']), toBase64Url(expected));
});

test('⭐ five leaves split at four', () => {
  const left = node(node(leaf('a'), leaf('b')), node(leaf('c'), leaf('d')));
  const expected = node(left, leaf('e'));
  assert.equal(merkleRoot(['a', 'b', 'c', 'd', 'e']), toBase64Url(expected));
});

test('the domain separation is real: a leaf cannot be forged into a node', () => {
  // Without the 0x00/0x01 prefixes, a leaf whose text happened to be two concatenated hashes could
  // stand in for an interior node. With them, the two are different hashes of different inputs.
  assert.notEqual(toBase64Url(leaf('x')), toBase64Url(node(leaf('x'), leaf('x'))));
});

test('order changes the root, which is why the canonical order is load-bearing', () => {
  assert.notEqual(merkleRoot(['a', 'b']), merkleRoot(['b', 'a']));
});

test('an empty set has no root, rather than a root over nothing', () => {
  assert.equal(merkleRoot([]), '');
});

/* ------------------------------------------------------------------ inclusion proofs */

test('⭐ every leaf in a tree proves its own inclusion, at every size from 1 to 33', () => {
  // Past 32 on purpose: the split rule changes shape at every power of two, and a verifier that
  // mirrors the prover incorrectly tends to work for 2 and 4 and fail at 3, 5, 9 and 17.
  for (let size = 1; size <= 33; size++) {
    const texts = Array.from({ length: size }, (_, i) => `game-${i}`);
    const root = merkleRoot(texts);
    for (let index = 0; index < size; index++) {
      const path = inclusionProof(texts, index);
      assert.ok(
        verifyInclusion(texts[index]!, index, size, path, root),
        `size ${size}, leaf ${index} failed to verify`,
      );
    }
  }
});

test('a proof for one leaf does not verify a different leaf', () => {
  const texts = ['a', 'b', 'c', 'd'];
  const root = merkleRoot(texts);
  const path = inclusionProof(texts, 1);
  assert.equal(verifyInclusion('c', 1, 4, path, root), false);
});

test('a proof does not verify at the wrong index', () => {
  const texts = ['a', 'b', 'c', 'd'];
  const root = merkleRoot(texts);
  const path = inclusionProof(texts, 1);
  assert.equal(verifyInclusion('b', 2, 4, path, root), false);
});

test('a truncated or padded proof is refused rather than accepted', () => {
  const texts = ['a', 'b', 'c', 'd'];
  const root = merkleRoot(texts);
  const path = inclusionProof(texts, 0);
  assert.equal(verifyInclusion('a', 0, 4, path.slice(0, 1), root), false);
  assert.equal(verifyInclusion('a', 0, 4, [...path, path[0]!], root), false);
});

test('a proof carrying junk instead of a hash is refused, not thrown', () => {
  const texts = ['a', 'b'];
  const root = merkleRoot(texts);
  assert.equal(verifyInclusion('a', 0, 2, ['not base64url!!'], root), false);
  assert.equal(verifyInclusion('a', 0, 2, ['c2hvcnQ'], root), false);
});

test('asking for a leaf that is not there is an error, not an empty proof', () => {
  assert.throws(() => inclusionProof(['a'], 3), BundleError);
});

/* ------------------------------------------------------------------ bundles */

const ALICE = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001';
const BOB = 'NQ23 0000 0000 0000 0000 0000 0000 0000 0002';
const CAROL = 'NQ46 0000 0000 0000 0000 0000 0000 0000 0003';

function sheet(overrides: Partial<Scoresheet> = {}): Scoresheet {
  return {
    chain: 'main',
    gameId: '0'.repeat(32),
    white: ALICE,
    black: BOB,
    result: '1-0',
    termination: 'checkmate',
    moveCount: 30,
    finalFen: '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 41',
    endedAtBlock: 4_100_000,
    movesHash: 'AAAA',
    rated: true,
    ...overrides,
  };
}

const NOBODY = { publicKeyHex: '00'.repeat(32), signatureHex: '00'.repeat(64) };

function entry(s: Scoresheet): BundledScoresheet {
  return { text: canonicaliseScoresheet(s), white: NOBODY, black: NOBODY };
}

test('a bundle round-trips: what is built is what checks out', () => {
  const games = [
    entry(sheet({ gameId: 'a'.repeat(32), endedAtBlock: 4_100_003 })),
    entry(sheet({ gameId: 'b'.repeat(32), endedAtBlock: 4_100_001 })),
  ];
  const bundle = buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 4_100_010,
    scoresheets: games,
    puzzleCards: [],
  });

  assert.equal(bundle.version, BUNDLE_VERSION);
  const check = checkBundle(bundle);
  assert.equal(check.rejected.length, 0);
  assert.equal(check.scoresheets.length, 2);
  assert.equal(check.scoresheetRootMatches, true);
});

test('⭐ the bundle is ordered by the signed fields, not by the order it was handed over', () => {
  const later = entry(sheet({ gameId: 'a'.repeat(32), endedAtBlock: 4_100_009 }));
  const earlier = entry(sheet({ gameId: 'b'.repeat(32), endedAtBlock: 4_100_001 }));

  const one = buildBundle({ chain: 'main', address: ALICE, generatedAtBlock: 1, scoresheets: [later, earlier], puzzleCards: [] });
  const two = buildBundle({ chain: 'main', address: ALICE, generatedAtBlock: 1, scoresheets: [earlier, later], puzzleCards: [] });

  assert.equal(one.completeness.scoresheetRoot, two.completeness.scoresheetRoot);
  assert.equal(one.scoresheets[0]!.text, earlier.text);
});

test('⭐ editing one character of one game breaks the declared root', () => {
  const bundle = buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 1,
    scoresheets: [entry(sheet())],
    puzzleCards: [],
  });
  // Swap the result. The text stays canonical, so it parses — and the root no longer matches.
  bundle.scoresheets[0]!.text = bundle.scoresheets[0]!.text.replace('1-0', '0-1');

  const check = checkBundle(bundle);
  assert.equal(check.rejected.length, 0, 'the edit should parse, and be caught by the root');
  assert.equal(check.scoresheetRootMatches, false);
});

test("⭐ a bundle cannot smuggle in somebody else's game to pad the total", () => {
  const mine = entry(sheet({ gameId: 'a'.repeat(32) }));
  const theirs = entry(sheet({ gameId: 'b'.repeat(32), white: BOB, black: CAROL }));

  const bundle = buildBundle({ chain: 'main', address: ALICE, generatedAtBlock: 1, scoresheets: [mine, theirs], puzzleCards: [] });
  const check = checkBundle(bundle);

  assert.equal(check.scoresheets.length, 1);
  assert.equal(check.rejected.length, 1);
  assert.equal(check.rejected[0]!.reason, 'not-this-players-record');
});

test('a record from the other chain is rejected and named', () => {
  const bundle = buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 1,
    scoresheets: [entry(sheet({ chain: 'test' }))],
    puzzleCards: [],
  });
  const check = checkBundle(bundle);
  assert.equal(check.rejected[0]!.reason, 'wrong-chain');
});

test('a record that is not canonical is rejected, never repaired', () => {
  const bundle = buildBundle({ chain: 'main', address: ALICE, generatedAtBlock: 1, scoresheets: [entry(sheet())], puzzleCards: [] });
  bundle.scoresheets[0]!.text = `${bundle.scoresheets[0]!.text}\n`;

  const check = checkBundle(bundle);
  assert.equal(check.rejected.length, 1);
  assert.equal(check.rejected[0]!.reason, 'malformed-record');
});

test('an unknown bundle version is refused outright', () => {
  const bundle = buildBundle({ chain: 'main', address: ALICE, generatedAtBlock: 1, scoresheets: [], puzzleCards: [] });
  bundle.version = 'chess/2 rating-bundle';
  assert.throws(() => checkBundle(bundle), BundleError);
});

test('⭐ an anchor claimed before a game it commits to is a contradiction, and is caught with no node', () => {
  const bundle = buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 4_200_000,
    scoresheets: [entry(sheet({ endedAtBlock: 4_150_000 }))],
    puzzleCards: [],
    anchorTxHash: 'ab'.repeat(16),
    anchoredAtBlock: 4_100_000,
  });

  const check = checkBundle(bundle);
  assert.equal(check.anchorPresent, true);
  assert.equal(check.anchorConsistent, false);
});

test('an anchor at or after the last game is consistent', () => {
  const bundle = buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 4_200_000,
    scoresheets: [entry(sheet({ endedAtBlock: 4_150_000 }))],
    puzzleCards: [],
    anchorTxHash: 'ab'.repeat(16),
    anchoredAtBlock: 4_150_000,
  });
  assert.equal(checkBundle(bundle).anchorConsistent, true);
});

test('a bundle with no anchor is not treated as having a broken one', () => {
  const bundle = buildBundle({ chain: 'main', address: ALICE, generatedAtBlock: 1, scoresheets: [entry(sheet())], puzzleCards: [] });
  const check = checkBundle(bundle);
  assert.equal(check.anchorPresent, false);
  assert.equal(check.anchorConsistent, true);
});

test('⭐ the anchor payload fits the 64-byte transaction data field', () => {
  const root = merkleRoot(['a', 'b', 'c']);
  const data = anchorData(root);
  assert.ok(new TextEncoder().encode(data).byteLength <= 64, `${data.length} chars did not fit`);
  assert.ok(data.startsWith('chess/1 anchor '));
  assert.ok(data.endsWith(root));
});
