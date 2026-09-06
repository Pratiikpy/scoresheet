/**
 * The scoresheet — the object this whole product exists to produce.
 *
 * In over-the-board chess the scoresheet is the paper both players write the moves on, and both of
 * them sign it at the end to agree the result. This is that object with the signature made real:
 * one canonical text per finished game, signed by both wallets, from which a rating can be derived
 * by anybody with an Ed25519 library and no help from us.
 *
 * Three properties have to hold for that claim to be true rather than marketing, and every rule
 * below serves one of them:
 *
 *  1. **One text, one meaning.** Two byte sequences that mean the same thing to a human must not
 *     both verify, or the signature stops proving *which* was signed. So: a line per field, a
 *     newline as the only separator, no field allowed to contain one, and a parse that
 *     re-serialises and compares rather than accepting anything close enough.
 *  2. **One signature proves nothing.** Either player could otherwise claim any result. A scoresheet
 *     is valid only with two, and the two must be the two addresses the text itself names.
 *  3. **The order is a property of the signatures.** Elo is path-dependent, so a rating that anyone
 *     can recompute needs an ordering nobody can dispute. `endedAtBlock` is inside the signed text
 *     and is a Nimiq block height — checkable by anyone against the chain, unlike a timestamp,
 *     which is something a server asserts.
 *
 * `chain` is inside the signed bytes because Nimiq's `sign()` has no domain separation: without it,
 * a signature made on testnet verifies byte-for-byte on mainnet.
 *
 * `rated` is inside the signed bytes so a casual game cannot be relabelled as a rated one after the
 * fact, or the other way round, by whoever happens to be storing it.
 *
 * The moves are hashed rather than carried: a full game is far too long to sign comfortably, nobody
 * needs it inline, and the hash binds the move list without paying for it. The move list is served
 * beside the scoresheet so anyone can re-derive the hash and check it.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { toBase64Url } from './base64.ts';

/** The version marker. Bumping it is a new format, never a silent change to this one. */
export const SCORESHEET_VERSION = 'chess/1 scoresheet';

/** Which chain the game is bound to. `sign()` has no domain separation, so this must be signed. */
export type ChessChain = 'main' | 'test';

/** The three results chess has. Written the way chess writes them, not as an enum nobody reads. */
export type GameResult = '1-0' | '0-1' | '1/2-1/2';

/** How the game ended. Every one of these is a fact about the final position or a player's action. */
export type Termination =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'agreement'
  | 'insufficient'
  | 'repetition'
  | 'fifty-move'
  | 'abandoned';

const TERMINATIONS = new Set<string>([
  'checkmate',
  'resignation',
  'timeout',
  'stalemate',
  'agreement',
  'insufficient',
  'repetition',
  'fifty-move',
  'abandoned',
]);

export interface Scoresheet {
  chain: ChessChain;
  /** Server-issued, 32 lowercase hex. Unique per game. */
  gameId: string;
  /** Nimiq addresses, no display spacing. */
  white: string;
  black: string;
  result: GameResult;
  termination: Termination;
  /** Full moves played. A game under ten does not rate — see `elo.ts`. */
  moveCount: number;
  /** The position the game ended in. Lets anyone confirm a checkmate claim themselves. */
  finalFen: string;
  /** The Nimiq block height the server stamped when the game ended. The ordering key. */
  endedAtBlock: number;
  /** SHA-256 of the SAN move list, base64url. Binds the moves without carrying them. */
  movesHash: string;
  /** Whether this game moves anyone's rating. Signed, so it cannot be relabelled afterwards. */
  rated: boolean;
}

/** Thrown for anything that is not exactly a canonical scoresheet. Never a silent coercion. */
export class ScoresheetError extends Error {
  override readonly name = 'ScoresheetError';
}

/* ------------------------------------------------------------------ helpers */

const encoder = new TextEncoder();

/**
 * The hash of a move list.
 *
 * The moves are joined with single spaces after being trimmed, so that whitespace in a PGN cannot
 * change the hash of the same game. Anything else about them — including move numbers, which are
 * derivable — is not part of it.
 */
export function hashMoves(sanMoves: readonly string[]): string {
  const normalised = sanMoves.map((move) => move.trim()).filter((move) => move.length > 0);
  return toBase64Url(sha256(encoder.encode(normalised.join(' '))));
}

/** Nimiq addresses are written with spaces and compared without them. */
export function normaliseAddress(address: string): string {
  return address.replace(/\s/g, '').toUpperCase();
}

/** True when two addresses are the same wallet, whatever spacing either was written with. */
export function sameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  return normaliseAddress(a) === normaliseAddress(b);
}

const ADDRESS = /^NQ[0-9A-Z]{34}$/;
const GAME_ID = /^[0-9a-f]{32}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/*
 * A FEN is six space-separated fields. Validated for shape rather than for legality: whether the
 * position is reachable is a question for the rules engine, and a scoresheet that refused an
 * unreachable position would be refusing to record a bug rather than preventing one.
 */
const FEN = /^[1-8pnbrqkPNBRQK/]+ [wb] (-|K?Q?k?q?) (-|[a-h][36]) \d+ \d+$/;

/* ------------------------------------------------------------------ canonical form */

/**
 * The exact bytes both players sign.
 *
 * Every field is validated here rather than at the call site, so there is one place that decides
 * what a scoresheet is and no way to construct one that skips it.
 */
export function canonicaliseScoresheet(sheet: Scoresheet): string {
  if (sheet.chain !== 'main' && sheet.chain !== 'test') {
    throw new ScoresheetError(`chain must be main or test, got ${JSON.stringify(sheet.chain)}`);
  }
  if (!GAME_ID.test(sheet.gameId)) {
    throw new ScoresheetError('gameId must be 32 lowercase hex characters');
  }

  const white = normaliseAddress(sheet.white);
  const black = normaliseAddress(sheet.black);
  if (!ADDRESS.test(white)) throw new ScoresheetError(`not a Nimiq address: ${JSON.stringify(sheet.white)}`);
  if (!ADDRESS.test(black)) throw new ScoresheetError(`not a Nimiq address: ${JSON.stringify(sheet.black)}`);
  // A game against yourself is not a game, and it is the cheapest possible way to farm a rating.
  if (white === black) throw new ScoresheetError('white and black cannot be the same wallet');

  if (sheet.result !== '1-0' && sheet.result !== '0-1' && sheet.result !== '1/2-1/2') {
    throw new ScoresheetError(`result must be 1-0, 0-1 or 1/2-1/2, got ${JSON.stringify(sheet.result)}`);
  }
  if (!TERMINATIONS.has(sheet.termination)) {
    throw new ScoresheetError(`unknown termination: ${JSON.stringify(sheet.termination)}`);
  }
  assertUint('moveCount', sheet.moveCount);
  assertUint('endedAtBlock', sheet.endedAtBlock);
  if (sheet.endedAtBlock === 0) throw new ScoresheetError('endedAtBlock must be a real block height');

  if (!FEN.test(sheet.finalFen)) {
    throw new ScoresheetError(`not a FEN: ${JSON.stringify(sheet.finalFen)}`);
  }
  if (!BASE64URL.test(sheet.movesHash)) {
    throw new ScoresheetError('movesHash must be base64url');
  }
  if (typeof sheet.rated !== 'boolean') {
    throw new ScoresheetError('rated must be true or false');
  }

  return [
    SCORESHEET_VERSION,
    sheet.chain,
    sheet.gameId,
    white,
    black,
    sheet.result,
    sheet.termination,
    String(sheet.moveCount),
    sheet.finalFen,
    String(sheet.endedAtBlock),
    sheet.movesHash,
    sheet.rated ? 'rated' : 'casual',
    '',
  ].join('\n');
}

/**
 * Read a canonical scoresheet back, refusing anything not exactly in that form.
 *
 * The re-serialise-and-compare at the end is the rule that matters. Without it, `007` and `7` would
 * both parse to the same move count, two different byte strings would carry the same meaning, and a
 * signature would stop proving which one was signed.
 */
export function parseScoresheet(serialised: string): Scoresheet {
  const lines = serialised.split('\n');
  if (lines.length !== 13 || lines[12] !== '') {
    throw new ScoresheetError('a scoresheet is twelve lines and a trailing newline');
  }
  if (lines[0] !== SCORESHEET_VERSION) {
    throw new ScoresheetError(`unknown scoresheet version: ${JSON.stringify(lines[0])}`);
  }

  const ratedField = lines[11];
  if (ratedField !== 'rated' && ratedField !== 'casual') {
    throw new ScoresheetError(`rated must be the word rated or casual, got ${JSON.stringify(ratedField)}`);
  }

  const sheet: Scoresheet = {
    chain: lines[1] as ChessChain,
    gameId: lines[2] ?? '',
    white: lines[3] ?? '',
    black: lines[4] ?? '',
    result: lines[5] as GameResult,
    termination: lines[6] as Termination,
    moveCount: numberFrom(lines[7], 'moveCount'),
    finalFen: lines[8] ?? '',
    endedAtBlock: numberFrom(lines[9], 'endedAtBlock'),
    movesHash: lines[10] ?? '',
    rated: ratedField === 'rated',
  };

  if (canonicaliseScoresheet(sheet) !== serialised) {
    throw new ScoresheetError('input is not in canonical form');
  }
  return sheet;
}

/**
 * A digits-only integer, so `007`, `+7`, ` 7` and `7.0` are all refused rather than coerced.
 *
 * `Number()` would accept every one of them and produce 7, which is exactly how two different byte
 * strings end up meaning the same thing.
 */
function numberFrom(raw: string | undefined, field: string): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new ScoresheetError(`${field} must be written as digits, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

function assertUint(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new ScoresheetError(`${field} must be a whole number, got ${String(value)}`);
  }
}

/* ------------------------------------------------------------------ reading one */

/** Which side an address played, or null when it played neither. */
export function sideOf(sheet: Scoresheet, address: string): 'white' | 'black' | null {
  if (sameAddress(sheet.white, address)) return 'white';
  if (sameAddress(sheet.black, address)) return 'black';
  return null;
}

/** The other player's address, from one player's. Null when the address is not in this game. */
export function opponentOf(sheet: Scoresheet, address: string): string | null {
  const side = sideOf(sheet, address);
  if (side === null) return null;
  return side === 'white' ? sheet.black : sheet.white;
}

/**
 * What one player scored: 1 for a win, 0.5 for a draw, 0 for a loss.
 *
 * Returns null rather than 0 for an address that did not play, because "lost" and "was not there"
 * are different facts and conflating them would silently rate strangers.
 */
export function scoreFor(sheet: Scoresheet, address: string): number | null {
  const side = sideOf(sheet, address);
  if (side === null) return null;
  if (sheet.result === '1/2-1/2') return 0.5;
  const whiteWon = sheet.result === '1-0';
  return (side === 'white') === whiteWon ? 1 : 0;
}
