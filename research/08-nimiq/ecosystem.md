# Nimiq ecosystem — what Scoresheet can use or must be aware of

**Scope:** RPC providers, explorers, client libraries, the design system, testnet faucets, and adjacent official/community infrastructure. Every claim below carries a source; anything that could not be confirmed is marked **NOT VERIFIED**.

**Primary sources used:**
- Local: `C:\Users\prate\nimiq\NIMIQ_DEV_DOCS_FULL_REFERENCE.md` (verbatim capture of `nimiq.dev/mini-apps`, read 2026-08-29)
- Local: `C:\Users\prate\nimiq\clones\README.md` and the cloned repos themselves (`clones/nimiq-utils`, `clones/hub`, `clones/identicons`, `clones/qr-creator`, `clones/qr-scanner`, `clones/cashlink-generator`, `clones/libswap-js`, `clones/mini-app-sdk`, `clones/nimiq-ui`, `clones/nimiq-ui-kit`, `clones/developer-center`, `clones/awesome`, `clones/evm-mini-wallet`)
- Local: `C:\Users\prate\nimiq\reference-apps\nimiq-keyguard\`, `C:\Users\prate\nimiq\reference-apps\nimiq-provider\`
- Web: `https://github.com/nimiq/awesome` (fetched live, this session)
- Web: `https://www.nimiq.com/apps/` (fetched live, this session)
- Web: `https://github.com/nimiq/developer-center/issues/179` (fetched live, this session)

---

## 1. What they do

**RPC & blockchain access**
- **Open public RPC servers** — `rpc.nimiqwatch.com` (mainnet), `rpc.testnet.nimiqwatch.com` (testnet). Listed in `github.com/nimiq/awesome`. Community-run (by the nimiq.watch operator), not an official Nimiq-hosted endpoint. **NOT VERIFIED**: uptime/SLA.
- **Albatross RPC Client (TS)** — `github.com/onmax/albatross-rpc-client-ts`, a typed JS/TS client for the above RPC servers. Listed in `nimiq/awesome`.
- **Nimiq RPC Client (TS), JSR package** — `jsr.io/@blouflash/nimiq-rpc`. Listed in `nimiq/awesome`.
- ⚠️ There is **no `getBalance` method on the injected Nimiq mini-app provider** (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §3, confirmed against the official API reference). Any NIM balance read inside a Mini App must go through one of these external RPC clients, not the provider.

**Block explorers** — mainnet: `nimiq.watch`, `nim.re/explorer` (RE:NIM), NimiqHub, NimiqScan, `nimiq.cafe/explorer`. Testnet: `test.nimiq.watch`, `testnet.nimiqhub.com`. All from `github.com/nimiq/awesome`, fetched live this session.

**Nimiq's own catalog page (`nimiq.com/apps/`, fetched live this session)** is a *different, smaller, older* list (~22 apps) than the 75-app Mini Apps Competition catalog (`api.nimiqminiapps.com/api/apps`, see `catalog_apps.json`). It groups apps as Official / Community / E-commerce / Wallets / Bots / Games / Insights / Promotion / Infrastructure, with **no search or filter UI** — categories are static labels on cards. Relationship between the two catalogs is **NOT VERIFIED** (could not confirm whether one feeds the other).

**Client libraries / SDK (all in `clones/`, read directly)**
| Library | What it does | Verified licence |
|---|---|---|
| `@nimiq/mini-app-sdk` (source: `nimiq/trust-web3-provider`, branch `nimiq`) | The actual Mini App SDK. `init()` resolves the injected provider (polls `window.nimiq` every 50ms, 10s default timeout) — a Trust Wallet fork; Nimiq Pay only exposes the `nimiq` and `ethereum` providers even though the fork carries aptos/bitcoin/cosmos/solana/ton/tron provider code too. | **MIT** — `packages/mini-app-sdk/package.json` declares it directly (confirmed, local file read). No root `LICENSE` file on the repo. |
| `nimiq-utils` (`nimiq/nimiq-utils`) | Request-link encoding, fiat-rate helpers, address validation, number formatting, UTF-8 tools (`Utf8Tools.truncateToUtf8ByteLength()`). | **Apache-2.0**, confirmed via `LICENSE.md` (local) and GitHub license API (fork, this session). |
| `identicons` (`nimiq/identicons`) | Deterministic wallet-address avatars — free per-user visual identity, no upload/config needed. | **MIT**, confirmed via `LICENSE` (local) and GitHub license API. |
| `qr-creator` / `qr-scanner` (`nimiq/qr-creator`, `nimiq/qr-scanner`) | Nimiq's own QR generation/scanning, both directions of a payment link. | **MIT** — both confirmed via local `LICENSE` files. |
| `cashlink-generator` (`nimiq/cashlink-generator`) | Nimiq's native "send money as a link" primitive — claim-a-payment-via-URL, no recipient address needed up front. | **MIT** (code) — confirmed via local `LICENSE`; repo also bundles a font under the **SIL Open Font License** (separate file, not the code licence). |
| `libswap-js` (`nimiq/libswap-js`) | Atomic-swap handling (NIM ↔ BTC/USDC). | **Apache-2.0**, confirmed via local `package.json` `"license"` field. |
| `hub` (`nimiq/hub`) | Browser wallet integration (`HubApi`) — the non-Mini-App surface; `nspace` uses it as the desktop/browser fallback when not running inside Nimiq Pay (`clones/nspace/client/src/auth/nimiq.ts`, read directly this session). | **NOT VERIFIED** — no `LICENSE` file and no `"license"` field in `package.json` found locally; GitHub license API also returned 404 (fork, this session). |
| `evm-mini-wallet` (`Albermonte/evm-mini-wallet`) | Nimiq's own canonical EVM reference implementation — full send/receive/balance flow across all 7 supported EVM chains via `viem`/`wagmi`, EIP-6963 discovery, multicall balance reads. Its `src/utils/well-known-tokens.ts` is the only place with the **complete** multi-chain token list (Nimiq's prose docs omit the Base and BNB Smart Chain USDT addresses — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §5). | **NOT VERIFIED** — no `LICENSE` file found, GitHub license API 404 (fork, this session). |
| `developer-center` (`nimiq/developer-center`) | Source of `nimiq.dev` — 216 markdown docs offline, including every Mini Apps page. | **Apache-2.0**, confirmed via local `LICENSE.md` (full Apache 2.0 text present). |
| `nimiq-keyguard` (`nimiq/keyguard`, cloned into `reference-apps/nimiq-keyguard`) | The wallet's key-management / signing UI. `nspace` reuses its "paired stroked hexagons" loading-spinner SVG directly, credited in source (`clones/nspace/client/src/ui/nimiqHexLoader.ts`: *"Source: github.com/nimiq/keyguard - src/common.css, request index.html (MIT)"*). | **MIT**, confirmed via local `LICENSE` file. |

**Design system**
- **`@nimiq/style` / `nimiq-css`** (`onmax/nimiq-ui`, package `packages/nimiq-css`) — the token source: brand palette, signature radial gradients, Muli/Fira Mono type scale, 8px grid, UnoCSS preset, CSS layers (preflights/colors/fonts/utilities/typography/static-content). Read directly from `clones/nimiq-ui/packages/nimiq-css` this session.
- **`@nimiq/vue-components`** — 34 Vue components (`Nq*` naming) built on the CSS package.
- **`nimiq-theme`** (`packages/nimiq-theme` inside the same monorepo) — ships a VS Code theme (`themes/nimiq-dark.json`) using the same brand colours; its own `package.json` declares **`"license": "MIT"`** (confirmed, local read) — but this is the *only* package in the `onmax/nimiq-ui` monorepo with an explicit licence found; the monorepo root and `nimiq-css` itself have neither a `LICENSE` file nor a `license` field (confirmed absent, local read; GitHub license API also 404, fork this session).
- **`nimiq-ui-kit`** (`NimiqToolbox/nimiq-ui-kit`) — a zero-build static site (no `package.json`, maintained by hand per its own `AGENTS.md`) that renders the *actual* current `@nimiq/style` CSS, `@nimiq/vue-components`, `@nimiq/identicons` and `@nimiq/utils` live, plus static reproductions of Wallet/Hub/Keyguard UI (swap balance bar, Ledger connect animation, Login File draw-in, backup codes, PIN field). Ships `tokens/tokens.css` + `tokens/tokens.json` as copy-paste design tokens, and `llms-full.txt` as a single-file LLM-readable dump of the whole kit. **No licence file found** — GitHub license API 404 (fork, this session). **NOT VERIFIED** as reusable; treat as reference-only unless the maintainer confirms terms.
- **Official brand guide** — `nimiq.com/styleguide` 301-redirects to a **Figma file** (`figma.com/design/GU6cdS85S2v13QcdzW9v8Tav/NIMIQ-Style-Guide--Oct-18-`), fetched live this session. It is not published as a text/HTML page, so nothing in it could be captured as text here — only that it exists and where it lives. `NIMIQ_TECHNICAL_SETUP_STATUS.md` (local) separately notes a downloadable **Nimiq Design Kit** at `nimiq.dev/design-kit` (logos, hexagon mark) — not yet pulled locally, **NOT VERIFIED** beyond that note.
- **No standalone public brand/press-kit page** was found on `nimiq.com` beyond the Figma redirect (fork, this session, explicit negative search).

**Testnet & faucet**
- Nimiq Pay's own **"Get free NIM" button** (shown on the empty-state home screen and the Top Up modal once the hidden dev-menu network switch is set to Testnet) credits **110,000 testnet NIM per request** — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8, verbatim from `nimiq.dev/mini-apps`.
- **No separate public web faucet is listed in `github.com/nimiq/awesome`** (fork, this session, explicit check) — the only documented faucet path is the in-app button above.
- ⚠️ The Nimiq-side testnet toggle **does not affect EVM chains** — Mini Apps on Polygon/Base/etc. keep transacting on live mainnet even when Nimiq is set to testnet, unless the app explicitly adds a testnet EVM chain via `wallet_addEthereumChain` (e.g. Polygon Amoy). Confirmed verbatim in `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §8, and matches a real builder's experience (Piggy's builder, per `SKOOL_FULL_ARCHIVE_FINDINGS.md`, cited there).

**Dev tooling** — Nimiq Playground (`nimiq-playground.pages.dev`), an MCP server (`github.com/onmax/nimiq-mcp`), `onmax/nimiq-starter`, a branding CLI (`github.com/Andjroo111/nimiq-branding-cli`). All from `github.com/nimiq/awesome`, fetched live this session; none independently inspected for licence — **NOT VERIFIED**.

## 2. Why it works

The core primitives Scoresheet would actually touch — `mini-app-sdk`, `identicons`, `cashlink-generator`, `qr-creator`/`qr-scanner`, `nimiq-utils` — are all confirmed **MIT or Apache-2.0**, i.e. safe to depend on and, where MIT, safe to vendor/port code from directly (with attribution) rather than only calling as a package. That covers the entire "look and behave like a real Nimiq product" surface: wallet identity (identicons), payment links (cashlinks, QR), formatting/validation (nimiq-utils), and the SDK itself.

The `init()` pattern in the real SDK (`clones/mini-app-sdk`) is deliberately simple — resolve once at module scope, no manual polling required — which is why every reference app (`nspace`, the official demo `nimiq-mini-app-demo`, `nimquest`) converges on the same shape: `const provider = await init()`, called once, shared. That convergence across three independently-built apps is itself evidence the pattern is the path of least resistance, not a house style imposed by one team.

The catalog's own gaps (see `catalog-teardown.md` §3 and `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`) are mostly *documentation* gaps, not *capability* gaps — full native staking (7 methods), the Device Identifier API, and EVM balance/gas plumbing are all real and documented; nobody has built the UI for most of them yet.

## 3. What they do badly

- **No `getBalance` on the Nimiq-side provider at all** (confirmed absent, not merely undocumented — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §3). A Mini App that wants to show "you can't afford this" pre-checks on the NIM side has to stand up its own RPC read; the same check on the EVM/USDT side is trivial (`eth_getBalance` exists). This asymmetry is a real design gap in the official surface, not a doc omission.
- **`nimiq.com/blog/mini-apps-framework/`** is entirely architecture-focused — it never states a design philosophy for what makes a Mini App *feel* native (fork, this session, explicit read). Anyone chasing "native feel" guidance from Nimiq's own words gets nothing from the one blog post that should have it.
- **Licensing is inconsistent and, in places, simply undeclared** across the community/semi-official design-system layer: `onmax/nimiq-ui` (the actual source of `nimiq-css`) has no root licence and no `license` field in the `nimiq-css` package itself, despite `nimiq-theme` in the *same monorepo* explicitly declaring MIT — an internal inconsistency, not just an external unknown (confirmed by direct local file read, cross-checked against GitHub's license API returning 404 for the whole repo). `NimiqToolbox/nimiq-ui-kit` and `Albermonte/evm-mini-wallet` — both repos Nimiq's own docs and prior local notes point builders toward as *the* reference — carry no discoverable licence either.
- **The brand guide is locked inside a Figma file**, not published as a readable page (`nimiq.com/styleguide` redirects there). A builder without Figma access, or an agent that can only fetch text, gets nothing from the "official" source and has to reconstruct the system from `nimiq-css`'s CSS variables instead.
- **`developer-center` issue #179** (opened by a real builder building `nimiq-simple-faucet`, closed by a Nimiq team member) shows the team's own resolution standard for SDK-reference gaps is "point at the existing page," not "generate types from the published package" — the maintainer's own reply says auto-exporting types from the SDK package "is something the Appsolut team will do later, but it isn't blocking." That's an acknowledged, indefinitely-deferred gap in the *official* reference, from Nimiq's own repo, fetched live this session.
- **No public ratings/reviews signal anywhere in the ecosystem.** `WINNER_TEARDOWNS_VERIFIED.md` §6 (local, recomputed from the live catalog API) confirms `avg_rating` and `review_count` are empty across all 75 catalog apps — there is no way to see, from the ecosystem's own data, which shipped apps are actually good.

## 4. What we should copy conceptually

- **Resolve the provider once, at module scope, and never poll `window.nimiq` yourself** — the pattern every real app converges on (`nspace`, the official demo, `nimquest`), because the SDK's own `init()` already does the polling.
- **Ship a genuine offline/no-provider state with real copy**, not a silently-dead button. NimJump's `NimiqBridge`/`NimiqJS.gd` (`clones/game/game/scripts/NimiqJS.gd`, read directly) funnels *every* "Connect Wallet" entry point (StatsPanel, QuestPanel, LeaderboardPanel, the Play button) through one function, and when there's genuinely no provider it fires a single shared install-prompt popup instead of the button just flipping back with zero feedback — the code comment documents this as a deliberate bug fix for exactly the "looks broken/dead" failure mode. `nimquest`'s `installConnectivityBanner()` (`apps/web/main.js`, read directly) does the equivalent for network loss: a persistent "You're offline. Saved lessons still work, but grading, proof, sync, and shared receipts need a connection." banner with a Retry button, driven off `navigator.onLine` / the `online`/`offline` events.
- **Provide a browser fallback path, not just an in-Nimiq-Pay path**, when the concept can reasonably be used outside the wallet too. `nspace` and NimJump both detect `window.nimiqPay`/`window.nimiq` and fall back to the Hub API (`HubApi` popup, `hub.nimiq.com`) for plain-browser visitors — same login message, different transport (`clones/nspace/client/src/auth/nimiq.ts`; `clones/game/game/scripts/NimiqJS.gd` `start_hub_sign`/`start_payment`).
- **Reuse Nimiq's own MIT-licensed visual language directly** rather than approximating it — `nspace` literally imports the Keyguard's hex-loader SVG with source attribution rather than drawing its own spinner. That is available to us too (same MIT licence).
- **Design proof mechanics that don't require moving NIM when a payment isn't the point.** `nimquest` places 3rd in Cycle 1 while moving zero NIM — it only signs a challenge message (`sign()`, not `sendBasicTransaction*`) to prove wallet control. Directly relevant to any Scoresheet feature (e.g. proving a completed game, a rating, a claimed result) that doesn't need an actual transaction.
- **Answer keys / server authority never ship in the client bundle.** `nimquest`'s `scripts/generate-web-catalog.mjs` strips answers at build time; NimJump's backend does headless server-side replay verification rather than trusting the client. For a chess app, the equivalent is: legal-move validation and game-result adjudication happen server-side, never trust the client's claimed PGN/result.

## 5. What we can do better

- **Fix the balance-check asymmetry ourselves.** Since the Nimiq provider has no `getBalance`, wire our own thin RPC read (via `rpc.nimiqwatch.com` or the Albatross TS client) specifically to power "can this player afford this stake/entry fee" pre-checks — something no catalog app is confirmed to expose today (source: catalog metadata review, see `catalog-teardown.md`).
- **Publish our own licence and design-token provenance cleanly** — something the community design-system layer conspicuously fails to do. If we lift `nimiq-css` tokens, copy the exact hex/gradient values (public, inspectable via DevTools regardless of the package's own licence gap) rather than depending on an unlicensed package, and note in our own repo exactly where each token came from.
- **Use the Device Identifier API for a genuine zero-wallet practice mode** (`requestDeviceIdentifier`, `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §6) — a documented, sanctioned per-device handle for leaderboards/save-slots without requiring a wallet connection at all. No catalog app was confirmed to use this (not present in any of the 20 detailed catalog entries pulled from `catalog_apps.json`, nor mentioned in `WINNER_TEARDOWNS_VERIFIED.md`).
- **Cover the EVM/native asymmetry Nimiq's own docs miss** — verify the BNB Smart Chain USDT address independently (e.g. via BscScan) before ever using it, since Nimiq's own reference omits it (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §5, flagged there as **NOT VERIFIED** in the source doc itself).

## 6. What is technically required

- `npm install @nimiq/mini-app-sdk` (MIT) — the only hard SDK dependency for a Nimiq-side Mini App; confirmed usage pattern: `const provider = await init({ timeout: 10_000 })`.
- For NIM balance reads (no provider method exists): a call to `rpc.nimiqwatch.com` directly, or via `github.com/onmax/albatross-rpc-client-ts` — pick one and pin it; both are third-party/community infrastructure, not Nimiq-operated (see §7).
- For wallet-address avatars: `@nimiq/identicons` (MIT) — deterministic, no server round-trip needed.
- For payment links / invites: `@nimiq/cashlink-generator` patterns and/or `@nimiq/qr-creator` + `@nimiq/qr-scanner` (all MIT).
- For number/address formatting and request-link encoding: `nimiq-utils` (Apache-2.0) — note the Apache licence requires a NOTICE/attribution, unlike the MIT packages.
- For visual parity: hand-copy the CSS custom properties from `clones/nimiq-ui-kit/tokens/tokens.css` (values are public/inspectable; the *package* itself carries no confirmed licence, so treat as "read the values, don't redistribute the file verbatim" until licence status is clarified — see §9).
- For a browser (non-Nimiq-Pay) fallback: `@nimiq/hub-api` (`HubApi` from `hub.nimiq.com`) — licence **NOT VERIFIED** (see §1), so if a Mini-App-only scope is chosen, this dependency can be dropped entirely and the risk avoided.

## 7. What could break

- **Community RPC endpoints (`rpc.nimiqwatch.com`, etc.) carry no confirmed SLA.** If Scoresheet depends on a live NIM-balance read (to work around the missing `getBalance` provider method) and that endpoint degrades or rate-limits, the affected feature fails silently unless we build our own timeout/fallback handling — the ecosystem gives no official alternative today.
- **Depending on `onmax/nimiq-ui`, `nimiq-ui-kit`, or `evm-mini-wallet` for code (not just values) carries real licence risk** — none of the three has a confirmed licence, and `nimiq-css` specifically lacks one in a monorepo where a sibling package (`nimiq-theme`) does declare MIT, which is inconsistent rather than merely silent. Redistributing their code (as opposed to independently re-implementing from the visible public output) is a genuine legal exposure until this is resolved — see §9.
- **The EVM testnet-toggle gap is a real footgun**: any USDT/EVM flow tested "on testnet" via the Nimiq-side dev switch is still live-mainnet unless a testnet EVM chain is explicitly added via `wallet_addEthereumChain`. A team that assumes the single testnet toggle covers everything will ship a flow that was never actually tested off mainnet.
- **The two Nimiq catalogs (`nimiq.com/apps/` vs. the competition's `api.nimiqminiapps.com/api/apps`) are not confirmed to be the same or linked system.** If Scoresheet's submission listing depends on assumptions about how catalog placement/discovery works, that assumption is currently unverified.
- **`developer-center` issue #179 shows Nimiq's own team treats "point to an existing page" as resolution**, even when the underlying ask (typed, auto-generated SDK reference) is acknowledged as unmet. Any part of our build that leans on an SDK method not explicitly covered by the API reference pages risks being genuinely undocumented, with no guaranteed near-term fix.

## 8. What we can uniquely do because of Nimiq

- **Feeless, instant NIM micropayments** make a per-move or per-game stake mechanic viable at amounts (fractions of a cent-equivalent) that would be economically absurd on almost any other chain — no other ecosystem in the awesome-list survey offers a comparably cheap native settlement rail for a high-frequency action like a chess move or a fast game result.
- **Message-signing-only proof, with zero NIM movement**, is a first-class, judge-rewarded pattern (`nimquest` placed 3rd doing exactly this). Scoresheet can prove "this player completed/won this game" via a signed challenge rather than a transaction, keeping the door open to a genuinely free (0-NIM) competitive or practice mode.
- **The Device Identifier API** (`requestDeviceIdentifier`) is a documented, none-of-the-catalog-uses-it mechanism for a real anonymous practice/leaderboard mode — exactly the "instant guest" pattern several Cycle 1 winners approximated with ad hoc solutions, but here it is an official, consent-gated primitive.
- **Same EVM address across all 7 supported chains** (Nimiq Pay derives one EVM wallet from the user's entropy) — a USDT/Polygon stake and a same-value Base/Arbitrum path are the same address, simplifying any cross-chain prize/stake logic without asking the user to manage multiple addresses.
- **Native staking is fully documented (7 methods) and unbuilt in the catalog** — not directly relevant to a chess product's core loop, but relevant if Scoresheet ever wants a "stake to enter a tournament, restaked automatically between events" mechanic; the primitive already exists and nobody has built the UI.

## 9. Licence and reuse verdict

| Resource | Licence | Verified how | Reuse verdict |
|---|---|---|---|
| `@nimiq/mini-app-sdk` (`nimiq/trust-web3-provider`, branch `nimiq`) | **MIT** | `packages/mini-app-sdk/package.json`, local read | Use freely as a dependency; safe to read/port code with attribution. |
| `nimiq-utils` | **Apache-2.0** | `LICENSE.md` local + GitHub license API (fork) | Use freely; **attribution/NOTICE required** per Apache-2.0. |
| `identicons` | **MIT** | `LICENSE` local + GitHub license API | Use freely, MIT attribution. |
| `qr-creator` / `qr-scanner` | **MIT** (both) | `LICENSE` local, both repos | Use freely. |
| `cashlink-generator` | **MIT** (code); **SIL OFL** (bundled font, separate) | `LICENSE` + `SIL Open Font License.txt`, local | Use the code freely under MIT; treat the bundled font under its own OFL terms if reused. |
| `libswap-js` | **Apache-2.0** | `package.json` `"license"`, local | Use freely with attribution/NOTICE. |
| `developer-center` | **Apache-2.0** | `LICENSE.md` full text, local | Docs content reusable under Apache-2.0 terms — don't just copy prose verbatim into our own docs without attribution. |
| `nimiq-keyguard` | **MIT** | `LICENSE`, local (`reference-apps/nimiq-keyguard`) | Confirmed safe to reuse visual assets/CSS the way `nspace` did (with the same source comment/attribution). |
| `nimiq-theme` (inside `onmax/nimiq-ui`) | **MIT** | `package.json` `"license"`, local | Safe to reuse. |
| `nimiq-css` / rest of `onmax/nimiq-ui` monorepo | **NOT VERIFIED — no licence found** | No root `LICENSE`, no `license` field in `packages/nimiq-css/package.json`; GitHub license API 404 (fork, this session) | **Do not redistribute the package or its source.** Treat the *rendered CSS values* (colours, gradients, spacing, type scale) as public/observable design facts safe to independently re-implement, but do not `npm install` or vendor the code as-is without resolving licence status first. |
| `nimiq-ui-kit` (`NimiqToolbox/nimiq-ui-kit`) | **NOT VERIFIED — no licence found** | GitHub license API 404 (fork, this session); no `LICENSE` file in local clone | Same caution as above — useful as a *visual reference* (it faithfully mirrors `@nimiq/style`), not as a code source until licensing is clarified. |
| `evm-mini-wallet` (`Albermonte/evm-mini-wallet`) | **NOT VERIFIED — no licence found** | GitHub license API 404 (fork, this session) | Read for the token-list values and implementation pattern (`well-known-tokens.ts`); do not vendor the code without confirming terms with the author. |
| `hub` (`nimiq/hub`) | **NOT VERIFIED — no licence found** | No `LICENSE` file, no `license` field, local; GitHub license API 404 (fork) | If a browser-fallback (non-Mini-App) login path is wanted, confirm licence status with Nimiq before depending on `@nimiq/hub-api` code beyond its published npm package's own terms (the npm package's own licensing was not separately checked this session — **NOT VERIFIED**). |
| Nimiq brand guide (Figma) | **NOT VERIFIED — no licence stated** | Redirect target only, not fetched as text (fork, this session) | Treat as reference-for-viewing only; do not assume redistribution rights for any assets pulled from it. |

**Overall verdict:** the resources Scoresheet actually needs to touch on the code side — the SDK itself, identicons, QR, cashlinks, and `nimiq-utils` — are all cleanly MIT/Apache-2.0 and safe to depend on directly. The resources needed for *visual* parity (the design-token layer) are the weak link: the two most useful sources (`nimiq-css`/`onmax/nimiq-ui` and `nimiq-ui-kit`) both carry **no confirmed licence**, so the safe path is to treat their published values as public design facts to re-implement independently, not as code to import wholesale, until/unless that is cleared up directly with the maintainers.
