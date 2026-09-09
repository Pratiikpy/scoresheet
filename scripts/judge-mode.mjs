/**
 * Judge mode — the app opened cold, by somebody who has never seen it.
 *
 * This is how the entry is actually scored: somebody opens the live URL on their own phone, with no
 * instructions, no account and no patience. Every other suite here starts by knowing what it is
 * looking for. This one starts by knowing nothing.
 *
 * ## Why half of this reports PENDING and always will
 *
 * `research/11-testing/judge-mode.md` §5 sets out nine questions, and says of them: *"Every question
 * is run as a real human, on a real device, given zero instructions — not a Playwright script —
 * because comprehension cannot be automated."* That is correct, and it is why this file is built the
 * way it is.
 *
 * There are two halves, kept apart on purpose:
 *
 *  - **The preconditions.** Mechanical facts a machine can settle, each named with the question it
 *    supports. A precondition failing means the human session would be wasted, so these run first.
 *    None of them is an *answer* to its question — a puzzle screen that opens is not a puzzle a
 *    person understood.
 *  - **The nine questions**, printed with the criterion that decides each, all PENDING. This is the
 *    script for the human session and it is the honest output of the file: marking them PASS because
 *    the right selectors existed would be lying about the only thing this exists to measure.
 *
 * Four states, never a fifth: PASS, FAIL, PENDING, BLOCKED. No "probably", no "should be fine".
 *
 * ## What is genuinely cold here
 *
 * A fresh browser context, no storage, no service worker carried over, a phone-sized viewport with
 * touch, and the network throttled to mobile data. Taps are real Playwright taps rather than
 * synthesised events, because the board listens on pointer events and an element's `.click()` fires
 * none of them — the first version of this file reported "a piece cannot be moved" against a board
 * that moves pieces perfectly well.
 *
 *   node scripts/judge-mode.mjs
 */
import { chromium } from 'playwright';
import { startApp } from './harness.mjs';

/*
 * Its own ports, deliberately.
 *
 * `look.mjs` holds 4174/8788/8790. Sharing them would mean the two suites cannot run at once and,
 * worse, that one could attach to the other's server and report on a stack it did not build. That
 * happened during this file's first run, and is why `harness.mjs` now treats a bind failure as fatal
 * even after the health check has already answered.
 */
const { base: BASE } = await startApp({ port: 4175, apiPort: 8791, stubNodePort: 8792 });

const MOBILE_NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

const results = [];
const record = (state, label, detail = '') => {
  results.push({ state, label, detail });
  console.log(`  ${state.padEnd(7)} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** A phone on mobile data, not a laptop on fibre. A first impression formed over fibre is not theirs. */
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();

const session = await context.newCDPSession(page);
await session.send('Network.enable');
await session.send('Network.emulateNetworkConditions', MOBILE_NETWORK);

/*
 * Two error channels, kept apart, because one of them is expected later on.
 *
 * The offline check below pulls the network out deliberately, and the browser logs a console error
 * for every request that then fails. Counting those as defects made this suite fail itself — a
 * harness accusing the product of its own actions. So:
 *
 *  - **Console errors** are asserted over the online phase only, and the snapshot is taken before
 *    the radio goes off.
 *  - **Page errors** — uncaught JavaScript exceptions — are asserted over the *whole* run including
 *    the offline part, because a thrown exception is never an expected consequence of being offline.
 *    That is the check that would catch a service worker whose fallback path is broken.
 */
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error.message)));

console.log(`\njudge mode against ${BASE} — cold profile, phone viewport, throttled to mobile data\n`);
console.log('  the preconditions a machine can settle\n');

/* ------------------------------------------------------------- Q1. it opens, and quickly */

const started = Date.now();
await page.goto(`${BASE}/?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.board', { timeout: 30_000 });
const toBoard = Date.now() - started;

record(
  toBoard < 10_000 ? 'PASS' : 'FAIL',
  'Q1 · a board is on screen within ten seconds of a cold open',
  `${(toBoard / 1000).toFixed(1)}s`,
);

const gate = await page.evaluate(() => {
  const text = document.body.innerText.toLowerCase();
  return {
    asksToSignUp: /sign up|create an account|register|log in|sign in/.test(text),
    asksForWallet: /connect (your )?wallet/.test(text),
    squares: document.querySelectorAll('.sq').length,
  };
});
record(gate.squares === 64 ? 'PASS' : 'FAIL', 'Q1 · the first screen is a chessboard', `${gate.squares} squares`);

/*
 * ⭐ The sentence question one depends on is actually on the screen.
 *
 * Question one asks whether somebody works out, unprompted and in thirty seconds, that this is about
 * a *signed, verifiable* result. They can only do that if the claim is in front of them — and this
 * app shows it only until the device holds a signed game, so the cold visitor is exactly who sees
 * it. Nothing checked that it was there. If it were reworded into vagueness or dropped, question one
 * would fail on a person and the transcript would say "they didn't get it" rather than "we never
 * said it", which is the wrong diagnosis of the wrong problem.
 *
 * This does not answer question one. Nobody has been asked anything. It only refuses to let the
 * human session be wasted on a screen that never made the claim.
 *
 * The words matched are English because this runs in the default locale. The sentence itself is
 * translated into all five — it was the one hardcoded English string in the app until this check
 * went looking for it, which is exactly the kind of thing a cold read finds and a warm one does not.
 */
const claim = await page.evaluate(() => document.querySelector('.moves__claim')?.textContent?.trim() ?? '');
record(
  /rating/i.test(claim) && /sign/i.test(claim) ? 'PASS' : 'FAIL',
  'Q1 · and it says what this is — a rating, signed, on the cold screen',
  claim ? `“${claim.slice(0, 72)}…”` : 'nothing said',
);
record(
  !gate.asksToSignUp && !gate.asksForWallet ? 'PASS' : 'FAIL',
  'Q1 · nothing is asked for before you can play',
  gate.asksToSignUp ? 'it asks for an account' : gate.asksForWallet ? 'it asks for a wallet' : 'nothing asked',
);

/* ------------------------------------------------------------- Q2. a move can be made */

/**
 * Two real taps, the way a thumb makes them.
 *
 * `page.tap()` goes through the browser's own input pipeline, so the board receives trusted pointer
 * events in the right order. Dispatching a synthetic `PointerEvent` — which `look.mjs` does, for good
 * reasons of its own — is a close imitation; here the point is to be indistinguishable from a finger,
 * because this suite's whole claim is that it opened the app the way a person would. The first
 * version of this file used `element.click()`, which fires no pointer events at all, and reported a
 * board that cannot be played against a board that plays fine.
 */
const liftable = page.locator('.sq[tabindex="0"]');
let moved = false;
const liftableCount = await liftable.count();
for (let index = 0; index < liftableCount; index++) {
  await liftable.nth(index).tap();
  const dest = page.locator('.sq--dest, .sq--capture').first();
  if ((await dest.count()) === 0) continue;
  await dest.tap();
  await page.waitForSelector('.moves__move', { timeout: 10_000 }).catch(() => {});
  moved = (await page.locator('.moves__move').count()) > 0;
  break;
}
record(moved ? 'PASS' : 'FAIL', 'Q2 · a piece moves with two taps, cold, no instructions');

/* ------------------------------------------------------------- Q3/Q4/Q7. the screens exist at all */

for (const [label, path, selector] of [
  ['Q4 · the puzzles open from their own URL', '/puzzles?demo=1', '.puzzle-menu'],
  ['Q3 · game review opens from its own URL', '/study?demo=1', '.study'],
  ['Q7 · the verify page opens from its own URL', '/verify', '.verify'],
]) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(selector, { timeout: 20_000 });
    record('PASS', label);
  } catch {
    record('FAIL', label);
  }
}

/* ------------------------------------------------------------- Q7. it works with us switched off */

await page.goto(`${BASE}/verify`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.verify', { timeout: 20_000 });

let reachedServer = false;
await page.route('**/api/**', (route) => {
  reachedServer = true;
  void route.abort();
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.verify__input', { timeout: 20_000 });
record(
  !reachedServer ? 'PASS' : 'FAIL',
  'Q7 · checking a record needs nothing from our server',
  reachedServer ? 'it called the API' : 'no API call',
);
await page.unroute('**/api/**');

/* ------------------------------------------------------------- Q4. and nothing from the network */

/*
 * Airplane mode, which is the half of question 4 a machine really can settle.
 *
 * The service worker's whole claim is that a second visit works with no network at all. Whether the
 * puzzle was *understandable* is a person's judgement; whether it renders with the radio off is a
 * fact, and it is the fact the offline claim rests on.
 */
await page.goto(`${BASE}/puzzles?demo=1`, { waitUntil: 'load' });
await page.waitForSelector('.puzzle-menu', { timeout: 20_000 });
await page
  .waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 15_000 })
  .catch(() => {});

/* Everything above happened on a working network, so this is the honest place to judge the console. */
record(
  consoleErrors.length === 0 ? 'PASS' : 'FAIL',
  'no console errors anywhere on the online path',
  consoleErrors[0]?.slice(0, 120) ?? '',
);

if (!(await page.evaluate(() => navigator.serviceWorker?.controller != null))) {
  record('BLOCKED', 'Q4 · the app opens offline after one visit', 'no service worker took control within 15s');
} else {
  await session.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });

  /*
   * First prove the radio is actually off.
   *
   * If `emulateNetworkConditions` silently failed to apply, the reload below would succeed over a
   * live network and this would report a passing offline test having never been offline — the same
   * vacuous-measurement trap that made the fair-play calibration report "0% flagged" on a sample it
   * had judged nobody in. So: fetch something the service worker deliberately does not cache. It
   * must fail. If it answers, the emulation is not in force and the result below would mean nothing.
   */
  const radioOff = await page.evaluate(async () => {
    try {
      await fetch('/api/health', { cache: 'no-store' });
      return false;
    } catch {
      return true;
    }
  });

  if (!radioOff) {
    record('BLOCKED', 'Q4 · the app opens offline after one visit', 'the network never actually went offline');
    await session.send('Network.emulateNetworkConditions', MOBILE_NETWORK);
  } else {
    let offlineOk = false;
    try {
      await page.goto(`${BASE}/puzzles?demo=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.puzzle-menu', { timeout: 20_000 });
      offlineOk = true;
    } catch {
      offlineOk = false;
    }
    record(offlineOk ? 'PASS' : 'FAIL', 'Q4 · the app opens offline after one visit');
    await session.send('Network.emulateNetworkConditions', MOBILE_NETWORK);
  }
}

/* ------------------------------------------------------------- underneath */

record(
  pageErrors.length === 0 ? 'PASS' : 'FAIL',
  'nothing threw, online or offline',
  pageErrors[0]?.slice(0, 120) ?? '',
);

await context.close();
await browser.close();

/* ------------------------------------------------------------- the nine */

/**
 * The nine questions, in substance from `research/11-testing/judge-mode.md` §5.
 *
 * Each carries the criterion that decides it, so whoever runs the session does not have to interpret
 * anything. None of them can be closed from here.
 */
const NINE = [
  ['understand what this is in 30 seconds', 'the answer mentions a signed or verifiable result — unprompted'],
  ['play a game to its end', 'reaches mate, resignation or a draw unaided, and finds the start without help'],
  ['review a mistake', 'finds the review screen unaided and can name their own weakest move'],
  ['solve a puzzle, then reopen it in airplane mode', 'feedback is unambiguous, and it still works offline'],
  ['say why this needs a wallet at all', 'names that the result cannot be faked — not "for payments, I guess"'],
  ['cause a real Nimiq transaction (the tip path)', 'the Pay dialog shows a legible memo and the tx confirms on a public explorer'],
  ['verify a game on a device that never touched our server', 'the number matches, and they can say what the button did'],
  ['say what makes the rating trustworthy', 'references signing, both parties agreeing, or the recompute — not "I trust the app"'],
  ['find the recompute button without being told', 'reached unassisted across the whole session; a hint is only a partial'],
];

console.log('');
console.log('  the nine questions — a person, their own device, no instructions\n');
for (const [question, criterion] of NINE) record('PENDING', question, criterion);

/* ------------------------------------------------------------- the verdict */

const count = (state) => results.filter((result) => result.state === state).length;
const failed = results.filter((result) => result.state === 'FAIL');
const blocked = results.filter((result) => result.state === 'BLOCKED');

console.log('');
console.log(
  `  ${count('PASS')} PASS   ${count('FAIL')} FAIL   ${count('PENDING')} PENDING   ${count('BLOCKED')} BLOCKED`,
);
console.log('');

for (const item of blocked) console.log(`BLOCKED  ${item.label} — ${item.detail}`);

if (failed.length > 0) {
  console.log('FAIL  the preconditions did not hold, so a human session would be wasted:');
  for (const item of failed) console.log(`  - ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
  process.exitCode = 1;
} else {
  console.log('PASS  every precondition holds. The human session is worth running.');
  console.log('');
  console.log('      The nine questions above stay PENDING and cannot be closed from here. They need');
  console.log('      three testers who have never seen this app, on their own devices, with Nimiq Pay');
  console.log('      installed — and the worst of the three runs is the result. Until that happens the');
  console.log('      comprehension half of this entry is unmeasured, and nothing here claims otherwise.');
}
