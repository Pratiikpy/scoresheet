# Chess profile — the honest "chess intelligence profile" screen

Scope: the user-facing product on top of `skill-model.md`'s mechanism. Aimchess is the closest
shipped competitor to a multi-dimensional "chess intelligence profile," so it is examined directly.
The critical deliverable this file owes: an explicit list of what can be honestly shown, what needs a
minimum sample size before it means anything, and — separately, and just as important — what must
**not** be shown because the data or the evidence does not support it as an independent measurement.

## 1. What they do

- **Aimchess** ([aimchess.com](https://aimchess.com/), fetched directly) imports a user's Chess.com/
  Lichess/Chess24 game history and scores six named categories: **Tactics** ("spot your opponent's
  tactical mistakes, prevent yourself from blundering"), **Endgame** ("convert winning endgames and
  save losing ones"), **Advantage Capitalization** ("when you get better positions are you able to
  convert those into wins"), **Resourcefulness** ("find counter-play even when you're in worse
  positions"), **Time Management** ("properly manage your clock to maintain a high level of play"),
  and **Opening performance** ("consistently gain an advantage in the opening phase... or are you
  forced to recover from early mistakes"). Scores are shown relative to other players at the same
  rating. [Search-result synthesis of Aimchess's own marketing copy, corroborated by direct fetch of
  aimchess.com](https://aimchess.com/)
- **Methodology disclosure is minimal.** The site's own language is "analyze every move from your
  recent games and measure your skill set across six core aspects of chess" — no formula, no weighting,
  no named engine version, no confidence measure. One independent, hands-on review states scores come
  from "running your games through an engine and comparing your moves to the best available ones — the
  same Stockfish engine that powers most online analysis," but adds no further mathematical detail.
  [checkmatex.app, Aimchess Review 2026](https://checkmatex.app/blog/aimchess-review-2026-is-it-worth-it),
  fetched directly. Two other independent reviews — [Chess.com blog: Aimchess: A Review](https://www.chess.com/blog/SheldonOfOsaka/aimchess-a-review)
  and [The Chess Advisor's review](https://thechessadvisor.com/website-review/aimchess/), both fetched
  directly — contain **no description of the scoring mechanism at all**, only feature and pricing
  descriptions.
- **Pricing/data tiers**: Free tier gives one 40-game analysis per month; Premium ($7.99/mo, or
  $4.85/mo billed annually) gives unlimited analysis, "2x deeper analysis" (unquantified), analysis of
  the last 1,000 games, and multi-account tracking across platforms. [aimchess.com](https://aimchess.com/),
  fetched directly.
- **One specific accuracy claim, found only on Aimchess's own site**: "Aimchess personalized puzzles
  increase your rating 31% faster than standard tactics puzzles" based on "research from the University
  of British Columbia in a 12-week study." [aimchess.com](https://aimchess.com/), fetched directly. No
  paper title, author, publication venue, or link was found on the site itself, and none of the three
  independent reviews fetched in this pass mention or corroborate this claim at all.
- **Comparators already researched elsewhere in this project, not re-derived here**: Chess.com's
  nine-category move-classification taxonomy (`03-analysis/game-review.md`), Lichess's per-theme
  puzzle-dashboard strengths/weaknesses panel (`04-puzzles/personalization.md` §1), and the three
  accuracy metrics (CAPS2, Lichess Win%/Accuracy%, ACPL) in `03-analysis/accuracy.md` — all of these
  are substrate a profile screen would draw from, none of them is itself a multi-dimensional "profile"
  product the way Aimchess is.

## 2. Why it works

- **Multi-dimensional feedback is more actionable than a single number.** "You're 1400" tells a player
  nothing to do next; "your endgame technique lags your tactics by 150 rating-equivalent points" gives
  a concrete next action. This is the same underlying logic that makes Lichess's theme dashboard useful
  despite its noise problems (`personalization.md` §1), just packaged as a paid, polished consumer
  product rather than a free-tier feature.
- **Rating-relative comparison** ("compared to others with the same rating") is a defensible framing —
  it answers "is this weak *for me*," not an absolute claim, which is the same honesty principle
  `rating-systems.md` §4 already commits to for the main rating ("ratings don't transfer across
  populations... say so").
- **The category names map onto real, intuitive phases and moments of a chess game** (opening, middle
  conversion, endgame, defending, clock use) — this is good product naming independent of whatever the
  underlying computation actually is, and is worth separating from the (unverified) claim that each
  name corresponds to an independently measurable skill (§3, §5).

## 3. What they do badly

- **Total opacity on methodology.** Across four independently fetched sources (Aimchess's own site and
  three third-party reviews), not one describes an actual formula, a confidence interval, a minimum
  sample size, or a validation methodology for any of the six category scores. The most specific
  statement found anywhere is "running your games through an engine and comparing your moves to the
  best available ones" — which describes accuracy scoring in general (`accuracy.md`), not how six
  distinct category numbers are derived from it.
- **The one quantified accuracy claim on the site ("31% faster... University of British Columbia...
  12-week study") is unlinked and uncorroborated.** No paper, author, or venue is named on Aimchess's
  own site, and none of the three independent reviews fetched here mention it at all — treat this as an
  unverified marketing claim, not evidence, until a specific citable paper is found. **NOT VERIFIED.**
- **One reviewer explicitly flags the accuracy-vs-humanness gap directly relevant to this whole
  file**: "the 'best move' the engine wants isn't always the move a human should play... I treat the
  scores as directional, not gospel," specifically noting engine evaluation misjudges "messy,
  double-edged positions." [checkmatex.app](https://checkmatex.app/blog/aimchess-review-2026-is-it-worth-it),
  fetched directly. This is a first-person, hands-on caveat about exactly the kind of engine-agreement
  proxy any Scoresheet profile would also have to rely on.
- **No source found states a minimum number of games before a category score is considered reliable**,
  despite the free tier explicitly being a 40-games/month cap — the product ships numbers from however
  many games a user has imported, with no visible confidence signal distinguishing a score built on 40
  games from one built on 1,000.
- **The six categories are not evidenced as independent skills in the actual psychometric
  literature.** The Amsterdam Chess Test (ACT), developed by van der Maas & Wagenmakers (2005)
  specifically to measure chess ability psychometrically, found — per a detailed secondary synthesis
  ([lichess.org blog, "A g-factor for chess? A psychometric scale for playing ability"](https://lichess.org/@/NDpatzer/blog/science-of-chess-a-g-factor-for-chess-a-psychometric-scale-for-playing-ability/tTXWy9oV),
  fetched directly) — a **mixed factor structure**: analyzing broad task categories together showed "a
  single factor on which everything loads (a hint of general 'Chess IQ')," but analyzing all subscales
  separately supported roughly a **four-factor structure**, with Factor 1 combining **tactics and
  positional play** together (not separately) and Factor 2 being **chess-specific memory/recall** — a
  cognitive-mechanism factor with no analogue among Aimchess's six named categories at all. **No factor
  in the cited structure corresponds cleanly to Aimchess's "Resourcefulness" or "Advantage
  Capitalization"** as independently loading dimensions — this is the single most load-bearing finding
  in this file, and it is addressed directly and concretely in §5's CANNOT-measure list below.

## 4. What we should copy conceptually

- **The six-name taxonomy is good product framing and worth reusing as UI category names** — Openings,
  Tactics, Endgame, Time Management, and framed accuracy-while-ahead/accuracy-while-behind views —
  because it maps cleanly onto phases and moments a player already recognizes from their own games, and
  because several of the names correspond to data Scoresheet can honestly compute (see §5's CAN list).
  Copy the naming and the "compared to your own rating band" framing; do not copy the (undisclosed, and
  per §3 likely overstated-in-independence) scoring methodology behind it.
- **Copy Aimchess's instinct to pair a diagnosed weakness with a concrete intervention** (their
  "personalized puzzles built from your mistakes... combined with... lessons") — this is the same shape
  as the closed loop specified in `04-puzzles/learning-loop.md`, and is worth adopting as a product
  pattern even though Aimchess's specific implementation and validation cannot be examined or reused.
- **Copy the population-relative framing**, already independently arrived at in `rating-systems.md`
  §4 for the main rating — apply it identically to any per-category number that is shipped.

## 5. What we can do better

- **Publish the actual formula.** Every per-category number, if shipped, should trace directly to
  `skill-model.md`'s versioned per-skill Elo update or to one of the deterministic accuracy metrics in
  `accuracy.md`/`game-review.md` — a genuine, checkable differentiator against a competitor that four
  independently fetched sources could not describe the mechanism of at all.
- **Show a visible confidence/sample-size signal on every category, always** — never a bare number.
  No source found any minimum-game threshold disclosed by Aimchess anywhere; this is a concrete,
  checkable gap to close.
- **Run the falsification check the evidence demands before shipping the two weakest-evidenced
  categories.** Given the ACT's factor-analysis finding that tactics and positional play load onto one
  factor (not two), and that no factor corresponds to "Resourcefulness" or "Advantage Capitalization"
  as separate constructs, the honest engineering step — not a design nicety, a required check — is to
  compute, on Scoresheet's own accumulated data, the partial correlation between a proposed
  "Resourcefulness" score (accuracy while the engine eval is negative for the player) and the player's
  overall accuracy score, controlling for overall accuracy. If "Resourcefulness" is >90% explained by
  general accuracy once that control is applied, it is not a separate skill — it is general accuracy
  filtered by a condition, and must be labeled and shipped as exactly that (a filtered view), not as an
  independently diagnosed dimension. The same check applies to "Advantage Capitalization."
- **Say plainly, in-product, which categories are strong signals and which are filtered views.** This
  is the direct, honest resolution to the risk the task explicitly names: "a profile with eight numbers
  that are really one number in a trenchcoat would be a lie dressed as insight." The fix is not to hide
  the categories — it is to label each one accurately.

### The CAN/CANNOT list

**CAN be honestly measured, from data Scoresheet already has or can cheaply derive, subject to the
sample-size gates below:**

1. **Tactical pattern recognition, by theme.** Puzzle solve rate and speed per Lichess-style theme tag,
   using `skill-model.md`'s per-skill Elo. This is a direct, controlled, retrieval-practice measurement
   — the single strongest-evidenced category on this list, because a puzzle attempt is a clean,
   single-answer event with a known correct solution, unlike a real-game move.
2. **Move accuracy relative to a pinned engine** (blunder rate, ACPL-style, or the Lichess
   Win%/Accuracy% swing formula already documented in `accuracy.md`) — deterministic given a versioned
   engine configuration, and the substrate every other game-derived category below is built from.
3. **Opening-phase accuracy** — move quality restricted to a defined opening window (e.g. until the
   first move outside a book/opening database, echoing Chess.com's own "first key moment is usually the
   last book move" convention from `game-review.md` §1). Measurable and well precedented.
4. **Endgame-phase accuracy** — the same accuracy metric restricted to a defined endgame phase (a
   material-threshold or move-count heuristic). Measurable with the same caveats as #2, and requires a
   published, versioned phase-boundary rule so the number is reproducible.
5. **Time usage patterns** — *conditional on clock data being present* in the source game. Move-time
   distributions, time-pressure blunder rate (cross-referencing `own-blunder-training.md` §1's
   clock-aware filtering). This is objectively measurable when clock data exists and **must be shown as
   "no data" rather than silently omitted or defaulted** for any imported PGN without move times — a
   real, frequent case (correspondence games, some PGN exports).
6. **Puzzle-rating-derived per-theme ability**, i.e. `skill-model.md`'s mechanism directly, gated by
   the same N≥15 minimum from `personalization.md` §5.

**CANNOT be honestly measured with what this product has or could cheaply collect, and must NOT be
shown as an independently diagnosed score:**

1. **"Resourcefulness" / defending worse positions, as an independent construct.** The only available
   proxy — accuracy while the engine eval is negative — structurally conflates "resourceful defending"
   with "being a generally weaker player" (a weaker player is less accurate everywhere, not selectively
   worse only when behind). No source reviewed in this pass or in `skill-model.md` establishes this is
   statistically separable from overall accuracy. Do not ship as a standalone number without first
   running the partial-correlation check specified in §5, and be prepared for the honest result to be
   "this is not a separate thing."
2. **"Advantage Capitalization" / converting winning positions, as an independent construct.** Same
   structural problem as above — a subset of overall accuracy filtered by eval sign, not an
   independently diagnosed skill absent a real correlational check.
3. **Calculation depth ("how many moves ahead you see").** No source found in this research pass — nor
   any of the knowledge-tracing or IRT literature reviewed in `skill-model.md` — describes measuring
   this from game outcomes alone. What *can* be measured (whether a player found a specific engine
   line) measures "did you find what this engine's PV needed here," which is a narrower, position-
   specific thing, not a general "calculation depth" score. Do not ship a "calculation depth" number.
4. **General intelligence / a "chess IQ" score.** The best available evidence, a meta-analysis of
   cognitive-ability-vs-chess-skill studies, found "an average correlation of 0.22, or 5% of variance
   explained" between general intelligence and chess skill overall, rising only to r≈0.31 in children
   and at lower skill levels. [Search-result synthesis of Burgoyne, Sala, Gobet, Macnamara, Campitelli
   & Hambrick meta-analysis](https://artscimedia.case.edu/wp-content/uploads/sites/141/2016/12/22143817/Burgoyne-Sala-Gobet-Macnamara-Campitelli-Hambrick-2016.pdf) —
   **not independently read in full in this session**, cited from search synthesis of its abstract/
   summary. Five percent of variance is nowhere near enough to back an "IQ-like" number out of game
   data — this would be a larger overclaim than any other item on this list. Do not ship.
5. **Psychological/personality traits** — tilt-proneness, competitiveness, confidence beyond what is
   directly observable in move quality. Scoresheet's data (games plus puzzle attempts) does not speak
   to this at all; measuring it honestly requires a validated self-report instrument, a fundamentally
   different measurement category (self-report, not behavioral inference from move quality) and out of
   this product's current scope. Do not ship without one.
6. **"True" positional understanding, independent of engine agreement.** Engine agreement is itself an
   imperfect proxy for "good chess," particularly — per checkmatex.app's own hands-on caveat (§3) — in
   "messy, double-edged positions." Any positional-understanding number this product ships must be
   named and understood as an engine-agreement proxy, never presented as ground truth about positional
   skill.

### Minimum sample sizes before a number means anything

- **Theme/category "weakness" claims**: N≥15 attempts, reusing `personalization.md` §5's own
  recommendation, sourced from the documented Lichess forum complaint pattern about noisy small-sample
  per-theme performance.
- **Per-skill Elo point estimates**: apply the same Glicko-derived confidence-interval logic used
  throughout `skill-model.md` §7 (an RD of 50 implies a roughly ±98-point 95% confidence interval) —
  below roughly 15-20 attempts on a given skill, the point estimate carries enough uncertainty that
  displaying a specific number rather than a "not enough data yet" state overstates precision the data
  doesn't support. Match this to the existing product's own provisional-`?` marker on the main rating
  (`rating-systems.md` §4), not a new, separate convention.
- **Accuracy-derived categories (opening/endgame/overall move accuracy)**: a single full game already
  contains many moves, so a per-game accuracy number is statistically more stable than a single puzzle
  attempt — but a **trend claim** ("your endgame is improving") needs multiple games with non-overlapping
  confidence intervals before and after, not just two single numbers. Using the same K=40/25-games
  example already cited in `skill-model.md` §7 as an order-of-magnitude anchor: detecting a genuine,
  sustained shift is realistically a dozens-of-games question, not a handful-of-games one, at
  Elo-typical learning rates.

## 6. What is technically required

- All data feeds are already scoped elsewhere and cross-referenced, not newly introduced here: move
  classification (`game-review.md`), the Lichess Win%/Accuracy% formula (`accuracy.md`), per-skill Elo
  (`skill-model.md`), and the minimum-sample gate (`personalization.md`). This file is the aggregation
  and honesty layer over those, not a new data source.
- A published, versioned **phase-detection rule** (the opening/middlegame/endgame boundary) — this
  single rule directly determines what counts toward the Opening and Endgame numbers and must not
  silently change without a version bump.
- **A real, run partial-correlation (or equivalent regression) analysis** on Scoresheet's own
  accumulated attempt data, specifically testing whether "Resourcefulness" and "Advantage
  Capitalization" survive as distinguishable from overall accuracy — a data-science task with a
  concrete pass/fail gate on the ship decision, not a design formality.
- A visible confidence/sample-size UI element attached to every shown category — an actual interface
  requirement, not just a backend gate.

## 7. What could break

- **Shipping all six-ish categories unchecked on day one reproduces Aimchess's own worst-verified
  failure mode**: presenting engine-agreement-filtered subsets of the same underlying signal as though
  each were an independently diagnosed skill, with zero visible confidence indication — the exact
  pattern four independently fetched sources could not find any disclosed defense against.
- **If the partial-correlation check in §5 finds high overlap and the categories ship anyway**, that is
  precisely the "eight numbers that are really one number in a trenchcoat" failure the task brief
  explicitly warns against — the check existing on paper is not sufficient; its result must actually
  gate the shipping decision.
- **Time-management scoring silently degrading to a fabricated mid-value for clockless games** is a
  specific, checkable failure mode this file explicitly rules out (§5, CAN list #5) — it must surface
  as "no data," never a guessed number.
- **Users tend to over-trust a quantified score regardless of caveats** — a general product-design risk,
  not evidenced as chess-specific in this research pass (**NOT VERIFIED** for this domain specifically),
  but consistent with the general finding that numeric outputs read as more authoritative than their
  underlying confidence warrants. The concrete mitigation is the visible confidence signal already
  specified above, not a disclaimer buried in a help page.
- **The ACT's four-factor structure is itself a single 2005 study of adult tournament players**, not a
  large, repeatedly replicated finding across populations resembling Scoresheet's own likely user base
  (which may skew toward lower-rated, newer players) — treat the factor-structure evidence as a strong
  reason for skepticism about naming eight independent skills, not as a precise, product-specific
  blueprint for exactly which categories are "real."

## 8. What we can uniquely do because of Nimiq

- **Extend `skill-model.md` §8's signed, recomputable-by-a-stranger design to the whole profile
  screen**, not just the headline per-skill ratings — every displayed category becomes an auditable
  derived artifact of signed attempt data, something none of Aimchess, Chess.com, or Lichess offer
  (all compute their equivalents server-side, against a private database, with no independently
  replayable input log).
- **Micropayment-funded independent human audit** (extending `personalization.md` §8's pattern): pay a
  small NIM bounty to titled players to spot-check whether a computed "Resourcefulness" number (if it
  ever survives the §5 falsification check and ships at all) matches a human reviewer's read of the
  same games — an actual empirical validation step, economically unworkable on any card-rail
  alternative at this transaction size, and one no product reviewed in this file appears to run at any
  price point.

## 9. Licence and reuse verdict

- **Aimchess**: a proprietary commercial product. Its own site and three independent reviews were read
  directly in this pass; no code or internal methodology was disclosed or found anywhere. The six
  category *names* are unprotectable product-positioning ideas, fair to reference and adapt; no site
  text, imagery, or the unlinked "31% faster / UBC" claim should be copied or repeated as if verified —
  it is Aimchess's own uncorroborated marketing statement.
- **The Amsterdam Chess Test / van der Maas & Wagenmakers (2005)**: an academic, peer-reviewed
  psychometric instrument, read here only via a secondary blog synthesis
  ([lichess.org](https://lichess.org/@/NDpatzer/blog/science-of-chess-a-g-factor-for-chess-a-psychometric-scale-for-playing-ability/tTXWy9oV),
  fetched directly), not the original journal article. The factor-structure *finding* is freely citable
  as fact; the ACT's actual test items are a copyrighted psychometric instrument, not reviewed here and
  out of scope, since this product is not proposing to administer the ACT itself.
- **The Burgoyne et al. meta-analysis**: an academic publication, cited from search-result synthesis of
  its abstract, not independently read in full — the correlation finding is freely citable, no material
  reused verbatim, and the primary PDF should be read directly before quoting any further specific
  number from it beyond the r≈0.22 headline figure already corroborated across multiple secondary
  sources in the original search pass.
- **Verdict: nothing in this file is sourced from code of any kind. All citable material is either an
  academic finding safe to cite for its underlying claim (never for wording) or Aimchess's own public
  marketing copy, safe to describe and critique, never to copy verbatim or to repeat as verified fact.**
