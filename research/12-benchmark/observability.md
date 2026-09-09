# Product observability without a tracking vendor

Research date: 2026-09-08. Scope: how this product measures its own operational health — game success
rate, wallet-prompt success rate, transaction confirmation latency, review latency, puzzle-generation
discard rate, server latency, mobile load time, tournament failure rate, anti-cheat false-positive
rate — with no analytics vendor and no tracking SDK. Grounded in `research/00-current/inventory.md`,
`research/11-testing/*.md`, `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`'s Device Identifier and WebView sections,
and this session's own reads of `apps/web/src/wallet.ts`, `online.ts`, `analysis-worker.ts`,
`packages/server/src/pool.ts`, and `apps/web/index.html` (confirmed clean: one `<script
type="module" src="/src/main.ts">` tag, no third-party script, no analytics call anywhere in
`apps/web/src` — grepped directly this session for Sentry/Segment/GA/GTM/Mixpanel/Amplitude/PostHog/
Plausible/Umami/Hotjar/FullStory/Clarity, zero matches). External research this session covered the
actual W3C/WICG Performance APIs available in a mobile WebView and the legal/competitive reasoning for
staying vendor-free.

## 1. What they do

**The competition's own stated reason for reweighting Cycle 2 scoring is exactly this product's own
premise.** Quoted verbatim from the primary source already in this repo's research tree
(`SIP_AND_SHIP_C2_CALL2_FINDINGS.md`, the organiser speaking): *"There were a lot of mini apps that
looked good but they didn't work. They are incredibly buggy. They didn't really provide value that
they claim to — but because Claude and all these AI tools are so great at helping make designs and
vibe coding these mini apps, they looked great."* A second, independently confirmed instance from Call
#1: a Nimiq engineer's own admission that a Mini-App-initiated transaction can sit at "waiting for
consensus" in Nimiq Pay while the chain has already confirmed it, with the explicit design consequence
stated by the organiser: *"never block your UI on Nimiq Pay's own confirmation state"*
(`SIP_AND_SHIP_C2_CALL1_FINDINGS.md`, quoted in full in `research/11-testing/`'s own context reading).
Both are primary-source, not inferred.

**Nimiq's own Device Identifier API** (`@nimiq/mini-app-sdk`'s `requestDeviceIdentifier`,
`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §6, itself sourced from `nimiq.dev`) is the one host-provided
mechanism actually designed for this class of problem: a 64-character SHA-256 string scoped to
`(device, origin)`, **explicitly not a user identity** — *"a shared device returns the same value to
every user; the same user on two devices gets two different values. For real user identity, use
`listAccounts()` instead"* — gated behind a **consent prompt showing the calling app's own literal
`reason` string** on first call per origin, silent thereafter. Its named uses in Nimiq's own docs are
*"leaderboards, anti-spam, save slots"* — this project already uses it for exactly one of those
(`packages/server/src/pool.ts`'s one-claim-per-device-per-day limit, `money-and-mobile.md` §1),
never for analytics.

**Usage/growth is already someone else's job here, which changes what this file needs to do.**
`SPEC.md` §Q3 ("The usage number is small, and that changes the campaign," read directly this session)
states plainly that Cycle 2's *marketing* usage score is measured by **"Nimiq's own Pay telemetry"** —
distinct wallet counts, counted by the host, not by anything this app instruments itself; the
organiser's own bands run 0–3 wallets (0 points) to 25+ (full marks). This means the
observability this file designs is deliberately **not** a growth-analytics system — that number is
already collected, by Nimiq, outside this app's control — and can stay narrowly scoped to product
*health*: does the thing work, for the people already using it.

**What a Mini App's own hosting environment actually requires, technically**
(`NIMIQ_DEV_DOCS_FULL_REFERENCE.md`, §§ on CORS and local dev, both direct quotes from `nimiq.dev`):
*"the backend must include the mini app's origin in its `Access-Control-Allow-Origin` response
header"*, and — the gotcha this project's own beacon design has to respect — *"the mini app runs in
Nimiq Pay on a phone, so `localhost` from inside the WebView resolves to the phone, not the dev
machine."* Any same-origin metrics endpoint this file recommends inherits both constraints unchanged.

**What the competition's own privacy policy actually says**, fetched live this session
(`https://miniappscompetition.com/privacy`): the *competition site itself* runs Google Tag Manager, Google
Analytics 4, and Meta/TikTok/Reddit/X marketing pixels for registration and sign-up events, sending a
SHA-256-hashed email plus IP and user-agent to Meta and TikTok as joint controllers. **The policy
contains no mention of data collection from Mini App users at all — only from competition
registrants.** This is a genuinely useful negative finding: there is no explicit competition rule
requiring or forbidding analytics inside a submitted Mini App; the "no tracking SDK" constraint on this
product is a deliberate design choice by this project, not a rule imposed from outside, and should be
described honestly as such rather than attributed to Nimiq or the competition.

**Nimiq's own corporate site is not privacy-first either**, fetched live this session via its own
published privacy policy (`https://nimiq.com/privacy-policy` → `https://iubenda.com/privacy-policy/78537710`): it
names **Matomo, Google Analytics 4, and Google Tag Manager** as active trackers, with no privacy-first
or no-tracking claim anywhere in the policy. Nimiq's homepage marketing (checked live this session)
frames itself around financial independence — *"gives independence back to you"* — not data privacy.
**This project's zero-tracking design is not inherited from Nimiq's own practice; it is this project's
own, stronger standard.**

## 2. Why it works

A consent-gated, per-`(device, origin)`, non-cross-app-correlatable identifier (Device Identifier)
works as an anti-abuse key precisely because it is not built to be portable across contexts — the same
device gets a different value in a different Mini App, so no third party assembling data from many
Mini Apps can stitch a cross-app profile from it the way a shared analytics SDK's device ID would let
them. Its documented reason-string consent prompt is a narrow, honest transaction: the user is told,
in the calling app's own words, exactly what the identifier is for, once.

A same-origin metrics endpoint on the app's own server works for the same reason a public certificate
page works (`SPEC.md` Part F): nothing leaves the trust boundary the user already accepted the moment
they opened the app — no fourth party (an analytics vendor) that the user never agreed to and that the
app's own privacy story would then have to explain.

Never blocking the UI on Nimiq Pay's own confirmation state (the organiser's own stated fix, §1) works
because it decouples "is the transaction actually done" (checkable against the chain, or this app's own
server) from "does the host's UI currently believe it is done" (a known, admitted source of
false-looking failures that have nothing to do with this app's own code) — precisely the trap a judge
following the app naively would fall into and blame the app for.

Aggregate counters (not per-event logs) work because the questions this file's nine dimensions actually
need answered — a rate, a percentile, a discard ratio — are all computable from running totals, and a
running total structurally cannot be de-anonymized after the fact the way an event stream with
timestamps and identifiers can.

## 3. What they do badly

The industry default (Google Analytics, Sentry, Mixpanel-class tools) collects far more than any of
this file's nine questions need — IP address, precise timestamps, device fingerprints, full session
replays in some cases — creating a liability surface (a breach, a subpoena, a vendor policy change)
in exchange for answering questions this product does not actually have. The competition's own site
(§1) is a live example of exactly that overcollection, immediately adjacent to a policy that is
completely silent on what a *submitted app* should do — silence that is easy to misread as permission
by default rather than as a genuine absence of a rule either way.

Vendor-SDK analytics inside a **wallet-hosted WebView** is a materially worse trade than the same SDK
on an ordinary website: the WebView sits one `window.nimiq` call away from a signing flow, and a
third-party script with network access anywhere on the same page has a strictly larger blast radius
than the same script on a page with no wallet adjacent to it at all — a risk ordinary web analytics
guidance does not usually have to price in, because ordinary websites are not one JavaScript context
away from a signature the user is about to make.

Reusing a consent mechanism for something the user was not told about is a real, specific anti-pattern
this research flags explicitly: the Device Identifier's consent prompt shows **the calling app's own
literal `reason` string**, and Nimiq's own docs name its intended uses as leaderboards/anti-spam/save
slots — quietly repurposing an already-granted "for the daily leaderboard" consent to *also* power an
observability beacon, without a second, honest reason string, would be a bait-and-switch on the user's
consent even though no law would obviously be broken. **This project should never do this**, and this
file's design (§6) deliberately keeps observability data in its own beacon, entirely separate from any
Device Identifier call.

## 4. What we should copy conceptually

- **Decouple "is it actually true" from "does the host's UI say so"** — the organiser's own explicit
  fix for the transaction-confirmation-instability bug (§1) — and apply the same discipline to every
  one of this file's latency dimensions: measure against this app's own server or the chain, never
  against Nimiq Pay's transient UI state.
- **A consent-gated, narrowly-scoped, non-cross-app-portable identifier, used for exactly the purpose
  its consent prompt names** — the Device Identifier's own design — as the template for how *any*
  future per-device signal in this app should work, even though observability itself (§6) is designed
  to need no identifier at all.
- **Same-origin only, ever** — both because the CORS/localhost realities of the WebView (§1) already
  force this technically, and because it is the simplest privacy story this product can tell: nothing
  about how a game was played, reviewed, or paid for ever leaves the origin the user is already
  inside.
- **Publish the honest number, not just a dashboard only the team sees** — this project's own existing
  pattern (the public record page, the certificate page, `scripts/counts.mjs`/`design-metrics.mjs`
  cross-checking `README.md`'s own claimed numbers) extends naturally to operational health: a public
  `/status`-style summary is the same idea applied to "does it work" instead of "is the rating
  correct."

## 5. What we can do better

Publish the aggregate operational numbers themselves, publicly, on the same site — not a private
Grafana board only the team sees, but a page any judge or player can open, the same way the record and
certificate pages already are. This is a direct, low-cost answer to the exact complaint the organiser
named (§1, *"looked good but didn't work"*): instead of asserting the app works, show the measured rate
at which it actually completes its own core actions, in public, continuously, and let anyone check it —
no competitor in the Mini App catalog (`research/08-nimiq/catalog-teardown.md`) does this for any of
its own five other integrations, let alone as a standing page.

Treat the Device Identifier and the observability beacon as **two structurally separate namespaces**
even though both are technically anonymous — never let the same per-device value appear in both the
pool's abuse-limit store and an observability aggregate, because even two anonymous datasets can become
identifying once joined (this is precisely the GDPR "means reasonably likely to be used... taking into
consideration the available technology" identifiability test, Recital 26, cited in full in §6) —
something none of the industry tools surveyed for `scoresheet-benchmark.md` had any reason to warn
against, since they are not built for a wallet-hosted context at all.

## 6. What is technically required

### Where the number comes from, whether it identifies anyone, what it must never record, how it's surfaced

**1. Game success rate.** Source: an in-process counter inside `packages/server/src/live.ts`'s own
state machine — increment `games_started` / `games_completed` (checkmate, resign, draw, time-claim) /
`games_stuck` (no update for a large fixed window, e.g. 24h, never reaching a terminal state).
Anonymous by construction: a count keyed by outcome bucket and a coarse day bucket, never by `gameId`
or wallet. Must never record: either player's address, opponent identity, move content, IP. Surfaced:
a same-origin aggregate endpoint and a public `/status`-style summary, e.g. *"this week: 412 games
started, 391 completed cleanly (94.9%)."*

**2. Wallet-prompt success rate.** Source: `apps/web/src/wallet.ts`'s own existing single unwrap
chokepoint (`money-and-mobile.md` §1 already documents this as the one place every provider call is
normalized) — increment per-outcome counters against the typed taxonomy already in the code
(`SignatureDeclinedError`, `WalletTimeoutError`, `WalletUnavailableError`, plain success), batched
per session and sent once via `navigator.sendBeacon` to the app's own same-origin endpoint. Anonymous:
yes, if the beacon carries only `{sign: {ok, declined, timeout, unavailable}}`-shaped counts with no
wallet address, no Device Identifier, no raw provider error text (raw error strings risk leaking
provider-internal detail the taxonomy already exists specifically to avoid exposing to the user, per
`wallet.ts`'s own doc comment reasoning quoted in `money-and-mobile.md` §2). Must never record: wallet
address, Device Identifier (kept in a separate namespace per §5), IP, precise timestamp finer than a
day bucket. Surfaced: same aggregate endpoint/status page, e.g. *"sign(): 97.1% resolved, 2.1%
declined, 0.6% timed out, 0.2% no provider, N=1,842 this week."*

**3. Transaction confirmation latency.** Source: client-side timer from a `sign()`/send call resolving
to this app's **own** read-path observing it (balance change, or the app's own polled game state) —
never Nimiq Pay's own transient confirmation UI (§1/§4). Reported as a histogram bucket
(`<2s`/`2–10s`/`10–30s`/`>30s`), not a raw per-transaction timestamp. Anonymous: yes, once bucketed —
the underlying transaction hash is already public on-chain by design (`SPEC.md` P2, "every payout memo
is itself the audit trail"), which is a *feature* for someone auditing one specific game, but the
aggregate latency store must stay structurally unlinked from any specific hash or address so it cannot
become a second, private wallet-activity log sitting next to the public one. Must never record: hash-
to-address linkage inside the aggregate metrics store. Surfaced: *"confirmation latency this week: p50
4.2s, p95 28s, N=134."*

**4. Review latency.** Source: `apps/web/src/analysis-worker.ts`'s existing progress-callback flow
(`inventory.md` §3) — wrap it in `performance.now()` at start/end, report `{plyCountBucket,
durationMs}` via the same batched beacon. Purely computational, never touches identity or content —
the single least privacy-sensitive dimension in this file by construction. Must never record: the
actual moves/positions reviewed in the same beacon (keep the payload to the bucket and the duration).
Surfaced: *"Game Review: median 9.8s for a 40-ply game, p95 22s."*

**5. Puzzle-generation discard rate.** Source: the existing Train-mode rating-seeking search
(`inventory.md` §4's widening `100→200→400→800→∞` window) — increment a widen-count on every selection
that needs more than one widening step, and a separate empty-result counter, reported as an aggregate
rate. Anonymous: yes, trivially — this never needs to know which puzzle or which device. Must never
record: which specific puzzle IDs were served to which device (that would silently reconstruct a
per-device behavioural trail even without a name attached to it) — only the widen-count distribution.
Surfaced: aggregate rate; doubles as a genuine content-planning signal (are the 12 theme filters too
narrow for the current 5,000-puzzle set), not only an ops metric.

**6. Server latency.** Source: `packages/server`'s own request-handler timing (`performance.now()`
around each route), aggregated in-process into a rolling histogram per route. This is infrastructure
telemetry, not user behaviour — it never touches identity by construction, and is the one dimension in
this file that would be identical in design on a product with no wallet at all. Must never record: the
IP address, User-Agent, or request body content in the **same** aggregate structure — a separate,
short-retention incident-response log is a normal, narrower operational practice and should be
documented as explicitly distinct from this aggregate, not conflated with it; "no analytics vendor"
does not mean "no server logs," it means no third-party behavioural tracking. Surfaced: a plain
metrics line the operator scrapes, or folded into the same public `/status` page as p50/p95 per route.

**7. Mobile load time.** Source: the actual W3C/WICG Performance APIs, read directly with no
third-party library — see the dedicated browser-support findings below. Reported as histogram buckets
by a coarse platform tag (`ios-webview` / `android-webview` / `desktop-dev`), via the same batched
beacon. Must never record: a detailed User-Agent string or any other high-entropy device signal
alongside timing and even a coarse IP-derived region in the same beacon — the GDPR identifiability test
(Recital 26, quoted below) is explicit that *combinations* of otherwise-innocuous signals are exactly
what turns "anonymous" into "reasonably likely to be identifying." Surfaced: aggregate dashboard/status
page, split by the coarse platform bucket — also the one metric a competition judge would plausibly
want to see directly, since "does it load fast inside the real WebView" is exactly the class of
"does it actually work" evidence the organiser said was missing (§1).

**8. Tournament failure rate.** Source: the same server-side aggregate-counter pattern as dimension 1
(started/completed/stuck), applied to tournament rounds and pairings once the feature exists.
**Currently not applicable** — tournaments are explicitly CUT for v1 (`scoresheet-benchmark.md` §6
dimension 8 establishes this in full; not re-derived here). Designed forward, honestly, with nothing
running today.

**9. Anti-cheat false-positive rate.** Source: this is a live-operations counter over the flag records
themselves — `{flags_raised, flags_reviewed, flags_confirmed}` — which needs **no new user data
collection at all**, because `adversarial.md` §8's own design already makes a flag a **public,
timestamped, non-punitive annotation on the certificate** rather than a private accusation. The
counters are a byproduct of a feature that is already public by design. Must never record: any
per-player detail in the aggregate ops view beyond what that player's own public certificate already
shows — building a private shadow list of flagged players, even an "anonymous" one, would directly
contradict this project's own transparency thesis (`adversarial.md` §8). Currently not measurable: the
underlying feature does not exist yet (`adversarial.md` §5–§6, no per-move timing storage, no evenness
metric) — same precondition gap `scoresheet-benchmark.md` dimension 5 already establishes.

### The Web Performance APIs actually available in the WebView — verified this session against MDN's own compat-data source, not memory

Fetched directly from `https://github.com/mdn/browser-compat-data` (the same machine-readable JSON MDN's own compat tables
and caniuse are generated from — a primary, current source, not a blog post):

| API | Safari desktop | Safari iOS / WKWebView | Chrome Android / WebView |
|---|---|---|---|
| `PerformanceObserver` (base) | 11+ | mirrors desktop → 11+ | supported (mirrors Chrome) |
| `PerformanceNavigationTiming` (Nav Timing L2) | 15+ | **15.1+** | supported |
| `PerformanceLongTaskTiming` (Long Tasks) | **`false` — not implemented** | **not implemented** | supported (Chrome 58+) |
| `LayoutShift` (drives CLS) | **`false` — not implemented** | **not implemented** | supported (Chrome 77+) |
| `LargestContentfulPaint` | **26.2** (very recent) | mirrors desktop | supported (Chrome 77+) |
| `PerformanceEventTiming` (drives INP) | **26.2** (very recent) | mirrors desktop | supported (Chrome 76+) |

Sources, fetched this session: `https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/
{PerformanceObserver,PerformanceNavigationTiming,PerformanceLongTaskTiming,LayoutShift,
LargestContentfulPaint,PerformanceEventTiming}.json`. The `web-vitals` library's own README (fetched
in full this session, `https://raw.githubusercontent.com/GoogleChrome/web-vitals/main/README.md`) independently
corroborates the shape of this table: *"`onCLS()`: Chromium [only]... `onFCP()`/`onINP()`/`onLCP()`/
`onTTFB()`: Chromium, Firefox, Safari."*

What this means concretely for this app, running inside a wallet's iOS WebView (WKWebView, which shares
WebKit's engine and feature set with Safari — the BCD data above shows `safari_ios`/`webview_ios`
mirroring desktop Safari in every row checked):

- **Navigation Timing (TTFB, DOM timings) works fine today**, on both platforms, and is the safe
  foundation for dimension 7 — Safari has had it since version 15.1 (late 2021).
- **Long Tasks and Layout Shift (CLS) are simply unavailable on iOS, full stop**, with no version
  number to wait for in Safari's own compat data — main-thread-blocking-time and layout-stability
  metrics can only ever be measured on the Android/Chromium side of this app's real audience.
- **LCP and Event Timing (which INP depends on) landed in Safari only very recently (version 26.2)** —
  both rows show the identical version number, which is itself informative: WebKit shipped them
  together. Given how recent that is, **most real iOS devices in the field, at any point in the near
  term, should be assumed not to have it yet** — a reasoned inference from the recency of the version
  number, not a verified adoption-share statistic; flagged as such rather than stated as fact.

**The recommended design adds zero runtime dependency**, per this task's own stated preference: read
`performance.getEntriesByType('navigation')` and a feature-detected `PerformanceObserver` for
`longtask`/`layout-shift`/`largest-contentful-paint`/`event` directly, wrapped in the same
try/gracefully-skip pattern this project already uses everywhere a host API might be absent
(`wallet.ts`'s optional-chaining discipline, `inventory.md` §7). `web-vitals` itself is a legitimate,
low-cost alternative if attribution-quality metrics (which specific element caused a bad LCP, etc.)
are ever wanted — **Apache-2.0, confirmed by fetching its own `LICENSE` file directly this session**,
and genuinely tiny (~3KB brotli'd, per its own README) — but it is a dependency this app does not need
yet to answer the nine questions in this file, and this project's own established pattern is to read
the browser's own API directly rather than take a wrapper dependency for something `PerformanceObserver`
already exposes natively (`design-metrics.mjs` reads `styles.css` directly rather than depending on a
CSS-parsing library; `strength.mjs` reads the bundled puzzle data directly; the same instinct applies
here).

### The privacy-law grounding, checked rather than assumed

**Is a wallet-linked identifier "personal data"?** Fetched directly from CNIL (France's data-protection
authority)'s own published blockchain/GDPR guidance this session: *"each participant... has a public
key, ensuring identification of the issuer and receiver of a transaction"* and *"if such data concerns
natural persons... who may be directly or indirectly identified, such data is considered personal
data."* **A wallet address is treated as personal data by at least one EU regulator when it can
identify a natural person** — which is exactly why this file's design (above) keeps every dimension's
aggregate store structurally unlinked from any wallet address, Device Identifier, or transaction hash,
even though none of those individually needs to be collected to answer any of the nine questions.

**What makes an otherwise-anonymous signal count as identifying anyway?** GDPR Recital 26, fetched
directly this session (`https://gdpr-info.eu/recitals/no-26/`): *"To determine whether a natural person is
identifiable, account should be taken of all the means reasonably likely to be used... taking into
consideration the available technology at the time of the processing."* This is the exact reasoning
behind §5's warning against joining the Device Identifier namespace with the observability namespace,
and behind §6 dimension 7's warning against pairing a detailed User-Agent string with timing data in
the same beacon — the individual fields need not identify anyone; the combination might, and the test
is explicitly about what is "reasonably likely," not only what is deliberately intended.

## 7. What could break

**The transaction-confirmation-instability bug is a known, admitted host-side issue, not something
this app's own metrics can fix** (§1) — a naive confirmation-latency dimension that trusts Nimiq Pay's
own UI state will measure the host's bug, not this app's own reliability, and will look like a
regression on a day Nimiq ships a hard fork, exactly as the organiser described happening around the
Cycle 2 delay. The dimension in §6 is deliberately designed against this by measuring against this
app's own read path, but the discipline has to be enforced everywhere a transaction status is shown to
a user, not only in the metrics code.

**A batched, `sendBeacon`-based client metric is lossy by design** — a session that crashes or is
killed before the beacon fires reports nothing, which biases every client-side dimension (2, 3, 4, 7)
toward sessions that completed normally. This is a real, standing caveat that should be stated on the
public status page itself, not hidden: the published rates are a lower bound on how often things go
wrong, not an exact count, because the worst failures are exactly the ones least likely to get a chance
to report themselves.

**Safari's very recent LCP/Event-Timing support (§6) means dimension 7's iOS numbers will be sparse or
absent for a real stretch of time**, purely because the API was not there to call — a low sample count
on iOS should not be read as "iOS performs well," only as "iOS could not report."

**Aggregation itself can leak information at small N.** A same-origin, identifier-free counter is safe
in the general case, but a bucket with a count of 1 (e.g. "1 game started in Uzbekistan this week," if
a region bucket were ever added) can become identifying by elimination even with zero explicit
identifiers in it — any future geography/platform breakdown needs a minimum-count suppression rule
(a floor below which a bucket is folded into "other" rather than shown), which nothing in §6's current
design needs yet because no dimension proposed here buckets by anything finer than a coarse platform
tag, but which must be re-checked before any finer breakdown is ever added.

**A same-origin endpoint is still a real endpoint** — it needs the same CORS header discipline
(`Access-Control-Allow-Origin` set to the Mini App's own origin, per §1) and the same localhost-vs-LAN-
IP care during local development that every other backend call in this app already needs
(`NIMIQ_DEV_DOCS_FULL_REFERENCE.md`), or the beacon silently fails in dev without anyone noticing —
worth a specific dev-mode console warning rather than a silent swallow.

## 8. What we can uniquely do because of Nimiq

Every one of this file's nine dimensions can be surfaced on the same public, no-login page as the
rating-recompute certificate — turning "trust us, it works" into "here is the measured rate, updated
continuously, on the same page that already proves the rating is real." No other Mini App in the
catalog, and neither Chess.com nor Lichess for their own respective products, publishes a live
operational-health page next to a cryptographically-verifiable record; doing both on one surface is a
combination unique to a product that already had to build the recompute page for an unrelated reason
(the rating).

Because dimension 9 (anti-cheat) is designed, per `adversarial.md` §8, as a public annotation on the
certificate rather than a private accusation, its own aggregate counters cost this product **nothing
new to collect** — the transparency the rating system already committed to for an unrelated reason
(recomputability) turns out to also be the cheapest possible anti-cheat-observability design, which is
not a coincidence available to a competitor whose fair-play system is a private, account-based black
box by construction (`adversarial.md` §3).

Because usage/growth telemetry is already Nimiq's own job (§1, the Pay-telemetry wallet count that
scores Cycle 2's marketing criterion), this product is free to spend its entire observability budget on
*health* rather than *acquisition* — a genuine structural advantage over a typical consumer web product,
which usually has to build both, often from the same vendor SDK this file is explicitly avoiding.

## 9. Licence and reuse verdict

- **`web-vitals` — Apache-2.0**, confirmed by fetching its own `LICENSE` file directly this session
  (`Copyright 2020 Google LLC`, standard Apache-2.0 text). Safe to add later if attribution-quality
  metrics are wanted; not recommended now, per §6, because the native `PerformanceObserver`/Navigation
  Timing APIs it wraps are directly usable with zero added dependency for every metric this file
  actually needs.
- **Navigation Timing, Performance Timeline (`PerformanceObserver`), Long Tasks, Layout Instability,
  Largest Contentful Paint, and Event Timing** are all W3C/WICG-specified browser APIs, not
  copyrightable subject matter — free to read and implement against directly, the same reasoning
  `chess-correctness.md` §9 already applies to perft numbers and `review-quality.md` §9 applies to PGN
  NAG glyphs.
- **GDPR (Regulation (EU) 2016/679) and CNIL's blockchain guidance** are legal sources, cited here as
  fact and reasoning, not as code — Article 4(1)/4(5) and Recital 26 quoted directly this session from
  `https://gdpr-info.eu/art-4-gdpr/`; CNIL's public-key-as-personal-data guidance quoted directly this session from
  `https://www.cnil.fr/en/blockchain-and-gdpr-solutions-responsible-use-blockchain-context-personal-data`. Nothing here constitutes legal advice; this is engineering-facing risk reasoning grounded
  in a regulator's own published position, not a compliance sign-off.
- **The competition's own privacy policy (`https://miniappscompetition.com/privacy`) and Nimiq's own corporate
  privacy policy** (`https://iubenda.com/privacy-policy/78537710`, linked from `https://nimiq.com/privacy-policy`) are
  cited as factual sources for what each currently discloses, fetched live this session — not as
  binding rules on this product, and explicitly not evidence that Nimiq requires or models a
  tracking-free approach itself (§1 states this distinction directly).
- **Nothing in this file recommends adding any third-party network call.** Every dimension in §6 is
  designed against this project's own server and this project's own client code, following the same
  self-written-script convention `scoresheet-benchmark.md` §4 already establishes for the benchmark
  side of this same design.
