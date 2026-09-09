# Money and mobile — the Nimiq failure matrix and the mobile testing matrix

Research date: 2026-09-08. Scope: two matrices, each as concrete tests, checked against what
`apps/web/src/wallet.ts`, `apps/web/src/send-nim.ts`, `packages/server/src/pool.ts`,
`packages/server/src/nimiq-payout.ts`, `packages/server/src/staking.ts`,
`apps/web/src/demo-wallet.ts` and `scripts/look.mjs` already do — this project has unusually mature
handling already built (a typed `WalletTimeoutError`/`WalletUnavailableError`/
`SignatureDeclinedError` hierarchy, a resolved-`{error}`-vs-thrown unwrapper, a triple-limited pool),
so the useful research question is which specific failure states are actually **tested**, not
whether the product theoretically handles them.

## 1. What they do

**This project's own client wallet layer** already distinguishes, in code: a declined signature
(`SignatureDeclinedError`, read as a choice, never a failure), a provider that never responds
(`WalletTimeoutError`, every call bounded — `sign()` at 120s, `isConsensusEstablished()` at 5s,
`getBlockNumber()` at 10s, `requestDeviceIdentifier()` at 60s), a provider absent entirely
(`WalletUnavailableError`), and the documented fact that `sign()`/`listAccounts()` can **resolve**
with `{error: {type, message}}` as well as reject — both paths are unwrapped through one function
(`apps/web/src/wallet.ts`).

**This project's own pool layer** already enforces, in code: one claim per wallet per puzzle-day, one
claim per device per puzzle-day (via the Device Identifier API, an anonymous per-device handle, not
an identity), and a hard daily luna ceiling nothing can exceed regardless of the first two limits
(`packages/server/src/pool.ts` header comment and `Claim`/`ClaimStore` types). Every payout memo
carries the puzzle id, so the entire payout history is auditable by a stranger with nothing but a
block explorer (`packages/server/src/pool.ts`, `memoFor`).

**Playwright's device and network emulation** (v1.63, the version pinned in `apps/web/package.json`):
device descriptors (`playwright.devices['iPhone 15']` etc.) set viewport, `deviceScaleFactor`,
`isMobile`, `hasTouch` and `userAgent` together, where `isMobile` is Chromium-only and enables the
mobile viewport-meta and touch event model. Source:
https://github.com/microsoft/playwright/blob/main/docs/src/emulation.md. CPU throttling
(`Emulation.setCPUThrottlingRate` via CDP) is also **Chromium-only** — there is no equivalent for
WebKit or Firefox in Playwright's API. Source: https://github.com/microsoft/playwright/issues/29155
(corroborated by #19173, #19696). `context.setOffline(true/false)` toggles a context fully offline;
deeper throttling (latency, throughput, packet loss) is CDP-based and layers context-over-browser-
over-page. Source: https://github.com/microsoft/playwright/issues/32618.

## 2. Why it works

The typed-error approach (`WalletTimeoutError` etc.) works because it turns "the provider did
something weird" into a small, closed set of named states a UI can render a specific sentence for,
rather than a raw caught exception whose message has to be pattern-matched after the fact — which is
precisely the trap `wallet.ts`'s own doc comment names for `consensusEstablished()`: without that
check, a wallet still syncing "waits through a two-minute timeout and then gets a message inferred by
matching words in whatever error text came back — a guess about a failure that could have been
predicted for free."

The triple-limited pool (address + device + daily ceiling) works because no single limit is
sufficient alone: an address-only limit is defeated by generating fresh wallets for free
(`pool.test.ts`: "a thousand fresh wallets from one device get one payout between them" is exactly
this defence being tested), and a device-only limit is defeated by anyone willing to reinstall or
spoof a device identifier — the daily ceiling is the backstop that holds even if both are defeated.

Device descriptors work for the *layout and interaction* class of mobile bug because they set the
signals real CSS and JS feature-detection actually key off (viewport, touch capability, UA sniffing)
— which is why this project's own `scripts/look.mjs` already runs the overwhelming majority of its
472 browser checks at a fixed `390×844` viewport with `deviceScaleFactor: 2, hasTouch: true`.

## 3. What they do badly

Playwright cannot fire a real Page Visibility API transition. `document.hidden` stays `false` and
`visibilitychange` never fires under Playwright's control even though the same page shows the correct
behaviour in a manually-opened browser — confirmed by multiple long-open Playwright issues. Source:
https://github.com/microsoft/playwright/issues/12099, #22634, #2286. This means "does polling pause
when the phone is locked or the tab is backgrounded" cannot be verified through real OS-level
backgrounding at all in Playwright — only by manually firing a fake event via `page.evaluate()`,
which exercises the app's *event handler* but not the real code path that would trigger it on an
actual phone.

Playwright's bundled WebKit is **not** the browser real iPhones ship. Playwright's own documentation
states its WebKit build "doesn't work with the branded version of Safari since it relies on patches,"
and is "derived from the latest WebKit main branch sources, often before these updates are
incorporated into Apple Safari" — the gap is explicitly acknowledged by the tool's own maintainers,
not an inferred criticism. Source: https://playwright.dev/docs/browsers. A bug that only reproduces
on real Mobile Safari — which is exactly the surface this app runs inside, as a Nimiq Pay Mini App in
an in-app WebView — can pass every Playwright WebKit check and still fail for a real user.

## 4. What we should copy conceptually

- **This project's own existing patterns are already the right model to extend**, not replace: the
  typed wallet-error hierarchy, the triple pool limit, the "session consumed" pattern in
  `witness.test.ts` ("a run is witnessed once"), and the already-built offline-cold-open browser
  checks (`scripts/look.mjs`, testing that puzzle and board routes open cold and offline after a
  single prior online visit).
- **Real-device cloud testing** (BrowserStack, LambdaTest, or Sauce Labs — all explicitly market
  Playwright-driven automation against *real* iOS hardware, not emulated WebKit, as the fix for
  exactly the gap in §3; source: https://www.browserstack.com/guide/playwright-ios-automation,
  https://www.browserstack.com/guide/playwright-safari) — reserved specifically for the claim "this
  works inside Nimiq Pay's in-app WebView on a real iPhone," which is the one claim local Playwright
  cannot make good on regardless of how thorough the local suite gets.

## 5. What we can do better — the Nimiq failure matrix, item by item

Every item from the brief, checked against what is actually tested today:

| Failure | Status | Where |
|---|---|---|
| **Wallet rejection** | **Tested.** `scripts/look.mjs`: "a declined signature reads as a choice, not a failure," via `?demo=1&decline=1`, and a resolved `{error:{type:'CANCELED',...}}` path in `demo-wallet.ts` | `look.mjs`, `apps/web/src/demo-wallet.ts` |
| **Disconnect mid-transaction** | **Partially tested.** `WalletTimeoutError` exists and every provider call is bounded; no browser check found that stalls a promise past its timeout and asserts the UI shows the timeout sentence rather than a stuck "waiting" screen | `wallet.ts` has the mechanism; `look.mjs` has no test that exercises it |
| **Empty wallet** | **Gap.** There is no `getBalance` on the Nimiq provider at all (`SPEC.md` P1, confirmed absent) — a player's own `send-nim.ts` tip/contribution cannot pre-check the sender's balance client-side. No test exists for how the flow surfaces the provider's own insufficient-funds rejection | Real provider limitation; needs a test that the resulting error is unwrapped cleanly, not shown raw |
| **Delayed consensus** | **Built, undertested.** `consensusEstablished()` exists and is checked before signing; the function's own doc comment names its remaining weakness plainly ("a guess about a failure that could have been predicted for free" was the OLD failure mode this fixed — the current one still has no test pinning the exact message shown when consensus is `false`) | `wallet.ts`, `sign-game.ts` |
| **Duplicate transaction (pool claim)** | **Tested.** `pool.test.ts`: "one wallet cannot claim twice in a day"; "a send that fails does not become a second chance to be paid" | `packages/server/test/pool.test.ts` |
| **Duplicate transaction (player-initiated)** | **Gap.** `send-nim.ts` (tip / pool contribution) has no equivalent dedupe test for a double-tap firing two sends | needs a new test |
| **Replay** | **Tested**, at the scoresheet layer. `verify/scoresheet.test.ts`: "swapping the result after signing breaks both signatures"; the digest binds chain and nonce inside the signed bytes specifically because "`sign()` has no domain separation" (`SPEC.md` B2) | `keyguard-vectors.test.ts`, `verify/scoresheet.test.ts` |
| **Modified memo** | **Tested for scoresheets**, not specifically for a payout/tip memo altered after computation but before signing (`pool.ts memoFor`, `send-nim.ts tipMemo` are both pure/deterministic — a test that a tampered memo produces a different, detectable digest does not yet exist as its own case) | new test recommended |
| **Modified signature** | **Tested.** `keyguard-vectors.test.ts`: "a malformed key or signature is named separately from a wrong one"; `verify/scoresheet.test.ts`: "one signature proves nothing" | both files |
| **Wrong participant** | **Tested.** `verify/scoresheet.test.ts`: "a genuine signature from a wallet not in the game is refused" | same file |
| **Server unavailable** | **Tested for balance reads** (`nimiq-payout.test.ts`: "the balance is read, and an unreadable one is 'unknown' rather than zero," a fetch that throws `TypeError` is asserted to return `null`, never a false zero). **Gap**: no test exists for `sendRawTransaction` itself failing on a down node mid-`send()` — only the balance-read path is covered | `packages/server/test/nimiq-payout.test.ts` |
| **Double payout** | **Tested.** `pool.test.ts`: "a send that fails does not become a second chance to be paid"; "one wallet cannot claim twice in a day" | `pool.test.ts` |
| **Race conditions** | **Tested for moves** (`live.test.ts`: "two moves arriving together do not both land") **and for high-volume claims** (`pool.test.ts`: "a thousand fresh wallets from one device get one payout between them"). **Gap**: no test issues two claims from the *same* wallet via `Promise.all` to exercise a true simultaneous-arrival race, as distinct from a sequential double-claim | `live.test.ts`, `pool.test.ts` |

## 6. What is technically required

- **A fault-injectable wallet stand-in with more than one lever.** `demo-wallet.ts` currently supports
  exactly one injected failure mode, `?decline=1`. Adding `?delay=<ms>` (to exercise
  `WalletTimeoutError` paths) and `?consensus=false` (to exercise the "still syncing" UI without
  waiting for a real chain) would let `look.mjs` cover the "disconnect" and "delayed consensus" rows
  above with the same pattern already used for decline.
- **A controllable `isConsensusEstablished()` mock** that returns `false` for a configurable number of
  calls before returning `true`, for a browser check that asserts the exact sentence shown while
  waiting.
- **`Promise.all([claim(), claim()])` against the in-memory `ClaimStore`** in a `node:test` file, to
  exercise genuine concurrent-arrival races rather than only sequential double-claims.
- **A route-based latency injection test** (Playwright's `context.route()` with an added delay, or
  CDP-based network throttling) directly targeting this project's own still-open question from
  `SPEC.md` P6: "whether 500ms polling holds at blitz on a real phone network" — currently unmeasured
  and explicitly named as an open question in this project's own spec, not merely a hypothetical
  gap.

## 7. What could break

- **The per-day claim key is scoped to the server's own UTC clock** (`packages/server/src/pool.ts`
  header: "the day is the puzzle's day... not a rolling 24 hours"). A client racing two claim
  requests that straddle the exact UTC-day boundary is a genuine edge case the existing "one claim per
  day" tests do not appear to specifically target with a boundary-crossing scenario.
- **500ms polling under real mobile network conditions** is this project's own acknowledged open
  question (`SPEC.md` P6) — a good, concrete candidate for the route-based latency test in §6, since
  an untested assumption about polling cadence directly collides with the mobile-network-condition
  gap in Playwright's emulation (§3: real cellular conditions are simulated, not reproduced).
- **CPU-throttling tests cannot reach WebKit at all** (§3): if this project ever needs to verify the
  in-browser engine analysis (`packages/core/src/search.ts`, running client-side per `SPEC.md` P7:
  "the engine is ours and MIT, so the analysis ships in the bundle") stays responsive on a
  throttled-CPU phone, Playwright's Chromium-only throttling API can validate the Chromium path but
  says nothing about the WebKit/Safari path the actual Nimiq Pay iOS WebView uses.

## 8. What we can uniquely do because of Nimiq

Every payout memo is itself the audit trail (`SPEC.md` P2): a "duplicate transaction refused" or
"double payout blocked" test can assert not just that the second attempt was refused, but that **the
chain itself would show why**, since the memo makes the reason legible to a stranger holding nothing
but a block explorer. No conventional payment-testing matrix (Stripe, a card rail) can make this claim
— a refused duplicate charge there leaves no public trace of the reasoning at all, while this
project's own design means the failure-matrix tests above are, in principle, independently
re-verifiable by someone outside the project entirely, the same way the rating recompute page already
is.

## 9. Licence and reuse verdict

- **Playwright — Apache-2.0**, confirmed via `gh api repos/microsoft/playwright` (`license.spdx_id:
  Apache-2.0`). Already a direct devDependency (`apps/web/package.json`, pinned `^1.63.0`); no licence
  concern extending its use for any of the tests recommended above.
- **BrowserStack / LambdaTest / Sauce Labs** are commercial SaaS services, not code dependencies —
  no licence question, only a cost and account-setup one; use is opt-in and reserved for the specific
  real-Safari claim in §4 that local Playwright structurally cannot verify.
- **Nothing in this file recommends reusing any third-party code.** The Nimiq failure-matrix tests are
  all extensions of this project's own existing, original test files (`pool.test.ts`,
  `nimiq-payout.test.ts`, `live.test.ts`, `verify/scoresheet.test.ts`, `keyguard-vectors.test.ts`,
  `look.mjs`) and its own `demo-wallet.ts` stand-in — no external chess or payment-testing library is
  needed for any of it.
