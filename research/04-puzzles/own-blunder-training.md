# Own-blunder training — turning a player's own mistakes into fair, verified puzzles

Scope: which of a player's real-game mistakes deserve becoming a puzzle, how to avoid shipping
an unfair or ambiguous puzzle (multiple good moves, an engine-only line no human would find),
and how to verify a generated puzzle is sound before a user ever sees it. Complements
`puzzle-selection.md` (Lichess's mining/cook-detection pipeline, read directly from source) and
`personalization.md` (where own-blunder puzzles sit in the training queue).

## 1. What they do

- **Six live third-party products already do some version of this**: Blunder Book, Blunders.ai,
  Chess Blunder Trainer, My Chess Blunder, CheckMyMate, Gambito — all import a user's Lichess/
  Chess.com games (or a PGN) and turn detected mistakes into review puzzles. See
  `personalization.md` §1 for the full list and links. None of their internal selection/
  verification logic is public.
- **A documented self-hosted implementation** (independent hobbyist blog, not a platform) lays
  out a concrete pipeline: convert engine eval to **winning-chances** via a sigmoid (−1.0 to
  +1.0 scale, not raw centipawns), then classify by winning-chances *lost*:
  **inaccuracy ≥0.10, mistake ≥0.20, blunder ≥0.30**. It explicitly filters out "dead-end"
  positions (where mate was already inevitable regardless of the move played) and **downgrades
  missed mate-in-6-or-longer from "blunder" to "mistake,"** on the reasoning that a mate that
  deep isn't a realistic human training target. It uses the engine's principal variation (PV) as
  "the primary source of truth" for what the puzzle's solution and explanation should be.
  [mrlokans.work: Building a Self-Hosted Chess Blunder Trainer](https://mrlokans.work/posts/building-self-hosted-chess-blunder-trainer/)
- **An independent chess-improvement blog** ("The Problem of Blunders") argues from a different
  angle: analysing thousands of games, it finds a blunder is only worth reviewing if the
  **opponent's actual reply doesn't itself significantly change the evaluation** back — i.e. if
  *both* players missed the same idea, "the error didn't really impact the course of the game"
  and shouldn't be flagged as a training-worthy blunder at all. Its concrete filter: an eval
  swing of **at least 400 centipawns**, the player having **more than 3 seconds left on the
  clock** at the time (to separate calculation errors from time-pressure errors), and no forced
  mate already locked in. Its data finding: **roughly 72% of major blunders involve missing an
  opponent's check or capture** — so a cheap first-pass filter (does the position contain any
  legal check or capture the mover missed?) catches most real blunders at a fraction of the
  compute of full engine analysis, since checks+captures are typically only 4–11% of legal moves
  in a given position. [movelibrary.com: The Problem of Blunders](https://www.movelibrary.com/blog/25/)
- **Lichess's own mined-puzzle pipeline** (from `puzzle-selection.md` §1, read directly from
  `ornicar/lichess-puzzler`'s `generator.py`) already solves a closely related problem — turning
  *any* game position into a verified, single-solution puzzle — via its cook-detection check:
  the best move must beat the second-best by a **≥70-point win-probability margin** at
  `depth 50 / 30s / 25,000,000 nodes`, re-verified recursively at every ply of the defender's
  best replies too (`depth 15 / 10s / 8,000,000 nodes`). This is the most rigorous, actually-
  read-from-source verification method found in this research pass, and it generalises directly
  to "verify a puzzle mined from a specific user's own game," not just from the general Lichess
  archive.
- **Community complaints on Lichess's own forums show the cook-detection isn't perfect even
  there**: multiple threads — "Multiple solutions," "Puzzle with 2 solutions," "Puzzle with
  multiple solutions," "unfair puzzle," "lichess's puzzle is unfair!" — report puzzles accepted
  by the pipeline that a solver found had more than one valid line, or where the "solution"
  depended on an assumption (e.g. "involving opponent mistake") not clear from the position
  itself. [lichess.org/forum/lichess-feedback/multiple-solutions](https://lichess.org/forum/lichess-feedback/multiple-solutions),
  […/unfair-puzzle](https://lichess.org/forum/lichess-feedback/unfair-puzzle),
  […/puzzle-with-multiple-solutions-8](https://lichess.org/forum/lichess-feedback/puzzle-with-multiple-solutions-8)

## 2. Why it works

- **Winning-chances thresholds (not raw centipawns) avoid the classic false-positive**: dropping
  from +900cp to +800cp is a 100cp "loss" by raw measurement but changes almost nothing about
  who wins — both the self-hosted trainer and general blunder-detection discussion converge on
  this same point independently. [mrlokans.work](https://mrlokans.work/posts/building-self-hosted-chess-blunder-trainer/),
  general convention noted via WebSearch synthesis — **NOT VERIFIED against a single canonical
  source**, but the same reasoning appears in the Lichess generator's own `win_chances()` gate
  (see `puzzle-selection.md` §1), lending it independent, source-read confirmation.
- **"Both players missed it" filtering removes non-representative training material.** A blunder
  neither side capitalised on wasn't actually decisive in that game, and drilling it teaches a
  pattern the player didn't actually get punished for missing — the movelibrary.com argument is
  intuitively sound and matches a basic pedagogical principle: training material should reflect
  moments that mattered, not every engine-detectable inaccuracy.
- **The checks/captures-first heuristic is a genuine efficiency win** if the 72% figure holds
  generally (**single-source claim, NOT independently cross-verified in this pass** — flag
  before relying on it for a hard product commitment): scanning ~5–11% of a position's legal
  moves catches most of the training-worthy material, meaning a cheap tactical-motif prefilter
  can triage which positions deserve full engine time before the expensive cook-detection pass
  runs.
- **Downgrading missed mate-in-6+ makes puzzles more human-fair**: an engine sees a forced mate
  in 8 as clearly as a mate in 2, but a human missing an 8-move-deep forced line is not
  comparable evidence of a "trainable" gap the way missing a mate-in-2 is — this maps directly
  onto the own-blunder-training version of the "engine-only solution a human cannot find"
  problem the task asks to avoid.
- **The Lichess cook-detection margin (70-point win-probability gap, re-verified recursively at
  every ply)** works because it doesn't just check the *first* move is unique — it checks the
  *whole line* stays forced, including the defender's replies. A puzzle that looks unique at
  move 1 but has a cook three moves deep is still an unfair puzzle; recursive verification is
  what catches that.

## 3. What they do badly

- **Even Lichess's rigorous, source-verified cook-detection still lets ambiguous puzzles through
  in practice** — the multiple live forum threads in §1 are evidence the 70-point-margin check is
  necessary but not sufficient. Any own-blunder pipeline that adopts the same margin should
  expect a non-zero residual rate of disputed puzzles, not treat the check as a guarantee.
- **The self-hosted trainer's author reports a direct motivational failure mode**: after
  analysing 500+ of their own games, they had solved only 40 of the resulting puzzles — the
  quote is explicit: *"building a tool to fix your weaknesses is a fantastic way to avoid
  actually sitting down and fixing your weaknesses."*
  [mrlokans.work](https://mrlokans.work/posts/building-self-hosted-chess-blunder-trainer/) This
  is a real, first-person-reported risk specific to own-blunder tools (generic puzzle sets don't
  have this failure mode as sharply, because they don't require a whole generation pipeline
  before any training value is delivered).
- **Explanation quality is a known, admitted gap**: the same author states plainly that "pure
  python-chess board analysis can't capture" the reasoning behind quiet-move (non-tactical,
  positional) blunders — an engine PV tells you *what* to play, not *why* a human should
  recognise it, and the author's own proposed fix (LLM explanation grounded by engine truth) is
  future work, not a solved problem.
- **Test coverage gaps are self-reported**: the same project "lacks comprehensive fixtures for
  scenarios like multiple queens or underpromotion" — i.e. even a working pipeline has known
  blind spots in unusual-but-legal positions, which is exactly where a naive verification pass
  is most likely to silently accept a broken or ambiguous puzzle.
- **The 400cp / >3-seconds-on-clock filter is a single blogger's heuristic, not a validated
  standard** — reasonable, but **NOT VERIFIED** as tested against a ground truth of "puzzles
  human reviewers agreed were fair," only against the author's own read of "did this change the
  game."
- **None of the six live commercial own-blunder products publish their selection or verification
  criteria at all** — every specific number and rule in this file that isn't from Lichess's own
  source code comes from two independent blog posts, not from Chess.com, Lichess, or any of the
  named commercial competitors disclosing their method.

## 4. What we should copy conceptually

- **Winning-chances-based severity classification**, not raw centipawn loss — confirmed
  independently by both the self-hosted trainer's design and Lichess's own generator logic (two
  independent sources arriving at the same normalisation).
- **The recursive, whole-line cook-detection check from Lichess's generator** (§1 here, full
  detail in `puzzle-selection.md` §1/§6) as the core verification gate for any puzzle mined from
  a user's own game — this is the most rigorous, source-confirmed method found, and it directly
  answers the task's "avoid multiple good moves" requirement.
- **The "both players missed it → skip" filter** — check that the position, after the blunder,
  still shows the opponent finding at least a reasonable fraction of the resulting advantage in
  their own next move or two, before accepting the position as puzzle-worthy. A blunder followed
  by an equally large blunder back is not clean training material.
- **Downgrade or reject overly-deep forced sequences** (Lichess: reject 1-movers, restrict short
  mates below tier 3; self-hosted trainer: downgrade missed mate-in-6+) as the concrete,
  actionable version of "avoid engine-only solutions a human cannot find." Depth of the forced
  line is a measurable, cheap proxy for human-findability, even though it's not a perfect one
  (see §7).
- **The checks/captures-first triage heuristic**, as a cost-control measure: run the cheap filter
  before spending full engine-search budget on a position, especially important since Scoresheet
  ships offline and can't assume server-side engine compute is free or instant per user game
  imported.
- **Clock-time-aware filtering**, if the source game data includes move times (Lichess and
  Chess.com game exports typically do) — separates "genuinely missed the idea" from "ran out of
  time and blitzed a move," which are different training signals and arguably deserve different
  treatment (a time-pressure blunder is less about the *pattern* and more about *time
  management*).

## 5. What we can do better

- **Run Lichess's exact cook-detection margin (or stricter) as a mandatory gate before any
  own-blunder puzzle is shown to a user — never trust the blunder-finding pass alone.** Every
  reviewed own-blunder tool's public description stops at "found the blunder, made a puzzle";
  none publicly describe a Lichess-grade recursive uniqueness re-verification step. Explicitly
  adding one is a real, checkable quality bar the named competitors don't visibly clear.
- **Score and disclose a per-puzzle confidence/fairness score, not just a difficulty score.**
  The self-hosted trainer computes a 0–100 difficulty score; extend that idea to also surface
  (internally, and optionally to a curious user) a "how confident are we this has one fair
  solution" signal derived from the cook-detection margin — a puzzle that barely cleared the
  70-point threshold is meaningfully less certain than one that cleared it by 95 points, and
  treating them identically in the training queue throws away information we already computed.
- **Directly counter the "motivation paradox" mrlokans reported** by never gating the *first*
  training value behind a full personal-game-import pipeline: the bundled 5,000-puzzle set (see
  `puzzle-selection.md`) already delivers immediate value, so own-blunder puzzles should
  *augment* an already-working queue (per `personalization.md` §4's "one lane, not the whole
  queue" design) rather than be a separate feature a user has to first "set up" before getting
  anything — removing the exact friction that correlated with the reported 500-games-analysed/
  40-puzzles-solved gap.
- **Require the opponent's own move quality as part of acceptance, not just the blunderer's
  move** — formalise movelibrary.com's "both missed it" filter as a hard rule: reject a candidate
  blunder if the opponent's actual next move in the source game already captured a large share
  of the resulting advantage (meaning the "puzzle" would ask the trainee to find something the
  real opponent essentially also found).
- **Be honest in-product about explanation limits.** Given the explicitly admitted gap ("pure
  engine analysis can't capture" quiet/positional reasoning), don't synthesise a confident
  prose explanation for a quiet-move blunder that the underlying engine data can't actually
  support — either limit explanations to tactical (checkable, PV-groundable) blunders at launch,
  or clearly flag positional-blunder explanations as lower-confidence.

## 6. What is technically required

- A UCI/NNUE engine (Stockfish, matching the class Lichess itself uses) reachable at generation
  time, with enough search budget per candidate position to run a Lichess-grade cook-detection
  pass (`depth 50 / 30s / 25M nodes` for the attacking line, `depth 15 / 10s / 8M nodes` for
  defensive replies, per the source-read values in `puzzle-selection.md` §1 — treat as a
  starting point to independently tune, not a value to hard-copy given the AGPL status of the
  source it was read from, see §9).
- A `win_chances()`-style sigmoid conversion from engine score (centipawns or mate distance) to
  a normalised win-probability scale, shared with the general puzzle-rating/selection
  infrastructure in `puzzle-selection.md` §6, so severity classification is consistent across
  bundled and own-blunder puzzles.
- A blunder-classification pass over the user's own PGN/game history: eval-swing-in-win-
  probability threshold (own-blunder-specific severity band, independently tunable from the
  general puzzle-difficulty scale), a dead-end/already-lost filter, a mate-depth downgrade rule,
  and (if clock data is present) a time-pressure flag.
- A cheap pre-filter (legal-checks-and-captures scan) to triage candidate positions before the
  expensive full engine pass, given Scoresheet's offline-first constraint means engine compute
  time is a real budget, not an assumed-free server resource.
- A "both players missed it" check: re-run the engine (lighter search is acceptable here) on the
  position immediately after the blunder to see how much of the resulting advantage the
  opponent's actual next move captured, and reject/deprioritise candidates where the answer is
  "most of it."
- Storage for the resulting puzzle that's schema-compatible with the bundled puzzle set (FEN,
  solution moves, theme tags, rating estimate, and — new here — a fairness/confidence score and
  a provenance flag distinguishing "mined from your own game" from "bundled Lichess puzzle"),
  so the personalization queue in `personalization.md` §6 can blend both sources uniformly.
- User consent and account-linking flow to import PGN/game history from Lichess/Chess.com (or
  accept a raw PGN upload) — a product-and-privacy requirement, not just a technical one: the
  user is handing over their real game history, and Scoresheet should be explicit about what's
  stored, for how long, and whether it's used beyond that user's own training queue.

## 7. What could break

- **An engine-verified "clearly best move" can still be a move no human would find** — this is
  the exact gap the creativity paper (`puzzle-selection.md` §1/§3) identifies: engine-optimal
  and human-findable are different properties, and win-probability-margin uniqueness checks say
  nothing about whether the *winning idea itself* is intuitive. A deep, only-move zwischenzug
  that clears every cook-detection bar can still be an unfair puzzle in the everyday sense the
  task is worried about. Mate-depth downgrading (§4) mitigates this only for forced-mate lines,
  not for "only move keeps a large material/positional edge" lines of the same practical
  unfairness.
- **Full Lichess-grade search depth per candidate is expensive at real-user scale** — running
  `depth 50 / 30s+` searches for every blunder in every imported game, times however many games
  a user imports, is a genuine compute-cost and latency risk; the checks/captures pre-filter
  (§4) and a possibly-shallower own-blunder-specific search budget are the levers, but shipping
  without deciding this explicitly risks either unacceptable generation latency or a silently
  under-verified (and therefore potentially unfair) puzzle set.
- **A shallower search than Lichess's own can produce false "unique solution" verdicts** — if
  our re-verification search misses a cook that a deeper search would have found, we ship an
  ambiguous puzzle believing it's clean. This is the single biggest technical risk named in this
  file, and it's exactly the failure mode Lichess's own community still reports even at full
  search depth (§3) — a shallower budget will not do better.
- **The 72%-of-blunders-are-missed-checks/captures figure is unverified beyond one blog's own
  data** — if it doesn't generalise (different time controls, different rating bands, different
  player pool), the checks/captures pre-filter could silently skip a meaningful share of real
  blunders that don't fit that pattern (positional blunders, pawn-structure errors, missed
  endgame technique), understating what's actually trainable from a given user's games.
- **The "both players missed it" filter can over-reject** if applied too strictly — an opponent
  finding *some* of the advantage on their very next move doesn't mean the original blunder
  wasn't still a valuable, instructive mistake to review; this needs a tunable threshold, not a
  binary reject, or genuinely useful training material gets thrown away.
- **Privacy/consent risk is specific to this feature**: unlike a bundled puzzle set, own-blunder
  training requires ingesting a real user's real game history (potentially revealing playing
  patterns, time-control habits, even opponent identities via game URLs). This needs explicit,
  legible consent and a clear data-retention story before shipping — it is a different risk
  category from anything else in `04-puzzles/`.

## 8. What we can uniquely do because of Nimiq

- **Directly counter the "motivation paradox" (§3) with a completion-stake mechanic.** Because
  Nimiq payments are feeless and instant, a user can stake a trivial NIM amount when they import
  a batch of games for blunder analysis, redeemable only once they've actually solved a
  meaningful fraction of the resulting puzzles — a concrete, low-friction fix for the exact
  failure the self-hosted trainer's author reported (500 games analysed, 40 puzzles solved).
  (Design proposal — **NOT VERIFIED** as an existing practice on any reviewed product; this is
  an opportunity identified from the evidence, not an observed pattern.)
- **Micropayment-funded human fairness review.** Given the residual ambiguous-puzzle rate even
  Lichess's rigorous pipeline shows (§3), a small NIM bounty per own-blunder puzzle reviewed by
  a human (the puzzle's own owner, a peer, or a titled reviewer) for "is this actually fair"
  is economically viable at NIM's fee structure in a way it isn't on any card-rail-based
  alternative — directly closing the gap between automated cook-detection and genuine
  human-fairness confirmation that no reviewed competitor appears to offer.
- **Attach real stakes to rated own-blunder training**, consistent with the product's broader
  "signature is your rating, and skill earns" positioning (per `chess/SPEC.md` Part 0) — turning
  "did you actually learn from your own mistake" into a wallet-verifiable, signed training
  record rather than a private, platform-siloed statistic.

## 9. Licence and reuse verdict

- **`ornicar/lichess-puzzler`'s cook-detection algorithm is AGPL-3.0** (confirmed by reading the
  LICENSE file directly — see `puzzle-selection.md` §9 for the verbatim confirmation). Every
  specific threshold quoted from it in this file (the 70-point win-probability margin, the
  200cp/60-point candidate-detection gate, the search-depth/time/node limits) is a **reference
  point read from AGPL source, to be independently re-derived and tuned under the clean-room
  protocol in `chess/SPEC.md` Part L, not ported or closely paraphrased into production code.**
  The *concept* (recursive whole-line uniqueness verification against a win-probability margin)
  is an unprotectable idea/algorithm and is free to reimplement independently; the *expression*
  (the actual Python implementation) is not.
- **`mrlokans.work`'s blog post and `movelibrary.com`'s blog post** are independent, individually
  authored web content — **no licence was stated or checked for either**; treat both as standard
  copyright-protected written work, safe to read, cite, and learn design ideas from (as this
  file does, with attribution), **not safe to copy code, text, or figures from directly.** Any
  code shown in the mrlokans post (Docker/Stockfish/FastAPI architecture) should be treated as
  that author's own work, unlicensed for reuse absent an explicit statement — **NOT VERIFIED**
  whether the underlying project repository (if public) carries an open licence; check the
  project's own repo directly before reusing any of its code.
- **The six named commercial own-blunder products (Blunder Book, Blunders.ai, Chess Blunder
  Trainer, My Chess Blunder, CheckMyMate, Gambito) are closed, proprietary products** — nothing
  about their internal selection or verification logic was published or discoverable in this
  research pass, and none should be treated as a source of any kind beyond public product
  positioning (feature comparison, pricing, marketing claims) that is fair to observe.
- **Verdict: the algorithmic idea (winning-chances severity, recursive cook-detection, both-
  missed-it filtering, checks/captures triage) is freely reusable as a concept from these
  sources; no code, text or figures from the AGPL Lichess generator or from either blog post may
  be copied — reimplement from an independently written functional spec, per the clean-room
  protocol already governing every other AGPL/GPL source this project studies.**
