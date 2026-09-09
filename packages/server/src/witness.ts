/**
 * The puzzle witness — the thing that makes a solo rating mean something.
 *
 * ## What it is for
 *
 * `packages/core/src/puzzlecard.ts` explains why a solo rating needs a witness at all; the short
 * version is that the whole puzzle set is bundled in the app, so "I solved it" signed by the person
 * claiming it proves nothing. Somebody else has to have chosen the puzzle and seen the answer come
 * back. This is that somebody.
 *
 * ## Why this key is secret, when the bot's is published
 *
 * `apps/web/src/bot-identity.ts` publishes its private key on purpose, and it is safe there for a
 * precise reason: a bot game says `casual` inside the signed bytes, so forging a thousand of them
 * moves nobody's rating by a point. **That argument does not transfer here**, and getting it wrong
 * would have been the single worst bug in this feature: a published witness key lets any solver
 * witness their own run, which is exactly the attack the witness exists to prevent. So this key is
 * held by the server and only its address is public.
 *
 * The consequence is the same honest one the pool already has: **without a key, runs are not
 * witnessed and puzzles are not rated** — everything else about them still works, and the screen
 * says so rather than pretending.
 *
 * ## What a witness actually proves, stated exactly
 *
 * It proves the server **chose which puzzles were served, in which order**, and that answers came
 * back inside a plausible time. It does **not** prove the solver did not read the answer out of
 * their own copy of the set, because the set is public — CC0, from Lichess, downloadable by anyone.
 * Lichess's puzzle database has the same property and they rate puzzles anyway, so this is the same
 * bar the strongest reference in the field works to, not a shortcut. The impossibly-fast guard below
 * is a cheap improvement on it, and is not claimed to be more than that.
 *
 * ## What this deliberately does not hold
 *
 * A rating. The server stores no rating for anybody, and `ratingBefore` is asserted by the client.
 * That sounds like a hole and is not: a recompute always starts from `PUZZLE_START` and walks the
 * cards, so a claimed rating that does not follow from the cards before it shows up as a broken
 * chain on the record page (`computePuzzleRating` returns `brokenAt`). Holding ratings here would
 * make us the authority on them, which is the one thing this product exists not to be.
 */

import { KeyPair, PrivateKey } from '@nimiq/core';
import {
  canonicalisePuzzleCard,
  dailyPuzzle,
  hashAttempts,
  loadPuzzles,
  nextPuzzleRating,
  puzzleId,
  puzzleNear,
  PUZZLE_FLOOR,
  type Puzzle,
  type PuzzleAttempt,
  type PuzzleCard,
  type PuzzleMode,
} from '@scoresheet/core';
import { nimiqSignedMessageDigest } from '@scoresheet/verify';

/**
 * The most puzzles one run may contain.
 *
 * A cap exists because a run is one signature: without it, somebody could hold a session open for a
 * thousand puzzles and the rating would move by an unbounded amount on a single card. Twenty is
 * comfortably more than a sitting and small enough that a forged card cannot do much.
 */
export const MAX_RUN = 20;

/**
 * How long a session may stay open, in milliseconds.
 *
 * Long enough for twenty puzzles at a thinking pace, short enough that an abandoned session is not
 * a slot somebody can come back to days later with the answers looked up at leisure.
 */
export const SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * The fastest a served puzzle may be answered and still count, in milliseconds.
 *
 * A human has to see the board, read the position and move a piece. Under this, something answered
 * before it was looked at. It is a floor on plausibility, not a proof of honesty — see the header.
 */
export const MIN_MS_PER_PUZZLE = 600;

/** A rating a client may claim to be starting from. Beyond this it is not a claim, it is a typo. */
export const MAX_CLAIMABLE_RATING = 4000;

/** One session the server is holding open: what it served, to whom, and when. */
export interface Session {
  sessionId: string;
  solver: string;
  mode: PuzzleMode;
  /** The puzzles served, in the order they were served. Their ids, which name them in the set. */
  served: { id: string; rating: number }[];
  ratingBefore: number;
  startedAtBlock: number;
  /** By the server's clock, for the TTL and the plausibility floor. */
  startedAt: number;
}

export interface SessionStore {
  put(session: Session): Promise<void>;
  get(sessionId: string): Promise<Session | undefined>;
  /** The run this solver already has open, if any. One at a time — see `issue`. */
  openFor(solver: string): Promise<Session | undefined>;
  remove(sessionId: string): Promise<void>;
  sweep(before: number): Promise<void>;
}

/** Sessions in memory. They are short-lived by design, so losing them on restart costs a run. */
export function createMemorySessions(): SessionStore {
  const sessions = new Map<string, Session>();
  return {
    async put(session) {
      sessions.set(session.sessionId, session);
    },
    async get(sessionId) {
      return sessions.get(sessionId);
    },
    async openFor(solver) {
      for (const session of sessions.values()) if (session.solver === solver) return session;
      return undefined;
    },
    async remove(sessionId) {
      sessions.delete(sessionId);
    },
    async sweep(before) {
      for (const [id, session] of sessions) if (session.startedAt < before) sessions.delete(id);
    },
  };
}

export class WitnessError extends Error {
  override readonly name = 'WitnessError';
  readonly status: number;
  readonly code: string;

  /*
   * Fields declared and assigned rather than as constructor parameter properties.
   *
   * The tests run under `node --experimental-strip-types`, which erases types and compiles nothing:
   * a parameter property is TypeScript that *emits code*, so it is refused outright. `LiveError`
   * beside it is written the same way for the same reason.
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface WitnessOptions {
  /** The witness's private key, hex. Secret — see the file header. */
  privateKeyHex: string;
  /** Which chain the cards are bound to, since `sign()` has no domain separation. */
  chain: 'main' | 'test';
  sessions: SessionStore;
  /** The current block height, or null when the chain cannot be read. */
  blockHeight(): Promise<number | null>;
  newSessionId(): string;
  now?: (() => number) | undefined;
  /** The puzzle set. Injectable so a test does not parse 5,000 puzzles for one assertion. */
  puzzles?: (() => Promise<readonly Puzzle[]>) | undefined;
  random?: (() => number) | undefined;
}

export interface IssueRequest {
  solver: string;
  mode: PuzzleMode;
  count: number;
  /** The rating the client believes it is starting from. Asserted, not trusted — see the header. */
  ratingBefore: number;
  theme?: string | undefined;
  /** Puzzles this solver has already seen, so a run does not repeat one. */
  seen?: readonly string[] | undefined;
  /** For the daily, which day it is in the solver's own timezone. */
  day?: string | undefined;
}

export interface IssuedSession {
  sessionId: string;
  startedAtBlock: number;
  /**
   * The puzzles to serve, by id.
   *
   * The id is the FEN and the line, so this response contains the solutions — and that is not a
   * leak, because the client already has every one of them in its bundle. Sending an opaque handle
   * instead would look more careful and would protect nothing. See the header on what a witness
   * proves.
   */
  puzzles: { id: string; rating: number }[];
}

export interface FinishRequest {
  sessionId: string;
  /** One per served puzzle, in the order they were served. */
  results: { id: string; solved: boolean; ms: number }[];
}

export interface WitnessedRun {
  card: PuzzleCard;
  canonical: string;
  attempts: PuzzleAttempt[];
  signature: { publicKeyHex: string; signatureHex: string };
}

export interface Witness {
  /** The witness's own address. Public, and shown wherever a card is. */
  readonly address: string;
  issue(request: IssueRequest): Promise<IssuedSession>;
  finish(request: FinishRequest): Promise<WitnessedRun>;
  sweep(): Promise<void>;
}

const ADDRESS = /^NQ[0-9A-Z]{34}$/;

export function createWitness(options: WitnessOptions): Witness {
  const keyPair = KeyPair.derive(PrivateKey.fromHex(options.privateKeyHex));
  const address = keyPair.toAddress().toUserFriendlyAddress().replace(/\s/g, '');
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;
  const puzzlesOf = options.puzzles ?? (() => loadPuzzles());

  return {
    address,

    async issue(request) {
      const solver = request.solver.replace(/\s/g, '').toUpperCase();
      if (!ADDRESS.test(solver)) {
        throw new WitnessError(400, 'bad-address', 'That does not look like a Nimiq address.');
      }
      if (solver === address) {
        throw new WitnessError(400, 'self-witness', 'The witness cannot solve its own puzzles.');
      }
      if (!Number.isInteger(request.count) || request.count < 1 || request.count > MAX_RUN) {
        throw new WitnessError(400, 'bad-count', `A run is between 1 and ${MAX_RUN} puzzles.`);
      }
      if (
        !Number.isInteger(request.ratingBefore) ||
        request.ratingBefore < PUZZLE_FLOOR ||
        request.ratingBefore > MAX_CLAIMABLE_RATING
      ) {
        throw new WitnessError(400, 'bad-rating', 'That is not a puzzle rating.');
      }

      /*
       * **One open run per solver, and an open run is resumed rather than replaced.**
       *
       * This closes the hole that the signature model opens. A card only moves a rating once the
       * solver signs it, so a solver can simply not sign a run that went badly — and if a new run
       * could be started at will, the honest strategy would be to run until one goes well and sign
       * that one. The rating would then measure luck and persistence rather than strength.
       *
       * Refusing a second run while one is open makes abandoning cost the session's whole lifetime,
       * and resuming means somebody who closed the app mid-run gets their puzzles back rather than
       * being punished for a phone call. It does not make cherry-picking impossible; it makes it
       * expensive, which is the honest claim.
       *
       * Lichess does not have this problem because it moves the rating the moment you answer. It
       * can, because it *is* the authority on your rating. This product deliberately is not, and
       * this is the price of that.
       */
      const already = await options.sessions.openFor(solver);
      if (already && now() - already.startedAt <= SESSION_TTL_MS) {
        return {
          sessionId: already.sessionId,
          startedAtBlock: already.startedAtBlock,
          puzzles: already.served,
        };
      }
      if (already) await options.sessions.remove(already.sessionId);

      /*
       * The height is fetched before anything is chosen, because a session that cannot be ordered
       * is a session that cannot become a card. Failing here costs nothing; failing after somebody
       * has solved twenty puzzles costs them the run.
       */
      const startedAtBlock = await options.blockHeight();
      if (startedAtBlock === null || startedAtBlock === 0) {
        throw new WitnessError(
          503,
          'no-chain',
          'We could not read the chain height just now, and a rated run needs one to be ordered.',
        );
      }

      const puzzles = await puzzlesOf();
      const seen = new Set(request.seen ?? []);
      const served: { id: string; rating: number }[] = [];

      for (let i = 0; i < request.count; i++) {
        /*
         * **The server chooses, and this is the whole mechanism.** If the client picked, it would
         * pick the easiest puzzle in the set every time and the rating would mean nothing. The daily
         * is the one exception, and only because it is the same puzzle for everybody — nobody can
         * choose it either.
         */
        const chosen =
          request.mode === 'daily'
            ? dailyPuzzle(puzzles, request.day)
            : puzzleNear(puzzles, request.ratingBefore, seen, random, request.theme);
        if (!chosen) throw new WitnessError(503, 'no-puzzles', 'No puzzle could be served just now.');

        const id = puzzleId(chosen);
        served.push({ id, rating: chosen.rating });
        // Within one run, never the same puzzle twice — the second attempt is not a test of anything.
        seen.add(id);
      }


      const session: Session = {
        sessionId: options.newSessionId(),
        solver,
        mode: request.mode,
        served,
        ratingBefore: request.ratingBefore,
        startedAtBlock,
        startedAt: now(),
      };
      await options.sessions.put(session);

      return { sessionId: session.sessionId, startedAtBlock, puzzles: served };
    },

    async finish(request) {
      const session = await options.sessions.get(request.sessionId);
      if (!session) {
        throw new WitnessError(404, 'no-session', 'That run has expired or was never started.');
      }
      if (now() - session.startedAt > SESSION_TTL_MS) {
        await options.sessions.remove(session.sessionId);
        throw new WitnessError(410, 'expired', 'That run was left open too long to be witnessed.');
      }

      const results = request.results;
      if (!Array.isArray(results) || results.length !== session.served.length) {
        throw new WitnessError(400, 'bad-results', 'A run reports one result per puzzle served.');
      }

      /*
       * The results must be the puzzles that were served, in the order they were served.
       *
       * Both halves matter. Different puzzles would let a client swap in easier ones after the fact;
       * a different order would change the rating, because the maths is path-dependent, and would
       * let a run be reshuffled into a better number without touching a single result.
       */
      const attempts: PuzzleAttempt[] = [];
      for (const [index, result] of results.entries()) {
        const served = session.served[index]!;
        if (result?.id !== served.id) {
          throw new WitnessError(400, 'not-served', 'Those are not the puzzles that were served.');
        }
        if (typeof result.solved !== 'boolean') {
          throw new WitnessError(400, 'bad-results', 'Each result says solved or not.');
        }
        if (typeof result.ms !== 'number' || !Number.isFinite(result.ms) || result.ms < 0) {
          throw new WitnessError(400, 'bad-results', 'Each result carries how long it took.');
        }
        /*
         * Answered before it could have been looked at. Only a solve is refused: reporting a *failure*
         * instantly is exactly what giving up looks like, and there is nothing to gain by faking one.
         */
        if (result.solved && result.ms < MIN_MS_PER_PUZZLE) {
          throw new WitnessError(400, 'too-fast', 'That was answered faster than a board can be read.');
        }
        attempts.push({ id: served.id, rating: served.rating, solved: result.solved });
      }

      const endedAtBlock = await options.blockHeight();
      if (endedAtBlock === null || endedAtBlock === 0) {
        throw new WitnessError(
          503,
          'no-chain',
          'We could not read the chain height just now, and a rated run needs one to be ordered.',
        );
      }

      let ratingAfter = session.ratingBefore;
      for (const attempt of attempts) ratingAfter = nextPuzzleRating(ratingAfter, attempt.rating, attempt.solved);

      const card: PuzzleCard = {
        chain: options.chain,
        sessionId: session.sessionId,
        solver: session.solver,
        witness: address,
        mode: session.mode,
        attempted: attempts.length,
        solved: attempts.filter((attempt) => attempt.solved).length,
        ratingBefore: session.ratingBefore,
        ratingAfter,
        startedAtBlock: session.startedAtBlock,
        // A run inside one block is ordinary — five puzzles fit comfortably between two Nimiq blocks.
        endedAtBlock: Math.max(endedAtBlock, session.startedAtBlock),
        resultsHash: hashAttempts(attempts),
      };

      const canonical = canonicalisePuzzleCard(card);
      const signature = keyPair.sign(nimiqSignedMessageDigest(new TextEncoder().encode(canonical)));

      /*
       * The session is consumed. A run is witnessed once: leaving it open would let the same served
       * puzzles produce a second card with a different set of answers, which is a free retry.
       */
      await options.sessions.remove(session.sessionId);

      return {
        card,
        canonical,
        attempts,
        signature: {
          publicKeyHex: keyPair.publicKey.toHex(),
          signatureHex: signature.toHex(),
        },
      };
    },

    async sweep() {
      await options.sessions.sweep(now() - SESSION_TTL_MS);
    },
  };
}

/** The witness's address from its key, without constructing one — for a status endpoint to print. */
export function witnessAddress(privateKeyHex: string): string {
  return KeyPair.derive(PrivateKey.fromHex(privateKeyHex)).toAddress().toUserFriendlyAddress().replace(/\s/g, '');
}
