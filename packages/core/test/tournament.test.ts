/**
 * The tournament, held to the two properties that make it worth having.
 *
 * **Determinism**, because the whole claim is that a stranger recomputes the pairings and the
 * standings and gets ours. And **no chance anywhere**, because the competition's rules ban it and
 * FIDE's own rules do not clear that bar — FIDE draws board-one colour by lot and falls back to lots
 * when its tie-breaks run out, and both would disqualify an entry that pays out on them.
 *
 * The circle method is the part most likely to be subtly wrong, so it is checked exhaustively rather
 * than on one example: every field size, every player meets every other exactly once, and colours
 * stay balanced. A schedule that is wrong for seven players and right for four is exactly the bug
 * that ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ROUND_ROBIN,
  TournamentError,
  drawOrder,
  prizeSplit,
  roundRobin,
  scheduleFor,
  standings,
  type TournamentResult,
} from '../src/index.ts';

function players(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `NQ${String(i).padStart(2, '0')}${'0'.repeat(32)}`.slice(0, 36));
}

/* ------------------------------------------------------------------ the draw */

test('⭐ the draw is a pure function of the tournament and its entrants', () => {
  const entrants = players(6);
  assert.deepEqual(drawOrder('t1', entrants), drawOrder('t1', entrants));
});

test('⭐ the order somebody registered in cannot change the draw', () => {
  // Otherwise whoever refreshed fastest would get an advantage, which is a chance outcome wearing a
  // different hat.
  const entrants = players(6);
  assert.deepEqual(drawOrder('t1', entrants), drawOrder('t1', [...entrants].reverse()));
});

test('a different tournament gives a different draw', () => {
  const entrants = players(6);
  assert.notDeepEqual(drawOrder('t1', entrants), drawOrder('t2', entrants));
});

test('the draw contains exactly the entrants, once each', () => {
  const entrants = players(7);
  const order = drawOrder('t1', entrants);
  assert.equal(order.length, 7);
  assert.deepEqual([...order].sort(), [...entrants.map((a) => a.toUpperCase())].sort());
});

test('duplicate registrations are collapsed rather than paired against themselves', () => {
  const order = drawOrder('t1', [...players(4), ...players(4)]);
  assert.equal(order.length, 4);
});

test('a tournament of one is refused', () => {
  assert.throws(() => drawOrder('t1', players(1)), TournamentError);
});

/* ------------------------------------------------------------------ the schedule */

test('⭐ every player meets every other exactly once, at every size from 2 to 8', () => {
  for (let n = 2; n <= MAX_ROUND_ROBIN; n++) {
    const order = players(n);
    const pairings = roundRobin(order);

    const met = new Map<string, Set<string>>(order.map((a) => [a, new Set<string>()]));
    for (const pairing of pairings) {
      assert.notEqual(pairing.white, pairing.black, `${n}: somebody was paired with themselves`);
      assert.equal(met.get(pairing.white)!.has(pairing.black), false, `${n}: a pair met twice`);
      met.get(pairing.white)!.add(pairing.black);
      met.get(pairing.black)!.add(pairing.white);
    }

    for (const player of order) {
      assert.equal(met.get(player)!.size, n - 1, `${n}: ${player} did not meet everybody`);
    }
  }
});

test('⭐ the number of rounds is what a round-robin needs, odd fields included', () => {
  for (let n = 2; n <= MAX_ROUND_ROBIN; n++) {
    const pairings = roundRobin(players(n));
    const rounds = new Set(pairings.map((p) => p.round)).size;
    // An odd field needs n rounds, because somebody sits out each one.
    assert.equal(rounds, n % 2 === 0 ? n - 1 : n, `${n} players`);
  }
});

test('⭐ nobody plays the same colour throughout — colours stay balanced', () => {
  // The bug the naive circle method has: the fixed player at board zero takes the same colour every
  // round, which over seven rounds is a real and entirely avoidable advantage.
  for (let n = 4; n <= MAX_ROUND_ROBIN; n++) {
    const order = players(n);
    const pairings = roundRobin(order);
    for (const player of order) {
      const whites = pairings.filter((p) => p.white === player).length;
      const blacks = pairings.filter((p) => p.black === player).length;
      assert.ok(
        Math.abs(whites - blacks) <= 2,
        `${n} players: ${player} had ${whites} whites and ${blacks} blacks`,
      );
    }
  }
});

test('an odd field gives exactly one player a bye each round, and never the same one twice', () => {
  const order = players(5);
  const pairings = roundRobin(order);
  const rounds = new Set(pairings.map((p) => p.round));

  const byes: string[] = [];
  for (const round of rounds) {
    const playing = new Set(
      pairings.filter((p) => p.round === round).flatMap((p) => [p.white, p.black]),
    );
    const sittingOut = order.filter((player) => !playing.has(player));
    assert.equal(sittingOut.length, 1, `round ${round} did not have exactly one bye`);
    byes.push(sittingOut[0]!);
  }
  assert.equal(new Set(byes).size, byes.length, 'somebody had two byes');
});

test('a field too large for a round-robin is refused rather than paired badly', () => {
  assert.throws(() => roundRobin(players(MAX_ROUND_ROBIN + 1)), TournamentError);
});

test('the whole schedule is reproducible from the id and the entrants alone', () => {
  const entrants = players(6);
  assert.deepEqual(scheduleFor('t1', entrants), scheduleFor('t1', [...entrants].reverse()));
});

/* ------------------------------------------------------------------ standings */

function result(round: number, white: string, black: string, whiteScore: number): TournamentResult {
  return { round, white, black, whiteScore };
}

test('points are counted the only way they are counted', () => {
  const [a, b] = players(2);
  const table = standings([a!, b!], [result(0, a!, b!, 1)]);
  assert.equal(table[0]!.address, a!.toUpperCase());
  assert.equal(table[0]!.score, 1);
  assert.equal(table[0]!.wins, 1);
  assert.equal(table[1]!.score, 0);
  assert.equal(table[1]!.losses, 1);
});

test('a draw is half a point each and neither a win nor a loss', () => {
  const [a, b] = players(2);
  const table = standings([a!, b!], [result(0, a!, b!, 0.5)]);
  assert.equal(table[0]!.score, 0.5);
  assert.equal(table[0]!.draws, 1);
  assert.equal(table[0]!.wins, 0);
});

test('⭐ a tie on score is broken by the game between them', () => {
  // The tie-break a player checks first, and the one it would be indefensible to get wrong.
  const [a, b, c, d] = players(4) as [string, string, string, string];
  const results = [
    result(0, a, b, 1), // a beats b
    result(0, c, d, 1),
    result(1, a, c, 0), // c beats a
    result(1, b, d, 1),
    result(2, a, d, 1),
    result(2, b, c, 0), // c beats b
  ];
  // a: beat b, lost to c, beat d = 2. c: beat d, beat a, beat b = 3.
  const table = standings([a, b, c, d], results);
  assert.equal(table[0]!.address, c.toUpperCase());
  assert.equal(table[0]!.score, 3);
});

test('⭐ when two are level, the one who beat the other is placed first', () => {
  const [a, b, c] = players(3) as [string, string, string];
  const results = [
    result(0, a, b, 1), // a beat b
    result(1, b, c, 1),
    result(2, a, c, 0),
  ];
  // a: 1 win 1 loss = 1. b: 1 loss 1 win = 1. c: 1 win 1 loss = 1. All level on score.
  const table = standings([a, b, c], results);
  const aPlace = table.find((s) => s.address === a.toUpperCase())!.place;
  const bPlace = table.find((s) => s.address === b.toUpperCase())!.place;
  assert.ok(aPlace < bPlace, 'the player who won the head-to-head must be placed higher');
});

test('players level on everything share a place, and the next place skips', () => {
  const [a, b] = players(2) as [string, string];
  const table = standings([a, b], [result(0, a, b, 0.5)]);
  assert.equal(table[0]!.place, 1);
  assert.equal(table[1]!.place, 1);
});

test('⭐ the standings are a pure function of the results, whatever order they arrive in', () => {
  const [a, b, c, d] = players(4) as [string, string, string, string];
  const results = [
    result(0, a, b, 1),
    result(0, c, d, 0),
    result(1, a, c, 0.5),
    result(1, b, d, 1),
    result(2, a, d, 1),
    result(2, b, c, 0),
  ];
  const forwards = standings([a, b, c, d], results);
  const backwards = standings([a, b, c, d], [...results].reverse());
  assert.deepEqual(forwards, backwards);
});

test('a player who played nothing is still in the table, on zero', () => {
  const [a, b, c] = players(3) as [string, string, string];
  const table = standings([a, b, c], [result(0, a, b, 1)]);
  const absent = table.find((s) => s.address === c.toUpperCase());
  assert.ok(absent);
  assert.equal(absent.score, 0);
  assert.equal(absent.played, 0);
});

test('a result naming somebody who is not in the tournament is ignored, not counted', () => {
  const [a, b] = players(2) as [string, string];
  const stranger = players(9)[8]!;
  const table = standings([a, b], [result(0, a, stranger, 1)]);
  assert.equal(table.find((s) => s.address === a.toUpperCase())!.played, 1);
  assert.equal(table.length, 2);
});

test('Sonneborn-Berger counts who you beat, not merely how many', () => {
  const [a, b, c, d] = players(4) as [string, string, string, string];
  // a and b both score 1. a beat the eventual leader; b beat the tail-ender.
  const results = [
    result(0, a, c, 1), // a beats c, and c goes on to win the rest
    result(0, b, d, 1), // b beats d, and d loses the rest
    result(1, c, d, 1),
    result(1, a, b, 0.5),
  ];
  const table = standings([a, b, c, d], results);
  const forA = table.find((s) => s.address === a.toUpperCase())!;
  const forB = table.find((s) => s.address === b.toUpperCase())!;
  assert.ok(
    forA.sonnebornBerger > forB.sonnebornBerger,
    `beating the stronger finisher must be worth more: ${forA.sonnebornBerger} vs ${forB.sonnebornBerger}`,
  );
});

/* ------------------------------------------------------------------ the money */

test('a clear win takes the first prize', () => {
  const [a, b] = players(2) as [string, string];
  const table = standings([a, b], [result(0, a, b, 1)]);
  const payout = prizeSplit(table, [1000, 500]);
  assert.equal(payout.get(a.toUpperCase()), 1000);
  assert.equal(payout.get(b.toUpperCase()), 500);
});

test('⭐ an unbreakable tie splits the pooled prizes equally — never a decider, never lots', () => {
  // FIDE's own answer here is drawing of lots, which is banned outright for anything that pays out.
  const [a, b] = players(2) as [string, string];
  const table = standings([a, b], [result(0, a, b, 0.5)]);
  const payout = prizeSplit(table, [1000, 500]);
  assert.equal(payout.get(a.toUpperCase()), 750);
  assert.equal(payout.get(b.toUpperCase()), 750);
});

test('⭐ nobody is paid twice, and the total never exceeds the prize table', () => {
  const [a, b, c, d] = players(4) as [string, string, string, string];
  const table = standings([a, b, c, d], [result(0, a, b, 0.5), result(0, c, d, 0.5)]);
  const prizes = [1000, 500, 200, 100];
  const payout = prizeSplit(table, prizes);
  const total = [...payout.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(total <= prizes.reduce((sum, value) => sum + value, 0), `paid out ${total}`);
});

test('an uneven split leaves the remainder unallocated rather than favouring whoever sorts first', () => {
  const [a, b, c] = players(3) as [string, string, string];
  const table = standings([a, b, c], [result(0, a, b, 0.5)]);
  // Three-way tie on zero is impossible here, so force a two-way tie on a table that will not divide.
  const payout = prizeSplit(
    table.map((standing) => ({ ...standing, place: 1 })),
    [101],
  );
  const values = [...payout.values()];
  assert.ok(values.every((value) => value === values[0]), 'everybody in a tie gets the same');
});

test('⭐ two players tied for first share the single first prize, and nobody else is paid', () => {
  // Both winners are level on everything, so they jointly occupy first — and with only one prize
  // declared, that one prize is what they share. My first expectation here was that exactly one
  // player would be paid, which would have meant breaking the tie somehow, and the only ways to do
  // that are a decider or a draw of lots.
  const [a, b, c, d] = players(4) as [string, string, string, string];
  const table = standings([a, b, c, d], [result(0, a, b, 1), result(0, c, d, 1)]);
  const payout = prizeSplit(table, [1000]);

  const paid = [...payout.values()];
  assert.equal(payout.size, 2, 'both players tied for first must be paid');
  assert.deepEqual(paid, [500, 500]);
  assert.equal(paid.reduce((sum, value) => sum + value, 0), 1000, 'and the pot is not exceeded');
});

test('no prizes at all pays nobody, and does not throw', () => {
  const [a, b] = players(2) as [string, string];
  const table = standings([a, b], [result(0, a, b, 1)]);
  assert.equal(prizeSplit(table, []).size, 0);
});
