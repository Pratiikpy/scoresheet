/**
 * The portable record, end to end, with real keys.
 *
 * `@scoresheet/core`'s own bundle tests use stub signatures, because that package cannot do Ed25519
 * and should not learn how. These tests generate real Nimiq key pairs, sign real canonical text with
 * them, and then attack the result — because the interesting failures are not "does a good bundle
 * verify" but "what happens to a bundle that is *nearly* right".
 *
 * The property under test throughout: **a bad record removes itself and nothing else.** A verifier
 * that fails a whole history because one signature is wrong is unusable; one that passes the history
 * while silently dropping the bad record is dishonest. The right answer is to itemise.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair } from '@nimiq/core';
import {
  buildBundle,
  canonicaliseScoresheet,
  computeRatings,
  toRatedGame,
  type BundledScoresheet,
  type Scoresheet,
} from '@scoresheet/core';
import { nimiqSignedMessageDigest } from '../src/index.ts';
import { COMPLETENESS_CAVEAT, verifyBundle } from '../src/bundle.ts';

const encoder = new TextEncoder();

function signWith(pair: KeyPair, text: string): { publicKeyHex: string; signatureHex: string } {
  const signature = pair.sign(nimiqSignedMessageDigest(encoder.encode(text)));
  return { publicKeyHex: pair.publicKey.toHex(), signatureHex: signature.toHex() };
}

const alice = KeyPair.generate();
const bob = KeyPair.generate();
const mallory = KeyPair.generate();

const ALICE = alice.publicKey.toAddress().toUserFriendlyAddress();
const BOB = bob.publicKey.toAddress().toUserFriendlyAddress();

let nextGame = 0;
function game(overrides: Partial<Scoresheet> = {}): Scoresheet {
  nextGame += 1;
  return {
    chain: 'main',
    gameId: nextGame.toString(16).padStart(32, '0'),
    white: ALICE,
    black: BOB,
    result: '1-0',
    termination: 'checkmate',
    moveCount: 34,
    finalFen: '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 41',
    endedAtBlock: 4_100_000 + nextGame,
    movesHash: 'AAAA',
    rated: true,
    ...overrides,
  };
}

/** A properly signed entry: both players over the exact canonical text. */
function signed(sheet: Scoresheet): BundledScoresheet {
  const text = canonicaliseScoresheet(sheet);
  return { text, white: signWith(alice, text), black: signWith(bob, text) };
}

function bundleOf(sheets: Scoresheet[], extra: Partial<Parameters<typeof buildBundle>[0]> = {}) {
  return buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 4_200_000,
    scoresheets: sheets.map(signed),
    puzzleCards: [],
    ...extra,
  });
}

/* ------------------------------------------------------------------ the good case */

test('⭐ a genuine record verifies, and the rating is recomputed rather than believed', () => {
  const games = [game({ result: '1-0' }), game({ result: '0-1' }), game({ result: '1/2-1/2' })];
  const result = verifyBundle(bundleOf(games));

  assert.equal(result.intact, true);
  assert.equal(result.goodScoresheets.length, 3);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.badSignatures.length, 0);
  assert.equal(result.scoresheetRootMatches, true);

  // The number must equal what an independent run of the rating function produces from the same
  // games. If these two could ever differ, the verifier would be asserting rather than checking.
  const independent = computeRatings(games.map(toRatedGame)).get(result.address)!;
  assert.equal(result.rating, independent.rating);
  assert.equal(result.ratedGames, independent.games);
});

test('a verified record always carries the completeness caveat in words', () => {
  const result = verifyBundle(bundleOf([game()]));
  assert.equal(result.completenessCaveat, COMPLETENESS_CAVEAT);
  assert.match(result.completenessCaveat, /does not prove the list is complete/);
});

test('an empty record is coherent, not an error, and rates nobody', () => {
  const result = verifyBundle(bundleOf([]));
  assert.equal(result.intact, true);
  assert.equal(result.rating, 0);
  assert.equal(result.ratedGames, 0);
});

/* ------------------------------------------------------------------ attacks */

test('⭐ a forged signature removes its own game and leaves the rest standing', () => {
  const good = game();
  const forged = game();
  const bundle = bundleOf([good, forged]);

  // Mallory signs the second game as though she were Bob. The text is untouched and canonical.
  const forgedText = canonicaliseScoresheet(forged);
  const entry = bundle.scoresheets.find((candidate) => candidate.text === forgedText)!;
  entry.black = signWith(mallory, forgedText);

  const result = verifyBundle(bundle);
  assert.equal(result.intact, false);
  assert.equal(result.goodScoresheets.length, 1);
  assert.equal(result.badSignatures.length, 1);
  assert.equal(result.badSignatures[0]!.id, forged.gameId);
  assert.equal(result.badSignatures[0]!.side, 'black');
  assert.match(result.badSignatures[0]!.detail, /different wallet/);
});

test('⭐ a signature over different words does not verify, however genuine the key', () => {
  const sheet = game();
  const bundle = bundleOf([sheet]);
  const entry = bundle.scoresheets[0]!;
  // Alice really did sign — just not this. The classic replay: a real signature, wrong message.
  entry.white = signWith(alice, canonicaliseScoresheet(game({ result: '0-1' })));

  const result = verifyBundle(bundle);
  assert.equal(result.goodScoresheets.length, 0);
  assert.equal(result.badSignatures[0]!.side, 'white');
});

test('⭐ swapping the result after signing breaks the root and every signature at once', () => {
  const bundle = bundleOf([game({ result: '0-1' })]);
  bundle.scoresheets[0]!.text = bundle.scoresheets[0]!.text.replace('0-1', '1-0');

  const result = verifyBundle(bundle);
  assert.equal(result.scoresheetRootMatches, false);
  assert.equal(result.goodScoresheets.length, 0);
  assert.equal(result.intact, false);
});

test('a game with only one signature is not a scoresheet', () => {
  const sheet = game();
  const bundle = bundleOf([sheet]);
  bundle.scoresheets[0]!.black = { publicKeyHex: '00'.repeat(32), signatureHex: '00'.repeat(64) };

  const result = verifyBundle(bundle);
  assert.equal(result.goodScoresheets.length, 0);
  assert.equal(result.badSignatures.length, 1);
});

test("⭐ a stranger's game is thrown out as theirs, not as a bad signature", () => {
  // The distinction matters to whoever reads the result: one of these is an attempt to pad a record
  // and the other is corruption, and a verifier that says "invalid" to both has told you nothing.
  const carol = KeyPair.generate();
  const CAROL = carol.publicKey.toAddress().toUserFriendlyAddress();
  const theirs = game({ white: BOB, black: CAROL });
  const theirText = canonicaliseScoresheet(theirs);

  const bundle = buildBundle({
    chain: 'main',
    address: ALICE,
    generatedAtBlock: 4_200_000,
    scoresheets: [signed(game()), { text: theirText, white: signWith(bob, theirText), black: signWith(carol, theirText) }],
    puzzleCards: [],
  });

  const result = verifyBundle(bundle);
  assert.equal(result.goodScoresheets.length, 1);
  assert.equal(result.badSignatures.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0]!.reason, 'not-this-players-record');
});

test('⭐ dropping a game from a published record changes the root it declared', () => {
  // The completeness limit, made concrete. Removing a loss after committing is *detectable* — this
  // is exactly what the anchor is for. Removing it before committing is not, which is why the
  // caveat exists and why no test here claims otherwise.
  const games = [game({ result: '1-0' }), game({ result: '0-1' }), game({ result: '1-0' })];
  const bundle = bundleOf(games);
  const declared = bundle.completeness.scoresheetRoot;

  bundle.scoresheets.splice(1, 1);
  const result = verifyBundle(bundle);

  assert.equal(result.scoresheetRootMatches, false, 'the removal must be visible against the declared root');
  assert.notEqual(declared, '');
  assert.equal(result.goodScoresheets.length, 2, 'the remaining games are still genuine');
});

test('⭐ an anchor older than a game it commits to is reported, with the rest still verified', () => {
  const sheet = game({ endedAtBlock: 4_150_000 });
  const bundle = bundleOf([sheet], { anchorTxHash: 'ab'.repeat(16), anchoredAtBlock: 4_100_000 });

  const result = verifyBundle(bundle);
  assert.equal(result.anchorPresent, true);
  assert.equal(result.anchorConsistent, false);
  assert.equal(result.intact, false);
  assert.equal(result.goodScoresheets.length, 1, 'the game itself is still genuine');
});
