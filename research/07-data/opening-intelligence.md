# Personal opening intelligence — what your own openings say about you

Research date: 2026-09-08. Sources: Chess.com's own announcement/support articles (WebFetch),
Lichess's own blog post and forum threads on Chess Insights (WebFetch), a live probe of
`lichess.org/insights/<user>/...` and `explorer.lichess.org/{player,lichess,masters}` run directly
from this machine on 2026-09-08 (curl), the Lichess API's OpenAPI source
(`lichess-org/api`, fetched via `gh api`, the same primary source used in `opening-explorer.md`),
Chessable's own help-center articles, five open-source repertoire trainers read directly on GitHub
(`daxaur/tabia`, `gtim/chessdriller`, `kfunezc204/neuralpgn`, `EdmundMartin/chesski`,
`TimAstier/chess-repertoire-trainer`), `lichess-org/lila`'s and `lichess-org/scalachess`'s own
accuracy-formula source files (AGPL, read for reference only, not ported), one independent chess
blog that explicitly considered and rejected this exact analysis, and `chess/SPEC.md`
(this project's own settled decisions, §K1/K2/K8) for facts already established about Scoresheet's
own engine and its own prior test of the Opening Explorer API. Read alongside
`research/07-data/opening-explorer.md` and `openings-names.md` — this file does not repeat their
findings and assumes them.

## 1. What they do

**Chess.com Opening Insights** (Diamond-membership-only; confirmed via
https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com and
https://www.chess.com/news/view/announcing-opening-insights) is one tab inside the broader
"Insights" product, itself gated behind a minimum game filter: a game only counts if it has at
least 10 half-moves, is standard chess (no Chess960/variants), wasn't aborted, wasn't against a
computer, and at least one player has Insights enabled. The Openings tab has exactly two
subsections:
- **Performance** — a table of "your 10 most-played openings," each with win/loss/draw percentages,
  filterable by colour, time control, and a rolling time window (week/30-day/90-day/year/all-time);
  each row expands (a "+") into a mini-board showing how the line continued move-by-move, with
  win-rate per continuation.
- **Mastery** — a single aggregate number: **"the average number of book moves you make in a game
  when you are the one to leave the book first."** This is the closest thing any shipped product
  gets to "how deep is my prep" — and it is one global number across the player's entire history,
  not broken out per opening.

**Lichess Chess Insights** (https://lichess.org/blog/VmZbaigAABACtXQC/chess-insights) is a
different shape of product entirely: a generic "answer engine" over a player's indexed game history,
structured as **metric (Y-axis) × dimension (X-axis) × filters**, not a fixed dashboard. "Opening" is
one available *dimension* — but per the blog post itself, it is identified only by **ECO code +
name** ("A58 Benko Gambit"), with no opening-family grouping and no board preview; the author's own
words: *"I plan to improve the support for opening dimension. Likely adding opening families, and
board previews"* — a stated gap, not a shipped feature. Available *metrics* include average
centipawn loss, opportunism, luck, and result; filters include castling side. **Live-tested
2026-09-08**: the feature still exists at `lichess.org/insights/<user>/...` and returns a real page
(confirmed via a direct request to `lichess.org/insights/DrNykterstein/result/opening/…`), but it is
**privacy-protected by default** — the page returned the title *"DrNykterstein's chess insights are
protected"* and body text *"Sorry, you cannot see [their] insights"* for a public, extremely active
account that never opted in. A forum thread
(https://lichess.org/forum/lichess-feedback/doubt-chess-insights-what-is-it-and-how-does-it-work)
independently confirms it is English-only and under-documented even for opted-in users — one poster:
*"A user's manual with explanations about this tool would be very useful."*

**Lichess Opening Explorer's `/player` endpoint** — already documented structurally in
`opening-explorer.md` §1; this file adds the exact current API contract and its current live
status. From the OpenAPI source (`lichess-org/api:doc/specs/tags/openingexplorer/{player,masters,lichess}.yaml`,
fetched via `gh api` 2026-09-08 — the canonical source, more complete than the README used in the
prior research pass):

| param (`/player`) | type | default | notes |
|---|---|---|---|
| `player` | string | **required** | username or ID |
| `color` | enum | **required** | `white` / `black` |
| `variant` | string | `standard` | `VariantKey` enum |
| `fen` | string | start position | X-FEN root |
| `play` | string | `""` | comma-separated UCI moves from `fen`; needed to resolve an opening name if `fen` isn't itself a named position |
| `speeds` | array | all | game-speed filter |
| `modes` | array | all | `casual`/`rated` |
| `since` / `until` | `YYYY-MM` | `1952-01` / `3000-12` | date range |
| `moves` | integer | unset | how many candidate moves to return |
| `recentGames` | integer | `8` | **max 8** |

Response (`application/x-ndjson`, schema `OpeningExplorerPlayer.yaml`): `opening` (nullable
`{eco, name}`), `queuePosition` (integer — live-indexing progress), `white`/`draws`/`black`
aggregate counts, `moves[]` (each with `uci`, `san`, `averageOpponentRating`, **`performance`** — a
per-move performance rating not documented in the README used previously — plus its own
`white`/`draws`/`black`/`game`/`opening`), and `recentGames[]`. `/masters` and `/lichess` are now
fully documented too (previously flagged NOT VERIFIED in `opening-explorer.md` §3): `/masters` takes
`since`/`until` as bare **years** (default `1952`), `moves` (default 12), `topGames` (default/max
15); `/lichess` additionally takes `ratings` (bucketed: 0/1000/1200/1400/1600/1800/2000/2200/2500+)
and a `history` boolean.

**Auth and rate limits — the load-bearing new finding.** All three endpoints' OpenAPI entries
declare `security: - OAuth2: []`. Community forum posts (pre-dating this research pass) describe the
explorer as not requiring authentication in practice, and the spec's own curl example
(`curl https://explorer.lichess.org/player?player=revoof&color=white&play=d2d4,d7d5&recentGames=1`)
carries no `Authorization` header. **That is no longer true.** A direct, live test from this machine
on 2026-09-08 —
```
curl -o /dev/null -w "%{http_code}" "https://explorer.lichess.org/player?player=DrNykterstein&color=white&play=d2d4,d7d5"
curl -o /dev/null -w "%{http_code}" "https://explorer.lichess.org/lichess?variant=standard&fen=..."
curl -o /dev/null -w "%{http_code}" "https://explorer.lichess.org/masters?play=d2d4,d7d5"
```
— returned **`401 Authorization Required`** (nginx-level, i.e. rejected before reaching the
application) on **all three** endpoints, unauthenticated. This corroborates, and postdates by two
days, this project's own independent finding recorded in `chess/SPEC.md` §K8: *"their public API
returned 401 on 6 Sep."* Two independent checks, two days apart, same result: **the public Opening
Explorer API is presently gated**, whatever its historical reputation. Whether a registered OAuth2
app + user token restores access is **NOT VERIFIED** — no token was available to test with, and
Lichess's own general rate-limit text (https://lichess.org/page/api-tips, and the `## Rate limiting`
section of `lichess-api.yaml`) gives no endpoint-specific numeric limit regardless: *"Only make one
request at a time... If you receive a 429... wait one minute... some limits may require longer."*
No documented request/minute ceiling exists for any Lichess API endpoint, opening explorer included.

**Opening repertoire tooling.** Chessable's **MoveTrainer®** (https://www.chessable.com/movetrainer/,
https://support.chessable.com/en/articles/9043598-how-does-the-spaced-repetition-scheduling-work) is
an SRS layered over commercial course content: the unit drilled is **a single move at a specific
position** ("if you don't [find it], it corrects you and reschedules the position"), grouped into
**lines** (a course chapter), inside **openings** (the top-level content unit, sold as a course). It
uses a levelled interval system (get it right → level up, interval grows; miss it → reset toward
level 1), described qualitatively, not published as a named algorithm (SM-2/FSRS/Leitner — none
named in the fetched pages).

Five open-source alternatives, read directly on GitHub 2026-09-08:

| Repo | Licence | Unit trained | SRS | Notable feature |
|---|---|---|---|---|
| `daxaur/tabia` | **MIT** (confirmed) | Position — "derives drill positions automatically (shared prefixes merge by position)" | Unnamed, ease-style ("clean a line and it won't come back for a while") | Fully client-side, `localStorage` only, no server |
| `gtim/chessdriller` | **None found** — no `LICENSE` file, `license` field is `null` via `gh api repos/gtim/chessdriller`, despite README calling it "open-source" | Move, inside a Lichess-study-backed line | Ease-factor based (SM-2-like, unnamed) | Repertoire stored *as Lichess studies* — no local content model |
| `kfunezc204/neuralpgn` | **MIT** | Line, drilled position-by-position | **FSRS** (named explicitly) | "Game Check" — imports a real game and flags each move that deviates from the repertoire, matched by **FEN** (transposition-safe) |
| `EdmundMartin/chesski` | **MIT** | Move | Unnamed | — |
| `TimAstier/chess-repertoire-trainer` | **MIT** | Line, sourced from Lichess studies | Unnamed | — |

**Chess.com's own course structure** (Master Path study plans, e.g.
https://www.chess.com/article/view/master-path-study-plan-the-opening-1) is not line-drilling at
all: the unit is **the opening as a system** — a sequence of videos building from a foundational
idea to advanced sub-variations, paired with articles explaining *why* strong players choose the
line, explicitly framed against "thematic middlegame plans" rather than move memorisation. The
stated final task is to "analyze your recent games in depth" and notice "when you left your opening
knowledge" — an aspiration, not a computed metric.

**The closest anyone has come to the specific "move-12 cliff" question**, found by direct search of
GitHub code and one dedicated chess-analytics blog:
- `Sandhyaa-a/Kaggle_main_Project:analysis/profiler.py` (**GPL-3.0**) computes three phase-level
  average-centipawn-loss numbers per game (opening/middlegame/endgame, using `python-chess`'s own
  phase boundaries) and assigns an "Opening Dependent" archetype label with a **fixed 40-CPL-point
  threshold**: `if (middlegame_cpl > opening_cpl + 40) and (endgame_cpl > opening_cpl + 40)`. This is
  a real, shipped, three-bucket comparison — not a per-ply curve, not per-opening, and the 40-point
  cutoff is a hardcoded guess with no cited derivation.
- `chessenginelab.substack.com/p/looking-at-sharpness-and-accuracy` explicitly considered exactly
  this analysis and rejected it: *"there is no way of knowing when a player was out of book (or when
  a player was thinking that they are still in book, but in fact mixed up their lines), so I decided
  against excluding any opening moves."* This is a direct, citable statement from an independent
  chess-data blogger that the boundary is genuinely hard to define objectively — not a gap nobody
  noticed, a gap someone looked at and stepped back from.
- Lichess's own accuracy pipeline (below) computes per-game phase accuracy, but the phase boundary
  is a **generic game-phase heuristic** (material-based `Division`), not "where this specific
  player's memorised preparation ends" — the same limitation as the Kaggle project, from the other
  direction.

**The underlying accuracy math, read directly from source** (relevant because any cliff-detection
feature needs a per-move accuracy signal to look for a cliff *in*; the accuracy-scoring landscape
itself is already covered by `research/03-analysis/accuracy.md` and is not re-litigated here — this
is only the piece specific to per-ply, per-opening aggregation). `lichess-org/scalachess`,
`core/src/main/scala/eval.scala`:
```
winningChances(cp) = clamp(2 / (1 + exp(-0.00368208 * cp)) - 1, -1, 1)   // cites lichess-org/lila#11148
WinPercent = 50 + 50 * winningChances(cp)
```
`lichess-org/lila`, `modules/analyse/src/main/AccuracyPercent.scala`:
```
AccuracyPercent(before, after) =
  if after >= before: 100
  else clamp(103.1668100711649 * exp(-0.04354415386753951 * (before - after)) - 3.166924740191411 + 1, 0, 100)
```
— the `+1` is commented **"uncertainty bonus (due to imperfect analysis)."** Nearly identical
constants (rounded to `103.1668`, `-0.04354`, `-3.1669`) are independently reproduced in at least a
dozen unrelated open-source repos found via `gh search code` (`en-croissant`, `pawn-appetit`,
`allie`, `patzer` — the last explicitly labels it *"the harmonic-friendly Lichess formula"*),
strong convergent evidence the constants are correct and stable, even though Chess.com's own
(proprietary, closed-source) implementation was not independently fetched — **NOT VERIFIED** whether
Chess.com's CAPS2 uses literally the same constants or only a similarly-shaped curve; multiple
third-party repos call it "Chess.com-calibrated," which is second-hand.
Lila's **game-level** accuracy is not a plain mean of per-move accuracies: it is
`(volatility-weighted mean + harmonic mean) / 2` over sliding windows sized
`squeeze(move_count / 10, 2, 8)`, weighted by the standard deviation of win% within each window —
i.e. Lichess itself treats naive per-move averaging as too noisy to trust and deliberately
downweights low-volatility (quiet, low-information) stretches. `phaseAccuracies` in the same file
re-runs `gameAccuracy` per phase, using a `Division` (material-based opening/middlegame/endgame
split) — one accuracy number per phase, per game, per colour. Never per opening line, never
aggregated across many of a player's own games by ply.

## 2. Why it works

- **Chess.com's Performance table works because it answers the question a player actually has**
  ("which of my openings should I keep playing") **with the minimum honest unit** — win/loss/draw
  per opening, gated behind a real minimum-game filter (10 half-moves) so degenerate rows don't
  appear. Expandable move-by-move continuations let a curious player go one level deeper without a
  separate screen.
- **Lichess Insights' dimension × metric × filter model works because it composes.** Instead of
  shipping N fixed dashboards, one general query engine answers "accuracy by opening," "luck by
  time control," "result by castling side" from the same indexed data — a genuinely different, more
  scalable architecture than Chess.com's fixed-tab approach, at the cost of discoverability (a blank
  query builder is less inviting than ten pre-filled cards).
- **Chess.com's Mastery number ("average moves to leave book") works as a single vanity/awareness
  metric** because it's simple enough to put in a headline and needs no per-opening sample-size
  reasoning — exactly the tradeoff that makes it too coarse to act on (§3).
- **FSRS/ease-based SRS in the repertoire trainers works** for the same reason it works everywhere
  it's used: reviewing a fact right before you'd forget it is more efficient than fixed-interval
  drilling, and moves are exactly the right grain of "fact" for opening memorisation.
- **`neuralpgn`'s FEN-based Game Check works** because it inherits the same transposition-safety
  lesson already documented in `openings-names.md` §3 and `opening-explorer.md` — matching on
  reachable position, not move-sequence text, is the only way to compare a "prepared line" against a
  "game actually played" without false deviations on move-order swaps.
- **Lila's volatility-weighted windowed accuracy works** because a single quiet, forced, or
  already-decided position contributes almost no information about a player's skill at that moment —
  weighting by local win% variance is a principled way to down-rank exactly those positions instead
  of averaging them in at full strength.

## 3. What they do badly

- **Chess.com's Mastery number is one aggregate for the player's entire history, not per opening.**
  It cannot tell a player "you know the Najdorf 3 moves deeper than the London" — the single most
  useful comparison a personal-prep feature could make is structurally absent from the only shipped
  feature that gets close to it.
- **Neither platform ties opening depth to a per-ply accuracy curve.** Chess.com's Mastery is a
  single count of "book moves" (undefined precisely in the fetched docs — presumably matched against
  their own opening database, not accuracy-derived); Lichess's phase accuracy is a 3-bucket
  per-game split, not per-opening, not per-ply.
- **Lichess Insights' opening dimension is ECO-leaf-only**, by the product's own author's admission
  ("I plan to... likely adding opening families") — a stated, unshipped gap, and the blog post
  predates this research by enough that it may never ship at all; treat "opening families" as
  permanently absent unless re-checked.
- **Lichess Insights defaults to privacy-protected**, confirmed live: even a public, extremely
  active account (`DrNykterstein`) shows nothing without an explicit opt-in. A feature that's
  invisible unless a player finds and flips a privacy toggle first cannot be a discovery surface —
  it can only serve players who already know it exists and went looking.
- **The Opening Explorer's `/player` endpoint is presently unusable without authentication**, per
  the live test in §1 — a real, current, operational gap in "call Lichess for a linked player's
  stats," not a hypothetical one.
- **No repertoire trainer ties SRS drilling performance back to real subsequent game outcomes.**
  `neuralpgn`'s Game Check flags a deviation from the *stored repertoire*; nothing in any of the five
  tools checked asks "does drilling this line actually improve your results when you play it for
  real" — the SRS loop and the game-outcome loop are two closed, disconnected systems everywhere
  they're built.
- **`chessdriller`'s own TODO.md lists "keep track of user's lichess games and notify on
  out-of-repertoire moves" under "Major features"** — i.e. even the one open-source tool built
  specifically to solve the adjacent problem (repertoire drilling tied to real games) has not built
  the connection between the two, years after conceiving it. This is direct, dated evidence that the
  exact class of feature this research is scoping is aspirational everywhere it's been considered,
  not merely undiscovered by us.
- **`chessdriller` calls itself "open-source" with no license file at all** — a real trap for anyone
  assuming "public GitHub repo + 'open-source' in the README" implies a reusable licence; it does
  not (see §9).
- **The chess.com forum's own "5 book moves = 2% accuracy" thread** is a real, documented case where
  a single engine-flagged "inaccuracy" inside known opening theory (5...Nxd5 in the Fried Liver,
  engine-preferred 5...Na5) produced a near-zero accuracy score on a textbook-normal, human-sound
  book move. **This is direct evidence that "accuracy while in book ≈ 100%" is false as a general
  assumption** — some named theory is itself objectively imprecise by engine standards, so any
  cliff-detector that assumes a flat 100% baseline before the cliff will misfire on exactly the
  sharp, well-known lines a strong player is most likely to actually play.

## 4. What we should copy conceptually

- **Chess.com's real minimum-game gate before a game counts at all** (≥10 half-moves, not aborted,
  not vs. a bot) — the same discipline belongs at every level of any personal-stats feature, not
  just the game-inclusion level.
- **Lichess's dimension × metric × filter composability** — even if we ship fixed cards rather than
  a query builder for v1, designing the underlying data model this way (a metric evaluated over a
  dimension, with orthogonal filters) keeps the door open to more views later without a rewrite.
- **`neuralpgn`'s FEN-based, transposition-safe deviation matching** — directly reusable design
  pattern (not code — MIT license means the code itself is reusable too, but the pattern is the
  valuable part regardless of which specific implementation we start from).
- **Lila's volatility-weighted, windowed accuracy over a naive per-move mean** — this is the single
  most transferable idea in this file: don't average raw per-move accuracy across a whole line
  uniformly; weight by how much information a position actually carried.
- **Named-theory as a labelling layer, not a truth layer** — use the bundled CC0 `chess-openings`
  dataset (already decided, per `openings-names.md`) to *name* a bucket ("Sicilian Najdorf: English
  Attack") but never to *define* where the player's personal preparation ends — §5 below designs
  that boundary from the player's own empirical performance instead, precisely because the CC0
  dataset is far too shallow (3,810 positions total, one representative line per named variation) to
  serve as a depth-of-theory ground truth, and because the Fried Liver case (§3) shows "in named
  theory" and "engine-approved" are not the same claim anyway.

## 5. What we can do better

- **Per-opening, per-colour depth, not one global number.** Chess.com's Mastery figure is the right
  *idea* shrunk to the wrong *grain*. The obvious, straightforward improvement — computing the same
  underlying "book-moves-before-deviation" concept separately per opening bucket instead of pooling
  everyone's openings into one lifetime average — is exactly what `repertoire-depth.md` specifies in
  full, including the harder half nobody has published: a *ply-level accuracy curve*, not just a
  move-count-to-first-deviation.
- **A same-player, same-line-relative baseline, not a fixed 100% ceiling.** Given the Fried Liver
  evidence in §3, the correct comparison for "did this player's play get worse" is never "how far
  from 100% engine-perfect," it's "how far from *this player's own typical accuracy in this specific
  bucket's early plies*, or their overall baseline" — a within-player, within-line comparison, not an
  absolute one.
- **Make it free and default-visible, not premium-gated and privacy-hidden-by-default.** Both
  reference products bury this exact class of insight behind either a paywall (Chess.com Diamond) or
  an opt-in privacy toggle nobody finds (Lichess). A small app that shows this by default, the moment
  there's enough data to be honest about it, is a real, checkable product differentiator — not a
  marketing claim, an actual gap in both incumbents' UX confirmed by direct testing in §1.
- **State the minimum sample size and refuse to show a number below it**, rather than either (a)
  showing potentially-noisy numbers from day one (neither Chess.com's help docs nor Lichess's blog
  document any such floor — confirmed absent by direct search of both) or (b) hiding the whole
  feature behind an opaque "not enough data" wall with no visible progress. `repertoire-depth.md`
  specifies the exact floor and the exact partial-progress UI.

## 6. What is technically required

- **A per-move accuracy signal.** `chess/SPEC.md` §K1/K2 already settles that Scoresheet ships its
  own MIT chess engine (~2000 Elo, per the spec's own measured claim) and already computes Game
  Review with accuracy expressed in win-probability terms rather than raw ACPL — *"accuracy in
  win-percentage terms is more honest and is what is shown."* This means the hard, license-blocked
  part (an engine at all, without shipping GPL Stockfish) is **already solved elsewhere in this
  product** — nothing here needs a new engine or a new accuracy formula; it needs the *aggregation
  layer* on top of a signal that already exists. See `research/03-analysis/accuracy.md` for the full
  accuracy-scoring landscape (not repeated here).
- **A position-keyed, transposition-safe opening-bucket assignment per game.** Reuse the same
  "walk moves against the CC0 dataset, matching by reachable position, preferring the longest
  matched line" approach already specified for the reverse FEN→name index in `openings-names.md`
  §5–§6 — one implementation serves both the opening-name display feature and this one.
  Non-CC0-named openings (anything reached but not covered by the 3,810-row dataset — real for
  offbeat lines) still get an ECO-agnostic bucket key from the FEN prefix itself, they just render
  without a friendly name.
  - **Constraint carried over from `opening-explorer.md` §6, Path B**: this is exactly the
    "self-scoped explorer over our own app's games" pattern that file already recommends over
    depending on Lichess's (now 401-gated, see §1) public API — no RocksDB, no external network
    dependency, a conventional keyed store at our own game volume is sufficient.
- **A ply-indexed accuracy store per (player, opening-bucket, colour, time-control-bucket).** For
  every completed game, after Game Review has already produced its per-move accuracy series, write
  `(bucket_key, colour, time_control, ply, accuracy)` rows (or append to a per-bucket running
  aggregate — mean, count, and running variance are all that's needed via Welford's algorithm,
  avoiding storing every raw value if storage is a concern under the "hard bundle budget"
  constraint mentioned for this product).
- **The changepoint statistic itself — specified fully in `repertoire-depth.md` §5–§6**, not
  repeated here: a two-sample mean-difference test over the ply-indexed accuracy series, run once a
  bucket clears its minimum-sample floor, re-run incrementally as new games land in that bucket.

## 7. What could break

- **The Fried Liver problem, generalised**: any sharp, well-known, engine-imprecise book line will
  produce a *false-positive early cliff* if the statistic ever compares against an absolute
  engine-accuracy ceiling instead of the player's own empirical baseline for that exact bucket — this
  is why §5/§6 insist on a same-bucket relative comparison, not an absolute one, and it must not be
  relaxed later for simplicity.
- **Opponent-strength confound.** A player's accuracy at ply 12 depends partly on how hard their
  opponent made that ply, not purely on how deep their own preparation goes — a bucket dominated by a
  few very strong or very weak opponents will bias the apparent cliff ply in either direction. Not
  fully solvable without opponent-rating stratification, which further thins already-thin per-bucket
  samples; the honest mitigation is disclosure (show opponent rating range alongside the stat), not
  a false claim of full control.
- **The engine's own measured ceiling** (SPEC.md §K8: verified 91% key-move / 86% whole-line hold
  rate on bundled puzzles, dropping to 68% at 2400+, and the puzzle set is biased toward short
  forcing tactics) means accuracy readings for the app's own strongest players are less trustworthy
  than for the amateur majority — the cliff feature inherits this ceiling and should say so for any
  player whose own rating approaches or exceeds it, not silently present a number with unstated
  confidence.
- **Small-app cold start.** Every design in this file and in `repertoire-depth.md` needs *our own*
  game volume per opening bucket to be non-trivial before any of it is honest to show — for a brand
  new app this could mean the feature is genuinely inert for weeks per player. The minimum-sample
  gating in §6/`repertoire-depth.md` §5 exists specifically to make that an honest "not enough games
  yet, 6 of 10" state rather than a fabricated early number.
- **Lichess re-opening the public Opening Explorer API** (or a token-gated version becoming usable)
  would not retroactively fix anything here — this whole design is explicitly Path B (our own data),
  which SPEC.md §K8 already independently chose for the unrelated reason that the *dataset itself*
  (six billion Lichess games) can't be reproduced regardless of API access. The 401 finding in §1
  reinforces that choice; it doesn't originate it.

## 8. What we can uniquely do because of Nimiq

- **A tied, verifiable game log.** If (as `chess/SPEC.md` already plans via `sign()`) every game's
  move history is signed and independently recomputable, the same signed record that backs the
  rating can back per-opening, per-ply accuracy statistics — anyone could recompute "this player's
  Najdorf cliff is at move 11" from the public signed log the same way they could recompute the
  rating itself. Neither Chess.com's Mastery number nor Lichess's phase accuracy carries any such
  provenance; both are simply asserted by a central server.
- **A direct link from a detected weak ply to the coaching marketplace already planned in
  `chess/SPEC.md` §K5.** "Your King's Indian regularly loses its edge around move 14" is a
  precise, actionable prompt to buy a $2 coaching review of exactly that position range — feeless
  Nimiq payment is what SPEC.md already identifies as the thing that makes a $2 transaction viable at
  all (card rails floor near 30¢), and this feature is a natural, non-generic demand generator for
  that marketplace rather than a bolt-on.
- **No incentive to game the metric.** Because nothing here is scored or rewarded directly (unlike,
  say, a puzzle-rating leaderboard), and because the underlying record is signed and
  independently checkable, there's no manipulation surface analogous to what a payout-linked stat
  would need to defend against — the same structural point already made in `opening-explorer.md` §8,
  extended to this specific feature.

## 9. Licence and reuse verdict

| Component | Licence | Verdict |
|---|---|---|
| Chess.com Insights / Opening Insights (product) | Proprietary, closed source | **Reference-only.** Nothing to port; only the UX shape (Performance + Mastery split, per-opening table, expandable continuation board) is useful as a design reference. |
| Lichess Chess Insights (product) | Part of `lila`, **AGPL-3.0** | **Reference-only**, same reasoning as `opening-explorer.md` §9 — the dimension × metric × filter architecture is a useful mental model, no code to port. |
| `lichess-org/api` OpenAPI spec (`doc/specs/`) | Repo itself under `lichess-org` org conventions; spec text quoted here for factual API-shape purposes | Documentation, not code — used here purely to state parameters and current auth status accurately. |
| `lichess-org/lila` `AccuracyPercent.scala`, `lichess-org/scalachess` `eval.scala` | **AGPL-3.0-or-later** (per the OpenAPI spec's own `license` field, matching `opening-explorer.md`'s finding for the same org) | **Reference-only.** Formula *values* (the curve-fit constants) are facts, not copyrightable expression, and are independently reproduced by a dozen unrelated MIT/permissive repos found via `gh search code` — safe to reimplement the same numeric curve from scratch. The Scala *code structure* itself (windowed volatility-weighting, harmonic-mean blend) must not be copied verbatim; reimplement the idea, not the file. |
| `daxaur/tabia` | **MIT** | Freely portable, including source, with attribution per MIT terms. |
| `kfunezc204/neuralpgn` | **MIT** | Freely portable, including source, with attribution per MIT terms. |
| `EdmundMartin/chesski` | **MIT** | Freely portable, including source, with attribution per MIT terms. |
| `TimAstier/chess-repertoire-trainer` | **MIT** | Freely portable, including source, with attribution per MIT terms. |
| `gtim/chessdriller` | **None declared** — `gh api repos/gtim/chessdriller` returns `license: null`; no `LICENSE`/`LICENSE.md` file found in the repo despite the README's "open-source" framing | **Do not port code.** A public repo calling itself "open-source" with no OSI licence file is, by default copyright law, all-rights-reserved for reuse purposes — treat exactly as if closed-source; the TODO.md and README content quoted in this file were used only as documentation of intent/design, which is fair use for research commentary, not a licence to copy implementation. |
| `Sandhyaa-a/Kaggle_main_Project` (`profiler.py`) | **GPL-3.0** | **Reference-only, clean-room per `chess/SPEC.md` Part L rule 4** — the 40-CPL-point "Opening Dependent" threshold logic described in §1/§3 may inform our own independently-written statistic, but the file itself must not be read-then-copied by whoever writes our implementation. |
| `chess-openings` (CC0) | Already covered in `openings-names.md` §9 | Unrestricted, as previously verified — this file relies on that prior verdict without repeating it. |

**Bottom line**: every reusable *idea* in this space (dimension-based querying, FEN-based
transposition-safe matching, volatility-weighted accuracy windows, per-opening depth rather than a
global average) is available to copy conceptually with zero licence risk, and four of the five
open-source repertoire trainers checked are outright MIT. The one component that would need to be
built from nothing — a per-ply, per-opening, relative-to-self accuracy-cliff statistic — is, per
direct search, not published anywhere in a form we could copy even if we wanted to; `repertoire-depth.md`
designs it from first principles for exactly that reason.
