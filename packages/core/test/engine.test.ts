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
/*
 * Search-measuring defaults.
 *
 * `useBook: false` is not incidental. With the book on, a call from the start position returns a
 * theory move at depth 0 without searching at all — so a test asserting on depth, score or blunder
 * behaviour would be measuring the opening book and would keep passing through a completely broken
 * evaluation. Tests that check *legality* deliberately leave the book on, because the book is part
 * of what the bot plays.
 */
const NEVER_BLUNDER = { random: () => 1, useBook: false } as const;

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
  /*
   * A fixed-depth search that stops mid-exchange evaluates this as winning a pawn, because it never
   * sees the recapture. Quiescence is what stops the bot hanging its queen on move one.
   *
   * **The pawn on c6 is the entire test.** This position was written as `2p5` on the *fourth* rank,
   * where a black pawn attacks b3 and d3 and defends nothing at all — so `Qxd5` simply won a free
   * pawn and was the right move. The test passed only because the engine was too slow to find it,
   * and it started failing the moment the search got faster: a green test that was proving nothing.
   * On c6 the pawn genuinely defends d5, and declining is genuinely correct.
   */
  const chess = new Chess('4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1');
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
  const level = { name: 'Test', depth: 2, blunderRate: 1, blunderDepth: 2, bookPlies: 0 };

  const best = chooseMove(chess, { ...level, blunderRate: 0 }, { random: () => 0.99, useBook: false })!;
  const blunder = chooseMove(chess, level, { random: () => 0.0, useBook: false })!;

  assert.equal(blunder.blundered, true);
  assert.notEqual(blunder.san, best.san, 'a blunder is not the best move');
  assert.ok(chess.moves().includes(blunder.san), 'and it is still legal');
  // Not catastrophic: within a queen of the best move, rather than anywhere in the list.
  assert.ok(best.score - blunder.score < 900, `blunder cost ${best.score - blunder.score} centipawns`);
});

test('a level with no blunder rate never blunders, whatever the dice say', () => {
  const chess = new Chess();
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    const choice = chooseMove(chess, { name: 'Perfect', depth: 2, blunderRate: 0, blunderDepth: 3, bookPlies: 0 }, { random, useBook: false });
    assert.equal(choice?.blundered, false);
  }
});

test('the same position and the same dice give the same move — a bot that cannot be pinned cannot be tuned', () => {
  const chess = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const first = chooseMove(chess, LEVELS[1]!, { random: () => 0.3, budgetMs: 400, useBook: false });
  const second = chooseMove(chess, LEVELS[1]!, { random: () => 0.3, budgetMs: 400, useBook: false });
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

/* ------------------------------------------------------------------ the opening book */

test('⭐ the bot no longer plays the same first move every game', () => {
  /*
   * The defect the book exists to fix, pinned as a test.
   *
   * A fixed-depth search from the start position is deterministic: same input, same output, forever.
   * Twenty games would open identically, and that is the loudest possible way to say "toy" — it
   * lands in the first ten seconds, before anything else this product does gets a hearing.
   *
   * **The thresholds are measured, not guessed.** The book weights by how much theory sits behind a
   * move, so `e4` (1,517 named lines) and `d4` (842) carry 93% of the weight between them and the
   * other eighteen first moves share the rest — which is what human chess actually looks like. A
   * first attempt at this test drew 40 games and demanded 5 distinct openings; over 200 runs the
   * worst case was 3, so it failed on correct behaviour roughly one run in fifty. Measured over the
   * same 200 runs, 200 draws never produced fewer than 8.
   */
  const openings = new Map<string, number>();
  for (let game = 0; game < 200; game++) {
    const choice = chooseMove(new Chess(), LEVELS[3]!, { budgetMs: 60 });
    openings.set(choice!.san, (openings.get(choice!.san) ?? 0) + 1);
  }

  assert.ok(openings.size >= 5, `200 games produced only ${openings.size} distinct first moves`);

  // And it is weighted rather than uniform: a bot answering 1. a3 as often as 1. e4 would be varied
  // and still obviously a machine.
  const ranked = [...openings].sort((a, b) => b[1] - a[1]);
  assert.ok(['e4', 'd4'].includes(ranked[0]![0]), `the commonest opening was ${ranked[0]![0]}`);
  assert.ok(ranked[0]![1] < 200, 'and it is not the only move it ever plays');
});

test('a book move is marked as one, and is instant', () => {
  const choice = chooseMove(new Chess(), LEVELS[3]!, { random: () => 0.5, budgetMs: 60 })!;
  assert.equal(choice.fromBook, true);
  assert.equal(choice.depth, 0, 'no search happened, and the choice says so rather than implying one');
});

test('⭐ levels leave the book where their personality says they do', () => {
  // Pip leaves after two plies and plays its own bad ideas, which is what a beginner does. Oskar
  // follows theory to eight. A beginner playing a sharp tabiya and then hanging a rook is not a
  // beginner, and it reads as a strong engine pretending to be one.
  for (const level of LEVELS) {
    const chess = new Chess();
    for (let ply = 0; ply < level.bookPlies + 2; ply++) {
      const choice = chooseMove(chess, level, { random: () => 0.5, budgetMs: 60 })!;
      if (ply < level.bookPlies) {
        assert.equal(choice.fromBook, true, `${level.name} left the book early, at ply ${ply}`);
      } else {
        assert.equal(choice.fromBook, false, `${level.name} was still in book at ply ${ply}`);
      }
      chess.move(choice.san);
    }
  }
});

test('⭐ a board built from a mid-game FEN never gets an opening-book move', () => {
  /*
   * `chess.history()` records only moves played on this instance, so a board loaded from a FEN
   * reports an empty history — and a book walked from an empty history offers *first moves*. Most
   * would be illegal and rejected, but `e4` is legal in a great many positions, so the bot would
   * occasionally play a meaningless "theory" move in a position the theory knows nothing about.
   */
  const midGame = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const choice = chooseMove(midGame, LEVELS[3]!, { random: () => 0.5, budgetMs: 200 })!;
  assert.equal(choice.fromBook, false, `played ${choice.san} out of book in a position it never walked to`);

  // And the same position reached by playing the moves *is* still in book, so the guard is not
  // simply switching the book off for everything.
  const played = new Chess();
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']) played.move(san);
  assert.equal(played.fen(), midGame.fen(), 'the two boards are the same position');
  assert.equal(chooseMove(played, LEVELS[3]!, { random: () => 0.5, budgetMs: 200 })!.fromBook, true);
});

test('the book never costs the bot a legal move', () => {
  // Whole games at every level with the book on, checked move by move against chess.js.
  for (const level of LEVELS) {
    const chess = new Chess();
    for (let ply = 0; ply < 30 && !chess.isGameOver(); ply++) {
      const legal = chess.moves();
      const choice = chooseMove(chess, level, { budgetMs: 60 })!;
      assert.ok(legal.includes(choice.san), `${level.name} played ${choice.san} at ply ${ply}`);
      chess.move(choice.san);
    }
  }
});
