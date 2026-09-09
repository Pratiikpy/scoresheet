/**
 * The record page — `/r/<address>`.
 *
 * Minute 3:00 of the judge walkthrough (`SPEC.md` Q4), and the one screen nothing else in the
 * catalog can build. Everything else here is a chess feature somebody already has; this is the
 * only thing that is impossible on Chess.com and on Lichess.
 *
 * The claim it has to survive is narrow: **a rating nobody issued and nobody can revoke**. Three
 * things make that true rather than a slogan, and all three are on this page:
 *
 *  1. **Every game is listed in canonical order**, with the rating before and after it, so the
 *     number is not asserted — it is shown being arrived at.
 *  2. **Recompute** re-derives the whole chain in the visitor's own browser, verifying every
 *     signature locally, and prints the number it reaches beside ours. If they ever disagree, ours
 *     is wrong, and saying so out loud is the point.
 *  3. **Nothing here is writable by its subject.** No bio, no headline, no badge. A page its owner
 *     can write on is a page a stranger has to discount.
 *
 * It must open for somebody with no wallet, no account and no app — it is the growth loop as well
 * as the proof.
 */

import {
  DISTINCT_OPPONENTS_FOR_ESTABLISHED,
  MIN_MOVES_TO_RATE,
  canonicalOrder,
  computePuzzleRating,
  counts,
  normaliseAddress,
  parseScoresheet,
  ratingFor,
  sameAddress,
  toRatedGame,
  type PuzzleAttempt,
  type PuzzleCard,
  type RatedGame,
  type Scoresheet,
} from '@scoresheet/core';
import { PUBLISHED_KEYS } from './demo-wallet.ts';
import { createRatingGraph } from './rating-graph.ts';
import { allCards, puzzleRatingFor } from './puzzle-cards.ts';
import { gamesFor, type StoredGame } from './store.ts';
import { verifyPuzzleCardInBrowser, verifyScoresheetInBrowser } from './verify-browser.ts';
import { t } from './i18n.ts';
import { shareBundle } from './portable-record.ts';
import { blockNumber } from './wallet.ts';
import { createIdenticon } from './identicon.ts';

/** A wallet, shortened the way a person reads one: enough of both ends to recognise it. */
export function shortAddress(address: string): string {
  const tight = normaliseAddress(address);
  return `${tight.slice(0, 8)}…${tight.slice(-4)}`;
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

export function createRecordPage(address: string, onBack: () => void): HTMLElement {
  const wallet = normaliseAddress(address);
  const stored = gamesFor(wallet);
  const sheets: Scoresheet[] = stored.map((game) => parseScoresheet(game.canonical));
  const rated: RatedGame[] = sheets.map(toRatedGame);
  const rating = ratingFor(wallet, rated);

  const el = element('div', 'record');

  /*
   * No Back button: the navigation is global now.
   *
   * Every screen used to carry its own "Back to the board", which was the only way out when the nav
   * lived inside the bot-game screen. With three sections above every screen it is a second control
   * doing the same job in a different place — and two ways to do one thing is how a small app starts
   * feeling like a big one.
   */

  el.append(element('h1', 'record__title', t('record.title')));

  /*
   * The face goes beside the address, at the top, at the size a person recognises.
   *
   * Thirty-six characters of base-32 identify a wallet and tell a person nothing. This is the page
   * where somebody checks *whose* record they are looking at, so it is the one place the identicon is
   * large rather than incidental.
   */
  const who = element('div', 'record__who');
  who.append(createIdenticon(wallet, 48), element('p', 'record__address', wallet));
  el.append(who);

  /*
   * A rating built on published keys says so, wherever it is being read.
   *
   * The stand-in wallet and the bot both sign with keys printed in this repository. Their signatures
   * verify — that is the point of them — but anybody can produce more, so a number derived from them
   * demonstrates the arithmetic rather than establishing a person.
   *
   * The trigger is the signatures, never `?demo=1`. A record lives at `/r/<address>` and carries no
   * flag, so a stranger following a shared link would have read a published-key rating as an
   * ordinary one — which is precisely the misreading this whole page exists to prevent.
   */
  const published = stored.filter((game) =>
    Object.values(game.signatures).some((signature) => signature && PUBLISHED_KEYS.has(signature.publicKeyHex)),
  ).length;

  if (published > 0) {
    el.append(
      element(
        'p',
        'record__banner',
        published === stored.length
          ? t('record.allPublished')
          : t('record.somePublished', { published, total: stored.length }),
      ),
    );
  }

  /* ------------------------------------------------------------------ the number */

  const headline = element('div', 'record__headline');
  const number = element('div', 'record__rating', String(rating.rating));
  if (!rating.established) {
    // A provisional rating says so on its face, everywhere it appears. A number that has not met
    // ten different people is not a rating yet, and hiding that would be the dishonest part.
    number.append(element('span', 'record__provisional', '?'));
  }
  headline.append(number);

  /*
   * The distinct-opponent count travels with the number, always, never in a fold.
   *
   * It is what makes the rating readable: a big number from one opponent advertises itself. This is
   * the whole anti-farming design made visible, and putting it on a second screen would undo it.
   */
  const counted = rating.distinctOpponents;
  headline.append(
    element(
      'p',
      'record__meta',
      rating.games === 0
        ? t('record.noRatedGames')
        : `${t(rating.games === 1 ? 'record.oneRatedGame' : 'record.ratedGames', { games: rating.games })} · ${t(
            counted === 1 ? 'record.oneOpponent' : 'record.opponents',
            { count: counted },
          )}`,
    ),
  );

  if (!rating.established && rating.games > 0) {
    headline.append(
      element(
        'p',
        'record__note',
        t('record.provisional', { needed: DISTINCT_OPPONENTS_FOR_ESTABLISHED, so_far: counted }),
      ),
    );
  }
  /*
   * The line, under the number.
   *
   * A number says where you are; a line says whether you are getting better, which is the only
   * question anybody actually asks about a rating. It is absent rather than empty for a record with
   * fewer than two rated games — a graph of one game says less than the number above it already does.
   */
  const graph = createRatingGraph(rating.history, { distinctOpponents: counted });
  if (graph) headline.append(graph);

  el.append(headline);

  /* ------------------------------------------------------------------ the puzzle rating */

  /*
   * The rating one person can earn on their own.
   *
   * This is the answer to the criticism that sank a Cycle 1 entry — that an app "only creates value
   * for people who already have a Nimiq address" — and by extension for people who can find a second
   * person who has one too. A game rating needs an opponent. A puzzle rating needs a witness, and
   * the witness is a server with a published address rather than a friend who happens to be online.
   *
   * It is deliberately a **second number rather than part of the first**. They measure different
   * things and mixing them would let puzzles inflate a playing strength, which is the reason Lichess
   * keeps them apart too. Nothing here computes it: `puzzleRatingFor` replays the signed cards.
   */
  const puzzles = puzzleRatingFor(address);
  if (puzzles.runs > 0) {
    const box = element('div', 'record__puzzles');
    box.append(
      element('p', 'record__label', t('record.puzzleRating')),
      element('p', 'record__rating record__rating--puzzles', String(puzzles.rating)),
      element(
        'p',
        'record__note',
        `${puzzles.solved} solved of ${puzzles.attempted}, across ${puzzles.runs} ${
          puzzles.runs === 1 ? 'signed run' : 'signed runs'
        }.`,
      ),
    );
    if (puzzles.brokenAt !== null) {
      /*
       * Said out loud rather than hidden. A chain that does not add up is the one thing this page
       * exists to be able to report — a card is missing, or one disagrees with its own results, and
       * quietly showing the total anyway would make the whole page decoration.
       */
      const warning = element(
        'p',
        'record__note record__note--bad',
        'One of these runs does not follow from the one before it, so this number cannot be checked all the way back.',
      );
      box.append(warning);
    }
    el.append(box);
  }

  /* ------------------------------------------------------------------ take it with you */

  /*
   * ⭐ **The last step from a claim to a fact.**
   *
   * Recompute, below, proves the number in front of you. It still happens on our page. This button
   * is the difference between "you can check this here" and "you can check this anywhere": one file,
   * every signed game and puzzle run, two Merkle roots over them, and a `/verify` page that reads it
   * with our server switched off.
   *
   * It is placed above Recompute deliberately. Recompute is the argument; this is the thing you
   * leave with, and a person who is convinced should not have to scroll past the proof to find it.
   */
  const takeBox = element('div', 'record__take');
  takeBox.append(element('h2', 'record__subtitle', t('record.take')));
  takeBox.append(element('p', 'record__note', t('record.takeNote')));

  const takeButton = element('button', 'btn', t('record.takeButton'));
  takeButton.type = 'button';
  /*
   * A class of its own, not `record__result`.
   *
   * It was `record__result` for one commit, and because this section sits above Recompute in the
   * DOM, `querySelector('.record__result')` started returning *this* line instead of the recompute
   * verdict — which broke the check that reads that verdict, thirty seconds at a time. Two elements
   * doing different jobs must not share a name just because they look alike.
   */
  const takeResult = element('p', 'record__taken');
  takeResult.setAttribute('role', 'status');

  // Nothing signed means nothing to hand over, and a button that produces an empty file is worse
  // than one that is honestly unavailable.
  const signedHere = stored.filter((game) => game.signatures.white && game.signatures.black).length;
  if (signedHere === 0) {
    takeButton.disabled = true;
    takeResult.textContent = t('record.takeEmpty');
  }

  takeButton.addEventListener('click', () => {
    void (async () => {
      takeButton.disabled = true;
      try {
        /*
         * The height is stamped for the reader's benefit, and its absence is not a failure.
         *
         * `blockNumber()` needs the wallet. Somebody exporting their own record from a browser tab
         * has no wallet, and refusing to give them their own file over a decorative field would be
         * absurd — so a missing height is recorded as zero and the record is still handed over.
         */
        const height = (await blockNumber()) ?? 0;
        takeResult.textContent = await shareBundle(wallet, height);
      } catch {
        takeResult.textContent = t('share.didNotWork');
      } finally {
        takeButton.disabled = signedHere === 0;
      }
    })();
  });

  takeBox.append(takeButton, takeResult);
  el.append(takeBox);

  /* ------------------------------------------------------------------ recompute */

  const recomputeBox = element('div', 'record__recompute');
  const recomputeButton = element('button', 'btn btn--primary', t('record.recompute'));
  recomputeButton.type = 'button';
  const recomputeNote = element(
    'p',
    'record__note',
    t('record.recomputeNote'),
  );
  const recomputeResult = element('div', 'record__result');
  recomputeResult.setAttribute('role', 'status');
  recomputeBox.append(recomputeNote, recomputeButton, recomputeResult);
  el.append(recomputeBox);

  recomputeButton.addEventListener('click', () => void recompute());

  async function recompute(): Promise<void> {
    recomputeButton.disabled = true;
    recomputeButton.textContent = t('record.checking');
    recomputeResult.replaceChildren();

    /*
     * Verify first, then compute. A rating derived from games that do not verify is not a rating,
     * so unverified games are dropped from the chain rather than counted — and the page says how
     * many were dropped, because a silent exclusion is a lie of omission.
     */
    const verified: RatedGame[] = [];
    let unsigned = 0;
    let invalid = 0;

    for (const game of stored) {
      const { white, black } = game.signatures;
      if (!white || !black) {
        unsigned += 1;
        continue;
      }
      const result = await verifyScoresheetInBrowser(game.canonical, { white, black });
      if (result.ok && result.sheet) verified.push(toRatedGame(result.sheet));
      else invalid += 1;
    }

    const independent = ratingFor(wallet, verified);
    const agrees = independent.rating === rating.rating && independent.games === rating.games;

    /*
     * Two different counts, and conflating them is misleading.
     *
     * `verified.length` is how many scoresheets this browser checked and believed. `games` is how
     * many of those moved the rating — a casual game verifies perfectly and rates nobody, so a
     * verdict reading "0 verified games" after checking a real signature is simply wrong.
     */
    const checked = verified.length;
    const verdict = element('p', `record__verdict record__verdict--${agrees ? 'good' : 'bad'}`);
    const checkedText = t(checked === 1 ? 'record.checkedOne' : 'record.checkedMany', { checked });
    const ratedText =
      independent.games === 0 ? t('record.noneRate') : t('record.someRate', { games: independent.games });
    verdict.textContent = agrees
      ? `${checkedText} ${ratedText} ${t('record.agrees', { reached: independent.rating })}`
      : `${checkedText} ${ratedText} ${t('record.disagrees', {
          reached: independent.rating,
          shown: rating.rating,
        })}`;
    recomputeResult.append(verdict);

    const detail: string[] = [];
    if (unsigned > 0) detail.push(t('record.leftOutUnsigned', { count: unsigned }));
    if (invalid > 0) detail.push(t('record.leftOutInvalid', { count: invalid }));
    if (detail.length > 0) {
      recomputeResult.append(element('p', 'record__note', t('record.leftOut', { detail: detail.join(', ') })));
    }

    /*
     * ⭐ **And the puzzle rating, checked the same way.**
     *
     * Without this the page kept two promises of different strength: every game was verified before
     * it counted, while the puzzle rating above was replayed from whatever was in storage. A card
     * written by hand would have shown a rating this page had never checked — on the one screen whose
     * entire argument is that you do not have to take our word for anything.
     *
     * Verified cards are replayed; unverified ones are dropped and *counted out loud*, exactly as
     * unverified games are, because a silent exclusion is the same lie in a different place.
     */
    const cards = allCards();
    if (cards.length > 0) {
      const good: PuzzleCard[] = [];
      const byId = new Map<string, PuzzleAttempt[]>();
      let badCards = 0;

      for (const stored of cards) {
        const { solver, witness } = stored.signatures;
        if (!solver || !witness) {
          badCards += 1;
          continue;
        }
        const checkedCard = await verifyPuzzleCardInBrowser(stored.canonical, { solver, witness });
        if (checkedCard.ok && checkedCard.card && sameAddress(checkedCard.card.solver, wallet)) {
          good.push(checkedCard.card);
          byId.set(checkedCard.card.sessionId, stored.attempts);
        } else if (checkedCard.card && !sameAddress(checkedCard.card.solver, wallet)) {
          // Somebody else's run, kept on this device. Not a failure and not counted.
          continue;
        } else {
          badCards += 1;
        }
      }

      const derived = computePuzzleRating(good, (card) => byId.get(card.sessionId));
      const shown = puzzleRatingFor(wallet);
      const puzzleAgrees = derived.rating === shown.rating && derived.runs === shown.runs;

      const line = element('p', `record__verdict record__verdict--${puzzleAgrees ? 'good' : 'bad'}`);
      const one = good.length === 1;
      const counted = `${good.length} ${one ? 'puzzle run' : 'puzzle runs'} verified here`;
      line.textContent = puzzleAgrees
        ? `${counted}, and ${one ? 'it reaches' : 'they reach'} ${derived.rating} — the number above.`
        : `${counted} ${one ? 'reaches' : 'reach'} ${derived.rating}, and the page shows ${shown.rating}. Ours is wrong.`;
      recomputeResult.append(line);

      if (badCards > 0) {
        recomputeResult.append(
          element(
            'p',
            'record__note',
            `${badCards} ${badCards === 1 ? 'run was' : 'runs were'} left out because the signatures did not check.`,
          ),
        );
      }
      if (derived.brokenAt !== null) {
        recomputeResult.append(
          element(
            'p',
            'record__note record__note--bad',
            'One run does not follow from the one before it, so the chain cannot be checked all the way back.',
          ),
        );
      }
    }

    recomputeButton.disabled = false;
    recomputeButton.textContent = t('record.recompute');
  }

  /* ------------------------------------------------------------------ the games */

  if (stored.length === 0) {
    const empty = element('div', 'record__empty');
    empty.append(element('p', 'record__note', t('record.empty')));
    empty.append(
      element(
        'p',
        'record__note',
        t('record.emptyNote'),
      ),
    );
    el.append(empty);
    return el;
  }

  el.append(element('h2', 'record__heading', t('record.everyGame')));

  const list = element('ol', 'record__games');
  const byId = new Map(stored.map((game) => [parseScoresheet(game.canonical).gameId, game] as const));
  const history = new Map(rating.history.map((point) => [point.gameId, point] as const));

  for (const game of canonicalOrder(rated)) {
    const row = element('li', 'record__game');
    const sheet = parseScoresheet(byId.get(game.gameId)!.canonical);
    const iAmWhite = sheet.white === wallet;
    const opponent = iAmWhite ? sheet.black : sheet.white;
    const point = history.get(game.gameId);

    const top = element('div', 'record__row');
    const against = element('span', 'record__opponent');
    against.append(createIdenticon(opponent, 20), document.createTextNode(shortAddress(opponent)));
    top.append(against);

    const score = point?.score;
    top.append(
      element(
        'span',
        `record__score record__score--${score === 1 ? 'win' : score === 0 ? 'loss' : 'draw'}`,
        score === undefined ? '—' : t(score === 1 ? 'record.won' : score === 0 ? 'record.lost' : 'record.drew'),
      ),
    );

    if (point) {
      const delta = point.after - point.before;
      top.append(
        element(
          'span',
          'record__delta',
          `${point.before} → ${point.after}${delta === 0 ? '' : ` (${delta > 0 ? '+' : ''}${delta})`}`,
        ),
      );
    }
    row.append(top);

    // Why a game did not move the number, said plainly rather than left as a gap in the list.
    if (!counts(game)) {
      const why = !game.rated
        ? t('record.casual')
        : t('record.tooShort', { moves: MIN_MOVES_TO_RATE });
      row.append(element('p', 'record__note', why));
    } else if (point?.k === 0) {
      row.append(element('p', 'record__note', t('record.farmed')));
    }

    row.append(
      element(
        'p',
        'record__note',
        t('record.gameLine', {
          termination: sheet.termination,
          moves: sheet.moveCount,
          block: sheet.endedAtBlock,
        }),
      ),
    );
    list.append(row);
  }

  el.append(list);
  el.append(
    element(
      'p',
      'record__footer',
      t('record.footer'),
    ),
  );

  return el;
}

/** Whether a stored game has both signatures, for anything that wants to say so. */
export function isComplete(game: StoredGame): boolean {
  return Boolean(game.signatures.white && game.signatures.black);
}
