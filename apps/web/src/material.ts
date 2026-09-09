/**
 * What each side has captured, and who is up.
 *
 * Absent until now, and it is the single most-missed thing on a board that has everything else:
 * Lichess and Chess.com both show it, players read it every few moves without noticing they are
 * doing it, and a board without it feels like a diagram rather than a game.
 *
 * Two decisions, and both are about being honest with a number:
 *
 *  1. **Captures are derived from the position, not counted from the move list.** A move list can be
 *     scrubbed, replayed, or arrive from a server mid-game; the position is always exactly what is
 *     on the board. Subtracting what is present from what a full army holds is correct at every ply
 *     including the one being reviewed, and it needs no state of its own.
 *  2. **Promotions are handled by not pretending.** A player with two queens has one more queen than
 *     any army starts with, so a naive subtraction reports "captured −1 queen". The count is clamped
 *     at zero and the *advantage* is computed from what is actually on the board, which stays right
 *     however many pawns became queens.
 */

import { pieceElement, type PieceCode, type Square } from './board.ts';

/** The standard values. Kings are not counted: neither side can capture one. */
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** What one side starts with. */
const ARMY: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** Heaviest first, which is the order both reference boards use and the order a player reads. */
const ORDER = ['q', 'r', 'b', 'n', 'p'] as const;

export interface Material {
  /** What white has captured — i.e. black pieces missing from the board. */
  whiteTook: string[];
  /** What black has captured. */
  blackTook: string[];
  /**
   * White's advantage in points. Negative means black is ahead, zero means level.
   *
   * Computed from the pieces *present*, so it stays correct across promotions — a side with two
   * queens is nine points better off than the count of "captured" pieces would suggest.
   */
  advantage: number;
}

/**
 * Work out the material from a position.
 *
 * Takes the board's own square-to-piece map, so it can be called for the live position or for a
 * position being reviewed with no difference in the code.
 */
export function materialOf(position: ReadonlyMap<Square, PieceCode>): Material {
  const present: Record<'w' | 'b', Record<string, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };

  for (const piece of position.values()) {
    const colour = piece[0] as 'w' | 'b';
    const kind = piece[1]!;
    if (kind in present[colour]) present[colour][kind] = (present[colour][kind] ?? 0) + 1;
  }

  const missing = (colour: 'w' | 'b'): string[] => {
    const out: string[] = [];
    for (const kind of ORDER) {
      // Clamped: a promoted extra queen must not read as a negative capture.
      const gone = Math.max(0, (ARMY[kind] ?? 0) - (present[colour][kind] ?? 0));
      for (let i = 0; i < gone; i++) out.push(kind);
    }
    return out;
  };

  const points = (colour: 'w' | 'b'): number =>
    ORDER.reduce((total, kind) => total + (present[colour][kind] ?? 0) * (VALUE[kind] ?? 0), 0);

  return {
    // White captured the black pieces that are missing, and the other way round.
    whiteTook: missing('b'),
    blackTook: missing('w'),
    advantage: points('w') - points('b'),
  };
}

/**
 * A tray of captured pieces, plus the advantage when there is one.
 *
 * **Whose captures it shows is decided per update, not at construction**, because the board flips:
 * a player sitting as black sees their own captures at the bottom and white's at the top. In a live
 * game the seat is not even known until the join returns, so a tray fixed to a colour would have
 * shown the wrong side's captures for anybody playing black.
 *
 * The contents are rebuilt rather than diffed — it is at most fifteen small glyphs, and a diff would
 * be more code than the thing it optimises.
 */
export function createMaterialTray(): {
  el: HTMLElement;
  update: (material: Material, side: 'w' | 'b') => void;
} {
  const el = document.createElement('div');
  el.className = 'material';
  // A tray with nothing in it is not worth announcing move by move; the advantage is in the label.
  el.setAttribute('aria-live', 'off');

  const pieces = document.createElement('span');
  pieces.className = 'material__pieces';

  const lead = document.createElement('span');
  lead.className = 'material__lead';

  el.append(pieces, lead);

  return {
    el,
    update(material, side) {
      el.classList.toggle('material--white', side === 'w');
      el.classList.toggle('material--black', side === 'b');
      const took = side === 'w' ? material.whiteTook : material.blackTook;
      pieces.replaceChildren();
      for (const kind of took) {
        /*
         * The same vendored shapes the board draws, at tray size.
         *
         * `pieceElement` is what puts a piece on a square, so a captured knight in the tray is the
         * same knight that was on the board — rather than a second, slightly different piece set
         * that would have to be kept in step with the first one by hand.
         */
        const captured = `${side === 'w' ? 'b' : 'w'}${kind}` as PieceCode;
        const glyph = pieceElement(captured);
        glyph.classList.add('material__piece');
        glyph.setAttribute('aria-hidden', 'true');
        pieces.append(glyph);
      }

      /*
       * Only the side that is ahead shows a number.
       *
       * Showing "+3" and "−3" on both trays is twice the ink for one fact, and the minus reads as a
       * scold. Level shows nothing at all, which is the common case.
       */
      const advantage = side === 'w' ? material.advantage : -material.advantage;
      lead.textContent = advantage > 0 ? `+${advantage}` : '';

      // A tray with nothing in it takes no room, so an even game looks like an even game.
      el.hidden = took.length === 0 && advantage <= 0;
      // Said in words for a screen reader, where a row of glyphs says nothing.
      el.setAttribute(
        'aria-label',
        took.length === 0
          ? ''
          : `${side === 'w' ? 'White' : 'Black'} has captured ${describe(took)}${
              advantage > 0 ? `, ${advantage} ${advantage === 1 ? 'point' : 'points'} ahead` : ''
            }`,
      );
    },
  };
}

const NAMES: Record<string, [string, string]> = {
  q: ['queen', 'queens'],
  r: ['rook', 'rooks'],
  b: ['bishop', 'bishops'],
  n: ['knight', 'knights'],
  p: ['pawn', 'pawns'],
};

/** `['q','p','p']` → `a queen and two pawns`. For a screen reader, which cannot see the tray. */
export function describe(took: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const kind of took) counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const words = [...counts].map(([kind, count]) => {
    const [one, many] = NAMES[kind] ?? ['piece', 'pieces'];
    if (count === 1) return `a ${one}`;
    const spelled = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][count] ?? String(count);
    return `${spelled} ${many}`;
  });

  if (words.length <= 1) return words[0] ?? 'nothing';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
