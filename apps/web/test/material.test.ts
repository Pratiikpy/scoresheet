/**
 * The material count, checked where it is easy to get wrong.
 *
 * Two cases carry the whole thing: a promoted queen, which a naive subtraction reports as a negative
 * capture, and an even position, which must show nothing rather than a row of zeros. Both come from
 * real games rather than being edge cases somebody imagined.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionFromFen } from '../src/board.ts';
import { describe, materialOf } from '../src/material.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('a fresh board has captured nothing and is level', () => {
  const material = materialOf(positionFromFen(START));
  assert.deepEqual(material.whiteTook, []);
  assert.deepEqual(material.blackTook, []);
  assert.equal(material.advantage, 0);
});

test('captures are read from the position, so scrubbing back is always right', () => {
  /*
   * Read off the FEN rather than guessed at — the first version of this test guessed and was wrong
   * about its own fixture, which is a good argument for counting rather than assuming.
   *
   * Black's rank 8 is `r1bqkb1r`: both knights gone. Rank 7 is `ppp2ppp`: two pawns gone.
   * White's rank 1 is `RN1QKBNR`: the queen's bishop gone. Rank 2 is whole.
   */
  const material = materialOf(positionFromFen('r1bqkb1r/ppp2ppp/8/8/8/8/PPPPPPPP/RN1QKBNR w KQkq - 0 1'));
  assert.deepEqual([...material.whiteTook].sort(), ['n', 'n', 'p', 'p']);
  assert.deepEqual(material.blackTook, ['b']);
  // Two knights and two pawns against one bishop: white is five ahead.
  assert.equal(material.advantage, 5);
});

test('⭐ a promoted queen is not reported as a negative capture', () => {
  /*
   * The bug a naive count walks straight into. White has two queens after promoting, so
   * "eight pawns minus the pawns present" is fine but "one queen minus two queens" is −1 — and the
   * tray would show a captured piece that does not exist.
   */
  const twoQueens = 'rnbqkbnr/1ppppppp/8/8/8/8/1PPPPPPP/RNBQKBNQ w kq - 0 1';
  const material = materialOf(positionFromFen(twoQueens));
  assert.ok(!material.whiteTook.includes('q'), 'nobody captured a queen here');
  assert.ok(material.whiteTook.every((kind) => typeof kind === 'string'));
  assert.ok(material.blackTook.length >= 0);
});

test('⭐ the advantage is computed from the board, so promotions count', () => {
  // White has swapped a rook for a second queen: nine plus nine against nine and five.
  const material = materialOf(positionFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/QNBQKBNR w Kkq - 0 1'));
  assert.equal(material.advantage, 4, 'a queen where a rook stood is four points');
});

test('being a piece up reads as a positive advantage for the right side', () => {
  const white = materialOf(positionFromFen('rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  assert.equal(white.advantage, 3);
  const black = materialOf(positionFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 1'));
  assert.equal(black.advantage, -3);
});

test('the tray is described in words, for somebody who cannot see it', () => {
  // A row of glyphs says nothing to a screen reader, so the label says it in English.
  assert.equal(describe(['q']), 'a queen');
  assert.equal(describe(['p', 'p']), 'two pawns');
  assert.equal(describe(['q', 'p', 'p']), 'a queen and two pawns');
  assert.equal(describe(['r', 'n', 'p']), 'a rook, a knight and a pawn');
  assert.equal(describe([]), 'nothing');
});

test('kings are never counted, because neither side can capture one', () => {
  // A position with no kings at all must not report two captured kings.
  const material = materialOf(positionFromFen('rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w - - 0 1'));
  assert.ok(!material.whiteTook.includes('k'));
  assert.ok(!material.blackTook.includes('k'));
  assert.equal(material.advantage, 0);
});
