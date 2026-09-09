# Next improvements — ranked, costed, and how each would be proved

Research date: 2026-09-08. Companion to `architecture-ceiling.md`, which argues the 0x88/hand-rolled-JS
architecture is not the binding constraint. This file is the concrete list that follows from that
argument: every technique below is missing from `packages/core/src/search.ts`/`engine.ts` today
(verified by reading the code, not assumed), sourced primarily from the Chess Programming Wiki (CPW)
per `SPEC.md` Part L2 Tier 2 — no GPL engine source was read to produce this list. Does not repeat
`02-engine/{stockfish,fishtest,nnue-training,lc0,maia,human-like-bots,chessformer}.md` or
`11-testing/engine-strength.md`, which already cover the SPRT protocol and the GPL-engine landscape in
depth; this file assumes that protocol and applies it per-item rather than re-deriving it.

**Every Elo figure below is attributed to whoever measured it, or marked NOT VERIFIED.** CPW itself is
frequently silent on precise Elo for a given technique — its own contributors routinely leave that
field blank or point to forum threads with no settled number — and that silence is reported honestly
rather than papered over with an invented figure.

## 1. What they do

One line each, in the order they appear in the ranked table (§5):

| # | Technique | Mechanism in one line |
|---|---|---|
| 1 | Quiescence in-check handling | When the side to move is in check inside `quiesce()`, search all evasions and forbid stand-pat, instead of always doing captures-only with an unconditional stand-pat |
| 2 | Flat typed-array transposition table | Replace `Map<string, Entry>` with a fixed-size array addressed by `hashLow & (size-1)`, with a real per-slot replacement scheme instead of a bulk clear |
| 3 | Combine `evaluate()`'s three board passes | Same terms, one 128-square loop instead of three |
| 4 | Mate distance pruning | Clamp alpha/beta so no line can claim a mate longer than one already found closer to the root |
| 5 | History gravity + malus | Scale history increments so they saturate smoothly, and penalize quiet moves that were tried and did *not* cause a cutoff, not only reward the one that did |
| 6 | Reverse futility / static null-move pruning | At a non-PV node, if `staticEval - margin*depth >= beta`, return beta without searching |
| 7 | Static Exchange Evaluation (SEE) | Walk the capture/recapture sequence on one square (attacker/defender swap-off, x-rays included) to score a capture's true material outcome, replacing MVV-LVA for ordering and the flat delta-pruning margin in quiescence |
| 8 | Aspiration windows | Seed each new iterative-deepening depth's search window from the previous depth's score ± a small margin, widening and re-searching on fail-high/fail-low, instead of always opening `-WIDEST..WIDEST` |
| 9 | Razoring | Near the leaves, if static eval is far below alpha, drop into quiescence (or a reduced verification search) rather than a full-depth search |
| 10 | Internal Iterative Reduction (IIR) | If a node has no transposition-table move, reduce its search depth by one rather than running a separate internal search to find one (IID) |
| 11 | Futility pruning | At depth 1–2 nodes, skip quiet moves whose static eval plus a margin still can't reach alpha |
| 12 | "Improving" flag | Compare static eval now to static eval two plies ago (same side to move) to prune more aggressively when *not* improving, less when improving |
| 13 | Tapered evaluation for every PST | Interpolate every piece-square table (not only the king's) between a middlegame and an endgame value by a numeric game-phase, instead of one flat table per piece |
| 14 | Passed pawn bonus | Detect pawns with no opposing pawn on their file or adjacent files ahead of them; bonus scaling with rank, weighted by king distance in the endgame |
| 15 | Mobility | Count legal (or "safe," i.e. not attacked by an enemy pawn) moves per piece, weighted per piece type |
| 16 | Minimal king safety | Pawn-shield/shelter presence plus a penalty for an open or half-open file next to the king — the cheapest documented version, not a full attacker-weighted king-danger table |
| 17 | Backward/connected pawns, outposts, threats | Smaller structural/tactical terms: an undefendable, non-advanceable pawn; mutually defending pawns on adjacent files; a knight/bishop on a pawn-proof square; a bonus for attacking a hanging or undefended piece |
| 18 | Texel's tuning method | Automatically fit every evaluation constant (existing and new) against a large set of labeled positions via local search minimizing a sigmoid-scaled prediction error against real game outcomes, instead of hand-picked numbers |
| 19 | One-legal-move short-circuit | Return immediately from `run()` when there is exactly one legal move, instead of consuming the full time budget to "find" a forced move |
| 20 | Continuation/countermove history | Index history by "what move followed this specific previous move," not only "this from-to pair, anywhere," as an extra move-ordering signal |
| 21 | Singular extensions | Verify a TT move is uniquely good via a reduced, lowered-window search excluding it; extend it by a ply if every alternative falls well short |
| 22 | Multi-cut pruning | At an expected cut-node, if several reduced-depth move searches each independently beat beta, prune the whole node speculatively |

## 2. Why it works

- **Pruning techniques (6, 8, 9, 11, 21, 22) all trade a small, bounded risk of missing something for a
  large reduction in nodes searched**, which lets iterative deepening reach a materially greater depth
  inside the same millisecond budget — the same trade null-move pruning and LMR (already present) make,
  just at different points in the tree.
- **Ordering techniques (5, 7, 20) work because alpha-beta's whole value depends on trying the best
  move first**: `search.ts`'s own comment already states it precisely — "alpha-beta on a perfectly
  ordered list examines the square root of the nodes an unordered one does." SEE (#7) is the biggest
  remaining gap here specifically because MVV-LVA (already present) is a *heuristic* proxy for "is this
  capture good," while SEE computes the actual material outcome of the full exchange — CPW frames this
  precisely as: SEE separates captures into a good/bad threshold (SEE ≥ 0) that is "superior to MVV-LVA
  alone" for ordering (https://www.chessprogramming.org/Static_Exchange_Evaluation).
- **Evaluation-completeness techniques (13–17) work because they close the gap between "the engine's
  opinion" and "what the position actually is."** Tapered PSTs (#13) specifically fix a known
  discontinuity: CPW's own Tapered Eval page traces the technique to Hans Berliner in 1979 and states
  its purpose is to "remove evaluation discontinuity" that produces "illogical play decisions" at phase
  boundaries (https://www.chessprogramming.org/Tapered_Eval) — our engine has this problem for every
  piece except the king today.
- **Texel's tuning method (#18) works because it replaces "a human guessed 25 centipawns" with "25
  centipawns is what minimizes prediction error against real outcomes," and it is not a small effect
  when applied broadly**: Texel 1.03 is reported to have gained a cumulative **~99.6 Elo** through
  successive tuning passes, with one single jump of **39.4 Elo** from including previously-excluded
  high-noise positions in the training set
  (https://www.chessprogramming.org/Texel%27s_Tuning_Method). That is the single largest attributed
  figure found anywhere in this research pass, and it applies to *all* of our hand-picked constants
  (material values, PST entries, the +40/−20/−15/+25/+12 structural bonuses), not only the new ones.

## 3. What they do badly

- **CPW itself is honest that several of these techniques have no settled Elo number.** Aspiration
  windows: no Elo cited on the page at all, and the page links a 2020 forum thread literally titled
  "Are Aspiration Windows Worthless?"
  (https://www.chessprogramming.org/Aspiration_Windows). Futility pruning: a 2007 forum question "How
  much elo from futility?" is referenced with no answer supplied
  (https://www.chessprogramming.org/Futility_Pruning). SEE-based quiescence pruning, multi-cut,
  singular extensions, IIR, the countermove heuristic: **none carry a CPW-cited Elo figure at all.**
  Only razoring has one, and it is small: Stockfish's 2022 reintroduction by Michael Chaly is credited
  with **~1 Elo** (https://www.chessprogramming.org/Razoring). Treat every unattributed number in any
  other summary of this topic as invented, not sourced from CPW.
- **Every one of Fishtest's own cautions in `fishtest.md` §3 applies here with extra force**: "Elo's
  estimates of passing patches are biased... only unbiased if one takes *all* patches into account,
  both passed and non-passed ones." A list like this one is exactly the kind of thing that produces
  survivorship bias if only the winners get reported later.
- **Singular extensions and multi-cut are both real correctness-hazard territory for a small project.**
  Singular extensions carry a documented theoretical constraint — CPW states singular nodes must stay
  under roughly `1/B` of non-PV nodes (B ≈ 36 in a middlegame) or the search suffers *pathology*, where
  deeper search performs *worse* than shallow — and the technique needs "additional searches per node"
  to even test singularity (https://www.chessprogramming.org/Singular_Extensions). Multi-cut is
  explicitly named "speculative pruning" on its own CPW page, trading a probabilistic risk of pruning a
  relevant line for speed, with the page citing no Elo figure at all
  (https://www.chessprogramming.org/Multi-Cut). Both are heavier, tuning-sensitive machinery that a
  large, continuously-SPRT-tested project (Stockfish) can afford to calibrate and a small project
  cannot easily reproduce the calibration for.
- **Adding many small heuristics to a hand-rolled engine is itself a cost the competition explicitly
  penalizes.** `SIP_AND_SHIP_C2_CALL1_FINDINGS.md` (referenced in this project's own `CLAUDE.md`)
  records the organiser saying plainly that "complexity makes you harder to judge and costs you
  points." A ranked list exists precisely so the highest-value, lowest-risk items get built and the
  long tail (singular extensions, multi-cut) can be named and consciously skipped rather than chased
  for their own sake.

## 4. What we should copy conceptually

- **Fix correctness before chasing Elo.** Item #1 (quiescence in-check) is not on this list because it
  is high-value in Elo terms — it may be small in Elo terms, since check inside quiescence is not the
  common case — it is first because measuring anything else against a search that still has this bug
  measures the wrong engine.
- **Respect the dependency graph, not just the ranking.** Several items share a prerequisite: reverse
  futility pruning (#6), futility pruning (#11), razoring (#9) and the improving flag (#12) all need a
  cheap static-eval call at internal nodes, which `search()` does not currently make at all (only
  `quiesce()` calls `evaluate()` today). Combining `evaluate()`'s three passes (#3) makes that call
  affordable to add; doing it before #6/#9/#11/#12 rather than after is the right order, not merely a
  tidier one.
- **Every item gets an SPRT verdict, not an argument, per the discipline `nnue.ts` already
  established** (port/build, measure at the same time budget, keep only what wins) and per the protocol
  `11-testing/engine-strength.md` already specs (self-play SPRT between build variants, or a puzzle-
  suite regression via `scripts/strength.mjs`'s existing pattern). §5's table names which of the two
  fits each item.
- **Texel-style tuning (#18) should be the *last* structural step, not skipped, and not first.** Tuning
  optimizes existing terms; it cannot invent a term the evaluation doesn't have. The order that
  actually compounds is: add the structurally missing terms (13–17) first, *then* retune everything
  (including the pre-existing +40/−20/−15/+25/+12 constants) together — tuning a five-term evaluation
  and then bolting on four more untuned terms afterward wastes the tuning pass's own value.

## 5. What we can do better

The ranked, costed list — best value first within each tier. "Proof" names the mechanism from `11-testing/engine-strength.md`
that would validate the change: **self-play SPRT** (build-vs-build, per that file's §4/§6) or **puzzle
regression** (`scripts/strength.mjs`'s existing before/after pattern, cheaper and faster to run, but
measures tactics-finding, not general playing strength — use it for a first, cheap gate and self-play
SPRT for the real verdict, exactly as `engine-strength.md` §5 recommends staging STC-then-LTC).

| Rank | # | Item | Expected gain | Bug risk | Proof |
|---|---|---|---|---|---|
| **Tier 0 — fix first** |
| 1 | 1 | Quiescence in-check handling | Not chased for Elo — a correctness fix. Likely improves tactical accuracy in positions with mid-sequence checks; no figure exists to cite | **Low** — narrow, localized change (`quiesce()` only); the risk is *not* fixing it, since a wrong stand-pat while in check is silently wrong today | Puzzle regression first (should never regress; may improve on check-heavy tactics), then fold into the self-play SPRT baseline used for everything after |
| **Tier 1 — cheap infrastructure, low risk** |
| 2 | 3 | Combine `evaluate()`'s three passes | Not an Elo change — same output, fewer full-board walks per leaf. Frees search-time headroom the deeper items below can spend | **Very low** — mechanical refactor, identical output provable by direct equality testing against the old function on a large FEN sample | Output-equivalence unit test (not SPRT — there is nothing to measure, only to not-break) |
| 3 | 2 | Flat typed-array TT | NOT VERIFIED as an Elo number (CPW gives no figure); expected to matter more as a *speed* multiplier (removes a `Map` hash+string-build per node) than a direct strength term, compounding with every technique below it that needs more nodes/sec to pay for itself | **Medium** — a full data-structure swap touching every TT read/write; the existing `search.test.ts` mate-finding and score-sign assertions are a good regression net but do not exercise replacement-policy edge cases directly | Self-play SPRT at a fixed node (not time) budget to isolate structural correctness from timing noise, then a time-budgeted run to confirm the throughput gain is real |
| 4 | 4 | Mate distance pruning | CPW: "will not add much to a program's playing strength" on its own — cited mainly for smaller trees in forced-mate lines, not a general Elo gain (https://www.chessprogramming.org/Mate_Distance_Pruning) | **Very low** — a small alpha/beta clamp using the existing `MATE` constant, no interaction with pruning heuristics | Puzzle regression on the mate-in-N puzzle bands specifically (tree-size reduction should be visible even if Elo isn't) |
| 5 | 5 | History gravity + malus | NOT VERIFIED — CPW's History Heuristic page describes the mechanism (scale updates, clamp to ±MAX_HISTORY, penalize non-cutoff quiet moves) without citing an Elo figure for adding it (https://www.chessprogramming.org/History_Heuristic); Counter Moves History specifically is noted as added in Stockfish 7 (2016) "mentioned to gain some Elo points" with no number given | **Low** — confined to the existing `history` array's update logic in `search()`'s cutoff branch | Self-play SPRT — this is exactly the kind of small, cumulative move-ordering change SPRT is built to detect over a wider Elo window (e.g. `[-10, 30]`) |
| 6 | 19 | One-legal-move short-circuit | Not an Elo change — a latency/UX fix (the bot currently burns its full budget "finding" a move it had no alternative to) | **Very low** — a single early-return guard in `run()` | No SPRT needed; verify with a wall-clock timing test on a handful of one-legal-move FENs |
| **Tier 2 — medium cost, well-documented, real value** |
| 7 | 7 | Static Exchange Evaluation (SEE) | NOT VERIFIED as a specific Elo figure (CPW cites none for either use), but this is the single highest-confidence *qualitative* win on this list: it replaces two things at once — MVV-LVA ordering (a heuristic proxy) and the flat `+200` quiescence delta margin (a material-blind threshold) — with the actual computed exchange outcome, which is precisely the two places CPW names SEE as designed for (https://www.chessprogramming.org/Static_Exchange_Evaluation) | **Medium-high** — the swap-off algorithm must handle x-ray attackers (a rook behind a rook, a queen behind a bishop) correctly or it silently misjudges captures; CPW notes "pin aware SEE" is a separate, harder correctness question raised in its own forum links | Self-play SPRT, staged: first gate on "does this ever crash or hang on the existing perft/search test suite," then a wide-window SPRT (e.g. `[-20, 40]`) since a wrong SEE can just as easily lose Elo as gain it |
| 8 | 8 | Aspiration windows | NOT VERIFIED — CPW cites no figure and links a thread skeptical it helps at all in some conditions; Stockfish is cited only for *how* it widens ("starts with a rather small... window, and increases the bound that fails in an exponential fashion"), not for how much it's worth (https://www.chessprogramming.org/Aspiration_Windows) | **Medium** — a fail-low/fail-high loop interacts with the time budget (a re-search costs time that iterative deepening's next depth would otherwise use); done wrong, it can *cost* nodes rather than save them at a millisecond-scale budget rather than Stockfish's typical multi-second one | Self-play SPRT specifically at this engine's own realistic budgets (60 ms–900 ms, per `engine.ts`'s `LEVELS`), since the technique's value is time-control-dependent |
| 9 | 9 | Razoring | **~1 Elo**, attributed to Michael Chaly's 2022 Stockfish reintroduction (https://www.chessprogramming.org/Razoring) — small, but it is the one number on this entire list with a named source and a named engine | **Medium** — CPW: "Classical Razoring is known for being risky... particularly regarding mate detection"; Stockfish's own reintroduction needed explicit "precautions... to prevent razoring from interfering with mate finding" | Self-play SPRT with a narrow window (the attributed figure is ~1 Elo, so a wide window would never distinguish it from noise) — or accept this is a "probably fine, low-cost, hard to prove at our scale" item and gate it on the puzzle regression not regressing, rather than trying to prove ~1 Elo with a small project's compute |
| 10 | 10 | Internal Iterative Reduction (IIR) | NOT VERIFIED as a number, but CPW confirms current adoption in "major engines like Stockfish and Ethereal" and frames it as IID's replacement; separately, CPW's own IID page calls IID "pretty much a washout on average" for Elo, valued mainly for making search *time* more predictable (https://www.chessprogramming.org/Internal_Iterative_Deepening, https://www.chessprogramming.org/Internal_Iterative_Reductions) — **recommend IIR specifically, not IID**, on this evidence | **Low** — a depth reduction guarded on "no TT move," no new search calls | Self-play SPRT, wide window — this is a small, well-isolated change |
| 11 | 6 | Reverse futility / static null-move pruning | NOT VERIFIED — CPW gives an example margin (`150 * depth`) with no attributed Elo | **Medium** — CPW explicitly warns against using it in check and at PV nodes "to prevent unsoundness near mate scores"; needs the static-eval-at-every-node prerequisite from Tier 1 | Self-play SPRT, wide window first pass, narrow confirmation once the margin is tuned |
| 12 | 11 | Futility pruning | NOT VERIFIED — CPW cites forum discussion asking for a number with none supplied | **Medium** — CPW: "requires checking for the existence of at least one legal move to avoid returning erroneous stalemate scores"; must exclude captures, checks, and being-in-check | Self-play SPRT, wide window |
| 13 | 12 | "Improving" heuristic | NOT VERIFIED — no Elo cited | **Low-medium** — cheap once static eval is available per node ("straightforward pointer arithmetic and comparison," per CPW), but it changes the pruning aggressiveness of *every other* pruning term it feeds (reverse futility, LMR, futility), so its interaction effects need the same SPRT gate as those terms, not a standalone one | Self-play SPRT, run *after* items 6/11/12 are already in, since its value only exists in combination with them |
| **Tier 3 — evaluation completeness** |
| 14 | 13 | Tapered evaluation for every PST | NOT VERIFIED as a specific figure for this exact change, but CPW frames untapered PSTs as a known, historically significant weakness (traces to Fruit's release popularizing the fix) — high plausible value given every non-king piece in our evaluation is untapered today | **Low-medium** — a well-published formula (`(mg*phase + eg*(256-phase))/256`); risk is mainly in getting the phase-weight table and the new endgame PST *values* right, not the mechanism | Self-play SPRT — this changes evaluation output on almost every position, so a wide-window test is appropriate before narrowing |
| 15 | 18 | Texel's tuning method | **~99.6 Elo cumulative**, attributed to Texel 1.03's successive tuning passes, with one single jump of **39.4 Elo** from including previously-excluded high-noise positions (https://www.chessprogramming.org/Texel%27s_Tuning_Method) — the largest attributed figure in this entire document, but it applies to *retuning an evaluation that already has the terms in it*, not to adding new ones on its own | **Medium** — needs real infrastructure (a labeled position/outcome dataset, an optimizer loop, ~25 minutes to compute one gradient on 16 cores per CPW's own figures) that this project does not have yet; "correlation does not imply causation" is CPW's own stated risk — a tuned term can fit noise in the training set | Run *after* items 13–17 are in, then self-play SPRT the tuned constants against the hand-picked ones — this is the one item whose own proof step (the tuning process itself) already requires large-scale self-play data, so it should share infrastructure with the self-play SPRT harness rather than be built twice |
| 16 | 14 | Passed pawn bonus | NOT VERIFIED — CPW's Passed Pawn page states the mechanism without citing centipawn values by rank from any specific engine | **Low-medium** — detection is a well-defined bitwise/file check; risk is mainly in getting endgame king-distance weighting right (the "square rule") | Self-play SPRT, targeted at endgame-heavy self-play positions specifically |
| 17 | 15 | Mobility | NOT VERIFIED — CPW cites no specific centipawn weights, only that "safe mobility" (excluding squares attacked by an enemy pawn) is the recommended middle ground and can be expensive "unless a program already keeps incrementally updated attack tables" (https://www.chessprogramming.org/Mobility) — this engine does not keep attack tables, so a real "safe mobility" term is a real new cost, not a free byproduct of existing move generation | **Low-medium** — mechanism is simple; cost is the main risk (a second per-piece move-count pass at every leaf unless deliberately made cheap) | Self-play SPRT at the actual time budgets used in production (60–900 ms), since mobility's cost directly competes with search depth for the same millisecond budget |
| 18 | 16 | Minimal king safety | NOT VERIFIED — CPW's King Safety page cites no Elo figure for any specific technique, only relative table magnitudes (Glaurung ~650cp max, Stockfish-derived formula ~500cp max) | **High** — this is the term `search.ts`'s own comment already flagged as "the term most likely to be subtly wrong," and this research found nothing to contradict that: no CPW page on this topic cites a confident Elo number, which is itself evidence the term is genuinely hard to get right cheaply, not merely unstudied | Self-play SPRT only, narrow window, and only after every cheaper item above is already in and measured — this is the correct place in the queue for the highest-risk term, not first |
| 19 | 17 | Backward/connected pawns, outposts, threats | NOT VERIFIED — CPW's Outposts page gives one concrete figure (Toga's manual: "~10cp for a knight on a central outpost, up to ~16cp"); backward pawns, connected pawns and threats carry no cited figures at all in the pages fetched for this research | **Low** each, individually — small, well-scoped structural terms similar in shape to the doubled/isolated pawn terms already present | Self-play SPRT, batched together as one "remaining structural terms" change rather than four separate SPRT runs, given how small each one's individual effect is likely to be |
| **Tier 4 — named, not recommended now** |
| 20 | 20 | Continuation/countermove history | NOT VERIFIED — no Elo cited on CPW's Countermove Heuristic page | **Medium** — a second history table indexed by [piece][to-square] of the *previous* move, correctly threaded through recursive search calls | Only worth building after items 5/7 (history gravity, SEE) are in and measured, since it is a refinement of the same ordering signal, not an independent one |
| 21 | 21 | Singular extensions | Historically one of the largest documented gains in engine history (Deep Thought/Deep Blue, 1988) but **no modern, small-project-scale Elo figure was found**; CPW's own framing is about *pathology risk*, not expected gain, for a naive implementation | **High** — needs an extra reduced-depth search per candidate node just to test singularity, and CPW's own stated soundness constraint (singular nodes under ~1/branching-factor of non-PV nodes) is exactly the kind of global tuning property a small project has no easy way to verify locally | Not recommended without a working self-play SPRT harness *already* proven on every simpler item first — if pursued, gate hard on a narrow-window SPRT, since a search-pathology regression would be silent (the engine still returns a move, just a worse one, slower) |
| 22 | 22 | Multi-cut pruning | No Elo figure cited on CPW at all; page explicitly calls it "speculative pruning" | **High** — unsound by design, and CPW's own page notes modern usage is typically fused with singular extensions rather than standalone, meaning this item has singular extensions as an implicit prerequisite | **Not recommended for this project.** No cited value, real unsoundness risk, and a stated dependency on an already-not-recommended technique — name it, skip it |

## 6. What is technically required

- **Tier 0/1 items (1–6, plus 19) are all self-contained, single-file TypeScript changes** against
  `search.ts`/`engine.ts`, no new dependency, no new data format. The flat TT (#2 in this list, "3" in
  the table) is the one structurally new piece: a `Uint32Array`/parallel-array design addressed by
  `hashLow & (size-1)`, replacing `Map<string, Entry>` end to end.
- **Tier 2 items (SEE, aspiration windows, razoring, IIR, reverse/regular futility, improving) share one
  real prerequisite**: a cheap static-eval call available at internal `search()` nodes, which does not
  exist today (only `quiesce()` calls `evaluate()`). Doing Tier 1's eval-pass-combination first is what
  makes paying for that call at every node affordable rather than a new, unbudgeted cost.
- **Tier 3 items (13–18) are the only ones that touch `evaluate()`'s actual output on most positions**,
  not just the search tree shape. Texel's tuning method specifically needs infrastructure this project
  does not have yet: a labeled position/game-outcome dataset (self-play games are the obvious source,
  reusing whatever self-play harness Tier 0–2's SPRT testing already builds) and an optimizer loop —
  CPW's own figures put one gradient computation at ~25 minutes on 16 cores, with a full tuning run
  taking on the order of hours, which is realistic for an occasional offline job, not a CI gate.
- **Nothing on this list requires WebAssembly, a bitboard rewrite, or a new external dependency.**
  `architecture-ceiling.md` §6 covers why WASM stays out of scope until profiling — not assumption —
  shows the JS runtime itself, rather than tree shape or evaluation completeness, is the binding
  constraint; every item here is exactly the kind of "tree shape or evaluation completeness" fix that
  question is deferred behind.

## 7. What could break

- **The general risk across every pruning technique (6, 8, 9, 11, 21, 22) is the same one `search.ts`'s
  own comments already show this project understands well**: the file's `WIDEST` constant exists
  specifically because a previous bug (using `Infinity` as a bound) made every opening position report
  as a forced mate. Every new pruning condition is a new place a similar sign, bound, or off-by-one
  error can hide, and — per `fishtest.md` §3's own caution — a biased-looking Elo gain from a single
  test run is not proof the change is correct, only that it wasn't obviously wrong on that run.
- **SEE (#7) is the item most likely to hide a subtle, hard-to-notice bug**, because a wrong x-ray or
  pin computation does not crash or obviously misplay — it just silently misorders or mis-prunes
  captures in a way that degrades play without ever producing an illegal move, exactly the kind of
  defect perft cannot catch (perft validates legality and move generation, not the *quality* of a
  scoring function).
- **Reverse futility pruning, futility pruning and razoring all carry the same named hazard on their
  own CPW pages**: unsoundness near mate scores if not explicitly guarded, since a static evaluation
  has no way to represent "you are about to be mated in 2" the way a mate score does. Every one of
  these three needs an explicit "skip when in check / skip near mate bounds" guard, not an assumption
  that the margin is generous enough to never matter.
- **King safety (#16) remains the single highest-risk item on this entire list**, and the research
  found nothing to soften that conclusion — no CPW page on the topic offers a confident Elo number for
  any specific formulation, which reads less like an oversight and more like confirmation that the term
  is genuinely difficult to get right cheaply. This is exactly why it sits near the bottom of Tier 3
  rather than being pulled forward on the strength of being "on the SPEC.md K1 list": the list orders by
  proven value-per-risk, not by how prominently a term is named in the original target description.
- **Complexity itself is a named cost for this competition, not only an engineering abstraction.** Per
  `SIP_AND_SHIP_C2_CALL1_FINDINGS.md` (cited in this project's own `CLAUDE.md`): "complexity makes you
  harder to judge and costs you points." Tier 4's two items are named and explicitly not recommended
  partly for this reason — the honest bar for adding them is not "would this help a little," it is
  "does this clear a real SPRT gate at a magnitude that justifies the added surface a judge, or a future
  maintainer, now has to reason about."

## 8. What we can uniquely do because of Nimiq

- **Every self-play SPRT run named in §5's "Proof" column needs real compute**, and `fishtest.md` §8 and
  `nnue-training.md` §8 (both already in this folder) establish the mechanism this project has that
  Fishtest's own volunteer-grid model does not: Nimiq's feeless, instant NIM rail makes it economically
  viable to pay a small bounty per verified self-play batch a real user's own device runs, rather than
  needing Fishtest's decade of accumulated community trust before anyone would volunteer compute for
  free. This applies to every Tier 0–2 item on this list identically, not to any one of them
  specifically.
- **Texel's tuning method (#18) needs a real labeled dataset, and this project has a source Texel's own
  1.03 tuning run did not**: `maia.md` §8 and `human-like-bots.md` §8 already establish that every
  Scoresheet game produces a signed, tamper-evident scoresheet (Ed25519, `SPEC.md` Part F). The same
  self-play games used for the SPRT harness above are, with zero extra collection cost, exactly the
  "positions with known outcomes" Texel tuning needs — this project can build its own tuning corpus
  from its own self-play infrastructure rather than needing an external 64,000-game dataset the way
  Texel's original run did (https://www.chessprogramming.org/Texel%27s_Tuning_Method cites ~64,000
  games / ~8.8 million positions as the original scale).
- **Nothing about the pruning/ordering techniques (Tiers 0–2) is Nimiq-specific beyond the funding
  mechanism above** — they are pure algorithm work, and the honest answer here is that most of this
  document's value is generic engineering, not a Nimiq-unique unlock. The two items above are the real
  ones; padding this section further would overstate the connection.

## 9. Licence and reuse verdict

- **Every technique in this document is published, decades-old (or, for IIR/Texel tuning, publicly
  documented and dated) chess-programming technique, sourced from the Chess Programming Wiki**, per
  `SPEC.md` Part L2 Tier 2 — "the Chess Programming Wiki and the academic literature are the correct
  source, not Stockfish... Reading Stockfish would give us the same algorithms **plus** documented
  access to GPL expression. It is strictly worse. Do not open it." No GPL/AGPL engine source was
  fetched or read to produce any part of this document.
- **Texel's tuning method** is Peter Österlund's published algorithm (documented on CPW), not tied to
  any specific engine's copyrighted source — implementing it is implementing a documented technique
  against this project's own evaluation code and its own self-play data, with no licence exposure.
- **Razoring's one attributed figure (~1 Elo, Michael Chaly, Stockfish 2022)** is cited as a fact about
  a documented change to a specific engine, not as code read from that engine — the figure itself, and
  the technique's mechanism, are both freely citable and implementable from CPW's own description.
- **Net verdict**: nothing recommended in Tier 0–3 requires touching GPL/AGPL source. Tier 4's two
  items (singular extensions, multi-cut) are also pure published technique and carry no licence issue
  either — they are excluded on cost/risk/value grounds, stated plainly in §3/§5/§7, not on any
  licensing basis.
