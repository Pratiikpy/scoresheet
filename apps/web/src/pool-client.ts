/**
 * Claiming the day's NIM for solving the puzzle.
 *
 * `SPEC.md` K7 and P2, and the reason it is worth building: **this is the path that puts NIM in the
 * hands of somebody who did not have a wallet.** It is the ecosystem-value criterion answered by
 * something happening rather than by a claim, and it is also, bluntly, the most persuasive minute in
 * the whole app — solve a puzzle, and a small amount of real money arrives.
 *
 * Two things it must never do, and both are about not lying:
 *
 *  1. **Never say "paid" when nothing went out.** The server distinguishes a claim it recorded from
 *     a transaction it managed to send, and so does this.
 *  2. **Never pretend the pool is funded when it is not.** An unfunded pool is a normal state — it
 *     is how this runs before the wallet has NIM in it — and the screen says so plainly rather than
 *     offering a button that cannot work.
 */

import { ApiError } from './online.ts';
import { LUNA_PER_NIM } from './nim.ts';
import { t } from './i18n.ts';

const API: string = (() => {
  try {
    return import.meta.env.VITE_API ?? '';
  } catch {
    return '';
  }
})();

export interface PoolStatus {
  funded: boolean;
  rewardLuna: number;
  dailyBudgetLuna: number;
  spentTodayLuna: number;
  remainingTodayLuna: number;
  /** Where to send NIM to add to the pool, or `null` when there is no pool wallet. */
  address: string | null;
}

export interface ClaimResult {
  /** Luna that were sent. */
  amount: number;
  /**
   * The transaction, or `null` when the claim was recorded and the send did not go through.
   *
   * `null` is not a failure and is not success either — it is the honest middle: the claim is
   * counted, so nobody can claim twice, and the money has not moved yet. The screen says exactly
   * that rather than choosing whichever of the two words is more comfortable.
   */
  hash: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(t('poolApi.offline'), 'offline', 0);
  }
  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? t('poolApi.refused'),
      payload?.error?.code ?? 'unknown',
      response.status,
    );
  }
  return payload as T;
}

/** What a claim is worth today, and whether there is anything left. */
export function poolStatus(day: string): Promise<PoolStatus> {
  return call<PoolStatus>(`/api/pool?day=${encodeURIComponent(day)}`);
}

export function claimReward(input: {
  address: string;
  device: string;
  day: string;
  puzzleId: string;
}): Promise<ClaimResult> {
  return call<ClaimResult>('/api/pool/claim', { method: 'POST', body: JSON.stringify(input) });
}

/** `50000` → `0.5 NIM`. Trailing zeros are dropped, because `0.50 NIM` reads like a price. */
export function formatNim(luna: number): string {
  const nim = luna / LUNA_PER_NIM;
  const text = nim.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  return `${text} NIM`;
}

/**
 * Why a claim was refused, in the app's own words.
 *
 * The server sends a sentence too, and it is a reasonable one — these are written for somebody who
 * has just solved a puzzle and is being told they are not getting anything, which is a moment that
 * deserves an explanation rather than a rejection.
 */
export function explainRefusal(code: string): string {
  switch (code) {
    case 'already-claimed':
      return t('poolApi.alreadyClaimed');
    case 'device-claimed':
      return t('poolApi.deviceClaimed');
    case 'budget-spent':
      return "Everything today's rewards could cover has been claimed. The pool is funded by staking rewards, so it refills tomorrow rather than running out.";
    case 'not-funded':
      return t('poolApi.notFunded');
    case 'no-device':
      return t('poolApi.needsNimiqPay');
    case 'offline':
      return t('poolApi.unreachable');
    default:
      return t('poolApi.refused');
  }
}
