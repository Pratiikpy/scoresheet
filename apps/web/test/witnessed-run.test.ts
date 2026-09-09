/**
 * The witnessed run, driven the way the puzzle screen drives it.
 *
 * One property matters more than everything else here and it is the reason the file exists: **while
 * a run is open, the puzzles come from the witness, in the order it served them.** A rating earned
 * alone is worth something only because the solver did not choose what to solve, and that guarantee
 * is exactly the kind that stops holding quietly when somebody adds a skip button a year from now.
 *
 * The network is stubbed rather than mocked at the module boundary, so what is exercised is the real
 * request the real client sends — including the shape of the body, which is what the server's
 * defences read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalisePuzzleCard, hashAttempts, type Puzzle, type PuzzleCard } from '@scoresheet/core';

const SOLVER = 'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9';
const WITNESS = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';

const PUZZLES: Puzzle[] = [
  { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1b1', 'h1g1'], rating: 900, themes: ['endgame'] },
  { fen: '8/8/8/8/8/8/8/K6k b - - 0 1', moves: ['h1g1', 'a1b1'], rating: 1200, themes: ['fork'] },
  { fen: '8/8/8/8/8/8/1P6/K6k w - - 0 1', moves: ['b2b4', 'h1g1'], rating: 1500, themes: ['pin'] },
];
const idOf = (puzzle: Puzzle): string => `${puzzle.fen}|${puzzle.moves.join(' ')}`;
const byId = new Map(PUZZLES.map((puzzle) => [idOf(puzzle), puzzle]));

/** Every request the client made, so a test can assert on what actually went to the server. */
interface Recorded {
  path: string;
  body: Record<string, unknown> | null;
}

function stubNetwork(options: {
  available?: boolean;
  serve?: Puzzle[];
  finishStatus?: number;
  finishBody?: unknown;
}): Recorded[] {
  const seen: Recorded[] = [];
  const serve = options.serve ?? PUZZLES.slice(0, 2);

  const reply = (status: number, body: unknown) =>
    ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: RequestInit) => {
    const path = String(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    seen.push({ path, body });

    if (path.endsWith('/api/puzzles/witness')) {
      return reply(200, options.available === false ? { available: false } : { available: true, address: WITNESS });
    }
    if (path.endsWith('/api/puzzles/session')) {
      return reply(200, {
        sessionId: 'a'.repeat(32),
        startedAtBlock: 4_200_000,
        puzzles: serve.map((puzzle) => ({ id: idOf(puzzle), rating: puzzle.rating })),
      });
    }
    if (path.endsWith('/api/puzzles/finish')) {
      if (options.finishStatus && options.finishStatus >= 400) {
        return reply(options.finishStatus, options.finishBody ?? { error: { message: 'Those are not the puzzles.' } });
      }
      const results = (body?.['results'] ?? []) as { id: string; solved: boolean }[];
      const attempts = results.map((result) => ({
        id: result.id,
        rating: byId.get(result.id)?.rating ?? 0,
        solved: result.solved,
      }));
      const card: PuzzleCard = {
        chain: 'main',
        sessionId: 'a'.repeat(32),
        solver: SOLVER,
        witness: WITNESS,
        mode: 'training',
        attempted: attempts.length,
        solved: attempts.filter((attempt) => attempt.solved).length,
        ratingBefore: 1200,
        ratingAfter: 1240,
        startedAtBlock: 4_200_000,
        endedAtBlock: 4_200_010,
        resultsHash: hashAttempts(attempts),
      };
      return reply(200, {
        card,
        canonical: canonicalisePuzzleCard(card),
        attempts,
        signature: { publicKeyHex: 'e'.repeat(64), signatureHex: 'f'.repeat(128) },
      });
    }
    return reply(404, { error: { message: 'no' } });
  };

  // Storage, so the card store can read and write without a browser.
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, next: string) => store.set(key, next),
    removeItem: (key: string) => store.delete(key),
  };
  (globalThis as { window?: unknown; localStorage?: unknown }).window = { localStorage };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;

  return seen;
}

type RunOptions = Parameters<typeof import('../src/witnessed-run.ts').createWitnessedRun>[0];

async function runOf(overrides: Partial<RunOptions> = {}) {
  const { createWitnessedRun } = await import('../src/witnessed-run.ts');
  // A clock that always advances, so every answer looks like a human took a few seconds over it.
  let clock = 1_000_000;
  return createWitnessedRun({
    address: SOLVER,
    mode: 'training',
    count: 2,
    byId,
    now: () => (clock += 3_000),
    ...overrides,
  });
}

/* ------------------------------------------------------------------ the rule */

test('while a run is open, the puzzles are the ones the witness served, in order', async () => {
  stubNetwork({ serve: [PUZZLES[2]!, PUZZLES[0]!] });
  const run = await runOf();
  assert.equal(await run.begin(), true);

  // The witness served the 1500 first and the 900 second. A screen choosing for itself would have
  // taken the easiest — which is precisely why it does not get to choose.
  assert.equal(run.next(), PUZZLES[2]);
  run.record(true);
  assert.equal(run.next(), PUZZLES[0]);
  run.record(false);
  assert.equal(run.next(), null);
});

test('and the results sent back are those puzzles, in that order', async () => {
  const seen = stubNetwork({ serve: [PUZZLES[2]!, PUZZLES[0]!] });
  const run = await runOf();
  await run.begin();
  run.next();
  run.record(true);
  run.next();
  run.record(false);
  await run.settle();

  const finish = seen.find((request) => request.path.endsWith('/api/puzzles/finish'));
  const results = finish?.body?.['results'] as { id: string; solved: boolean }[];
  assert.deepEqual(
    results.map((result) => result.id),
    [idOf(PUZZLES[2]!), idOf(PUZZLES[0]!)],
  );
  assert.deepEqual(
    results.map((result) => result.solved),
    [true, false],
  );
});

/* ------------------------------------------------------------------ when there is no witness */

test('no wallet means no run, and no request is made at all', async () => {
  const seen = stubNetwork({});
  const run = await runOf({ address: null });
  assert.equal(await run.begin(), false);
  assert.equal(seen.length, 0);
  assert.equal(run.open, false);
});

test('a server that does not witness means an unrated run, not an error', async () => {
  stubNetwork({ available: false });
  const run = await runOf();
  assert.equal(await run.begin(), false);
  assert.equal(run.open, false);
  assert.equal(run.next(), null);
});

test('a served puzzle this client does not have abandons the run rather than half-playing it', async () => {
  stubNetwork({ serve: PUZZLES.slice(0, 2) });
  const run = await runOf({ byId: new Map() });
  assert.equal(await run.begin(), false);
});

/* ------------------------------------------------------------------ counting */

test('remaining, answered and solved follow the run', async () => {
  stubNetwork({});
  const run = await runOf();
  await run.begin();
  assert.equal(run.remaining, 2);

  run.next();
  run.record(true);
  assert.equal(run.answered, 1);
  assert.equal(run.solved, 1);
  assert.equal(run.remaining, 1);

  run.next();
  run.record(false);
  assert.equal(run.answered, 2);
  assert.equal(run.solved, 1);
  assert.equal(run.remaining, 0);
});

test('recording more results than were served changes nothing', async () => {
  stubNetwork({});
  const run = await runOf();
  await run.begin();
  run.next();
  run.record(true);
  run.next();
  run.record(true);
  run.record(true);
  run.record(true);
  assert.equal(run.answered, 2);
});

test('each result carries how long it took, which is what the plausibility floor reads', async () => {
  const seen = stubNetwork({});
  const run = await runOf();
  await run.begin();
  run.next();
  run.record(true);
  run.next();
  run.record(true);
  await run.settle();

  const finish = seen.find((request) => request.path.endsWith('/api/puzzles/finish'));
  const results = finish?.body?.['results'] as { ms: number }[];
  for (const result of results) assert.ok(result.ms > 0, `${result.ms}`);
});

/* ------------------------------------------------------------------ settling */

test('settling with nothing answered does nothing', async () => {
  const seen = stubNetwork({});
  const run = await runOf();
  await run.begin();
  assert.equal(await run.settle(), null);
  assert.ok(!seen.some((request) => request.path.endsWith('/api/puzzles/finish')));
});

test('a run settles once — a second attempt is not sent and does not read as a failure', async () => {
  const seen = stubNetwork({});
  const run = await runOf();
  await run.begin();
  run.next();
  run.record(true);

  await run.settle();
  assert.equal(await run.settle(), null);
  assert.equal(seen.filter((request) => request.path.endsWith('/api/puzzles/finish')).length, 1);
});

test("a witness refusal comes back as the server's own sentence", async () => {
  stubNetwork({ finishStatus: 400, finishBody: { error: { message: 'Those are not the puzzles that were served.' } } });
  const run = await runOf();
  await run.begin();
  run.next();
  run.record(true);

  const outcome = await run.settle();
  assert.equal(outcome?.ok, false);
  assert.match((outcome as { message: string }).message, /not the puzzles/);
});

test('the run reports the rating it started from, so a screen can show the change', async () => {
  stubNetwork({});
  const run = await runOf();
  await run.begin();
  const { PUZZLE_START } = await import('@scoresheet/core');
  assert.equal(run.ratingBefore, PUZZLE_START);
});

test('the request names the mode, the count and the rating it claims to start from', async () => {
  const seen = stubNetwork({});
  const run = await runOf({ mode: 'themed', count: 2, theme: 'fork' });
  await run.begin();

  const started = seen.find((request) => request.path.endsWith('/api/puzzles/session'));
  assert.equal(started?.body?.['mode'], 'themed');
  assert.equal(started?.body?.['count'], 2);
  assert.equal(started?.body?.['theme'], 'fork');
  assert.equal(typeof started?.body?.['ratingBefore'], 'number');
});
