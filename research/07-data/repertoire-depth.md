# Repertoire depth — where a player's own preparation stops holding

Research date: 2026-09-08. This file is a concrete, implementable design, not a survey — the survey
is `opening-intelligence.md`, and this file assumes it. It answers one question directly: **has
anyone published a method for finding the ply at which a player's own accuracy falls off a cliff
relative to their overall level, and if not, what is the design?**

**Finding, stated plainly: nobody has published this, in this exact shape, anywhere found.** The
closest attempts, all catalogued with sources in `opening-intelligence.md` §1/§3:
- Chess.com's "Mastery" number (one lifetime average of book-moves-before-deviation, not per opening,
  not a ply-level curve, not accuracy-based at all as far as the fetched docs describe it —
  https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com).
- `Sandhyaa-a/Kaggle_main_Project`'s "Opening Dependent" archetype (GPL-3.0): a **fixed 40-CPL-point**
  threshold comparing three whole-game phase averages (opening/middlegame/endgame) — three buckets,
  not a per-ply curve, and not per-opening.
- Lichess's own `phaseAccuracies` (`lila`, AGPL, read in `opening-intelligence.md` §1): same
  three-bucket shape, per game, per colour — never aggregated across a player's own games by ply,
  never per opening line.
- `gtim/chessdriller`'s own `TODO.md`, "Major features": *"keep track of user's lichess games and
  notify on out-of-repertoire moves"* — years-old, unbuilt, and even if built would only be a binary
  deviation flag, not a cliff statistic.
- `chessenginelab.substack.com`, directly: *"there is no way of knowing when a player was out of
  book... I decided against excluding any opening moves"* — a chess-data blogger who considered this
  exact question and explicitly declined to answer it, rather than someone who never thought of it.

The rest of this file is the design that fills that gap.

## 1. What they do

The four closest artefacts, restated at implementation grain (full citations in
`opening-intelligence.md`, not repeated):
1. **Chess.com Mastery** — one number, one player, no opening breakdown, no confidence handling
   documented, gated behind Diamond membership.
2. **Kaggle "Opening Dependent"** — `if middlegame_cpl > opening_cpl + 40 and endgame_cpl > opening_cpl + 40: label = "Opening Dependent"`.
   A hardcoded constant, no sample-size gate visible in the fetched code, three phases per game only.
3. **Lila `phaseAccuracies`** — accuracy per material-based phase (`Division`), per game, per colour;
   never aggregated across a player's history by opening or by ply.
4. **`neuralpgn` Game Check** — per-game, position-matched (FEN) flag of *the single move* where a
   played game first diverges from a *stored, hand-built repertoire* — a deviation detector against
   an externally-declared plan, not a statistical cliff detector against the player's own emergent
   behaviour, and it says nothing about accuracy before or after that point.

None of the four computes: a per-ply accuracy series, aggregated across many of a player's own games
that reached the same opening, compared against that same player's own baseline, with an explicit
minimum-sample gate before display. That is the feature this file specifies.

## 2. Why it works

- **It answers a question a player actually asks themselves** — "I know this is a good opening for
  me, so why do I keep losing it?" — with a mechanism, not a vibe. The existing closest analogues
  (§1) either answer a *different*, coarser question (Mastery: "how much do I generally memorise") or
  answer a *related but distinct* question (Game Check: "did I follow my plan," which presupposes a
  plan already exists and is stored — most players, including everyone in this product's target
  audience during their first weeks, have no such stored plan).
- **It works without asking the player to do anything.** No repertoire import, no PGN upload, no
  "tell us your plan first" — unlike every repertoire trainer in §1 of `opening-intelligence.md`,
  which all require the player to *bring* a repertoire before the tool is useful. This design is
  purely observational over games already played inside the app.
- **It works at small scale**, which matters directly: `chess/SPEC.md` frames Scoresheet as starting
  from zero games. A per-player, per-opening statistic needs orders of magnitude less data than a
  global explorer (`opening-explorer.md` §5's whole argument for "Path B, self-scoped" applies here
  even more strongly — this is Path B narrowed further, to one player at a time).
- **It reuses, rather than duplicates, the accuracy signal `chess/SPEC.md` §K1/K2 already commits
  to building** (the in-house MIT engine, accuracy already expressed in win-probability terms for
  Game Review) — the marginal engineering cost is an aggregation layer, not a new analysis pipeline.

## 3. What they do badly

*(carried forward at the specific grain this file needs; full detail in `opening-intelligence.md`
§3)*
- Wrong grain: lifetime-average or three-phases-per-game, never per-opening-per-ply.
- Wrong baseline: nothing checked compares against the *player's own* typical accuracy level; the
  Kaggle heuristic compares whole-game phases to each other, which conflates "this opening's book
  moves score differently" with "this player's skill differs by phase" — two different effects,
  entangled.
- No stated sample-size floor anywhere: not in Chess.com's docs (confirmed absent by direct search of
  the support articles), not in the Kaggle script (a fixed threshold, no `n` check visible in the
  fetched code), not in `neuralpgn` (a per-game flag needs no aggregate `n` at all, so the question
  never arises there).
- No engine-ceiling disclosure: nothing checked states or handles the case where the player's own
  strength approaches or exceeds the analysis engine's reliable range.

## 4. What we should copy conceptually

- **Position-keyed, transposition-safe bucketing** (`neuralpgn`'s FEN matching; the same principle
  already adopted for the CC0 dataset's reverse index in `openings-names.md` §5–§6) — two move orders
  reaching the same position must land in the same bucket, or the sample-size problem gets worse for
  no reason.
- **Volatility-aware weighting of individual accuracy readings** (`lila`'s windowed,
  variance-weighted blend, `opening-intelligence.md` §1) — a forced recapture or an already-lost
  position contributes little information about whether the player "knew" the position; a genuinely
  critical, sharp moment contributes a lot. A naive unweighted mean per ply would treat both the
  same.
- **A real minimum-count gate before any game counts at all** (Chess.com's ≥10-half-move rule) —
  applied here one level up, at the *bucket* level, not just the game level.
- **Named-but-not-authoritative labelling** — use the bundled CC0 dataset to give the bucket a human
  name ("Sicilian Najdorf: English Attack") purely for display; never let it define the statistical
  boundary (`opening-intelligence.md` §4 explains why, restated in §5 below as a hard constraint).

## 5. What we can do better — the statistic, specified in full

### 5.1 Definitions

- **Bucket** `(player, colour, opening_key, time_control_class)`. `opening_key` is the deepest
  CC0-named position reached (via the transposition-safe walk in §4), falling back to a raw FEN-path
  key for lines the 3,810-row CC0 dataset doesn't cover — those buckets still work statistically,
  they just render without a friendly name. `time_control_class` is a coarse bucket (bullet / blitz /
  rapid+classical) — **never pooled across it**, because ply-12 accuracy under a 60-second clock and
  under a 30-minute clock are not comparable observations of the same underlying skill.
- **Per-ply accuracy reading** `a(g, p)`: the existing Game-Review per-move accuracy (win-probability
  based, per `chess/SPEC.md` §K1/K2 and `research/03-analysis/accuracy.md` — not redefined here) for
  the player's own move at ply `p` of game `g`, restricted to plies the player actually played (every
  other ply).
- **Bucket baseline** `μ_base`: the player's own mean accuracy across *all* their games in the same
  `time_control_class`, all openings pooled — computed once per player per time-control-class, reused
  across every bucket. This is the "relative to their overall level" anchor the task asks for.

### 5.2 The cliff statistic

A **single, unweighted-mean, fixed-threshold comparison is explicitly rejected** — the Fried Liver
finding in `opening-intelligence.md` §3 (5...Nxd5 scoring ~2% engine accuracy inside completely
standard book) proves that "accuracy near 100% while in book, then a drop" is not a safe assumption:
some named theory is itself engine-imprecise. The statistic must instead find a **relative** cliff:
the ply where the *player's own trajectory in this specific bucket* changes level, regardless of
where that level sits in absolute terms.

**Method — a greedy single-changepoint search over the ply-indexed, pooled accuracy series**, one of
the simplest members of the standard two-sample-mean-shift changepoint family (the same family CUSUM
and Page–Hinkley belong to; no ML dependency, no external library required, implementable in well
under 100 lines):

1. Within the bucket, for each candidate ply `p*` in the eligible range (defined by the sample-size
   floor in §5.3), pool every `(game, ply)` accuracy reading into two sets: `left = {a(g,p) : p < p*}`,
   `right = {a(g,p) : p ≥ p*}`.
2. Smooth first: replace each raw `a(g,p)` with a 3-ply trailing average within the same game before
   pooling, to damp single-move noise (directly inspired by, not copied from, `lila`'s
   windowed-weighting approach in §4).
3. Compute `mean_left`, `mean_right`, and a two-sample test statistic
   `z(p*) = (mean_left − mean_right) / sqrt(var_left/n_left + var_right/n_right)`.
4. `p* = argmax(z(p*))` over the eligible range.
5. **Report the cliff only if both gates pass**: `z(p*) ≥ 2.0` (roughly a one-sided 97.5% level) *and*
   `mean_left − mean_right ≥ 12` accuracy points (an explicit minimum effect size, so a
   statistically-detectable-but-trivial 3-point wobble is never reported as "your prep ends here").
   Both thresholds are **stated defaults, not derived constants** — see §5.4.
6. If no candidate ply clears both gates, the bucket has **no detected cliff** — report that
   explicitly ("your accuracy has been steady through move N in this line so far"), never force a
   number.

This is a within-bucket, self-relative comparison by construction — it never touches `μ_base` or any
absolute ceiling to *find* the cliff. `μ_base` is used only in the *display layer* (§5.5), to phrase
the finding honestly against the player's own general level, and to catch the (expected, common) case
where `mean_right` is simply where the player normally plays anyway.

### 5.3 Minimum sample size — the honesty gate

Two nested thresholds, both required, both defaults pending real calibration (§5.4):

- **Bucket-level floor**: a bucket is not analysed at all below **10 games**. Below this, the UI
  shows a progress state — *"6 of 10 games needed to analyse this opening"* — never a partial or
  provisional number. Ten is chosen to match the one externally-precedented floor found in this
  research (Chess.com's own ≥10-half-move per-*game* inclusion rule, repurposed here as a per-*bucket*
  game-count floor — a deliberate, disclosed choice, not a derivation from that rule).
- **Ply-level floor within a bucket**: a candidate `p*` is only eligible if `n_p ≥ 8` on *both* sides
  of the split (games necessarily thin out as ply increases, since not every game in the bucket
  reaches every ply). Plies beyond where this holds are simply outside the search range — the
  algorithm cannot report a cliff deeper than the data supports, by construction, not by a separate
  check.
- **Bucket-level floor for a player-wide summary statistic** (e.g. "your median prep depth as White is
  move 9"): only computed once the player has **at least 3 qualifying buckets** (each already past
  its own floor above), so one well-sampled opening can't stand in for "the player" as a whole.

These numbers are explicitly **starting defaults**, and this file states that plainly rather than
presenting them as derived: with an assumed per-move accuracy standard deviation on the rough order
of 10–20 points (no first-party distributional data exists yet for this product — **NOT VERIFIED**,
stated as an assumption pending real telemetry) `n=10` per side gives a detectable effect size in the
same range as the §5.2 effect-size gate, which is why the two numbers were chosen together rather than
independently. **Recalibrate both once real accuracy-variance data exists from actual Scoresheet
games** — this is an explicit, named follow-up, not a one-time guess to be shipped and forgotten.

### 5.4 What this design explicitly does NOT claim

- **Not** "you left book/theory at move N." Book/theory is an external, database-defined fact this
  product's tiny (3,810-position) CC0 dataset cannot reliably establish to real theoretical depth
  (`opening-intelligence.md` §4). The feature claims something narrower and fully first-person: *your
  own accuracy in this specific line, across your own games, tends to hold through roughly move N*.
- **Not** a claim about why. No causal language ("you lose because of this"). The output is a
  correlation inside the player's own move-by-move performance record, not a diagnosis of intent,
  memory, or preparation habits — a player could be perfectly "in book" by any external database and
  still show a detected cliff, or vice versa (the Fried Liver case again: staying in named theory is
  no guarantee of staying at the player's own accuracy level).
- **Not** shown below the sample-size floor, under any framing, ever — no "provisional," no "early
  signal," no smaller-font caveat standing in for the floor. Below floor is a progress bar, full stop.
- **Not** compared across time-control classes, or presented as one number pooling them — a cliff at
  move 8 in bullet and move 14 in classical are both real and both worth showing, separately, never
  averaged together into a meaningless move number.
- **Not** presented without disclosing opponent-rating spread for the bucket, given the confound
  named in `opening-intelligence.md` §7 — the UI should surface the average/range of opponent rating
  the bucket's games were played against, so a player can judge for themselves whether a cliff might
  really be "my opponents got stronger at this exact point" rather than "my memorised prep ran out."
- **Not** treated as more reliable than the underlying engine allows. For any player whose own rating
  is at or above the engine's measured reliable ceiling (`chess/SPEC.md` §K8: 68% whole-line hold
  rate at 2400+, on a puzzle set biased toward short forcing sequences — not a general accuracy-in-
  quiet-positions guarantee at that strength), the UI must carry a visible caveat rather than present
  the same unqualified confidence shown to players well within the engine's verified range.
- **Not** a single global aggregate the way Chess.com's Mastery number is — the entire point of this
  design is per-opening, per-colour granularity; a lifetime-average version of this statistic would
  reproduce the exact flaw identified in `opening-intelligence.md` §3/§5.

### 5.5 What to show

- **Per-bucket card**: opening name + ECO (from the CC0 dataset, or a generic "Unnamed line" label
  with the starting FEN-path for uncovered buckets) · game count · W/D/L · a small ply-indexed
  accuracy curve with the player's own `μ_base` drawn as a reference band (± 1 SD) · if a cliff was
  detected, a marked ply with strictly self-referential phrasing, e.g. *"Your accuracy in this line
  has typically held through move 11, then eased back toward your usual level"* — never *"you leave
  book at move 11"* and never a bare unqualified percentage swing.
- **Below the bucket floor**: a progress indicator only (*"7 of 10 games"*), no curve, no ply number,
  no placeholder statistic.
- **Player-wide summary** (once ≥3 qualifying buckets exist, §5.3): a single comparative line per
  colour, e.g. *"Your preparation typically holds a few moves longer as White than as Black"* —
  phrased as a comparison the player can act on, not a leaderboard number, and explicitly not shown
  as a single fixed digit the way Chess.com's Mastery figure is (§5.4's last bullet).
- **Opponent context**: average opponent rating (and range) for the bucket, always visible alongside
  any detected cliff, per the confound-disclosure requirement in §5.4.

## 6. What is technically required

- **Reuse, don't rebuild, the accuracy signal.** Per `chess/SPEC.md` §K1/K2, Game Review already
  produces a per-move, win-probability-based accuracy value for every completed game using the
  product's own MIT engine. This design's only new input requirement is that this per-move series be
  retained (or recomputable) per game, not just shown once in a Game Review screen and discarded.
- **Position-keyed bucket assignment**, built once, shared with the opening-name display feature
  already decided in `openings-names.md`: walk each game's moves against the CC0 `chess-openings`
  dataset (matching by reachable position, "play moves backward until a named position is found," per
  `openings-names.md` §3/§6), assign the deepest matched name as `opening_key`, falling back to a raw
  FEN-path key when the dataset doesn't cover the line.
- **A ply-indexed running aggregate per bucket**, not raw per-move storage at scale: `(bucket_key,
  colour, time_control_class, ply) → {n, mean, M2}` using Welford's online algorithm for streaming
  mean/variance, updated once per completed game rather than recomputed from scratch — keeps the
  "hard bundle budget" / lightweight-backend framing intact, since this is O(moves-per-game) work per
  game, not a batch job over full history.
- **The changepoint search itself** (§5.2) run **on demand or incrementally**, not continuously: it
  only needs to re-run for a bucket when that bucket crosses its sample-size floor (§5.3) or gains a
  new game past that point — a small, cheap, infrequent computation, not a background service.
- **A player-level baseline (`μ_base`) per time-control-class**, maintained the same way (Welford's
  running mean/variance), updated on every completed game regardless of bucket.
- **No engine change, no new licence surface.** Nothing here touches the GPL/AGPL boundary discussed
  throughout this research pass — every new component (bucketing, aggregation, changepoint search) is
  original, small, and written fresh; see §9.

## 7. What could break

- **The Fried Liver problem, restated as an implementation risk, not just a design constraint**: if a
  future contributor "simplifies" §5.2 back into a fixed-threshold comparison against 100% (the
  Kaggle project's shape, or worse), the statistic silently regains the exact false-positive failure
  mode this design was built to avoid. This should be a code comment at the changepoint function
  itself, not just a fact recorded in this file.
- **Opponent-strength confound** (already named in `opening-intelligence.md` §7 and disclosed in
  §5.4/§5.5 here) is mitigated by disclosure, not eliminated — a determined analyst could still
  misread a cliff that's really an opponent-strength artefact. This is an accepted, stated limitation,
  not a solved problem.
- **Cold-start inertia.** Every bucket starts at zero; for a genuinely new app this feature may show
  nothing but progress bars for weeks per player, which is the honest outcome of the floors in §5.3
  and must not be "fixed" by lowering them under launch pressure — that would just move the false-
  positive risk from the algorithm into the UI.
- **Smoothing-window choice (3 plies, §5.2) is itself an unvalidated default**, chosen by analogy to
  `lila`'s windowing approach rather than fit to this product's own data — flag for recalibration
  alongside the §5.3 thresholds once real usage data exists.
- **Time-control fragmentation makes the per-bucket floor harder to clear** than it looks at first
  read — splitting by `time_control_class` (§5.1, a deliberate, non-negotiable choice per §5.4) means
  a player who plays a mix of bullet and rapid will clear the floor in each roughly three times slower
  than a player who plays one time control exclusively. This is the correct tradeoff (pooling would
  produce misleading ply comparisons) but should be stated to product/design as a real, expected
  consequence, not discovered as a surprise after launch.

## 8. What we can uniquely do because of Nimiq

- **The exact point made in `opening-intelligence.md` §8, sharpened**: because `chess/SPEC.md`
  already plans a signed, recomputable game record, the cliff-ply for any bucket is independently
  re-derivable by anyone from public data — not merely asserted by a server the way Chess.com's
  Mastery number or Lichess's phase accuracy are. A player (or a skeptical reviewer) could recompute
  "does this player's Najdorf really degrade around move 11" from the signed log using nothing but
  this file's algorithm.
- **A direct, non-generic trigger into the coaching marketplace** (`chess/SPEC.md` §K5): a detected
  cliff at a specific ply, in a specific named opening, is a far more actionable purchase prompt than
  a generic "get a coaching review" button — and the feeless, sub-cent-viable Nimiq payment rail is
  exactly what SPEC.md already identifies as the enabling condition for a $2 transaction at that
  specificity to exist as a real product at all.
- **Zero incentive to game the metric**, restated from `opening-intelligence.md` §8: nothing here is
  scored, ranked, or paid out directly, so unlike a leaderboard-adjacent stat there is no reason for a
  player to manipulate their own opening play to produce a flattering cliff-ply number, and the signed
  record would expose any attempt that did try.

## 9. Licence and reuse verdict

Every component this design introduces — the bucket-assignment walk (built on the already-verified
CC0 dataset), the Welford running-aggregate store, and the greedy single-changepoint search — is
**original work specified in this file**, not derived from or dependent on any AGPL/GPL source. The
only external inputs are:

| Component | Licence | Verdict |
|---|---|---|
| `chess-openings` (CC0), for bucket naming | CC0 1.0 (verified in `openings-names.md` §9) | Unrestricted, already cleared. |
| The product's own MIT engine and its Game-Review accuracy output (`chess/SPEC.md` §K1/K2) | Project's own MIT code | Fully owned; this design only consumes its output, adds no new dependency. |
| The general *shape* of a two-sample changepoint test | Standard statistical technique (the CUSUM/Page–Hinkley family), textbook/public-domain method, not sourced from any single implementation | No licence question — this is published statistical method, not code, and is implemented fresh in §5.2/§6. |
| `lila`'s volatility-weighting *idea* (inspiration for the §5.2 smoothing step) | AGPL-3.0, reference-only per `opening-intelligence.md` §9 | **Idea reused, code not read-then-copied** — the smoothing step specified here (a 3-ply trailing average) is a simpler, independently-specified mechanism, not a port of lila's windowed-volatility-weighted-mean-and-harmonic-mean blend. |
| GPL/AGPL reference implementations surveyed for context (`Sandhyaa-a/Kaggle_main_Project`, `lila`) | GPL-3.0 / AGPL-3.0 | **Not touched by implementation** — per `chess/SPEC.md` Part L's clean-room rule, whoever writes this feature should not have both files open side-by-side; this design document is the handoff artefact between "what was read for research" and "what gets written," exactly as that rule requires. |

**Bottom line**: this is a buildable, MIT-clean feature with no licence exposure anywhere in its
critical path — the one real constraint is data, not law: it needs real games in real buckets before
any of §5's output is honest to show, and §5.3's floors exist specifically to make that limitation
visible to the player rather than hidden behind a fabricated early number.
