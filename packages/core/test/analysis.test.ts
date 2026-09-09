/**
 * The analysis, checked where being wrong would teach somebody the wrong lesson.
 *
 * Two kinds of test. The formulas are pinned against the values Lichess publishes on the page this
 * implementation is written from, so a typo in a constant fails here rather than silently reporting
 * everybody as 94% accurate. The rest are games with a known answer — a hung queen, a mate in one
 * missed — where the report must say the thing a coach would say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_LEVEL,
  BLUNDER_AT,
  INACCURACY_AT,
  MISTAKE_AT,
  acplOf,
  analyseGame,
  gameAccuracy,
  judge,
  moveAccuracy,
  winPercent,
  type AnalysedMove,
} from '../src/index.ts';

const close = (actual: number, expected: number, within: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not within ${within} of ${expected}`);

/* ------------------------------------------------------------------ the formulas */

test('an equal position is a coin toss', () => {
  assert.equal(winPercent(0), 50);
});

test('a pawn up is a clear but far from decisive advantage', () => {
  // The published curve puts +100 centipawns at about 59%, which is what makes it readable at all:
  // a pawn is worth having and is not a win, and the number says so.
  close(winPercent(100), 59.1, 0.5, 'a pawn up');
  close(winPercent(-100), 40.9, 0.5, 'a pawn down');
});

test('the curve is symmetric, so neither colour is flattered', () => {
  for (const centipawns of [25, 150, 400, 900]) {
    close(winPercent(centipawns) + winPercent(-centipawns), 100, 1e-9, `±${centipawns}`);
  }
});

test('a queen up is nearly certain, and never quite certain', () => {
  const won = winPercent(900);
  assert.ok(won > 95 && won < 100, `${won}`);
});

test('a move that costs nothing is a perfect move', () => {
  // 99.9999 by the published curve, which rounds to 100.0 wherever it is shown.
  close(moveAccuracy(50, 50), 100, 0.001, 'a move that cost nothing');
});

test('and a move that gains ground is not scored above perfect', () => {
  // Winning chances going *up* would drive the curve past 100, and somebody being told they played
  // at 103% accuracy is a bug they would screenshot. The loss is floored at zero instead.
  assert.equal(moveAccuracy(40, 70), moveAccuracy(50, 50));
});

test('losing half the game costs most of the accuracy', () => {
  const accuracy = moveAccuracy(80, 30);
  assert.ok(accuracy < 15, `${accuracy}`);
  assert.ok(accuracy >= 0, `${accuracy}`);
});

test('accuracy never goes below zero, however bad the move', () => {
  assert.equal(moveAccuracy(100, 0), Math.max(0, moveAccuracy(100, 0)));
  assert.ok(moveAccuracy(100, 0) >= 0);
});

/* ------------------------------------------------------------------ the thresholds */

test('the thresholds come out where a century of chess writing puts them', () => {
  // Half a pawn, a pawn, two pawns — pushed through the same curve from an equal position.
  close(INACCURACY_AT, 4.6, 0.2, 'inaccuracy');
  close(MISTAKE_AT, 9.1, 0.2, 'mistake');
  close(BLUNDER_AT, 17.6, 0.3, 'blunder');
});

test('and they are ordered, so a blunder is never called an inaccuracy', () => {
  assert.ok(INACCURACY_AT < MISTAKE_AT);
  assert.ok(MISTAKE_AT < BLUNDER_AT);
});

test('the engine’s own move is never criticised', () => {
  // Two searches from different roots can disagree by a few centipawns. Reporting somebody's best
  // move as an inaccuracy is the one result that would make the whole feature untrustworthy.
  assert.equal(judge(0, true), 'best');
  assert.equal(judge(40, true), 'best');
});

test('and everything else is named by what it cost', () => {
  assert.equal(judge(0, false), 'good');
  assert.equal(judge(INACCURACY_AT - 0.01, false), 'good');
  assert.equal(judge(INACCURACY_AT, false), 'inaccuracy');
  assert.equal(judge(MISTAKE_AT, false), 'mistake');
  assert.equal(judge(BLUNDER_AT, false), 'blunder');
  assert.equal(judge(90, false), 'blunder');
});

/* ------------------------------------------------------------------ the aggregation */

function moveAt(accuracy: number, winAfter: number, side: 'w' | 'b' = 'w'): AnalysedMove {
  return {
    ply: 0, side, san: 'e4', before: 0, after: 0,
    winBefore: 50, winAfter, lost: 0, accuracy, judgement: 'good', best: null,
  };
}

test('a flawless game is a flawless score', () => {
  const perfect = [100, 100, 100, 100].map((value) => moveAt(value, 50));
  assert.equal(gameAccuracy(perfect), 100);
});

test('a game with no moves does not divide by zero', () => {
  assert.equal(gameAccuracy([]), 100);
});

test('⭐ one thrown game is not averaged away by twenty quiet moves', () => {
  /*
   * The failure this is here to prevent: a player hangs their queen on move 30, plays the lost
   * ending accurately, and a plain average reports 96%. Every player knows that game was thrown
   * away by one move, and a number that disagrees is a number they stop believing.
   */
  const quiet = Array.from({ length: 20 }, () => moveAt(99, 50));
  const disaster = moveAt(4, 8);
  const mixed = gameAccuracy([...quiet.slice(0, 10), disaster, ...quiet.slice(10)]);
  const flat = gameAccuracy(quiet);
  assert.ok(mixed < flat - 8, `${mixed} should be well below ${flat}`);
});

test('and the figure stays inside 0 and 100', () => {
  const awful = Array.from({ length: 12 }, (_, index) => moveAt(0, index % 2 === 0 ? 5 : 90));
  const value = gameAccuracy(awful);
  assert.ok(value >= 0 && value <= 100, `${value}`);
});

/* ------------------------------------------------------------------ real games */

/** A shallow, fast level: these tests are about the judgement, not the engine's strength. */
const QUICK = { ...ANALYSIS_LEVEL, depth: 2 };

test('⭐ a hung queen is called a blunder', () => {
  /*
   * White simply gives the queen away to the king. There is no interpretation of this position in
   * which Qxf7+ is anything but a blunder, so if the report says otherwise the sign of the
   * evaluation is inverted — the classic analysis bug, and one that still produces plausible
   * numbers all the way through.
   *
   * Deliberately *not* the Scholar's-mate move order: there, Qxf7 is mate.
   */
  const report = analyseGame(['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+'], {
    level: QUICK,
    budgetMs: 200,
  });

  const given = report.moves.at(-1)!;
  assert.equal(given.san, 'Qxf7+');
  assert.equal(given.side, 'w');
  assert.equal(given.judgement, 'blunder', `judged ${given.judgement}, lost ${given.lost.toFixed(1)}`);
  assert.ok(given.lost > BLUNDER_AT, `${given.lost}`);
  assert.ok(given.best !== null && given.best !== 'Qxf7+', `best was ${given.best}`);
});

test('and the player who blundered is the one charged for it', () => {
  const report = analyseGame(['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+'], {
    level: QUICK,
    budgetMs: 200,
  });
  assert.equal(report.counts.w.blunder, 1);
  assert.equal(report.counts.b.blunder, 0);
  assert.ok(report.accuracy.b > report.accuracy.w, `${report.accuracy.b} vs ${report.accuracy.w}`);
});

test('⭐ theory is never called a mistake', () => {
  /*
   * A Ruy Lopez, played by the book on both sides. Before book moves were exempted this scored 67%
   * — our engine is small, and a small engine asked about `Bb5` calls one of the most-played moves
   * in chess an inaccuracy. A report that criticises theory is a report nobody believes twice.
   */
  const report = analyseGame(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'], {
    level: QUICK,
    budgetMs: 200,
  });
  assert.equal(report.counts.w.blunder, 0);
  assert.equal(report.counts.b.blunder, 0);
  assert.ok(report.accuracy.w > 80, `${report.accuracy.w}`);
  assert.ok(report.accuracy.b > 80, `${report.accuracy.b}`);
});

test('every ply is reported, in order, on the right side', () => {
  const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'];
  const report = analyseGame(moves, { level: QUICK, budgetMs: 120 });
  assert.equal(report.moves.length, moves.length);
  report.moves.forEach((move, index) => {
    assert.equal(move.ply, index);
    assert.equal(move.san, moves[index]);
    assert.equal(move.side, index % 2 === 0 ? 'w' : 'b');
  });
});

test('progress is reported as it goes, so a screen need not freeze', () => {
  const seen: number[] = [];
  analyseGame(['e4', 'e5', 'Nf3'], {
    level: QUICK,
    budgetMs: 60,
    onProgress: (done, total) => {
      assert.equal(total, 3);
      seen.push(done);
    },
  });
  assert.deepEqual(seen, [1, 2, 3]);
});

test('it can be stopped, so navigating away does not have to be waited for', () => {
  let done = 0;
  const report = analyseGame(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], {
    level: QUICK,
    budgetMs: 60,
    onProgress: () => {
      done += 1;
    },
    cancelled: () => done >= 2,
  });
  assert.equal(report.moves.length, 2);
});

test('a game that stops being legal keeps everything that was', () => {
  // Not a hypothetical: a pasted game can be truncated or wrong, and losing the twenty real moves
  // because the twenty-first is nonsense would be the wrong answer to somebody else's bad file.
  const report = analyseGame(['e4', 'e5', 'Qxq9'], { level: QUICK, budgetMs: 60 });
  assert.equal(report.moves.length, 2);
});

test('a game that ends in mate is analysed to the end', () => {
  const report = analyseGame(['f3', 'e5', 'g4', 'Qh4#'], { level: QUICK, budgetMs: 150 });
  assert.equal(report.moves.length, 4);
  assert.equal(report.moves.at(-1)!.san, 'Qh4#');
  // Being mated is the worst outcome there is, so the move that allowed it cannot be scored well.
  assert.ok(report.moves[2]!.lost > MISTAKE_AT, `${report.moves[2]!.lost}`);
});

test('⭐ but the book is not a book of good moves', () => {
  /*
   * Fool's Mate is a *named line* — `1. f3 e5 2. g4 Qh4#` is in the book, because the book contains
   * every opening anybody bothered to name rather than the good ones. An unconditional theory
   * exemption scored this game 100% for the player who had just been mated in two.
   */
  const report = analyseGame(['f3', 'e5', 'g4', 'Qh4#'], { level: QUICK, budgetMs: 150 });
  assert.equal(report.moves[2]!.san, 'g4');
  assert.equal(report.moves[2]!.judgement, 'blunder');
  assert.ok(report.accuracy.w < 60, `White played into mate in two and scored ${report.accuracy.w}`);
});

/* ------------------------------------------------------------------ centipawn loss */

test('centipawn loss is zero for a side that played the engine’s moves', () => {
  const clean: AnalysedMove[] = [0, 1, 2].map((ply) => ({
    ply, side: 'w', san: 'e4', before: 20, after: 20,
    winBefore: 52, winAfter: 52, lost: 0, accuracy: 100, judgement: 'best', best: null,
  }));
  assert.equal(acplOf(clean, 'w'), 0);
});

test('and is the mean of what each move cost', () => {
  const moves: AnalysedMove[] = [
    { ply: 0, side: 'w', san: 'a', before: 0, after: -100, winBefore: 50, winAfter: 41, lost: 9, accuracy: 60, judgement: 'mistake', best: 'b' },
    { ply: 2, side: 'w', san: 'c', before: 0, after: -200, winBefore: 50, winAfter: 32, lost: 18, accuracy: 40, judgement: 'blunder', best: 'd' },
  ];
  assert.equal(acplOf(moves, 'w'), 150);
});

test('⭐ and one missed mate does not swallow the number', () => {
  /*
   * A mate is scored at a million centipawns. Uncapped, a single missed mate in a forty-move game
   * would report an average loss of twenty-five thousand — a number that says nothing about the
   * other thirty-nine moves. A queen is as much as one move can meaningfully cost.
   */
  const moves: AnalysedMove[] = [
    { ply: 0, side: 'b', san: 'a', before: 0, after: -1_000_000, winBefore: 50, winAfter: 0, lost: 50, accuracy: 0, judgement: 'blunder', best: 'b' },
    { ply: 2, side: 'b', san: 'c', before: 0, after: 0, winBefore: 50, winAfter: 50, lost: 0, accuracy: 100, judgement: 'best', best: null },
  ];
  assert.equal(acplOf(moves, 'b'), 500, 'the cap did not hold');
});

test('a side with no moves has no loss to average', () => {
  assert.equal(acplOf([], 'w'), 0);
});

test('a real game reports a loss for both sides', () => {
  const report = analyseGame(['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+'], { level: QUICK, budgetMs: 200 });
  assert.ok(report.acpl.w > 0, `White threw a queen and lost ${report.acpl.w} centipawns a move`);
  assert.ok(Number.isInteger(report.acpl.w) && Number.isInteger(report.acpl.b));
});
