/**
 * The board.
 *
 * In a chess app the board *is* the interface, so this file carries more care than anything else in
 * the app. Every behaviour below exists because a chess player would notice its absence without
 * necessarily being able to name it — that is the standard, and the reference is Lichess.
 *
 * It is deliberately framework-free and knows nothing about chess. It renders a position, reports
 * that somebody tried to move a piece from one square to another, and draws whatever it is told to.
 * Legality, turns, clocks and results all live outside it. That separation is what lets the same
 * board serve a live game, a puzzle, a replay and a read-only spectator view without a flag for each.
 *
 * The interaction rules, in the order a player meets them:
 *
 *  - **Both input modes, always.** Drag *and* tap-tap. Phones are tap-tap and forcing a drag is the
 *    fastest way to feel wrong on the device most people will use.
 *  - **Legal destinations appear the moment a piece is picked up** — a dot on an empty square, a ring
 *    around the piece on a capture. Beginners cannot play without them; strong players turn them off.
 *  - **The square under the finger is outlined, not the finger position.** The finger covers the
 *    piece, so the feedback has to be somewhere the finger is not.
 *  - **An illegal move snaps back** with a short shake. No dialog, no error sound, nothing modal.
 *  - **Promotion picks in place**, on the promotion file, under the finger — never a centred modal.
 *  - **The board never moves on the page.** It is a fixed square and everything else is laid out
 *    around it, so nothing reflows when a move list grows underneath.
 */

import { PIECES, PIECE_VIEWBOX } from './pieces.ts';

export type Square = string;
export type Colour = 'w' | 'b';
export type PieceCode = `${Colour}${'p' | 'n' | 'b' | 'r' | 'q' | 'k'}`;

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

/** Every square, in the order they are laid out from White's point of view. */
export const SQUARES: Square[] = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`));

/**
 * Light or dark, computed rather than eyeballed.
 *
 * Two separate tests were written wrong by eye before this existed — b1/b5 and c1/b5 both called
 * same-coloured pairs when they are opposite. `(file + rank) % 2 === 0` is dark, counting files from
 * one, and a1 is dark.
 */
export function squareColour(square: Square): 'light' | 'dark' {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]) + 1;
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0 ? 'dark' : 'light';
}

export interface BoardMove {
  from: Square;
  to: Square;
  /** Set only when the board has already asked which piece to promote to. */
  promotion?: 'q' | 'r' | 'b' | 'n' | undefined;
}

export interface BoardOptions {
  /**
   * Which squares a piece may legally move to, asked fresh each time a piece is picked up.
   *
   * The board never decides legality — it asks. Returning an empty list makes the piece unliftable,
   * which is how a spectator view and a finished game are expressed without a separate mode.
   */
  legalMoves: (from: Square) => Square[];
  /** Report an attempted move. Return false to reject it, and the piece snaps back. */
  onMove: (move: BoardMove) => boolean | Promise<boolean>;
  /** Which colour this player controls. `null` is a spectator: nothing is liftable. */
  playing?: Colour | null;
  orientation?: Colour;
}

export interface BoardHandle {
  readonly el: HTMLElement;
  /** Draw a position from a FEN's placement field. The board holds no game state of its own. */
  setPosition: (fen: string) => void;
  setOrientation: (orientation: Colour) => void;
  flip: () => void;
  /** Highlight the two squares of the move just played. */
  setLastMove: (from: Square | null, to: Square | null) => void;
  /** Mark a king's square as in check. */
  setCheck: (square: Square | null) => void;
  setPlaying: (colour: Colour | null) => void;
  /** Show or hide the legal-move dots. Beginners need them; strong players turn them off. */
  setShowDests: (show: boolean) => void;
  /** Show or hide the file letters and rank numbers. */
  setShowCoords: (show: boolean) => void;
  /** Say something to a screen reader — a move played, a check, a result. */
  announce: (message: string) => void;
  readonly orientation: Colour;
}

/** Parse a FEN's placement field into a square-to-piece map. */
export function positionFromFen(fen: string): Map<Square, PieceCode> {
  const placement = fen.split(' ')[0] ?? '';
  const position = new Map<Square, PieceCode>();
  const rows = placement.split('/');
  for (let rank = 0; rank < 8 && rank < rows.length; rank++) {
    let file = 0;
    for (const character of rows[rank]!) {
      if (/\d/.test(character)) {
        file += Number(character);
        continue;
      }
      const square = `${FILES[file]}${RANKS[rank]}`;
      const colour: Colour = character === character.toUpperCase() ? 'w' : 'b';
      position.set(square, `${colour}${character.toLowerCase()}` as PieceCode);
      file += 1;
    }
  }
  return position;
}

/** A file letter or a rank number, riding inside its edge square. */
function coord(kind: 'file' | 'rank', text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `coord coord--${kind}`;
  span.textContent = text;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** One piece, as inline SVG. No network, no sprite sheet, and it inherits the theme's colours. */
function pieceElement(code: PieceCode): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', PIECE_VIEWBOX);
  svg.setAttribute('class', `piece piece--${code}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PIECES[code] ?? '';
  return svg;
}

/** Long names, so a screen reader says "white knight" rather than "wn". */
const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function describeSquare(square: Square, piece: PieceCode | undefined): string {
  if (!piece) return `${square}, empty`;
  const colour = piece[0] === 'w' ? 'white' : 'black';
  return `${square}, ${colour} ${PIECE_NAMES[piece[1]!] ?? 'piece'}`;
}

export function createBoard(options: BoardOptions): BoardHandle {
  let orientation: Colour = options.orientation ?? 'w';
  let playing: Colour | null = options.playing ?? 'w';
  let position = new Map<Square, PieceCode>();
  let selected: Square | null = null;
  let dests: Square[] = [];
  let showDests = true;
  let showCoords = true;
  let lastMove: { from: Square; to: Square } | null = null;
  let checkSquare: Square | null = null;

  const el = document.createElement('div');
  el.className = 'board';
  el.setAttribute('role', 'grid');
  el.setAttribute('aria-label', 'Chess board');

  const squares = new Map<Square, HTMLElement>();
  for (const square of SQUARES) {
    const cell = document.createElement('div');
    cell.className = `sq sq--${squareColour(square)}`;
    cell.dataset['square'] = square;
    cell.setAttribute('role', 'gridcell');
    squares.set(square, cell);
    el.append(cell);
  }

  /*
   * The drag ghost.
   *
   * One element, reused, moved with a transform rather than by re-laying-out the board. It follows
   * the pointer, and the *destination square* is outlined separately — the finger is on top of the
   * piece, so feedback under the finger is feedback nobody can see.
   */
  const ghost = document.createElement('div');
  ghost.className = 'board__ghost';
  ghost.hidden = true;
  el.append(ghost);

  /*
   * What just happened, for a screen reader.
   *
   * Neither chessground nor react-chessboard documents any accessibility at all — no ARIA, no
   * announcements, no keyboard move entry. So this is not copied from anywhere; it is the one place
   * the board is deliberately built past both references rather than level with them.
   */
  const announcer = document.createElement('div');
  announcer.className = 'board__announcer';
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  el.append(announcer);

  function render(): void {
    // Orientation is applied by reordering, not by rotating: a rotated board rotates the pieces too.
    const order = orientation === 'w' ? SQUARES : [...SQUARES].reverse();
    for (const [index, square] of order.entries()) {
      const cell = squares.get(square)!;
      cell.style.order = String(index);

      const piece = position.get(square);
      const existing = cell.querySelector('.piece');
      const wanted = piece ? `piece piece--${piece}` : null;
      if (!piece && existing) existing.remove();
      else if (piece && existing?.getAttribute('class') !== wanted) {
        existing?.remove();
        cell.append(pieceElement(piece));
      }

      cell.classList.toggle('sq--selected', selected === square);
      cell.classList.toggle('sq--last', lastMove?.from === square || lastMove?.to === square);
      cell.classList.toggle('sq--check', checkSquare === square);
      const isDest = showDests && dests.includes(square);
      cell.classList.toggle('sq--dest', isDest && !position.has(square));
      cell.classList.toggle('sq--capture', isDest && position.has(square));

      cell.setAttribute('aria-label', describeSquare(square, piece));
      // Coordinates ride inside the edge squares rather than in a gutter, so the board stays a
      // clean square and nothing shifts when they are turned off. Which squares are edge squares
      // depends on orientation, so it is recomputed rather than hardcoded to a-file and rank 1.
      const file = square[0]!;
      const rank = square[1]!;
      const bottomRank = orientation === 'w' ? '1' : '8';
      const leftFile = orientation === 'w' ? 'a' : 'h';
      cell.dataset['file'] = rank === bottomRank ? file : '';
      cell.dataset['rank'] = file === leftFile ? rank : '';
      // Rendered as elements rather than `::after` content, because a square already spends both
      // pseudo-elements on its state overlay and its destination dot.
      cell.querySelectorAll('.coord').forEach((node) => node.remove());
      if (showCoords) {
        if (rank === bottomRank) cell.append(coord('file', file));
        if (file === leftFile) cell.append(coord('rank', rank));
      }
      // Only a piece this player can actually lift is focusable, so tabbing walks the real options.
      const liftable = piece !== undefined && playing !== null && piece[0] === playing;
      cell.tabIndex = liftable || isDest ? 0 : -1;
    }
  }

  function clearSelection(): void {
    selected = null;
    dests = [];
    render();
  }

  function select(square: Square): void {
    const piece = position.get(square);
    if (!piece || playing === null || piece[0] !== playing) return;
    selected = square;
    dests = options.legalMoves(square);
    render();
  }

  /** Refuse a move visually: a short shake on the square, no dialog and no error sound. */
  function refuse(square: Square): void {
    const cell = squares.get(square);
    if (!cell) return;
    cell.classList.remove('sq--refused');
    // Reading offsetWidth restarts the animation; without it a second refusal does nothing visible.
    void cell.offsetWidth;
    cell.classList.add('sq--refused');
  }

  async function attempt(from: Square, to: Square): Promise<void> {
    if (from === to) {
      clearSelection();
      return;
    }
    if (!dests.includes(to)) {
      // Tapping another of your own pieces re-selects rather than failing — every board does this,
      // and without it changing your mind costs two taps.
      if (position.get(to)?.[0] === playing) {
        select(to);
        return;
      }
      refuse(from);
      clearSelection();
      return;
    }

    const promotion = await promotionFor(from, to);
    if (promotion === 'cancelled') {
      clearSelection();
      return;
    }

    const accepted = await options.onMove(promotion ? { from, to, promotion } : { from, to });
    if (!accepted) refuse(from);
    clearSelection();
  }

  /**
   * Ask which piece to promote to — in place, on the promotion square, never a centred modal.
   *
   * Q, R, N, B: the order both reference boards use, because a knight underpromotion is common and
   * a bishop one is almost never played. A scrim sits behind it so the rest of the board is visibly
   * inert while the choice is pending, and outside-click, right-click and Escape all cancel.
   *
   * Returns undefined when the move is not a promotion, so the common case costs nothing.
   */
  function promotionFor(from: Square, to: Square): Promise<'q' | 'r' | 'b' | 'n' | 'cancelled' | undefined> {
    const piece = position.get(from);
    const lastRank = piece?.[0] === 'w' ? '8' : '1';
    if (piece?.[1] !== 'p' || to[1] !== lastRank) return Promise.resolve(undefined);

    return new Promise((resolve) => {
      const cell = squares.get(to)!;
      const scrim = document.createElement('div');
      scrim.className = 'promo__scrim';
      const picker = document.createElement('div');
      picker.className = 'promo';
      picker.setAttribute('role', 'dialog');
      picker.setAttribute('aria-label', 'Choose a piece to promote to');

      const close = (): void => {
        scrim.remove();
        picker.remove();
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
      };
      const onOutside = (event: Event): void => {
        if (picker.contains(event.target as Node)) return;
        event.preventDefault();
        close();
        resolve('cancelled');
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close();
        resolve('cancelled');
      };

      for (const choice of ['q', 'r', 'n', 'b'] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'promo__choice';
        button.setAttribute('aria-label', PIECE_NAMES[choice] ?? choice);
        button.append(pieceElement(`${piece[0] as Colour}${choice}` as PieceCode));
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          close();
          resolve(choice);
        });
        picker.append(button);
      }

      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      el.append(scrim);
      cell.append(picker);
      picker.querySelector('button')?.focus();
    });
  }

  /* ------------------------------------------------------------------ pointer */

  /**
   * How far the pointer must travel before a press becomes a drag.
   *
   * Chessground uses 3px, react-chessboard 1px. Without a threshold every tap flashes a drag ghost
   * for one frame, and on a touch screen a perfectly still finger still moves a pixel or two.
   */
  const DRAG_THRESHOLD_PX = 3;

  let dragging: { from: Square; piece: PieceCode; startX: number; startY: number; moved: boolean } | null = null;

  function squareAt(x: number, y: number): Square | null {
    const target = document.elementFromPoint(x, y);
    const cell = target?.closest<HTMLElement>('.sq');
    return cell?.dataset['square'] ?? null;
  }

  function stopDragging(): void {
    if (!dragging) return;
    squares.get(dragging.from)?.classList.remove('sq--dragging');
    dragging = null;
    ghost.hidden = true;
    for (const cell of squares.values()) cell.classList.remove('sq--over');
  }

  el.addEventListener('pointerdown', (event) => {
    // Right-click never moves anything. It is reserved for cancelling, the way both references use it.
    if (event.button !== 0) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.sq');
    const square = cell?.dataset['square'];
    if (!square) return;

    // A tap while something is selected resolves that selection: this is the tap-tap path, and it
    // has to come before the pick-up path or you could never capture your opponent piece.
    if (selected !== null && selected !== square) {
      void attempt(selected, square);
      return;
    }
    if (selected === square) {
      clearSelection();
      return;
    }

    const piece = position.get(square);
    if (!piece || playing === null || piece[0] !== playing) return;
    if (options.legalMoves(square).length === 0) return;

    select(square);
    dragging = { from: square, piece, startX: event.clientX, startY: event.clientY, moved: false };
    el.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    if (!dragging.moved) {
      const travelled = Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      dragging.moved = true;
      ghost.replaceChildren(pieceElement(dragging.piece));
      ghost.hidden = false;
      // The origin keeps a half-opacity ghost of the piece, so it is clear where it came from.
      squares.get(dragging.from)?.classList.add('sq--dragging');
    }

    const rect = el.getBoundingClientRect();
    const size = rect.width / 8;
    ghost.style.width = `${size}px`;
    ghost.style.height = `${size}px`;
    ghost.style.transform = `translate(${event.clientX - rect.left - size / 2}px, ${event.clientY - rect.top - size / 2}px)`;

    // The square under the pointer is outlined, not the pointer position — the finger covers the
    // piece, so feedback under it is feedback nobody can see.
    const over = squareAt(event.clientX, event.clientY);
    for (const [square, cell] of squares) cell.classList.toggle('sq--over', square === over);
  });

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;
    const { from, moved } = dragging;
    stopDragging();
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);

    // A press that never became a drag leaves the piece selected, so tap-tap works.
    if (!moved) return;

    const to = squareAt(event.clientX, event.clientY);
    // Dropped outside the board, or on nothing. Distinct from a rejected move: the piece simply
    // goes home and stays selected, so the player can tap a destination instead of starting over.
    if (!to) return;
    void attempt(from, to);
  }

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  /*
   * Escape and right-click cancel a drag outright, which both references treat as a different
   * event from dropping off the board — one is "I changed my mind", the other is "I missed".
   */
  el.addEventListener('contextmenu', (event) => {
    if (!dragging && selected === null) return;
    event.preventDefault();
    stopDragging();
    clearSelection();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || (!dragging && selected === null)) return;
    stopDragging();
    clearSelection();
  });

  /* ------------------------------------------------------------------ keyboard */

  /*
   * The board is playable from a keyboard, which is most of what makes it usable with a screen
   * reader. Lichess is genuinely known for this and nothing else in the catalog will have it.
   */
  el.addEventListener('keydown', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.sq');
    const square = cell?.dataset['square'];
    if (!square) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (selected === null) select(square);
      else void attempt(selected, square);
      return;
    }
    if (event.key === 'Escape' && selected !== null) {
      event.preventDefault();
      clearSelection();
    }
  });

  const handle: BoardHandle = {
    el,
    announce(message: string) {
      announcer.textContent = message;
    },
    setPosition(fen: string) {
      position = positionFromFen(fen);
      // A position change ends any selection: the piece that was picked up may not exist any more.
      selected = null;
      dests = [];
      render();
    },
    setOrientation(next: Colour) {
      orientation = next;
      render();
    },
    flip() {
      orientation = orientation === 'w' ? 'b' : 'w';
      render();
    },
    setLastMove(from, to) {
      lastMove = from && to ? { from, to } : null;
      render();
    },
    setCheck(square) {
      checkSquare = square;
      render();
    },
    setPlaying(colour) {
      playing = colour;
      if (colour === null) clearSelection();
      else render();
    },
    setShowDests(show) {
      showDests = show;
      render();
    },
    setShowCoords(show) {
      showCoords = show;
      render();
    },
    get orientation() {
      return orientation;
    },
  };

  render();
  return handle;
}
