/**
 * The puzzle pool: a small amount of NIM for solving the puzzle of the day.
 *
 * `SPEC.md` K7 and P2. This is the part of the entry that puts NIM in the hands of somebody who did
 * not have a wallet — which is the ecosystem-value criterion answered directly rather than by
 * assertion, and the reason it exists at all.
 *
 * Three design decisions carry the whole thing:
 *
 *  1. **The payout is funded by staking rewards, never by the principal** (K7). The pool is a tree,
 *     not a bucket: if the rewards do not cover the day's payouts, the app offers fewer of them
 *     rather than eating the stake. Nothing here can drain it, because nothing here can spend more
 *     than `dailyBudget`.
 *  2. **Every payout carries the puzzle id in its memo** (P2). Sixty-four bytes turn the pool's whole
 *     history into something a stranger can audit with a block explorer and nothing else — which is
 *     what K7 claims when it says every payout is public. It is free, and without it the claim is
 *     "trust our ledger page".
 *  3. **Nothing is custodial.** The pool is one wallet the builder controls, delegated to a public
 *     validator. It never holds anybody else's money, so there is nothing to withdraw, freeze or
 *     lose — and no reason for anybody to trust us with anything.
 *
 * The abuse limits are the reason this can exist at all. A free faucet with no limits is drained by
 * a script within an hour, and the shape of the defence is taken from `chit`: a limit per address, a
 * limit per device, and a hard ceiling per day that no combination of the two can exceed.
 */

/** What a claim is worth, in luna — Nimiq's smallest unit. 1 NIM = 100,000 luna. */
export const LUNA_PER_NIM = 100_000;

/**
 * One claim per person per day, and the day is the *puzzle's* day.
 *
 * Not a rolling 24 hours: the daily puzzle changes at midnight in the player's own timezone, so a
 * rolling window would let somebody claim twice around the boundary and would refuse a legitimate
 * claim to somebody who solved at 23:00 yesterday and 09:00 today.
 */
export interface Claim {
  /** The wallet that was paid. */
  address: string;
  /** An anonymous per-device handle from the Device Identifier API. Not a person, and not an identity. */
  device: string;
  /** The puzzle that was solved, `YYYY-MM-DD`. */
  day: string;
  /** The puzzle's own id, which goes in the memo. */
  puzzleId: string;
  /** Luna paid. */
  amount: number;
  /** When, by the server's clock. */
  at: number;
  /** The transaction, once it is on chain. Absent means it was accepted and not yet sent. */
  hash?: string | undefined;
}

export interface ClaimStore {
  /** Every claim for a day. Small: the pool pays a bounded number per day by construction. */
  forDay: (day: string) => Promise<Claim[]>;
  record: (claim: Claim) => Promise<void>;
}

export interface PoolConfig {
  /** What one solved daily puzzle pays, in luna. */
  rewardLuna: number;
  /**
   * The most the pool will pay in a day, in luna.
   *
   * This is the staking reward, less a margin — and it is a *hard* ceiling rather than a target.
   * When it is reached the pool stops paying until tomorrow, which is what "the principal is never
   * touched" means in code rather than in prose.
   */
  dailyBudgetLuna: number;
}

/** Why a claim was refused, in a form the client turns into a sentence. */
export type RefusalReason =
  | 'already-claimed'
  | 'device-claimed'
  | 'budget-spent'
  | 'not-funded'
  | 'wrong-puzzle';

export type ClaimOutcome =
  | { ok: true; amount: number; hash: string | null }
  | { ok: false; reason: RefusalReason; retryTomorrow: boolean };

/**
 * How a payout actually reaches the chain.
 *
 * Injected, and allowed to be absent. **A pool with no key is a normal, expected state** — it is how
 * this runs in development, in every test, and on the day before the wallet is funded. The path is
 * complete either way, and the app says plainly that the pool is not funded rather than pretending
 * a claim succeeded.
 */
export interface Payout {
  /** Send `amount` luna to `to`, with `memo` in the transaction's 64-byte data field. */
  send: (to: string, amount: number, memo: string) => Promise<string>;
  /** What the pool can pay from, in luna. `null` when the balance cannot be read. */
  spendable: () => Promise<number | null>;
}

export interface PoolDependencies {
  store: ClaimStore;
  config: PoolConfig;
  now: () => number;
  /** Absent means the pool is not funded, which is a state rather than a failure. */
  payout?: Payout | undefined;
  /**
   * The pool's own address, so a player can send NIM *to* it.
   *
   * The pool gives money away; there was no way to put any in. Publishing the address turns a
   * builder-funded faucet into something anybody can top up, and it costs nothing to publish — it is
   * a receiving address, derived from a key that never leaves the server, and every payout it has
   * ever made is already visible on the chain against it.
   */
  address?: string | null | undefined;
}

export function createPool(dependencies: PoolDependencies) {
  const { store, config, now, payout } = dependencies;

  return {
    /** What a claim is worth and whether the pool can pay it — for a screen that has to say so. */
    async status(day: string): Promise<{
      funded: boolean;
      rewardLuna: number;
      dailyBudgetLuna: number;
      spentTodayLuna: number;
      remainingTodayLuna: number;
      /** Where to send NIM to add to the pool, or `null` when there is no pool wallet. */
      address: string | null;
    }> {
      const claims = await store.forDay(day);
      const spent = claims.reduce((total, claim) => total + claim.amount, 0);
      return {
        funded: payout !== undefined,
        rewardLuna: config.rewardLuna,
        dailyBudgetLuna: config.dailyBudgetLuna,
        spentTodayLuna: spent,
        remainingTodayLuna: Math.max(0, config.dailyBudgetLuna - spent),
        address: dependencies.address ?? null,
      };
    },

    /**
     * Claim the day's reward.
     *
     * **The order of the checks is the security.** Every limit is evaluated *before* anything is
     * sent, and the claim is recorded before the send returns — so a payout that succeeds while the
     * response is lost cannot be claimed a second time. The cost of that ordering is that a failed
     * send leaves a recorded claim with no hash, which the operator can see and reissue; the cost of
     * the other ordering is paying twice, which nobody can undo.
     */
    async claim(input: {
      address: string;
      device: string;
      day: string;
      puzzleId: string;
    }): Promise<ClaimOutcome> {
      const claims = await store.forDay(input.day);

      // One per wallet per day.
      if (claims.some((claim) => claim.address === input.address)) {
        return { ok: false, reason: 'already-claimed', retryTomorrow: true };
      }

      /*
       * One per device per day, and this is the limit that actually matters.
       *
       * Wallets are free and unlimited: a script can make a thousand addresses in a second, so a
       * per-address limit alone is no limit at all. The device identifier is an anonymous per-device
       * handle from Nimiq's own API — it is not a person and not an identity, and a shared phone
       * returns the same value to everybody, which is a real cost and the right trade for something
       * giving away money.
       */
      if (claims.some((claim) => claim.device === input.device)) {
        return { ok: false, reason: 'device-claimed', retryTomorrow: true };
      }

      const spent = claims.reduce((total, claim) => total + claim.amount, 0);
      if (spent + config.rewardLuna > config.dailyBudgetLuna) {
        // The ceiling that makes "never touches the principal" true in code and not only in prose.
        return { ok: false, reason: 'budget-spent', retryTomorrow: true };
      }

      if (!payout) {
        return { ok: false, reason: 'not-funded', retryTomorrow: false };
      }

      const spendable = await payout.spendable().catch(() => null);
      if (spendable !== null && spendable < config.rewardLuna) {
        return { ok: false, reason: 'not-funded', retryTomorrow: true };
      }

      // Recorded first: a lost response must not become a second payment.
      const claim: Claim = {
        address: input.address,
        device: input.device,
        day: input.day,
        puzzleId: input.puzzleId,
        amount: config.rewardLuna,
        at: now(),
      };
      await store.record(claim);

      try {
        /*
         * The memo carries the puzzle id, and that is `SPEC.md` P2's whole idea.
         *
         * Sixty-four bytes turn the pool's history into something a stranger can audit with a block
         * explorer and nothing else. An empty memo would make every payout an unexplained
         * transaction, and the claim that "every payout is public" would mean "trust our page".
         */
        const hash = await payout.send(input.address, config.rewardLuna, memoFor(input.puzzleId, input.day));
        await store.record({ ...claim, hash });
        return { ok: true, amount: config.rewardLuna, hash };
      } catch {
        /*
         * The claim stands even though the send failed.
         *
         * Deliberate: reversing it would open the door to a caller who can make sending fail on
         * purpose and claim repeatedly. An unsent claim is visible to the operator and can be
         * reissued by hand; a double payment cannot be undone by anybody.
         */
        return { ok: true, amount: config.rewardLuna, hash: null };
      }
    },
  };
}

/**
 * What goes in the transaction's data field.
 *
 * Kept well under Nimiq's 64-byte limit and readable as text in any block explorer, because the
 * point of it is that a stranger can understand the payout without asking us what the bytes mean.
 */
export function memoFor(puzzleId: string, day: string): string {
  const memo = `chess puzzle ${day} ${puzzleId}`;
  return memo.length <= 64 ? memo : memo.slice(0, 64);
}

export type Pool = ReturnType<typeof createPool>;
