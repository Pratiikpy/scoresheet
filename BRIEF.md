# Scoresheet — the brief

**Team:** Prateek's sister. A **separate team** from chit, which is what makes a second entry legal:
the competition allows one app per team per cycle.

**Status:** decided, not started. Cycle 2 closes 18 September 2026, 23:59 UTC and is judged at random
after that — but **the spec is not scoped to that date.** It is scoped to being the best chess app
that can exist on this platform; `SPEC.md` Part C is the first shippable pass and Part K9 is
everything after it.

`SPEC.md` is the build spec — every Lichess feature with a call on it, and every scoring block.
`LICENCES.md` settles what may legally be used. This file is the concept and the decisions.

**`SPEC.md` Part K is the one to read.** It lifts the deadline and carries the roadmap, including the
single biggest unlock in the product: **writing our own MIT engine.** Every refusal in this file that
says *"needs an engine, and every strong engine is GPL"* dissolves the moment that exists — Game
Review, learn-from-your-mistakes, puzzles generated from real blunders, accuracy-based anti-cheat,
and bots at an exact rating. It does not need to be Stockfish. Finding a 1200-player's blunders takes
about 2000 Elo, which is a few thousand lines of published technique, and it would be **ours, MIT, in
the bundle, and running offline** — which Lichess itself cannot offer, because their analysis is a
server.

Part K also takes the one Nimiq capability nobody in the catalog has touched: **stake the prize pool
instead of spending it**, and pay puzzle solvers from the staking rewards. The pool becomes perpetual
and stays entirely non-custodial. Six documented staking methods, zero apps using them, and it is on
a judge's own public wishlist.

**But read `SPEC.md` Part Q before acting on any of that — it governs.** The organiser said plainly
that *"a judge who cannot quickly understand your app scores it lower"*, and three separate Nimiq
mechanics is three things to hold. So the staking stays built and is **demoted to invisible
plumbing**: it belongs on the pool page, never in the pitch, the video or the first screen. The
Nimiq story is one sentence — **both players sign the result; that signature is your rating, and
skill earns** — and everything else is found rather than narrated.

---

## The name

**Scoresheet.** In over-the-board chess the scoresheet is the paper both players write the moves on,
and **both of them sign it at the end to agree the result.** That is exactly this product: the same
object, with the signature made real. Every chess player already knows the word, it explains the
mechanic in one sentence, and it is not a crypto word.

The alternative, if a shorter name is wanted: **Perpetual** — a real chess term (perpetual check)
that also means *lasting forever*, which is what a rating you own actually is. The name is the
sister's call; nothing in the build depends on it.

---

## The pitch, in one line

**A chess rating nobody can take away from you.**

Chess platforms close accounts on suspicion, and the rating and every game go with them; the appeal
is a form. That is the pain — not the philosophical one. A rating derived from signatures both
players made cannot be revoked, because nobody issued it. (`SPEC.md` M6 on why the older framing —
*"Chess.com owns your rating"* — is the weak version of the same claim.)

Every finished game produces a scoresheet — the result, the final position, both players — signed by
both wallets. The Elo is *derived* from those signatures rather than stored in anyone's database, so
a stranger can recompute it from the signatures alone and it survives this app disappearing.

No chess site can offer that. It is the only thing here that is genuinely impossible elsewhere, and
it makes `sign()` the reason the product exists rather than a login button.

---

## Why chess, and why now

**Chess is not in the field.** Verified against `catalog_apps.json` (9 games in the 75-app catalog,
none of them a board game) and re-checked against the submissions repo on **6 September 2026**:
`nimiq/miniappscompetition-submissions` has **10 Cycle 2 submissions, all merged, and none of them is
a chess app.** The closest is TeTe on Nimiq, which is stake-vs-stake skill competition with chess
named as one example.

**Games are the crowded category, so the game cannot be the differentiator.** All three Cycle 1
winners were games and a judge said publicly that utility has better odds this cycle. The signed
rating and the single-player loop are what make this an entry rather than an arcade cabinet.

---

## The decision that shapes everything

**A judge opens this alone, on a phone, at a random moment after 18 September, with nobody else
online.** That is stated outright in `SIP_AND_SHIP_C2_CALL2_FINDINGS.md`, and it is the single
highest-risk moment in the entry.

So: **the single-player loop is the product, and chess against a person is the payoff.** Not the
other way round. An app whose first screen is a lobby is an app whose first screen is empty.

This is not a scope cut — real-time chess is still built, and it is still where the signed
scoresheets come from. It is an ordering. The board is on screen when the app opens, and something
is playable in one tap with no wallet, no opponent and no wait.

---

## The five parts, in the order they earn points

Scoring: the published rubric is **105 points — four pillars of 25 plus 5 bonus, 21 criteria**. The
cycle reweights toward Functionality and Usefulness/Originality and away from Marketing and Design,
but **the new weights are unpublished**, so Marketing is reduced rather than removed. `SPEC.md`
Part M audits this app against all 21 criteria and finds four it does not answer.

### 1. A board that is never empty — *Functionality, and the cold open*

Daily puzzle drawn on the home screen, already set up. Puzzle Storm against your own best score. An
MIT bot we write ourselves, because every strong engine is GPL (`LICENCES.md` §6) and a bundle
containing one cannot be MIT. Endgame practice judged perfectly by `tablebase.lichess.ovh`, which
answers unauthenticated — verified 6 Sep.

None of it needs an opponent, a wallet, or a connection to anyone. This is what a judge meets.

### 2. Real-time chess from a share link — *Functionality, the largest block*

The server holds the position and validates every move; the browser is never trusted with the board.
The move list is the replay, so re-validation is free.

**The share link is the entire distribution strategy**, not a feature — there is no discovery inside
Nimiq Pay, so every player arrives from a link another player sent. Build it first among the
multiplayer work, not last.

### 3. The signed scoresheet, and the rating derived from it — *Nimiq 25, and the originality*

Both players sign the finished game. The Elo is computed from the set of signatures and never
written to a row anyone controls, and a public page lets a stranger recompute it in their own
browser from those signatures alone.

Two properties fall out that no chess platform has: a rating you can take somewhere else, and a
rating nobody can revoke. **The exact design — what is signed, how the order is fixed, and what
stops somebody farming a rating against their own second wallet — is `SPEC.md` Part F.** It is the
differentiator, so it is specified rather than gestured at.

### 4. Learn-to-earn puzzles from a funded pool — *Usage, 15*

Solve a real puzzle, earn a few cents of NIM from a pool the builder funds. Pure skill, so it clears
the no-chance rule. It is also the organiser's own unprompted wish for this cycle — *earn NIM by
testing Mini Apps* — pointed at chess, and it is the only mechanic here that creates wallets that did
not previously exist.

Copy chit's bounty discipline exactly, or it gets drained: one payout per device per day via
`requestDeviceIdentifier`, one per wallet per day, a daily ceiling the key cannot exceed, every
payout public with its transaction, and **nothing offered when the pool cannot pay**.

### 5. A shareable game certificate — *Promotion 5, and the growth loop*

"I beat a 1900 in 24 moves", as an object a stranger can verify without an account. Cheap to build,
and the only thing here that spreads — which matters more than usual, given the distribution facts
below.

---

## The four decisions that were open, now closed

**Transport: HTTP, not WebSockets.** Moves POST to the server; the opponent polls at 500 ms while a
game is live and backs off to 3 s when idle. That is inside human blitz reaction time, it runs on
serverless with no box to keep alive, and — the deciding argument — **nothing can be down when the
judge arrives at a random hour.** The cost is that **Bullet (1+0) is cut**; Blitz upward is fine.
A WebSocket server is a post-cycle upgrade, not a dependency.

**Anti-cheat: record and show, never auto-ban.** With no engine in the bundle there is no accuracy
signal, but there is a better one that needs no engine: **move-time distribution.** A human's
thinking time varies enormously with how hard the position is; an assisted player's does not. Store
the variance per game, surface it on the certificate only when it is extreme, and never block a
payout automatically. A false positive against a strong player is worse than a missed cheat, and
there is no appeals process to run.

**Wagers: no — and the reason is now verified, not assumed.** Nimiq PoS *does* have HTLC contracts
(`@nimiq/core` exports `HtlcContract`, `HtlcData` and three proof types), but **the Mini App provider
has no extended-transaction method** — its whole payment surface is `sendBasicTransaction(WithData)`,
and a basic transaction cannot create a contract. So any wager inside a Mini App is **necessarily
custodial**: the app holds the pot, exactly as NimJump does (`vsPayoutFrac = 0.95`, and that one file
is 2,135 lines of edge cases). Holding other people's money is a different product with a different
legal position. TeTe on Nimiq submitted stake-vs-stake on 4 September, so it is not the thing that
would stand out either.

**Coaching: later.** A stronger player annotating your loss for $2 is real, and feeless is what makes
a $2 lesson possible at all — card rails floor at about 30¢. But it is a two-sided market that has to
be seeded from nothing, in twelve days. Keep it in the README as the next thing; do not build it now.

---

## Things that are true and will otherwise cost days

**There is no discovery inside Nimiq Pay.** `nimpay.app/api/miniapps` returned **11 apps** on 6 Sep,
six of them external DeFi sites, and none from Cycle 2. Every player arrives from a link another
player sent. The share link is the strategy, and it should be the first multiplayer thing built.

**The `https://nimpay.app/miniapps/open/<host>` link 404s** for any unregistered host. Use
`nimiqpay://miniapp?url=` plus the platform's own store listing.

**A first open of an unlisted app shows a warning.** Say so in the copy rather than promising magic.

**`sign()` has no domain separation**, so a testnet signature verifies on mainnet. Put the chain and
a nonce *inside* the signed bytes.

**The signed-message digest is `SHA-256(prefix ‖ decimal(byteLength) ‖ message)`** with
`prefix = "\x16Nimiq Signed Message:\n"`, and that length is the **byte** length, not the character
count. Nimiq's own published snippet gets this wrong for non-ASCII. chit's
`packages/verify/test/keyguard-vectors.test.ts` pins it against the Keyguard's own vectors — copy
that test before writing any signing code.

**`sign()` and `listAccounts()` can resolve with `{error: {type, message}}`** as well as rejecting.
Handle both.

**There is no `getBalance` on the Nimiq provider.** Read balances from a public RPC server-side, the
way chit's `/api/balance/:address` does.

**Never ask for a wallet on page load.** Detect silently; request the address on a tap. A stranger
should be able to solve the daily puzzle and beat the bot before connecting anything.

---

## What to copy from the winners, verified in their repositories

From `WINNER_TEARDOWNS_VERIFIED.md`:

| From | What | Why it applies here |
|---|---|---|
| NimJump | The server is the authority; most of the build went there, not into content | Chess is decided by whoever holds the position |
| NimJump | Replay validation of a compact input log | The move list is already that log |
| NimQuest | Answer keys stripped from the browser bundle at build time | Puzzle solutions stay server-side or the app is a lookup table |
| Nimiq Space | Identicon rendered as the player's face (`identiconTexture.ts`) | Your opponent should look like their wallet |
| Nimiq Space | Daily earn caps per wallet on a durable UTC-day counter, with its own decision record | Any payout needs this on day one |
| Nimiq Space | Seventeen numbered decision records in `docs/adr/` | This is what "finished, not a prototype" looks like to a judge who reads the repo |
| NimQuest | **4.9 MB against 78 and 89 MB, and still placed third** | Small and finished beats large and unfinished — Nimiq's own stated position this cycle |

And from chit, which is built and live: the signed-message digest test, the bounty's abuse limits,
the computed-never-written record, and the pattern of confirming on read instead of sweeping.

---

## The order to build in

Reordered from the first draft of this brief, which had the lobby first and would have produced an
empty room. `SPEC.md` Part E is the reasoning.

1. **The board, the rules, and the bot.** `chess.js` for legality, our own minimax for an opponent.
   Playable in one tap, no wallet, no server, no second person. With premoves, sound, auto-queen,
   move dots and a coordinates toggle — `SPEC.md` H3 and H4, the things whose absence a chess player
   notices in the first game.
2. **The daily puzzle and Puzzle Storm** on the home screen, with a streak counter, served from the
   **CC0 puzzle database** rather than Lichess's API — its `Rating`, `Themes` and `OpeningTags`
   columns give adaptive difficulty and theme training for free, and holding the data locally means
   the most important screen has no runtime dependency on anyone (`SPEC.md` H1).
2b. **The opening name during play** (`lichess-org/chess-openings` is CC0), the **coordinate
   trainer** as a second solo loop, and **offline** puzzles and bot play. All cheap, none needs a
   second person (`SPEC.md` H2, H5).
3. **The share link and real-time play**, server-authoritative, over polling — and the **accessible
   board** while the board is still simple: keyboard move entry, ARIA, spoken moves. No other app in
   a 75-app catalog will have one (`SPEC.md` H6).
4. **The signed scoresheet** at the end of a game, and the certificate page a stranger can open.
5. **The rating derived from those signatures**, with the public recompute page.
6. **Puzzles that pay**, with chit's bounty limits copied exactly.
7. Coaching, tournaments, Chess960 — only if everything above is finished.

Ship 1–5 and it is a real entry. Ship 1–6 and it is a strong one.

---

## Open questions, honestly

- **Nothing here has been tested on a phone inside Nimiq Pay.** Same gap chit has.
- **The bot's strength curve** is guesswork until somebody plays it. Three depths and a blunder rate
  is the plan; the numbers need tuning against real beginners, not against us.
- **Move-time variance as an anti-cheat signal is unproven at this scale.** It is well established in
  the literature and it will be noisy with a few hundred games. Record it; do not act on it.
- **Whether the rating survives contact with Sybils** depends entirely on the caps in `SPEC.md`
  Part F. Display the distinct-opponent count next to every rating, always, exactly as chit displays
  distinct payers — a big number from one opponent must be visibly worthless.
