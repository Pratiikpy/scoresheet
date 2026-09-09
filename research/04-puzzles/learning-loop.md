# Learning loop — game to mistake to diagnosis to training to proof

Scope: the closed loop that sits above puzzle personalization/selection (`personalization.md`,
`puzzle-selection.md`), own-blunder puzzle generation (`own-blunder-training.md`), and the skill model
and profile (`03-analysis/skill-model.md`, `03-analysis/chess-profile.md`) — all read first, not
repeated here except where an arrow of this loop specifically depends on a finding from one of them.
This file specifies each arrow of **game → mistake extraction → skill diagnosis → training selection →
performance → updated model → next selection**, and — the harder, more important half of the brief —
how the loop's own effectiveness would ever be measured, since a beautifully specified loop that cannot
demonstrate it worked is not evidence of anything.

## 1. What they do

- **The 2026 offline-RL puzzle-selection paper** (full detail in `puzzle-selection.md` §1) is the
  single most rigorous public attempt at closing part of this loop: it learns a policy that picks the
  next puzzle for a specific user from their embedded solve history (Elo trajectory + correctness
  sequence), evaluated via offline policy evaluation against Chess.com's logged data.
  [arxiv.org/html/2608.14851](https://arxiv.org/html/2608.14851) — cross-referenced, not re-fetched
  here.
- **Own-blunder trainers** (Blunder Book, Blunders.ai, Chess Blunder Trainer, My Chess Blunder,
  CheckMyMate, Gambito — full detail in `own-blunder-training.md` §1) implement the "game → mistake
  extraction → training material" half of this loop commercially, but — per `own-blunder-training.md`
  §3/§5 — none publicly document a "→ skill diagnosis → measured performance → updated model" closing
  of the loop; their documented scope stops at generating review material.
- **Aimchess** (full detail in `03-analysis/chess-profile.md` §1) explicitly closes a commercial version
  of this loop: "Once they find your weaknesses, they help you address them by combining personalized
  puzzles built from your mistakes with unique lessons created by a team of grandmasters and coaches."
  [aimchess.com](https://aimchess.com/), fetched directly. The "did it work" measurement step, however,
  is represented only by the unlinked, uncorroborated "31% faster" claim documented and flagged in
  `chess-profile.md` §3 — no disclosed methodology for how that number was produced.
- **Lichess's dashboard plus spaced-repetition/theme-review flow** (`personalization.md` §1) closes
  "performance → schedule update" at the level of individual puzzles, but does not diagnose a
  skill-area cause the way this file's loop is asked to — it tracks per-theme performance, it does not
  claim to model or update an underlying ability estimate the way `skill-model.md`'s per-skill Elo does.

## 2. Why it works

- **Puzzle *selection*, not puzzle content, is the empirically demonstrated lever** — the RL paper's
  central finding, already documented in `puzzle-selection.md` §2: gains from a learned selection policy
  are concentrated at low Elo and stagnant cohorts (up to roughly 4x the baseline policy's offline score
  in the 100-600 Elo/stagnant cohort) and vanish above ~1500 Elo. This is why closing the *whole* loop —
  not just shipping a bigger static puzzle set — is worth the engineering cost: the product's own
  research already shows where the leverage is.
- **Retrieval practice and spaced repetition are independently, strongly evidenced** for exactly the
  "performance → updated model → next selection" arrows (`personalization.md` §2, citing Cepeda et al.
  2006's 254-study meta-analysis and Roediger & Karpicke's testing-effect work) — turning a diagnosed
  mistake into a puzzle rather than an annotation is what makes the loop pedagogically sound, not just
  mechanically closed.
- **The Elo-style per-skill update (`skill-model.md`) is the only mechanism in this whole research arc
  cheap and deterministic enough to run this loop online, per attempt, without a batch job** — this is
  the concrete, load-bearing reason the "skill diagnosis" and "updated model" arrows specifically use
  that mechanism rather than BKT, DKT, or a batch IRT fit (`skill-model.md` §2/§3 explains why those
  three are disqualified for the live number).

## 3. What they do badly

- **No product reviewed anywhere in this research arc publishes a controlled measurement of the closed
  loop's own effectiveness.** `personalization.md` §3 already establishes this for spaced repetition
  specifically (the Woodpecker Method GM anecdote and Alex Crompton's 300→1500 story are both n=1
  success stories, not controlled evidence); this file extends the same finding to the loop as a whole.
  Aimchess's "31% faster" claim (§1) is the closest thing to a quantified loop-effectiveness claim found
  anywhere in this project's research, and it is unlinked, unauthored, and uncorroborated by three
  independent reviews (`chess-profile.md` §3).
- **Even the RL paper — the most rigorous public work reviewed here — only closes half of this file's
  loop, and says so.** Its reward function is pure difficulty-weighted correctness with "no explicit
  model of spaced repetition or interleaving" (`puzzle-selection.md` §3): it optimizes step 3
  ("skill diagnosis → training selection," in this file's terms, though the paper's "diagnosis" is
  Elo-trajectory embedding, not a named skill area) but does not touch the scheduling/interleaving
  arrows this file also needs. The arrows this file adds — a skill-area diagnosis distinct from a raw
  Elo trajectory, and a spaced-repetition scheduler — are original design work for this product, not
  something adoptable wholesale from the literature.
- **The RL paper's own evaluation methodology has an admitted, specific weakness for the "did it work"
  question**: no randomized controlled trial (results are offline policy evaluation / importance
  sampling over logged data), and only 30 puzzles hand-annotated by experts for any quality ground
  truth, with an LLM extrapolating beyond that (`puzzle-selection.md` §3). Even the best available
  academic attempt at this problem used a weaker evaluation design than a true RCT for its headline
  claims.
- **Own-blunder trainers' most concrete, documented failure is a loop that technically closes but
  practically doesn't run**: the self-hosted trainer author analysed 500+ of their own games and solved
  only 40 of the resulting puzzles, concluding "building a tool to fix your weaknesses is a fantastic
  way to avoid actually sitting down and fixing your weaknesses"
  ([mrlokans.work](https://mrlokans.work/posts/building-self-hosted-chess-blunder-trainer/), per
  `own-blunder-training.md` §3). The "mistake extraction → training selection" arrows worked; the
  "→ performance" arrow never fired because the user didn't return — a loop-adherence failure, not a
  model-accuracy failure, and just as damaging to "did the training work."

## 4. What we should copy conceptually

- **The RL paper's zero-credit-for-a-wrong-attempt rule** (`puzzle-selection.md` §4) as the scoring rule
  feeding the "performance" arrow — a puzzle solved on the third guess is not the same evidence of
  learning as a first-try solve, and the loop's model update should reflect that distinction, not
  collapse to a boolean.
- **The blocked-then-interleaved sequencing** from `personalization.md` §4 (Taylor & Rohrer 2010) for
  the "training selection" arrow specifically when a weakness is newly diagnosed: a short blocked run so
  a new pattern registers, then immediate folding into interleaved rotation — never a permanently
  blocked theme, since that is the condition the controlled study found produced worse delayed-test
  performance despite better in-session accuracy.
- **The "both players missed it" and mate-depth-downgrade filters** from `own-blunder-training.md` §4
  for the "mistake extraction" arrow, so the loop's raw material is fair and human-findable, not merely
  anything the engine flags as an eval swing.
- **Aimchess's diagnosis-to-intervention pairing shape** (§1) — a diagnosed weakness maps to a
  *combination* of targeted drills, not just "more puzzles of the failed theme" — is worth copying as a
  product pattern, even though Aimchess's specific implementation and any validation behind it cannot be
  examined or reused (`chess-profile.md` §9).

## 5. What we can do better

- **Actually specify and run a measurement of the loop's own effectiveness — this is the concrete,
  checkable claim no competitor in this entire research arc is shown to make.** The design: a
  staggered-rollout comparison, not a full-population change on day one. One cohort receives
  skill-diagnosed, per-skill-Elo-driven next-puzzle selection (steps 3-6 below, live); a matched cohort
  receives the existing undifferentiated bundled-puzzle queue. Compare the **change in each cohort's
  own per-skill Elo ratings** (not raw solve count, which conflates volume with improvement) over a
  matched number of total attempts, using the confidence-interval math already established in
  `skill-model.md` §7 and `chess-profile.md` §5 to decide when a between-cohort difference is real
  rather than noise. This directly answers "how would we ever know the training worked," and does so in
  a way that is falsifiable by a third party re-running the same public update rule on the same signed
  attempt history (see §8) — nothing reviewed in this research arc offers that property.
- **Publish the "updated model" arrow's math** (`skill-model.md`'s versioned per-skill Elo update) so a
  claim like "the loop improved this player's tactics" is independently re-derivable by an outsider from
  the signed attempt log, not just asserted by the product.
- **Close the mrlokans.work engagement gap by design, not by hoping the model is good enough.** The
  queue that serves diagnosed-weakness puzzles must be the *same* queue that serves the bundled
  5,000-puzzle set (`personalization.md` §4's "one lane, not the whole queue" decision, restated here as
  a hard requirement for this file specifically) — a stalled diagnosis pipeline should degrade to
  "still training on the general set," never to visible silence, because a technically excellent loop
  nobody opens produces the same zero result mrlokans reported.
- **Decide the adaptive-selection-bias question explicitly** (`skill-model.md` §5/§7's central risk,
  from "Keeping Elo alive") before running the cohort comparison above — if the diagnosed cohort's
  puzzle selection and its scoring share the same unadjusted stream, an observed "improvement" could be
  the selection policy's own artifact rather than real skill change, which would invalidate exactly the
  measurement this section proposes. Either implement the parallel selection/calibration fix or hold out
  a portion of each cohort's attempts, untouched by adaptive selection, purely for scoring.

## 6. What is technically required

The loop, arrow by arrow:

1. **Game → mistake extraction.** Reuse `game-review.md`'s move-classification bands (or the simpler
   Lichess Win%/Accuracy% swing formula from `accuracy.md`) plus `own-blunder-training.md`'s fairness
   filters: a winning-chances-loss threshold, a dead-position (already-lost) exclusion, a
   missed-mate-depth downgrade, a "did the opponent's actual reply also capture the advantage"
   rejection, and a cheap checks/captures pre-filter for cost control before any full engine pass runs.
   Output: a list of `(position, played move, best move, severity, phase, candidate theme tags)`.
2. **Mistake extraction → skill diagnosis.** Map each flagged mistake's theme tag(s) — assigned the same
   way `puzzle-selection.md`'s auto-tagging concept works, applied to a real-game position rather than a
   mined puzzle — onto `skill-model.md`'s per-skill Elo update. Every own-game mistake becomes one more
   rated attempt against that skill area's rating, on the identical schema `own-blunder-training.md` §6
   already scopes for shared bundled/own-blunder storage: no separate "diagnosis" data structure, just
   another attempt event against the same per-skill rating.
3. **Skill diagnosis → training selection.** Rank candidate puzzles (bundled and own-blunder-generated,
   pooled) by `puzzle-selection.md` §5's blended heuristic (`exp(α·(Elo_puzzle − Elo_user))`), but keyed
   to the specific *per-skill* Elo of the diagnosed weak area rather than the global puzzle Elo alone,
   gated by `personalization.md`'s min-N(≥15)-before-"weakness" rule and the spaced-repetition due-date
   from the graduated-interval scheduler (`personalization.md` §4/§6, proportional backoff on failure,
   never a full reset).
4. **Training selection → performance.** The user solves or fails the served puzzle. Record outcome as
   first-try-correct / multi-guess-correct / failed (`puzzle-selection.md` §4's "reward correctness, not
   attempts"), plus solve time — the same event shape whether the puzzle came from the bundled set or
   from own-game mistake extraction.
5. **Performance → updated model.** Feed the outcome into the identical, versioned per-skill Elo update
   from `skill-model.md` §6 (deterministic, O(1), no batch job) and into the spaced-repetition
   scheduler's interval state.
6. **Updated model → next selection.** Loop back to step 3 with the freshly updated per-skill rating and
   due-date. This is a call to the *same function*, not a separate code path for "the second time
   around" — this property (same function, new state) is what keeps the entire loop auditable end to
   end, and is the mechanism §8's replay claim depends on.

## 7. What could break

Including the load-bearing question: how would we ever know the training worked?

- **The adaptive-selection bias risk from `skill-model.md` §7, restated as a loop-level threat.** If the
  loop always serves puzzles near the user's own current per-skill rating and that same stream both
  selects and scores, "Keeping Elo alive"'s documented finding applies directly: reported
  improvement/variance can be an artifact of the selection policy's own feedback loop rather than real
  skill change. This is the single biggest threat to the §5 cohort-comparison measurement specifically —
  without the parallel-chains fix (or an equivalent held-out scoring slice), the experiment designed to
  prove the loop works could itself be measuring the loop's own selection bias.
- **Confounding with simply playing more chess.** Any observed per-skill Elo increase after N loop
  cycles could be explained by general improvement from playing more chess overall, not by targeted
  selection specifically. The only way to distinguish these is a genuine control group matched on total
  attempts (§5's design) — real engineering and product cost (a staggered rollout, not a
  full-population change), which no competitor reviewed in this research arc is shown to have paid.
- **Rating noise swamps small-N conclusions, doubly so at the loop level.** Reusing the SE/Glicko math
  from `skill-model.md` §7 and `chess-profile.md` §5: a per-skill rating built from a few dozen attempts
  already carries a wide confidence interval; a claim about *whether the loop caused* a change in that
  rating needs the before-and-after intervals to not overlap, which needs even more data than a single
  theme-performance number — this is a claim about a claim, and the exact kind of small-sample
  overconfidence the Lichess dashboard forum complaints (`personalization.md` §3) already document at
  one level down.
- **26% of Lichess-sourced puzzles carry no theme tag** (`puzzle-selection.md` §3), and own-game
  mistakes need their own auto-tagging pass that has not been validated for accuracy anywhere in this
  research. A "skill diagnosis" arrow built on unreliable tags silently mis-routes training — the loop
  can appear to run and even appear to "work" in aggregate while actually reinforcing the wrong skill
  area for a given misdiagnosed mistake.
- **The engagement/motivation-paradox risk applies to the whole loop, not just own-blunder puzzles
  specifically** (`own-blunder-training.md` §3, mrlokans.work). A technically well-closed loop the user
  does not return to solve never completes step 4 — no amount of diagnostic sophistication upstream
  fixes a queue nobody opens, and this is the most-documented, most-concrete failure mode found anywhere
  in this whole research arc.

## 8. What we can uniquely do because of Nimiq

- **The entire loop's state — every extracted mistake, every diagnosis, every served puzzle, every
  outcome — is a sequence of signed events tied to the same wallet key already used for chit-style
  payments.** A third party can replay the *whole loop*, not just a final rating: confirm that a
  specific sequence of served puzzles and outcomes genuinely produces the claimed skill trajectory.
  Nothing reviewed in this research arc (Aimchess, Chess.com, Lichess, the six own-blunder tools, the
  academic RL/creativity papers) exposes this level of auditability, because every one of those loops
  runs entirely server-side or entirely offline against a private dataset.
- **Nimiq-funded completion-stake mechanics** (`personalization.md` §8, `own-blunder-training.md` §8)
  directly target the one documented, cross-product failure mode found repeatedly in this research arc —
  the mrlokans.work engagement gap — with a mechanism (a trivial staked NIM amount returned on
  completing a scheduled review session) no card-rail-based or subscription competitor can offer at this
  transaction size.
- **The §5 cohort-comparison measurement, once actually run, could itself be published as a signed,
  third-party-checkable result** — aggregate, anonymized per-cohort skill-trajectory data, verifiable
  against the same public update rule anyone can already recompute their own rating with
  (`rating-systems.md` §5, `skill-model.md` §8). This would be a genuinely novel claim among every
  product and paper reviewed across `03-analysis/` and `04-puzzles/` combined: none of them expose their
  own evaluation data for independent re-analysis, and the RL paper itself explicitly lacks an RCT
  (`puzzle-selection.md` §3).

## 9. Licence and reuse verdict

- This file synthesizes ideas already licence-checked in the five files it cross-references throughout
  (`puzzle-selection.md`, `personalization.md`, `own-blunder-training.md`,
  `03-analysis/skill-model.md`, `03-analysis/chess-profile.md`) — no new external source was read
  specifically for this file beyond what those already cite and verdict. In summary: the Lichess puzzle
  CSV is CC0 (`puzzle-selection.md` §9); `ornicar/lichess-puzzler` and `lichess-org/lila` are AGPL-3.0,
  clean-room study only (`puzzle-selection.md` §9, `own-blunder-training.md` §9); the offline-RL paper
  is CC BY 4.0, attribute if its figures/tables are reproduced publicly (`puzzle-selection.md` §9);
  Aimchess, Chess.com, Lichess's server code, and the six own-blunder products are proprietary,
  observation-only across every file that touches them.
- **Verdict: the six-arrow loop structure specified in §6, and the cohort-comparison measurement design
  in §5, are original synthesis for this product — not ported from any single source. Nothing in this
  file requires a new licence decision beyond what its cited sibling files already record.**
