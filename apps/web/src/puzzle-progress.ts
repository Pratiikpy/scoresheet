/**
 * What this device remembers about puzzles.
 *
 * Kept deliberately apart from `store.ts`, which holds signed games. That separation is the product's
 * central claim made structural: a signed scoresheet is countersigned by another person and nobody
 * can revoke it, while everything here is **one browser's private opinion of itself** — no
 * signatures, no witnesses, erased by clearing site data. Storing the two together would invite
 * exactly the confusion the whole app exists to prevent, and the puzzle screen says as much on its
 * face.
 *
 * Every read validates and falls back, for the same reasons as `settings.ts`: `localStorage` outlives
 * versions, is shared with the person using the browser, and can contain anything.
 */

import { PUZZLE_START } from './puzzles.ts';

const KEY = 'scoresheet:puzzles';

export interface Progress {
  /** This device's puzzle rating. A difficulty dial, not a record. */
  rating: number;
  /** Puzzle ids already seen, newest last, capped so storage cannot grow without limit. */
  seen: string[];
  /** The last day whose daily puzzle was finished, as `YYYY-MM-DD`. */
  dailyDone: string | null;
  /** How many days in a row a daily has been solved, and when it last advanced. */
  streakDays: number;
  streakLastDay: string | null;
  /** Best Storm score — puzzles solved inside the clock. */
  bestStorm: number;
  /** Longest Streak run — puzzles solved before the first mistake. */
  bestStreak: number;
  /** Solved and failed, all time, so the screen can say something true about effort. */
  solved: number;
  failed: number;
  /**
   * The coordinate trainer's scores, kept **separately for each orientation**.
   *
   * Lichess reports "average score as white" and "average score as black" as two numbers, and that
   * is the right shape rather than a nicety: recognising `f3` from behind the black pieces is a
   * different skill from recognising it from behind the white ones, and most players are markedly
   * worse at one of them. One combined average would hide exactly the thing worth training.
   */
  coordRuns: { w: number; b: number };
  coordTotal: { w: number; b: number };
  coordBest: { w: number; b: number };
}

/**
 * How many seen-puzzle ids to keep.
 *
 * Each is about eighty characters, so two thousand is roughly 160 KB — comfortable in a 5 MB budget,
 * and enough that a player will not meet a repeat for a very long time. Unbounded would eventually
 * fill the quota and start throwing on every write, which would break *saving a game* — a far more
 * important thing than remembering which puzzles have been shown.
 */
const SEEN_LIMIT = 2000;

const DEFAULTS: Progress = {
  rating: PUZZLE_START,
  seen: [],
  dailyDone: null,
  streakDays: 0,
  streakLastDay: null,
  bestStorm: 0,
  bestStreak: 0,
  solved: 0,
  failed: 0,
  coordRuns: { w: 0, b: 0 },
  coordTotal: { w: 0, b: 0 },
  coordBest: { w: 0, b: 0 },
};

let cache: Progress | null = null;

function coerce(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
  const value = raw as Record<string, unknown>;

  const number = (key: keyof Progress, min: number): number => {
    const found = value[key];
    return typeof found === 'number' && Number.isFinite(found) && found >= min
      ? Math.round(found)
      : (DEFAULTS[key] as number);
  };
  const day = (key: keyof Progress): string | null => {
    const found = value[key];
    // A malformed date must not become a day nothing can ever equal, which would silently disable
    // the daily for good.
    return typeof found === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(found) ? found : null;
  };

  /** A per-orientation pair, validated side by side so half a bad value cannot survive. */
  const sides = (key: 'coordRuns' | 'coordTotal' | 'coordBest'): { w: number; b: number } => {
    const found = value[key];
    if (typeof found !== 'object' || found === null) return { ...DEFAULTS[key] };
    const pair = found as Record<string, unknown>;
    const one = (side: 'w' | 'b'): number => {
      const at = pair[side];
      return typeof at === 'number' && Number.isFinite(at) && at >= 0 ? Math.round(at) : 0;
    };
    return { w: one('w'), b: one('b') };
  };

  return {
    rating: number('rating', 400),
    seen: Array.isArray(value['seen'])
      ? (value['seen'] as unknown[]).filter((id): id is string => typeof id === 'string').slice(-SEEN_LIMIT)
      : [],
    dailyDone: day('dailyDone'),
    streakDays: number('streakDays', 0),
    streakLastDay: day('streakLastDay'),
    bestStorm: number('bestStorm', 0),
    bestStreak: number('bestStreak', 0),
    solved: number('solved', 0),
    failed: number('failed', 0),
    coordRuns: sides('coordRuns'),
    coordTotal: sides('coordTotal'),
    coordBest: sides('coordBest'),
  };
}

export function progress(): Progress {
  if (cache) return cache;
  try {
    cache = coerce(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function updateProgress(changes: Partial<Progress>): Progress {
  const next = { ...progress(), ...changes };
  if (next.seen.length > SEEN_LIMIT) next.seen = next.seen.slice(-SEEN_LIMIT);
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or a private window. The session keeps its progress; it simply will not survive a reload,
    // which is a far better outcome than refusing to let somebody solve a puzzle.
  }
  return next;
}

/** Throw away the cache and read again. Used by tests, and after another tab writes. */
export function reloadProgress(): Progress {
  cache = null;
  return progress();
}

/** Every puzzle this device has been shown, for the chooser to avoid. */
export function seenSet(): Set<string> {
  return new Set(progress().seen);
}

/**
 * Record the daily as done, and advance the day streak if it really is consecutive.
 *
 * "Consecutive" is checked against the *previous calendar day*, not against a timestamp difference.
 * Somebody solving at 23:55 and again at 00:05 has done two days in a row and would be robbed by a
 * 24-hour rule; somebody solving twice on the same afternoon has done one day and would be flattered
 * by one. Both cases are common and both are the kind of thing that quietly makes a streak feel
 * arbitrary.
 */
export function completeDaily(day: string): Progress {
  const current = progress();
  if (current.dailyDone === day) return current;

  const previous = new Date(`${day}T12:00:00`);
  previous.setDate(previous.getDate() - 1);
  const yesterday = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}`;

  const streakDays = current.streakLastDay === yesterday ? current.streakDays + 1 : 1;
  return updateProgress({ dailyDone: day, streakDays, streakLastDay: day });
}

/**
 * A day streak is only alive if it was continued today or yesterday.
 *
 * Stored state cannot expire on its own, so a streak of 40 from three months ago would otherwise
 * still read as 40 — the single most common way a streak counter turns into a lie.
 */
export function liveStreakDays(today: string): number {
  const current = progress();
  if (!current.streakLastDay) return 0;
  const previous = new Date(`${today}T12:00:00`);
  previous.setDate(previous.getDate() - 1);
  const yesterday = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}`;
  return current.streakLastDay === today || current.streakLastDay === yesterday ? current.streakDays : 0;
}
