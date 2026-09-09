# Real devices — how to actually test inside a real mobile wallet WebView

Scope: Scoresheet's own plan admits the two largest unclosed holes are that nobody has run it
inside a real Nimiq Pay WebView and no real-device testing has happened at all
(`research/11-testing/money-and-mobile.md` §3–4, §7 — read first, not repeated here: Playwright's
bundled WebKit is not Mobile Safari, `document.hidden`/`visibilitychange` never fire under
Playwright control, and cloud real-device testing was already named as the fix reserved for the one
claim local Playwright cannot make good on). This file is the concrete how-to for closing that hole:
remote debugging, exposing a dev server to a phone, and what device-lab options actually exist for a
web app that only runs meaningfully inside someone else's closed-source wallet app.

The starting fact, already established locally and not re-derived here: Nimiq Pay's own app source
is **not public** (`research/verification/02_webview_capabilities.md` §1.1 — three independent GitHub
searches, all negative), so nothing below can promise the debugging hooks are turned on. Every
technique here is a **thing to try and report the result of**, not a guarantee.

## 1. What they do

**Android — `chrome://inspect` over USB.** Debugging a `WebView` from desktop Chrome DevTools
requires the *host app* to call `WebView.setWebContentsDebuggingEnabled(true)` at runtime; this
"applies to all of the application's WebViews" and, critically, **"WebView debugging is not affected
by the state of the debuggable flag in the application's manifest"** — a release build does not get
debugging for free just because it's a release build, and it does not lose it just because it's a
release build either. It is a decision the app's own code makes.
Source: `https://developer.chrome.com/docs/devtools/remote-debugging/webviews`. Once enabled, the
flow is: enable Developer Options + USB debugging on the phone → connect via USB → open
`chrome://inspect#devices` on desktop Chrome with "Discover USB devices" checked → accept the
on-device authorization prompt → the debuggable WebView appears in the device list → click
**Inspect** to open a full DevTools instance (console, network, DOM, screencast).
Source: `https://developer.chrome.com/docs/devtools/remote-debugging`.

**iOS — Safari Web Inspector over a `WKWebView`.** Two independent opt-ins are required, one on each
side of the cable. On the iPhone: Settings → Safari → Advanced → Web Inspector. On the Mac: Safari →
Settings → Advanced → "Show features for web developers" (activates the Develop menu).
Source: `https://webkit.org/web-inspector/enabling-web-inspector/`. But that only exposes *ordinary
Safari tabs and installed-for-development apps*. For a **released app's** `WKWebView` — which is what
Nimiq Pay is — the host app must additionally set `webView.isInspectable = true` on that specific
view, an API that defaults to `false` and requires **iOS 16.4+ / iPadOS 16.4+ / macOS 13.3+**.
Verbatim: *"Defaults to `false`. Set to `true` at any point in the view's lifetime to allow Safari Web
Inspector access to inspect the view's content."*
Source: `https://developer.apple.com/documentation/webkit/wkwebview/isinspectable`. The WebKit team's
own announcement names exactly this use case — *"A common situation in which you may want the content
of `WKWebView` to be inspectable is in an in-app web browser"* — and states the decision is made
**"for each individual `WKWebView`... to prevent unintentionally making it enabled for a view or
context you don't intend to be inspectable."**
Source: `https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/`.

**Exposing the dev server to a phone.** Nimiq's own documented workflow is LAN-only: `vite.config.ts`
→ `server: { port: 5173, host: true }`, run `npm run dev -- --host`, note the Network URL
(`http://192.168.x.x:5173`), paste it into Nimiq Pay's Mini Apps → Custom URL field, phone and dev
machine on the same Wi-Fi (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8). This project's own verification
work already flags why that is not enough for `chit`/Scoresheet-class apps and recommends an HTTPS
tunnel instead (`research/verification/02_webview_capabilities.md` §2.1, §8.2 — see §3 below). ngrok's
own docs describe the mechanism only at the level of *"Put your local app on a public URL in seconds
with the ngrok CLI"* (`https://docs.ngrok.com/docs/share-localhost/overview/`) — the exact free-tier
session limits and random-subdomain behaviour were **not confirmed by direct fetch in this pass** and
are marked **NOT VERIFIED** below rather than assumed.

**Device labs.** Firebase Test Lab's Spark (no-cost) plan gives **15 test runs per day in total: 10 on
virtual devices, 5 on physical devices**, and every test type it supports —
instrumentation test, Robo test (`does not require a pre-written test`), Game Loop test, XCTest — is
an **automated, non-interactive** run: you upload a build, define a device matrix, and get back logs,
a video, and screenshots after the run finishes. There is no manual, real-time, hands-on-the-device
mode in Test Lab at all.
Source: `https://firebase.google.com/docs/test-lab/usage-quotas-pricing`,
`https://firebase.google.com/docs/test-lab`. BrowserStack's competing product line splits this
explicitly in its own naming: **App Live** is real-time interactive control of a real device through
the browser; **App Automate** is scripted (Appium). A free trial exists (`Free Trial` /
`Get Started Free` calls-to-action are present sitewide,
`https://www.browserstack.com/app-live`, `https://www.browserstack.com/pricing`), and the cheapest
named paid tier is a **$12.50/month Freelancer plan with 100 minutes of Live - Desktop & Mobile**
(`https://www.browserstack.com/pricing`) — but the exact free-trial duration/minute cap, and whether a
free-trial device can freely install an arbitrary Play Store app (Nimiq Pay is not our app and we
cannot upload it as a test binary), were **NOT VERIFIED** by direct fetch in this pass; the pricing
and product pages did not surface that specific fact and it must be confirmed by actually signing up.
LambdaTest's pricing page 301-redirected to `testmuai.com/pricing` during this research pass — a
rebrand or migration in progress — and was not further chased; **NOT VERIFIED**.

## 2. Why it works

Remote debugging works because both platforms' DevTools protocols attach directly to the page's own
JS engine over the same wire the browser vendor uses internally (the Chrome DevTools Protocol for
Chromium WebView, the WebKit Remote Inspector protocol for WKWebView) — once attached, it is
indistinguishable from debugging a normal desktop tab: full console, full network panel, live DOM,
screencast. That is exactly why both platforms gate it behind an explicit host-app opt-in rather than
exposing it by default — an inspectable production WebView is a live, unauthenticated window into
whatever that WebView is currently rendering, which is a real attack surface on a **wallet app**
specifically. The WebKit team says as much implicitly by making the opt-in *per-view* rather than
global: a wallet's own internal screens are not necessarily the same `WKWebView` instance as a
Mini App's, so even if Nimiq Pay made its Mini App WebView inspectable it would say nothing about
whether its own wallet UI is.

The HTTPS-tunnel requirement works for the same reason `crypto.subtle` and `getUserMedia` are already
documented as dead over the LAN-HTTP dev loop
(`research/verification/02_webview_capabilities.md` §2.1, quoting MDN's secure-context definition
verbatim): a tunnel turns `http://192.168.x.x:5173` into a real `https://` origin, which is the only
thing the platform's secure-context check actually looks at. It has nothing to do with convenience —
it is the difference between testing the real code path and testing a code path that silently
skips the parts gated behind `isSecureContext`.

Automated device farms (Firebase Test Lab) work well for exactly what they are built for — catching a
crash or a layout break across many OS/device combinations without owning the hardware — because a
scripted Espresso/XCTest/Robo run is repeatable and cheap at scale. That is also precisely why they
cannot stand in for this project's own testing need: nothing in Test Lab's model lets a human make a
judgment call ("does this feel right," "did the wallet's confirmation dialog show the correct memo,"
"do I trust this enough to sign") inside a **third-party app we do not control the build of**.

## 3. What they do badly

**The entire premise of remote debugging here is conditional on someone else's decision we cannot see
or influence.** Nimiq Pay's app source is not public
(`research/verification/02_webview_capabilities.md` §1.1), so whether `setWebContentsDebuggingEnabled`
or `isInspectable` is set `true` on the specific WebView instance that hosts Mini Apps is **unknown
until tested on a real device** — and there is a real, structural reason to expect the answer is
**no**: shipping an inspectable WebView in a production wallet app is a live remote-debugging surface
into a financial application, which is exactly the kind of thing a security-conscious team disables
before release. Nothing in this research found any statement, in Nimiq's own docs or in any of the
five local Skool/Twitter/call archives, that Mini App WebViews are debuggable. This must be treated as
the single highest-uncertainty, highest-leverage fact to settle first — before investing further setup
time in the remote-debugging workflow at all.

Firebase Test Lab is a poor fit beyond a narrow slice: it tests **an app you upload**, not a web page
loaded inside someone else's app; it has no manual mode; and its free quota (15 runs/day, 5 of them
physical) is a small, shared budget across every automated check a project might want, not a dedicated
allowance for this kind of exploratory session. BrowserStack/LambdaTest-class services solve the "real
hardware without owning it" problem but do not solve the "arbitrary third-party wallet app installed
and signed into" problem for free — that almost certainly needs either a paid tier with Play
Store/App Store access or a device the tester already owns.

ngrok's free tier is well known (though **not independently re-confirmed by URL in this pass** — see
§9) to rotate the public URL on every restart unless paid, which directly collides with two things
this project's own research already flags: the deep-link allowlist is a fixed list keyed by hostname
(`research/verification/02_webview_capabilities.md` §6.3 — unlisted hosts 404), and CORS must name the
exact origin Nimiq Pay loaded the app from (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8, §12a). A rotating
tunnel origin means re-configuring CORS on every dev session unless a static/reserved subdomain is
used.

## 4. What we should copy conceptually

- **Reserve real-device time for the one class of claim nothing else can make**, exactly as
  `money-and-mobile.md` §4 already concludes for cloud-Safari testing generally: "this works inside
  Nimiq Pay's in-app WebView on a real iPhone" is not a claim local tooling, emulators, or automated
  farms can settle — only a human, on the actual app, can.
- **VeriLock's own shipped pattern** of detecting the host and adjusting behaviour
  (`function ht(){ return typeof window<'u' && !!window.nimiqPay }`,
  `research/verification/02_webview_capabilities.md` §2.2) is the right shape for a debug-mode flag
  too: gate extra diagnostics on `!!window.nimiqPay` combined with an explicit `?debug=1`, never on
  user-agent sniffing.
- **This project's own `?demo=1` convention** (`README.md`, `apps/web/src/demo-wallet.ts`) is already
  the established local pattern for "a query flag that changes runtime behaviour for testing" — a
  `?debug=1` flag for an in-page console (§5) extends the same convention rather than inventing a new
  one.

## 5. What we can do better

**Do not depend on host cooperation for visibility at all.** Because whether Nimiq Pay's WebView is
inspectable is unverified and plausibly `false` by design, ship our **own** in-page debugging surface
that works regardless: an in-page console/network overlay (Eruda or vConsole, both MIT — §9) mounted
only when `?debug=1` is present in the URL, alongside the `?demo=1` wallet stand-in already documented
in `README.md`. This turns "can we see console errors on a real phone" from a question that depends on
Nimiq Labs' own build configuration into a question this project fully controls. Concretely: bundle
Eruda behind a dynamic `import()` so it costs nothing when absent, mount it on `?debug=1`, and it
surfaces exactly the console/network/DOM information `chrome://inspect`/Safari Web Inspector would
have given for free if the host had opted in — with the added benefit that it also works for a real
Nimiq Pay session with a **real** wallet, which host-level remote debugging on a live financial app
would be a genuinely bad idea to rely on even if it were available.

Also worth doing: a small on-screen "copy diagnostics" button (viewport dimensions, `visualViewport`
state, `window.isSecureContext`, `!!window.nimiqPay`, user agent, `navigator.storage.estimate()`) that
a real tester can screenshot or paste into a bug report without any cable, computer, or developer
setup at all — useful for recruiting non-technical testers (chess Discord players, per
`SPEC.md` Part O) who will never plug a phone into a laptop.

## 6. What is technically required

**Android path, step by step:**
1. A physical Android phone (Nimiq Pay's own minimum OS is not confirmed for Android in the local
   verification file — only iOS 15.0 is confirmed; Android floor **NOT VERIFIED**) with Developer
   Options and USB debugging enabled.
2. Install Nimiq Pay from the Play Store, load the Mini App via Custom URL (over an HTTPS tunnel, not
   LAN — see below).
3. Connect via USB, open `chrome://inspect#devices` in desktop Chrome with "Discover USB devices"
   checked, accept the phone's authorization prompt.
4. **The actual test:** does the Mini App's WebView appear in the device list at all? If yes, click
   Inspect and confirm full DevTools access. If no, the host has not enabled
   `setWebContentsDebuggingEnabled` for that WebView — fall back to §5's in-page console.

**iOS path, step by step:**
1. A physical iPhone (iOS 15.0+, confirmed as Nimiq Pay's stated minimum,
   `research/verification/02_webview_capabilities.md` §1.1) and a Mac.
2. iPhone: Settings → Safari → Advanced → Web Inspector, on. Mac: Safari → Settings → Advanced →
   "Show features for web developers," on.
3. Connect via cable (or configure wireless debugging via Xcode).
4. Load the Mini App inside Nimiq Pay, then check Safari's Develop menu → the phone's submenu.
5. **The actual test:** does the Mini App's page appear there? If yes, full Web Inspector access
   (console, Elements, Network, Timelines). If no — and this is the *expected* result unless Nimiq
   Labs specifically opted the Mini App WebView into `isInspectable`, since it defaults `false` and
   iOS 15.0 predates the 16.4 minimum for the API entirely, meaning on any Nimiq Pay build still
   targeting iOS 15 as a deployment floor the API may not even be linked — fall back to §5.

**Tunnel setup (both platforms):** `ngrok http 5173` (or a Cloudflare Tunnel), paste the resulting
`https://` URL into Nimiq Pay's Custom URL field, not the LAN IP — required for `crypto.subtle`,
`getUserMedia`, and geolocation to be reachable at all
(`research/verification/02_webview_capabilities.md` §2.1, §8.2, already the project's own stated
correction to Nimiq's documented LAN-only flow).

**Hardware.** A physical Android phone and a physical iPhone are the two things this entire document
assumes exist somewhere reachable. **NOT VERIFIED whether such devices are currently available** —
global standing permission already covers using real devices for testing
(`C:\Users\prate\.claude\CLAUDE.md`, "Never refuse work you can actually do" / "Test environments are
not production"), but acquiring the actual hardware, if none is on hand, is a genuine prerequisite
this document cannot supply.

## 7. What could break

- **The whole remote-debugging plan can dead-end on day one** if Nimiq Pay's production build has
  neither `setWebContentsDebuggingEnabled` nor `isInspectable` set for the Mini App WebView — plausible
  by design (§3) and not ruled out by anything found locally. This must be the very first thing tested,
  not assumed to work because the setup steps were followed correctly.
- **A rotating free-tier tunnel URL breaks CORS and the deep-link allowlist** on every restart unless a
  reserved subdomain is used (§3) — budget for a paid ngrok tier or a Cloudflare Tunnel with a real
  domain if dev sessions span multiple days.
- **Firebase Test Lab's Robo test cannot meaningfully exercise this product at all** — Robo crawls an
  app's own UI automatically; it has no way to reason about a wallet confirmation dialog belonging to a
  *different* app (Nimiq Pay) that it did not instrument, so even the automated-crawl value this tool
  normally provides mostly does not transfer here.
- **A device-lab session that lacks a real, funded Nimiq Pay wallet cannot test the transaction-signing
  path at all** — `README.md`'s own "What is not done" section states plainly that the puzzle pool "has
  no NIM in it," so even a perfect real-device setup only proves the mechanism (`sign()`, the
  scoresheet, `?demo=1`'s published key) unless a real wallet with real NIM is used for the
  player-initiated tip/pool-contribution path (`apps/web/src/send-nim.ts`), which needs no pool funding
  at all and is the one real-transaction path testable today.
- **Eruda/vConsole shipped in a production build by accident** is a real risk if the `?debug=1` gate is
  ever weakened — must be verified to not affect the production bundle size or attack surface when
  absent (dynamic import, §5).

## 8. What we can uniquely do because of Nimiq

Because the product's entire differentiator is a signature a stranger can independently re-verify
(`README.md`: *"recomputed from scratch by a stranger in their own browser with our server switched
off"*), real-device testing here has a genuinely rare property most WebView-hosted apps do not: the
**correctness** of a real-device test run does not depend on trusting the device, the tester, or even
this project's own server — a signed scoresheet produced during a real-device session can be taken
off that device entirely and independently re-verified on a completely different machine via the
Recompute button, closing the loop that "did the wallet really sign this, on a real phone, inside the
real host" is answerable in a way ordinary WebView-hosted apps (a food-delivery Mini App, a portfolio
tracker) have no equivalent for. The Device Identifier API
(`requestDeviceIdentifier`, `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §6) also means a zero-wallet real-device
session (someone who has never connected a wallet) can still meaningfully test the puzzle-pool
eligibility and anti-abuse path, which is a real-device test category most Mini Apps in the catalog
have no reason to need.

## 9. Licence and reuse verdict

- **Eruda — MIT.** Verified via `gh api repos/liriliri/eruda` → `license.spdx_id: MIT`. Safe to add as
  a dynamically-imported devDependency gated behind `?debug=1`.
- **vConsole — MIT**, stated in the repository's own `LICENSE` file text (`"the vConsole binary is
  licensed under the MIT License"`), though GitHub's own licence detector reports `NOASSERTION` for the
  repo due to the custom preamble above the licence text
  (`https://raw.githubusercontent.com/Tencent/vConsole/master/LICENSE`). Eruda is the cleaner-confirmed
  choice; either is legally fine to use.
- **chrome://inspect, Safari Web Inspector, `isInspectable`, `setWebContentsDebuggingEnabled`** are
  platform tooling and public API surface (Chromium/Apple documentation), not third-party code — no
  licence question, only an availability question that can only be answered on-device.
- **Firebase Test Lab, BrowserStack, LambdaTest** are commercial SaaS products, not code dependencies —
  no licence concern, only cost/account-setup and (per §3) fit-for-purpose ones.
- **ngrok / Cloudflare Tunnel** — infrastructure tools used as-is via their CLIs, not code copied into
  the project; no licence question.
- **Nothing in this file proposes reusing another team's Nimiq Mini App code.** It extends this
  project's own existing conventions (`?demo=1`, `research/verification/02_webview_capabilities.md`'s
  evidence-tier discipline) and adds two small, permissively-licensed, widely-used debugging libraries.
