# Lichess Arena format

Sources fetched directly:
- https://lichess.org/tournament/help (Arena tournament FAQ, via WebFetch — full extraction)
- WebSearch of Lichess's own forum/FAQ content for scoring, streaks, berserk (https://lichess.org/forum/general-chess-discussion/scoring-in-arena-tournament, https://lichess.org/forum/general-chess-discussion/is-mutual-berserk-too-advantageous-in-arena-tournaments)
- WebSearch on Arena tiebreak-on-tie behaviour (https://lichess.org/forum/general-chess-discussion/what-happens-if-two-players-end-up-with-the-same-score-in-titled-arena, https://lichess.org/forum/lichess-feedback/what-is-tie-break)
- https://lichess.org/faq — fetched, did not contain Arena-specific detail beyond linking to the dedicated pages above.

## 1. What they do

Lichess Arena is a **continuous, open-ended tournament format**, not a round-based one. There is no fixed pairing schedule: "As soon as you finish a game and return to the tournament lobby, you will be paired with a new opponent close to your rank in the tournament" (https://lichess.org/tournament/help). Players can join and leave at any point during the tournament window; there is no concept of "round N" that the whole field must clear before round N+1 begins.

Scoring, exactly as published: "A win has a base score of 2 points, a draw 1 point, and a loss is worth no points." **Streaks**: "If you win two games consecutively you will start a double point streak, represented by a flame icon. The following games will continue to be worth double points until you fail to win a game" (so a streaking win = 4, a streaking draw = 2, a streaking loss resets to 0 and ends the streak). **Berserk**: clicking Berserk before a game starts halves your own clock time in exchange for one bonus point on a win (win → 3 points instead of 2, 4 with a streak). Time-control caveats: berserking cancels increment except for 1+2 (which becomes 1+0); berserk is unavailable on 0+1/0+2; the bonus point requires at least 7 moves played. Draws in the first 10 moves score 0 for both players (an explicit anti-collusion / anti-farming rule).

The tournament has a hard countdown clock; when it hits zero, standings freeze and the player with the most points at that instant is declared the winner. **Tie-break on equal points is tournament performance rating**, and community reports (Lichess forum threads, not an official spec page) indicate that when performance is also equal, the deciding factor is effectively who reached that score first (games are timestamped, so ranking is by earliest arrival at the final points/performance value) — **this specific final-fallback mechanic is stated by forum consensus, not by an official Lichess documentation page we could fetch, so it is marked NOT VERIFIED as an authoritative rule** (source: https://lichess.org/forum/general-chess-discussion/what-happens-if-two-players-end-up-with-the-same-score-in-titled-arena).

## 2. Why it works

- **No round barriers means no player ever waits on a slow or disconnected opponent to advance the tournament.** This is the single biggest structural advantage of Arena over Swiss/round-robin for a large, casual, always-online population: individual availability variance simply doesn't propagate to anyone else's experience.
- **Streaks and berserk create moment-to-moment tension and a reason to keep playing** rather than stopping once a "good enough" score is banked — this is a deliberate engagement mechanic for a free, ad-supported/donation-supported platform whose business goal is time-on-site, not a fair skill ranking per se.
- **The 7-move minimum for the berserk bonus and the 0-point sub-10-move draw rule are targeted anti-abuse patches**: they specifically close the two cheapest ways to farm points without real risk (instantly resigning after taking the berserk bonus in principle, or two players pre-arranging a same-side quick draw). This shows Lichess iterating the scoring rules against observed gaming behaviour, which is exactly the kind of adversarial thinking we need to apply to our own money-bearing version.
- **Continuous pairing is itself deterministic given the full record of who was in the ready-queue and when** — Lichess's server-side matching is not "random," it's nearest-rank matching among currently-available players. The unpredictability from an outside stranger's point of view is not the algorithm, it's the *real-time availability signal* the algorithm consumes, which is never published.

## 3. What they do badly

- **The format explicitly rewards volume and risk-taking, not just accuracy.** A player who can play more games in the window (faster connection, faster thinking, more free time in that hour) accumulates more scoring opportunities; a player who berserks aggressively and wins anyway gets more points per win than a player playing the same quality of chess conservatively. For a free leaderboard this is a fun design choice. For a competition whose product requirement is "the outcome must be demonstrated skill, never chance" and where the prize is real money, rewarding *availability and risk appetite* alongside *chess skill* muddies exactly the claim we need to make about the format.
- **Standings depend on real-time queue/availability state that is never published or archived** — a stranger auditing the final leaderboard after the fact has no way to verify that opponent selection at any given moment was fair (nearest available rank) rather than manipulated, because the "who was in the ready-queue at time T" signal isn't part of any public, signed record. This is a direct conflict with our hard requirement (b): standings recomputable by a stranger from signed game records alone. Arena's *scoring formula* (points from win/draw/streak/berserk, applied to an ordered sequence of a player's own games) actually is a pure function of that player's own signed game log — but the *pairing schedule itself* is not reconstructible from the public record, only the server's private live state.
- **The community-reported final tiebreak ("earliest to reach the score") is not documented as an official rule anywhere we could fetch** — for a platform with no money on the line this is a tolerable gap; for us, an undocumented, unverified tiebreak mechanic would be an unacceptable source of ambiguity.
- **No mechanism to bound how many games any one player gets to play.** A field where one participant can grind far more games than another (more available time, faster clock, more berserks) means the competition is not comparing the same amount of "signal" per player — a 16-player field could easily end with wildly uneven game counts per player, which is a poor basis for "who is more skilled" when small samples already make ranking noisy.

## 4. What we should copy conceptually

- **Continuous re-pairing to eliminate round-barrier stalls** is the correct instinct for a mobile, disconnect-prone player base — Swiss/round-robin's round barriers are a real cost we have to price in (see `design.md` for how we resolve this without giving up recomputability).
- **Explicit anti-abuse patches targeted at the cheapest gaming vector** (the sub-10-move draw rule, the 7-move berserk minimum) — we should do the same threat-modelling pass on our own format before shipping: what's the cheapest way to inflate a score without playing real chess, and patch exactly that.
- **A hard, published tournament-length countdown** as the simplest possible "when does this end" rule for a short online event — far simpler than "wait for every possible pairing to complete," and appropriate for our small, short-lived events.

## 5. What we can do better

- **Fix the number of games per player** (a Swiss/round-robin-style fixed round count) instead of Arena's open-ended "play as many as you can" model, so standings compare like-for-like samples of skill rather than partly measuring stamina/availability. This is the direct fix for §3's "rewards volume" critique.
- **Drop streaks and berserk from the scoring formula entirely.** Standard win/draw/loss = 1/0.5/0, full stop. These mechanics are good engagement design for a free platform; they are an unnecessary and unjustifiable source of "why did the loser of more individual games out-earn the winner of more" complexity for a format whose entire premise is "the prize reflects demonstrated skill."
- **Make the pairing schedule itself a deterministic function of the public signed record**, not of private real-time queue state — see `design.md` for the concrete mechanism (round-based pairing, or a continuous variant where ready-events are themselves signed and part of the auditable log).
- **Publish, don't leave to forum consensus, the exact tie-break chain and its exhaustion behaviour** — every rule Arena leaves as "community understanding" (the final tiebreak-of-the-tiebreak) we specify explicitly and in advance.

## 6. What is technically required

- A fixed-round-count tournament engine rather than an open-ended queue-matcher (see `design.md`).
- A plain win/draw/loss scoring function (no streak/berserk state machine to build or audit).
- If any Arena-style continuous pairing is used at all, every ready/queue event must be signed and timestamped and included in the public record, so pairing itself — not just scoring — is independently recomputable.

## 7. What could break

- Copying Arena's scoring formula verbatim (streaks, berserk) into a money-prize product invites an immediate, obvious objection from any judge or competitor: "the winner isn't necessarily the best player, they're the player who played the most/riskiest games in the window" — this directly undermines the "demonstrated skill" claim the whole tournament format has to satisfy.
- Copying Arena's live-queue pairing without also publishing/signing the queue-state data that drove it means our standings are not actually recomputable by a stranger, even though our per-player scoring math is — this is a subtle trap: the *scoring formula* being a pure function is not sufficient if the *pairing* that produced the inputs to that formula isn't also reconstructible.

## 8. What we can uniquely do because of Nimiq

- Nimiq's feeless, instant transactions make a *fair*, bounded version of Arena's per-game stake concept viable without berserk's skill-distorting bonus-point mechanic: a small, fixed, symmetric per-game stake (not a risk-for-points multiplier) settled instantly on every result, with the tournament's fixed-round-count standings deciding the prize pool — i.e., we can take Arena's "money moves on every game" energy without importing its "risk-taking earns more points than accuracy" distortion.
- Because every game in our format is already going to be a signed, chain-anchored record (needed for prize settlement regardless of tournament format), we get "make the pairing schedule reconstructible" essentially for free by simply including ready/queue timestamps in that same signed log — a cost Lichess has no reason to pay, since it has no on-chain settlement to anchor those events to in the first place.
