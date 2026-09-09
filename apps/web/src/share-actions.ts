/**
 * The two ways a finished game leaves this app, as buttons.
 *
 * `SPEC.md` J1 and J5. The picture is the growth loop in its most compressed form — somebody wins,
 * sends an image, and the person receiving it can *check* it, which is the thing no other chess app
 * can offer. The PGN is the opposite promise: this game is not ours, and every chess program on
 * earth can read it.
 *
 * **One module, used by both endings.** The bot game and the live game need exactly this, and a live
 * game is the result most worth sending — so a copy that lived only on the bot ending would have put
 * the weaker artefact in front of the sharing path, and a second copy would have drifted.
 *
 * Both are built from the *stored* game rather than from either screen's state: a signed game is one
 * the store already holds, and rebuilding it from what a screen believes is how two artefacts about
 * one game end up disagreeing.
 */

import type { Scoresheet } from '@scoresheet/core';
import { allGames, type StoredGame } from './store.ts';
import { shareCertificate, sharePgn } from './share-game.ts';
import { t } from './i18n.ts';

export function shareActions(canonical: string, sheet: Scoresheet): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ending__share-block';

  const row = document.createElement('div');
  row.className = 'ending__share';

  const note = document.createElement('p');
  note.className = 'ending__note';
  note.setAttribute('role', 'status');
  note.hidden = true;

  const act = (
    label: string,
    action: string,
    run: (game: StoredGame) => Promise<string>,
  ): HTMLButtonElement => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'btn';
    node.textContent = label;
    node.dataset['action'] = action;
    node.addEventListener('click', () => {
      void (async () => {
        /*
         * The stored game is looked up by its canonical text, which is its identity.
         *
         * Not by a game id or an index: the canonical text is the exact bytes both players signed,
         * so a match on it is a match on the same game by definition. Anything else could find a
         * different game that happened to share a field.
         */
        const stored = allGames().find((candidate) => candidate.canonical === canonical);
        if (!stored) {
          note.hidden = false;
          note.textContent = t('share.notOnDevice');
          return;
        }

        node.disabled = true;
        note.hidden = false;
        try {
          note.textContent = await run(stored);
        } catch {
          // Drawing, encoding and sharing can all be refused in an embedded browser. None of it
          // loses anything — the game is signed and stored either way — so it is said calmly.
          note.textContent = t('share.didNotWork');
        } finally {
          node.disabled = false;
        }
      })();
    });
    return node;
  };

  row.append(
    act(t('share.asPicture'), 'share-image', (stored) => shareCertificate(stored, sheet)),
    act(t('share.asPgn'), 'share-pgn', (stored) => sharePgn(stored, sheet)),
  );

  wrapper.append(row, note);
  return wrapper;
}
