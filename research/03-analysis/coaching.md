# Turning engine output into human explanation — chess coaching, pedagogy, and the "why"

Scope: how existing products and research turn a raw engine trace into something a human learns
from — Chess.com Lessons, Lichess Interactive Studies ("gamebook" mode), open-source PGN annotators,
academic work on concept-based and natural-language chess explanation, and what real chess coaches
say actually changes a player's behaviour. `03-analysis/game-review.md` already covers Chess.com's
move-classification taxonomy and retry loop in depth — this file does not repeat that ground except
where the *pedagogy*, not the taxonomy, is the subject. `03-analysis/explanation-engine.md` takes the
technical design further into a concrete "Why?" feature spec; this file is the survey it rests on.

## 1. What they do

**Chess.com Lessons.** A four-tier Learn Path (New to Chess / Beginner / Intermediate / Advanced,
colour-coded) made of courses, each ending in a graduation-cap-marked lesson, each lesson a tile in
one of three states — locked, available, completed — that can be "revisited... anytime." Users move
through lessons via a "Next Lesson" button or jump directly through a Lesson Library; skipping ahead
inside a course triggers a confirmation prompt. A "Coach" character delivers "guidance and
explanations" alongside "interactive challenges to help you practice and reinforce what you've
learned." The support article does not document the actual interaction mechanics (multiple choice vs.
drag-move vs. hint ladder) or any spaced-repetition/adaptive-difficulty logic.
Source: https://support.chess.com/en/articles/8609703-how-do-lessons-work-on-chess-com

**Lichess Interactive Studies ("gamebook" mode).** A study chapter set to "Interactive lesson" plays
back one fixed main line. The correct move advances the lesson; any other move is "automatically
considered bad," triggering a prewritten reply and its attached comment. Comments on the *opponent's*
move display without pausing; comments on *your* move pause until you press Space. Hints are
graduated: a vague nudge first, full next-move reveal only on request — the author explicitly
recommends principle-based hints over concrete-square hints because "move to e4" gives away the
answer outright. The hard limit: "the main line is the only line the Interactive lesson will follow" —
alternate replies require separate chapters (max 32 per study), and only one "correct" move can be
specified per position, which does not fit most non-forcing middlegame decisions.
Source: https://siderite.dev/blog/learning-chess-using-lichess-interactive-studies/ (independent
write-up; no official Lichess documentation of gamebook mechanics was found — see §9).

**Open-source PGN annotators.** `python-chess-annotator` (Stockfish-driven, GPL-3.0) assigns NAG
symbols from a fixed centipawn-delta ladder — blunder < −300cp, mistake < −150cp, dubious < −75cp —
and only emits detailed annotation when the delta exceeds a 7.5-point win-probability threshold; mate
scores are folded into the same comparison via a large constant offset (`MAX_SCORE − dtm`). Its output
is PGN-embedded numbers and NAG glyphs, not prose — no "why," no tactic name, no "only move" or
"brilliant" detection at all.
Source: https://github.com/rpdelaney-archive/python-chess-annotator/blob/master/annotator/__main__.py
(license: GPL-3.0, quoted in repo). `chess-artist` (GPL-3.0) does the equivalent with static-eval or
search-score annotation, NAG glyphs (`$6` interesting, `$1` brilliant), candidate-move listing, and
blunder/mistake tallies per side — again numbers and symbols, no natural language.
Source: https://github.com/fsmosca/chess-artist. **SCID vs. PC** goes one step further with automated
"blunder checking" across a whole database — third-party comparison states SCID can auto-annotate
"all blunders made by one or both sides" where ChessBase requires manual triggering per game, but
also that ChessBase's *natural-language* annotation is considered more advanced.
Source: https://www.chess.com/forum/view/chess-equipment/chess-database-software---scid---chessbase-compared
(forum opinion, **NOT VERIFIED** against ChessBase's own documentation — not fetched). **Nibbler**
(an Lc0 GUI) shows Leela's WDL/N/P/Q/S/U/V statistics and a win-rate graph but has no generated-text
commentary feature at all.
Source: https://github.com/rooklift/nibbler/blob/master/README.md

**Academic natural-language commentary generation.** Jhamtani et al. (ACL 2018) built the field's
reference dataset — 298K+ move-commentary pairs across 11K games scraped from the GameKnot forum —
and defined six commentary categories: direct move description, quality of move, comparative,
move-rationale/planning, contextual game information, and general information.
Source: https://aclanthology.org/P18-1154/; category taxonomy corroborated via
https://arxiv.org/html/2410.20811v1. Their own dataset is not freely redistributable — a GitHub issue
on the reference implementation states users "must ask permission from Jhamtani et al." for the
processed `.tsv`/`.en` files.
Source: https://github.com/harsh19/ChessCommentaryGeneration/issues/11. Zang et al. (ACL 2019,
"Automated Chess Commentator Powered by Neural Chess Engine," code name SCC) trained on a larger,
self-built engine + corpus with a simpler architecture; no license file is present in the reference
repo. Source: https://github.com/zhyack/SCC. **ChessCoach** (GPLv3+) adds a neural commentary head to
an AlphaZero-style engine and is candid about the result: "It is not very insightful and often wrong
but shows some promise for the limited data it has been able to train on."
Source: https://github.com/chrisbutner/ChessCoach

The 2024 line of work moves from free generation toward *grounded* generation. "Bridging the Gap
between Expert and Language Models: Concept-guided Chess Commentary Generation and Evaluation"
trains linear SVMs on 200K Lichess positions scored by Stockfish 8 across 21 named concepts (king
safety, passed pawns, threats, etc.), turns the SVM normal vectors into concept-score probes against
a LeelaChessZero layer, compares pre-move vs. post-move concept scores to find which concepts a move
actually changed, and only then feeds those prioritised concepts to GPT-4o via few-shot/CoT
prompting. Five chess experts (avg. rating 1776) rated the resulting commentary at 0.60 correctness
vs. 0.36 for ungrounded GPT-4o, with "wrong understanding of positional/long-term advantage" as the
largest residual error category, at 28%.
Source: https://arxiv.org/html/2410.20811v1. "Caïssa AI" (KI 2025) goes further: a fine-tuned
chess LLM, a Prolog rule engine encoding tactics, a Neo4j knowledge graph of the live board, and a
LangGraph verification module that decomposes each generated statement, extracts it to structured
data, and validates it against the symbolic layer before it reaches the user — reporting a 93.13%
hit rate on the Lichess tactics dataset.
Source: https://www.researchgate.net/publication/395158512 (paper); reference implementation license
GPL-2.0: https://github.com/MazenS0liman/Caissa-AI. A parallel 2026 line, "Communicating Chess
Strategies in Natural Language," verbalizes whole engine strategy *trees* (not single-move deltas)
for both humans and LLMs, and reports that direct JSON access still beats natural language for an
LLM reader, that self-reflection helps strong models and can hurt weak ones, and — the load-bearing
finding for any "why" feature — that human evaluators still find factual errors in LLM-generated
descriptions even with the strategy tree supplied as ground truth.
Source: https://arxiv.org/html/2607.11486

**Concept-level interpretability of the engine itself.** McGrath et al., "Acquisition of Chess
Knowledge in AlphaZero" (PNAS 2022), train linear/logistic probes against AlphaZero's internal
activations for 116 custom concepts plus components of Stockfish 8's evaluation function (material,
mobility, king safety, space, threats, imbalance, and finer subcomponents), tracking *what* concept a
layer encodes, *where*, and *when in training* it emerges. Former World Champion Vladimir Kramnik
supplied a qualitative reading of opening play across three developmental phases — crude material
counting at 16k–32k training steps, king-safety understanding in imbalanced positions by 32k–64k
steps, and "much deeper understanding" of sacrificial soundness by 64k–128k steps — and noted
AlphaZero's opening repertoire does not recapitulate human chess history the way a human's would.
Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC9704706/; https://arxiv.org/abs/2111.09259. The
authors are explicit that probes show correlation, not causation, that the concept set is incomplete
(regression accuracy plateaus, meaning parts of later layers "remain unexplained"), and that
different training runs converge on different opening lines — the model's "knowledge" is not a
single stable ground truth to read off.

**Human-move modelling.** Maia (Microsoft Research / University of Toronto, KDD 2020) trains one
model per 100-point rating band (1100–1900) to *predict what a human at that level actually plays*,
not the best move — and is measurably worse at predicting moves outside its target band, evidence
that it has captured skill-level-specific "playing style" rather than just noisy weak play. Maia-2
(NeurIPS 2024) unifies this into one model spanning the whole rating range, beating original Maia's
per-band accuracy by close to 2 points.
Source: https://www.cs.toronto.edu/~ashton/pubs/maia-kdd2020.pdf;
https://arxiv.org/html/2409.20553v2; https://www.maiachess.com/

**Spaced repetition for chess.** Chessable's MoveTrainer interleaves prose/diagram explanation with
quizzes at fine grain — read a comment on one move, replay that move, read the next comment, replay
the next move, then replay the whole sequence — scheduled by an SM-2-derived spaced-repetition
algorithm with Chessable's own ease-factor tweaks.
Source: https://www.chessable.com/movetrainer/;
https://www.chessable.com/blog/welcome-series-1-spaced-repetition/ (SM-2 attribution via community
discussion, **NOT VERIFIED** against Chessable's own engineering documentation, which is not public).

**What real coaches say.** A chess coach and Substack writer (Nate Solon) is direct about why
"you blundered" fails: "By definition, a blunder is a move that the player could easily recognize as
a mistake under normal circumstances" — the player already has the knowledge; naming the mistake
doesn't add anything, because a blunder is "not an action—it's a non-action," closer to failing to
resist an urge than to lacking a fact. He recommends a during-game checklist ("what does this move do,
and no longer do — am I missing anything?") and, more importantly, off-board defensive-pattern
training, because habits under pressure don't change from feedback text.
Source: https://www.zwischenzug.gg/p/how-do-you-stop-blundering. A second independent coach thread
converges on the same diagnosis: "The blunder isn't the disease—it's the symptom. The disease is a
missing step in your thought process." Quality feedback "explain[s] the reasoning behind the
evaluation: what threat you missed, which tactical or positional idea was important, what move would
have solved the problem, and what you should have been thinking about in that type of position."
Source: search synthesis across https://lichess.org/@/CheckRaiseMate/blog/how-do-you-stop-blundering/UOFOoIir
and related coaching posts (see search results; individual attributions **NOT VERIFIED** beyond
what each linked page states).

## 2. Why it works

- **Active retrieval beats passive review.** Gamebook mode and MoveTrainer both force the learner to
  *play* the move before revealing anything, not read it and nod — this is the same mechanism as
  testing effect / retrieval practice, and it's why "guess the move" studies proliferate on Lichess
  organically (dozens of community studies exist purely in this format).
  Source: https://siderite.dev/blog/learning-chess-using-lichess-interactive-studies/
- **Graduated hints preserve the retrieval attempt.** Vague-nudge-before-answer keeps the learner
  solving rather than being told; giving the exact move ("go to e4") short-circuits the entire
  exercise. Source: same as above.
- **Spaced repetition is the only mechanism that survives contact with forgetting.** MoveTrainer's
  SM-2-style scheduling reintroduces exactly the material the learner is about to forget, not a fixed
  curriculum order — this is the entire premise of Chessable's product.
  Source: https://www.chessable.com/blog/welcome-series-1-spaced-repetition/
- **Symbolic grounding before language generation is the only pattern in the literature that gets
  correctness above chance.** Concept-guided commentary (0.60 vs. 0.36 correctness) and Caïssa AI
  (93.13% tactic hit rate with a Prolog/knowledge-graph verification layer) both outperform free LLM
  generation specifically because the *facts* are computed by a deterministic system first and the
  language model is constrained to describe them, not invent them.
  Source: https://arxiv.org/html/2410.20811v1; https://www.researchgate.net/publication/395158512
- **Human-move modelling calibrates difficulty honestly.** Maia doesn't try to be strong; it tries to
  be *accurately human at a given strength*, which is exactly the missing ingredient for "would a
  player at this rating have seen this" — a claim engines otherwise cannot make.
  Source: https://www.cs.toronto.edu/~ashton/pubs/maia-kdd2020.pdf
- **Naming the thought-process failure, not the move, is what coaches say actually changes
  behaviour.** "The blunder isn't the disease" reframes feedback from a label on a move to a gap in a
  process, which is actionable in a way "you blundered" is not.
  Source: https://www.zwischenzug.gg/p/how-do-you-stop-blundering

## 3. What they do badly

- **Chess.com's own documentation doesn't describe the interaction mechanics of its flagship teaching
  product.** No public detail on how a "challenge" actually works, whether it adapts, or whether it
  repeats missed material — the pedagogical engine is opaque even though the marketing is not.
  Source: https://support.chess.com/en/articles/8609703-how-do-lessons-work-on-chess-com
- **Lichess gamebook mode caps at one correct line per position and 32 chapters per study** — it
  cannot represent "several reasonable moves, one clearly best," which is most real middlegame
  decisions, and it cannot generate content from an arbitrary player's own games; every gamebook is
  hand-authored. Source: https://siderite.dev/blog/learning-chess-using-lichess-interactive-studies/
- **The open-source annotators produce numbers, not reasons.** `python-chess-annotator`'s own author
  notes the tool "lacks explicit 'only move' or 'brilliant move' detection," and neither it nor
  `chess-artist` attempts a tactic name (fork/pin/skewer) or a sentence — a player still has to infer
  *why* −300cp happened. Source: https://github.com/rpdelaney-archive/python-chess-annotator/blob/master/annotator/__main__.py
- **Free-generation commentary is unreliable even at its best.** ChessCoach's own README calls its
  output "often wrong." The best *grounded* system in the literature (concept-guided, GPT-4o +
  concept probes) still reaches only 0.60/1.0 correctness by expert rating and explicitly leaves a
  28% "wrong understanding of positional/long-term advantage" error bucket unsolved — grounding
  narrows the gap, it does not close it.
  Source: https://arxiv.org/html/2410.20811v1
- **The Jhamtani dataset — the field's foundational resource — cannot be freely reused**; the
  processed files require author permission per the maintainers' own GitHub issue thread.
  Source: https://github.com/harsh19/ChessCommentaryGeneration/issues/11
- **AlphaZero's own internal "knowledge" is not a single ground truth to explain from.** McGrath et
  al. show different training runs converge on different opening lines and that most of the model's
  concept set remains unprobed/unexplained — an engine's evaluation, ours included, is one learned
  opinion, not an objective fact, and any explanation system that presents it as the latter is
  overclaiming. Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC9704706/
- **Nobody surveyed runs this offline, free, and deterministic.** Every commentary-generation system
  reviewed depends on a hosted LLM (GPT-4o, a fine-tuned LLM served from a GPU) or a heavy graph/logic
  stack (Neo4j + Prolog); none is designed to run inside a browser Web Worker at zero marginal cost.

## 4. What we should copy conceptually

- **Guess-first, reveal-second, hint-graduated interaction** (gamebook mode) as the shape of any
  in-app teaching moment, not a wall of text.
- **Detect the fact symbolically, then describe it — never generate the fact itself with a language
  model.** This is the one idea that separates the systems that are trustworthy (Caïssa AI's
  verification layer, concept-guided's pre/post concept-score comparison) from the ones that are
  merely fluent (ungrounded GPT-4o, ChessCoach's "often wrong" neural head).
- **Compare the position immediately before and after the move**, not just describe the after-state
  in isolation — this is exactly how concept-guided commentary isolates "what changed" and it's the
  cheapest reliable signal available.
- **Spaced-repetition scheduling of the learner's own missed material**, MoveTrainer's mechanism,
  applied to a player's own detected mistakes rather than a fixed authored course.
- **Jhamtani's six-category taxonomy as a checklist**, not a dataset to use: move description, move
  quality, comparison to the alternative, rationale/planning, context, and general information are a
  reasonable inventory of "the kinds of things a sentence about a move could say" — useful for scoping
  a template library even though the underlying corpus can't be reused (§9).
- **Rating-relative calibration**, Maia's actual contribution, applied not to move prediction but to
  explanation depth and vocabulary — a fork explained to a 900 should name the pattern; to a 2000, a
  terser reference may suffice.

## 5. What we can do better

- **Free and instant for every move of every game.** Every research system surveyed pays a per-call
  cost (a hosted LLM, a GPU-served fine-tune) or requires heavy server infrastructure (Neo4j +
  Prolog). We already run our own MIT engine offline in a browser Web Worker with per-move evaluation,
  accuracy, ACPL, and the engine's preferred move already computed (`packages/core/src/analysis.ts`,
  per `chess/SPEC.md` Part K2) — a "Why?" feature costs nothing marginal to run and needs no network
  call, which none of the systems above can claim.
- **Independently recomputable, not a black box.** Because the game record is signed, a versioned
  detector ruleset lets any third party re-derive the exact same explanation from the same public
  position — no system surveyed offers this; Chess.com's coach text and every academic system are
  either proprietary or dependent on a specific model checkpoint's non-deterministic output.
- **Grounded in the player's own real game, not a canned dataset.** Jhamtani's corpus, Lichess
  gamebooks, and Chessable courses are all pre-authored content; a "Why?" feature that runs on the
  position the player actually just reached, using the engine already computing their accuracy, has
  no equivalent in the surveyed product or research space at consumer scale.
- **Zero-tolerance for false claims by construction, not by model quality.** Rather than trying to get
  an LLM's hallucination rate down from 28–40% error, don't route the factual claim through a language
  model at all — see `explanation-engine.md` for the concrete design that follows from this.

## 6. What is technically required

- The per-move evaluation delta and accuracy/ACPL pipeline **already built** (`packages/core/src/analysis.ts`,
  `apps/web/src/study-screen.ts`) as the base signal, in the same shape `python-chess-annotator` uses
  (best-move eval minus played-move eval, mate scores folded via a large-constant comparison).
- A symbolic feature-detector layer (fork/pin/skewer/discovered attack/back-rank/hanging piece/passed
  pawn) built on our own board representation, mirroring the primitives `python-chess` exposes
  (`is_pinned`, `pin`, `attackers`) rather than any free-text generation — full detection algorithm
  and reliability tiers are specified in `explanation-engine.md`.
- A small template-sentence library keyed to detector output, not a language model — Jhamtani's six
  categories as the scoping checklist for what templates need to cover.
- A hint-ladder UI state machine for any in-app lesson/gamebook-style content (vague hint → concrete
  hint → answer), and an SM-2-class spaced-repetition scheduler if a "review your own misses" mode is
  built, per Chessable's MoveTrainer pattern.
- A rating-aware depth/vocabulary switch for generated sentences, informed conceptually by Maia's
  rating-banded modelling (we do not need to reproduce Maia itself — a simpler heuristic keyed to the
  player's own puzzle rating, already tracked per `chess/SPEC.md`, is enough).

## 7. What could break

- **A grounded template system is only as trustworthy as its predicate coverage.** If a detector
  fires on a pattern it doesn't actually verify (e.g., a "fork" where the forked piece is defensible
  by an in-between move), the system has made the exact false claim the whole design exists to avoid
  — worse than the free-generation systems it's meant to improve on, because it will read as
  authoritative. Full mitigation is specified in `explanation-engine.md` §7.
- **The engine's own evaluation is one model's opinion, not ground truth** — McGrath et al.'s finding
  that different AlphaZero training runs converge on different lines applies equally to any single
  engine's positional judgment; presenting our engine's assessment as objective risks the same
  overclaim the concept-guided paper's "wrong understanding of positional/long-term advantage" error
  bucket names. Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC9704706/;
  https://arxiv.org/html/2410.20811v1
- **Gamebook-style single-line content doesn't scale to arbitrary player games** — any in-app lesson
  content authored by hand inherits Lichess's own 32-chapters/one-correct-move ceiling; a
  detector-driven "Why?" on a player's own games avoids this but only for the feature classes it can
  actually detect (§6, and `explanation-engine.md`'s reliability tiers).
- **Cold start for a spaced-repetition "review your misses" mode** — MoveTrainer works because
  Chessable ships pre-authored courses; a personal-mistake variant needs enough of the player's own
  game history before it has anything to schedule.
- **Rating-relative explanation depth needs real calibration data**, the same trap `game-review.md`
  flags for a rating-aware win-probability model — get it wrong and either beginners are talked past
  or strong players are patronised.

## 8. What we can uniquely do because of Nimiq

- The MIT engine already runs offline in the browser wallet at zero marginal cost (`chess/SPEC.md`
  Part K1/K2) — every system surveyed here pays a per-call cost or needs server infrastructure; we
  don't, so a "Why?" feature and a spaced-repetition "review your misses" mode can run on every move
  of every game, for free, forever, rather than being rationed.
- Because the game record is signed and the ruleset can be versioned in the open spec, an explanation
  sentence is independently recomputable by a stranger's browser — the same "recompute button"
  principle `chess/SPEC.md` Part 0 makes the product's core pitch — turning "trust our coach" into
  "verify our coach," which no product surveyed offers.
- A wallet-native "practice your own misses" loop (signed puzzle attempts generated from a player's
  own detected mistakes, not a canned course) is reachable only because game history, identity, and
  small payments already exist in the same app — no research system or existing product ties personal
  mistake-review to a real wallet.

## 9. Licence and reuse verdict

| Source | Licence | What is reusable |
|---|---|---|
| `python-chess` (niklasf) | GPL-3.0+ (LICENSE.txt, setup.py) | Functional spec of `is_pinned`/`pin`/`attackers` semantics only — clean-room per `chess/SPEC.md` Part L; no code, since our board is a separate implementation and the bundle must stay MIT |
| `python-chess-annotator` (rpdelaney-archive) | GPL-3.0 (repo badge + quoted `LICENSE`) | Threshold *values* (−300/−150/−75cp, 7.5-point annotation gate) are facts about a public tool, reusable as a starting point for our own tuning; no code |
| `chess-artist` (fsmosca) | GPL-3.0 (repo) | Concept only (NAG-glyph-from-eval pattern); no code |
| `ChessCoach` (chrisbutner) | GPLv3-or-later (repo) | Concept only ("neural commentary is often wrong" is a finding, freely citable); no code, no weights |
| `SCC` (zhyack, ACL'19 reference code) | **No LICENSE file found in the repository** — default all-rights-reserved under GitHub ToS | Cite the paper's findings only; no code |
| `ChessCommentaryGeneration` (harsh19, Jhamtani ACL'18 reference code) | **No LICENSE file found**; processed dataset additionally gated behind author permission per issue #11 | Cite the paper's category taxonomy and stated results only; dataset not redistributable |
| `Caissa-AI` (MazenS0liman) | GPL-2.0 (repo) | Architecture pattern (symbolic-detect-then-verify) only — an unprotected idea per `chess/SPEC.md` Part L1; no code |
| `concept-guided-chess-commentary` (ml-postech) | **No LICENSE file found** | Cite the paper's method and error-rate findings only; no code |
| Lichess (`lichess-org/lila`, incl. study/gamebook feature) | AGPL-3.0 (confirmed at https://github.com/lichess-org/lila/blob/master/LICENSE, same finding as `game-review.md`) | Interaction *pattern* only (guess-then-reveal, graduated hints); any literal code requires AGPL clean-room treatment per `chess/SPEC.md` Part L |
| Chess.com help-centre content | Proprietary, no reuse licence | Conceptual structure only, per `game-review.md` §9 |
| Academic papers (arXiv/ACL/PNAS full text) | Copyright in the writing; the ideas/findings themselves are not protected (17 U.S.C. §102(b), `chess/SPEC.md` Part L1) | Findings, numbers, and method descriptions are freely citable as facts; no verbatim text, no released code beyond what each repo's own licence states above |
| Maia / Maia-2 (KDT2020, NeurIPS 2024 papers) | **NOT VERIFIED** — model-weight licence not checked; paper findings only cited here | Concept only (rating-banded human-move modelling) |
| Chessable MoveTrainer | Proprietary product; SM-2 attribution is third-party, **NOT VERIFIED** against Chessable's own documentation | Concept only (fine-grained interleave-then-quiz, spaced scheduling) |
