/**
 * The entry point, and the router.
 *
 * One rule governs what happens here: **the board is on the screen before anything is tapped**, and
 * something is playable in one tap with no wallet, no opponent and no wait (`SPEC.md` E3, Q4). So
 * the default route draws a game, and every other screen is somewhere you go rather than somewhere
 * you land.
 *
 * `/r/<address>` is the exception that must work cold: it is the link somebody sends to a stranger,
 * so opening it directly has to render the record and not the home screen with a redirect.
 */

import './styles.css';
import { LEVELS } from '@scoresheet/core';
import { installDemoWallet } from './demo-wallet.ts';
import { onSettingsChange, settings } from './settings.ts';
import { createGame } from './game.ts';
import { createCertificatePage } from './certificate-page.ts';
import { createStudyScreen } from './study-screen.ts';
import { createCoordinateScreen } from './coordinate-screen.ts';
import { createVerifyScreen } from './verify-screen.ts';
import { createTournamentPage } from './tournament-page.ts';
import { createLobby } from './lobby.ts';
import { createNav } from './nav.ts';
import { createOnlineScreen } from './online-screen.ts';
import { createPuzzleMenu } from './puzzle-menu.ts';
import { createPuzzleScreen, type PuzzleMode } from './puzzle-screen.ts';
import { createRecordPage } from './record.ts';
import { language, loadLanguage, setLanguage, t } from './i18n.ts';

// Before anything renders, and only when asked for. A real wallet always wins.
installDemoWallet();

/*
 * The board colourway is stamped on the root element, not on a board.
 *
 * There are three screens with a board on them — the game, a puzzle, a live game — and a theme that
 * had to be applied per board would be a theme that got forgotten on the next one. The tokens live
 * on `:root`, so anything that draws a square is already following it.
 */
function paintBoardTheme(): void {
  document.documentElement.dataset['board'] = settings().boardTheme;
}
paintBoardTheme();
onSettingsChange(paintBoardTheme);

/**
 * The language, from the setting, and stamped where a browser can see it.
 *
 * `main.ts` is where the two meet on purpose: `settings.ts` imports nothing, and `i18n.ts` must not
 * import the settings sheet, so the wiring belongs at the top rather than inside either.
 *
 * `<html lang>` matters as much as the strings do — it is what tells a screen reader which voice to
 * use and a browser whether to offer a translation, and a page of Spanish marked `lang="en"` is read
 * aloud in an English accent.
 */
function paintLanguage(): void {
  setLanguage(settings().language);
  document.documentElement.lang = language();
}
paintLanguage();
onSettingsChange(paintLanguage);

const found = document.querySelector<HTMLElement>('#app');
if (!found) throw new Error('no #app');
const app: HTMLElement = found;

function navigate(path: string): void {
  if (path !== window.location.pathname + window.location.search) {
    window.history.pushState({}, '', path);
  }
  route();
}

/**
 * A game is built once and kept.
 *
 * Rebuilding it on every navigation would lose the position — somebody who checks a record page
 * mid-game must come back to the game they were playing, not to a new one.
 */
let game: ReturnType<typeof createGame> | null = null;

function board(): HTMLElement {
  // Every route this screen can reach is injected, so `game.ts` never touches the router itself.
  game ??= createGame(LEVELS[1], {
    onRecord: (address) => navigate(`/r/${encodeURIComponent(address)}`),
    onStudy: () => navigate('/study'),
    onLobby: () => navigate('/play'),
  });
  return game.el;
}

/**
 * Replace what is on screen, letting the outgoing screen clean up after itself.
 *
 * Storm runs a one-second interval. Routing away from it without this would leave that interval
 * ticking against a detached board for as long as the tab stayed open — the classic leak, invisible
 * until an hour has passed and the phone is warm. Any screen may expose `destroy`; most do not need
 * to, and the game deliberately does not, because it is kept alive on purpose.
 */
/*
 * The navigation lives here, above every screen, and is built once.
 *
 * It used to be built *inside* the bot-game screen, which meant every other screen — puzzles, the
 * lobby, a live game, a record — had only a Back button that always went to the board. Somebody on
 * the puzzle screen could not reach their record without going home first. `SPEC.md` M1 lists
 * navigation as a scored criterion and marked it absent; this is what was actually absent.
 *
 * Built once rather than per route so it does not flash on every navigation, and so the section it
 * marks is the only thing that changes.
 */
/*
 * Built lazily, on the first render, and **after** the language has been fetched.
 *
 * This was a `const` at module scope, which meant it was constructed the moment this file was
 * imported — before `loadLanguage()` had resolved. The result was a German page with an English
 * navigation strip above it, on every load, for everybody who is not reading English. Nothing else
 * in the app has this problem, because everything else is built inside a route.
 */
let navigation: ReturnType<typeof createNav> | null = null;

function nav(): ReturnType<typeof createNav> {
  navigation ??= createNav({
    onGo: (path) => navigate(path),
    onNothing: (message) => {
      // Said in the nav's own line rather than as an alert: it is guidance, not an error.
      notice.textContent = message;
      notice.hidden = false;
      window.setTimeout(() => (notice.hidden = true), 6000);
    },
  });
  return navigation;
}

const notice = document.createElement('p');
notice.className = 'nav__notice';
notice.setAttribute('role', 'status');
notice.hidden = true;

const shell = document.createElement('div');
shell.className = 'shell';

function show(screen: HTMLElement): void {
  // The shell is filled on the first render rather than at import, so the nav is built in the
  // language that is actually in force.
  if (shell.childElementCount === 0) shell.append(nav().el, notice);

  const current = shell.lastElementChild as (HTMLElement & { destroy?: () => void }) | null;
  if (current && current !== screen) current.destroy?.();

  // The nav and its notice stay; only the screen under them is replaced.
  while (shell.childElementCount > 2) shell.lastElementChild?.remove();
  shell.append(screen);
  nav().mark(window.location.pathname);
  if (app.firstElementChild !== shell) app.replaceChildren(shell);

  // A fresh screen starts at the top; carrying a scroll position across a route is disorienting.
  window.scrollTo(0, 0);
}

const PUZZLE_MODES = new Set<PuzzleMode>(['daily', 'train', 'storm', 'streak', 'mine']);

function route(): void {
  const path = window.location.pathname;

  const record = /^\/r\/(.+)$/.exec(path);
  if (record?.[1]) {
    show(createRecordPage(decodeURIComponent(record[1]), () => navigate('/')));
    return;
  }

  const puzzle = /^\/puzzles\/([a-z]+)\/?$/.exec(path);
  if (puzzle?.[1] && PUZZLE_MODES.has(puzzle[1] as PuzzleMode)) {
    /*
     * The theme is a query, not a path segment.
     *
     * `/puzzles/train?theme=fork` is the same *place* as `/puzzles/train` with a filter on it —
     * which is what a query string is for, and it keeps the section a person is in unambiguous for
     * the navigation above.
     */
    const theme = new URLSearchParams(window.location.search).get('theme') ?? undefined;
    show(createPuzzleScreen({ mode: puzzle[1] as PuzzleMode, theme, onBack: () => navigate('/') }));
    return;
  }

  /*
   * A live game, and the link that is the whole distribution strategy.
   *
   * `/g/<id>` has to work cold, from a message, for somebody who has never opened this app: no
   * redirect, no home screen first, no wallet prompt before a board. It is the same rule `/r/` obeys
   * and for the same reason — it is the URL a stranger receives.
   */
  /*
   * `/c/<id>` — a finished game, public and verifiable, with nothing required of the reader.
   *
   * `SPEC.md` N1 names this and the record as the two URLs that must open for somebody with no
   * wallet, no account and no app. It is also the most shareable thing the product makes, and until
   * it had an address it could not be sent to anybody.
   */
  /*
   * `/t/<id>` — a tournament, recomputed in the reader's own browser.
   *
   * Same rule as `/c/` and `/r/`: it opens cold for somebody with no wallet, no account and no
   * app, because it is a URL people send each other when they want to argue about who won.
   */
  const tourney = /^\/t\/([0-9a-z]{1,32})$/.exec(path);
  if (tourney?.[1]) {
    show(createTournamentPage(tourney[1], () => navigate('/')));
    return;
  }

  const certificate = /^\/c\/([0-9a-f]{32})$/.exec(path);
  if (certificate?.[1]) {
    show(createCertificatePage(certificate[1], () => navigate('/')));
    return;
  }

  const live = /^\/g\/([0-9a-f]{32})$/.exec(path);
  if (live?.[1]) {
    show(
      createOnlineScreen({
        id: live[1],
        onBack: () => navigate('/'),
        onRecord: (address) => navigate(`/r/${encodeURIComponent(address)}`),
        onGame: (id) => navigate(`/g/${id}`),
        onStudy: () => navigate('/study'),
      }),
    );
    return;
  }

  /*
   * `/verify` — the page that makes the whole product's claim checkable.
   *
   * It has to open cold for somebody who has never used this app, has no wallet and has been sent a
   * file by a friend, and it must not need our server for anything. Same rule as `/c/` and `/r/`,
   * and the same reason: it is a URL a stranger receives.
   */
  if (path === '/verify' || path === '/verify/') {
    show(createVerifyScreen());
    return;
  }

  if (path === '/coordinates' || path === '/coordinates/') {
    show(createCoordinateScreen({ onBack: () => navigate('/') }));
    return;
  }

  if (path === '/study' || path === '/study/') {
    show(createStudyScreen());
    return;
  }

  if (path === '/play' || path === '/play/') {
    show(
      createLobby({
        onCreated: (id) => navigate(`/g/${id}`),
        onTournament: (id) => navigate(`/t/${id}`),
        onBack: () => navigate('/'),
      }),
    );
    return;
  }

  if (path === '/puzzles' || path === '/puzzles/') {
    show(
      createPuzzleMenu({
        onMode: (mode) => navigate(`/puzzles/${mode}`),
        onTheme: (theme) => navigate(`/puzzles/train?theme=${encodeURIComponent(theme)}`),
        onCoordinates: () => navigate('/coordinates'),
        onBack: () => navigate('/'),
      }),
    );
    return;
  }

  /*
   * Everything else is the board.
   *
   * Not a 404: this app has one thing it is for, and somebody who mistypes a path is better served
   * by a playable board than by an apology. `/puzzles/nonsense` lands here too, which is the right
   * answer to a link that has been edited by hand.
   */
  show(board());
}

/*
 * Back asks the current screen before it leaves.
 *
 * Only a live game says no, and only while it is genuinely live (`online-screen.ts`). The history
 * entry is pushed back so the URL still matches what is on screen — otherwise the address bar would
 * say one thing and the board another, and the next Back would leave without asking.
 *
 * The screen cannot do this for itself: this listener is registered at module load and re-routes —
 * re-creating the screen — before any listener added inside one could run.
 */
window.addEventListener('popstate', () => {
  const current = shell.lastElementChild as (HTMLElement & { confirmLeave?: () => boolean }) | null;
  if (current?.confirmLeave?.()) {
    window.history.pushState({}, '', window.location.href);
    return;
  }
  route();
});

/*
 * Nothing may reach the console unhandled, and nothing may leave a blank page. A person who cannot
 * fix a bug can still be told what happened and given a way back.
 */
window.addEventListener('error', (event) => report(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  report(event.reason);
});

function report(error: unknown): void {
  console.error('[scoresheet]', error);
  const message = error instanceof Error ? error.message : String(error);
  const screen = document.createElement('div');
  screen.className = 'broken';
  const heading = document.createElement('h1');
  heading.textContent = t('app.broke');
  const detail = document.createElement('p');
  detail.textContent = message;
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'btn btn--primary';
  home.textContent = t('common.backToBoard');
  home.addEventListener('click', () => {
    game = null;
    navigate('/');
  });
  screen.append(heading, detail, home);
  app.replaceChildren(screen);
}

export { navigate };

/*
 * Register the service worker, so the app is there when the network is not.
 *
 * It is registered *after* the first route has rendered, deliberately: registration competes for the
 * same connection as the assets the first paint needs, and a board that appears a moment later is a
 * worse trade than a second visit that is instant.
 *
 * Everything about it is optional. A browser without service workers, a page served over plain HTTP,
 * a WebView that refuses registration — all of them get the app exactly as it was, and none of them
 * get an error. A failed registration is not something a person can act on.
 */
function keepItOffline(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

/*
 * The language is fetched before the first screen, and only when it is not English.
 *
 * `loadLanguage()` resolves immediately for English — which is most visitors and every cold open —
 * so this costs one already-settled promise. For everybody else it is one small chunk, and waiting
 * for it is what lets `t()` stay synchronous in every element in the app.
 */
void loadLanguage().finally(() => {
  route();
  keepItOffline();
});
