# The format we run for Scoresheet's staked tournaments

This file is the synthesis, not a survey of an external system — it applies the findings in `fide.md`, `swiss.md`, and `arena.md` against five hard constraints:

(a) outcome must be demonstrated skill, never chance — a tie broken by random draw is disqualifying under the competition rules;
(b) standings must be a pure function of signed game records, recomputable by a stranger;
(c) players are on mobile and may disconnect;
(d) fields are small, 4–16 players, at first;
(e) prizes are paid on chain.

## 1. What they do (the recommended format)

**Size-adaptive, round-based, single deterministic engine — never continuous/queue-based pairing.**

- **n ≤ 8: single round-robin.** n − 1 rounds, every player meets every other player exactly once. No pairing algorithm is needed at all — the schedule is the standard circle-method rotation, a fixed, publicly-known function of the ordered player list and nothing else. For n = 4 that's 3 rounds; for n = 8 that's 7 rounds.
- **9 ≤ n ≤ 16: Swiss, Dutch system (FIDE C.04.3), fixed round count = ceil(log2(n)) + 1.** For n = 9–16 that's 5 rounds. Fixed and pre-declared before the event starts (FIDE C.04.1.a — we keep this rule exactly).
- Both branches feed the **same** scoring (win = 1, draw = 0.5, loss = 0 — no streaks, no berserk, no volume bonus, per `arena.md` §5) and the **same** tie-break engine (§2 below).
- **Rounds are barrier-synchronized but time-boxed**, not open-ended: every round has a fixed game clock plus a bounded round deadline (see §3). A round closes — and the next round's pairings are published — once every game in it has a result, where "a result" includes a clock-timeout forfeit. No round can hang indefinitely on a disconnected player.
- **Pairing is a pure, deterministic function of (registered player list, all prior rounds' signed results)** — nothing else. No live queue state, no "who's currently online" signal feeds the algorithm. This is a deliberate rejection of Arena's continuous re-pairing (`arena.md` §3, §7): Arena's live-queue dependency is exactly the thing that breaks constraint (b), and we refuse to reproduce it.
- **Round 1 colour/seed is derived from a public, pre-committed hash** (e.g. `hash(sorted registered wallet addresses, tournament ID)`), never a live "drawing of lots" — this replaces FIDE C.04.3.1's own randomized board-1 colour draw (`fide.md` §3) with a value any stranger can recompute byte-for-byte from data that existed before round 1 was paired.

## 2. Why it works

- **Round-robin for n ≤ 8 sidesteps the entire Dutch-algorithm correctness question** for the field sizes where it matters least (small n → the schedule is trivial, exhaustive, and impossible to get subtly wrong) and where round-robin's O(n) round count is still short enough to finish in one sitting (at most 7 rounds).
- **Swiss for 9–16 uses a real, FIDE-legal, widely-battle-tested algorithm** (the same one Lichess runs in production via bbpPairings, per `swiss.md` §1) rather than an invented format — this satisfies the project's own "never below Lichess/FIDE" quality floor directly: we are not merely inspired by FIDE, we run FIDE's actual pairing rules, adapted only where they conflict with our no-chance/no-oracle constraints.
- **A single tie-break engine shared by both branches** means we only have to build, test, and audit one piece of standings logic, not two — and round-robin's Direct Encounter tie-break (§2 below) is *more* decisive there than in Swiss, since every pair of tied players has, by construction, already played each other.
- **Rejecting continuous/live-queue pairing is the direct, load-bearing fix for constraint (b).** `arena.md` §3 identifies precisely why Arena's format can't satisfy "recomputable by a stranger": its pairing decisions consume a private, unpublished, real-time signal. A round-based, record-only pairing function has no such dependency by construction — anyone holding the registered player list and the signed round results can run the identical open-source pairing function and get the identical next-round pairings. This is strictly stronger than the letter of the requirement (which technically only demanded *standings* be a pure function) — but the extra rigor is cheap here and removes an entire class of "was this rigged" doubt that a prize-money product cannot afford.
- **Fixed round counts and no volume/streak scoring** mean every player in a given tournament plays the same number of games, so the final ranking compares like-for-like skill signal rather than partially measuring stamina or risk appetite (`arena.md` §3, §5).

## 3. What they do badly (failure modes we designed around, and how)

- **No-show before a round starts.** A player who does not acknowledge/open their assigned game within a fixed grace window (e.g. 2 minutes from the pairing being published on-chain/relay-timestamped) forfeits that round 0–1. This mirrors FIDE C.04.2.D.4 (absent-without-notice ⇒ treated as withdrawn if unexplained) but is made mechanical and non-discretionary: the grace window and the pairing-publication timestamp are both public, so "did player X's first signed action arrive within the window" is itself a pure function two strangers will compute identically. **Two consecutive round no-shows ⇒ auto-withdrawal** (matches Lichess Swiss's own practice of withdrawing repeated no-shows so they "don't lose more games," per https://lichess.org/swiss) — remaining rounds are not paired against a ghost; any resulting odd-field round gets a bye per FIDE C.04.1.c/C.04.3.1.A.5 (full point, no colour, and — per FIDE C.04.1.d — a player who has already received points without playing may never receive a second bye, closing the obvious farm-the-bye exploit).
- **Mid-game disconnect.** Handled by the ordinary chess clock, exactly as it already is on every serious online chess platform (Lichess, chess.com) and, functionally, over the board: the disconnected player's clock keeps running and they lose on time if they don't return. This is *not* a special tournament-level rule — it is a completely normal, skill-adjacent game outcome (managing your own connection and time is part of playing online chess) and requires no chance-based or discretionary adjudication. A short, bounded reconnect window (governed by the base game engine, not the tournament layer) accommodates a genuine mobile network blip without giving unlimited slack.
- **Round deadline / stalled round.** Every round has a hard wall-clock deadline (game clock length + fixed grace buffer). Any game still undecided at the deadline is settled by clock rule (whoever has time remaining wins on time; a genuine on-the-board draw stands if reached) — the round always closes on schedule, so the tournament's total runtime is bounded and predictable even in the worst case of every game going the full distance. This directly answers `arena.md` §2's praise of "no round ever waits on a straggler" without adopting Arena's live-queue pairing: **the round waits on the clock, never on a person.**
- **Unbreakable tie (constraint (a), the sharpest one).** Tie-break chain, applied in order, all Type A/B/C per FIDE C.07 Art. 4.3 (i.e., derived only from the signed game corpus itself — no ratings, no external oracle, per `fide.md` §4):
  1. **Direct Encounter** (FIDE C.07 Art. 6) — among the tied players only, rank by the sum of results from games they played against each other.
  2. **Sonneborn-Berger** (FIDE C.07 Art. 9.1) — Σ (final score of each opponent beaten) + Σ (½ × final score of each opponent drawn).
  3. **Buchholz Cut-1** (FIDE C.07 Art. 8.1 / 14.1.1a) — sum of opponents' final scores, dropping the single weakest opponent.
  4. **Number of Wins** (FIDE C.07 Art. 7.1) — rewards decisive results over draws.
  5. **Progressive Score** (FIDE C.07 Art. 7.5) — sum of the player's own running score after each round, rewarding a player who led earlier over one who caught up late.
  If, after all five, players remain exactly tied — a real possibility at n = 4–16 (`fide.md` §7) — **the deterministic fallback is: the combined prize value of the tied rank-range is split equally among the tied players.** This is not a game of chance and is not FIDE's own "drawing of lots" fallback (C.07 Art. 4.2), which we explicitly refuse to run for anything that decides money. An equal split is itself a pure, public function of (declared prize table, tie-break computation) — a stranger recomputes it exactly the same way we do, no oracle, no coin flip, no sudden-death game (a decider game would introduce scheduling/availability risk on top of not actually being necessary — chess itself being skill-based means a decider *could* satisfy the no-chance rule, but it adds real complexity — reconvening two specific mobile players, a fresh signed game, a fresh possible tie at fast time controls — for a problem an even split already solves cleanly).

## 4. What we should copy conceptually

- FIDE's absolute-vs-relative pairing criteria hierarchy, and its C.07 tie-break type taxonomy (`fide.md` §4) — both are structuring the tie-break engine correctly.
- Lichess Arena's insight that round barriers are the real cost of round-based formats for mobile users (`arena.md` §4) — answered here not by abandoning rounds, but by bounding every round with a hard clock+deadline so a straggler costs the field a fixed, small, known amount of time rather than an unbounded wait.
- FIDE C.07 Article 16's rule that byes/forfeits must be scored as a fixed result value for opponents' tie-break purposes (`fide.md` §4) — carried over unchanged, since it closes a real, previously-observed correctness gap.

## 5. What we can do better

- **No random draw anywhere in the specification** — not for round-1 colour (replaced with a public hash-derived seed), not for exhausted tie-breaks (replaced with an even prize split). FIDE's own rules still contain a "by lot" step in both places; ours does not, by design, because ours decides real money and the competition rules explicitly ban chance-decided outcomes.
- **Pairing itself, not just standings, is independently recomputable** — stronger than the letter of constraint (b), achieved at essentially no extra cost by refusing continuous/live-queue pairing in the first place (`arena.md` §7).
- **One tournament engine, two schedule generators (round-robin, Swiss), one tie-break module, one scoring rule** — versus FIDE's six approved Swiss variants and Lichess's two incompatible formats (Arena scoring vs. Swiss scoring) — minimizing the amount of money-adjacent logic that has to be independently correct.

## 6. What is technically required

- A round-robin (circle-method) schedule generator — trivial, no external library needed, pure function of the ordered player list.
- A Dutch-system Swiss pairing engine for n = 9–16 — vendor-and-audit `@echecs/swiss`'s `dutch` subpath (MIT) after resolving its `@echecs/tournament` peer-dependency licence, cross-validated against bbpPairings' Apache-2.0 reference implementation during development (see `swiss.md` §5–6). Do not hand-roll from the prose spec alone.
- A from-scratch tie-break module implementing exactly the five formulas in §3 above, unit-tested against FIDE's own worked examples and against hand-computed small cases.
- A round clock/deadline enforcer that produces a signed forfeit-by-timeout result exactly like any other game result — no special-cased "no result" state anywhere in the data model.
- A deterministic seed function (public hash of pre-committed registration data) for round-1 colour assignment.
- A prize-split calculator that consumes (declared prize table, final tie-break ranking) and emits per-player on-chain payout instructions — this is the constraint-(e) payoff of everything above being a pure function: settlement can be automated the instant standings finalize.
- Canonical, signed game-record serialisation (round, white, black, result, timestamps) as the single input both our own engine and any outside auditor's independent reimplementation consume.

## 7. What could break

- **Vendoring an under-audited pairing library (`@echecs/swiss`) without cross-validating it** against a trusted reference (bbpPairings/JaVaFo output, FIDE's worked examples) risks silently wrong pairings feeding directly into money-bearing standings — see `swiss.md` §7. This is the single highest-severity technical risk in this whole design and must be closed before any real-money tournament runs.
- **Round-deadline clock-forfeit rules being too tight for genuine mobile network conditions** would convert ordinary connectivity blips into unfair forfeits, which — while not "chance" in the FIDE sense — would be perceived as unfair and would undermine trust in the product exactly as much as a chance-based mechanic would. The grace windows need real testing against actual mobile network latency/drop patterns, not just a number picked on paper.
- **An even prize split on unbreakable ties**, while deterministic and rule-compliant, is a real, visible outcome players will see in a 4–16-player field (more likely there than in FIDE's typical 50+ player events, per `fide.md` §7) — the product needs to message this clearly and in advance ("if the tie-break chain doesn't separate you, you share the prize — this is not a bug") so it never looks like an unexplained anomaly.
- **The public hash-derived round-1 seed** must be computed from data that is genuinely fixed *before* it's used (e.g. the finalized registration list at the close of registration) — if registration were still open when the seed is computed, a strategic late-joiner could try addresses until one produces a favourable seed. The seed must be derived only after the registration list is closed and itself signed/anchored before round-1 pairings are published, so it can't be grinding-selected.

## 8. What we can uniquely do because of Nimiq

- **Automatic, trustless settlement the instant standings finalize.** Every input to the standings function (game records, tie-break results, the prize split calculation) is already a deterministic, public computation by design (§1–3, §5); NIM's feeless, near-instant transactions mean we can pay every player's share on-chain the moment that computation completes, with no manual "tournament director wires the prize money" step and no custodial holding period — something no OTB FIDE event and no free-to-play Lichess arena has any reason or ability to offer.
- **Per-round anchoring of the signed game-record log**, not just a final result, using NIM's cheap, fast transactions — a stranger can verify the tournament's integrity round-by-round as it happens, not only after the fact from a final export.
- **Wallet addresses as the only identity layer needed**, removing FIDE's rating-list/federation-ID bootstrap (`fide.md` §8, `swiss.md` §8) entirely — appropriate for a product whose whole premise is a record you hold yourself, not a federation's rating list.

## 9. Licence and reuse verdict

This file recommends concepts and a specific configuration, not adopted code, so there is no licence to record for the design itself. The two pieces of external code it does call for adopting are covered in `swiss.md` §9: `@echecs/swiss`'s `dutch` subpath is MIT (verified, https://github.com/echecsjs/swiss/blob/main/LICENSE), pending resolution of its `@echecs/tournament` peer dependency's licence (**NOT VERIFIED** — npm fetch returned HTTP 403); bbpPairings (Apache-2.0, verified via its GitHub repository) is recommended only as a server-side/CI-time correctness oracle, never as shipped client code. JaVaFo's non-SPDX "free of charge, attribution requested" terms mean its code is explicitly excluded from adoption; it remains useful only as read-only reference material for validating our own engine's output.
