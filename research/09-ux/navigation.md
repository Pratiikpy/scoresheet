# Navigation structure — chess app patterns vs. a wallet-hosted Mini App

Scope: how Lichess and Chess.com structure top-level app navigation, how generic WebViews
handle (or mishandle) back-button/history behaviour, and what a Nimiq Mini App specifically
must do differently because it has no app chrome of its own and lives inside another app's
WebView.

## 1. What they do

**Lichess and Chess.com — native-app, tab-based navigation**
- Chess.com's mobile app uses a **persistent bottom navigation bar always present at the
  bottom of the screen**, with five icons indicating the current section, "Play" being one of
  the primary destinations
  (https://medium.com/@nicololongato/chess-coms-mobile-app-a-wireframe-analysis-3067fc632446).
  Both apps are full native (or native-shell) apps with their own top-level tab structure —
  Lichess's public app-store/help materials and forum references confirm at minimum distinct
  Play, Puzzles, and Watch/analysis destinations, reachable via persistent navigation, with a
  user feature request specifically asking for **swipe-between-tabs** gesture support
  (lichess-org/mobile#671 — https://github.com/lichess-org/mobile/issues/671), implying tabs
  are currently only reachable by tapping, not swiping. Exact full tab label set for both apps
  in their current 2026 builds is **NOT VERIFIED** in this session (requires direct app
  installation/screenshot, not reachable via text search) — treat the "五 icons" / Play-
  Puzzles-Watch structure as the confirmed baseline, not an exhaustive list.
- Both products layer a **secondary, contextual navigation level** inside an active game screen
  (move list, analysis controls, game-review controls) beneath the persistent tab bar — this is
  reported as itself imperfect: a user describes Chess.com's **Game Review controls as
  "awkward on mobile"** (https://www.chess.com/forum/view/site-feedback/game-review-controls-awkward-on-mobile),
  and a separate report describes erratic scroll/jump behaviour trying to reach the bottom of a
  game page on Android (https://www.chess.com/forum/view/help-support/suddenly-cant-get-to-bottom-of-game-page-using-android-phone-jumps-up-and-down).

**Where Chess.com's own navigation already breaks down inside an embedded WebView**
- A filed complaint describes exactly the failure mode this project must design around: inside
  Chess.com's **club-matches screen, which a moderator confirmed is rendered via "an embedded
  browser web-view,"** the iOS in-app back control does not step back one screen at a time — it
  jumps all the way to the section's entry point, described by the user as *"it takes you
  aaaaaaaaall the way back to as if you had hit more (bottom right) for the very first
  time,"* when the expected behaviour was to *"take you back one screen/up one level, to the
  previous screen that you were on"*
  (https://www.chess.com/forum/view/site-feedback/app-back-button-function). This is a direct,
  documented instance of a native app's back button losing correct granularity the moment the
  content it's controlling is an embedded WebView rather than native screens — the exact
  architecture a Nimiq Mini App runs under, permanently, not just for one sub-section.

**Generic Android WebView back-button mechanics** (general Android platform behaviour, not
chess-specific — https://blog.logrocket.com/customize-androids-back-button-navigation-webview/):
- By default, the Android hardware/gesture back action does **not** automatically walk a
  WebView's internal page-history — it falls through to the host app's own navigation (which,
  unhandled, can close the activity/exit the app).
- The documented correct pattern requires the **host app** to intercept the back event, call
  `webView.canGoBack()`, and if true, call `webView.goBack()` instead of letting the system's
  default back behaviour fire; if `canGoBack()` is false, the back action should fall through to
  exiting the WebView/screen.
- This mechanism operates on the WebView's **browser history stack**, which is only reliable
  for full page navigations — a client-side single-page-app that changes view state via
  in-memory routing (no full navigation, e.g. pushState-only changes not paired with real
  history entries, or a router that doesn't push history entries at all) will not produce
  correct back-button granularity through this mechanism, because there is no history entry to
  step back to.

## 2. Why it works

- A persistent bottom tab bar works for Lichess/Chess.com because they are large,
  multi-purpose products (play, puzzles, learning content, social, watching) where a user
  plausibly wants to jump between unrelated top-level destinations many times per session — tab
  bars are the correct pattern precisely when there are several co-equal, frequently-alternated
  destinations.
- `canGoBack()`/`goBack()` interception works, when implemented, because it maps the physical
  back gesture onto the same mental model the user already has from every other app: back means
  "the screen I was just looking at," not "home." The Chess.com club-matches bug is exactly what
  happens when that mapping silently breaks — the back gesture still does *something*, so the
  failure isn't a crash, it's a **trust** failure: the user learns the back button in this
  context is unreliable and stops predicting what it will do.

## 3. What they do badly

- Chess.com's own embedded-WebView section demonstrates that bolting a WebView into an
  otherwise-native app's navigation model is genuinely hard to get right even for a mature
  product with dedicated engineering — the back button's granularity broke specifically at the
  WebView boundary, confirmed by their own moderator's explanation
  (https://www.chess.com/forum/view/site-feedback/app-back-button-function). This is direct,
  first-party evidence (not speculation) that "just embed a WebView and let the platform handle
  back" is not a safe default assumption.
- The tab-bar-plus-nested-navigation model both apps use produces reported confusion inside
  deep game/review screens on mobile specifically (awkward Game Review controls, erratic scroll
  behaviour reaching the bottom of a game page) — depth and nested contextual controls are where
  both apps' mobile navigation is weakest, not the top-level tab bar itself.
- Neither app documents (in anything found in this pass) a deliberate, tested contract for what
  the hardware/gesture back action does at every possible screen depth — it appears to be
  handled ad hoc per screen, which is exactly how the club-matches regression was able to ship.

## 4. What we should copy conceptually

- The general principle that **navigation depth should map 1:1 onto back-button granularity** —
  every real "screen" a user perceives themselves as being on should correspond to exactly one
  step of back, no more, no less. This is the correct target behaviour; Chess.com's bug is proof
  of what happens when the mapping is allowed to drift.
- Persistent, minimal chrome for the *in-game* screen specifically (both apps strip navigation
  chrome down during active play, per `mobile.md` — Zen mode, focus mode) — the principle that
  the deepest, most time-pressured screen should have the least competing navigation UI, applies
  directly to our own in-match screen.
- Treating any embedded/WebView-rendered sub-section as **navigationally special-cased**, the
  way Chess.com's moderator response implies their own engineering had to reason about it
  separately from the rest of the native app — because it is architecturally different, and
  pretending otherwise is exactly how the bug shipped.

## 5. What we can do better

- We don't get to copy the tab-bar pattern at all, and that's the central fact this file exists
  to state plainly: **a Nimiq Mini App has no host-app chrome of its own to build a persistent
  bottom tab bar into** — it is a page inside Nimiq Pay's WebView, not a standalone app with an
  OS-level back stack under our control (see §6, §8). Where Lichess/Chess.com solve "how do I
  get from Puzzles to Play" with a tab bar, we must solve "how do I get from any screen back to
  where I was" **entirely within our own in-page router and our own visible UI**, because there
  is no guarantee our own back gesture handling, or even a system back gesture, reaches us
  consistently inside a third-party WebView.
- Design the entire app as a **single, shallow navigation tree** rather than a deep,
  tab-bar-plus-nested-screens hierarchy — with a small in-app footprint (chess play, and
  whatever wallet-payment flows the product needs), a shallow tree removes almost all of the
  surface area where Chess.com's own bug class can occur, simply by having far fewer "screens
  deep" a user can ever be.
- Make every screen's own in-page back/close affordance **visible and explicit** (a real,
  on-screen back chevron or close control) rather than relying solely on an ambient system/host
  gesture whose behaviour inside our specific WebView context is not guaranteed — this is the
  direct, defensive answer to the exact failure mode Chess.com shipped.
- Since deep links can land a user directly inside a specific screen (a shared match link, for
  instance — see §6), that screen's own explicit back/home affordance must make sense as a
  **first screen**, not assume there is always a "previous screen in this session" to return to.

## 6. What is technically required

- [ ] The app never assumes a native OS/hardware back button or gesture is reliably
  intercepted or forwarded to us — treat any such handling as best-effort, unverifiable from
  inside the Mini App sandbox, and build every screen with its own explicit, visible back/close
  UI control that does not depend on it.
- [ ] No persistent bottom tab bar chrome competing with Nimiq Pay's own host UI — the Mini App
  is a guest inside another product's shell; the in-page navigation must read as a coherent
  single flow, not a second, competing app-within-an-app trying to look like Lichess/Chess.com's
  own tab bar.
- [ ] Navigation state changes inside the SPA use real history entries (`pushState`/router
  history) consistently, so that **if** the host does forward a back action to standard browser
  history mechanics, it steps one logical screen at a time rather than jumping — mirroring the
  documented correct Android WebView pattern (`canGoBack()`/`goBack()` walking a real history
  stack) even though we don't control the host's interception code
  (https://blog.logrocket.com/customize-androids-back-button-navigation-webview/).
- [ ] Deep-link entry points are first-class: every screen reachable by a shared/deep link
  (`nimiqpay://miniapp?url=...` or `https://nimpay.app/miniapps/open/...`, both confirmed
  formats — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9) must render correctly and navigably as the
  **very first screen** a session ever shows, with no assumption of prior in-app navigation
  history to fall back on.
- [ ] Because **"if the URL is not already in the Nimiq Pay mini app list or has never been
  accessed before, Nimiq Pay shows a warning before proceeding"** (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md`
  §9), the very first screen after that warning must orient a user who may have just arrived
  from a shared match/challenge link with zero prior context about the app — this is a hard
  product requirement on top of being a navigation one; see `onboarding.md`.
- [ ] Every state-changing wallet action (any provider call requiring user confirmation:
  `sendBasicTransaction`, staking methods, an Ethereum `eth_sendTransaction`, etc.) must be
  triggered by an explicit, direct user gesture on the current screen — **"do not trigger
  approval dialogs on page load without user interaction," "do not fire multiple provider calls
  that require user confirmation in rapid sequence"** are stated as hard anti-patterns in the
  official skill's own reference material (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §12a) — this
  constrains navigation design directly: a screen transition must never itself silently trigger
  a wallet confirmation dialog as a side effect of arriving.
- [ ] No reliance on `window.ethereum`/Nimiq provider being present or connected at *every*
  screen — screens that don't need a wallet action (browsing open matches, viewing rules,
  reviewing a completed game) must render and be navigable with zero provider calls, so a user
  who hasn't yet connected/approved anything can still move through the app.
- [ ] Any use of `localhost` in navigation/fetch URLs during development must instead target the
  dev machine's LAN IP, since `localhost` inside the WebView resolves to the phone itself, not
  the dev machine (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8) — a navigation/dev-workflow
  requirement, not a production one, but one that will silently break local testing of any
  screen that fetches from a local backend if missed.
- [ ] A custom backend's CORS configuration must explicitly allow the exact origin Nimiq Pay
  loaded the Mini App from (`Access-Control-Allow-Origin` matching that origin —
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8) — a cross-cutting requirement that affects every
  screen making an API call, not a specific navigation edge case, but one that will manifest as
  "this screen won't load data" if missed.

## 7. What could break

- The single most concrete, evidenced risk in this file: **the exact bug Chess.com shipped in
  their own embedded-WebView club-matches section** —
  (https://www.chess.com/forum/view/site-feedback/app-back-button-function) — is structurally
  our *entire app's* risk profile, not a sub-section's, because our whole product is the
  embedded-WebView case. If we assume a host-level back gesture correctly steps our in-page
  history and it doesn't (or only partially does, or is inconsistent between Android and iOS
  builds of Nimiq Pay), every screen is exposed to the same "back jumps somewhere wrong" failure
  Chess.com's users reported.
- A router that changes visible UI state without pushing real history entries will make any
  back-interception the host attempts (if it attempts any) either no-op or jump past intended
  states — this must be tested directly against a real Nimiq Pay WebView build, not assumed
  correct from testing in a desktop browser tab, because desktop browser back behaviour is not
  proof of WebView back behaviour.
- A screen that fires a wallet-confirmation dialog automatically on navigation-arrival (even
  unintentionally, e.g. a `useEffect`/lifecycle hook that calls a provider method on mount) would
  violate the documented hard anti-pattern and could plausibly also produce a broken or
  unpredictable navigation state if the user backs out mid-dialog — untested combination, flag
  explicitly for QA.
- A deep link landing a user on an inner screen with no visible way back to a sensible "home"
  (because the app assumed there'd always be prior navigation history) strands that user —
  this is a first-open failure mode specific to Mini Apps, since Lichess/Chess.com users
  virtually always reach any deep screen via their own app's tab bar first, not cold via an
  external link.
- Any assumption that the Nimiq Pay host provides its own visible "close/back to wallet"
  chrome around our WebView is **NOT VERIFIED** in this research pass — if the host does provide
  such chrome, our own in-page back controls must not conflict with or duplicate it confusingly;
  if it does not, our in-page controls are the *only* way out, raising the stakes on getting
  them right. Confirm directly against a real Nimiq Pay build before finalizing the in-app
  navigation chrome design.

## 8. What we can uniquely do because of Nimiq

- Because there is no competing host-app tab bar to coexist with, the entire visible chrome
  budget of the screen belongs to the app — unlike Chess.com or Lichess, who must always leave
  room for their own persistent bottom tab bar, our navigation chrome can be as minimal as the
  product genuinely needs, maximizing board/content space on an already-small viewport (directly
  reinforcing the board-first layout principle from `mobile.md`).
- Deep links are a first-class, documented distribution primitive
  (`nimiqpay://miniapp?url=...` / `https://nimpay.app/miniapps/open/...`,
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9) in a way neither Lichess nor Chess.com's native apps
  offer as their primary sharing mechanic for a specific in-app screen — a shared match/
  challenge link can open directly into a live game screen inside the recipient's own wallet
  app, with wallet context already present, which is a materially shorter path than either
  reference product's "open the app, sign in, navigate to the shared game" flow.
- The Device Identifier API allows meaningful navigation and app state (recent games, in-
  progress matches) to exist and be useful **before** any wallet connection/payment approval
  screen is ever shown, letting the navigation flow defer the wallet-connection step until the
  moment it's actually needed (starting or joining a paid match) rather than gating the whole
  app behind it up front — a sequencing option neither reference product's account-gated model
  needs to solve, because neither is wallet-hosted at all.

## 9. Licence and reuse verdict

- No source code from Lichess, Chess.com, or the LogRocket WebView tutorial is proposed for
  reuse — this file documents observed/reported product behaviour and general, publicly
  published Android WebView platform mechanics (`canGoBack()`/`goBack()` is a public Android
  SDK API pattern, not proprietary code), safe to apply as our own original implementation.
- Nimiq's own developer documentation (`nimiq.dev/mini-apps`, mirrored verbatim in
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`) is the project's own primary source and is naturally safe
  to build directly against — it is the platform contract our Mini App must satisfy, not
  third-party code being ported.
