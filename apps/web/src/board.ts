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
import { createShapeLayer } from './shapes.ts';
import { t, type Key } from './i18n.ts';

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
  /**
   * Where a piece could go *if it were this player's turn*, ignoring whose turn it is.
   *
   * This is what makes a premove possible, and it cannot be `legalMoves`: legality depends on the
   * side to move, and during the opponent's turn every one of this player's moves is illegal. So the
   * game answers a different question — "is this a move that piece makes" — and the board never has
   * to know the difference.
   *
   * Absent means premoves are off, and the board behaves exactly as it did before.
   */
  premoveTargets?: ((from: Square) => Square[]) | undefined;
  /** A premove was set, or cleared with `null`. The game stores it; the board only shows it. */
  onPremove?: ((move: BoardMove | null) => void) | undefined;
  /**
   * Promote straight to a queen without showing the chooser.
   *
   * A function rather than a boolean, because the answer can change while the board is alive — the
   * settings sheet sits over this very screen, and a value captured at construction would be stale
   * the moment somebody flipped the switch.
   */
  autoQueen?: (() => boolean) | undefined;
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
  /**
   * Let this colour set a premove while it is not their turn — or `null` to stop.
   *
   * Deliberately separate from `setPlaying`. A board where `playing` were simply left set during the
   * opponent's turn would let a piece be *moved*, not queued, and the difference between those two
   * is the entire feature.
   */
  setPremoving: (colour: Colour | null) => void;
  /** Show, or clear, the queued premove. */
  setPremove: (move: BoardMove | null) => void;
  /** Show or hide the legal-move dots. Beginners need them; strong players turn them off. */
  setShowDests: (show: boolean) => void;
  /** Show or hide the file letters and rank numbers. */
  setShowCoords: (show: boolean) => void;
  /** Remove every arrow and square mark. Returns whether there was anything to remove. */
  clearShapes: () => boolean;
  /**
   * Draw an arrow the player did not draw — the engine's suggestion, in the analysis.
   *
   * The same layer as a hand-drawn arrow, so it is cleared by the same rules: a click, a move, a new
   * position. An annotation that outlived the position it was about would be worse than none.
   */
  drawShape: (shape: { from: string; to: string }) => void;
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
/**
 * One piece, as an SVG.
 *
 * Exported so the captured-piece trays draw the *same* shapes the board does. A second, slightly
 * different set of glyphs beside the board would be one more thing to keep in step by hand, and the
 * first time it drifted nobody would notice which one was wrong.
 */
export function pieceElement(code: PieceCode): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', PIECE_VIEWBOX);
  svg.setAttribute('class', `piece piece--${code}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PIECES[code] ?? '';
  return svg;
}

/** Long names, so a screen reader says "white knight" rather than "wn". */
const PIECE_KEYS: Record<string, Key> = {
  p: 'piece.pawn',
  n: 'piece.knight',
  b: 'piece.bishop',
  r: 'piece.rook',
  q: 'piece.queen',
  k: 'piece.king',
};

/**
 * ⭐ Does the promotion picker have to open upward from this square?
 *
 * The picker is four squares tall and hangs from the promotion square, so the direction it opens in
 * decides whether all four choices are reachable or four squares of it hang off the edge of the
 * board. Downward is right only when the promotion square is the **top** row *as displayed* — and a
 * pawn promotes on whichever rank is far from its owner, while the board flips to face whoever is
 * playing. Promote as Black and rank 1 is the near row, so a picker that always opened downward was
 * drawn past the bottom edge, clipped by the viewport and by the wallet's own chrome below it.
 *
 * That made underpromotion unreachable for exactly one of the two colours, which is the same shape
 * of defect as lichess-org/lila#13545. There is no third case to worry about: a promotion square is
 * always the top or the bottom row on screen, never the middle.
 *
 * A named function rather than an expression inline, so the rule can be tested for all four
 * combinations without staging a real promotion in a real game.
 */
export function promotionOpensUpward(to: Square, orientation: Colour): boolean {
  const displayedAtTop = (to[1] === '8') === (orientation === 'w');
  return !displayedAtTop;
}

export function describeSquare(square: Square, piece: PieceCode | undefined): string {
  if (!piece) return t('board.square', { square, piece: t('board.empty') });
  const colour = t(piece[0] === 'w' ? 'colour.white' : 'colour.black').toLowerCase();
  const name = t(PIECE_KEYS[piece[1]!] ?? 'piece.piece');
  return t('board.square', { square, piece: `${colour} ${name}` });
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
  /** The colour allowed to queue a move right now, when it is not their turn. */
  let premoving: Colour | null = null;
  /** The queued move itself, shown on the board until it is played or abandoned. */
  let premove: BoardMove | null = null;

  const el = document.createElement('div');
  el.className = 'board';
  el.setAttribute('role', 'grid');
  el.setAttribute('aria-label', t('board.label'));

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
   * Arrows and square marks, drawn on one overlay above the squares.
   *
   * Right-click-drag draws an arrow; right-click a square marks it. Both references have this and
   * both use it constantly — until now right-click here did nothing but cancel a drag, so the
   * gesture every chess player makes without thinking met silence.
   */
  const shapes = createShapeLayer();
  el.append(shapes.el);

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
      // The queued move stays lit on both its squares, so it is obvious something is waiting to
      // happen. Its own colour, never the last-move colour: those two mean opposite things in time.
      cell.classList.toggle('sq--premove', premove?.from === square || premove?.to === square);
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
      const mover = playing ?? premoving;
      const liftable = piece !== undefined && mover !== null && piece[0] === mover;
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
    const mover = playing ?? premoving;
    if (!piece || mover === null || piece[0] !== mover) return;
    selected = square;
    /*
     * A different question is asked when it is not your turn.
     *
     * `legalMoves` would return nothing during the opponent's move — every one of this player's
     * moves is illegal while it is not their turn — so the dots would vanish and a premove would be
     * impossible to aim. `premoveTargets` asks "where does this piece go", which is the question a
     * player is actually answering when they queue one.
     */
    dests = playing !== null ? options.legalMoves(square) : (options.premoveTargets?.(square) ?? []);
    render();
  }

  /**
   * Take back a queued premove, and tell the game it is gone.
   *
   * ## Why this exists at all
   *
   * Both reference boards cancel a premove on **right-click**, and that is all they offer. On a
   * phone there is no right-click, so without this a queued premove could be *replaced* but never
   * withdrawn: a player who changed their mind was forced to premove something else, which then
   * fired. "I no longer want to move at all" was unsayable — and it is the thing you most want to
   * say when your opponent does something you did not expect.
   *
   * ## The gesture, and why this one
   *
   * Tapping any square that could not begin a premove — an empty square, an opponent's piece, or the
   * premove's own destination, which is highlighted and is normally one of those two things.
   *
   * That rule was chosen because it cannot collide with re-aiming. Re-aiming starts by tapping *your
   * own* piece, which is exactly the case this does not touch, so changing your mind about the
   * destination still costs two taps and changing your mind about moving at all costs one. Cancelling
   * on the origin square instead would have made those two intentions indistinguishable.
   */
  function cancelPremove(): boolean {
    if (premove === null) return false;
    handle.setPremove(null);
    options.onPremove?.(null);
    return true;
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

    const move: BoardMove = promotion ? { from, to, promotion } : { from, to };

    /*
     * Queued, not played, when it is not this player's turn.
     *
     * The board does not attempt it and does not care whether it will ever be legal — the game plays
     * it, or discards it, the moment the opponent moves. Keeping that decision out of here is what
     * stops the board from needing a copy of the rules.
     */
    if (playing === null && premoving !== null) {
      handle.setPremove(move);
      options.onPremove?.(move);
      clearSelection();
      return;
    }

    const accepted = await options.onMove(move);
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

    /*
     * Auto-queen: promote without asking, when the player has said to.
     *
     * A queen is the right answer in the overwhelming majority of games, and the picker costs a tap
     * every single time. Underpromotion still matters — a knight promotion with check decides real
     * games — so the chooser is a setting away rather than gone, which is how both reference boards
     * handle it. The board asks the *game* rather than reading a preference itself, so it keeps
     * knowing nothing about storage.
     */
    if (options.autoQueen?.()) return Promise.resolve('q');

    return new Promise((resolve) => {
      const cell = squares.get(to)!;
      const scrim = document.createElement('div');
      scrim.className = 'promo__scrim';
      const picker = document.createElement('div');
      /*
       * ⭐ Which way it opens, and why it has to be asked.
       *
       * The picker is four squares tall and hangs from the promotion square. Hanging downward is
       * right when that square is the *top* row on screen — but a pawn promotes on whichever rank is
       * far from its owner, and the board flips to face whoever is playing. Promote as Black, or on
       * a flipped board, and the promotion square is the **bottom** row: four squares of picker then
       * hung off the bottom edge of the board, clipped by the phone's viewport and by the wallet's
       * own chrome underneath it.
       *
       * That is the same class of defect as lichess-org/lila#13545 — a picker whose hit area depends
       * on where it happens to land — and it makes underpromotion unreachable exactly when the game
       * is being played from the other side. Anchoring to the near edge instead keeps all four
       * choices on the board in both orientations, and there is no third case: a promotion square is
       * always the top or the bottom row as displayed.
       */
      picker.className = promotionOpensUpward(to, orientation) ? 'promo promo--up' : 'promo';
      picker.setAttribute('role', 'dialog');
      picker.setAttribute('aria-label', t('board.promote'));

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
        button.setAttribute('aria-label', t(PIECE_KEYS[choice] ?? 'piece.piece'));
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

  /**
   * The drag in flight, and **which finger is doing it**.
   *
   * The pointer id is not bookkeeping, and the failure it prevents is not the obvious one. Measured
   * against the unguarded code: a second finger landing mid-drag does not play a wrong move — it
   * **overwrites the drag state**, so when the first finger lifts there is nothing to drop and the
   * move the player actually made silently does not happen. The board simply sits there. That is
   * worse than a wrong move, because a wrong move is visible.
   *
   * On a phone, which is where every game of this is played, a thumb resting on the board is not an
   * exotic input. Chessground guards this explicitly ("support one finger drag only").
   */
  let dragging:
    | { from: Square; piece: PieceCode; startX: number; startY: number; moved: boolean; pointerId: number }
    | null = null;

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
    /*
     * And the ghost lets go of the piece, rather than merely hiding it.
     *
     * `hidden` stopped it being drawn but left the piece element in the DOM, so from the first drag
     * onwards the board reported thirty-three pieces. Nothing looked wrong, and nothing was, until a
     * check counted pieces to decide whether a rematch had really reset the board — it had, and the
     * thirty-third piece was this one, still held by a ghost nobody could see.
     */
    ghost.replaceChildren();
    for (const cell of squares.values()) cell.classList.remove('sq--over');
  }

  el.addEventListener('pointerdown', (event) => {
    // Right-click never moves anything: it draws, or cancels a drag. See the handlers below.
    if (event.button !== 0) return;
    /*
     * One finger at a time.
     *
     * A second pointer arriving mid-drag is ignored outright rather than allowed to take over: it
     * would otherwise clear the annotations, resolve the first finger's selection, and play a move
     * the player never made. Both references honour single-touch drags only, and this is why.
     */
    if (dragging && event.pointerId !== dragging.pointerId) return;
    /*
     * A plain click clears the annotations.
     *
     * What makes arrows worth drawing is that they cost nothing to get rid of — both references
     * clear them on the next interaction, and a board that kept them would make every annotation a
     * small piece of tidying-up owed later.
     */
    shapes.clear();
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

    /*
     * Whose piece this is, and where it could go — asked of the *right* question.
     *
     * `playing` alone is wrong while a premove is possible: during the opponent's turn `playing` is
     * null by design, so this path refused to pick anything up and premoves were unreachable through
     * the only gesture anybody uses. `select()` had already been taught the difference; this had not,
     * and the mismatch made the feature look absent while every other layer of it worked.
     */
    const mover = playing ?? premoving;
    const piece = position.get(square);
    if (!piece || mover === null || piece[0] !== mover) {
      // Nothing here to lift. If a premove is waiting, this tap is how you take it back.
      cancelPremove();
      return;
    }
    const targets = playing !== null ? options.legalMoves(square) : (options.premoveTargets?.(square) ?? []);
    if (targets.length === 0) return;

    select(square);
    dragging = {
      from: square,
      piece,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    el.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    // Only the finger that started this drag moves it.
    if (event.pointerId !== dragging.pointerId) return;

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
    /*
     * And only that finger ends it.
     *
     * Lifting a second finger must not drop the piece the first one is still holding — which is
     * exactly what happens without this, and it lands the piece wherever the *other* finger happened
     * to be.
     */
    if (event.pointerId !== dragging.pointerId) return;
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

  /**
   * ⭐ An interrupted drag is not a move, and must never become one.
   *
   * `pointercancel` was wired to `endDrag` alongside `pointerup`, which reads the event's coordinates
   * and plays whatever square the finger was over. But the browser fires `pointercancel` precisely
   * when the *system* has taken the gesture away — a scroll it decided to own, an edge swipe, the
   * app going to the background, a call arriving. In every one of those the player did not let go of
   * anything, and on a phone inside a wallet's WebView they are ordinary events rather than
   * curiosities.
   *
   * The result was a move played at wherever the finger happened to be when the OS interrupted, in a
   * game that is signed and rated. So a cancel aborts: the piece goes back, nothing is attempted.
   *
   * The selection deliberately survives, which is the same thing a press that never became a drag
   * does. The player comes back to the piece they had picked up rather than to a board that has
   * forgotten what they were doing.
   */
  el.addEventListener('pointercancel', (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    stopDragging();
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  });

  /*
   * Right-click: cancel a drag if one is in flight, otherwise draw.
   *
   * The order matters and matches both references. Mid-drag, right-click means "I changed my mind"
   * — a different event from dropping off the board, which means "I missed". With nothing in hand it
   * is the annotation gesture: press on a square, release on another to draw an arrow, release on
   * the same square to mark it.
   */
  let drawingFrom: Square | null = null;

  el.addEventListener('contextmenu', (event) => {
    // The browser menu is never wanted over a board, whichever of the two gestures this is.
    event.preventDefault();
    if (dragging || selected !== null) {
      stopDragging();
      clearSelection();
    }
  });

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.sq');
    drawingFrom = (cell?.dataset['square'] as Square | undefined) ?? null;
  });

  el.addEventListener('pointerup', (event) => {
    if (event.button !== 2 || drawingFrom === null) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.sq');
    const to = (cell?.dataset['square'] as Square | undefined) ?? null;
    if (to) shapes.toggle({ from: drawingFrom, to });
    drawingFrom = null;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    /*
     * Escape means "undo whatever I have started", in the order a person means it.
     *
     * A piece in hand or a selection is the nearer intention, so that goes first and a queued
     * premove survives it. Press it again with empty hands and the premove goes too — the keyboard
     * equivalent of the tap-an-empty-square gesture, since right-click here is the drawing tool
     * rather than, as in both reference boards, the premove cancel.
     */
    if (dragging || selected !== null) {
      stopDragging();
      clearSelection();
      return;
    }
    cancelPremove();
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
      return;
    }

    /*
     * ⭐ **Arrow keys move around the board**, which is what makes it a grid rather than a list.
     *
     * Every square that can be lifted or landed on carries `tabindex="0"`, so before this the only
     * way to cross the board was Tab — measured: from `a2`, reaching `a3` meant tabbing past the
     * whole of rank two, six presses to make one move. Technically playable, which is why the claim
     * "playable end to end from a keyboard" was true and the experience was not.
     *
     * Arrows within, Tab out, is the ARIA grid pattern and the one every keyboard user already
     * knows. `Home`/`End` jump to the edge of the rank for the same reason.
     *
     * Movement follows what is **on screen**, not what is on the board: with Black at the bottom,
     * pressing Up must move up. A user navigating by sight and a user navigating by announcement
     * both mean the same thing by "up", and it is not the same file direction.
     */
    const steps: Record<string, [file: number, rank: number]> = {
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const step = steps[event.key];
    if (step || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const files = 'abcdefgh';
      let file = files.indexOf(square[0]!);
      let rank = Number(square[1]) - 1;

      if (event.key === 'Home') file = orientation === 'w' ? 0 : 7;
      else if (event.key === 'End') file = orientation === 'w' ? 7 : 0;
      else {
        // Flipped for Black, so an arrow always moves the way the board looks.
        const facing = orientation === 'w' ? 1 : -1;
        file += step![0] * facing;
        rank += step![1] * facing;
      }

      if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
      const next = `${files[file]}${rank + 1}`;
      const target = el.querySelector<HTMLElement>(`.sq[data-square="${next}"]`);
      if (!target) return;

      /*
       * Focus needs a tabindex, and most squares do not have one.
       *
       * The board gives `tabindex="0"` only to squares that can be acted on. Arrow navigation has to
       * reach every square — you cross empty ones to get anywhere — so the destination is made
       * focusable for as long as it is focused, and the roving tabindex does the rest.
       */
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus();
    }
  });

  const handle: BoardHandle = {
    el,
    announce(message: string) {
      /*
       * ⭐ **A live region only speaks when its text *changes*.**
       *
       * Setting the same string twice is silence, and a chess board hits that case constantly:
       * "White to play" after every puzzle, "Move taken back" after every takeback, "Your move" after
       * every one of the opponent's moves. A screen-reader user heard each of those exactly once and
       * then nothing — which reads as the app having stopped rather than as a repeated state.
       *
       * Clearing it first and restoring on the next tick makes the region change twice, so the
       * message is spoken again. A timeout rather than a frame because a backgrounded tab does not
       * paint, and somebody listening rather than looking is *exactly* the person whose tab is not in
       * front of them.
       */
      if (announcer.textContent === message) {
        announcer.textContent = '';
        window.setTimeout(() => {
          announcer.textContent = message;
        }, 50);
        return;
      }
      announcer.textContent = message;
    },
    setPosition(fen: string) {
      // A new position means the annotations were about the old one.
      shapes.clear();
      position = positionFromFen(fen);
      // A position change ends any selection: the piece that was picked up may not exist any more.
      selected = null;
      dests = [];
      render();
    },
    setOrientation(next: Colour) {
      orientation = next;
      // The shapes flip with the board rather than staying where they were drawn on screen.
      shapes.render(orientation);
      render();
    },
    flip() {
      orientation = orientation === 'w' ? 'b' : 'w';
      shapes.render(orientation);
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
    setPremoving(colour) {
      premoving = colour;
      if (colour === null) clearSelection();
      else render();
    },
    setPremove(move) {
      premove = move;
      render();
    },
    setShowDests(show) {
      showDests = show;
      render();
    },
    setShowCoords(show) {
      showCoords = show;
      render();
    },
    drawShape(shape) {
      shapes.toggle(shape);
    },
    clearShapes() {
      return shapes.clear();
    },
    get orientation() {
      return orientation;
    },
  };

  render();
  return handle;
}
