/**
 * The bot.
 *
 * Its job is not to be strong. It is to be *instant*, *beatable* and *correct* — an opponent that is
 * always there when nobody else is, so screen one is never an empty lobby. So the tests here are
 * about responsiveness and about not doing anything stupid, not about playing well.
 *
 * The one thing it must never do is play an illegal move, and the one thing it must always do is
 * answer inside its budget.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { DEFAULT_BUDGET_MS, LEVELS, chooseMove, evaluate } from '../src/index.ts';

const STRONGEST = LEVELS[LEVELS.length - 1]!;
/** Deterministic: never blunders, so a test about play is about play. */
const NEVER_BLUNDER = { random: () => 1 };

test('every level has a name, and none of them claims a rating', () => {
  // A number on a bot this weak would be a lie. Real ratings arrive with the real engine.
  for (const level of LEVELS) {
    assert.ok(level.name.length > 0);
    assert.ok(level.depth >= 1);
    assert.ok(level.blunderRate >= 0 && level.blunderRate <= 1);
    assert.ok(!/\d/.test(level.name), `${level.name} must not carry a number`);
  }
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, LEVELS.length, 'names are distinct');
});

test('⭐ every level answers inside its budget, from the opening and from a middlegame', () => {
  // Measured before this existed: a full depth-4 opening search took 21.7 seconds. The budget is
  // what turns "usually fast" into a guarantee, and a bot that hangs is worse than a weak one.
  const positions = [
    new Chess(),
    new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'),
    new Chess('8/2k5/8/8/3K4/8/6Q1/8 w - - 0 1'),
  ];
  for (const level of LEVELS) {
    for (const position of positions) {
      const started = Date.now();
      const choice = chooseMove(position, level, NEVER_BLUNDER);
      const elapsed = Date.now() - started;
      assert.ok(choice, `${level.name} found no move`);
      // A generous margin over the budget: one node can overshoot, a whole search must not.
      assert.ok(elapsed < DEFAULT_BUDGET_MS * 2, `${level.name} took ${elapsed}ms`);
    }
  }
});

test('a shorter budget still produces a legal move — it just thinks less', () => {
  const chess = new Chess();
  const choice = chooseMove(chess, STRONGEST, { ...NEVER_BLUNDER, budgetMs: 30 });
  assert.ok(choice);
  assert.ok(choice.depth >= 1, 'at least one full iteration always completes');
  assert.ok(chess.moves().includes(choice.san));
});

test('⭐ every move it ever plays is legal', () => {
  // A hundred plies against itself, every level, checked against chess.js's own move list.
  for (const level of LEVELS) {
    const chess = new Chess();
    for (let ply = 0; ply < 40 && !chess.isGameOver(); ply++) {
      const legal = chess.moves();
      const choice = chooseMove(chess, level, { random: () => 0.5, budgetMs: 60 });
      assert.ok(choice, `${level.name} found no move at ply ${ply}`);
      assert.ok(legal.includes(choice.san), `${level.name} played ${choice.san}, not in ${legal.length} legal moves`);
      chess.move(choice.san);
    }
  }
});

test('it returns null when there is nothing to play', () => {
  const mated = new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.equal(mated.moves().length, 0);
  assert.equal(chooseMove(mated, STRONGEST, NEVER_BLUNDER), null);
});

/* ------------------------------------------------------------------ not doing anything stupid */

test('⭐ it takes a free queen', () => {
  // The most basic competence test there is. A search without quiescence fails this the moment the
  // capture is defended, so this also guards the quiescence search.
  const chess = new Chess('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
  const choice = chooseMove(chess, STRONGEST, NEVER_BLUNDER);
  assert.equal(choice?.san, 'exd5', `played ${choice?.san} instead of taking the queen`);
});

test('⭐ it does not take a defended pawn with its queen — the quiescence test', () => {
  // A fixed-depth search that stops mid-exchange evaluates this as winning a pawn, because it never
  // sees the recapture. Quiescence is what stops the bot hanging its queen on move one.
  const chess = new Chess('4k3/8/8/3p4/2p5/8/3Q4/4K3 w - - 0 1');
  const choice = chooseMove(chess, STRONGEST, NEVER_BLUNDER);
  assert.notEqual(choice?.san, 'Qxd5', 'took a pawn defended by a pawn');
});

test('⭐ it plays mate in one when it has it', () => {
  // Back-rank mate. If the mate score did not carry the depth, the engine would rate every forced
  // mate equally and could shuffle instead of finishing.
  const chess = new Chess('6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1');
  const choice = chooseMove(chess, STRONGEST, NEVER_BLUNDER);
  assert.equal(choice?.san, 'Ra8#', `played ${choice?.san}`);
});

test('it prefers a faster mate to a slower one', () => {
  const chess = new Chess('6k1/5ppp/8/8/8/8/1R6/R3K3 w Q - 0 1');
  const choice = chooseMove(chess, STRONGEST, NEVER_BLUNDER);
  assert.ok(choice?.san.endsWith('#'), `played ${choice?.san}, which is not mate`);
});

/* ------------------------------------------------------------------ the blunders */

test('⭐ a blunder is the second or third best move, never a random legal one', () => {
  // Chess.com's bots are loved because they are weak in ways a person is weak. One that plays well
  // and then hangs a queen at random reads as broken, and a beginner learns nothing from it.
  const chess = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const level = { name: 'Test', depth: 2, blunderRate: 1, blunderDepth: 2 };

  const best = chooseMove(chess, { ...level, blunderRate: 0 }, { random: () => 0.99 })!;
  const blunder = chooseMove(chess, level, { random: () => 0.0 })!;

  assert.equal(blunder.blundered, true);
  assert.notEqual(blunder.san, best.san, 'a blunder is not the best move');
  assert.ok(chess.moves().includes(blunder.san), 'and it is still legal');
  // Not catastrophic: within a queen of the best move, rather than anywhere in the list.
  assert.ok(best.score - blunder.score < 900, `blunder cost ${best.score - blunder.score} centipawns`);
});

test('a level with no blunder rate never blunders, whatever the dice say', () => {
  const chess = new Chess();
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    const choice = chooseMove(chess, { name: 'Perfect', depth: 2, blunderRate: 0, blunderDepth: 3 }, { random });
    assert.equal(choice?.blundered, false);
  }
});

test('the same position and the same dice give the same move — a bot that cannot be pinned cannot be tuned', () => {
  const chess = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const first = chooseMove(chess, LEVELS[1]!, { random: () => 0.3, budgetMs: 400 });
  const second = chooseMove(chess, LEVELS[1]!, { random: () => 0.3, budgetMs: 400 });
  assert.equal(first?.san, second?.san);
});

/* ------------------------------------------------------------------ evaluation */

test('the starting position is equal, from either side', () => {
  assert.equal(evaluate(new Chess()), 0);
});

test('a piece up is a piece up, and the sign follows the side to move', () => {
  // White a knight up, white to move: positive. Same position, black to move: negative.
  const whiteToMove = evaluate(new Chess('4k3/8/8/8/8/8/8/3NK3 w - - 0 1'));
  const blackToMove = evaluate(new Chess('4k3/8/8/8/8/8/8/3NK3 b - - 0 1'));
  assert.ok(whiteToMove > 200, `expected a knight's worth, got ${whiteToMove}`);
  assert.equal(whiteToMove, -blackToMove, 'evaluation is from the mover point of view, symmetrically');
});

test('the piece-square tables put a knight in the centre ahead of one in the corner', () => {
  const centre = evaluate(new Chess('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1'));
  const corner = evaluate(new Chess('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'));
  assert.ok(centre > corner, `centre ${centre} should beat corner ${corner}`);
});
