# Chess.com Game Review — turning raw engine output into a human report

Scope: the mechanism by which Chess.com converts engine evaluations into the move-classification
taxonomy, the evaluation graph, coach text, key moments, and the retry interaction. Primary sources
are two official support articles — the general Game Review overview and the dedicated move-
classification article — which give partially different but reconcilable detail; both are cited
per-claim below.

## 1. What they do

**The taxonomy.** Chess.com's dedicated classification article
(https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc)
states the core grading uses an **Expected Points Model**: a function of player rating and engine
evaluation that outputs a player's winning chances on a 0.00 ("0% winning") to 1.00 ("100% winning")
scale. Each move is scored by how many expected points it costs relative to the best move, with
published bands:

| Classification | Expected points lost |
|---|---|
| Best | 0.00 |
| Excellent | 0.00 – 0.02 |
| Good | 0.02 – 0.05 |
| Inaccuracy | 0.05 – 0.10 |
| Mistake | 0.10 – 0.20 |
| Blunder | 0.20 – 1.00 |

Three classifications sit **outside** this numeric model as special-cased overlays:
- **Brilliant** — "A Brilliant move is when you find a good piece sacrifice," conditioned on the
  position not being bad afterward and the player not already being completely winning without the
  move; the bar is more generous for lower-rated players.
- **Great** — a move "critical to the outcome of the game," e.g. converting a losing position to
  equal, or equal to winning; standards vary by rating.
- **Miss** — failing to capitalize on the opponent's mistake, i.e. missing a chance to reach a
  winning position that was available.
Source: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc

The general overview article gives shorter, tooltip-style wording for the same set plus **Book**
("a conventional opening move"), for a taxonomy Chess.com describes as nine types in total:
Brilliant, Great, Best ("the chess engine's top choice"), Excellent ("almost as good as the Best
move"), Good ("a decent move, but not the best"), Book, Inaccuracy ("a weak move"), Mistake ("a bad
move that immediately worsens your position"), Miss ("a move that missed a tactical opportunity or a
chance to punish the opponent"), Blunder ("a very bad move that also loses material or the game").
Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work

**Miss's history is documented directly by Chess.com**: an official @chesscom post states the
classification was added so that "a 'blunder' must lose material or allow a forced checkmate,"
whereas previously "a good move that missed an opportunity would be considered a blunder or a
mistake." Source: https://x.com/chesscom/status/1623068338623508480

**Book moves are auto-classified as best.** Per a third-party breakdown of CAPS2 corroborating the
official material: book/opening-database moves are automatically treated as "best" regardless of
engine evaluation. Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about

**Brilliant, mechanically:** community/technical write-ups (not official Chess.com documentation)
converge on: the move must be the best or near-best move available; it must involve a non-obvious
material sacrifice; a shallow-depth engine scan must initially undervalue it, with the advantage only
revealing itself at deeper calculation; and it must not be part of an obviously forced sequence.
Source: https://www.chessigma.com/blog/brilliant-move-chess (third-party, not Chess.com). A Chess.com
staff member declined to give technical criteria when directly asked on Chess.com's own forum.
Source: https://www.chess.com/forum/view/general/how-are-brilliant-moves-decided

**The evaluation graph, coach, key moments, retry.** The overview article describes: a **Game Graph**
plotting positional advantage move-by-move; a selectable **coach** persona giving "a brief, one-line
summary of how the game unfolded" with optional audio narration; **Key Moments**, critical junctures
in the game ("the first key move usually the last book move"); a **Retry** button letting the user
replay a flagged position and attempt to find a better move, with feedback on the attempt; and an
**Opening Explorer** panel reachable by scrolling within the coach feedback, showing the opening
name, how often the user has played it, results history, and suggested courses.
Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work

## 2. Why it works

- **Two complementary models cover both "how good was this move" (Expected Points bands) and "was
  this move meaningful" (Great/Miss/Brilliant overlays).** A move can be numerically "Good" by
  expected-points-lost yet still get flagged as a "Miss" if it let a winning tactic slip — the overlay
  layer catches significance the raw band misses, and vice versa a numerically costly move played in
  a hopeless position doesn't get overly punished. Source (mechanism): https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
- **Rating-relative thresholds** (Brilliant and Great both explicitly "vary by rating") mean the same
  raw engine delta is graded differently for a 900 and a 2200, which keeps the taxonomy motivating
  across the whole player base rather than only rewarding titled players.
  Source: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
- **The retry loop is the pedagogical core.** Turning a flagged mistake into an immediate second
  attempt, in place, is a well-established deliberate-practice mechanic — feedback plus a retry beats
  feedback alone. Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work
- **Key Moments prunes attention.** Instead of forcing the user through every move, the system
  pre-selects the handful worth reviewing, anchored on a sensible default (the last book move as the
  first key moment). Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work

## 3. What they do badly

- **The Expected Points Model's own inputs are undocumented.** Chess.com states it's "based on
  player rating and engine evaluation" but publishes no formula translating a centipawn score plus a
  rating into the 0.00–1.00 winning-chance number the bands are defined against — so the bands
  above, while numeric, are not independently computable from a raw engine trace.
  Source: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
- **Brilliant has no official numeric threshold**, only qualitative rules pieced together by third
  parties; Chess.com staff have publicly declined to give technical criteria on their own forum.
  Source: https://www.chess.com/forum/view/general/how-are-brilliant-moves-decided
- **"Great" is similarly unquantified** ("critical to the outcome," "standards vary by rating") with
  no published boundary between a merely-Excellent move and a Great one.
  Source: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
- **The taxonomy changed at least once in a way that reclassified history** — the Miss/Blunder
  redefinition in the official @chesscom post means older analyzed games and newer ones are not
  labeled by the same rule, and Chess.com does not appear to retroactively re-run old Game Reviews
  under the new rule (**NOT VERIFIED** whether historical reviews are re-computed — not stated in any
  source read). Source: https://x.com/chesscom/status/1623068338623508480
- **Coach commentary is a one-line summary**, not a structured, position-specific explanation of why
  a move was strong or weak beyond the label itself — the depth of instructional content in Game
  Review is shallow compared to a dedicated Lesson.
  Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work

## 4. What we should copy conceptually

- The two-layer model: a numeric, banded "how costly was this move" classification, plus a
  significance overlay ("was this a turning point / a missed win / a spectacular save") that the raw
  numeric band alone cannot express.
- Rating-relative grading bands so the same objective quality bar doesn't feel punishing to a
  beginner or trivial to a master.
- Key Moments as a default attention filter rather than forcing a move-by-move slog.
- The retry-in-place mechanic attached directly to a flagged mistake.

## 5. What we can do better

- **Publish the win-probability model itself** (the function converting engine eval → winning
  chance, ideally rating-aware) rather than only publishing banded outputs — this is exactly the gap
  in Chess.com's own documentation (band thresholds are public, the function that feeds them is not).
  A natural base is Lichess's public sigmoid (see `03-analysis/accuracy.md`), extended to be
  rating-aware rather than fit to a single 2300 band, with the extension's parameters and provenance
  published, not asserted as objective truth.
- **Give Brilliant and Great numeric, published, versioned criteria** instead of qualitative rules —
  since Scoresheet's differentiator is independent recomputability, an unpublished "vibes" threshold
  for the platform's most exciting label is a direct contradiction of the product's core promise.
- **Version every classification-rule change and keep old games classified under the rule that was
  live when they were played** (or explicitly re-stamp them with the new rule and say so) — avoid
  Chess.com's silent Miss/Blunder boundary shift.
- **Make the coach explanation structured, not just a one-liner** — e.g., name the tactical motif
  missed, not only that a move was a "Miss."

## 6. What is technically required

- A rating-aware win-probability function (eval, player-rating) → win% — the harder and more
  valuable half of the "Expected Points Model," which Chess.com never discloses.
- Published, versioned classification band boundaries and Brilliant/Great/Miss overlay rules,
  computable from: engine multipv output, material-delta tracking (for the sacrifice test), and a
  shallow-vs-deep eval comparison (for Brilliant's "engine misjudges it at low depth" test).
- A key-moment selector (e.g., top-N moves by |win% swing|, defaulting the first key moment to the
  last book move as Chess.com does).
- A template or model-driven narrative layer for coach text, ideally naming the tactical motif
  (fork/pin/skewer/mate pattern) rather than only the classification label.
- A retry mode reusing the same position and engine call already made during review.

## 7. What could break

- A rating-aware win-probability model needs calibration data across the rating spectrum; get this
  wrong (e.g., fit only to strong players, as Lichess's public formula is — see `accuracy.md`) and
  low-rated players' classifications become miscalibrated, exactly the failure Chess.com's
  rating-band tuning exists to avoid.
- Determinism: Brilliant's "shallow depth misjudges it, deep depth reveals it" test requires running
  the engine at two fixed depths — if depth or hash settings aren't pinned and versioned, the same
  game re-analyzed later can flip a move's Brilliant status, breaking recomputability.
  **NOT VERIFIED** against a chosen engine config — flag for `02-engine/` research.
- Publishing exact Brilliant/Great thresholds makes them easier to farm (deliberately play a
  qualifying sacrifice line for the badge) — a tradeoff transparency accepts deliberately.

## 8. What we can uniquely do because of Nimiq

- Ship the win-probability function, the classification bands, and the Brilliant/Great/Miss overlay
  rules as a versioned, public spec attached to the signed game record, so any third party can
  recompute the exact same Game-Review-equivalent output Chess.com keeps proprietary.
- Because ratings and game records are signed and independently recomputable rather than living in a
  private database, "was this game re-classified under an old or new rule" becomes an auditable fact
  (rule-version stamped into the signed record) instead of an unanswerable question, unlike
  Chess.com's undocumented Miss/Blunder redefinition.

## 9. Licence and reuse verdict

All Chess.com material cited here is proprietary help-center and social content with no reuse
licence; only the conceptual structure (banded classification + significance overlay + key moments +
retry) is usable, never any wording, code, or exact threshold. Where an open, fully-specified
alternative is needed for anything resembling the "Expected Points Model," the permissive, portable
reference is Lichess's published win-percentage/accuracy formula (see `03-analysis/accuracy.md`) —
the formula itself is a published equation, freely reusable as a mathematical fact, while any literal
code from `lichess-org/lila` (AGPL-3.0, confirmed at
https://github.com/lichess-org/lila/blob/master/LICENSE) would require AGPL clean-room treatment per
`chess/SPEC.md` Part L if ported rather than reimplemented from the published formula.
