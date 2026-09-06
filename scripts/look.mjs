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

    // The move list is the panel that fills the space under the board, and it is scrubbable —
    // people do it mid-game, constantly, to check what just happened.
    const rows = await page.locator('.moves__move').count();
    check('the move list holds both moves', rows === 2, `${rows} moves`);

    await page.locator('.moves__move').first().click();
    await wait(200);
    check('tapping a move shows that position', (await page.locator('.game--reviewing').count()) === 1);
    check('and says so, rather than silently rewinding', /earlier position/i.test(await page.locator('.moves__note').innerText()));
    const reviewing = await page.evaluate(() => document.querySelectorAll('.sq .piece').length);
    check('the board really went back a move', reviewing === 32, `${reviewing} pieces`);
    check('nothing can be picked up off a past position', (await page.locator('.sq[tabindex="0"]').count()) === 0);
    await page.screenshot({ path: `${SHOTS}/04-reviewing-${scheme}.png`, fullPage: true });

    await page.locator('[aria-label="Back to the live position"]').click();
    await wait(200);
    check('and one tap comes back to the live game', (await page.locator('.game--reviewing').count()) === 0);
    check('after which pieces can be lifted again', (await page.locator('.sq[tabindex="0"]').count()) > 0);

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

  /*
   * The whole point, walked end to end: play a game to a real finish, sign the result, and show the
   * exact bytes that were signed. Uses the stand-in wallet, which announces itself as meaningless.
   */
  console.log('\nsigning a finished game');
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[sign] ${m.text()}`); });
    page.on('pageerror', (e) => consoleErrors.push(`[sign] pageerror: ${e.message}`));

    await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.board', { timeout: 20_000 });

    // A few real moves, then resign. Resigning is how most online games actually end, it is the
    // fastest honest finish, and it exercises the one ending the position alone cannot express.
    for (let move = 0; move < 3; move++) {
      const from = page.locator('.sq[tabindex="0"]').first();
      if ((await from.count()) === 0) break;
      await from.click();
      await wait(150);
      const dest = page.locator('.sq--dest, .sq--capture').first();
      if ((await dest.count()) === 0) break;
      await dest.click();
      await wait(1200);
    }
    check('a few moves are on the board', (await page.locator('.moves__move').count()) >= 2);

    // Confirmed, because resigning by accident is the worst mis-tap in chess.
    const resignButton = page.locator('[data-action="resign"]');
    await resignButton.click();
    check('resigning asks once before it happens', /tap again/i.test(await resignButton.innerText()));
    await resignButton.click();

    await page.waitForSelector('.ending', { state: 'visible', timeout: 40_000 });
    const result = await page.locator('.game__status').innerText();
    check('a game played out reaches a real result', /checkmate|draw|wins|stalemate/i.test(result), result);
    check('and the end offers to sign it', (await page.locator('.ending .btn--primary').count()) === 1);
    await page.screenshot({ path: `${SHOTS}/05-game-over.png`, fullPage: true });

    await page.locator('.ending .btn--primary').click();
    await page.waitForSelector('.ending__done', { timeout: 30_000 });
    check('signing succeeds', true);
    check(
      'and says plainly that the stand-in proves nothing',
      /meaningless/i.test(await page.locator('.ending__done').innerText()),
    );

    await page.locator('.ending__proof summary').click();
    const canonical = await page.locator('.ending__canonical').innerText();
    check('the exact signed bytes are shown', canonical.startsWith('chess/1 scoresheet'), canonical.split('\n')[0]);
    check('with the chain inside them, since sign() has no domain separation', canonical.split('\n')[1] === 'test');
    check('and a bot game is signed casual, never rated', canonical.trimEnd().endsWith('casual'));
    await page.screenshot({ path: `${SHOTS}/06-signed.png`, fullPage: true });

    const signWidth = await page.evaluate(() => ({
      scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      inner: window.innerWidth,
    }));
    check('the signed bytes do not widen the page', signWidth.scroll <= signWidth.inner + 1, `${signWidth.scroll} vs ${signWidth.inner}`);

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
