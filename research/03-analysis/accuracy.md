# Accuracy scoring — Chess.com CAPS2, Lichess, ACPL, and the academic alternative

Scope: how three different systems turn engine evaluations into a single accuracy-like number, plus
the known criticisms of each and one academically rigorous alternative (Regan's Intrinsic Performance
Rating) worth knowing about even though it targets cheat-detection rather than UX.

## 1. What they do

**Chess.com — CAPS2.** Chess.com's official definition: "Accuracy is a measurement of how closely
you played to what the computer has determined to be the best possible play against your opponent's
specific moves." Source: https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined

CAPS2 (introduced 2021) supersedes the original 2017 CAPS ("Computer Aggregated Precision Score," per
Chess.com's own article title — a third-party summary separately renders it "Computer Accuracy
Precision Score," so the exact expansion of the acronym is inconsistently stated even in sourced
material). The original CAPS methodology, per Chess.com's own article: score each move as a **top
move** ("matched the engine's top choice or were equal in score to that choice"), an **inaccuracy**
("a move that changes the position's evaluation slightly in the negative direction"), or a
**blunder** ("a move that changes the position's evaluation greatly in the negative direction"),
combined with a "strength patterns" factor "measuring score sequencing throughout gameplay," on a
0–100% scale where 0 = "a game played with one of the worst moves on every turn" and 100 = "only the
top choice of the world's strongest chess computers was played on every move."
Source: https://www.chess.com/article/view/better-than-ratings-chess-com-s-new-caps-system

CAPS2, per a third-party technical breakdown corroborated by Chess.com's own support article's
framing: grades moves into best/excellent/inaccuracy/mistake/blunder, averages per-move grades into a
0–100 score, applies "mate-distance scoring and adjustment for multiple blunders" to smooth extreme
swings, varies engine depth by player rating, and treats book moves as automatically "best." No public
formula is given for exactly how these are combined.
Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about,
https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined

**Lichess — the public Win%/Accuracy% formula.** Lichess publishes the actual equations.
Win percentage from centipawns:

> Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)

fit from a dataset of games among players rated near 2300.

Per-move Accuracy% from the Win% swing a move caused:

> Accuracy% = 103.1668 * exp(-0.04354 * (winPercentBefore - winPercentAfter)) - 3.1669

Game/player-level accuracy is **not** a plain average of per-move Accuracy%: Lichess divides the game
into sliding windows, computes volatility as the standard deviation of Win% within each window,
computes a volatility-weighted mean of the per-move accuracies, separately computes their harmonic
mean, and averages those two results together for the final score.
Source: https://lichess.org/page/accuracy

**ACPL (Average Centipawn Loss).** The older, simpler, engine-agnostic-in-principle metric: sum the
centipawn loss (best-move eval minus played-move eval) over all moves and divide by move count.
Example given in third-party material: 40 moves totaling 2,800 centipawns of loss → ACPL 70; strong
grandmaster games run roughly ACPL 10–20.
Source: https://www.chess.com/blog/raync910/average-centipawn-loss-chess-acpl

**Regan's Intrinsic Performance Rating (IPR)** — not a UX-facing accuracy score but the academic/
FIDE-adopted method for the same underlying problem (how well did this player actually play). For
each position, a model with two fitted parameters — sensitivity `s` and consistency `c` — converts the
engine's full evaluation profile of all legal moves into a predicted probability distribution over
which move a player of a given strength would choose; the parameters are calibrated from millions of
games, then a player's occurring move choices are used to estimate their IPR, which is compared
against their official Elo to flag anomalies (used by FIDE for cheating investigations).
Source: https://cse.buffalo.edu/~regan/papers/pdf/Reg12IPRs.pdf,
https://cse.buffalo.edu/~regan/Talks/CogSciOct2024np.pdf

## 2. Why it works

- **Chess.com's CAPS2** is explicitly optimized for user psychology, not just measurement: its
  redesign goal was to "replicate the feeling of being graded on a test in school" with most scores
  landing 50–95, avoiding both discouragingly low scores and suspiciously-perfect near-100s the
  original CAPS produced. This is why it "works" commercially — it keeps players engaged rather than
  demoralized. Source: https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined,
  https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **Lichess's Win% transform** works because it converts a linear, unintuitive unit (centipawns) into
  a bounded, intuitive one (0–100% win chance) via a sigmoid, which correctly compresses large evals
  (where an extra 100cp barely changes winning chances) and expands small evals near equality (where
  the same 100cp swing is decisive) — this single design choice is what makes Lichess's Accuracy% feel
  more "fair" near equal positions than raw ACPL does. Source: https://lichess.org/page/accuracy
- **The volatility-weighted + harmonic-mean blend** for game-level accuracy specifically dampens the
  distortion a single wild single-move swing would otherwise cause in a simple average, addressing
  ACPL's best-known weakness (see below) without hiding it behind an opaque black box — the formula
  is public even if the design rationale for exactly this blend isn't spelled out further on the page.
  Source: https://lichess.org/page/accuracy
- **ACPL works as a first-order metric** because it's trivial to compute, engine-agnostic in concept,
  and intuitively "lower is better" — it's the natural entry point before any win-probability
  weighting is added.
- **Regan's IPR works** because it's the only one of these methods that is (a) rating-aware by
  construction (fits parameters *for that class of player strength*) and (b) validated against a
  real-world ground truth (FIDE-official Elo, used in actual disciplinary cases), giving it academic
  and institutional credibility none of the consumer platforms' scores carry.
  Source: https://cse.buffalo.edu/~regan/papers/pdf/Reg12IPRs.pdf

## 3. What they do badly

- **Chess.com's formula is not public.** Neither the exact combination rule for CAPS2's per-move
  grades into the final 0–100, nor the exact per-rating depth table, is published — third-party
  analysis states this plainly ("the exact mechanics remain proprietary") and links the opacity
  directly to public confusion about whether Accuracy Score can detect cheating (it cannot, by
  Chess.com's own design: CAPS2 "does not measure the difficulty of the moves when scoring").
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **Chess.com scores are not comparable across ratings or platforms.** Different engine depths per
  rating band make even two Chess.com players' Accuracy Scores not directly comparable to each other,
  and the same source states outright that Chess.com vs. Lichess accuracy numbers are "meaningless"
  to compare because the methodologies (and depths) differ.
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **Lichess's Win% sigmoid is fit to one rating band (~2300).** It is not stated to be rating-adjusted
  the way Chess.com's Expected Points Model claims to be — the same centipawn swing produces the same
  Win%/Accuracy% number for a 900-rated player and a 2300-rated player, even though real winning
  chances at a given eval differ by strength. Lichess's own page acknowledges centipawns generally
  "lack context-sensitivity" and that different platforms' formulas are incompatible, but does not
  claim its own formula is rating-adjusted. Source: https://lichess.org/page/accuracy
- **ACPL conflates unrelated failure modes.** A game with one 400cp blunder and 39 near-perfect moves
  can produce the same ACPL as a game with a steady 15cp drift on every move — same number, completely
  different play quality. It also ignores game-phase context (a given centipawn loss matters far more
  near equality than in an already-won position) and is length-sensitive (the same single blunder
  moves the average far more in an 18-move game than a 60-move game). It is also engine- and
  depth-dependent, so an ACPL of 25 on Chess.com and 25 on Lichess are not the same measurement.
  Source: https://www.chess.com/blog/raync910/average-centipawn-loss-chess-acpl,
  https://chessitup.com/blog/centipawn-loss-explained (cited via search synthesis; treat qualitatively
  — direct fetch not performed, so specific numeric claims from this source are **NOT VERIFIED**
  beyond what is corroborated elsewhere).
- **Regan's IPR is heavy machinery for a UX product** — it requires per-position full-legal-move
  engine evaluation, large calibration datasets, and produces a rating estimate rather than a
  friendly 0–100 "how well did I play today" number; it solves a different problem (cheat/skill
  estimation) than a post-game report is trying to solve.

## 4. What we should copy conceptually

- **Lichess's public formula, in full**, as the base transform (centipawns → win probability) —
  it is the only one of the consumer methods that is actually published end-to-end and independently
  reproducible, which is the exact property Scoresheet needs.
- **The volatility/harmonic-mean blend** for turning a stream of per-move scores into one game-level
  number, as a documented, non-destructive way to avoid ACPL's single-blunder distortion without
  hiding the method.
- **Regan's core idea — condition the model on player strength** — even without adopting IPR's full
  cheat-detection machinery, a rating-aware transform (rather than Lichess's single fixed sigmoid) is
  the correct fix for the "same eval swing means different things at different ratings" problem both
  Chess.com (claims to solve, doesn't disclose how) and Lichess (doesn't claim to solve) leave open.

## 5. What we can do better

- **Publish the exact formula, parameters, engine, and depth**, versioned — closing the single
  biggest documented gap in Chess.com's method and going beyond Lichess by making the *game-level*
  blend (not just the per-move Win%/Accuracy% equations) fully specified with worked examples.
- **Make the transform rating-aware**, fit (or at minimum piecewise-adjusted) across rating bands
  rather than Lichess's single ~2300-fit sigmoid, so a beginner's and a master's accuracy numbers mean
  the same thing relative to their own strength — borrowing Regan's core insight without his full
  cheat-detection apparatus.
- **Never re-center the score for user-comfort reasons.** Explicitly reject Chess.com's documented
  practice of re-tuning the algorithm so "most scores land 50–95" — if a published, versioned formula
  is fixed, low scores must be allowed to be low. Framing/coaching copy, not the number itself, is
  the place to soften a bad score.
- **Keep the score signed and tied to a specific formula version**, so a future formula change is a
  new, disclosed version rather than a silent recalibration that quietly changes what an old score
  means (unlike Chess.com's CAPS → CAPS2 transition, where nothing anchors an old game's Accuracy
  Score to the algorithm version that produced it).

## 6. What is technically required

- A fixed, versioned engine configuration (version, depth or node budget, hash size, single-threaded
  or deterministic multi-threaded settings) — see `02-engine/` for the actual engine decision; this
  file only states the requirement.
- An implementation of Lichess's published Win% sigmoid as the base centipawn→win% transform, with
  the two published constants (`-0.00368208`, and the Accuracy% constants `103.1668` / `-0.04354` /
  `-3.1669`) reimplemented independently from the published equations (not copied from AGPL-licensed
  lila source — see §9).
- A rating-conditioning extension to that base transform, with its own fitting methodology and
  calibration data disclosed (this is new work; no public source hands this to Scoresheet already
  built — **NOT VERIFIED** that any public, permissively-licensed rating-aware win% model exists;
  none surfaced in this research pass).
- A game-level aggregation function (volatility-weighted + harmonic-mean blend, or an explicitly
  chosen and documented alternative) with worked examples in the published spec.
- Versioning/signing infrastructure so every computed accuracy score is stamped with the exact formula
  version and engine config that produced it, consistent with the "independently recomputable" claim.

## 7. What could break

- Reimplementing Lichess's formula independently must be done from the published equations on
  https://lichess.org/page/accuracy, not by reading lila's Scala source, to stay clear of AGPL
  obligations while still being accurate — a math formula is not copyrightable, but literal code is.
- A rating-aware extension without real calibration data risks being worse than Lichess's single-band
  fit, not better — this needs its own dataset and validation, not just an assumption that "rating-
  aware must be more accurate."
- Determinism: any accuracy score computed from engine output inherits the same determinism risk
  flagged in `game-review.md` — non-pinned engine settings silently break independent recomputability.
- Publishing the exact formula makes it possible for a user to reverse-engineer exactly how much
  "budget" they have before a move crosses from Excellent to Inaccuracy, potentially encouraging
  borderline play tuned to the score rather than genuinely best play — the same transparency-vs-
  gaming tradeoff noted in `game-review.md` §7.

## 8. What we can uniquely do because of Nimiq

- Sign each computed accuracy score together with the formula version and engine config that produced
  it, so any third party can pull the signed game record and independently reproduce the exact same
  number — something neither Chess.com (undisclosed formula) nor Lichess (formula published, but nothing
  signs a given historical score to a specific formula version, since Lichess doesn't cryptographically
  bind scores to versions) currently offers.
- Because there's no server-owned account, a rating-aware accuracy model can be calibrated and
  improved openly over time with each version publicly disclosed and old signed scores still
  verifiable against the formula version they were computed under, rather than silently drifting the
  way Chess.com's CAPS → CAPS2 transition did.

## 9. Licence and reuse verdict

- **Chess.com** (CAPS/CAPS2): closed, undocumented formula; only the qualitative concept (per-move
  grading → aggregate score, book-move handling, rating-tiered depth) is usable — there is no
  formula or code to reuse, only prose descriptions of a proprietary product.
- **Lichess**: the Win%/Accuracy% *equations* published at https://lichess.org/page/accuracy are
  mathematical formulas with disclosed constants — freely reimplementable as a matter of applying a
  published equation. The `lila` codebase that presumably implements this formula in production is
  AGPL-3.0 (confirmed: https://github.com/lichess-org/lila/blob/master/LICENSE) — per `chess/SPEC.md`
  Part L, any actual code (not just the formula) taken from lila requires AGPL clean-room treatment
  (reader ≠ writer, spec written down, attestation recorded), not direct porting. Implementing the
  published formula independently, from the page's own text, avoids this entirely and is the
  recommended path.
- **ACPL**: a generic, uncopyrightable statistical concept (mean of per-move centipawn loss); no
  licence question applies.
- **Regan's IPR**: published in academic papers (e.g. https://cse.buffalo.edu/~regan/papers/pdf/Reg12IPRs.pdf)
  for research/citation purposes; the method and any reference implementation's licence were **NOT
  VERIFIED** in this pass — treat as reference methodology to cite and adapt conceptually (rating-
  aware calibration), not as a source to port code from without checking its licence first.
