/**
 * What this device has done **today**.
 *
 * The reason to open a chess app tomorrow is that there is something in it that is new today, and
 * the daily puzzle already provides that. What was missing is anywhere that says so: the streak was
 * a number on a screen and nothing told a returning player what was left to do.
 *
 * ## What this deliberately is not
 *
 * **Not a quest system.** No points, no invented currency, no reward for completing a set. Every
 * line here is something the app already does, counted honestly, and the only prize is the streak
 * that already existed. `../SIP_AND_SHIP_C2_CALL1_FINDINGS.md` records the organiser's own warning
 * that *"complexity makes you harder to judge and costs you points"*, and a points economy bolted
 * onto a chess app is exactly that — it would also be the one part of the product with a number in
 * it that nobody signed, sitting next to the one thing the whole app exists to prove.
 *
 * So this counts three things, resets at midnight in the player's own timezone, and stops.
 */

const KEY = 'scoresheet:today';

export interface Today {
  /** `YYYY-MM-DD` in the player's own timezone. Anything older is a fresh day. */
  day: string;
  /** Puzzles solved today, in any mode. */
  puzzles: number;
  /** Games finished today, against the bot or a person. */
  games: number;
  /** Of those, how many were won. */
  wins: number;
}

/** Local midnight, not UTC — the same rule the daily puzzle uses, so the two never disagree. */
export function todayKey(at: Date = new Date()): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function empty(day: string): Today {
  return { day, puzzles: 0, games: 0, wins: 0 };
}

/**
 * What has happened today, resetting itself when the day turns.
 *
 * The reset is a *read*, not a scheduled job: there is no moment at which an app running in a
 * background tab would be told midnight had passed, so the only reliable time to notice is when
 * somebody looks.
 */
export function today(): Today {
  const day = todayKey();
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return empty(day);
    const value = raw as Record<string, unknown>;
    if (value['day'] !== day) return empty(day);

    const count = (name: 'puzzles' | 'games' | 'wins'): number => {
      const found = value[name];
      return typeof found === 'number' && Number.isFinite(found) && found >= 0 ? Math.round(found) : 0;
    };
    return { day, puzzles: count('puzzles'), games: count('games'), wins: count('wins') };
  } catch {
    return empty(day);
  }
}

/** Add to today's counts. Anything from a previous day is replaced rather than added to. */
export function recordToday(changes: Partial<Omit<Today, 'day'>>): Today {
  const current = today();
  const next: Today = {
    day: current.day,
    puzzles: current.puzzles + (changes.puzzles ?? 0),
    games: current.games + (changes.games ?? 0),
    wins: current.wins + (changes.wins ?? 0),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A browser that will not store this loses a count, and nothing else. Not worth a message.
  }
  return next;
}
