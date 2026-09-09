/**
 * Checking somebody else's record, here, in this browser.
 *
 * `@scoresheet/verify` does this on a server with `@nimiq/core`, and that package must never reach a
 * phone: it is a Rust-to-WASM bundle, and the whole argument of this screen is that checking a record
 * costs a stranger nothing. So this is the same algorithm over `verify-browser.ts`'s Ed25519 —
 * `@noble/ed25519` and `@noble/hashes`, already in the bundle, no WASM, no download, no server.
 *
 * **The result is itemised, never a verdict.** A record with one forged signature and forty good
 * ones is not "invalid"; it is forty good games and one forgery, and collapsing that into a red
 * cross throws away the only information the reader wanted. Every rejection is named, the survivors
 * are still counted, and the rating is recomputed over the survivors alone.
 *
 * **And the caveat travels with the tick.** Signatures prove the games happened and were not
 * altered. They cannot prove the list is complete, because no signature can see an absence — a
 * player can leave a loss out before ever committing to anything. That sentence is returned as data
 * rather than written on one screen, so no future screen can show the tick without it.
 */

import {
  canonicalisePuzzleCard,
  canonicaliseScoresheet,
  checkBundle,
  computePuzzleRating,
  computeRatings,
  normaliseAddress,
  toRatedGame,
  BUNDLE_VERSION,
  type PuzzleRating,
  type RatingBundle,
  type RejectedRecord,
  type Scoresheet,
} from '@scoresheet/core';
import { verifyPuzzleCardInBrowser, verifyScoresheetInBrowser } from './verify-browser.ts';

export interface BundleRecordFailure {
  kind: 'scoresheet' | 'puzzle-card';
  id: string;
  side: string;
}

export interface BundleReport {
  address: string;
  chain: string;
  goodGames: Scoresheet[];
  goodRuns: number;
  rejected: RejectedRecord[];
  badSignatures: BundleRecordFailure[];
  scoresheetRootMatches: boolean;
  puzzleCardRootMatches: boolean;
  anchorPresent: boolean;
  anchorConsistent: boolean;
  rating: number;
  ratedGames: number;
  distinctOpponents: number;
  established: boolean;
  puzzleRating: PuzzleRating | null;
  /** Everything survived, every root matched, and any anchor was coherent. */
  intact: boolean;
}

/**
 * Is this JSON even a record?
 *
 * Deliberately strict and deliberately separate from verification: telling somebody "this is not a
 * Scoresheet record" is a different and more useful message than "nothing in this record verified",
 * and a parser that shrugged at a missing field would produce the second when it meant the first.
 */
export function readBundle(text: string): RatingBundle | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Partial<RatingBundle>;
  if (candidate.version !== BUNDLE_VERSION) return null;
  if (typeof candidate.address !== 'string') return null;
  if (!Array.isArray(candidate.scoresheets) || !Array.isArray(candidate.puzzleCards)) return null;
  if (typeof candidate.completeness !== 'object' || candidate.completeness === null) return null;

  return candidate as RatingBundle;
}

/** Verify a whole record: structure first, then every signature, then the rating. */
export async function verifyBundleInBrowser(bundle: RatingBundle): Promise<BundleReport> {
  // Structure first. It is free, and a record thrown out for being somebody else's game must be
  // reported as *that* rather than as a signature problem — the two mean very different things.
  const structure = checkBundle(bundle);
  const badSignatures: BundleRecordFailure[] = [];
  const goodGames: Scoresheet[] = [];

  for (const sheet of structure.scoresheets) {
    const text = canonicaliseScoresheet(sheet);
    const entry = bundle.scoresheets.find((candidate) => candidate.text === text);
    if (!entry) {
      badSignatures.push({ kind: 'scoresheet', id: sheet.gameId, side: 'both' });
      continue;
    }
    const result = await verifyScoresheetInBrowser(text, { white: entry.white, black: entry.black });
    if (result.ok && result.sheet) goodGames.push(result.sheet);
    else badSignatures.push({ kind: 'scoresheet', id: sheet.gameId, side: result.white.ok ? 'black' : 'white' });
  }

  const goodCards: typeof structure.puzzleCards = [];
  for (const card of structure.puzzleCards) {
    const text = canonicalisePuzzleCard(card);
    const entry = bundle.puzzleCards.find((candidate) => candidate.text === text);
    if (!entry) {
      badSignatures.push({ kind: 'puzzle-card', id: card.sessionId, side: 'both' });
      continue;
    }
    const result = await verifyPuzzleCardInBrowser(text, { solver: entry.solver, witness: entry.witness });
    if (result.ok && result.card) goodCards.push(result.card);
    else badSignatures.push({ kind: 'puzzle-card', id: card.sessionId, side: result.solver.ok ? 'witness' : 'solver' });
  }

  /*
   * The rating, from the survivors, computed here.
   *
   * Never read from the file. A record that carried its own rating would be asking to be believed,
   * and being believed is precisely what this format is designed to make unnecessary.
   */
  const owner = normaliseAddress(bundle.address);
  const mine = computeRatings(goodGames.map(toRatedGame)).get(owner);

  return {
    address: owner,
    chain: bundle.chain,
    goodGames,
    goodRuns: goodCards.length,
    rejected: structure.rejected,
    badSignatures,
    scoresheetRootMatches: structure.scoresheetRootMatches,
    puzzleCardRootMatches: structure.puzzleCardRootMatches,
    anchorPresent: structure.anchorPresent,
    anchorConsistent: structure.anchorConsistent,
    rating: mine?.rating ?? 0,
    ratedGames: mine?.games ?? 0,
    distinctOpponents: mine?.distinctOpponents ?? 0,
    established: mine?.established ?? false,
    puzzleRating: goodCards.length > 0 ? computePuzzleRating(goodCards) : null,
    intact:
      structure.rejected.length === 0 &&
      badSignatures.length === 0 &&
      structure.scoresheetRootMatches &&
      structure.puzzleCardRootMatches &&
      structure.anchorConsistent,
  };
}
