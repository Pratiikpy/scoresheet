# Puzzle selection — what makes a puzzle good, how it's mined, how it's rated

Scope: Lichess's puzzle pipeline (mining, tagging, rating), Chess.com's parallel system, the
2026 offline-RL paper on puzzle *quality*, and the 2026 RL paper on puzzle *creativity*. Feeds
Scoresheet's bundled 5,000-puzzle set and its Daily/Storm/Streak/rated-training modes.

## 1. What they do

- **Lichess mining pipeline** (`ornicar/lichess-puzzler`, AGPL-3.0): scans the Lichess game
  archive with Stockfish, re-analysing "interesting positions." As of the current dataset
  description this is **600,000,000 analysed games**, re-analysed with **Stockfish NNUE at 40
  meganodes**, costing **"more than 100 years of CPU time."**
  [database.lichess.org/#puzzles](https://database.lichess.org/#puzzles)
- **Candidate detection** (from `generator.py`, read directly): a position becomes a candidate
  when the position eval swings hard in one move — `score >= Cp(200)` (at least a 2-pawn
  advantage) **and** `win_chances(score) > win_chances(prev_score) + 0.6` (win-probability jump
  of ~60 points). Mate lines use a separate threshold, `mate_soon = Mate(15)`.
  [raw generator.py, read via WebFetch, 2026-09-08] **NOT VERIFIED against current HEAD** — the
  file was read through a summarising fetch, not diffed against the live repo; treat exact
  constants as approximate until re-checked against source.
- **Uniqueness / "cook" check**: the generator requires the best move beat the second-best
  candidate by `win_chances(best) > win_chances(second) + 0.7` (a 70-point win-probability gap)
  before it accepts a position as having one correct answer. Mate-in-one candidates get extra
  scrutiny: if multiple mates exist, it verifies the best *non*-mating alternative still loses
  clearly (`win_chances(scores[-1]) <= 0.6` threshold). Search limits: `depth 50 / 30s /
  25,000,000 nodes` for the attacking side, `depth 15 / 10s / 8,000,000 nodes` for the
  defending side. Same source as above, same caveat.
- **Line extension**: the tactic is built recursively — attacker's best move, defender's best
  defence (re-verified each ply), repeated until forced mate or a terminal material win.
  1-move "puzzles" are discarded outright; 2-movers are rejected below tier 3 (i.e. Lichess
  prefers puzzles that need more than "see the check, take the piece").
- **Auto-tagging**: after a candidate is accepted, a separate `tagger` module assigns Themes
  (fork, pin, sacrifice, backRankMate, etc.) programmatically from the move sequence and board
  features, not by human review of every puzzle. Community review (a `validator` web UI) exists
  as a secondary human QA pass, but bulk tagging is automatic.
  [github.com/ornicar/lichess-puzzler](https://github.com/ornicar/lichess-puzzler)
- **Rating**: every solve attempt is treated as **a Glicko-2 rated game between the player and
  the puzzle** — same algorithm class Lichess uses for player ratings, so puzzle difficulty is a
  living number, not a fixed engine-assigned score. Popularity and (historically) some tag
  corrections come from player up/down votes.
  [Hugging Face dataset card](https://huggingface.co/datasets/Lichess/chess-puzzles),
  [database.lichess.org/#puzzles](https://database.lichess.org/#puzzles)
- **Chess.com** re-did its whole puzzle-rating system in a similar direction: **Glicko-style
  rating with rating deviation (RD)**, reprocessing roughly **17 billion attempts** to re-rate
  every player and puzzle at once, explicitly to remove "extra point boosts" that had inflated
  puzzle ratings relative to game ratings.
  [chess.com/news: Announcing New Puzzles Rating System](https://www.chess.com/news/view/announcing-new-puzzles-rating-system),
  [support.chess.com: Why did my Puzzle rating change?](https://support.chess.com/en/articles/12488563-why-did-my-puzzle-rating-change)
- **2026 offline-RL paper** — *"Discovering High-Quality Chess Puzzles with Offline
  Reinforcement Learning"* (Nie, Badrinath, Tomlin, Dai, Yip, Wang, Brunskill, Piech; accepted
  RLC 2026), [arxiv.org/abs/2608.14851](https://arxiv.org/abs/2608.14851),
  [full text](https://arxiv.org/html/2608.14851). Not about *generating* puzzles — about
  **selecting which already-existing puzzle to serve next** to maximise a learner's measured
  gain. Trained on **1,536,254,297 puzzle-solving attempts** from **3,132,428 unique users**
  solving **441,113 unique puzzles** on Chess.com, March 2021–March 2022.
- **2026 creativity paper** — *"Generating Creative Chess Puzzles"*,
  [arxiv.org/abs/2510.23881](https://arxiv.org/abs/2510.23881),
  [full text](https://arxiv.org/html/2510.23881v1). Trains generative models (transformer /
  diffusion / MaskGIT) on the Lichess puzzle dataset, then fine-tunes with PPO against
  engine-derived reward signals for counter-intuitiveness, novelty and aesthetics, to make
  puzzles that *feel* composed rather than mined.

## 2. Why it works

- Mining from real games (rather than composing puzzles by hand) is what makes millions of
  puzzles possible at near-zero marginal human cost — Lichess ships **6,057,356 rated and
  tagged puzzles** this way. [database.lichess.org/#puzzles](https://database.lichess.org/#puzzles)
- The `win_chances` gap requirement (not just centipawns) matters because a fixed centipawn
  threshold misjudges lopsided positions — a 200cp swing in an already-winning position is
  meaningless, but a 200cp swing near equality is decisive. Win-probability normalises for
  that, which is exactly why the generator checks a *win-chances delta*, not a raw score delta.
- Treating each solve as a Glicko-2 game against the puzzle turns puzzle difficulty into a
  self-correcting, population-calibrated number instead of "whatever Stockfish's eval implies."
  A puzzle whose *engine* line is razor-sharp but whose *human* solve rate is 95% at rating
  2000 was mis-rated by the engine and gets corrected by data.
- The RL paper's core empirical claim: **puzzle selection**, not puzzle content, is a major
  lever on stagnant beginners. Its reward is difficulty-weighted correctness —
  `r(s,a) = (c/N) × exp(α·(Elo_puzzle − Elo_user))` with `α = 0.002`, and **zero reward for any
  incorrect answer**, because an incorrect solve "demonstrates no verifiable evidence of
  learning." [arxiv.org/html/2608.14851](https://arxiv.org/html/2608.14851) That is a strong,
  usable design rule: reward/track "did they get it right", not "did they attempt it."
- Its offline-policy-evaluation results, by Elo band and by whether the user's growth trend was
  "stagnant" vs "growth" (behaviour-policy vs learned-policy score, higher is better; same
  source):

  | Elo band | Cohort | Chess.com's actual policy | Learned policy |
  |---|---|---|---|
  | 100–600 | Stagnant | 14.3 ± 1.5 | 52.9 ± 3.0 |
  | 100–600 | Growth | 17.7 ± 0.4 | 58.8 ± 1.7 |
  | 600–1000 | Stagnant | 14.1 ± 1.2 | 27.0 ± 6.7 |
  | 1000–1500 | All | 12.3 ± 0.4 | 12.1 ± 1.2 (neutral) |

  The gain is concentrated at low Elo and vanishes by 1000–1500 — the paper is explicit that
  "as the Elo increases, our margins of improvement decrease, where our policy is neutral."
  Over 80% of the platform's puzzle-solving users are below 1500 Elo, per the same paper — so
  this is not a fringe result, it targets the median user.

## 3. What they do badly

- Lichess's own forum thread asking "how are puzzles generated?" got **no answer from staff** —
  the community had to point to the source code itself.
  [lichess.org/forum: how are puzzles generated?](https://lichess.org/forum/lichess-feedback/how-are-puzzles-generated)
  This means the *published, human-readable* explanation of puzzle mining does not exist even
  on Lichess's own site — everything above had to be read out of source and inferred from the
  dataset docs. A product that reuses Lichess puzzles inherits zero documentation of edge cases.
- 26% of Chess.com's puzzle corpus has **no assigned motif tag at all**, and the average puzzle
  carries 5.6 motifs — i.e. auto-tagging is noisy at both extremes (untagged, or over-tagged).
  [arxiv.org/html/2608.14851](https://arxiv.org/html/2608.14851) A theme filter ("show me only
  forks") is filtering on unreliable metadata roughly a quarter of the time.
- The RL paper's own limitations, stated by the authors: **no randomized controlled trial** —
  the headline improvement numbers are from *offline policy evaluation* (importance-sampling
  estimates from logged data), not a live A/B test; only **30 puzzles** were hand-annotated by
  experts for the qualitative "is this a good puzzle" scores, with an LLM used to extrapolate
  beyond that; and the reward function has **no explicit model of spaced repetition or
  interleaving** — it is pure difficulty-weighted correctness, so it says nothing about
  scheduling review, only about which single puzzle to serve next.
  [arxiv.org/html/2608.14851](https://arxiv.org/html/2608.14851)
- The creativity paper's own honesty check: naive RL reward-maximisation degenerates into
  **"entropy collapse... and out-of-distribution samples," including artificial piece
  inflation** — i.e. left unconstrained, an RL puzzle generator learns to produce nonsense
  boards that score well on the reward function but aren't real chess. It also states plainly
  that "achieving high reward does not automatically equate to high human-perceived
  creativity" — the metric and the actual quality diverge unless checked by humans.
  [arxiv.org/html/2510.23881v1](https://arxiv.org/html/2510.23881v1)
- Even in that paper's *best* setting, only **2.5% of generated puzzles were counter-intuitive**
  by their own criterion (baseline Lichess corpus: 2.1%; naive generation: 0.22%) — the ceiling
  on "genuinely creative, non-obvious puzzle" is low across the board, engine-mined or
  generated. [arxiv.org/html/2510.23881v1](https://arxiv.org/html/2510.23881v1)
- Community complaint pattern on Chess.com's Puzzle Rush: **puzzle diversity skews toward
  repeated, easy motifs** — "too many back-rank mate puzzles" — versus players' perception that
  Lichess Storm draws from a broader motif pool.
  [lichess.org forum thread, community opinion, not a platform statement — **NOT VERIFIED** as
  fact, only as a widely repeated player claim](https://lichess.org/forum/lichess-feedback/unpopular-opinion-puzzle-rushpuzzle-storm)

## 4. What we should copy conceptually

- **Win-probability-normalised difficulty, not raw centipawns**, for any "is this position
  decisive" check when mining or scoring our own puzzle set. A flat cp threshold is wrong at
  the tails.
- **A Glicko-2 puzzle rating, recomputed from real solve data**, not a static engine-assigned
  number. This is exactly the direction Chess.com moved *toward* (away from static/inflated
  ratings) and it's already close to Nimiq Mini App infra — Scoresheet already needs a
  Glicko-ish player rating per the brief, so the puzzle side can reuse the same math and the
  same storage shape.
- **Reward/track correctness, not attempts** — the RL paper's zero-reward-for-wrong-answer
  rule is a clean, arguable design principle: a puzzle "solved" on the third guess is not
  equivalent evidence of learning to a first-try solve, and our own progress/mastery tracking
  should distinguish them rather than collapsing to a boolean.
- **Reject puzzles below a uniqueness margin.** The 70-point win-probability gap between best
  and second-best move is a concrete, portable rule for "this puzzle has exactly one right
  answer" — directly reusable when validating any bundled or generated puzzle (see
  `own-blunder-training.md`).
- **Selection is a separate, tunable layer from mining.** Lichess mines once; the RL paper shows
  *which* puzzle to serve next is where most of the measurable benefit is, independent of the
  puzzle pool's content. This argues for building Scoresheet's serving/ordering logic as its
  own component over the static 5,000-puzzle set, not baking "difficulty order" into a fixed
  sequence.

## 5. What we can do better

- **Publish the mining/selection logic in the open**, something neither Lichess nor Chess.com
  has done in prose (Lichess's own users had to reverse-engineer it from source). A short,
  honest "how we picked these 5,000 puzzles and how we order them" page is a real differentiator
  and costs nothing once the pipeline exists.
- **Fix the untagged/over-tagged problem before shipping**, since we ship a *fixed* 5,000-puzzle
  set rather than millions: at that scale, manually verifying (or re-deriving) every theme tag
  against the actual tactical motif is tractable in a way it isn't at Lichess's 6-million scale.
  A small, 100%-tag-accurate set beats a huge, 74%-tag-accurate one for any UI that lets a user
  filter or train by theme.
- **Adopt the RL paper's selection principle without needing its infrastructure.** We don't have
  1.5B solve attempts to train an offline-RL policy on. But its core, cheaply-implementable
  finding — serve puzzles near the *user's own* recent win-probability threshold, weighted
  toward difficulty, with zero credit for wrong first attempts — is a rule-based heuristic we
  can ship on day one without any RL: rank candidate puzzles by
  `exp(α·(Elo_puzzle − Elo_user))` and always serve strictly from puzzles the user hasn't
  already solved correctly. That is the paper's reward function repurposed as a hand-written
  scoring rule, not a learned policy — an approximation, not a reproduction, and should be
  labelled as such in any UI copy.
- **Design Puzzle Storm to reward accuracy over speed by default** — Lichess's own community
  read is that "Puzzle Rush's puzzles get harder more quickly... reward[ing] tactical agility
  more than mouse speed" is preferred over Chess.com's flatter ramp
  ([lichess.org forum](https://lichess.org/forum/lichess-feedback/unpopular-opinion-puzzle-rushpuzzle-storm),
  community opinion, **NOT VERIFIED** as objective fact) — worth using as a design hypothesis to
  test, not a settled truth.

## 6. What is technically required

- A Stockfish (or comparable UCI/NNUE) engine binary reachable from the build/offline pipeline,
  for candidate mining and — critically — for **re-verifying any puzzle we did not mine
  ourselves** (i.e. every bundled Lichess puzzle) before shipping it, since we cannot audit
  6 million puzzles by hand and must trust-but-verify a 5,000-puzzle subset.
- A win-probability conversion function (`win_chances(cp_or_mate_score)`) matching the shape
  Lichess uses, so difficulty comparisons and uniqueness checks are apples-to-apples with the
  source data's own logic rather than an ad hoc reinterpretation.
- A Glicko-2 implementation (rating, RD, and — if replicating Chess.com's later fix — volatility
  handling) shared between player ratings and puzzle ratings, fed by real solve outcomes stored
  per puzzle per attempt.
- A selection/serving layer, separate from the static puzzle store, that can rank "next puzzle"
  by the heuristic in §5 and can be swapped later for a learned policy without changing the
  puzzle data model.
- CC0 licensing means the **Lichess puzzle CSV itself** (PuzzleId, FEN, Moves, Rating,
  RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags, DailyDate — schema per the
  Lichess database page) can be imported directly with no attribution requirement — see §9.

## 7. What could break

- Re-verifying 5,000 imported puzzles with our own engine at Lichess-grade depth (`depth 50 /
  30s / 25M nodes` for the attacker's side per the generator source) is expensive if run
  serially — budget engine-hours accordingly, or use a shallower re-check depth and accept it as
  a lighter integrity check rather than a full re-derivation.
- If our uniqueness/cook check uses a materially different engine or search depth than the one
  that originally mined a Lichess puzzle, we can get **false disagreements** — flagging a
  perfectly sound Lichess puzzle as "cooked" because our shallower search missed the refutation
  of the second-best move, or (worse) silently accepting a puzzle that is actually ambiguous
  because our search stopped short of finding the alternative. Any automated integrity pass
  needs a documented confidence floor, not a silent pass/fail.
- The RL paper's gains are **near-zero above 1500 Elo** and the paper itself never claims
  transfer beyond Chess.com's specific population and puzzle pool — treating "serve harder
  puzzles near the user's rating" as validated advice for stronger players goes beyond what the
  paper actually showed.
- The 2.5%-creative ceiling from the generation paper means **do not expect any generation
  pipeline (including one built for own-blunder puzzles) to reliably produce "clever" or
  "aesthetic" puzzles** — most auto-generated tactics will be functional, not memorable, and
  copy that oversells "creative puzzles" would overclaim relative to the evidence.
- Auto-tagged themes inherited from Lichess data carry roughly a 1-in-4 chance of being
  incomplete (untagged) even before considering wrong tags — any theme-based training mode
  built directly on imported `Themes` values needs its own QA pass, not blind trust.

## 8. What we can uniquely do because of Nimiq

- **Pay for verified puzzle quality, cheaply and instantly.** Nimiq's feeless, sub-second NIM
  transfers make it viable to reward a human reviewer or a community "cook-hunter" a tiny NIM
  micropayment per puzzle they verify or flag as ambiguous — a QA bounty loop that's
  transaction-cost-prohibitive on any card-rail or even most other chains, but trivial on NIM.
  (Design point, not yet evidenced by a specific competitor doing this — **NOT VERIFIED** as an
  existing practice elsewhere; it is an opportunity, not an observed pattern.)
- **On-chain, portable puzzle-rating provenance.** Because Scoresheet is a Nimiq Mini App with a
  wallet already attached, a user's Glicko puzzle rating can be tied to a signed, verifiable
  identity rather than a server-side account — letting "rated training" mode carry real,
  attributable stakes (e.g. NIM-denominated puzzle-rush entry/reward pools) that neither Lichess
  nor Chess.com can offer without a custodial payment layer.
- **Fund the RL-style selection loop's missing ingredient — real incentive-aligned data —
  cheaply.** The 2026 RL paper needed 1.5B attempts and a live platform to get its offline data;
  we won't have that scale, but Nimiq's low-friction payments make it economical to incentivise
  a small, high-quality labelled set (e.g. pay solvers a few NIM to rate puzzle enjoyment/
  difficulty after solving) that neither free-tier Lichess nor Chess.com's opaque internal
  process exposes to outside builders.

## 9. Licence and reuse verdict

- **Lichess puzzle database (`database.lichess.org/#puzzles`, mirrored on Hugging Face as
  `Lichess/chess-puzzles`): Creative Commons CC0 1.0 Universal (public domain).** Stated exactly
  as such on the database page. [database.lichess.org/#puzzles](https://database.lichess.org/#puzzles),
  [huggingface.co/datasets/Lichess/chess-puzzles](https://huggingface.co/datasets/Lichess/chess-puzzles)
  This is the cleanest possible reuse status: the CSV (6,057,356 puzzles; columns PuzzleId, FEN,
  Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags, DailyDate)
  can be imported wholesale, filtered down to our 5,000, and shipped bundled with **no
  attribution requirement and no copyleft obligation** — CC0 is a full public-domain dedication,
  not merely a permissive licence.
- **`ornicar/lichess-puzzler` (the mining/generator source code) and `lichess-org/lila` (the
  Lichess server, which serves and tags puzzles in production): GNU Affero General Public
  License v3.0 (AGPL-3.0)**, confirmed by reading the LICENSE file directly ("GNU AFFERO GENERAL
  PUBLIC LICENSE, Version 3, 19 November 2007").
  [raw LICENSE file](https://raw.githubusercontent.com/ornicar/lichess-puzzler/master/LICENSE)
  **This is copyleft and network-copyleft** — per `chess/SPEC.md` Part L, reading this source and
  then writing our own generator/selection code requires the clean-room split (a reader produces
  a plain-English functional spec; a different person/context implements from that spec only).
  We may study *what* the generator does (candidate detection, cook-checking, tiering) and
  reimplement the *idea* independently; we may not port or closely paraphrase the actual
  `generator.py` code, and the constants/thresholds quoted in §1 above should be treated as
  reference points to independently re-derive and tune, not values to copy verbatim into
  production.
- **Chess.com's puzzle data has no known public bulk-download or licence** — everything cited
  about Chess.com in this file comes from its news/support pages and the two arXiv papers'
  descriptions of Chess.com-sourced training data, not from a redistributable dataset. **Do not
  assume any Chess.com puzzle content is reusable** — treat it as closed, proprietary data.
  **NOT VERIFIED**: no explicit "Chess.com puzzles are proprietary" statement was located; this
  is an absence-of-evidence conclusion (no public dataset found despite searching), not a
  confirmed policy — flag for a direct check of Chess.com's terms of service if this ever
  matters for a build decision.
- **The two arXiv papers themselves (2608.14851, 2510.23881) are on arXiv** — arXiv's default
  posting terms grant arXiv a non-exclusive distribution licence from the author, but the
  *paper's own* copyright/reuse licence depends on what the authors selected. The offline-RL
  paper's page states **Creative Commons Attribution 4.0 International (CC BY 4.0)**, per its
  arXiv metadata read directly.
  [arxiv.org/abs/2608.14851](https://arxiv.org/abs/2608.14851) That permits reuse of the paper's
  ideas/figures/text with attribution — irrelevant to shipping code, but relevant if we ever
  quote or reproduce a figure/table (as this file does with the results table in §2) in
  user-facing material: attribute the paper if reproduced publicly.
- **Verdict: import the Lichess puzzle CSV freely (CC0); never copy AGPL generator/server code —
  study it, write our own from a clean-room spec; treat Chess.com puzzle content as off-limits;
  attribute the RL paper if its table/figures are reproduced publicly.**
