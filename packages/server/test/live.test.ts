/**
 * The live game, tested where it can actually hurt somebody.
 *
 * Every test here is a way a real player loses something they should not: a game they were winning,
 * time they did not use, a seat they already had, or a move somebody else made for them. The state
 * machine is pure and its clock is injected, so all of it is exercised without a network and without
 * waiting a single real second.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  KEEP_SIGNED_MS,
  LAG_GRACE_MS,
  MIN_FULL_MOVES_TO_RATE,
  LiveError,
  clocksAt,
  createLive,
  createMemoryStore,
  isFlagged,
  rates,
  seatOf,
  type StoredGame,
} from '../src/index.ts';

const WHITE = 'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9';
const BLACK = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';
const STRANGER = 'NQ84BAFBNAMP3U04TQMYQTMC3BQEPFL6PMTP';

/** A live server with a clock a test can move, and ids that read plainly in a failure message. */
function harness(startAt = 1_000_000) {
  let clock = startAt;
  let issued = 0;
  const store = createMemoryStore();
  const live = createLive({
    store,
    now: () => clock,
    newId: () => String(++issued).padStart(32, '0'),
    blockHeight: async () => 4_200_000,
  });
  return {
    live,
    store,
    tick: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
  };
}

async function started(kit: ReturnType<typeof harness>, control: 'blitz' | 'unlimited' = 'blitz') {
  const created = await kit.live.create({ creator: WHITE, colour: 'w', timeControl: control });
  await kit.live.join(created.id, BLACK);
  return created.id;
}

/* ------------------------------------------------------------------ seats */

test('a game starts with one seat taken and one open', async () => {
  const kit = harness();
  const game = await kit.live.create({ creator: WHITE, colour: 'w', timeControl: 'blitz' });
  assert.equal(game.white, WHITE);
  assert.equal(game.black, null);
  assert.match(game.id, /^[0-9a-f]{32}$/i);
});

test('⭐ reopening the link is a reconnection, never "game full"', async () => {
  /*
   * Half of all online chess games involve somebody closing a tab (`SPEC.md` I2). Treating a return
   * as a new player would be the single most annoying bug this product could ship: you would lose
   * your own game by looking at it twice.
   */
  const kit = harness();
  const id = await started(kit);
  const again = await kit.live.join(id, WHITE);
  assert.equal(again.white, WHITE, 'still in the seat they had');
  const andAgain = await kit.live.join(id, BLACK);
  assert.equal(andAgain.black, BLACK);
});

test('a third person cannot take a seat', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(() => kit.live.join(id, STRANGER), (error: LiveError) => error.code === 'game-full');
});

test('⭐ the clock does not start until the second player arrives', async () => {
  /*
   * A link made in the morning and opened in the evening must not hand the opener a won game. The
   * creator's clock running while nobody is there to move is the most obvious way to get this wrong.
   */
  const kit = harness();
  const created = await kit.live.create({ creator: WHITE, colour: 'w', timeControl: 'blitz' });
  kit.tick(60_000);
  const waiting = await kit.live.view(created.id);
  assert.equal(waiting.whiteMs, waiting.initialMs, 'not a millisecond burned while alone');

  await kit.live.join(created.id, BLACK);
  kit.tick(10_000);
  const playing = await kit.live.view(created.id);
  assert.ok(playing.whiteMs < playing.initialMs, 'and now it runs');
});

/* ------------------------------------------------------------------ moves */

test('a move is validated against the real position, not taken on trust', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(() => kit.live.move(id, WHITE, 'Qh5xf7#'), (error: LiveError) => error.code === 'illegal-move');
  const view = await kit.live.move(id, WHITE, 'e4');
  assert.deepEqual(view.moves, ['e4']);
});

test('⭐ you cannot move for your opponent', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(() => kit.live.move(id, BLACK, 'e5'), (error: LiveError) => error.code === 'not-your-turn');
});

test('and a spectator cannot move at all', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(() => kit.live.move(id, STRANGER, 'e4'), (error: LiveError) => error.code === 'not-a-player');
});

test('a move before an opponent arrives is refused', async () => {
  const kit = harness();
  const created = await kit.live.create({ creator: WHITE, colour: 'w', timeControl: 'blitz' });
  await assert.rejects(
    () => kit.live.move(created.id, WHITE, 'e4'),
    (error: LiveError) => error.code === 'not-started',
  );
});

/* ------------------------------------------------------------------ the clock */

test('⭐ time is charged from when the move is received, less the lag grace', async () => {
  /*
   * The rule that makes flagging honest (`SPEC.md` I3). If the client's claimed time were used, a
   * player could flag their opponent by lying; if lag were charged in full, a slow connection would
   * be a standing tax on the person who has it.
   */
  const kit = harness();
  const id = await started(kit);
  const control = await kit.live.view(id);

  kit.tick(5_000);
  const after = await kit.live.move(id, WHITE, 'e4');
  const spent = control.initialMs - (after.whiteMs - after.incrementMs);
  assert.equal(spent, 5_000 - LAG_GRACE_MS, 'five seconds less the 200 ms grace');
});

test('a move faster than the grace costs nothing at all', async () => {
  const kit = harness();
  const id = await started(kit);
  const control = await kit.live.view(id);
  kit.tick(150);
  const after = await kit.live.move(id, WHITE, 'e4');
  assert.equal(after.whiteMs, control.initialMs + after.incrementMs, 'inside the grace, and the increment lands');
});

test('the increment is added on receipt, after the move is accepted', async () => {
  const kit = harness();
  const id = await started(kit);
  const before = await kit.live.view(id);
  kit.tick(LAG_GRACE_MS);
  const after = await kit.live.move(id, WHITE, 'e4');
  assert.equal(after.whiteMs, before.whiteMs + before.incrementMs);
});

test('only the side to move has a running clock', async () => {
  const kit = harness();
  const id = await started(kit);
  await kit.live.move(id, WHITE, 'e4');
  const white = (await kit.live.view(id)).whiteMs;
  kit.tick(8_000);
  const later = await kit.live.view(id);
  assert.equal(later.whiteMs, white, 'white is not moving, so white is not spending');
  assert.ok(later.blackMs < later.initialMs);
});

test('an unlimited game has no clock to run out', async () => {
  const kit = harness();
  const id = await started(kit, 'unlimited');
  kit.tick(10 * 60 * 60 * 1000);
  const view = await kit.live.view(id);
  assert.equal(view.claimable, false);
  assert.equal(view.whiteMs, 0, 'zero means "no clock", and it never becomes a flag');
});

/* ------------------------------------------------------------------ claiming */

test('⭐ a win on time is claimed, never automatic', async () => {
  /*
   * `SPEC.md` I2. An auto-win that fires while somebody is reconnecting on a train is
   * indistinguishable from being cheated, and it happens to the wrong person every time.
   */
  const kit = harness();
  const id = await started(kit);
  await kit.live.move(id, WHITE, 'e4');
  kit.tick(200_000);

  const flagged = await kit.live.view(id);
  assert.equal(flagged.claimable, true, 'the opponent may claim');
  assert.equal(flagged.result, null, 'but nothing has happened on its own');

  const claimed = await kit.live.claim(id, WHITE);
  assert.equal(claimed.result, '1-0');
  assert.equal(claimed.termination, 'timeout');
  assert.equal(claimed.endedAtBlock, 4_200_000, 'and the ordering key is stamped by the server');
});

test('a claim before the flag falls is refused', async () => {
  const kit = harness();
  const id = await started(kit);
  await kit.live.move(id, WHITE, 'e4');
  kit.tick(5_000);
  await assert.rejects(() => kit.live.claim(id, WHITE), (error: LiveError) => error.code === 'not-flagged');
});

test('⭐ you cannot claim your own flag', async () => {
  // Otherwise running out of time would be a way to win, which is the opposite of a clock.
  const kit = harness();
  const id = await started(kit);
  kit.tick(200_000);
  await assert.rejects(() => kit.live.claim(id, WHITE), (error: LiveError) => error.code === 'own-flag');
});

test('⭐ a player who reconnects can still finish a game nobody claimed', async () => {
  /*
   * The other half of "claimed, not automatic". Somebody comes back after their flag fell, their
   * opponent never pressed the button, and the game is still theirs to play — which is exactly the
   * outcome the deliberate claim exists to allow.
   */
  const kit = harness();
  const id = await started(kit);
  kit.tick(200_000);
  const late = await kit.live.move(id, WHITE, 'e4');
  assert.equal(late.result, null, 'still playable');
  assert.deepEqual(late.moves, ['e4']);
});

/* ------------------------------------------------------------------ endings */

test('checkmate ends the game with the right result and reason', async () => {
  const kit = harness();
  const id = await started(kit, 'unlimited');
  for (const san of ['f3', 'e5', 'g4']) await kit.live.move(id, san === 'e5' ? BLACK : WHITE, san);
  const mate = await kit.live.move(id, BLACK, 'Qh4#');
  assert.equal(mate.result, '0-1');
  assert.equal(mate.termination, 'checkmate');
});

test('⭐ stalemate is a draw, played through the server', async () => {
  /*
   * The shortest known stalemate from the starting position, nineteen plies, played move by move
   * through the real API. That is the point: a fixture pasted in as a FEN tests the ending code and
   * nothing else, and the first attempt at one here was not even a stalemate — the test failed
   * against correct code because the position was wrong.
   *
   * Playing it exercises the whole path: alternating turns, validation, the clock, and the ending.
   */
  const kit = harness();
  const id = await started(kit, 'unlimited');
  const line = [
    'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'Qxc7', 'Rah6', 'h4', 'f6',
    'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6',
  ];

  let view = await kit.live.view(id);
  for (const [ply, san] of line.entries()) {
    view = await kit.live.move(id, ply % 2 === 0 ? WHITE : BLACK, san);
  }

  assert.equal(view.result, '1/2-1/2');
  assert.equal(view.termination, 'stalemate');
  assert.equal(view.endedAtBlock, 4_200_000, 'and the ordering key is stamped');
});

test('resigning ends it, and only a player may do it', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(() => kit.live.resign(id, STRANGER), (error: LiveError) => error.code === 'not-a-player');
  const done = await kit.live.resign(id, BLACK);
  assert.equal(done.result, '1-0');
  assert.equal(done.termination, 'resignation');
});

test('⭐ the first ending wins — a game cannot be ended twice', async () => {
  // Two endings racing (a resignation and a claim, say) must not rewrite a settled result.
  const kit = harness();
  const id = await started(kit);
  const first = await kit.live.resign(id, WHITE);
  const second = await kit.live.resign(id, BLACK);
  assert.equal(first.result, '0-1');
  assert.equal(second.result, '0-1', 'the second attempt returns the settled game, unchanged');
});

test('a move after the game is over is refused', async () => {
  const kit = harness();
  const id = await started(kit);
  await kit.live.resign(id, WHITE);
  await assert.rejects(() => kit.live.move(id, BLACK, 'e5'), (error: LiveError) => error.code === 'game-over');
});

/* ------------------------------------------------------------------ rating and sweeping */

test('⭐ a short game is recorded but does not rate', async () => {
  // `SPEC.md` F4 and I2. Without it, abandoning after one move is a way to farm or to dodge.
  const kit = harness();
  const id = await started(kit, 'unlimited');
  await kit.live.move(id, WHITE, 'e4');
  await kit.live.resign(id, WHITE);
  const stored = (await kit.store.get(id))!;
  assert.equal(rates(stored), false);

  const long = { ...stored, moves: Array.from({ length: MIN_FULL_MOVES_TO_RATE * 2 }, () => 'e4') };
  assert.equal(rates(long), true);
});

test('games nobody has touched for a day are swept', async () => {
  const kit = harness();
  const id = await started(kit);
  kit.tick(25 * 60 * 60 * 1000);
  assert.equal(await kit.live.sweep(), 1);
  assert.equal(await kit.store.get(id), null);
});

test('⭐ but a game somebody has SIGNED is not swept after a day', async () => {
  /*
   * The most serious bug an audit of this codebase found, and it was in the sweep.
   *
   * The first version deleted anything untouched for a day — including finished games that had been
   * signed. That is the record the whole product exists to produce, and the server is where the
   * *other* player collects the counter-signature. Sweeping it made "a rating nobody can revoke"
   * false: revoked by us, on a timer, silently. `SPEC.md` I2 says a stale game is closed **as
   * abandoned**; it never said destroyed.
   */
  const kit = harness();
  const id = await started(kit);
  await kit.live.resign(id, BLACK);
  await kit.live.sign(id, WHITE, { publicKeyHex: 'aa'.repeat(32), signatureHex: 'bb'.repeat(64) });

  kit.tick(25 * 60 * 60 * 1000);
  assert.equal(await kit.live.sweep(), 0, 'a day is not long enough to throw a signature away');
  const kept = await kit.store.get(id);
  assert.ok(kept, 'the game is still there');
  assert.ok(kept.signatures.white, 'and so is the signature the other player has to collect');

  // A month later it is still there, which is the point of keeping it at all.
  kit.tick(30 * 24 * 60 * 60 * 1000);
  assert.equal(await kit.live.sweep(), 0);
  assert.ok(await kit.store.get(id));
});

test('and a signed game does eventually go, so this is not an archive', async () => {
  // Ninety days: long enough for somebody to come back next month and sign, short enough that the
  // server is not quietly becoming a permanent store of other people's games.
  const kit = harness();
  const id = await started(kit);
  await kit.live.resign(id, BLACK);
  await kit.live.sign(id, WHITE, { publicKeyHex: 'aa'.repeat(32), signatureHex: 'bb'.repeat(64) });

  kit.tick(KEEP_SIGNED_MS + 1000);
  assert.equal(await kit.live.sweep(), 1);
  assert.equal(await kit.store.get(id), null);
});

test('a finished game nobody signed is still swept after a day', async () => {
  // The rule is about signatures, not about being finished — an unsigned game is a game nobody
  // recorded, and keeping it for three months would be keeping it for nothing.
  const kit = harness();
  const id = await started(kit);
  await kit.live.resign(id, BLACK);
  kit.tick(25 * 60 * 60 * 1000);
  assert.equal(await kit.live.sweep(), 1);
  assert.equal(await kit.store.get(id), null);
});

test('and a game played an hour ago is not', async () => {
  const kit = harness();
  const id = await started(kit);
  kit.tick(60 * 60 * 1000);
  assert.equal(await kit.live.sweep(), 0);
  assert.ok(await kit.store.get(id));
});

/* ------------------------------------------------------------------ signatures */

test('both sides can sign at their own pace, and neither is verified here', async () => {
  /*
   * The server holds signatures so two people need not be present at the same moment — but it does
   * not check them. Verification is the reader's job, in their own browser, from the canonical text.
   * A server that vouched for signatures would be a server people had to trust, which is the one
   * thing this product is built to avoid.
   */
  const kit = harness();
  const id = await started(kit);
  await kit.live.resign(id, BLACK);

  const signature = { publicKeyHex: 'aa'.repeat(32), signatureHex: 'bb'.repeat(64) };
  const one = await kit.live.sign(id, WHITE, signature);
  assert.deepEqual(one.signed, { white: true, black: false });
  const both = await kit.live.sign(id, BLACK, signature);
  assert.deepEqual(both.signed, { white: true, black: true });
});

test('signing an unfinished game is refused', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(
    () => kit.live.sign(id, WHITE, { publicKeyHex: 'aa'.repeat(32), signatureHex: 'bb'.repeat(64) }),
    (error: LiveError) => error.code === 'not-over',
  );
});

/* ------------------------------------------------------------------ concurrency */

test('⭐ two moves arriving together do not both land', async () => {
  /*
   * Chess is a state machine, and a lost update is a lost move — or worse, two moves banked from the
   * same position, which produces a move list that is not a game. The per-id lock plus the version
   * check inside it is what prevents it, and this is the only test that can see either working.
   */
  const kit = harness();
  const id = await started(kit, 'unlimited');
  const results = await Promise.allSettled([
    kit.live.move(id, WHITE, 'e4'),
    kit.live.move(id, WHITE, 'd4'),
  ]);
  const landed = (await kit.store.get(id))!.moves;
  assert.equal(landed.length, 1, `both moves landed: ${landed.join(' ')}`);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

/* ------------------------------------------------------------------ pure helpers */

test('clocksAt and isFlagged agree with the view', async () => {
  const kit = harness();
  const id = await started(kit);
  kit.tick(200_000);
  const stored = (await kit.store.get(id))!;
  assert.equal(isFlagged(stored, kit.at()), true);
  assert.equal(clocksAt(stored, kit.at()).whiteMs, 0);
});

/* ------------------------------------------------------------------ another game */

/**
 * A rematch is the commonest thing anybody wants when a game ends, and every way it can go wrong
 * costs a real player something: two half-games, a stranger in the seat, or a clock that ran while
 * they were still reading the result.
 */

/** Play a game to a finish so a rematch has something to hang off. */
async function finished(kit: ReturnType<typeof harness>) {
  const id = await started(kit, 'unlimited');
  await kit.live.resign(id, BLACK);
  return id;
}

test('a rematch swaps the colours', async () => {
  const kit = harness();
  const id = await finished(kit);

  const again = await kit.live.rematch(id, WHITE);
  assert.equal(again.black, WHITE, 'whoever had White takes Black');
  assert.equal(again.white, null, 'and the other seat waits for the opponent');
  assert.notEqual(again.id, id);
});

test('and it keeps the time control', async () => {
  const kit = harness();
  const id = await started(kit, 'blitz');
  await kit.live.resign(id, BLACK);

  const again = await kit.live.rematch(id, WHITE);
  assert.equal(again.initialMs, 180_000);
  assert.equal(again.incrementMs, 2_000);
});

test('both players pressing produces one game, not two', async () => {
  const kit = harness();
  const id = await finished(kit);

  const [mine, theirs] = await Promise.all([kit.live.rematch(id, WHITE), kit.live.rematch(id, BLACK)]);
  assert.equal(mine.id, theirs.id, 'the second press joins the first press');

  const settled = await kit.live.view(mine.id);
  assert.equal(settled.white, BLACK);
  assert.equal(settled.black, WHITE);
});

test('pressing twice is not two games', async () => {
  const kit = harness();
  const id = await finished(kit);

  const first = await kit.live.rematch(id, WHITE);
  const second = await kit.live.rematch(id, WHITE);
  assert.equal(first.id, second.id);
});

test('the finished game carries the invitation, so the other player just sees it', async () => {
  const kit = harness();
  const id = await finished(kit);

  assert.equal((await kit.live.view(id)).rematchId, null);
  const again = await kit.live.rematch(id, WHITE);
  assert.equal((await kit.live.view(id)).rematchId, again.id);
});

test('a stranger cannot take the seat in somebody else’s rematch', async () => {
  const kit = harness();
  const id = await finished(kit);
  const again = await kit.live.rematch(id, WHITE);

  await assert.rejects(
    () => kit.live.join(again.id, STRANGER),
    (error: unknown) => error instanceof LiveError && error.code === 'reserved',
  );
  assert.equal((await kit.live.view(again.id)).white, null, 'and the seat is still open for them');
});

test('but the opponent can, and that is when the clock starts', async () => {
  const kit = harness();
  const id = await started(kit, 'blitz');
  await kit.live.resign(id, BLACK);
  const again = await kit.live.rematch(id, WHITE);

  // A minute passes with nobody there. A clock running here would flag somebody in a bullet
  // rematch they had not yet opened.
  kit.tick(60_000);
  const joined = await kit.live.join(again.id, BLACK);
  assert.equal(joined.white, BLACK);
  assert.equal(joined.whiteMs, 180_000, 'nothing was spent while the game sat empty');
});

test('a game still being played has no rematch', async () => {
  const kit = harness();
  const id = await started(kit);
  await assert.rejects(
    () => kit.live.rematch(id, WHITE),
    (error: unknown) => error instanceof LiveError && error.code === 'not-over',
  );
});

test('and somebody who was not playing cannot ask for one', async () => {
  const kit = harness();
  const id = await finished(kit);
  await assert.rejects(
    () => kit.live.rematch(id, STRANGER),
    (error: unknown) => error instanceof LiveError && error.code === 'not-a-player',
  );
});

test('a game nobody ever joined cannot be replayed', async () => {
  const kit = harness();
  // Made, then given up on before anybody opened the link — so it is over, and there is nobody to
  // play again. "Rematch" against an empty seat would create a game addressed to nobody.
  const alone = await kit.live.create({ creator: WHITE, colour: 'w', timeControl: 'blitz' });
  await kit.live.resign(alone.id, WHITE);

  await assert.rejects(
    () => kit.live.rematch(alone.id, WHITE),
    (error: unknown) => error instanceof LiveError && error.code === 'no-opponent',
  );
});
