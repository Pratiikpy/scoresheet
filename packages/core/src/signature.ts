/**
 * Normalising what `nimiq.sign()` hands back, and rebuilding the bytes the wallet hashed.
 *
 * **Lifted from `chit`** (`packages/core/src/signature.ts`), which is MIT and by the same author.
 * See `NOTICES.md`. It is not rewritten here because it encodes two verified facts about the
 * platform that were expensive to establish, and a fresh implementation would be a worse one:
 *
 * 1. **The return shape varies by host.** The Mini App SDK forwards `sign()` to native code that is
 *    not open source and may frame the result differently. Two of the strongest builders in the
 *    ecosystem shipped normalisers independently — Reef notes in `src/lib/nimiq/hub.ts` that the SDK
 *    "forwards `sign()` to native code we cannot read", and Cinima ships a `coerceSignBytes` for
 *    hex, base64, `Uint8Array` and `number[]`. This product's entire claim rests on two devices
 *    producing the same digest, so this is not defensive coding — it is the door.
 *
 * 2. **The result is a RESOLVED union, not only a rejection.** `NimiqProvider.sign()` is typed
 *    `Promise<SignatureResult | ErrorResponse>` and branches on `'error' in result` for a resolved
 *    value, while the documentation says `PermissionDeniedError` is *thrown*. Both happen, and both
 *    are handled.
 *
 * Byte lengths are the disambiguator, and they are fixed: an Ed25519 public key is 32 bytes and a
 * signature is 64. A 64-character string is therefore hex for a public key and a 44-character one is
 * base64 for the same key. Length decides, never a guess.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { fromBase64Url } from './base64.ts';

/** Nimiq's signed-message prefix. The leading `\x16` is the byte length of the rest. */
export const NIMIQ_SIGN_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n' as const;

export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;

/** A signature normalised to lowercase hex, whatever the host returned. */
export interface NormalisedSignature {
  publicKeyHex: string;
  signatureHex: string;
}

/** The user declined the wallet dialog. Not an error state — a normal outcome. */
export class SignatureDeclinedError extends Error {
  override readonly name = 'SignatureDeclinedError';
  constructor(message = 'The signature was declined') {
    super(message);
  }
}

/** The host returned something we could not interpret. Always includes what we saw. */
export class SignatureShapeError extends Error {
  override readonly name = 'SignatureShapeError';
  readonly received: string;
  constructor(message: string, received: unknown) {
    super(message);
    this.received = describe(received);
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'string') return `string(${value.length}) ${JSON.stringify(value.slice(0, 24))}…`;
  if (typeof value === 'object') return `object{${Object.keys(value as object).join(',')}}`;
  return typeof value;
}

const HEX = /^[0-9a-fA-F]+$/;
const BASE64URLISH = /^[A-Za-z0-9+/_-]+={0,2}$/;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64ToBytes(value: string): Uint8Array {
  // Reuses the package's own decoder so there is exactly one base64 implementation here
  // and it works identically in a WebView, in Node and in the test runner.
  return fromBase64Url(value);
}

/**
 * Coerce one field — a public key or a signature — to bytes, whatever shape it arrived in.
 *
 * `expectedBytes` is what makes this unambiguous rather than a heuristic: a candidate
 * decoding is accepted only if it produces exactly the right number of bytes.
 */
export function coerceSignatureBytes(value: unknown, expectedBytes: number, field: string): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.length !== expectedBytes) {
      throw new SignatureShapeError(`${field}: expected ${expectedBytes} bytes, got ${value.length}`, value);
    }
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return coerceSignatureBytes(new Uint8Array(value), expectedBytes, field);
  }

  // Some hosts JSON-serialise a Uint8Array, which arrives as a plain array of numbers,
  // or as an object with numeric keys ({"0":12,"1":255,…}) if it crossed a bridge twice.
  if (Array.isArray(value)) {
    if (!value.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255)) {
      throw new SignatureShapeError(`${field}: array contained non-byte values`, value);
    }
    return coerceSignatureBytes(Uint8Array.from(value as number[]), expectedBytes, field);
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === expectedBytes && keys.every((k) => /^\d+$/.test(k))) {
      const bytes = new Uint8Array(expectedBytes);
      for (let i = 0; i < expectedBytes; i++) {
        const byte = record[String(i)];
        if (typeof byte !== 'number') throw new SignatureShapeError(`${field}: bad byte at ${i}`, value);
        bytes[i] = byte;
      }
      return bytes;
    }
    throw new SignatureShapeError(`${field}: unrecognised object shape`, value);
  }

  if (typeof value !== 'string') {
    throw new SignatureShapeError(`${field}: unsupported type ${typeof value}`, value);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) throw new SignatureShapeError(`${field}: empty string`, value);

  // Hex first — it is what the official docs specify, so it is the common path.
  if (trimmed.length === expectedBytes * 2 && HEX.test(trimmed)) {
    return hexToBytes(trimmed.toLowerCase());
  }

  // base64 / base64url. Padded is ceil(n/3)*4; unpadded drops the '=' characters.
  if (BASE64URLISH.test(trimmed)) {
    const padded = Math.ceil(expectedBytes / 3) * 4;
    const unpadded = Math.ceil((expectedBytes * 8) / 6);
    if (trimmed.length === padded || trimmed.length === unpadded) {
      const bytes = base64ToBytes(trimmed);
      if (bytes.length === expectedBytes) return bytes;
    }
  }

  throw new SignatureShapeError(
    `${field}: string is neither ${expectedBytes * 2}-char hex nor base64 for ${expectedBytes} bytes`,
    value,
  );
}

/**
 * Normalise whatever `nimiq.sign()` resolved with into `{ publicKeyHex, signatureHex }`.
 *
 * Throws `SignatureDeclinedError` when the user said no, and `SignatureShapeError` when
 * the host returned something unrecognised — never a bare `Error`, so callers can tell a
 * normal cancellation apart from a bug and show the right screen.
 */
export function normaliseSignature(result: unknown): NormalisedSignature {
  if (result === null || result === undefined) {
    throw new SignatureShapeError('sign() resolved with nothing', result);
  }

  if (typeof result !== 'object') {
    throw new SignatureShapeError('sign() resolved with a non-object', result);
  }

  const record = result as Record<string, unknown>;

  // The resolved-union case. The provider returns an error object rather than rejecting.
  // The verified shape is `{ error: { type: string, message: string } }`
  // (NimiqProvider.ts:33-38) — `type` carries `PermissionDeniedError`, so both fields
  // are inspected. Some hosts flatten it to a bare string, which is handled too.
  if ('error' in record) {
    const error = record['error'];
    const parts: string[] = [];
    if (typeof error === 'string') {
      parts.push(error);
    } else if (typeof error === 'object' && error !== null) {
      const detail = error as Record<string, unknown>;
      if (typeof detail['type'] === 'string') parts.push(detail['type']);
      if (typeof detail['message'] === 'string') parts.push(detail['message']);
      if (parts.length === 0) parts.push(JSON.stringify(error));
    } else {
      parts.push(String(error));
    }
    const description = parts.join(': ');
    if (/permission|denied|reject|cancel|abort/i.test(description)) {
      throw new SignatureDeclinedError(description);
    }
    throw new SignatureShapeError(`sign() returned an error: ${description}`, result);
  }

  const publicKey = record['publicKey'] ?? record['public_key'] ?? record['pubKey'];
  const signature = record['signature'] ?? record['sig'];

  if (publicKey === undefined) throw new SignatureShapeError('sign() result has no publicKey', result);
  if (signature === undefined) throw new SignatureShapeError('sign() result has no signature', result);

  return {
    publicKeyHex: bytesToHex(coerceSignatureBytes(publicKey, ED25519_PUBLIC_KEY_BYTES, 'publicKey')),
    signatureHex: bytesToHex(coerceSignatureBytes(signature, ED25519_SIGNATURE_BYTES, 'signature')),
  };
}

/**
 * Rebuild the 32-byte digest the wallet actually signed.
 *
 * `data = prefix ‖ decimal(byteLength) ‖ messageBytes`, then SHA-256. Verified against
 * core-rs-albatross `wallet_account.rs`, the Keyguard's `Key.js`, the Hub client and
 * `php-utils` (01 §1.2).
 *
 * **The trap:** the length is the UTF-8 **byte** length. The Hub's own published JS
 * snippet uses `message.length` — a UTF-16 code-unit count — which is silently correct
 * for ASCII and wrong for every accent, emoji or currency symbol (01 §1.5a, proven by
 * execution). A scoresheet that says "café" or "€40" would fail to verify. Always bytes.
 */
export function nimiqSignedMessageDigest(message: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(NIMIQ_SIGN_MESSAGE_PREFIX);
  const length = encoder.encode(String(message.byteLength));
  const buffer = new Uint8Array(prefix.length + length.length + message.length);
  buffer.set(prefix, 0);
  buffer.set(length, prefix.length);
  buffer.set(message, prefix.length + length.length);
  return sha256(buffer);
}

/** The digest for a UTF-8 text message — the only variant chit uses. */
export function digestForText(text: string): Uint8Array {
  return nimiqSignedMessageDigest(new TextEncoder().encode(text));
}
