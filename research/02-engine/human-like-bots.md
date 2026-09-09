# Human-like bots — the practical question for Scoresheet

This file answers what a browser-only, MIT-licensed, mobile-WebView TypeScript app can actually do,
given the research in `maia.md` and `chessformer.md`, to make its bots feel like real humans at
900/1200/1500/1800 rather than a strong engine wearing a dice roll. Grounded directly in
Scoresheet's own code: `packages/core/src/engine.ts` (four named levels — Pip, Nell, Vera, Oskar —
tuned by `depth`, `budgetMs`, `blunderRate`, `blunderDepth`, `bookPlies`) and
`packages/core/src/search.ts` (alpha-beta search with iterative deepening; the hand-written
`evaluate()` function is confirmed, by reading the file, to score **material, piece-square tables
from the published Simplified Evaluation Function, doubled/isolated pawn penalties, a bishop-pair
bonus, and an open-file rook bonus — deliberately no explicit king-safety term beyond the tables,
per the file's own comment, because "it is the term most likely to be subtly wrong"**). Research
date: 2026-09-08. Unconfirmed claims marked **NOT VERIFIED**.

## 1. What they do

Four sub-questions, in order: **(a)** is running a real Maia-class net client-side actually
feasible for this app; **(b)** what does a cheap alternative look like — an engine whose
move-selection is a softmax over a human-likeness prior rather than a flat blunder rate; **(c)** how
to calibrate a bot's real rating statistically instead of asserting one; **(d)** can personalities
(aggressive / positional / time-pressure) be principled rather than cosmetic re-skins of the same
bot. All four are addressed together in §5, because they are one connected design, not four
separate features.

## 2. Why it works

- The core discipline carried over from Maia and Chessformer (`maia.md` §2, `chessformer.md` §2):
  humanlikeness is a **measurable, held-out move-matching statistic against real games**, not a
  subjective "feels right." Every recommendation below is built to be testable against that
  statistic — the same discipline the academic papers use, applied at a fraction of their scale.
- The insight *not* available to CSSLab (a research lab with a 79M-parameter budget and A100-weeks)
  but available here: Scoresheet doesn't need one model that's simultaneously excellent at 900 and
  1800 — it needs four small, well-separated behavioral profiles built on top of an engine it
  already owns. That is a narrower, statistically easier target, hittable with orders of magnitude
  less compute if the design leans on the existing alpha-beta search rather than trying to replace
  it with a neural net.

## 3. What they do badly

- **Scoresheet's own current bot has no measured humanlikeness number.** `engine.ts`'s levels are
  set by three flat constants (`blunderRate`, `blunderDepth`, `bookPlies`) tuned by feel — there is
  no number in the repo analogous to Maia's ~50–57% move-match accuracy. `SPEC.md` flags exactly
  this gap: bots are shown "without a rating number... a fake rating on a weak bot is a lie the
  engine will later expose" (`SPEC.md` line 1580) — the bots currently carry no number *because*
  nothing has measured what rating they actually resemble.
- **A uniform blunder rate ignores that real human error is position-dependent.** The current design
  rolls one flat probability per move regardless of position; Maia-1's own collective-blunder
  classifier reaches 76.9% accuracy specifically because blunder-proneness is predictable from the
  position, not uniform (`maia.md` §4). A flat roll can produce a "human-looking mistake" in a quiet
  position where no real human at that level would ever blunder — the opposite of the stated design
  goal in `engine.ts`'s own header comment (a blunder should be "the second or third best move, not
  a random legal one").
- **A full Maia-class net is not a drop-in fix.** The transformer-based Maia-3 family has no
  confirmed browser/ONNX path at all (`maia.md` §6–7); even the older, browser-proven Leela-format
  Maia-1 nets (confirmed ~3.3 MB each via ONNX, `hunterchen7/play-lc0` — `maia.md` §6) would mean
  multiplying bundle size by however many rating levels are wanted, running an ONNX runtime inside a
  mobile in-app WebView with unverified WASM SIMD/threading support there, and giving up the
  explainable, tunable, MIT-clean, sub-millisecond properties the existing hand-written engine
  already has — for an accuracy gain (~50–57% move-match, vs. whatever the current blunder model
  achieves, which is **unmeasured**) that hasn't been shown to be worth that cost.

## 4. What we should copy conceptually

- Move-match accuracy against a real reference population as the **acceptance test** for every bot
  level, not "search depth felt right in playtesting."
- **Position-dependent** blunder probability rather than a flat rate — borrowing Maia's
  collective-blunder-classifier idea, at hand-written-evaluation-function scale rather than
  neural-net scale.
- **Unimodal, not monotonic**, personality curves: each named level should demonstrably resemble its
  target band *most* and get worse in both directions — directly testable by running each level's
  moves against real games at multiple rating bands and checking where the match rate peaks.
- **Separate "plausible to a human" from "objectively best"** as two distinct scoring axes
  (Chessformer's GAB idea, `chessformer.md` §4) — even inside a purely classical evaluation
  function, rather than picking the engine's best move and then discarding it for a second-best move
  at a fixed rate.

## 5. What we can do better

### (a) Running a real Maia-class net client-side — feasibility verdict

**Feasible in principle for the CNN-era nets, not free, and blocked by licence for anything strong
enough to matter.** Precedent exists and is proven: `maia-platform-frontend` and the independent
`hunterchen7/play-lc0` project both run Leela-format Maia (the original 6-residual-block CNN — see
`maia.md` §2 architecture) fully client-side via `onnxruntime-web`, WASM backend with optional
WebGPU, at **~3.3 MB per rating-band model** (WebFetch, 2026-09-08). `onnxruntime-web`'s own docs
describe WASM as CPU-universal and WebGPU as up to a 20x speedup over multithreaded CPU when
available (onnxruntime.ai, WebSearch 2026-09-08) — so per-move latency for a network this size
should plausibly be low milliseconds on a modern phone. **No hand-measured number specific to a
mobile in-app WebView was found in this research — this is NOT VERIFIED and should be benchmarked
directly before committing to the approach** (`packages/core/scripts/strength.mjs` already exists in
this repo, per `engine.ts`'s own comment, for exactly this class of measurement, and could be
extended to benchmark a candidate ONNX model against the same time budgets the current levels use).

Even where technically feasible, **licence blocks it for anything worth shipping**: the original
Maia-1 weights are GPL-3.0, and the newer, more accurate Maia-3 family is AGPL-3.0 — both
disqualifying for this MIT bundle, verbatim per the codebase's own reasoning: "Every strong
engine — Stockfish, Leela, Fairy-Stockfish — is GPL-3.0, and shipping one in the bundle would make
the bundle GPL, which disqualifies an MIT submission" (`apps/web/src/bot-identity.ts`, echoing
`SPEC.md` Part L). **Maia-2 is the sole MIT exception** (`maia.md` §7/§9) but ships only as a
PyTorch pip package with no browser/ONNX conversion demonstrated anywhere found in this research —
someone would have to build that conversion from scratch, and while the resulting ONNX file would be
a defensible from-scratch export of MIT-licensed weights, it still costs real bundle size.

**Verdict: don't ship a Maia net now.** The one licence-clean path (Maia-2, converted to ONNX by
this project) is real but is new, unprecedented engineering, adds meaningful download weight to a
Mini App loading inside a mobile WebView, and delivers a capped ~52–57% move-match ceiling that is a
research headline number, not a guarantee the *feel* is right for four cleanly-separated levels.
The alternative in (b) gets most of the same behavioral benefit at a fraction of the engineering
cost and zero licence risk — revisit (a) only if (c)'s own measurements later show it's worth it.

### (b) The cheap alternative: softmax over a human-likeness prior instead of a flat blunder rate

**Concrete mechanism.** Keep `search.ts`'s alpha-beta search exactly as-is for generating the
ranked move list (`findBestMove`'s `result.ranked`) — nothing about move generation or evaluation
needs to change. Replace `engine.ts`'s current `blunderRate`/`blunderDepth` dice roll in
`chooseMove` with a **softmax sampler over that same ranked list**, where each candidate move's
*selection probability* is a function of:

1. **Evaluation loss** relative to the best move, in centipawns (already computed by the search).
2. A small set of cheap, hand-codeable **human-plausibility features**, computable directly from
   the move and `Position`/chess.js metadata already available in the codebase — e.g., is it a
   check or capture (humans overweight forcing moves), is it a natural recapture, does it develop a
   piece toward the center, is it a "quiet" structural move a beginner is statistically unlikely to
   find unprompted.

A **temperature** parameter per level controls how sharply the softmax concentrates on the top move:
near-zero temperature (Oskar) ≈ always plays the engine's best move; higher temperature (Pip)
spreads probability mass across worse moves, weighted toward the ones that *look* human-plausible
rather than uniformly across the whole ranked list.

**Why this beats the current flat-rate blunder.** Every move — not just the "unlucky roll" ones —
becomes a soft sample from a humanlike distribution. Obviously-correct moves a beginner would find
(recapture a hanging piece) stay overwhelmingly likely even at Pip's high temperature, while a
genuinely obscure-but-technically-second-best engine line becomes correspondingly *less* likely to
be sampled as a "mistake" than a move that looks natural but is tactically flawed (a plausible but
wrong developing move). This is the same "second or third best, not a random legal one" instinct
already coded into `blunderDepth` — the improvement is making it continuous and position-sensitive
instead of a single flat probability rolled once per move, which directly answers the position-
dependence gap identified in §3.

**Cost.** Pure TypeScript, no ML framework, no new bundle weight, reuses the search Scoresheet
already ships. This is the single highest-leverage change available given the constraints.

### (c) Calibrating a bot's real rating statistically, instead of claiming one

Never assign a rating number by feel — `SPEC.md` P3 already forbids exactly this (bots are "shown
without a rating number... a fake rating on a weak bot is a lie the engine will later expose,"
`SPEC.md` line 1580). Two independent, complementary measurements earn a real number instead:

1. **Move-match calibration (offline, dataset-based).** Run each level's move-selection function
   (search + the softmax sampler from (b)) against a held-out sample of real rated human games at
   known Elo — a CC0/public dataset, same source class Maia itself used — compute move-match
   accuracy at each rating band exactly as `maia.md` §2 describes, and report the peak: "Pip's moves
   match real ~750–850-rated players' moves most often." Directly reproducible; same methodology as
   arxiv 2006.01855, applied to Scoresheet's own bots.
2. **Outcome calibration (online, live-population-based).** Every Scoresheet game already produces
   a signed scoresheet with a rating outcome (`SPEC.md` Part F), and human-vs-bot games are
   explicitly *never rated* (`SPEC.md` P3) — so the bot's effective *playing strength* can still be
   measured out-of-band: periodically run each level through a private, recorded-but-unrated
   gauntlet against a spread of rated human opponents (or against a fixed-depth public engine as an
   anchor) and fit a performance rating from the win/draw/loss record via the standard logistic
   expected-score formula — the same statistical method chess federations use to rate a player from
   tournament results, not self-assessment.

These two numbers (move-match peak vs. performance rating) are **not guaranteed to agree**, and that
gap is itself useful product information — the same gap the Maia line's own Lichess deployment
shows: `maia1` "targets" 1100-rated moves by training but is reported to play a measured
~1560–1700+ by outcome (`lichess.org` bot profile/forum discussion, WebSearch 2026-09-08, **treat as
indicative, not hand-verified**). Publish both, or at minimum never publish a rating that is
neither.

### (d) Personalities (aggressive / positional / time-pressure) — principled or cosmetic?

Can be made genuinely principled — a different, named *weighting* on the same two axes already in
play, rather than the same bot re-skinned with a different label:

- **Evaluation-term weighting.** `search.ts`'s `evaluate()` already separates material,
  piece-square-table positioning, and three structural terms (doubled/isolated pawns, bishop pair,
  open-file rooks) — confirmed by reading the file. A "positional" personality could weight the
  structural terms more heavily relative to raw material within its normal search tolerance; an
  "aggressive" personality could weight forcing/attacking candidate moves more heavily in the
  softmax sampler's human-plausibility score from (b), even when they're not the objectively best
  move within the level's overall strength budget. Both stay drawn from the *same* underlying
  search and the *same* level's overall blunder tolerance — a personality changes **what kind** of
  move gets sampled, not how strong the bot is.
- **Time-pressure is the one axis that is principled almost for free.** `engine.ts` already runs
  iterative deepening inside a millisecond budget (`budgetMs`, `DEFAULT_BUDGET_MS = 900`, confirmed
  by reading the file). A genuine "time trouble" personality is not a cosmetic label at all — it is
  literally shrinking that budget as the bot's own clock runs low, which mirrors what actually
  happens to a human under a ticking clock: shallower search, earlier cutoffs, worse move quality,
  falling naturally out of the *existing* mechanism with no new search code needed. This is the one
  personality axis with a genuine causal story (less thinking time → worse moves, exactly as for a
  human), rather than a hand-picked stylistic weighting.
- **The honest caveat.** An "aggressive" or "positional" label is defensible only if validated the
  same way as (c): measure whether an "aggressive" bot's recorded games actually show more
  sacrifices/attacking patterns than the base bot at the same overall strength. Skipping that
  measurement step turns any of these labels into exactly the unverified personality-as-marketing
  copy this research task exists to avoid.

## 6. What is technically required

- **(b) softmax sampler**: pure TypeScript addition to `engine.ts`, reusing `result.ranked` from
  `search.ts`; a small set of hand-codeable move-feature flags (is-capture, is-check,
  is-recapture, distance-from-center, developing-move) computable from move/`Position`/chess.js
  metadata already in the codebase; a temperature constant per `Level`. No new dependency.
- **(c) move-match calibration**: an offline Node/TS script alongside the existing
  `scripts/strength.mjs` pattern, loading a CC0/public rated-game dataset (e.g., a Lichess open
  database excerpt, filtered by rating band — the same class of source Maia itself used) and
  computing each level's move-match rate against it per band. Outcome calibration needs a scripted
  gauntlet runner plus a standard Elo performance-rating computation (well-documented, no exotic
  dependency).
- **(d) time-pressure personality**: reuse of the existing `budgetMs`/iterative-deepening mechanism,
  gated on a "remaining clock time" input wherever the bot is invoked mid-game. Aggressive/positional
  personalities need the evaluation function's structural-term weights exposed as tunable parameters
  (currently hard-coded constants inside `evaluate()`, per the file as read) plus the same
  move-feature flags as (b).
- **(a) the Maia-net path**, only if the verdict in §5(a) is later revisited: PyTorch→ONNX export
  tooling, `onnxruntime-web` as a new dependency, and real device benchmarking on a representative
  Android/iOS in-app WebView before any commitment. None of this is required for (b)/(c)/(d), which
  is the point of recommending them first.

## 7. What could break

- **(b)'s feature weights are themselves hand-picked unless closed against (c).** Without running
  the move-match calibration, this design silently reproduces the exact "tuned by feel" problem it
  is meant to fix, just with more knobs. (b) and (c) must be built together, not (b) alone.
- **Public rated-game datasets for (c) need their own licence check** before any excerpt is bundled
  into the repo or shipped as a build-time asset. `SPEC.md` P4 already flags exactly this class of
  risk for the puzzle database ("The puzzle database is 304 MB compressed... it is not free" to just
  bundle) — the same diligence applies to any move-match reference dataset drawn from Lichess or
  elsewhere.
- **Outcome-calibration gauntlets in (c) need enough real games to be statistically meaningful.**
  Early on, with few live users, the performance-rating number will be noisy or unavailable, and the
  app should not present a low-confidence figure as settled — the existing `1284?` provisional-rating
  convention for human players (`SPEC.md` F4) is the right pattern to reuse here too.
- **A too-clever human-plausibility feature set can overfit to "looks human to us" rather than "is
  measurably close to real human move distributions."** (c) exists specifically to catch this — but
  only if it is actually run, not skipped under time pressure.

## 8. What we can uniquely do because of Nimiq

- The gauntlet and move-match recalibration in §5(c) can run **continuously against the app's own
  real, signed game history** rather than a one-time academic snapshot — every signed scoresheet
  (`SPEC.md` Part F) is a labeled, tamper-evident data point Scoresheet owns outright, unlike Maia's
  static Lichess dump. Nimiq's Device Identifier API (per-device anonymous handle, no wallet
  required — `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`, this project) means this data can accumulate from
  real anonymous play without a login wall, closing the loop between "how the bot is calibrated" and
  "who's actually playing it" faster than an academic pipeline ever could.
- Nimiq's feeless, instant NIM rail makes a "help calibrate the bot, earn NIM" loop economically
  trivial to run — a micro-incentive for playing a short, recorded calibration match against a
  specific level — turning §5(c)'s statistical calibration into an actively fundable, ongoing
  product feature rather than a one-off offline research script. This is directly the "earn NIM by
  testing Mini Apps" product shape the competition's own organiser has publicly and unprompted asked
  for (source: `SIP_AND_SHIP_C2_CALL1_FINDINGS.md`, this project).

## 9. Licence and reuse verdict

- Everything recommended in §5(b)–(d) is **original TypeScript written from scratch** against
  Scoresheet's existing engine — no licence exposure at all, and directly consistent with `SPEC.md`
  Part L's instruction to prefer Tier 2 (published technique, reimplemented) over reading or porting
  any GPL/AGPL source.
- §5(a) (a real Maia-class net) is technically feasible only via the **MIT-licensed Maia-2**
  (`github.com/CSSLab/maia2`, GitHub API-confirmed — `maia.md` §7/§9) converted to ONNX from scratch
  by this project; every stronger/more-accurate Maia asset (Maia-1: GPL-3.0; Maia-3/Chessformer:
  AGPL-3.0) is licence-blocked for direct reuse under `SPEC.md` Part L1, and the browser-conversion
  precedent that already exists (`maia-platform-frontend`, `hunterchen7/play-lc0`) is itself
  GPL-3.0/unstated-licence code that must be **observed** (Tier 3) rather than read or ported.
- **Recommended path**: build (b)/(c)/(d) now — zero licence risk, ships in the existing bundle,
  testable immediately — and treat (a) as a possible future upgrade only if (c)'s own calibration
  numbers show the current approach's accuracy ceiling is genuinely a problem worth the
  AGPL-avoidance engineering cost of a from-scratch Maia-2 ONNX port.
