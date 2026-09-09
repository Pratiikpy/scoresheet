/**
 * Sending NIM **from the player's own wallet** — the one provider method this app never used.
 *
 * `SPEC.md` P1 counted the Nimiq surface honestly and named this as the real gap: every transaction
 * in the product was sent *by the pool*, from a key the builder controls, and not one came from the
 * person using the app. That is a meaningful difference. A Mini App where money only ever flows
 * outward from the operator is a faucet; one where a player can send their own is a *payment* app,
 * which is what the framework is for.
 *
 * Two things a player can send, and neither is custodial:
 *
 *  - **A tip to the person they just played.** Straight from their wallet to their opponent's. It
 *    never touches us, and the memo carries the game id so it can be matched to the certificate.
 *  - **A contribution to the puzzle pool.** The pool gives NIM to strangers who solve the daily
 *    puzzle; this lets somebody who liked that put NIM back into it.
 *
 * ## What this is not
 *
 * **Not a wager.** `NIMIQ_OFFICIAL_RULES_PAGE_VERBATIM.md` bans games of chance outright, and a
 * stake on a game result would need an escrow the Mini App framework has no method for — `SPEC.md`
 * K8 says so plainly. A tip is a gift, decided after the game is already over, and it changes
 * nothing about who won.
 *
 * ## The contract, checked rather than assumed
 *
 * `sendBasicTransactionWithData` takes **one options object**, not positional arguments, and returns
 * `Promise<string | ErrorResponse>` — the same "may resolve with an error instead of throwing"
 * pattern the rest of `wallet.ts` deals with. Both are read from `@nimiq/mini-app-sdk`'s own
 * `provider.d.ts`, not from a summary of it.
 */

import { t } from './i18n.ts';
import { WalletUnavailableError, withWalletTimeout } from './wallet.ts';

/** Nimiq's smallest unit. 1 NIM = 100,000 luna. */
export const LUNA_PER_NIM = 100_000;

/**
 * What a tip can be, in NIM.
 *
 * Three fixed amounts rather than a text field, and that is a deliberate refusal. A free-text amount
 * on a payment screen is a validation surface *and* a way to send a hundred times what was meant by
 * mistyping one digit — for a gift of a few NIM after a friendly game, the trade is not close.
 */
export const TIP_AMOUNTS = [5, 25, 100] as const;

/**
 * The transaction's memo, and it must fit **64 bytes** — Nimiq's data field is that long and no
 * longer (`SPEC.md` P2, and the pool's payouts already obey it).
 *
 * Truncating silently is what the pool's first version did, and it produced a memo that identified
 * nothing. Anything built here is short by construction, and the length is asserted rather than
 * hoped: a memo that does not fit is our bug, and it should fail here rather than on a chain.
 */
export function memoFits(memo: string): boolean {
  return new TextEncoder().encode(memo).byteLength <= 64;
}

/** `chess tip 4f3a…` — enough to match a tip to the game it was for, on any block explorer. */
export function tipMemo(gameId: string): string {
  return `chess tip ${gameId.slice(0, 16)}`;
}

/** `chess pool 2026-09-07` — what it was, and when. */
export function poolMemo(day: string): string {
  return `chess pool ${day}`;
}

export type SendOutcome =
  | { ok: true; hash: string }
  | { ok: false; message: string; tone: 'calm' | 'bad' };

/**
 * Send NIM from the player's wallet, with a memo.
 *
 * The wallet shows its own confirmation — this app never sees a key and cannot send anything without
 * the person approving it on their own screen. A refusal is therefore an ordinary outcome, not an
 * error, and is reported as one.
 */
export async function sendNim(input: {
  to: string;
  nim: number;
  memo: string;
}): Promise<SendOutcome> {
  const provider = window.nimiq;
  if (!provider?.sendBasicTransactionWithData) {
    return { ok: false, tone: 'calm', message: t('send.needsNimiqPay') };
  }

  const memo = input.memo;
  if (!memoFits(memo)) {
    // Ours to fix, and it should never reach a person. Said as our bug rather than theirs.
    return { ok: false, tone: 'bad', message: t('send.memoTooLong') };
  }

  const value = Math.round(input.nim * LUNA_PER_NIM);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, tone: 'bad', message: t('send.badAmount') };
  }

  try {
    const result = await withWalletTimeout(
      provider.sendBasicTransactionWithData({ recipient: input.to, value, data: memo }),
      120_000,
      t('send.waiting'),
    );

    /*
     * A string is a transaction hash. Anything else is the wallet's own error shape.
     *
     * The provider is documented as returning `Promise<string | ErrorResponse>`, so a resolved
     * promise is not by itself a success — treating it as one is how an app reports "sent" for a
     * payment the person declined.
     */
    if (typeof result === 'string' && result.length > 0) return { ok: true, hash: result };

    const error = result as { error?: { type?: string; message?: string } } | null;
    const type = error?.error?.type ?? '';
    if (/cancel|reject|denied|abort/i.test(type)) {
      return { ok: false, tone: 'calm', message: t('send.declined') };
    }
    return { ok: false, tone: 'bad', message: error?.error?.message ?? t('send.failed') };
  } catch (error) {
    if (error instanceof WalletUnavailableError) {
      return { ok: false, tone: 'calm', message: error.message };
    }
    /*
     * A wallet dialog somebody walked away from is a refusal, not a failure.
     *
     * There is no way to tell "closed the sheet" from "the wallet is broken" beyond the message, so
     * the calmer reading wins: nothing was sent either way, and nothing is lost.
     */
    const message = error instanceof Error ? error.message : '';
    if (/cancel|reject|denied|abort|timeout/i.test(message)) {
      return { ok: false, tone: 'calm', message: t('send.declined') };
    }
    return { ok: false, tone: 'bad', message: t('send.failed') };
  }
}
