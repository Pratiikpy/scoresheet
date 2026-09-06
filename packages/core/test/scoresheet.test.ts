/**
 * The scoresheet is only worth anything if a stranger can re-check it years from now with a plain
 * Ed25519 library. That requires one canonical form and no tolerance at all: two byte sequences
 * that mean the same thing to a human must not both verify, or the signature stops proving which
 * one was signed.
 *
 * Every test below is an attempt to make two different texts mean the same thing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ScoresheetError,
  canonicaliseScoresheet,
  hashMoves,
  opponentOf,
  parseScoresheet,
  sameAddress,
  scoreFor,
  sideOf,
  type Scoresheet,
} from '../src/index.ts';

const WHITE = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000';
const BLACK = 'NQ11 1111 1111 1111 1111 1111 1111 1111 1111';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MATE_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

function sheet(overrides: Partial<Scoresheet> = {}): Scoresheet {
  return {
    chain: 'test',
    gameId: 'a'.repeat(32),
    white: WHITE,
    black: BLACK,
    result: '0-1',
    termination: 'checkmate',
    moveCount: 3,
    finalFen: MATE_FEN,
    endedAtBlock: 4_100_000,
    movesHash: hashMoves(['f3', 'e5', 'g4', 'Qh4#']),
    rated: true,
    ...overrides,
  };
}

test('a scoresheet round-trips exactly', () => {
  const original = sheet();
  const text = canonicaliseScoresheet(original);
  const parsed = parseScoresheet(text);
  // Addresses come back normalised, which is the point: the signed text has no display spacing.
  assert.equal(parsed.white, 'NQ07000000000000000000000000000000000000'.slice(0, 36));
  assert.equal(parsed.result, '0-1');
  assert.equal(parsed.rated, true);
  assert.equal(canonicaliseScoresheet(parsed), text, 're-serialising a parsed sheet is a fixed point');
});

test('the text is twelve lines and a trailing newline, in a fixed order', () => {
  const lines = canonicaliseScoresheet(sheet()).split('\n');
  assert.equal(lines.length, 13);
  assert.equal(lines[0], 'chess/1 scoresheet');
  assert.equal(lines[1], 'test');
  assert.equal(lines[5], '0-1');
  assert.equal(lines[11], 'rated');
  assert.equal(lines[12], '');
});

test('⭐ the chain is inside the signed bytes, because sign() has no domain separation', () => {
  // Without this, a signature made on testnet verifies byte-for-byte on mainnet and a play-money
  // game becomes a rated one.
  const onTest = canonicaliseScoresheet(sheet({ chain: 'test' }));
  const onMain = canonicaliseScoresheet(sheet({ chain: 'main' }));
  assert.notEqual(onTest, onMain);
});

test('⭐ rated and casual are different texts, so a game cannot be relabelled afterwards', () => {
  const rated = canonicaliseScoresheet(sheet({ rated: true }));
  const casual = canonicaliseScoresheet(sheet({ rated: false }));
  assert.notEqual(rated, casual);
  assert.equal(parseScoresheet(casual).rated, false);
});

test('a leading zero is refused, not accepted as the same number', () => {
  // Number('007') is 7, so a parser that only read the number would let two byte strings carry one
  // meaning. Re-serialising and comparing is what catches it.
  const text = canonicaliseScoresheet(sheet({ moveCount: 7 })).replace('\n7\n', '\n007\n');
  assert.throws(() => parseScoresheet(text), ScoresheetError);
});

test('a signed number, a decimal and a padded number are all refused', () => {
  for (const bad of ['+7', '7.0', ' 7', '7 ', '0x7']) {
    const text = canonicaliseScoresheet(sheet({ moveCount: 7 })).replace('\n7\n', `\n${bad}\n`);
    assert.throws(() => parseScoresheet(text), ScoresheetError, bad);
  }
});

test('a game against yourself is refused — the cheapest way to farm a rating', () => {
  assert.throws(() => canonicaliseScoresheet(sheet({ black: WHITE })), ScoresheetError);
  // And with different spacing, since addresses are compared without it.
  assert.throws(() => canonicaliseScoresheet(sheet({ black: WHITE.replace(/\s/g, '') })), ScoresheetError);
});

test('addresses are normalised, so spacing cannot change the digest', () => {
  const spaced = canonicaliseScoresheet(sheet({ white: WHITE, black: BLACK }));
  const tight = canonicaliseScoresheet(sheet({ white: WHITE.replace(/\s/g, ''), black: BLACK.replace(/\s/g, '') }));
  const lower = canonicaliseScoresheet(sheet({ white: WHITE.toLowerCase(), black: BLACK.toLowerCase() }));
  assert.equal(spaced, tight);
  assert.equal(spaced, lower);
});

test('anything that is not a Nimiq address is refused', () => {
  for (const bad of ['', 'NQ', 'not-an-address', 'NQ07 0000', `${WHITE}0`]) {
    assert.throws(() => canonicaliseScoresheet(sheet({ white: bad })), ScoresheetError, bad);
  }
});

test('the game id must be 32 lowercase hex', () => {
  for (const bad of ['', 'A'.repeat(32), 'a'.repeat(31), 'a'.repeat(33), 'g'.repeat(32)]) {
    assert.throws(() => canonicaliseScoresheet(sheet({ gameId: bad })), ScoresheetError, bad);
  }
});

test('an unknown result or termination is refused rather than guessed at', () => {
  assert.throws(() => canonicaliseScoresheet(sheet({ result: '1-1' as never })), ScoresheetError);
  assert.throws(() => canonicaliseScoresheet(sheet({ termination: 'vibes' as never })), ScoresheetError);
});

test('a block height of zero is refused — an unknown height must not become an ordering key', () => {
  assert.throws(() => canonicaliseScoresheet(sheet({ endedAtBlock: 0 })), ScoresheetError);
});

test('a malformed FEN is refused', () => {
  for (const bad of ['', 'not a fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -']) {
    assert.throws(() => canonicaliseScoresheet(sheet({ finalFen: bad })), ScoresheetError, bad);
  }
  assert.doesNotThrow(() => canonicaliseScoresheet(sheet({ finalFen: START_FEN })));
});

test('an unknown version is refused', () => {
  const text = canonicaliseScoresheet(sheet()).replace('chess/1', 'chess/2');
  assert.throws(() => parseScoresheet(text), ScoresheetError);
});

test('a missing trailing newline is not canonical', () => {
  assert.throws(() => parseScoresheet(canonicaliseScoresheet(sheet()).trimEnd()), ScoresheetError);
});

/* ------------------------------------------------------------------ the move hash */

test('the move hash ignores whitespace but not moves', () => {
  assert.equal(hashMoves(['e4', 'e5']), hashMoves([' e4 ', 'e5  ']));
  assert.notEqual(hashMoves(['e4', 'e5']), hashMoves(['e4', 'c5']));
  assert.notEqual(hashMoves(['e4', 'e5']), hashMoves(['e5', 'e4']), 'order is part of the game');
});

test('the move hash is base64url, so it survives a URL untouched', () => {
  assert.match(hashMoves(['e4']), /^[A-Za-z0-9_-]+$/);
});

test('an empty game still hashes, and to something stable', () => {
  assert.equal(hashMoves([]), hashMoves(['', '  ']));
});

/* ------------------------------------------------------------------ reading one */

test('who played which side, and what they scored', () => {
  const decisive = sheet({ result: '0-1' });
  assert.equal(sideOf(decisive, WHITE), 'white');
  assert.equal(sideOf(decisive, BLACK), 'black');
  assert.equal(sideOf(decisive, 'NQ22 2222 2222 2222 2222 2222 2222 2222 2222'), null);

  assert.equal(scoreFor(decisive, WHITE), 0);
  assert.equal(scoreFor(decisive, BLACK), 1);

  const drawn = sheet({ result: '1/2-1/2', termination: 'stalemate' });
  assert.equal(scoreFor(drawn, WHITE), 0.5);
  assert.equal(scoreFor(drawn, BLACK), 0.5);
});

test('⭐ a stranger scores null, not zero — "lost" and "was not there" are different facts', () => {
  const stranger = 'NQ22 2222 2222 2222 2222 2222 2222 2222 2222';
  assert.equal(scoreFor(sheet(), stranger), null);
  assert.equal(opponentOf(sheet(), stranger), null);
});

test('the opponent is the other one, whichever side you ask from', () => {
  assert.equal(sameAddress(opponentOf(sheet(), WHITE), BLACK), true);
  assert.equal(sameAddress(opponentOf(sheet(), BLACK), WHITE), true);
});
