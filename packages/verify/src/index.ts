/**
 * @scoresheet/verify — proof that a scoresheet is genuine.
 *
 * Separate from `@scoresheet/core` on purpose: this pulls in `@nimiq/core`, a Rust→WASM bundle that
 * has no business in a phone's bundle. Core stays dependency-light and isomorphic; everything that
 * needs real Ed25519 lives here.
 *
 * **The digest is the part to get right, and it is the part everybody gets wrong.**
 *
 * A Nimiq wallet does not sign the message. It signs
 * `SHA-256("\x16Nimiq Signed Message:\n" ‖ decimal(byteLength) ‖ message)`, and that length is the
 * UTF-8 **byte** length, not the character count. Nimiq's own published snippet uses
 * `message.length` — UTF-16 code units — which is silently correct for ASCII and wrong for any
 * accent, emoji or currency symbol. A scoresheet is ASCII today, so the bug would not bite until
 * somebody's opening name or a future field carried a non-ASCII character, and then every signature
 * in the app would stop verifying at once, for reasons nobody would find quickly.
 *
 * So `test/keyguard-vectors.test.ts` pins this to the two vectors published in `nimiq/keyguard`'s
 * own `Key.spec.js`, using **Node's** SHA-256 rather than `@nimiq/core`'s, so the two
 * implementations are genuinely independent and cannot agree on a shared mistake.
 */

import { Address, Hash, PublicKey, Signature } from '@nimiq/core';
import { canonicaliseScoresheet, normaliseAddress, parseScoresheet, type Scoresheet } from '@scoresheet/core';

/**
 * The prefix a Nimiq wallet puts in front of every signed message.
 *
 * The leading `\x16` is the length of the string that follows it — 22 characters — and it is part
 * of what gets hashed. Written as an escape rather than as the raw control byte it stands for:
 * the first draft of this file carried the byte itself, which is invisible in an editor, silently
 * strippable by a formatter, and impossible for a reader to know is there.
 */
export const NIMIQ_SIGN_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n';

export type VerificationFailure =
  | 'malformed-scoresheet'
  | 'malformed-public-key'
  | 'malformed-signature'
  | 'bad-signature'
  | 'not-a-player'
  | 'wrong-chain';

export interface VerificationResult {
  ok: boolean;
  failure?: VerificationFailure;
  /** Safe to show a person. Never contains key material. */
  detail?: string;
  /** The address the public key derives to, whenever the key parsed at all. */
  derivedAddress?: string;
}

/**
 * Rebuild the digest the wallet signed.
 *
 * The byte length is computed from the encoded bytes, never from `message.length`.
 */
export function nimiqSignedMessageDigest(message: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(NIMIQ_SIGN_MESSAGE_PREFIX);
  const length = encoder.encode(String(message.byteLength));
  const buffer = new Uint8Array(prefix.length + length.length + message.length);
  buffer.set(prefix, 0);
  buffer.set(length, prefix.length);
  buffer.set(message, prefix.length + length.length);
  return Hash.computeSha256(buffer);
}

/** The address a public key belongs to, in Nimiq's user-friendly form. */
export function addressFromPublicKey(publicKeyHex: string): string {
  return PublicKey.fromHex(publicKeyHex).toAddress().toUserFriendlyAddress();
}

export interface SignedText {
  text: string;
  publicKeyHex: string;
  signatureHex: string;
  /** When given, the signature must come from this wallet and no other. */
  expectedAddress?: string | undefined;
}

/**
 * Verify one signature over one exact string.
 *
 * Every failure is named rather than collapsed into false, because a screen that says "that
 * signature is not from the wallet the game names" is useful and one that says "invalid" is not.
 */
export function verifySignedText(options: SignedText): VerificationResult {
  let publicKey: PublicKey;
  try {
    publicKey = PublicKey.fromHex(options.publicKeyHex);
  } catch {
    return { ok: false, failure: 'malformed-public-key', detail: 'That public key is not readable.' };
  }

  const derivedAddress = publicKey.toAddress().toUserFriendlyAddress();

  let signature: Signature;
  try {
    signature = Signature.fromHex(options.signatureHex);
  } catch {
    return { ok: false, failure: 'malformed-signature', detail: 'That signature is not readable.', derivedAddress };
  }

  if (options.expectedAddress !== undefined && normaliseAddress(derivedAddress) !== normaliseAddress(options.expectedAddress)) {
    return {
      ok: false,
      failure: 'not-a-player',
      detail: 'That signature is from a different wallet than the one named.',
      derivedAddress,
    };
  }

  const digest = nimiqSignedMessageDigest(new TextEncoder().encode(options.text));
  // `publicKey.verify(signature, digest)` — the key verifies the signature, not the reverse.
  if (!publicKey.verify(signature, digest)) {
    return { ok: false, failure: 'bad-signature', detail: 'That signature does not match these words.', derivedAddress };
  }

  return { ok: true, derivedAddress };
}

export interface SignaturePair {
  publicKeyHex: string;
  signatureHex: string;
}

export interface ScoresheetVerification {
  ok: boolean;
  sheet?: Scoresheet;
  /** Each side checked separately, so a page can say which one is the problem. */
  white: VerificationResult;
  black: VerificationResult;
  failure?: VerificationFailure;
  detail?: string;
}

/**
 * Verify a whole scoresheet: both signatures, over the same canonical text, from the two wallets the
 * text itself names.
 *
 * **One signature proves nothing** — either player could otherwise claim any result — so this is
 * deliberately not an "at least one is valid" check. Both, or it is not a scoresheet.
 *
 * The text is re-canonicalised from the parsed sheet rather than trusted as given, so a scoresheet
 * that is *nearly* canonical cannot verify: the signature must be over the exact bytes the format
 * defines, not over whatever happened to arrive.
 */
export function verifyScoresheet(
  serialised: string,
  signatures: { white: SignaturePair; black: SignaturePair },
  expectedChain?: 'main' | 'test',
): ScoresheetVerification {
  const nothing: VerificationResult = { ok: false };

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

  if (expectedChain !== undefined && sheet.chain !== expectedChain) {
    return {
      ok: false,
      sheet,
      white: nothing,
      black: nothing,
      failure: 'wrong-chain',
      detail: `This game is on ${sheet.chain}net; this service runs on ${expectedChain}net.`,
    };
  }

  // Canonical text from the parsed sheet, not the string handed in.
  const text = canonicaliseScoresheet(sheet);
  const white = verifySignedText({ text, ...signatures.white, expectedAddress: sheet.white });
  const black = verifySignedText({ text, ...signatures.black, expectedAddress: sheet.black });

  const ok = white.ok && black.ok;
  const failed = !white.ok ? white : black;
  return ok
    ? { ok, sheet, white, black }
    : { ok, sheet, white, black, ...(failed.failure ? { failure: failed.failure } : {}), ...(failed.detail ? { detail: failed.detail } : {}) };
}

/** A Nimiq address, checked for shape. Useful before asking a server about one. */
export function isNimiqAddress(value: string): boolean {
  try {
    Address.fromUserFriendlyAddress(value.replace(/\s/g, '').toUpperCase());
    return true;
  } catch {
    return false;
  }
}
