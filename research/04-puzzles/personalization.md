# Personalization — from "5,000 random puzzles" to "3 things you keep missing"

Scope: weakness detection (population-level and individual-level), training-queue design,
spaced repetition as applied to chess specifically vs. the general cognitive-science evidence
base, and what's folklore vs. what's actually been measured. Feeds Scoresheet's rated-training
mode and any "your weak spots" screen.

## 1. What they do

- **Lichess Puzzle Dashboard**: after each solved/failed puzzle, performance is broken down by
  Theme. The dashboard surfaces a **Strengths** and an **Improvement Areas** section — the 3
  highest- and 3 lowest-performing themes, each with a performance rating, solve percentage, and
  play count — and lets the user replay failed puzzles or train directly on a weak theme.
  [Lichess Wiki: Puzzles](https://lichess.fandom.com/wiki/Puzzles),
  [lichess.org forum thread on dashboard accuracy](https://lichess.org/forum/lichess-feedback/puzzle-improvement-areas-ie-thematic-weaknesses-concepts-discerning-power)
- **Chess.com spaced repetition scheduling**: a fixed 8-level interval ladder — Level 1 = 4
  hours, then 1 day, 3 days, 1 week, 2 weeks, 1 month, 3 months, 6 months. A correct answer
  advances one level (longer wait before next review); an incorrect answer **resets fully to
  Level 1**. It cites the general scientific consensus on spaced repetition as its rationale but
  discloses no named algorithm (not explicitly SM-2, not explicitly Leitner, though the
  fixed-ladder shape resembles a Leitner box more than SM-2's continuously-computed interval).
  [support.chess.com: How does the spaced repetition scheduling work?](https://support.chess.com/en/articles/10319322-how-does-the-spaced-repetition-scheduling-work)
- **Third-party own-mistake tools** already exist and combine weakness-sourcing with scheduling:
  **Blunder Book** (finds every mistake in a user's Lichess games, turns them into targeted
  training), **Blunders.ai** ("mixes two sources on one schedule: tactics puzzles you failed in
  practice, and blunders pulled straight from your own games, keeping the opponent and date so
  you're re-solving a real moment"), **Chess Blunder Trainer** (auto-imports from Chess.com/
  Lichess or a PGN), **My Chess Blunder**, **CheckMyMate**, **Gambito**.
  [Blunders.ai](https://blunders.ai/), [Blunder Book](https://www.blunderbook.com/),
  [My Chess Blunder](https://mychessblunder.com/), [CheckMyMate on App Store](https://apps.apple.com/mx/app/checkmymate/id6744045870),
  [Chess Blunder Trainer on Google Play](https://play.google.com/store/apps/details?id=com.cbt.chess_blunder_trainer&hl=en)
- **Maia** (CSSLab / Microsoft Research): a neural engine trained to predict *human* moves
  rather than *best* moves, at specific rating bands (originally 9 separate models, roughly
  Maia-1100 through Maia-1900, each trained on games from players near that rating).
  [Maia Chess](https://www.maiachess.com/), [CSSLab blog: Introducing Maia](http://csslab.cs.toronto.edu/blog/2020/08/24/maia_chess_kdd/)
  A follow-on line of work, **"Learning Models of Individual Behavior in Chess"** (KDD 2022,
  McIlroy-Young et al.) and **"Learning to Imitate with Less: Efficient Individual Behavior
  Modeling in Chess"** (2026, [arxiv.org/pdf/2507.21488](https://arxiv.org/pdf/2507.21488)),
  goes further: models a **specific individual player's** move tendencies, trained on that
  player's own Lichess game history, rather than a population/rating-band average.
  [cs.toronto.edu/~ashton/pubs/maia-individual-kdd2022.pdf](https://www.cs.toronto.edu/~ashton/pubs/maia-individual-kdd2022.pdf)
- **The 2026 offline-RL puzzle-selection paper** (see `puzzle-selection.md` for full detail):
  trains a policy that picks the *next* puzzle for a specific user from their embedded solve
  history (Elo trajectory + correctness sequence), rather than serving a static rating-matched
  puzzle. [arxiv.org/html/2608.14851](https://arxiv.org/html/2608.14851)

## 2. Why it works

- **Retrieval practice (testing effect) is one of the best-evidenced findings in learning
  science**: Roediger & Karpicke's 2006 studies, and Karpicke & Blunt's 2011 study in *Science*,
  showed that actively recalling an answer produces more durable learning than passive
  re-study — cited widely as ~50% better long-term retention from retrieval vs. re-reading.
  [Cepeda et al. meta-analysis background via search summary — see note below]
  A puzzle ("recall the winning move") is inherently a retrieval-practice event; a diagram you
  just re-read is not. This is *why* puzzles-as-flashcards is a sound design, independent of any
  chess-specific study.
- **Spaced repetition's general effectiveness is backed by a large meta-analysis**: Cepeda et
  al. (2006) reviewed **254 studies** and found distributed practice produces **50–200% better
  long-term retention** than massed practice/cramming. Dunlosky et al. (2013) rated *spaced
  practice* and *practice testing* the **top two** most effective of ten common study techniques
  they reviewed. **NOT VERIFIED against the primary Cepeda/Dunlosky papers directly** — these
  figures come from a WebSearch synthesis of secondary sources, not from reading the original
  papers in this session; treat the exact percentages as approximate until checked against
  Cepeda, N. J., et al. (2006), *Psychological Bulletin*, and Dunlosky, J., et al. (2013),
  *Psychological Science in the Public Interest*.
- **Interleaving has a controlled, quantified effect** directly relevant to mixed-theme puzzle
  sets: Taylor & Rohrer (2010) had students learn to compute the volume of four shape types
  either blocked (all of one type, then the next) or interleaved (mixed order). Final test
  scores: **interleaved 63% vs. blocked 20%** — but *during-practice* accuracy was **worse**
  under interleaving (60% vs. 89%), because interleaving forces the learner to also practice
  *discriminating* which method/pattern applies, not just executing it once told.
  [Taylor & Rohrer 2010, full PDF](http://uweb.cas.usf.edu/~drohrer/pdfs/Taylor&Rohrer2010ACP.pdf)
  This maps directly onto puzzle themes: blocked "all forks, then all pins" training will *look*
  more successful during the session and *perform worse* on a later mixed test than an
  interleaved theme order would.
- **Individual-level weakness modeling works because rating is a blunt instrument**: two players
  at the same Elo can have very different error profiles (one strong tactically/weak
  positionally, or strong at attack/weak at defence). Maia's individual-modeling line of work
  exists specifically because population/rating-band models under-fit any one person's actual
  tendencies. [cs.toronto.edu/~ashton/pubs/maia-individual-kdd2022.pdf](https://www.cs.toronto.edu/~ashton/pubs/maia-individual-kdd2022.pdf)
  **NOT VERIFIED at the level of exact reported accuracy deltas** — the WebFetch extraction of
  this PDF returned a summary, not verbatim numeric results; the qualitative claim
  ("individual > population modeling for predicting a specific player's moves") is the paper's
  clear thrust and is well-attested by the existence of the whole Maia-individual research line,
  but any specific number should be re-pulled from the PDF directly before quoting it externally.

## 3. What they do badly

- **Chess.com's spaced-repetition ladder resets fully to Level 1 on any single miss.** This is
  a much harsher penalty curve than SM-2-style algorithms (which reduce the interval
  proportionally, not to zero) — a single slip after months of correct reviews throws away all
  accumulated interval progress, which is a known criticism pattern of simple Leitner-style
  systems vs. SM-2/FSRS-style ones in the general spaced-repetition literature (e.g. Anki's own
  docs and community explicitly moved past naive "reset to box 1" schemes for this reason).
  [support.chess.com](https://support.chess.com/en/articles/10319322-how-does-the-spaced-repetition-scheduling-work)
  gives no evidence this specific design was tested against alternatives — it states the general
  case for spaced repetition, not for *this* reset rule.
- **No platform (Lichess, Chess.com) publishes an actual chess-specific controlled study** for
  its spaced-repetition or weakness-targeting feature. Every citation available is either (a)
  general cognitive-science literature not run on chess puzzles specifically, or (b) anecdotal
  single-case testimonials (Alex Crompton 300→1500 in nine months; GM Hans Tikkanen reaching
  2500+ after the Woodpecker Method) — real and notable, but **n=1 success stories, not
  controlled evidence that the method caused the gain** rather than the hours of deliberate
  practice that came with it. [Woodpecker Method background via Chess.com/Chessable blog posts
  — **NOT VERIFIED** as a controlled result, explicitly anecdotal by nature]
- **Lichess's dashboard "Improvement Areas" is a coarse-grained, self-reported-noisy signal.**
  Its own forum threads show players disputing accuracy — one thread's title is literally "Bug?
  Performance in Puzzle Dashboard can't be right," and performance rating is explicitly
  *dependent on the average rating of puzzles played*, so it can drop even after a string of
  correct solves if those solves happened to be against lower-rated puzzles.
  [lichess.org forum thread](https://lichess.org/forum/lichess-feedback/bug-performance-in-puzzle-dashboard-cant-be-right)
  A theme-performance number that moves for reasons unrelated to actual skill is a weak
  foundation for "here are the 3 things you're bad at."
- **26% of puzzles carry no theme tag at all** (see `puzzle-selection.md` §3, from the RL
  paper's dataset description) — any weakness-by-theme system inherits a systematic blind spot:
  a real, repeated weakness that happens to fall on untagged puzzles is invisible to the theme
  dashboard entirely.
- **Third-party own-blunder tools are fragmented and narrow** — each does roughly one thing
  (import PGN → find blunders → make flashcards) with no visible integration of spaced-repetition
  scheduling *and* individual weakness clustering *and* a rated-training loop in one product;
  Blunders.ai is the closest to combining failed-puzzle review with own-game blunders on one
  schedule, but that's one vendor's approach, not an industry-validated design.

## 4. What we should copy conceptually

- **Theme-level strengths/weaknesses dashboard**, Lichess-style, but built on our own-tag-
  verified 5,000-puzzle set (see `puzzle-selection.md` §5) so the "26% untagged" problem doesn't
  carry over.
- **Interleave themes by default, block only in a deliberate "learn a new pattern" mode.**
  Taylor & Rohrer's result is specific and actionable: introduce a new tactical motif with a
  short blocked run (a handful of same-theme puzzles so the pattern registers), then immediately
  fold it into an interleaved mixed queue for all subsequent review — never leave a theme in
  permanent blocked rotation, since that's the condition that produced the *worse* test
  performance in the controlled study.
- **A graduated-interval schedule, but proportional-not-reset on failure.** Adopt the ladder
  shape (short → long intervals as mastery accrues) that both Chess.com's system and SM-2/Anki
  use, but avoid Chess.com's apparent full-reset-to-Level-1 harshness — drop back one or two
  levels on a miss, not to the floor, consistent with how modern SR schedulers (SM-2 descendants,
  FSRS) treat a single lapse as informative but not catastrophic.
- **Own-mistake sourcing as one lane of the training queue, not the whole queue** — the
  Blunders.ai model of mixing "puzzles you failed" with "blunders from your real games" on one
  schedule is the right shape: it means the queue is always personalized without requiring the
  user to have played enough of their own games yet to source blunders from (a cold-start
  problem the bundled puzzle set solves; see `own-blunder-training.md`).
- **Individual-level pattern detection, not just rating-band matching.** Even without Maia's
  scale of training data, the *principle* — track error type by position feature (piece
  configuration, phase of game, motif), not just "puzzles you got wrong" as an undifferentiated
  bucket — is copyable at small scale: cluster a user's own failed puzzles by motif/phase rather
  than only by raw pass/fail count.

## 5. What we can do better

- **Ship a weakness signal that is stable, not noisy.** Instead of Lichess's raw per-theme
  Glicko performance rating (which can swing on small samples and on which puzzles happened to
  be served), use a **minimum-sample-size gate** before surfacing a theme as a "weakness" (e.g.
  require N≥15 attempts on that theme before it's eligible to appear in a "you're weak at X"
  card) — directly answering the "Bug? Performance... can't be right" complaint pattern seen on
  Lichess's own forums.
- **Make the failure-interval reset proportional, and say so.** A one-line "we don't erase your
  progress for one slip" is both a better-evidenced design (see §4) and legible, honest product
  copy — a real differentiator against Chess.com's undisclosed, apparently harsher reset.
- **Be explicit in-product about what is evidenced vs. what is our design choice.** Given the
  actual state of chess-specific evidence (general cognitive-science backing is strong;
  chess-specific controlled studies are essentially absent — see §3), a defensible, honest
  approach is a short "why this works" note in-app that cites the *general* learning-science
  literature (Cepeda, Dunlosky, Roediger & Karpicke, Taylor & Rohrer) rather than implying chess-
  specific trials exist, which would overclaim.
- **Combine the RL paper's difficulty-weighted-correctness idea with theme-aware selection**:
  rather than either "serve by theme weakness" or "serve by difficulty" in isolation, weight
  candidate puzzles by *both* — a puzzle that is (a) in a theme the user is measurably weak at
  and (b) at or slightly above their current puzzle-Elo scores higher for the next-puzzle slot
  than either signal alone. Neither Lichess's dashboard nor Chess.com's ladder appears to combine
  the two explicitly.
- **Cold-start handling**: a brand-new user has no own-game blunder data and no theme-performance
  history. Use the bundled 5,000-puzzle set's difficulty/theme metadata to run a short calibration
  sequence (Chess.com and Lichess both effectively do this via their opening puzzle-rating
  placement) before any personalization kicks in, and say explicitly in-product that the first
  N puzzles are calibration, not "your weaknesses" — a transparency step none of the reviewed
  products appear to disclose to the user.

## 6. What is technically required

- A per-user, per-theme (and, ideally, per-motif-cluster below the theme label) rolling
  performance record: attempts, correct-first-try count, average solve time, and a
  minimum-sample gate before surfacing any weakness claim.
- A Glicko-2 (or Glicko-1) implementation per puzzle *and* per user-theme-pair if theme-level
  ratings are wanted, sharing infrastructure with the overall puzzle rating in
  `puzzle-selection.md` §6.
- A spaced-repetition scheduler: minimally, a graduated-interval table (Chess.com-style) with a
  proportional-backoff-on-failure rule instead of full reset; more ambitiously, an SM-2/FSRS-
  style per-item ease factor, which handles variable question difficulty better than a fixed
  ladder shared by all puzzles.
- A selection/ranking function that blends: puzzle-Elo-vs-user-Elo distance (RL paper's
  `exp(α·Δ)` shape), theme-weakness score (gated by sample size), and due-for-review status from
  the SR scheduler, to produce the actual "next puzzle" queue.
- If own-game blunder sourcing is wired into the same personalization system (see
  `own-blunder-training.md`), a shared data model so a "weakness" can originate from either the
  bundled puzzle set or the user's own games without the UI needing to know which.
- Local/offline-first storage matters here specifically because Scoresheet ships puzzles
  offline: the theme-performance and SR-schedule state needs to work fully client-side (with
  optional sync), not assume a constant server round-trip per puzzle solved.

## 7. What could break

- **Cold-start weakness claims that are actually noise.** Without the sample-size gate in §5,
  an early "you're weak at pins" card built on 3 attempts is a coin-flip claim dressed as
  insight — this is the exact failure Lichess's own community has called out.
- **Interleaving too aggressively for true beginners.** Taylor & Rohrer's result is strongest
  once a learner has *some* grip on each category; introducing five never-seen tactical themes
  in full interleaved rotation before any one of them is recognizable risks the "impaired
  practice accuracy" cost (60% vs 89% in the study) without ever reaching the long-term retention
  payoff, because the user churns out before the delayed test that would show the benefit. The
  blocked-then-interleave sequencing in §4 exists specifically to avoid this.
- **A harsh reset-on-failure schedule (if copied from Chess.com uncritically) actively punishes
  the exact users the RL paper found the most headroom in** — stagnant, low-Elo beginners — by
  making early mistakes maximally costly to their review schedule, which risks disengagement
  rather than the intended reinforcement.
- **Individual-level modeling requires enough of *that user's* data to be worth anything** — the
  Maia-individual line of research is trained on substantial per-player game history; a new
  Scoresheet user with a handful of solved puzzles has nowhere near that, so any
  "individually-tailored" claim before a meaningful sample exists is marketing, not modeling —
  label it as calibration/cold-start (§5) until the sample-size gate clears.
- **Overclaiming the evidence base.** Given §3's finding that no chess-specific controlled trial
  of spaced repetition or theme-targeted training was located, any in-product or marketing claim
  stronger than "backed by general learning-science research" would not be supportable with what
  was found here — this should stay flagged rather than smoothed into "scientifically proven to
  improve your chess."

## 8. What we can uniquely do because of Nimiq

- **Micro-stake accountability for the training queue.** A wallet-attached Mini App can let a
  user optionally stake a trivial NIM amount on completing a spaced-repetition review session on
  schedule (returned on completion, forfeited/donated on repeated no-shows) — a commitment-device
  mechanic that a purely free, walletless product (Lichess, Chess.com's free tier) has no
  low-friction way to offer, since card-rail micro-stakes of that size aren't economical.
  (Design proposal — **NOT VERIFIED** as something any reviewed competitor does; flagged as an
  opportunity, not an observed practice.)
- **Pay-to-verify individual weakness clusters.** Because Nimiq payments are cheap enough for
  genuine micropayments, a "coach review" loop is viable at a price point that would be eaten by
  fees elsewhere: pay a small NIM amount to a human titled reviewer to confirm/correct the
  system's auto-detected weakness cluster for a specific user, closing the gap the RL paper
  flags (LLM/algorithmic judgments still need human validation) without needing a subscription
  or a $20 minimum transaction.
- **Portable, signed rated-training history.** A Nimiq-wallet-tied puzzle rating and
  theme-performance record is something the user owns and can carry, rather than a silo tied to
  one platform's login — directly extending the "profiles computed from settled payments, not an
  editable bio" principle already locked in for chit, applied here to training history rather
  than payment history.

## 9. Licence and reuse verdict

- **General learning-science findings cited here (Cepeda et al. 2006, Dunlosky et al. 2013,
  Roediger & Karpicke 2006, Karpicke & Blunt 2011, Taylor & Rohrer 2010)** are published,
  peer-reviewed academic findings — freely citable as fact/idea (facts and ideas are not
  copyrightable; see `chess/SPEC.md` Part L1), never a source to copy implementation text from.
  Taylor & Rohrer 2010's full PDF is hosted at a university faculty page
  ([uweb.cas.usf.edu/~drohrer](http://uweb.cas.usf.edu/~drohrer/pdfs/Taylor&Rohrer2010ACP.pdf))
  — reading for the *finding*, not reusing any of its text, figures, or original stimulus
  materials, is the only reuse this file relies on.
- **Maia / Maia-individual research (CSSLab, University of Toronto)**: the `maia-chess` engine
  weights and code are published on GitHub — **licence not checked in this pass; before any
  reuse of Maia model weights or code (e.g. to power a "predict what you'd actually play here"
  feature), read the licence at
  [github.com/CSSLab/maia-chess](https://github.com/CSSLab/maia-chess) directly. NOT VERIFIED.**
  The *papers* (KDD 2022, NeurIPS 2024, arXiv 2507.21488) are academic publications; their ideas
  are freely usable, their exact text/figures are not, per the same idea/expression split as
  above.
- **Chess.com's spaced-repetition design** (the 8-level interval ladder) is described only in
  Chess.com's own help-centre article, not in any licensed or open-source artifact — it is a
  *product design fact* (an unpatented scheduling scheme, as far as this research established;
  **patent status NOT VERIFIED**), safe to describe and to design our own alternative against,
  but not to copy Chess.com's UI text, illustrations, or article content verbatim.
  [support.chess.com](https://support.chess.com/en/articles/10319322-how-does-the-spaced-repetition-scheduling-work)
- **Third-party own-blunder tools (Blunder Book, Blunders.ai, Chess Blunder Trainer, My Chess
  Blunder, CheckMyMate, Gambito)**: each is a commercial or independent product; no source code
  or licence was reviewed for any of them in this pass. Treat all as **closed/proprietary by
  default** — study their *feature set and positioning* (fair, observable product research) but
  do not access or reuse any of their code, data, or generated content without separately
  checking each one's terms. **NOT VERIFIED** individually; flagged as closed until checked.
- **Verdict: cite the academic learning-science literature and the RL paper freely as evidence
  for design decisions; treat every named competitor product (Chess.com, the six own-blunder
  apps) as observation-only, proprietary, not a reuse source; check Maia's code licence before
  any engine-weight reuse.**
