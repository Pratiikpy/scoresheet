/**
 * Verifying a whole portable record — signatures included.
 *
 * `@scoresheet/core`'s `checkBundle` answers everything that needs no key: does each record parse,
 * is it canonical, does it name this player, do the declared Merkle roots match the contents, is the
 * anchor internally consistent. This file adds the half that needs real Ed25519, and it lives here
 * for the same reason the rest of this package does — `@nimiq/core` is a WASM bundle with no
 * business in a phone's download.
 *
 * **The order of the two halves is deliberate.** Structure first, signatures second. Signature
 * verification is the expensive operation and a bundle that fails the cheap structural checks is not
 * worth spending it on; more importantly, a record thrown out for being somebody else's game should
 * be reported as *that*, not as a signature problem, because the two mean very different things to
 * the person reading the result.
 *
 * **Nothing here is fatal on its own.** A bundle with one bad signature is not "invalid" — it is a
 * bundle with one bad signature and forty good ones, and a verifier that collapses that to a red
 * cross has destroyed the information the reader actually wanted. So every failure is itemised, the
 * surviving set is returned, and the rating is recomputed over the survivors alone.
 */

import {
  canonicalisePuzzleCard,
  canonicaliseScoresheet,
  checkBundle,
  computePuzzleRating,
  computeRatings,
  normaliseAddress,
  toRatedGame,
  type PuzzleRating,
  type RatingBundle,
  type RejectedRecord,
  type Scoresheet,
} from '@scoresheet/core';
import { verifySignedText, type VerificationResult } from './index.ts';

export interface BundleRecordFailure {
  kind: 'scoresheet' | 'puzzle-card';
  /** Which record, by its own id, so the reader can find it. */
  id: string;
  /** Which signature failed. Both are checked; the first failure is named. */
  side: string;
  detail: string;
}

export interface BundleVerification {
  /** The player this record claims to belong to. */
  address: string;

  /** Records that parsed, belong to this player, and carry two good signatures. */
  goodScoresheets: Scoresheet[];
  goodPuzzleCards: number;

  /** Structural rejections, from `checkBundle`. */
  rejected: RejectedRecord[];
  /** Signature rejections, found here. */
  badSignatures: BundleRecordFailure[];

  /**
   * Does the bundle's declared root match what its own contents hash to?
   *
   * Recomputed over the *structurally valid* set, matching `checkBundle`. A bundle whose signatures
   * are all genuine but whose root does not match its contents is a specific and different kind of
   * untrustworthy from one with a forged signature, and the reader is told which.
   */
  scoresheetRootMatches: boolean;
  puzzleCardRootMatches: boolean;

  anchorPresent: boolean;
  anchorConsistent: boolean;

  /** Recomputed from the surviving records. This is the number; there is no other. */
  rating: number;
  ratedGames: number;
  distinctOpponents: number;
  established: boolean;
  puzzleRating: PuzzleRating | null;

  /**
   * True when every record survived both halves and every root matched.
   *
   * Deliberately **not** a claim that the record is complete — nothing in this file can establish
   * that, and `completenessCaveat` says so in words a person can read.
   */
  intact: boolean;
  completenessCaveat: string;
}

/**
 * The sentence that has to appear next to any verified record.
 *
 * Written once, here, so that no screen can quietly drop it while still showing the tick.
 */
export const COMPLETENESS_CAVEAT =
  'These games happened and have not been altered. This does not prove the list is complete — ' +
  'a player can leave a loss out of a record they publish themselves.';

/** Verify a bundle end to end: structure, then every signature, then the rating. */
export function verifyBundle(bundle: RatingBundle): BundleVerification {
  const structure = checkBundle(bundle);
  const badSignatures: BundleRecordFailure[] = [];

  const goodScoresheets: Scoresheet[] = [];
  for (const sheet of structure.scoresheets) {
    const text = canonicaliseScoresheet(sheet);
    const entry = bundle.scoresheets.find((candidate) => candidate.text === text);
    if (entry === undefined) {
      badSignatures.push({ kind: 'scoresheet', id: sheet.gameId, side: 'both', detail: 'no signatures were carried for this game' });
      continue;
    }

    const white = verifySignedText({ text, ...entry.white, expectedAddress: sheet.white });
    const black = verifySignedText({ text, ...entry.black, expectedAddress: sheet.black });
    if (!white.ok || !black.ok) {
      const failed: [string, VerificationResult] = white.ok ? ['black', black] : ['white', white];
      badSignatures.push({
        kind: 'scoresheet',
        id: sheet.gameId,
        side: failed[0],
        detail: failed[1].detail ?? 'that signature did not verify',
      });
      continue;
    }
    goodScoresheets.push(sheet);
  }

  const goodCards: typeof structure.puzzleCards = [];
  for (const card of structure.puzzleCards) {
    const text = canonicalisePuzzleCard(card);
    const entry = bundle.puzzleCards.find((candidate) => candidate.text === text);
    if (entry === undefined) {
      badSignatures.push({ kind: 'puzzle-card', id: card.sessionId, side: 'both', detail: 'no signatures were carried for this run' });
      continue;
    }

    const solver = verifySignedText({ text, ...entry.solver, expectedAddress: card.solver });
    const witness = verifySignedText({ text, ...entry.witness, expectedAddress: card.witness });
    if (!solver.ok || !witness.ok) {
      const failed: [string, VerificationResult] = solver.ok ? ['witness', witness] : ['solver', solver];
      badSignatures.push({
        kind: 'puzzle-card',
        id: card.sessionId,
        side: failed[0],
        detail: failed[1].detail ?? 'that signature did not verify',
      });
      continue;
    }
    goodCards.push(card);
  }

  // The rating, recomputed from the survivors. Never read from the bundle — a bundle that carried
  // its own rating would be asking to be believed, which is the thing this whole design refuses.
  const owner = normaliseAddress(bundle.address);
  const ratings = computeRatings(goodScoresheets.map(toRatedGame));
  const mine = ratings.get(owner);
  const puzzleRating = goodCards.length > 0 ? computePuzzleRating(goodCards) : null;

  const intact =
    structure.rejected.length === 0 &&
    badSignatures.length === 0 &&
    structure.scoresheetRootMatches &&
    structure.puzzleCardRootMatches &&
    structure.anchorConsistent;

  return {
    address: owner,
    goodScoresheets,
    goodPuzzleCards: goodCards.length,
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
    puzzleRating,
    intact,
    completenessCaveat: COMPLETENESS_CAVEAT,
  };
}
