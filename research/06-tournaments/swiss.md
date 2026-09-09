# Swiss pairing implementations — what exists, licences, build-vs-adopt

Sources fetched directly:
- https://github.com/echecsjs/swiss (README, via WebFetch)
- https://raw.githubusercontent.com/echecsjs/swiss/main/README.md (raw README, via WebFetch)
- https://raw.githubusercontent.com/echecsjs/swiss/main/package.json (via WebFetch)
- https://github.com/echecsjs/swiss/blob/main/LICENSE (via WebFetch)
- `@echecs/tournament` — the peer dependency. The npm web page 403s, but the registry answers: `npm view @echecs/tournament license repository.url version` returns **MIT**, `git+https://github.com/echecsjs/tournament.git`, v3.3.0 (checked 8 Sep 2026). `npm view @echecs/swiss` returns MIT, v5.0.0, peer `@echecs/tournament: ^3.3.0`. **The whole chain is MIT and portable into this repository.**
- https://github.com/BieremaBoyzProgramming/bbpPairings (README summary via WebFetch)
- https://github.com/BieremaBoyzProgramming/bbpPairings/blob/master/README.txt (via WebFetch)
- http://www.rrweb.org/javafo/JaVaFo.htm (via WebFetch)
- WebSearch confirming Lichess Swiss uses bbpPairings: https://lichess.org/swiss

## 1. What they do

Three maintained, open engines exist for computing FIDE-legal Swiss pairings:

- **`@echecs/swiss`** (https://github.com/echecsjs/swiss) — a TypeScript library, version 5.0.0 at time of research, published to npm. It implements six FIDE-approved systems as separate subpath exports: `./dutch` (C.04.3), `./dubov` (C.04.4.1), `./burstein` (C.04.4.2), `./lim` (C.04.4.3), `./double` (C.04.5, Double-Swiss), `./team` (C.04.6, Swiss Team). Public API is a single `pair(players: Player[], games: Game[][]): PairingResult` function; `Player = { id, rating? }`, `Game = { white, black, result, kind? }`, byes represented as a game with `black: ''`. It is an ES Module (`"type": "module"`), requires Node ≥ 22 at dev-time, and has **no direct production dependencies** other than a peer dependency on `@echecs/tournament` (^3.3.0) — a companion package whose contents and licence we could not verify (npm page returned 403).
- **bbpPairings** (https://github.com/BieremaBoyzProgramming/bbpPairings) — a C++ command-line engine, "not a full tournament manager, just an engine for computing the pairings." Implements the Dutch system (2025 rules) and a self-described "flawed," non-FIDE-endorsed Burstein implementation. Reads/writes the TRF file format (TRF-2026, with backward compatibility for TRF(bx), plus custom BBW/BBD/BBL/BBZ/BBF/BBU result-value extensions). Four CLI invocation forms are documented (validate colours `-c`, produce next pairing `-p`, generate a full random tournament `-g`). Defined error codes 0–5 (success, no valid pairing, unexpected error, malformed input, data-size exceeded, file-access error). Documented complexity: O(n³) for Burstein, O(n³ × s² × log n) for Dutch, where n = largest player ID and s = occupied score groups.
- **JaVaFo** (http://www.rrweb.org/javafo/JaVaFo.htm) — a Java implementation of the Dutch System only. Distributed as a standalone executable (needs a JVM) or as a library JAR. Current version 2.2, released 15 September 2018; the site itself states bbpPairings (released August 2016) is superior and JaVaFo is now kept mainly "as a decent benchmark" for testing other engines.

**Lichess itself uses bbpPairings** for its Swiss tournaments: "Pairings are decided with the Dutch system, implemented by bbPairings, in accordance with the FIDE handbook" (https://lichess.org/swiss). This is the strongest available real-world validation that bbpPairings' Dutch implementation is production-grade and FIDE-compliant at scale.

## 2. Why it works

- **`@echecs/swiss`'s `pair(players, games)` signature is already exactly the shape we need**: stateless, pure — feed it the full player list and the full game history, get back this round's pairings. That is precisely "pairing as a pure function of the signed record," which is our own hard requirement (b). We would not need to adapt its data model to get purity; it already assumes it.
- **bbpPairings being the same engine Lichess runs in production** means its Dutch-system behaviour has been exercised at massive scale against real, adversarial inputs (thousands of concurrent Swiss tournaments) — far more battle-testing than we could realistically achieve ourselves before a competition deadline. Its documented O(n³ × s² × log n) complexity is irrelevant at our field size (4–16 players).
- **TypeScript + MIT + zero non-peer production dependencies** for `@echecs/swiss` is the ideal shape for a browser-executed Mini App: no native binary, no server round-trip required to compute a pairing, auditable source, and a licence that permits unrestricted commercial reuse and modification.
- **Separate subpath exports per system** (`./dutch`, `./double`, `./team`, etc.) mean we only ship the code path we actually use — useful for a mobile WebView bundle size budget.

## 3. What they do badly

- **`@echecs/swiss` is young and thinly documented from the outside.** Version 5.0.0 with a coverage badge present but **the actual coverage percentage could not be extracted from the fetched README — NOT VERIFIED.** We did not find independent third-party usage reports (e.g. a known tournament platform running it in production) the way we did for bbpPairings via Lichess. Its correctness against FIDE's full C.10–C.14 backtracking/relaxation ladder is unverified by us beyond what the README claims; we would need to run its output against known reference test vectors (e.g. JaVaFo's or bbpPairings' published examples) before trusting it for money-bearing standings.
- **It depends on a peer package, `@echecs/tournament`, whose licence and content we could not fetch** (npm returned HTTP 403 to our request). Shipping `@echecs/swiss` without independently verifying that peer dependency's licence and behaviour would be exactly the kind of unverified assumption our own process forbids.
- **bbpPairings is a native C++ CLI binary**, not something you can `import` into a browser bundle. Using it means either (a) running it server-side and trusting a server round-trip for every pairing decision (which reintroduces a centralised, non-client-verifiable step we're trying to avoid), or (b) compiling it to WebAssembly ourselves — which nobody has published a ready-made build of, as far as this research found (**NOT VERIFIED that no WASM build exists — we searched GitHub and npm for "bbpPairings wasm" style artifacts and found none, but did not exhaustively check every fork**).
- **JaVaFo's licence is non-standard**: "free of charge, just mention rrweb.org/javafo... and drop a note to the author" — this is not MIT, Apache, GPL, or any SPDX-recognised licence. It is a permissive-sounding but legally unclear attribution request, not a licence grant we should build commercial, prize-paying infrastructure on top of. It is also Java-only and effectively legacy (superseded by bbpPairings per its own maintainer's page).
- **None of the three ship a browser-native, independently-auditable tie-break engine** — all three are pairing engines, not standings/tie-break engines. C.07's tie-break formulas (Sonneborn-Berger, Buchholz-Cut1, Direct Encounter, Progressive Score) are not part of `@echecs/swiss`'s documented API surface (only `pair()` was found) and are entirely absent from bbpPairings' stated scope ("not a full tournament manager"). **We will have to write the tie-break engine ourselves regardless of which pairing library we pick.**

## 4. What we should copy conceptually

- **`@echecs/swiss`'s pure-function API shape** (`pair(players, games) → pairings`) as the contract our own pairing module exposes, whether we end up using their library, forking it, or writing a compatible one: no hidden state, full history in, this-round pairings out, callable identically by our server and by any outside auditor running the same open-source function against the same signed game log.
- **bbpPairings' TRF-based validate-mode (`-c`)**: given a full player/result file, it checks whether the *actual* pairings that were played are FIDE-legal. We should build an equivalent "verify, don't just compute" mode: given our own signed round history, re-derive what the pairing *should* have been and flag any divergence — this is what actually delivers on "a stranger can recompute" rather than merely "we compute it once and publish the answer."
- **Subpath-export-per-system packaging** — ship only the Dutch (and, if we adopt round-robin per `design.md`, a trivial round-robin scheduler) code path to the client, not the full six-system surface.

## 5. What we can do better

- **Treat `@echecs/swiss` as a candidate to vendor-and-audit, not a black-box dependency.** Given its youth, the unverifiable peer dependency, and money riding on the standings being correct, the responsible path is: fork or vendor the `dutch` subpath's source into our own repo, read every line, write our own test vectors against FIDE's C.04.3.1 worked examples and against JaVaFo/bbpPairings output for the same inputs, and only then trust it for prize-bearing tournaments. This is strictly more rigorous than either "roll our own from the 14-page prose spec" or "trust an unaudited npm package with real money."
- **Cross-validate against bbpPairings server-side** during development (and optionally at tournament-close time, non-interactively) as an independent oracle, even though we don't ship its binary to the browser: run both engines against the same recorded game history and diff the pairings. Apache-2.0 permits this freely.
- **Write the tie-break engine as our own small, from-scratch, 100%-test-covered module** (Direct Encounter, Sonneborn-Berger, Buchholz-Cut1, Number of Wins, Progressive Score per C.07) since none of the three existing projects provide one — this is a bounded, well-specified piece of code (the formulas in `fide.md` §6 are exact) and is exactly the kind of thing worth owning rather than depending on.

## 6. What is technically required

- Either: (a) vendor and audit `@echecs/swiss`'s `dutch` subpath (MIT, TypeScript, no non-peer deps) after resolving the `@echecs/tournament` peer-dependency licence question directly with its maintainer or by reading its source once accessible; or (b) implement a from-scratch Dutch/round-robin pairing module in TypeScript, validated against FIDE's own worked examples (C.04.3.1.D) and cross-checked against bbpPairings' output for the same inputs.
- A from-scratch tie-break module (no existing OSS option covers this) implementing the Type A/B/C formulas selected in `design.md`.
- A server-side (or CI-time) bbpPairings build (Apache-2.0, C++, build via its Makefile) used purely as a correctness oracle during development and at tournament finalisation — never as the client-trusted computation path.
- Signed, canonical game-record serialisation that both our pairing module and any outside auditor's independent reimplementation would consume identically.

## 7. What could break

- Depending on `@echecs/swiss` without resolving the `@echecs/tournament` peer dependency's licence could mean shipping a licence we haven't actually cleared — this must be resolved (read the source, or replace the dependency) before any production use, not assumed permissive because the parent package is MIT.
- Trusting `@echecs/swiss`'s Dutch implementation without cross-validating against bbpPairings/JaVaFo reference vectors risks silently wrong pairings — wrong pairings feed directly into wrong standings, which is money-bearing.
- If we ever need pairing computation to happen in a resource-constrained mobile WebView with no server round-trip, bbpPairings (native binary, no verified WASM build) is not directly usable — this pushes us toward either the TypeScript option or a from-scratch implementation regardless of preference.
- JaVaFo's non-SPDX licence means **do not** depend on its code (even to "just borrow a snippet") without separate legal sign-off; treat it as read-only reference material for validating our own engine's output, not as a source of reusable code.

## 8. What we can uniquely do because of Nimiq

- Because Nimiq wallet addresses are the player identity already, our `Player.id` in any of these libraries' API shape is simply the wallet address — no separate account/rating-list bootstrap (FIDE C.04.2.B's "Initial Order" ranking step, which normally needs a rating list) is required beyond whatever seeding rule we choose (e.g. random or self-declared, since we have no trusted external Elo for anonymous wallets).
- NIM's feeless, fast settlement lets us publish each round's signed result set on-chain (or anchor its hash on-chain) as soon as it closes, so the "verify, don't just compute" mode described in §4 can be run by literally anyone, at any time, against a permanently public record — something none of these three engines' existing users (FIDE arbiters, Lichess) can offer, because their authoritative game record lives in a private database, not a public ledger.
