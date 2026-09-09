# Rating systems — Elo, Glicko, Glicko-2, and what Scoresheet actually needs

## 1. What they do

**Elo** (Arpad Elo, adopted by FIDE in 1970): every player has one number, `r`. After a game,
`expected = 1 / (1 + 10^((opponentRating - myRating) / 400))`, and
`newRating = round(myRating + K × (score - expected))`, score being 1/0.5/0. K is a fixed constant
per player-category. Nothing else is tracked. [FIDE Rating Regulations, effective 1 March 2024](https://handbook.fide.com/chapter/B022024).

**FIDE's K-factor rules**, verbatim from the handbook: K = 40 for a player new to the rating list
until they have completed events with at least 30 games; K = 40 for all players until the end of the
year of their 18th birthday, as long as their rating stays under 2300; K = 20 while a player's rating
is under 2400; K = 10 once a published rating has reached 2400 and stays there, even if it later
drops below. A published rating below 1400 is shown as unrated on the next list. Initial rating is
capped at 2200. Lists are published monthly, pooling up to 26 consecutive months of results, and a
player needs at least 5 rated games before being published at all.
[FIDE Rating Regulations B.02, 2024](https://handbook.fide.com/chapter/B022024).

**Glicko** (Mark Glickman, 1995): adds a second number, **RD** (rating deviation) — the standard
deviation of the belief about `r`. A 1850-rated player with RD 50 is "95% confident" between 1750
and 1950. RD shrinks with games played and grows with the passage of time when a player is inactive:
`RD = min(√(RD_old² + c²t), 350)`, t in elapsed rating periods. The whole apparatus runs on **rating
periods** — a batch window in which every game in the population is treated as simultaneous; ratings
and RDs are frozen going in and updated together going out. Glickman's own words: "the Glicko system
works best when the number of games in a rating period is moderate, say an average of 5-10 games per
player." [Glickman, "The Glicko system" (primary PDF, glicko.net)](http://www.glicko.net/glicko/glicko.pdf).

**Glicko-2** (Glickman, 1999, iteration procedure revised 2012): adds a third number, **volatility
σ** — how erratic a player's results are, independent of RD. Ratings are rescaled to `μ = (r-1500)/173.7178`,
`φ = RD/173.7178`. Per rating period: compute variance `v` and improvement `Δ` from that period's game
outcomes and opponents' `(μⱼ, φⱼ)`; solve for new volatility `σ'` by root-finding (the Illinois
algorithm, a stabilized regula falsi, replacing an earlier Newton-Raphson approach that "occasionally
did not converge"); update `φ' = 1/√(1/(φ²+σ'²) + 1/v)`; update `μ'` and convert back to the original
scale. A system constant **τ** (recommended 0.3–1.2, as low as 0.2 for volatile applications) caps how
fast volatility itself can move. Full worked example with every intermediate number, dated 22 March
2022: [Glickman, "Example of the Glicko-2 system" (primary PDF)](http://www.glicko.net/glicko/glicko2.pdf).

**Adoption**: FICS and the Australian Chess Federation run Glicko/Glicko-2 variants; Lichess and
Chess.com both describe their systems as Glicko-family; outside chess, Glicko-2 or close variants run
Team Fortress 2, Dota 2, Guild Wars 2, Splatoon 2, Counter-Strike 2, Pokémon Showdown, Online-Go.com,
TETR.IO, and Pokémon GO's ranked ladder; Microsoft's TrueSkill "borrows many ideas from Glicko."
[Wikipedia, Glicko rating system](https://en.wikipedia.org/wiki/Glicko_rating_system) — cross-checked
formula-for-formula against the two primary PDFs above and found consistent.

## 2. Why it works

Elo's insight — a logistic model of win probability from a rating gap, with rating movement
proportional to surprise — is simple enough to hand-compute and has stayed the industry default for
55 years because of that, not despite it.

Glickman's own stated motivation for Glicko, in his words: two players both rated 1700 play, one
returning after years away, one playing every weekend; Elo moves both by the same 16 points, but "the
first player's rating should increase by a large amount... because his rating of 1700 is not
believable in the first place," and the second should barely move because "very little information
about his own playing strength has been learned." RD is the fix — an explicit, visible confidence
value, and rating updates scale by both players' RD, not just the K-factor.
[Glickman, "The Glicko system"](http://www.glicko.net/glicko/glicko.pdf).

Glicko-2 adds volatility on top for a narrower reason: RD alone treats "long time since last game" and
"recently played erratically" as the same kind of uncertainty. Volatility separates them — a player who
has been steady for years but suddenly strings together shock results gets flagged even if they played
last week and RD is low. [Glickman, "Example of the Glicko-2 system"](http://www.glicko.net/glicko/glicko2.pdf).

## 3. What they do badly

**Rating periods don't survive contact with a live product.** Glickman's own recommendation — batch
games into periods averaging 5-15 per player — is incompatible with "show me my new rating the moment
the game ends," which is what every chess site actually promises. Lichess's own fractional-period
Rust reference implementation states this outright: *"Glicko-2 updates ratings in bulk in discrete
rating periods. Lichess instead updates pairs of ratings, so that ratings can be immediately updated
after each game."* [niklasf/liglicko2 README](https://github.com/niklasf/liglicko2) — niklasf (Niklas
Fiekas) maintains core Lichess chess infrastructure, so this is as close to an admission-against-
interest as it gets. A community write-up goes further and argues Lichess isn't really running
Glicko-2 at all: it rates games one at a time rather than in batches, and "because 'volatility' is not
computed the Glicko-2 way, a [RD] floor still exists" around 60, not the ~40 the textbook algorithm
would allow with active play. [Toadofsky, "Lichess ratings are not Glicko-2"](https://toadofsky.substack.com/p/lichess-ratings-are-not-glicko-2)
— this is one critic's argument, not confirmed by a Lichess maintainer, and is recorded here as an
argument, not a settled fact.

**Volatility can be gamed.** A player who deliberately loses a run of games, then alternates wins and
losses to inflate σ while keeping `r` roughly flat, then wins a streak, can walk away with a rating
spike disproportionate to their actual strength — because the update magnitude scales with volatility.
This is documented as having been exploited against Pokémon GO's ranked ladder. A Lichess engineering
issue raised the same question for chess directly, titled "Glicko2 may be flawed": *"sometimes
intentionally underperforming can result in a higher rating."* The author is explicit that they "am
not sure if this flaw applies to chess or, in particular, to lila's implementation" — flagged, not
proven, and the issue shows no maintainer resolution in what's visible.
[lichess-org/lila issue #7862](https://github.com/lichess-org/lila/issues/7862).

**Elo alone has no confidence signal at all** — a 20-game player and a 2,000-game player with the same
number are indistinguishable to a reader, which is the exact gap Glicko was built to close, and every
platform that ships plain Elo (FIDE) works around it with a coarse proxy instead: a K-factor tier for
new players (K=40) and a rating floor (published ratings below 1400 show as unrated) rather than a
real per-player uncertainty number. [FIDE Rating Regulations](https://handbook.fide.com/chapter/B022024).

**FIDE's own process is heavy and centralized**: monthly batch lists, a 26-month pooling window for
sparse players, a 5-game minimum before first publication, tournaments must close 3 days before a list
compiles. None of this is a "recompute this yourself" system — it is a federation running a scheduled
job, and a player has no way to independently verify their own number without trusting FIDE's
software and FIDE's database. [FIDE Rating Regulations](https://handbook.fide.com/chapter/B022024).

## 4. What we should copy conceptually

- **A visible confidence signal matters, even a crude one.** FIDE's binary "unrated below 1400" and
  provisional-until-30-games rule, and Glicko's RD, are both answers to the same real problem: a bare
  number lies about how much is known. Scoresheet's `F4` already has an answer shaped like this
  (provisional until 10 distinct opponents, shown with a `?`) — this is directly in that lineage and
  should stay.
- **Tiered K by experience, not by fixed constant forever.** FIDE's K=40 → K=20 → K=10 staircase is
  the same shape as Scoresheet's own K=32 (first 20 games) → K=16 design — this is a well-precedented
  pattern, not an invented one.
- **Say plainly that ratings don't transfer across populations.** Lichess states its own ratings run
  higher than FIDE's or Chess.com's and explicitly declines to claim equivalence — "ratings cannot be
  directly compared across different platforms." [Lichess, rating systems page](https://lichess.org/page/rating-systems).
  Scoresheet's own `F6` already commits to the same honesty; keep it, because a young, small
  population's numbers genuinely will not mean what a FIDE 1600 means, and the credible move is to
  say so rather than let users assume otherwise.
- **A rating floor that stops a number from going meaningless.** FIDE quietly removes a player from
  the rated list below 1400 rather than displaying an absurd number; Scoresheet's floor at 100 solves
  the same problem more transparently — kept, never hidden.

## 5. What we can do better

No system reviewed here — Elo/FIDE, Glicko, Glicko-2, Lichess's or Chess.com's implementations —
lets a third party who trusts nobody recompute a player's rating from first principles. All of them
require trusting the platform's database and the platform's software: FIDE's list is a federation
publication; Lichess's and Chess.com's ratings live in a server-side database with no public,
independently-replayable input log. `chess/SPEC.md` F5's recompute page — pull one address's signed
scoresheets and replay the whole Elo chain client-side, print the number next to the server's and
call it wrong if they disagree — has no precedent in any of the systems studied here. This is a real,
checkable "nobody else has this" claim, not a marketing one.

Ratings on every platform studied are also **account-bound and revocable**: Chess.com's own Fair Play
team closes roughly 100,000 accounts a month (about 3,500/day, Jan–Mar 2025) for cheating violations
— [Chess.com, "Breaking Down 100,000 Closures a Month"](https://www.chess.com/blog/FairPlay/breaking-down-100-000-closures-a-month) —
and even a justly-closed account's entire rating history becomes unreachable and unprovable the moment
the ban lands; there is no portable receipt of the games that built it. A rating built from
independently-signed scoresheets survives the platform, survives a ban dispute, and survives the
company disappearing, because it was never the company's data to hold.

## 6. What is technically required

The constraint: the rating must be a **deterministic, pure function of an ordered list of signed game
records**, recomputable by a stranger in their browser with no server and no hidden state
(`chess/SPEC.md` F2–F5, already decided: canonical order is `endedAtBlock` ascending then `gameId`
tiebreak, plain Elo, K=32/16, floor 100).

**The structural problem Glicko-2 shares with Elo, and doesn't add to.** Any pairwise relative rating
— Elo included — needs each opponent's rating *at the time of that specific game*, and that opponent's
rating-at-the-time is itself a function of *their* prior opponents, recursively. Strictly, replaying
"my own signed games" to get my own number requires walking the connected component of the whole game
graph, not just my own edges — this is inherent to relative rating systems generally, and Elo does not
escape it either. This is a real cost of the design (see §7), but it is not a reason to prefer Elo over
Glicko-2 specifically.

**What Glicko-2 adds on top, and does not share with Elo:**

1. **Rating periods are a global binning decision, not a property of one player's signed data.**
   Glickman's algorithm treats "simultaneous" as a batch window chosen by "the administrator" — there
   is no canonical period length in the spec itself, and Glickman's own stated design target (5–15
   games per player per period) assumes an active, sizeable population. A small or young population —
   which Scoresheet will have for a long time — sits exactly outside that design target, which is why
   every real implementation studied here abandons batching for incremental, per-game updates. That
   deviation is not free: Lichess's own reference implementation admits it isn't running the textbook
   algorithm, and a live, unresolved Lichess engineering issue calls the result possibly exploitable
   (§3). Recomputability requires an implementation that behaves *identically* for every stranger who
   runs it — and there is no single, canonical, uncontested "Glicko-2 for a small population, updated
   instantly" to point to. Elo has no period concept to disagree about at all.
2. **Volatility requires iterative floating-point root-finding**, not closed-form arithmetic — the
   Illinois algorithm, run to a chosen tolerance (Glickman uses ε = 0.000001, converging in a median
   5 iterations, max 19 of 10,000 simulated). This is fully deterministic *given* an exactly pinned
   tolerance, bracketing procedure, and floating-point representation shared bit-for-bit across every
   implementation — a materially harder engineering bar to hold across "a stranger's browser
   reimplementation" than Elo's single `round()` call, and one more place a naive reimplementation can
   silently diverge in the last few bits.
3. **τ is a free parameter with no canonical value.** Glickman recommends 0.3–1.2, "though the system
   should be tested to decide which value results in greatest predictive accuracy" — an explicit
   invitation to tune it per-application, unlike FIDE's K-factor table, which chess federations have
   converged on as fixed, published numbers. Two honest implementers could legitimately choose
   different τ and get different — both "correct" — ratings.
4. **It doesn't solve the threat this product actually has.** RD and σ model *staleness and
   inconsistency* — how long since you played, how erratic your recent results are. Scoresheet's real
   threat, spelled out in its own `F4`, is **Sybil farming**: one attacker manufacturing wins against
   their own second wallet. Glicko-2's RD would shrink just as fast against a farmed opponent pool as
   against a real one — volume and recency are all it measures, not opponent diversity. Scoresheet's
   existing answer (diminishing K per opponent, distinct-opponent count displayed, provisional flag
   until 10 distinct opponents) already targets the actual threat model directly; Glicko-2 would add
   real determinism cost while leaving that specific hole exactly as open as Elo leaves it.

**Verdict: not worth it.** Glicko-2 is not fundamentally incompatible with the determinism
requirement — a fully pinned version (fixed period-binning rule, fixed τ, fixed root-finder
tolerance and iteration order) could in principle be made reproducible. But it buys uncertainty
communication the product doesn't structurally need (its real threat is Sybil farming, which Glicko-2
doesn't address any better than Elo) at a real cost in implementation risk (no canonical small-
population implementation exists to copy; the one large deployment studied closely, Lichess, is on
record as deviating from the textbook spec and as having an open, unresolved concern about
exploitability). Plain Elo, already decided in `chess/SPEC.md` F3, is the correct call — not because
it's simpler to code, but because the complexity Glicko-2 adds pays for a capability (volatility-aware
confidence) this product's actual attack surface doesn't reward.

## 7. What could break

- **Sybil farming is real and unsolved by rating math alone**, under either system — Scoresheet's own
  `F4` says this plainly ("that is the honest claim... not 'Sybil-proof'"). Confirmed here: nothing in
  Glicko-2 closes this gap either, so switching systems would not have bought safety.
- **The recompute page's cost grows with the graph, not with one player's game count.** Because
  opponent-rating-at-time-of-game is itself derived from the opponent's own history, a fully rigorous
  client-side recompute may need to pull a much larger slice of the dataset than "my own games" as the
  population's games interlink — worth load-testing before `/r/<address>` is presented as instant.
- **Early-population rating swings.** K=32 for the first 20 games moves a rating fast; in a small,
  young pool (exactly Scoresheet's early state) a handful of games against the same few active players
  can produce large, visible swings before the diminishing-K-per-opponent rule caps it. This is a
  known Elo property, not new, but worth setting user expectations for explicitly on the rating screen.
- **If Glicko-2-style tuning is ever revisited**, floating-point non-determinism across languages
  (JS in a browser vs. a stranger's reimplementation in Python/Rust/etc.) is a genuine, documented risk
  class for the volatility root-finder specifically — not for the rating/RD arithmetic, which is
  closed-form. Any future move in this direction needs a bit-exact reference implementation, not just
  "the formula."
- **Population incomparability is a communication risk, not a math risk.** A 1600 in a 200-person
  population is not a 1600 on Lichess. `F6` already commits to saying so; the risk is a user reading
  the number as globally meaningful anyway if the caveat isn't kept visible near the rating itself,
  not buried in a help page.

## 8. What we can uniquely do because of Nimiq

The signed scoresheet (`chess/SPEC.md` F1) reuses **the exact same keypair and `sign()` call** a
player already has for sending NIM — there is no separate identity or PKI to bootstrap; "prove I paid"
and "prove I played and the result was X" are the same cryptographic primitive on the same wallet.
No system studied here (FIDE, Chess.com, Lichess) ties a rating to a payment-capable signing key at
all — their accounts are logins, not keys, which is exactly why their ratings can be frozen by a ban
and never why Scoresheet's needs to be.

`endedAtBlock` — a Nimiq block height stamped and **signed by both players** — gives the canonical
order that Elo's path-dependence requires (`F2`) for free, publicly, and tamper-evidently. Every other
system studied resolves "what order did these games happen in" by trusting a company's database
insertion order, which is invisible and unauditable from outside; Scoresheet resolves it with a
number anyone can check against the chain independently of trusting the app at all. This is the
concrete mechanism underneath the "recomputable by a stranger" claim in §5 — it is not achievable
without a public, cheap, neutral clock, and that is specifically what Nimiq's block height is here.

## 9. Licence and reuse verdict

- **Glicko and Glicko-2 formulas themselves: public domain**, stated exactly as such on the author's
  own site — *"The Glicko and Glicko-2 systems are in the public domain."*
  [glicko.net/glicko.html](https://www.glicko.net/glicko.html). Free to implement from scratch with no
  attribution obligation, confirmed at the primary source.
- **`lichess-org/lila`** (the only production Glicko-2-family chess implementation examined in depth)
  is licensed **GNU AGPL-3.0-or-later** — *"Lila is licensed under the GNU Affero General Public
  License 3 or any later version at your choice."* [lichess-org/lila README](https://github.com/lichess-org/lila).
  Per this project's own clean-room rule for AGPL/GPL sources (`chess/CLAUDE.md`, Part L), its
  `Glicko.scala` may be **read for behaviour, never copied** — reader ≠ writer, any port must be
  clean-room with the spec written down and an attestation recorded.
- **`niklasf/liglicko2`** — a Rust reference implementation of exactly the "Lichess-flavored,
  fractional-rating-period, instant-update" Glicko-2 variant discussed in §3 and §6 — is dual-licensed
  **MIT OR Apache-2.0**, confirmed on the repository. [niklasf/liglicko2](https://github.com/niklasf/liglicko2).
  This is freely portable if Glicko-2-style ideas are ever revisited, and is the one place a legally
  clean second opinion on "how does Lichess actually do this" exists in code, independent of lila's
  AGPL source.
- **FIDE's rating regulations text** is a federation publication, not source code — the *numbers*
  (K-factors, floors, initial-rating formula) are facts about a regulatory scheme, not copyrightable
  algorithm implementation, and are recorded here as facts with no licence question attached.
- **Elo itself carries no licence at all** — it predates modern software copyright norms and every
  chess federation implements it from the closed-form formula directly; `chess/SPEC.md`'s own
  implementation is an original, from-the-formula implementation and raises no reuse question.
