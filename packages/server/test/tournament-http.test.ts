/**
 * Tournaments at the HTTP boundary.
 *
 * `tournaments.test.ts` proves the module. This proves the *wire*, and the two are not the same
 * thing: the last bug of this exact class in this repository was a number arriving as a JSON number
 * where the reader only understood strings, so a correct module was refused a request nobody had
 * sent wrongly. That was found here rather than a layer down, which is the argument for this file.
 *
 * Everything goes through `handleRequest` exactly as a browser reaches it — a method, a path, a
 * parsed body — so a route that exists in the module and not in the router fails here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair } from '@nimiq/core';
import { canonicaliseScoresheet, normaliseAddress, type Scoresheet } from '@scoresheet/core';
import { nimiqSignedMessageDigest } from '@scoresheet/verify';
import { handleRequest } from '../src/http.ts';
import { createLive } from '../src/live.ts';
import { createMemoryStore as createGameStore } from '../src/store.ts';
import { createMemoryStore, createTournaments, type Tournaments } from '../src/tournaments.ts';

/*
 * Real keys here too, for the same reason as in `tournaments.test.ts`: a result on the wire is a
 * signed game now, so a test that posts one has to be able to sign it. Anything less would be
 * checking that the route exists rather than that it works.
 */
const pairs: KeyPair[] = [];
const addressOf = (pair: KeyPair): string => pair.publicKey.toAddress().toUserFriendlyAddress();

function players(n: number): string[] {
  while (pairs.length < n) pairs.push(KeyPair.generate());
  return pairs.slice(0, n).map(addressOf);
}

function keyOf(address: string): KeyPair {
  const wanted = normaliseAddress(address);
  const found = pairs.find((pair) => normaliseAddress(addressOf(pair)) === wanted);
  if (!found) throw new Error(`no key for ${address}`);
  return found;
}

const encoder = new TextEncoder();
let nextGame = 0;

/** The body a browser posts to report a tournament result: a game, and both signatures on it. */
function resultBody(round: number, white: string, black: string, whiteScore: 0 | 0.5 | 1) {
  nextGame += 1;
  const sheet: Scoresheet = {
    chain: 'main',
    gameId: nextGame.toString(16).padStart(32, '0'),
    white,
    black,
    result: whiteScore === 1 ? '1-0' : whiteScore === 0 ? '0-1' : '1/2-1/2',
    termination: 'checkmate',
    moveCount: 34,
    finalFen: '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 41',
    endedAtBlock: 4_100_000 + nextGame,
    movesHash: 'AAAA',
    rated: true,
  };
  const text = canonicaliseScoresheet(sheet);
  const sign = (pair: KeyPair) => ({
    publicKeyHex: pair.publicKey.toHex(),
    signatureHex: pair.sign(nimiqSignedMessageDigest(encoder.encode(text))).toHex(),
  });
  return {
    round,
    scoresheet: text,
    signatures: { white: sign(keyOf(white)), black: sign(keyOf(black)) },
  };
}

function setup(): { live: ReturnType<typeof createLive>; tournaments: Tournaments } {
  let id = 0;
  return {
    live: createLive({
      store: createGameStore(),
      now: () => 1_700_000_000_000,
      newId: () => 'a'.repeat(32),
      blockHeight: async () => 4_100_000,
    }),
    tournaments: createTournaments({
      store: createMemoryStore(),
      blockHeight: async () => 4_100_000,
      newId: () => `t${(id += 1)}`,
    }),
  };
}

async function call(
  parts: { live: ReturnType<typeof createLive>; tournaments: Tournaments },
  method: string,
  path: string,
  body: unknown = null,
) {
  return handleRequest(parts.live, { method, path, query: {}, body }, undefined, undefined, undefined, parts.tournaments);
}

test('a tournament can be created over the wire', async () => {
  const parts = setup();
  const response = await call(parts, 'POST', '/api/tournaments', {
    address: players(1)[0],
    name: 'Friday night',
    seats: 4,
    prizes: [1000, 500],
  });
  assert.equal(response.status, 200);
  const view = response.body as { id: string; state: string; entrants: string[] };
  assert.equal(view.state, 'open');
  assert.equal(view.entrants.length, 1);
});

test('⭐ seats arrive as a JSON number and are read as one', async () => {
  // The bug this file exists for, in its exact previous shape: a numeric field read by a string-only
  // reader becomes `null`, then `0`, and the request is refused over a value the caller sent
  // correctly. `count` accepts both forms; this proves the route uses it.
  const parts = setup();
  const asNumber = await call(parts, 'POST', '/api/tournaments', { address: players(1)[0], name: 'A', seats: 6 });
  assert.equal(asNumber.status, 200);
  assert.equal((asNumber.body as { seats: number }).seats, 6);

  const asString = await call(parts, 'POST', '/api/tournaments', { address: players(1)[0], name: 'B', seats: '6' });
  assert.equal(asString.status, 200);
  assert.equal((asString.body as { seats: number }).seats, 6);
});

test('a bad address is refused with a reason, not a 500', async () => {
  const parts = setup();
  const response = await call(parts, 'POST', '/api/tournaments', { address: 'nonsense', name: 'A', seats: 4 });
  assert.equal(response.status, 400);
  assert.equal((response.body as { error: { code: string } }).error.code, 'bad-address');
});

test('⭐ a module refusal reaches the client as its own reason, never as a 500', async () => {
  const parts = setup();
  const response = await call(parts, 'POST', '/api/tournaments', { address: players(1)[0], name: 'Huge', seats: 99 });
  assert.equal(response.status, 400);
  assert.equal((response.body as { error: { code: string } }).error.code, 'bad-seats');
});

test('joining, then playing, then reading it back', async () => {
  const parts = setup();
  const field = players(4);
  const created = await call(parts, 'POST', '/api/tournaments', {
    address: field[0],
    name: 'Friday',
    seats: 4,
    prizes: [1000, 500],
  });
  const id = (created.body as { id: string }).id;

  for (const player of field.slice(1)) {
    const joined = await call(parts, 'POST', `/api/tournaments/${id}/join`, { address: player });
    assert.equal(joined.status, 200);
  }

  const running = await call(parts, 'GET', `/api/tournaments/${id}`);
  const view = running.body as { state: string; pairings: { round: number; white: string; black: string }[] };
  assert.equal(view.state, 'running');
  assert.equal(view.pairings.length, 6);

  const first = view.pairings[0]!;
  const reported = await call(
    parts,
    'POST',
    `/api/tournaments/${id}/result`,
    resultBody(first.round, first.white, first.black, 1),
  );
  assert.equal(reported.status, 200, JSON.stringify(reported.body));
  const after = reported.body as { standings: { address: string; score: number }[] };
  assert.equal(after.standings.find((s) => s.address === first.white)!.score, 1);
});

test('⭐ a draw reported as 0.5 survives the wire', async () => {
  // `count` only accepts integers from strings, and a draw is the one score that is not an integer.
  // A route that read it with the integer-only path would turn every draw into a refusal.
  const parts = setup();
  const field = players(4);
  const created = await call(parts, 'POST', '/api/tournaments', { address: field[0], name: 'F', seats: 4 });
  const id = (created.body as { id: string }).id;
  for (const player of field.slice(1)) await call(parts, 'POST', `/api/tournaments/${id}/join`, { address: player });

  const view = (await call(parts, 'GET', `/api/tournaments/${id}`)).body as {
    pairings: { round: number; white: string; black: string }[];
  };
  const first = view.pairings[0]!;

  const reported = await call(
    parts,
    'POST',
    `/api/tournaments/${id}/result`,
    resultBody(first.round, first.white, first.black, 0.5),
  );
  assert.equal(reported.status, 200, JSON.stringify(reported.body));
  const after = reported.body as { standings: { address: string; score: number }[] };
  assert.equal(after.standings.find((s) => s.address === first.white)!.score, 0.5);
});

test('⭐ a result for a game that was never paired is refused with its own code', async () => {
  const parts = setup();
  const field = players(4);
  const created = await call(parts, 'POST', '/api/tournaments', { address: field[0], name: 'F', seats: 4 });
  const id = (created.body as { id: string }).id;
  for (const player of field.slice(1)) await call(parts, 'POST', `/api/tournaments/${id}/join`, { address: player });

  const response = await call(
    parts,
    'POST',
    `/api/tournaments/${id}/result`,
    resultBody(0, field[0]!, players(9)[8]!, 1),
  );
  assert.equal(response.status, 409, JSON.stringify(response.body));
  assert.equal((response.body as { error: { code: string } }).error.code, 'not-paired');
});

test('⭐ a result nobody signed is refused at the wire, not just in the module', async () => {
  // The shape a reporter would have posted before this was fixed: two names and a score, no game.
  // It has to be refused by the route as well as by the module, because the route is the only thing
  // the internet can reach.
  const parts = setup();
  const field = players(4);
  const created = await call(parts, 'POST', '/api/tournaments', { address: field[0], name: 'F', seats: 4 });
  const id = (created.body as { id: string }).id;
  for (const player of field.slice(1)) await call(parts, 'POST', `/api/tournaments/${id}/join`, { address: player });

  const view = (await call(parts, 'GET', `/api/tournaments/${id}`)).body as {
    pairings: { round: number; white: string; black: string }[];
  };
  const first = view.pairings[0]!;

  const bare = await call(parts, 'POST', `/api/tournaments/${id}/result`, {
    round: first.round,
    white: first.white,
    black: first.black,
    whiteScore: 1,
  });
  assert.equal(bare.status, 400, JSON.stringify(bare.body));
  assert.equal((bare.body as { error: { code: string } }).error.code, 'bad-result');

  // And a real game with signatures that are not the players' own.
  const forged = resultBody(first.round, first.white, first.black, 1);
  forged.signatures.black = { publicKeyHex: '00'.repeat(32), signatureHex: '00'.repeat(64) };
  const refused = await call(parts, 'POST', `/api/tournaments/${id}/result`, forged);
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal((refused.body as { error: { code: string } }).error.code, 'unsigned-result');

  // Nothing reached the standings either way.
  const after = (await call(parts, 'GET', `/api/tournaments/${id}`)).body as {
    standings: { score: number }[];
  };
  assert.equal(after.standings.reduce((sum, standing) => sum + standing.score, 0), 0);
});

test('an unknown tournament is a 404 with a sentence, not a crash', async () => {
  const parts = setup();
  const response = await call(parts, 'GET', '/api/tournaments/nope');
  assert.equal(response.status, 404);
  assert.match((response.body as { error: { message: string } }).error.message, /no tournament/i);
});

test('the list comes back, and is empty before anything is created', async () => {
  const parts = setup();
  const response = await call(parts, 'GET', '/api/tournaments');
  assert.equal(response.status, 200);
  assert.deepEqual((response.body as { tournaments: unknown[] }).tournaments, []);
});

test('a host without tournaments answers the ordinary way rather than pretending', async () => {
  const live = createLive({
      store: createGameStore(),
      now: () => 1_700_000_000_000,
      newId: () => 'a'.repeat(32),
      blockHeight: async () => 4_100_000,
    });
  const response = await handleRequest(live, { method: 'GET', path: '/api/tournaments', query: {}, body: null });
  // No tournaments service means the route does not exist here, which is a 404 rather than a 500.
  assert.equal(response.status, 404);
});
