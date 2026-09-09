# Rating — derivation functions, specified for independent reimplementation

Two independent rating functions exist in shipped code: **Game Rating**
(`packages/core/src/elo.ts`), computed over an ordered set of Scoresheets, and **Puzzle Rating**
(`packages/core/src/puzzle-set.ts` + `packages/core/src/puzzlecard.ts`), computed over an ordered set
of Puzzle Cards. `SPEC.md` Part F specifies only the first; §4 below states this gap plainly. Both
functions are **pure** — no clock, no database, no configuration, a function of exactly the record
set passed in — which is the entire mechanism behind "a stranger's browser and our server cannot
possibly disagree" (`elo.ts:160-164`).

Every reader of this file MUST already have read `RECORDS.md` — the fields cited below (`endedAtBlock`,
`gameId`, `rated`, `moveCount`, `ratingBefore`, `ratingAfter`, `sessionId`) are the Scoresheet and
Puzzle Card fields it specifies.

## 1. Ordering — common to both

Both derivations require a total order over their record set before any arithmetic runs, because both
are path-dependent: the same set of records in a different order produces a different final number.

- **Game order**: `endedAtBlock` ascending, then `gameId` ascending (lexicographic string comparison)
  as a tiebreak — `canonicalOrder` (`elo.ts:107-112`).
- **Puzzle-card order**: `endedAtBlock` ascending, then `sessionId` ascending as a tiebreak —
  `canonicalCardOrder` (`puzzlecard.ts:276-282`).

Both fields used for ordering are inside the record's own signed text, so the order is a property of
the signatures, never of a database's row order or insertion time (`elo.ts:10-13`,
`puzzlecard.ts:47-49`). The tiebreak exists because two records can legitimately share a block height
— Nimiq's blocks land roughly every second and it is entirely possible for two games, or two puzzle
runs, to end in the same one — and without a deterministic second key, two honest implementations
sorting "by time" alone would disagree on which came first.

## 2. Game Rating (`packages/core/src/elo.ts`)

Specified in the product spec at `SPEC.md` Part F1–F5; this section restates it against the exact
code, including details the prose spec does not spell out.

### 2.1 Constants

| Constant | Value | Source |
|---|---|---|
| `STARTING_RATING` | 1200 | `elo.ts:28` |
| `RATING_FLOOR` | 100 | `elo.ts:31` |
| `K_PROVISIONAL` | 32 | `elo.ts:34` |
| `K_ESTABLISHED` | 16 | `elo.ts:37` |
| `PROVISIONAL_GAMES` | 20 | `elo.ts:40` |
| `K_FULL_GAMES_PER_OPPONENT` | 3 | `elo.ts:43` |
| `K_HALF_GAMES_PER_OPPONENT` | 10 | `elo.ts:46` |
| `DISTINCT_OPPONENTS_FOR_ESTABLISHED` | 10 | `elo.ts:49` |
| `MIN_MOVES_TO_RATE` | 10 | `elo.ts:52` |

### 2.2 Which games count at all

A game contributes to Game Rating only if `counts(game)` is true:

```
counts(game) = game.rated AND game.moveCount >= 10
```
(`elo.ts:128-130`). A game failing this test is skipped entirely inside `computeRatings`'s loop
(`elo.ts:191`, a bare `continue`) — it does **not** increment either player's `games` counter, does
**not** touch the per-pair counter, does **not** affect `distinctOpponents`, and produces no
`RatingPoint` in either player's `history`. A casual game never counts regardless of length; a rated
game under 10 full moves never counts regardless of how it ended.

### 2.3 The K for one player in one game

Each player's K is derived independently, in two steps, from state as it stood **before** this game:

1. **Base K from the player's own total counted-rated-game count so far**:
   `base = player.games < 20 ? 32 : 16` (`elo.ts:201-202`). This is per-player, not joint — the two
   players in one game can be at different provisional/established status simultaneously.
2. **Diminishing return against this specific opponent** (`kForPairing`, `elo.ts:138-142`):
   ```
   kForPairing(base, played) =
     played < 3   ->  base
     played < 10  ->  base / 2
     otherwise    ->  0
   ```
   where `played` is the number of *counted* rated games this exact pair has already played, keyed
   by the two addresses sorted and joined (`pairKey`, `elo.ts:196`) — so it is symmetric regardless of
   who was white or black in any prior game, and it is shared between both players in the current
   game (the same `alreadyPlayed` value is used for both `kForPairing` calls, `elo.ts:203-204`).

A K of `0` (11th+ counted game against the same opponent) still lets the game **count** — `games`
still increments, the pair counter still increments — it simply moves nobody's number: the delta is
`round(0 × anything) = 0`, and the game still appears in `history` with `k: 0`.

### 2.4 The arithmetic

```
expectedScore(mine, theirs) = 1 / (1 + 10^((theirs - mine) / 400))          (elo.ts:145-147)

whiteExpected = expectedScore(whiteBefore, blackBefore)
blackExpected = 1 - whiteExpected                          (not computed separately — see below)

whiteScore    = 1 | 0.5 | 0, from the Scoresheet's result, white's perspective
blackScore    = 1 - whiteScore

whiteAfter = max(100, whiteBefore + roundHalfAwayFromZero(whiteK * (whiteScore - whiteExpected)))
blackAfter = max(100, blackBefore + roundHalfAwayFromZero(blackK * (blackScore - (1 - whiteExpected))))
```
(`elo.ts:206-218`). `whiteBefore` and `blackBefore` are both captured **before** either player's
rating is mutated, and both players' K values are decided from pre-game state — so despite being
written sequentially in code, the update is symmetric and the order the two are computed in cannot
change the result (`elo.ts:199-200`, comment). `blackExpected` is never materialised as its own
variable; `1 - whiteExpected` is used inline at the point `blackAfter` is computed
(`elo.ts:217`) — a reimplementation MUST use `1 - whiteExpected`, not a separately-rounded
`expectedScore(blackBefore, whiteBefore)`, because floating-point `1/(1+10^x)` and
`1/(1+10^-x)` do not always sum to bit-identical `1.0` and this protocol has never needed them to;
using the code's own `1 - whiteExpected` avoids introducing a divergence that doesn't exist in the
shipped arithmetic.

### 2.5 Rounding — round half away from zero

```
roundHalfAwayFromZero(v) = v < 0 ? -Math.round(-v) : Math.round(v)
```
(`elo.ts:155-157`). This is **not** the same as JavaScript's native `Math.round`, which rounds a
value ending in exactly `.5` toward **positive infinity** — `Math.round(2.5) === 3` but
`Math.round(-2.5) === -2`. The wrapper corrects the negative case by negating, rounding, negating back:
`roundHalfAwayFromZero(-2.5)` computes `Math.round(2.5) = 3`, then negates to `-3`. A reimplementation
in a language whose native rounding is "round half to even" or "round half toward zero" MUST implement
this exact half-away-from-zero rule, not substitute its platform default — the comment states why
directly: *"Ratings are symmetric; the rounding has to be too"* (`elo.ts:149-154`). Verified
numerically in `TEST-VECTORS.md` §4.

### 2.6 The floor

`Math.max(100, ...)` is applied **after** rounding, to each player's new rating independently
(`elo.ts:211-218`) — a rating that would compute below 100 is clamped to exactly 100, never lower.

### 2.7 Bookkeeping updated alongside the rating

For every counted game, both players additionally get, in this order (`elo.ts:220-257`):

- `games += 1` (both players, unconditionally for a counted game).
- `pairings.set(pairKey, alreadyPlayed + 1)` — the per-pair counter used by §2.3.
- `distinctOpponents`: the opponent's address is added to a per-player `Set`; `distinctOpponents` is
  that set's size after the addition.
- `established = distinctOpponents >= 10` (`DISTINCT_OPPONENTS_FOR_ESTABLISHED`) — recomputed on
  every counted game, not sticky once true (though since the set only grows, once true it stays true).
- A `RatingPoint` — `{ gameId, endedAtBlock, opponent, score, before, after, k }` — is appended to the
  player's `history`, in canonical game order, for **both** players (`elo.ts:240-257`).

### 2.8 Default for an unplayed address

`ratingFor(address, games)` returns `{ rating: 1200, games: 0, distinctOpponents: 0,
established: false, history: [] }` for any address with zero counted games in the given set — not an
error (`elo.ts:269-281`). A new player is new, not missing.

## 3. Puzzle Rating (`packages/core/src/puzzle-set.ts` + `packages/core/src/puzzlecard.ts`)

**Not specified anywhere in `SPEC.md`.** `SPEC.md` Part F is titled "the signed rating, specified"
and covers only the game side; the Puzzle Card format and this rating function post-date it entirely.
This section is the only specification either has, aside from the code's own comments.

### 3.1 Constants

| Constant | Value | Source |
|---|---|---|
| `PUZZLE_K` | 24 | `puzzle-set.ts:186` |
| `PUZZLE_START` | 1200 | `puzzle-set.ts:187` |
| `PUZZLE_FLOOR` | 400 | `puzzle-set.ts:188` |

`PUZZLE_K` is deliberately larger than either game-rating K: *"K is large because a puzzle rating
should find its level in a few dozen puzzles rather than a few hundred. ...every puzzle in this set
was sampled with a deviation at or below 80, which is the condition under which a fixed-K Elo update
and a Glicko one stay close"* (`puzzle-set.ts:176-183`).

### 3.2 The per-attempt update

```
nextPuzzleRating(rating, puzzleRating, solved):
  expected = 1 / (1 + 10^((puzzleRating - rating) / 400))
  next     = rating + 24 * ((solved ? 1 : 0) - expected)
  return   = max(400, Math.round(next))
```
(`puzzle-set.ts:190-194`). This uses the same `expectedScore` shape as Game Rating §2.4, applied to
one puzzle attempt rather than one game against another player — the "opponent" is the puzzle's own
rating.

### 3.3 Rounding — plain `Math.round`, NOT the same rule as Game Rating

`nextPuzzleRating` rounds with plain `Math.round`, **not** `roundHalfAwayFromZero`. This is a real
divergence between the two rating functions shipped in this codebase, stated here rather than
smoothed over: Game Rating rounds a value of exactly `-2.5` to `-3`; Puzzle Rating, had it ever
produced an exact `-2.5` internally, would round it to `-2` (`Math.round`'s native
half-toward-positive-infinity behaviour). In practice this exact edge is unlikely to matter for
Puzzle Rating specifically, because `PUZZLE_FLOOR` clamps the result and a single attempt moves the
number by at most `PUZZLE_K = 24` — but a reimplementation that assumed "the project uses one
rounding convention" and applied `roundHalfAwayFromZero` to puzzle attempts would diverge from the
shipped code on any input where the two rules actually differ. **A conformant reimplementation of
Puzzle Rating MUST use plain `Math.round` (round half toward positive infinity), matching
`puzzle-set.ts:193` exactly — not the Game Rating rounding rule.**

### 3.4 `computePuzzleRating` — the chain walk (`puzzlecard.ts:314-348`)

Unlike `computeRatings` for games, `computePuzzleRating` takes a plain array of `PuzzleCard`s with
**no address filtering built in** — the caller is responsible for having already restricted the
array to one solver's cards before calling it. (Contrast Game Rating's `ratingFor`, which does its
own filtering and defaulting internally, §2.8.) This asymmetry is a fact about the shipped code, not
a bug being reported — but a caller that hands `computePuzzleRating` an unfiltered, multi-solver card
array will get a single number that does not correspond to any one solver's rating.

Walking `canonicalCardOrder(cards)` (§1), starting from `rating = PUZZLE_START (1200)`,
`attempted = 0`, `solved = 0`, `brokenAt = null`:

For each card, in order:

1. **Chain-continuity check.** If `card.ratingBefore !== rating` (the running total) **and**
   `brokenAt` is still `null`, set `brokenAt = card.sessionId`. This is the *first* card whose
   claimed starting point does not match where the chain actually is — not thrown, recorded
   (`puzzlecard.ts:299-300`: *"a broken chain is a finding to display, not a crash"*).
2. **Replay if a verified attempt list is available.** If the caller's `attemptsFor(card)` callback
   returns an attempt list **and** `hashAttempts(attempts) === card.resultsHash` (i.e. the attempts
   are genuinely the ones this card's signature covers, not merely offered), replay them: starting
   from `card.ratingBefore`, apply `nextPuzzleRating` once per attempt in the list's own order. If the
   replayed total disagrees with the card's own `card.ratingAfter` **and** `brokenAt` is still `null`,
   set `brokenAt = card.sessionId` — **the replayed value is authoritative here, not the signed
   `ratingAfter`**: *"the signed number is not preferred over the replay — the replay is the check"*
   (`puzzlecard.ts:334-336`). `rating` is set to the replayed value.
3. **Otherwise, trust the signed `ratingAfter`.** If no attempt list was supplied, or the supplied one
   does not hash to `card.resultsHash`, `rating` is set to `card.ratingAfter` directly — the card
   still counts, because *"a rating cannot be erased by withholding a file"* (`puzzlecard.ts:338-340`,
   demonstrated in `packages/core/test/puzzlecard.test.ts:153-164`).
4. `attempted += card.attempted; solved += card.solved` — accumulated regardless of which branch
   (2 or 3) was taken.

Returns `{ rating, runs: cards.length, attempted, solved, brokenAt }`. `computePuzzleRating([])`
returns `{ rating: 1200, runs: 0, attempted: 0, solved: 0, brokenAt: null }` — the puzzle-side
equivalent of Game Rating's default-for-unplayed behaviour (§2.8), though here it is the caller's
responsibility to invoke it with an empty array for a solver with no cards, since there is no
address-keyed lookup function on the puzzle side analogous to `ratingFor`.

`brokenAt` only ever records the **first** disagreement found while walking forward — a chain with
multiple breaks reports only the earliest one, by construction of the `&& brokenAt === null` guard at
both check sites.

## 4. What `SPEC.md` does not cover, stated plainly

`SPEC.md` Part F specifies Game Rating in full (§2 above matches it field-for-field, modulo the
rounding-detail depth this document adds). It says **nothing** about Puzzle Rating: no constants, no
formula, no chain-walk algorithm, no mention that a second rating pool exists at all. This is not a
disagreement to reconcile the way `RECORDS.md` §6 reconciles two Scoresheet-field discrepancies — it
is an absence. `puzzlecard.ts` and `puzzle-set.ts` are the **only** specification Puzzle Rating has
until `SPEC.md` is extended to cover it; §3 above is this document set's attempt to make that
specification complete and precise enough for independent reimplementation in the meantime.

The rounding divergence in §3.3 is a second, narrower gap worth restating here: nothing in either the
code's own comments or `SPEC.md` explains *why* Puzzle Rating uses a different rounding rule from Game
Rating — it may be an oversight rather than a deliberate choice. This document does not resolve that
question; it documents the divergence as a fact about the shipped arithmetic that any faithful
reimplementation MUST reproduce, whether or not it was intentional.

## 5. Anti-farming rules (Game Rating)

Restated from `SPEC.md` Part F4 against the exact constants in §2.1, since the rules only mean
something with real numbers attached:

1. **Diminishing K per opponent** (§2.3) — full K for the first 3 counted games against a given
   opponent, half K for games 4–10, zero K from the 11th. Two wallets playing only each other
   converge and then stop moving each other's number at all.
2. **`distinctOpponents` MUST be displayed beside every rating shown, unconditionally** — this is a
   product/UI requirement stated in `SPEC.md` Part F4 point 2, not something `elo.ts` itself enforces
   (the field is simply present on `Rating`, §2.7); it is listed here because the number's honesty
   depends on it being visible, not merely computable.
3. **`established` gates leaderboard eligibility and display**: `distinctOpponents < 10` MUST be
   shown as provisional (`SPEC.md`'s own convention: a `?` marker) and excluded from any ranked list.
4. **`MIN_MOVES_TO_RATE = 10` and `rated` gate whether a game counts at all** (§2.2) — a two-move
   resignation is recorded but moves nobody's number.
5. **Nothing about payouts keys on rating** — a product-level design choice (`SPEC.md` Part F4 point
   5), not something this file's arithmetic can enforce or verify.

**The honest limit, stated as `SPEC.md` states it**: these rules make farming a rating *not worth
doing*, not *impossible*. A determined actor with many wallets and much patience can still produce a
provisional-flagged number over many distinct opponents found or paid to play; what they cannot do is
produce an *established* rating without ten genuinely distinct co-signers, each of whom had to sign a
real game (`SPEC.md` Part F4, final paragraph).

## 6. What a rating does NOT establish

Restated from `SPEC.md` Part F6, applying identically to both rating functions in this file:

- **Not a global, cross-platform pool.** Two Scoresheet players in a small population have ratings
  that are not comparable to each other in the way two Lichess ratings are, and are not comparable to
  a Lichess, Chess.com, or FIDE rating at all — those are disjoint scales, independently evidenced by
  the existence of third-party rating-converter tools whose entire purpose is bridging incomparable
  systems (cited in `research/10-ideas/portable-identity.md` §3).
- **Does not prove a human played the moves.** A recomputable rating is a statement about which
  wallets signed which results in which order — it says nothing about who or what was actually
  choosing moves. `FAIR-PLAY.md` (DRAFT, unshipped) is the design for the evidence layer that would
  speak to this; it does not exist in code today.
- **Does not survive both signing parties losing their keys.** A record that exists on two now-
  inaccessible devices and was never shared anywhere else is gone. Nothing signed survives that.
