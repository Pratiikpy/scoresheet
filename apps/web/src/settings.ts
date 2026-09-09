/**
 * What the player has chosen, remembered.
 *
 * Every one of these is a preference a chess player expects to find and expects to persist — the
 * kind of thing nobody praises and everybody notices the absence of. Three rules shape the module:
 *
 *  1. **One store, read through one function.** Preferences scattered across `localStorage` keys
 *     drift: a key gets renamed on one screen, a default disagrees with another, and the app
 *     develops two opinions about whether the coordinates are on.
 *  2. **A bad value is not a broken app.** `localStorage` is shared with the person using the
 *     browser, survives every version this app will ever ship, and can hold anything. Every field is
 *     validated on read and falls back to its default, so a hand-edited value or a setting removed
 *     in a later version degrades to sane rather than to a blank screen.
 *  3. **Changes are broadcast.** The board, the sheet and the game all reflect the same state, and
 *     a settings panel that only updated the screen it was opened from would be a bug factory.
 *
 * Storage failure is survivable throughout. Private windows, disabled site data and quota errors all
 * throw on `localStorage` access, and a chess app that will not open a board because it could not
 * save a sound preference has its priorities exactly backwards.
 */

const KEY = 'scoresheet:settings';

/**
 * The board colours on offer.
 *
 * Three, not thirty. Each one is measured against both piece colours and every square marker, and a
 * long list would be a long list of things that can be wrong — Lichess ships dozens because it has
 * people to check them.
 */
export const BOARD_THEMES = ['wood', 'slate', 'sea'] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];

/** The bots, by name, as `LEVELS` orders them. Stored as an index so a rename does not lose it. */
export const LEVEL_COUNT = 4;

export interface Settings {
  /** Sound effects. */
  sound: boolean;
  /** Vibration on the phone, where the browser allows it at all. */
  haptics: boolean;
  /** The dots showing where a lifted piece may go. Beginners need them; strong players do not. */
  moveDots: boolean;
  /** File letters and rank numbers along the board's edge. */
  coordinates: boolean;
  /**
   * Promote to a queen without asking.
   *
   * On by default, because a queen is the right answer in the overwhelming majority of games and
   * the picker costs a tap every single time. Underpromotion matters, so it stays available: turning
   * this off restores the chooser, which is exactly how both reference boards handle it.
   */
  autoQueen: boolean;
  /**
   * Zen: the board and nothing else.
   *
   * Not a gimmick — it is a concentration feature that strong players use constantly, and it is the
   * one setting that changes what the screen *is* rather than a detail of it.
   */
  zen: boolean;
  /**
   * Blindfold: the board without the pieces.
   *
   * `SPEC.md` J8 calls it one CSS rule, and it nearly is. It is also the hardest way to play chess
   * and a genuine training method — strong players use it to build the visualisation the rest of
   * their game rests on. The move list stays, so the game is followed in notation, which is exactly
   * how blindfold chess is played over a board somebody else is holding.
   */
  blindfold: boolean;
  /**
   * The board's colours.
   *
   * `SPEC.md` A4 called this "the cheapest personalisation in existence" and it is: two custom
   * properties. Players care about it more than almost anything else cosmetic — it is the first
   * thing anybody changes on Lichess — and every option here is contrast-measured against both piece
   * colours by `scripts/design-metrics.mjs`, so a theme cannot ship that makes a piece hard to see.
   */
  boardTheme: BoardTheme;
  /** Which bot to play. An index into `LEVELS`. */
  level: number;
  /**
   * The language, or `'auto'` to follow Nimiq Pay.
   *
   * `'auto'` is the default and is what almost everybody should stay on: the host already knows,
   * and somebody whose phone is in Spanish should not have to tell this app so as well. The override
   * is for the case the host cannot cover — a phone in one language and a preference for another.
   */
  language: LanguageSetting;
  /**
   * The clock for a game against the bot, or `'none'`.
   *
   * `'none'` by default, and that default is load-bearing: the app opens straight onto a playable
   * board (`SPEC.md` E3), and a clock that started ticking on a stranger's first visit would be a
   * timer on somebody who has not decided to play yet. Choosing one starts a new game, exactly as
   * changing the opponent does.
   */
  botClock: TimeControlName;
}

/**
 * `'auto'` follows Nimiq Pay; anything else is one of the five languages the host supports.
 *
 * Spelled out here rather than imported from `i18n.ts`, because this module deliberately imports
 * nothing at all — it is read by the settings sheet, by every screen, and by tests that run in Node
 * with no `window`, and a dependency here would reach all three.
 */
export const LANGUAGE_SETTINGS = ['auto', 'en', 'es', 'de', 'fr', 'pt'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/**
 * The clocks a game can be played to, in milliseconds.
 *
 * The same four the lobby offers for a game against a person, and the same numbers the server holds
 * in `live.ts` — one set, so a bullet game means the same thing whoever is on the other side. They
 * live here rather than in `clock.ts` because the *setting* is the shared thing; `clock.ts` reads
 * them and `settings-panel.ts` names them.
 */
export const TIME_CONTROLS = {
  none: { initialMs: 0, incrementMs: 0 },
  bullet: { initialMs: 60_000, incrementMs: 0 },
  blitz: { initialMs: 180_000, incrementMs: 2_000 },
  rapid: { initialMs: 600_000, incrementMs: 5_000 },
} as const;

export type TimeControlName = keyof typeof TIME_CONTROLS;
export const TIME_CONTROL_NAMES = Object.keys(TIME_CONTROLS) as TimeControlName[];

const DEFAULTS: Settings = {
  sound: true,
  haptics: true,
  moveDots: true,
  coordinates: true,
  autoQueen: true,
  zen: false,
  blindfold: false,
  boardTheme: 'wood',
  language: 'auto',
  botClock: 'none',
  // Nell: a beginner beats her sometimes, which is the right first opponent. Pip loses too easily to
  // be interesting and Vera wins too often to be encouraging.
  level: 1,
};

let cache: Settings | null = null;
const listeners = new Set<(settings: Settings) => void>();

function coerce(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
  const value = raw as Record<string, unknown>;
  const bool = (key: keyof Settings): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : (DEFAULTS[key] as boolean);

  const level = value['level'];
  return {
    sound: bool('sound'),
    haptics: bool('haptics'),
    moveDots: bool('moveDots'),
    coordinates: bool('coordinates'),
    autoQueen: bool('autoQueen'),
    zen: bool('zen'),
    blindfold: bool('blindfold'),
    // A theme from a later version must not leave the board with no colours at all.
    boardTheme: BOARD_THEMES.includes(value['boardTheme'] as BoardTheme)
      ? (value['boardTheme'] as BoardTheme)
      : DEFAULTS.boardTheme,
    // A language this build does not have must fall back to following the host, never to a blank.
    language: (LANGUAGE_SETTINGS as readonly string[]).includes(value['language'] as string)
      ? (value['language'] as LanguageSetting)
      : DEFAULTS.language,
    // A control this build does not have must fall back to no clock, never to a nonexistent one.
    botClock: (TIME_CONTROL_NAMES as readonly string[]).includes(value['botClock'] as string)
      ? (value['botClock'] as TimeControlName)
      : DEFAULTS.botClock,
    // A level from an older or newer version must not select a bot that does not exist.
    level: typeof level === 'number' && Number.isInteger(level) && level >= 0 && level < LEVEL_COUNT
      ? level
      : DEFAULTS.level,
  };
}

/** Everything the player has chosen. Cheap to call — it is read from storage once. */
export function settings(): Settings {
  if (cache) return cache;
  try {
    cache = coerce(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    // Unreadable storage, or JSON that is not ours. Defaults are always better than a thrown error.
    cache = { ...DEFAULTS };
  }
  return cache;
}

/** Change one or more settings, persist them, and tell everything that is listening. */
export function updateSettings(changes: Partial<Settings>): Settings {
  const next = { ...settings(), ...changes };
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota, or a private window that refuses writes. The setting still applies for this session,
    // which is far better than refusing to change it.
  }
  for (const listener of listeners) listener(next);
  return next;
}

/** Run something whenever any setting changes. Returns the unsubscribe. */
export function onSettingsChange(listener: (settings: Settings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Back to the defaults, and say so. Used by the settings sheet and by tests. */
export function resetSettings(): Settings {
  return updateSettings({ ...DEFAULTS });
}

/**
 * Throw away the cache and read storage again, validating as if the page had just loaded.
 *
 * Two reasons, and the second is the one that made it necessary:
 *
 *  1. **Another tab changed something.** A player with the app open twice — a game in one, a record
 *     page in the other — would otherwise have two tabs disagreeing about their own settings until
 *     one was reloaded. The `storage` event below closes that.
 *  2. **Validation was untestable from outside.** `settings()` caches on first read and
 *     `updateSettings()` merges typed values, so nothing a test could call would exercise `coerce`
 *     against a corrupt stored value — the one path that has to be right. Writing the test made that
 *     obvious, and the fix was a missing function rather than a cleverer test.
 */
export function reloadSettings(): Settings {
  cache = null;
  const next = settings();
  for (const listener of listeners) listener(next);
  return next;
}

/*
 * Keep tabs in step.
 *
 * `storage` fires only in the *other* tabs, never the one that wrote, so this cannot loop. Guarded
 * for environments with no `window` at all, which is how the tests import this module.
 */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) reloadSettings();
  });
}
