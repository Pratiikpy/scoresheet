# Design — cheat detection for a money-settled, transparent chess product

This file proposes what Scoresheet should actually build, using the same nine headings as the other
two files in this folder. It is original synthesis rather than a study of someone else's system, so
the headings are read here as: what the design *is* (§1 "What they do"), why it should work (§2 "Why
it works"), its own honest weaknesses (§3 "What they do badly"), what it borrows conceptually from the
field (§4), where it goes further than the field (§5 "What we can do better"), what building it
requires (§6), what could break it — including the transparency-vs-gaming tension (§7), what Nimiq
specifically enables (§8), and what in this file is genuinely original versus published technique
(§9).

Grounded in this project's own prior decisions: `BRIEF.md` already commits to **"record and show,
never auto-ban"** and to move-time variance as the pre-engine signal, explicitly because "a false
positive against a strong player is worse than a missed cheat, and there is no appeals process to
run." `SPEC.md` Part K1/K2 plans an own-engine unlock that turns this into "accuracy that is too even
across easy and hard positions," and states plainly: "A better signal does not change the fact that
there is no appeals process." This design is the appeals process, and the confidence-banded system,
that those two documents flagged as missing.

## 1. What they do

A single per-game (and per-run-of-games) **risk score**, built from an ensemble of independent
signals, mapped to one of three disclosed confidence bands, each with a defined money consequence:

| Band | Meaning | Money consequence |
|---|---|---|
| **Normal** | No signal or combination of signals crosses a review threshold | Payout settles immediately, nothing shown to either player |
| **Review** | At least one signal, or a moderate combined score, crosses a disclosed threshold | This game's payout only is held in escrow for a bounded, published window; both players are notified with the specific triggering signal(s) named (not a bare "flagged"); auto-releases to normal settlement if the window expires with no escalation |
| **High-risk** | Multiple independent signal families agree, or one signal crosses a very high threshold | Payout held pending explicit human/panel review, no auto-release; reviewer's verdict is itself a signed record (§8) |

The signal list, in the nine families this product should compute (the request's own ordering, with
what each needs):

1. **Engine agreement** — top-engine-move match rate, weighted so that matching in a sharp forcing
   line counts less than matching in a quiet position with many similarly-good options. Requires an
   engine; blocked on `SPEC.md` K1.
2. **Move difficulty** — the evaluation gap between the best move and the next-best at the exact
   decision point (Regan's sensitivity/consistency idea, generalized per move rather than fit once per
   player). Distinct from position complexity below: this is about *this one choice*, not the position
   as a whole. Requires an engine.
3. **Move-time distribution** — raw variance in thinking time across a game. Already decided in
   `BRIEF.md` as the pre-engine signal; needs no engine, available from day one.
4. **Time-vs-difficulty correlation** — not variance alone, but whether time spent tracks move
   difficulty. A human spends longer on hard decisions and less on easy ones; an engine-assisted
   player's time is decoupled from difficulty because the engine does the hard part instantly. This is
   the single strongest signal in the newest published work on this exact problem: "Chess Signatures
   of Play" (arXiv 2606.18544, 2026) models a game as a multivariate sequence of (evaluation, accuracy,
   complexity, clock) per move and finds the discriminating power sits in the *order-sensitive*
   relationship between time and difficulty — specifically "accuracy rises precisely when positions
   become hard," the telltale shape of engine assistance, which is invisible to aggregate stats that
   only look at totals. [arxiv.org/abs/2606.18544](https://arxiv.org/abs/2606.18544) Usable in a weak
   form pre-engine (using legal-move-count as a difficulty proxy) and in full once an engine exists.
5. **Position complexity** — a structural read of the position independent of any one move: material
   imbalance, king safety, open vs. closed pawn structure, mobility, phase of game. Feeds signal 4 and
   also stands alone: sustained unnaturally-strong play specifically in the most complex positions
   (where humans of a given strength predictably falter) is itself informative.
6. **Strength trajectory** — a step-change in a player's own rating curve inconsistent with their
   historical improvement rate. Needs only this product's own rating history; available from day one.
7. **Divergence from the player's own history** — the Kaladin idea (`lichess.md` §1, §4): is this
   game's behavioural profile (timing pattern, accuracy pattern, complexity-handling) an outlier
   relative to *this specific player's* last N games, not relative to the population. Requires
   accumulated per-player history; undefined for a new account (cold start, §7).
8. **Device/network signals** — tab-focus loss events, input-timing entropy where the client can
   observe it, multiple accounts sharing a device/IP fingerprint, latency inconsistent with claimed
   location. Neither Lichess's nor Chess.com's public documentation discloses exactly what they use
   here, but both ToS pages reserve the right to "monitor" beyond move analysis
   ([chess.com/legal/fair-play](https://www.chess.com/legal/fair-play)), and Chess.com's evasion
   write-up implies network-timing detection is real enough that cheaters specifically build around it
   with local WASM engines
   ([chess.com/blog/Jordi641/undetectable-by-design-the-code-behind-the-cheaters](https://www.chess.com/blog/Jordi641/undetectable-by-design-the-code-behind-the-cheaters)).
   Must be disclosed in this product's own fair-play page if used at all, to stay consistent with the
   transparency promise (§7).
9. **Tournament/prize context** — a policy multiplier, not a statistical signal: scrutiny scales with
   money at stake, matching this product's own stated philosophy that the amount configures
   everything (`CLAUDE.md` project instructions: "the amount derives everything"). A free casual game
   and a funded-pool tournament game with identical raw signal values should not sit in the same band.

Two supporting, cross-game signals worth adding beyond the requested nine:
- **Cross-opponent consistency** — whether the deviation appears only against strong opponents, only
  against weak ones, or uniformly; Chess.com's own evasion research describes sophisticated cheaters
  deliberately varying behaviour to avoid a flat signature, so a flat-vs-uneven read across opponents
  is itself informative.
- **Opponent-adjusted overperformance across a run**, not one game — the direct generalization of
  Regan's original method, and the fix for its most cited limitation in Regan's own words: "from 10
  moves you are not going to get anything solid"
  ([chess.com/blog/SamCopeland/an-interview-with-im-and-anti-cheating-expert-dr-ken-regan](https://www.chess.com/blog/SamCopeland/an-interview-with-im-and-anti-cheating-expert-dr-ken-regan)).

## 2. Why it works

Three independent pieces of evidence, not one, establish this:

- **The base-rate problem is proven, not theoretical.** Barnes & Hernandez-Castro applied
  engine-correlation analysis to 120,000 pre-2005 games — an era in which cheating was practically
  impossible — and it still flagged at least 92 players as suspicious, purely from natural variance in
  strong human play.
  [oxera.com/insights/agenda/articles/computer-move-chess-cheaters-and-the-limits-of-algorithmic-detection](https://www.oxera.com/insights/agenda/articles/computer-move-chess-cheaters-and-the-limits-of-algorithmic-detection/)
  Any single accuracy-shaped signal, tuned to catch real cheaters, will also catch a predictable
  population of innocent strong or improving players — this is not a tuning failure, it is what the
  statistic *is*.
- **The most realistic form of cheating is specifically the form single-signal aggregate detection
  underreacts to.** "How Much Can a Few Engine Moves Help? Quantifying Limited Cheating in Chess"
  (arXiv 2601.05386, Jan 2026) measures, in controlled Stockfish-vs-Stockfish testing with
  threshold-based intervention policies, that a baseline score of 0.51 rises to **0.71 with just one
  well-chosen engine move** and **0.82 with two**.
  [arxiv.org/abs/2601.05386](https://arxiv.org/abs/2601.05386) A player using an engine on one or two
  critical moves per game gains most of the benefit of cheating while moving an aggregate accuracy
  score by very little — exactly the regime where a single threshold-on-one-number detector is weakest
  and where the money-relevant harm (a stolen prize on the moves that mattered) is still real.
- **Some cheating strategies are provably invisible to aggregate statistics, including Regan's own.**
  "Chess Signatures of Play" demonstrates cheating strategies that "leave every aggregate
  statistic... unchanged," including the metrics the established Regan/IPR system relies on, while
  still being caught by an order-sensitive, sequence-based test.
  [arxiv.org/abs/2606.18544](https://arxiv.org/abs/2606.18544) This is not a hypothetical edge case —
  it is a published construction. A product that ships one aggregate signal (accuracy percentage,
  or a single z-score) has a demonstrated, exploitable blind spot, and any sophisticated actor
  motivated by real money will look for exactly that blind spot first.

A single number cannot distinguish "a strong player having a good day" from "a weaker player with
selective engine help," because both can produce the same aggregate value by construction. Only an
ensemble across independent signal families — where beating one signal does not imply beating the
others — closes that gap.

## 3. What they do badly

- **It is unvalidated.** Every threshold in the table in §1 is a placeholder shape, not a calibrated
  number, because there is no labelled dataset of confirmed cheaters on this product to calibrate
  against — unlike Lichess or Chess.com, which have years of moderator-confirmed ground truth. Until
  real calibration happens (§6), any specific numeric threshold this design might state would be
  invented, not evidenced, so none is stated as fact here.
- **The review-band auto-release timeout is a genuine risk, not a free lunch.** Auto-releasing an
  ambiguous game's payout after a bounded window if nobody escalates is a deliberate choice to bound
  downside for small amounts, but it also means a patient or well-resourced cheater who can absorb
  occasional review-band delays without ever triggering high-risk pays no real cost for staying just
  under the top threshold. This is a known tradeoff, stated plainly, not hidden.
- **Disclosing named triggering signals in the review band (§1) is itself informative to a cheater**
  about which specific behaviour got them flagged, even before disclosing exact thresholds — a
  narrower version of the transparency-vs-gaming tension in §7, and one this design accepts as the
  cost of the product's own stated fairness commitment (a flagged player has a right to know what
  they're being asked to respond to) rather than resolving it away.
- **Several signals (device/network, cross-opponent) are the least specified in this document**,
  precisely because neither Lichess nor Chess.com publish enough detail to know what actually works
  well versus what is theatre; this design carries that uncertainty forward rather than inventing
  false precision. **NOT VERIFIED**: whether device/network signals are worth their privacy and
  engineering cost at this product's scale; they are listed because the request asked for the full
  signal list, not because their value here has been demonstrated.

## 4. What we should copy conceptually

- Run structurally independent signal families, not variations on one idea (Lichess's Irwin/Kaladin
  split; Chess.com's "100+ factors").
- Say explicitly, in public product copy, what a single strong-looking number does *not* prove
  (Chess.com's "accuracy is not cheat detection").
- Route by disclosed confidence, not silently: automate the confident bulk, escalate the ambiguous
  tail to a bounded process (Chess.com's 85/15 split, made numeric and disclosed rather than internal).
- Treat a self-baseline (this player versus their own history) as a first-class signal family, not an
  afterthought (Kaladin).
- Generalize detection across a run of games, not one game in isolation, because Regan's own stated
  limitation ("from 10 moves you are not going to get anything solid") applies to any single-game
  signal, ours included.

## 5. What we can do better

- **A confidence band, not a binary flag.** Neither Lichess nor Chess.com expose an intermediate,
  player-visible "under review" state with a disclosed timeline — both resolve internally to a binary
  outcome (marked/not marked; closed/not closed) that the subject only learns about after the fact.
- **Money-scoped consequences, not account-scoped ones.** Both platforms' only lever is the whole
  account (ban; closure; prize forfeiture threatened after the fact). This design escrows only the
  specific disputed payout, and only for as long as the disclosed review window (§8).
- **A published false-positive/false-negative methodology**, not an appeal-grant percentage presented
  as if it were the same statistic. Chess.com's 0.2%–0.3% figures measure appeal outcomes, not the
  detector's actual error rate (`chess-com.md` §3) — this product should publish the latter, from
  held-out calibration testing (§6), and be explicit that it is a different number from the former.
- **The verdict itself becomes a signed, recomputable record** (§8) — a structural transparency
  guarantee neither competitor offers, because neither has a payment rail that makes "sign the
  decision the way we sign the game" a natural extension of something they already do.

## 6. What is technically required

- **Per-move instrumentation from day one**, even before an engine exists: clock time per move,
  legal-move-count as a cheap complexity proxy, and — once `SPEC.md` K1 lands — engine evaluation at a
  fixed depth for every move of every played game, stored alongside the signed scoresheet so the raw
  feature values themselves are part of the recomputable record, not just the final score (this is
  what makes §7's transparency answer honest: the *inputs* are public even where the *scoring
  function* is not).
- **A per-player history store** sized well enough to compute a personal baseline (signal 7), with an
  explicit "insufficient history" state distinct from "normal" for new accounts — never silently
  treat a cold-start player as cleared.
- **A calibration substitute for the labelled data this product does not have.** The realistic path is
  synthetic: generate a large set of self-play and engine-assisted games at known assistance levels
  (using the same threshold-based/Bellman-style intervention policies as arXiv 2601.05386's own
  methodology) to calibrate detection power against a *known* ground truth, exactly as that paper's
  own stated purpose is "not to assist cheaters, but to measure the effectiveness of cheating... as
  part of the effort to contain and detect it." [arxiv.org/abs/2601.05386](https://arxiv.org/abs/2601.05386)
  This does not replace real-world validation once enough games exist, but it is the only honest
  starting point before real labelled data accumulates.
- **A signature/sequence-based test alongside the aggregate signals**, per arXiv 2606.18544's core
  finding that order-sensitive analysis catches what aggregate statistics structurally cannot; this is
  the one signal family in this list with a concrete, recent, citable algorithm (a signature-kernel
  two-sample test with an anytime-valid sequential formulation) rather than an invented approach.
- **An escrow/hold primitive on individual payouts**, keyed to the specific game or run, with a
  timeout — a payments-layer requirement, not a detection-layer one, and the piece this design most
  directly hands to the Nimiq integration (§8).
- **A signing key for the review verdict itself** — whether that is an automated system signature for
  auto-released review-band cases or a human/panel signature for high-risk cases — so the outcome of
  review is as auditable as the game it reviews.

## 7. What could break

**Adversarial gaming of a published method is real and must be named, not waved away.** This
product's core promise is that results are signed and independently recomputable by anyone — which
means the *method*, or at minimum its shape, is inherently more exposed than Lichess's or Chess.com's
closed systems, both of which explicitly keep their operational thresholds private specifically to
prevent this (`lichess.md` §1, §4; `chess-com.md` §1). A fully public detection method is, by
definition, also a public specification for a cheater of exactly what to avoid.

The honest position, not a comfortable one: **this tension cannot be fully resolved, only managed.**
Three concrete mitigations, none of them a substitute for the others:

1. **Publish the architecture and the raw feature values; do not publish the trained weights or exact
   numeric thresholds.** This is precisely the line Lichess already draws (open code, undisclosed
   operational thresholds — `lichess.md` §4) and it is the correct line for this product too. The
   transparency promise ("signed and independently recomputable") is honored at the level of the
   *inputs* — anyone can recompute the raw engine evaluations, clock times, and complexity scores from
   the signed game record — without extending to the *specific scoring function*, which can and should
   be retrained and adjusted over time the way any adversarial system must. State this exception to
   the transparency philosophy explicitly, as policy, rather than leaving the scope of "recomputable"
   ambiguous.
2. **Prefer signals that are structurally hard to fake in a way that doesn't create a new, different
   anomaly.** This is the actual defensibility argument for signal 4 (time-vs-difficulty correlation)
   and the signature-based test behind it: a cheater who adds uniform artificial time jitter to defeat
   raw move-time variance does not thereby restore the correlation between time and difficulty, and
   now looks anomalous against their *own* historical time-vs-difficulty pattern (signal 7) even if
   they look normal on signal 3 alone. Defeating one signal in the ensemble should cost the cheater
   something detectable on another, by construction of which signals are chosen — this is the concrete
   payoff of an ensemble over a single number, beyond the base-rate argument in §2.
3. **Treat the threshold and weighting as a moving target under continuous, disclosed retraining**,
   the same posture spam and fraud detection systems take toward publicly known architectures — the
   published shape of the method does not have to imply a fixed, permanently exploitable bar, provided
   recalibration is real and ongoing, not theatre.

Other concrete failure modes:

- **Cold start** (§3, §6): every signal keyed to a player's own history is undefined for new accounts,
  which is this product's entire population at launch.
- **Small sample size.** `BRIEF.md` already flags this directly: "Move-time variance as an anti-cheat
  signal is unproven at this scale... it will be noisy with a few hundred games." That caveat applies
  to every signal in this design, not only move-time variance, until real volume accumulates.
- **Selective/sandbagged cheating**, per Chess.com's own evasion research
  (`chess-com.md` §1), specifically targets whichever signals are known to be watched — the reason §7
  point 2 above matters more than any single clever signal.
- **Maintenance cost.** A nine-plus-signal ensemble, calibrated and retrained on an ongoing basis, is a
  standing engineering commitment this product has not yet built the team or process for; shipping a
  smaller, well-validated subset first and expanding it honestly is safer than claiming full coverage
  from day one.

## 8. What we can uniquely do because of Nimiq

- **Escrow the specific disputed payout, not the account.** A review-band flag holds only that game's
  settlement; every other game the same player is involved in, including games played while one is
  under review, continues to settle on the normal schedule. Neither Lichess's account-level flag nor
  Chess.com's account-level closure/forfeiture offers this granularity (`lichess.md` §8, `chess-com.md`
  §8).
- **A bounded, published hold window scaled to the amount at stake.** Because Nimiq's transaction
  costs are low enough to make holding and later releasing very small amounts economically trivial,
  the review-band timeout can be genuinely short for small chits and longer only where the amount at
  stake justifies it — directly implementing this product's own stated philosophy that the amount
  configures everything, applied here to *how long a dispute is allowed to take* rather than only to
  slots/deadline/evaluator as already decided elsewhere in the product.
- **The verdict itself is a signed message**, from either an automated system key (bounded
  auto-release) or a human/panel key (high-risk manual review), attached to the same recomputable
  chain the game record lives in. A third party — a future arbiter, an independent researcher, another
  player deciding whether to trust this product — can verify that a specific verdict was actually
  reached and by what process, without trusting an internal team's word for it the way a Chess.com
  appellant or a Lichess-flagged player currently must.
- **A player's own signed game history becomes portable reputation collateral.** Because results are
  signed and recomputable rather than living only in a private database (`SPEC.md`: "a stranger can
  recompute it from the signatures alone"), a long clean history is independently verifiable by
  anyone, which can justify a wider "normal" band before review triggers for established players —
  the self-baseline idea (§1 signal 7) extended so that the baseline itself is auditable, not merely
  internally trusted the way Kaladin's private history store is.

## 9. Licence and reuse verdict

This file contains no reused code from any source. Everything reusable in it is either:

- **Published, uncopyrightable statistical or ML technique** — Regan's z-score/IPR method (described,
  not copied, from secondary sources plus his own interview:
  [chess.com/blog/SamCopeland/an-interview-with-im-and-anti-cheating-expert-dr-ken-regan](https://www.chess.com/blog/SamCopeland/an-interview-with-im-and-anti-cheating-expert-dr-ken-regan)),
  Barnes & Hernandez-Castro's base-rate finding (cited via
  [oxera.com](https://www.oxera.com/insights/agenda/articles/computer-move-chess-cheaters-and-the-limits-of-algorithmic-detection/)),
  and the two 2026 arXiv papers cited throughout
  ([arxiv.org/abs/2601.05386](https://arxiv.org/abs/2601.05386),
  [arxiv.org/abs/2606.18544](https://arxiv.org/abs/2606.18544)) — arXiv preprints are read and cited
  under arXiv's standard non-exclusive licence to distribute; the *ideas* in them (a signature-kernel
  sequential test, a Bellman-style intervention-policy simulator) are methods, not expression, and are
  free to reimplement independently, per 17 U.S.C. §102(b) and this repo's own `LICENCES.md` §3
  reasoning already applied to other sources.
- **Ideas from AGPL-licensed systems (Irwin, Kaladin), never their code** — per `lichess.md` §9 and
  this repo's `LICENCES.md`, only the architectural concept ("run independent signal families," "use a
  self-baseline") is taken; no line of either repository was read for code, only for README-level
  description of what they do.
- **This product's own prior, already-committed decisions** — `BRIEF.md`'s "record and show, never
  auto-ban" and move-time-variance signal, and `SPEC.md` Part K1/K2's engine-unlock plan, both cited
  and built on directly as local project sources, not external material.

No paper, repository, or page cited in this file publishes code this product could copy; nothing here
needs a licence exception beyond the "ideas and methods are not copyrightable" principle this repo
already relies on elsewhere.
