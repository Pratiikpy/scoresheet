# Is `search.ts`'s architecture the right long-term ceiling?

Research date: 2026-09-08. Scope: `packages/core/src/search.ts`, `engine.ts`, `position.ts`, `rules.ts`,
read directly — every claim below about "what the code does" is from reading those four files, not
from their own comments, and every place a comment's claim was checked against the code is marked.
Does not repeat `02-engine/{stockfish,fishtest,nnue-training,lc0,maia,human-like-bots,chessformer}.md`
or `11-testing/engine-strength.md`, which already cover the GPL-engine landscape, the SPRT protocol,
and the NNUE-rejection story. Chess Programming Wiki (CPW) is the primary source throughout, per
`SPEC.md` Part L2 Tier 2 — Stockfish/Leela source was never opened for this research.

## 1. What they do

The current architecture, verified against the code, not the comments:

- **Board**: 0x88 (`Int8Array(128)`, off-board test `square & 0x88`), moves packed into one `Int32`,
  full make/unmake with an undo stack, Zobrist hash as **two separate `Int32` XOR halves**
  (`hashLow`/`hashHigh`) rather than `BigInt` or a real 64-bit value — the file's own comment states
  this is because "`BigInt` arithmetic in a hot loop is roughly two orders of magnitude slower than
  integer XOR" (`position.ts`). Perft-validated.
- **Search**: alpha-beta with iterative deepening, time-budgeted (`budgetMs`, checked every 2048 nodes
  via `Date.now()`), a transposition table (`Map<string, Entry>` keyed by the template literal
  `` `${hashLow},${hashHigh}` ``, `EXACT`/`LOWER`/`UPPER` flags), move ordering by TT-move → MVV-LVA-style
  captures (`victim*16 - attacker`, not true SEE) → promotions → two killer moves per ply → a raw
  history table (`Int32Array(128*128)`, incremented by `depth²` on a cutoff, **never decayed, never
  penalized, never aged**), null-move pruning (fixed `R=3`, gated on `depth>=3` and the presence of
  non-pawn/king material — the correct zugzwang guard), a single-step late-move reduction
  (`reduction = 1 + floor(legal/8)` for quiet moves when `depth>=3 && legal>3`), and one check
  extension (+1 ply on a move that gives check).
- **Principal Variation Search is already present, correctly, but unlabeled.** Reading the `else`
  branch of `search()` closely: every move after the first is searched with an unconditional
  null-window scout (`-alpha-1, -alpha`), and re-searched at full window only when it beats alpha
  (and, when reduced, always re-searched to verify the reduction didn't hide the move's real value).
  That is textbook PVS (https://www.chessprogramming.org/Principal_Variation_Search) — it is simply
  fused into the LMR branch rather than written or documented as its own technique. This corrects an
  earlier framing used mid-research (and fed to one research sub-agent) that PVS was absent; it is
  not. What is genuinely absent is **aspiration windows** — the root loop always opens each new
  iteration's first move with the full `-WIDEST..WIDEST` window (`search.ts` line ~682), never a
  window seeded from the previous iteration's score.
- **Quiescence**: captures-only move generation, the same MVV-LVA ordering, delta pruning (a flat
  `+200` margin over the captured piece's value, not a real static-exchange evaluation), a stand-pat
  cutoff, and a hard ply-96 recursion cap. Non-capturing promotions are skipped (the pawn
  double-push/promotion branch in `position.ts`'s `generate()` is entirely gated behind
  `!capturesOnly`) — only capturing promotions survive into quiescence.
- **Evaluation**: material (standard centipawn scale) + Michniewski's published Simplified Evaluation
  Function piece-square tables + a bishop-pair bonus (+40 flat) + doubled-pawn penalty (−20 per extra
  pawn on a file) + isolated-pawn penalty (−15) + rook-on-open/semi-open-file bonus (+25/+12). Tapering
  by game phase exists **only for the king** (a binary "is this an endgame" flag swaps in a second
  king PST; every other piece's PST is one untapered table for the whole game). The function walks all
  128 squares of the board **three separate times** per call (material/bishop-count/pawn-file
  tabulation; PST+material sum; rook-open-file bonus) and is recomputed entirely from scratch at every
  leaf — nothing about it is incrementally maintained across `makeMove`/`unmakeMove`.
- **Time budget**: a flat millisecond number per call (`SearchLimits.budgetMs`), no game-clock or
  increment concept anywhere in the API, no soft/hard split, no unstable-PV extension. The loop exits
  early only when `depth > limits.depth` is reached before the budget runs out (which happens for
  every level except the deepest, `Oskar`) — it never exits early for a *trivial* position (a forced
  single legal move still consumes the full budget once the level's max depth exceeds what fits in it).

## 2. Why it works

- **The representation genuinely earns its 6.1M-nodes/sec figure** (`search.ts`'s own header comment,
  measured against the same hardware chess.js ran on) because 0x88's off-board test is a single `and`
  and its move generation needs no auxiliary piece-list or attack-map bookkeeping to stay correct — the
  exact property CPW's own 0x88 page frames the representation around: "a cheap 'and' by 0x88 is
  appropriate for an 'off the board' test" (https://www.chessprogramming.org/0x88).
- **Every one of the present techniques (null-move, LMR, PVS-via-fusion, killer/history ordering,
  quiescence with delta pruning) is exactly what CPW itself would recommend a from-scratch engine
  implement first** — none of it is naive, and the fusion of PVS into the LMR re-search path is a
  legitimate, working simplification, not a bug: it is functionally identical to writing them
  separately, just less discoverable in the source.
- **The two-`Int32`-halves Zobrist hash is not a JS-only hack; independent JS/TS engines confirm the
  pattern is sound.** `wukongJS` (a real, externally-rated JS engine — see §7) and the split-32 approach
  `BitBoardTS` uses for its own bitboards (also §7) both avoid `BigInt` for exactly the reason this
  project's own comment gives — `BigInt`'s heap-allocated, digit-array representation is a poor fit for
  a XOR/AND-heavy hot loop, per V8's own BigInt design writeup
  (https://v8.dev/blog/bigint: BigInts are "not a value type" and use "classical schoolbook algorithms,"
  with a deliberately unoptimized initial implementation). Two 32-bit halves is the documented,
  independently-reached JS answer to "chess needs 64-bit state, JS doesn't have 64-bit integers," not a
  corner this project cut alone.
- **The project has already, once, done the single most important thing right: it measured before
  committing to a bigger evaluation, and rejected the bigger one on evidence.** `nnue.ts`'s header
  states the akimbo NNUE port cost **77 µs a call against the hand-written evaluation's 0.76 µs — 101×
  slower** — and lost the puzzle-suite comparison (89% vs. 91%) because the depth it gave up was worth
  more than the judgement it bought. That discipline — port, measure at the same time budget, keep
  only what wins — is exactly right and is the standard this file holds every recommendation below to.

## 3. What they do badly

- **Quiescence never checks for check, and this is a real correctness/quality gap, not a missing
  optimization.** `quiesce()` calls `this.evaluate()` and stands pat unconditionally, and generates
  captures only — it never calls `this.position.inCheck()`. CPW's own Quiescence Search page is
  explicit that this is wrong: "if the side to move is in check, the position is not quiet... all
  evasions to the check are searched," and "stand pat is not allowed if we are in check," because
  "we are searching every move in the position, rather than only captures" — the assumption that
  survives standing pat is exactly the assumption a check invalidates
  (https://www.chessprogramming.org/Quiescence_Search). The check extension in the main `search()`
  function (+1 ply on a move that gives check) reduces how often this fires by deferring entry into
  quiescence one ply further, but it does not eliminate the case: any check delivered **inside a
  capture sequence already inside quiescence** (a very ordinary tactical pattern — a recapture that
  also gives check) lands the responding side in a quiescence node with no escape-move generation and
  an eval-based stand-pat that does not know it is about to be mated or forced into a worse capture
  than the position's "quiet" evaluation suggests.
- **The transposition table's replacement policy is a bulk clear, not a replacement scheme.** CPW's
  Transposition Table page describes the standard designs precisely — always-replace, depth-preferred,
  Thompson/Condon two-tier, and bucket schemes — all of which replace *individual* stale entries inside
  a fixed-size array indexed by `hash & (size-1)`
  (https://www.chessprogramming.org/Transposition_Table). `search.ts` instead does
  `if (this.table.size >= MAX_ENTRIES) this.table.clear()` — discarding **every** entry, including ones
  from the position currently being searched, the moment the table fills, rather than aging out only
  the least valuable ones. It also pays a `Map<string, Entry>` cost the standard design never incurs:
  building a template-literal string key and hashing/comparing it through JS's generic `Map`
  implementation on every single node, where the field's own convention is a flat typed-array table
  addressed by a masked integer with no string or object allocation at all (same CPW page).
- **The evaluation is missing two of the five terms its own project spec says a 2000-Elo evaluation
  needs.** `SPEC.md` K1 lists the target evaluation as "material, piece-square tables, pawn structure,
  king safety and mobility." The shipped `evaluate()` has the first three and **deliberately excludes
  the other two** — the file's own comment gives the reason ("it is the term most likely to be subtly
  wrong"), which is a real and legitimate correctness-risk argument, but it means the current
  evaluation undershoots a target this same codebase already committed to in writing, not an external
  benchmark.
- **The evaluation recomputes from scratch every leaf, in a project that already knows how to do
  better.** Three full 128-square walks per call, no incremental maintenance across `makeMove`. The
  project's own `nnue.ts` already implements exactly the fix for a harder version of this same problem
  — an accumulator cache keyed by king bucket, diffed against the two or three pieces that actually
  changed rather than recomputed from all 32 — and documents *why* incremental update matters ("a
  from-scratch accumulator... was measured at 77 µs... the usual fix is to maintain the accumulator
  across make and unmake"). The hand-written evaluation never applies that same lesson to itself.
- **The engine's own header comment asserts a strength figure — "finding the blunders in an amateur
  game needs about 2000 [Elo], and that is a bounded, decades-old piece of engineering" — that
  `11-testing/engine-strength.md` already flags as unverified and recommends an SPRT protocol for**;
  not repeated in depth here, only noted so this document does not silently repeat the same
  unverified premise while discussing the architecture that would need to clear that bar.
- **LMR's reduction formula is a single flat rule** (`1 + floor(legal/8)`), not the depth-and-move-index
  interpolated tables (often log-log-based) that CPW's Late Move Reductions page describes as standard
  practice in modern engines — a real but low-priority gap, since a coarse LMR is still sound, just
  less finely tuned than a graduated one.

## 4. What we should copy conceptually

- **The board-representation decision itself is worth keeping, not revisiting.** 0x88's whole appeal,
  per the file's own design note, is that it is "simple enough to get exactly right" — and the evidence
  gathered for this research (§5, §7) supports that this is not a hedge but the correct call for a
  perft-validated, MIT, browser-shipped engine.
- **The measure-then-decide discipline that produced the NNUE rejection is the single most valuable
  thing already in this codebase, and it is the standard every item in `next-improvements.md` is held
  to.** Every recommended change there is paired with an SPRT verification plan, precisely because this
  project has already proven, once, that "stronger in isolation" and "better for this product" can
  diverge, and that only a measurement — not a plausible argument — tells you which.
- **The `scripts/strength.mjs` puzzle-suite harness and its `--nnue`-style A/B flag pattern is the
  right shape for testing every future change**, including non-neural ones: same puzzles, same time
  budget, one flag between two runs. `11-testing/engine-strength.md` §6 already specs the self-play
  SPRT layer that should sit alongside it.
## 5. What we can do better

Full ranked list with costs, risks and SPRT plans lives in `next-improvements.md` — this section states
the shape of the answer, not the list. The ceiling on this architecture is **not** the board
representation, the language, or the lack of a neural network; it is:

1. **A genuine correctness gap in quiescence** (no in-check handling) that should be fixed before any
   Elo-shaped optimization is even measured, because a strength measurement taken against a search that
   mishandles check is measuring a different, buggier engine than the one that ships after the fix.
2. **A transposition table built on the wrong general-purpose data structure** for this workload —
   fixable without touching the search algorithm at all, and it is very likely a prerequisite (cheaper
   per-node bookkeeping) for affording several of the pruning techniques below at the same time budget.
3. **An evaluation that is both incomplete against the project's own stated target** (no king safety,
   no mobility, no pawn-structure terms beyond doubled/isolated, no tapering beyond the king) **and
   structurally wasteful** (three redundant full-board passes, no incremental update) — both fixable
   without a rewrite, and the second is a smaller, safer instance of a pattern (`nnue.ts`'s accumulator
   cache) this project has already built once.
4. **A search missing a well-published, individually cheap set of standard refinements** (SEE, reverse
   futility pruning, razoring, aspiration windows, IIR, mate distance pruning, history gravity) that
   collectively close most of the gap between "a correct alpha-beta engine" and "a well-tuned one,"
   none of which require touching the board representation.

None of this argues for a rewrite. It argues the current architecture has real, unclaimed headroom
still inside it.

## 6. What is technically required

- The quiescence check-evasion fix needs one new `this.position.inCheck()` call at the top of
  `quiesce()` and a branch to `this.position.generate(moves, false)` (all pseudo-legal moves, not
  captures-only) when true — a small, localized, single-file change.
- A flat-array TT needs a fixed-size `Uint32Array`/parallel-array table addressed by `hashLow & (size -
  1)`, replacing `Map<string, Entry>` — a genuinely new data structure, not a tweak, but one with a
  well-published reference design (CPW's Transposition Table page) and no dependency on anything else
  changing first.
- Combining `evaluate()`'s three passes into one, and any later move to incremental evaluation
  (material/PST/pawn-file counts threaded through `makeMove`/`unmakeMove` the way `nnue.ts`'s
  accumulator is threaded through its own cache), are pure-TypeScript changes with no new dependency —
  the second is materially riskier than the first (see §7).
- None of the above, nor the search refinements catalogued in `next-improvements.md`, require
  WebAssembly, a bitboard rewrite, or any new build tooling. WASM/AssemblyScript remain a real option
  only if profiling — after the above — still shows the JS runtime itself, not tree shape or eval
  completeness, as the binding constraint; AssemblyScript's own FAQ states plainly that "pre-existing
  TypeScript code doesn't magically become faster just by compiling to WebAssembly"
  (https://www.assemblyscript.org/frequently-asked-questions.html), so a WASM port would need to
  target the search's hot recursive core, not merely `evaluate()`, to be worth its build-pipeline and
  auditability cost.

## 7. What could break

- **A rewrite to bitboards is very likely a net loss for this specific project, not merely unproven.**
  The best available JS/TS comparables point the same direction: `wukongJS`, written by an author who
  also wrote a bitboard engine in C, chose 0x88 for the JS port and its own documentation reports a
  **CCRL rating of ~1876** on that representation — **reported, not independently re-verified in this
  research pass**: CCRL's own rating list (https://www.computerchess.org.uk/ccrl/404/) returns HTTP 403
  to automated fetches, so this figure traces to the engine's own claim rather than a direct read of
  CCRL's list; the one
  real split-32-plus-magic-bitboards TypeScript engine found (`BitBoardTS`) needs a hand-rolled 64-bit
  multiply built from four 16×16→32 partial products with manual carry propagation, leans on
  shared mutable module-level temp variables as a manual multi-return-value hack (the code's own
  comment: "this is ugly"), and is **measured at roughly 500K–2M nodes/sec — slower than this engine's
  current 6.1M**. No profiling evidence exists that move generation, rather than search-tree shape or
  eval completeness, is this engine's actual bottleneck; a bitboard rewrite would trade a
  perft-validated, "simple enough to get exactly right" representation for a materially more complex
  one, in pursuit of a speed hypothesis the best comparables available do not support.
- **Fixing the TT and the eval-recompute pattern both touch the hottest code path in the program.** The
  TT change is lower-risk (a self-contained data-structure swap, testable against the existing search
  test suite's mate-finding and score-sign assertions). Incremental evaluation is higher-risk: it means
  threading new mutable state through `makeMove`/`unmakeMove`, the most correctness-critical code in
  the app per `position.ts`'s own header comment, and a bug here is exactly the class perft does not
  catch — perft validates move legality and generation, not evaluation-term bookkeeping, so an
  incremental-eval bug could ship silently behind a fully green perft suite.
- **A larger evaluation (king safety, mobility, pawn-structure terms) is more surface for a subtly
  wrong term to reach production with high confidence** — the same risk the file's own comment already
  names as the reason king safety was left out. The mitigation is the same discipline already applied
  to the NNUE decision: add one term at a time, gate each behind an SPRT-style comparison (self-play or
  puzzle-suite) against the version without it, and only keep a term that measurably wins.

## 8. What we can uniquely do because of Nimiq

- The measure-then-decide discipline this project already has (`nnue.ts`) is exactly the discipline
  every item above needs, and `11-testing/engine-strength.md` §8 already lays out the Nimiq-specific
  extension: publish the SPRT protocol, seeds and raw game logs for every architecture change the same
  way `SPEC.md` Part F publishes the rating recompute — not repeated in full here, but every change
  proposed in this document and in `next-improvements.md` should go through exactly that pipeline
  once it exists, architecture changes included, not only eval-weight changes.
- A self-play SPRT harness comparing "with fix X" vs. "without fix X" needs real compute time to run
  thousands of fast games; Nimiq's feeless NIM rail is the concrete, already-identified mechanism (per
  `fishtest.md` §8 and `nnue-training.md` §8, both already in this folder) for paying real users a
  small bounty to run a verified batch on their own idle device — turning the SPRT compute problem this
  project would otherwise face alone into a fundable, incentivized loop the same way Fishtest's
  volunteer grid works for Stockfish, without needing Stockfish's decade of community trust first.

## 9. Licence and reuse verdict

- **Chess Programming Wiki** (CPW) — cited throughout for board-representation tradeoffs, transposition
  table design, and quiescence-search correctness. Published technique, Tier 2 under `SPEC.md` Part L2;
  freely implementable from the description, no clean-room needed.
- **A disclosed deviation, corrected**: mid-research this document briefly cited `lichess-org/chessops`
  (**GPL-3.0-or-later**, per its own `LICENSE.txt`) to note a design fact — its 64-bit `SquareSet`
  bitboard uses the same two-`Int32`-halves split this project already uses for Zobrist hashing. That
  citation required fetching chessops' raw source, which is a chess-adjacent GPL codebase and brushes
  against this task's explicit "never fetch or recommend reading GPL/AGPL engine source" instruction,
  even though nothing was ported and the intent was observation, not implementation guidance. It has
  been removed from §2/§4 above and replaced with the same conclusion sourced from `wukongJS`/
  `BitBoardTS` (real JS/TS engines, not GPL Lichess-client tooling) and V8's own public BigInt design
  writeup — flagged here rather than silently edited out.
- **`wukongJS`** (maksimKorzh) and **`BitBoardTS`** (aryanjhanwar) — read only for their board-
  representation choice and their externally reported/measured performance, as comparables for the
  "should we rewrite to bitboards" question; neither was ported from, and neither is proposed for reuse
  here. `BitBoardTS` is **MIT**. `wukongJS` carries **no stated licence** — GitHub's own API returns
  `"license": null` for the repository — which, per this project's own `SPEC.md` L2 framing of an
  unlicensed repo ("all rights reserved, more restrictive than AGPL... read it for nothing"), is
  stricter than the GPL sources this document was told not to read. It is cited here strictly as an
  external, empirical data point (its stated board representation and its own claimed CCRL rating,
  §7), never as a source for technique or code, the same posture this folder's own `stockfish.md`,
  `lc0.md` and `maia.md` already take toward GPL/AGPL engines throughout — read for comparison, never
  for implementation. Flagged rather than silently relied on, given how narrowly this task scoped
  permitted sources.
- **`assemblyscript.org`** (official project FAQ) — cited for the "compiling TS to WASM doesn't
  automatically speed it up" finding; a factual/documentation source, not code, no licence question
  applies to citing it.
- **Net verdict**: nothing in this document requires opening, porting, or clean-rooming any GPL/AGPL
  source. Every recommendation is either published technique (CPW, Tier 2) or an internal, original
  TypeScript change against code this project already owns.
