# Tournament record — **DRAFT, NOT IMPLEMENTED**

**Status: DRAFT.** No file under `packages/` or `apps/` implements a tournament, a pairing engine, a
standings calculator, or a tournament record format — verified by a repository-wide search on
2026-09-08 for `tournament` (case-insensitive) across the codebase, with zero matches outside this
research folder. This document is a normative rewrite of `research/06-tournaments/design.md`, which
is itself original synthesis (not a study of a single external system) built against five hard
constraints stated there. **Nothing in this file describes running code.** It exists so that, if a
tournament format is built, there is a single normative specification to build against, and so that
the design is never mistaken for a shipped feature by reading this document set alongside
`PROTOCOL.md`, `RECORDS.md`, and `RATING.md`, which do describe shipped code.

## 1. Scope and constraints

A Scoresheet tournament, as designed (not built), is size-adaptive and round-based, never a
continuous/queue-based pairing system like Lichess Arena. It is designed against five hard
constraints (`research/06-tournaments/design.md` §0):

(a) the outcome MUST be demonstrated skill, never chance — a tie broken by random draw is
disqualifying under this competition's own rules (see `NIMIQ_OFFICIAL_RULES_PAGE_VERBATIM.md`'s ban
on "games of chance");
(b) standings MUST be a pure function of signed game records, recomputable by a stranger — the same
property `RATING.md` already establishes for a single rating, extended to a whole event;
(c) players are on mobile and MAY disconnect at any point;
(d) fields are small, 4–16 players, at least initially;
(e) prizes are paid on chain.

## 2. Format selection

- **n ≤ 8: single round-robin.** *n* − 1 rounds; every player meets every other exactly once. The
  schedule is the standard circle-method rotation — a fixed, publicly computable function of the
  ordered player list, needing no pairing algorithm at all.
- **9 ≤ n ≤ 16: Swiss, Dutch system (FIDE C.04.3), fixed round count = `ceil(log2(n)) + 1`.** For
  n = 9–16 this is 5 rounds, pre-declared before the event starts (FIDE C.04.1.a, kept exactly).

Both branches feed the same scoring (win = 1, draw = 0.5, loss = 0 — no streak bonus, no volume
bonus) and the same tie-break engine (§4). **Continuous/live-queue pairing (Lichess Arena's model)
is rejected by design**, because its pairing decisions consume a private, real-time "who is currently
online" signal that no stranger can recompute from the signed record set alone — this is the direct
load-bearing fix for constraint (b) (`research/06-tournaments/design.md` §2).

## 3. Pairing determinism

Pairing MUST be a pure, deterministic function of `(registered player list, all prior rounds' signed
results)` — nothing else. No live queue state feeds it. Round-1 colour and seed assignment MUST be
derived from a public, pre-committed hash — e.g. `hash(sorted registered wallet addresses,
tournament ID)` — computed only after registration has closed, never a live "drawing of lots." This
replaces FIDE C.04.3.1's own randomized board-1 colour draw with a value any stranger can recompute
byte-for-byte from data that existed before round 1 was paired.

## 4. Scoring and tie-breaks

Standard chess scoring only (§2). On an unbroken tie, the following chain applies in order, using
only the signed game corpus itself — no ratings, no external oracle (FIDE C.07 Art. 4.3 types A/B/C):

1. **Direct Encounter** (FIDE C.07 Art. 6) — among the tied players only, by their results against
   each other.
2. **Sonneborn-Berger** (FIDE C.07 Art. 9.1).
3. **Buchholz Cut-1** (FIDE C.07 Art. 8.1 / 14.1.1a).
4. **Number of Wins** (FIDE C.07 Art. 7.1).
5. **Progressive Score** (FIDE C.07 Art. 7.5).

If players remain exactly tied after all five — a real possibility at n = 4–16 — the deterministic
fallback is an **equal split of the combined prize value across the tied rank-range**, itself a pure
function of `(declared prize table, tie-break computation)` a stranger recomputes identically. **No
random draw and no sudden-death decider game anywhere in this design**, because the tournament decides
real money and this competition's own rules ban chance-decided outcomes.

## 5. Disconnects, no-shows, and round deadlines

- **A no-show before a round starts**, unacknowledged within a fixed grace window from the pairing's
  publication, forfeits that round 0–1 (mirroring FIDE C.04.2.D.4, made mechanical rather than
  discretionary). Two consecutive no-shows auto-withdraw the player from the remaining rounds; a bye
  in an odd-field round is a full point with no colour, and a player may never receive a second bye
  (FIDE C.04.1.c/d).
- **Mid-game disconnect** is handled by the ordinary chess clock — the disconnected player's clock
  keeps running and they lose on time if they do not return, identical to any non-tournament game.
  This is deliberately *not* a special tournament rule.
- **Every round has a hard wall-clock deadline** (game clock length + fixed grace buffer). Any game
  undecided at the deadline is settled by clock rule; the round always closes on schedule, so total
  tournament runtime is bounded even in the worst case.

## 6. What building this would require

- A round-robin (circle-method) schedule generator — a pure function of the ordered player list, no
  external library.
- A Dutch-system Swiss pairing engine for n = 9–16 — the design recommends vendoring
  `@echecs/swiss`'s `dutch` subpath (MIT, verified against its own repository licence) after resolving
  its `@echecs/tournament` peer dependency's licence (**NOT VERIFIED** in the source research — an npm
  metadata fetch returned HTTP 403), cross-validated during development against bbpPairings
  (Apache-2.0) as a correctness oracle, never shipped as client code.
- A from-scratch tie-break module implementing exactly the five formulas in §4, unit-tested against
  FIDE's own worked examples.
- A round clock/deadline enforcer producing a signed forfeit-by-timeout result in the same record
  shape as any other game result — no special-cased "no result" state.
- A deterministic seed function for round-1 colour assignment (§3).
- A prize-split calculator consuming `(declared prize table, final tie-break ranking)` and emitting
  per-player on-chain payout instructions.
- Canonical, signed game-record serialisation for each round's games — this would extend, not
  replace, the Scoresheet format `RECORDS.md` §2 already specifies; a tournament game is still a
  Scoresheet, with round metadata carried alongside it, not inside a redefined record format. Exactly
  how that association is signed (a separate tournament-round record referencing a Scoresheet's
  `gameId`? a new field on the Scoresheet itself, requiring a new version marker per `PROTOCOL.md`
  §6?) is **undecided** — nothing in `research/06-tournaments/design.md` specifies it, and this
  document does not invent an answer where the source research did not provide one.

## 7. What this design does NOT establish, and known risks

- **Vendoring an under-audited pairing library without cross-validating it** against a trusted
  reference (bbpPairings/JaVaFo output, FIDE's own worked examples) risks silently wrong pairings
  feeding directly into money-bearing standings — named in the source research as the single
  highest-severity technical risk in the whole design, and it MUST be closed before any real-money
  tournament runs on this format.
- **Round-deadline clock-forfeit rules being too tight for genuine mobile network conditions** would
  convert ordinary connectivity blips into unfair forfeits — the grace windows need testing against
  real mobile network latency and drop patterns, not a number picked on paper.
- **An even prize split on unbreakable ties** is deterministic and rule-compliant but a real, visible
  outcome in a 4–16-player field (more likely there than in FIDE's typical 50+ player events) — the
  product would need to message this clearly in advance so it does not read as an unexplained
  anomaly.
- **The public hash-derived round-1 seed** must be computed from data genuinely fixed *before* it is
  used — if registration were still open when the seed is computed, a strategic late-joiner could
  grind addresses until one produces a favourable seed. The seed MUST be derived only after
  registration closes and itself signed/anchored before round-1 pairings are published.
- **This document does not specify a wire format.** Unlike `RECORDS.md`, which gives byte-exact field
  tables for two shipped record types, this file has no code to describe and therefore no field table
  to give. Any implementation would need to design and version a tournament-round record format from
  scratch, following `PROTOCOL.md` §6's extension rules, before this design could be considered
  specified at the same level of precision as `RECORDS.md`.
