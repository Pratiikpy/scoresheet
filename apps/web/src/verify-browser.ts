/**
 * Verifying a scoresheet **in the visitor's own browser**, with no server and no WASM.
 *
 * This is the file the product's central claim rests on. "A rating nobody can take away from you"
 * is only true if a stranger can check it themselves, and a check that phones home to us is a check
 * we could switch off. So the recompute page verifies here, on the device, from the signatures
 * alone.
 *
 * **Why not `@scoresheet/verify`.** That package uses `@nimiq/core`, a Rust→WASM bundle that costs
 * roughly 50 MB resident and a fifty-millisecond load. It is right on a server and wrong on a phone.
 * Everything it does that matters here is reproducible from two small MIT libraries:
 *
 *  - `@noble/ed25519` — signature verification, about 23 kB of plain JavaScript.
 *  - `@noble/hashes` — SHA-256 for the signed-message digest, and Blake2b for the address.
 *
 * **The address derivation was verified rather than assumed.** A Nimiq address is the first 20
 * bytes of `Blake2b-256(publicKey)`, and the user-friendly form is `NQ`, two IBAN-style check
 * digits, and the 20 bytes in Nimiq's own base-32 alphabet. Both halves are checked against
 * `@nimiq/core`'s own output over many random keys in `test/address.test.ts` — because deriving an
 * address slightly differently from the wallet would silently attribute every signature to the
 * wrong person.
 */

import { verifyAsync } from '@noble/ed25519';
import { blake2b } from '@noble/hashes/blake2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  canonicalisePuzzleCard,
  canonicaliseScoresheet,
  normaliseAddress,
  parsePuzzleCard,
  parseScoresheet,
  type PuzzleCard,
  type Scoresheet,
} from '@scoresheet/core';

/**
 * Nimiq's base-32 alphabet.
 *
 * No `I`, `O`, `U` or `W` — so that a letter can never be misread as a digit, and so that no address
 * spells a word by accident. Getting this wrong produces addresses that look right and are not.
 */
const BASE32 = '0123456789ABCDEFGHJKLMNPQRSTUVXY';

const encoder = new TextEncoder();

/** The prefix a Nimiq wallet hashes in front of every signed message; `\x16` is its own length. */
const SIGN_PREFIX = '\x16Nimiq Signed Message:\n';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) throw new Error('not hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The digest the wallet actually signed. The length is the UTF-8 **byte** length, always. */
export function signedMessageDigest(message: string): Uint8Array {
  const body = encoder.encode(message);
  const prefix = encoder.encode(SIGN_PREFIX);
  const length = encoder.encode(String(body.byteLength));
  const buffer = new Uint8Array(prefix.length + length.length + body.length);
  buffer.set(prefix, 0);
  buffer.set(length, prefix.length);
  buffer.set(body, prefix.length + length.length);
  return sha256(buffer);
}

/** The 20 raw address bytes for a public key. */
export function addressBytes(publicKeyHex: string): Uint8Array {
  return blake2b(hexToBytes(publicKeyHex), { dkLen: 32 }).slice(0, 20);
}

/** The 20 bytes as 32 base-32 characters. */
function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The IBAN check digits.
 *
 * Nimiq borrows the IBAN scheme wholesale: move the country code and a `00` placeholder to the end,
 * map every letter to its position plus nine, and the check is `98 - (that number mod 97)`. The
 * modulus is taken digit by digit because the number is far larger than a JavaScript integer.
 */
function checkDigits(base32: string): string {
  const shifted = `${base32}NQ00`;
  let remainder = 0;
  for (const character of shifted) {
    const mapped = /\d/.test(character) ? character : String(character.charCodeAt(0) - 55);
    for (const digit of mapped) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return String(98 - remainder).padStart(2, '0');
}

/** The address a public key belongs to, in the form a person sees. */
export function addressFromPublicKey(publicKeyHex: string): string {
  const base32 = toBase32(addressBytes(publicKeyHex));
  return `NQ${checkDigits(base32)}${base32}`;
}

export type BrowserFailure =
  | 'malformed-scoresheet'
  | 'malformed-key'
  | 'malformed-signature'
  | 'bad-signature'
  | 'not-a-player';

export interface SideResult {
  ok: boolean;
  failure?: BrowserFailure;
  /** Derived from the key, never taken from the input. */
  derivedAddress?: string;
}

export interface BrowserVerification {
  ok: boolean;
  sheet?: Scoresheet;
  white: SideResult;
  black: SideResult;
  failure?: BrowserFailure;
  detail?: string;
}

async function verifyOne(text: string, publicKeyHex: string, signatureHex: string, expected: string): Promise<SideResult> {
  let derivedAddress: string;
  try {
    derivedAddress = addressFromPublicKey(publicKeyHex);
  } catch {
    return { ok: false, failure: 'malformed-key' };
  }
  if (normaliseAddress(derivedAddress) !== normaliseAddress(expected)) {
    return { ok: false, failure: 'not-a-player', derivedAddress };
  }
  try {
    const ok = await verifyAsync(hexToBytes(signatureHex), signedMessageDigest(text), hexToBytes(publicKeyHex));
    return ok ? { ok: true, derivedAddress } : { ok: false, failure: 'bad-signature', derivedAddress };
  } catch {
    return { ok: false, failure: 'malformed-signature', derivedAddress };
  }
}

/**
 * Verify a whole scoresheet here, on this device.
 *
 * Both signatures, over the canonical text rebuilt from the parsed sheet rather than from whatever
 * string arrived — so a nearly-canonical text cannot verify, and one signature is never enough.
 */
export async function verifyScoresheetInBrowser(
  serialised: string,
  signatures: { white: { publicKeyHex: string; signatureHex: string }; black: { publicKeyHex: string; signatureHex: string } },
): Promise<BrowserVerification> {
  const nothing: SideResult = { ok: false };
  let sheet: Scoresheet;
  try {
    sheet = parseScoresheet(serialised);
  } catch (error) {
    return {
      ok: false,
      white: nothing,
      black: nothing,
      failure: 'malformed-scoresheet',
      detail: error instanceof Error ? error.message : 'Not a scoresheet.',
    };
  }

  const text = canonicaliseScoresheet(sheet);
  const white = await verifyOne(text, signatures.white.publicKeyHex, signatures.white.signatureHex, sheet.white);
  const black = await verifyOne(text, signatures.black.publicKeyHex, signatures.black.signatureHex, sheet.black);
  const ok = white.ok && black.ok;
  const failed = !white.ok ? white : black;

  return ok ? { ok, sheet, white, black } : { ok, sheet, white, black, ...(failed.failure ? { failure: failed.failure } : {}) };
}

/* ------------------------------------------------------------------ puzzle cards */

export interface CardVerification {
  ok: boolean;
  card?: PuzzleCard;
  solver: SideResult;
  witness: SideResult;
  failure?: BrowserFailure;
  detail?: string;
}

/**
 * Verify a witnessed puzzle run here, on this device.
 *
 * The same rule as a scoresheet and for the same reason: **both signatures, over the canonical text
 * rebuilt from the parsed card**, never over whatever string arrived. A card with only the solver's
 * signature is somebody marking their own homework, and one with only the witness's names a solver
 * who never agreed to it.
 *
 * The one difference is who the two parties are. A scoresheet's are two players; a card's are the
 * solver and the witness, and the addresses they must derive to are inside the signed text, so a
 * card signed by a *different* witness than the one it names fails here rather than being counted.
 */
export async function verifyPuzzleCardInBrowser(
  serialised: string,
  signatures: {
    solver: { publicKeyHex: string; signatureHex: string };
    witness: { publicKeyHex: string; signatureHex: string };
  },
): Promise<CardVerification> {
  const nothing: SideResult = { ok: false };
  let card: PuzzleCard;
  try {
    card = parsePuzzleCard(serialised);
  } catch (error) {
    return {
      ok: false,
      solver: nothing,
      witness: nothing,
      failure: 'malformed-scoresheet',
      detail: error instanceof Error ? error.message : 'Not a puzzle card.',
    };
  }

  const text = canonicalisePuzzleCard(card);
  const solver = await verifyOne(text, signatures.solver.publicKeyHex, signatures.solver.signatureHex, card.solver);
  const witness = await verifyOne(text, signatures.witness.publicKeyHex, signatures.witness.signatureHex, card.witness);
  const ok = solver.ok && witness.ok;
  const failed = !solver.ok ? solver : witness;

  return ok ? { ok, card, solver, witness } : { ok, card, solver, witness, ...(failed.failure ? { failure: failed.failure } : {}) };
}
