/**
 * The portable record — a whole chess history in one file, provable without us.
 *
 * A single signed scoresheet already proves one game happened, and `verify-browser.ts` checks one in
 * a stranger's browser with our server switched off. That is the hard part and it was already done.
 * What did not exist is the *record*: the set, in an order nobody can argue with, committed to in a
 * way that makes a later edit detectable.
 *
 * ## Why a Merkle root and not a signature over the list
 *
 * Signing the list would work and would be simpler, and it would also be a claim by us — one more
 * key a verifier has to decide whether to trust. A Merkle root is a claim by *arithmetic*: anybody
 * holding the leaves recomputes it and either gets the same 32 bytes or does not. It also gives
 * inclusion proofs for free, so a player can later prove one game is in their record without handing
 * over the whole record — which is the difference between showing a certificate and opening a diary.
 *
 * The construction is RFC 9162's (Certificate Transparency), written from the RFC rather than from
 * anybody's code:
 *
 *   leaf   = SHA-256(0x00 ‖ utf8(canonical text))
 *   parent = SHA-256(0x01 ‖ left ‖ right),  splitting at the largest power of two below n
 *
 * The domain-separation bytes are the whole point of the design and the thing naive trees omit:
 * without them a leaf can be forged to look like an interior node, and a tree with 2n leaves can be
 * made to collide with one of n. `0x00` and `0x01` cost one byte each and close that entirely.
 *
 * ## Two roots, never one
 *
 * Scoresheets and puzzle cards start from different constants — `STARTING_RATING` against
 * `PUZZLE_START` — and are ordered by different keys. Merging them into one sequence would produce a
 * root that is fine and a rating that is silently wrong for whichever stream got interleaved. So the
 * bundle carries two trees and the code refuses to build one tree over both.
 *
 * ## What this proves, and the part that must be said out loud
 *
 * It proves the set has not been *edited* since it was committed to, and that every record in it was
 * signed by the people it names. **It does not prove the set is complete.** A player can withhold
 * their losses before any commitment exists, and no signature scheme can see an absence. Certificate
 * Transparency states the same limit about its own logs. Anchoring per game rather than per session
 * narrows the window a loss can hide in from a whole history to a single game, which is a real
 * improvement and still not a proof — and `verifyBundle` returns that distinction rather than
 * flattening it into a tick.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { fromBase64Url, toBase64Url } from './base64.ts';
import {
  canonicalCardOrder,
  canonicalisePuzzleCard,
  parsePuzzleCard,
  type PuzzleCard,
} from './puzzlecard.ts';
import {
  canonicaliseScoresheet,
  normaliseAddress,
  parseScoresheet,
  sideOf,
  type ChessChain,
  type Scoresheet,
} from './scoresheet.ts';
import { canonicalOrder } from './elo.ts';

/** The first line of a bundle, and the thing a future format must change. */
export const BUNDLE_VERSION = 'chess/1 rating-bundle';

/**
 * The transaction data an anchor writes.
 *
 * A Nimiq basic transaction's data field holds **64 bytes** — verified, not assumed — and a raw
 * root is 32. Prefixing a short tag leaves the encoding self-describing inside that budget and
 * costs nothing: a stranger reading the chain can tell a Scoresheet anchor from arbitrary bytes.
 */
export const ANCHOR_TAG = 'chess/1 anchor ';

/** One signature, in the shape `signature.ts` already normalises to. */
export interface BundleSignature {
  publicKeyHex: string;
  signatureHex: string;
}

/** A scoresheet as it travels: the exact text that was signed, plus both signatures. */
export interface BundledScoresheet {
  text: string;
  white: BundleSignature;
  black: BundleSignature;
}

/** A puzzle card as it travels. */
export interface BundledPuzzleCard {
  text: string;
  solver: BundleSignature;
  witness: BundleSignature;
}

export interface BundleCompleteness {
  /** Base64url, 32 bytes. Empty string when there are no scoresheets. */
  scoresheetRoot: string;
  /** Base64url, 32 bytes. Empty string when there are no puzzle cards. */
  puzzleCardRoot: string;
  /** Written down so a verifier never has to guess which order produced the roots. */
  leafOrder: string;
  anchorTxHash?: string;
  anchoredAtBlock?: number;
}

export interface RatingBundle {
  version: string;
  chain: ChessChain;
  /** Whose record this claims to be. Every retained record must name this address. */
  address: string;
  generatedAtBlock: number;
  scoresheets: BundledScoresheet[];
  puzzleCards: BundledPuzzleCard[];
  completeness: BundleCompleteness;
}

export class BundleError extends Error {
  override name = 'BundleError';
}

/* ------------------------------------------------------------------ the tree */

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

function leafHash(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const buffer = new Uint8Array(1 + body.length);
  buffer[0] = LEAF_PREFIX;
  buffer.set(body, 1);
  return sha256(buffer);
}

function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(1 + left.length + right.length);
  buffer[0] = NODE_PREFIX;
  buffer.set(left, 1);
  buffer.set(right, 1 + left.length);
  return sha256(buffer);
}

/**
 * The largest power of two strictly less than `n`.
 *
 * RFC 9162 splits here rather than in the middle. It matters: a middle split produces a different
 * tree for the same leaves, so two implementations that disagree about this disagree about every
 * root they ever compute, while both look correct in isolation.
 */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function treeHash(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256(new Uint8Array(0));
  if (leaves.length === 1) return leaves[0]!;
  const k = splitPoint(leaves.length);
  return nodeHash(treeHash(leaves.slice(0, k)), treeHash(leaves.slice(k)));
}

/**
 * The Merkle root over a list of already-canonical texts, base64url.
 *
 * An empty list returns an empty string rather than the hash of nothing. A verifier comparing
 * `''` against `''` learns "there were none"; comparing two identical hashes-of-nothing learns the
 * same thing in a way that looks like a real commitment, and looking like a commitment when there is
 * nothing committed is exactly the kind of thing this file exists to avoid.
 */
export function merkleRoot(texts: readonly string[]): string {
  if (texts.length === 0) return '';
  return toBase64Url(treeHash(texts.map(leafHash)));
}

/**
 * An inclusion proof for leaf `index`: the sibling hashes, bottom upwards.
 *
 * This is what lets a player prove one game is in their record without handing over the record.
 */
export function inclusionProof(texts: readonly string[], index: number): string[] {
  if (index < 0 || index >= texts.length) {
    throw new BundleError(`no leaf at index ${index} of ${texts.length}`);
  }
  const path: string[] = [];
  const walk = (leaves: readonly Uint8Array[], at: number): void => {
    if (leaves.length <= 1) return;
    const k = splitPoint(leaves.length);
    if (at < k) {
      path.push(toBase64Url(treeHash(leaves.slice(k))));
      walk(leaves.slice(0, k), at);
    } else {
      path.push(toBase64Url(treeHash(leaves.slice(0, k))));
      walk(leaves.slice(k), at - k);
    }
  };
  walk(texts.map(leafHash), index);
  return path;
}

/**
 * Check an inclusion proof without holding the rest of the leaves.
 *
 * **This mirrors `inclusionProof` exactly, and it has to.** That function walks the tree downwards,
 * pushing the sibling it steps past at each level, so the path reads top-first. The obvious verifier
 * — start at the leaf, fold the path in order — walks the other way and silently disagrees the
 * moment a tree is deeper than two levels. That was the first version of this function, and the
 * size-1-to-9 test below is what caught it.
 *
 * So the recursion here is the prover's, run backwards: descend to the leaf consuming one sibling
 * per level, then combine on the way back up. The cursor must land exactly on the end of the path —
 * a proof with a spare hash on it is refused rather than ignored.
 */
export function verifyInclusion(
  text: string,
  index: number,
  total: number,
  path: readonly string[],
  root: string,
): boolean {
  if (index < 0 || index >= total || total < 1) return false;

  const sibling = (at: number): Uint8Array | null => {
    const encoded = path[at];
    if (encoded === undefined) return null;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64Url(encoded);
    } catch {
      return null;
    }
    // A sibling is a SHA-256 digest or the proof is not a proof. Length-checking here stops a short
    // value from being padded into agreement further up the tree.
    return bytes.length === 32 ? bytes : null;
  };

  const climb = (at: number, size: number, cursor: number): Uint8Array | null => {
    if (size <= 1) return cursor === path.length ? leafHash(text) : null;

    const k = splitPoint(size);
    const other = sibling(cursor);
    if (other === null) return null;

    const below = at < k ? climb(at, k, cursor + 1) : climb(at - k, size - k, cursor + 1);
    if (below === null) return null;

    return at < k ? nodeHash(below, other) : nodeHash(other, below);
  };

  const computed = climb(index, total, 0);
  return computed !== null && toBase64Url(computed) === root;
}

/* ------------------------------------------------------------------ building one */

export interface BuildBundleOptions {
  chain: ChessChain;
  address: string;
  generatedAtBlock: number;
  scoresheets: readonly BundledScoresheet[];
  puzzleCards: readonly BundledPuzzleCard[];
  anchorTxHash?: string | undefined;
  anchoredAtBlock?: number | undefined;
}

/**
 * Build a bundle, putting both streams into canonical order first.
 *
 * The ordering is not a convenience — it is the reason two people computing this root agree. Both
 * orders come from fields inside the signed text, so a server that reordered them would need every
 * player to have signed the new order.
 */
export function buildBundle(options: BuildBundleOptions): RatingBundle {
  const sheets = options.scoresheets.map((entry) => ({ entry, parsed: parseScoresheet(entry.text) }));
  const cards = options.puzzleCards.map((entry) => ({ entry, parsed: parsePuzzleCard(entry.text) }));

  const orderedSheets = canonicalOrder(sheets.map((s) => ({ ...s.parsed, __entry: s.entry })));
  const orderedCards = canonicalCardOrder(cards.map((c) => ({ ...c.parsed, __entry: c.entry })));

  const sheetEntries = orderedSheets.map((s) => (s as unknown as { __entry: BundledScoresheet }).__entry);
  const cardEntries = orderedCards.map((c) => (c as unknown as { __entry: BundledPuzzleCard }).__entry);

  return {
    version: BUNDLE_VERSION,
    chain: options.chain,
    address: normaliseAddress(options.address),
    generatedAtBlock: options.generatedAtBlock,
    scoresheets: sheetEntries,
    puzzleCards: cardEntries,
    completeness: {
      scoresheetRoot: merkleRoot(sheetEntries.map((e) => e.text)),
      puzzleCardRoot: merkleRoot(cardEntries.map((e) => e.text)),
      leafOrder: 'endedAtBlock asc, then gameId or sessionId asc — canonicalOrder / canonicalCardOrder',
      ...(options.anchorTxHash === undefined ? {} : { anchorTxHash: options.anchorTxHash }),
      ...(options.anchoredAtBlock === undefined ? {} : { anchoredAtBlock: options.anchoredAtBlock }),
    },
  };
}

/** The exact 47 bytes an anchor transaction should carry. Fits the 64-byte data field with room. */
export function anchorData(root: string): string {
  return ANCHOR_TAG + root;
}

/* ------------------------------------------------------------------ reading one back */

export type BundleRejection =
  | 'malformed-record'
  | 'not-this-players-record'
  | 'wrong-chain';

export interface RejectedRecord {
  kind: 'scoresheet' | 'puzzle-card';
  index: number;
  reason: BundleRejection;
  detail: string;
}

export interface BundleCheck {
  /** Every record that parsed, named this player and matched the bundle's chain. */
  scoresheets: Scoresheet[];
  puzzleCards: PuzzleCard[];
  /** Thrown out, with the reason. Never silently dropped. */
  rejected: RejectedRecord[];
  /** Recomputed from what survived. */
  scoresheetRoot: string;
  puzzleCardRoot: string;
  /** Whether each recomputed root matches the one the bundle declares. */
  scoresheetRootMatches: boolean;
  puzzleCardRootMatches: boolean;
  /**
   * True only when an anchor is present *and* it cannot be internally inconsistent — an anchor
   * claimed at a block earlier than a game it commits to is a contradiction on its face, and is
   * caught here without needing a node.
   */
  anchorConsistent: boolean;
  anchorPresent: boolean;
}

/**
 * Structural verification: everything that can be established without a network or a key.
 *
 * Signature checking lives in `@scoresheet/verify`, because it needs real Ed25519 and this package
 * stays dependency-light so it can run anywhere. The split is deliberate: this function answers
 * "is this bundle internally coherent", and a bundle that fails here is not worth the cost of
 * checking signatures on.
 */
export function checkBundle(bundle: RatingBundle): BundleCheck {
  if (bundle.version !== BUNDLE_VERSION) {
    throw new BundleError(`unknown bundle version: ${JSON.stringify(bundle.version)}`);
  }

  const owner = normaliseAddress(bundle.address);
  const rejected: RejectedRecord[] = [];
  const sheets: { parsed: Scoresheet; text: string }[] = [];
  const cards: { parsed: PuzzleCard; text: string }[] = [];

  bundle.scoresheets.forEach((entry, index) => {
    let parsed: Scoresheet;
    try {
      parsed = parseScoresheet(entry.text);
    } catch (error) {
      rejected.push({ kind: 'scoresheet', index, reason: 'malformed-record', detail: String((error as Error).message) });
      return;
    }
    if (parsed.chain !== bundle.chain) {
      rejected.push({ kind: 'scoresheet', index, reason: 'wrong-chain', detail: `record is on ${parsed.chain}` });
      return;
    }
    if (sideOf(parsed, owner) === null) {
      rejected.push({ kind: 'scoresheet', index, reason: 'not-this-players-record', detail: 'neither player is the bundle owner' });
      return;
    }
    // Re-serialising and comparing is what makes "canonical" mean something. A record that parses
    // but does not round-trip would hash differently for the next reader.
    if (canonicaliseScoresheet(parsed) !== entry.text) {
      rejected.push({ kind: 'scoresheet', index, reason: 'malformed-record', detail: 'text is not canonical' });
      return;
    }
    sheets.push({ parsed, text: entry.text });
  });

  bundle.puzzleCards.forEach((entry, index) => {
    let parsed: PuzzleCard;
    try {
      parsed = parsePuzzleCard(entry.text);
    } catch (error) {
      rejected.push({ kind: 'puzzle-card', index, reason: 'malformed-record', detail: String((error as Error).message) });
      return;
    }
    if (parsed.chain !== bundle.chain) {
      rejected.push({ kind: 'puzzle-card', index, reason: 'wrong-chain', detail: `record is on ${parsed.chain}` });
      return;
    }
    if (normaliseAddress(parsed.solver) !== owner) {
      rejected.push({ kind: 'puzzle-card', index, reason: 'not-this-players-record', detail: 'the solver is somebody else' });
      return;
    }
    if (canonicalisePuzzleCard(parsed) !== entry.text) {
      rejected.push({ kind: 'puzzle-card', index, reason: 'malformed-record', detail: 'text is not canonical' });
      return;
    }
    cards.push({ parsed, text: entry.text });
  });

  const orderedSheets = canonicalOrder(sheets.map((s) => ({ ...s.parsed, __text: s.text })));
  const orderedCards = canonicalCardOrder(cards.map((c) => ({ ...c.parsed, __text: c.text })));

  const scoresheetRoot = merkleRoot(orderedSheets.map((s) => (s as unknown as { __text: string }).__text));
  const puzzleCardRoot = merkleRoot(orderedCards.map((c) => (c as unknown as { __text: string }).__text));

  const anchorPresent = bundle.completeness.anchorTxHash !== undefined;
  const anchoredAt = bundle.completeness.anchoredAtBlock;
  const latest = Math.max(
    0,
    ...sheets.map((s) => s.parsed.endedAtBlock),
    ...cards.map((c) => c.parsed.endedAtBlock),
  );
  const anchorConsistent = !anchorPresent || (anchoredAt !== undefined && anchoredAt >= latest);

  return {
    scoresheets: orderedSheets.map((s) => {
      const { __text, ...rest } = s as unknown as Scoresheet & { __text: string };
      return rest as Scoresheet;
    }),
    puzzleCards: orderedCards.map((c) => {
      const { __text, ...rest } = c as unknown as PuzzleCard & { __text: string };
      return rest as PuzzleCard;
    }),
    rejected,
    scoresheetRoot,
    puzzleCardRoot,
    scoresheetRootMatches: scoresheetRoot === bundle.completeness.scoresheetRoot,
    puzzleCardRootMatches: puzzleCardRoot === bundle.completeness.puzzleCardRoot,
    anchorConsistent,
    anchorPresent,
  };
}
