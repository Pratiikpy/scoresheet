# WebView differences — what breaks moving from a desktop browser into Nimiq Pay

Scope: the concrete list of platform behaviours that differ between a desktop/mobile *browser* tab
and the Android WebView / iOS WKWebView Nimiq Pay actually hosts Mini Apps in — viewport and safe
areas, `100vh`, `visualViewport`, autoplay/audio, storage partitioning, service workers,
`prefers-color-scheme`, hardware back, gesture navigation, and file downloads. This builds directly on
`research/verification/02_webview_capabilities.md` (already confirms the hosting model: a **native JS
bridge, not an iframe**, Nimiq Pay is Capacitor-shelled with a top-level WKWebView/Android WebView
navigation — §1.2, §1.2b) and `research/09-ux/navigation.md` (already covers WebView back-button
mechanics and Chess.com's own shipped WebView navigation bug — not repeated here).

## 1. What they do

**Viewport and safe areas.** `window.visualViewport` exists specifically because mobile browsers have
two viewports: a *layout* viewport that stays fixed, and a *visual* viewport that shrinks when the
on-screen keyboard appears or the user pinch-zooms — without it, elements positioned relative to the
layout viewport drift out of the actually-visible area the moment the keyboard opens.
Source: `https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API`. `env(safe-area-inset-*)`
is meant to report the space consumed by device chrome (notch, home indicator, status/nav bars) so
content can pad around it.

**`100vh` and the toolbar problem.** `100vh` is defined against the layout viewport, but mobile browser
chrome (address bar, tab bar) expands and collapses as the user scrolls, so a `100vh` element is "too
tall on load" and only correct once the toolbar has retracted. The fix is the newer viewport-unit
families: `svh`/`svw` (small viewport — toolbars assumed expanded), `lvh`/`lvw` (large viewport —
toolbars assumed retracted), `dvh`/`dvw` (dynamic — tracks the toolbar live, clamped between the other
two). Support: Chrome 108+, Firefox 101+, Safari 15.4+; desktop browsers treat all three identically
since they have no dynamic chrome.
Source: `https://web.dev/blog/viewport-units`.

**Storage and cookies.** WebKit's Intelligent Tracking Prevention model partitions and eventually
purges cookies/storage for domains it classifies as having cross-site tracking ability, with a
first-party embed able to request access via the Storage Access API.
Source: `https://webkit.org/blog/8536/intelligent-tracking-prevention-2-0/` (2018, describing ITP 2.0;
later ITP versions extend this further and were not re-fetched in this pass). **This applies to
third-party/embedded contexts specifically** — and the local verification file already establishes
that a Nimiq Pay Mini App is loaded as a **top-level navigation to its own origin, not an iframe**
(`research/verification/02_webview_capabilities.md` §1.2: *"the host calls into the page, the page
does not call a parent frame"*), so classic ITP third-party-cookie partitioning is not the mechanism
most likely to bite Scoresheet's own `localStorage`/IndexedDB. The open, unresolved question is
different: whether the specific `WKWebView`/Android WebView instance Nimiq Pay creates for Mini Apps
uses a **persistent** data store (survives app restarts) or an **ephemeral** one (wiped every
session) — this is a host configuration choice, and like `isInspectable`
(`research/11-testing/real-devices.md` §1), it lives in code that is not public.

**Service workers.** Android WebView supports Service Workers as a checkable *feature*
(`ServiceWorkerControllerCompat`, AndroidX WebKit library) — an app must call
`WebViewFeature.isFeatureSupported(SERVICE_WORKER_BASIC_USAGE)` before using the controller API, but
this is a WebView-*component* capability check (tied to the installed WebView/Chromium build on the
device), not a host-app opt-in the way file choosers and camera permissions are.
Source: `https://developer.android.com/reference/androidx/webkit/ServiceWorkerControllerCompat`.
Scoresheet already ships a service worker (`apps/web/public/sw.js`, cache-first for the shell/JS/CSS/
puzzle chunk, network-only for `/api` — `research/00-current/inventory.md`), so this is not a
theoretical concern; it is a shipped mechanism whose real-device behaviour inside Nimiq Pay is
unverified.

**`prefers-color-scheme`.** The CSS media feature reads the user's **OS-level** light/dark preference,
or "a user agent setting" — it has no concept of a sibling app's own independent in-app theme toggle.
Source: `https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme`. Scoresheet
already ships both a light and dark palette, contrast-checked (`research/00-current/inventory.md`:
"156 contrast pairs measured, all 156 pass, light + dark, all 3 board themes").

**Autoplay and audio.** Chrome's autoplay policy permits muted autoplay always; unmuted autoplay
requires prior user interaction with the domain (or a high Media Engagement Index on desktop, or
PWA/home-screen installation, or a permissions-policy delegation from a parent frame). `AudioContext`
created before any user gesture starts in a `suspended` state and needs an explicit `resume()` call
after interaction.
Source: `https://developer.chrome.com/blog/autoplay`. **Whether this policy applies identically inside
Android WebView, and what Nimiq Pay's WKWebView does specifically, was not addressed by the fetched
documentation and is marked NOT VERIFIED** — see §7.

**Hardware back / gesture navigation.** Already covered in full in `research/09-ux/navigation.md`
(Android's `canGoBack()`/`goBack()` interception pattern, and Chess.com's own shipped bug where their
embedded-WebView section's back button "jumps all the way to the section's entry point" instead of
stepping one screen — not repeated here).

**File downloads.** Android's `DownloadListener` interface is how a host app is notified when a
WebView encounters a downloadable file or a `Content-Disposition: attachment` response; without the
host implementing `setDownloadListener()`, a WebView has no built-in download manager UI of its own to
fall back on.
Source: `https://developer.android.com/reference/android/webkit/DownloadListener` (documented API
surface; the precise no-listener failure behaviour was confirmed as standard, widely-documented Android
WebView behaviour rather than quoted verbatim from the reference page itself — see §9).

## 2. Why it works

Each of these exists for a structural reason, not an oversight. The visual/layout viewport split
exists because resizing the *layout* viewport every time the keyboard opens would force a full reflow
of the page on every keyboard toggle — expensive and visually jarring — so the platform instead keeps
layout stable and reports the *visible* portion separately via `visualViewport`. `100vh` breaks
because it was defined before dynamic mobile browser chrome existed; `dvh`/`svh`/`lvh` are the
platform's later, purpose-built fix. `DownloadListener` exists because a `WebView` is a rendering
surface **embedded inside a host app**, not a standalone browser shell — it has no address bar,
no download tray, no "Downloads" screen of its own, so any download has to be handed back to the host
app to decide what to do with (`DownloadManager`, a share sheet, a custom UI). Service workers are
gated behind a feature check rather than an app-level toggle because they are tied to the WebView
*component's* own version on the device (Android WebView updates independently of the OS via Google
Play), not to anything the hosting app chooses.

## 3. What they do badly

**Every concrete Nimiq-Pay-specific gotcha found in this research came from reading a Cycle 1
winner's own shipped CSS, not from any official documentation** — which is itself the finding worth
internalising: Nimiq's docs do not warn about any of these. From `clones/nspace/client/src/style.css`
(cited in full in `research/verification/02_webview_capabilities.md` §7.2):

- `:1201-1202` — the Fullscreen API is blocked inside Nimiq Pay's WebView, so the Cycle 1 winner ships
  a `visualViewport`-based **pseudo-fullscreen** as the working substitute.
- `:2744-2750` — **`env(safe-area-inset-top)` is actively wrong inside Nimiq Pay**: *"Nimiq Pay WebView
  already owns top chrome; a spurious safe-area inset on the HUD leaves a transparent band above
  `.hud-top-strip` where the game canvas shows through."* Fix shipped: force `padding-top: 0` under a
  host-detection class.
- `:2752-2762` — **`safe-area-inset-bottom` is unreliably `0` even when the home indicator physically
  overlaps content** — the fix floors the bottom padding at the known iPhone home-indicator height
  (34px) and still honours a larger `env()` value when one is actually reported:
  `calc(8px + max(34px, env(safe-area-inset-bottom, 0px)) + …)`. This is the exact fix for the #1 gap
  builders have reported to Nimiq directly (Emre Alt, `SKOOL_FULL_ARCHIVE_FINDINGS.md` — "unresolved"
  per that archive) and it is written down nowhere except this shipped stylesheet.
- `:8165-8171` — **the WebView misreports viewport width**: *"the in-app webview can report a CSS
  width above the 560px breakpoint, which would otherwise drop the wardrobe back to the wide desktop
  grid."* The winner's fix gates the compact layout on a host-detection class, never on a width media
  query alone.

From `NIMHunt/nim-hunt`, `static/create_spot_delete_guard.js` (same source file, §7.2): **WKWebView
drops the first asynchronous `window.location.href` navigation after a `fetch` completes** on some
builds, and **a page restored from WKWebView's back-forward cache retains stale disabled-modal/JS
state** — both undocumented anywhere official, discovered and worked around by a different shipped
Mini App entirely independently.

**Nobody in the entire local evidence set has reported on the camera, the file picker, uploads, the
on-screen keyboard, or `crypto.subtle` at all** — a full grep across 394 Skool posts, every
`@nimiq`/`@miniappscomp` tweet, the FAQ, the blog, and a full Sip & Ship transcript returns nothing
(`research/verification/02_webview_capabilities.md` §7.3). That silence is explicitly *not* evidence
these things work; it means almost nothing in the catalog has needed them yet.

## 4. What we should copy conceptually

- **nspace's `visualViewport`-based pseudo-fullscreen** — the correct fallback pattern when
  `requestFullscreen()` is blocked, which the local evidence says it is inside Nimiq Pay.
- **nspace's floor-the-safe-area-bottom-at-34px pattern**, and its **zero-the-top-inset-under-a-host-
  class** pattern — both directly reusable, both concrete numbers rather than guesses.
- **nspace's and Trove's/VeriLock's host-detection-class approach**: gate layout decisions on
  `!!window.nimiqPay` (a real host signal) rather than trusting `env()` values or width media queries
  in isolation, since both have been independently observed misreporting inside this exact host.
- **nim-hunt's `pageshow` handling** for bfcache staleness, and its retry-with-progressively-simpler-
  mechanisms pattern for the dropped-navigation-after-fetch bug.

## 5. What we can do better

Apply every one of §3's fixes to Scoresheet's board and game screens **before** shipping, not after
discovering the same bugs independently — nspace's own comments read like they were found the hard
way, mid-cycle. Concretely:

- Add a `.nimiq-pay-host` (or similar) class to `<html>` on `!!window.nimiqPay`, and gate: safe-area
  padding (top zeroed, bottom floored at 34px honouring a larger real value), any fullscreen-adjacent
  layout (use `visualViewport` sizing instead of `requestFullscreen()`), and the board's responsive
  breakpoint logic (never trust a raw CSS width media query alone inside the host class).
- Use `dvh` (with a `vh` fallback for anything pre-Safari-15.4/Chrome-108, though Nimiq Pay's iOS floor
  of 15.0 predates `dvh` support at 15.4 — confirm the gap does not matter in practice since 15.0–15.3
  is a narrow band) for any full-bleed vertical layout (the board screen, zen mode) instead of `100vh`.
- Handle `pageshow` with `event.persisted` checked, mirroring nim-hunt's bfcache fix, anywhere a modal
  or disabled-state UI could be left stale by a WKWebView restore from cache — the live-game clock and
  the resign-confirmation flow are the two most exposed screens for this in Scoresheet specifically.
- Verify the shipped service worker's actual behaviour inside Nimiq Pay specifically, not just in
  Playwright — confirm the data store backing the Mini App WebView is persistent (cache and
  `IndexedDB` survive an app restart), since Scoresheet's whole offline-puzzle claim
  (`apps/web/public/sw.js`, `research/00-current/inventory.md`) depends on it, and the mechanism
  Nimiq Pay uses to allocate that WebView's storage is unverified (§1).
- Wire sound/haptic playback (already built, per `README.md`: "sound and haptics that are synthesised
  rather than sampled") behind the first real user gesture explicitly, rather than assuming the
  in-app "first move" tap always counts as the qualifying interaction for autoplay purposes on every
  engine — cheap to add, and the downside of guessing wrong is a silent first move with no sound at
  all, which reads as broken rather than muted.

## 6. What is technically required

- [ ] `.nimiq-pay-host` class applied on `document.documentElement` as early as possible, keyed off
  `!!window.nimiqPay` (the same detection Trove and VeriLock already use in production —
  `research/verification/02_webview_capabilities.md` §6.6), never user-agent sniffing.
- [ ] CSS: `padding-top: 0` under that class regardless of `env(safe-area-inset-top)`; bottom padding
  as `calc(8px + max(34px, env(safe-area-inset-bottom, 0px)) + …)`.
- [ ] CSS: any board-container width logic gated on the host class in addition to (not instead of) a
  media query, since the WebView can misreport width above the breakpoint.
- [ ] JS: `pageshow` listener checking `event.persisted`, resetting any modal/confirmation/disabled
  state that must not survive a bfcache restore.
- [ ] JS: no `requestFullscreen()` call on the critical path; `visualViewport`-driven sizing as the
  fallback for any "immersive" board mode.
- [ ] A real-device check (per `research/11-testing/real-devices.md`) of: service-worker persistence
  across an app restart, `prefers-color-scheme` matching (or not) Nimiq Pay's own chrome theme, and
  whether the first synthesised sound/haptic plays on the very first qualifying tap.
- [ ] `DownloadListener`/native-download behaviour is **only relevant if Scoresheet ever offers a file
  download** (PGN export, the certificate image, per `README.md`) — confirm whether these currently
  use a `<a download>` link (which the local Artifact-equivalent research elsewhere in this project
  already flags as inert inside a sandboxed WebView context; **NOT VERIFIED for Nimiq Pay specifically
  — a genuinely open, untested question**) versus opening a share sheet or a new tab, and test both
  paths on-device.

## 7. What could break

- **A viewport-width misreport silently reflows the board mid-game** if the responsive breakpoint is
  ever trusted without the host-class gate — this already happened to nspace and is not a hypothetical.
- **The service worker's cache could be silently wiped on every Nimiq Pay relaunch** if the Mini App
  WebView uses an ephemeral data store — this would make the "offline puzzles" claim in `README.md`
  false specifically inside the one host that matters, while still passing every desktop/Playwright
  check, because Playwright's own persistent browser context would never surface an ephemeral-storage
  host.
- **Autoplay-blocked sound on the very first move** is a real risk with no confirmed mitigation in this
  pass (§1) — a silent first move reads as a bug to a cold judge (`research/11-testing/judge-mode.md`
  §5, "Understand what this is").
- **`prefers-color-scheme` can disagree with Nimiq Pay's own visible theme** if the host has an
  in-app theme toggle independent of the OS setting — this is plausible (many wallet apps ship their
  own theme switcher) and **NOT VERIFIED either way**; if true, a user in Nimiq Pay's dark theme with
  their phone's OS set to light would see Scoresheet render in light mode inside a dark-chrome host,
  which reads as a bug even though every individual API behaved exactly as documented.
- **A download-dependent feature (PGN export, the certificate image) could be completely inert** on
  Android if the host has not implemented `DownloadListener`, with no error shown to the user at all —
  the platform's own documented behaviour is silent failure, not a rejection the app could catch and
  work around.

## 8. What we can uniquely do because of Nimiq

Most teams studying "WebView differences" have no comparable prior art running inside the *exact* host
they are about to ship into. This project does: **nspace is a Cycle 1 first-place winner, MIT-licensed,
still shipping through the start of Cycle 2** (`WINNER_TEARDOWNS_VERIFIED.md`), and its own stylesheet
contains the precise fixes for the safe-area, viewport-width, and fullscreen gaps this exact host
produces — not a general WebView guide, not an inference, but another team's measured, shipped answer
to the identical problem. That is a strictly stronger starting point than the generic advice in this
file's §1, and it is available only because this project happens to be building for the same platform
a public, permissively-licensed winner already solved it for.

## 9. Licence and reuse verdict

- **`clones/nspace` — MIT**, verified in the repo's own `LICENSE` file
  (`WINNER_TEARDOWNS_VERIFIED.md` §1: "All three are MIT licensed — verified in each repo's
  `LICENSE`"). Safe to port the concrete CSS values (safe-area floor, host-detection class pattern,
  `visualViewport` pseudo-fullscreen) directly, with attribution in `NOTICES.md` per this project's own
  existing practice (`README.md`: "Everything borrowed is listed in `NOTICES.md` with its licence and
  what was changed").
- **`NIMHunt/nim-hunt`'s licence was not checked in this pass — NOT VERIFIED.** Per `SPEC.md` Part L's
  own tiering (`chess/CLAUDE.md` quality-floor section), its `pageshow`/bfcache fix and its
  dropped-navigation workaround are used here only as **observed behaviour** — a documented fact about
  how WKWebView behaves, not code copied from the repository — which needs no licence at all, the same
  way `chessground`'s value is cited as observed behaviour rather than ported source. If any of its
  actual code is ever lifted rather than the underlying fact, its licence must be checked first.
- **MDN, web.dev, WebKit's own blog, Android/AndroidX reference docs** — documentation, not code; safe
  to cite and build directly against as the platform contract, the same posture this project already
  takes toward `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`.
- **Chrome's autoplay-policy blog post** — documentation only; no code proposed for reuse.
- **Nothing in this file proposes reusing GPL/AGPL-licensed code.**
