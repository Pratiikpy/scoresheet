/**
 * A chess clock, for a game with no server in it.
 *
 * The live game's clock is the *server's* (`packages/server/src/live.ts`), and it has to be: two
 * people cannot be trusted to agree on the time. A game against the bot has one device and no
 * dispute, so the clock is here — and being local is what makes it exact rather than approximate,
 * since there is no network to charge anybody for.
 *
 * ## Why a bot game has a clock at all
 *
 * Because the reference has one. Lichess's setup shares `timeControl` / `realTime` / `unlimited` /
 * `minutesPerSide` between human and computer games — checked in `lila/translation/source/site.xml`
 * rather than assumed — so playing the machine to a clock is an ordinary thing a chess player
 * expects, and practising blitz against a bot is one of the commonest uses of one.
 *
 * ## The two rules that make it feel right
 *
 *  1. **The bot is charged for its own thinking.** It really does take time to answer, and a clock
 *     that only ran on the human's side would be a stopwatch, not a chess clock. The bot's budget is
 *     hundreds of milliseconds, so it will not flag — but the number moves, and a player watching
 *     both clocks can see it think.
 *  2. **A takeback restores the clocks.** The alternative is somebody taking a move back and finding
 *     their time gone, which reads as a bug. Bot games are never rated (`SPEC.md` P3), so there is
 *     nothing here to farm.
 */

import { TIME_CONTROLS, type TimeControlName } from './settings.ts';

/** `183000` → `3:03`. Under ten seconds it gains a decimal, which is what blitz players expect. */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10_000) return (total / 1000).toFixed(1);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface ClockState {
  /** Milliseconds left, as of `since`. */
  whiteMs: number;
  blackMs: number;
  /** Whose clock is running, or `null` when nothing is. */
  running: 'w' | 'b' | null;
  /** When the running side's clock last started, in epoch milliseconds. */
  since: number;
}

export interface Clock {
  /** Whether there is a clock at all. `false` for an untimed game, and then nothing is drawn. */
  readonly timed: boolean;
  /** Milliseconds left right now, with the running side's elapsed time already deducted. */
  readonly left: { w: number; b: number };
  readonly running: 'w' | 'b' | null;
  /** Start the clock for a side. Called when a game begins and after every move. */
  start: (side: 'w' | 'b') => void;
  /** Stop, charging the running side. Returns whether that side has run out. */
  stop: () => boolean;
  /**
   * A move was played: charge the mover, add the increment, and hand the clock over.
   *
   * Returns `true` when the mover had already run out — which is a flag, and the caller decides
   * what that means for the game.
   */
  played: (by: 'w' | 'b') => boolean;
  /** Has the side to move run out? Asked by the ticker, between moves. */
  flagged: () => 'w' | 'b' | null;
  /** A snapshot, so a takeback can put the clocks back where they were. */
  snapshot: () => ClockState;
  restore: (state: ClockState) => void;
  reset: () => void;
}

export interface ClockOptions {
  control: TimeControlName;
  /** Injected so a test can move time without waiting for it. */
  now?: () => number;
}

export function createClock(options: ClockOptions): Clock {
  /*
   * `Date.now()` is *called*, not captured.
   *
   * `options.now ?? Date.now` binds the function that exists at construction, so a clock built
   * before anything replaced `Date.now` would keep reading the original for its whole life. Calling
   * through costs nothing and means the clock reads whatever the page's clock currently is — which
   * is what lets `scripts/look.mjs` test a flag without waiting a real minute for one.
   */
  const now = options.now ?? (() => Date.now());
  // Widened deliberately: `TIME_CONTROLS` is `as const` so its members are literal types, and a
  // clock that can only ever hold its own starting number is not a clock.
  const control: { initialMs: number; incrementMs: number } = TIME_CONTROLS[options.control];

  let whiteMs: number = control.initialMs;
  let blackMs: number = control.initialMs;
  let running: 'w' | 'b' | null = null;
  let since = now();

  /** What is left for one side right now, with the running side's elapsed time taken off. */
  function leftFor(side: 'w' | 'b'): number {
    const stored = side === 'w' ? whiteMs : blackMs;
    if (running !== side) return stored;
    return Math.max(0, stored - (now() - since));
  }

  /** Bank the running side's elapsed time. Idempotent: calling it twice charges once. */
  function charge(): void {
    if (running === null) return;
    const spent = now() - since;
    if (running === 'w') whiteMs = Math.max(0, whiteMs - spent);
    else blackMs = Math.max(0, blackMs - spent);
    since = now();
  }

  return {
    // An untimed control is a clock that is present and does nothing, rather than a `null` every
    // caller has to test. `initialMs === 0` is the whole of "no clock".
    get timed() {
      return control.initialMs > 0;
    },
    get left() {
      return { w: leftFor('w'), b: leftFor('b') };
    },
    get running() {
      return running;
    },
    start(side) {
      charge();
      running = side;
      since = now();
    },
    stop() {
      const side = running;
      charge();
      running = null;
      if (side === null) return false;
      return (side === 'w' ? whiteMs : blackMs) <= 0;
    },
    played(by) {
      charge();
      const out = (by === 'w' ? whiteMs : blackMs) <= 0;
      /*
       * The increment is added **after** the move, and not to a side that has already run out.
       *
       * Adding it first would let somebody who is out of time move once more and gain two seconds,
       * which is the one way a Fischer increment can be got wrong.
       */
      if (!out && control.incrementMs > 0) {
        if (by === 'w') whiteMs += control.incrementMs;
        else blackMs += control.incrementMs;
      }
      running = null;
      return out;
    },
    flagged() {
      /*
       * An untimed clock never flags, and that guard is not redundant.
       *
       * `'none'` starts both sides at zero, so without this every position in an untimed game reads
       * as out of time the instant the clock is started. The screen happens not to ask — it does not
       * tick an untimed game — but a clock that answers "White has lost on time" about a game with
       * no clock is wrong, and the next caller would have believed it.
       */
      if (!control.initialMs) return null;
      if (running === null) return null;
      return leftFor(running) <= 0 ? running : null;
    },
    snapshot() {
      /*
       * A snapshot is the clocks **as of now**, with the running side's elapsed time already banked.
       *
       * Returning the raw fields would capture `since` as well, so restoring it later would charge
       * the running side for everything that happened in between — a takeback would hand back the
       * position and keep the time. Measured: restoring a snapshot taken ten seconds into a move,
       * forty seconds later, left White thirty seconds short.
       */
      charge();
      return { whiteMs, blackMs, running: null, since: now() };
    },
    restore(state) {
      whiteMs = state.whiteMs;
      blackMs = state.blackMs;
      running = state.running;
      since = state.since;
    },
    reset() {
      whiteMs = control.initialMs;
      blackMs = control.initialMs;
      running = null;
      since = now();
    },
  };
}
