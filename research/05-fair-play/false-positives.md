# The false-positive problem — what the literature actually quantifies

This file is synthesis across sources, not a study of one system, so the nine headings are read the
same way `design.md` reads them: what the problem *is* (§1), why it happens mechanically (§2), where
the field's own treatment of it falls short (§3), what to copy (§4), what we can do better (§5), what
building an honest answer requires (§6), what could break that answer (§7), what Nimiq specifically
enables (§8), and a licence accounting of every source used (§9).

Primary source for this file:
[Barnes, D.J. & Hernandez-Castro, J.C., "On the limits of engine analysis for cheating detection in
chess," *Computers & Security* 48 (2015), pp. 58–73](https://www.sciencedirect.com/science/article/pii/S0167404814001485),
DOI [10.1016/j.cose.2014.10.002](https://doi.org/10.1016/j.cose.2014.10.002). The article is
paywalled — ScienceDirect returned HTTP 403 on direct fetch, and the Kent Academic Repository's
green-OA copy (`kar.kent.ac.uk/44719`) redirects to an institutional SSO login. What follows is built
from the publisher's own abstract and metadata, read via the Kent Academic Repository's public record
page ([kar.kent.ac.uk/44719](https://kar.kent.ac.uk/44719/)), corroborated independently against
[Oxera's own summary of the same study](https://www.oxera.com/insights/agenda/articles/computer-move-chess-cheaters-and-the-limits-of-algorithmic-detection/)
(read directly, not taken from `design.md`'s prior citation of it), and against Crossref's licence
metadata for the DOI (queried directly, 2026-09-08: only an Elsevier text-and-data-mining licence is
registered — no open-access version-of-record licence exists for this article, confirming it is a
standard-copyright, non-open publication). **No full text of this paper was read** — every claim below
attributed to it is from its abstract, its publisher-indexed summary, or a secondary source's
description of its findings, each flagged as such. Supplementary quantified evidence comes from
`chessfraud.md` (this same research batch — real numbers pulled directly from that benchmark's own
notebooks) and from this project's own prior `design.md` and `chess-com.md`, cited by file where used.

## 1. What they do

The literature's core, load-bearing claim, in the paper's own publisher-indexed words: applying
engine-correlation analysis to move data carries **"a serious risk of finding numerous 'false
positives,'"** and it is **"unsafe to use just the moves of a single game as prima facie evidence of
cheating."** [kar.kent.ac.uk/44719](https://kar.kent.ac.uk/44719/) The paper's method, per its own
abstract: deeply examine a large collection of games where cheating is known *not* to have occurred,
specifically looking for which of those legitimate games would be misclassified as suspicious by
engine-agreement-style detection — inverting the usual approach of hunting for cheaters and instead
hunting for **false alarms in a clean population**.

Two distinct, separately quantified findings sit inside this:

- **A demonstrated false-positive rate on historical data with zero possibility of cheating.** Per
  Oxera's own account of the same study, read directly: the authors examined **120,000 games
  predating 2005** — an era before engine-assisted cheating was practically feasible — and Regan's
  established detection system, at its own standard **4.5 z-score threshold**, still flagged **"at
  least 92 of the players"** as suspicious.
  [oxera.com/insights/agenda/articles/computer-move-chess-cheaters-and-the-limits-of-algorithmic-detection](https://www.oxera.com/insights/agenda/articles/computer-move-chess-cheaters-and-the-limits-of-algorithmic-detection/)
  Since none of those 92+ players could have actually used a chess engine undetected in that era, every
  one of those flags is, by construction, a false positive. This is the single most concrete quantified
  false-positive fact this research batch has found anywhere in the literature: a named, published
  threshold (4.5 z-score) and a named, published count of wrongly-flagged players (≥92) on a
  known-clean population.
- **A reproducibility failure that compounds the statistical one.** The same paper "demonstrates that
  it is impossible to compute definitive values of the figures currently employed to measure similarity
  to a chess-engine for a particular game, as values inevitably vary at different [engine search] depths
  and, even under identical conditions, when multi-threading evaluation is used."
  [kar.kent.ac.uk/44719](https://kar.kent.ac.uk/44719/) In plain terms: re-running the *same*
  engine-agreement metric on the *same* game, with only the analysis engine's own internal
  parallelism/depth settings changed, can produce a different verdict. A detector whose output isn't
  even stable against its own re-computation cannot be the sole basis for taking someone's money.

## 2. Why it works — the mechanism, not just the observation

Two separate mechanisms compound each other, and the field's own literature (this paper plus the
directly-adjacent evidence gathered below) supports both:

- **Move-quality statistics are not bimodal.** A strong human's best-day accuracy and a weaker player's
  engine-assisted accuracy occupy overlapping regions of the same statistic by construction — a single
  number (raw accuracy percentage, raw engine-match rate, a single z-score) cannot separate "a strong
  player having a good day" from "a weaker player with selective engine help," because both can and do
  produce the same aggregate value. This is exactly why `design.md` §2 already treats an ensemble, not
  a single signal, as non-negotiable — Barnes & Hernandez-Castro's own 92-flagged-clean-players finding
  is the concrete demonstration of that claim, not merely a theoretical worry.
- **The base-rate problem, worked through with real numbers.** Even a detector with a genuinely high
  specificity produces mostly false alarms once actual cheating is rare — the textbook consequence of
  Bayes' theorem, and it is worth actually running the arithmetic once with numbers this research has
  independently sourced, clearly marked as an **illustrative calculation, not a claim any cited source
  computed**: take the best real-ground-truth detector this batch has found anywhere in the literature
  — ChessFraud's FFN Allie+Features model, **specificity 0.62, recall 0.59** on real tournament data
  (`chessfraud.md` §3, pulled directly from that benchmark's own reproduction notebook). If a live
  platform's *actual* cheating prevalence were, say, 2% of games (a plausible-shaped, not
  sourced-as-fact, illustrative figure — real platforms do not publish this number, see §3), then out
  of 10,000 games: ~200 are actually assisted, of which this detector catches ~118 (59% recall); ~9,800
  are clean, of which this detector wrongly flags ~3,724 (38% of 9,800, at 62% specificity). **The flag
  pile would be roughly 97% false positives, 3% true positives**, even using the best real-ground-truth
  detector currently published in the literature, entirely because true cheating is rare relative to
  the population being screened. This is not a flaw specific to ChessFraud's model — it is what any
  detector with imperfect specificity does to a low-prevalence population, and it is the single most
  important quantitative fact for this product to internalize before ever gating money on a raw
  detector score.

## 3. What they do badly

- **The field conflates three different numbers that measure three different things**, and almost
  nothing in the public literature or the platforms' own disclosures keeps them straight:
  1. **The detector's true false-positive rate** (of all clean players, what fraction get flagged) —
     Barnes & Hernandez-Castro's 92-of-120,000-games figure is the rare case where this is actually
     computable, because the ground truth (no cheating possible pre-2005) is known with certainty.
  2. **The appeal-grant rate** — Chess.com publishes ~0.2%–0.3% of appeals granted
     (`chess-com.md` §1, §3, already sourced there directly from `chess.com/cheating`), which measures
     only how often a *contested* decision was reversed, and says nothing about wrongly-flagged players
     who never appealed (cost, fear, giving up, not knowing how) — `chess-com.md` §3 already makes
     exactly this point, and it is worth restating here as the field's single most common
     false-positive-adjacent number that is not actually a false-positive rate.
  3. **A benchmark's specificity on a constructed, non-representative population** — ChessFraud's own
     0.579–0.738 specificity range (`chessfraud.md` §3) is real and directly measured, but against an
     artificially high 40.3% cheat-prevalence tournament cohort, not a live platform's actual
     population — useful for comparing detectors to each other, not directly usable as "this is what
     will happen to real users" without correcting for base rate (§2).
- **No public source anywhere in this research batch discloses a genuine, population-representative
  false-positive rate for a live, real-money-adjacent chess platform.** Neither Lichess nor Chess.com
  publishes one (`lichess.md` §3, `chess-com.md` §3); the one academic source that does compute a real
  number (Barnes & Hernandez-Castro) does it on a curated historical dataset chosen specifically because
  it has known-clean ground truth, not on a live population with unknown true prevalence.
  **NOT VERIFIED**: any specific numeric false-positive rate for a currently operating chess platform's
  live detection system, because none has been published anywhere this research found.
- **Reproducibility itself is not solved anywhere in this research batch.** Barnes & Hernandez-Castro's
  finding that the same metric varies with engine depth/threading settings has, as far as this research
  found, no published fix in any of the four sources read for this batch or in `lichess.md`/`chess-com.md`.
  A detector whose own output changes between two runs of the identical analysis is a standing risk to
  any product that promises signed, recomputable verdicts (`design.md` §6, §8) — a third party trying
  to *verify* our recomputation would need not just our raw feature values but the exact engine
  configuration (depth, thread count, hash size) used to produce them, or they could get a different
  answer through no fault of either party.

## 4. What we should copy conceptually

- **Test the detector against a population known to be clean, not just against known cheaters.**
  Barnes & Hernandez-Castro's method — hunt for false alarms in a clean population, rather than only
  for hits in a cheating population — is the single most transferable idea in this file. Any validation
  of our own ensemble (`design.md` §6) should include a dedicated clean-population false-positive check
  using our own strongest, longest-tenured, most-improved players as the adversarial test case, exactly
  the population most likely to look statistically anomalous while being entirely honest.
- **Publish the threshold alongside the false-positive count it produces**, the way Regan's own 4.5
  z-score standard is publicly known and independently testable against — this is what let
  Barnes & Hernandez-Castro produce a falsifiable, citable critique in the first place. An
  undisclosed threshold cannot be checked by anyone outside the team that set it.
- **Separate the three conflated numbers explicitly, every time any error rate is published** —
  detector false-positive rate, appeal-grant rate, and benchmark specificity are different statistics
  and this product's own public copy should never let a reader infer one from another the way
  Chess.com's public messaging currently allows (`chess-com.md` §3, §5).
- **Report a distribution-shift number, not only a same-distribution number**, per `chessfraud.md` §4 —
  the base-rate mismatch in §2 above is exactly why a specificity number measured on an artificially
  high-prevalence benchmark cannot be read directly as "this is our real-world false-positive rate."

## 5. What we can do better

- **Publish an actual, methodology-disclosed false-positive/false-negative estimate, from held-out
  calibration testing, corrected for our own platform's real (even if roughly estimated) prevalence** —
  not an appeal-grant percentage standing in for it. `design.md` §5 already commits to this in
  principle; this file supplies the concrete external evidence (§2's base-rate arithmetic, §3's
  three-numbers conflation) for exactly why the correction step matters and cannot be skipped.
- **Never let a single game, and never let a single signal, be sufficient grounds for the High-risk
  band.** Barnes & Hernandez-Castro's own conclusion — unsafe to use a single game's moves as prima
  facie evidence — is a direct empirical argument for `design.md` §1's ensemble-of-signal-families
  design and for generalizing detection across a run of games rather than one, which `design.md` §1
  already lists as a supporting signal (opponent-adjusted overperformance across a run).
- **Disclose the reproducibility caveat explicitly, as policy, rather than silently hoping it doesn't
  matter.** Because our transparency promise means a third party should be able to recompute a verdict
  from the signed feature values (`design.md` §7), we should fix and publish the exact engine
  configuration (depth, threads, hash size, engine version) used for every stored evaluation — closing
  the specific reproducibility gap Barnes & Hernandez-Castro identified as unsolved in the wider field,
  rather than inheriting it silently.
- **State our own honest uncertainty about real prevalence, rather than implying false precision.** No
  source in this research batch — not Lichess, not Chess.com, not ChessFraud, not Barnes &
  Hernandez-Castro — has a trustworthy number for "what fraction of real games on a real platform
  actually involve cheating." Any confidence-band threshold we publish should be explicit that it is
  calibrated against synthetic and small real-tournament data (`chessfraud.md` §6), not against a known
  true prevalence on our own platform, until real volume accumulates.

## 6. What is technically required

- **A held-out clean-population test set drawn from our own strongest/most-improving players**, refreshed
  periodically, specifically to measure our own detector's false-positive rate the way Barnes &
  Hernandez-Castro measured Regan's system against pre-2005 games — our version of "a population known
  not to have cheated," since we will not have a historical pre-engine era to rely on the way chess as
  a whole did.
- **A fixed, versioned, disclosed engine-analysis configuration** (depth, thread count, hash table size,
  exact engine build) stored alongside every per-move evaluation in the signed record, so that
  "recomputable" (`design.md` §6, §7) actually holds against the specific reproducibility failure this
  paper identified, not just against a different day's re-run of an unspecified configuration.
- **A published, versioned calibration report** distinguishing at minimum: detector specificity/recall
  on synthetic data, detector specificity/recall on any real resolved-dispute data as it accumulates
  (`chessfraud.md` §5, §8), and an explicit, separately-labelled estimate of real-world false-positive
  *count* once a prevalence estimate exists — never one blended number standing in for all three.
- **An explicit run-level, not just game-level, aggregation layer** in the detection pipeline, since a
  single game is stated by the one paper in this batch that actually studies false positives to be
  insufficient grounds for a decision on its own.

## 7. What could break

- **The base-rate math in §2 is illustrative, and the real prevalence number it depends on is
  unknown.** If our platform's real cheating prevalence turns out to be materially higher than the 2%
  used for illustration (plausible in an early, small, high-incentive population before reputation and
  deterrence effects build up), the false-positive-to-true-positive ratio improves; if it is lower
  (equally plausible), the ratio gets worse than the illustration shows. Neither direction is knowable
  until we have our own real data — this is a reason for conservative bands early on, not a reason to
  claim a specific number now.
- **A published, disclosed threshold is also a target.** The same transparency that lets
  Barnes & Hernandez-Castro critique Regan's public 4.5 z-score standard would let a sophisticated
  cheater aim just under our own disclosed thresholds — the exact tension `design.md` §7 already names
  and only partially resolves (publish architecture and raw features, not exact operational thresholds
  or trained weights).
- **We have no pre-cheating-era clean baseline the way chess as a whole did pre-2005.** Every player on
  this product from day one exists in an era where engine assistance is trivially available, so there
  is no equivalent "known impossible to cheat" population to test false positives against — our
  strongest available substitute is our most established, longest-tenured players, which is a weaker
  guarantee of true cleanliness than pre-2005 chess had.
- **The reproducibility fix (§6) only protects against re-computation, not model drift.** Fixing the
  engine configuration solves "does the same input produce the same output twice"; it does not solve
  "does the scoring function itself change over time as it's retrained" (`design.md` §7 point 3) — those
  are two different stability guarantees and only the first is addressed by the technical requirement
  above.

## 8. What we can uniquely do because of Nimiq

- **Escrow the specific disputed payout instead of taking an irreversible account-level action**, so
  that the cost of a false positive — proven real and non-trivial by Barnes & Hernandez-Castro's
  92-players-of-120,000-games finding — is bounded to one game's money, held for a disclosed window,
  rather than a ban or forfeiture that cannot be cleanly undone even after a correction
  (`design.md` §8, already the product's answer to exactly this problem).
- **Publish our own calibration report as a signed artifact**, so the false-positive/false-negative
  numbers we claim are independently checkable against the same signed feature values the verdict
  itself was computed from — directly closing the "no platform publishes a real false-positive rate"
  gap identified in §3, in a way Lichess and Chess.com structurally cannot match without a comparable
  payments-and-signatures layer.
- **Auto-release on a bounded timeout** turns "we are not fully confident, and we know that" into a
  concrete, money-scoped, time-bounded default in the player's favor — the practical answer to the base
  rate math in §2, which shows that any published detector, including the best one currently in the
  literature, will be wrong most of the time it flags someone in a low-prevalence population. A product
  that cannot achieve near-perfect specificity (none currently can, per every source in this file)
  needs exactly this kind of structural humility built into the money layer, not just into the
  detector's threshold.

## 9. Licence and reuse verdict

| Source | Status | What may be reused |
|---|---|---|
| Barnes & Hernandez-Castro, *Computers & Security* 48 (2015) | Standard Elsevier copyright — Crossref shows only a text-and-data-mining licence registered for this DOI, no open-access version; confirmed 2026-09-08, not inferred | Facts and the abstract may be described and cited with attribution; no full text was read or reproduced; **NOT VERIFIED** beyond the publisher's own abstract/summary and Kent Academic Repository's public metadata record |
| `kar.kent.ac.uk/44719` (Kent Academic Repository record page) | Institutional repository metadata page; the deposited PDF itself sits behind SSO and was not read | Public bibliographic/abstract metadata only |
| `oxera.com/insights/...` | Oxera's own published commentary, © Oxera | Read directly and cited; facts paraphrased with attribution, not reproduced at length |
| `chessfraud.md` (this research batch) | Our own file, built from directly-verified primary sources | Numbers reused here are traced back to that file's own citations, not re-derived independently |
| `design.md`, `chess-com.md` (this project) | Our own prior work | Cited and built on directly as local project sources, consistent with those files' own licence notes |

No paper or page cited in this file publishes code or a trained model this product could copy; nothing
here is a reuse of protected expression — every reused element is either a published, uncopyrightable
statistical finding or this project's own prior original analysis.
