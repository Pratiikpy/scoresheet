/**
 * Arrows and square highlights — what a player draws while they are thinking.
 *
 * Right-click-drag draws an arrow; right-click a square marks it. Both Lichess and Chess.com have
 * this, both use it constantly, and it is the one thing a chess player reaches for without being
 * told. Until now right-click here did nothing except cancel a drag — so the instinctive gesture met
 * silence, which reads as broken input rather than as an absent feature.
 *
 * Three decisions:
 *
 *  1. **It is drawn as one SVG overlay above the squares, not as elements inside them.** An arrow
 *     runs *between* squares, so it cannot live in one; and an overlay can be cleared in a single
 *     operation, which is what every "clear on your next move" rule needs.
 *  2. **Shapes are cleared by playing a move, and by a plain left-click on the board.** That is what
 *     both references do, and it is the behaviour that makes them disposable enough to be worth
 *     drawing — nobody annotates a position they then have to tidy up.
 *  3. **Drawing the same shape twice removes it.** A toggle, so a mis-drawn arrow is undone by
 *     repeating it rather than by hunting for a clear button.
 *
 * Nothing here knows any chess. It is given two square names and draws between them.
 */

const SVG = 'http://www.w3.org/2000/svg';

/** One arrow or one highlighted square. `to === from` means a square mark rather than an arrow. */
export interface Shape {
  from: string;
  to: string;
}

/** Squares are named `a1`–`h8`; the board's orientation decides where that lands on screen. */
function coordinates(square: string, orientation: 'w' | 'b'): { x: number; y: number } | null {
  const file = 'abcdefgh'.indexOf(square[0] ?? '');
  const rank = Number(square[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) return null;

  // Centres, in an eight-by-eight space, flipped with the board rather than rotated.
  const column = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  return { x: column + 0.5, y: row + 0.5 };
}

export interface ShapeLayer {
  readonly el: SVGSVGElement;
  /** Add a shape, or remove it if the identical one is already there. */
  toggle: (shape: Shape) => void;
  clear: () => boolean;
  /** Redraw — after the board flips, or after a resize. */
  render: (orientation: 'w' | 'b') => void;
  readonly count: number;
}

export function createShapeLayer(): ShapeLayer {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('class', 'board__shapes');
  el.setAttribute('viewBox', '0 0 8 8');
  // Decoration for a screen reader: the position is already announced square by square, and a
  // sighted player's own annotations are not information about the game.
  el.setAttribute('aria-hidden', 'true');

  /*
   * One arrowhead, defined once and referenced by every arrow.
   *
   * `markerUnits="userSpaceOnUse"` keeps the head a fixed size instead of scaling with the line
   * width — a head that grows with its stroke looks like a different arrow at every board size.
   */
  const defs = document.createElementNS(SVG, 'defs');
  const marker = document.createElementNS(SVG, 'marker');
  marker.setAttribute('id', 'shape-arrowhead');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '3.2');
  marker.setAttribute('markerHeight', '3.2');
  marker.setAttribute('markerUnits', 'strokeWidth');
  marker.setAttribute('orient', 'auto-start-reverse');
  const head = document.createElementNS(SVG, 'path');
  head.setAttribute('d', 'M 0 1 L 8 5 L 0 9 z');
  head.setAttribute('class', 'board__arrowhead');
  marker.append(head);
  defs.append(marker);
  el.append(defs);

  const shapes: Shape[] = [];
  let orientation: 'w' | 'b' = 'w';

  function render(next: 'w' | 'b' = orientation): void {
    orientation = next;
    // Everything but the marker definition is rebuilt: at most a handful of elements.
    while (el.lastChild && el.lastChild !== defs) el.lastChild.remove();

    for (const shape of shapes) {
      const from = coordinates(shape.from, orientation);
      const to = coordinates(shape.to, orientation);
      if (!from || !to) continue;

      if (shape.from === shape.to) {
        // A marked square: a ring inside it, so the piece underneath stays completely readable.
        const ring = document.createElementNS(SVG, 'rect');
        ring.setAttribute('x', String(from.x - 0.46));
        ring.setAttribute('y', String(from.y - 0.46));
        ring.setAttribute('width', '0.92');
        ring.setAttribute('height', '0.92');
        ring.setAttribute('rx', '0.08');
        ring.setAttribute('class', 'board__mark');
        el.append(ring);
        continue;
      }

      /*
       * The line stops short of the destination's centre.
       *
       * An arrow drawn centre to centre buries its head under the piece it is pointing at, which is
       * exactly the piece the arrow is about. Backing off by a third of a square puts the head on
       * the edge of the target square where it can be seen.
       */
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const back = 0.34;

      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x - (dx / length) * back));
      line.setAttribute('y2', String(to.y - (dy / length) * back));
      line.setAttribute('class', 'board__arrow');
      line.setAttribute('marker-end', 'url(#shape-arrowhead)');
      el.append(line);
    }
  }

  return {
    el,
    toggle(shape) {
      const at = shapes.findIndex((other) => other.from === shape.from && other.to === shape.to);
      // Drawing the same shape twice removes it, so a mistake is undone by repeating it.
      if (at === -1) shapes.push(shape);
      else shapes.splice(at, 1);
      render();
    },
    clear() {
      if (shapes.length === 0) return false;
      shapes.length = 0;
      render();
      return true;
    },
    render,
    get count() {
      return shapes.length;
    },
  };
}
