/**
 * The move list, and it is scrubbable.
 *
 * Every chess site lets you tap a move and see that position, walk it with the arrow keys, and get
 * back to the live game in one tap. It is not a review feature — people do it mid-game, constantly,
 * to check what just happened. A move list you can only read is a move list that is half built.
 *
 * Two rules that matter more than they look:
 *
 *  - **Return-to-live is always visible when you are not live.** Nothing is worse than scrubbing
 *    back, then not being able to find your way to the position you are actually playing.
 *  - **Scrubbing never touches the game.** This emits a ply to look at; the game decides what that
 *    means. A move list that mutated the position would make every bug in it a bug in the game.
 */

import { openingFor } from '@scoresheet/core';
import { t } from './i18n.ts';

export interface MoveListOptions {
  /** Called with the ply to show, or `null` for the live position. */
  onScrub: (ply: number | null) => void;
  /**
   * One sentence saying what this app is, shown only while no move has been played.
   *
   * Passed in rather than written here because the move list has no opinion about the product; it
   * simply happens to own the only space on the first screen that was going spare. Absent in every
   * other context that shows a move list, and absent once this device holds a signed game.
   */
  claim?: string | undefined;
}

export interface MoveListHandle {
  readonly el: HTMLElement;
  /** Redraw from the game's move list, in SAN. */
  setMoves: (san: readonly string[]) => void;
  /** Which ply is being viewed — `null` when live. */
  setViewing: (ply: number | null) => void;
  /** Step one move back or forward, clamped, and report where it landed. */
  step: (delta: number) => void;
  /** Jump to the start, or back to the live position. */
  toStart: () => void;
  toLive: () => void;
  /**
   * Mark each move with what the analysis made of it, or `null` to clear.
   *
   * One entry per ply, in order. This is what turns a list of moves into a report you can *see*:
   * a column of `??` down one side is a game read at a glance, and it is what makes a player tap the
   * move rather than read a paragraph.
   */
  setAnnotations: (annotations: readonly { mark: string; kind: string }[] | null) => void;
}

export function createMoveList(options: MoveListOptions): MoveListHandle {
  let moves: readonly string[] = [];
  let viewing: number | null = null;
  let annotations: readonly { mark: string; kind: string }[] | null = null;

  const el = document.createElement('div');
  el.className = 'moves';

  const scroller = document.createElement('ol');
  scroller.className = 'moves__list';
  scroller.setAttribute('aria-label', t('moves.label'));

  /*
   * The bar is always in the DOM, never conditionally added.
   *
   * Adding and removing it would change the height of everything below the board the moment
   * somebody scrubbed — the board is fixed, but the page under it would jump, which is the same
   * defect one layer down.
   */
  const bar = document.createElement('div');
  bar.className = 'moves__bar';

  const control = (label: string, symbol: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'moves__control';
    button.setAttribute('aria-label', label);
    button.textContent = symbol;
    button.addEventListener('click', onClick);
    return button;
  };

  const first = control(t('moves.toStart'), '⏮', () => handle.toStart());
  const back = control(t('moves.back'), '◀', () => handle.step(-1));
  const forward = control(t('moves.forward'), '▶', () => handle.step(1));
  const live = control(t('moves.toLive'), '⏭', () => handle.toLive());

  const liveNote = document.createElement('span');
  liveNote.className = 'moves__note';

  /*
   * The opening name, above the moves.
   *
   * Every chess site shows it, from the second move, and players read it constantly — it is how a
   * game gets filed in memory and how it gets looked up afterwards. Two details are worth the extra
   * lines:
   *
   *  - **It follows the scrubber.** Walking back through the moves walks back through the names, so
   *    it answers "when did this stop being a Sicilian" rather than sitting there as a fixed label.
   *  - **It says when the game left theory**, instead of pretending the name still describes the
   *    position. A name that stays put through move forty is a name a player stops believing.
   */
  const opening = document.createElement('p');
  opening.className = 'moves__opening';

  bar.append(first, back, forward, live, liveNote);
  el.append(opening, scroller, bar);

  function render(): void {
    scroller.replaceChildren();

    /*
     * An empty move list says so, rather than being an empty box.
     *
     * On a phone the blank panel is small enough to read as "not yet". On a laptop it is a large
     * white rectangle under the board with nothing in it, which reads as something that failed to
     * load — the first screen of the app, looking broken, to somebody who has not moved yet.
     */
    if (moves.length === 0) {
      /*
       * ⭐ **And it is where the app says what it is** — the front door, in the only place on this
       * screen that had room for one.
       *
       * The first screen was a chessboard, which is exactly what somebody opening a chess app already
       * expects and therefore says nothing. Everything that makes this different — the signatures, a
       * rating nobody can revoke — was invisible until a whole game had been played and resigned.
       *
       * A line above the board was the obvious answer and was wrong: this screen has no vertical
       * slack, and the first attempt pushed it to 855px against an 844px viewport and knocked the
       * board off centre. The journey caught both. This box, though, is already here and already
       * taller than its one line of text (`min-height: 76px` against ~30px of content), so the claim
       * goes in the space that was being wasted and **costs nothing at all**.
       *
       * It leaves on the first move, which is the right lifecycle: by then the person is playing, and
       * a sentence repeating itself over a live game is chrome.
       */
      if (options.claim) {
        const claim = document.createElement('li');
        claim.className = 'moves__claim';
        claim.textContent = options.claim;
        scroller.append(claim);
      }

      const empty = document.createElement('li');
      empty.className = 'moves__empty';
      empty.textContent = t('moves.empty');
      scroller.append(empty);
    }
    // Two plies per numbered row, the way every scoresheet in the world is written.
    for (let ply = 0; ply < moves.length; ply += 2) {
      const row = document.createElement('li');
      row.className = 'moves__row';

      const number = document.createElement('span');
      number.className = 'moves__number';
      number.textContent = `${ply / 2 + 1}.`;
      row.append(number);

      for (const offset of [0, 1]) {
        const index = ply + offset;
        const san = moves[index];
        if (san === undefined) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'moves__move';
        button.textContent = san;

        /*
         * What the analysis made of this move, if it has been analysed.
         *
         * Set after the text, never before: `textContent` replaces every child, so a mark appended
         * first would silently vanish — and the annotation is keyed on `index`, the move's own ply,
         * not on `ply`, which is only where the row starts.
         */
        const annotation = annotations?.[index];
        if (annotation?.mark) {
          button.classList.add(`moves__move--${annotation.kind}`);
          const mark = document.createElement('span');
          mark.className = 'moves__mark';
          // Hidden from a screen reader, which gets the word in the label instead of punctuation.
          mark.setAttribute('aria-hidden', 'true');
          mark.textContent = annotation.mark;
          button.append(mark);
          button.setAttribute('aria-label', `${san}, ${annotation.kind}`);
        }
        button.dataset['ply'] = String(index);
        const isCurrent = viewing === null ? index === moves.length - 1 : index === viewing;
        button.classList.toggle('moves__move--current', isCurrent);
        if (isCurrent) button.setAttribute('aria-current', 'true');
        button.addEventListener('click', () => {
          viewing = index === moves.length - 1 ? null : index;
          options.onScrub(viewing);
          render();
        });
        row.append(button);
      }
      scroller.append(row);
    }

    const atLive = viewing === null;
    liveNote.textContent = atLive ? '' : t('moves.viewingEarlier');
    liveNote.classList.toggle('moves__note--showing', !atLive);
    live.disabled = atLive;
    forward.disabled = atLive;
    back.disabled = moves.length === 0 || viewing === 0;
    first.disabled = moves.length === 0 || viewing === 0;

    /*
     * Named from the position on screen, not the game's latest.
     *
     * `viewing` is the ply *index* being looked at, so the moves that led to it are the first
     * `viewing + 1` of them. Passing the whole list while scrubbing would label an early position
     * with a name it has not earned yet, which is worse than showing nothing.
     */
    const upTo = viewing === null ? moves : moves.slice(0, viewing + 1);
    const named = openingFor(upTo);
    if (named) {
      opening.textContent = named.name;
      // A game that has left theory says so, rather than implying the name still describes it.
      opening.title = t(named.plies === 1 ? 'moves.namedAfterOne' : 'moves.namedAfter', {
        eco: named.eco,
        plies: named.plies,
      });
      opening.classList.toggle('moves__opening--left-book', upTo.length > named.plies);
    } else {
      opening.textContent = '';
      opening.removeAttribute('title');
      opening.classList.remove('moves__opening--left-book');
    }
    opening.hidden = !named;

    // Keep the move being viewed on screen without dragging the page around it.
    scroller.querySelector('.moves__move--current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  const handle: MoveListHandle = {
    el,
    setMoves(san) {
      moves = [...san];
      // A new move arriving while scrubbing does not yank the player back to it — that would make
      // reviewing a position impossible in a live game, which is exactly when people do it.
      render();
    },
    setViewing(ply) {
      viewing = ply;
      render();
    },
    step(delta) {
      if (moves.length === 0) return;
      const current = viewing ?? moves.length - 1;
      const next = Math.min(moves.length - 1, Math.max(0, current + delta));
      viewing = next === moves.length - 1 ? null : next;
      options.onScrub(viewing);
      render();
    },
    toStart() {
      if (moves.length === 0) return;
      viewing = 0;
      options.onScrub(0);
      render();
    },
    toLive() {
      viewing = null;
      options.onScrub(null);
      render();
    },
    setAnnotations(next) {
      annotations = next;
      render();
    },
  };

  render();
  return handle;
}
