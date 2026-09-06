/**
 * The two things `chess.js` does not answer.
 *
 * The first section is the finding that deleted a module: insufficient material was compared case
 * by case against `lichess-org/scalachess` (MIT), read 6 September 2026, and `chess.js` agrees with
 * Lichess on every one. A hand-written replacement was written, measured, found redundant and
 * removed. These tests stay so that if a future `chess.js` ever drifts, we hear about it here rather
 * than in somebody's game.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { adjudicateFlag, canClaimThreefold, canPossiblyMate, isFivefoldRepetition, outcomeOf } from '../src/index.ts';

/* --------------------------------------------- chess.js against Lichess, case by case */

test('⭐ chess.js agrees with scalachess on every insufficient-material case', () => {
  // The expected column is scalachess's rule:
  //   kingsAndMinorsOnly && (nbPieces <= 3 || (kingsAndBishopsOnly && !bishopsOnOppositeColors))
  const cases: Array<[string, string, boolean]> = [
    ['K vs K', '8/8/8/4k3/8/8/8/K7 w - - 0 1', true],
    ['K+B vs K', '8/8/8/4k3/8/8/8/KB6 w - - 0 1', true],
    ['K+N vs K', '8/8/8/4k3/8/8/8/KN6 w - - 0 1', true],
    // A helpmate exists with two knights, so the position is not dead. The one everybody gets wrong.
    ['K+N+N vs K', '8/8/8/4k3/8/8/8/KNN5 w - - 0 1', false],
    ['bishops same colour (c1, c5)', '8/8/8/2b1k3/8/8/8/K1B5 w - - 0 1', true],
    ['bishops opposite (b1, c5)', '8/8/8/2b1k3/8/8/8/KB6 w - - 0 1', false],
    ['bishops opposite (c1, b5)', '8/8/8/1b2k3/8/8/8/K1B5 w - - 0 1', false],
    ['K+B+B one side, same colour', '8/8/8/4k3/8/8/8/KB1B4 w - - 0 1', true],
    ['K+B+N vs K', '8/8/8/4k3/8/8/8/KBN5 w - - 0 1', false],
    ['K+R vs K', '8/8/8/4k3/8/8/8/KR6 w - - 0 1', false],
    ['K+P vs K', '8/8/8/4k3/8/8/P7/K7 w - - 0 1', false],
  ];
  for (const [name, fen, lichess] of cases) {
    assert.equal(new Chess(fen).isInsufficientMaterial(), lichess, name);
  }
});

/* ------------------------------------------------------------------ flagging */

test('⭐ a lone king cannot win on time — chess.js has no rule for this at all', () => {
  const position = new Chess('8/8/8/4k3/8/8/8/K7 w - - 0 1');
  assert.equal(canPossiblyMate(position, 'w'), false);
  assert.equal(adjudicateFlag(position, 'b'), '1/2-1/2');
});

test('⭐ a lone knight wins on time only against a queen', () => {
  // The asymmetric rule: a knight can force mate when the opponent has a queen to be forced into
  // blocking its own king, and cannot against a bare king. This is *not* the dead-position test.
  const bareKing = new Chess('8/8/8/4k3/8/8/8/KN6 w - - 0 1');
  assert.equal(canPossiblyMate(bareKing, 'w'), false);
  assert.equal(adjudicateFlag(bareKing, 'b'), '1/2-1/2');

  const withQueen = new Chess('8/8/8/3qk3/8/8/8/KN6 w - - 0 1');
  assert.equal(canPossiblyMate(withQueen, 'w'), true);
  assert.equal(adjudicateFlag(withQueen, 'b'), '1-0');
});

test('a lone bishop needs something to force into the way', () => {
  // Against a bare king: never.
  assert.equal(canPossiblyMate(new Chess('8/8/8/4k3/8/8/8/KB6 w - - 0 1'), 'w'), false);
  // Against a knight: yes, it can be forced to block.
  assert.equal(canPossiblyMate(new Chess('8/8/8/3nk3/8/8/8/KB6 w - - 0 1'), 'w'), true);
  // Against a bishop of the opposite colour: yes. b1 is light, c5 is dark.
  assert.equal(canPossiblyMate(new Chess('8/8/8/2b1k3/8/8/8/KB6 w - - 0 1'), 'w'), true);
  // Against a bishop of the same colour: no. c1 and f4 are both dark.
  // (Square colours here are computed, not eyeballed — two earlier drafts of this file called
  // b1/b5 and c1/b5 same-coloured pairs, and both are opposite. `(file + rank) % 2 === 0` is dark.)
  assert.equal(canPossiblyMate(new Chess('8/8/8/4k3/5b2/8/8/K1B5 w - - 0 1'), 'w'), false);
});

test('two minor pieces can always mate, and so can any pawn, rook or queen', () => {
  assert.equal(canPossiblyMate(new Chess('8/8/8/4k3/8/8/8/KNN5 w - - 0 1'), 'w'), true);
  assert.equal(canPossiblyMate(new Chess('8/8/8/4k3/8/8/8/KBN5 w - - 0 1'), 'w'), true);
  for (const fen of ['8/8/8/4k3/8/8/8/KR6 w - - 0 1', '8/8/8/4k3/8/8/8/KQ6 w - - 0 1', '8/8/8/4k3/8/8/P7/K7 w - - 0 1']) {
    assert.equal(adjudicateFlag(new Chess(fen), 'b'), '1-0', fen);
  }
});

test('the flag is awarded to the side that still has time, on the right side of the result', () => {
  assert.equal(adjudicateFlag(new Chess('8/8/8/3rk3/8/8/8/K7 w - - 0 1'), 'w'), '0-1');
});

/* ------------------------------------------------------------------ the verdict */

test('checkmate is read from the position, and names the winner', () => {
  const fools = new Chess();
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) fools.move(move);
  assert.deepEqual(outcomeOf(fools), { over: true, result: '0-1', termination: 'checkmate' });
});

test('stalemate is a draw, and is not checkmate', () => {
  assert.deepEqual(outcomeOf(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), {
    over: true,
    result: '1/2-1/2',
    termination: 'stalemate',
  });
});

test('a live position is not over', () => {
  assert.deepEqual(outcomeOf(new Chess()), { over: false, result: null, termination: null });
});

test('the fifty-move rule ends the game', () => {
  const outcome = outcomeOf(new Chess('8/8/8/4k3/8/8/4K3/7R w - - 100 80'));
  assert.equal(outcome.over, true);
  assert.equal(outcome.termination, 'fifty-move');
});

test('a dead position ends the game', () => {
  const outcome = outcomeOf(new Chess('8/8/8/4k3/8/8/8/KB6 w - - 0 1'));
  assert.equal(outcome.over, true);
  assert.equal(outcome.termination, 'insufficient');
});

test('⭐ we auto-draw on fivefold, not threefold — threefold is a claim, not a verdict', () => {
  // Shuffling knights. After three occurrences a player *may* claim; ending it for them would take
  // the decision from somebody who might still be playing for a win.
  const chess = new Chess();
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  for (let i = 0; i < 2; i++) for (const move of cycle) chess.move(move);

  assert.equal(canClaimThreefold(chess), true, 'threefold reached, and claimable');
  assert.equal(isFivefoldRepetition(chess), false);
  assert.equal(outcomeOf(chess).over, false, 'and the game is still on');

  for (let i = 0; i < 2; i++) for (const move of cycle) chess.move(move);
  assert.equal(isFivefoldRepetition(chess), true);
  assert.equal(outcomeOf(chess).termination, 'repetition');
});

/* ------------------------------------------------------------------ what chess.js gets right */

test('chess.js is right about legality, and we lean on it entirely', () => {
  // The pinned-pawn en passant: capturing vacates both c5 and d5 and would expose the king on a5 to
  // the rook on h5. The classic case a naive generator allows.
  const pinned = new Chess('8/8/8/K1Pp3r/8/8/8/7k w - d6 0 2');
  assert.deepEqual(pinned.moves({ square: 'c5' }), ['c6'], 'cxd6 e.p. is correctly not offered');

  const throughCheck = new Chess('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
  assert.ok(!throughCheck.moves().includes('O-O'), 'cannot castle through an attacked square');
});
