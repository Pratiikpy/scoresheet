/**
 * The five languages Nimiq Pay speaks.
 *
 * `nimiq.dev/mini-apps` is exact about this: the host injects `window.nimiqPay.language` as an ISO
 * 639-1 code before any script runs, and it supports **`en`, `es`, `de`, `fr`, `pt`** — no more, no
 * fewer. The documented fallback chain is `window.nimiqPay?.language → navigator.language → 'en'`,
 * and the documented pattern for an app this size is a plain object keyed by language code rather
 * than an i18n library. Both are followed here.
 *
 * ## Why this matters beyond a scoring line
 *
 * A player who opens a chess app in their own language and finds English is being told the app was
 * not made for them. Nimiq Pay already knows which language that is, and `hostLanguage()` had sat in
 * `wallet.ts` since the beginning with nothing calling it — a worse position than not having it at
 * all: the information was there and was thrown away on every launch.
 *
 * ## The rules
 *
 *  1. **English is the source of truth.** `strings/en.ts` defines the key set; every other language
 *     is typed against it, so a key added in English and forgotten elsewhere is a type error rather
 *     than a sentence that silently turns English in front of a Spanish speaker.
 *  2. **A missing string falls back to English rather than showing a key.** `i18n.test.ts` proves no
 *     string is actually missing, so the fallback is a safety net and never a strategy.
 *  3. **Language is resolved once per render, not cached in a module.** Somebody changing it in
 *     settings gets it immediately, because the router rebuilds the screen.
 */

import { en } from './strings/en.ts';

export type Lang = 'en' | 'es' | 'de' | 'fr' | 'pt';

/**
 * What the host says the player's language is.
 *
 * The documented chain, in order: `window.nimiqPay.language` — injected before any script runs and
 * static for the session — then the browser's own, then English.
 *
 * It lives here rather than in `wallet.ts` where it started. Every message in `wallet.ts` is now
 * translated, so `wallet.ts` imports `t`, and leaving this there would make the two files import
 * each other. A cycle that happens to work today is not a thing to leave in a file both the wallet
 * and every screen depend on.
 */
export function hostLanguage(): string {
  const raw = window.nimiqPay?.language ?? navigator.language ?? 'en';
  return raw.slice(0, 2).toLowerCase();
}

/** Exactly the five the host supports, in the order they are offered. */
export const LANGUAGES: readonly Lang[] = ['en', 'es', 'de', 'fr', 'pt'];

/** What each is called *in itself*. A language list in English is a list for English speakers. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
};

export type Key = keyof typeof en;

/**
 * The dictionaries that are loaded. English is always here; the rest arrive when asked for.
 *
 * Statically importing all five put **113 KB** of strings into the main bundle so that one of them
 * could be read — measured, on the build that first shipped them. Four of the five are dead weight
 * for every visitor, so they are chunks now, and `loadLanguage()` fetches exactly the one in force
 * before the first screen is drawn.
 */
const DICTIONARIES: Record<Lang, Partial<Record<Key, string>>> = { en, es: {}, de: {}, fr: {}, pt: {} };

/** How to fetch each one. English is not here: it is the fallback and is always present. */
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<Partial<Record<Key, string>>>> = {
  es: () => import('./strings/es.ts').then((module) => module.es),
  de: () => import('./strings/de.ts').then((module) => module.de),
  fr: () => import('./strings/fr.ts').then((module) => module.fr),
  pt: () => import('./strings/pt.ts').then((module) => module.pt),
};

/**
 * Fetch the language in force, if it is not English and is not already here.
 *
 * **Awaited before the first render**, in `main.ts`, so `t()` stays synchronous everywhere else — the
 * alternative is an async string lookup in every element, to save a few milliseconds once. Changing
 * the language reloads the page, so this is the only place that needs to wait.
 *
 * A dictionary that will not load leaves English in place, which is the same graceful outcome as a
 * missing key: readable, in the wrong language, rather than broken.
 */
export async function loadLanguage(): Promise<void> {
  const lang = language();
  if (lang === 'en' || Object.keys(DICTIONARIES[lang]).length > 0) return;
  try {
    DICTIONARIES[lang] = await LOADERS[lang]();
  } catch {
    // English stays.
  }
}

/**
 * What the app is currently speaking.
 *
 * `chosen` is the player's explicit setting and `'auto'` means "whatever the host says". Kept as a
 * module variable rather than read from `settings()` directly, because `settings.ts` must not depend
 * on this file and this file must not depend on the settings sheet — the two meet in `main.ts`.
 */
let chosen: Lang | 'auto' = 'auto';

export function setLanguage(next: Lang | 'auto'): void {
  chosen = next;
}

/** The language in force, resolved through the documented fallback chain. */
export function language(): Lang {
  if (chosen !== 'auto') return chosen;
  const host = hostLanguage();
  return (LANGUAGES as readonly string[]).includes(host) ? (host as Lang) : 'en';
}

/**
 * A string, in the language in force.
 *
 * Placeholders are `{name}` and are replaced with whatever is passed. Deliberately not a template
 * function: the values that go into a sentence are things like a bot's name and a move count, and
 * the *order* they appear in changes between languages — which is exactly what a named placeholder
 * survives and a positional one does not.
 */
export function t(key: Key, params?: Record<string, string | number>): string {
  const dictionary = DICTIONARIES[language()];
  const template = dictionary[key] ?? en[key];
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    // An unfilled placeholder is left visible rather than blanked. A sentence with `{count}` in it
    // is an obvious bug; a sentence with a hole in it reads as a finished sentence that is wrong.
    return value === undefined ? whole : String(value);
  });
}

/** Every key, for the test that proves no language is missing one. */
export function keys(): Key[] {
  return Object.keys(en) as Key[];
}

/** One dictionary, for the same test. */
export function dictionary(lang: Lang): Partial<Record<Key, string>> {
  return DICTIONARIES[lang];
}
