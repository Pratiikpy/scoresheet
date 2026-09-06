/**
 * The Nimiq Pay wallet, as this app uses it.
 *
 * Everything here is bounded by facts about the platform that were verified rather than assumed
 * (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md`, and the provider's own source on the `nimiq` branch of
 * `nimiq/trust-web3-provider`):
 *
 *  - The provider is `window.nimiq`, injected before any page script runs, and **absent outside the
 *    wallet**. Every call is guarded; the app has to be fully usable without it.
 *  - `sign()` and `listAccounts()` can **resolve with `{ error: { type, message } }`** as well as
 *    rejecting. The documentation describes only the throw. Both happen.
 *  - `sign()`'s return framing varies by host, so it goes through `normaliseSignature`.
 *  - **There is no `getBalance`.** Confirmed absent, not merely undocumented.
 *  - `window.nimiqPay` carries `language`, `userFiat` and `requestDeviceIdentifier()`.
 *
 * The rule that shapes the whole file: **never ask for a wallet on page load.** A stranger opening
 * a link should solve the daily puzzle and beat the bot before anything asks who they are. The
 * address is requested on a tap, once, and remembered.
 */

import { SignatureDeclinedError, SignatureShapeError, normaliseSignature, type NormalisedSignature } from '@scoresheet/core';

/** What the injected provider offers. Every method optional: hosts differ and versions drift. */
interface NimiqProvider {
  listAccounts?: () => Promise<unknown>;
  sign?: (input: string | { message: string; isHex?: boolean }) => Promise<unknown>;
  getBlockNumber?: () => Promise<number>;
  isConsensusEstablished?: () => Promise<boolean>;
}

interface NimiqPayHost {
  language?: string;
  userFiat?: string;
  requestDeviceIdentifier?: (reason?: string) => Promise<string>;
}

declare global {
  interface Window {
    nimiq?: NimiqProvider;
    nimiqPay?: NimiqPayHost;
  }
}

/** How much of a wallet is present. The app renders differently for each, never worse. */
export type WalletTier =
  /** Inside Nimiq Pay: everything works. */
  | 'nimiq-pay'
  /** A browser with no provider: play, but nothing can be signed. */
  | 'none';

export class WalletUnavailableError extends Error {
  override readonly name = 'WalletUnavailableError';
}

export class WalletTimeoutError extends Error {
  override readonly name = 'WalletTimeoutError';
  constructor(step: string) {
    super(`${step} — Nimiq Pay did not answer. Open the wallet and try again.`);
  }
}

export function insideNimiqPay(): boolean {
  return typeof window !== 'undefined' && window.nimiqPay !== undefined;
}

export function tier(): WalletTier {
  return typeof window !== 'undefined' && window.nimiq !== undefined ? 'nimiq-pay' : 'none';
}

/** The host's language, for copy. Falls back the way the documentation recommends. */
export function hostLanguage(): string {
  const raw = window.nimiqPay?.language ?? navigator.language ?? 'en';
  return raw.slice(0, 2).toLowerCase();
}

/**
 * Nothing may hang forever.
 *
 * A wallet dialog the user walked away from leaves a promise pending for the life of the page, and
 * a screen stuck on "waiting" with no way out is worse than an error. Every call is bounded, and the
 * timeout names the step so the message can say what was waiting.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new WalletTimeoutError(step)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Unwrap a provider result that may be a resolved error rather than a rejection.
 *
 * This is the shape the documentation does not describe and every host produces.
 */
function unwrap<T>(result: unknown, what: string): T {
  if (result !== null && typeof result === 'object' && 'error' in result) {
    const error = (result as { error: unknown }).error;
    const detail =
      typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null
          ? [(error as Record<string, unknown>)['type'], (error as Record<string, unknown>)['message']]
              .filter((part) => typeof part === 'string')
              .join(': ')
          : String(error);
    if (/permission|denied|reject|cancel|abort/i.test(detail)) throw new SignatureDeclinedError(detail);
    throw new WalletUnavailableError(`${what}: ${detail}`);
  }
  return result as T;
}

const STORAGE_KEY = 'scoresheet:address';

/** The address this browser last connected, so it is asked for once rather than every time. */
export function rememberedAddress(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetAddress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode; the address simply will not survive a reload */
  }
}

/**
 * Ask which wallet this is. **Only ever from a tap.**
 *
 * `listAccounts()` caches inside the provider, so calling it again after the first grant does not
 * prompt — which is why the address can be re-read cheaply rather than stored as the only copy.
 */
export async function connect(): Promise<string> {
  const provider = window.nimiq;
  if (!provider?.listAccounts) {
    throw new WalletUnavailableError('Signing happens in the Nimiq Pay app. Open this there.');
  }

  const result = await withTimeout(provider.listAccounts(), 60_000, 'Sharing your address');
  const accounts = unwrap<unknown>(result, 'listAccounts');
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string' || first.length === 0) {
    throw new WalletUnavailableError('The wallet did not return an address.');
  }

  try {
    localStorage.setItem(STORAGE_KEY, first);
  } catch {
    /* nothing to do */
  }
  return first;
}

/**
 * Sign one exact string.
 *
 * The result goes through `normaliseSignature`, which handles hex, base64, `Uint8Array`,
 * `number[]` and numeric-keyed objects, and turns a resolved error into the right exception.
 */
export async function signText(text: string): Promise<NormalisedSignature> {
  const provider = window.nimiq;
  if (!provider?.sign) {
    throw new WalletUnavailableError('Signing happens in the Nimiq Pay app. Open this there.');
  }
  const result = await withTimeout(provider.sign(text), 120_000, 'Signing');
  return normaliseSignature(result);
}

/** The chain height, for stamping a finished game. Never blocking, never fatal. */
export async function blockNumber(): Promise<number | null> {
  try {
    const height = await withTimeout(window.nimiq?.getBlockNumber?.() ?? Promise.resolve(0), 10_000, 'Reading the chain height');
    return typeof height === 'number' && height > 0 ? height : null;
  } catch {
    return null;
  }
}

/**
 * An anonymous per-device handle, for keeping a funded pool fair without a login.
 *
 * Explicitly **not** a user identity: a shared device returns the same value to everyone, and one
 * person on two devices gets two different values. It is a rate-limit key and nothing else.
 */
export async function deviceIdentifier(reason: string): Promise<string | null> {
  try {
    const id = await withTimeout(
      window.nimiqPay?.requestDeviceIdentifier?.(reason) ?? Promise.resolve(''),
      60_000,
      'Identifying this device',
    );
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Turn any wallet failure into a sentence a person can act on.
 *
 * A provider's own text is written for whoever wrote the provider — "user rejected the request",
 * "Failed to fetch". Shown raw it is always English however the app is set, tells nobody what to do,
 * and reads as though this app broke when in most of these cases nothing is wrong at all.
 *
 * A declined signature is deliberately **not** an error: the player chose it, and the screen should
 * stay calm and usable.
 */
export function explain(error: unknown): { message: string; tone: 'calm' | 'bad' } {
  if (error instanceof SignatureDeclinedError) {
    return { message: 'You did not sign. Nothing was recorded, and you can sign any time.', tone: 'calm' };
  }
  if (error instanceof WalletUnavailableError || error instanceof WalletTimeoutError) {
    return { message: error.message, tone: 'calm' };
  }
  if (error instanceof SignatureShapeError) {
    return {
      message: 'Your wallet returned a signature this app could not read. Please report it — it is our bug, not yours.',
      tone: 'bad',
    };
  }
  if (error instanceof Error) {
    if (/reject|denied|declin|cancel|abort/i.test(error.message)) {
      return { message: 'You did not sign. Nothing was recorded, and you can sign any time.', tone: 'calm' };
    }
    if (/failed to fetch|network|offline|econn|timed? ?out/i.test(error.message)) {
      return { message: 'Your phone could not reach the network. Nothing was lost — try again in a moment.', tone: 'calm' };
    }
    if (/consensus|not synced|syncing/i.test(error.message)) {
      return { message: 'Nimiq Pay is still catching up with the chain. Give it a few seconds.', tone: 'calm' };
    }
    // Unrecognised: quote it and say whose words they are, rather than inventing a friendlier
    // meaning. A wrong guess about an error is worse than an honest quotation of one.
    return { message: `Your wallet reported: ${error.message}`, tone: 'bad' };
  }
  return { message: 'Something went wrong. Nothing was signed.', tone: 'bad' };
}
