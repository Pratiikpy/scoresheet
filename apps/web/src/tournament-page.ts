/**
 * `/t/<id>` — a tournament, recomputed in front of you.
 *
 * The server hands over four things: who entered, what the draw was, which games were paired, and
 * what the results were. **It also sends its own standings, and this page ignores them.** The table
 * you see is computed here, in your browser, by the same public function anybody can run — and the
 * page says so, and shows you when the two disagree.
 *
 * That is the entire point. A tournament table on a website is a claim; a tournament table you
 * derived yourself from the games is a fact. Every other chess site asks you to believe the
 * standings because they computed them; this one hands you the games and the function.
 *
 * **What it still trusts, said plainly rather than glossed over:** the server's list of *which games
 * happened*. Those results come from the live-game server, and the tournament page does not verify
 * their signatures — the certificate at `/c/<id>` does that per game, and the portable record does it
 * per player. So the honest claim here is "given these results, this is the table", and the page
 * says exactly that instead of implying more.
 */

import {
  normaliseAddress,
  parseScoresheet,
  prizeSplit,
  standings,
  type Standing,
  type TournamentResult,
} from '@scoresheet/core';
import { createIdenticon } from './identicon.ts';
import { t } from './i18n.ts';
import { apiBase } from './online.ts';
import { verifyScoresheetInBrowser } from './verify-browser.ts';
import { allGames } from './store.ts';
import { connect, rememberedAddress, tier } from './wallet.ts';

interface TournamentPayload {
  id: string;
  name: string;
  state: 'open' | 'running' | 'finished';
  entrants: string[];
  seats: number;
  prizes: number[];
  order: string[];
  pairings: { round: number; board: number; white: string; black: string }[];
  results: TournamentResult[];
  /**
   * The signed games the results were read from.
   *
   * Present so this page never has to take the server's word for what happened — see the derivation
   * below. Optional in the type only because an older server would not send it, and a page that
   * threw on that would be worse than one that says plainly it could not check.
   */
  games?: { text: string; white: SignaturePair; black: SignaturePair }[];
  standings: Standing[];
  /** The height this tournament was created at. A game older than it cannot be reported into it. */
  createdAtBlock?: number;
}

interface SignaturePair {
  publicKeyHex: string;
  signatureHex: string;
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

function shortAddress(address: string): string {
  const tight = address.replace(/\s/g, '');
  return `${tight.slice(0, 8)}…${tight.slice(-4)}`;
}

export function createTournamentPage(id: string, onBack: () => void): HTMLElement {
  const el = element('div', 'tourney');
  el.append(element('h1', 'tourney__title', t('tourney.loading')));

  const body = element('div', 'tourney__body');
  el.append(body);

  void load();

  async function load(): Promise<void> {
    let payload: TournamentPayload;
    try {
      const response = await fetch(`${apiBase()}/api/tournaments/${encodeURIComponent(id)}`);
      if (!response.ok) {
        paintProblem(response.status === 404 ? t('tourney.notFound') : t('tourney.unavailable'));
        return;
      }
      payload = (await response.json()) as TournamentPayload;
    } catch {
      paintProblem(t('tourney.unavailable'));
      return;
    }
    await paint(payload);
  }

  function paintProblem(message: string): void {
    el.replaceChildren();
    el.append(element('h1', 'tourney__title', t('tourney.title')));
    el.append(element('p', 'tourney__note', message));
    const back = element('button', 'btn', t('tourney.back'));
    back.type = 'button';
    back.addEventListener('click', onBack);
    el.append(back);
  }

  /*
   * Async, because checking the signatures is real cryptography over the network of games.
   *
   * The page paints once, after the verification is done, rather than showing a table and correcting
   * it a moment later — a standings table that visibly changes under the reader is exactly the kind
   * of thing this page exists to make impossible.
   */
  async function paint(payload: TournamentPayload): Promise<void> {
    el.replaceChildren();
    el.append(element('h1', 'tourney__title', payload.name));

    const state = element(
      'p',
      'tourney__state',
      t(
        payload.state === 'open'
          ? 'tourney.open'
          : payload.state === 'running'
            ? 'tourney.running'
            : 'tourney.finished',
        { entrants: payload.entrants.length, seats: payload.seats },
      ),
    );
    el.append(state);

    /*
     * ⭐ **The part that makes this a tournament rather than a poster of one.**
     *
     * Everything below this point had been built and was unreachable: the pairings, the standings,
     * the tie-breaks and the payout were all computed and rendered, and there was no way to enter a
     * tournament or to put a game into one. A viewer for data the product could not create.
     *
     * Two actions close that, and both are deliberately small:
     *
     *  - **Join**, while seats remain. Nothing else is asked for — the address this device already
     *    knows is the whole registration.
     *  - **Report a game you have already played.** Not a new flow: a tournament result *is* an
     *    ordinary signed scoresheet, and this device keeps every one it has. So the page looks
     *    through what is already here for a fully signed game between the two people a pairing
     *    names, and offers to send that. There is no tournament-specific game mode, no id to thread
     *    through the live server, and nothing to go wrong between playing and reporting: play your
     *    opponent however you like, and the game becomes the result.
     *
     * Reporting is not a claim, which is why it can be offered this loosely. The server reads who
     * won out of the two signatures, so pressing this on a game you lost reports the loss.
     */
    const me = rememberedAddress();
    const mine = me === null ? null : normaliseAddress(me);
    const entered = mine !== null && payload.entrants.some((entrant) => normaliseAddress(entrant) === mine);

    /*
     * Offered to anybody who *could* sign, not only to somebody who already has.
     *
     * A tournament page is a link you are sent, so the common visitor has never connected on this
     * device — `rememberedAddress()` is null for them. Requiring it first meant the one person the
     * button exists for never saw it, which a browser run caught: the host was offered nothing
     * (already in) and the guest was offered nothing (not connected), so the seat could not be taken
     * by anyone. The wallet is asked for on the press instead, which is the rule the rest of the app
     * follows — connect when there is something worth signing, not on arrival.
     */
    const couldJoin = mine === null ? tier() !== 'none' : !entered;

    if (payload.state === 'open' && couldJoin && payload.entrants.length < payload.seats) {
      const join = element('button', 'btn btn--primary', t('tourney.join'));
      join.type = 'button';
      join.setAttribute('data-action', 'join-tournament');
      join.addEventListener('click', () => {
        join.disabled = true;
        void (async () => {
          try {
            const address = me ?? (await connect());
            const response = await fetch(`${apiBase()}/api/tournaments/${encodeURIComponent(id)}/join`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ address }),
            });
            if (!response.ok) throw new Error('join failed');
            await load();
          } catch {
            join.disabled = false;
            const problem = element('p', 'tourney__note', t('tourney.joinFailed'));
            problem.setAttribute('role', 'status');
            el.append(problem);
          }
        })();
      });
      el.append(join);
    }

    /*
     * ⭐ **The table, recomputed here.**
     *
     * `standings` is the same function the server ran, and it is run again on the results the server
     * sent. If they disagree, the page says so — loudly, because a disagreement means either the
     * server computed something else or somebody altered what it sent, and both are worth knowing.
     */
    /*
     * ⭐ **The results, derived here from the signatures — not read from the server's table.**
     *
     * This page used to recompute the standings from `payload.results`, which is a table this server
     * typed out. That proved the arithmetic and nothing else, and the caveat at the bottom said so:
     * *whether these are the results* was a separate question it could not answer.
     *
     * It can now. The tournament carries the signed games, so every result is checked here, in this
     * browser, against the two addresses inside each scoresheet — the same verification `/verify`
     * does. Who won comes out of the signed text. The round comes from the published pairings, by
     * matching the two players, so it is derived from public data rather than accepted.
     *
     * A game whose signatures do not check is **dropped**, not counted and not silently tolerated,
     * and the count of dropped games is shown. The standings below are then computed from what
     * survived — which means the table on screen is one nobody, including us, could have made up.
     */
    const signed = payload.games ?? [];
    const derived: TournamentResult[] = [];
    let unverifiable = 0;

    for (const game of signed) {
      const checked = await verifyScoresheetInBrowser(game.text, { white: game.white, black: game.black });
      if (!checked.ok || !checked.sheet) {
        unverifiable += 1;
        continue;
      }
      const white = normaliseAddress(checked.sheet.white);
      const black = normaliseAddress(checked.sheet.black);
      const pairing = payload.pairings.find(
        (candidate) =>
          (normaliseAddress(candidate.white) === white && normaliseAddress(candidate.black) === black) ||
          (normaliseAddress(candidate.white) === black && normaliseAddress(candidate.black) === white),
      );
      if (!pairing) {
        // Signed, genuine, and not a game this tournament ever asked for. It scores nothing.
        unverifiable += 1;
        continue;
      }
      derived.push({
        round: pairing.round,
        white,
        black,
        whiteScore: checked.sheet.result === '1-0' ? 1 : checked.sheet.result === '0-1' ? 0 : 0.5,
      });
    }

    /*
     * Which results the table is built from, and the honesty of saying which.
     *
     * With signed games present the derived set is the only one used. Without them — an older server,
     * or a tournament recorded before games were kept — the page falls back to the served table and
     * says, in `tourney.unchecked`, that it could not check the results themselves. It never
     * silently pretends the weaker check was the stronger one.
     */
    const checkedResults = signed.length > 0;
    const ours = standings(payload.entrants, checkedResults ? derived : payload.results);
    const agrees =
      JSON.stringify(ours.map((s) => [s.address, s.score, s.place])) ===
      JSON.stringify((payload.standings ?? []).map((s) => [s.address, s.score, s.place]));

    const verdict = element('p', `tourney__verdict tourney__verdict--${agrees ? 'good' : 'bad'}`);
    verdict.setAttribute('role', 'status');
    verdict.textContent = agrees
      ? checkedResults
        ? t('tourney.agreesSigned', { games: derived.length })
        : t('tourney.agrees')
      : t('tourney.disagrees');
    el.append(verdict);

    if (unverifiable > 0) {
      const dropped = element('p', 'tourney__dropped', t('tourney.dropped', { games: unverifiable }));
      dropped.setAttribute('role', 'status');
      el.append(dropped);
    }

    /* ---------------------------------------------------------------- the table */

    if (ours.some((standing) => standing.played > 0)) {
      el.append(element('h2', 'tourney__heading', t('tourney.standings')));
      const table = element('ol', 'tourney__standings');
      const payout = prizeSplit(ours, payload.prizes);

      for (const standing of ours) {
        const row = element('li', 'tourney__row');
        row.append(element('span', 'tourney__place', `${standing.place}`));
        row.append(createIdenticon(standing.address, 24));
        row.append(element('span', 'tourney__who', shortAddress(standing.address)));
        row.append(element('span', 'tourney__score', standing.score.toString()));

        const prize = payout.get(standing.address);
        if (prize !== undefined && prize > 0) {
          // Luna to NIM, at the one place a number becomes money on this page.
          row.append(element('span', 'tourney__prize', t('tourney.prize', { nim: (prize / 100_000).toFixed(2) })));
        }
        table.append(row);
      }
      el.append(table);
    }

    /* ---------------------------------------------------------------- the games */

    if (payload.pairings.length > 0) {
      el.append(element('h2', 'tourney__heading', t('tourney.games')));
      const rounds = [...new Set(payload.pairings.map((pairing) => pairing.round))].sort((a, b) => a - b);

      for (const round of rounds) {
        el.append(element('h3', 'tourney__round', t('tourney.round', { round: round + 1 })));
        const list = element('ul', 'tourney__games');

        for (const pairing of payload.pairings.filter((p) => p.round === round)) {
          // The same set the standings above were built from, so a board can never show a result
          // the table did not count, or hide one it did.
          const shown = checkedResults ? derived : payload.results;
          const played = shown.find(
            (result) =>
              result.round === pairing.round &&
              ((normaliseAddress(result.white) === normaliseAddress(pairing.white) &&
                normaliseAddress(result.black) === normaliseAddress(pairing.black)) ||
                (normaliseAddress(result.white) === normaliseAddress(pairing.black) &&
                  normaliseAddress(result.black) === normaliseAddress(pairing.white))),
          );
          const outcome = played
            ? played.whiteScore === 1
              ? '1–0'
              : played.whiteScore === 0
                ? '0–1'
                : '½–½'
            : t('tourney.toPlay');

          const game = element('li', 'tourney__game');
          game.append(element('span', 'tourney__side', shortAddress(pairing.white)));
          game.append(element('span', 'tourney__outcome', outcome));
          game.append(element('span', 'tourney__side', shortAddress(pairing.black)));
          list.append(game);
        }
        el.append(list);
      }
    }

    /* -------------------------------------------------------------- your own games to report */

    /*
     * Only the pairings that are yours, and only the ones still missing a result.
     *
     * A tournament page is public, so this section simply does not appear for a reader who is not in
     * it. For an entrant it is the only thing on the page they can act on, which is why it sits
     * above the standings rather than under them.
     */
    if (entered && mine !== null && payload.state !== 'open') {
      const held = allGames().filter((game) => game.signatures.white && game.signatures.black);
      const outstanding = payload.pairings.filter((pairing) => {
        const isMine =
          normaliseAddress(pairing.white) === mine || normaliseAddress(pairing.black) === mine;
        if (!isMine) return false;
        const shown = checkedResults ? derived : payload.results;
        return !shown.some(
          (result) =>
            result.round === pairing.round &&
            ((normaliseAddress(result.white) === normaliseAddress(pairing.white) &&
              normaliseAddress(result.black) === normaliseAddress(pairing.black)) ||
              (normaliseAddress(result.white) === normaliseAddress(pairing.black) &&
                normaliseAddress(result.black) === normaliseAddress(pairing.white))),
        );
      });

      if (outstanding.length > 0) {
        el.append(element('h2', 'tourney__heading', t('tourney.yours')));
        const list = element('ul', 'tourney__todo');

        for (const pairing of outstanding) {
          const opponent =
            normaliseAddress(pairing.white) === mine ? pairing.black : pairing.white;
          const row = element('li', 'tourney__todo-row');
          row.append(element('span', 'tourney__side', shortAddress(opponent)));

          /*
           * A game already on this device between exactly these two people.
           *
           * Matched on the canonical text rather than on any local bookkeeping, because the canonical
           * text is the thing that was signed. If several exist, the most recently saved wins — a
           * rematch is the game you meant.
           */
          const between = held
            .filter((game) => {
              const text = game.canonical;
              if (!text.includes(normaliseAddress(pairing.white))) return false;
              if (!text.includes(normaliseAddress(pairing.black))) return false;

              /*
               * And it has to be a game played *for this tournament*.
               *
               * The server refuses an older one — a pair who have ever played each other could
               * otherwise report a finished result the moment the draw came out. Filtering here as
               * well is not a second guard; it is so the button is never offered for a game that
               * will be refused, which would read as the app being broken rather than as the rule
               * doing its job.
               */
              try {
                const sheet = parseScoresheet(text);
                return sheet.endedAtBlock >= (payload.createdAtBlock ?? 0);
              } catch {
                return false;
              }
            })
            .sort((a, b) => b.savedAt - a.savedAt)[0];

          if (!between) {
            row.append(element('span', 'tourney__todo-note', t('tourney.playThem')));
          } else {
            const send = element('button', 'btn', t('tourney.report'));
            send.type = 'button';
            send.setAttribute('data-action', 'report-result');
            send.addEventListener('click', () => {
              send.disabled = true;
              void (async () => {
                try {
                  const response = await fetch(`${apiBase()}/api/tournaments/${encodeURIComponent(id)}/result`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      round: pairing.round,
                      scoresheet: between.canonical,
                      signatures: { white: between.signatures.white, black: between.signatures.black },
                    }),
                  });
                  if (!response.ok) throw new Error('report failed');
                  await load();
                } catch {
                  send.disabled = false;
                  row.append(element('span', 'tourney__todo-note', t('tourney.reportFailed')));
                }
              })();
            });
            row.append(send);
          }
          list.append(row);
        }
        el.append(list);
      }
    }

    /*
     * What this page proves — next to the tick, never in a footnote.
     *
     * When the signed games are present this now covers both halves: the table follows from the
     * games, *and* the games are ones two people actually signed, checked here. When they are not
     * present the older, weaker sentence is used instead, because the stronger one would be a claim
     * this page had not earned.
     */
    el.append(element('p', 'tourney__caveat', checkedResults ? t('tourney.caveat') : t('tourney.caveatUnchecked')));

    const back = element('button', 'btn', t('tourney.back'));
    back.type = 'button';
    back.addEventListener('click', onBack);
    el.append(back);
  }

  return el;
}
