# Skill model — estimating per-area ability from a player's own games and puzzles

Scope: the layer above puzzle personalization and puzzle rating (read `04-puzzles/personalization.md`
and `puzzle-selection.md` first — not repeated here). This file asks: given a player's signed game
and puzzle-attempt history, what is the actual, defensible update rule for turning "solved this
tactic" or "blundered this endgame" into a number — one that is deterministic, cheap, online, and a
pure function of an ordered attempt list, matching the constraint already locked for the main player
rating in `rating-systems.md` (plain Elo, K=32 first 20 games then K=16, floor 100, recomputable by a
stranger from signed scoresheets with no server and no hidden state).

## 1. What they do

- **Bayesian Knowledge Tracing (BKT)** — Corbett & Anderson, 1994. Models a skill as a latent binary
  state (`L`, "mastered" or not) updated via a two-state Hidden Markov Model with four parameters:
  initial mastery `P(L0)`, transition/learning probability `P(T)`, slip `P(S)` (mastered but answered
  wrong), and guess `P(G)` (unmastered but answered right). After each observed response `O_t`, mastery
  is updated by Bayes' rule, then the transition probability is applied to move to the next opportunity:

  Correct response: `P(L_t=1 | O_t=1) = [P(L_{t-1}=1)(1-P(S))] / [P(L_{t-1}=1)(1-P(S)) + (1-P(L_{t-1}=1))P(G)]`

  Incorrect response: `P(L_t=1 | O_t=0) = [P(L_{t-1}=1)P(S)] / [P(L_{t-1}=1)P(S) + (1-P(L_{t-1}=1))(1-P(G))]`

  [Formulas as reproduced by emergentmind.com's BKT topic summary and cross-consistent with the
  standard textbook statement of Corbett & Anderson's model](https://www.emergentmind.com/topics/bayesian-knowledge-tracing-bkt)
  — **the 1994 primary paper (UMUAI journal) was not fetched directly in this pass**; these equations
  are quoted from a secondary synthesis, not verified letter-for-letter against the original. The four
  parameters (`P(L0)`, `P(T)`, `P(G)`, `P(S)`) are normally fit per skill via Expectation-Maximization
  over a training corpus, not set by hand.
- **Deep Knowledge Tracing (DKT)** — Piech, Bassen, Huang, Ganguli, Sahami, Guibas, Sohl-Dickstein,
  NeurIPS 2015. Read directly: [arxiv.org/pdf/1506.05908](https://arxiv.org/pdf/1506.05908). An LSTM
  recurrent network takes a one-hot encoding of (skill, correctness) at each interaction and outputs,
  at every step, a vector of predicted correctness-probabilities — one per skill — for the *next*
  interaction. Trained end-to-end with cross-entropy loss over the whole interaction sequence. There is
  no closed-form "update rule" in the BKT/Elo sense: the model updates by backpropagation over the full
  training corpus, and a single new attempt does not have a simple, hand-checkable arithmetic effect on
  the network's weights.
- **Performance Factors Analysis (PFA)** — Pavlik, Cen & Koedinger, AIED 2009, [ERIC full text](https://files.eric.ed.gov/fulltext/ED506305.pdf).
  Reframes knowledge tracing as ordinary logistic regression, corroborated via a second, more
  legible source: [Module 2: Logistic Knowledge Tracing and PFA](https://yilinl.quarto.pub/pfa/).
  For a response involving skill(s) `k`, with prior successes `s_k` and prior failures `f_k` on that
  skill:

  `m = Σ_k [ β_k + γ_k·s_k + ρ_k·f_k ]`, `p(correct) = 1 / (1 + e^-m)`

  `β_k` is a per-skill (or per-item) difficulty intercept; `γ_k` and `ρ_k` are separate learning rates
  for a success and a failure on that skill — unlike BKT, which uses one shared transition probability
  regardless of outcome. PFA "has shown approximately equal predictive power" to BKT "across a lot of
  studies," per the same source, and documented extensions (PFA-Decay, R-PFA) add only marginal AUC
  gains (0.003–0.027) over the base model. The parameters are normally fit once, offline, via maximum
  likelihood over a corpus — a batch procedure, not an online per-attempt update, in its published form.
- **Elo-based student modeling — the Pelánek family.** Radek Pelánek and collaborators (Masaryk
  University) have published a line of work applying the Elo rating system directly to student
  modeling — interpreting a student's answer to an item as "a match between the student and the item."
  [Search-result synthesis, citing Pelánek's "Applications of the Elo Rating System in Adaptive
  Educational Systems"](https://www.researchgate.net/publication/299590303_Applications_of_the_Elo_Rating_System_in_Adaptive_Educational_Systems)
  and the PFAE variant combining PFA with Elo-style updates. The reported update shape — reconstructed
  here from a WebSearch synthesis, since two direct fetch attempts at Pelánek's own primary sources
  failed in this session (`fi.muni.cz/~xpelanek/publications/umuai-overview.pdf` returned a connection
  error; the ERIC-hosted companion paper by Nižnan, `files.eric.ed.gov/fulltext/ED560514.pdf`, returned
  unparseable binary content) — is a per-attempt ability update:

  `θ_new = θ_old + K·(y − p(θ_old))`, where `p(θ) = 1/(1+10^(-(θ-b)/400))`, `y ∈ {0,1}` is the observed
  outcome, and `b` is the item's own difficulty (itself typically updated symmetrically, exactly as
  Elo updates both players after a game). Some formulations use an asymmetric `K` — a larger step for
  a wrong answer than a right one, or vice versa — mirroring PFA's separate `γ`/`ρ`. Pelánek's own work
  also adds a **time-decay term**: instead of `p(θ)`, use `p(θ + f(t))` where `t` is elapsed time since
  the last interaction on that skill, letting the model represent forgetting. **The exact sign
  convention and the exact time-decay functional form are NOT VERIFIED against Pelánek's primary text
  in this session** — the formula above is the standard, internally consistent Elo/logistic-regression
  form (outcome minus expectation, scaled by a step size), consistent with every secondary description
  found, and matches how Elo itself is defined; treat the general shape as solid and the specific
  constants as needing verification against the primary source before being called a direct quote.
- **Item Response Theory, 1PL/Rasch model.** A binary-response model where both a person's ability
  `θ` and an item's difficulty `b` sit on the same logistic scale: `p(correct) = 1/(1+e^-(θ-b))`. When
  `θ = b`, the model predicts exactly 50% — the person's ability equals the point on the difficulty
  scale where they're a coin flip against that item. [CASRAI, Item Response Theory for Scales](https://casrai.org/guides/item-response-theory);
  [Stan User's Guide, IRT models](https://mc-stan.org/docs/2_24/stan-users-guide/item-response-models-section.html).
  A full IRT fit fits `θ` for every person and `b` for every item jointly from a full response matrix,
  normally via numerical MLE or a Bayesian sampler — a batch procedure over the whole dataset, not a
  streaming per-attempt update.
- **Where this coincides with what puzzle Elo already does, and where it adds something.** The 1PL
  model and the standard Elo update are, functionally, close cousins: Elo's "expected score" formula
  `E = 1/(1+10^(-(r_a-r_b)/400))` is the exact same logistic-difference shape as the 1PL model's
  `p(correct) = 1/(1+e^-(θ-b))`, just on a base-10/400 scale instead of a natural-log scale (a pure
  rescaling, not a different model). `puzzle-selection.md` §1 already documents Scoresheet treating
  "every solve attempt as a Glicko-2 rated game between the player and the puzzle" — that is already,
  in effect, an online, streaming, stochastic-approximation fit of a Rasch-family model, with puzzle
  difficulty and player ability on one shared scale. **What IRT adds that a bare Elo/Glicko update does
  not automatically give**: a full joint fit (batch MLE/Bayesian) produces calibrated standard errors
  for every parameter simultaneously and is less sensitive to the order attempts arrive in, whereas an
  online Elo-style update is order-dependent and its uncertainty is only approximated (by Glicko's RD,
  itself an approximation, not the JML/MML standard error IRT would compute). The practical takeaway:
  our puzzle-Elo is already "a cheap online IRT," and a full batch IRT re-fit is a legitimate periodic
  *audit* of that online estimate, not a different thing we're missing — see §6.

## 2. Why it works

- **BKT and DKT both require a batch fitting step this product cannot use as its live number.** BKT's
  four parameters are normally EM-fit per skill from a training corpus; DKT is a whole neural network
  trained by gradient descent. Neither has a simple, hand-checkable, per-attempt closed-form update —
  which is disqualifying against `rating-systems.md`'s already-decided constraint (`chess/SPEC.md`
  F2–F5: the rating must be "a deterministic, pure function of an ordered list of signed game records,
  recomputable by a stranger in their browser with no server and no hidden state"). Re-running EM or
  retraining an LSTM every time a new attempt needs to be reflected is neither cheap nor trivially
  reproducible bit-for-bit across two independent implementations (DKT's own stochastic-training nature
  makes this worse than BKT's).
- **PFA is closed-form (logistic regression) but is normally fit offline, once, over a whole corpus** —
  its `β/γ/ρ` parameters are not naturally "updated as you go" in its published form; making it online
  would mean re-deriving it as something closer to the Elo-style update below, at which point it's the
  same mechanism.
- **The Elo-based update is the one member of this family built to be online, per-attempt, and
  O(1).** It is exactly the same primitive already chosen for the main player Elo — one addition, one
  multiplication, one logistic evaluation — extended from "one global rating" to "one rating per skill
  area." This is why the task brief is right to call it "the most directly transferable": no new
  infrastructure, no batch job, no training pipeline. Every other member of the family (BKT's HMM
  fitting, DKT's neural training, IRT's joint MLE/Bayesian fit) requires machinery this product's
  determinism constraint rules out as the *live* number, even though each is fine as an offline
  research or audit tool (see §6).
- **The Elo-as-online-Rasch-fit framing matters for exactly one reason**: it means adopting a per-skill
  Elo is not "a simpler, worse approximation" of IRT bolted on for convenience — it is functionally the
  same statistical object (ability and difficulty on one logistic scale), estimated online instead of
  in a batch. The product does not have to choose between "the cheap thing" and "the theoretically
  grounded thing"; for a 1PL/Rasch-shaped model, they are close to the same thing.

## 3. What they do badly

- **BKT has documented identifiability problems**: multiple, materially different parameter sets can
  fit the same observed sequence of correct/incorrect responses equally well, meaning the "mastery"
  probability it reports is not uniquely determined by the data alone without additional constraints.
  [Van de Sande, "Properties of the Bayesian Knowledge Tracing Model"](https://files.eric.ed.gov/fulltext/EJ1115329.pdf)
  is the standard reference for this critique — **listed here from the search result that surfaced it;
  not independently read in full in this session, flagged as a reference to verify before citing its
  specific findings externally.** BKT also assumes every item within a skill is equally difficult,
  which is a strictly worse assumption than IRT/PFA/Elo-style models, all of which represent
  per-item difficulty explicitly.
- **DKT trades every form of interpretability and auditability for predictive accuracy.** Its own paper
  and follow-on interpretability critiques treat this as a known, structural cost, not a bug to be
  fixed — "the learned representations lack transparent meaning compared to explicit skill parameters
  in BKT" [arxiv.org/pdf/1506.05908](https://arxiv.org/pdf/1506.05908), fetched directly. For a product
  whose core differentiator (`rating-systems.md` §5) is a stranger being able to recompute the number
  from first principles in their browser, an LSTM's weights are the single worst-fit tool in this
  entire family — worse even than BKT's EM-fit parameters, because a neural net's training process
  is itself stochastic (random initialization, minibatch order, floating-point non-associativity across
  hardware) unless every implementation detail down to the framework version is pinned, which no
  practical reimplementation-by-a-stranger scenario should assume.
- **PFA's real-world reported weakness is handling rare skills** — a search-synthesis characterization
  ("one issue in real-world use is handling rare skills, which can impact model inferences on common
  skills as well") that is plausible given PFA's shared-regression structure across skills but **NOT
  VERIFIED against a primary source describing the specific mechanism** in this pass.
- **The Elo-based family inherits Elo's own, separately documented measurement problems when item
  selection is adaptive** — this is the single most load-bearing finding for this file, from a directly
  read source: "Keeping Elo alive: Evaluating and improving measurement properties of learning systems
  based on Elo ratings" ([pmc.ncbi.nlm.nih.gov/articles/PMC12784335](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/),
  fetched directly). Its findings, quoted: Elo ratings in learning systems are "generally not unbiased"
  and show "outward bias" under random item selection, and become "negatively biased" under adaptive
  selection with easy items; more seriously, when items are **selected adaptively and calibrated
  simultaneously**, "the variance of the ratings across items and students artificially increases over
  time and as a result the ratings do not converge," because "item selection depends on the current
  value of the errors (differences between the ratings and the true values)" rather than the true
  parameters. This is exactly the condition `puzzle-selection.md` §5 already proposes ("serve puzzles
  near the user's own recent... threshold") — the paper's own proposed fix is a **parallel Elo**: two
  chains of ratings, one used for item selection, one used for calibration/scoring, kept conditionally
  independent. Convergence speed is also directly parameterized by `K`: "doubling K" roughly halves
  convergence time but increases rating variance proportionally — there is no free lunch on the
  learning-rate choice.
- **1PL/Rasch's simplicity is also its limitation**: it assumes every item has the same discrimination
  (how sharply the probability of success changes near the ability=difficulty crossing point), which a
  2PL or 3PL model relaxes at the cost of more parameters and a harder joint fit — not something this
  product needs to adopt, but worth naming as the standard next step the psychometrics literature
  reaches for once 1PL's assumption is found wanting, should that ever become relevant.

## 4. What we should copy conceptually

- **Treat every skill area as its own Elo, using the exact math already chosen for the main rating —
  not a new algorithm family.** This is the direct, load-bearing recommendation of this file: reuse
  `rating-systems.md`'s already-decided primitive (`newRating = round(myRating + K × (score −
  expected))`), instantiated once per skill area instead of once globally.
- **Copy PFA's insight that success and failure can legitimately have different learning rates**, as a
  documented, evidenced *possibility* to test later — not a baseline to assume. The literature supports
  the *shape* (separate `γ`/`ρ`, or asymmetric `K`) more strongly than it supports any particular split
  of values, which is why §6 recommends starting symmetric.
- **Copy BKT's "probability of mastery" framing for UI language, not its HMM machinery.** A per-skill
  Elo rating, expressed relative to the player's own overall rating (e.g. "your tactics rating is 80
  points below your overall rating"), communicates the same underlying idea BKT's mastery probability
  does, without requiring the EM-fit apparatus.
- **Copy the IRT insight that ability and difficulty already share a scale** — this is already true of
  the existing puzzle-Elo-vs-player-Elo design; the concrete thing to copy forward is applying that
  same shared-scale principle *per skill*, not inventing a new comparison axis for each named area.
- **Copy "Keeping Elo alive"'s parallel-chains fix as the standard answer** the moment per-skill Elo
  starts influencing which puzzle is served next (which `puzzle-selection.md` and `04-puzzles/
  learning-loop.md` both propose) — this is not optional once selection and scoring share a signal; see
  §7.

## 5. What we can do better

- **Publish the exact per-skill update formula and its parameters as a versioned spec**, the way
  `rating-systems.md` already commits to for the main rating. Nothing in BKT, DKT, PFA, or the
  Pelánek-family papers reviewed here is written as user-facing documentation; publishing "here is
  literally the formula behind your Tactics number" is a real, checkable differentiator no reviewed
  competitor offers (see `chess-profile.md` §3 for the specific Aimchess opacity finding).
- **Gate every per-skill number on a minimum sample size before it is shown**, reusing
  `personalization.md` §5's own recommendation (N≥15 attempts) — directly avoiding the Lichess forum
  complaint pattern ("Bug? Performance in Puzzle Dashboard can't be right") already documented there.
- **Decouple the selection stream from the calibration stream, or explicitly disclose that we don't.**
  Given "Keeping Elo alive"'s direct finding that adaptive selection plus simultaneous calibration
  inflates rating variance and prevents convergence, this product has exactly two honest choices: (a)
  implement the parallel-chains fix (compute the per-skill rating shown to the user from a stream that
  is *not* the same stream driving next-puzzle selection at full intensity — e.g. occasionally serve a
  puzzle outside the adaptive band purely for calibration), or (b) ship the simpler single-stream
  version and say plainly, in the technical documentation (not necessarily user-facing), that the
  per-skill numbers may run somewhat biased/noisy as a structural consequence of adaptive delivery.
  Silently doing neither — serving adaptively and presenting the resulting number as an unbiased
  measurement — is the one option this research does not support.
- **Never let a per-skill update be anything other than the same function called again.** Every arrow
  in `learning-loop.md`'s closed loop should invoke the identical, versioned update rule — this is what
  keeps the whole system auditable rather than a patchwork of special cases.
- **Use a full offline IRT/Rasch batch fit only as a periodic accuracy *audit* against the live online
  Elo numbers, never as the live number itself** — this gets the calibration benefit of the "proper"
  statistical tool without breaking the determinism/recomputability requirement, because the audit
  result is a diagnostic the team reads, not a value shown to or relied on by any user in real time.

## 6. What is technically required

- **Skill-area taxonomy.** Reuse Lichess's puzzle Themes (already the basis of the bundled 5,000-puzzle
  set per `puzzle-selection.md`) for the tactical side, plus `03-analysis/game-review.md`'s
  move-classification taxonomy and a defined game-phase split (opening/middlegame/endgame) for the
  game-derived side. `chess-profile.md` §5 decides which of these are actually surfaced to a user;
  this file's mechanism works for any of them.
- **Per-(user, skill-area) state**: a rating `r_skill` (initialized to the user's current overall
  puzzle-Elo, or a fixed default like 1000 for a brand-new user), an attempt count `n`, and a
  last-updated timestamp/block height.
- **The recommended update rule, concretely, as the v1 default:**

  ```
  p = 1 / (1 + 10^(-(r_skill - d_item) / 400))
  K = 32   if n < 20      (provisional, matches the main rating's own provisional threshold)
      16   otherwise
  r_skill_new = round(r_skill + K * (y - p))
  n_new = n + 1
  ```

  where `d_item` is the puzzle's own Glicko-2 rating (`puzzle-selection.md` §6) or, for a real-game
  mistake, an assigned difficulty derived the same way an own-blunder puzzle's difficulty would be
  estimated (`04-puzzles/own-blunder-training.md` §6). `y ∈ {0,1}` follows `puzzle-selection.md` §4's
  "reward correctness, not attempts" rule — a first-try correct solve is `y=1`; a multi-guess or failed
  attempt is `y=0`. This is deliberately **the identical K-schedule already decided for the main rating**
  (`rating-systems.md`), not a new invented one — the one deviation from the literature's asymmetric-`K`
  suggestion is intentional: start symmetric, because inventing a specific `γ`/`ρ` split without
  empirical justification would be exactly the kind of unverified precision this project's own quality
  bar rules out. **This parameter set is a recommended default, not a validated-optimal one — it has
  not been tuned or tested against real Scoresheet usage data, because none exists yet.**
- **A minimum-sample gate** (N≥15, per `personalization.md` §5) before `r_skill` is exposed anywhere,
  paired with a provisional marker matching the main rating's own `?` (`rating-systems.md` §4).
- **Deterministic canonical ordering**, reusing `rating-systems.md`'s existing answer
  (`endedAtBlock` ascending, then a stable tiebreak) — a per-skill rating is exactly as order-dependent
  as the main Elo rating and needs the identical answer to "what order did these attempts happen in,"
  not a separate one.
- **Version-stamping of the update rule itself** — `K` values, the minimum-sample threshold, and the
  skill-area taxonomy must each be versioned exactly like the main rating's own K=32/16/floor-100
  commitment (`rating-systems.md` §6), so a future parameter change never silently rewrites historical
  numbers.
- **Optional, explicitly non-live**: a periodic offline joint 1PL/Rasch (or Elo-based-KT) refit over
  the full attempt corpus, run as an internal accuracy check on the live online numbers (§5), with no
  determinism requirement of its own since it never touches a shown rating.

## 7. What could break

- **Adaptive-selection bias/variance-inflation, restated concretely for this product.** If the
  per-skill Elo both scores the user *and* drives which puzzle gets served next at full intensity, the
  "Keeping Elo alive" finding (§3) applies directly: the number can look like it's tracking real skill
  while actually reflecting the selection policy's own feedback loop. This is the single most important
  risk in this file — it is not hypothetical, it's the documented failure mode of the exact design
  pattern `puzzle-selection.md` and `learning-loop.md` both propose.
- **Small-N confidence is worse than it looks.** Reusing Glicko's own confidence-interval math from
  `rating-systems.md` (a rating with RD 50 has a 95% CI of roughly ±98 points —
  [en.wikipedia.org/wiki/Glicko_rating_system](https://en.wikipedia.org/wiki/Glicko_rating_system),
  fetched directly) and the plain-Elo example that a K=40, 1300-rated player converging toward a true
  1400 level gains about 4 points/game on average and needs roughly 25 games to close that 100-point
  gap [search-result synthesis, ChessBase "What's Wrong with the Elo System"](https://en.chessbase.com/post/what-s-wrong-with-the-elo-system) —
  a per-skill rating built from fewer than ~15-20 attempts is not a measurement in any meaningful
  sense yet, it is closer to noise with a number attached. `chess-profile.md` §5 turns this into the
  concrete display rule.
- **Cross-skill contamination is real, not hypothetical — see `chess-profile.md`'s use of the Amsterdam
  Chess Test finding.** Per-skill Elo numbers computed from the same underlying "did you play the
  objectively better move" signal, just filtered by tag, will correlate with each other and with the
  overall rating — they are not independent measurements of eight unrelated abilities, and the product
  must not imply they are (see `chess-profile.md` §5's explicit CAN/CANNOT list, which this file's
  mechanism feeds).
- **Retroactive rewriting risk.** Any change to `K`, the minimum-`n` gate, the skill-area taxonomy, or
  the difficulty-source for own-game mistakes changes every historical per-skill number computed under
  the old rule unless the change is versioned and old data is either left under its original rule or
  explicitly re-stamped and disclosed — the identical risk `rating-systems.md` and `game-review.md`
  §5 already flag for the main rating and for move classification respectively; this file inherits it
  rather than introducing something new.
- **The Elo-based-KT family's own biggest unresolved item, honestly stated**: the specific update rule
  quoted in §1 was reconstructed from search synthesis, not read verbatim from Pelánek's own paper, in
  this session. Before this update rule is presented anywhere as "based on published research" rather
  than "an Elo-family design consistent with published research," the primary sources
  (`fi.muni.cz/~xpelanek/publications/umuai-overview.pdf` and the Nižnan ERIC paper) should be
  re-fetched successfully and checked line-by-line — both fetch attempts failed in this pass for
  reasons unrelated to the claim's plausibility (a connection error and an unparseable binary response,
  respectively), not because the sources don't exist or don't say this.

## 8. What we can uniquely do because of Nimiq

- **Sign every puzzle and mistake-derived attempt with the same wallet key already used for the main
  rating** (`rating-systems.md` §8's exact argument, extended one layer down): "prove I attempted this
  puzzle and got this outcome" is the same cryptographic primitive as "prove I sent this payment" —
  no separate identity system, no login, no server-side account required to make a per-skill rating
  independently auditable.
- **A "recompute my skill profile" page, exactly analogous to the main rating's recompute page**
  (`rating-systems.md` §5's "no precedent in any system studied" claim, extended): pull one address's
  signed puzzle/game attempts and replay the versioned per-skill update chain client-side, printing the
  result next to the server's number and calling it wrong if they disagree. None of BKT, DKT, PFA, the
  Elo-based-KT literature, or any product reviewed for `chess-profile.md` (Aimchess, Chess.com, Lichess)
  exposes anything like this — every one of them computes skill breakdowns server-side, against a
  private database, with no independently-replayable input log.
- **Micropayment-funded audit of the offline batch-IRT check itself** (extending
  `personalization.md` §8 and `own-blunder-training.md` §8's pattern one layer further): because NIM
  transfers are cheap enough for genuine micropayments, it becomes viable to pay a small bounty to a
  reviewer (or crowd-source across many small payments) for spot-checking whether the live online
  per-skill numbers and the periodic offline Rasch-audit numbers (§6) actually agree for a sample of
  real users — a real empirical validation loop that costs real money on any other payment rail at this
  transaction size, and which none of the reviewed products appear to run at all, let alone disclose.
- **Portable skill history, not a platform-bound one.** Same argument as `rating-systems.md` §8 and
  `personalization.md` §8, extended to per-skill data specifically: a user's tactics/endgame/opening
  breakdown, tied to their wallet rather than a login, survives an account ban, a platform shutdown, or
  a switch to a different Mini App entirely — something no BKT/DKT/PFA-powered platform in this
  research offers, because their models live inside one company's server.

## 9. Licence and reuse verdict

- **BKT (Corbett & Anderson, 1994)**: an academic publication; the model and its equations are freely
  citable facts/ideas, not copyrightable expression. No code was found or reviewed for BKT specifically
  in this pass — only a secondary summary of the equations. Any production implementation should be
  written independently from the (verified) formula, not copied from any third-party codebase without
  its own licence check.
- **DKT (Piech et al., NeurIPS 2015)**: the paper itself, fetched directly at
  [arxiv.org/pdf/1506.05908](https://arxiv.org/pdf/1506.05908), is an academic publication whose ideas
  and described architecture are freely citable. **No DKT reference implementation's licence was
  checked in this pass** — moot for this product regardless, since §3 recommends against using DKT for
  the live, deterministic number at all; if DKT is ever explored as an offline research tool only, any
  specific codebase's licence would need its own check before reuse.
- **PFA (Pavlik, Cen & Koedinger, AIED 2009)**: an academic publication; the logistic-regression formula
  is a mathematical fact, freely reusable. No source code was reviewed.
- **The Pelánek Elo-for-education line of papers**: academic publications; ideas freely reusable, no
  code reviewed, and — per §7 — the exact formula attributed to this line in §1 should be independently
  re-verified against the primary text before being presented as a direct quote rather than a
  consistent-with-the-literature reconstruction.
- **IRT/Rasch model**: a decades-old, standard statistical technique (Rasch, 1960s) with no licence
  question of any kind — free public-domain mathematics.
- **Glicko/Glicko-2 formulas**: already established as public domain in `rating-systems.md` §9, per
  the author's own statement at [glicko.net/glicko.html](https://www.glicko.net/glicko.html) — not
  re-verified here, cross-referenced.
- **"Keeping Elo alive" (PMC12784335)**: an academic publication, PMC-hosted, read directly; its
  findings and proposed parallel-Elo fix are freely citable as fact/idea. No code was reviewed.
- **Verdict: every mechanism recommended in this file — the Elo-style per-skill update, the
  parallel-selection/calibration fix, the periodic offline IRT audit — is describable and
  independently implementable as mathematics; no code from any paper reviewed here was read or
  copied. The one open item is verification, not licensing: Pelánek's exact primary-source formula
  should be re-confirmed before any public claim quotes it directly (§7).**
