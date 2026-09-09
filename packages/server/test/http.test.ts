/**
 * The HTTP surface, including what it does with input written by somebody hostile.
 *
 * The router is a pure function, so this needs no socket — which means every one of these runs in
 * milliseconds and there is no excuse for not having them. What is checked here is mostly the
 * unhappy half: bad addresses, bad ids, oversized moves, wrong shapes, and the polling reply that
 * makes the whole design affordable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLive, createMemoryStore, handleRequest, type Live } from '../src/index.ts';
import { createMemorySessions, createWitness } from '../src/witness.ts';
import { PUZZLE_CARD_VERSION, type Puzzle } from '@scoresheet/core';

const WHITE = 'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9';
const BLACK = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';

function harness(): { live: Live; call: typeof send } {
  let issued = 0;
  const live = createLive({
    store: createMemoryStore(),
    now: () => 1_000_000,
    newId: () => (++issued).toString(16).padStart(32, '0'),
    blockHeight: async () => 4_200_000,
  });

  function send(method: string, path: string, body?: unknown, query: Record<string, string> = {}) {
    return handleRequest(live, { method, path, query, body: body ?? null });
  }
  return { live, call: send };
}

async function newGame(call: ReturnType<typeof harness>['call']): Promise<string> {
  const created = await call('POST', '/api/game', { address: WHITE, colour: 'w', timeControl: 'blitz' });
  return (created.body as { id: string }).id;
}

/* ------------------------------------------------------------------ the happy path */

test('a game can be made, joined, played and finished over HTTP', async () => {
  const { call } = harness();
  const id = await newGame(call);
  assert.equal((await call('POST', `/api/game/${id}/join`, { address: BLACK })).status, 200);
  assert.equal((await call('POST', `/api/game/${id}/move`, { address: WHITE, san: 'e4' })).status, 200);

  const resigned = await call('POST', `/api/game/${id}/resign`, { address: BLACK });
  assert.equal(resigned.status, 200);
  assert.equal((resigned.body as { result: string }).result, '1-0');
});

test('⭐ a poll with the version it already has gets eighty bytes, not a game', async () => {
  /*
   * The reason polling is affordable at all (`SPEC.md` I1). At 500 ms a poll, sending the whole game
   * every time is the difference between a background tab costing nothing and costing a megabyte an
   * hour — on a phone, on mobile data.
   */
  const { call } = harness();
  const id = await newGame(call);
  const full = await call('GET', `/api/game/${id}`);
  const version = (full.body as { version: number }).version;

  const nothing = await call('GET', `/api/game/${id}`, null, { since: String(version) });
  assert.deepEqual(nothing.body, { version, unchanged: true });
  assert.ok(JSON.stringify(nothing.body).length < 80);

  // And a stale version gets the whole thing.
  const stale = await call('GET', `/api/game/${id}`, null, { since: String(version - 1) });
  assert.equal((stale.body as { id: string }).id, id);
});

/* ------------------------------------------------------------------ hostile input */

test('⭐ an address that is not a Nimiq address is refused', async () => {
  const { call } = harness();
  for (const bad of [
    '',
    'hello',
    'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q',
    'NQAB46VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9',
    // I, O, W and Z are not in Nimiq's alphabet, so an address carrying one is not one.
    'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAKIQ9',
    '<script>alert(1)</script>',
  ]) {
    const response = await call('POST', '/api/game', { address: bad });
    assert.equal(response.status, 400, `accepted ${JSON.stringify(bad)}`);
  }
});

test('an address with spaces in it is accepted, because that is how people paste one', async () => {
  const { call } = harness();
  const spaced = WHITE.replace(/(.{4})/g, '$1 ').trim();
  const response = await call('POST', '/api/game', { address: spaced });
  assert.equal(response.status, 200);
  // Whichever seat, because the default colour is random — asserting `white` failed the first time
  // for that reason alone, with the address stored perfectly in the other seat.
  const game = response.body as { white: string | null; black: string | null };
  assert.equal(game.white ?? game.black, WHITE, 'and it is stored tight, without the spaces');
});

test('a game id that is not 32 hex never reaches the store', async () => {
  const { call } = harness();
  for (const bad of ['../../etc/passwd', 'abc', 'g'.repeat(32), '%2e%2e%2f']) {
    const response = await call('GET', `/api/game/${bad}`);
    assert.equal(response.status, 404, `routed ${bad}`);
  }
});

test('an absurdly long move is refused rather than parsed', async () => {
  const { call } = harness();
  const id = await newGame(call);
  await call('POST', `/api/game/${id}/join`, { address: BLACK });
  const response = await call('POST', `/api/game/${id}/move`, { address: WHITE, san: 'e4'.repeat(500) });
  assert.equal(response.status, 422);
});

test('a body that is not an object is refused, not crashed on', async () => {
  const { call } = harness();
  for (const body of [null, 'a string', 42, [], { address: 12 }]) {
    const response = await call('POST', '/api/game', body);
    assert.equal(response.status, 400);
  }
});

test('an unknown time control or colour is named as such', async () => {
  const { call } = harness();
  assert.equal((await call('POST', '/api/game', { address: WHITE, timeControl: 'forever' })).status, 400);
  assert.equal((await call('POST', '/api/game', { address: WHITE, colour: 'green' })).status, 400);
});

test('⭐ a signature of the wrong shape is refused before it is stored', async () => {
  // The server does not verify signatures — that is the reader's job — but storing something that
  // cannot possibly be one would put a permanent lie in the game record.
  const { call } = harness();
  const id = await newGame(call);
  await call('POST', `/api/game/${id}/join`, { address: BLACK });
  await call('POST', `/api/game/${id}/resign`, { address: BLACK });

  for (const signature of [
    {},
    { publicKeyHex: 'aa', signatureHex: 'bb' },
    { publicKeyHex: 'zz'.repeat(32), signatureHex: 'bb'.repeat(64) },
    { publicKeyHex: 'aa'.repeat(32) },
  ]) {
    const response = await call('POST', `/api/game/${id}/sign`, { address: WHITE, ...signature });
    assert.equal(response.status, 400, `accepted ${JSON.stringify(signature)}`);
  }

  const good = await call('POST', `/api/game/${id}/sign`, {
    address: WHITE,
    publicKeyHex: 'aa'.repeat(32),
    signatureHex: 'bb'.repeat(64),
  });
  assert.equal(good.status, 200);
  assert.deepEqual((good.body as { signed: unknown }).signed, { white: true, black: false });
});

/* ------------------------------------------------------------------ errors */

test('every failure carries a code a client can branch on', async () => {
  const { call } = harness();
  const id = await newGame(call);
  const notStarted = await call('POST', `/api/game/${id}/move`, { address: WHITE, san: 'e4' });
  assert.equal(notStarted.status, 409);
  assert.equal((notStarted.body as { error: { code: string } }).error.code, 'not-started');
});

test('an unknown route is a 404 with a sentence, not an empty body', async () => {
  const { call } = harness();
  const response = await call('GET', '/api/nonsense');
  assert.equal(response.status, 404);
  assert.match((response.body as { error: { message: string } }).error.message, /No such/);
});

test('⭐ an unexpected failure never leaks a stack trace', async () => {
  /*
   * A stack in a response body is a security problem and useless to whoever reads it. The client
   * turns this into "something went wrong on our side, your game is safe" — which is true, because
   * the game is in the store and the next poll finds it.
   */
  const exploding = {
    view: async () => {
      throw new Error('BOOM at /secret/path/live.ts:42');
    },
  } as unknown as Live;

  const response = await handleRequest(exploding, {
    method: 'GET',
    path: `/api/game/${'a'.repeat(32)}`,
    query: {},
    body: null,
  });
  assert.equal(response.status, 500);
  const text = JSON.stringify(response.body);
  assert.doesNotMatch(text, /BOOM|live\.ts|secret/);
  assert.match(text, /your game is safe/i);
});

test('health says what time controls exist, so a client need not hardcode them', async () => {
  const { call } = harness();
  const response = await call('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual((response.body as { timeControls: string[] }).timeControls, [
    'bullet',
    'blitz',
    'rapid',
    'unlimited',
  ]);
});

/* ------------------------------------------------------------------ the puzzle witness */

/**
 * The witness endpoints, at the boundary rather than in the module.
 *
 * `witness.test.ts` already proves the rules. What this checks is the layer in front of them: that
 * a hostile body cannot reach the rules in a shape they were not written for, and that a server
 * with no witness key says so instead of pretending. A `TypeError` thrown inside a security check
 * is a security check that stopped running, so the shaping matters as much as the rule.
 */

const WITNESS_KEY = '3a1f0c7b5e9d2a486f13c05be7248d9a0b6e35f1c8427d09ae63b5041f7c8d2e';

const TEST_PUZZLES: Puzzle[] = [
  { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1b1', 'h1g1'], rating: 900, themes: ['endgame'] },
  { fen: '8/8/8/8/8/8/8/K6k b - - 0 1', moves: ['h1g1', 'a1b1'], rating: 1200, themes: ['fork'] },
];

function witnessed() {
  let issued = 0;
  const live = createLive({
    store: createMemoryStore(),
    now: () => 1_000_000,
    newId: () => (++issued).toString(16).padStart(32, '0'),
    blockHeight: async () => 4_200_000,
  });
  let sessions = 0;
  const witness = createWitness({
    privateKeyHex: WITNESS_KEY,
    chain: 'test',
    sessions: createMemorySessions(),
    blockHeight: async () => 4_200_000,
    newSessionId: () => `ff${(++sessions).toString(16).padStart(30, '0')}`,
    puzzles: async () => TEST_PUZZLES,
    random: () => 0,
  });

  function send(method: string, path: string, body?: unknown, query: Record<string, string> = {}) {
    return handleRequest(live, { method, path, query, body: body ?? null }, undefined, undefined, witness);
  }
  return { call: send, witness };
}

test('a server with no witness key says runs are not rated, rather than failing later', async () => {
  const { call } = harness();
  const status = await call('GET', '/api/puzzles/witness');
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { available: false });

  const started = await call('POST', '/api/puzzles/session', { address: WHITE, mode: 'training', count: 1, ratingBefore: 1200 });
  assert.equal(started.status, 503);
});

test('a witnessing server publishes the address its cards will name', async () => {
  const { call, witness } = witnessed();
  const status = await call('GET', '/api/puzzles/witness');
  assert.deepEqual(status.body, { available: true, address: witness.address });
});

test('a run is issued, finished, and comes back signed', async () => {
  const { call } = witnessed();
  const started = await call('POST', '/api/puzzles/session', {
    address: WHITE,
    mode: 'training',
    count: 2,
    ratingBefore: 1200,
  });
  assert.equal(started.status, 200);

  const issued = started.body as { sessionId: string; puzzles: { id: string }[] };
  const done = await call('POST', '/api/puzzles/finish', {
    sessionId: issued.sessionId,
    results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: 3000 })),
  });
  assert.equal(done.status, 200);

  const run = done.body as { canonical: string; signature: { signatureHex: string } };
  assert.ok(run.canonical.startsWith(PUZZLE_CARD_VERSION), run.canonical.slice(0, 40));
  assert.match(run.signature.signatureHex, /^[0-9a-f]{128}$/);
});

test('an unknown mode is a 400, never a silent default', async () => {
  const { call } = witnessed();
  const answer = await call('POST', '/api/puzzles/session', {
    address: WHITE,
    mode: 'wagered',
    count: 1,
    ratingBefore: 1200,
  });
  assert.equal(answer.status, 400);
  assert.equal((answer.body as { error: { code: string } }).error.code, 'bad-mode');
});

test('a bad address never reaches the witness', async () => {
  const { call } = witnessed();
  const answer = await call('POST', '/api/puzzles/session', { address: 'not an address', mode: 'training', count: 1, ratingBefore: 1200 });
  assert.equal(answer.status, 400);
});

test('a session id of the wrong shape is refused', async () => {
  const { call } = witnessed();
  const answer = await call('POST', '/api/puzzles/finish', { sessionId: '../../etc/passwd', results: [] });
  assert.equal(answer.status, 400);
  assert.equal((answer.body as { error: { code: string } }).error.code, 'bad-session');
});

test('results that are not an array are refused rather than crashing the check', async () => {
  const { call } = witnessed();
  const answer = await call('POST', '/api/puzzles/finish', { sessionId: 'f'.repeat(32), results: 'all of them' });
  assert.equal(answer.status, 400);
  assert.equal((answer.body as { error: { code: string } }).error.code, 'bad-results');
});

test('results carrying junk are shaped, not trusted — and the run is refused, not a 500', async () => {
  const { call } = witnessed();
  const started = await call('POST', '/api/puzzles/session', { address: WHITE, mode: 'training', count: 1, ratingBefore: 1200 });
  const issued = started.body as { sessionId: string };

  const answer = await call('POST', '/api/puzzles/finish', {
    sessionId: issued.sessionId,
    results: [{ id: { nested: 'object' }, solved: 'yes', ms: 'quick' }],
  });
  assert.equal(answer.status, 400);
  assert.notEqual(answer.status, 500);
});

test('a witness refusal reaches the caller as its own reason, not as a 500', async () => {
  const { call } = witnessed();
  const started = await call('POST', '/api/puzzles/session', { address: WHITE, mode: 'training', count: 1, ratingBefore: 1200 });
  const issued = started.body as { sessionId: string; puzzles: { id: string }[] };

  const answer = await call('POST', '/api/puzzles/finish', {
    sessionId: issued.sessionId,
    results: [{ id: 'a puzzle that was never served', solved: true, ms: 3000 }],
  });
  assert.equal(answer.status, 400);
  assert.equal((answer.body as { error: { code: string } }).error.code, 'not-served');
});

test('a seen list of the wrong type is ignored rather than refused', async () => {
  const { call } = witnessed();
  const answer = await call('POST', '/api/puzzles/session', {
    address: WHITE,
    mode: 'training',
    count: 1,
    ratingBefore: 1200,
    seen: 'everything',
  });
  assert.equal(answer.status, 200);
});
