# Chess.com — learning and insight product surface

Scope: the learning/analysis surface only (Game Review, Insights, Lessons, and the surrounding
Features collection), not Chess.com's play/matchmaking or social product. Sources are the official
support.chess.com articles plus one official chess.com/article and one official chess.com blog post;
forum threads and third-party breakdowns are cited explicitly as such, not as official documentation.

## 1. What they do

- **Game Review** — a post-game analysis tool. A green "Game Review" button appears on the game-over
  screen; clicking it launches: a **Game Graph** showing positional advantage move-by-move, an
  **Accuracy Score** (0–100) per player, a **move classification** on every move (see taxonomy below),
  a **coach** persona giving a one-line spoken/written summary of how the game unfolded, **Key
  Moments** (critical junctures, "the first key move usually the last book move"), a **Retry**
  interaction letting the user replay a position and get feedback on their own candidate move, and an
  **Opening Explorer** panel (opening name, how often the user has played it, results history, and
  suggested improvement courses). Settings (gear icon) let the user show/hide the engine's best move,
  choose review perspective (White/Black/both), toggle on-board classification icons, autoplay, and
  coach avatar visibility. Free members get "key insights"; unlimited Game Review and deeper engine
  options (Cloud Analysis) require Premium/Diamond.
  Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work
- **Insights** — a Diamond-only aggregate-statistics product over a player's full game history:
  win/loss rate and accuracy by opponent rating and by outcome type (mate/timeout/resignation);
  accuracy broken out by game phase (opening/middlegame/endgame) and by move number; performance in
  the player's 10 most-played openings as White and as Black, plus average number of book moves
  before the player is the one to leave book; tactical stats (forks/pins/mates found vs. missed,
  pieces hung by both sides); percentage of moves in each classification (brilliant/best/great/etc.);
  per-piece frequency and accuracy; castling patterns and results; accuracy/volume by time of day and
  day of week; a geographic map of opponents' countries. Eligible games must have ≥10 moves, be
  standard chess (no variants), not be aborted, and not involve a computer opponent.
  Source: https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com
- **Lessons** — interactive (not video) coach-guided instruction with practice challenges inside each
  lesson. Two entry points: a **Learn Path** of four skill tiers (New to Chess, Beginner, Intermediate,
  Advanced) organized into courses with a Coach character guiding sequential progress (locked/
  available/completed tile states, resettable progress, skip-ahead within unlocked material); and a
  browsable **Lesson Library** filterable by category (openings/strategy/tactics/endgames/master
  games), skill level, theme, or instructor. Basic members get unlimited "Learn to Play" lessons plus
  one other lesson per day; Premium gets unlimited access to all lessons.
  Source: https://support.chess.com/en/articles/8609703-how-do-lessons-work-on-chess-com
- These sit inside a much larger **Features collection** (21 support articles) that also includes
  Practice (puzzle-style drilling), Vision (board-vision training), Streaks, Achievements, Medals,
  "Books" and Passport awards (gamified badges), Classroom (teacher-run cohorts), Endgame practice,
  Study Plan, Life Review, Learning Rank, a "how do I get better at chess" guide, master-game
  browsing, game sharing, and Live Ratings — i.e. Chess.com wraps analysis in a full gamified
  learning ecosystem, not a standalone report.
  Source: https://support.chess.com/en/collections/13175593-features

## 2. Why it works

- **One number, one story, one board.** Accuracy Score compresses an entire game into a single
  digestible digit; the coach's one-line summary and Key Moments turn a 40-move game into 3–5 things
  worth looking at. This is a UX compression problem solved well: raw engine output (a stream of
  centipawn numbers) is cognitively useless to non-experts, and Chess.com converts it into a graded
  narrative. Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work
- **Emotionally calibrated labels.** "Brilliant" and "Great" reward the user even inside a loss;
  CAPS2 was explicitly re-tuned so most scores land 50–95 and "replicate the feeling of being graded
  on a test in school" rather than the harsher, more extreme distribution of the original CAPS.
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **Retry converts analysis into practice** in the same session, closing the loop between "you made a
  mistake" and "try to find the right move now," which is the single highest-leverage learning
  mechanic in the whole surface — feedback with an immediate second attempt.
  Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work
- **Insights turns single-game feedback into identity-level pattern recognition** (time-of-day
  performance, per-piece accuracy, opening leak points) which is a strong retention hook: it gives
  players a reason to keep playing on the same account to grow a personal dataset.
  Source: https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com
- **Monetization is layered directly onto the learning funnel** — free users see enough to want more,
  Insights and unlimited Game Review sit behind Diamond/Premium, which finances the huge lesson
  library and engine compute. This is a proven wedge: give away the hook (Accuracy Score, a few
  classified moves), sell the depth (unlimited review, Insights, Cloud Analysis).
  Source: https://support.chess.com/en/articles/8584089-how-does-game-review-work,
  https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com

## 3. What they do badly

- **The Accuracy Score formula is not published.** CAPS2 is described only qualitatively ("compares
  moves against top engine recommendations," "mate-distance scoring and adjustment for multiple
  blunders," "varying engine depths depending on player strength") with no public equation, so a
  player cannot independently verify their own score.
  Source: https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined,
  https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **The score was deliberately tuned toward user emotion, not just engine fidelity** — the developers
  explicitly reworked CAPS so scores "concentrat[e] around 80" and feel less discouraging, meaning
  the number is partly a product/retention decision, not a pure measurement.
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **Engine depth varies by player rating**, which the same source states makes Accuracy Scores
  "incomparable across ratings" even within Chess.com itself, let alone against other platforms —
  the comparison problem is compounded because Chess.com and Lichess "use different depths based on
  player ratings," making cross-platform score comparison explicitly meaningless.
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **"Brilliant" has no public numeric threshold.** Chess.com replaced an earlier brilliant-move
  algorithm with a qualitative rule (must be a non-obvious material sacrifice, must be best-or-near-
  best, engine must look bad on it at shallow depth) but no official chess.com staff post gives exact
  parameters; a Chess.com staff reply on the community's own forum thread asking "how are brilliant
  moves decided" gave no technical answer, leaving it to community reverse-engineering.
  Source: https://www.chess.com/forum/view/general/how-are-brilliant-moves-decided,
  https://www.chessigma.com/blog/brilliant-move-chess
- **Insights and unlimited Game Review are paywalled** (Diamond/Premium only), so the most useful
  pattern-recognition tooling is unavailable to the free tier that most new/casual players are on.
  Source: https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com
- **Not a cheat-detection tool despite looking like one.** CAPS2 "does not measure the difficulty of
  the moves when scoring," so a very high Accuracy Score is not, by Chess.com's own algorithm design,
  evidence of legitimate play — a distinction that fuels public confusion and forum disputes over
  accusations built on Accuracy Score alone.
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about

## 4. What we should copy conceptually

- Compress a raw engine trace into: one headline number, a short natural-language narrative, and a
  small set of flagged "key moments" — this three-layer structure (number / story / moments) is the
  right shape for a mobile-first, low-attention audience.
- A retry/practice loop attached directly to a flagged mistake, in the same flow, not a separate
  puzzle mode the user has to navigate to.
- Emotionally legible labels ("Brilliant," "Great," "Miss") rather than raw centipawn deltas — the
  taxonomy itself is good product design even where the exact thresholds are opaque.
- Aggregate, cross-game statistics (accuracy by phase, by piece, by time of day) as a distinct
  higher-tier product from single-game review — it rewards continued play with the same identity.

## 5. What we can do better

- **Publish the exact formula, engine, depth, and version used**, rather than a qualitative
  description — turn "trust our score" into "recompute our score." This directly serves Scoresheet's
  differentiator (cryptographically signed, independently recomputable rating) and fixes Chess.com's
  most-cited weakness (opacity, cross-rating and cross-platform incomparability).
  Source of the weakness: https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined
- **Never re-tune the scoring function for how it makes users feel.** Chess.com's own account of
  CAPS2 admits the redesign optimized for emotional comfort ("feels like a decent... score," "grade[d]
  like a school test") over measurement fidelity. A signed, recomputable score cannot ethically do
  this — the formula must be fixed and published, and any change must be versioned and disclosed as a
  change, not silently re-centered.
  Source: https://saychess.substack.com/p/what-chess-players-need-to-know-about
- **Don't paywall the statistics that make the product sticky.** Insights-equivalent aggregate stats
  should be available to every user from game one, not gated to a premium tier — Nimiq's no-server-
  owned-account model doesn't have a subscription business to protect the same way Chess.com does.

## 6. What is technically required

- A chess engine (see `research/02-engine/`) run at a fixed, published depth/nodes/hash configuration
  per device class, so the same game re-analyzed by a different verifier reaches the same
  classification.
- A move-classification function mapping engine eval deltas (ideally win-probability deltas, not raw
  centipawns — see `03-analysis/accuracy.md`) to a small labeled taxonomy, with published numeric
  thresholds.
- A narrative-generation layer (can be template-based, not necessarily LLM) that turns the
  classification stream into "key moments" and a one-line summary.
- A lightweight practice/retry UI that reuses the same position + engine call already computed during
  review.
- Aggregate stats storage keyed to the user's wallet/identity rather than a server account, computed
  from the same signed per-game data already produced for the rating.

## 7. What could break

- Engine non-determinism (multi-threaded search, hash-table collisions) breaking the "independently
  recomputable" promise if not pinned to single-threaded, fixed-hash, fixed-version settings — this is
  the single biggest technical risk carried over from wanting Chess.com-style depth-tiered analysis.
  **NOT VERIFIED against Scoresheet's actual engine config** — flag for the engine-selection research.
- Mobile compute budget: Chess.com varies engine depth by player rating/tier precisely because full-
  depth analysis is expensive; a mobile-first app doing this client-side risks battery/latency
  problems, or server-side risks cost-per-game at scale.
- A published, fixed classification formula is easier to game once players know the exact thresholds
  (e.g., engineering a "Brilliant"-qualifying sacrifice) — transparency trades away some of the
  obscurity Chess.com currently relies on against exactly this kind of gaming.

## 8. What we can uniquely do because of Nimiq

- Publish the exact engine version, depth, and scoring formula, and let any third party re-run it
  against the signed game record to reproduce the same Accuracy Score and move classifications —
  something no one can currently do to Chess.com's CAPS2, per Chess.com's own admission that even the
  math "has changed" without full disclosure. Source: https://support.chess.com/en/articles/8708970-how-is-accuracy-in-analysis-determined
- Detach the statistics/insights layer from any subscription or server account — a wallet-attached,
  portable analysis history survives account loss and isn't a premium upsell.
- Because there is no server-owned account, "Insights" can be computed and shown to a user from
  cryptographically signed history they hold themselves, not from Chess.com's private database —
  removing the platform lock-in that keeps Chess.com's Insights valuable only as long as the user
  keeps paying and keeps playing on that one account.

## 9. Licence and reuse verdict

Chess.com is closed-source SaaS. Nothing here is a repository with a licence to check — the support
articles, the CAPS/CAPS2 blog posts, and the forum threads are Chess.com's own copyrighted marketing
and help content, not source code, and grant no reuse rights. Only the **concepts** (taxonomy shape,
retry loop, aggregate-stats framing) are usable; no code, text, or exact formula should be copied
verbatim. Per `chess/SPEC.md` Part L and `CLAUDE.md`'s "never below Lichess" rule, the permissive,
freely-portable reference for the actual engine/analysis mechanics remains `lichess-org/scalachess`
(MIT) and Lichess's own published accuracy formula, not Chess.com's undocumented CAPS2 — see
`03-analysis/accuracy.md`.
