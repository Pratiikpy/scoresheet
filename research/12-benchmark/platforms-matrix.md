# Platform matrix — the ten products Lichess/Chess.com research doesn't cover

Scope: ChessKid, Chessable, Chess24, ChessBase, Fritz/Hiarcs (the desktop-engine-product lineage
ChessBase owns/distributes), ChessTempo, Chessify, Aimchess, DecodeChess, and the Skillz-hosted
real-money chess apps (Chess Payday, Chess for Cash, Dark Chess Tournament). `research/01-platforms/
lichess.md` and `chess-com.md`, and `research/10-ideas/chess-for-money.md`, are read and not repeated
here except where this pass found new facts they lacked.

All fetch dates below are **2026-09-08** unless stated otherwise. Sources gathered via nine parallel
research passes (WebSearch/WebFetch plus, for Skillz, direct SEC EDGAR/GitHub/App-Store API calls).
Every claim carries a source or is marked **NOT VERIFIED**.

## 1. What they do

### ChessKid
Kids' chess platform (under-13, per its own positioning), a Chess.com subsidiary. Live multiplayer
vs. other kids, graduated-difficulty bots, 150+ interactive lessons, 350,000+ tactics puzzles,
titled-instructor video lessons, parent/teacher activity reports, classroom tools used by 2,000+
schools, 30+ languages, and CONIC — a USCF-recognized kids-only national championship run annually
since at least 2012. Source: chesskid.com homepage; App Store listing "Chess for Kids: Learn to
Play" (https://apps.apple.com/us/app/chess-for-kids-learn-to-play/id629375826); Wikipedia, Chess.com
article §ChessKid.com (raw wikitext, fetched 2026-09-08).

### Chessable
A marketplace of GM/titled-author opening, tactics, and endgame courses paired with **MoveTrainer®**,
a proprietary spaced-repetition drilling engine that tracks per-line recall strength over time.
"Trusted by over 2 million players," per its own App Store copy. April 2026 added **Chessable
Repertoire** — pulling individual chapters/variations out of separately-purchased courses into one
merged, editable personal repertoire. Source: App Store "Chessable: Study Chess Smarter"
(https://apps.apple.com/us/app/chessable-study-chess-smarter/id1523279049); Chess.com news, "Announcing
Chessable Repertoire," 14 Apr 2026 (https://www.chess.com/news/view/announcing-chessable-repertoire).

### Chess24
**Defunct.** Founded 2014 (Jan Gustafsson, Enrique Guzman); online play, premium Stockfish analysis,
GM-commentated live tournament broadcasts (Yasser Seirawan, Tania Sachdev), Banter Blitz Cup, Magnus
Carlsen Invitational. Merged into Play Magnus AS March 2019; Play Magnus Group acquired by Chess.com
2022; **shut down 31 January 2024**, domain now 301-redirects to chess.com/events (live-tested
2026-09-08). No app exists in the iTunes catalog (0 results for "chess24," iTunes Search API, fetched
2026-09-08). Source: Wikipedia, Chess24 (https://en.wikipedia.org/wiki/Chess24).

### ChessBase
German (Hamburg) database/publishing company, founded 1986 by Frederic Friedel (idea from a 1985
conversation with Garry Kasparov), first shipped Feb 1987. Core product: the CBH game-database
format with deep pattern/structure/novelty search, opponent-prep "Style Report" tooling; also runs
ChessBase News (a major chess-media outlet), ChessBase Magazine, the Playchess server, and regional
arms (ChessBase India, 2.5M+ YouTube subscribers as of Dec 2024). Source: Wikipedia, ChessBase
(https://en.wikipedia.org/wiki/ChessBase); en.chessbase.com homepage, fetched 2026-09-08.

### Fritz / Hiarcs (desktop-engine lineage)
**Fritz**: ChessBase's flagship consumer engine-GUI, commissioned 1991 from Frans Morsch, sold as a
"personal chess coach" with named-personality sparring opponents (Capablanca/Tal/Kasparov styles),
not as a raw-strength product. Desktop-only — no standalone iOS app exists (only the unrelated kids
product "Fritz & Chesster"). **Hiarcs**: an independently-developed engine (Mark Uniacke, written
1980, commercialized 1991) that ChessBase licenses/bundles (e.g. into Pocket Fritz) but which is sold
as its own consumer line via hiarcs.com, positioned on "human-like" play rather than head-to-head Elo
against Stockfish/Leela — its own marketing never compares itself to either. Source: shop.chessbase.com
product pages; Wikipedia, HIARCS (https://en.wikipedia.org/wiki/HIARCS); hiarcs.com, fetched
2026-09-08.

### ChessTempo
Dedicated tactics/puzzle-training platform (110,000+ tactics problems, 12,000 endgame problems) plus
an endgame/opening trainer, live/correspondence play, analysis board, and historical game database.
Puzzle rating system modeled explicitly on the defunct Chess Tactics Server: solver and puzzle both
carry a Glicko-1 rating, updated as though the solve were a game, with a time-weighted "Blitz" scoring
mode and user-selectable difficulty offset (Easy/Medium/Hard = rating−200/−100/+0). Native Woodpecker
Method looping trainer and opt-in spaced repetition. Source: chesstempo.com/faq.html, fetched
2026-09-08 (official Q&A, links directly to Glickman's Glicko-1 paper).

### Chessify
Cloud chess-engine-as-a-service: rents Stockfish (NNUE + classical), Leela Chess Zero (GPU), and 9
other engines on dedicated cloud hardware from a browser, or as a plugin inside ChessBase, Fritz,
HIARCS, and SCID. Up to "1 Billion NPS" on its top dedicated tier (1024 threads); GM ambassadors
(Fabiano Caruana, Anish Giri, Levon Aronian) cited on its own marketing. Source: chessify.me
homepage and live billing API (https://chessify.me/billing/products), fetched 2026-09-08.

### Aimchess
Chess-improvement analytics/training platform, currently owned by **Chess.com** (via the Play Magnus
Group acquisition chain — PMG acquired Aimchess May 2021; Chess.com acquired PMG, deal closed 16 Dec
2022), confirmed at the product level: both App Store and Google Play list the developer as
"Chess.com." Analyzes a connected Chess.com/Lichess/Chess24 account's game history across six named
competency dimensions (Tactics, Endgame, Advantage capitalization, Resourcefulness, Time management,
Opening performance), then auto-generates a weekly Study Plan and routes the user into 13 named
trainer modes built substantially from the user's own missed positions. Source: aimchess.com; App
Store/Google Play developer field, fetched 2026-09-08; MarketScreener acquisition announcement
(https://www.marketscreener.com/quote/stock/PLAY-MAGNUS-AS-113534507/news/...-33285392/).

### DecodeChess
Web-based chess-analysis tool ("the first AI chess tutor") built by Decodea LTD (Tel Aviv, 2–10
employees), explaining engine moves in structured natural language rather than a bare eval number.
Two modes: "Decode Game" (per-move) and "Deep Decode" (5 tabs — Summary/Piece Roles/Threats/Good
Moves/Plans/Concepts), the Threats tab carrying a live before/after toggle. Targets players ≤2000
ELO; endorsed on its own homepage by GM Anish Giri, GM Boris Gelfand, and former US Champion GM Sam
Shankland, who produced a full review series analyzing Carlsen–Nepomniachtchi World Championship
games with the tool. Source: web.archive.org snapshot of decodechess.com (2026-08-25, essentially
current — live site returned inconsistent access during research), fetched via Wayback 2026-09-08.

### Skillz real-money chess apps
Three confirmed live titles hosted on the Skillz platform, all fetched 2026-09-08: **Chess Payday**
(4.22/5, 204 ratings), **Chess for Cash** (4.36/5, 87 ratings), and a newly-identified third title,
**Dark Chess Tournament** (a "Fog of War" variant, 4.70/5, 44 ratings, same publisher — Tall Troll
Games — as Chess for Cash). A fourth app named in earlier research, "Real Money Chess Prizes," could
**not** be located under that exact name on either the iOS or Android store after an exhaustive
search (exact-term and broadened-term queries against Apple's own iTunes Search API and Google Play
search) — **NOT VERIFIED** that it currently exists; it may be delisted, renamed, or the name was
imprecise in the earlier research. Corporate parent Skillz Inc. renamed to **Firy Inc.** (NYSE:
FIRY) around June 2026, confirmed via SEC EDGAR (CIK 0001801661); still filing normal quarterly
reports, paid down $80M of secured notes in August 2026, won a $42.9M patent judgment against
AviaGames (Feb 2024), and acquired Beamable (a game-backend platform) in January 2026 — i.e. still
operating, not in distress. Source: SEC EDGAR filing index
(https://www.sec.gov/Archives/edgar/data/1801661/000180166126000084/); Wikipedia, Skillz (company)
(https://en.wikipedia.org/wiki/Skillz_(company)).

## 2. Why it works

### ChessKid
The child-safety architecture is a genuinely separate build, not a toggle on the adult product — no
free-text chat, auto-generated usernames, zero ads — which is the credible signal a parent or school
administrator actually needs before trusting a platform with a child's account, and the school/
classroom tooling gives it an institutional sales channel (2,000+ schools) that a consumer chess site
cannot easily replicate.

### Chessable
Course-plus-spaced-repetition is a proven pedagogy pairing (the same mechanism Anki and language apps
use): a titled author supplies the "what to learn," MoveTrainer supplies the "when to review it
again," and Chessable Repertoire (Apr 2026) fixes the natural failure mode of a course-marketplace
model — a player who likes course A's Ruy Lopez chapter and course B's Caro-Kann chapter no longer
has to choose one or duplicate work by hand.

### Chess24
Worked, while alive, because it converted chess into spectator media — professional commentary talent
turned live tournaments into a watchable product distinct from "play a game yourself," which is a
different demand than either Lichess or Chess.com primarily serve. Source: Wikipedia, Chess24.

### ChessBase
Works because deep, structured search over your *own* accumulated database of games (by pattern,
structure, ending type, novelty) is a genuinely different product than a cloud account's basic search
— it is a professional's tool, and titled players/coaches who need serious opponent prep have no free
equivalent that matches its depth.

### Fritz / Hiarcs
Works by selling something Lichess/Chess.com structurally cannot: owned, offline, no-account software.
Fritz layers a coaching/personality frame onto that (named-opponent sparring) rather than competing on
raw engine strength it can't credibly claim against Stockfish; Hiarcs leans on multi-decade "human-like
play" pedigree (a 4x World Computer Chess Championship engine) and a genuinely well-reviewed, flat
one-time-purchase mobile app.

### ChessTempo
The time-weighted Blitz scoring mode is a real design insight: penalizing slow post-move deliberation
more than pre-move thinking specifically discourages guess-and-check solving, which a plain rating
system doesn't. Combined with a user-tunable difficulty offset and 3-way partial-credit grading, it
rewards a more honest kind of practice than a binary correct/incorrect puzzle stream.

### Chessify
Works because it sells the one thing neither free platform can give away: dedicated, user-selectable
compute at prices ($7.99–$120+/mo, or metered by the minute) that make sense for a coach or serious
player who wants materially deeper analysis than shared community infrastructure can offer, plus a
plugin path into desktop software (ChessBase/Fritz/HIARCS/SCID) that a pure web product can't reach.

### Aimchess
Works on the same mechanism that makes puzzle-of-the-day retention work generally — a weekly,
auto-generated study plan gives a reason to return — but goes further than Lichess's Insights or
Chess.com's Game Review by routing the user directly into trainer modules built from their *own*
missed positions, closing the loop from diagnosis to practice inside one product rather than leaving
the user to self-direct.

### DecodeChess
Works, where it works, because "why is this move good" answered with verified discrete claims (this
move threatens X, guards Y, vacates Z) is a genuinely different cognitive product than a raw eval
number — and real, credentialed GM endorsement (Giri, Gelfand, Shankland) gives an indie product
social proof most competitors in this space never earn.

### Skillz real-money chess apps
Automatic matchmaking removes the single biggest friction for a casual player moving from "curious"
to "playing for something" — no opponent search of your own, no manual escrow negotiation, the
platform pools and settles automatically. This is genuinely the correct mechanic even though
everything downstream of it (custody, payout) is where these apps fail (§3).

## 3. What they do badly

### ChessKid
Trustpilot: **1.5/5, 37 reviews, 73% one-star** (https://www.trustpilot.com/review/chesskid.com,
fetched 2026-09-08). Documented, repeated complaints: unresponsive support, auto-renewal/cancellation
friction, login/password-reset failures, a "pay-to-win" puzzle-failure-credit mechanic gated behind
Gold membership, and — the most serious for a platform positioned as a kids' safe space — user reports
that the site is "filled with adults cheating instead of kids trying to learn chess." Small sample
(n=37); directional, not a robust satisfaction statistic. No COPPA/kidSAFE/PRIVO certification badge
could be located on any reachable page — **NOT VERIFIED** either way.

### Chessable
Trustpilot: **2.5/5, 10 reviews** (very small sample, https://www.trustpilot.com/review/chessable.com,
fetched 2026-09-08). Documented complaints: unresponsive support, website crashes locking users out of
paid content, non-functioning gift-card/promo redemption, and — the most substantive — reports of
**previously-free courses being converted to paid-only for existing users**, i.e. retroactive
paywalling of content users expected to keep.

### Chess24
It no longer exists — the ultimate weakness. Even while alive, a 2020 review cited by Wikipedia
flagged its playing interface as less polished than Chess.com/Lichess.

### ChessBase
Trustpilot: **2.0/5, 15 reviews, only 2 in the last 12 months** — a shrinking, disengaged review base
(https://www.trustpilot.com/review/chessbase.com, fetched 2026-09-08). Direct quotes: "full of bugs
that make it almost impossible to use," "terrible usability — almost nothing is intuitively clear,"
"support does not respond," and reviewers explicitly calling the pricing "expensive for aging software,
particularly given the competition from free alternatives like Stockfish." Mobile app underperforms
badly (2.7–2.9★, see §6 in the app-store table below) relative even to Hiarcs's independently-developed
mobile app.

### Fritz / Hiarcs
Fritz has no serious standalone mobile presence at all — a real gap in a mobile-first market. Both
engines avoid direct strength comparison to Stockfish/Leela in their own marketing (Hiarcs 15 claims
"3450 Elo" against engines now running north of 3600), which is itself an implicit admission they no
longer compete on raw strength. And the lineage carries a real, adjudicated legal blemish: see §9.

### ChessTempo
iOS app is stale — version 4.4.1, last updated 2025-03-10 (18 months before this research), 4.03★
from only 112 ratings. No Trustpilot presence at all. The live site itself is defended by aggressive
Cloudflare bot-challenges that intermittently block even normal page loads — a rough, dated-infra
signal. Source: iTunes Search API and direct site access attempts, fetched 2026-09-08.

### Chessify
Android app quality collapsed after a redesign — 3.23/5 from **7,181 ratings**, vs. iOS's 4.42/5 from
just 396 — with direct quoted complaints: "the last update, where they changed the whole app, is so
bad I have to write this," "new interface is atrocious... layers of popups that can't be closed."
Trustpilot (4.1/5, 63 reviews) separately flags an undisclosed server inactivity timeout on paid tiers
and difficulty cancelling a subscription. Source: Google Play page and Trustpilot, both fetched
2026-09-08.

### Aimchess
The one detailed independent review found (Chess.com's own blog, Sept 2023) names cost (~$15/mo at
the time) and historical reliability bugs (unexpected logouts, puzzle malfunctions) as real negatives.
More structurally: **Aimchess has never published a methodology, formula, or engine disclosure for
any of its six competency dimensions**, despite an exhaustive search of its own site, both app-store
listings, and the only detailed third-party review available — this absence, verified positively (not
merely unsearched), is the single most relevant weakness for this research: it is the closest thing to
a "chess intelligence profile" on the market, and it is completely opaque about how any of its numbers
are derived. Its app-store footprint is also modest for a Chess.com-owned product — 100K+ Android
installs, under 200 US iOS ratings.

### DecodeChess
Two real, documented weaknesses, sourced from unfiltered comments on DecodeChess's own YouTube videos
(Reddit was inaccessible during research): (a) explanation-accuracy complaints caught in the wild —
"the AI is just blatantly wrong... horribly explained" on the company's own product-update video; (b)
multi-year stagnation — its YouTube channel and blog have both been frozen since April 2023, its
engine is still Stockfish 12 NNUE (dated ~2022) with no upgrade in years, and multiple 2025-2026
viewer comments report unresponsive support and a broken demo, though the Android app itself received
an update on 2026-08-31, so the product is not fully abandoned. Android rating: 2.9/5, 277 reviews
(fetched 2026-09-08). No iOS app exists.

### Skillz real-money chess apps
Custody, opacity, and account-ownership failure modes are already fully documented in
`research/10-ideas/chess-for-money.md` §3 with a full BBB/Trustpilot/App-Store-review evidence table
and are not repeated here. New in this pass: **India's Promotion and Regulation of Online Gaming Act,
2025** (presidential assent 22 Aug 2025, rules notified 22 Apr 2026) **outlawed all real-money online
games** in India outright — not just chance-based ones. Dream11 (fantasy sports, a skill-format
product) paused all paid contests, described as over 90% of its revenue. Consistent with this,
**GetMega**'s domain now resolves with a mismatched TLS certificate (effectively dead) and **WinZO**'s
current Play Store listing has pivoted entirely to "Dramas, Social Games" with zero chess or
real-money framing — both apparent casualties of the same regulatory shift. Source: Wikipedia,
Promotion and Regulation of Online Gaming Act, 2025
(https://en.wikipedia.org/wiki/Promotion_and_Regulation_of_Online_Gaming_Act,_2025); Play Store
listing for WinZO, fetched 2026-09-08.

## 4. What we should copy conceptually

- **ChessKid**: a genuinely separate, purpose-built surface for a distinct trust requirement (child
  safety) rather than a settings toggle on the main product — the lesson generalizes to any trust-
  sensitive user segment.
- **Chessable**: pairing content with a formal retention mechanism (spaced repetition), and — from
  Chessable Repertoire — letting a user merge/own a personal working set assembled from multiple
  sources rather than being locked into one author's structure.
- **ChessBase**: a personally-owned, deeply searchable record of your own games as the product's
  center of gravity, not an afterthought to a play server — directly resonant with a signed,
  player-owned scoresheet.
- **Fritz/Hiarcs**: sell "you own this outright, no account, no subscription, works offline" as an
  explicit value proposition rather than an implementation detail — this is close to a verbal template
  for how Scoresheet should talk about wallet-owned, no-server-account identity.
- **ChessTempo**: a time-weighted, anti-guessing scoring mode and a user-tunable difficulty offset are
  both genuine puzzle-UX improvements over a flat rating stream; 3-way partial-credit grading (correct
  / close / wrong) is more honest feedback than binary pass/fail.
- **Chessify**: the plugin-into-existing-tools model (meet the user where their workflow already is)
  rather than insisting on a walled-garden UI.
- **Aimchess**: the closed loop from "here is your diagnosed weakness" straight into "here is a
  drill built from your own missed position" — diagnosis with no attached practice is a dead end;
  practice with no diagnosis is generic. Do both, connected.
- **DecodeChess**: decompose engine output into small, discrete, individually-labeled claims (this
  move threatens X, guards Y) rather than one paragraph of prose — it's more scannable and, done
  right, more falsifiable.
- **Skillz-family**: automatic matchmaking with zero manual opponent-search, already covered in
  `chess-for-money.md` §4 — not repeated here.

## 5. What we can do better

- **Aimchess and DecodeChess are the two most important comparisons for Scoresheet's own
  differentiator, and both fail it in the same way**: neither publishes how its numbers are derived.
  Aimchess's six-dimension breakdown has no public formula, no stated engine, no accuracy study;
  DecodeChess is more transparent about its *mechanism* (verified engine-search primitives → NL
  templates) but the underlying engine is frozen at Stockfish 12 NNUE with no version/date discipline
  a third party could use to reproduce a given explanation years later. A signed, independently
  recomputable record — exact engine version, exact depth, exact formula, published — is something
  neither of the two closest conceptual competitors does, and it's a strictly higher bar than either.
- **ChessBase's local-ownership pitch, done trust-minimized.** ChessBase sells "your own database,
  yours to keep" but it's still just a file on your disk with no cryptographic tie to the games it
  claims to represent — anyone could hand-edit a CBH file. A signed scoresheet makes the same
  ownership promise **provably** true, not just true-by-convention.
- **Fritz/Hiarcs's "buy once, own forever, no account" pitch, without giving up connectivity.** A
  wallet-owned identity gets the no-server-account property Fritz/Hiarcs earn by being offline
  software, while staying a live, connected, multiplayer product — Fritz/Hiarcs have to trade away
  live play to get ownership; Scoresheet doesn't have to make that trade.
- **Every paid-tier "insights"/"advanced stats" product surveyed here (Aimchess, Chess.com Insights,
  ChessBase Style Reports) gates the pattern-recognition layer behind a subscription.** Nimiq's
  no-server-account model has no subscription business to protect the same way; the aggregate-stats
  layer can be free from game one.
- **Chessify proves there's real demand for provable compute/depth**, at real prices ($8–$120+/mo) —
  worth remembering that "how was this analyzed" is something a real market pays for, which supports
  investing in a published, fixed analysis configuration rather than treating it as an afterthought.

## 6. What is technically required

- **To match ChessBase/Fritz/Hiarcs's "own your record" pitch trust-minimized**: signed per-game
  records (already the core Scoresheet primitive) plus a client that can independently recompute a
  rating/analysis from the signed history — no CBH-equivalent binary format needed since the record
  itself is the portable artifact.
- **To match ChessTempo's puzzle-rating sophistication**: a Glicko-1-or-2 puzzle-vs-solver
  implementation (published spec, implementable without touching ChessTempo's code — see
  `01-platforms/lichess.md` §6 for the same point re: Lichess), plus a solve-time capture mechanism if
  a time-weighted mode is wanted — this is a UI/scoring-function addition, not a new subsystem.
  Lichess's own open-source `PuzzleFinisher.scala` (MIT-family scalachess ecosystem — see
  `01-platforms/lichess.md` §9) is confirmed via GitHub API to use Glicko-2 with no time component, so
  a time-weighted variant is genuinely differentiated engineering, not a copy of either competitor.
- **To match Aimchess's closed-loop diagnosis→practice pattern**: per-game move classification already
  needed for the core rating/analysis product, aggregated into named competency buckets (tactics,
  endgame, time management, etc.), plus a trainer mode that replays the user's own flagged positions —
  this reuses data already being computed for the signed scoresheet rather than requiring new
  infrastructure.
- **To match DecodeChess's explanation mechanism**: a fixed-version engine, run at a published
  depth/node count, with a rules layer that maps discrete search-tree facts (threats, pins, x-rays,
  square-vacation) to labeled claims — DecodeChess's own description of "verified... relevant and
  important... proved to affect the future course of the game" is a genuinely reusable *design*
  pattern (not code) worth building from scratch with full version/depth disclosure from day one.
- **To match Chessify's plugin model, if ever relevant**: an API surface a third-party tool could call
  — likely out of scope for a mobile-first Mini App, but worth noting as a future integration point.

## 7. What could break

- **Publishing an exact methodology (unlike Aimchess and DecodeChess) makes the scoring easier to
  game once thresholds are public** — the same risk already flagged in `01-platforms/chess-com.md` §7
  for accuracy scoring; it applies with equal force to any weakness-diagnosis or explanation feature.
- **DecodeChess's own trajectory is a cautionary tale**: a small team (2-10 people) built a genuinely
  differentiated explanation product, earned real GM endorsement, and then went three-plus years
  without a content or engine update while still collecting subscription revenue — a warning about
  the maintenance cost of "explain every move" done well, not just building it once.
- **Chessify and ChessTempo both show that mobile app quality can regress hard after a redesign**
  (Chessify's Android rating cratering post-redesign) — any major UI change to a mobile-first Mini App
  carries the same risk and needs the same before/after review discipline.
- **The ChessBase/Fritz GPL lawsuit (§9) is a concrete precedent that "quietly wrap someone else's
  open-source engine, sell it closed" is a legally tested and losing position** — directly relevant if
  Scoresheet's own engine choice (see `02-engine/`) is ever a GPL-licensed one; the compliance
  obligations are real and were enforced, not theoretical.
- **India's blanket real-money-gaming ban (§3, §8) shows a national regulator can eliminate an entire
  business model overnight**, independent of the skill/chance distinction the US market relies on —
  worth remembering that Scoresheet's peer-to-peer, no-custody design (per `chess-for-money.md` §6) is
  a different legal shape than GetMega/WinZO's pooled-stake model, but "different shape" should not be
  assumed to be automatically outside the reach of a sufficiently broad statute in any given
  jurisdiction — **NOT VERIFIED** whether India's Act would capture a no-custody, peer-to-peer,
  memo-tagged payment; this needs its own legal read if India is ever a target market.

## 8. What we can uniquely do because of Nimiq

- **Answer Aimchess's and DecodeChess's shared weakness directly**: publish the exact engine version,
  depth, and scoring/classification function, sign every game record, and let any third party
  recompute the same weakness-profile or explanation from the signed history — something neither of
  the two closest conceptual competitors offers, and something no subscription-funded closed SaaS
  product has a business reason to offer (an open, recomputable methodology makes it harder, not
  easier, to justify a paywall on the number itself).
- **Beat ChessBase's/Fritz's "you own it" pitch without the offline tradeoff**: a wallet-held identity
  and signed game history give the same no-server-account ownership property while staying a live,
  connected, multiplayer product — ChessBase/Fritz can only offer ownership by giving up connectivity;
  a Nimiq-anchored record doesn't have to make that tradeoff.
- **A structurally different answer to the Skillz-family's custody problem than "trust us"**: per
  `chess-for-money.md` §8, peer-to-peer NIM settlement with no app-held balance removes the entire
  category of complaint (frozen withdrawals, merged accounts, "bonus cash" traps) that dominates real
  evidence against every real-money chess app surveyed here and in the earlier research — not a policy
  promise, an architectural fact.

## 9. Licence and reuse verdict

| Product | Status checked | Verdict |
|---|---|---|
| ChessKid | Closed-source SaaS (Chess.com subsidiary) | No code/data reuse rights. Concept only (child-safety architecture pattern) is reusable, not the implementation. |
| Chessable | Closed-source SaaS (Chess.com/Play Magnus Group subsidiary, UK entity Chessable Limited, Companies House #09894328, incorporated 2015-11-30) | No code/data reuse rights. MoveTrainer mechanism is a concept to build independently, not to copy. |
| Chess24 | Defunct, folded into Chess.com; no live codebase to check | N/A — no reuse question applies to a discontinued product. |
| ChessBase | Closed-source commercial software | No reuse rights. **Notable precedent, not a reuse opportunity**: Stockfish (GPL-3.0) sued ChessBase in July 2021 over Fat Fritz 2 and Houdini 6, alleged undisclosed GPL derivatives; settled November 2022 requiring GPL-3.0 compliance for both products — triangulated across three independent Wikipedia articles (ChessBase, Fritz, Stockfish); exact settlement terms beyond "GPL compliance required" **NOT VERIFIED** (no primary settlement document located). This is the single most relevant licensing fact in this whole research set — direct evidence that wrapping a GPL engine and selling it closed is a tested, losing position. |
| Fritz / Hiarcs | Closed-source commercial software (Fritz: ChessBase-owned; Hiarcs: independent developer, licensed/bundled by ChessBase) | No reuse rights. Fritz-line products (Fat Fritz 2, Houdini 6) are the specific products named in the GPL settlement above — this lineage carries the licensing risk directly, not just adjacently. |
| ChessTempo | Closed-source SaaS, no public API or open dataset found despite a direct check of every plausible developer/API page | No reuse rights; nothing to check beyond confirming the absence of an open surface. |
| Chessify | Closed-source SaaS selling metered access to third-party engines | The underlying engine, Stockfish, is confirmed **GPL-3.0** (not AGPL) via the GitHub API (`official-stockfish/Stockfish`, `Copying.txt`), fetched 2026-09-08. Running GPL-3.0 code as a pure network service (SaaS) does not trigger GPL's source-disclosure obligation — this is the well-documented "ASP loophole" that only AGPL closes, and Stockfish is not AGPL, so Chessify's core cloud-compute business model appears GPL-compliant by this reasoning. Its downloadable ChessBase/Fritz/HIARCS/SCID **plugin** is a different question — if it embeds or statically links engine code rather than acting as a thin network client, it could carry its own disclosure obligation — **NOT VERIFIED**, the plugin binary was not inspected. No code reuse recommended regardless; Chessify's own product is closed-source. |
| Aimchess | Closed-source SaaS (Chess.com subsidiary), no public API found | No reuse rights. |
| DecodeChess | Closed-source SaaS (Decodea LTD); GitHub API search for "decodechess" returns zero repositories or organizations | No reuse rights; confirmed not open source, not merely unadvertised. |
| Skillz real-money chess apps | Skillz platform itself: proprietary, closed-source (per `chess-for-money.md` §9, unchanged). Two adjacent crypto-chess repos re-checked this pass via the GitHub API: `fiveoutofnine/fiveoutofnine-chess` (`license: null`, no LICENSE file present in the repo tree) and `Ultrachess/app` (`license: false`, `contents/LICENSE` returns 404) | Both confirmed to have **no license file at all** — this upgrades `chess-for-money.md`'s earlier "NOT VERIFIED" to a checked negative: under default copyright law, no license means all rights reserved, and neither repo may be reused without contacting the authors directly. |

**Bottom line**: every product in this set is closed-source SaaS or proprietary desktop software; the
one genuinely load-bearing licensing fact is the ChessBase/Fritz GPL settlement (Stockfish v.
ChessBase, 2021–2022) — real, adjudicated evidence that quietly wrapping a copyleft engine in a closed
commercial product is a legal risk that has actually been enforced, not a hypothetical one. Nothing
here changes the licence guidance already established in `01-platforms/lichess.md` §9: scalachess
(MIT) and chess-openings (CC0) remain the only freely portable code/data in the whole research set to
date.
