/**
 * Witnessed puzzle runs, on this device: starting one, finishing it, signing it, keeping it.
 *
 * This is the client half of `packages/server/src/witness.ts` and the reason a person who has never
 * met another player can still hold a rating nobody can take away. The server chooses the puzzles
 * and signs what came back; the wallet here signs the same bytes; both signatures go in the same
 * bucket the signed games already live in.
 *
 * ## Three rules this file exists to keep
 *
 *  1. **The run is stored only when both signatures exist.** A card with one is not a card, exactly
 *     as a scoresheet with one is not a scoresheet. Storing a half-signed run would put a number on
 *     the record page that nothing stands behind.
 *  2. **Nothing here decides a rating.** `ratingBefore` is read back out of the stored cards and
 *     `ratingAfter` comes from the server; this module never computes one to display. The one place
 *     a rating is derived is `computePuzzleRating`, which a stranger runs too.
 *  3. **An unwitnessed run is still a run.** With no witness — no server, no key, offline — puzzles
 *     work exactly as they always have and simply do not rate. That is the same rule Lichess
 *     applies, and it is the honest one: a rating nobody observed is a number somebody typed.
 *
 * Storage is `localStorage`, guarded everywhere, for the same reasons `store.ts` gives: private mode
 * throws, the origin is shared, and a chess app that will not open because it cannot save is worse
 * than one that forgets.
 */

import {
  PUZZLE_START,
  canonicalisePuzzleCard,
  computePuzzleRating,
  parsePuzzleCard,
  sameAddress,
  type PuzzleAttempt,
  type PuzzleCard,
  type PuzzleMode,
  type PuzzleRating,
} from '@scoresheet/core';

import { apiBase } from './online.ts';
import { signText } from './wallet.ts';

/** One witnessed run, kept exactly as it was signed. */
export interface StoredCard {
  /** The exact bytes the solver and the witness both signed. Verbatim, never rebuilt from fields. */
  canonical: string;
  signatures: {
    solver?: { publicKeyHex: string; signatureHex: string };
    witness?: { publicKeyHex: string; signatureHex: string };
  };
  /** The puzzles and outcomes, so anyone can re-derive the hash inside the signed text. */
  attempts: PuzzleAttempt[];
  /** When this device recorded it. Never signed, never used for ordering — that is `endedAtBlock`. */
  savedAt: number;
}

const KEY = 'scoresheet:puzzle-cards';

function read(): StoredCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    /*
     * Every row is validated the way `store.ts` validates a game, and for the reason written there
     * at length: a reader that walks `signatures` on a row where it is missing throws, and one bad
     * row written by an older version of this app kills the screen for good.
     */
    return parsed.filter((entry): entry is StoredCard => {
      if (typeof entry !== 'object' || entry === null) return false;
      const card = entry as StoredCard;
      if (typeof card.canonical !== 'string') return false;
      if (typeof card.signatures !== 'object' || card.signatures === null) return false;
      if (!Array.isArray(card.attempts)) return false;
      try {
        parsePuzzleCard(card.canonical);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function write(cards: readonly StoredCard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    // Storage full or refused. The run happened and was signed; it simply is not remembered here.
  }
}

/** Every witnessed run this device knows about. */
export function allCards(): StoredCard[] {
  return read();
}

/** The cards, parsed, for anything that wants the fields rather than the bytes. */
export function allParsedCards(): PuzzleCard[] {
  const out: PuzzleCard[] = [];
  for (const stored of read()) {
    try {
      out.push(parsePuzzleCard(stored.canonical));
    } catch {
      // Unreachable — `read` already parsed it — and cheaper than making the reader handle it.
    }
  }
  return out;
}

/** One person's runs. */
export function cardsFor(address: string): StoredCard[] {
  return read().filter((stored) => {
    try {
      return sameAddress(parsePuzzleCard(stored.canonical).solver, address);
    } catch {
      return false;
    }
  });
}

/**
 * A person's puzzle rating, re-derived from their cards rather than remembered.
 *
 * The attempts are handed in so the recompute can replay each run rather than take the card's word
 * for where it ended — which is the whole difference between a rating that is checked and a number
 * that is displayed.
 */
export function puzzleRatingFor(address: string): PuzzleRating {
  const stored = cardsFor(address);
  const attempts = new Map<string, PuzzleAttempt[]>();
  const cards: PuzzleCard[] = [];

  for (const row of stored) {
    try {
      const card = parsePuzzleCard(row.canonical);
      cards.push(card);
      attempts.set(card.sessionId, row.attempts);
    } catch {
      // Already filtered by `read`.
    }
  }

  return computePuzzleRating(cards, (card) => attempts.get(card.sessionId));
}

/** Save a run. Refuses anything that is not a fully signed card, for the reason in the header. */
export function saveCard(input: {
  card: PuzzleCard;
  canonical: string;
  attempts: PuzzleAttempt[];
  solver: { publicKeyHex: string; signatureHex: string };
  witness: { publicKeyHex: string; signatureHex: string };
}): void {
  // Rebuilt and compared rather than trusted: a canonical string that does not match its own fields
  // would be stored verbatim and verify against nothing.
  if (canonicalisePuzzleCard(input.card) !== input.canonical) return;

  const cards = read().filter((stored) => {
    try {
      return parsePuzzleCard(stored.canonical).sessionId !== input.card.sessionId;
    } catch {
      return true;
    }
  });

  cards.push({
    canonical: input.canonical,
    signatures: { solver: input.solver, witness: input.witness },
    attempts: input.attempts,
    savedAt: Date.now(),
  });
  write(cards);
}

/** Forget every run. Used by the settings sheet, beside the one that forgets games. */
export function forgetCards(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing worth telling anybody about.
  }
}

/* ------------------------------------------------------------------ talking to the witness */

const API: string = apiBase();

async function ask<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });

  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    /*
     * The server's own sentence, when it sent one.
     *
     * Its refusals are the interesting half — "those are not the puzzles that were served" is a
     * fact the person should see, and replacing it with a generic failure would hide the defence
     * doing its job. Anything unrecognisable gets our sentence rather than a raw payload on screen.
     */
    const message =
      typeof parsed === 'object' && parsed !== null && typeof (parsed as PossibleError).error?.message === 'string'
        ? (parsed as PossibleError).error!.message!
        : 'That run could not be witnessed.';
    throw new WitnessRefused(message);
  }
  return parsed as T;
}

interface PossibleError {
  error?: { message?: string };
}

/** A refusal from the witness, carrying the sentence the server wrote. */
export class WitnessRefused extends Error {
  override readonly name = 'WitnessRefused';
}

/** Whether runs can be rated at all here, and by whom. Asked before a run, never after. */
export async function witnessStatus(): Promise<{ available: boolean; address?: string }> {
  try {
    return await ask<{ available: boolean; address?: string }>('/api/puzzles/witness');
  } catch {
    // No server, or offline. Not an error worth showing: puzzles work, they just do not rate.
    return { available: false };
  }
}

export interface OpenRun {
  sessionId: string;
  puzzles: { id: string; rating: number }[];
}

/** Ask the witness to serve a run. The client never chooses the puzzles — that is the mechanism. */
export async function startRun(options: {
  address: string;
  mode: PuzzleMode;
  count: number;
  ratingBefore: number;
  theme?: string | undefined;
  seen?: readonly string[] | undefined;
  day?: string | undefined;
}): Promise<OpenRun> {
  return await ask<OpenRun>('/api/puzzles/session', {
    address: options.address,
    mode: options.mode,
    count: options.count,
    ratingBefore: options.ratingBefore,
    theme: options.theme,
    // Capped here as well as on the server: no reason to put a megabyte on the wire either.
    seen: options.seen ? [...options.seen].slice(-2_000) : undefined,
    day: options.day,
  });
}

export interface WitnessedRun {
  card: PuzzleCard;
  canonical: string;
  attempts: PuzzleAttempt[];
  signature: { publicKeyHex: string; signatureHex: string };
}

/** Hand the results back and get the witness's signature over the card. */
export async function finishRun(
  sessionId: string,
  results: readonly { id: string; solved: boolean; ms: number }[],
): Promise<WitnessedRun> {
  return await ask<WitnessedRun>('/api/puzzles/finish', { sessionId, results });
}

export type SignRunOutcome =
  | { ok: true; rating: number }
  | { ok: false; message: string; tone: 'calm' | 'bad' };

/**
 * Sign a witnessed run with this person's own wallet, and keep it.
 *
 * The wallet is asked at the *end* of a run and never at the start, which is the rule the whole app
 * follows: solve first, connect only when there is something worth signing. Declining costs the
 * rating for that run and nothing else — the puzzles were still solved, and the screen says so.
 */
export async function signRun(run: WitnessedRun): Promise<SignRunOutcome> {
  try {
    const signature = await signText(run.canonical);
    saveCard({
      card: run.card,
      canonical: run.canonical,
      attempts: run.attempts,
      solver: signature,
      witness: run.signature,
    });
    return { ok: true, rating: run.card.ratingAfter };
  } catch (error) {
    return { ok: false, ...explainSigning(error) };
  }
}

/**
 * What went wrong, in a sentence somebody can act on.
 *
 * Kept here rather than shared with `sign-game.ts` because the wording differs where it matters: a
 * declined signature after a game means the game is unrecorded, and after a run it means the rating
 * did not move. Same cause, different consequence, so the same sentence would be wrong in one of
 * the two places.
 */
function explainSigning(error: unknown): { message: string; tone: 'calm' | 'bad' } {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancel|declin/i.test(text)) {
    return { message: 'You did not sign, so this run did not change your rating.', tone: 'calm' };
  }
  return { message: 'Your wallet could not sign this run. The puzzles still count as solved.', tone: 'bad' };
}

/** The rating a run should start from: the last card's, or the start when there are none. */
export function ratingBeforeFor(address: string): number {
  const found = puzzleRatingFor(address);
  return found.runs === 0 ? PUZZLE_START : found.rating;
}
