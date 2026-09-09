# Native-feel checklist — what a Mini App must satisfy to look like it belongs

**Subject under review:** the official Mini Apps framework's own stated rules (`nimiq.dev/mini-apps`, captured verbatim in `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`) plus the concrete implementation choices of the three verified Cycle 1 winners and the design-token layer (`nimiq-css`/`nimiq-ui-kit`). The checklist in §6 is derived from what these sources actually do and say, not asserted from taste.

**Sources:**
- Local, read verbatim: `C:\Users\prate\nimiq\NIMIQ_DEV_DOCS_FULL_REFERENCE.md` (official `nimiq.dev/mini-apps` capture, incl. §12a skill-only rules)
- Local, read directly this session: `clones/nspace/client/src/ui/nimiqHexLoader.ts`, `clones/nspace/client/src/ui/walletSigningUi.ts`, `clones/nspace/client/src/invite/walletOnboarding.ts`, `clones/nspace/client/src/auth/nimiq.ts`, `clones/nspace/docs/adr/0003-mobile-browser-play-is-portrait-first.md`, `clones/game/game/scripts/NimiqJS.gd`, `clones/nimiq-ui-kit/tokens/tokens.css`, `clones/nimiq-ui-kit/README.md`
- Local: `C:\Users\prate\nimiq\WINNER_TEARDOWNS_VERIFIED.md`, `C:\Users\prate\nimiq\SKOOL_FULL_ARCHIVE_FINDINGS.md` (line 44, the NimJump back-button report)
- Web, fetched live this session: `https://www.nimiq.com/blog/mini-apps-framework/`, `https://github.com/nimiq/developer-center/issues/179`

---

## 1. What they do

The framework's own architecture is explicit about *where* the "feels native" boundary is actually enforced: **every sensitive action goes through Nimiq Pay's own native confirmation dialog, which a mini app cannot visually replicate, skip, or bypass** — stated directly in `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §1 ("Every sensitive action requires explicit user approval through native dialogs that mini apps cannot bypass") and again in the live blog post fetched this session ("The wallet handles cryptographic operations securely, and every sensitive action goes through a native confirmation dialog."). So the app itself never needs to (and cannot) *look like* the wallet's own approval UI — it only needs to behave well in the seconds before and after that dialog appears.

Within that boundary, the reference apps converge on a specific set of concrete choices: a shared brand-accurate loading indicator (Nimiq Space's reuse of the Keyguard's own hex-loader SVG), a single funnel for "no wallet available" (NimJump's `request_account`), cancellation treated as a normal branch not an error (both winners), a portrait-first mobile layout that shares one core layout between the browser and the Nimiq Pay WebView (`nspace` ADR 0003), and localization keyed off a value the host itself injects (`window.nimiqPay?.language`, exactly 5 languages: `en`, `es`, `de`, `fr`, `pt` — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §7).

## 2. Why it works

Deferring the actual trust-critical UI to the host (the native confirmation dialog) and keeping the app's own job narrow — communicate, wait, react — is why these apps don't fight the container. An app trying to *look like* a wallet (custom PIN pads, fake "confirming transaction" screens that mimic the OS chrome) would both fail to match the real dialog exactly and create a phishing-shaped UI pattern the framework's own security model is explicitly designed to prevent Mini Apps from doing. The winners' restraint here is structural, not a style choice — the SDK gives no way to trigger `sendBasicTransaction` without the dialog firing anyway (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §3, every listed method marked "Confirmation? yes").

The 8px-grid, Muli/Fira-Mono, radial-gradient design language (`clones/nimiq-ui-kit/tokens/tokens.css`, read directly) is a *closed, formulaic* system — one gradient formula (`radial-gradient(100% 100% at bottom right, <accent>, <base>)`) applied to ten brand colours, one text-opacity ladder (16 steps of Nimiq Blue alpha) instead of a separate grey scale. A closed formula is easy to apply consistently and easy to visually recognize as "Nimiq" even at a glance — which is exactly why matching it produces "feels native" rather than "looks similar."

## 3. What they do badly

- **The framework's own blog post (`nimiq.com/blog/mini-apps-framework/`, fetched live this session) states the request/response architecture in detail but never states a design or UX philosophy** — nothing about colour, motion, or layout. Everything in this checklist had to be *derived* from source code and ADRs, not read off an official design brief, because none exists as text (the closest thing, the brand guide, is locked in a Figma file — `nimiq.com/styleguide` redirects there, confirmed by live fetch this session, and was not readable as text).
- **A real, on-the-record critique exists against the 2nd-place Cycle 1 winner's own wallet-connect flow**: a builder (Tahseen Faizi) publicly reported he could "bypass the wallet connect system just by clicking the back button" on NimJump; Nimiq's own moderator neither confirmed nor denied it (`SKOOL_FULL_ARCHIVE_FINDINGS.md` line 44, marked there as reported-but-not-independently-verified). Whether or not the specific bypass is real, it demonstrates that **back-button behavior inside the WebView is a documented, live risk area** even in a top-placing app, and nothing in the official docs addresses hardware-back/swipe-back handling directly.
- **The official docs' own anti-pattern list (§12a, from the installed AI skill's reference files, not the public doc pages) exists because the failure mode is apparently common enough to need a named rule**: "Do not fire multiple provider calls that require user confirmation in rapid sequence... Do not trigger approval dialogs on page load without user interaction." The existence of this explicit rule is itself evidence this is a real, observed anti-pattern in submitted apps, not a hypothetical.
- **The Ethereum-side testnet gap is a native-feel trap disguised as a technical one**: an app that tested cleanly against the Nimiq-side testnet toggle can still put a real visitor's real USDT/mainnet funds at risk on the EVM side, because the toggle only affects Nimiq-native operations (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8). A "native-feeling" testnet/dev experience that silently isn't actually a testnet experience is worse than an obviously-fake one.

## 4. What we should copy conceptually

- **Never attempt to visually reproduce the wallet's own confirmation UI.** The correct app-side job is the *lead-up*: a labeled action, a spinner, a clear description of what's about to be requested — then let Nimiq Pay's real dialog do the trust-critical part.
- **One shared, brand-consistent waiting indicator, reused everywhere a provider call is in flight** — following `nspace`'s literal reuse of the Keyguard's own MIT-licensed hex-loader SVG rather than inventing a new spinner. Reusing an asset from the wallet's *own* product family is a stronger native-feel signal than an original design that merely uses the right colours.
- **Portrait-first, one shared core layout between plain-browser and Nimiq-Pay-WebView contexts**, with WebView-specific chrome/behavior layered on top rather than maintained as a separate design (`nspace` ADR 0003, direct quote: "Portrait Play and Nimiq Pay portrait should share one core mobile portrait layout, with Pay-specific WebView and chrome behavior layered separately").
- **Resolve `window.nimiqPay?.language` once, with a real fallback chain** (`window.nimiqPay?.language → navigator.language.split('-')[0] → 'en'`, the documented pattern) — and be aware Nimiq Pay itself only auto-selects from 5 languages even if the app supports more (Nimiq Space itself ships 6: en, tr, pt-BR, vi, es, fil — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §7).
- **Test hardware back / swipe-back against the wallet-connect and payment flows specifically**, given the unresolved NimJump report — a native-feeling app cannot let a back gesture leave a half-completed wallet action in an ambiguous state.

## 5. What we can do better

- **Publish (even briefly, internally) the exact design-token provenance** the official brand guide doesn't provide as text — since `nimiq.com/styleguide` is Figma-only, Scoresheet should keep an explicit, versioned copy of the exact tokens it uses (see §6 for the values) so drift never has to be re-derived from a locked Figma file.
- **Build the back-button case as an explicit, tested state**, not an assumption — given a top Cycle 1 winner has a live, unresolved public report against exactly this. Whatever NimJump's actual bug was, "what happens on back-navigation mid wallet-flow" should be a named test case for Scoresheet, not something first discovered by a reviewer.
- **Make the EVM/testnet distinction visible in-app whenever both rails are used** — e.g. a small always-visible "testnet" vs "mainnet" indicator distinct per rail, so a developer or careful user is never silently exposed to the mismatch the official docs themselves flag as a gotcha.
- **Respect the documented approval-dialog anti-pattern as a hard constraint in code review**, not just a guideline — batch every read-only call, and gate every confirmation-requiring call behind a real, traceable user gesture, per §12a's explicit rule.

## 6. What is technically required

**Colour**
- Brand palette (`clones/nimiq-ui-kit/tokens/tokens.css`, verified this session): Blue `#1F2348`, Light Blue `#0582CA`, Gold `#E9B213`, Green `#21BCA5`, Orange `#FC8702`, Red `#D94432`, Purple `#5F4B8B`, Pink `#FA7268`, Light Green `#88B04B`, Brown `#795548`, plus Gray `#F4F4F4` / Light Gray `#FAFAFA` / White.
- On-dark adaptations exist for exactly two colours: Light Blue → `#0CA6FE`, Red → `#FF5C48` — use these, not the base values, on a `.nq-*-bg` (dark) surface.
- Every brand colour has a paired **signature radial gradient**: `radial-gradient(100% 100% at bottom right, <brighter-accent>, <base-colour>)`, plus a darkened variant of both solid and gradient for hover states. This formula, applied consistently, is a stronger native-feel signal than any single hex value.
- Text uses a 16-step opacity ladder on Nimiq Blue (`--text-100` down to `--text-6`), not a separate grey palette — the wallet's own greyscale system is literally "blue at low alpha."
- Crypto-specific brand colours exist and should be used for asset indicators: Bitcoin `#F7931A`, USDC `#2775CA`, USDT `#009393`.

**Type**
- Font stack: `'Muli', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...` for body text; `'Fira Mono', monospace` specifically for addresses/hex (a generic system-mono font is a native-feel miss for anything showing a wallet address).
- 8px grid, `1rem = 8px` (`html { font-size: 8px }`) — every spacing and type value is a multiple of 8px. Type scale: h1 24px, h2 20px, h3/body 16px, small/label 14px (label uppercase, `.107em` letter-spacing).

**Spacing & layout**
- The 8px grid above governs spacing too — `nimiq-ui-kit`'s own token file states it as "the foundational unit."
- **Portrait-first**, no forced fullscreen/landscape on entry; landscape is opt-in via physical rotation with fullscreen as a best-effort, gracefully-degrading enhancement (`nspace` ADR 0003).
- One shared core layout across plain-browser and Nimiq-Pay-WebView contexts, WebView chrome layered separately, not maintained as a divergent design.

**Motion**
- The Keyguard's own hex-loader animation (paired stroked hexagons, `stroke-dasharray` values `92.5 60` / `47.5 105`, MIT-licensed, `github.com/nimiq/keyguard`) is a legitimate, precedented reuse for any "waiting on the wallet" state.
- Text-based waiting states use a slow, deliberate cadence — Nimiq Space's "Signing in..." cycles a 4-state dot pattern (`.`, `..`, `...`, `.`) every **400ms**, not a fast/frantic tick.
- No stated official motion-duration or easing-curve system was found in any source consulted this session — **NOT VERIFIED** beyond the two concrete examples above; treat as a gap to fill with restraint (slow, few, purposeful) rather than invented specifics.

**Back behaviour**
- No official documentation on hardware-back/swipe-back handling was found in `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`, the framework blog post, or the installed AI skill's reference files (§12a) — **NOT VERIFIED / genuine documentation gap**, confirmed by explicit search this session.
- A real, unresolved public report exists that the 2nd-place Cycle 1 winner's wallet-connect flow could be bypassed via the back button (`SKOOL_FULL_ARCHIVE_FINDINGS.md` line 44) — treat any mid-flow back-navigation during a wallet action as an explicit test case, not an assumption that the container handles it safely.

**Loading states**
- Every provider call that can take real time gets a paired, visible waiting state — never a frozen control. NimJump's polling windows (30s account request, 60–90s sign/payment) reflect genuine human approval time in a separate app, not network latency — size any custom polling to match.
- A "loading" state must never be the *only* content on screen with nothing else to react to (see `09-nimiq/catalog-teardown.md` §3 for the observed failure case — SteadyStreak's bare "Loading SteadyStreak…" with zero other content).

**Error states**
- Nimiq-side: `PermissionDeniedError` on user rejection (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §11); named error cases to design for explicitly: user cancels, request times out, no accounts available, network unreachable, invalid transaction.
- EVM-side: standard EIP-1193 error codes, e.g. `4902` when `wallet_switchEthereumChain` targets an unconfigured chain (§4).
- **"Treat the cancellation case as a normal outcome, not a bug"** — stated directly in the official FAQ. Both winners implement this as a distinct, non-error UI branch, not a generic error toast (`isSigningUserCancelledError`'s six recognized phrasings in `nspace`; NimJump's `err == "no_provider"` vs. genuine failure distinction).
- Hard anti-pattern, from the installed AI skill's own reference files (§12a, not on the public doc pages): never fire multiple confirmation-requiring calls in rapid sequence, never trigger an approval dialog on page load without a real user gesture behind it.

**Wallet prompts**
- The app cannot show its own version of the approval UI — the native dialog is the only trust boundary and is explicitly non-bypassable by design (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §1, and the live-fetched blog post, both independently stating this).
- Onboarding for a wallet-less visitor should offer a real path forward, not a dead end: `nspace`'s `showGetWalletPrompt` pairs a "Sign in with wallet" action with App Store / Google Play / `nimpay.app` links, framed as "Play as a guest today - or sign in with a wallet to explore all of Nimiq Space" — connection is offered, not mandatory, wherever the concept allows it.
- A first-ever open of an unlisted/new Mini App URL shows a host-level warning before proceeding (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9) — this is host chrome, outside the app's control, but it means the app's *own* first-screen content is not actually the very first thing a brand-new visitor sees; design the first in-app screen knowing a warning dialog may have already primed (or spooked) the visitor.

**The specific things that make an app look like "a website embedded in a wallet" instead of "part of it"**, derived from the gaps and anti-patterns above:
- A generic (non-Muli, non-Fira-Mono) font stack, especially on addresses/amounts.
- A spinner or loading treatment with no relationship to the hex/hexagon motif used across Nimiq's own products.
- Forcing landscape or fullscreen on entry instead of respecting portrait-first WebView presentation.
- Firing a confirmation dialog on page load, or stacking several in immediate succession — the single most explicitly named anti-pattern in the framework's own internal rules.
- Generic error toasts that treat a user's wallet-cancel the same as a genuine failure.
- No visible distinction between testnet and mainnet state on the EVM side, when the Nimiq-side toggle gives a false sense that "testnet mode" covers everything.
- A landing/first-contact screen that is blank until JavaScript finishes loading — see `08-nimiq/catalog-teardown.md` §1–3 for how common and how damaging this is across the live catalog.

## 7. What could break

- **The unresolved NimJump back-button report is a live, named risk with no official mitigation documented anywhere consulted this session.** If Scoresheet's own wallet-connect flow has an equivalent gap, it may not surface until a reviewer or real user finds it the same way — worth deliberately testing (Android hardware back, iOS swipe-back, browser back) against every wallet-adjacent screen before submission.
- **The EVM-testnet/Nimiq-testnet mismatch is a specific, documented way for a "looks tested" app to actually be running against real funds** — any EVM/USDT feature needs its own explicit `wallet_addEthereumChain` testnet setup, verified independently of the Nimiq-side toggle.
- **The brand guide being Figma-only means any token drift on Nimiq's side won't be caught by re-reading a public page** — `nimiq-css`'s values (mirrored in `nimiq-ui-kit`) are the best available proxy, but neither carries a confirmed licence (see `08-nimiq/ecosystem.md` §9), so there is no guaranteed-current, guaranteed-reusable source of truth for the palette going forward.
- **`developer-center` issue #179's own resolution (closed by pointing to an existing page, with auto-generated typed SDK docs explicitly deferred, per the live-fetched issue thread) means new SDK surface can ship with a documentation lag** — a native-feel detail that depends on an undocumented method behavior risks being wrong in a way that's hard to catch before a judge or user does.

## 8. What we can uniquely do because of Nimiq

- **Reuse actual Nimiq-family visual assets, not approximations of them** — the Keyguard's own hex-loader SVG is MIT-licensed and already has one precedent reuse (`nspace`); a second, well-attributed reuse in Scoresheet is a stronger native-feel signal than any bespoke spinner could be.
- **`requestDeviceIdentifier` gives Scoresheet a sanctioned way to feel "native" even before any wallet is connected** — a per-device, per-origin, consent-gated handle for guest/practice state, rather than inventing a local-storage-only guest identity that has no relationship to the host at all.
- **The gradient formula and opacity-ladder system are simple enough to hand-implement exactly**, with no dependency on an unlicensed package — a chess-appropriate two- or three-colour subset (e.g. Blue for the primary surface, Gold for highlights/wins, Red for losses/errors) applied through the same formula reads as "Nimiq" without needing the whole token set.
- **`window.nimiqPay?.language` gives a free, host-provided localization signal** unavailable to a plain web app — Scoresheet can localize its very first render correctly without asking the user anything, for the 5 languages Nimiq Pay itself supports natively.

## 9. Licence and reuse verdict

- **Keyguard hex-loader SVG** — **MIT**, confirmed via `reference-apps/nimiq-keyguard/LICENSE` (local, full text present) and `nspace`'s own source comment crediting `github.com/nimiq/keyguard`. Safe to reuse directly with the same attribution `nspace` used.
- **`nimiq-css` / `nimiq-ui-kit` token values** (the exact hex codes, gradient formula, spacing/type scale documented in §6 above) — the *values themselves* are public, inspectable design facts (visible in any rendered Nimiq product via DevTools) and safe to independently re-implement. The *packages* that publish them (`onmax/nimiq-ui`'s `nimiq-css`, `NimiqToolbox/nimiq-ui-kit`) carry **no confirmed licence** (see `08-nimiq/ecosystem.md` §9 for the full verification) — do not `npm install` or vendor either package's code as-is.
- **`nspace`'s specific implementation patterns** (the wallet-onboarding overlay copy/markup, the signing-dots animation code, the cancellation-detection helper) — **MIT**, confirmed via `clones/nspace/LICENSE` (per `WINNER_TEARDOWNS_VERIFIED.md` §1, cross-checked this session). Safe to port directly with attribution.
- **NimJump's `NimiqJS.gd` bridge pattern** (shared connect chokepoint, install-popup trigger, Hub-API fallback) — **MIT**, confirmed via `clones/game/LICENSE` (same source). Safe to port the *pattern* (the concrete GDScript itself is Godot-specific and not directly portable to a web stack, but the architecture is).
- **Overall verdict:** every piece of this checklist that traces back to the three Cycle 1 winners is confirmed MIT and safe to copy or closely port with attribution. The one genuine licence gap is the design-token *package* layer — treat its published values as ground truth to re-implement, never its code as a dependency, until that licence status changes.
