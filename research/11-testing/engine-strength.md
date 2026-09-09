# Engine strength — SPRT, the statistical protocol, and the GPL-oracle question

Research date: 2026-09-08. Scope: how to make a defensible statistical claim about the strength of
`packages/core/src/search.ts` — an original alpha-beta engine with iterative deepening, a Zobrist
transposition table, killer/history move ordering, null-move pruning and quiescence search,
written from published technique so the bundle stays MIT (its own header comment). It ships four
named bot levels — `Pip` (depth 1), `Nell` (depth 3), `Vera` (depth 6), `Oskar` (depth 14),
`packages/core/src/engine.ts` — each "shown without a rating number" by deliberate product decision
(`SPEC.md` Part P3: "A fake rating on a weak bot is a lie the engine will later expose"). No Elo
claim for any level exists anywhere in the repo today, and the search module's own doc comment
asserts, unverified, that "finding the blunders in an amateur game needs about 2000 [Elo]."

## 1. What they do

**Fishtest**, Stockfish's own testing framework, validates every proposed patch with a **Sequential
Probability Ratio Test (SPRT)**: two Elo hypotheses, H0 (`elo0`) and H1 (`elo1`), and the test
accumulates game results until the log-likelihood ratio crosses one of two bounds, rather than
stopping at a fixed game count. A typical "does this gain Elo" test uses `elo0=0, elo1=5`; a
non-regression test flips to a negative window (e.g. `[-5,0]` or `[-3,1]`). Source:
https://github.com/official-stockfish/fishtest/wiki/Creating-my-first-test,
https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html.

The bounds themselves come from the classical Wald SPRT: with false-positive rate `alpha` and
false-negative rate `beta` (Fishtest defaults `alpha = beta = 0.05`), the stopping bounds are
`A = ln((1-beta)/alpha)` and `B = ln(beta/(1-alpha))`. At `alpha = beta = 0.05` this is
`A ≈ ln(19) ≈ 2.944`, `B ≈ -2.944` — independently corroborated by a third-party engine-testing
guide quoting Fishtest's actual LLR bounds as "approximately (-2.94, 2.94)". Source:
https://dannyhammer.github.io/engine-testing-guide/sprt.html, and Fishtest's own `stat_util.py`
source, which implements the Elo-to-win-probability conversion via the standard logistic model
`p = 1 / (1 + 10^(-Elo/400))`. Source: https://github.com/glinscott/fishtest/blob/master/server/fishtest/stats/stat_util.py.

**Pentanomial pairing.** Fishtest plays each opening position twice, once with each engine as White,
and scores the *pair* as one of five outcomes (0, 0.5, 1, 1.5, 2 points) rather than scoring two
independent games — `stat_util.py` prefers the pentanomial statistic (`R_ = R.get("pentanomial", R3)`)
whenever it is available. Pairing cancels the variance an unbalanced opening would otherwise inject,
since both engines get each side of it exactly once. Source: same `stat_util.py` link above;
corroborated at https://dannyhammer.github.io/engine-testing-guide/sprt.html.

**Match runners.** `cutechess-cli` is a UCI/UCCI/XBoard tournament manager, licensed **GPL-3.0**
(its `COPYING` file is literally "GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007," with no
"or later" clause). Source: https://github.com/cutechess/cutechess/blob/master/COPYING,
https://github.com/cutechess/cutechess. **fastchess** is a newer C++17 alternative, licensed **MIT**,
tested to 250 concurrent threads at time controls as short as `0.2+0.002`, and invoked like:
`fastchess -engine cmd=E1.exe name=E1 -engine cmd=E2.exe name=E2 -each tc=10+0.1 -rounds 200 -repeat -concurrency 4`.
Source: https://github.com/Disservin/fastchess. No pure-JS/Node equivalent to either was found in
this search — **NOT VERIFIED as nonexistent**, but nothing surfaced.

## 2. Why it works

SPRT is a *sequential* test: it keeps accumulating evidence only until the LLR crosses a bound, so a
clearly-winning or clearly-losing change is caught with far fewer games than a fixed-N test would
need, while a genuinely marginal change (elo0 and elo1 close together, as Fishtest's `[0,5]` window
usually is) is allowed to run as long as it actually takes to resolve. This is why Fishtest's own FAQ
describes typical `[0,5]`-class tests needing "at least a few tens of thousands of games" — the
hypothesis gap is deliberately narrow, and narrow gaps are expensive to resolve regardless of the
statistical method. Source: https://github.com/official-stockfish/fishtest/wiki/Fishtest-mathematics.

Pentanomial pairing works because opening choice is itself a large source of game-to-game variance
that has nothing to do with which engine is actually stronger; playing both colours of the same
opening and scoring the pair together removes that source of noise rather than merely averaging over
it, which is why Fishtest treats it as the preferred statistic whenever available.

The GPL-3.0-vs-MIT question resolves cleanly once the actual mechanism is checked. The FSF's own GPL
FAQ states: "pipes, sockets and command-line arguments are communication mechanisms normally used
between two separate programs," which does **not** create a combined or derivative work absent
"intimate" in-process linking, and separately that "the output of a program is not, in general,
covered by the copyright on the code of the program" (the same principle that lets GCC compile
proprietary software without GPL-ing the output). Source:
https://www.gnu.org/licenses/gpl-faq.html. Running Stockfish (GPL-3.0) or `cutechess-cli` (GPL-3.0)
as an **unmodified, external, unshipped subprocess** purely to produce a comparison Elo number in a
research document is squarely "mere aggregation" under this reading — no GPL obligation attaches,
because nothing GPL is distributed and the resulting number is output, not a derivative work. This is
established FSF guidance, not a novel interpretation, and matches this project's own `LICENCES.md`
§6, which already reasons that "run Stockfish as a separate service... Legal" for an analogous case.

## 3. What they do badly

Fishtest publishes no closed-form "N games for a given Elo gap" formula — SPRT is inherently
open-ended, running "until the LLR crosses a bound" rather than to a fixed sample size, and
chessprogramming.org's own SPRT page states the same absence. Source:
https://chessprogramming.org/Sequential_Probability_Ratio_Test. This makes it genuinely hard for a
small project to budget compute in advance; the honest answer is "however many games it takes," which
is unattractive to plan around.

Fishtest itself only works at its actual scale — thousands of volunteer CPUs running continuously —
because narrow-gap `[0,5]`-class tests need tens of thousands of games. A single-machine or CI-scale
project can never reproduce Fishtest's own regime; it has to either accept a much wider, cruder
hypothesis gap (which resolves in far fewer games) or accept that a genuinely narrow-gap claim is
simply out of reach without comparable compute.

`cutechess-cli`, the more established and widely-documented of the two match runners, is GPL-3.0,
which forces any permissively-licensed project to run it only as an external, never-distributed CI
tool — an extra discipline that has to be actively maintained (never let it appear in
`package.json` dependencies, never bundle its binary) rather than something the licence enforces
automatically.

## 4. What we should copy conceptually

- **The two-hypothesis SPRT framing itself**, scaled to a gap this project can actually afford to
  resolve — e.g. `elo0 = -30, elo1 = 30` for "did a change to search.ts regress or improve strength"
  rather than Fishtest's narrow `[0,5]`, which would require orders of magnitude more games than a
  small project can run in CI.
- **Self-play matches between the four existing bot levels** (`Pip`, `Nell`, `Vera`, `Oskar`) to
  establish, with an actual SPRT and a published LLR, that the levels are monotonically ordered in
  strength — this needs no external oracle, no GPL exposure, and no UCI protocol at all, since both
  sides of the match are calls into the same in-process `search()` function. This is the single
  cheapest, highest-value SPRT this project could run, and it currently has zero statistical backing
  despite the levels already existing and being user-facing.
- **fastchess's CLI invocation pattern**, MIT-licensed and therefore safe to depend on directly as a
  CI dev-tool, for the one case that genuinely needs an external UCI process: an absolute Elo anchor
  against a real reference engine.
- **Reporting the LLR and bounds themselves**, the way Fishtest's own test pages do, rather than only
  a raw win/loss/draw tally — this is what makes a strength claim falsifiable rather than merely
  asserted.

## 5. What we can do better

Neither Chess.com nor Lichess publishes the statistical protocol behind any strength claim they make
about their own bots. This project's entire differentiator (`SPEC.md` Part F, the public recompute
page) is publishing exactly the kind of thing competitors keep private — the same treatment applied
here would mean: **publish the SPRT protocol, the exact `elo0`/`elo1`/`alpha`/`beta` chosen, the
seeds, and the raw game log**, so a stranger could rerun the identical match and reproduce the same
LLR, rather than trusting a number in a README. Nothing in the chess industry currently does this for
a bot-strength claim; it would be a genuine first for this category.

Concretely: run the self-play SPRT described in §4 first, since it validates something the product
already ships (level ordering) with no external dependency at all, and only pursue an absolute
Stockfish-anchored Elo number second, and only as an unshipped, offline, clearly-labelled research
artifact — never a number claimed in end-user-facing copy without that artifact existing to back it.

## 6. What is technically required

- **A minimal in-process match runner** for self-play between bot levels — no UCI protocol is needed
  here at all, since both "engines" are the same TypeScript `search()` function called with different
  `Level` configs (`packages/core/src/engine.ts`); this is strictly cheaper to build than a
  UCI-wrapped cross-engine harness.
- **A UCI-protocol wrapper around `search.ts`**, which does not exist today, only if an absolute
  external anchor (vs. Stockfish, run at a fixed, low `UCI_Elo`/`Skill Level` setting) is pursued —
  this is real, unbuilt engineering, not a config change.
- **fastchess (MIT)** as the match runner for any cross-engine case, invoked exactly as documented in
  §1, run only as a CI/dev tool and never bundled into the shipped app.
- **Rough game-count budgeting** (derived here, not published anywhere — treat as a floor, not a
  target): using the logistic Elo model and a naive one-shot 95%-confidence binomial approximation
  (`N ≈ (1.96 × 0.5 / (p − 0.5))²`), detecting a **20 Elo** gap needs roughly **1,150** decisive
  games, a **50 Elo** gap roughly **190**, and a **100 Elo** gap roughly **50**. These numbers are
  far smaller than Fishtest's real-world "tens of thousands," precisely because Fishtest's actual
  hypothesis gaps (`[0,5]`) are much narrower than a flat 20/50/100 Elo target — the wider the gap
  chosen for `elo0`/`elo1`, the fewer games an SPRT needs to resolve it.
- **A fixed time control short enough to make thousands of self-play games affordable in CI minutes**
  — e.g. 1+0.1 — since this engine's own measured node rate (~6.1M nodes/sec on the fast board,
  `search.ts` header) is still a much shallower search than Stockfish's, and self-play matches do not
  need long thinking times to be meaningful for ordering four internal levels against each other.

## 7. What could break

- **The engine's own doc comment already asserts an unverified strength figure** — "Finding the
  blunders in an amateur game needs about 2000 [Elo], and that is a bounded, decades-old piece of
  engineering" (`packages/core/src/search.ts`). Until an SPRT protocol is actually run, this remains
  exactly the kind of claim this project's own standards forbid: an assertion based on reasoning
  rather than evidence.
- **Determinism.** `search.ts` runs a *time*-budgeted iterative deepening search, so the same position
  searched twice can return a different best move if wall-clock timing jitters mid-search — a
  self-play SPRT needs either a node-budgeted mode (search a fixed node count, not a fixed
  millisecond count) or to accept engine-vs-itself timing noise as a real confound in the result.
- **Deliberate randomness in the bot levels themselves.** Each level has a `blunderRate` and, per the
  repo's own test ("the same position and the same dice give the same move — a bot that cannot be
  pinned cannot be tuned," `engine.test.ts`), a seeded RNG. A self-play SPRT has to either fix the
  seed for reproducibility or deliberately vary it and treat blunder-injection as part of what is
  being measured — conflating the two would make "is Oskar stronger than Vera" and "did this RNG seed
  happen to be lucky" indistinguishable.
- **CI cost.** Thousands of self-play games, even at a fast time control, is minutes to tens of
  minutes of compute — appropriate for a nightly or on-demand job, and specifically **not** for the
  default `npm run check` gate, which `scripts/counts.mjs`'s own design explicitly keeps fast by
  running the test suite exactly once.

## 8. What we can uniquely do because of Nimiq

Not Nimiq-specific in mechanism, but directly continuous with this project's actual differentiator:
because the rating system is already built around public, independently recomputable claims
(`SPEC.md` Part F, the recompute page), the same treatment extends naturally to an engine-strength
claim — publish the SPRT protocol, seeds and raw logs as a downloadable artifact so a stranger can
rerun the exact match and reproduce the same LLR, rather than a marketing number. No competitor in
this space (Chess.com's bot ratings, Lichess's Maia-style bots) makes its own bot-strength testing
independently reproducible by a stranger; this project's whole thesis is that everything else about
it already is.

## 9. Licence and reuse verdict

- **`cutechess-cli` — GPL-3.0 exactly**, confirmed at its own `COPYING` file
  (https://github.com/cutechess/cutechess/blob/master/COPYING). Usable only as an external,
  unshipped CI subprocess, invoked over its command-line interface — never linked, vendored, or
  imported into the MIT bundle. Consistent with this repo's own `LICENCES.md` §6 reasoning about
  running Stockfish as a separate, unshipped service.
- **`fastchess` — MIT**, confirmed at https://github.com/Disservin/fastchess. Safe to depend on
  directly as a devDependency or CI tool with no separation discipline required by the licence
  itself — though it still has no reason to appear anywhere in the shipped app regardless.
- **Stockfish — GPL-3.0, "no linking exception"** (already recorded in this repo's own
  `LICENCES.md`). Using it only as an offline, unshipped oracle subprocess during CI/dev, purely to
  print a comparison number, is not a GPL trigger under the FSF's own pipes/subprocess and
  program-output guidance cited in §2 — the same reasoning this repo's `LICENCES.md` already applies
  to the identical question.
- **`python-chess` — GPL-3.0-or-later** (see `chess-correctness.md` §9 for the confirmed source).
  Same oracle-only posture if ever used to cross-check anything engine-related.
