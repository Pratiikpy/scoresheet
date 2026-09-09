# Review quality — measuring whether Game Review is GOOD, not just whether it runs

Research date: 2026-09-08. Scope: `packages/core/src/analysis.ts` classifies every move as
`best`/`good`/`inaccuracy`/`mistake`/`blunder` from centipawn/win-probability swing, and
`packages/core/test/analysis.test.ts` already asserts a lot of *internal* consistency — "the
thresholds come out where a century of chess writing puts them," "and they are ordered, so a blunder
is never called an inaccuracy," "a hung queen is called a blunder," "theory is never called a
mistake." None of that is checked against an outside, human standard. This file is about that gap:
does the classification agree with what an actual strong human player would call the move — and
does anyone else have a way to check.

## 1. What they do

**Chess.com CAPS2** and **Lichess's accuracy%** both derive move quality from engine centipawn/
win-probability swing, with no independent human-labeled ground truth behind the *thresholds*
themselves — this project's own `research/03-analysis/accuracy.md` already documents both formulas
in detail; not re-derived here.

**Lichess's puzzle "ground truth"** is likewise engine-derived, not human-annotated: Lichess
re-analyzes hundreds of millions of games with Stockfish NNUE (on the order of "100+ years of CPU
time") and tags a position as a puzzle candidate when the engine finds one move clearly forced.
Source: https://huggingface.co/datasets/Lichess/chess-puzzles,
https://github.com/ornicar/lichess-puzzler, https://database.lichess.org/. This matters directly:
Lichess's own labels cannot serve as an *independent* check on an engine-threshold classifier,
because they were produced by the same class of method (an engine-eval threshold), not by a human
judge.

**Kenneth Regan's Intrinsic Performance Rating (IPR)** fits a player's skill from the statistical
distribution of how closely their moves match engine evaluations, calibrated across tens of millions
of games — a cheat-detection tool, not a move-quality-classification benchmark, and it likewise has
no published corpus of independent human blunder/mistake labels behind it. Source:
Regan & Haworth, "Intrinsic Chess Ratings" (AAAI 2011), summarized at
https://en.wikipedia.org/wiki/Kenneth_W._Regan; https://www.chess.com/blog/SamCopeland/an-interview-with-im-and-anti-cheating-expert-dr-ken-regan.

**The LEAP corpus** (arXiv 2310.20260, "Learning to Play Chess from Textbooks") is a genuinely
human-sourced dataset: 1,164 sentences of human commentary drawn from 91 games in a chess textbook,
labeled for relevance and sentiment toward the move being commented on — not a blunder/mistake/
inaccuracy category scale. The best transformer model in the paper reached 68% weighted micro-F1
against the human labels. Source: https://arxiv.org/abs/2310.20260. The paper's abstract does not
state an inter-annotator-agreement figure or annotator count for the underlying commentary — flag as
**NOT VERIFIED** beyond the abstract; the full PDF body was not read.

**PGN Numeric Annotation Glyphs (NAGs)** are a real, standardized part of the PGN format: a `$`
followed by an integer 0–255, with the first 140 values defined, where `$2` means "?" (a mistake) and
`$4` means "??" (a blunder). This is the closest thing in the entire chess ecosystem to a
machine-parseable, structured, expert-authored ground-truth label — it is simply not packaged
anywhere as a research dataset. Source: PGN spec,
https://github.com/mliebelt/pgn-spec-commented/blob/main/pgn-specification.md, and
https://en.wikipedia.org/wiki/Numeric_Annotation_Glyphs.

## 2. Why it works

Engine-threshold classification (what this project and both major competitors do) works as a cheap,
internally-consistent proxy because raw centipawn loss correlates strongly with human intuition on
the egregious end — hanging a queen registers as a large swing under any reasonable engine and any
reasonable human, and this project's own test suite already checks exactly that agreement point
("a hung queen is called a blunder," `analysis.test.ts`). It needs no ground-truth corpus to get the
obvious cases right.

NAG-annotated games work as a *proxy* gold standard specifically because a titled annotator's "?" or
"??" judgment is exactly the class of expert signal a review engine wants to match, and — unlike free
prose commentary — it is already structured and trivially parseable: a NAG glyph is a machine-
readable category label a human expert assigned, sitting right next to the move in standard PGN.

## 3. What they do badly

No published inter-annotator-agreement study for "was this move a blunder" was found anywhere in
this research — meaning **nobody has published the ceiling any automated system should be judged
against.** Two titled players could plausibly disagree on borderline mistake-vs-inaccuracy calls at
a real rate, and without that number, "our classifier agrees with humans 85% of the time" has no
context: 85% could be at, above, or below what two human experts would achieve against each other.
This appears to be a genuine, unfilled gap in the public literature, not something this research
missed by not looking hard enough — **state it honestly as apparently nonexistent** rather than
implying it exists somewhere unfound.

Lichess's own puzzle corpus, the largest labeled chess-position dataset in existence, is disqualified
as an independent check for exactly the reason it looks tempting: it was produced by the same
family of method (engine-eval swing) that this project's own classifier uses, so agreement with it
would only demonstrate "our threshold resembles Lichess's threshold," not "our threshold matches
human judgment."

The LEAP corpus, the one genuinely human-sourced dataset found, is small (91 games, 1,164
sentences), labels sentiment/relevance rather than a blunder scale, and its best reported model only
reaches 68% agreement with the human labels it does have — not a usable off-the-shelf gold set for
this project's purposes, only a data point that even a purpose-built model struggles to match human
commentary closely.

## 4. What we should copy conceptually

- **NAG as the storage format**, if this project ever builds a gold set — encoding expert judgments
  the standard way (`$1` good, `$2`/`?` mistake, `$4`/`??` blunder, etc.) keeps any gold corpus
  portable and consistent with the PGN tooling this project already has in
  `packages/core/src/pgn.ts` and its round-trip tests (`pgn.test.ts`).
- **This project's own existing practice** of validating classification thresholds against
  documented chess convention rather than an invented number — `analysis.test.ts`'s "the thresholds
  come out where a century of chess writing puts them" is exactly the right instinct; the gap is
  extending that same instinct from "matches chess-writing convention" to "matches an actual human
  judge's calls on real games," which convention alone cannot guarantee.

## 5. What we can do better

Since no public gold corpus of independent human blunder labels exists, **build one deliberately**
rather than skipping the check:

- Source NAG-annotated (or `?`/`??`-in-comment-annotated — many published PGNs use plain-text
  annotation rather than numeric glyphs, which is also mechanically parseable) master games from
  sources with a clear, checked, permissive or public-domain licence — see §9. Treat the annotator's
  symbol as ground truth on a few hundred positions.
- Run this project's own classifier over the same positions and **publish the agreement rate and
  confusion matrix**, with a confidence interval given the necessarily small sample — owning and
  publishing an honest number, including its uncertainty, rather than an unqualified "it's accurate"
  claim, which is exactly what this user's own standing standard for evidence-backed claims requires.
- **Deliberately include amateur-rated games in the gold set, not only master games.** This project's
  own `accuracy.md` research already records that Lichess's public win-percentage formula is fit
  "from a dataset of games among players rated near 2300," and Chess.com varies engine depth by
  player rating for a related reason — a gold set built only from annotated master games would
  validate the classifier exactly where it is least likely to matter for this product's actual
  audience, which `SPEC.md`'s own framing (everyday utility, not a grandmaster training tool) skews
  well below master strength. **Check point, not yet verified**: whether `analysis.ts` varies its
  own thresholds by player rating at all, or applies one fixed scale regardless of the player's
  level — worth confirming before deciding how the gold set should be stratified.
- If a second annotated source can be found for even a handful of the same positions, compute
  inter-annotator agreement between the two human sources as a local sanity floor — since no
  published figure exists to borrow, this project would have to establish its own, however small.

## 6. What is technically required

- A small corpus of NAG- or plain-text-annotated PGNs from a licence-checked source (see §9).
- A script that loads such PGNs, extracts each annotator-flagged move alongside this project's own
  computed judgement (`best`/`good`/`inaccuracy`/`mistake`/`blunder` from `analysis.ts`), and reports
  agreement, a confusion matrix, and Cohen's kappa (a proper agreement statistic, not raw percent
  agreement, since raw agreement overstates concordance when one category — "good"/"best" — dominates
  the data, as it does in any real game).
- No new test-runner tooling: this fits directly into the existing `node --test` harness alongside
  `packages/core/test/analysis.test.ts`, as a fixture-driven test reading the gold corpus from a data
  file.

## 7. What could break

- **Small samples give noisy percentages.** A gold set of a few hundred positions needs its
  agreement number reported with a confidence interval, not as a bare figure — precisely the standard
  this project's own global rules already hold every claim to.
- **Conflating an engine-strength bug with a review-quality bug.** If this project's own search
  (`packages/core/src/search.ts`, self-described as "not Stockfish... about 2000 [Elo]," an unverified
  figure per `engine-strength.md`) miscomputes the "best move" baseline for a position, a resulting
  disagreement with the human annotator would look like a review-quality failure when it is actually
  an engine-strength failure. Any flagged disagreement needs a human look to tell the two apart before
  either number is trusted.
- **Staleness.** If `analysis.ts`'s thresholds ever change, the agreement number goes stale and must
  be re-run and re-published — the same discipline `scripts/counts.mjs` already enforces for the
  unit-test count, applied to a number that is far easier to forget about because nothing currently
  checks it automatically.
- **Licence risk in sourcing the corpus itself** — see §9; a gold set built from copyrighted
  annotation prose without checking its licence would itself be a liability this project's own
  `LICENCES.md` explicitly warns against for exactly this class of mistake (the `nimiq-css` incident
  it cites).

## 8. What we can uniquely do because of Nimiq

Nothing about a human-agreement gold set is Nimiq-specific in mechanism, but this project already has
a public, permanently-recomputable surface for exactly this kind of claim: because every signed game
is a public record and the rating recompute page already exists (`SPEC.md` Part F5), the same "verify
it yourself" surface could carry the gold-set agreement number, the corpus itself, and the scoring
code — turning "trust our Game Review" into "here is the corpus, here is the code, recompute the
agreement rate yourself," the same way the rating already works. No competitor in this space —
Chess.com's CAPS2, Lichess's accuracy% — publishes either the provenance of its thresholds or a
measured agreement rate against independent human judgment; this would be a genuine first, and it
fits directly into infrastructure this project is already building for an unrelated reason (the
rating).

## 9. Licence and reuse verdict

- **The Lichess puzzle database**: CC0, per this repository's own existing research
  (`BRIEF.md` cites "the CC0 puzzle database"). Freely reusable, but — per §3 above — **not** a
  usable human-annotated gold set for this specific purpose, since its labels are engine-derived, not
  human-judged. Fine to reuse for its actual intended purpose (puzzle content), wrong tool for
  measuring review-quality agreement with human judgment.
- **The LEAP corpus (arXiv 2310.20260)**: released alongside an academic paper; its specific data
  licence was **NOT VERIFIED** in this research pass — check the paper's own data-availability
  statement or accompanying repository before using any of its literal text or labels.
- **PGN NAG symbols themselves**: defined by the PGN format specification — a syntax convention, not
  copyrightable subject matter. Free to use, exactly like using `1. e4 e5` notation itself.
- **Raw chess moves in any master game (with or without annotation)**: facts, not copyrightable, per
  the same reasoning this repo's own `LICENCES.md` §3 already applies. **The annotator's prose
  commentary is a different matter** — GM-written explanatory text in a tournament bulletin or a
  published game collection is typically copyrighted expression, even though the moves and the bare
  NAG glyph numbers are not. Any gold set built from a specific published, annotated source must be
  licence-checked per source before bulk use — this project should either find a source with an
  explicit permissive/public-domain statement, or build the corpus fresh by having a titled player
  annotate public-domain-status classical games (moves alone, freshly re-annotated) rather than
  reusing someone else's copyrighted commentary text.
