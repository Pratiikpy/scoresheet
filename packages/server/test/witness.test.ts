/**
 * The witness, tested against the attacks it exists to stop.
 *
 * A happy-path test here would prove almost nothing. The witness has exactly one job — making a
 * solo puzzle rating mean something — and it fails at that job silently in four ways: if a client
 * can choose its own puzzles, if it can answer different ones from the ones served, if it can
 * reorder them, or if it can witness a run twice. Each of those turns the rating back into a number
 * somebody typed. So each of them has a test.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalisePuzzleCard,
  parsePuzzleCard,
  puzzleId,
  hashAttempts,
  nextPuzzleRating,
  type Puzzle,
} from '@scoresheet/core';
import { verifySignedText } from '@scoresheet/verify';

import {
  MAX_RUN,
  MIN_MS_PER_PUZZLE,
  SESSION_TTL_MS,
  WitnessError,
  createMemorySessions,
  createWitness,
  witnessAddress,
} from '../src/witness.ts';

const WITNESS_KEY = '3a1f0c7b5e9d2a486f13c05be7248d9a0b6e35f1c8427d09ae63b5041f7c8d2e';
const SOLVER = 'NQ84BAFBNAMP3U04TQMYQTMC3BQEPFL6PMTP';
const OTHER = 'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9';

/** A small, fixed set. Real puzzles are 5,000 lines; nothing here is about how many there are. */
const PUZZLES: Puzzle[] = [
  { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1b1', 'h1g1'], rating: 900, themes: ['endgame'] },
  { fen: '8/8/8/8/8/8/8/K6k b - - 0 1', moves: ['h1g1', 'a1b1'], rating: 1200, themes: ['fork'] },
  { fen: '8/8/8/8/8/8/1P6/K6k w - - 0 1', moves: ['b2b4', 'h1g1'], rating: 1500, themes: ['fork'] },
  { fen: '8/8/8/8/8/8/2P5/K6k w - - 0 1', moves: ['c2c4', 'h1g1'], rating: 2400, themes: ['pin'] },
];

function build(overrides: { now?: () => number; height?: () => Promise<number | null> } = {}) {
  let counter = 0;
  return createWitness({
    privateKeyHex: WITNESS_KEY,
    chain: 'test',
    sessions: createMemorySessions(),
    blockHeight: overrides.height ?? (async () => 4_200_000),
    newSessionId: () => String(++counter).padStart(32, '0'),
    now: overrides.now,
    puzzles: async () => PUZZLES,
    // Deterministic, so a test that depends on which puzzle was served is not flaky.
    random: () => 0,
  });
}

async function runOf(witness: ReturnType<typeof build>, count = 2, ratingBefore = 1200) {
  return witness.issue({ solver: SOLVER, mode: 'training', count, ratingBefore });
}

/* ------------------------------------------------------------------ the ordinary path */

test('a witnessed run produces a card that parses and verifies', async () => {
  const witness = build();
  const issued = await runOf(witness);
  const done = await witness.finish({
    sessionId: issued.sessionId,
    results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: 4000 })),
  });

  assert.equal(canonicalisePuzzleCard(parsePuzzleCard(done.canonical)), done.canonical);
  assert.equal(done.card.solver, SOLVER);
  assert.equal(done.card.witness, witness.address);
  assert.equal(done.card.attempted, 2);
  assert.equal(done.card.solved, 2);

  const checked = verifySignedText({
    text: done.canonical,
    publicKeyHex: done.signature.publicKeyHex,
    signatureHex: done.signature.signatureHex,
    expectedAddress: witness.address,
  });
  assert.equal(checked.ok, true, JSON.stringify(checked));
});

test('the address the witness reports is the one its key derives to', () => {
  assert.equal(build().address, witnessAddress(WITNESS_KEY));
});

test('the rating moves by exactly what the served puzzles are worth', async () => {
  const witness = build();
  const issued = await runOf(witness);

  let expected = 1200;
  for (const puzzle of issued.puzzles) expected = nextPuzzleRating(expected, puzzle.rating, true);

  const done = await witness.finish({
    sessionId: issued.sessionId,
    results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: 4000 })),
  });
  assert.equal(done.card.ratingAfter, expected);
  assert.equal(done.card.resultsHash, hashAttempts(done.attempts));
});

test('a failed run lowers the rating rather than leaving it alone', async () => {
  const witness = build();
  const issued = await runOf(witness);
  const done = await witness.finish({
    sessionId: issued.sessionId,
    results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: false, ms: 20_000 })),
  });
  assert.ok(done.card.ratingAfter < 1200, `${done.card.ratingAfter}`);
  assert.equal(done.card.solved, 0);
});

/* ------------------------------------------------------------------ the attacks */

test('the client cannot answer a puzzle that was not served', async () => {
  const witness = build();
  const issued = await runOf(witness);
  await assert.rejects(
    witness.finish({
      sessionId: issued.sessionId,
      results: [
        // The easiest puzzle in the set, swapped in for whatever was actually served.
        { id: puzzleId(PUZZLES[0]!), solved: true, ms: 4000 },
        { id: issued.puzzles[1]!.id, solved: true, ms: 4000 },
      ],
    }),
    (error: unknown) => error instanceof WitnessError && error.code === 'not-served',
  );
});

test('and cannot reorder them, because the rating is path-dependent', async () => {
  const witness = build();
  const issued = await witness.issue({ solver: SOLVER, mode: 'training', count: 2, ratingBefore: 1200 });
  await assert.rejects(
    witness.finish({
      sessionId: issued.sessionId,
      results: [...issued.puzzles].reverse().map((puzzle) => ({ id: puzzle.id, solved: true, ms: 4000 })),
    }),
    (error: unknown) => error instanceof WitnessError && error.code === 'not-served',
  );
});

test('and cannot report a different number of results from the puzzles served', async () => {
  const witness = build();
  const issued = await runOf(witness);
  await assert.rejects(
    witness.finish({
      sessionId: issued.sessionId,
      results: [{ id: issued.puzzles[0]!.id, solved: true, ms: 4000 }],
    }),
    (error: unknown) => error instanceof WitnessError && error.code === 'bad-results',
  );
});

test('a solve returned faster than a board can be read is refused', async () => {
  const witness = build();
  const issued = await runOf(witness);
  await assert.rejects(
    witness.finish({
      sessionId: issued.sessionId,
      results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: MIN_MS_PER_PUZZLE - 1 })),
    }),
    (error: unknown) => error instanceof WitnessError && error.code === 'too-fast',
  );
});

test('but an instant *failure* is allowed — that is what giving up looks like', async () => {
  const witness = build();
  const issued = await runOf(witness);
  const done = await witness.finish({
    sessionId: issued.sessionId,
    results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: false, ms: 0 })),
  });
  assert.equal(done.card.solved, 0);
});

test('a run is witnessed once — the session is consumed', async () => {
  const witness = build();
  const issued = await runOf(witness);
  const results = issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: false, ms: 9000 }));
  await witness.finish({ sessionId: issued.sessionId, results });

  await assert.rejects(
    witness.finish({ sessionId: issued.sessionId, results }),
    (error: unknown) => error instanceof WitnessError && error.code === 'no-session',
  );
});

test('a session left open too long cannot be cashed in later', async () => {
  let clock = 1_000_000;
  const witness = build({ now: () => clock });
  const issued = await runOf(witness);
  clock += SESSION_TTL_MS + 1;

  await assert.rejects(
    witness.finish({
      sessionId: issued.sessionId,
      results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: 4000 })),
    }),
    (error: unknown) => error instanceof WitnessError && error.code === 'expired',
  );
});

test('the witness refuses to serve itself', async () => {
  const witness = build();
  await assert.rejects(
    witness.issue({ solver: witness.address, mode: 'training', count: 1, ratingBefore: 1200 }),
    (error: unknown) => error instanceof WitnessError && error.code === 'self-witness',
  );
});

test('a run longer than the cap is refused', async () => {
  const witness = build();
  await assert.rejects(
    witness.issue({ solver: SOLVER, mode: 'training', count: MAX_RUN + 1, ratingBefore: 1200 }),
    (error: unknown) => error instanceof WitnessError && error.code === 'bad-count',
  );
});

test('an absurd claimed rating is refused', async () => {
  const witness = build();
  await assert.rejects(
    witness.issue({ solver: SOLVER, mode: 'training', count: 1, ratingBefore: 99_999 }),
    (error: unknown) => error instanceof WitnessError && error.code === 'bad-rating',
  );
});

test('a run cannot start when the chain cannot be read', async () => {
  const witness = build({ height: async () => null });
  await assert.rejects(
    witness.issue({ solver: SOLVER, mode: 'training', count: 1, ratingBefore: 1200 }),
    (error: unknown) => error instanceof WitnessError && error.code === 'no-chain',
  );
});

/* ------------------------------------------------------------------ what it serves */

test('a run never serves the same puzzle twice', async () => {
  const witness = build();
  const issued = await witness.issue({ solver: SOLVER, mode: 'training', count: 4, ratingBefore: 1200 });
  assert.equal(new Set(issued.puzzles.map((puzzle) => puzzle.id)).size, 4);
});

test('puzzles already seen are avoided', async () => {
  const witness = build();
  const skip = puzzleId(PUZZLES[1]!);
  const issued = await witness.issue({
    solver: SOLVER,
    mode: 'training',
    count: 2,
    ratingBefore: 1200,
    seen: [skip],
  });
  assert.ok(!issued.puzzles.some((puzzle) => puzzle.id === skip));
});

test('the daily serves the same puzzle to everybody on the same day', async () => {
  const witness = build();
  const one = await witness.issue({ solver: SOLVER, mode: 'daily', count: 1, ratingBefore: 1200, day: '2026-09-07' });
  const two = await witness.issue({
    solver: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
    mode: 'daily',
    count: 1,
    ratingBefore: 2100,
    day: '2026-09-07',
  });
  assert.equal(one.puzzles[0]!.id, two.puzzles[0]!.id);
});

test('and a different one on a different day', async () => {
  const witness = build();
  // Two solvers rather than one, because a solver with a run already open **resumes** it — which is
  // the anti-cherry-picking rule below, and would otherwise hand back yesterday's puzzle.
  const one = await witness.issue({ solver: SOLVER, mode: 'daily', count: 1, ratingBefore: 1200, day: '2026-09-07' });
  const two = await witness.issue({ solver: OTHER, mode: 'daily', count: 1, ratingBefore: 1200, day: '2026-09-08' });
  assert.notEqual(one.puzzles[0]!.id, two.puzzles[0]!.id);
});

/* ------------------------------------------------------------------ cherry-picking */

test('a solver with a run open gets that run back, not a fresh one', async () => {
  const witness = build();
  const first = await runOf(witness);
  const again = await runOf(witness);
  assert.equal(again.sessionId, first.sessionId);
  assert.deepEqual(
    again.puzzles.map((puzzle) => puzzle.id),
    first.puzzles.map((puzzle) => puzzle.id),
  );
});

test('so a bad run cannot be thrown away and retried at will', async () => {
  const witness = build();
  const first = await runOf(witness);
  // Walk away, ask for another. The same puzzles come back — the run has to be finished or waited out.
  const again = await witness.issue({ solver: SOLVER, mode: 'training', count: 2, ratingBefore: 1200 });
  assert.equal(again.sessionId, first.sessionId);
});

test('and once it is settled, the next run really is a new one', async () => {
  const witness = build();
  const first = await runOf(witness);
  await witness.finish({
    sessionId: first.sessionId,
    results: first.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: 4000 })),
  });
  const second = await runOf(witness);
  assert.notEqual(second.sessionId, first.sessionId);
});

test('an expired run is replaced rather than resumed for ever', async () => {
  let clock = 1_000_000;
  const witness = build({ now: () => clock });
  const first = await runOf(witness);
  clock += SESSION_TTL_MS + 1;
  const second = await runOf(witness);
  assert.notEqual(second.sessionId, first.sessionId);
});

test("one solver's open run does not block another's", async () => {
  const witness = build();
  const mine = await runOf(witness);
  const theirs = await witness.issue({ solver: OTHER, mode: 'training', count: 2, ratingBefore: 1200 });
  assert.notEqual(theirs.sessionId, mine.sessionId);
});

test('a themed run serves only that theme', async () => {
  const witness = build();
  const issued = await witness.issue({
    solver: SOLVER,
    mode: 'themed',
    count: 2,
    ratingBefore: 1200,
    theme: 'fork',
  });
  const forks = PUZZLES.filter((puzzle) => puzzle.themes.includes('fork')).map(puzzleId);
  for (const puzzle of issued.puzzles) assert.ok(forks.includes(puzzle.id), puzzle.id);
});

test('the card cannot end before it started, even inside one block', async () => {
  // A height that goes backwards is what a load-balanced pair of nodes looks like mid-sync.
  let height = 4_200_000;
  const witness = build({ height: async () => height });
  const issued = await runOf(witness);
  height = 4_199_000;

  const done = await witness.finish({
    sessionId: issued.sessionId,
    results: issued.puzzles.map((puzzle) => ({ id: puzzle.id, solved: true, ms: 4000 })),
  });
  assert.ok(done.card.endedAtBlock >= done.card.startedAtBlock);
});
