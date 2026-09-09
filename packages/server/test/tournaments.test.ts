/**
 * The tournament server, attacked at the places where money changes hands.
 *
 * The arithmetic is proved in `@scoresheet/core` and exhaustively re-proved by
 * `scripts/tournament-check.mjs`. What is left for this file is everything a *server* can get wrong,
 * and every one of these is a way somebody could take a prize they did not win:
 *
 *  - reporting a game against somebody they were never paired with
 *  - reporting the same game twice, with a better result the second time
 *  - joining after the draw, so the pairings they saw are not the ones they play
 *  - the draw changing after somebody has already seen it
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair } from '@nimiq/core';
import { canonicaliseScoresheet, normaliseAddress, type Scoresheet } from '@scoresheet/core';
import { nimiqSignedMessageDigest } from '@scoresheet/verify';
import {
  TournamentServerError,
  createMemoryStore,
  createTournaments,
  type SignedResult,
  type Tournaments,
} from '../src/tournaments.ts';

/*
 * Real key pairs, because a tournament result is now a signed game.
 *
 * These used to be invented address-shaped strings, which was fine while `record` believed whatever
 * it was told. It no longer does: the two players and the winner are read out of a scoresheet both
 * of them signed, so a test that wants to report a result has to be able to sign one. Generated once
 * and memoised by index, so `players(4)` returns the same four addresses every time it is called
 * within a run — the pairings refer to them, and a fresh set each call would not match.
 */
const pairs: KeyPair[] = [];
function keyFor(index: number): KeyPair {
  while (pairs.length <= index) pairs.push(KeyPair.generate());
  return pairs[index]!;
}

const addressOf = (pair: KeyPair): string => pair.publicKey.toAddress().toUserFriendlyAddress();

function players(n: number): string[] {
  return Array.from({ length: n }, (_, i) => addressOf(keyFor(i)));
}

/*
 * Matched on the normalised form, because the two sides spell an address differently.
 *
 * `addressOf` returns Nimiq's user-friendly spacing (`NQ57 5C91 …`) and the tournament stores every
 * address normalised (`NQ575C91…`), so a pairing read back out never string-equals the address the
 * key pair produced. Comparing the raw strings looked right and found nothing.
 */
function keyOf(address: string): KeyPair {
  const wanted = normaliseAddress(address);
  const found = pairs.find((pair) => normaliseAddress(addressOf(pair)) === wanted);
  if (!found) throw new Error(`no key for ${address}`);
  return found;
}

const encoder = new TextEncoder();

function signWith(pair: KeyPair, text: string) {
  return {
    publicKeyHex: pair.publicKey.toHex(),
    signatureHex: pair.sign(nimiqSignedMessageDigest(encoder.encode(text))).toHex(),
  };
}

let nextGame = 0;

/**
 * A real, properly signed game between two addresses, with a chosen result.
 *
 * Everything a caller could previously assert — who played, who won — now has to be true of the
 * signed text, which is the point of the change this helper exists to test.
 */
function signedGame(
  white: string,
  black: string,
  whiteScore: 0 | 0.5 | 1,
  round = 0,
  endedAtBlock?: number,
  chain: 'main' | 'test' = 'main',
): SignedResult {
  nextGame += 1;
  const sheet: Scoresheet = {
    chain,
    gameId: nextGame.toString(16).padStart(32, '0'),
    white,
    black,
    result: whiteScore === 1 ? '1-0' : whiteScore === 0 ? '0-1' : '1/2-1/2',
    termination: 'checkmate',
    moveCount: 34,
    finalFen: '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 41',
    endedAtBlock: endedAtBlock ?? 4_100_000 + nextGame,
    movesHash: 'AAAA',
    rated: true,
  };
  const text = canonicaliseScoresheet(sheet);
  return {
    round,
    scoresheet: text,
    signatures: { white: signWith(keyOf(white), text), black: signWith(keyOf(black), text) },
  };
}

/** Report a pairing's game, signed by the two people the draw actually paired. */
function report(
  api: Tournaments,
  id: string,
  pairing: { round: number; white: string; black: string },
  whiteScore: 0 | 0.5 | 1,
) {
  return api.record(id, signedGame(pairing.white, pairing.black, whiteScore, pairing.round));
}

function server(): Tournaments {
  let id = 0;
  return createTournaments({
    store: createMemoryStore(),
    blockHeight: async () => 4_100_000,
    newId: () => `t${(id += 1)}`,
  });
}

async function fullOf(size: number): Promise<{ api: Tournaments; id: string; field: string[] }> {
  const api = server();
  const field = players(size);
  const created = await api.create({ name: 'Friday', seats: size, prizes: [1000, 500], creator: field[0]! });
  for (const player of field.slice(1)) api.join(created.id, player);
  return { api, id: created.id, field };
}

/* ------------------------------------------------------------------ creating and joining */

test('a new tournament is open, and the creator is already in it', async () => {
  const api = server();
  const created = await api.create({ name: 'Friday', seats: 4, prizes: [1000], creator: players(1)[0]! });
  assert.equal(created.state, 'open');
  assert.equal(created.entrants.length, 1);
  assert.equal(created.pairings.length, 0);
});

test('filling the last seat closes registration and fixes the draw', async () => {
  const { api, id } = await fullOf(4);
  const view = api.view(id);
  assert.equal(view.state, 'running');
  assert.equal(view.order.length, 4);
  assert.equal(view.pairings.length, 6, 'four players is six games');
});

test('⭐ the draw is fixed once, and does not move afterwards', async () => {
  // The fairness argument is that the entrant list was closed before anybody saw the result. A draw
  // that could be recomputed later is a draw that can change under a player who has already seen it.
  const { api, id } = await fullOf(4);
  const first = api.view(id);
  const second = api.view(id);
  assert.deepEqual(first.order, second.order);
  assert.deepEqual(first.pairings, second.pairings);
});

test('joining a full tournament is refused', async () => {
  const { api, id } = await fullOf(4);
  assert.throws(() => api.join(id, players(9)[8]!), TournamentServerError);
});

test('joining twice is not an error, and does not enter you twice', async () => {
  const api = server();
  const field = players(4);
  const created = await api.create({ name: 'Friday', seats: 4, prizes: [1000], creator: field[0]! });
  api.join(created.id, field[1]!);
  const again = api.join(created.id, field[1]!);
  assert.equal(again.entrants.length, 2);
});

test('a tournament nobody could win is refused at creation', async () => {
  const api = server();
  await assert.rejects(
    () => api.create({ name: 'Solo', seats: 1, prizes: [], creator: players(1)[0]! }),
    TournamentServerError,
  );
  await assert.rejects(
    () => api.create({ name: '', seats: 4, prizes: [], creator: players(1)[0]! }),
    TournamentServerError,
  );
  await assert.rejects(
    () => api.create({ name: 'Bad prizes', seats: 4, prizes: [-1], creator: players(1)[0]! }),
    TournamentServerError,
  );
});

test('⭐ nine players is accepted now, and paired by Swiss rather than refused', async () => {
  // This test asserted a refusal until Swiss existed, and updating it is the point: the boundary
  // moved from eight to sixteen, and a test that still demanded a refusal at nine would have been
  // asserting a limitation rather than a rule.
  const api = server();
  const created = await api.create({ name: 'Nine', seats: 9, prizes: [], creator: players(1)[0]! });
  assert.equal(created.state, 'open');
  assert.equal(created.seats, 9);
});

/* ------------------------------------------------------------------ results */

test('a result from a real pairing is recorded and shows in the standings', async () => {
  const { api, id } = await fullOf(4);
  const view = api.view(id);
  const first = view.pairings[0]!;

  const after = report(api, id, first, 1);
  const winner = after.standings.find((standing) => standing.address === first.white)!;
  assert.equal(winner.score, 1);
});

test('⭐ a game against somebody you were never paired with is refused', async () => {
  // Without this a player could report a win over anybody, including a game that never happened, and
  // the standings would count it.
  //
  // Two cases, and the first version of this test only had the fragile one: a real pair reported in
  // the *wrong round* — they are paired, just not then — and somebody who is not in the tournament
  // at all. The first is derived from the pairings rather than assumed, because where the draw put
  // any given pair is not something a test gets to decide.
  const { api, id, field } = await fullOf(4);
  const view = api.view(id);
  const first = view.pairings[0]!;
  const elsewhere = view.pairings.find((pairing) => pairing.round !== first.round)!;

  assert.throws(
    () => api.record(id, signedGame(elsewhere.white, elsewhere.black, 1, first.round)),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'not-paired',
    'a real pair reported in the wrong round must be refused',
  );

  const stranger = players(9)[8]!;
  assert.throws(
    () => api.record(id, signedGame(field[0]!, stranger, 1, first.round)),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'not-paired',
    'a game against somebody outside the tournament must be refused',
  );
});

test('⭐ the same game cannot be reported twice with a better result', async () => {
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  report(api, id, first, 0);

  assert.throws(
    () => report(api, id, first, 1),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'already-recorded',
  );
});

test('and not with the colours swapped either', async () => {
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  report(api, id, first, 0);

  assert.throws(
    () => api.record(id, signedGame(first.black, first.white, 1, first.round)),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'already-recorded',
  );
});

/* ------------------------------------------------------------------ the signature itself */

test('⭐ a result nobody signed is refused', async () => {
  // The hole this closes: `/t/<id>` publishes the pairings, so anybody could read them and post a
  // win for a game they were not in. There is now no way to state a result at all.
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  const game = signedGame(first.white, first.black, 1, first.round);

  assert.throws(
    () =>
      api.record(id, {
        ...game,
        signatures: {
          white: { publicKeyHex: '00'.repeat(32), signatureHex: '00'.repeat(64) },
          black: { publicKeyHex: '00'.repeat(32), signatureHex: '00'.repeat(64) },
        },
      }),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'unsigned-result',
  );
});

test('⭐ a result signed by the wrong person is refused', async () => {
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  const outsider = keyFor(20);
  const game = signedGame(first.white, first.black, 1, first.round);

  assert.throws(
    () =>
      api.record(id, {
        ...game,
        signatures: { ...game.signatures, black: signWith(outsider, game.scoresheet) },
      }),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'unsigned-result',
    'a signature from somebody who is not the black player must not count as black agreeing',
  );
});

test('⭐ only one side signing is not enough', async () => {
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  const game = signedGame(first.white, first.black, 1, first.round);

  assert.throws(
    () =>
      api.record(id, {
        ...game,
        signatures: { ...game.signatures, black: signWith(keyOf(first.white), game.scoresheet) },
      }),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'unsigned-result',
    'the loser agreeing is the whole point; white signing twice is not a result',
  );
});

test('⭐ a game played before the tournament existed cannot be reported into it', async () => {
  /*
   * The replay this closes.
   *
   * Every other check passes for this game: two real signatures, the two people the draw actually
   * paired, a round that exists, and no result recorded yet. It is simply a game they played *before
   * this tournament was created* — so a pair who have ever played each other could enter any future
   * tournament and report a finished result the moment the draw came out, without playing.
   *
   * The block height is inside the signed text, so this costs nothing to check and cannot be forged
   * without breaking the signatures.
   */
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;

  assert.throws(
    () => api.record(id, signedGame(first.white, first.black, 1, first.round, 4_000_000)),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'game-too-old',
  );

  // And the standings did not move.
  assert.equal(
    api.view(id).standings.reduce((sum, standing) => sum + standing.score, 0),
    0,
  );
});

test('⭐ a game played on another network cannot be reported here', async () => {
  /*
   * The bypass this closes, and why it is not merely tidiness.
   *
   * The signatures on a testnet scoresheet are made with the same key and verify perfectly, so
   * without pinning the chain this is a valid result. Worse, it carries a **testnet block height**,
   * which would walk straight through the "played after this tournament started" check above —
   * heights on two chains have nothing to say to one another. Closing the first hole opened this one.
   */
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;

  assert.throws(
    () => api.record(id, signedGame(first.white, first.black, 1, first.round, 9_999_999, 'test')),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'wrong-chain',
  );
  assert.equal(api.view(id).standings.reduce((sum, standing) => sum + standing.score, 0), 0);
});

test('a game played after it started is fine, which is the ordinary case', async () => {
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  const after = api.record(id, signedGame(first.white, first.black, 1, first.round, 4_200_000));
  assert.equal(after.standings.find((standing) => standing.address === first.white)!.score, 1);
});

test('⭐ the score comes from the signed game, and cannot be overridden', async () => {
  // A caller has no field to put a score in any more. This asserts the consequence: the standings
  // move according to the sheet the two of them signed, whatever anybody wanted.
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  const after = api.record(id, signedGame(first.white, first.black, 0, first.round));

  const loser = after.standings.find((standing) => standing.address === first.white)!;
  const winner = after.standings.find((standing) => standing.address === first.black)!;
  assert.equal(loser.score, 0);
  assert.equal(winner.score, 1);
});

test('⭐ and the signed game itself is kept, so a stranger can check the table', async () => {
  const { api, id } = await fullOf(4);
  const first = api.view(id).pairings[0]!;
  report(api, id, first, 1);

  const view = api.view(id);
  assert.equal(view.games.length, 1);
  assert.ok(view.games[0]!.text.includes(first.white), 'the evidence names the players');
  assert.ok(view.games[0]!.white.signatureHex.length > 0);
  assert.ok(view.games[0]!.black.signatureHex.length > 0);
});

test('results cannot be reported before the draw exists', async () => {
  const api = server();
  const field = players(4);
  const created = await api.create({ name: 'Friday', seats: 4, prizes: [], creator: field[0]! });
  assert.throws(
    () => api.record(created.id, signedGame(field[0]!, field[1]!, 1, 0)),
    (error: unknown) => error instanceof TournamentServerError && error.code === 'not-started',
  );
});

test('⭐ the tournament finishes exactly when every paired game has a result', async () => {
  const { api, id } = await fullOf(4);
  const pairings = api.view(id).pairings;

  for (const [index, pairing] of pairings.entries()) {
    const view = report(api, id, pairing, 1);
    const last = index === pairings.length - 1;
    assert.equal(view.state, last ? 'finished' : 'running', `after game ${index + 1}`);
  }
});

test('the standings are recomputed from the results, never stored', async () => {
  const { api, id } = await fullOf(4);
  const before = api.view(id).standings.reduce((sum, standing) => sum + standing.score, 0);
  assert.equal(before, 0);

  const first = api.view(id).pairings[0]!;
  report(api, id, first, 0.5);
  const after = api.view(id).standings.reduce((sum, standing) => sum + standing.score, 0);
  assert.equal(after, 1);
});

test('asking for a tournament that does not exist says so, rather than inventing one', () => {
  const api = server();
  assert.throws(
    () => api.view('nope'),
    (error: unknown) => error instanceof TournamentServerError && error.status === 404,
  );
});

test('the list is newest first and every entry carries its standings', async () => {
  const api = server();
  const field = players(2);
  await api.create({ name: 'One', seats: 2, prizes: [], creator: field[0]! });
  await api.create({ name: 'Two', seats: 2, prizes: [], creator: field[0]! });
  const list = api.list();
  assert.equal(list.length, 2);
  for (const entry of list) assert.ok(Array.isArray(entry.standings));
});

/* ------------------------------------------------------------------ Swiss, for the larger fields */

test('\u2b50 a field above eight is paired by Swiss, one round at a time', async () => {
  // A round-robin for twelve is eleven rounds and nobody finishes. Swiss pairs the round about to be
  // played, because who you meet depends on how you have done \u2014 so only the first round exists at
  // the draw, and each later one appears when the one before it is complete.
  const { api, id } = await fullOf(12);
  const view = api.view(id);

  assert.equal(view.state, 'running');
  assert.equal(view.pairings.length, 6, 'twelve players is six boards in round one');
  assert.ok(view.pairings.every((pairing) => pairing.round === 0), 'only the first round is paired');
});

test('\u2b50 a whole Swiss tournament plays out, and never repeats a pairing', async () => {
  const { api, id } = await fullOf(12);
  const met = new Map<string, Set<string>>();
  let played = 0;

  for (let guard = 0; guard < 20; guard += 1) {
    const view = api.view(id);
    if (view.state === 'finished') break;

    const outstanding = view.pairings.filter(
      (pairing) =>
        !view.results.some(
          (result) =>
            result.round === pairing.round &&
            ((result.white === pairing.white && result.black === pairing.black) ||
              (result.white === pairing.black && result.black === pairing.white)),
        ),
    );
    assert.ok(outstanding.length > 0, 'a running tournament must have games left to play');

    for (const pairing of outstanding) {
      const already = met.get(pairing.white);
      assert.ok(
        !already?.has(pairing.black),
        `${pairing.white} was paired with ${pairing.black} twice`,
      );
      if (!met.has(pairing.white)) met.set(pairing.white, new Set());
      if (!met.has(pairing.black)) met.set(pairing.black, new Set());
      met.get(pairing.white)!.add(pairing.black);
      met.get(pairing.black)!.add(pairing.white);

      // Alternating results, so the score groups actually separate rather than everybody drawing.
      report(api, id, pairing, played % 3 === 0 ? 0.5 : played % 2 === 0 ? 1 : 0);
      played += 1;
    }
  }

  const finished = api.view(id);
  assert.equal(finished.state, 'finished');
  // ceil(log2(12)) + 1 = 5 rounds, six boards each.
  assert.equal(finished.results.length, 30, `played ${finished.results.length} games`);
  assert.equal(new Set(finished.pairings.map((p) => p.round)).size, 5);
});

test('the standings of a Swiss tournament add up to the games played', async () => {
  const { api, id } = await fullOf(12);
  let played = 0;

  for (let guard = 0; guard < 20; guard += 1) {
    const view = api.view(id);
    if (view.state === 'finished') break;
    for (const pairing of view.pairings.filter((p) => !view.results.some((r) => r.round === p.round && r.white === p.white))) {
      report(api, id, pairing, played % 2 === 0 ? 1 : 0);
      played += 1;
    }
  }

  const finished = api.view(id);
  const total = finished.standings.reduce((sum, standing) => sum + standing.score, 0);
  assert.equal(total, finished.results.length, 'one point is awarded per game, however it ended');
});

test('a field larger than Swiss will pair is still refused', async () => {
  const api = server();
  await assert.rejects(
    () => api.create({ name: 'Huge', seats: 17, prizes: [], creator: players(1)[0]! }),
    TournamentServerError,
  );
});
