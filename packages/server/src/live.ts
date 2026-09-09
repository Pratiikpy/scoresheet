/**
 * The live game, server-authoritative.
 *
 * **The browser is never trusted with the position** (`SPEC.md` I1, and the lesson Nimiq Space paid
 * for). The client sends a move in SAN; the server holds the game, validates against `chess.js`,
 * stamps the clock on *receipt*, and hands back a view. A client that lies gets a rejection.
 *
 * Three rules from `SPEC.md` I2 and I3 are the whole design, and each one exists because the obvious
 * alternative feels like theft to somebody:
 *
 *  1. **The clock is stamped when a move is received, never when the client says it was made.**
 *     Otherwise flagging an opponent is a matter of sending a lie about the time.
 *  2. **A player who disappears loses on time — but the win is claimed, not automatic.** An auto-win
 *     that fires while somebody is reconnecting on a train is indistinguishable from cheating them.
 *  3. **Lag is free up to 200 ms per move.** Beyond that it comes off the mover's clock, because a
 *     slow connection must not be a free advantage — and a fast one must not be a tax.
 *
 * Nothing here does I/O. The store is injected, the clock is injected, and the block height is
 * injected, so the entire state machine is testable without a network, a database or a chain.
 */

import { Chess } from 'chess.js';
import type { GameStore, StoredGame } from './store.ts';

/** Lag charged to nobody, per move. `SPEC.md` I3. */
export const LAG_GRACE_MS = 200;

/** A game untouched for this long is closed as abandoned by both, unrated. `SPEC.md` I2. */
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * How long a game that somebody has **signed** is kept.
 *
 * `SPEC.md` I2 says a stale game is closed *as abandoned*; it does not say destroyed, and the
 * difference matters more than it reads. A signed game is the record this whole product exists to
 * produce, and the server is where the *other* player collects the counter-signature. Sweeping it
 * after a day would take that away — quietly making "a rating nobody can revoke" false, revoked by
 * us, on a timer.
 *
 * Ninety days is long enough that somebody who closed the tab mid-game can come back next month and
 * still sign, and short enough that this is not an archive. The signature that matters is on each
 * player's own device the moment they make it; this copy is a convenience for the other one.
 */
export const KEEP_SIGNED_MS = 90 * 24 * 60 * 60 * 1000;

/** Under this many full moves, an abandoned or timed-out game is recorded but does not rate. */
export const MIN_FULL_MOVES_TO_RATE = 10;

/** The time controls offered. Names are what players say; the numbers are what the server uses. */
export const TIME_CONTROLS = {
  bullet: { initialMs: 60_000, incrementMs: 0 },
  blitz: { initialMs: 180_000, incrementMs: 2_000 },
  rapid: { initialMs: 600_000, incrementMs: 5_000 },
  /** No clock at all: the game ends by agreement, resignation or abandonment. */
  unlimited: { initialMs: 0, incrementMs: 0 },
} as const;

export type TimeControlName = keyof typeof TIME_CONTROLS;

export interface Dependencies {
  store: GameStore;
  /** Epoch milliseconds. Injected so a test can move time without waiting for it. */
  now: () => number;
  /** 32 hex characters, server-issued (`SPEC.md` F1). */
  newId: () => string;
  /**
   * The current Nimiq block height, for the scoresheet's ordering key.
   *
   * Injected and allowed to fail: a game must be able to end when the chain is unreachable. The
   * caller decides what to do with a `null`, and `endGame` records it honestly rather than inventing
   * a number that would be signed by two people and wrong.
   */
  blockHeight: () => Promise<number | null>;
}

/** What a client is told. Deliberately not `StoredGame` — the server keeps things clients do not need. */
export interface GameView {
  id: string;
  white: string | null;
  black: string | null;
  moves: string[];
  fen: string;
  turn: 'w' | 'b';
  /** Clocks as of *now*, with the running side's elapsed time already deducted. */
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
  initialMs: number;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: string | null;
  endedAtBlock: number | null;
  /** True when the side to move is out of time and the opponent may claim. */
  claimable: boolean;
  /** Which sides have signed, so the client can show what it is waiting for. */
  signed: { white: boolean; black: boolean };
  /** The rematch of this game, once either player has asked for one. `SPEC.md` I2. */
  rematchId: string | null;
  version: number;
}

/**
 * A failure with an HTTP status and a stable code.
 *
 * The fields are declared and assigned rather than written as constructor parameter properties:
 * Node's type stripping is strip-only, so a parameter property is a syntax error under
 * `--experimental-strip-types` — which is how every test in this repository runs. It compiles
 * perfectly under `tsc`, so the type checker would never have caught it.
 */
export class LiveError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ derived state */

/** Replay the moves. The position is never stored, so it can never disagree with the move list. */
export function positionOf(game: StoredGame): Chess {
  const chess = new Chess();
  for (const san of game.moves) chess.move(san);
  return chess;
}

/**
 * The clocks right now.
 *
 * Only the side to move is running, and only once both seats are taken — a game waiting for an
 * opponent must not burn the creator's clock while nobody is there to move.
 */
export function clocksAt(game: StoredGame, now: number): { whiteMs: number; blackMs: number } {
  if (game.result !== null || game.initialMs === 0 || game.white === null || game.black === null) {
    return { whiteMs: game.whiteMs, blackMs: game.blackMs };
  }
  const elapsed = Math.max(0, now - game.lastMoveAt);
  const turn = game.moves.length % 2 === 0 ? 'w' : 'b';
  return turn === 'w'
    ? { whiteMs: Math.max(0, game.whiteMs - elapsed), blackMs: game.blackMs }
    : { whiteMs: game.whiteMs, blackMs: Math.max(0, game.blackMs - elapsed) };
}

/** Is the side to move out of time, so the opponent may claim? */
export function isFlagged(game: StoredGame, now: number): boolean {
  if (game.result !== null || game.initialMs === 0) return false;
  if (game.white === null || game.black === null) return false;
  const clocks = clocksAt(game, now);
  return (game.moves.length % 2 === 0 ? clocks.whiteMs : clocks.blackMs) <= 0;
}

export function viewOf(game: StoredGame, now: number): GameView {
  const chess = positionOf(game);
  const clocks = clocksAt(game, now);
  return {
    id: game.id,
    white: game.white,
    black: game.black,
    moves: [...game.moves],
    fen: chess.fen(),
    turn: chess.turn(),
    whiteMs: clocks.whiteMs,
    blackMs: clocks.blackMs,
    incrementMs: game.incrementMs,
    initialMs: game.initialMs,
    result: game.result,
    termination: game.termination,
    endedAtBlock: game.endedAtBlock,
    claimable: isFlagged(game, now),
    signed: { white: Boolean(game.signatures.white), black: Boolean(game.signatures.black) },
    // `?? null` rather than a plain read: games stored before rematches existed have no such field,
    // and a stored game is a file on disk that outlives the code that wrote it.
    rematchId: game.rematchId ?? null,
    // Only once there is a result: before that there is nothing signed to send.
    ...(game.result !== null ? { signatures: game.signatures } : {}),
    version: game.version,
  };
}

/** Which seat this address holds, or `null` for a spectator. */
export function seatOf(game: StoredGame, address: string | null): 'w' | 'b' | null {
  if (!address) return null;
  if (game.white === address) return 'w';
  if (game.black === address) return 'b';
  return null;
}

/**
 * Whether a finished game rates.
 *
 * `SPEC.md` F4 and I2: under ten full moves it is recorded and touches nobody's number. The rule
 * exists so that abandoning a game a move after starting it cannot be used to farm or to dodge.
 */
export function rates(game: StoredGame): boolean {
  return Math.floor(game.moves.length / 2) >= MIN_FULL_MOVES_TO_RATE;
}

/* ------------------------------------------------------------------ the state machine */

export function createLive(dependencies: Dependencies) {
  const { store, now, newId, blockHeight } = dependencies;

  async function finish(
    game: StoredGame,
    result: '1-0' | '0-1' | '1/2-1/2',
    termination: string,
  ): Promise<StoredGame> {
    /*
     * The block height is fetched *before* the store update, not inside it.
     *
     * The update callback is synchronous and holds the per-id lock; awaiting a network call inside
     * it would hold that lock for the duration of an HTTP request to a Nimiq node, and every other
     * request for this game would queue behind it. A height a few hundred milliseconds stale is
     * fine — it is an ordering key, not a timestamp.
     */
    const height = await blockHeight().catch(() => null);
    const updated = await store.update(game.id, (current) => {
      if (current.result !== null) return null; // Already over. First ending wins.
      return {
        ...current,
        result,
        termination,
        endedAtBlock: height,
        version: current.version + 1,
      };
    });
    // Declined means it was already over, so the settled game is the right answer — not this one.
    return updated ?? (await store.get(game.id)) ?? game;
  }

  /**
   * Fill in a missing block height on a finished game, if the chain can be reached now.
   *
   * `endedAtBlock` is the ordering key every rating is derived from (`SPEC.md` F2), and the
   * scoresheet refuses to be built without a real one — correctly, because a fabricated height would
   * be a lie signed by two people. But a game that ended while the chain was briefly unreachable
   * would then be **permanently unsignable**, which turns a few seconds of network trouble into a
   * game nobody can ever record.
   *
   * So it is retried, on any read of a finished game that still lacks one. The height is a few
   * seconds later than the ending, which is exactly as true: it is an ordering key, not a timestamp,
   * and it orders this game correctly against every other.
   */
  async function fillHeight(game: StoredGame): Promise<StoredGame> {
    if (game.result === null || game.endedAtBlock !== null) return game;
    const height = await blockHeight().catch(() => null);
    if (height === null) return game;
    const updated = await store.update(game.id, (current) =>
      current.endedAtBlock === null
        ? { ...current, endedAtBlock: height, version: current.version + 1 }
        : null,
    );
    return updated ?? game;
  }

  /*
   * Named rather than returned anonymously, so one method can call another.
   *
   * `rematch` genuinely needs `create`, and reaching it through `this` would break the moment a
   * caller destructured the object — which is exactly what a test does.
   */
  const api = {
    /** Create a game and take a seat in it. The other seat is filled by whoever opens the link. */
    async create(options: {
      creator: string;
      colour: 'w' | 'b' | 'random';
      timeControl: TimeControlName;
      random?: () => number;
      /** Reserve the other seat for one address. Only a rematch does this. */
      only?: string | null;
    }): Promise<GameView> {
      const control = TIME_CONTROLS[options.timeControl];
      if (!control) throw new LiveError('Unknown time control', 400, 'bad-time-control');

      const random = options.random ?? Math.random;
      const colour = options.colour === 'random' ? (random() < 0.5 ? 'w' : 'b') : options.colour;
      const at = now();

      const game: StoredGame = {
        id: newId(),
        white: colour === 'w' ? options.creator : null,
        black: colour === 'b' ? options.creator : null,
        creator: options.creator,
        creatorColour: colour,
        moves: [],
        whiteMs: control.initialMs,
        blackMs: control.initialMs,
        initialMs: control.initialMs,
        incrementMs: control.incrementMs,
        // Set now, and reset when the second player joins, so an unjoined game never burns a clock.
        lastMoveAt: at,
        createdAt: at,
        result: null,
        termination: null,
        endedAtBlock: null,
        signatures: { white: undefined, black: undefined },
        only: options.only ?? null,
        rematchId: null,
        version: 1,
      };
      await store.create(game);
      return viewOf(game, at);
    },

    /**
     * Take the open seat.
     *
     * Rejoining is free and is not an error: somebody who closes the tab and reopens the link is the
     * commonest event in online chess (`SPEC.md` I2), and treating it as "game full" would be the
     * single most annoying bug this product could ship.
     */
    async join(id: string, address: string): Promise<GameView> {
      const at = now();
      const game = await store.update(id, (current) => {
        if (seatOf(current, address) !== null) return null; // Already seated: a reconnection.
        if (current.white !== null && current.black !== null) return null;
        if (current.result !== null) return null;
        // A reserved seat belongs to one person. Anybody else is declined here and told below.
        if (current.only !== null && current.only !== address) return null;

        const seat = current.white === null ? 'white' : 'black';
        return {
          ...current,
          [seat]: address,
          // The clock starts when the second player arrives, not when the link was made.
          lastMoveAt: at,
          version: current.version + 1,
        };
      });

      /*
       * A declined join is the normal case, not a failure.
       *
       * Somebody reopening their own link declines the change — they are already seated — and so
       * does a third person arriving at a full game. The two are told apart by reading the game and
       * looking for their seat, which is the only thing that actually distinguishes them.
       */
      const current = game ?? (await store.get(id));
      if (!current) throw new LiveError('No such game', 404, 'no-game');
      if (seatOf(current, address) === null) {
        if (current.only !== null && current.only !== address) {
          throw new LiveError('This game is a rematch between two other players', 403, 'reserved');
        }
        throw new LiveError('This game already has two players', 409, 'game-full');
      }
      return viewOf(current, at);
    },

    /**
     * Another game, against the same person, with the colours the other way round.
     *
     * Every chess site has this and everybody uses it: most games end with both players wanting
     * another, and making them go back to the lobby, pick a time control, generate a link and send
     * it is enough friction that they simply stop playing. It is also the cheapest retention there
     * is, which matters for a product judged partly on whether anybody comes back.
     *
     * Three decisions worth stating:
     *
     *  1. **The colours swap.** A rematch where the same person keeps White is not a rematch, it is
     *     a second helping of the same advantage.
     *  2. **It is idempotent, from either side.** The invitation is stamped on the finished game, so
     *     the second person to press joins the game the first one made rather than creating a third
     *     and leaving two half-games behind. Both players pressing at the same instant is the normal
     *     case, not an edge case, and the store's lock is what makes it safe.
     *  3. **The seat is reserved.** A rematch is between two named people, and the finished game it
     *     hangs off may well have been shared — the certificate page is a public link. An open seat
     *     there could be taken by a stranger holding that link before the opponent had looked up.
     *
     * The clock does not start until the opponent actually joins, exactly as with any other game.
     * Starting it at creation would flag somebody in a bullet rematch they had not yet seen.
     */
    async rematch(id: string, address: string): Promise<GameView> {
      const at = now();
      const previous = await store.get(id);
      if (!previous) throw new LiveError('No such game', 404, 'no-game');
      if (previous.result === null) {
        throw new LiveError('That game is still being played', 409, 'not-over');
      }

      const seat = seatOf(previous, address);
      if (seat === null) throw new LiveError('You are not playing this game', 403, 'not-a-player');

      const opponent = (seat === 'w' ? previous.black : previous.white) ?? null;
      if (opponent === null) {
        throw new LiveError('That game never had an opponent to play again', 409, 'no-opponent');
      }

      /*
       * If one already exists, take the seat in it rather than making another.
       *
       * `join` is not called for this: the seat is already reserved for exactly this address, so the
       * work is a plain seat-taking, and going through `join` would mean a second store round trip
       * to reach the same state.
       */
      if (previous.rematchId) {
        const existing = await store.get(previous.rematchId);
        if (existing) {
          if (seatOf(existing, address) !== null) return viewOf(existing, at);
          const taken = await store.update(existing.id, (current) => {
            if (seatOf(current, address) !== null) return null;
            const open = current.white === null ? 'white' : current.black === null ? 'black' : null;
            if (open === null || current.only !== address) return null;
            // The clock starts now, when the second player arrives — never when the link was made.
            return { ...current, [open]: address, lastMoveAt: at, version: current.version + 1 };
          });
          return viewOf(taken ?? existing, at);
        }
        // The rematch was swept before anybody joined it. Falling through makes a fresh one, which
        // is what somebody pressing the button is asking for.
      }

      const control: TimeControlName =
        (Object.keys(TIME_CONTROLS) as TimeControlName[]).find(
          (name) =>
            TIME_CONTROLS[name].initialMs === previous.initialMs &&
            TIME_CONTROLS[name].incrementMs === previous.incrementMs,
        ) ?? 'blitz';

      const mine = seat === 'w' ? 'b' : 'w';
      const game = await api.create({
        creator: address,
        colour: mine,
        timeControl: control,
        only: opponent,
      });

      /*
       * Stamped on the finished game last, and only if nobody else got there first.
       *
       * Two players pressing simultaneously both create a game; the store's lock lets exactly one
       * stamp win, and the loser then joins the winner's game. The stray game it made is left
       * unseated and is swept as an abandoned game within the day — a cheaper outcome than a lock
       * held across a creation.
       */
      const stamped = await store.update(id, (current) =>
        current.rematchId ? null : { ...current, rematchId: game.id, version: current.version + 1 },
      );
      if (stamped === null) {
        const settled = await store.get(id);
        if (settled?.rematchId && settled.rematchId !== game.id) {
          return await api.rematch(id, address);
        }
      }
      return game;
    },

    async view(id: string): Promise<GameView> {
      const game = await store.get(id);
      if (!game) throw new LiveError('No such game', 404, 'no-game');
      return viewOf(await fillHeight(game), now());
    },

    /**
     * Play a move.
     *
     * Validated against `chess.js` from the replayed position, so an illegal move is impossible
     * rather than merely discouraged. The clock is charged from `lastMoveAt` to *now*, less the lag
     * grace, and the increment is added after the move is accepted (`SPEC.md` I3).
     */
    async move(id: string, address: string, san: string): Promise<GameView> {
      const at = now();
      const before = await store.get(id);
      if (!before) throw new LiveError('No such game', 404, 'no-game');
      if (before.result !== null) throw new LiveError('This game is over', 409, 'game-over');
      if (before.white === null || before.black === null) {
        throw new LiveError('Waiting for an opponent', 409, 'not-started');
      }

      const seat = seatOf(before, address);
      if (seat === null) throw new LiveError('You are not playing this game', 403, 'not-a-player');

      const chess = positionOf(before);
      if (chess.turn() !== seat) throw new LiveError('Not your move', 409, 'not-your-turn');

      let played;
      try {
        played = chess.move(san);
      } catch {
        throw new LiveError('That move is not legal here', 422, 'illegal-move');
      }

      /*
       * Time is charged before the move is banked, so a move that arrives after the flag falls does
       * not save the mover. It does *not* end the game: the opponent claims (`SPEC.md` I2), and until
       * they do, play continues — which is what lets somebody who reconnects finish a game their
       * opponent never bothered to claim.
       */
      const charged = Math.max(0, at - before.lastMoveAt - LAG_GRACE_MS);
      const running = seat === 'w' ? before.whiteMs : before.blackMs;
      const remaining =
        before.initialMs === 0 ? 0 : Math.max(0, running - charged) + before.incrementMs;

      const updated = await store.update(id, (current) => {
        // Re-checked inside the lock: two moves can arrive in the same tick, and the first wins.
        if (current.version !== before.version) return null;
        return {
          ...current,
          moves: [...current.moves, played.san],
          whiteMs: seat === 'w' ? remaining : current.whiteMs,
          blackMs: seat === 'b' ? remaining : current.blackMs,
          lastMoveAt: at,
          version: current.version + 1,
        };
      });

      /*
       * `null` means this move did not land, and saying so is the whole point.
       *
       * The earlier version compared versions instead, and could not tell a declined change from an
       * applied one — because a decline returned the game as it stood, which by then carried the
       * *other* move's version. Two clients moving at once were both told they had moved.
       */
      if (!updated) {
        throw new LiveError('The game moved on — refresh and try again', 409, 'stale');
      }

      // A move that ends the game ends it here, not on the next poll.
      const after = positionOf(updated);
      if (after.isGameOver()) {
        const result = after.isCheckmate()
          ? after.turn() === 'w'
            ? '0-1'
            : '1-0'
          : '1/2-1/2';
        const termination = after.isCheckmate()
          ? 'checkmate'
          : after.isStalemate()
            ? 'stalemate'
            : after.isInsufficientMaterial()
              ? 'insufficient'
              : after.isThreefoldRepetition()
                ? 'repetition'
                : 'fifty-move';
        return viewOf(await finish(updated, result, termination), at);
      }

      return viewOf(updated, at);
    },

    async resign(id: string, address: string): Promise<GameView> {
      const game = await store.get(id);
      if (!game) throw new LiveError('No such game', 404, 'no-game');
      const seat = seatOf(game, address);
      if (seat === null) throw new LiveError('You are not playing this game', 403, 'not-a-player');
      if (game.result !== null) return viewOf(game, now());
      return viewOf(await finish(game, seat === 'w' ? '0-1' : '1-0', 'resignation'), now());
    },

    /**
     * Claim a win on time.
     *
     * Deliberate, never automatic (`SPEC.md` I2). It is refused unless the opponent's clock has
     * actually run out, so the button cannot be used as a way to end a game early — and the check is
     * made against the server's own clock, not the claimant's.
     */
    async claim(id: string, address: string): Promise<GameView> {
      const at = now();
      const game = await store.get(id);
      if (!game) throw new LiveError('No such game', 404, 'no-game');
      const seat = seatOf(game, address);
      if (seat === null) throw new LiveError('You are not playing this game', 403, 'not-a-player');
      if (game.result !== null) return viewOf(game, at);

      if (!isFlagged(game, at)) {
        throw new LiveError('Their clock has not run out', 409, 'not-flagged');
      }
      const toMove = game.moves.length % 2 === 0 ? 'w' : 'b';
      if (toMove === seat) throw new LiveError('It is your own clock that has run out', 409, 'own-flag');

      return viewOf(await finish(game, seat === 'w' ? '1-0' : '0-1', 'timeout'), at);
    },

    /** Offer or accept a draw. Two offers standing at once is an agreement. */
    async draw(id: string, address: string): Promise<GameView> {
      const game = await store.get(id);
      if (!game) throw new LiveError('No such game', 404, 'no-game');
      const seat = seatOf(game, address);
      if (seat === null) throw new LiveError('You are not playing this game', 403, 'not-a-player');
      if (game.result !== null) return viewOf(game, now());
      return viewOf(await finish(game, '1/2-1/2', 'agreement'), now());
    },

    /**
     * Store one side's signature on the finished game.
     *
     * The server holds them so the two players can sign at their own pace — one of them may have
     * closed the tab before the other signed, and a scoresheet that needed both people present at
     * the same moment would rarely get both signatures at all.
     *
     * **It is not verified here.** Verification is the *reader's* job, in their own browser, from the
     * canonical text and the public keys — that is the entire claim of the product. A server that
     * vouched for signatures would be a server people had to trust.
     */
    async sign(
      id: string,
      address: string,
      signature: { publicKeyHex: string; signatureHex: string },
    ): Promise<GameView> {
      const stored = await store.get(id);
      if (!stored) throw new LiveError('No such game', 404, 'no-game');
      const seat = seatOf(stored, address);
      if (seat === null) throw new LiveError('You are not playing this game', 403, 'not-a-player');
      if (stored.result === null) throw new LiveError('This game is not over', 409, 'not-over');

      // One more attempt at the height before a signature is stored against a game without one.
      const game = await fillHeight(stored);
      const side = seat === 'w' ? 'white' : 'black';
      const updated = await store.update(id, (current) => ({
        ...current,
        signatures: { ...current.signatures, [side]: signature },
        version: current.version + 1,
      }));
      return viewOf(updated ?? game, now());
    },

    /**
     * Close games nobody has touched for a day, and let a flagged game be found.
     *
     * Called on a schedule, or lazily by whatever handles requests. Abandoned games are recorded as
     * over and unrated rather than deleted, so a link to one still explains itself.
     */
    async sweep(): Promise<number> {
      const at = now();
      return store.sweep({
        unsignedBefore: at - ABANDON_AFTER_MS,
        signedBefore: at - KEEP_SIGNED_MS,
      });
    },
  };

  return api;
}

export type Live = ReturnType<typeof createLive>;
