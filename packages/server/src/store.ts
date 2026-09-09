/**
 * Where live games live, behind one interface with two implementations.
 *
 * The shape is lifted from `chit` (`SPEC.md` I1): **one storage interface, a file-backed
 * implementation for a box and an object-store implementation for serverless**, so choosing a host
 * is a deployment decision rather than a rewrite. Everything above this line is written once.
 *
 * Two properties the game logic depends on, and both are the interface's job rather than the
 * caller's:
 *
 *  1. **`update` is a read-modify-write under a lock.** Two moves arriving in the same tick must not
 *     interleave — chess is a state machine and a lost update is a lost move, or worse, an accepted
 *     illegal one. Every implementation must make the callback atomic with respect to the same id.
 *  2. **A missing game is `null`, never a throw.** Games expire, and a link shared last week landing
 *     on a 404 page is a normal outcome that the client renders as a sentence.
 */

/** A stored game, as the server keeps it. The client never sees this shape directly. */
export interface StoredGame {
  id: string;
  /** Wallet addresses, or `null` for a seat nobody has taken yet. */
  white: string | null;
  black: string | null;
  /** Whoever created it, so the seat they chose is theirs when they reconnect. */
  creator: string;
  /** The colour the creator took. The joiner gets the other one. */
  creatorColour: 'w' | 'b';
  /** SAN moves, in order. This is the whole game — the position is derived, never stored. */
  moves: string[];
  /** Milliseconds left on each clock, as of `lastMoveAt`. */
  whiteMs: number;
  blackMs: number;
  /** The time control this game was created with. */
  initialMs: number;
  incrementMs: number;
  /** When the last move was received, in epoch milliseconds, by the server's clock. */
  lastMoveAt: number;
  createdAt: number;
  /** Set once the game is over, and never unset. */
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: string | null;
  /** The Nimiq block height stamped when the game ended, for the scoresheet's ordering key. */
  endedAtBlock: number | null;
  /** Signatures collected after the end, one per side, so both can sign at their own pace. */
  signatures: Record<'white' | 'black', { publicKeyHex: string; signatureHex: string } | undefined>;
  /**
   * The address allowed to take the remaining seat, or `null` for whoever opens the link.
   *
   * Only a rematch sets it. An ordinary game is a link somebody sends to a person of their choosing,
   * and the server has no idea who that is; a rematch is between two people it already knows by
   * name, and its id is reachable from a finished game that may well have been shared publicly. Left
   * open, a stranger holding a certificate link could take the seat before the opponent noticed.
   */
  only: string | null;
  /**
   * The rematch of this game, once either player has asked for one.
   *
   * Stored on the **finished** game rather than announced some other way, because the finished game
   * is the thing both players are already looking at: the second player's ordinary poll carries the
   * invitation without any new channel, and pressing Rematch twice joins the same game rather than
   * making a third.
   */
  rematchId: string | null;
  /** Bumped on every change, so a poll can say "nothing new" without sending the game. */
  version: number;
}

export interface GameStore {
  create: (game: StoredGame) => Promise<void>;
  get: (id: string) => Promise<StoredGame | null>;
  /**
   * Read, change, write — atomically for this id.
   *
   * Returning `null` from `change` declines the change, leaving the stored game untouched. **The
   * result is `null` whenever the change did not apply** — declined, or no such game — and the new
   * game whenever it did.
   *
   * That contract was not the first one, and the first one was wrong. It returned the *current*
   * game on a decline, which is indistinguishable from success to every caller: two moves racing
   * produced one move in the store and two clients each told their move had been accepted. The
   * store was right and the answer was a lie, which is the worse of the two failures. A caller that
   * wants the game after a decline can read it, and `join` does exactly that.
   */
  update: (id: string, change: (game: StoredGame) => StoredGame | null) => Promise<StoredGame | null>;
  /**
   * Remove games nobody needs any more. Returns how many went.
   *
   * **Two ages, not one, and the reason is the whole product.** The first version swept *anything*
   * older than a day — including finished games that both players had signed. That is the record
   * the app exists to produce: deleting it takes away the one place the second player could collect
   * the other signature, and quietly makes "a rating nobody can revoke" false, revoked by us, on a
   * timer. `SPEC.md` I2 says a stale game is closed **as abandoned**; it does not say destroyed.
   *
   * So an unsigned game goes after a day, and a signed one is kept far longer — long enough that
   * somebody who closed the tab mid-game can come back next month and still sign.
   */
  sweep: (policy: { unsignedBefore: number; signedBefore: number }) => Promise<number>;
}

/**
 * In memory, with a per-id promise chain for atomicity.
 *
 * Correct for a single process — which is a box, and which is also every test. The chain is the
 * whole lock: each `update` for an id waits on the previous one for that id, so two moves arriving
 * together are applied in order rather than read-read-write-write.
 */
export function createMemoryStore(): GameStore {
  const games = new Map<string, StoredGame>();
  const queues = new Map<string, Promise<unknown>>();

  function serialise<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.then(work, work);
    // The chain must not retain failures, or one rejected update poisons every later one.
    queues.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  return {
    async create(game) {
      games.set(game.id, game);
    },
    async get(id) {
      return games.get(id) ?? null;
    },
    update(id, change) {
      return serialise(id, async () => {
        const current = games.get(id);
        if (!current) return null;
        const next = change(current);
        // Declined. `null` means "your change did not apply", and it is the caller's job to decide
        // whether that is a conflict or an expected no-op.
        if (!next) return null;
        games.set(id, next);
        return next;
      });
    },
    async sweep(policy) {
      let gone = 0;
      for (const [id, game] of games) {
        if (!expired(game, policy)) continue;
        games.delete(id);
        queues.delete(id);
        gone += 1;
      }
      return gone;
    },
  };
}

/**
 * Whether a stored game may be deleted.
 *
 * Shared by both stores so the rule cannot differ between a box and a test — which is exactly the
 * kind of divergence that would let a signed game survive every test and be deleted in production.
 */
export function expired(
  game: StoredGame,
  policy: { unsignedBefore: number; signedBefore: number },
): boolean {
  const signed = Boolean(game.signatures.white ?? game.signatures.black);
  return game.lastMoveAt < (signed ? policy.signedBefore : policy.unsignedBefore);
}
