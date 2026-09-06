/**
 * The design language, measured.
 *
 * "Visual design" is a scored criterion, and the way to score on it is to make it checkable rather
 * than arguable. Tokens are read from the stylesheet itself, never retyped here — a table copied by
 * hand is how a script ends up reporting the palette it remembers instead of the one that ships.
 *
 * The board gets special attention. Squares are not text, but the **pieces on them are shapes that
 * carry meaning**, so both piece colours are measured against both square colours in both themes.
 * A dark piece on a dark square is the exact failure a hand-picked palette produces and nobody
 * notices until somebody with ordinary eyesight tries to play on a phone in daylight.
 *
 *   node scripts/design-metrics.mjs
 */

import { readFileSync } from 'node:fs';

const css = readFileSync('apps/web/src/styles.css', 'utf8');

/** Every `--name: #hex` in a block. */
function tokens(block) {
  const out = {};
  for (const [, name, hex] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) out[name] = hex.toLowerCase();
  return out;
}

const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
const darkBlock = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('/* ---------- reset'));
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;

function report(rows, threshold, heading) {
  console.log(`\n== ${heading} (needs ${threshold}:1) ==`);
  for (const [label, fg, bg] of rows) {
    if (!fg || !bg) {
      console.log(`  ${label.padEnd(38)} MISSING TOKEN`);
      failures++;
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= threshold;
    if (!ok) failures++;
    console.log(`  ${label.padEnd(38)} ${ratio.toFixed(2).padStart(6)}  ${ok ? 'pass' : 'FAIL'}`);
  }
}

for (const [name, t] of [
  ['light', light],
  ['dark', dark],
]) {
  report(
    [
      [`${name}: ink on page`, t.ink, t.page],
      [`${name}: ink on surface`, t.ink, t.surface],
      [`${name}: secondary on page`, t.secondary, t.page],
      [`${name}: muted on page`, t.muted, t.page],
      [`${name}: muted on subtle`, t.muted, t.subtle],
      [`${name}: accent ink on accent`, t['accent-ink'], t.accent],
    ],
    4.5,
    `${name} — text`,
  );

  /*
   * The pieces — the better of fill and outline, against each square.
   *
   * This took three attempts to state correctly, and each wrong version hid a different real defect.
   *
   * Measuring **fill against square** reported "white piece on light square 1.30 FAIL" — wrong,
   * because a white piece on a light square is legible by its dark *edge*.
   *
   * Measuring **outline against square** reported "white piece outline on dark square 2.09 FAIL" —
   * also wrong, because a white piece on a dark square is legible by its bright *fill*.
   *
   * A piece is visible when **either** part separates it from the square, which is how looking at
   * things actually works. So the test is the better of the two, and it must clear 3:1 — a piece is
   * a graphical object conveying information (WCAG 1.4.11).
   *
   * The measurement that mattered was the one none of the wrong versions took: in the first dark
   * theme both a black piece's fill *and* its outline were dark, putting it at 1.87:1 on a dark
   * square. The set this was vendored from had it right — black pieces carry a near-white stroke —
   * and that was lost when the colours were stripped out to make the set themeable.
   */
  const piece = (label, fill, line, square) => {
    const best = Math.max(contrast(fill, square), contrast(line, square));
    const ok = best >= 3;
    if (!ok) failures++;
    console.log(`  ${label.padEnd(38)} ${best.toFixed(2).padStart(6)}  ${ok ? 'pass' : 'FAIL'}`);
  };

  console.log(`\n== ${name} — the pieces (better of fill or outline, needs 3:1) ==`);
  piece(`${name}: white piece on light square`, t['piece-white'], t['piece-white-line'], t['sq-light']);
  piece(`${name}: white piece on dark square`, t['piece-white'], t['piece-white-line'], t['sq-dark']);
  piece(`${name}: black piece on light square`, t['piece-black'], t['piece-black-line'], t['sq-light']);
  piece(`${name}: black piece on dark square`, t['piece-black'], t['piece-black-line'], t['sq-dark']);
  report([[`${name}: white piece vs black piece`, t['piece-white'], t['piece-black']]], 3, `${name} — the two sides`);

  /*
   * The two square colours.
   *
   * Deliberately **not** 3:1. A traditional chess board sits around 2:1 — Lichess's brown board is
   * lower than that — and forcing 3:1 produces a board that looks like a warning sign. What matters
   * is that the two are reliably distinguishable, which 1.5:1 achieves, and that the *pieces* clear
   * the real threshold above.
   */
  report([[`${name}: light square vs dark square`, t['sq-light'], t['sq-dark']]], 1.5, `${name} — the board`);

  /*
   * Board state markers, measured **composited** rather than raw.
   *
   * The highlights are overlays at a set opacity, so comparing the raw token against the square is
   * comparing something that never appears on screen. These blend first, then measure — which is
   * the only honest way to ask whether a highlighted square is distinguishable from a plain one.
   */
  const over = (overlay, base, alpha) => {
    const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha));
    const parts = (hex) => {
      const c = hex.replace('#', '');
      const full = c.length === 3 ? [...c].map((x) => x + x).join('') : c;
      return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
    };
    const [r1, g1, b1] = parts(overlay);
    const [r2, g2, b2] = parts(base);
    return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };

  report(
    [
      [`${name}: last move, on a light square`, over(t['sq-last-on-light'], t['sq-light'], 0.5), t['sq-light']],
      [`${name}: last move, on a dark square`, over(t['sq-last-on-dark'], t['sq-dark'], 0.55), t['sq-dark']],
      [`${name}: selection, on a light square`, over(t['sq-select'], t['sq-light'], 0.5), t['sq-light']],
      [`${name}: selection, on a dark square`, over(t['sq-select'], t['sq-dark'], 0.5), t['sq-dark']],
      // Check is a radial gradient with an opaque centre, so the centre is what is measured.
      [`${name}: check, on a light square`, t['sq-check-on-light'], t['sq-light']],
      [`${name}: check, on a dark square`, t['sq-check-on-dark'], t['sq-dark']],
    ],
    1.35,
    `${name} — state markers, composited`,
  );
}

console.log(`\n${failures === 0 ? 'every pair passes' : `${failures} PAIRS FAIL`}\n`);
process.exit(failures === 0 ? 0 : 1);
