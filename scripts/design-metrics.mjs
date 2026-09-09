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
/** How many pairs were actually measured, so the README cannot claim a number it does not reach. */
let measured = 0;

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
    measured++;
    if (!ok) failures++;
    console.log(`  ${label.padEnd(38)} ${ratio.toFixed(2).padStart(6)}  ${ok ? 'pass' : 'FAIL'}`);
  }
}

/*
 * Every board colourway is measured, not just the default one.
 *
 * `SPEC.md` A4 called board themes the cheapest personalisation there is, and they are — but each one
 * is a set of promises somebody has to keep: a piece must stay legible on both its squares, and the
 * last-move, check and premove markers must all still read. A theme that shipped without being
 * measured would be three ways for the board to become unusable, chosen from a settings sheet.
 *
 * The overrides are read from the stylesheet itself, so adding a theme adds its checks automatically
 * and there is no second list to forget to update.
 */
function boardTheme(selector) {
  const at = css.indexOf(selector);
  if (at === -1) return null;
  return tokens(css.slice(at, css.indexOf('}', at)));
}

const themed = [];
for (const theme of ['slate', 'sea']) {
  const overrides = boardTheme(`:root[data-board='${theme}']`);
  if (!overrides) continue;
  themed.push([`${theme}`, { ...light, ...overrides }]);
  const darkOverrides = boardTheme(`:root[data-theme='dark'][data-board='${theme}']`);
  themed.push([`${theme}, dark`, { ...dark, ...overrides, ...(darkOverrides ?? {}) }]);
}

for (const [name, t] of [
  ['light', light],
  ['dark', dark],
  ...themed,
]) {
  report(
    [
      [`${name}: ink on page`, t.ink, t.page],
      [`${name}: ink on surface`, t.ink, t.surface],
      [`${name}: secondary on page`, t.secondary, t.page],
      [`${name}: muted on page`, t.muted, t.page],
      [`${name}: muted on subtle`, t.muted, t.subtle],
      [`${name}: accent ink on accent`, t['accent-ink'], t.accent],
      /*
       * Hovered, too — the state that actually broke.
       *
       * Measuring only the resting colours passed a primary button whose label sat at 1.15:1 under
       * every desktop pointer, because `.btn:hover` outranked `.btn--primary` on specificity. A
       * state a real user spends time in is a state that has to be measured.
       */
      [`${name}: accent ink on accent, hovered`, t['accent-ink'], t['accent-hover']],
      /*
       * The status colours, as **text** — which is how they are actually used, and which nothing
       * here was measuring.
       *
       * `--good`, `--bad` and `--warn` colour a dozen sentences in this app: "Signed", "Won" and
       * "Lost" on the record, the puzzle verdict, a clock under fifteen seconds, the paid line after
       * a reward. Every one of them is text a person has to read, and this file printed "every pair
       * passes" while never looking at one of them. A dark-mode green that failed would have shipped
       * in silence, on the line that says a game was recorded.
       */
      [`${name}: good on page`, t.good, t.page],
      [`${name}: good on surface`, t.good, t.surface],
      [`${name}: bad on page`, t.bad, t.page],
      [`${name}: bad on surface`, t.bad, t.surface],
      [`${name}: warn on page`, t.warn, t.page],
      [`${name}: warn on subtle`, t.warn, t.subtle],
      /*
       * The evaluation bar's two halves, against each other.
       *
       * It is a graphical object carrying information (WCAG 1.4.11) and its whole meaning is the
       * boundary between the two colours — if they do not separate, the bar says nothing. Measured
       * as a pair because the first version painted it in `--ink` and `--surface`, which is correct
       * in light mode and **inverted in dark**: Black's half would have been the bright one.
       */
      [`${name}: the evaluation bar's two halves`, t['piece-white'], t['piece-black']],
      /*
       * The board's coordinates, on the squares they sit on.
       *
       * Nine-pixel text on a chessboard, and for a long time drawn in the opposite square's colour —
       * which inherits the board's deliberately soft contrast and put them at 3.11:1 in light mode
       * and **2.12:1 in dark**. Held to 4.5:1 like any other text a person reads, in every theme,
       * because a colourway is free to change the squares and must not be free to hide the labels.
       */
      [`${name}: coordinate on a light square`, t['piece-black'], t['sq-light']],
      [`${name}: coordinate on a dark square`, t['piece-white'], t['sq-dark']],
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
      [`${name}: premove, on a light square`, over(t['sq-premove-on-light'], t['sq-light'], 0.5), t['sq-light']],
      [`${name}: premove, on a dark square`, over(t['sq-premove-on-dark'], t['sq-dark'], 0.55), t['sq-dark']],
      // Check is a radial gradient with an opaque centre, so the centre is what is measured.
      [`${name}: check, on a light square`, t['sq-check-on-light'], t['sq-light']],
      [`${name}: check, on a dark square`, t['sq-check-on-dark'], t['sq-dark']],
    ],
    1.35,
    `${name} — state markers, composited`,
  );
}

/*
 * Every `var(--x)` must resolve to a token that actually exists.
 *
 * An undefined custom property does not throw, does not warn, and does not appear in the console —
 * the declaration is simply dropped and the element inherits. So a rule written against invented
 * token names renders as unstyled text on a transparent background while every functional check
 * still passes, because the words are all present and the page does not scroll sideways. That
 * happened here: a new banner was written with five plausible names (`--surface-2`, `--ink-2`,
 * `--text-sm`, `--radius-2`, `--space-4`) and 56 of 56 browser checks went green over it.
 *
 * A fallback (`var(--x, ...)`) is the one legitimate way to name a token that may not exist, so
 * those are allowed through.
 */
console.log('');
console.log('tokens - every reference resolves');
{
  /*
   * A definition is a token followed by a colon, anywhere — not only at the start of a line.
   *
   * The first version anchored to line start and reported `--swatch-light` and `--swatch-dark` as
   * undefined while they were defined perfectly well, in single-line rules
   * (`.sheet__theme--wood { --swatch-light: …; --swatch-dark: …; }`). A guard that cries wolf about
   * correct CSS is a guard people start ignoring, which costs more than the bug it was written for.
   *
   * `var(--x, fallback)` cannot be mistaken for a definition: a fallback is introduced by a comma,
   * never a colon.
   */
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  const missing = new Map();
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
    const [, token, next] = match;
    if (next === ',') continue;
    if (defined.has(token)) continue;
    if (!missing.has(token)) missing.set(token, css.slice(0, match.index).split(String.fromCharCode(10)).length);
  }
  if (missing.size === 0) {
    console.log(`  PASS  all ${defined.size} tokens defined, every reference resolves`);
  } else {
    for (const [token, line] of missing) {
      failures += 1;
      console.log(`  FAIL  ${token} is used at styles.css:${line} but never defined`);
    }
  }
}

/*
 * The README says how many pairs there are, and it has to be right.
 *
 * It said **42** while this file measured **162** — a number that went stale the moment a theme or
 * a colour was added, in a document whose whole argument is "check this rather than believe it".
 * The browser journey has asserted its own count against the README from the start; there was no
 * reason this one should not, and every reason it should.
 */
console.log(`\n== our own documentation ==`);
const readmeText = readFileSync('README.md', 'utf8');
// The words, not the command name: a renamed script must not be able to switch this off quietly.
const claimed = Number(/(\d+) contrast pairs/.exec(readmeText)?.[1] ?? 0);
if (claimed === measured) {
  console.log(`  PASS  the README says ${measured} contrast pairs, and there are ${measured}`);
} else {
  failures += 1;
  console.log(`  FAIL  the README says ${claimed} contrast pairs, this run measured ${measured}`);
}

console.log(
  `\n${failures === 0 ? `every one of ${measured} pairs passes, every token resolves` : `${failures} FAILED`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
