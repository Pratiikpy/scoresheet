# The Scoresheet Benchmark — a permanent, versioned scoreboard

Research date: 2026-09-08. Scope: a system where every release is compared against the previous one
across eight dimensions — engine strength, review accuracy, puzzle quality, bot human-likeness,
anti-cheat detection, mobile performance, Nimiq transaction reliability, tournament correctness.
Grounded in what this repo already measures (`npm run check` = `typecheck && counts && licences &&
design && look`, `scripts/counts.mjs`, `scripts/design-metrics.mjs`, `scripts/strength.mjs`,
`scripts/look.mjs`) and in `research/00-current/inventory.md` and `research/11-testing/*.md`, all read
in full before writing this. Three of the eight scripts named in the brief were re-run in this session
on this machine (Node v22.17.0, Windows) specifically to get real timing and variance numbers rather
than reuse stale ones — see §1 and §7.

## 1. What they do

**Fishtest**, Stockfish's own testing framework, validates every patch with a **Generalized Sequential
Probability Ratio Test (GSPRT)**: two Elo hypotheses (`elo0`, `elo1`) expressed in "normalized Elo" —
a scaling chosen specifically so *"the expected duration of a test dependent only on the chosen
bounds, independent of the specific draw ratio or opening book used."* Source (fetched in full this
session): `https://github.com/official-stockfish/fishtest/wiki/Fishtest-Mathematics`. Game results are
scored with a **pentanomial model** (both colours of the same opening paired and scored together as
one of five outcomes), which the same page states gives *"a substantial saving of testing resources
compared to the trinomial model"* by cancelling opening-choice variance rather than only averaging
over it.

The vocabulary is exact and load-bearing: `STC` = short time control (10+0.1), `LTC` = long time
control (60+0.6), `SPRT(x,y)` names a test with `elo0=x, elo1=y`, and a **"non-regression"** test uses
a shifted, asymmetric bound rather than a symmetric one. Two real, completed Fishtest tests quoted
verbatim from the project's own contributor guide (fetched this session,
`https://github.com/official-stockfish/fishtest/wiki/Creating-my-first-test`):

```
Passed non-regression STC:
LLR: 2.95 (-2.94,2.94) <-1.75,0.25>
Total: 38008 W: 10234 L: 10021 D: 17753

Passed non-regression LTC:
LLR: 2.94 (-2.94,2.94) <-1.75,0.25>
Total: 91232 W: 24686 L: 24547 D: 41999
```

Standard STC/LTC pairs run per submitted patch, continuously; a separate, heavier **8-thread SMP
regression tier runs on a fixed monthly cadence** as part of pre-release testing — the same source
states plainly: *"SMP testing is performed monthly as part of regression testing... or pre-release
testing of Stockfish."* That is a real, citable precedent for a two-speed cadence: fast per-change
testing plus a slower, calendar-scheduled regression tier that a release additionally depends on.

**"Benchmark as a committed artefact."** Three independent implementations of the same idea, all
verified this session:

- **`rustc-perf`** (`https://github.com/rust-lang/rustc-perf`, MIT — confirmed in its own README: *"The code of
  this repository is licensed under the `MIT` license, managed by the `Reuse Specification`"*) runs
  its full benchmark suite once **per merged (bors) commit**, not per PR — its own README: *"gathers
  data for each bors commit"* — with an on-demand bot for a specific PR ("the `site` crate... provides
  a GitHub bot for on-demand benchmarking"). Its comparison methodology, `docs/comparison-analysis.md`
  (fetched in full), determines whether a change is a "significant test result" via **interquartile-
  range fencing**: `result > Q3 + (interquartile_range * 3)`, explicitly choosing this over a fixed
  percentage threshold because it adapts to how noisy a given benchmark actually is.
- **`github-action-benchmark`** (`https://github.com/benchmark-action/github-action-benchmark`, MIT — its own
  README points to `./LICENSE.txt`, fetched and confirmed) is a generic, language-agnostic pattern:
  every entry is `{name, unit, value, range?, extra?}`, stored either on a `gh-pages` branch (chart
  dashboard) or in an `external-data-json-path` file the workflow itself commits/caches. It compares
  the newest value against the stored history and, by default, alerts when the new value is worse than
  the previous one by more than **200%** (its own docs: *"if it gets worse than previous exceeding
  200% threshold... an alert will happen"* — a genuinely loose default, tunable via `alert-threshold`),
  with `fail-on-alert: true` failing the whole CI job and `comment-on-alert: true` posting the result
  as a commit comment.
- **`asv`** (airspeed velocity, `https://github.com/airspeed-velocity/asv`, BSD-3-Clause — confirmed in its own
  README) does the same thing for Python: *"a tool for benchmarking Python packages over their
  lifetime,"* publishing results as a static, interactive website needing "only a basic static
  webserver to host" — no server-side database required, which matters for a project this size (see
  §5).

**Browser performance budgets in CI.** Lighthouse CI's `assert` command (`GoogleChrome/lighthouse-ci`,
Apache-2.0 — confirmed by fetching its own `LICENSE` file directly) accepts a `--budgetsFile` pointing
at a committed `budgets.json`, alongside per-audit assertions in an eslint-style `"off"|"warn"|"error"`
format keyed by Lighthouse audit ID (`docs/configuration.md`, fetched in full: *"Assertions are keyed
by the Lighthouse audit ID and follow an eslint-style format"*). **Size Limit**
(`https://github.com/ai/size-limit`, MIT — its own `LICENSE` fetched and confirmed) applies the identical
pattern to raw JS bundle weight: *"checks every commit on CI, calculates the real cost of your JS for
end-users and throws an error if the cost exceeds the limit,"* and posts the size delta as a PR
comment via a companion GitHub Action.

**A genuine, verified negative finding, stated per this user's own "negative claims need more proof"
rule.** Lighthouse's own long-documented `budget.json` / `--budget-path` feature (the one web.dev's
"Performance budgets 101" article describes) could **not be found anywhere in the current
`GoogleChrome/lighthouse` repository**. Method, stated in full: fetched the entire recursive file tree
of the `main` branch via the GitHub API (13,940 paths) and grepped case-insensitively for `budget` —
zero matches; fetched `types/lhr/lhr.d.ts` and `types/lhr/settings.d.ts` directly — zero matches;
fetched `cli/cli-flags.js` directly — no `--budget` flag defined; fetched `readme.md` — its only two
"budget" mentions are third-party paid tools (SpeedCurve, Gimbal) describing themselves, not a
Lighthouse feature. **This does not mean budgets are gone from the ecosystem** — LHCI's own
`--budgetsFile` flag is real and directly confirmed (above) — but the standalone Lighthouse CLI budget
feature appears to have migrated to, or been superseded by, LHCI's `assert` command rather than
remaining a core-Lighthouse feature, and this research pass could not verify a currently-documented
`budget.json` schema anywhere in the current Lighthouse source. Flagged as **NOT VERIFIED beyond this
search**, not asserted as fact.

## 2. Why it works

Sequential testing (GSPRT/SPRT) stops the instant the evidence is enough, so an obviously-broken or
obviously-fine change is caught in far fewer games than a fixed-N test would need, while resolving a
genuinely narrow hypothesis gap is allowed to take as long as it actually takes — the same page states
Fishtest's typical `[0,5]`-class tests need "at least a few tens of thousands of games" specifically
*because* the gap chosen is narrow, not because sequential testing is inefficient (`engine-strength.md`
§2, already established locally and reconfirmed against this session's fresh Fishtest fetch).

IQR fencing (rustc-perf) works because it makes "how noisy is this specific benchmark" part of the
threshold itself, rather than a single global percentage applied to every benchmark regardless of its
own natural variance — a benchmark that has always jittered ±3% gets a wider fence than one that has
always been rock-steady, which a flat `alert-threshold: 200%` (github-action-benchmark's default)
cannot express at all.

A **committed, append-only artefact** (JSONL history, a `gh-pages` chart, an `asv`-published static
site) works for the same reason a git log works: every entry is immutable, diffable, and
`git blame`-able, so "when did this regress" is a bisectable question rather than a support ticket. It
also needs no server, no database, and no vendor account — which is exactly why it fits a project whose
own instruction set (per the task) prefers zero new runtime dependency and zero third-party network
call, and whose existing scripts (`counts.mjs`, `design-metrics.mjs`) already commit to a stronger
version of the same idea: cross-checking a stored number (in `README.md`) against a freshly measured
one and failing loudly on drift.

Budget-as-a-file (LHCI, Size Limit) works because it turns a design conversation ("is 500KB too much
JS?") into a single number reviewable in a diff, and because CI enforcement means the budget cannot be
silently ignored the way a comment on a PR can be.

## 3. What they do badly

Fishtest publishes no closed-form "N games for a given gap" formula (already established in
`engine-strength.md` §3, reconfirmed: neither `Fishtest-Mathematics` nor `Creating-my-first-test`
states one) — and Fishtest's own regime, tens of thousands of games for a `[0,5]`-Elo gap, is reachable
only because it runs on a volunteer fleet of thousands of machines. Nothing in this project's CI budget
comes close to that scale, so any Elo claim this project makes has to use a much wider hypothesis gap
than Fishtest's own default, which changes what "resolved" can mean here (see §6).

`github-action-benchmark`'s default 200% alert threshold is loose enough to let a real, meaningful
regression (say, 40% slower) through silently unless the project remembers to tighten it — a footgun
for exactly the kind of team that adopts a tool like this specifically to stop forgetting things.

`rustc-perf` needs a hosted comparison service (`https://perf.rust-lang.org`) with its own database and
deployment (`docs/deployment.md` exists in the repo, not fetched in depth here) — heavier
infrastructure than a project this size should take on for what is fundamentally a small number of
scripts run in CI.

Lighthouse's ecosystem has real churn: the standalone `budget.json` feature this research could not
find anywhere in the current repo (§1) is exactly the kind of thing a project would cite from a
two-year-old blog post and then discover, mid-implementation, no longer exists in the form described.

None of Fishtest, rustc-perf, or github-action-benchmark solve the problem this project's own
`strength.mjs` already demonstrates in practice (see §7): a **wall-clock time-budgeted** benchmark is
not reproducible run-to-run on the same machine, same day, same code. Every tool surveyed assumes the
benchmark itself produces a stable number given a stable input; none of them tell you what to do when
the measurement instrument is the noisy part.

## 4. What we should copy conceptually

- **The two-hypothesis SPRT framing, scaled to a gap this project can actually resolve in CI minutes**
  — already the right call in `engine-strength.md` §4/§6: self-play between the four existing bot
  levels (`Pip`/`Nell`/`Vera`/`Oskar`), no UCI, no external engine, both "sides" are calls into the same
  in-process `search()` — the single cheapest, highest-value SPRT this project could run, and it
  currently has zero statistical backing.
- **IQR-style, benchmark-specific noise tolerance** (rustc-perf) rather than one flat percentage
  applied to every dimension — directly informed by this session's own strength.mjs re-run (§7), which
  is exactly the noisy-benchmark case IQR fencing exists for.
- **A monthly/nightly heavier regression tier layered on top of a fast per-change tier** (Fishtest's
  STC→LTC→monthly-SMP structure) — matches this project's own existing two-speed reality: `typecheck`
  (7s, measured this session), `counts.mjs` (44s, measured), `design-metrics.mjs` (0.09s, measured) are
  already fast enough for every commit; `look.mjs` (3m 5.5s for 472 checks, measured this session) is
  already the project's own slow tier, run as part of `npm run check` rather than on every keystroke.
- **The committed-JSON-history pattern** (github-action-benchmark's `{name, unit, value}`, asv's
  per-commit result store) adapted to this project's own established convention: a script that writes
  a result and **cross-checks it against a stored claim**, exactly like `counts.mjs` checking
  `README.md`'s "526 unit tests" and `design-metrics.mjs` checking its "156 contrast pairs" — this
  project already invented half of "benchmark as committed artefact" for a different reason (honesty
  about test/contrast counts) and only needs to extend the same idea to the eight dimensions here.
- **Budget-as-a-committed-file blocking CI** (LHCI, Size Limit) for the one dimension that maps
  directly: mobile performance (§6).

## 5. What we can do better

No competitor in this space — Chess.com, Lichess, any Mini App in the Nimiq catalog
(`research/08-nimiq/catalog-teardown.md`) — publishes a versioned, cross-release scoreboard for its own
engine strength, review accuracy, or anti-cheat false-positive rate at all, let alone as a file a
stranger can read. This project's entire differentiator (`SPEC.md` Part F, the public rating-recompute
page) is publishing exactly the kind of internal number competitors keep private. The same treatment
applied here — publish `benchmark/history.jsonl` itself, in the repository, next to the code it
measures — would be a first for the category, not an incremental improvement on an existing practice.

Unlike Fishtest, this project's cheapest and most valuable strength check (self-play between its own
four bot levels) needs **no external engine, no UCI protocol, and no separate process** — it is a
function call inside the same test runner already used for `packages/core/test/*.test.ts`. That is
strictly cheaper than what any of the surveyed tools assume "benchmarking an engine" requires.

Where every surveyed tool assumes benchmark noise is a nuisance to fence around, this project should
**name the noise as a first-class fact and design the harness so it cannot be run around** — see the
determinism finding in §7, which is a real defect this research surfaced by literally re-running the
project's own script twice on the same day.

## 6. What is technically required

### The eight dimensions

For each: the exact metric, how it is produced, measured or estimated duration, per-commit vs.
nightly, the regression rule, and the number the first time it was measured. Durations marked
**(measured)** were timed in this session on this machine (Node v22.17.0, Windows); everything else is
marked **(estimate)** and is explicitly not yet built.

**1. Engine strength.**
- *Tactical proxy (exists today):* `scripts/strength.mjs` — first-move-found % and whole-line-held %,
  per rating band and overall, Oskar level with `blunderRate` forced to 0, a deterministically-seeded
  240-puzzle sample (`perBand=40`, `budgetMs=300`, current script defaults).
  Duration: **3m 5.6s (measured, this session)**. Cadence: too slow for a hot per-commit loop; belongs
  on the nightly tier until it is made node-budgeted (see §7). Regression rule: **cannot be a single-
  run threshold** — see §7 — recommend comparing against a rolling median of the last 5 committed runs
  and flagging when overall whole-line % drops more than 5 points below that median, or any band drops
  below `median − 2×measured stdev`. First measured: **this session, 91% first / 86% whole line
  overall (240 puzzles)** — which happens to match `README.md`'s own main table figure exactly, while
  `inventory.md`'s same-day run of the identical script with identical arguments got **92%/89%** — see
  §7, this is the load-bearing finding of this whole file.
- *Elo ordering (does not exist):* a new `scripts/self-play.mjs`, in-process SPRT between adjacent bot
  levels (Pip-vs-Nell, Nell-vs-Vera, Vera-vs-Oskar), **node-budgeted, not time-budgeted** (fixes the
  determinism problem at the source), reporting the LLR the way Fishtest's own pages do. Duration
  estimate, from `engine-strength.md` §6's own game-count math (100 Elo gap ≈ 50 decisive games, 50 Elo
  gap ≈ 190, 20 Elo gap ≈ 1,150) at a fast node budget with zero process-spawn overhead: plausibly
  low minutes even at the 20-Elo gap, but **not measured — the script does not exist.** Cadence:
  nightly (SPRT is open-ended). Regression rule: the non-regression LLR crosses the *fail* bound of a
  symmetric window (e.g. `SPRT(-30, 30)`) between two levels that were previously ordered correctly.
  First measured: **not yet measured — no self-play harness exists in this repository today** (`grep`
  confirms nothing under `scripts/` runs bot-vs-bot).

**2. Review accuracy.** Cohen's kappa (not raw agreement — `review-quality.md` §6 is explicit that raw
agreement overstates concordance when one category dominates) between `analysis.ts`'s judgement and a
licence-checked, NAG- or plain-text-`?`/`??`-annotated PGN gold corpus. Duration estimate: a few
hundred positions at `analysis.ts`'s existing ~300ms/position budget (`inventory.md` §3,
`ANALYSIS_LEVEL`) ≈ 1–2 minutes once a corpus exists — **not measured, no corpus exists.** Cadence:
nightly (the corpus is static; only re-run when `analysis.ts`'s thresholds change). Regression rule:
kappa drops below the previously published value minus its own reported confidence interval's
half-width. First measured: **not yet measured — `review-quality.md` §3/§5 confirms zero gold corpus
exists anywhere in this project or, as far as this research found, in the public chess-analysis
literature at all** (the closest candidates, Lichess's puzzle corpus and the LEAP corpus, are both
disqualified or unusable for this exact purpose — `review-quality.md` §3).

**3. Puzzle quality.** A solution-legality audit: replay every stored UCI move list in
`packages/core/src/puzzles-data.ts` (5,000 rows) through the rules engine and assert (a) every move is
legal from the position it is played in, (b) a puzzle whose line is claimed to end in mate actually
ends in checkmate, (c) every theme index resolves inside the 45-entry `PUZZLE_THEMES` table. This is a
pure legality replay with no engine search, so it should be cheap — estimated well under `counts.mjs`'s
measured 44s for 526 tests that *do* include search — but **not measured, the script does not exist**;
confirmed by reading `scripts/vendor-puzzles.mjs` in full: it filters on Lichess's own popularity/
play-count/rating-deviation columns at ingest time and performs **no independent legality check** on
the FEN/move data it trusts. Cadence: per-commit (deterministic, no timing noise). Regression rule:
zero tolerance — any puzzle that fails to replay legally is a hard failure, exactly like a failing unit
test. First measured: **not yet measured — no such script exists today.**

**4. Bot human-likeness.** Two versions, stated honestly at different maturities. *Buildable now:* an
internal-consistency check — run the self-play harness from dimension 1, apply Game Review to the
resulting games, and assert the four levels' resulting accuracy%/ACPL stay strictly ordered
Pip-worst → Oskar-best, i.e. the shipped `blunderRate`/`blunderDepth` design (`inventory.md` §5) is
still producing the intended spread of play quality release over release. Duration/cadence: piggybacks
on dimension 1's nightly self-play run, near-zero marginal cost. *Not buildable without new research:*
comparing bot move distributions against a corpus of real human moves at comparable Lichess ratings —
**no public reference dataset for "human move-accuracy distribution by rating band" was found or
verified in this research pass**, marked **NOT VERIFIED as nonexistent**, only unfound; this is
meaningfully harder than the first version and should not be promised until such a corpus is located or
built. First measured: **not yet measured either way — no self-play harness and no Game-Review-over-
bot-games check exists today.**

**5. Anti-cheat detection.** The false-positive rate on the honest/dishonest test matrix
`adversarial.md` §5–§6 already specifies: run the accuracy-evenness + move-time-variance signal (once
built) over labeled-honest real games and labeled-dishonest games synthesized by literally relaying a
bot level's moves (`adversarial.md`'s own proposed "free, ethically clean synthetic positive control"),
report the % of honest games incorrectly flagged. Duration estimate: dominated by `analysis.ts`'s
existing per-position budget over a few hundred games × ~40 moves each ≈ tens of minutes — **not
measured, cannot be measured yet**: `adversarial.md` confirms, by direct source search, that **no
per-move timing is stored anywhere in this codebase today** and no accuracy-evenness metric is exported
from `analysis.ts` — this dimension has no data model to test against yet, a precondition, not a
benchmarking detail. Cadence: nightly, once built. Regression rule: false-positive rate on the honest
set exceeds its previously published value plus its confidence interval. First measured: **not yet
measured — the underlying feature does not exist.**

**6. Mobile performance.** Navigation Timing captured directly inside the existing `look.mjs` Playwright
harness (`page.evaluate(() => performance.getEntriesByType('navigation'))`, no new dependency — see
§9 and `observability.md` §6 for why this is preferred over adding the `web-vitals` package for a
CI-only check) at the same fixed 390×844 viewport `look.mjs` already uses, plus a per-route transferred-
byte budget. Duration: near-zero marginal cost piggybacked on `look.mjs`'s existing page loads (3m 5.5s
measured this session for the whole 472-check suite, unchanged in kind). Cadence: per-commit (folds
into the existing gate). Regression rule: any route's transferred bytes or a chosen timing metric grows
more than a stated percentage (recommend 10%, tighter than github-action-benchmark's loose 200% default
— see §3) from the stored baseline. First measured: **timing not yet measured** — confirmed by grepping
`scripts/look.mjs` for `performance.now`/timing assertions: none exist today. **One number already
exists**, though, and should become the first committed row: the puzzle chunk is **442 KB**, already
measured and already emitted as its own Vite chunk (`inventory.md` §1, "the 442 KB puzzle chunk"),
never loaded on the critical path.

**7. Nimiq transaction reliability.** Two parts. *Cheap and buildable today:* the wallet-call timeout
budgets are already fixed constants — `sign()` 120s, `isConsensusEstablished()` 5s, `getBlockNumber()`
10s, `requestDeviceIdentifier()` 60s (`money-and-mobile.md` §1, `apps/web/src/wallet.ts`) — a script
that diffs these constants against a committed baseline and fails if one silently changed without an
accompanying doc update, following this project's own README-cross-check convention. Duration:
near-instant. Cadence: per-commit. Regression rule: any drift is a hard failure (zero tolerance,
documentation-and-code-must-agree). First measured: the constants themselves, confirmed this session
by direct read of `apps/web/src/online.ts` — the adaptive poll intervals are **`WAITING_MS = 600`,
`YOUR_MOVE_MS = 2_000`, `HIDDEN_MS = 15_000`, `FINISHED_MS = 4_000`** — these four numbers are the first
committed baseline. *Harder, higher-value, not built:* a Playwright `context.route()` latency-injection
test targeting `SPEC.md` P6's own open question, quoted directly — *"whether 500ms polling holds at
blitz on a real phone network"* — measuring p50/p95 time from an opponent's move landing server-side to
the poller observing it, under injected delay. Duration estimate: tens of seconds once built. Cadence:
nightly (network simulation is noisier). Regression rule: p95 poll-to-observed latency exceeding
`injected delay + one poll interval` by more than a small margin. First measured: **not yet measured —
`money-and-mobile.md` §6 confirms no such test exists, and `SPEC.md` names this explicitly as an open
question, not a settled one.**

**8. Tournament correctness.** Pairing-output conformance: replay a reference test-vector suite (FIDE's
own C.04.3.1 worked examples, cross-validated against `bbpPairings` — Apache-2.0, Lichess's own
production Swiss engine — and/or JaVaFo output for identical inputs, exactly as `research/06-
tournaments/swiss.md` §5 already specifies as the pre-condition for trusting any pairing engine "for
money-bearing standings") through this project's own Dutch-system implementation and assert bit-for-
bit agreement. Duration estimate: seconds — pairing at n=9–16 players (`design.md`'s own stated target
size) is a small combinatorial problem, not a search. Cadence: per-commit, once built. Regression rule:
zero tolerance — any test vector that stops reproducing exactly is a hard failure, per `swiss.md`'s own
framing that money rides on this being correct. **First measured: not applicable.** Tournaments are
explicitly **CUT for v1** (`inventory.md` §9, quoting `SPEC.md` directly: *"arena/Swiss tournaments and
simultaneous exhibitions are CUT"*) — `research/06-tournaments/{fide,swiss,arena,design}.md` are
research-only; grep confirms zero corresponding source files exist under `packages/` or `apps/`. This
dimension is designed forward, honestly, with nothing to benchmark yet.

### The file format

```
benchmark/
  history.jsonl     # append-only, one JSON object per line, never rewritten or reordered
  baseline.json      # one row per dimension: the accepted comparison point and its tolerance rule
```

`history.jsonl` — JSONL rather than a single JSON array specifically because an append-only log with
one independent line per run has no shared closing bracket or trailing comma to fight over in a merge,
which a growing single-array file eventually does. One example row:

```json
{"schema":1,"dimension":"engine.puzzle-accuracy","tier":"nightly","commit":"<git sha>","date":"2026-09-08","runner":"scripts/strength.mjs","args":{"budgetMs":300,"perBand":40},"metrics":{"overallFirst":91,"overallWholeLine":86,"bands":{"800-1199":{"first":100,"wholeLine":100},"2400-3000":{"first":83,"wholeLine":68}}},"durationMs":185565}
```

`baseline.json` — one row per dimension, the thing a regression is actually diffed against:

```json
{"dimension":"engine.puzzle-accuracy","method":"rolling-median","window":5,"tolerance":{"overallWholeLine":{"maxDropPts":5}},"lastPassingCommit":"<git sha>","lastPassingDate":"2026-09-08"}
```

### The release-blocking rule

Extend, don't replace, the existing gate. `npm run check` stays exactly what it is today. Add:

- **`npm run bench`** — the per-commit tier (dimension 3's puzzle-legality audit, dimension 7's
  timeout-constant diff, dimension 6's Navigation-Timing/bundle-size budget once built) — folded into
  `npm run check` alongside `typecheck`/`counts`/`licences`/`design`/`look`, same exit-1-on-any-failure
  contract those already have.
- **`npm run bench:nightly`** — the slow tier (dimension 1's self-play SPRT, dimension 2's kappa,
  dimension 4's Game-Review-over-bot-games check, dimension 5's false-positive rate, dimension 7's
  latency injection, dimension 8's pairing conformance once built) — run on a schedule (a GitHub
  Actions `schedule:` cron), each run appending one row to `history.jsonl` and updating `baseline.json`
  only on a pass, mirroring Fishtest's own STC-then-LTC-then-monthly-SMP layering (§1).
- **The release rule itself:** a release is blocked unless (1) `npm run check` passes on the release
  commit, unchanged from today, **and** (2) every dimension's `baseline.json` row shows
  `lastPassingDate` within a stated freshness window (recommend 7 days) with no unresolved regression —
  a stale or regressed nightly blocks a release the same way a stale README number already fails
  `counts.mjs`/`design-metrics.mjs` today. This is the same discipline this project already enforces
  for two numbers, extended to eight.

## 7. What could break

**The load-bearing finding of this research pass, obtained by literally re-running the project's own
script rather than trusting a stale number.** `scripts/strength.mjs`'s header comment calls its puzzle
sample *"a deterministic sample, so two runs of this compare like for like"* — true of *which puzzles
are chosen*, and false of *the result*, because the engine search inside it is time-budgeted
(`SearchLimits.budgetMs`, `inventory.md` §2), not node-budgeted. This session ran the identical script
with identical default arguments on the same machine, same day, as the run already recorded in
`inventory.md` §2 — and got a **different answer**: this session, 91% first / 86% whole line overall;
`inventory.md`'s same-day run, 92%/89%. `engine-strength.md` §7 already predicted this exact failure
mode in the abstract (*"the same position searched twice can return a different best move if wall-clock
timing jitters mid-search"*) — this research turned that prediction into a directly observed fact.
**Any benchmark built on this script, or any script like it, needs either a node-budgeted search mode
or an explicit multi-run tolerance band before its number can be trusted as a single point** — a
single-run threshold on a wall-clock-timed benchmark will produce false regressions on ordinary CI
machine variance alone.

CI-machine variance compounds the same problem: the existing speed-floor test already asserts a node
rate rather than wall-clock time for exactly this reason (`chess-correctness.md` §7); any new
timing-based dimension (mobile performance, latency injection) should follow the same rule — assert
counts/ratios where possible, treat raw milliseconds as informative but not gate-worthy alone.

A stale nightly baseline is a silent failure mode of its own: if the nightly job breaks (infra outage,
a flaky dependency) and nobody notices, `baseline.json` quietly stops updating while `npm run check`
keeps passing — this is exactly why §6's release rule makes **freshness** itself a release-blocking
condition, not only regression.

The "two wrongs cancel" risk already named in `chess-correctness.md` §7 for perft applies identically to
dimension 8's pairing-conformance check once built: a second, structurally independent reference
implementation (bbpPairings, JaVaFo) is the only real defence, and this project should not trust its
own from-scratch implementation as its own oracle.

GPL discipline is a standing cost, not a one-time one: any external oracle borrowed for these checks
(a real Stockfish binary for an absolute Elo anchor, `python-chess` for a second differential
move-generator opinion) must stay an external, unshipped, CI-only subprocess forever — `engine-
strength.md` §9 and `chess-correctness.md` §9 already establish the exact legal reasoning (FSF's
pipes/subprocess "mere aggregation" guidance) and it does not get easier to maintain as the benchmark
suite grows; it needs to be actively re-checked, not assumed to stay true.

## 8. What we can uniquely do because of Nimiq

Every game this product plays that gets signed becomes a permanent, publicly verifiable record
(`SPEC.md` Part F) — which means the stakes of every one of these eight dimensions are structurally
higher here than in a typical hobby chess project: a move-generator regression, a review-accuracy
regression, or a pairing-conformance regression that slips past `npm run check` does not stay a private
bug to patch quietly later, it becomes a wrong entry in a record the product's own recompute page will
faithfully reproduce forever (`chess-correctness.md` §8 already makes this argument for move generation
specifically; it generalizes to every dimension in this file).

The natural extension is to **publish `benchmark/history.jsonl` on the same public surface as the
rating recompute page** — not as an internal CI artefact but as a first-class, stranger-readable file
next to the record and certificate pages. No competitor in this category — Chess.com's CAPS2, Lichess's
accuracy%, any bot-strength claim either makes — publishes its own testing protocol, seeds, and raw
history at all (`engine-strength.md` §5, `review-quality.md` §8, `adversarial.md` §8 each independently
reach this same conclusion for their own dimension); doing it once, for all eight dimensions, in one
committed file, is a genuine first for the category rather than eight separate incremental
improvements.

## 9. Licence and reuse verdict

- **`rustc-perf` — MIT**, confirmed directly in its own README (fetched in full this session): *"The
  code of this repository is licensed under the `MIT` license."* Safe to read and copy the
  comparison-analysis methodology (IQR fencing) conceptually; nothing here recommends depending on the
  crate itself.
- **`github-action-benchmark` — MIT**, confirmed by fetching its own `LICENSE.txt` directly this
  session (its README's own License section: *"the MIT License (./LICENSE.txt)"*). Safe to adopt
  directly as a CI action if the project ever wants the gh-pages chart dashboard; nothing here requires
  it, since the recommended design (§6) is a self-written, dependency-free script following this
  project's existing `counts.mjs`/`design-metrics.mjs` pattern.
- **`asv` (airspeed velocity) — BSD-3-Clause**, confirmed in its own README, fetched this session. Not
  recommended for adoption (Python-focused, this project is TypeScript), cited only for the "committed
  artefact, no server required" pattern.
- **LHCI (`GoogleChrome/lighthouse-ci`) — Apache-2.0**, confirmed by fetching its own `LICENSE` file
  directly this session. Safe to depend on directly as a devDependency if adopted; not recommended here
  given the project's own stated preference for zero new runtime/CI dependency and the existing,
  cheaper Navigation-Timing-inside-`look.mjs` alternative (§6).
- **Size Limit (`ai/size-limit`) — MIT**, confirmed by fetching its own `LICENSE` file directly this
  session. Same verdict as LHCI: safe, not recommended, a self-written per-route byte-count check
  inside the existing harness is cheaper and matches this project's own conventions more closely.
- **`fastchess` — MIT**, **`cutechess-cli` — GPL-3.0**, **Stockfish — GPL-3.0**, **`python-chess` —
  GPL-3.0-or-later**: all already established with direct source citations in `engine-strength.md` §9
  and `chess-correctness.md` §9; not re-verified in this session, reused here only by reference for
  dimension 1's optional absolute-Elo-anchor and dimension 8's cross-validation, both external-
  subprocess-only per those files' own reasoning.
- **`bbpPairings` — Apache-2.0**, already established in `research/06-tournaments/swiss.md` §5 (used
  in production by Lichess, per that file); reused here by reference only, not independently
  re-verified this session.
- **Chess Programming Wiki / FIDE rules text / PGN NAG glyphs**: published facts, procedures and rules,
  not copyrightable expression — already established in `chess-correctness.md` §9 and
  `review-quality.md` §9, and the same reasoning applies unchanged to citing FIDE's C.04.3.1 worked
  examples as test vectors for dimension 8.
