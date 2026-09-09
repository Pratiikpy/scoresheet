# Fair-play evidence record — **DRAFT, NOT IMPLEMENTED**

**Status: DRAFT.** No file under `packages/` or `apps/` computes or stores a fair-play signal, a risk
score, a confidence band, or a signed review verdict — verified by a repository-wide search on
2026-09-08 for `moveTime`, `move-time`, `riskScore`, `fairplay`, `fair_play`, `confidenceBand`, and
`engineAgreement` across the codebase, with zero matches. `BRIEF.md` and `SPEC.md` Part K1/K2 commit
to *"record and show, never auto-ban"* and to move-time variance as a signal, but neither signal is
instrumented in code today. This document is a normative rewrite of
`research/05-fair-play/design.md`, itself original synthesis grounded in those two prior product
decisions. **Nothing in this file describes running code or a running record format.**

## 1. Scope

The design proposes a per-game (and per-run) **risk score**, built from an ensemble of independent
signal families, mapped to one of three disclosed confidence bands, each with a defined money
consequence:

| Band | Meaning | Money consequence |
|---|---|---|
| **Normal** | No signal, or combination, crosses a review threshold | Payout settles immediately |
| **Review** | At least one signal, or a moderate combined score, crosses a disclosed threshold | That game's payout only is held in escrow for a bounded, published window; both players are notified with the specific triggering signal(s) named; auto-releases if the window expires with no escalation |
| **High-risk** | Multiple independent signal families agree, or one crosses a very high threshold | Payout held pending explicit human/panel review, no auto-release |

## 2. The signal families (as designed)

1. **Engine agreement** — top-engine-move match rate, weighted so matching in a sharp forcing line
   counts less than matching in a quiet position with many similarly-good options. Requires an engine
   (`SPEC.md` K1, itself shipped for Game Review — but not wired to any fair-play signal).
2. **Move difficulty** — the evaluation gap between the best move and the next-best at the exact
   decision point. Requires an engine.
3. **Move-time distribution** — raw variance in thinking time across a game. Needs no engine; the one
   signal `BRIEF.md` already commits to as the pre-engine baseline — **not instrumented in shipped
   code today** (§0).
4. **Time-vs-difficulty correlation** — whether time spent tracks move difficulty, not variance alone.
   The design's strongest-cited signal, per "Chess Signatures of Play" (arXiv 2606.18544, 2026):
   accuracy that rises precisely when positions become hard is the telltale shape of engine
   assistance, and it is a shape invisible to aggregate statistics that only look at totals. Usable in
   a weak, pre-engine form using legal-move-count as a difficulty proxy.
5. **Position complexity** — material imbalance, king safety, pawn structure, mobility, phase — a
   structural read of the position independent of any one move, feeding signal 4 and standing alone.
6. **Strength trajectory** — a step-change in a player's own `RATING.md` §2 history inconsistent with
   their historical improvement rate. Needs only this product's own rating history; no engine required.
7. **Divergence from the player's own history** — whether this game's behavioural profile is an
   outlier relative to *this specific player's* last N games, not the population. Requires
   accumulated per-player history; undefined for a new account.
8. **Device/network signals** — tab-focus loss, input-timing entropy, multi-account device/IP
   fingerprint overlap, latency inconsistent with claimed location. **NOT VERIFIED** whether this is
   worth its privacy and engineering cost at this product's scale — listed because the source design
   considered the full signal space, not because its value here has been demonstrated. MUST be
   disclosed in a public fair-play page if ever built, to stay consistent with the transparency
   commitment in §5.
9. **Tournament/prize context** — a policy multiplier, not a statistical signal: scrutiny scales with
   the amount at stake, matching this product's stated philosophy that "the amount configures
   everything." A free casual game and a funded-pool tournament game with identical raw signal values
   would not sit in the same band.

Two supporting cross-game signals beyond the core nine, per the source design: **cross-opponent
consistency** (a flat-vs-uneven signal pattern across different opponents) and **opponent-adjusted
overperformance across a run**, not one game in isolation.

## 3. Why an ensemble, not a single number (as argued in the source design)

- A single accuracy-shaped signal, tuned to catch real cheaters, provably also flags a predictable
  population of innocent strong or improving players — this is not a tuning failure, it is what any
  such statistic *is* (Barnes & Hernandez-Castro's 120,000-pre-2005-game study, cited in the source
  design, flagged 92+ players from an era when cheating was practically impossible).
- Limited, selective cheating — one or two well-chosen engine moves per game — moves an aggregate
  accuracy score very little while capturing most of the practical benefit, which is exactly the regime
  where a single-threshold detector is weakest (arXiv 2601.05386, cited in the source design).
- Some cheating strategies are constructible that leave every aggregate statistic unchanged, including
  the ones the established Regan/IPR method relies on, while still being caught by an order-sensitive,
  sequence-based test — a published construction, not a hypothetical (arXiv 2606.18544).

## 4. What building this would require

- **Per-move instrumentation from day one** — clock time per move and legal-move-count as a cheap
  complexity proxy, stored alongside the signed Scoresheet, even before any engine-based signal exists.
  This is the first concrete gap versus shipped code: no such instrumentation exists today.
- **A per-player history store** for the self-baseline signal (§2 item 7), with an explicit
  "insufficient history" state distinct from "normal" for new accounts.
- **A calibration substitute for the labelled data this product does not have** — the source design
  proposes synthetic calibration: generating self-play and engine-assisted games at known assistance
  levels to calibrate detection power against a known ground truth, since no real moderator-confirmed
  cheater dataset exists for this product the way it does for Lichess or Chess.com.
- **A signature/sequence-based test alongside the aggregate signals**, per the arXiv 2606.18544
  finding — the one signal family in the design with a concrete, citable algorithm rather than an
  invented approach.
- **An escrow/hold primitive on individual payouts**, keyed to the specific game or run, with a
  timeout — a payments-layer requirement, and the piece the source design most directly hands to the
  Nimiq integration.
- **A signing key for the review verdict itself**, whether an automated system key for a bounded
  auto-release or a human/panel key for high-risk manual review — so the outcome of review is, in
  principle, as auditable as the game record it reviews. **This is the point of contact with
  `PROTOCOL.md`**: a fair-play verdict, if built, would itself need to become a signed, canonicalised
  record following the same discipline `RECORDS.md` specifies for a Scoresheet — no such record format
  is specified anywhere yet, including in the source design, which describes the *property* the
  verdict should have ("as auditable as the game it reviews") without specifying its wire format.

## 5. The transparency-vs-gaming tension (stated, not resolved)

The source design names this directly and does not claim to resolve it: a product whose core promise
is that results are signed and independently recomputable exposes its fair-play *method*, or at
minimum its shape, more than a closed system like Lichess's or Chess.com's, both of which keep
operational thresholds private specifically to prevent gaming. Three mitigations are proposed, none a
substitute for the others:

1. Publish the architecture and raw feature values; do not publish trained weights or exact numeric
   thresholds — the same line Lichess already draws.
2. Prefer signals that are structurally hard to fake without creating a new, different anomaly
   elsewhere in the same ensemble (the argument for signal 4 in particular).
3. Treat thresholds and weights as a moving target under continuous, disclosed retraining, not a fixed
   permanently-exploitable bar.

## 6. What this design does NOT establish

- **It is unvalidated.** Every threshold implied above is a placeholder shape, not a calibrated
  number — there is no labelled dataset of confirmed cheaters on this product to calibrate against.
  Until real calibration happens, no specific numeric threshold should be treated as anything but
  illustrative.
- **The review-band auto-release timeout is a genuine, named risk, not a free lunch** — a patient
  actor who stays just under the high-risk threshold pays no real cost for repeated review-band
  delays that always auto-release.
- **Disclosing named triggering signals is itself informative to a would-be cheater** about which
  behaviour got them flagged — accepted as the cost of the product's own fairness commitment (a
  flagged player has a right to know what they are being asked to respond to), not resolved away.
- **Neither this record format nor any of the nine signals is specified precisely enough to
  implement today** — unlike `RECORDS.md`'s byte-exact field tables for the Scoresheet and Puzzle Card,
  this document describes signal *categories* and a *band* structure, not field encodings, hash
  preimages, or a canonical serialisation. A future implementer's first task would be writing that
  specification — this document is not it.
- **This tension cannot be fully resolved, only managed**, in the source design's own words — restated
  here rather than smoothed into a false promise of a solved problem.
