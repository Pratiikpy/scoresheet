/**
 * Rate limits — `SPEC.md` P5, which named this a known gap and left it open.
 *
 * Without any, one script can create a million games, fill a disk, and take the live server down for
 * everybody mid-match. Nothing here is about abuse of the *pool* — that has its own limits, keyed on
 * a device identifier — this is about a stranger with `curl` and a loop.
 *
 * The shape is a token bucket, and the choice matters: a fixed window lets somebody spend a full
 * allowance in the last second of one window and again in the first second of the next, which is
 * twice the burst it looks like. A bucket refills continuously, so the worst case is exactly the
 * bucket size.
 *
 * ## What it deliberately does *not* do
 *
 * **It never blocks a move in a game that is already running.** A limit that makes somebody lose on
 * time because they moved quickly in a bullet game would be worse than the abuse it prevents. Moves
 * get a generous bucket sized for the fastest chess anybody plays; creating games and claiming money
 * get tight ones, because nobody legitimately does either in a loop.
 */

/** Buckets, by what is being done. `capacity` is the burst; `perSecond` is the refill. */
export const LIMITS = {
  /**
   * Creating games. Tight: a person makes one, sends the link, and waits.
   *
   * Ten in a burst covers somebody making a few links for different friends, or fumbling the button.
   */
  create: { capacity: 10, perSecond: 10 / 60 },
  /**
   * Moves. Deliberately generous — bullet is a move a second and a scramble is faster.
   *
   * Four a second sustained, with sixty in hand, is beyond what a human can produce and far below
   * what a script would want. Anybody hitting this is not playing chess.
   */
  move: { capacity: 60, perSecond: 4 },
  /** Polling. Every open game polls a few times a second; a hundred spare is several tabs. */
  poll: { capacity: 120, perSecond: 4 },
  /** Claiming money. One a day is the real limit; this is only here to stop a loop. */
  claim: { capacity: 5, perSecond: 5 / 600 },
  /** Everything else. */
  other: { capacity: 60, perSecond: 2 },
} as const;

export type LimitKind = keyof typeof LIMITS;

interface Bucket {
  tokens: number;
  at: number;
}

export interface RateLimiter {
  /** Take one token. `false` means refuse. */
  take: (key: string, kind: LimitKind) => boolean;
  /** How many keys are being tracked, so a test can prove the table does not grow without bound. */
  size: () => number;
}

/**
 * A token bucket per (key, kind).
 *
 * In memory, and that is stated rather than hidden: behind two processes each gets its own buckets
 * and the effective limit doubles. For a single box — which is what `SPEC.md` I1 describes — it is
 * exact, and the alternative is a shared store on the path of every request, which is a worse trade
 * for a chess server than a limit that is loose by a factor of the number of boxes.
 */
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();
  /** Swept when the table gets big, so a stream of unique keys cannot grow it without bound. */
  let nextSweep = 0;

  return {
    take(key, kind) {
      const limit = LIMITS[kind];
      const at = now();
      const id = `${kind}:${key}`;

      /*
       * Housekeeping, amortised.
       *
       * Every distinct key makes an entry, and an attacker can produce keys faster than legitimate
       * users can. A bucket that has been full for a while is indistinguishable from one that never
       * existed, so it is simply dropped — and the sweep only runs when the table is large enough to
       * be worth walking.
       */
      if (buckets.size > 10_000 && at > nextSweep) {
        nextSweep = at + 60_000;
        for (const [existing, bucket] of buckets) {
          const full = bucket.tokens + ((at - bucket.at) / 1000) * limit.perSecond >= limit.capacity;
          if (full) buckets.delete(existing);
        }
      }

      const bucket = buckets.get(id) ?? { tokens: limit.capacity, at };
      // Refilled by however long it has been, capped at the bucket's size.
      const refilled = Math.min(limit.capacity, bucket.tokens + ((at - bucket.at) / 1000) * limit.perSecond);

      if (refilled < 1) {
        // Refused. The clock is still advanced so the refusal itself does not reset the refill.
        buckets.set(id, { tokens: refilled, at });
        return false;
      }

      buckets.set(id, { tokens: refilled - 1, at });
      return true;
    },
    size() {
      return buckets.size;
    },
  };
}

/**
 * Which limit a request falls under.
 *
 * By path and method rather than by anything a caller controls, so it cannot be talked out of the
 * tight bucket by claiming to be doing something else.
 */
export function limitFor(method: string, path: string): LimitKind {
  if (method === 'POST' && path === '/api/game') return 'create';
  // A rematch makes a game, so it is charged as one — the tight bucket, not the generous move one.
  if (method === 'POST' && path.endsWith('/rematch')) return 'create';
  if (method === 'POST' && path.endsWith('/move')) return 'move';
  if (method === 'POST' && path === '/api/pool/claim') return 'claim';
  if (method === 'GET' && path.startsWith('/api/game/')) return 'poll';
  return 'other';
}
