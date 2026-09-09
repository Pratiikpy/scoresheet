/**
 * Which way the promotion picker opens.
 *
 * Four squares of picker hanging from a promotion square is fine when that square is the top row on
 * screen and a bug when it is the bottom one — the choices are then drawn past the edge of the
 * board, clipped by the phone's viewport and by the wallet chrome under it. Underpromotion becomes
 * unreachable, for one colour only, which is why it survives a test session played as White.
 *
 * Four combinations exist and all four are here, because the one that was broken is the one nobody
 * plays while developing: promoting as Black, on a board flipped to face Black.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promotionOpensUpward } from '../src/board.ts';

test('⭐ White promoting on a White-facing board opens downward', () => {
  // Rank 8 is the far row from White, so it is drawn at the top and there is room below it.
  assert.equal(promotionOpensUpward('e8', 'w'), false);
});

test('⭐ Black promoting on a Black-facing board opens downward', () => {
  // Flipped, rank 1 is the top row — the mirror of the case above, and just as safe.
  assert.equal(promotionOpensUpward('e1', 'b'), false);
});

test('⭐ Black promoting on a White-facing board opens upward', () => {
  // A spectator, or a review of somebody else's game, watching Black promote on the near row.
  assert.equal(promotionOpensUpward('e1', 'w'), true);
});

test('⭐ White promoting on a Black-facing board opens upward', () => {
  assert.equal(promotionOpensUpward('e8', 'b'), true);
});

test('every file behaves the same — only the rank decides', () => {
  for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const) {
    assert.equal(promotionOpensUpward(`${file}8`, 'w'), false, `${file}8 as White`);
    assert.equal(promotionOpensUpward(`${file}1`, 'w'), true, `${file}1 as White`);
  }
});

test('the two orientations are exact opposites of each other', () => {
  // Flipping the board must flip the answer, never leave both orientations opening the same way —
  // which is what the original always-downward picker did.
  for (const square of ['a1', 'h1', 'a8', 'h8'] as const) {
    assert.notEqual(promotionOpensUpward(square, 'w'), promotionOpensUpward(square, 'b'), square);
  }
});
