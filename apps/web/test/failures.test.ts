/**
 * Every failure gets a sentence, and the sentence is checked.
 *
 * `SPEC.md` M2 names this as a whole scored criterion — *fails gracefully, or crashes and confuses*.
 * The tests below are less about branches than about two properties that hold across all of them,
 * because those are what a person actually experiences:
 *
 *  - **Nothing internal ever reaches the screen.** No error name, no code, no stack, no `TypeError`.
 *  - **A choice is never reported as a failure.** Declining a wallet, cancelling a share sheet.
 *
 * Both are asserted over every case rather than case by case, so a branch added later without a
 * thought is caught by the same test that covers the ones written today.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module reads `navigator` and `DOMException`; Node 22 has the latter and not the former.
(globalThis as { navigator?: unknown }).navigator ??= { onLine: true };
(globalThis as { window?: unknown }).window ??= { localStorage: { getItem: () => null, setItem: () => undefined } };

const { ApiError } = await import('../src/online.ts');
const { WalletTimeoutError, WalletUnavailableError } = await import('../src/wallet.ts');
const { SignatureDeclinedError, SignatureShapeError } = await import('@scoresheet/core');
const { explainFailure, looksOffline } = await import('../src/failures.ts');

/** Every case this module is expected to meet, so the invariants below can sweep all of them. */
const CASES: [string, unknown][] = [
  ['a declined signature', new SignatureDeclinedError()],
  ['a cancelled share sheet', new DOMException('cancelled', 'AbortError')],
  ['no wallet at all', new WalletUnavailableError('Signing happens in the Nimiq Pay app.')],
  ['a wallet that never answered', new WalletTimeoutError('Nimiq Pay did not answer.')],
  ['a signature of the wrong shape', new SignatureShapeError('bad shape', 'nonsense')],
  ['an offline request', new ApiError('Could not reach the game.', 'offline', 0)],
  ['a game that expired', new ApiError('No such game', 'no-game', 404)],
  ['a full game', new ApiError('This game already has two players', 'game-full', 409)],
  ['a move out of turn', new ApiError('Not your move', 'not-your-turn', 409)],
  ['a stale move', new ApiError('The game moved on', 'stale', 409)],
  ['a server fault', new ApiError('Something went wrong on our side.', 'server-error', 500)],
  ['too many requests', new ApiError('Slow down', 'too-many', 429)],
  ['a code this version has never seen', new ApiError('Some new thing', 'invented-later', 418)],
  ['storage that refuses to be written', new DOMException('quota', 'QuotaExceededError')],
  ['storage blocked by the browser', new DOMException('blocked', 'SecurityError')],
  ['a permission the browser refused', new DOMException('no', 'NotAllowedError')],
  ['a network that dropped', new TypeError('Failed to fetch')],
  ['a network that dropped, in Safari', new TypeError('Load failed')],
  ['a chunk that would not load', new Error('Failed to fetch dynamically imported module: /assets/x.js')],
  ['a wallet still syncing', new Error('consensus not established')],
  ['an error nobody predicted', new Error('the flux capacitor is unhappy')],
  ['something that is not an error at all', 'a bare string'],
  ['null', null],
  ['undefined', undefined],
  ['a plain object', { message: 'not an Error' }],
];

/* ------------------------------------------------------------------ the invariants */

test('⭐ every failure produces a complete sentence, and never a code', () => {
  for (const [name, error] of CASES) {
    const { message, tone } = explainFailure(error);
    assert.ok(message.length > 12, `${name}: too short to be a sentence — ${message}`);
    assert.match(message, /[.!?]$/, `${name}: not a sentence — ${message}`);
    assert.ok(tone === 'calm' || tone === 'bad', `${name}: bad tone`);
  }
});

test('⭐ nothing internal ever reaches the screen', () => {
  /*
   * The failure this whole module exists to prevent. A person sees "TypeError: Failed to fetch" and
   * concludes the app is broken; they are told "your device could not reach the network" and
   * conclude they should try again in a minute. The second is also true.
   */
  const leaks = [
    /TypeError/,
    /DOMException/,
    /\bat .*\.ts:\d+/,
    /QuotaExceededError|AbortError|SecurityError|NotAllowedError/,
    /\bundefined\b|\bnull\b|\[object/,
    // Error *codes* are for branching in code, never for reading.
    /\bno-game\b|\bgame-full\b|\bnot-your-turn\b|\bserver-error\b/,
  ];
  for (const [name, error] of CASES) {
    const { message } = explainFailure(error);
    for (const leak of leaks) {
      assert.doesNotMatch(message, leak, `${name} leaked something internal: ${message}`);
    }
  }
});

test('⭐ a choice is never reported as a failure', () => {
  // Declining a wallet dialog and cancelling a share sheet are things somebody did on purpose.
  // Colouring them as errors teaches people to distrust the colour.
  for (const error of [new SignatureDeclinedError(), new DOMException('x', 'AbortError')]) {
    assert.equal(explainFailure(error).tone, 'calm');
  }
});

test('most failures are calm, because most of them are normal', () => {
  // If nearly everything reads as alarming, nothing does. A network drop, an expired link and a
  // full game are ordinary events in the life of a link somebody sent by message.
  const calm = CASES.filter(([, error]) => explainFailure(error).tone === 'calm').length;
  assert.ok(calm > CASES.length / 2, `only ${calm} of ${CASES.length} were calm`);
});

/* ------------------------------------------------------------------ specific answers */

test('a network drop says nothing was lost, because nothing was', () => {
  const { message, tone } = explainFailure(new TypeError('Failed to fetch'));
  assert.match(message, /nothing was lost/i);
  assert.equal(tone, 'calm');
});

test('a server fault says the game is safe, because it is on the server', () => {
  const { message, tone } = explainFailure(new ApiError('x', 'server-error', 500));
  assert.match(message, /safe/i);
  assert.equal(tone, 'bad', 'this one we would want to hear about');
});

test('⭐ an unknown server code still says something useful', () => {
  // The server will grow codes this version has never heard of. Falling through to its own sentence
  // is worse than a written one and far better than "an error occurred".
  const { message } = explainFailure(new ApiError('The tournament has not started.', 'invented-later', 409));
  assert.equal(message, 'The tournament has not started.');
  // And a fragment is finished into a sentence rather than passed through half-said.
  assert.equal(explainFailure(new ApiError('Some new thing', 'invented-later', 409)).message, 'Some new thing.');
});

test('an unrecognised error is quoted rather than guessed at', () => {
  /*
   * A wrong guess about an unfamiliar error sends somebody looking in the wrong place and hides the
   * only clue anybody had. Quoting it, and saying whose words they are, is the honest answer.
   */
  const { message } = explainFailure(new Error('the flux capacitor is unhappy'));
  assert.match(message, /flux capacitor/);
});

test('a failed chunk tells the person the one thing that fixes it', () => {
  const { message } = explainFailure(new Error('Failed to fetch dynamically imported module: /assets/x.js'));
  assert.match(message, /reload/i);
});

test('blocked storage says the app still works, which is the part that matters', () => {
  const { message, tone } = explainFailure(new DOMException('nope', 'SecurityError'));
  assert.match(message, /still works/i);
  assert.equal(tone, 'calm');
});

/* ------------------------------------------------------------------ being offline */

test('looksOffline reads the browser, and is only ever advisory', () => {
  const navigatorRef = globalThis.navigator as { onLine: boolean };
  navigatorRef.onLine = false;
  assert.equal(looksOffline(), true);
  navigatorRef.onLine = true;
  assert.equal(looksOffline(), false);
});
