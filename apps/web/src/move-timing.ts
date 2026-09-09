/**
 * How long each move took, and how many were available — recorded from the first game onwards.
 *
 * **This exists now because it cannot exist retroactively.** Every serious fair-play system in chess
 * rests on move timing rather than on engine agreement: the published finding is that injecting one
 * or two engine moves into an otherwise honest game moves a single-signal detector's score from 0.51
 * to 0.82, so the realistic cheat is exactly the one that engine-matching misses. Timing, and the
 * relationship between time spent and how hard the position actually was, is what survives that.
 *
 * None of the analysis is built. That is fine; the analysis can be written next month. What cannot
 * be done next month is recovering the timings of games played this month, so the recording starts
 * before the thing that consumes it, and this file deliberately does nothing clever.
 *
 * ## What it is not
 *
 * - **Not signed, and not part of the scoresheet.** The canonical text is twelve lines and adding a
 *   thirteenth would invalidate every signature ever produced. Timings live beside the game, keyed
 *   by the same canonical text, exactly as the moves do.
 * - **Not evidence on its own.** A slow move means somebody was thinking, or made tea, or lost
 *   signal. It becomes a signal only in aggregate and only against a player's own history, which is
 *   the whole reason a per-player baseline is worth accumulating early.
 * - **Not a fingerprint of a person.** It records durations and a legal-move count. No device
 *   details, no network details, nothing that identifies anybody. If a future check needs more than
 *   this, that is a decision to take deliberately and to write down, not something to widen quietly.
 */

const KEY = 'scoresheet:timings';

/** One move, as the clock and the position saw it. */
export interface MoveTiming {
  /** Milliseconds from the position appearing to the move being made. */
  ms: number;
  /**
   * How many legal moves there were.
   *
   * The cheapest honest proxy for difficulty there is. A forced recapture and a quiet middlegame
   * choice take the same time on a stopwatch and are not the same decision, and without some measure
   * of that, time alone says almost nothing.
   */
  legal: number;
}

export interface StoredTiming {
  /** The exact signed text of the game these belong to. The only join key that means anything. */
  canonical: string;
  /** In play order, White first. One entry per move actually played. */
  moves: MoveTiming[];
  savedAt: number;
}

/**
 * How many games' timings to keep.
 *
 * `localStorage` is small and shared with the games themselves, and a baseline does not need a
 * lifetime — the recent hundred describe how somebody plays now, which is the comparison that
 * matters. Oldest goes first.
 */
const KEEP = 100;

function read(): StoredTiming[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as StoredTiming[]) : [];
  } catch {
    // A corrupt or unavailable store must never stop a game being played. This is the least
    // important thing on the device.
    return [];
  }
}

function write(all: StoredTiming[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-KEEP)));
  } catch {
    // Quota, private mode, or a browser that refuses storage. Losing a timing is not worth an error
    // in front of somebody who is playing chess.
  }
}

/**
 * Collect timings across one game.
 *
 * Deliberately a small object rather than a module-level singleton: two games can be open at once —
 * a bot game in one tab, a live game in another — and a shared accumulator would interleave them
 * into a record describing neither.
 */
export class MoveClock {
  private readonly moves: MoveTiming[] = [];
  private since: number;
  /*
   * Declared, not a constructor parameter property.
   *
   * `node --experimental-strip-types` is strip-only: it removes types and refuses anything that
   * would require emitting code, and `constructor(private now: ...)` is exactly that. The tests run
   * under it, so the shorthand is not available anywhere in this repository.
   */
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.since = this.now();
  }

  /** The position is on screen and it is somebody's turn. Called when the position changes. */
  ready(): void {
    this.since = this.now();
  }

  /** A move was made, with the number of legal moves that were available in that position. */
  played(legal: number): void {
    const at = this.now();
    // Clamped at zero: a clock that goes backwards (a device sleeping, a manual time change) would
    // otherwise write a negative duration that every later average has to defend itself against.
    this.moves.push({ ms: Math.max(0, at - this.since), legal });
    this.since = at;
  }

  /** What has been collected so far. A copy, so a caller cannot mutate the record in place. */
  collected(): MoveTiming[] {
    return this.moves.map((move) => ({ ...move }));
  }
}

/** Keep the timings for a finished game, joined to its signed text. */
export function saveTimings(canonical: string, moves: readonly MoveTiming[]): void {
  if (moves.length === 0) return;
  const all = read().filter((entry) => entry.canonical !== canonical);
  all.push({ canonical, moves: moves.map((move) => ({ ...move })), savedAt: Date.now() });
  write(all);
}

/** The timings for one game, if this device recorded them. */
export function timingsFor(canonical: string): MoveTiming[] | null {
  return read().find((entry) => entry.canonical === canonical)?.moves ?? null;
}

/** Everything recorded, oldest first. */
export function allTimings(): StoredTiming[] {
  return read();
}

/** Forget every timing. Wired to the same control that forgets games. */
export function forgetTimings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing worth saying.
  }
}

export interface TimingSummary {
  moves: number;
  medianMs: number;
  /**
   * Spearman-style agreement between how long a move took and how much choice there was, in −1..1.
   *
   * The single most useful number that can be computed from this data, and the reason `legal` is
   * recorded at all. A human spends longer when there is more to consider, so this is normally
   * positive. Play that is uniformly fast regardless of difficulty is the pattern the literature
   * describes, and it shows up here as a value near zero.
   *
   * **It is a description, not an accusation**, and it is far too noisy over one game to be either.
   */
  timeVersusChoice: number;
}

/** Summarise one game's timings. Pure, so it can be tested without a browser. */
export function summarise(moves: readonly MoveTiming[]): TimingSummary {
  if (moves.length === 0) return { moves: 0, medianMs: 0, timeVersusChoice: 0 };

  const sorted = [...moves].map((move) => move.ms).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!;

  return { moves: moves.length, medianMs, timeVersusChoice: correlation(moves) };
}

/**
 * Rank correlation between time taken and legal-move count.
 *
 * Ranks rather than raw values on purpose: thinking time is wildly skewed — one move in a game can
 * take a minute while the rest take two seconds — and a Pearson correlation over those raw numbers
 * would describe that single move rather than the player. Ties share the average rank, which is what
 * keeps a position with a forced reply from distorting the result.
 */
function correlation(moves: readonly MoveTiming[]): number {
  if (moves.length < 3) return 0;

  const rank = (values: readonly number[]): number[] => {
    const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length).fill(0);
    let at = 0;
    while (at < order.length) {
      let end = at;
      while (end + 1 < order.length && order[end + 1]!.value === order[at]!.value) end += 1;
      const shared = (at + end) / 2 + 1;
      for (let i = at; i <= end; i++) ranks[order[i]!.index] = shared;
      at = end + 1;
    }
    return ranks;
  };

  const times = rank(moves.map((move) => move.ms));
  const choices = rank(moves.map((move) => move.legal));
  const n = times.length;
  const mean = (n + 1) / 2;

  let top = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let i = 0; i < n; i++) {
    const a = times[i]! - mean;
    const b = choices[i]! - mean;
    top += a * b;
    leftSquares += a * a;
    rightSquares += b * b;
  }

  // Every value tied on one side leaves no variance to correlate with, and the honest answer is
  // "no relationship measured" rather than a division by zero.
  if (leftSquares === 0 || rightSquares === 0) return 0;
  return Math.round((top / Math.sqrt(leftSquares * rightSquares)) * 1000) / 1000;
}
