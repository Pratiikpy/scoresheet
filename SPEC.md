# chess — the build spec

Two lists, held against each other.

**Part A** is the Lichess feature set, because it is *proven demand* — people love that product and
we should know exactly what they love it for. Every row is marked with what it costs here, and
whether it is reachable at all inside a Nimiq Mini App.

**Part B** is what Cycle 2 actually scores. Where the two disagree, Part B wins: this is an entry
with a deadline, not a chess site.

Read `BRIEF.md` for the concept and `LICENCES.md` for what may legally be used.

**Parts A–E** are the feature calls. **Part F** specifies the signed rating, which is the
differentiator. **Part G** records the decisions that were open. **Part H** is a second pass over
what Lichess's marketing page leaves out — three of those turned out to be free. **Part I** is the
audit: the engineering the rest of this spec assumed and never stated. **Part J** is a third pass,
over what is demonstrably loved at Lichess, at Chess.com and in maintained repositories, and is
still not here. **Part K lifts the deadline** — it is the roadmap for the product this becomes when
the only limits are correctness, licensing and what the platform allows, and it is where the biggest
unlock in the whole spec lives.

**If you read one part, read K.** Parts A–J were written with 18 September inside them, and several
of their refusals were deadline refusals wearing engineering clothes. **Part L** is how we reach
Lichess's quality legally — which source to study for which component, and the one rule that keeps a
clean-room rewrite a rewrite rather than a licence violation. **Part M audits everything above
against the official 21 scoring criteria**, and finds four they do not address. **Parts N and O close
them**: N is the interface — the screen map, back behaviour, every board interaction, the design
language as numbers, and every failure state written out. O is the campaign, because three of the
five Marketing criteria are things the builder does and no version of the app supplies them.
**Part P is the last audit**: every Nimiq provider method against what this spec does with it, and
everything still undecided, unchecked or unplanned — including the one measurement that turned out
to be a problem.

⚠️ **Part Q governs, and it corrects Parts K7 and P.** Those optimised for *using more of Nimiq*.
The organiser's own words make that the wrong target — *"a judge who cannot quickly understand your
app scores it lower"* — so the mechanics stay and the **story becomes one sentence**. Read Q before
acting on anything else in this spec.

Legend: **BUILD** — in scope · **LATER** — real, but after the deadline · **CUT** — deliberately not
doing it, reason given · **BLOCKED** — cannot be done on this platform, reason given.

---

---

# Part 0 — start here. The one build order.

This spec is seventeen parts long because it was written as it was researched. **A builder needs one
list, and this is it.** Where any other part gives a different order — Part C, Part K9, the brief —
**this one supersedes them.**

**The pitch, and it is one sentence:** *both players sign the result; that signature is your rating,
and skill earns.* Everything below serves that sentence or is found rather than narrated (Part Q).

| # | Build | Done when | Why here |
|---|---|---|---|
| 1 | Board, rules, `chess.js`, our bot with names and faces, book openings | You can play a full game in one tap, no wallet, no server | Minute 0:00 of Q4. There is no second chance at it |
| 2 | Premoves, sound, haptics, auto-queen, move dots, coordinates, zen, flip | A chess player says nothing is missing | H3, H4. Cheap, and their absence is all anyone notices |
| 3 | Daily puzzle, Storm, Streak, from the **bundled 5,000-puzzle subset** | Playable offline, adaptive by rating | H1, P4. The retention loop, and the answer to the Tuesday problem |
| 4 | Signed scoresheet on the bot game, the record page, **the recompute button** | A stranger's browser re-derives the rating | Minute 3:00 of Q4. **This is the entry.** Do not let it slip later |
| 5 | Share link, live game over polling, clocks, disconnect, claim-the-win | Two phones play a rated game | I2, I3. The share link is the whole distribution strategy |
| 6 | Certificate as a picture, PGN export, rating graph | A game is shareable as an image | J1, J5, J6 |
| 7 | Puzzle pool, chit's abuse limits, **memo carries the puzzle id** | Someone with no wallet earns NIM | K7, P2. Usage points, and it creates wallets |
| 8 | Navigation, error states, the design language as numbers, accessibility | The four criteria Part M found missing | M, N. Scored, and invisible until absent |
| 9 | Stake the pool | Payouts come from rewards, principal untouched | K7 — and it stays **off the pitch** (Q2) |
| 10 | **The engine** | Game Review, generated puzzles, real anti-cheat, rated bots | K1, K2. The largest unlock, and it is post-cycle work |

**Steps 1–8 are the entry.** Step 4 is the thing nothing else in the catalog can do, so it comes
before multiplayer, not after. Steps 9–10 are the product it becomes.

**And the campaign runs in parallel from day one, not after** (Part O). The target is **25 distinct
wallets** — full marks — which is one evening of real games in a chess Discord.

---

# Part A — what Lichess offers

Taken from lichess.org/features, read 6 September 2026. That is the marketing page, so it omits a
good deal of what the product is actually used for — **Part H is the second pass** over what it left
out, and three of those turn out to be free.

## A1. Play

| Feature | Call | Why |
|---|---|---|
| Bullet, Blitz, Rapid, Classical | **BUILD** | The whole product. One clock implementation covers all of them; only the presets differ. |
| UltraBullet (¼ min) | **LATER** | Needs the clock to be right to the millisecond under network jitter. Get Blitz correct first. |
| **Correspondence, with conditional premoves** | **BLOCKED — read this** | Not a code problem. **There are no push notifications on this platform**, so nothing can tell a player it is their turn. Days-long chess with no way to summon anyone back is a graveyard of abandoned games, and abandoned games are the worst thing a judge can open. If it ships at all it needs an out-of-band nudge — an emailed or shared link the *opponent* sends — which is a different feature. Decide deliberately; do not drift into it. |
| Standard chess | **BUILD** | |
| 8 variants (Chess960, King of the Hill, Three-check, Antichess, Atomic, Horde, Racing Kings, Crazyhouse) | **CUT for v1**, Chess960 **LATER** | `chess.js` does not implement variants, so each is its own rules engine and its own bug surface. Complexity is explicitly scored *down* this cycle. Chess960 is the cheapest and the most loved; it is the only one worth revisiting. |
| Arena tournaments | **CUT** | Weeks of work, and it needs a crowd already present. We will not have one. |
| Swiss tournaments | **CUT** | Same, plus pairing algorithms. |
| Simultaneous exhibitions | **CUT** | Needs a titled player and an audience. |
| **Challenges and friend games** | **BUILD — first** | This is the share link, and the share link is the entire distribution strategy (see B3). It is not a feature, it is the front door. |
| Lichess TV — watch live games | **LATER** | Cheap once games exist and genuinely good for a demo video: a judge opening the app to a live board beats an empty lobby. Worth it only if there is traffic. |
| Rematch | **BUILD** | One tap, and the second game costs nothing to acquire. |

## A2. Analysis

| Feature | Call | Why |
|---|---|---|
| Analysis board with Stockfish | **BLOCKED as shipped** | Stockfish is **GPL-3.0** and the entry must be MIT. Shipping `stockfish.js` in the bundle makes the bundle GPL. Options in `LICENCES.md` §6: no engine, or a separate GPL service called over HTTP. |
| Deep server-side analysis | **CUT** | Same licence problem plus real compute cost. |
| Cloud engine analysis | **CUT** | Same. |
| **Board editor** | **BUILD — cheap** | Set up a position by dragging pieces. `chess.js` handles FEN both ways, so this is a day, and it powers puzzle authoring and the study feature. |
| **Learn from your mistakes** | **LATER — the best of these** | Replaying your own blunders as puzzles is the most loved analysis feature Lichess has, and it needs an engine to identify the blunder. Reachable *without* one for tactical mistakes: a move that hangs material is detectable from the position alone. That subset is worth building. |
| **Chess insights** — statistics on your own play | **BUILD — small version** | Accuracy by phase, by time control, by piece, results by colour, time spent per move. No engine needed for most of it, it is genuinely liked, and it doubles as the cheat-detection signal (B1). |
| Global opening explorer, 6 billion games | **CUT** | The dataset is the product and cannot be reproduced. Lichess's own explorer API returned **401 Authorization Required** on 6 Sep, so it is not open either. |
| Personal opening explorer | **LATER** | Ours only, from our own games. Free once games exist. |
| **7-piece endgame tablebase** | **BUILD — verified reachable** | The dataset is impossible to reproduce, but **`tablebase.lichess.ovh` answers with no authentication** — checked 6 Sep, returned real DTZ data for a rook endgame. So perfect endgame play is one HTTP call. Using a public API is not copying code; respect their rate limits and credit them. |
| **Studies** — shareable, persistent analysis | **LATER** | A shareable annotated game is close to the *game certificate* (B5) and to coaching. Build the certificate first; a study is that plus editing. |
| PGN import and export | **BUILD** | Trivial with `chess.js`, and it is what makes a game portable. |

## A3. Learning

| Feature | Call | Why |
|---|---|---|
| **Tactical puzzles** | **BUILD — core** | This is the single-player mode, the learn-to-earn surface (B3) and the thing that works with no opponent online. **`lichess.org/api/puzzle/daily` answered with no authentication** on 6 Sep — real puzzles, free. Better still, the full database is **CC0** and carries `Rating`, `Themes` and `OpeningTags` per puzzle, which is four features rather than one and removes the runtime dependency on their API. See **H1**. |
| Puzzle Streak | **BUILD** | Solve until you fail. One counter, and it is the most replayable format they have. |
| Puzzle Storm (3 minutes) | **BUILD** | Same engine, a clock. |
| Puzzle Racer (multiplayer) | **LATER** | Needs the real-time layer that the game already needs, so it is nearly free afterwards. |
| Basics lessons (`/learn`) | **CUT for v1** | Content, not code — every lesson is hand-authored. High value, wrong cost profile before a deadline. |

## A4. Presentation

| Feature | Call | Why |
|---|---|---|
| **Light and dark themes** | **BUILD** | Required by the design pillar anyway. |
| **Custom boards, pieces, backgrounds** | **BUILD — small set** | Three board colours and two piece sets. It is the cheapest personalisation in existence and players care about it more than is reasonable. |
| **Phone support, portrait first** | **BUILD** | Not optional. This is a phone app in a WebView. |
| Landscape and tablet | **LATER** | |
| 140+ languages | **BUILD — the five Nimiq Pay has** | en, es, de, fr, pt. The host tells us which via `getHostLanguage()`. |
| **Zero ads, zero tracking, free forever** | **BUILD — and say it loudly** | Costs nothing, matches Lichess's most beloved property, and is true here by construction: there is no account, so there is nothing to track. |

## A5. Social

| Feature | Call | Why |
|---|---|---|
| Public profile and rating history | **BUILD** | This is the portable signed rating (B2). It is the entry. |
| Friends, teams, forums, blog, messaging | **CUT** | A social network is a different product and needs a population. |
| Following and challenges from a profile | **LATER** | "Challenge this player" on a profile is a good loop once profiles exist. |

---

# Part B — what Cycle 2 scores

⚠️ **The point numbers in this part are an ordering, not a budget — see Part M0.** The published
rubric is **105 points: four pillars of 25, plus 5 bonus**, 21 criteria in all. The organiser said
the cycle reweights toward Functionality and Usefulness/Originality and away from Marketing and
Design (`../SIP_AND_SHIP_C2_CALL1_FINDINGS.md`), but **the new weights are unpublished**. Marketing
is reduced, not removed. **Part M audits this spec against the official 21 criteria, one by one.**

## B0. Mandatory — no points, but the entry is invalid without all six

1. A working Mini App, built on the Nimiq Pay Mini Apps Framework
2. Public GitHub repo under the **MIT** licence
3. A live, testable demo URL
4. A Nimiq wallet for payouts
5. Supports NIM — the organiser's words were *"make the coins exactly NIM"*
6. Submitted before **18 Sep 2026, 23:59 UTC**, with a demo video, icon, thumbnail and screenshots

Judging happens **at random after the deadline**, so the app must stay live and working for weeks.

## B1. Functionality — 45 points, the largest block

- Legal chess: full move generation, check, checkmate, stalemate, and every draw rule — 50-move,
  threefold repetition, insufficient material
- **The server holds the position.** The browser is never trusted with it. This is where NimJump
  spent its build and a large part of why it placed second
- Clocks correct under load: increment applied on move, flagging, and a defined answer for a tab
  that slept or a phone that locked
- Reconnect without losing the game
- Resign, draw offer, takeback
- Move validation replayed server-side — the move list *is* the replay log, which chess gets free
- Cheat detection, even if v1 only records rather than acts: accuracy that is too **even** across
  easy and hard positions is a stronger signal than raw accuracy, and needs no engine
- Designed failure states: opponent left, connection lost, clock desync, illegal move rejected
- Zero console errors and nothing broken on a cold open

## B2. Nimiq integration — 25 points, and it must be load-bearing

- **`sign()` on the finished game, by both players.** This is the whole thesis
- The rating **derived** from those signatures, never stored as a row anyone controls
- A public page where a stranger recomputes a rating from the signatures alone
- `listAccounts()` for identity — requested on a tap, never on page load
- Feeless NIM payments for something real: coaching, puzzle rewards, tips
- `requestDeviceIdentifier()` to keep any payout fair without a login
- Identicons, so an opponent wears the same face they wear everywhere else in Nimiq
- Handle `{error: {type, message}}` as well as a rejection — both happen
- **Chain and nonce inside the signed bytes.** `sign()` has no domain separation, so a testnet
  signature verifies byte-for-byte on mainnet
- The signed-message digest is `SHA-256(prefix ‖ decimal(byteLength) ‖ message)` and that length is
  the **byte** length. Copy `chit/packages/verify/test/keyguard-vectors.test.ts` before writing any
  signing code

## B3. Usage — 15 points, counted as distinct wallets opening the app

- **A share link that *is* the game.** Open it and you are playing
- **Playable with no wallet.** Connect only to sign the result
- Puzzles that pay a few cents from a funded pool — the only mechanic that creates wallets which did
  not exist, and the organiser's own unprompted wish for this cycle
- Pool discipline copied from chit: one payout per device per day, one per wallet per day, a daily
  ceiling the key cannot exceed, every payout public with its transaction, and **nothing offered when
  the pool cannot pay**
- A rematch link
- **Real-time only.** No push notifications exist, so nothing brings a player back to an async game

## B4. Design — 10 points

- Portrait phone first, one idea per screen
- Board readable at 390px; every control at least 44px
- Light and dark
- Under sixty seconds from a cold open to playing
- The five host languages, or English plus one

## B5. Promotion — 5 points, accruing from week 2

- A shareable **game certificate** — "I beat a 1900 in 24 moves" — that a stranger can verify
- A Skool post and an X post
- A README written for a judge opening the repository cold

---

# Part C — the order to build in

**Phase one only.** Part K9 carries the phases after it, and Part K1 is the thing to build second.

Reordered after Part E. The first draft of this list put the board-from-a-share-link at step one,
which is a lobby, which is an empty room to the one person who decides the score.

1. **The board, the rules, and the bot** — legal chess against something that is always there, in
   one tap, with no wallet, no server and no second person
2. **The daily puzzle and Puzzle Storm** on the home screen, with the streak counter
3. **The share link and real-time play**, server-authoritative, over HTTP polling; clocks, resign,
   draw, rematch
4. **Both signatures at the end**, and the certificate page a stranger can open
5. **The rating derived from those signatures** (Part F), with the public recompute page
6. **Puzzles that pay**, from the funded pool, with chit's limits copied exactly
7. Insights, board editor, themes, tablebase endgames
8. Coaching, tournaments, Chess960 — only if everything above is finished

One through five is a real entry. One through six is a strong one.

---

# Part D — conflicts to decide before writing code

**All six are now decided. Part G carries the answers and the reasoning; this list is kept so the
questions are visible and nobody reopens one by accident.**

- **Correspondence.** He wants it; the platform cannot support it. Either cut it or design the
  out-of-band nudge deliberately.
- **The engine.** No Stockfish in the bundle, ever. Decide now whether analysis is human-only
  (recommended) or a separate GPL service.
- **Variants.** Every one is a second rules engine. Chess960 or none.
- **Anti-cheat consequences.** Decide early whether a flag records, throttles, or does nothing.
- **The name.** Undecided. It is part of the design score and it is what a judge reads first.
- **Whether solving pays, and from what pool.** Deferred deliberately (E2). The loop must work with
  the reward at zero before any money is attached to it.

---

# Part E — the Tuesday problem

Everything in Part A is a chess feature. None of it answers the only question that decides whether
an app survives: **why does someone open this on a Tuesday when no opponent is online?**

For a Mini App the question is harder than for Lichess, because **there are no push notifications**.
Nothing can summon anyone. Every reason to return has to be one the player generates themselves.

## E1. Why people actually open a chess app

Observed from what Lichess and Chess.com put on their own front pages and build teams around.
Marked by whether it survives having no opponent and no notifications.

| The reason | Works alone? | Call |
|---|---|---|
| **The daily puzzle** | Yes | **BUILD.** Lichess puts it on the homepage with the board already drawn and "Black to play". One position, one answer, thirty seconds. It is the single most reliable daily habit in chess. |
| **Puzzle Storm / Streak** — chasing a score | Yes | **BUILD.** A number that is yours to beat needs no second person and no notification. This is the strongest retention mechanic available to us. |
| **Beating a bot** | Yes | **BUILD.** See E3. Also the answer to the cold open. |
| **Reviewing yesterday's loss** | Yes | **BUILD small.** "Where did I go wrong" is why people come back after losing, which is when they are most likely to leave. |
| **Checking the rating** | Yes | **BUILD.** Vanity is a real loop. It is free once the rating exists. |
| **Insights** — how am I actually playing | Yes | **BUILD small.** Accuracy by phase, results by colour, time per move. |
| **Endgame practice** | Yes | **BUILD.** `tablebase.lichess.ovh` answers unauthenticated, so perfect play is one call. Set a position, try to win it, get told the truth. Nobody else in the catalog has this. |
| **Opening drilling / repertoire** | Yes | **LATER.** Needs our own game data first. |
| Watching a live game (TV) | No — needs players | **LATER.** Good in a demo video, dead on day one. |
| A tournament starting | No — needs a crowd and a notification | **CUT.** |
| Someone challenged me | No — needs a notification | **BLOCKED.** This is the loop Lichess and Chess.com lean on hardest and it is exactly the one the platform denies us. |
| A lesson series | Yes, but | **CUT for v1.** Hand-authored content, wrong cost before a deadline. |

**The shape that falls out:** every surviving reason is single-player. So the honest design is that
**chess against a person is the payoff, and the single-player loop is the product.** Building it the
other way round — a lobby first — produces an empty room.

## E2. What makes those loops actually stick

Copied from what works, not invented:

- **A streak with a visible number.** Days solved in a row. Lichess's Puzzle Streak is their most
  replayed mode and it is one integer.
- **A personal best that is beatable today.** Storm's score does the work; the player supplies the
  motivation.
- **Difficulty that adapts.** A puzzle rating that moves with the player, so it is always just hard
  enough. This is why puzzle ratings exist at all.
- **One tap from open to doing.** Lichess draws the daily puzzle *on the homepage*, already set up.
  Not a menu item — the board is there.
- **A reason it is worth something.** Deferred deliberately: whether solving pays NIM, and from
  what pool, is an open decision in Part D. The loop must work with the reward set to zero, or the
  reward is propping up a bad loop.

## E3. The first thirty seconds — the cold open

A judge opens the app alone, on a phone, with nobody else online. **This is the single highest-risk
moment in the entry** and it is entirely within our control.

**What Lichess does**, read from their homepage on 6 Sep 2026:

1. An eleven-button **quick pairing grid** — 1+0 through 30+20 — so the first tap is a game
2. **Live proof of life**: "84,215 players · 35,026 games in play"
3. **A live game already playing** on the page, with real names and ratings
4. **The daily puzzle**, board drawn, "Black to play", clickable
5. A tournament countdown: "170 players • in 4 hours"

**What we do instead**, because we will not have 84,000 players:

| Lichess has | We show |
|---|---|
| Quick pairing against 84k people | **Play now** — starts instantly against the bot, no waiting, no wallet |
| 35,026 live games | **The daily puzzle**, board already on screen, one move to solve |
| A live game to watch | **Endgame of the day** — a position the tablebase can judge perfectly |
| Player counts | Nothing, until the number is real. **A count of 3 is worse than no count.** |
| Tournament countdown | **Challenge a friend** — one tap, produces the share link |

**The rule:** the board is on the screen when the app opens, and something is playable in one tap
without a wallet, without an opponent, and without a wait. Nothing else earns the first screen.

## E4. The bot, and why we must write our own

The cold open needs an opponent that is always there. Every strong engine — Stockfish, Leela,
Fairy-Stockfish — is **GPL-3.0**, and shipping one in the bundle makes the bundle GPL, which
disqualifies an MIT entry (`LICENCES.md` §2). A search for permissively licensed JavaScript engines
on 6 Sep found nothing usable: the highest-starred candidates had 0 and 8 stars.

**So we write one.** This is not a compromise:

- Minimax with alpha-beta pruning, material plus piece-square tables, three or four ply. Around
  250 lines, and it is MIT because it is ours.
- It does **not** need to be strong. It needs to be *instant*, *beatable*, and *adjustable* — a
  beginner losing every game leaves faster than one who never opens the app.
- Three levels by search depth and by deliberately blundering at a set rate. Chess.com's bots are
  loved precisely because they are weak in human-looking ways.
- `chess.js` (BSD) supplies legal moves, so the engine only chooses among them.
- It doubles as the puzzle validator and as the baseline for insights.

**What it must not be:** a selling point. It is scaffolding so the app is never empty. The entry is
the signed portable rating; the bot is what stops screen one being a lobby with nobody in it.

## E5. What this adds to the build order

Inserted into Part C, after step 2:

- **2b. The bot**, and *Play now* on screen one
- **2c. The daily puzzle**, on screen one, with the streak counter
- **2d. Puzzle Storm**, since it is the same code plus a clock

These come *before* the rating work, because they are what a judge sees first and what a player
returns for. A perfect signed rating attached to an app nobody opens twice scores nothing on Usage.

---

# Part F — the signed rating, specified

This is the differentiator, so it is designed here rather than gestured at. Everything else in this
spec is a chess feature somebody else already has; this part is the only thing in the entry that is
impossible on Chess.com, on Lichess, and in every other app in the catalog.

The claim being made is narrow and has to survive a hostile reading: **a rating nobody can revoke,
that a stranger can recompute from the signatures alone, with no help from us.** Three things have to
be right for that to be true rather than marketing — what is signed, how the order is fixed, and what
stops a person farming a rating against their own second wallet.

## F1. What is signed

One canonical text per finished game, signed by **both** players. Same discipline as chit's
`packages/core/src/canonical.ts`: line per field, no field may contain a newline, re-serialise and
compare on parse so a non-canonical input is refused rather than accepted with a different digest.

```
chess/1 scoresheet
<chain>                     main | test — sign() has no domain separation, so this must be inside
<gameId>                    32 hex, server-issued, unique
<white address>             NQ…, no spaces
<black address>             NQ…, no spaces
<result>                    1-0 | 0-1 | 1/2-1/2
<termination>               checkmate | resignation | timeout | stalemate | agreement |
                            insufficient | repetition | fifty-move | abandoned
<moveCount>                 integer
<finalFen>                  the position the game ended in
<endedAtBlock>              Nimiq block height, stamped by the server
<movesHash>                 SHA-256 of the SAN move list, base64url
<rated>                     rated | casual
```

*(Corrected 8 September 2026. This block previously listed six of the nine terminations and omitted
the twelfth line entirely. `packages/core/src/scoresheet.ts` is the authority — it always was — and
the protocol specification in `research/13-protocol/RECORDS.md` is generated from the code rather
than from this block, which is how the drift was caught.)*

Notes that matter:

- **The moves are hashed, not carried.** A full game is far too long to sign comfortably and nobody
  needs it inline; the hash binds the move list without paying for it, and the move list itself is
  served beside the scoresheet so anyone can re-derive the hash.
- **`endedAtBlock` is the ordering key** (F2), and it is signed by both players. A server that lied
  about it would need both of them to have signed the lie.
- **`chain` is inside the signed bytes** because `sign()` has no domain separation — a testnet
  signature verifies byte-for-byte on mainnet otherwise.
- **One signature proves nothing.** Either player could otherwise claim any result. A scoresheet is
  valid only with two, and the two must be the two addresses the text names.

## F2. How the order is fixed

Elo is path-dependent: the same set of games in a different order gives a different number. So a
"recomputable" rating is meaningless unless everyone sorts the games identically.

**Canonical order: `endedAtBlock` ascending, then `gameId` ascending as a tiebreak.** Both fields are
inside the signed text, so the order is a property of the signatures rather than of our database.

Block height is the right key rather than a timestamp for the same reason chit uses it for deadlines:
a height is checkable by anyone against the chain, and a timestamp is something our server asserts.

## F3. How the number is computed

Plain Elo, no invention. Anyone reimplementing this from the spec must land on the same integer.

- **Everyone starts at 1200.**
- `expected = 1 / (1 + 10^((opponentRating - myRating) / 400))`
- `newRating = round(myRating + K × (score - expected))`, score being 1, 0.5 or 0
- **K = 32** for a player's first 20 rated games, **K = 16** after that
- Ratings are integers, rounded half away from zero, and floored at **100** so nobody can be driven
  below a number that stops meaning anything
- Both players' ratings update from the same pre-game values, computed in the canonical order

## F4. What stops somebody farming it

This is the part a hostile reader goes for first, and it cannot be fully solved without identity. It
can be made worthless to do, which is the same discipline chit applies to its bounty pool.

1. **Diminishing returns per opponent.** Full K for the first **3** games against a given opponent;
   K halves for games 4–10; **K = 0** from the eleventh. Two wallets playing each other forever
   converge and then stop moving. This is standard practice, not a chess-specific trick.
2. **The distinct-opponent count is displayed beside every rating, always.** Never in a fold, never
   on a second screen. 2400 from one opponent has to be visibly worthless — this is exactly chit's
   `distinctPayers` tell, and it works because the Sybil's own output advertises the Sybil.
3. **Provisional until 10 distinct opponents.** Shown with a `?` and excluded from any leaderboard.
   A number that has not met ten different people is not a rating yet.
4. **A rated game requires a real game.** Minimum 10 full moves and a legal termination; a
   two-move resignation is recorded and does not rate. Otherwise farming costs seconds.
5. **Payouts never key on rating.** The funded pool pays for solved puzzles, per device and per
   wallet per day. Nothing about the rating unlocks money, so there is no cash reason to farm it —
   only vanity, which the distinct-opponent count already punctures.

**Say the limit out loud.** Wallets are free, so a determined person can still manufacture a
plausible-looking rating over many wallets and many days. What they cannot do is manufacture *ten
distinct opponents who also signed*, without either finding ten people or doing ten times the work
for a number that says "provisional" until they do. That is the honest claim, and it is the one to
print — not "Sybil-proof".

## F5. The recompute page

`/r/<address>` — the object a stranger opens, and the proof that the rating is not ours.

It shows the rating, the distinct-opponent count, and every rated game in canonical order: opponent,
result, the rating before and after, and both signatures. Then **Recompute** runs the whole Elo chain
in the visitor's browser, from the signatures alone, and prints the number it arrives at beside ours.

If the two ever disagree, ours is wrong. That is the point of showing both.

The page must work with no wallet, no account and no app — it is the growth loop as well as the
proof, in exactly the way chit's `/p/<address>` is.

## F6. What this does not claim

- It is **not** a global rating pool. Two players who have never met, in a small population, will
  have ratings that are not comparable. Say so; Lichess's own ratings are not comparable to FIDE's
  either.
- It does **not** prove a human played the moves. The move-time variance signal is recorded and shown
  (`BRIEF.md`), and it is a signal, not a verdict.
- It does **not** survive both players losing their keys. Nothing signed does.

---

# Part G — the parts of Part D that are now decided

`Part D` listed six conflicts to settle before writing code. Five are settled; the record is here so
they are not reopened by accident.

| Was open | Decided | Where the reasoning is |
|---|---|---|
| Correspondence | **Cut.** No push notifications exist, so nothing can tell a player it is their turn | Part A1, `BRIEF.md` |
| The engine | **Human-only analysis, plus our own MIT bot.** No GPL engine in the bundle, ever | Part E4, `LICENCES.md` §6 |
| Variants | **None for v1.** Chess960 is the only one worth revisiting | Part A1 |
| Anti-cheat consequences | **Record and show, never auto-ban.** Move-time variance, no engine needed | `BRIEF.md` |
| The name | **Scoresheet** — the paper both players sign to agree the result | `BRIEF.md` |
| Whether solving pays | **Yes, from a funded pool, with chit's limits copied exactly** — but the loop is built and shipped with the reward at zero first, so the reward is never propping up a bad loop | Part E2, `BRIEF.md` |

And one that was not on the list and needed deciding: **transport is HTTP polling, not WebSockets**,
which cuts Bullet and removes any box that could be down when the judge arrives (`BRIEF.md`).

---

# Part H — what Lichess has that Part A missed

Part A walked `lichess.org/features` and put a call on every row. That is the marketing page, and
the marketing page leaves out most of what people actually use the product for. This part is the
second pass: high product-market-fit things Lichess has that were not in Part A at all, each with
what it costs here.

Three of them turn out to be **free**, because the datasets already carry the columns.

## H1. The puzzle database is not one feature, it is four

Verified 6 September 2026 at `database.lichess.org`. The licence is **CC0-1.0-Universal** — public
domain, no attribution required, though we credit them anyway — and each row is:

```
PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags, DailyDate
```

Part A took this as "puzzles". It is more than that, and the extra columns are the difference
between a puzzle feature and a puzzle *product*.

| Column | What it unlocks | Call |
|---|---|---|
| `Rating` | **Adaptive difficulty.** Part E2 says a loop sticks when it is "always just hard enough", and never says where that comes from. It comes from here: hold a puzzle rating for the player, serve puzzles near it, move it on each attempt. No engine, no authoring, no guessing | **BUILD — v1.** This is what makes the core loop work at all |
| `Themes` | **Train one weakness.** Forks, pins, back-rank, deflection, endgames. Lichess's most-used improvement tool after plain puzzles, and here it is a `WHERE` clause | **BUILD — v1, cheap** |
| `OpeningTags` | **Puzzles from the openings you actually play.** Very high fit, and nothing in the 75-app catalog is anywhere near it | **BUILD — after the game data exists**, since it needs to know what you play |
| `Popularity`, `NbPlays` | Sort out the puzzles people dislike before anyone sees them | **BUILD — free, one filter** |

**The consequence:** the daily puzzle is not a fetch from `api/puzzle/daily`, it is a row from a
dataset we hold. That removes a runtime dependency on Lichess's API from the app's most important
screen — which matters, because the app is judged at a random hour.

## H2. The opening name, live, while you play

`lichess-org/chess-openings` is **CC0-1.0** — verified from the repository's own metadata, 6 Sep. It
is the aggregated ECO dataset: every named opening and the moves that reach it.

Showing *"Sicilian Defence: Najdorf Variation"* above the board as the moves are played is the
cheapest "I am learning something" signal that exists in chess. It is a lookup on the move list,
it costs a few hundred kilobytes and an afternoon, and every chess site has it because it works.

Part A cut the *opening explorer* (the six-billion-game dataset, correctly — it cannot be
reproduced, and Lichess's own explorer API returned **401** on 6 Sep). Naming the opening is a
different, much smaller thing, and it was cut by association.

**BUILD — v1.**

## H3. Premoves

Not in Part A at all. The only premove row there is *conditional* premoves for correspondence, which
is blocked for an unrelated reason.

**At blitz speed a board without premoves is broken.** Every online chess player has the muscle
memory; playing a 3+0 game where an obvious recapture cannot be queued feels like the app is
fighting them. It is client-side, it needs no server support beyond rejecting an illegal queued move,
and its absence would be the first thing a chess player says about the app.

**BUILD — v1, alongside the clock.** Cancel the premove on any unexpected reply, which is what
Lichess does and what people expect.

## H4. The small things whose absence is noticed immediately

None of these is a feature anyone praises. All of them are noticed within one game if missing.

| | Call |
|---|---|
| **Sound and haptics** — move, capture, check, low-time warning | **BUILD — v1.** On a phone this is most of what "feel" means, and the low-time sound is a real part of blitz |
| **Auto-promote to queen**, with a long-press for underpromotion | **BUILD — v1.** A promotion dialog on every pawn push is the single most complained-about default in mobile chess |
| **Draw offer and resign**, with confirmation on resign | **BUILD — v1.** Already implied by Part C step 3; naming it so it is not forgotten |
| **Takeback, by consent** | **BUILD — v1 for casual games, never for rated ones.** One tap, opponent must agree |
| **Last-move highlight, legal-move dots, coordinates toggle** | **BUILD — v1.** Beginners cannot play without the dots and strong players turn them off |
| **Zen mode** — hide everything but the board | **BUILD — one toggle**, and it is loved out of all proportion to its cost |
| **A note on an opponent**, kept on the device | **BUILD — cheap.** chit already has exactly this for wallets (`labels.ts`); lift the pattern |

## H5. Two solo loops Part A did not consider

Part E established that everything which survives having no opponent is single-player. It then only
listed puzzles, the bot and endgames. Lichess ships two more that fit the same test.

**The coordinate trainer.** Thirty seconds, name the square, score against a clock. Lichess ships it
standalone because it genuinely teaches the one thing every beginner is slow at. No opponent, no
wallet, no server, no chess engine — it is a grid and a timer. **BUILD — v1.** It is also the
cheapest thing on this entire spec and it fits the cold open perfectly.

**Offline.** A Mini App runs in a WebView on a phone that goes into a tunnel. With the puzzle rows
and the bot in a service worker, puzzles and bot games keep working with no connection, and sync
when it returns. That is a direct answer to the Tuesday problem — the app is not merely open when
nobody is online, it is open when *nothing* is online. **BUILD — v1 for puzzles and the bot**, and
never for rated games, which need the server to hold the position.

## H6. The one nobody in the catalog will have

**Accessibility.** Lichess is genuinely famous for this and it is invisible on their features page:
a keyboard move-entry box (type `e4`, `Nf3`), an ARIA board a screen reader can walk, and spoken
move announcements. Blind and low-vision players use Lichess *because* of it, and they have almost
nowhere else to go.

It costs about a day: the move list already exists in SAN, the board is already a grid of elements,
and `chess.js` already parses SAN input. Design is a scored pillar, an accessible board is the
strongest possible evidence under it, and **no other app in a 75-app catalog will have one.**

**BUILD — v1.** This is the highest ratio of "matters to somebody" to "costs us anything" on the
whole spec.

## H7. What stays out, having looked again

| | Why |
|---|---|
| ~~Engine analysis, accuracy %, "learn from your mistakes"~~ | **Built.** This row read *"all need an engine, and every strong one is GPL"* and drew the wrong conclusion from a true premise: the answer was not to do without an engine but to **write one** (K1). It exists, it is ours, it is MIT, and Game Review is on the study screen. What is still out is ACPL as a headline number — accuracy in win-percentage terms is more honest and is what is shown |
| Opening explorer over their six billion games | The dataset is the product, it cannot be reproduced, and their API returned 401 |
| Teams, forums, blogs, messaging, streamers, following | A social network needs a population |
| Broadcasts, simuls, tournaments | All need a crowd that will not exist by 18 September |
| Puzzle Racer | Needs the real-time layer *and* other people. Nearly free after both exist, so **LATER**, not cut |
| Variants | Each is a second rules engine. Chess960 only, and only later |

## H8. What this changes in the build order

Part C, revised once more. Everything added here is cheap; nothing added here needs a second person.

- **Step 1** gains: premoves, sound, auto-queen, move dots, coordinates toggle, zen. These are what
  make step 1 feel like chess rather than like a chessboard.
- **Step 2** gains: the puzzle rating and adaptive difficulty (H1), theme training, and the
  coordinate trainer as a second solo loop.
- **Step 2b, new:** the opening name during play, and offline for puzzles and the bot.
- **Step 3** gains: accessibility, because a keyboard board is easiest to get right while the board
  is still simple.
- **Step 7** gains: puzzles filtered by the openings the player actually plays, which needs their
  game history to exist first.

---

# Part I — the audit: what this spec still did not answer

Parts A–H settle *what to build*. An audit of them against a real build turns up eight things they
assume and never state. Six are decided here. Two are honestly open.

## I1. The stack — decided

**Framework-free TypeScript, the way chit is built.** No React, no Vue.

The board is the only component that would tempt a framework, and `react-chessboard` (MIT, 541★)
would drag React in for it. NimQuest placed third at **4.9 MB against 78 and 89 MB**, and Nimiq's own
stated position this cycle is that small and finished beats large and unfinished. A chessboard is
64 elements and a drag handler.

- **Rules:** `chess.js` — BSD-2, 4,396★, 165k downloads a week. Legality, FEN, PGN, check, mate.
- **Board:** ours, a CSS grid of 64 squares with pieces as inline SVG. Drag *and* tap-tap, because
  tap-tap is what people actually use on a phone.
- **Pieces:** Staunton (MIT) and chessnut (Apache-2.0), the two verified in `LICENCES.md`. **Not**
  cburnett — it is GPL, and it is Lichess's default, so it is the one everybody reaches for.
- **Server:** the same shape as chit — one storage interface, a SQLite implementation for a box and
  an object-store implementation for serverless, so neither is a rewrite of the other.

**`NOTICES.md` at the repository root from day one**, one line per lifted file: origin, commit, path,
licence, what changed. `LICENCES.md` §7 requires it and judges read the repository.

## I2. Somebody leaves the game — decided

Half of all online chess games end with a person closing the tab. Parts A–H never mention it, and it
is the single most common non-chess event in the product.

- **The server owns the clock.** It is stamped when a move is *received*, not when the client says it
  was made. A client cannot flag its opponent by lying about time.
- **A player who disappears loses on time**, like everywhere else. Their clock keeps running.
- **The opponent gets a *Claim the win* button** the moment that clock hits zero. It is not
  automatic — a claim is a deliberate act, and an auto-win that fires while someone is reconnecting
  on a train feels like theft.
- **Reconnection is free and unlimited** while the clock has time on it. Reopening the link restores
  the position; nothing is lost by closing the app.
- **Under 10 full moves, an abandoned game does not rate** (Part F4 already requires this). It is
  recorded, and it does not touch anybody's number.
- **A game with no move for 24 hours is closed** as abandoned by both, unrated, and stops being
  served.

## I3. The clock, under real network lag — decided

- **One authority: the server.** The client shows a countdown for feel; the server's number is the
  one that decides.
- **Lag is charged to nobody, up to a grace of 200 ms per move.** Beyond that it comes off the
  mover's clock, because otherwise a slow connection is a free advantage.
- **Increment is applied on receipt**, after the move is validated.
- **The clock is in the signed scoresheet only as `termination: timeout`**, never as milliseconds.
  Signing a duration would mean signing our own measurement of it.

## I4. How this gets tested — decided

Copied from chit, which has 253 unit tests and a 206-check two-browser journey, because the shape is
proven and the alternative is finding out on a judge's phone.

- **Unit:** the rules against `chess.js`'s own test positions; the Elo chain against hand-computed
  values; the canonical scoresheet refused for every malformed input, exactly as chit's
  `canonical.test.ts` does.
- **Vectors:** copy `packages/verify/test/keyguard-vectors.test.ts` **before writing any signing
  code**. It pins the digest to Nimiq Keyguard's own published vectors using an independent SHA-256,
  and it is the only thing standing between this and a signature that fails on a real phone.
- **Journey:** two browsers, two real Ed25519 keys, play a whole game to checkmate, both sign, and
  assert the scoresheet verifies and the rating recomputes to the same integer in a third browser
  that never saw the server.
- **Every screen screenshotted and asserted to fit 390 px**, with zero console errors — the check
  that caught a 1229 px-wide share screen in chit while every functional test passed.

## I5. The submission itself — decided, and it is on the clock

The competition requires all of these and none of them is code. chit is feature-complete and still
blocked on exactly this list, which is the warning.

| | |
|---|---|
| Icon, thumbnail, screenshots | Needed for the listing. Budget half a day |
| A demo video | Required. Several Cycle 2 PRs were held up purely on a broken video URL |
| The submission PR | `nimiq/miniappscompetition-submissions`, one file |
| MIT `LICENSE` and `NOTICES.md` | Non-negotiable, and checked |
| **One run on a real phone inside Nimiq Pay** | The gap chit still has. Do it the day the board works, not the week of the deadline |

## I6. What is honestly still open

**How strong the bot should be.** Three search depths and a blunder rate is the plan; the numbers are
guesses until a real beginner plays it. It has to be beatable or the cold open drives people away —
tune it against someone who does not play chess, not against us.

**Whether polling holds up at blitz speed on a real phone network.** 500 ms is inside human reaction
time in theory. On 3G, in a WebView, with a serverless cold start in the path, it is unmeasured. This
is the one architectural decision in the spec that could still be wrong, and it is measurable in an
afternoon — build the clock and two clients first, and measure it before building anything on top.

---

# Part J — proven elsewhere, still not here

A third pass. Part H covered what Lichess's features page leaves out. This one covers what is
*demonstrably* loved — at Lichess, at Chess.com, or in a repository somebody maintains — and is
still not in this spec. Each row says where the proof is, because "people like it" is a claim.

Six of these are cheap enough that leaving them out is a choice rather than a trade-off.

## J1. The finished game as a picture

**Where it is proven:** Lichess renders every game as an animated GIF for link previews — that is an
entire service, `lichess-org/lila-gif`, maintained in Rust. Chess.com puts a board image on every
shared game. Nobody builds a whole service for something people ignore.

`lila-gif` is **AGPL-3.0** (verified 6 Sep) so not a line of it can be used, but the idea is not
copyrightable and the work is small: our board is already SVG, and an SVG board painted to a canvas
is a PNG in about thirty lines.

**Why it matters more here than there.** Part B3 says the share link is the entire distribution
strategy, and a link with no image is a grey rectangle in a chat. The certificate's payload should be
a *picture of the final position* with the result and the move count on it — that is the object that
travels, and it is the only thing in the entry a stranger will see before deciding whether to tap.

**BUILD — v1.** Still image first; an animated replay is a nice later.

## J2. Bots with names and faces

**Where it is proven:** Chess.com's bot roster is their most-played single-player mode, and the bots
have names, portraits and ratings. Lichess's Stockfish levels are numbers, and people talk about
Chess.com's bots by name. That difference is the whole finding.

Our spec (Part E4) already says the bot must be *beatable* and *adjustable* — three depths and a
blunder rate. Giving each level a name, a rating and an identicon face costs nothing and changes
"level 2" into an opponent. **Nimiq Space already renders identicons as faces** (`identiconTexture.ts`,
verified in `WINNER_TEARDOWNS_VERIFIED.md`), so the pattern is in the ecosystem and the assets are
free — every bot gets a wallet-style face derived from its name.

**BUILD — v1.** It is a naming exercise on code that already has to exist.

## J3. The bot should play openings, not moves

**Where it is proven:** every engine ships with an opening book, and the reason is that a
material-counting search plays the first six moves like nobody who has ever played chess. A beginner
notices immediately, and it is the fastest way for the bot to feel fake.

We already carry the CC0 openings dataset for H2. The same file is a book: for the first six moves,
play a move that stays in a named line; only then start searching. Free, because the data is already
in the bundle for another reason.

**BUILD — v1**, immediately after the bot searches at all.

## J4. The puzzle dashboard — which tactics you are bad at

**Where it is proven:** `lichess.org/training/dashboard` is one of their most-used improvement pages,
and it exists purely because the puzzle rows carry themes.

We are already storing per-theme results after H1. The report is a `GROUP BY`: strongest themes,
weakest themes, and a *Train this* button on the weakest. That button is the retention loop — it
tells a returning player exactly what to do next, which is the thing E2 says makes a loop stick.

**BUILD — v1, small.** It is a screen over data we already have.

## J5. Take your games with you

**Where it is proven:** Lichess lets anyone download every game they have played as PGN, and it is a
point they make loudly. chit shipped the same thing as a CSV export for tax and it is one of the most
concretely useful things in that product.

Here it is more than a convenience — it is **the thesis**. The whole pitch is that the rating is
yours and survives us. An export button that hands over every game in the format every chess program
on earth reads is that sentence made real, and it is one endpoint.

**BUILD — v1.** PGN for the games, and the signed scoresheets as JSON beside them, so someone can
verify the ratings offline.

## J6. The rating graph

**Where it is proven:** every chess site has one, on the profile, above the fold. Part E1 lists
"checking the rating" as a genuine return loop and Part A5 folds it into "public profile and rating
history" without ever calling it a graph.

A sparkline over the ordered games — which Part F2 already computes in canonical order — is an
afternoon, and it is the thing a player screenshots.

**BUILD — v1.** It comes free with the recompute page.

## J7. Watch a game that is happening

**Where it is proven:** Lichess TV is on their homepage. Part A1 marked it **LATER** because it needs
traffic, which is right for a *TV channel* picking games automatically.

But **spectating one specific game by link** is a different thing and needs no traffic at all: it is
the same share link with the moves read-only. It means a game can be watched while it is played, by
somebody who was sent it — which is exactly the growth mechanic Part B3 depends on.

**BUILD — with real-time play**, since it is that code with writes disabled.

## J8. Blindfold

**Where it is proven:** Lichess ships it; strong players use it to train and it has a small devoted
following. It is one CSS rule that hides the pieces.

**BUILD — one toggle.** The cheapest item in this entire spec, and the kind of thing that makes a
chess player think the builder plays chess.

## J9. Still out, after a third look

| | Why |
|---|---|
| Game Review with move classification — *brilliant, blunder, inaccuracy* | Chess.com's most-loved feature by a distance, and it is entirely an engine product. Every strong engine is GPL. **This is the biggest thing we cannot have**, and it should be said plainly rather than quietly omitted |
| Opening explorer over their game database | `lichess-org/lila-openingexplorer` is **AGPL-3.0** (verified) and the dataset is the product |
| Lessons, achievements, daily goals | All content or all engagement scaffolding. Real, and the wrong cost before a deadline |
| Lichess TV as an automatic channel | Needs traffic. J7 gets the useful half without it |

---

# Part K — the unbounded version

Parts A–J were written with 18 September in them. **That constraint is lifted.** This part is what
the product becomes when the only limits are correctness, licensing and what the platform actually
allows — and it is also, not by coincidence, the version that scores best.

Read it as the roadmap. Part C is still the order things get built in; this is where that order ends
up going.

**What does *not* change:** everything marked BLOCKED. Those are platform and licence facts, and no
amount of time moves them. They are collected honestly in K8.

## K1. Write our own engine — the master unlock

Every decision in Parts A–J that reads *"needs an engine, and every strong engine is GPL"* traces to
one root. There is exactly one way through it, and with time it is not even hard.

**Write an MIT engine. Ours.**

The instinct is that this means competing with Stockfish. It does not. Stockfish is ~3600 Elo because
it is analysing grandmaster games. **To find the blunders in a 1200-rated player's game you need
about 2000 Elo**, and 2000 Elo is a known, bounded piece of engineering:

- alpha-beta with iterative deepening
- quiescence search, so it stops mid-capture and hallucinating material
- a transposition table with Zobrist hashing
- killer-move and history heuristics for ordering
- an evaluation with material, piece-square tables, pawn structure, king safety and mobility

That is a few thousand lines, it is decades-old published technique, and **it is ours, so it is MIT
and it ships in the bundle.** In WASM if it needs the speed; plain TypeScript is likely enough at the
depths an amateur game requires.

**And it runs offline, on the phone, with nothing phoning home.** No chess app in this catalog will
have that, and Lichess itself cannot offer it — their analysis is a server.

## K2. What the engine unlocks

This is the largest single list in the spec, and every row on it was previously marked impossible.

| Now possible | Why it matters |
|---|---|
| **Game Review** — every move classified: brilliant, good, inaccuracy, mistake, blunder | Chess.com's most-loved feature by a distance (J9). It was the biggest thing we could not have. Now it is the thing we open the app with after every game |
| **Learn from your mistakes, in full** | Part A2 marked it *the best of these* and could only reach the tactical subset. Now all of it |
| **Puzzles generated from our own players' blunders** | This is literally how Lichess's puzzle database was built. It means the puzzle supply stops depending on a download and starts coming from the product |
| **Real anti-cheat** | `BRIEF.md` settled for move-time variance because there was no accuracy signal. Now there is: accuracy that is *too even across easy and hard positions* is the strongest tell there is, and it is exactly what the engine measures |
| **Bots at an exact rating** | "Level 2" becomes "1450". A player can pick an opponent 100 points above themselves, which is the single best way to improve and impossible with search-depth levels |
| **An analysis board with a real evaluation bar** | The screen every chess player expects after a game |
| **Opening preparation against your own repertoire** | Play your line, have the engine punish it, learn the refutation |

**The anti-cheat consequence still stands:** record and show, never auto-ban (`BRIEF.md`). A better
signal does not change the fact that there is no appeals process.

## K3. Variants

Each is a second rules engine, which is why Part A1 cut them all. With time, each is also a
self-contained module over the same board and clock.

**Chess960 first** — it is the cheapest (castling rules and a start-position generator) and by far
the most loved. Then, in order of demand: King of the Hill, Three-check, Antichess, Atomic, Horde,
Racing Kings, Crazyhouse. Crazyhouse last: piece drops change the board model itself.

## K4. Real-time over WebSockets, and Bullet restored

The HTTP-polling decision (`BRIEF.md`) was made for one reason: *nothing can be down when the judge
arrives at a random hour*. That is a deadline argument, not an engineering one.

With time, run the game loop over WebSockets on a persistent server — the pattern Nimiq Space uses
(native `ws` on its own box, verified in `WINNER_TEARDOWNS_VERIFIED.md`). It restores **Bullet
(1+0)**, makes premoves feel instant instead of merely correct, and makes spectating live.

Keep the polling path as the fallback, not as an embarrassment: a client that cannot hold a socket
degrades to polling and the game continues. That is a better system than either alone.

## K5. Studies, lessons, and coaching

- **Studies with chapters** — a shareable, annotated, persistent analysis. Part A2 called it "the
  certificate plus editing", which is exactly right and exactly why it comes after the certificate.
- **The `/learn` basics** — hand-authored lessons. Content, not code, and content is what time buys.
- **Coaching** — a stronger player annotates your loss for $2. Deferred in `BRIEF.md` only because it
  is a two-sided market to seed. **This is the part of the product that needs Nimiq most**: feeless
  payment is what makes a $2 lesson exist at all, since card rails floor at about 30¢. Seed the
  supply side by paying the first coaches out of the pool.

## K6. Tournaments

Arena and Swiss, with pairing. Honestly caveated: **these need a crowd, and a crowd is not a build
problem.** Building them before the population exists produces a scheduled event with four players,
which is worse than no event. Build them when there is someone to fill them.

## K7. The pool that funds itself — the Nimiq unlock nobody has taken

The most under-exploited fact in the whole platform, verified in `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`:

> **Full native staking is a first-class, fully-documented capability nobody in the catalog has built
> a dedicated app around** — and it is item #2 on a judge's own public wishlist.

Six documented staking methods sit on the provider: `sendNewStakerTransaction`, `sendStakeTransaction`,
`sendSetActiveStakeTransaction`, `sendUpdateStakerTransaction`, `sendRetireStakeTransaction`,
`sendRemoveStakeTransaction`. Not one app has used them.

**So do not spend the prize pool — stake it.**

The pool's NIM is delegated to a validator. Puzzle payouts come from the **staking rewards**, never
from the principal. The consequences are all good ones:

- **The pool is perpetual.** It is a tree, not a bucket. It cannot be drained, only out-earned — and
  if payouts exceed rewards, the app offers fewer of them rather than eating the principal.
- **Nothing is custodial.** It is the builder's own stake, delegated to a public validator, and every
  part of it — the stake, the validator, the rewards, every payout — is on chain and checkable.
- **It uses the one Nimiq capability nobody has touched**, answering a judge's stated wish, in a way
  that is load-bearing rather than decorative.

That gives the entry **three distinct, genuinely load-bearing Nimiq integrations**: `sign()` for the
scoresheet and the rating, payments for coaching, and staking for the pool. The 25-point pillar stops
being a payment button and becomes the product's economics.

## K8. What stays impossible, however much time there is

Said plainly, because a gap a judge finds unspoken is a miss and the same gap named is a decision.

| | Why it never becomes possible |
|---|---|
| **Correspondence chess** | There are **no push notifications on this platform.** Nothing can tell a player it is their turn, so days-long games become a graveyard of abandonments. A platform limit, not a time limit |
| **The opening explorer over six billion games** | The dataset *is* the product and cannot be reproduced. `lichess-org/lila-openingexplorer` is AGPL-3.0 and their public API returned **401** on 6 Sep. A personal explorer over our own games is free and is a different thing |
| **Stockfish-strength analysis** | Not 3600, and now **measured rather than guessed** — `node scripts/strength.mjs` runs the engine over the bundled Lichess puzzles, which carry real ratings. It finds the key move in **91%** and holds the **whole line in 86%**, weakest at 2400+ where it still holds 68%. That is enough to review an amateur game and not enough to correct a grandmaster. **The bias is stated with the number**: the bundled set keeps only puzzles of four player moves or fewer, so it is short forcing tactics — what a four-ply search with quiescence is unusually good at — and the script deliberately refuses to print a playing rating from it |
| **Escrowed wagers** | Nimiq has HTLCs; the Mini App provider has no extended-transaction method to create one, so any stake is necessarily custodial (`BRIEF.md`) |
| **Lichess TV as an automatic channel, broadcasts, simuls** | All need traffic. Spectating one game by link (J7) gets the useful half without it |

## K9. The phases

Part C still holds for the first pass. This is where it goes afterwards.

| Phase | What | Why in this order |
|---|---|---|
| **1** | Part C, steps 1–6 | A complete, shippable chess app: solo loops, real-time from a share link, the signed scoresheet, the derived rating, the funded pool |
| **2** | **The engine** (K1) | Everything in K2 is behind it, and nothing else is. It is the single highest-leverage thing to build second |
| **3** | Game Review, learn-from-mistakes, generated puzzles, accuracy anti-cheat, rated bots (K2) | All of it falls out of phase 2, and Game Review alone is worth more than any three other features here |
| **4** | Staking the pool (K7) | Needs a pool with a track record before it is worth making perpetual |
| **5** | WebSockets and Bullet (K4); Chess960 (K3) | Feel and breadth, once correctness is settled |
| **6** | Studies, lessons, coaching (K5) | Content and a market. Both need an audience that phases 1–3 create |
| **7** | Tournaments (K6), remaining variants | Last, and only once there is a crowd to fill them |

**Against the scorecard**, since the second half of the question was whether this wins:
Functionality 45 — phases 2 and 3 put it beyond every other entry, because nobody else can ship an
engine at all. Nimiq 25 — three load-bearing integrations, one of which nobody has touched.
Usage 15 — a perpetual pool that pays for skill creates wallets that did not exist. Design 10 — the
accessible board (H6) is evidence, not assertion. Promotion 5 — the certificate is a picture (J1).

That is the argument. It is not a prediction, and nothing above exists yet.

---

# Part L — reaching their quality legally: the clean-room programme

The goal here is explicit: **match Lichess's quality by studying Lichess properly, and own every line
of the result.** That is a legitimate, court-tested practice. It is also the single easiest thing on
this spec to get wrong in a way that cannot be undone later, so the protocol is written out.

*Not legal advice.* This is a reading of the licence texts and of settled doctrine, written so the
build does not have to guess. Anything load-bearing should be checked by someone qualified.
`../REFERENCE_APPS_LIFT_PLAN.md` §0 has the general version; this specialises it for chess.

## L1. The one rule that makes it legal, and the one thing that breaks it

Copyright protects **expression**, never function. Ideas, procedures, algorithms and interfaces are
excluded by 17 U.S.C. §102(b) and by Article 1.2 of the EU Software Directive, and *Google v. Oracle*
(2021) held that reimplementing an interface so people can use their existing skills is fair use.

So the thing that is protected is *how they wrote it*, not *what it does*.

**The rule: the person who reads the source must not be the person who writes ours.**

This is the whole protocol. Clean rooms exist because courts look at **access plus substantial
similarity** — and a developer who has read the original and then writes the same thing has access
by definition. The GNU FAQ is explicit that *translating* a program into another language produces a
derivative work, so retyping Scala as TypeScript from memory is a licence violation, not a rewrite.

**What breaks it, every time:** one context reading `lila` and then writing our server. That is not a
clean room, whatever it is called afterwards.

**What it looks like done properly**, and this is what makes it practical here:

1. A **reader** opens the source and produces a plain-English functional specification: what the
   component does, what its states are, what it does at each edge. No code. No identifiers. No
   comments carried over. No structure that is arbitrary rather than necessary.
2. A **writer that has never opened the source** implements from that specification alone.
3. Both are recorded, dated, and kept in the repository.

With separate agent contexts this is genuinely enforceable rather than an honour system: the writing
context is started fresh and never given the source. **Do that, and record that it was done.**

## L2. Read the right source — four tiers, in order of preference

The instinct is that the GPL source is the best source. For most of what we want it is not even the
*good* source, and reading it where a free one exists makes our position worse for no gain.

### Tier 1 — permissive: read it, port it, credit it. No ceremony at all.

| | What it gives |
|---|---|
| **`lichess-org/scalachess` — MIT, 782★** | **Lichess's own core chess logic**, permissively licensed by Lichess themselves: move generation, position handling, game rules, and their test suite. This is the highest-value thing on this entire list and it needs **no clean room**. Read it closely, port from it, credit it |
| `jhlywa/chess.js` — BSD-2 | The rules engine we actually depend on |
| `Clariity/react-chessboard` — MIT | Read it for board interaction decisions even though we are framework-free |
| `lila-db-seed`, `scalalib` — MIT | Lichess's own, permissive |

**Start here, always.** Lichess split their own licences deliberately, and the half they made MIT is
the half that is hardest to get right.

### Tier 2 — published knowledge: better than the code, and free

For the engine (K1), **the Chess Programming Wiki and the academic literature are the correct
source, not Stockfish.** Alpha-beta, quiescence, Zobrist hashing, transposition tables, killer and
history heuristics, null-move pruning, late-move reduction, piece-square tables — all of it is
decades of published technique, written up specifically to be implemented from.

Reading Stockfish would give us the same algorithms **plus** documented access to GPL expression. It
is strictly worse. **Do not open it.**

### Tier 3 — observable behaviour: play the product and write it down

Everything a user can see is free to copy: what happens when a premove meets an unexpected reply, how
a drag ghost behaves, what the low-time sound does, when the clock flashes, how the promotion dialog
appears, what the puzzle streak says when you fail.

This is where `chessground`'s real value is, and it needs no clean room and no source at all — a
session with the running product and a notebook beats reading GPL TypeScript, because what we want is
the *feel*, and the feel is observable.

### Tier 4 — AGPL/GPL source, clean-room protocol, last resort

`lila` (AGPL), `chessground` (GPL), `lila-gif` (AGPL), `lila-openingexplorer` (AGPL), Stockfish (GPL).

Use the protocol only for questions the first three tiers genuinely do not answer. In practice that
is a short list: server-side game-state architecture at scale, and their tournament pairing. Both are
things we do not need in phase one.

**`code100x/chess` has no licence at all** — all rights reserved, more restrictive than AGPL. Read it
for nothing.

## L3. What actually gets specced, and in what order

| # | Component | Which tier | Why |
|---|---|---|---|
| 1 | Move generation, rules, edge cases | **1** — `scalachess`, MIT | No ceremony. Their own test positions become our test suite |
| 2 | The engine | **2** — published technique | Better documented than any source, and it keeps us clear of Stockfish |
| 3 | Board interaction: premoves, drag, tap-tap, promotion | **3** — observed | The feel is visible; the code is not needed |
| 4 | Clock behaviour under lag | **3 + our own** — observed, then Part I3 | Already decided; observation only confirms it |
| 5 | Puzzle selection and rating movement | **1** — the CC0 dataset defines it | The data carries the ratings; the loop is ours |
| 6 | Game Review classification thresholds | **2 + ours** | What counts as a *blunder* is a number we choose, and choosing it ourselves is better |
| 7 | Server game-state architecture at scale | **4** — clean room, if ever | Not needed until there is scale |

Notice that **only row 7 needs the protocol at all.** That is the honest shape of it: doing this
"at maximum" mostly means reading the MIT half and the textbooks harder, not reading the GPL half.

## L4. The paper trail, which is the part people skip

A clean room that is not recorded is a claim, not a defence.

- **`NOTICES.md`** at the repository root, one line per lifted file: origin, commit hash, path,
  licence, what changed. Required by `LICENCES.md` §7 regardless.
- **`docs/cleanroom/`** — for every Tier-4 component: the written spec, dated; a note of who read the
  source and when; and an attestation that the implementing context never opened it.
- **Every dependency's licence checked from its own metadata before install**, never from a badge or
  from memory. `nimiq-css` published none at all and reached chit's production bundle before anyone
  looked.
- **Credit generously where nothing requires it.** Lichess's puzzle database is CC0 and needs no
  attribution; credit them anyway, prominently. The same for the tablebase API we call for free. It
  costs nothing, it is right, and a judge reading the repository sees a builder who understands what
  they are standing on.

## L5. Where reading the GPL source actively hurts

Worth stating plainly, because the instinct runs the other way:

- **It creates documented access** to expression we are about to reimplement, which is precisely the
  first half of what a claim needs.
- **It gives nothing Tier 1–3 cannot give** for every component we are actually building.
- **It anchors us to their architecture**, which is a Scala server at Lichess's scale and wrong for a
  Mini App on a phone.

Read `scalachess` — Lichess made it MIT on purpose, and it is their best code. Read the wiki. Play
the product. That *is* the maximum, and all of it is ours to keep.

---

# Part M — the audit against the actual 21 criteria

Part B was written from the reweight announcement. This part is written from
`../NIMIQ_OFFICIAL_COMPETITION_SITE_REFERENCE.md` §15 — **the official rubric, its own wording** —
and every one of the 21 criteria is checked against what this spec actually contains.

It finds four things the spec does not address at all, one weak claim, and one number that was
invented.

## M0. The number that was invented — correct this first

**Part B says "Functionality 45 · Nimiq 25 · Usage 15 · Design 10 · Promotion 5". Those numbers are
not published anywhere.** They were a reading of the reweight, written as if they were the rubric.

The facts, and only the facts:

- **The published rubric is 105 points: four pillars of 25, plus 5 bonus.** Design & UX,
  Functionality, Usefulness & Originality, Marketing & Distribution — 5 criteria each, scored 0–5.
- **The organiser said out loud that Cycle 2 reweights** toward Functionality and Usefulness /
  Originality, away from Marketing and Design (`../SIP_AND_SHIP_C2_CALL1_FINDINGS.md`).
- **The new weights are unpublished.** Nobody outside the Council knows them.

So the honest planning position is: **all four pillars still carry real weight, and Marketing is
reduced, not removed.** Treating Marketing as 5 points out of 105 is a guess that could cost a
quarter of the score. Part B's numbers should be read as an ordering, never as a budget.

## M1. Design & UX — 3 of 5 covered

| Criterion | Where | Verdict |
|---|---|---|
| First impression | E3, the cold open — the board is drawn before anything is tapped | **Covered, strongly** |
| Visual design | A4 — themes, two piece sets, three board colours | **Thin.** There is no design language here: no type scale, no spacing set, no colour tokens, no dark/light contrast targets. chit measures all of it (`scripts/design-metrics.mjs`, 32 contrast pairs). This spec has none of that and should |
| Navigation | — | **Absent.** No information architecture anywhere: no screen map, no back behaviour, no tab structure, no answer to *where am I and how do I get back*. For an app with puzzles, storm, bot, live games, a record page and a certificate, that is a real hole |
| Mobile experience | A4 — portrait-first, phone WebView | **Covered** |
| Onboarding, zero-to-using in under 60s | E3 — one tap, no wallet | **Covered, strongly.** This is the criterion the cold open was designed for |

## M2. Functionality — 4 of 5 covered

| Criterion | Where | Verdict |
|---|---|---|
| Core feature works reliably | A1, I2, I3, I4 | **Covered** |
| **Nimiq integration as a core part** | F (signed rating), K5 (paid coaching), K7 (staked pool) | **Covered, and this is the entry's strongest single answer** — three load-bearing integrations where most entries have one |
| Speed and performance | I1 — framework-free, own board, small bundle | **Covered** |
| **Error handling — fails gracefully or crashes and confuses** | — | **Absent.** Nothing in this spec says what happens when the wallet declines, the network drops mid-game, the server returns 500, the tablebase API is down, or the puzzle chunk fails to load. chit ships designed sentences for every wallet failure and a test suite for them, because a raw provider error string is how an app looks broken. **This is a whole criterion, unaddressed** |
| Completeness — finished or half-built | C, K9 | **At risk.** The phased roadmap is right for the product and dangerous for this criterion: a judge scores what is in front of them, and phase one alone must not read as a prototype. Every phase boundary has to be a *shippable, complete-feeling* app |

## M3. Usefulness & Originality — 4 of 5 covered, and one is weaker than it reads

| Criterion | Where | Verdict |
|---|---|---|
| **Problem solved — a real need or want** | The pitch | **The weakest claim in the entry.** "Chess.com owns your rating" is true and most chess players do not feel it as a pain. See M6 for the sharper version of the same claim |
| Target audience | Chess players | **Clear** |
| Originality | F — a rating derived from signatures, recomputable by a stranger | **Covered, strongly.** Genuinely impossible on any chess site |
| Repeat value | The whole of E | **Covered, strongly.** Part E exists for exactly this question |
| Ecosystem value — makes Nimiq Pay more attractive **to new users** | K7 — the pool pays people who did not have a wallet | **Covered.** And the bonus criterion, *does it incentivise NIM usage*, is the same answer |

## M4. Marketing & Distribution — 2 of 5 covered, and this is the real gap

Three of these five criteria are things **the builder does**, not things the app has. The spec is
silent on all three, and there is no version of the app that fixes that by itself.

| Criterion | Where | Verdict |
|---|---|---|
| Unique users — distinct wallets in the scoring period | J1 share image, J7 spectating, K7 pool | **Covered as mechanism.** The app gives people reasons to arrive and to connect a wallet |
| **User acquisition effort — did the builder actively promote it** | — | **Absent.** No plan, no channels, nobody named |
| **Content and storytelling — build documentation, a demo video, a compelling story** | I5 lists a video as a checklist item | **Barely.** A line item is not a story. This criterion rewards a build log, not an asset |
| **Community engagement — calls, progress, helping others** | — | **Absent.** The organiser said explicitly that *"builders who treat this as build-and-forget will score lower"* |
| Submission quality — app-store ready | I5 | **Listed, not designed** |

**This is potentially fifteen points of a hundred and five that nothing in this spec touches**, and
it is reduced by the reweight rather than removed. A perfect app with no campaign loses to a good app
with one.

## M5. What to add, concretely

1. **An error-handling part.** Every failure a user can meet, with the sentence they see. Copy chit's
   `explain()` shape: known wallet failures mapped to human sentences, unknown ones quoted and
   attributed, never a raw provider string. It is a scored criterion and it is a day.
2. **A navigation map.** Every screen, how you reach it, how you get back, what the tab bar holds.
   One diagram. Also a scored criterion.
3. **A design language before the first screen is styled.** Colour tokens with measured contrast, a
   type scale, a spacing set, tap-target minimums. Not taste — numbers, the way
   `scripts/design-metrics.mjs` does it, so *visual design* is evidence rather than opinion.
4. **A campaign, written down and started early.** Which communities (r/chess, chess Discords, the
   Nimiq Skool), what gets posted weekly, who the builder replies to. Marketing points **start
   accruing in week 2**, not at submission.
5. **A build log from day one.** The story is the criterion, and it cannot be written retroactively
   with any credibility.
6. **A phase-one definition that feels finished**, so *completeness* is never scored against a
   roadmap the judge cannot see.

## M6. The sharper problem statement

Worth changing in `BRIEF.md`, because *problem solved* is a scored criterion and the current framing
is the weak version of a strong claim.

**Weak:** "Chess.com owns your rating."  Most players hear that and think *so what*.

**Strong, and the same product:** **a rating nobody can take away from you.** Chess platforms close
accounts on suspicion, the rating and every game go with them, and the appeal is a form. That is a
loud, specific, widely-felt grievance — and a rating derived from signatures both players made is
the only possible answer to it. Nobody can revoke it because nobody issued it.

Same feature. One of these is a philosophical position and the other is somebody's Tuesday.

---

# Part N — interface: navigation, the board, the design language, and failure

Three of the 21 criteria live here — **Navigation**, **Visual design** and **Error handling** — and
Part M found all three unaddressed. This part closes them.

The board interaction section is the longest, and deliberately: in a chess app the board *is* the
interface, and every one of these details is a thing Lichess does that people would notice missing
without being able to say why.

## N1. The screen map

Eighteen screens, three tabs. Fewer tabs than that and things hide; more and the bar is a menu.

```
PLAY  (default — the board is drawn before anything is tapped)
├─ Home: daily puzzle board · Play the bot · Challenge a friend · your games in progress
├─ Bot game            ← one tap from home, no wallet
├─ Live game           ← from a share link, or from a challenge
├─ Challenge / share    (the link + QR + Nimiq Pay deep link)
└─ Spectate            ← the same link, read-only

TRAIN
├─ Daily puzzle · Puzzle Storm · Streak
├─ Puzzle dashboard     (strongest and weakest themes, with "Train this")
├─ Train a theme
├─ Coordinate trainer
├─ Endgame practice     (tablebase-judged)
└─ Board editor / analysis

YOU
├─ Rating and graph
├─ Public record  /r/<address>   ← the page a stranger opens
├─ Your games (list, PGN export)
├─ Certificate  /c/<gameId>      ← the page that spreads
└─ Settings · About
```

**Two of these are public URLs that must open for someone with no wallet, no account and no app:**
the record and the certificate. Everything else can assume the app.

## N2. Back behaviour

Undefined back behaviour is how a WebView app feels broken. The rules, all of them:

- **Every screen pushes history**; the platform's back gesture and the header's back arrow do the
  same thing. `history.pushState` and `popstate`, the way chit's `main.ts` does it.
- **Sheets and dialogs close on back**, they do not navigate. Promotion picker, settings sheets,
  confirm dialogs.
- **Back inside a live game does not leave the game.** It returns to the tab, the game keeps running,
  and a persistent "resume" strip sits at the top of Play until it ends. Leaving a rated game by
  accident is the worst possible back behaviour.
- **Back from a bot game just leaves**, since nothing is at stake.
- **Deep links land correctly cold.** Opening `/c/<gameId>` from a chat must render the certificate,
  not the home screen with a redirect.
- **The tab bar is never inside a game.** Full-bleed board, one back arrow.

## N3. The board — every interaction, because this is the product

Observed from lichess.org and chess.com, both played on a phone. All of it is behaviour, which is
free to copy (`Part L`, tier 3).

**Placing and moving**

- **Both input modes, always.** Drag *and* tap-tap (tap the piece, tap the square). Phones are
  tap-tap; the app must not force a drag.
- **Drag:** the piece follows the finger, enlarged slightly and lifted with a shadow, and the
  **square under the finger is outlined** — not the finger position, the square, because the finger
  covers the piece.
- **Legal destinations shown the moment a piece is picked up**: a small dot on an empty square, a
  **ring around the piece** on a capture. Beginners cannot play without this and strong players turn
  it off in settings.
- **Tap the piece again, or anywhere illegal, to deselect.** Never trap a selection.
- **Illegal move: the piece snaps back**, with a short shake, no dialog, no sound of failure.
- **Promotion picks in place** — the four pieces appear stacked on the promotion file, under the
  finger. Never a centred modal. Auto-queen is the default with a long-press for the others.

**During the game**

- **The last move is highlighted** on both squares, in a soft wash that does not fight the pieces.
- **Check highlights the king's square in red.** Checkmate holds it.
- **Premove is shown in a distinct colour** and is cancelled by any tap on the board or by an
  unexpected reply. One premove queued, not a chain.
- **The clock sits beside each player's name**, large, monospaced digits. It **turns red and starts
  ticking audibly under ten seconds** — the tick is a real part of blitz and its absence is felt.
- **The move list is scrubbable.** Tap any move to see that position; arrow keys and swipe walk it.
  Return-to-live is one tap and is always visible when you are not live.
- **The opening name sits above the move list** and updates as the moves are played (H2).
- **Flip board**, always one tap away.
- **Zen mode** hides names, clocks and the move list, leaving the board.
- **The board never moves on the page.** The layout is built around a fixed square so nothing
  reflows when the move list grows — a board that jumps mid-game is unusable.

**Ending**

- **The result appears in the move-list area, not in a blocking modal.** A modal over the final
  position stops people looking at the position, which is the thing they most want to look at.
- **The rating change is shown immediately** — `1284 +8` — because that is the number they came for.
- **Rematch and New game are right there**, at thumb height, and rematch is one tap.
- **Game Review is the primary action at the end screen** once the engine exists (K2), because the
  end of a game is the moment of maximum interest and Chess.com built an entire business on it.

**Puzzles**

- **Board, and "Black to play". Nothing else on the screen.**
- **Feedback is instant and non-modal**: a green flash and the opponent's reply for a correct move,
  a red flash and a retry for a wrong one. No dialogs anywhere in the loop.
- **Storm** shows a run counter, a draining timer bar and a combo streak, and nothing else.

**Mobile specifics**

- **The board is the width of the screen**, and every action sits below it, where thumbs are.
- **Haptics** on move, capture and check. Distinct sounds for move, capture, check, low time and
  game end, all mutable, all off in a call.
- **Nothing that opens a modal on launch.** The absence of interruption is a design decision Lichess
  is loved for, and it costs nothing to copy.

## N4. The design language, in numbers rather than taste

*Visual design* is a scored criterion, and the way to score on it is to make it measurable. chit
proves it out: `scripts/design-metrics.mjs` reads the tokens from the stylesheet and measures
32 contrast pairs, the type scale, tap targets and dead space. Copy the script, not the values.

- **Colour as tokens**, defined once, light and dark. Every text colour ≥ **4.5:1** on every surface
  it can sit on; every UI shape ≥ **3:1**. Measured, printed, and failing the build if it regresses.
- **Board colours must be colour-blind safe** and must pass the same contrast rule against both
  piece sets. Test the board in greyscale — if the squares vanish, the theme is wrong.
- **One type scale**, six sizes at most, with line heights. Chess needs exactly three text roles:
  the move list (monospaced, tabular), the clock (monospaced, tabular, large), and everything else.
- **One spacing set.** chit ships eight values; more than that is drift, not design.
- **Every tap target ≥ 44px.** A chess square on a 390px phone is 48px, which is the floor, so
  nothing else may go below it.
- **Motion:** one duration, one easing, and `prefers-reduced-motion` honoured. Pieces animate to
  their square in ~120ms; nothing else animates during a game.

## N5. Failure, designed — the criterion nobody plans for

*Does it fail gracefully or does it crash and confuse the user?* Every failure below gets a written
sentence, not a provider's error string.

| What breaks | What the person sees |
|---|---|
| Wallet declines the signature | "You didn't sign. The game is still recorded — you can sign it any time from Your games." Calm, not red. **Nothing is lost by declining** |
| Wallet is on the wrong network | "Your wallet is on the test network and this game is rated on mainnet. Switch Nimiq Pay and try again." |
| Network drops mid-game | A quiet "Reconnecting…" strip, the clock keeps its last known value greyed, and the board stays interactive for premoves. **Never a modal over a live game** |
| The opponent disconnects | "They've lost connection. Their clock is running." Then *Claim the win* when it hits zero (I2) |
| Server returns 5xx | "Something broke on our side. Your game is safe — it's on the server, not in this tab." Retry button |
| Tablebase API is down | Endgame practice says "Perfect play is unavailable right now" and still lets you play the position. **A dependency being down must never take a feature away entirely** |
| A locale or puzzle chunk fails to load | Fall through to English, or to the bundled puzzle set. Never a blank screen |
| The pool cannot pay | The earn card says so and offers nothing. chit's rule, copied exactly: **never offer what cannot be paid** |
| Anything unhandled | A real screen with the error text and a way back, never a white page. chit's `fatal()` shape |

**And the rule behind the table:** an unknown wallet error is **quoted and attributed** — *"Your
wallet reported: …"* — never reinterpreted and never shown raw. A wrong guess about an error is
worse than an honest quotation of one.

---

# Part O — the campaign

Three of the five Marketing criteria are things **the builder does**, not things the app has:
*user acquisition effort*, *content and storytelling*, *community engagement*. Nothing in Parts A–N
touches them, and no version of the app fixes that by itself. The organiser's own wording:

> *"Don't just build. Ship something polished, **tell the story of what you built, get real people to
> use it, and show up in the community.** Builders who treat this as 'build and forget' will score
> lower."*

Marketing points **start accruing in week 2**, not at submission. So this part starts on day one of
the build, not at the end of it.

## O1. The rule that makes any of this work

**Nobody in a chess community wants to read about your app. They want to read about chess.**

Every subreddit and forum worth posting in bans pure self-promotion, and rightly. The way through is
not a loophole — it is that **this build genuinely contains three things a chess audience finds
interesting on their own merits**:

1. **"I wrote a chess engine in TypeScript that runs offline in a phone wallet."** r/chess,
   r/programming and Hacker News all read that post. The app is a footnote in it.
2. **"Your chess rating, signed by your opponent, that nobody can revoke."** This is a genuinely
   novel idea and it argues with something people are angry about.
3. **"What 4 million CC0 puzzles look like when you group them by theme."** Data posts do well and
   the dataset is public domain.

Lead with the thing, mention the app. That is the entire strategy, and it is also just true.

## O2. Where, specifically

| Where | What works there | What does not |
|---|---|---|
| **r/chess** (~2.5M) | The engine post, the signed-rating idea, the puzzle data | A launch announcement. It will be removed |
| **r/chessbeginners** | The coordinate trainer and the free bot are genuinely useful to that audience | Anything about crypto |
| **Chess Discords** (Lichess's, Chess.com's community servers, streamer servers) | Asking for opponents is *welcome* there in a way it is nowhere else. This is the single best place to get real games played | Link-dropping without being present first |
| **The Nimiq Skool community** | Weekly progress. This is where *community engagement* is literally scored, and where the organiser reads | Silence until submission |
| **Nimiq Discord / Telegram / X** | Build clips, the certificate images, the pool's on-chain payouts | |
| **Hacker News** | The engine, once it plays a real game. Show HN | Before it works |
| **r/programming, dev.to** | The clean-room protocol (Part L) is itself an interesting post | |

**Not Lichess's own forums.** Posting a competing product there is bad manners and it will be read
that way.

## O3. Cadence — week by week, starting now

| Week | Build | Post |
|---|---|---|
| **1** | Board, rules, bot | Start the build log. One post: what is being built and why the rating idea is different. Introduce yourself in Skool |
| **2** | Puzzles, storm, coordinates | **Marketing points begin.** First real post — the engine, or the puzzle-data piece. Answer other builders' questions in Skool. Attend the call |
| **3** | Share link, live games, signatures | The certificate image is now shareable — post one. **Go to the Discords and actually play people.** Every game is a distinct wallet |
| **4** | Rating, recompute page, pool | The signed-rating post, with the recompute page as proof. Demo video. Submit early, not on the last day |
| **After** | Engine, Game Review | The Show HN. Judging is at random *after* the deadline, so the app must stay live and the story must keep going |

## O4. The build log, which is the storytelling criterion

*"Did the builder document their build, create a demo video, or tell a compelling story?"*

A build log cannot be written retroactively with any credibility, and judges can see when it was
written. So: **one short entry per build day, in the repository**, dated, with what was built and
what broke. Nimiq Space shipped **seventeen numbered decision records** in `docs/adr/` and placed
first — that is what "finished, not a prototype" looks like to somebody reading the repo.

The most valuable entries are the failures: the engine losing to a beginner, the polling latency
measurement, the first premove that cancelled wrong. Nobody believes a log with no bad days in it.

## O5. The demo video

Several Cycle 2 submissions were held up on a broken video URL alone. Beyond not doing that:

- **Sixty seconds.** Cold open on the board, solve the daily puzzle, beat the bot, send a challenge,
  play the game, sign the scoresheet, show the recompute page verifying it in a browser that never
  saw the server.
- **That last shot is the whole entry.** A stranger's browser recomputing the rating from signatures
  is the thing no other submission can film.
- **No slides, no voice-over about the vision.** A phone, a thumb, and the app.

## O6. Real users, and the line that must not be crossed

Usage is *distinct Nimiq wallets*, measured by **Nimiq's own Pay telemetry**, and
`../SIP_AND_SHIP_C2_CALL2_FINDINGS.md` is explicit that **gaming it disqualifies**.

So the pool (K7) and the share link are the acquisition strategy, and both are honest by
construction: somebody solves a real puzzle and is paid from real staking rewards, or somebody is
sent a game link by a person who wanted to play them. Neither creates a wallet that did not want to
exist.

**Do not** create wallets, do not pay people to open the app, do not run the pool through a script.
The disqualification risk is not worth any number of points, and the numbers would be a lie anyway.

## O7. Submission quality — *app-store ready*

The criterion asks whether it looks **app-store ready**, which is a higher bar than complete.

- Icon and thumbnail that read at 48px, not a screenshot shrunk down
- Screenshots that show the *board*, the certificate and the record page — the three things nothing
  else in the catalog has
- A description whose first line is the sharp claim (M6), not a feature list
- `README.md` written for a judge opening it cold, with the sixty-second path first — chit's shape
- MIT `LICENSE` and `NOTICES.md` present and correct
- **Submitted days early.** The PR is a file; the risk is a broken URL discovered at 23:00 UTC

---

# Part P — the last audit: the Nimiq surface, and what is still open

Two questions, answered by checking rather than by remembering: **are we using everything Nimiq
gives us**, and **what in this spec is still undecided, unchecked or unplanned.**

## P1. The Nimiq surface, method by method

Every method in `../NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §3, against what this project actually does
with it.

**This table was written as a plan and read as a claim**, which is a bad thing for a table in a
repository a judge opens. It said "yes" against four staking methods that no code calls and "NOW
ADDED" against three capabilities that were declared and never wired, and closed by counting
thirteen of fifteen. The **Built** column below was filled in by grepping the tree, method by
method, and the count at the bottom is the real one.

| Method | Planned | Built | Where |
|---|---|---|---|
| `listAccounts()` | yes | **yes** | Identity, on a tap and never on load. `apps/web/src/wallet.ts` |
| `sign(message)` | yes | **yes** | The scoresheet, and therefore the rating. **The reason the product exists** (F). `sign-game.ts` |
| `getBlockNumber()` | yes | **yes** | `endedAtBlock` — the canonical ordering key for the Elo chain (F2). `wallet.ts` |
| `isConsensusEstablished()` | yes | **yes** | Asked before signing, so a wallet still syncing is a sentence rather than a two-minute timeout. `wallet.ts`, `sign-game.ts` |
| `requestDeviceIdentifier()` | yes | **yes** | One payout per device per day, without a login. `wallet.ts`, `puzzle-screen.ts` |
| `sendBasicTransactionWithData()` | yes | **yes, both ways** | The pool's payouts are built server-side with `@nimiq/core` from the pool's own key. **And a player sends their own**: a tip to the opponent after a live game, and a top-up into the puzzle pool, both through the provider from the player's wallet, memo carrying the game or the day. `send-nim.ts` |
| `sendBasicTransaction()` | no, deliberately | — | We always want the memo. The plain form has no use here |
| `sendNewStakerTransaction()` | yes | **as a protocol call** | `TransactionBuilder.newCreateStaker` in `packages/server/src/staking.ts`, from the pool's operator wallet rather than a player's |
| `sendStakeTransaction()` | yes | **as a protocol call** | `TransactionBuilder.newAddStake`, same file |
| `sendSetActiveStakeTransaction()` | yes | **no** | Adjusting how much of the pool earns. Not needed until the pool is funded and running |
| `sendUpdateStakerTransaction()` | yes | **no** | Changing validator. Same |
| `sendRetireStakeTransaction()` | yes | **no** | Winding the pool down. Same |
| `sendRemoveStakeTransaction()` | yes | **no** | Withdrawing principal — which the rules say we do not do while the pool runs, so this one may never be built at all |
| `window.nimiqPay.language` | yes | **yes** | The whole app, in the five languages the host supports. `i18n.ts`, `strings/` |
| ~~`window.nimiqPay.userFiat`~~ | yes | **does not exist** | Checked against `@nimiq/mini-app-sdk`'s own `NimiqPayHostContext`, which declares exactly `language` and `requestDeviceIdentifier`. It was in our type and faked by our stand-in wallet, and it was never real. Removed |
| **Ethereum provider (EVM, USDT, 5 chains)** | no, deliberately | — | The organiser's own words are *"make the coins exactly NIM."* An EVM path would add a second rail, a gas problem a new wallet cannot solve, and nothing the product needs |
| `@nimiq/identicons` | yes | **yes** | A face beside every address the app shows — the record, the opponent in a live game, and each bot (J2). Lazy-loaded, and the *bundled* build, because the package's `browser` entry fetches its sprite over the network. `identicon.ts` |
| `@nimiq/utils` historic rates | yes | **no, and deliberately** | What a payout is worth in money. Measured on 2026-09-07: **NIM is $0.00034**, so the 0.5 NIM daily reward is **$0.00017** and a 25 NIM tip is under a cent. Every figure in the app would render as `$0.00`, which would make a real on-chain payment look like nothing. The dependency was installed to check that and then removed |
| Public RPC from the browser | yes | **no** | The recompute page verifies *signatures* without our server, which is the load-bearing half; it does not currently read block heights from a public node, so the ordering is taken from the signed text rather than re-checked against the chain |

**Honestly counted: eight of the fifteen provider methods are used, two more are used as protocol
calls from the server's own wallet rather than through the provider, and four staking methods are
unbuilt.** `@nimiq/identicons` is used; `@nimiq/utils` is not, for the reason in its row.

That is still, as far as the catalog shows, the only Nimiq staking of any kind in a shipped Mini
App — and `sign()` is load-bearing here in a way it is nowhere else. The overstated version of this
table did the project no favours: the true claim is strong enough, and a judge who checks one row
and finds it false stops believing the other nineteen.

**That gap is closed.** It used to read: *every transaction in the app is sent by the pool, never by
a player*. A player now sends their own, in both directions — a tip straight to the opponent's
wallet after a game, and a contribution into the puzzle pool. Neither is custodial and neither is a
wager: the rules ban games of chance outright, and a stake on a result would need an escrow the Mini
App framework has no method for (K8).

## P2. The trick that was not being used

chit's best idea is not the signing. It is that **the payment carries the reason for itself**: the
64-byte memo holds the digest of the agreement, so the transaction explains itself on chain forever,
with no server.

Chess was going to send payouts with an empty memo. Fix it:

- **Every puzzle payout carries the puzzle id** in the memo.
- **Every coaching payment carries the game id.**
- So the pool's entire history is auditable by a stranger with a block explorer and nothing else —
  which is exactly what K7 claims when it says every payout is public.

Free, and it turns the pool from *"trust our ledger page"* into *"here is the chain"*.

## P3. Still undecided — decide these before the first game is played

| | Decision |
|---|---|
| **Rated or casual** | Bot games are **never rated**. Human games are rated by default, with a **casual toggle** on the challenge screen. **Takeback exists only in casual.** Both players' choice is in the signed scoresheet, so a rated game cannot be relabelled afterwards |
| **Who plays white** | Random on a new challenge; **alternating on rematch**, which is what every chess platform does and what people expect without being told |
| **Time controls offered** | 3+0, 3+2, 5+0, 5+3, 10+0, 15+10 — six presets, plus a custom row. **1+0 is cut** while transport is polling (`BRIEF.md`) |
| **Abort** | Either player may abort with **no moves played**, unrated, no record. After one move it is a resignation. This is the standard rule and its absence traps people in mis-clicked games |
| **The bot before the engine exists** | Three named levels by search depth and blunder rate, **shown without a rating number**. A fake rating on a weak bot is a lie the engine will later expose |
| **Rating floor and provisional display** | Floor 100 (F3); provisional shown as `1284?` until ten distinct opponents (F4) |

## P4. Unchecked, now checked — and one of them is a problem

**The puzzle database is 304 MB compressed.** Measured 6 September 2026: `Content-Length:
304,384,407` on `lichess_db_puzzle.csv.zst`, so roughly a gigabyte expanded. Part H1 says "serve it
from our own copy" as though that were free. It is not, and it would have been found the hard way.

**The plan:**

- **Bundle a curated subset**: about 5,000 puzzles, spread evenly across rating bands and the
  common themes, as compact JSON. A few hundred kilobytes, it works **offline** (H5), and it is
  months of play for any normal player.
- **Serve the rest from our own store**, indexed by rating and theme, fetched a page at a time as the
  player's puzzle rating moves.
- **Never call Lichess's API at runtime.** The daily puzzle comes from our own data, so the most
  important screen in the app has no dependency on anybody else's uptime.

**Also unchecked, and they must be before anything ships:**

- **Sound assets.** Lichess's move sounds ship inside an AGPL repository. Use **CC0 or
  public-domain** sounds, or synthesise them with the Web Audio API — a move click and a low-time
  tick are a few lines of oscillator, and then they are ours and weigh nothing.
- **The font.** Whatever is chosen must be OFL or similar, checked from its own metadata.
- **Every dependency's licence read from its own package metadata before install.** `nimiq-css`
  published none at all and reached chit's production bundle before anyone looked.

## P5. Unplanned — the engineering nobody wrote down

| | What it needs |
|---|---|
| **The data model** | Games, moves, puzzle attempts, ratings, scoresheets, pool payouts. One schema, behind chit's storage-interface shape so SQLite and an object store are both implementations rather than rewrites |
| **Rating recomputation cost** | F5 recomputes the whole Elo chain on every read, which is O(all games this wallet has played) and grows forever. **Checkpoint it**: store the rating after game *n* with the hash of the chain that produced it, recompute only from there, and let the public page recompute the whole thing on demand because that is the point of it |
| **The certificate's link-preview image** | J1 makes the certificate a picture; a link preview needs that picture at a URL a crawler can fetch, which means a server-rendered image endpoint. A chess result is not private — unlike a chit, where the same feature was declined precisely because it leaks a deal into a group chat |
| ~~**Rate limiting**~~ | **Built** — `packages/server/src/limits.ts`. Token buckets rather than fixed windows, sized so no human playing bullet can reach the move limit, tight on creating games and claiming money, and keyed on the route rather than on anything a caller can claim about itself |
| **Retention** | There are no accounts, and games are still personal data of a sort. Decide and publish: how long unrated and abandoned games are kept, and what a person can delete. "We keep signed scoresheets forever because they are the rating" is a fine answer — but it has to be *said* |
| **Hosting cost of the pool's own uptime** | The staked pool must be able to pay out when nobody is watching. Decide whether payouts are on-demand at claim time (like chit's confirm-on-read) or swept by a worker |

## P6. What remains genuinely open

Only two, and both are measurements rather than decisions:

- **Whether 500 ms polling holds at blitz on a real phone network** (I6). Measurable in an afternoon;
  build the clock and two clients first.
- **How strong the bot should be** (I6). Guesswork until somebody who does not play chess tries it.

Everything else in this spec is now decided, checked, or explicitly deferred with a reason.

## P7. What these tables now get wrong, having been built

Parts A–J were written **before** the build, as calls rather than as status, and several of those
calls have since been overtaken. A reader who meets *"needs an engine, and every strong engine is
GPL"* and stops there would be reading a plan, not a product. The rows that moved:

| Marked | Now | Where |
|---|---|---|
| *Learn from your mistakes* — **LATER**, *"needs an engine"* (A2, H7) | **Built.** Every move judged, an accuracy for each side, the engine's move as an arrow | `apps/web/src/study-screen.ts`, `packages/core/src/analysis.ts` |
| *Analysis board with Stockfish* — **BLOCKED as shipped** (A2) | **Still true about Stockfish**, and no longer the end of the story: the engine is ours and MIT, so the analysis ships in the bundle | `packages/core/src/search.ts` |
| *The engine* — **LATER**, after the cycle (K1, and the README's own "what is not done") | **Built.** Its own 0x88 board, 6.1 M nodes/sec, perft-verified to depth five and agreeing with `chess.js` move for move over thousands of random positions | `packages/core/src/position.ts` |
| *Coordinate trainer* (H5) | **Built**, to Lichess's own definition — both modes, thirty seconds, averages kept per orientation | `apps/web/src/coordinate-screen.ts` |
| *PGN import* (A2) | **Built.** A game arrives from Lichess, Chess.com or a tournament and opens on the board | `packages/core/src/pgn.ts` |
| *Rate limiting* — *"absent here"* (P5) | **Built.** Token buckets, by route | `packages/server/src/limits.ts` |
| *Bot faces* (J2) | **Built**, and everywhere else an address appears too | `apps/web/src/identicon.ts` |
| *Localisation* — nothing called `hostLanguage()` (P1) | **Built.** Five languages, one chunk each | `apps/web/src/i18n.ts` |
| *No player-initiated transaction* (P1) | **Built.** A tip to the opponent, and a contribution into the pool | `apps/web/src/send-nim.ts` |
| *A clock against the bot* — not planned at all | **Built**, because Lichess offers one and this did not | `apps/web/src/clock.ts` |

And two things this audit found that were **wrong rather than merely unbuilt**, both of which would
have failed silently on a real phone:

- **`requestDeviceIdentifier` was called with a bare string.** The documented signature is
  `({ reason })`, and an empty reason *throws* — so the entire puzzle-pool payout was unclaimable
  inside real Nimiq Pay, while every test passed because our stand-in wallet had copied the same
  wrong shape.
- **`window.nimiqPay.userFiat` does not exist.** It was declared in our host type and faked by the
  stand-in wallet. `@nimiq/mini-app-sdk`'s own `NimiqPayHostContext` has exactly `language` and
  `requestDeviceIdentifier`. Removed rather than built against.

---

# Part Q — meaningful, the way Cycle 2 actually asks for it

**This part governs. Where an earlier part conflicts with it, this one wins.**

Parts P and K optimised for *using more of Nimiq*. Re-reading the organiser's own words, that is the
wrong target, and in one respect it is actively harmful.

## Q1. What he actually said

Three quotes from `../SIP_AND_SHIP_C2_CALL1_FINDINGS.md`, all of them his:

> **"Not everything has to be payments related. It could be payments adjacent."** — giving a
> non-financial app (a TV recommendation app with a tip button) **10 out of 10** for idea and intrigue.

> The rules still require Nimiq to be **"a core part of the user experience"**, not decoration.

> **"A judge who cannot quickly understand your app scores it lower."** Three rules of one-sentence
> pitches, layered mechanics, multi-currency multi-chain logic — **all of that costs you points even
> when it works.**

Read together, the target is not *how many capabilities* but **one money moment that obviously
belongs**, inside a product that is worth opening for its own sake.

Chess is exactly the shape he described: a real non-financial product, played for its own reasons,
with small natural money moments inside it. That is a validated 10/10 shape, not a workaround.

## Q2. What this changes — three integrations was a mistake as a *pitch*

Part K7 made staking a headline. Part P counted thirteen methods and treated the count as the score.
Both are wrong against the third quote: **a judge who has to hold three separate Nimiq mechanics in
their head is a judge who understands the app less quickly.**

So the mechanics stay. The **story becomes one sentence**:

> **Both players sign the result. That signature is your rating — and skill earns.**

- `sign()` **is the product.** The scoresheet, the rating, the recompute page. This is the whole
  Nimiq pitch and it should be the only thing said out loud.
- **Payments are the small natural moment**: a few cents for solving a real puzzle, two dollars for a
  stronger player to review your loss. Payments-adjacent, exactly as described.
- **Staking is plumbing, and is demoted to invisible.** It is genuinely elegant, it is on a judge's
  own wishlist, and **it must not appear in the pitch, the video, the first screen, or the README's
  opening.** It lives on the pool page for anyone who looks, one line: *"the pool is staked; payouts
  come from the rewards, never the principal."* A judge who finds it is impressed. A judge who has to
  be told it is a judge being taught a second mechanic.

**The rule for the whole build:** if explaining a Nimiq capability takes a sentence of setup, it goes
below the fold. Depth is rewarded; breadth that has to be narrated is not.

## Q3. The usage number is small, and that changes the campaign

`../SIP_AND_SHIP_C2_CALL2_FINDINGS.md` has the organiser's own bands for *unique wallets*, counted
by Nimiq's telemetry:

| Wallets | His words | Points |
|---|---|---|
| 0–3 | *"probably the builder, maybe a co-founder or a friend"* | **0** |
| 4–10 | *"you've at least promoted it to some friends, one Telegram group, a Reddit group"* | **6** |
| 11–24 | *"meaningful traction… a great start in four weeks"* | **10** |
| **25+** | *"standout traction"* | **15 — full marks** |

**Twenty-five distinct wallets is full marks.** Not twenty-five thousand.

That reframes Part O entirely. This is not a growth-hacking problem — it is *one good evening in a
chess Discord*, where asking for opponents is welcome and every opponent is a distinct wallet by
construction. Two people playing one game is two wallets.

**So the highest-leverage marketing act in the whole plan is: go and play twenty-five games with
real people.** It is also the most honest, and it doubles as testing. Everything else in Part O is
support for that one thing.

And the counterweight, in his words: *"if it seems like you are using bots, gaming, or cheating this
in any way, your mini app will be disqualified… It's not our first time on the internet."*

## Q4. The five-minute walkthrough — what the judge actually meets

Because *"a judge who cannot quickly understand your app scores it lower"*, the app has to be
legible in one pass with no explanation. Write this walkthrough down and build against it.

| Minute | What they see | What they must not have to be told |
|---|---|---|
| 0:00 | The board, with today's puzzle already set up. They solve it | Anything. No splash, no modal, no wallet prompt |
| 0:30 | *Play the bot* — one tap, a game starts, the bot has a name and a face | That the engine is ours, or MIT, or offline |
| 2:00 | They win. **Connect wallet to sign the result** — one tap, one signature | Why signing matters; the button says *"sign the result so it counts"* |
| 2:30 | Their rating appears: `1208?` with *provisional · 1 of 10 opponents* | The Elo maths |
| 3:00 | **Recompute** on the record page — the number is re-derived in front of them | This is the moment the entry lands. It has to be one button |
| 4:00 | *Challenge a friend* produces a link, and a certificate of the game they just played, as a picture | |
| 5:00 | They wander into Train, or the pool page, and find staking | Nothing — anything found here is a bonus, not a requirement |

**If any row above needs a sentence of explanation, that row is wrong**, not the judge.

## Q5. What this de-prioritises, honestly

Against the "complexity costs points" rule, some things in this spec are for the product and not for
the score, and should be built in that order:

- **Variants (K3)** — more rules to understand, no new story. After the cycle.
- **Coaching (K5)** — a second market to explain. It is the best *product* idea here and the worst
  *pitch* addition. Build it once the rating is understood.
- **Tournaments (K6)** — needs a crowd and adds a mechanic. Last.
- **Multi-chain / EVM** — already refused, and the quote about *"multi-currency multi-chain logic"*
  costing points even when it works confirms it independently.

And what this **raises**:

- **The recompute page (F5)** is the entry. It is the only screen no other submission can build, and
  minute 3:00 above is the whole case. It should be the most polished thing in the app.
- **The cold open (E3)** is second, because it is minute 0:00 and there is no second chance at it.
