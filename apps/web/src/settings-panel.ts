/**
 * The settings sheet.
 *
 * It exists because the control bar ran out of room. Five buttons was already the most a 390 px
 * phone holds without wrapping, and zen, auto-queen, coordinates, move dots, haptics and the choice
 * of opponent are six more — so the answer is not a smaller font, it is a second surface.
 *
 * **A sheet, not a page.** Settings are changed *about* something: you are looking at a board, you
 * want the coordinates off, and you want to see the board with the coordinates off. A route would
 * unmount the board, lose the position visually, and make every change a round trip. The sheet
 * slides over the bottom of the same screen and every toggle takes effect underneath it as it is
 * tapped, which is the whole reason to build it this way.
 *
 * **Choosing an opponent restarts the game, and says so before it does.** That is the only
 * destructive control here, so it is the only one that warns.
 */

import { LEVELS } from '@scoresheet/core';
import { haptic, play } from './sound.ts';
import {
  BOARD_THEMES,
  LANGUAGE_SETTINGS,
  TIME_CONTROL_NAMES,
  onSettingsChange,
  settings,
  updateSettings,
  type BoardTheme,
  type LanguageSetting,
  type TimeControlName,
  type Settings,
} from './settings.ts';
import { LANGUAGE_NAMES, t } from './i18n.ts';
import { createIdenticon } from './identicon.ts';
import { BOT_ADDRESS } from './bot-identity.ts';

export interface SettingsPanelOptions {
  /** The player picked a different bot. The game restarts; the panel does not decide that. */
  onLevel: (index: number) => void;
  /**
   * The player picked a different clock. Same contract as `onLevel`.
   *
   * A clock cannot be changed mid-game — a fresh allowance appearing on move twenty would be a
   * different game — so this restarts, and the label under the control says so before it happens.
   */
  onClock: () => void;
}

export interface SettingsPanelHandle {
  readonly el: HTMLElement;
  open: () => void;
  close: () => void;
  readonly isOpen: boolean;
}

/** One switch: a label, an explanation, and the control, in that reading order. */
function toggle(
  key: keyof Settings,
  label: string,
  detail: string,
  onChange?: (value: boolean) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'sheet__row';

  const text = document.createElement('span');
  text.className = 'sheet__text';
  const name = document.createElement('span');
  name.className = 'sheet__label';
  name.textContent = label;
  const help = document.createElement('span');
  help.className = 'sheet__detail';
  help.textContent = detail;
  text.append(name, help);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'sheet__switch';
  input.checked = settings()[key] as boolean;
  input.dataset['setting'] = key;
  input.addEventListener('change', () => {
    updateSettings({ [key]: input.checked } as Partial<Settings>);
    onChange?.(input.checked);
    haptic(6);
  });

  // Kept in step with the store rather than assumed, so a reset or a change made elsewhere shows.
  onSettingsChange((next) => {
    input.checked = next[key] as boolean;
  });

  row.append(text, input);
  return row;
}

export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanelHandle {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('settings.title'));

  /*
   * The scrim closes it, and it is a real element rather than a background on the sheet.
   *
   * Tapping outside to dismiss is the gesture every bottom sheet on a phone answers to, and doing it
   * with a sibling element keeps the sheet's own bounds honest.
   */
  const scrim = document.createElement('div');
  scrim.className = 'sheet__scrim';
  scrim.addEventListener('click', () => handle.close());

  const panel = document.createElement('div');
  panel.className = 'sheet__panel';

  const heading = document.createElement('h2');
  heading.className = 'sheet__heading';
  heading.textContent = t('settings.title');

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn btn--primary sheet__done';
  done.textContent = t('settings.done');
  done.addEventListener('click', () => handle.close());

  /* ------------------------------------------------------------------ the opponent */

  const opponent = document.createElement('div');
  opponent.className = 'sheet__group';
  const opponentLabel = document.createElement('p');
  opponentLabel.className = 'sheet__label';
  opponentLabel.textContent = t('settings.opponent');
  const opponentHelp = document.createElement('p');
  opponentHelp.className = 'sheet__detail';
  opponentHelp.textContent = t('settings.opponentHelp');

  const levels = document.createElement('div');
  levels.className = 'sheet__levels';
  levels.setAttribute('role', 'radiogroup');
  levels.setAttribute('aria-label', t('settings.opponent'));

  /*
   * Each bot gets a face, derived from the one address they all sign with.
   *
   * `SPEC.md` J2 asked for this. The bots share a single published key, so the *address* is the same
   * for all four — a face derived from it alone would give four identical faces, which is worse than
   * none. The bot's name is folded in, so each one is distinct, stable, and still Nimiq's own
   * artwork rather than an emoji somebody chose.
   */
  const levelButtons = LEVELS.map((level, index) => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'sheet__level';
    choice.dataset['level'] = String(index);
    choice.setAttribute('role', 'radio');

    choice.append(createIdenticon(`${BOT_ADDRESS}:${level.name}`, 28));

    const who = document.createElement('span');
    who.className = 'sheet__level-name';
    who.textContent = level.name;
    const how = document.createElement('span');
    how.className = 'sheet__level-how';
    /*
     * Described by how they play, never by a rating.
     *
     * A number on an engine this weak would be a lie, and `SPEC.md` P3 says real ratings arrive with
     * the real engine or not at all. "Sees most simple tactics" is something a beginner can act on
     * and it is also true, which "1400" would not be.
     */
    how.textContent = describe(level.depth);
    choice.append(who, how);

    choice.addEventListener('click', () => {
      if (settings().level === index) return;
      updateSettings({ level: index });
      options.onLevel(index);
      markLevels();
      haptic(8);
    });
    return choice;
  });
  levels.append(...levelButtons);

  function markLevels(): void {
    const chosen = settings().level;
    for (const [index, choice] of levelButtons.entries()) {
      const isChosen = index === chosen;
      choice.classList.toggle('sheet__level--chosen', isChosen);
      choice.setAttribute('aria-checked', String(isChosen));
      choice.tabIndex = isChosen ? 0 : -1;
    }
  }
  markLevels();
  onSettingsChange(markLevels);

  /*
   * The clock, under the opponent, because it is the same kind of choice.
   *
   * Lichess offers a time control against the computer alongside the level — checked in
   * `lila/translation/source/site.xml`, where `timeControl` / `realTime` / `unlimited` are the same
   * strings the human setup uses. It goes in the sheet rather than in a setup dialog because the app
   * opens straight onto a playable board (`SPEC.md` E3), and a dialog in front of that would cost
   * the cold open to serve a setting most people never touch.
   */
  const clockLabel = document.createElement('p');
  clockLabel.className = 'sheet__label';
  clockLabel.textContent = t('game.clock');
  const clockHelp = document.createElement('p');
  clockHelp.className = 'sheet__detail';
  clockHelp.textContent = t('game.clockHelp');

  const clocks = document.createElement('div');
  clocks.className = 'sheet__clocks';
  clocks.setAttribute('role', 'radiogroup');
  clocks.setAttribute('aria-label', t('game.clock'));

  const clockNames: Record<TimeControlName, string> = {
    none: t('time.unlimited'),
    bullet: t('time.bullet'),
    blitz: t('time.blitz'),
    rapid: t('time.rapid'),
  };

  const clockButtons = TIME_CONTROL_NAMES.map((name) => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'sheet__clock';
    choice.dataset['clock'] = name;
    choice.setAttribute('role', 'radio');
    choice.textContent = clockNames[name];
    choice.addEventListener('click', () => {
      if (settings().botClock === name) return;
      updateSettings({ botClock: name });
      markClocks();
      haptic(6);
      options.onClock();
    });
    return choice;
  });
  clocks.append(...clockButtons);

  function markClocks(): void {
    const chosen = settings().botClock;
    for (const [index, choice] of clockButtons.entries()) {
      const isChosen = TIME_CONTROL_NAMES[index] === chosen;
      choice.classList.toggle('sheet__clock--chosen', isChosen);
      choice.setAttribute('aria-checked', String(isChosen));
      choice.tabIndex = isChosen ? 0 : -1;
    }
  }
  markClocks();
  onSettingsChange(markClocks);

  opponent.append(opponentLabel, opponentHelp, levels, clockLabel, clockHelp, clocks);

  /* ------------------------------------------------------------------ the switches */

  const boardGroup = document.createElement('div');
  boardGroup.className = 'sheet__group';
  const boardLabel = document.createElement('p');
  boardLabel.className = 'sheet__label';
  boardLabel.textContent = t('settings.board');

  /*
   * The colourway, as three swatches rather than a list of names.
   *
   * Nobody knows what "sea" looks like from the word. A swatch is the choice itself, which is why
   * every board-theme picker in every chess app is a row of little boards.
   */
  const themes = document.createElement('div');
  themes.className = 'sheet__themes';
  themes.setAttribute('role', 'radiogroup');
  themes.setAttribute('aria-label', t('settings.boardColours'));

  const themeNames: Record<BoardTheme, string> = {
    wood: t('settings.wood'),
    slate: t('settings.slate'),
    sea: t('settings.sea'),
  };
  const themeButtons = BOARD_THEMES.map((theme) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `sheet__theme sheet__theme--${theme}`;
    swatch.dataset['board'] = theme;
    swatch.setAttribute('role', 'radio');
    // The name is for a screen reader, which cannot see the swatch that carries the meaning.
    swatch.setAttribute('aria-label', themeNames[theme]);
    swatch.addEventListener('click', () => {
      updateSettings({ boardTheme: theme });
      markThemes();
      haptic(6);
    });
    return swatch;
  });
  themes.append(...themeButtons);

  function markThemes(): void {
    const chosen = settings().boardTheme;
    for (const [index, swatch] of themeButtons.entries()) {
      const isChosen = BOARD_THEMES[index] === chosen;
      swatch.classList.toggle('sheet__theme--chosen', isChosen);
      swatch.setAttribute('aria-checked', String(isChosen));
      swatch.tabIndex = isChosen ? 0 : -1;
    }
  }
  markThemes();
  onSettingsChange(markThemes);

  boardGroup.append(
    boardLabel,
    themes,
    toggle('moveDots', t('settings.moveDots'), t('settings.moveDotsHelp')),
    toggle('coordinates', t('settings.coordinates'), t('settings.coordinatesHelp')),
    toggle('autoQueen', t('settings.autoQueen'), t('settings.autoQueenHelp')),
    toggle('zen', t('settings.zen'), t('settings.zenHelp')),
    toggle('blindfold', t('settings.blindfold'), t('settings.blindfoldHelp')),
  );

  const feedback = document.createElement('div');
  feedback.className = 'sheet__group';
  const feedbackLabel = document.createElement('p');
  feedbackLabel.className = 'sheet__label';
  feedbackLabel.textContent = t('settings.feedback');
  feedback.append(
    feedbackLabel,
    // Playing a sound the moment it is switched on is the only way to know that it worked.
    toggle('sound', t('settings.sound'), t('settings.soundHelp'), (on) => {
      if (on) play('move');
    }),
    toggle('haptics', t('settings.haptics'), t('settings.hapticsHelp'), (on) => {
      if (on) haptic(10);
    }),
  );

  /* ------------------------------------------------------------------ the language */

  /*
   * Five languages, plus "follow Nimiq Pay", as a `<select>`.
   *
   * A select rather than the swatch rows above it, because six options in a row would wrap badly on
   * a 390 px phone and because this is the one control here that a person uses once and never again.
   *
   * Each language is named **in itself** — `Deutsch`, not `German`. A list of languages written in
   * English is a list for people who already read English, which is exactly the wrong audience for
   * this control.
   */
  const languageGroup = document.createElement('div');
  languageGroup.className = 'sheet__group';
  const languageLabel = document.createElement('p');
  languageLabel.className = 'sheet__label';
  languageLabel.textContent = t('settings.language');
  const languageHelp = document.createElement('p');
  languageHelp.className = 'sheet__detail';
  languageHelp.textContent = t('settings.languageHelp');

  const picker = document.createElement('select');
  picker.className = 'sheet__select';
  picker.dataset['setting'] = 'language';
  picker.setAttribute('aria-label', t('settings.language'));
  for (const value of LANGUAGE_SETTINGS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'auto' ? t('settings.languageAuto') : LANGUAGE_NAMES[value];
    option.selected = settings().language === value;
    picker.append(option);
  }
  picker.addEventListener('change', () => {
    updateSettings({ language: picker.value as LanguageSetting });
    haptic(6);
    /*
     * The page is reloaded, and that is the honest way to do it.
     *
     * Strings are read once, when an element is made. Re-routing rebuilds the *screen* but not the
     * navigation above it, which is built once on purpose, nor the bot game, which is deliberately
     * kept alive across routes — measured: after a re-route the board still said "Resign" in
     * English under a German nav. Chasing that with a re-render hook on every element would put a
     * subscription behind every string in the app to serve a setting somebody changes once.
     *
     * A reload costs nothing here: the service worker serves the shell from cache, the route is in
     * the URL, and every preference is already in storage. A live game is on the server and
     * reconnects; a bot game is the one thing lost, and it is one tap to start another.
     */
    window.location.reload();
  });
  languageGroup.append(languageLabel, languageHelp, picker);

  panel.append(heading, opponent, boardGroup, feedback, languageGroup, done);
  el.append(scrim, panel);

  /*
   * Escape closes it, and focus goes back where it came from.
   *
   * Both are what a dialog owes anybody navigating by keyboard, and neither shows in a screenshot —
   * which is exactly why they are the parts that get left out.
   */
  let opener: HTMLElement | null = null;
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      handle.close();
    }
  });

  const handle: SettingsPanelHandle = {
    el,
    open() {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.hidden = false;
      /*
       * Focus a control, at the top, and do not let the focus drag the sheet.
       *
       * `done.focus()` alone scrolled the panel 185 px to bring the Done button into view, so the
       * sheet opened past its own heading: the title, the "Opponent" label and the first two bots
       * were above the fold, and the first thing anybody saw was the clipped bottom half of a row.
       * `preventScroll` stops the focus from moving anything; resetting `scrollTop` also handles
       * reopening, where the panel would otherwise remember where it was left.
       *
       * A control rather than the container, because a dialog that focuses itself leaves a
       * screen-reader user with nothing announced and nothing to press.
       */
      panel.scrollTop = 0;
      done.focus({ preventScroll: true });
    },
    close() {
      el.hidden = true;
      opener?.focus();
      opener = null;
    },
    get isOpen() {
      return !el.hidden;
    },
  };

  return handle;
}

/** How a level plays, in words a beginner can act on rather than a number that would be a lie. */
function describe(depth: number): string {
  if (depth <= 1) return t('level.looksGood');
  if (depth <= 3) return t('level.oneAhead');
  if (depth <= 6) return t('level.simpleTactics');
  return t('level.punishes');
}
