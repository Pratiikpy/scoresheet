/**
 * Making a game to send to somebody.
 *
 * One screen, three choices, one button — and the button is the point. **The share link is the whole
 * distribution strategy** (`SPEC.md` step 5): a game you can hand over as a URL is a game somebody
 * plays without installing anything or knowing what Nimiq is, and every one of those links is both
 * the growth loop and the demo.
 *
 * So the friction is kept where it belongs. Time control and colour have sensible defaults, and
 * nothing here asks a question that could have had an answer.
 */

import { createGame } from './online.ts';
import { explainFailure } from './failures.ts';
import { connect, rememberedAddress, tier } from './wallet.ts';
import { haptic } from './sound.ts';
import { t } from './i18n.ts';

export interface LobbyOptions {
  /** A game exists; go and play it. */
  onCreated: (id: string) => void;
  /** A tournament exists; go and look at it. Its page is the thing you send to the other players. */
  onTournament: (id: string) => void;
  onBack: () => void;
}

interface Choice<T extends string> {
  value: T;
  name: string;
  detail: string;
}

/*
 * Built when the screen is, not at module load.
 *
 * A list of translated strings evaluated at import time would be frozen in whatever language the app
 * started in, and would stay in it after somebody changed the setting.
 */
const timeControls = (): Choice<'bullet' | 'blitz' | 'rapid' | 'unlimited'>[] => [
  { value: 'bullet', name: t('time.bullet'), detail: t('time.bulletDetail') },
  { value: 'blitz', name: t('time.blitz'), detail: t('time.blitzDetail') },
  { value: 'rapid', name: t('time.rapid'), detail: t('time.rapidDetail') },
  { value: 'unlimited', name: t('time.unlimited'), detail: t('time.unlimitedDetail') },
];

const colours = (): Choice<'w' | 'b' | 'random'>[] => [
  { value: 'random', name: t('colour.random'), detail: t('colour.randomDetail') },
  { value: 'w', name: t('colour.white'), detail: t('colour.whiteDetail') },
  { value: 'b', name: t('colour.black'), detail: t('colour.blackDetail') },
];

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

/** A row of choices, exactly one selected, as a real radio group for anybody using a keyboard. */
function chooser<T extends string>(
  label: string,
  choices: Choice<T>[],
  initial: T,
  onPick: (value: T) => void,
): { el: HTMLElement } {
  const group = element('div', 'lobby__group');
  group.append(element('p', 'lobby__label', label));

  const row = element('div', 'lobby__choices');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', label);

  let chosen = initial;
  const buttons = choices.map((choice) => {
    const node = element('button', 'lobby__choice');
    node.type = 'button';
    node.setAttribute('role', 'radio');
    node.dataset['choice'] = choice.value;
    node.append(
      element('span', 'lobby__choice-name', choice.name),
      element('span', 'lobby__choice-detail', choice.detail),
    );
    node.addEventListener('click', () => {
      chosen = choice.value;
      onPick(choice.value);
      mark();
      haptic(6);
    });
    return node;
  });

  function mark(): void {
    for (const [index, node] of buttons.entries()) {
      const isChosen = choices[index]!.value === chosen;
      node.classList.toggle('lobby__choice--chosen', isChosen);
      node.setAttribute('aria-checked', String(isChosen));
      node.tabIndex = isChosen ? 0 : -1;
    }
  }
  mark();

  row.append(...buttons);
  group.append(row);
  return { el: group };
}

export function createLobby(options: LobbyOptions): HTMLElement {
  const el = element('div', 'lobby');

  /*
   * No Back button: the navigation is global now.
   *
   * Every screen used to carry its own "Back to the board", which was the only way out when the nav
   * lived inside the bot-game screen. With three sections above every screen it is a second control
   * doing the same job in a different place — and two ways to do one thing is how a small app starts
   * feeling like a big one.
   */

  el.append(element('h1', 'lobby__title', t('lobby.title')));
  el.append(element('p', 'lobby__note', t('lobby.note')));

  let timeControl: 'bullet' | 'blitz' | 'rapid' | 'unlimited' = 'blitz';
  let colour: 'w' | 'b' | 'random' = 'random';

  el.append(chooser(t('lobby.time'), timeControls(), timeControl, (value) => (timeControl = value)).el);
  el.append(chooser(t('lobby.youPlay'), colours(), colour, (value) => (colour = value)).el);

  const problem = element('p', 'lobby__problem');
  problem.setAttribute('role', 'status');
  problem.hidden = true;

  const make = element('button', 'btn btn--primary lobby__make', t('lobby.make'));
  make.type = 'button';
  make.dataset['action'] = 'make-game';
  make.addEventListener('click', () => void go());

  el.append(problem, make);

  /*
   * Opening a game from elsewhere lives here, under making one.
   *
   * It is the same intent — "I want a game on this board" — and it needs a home that is not a
   * fourth navigation section for something people do occasionally.
   */
  const open = element('a', 'btn lobby__import', t('lobby.study'));
  open.href = '/study';
  open.addEventListener('click', (event) => {
    event.preventDefault();
    window.history.pushState({}, '', '/study');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  el.append(open);

  /**
   * The address this device can act as, asking for it only if it is not already known.
   *
   * Shared by making a game and holding a tournament, because both need exactly the same thing for
   * exactly the same reason: a seat is what a scoresheet gets signed against, so a seat with no
   * address is a seat with no record. Asked here rather than on arrival, which keeps the rule the
   * whole app follows — a stranger plays first and connects when there is something worth signing.
   */
  async function addressOrNull(): Promise<string | null> {
    const known = rememberedAddress();
    if (known) return known;
    if (tier() === 'none') return null;
    return await connect().catch(() => null);
  }

  async function go(): Promise<void> {
    make.disabled = true;
    make.textContent = t('lobby.making');
    problem.hidden = true;

    /*
     * A wallet is needed to *hold a seat*, and this is where it is asked for — not on arrival.
     *
     * The seat is what the scoresheet gets signed against, so a game with no address is a game with
     * no record. Asking here rather than on page load keeps the rule the whole app follows: a
     * stranger plays first, and connects when there is something worth signing.
     */
    let address = rememberedAddress();
    if (!address && tier() !== 'none') address = await connect().catch(() => null);

    if (!address) {
      make.disabled = false;
      make.textContent = t('lobby.make');
      problem.hidden = false;
      problem.textContent = t('lobby.needsWallet');
      return;
    }

    try {
      const game = await createGame({ address, colour, timeControl });
      options.onCreated(game.id);
    } catch (error) {
      make.disabled = false;
      make.textContent = t('lobby.make');
      problem.hidden = false;
      problem.textContent = explainFailure(error).message;
    }
  }

  /* ------------------------------------------------------------------ a tournament */

  /*
   * ⭐ The only way to make a tournament, and until now there was none.
   *
   * Every part of a tournament was built — the draw, the pairings, the standings, the tie-breaks,
   * the payout, a public page that recomputes all of it — and nothing in the product could create
   * one. The whole feature was reachable only by typing a URL for a tournament that could not exist.
   *
   * It is one button on purpose. A tournament here is a link you send to people, exactly like a game
   * is: press it, get a page, send the page. Seats are the single question, because the field size
   * is the one thing that changes the format — up to eight plays everybody, above that is Swiss.
   *
   * **No prize field.** Prizes are a declared number this product cannot yet pay: the pool has never
   * moved real NIM. Offering a box to type one into would be inviting a promise we would not keep,
   * so tournaments made here are for the table, and the prize column stays empty until there is
   * money behind it.
   */
  el.append(element('h2', 'lobby__heading', t('lobby.tourneyTitle')));
  el.append(element('p', 'lobby__note', t('lobby.tourneyNote')));

  let seats: 4 | 6 | 8 | 12 = 4;
  el.append(
    chooser(
      t('lobby.seats'),
      [
        { value: '4' as const, name: t('lobby.seats4'), detail: t('lobby.seats4Detail') },
        { value: '6' as const, name: t('lobby.seats6'), detail: t('lobby.seats6Detail') },
        { value: '8' as const, name: t('lobby.seats8'), detail: t('lobby.seats8Detail') },
        { value: '12' as const, name: t('lobby.seats12'), detail: t('lobby.seats12Detail') },
      ],
      '4',
      (value) => (seats = Number(value) as 4 | 6 | 8 | 12),
    ).el,
  );

  const tourneyProblem = element('p', 'lobby__problem');
  tourneyProblem.setAttribute('role', 'status');
  tourneyProblem.hidden = true;

  const hold = element('button', 'btn lobby__make', t('lobby.hold'));
  hold.type = 'button';
  hold.setAttribute('data-action', 'hold-tournament');
  hold.addEventListener('click', () => {
    hold.disabled = true;
    tourneyProblem.hidden = true;
    void (async () => {
      const address = await addressOrNull();
      if (!address) {
        hold.disabled = false;
        tourneyProblem.hidden = false;
        tourneyProblem.textContent = t('lobby.needsWallet');
        return;
      }
      try {
        const response = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, name: t('lobby.tourneyName'), seats, prizes: [] }),
        });
        if (!response.ok) throw new Error('could not create');
        const made = (await response.json()) as { id: string };
        options.onTournament(made.id);
      } catch (error) {
        hold.disabled = false;
        tourneyProblem.hidden = false;
        tourneyProblem.textContent = explainFailure(error).message;
      }
    })();
  });

  el.append(hold);
  el.append(tourneyProblem);

  return el;
}
