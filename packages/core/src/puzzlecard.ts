/**
 * The puzzle card — a rating one person can earn alone, and still nobody can take away.
 *
 * ## Why this exists
 *
 * A scoresheet needs two players, and that is a real cost: until this file, the only rating in the
 * product required finding a second human who also has a Nimiq wallet. Somebody who opens the app
 * on their own can play, solve, review and share — but the number the whole app is *about* stayed
 * at nothing until a second person appeared. A judge opening it alone never reached the product.
 *
 * ## Why puzzles, and not games against the bot
 *
 * Because that is how chess does it, and the reasoning is not ours. **Lichess does not rate games
 * against the computer, and rates puzzles with a real Glicko rating.** The distinction is sound: a
 * game against a bot is unwitnessed — take a move back, consult an engine, restart when it goes
 * badly, and the result says nothing. A puzzle is one position with one answer, served by somebody
 * else, and either you saw it or you did not. So bot games stay `casual` for ever, and the solo
 * rating is a puzzle rating.
 *
 * ## Why a witness, and why that is not us issuing a rating
 *
 * A self-signed "I solved it" proves nothing: the whole puzzle set is bundled in the app, so anyone
 * can read the answer out of their own copy. Somebody other than the solver has to have chosen the
 * puzzle and seen the answer arrive.
 *
 * That witness is the server, signing with a **published key** — the same pattern
 * `apps/web/src/bot-identity.ts` already uses, for the same reason. It does not make us the
 * authority on anybody's rating. The signature is the record; we cannot revoke it, we cannot edit
 * it, and it is checkable by a stranger with an Ed25519 library. Our only role is having been there
 * when it happened, which is what a witness is.
 *
 * ## Why a session, and not a puzzle
 *
 * One signature per puzzle would mean a wallet prompt every forty seconds, which nobody would use.
 * A card covers a **run** of puzzles and is signed once at the end — which is also the truer
 * metaphor: a scoresheet is signed once when the game finishes, not after every move.
 *
 * ## What is in the bytes, and why
 *
 * The same three rules the scoresheet is built on (`scoresheet.ts`) apply unchanged, so the format
 * here mirrors it deliberately rather than inventing a second style:
 *
 *  1. **One text, one meaning** — a line per field, no field may contain a newline, and the parse
 *     re-serialises and compares rather than accepting anything close enough.
 *  2. **One signature proves nothing** — a card is valid only with the solver's *and* the witness's,
 *     and both must be the addresses the text itself names.
 *  3. **The order is a property of the card** — puzzle Elo is path-dependent like game Elo, so the
 *     ordering key is `endedAtBlock`, a Nimiq block height anyone can check against the chain,
 *     rather than a timestamp, which is something a server asserts.
 *
 * `chain` is inside the signed bytes because Nimiq's `sign()` has no domain separation. `ratingBefore`
 * and `ratingAfter` are inside them so a card cannot be re-pointed at a different place in somebody's
 * history after the fact — and because carrying both is what lets a recompute say *which* card broke
 * the chain rather than only that the total is wrong.
 *
 * The results are hashed rather than carried, exactly as a game's moves are: a run of fifty puzzles
 * is far too long to sign comfortably, and the hash binds the sequence without paying for it. The
 * list is served beside the card so anyone can re-derive the hash and check it against the bundled
 * set, which is public.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { toBase64Url } from './base64.ts';
import { normaliseAddress } from './scoresheet.ts';
import type { ChessChain } from './scoresheet.ts';
import { PUZZLE_FLOOR, PUZZLE_START, nextPuzzleRating } from './puzzle-set.ts';

/** The version marker. Bumping it is a new format, never a silent change to this one. */
export const PUZZLE_CARD_VERSION = 'chess/1 puzzle card';

/**
 * How the run was played.
 *
 * These are modes, not difficulty settings — what changes between them is how the server chose the
 * puzzles, which is the part a solver does not control and therefore the part worth recording.
 */
export type PuzzleMode = 'daily' | 'training' | 'themed' | 'storm' | 'streak';

const MODES = new Set<string>(['daily', 'training', 'themed', 'storm', 'streak']);

/** One attempt inside a run: which puzzle, and whether it was solved. */
export interface PuzzleAttempt {
  /** `puzzleId()` — the FEN and the line, which is the puzzle's identity in the bundled set. */
  id: string;
  /** The set's rating for it. Carried so a recompute needs the id only to check it against. */
  rating: number;
  solved: boolean;
}

export interface PuzzleCard {
  chain: ChessChain;
  /** Server-issued, 32 lowercase hex. Unique per run. */
  sessionId: string;
  /** The person who solved them. */
  solver: string;
  /** Who served the puzzles and saw the answers. A published key — see the file header. */
  witness: string;
  mode: PuzzleMode;
  /** How many puzzles were served in this run, and how many of them were solved. */
  attempted: number;
  solved: number;
  /** The solver's puzzle rating either side of this run. */
  ratingBefore: number;
  ratingAfter: number;
  /** The block height the server stamped when it issued the run. */
  startedAtBlock: number;
  /** The block height the server stamped when the run was witnessed. The ordering key. */
  endedAtBlock: number;
  /** SHA-256 of the attempt list, base64url. Binds the sequence without carrying it. */
  resultsHash: string;
}

/** Thrown for anything that is not exactly a canonical puzzle card. Never a silent coercion. */
export class PuzzleCardError extends Error {
  override readonly name = 'PuzzleCardError';
}

const encoder = new TextEncoder();

const ADDRESS = /^NQ[0-9A-Z]{34}$/;
const SESSION_ID = /^[0-9a-f]{32}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * The hash of a run's attempts.
 *
 * One attempt per line as `id`, `rating`, `1`-or-`0`, tab-separated, in the order they were served.
 * The order is part of it because the rating is path-dependent: the same puzzles solved in a
 * different order give a different number, so a hash that ignored order would let a run be
 * reshuffled into a better result without breaking the signature.
 */
export function hashAttempts(attempts: readonly PuzzleAttempt[]): string {
  const lines = attempts.map((attempt) => `${attempt.id}\t${attempt.rating}\t${attempt.solved ? 1 : 0}`);
  return toBase64Url(sha256(encoder.encode(lines.join('\n'))));
}

/**
 * The exact bytes the solver and the witness sign.
 *
 * Every field is validated here rather than at the call site, so there is one place that decides
 * what a puzzle card is and no way to construct one that skips it.
 */
export function canonicalisePuzzleCard(card: PuzzleCard): string {
  if (card.chain !== 'main' && card.chain !== 'test') {
    throw new PuzzleCardError(`chain must be main or test, got ${JSON.stringify(card.chain)}`);
  }
  if (!SESSION_ID.test(card.sessionId)) {
    throw new PuzzleCardError('sessionId must be 32 lowercase hex characters');
  }

  const solver = normaliseAddress(card.solver);
  const witness = normaliseAddress(card.witness);
  if (!ADDRESS.test(solver)) throw new PuzzleCardError(`not a Nimiq address: ${JSON.stringify(card.solver)}`);
  if (!ADDRESS.test(witness)) throw new PuzzleCardError(`not a Nimiq address: ${JSON.stringify(card.witness)}`);
  /*
   * Witnessing yourself is the whole attack this design exists to stop, and it is worth refusing
   * here rather than only in the server: the bundled puzzle set is public, so a solver who is also
   * the witness can mint any rating they like without solving anything.
   */
  if (solver === witness) throw new PuzzleCardError('a solver cannot witness their own run');

  if (!MODES.has(card.mode)) throw new PuzzleCardError(`unknown mode: ${JSON.stringify(card.mode)}`);

  assertUint('attempted', card.attempted);
  assertUint('solved', card.solved);
  assertUint('ratingBefore', card.ratingBefore);
  assertUint('ratingAfter', card.ratingAfter);
  assertUint('startedAtBlock', card.startedAtBlock);
  assertUint('endedAtBlock', card.endedAtBlock);

  if (card.attempted === 0) throw new PuzzleCardError('a run with no puzzles in it is not a run');
  if (card.solved > card.attempted) {
    throw new PuzzleCardError('more puzzles solved than were attempted');
  }
  if (card.ratingBefore < PUZZLE_FLOOR || card.ratingAfter < PUZZLE_FLOOR) {
    throw new PuzzleCardError(`a puzzle rating cannot be below ${PUZZLE_FLOOR}`);
  }
  if (card.startedAtBlock === 0) throw new PuzzleCardError('startedAtBlock must be a real block height');
  if (card.endedAtBlock === 0) throw new PuzzleCardError('endedAtBlock must be a real block height');
  /*
   * A run cannot finish before it started. Without this a card could claim a height far in the past
   * and insert itself anywhere in somebody's history, which is the ordering equivalent of a forgery.
   */
  if (card.endedAtBlock < card.startedAtBlock) {
    throw new PuzzleCardError('a run cannot end before it started');
  }

  if (!BASE64URL.test(card.resultsHash)) {
    throw new PuzzleCardError('resultsHash must be base64url');
  }

  return [
    PUZZLE_CARD_VERSION,
    card.chain,
    card.sessionId,
    solver,
    witness,
    card.mode,
    String(card.attempted),
    String(card.solved),
    String(card.ratingBefore),
    String(card.ratingAfter),
    String(card.startedAtBlock),
    String(card.endedAtBlock),
    card.resultsHash,
    '',
  ].join('\n');
}

/**
 * Read a canonical puzzle card back, refusing anything not exactly in that form.
 *
 * The re-serialise-and-compare at the end is the rule that matters, for the same reason it matters
 * in `parseScoresheet`: without it `007` and `7` would both parse to the same number, two different
 * byte strings would carry the same meaning, and a signature would stop proving which was signed.
 */
export function parsePuzzleCard(serialised: string): PuzzleCard {
  const lines = serialised.split('\n');
  if (lines.length !== 14 || lines[13] !== '') {
    throw new PuzzleCardError('a puzzle card is thirteen lines and a trailing newline');
  }
  if (lines[0] !== PUZZLE_CARD_VERSION) {
    throw new PuzzleCardError(`unknown puzzle card version: ${JSON.stringify(lines[0])}`);
  }

  const card: PuzzleCard = {
    chain: lines[1] as ChessChain,
    sessionId: lines[2] ?? '',
    solver: lines[3] ?? '',
    witness: lines[4] ?? '',
    mode: lines[5] as PuzzleMode,
    attempted: numberFrom(lines[6], 'attempted'),
    solved: numberFrom(lines[7], 'solved'),
    ratingBefore: numberFrom(lines[8], 'ratingBefore'),
    ratingAfter: numberFrom(lines[9], 'ratingAfter'),
    startedAtBlock: numberFrom(lines[10], 'startedAtBlock'),
    endedAtBlock: numberFrom(lines[11], 'endedAtBlock'),
    resultsHash: lines[12] ?? '',
  };

  if (canonicalisePuzzleCard(card) !== serialised) {
    throw new PuzzleCardError('input is not in canonical form');
  }
  return card;
}

/**
 * A digits-only integer, so `007`, `+7`, ` 7` and `7.0` are all refused rather than coerced.
 *
 * `Number()` would accept every one of them and produce 7, which is exactly how two different byte
 * strings end up meaning the same thing.
 */
function numberFrom(raw: string | undefined, field: string): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new PuzzleCardError(`${field} must be written as digits, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

function assertUint(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new PuzzleCardError(`${field} must be a whole number, got ${String(value)}`);
  }
}

/* ------------------------------------------------------------------ the rating */

/**
 * Cards in the one order everybody derives the same rating from.
 *
 * `endedAtBlock` first, then `sessionId` to break a tie. Two runs can finish in the same block —
 * Nimiq's are seconds apart and a run of five puzzles fits inside one — and without a tie-break two
 * honest people would compute two different ratings from the same cards, which would make the
 * recompute button worse than useless.
 */
export function canonicalCardOrder<T extends { endedAtBlock: number; sessionId: string }>(
  cards: readonly T[],
): T[] {
  return [...cards].sort(
    (a, b) => a.endedAtBlock - b.endedAtBlock || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
  );
}

/** What a recompute concluded about one solver's puzzle rating. */
export interface PuzzleRating {
  /** The rating the cards add up to. `PUZZLE_START` when there are none. */
  rating: number;
  /** How many runs, and how many puzzles inside them. */
  runs: number;
  attempted: number;
  solved: number;
  /**
   * The first card whose `ratingBefore` did not match the running rating, if any.
   *
   * Not thrown, because a broken chain is a **finding to display**, not a crash: the record page
   * exists to say "these cards disagree with each other, and here is the one that does it". A
   * missing card in the middle of a history is the ordinary cause and it is not the solver's fault.
   */
  brokenAt: string | null;
}

/**
 * Re-derive a solver's puzzle rating from their cards and nothing else.
 *
 * This is the puzzle half of the promise the record page makes. It takes only signed cards and the
 * attempts they name, applies the same `nextPuzzleRating` the app and the server both use, and
 * reaches a number a stranger can reach too — with our server switched off.
 *
 * `attemptsFor` supplies the run's attempt list, which is served beside the card. A run whose
 * attempts are missing still counts its `ratingAfter`, because the card is signed and the rating is
 * inside the signed bytes: refusing to read it would let anybody erase somebody's rating by
 * withholding a file.
 */
export function computePuzzleRating(
  cards: readonly PuzzleCard[],
  attemptsFor?: (card: PuzzleCard) => readonly PuzzleAttempt[] | undefined,
): PuzzleRating {
  let rating = PUZZLE_START;
  let attempted = 0;
  let solved = 0;
  let brokenAt: string | null = null;

  for (const card of canonicalCardOrder(cards)) {
    if (card.ratingBefore !== rating && brokenAt === null) brokenAt = card.sessionId;

    const attempts = attemptsFor?.(card);
    if (attempts && hashAttempts(attempts) === card.resultsHash) {
      // The attempts are present and genuinely the ones signed for: replay them.
      let running = card.ratingBefore;
      for (const attempt of attempts) running = nextPuzzleRating(running, attempt.rating, attempt.solved);
      /*
       * A card whose replayed total disagrees with its own `ratingAfter` is a broken card, and the
       * signed number is *not* preferred over the replay — the replay is the check. Reporting it is
       * the point; silently trusting either one would make the recompute a decoration.
       */
      if (running !== card.ratingAfter && brokenAt === null) brokenAt = card.sessionId;
      rating = running;
    } else {
      // No attempt list, or one that does not hash to what was signed. The card still stands.
      rating = card.ratingAfter;
    }

    attempted += card.attempted;
    solved += card.solved;
  }

  return { rating, runs: cards.length, attempted, solved, brokenAt };
}
