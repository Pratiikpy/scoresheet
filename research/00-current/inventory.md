# Scoresheet — code inventory

Built entirely from the code and docs in this repo. Every number below was either read directly out
of source/tests or produced by running the repo's own scripts on 2026-09-08 (Node v22.17.0, Windows).
Where a claim could not be run in this environment, it is marked **NOT VERIFIED** rather than copied
from a doc and presented as checked.

---

## 1. Every shipped feature, by group

Grouped PLAY / IMPROVE / COMPETE / OWN / EARN. "Shipped" means: source exists, is wired into the
router (`apps/web/src/main.ts`) or the server, and is covered by at least one passing test or by
`npm run look`. Anything in `SPEC.md` marked BUILD that has no source file (board editor, the
Lichess tablebase call, multiple piece sets, coaching payments) is *not* listed — it was planned, not
shipped, whatever `SPEC.md`/`NOTICES.md` say elsewhere (see §9 and the discrepancy note below).

### PLAY

- Legal chess on a custom 0x88 board with drag *and* tap-tap input — `apps/web/src/board.ts`, `packages/core/src/position.ts`, `packages/core/src/rules.ts`
- Four named bots (Pip, Nell, Vera, Oskar) with faces, no ratings, deliberate human-like blunders — `packages/core/src/engine.ts`, `apps/web/src/bot-identity.ts`
- Opening book, 2,833 named lines (verified: `packages/core/src/openings-data.ts` parses to exactly 2,833 rows), consulted by every bot level up to its `bookPlies` — `packages/core/src/openings.ts`, `openings-data.ts`
- Premoves, promotion in place (not a modal), auto-queen toggle, legal-move dots, board coordinates, keyboard play (arrows/Enter/Home/End, squares announced) — `apps/web/src/board.ts`
- Zen mode (board only) and blindfold mode (board without pieces, move list kept) — `apps/web/src/settings.ts`, `styles.css`
- Arrows and square marks (right-click/long-press annotation), 3 board colourways (`wood`, `slate`, `sea`) each in light+dark — `apps/web/src/shapes.ts`, `apps/web/src/settings.ts:31`
- Synthesised sound and haptics (Web Audio oscillators, no sampled audio) — `apps/web/src/sound.ts`
- Takeback — **bot games only**, two plies (undoes the bot's reply too); confirmed absent from `packages/server/src/live.ts` (no `takeback` method exists there) — `apps/web/src/game.ts:210-255`
- Live multiplayer: create/join via a share link (`/g/<id>`), lobby — `apps/web/src/lobby.ts`, `packages/server/src/live.ts`
- Server-authoritative play over HTTP polling (not sockets), adaptive poll rate (faster on opponent's turn, backs off when the tab is hidden) — `apps/web/src/online.ts`
- Clocks owned by the server, resign (confirms twice), draw offer, claim-a-win-on-time (`claim`, not automatic), rematch (colours swap, new game) — `packages/server/src/live.ts` (`resign`, `claim`, `draw`, `rematch` methods)
- PGN import — a pasted PGN or a game handed over in-memory opens directly in the study screen — `apps/web/src/study.ts`, `study-screen.ts`
- Fully playable offline via a cache-first service worker (app shell, JS/CSS, the 442 KB puzzle chunk); the `/api` calls are explicitly never cached — `apps/web/public/sw.js`
- Five languages (en/es/de/fr/pt), following `window.nimiqPay.language` with a manual override — `apps/web/src/i18n.ts`, `apps/web/src/strings/*.ts`

### IMPROVE

- Game Review: every move judged (best/good/inaccuracy/mistake/blunder), per-side accuracy % and ACPL, best-move arrow, evaluation bar — runs in a dedicated Web Worker so the board never blocks — `packages/core/src/analysis.ts`, `apps/web/src/analysis-worker.ts`
- 5,000 bundled puzzles (exact count verified by parsing `puzzles-data.ts`), four modes: Daily, Train (rating-seeking), Storm (3-minute), Streak (solve-until-fail) — `packages/core/src/puzzle-set.ts`, `apps/web/src/puzzle-screen.ts`, `puzzle-menu.ts`
- 12 individually trainable puzzle themes (mateIn1, mateIn2, backRankMate, fork, pin, skewer, discoveredAttack, deflection, sacrifice, hangingPiece, endgame, promotion) — `apps/web/src/puzzles.ts:54-66`
- Coordinate trainer: 30-second timed runs, find-the-square and name-the-square, average kept **separately per board orientation** — `apps/web/src/coordinate-screen.ts`
- Study screen: paste or hand over a game, then run Game Review on it — `apps/web/src/study-screen.ts`

### COMPETE

- Live, server-authoritative multiplayer games (see PLAY) that are rated once they reach the move floor
- Signed scoresheet → derived Elo rating, path-dependent and canonically ordered — `packages/core/src/scoresheet.ts`, `elo.ts`
- Solo puzzle rating: a run of puzzles server-witnessed and countersigned, ratable with **one** wallet — `packages/core/src/puzzlecard.ts`, `packages/server/src/witness.ts`, `apps/web/src/witnessed-run.ts`
- Rating graph over a player's signed-game history — `apps/web/src/rating-graph.ts`

### OWN

- `sign()` on the finished game by both players — the scoresheet, not a login — `apps/web/src/sign-game.ts`
- The **Recompute** button: an independent, in-browser verifier (`@noble/ed25519` + `@noble/hashes`, not `@nimiq/core`/WASM) that re-derives the rating from raw signatures — `apps/web/src/verify-browser.ts`
- Record page: every signed game in canonical order, rating before/after each — `apps/web/src/record.ts`
- Public certificate page `/c/<gameId>`: a finished game a stranger opens with no wallet/app, that rebuilds the signed text and verifies both signatures client-side — `apps/web/src/certificate-page.ts`, `certificate.ts`
- Certificate-as-image export (1080×1350 canvas, both signatures in full, both identicons) and PGN export, both built from the stored game rather than screen state — `apps/web/src/certificate.ts`, `share-game.ts`, `share-actions.ts`

### EARN

- Puzzle pool: solving the daily puzzle pays real NIM, memo carries a short hash of the puzzle id (auditable against the bundled set) — `packages/server/src/pool.ts`, `apps/web/src/pool-client.ts`
- Pool abuse limits: one claim per wallet per (puzzle) day, one per device per day (via `requestDeviceIdentifier`), a hard daily luna ceiling that funds only from staking rewards — `packages/server/src/pool.ts:162` (`already-claimed`), `:175` (`device-claimed`), `:179-181` (`budget-spent`)
- Player-initiated NIM sends: tip an opponent after a game, or top up the pool, from the player's own wallet via `sendBasicTransactionWithData` — `apps/web/src/send-nim.ts`
- Staking arithmetic: delegate the pool wallet to a validator, compute a safe daily payout budget from rewards only, principal never spent — `packages/server/src/staking.ts`, `stake-cli.ts` (a manual CLI, never run automatically)

### Discrepancy found: `NOTICES.md` claims a feature that does not exist in source

`NOTICES.md`'s Data table states the Lichess public tablebase API is **"Called at runtime"** for
"Perfect endgame judgement" and is **"credited on the screen that uses it."** A repo-wide,
case-insensitive search for `tablebase` across `apps/`, `packages/`, and `scripts/` returns **zero
matches**. `SPEC.md` also lists it as `BUILD — verified reachable`, and `README.md`'s "What is
built" table never mentions it. **This feature is documented as shipped in `NOTICES.md` but is not
present anywhere in the code.** Likewise, `SPEC.md`'s planned board editor and second piece set are
absent from source (`apps/web/src/settings.ts` defines only one piece set and no editor route).

---

## 2. The engine (`packages/core/src/search.ts`, `position.ts`, `engine.ts`)

**Move generation / board representation:** a hand-written **0x88 board** (`packages/core/src/position.ts`), not `chess.js`. Zobrist hashing for the transposition table (`position.ts:150` "Zobrist hashing"). Legal-move generation with pin/check filtering during generation.

**Search techniques present, by name, as documented in `search.ts`'s own header (verified against the code, not just the comment):**
- Alpha-beta with **iterative deepening** (`Searcher.run`, `search.ts:640-`)
- **Transposition table** on Zobrist keys, `Map<string, Entry>`, capped at `1 << 20` entries and cleared (not evicted) when full (`search.ts:284,` `MAX_ENTRIES`)
- **Killer move** ordering, two killers per ply (`search.ts:348`, `this.killers`)
- **History heuristic** ordering, `depth²` increment on a beta cutoff (`search.ts:350,583`)
- **Null-move pruning**, `depth - 3` reduction, disabled in check and disabled when only pawns+king remain (zugzwang guard, `hasPieces()`) (`search.ts:513-524`)
- **Late move reductions (LMR)** on quiet moves after the 3rd legal move, reduction `1 + floor(legal/8)`, with full-depth re-search on failing high (`search.ts:555-566`)
- **Check extensions**: a move that gives check searches one ply deeper (`search.ts:542-544`)
- **Quiescence search** with **delta pruning** (margin 200 centipawns over the captured piece's value, exempting promotions) (`search.ts:449-484`, guard at `:475`)
- No aspiration windows found in the code (root window is `[-WIDEST, WIDEST]`, `WIDEST = 4_000_000`, deliberately finite — see the code comment explaining why `Infinity` was a real bug with null-move pruning)

**Evaluation terms:** material on the conventional scale (P100/N320/B330/R500/Q900/K20000) plus Piece-Square Tables per piece type, from Tomasz Michniewski's published *Simplified Evaluation Function* (`search.ts:70-160`, credited in `NOTICES.md`). No mobility, king-safety, or pawn-structure terms beyond the PST were found in `search.ts`.

**Time management:** every search is **time-budgeted, not depth-budgeted** (`SearchLimits.budgetMs`); iterative deepening returns the deepest *completed* iteration when the deadline hits (checked every 2048 nodes, `search.ts:384-386`, so `Date.now()` is not polled every node). Bot levels each carry their own `budgetMs` (Pip 60 ms, Nell 150 ms, Vera 400 ms, Oskar 900 ms; default fallback `DEFAULT_BUDGET_MS = 900`, `engine.ts:39,84-87`). Game Review uses a separate fixed 300 ms/position budget (`analysis.ts:206`, `ANALYSIS_LEVEL.depth = 30` so time, not depth, stops it).

**Threading/worker model:** the search itself is single-threaded synchronous JS. It runs on the main thread for bot moves. For Game Review it is moved off the main thread into **one** dedicated Web Worker (`new Worker(...analysis-worker.ts...)`, only call site: `apps/web/src/study-screen.ts:328`) so the board does not freeze during a ~12-second review. No `SharedArrayBuffer` / multi-worker parallel search was found.

**Perft coverage** (`packages/core/test/position.test.ts`), exact depths run per position — **not** uniformly depth 5 as README's prose states, despite the header comment claiming "perft-verified to depth five on six standard positions":

| Position | Depths verified |
|---|---|
| Starting position | 1–5 |
| Kiwipete | 1–4 |
| A promotion endgame (position 3) | 1–5 |
| An asymmetric middlegame (position 4) | 1–4 |
| Rights lost to a captured rook (position 5) | 1–4 |
| A quiet middlegame (position 6) | 1–3 |

So only **2 of the 6** positions are actually perft-verified to depth 5; the other four stop at depth 3 or 4. Additionally, move generation is compared move-for-move against `chess.js` across 60 random games of up to 60 plies each (`position.test.ts:127-`, "thousands of random positions").

**Measured speed (this run, this machine):** `npm run counts` → the `⭐ and it is fast enough to be worth having` perft-rate test passed (floor asserted: >500,000 nodes/sec; the actual rate printed to console is not captured in the TAP summary parsed by `counts.mjs`, so the specific number this machine reached was not separately logged by this run — only that it cleared the floor).

**Measured tactical accuracy** (`node scripts/strength.mjs`, defaults: Oskar level, 300 ms/move, 40 puzzles/band, run 2026-09-08 in this environment):

| Rating band | First-move found | Whole line held |
|---|---|---|
| 800–1199 | 100% | 100% |
| 1200–1499 | 93% | 93% |
| 1500–1799 | 95% | 93% |
| 1800–2099 | 90% | 88% |
| 2100–2399 | 90% | 88% |
| 2400–3000 | 85% | 73% |
| **Overall (240 puzzles)** | **92%** | **89%** |

`README.md` itself quotes two different figures for this measurement: its main "What is built" table (line 52) says *"it finds the key move in 91% and holds the whole line in 86%"* (no stated `perBand`, so presumably the script's default), while its NNUE comparison table (line 169) quotes a **separate, larger run** — "Lichess puzzles, 300 ms, 360 puzzles" → **91% first / 87% whole line** (i.e. `perBand=60`, 6 bands × 60 = 360). My own reproduction under the script's actual current default (`perBand=40`, 300 ms, 240 puzzles) got **92%/89%** — close to but not identical to either README figure. All three runs use the same bundled, deterministically-ordered puzzle subset, so sample selection is not the variable; the gap is most plausibly the 300 ms wall-clock search budget being genuinely hardware/timing-sensitive (the script's own header says the result is machine-dependent) and/or the default `perBand` having changed between when those two README figures were written. Reported here as run, not reconciled.

**NNUE (`packages/core/src/nnue.ts`) — built, tested, but not shipped, and not independently reverified here:** a complete port of akimbo v1.0.0's evaluation network. Its 10 tests in `packages/core/test/nnue.test.ts` are **skipped locally** (confirmed: `node scripts/counts.mjs` → 10 of 526 tests skipped, all in `nnue.test.ts`, gated on `existsSync(NET)` for a vendored network file that is not present in this checkout — matching `README.md`'s claim that nothing imports it and no build step downloads the 6.3 MB network). The exact-agreement-with-the-real-akimbo-binary claim (`scripts/nnue-agrees.mjs`) requires building akimbo from Rust source, which was not attempted in this environment — **NOT VERIFIED** here. Likewise the self-play (+104 Elo, 64.6% score, 120 games) and the Byrne–Fischer regression (`17...Rfe8+` called a blunder at 300 ms) are `README.md`'s own reported numbers, not reproduced in this session.

---

## 3. The analysis / Game Review pipeline (`packages/core/src/analysis.ts`)

- One engine search per **position** (not per move): the position after White's move is the position before Black's, so each ply's "before"/"after" scores are read from adjacent searches of the same table rather than two independent roots — this is explicitly why the code does it this way (avoids the two-searches-disagree-by-a-few-centipawns bug).
- Formulas are **Lichess's published accuracy method** (`lichess.org/page/accuracy`), implemented from the description, not from AGPL code:
  - `winPercent(cp) = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`
  - `moveAccuracy(winBefore, winAfter) = max(0, 103.1668 * exp(-0.04354 * lost) - 3.1669)`
  - Game accuracy = average of the **volatility-weighted mean** and the **harmonic mean** of per-move accuracies, window sized `max(2, min(8, ceil(plies/5)))`.
- Judgement thresholds (`best`/`good`/`inaccuracy`/`mistake`/`blunder`) are derived by pushing the conventional ½/1/2-pawn cutoffs through the same win% curve: ≈4.6, 9.1, 17.6 points of winning-chance loss from an even position.
- ACPL (average centipawn loss) per side, each move capped at 1000 cp (a queen), with best/theory moves costing zero.
- **Book-move exemption**: an opening-book move only overrules the engine's small complaints, never a loss past the blunder threshold — a hard-coded guard against a tiny engine calling `1...e5 2.Nf3` a mistake, verified against a stated measurement in the code comment (a book Ruy Lopez scored 67% before this rule existed).
- A move matching the engine's own best move at that position scores exactly zero loss "by construction" — an explicit anti-noise rule.
- Shown to the user: per-move judgement badges (★/?! etc.), best-move arrow, live evaluation bar with a plain-English "White/Black is ahead — N%" line, and the two aggregate numbers (accuracy %, ACPL) per side. It states on the review screen itself that it is club strength, not Stockfish (verified as a `look.mjs` check: "⭐ and it does not claim to be Stockfish" — PASS).
- Runs in a Web Worker (`analysis-worker.ts`) with progress callbacks so the UI shows a progress bar rather than freezing.

---

## 4. Puzzles

- **Exact count: 5,000**, verified by parsing the `PUZZLES` template literal in `packages/core/src/puzzles-data.ts` (5,022 raw lines in the file including the header comment; 5,000 actual puzzle rows).
- **Source:** Lichess puzzle database, CC0-1.0 (`NOTICES.md`). Sampled evenly, 500 per rating band across ten 200-300-point bands from 400 to 3000, filtered to popularity ≥90, ≥1,000 plays, rating deviation ≤80 (`puzzles-data.ts` header comment).
- **Format on disk:** one puzzle per tab-separated line — FEN, UCI solution moves (opponent's move first), rating, comma-separated theme indices into a 45-entry `PUZZLE_THEMES` array. Loaded via a dynamic `import()` so Vite emits it as its own 442 KB chunk, never in the main bundle.
- **Modes (4):** Daily (deterministic FNV-1a hash of the date, drawn from the 1000–1800 rating band so it's broadly solvable), Train (rating-seeking, widening rating window 100→200→400→800→∞ until a puzzle is found, avoids repeats), Storm (3-minute timed run), Streak (solve until you fail).
- **12 individually trainable themes**, narrowing the pool before the rating window is applied: mateIn1, mateIn2, backRankMate, fork, pin, skewer, discoveredAttack, deflection, sacrifice, hangingPiece, endgame, promotion.
- **Rating maths (`packages/core/src/puzzle-set.ts`):** fixed-K Elo, `K = 24`, start `1200`, floor `400`. `nextPuzzleRating(rating, puzzleRating, solved) = max(400, round(rating + 24 * (solved?1:0 - expected)))`, `expected = 1/(1+10^((puzzleRating-rating)/400))`. The code states this fixed-K approximation is valid *because* every bundled puzzle was sampled with Glicko rating deviation ≤80 (a condition under which fixed-K Elo and Glicko stay close), not an arbitrary simplification.
- **Solo (witnessed) puzzle rating** is a separate, signed track from the offline in-browser puzzle rating: it needs the server (`packages/server/src/witness.ts`) to have chosen and countersigned the run — see §6.

---

## 5. Bots (`packages/core/src/engine.ts`)

Exactly **4** bots, no elo ratings shown (`LEVELS` array, `engine.ts:83-88`):

| Name | Depth (plies) | Budget | Blunder rate | Blunder reaches | Book plies |
|---|---|---|---|---|---|
| Pip | 1 | 60 ms | 35% | 2nd–5th best (`blunderDepth=4`) | 2 |
| Nell | 3 | 150 ms | 15% | 2nd–4th best (`blunderDepth=3`) | 4 |
| Vera | 6 | 400 ms | 5% | 2nd–3rd best (`blunderDepth=2`) | 6 |
| Oskar | 14 | 900 ms | 0% | — | 8 |

**Weakening mechanism:** iterative deepening inside the level's time budget (never depth-only), plus a per-level chance of deliberately playing the **2nd/3rd/etc.-ranked** root move from the search's own ranked move list — never a random legal move, explicitly to avoid the "plays well, then hangs a queen at random" failure mode.

**Opening book:** 2,833 named lines (public-domain, CC0, from `lichess-org/chess-openings`), up to 12 plies, tab-separated ECO/name/SAN-moves, parsed into a trie at load (`packages/core/src/openings.ts`, `openings-data.ts`). Book use is origin-checked — a board constructed from a mid-game FEN with an empty replay history is refused book moves, specifically to prevent an out-of-context book move being played as if it were opening theory.

**No engine-vs-engine playing-strength rating is claimed anywhere in the repo** — `README.md` explicitly says "No ratings on them. A number on a bot this weak would be a lie."

---

## 6. Rating — exact algorithm and where it lives

Two independent, both-signed rating tracks, never stored as an authoritative row — both are *derived* by walking canonically-ordered signed records.

**Game rating (`packages/core/src/elo.ts`):**
- Starting rating 1200, floor 100.
- K = 32 provisional (first 20 rated games), K = 16 established.
- **Per-opponent K decay**, keyed on how many rated games the pair has already played: full K for games 1–2 against one opponent, half K for games 3–9, **K = 0 (no movement) from game 10 onward** — the anti-farming mechanism, since wallets are free.
- A rating is "established" only once it has met **10 distinct opponents** (`DISTINCT_OPPONENTS_FOR_ESTABLISHED`); every screen is expected to show this.
- Games under 10 full moves do not rate (`MIN_MOVES_TO_RATE`).
- Canonical ordering: `endedAtBlock` ascending, `gameId` ascending as tiebreak — both fields are inside the signed scoresheet text, so ordering is not something the server asserts.
- Rounding: half-away-from-zero (not `Math.round`'s round-half-up), specifically so a losing player's negative delta rounds symmetrically with a winning player's positive one.
- `computeRatings()` is a pure function of an array of `RatedGame` — no clock, no DB, no config — so the server and the in-browser recompute page cannot structurally disagree.
- Bot games are always `rated: false` (`apps/web/src/game.ts:542`) — permanently unrated, "the same call Lichess makes." Live games are rated once they reach ≥10 full moves (`online-screen.ts:788`).

**Puzzle (solo) rating (`packages/core/src/puzzle-set.ts` + `puzzlecard.ts` + `packages/server/src/witness.ts`):**
- Fixed K=24, start 1200, floor 400 (see §4).
- Requires a **witnessed, signed "puzzle card"**: the server (holding a private witness key that is deliberately *not* published, unlike the bot's) chooses the puzzles, countersigns the run, and the solver signs it — mirrors the scoresheet's "one signature proves nothing" rule.
- The server holds no rating for anyone; `ratingBefore` is asserted by the client and only accepted as consistent if a recompute walking every prior card from `PUZZLE_START` lands on it — an inconsistent chain surfaces as `brokenAt` on the record page.

**What is signed, exactly:** the scoresheet is **12 lines** (`SCORESHEET_VERSION`, `chain`, `gameId`, `white`, `black`, `result`, `termination`, `moveCount`, `finalFen`, `endedAtBlock`, `movesHash`, `rated`/`casual`) joined by `\n` plus a trailing empty line (`packages/core/src/scoresheet.ts:177-190`). `parseScoresheet` refuses anything that does not re-serialise to byte-identical input (rejects e.g. `007` vs `7` for the same integer). The puzzle card format mirrors this exactly (`puzzlecard.ts`).

**The digest actually signed by a Nimiq wallet** (`packages/verify/src/index.ts`, cross-checked against `nimiq/keyguard`'s own published test vectors in `packages/verify/test/keyguard-vectors.test.ts`):

```
SHA-256("\x16Nimiq Signed Message:\n" ‖ decimal(UTF-8 byte length of message) ‖ message)
```

— computed from the message's **UTF-8 byte length**, not `message.length` (UTF-16 code units); the code comment states this distinction was found to be a real, previously-shipped bug pattern in Nimiq's own published snippet.

**Recomputability:** two implementations of the verifier exist and are checked against each other's outputs — `packages/verify/src/index.ts` (server-side, uses `@nimiq/core`/WASM) and `apps/web/src/verify-browser.ts` (client-side, `@noble/ed25519` + `@noble/hashes`, no WASM). The browser one is what the Recompute button runs; it is checked against `@nimiq/core`'s own address derivation over 200 random keys (`apps/web/test/verify-browser.test.ts:59`, confirmed by reading the loop bound).

---

## 7. Nimiq surface — every provider/host call, with file:line, and honesty about real NIM

All calls guarded behind optional chaining; the app is fully usable with no provider present (`tier()` returns `'none'`).

| Call | File:line | What it's for | Ever moved real NIM? |
|---|---|---|---|
| `window.nimiq.listAccounts()` | `apps/web/src/wallet.ts:176` | Get the player's address, on a tap only, never on page load | N/A (identity, not a payment) |
| `window.nimiq.sign(text)` | `apps/web/src/wallet.ts:202` | Sign the canonical scoresheet / puzzle card bytes — **this is the rating** | N/A (a signature, not a transfer) — but this is the one integration the repo calls **"Live"** and fully exercised end to end (`PLAN.md`: *"`sign()` is the rating — two signatures, and the rating derives from them" → **Live.** Tested end to end, and recomputable by a stranger in their own browser*) |
| `window.nimiq.isConsensusEstablished()` | `apps/web/src/wallet.ts:221` | Ask if the wallet is synced before signing, to give a better error than a 2-minute timeout | N/A |
| `window.nimiq.getBlockNumber()` | `apps/web/src/wallet.ts:234` | Stamp `endedAtBlock` in the scoresheet, the canonical ordering key | N/A |
| `window.nimiq.sendBasicTransactionWithData({recipient, value, data, ...})` | `apps/web/src/send-nim.ts:103` | Player-initiated sends: tip an opponent, top up the pool, from the player's own wallet | **No.** `PLAN.md`, quoted verbatim: *"Player-initiated sends — tip the opponent, top up the pool \| Built. **Never sent real NIM**"* |
| `window.nimiqPay.requestDeviceIdentifier({reason})` | `apps/web/src/wallet.ts:250` | Anonymous per-device handle, the pool's one-claim-per-device-per-day key | N/A (rate-limit key, not a payment) |
| `window.nimiqPay.language` | `apps/web/src/i18n.ts:44` | Host-provided ISO 639-1 language, drives the 5-language UI | N/A |
| Server-side: `@nimiq/core` `Transaction`/`TransactionFlag`/`SignatureProof`/`KeyPair` for pool payouts | `packages/server/src/nimiq-payout.ts:26-33`, `pool.ts` | Sending a puzzle-solver their NIM reward, memo = short hash of the puzzle id | **No.** `README.md`, quoted verbatim: *"**The pool has no NIM in it.** Everything above the wallet is built and tested — the limits, the ceiling, the transaction, the memo, the staking — and a stand-in node in the test suite verifies every signature exactly as a real one would. What is missing is a funded wallet."* |
| Server-side: `@nimiq/core` staking transactions (`delegate`, `addStake`) | `packages/server/src/staking.ts`, `stake-cli.ts` | Delegating the pool wallet to a validator so rewards (never principal) fund payouts | **No.** `PLAN.md`, quoted verbatim: *"Staking arithmetic — payouts from rewards, never the principal \| Built in `packages/server/src/staking.ts`. **Never run; the pool is not staked**"* |

**The repo's own summary, quoted verbatim** (`PLAN.md`, "The honest starting position"): *"Five Nimiq integrations are **built and tested**. Exactly one of them has ever moved real NIM"* — and that one is `sign()`, which is a signature rather than a transfer of value; **no path in this repository has ever moved real NIM on chain**, by the repo's own account. `stake-cli.ts` is a manual, human-run CLI (`delegate`, `report` subcommands) — explicitly never invoked automatically by any server code.

The six player-wallet staking methods Nimiq's provider exposes (`sendNewStakerTransaction`, `sendStakeTransaction`, `sendSetActiveStakeTransaction`, `sendUpdateStakerTransaction`, `sendRetireStakeTransaction`, `sendRemoveStakeTransaction`) are **not called anywhere in `apps/web/src`** — confirmed by grep. `PLAN.md` proposes two features to use them (a staked tournament, staking to fund the pool) but neither has any source file under `packages/` or `apps/` — they are unbuilt proposals, not shipped code.

---

## 8. Test surface

Run 2026-09-08, this checkout, Node v22.17.0:

- **`node scripts/counts.mjs`** → runs `npm test` once across all 4 workspaces and parses each workspace's TAP summary.
  - **526 total unit tests**, **516 passed**, **0 failed**, **10 skipped**. All 10 skips are in `packages/core/test/nnue.test.ts`, gated on a vendored NNUE network file not present in this checkout (`existsSync(NET)` guard) — consistent with the network deliberately not shipping.
  - Per-workspace breakdown (confirmed by running each workspace's `npm test` individually): `packages/core` 218 tests (10 skipped), `packages/server` 131 tests, `packages/verify` 20 tests, `apps/web` 157 tests = 526.
  - Self-check: the script fails if `README.md`'s stated "526 unit tests" figure disagrees with the count — it currently agrees.
- **`node scripts/design-metrics.mjs`** → measures WCAG contrast for every CSS custom-property pair actually defined in `apps/web/src/styles.css` (light + dark, all 3 board themes × state markers). **156 contrast pairs measured, all 156 pass**, all 50 design tokens resolve. Self-checked against `README.md`'s stated "156 contrast pairs."
- **`node scripts/licences.mjs`** → reads `license` straight from each production dependency's own `package.json` and cross-checks `NOTICES.md`. All pass (see §10).
- **`npm run look`** (`scripts/look.mjs`, 4,161 lines) → builds the app, starts the real API server, drives it in **two real Chromium browser contexts via Playwright** (`playwright` devDependency), including a complete signed two-player game played over the real live-game server. **472 checks, all 472 passed**, self-checked against `README.md`'s stated "472 checks." It also: takes a screenshot of every screen in light and dark and asserts nothing overflows a 390px viewport; walks the README's own quoted button names (Resign, "Sign the result so it counts", "See your record", "Recompute it here", Train, "Make my runs count") against the live DOM rather than hard-coding them; tests the app fully offline behind the service worker (cold route open, puzzle chunk served from cache, API explicitly never served from cache); tests wallet failure/decline paths; asserts zero console errors. Screenshots land in `shots/` (present in the repo, e.g. `shots/01-board-dark.png` through `shots/54-no-wallet-ending.png`).
- **`npm run check`** = `typecheck && counts && licences && design && look`, in that order — the single command that runs and cross-checks everything above.

---

## 9. Everything the repo itself admits is missing or unbuilt

Quoted verbatim, with source file.

**`README.md`, "What is not done":**

> "**The pool has no NIM in it.** Everything above the wallet is built and tested — the limits, the ceiling, the transaction, the memo, the staking — and a stand-in node in the test suite verifies every signature exactly as a real one would. What is missing is a funded wallet, which is the one thing code cannot supply."

> "**A Stockfish-class network was built, measured, and rejected.**" [the NNUE network — built, then not shipped because it made Game Review *worse* at a fixed time budget, per the measured Byrne–Fischer regression]

> "**The engine is ours, and it is about club strength — not Stockfish.** ... Puzzles generated from players' own blunders, and bots at an exact rating, are the next things it unlocks and are not built."

> "**Coaching payments are specified and not built** (`SPEC.md` K5)."

> "**A witnessed run can be abandoned rather than signed.**" [a solver can decline to sign a bad puzzle run; the witness then refuses to open a second run while one is outstanding, "which makes retrying cost an hour rather than a tap — that is a deterrent, not a proof"]

> "**No fiat figure anywhere.** Nimiq Pay does not expose the user's currency ... at **$0.00034 a NIM** (7 September 2026) every amount in this app would render as `$0.00`."

> "**The rated-run screens are English only so far**, and that is said here rather than left to be discovered: they were built after the dictionaries and their strings are not in them yet." [confirmed: `apps/web/src/witnessed-run.ts` contains zero `t('...')` calls]

**`PLAN.md`, "The honest starting position":**

> "So the pitch 'four load-bearing Nimiq integrations' is an overclaim today, and saying it to a judge who then opens an unfunded pool is worse than saying nothing."

> Table: puzzle pool payouts — "Built, tested against a stand-in node. **Never funded, so no NIM has moved**"; player-initiated sends — "Built. **Never sent real NIM**"; staking arithmetic — "Built in `packages/server/src/staking.ts`. **Never run; the pool is not staked**."

> "The Nimiq provider exposes **six staking methods on the player's own wallet** ... and **no shipped Mini App is built around them**." [true of this repo too — none of the six are called anywhere in `apps/web/src`]

> Two whole proposed features — a staked skill tournament, and staking to fund the pool — are specified in full but have **no corresponding source files** anywhere in `packages/` or `apps/`.

**`PITCH_ANSWERS.md`:**

> Criterion 10 (Completeness): "The pool has no NIM in it. Coaching payments are specified and unbuilt. There is no fiat figure anywhere ... A Stockfish-class evaluation network was ported, verified exact against the real engine, measured, and **rejected with the numbers published**."

> Criterion 18 (Content and storytelling): "A short demo comes before the full one ... **Not yet made.**"

> Criterion 20 (Submission quality): "**Honestly not ready yet:** an app icon and store-style thumbnail, the 250-word submission description, and a demo video."

> Criterion 21 (NIM usage / bonus): "**Said plainly: the pool is not funded yet, so no NIM has actually moved.**"

**`SPEC.md`** (planning doc; explicit BLOCKED/CUT items relevant to what actually shipped): analysis board with Stockfish is `BLOCKED as shipped` (GPL-3.0 vs. this repo's MIT licence); correspondence chess is `BLOCKED` (no push notifications on the platform); 8 chess variants are `CUT for v1`; arena/Swiss tournaments and simultaneous exhibitions are `CUT`; the global opening explorer is `CUT` (Lichess's own API returned 401 when checked); friends/teams/forums/messaging are `CUT`.

**Independently found in this session (not self-admitted in prose, but verifiable in code):** `NOTICES.md` claims the Lichess public tablebase API is called at runtime and credited on-screen — no such code exists (§1). `SPEC.md`'s planned board editor and second piece set have no corresponding source.

---

## 10. Production dependency + licence table

Read directly from each production dependency's own `package.json` `license` field via `node scripts/licences.mjs` (all PASS, cross-checked against `NOTICES.md`), and cross-verified against the four workspace `package.json` files. This is the **complete** production dependency set — nothing else appears in any workspace's `dependencies` (as opposed to `devDependencies`, which additionally include `typescript`, `vite`, `playwright`, `@types/node`, none of which ship to a user):

| Package | Version installed | Licence | Used by (workspace) | What it's for |
|---|---|---|---|---|
| `chess.js` | 1.4.0 | BSD-2-Clause | `apps/web`, `packages/core`, `packages/server` | Move generation/legality (SAN, PGN, book/analysis bridge) — the fast 0x88 board in `position.ts` does not replace it, it sits alongside it for SAN and PGN |
| `@noble/hashes` | 1.8.0 | MIT | `packages/core` | SHA-256 (signed-message digest, scoresheet move hash), Blake2b (Nimiq address derivation) |
| `@noble/ed25519` | 2.3.0 | MIT | `apps/web` | Client-side Ed25519 signature verification with no WASM — powers the in-browser Recompute button |
| `@nimiq/core` | 2.21.0 | Apache-2.0 | `packages/verify`, `packages/server` | Server-side transaction building/signing (pool payouts, staking), server-side signature verification |
| `@nimiq/identicons` | 1.6.2 | ISC | `apps/web` | Wallet-address identicons shown beside opponents, bots, and on certificates |

All 5 are on the project's own allow-list (`MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, CC0-1.0, ISC, 0BSD`, `scripts/licences.mjs`). Non-code assets carrying their own licences (not npm dependencies, credited in `NOTICES.md`): chessnut piece set by Alexis Luengas (Apache-2.0, recolour-stripped so the app can theme it), the Lichess puzzle database and `lichess-org/chess-openings` (both CC0-1.0). The whole repo is MIT (`LICENSE`, and every workspace `package.json`'s own `"license": "MIT"` field).
