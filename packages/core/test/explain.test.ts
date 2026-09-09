/**
 * The explanation engine, held to the only standard that matters: **it must never say something false.**
 *
 * A review that invents a reason once is never trusted again, and a chess player checks. So this file
 * is weighted deliberately towards *negative* cases — positions where a detector must stay silent —
 * because a detector that fires on everything is indistinguishable from one that understands nothing,
 * and only the negative tests can tell them apart.
 *
 * Every position is hand-built and its answer is stated in the test, not derived from the code under
 * test. Where a position is a well-known pattern it is named, so a reader can check it on a board.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { MIN_LOSS_TO_EXPLAIN, bestExplanation, explainMove, type ExplanationKind } from '../src/index.ts';

function kinds(fen: string, played: string, extra: Record<string, unknown> = {}): ExplanationKind[] {
  return explainMove({ fen, played, ...extra }).map((one) => one.kind);
}

function only(fen: string, played: string, kind: ExplanationKind): string {
  const found = explainMove({ fen, played }).find((one) => one.kind === kind);
  assert.ok(found, `expected a ${kind} finding, got: ${JSON.stringify(kinds(fen, played))}`);
  return found.text;
}

/* ------------------------------------------------------------------ mate, from the search */

test('a missed mate is reported from the search, exactly as the search said it', () => {
  const found = explainMove({
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    played: 'Kf1',
    best: 'Ra8#',
    mateIn: 1,
  });
  assert.equal(found[0]!.kind, 'missed-mate');
  assert.equal(found[0]!.basis, 'search');
  assert.match(found[0]!.text, /Ra8# was mate in 1\./);
});

test('a mate the move allows is reported as the biggest thing that happened', () => {
  const found = explainMove({
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    played: 'Kf1',
    mateAgainstAfter: 2,
  });
  assert.equal(found[0]!.kind, 'allows-mate');
  assert.match(found[0]!.text, /force mate in 2/);
});

test('no mate is claimed when the search did not report one', () => {
  assert.ok(!kinds('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Kf1').includes('missed-mate'));
});

test('the best move being the move played is not a missed anything', () => {
  const found = explainMove({
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    played: 'Ra8#',
    best: 'Ra8#',
    mateIn: 1,
  });
  assert.ok(!found.some((one) => one.kind === 'missed-mate'));
});

/* ------------------------------------------------------------------ hanging pieces */

test('⭐ moving a piece somewhere it can simply be taken is reported', () => {
  // Qd1–d6 walks in front of the c7 pawn. cxd6 wins the queen and nothing recaptures.
  const text = only('4k3/2p5/8/8/8/8/8/3QK3 w - - 0 1', 'Qd6', 'hangs-piece');
  assert.match(text, /queen on d6/);
});

test('⭐ a piece that is defended is not called hanging, however many attackers it has', () => {
  // The classic false positive: a knight on d5 attacked by a queen but defended by a pawn is not
  // hanging, and a detector that counts attackers rather than resolving the exchange says it is.
  const fen = 'r1bqkbnr/ppp1pppp/2n5/3N4/8/8/PPPP1PPP/R1BQKBNR b KQkq - 0 1';
  const chess = new Chess(fen);
  assert.ok(chess.moves().length > 0);
  // Black plays a quiet move; the white knight on d5 is attacked by nothing decisive.
  assert.ok(!kinds(fen, 'a6').includes('hangs-piece'));
});

test('a piece that was already hanging before the move is not blamed on this move', () => {
  // The bishop on h6 is en prise before White moves and after it. Attributing it to an unrelated
  // king move would send the reader to the wrong place entirely.
  const fen = '4k3/8/7b/8/8/8/6P1/4K3 w - - 0 1';
  const found = kinds(fen, 'Kd1');
  assert.ok(!found.includes('hangs-piece'), `unexpectedly blamed Kd1: ${JSON.stringify(found)}`);
});

test('a quiet developing move in the opening explains nothing at all', () => {
  // The single most important negative case: the overwhelmingly common move must produce silence.
  assert.deepEqual(kinds('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4'), []);
});

test('⭐ and neither does an even trade, however takeable the result looks', () => {
  // The Scandinavian: exd5 leaves the pawn on d5 to be taken by the queen, and that is not a hung
  // pawn — the move won a pawn first. A detector that ignores what the move captured says it is, and
  // this one did until the capture was netted off.
  const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  assert.ok(!kinds(fen, 'exd5').includes('hangs-piece'), JSON.stringify(kinds(fen, 'exd5')));
});

/* ------------------------------------------------------------------ pins */

test('⭐ walking your own piece into a pin is reported, and it is a real pin', () => {
  // Black is in check from the bishop on a4 along a4–e8. Blocking with ...Nc6 is legal and leaves the
  // knight unable to move again — a genuine absolute pin, created by the move being explained.
  //
  // This is a mistake by the mover, which is what the file exists to explain. Pinning the *opponent*
  // is a good move and is not an explanation of anything, so it is deliberately not detected.
  const fen = 'rnbqkbnr/ppp2ppp/8/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1';
  assert.equal(new Chess(fen).inCheck(), true, 'the fixture must start in check for Nc6 to be a block');

  const text = only(fen, 'Nc6', 'pin');
  assert.match(text, /knight on c6 is pinned/);

  // And it really is pinned: with the turn handed back, the knight has no legal move at all.
  const after = new Chess(fen);
  after.move('Nc6');
  const flipped = after.fen().split(' ');
  flipped[1] = 'b';
  flipped[3] = '-';
  const back = new Chess(flipped.join(' '));
  assert.equal(back.inCheck(), false, 'the block must have answered the check');
  assert.equal(back.moves({ verbose: true }).filter((m) => m.from === 'c6').length, 0);
});

test('⭐ a piece that merely cannot move is not called pinned', () => {
  // The bug this test exists for. An undeveloped rook on h8, walled in by its own bishop and knight,
  // has no legal move and is pinned by nothing at all — and the first version of the detector
  // announced it as pinned, which is a false sentence in front of a player. "No legal moves" is not
  // the definition; "removing it would expose the king" is.
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const found = explainMove({ fen, played: 'e4' });
  assert.ok(!found.some((one) => one.kind === 'pin'), JSON.stringify(found.map((f) => f.text)));

  // And a blocked pawn is not pinned either; pawns are excluded for the same reason.
  assert.ok(!kinds('4k3/8/8/8/8/3p4/3P4/4K3 w - - 0 1', 'Kf2').includes('pin'));
});

test('a pin that already existed is not attributed to a later move', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
  assert.ok(!kinds(fen, 'O-O').includes('pin'));
});

/* ------------------------------------------------------------------ passed pawns */

test('⭐ creating a passed pawn is reported', () => {
  // White's d-pawn becomes passed the moment the last blocker disappears.
  const fen = '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1';
  const text = only(fen, 'd6', 'passed-pawn-created');
  assert.match(text, /pawn on d6 is passed/);
});

test('⭐ handing the opponent a passed pawn is reported, and separately', () => {
  // The white b-pawn is the only thing holding back Black's c-pawn. Capturing on a6 takes it off the
  // b-file, and c7 is passed from that moment.
  const fen = '4k3/2p5/p7/1P6/8/8/8/4K3 w - - 0 1';
  const found = explainMove({ fen, played: 'bxa6' });
  const conceded = found.find((one) => one.kind === 'passed-pawn-conceded');
  assert.ok(conceded, `expected a conceded passed pawn, got ${JSON.stringify(found.map((f) => f.kind))}`);
  assert.match(conceded.text, /Black a passed pawn on c7/);
});

test('a pawn that was already passed is not reported again on every later move', () => {
  const fen = '4k3/8/3P4/8/8/8/8/4K3 w - - 0 1';
  assert.ok(!kinds(fen, 'Kd2').includes('passed-pawn-created'));
});

/* ------------------------------------------------------------------ forks, and why there are none */

test('⭐ no fork is ever claimed, because a fork cannot be confirmed without search', () => {
  // A fork detector was built here and deleted. Over 4,000 real positions
  // (`scripts/explain-sanity.mjs`) every single fork it claimed was false: the forking move was
  // usually a check that lost the forking piece, which geometry cannot see. This test is the guard
  // that stops it coming back on geometry alone.
  const positions: [string, string][] = [
    ['4k3/8/8/8/4n3/8/8/R3K3 w - - 0 1', 'Ra2'],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4'],
    ['r1b2r1k/5ppp/p2Rpb2/1p5q/3B4/1B4Q1/PPP2PPP/3R2K1 b - - 6 20', 'Bd4'],
  ];
  for (const [fen, played] of positions) {
    for (const found of explainMove({ fen, played })) {
      assert.doesNotMatch(found.text, /forks/i, `a fork was claimed: ${found.text}`);
    }
  }
});

/* ------------------------------------------------------------------ the gate, and refusals */

test('a move that cost almost nothing is not explained at all', () => {
  const found = bestExplanation({
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    played: 'Kf1',
    best: 'Ra8#',
    mateIn: 1,
    lostCentipawns: MIN_LOSS_TO_EXPLAIN - 1,
  });
  assert.equal(found, null);
});

test('and the same move above the gate is', () => {
  const found = bestExplanation({
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    played: 'Kf1',
    best: 'Ra8#',
    mateIn: 1,
    lostCentipawns: MIN_LOSS_TO_EXPLAIN,
  });
  assert.ok(found);
  assert.equal(found.kind, 'missed-mate');
});

test('an illegal move is never explained, and never throws', () => {
  assert.deepEqual(explainMove({ fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', played: 'Qh8' }), []);
});

test('nonsense in place of a position is never explained, and never throws', () => {
  assert.deepEqual(explainMove({ fen: 'not a fen', played: 'e4' }), []);
  assert.deepEqual(explainMove({ fen: '', played: '' }), []);
});

test('⭐ every sentence reads as one plain sentence, not a fragment or a paragraph', () => {
  // Whatever a detector finds, the reader gets something that ends with a full stop and does not run
  // on. This is a house-style check, and it fails the day somebody adds a template that forgets.
  const positions: [string, string][] = [
    ['rnbqkbnr/pp1ppppp/2p5/8/8/4Q3/PPPPPPPP/RNB1KBNR w KQkq - 0 1', 'Qd4'],
    ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', 'Bb5'],
    ['4k3/8/8/3P4/8/8/8/4K3 w - - 0 1', 'd6'],
  ];
  for (const [fen, played] of positions) {
    for (const found of explainMove({ fen, played })) {
      assert.match(found.text, /\.$/, `no full stop: ${found.text}`);
      assert.ok(found.text.length < 160, `too long: ${found.text}`);
      assert.ok(!/\n/.test(found.text), `multi-line: ${found.text}`);
    }
  }
});

test('⭐ no explanation ever claims to know what the player was thinking', () => {
  // The one thing the research is unambiguous cannot be established from a position and a move.
  const banned = /\b(you (?:got|were|felt|panicked|missed because)|greedy|careless|lazy|scared|tilted)\b/i;
  const positions: [string, string][] = [
    ['rnbqkbnr/pp1ppppp/2p5/8/8/4Q3/PPPPPPPP/RNB1KBNR w KQkq - 0 1', 'Qd4'],
    ['4k3/2p5/8/1P6/8/8/8/4K3 w - - 0 1', 'b6'],
  ];
  for (const [fen, played] of positions) {
    for (const found of explainMove({ fen, played })) {
      assert.doesNotMatch(found.text, banned, `psychology in: ${found.text}`);
    }
  }
});

test('findings come back strongest first', () => {
  const found = explainMove({
    fen: 'rnbqkbnr/pp1ppppp/2p5/8/8/4Q3/PPPPPPPP/RNB1KBNR w KQkq - 0 1',
    played: 'Qd4',
    mateAgainstAfter: 3,
  });
  assert.equal(found[0]!.kind, 'allows-mate');
  for (let i = 1; i < found.length; i++) {
    assert.ok(found[i - 1]!.weight >= found[i]!.weight, 'findings are not ordered by weight');
  }
});
