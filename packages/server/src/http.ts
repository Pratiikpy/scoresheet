/**
 * The HTTP surface, as one pure function.
 *
 * `handleRequest` takes a method, a path, a query and a parsed body, and returns a status and a JSON
 * value. It touches no Node API and no Web API, which is what lets the same router sit behind a Node
 * server on a box, a serverless function, or a test that never opens a socket — `SPEC.md` I1's "one
 * implementation, two hosts", applied to the transport as well as the storage.
 *
 * **Polling, not WebSockets** (`SPEC.md` I1 and the note in `BRIEF.md`): the reason is that nothing
 * can be down when a judge opens the link, and a socket server is a thing that can be down in ways a
 * stateless request is not. `GET /api/game/:id?since=<version>` is the whole real-time layer: it
 * returns the game when it has changed and a bare `{ version }` when it has not, so a poll costs
 * about eighty bytes.
 *
 * ## Identity, and what it is and is not
 *
 * A caller says who they are with an `address`. **That is a claim, not a proof** — this server does
 * not and cannot authenticate a Nimiq address, because doing so would need a signature per request
 * and a wallet dialog per move, which is not a chess game anybody would play.
 *
 * What makes that acceptable is where the value actually sits: **the rating comes from the signed
 * scoresheet, not from this server.** Somebody who claims a seat with another person's address can
 * play a game with them, and at the end the scoresheet needs a signature from that address to count
 * for anything — which they cannot produce. The server holds a game in progress; the signatures hold
 * the record. Saying so plainly is better than implying an authentication that is not there.
 */

import { LiveError, TIME_CONTROLS, type Live, type TimeControlName } from './live.ts';
import { TournamentServerError, type Tournaments } from './tournaments.ts';
import type { Pool } from './pool.ts';
import { WitnessError, type Witness } from './witness.ts';
import type { PuzzleMode } from '@scoresheet/core';
import type { SignaturePair } from '@scoresheet/verify';
import { limitFor, type RateLimiter } from './limits.ts';

export interface RequestLike {
  method: string;
  /**
   * Who is asking, for rate limiting — an address, a proxy header, whatever the host can see.
   *
   * The host decides, because only the host knows whether it sits behind a proxy and which header
   * to believe. Absent means no limiting, which is the right default for a test.
   */
  caller?: string | undefined;
  /** The path, without the query string. */
  path: string;
  query: Record<string, string | undefined>;
  /** The parsed JSON body, or `null` for requests without one. */
  body: unknown;
}

export interface ResponseLike {
  status: number;
  body: unknown;
}

/**
 * A numeric field, from either a JSON number or a numeric string.
 *
 * `field` is deliberately string-only, which is right for addresses and ids and silently wrong for
 * numbers: `field(body, 'count')` on `{"count": 2}` returns null, `Number(null ?? '')` is 0, and the
 * request is refused with a message about the value the caller never sent. That is precisely what
 * happened here, and it was found by a test at the HTTP boundary rather than in the module beneath
 * it — the module was correct the whole time.
 *
 * Both forms are accepted because both are what real clients send: `JSON.stringify` of a number
 * gives a number, and a form or query string gives a string.
 */
function count(body: unknown, name: string): number {
  if (typeof body !== 'object' || body === null) return Number.NaN;
  const value = (body as Record<string, unknown>)[name];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return Number.NaN;
}

function field(body: unknown, name: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * A Nimiq address, loosely.
 *
 * Checked for *shape* only — `NQ`, two check digits, and 32 characters from Nimiq's alphabet, which
 * excludes I, O, W and Z. The check digits are not verified here: this is a guard against nonsense
 * reaching the store, not an authentication, and pretending otherwise would be the dishonest kind of
 * validation. Whitespace is stripped because that is how people paste an address.
 */
function address(value: string | null): string | null {
  if (!value) return null;
  const tight = value.replace(/\s/g, '').toUpperCase();
  return /^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(tight) ? tight : null;
}

/** The run modes the witness will serve. An unknown one is a 400, never a default. */
const PUZZLE_MODES = new Set(['daily', 'training', 'themed', 'storm', 'streak']);

const ok = (body: unknown): ResponseLike => ({ status: 200, body });
const fail = (status: number, code: string, message: string): ResponseLike => ({
  status,
  body: { error: { code, message } },
});

export async function handleRequest(
  live: Live,
  request: RequestLike,
  pool?: Pool,
  limiter?: RateLimiter,
  witness?: Witness,
  tournaments?: Tournaments,
): Promise<ResponseLike> {
  /*
   * Rate limits, before anything is read or written — `SPEC.md` P5.
   *
   * Without them one script can create a million games, fill a disk, and take the live server down
   * for everybody mid-match. The buckets are sized so that no human playing chess can reach them:
   * moves get a generous one because bullet is a move a second, and creating games and claiming
   * money get tight ones, because nobody legitimately does either in a loop.
   */
  if (limiter && request.caller) {
    if (!limiter.take(request.caller, limitFor(request.method, request.path))) {
      return {
        status: 429,
        body: {
          error: {
            code: 'too-many',
            message: 'That is more requests than we can take from one place. Wait a moment and try again.',
          },
        },
      };
    }
  }

  try {
    return await route(live, request, pool, witness, tournaments);
  } catch (error) {
    if (error instanceof LiveError) return fail(error.status, error.code, error.message);
    // A witness refusal is a stated reason, not a crash: "those are not the puzzles that were served"
    // is exactly what the client needs to show, and swallowing it into a 500 would hide the defence.
    if (error instanceof WitnessError) return fail(error.status, error.code, error.message);
    // A tournament refusal is a stated reason too: "those two were not paired in that round" is
    // exactly what the client needs to show, and a 500 would hide the defence that produced it.
    if (error instanceof TournamentServerError) return fail(error.status, error.code, error.message);
    /*
     * An unexpected failure is a 500 with a generic sentence, and the detail stays here.
     *
     * A stack trace in a response body is both a security problem and useless to the person reading
     * it. The client turns this into "something went wrong on our side, your game is safe" — which is
     * true, because the game is in the store and the next poll will find it.
     */
    return fail(500, 'server-error', 'Something went wrong on our side. Your game is safe.');
  }
}

async function route(
  live: Live,
  request: RequestLike,
  pool?: Pool,
  witness?: Witness,
  tournaments?: Tournaments,
): Promise<ResponseLike> {
  const { method, path, query, body } = request;

  if (method === 'GET' && path === '/api/health') {
    return ok({ ok: true, timeControls: Object.keys(TIME_CONTROLS) });
  }

  if (method === 'POST' && path === '/api/game') {
    const creator = address(field(body, 'address'));
    if (!creator) return fail(400, 'bad-address', 'That does not look like a Nimiq address.');

    const control = field(body, 'timeControl') ?? 'blitz';
    if (!(control in TIME_CONTROLS)) {
      return fail(400, 'bad-time-control', 'Unknown time control.');
    }
    const wanted = field(body, 'colour') ?? 'random';
    if (wanted !== 'w' && wanted !== 'b' && wanted !== 'random') {
      return fail(400, 'bad-colour', 'Colour must be w, b or random.');
    }

    return ok(
      await live.create({
        creator,
        colour: wanted,
        timeControl: control as TimeControlName,
      }),
    );
  }

  /* ------------------------------------------------------------------ the puzzle witness */

  /*
   * Three endpoints, and the shape is the whole security argument.
   *
   * The server **issues** the puzzles, so the solver never chooses them; the solver reports back
   * **only** which of those it solved; the server signs a card. A fourth endpoint that let a client
   * hand over a finished run would undo all of it, which is why there isn't one.
   *
   * `GET /api/puzzles/witness` exists so a screen can be honest *before* somebody plays: with no
   * witness key configured the answer is `available: false` and the puzzle screen says runs are not
   * rated here, rather than discovering it after twenty puzzles.
   */
  if (method === 'GET' && path === '/api/puzzles/witness') {
    return ok(witness ? { available: true, address: witness.address } : { available: false });
  }

  if (method === 'POST' && path === '/api/puzzles/session') {
    if (!witness) return fail(503, 'no-witness', 'Rated runs are not available on this server.');

    const solver = address(field(body, 'address'));
    if (!solver) return fail(400, 'bad-address', 'That does not look like a Nimiq address.');

    const mode = field(body, 'mode') ?? 'training';
    if (!PUZZLE_MODES.has(mode)) return fail(400, 'bad-mode', 'Unknown run mode.');

    const howMany = count(body, 'count');
    const ratingBefore = count(body, 'ratingBefore');
    const day = field(body, 'day') ?? undefined;
    if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return fail(400, 'bad-day', 'A day must look like 2026-09-07.');
    }

    /*
     * `seen` is a list the client keeps, and it is advice rather than a permission: at worst a
     * client that lies about it is served a puzzle it has already done, which helps nobody. It is
     * capped so one request cannot arrive carrying a megabyte of strings.
     */
    const seenRaw = (body as Record<string, unknown> | undefined)?.['seen'];
    const seen = Array.isArray(seenRaw)
      ? seenRaw.filter((one): one is string => typeof one === 'string').slice(0, 5_000)
      : undefined;

    return ok(
      await witness.issue({
        solver,
        mode: mode as PuzzleMode,
        count: howMany,
        ratingBefore,
        theme: field(body, 'theme') ?? undefined,
        seen,
        day,
      }),
    );
  }

  if (method === 'POST' && path === '/api/puzzles/finish') {
    if (!witness) return fail(503, 'no-witness', 'Rated runs are not available on this server.');

    const sessionId = field(body, 'sessionId');
    if (!sessionId || !/^[0-9a-f]{32}$/.test(sessionId)) {
      return fail(400, 'bad-session', 'That is not a run identifier.');
    }

    const rawResults = (body as Record<string, unknown> | undefined)?.['results'];
    if (!Array.isArray(rawResults)) {
      return fail(400, 'bad-results', 'A run reports one result per puzzle served.');
    }
    /*
     * Shaped here rather than trusted into the witness. `witness.finish` checks that these are the
     * puzzles it served and refuses anything else, but it should never be handed `undefined` where
     * it expects a string — the boundary is this function's job, and a `TypeError` inside a security
     * check is how a security check stops running.
     */
    const results = rawResults.map((one) => {
      const row = (one ?? {}) as Record<string, unknown>;
      return {
        id: typeof row['id'] === 'string' ? row['id'] : '',
        solved: row['solved'] === true,
        ms: typeof row['ms'] === 'number' ? row['ms'] : Number.NaN,
      };
    });

    return ok(await witness.finish({ sessionId, results }));
  }

  /* ------------------------------------------------------------------ the puzzle pool */

  if (pool && method === 'GET' && path === '/api/pool') {
    // What a claim is worth and whether there is anything left today, so a screen can be honest
    // before somebody taps rather than after.
    const day = query['day'];
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return fail(400, 'bad-day', 'A day must look like 2026-09-07.');
    }
    return ok(await pool.status(day));
  }

  if (pool && method === 'POST' && path === '/api/pool/claim') {
    const who = address(field(body, 'address'));
    if (!who) return fail(400, 'bad-address', 'That does not look like a Nimiq address.');

    const day = field(body, 'day');
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return fail(400, 'bad-day', 'A day must look like 2026-09-07.');
    }

    /*
     * The device identifier is required, and a claim without one is refused.
     *
     * It is the only limit that actually binds: wallets are free and unlimited, so a per-address cap
     * alone is no cap at all. A client that cannot produce one — an ordinary browser rather than
     * Nimiq Pay — is told so rather than quietly given a free pass, because a free pass here is the
     * whole pool.
     */
    const device = field(body, 'device');
    if (!device || device.length < 8 || device.length > 128) {
      return fail(400, 'no-device', 'This needs to run inside Nimiq Pay, which is what identifies the device.');
    }

    const puzzleId = field(body, 'puzzleId');
    if (!puzzleId) return fail(400, 'bad-puzzle', 'No puzzle was named.');

    const outcome = await pool.claim({ address: who, device, day, puzzleId });
    if (outcome.ok) return ok({ paid: true, amount: outcome.amount, hash: outcome.hash });
    return { status: 409, body: { error: { code: outcome.reason, message: refusal(outcome.reason) } } };
  }

  /* ------------------------------------------------------------------ tournaments */

  /*
   * Four endpoints, and the shape says what the server is for.
   *
   * It remembers who registered, closes the door when the seats are full, and hands back what it
   * holds. **It computes nothing anybody has to trust**: the draw, the pairings, the standings and
   * the payout are the same public functions a stranger runs on `/t/<id>`, and if this server
   * vanished every finished tournament would still be checkable from what it had already published.
   * There is deliberately no endpoint that accepts a standings table.
   */
  if (tournaments && method === 'GET' && path === '/api/tournaments') {
    return ok({ tournaments: tournaments.list() });
  }

  if (tournaments && method === 'POST' && path === '/api/tournaments') {
    const creator = address(field(body, 'address'));
    if (!creator) return fail(400, 'bad-address', 'That does not look like a Nimiq address.');

    const asked = count(body, 'seats');
    const seats = Number.isNaN(asked) ? 4 : asked;
    const name = field(body, 'name') ?? 'Tournament';
    const raw = (body as Record<string, unknown>)['prizes'];
    const prizes = Array.isArray(raw) ? raw.map((value) => Number(value)) : [];

    return ok(await tournaments.create({ name, seats, prizes, creator }));
  }

  const joining = /^\/api\/tournaments\/([0-9a-z]{1,32})\/join$/.exec(path);
  if (tournaments && joining?.[1] && method === 'POST') {
    const who = address(field(body, 'address'));
    if (!who) return fail(400, 'bad-address', 'That does not look like a Nimiq address.');
    return ok(tournaments.join(joining[1], who));
  }

  /*
   * ⭐ Reporting a tournament result means presenting a game, not naming a winner.
   *
   * There is no `whiteScore` here any more and there is no `white` or `black`: the two players and
   * the result are read out of the signed scoresheet by `tournaments.record`, which refuses anything
   * both players did not sign. This endpoint's whole job is to pass the evidence through unaltered.
   */
  const reporting = /^\/api\/tournaments\/([0-9a-z]{1,32})\/result$/.exec(path);
  if (tournaments && reporting?.[1] && method === 'POST') {
    const round = count(body, 'round');
    const scoresheet = field(body, 'scoresheet');
    const signatures = (body as Record<string, unknown>)['signatures'];
    if (Number.isNaN(round) || !scoresheet || typeof signatures !== 'object' || signatures === null) {
      return fail(400, 'bad-result', 'A result is a round, a scoresheet, and both signatures.');
    }
    const pair = (side: 'white' | 'black'): SignaturePair | null => {
      const value = (signatures as Record<string, unknown>)[side];
      if (typeof value !== 'object' || value === null) return null;
      const publicKeyHex = (value as Record<string, unknown>)['publicKeyHex'];
      const signatureHex = (value as Record<string, unknown>)['signatureHex'];
      if (typeof publicKeyHex !== 'string' || typeof signatureHex !== 'string') return null;
      return { publicKeyHex, signatureHex };
    };
    const white = pair('white');
    const black = pair('black');
    if (!white || !black) {
      return fail(400, 'bad-result', 'A result is a round, a scoresheet, and both signatures.');
    }
    return ok(tournaments.record(reporting[1], { round, scoresheet, signatures: { white, black } }));
  }

  const oneTournament = /^\/api\/tournaments\/([0-9a-z]{1,32})$/.exec(path);
  if (tournaments && oneTournament?.[1] && method === 'GET') {
    return ok(tournaments.view(oneTournament[1]));
  }

  const game = /^\/api\/game\/([0-9a-f]{32})$/.exec(path);
  if (game?.[1] && method === 'GET') {
    const view = await live.view(game[1]);
    /*
     * The polling reply, and the reason polling is affordable at all.
     *
     * `since` is the version the client already has. When nothing has changed the answer is about
     * eighty bytes instead of a whole game with its move list — which at 500 ms per poll is the
     * difference between a background tab costing nothing and costing a megabyte an hour.
     */
    const since = Number(query['since']);
    if (Number.isInteger(since) && since >= view.version) {
      return ok({ version: view.version, unchanged: true });
    }
    return ok(view);
  }

  const action = /^\/api\/game\/([0-9a-f]{32})\/([a-z]+)$/.exec(path);
  if (action?.[1] && action[2] && method === 'POST') {
    const [, id, what] = action;
    const who = address(field(body, 'address'));
    if (!who) return fail(400, 'bad-address', 'That does not look like a Nimiq address.');

    switch (what) {
      case 'join':
        return ok(await live.join(id, who));
      case 'move': {
        const san = field(body, 'san');
        if (!san) return fail(400, 'bad-move', 'No move was sent.');
        // A cap, because a move in SAN is at most about seven characters and anything longer is
        // somebody probing rather than playing.
        if (san.length > 12) return fail(422, 'illegal-move', 'That move is not legal here.');
        return ok(await live.move(id, who, san));
      }
      case 'rematch':
        return ok(await live.rematch(id, who));
      case 'resign':
        return ok(await live.resign(id, who));
      case 'claim':
        return ok(await live.claim(id, who));
      case 'draw':
        return ok(await live.draw(id, who));
      case 'sign': {
        const publicKeyHex = field(body, 'publicKeyHex');
        const signatureHex = field(body, 'signatureHex');
        if (!publicKeyHex || !signatureHex) {
          return fail(400, 'bad-signature', 'A signature needs a public key and a signature.');
        }
        if (!/^[0-9a-f]{64}$/.test(publicKeyHex) || !/^[0-9a-f]{128}$/.test(signatureHex)) {
          // Ed25519 is 32 and 64 bytes. Shape is checked; validity is the reader's job, in their own
          // browser, which is the entire point of the product.
          return fail(400, 'bad-signature', 'That is not the shape of a Nimiq signature.');
        }
        return ok(await live.sign(id, who, { publicKeyHex, signatureHex }));
      }
      default:
        return fail(404, 'no-route', 'No such action.');
    }
  }

  return fail(404, 'no-route', 'No such endpoint.');
}

/**
 * Why a claim was refused, in words.
 *
 * The client turns the code into its own sentence, but a bare code with no message is a bad API —
 * anything reading this without our client should still learn what happened.
 */
function refusal(reason: string): string {
  switch (reason) {
    case 'already-claimed':
      return 'This wallet has already claimed today.';
    case 'device-claimed':
      return 'This device has already claimed today.';
    case 'budget-spent':
      return 'Every reward for today has been claimed. The pool refills tomorrow.';
    case 'not-funded':
      return 'The pool is not funded at the moment.';
    default:
      return 'That claim could not be made.';
  }
}
