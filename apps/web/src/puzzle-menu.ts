/**
 * The puzzle menu: four ways in, and what this device knows about you.
 *
 * It exists because four modes need somewhere to be chosen, but it earns its place by being the
 * screen that shows progress. A daily streak, a Storm best, a puzzle rating — these are the numbers
 * that bring somebody back on a day they do not want a whole game, and a menu that only listed links
 * would waste the one screen where they belong.
 *
 * **It says out loud that none of this is signed.** Every number here is one browser's private
 * opinion of itself, erased by clearing site data, worth nothing to anybody else. The rating on the
 * record page is the opposite of that in every respect, and the difference is the product. Letting
 * the two look alike would be the most expensive kind of tidy.
 */

import { dayKey, TRAINABLE_THEMES } from './puzzles.ts';
import { liveStreakDays, progress } from './puzzle-progress.ts';
import { t } from './i18n.ts';
import { ownPuzzleCount } from './own-puzzle-store.ts';
import { today as todayCounts } from './today.ts';

export interface PuzzleMenuOptions {
  onMode: (mode: 'daily' | 'train' | 'storm' | 'streak' | 'mine') => void;
  /** The coordinate trainer, which lives in Train beside the puzzle modes. */
  onCoordinates: () => void;
  /** Train one idea rather than whatever comes next. */
  onTheme: (theme: string) => void;
  onBack: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createPuzzleMenu(options: PuzzleMenuOptions): HTMLElement {
  const el = element('div', 'puzzle-menu');
  const saved = progress();
  const today = dayKey();

  /*
   * No Back button: the navigation is global now.
   *
   * Every screen used to carry its own "Back to the board", which was the only way out when the nav
   * lived inside the bot-game screen. With three sections above every screen it is a second control
   * doing the same job in a different place — and two ways to do one thing is how a small app starts
   * feeling like a big one.
   */

  el.append(element('h1', 'puzzle-menu__title', t('puzzles.title')));

  /* ------------------------------------------------------------------ today */

  /*
   * What has happened today, above everything else.
   *
   * The reason to open a chess app tomorrow is that something in it is new today, and the daily
   * puzzle already provided that — but nothing said so. Three lines, each one something the app
   * already does, each ticked or not.
   *
   * **No points and no reward for completing the set.** It is a status card, not a quest system: the
   * only thing it can win is the streak that already existed, and a made-up currency sitting next to
   * a rating two people signed would undermine the one number in this app that means anything.
   */
  const done = todayCounts();
  const card = element('div', 'puzzle-menu__today');
  card.append(element('p', 'puzzle-menu__today-title', t('today.title')));

  const todayList = element('ul', 'puzzle-menu__today-list');
  for (const [complete, label] of [
    [saved.dailyDone === today, t('today.daily')],
    [done.games > 0, t('today.game')],
    [done.wins > 0, t('today.win')],
  ] as const) {
    const row = element('li', `puzzle-menu__today-row${complete ? ' puzzle-menu__today-row--done' : ''}`);
    // The tick is decoration; the state is in the label a screen reader reads.
    const mark = element('span', 'puzzle-menu__tick', complete ? '✓' : '·');
    mark.setAttribute('aria-hidden', 'true');
    row.append(mark, element('span', 'puzzle-menu__today-label', label));
    row.setAttribute('aria-label', `${label} — ${t(complete ? 'today.done' : 'today.notYet')}`);
    todayList.append(row);
  }
  card.append(todayList);
  el.append(card);

  /* ------------------------------------------------------------------ the numbers */

  const stats = element('div', 'puzzle-menu__stats');
  const days = liveStreakDays(today);
  for (const [value, label] of [
    [String(saved.rating), t('puzzles.rating')],
    [String(days), t(days === 1 ? 'puzzles.dayInARow' : 'puzzles.daysInARow')],
    [String(saved.bestStreak), t('puzzles.bestStreak')],
    [String(saved.bestStorm), t('puzzles.bestStorm')],
  ] as const) {
    const stat = element('div', 'puzzle-menu__stat');
    stat.append(element('span', 'puzzle-menu__value', value), element('span', 'puzzle-menu__caption', label));
    stats.append(stat);
  }
  el.append(stats);

  el.append(
    element(
      'p',
      'puzzle-menu__note',
      t('puzzles.note'),
    ),
  );

  /* ------------------------------------------------------------------ the modes */

  const modes: { mode: 'daily' | 'train' | 'storm' | 'streak'; name: string; detail: string }[] = [
    {
      mode: 'daily',
      name: t(saved.dailyDone === today ? 'puzzles.dailyDone' : 'puzzles.daily'),
      detail: t('puzzles.dailyDetail'),
    },
    { mode: 'train', name: t('puzzles.train'), detail: t('puzzles.trainDetail') },
    { mode: 'storm', name: t('puzzles.storm'), detail: t('puzzles.stormDetail') },
    { mode: 'streak', name: t('puzzles.streak'), detail: t('puzzles.streakDetail') },
  ];

  const list = element('div', 'puzzle-menu__modes');
  for (const { mode, name, detail } of modes) {
    const choice = element('button', 'puzzle-menu__mode');
    choice.type = 'button';
    choice.dataset['mode'] = mode;
    choice.append(
      element('span', 'puzzle-menu__mode-name', name),
      element('span', 'puzzle-menu__mode-detail', detail),
    );
    choice.addEventListener('click', () => options.onMode(mode));
    list.append(choice);
  }
  el.append(list);

  /*
   * Training one idea, which the data has always supported and nothing offered.
   *
   * `SPEC.md` H1 called this cheap and it was: every puzzle already carries its themes, and the
   * puzzle screen has been *displaying* them since the day it was built. What was missing was any
   * way to say "give me forks" — which is how anybody actually practises, and the difference between
   * a puzzle feed and a trainer.
   */
  /*
   * The coordinate trainer, with the modes rather than under them.
   *
   * It is not a puzzle — there is no position and nothing to calculate — but it *is* training, and
   * the Train section is where somebody goes to get better at something. A separate navigation
   * section for one exercise would be a fourth tab nobody needs.
   */
  /*
   * ⭐ **Your own mistakes, offered only when there are some.**
   *
   * Shown above the coordinate trainer and below the standard modes, and **hidden entirely when the
   * queue is empty** — an always-present entry that leads to "nothing here yet" teaches somebody
   * that the section is not worth opening, and they stop looking on the day it finally has
   * something.
   *
   * The count is on the button because it is the only number that makes it worth pressing.
   */
  const queued = ownPuzzleCount();
  if (queued > 0) {
    const mine = element('button', 'puzzle-menu__mode');
    mine.type = 'button';
    mine.dataset['mode'] = 'mine';
    mine.append(
      element('span', 'puzzle-menu__mode-name', t('puzzles.mine')),
      element('span', 'puzzle-menu__mode-detail', t('puzzles.mineDetail', { count: queued })),
    );
    mine.addEventListener('click', () => options.onMode('mine'));
    list.append(mine);
  }

  const coords = element('button', 'puzzle-menu__mode');
  coords.type = 'button';
  coords.dataset['mode'] = 'coordinates';
  coords.append(
    element('span', 'puzzle-menu__mode-name', t('coords.title')),
    element('span', 'puzzle-menu__mode-detail', t('coords.menuDetail')),
  );
  coords.addEventListener('click', () => options.onCoordinates());
  list.append(coords);

  el.append(element('p', 'puzzle-menu__label', t('puzzles.oneIdea')));

  const themes = element('div', 'puzzle-menu__themes');
  for (const { theme, key } of TRAINABLE_THEMES) {
    const choice = element('button', 'puzzle-menu__theme', t(key));
    choice.type = 'button';
    choice.dataset['theme'] = theme;
    choice.addEventListener('click', () => options.onTheme(theme));
    themes.append(choice);
  }
  el.append(themes);

  /*
   * Lichess is credited here even though CC0 does not require it.
   *
   * Five thousand puzzles, each rated by thousands of plays, is not something this project could
   * have built — and taking public-domain work without saying where it came from is the kind of
   * silence that costs nothing to break.
   */
  el.append(
    element(
      'p',
      'puzzle-menu__credit',
      t('puzzles.credit'),
    ),
  );

  return el;
}
