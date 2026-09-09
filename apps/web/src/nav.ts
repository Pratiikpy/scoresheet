/**
 * The navigation, on every screen.
 *
 * `SPEC.md` N1 asks for three sections and Part M1 lists **Navigation** as a scored criterion it
 * marked *absent*. It stayed absent in a subtler way than "no links": there was a nav, and it was
 * built inside the bot-game screen, so every other screen — puzzles, the lobby, a live game, a
 * record — had no way out except a single "Back" button that always went to the board. Somebody on
 * the puzzle screen could not reach their record without going home first.
 *
 * Three sections, because there are three things a person comes here to do:
 *
 *  - **Play** — the board, a friend, a live game. The default, and where a stranger lands.
 *  - **Train** — puzzles, in all four modes.
 *  - **You** — the record: the signed rating, which is the whole point of the product.
 *
 * It is deliberately a strip of three links rather than a tab bar pinned to the bottom of the
 * viewport. A fixed bar costs 56 px of a 390 px phone on every screen, and the screen that matters
 * most here is a *square board* — the one layout where vertical space is the scarce thing.
 */

import { knownAddresses } from './store.ts';
import { t } from './i18n.ts';

export type Section = 'play' | 'train' | 'you';

/** Which section a path belongs to, so the right link is marked without the caller saying so. */
export function sectionFor(path: string): Section {
  if (path.startsWith('/puzzles') || path.startsWith('/coordinates')) return 'train';
  if (path.startsWith('/r/')) return 'you';
  return 'play';
}

export interface NavOptions {
  /** Go somewhere, through the router rather than a page load. */
  onGo: (path: string) => void;
  /** Say something when there is nowhere to go yet — no wallet, no signed games. */
  onNothing: (message: string) => void;
}

export function createNav(options: NavOptions): { el: HTMLElement; mark: (path: string) => void } {
  const el = document.createElement('nav');
  el.className = 'nav';
  el.setAttribute('aria-label', t('nav.sections'));

  const links: { section: Section; el: HTMLAnchorElement }[] = [];

  const link = (section: Section, label: string, href: string, go: () => void): HTMLAnchorElement => {
    const node = document.createElement('a');
    node.className = 'nav__link';
    node.href = href;
    node.textContent = label;
    node.dataset['nav'] = section;
    node.addEventListener('click', (event) => {
      // Intercepted so it is a route, not a page load — a live game in progress must survive it.
      event.preventDefault();
      go();
    });
    links.push({ section, el: node });
    return node;
  };

  el.append(
    link('play', t('nav.play'), '/', () => options.onGo('/')),
    link('train', t('nav.train'), '/puzzles', () => options.onGo('/puzzles')),
    /*
     * "You" needs a wallet, and there may not be one yet.
     *
     * Rather than a dead link or a disabled control, the addresses this device has actually signed
     * with are used — which is exactly who this person is as far as any signed game is concerned.
     * With none, the link says what to do instead of failing silently.
     */
    link('you', t('nav.you'), '#', () => {
      const known = knownAddresses();
      if (known.length > 0) options.onGo(`/r/${encodeURIComponent(known[0]!)}`);
      else {
        options.onNothing(t('nav.noRecord'));
      }
    }),
  );

  return {
    el,
    mark(path) {
      const current = sectionFor(path);
      for (const { section, el: node } of links) {
        const here = section === current;
        node.classList.toggle('nav__link--here', here);
        // `page` rather than `true`: this is the page, not merely the current item in a list.
        if (here) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
      }
    },
  };
}
