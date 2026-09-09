# How players actually analyse — teaching material, not feature lists

Scope: not what Game Review or the Lichess analysis board *contain* (that is
`03-analysis/game-review.md` and `accuracy.md`) but what teachers actually tell players to *do* with
them — the workflow, the discipline, the things they say to ignore. Sources: five YouTube tutorials
(auto-generated captions only, downloaded via `yt-dlp`, never the video) plus three written guides.
Lichess's own curated video collection at `lichess.org/video?tags=engines`
(https://lichess.org/video?tags=engines) was enumerated and turned out to hold something different
from what the tag name implies: eleven historical engine-vs-engine spectator games (Rybka vs Zappa,
Houdini vs Crafty, Nakamura-odds matches, all uploaded by ChessNetwork/kingscrusher) — entertainment
and study material for watching engines play each other, not tutorials on using an engine to review
your own games. Neither of the two videos this task named as anchors (`YqHET8kqfww`, `k4aXwk_VQVw`)
actually carries the "engines" tag on Lichess; both were found by title search instead.

Videos read:
- "How to use Lichess for the Analysis of Chess Games in 2022 (with Stockfish, Database and
  Openings!)" — https://lichess.org/video/YqHET8kqfww (also https://www.youtube.com/watch?v=YqHET8kqfww)
- "John's How-To's: Using Engines on Lichess" — https://lichess.org/video/k4aXwk_VQVw (also
  https://www.youtube.com/watch?v=k4aXwk_VQVw), John Hartmann
- "How To Analyze Your Chess Games With A Computer (Chess Engine) To Learn From Your Mistakes!" —
  https://www.youtube.com/watch?v=xG7HT0PlQfQ, Chess Vibes, 158,476 views (most-watched of the five)
- "The TRUTH About Chess.com's 'Game Review' No One is Talking About" —
  https://www.youtube.com/watch?v=zB_ZOHFZCtY, Solomon Rodell / The Chess Giant, 10,355 views
- "Game Review Overview | Chess.com Support" — https://www.youtube.com/watch?v=N_ISwjdZqcw, official
  Chess.com channel

Written guidance read:
- Chess.com Help Center, "How does Game Review work?" —
  https://support.chess.com/en/articles/8584089-how-does-game-review-work
- Chess.com Help Center, "How do I use Game Analysis?" —
  https://support.chess.com/en/articles/8583757-how-do-i-use-game-analysis
- Lichess forum, "How to use analysis tool" —
  https://lichess.org/forum/game-analysis/how-to-use-analysis-tool

## 1. What they do

Every tutorial that actually teaches a workflow (three of the five; the other two are tool tours,
see §3) converges on the same shape: finish the game → open the engine review → work through **only
the flagged moments**, not every move → for each one, form your own guess before the engine reveals
its answer.

- Chess.com's own explainer frames this as a short, repeatable habit: navigation jumps straight to the
  next flagged move, and at each one you can ask to see the best move, retry the position yourself, or
  move on. It explicitly tells players to make this routine: "spend five or maybe 10 minutes in the
  game review" after each serious game (https://www.youtube.com/watch?v=N_ISwjdZqcw). The written Help
  Center article confirms the same two entry points and controls — a magnifying-glass icon into Self
  Analysis, a gear icon for engine and interface settings —
  https://support.chess.com/en/articles/8583757-how-do-i-use-game-analysis.
- The Lichess tool-tour treats analysis as three separate lookups rather than one flagged-moment
  walkthrough — paste a PGN, run Stockfish, cross-check the opening tree/master database — and states
  plainly that this should happen for every game you play: "you should always analyze your own games"
  (https://lichess.org/video/YqHET8kqfww).
- The most-watched video in this set (Chess Vibes, 158K views) describes the actual manual technique
  in the most detail: click forward one move at a time while watching **only the evaluation number**,
  not the board, and stop when it jumps by roughly a pawn or more —
  https://www.youtube.com/watch?v=xG7HT0PlQfQ. Below that threshold, move on: "if it's less than a
  one point jump you can ignore it."
- At each stop, the taught move is: don't ask for the best move first. Play the move *you* would have
  played (or expected your opponent to play) and watch the engine's number and top line respond,
  repeating until the punishment becomes visible. This play-it-out-yourself step recurs roughly a
  dozen times across the one 16.6-minute video — it is the entire method, not one tip among several
  (https://www.youtube.com/watch?v=xG7HT0PlQfQ).

## 2. Why it works

- **Narrowing attention to a single number (the eval) instead of the whole board** turns an
  overwhelming engine output into one comparable signal a player can track move to move without
  needing to read a full principal variation (https://www.youtube.com/watch?v=xG7HT0PlQfQ).
- **A magnitude threshold before a review counts as worth stopping for** keeps beginners from
  drowning: the same video acknowledges lower-rated players will see big swings on nearly every move
  and reframes that as more learning opportunities rather than noise, rather than pretending the
  threshold is universal (https://www.youtube.com/watch?v=xG7HT0PlQfQ).
- **Guessing before revealing** is self-testing, not passive reading — the player has to commit to an
  answer and see it fail before being told the correct one, which is the same shape as Chess.com's
  own "Retry" button (https://support.chess.com/en/articles/8584089-how-does-game-review-work) and as
  the "Learn from your mistakes" mechanic already documented and built in this repo's own
  `game-review.md` and `apps/web/src/study-screen.ts` (`packages/core/src/analysis.ts`). Three
  independent sources converge on the same interaction: don't reveal, make them try first.
- **Key-moment jumping over full move-by-move review** keeps a session short enough to repeat after
  every game — which is precisely what makes Chess.com's five-to-ten-minute habit framing plausible;
  an unbounded move list would not fit that claim.

## 3. What they do badly

- **Solomon Rodell's video is a working chess teacher publicly correcting his own students' misuse of
  Chess.com's flagship feature**, and it is the single richest source in this set for failure modes:
  chasing the Brilliant/Great move counters pushes players toward unnecessary sacrifices when already
  winning — "getting great and brilliant moves doesn't matter" — because in his experience he has
  almost never seen a Great move that wasn't some kind of sacrifice. His rule of thumb: up material,
  play boring and trade down; down material, complicate — the opposite of what badge-chasing
  encourages (https://www.youtube.com/watch?v=zB_ZOHFZCtY).
- **The "performance rating" number is presented as meaningful but is purely rating-relative** — the
  same accuracy percentage produces wildly different numbers for a 2600 and a 500 player, so it cannot
  be compared across players and, per Rodell, shouldn't be dwelt on at all
  (https://www.youtube.com/watch?v=zB_ZOHFZCtY).
- **A label can silently stop matching the underlying evaluation.** Chess.com's own Help Center admits
  the post-game summary "uses a faster analysis than the full Game Review"
  (https://support.chess.com/en/articles/8584089-how-does-game-review-work) — and Rodell independently
  observed the live consequence: a move tagged "inaccuracy" that the engine, given more time, quietly
  decides was fine, without the badge ever updating.
- **Real users get stuck between modes.** On Lichess's own forum, a user wanted comparative feedback —
  not just the best move, but a sense of the other options — and could only get a bare mistake/blunder
  label;
  taking notes on a move required abandoning the Analysis board for Study mode entirely, a distinction
  the thread shows was not obvious to the person asking
  (https://lichess.org/forum/game-analysis/how-to-use-analysis-tool).
- **A video literally titled about "using engines" spends nearly its full 19 minutes on hardware
  configuration** — CPU thread counts, hash-table memory, browser-imposed memory caps, installing an
  external engine bridge — and states outright that none of it matters for nearly all typical use:
  "using the onboard run-of-the-mill stockfish 14 plus is plenty fine"
  (https://lichess.org/video/k4aXwk_VQVw). For a video nominally about engines and analysis, almost
  none of the runtime addresses how to interpret an evaluation to improve — it is a power-user
  configuration guide misfiled as a beginner how-to.
- **No source in this set describes tracking a recurring mistake across multiple games.** All five
  treat analysis as a single-game, one-off session; nothing here aggregates a mistake pattern that
  keeps recurring across a player's game history.

## 4. What we should copy conceptually

- **Key-moments-only navigation** — jump to flagged moves, skip forced/book/quiet ones — rather than
  defaulting to a full move-by-move slog (all three workflow videos; already the direction
  `game-review.md` §4 recommends independently for Chess.com's own Key Moments feature).
- **Guess-before-reveal at every flagged move** — the single most consistent teaching device across
  three independent sources (Chess.com's Retry, Chess Vibes' manual method, this repo's own already-
  built "Learn from your mistakes"). Keep it; the convergence across unrelated teachers is itself
  evidence it works.
- **Surface the eval delta, not just a word.** The "ignore anything under a point" heuristic
  (https://www.youtube.com/watch?v=xG7HT0PlQfQ) only works as advice if the magnitude is visible and
  legible next to the label — a bare "Mistake" tag with no visible size, as Rodell shows, misleads
  players into treating a 0.2-eval slip the same as a 3-point collapse.
- **A bounded, repeatable session** — a five-to-ten-minute unit, per Chess.com's own framing — as the
  explicit shape of the feature, not an open-ended exploration tool.
- **Keep Blunder (you made things worse) and Miss (you failed to press an advantage you already had)
  as genuinely distinct outcomes**, per Rodell's explanation, even if the badge vocabulary is
  compressed elsewhere.

## 5. What we can do better

- **Never let a label disagree with the number behind it.** Chess.com's fast-pass-then-slow-pass
  mismatch, and the resulting stale badges Rodell caught live on camera, are avoidable: commit to one
  analysis depth before a classification is ever shown, or show a visibly pending state instead of a
  label that might be wrong. (This is the same determinism risk already flagged in
  `game-review.md` §7 for Brilliant's shallow-vs-deep test — this is independent, teacher-observed
  confirmation that unreconciled passes are a real, noticed failure, not a theoretical one.)
- **Do not build a Brilliant/Great move-counter as a scoreboard.** A working teacher spent a third of
  his video telling students to stop caring about it because it measurably encourages bad decisions
  (unnecessary risk when already winning). If a "good move" signal is wanted, keep it descriptive
  (this move was Best) rather than a tallied, gamified count that rewards sacrifice-hunting.
- **Drop or clearly scope "performance rating."** It is rating-relative by construction and the
  clearest, most public source in this set says outright not to trust it. If shown at all, label it
  explicitly as relative to the player's own rating, never as a comparable number across players.
- **Put the note-taking control on the same screen as the flagged move**, not behind a mode switch —
  fixing the exact friction a real Lichess user hit on the forum.
- **Don't expose engine hardware tuning (threads/hash/depth) to ordinary users at all.** John
  Hartmann's own conclusion — that this only matters for a small minority doing serious opening prep —
  is a reason *for* Scoresheet's constraint of shipping one MIT engine with no GPL alternative and no
  configuration surface (`SPEC.md` A2, K1), not a gap to fill.

## 6. What is technically required

- A **key-moment selector**: rank moves by eval-delta magnitude and surface only the top handful, the
  same computation `game-review.md` §6 already calls for (top-N by |win% swing|); this file adds the
  requirement that the delta itself, not only the label, ships to the UI.
- A **guess-before-reveal interaction** attached to each flagged moment, reusing the already-built
  "Learn from your mistakes" plumbing (`packages/core/src/analysis.ts`,
  `apps/web/src/study-screen.ts`) rather than inventing a second mechanic.
- A **single committed analysis depth per game** before any classification is shown, so a label never
  disagrees with a re-run at higher depth mid-session.
- A **bounded session shell**: a fixed, short list of flagged moments with a visible "done" state,
  instead of an open-ended scrollable move list — the UI expression of the "five to ten minutes"
  habit these teachers describe by hand today.
- **Inline annotation on the flagged-move screen itself** — no separate mode required to leave a note,
  closing the gap the Lichess forum user hit.

## 7. What could break

- A **fixed, non-rating-aware eval-delta threshold** ("ignore anything under one pawn") will drown a
  beginner's game in flagged moments exactly as Chess Vibes' own video admits happens to lower-rated
  players — this is the same rating-aware calibration risk `game-review.md` §7 already names for the
  win-probability model; it is not a new risk but it is now independently confirmed by teaching
  material, not just inferred from Chess.com's documentation.
- An **unbounded or silently re-scored session** breaks the "short, repeatable habit" premise the
  whole workflow depends on for adoption — if flagged-move count or labels can change mid-review, the
  session stops feeling like a fixed five-minute unit.
- A **guess-before-reveal step that is skippable by default** loses the deliberate-practice effect
  every teacher relies on; if the UI defaults to showing the engine's answer immediately, the entire
  behavioural case made in §2 does not transfer.
- **Adding a vanity move-counter later**, even as a small polish item, reintroduces the exact
  behavioural harm Rodell documents from Chess.com's own users — this is a designed-in risk to guard
  against explicitly, not just an omission to avoid.

## 8. What we can uniquely do because of Nimiq

- Every teacher in this set treats the classification rule as an opaque authority to be second-guessed
  from the outside — Rodell repeatedly reasons about *why* a badge appeared rather than being told,
  and Chess.com staff have publicly declined to give Brilliant's exact criteria
  (`game-review.md` §3). Scoresheet's signed, independently-recomputable game record and versioned
  classification spec (already the direction of `game-review.md` §8) directly answers the confusion
  every video in this set spends time working around by trial and error.
- The product's own K5 plan — a paid human coach explaining a flagged moment, settled in NIM
  (`SPEC.md` K5) — is the natural next step after exactly the moment every video treats as hardest to
  self-serve: understanding why the engine actually likes an unintuitive move. Chess.com answers that
  moment with
  a canned one-line coach avatar comment (§3 above, and `game-review.md` §3's note that coach text is
  shallow); Nimiq lets that same moment be answered by a real, paid coach instead, with no card
  processor in the path.
- Feeless NIM payments make a bounded, five-to-ten-minute review session a natural unit to attach a
  small tip or pool contribution to, at a fee level that would not clear on most other chains.

## 9. Licence and reuse verdict

- **All five videos are proprietary content** owned by their uploaders (Chess.com; Chess Vibes;
  Solomon Rodell / The Chess Giant; John Hartmann / Lichess-affiliated). Only auto-generated caption
  **text** was downloaded via `yt-dlp --write-auto-subs`, never video or audio, and no full transcript
  is reproduced here — quotes are limited to one per video, each under 15 words, used for commentary
  and attributed by title and URL. This is standard fair-use-style research practice, not
  redistribution, and nothing from these videos ships in the product.
- **Chess.com Help Center articles** (https://support.chess.com/en/articles/8584089-how-does-game-review-work,
  https://support.chess.com/en/articles/8583757-how-do-i-use-game-analysis) are proprietary support
  content; summarized and paraphrased only, with short attributed quotes, consistent with the
  treatment already established for Chess.com material in this repo's `game-review.md` §9.
- **The Lichess forum thread** (https://lichess.org/forum/game-analysis/how-to-use-analysis-tool) is
  user-generated commentary on Lichess's own site; referenced only as evidence of real user confusion,
  paraphrased rather than reproduced. Lichess's own codebase is AGPL-3.0
  (https://github.com/lichess-org/lila/blob/master/LICENSE, per `game-review.md` §9) — nothing here
  touches Lichess source, only observed product behaviour and forum discussion, which carry no code
  licence at all.
- **Workflow and interaction patterns are not copyrightable** — the guess-before-reveal step, key-
  moment navigation, and bounded-session framing described here are freely reusable as design
  observations. No wording, code, taxonomy label set, or exact numeric threshold from any source is
  copied into this file or recommended for verbatim reuse; where a concrete formula is needed (e.g.
  eval-to-win% for the delta shown at each flagged move), the existing, freely reusable reference in
  this repo is Lichess's published win-percentage formula (`03-analysis/accuracy.md`), not anything
  from these five videos.
