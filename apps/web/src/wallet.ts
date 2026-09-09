/// <reference types="@nimiq/mini-app-sdk" />
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
 *  - `window.nimiqPay` carries **exactly two things**: `language` and `requestDeviceIdentifier()`.
 *    Checked against `@nimiq/mini-app-sdk`'s own `NimiqPayHostContext`, not assumed — an earlier
 *    version of this file also declared `userFiat`, which does not exist and never did.
 *
 * The rule that shapes the whole file: **never ask for a wallet on page load.** A stranger opening
 * a link should solve the daily puzzle and beat the bot before anything asks who they are. The
 * address is requested on a tap, once, and remembered.
 */

import { SignatureDeclinedError, SignatureShapeError, normaliseSignature, type NormalisedSignature } from '@scoresheet/core';
import { t } from './i18n.ts';

/** What the injected provider offers. Every method optional: hosts differ and versions drift. */
/**
 * ⭐ `window.nimiq` and `window.nimiqPay` are typed by **Nimiq**, not by us.
 *
 * This file used to declare both itself, from a careful reading of `@nimiq/mini-app-sdk`. The
 * readings were right, and being right was a fact about one afternoon: nothing re-checked them, and
 * there is no way to run against the real host from a build machine, so a drift would have been
 * discovered by a judge's phone rather than by a compiler.
 *
 * That is not hypothetical here. `requestDeviceIdentifier` was hand-written as `(reason?: string)`
 * and called with a bare string. The real host takes an options object, so it would have read
 * `options.reason` as empty and **rejected** — and an empty reason is documented to throw. Our own
 * stand-in wallet copied the same wrong shape, so every test passed while the puzzle pool was
 * unclaimable on an actual phone.
 *
 * Importing the SDK's types brings its own `declare global` with them, so the globals now carry the
 * vendor's signatures and a future change to them is a build error. `import type` is erased at
 * build: the SDK stays a devDependency and nothing extra ships.
 */

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
    super(t('fail.timeout', { step }));
  }
}

export function insideNimiqPay(): boolean {
  return typeof window !== 'undefined' && window.nimiqPay !== undefined;
}

export function tier(): WalletTier {
  return typeof window !== 'undefined' && window.nimiq !== undefined ? 'nimiq-pay' : 'none';
}

/**
 * Nothing may hang forever.
 *
 * A wallet dialog the user walked away from leaves a promise pending for the life of the page, and
 * a screen stuck on "waiting" with no way out is worse than an error. Every call is bounded, and the
 * timeout names the step so the message can say what was waiting.
 */
export function withWalletTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  return withTimeout(promise, ms, step);
}

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
    throw new WalletUnavailableError(t('fail.noWalletSign'));
  }

  const result = await withTimeout(provider.listAccounts(), 60_000, t('wallet.sharingAddress'));
  const accounts = unwrap<unknown>(result, 'listAccounts');
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string' || first.length === 0) {
    throw new WalletUnavailableError(t('fail.noAddress'));
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
    throw new WalletUnavailableError(t('fail.noWalletSign'));
  }
  const result = await withTimeout(provider.sign(text), 120_000, t('wallet.signing'));
  return normaliseSignature(result);
}

/**
 * Is Nimiq Pay caught up with the chain?
 *
 * **Asked before signing, not diagnosed afterwards.** Without this, somebody who signs while the
 * wallet is still syncing waits through a two-minute timeout and then gets a message inferred by
 * matching words in whatever error text came back — a guess about a failure that could have been
 * predicted for free. The provider has been able to answer this all along; it was declared in the
 * interface and never called.
 *
 * `null` means the question could not be asked, which is different from "no" and is treated as
 * "carry on": refusing to sign because a capability check failed would be worse than the problem.
 */
export async function consensusEstablished(): Promise<boolean | null> {
  try {
    const answer = await withTimeout(
      window.nimiq?.isConsensusEstablished?.() ?? Promise.resolve(undefined),
      5_000,
      t('wallet.checkingSync'),
    );
    return typeof answer === 'boolean' ? answer : null;
  } catch {
    return null;
  }
}

/** The chain height, for stamping a finished game. Never blocking, never fatal. */
export async function blockNumber(): Promise<number | null> {
  try {
    const height = await withTimeout(window.nimiq?.getBlockNumber?.() ?? Promise.resolve(0), 10_000, t('wallet.readingHeight'));
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
      window.nimiqPay?.requestDeviceIdentifier?.({ reason }) ?? Promise.resolve(''),
      60_000,
      t('wallet.identifyingDevice'),
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
    return { message: t('fail.declined'), tone: 'calm' };
  }
  if (error instanceof WalletUnavailableError || error instanceof WalletTimeoutError) {
    return { message: error.message, tone: 'calm' };
  }
  if (error instanceof SignatureShapeError) {
    return {
      message: t('fail.badSignature'),
      tone: 'bad',
    };
  }
  if (error instanceof Error) {
    if (/reject|denied|declin|cancel|abort/i.test(error.message)) {
      return { message: t('fail.declined'), tone: 'calm' };
    }
    if (/failed to fetch|network|offline|econn|timed? ?out/i.test(error.message)) {
      return { message: t('fail.phoneNetwork'), tone: 'calm' };
    }
    if (/consensus|not synced|syncing/i.test(error.message)) {
      return { message: t('fail.syncing'), tone: 'calm' };
    }
    // Unrecognised: quote it and say whose words they are, rather than inventing a friendlier
    // meaning. A wrong guess about an error is worse than an honest quotation of one.
    return { message: `Your wallet reported: ${error.message}`, tone: 'bad' };
  }
  return { message: t('fail.somethingSigning'), tone: 'bad' };
}
