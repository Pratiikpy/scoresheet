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

export interface MoveListOptions {
  /** Called with the ply to show, or `null` for the live position. */
  onScrub: (ply: number | null) => void;
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
}

export function createMoveList(options: MoveListOptions): MoveListHandle {
  let moves: readonly string[] = [];
  let viewing: number | null = null;

  const el = document.createElement('div');
  el.className = 'moves';

  const scroller = document.createElement('ol');
  scroller.className = 'moves__list';
  scroller.setAttribute('aria-label', 'Moves');

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

  const first = control('Go to the start', '⏮', () => handle.toStart());
  const back = control('Previous move', '◀', () => handle.step(-1));
  const forward = control('Next move', '▶', () => handle.step(1));
  const live = control('Back to the live position', '⏭', () => handle.toLive());

  const liveNote = document.createElement('span');
  liveNote.className = 'moves__note';

  bar.append(first, back, forward, live, liveNote);
  el.append(scroller, bar);

  function render(): void {
    scroller.replaceChildren();
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
    liveNote.textContent = atLive ? '' : 'Viewing an earlier position';
    liveNote.classList.toggle('moves__note--showing', !atLive);
    live.disabled = atLive;
    forward.disabled = atLive;
    back.disabled = moves.length === 0 || viewing === 0;
    first.disabled = moves.length === 0 || viewing === 0;

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
  };

  render();
  return handle;
}
