# Lichess — fair play, Irwin, Kaladin

Sources read directly: [lichess.org/page/fair-play](https://lichess.org/page/fair-play),
[github.com/clarkerubber/irwin](https://github.com/clarkerubber/irwin) (README + GitHub API licence
metadata), [github.com/lichess-org/kaladin](https://github.com/lichess-org/kaladin) (README + GitHub
API licence metadata), [en.wikipedia.org/wiki/Cheating_in_online_chess](https://en.wikipedia.org/wiki/Cheating_in_online_chess).
Community forum threads are cited where used and flagged as anecdotal, never as official policy.

## 1. What they do

Lichess runs **two independent detection systems**, not one: Irwin looks for play *characteristic
of a chess engine*; Kaladin looks for play *uncharacteristic of the player themselves*.
[en.wikipedia.org/wiki/Cheating_in_online_chess](https://en.wikipedia.org/wiki/Cheating_in_online_chess)

- **Irwin** (`github.com/clarkerubber/irwin`) — Python, TensorFlow. Runs Stockfish over a player's
  games at configurable depth/threads/memory and feeds the principal variations to a neural network
  that estimates "the odds of cheating occurring." It descends from an earlier concept called
  "cheatnet." A fresh deployment needs a training set of "a few hundred" already-assessed players
  before its model is usable. Its stated purpose is to "assist moderators in assessing potential
  cheaters" — the README frames it as a scoring aid, not an auto-ban trigger.
  [github.com/clarkerubber/irwin](https://github.com/clarkerubber/irwin)
- **Kaladin** (`github.com/lichess-org/kaladin`) — CNNs on Keras/TensorFlow, trained on Lichess's own
  per-game "insights" data (the same move-time/accuracy breakdown shown to any player about their own
  games) rather than on engine output. The repository's git history was deliberately expunged when it
  was open-sourced so that user data already baked into old commits would not leak.
  [github.com/lichess-org/kaladin](https://github.com/lichess-org/kaladin)
- **Both licensed AGPL-3.0** — confirmed directly against the GitHub API licence field for each repo,
  2026-09-08, not inferred from the README.
- **Neither README documents the operational thresholds, feature weights, or validation numbers.**
  Both stop at architecture and training mechanics; my own fetch of each README explicitly found no
  disclosed false-positive rate, no confidence calibration, and no description of exactly which
  "insights" fields Kaladin consumes.
- **Rules page** (`lichess.org/page/fair-play`) is a ToS-style prohibition list — engines, opening
  books beyond what's allowed, move-recommendation software, third-party move-playing extensions —
  with an explicit carve-out for the official bot/board API and, in correspondence chess, for opening
  databases. It documents *what is banned*, not *how it is caught*.
  [lichess.org/page/fair-play](https://lichess.org/page/fair-play)
- **Scale** (as reported by Wikipedia, citing Lichess): ~91,000 reports in 2022 and ~93,000 in 2023,
  resulting in ~61,000 and ~72,000 flagged accounts respectively.
  [en.wikipedia.org/wiki/Cheating_in_online_chess](https://en.wikipedia.org/wiki/Cheating_in_online_chess)
- **Appeals**: by email to `contact@lichess.org`. Lichess states it will not discuss the specific
  evidence or reasoning behind an individual moderation decision, on the stated ground that doing so
  would teach cheaters how to evade the system and invite unproductive public debate — this framing
  recurs across multiple Lichess forum threads paraphrasing moderator statements, but I did not find
  a single canonical policy page stating it verbatim, so treat the *exact wording* as
  **NOT VERIFIED**, while the *practice* (no case-level evidence disclosed) is corroborated by many
  independent threads, e.g.
  [lichess.org/forum/general-chess-discussion/how-does-lichess-catch-cheaters](https://lichess.org/forum/general-chess-discussion/how-does-lichess-catch-cheaters).

## 2. Why it works

Two structurally different models cover two different failure modes at once. Irwin asks "does this
game look like a machine played it," which catches obvious, sustained engine use even against a
player with no history. Kaladin asks "does this game look like *this specific player*," which catches
subtler, calibrated cheating that stays within human-plausible bounds in absolute terms but breaks the
player's own established pattern. A cheater who successfully disguises play from one model still has
to separately disguise it from the other, which is a materially harder problem than beating a single
score — this is the same principle the product should copy (see §4).

Keeping the code open under AGPL while withholding the trained weights and exact decision thresholds
lets outside researchers verify the *shape* of the method — what data it consumes, what architecture
it uses — without handing a cheater the exact bar they need to clear. Human moderator review as the
stated final step (Irwin's own README language: "assist moderators") means no single model score is
allowed to be the whole decision.

## 3. What they do badly

- **Total opacity on validation.** No public false-positive rate, no precision/recall figures, no
  published count of reversed decisions. There is no way for an outsider — or a wrongly-flagged
  player — to check whether the system is well-calibrated; the reader has to take it on faith.
- **No formal, documented appeals process.** The email address exists; the criteria a moderator uses
  to grant or deny an appeal do not appear to be published anywhere. Multiple community forum threads
  (anecdotal, not verified as representative) describe appeal responses that read as templated rather
  than case-specific — flagged here as unverified sentiment, not fact, but the underlying complaint
  (no visible reasoning is ever returned to the appellant) is consistent with Lichess's own stated
  non-disclosure practice, so it is at minimum the predictable consequence of that policy.
  [lichess.org/forum/lichess-feedback/false-positives](https://lichess.org/forum/lichess-feedback/false-positives)
- **The flag is binary.** A player is either marked or not; nothing in the public documentation
  describes an intermediate "under review" state visible to the player themselves before a final
  decision — a different design choice than the confidence-band approach this product should use
  (§5 of `design.md`).
- **Both README files are thin by design.** That is a defensible security tradeoff, but it also means
  the open-source claim buys less independent auditability than it appears to: the code that's public
  is the scaffolding, not the part that actually decides anyone's outcome (the trained model and its
  thresholds are not in either repository).

## 4. What we should copy conceptually

- **Run at least two structurally different signal families, not one.** An absolute, engine-agreement
  based model (Irwin's role) and a self-baseline, player-relative model (Kaladin's role) fail
  independently, so beating both is harder than beating either alone.
- **Keep detection code and method open; keep the trained operational thresholds closed.** This is
  the specific line Lichess draws between "auditable" and "gameable," and it is a defensible middle
  point between full opacity and full transparency — directly relevant to the tension `design.md` §7
  has to resolve for a product that has promised full transparency.
- **Human review as the final gate on any consequential action.** Irwin explicitly frames its output
  as decision support for a moderator, never as the decision itself.
- **A self-baseline signal needs a history to compare against.** Kaladin only becomes meaningful once
  a player has played enough games to establish a personal pattern — the same cold-start problem this
  product will have on day one (see `design.md` §7).

## 5. What we can do better

- Lichess is a free ladder with no money on the line; nothing forces it to publish a false-positive
  rate, hold anything in escrow, or give a flagged player a bounded, disclosed review window. A
  product with real prize money attached cannot get away with the same opacity — a wrongful flag here
  is a wrongful denial of money, not a rating inconvenience, so the review process itself has to be
  visible and time-bounded in a way Lichess's isn't (see `design.md` §8).
- We can publish an actual confidence score and its calibration methodology instead of a binary
  ban/no-ban outcome, because our transparency promise (signed, independently recomputable results)
  already commits us to publishing more than Lichess ever had to.
- We can attach the flag itself to the same signed record the result lives in, so a later reversal or
  confirmation is itself part of the auditable trail — something neither Irwin's nor Kaladin's private
  database flag allows any outsider to verify today.

## 6. What is technically required

- Per-move clock time and, once an engine exists, per-move engine evaluation and legal-move-count
  data captured at play time — both Irwin (engine PVs) and Kaladin (insights/timing) depend on this
  being logged from the start, not reconstructed after the fact.
  This project's own `SPEC.md` already plans the engine (Part K1) as the unlock for accuracy-based
  signals; until it lands, only timing-based signals (already decided in `BRIEF.md`, "move-time
  distribution") are available.
- A per-player history store, since any Kaladin-style self-baseline signal is undefined without one.
- A labelled dataset to validate any ML component against. Lichess has years of moderator-confirmed
  bans to train and check against; this product starts with zero, which is the single largest gap
  between what Lichess can do and what we can do at launch (see `design.md` §6 for the mitigation —
  synthetic/engine-generated calibration data in place of real labelled cheaters).

## 7. What could break

- **AGPL-3.0 on both repositories means their code cannot be ported into an MIT product at all.**
  Per this repo's own `LICENCES.md`, distributing (including serving to a browser or over an API) a
  derivative of AGPL code obliges offering that derivative's source under AGPL too — incompatible with
  the MIT requirement. Only the *ideas* (methods, architecture shapes, what data to log) are free to
  take, per `LICENCES.md` §3 and the clean-room protocol in `REFERENCE_APPS_LIFT_PLAN.md` §0; no code
  from either repository may be read-and-retyped, only read-and-redescribed by someone who then writes
  original code from the description.
- **Cold start.** A self-baseline signal is useless for a brand-new player, which is every player of
  this product on day one — there is no accumulated Kaladin-equivalent history to compare against.
- **No labelled ground truth.** Any ML model trained without confirmed-cheater examples is unvalidated
  by construction; this is the same problem Barnes & Hernandez-Castro's critique of engine-only
  detection identifies for the field generally (see `design.md` §2).

## 8. What we can uniquely do because of Nimiq

- A cheat flag can be a signed attestation attached to the same on-chain-recomputable scoresheet the
  result already lives in, rather than a row in a private moderation database only Lichess staff can
  see — a later confirmation or reversal becomes part of the same auditable record, which is strictly
  more transparent than anything Irwin or Kaladin's private flag offers today.
- Money gives this product a natural "hold and review" state Lichess never needed: instead of an
  irreversible ban/no-ban decision on a free ladder, a specific disputed payout can be held pending
  review while the rest of the player's account and history continue unaffected (developed fully in
  `design.md` §8).

## 9. Licence and reuse verdict

| Source | Licence (verified) | What may be reused |
|---|---|---|
| `lichess.org/page/fair-play` | Site content, not source-licensed; treat as © Lichess | Facts/policy may be described and cited; not for verbatim reproduction at length |
| `github.com/clarkerubber/irwin` | **AGPL-3.0** — GitHub API licence field, checked 2026-09-08 | Architecture/method ideas only, per `LICENCES.md` §3. No code may be ported into this MIT project |
| `github.com/lichess-org/kaladin` | **AGPL-3.0** — GitHub API licence field, checked 2026-09-08 | Same as above |
| `en.wikipedia.org/wiki/Cheating_in_online_chess` | CC BY-SA | Facts paraphrased into original prose above, with citation; not copied verbatim |

Nothing in this file or in the product may take code from Irwin or Kaladin. Any structural idea worth
lifting (e.g. "run two independent model families") goes through the clean-room read-then-redescribe
process this repo already uses for other AGPL/GPL reference material.
