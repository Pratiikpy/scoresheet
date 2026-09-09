# Workflow benchmark — Lichess vs. Chess.com, eight repeated user journeys

Live, hands-on benchmark of Lichess.org and Chess.com against the eight workflows a chess user
repeats constantly. Both platforms were driven live via browser automation on 2026-09-08 (Lichess:
chrome-devtools MCP, desktop 1440×900, anonymous session, account registration blocked by Cloudflare
Turnstile — a tested, real block, not a skipped step; Chess.com: Playwright MCP, desktop, anonymous
guest first, then one throwaway free account created — `ScoresheetUXResearch`, disposable email,
no real personal or payment info — to see past Chess.com's heavier signup/paywall gating). Every step
below is live-observed unless explicitly marked **documented, not live-observed** (Chess.com's
Diamond/Premium-only depth) or **NOT VERIFIED**.

## 1. What they do

### Workflow 1 — Start a game

**Lichess** (2 clicks, ~1 second wait, zero forms, no login):
1. Homepage loads with "Quick pairing" tab active: 11 preset time-control buttons + Custom, plus
   "Create lobby game" / "Challenge a friend" / "Play against computer."
2. Click a time control (e.g. "10+0 Rapid") → instantly paired anonymously vs. another anonymous
   player; board shown, "You play the white pieces / It's your turn!", ~25-30s clock to first move.
"Play against computer" is one extra step (3 total): a "Game setup" modal (variant, Real
time/Correspondence/Unlimited, Strength 1-8, Side) before the board appears.

**Chess.com** (8 actions to first move as a guest — 2 of them exist only because "Start Game" is a
two-stage button):
1. Homepage — marketing hero, no board.
2. Click **Play** (nav) → `/play`, menu of 6 modes.
3. Click **Play Online** → `/play/online`, time-control selector defaulting to "10 min (Rapid)," a
   banner ad already rendering, big **Start Game** button.
4. Click **Start Game** → modal: "What is your chess skill level?" (4 buttons) + smaller **Sign
   Up** / **Log In** / **Play as a Guest** options below.
5. Click **Play as a Guest** (skipping the skill question) → guest identity created instantly
   (`Guest0060039907`, rating 200), zero form fields, no email.
6. Click **Start Game** again → matched with another guest in 1-3 seconds, navigates to `/game/<id>`.
7. Board renders (waits for White if paired Black).
8. Make the reply move.

### Workflow 2 — Finish a game and see what happened

**Lichess**: game ends on the same screen, no navigation — result banner ("1-0 / Black resigned •
White is victorious"), a **REMATCH** button, an **ANALYSIS BOARD** link. Two buttons, no forced
upsell, no ad.

**Chess.com**: resign → confirmation popup → post-game overlay: "White Won — by resignation" (linked
explainer), Close, **Game Review** link, New/Rematch buttons, a "Remove Ads" link. The persistent
move-list sidebar already shows an inline "Analysis | Stockfish 18 Lite" toggle and, for the
registered free account, an inline mistake count ("1 Mistake · 2 Book · 0 Great") with zero extra
clicks. Clicking **Game Review** as a guest immediately returns "Daily limit reached. Get Unlimited
Game Review!" — a guest gets **zero** free full reviews, not one.

### Workflow 3 — Review one mistake in depth

**Lichess**: free tier is a **manual scrub, not a report**. Analysis board → "Computer analysis" tab
→ "REQUEST A COMPUTER ANALYSIS" as anonymous produces a hard gate: "You need an account to do that"
(Cancel / Sign In) — the full move-by-move Blunder/Mistake/Inaccuracy classification, accuracy %, and
eval graph is entirely account-gated (**NOT VERIFIED** what the logged-in free view looks like —
registration was blocked by Cloudflare Turnstile, a genuine tested block). What is free: a local
in-browser NNUE engine (Stockfish 19), off by default, that must be manually toggled on, after which
the user clicks through moves one at a time reading raw centipawn deltas and the suggested reply line
themselves — no automatic tag, no plain-language reason, ever, at the anonymous tier.

**Chess.com**: as a guest, "Game Review" is a straight paywall — "Daily limit reached. Get Unlimited
Game Review!" with a "Try for ₹0.00" CTA. As the registered free account (via a deliberately blundered
bot game), Game Review loads a full page: eval graph, Accuracy score (both players), a 10-category
move-classification grid (Brilliant/Great/Book/Best/Excellent/Good/Inaccuracy/Mistake/Miss/Blunder),
Game Rating, and Opening/Tactics/Strategy/Endgame tabs — genuinely automated, unlike Lichess's free
tier. **Start Review** steps move-by-move with a classification + eval header per move; each flagged
move exposes **"Explain"** and **"Best"** buttons. "Best" works (replays the engine line, "Resume" to
return). **"Explain" — the AI-narrated why-was-this-bad feature — hung indefinitely** on live test
(20+ seconds, header stuck on "Explaining," zero network request ever fired; reproduced on reload). Per
`support.chess.com/en/articles/8584089` (**documented, not live-observed**): "Free members can still
use Game Review to see key insights... unlimited Game Review and some advanced analysis features
require a Premium membership... Diamond members also have access to... Deep and Maximum" engine depth.

### Workflow 4 — Solve a puzzle

**Lichess**: `/training` from nav → a puzzle is already loaded, zero clicks. Shown: puzzle ID,
rating (hidden until your first attempt, then reveals a real number), "Played N times," a citation to
the source game and both players' ratings, theme tags, a "jump to next puzzle immediately" toggle.
Wrong move → immediate feedback, rating instantly revealed, Hint/Solution buttons appear. Hint
highlights the correct piece and all legal destinations (still requires picking the right square).
Give up → solution plays out with per-move check/cross marks, ends "Puzzle complete!" plus theme tags
and a **CONTINUE TRAINING** button. Whether the next click reliably serves a genuinely new puzzle
(vs. reloading the same one) was **only partially verified** in this session.

**Chess.com**: `Puzzles` nav → **two near-identical first-time intro modals shown seconds apart**
("Puzzles — Train with chess puzzles..." then, on the very next page, "Chess Puzzles — Train with
chess puzzles and improve your game...") before a puzzle position finally loads. Solve → "You
Completed Level 1!" with Retry / Analysis / Next Puzzle buttons plus comment/download/share icons.

### Workflow 5 — Find what to work on next

**Lichess**: `/training/themes` (no login) is a large, free, well-organized taxonomy — Phases,
openings, 15 tactical motifs, 12 advanced tactics, mate-in-N, 20 named mate patterns, goals, lengths,
origin filters — each with a live solve-count. This answers "what should I practice" only if the user
already knows their weakness. The actual **auto-diagnosis** feature does not work for anonymous
users and fails in three inconsistent ways: sidebar links "Puzzle Dashboard"/"Improvement areas"/
"Strengths" look clickable but the in-app link hard-redirects to `/signup` with no explanation;
direct navigation to `/training/dashboard` silently swaps in an unrelated random puzzle with no error
message at all.

**Chess.com**: surfaced in three places. `/home` dashboard shows Play/Puzzle/Lesson cards, a
next-lesson pointer, game history with an Accuracy column, and a stats sidebar. `/learn` shows a
linear skill-tree course with a "Next Lesson" pointer (a course position, not a computed rank).
`/stats/<username>` shows a mostly-empty table for a new account (openings/tactics/strategy/endgame
columns) with an "Upgrade for Advanced Stats" CTA placed more prominently than any indication of what
the free tier eventually shows. The Diamond-gated `/insights/<username>` page **redirects a non-Diamond
account to `/insights/hikaru`**, a celebrity demo profile, with only a small "Demo Profile: Hikaru"
label distinguishing it from the user's own data; the demo itself is genuinely rich (accuracy trend by
year, accuracy by move number, results by opponent rating, game phases, top-10 openings performance) —
**that page's content is documented from a live celebrity demo, not from a paid own-account view.** A
banner on that page notes Insights is being replaced by "Advanced Stats" at year-end.

### Workflow 6 — Look up an opening

**Lichess**: `/analysis`, play 1.e4 → the sidebar auto-populates a WikiBook article with zero clicks:
structured prose under headings ("Control d4," "Attack e4," "Support d5," "Relinquish the centre,"
"Rare responses") naming and evaluating the real replies, including flagging outright bad tries. The
interactive win/draw/loss opening-explorer table is gated: "You need an account to do that" (same
modal pattern as Workflow 3).

**Chess.com**: `/openings` shows yet another first-time intro modal (the fourth distinct one hit this
session, after Play/Puzzles/Puzzles-rated), then a genuinely rich free landing page — lesson cards,
a Popular Openings grid, Explore Openings, a mini win/draw/loss-by-first-move table capped by
"Upgrade to See More Data." Clicking into an individual opening (Sicilian Defense) gives description
text, an embedded lesson, a full annotated notable game, a top-players list, a popularity-by-decade
chart, and a move-tree stats table also capped by the same upgrade CTA. `/analysis/explorer` is fully
free at the starting position: live Stockfish eval lines and an "All Chess.com Games" breakdown by
first move with eval/win%/game-count.

### Workflow 7 — Enter a tournament

**Lichess**: `/tournament` is a dense hour-by-hour schedule. Every arena checked — including the
rating-capped "beginner" bracket — requires a **minimum count of already-played rated games in that
exact variant** (15-20 games) before joining is even possible; a brand-new account (0 games) is
mathematically locked out of every rated arena on day one, full stop. The join button for anonymous
users is just "SIGN IN."

**Chess.com**: `/play/online/tournaments` shows a dense real-time list (Arena and Swiss, dozens of
themed events scheduled a week out) with a **Join** button per row. Clicking Join on a live arena
navigates straight to the live standings page — but registering is **blocked by a hard, undisclosed
prerequisite**: a toast reading "You haven't played enough Rapid games to enter this tournament —
Games played: 0 of 5," with the 5-game minimum stated nowhere on the tournament list or Join button
before the click, only surfaced as a rejection afterward.

### Workflow 8 — Share or prove a result

**Lichess**: analysis board → "Share & export" tab, no login needed. FEN (copyable), Image (GIF
download of the full game, or a static position screenshot, both copyable/downloadable), Share
(iframe embed code + a plain shareable link), PGN (annotated or raw download, plus an inline text
preview). Six distinct proof/share mechanisms, one tab away, entirely free.

**Chess.com**: Game Review page → **Share** button opens a modal with a copyable share link, four
tabs (PGN / Image / Gif / Embed), and an always-visible FEN field. PGN tab includes full headers
(Event/Site/Date/players+Elo/Result/ECO-linked opening/termination/timestamps) plus 3 include-toggles
and a Download button; Image tab generates a downloadable board-position PNG instantly. Elsewhere on
the toolbar: Add to Collection, Add to Favorites, Classroom, Self Analysis. Entirely free — no
paywall was hit anywhere in the share flow.

## 2. Why it works

- **Lichess's Workflow 1 (2 clicks, no forms) is close to the theoretical floor for "start a game"**
  — it works because anonymous play is a first-class citizen of the product, not a stripped-down
  fallback; Chess.com's guest path exists but is buried below a skill-level question and a Sign
  Up-first visual hierarchy, so it works despite the design, not because of it.
- **Chess.com's inline post-game mistake count (Workflow 2) and automated 10-category classification
  (Workflow 3, registered free tier) work because they compress a full engine trace into an
  immediately legible verdict with zero extra clicks** — this is a genuinely better first-glance
  product than Lichess's free tier, which requires the user to manually opt in to even seeing an eval
  number.
- **Lichess's zero-click opening theory (Workflow 6) works because it reuses an existing, freely
  licensed corpus (a WikiBook)** rather than building bespoke prose — cheap to maintain, immediately
  useful, no account required.
- **Chess.com's tournament ecosystem density (Workflow 7) works because of scale** — "dozens of themed
  events scheduled a week out" is a network-effect result neither Lichess's format nor a new entrant
  can manufacture without a comparably large existing user base.
- **Both platforms' free, no-login share/export tooling (Workflow 8) works because it costs the
  platform almost nothing (a PGN string, a rendered board image) while being exactly what a player
  wants immediately after a game** — neither platform gates the cheapest, highest-goodwill feature in
  the whole set.

## 3. What they do badly

**Lichess — consolidated punch list:**
1. Three "insight" features (computer analysis, opening explorer, puzzle dashboard) are entirely
   account-gated, with **three different, inconsistent failure UIs** — an explicit modal for two of
   them, a silent redirect for the third, and a silent puzzle-substitution on direct URL access with
   zero error message.
2. The single most valuable "why was this move bad" feature has **no automated verdict at all** for
   an anonymous user — a hidden, off-by-default engine toggle and manual move-by-move scrubbing.
3. Every rated tournament — including the beginner-rating-capped bracket — requires 15-20 already-
   played rated games in that exact variant, locking out every brand-new account on day one, no
   exceptions found.
4. Resign is a silent two-stage confirm with a soft timeout and zero on-screen instruction — easy to
   fumble, impossible to do with one deliberate click.
5. Homepage tab state (Quick pairing vs. Lobby) silently persists across navigation with no visual
   explanation for why the obvious quick-pairing buttons vanished.
6. No requeue safety net for an anonymous quick-pairing opponent who aborts before move 1 — happened
   twice in one session, dumping the user on a dead "REMATCH (disabled)" screen.
7. Registration itself is bot-gated hard enough (Cloudflare Turnstile) to block a real browser session
   outright — a genuine, tested friction point for a real user, not just automation.
8. Puzzle Dashboard/Improvement areas/Strengths sidebar links render identically to freely-clickable
   items, no lock icon or "sign in required" badge — the gate is only discovered after clicking.

**Chess.com — consolidated punch list:**
1. "Start Game" is a two-stage button whose first click only opens a chooser that also asks an
   unnecessary skill-level question before the guest option is even visible.
2. **Four separate, near-duplicate first-visit "Ok" intro modals** hit in one session (`/play`,
   `/puzzles`, `/puzzles/rated` seconds later with nearly identical text, `/openings`) — no
   persistent "don't show me this again."
3. Guests get **zero** free Game Reviews — the very first click on "Game Review" as a guest reads
   "Daily limit reached," misleading copy since there was no prior use to hit a limit against.
4. **The "Explain" AI-move-explanation feature silently hangs forever** for a free member — no
   completion, no error, no upgrade CTA, zero network request fired — strictly worse than an honest
   paywall, which every *other* gated feature on the site shows correctly.
5. Insights isn't shown for your own data on the free tier at all — it silently redirects to a
   celebrity demo profile with only a small label distinguishing it from your own stats; a user could
   easily miss that distinction.
6. Tournament entry prerequisites (5 rated games minimum) are undisclosed until after a rejected Join
   attempt — nowhere on the tournament list, detail page, or Join button itself.
7. The Stats page shows an almost entirely empty table for a new account, with the upgrade CTA more
   prominent than any indication of what the free tier will show once games are played.
8. Ad density is real and constant across nearly every screen tested for guest and free-registered
   users, including mid-analysis and post-game screens.

## 4. What we should copy conceptually

- **Lichess's 2-click, zero-form anonymous start** (Workflow 1) is the target step count for
  Scoresheet's own "start a game" — no skill-level question, no signup gate before the first move.
- **Chess.com's zero-click inline mistake count** ("1 Mistake · 2 Book · 0 Great" shown automatically
  on the post-game screen, Workflow 2) — surfacing a verdict without a click is strictly better than
  requiring navigation to a separate review page to learn anything at all.
- **Chess.com's honest paywall pattern, minus the one broken instance**: every gated feature except
  "Explain" shows a clear, immediate "Upgrade" CTA rather than a silent failure — copy this discipline
  exactly, including for features that are simply *not built yet* rather than paywalled.
- **Lichess's zero-click, reused-corpus opening theory** (Workflow 6) — don't build bespoke opening
  prose from scratch if a freely licensed corpus (Lichess's own `chess-openings`, CC0, per
  `01-platforms/lichess.md` §9) already exists.
- **Both platforms' completely free, comprehensive share/export tooling** (Workflow 8, PGN/FEN/
  image/link with zero login and zero paywall) — this is the cheapest, highest-goodwill feature
  surveyed across all 8 workflows on both platforms and should be free from day one for Scoresheet
  too, doubly so since it's the workflow Nimiq turns into something categorically better (§8).
- **Lichess's puzzle theme taxonomy** (Workflow 5) — a large, browsable, honestly-labeled set of named
  tactical/positional categories is worth having even before any auto-diagnosis feature exists,
  because it gives a self-directed user something real to act on immediately.

## 5. What we can do better

Every gap documented in §3 across both platforms is an opportunity; the sharpest, most concrete ones:

- **Workflow 3 (review one mistake) is the single biggest opening on both platforms simultaneously.**
  Lichess's free tier gives zero automated verdict; Chess.com's free tier gives a real classification
  grid but its actual *explanation* feature is broken (hangs forever, no error). A small, focused app
  that reliably auto-flags the single worst move of a free/anonymous game with one correct, working,
  plain-language reason — every time, no silent failure — beats both incumbents' free tiers outright,
  and does so with less code than either platform's full Game Review/computer-analysis stack.
- **Workflow 5 (find what to work on next) is gated or broken on both platforms for anyone who isn't
  paying or isn't logged in.** Lichess's dashboard link redirects to signup or silently substitutes a
  random puzzle; Chess.com's redirects a free user to someone else's data. A lightweight, always-on
  "here's your one weak spot" signal — even something as simple as "you blunder most in the endgame"
  computed from a handful of signed games — beats both without needing either platform's full
  analytics stack.
- **Workflow 7 (enter a tournament) locks out every brand-new user on both platforms**, just via
  different mechanisms (Lichess: an unconditional 15-20-game minimum on every arena, including
  beginner brackets; Chess.com: an undisclosed 5-game minimum surfaced only after a rejected click). A
  smaller app has room to design a first-tournament path that doesn't reject a day-one user at all, or
  that discloses the requirement before the click rather than after.

### Where a small app can beat a large one

The pattern across all 8 workflows is consistent: **incumbent friction is concentrated in exactly the
moments where the incumbent has a business reason not to fix it** — a paywall (Workflow 3, 5), an
anti-sandbagging gate that was never designed around a first-time user (Workflow 7), or an onboarding
flow padded with upsell/skill-level questions that serve acquisition metrics, not the player
(Workflow 1). None of these frictions exist because the problem is hard to solve — Lichess's own
free-tier eval toggle and Chess.com's own inline mistake count prove the underlying mechanism is
cheap; the gates are business decisions, not technical ones. A small, focused app with no subscription
tier to protect and no ad-inventory incentive to pad onboarding has no structural reason to reproduce
any of these eight frictions, and every one it avoids is a direct, demonstrable advantage over both
incumbents on the exact workflow a real user repeats most often. The two clearest wins are Workflow 3
(an always-free, always-working, one-mistake-explained flow) and Workflow 8 (see §8 — this is the one
workflow where the advantage isn't just "avoid the friction," it's "offer something neither incumbent
can structurally build at all").

## 6. What is technically required

- **Workflow 1 parity**: anonymous-first play, no account gate before the first move, matching
  Lichess's 2-click floor — this is a matchmaking/queue design decision, not new infrastructure.
- **Workflow 2/3 differentiation**: automated post-game move classification (already required for the
  core rating product) surfaced with zero extra navigation, plus one always-correct, always-working
  natural-language explanation of the single worst move — reusing the same engine call already run for
  classification, with a small template layer in the DecodeChess style (see `platforms-matrix.md` §6)
  rather than a fragile black-box call that can silently hang the way Chess.com's "Explain" does.
- **Workflow 4/5 parity**: a puzzle-vs-solver rating (see `platforms-matrix.md` §6 for the
  Glicko-1/Glicko-2 note) plus a lightweight weakness-tagging pass over a user's own game history —
  no need to match either platform's full scale, just to have *something* that works for every user
  from game one, unlike both incumbents' gated equivalents.
- **Workflow 6 parity**: reuse `lichess-org/chess-openings` (CC0, confirmed freely reusable per
  `01-platforms/lichess.md` §9) rather than building an opening-name/theory corpus from scratch.
  A win/loss statistics explorer requires either bootstrapping from Lichess's public data dumps (per
  the same file, §7) or accepting a materially smaller initial dataset than either incumbent.
  **NOT VERIFIED**: whether a small app's own game volume could ever produce statistically meaningful
  win/draw/loss rates per opening at launch — flag as a real cold-start problem, not solved by this
  research.
- **Workflow 7**: a first-tournament design that either has no minimum-games gate or discloses one
  clearly before the join click — a UX/rules decision, no new subsystem.
  **Workflow 8**: already the core Scoresheet primitive (signed scoresheet + a shareable link/export)
  — see §8, this workflow needs the least new technical work of all eight because it's closest to the
  product's actual differentiator.

## 7. What could break

- **A "one worst move, one working explanation" feature that fails silently (like Chess.com's
  "Explain") is worse than not having the feature at all** — the implementation must fail loudly
  (a clear "try again" or "unavailable" state) rather than hanging, given this exact failure mode was
  caught live on a major competitor during this research.
- **Removing every tournament entry-games-minimum (to beat both incumbents' Workflow 7 friction) risks
  reintroducing the sandbagging/rating-manipulation problem those minimums exist to prevent** — both
  Lichess and Chess.com's gates are almost certainly anti-abuse measures, not accidental friction; any
  redesign needs its own anti-sandbagging mechanism, not just the removal of theirs.
- **A lightweight weakness-tagging feature built cheaply enough to be free for everyone risks being
  too shallow to be useful** — Aimchess's six-dimension model and Chess.com's Insights both required
  real engineering investment to be worth using; "always free" and "actually useful" are in tension
  and need real product validation, not just a lower bar than the incumbents' paywalled tiers.
- **A smaller opening-theory dataset (Workflow 6) than either incumbent's multi-billion-game corpus is
  a real, unresolved cold-start problem** (§6) — a small app's own win/loss statistics will be
  statistically noisy at launch regardless of UX quality.

## 8. What we can uniquely do because of Nimiq

**Workflow 8 (share or prove a result) is where a Nimiq-anchored product is categorically different,
not just less-friction.** Both Lichess and Chess.com's export tooling (PGN, FEN, image, embed, link)
proves what a game *looked like* — none of it proves the record hasn't been edited, that both players
actually agreed to the result, or that anything about it is independently checkable without trusting
the platform's own server. A signed, two-party scoresheet with a public recompute path (per
`01-platforms/lichess.md` §5, §8) turns "share a link to my game" into "hand someone cryptographic
proof of exactly what happened, checkable without logging into anything, without trusting Scoresheet's
own servers, and without the platform being able to quietly edit the record after the fact" — a
strictly stronger claim than anything either incumbent's export feature makes, on the one workflow
every chess platform already treats as free and important.

This also folds directly into **Workflow 2/3**: if the analysis that produces "1 Mistake" or "your
worst move was 14...Nd4" is run at a published, fixed engine version/depth and tied to the same signed
record, the "share or prove a result" workflow and the "review one mistake" workflow become the same
underlying artifact — a signed game plus a recomputable analysis — rather than two separate features
built on two separate trust models the way they are on both incumbents today.

## 9. Licence and reuse verdict

Nothing in this file concerns source code or licensed assets — it documents **observed UX behavior**
on two live, closed-source products (Lichess's frontend/backend code is AGPL/GPL per
`01-platforms/lichess.md` §9 and was not read or copied for this research; Chess.com is fully
closed-source SaaS per `01-platforms/chess-com.md` §9). The workflows and step counts recorded here
are factual observations of public product behavior, not copyrightable expression, and carry no reuse
restriction of their own — but no UI, copy, animation, or interaction code from either platform was
read with intent to reproduce, consistent with the "observed behaviour" tier (tier 3) of the reuse
ordering in `chess/SPEC.md` Part L. Any concrete implementation inspired by a pattern documented here
(e.g. Lichess's opening-explorer UI shape, Chess.com's Game Review layout) should be built from this
written description and independent design, never from reading either platform's source.
