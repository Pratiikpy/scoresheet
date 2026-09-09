/**
 * The link preview image, drawn once and committed.
 *
 * **The share link is the whole distribution strategy** (`SPEC.md` step 5), and a link pasted into a
 * chat with no preview is a grey rectangle nobody taps. This is the one image that appears wherever
 * the product is sent, so it is drawn rather than screenshotted: a screenshot of the running app at
 * 1200 × 630 is a board with two inches of empty page around it.
 *
 *   node scripts/make-share-image.mjs
 *
 * It renders in a real browser, using the app's own board colours and vendored pieces, so the
 * preview and the product cannot drift apart. The output is committed because a build must not need
 * a browser to produce a static asset.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4176;
const BASE = `http://localhost:${PORT}`;
const OUT = 'apps/web/public/share.png';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const preview = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
  cwd: 'apps/web',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});
process.on('exit', () => preview.kill());

for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* not up yet */
  }
  await wait(300);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(BASE, { waitUntil: 'networkidle' });

const png = await page.evaluate(async () => {
  const { PIECES, PIECE_VIEWBOX } = await import('/src/pieces.ts');
  const { positionFromFen, squareColour } = await import('/src/board.ts');

  const WIDTH = 1200;
  const HEIGHT = 630;
  const PAPER = '#f6f4ef';
  const INK = '#16150f';
  const MUTED = '#5b5952';
  const ACCENT = '#2f6f4f';
  const LIGHT = '#edd9b0';
  const DARK = '#9a7248';
  const WHITE_PIECE = '#fcfbf8';
  const WHITE_LINE = '#131109';
  const BLACK_PIECE = '#21201c';
  const BLACK_LINE = '#f2f0ea';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  context.fillStyle = PAPER;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // The pieces, decoded first, so the draw below stays synchronous and cannot half-finish.
  const images = new Map();
  await Promise.all(
    Object.keys(PIECES).map(
      (code) =>
        new Promise((resolve, reject) => {
          const fill = code[0] === 'w' ? WHITE_PIECE : BLACK_PIECE;
          const stroke = code[0] === 'w' ? WHITE_LINE : BLACK_LINE;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PIECE_VIEWBOX}" width="256" height="256"><g fill="${fill}" stroke="${stroke}">${PIECES[code]}</g></svg>`;
          const image = new Image();
          image.addEventListener('load', () => {
            images.set(code, image);
            resolve();
          });
          image.addEventListener('error', reject);
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }),
    ),
  );

  /*
   * A real position, not the starting one.
   *
   * The Immortal Game's final move — a mate with three minor pieces against a queen and two rooks.
   * A start position says "a chess app"; a position with something happening in it says "chess", and
   * it is the difference between a preview somebody scrolls past and one they look at.
   */
  const FEN = 'r1bk3r/p2pBpNp/n4n2/1p1NP2P/6P1/3P4/P1P1K3/q5b1';
  const board = 470;
  const left = WIDTH - board - 60;
  const top = (HEIGHT - board) / 2;
  const square = board / 8;
  const position = positionFromFen(FEN);
  const files = 'abcdefgh';

  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const name = `${files[file]}${rank}`;
      const x = left + file * square;
      const y = top + (8 - rank) * square;
      context.fillStyle = squareColour(name) === 'light' ? LIGHT : DARK;
      context.fillRect(x, y, square, square);
      const piece = position.get(name);
      if (piece && images.has(piece)) {
        const inset = square * 0.06;
        context.drawImage(images.get(piece), x + inset, y + inset, square - inset * 2, square - inset * 2);
      }
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.18)';
  context.lineWidth = 2;
  context.strokeRect(left, top, board, board);

  // The words, left of the board, in the app's own type.
  context.textAlign = 'left';
  context.fillStyle = INK;
  context.font = '600 66px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillText('Scoresheet', 70, 250);

  context.fillStyle = ACCENT;
  context.font = '600 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillText('Both players sign the result.', 70, 310);

  context.fillStyle = MUTED;
  context.font = '400 26px system-ui, -apple-system, "Segoe UI", sans-serif';
  for (const [index, line] of [
    'The rating that comes out is yours,',
    'and nobody — including us — can take it away.',
  ].entries()) {
    context.fillText(line, 70, 362 + index * 38);
  }

  return canvas.toDataURL('image/png');
});

writeFileSync(OUT, Buffer.from(png.split(',')[1], 'base64'));
console.log(`${OUT} written`);

await browser.close();
preview.kill();
process.exit(0);
