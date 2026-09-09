/**
 * Every failure, as a sentence somebody can act on.
 *
 * `SPEC.md` M2 names this as a whole scored criterion that the spec had not addressed: *fails
 * gracefully, or crashes and confuses*. A raw error string is how an app looks broken even when
 * nothing important has gone wrong — "Failed to fetch" tells a person nothing, is always in English
 * however the app is set, and reads as the app's fault when it is usually the network's.
 *
 * Three rules, and each one is a decision about what a person is owed:
 *
 *  1. **Say what happened to *them*, not what happened to us.** "Could not reach the game" is the
 *     fact; "TypeError: Failed to fetch" is a symptom of it.
 *  2. **Say whether anything was lost.** This is the question actually being asked, every time, and
 *     almost always the answer is no — a signed game is on the device, a move is on the server, a
 *     setting applies for the session. Saying so is the difference between an error and a pause.
 *  3. **A choice is not a failure.** Declining a wallet dialog, cancelling a share sheet, closing a
 *     dialog: the person did that on purpose, and reporting it in red teaches them to distrust red.
 *
 * The tone is part of the answer. `calm` is for things that are normal, expected, or the person's
 * own doing; `bad` is for the small number of cases where something is genuinely wrong and we would
 * want to hear about it.
 */

import { ApiError } from './online.ts';
import { SignatureDeclinedError, SignatureShapeError } from '@scoresheet/core';
// The wallet's own two live beside the wallet, not in core: they are about the *host*, not about a
// signature, and core knows nothing about hosts.
import { WalletTimeoutError, WalletUnavailableError } from './wallet.ts';
import { t, type Key } from './i18n.ts';

/** Finish a fragment into a sentence, so nothing reaches a screen looking half-said. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'Something went wrong.';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export interface Failure {
  /** What to show. A complete sentence, and never a code. */
  message: string;
  /** `calm` for the expected and the self-inflicted; `bad` for something genuinely wrong. */
  tone: 'calm' | 'bad';
}

/**
 * The server's own error codes, in words.
 *
 * The server sends a message too, and it is a good one — but it is written for a developer reading a
 * log. These are written for the person who was in the middle of a game, and they are the ones that
 * ship. A code with no entry here falls through to the server's sentence, which is better than
 * nothing and worse than this.
 */
/*
 * Keyed rather than written out, so every one of these is translated with the rest of the app.
 *
 * An error message is the sentence somebody reads at the worst moment of their session, and leaving
 * exactly those in English while the rest of the app speaks their language would be the wrong half
 * to skip.
 */
const API_MESSAGES: Record<string, { key: Key; tone: 'calm' | 'bad' }> = {
  offline: { key: 'fail.offline', tone: 'calm' },
  'no-game': { key: 'fail.noGame', tone: 'calm' },
  'game-full': { key: 'fail.gameFull', tone: 'calm' },
  'not-your-turn': { key: 'fail.notYourTurn', tone: 'calm' },
  'not-a-player': { key: 'fail.notAPlayer', tone: 'calm' },
  'not-started': { key: 'fail.notStarted', tone: 'calm' },
  'game-over': { key: 'fail.gameOver', tone: 'calm' },
  'illegal-move': { key: 'fail.illegalMove', tone: 'calm' },
  stale: { key: 'fail.stale', tone: 'calm' },
  'not-flagged': { key: 'fail.notFlagged', tone: 'calm' },
  'own-flag': { key: 'fail.ownFlag', tone: 'calm' },
  'not-over': { key: 'fail.notOver', tone: 'calm' },
  'server-error': { key: 'fail.serverError', tone: 'bad' },
  'too-many': { key: 'fail.tooMany', tone: 'calm' },
  'too-large': { key: 'fail.tooLarge', tone: 'bad' },
  // A well-formed response of the wrong shape. Named here so it reads as our bug rather than
  // arriving three layers deep as a library's own error text.
  'bad-shape': { key: 'api.badShape', tone: 'bad' },
};

/**
 * Turn anything at all into a sentence.
 *
 * Deliberately total: it takes `unknown`, because that is what a `catch` gives, and every path
 * through it ends in something a person can read. There is no branch that shows a stack trace, an
 * error name, or a code.
 */
export function explainFailure(error: unknown): Failure {
  /* ------------------------------------------------------------------ choices */

  if (error instanceof SignatureDeclinedError) {
    return { message: t('fail.declined'), tone: 'calm' };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    // A cancelled share sheet, or a request this app abandoned itself.
    return { message: t('fail.cancelled'), tone: 'calm' };
  }

  /* ------------------------------------------------------------------ the wallet */

  if (error instanceof WalletUnavailableError || error instanceof WalletTimeoutError) {
    return { message: error.message, tone: 'calm' };
  }
  if (error instanceof SignatureShapeError) {
    return {
      message: t('fail.badSignature'),
      tone: 'bad',
    };
  }

  /* ------------------------------------------------------------------ the server */

  if (error instanceof ApiError) {
    const known = API_MESSAGES[error.code];
    if (known) return { message: t(known.key), tone: known.tone };
    /*
     * An unrecognised code still has the server's own text, which is better than nothing — but it is
     * written for a log and need not be a sentence. It is finished into one rather than passed
     * through: "Some new thing" on a screen reads as a fragment of something that went wrong, which
     * is exactly the impression this module exists to avoid.
     */
    return { message: asSentence(error.message), tone: error.status >= 500 ? 'bad' : 'calm' };
  }

  /* ------------------------------------------------------------------ the browser */

  if (error instanceof DOMException) {
    // Storage refused: a private window, a browser set to block site data, or a full quota. The app
    // keeps working for this session, which is the part worth saying.
    if (error.name === 'QuotaExceededError' || error.name === 'SecurityError') {
      return {
        message: t('fail.noStorage'),
        tone: 'calm',
      };
    }
    if (error.name === 'NotAllowedError') {
      return { message: t('fail.refused'), tone: 'calm' };
    }
  }

  if (error instanceof Error) {
    /*
     * `fetch` rejects with a bare `TypeError` for every network failure there is.
     *
     * Offline, DNS, a captive portal, a refused connection, a certificate the phone does not trust:
     * all of them arrive here as "Failed to fetch" or "NetworkError when attempting to fetch
     * resource". They are indistinguishable from the browser, so the message is about what the
     * person can do rather than about which of them it was.
     */
    /*
     * The chunk case comes first, and the order is the whole point.
     *
     * A failed dynamic import reads "Failed to fetch dynamically imported module: /assets/x.js",
     * which the network pattern below also matches — so with the checks the other way round, a
     * stale tab after a deploy was told to "try again in a moment", which never fixes it. Reloading
     * does. The test that found this asserted the *advice*, not the branch.
     */
    if (/dynamically imported module|importing a module script failed|chunk/i.test(error.message)) {
      return {
        message: t('fail.chunk'),
        tone: 'calm',
      };
    }
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(error.message)) {
      return {
        message: t('fail.network'),
        tone: 'calm',
      };
    }
    if (/reject|denied|declin|cancel|abort/i.test(error.message)) {
      return { message: t('fail.notConfirmed'), tone: 'calm' };
    }
    if (/consensus|not synced|syncing/i.test(error.message)) {
      return { message: t('fail.syncing'), tone: 'calm' };
    }
    /*
     * Unrecognised: quote it, and say whose words they are.
     *
     * A wrong guess about an unfamiliar error is worse than an honest quotation of one — it sends
     * somebody looking in the wrong place, and it hides the only clue anybody had.
     */
    return { message: asSentence(t('fail.somethingWith', { detail: error.message })), tone: 'bad' };
  }

  return { message: t('fail.something'), tone: 'bad' };
}

/**
 * Is the browser online, as far as it knows?
 *
 * `navigator.onLine` is famously weak — it reports a connection to a network, not to the internet,
 * so it says `true` behind a captive portal. It is used only to *soften* a message, never to block
 * anything: an app that refuses to try because it believes it is offline is an app that is wrong
 * about being offline several times a day.
 */
export function looksOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
