/**
 * base64url, both ways.
 *
 * Lifted from `chit` (MIT, same author) — see `NOTICES.md`. One implementation, used by the move
 * hash and by the signature normaliser, so a WebView, Node and the test runner cannot disagree
 * about what a base64url string decodes to.
 */

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Encode bytes as unpadded base64url.
 *
 * Implemented directly rather than via `btoa` or `Buffer`, because this package runs in a
 * phone's WebView, in Node, and in a test runner — and reaching for a platform global
 * would mean one of those three quietly breaking. No dependency, no branch, no surprise.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);

    out += BASE64URL_ALPHABET[(triple >> 18) & 63];
    out += BASE64URL_ALPHABET[(triple >> 12) & 63];
    if (b !== undefined) out += BASE64URL_ALPHABET[(triple >> 6) & 63];
    if (c !== undefined) out += BASE64URL_ALPHABET[triple & 63];
  }
  return out;
}

/** Decode unpadded (or padded) base64url back to bytes. */
export function fromBase64Url(value: string): Uint8Array {
  const clean = value.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const character of clean) {
    const digit = BASE64URL_ALPHABET.indexOf(character === '+' ? '-' : character === '/' ? '_' : character);
    if (digit < 0) throw new Error(`invalid base64url character ${JSON.stringify(character)}`);
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, index);
}
