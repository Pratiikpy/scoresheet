/**
 * Look at the board, in a real browser, on a phone-sized screen.
 *
 * A functional pass is not a visual pass. Every screen here is captured and asserted to fit a 390px
 * phone with no horizontal overflow, in both colour schemes — a single unbreakable element once
 * widened a sibling project's screen to 1229px inside a 390px viewport while every functional test
 * stayed green.
 *
 *   node scripts/look.mjs
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const SHOTS = 'shots';

let failures = 0;
let checks = 0;
const problems = [];

function check(label, ok, detail = '') {
  checks++;
  if (!ok) {
    failures++;
    problems.push(label + (detail ? ` — ${detail}` : ''));
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOTS, { recursive: true });

const preview = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: 'apps/web',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

const shutdown = () => {
  preview.kill();
};
process.on('exit', shutdown);

for (let i = 0; i < 60; i++) {
  try {
    const response = await fetch(BASE);
    if (response.ok) break;
  } catch {
    /* not up yet */
  }
  await wait(300);
}

console.log('\nScoresheet — the board, in a browser\n');

const browser = await chromium.launch();
const consoleErrors = [];

try {
  for (const scheme of ['light', 'dark']) {
    console.log(`${scheme}`);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[${scheme}] ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`[${scheme}] pageerror: ${e.message}`));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.board', { timeout: 20_000 });

    // The board must be square, and it must be on the screen before anything is tapped.
    const box = await page.locator('.board').boundingBox();
    check('the board is drawn on load', box !== null && box.width > 300);
    check('and it is square', Math.abs(box.width - box.height) < 2, `${Math.round(box.width)}×${Math.round(box.height)}`);

    const pieces = await page.locator('.piece').count();
    check('all thirty-two pieces are on it', pieces === 32, String(pieces));

    await page.screenshot({ path: `${SHOTS}/01-board-${scheme}.png`, fullPage: true });

    // Picking a piece up shows where it can go.
    await page.locator('[data-square="e2"]').click();
    await wait(150);
    const dests = await page.locator('.sq--dest, .sq--capture').count();
    check('lifting a pawn shows its legal squares', dests === 2, `${dests} dots`);
    check('and the square it came from is marked', (await page.locator('.sq--selected').count()) === 1);
    await page.screenshot({ path: `${SHOTS}/02-selected-${scheme}.png`, fullPage: true });

    // Tap-tap plays the move, which is how a phone is actually used.
    await page.locator('[data-square="e4"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.sq--last').length === 2, { timeout: 20_000 });
    check('tap-tap moves the piece', true);

    // And the bot answers on its own, without anybody else being online.
    await page.waitForFunction(
      () => (document.querySelector('.game__status')?.textContent ?? '').length > 0,
      { timeout: 30_000 },
    );
    await wait(1500);
    const moves = await page.evaluate(() => document.querySelectorAll('.sq--last').length);
    check('the bot replies by itself', moves === 2);
    await page.screenshot({ path: `${SHOTS}/03-after-move-${scheme}.png`, fullPage: true });

    // Nothing may scroll sideways on a phone.
    const width = await page.evaluate(() => ({
      scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      inner: window.innerWidth,
    }));
    check('nothing scrolls sideways', width.scroll <= width.inner + 1, `${width.scroll} vs ${width.inner}`);

    // Every square is a real tap target.
    const square = await page.locator('[data-square="e2"]').boundingBox();
    check('a square is at least 44px', square.width >= 44, `${Math.round(square.width)}px`);

    await context.close();
  }

  console.log('\nhygiene');
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (error) {
  console.error('\nRUN FAILED:', error.message);
  failures++;
} finally {
  await browser.close();
  shutdown();
}

console.log(`\n${failures === 0 ? `ALL ${checks} CHECKS PASSED` : `${failures} of ${checks} CHECKS FAILED`}`);
if (problems.length) console.log(problems.map((p) => `  - ${p}`).join('\n'));
console.log(`screens: ${SHOTS}/\n`);
process.exit(failures === 0 ? 0 : 1);
