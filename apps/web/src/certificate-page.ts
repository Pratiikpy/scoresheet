/**
 * `/c/<gameId>` — a finished game, public, verifiable, with nothing required of the reader.
 *
 * `SPEC.md` N1 names two URLs that **must open for somebody with no wallet, no account and no app**:
 * the record, and the certificate. The record existed; the certificate could only be downloaded from
 * inside a game you had played, which meant the single most shareable artefact in the product had no
 * address and could not be sent to anybody.
 *
 * **This page is the argument, not a picture of it.** It fetches the game from the server, rebuilds
 * the exact canonical text both players signed, and verifies both signatures **in the reader's own
 * browser** — then says which of those checks passed. A stranger who has never heard of Nimiq can
 * open a link from a chat and satisfy themselves that a specific person beat another specific person,
 * with our server's honesty contributing nothing to the conclusion.
 *
 * It also renders the certificate image, because a page somebody has just been convinced by is the
 * right place to offer them the version they can forward.
 */

import { canonicaliseScoresheet, hashMoves, type Scoresheet, type Termination } from '@scoresheet/core';
import { Chess } from 'chess.js';
import { drawCertificate, loadIdenticons, loadPieces } from './certificate.ts';
import { explainFailure } from './failures.ts';
import { fetchGame } from './online.ts';
import { verifyScoresheetInBrowser } from './verify-browser.ts';
import type { GameView } from './online-types.ts';
import { t } from './i18n.ts';
import { createIdenticon } from './identicon.ts';
import { shortAddress } from './record.ts';

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

const TERMINATIONS: readonly Termination[] = [
  'checkmate', 'resignation', 'timeout', 'stalemate',
  'agreement', 'insufficient', 'repetition', 'fifty-move', 'abandoned',
];

/** Narrow the server's string to the scoresheet's union, exactly as the signing path does. */
function terminationOf(reason: string | null): Termination {
  return TERMINATIONS.find((candidate) => candidate === reason) ?? 'abandoned';
}

/**
 * Rebuild the bytes both players signed.
 *
 * **From the server's move list, not from its FEN.** Replaying is what makes a claimed final
 * position checkable: a server that reported a position its own moves do not reach would fail here
 * rather than be believed.
 */
export function scoresheetFrom(game: GameView): Scoresheet | null {
  if (!game.result || !game.white || !game.black || game.endedAtBlock === null) return null;

  const chess = new Chess();
  for (const san of game.moves) {
    try {
      chess.move(san);
    } catch {
      return null;
    }
  }

  return {
    chain: 'main',
    gameId: game.id,
    white: game.white,
    black: game.black,
    result: game.result,
    termination: terminationOf(game.termination),
    moveCount: Math.ceil(game.moves.length / 2),
    finalFen: chess.fen(),
    endedAtBlock: game.endedAtBlock,
    // Recomputed rather than taken on trust — it is inside the signed bytes.
    movesHash: '',
    rated: Math.floor(game.moves.length / 2) >= 10,
  };
}

export function createCertificatePage(gameId: string, onHome: () => void): HTMLElement {
  const el = element('div', 'certpage');

  el.append(element('h1', 'certpage__title', t('cert.title')));

  const verdict = element('p', 'certpage__verdict');
  verdict.setAttribute('role', 'status');
  verdict.textContent = t('cert.fetching');
  el.append(verdict);

  const detail = element('div', 'certpage__detail');
  el.append(detail);

  const picture = element('div', 'certpage__picture');
  el.append(picture);

  const actions = element('div', 'certpage__actions');
  el.append(actions);

  void (async () => {
    let game: GameView;
    try {
      const answer = await fetchGame(gameId);
      if ('unchanged' in answer) throw new Error('unexpected');
      game = answer;
    } catch (error) {
      verdict.className = 'certpage__verdict certpage__verdict--bad';
      verdict.textContent = explainFailure(error).message;
      actions.append(homeLink());
      return;
    }

    if (!game.result) {
      // A game that is still being played has nothing signed to show, and says so rather than
      // rendering an empty certificate.
      verdict.textContent = t('cert.stillPlaying');
      actions.append(homeLink());
      return;
    }

    const sheet = scoresheetFrom(game);
    const white = game.signatures?.white;
    const black = game.signatures?.black;

    if (!sheet) {
      verdict.className = 'certpage__verdict certpage__verdict--bad';
      verdict.textContent = t('cert.unreconstructable');
      actions.append(homeLink());
      return;
    }

    /*
     * The moves hash is recomputed, never copied.
     *
     * It is inside the signed bytes, so getting it from the server would be asking the server what
     * it signed — which is the one question a verifier must not ask anybody.
     */
    sheet.movesHash = hashMoves(game.moves);
    const canonical = canonicaliseScoresheet(sheet);

    if (!white || !black) {
      verdict.textContent =
        t('cert.onlyOne');
      detail.append(
      signatureLine(t('colour.white'), Boolean(white)),
      signatureLine(t('colour.black'), Boolean(black)),
    );
      actions.append(homeLink());
      await drawPicture(game, sheet);
      return;
    }

    /*
     * Verified here, in the reader's browser, with nothing asked of our server.
     *
     * This is the whole page. Everything above it is fetching; everything below it is presentation.
     */
    const result = await verifyScoresheetInBrowser(canonical, { white, black });

    verdict.className = `certpage__verdict certpage__verdict--${result.ok ? 'good' : 'bad'}`;
    verdict.textContent = result.ok
      ? t('cert.verified')
      : t('cert.bad');

    detail.append(
      element(
        'p',
        'certpage__note',
        result.ok
          ? t('cert.nothingAsked')
          : t('cert.checkFailed', { reason: result.failure ?? t('cert.unknown') }),
      ),
    );

    detail.append(players(game));

    const proof = element('details', 'certpage__proof');
    proof.append(element('summary', undefined, t('sign.whatWasSigned')));
    const pre = element('pre', 'certpage__canonical');
    pre.textContent = canonical;
    proof.append(pre);
    detail.append(proof);

    await drawPicture(game, sheet);

    const record = element('a', 'btn');
    record.href = `/r/${encodeURIComponent(game.white ?? '')}`;
    record.textContent = t('cert.winnersRecord');
    record.addEventListener('click', (event) => {
      event.preventDefault();
      const winner = game.result === '0-1' ? game.black : game.white;
      window.history.pushState({}, '', `/r/${encodeURIComponent(winner ?? '')}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    actions.append(record, homeLink());
  })();

  function homeLink(): HTMLElement {
    const node = element('button', 'btn btn--primary', t('cert.playYourself'));
    node.addEventListener('click', onHome);
    return node;
  }

  function signatureLine(side: string, present: boolean): HTMLElement {
    return element(
      'p',
      'certpage__note',
      `${side}: ${t(present ? 'cert.signed' : 'cert.notSignedYet')}`,
    );
  }

  /**
   * Who played, with their faces, on the page a stranger opens.
   *
   * This is the screen somebody lands on from a shared link, and until now it identified both
   * players by thirty-six characters of base-32 each. The identicon is the thing that makes two
   * addresses tell apart at a glance, which is the whole reason every Nimiq product draws one.
   */
  function players(game: GameView): HTMLElement {
    const row = element('div', 'certpage__players');
    for (const [label, address] of [
      [t('colour.white'), game.white],
      [t('colour.black'), game.black],
    ] as const) {
      if (!address) continue;
      const who = element('div', 'certpage__player');
      who.append(createIdenticon(address, 32));
      const text = element('div', 'certpage__player-text');
      text.append(
        element('span', 'certpage__player-side', label),
        element('span', 'certpage__player-address', shortAddress(address)),
      );
      who.append(text);
      row.append(who);
    }
    return row;
  }

  async function drawPicture(game: GameView, sheet: Scoresheet): Promise<void> {
    try {
      await loadPieces();
      await loadIdenticons([sheet.white, sheet.black]);
      const canvas = element('canvas', 'certificate');
      drawCertificate(canvas, {
        sheet,
        signatures: { white: game.signatures?.white, black: game.signatures?.black },
        verifyAt: window.location.host,
      });
      picture.append(canvas);
    } catch {
      // A canvas that will not draw costs the picture and nothing else — the verdict above it is the
      // part that matters, and it has already been reached.
    }
  }

  return el;
}
