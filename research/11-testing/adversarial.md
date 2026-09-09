# Adversarial — the anti-cheat test lab, and measuring false positives without accusing anyone

Research date: 2026-09-08. Scope: this project's own product decision, already made and recorded in
`BRIEF.md` and `SPEC.md`, is **"record and show, never auto-ban"** — using accuracy that is "too
even across easy and hard positions" (`SPEC.md` B1, `LICENCES.md` §6) alongside move-time variance
("a human's thinking time varies enormously with how hard the position is; an assisted player's does
not," `BRIEF.md`) as signals, surfaced on the certificate only when extreme, with an explicit
standing worry: **"a false positive against a strong player is worse than a missed cheat, and there
is no appeals process to run"** (`BRIEF.md`). None of this is built yet. Checked directly against the
codebase: `packages/core/src/analysis.ts` computes a volatility-weighted game accuracy but has no
named "evenness" or cheat-signal export; no file under `packages/core/src` or `packages/server/src`
stores a per-move timing series (`live.test.ts` tracks running clock state — `whiteMs`/`blackMs` —
not a persisted move-time array); and `research/05-fair-play/` is an empty folder. This is the gap
this file is about.

## 1. What they do

**Lichess** runs two detection systems: **Irwin**, which looks for play *characteristic* of a chess
engine, and **Kaladin**, a CNN (built on Keras/TensorFlow) trained on Lichess's own "Insights" data
that looks for play *uncharacteristic* of the player's own history. Move-time is one factor Kaladin's
public description considers, explicitly not the sole one — Lichess's own material acknowledges that
a legitimate player who is comfortable at long time controls but plays fast, uniform moves when
low on the clock can resemble the pattern the signal is watching for, an openly named false-positive
source. Source: https://github.com/lichess-org/kaladin,
https://www.themecircle.net/how-does-cheat-detection-work-on-lichess-mechanisms-explained/.

**Chess.com** detects "suspicious play based on over 100 gameplay factors," combined via
"accompanying statistical algorithms" into a probability judgment, and auto-bans when a performance
is deemed "extremely improbable." About 85% of closures are fully automated; "for cases that are less
clear or where titled players are involved, our Fair Play analysts personally review each report."
Both platforms explicitly decline to publish their exact signals or thresholds: "we unfortunately
cannot do so, as players who cheat are reading this as well." Source:
https://www.chess.com/cheating.

**The one concrete false-positive-adjacent number either platform discloses publicly**: Chess.com
states it "reviewed approximately 28,000 appeals (out of 314,000 total closures) and granted 0.2% of
them." Source: https://www.chess.com/cheating. This is an *appeal-grant* rate, not a true
false-positive rate — it necessarily undercounts real false positives, since a falsely-flagged player
may not appeal, may not understand why they were flagged, or may have experienced a lesser action
(a throttle, not a visible ban) that carries no appeal path at all.

## 2. Why it works

Combining many weak signals statistically (Chess.com's "100+ gameplay factors") is far harder to game
than any single threshold, because a player who successfully evades one signal is still exposed by
the others — this directly matches this project's own already-chosen design of pairing accuracy-
evenness with move-time variance rather than trusting either alone.

A human-review gate before the costliest action (an account ban) trades speed for a lower
false-positive cost specifically on the highest-profile and most ambiguous cases — exactly the same
logic behind this project's own decided rule of never acting automatically on a flag, only recording
and surfacing it.

Withholding the exact operational thresholds (while, in Lichess's case, publishing the open-source
detection code itself) makes naive evasion harder without making the method unauditable in principle
— a real tension worth naming rather than silently inheriting, because this project's MIT bundle
makes its own signal-computation code public by construction (see §5).

## 3. What they do badly

Neither platform publishes an actual false-positive **rate** — only Chess.com's appeal-grant number,
which is a lower bound at best, for the reasons in §1. A player who wants to know "how often does
this system wrongly flag someone like me" cannot get an answer from either platform's public
material.

Both are black boxes by design, which is the opposite of this project's own foundational pitch
(signed, publicly recomputable rating and game record). A project whose entire thesis is "you do not
have to trust us, check it" (`scripts/counts.mjs`) cannot adopt the industry's opacity wholesale
without contradicting itself, and needs its own resolution to that tension rather than silently
copying the posture (see §5).

Lichess's own public description of Kaladin names an unresolved false-positive source in its own
methodology (the low-on-time fast-uniform-move player) without stating how, or whether, it is
corrected for.

## 4. What we should copy conceptually

- **The multi-signal principle** — accuracy-evenness and move-time variance together, not either
  alone — which this project has already chosen (`BRIEF.md`) but not yet built.
- **A held, never-auto-acted flag, with the costliest response reserved for a case a human actually
  looks at** — matching this project's own already-decided rule exactly.
- **Treating the signal's exact formula as public** (since the code is MIT and cannot be hidden even
  if desired) while treating the specific operational threshold — the number the signal is compared
  against — as an internal, not-necessarily-published parameter, the way Lichess publishes Kaladin's
  source but not its decision boundary.

## 5. What we can do better

- **Publish an actual measured false-positive rate**, built from the honest/dishonest test matrix
  below, rather than the industry's opaque non-disclosure or Chess.com's appeal-grant proxy. This
  is something neither major competitor does at the rate level, and it is a direct, low-cost
  extension of this project's own existing evidence-first standards.
- **Build the missing data model before any signal can exist.** Today there is genuinely nothing to
  test: no per-move timing is stored anywhere in the codebase (confirmed by direct search), and
  `analysis.ts` has no named accuracy-evenness export. This is pure specification right now, not
  code — closing that gap has to come before an anti-cheat test matrix has anything real to run
  against.
- **Use this project's own bot levels as a free, ethically clean synthetic positive control.** `Pip`,
  `Nell`, `Vera` and `Oskar` (`packages/core/src/engine.ts`) are deterministic-strength opponents
  already built and already tested for legality and behaviour. A human playing an entire game by
  literally relaying `Oskar`'s moves is a perfect, reproducible "assisted play" positive case — no
  need to recruit or simulate a real cheater to have a labeled-positive test fixture.

## 6. What is technically required

- **Per-move elapsed-time storage.** Currently absent — needs adding to the live game record and/or
  the signed scoresheet's underlying data (not necessarily the signed text itself, which is already
  fixed and tested exhaustively in `scoresheet.test.ts` — a separate, unsigned per-move timing log is
  the natural place for this, kept apart from anything that affects the rating chain). This is a real
  , unbuilt feature, not a config flag.
- **A named, exported accuracy-evenness metric.** `analysis.ts`'s existing `gameAccuracy` already
  computes a volatility-weighted mean using a windowed standard deviation of win-probability swings
  (`packages/core/src/analysis.ts`) — the evenness signal SPEC describes is a natural sibling
  computation (how flat is per-move accuracy across positions of varying difficulty), not a new
  subsystem, but it does not exist as its own function yet and needs to be specified precisely enough
  to test.
- **A labeled test-fixture generator**: real public games (sampled at varied ratings, for honest
  examples) alongside synthetic "engine-relayed" games produced by literally driving
  `packages/core/src/search.ts` as every move for one side, at a few different fixed depths, as the
  dishonest examples. A controlled matrix crossing {honest, engine-assisted-every-move,
  engine-assisted-only-in-critical-positions, honest-but-naturally-uniform-thinker} against
  {blitz, rapid} time controls is the concrete shape of "the anti-cheat test lab" this file is named
  for.

## 7. What could break

- **Short games are exactly where the signal is noisiest.** This project's own time controls skew
  fast (5+0, 10+0 among the presets in `SPEC.md` P3), and a variance-based statistic computed over a
  few dozen blitz moves has far less data to work with than the same statistic over a long classical
  game — `analysis.test.ts` already guards a related edge ("a game with no moves does not divide by
  zero"), but a 15-move blitz loss is precisely the regime where a variance signal has the least
  power and the highest false-positive risk.
- **A genuinely consistent human is the textbook false positive.** A strong player who simply thinks
  a similar amount of time on every non-critical move out of habit will resemble the "uniform
  thinking time" signal regardless of intent — this is exactly the failure mode `BRIEF.md` already
  names as the overriding worry, and it is why the product decision is record-only.
- **The formula is unavoidably public; the threshold cannot fully compensate.** Because the code
  shipping the signal is MIT and open, a sophisticated player can read this project's own repository,
  learn exactly how accuracy-evenness and move-time variance are computed, and deliberately vary
  their play to sit under whatever threshold is chosen. This is a real, structural limitation worth
  stating plainly in any anti-cheat documentation this project publishes, rather than implying
  "record and show" is unbeatable.

## 8. What we can uniquely do because of Nimiq

Because every game is already a signed, permanent, publicly-verifiable record (`SPEC.md` Part F), an
anti-cheat flag could be attached to the same public certificate as a transparent, timestamped,
**non-punitive** annotation — "this game's move-time variance was in the top 1% of games this month"
— rather than a private ban-or-not decision visible only inside a company's own database. That turns
cheat-signal transparency itself into a feature no chain-less competitor can offer: Chess.com and
Lichess's fair-play decisions are opaque by construction (accounts, private databases, no public
record of the decision or its inputs), while this project's decision — record, never auto-act — could
be made to mean the record itself is exactly as public and independently recomputable as the rating
already is.

`distinctOpponents` — already built and tested (`packages/core/src/elo.ts`, `elo.test.ts`) — is
itself a Sybil-resistance signal unique to a wallet-based, signature-authenticated system: a rating
built from few distinct opponents is visibly, publicly weak without needing to accuse anyone of
anything, which is a softer anti-cheat-adjacent signal Chess.com and Lichess (account-based, not
wallet-based, and not exposing an equivalent number to the public per-profile) cannot offer in the
same directly-verifiable way.

## 9. Licence and reuse verdict

- **Lichess's Irwin (`clarkerubber/irwin`) and Kaladin (`lichess-org/kaladin`) are both AGPL-3.0**
  (confirmed via `gh api repos/lichess-org/kaladin` and `gh api repos/clarkerubber/irwin`, both
  reporting `license.spdx_id: AGPL-3.0`). Consistent with this repo's existing `LICENCES.md`
  treatment of AGPL Lichess code: study the *concept* freely (ideas, procedures and methods of
  operation are not copyrightable, `LICENCES.md` §3), but never port, read-and-retype, or clean-room
  their actual detection code — nothing in this file recommends doing so, and nothing here requires
  it. The accuracy-evenness and move-time-variance signals this project already committed to
  (`BRIEF.md`) are original computations over this project's own existing `analysis.ts` output, not a
  derivative of either tool.
- **Chess.com's Fair Play system is entirely closed-source and proprietary** — nothing to reuse, and
  its published material (https://www.chess.com/cheating) is cited here only as a factual source for
  its disclosed numbers, never as code or text to copy.
- **This project's own bot levels** (`packages/core/src/engine.ts`), used above as a synthetic
  positive-control fixture, are already original, MIT-licensed code in this repository — no licence
  question at all.
