/**
 * The rating, drawn.
 *
 * `SPEC.md` J6. A number tells you where you are; a line tells you whether you are getting better,
 * which is the only question anybody actually asks about a rating. It is also the single cheapest
 * way to make the record page feel like a record rather than a receipt.
 *
 * **Inline SVG, not a chart library.** A sparkline is a polyline and some axis labels. Every charting
 * library is larger than this whole application, and none of them would draw the two things that
 * matter here: that the line starts at the starting rating rather than at the first game, and that
 * the provisional stretch is visibly not the same claim as the settled one.
 *
 * It is deliberately not interactive. Hover tooltips on a phone are a lie, and a graph that needs
 * poking to be readable is a graph that is not readable.
 */

import { DISTINCT_OPPONENTS_FOR_ESTABLISHED, STARTING_RATING, type RatingPoint } from '@scoresheet/core';

const SVG = 'http://www.w3.org/2000/svg';

/** Viewport units. The SVG scales to its container, so these are proportions rather than pixels. */
const WIDTH = 320;
const HEIGHT = 120;
const PADDING = { top: 12, right: 8, bottom: 22, left: 34 };

function node<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

/**
 * Draw a rating history.
 *
 * Returns `null` when there is nothing worth drawing — one point is a dot, not a line, and a graph
 * of a single game says less than the number already above it does.
 */
export function createRatingGraph(
  history: readonly RatingPoint[],
  options: { distinctOpponents: number } = { distinctOpponents: 0 },
): SVGSVGElement | null {
  if (history.length < 2) return null;

  /*
   * The line starts at the starting rating, before the first game.
   *
   * Beginning at the first game's *result* would hide the first move the rating ever made, which is
   * usually the largest one — and it would make a player who lost their first three games appear to
   * have started at whatever they fell to.
   */
  const values = [STARTING_RATING, ...history.map((point) => point.after)];

  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  /*
   * A floor on the visible range, so a quiet record does not look dramatic.
   *
   * Without it, a rating that moved by four points across six games would be drawn as a mountain
   * range — technically an accurate plot of the data and a completely false impression of it.
   */
  const span = Math.max(60, highest - lowest);
  const middle = (highest + lowest) / 2;
  const top = middle + span / 2;
  const bottom = middle - span / 2;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (index / (values.length - 1)) * plotWidth;
  const y = (value: number) => PADDING.top + ((top - value) / (top - bottom)) * plotHeight;

  const svg = node('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'graph',
    role: 'img',
    // A screen reader gets the shape of it in words, because a polyline is nothing to a screen
    // reader and "chart" is worse than nothing.
    'aria-label': `Rating over ${history.length} rated ${history.length === 1 ? 'game' : 'games'}: started at ${STARTING_RATING}, now ${values[values.length - 1]}, lowest ${lowest}, highest ${highest}.`,
  });

  /* ---------------------------------------------------------------- the scale */

  for (const value of [top, bottom]) {
    const at = y(value);
    svg.append(
      node('line', { x1: PADDING.left, y1: at, x2: WIDTH - PADDING.right, y2: at, class: 'graph__grid' }),
    );
    const label = node('text', { x: PADDING.left - 6, y: at + 3.5, class: 'graph__label', 'text-anchor': 'end' });
    label.textContent = String(Math.round(value));
    svg.append(label);
  }

  /*
   * The starting rating, as a reference line — but only when it is inside the visible range.
   *
   * Drawing it clamped to an edge would put a line labelled 1200 at the bottom of a graph whose
   * bottom is 900, which reads as a fact and is not one.
   */
  if (STARTING_RATING < top && STARTING_RATING > bottom) {
    svg.append(
      node('line', {
        x1: PADDING.left,
        y1: y(STARTING_RATING),
        x2: WIDTH - PADDING.right,
        y2: y(STARTING_RATING),
        class: 'graph__start',
      }),
    );
  }

  /* ---------------------------------------------------------------- the line */

  const points = values.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
  svg.append(node('polyline', { points, class: 'graph__line' }));

  /*
   * Where the rating stopped being provisional, marked.
   *
   * A rating built on fewer than ten distinct opponents is a different claim from one built on more
   * (`SPEC.md` F4), and the record page says so in words beside the number. Saying it again on the
   * graph is what stops the early, volatile stretch from being read as the same kind of evidence as
   * the later one.
   */
  const stillProvisional = options.distinctOpponents < DISTINCT_OPPONENTS_FOR_ESTABLISHED;
  if (stillProvisional) {
    svg.append(
      node('rect', {
        x: PADDING.left,
        y: PADDING.top,
        width: plotWidth,
        height: plotHeight,
        class: 'graph__provisional',
      }),
    );
    const label = node('text', {
      x: PADDING.left + plotWidth / 2,
      y: HEIGHT - 6,
      class: 'graph__note',
      'text-anchor': 'middle',
    });
    label.textContent = `provisional — ${options.distinctOpponents} of ${DISTINCT_OPPONENTS_FOR_ESTABLISHED} opponents`;
    svg.append(label);
  }

  // The latest point, so the eye lands on where the line has got to.
  svg.append(
    node('circle', {
      cx: x(values.length - 1),
      cy: y(values[values.length - 1]!),
      r: 3,
      class: 'graph__now',
    }),
  );

  return svg;
}
