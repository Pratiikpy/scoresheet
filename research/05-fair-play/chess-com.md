# Chess.com — fair play policy and stated cheat-detection method

Sources read directly: [chess.com/legal/fair-play](https://www.chess.com/legal/fair-play),
[chess.com/cheating](https://www.chess.com/cheating),
[chess.com/blog/Jordi641/advanced-cheat-detection-algorithms](https://www.chess.com/blog/Jordi641/advanced-cheat-detection-algorithms)
(community blog, not an official Chess.com publication — flagged where used),
[en.wikipedia.org/wiki/Cheating_in_online_chess](https://en.wikipedia.org/wiki/Cheating_in_online_chess).

## 1. What they do

- **`chess.com/legal/fair-play`** is the legal ToS document: Chess.com "reserve[s] the right and
  discretion to monitor all chess games played on our platform," states "we can detect if you are
  using any of these programs" (engines/software), and names **prize forfeiture** as a possible
  consequence. It allows discretionary "second-chance accounts" for titled players on a case-by-case
  basis. It does not describe a formal appeals process.
  [chess.com/legal/fair-play](https://www.chess.com/legal/fair-play)
- **`chess.com/cheating`**, the public explainer, is far more specific:
  - Detection combines **"over 100 gameplay factors"** with statistical algorithms that flag
    "extremely improbable" performance, built and tuned by an internal R&D team running large-scale
    simulations across millions of moves and historical data.
  - **~85% of account closures are fully automated**, with no human review before closure; the
    remainder go to human review.
  - Explicit, load-bearing statement: **"Accuracy... is not cheat detection."** A high engine-match
    accuracy score alone is not treated as evidence.
  - **External validation cited**: a Harvard statistician vetted the algorithms in 2016; US Chess
    conducted its own statistical review and endorsed the system in 2020.
  - **Appeals, Jan–Mar 2025**: ~28,000 appeals reviewed out of ~314,000 total closures in the window,
    with **~0.2% granted**.
  [chess.com/cheating](https://www.chess.com/cheating)
- **2023 figures**, as reported by Wikipedia citing Chess.com: on the order of 1 million account
  closures for the year, 165 of them titled players including 20 grandmasters; ~39,000 appeals with
  ~0.3% approval that year — a slightly different appeal-grant rate than the Jan–Mar 2025 figure
  above, reported here as-is from two different reporting periods rather than reconciled.
  [en.wikipedia.org/wiki/Cheating_in_online_chess](https://en.wikipedia.org/wiki/Cheating_in_online_chess)
- **Documented high-profile dispute**: in November 2023, Hikaru Nakamura scored 45.5/46 in an online
  blitz event; this generated roughly 2,000 internal Fair Play reports on his games, all reviewed with
  no cheating found; a cited Bayesian analysis put the probability that he did not cheat at ~99.6%.
  [en.wikipedia.org/wiki/Cheating_in_online_chess](https://en.wikipedia.org/wiki/Cheating_in_online_chess)
- **Evasion techniques documented from cheater communities** (per a Chess.com community blog, not an
  official statement, flagged accordingly): deliberately varying move-time configuration between
  sessions to avoid inhuman timing consistency, capping rating-gain speed ("gaining too much elo in a
  short time" is treated by cheaters themselves as a tell to avoid), intentionally inserting weaker
  moves to mimic natural human error rate, and running engines locally (e.g. via WebAssembly) rather
  than over the network to avoid latency-based detection.
  [chess.com/blog/Jordi641/undetectable-by-design-the-code-behind-the-cheaters](https://www.chess.com/blog/Jordi641/undetectable-by-design-the-code-behind-the-cheaters)

## 2. Why it works

Combining "over 100" heterogeneous factors instead of one deliberately avoids the single-signal trap:
no individual factor is either necessary or sufficient, so a cheater optimizing against any one factor
(e.g. adding artificial move-time jitter) does not thereby clear the whole system. Publicly and
explicitly disclaiming "accuracy is not cheat detection" pre-empts the most common and most damaging
false-accusation pattern — a spectator or opponent citing a raw accuracy percentage as proof — and
removes the crudest justification a wrongful public accusation could lean on. Citing named, external
statistical reviewers (a Harvard statistician, US Chess) buys credibility without disclosing the
model itself, a middle path between full opacity and full transparency. Automating the ~85% of
clearly-confident cases while reserving the ambiguous tail for human judgment is a workable way to
operate at Chess.com's volume (well over a million closures a year) without an impossible human
review backlog.

## 3. What they do badly

- **No visible reasoning is ever returned to an individual appellant.** The published numbers are
  aggregate (appeal volume, grant rate); nothing in the public documentation describes what evidence,
  if any, is shown to the person appealing. This mirrors Lichess's opacity in effect, just wrapped in
  more polished public messaging.
- **Appeal-grant rate is not a false-positive rate, and the two get conflated.** A 0.2%–0.3%
  appeal-approval figure only measures how often a *contested* closure was reversed; it says nothing
  about closures nobody successfully appealed (through cost, fear, or simply not knowing how) that
  were nonetheless wrong. Publishing this number without also publishing an estimated false-positive
  rate from independent testing invites the reader to conflate the two.
- **The "100+ factors" system still produces enough internal noise to require heavy manual
  intervention for a single elite player** — ~2,000 reports generated on Nakamura's games alone before
  a manual conclusion was reached. That is evidence the system's confidence does not degrade
  gracefully at the tail of the skill distribution, exactly where the base-rate problem is worst (see
  `design.md` §2).
- **Prize forfeiture is threatened in the legal ToS with no public mapping from detection confidence
  to consequence.** The language is binary ("we can act"), not banded — there is no public
  description of what confidence level triggers forfeiture versus a lesser response.

## 4. What we should copy conceptually

- Combine many weak, heterogeneous signals rather than relying on one strong one — the same principle
  Lichess's two-model split expresses differently (`lichess.md` §4).
- State explicitly and publicly what a single strong-looking signal does **not** prove. Chess.com's
  "accuracy is not cheat detection" line is worth a direct equivalent in this product's own public
  copy.
- Split the operational load by confidence: automate the confident bulk, route the ambiguous tail to
  human judgment — but make the split criterion itself a disclosed, numeric confidence threshold
  rather than an undisclosed internal cutoff (`design.md` §1 does this explicitly with named bands).
- Publish aggregate transparency numbers (volume, grant rate) even where the underlying model stays
  undisclosed, if any part of the method is kept private at all.

## 5. What we can do better

- Publish an actual, independently checkable false-positive/false-negative estimate and its
  methodology, not only an appeal-grant percentage — this product's transparency promise (signed,
  independently recomputable results) is a stronger commitment than Chess.com ever made, so it should
  deliver a stronger number.
- Make the confidence level itself part of the signed, recomputable record — not "closed" vs "appeal
  granted" as the only two states a third party can observe, but a numeric or banded confidence any
  observer can re-derive from the same public feature values (`design.md` §1, §6).
- Hold the *specific disputed payout* rather than threatening whole-account prize forfeiture after the
  fact — avoids ever needing the enforcement mechanism the ToS gestures at, because the money never
  left escrow in the first place if the game is flagged before settlement (`design.md` §8).
- State in advance, publicly, how the product handles a Nakamura-style outlier run by a strong or
  rapidly improving player, rather than only demonstrating it can be handled well after the fact under
  public pressure.

## 6. What is technically required

- A large, maintained ensemble of behavioural and engine-agreement features — Chess.com's "100+"
  figure is a floor to think about, not a target to literally match, but it establishes that a serious
  detector is not two or three signals; `design.md` §1 lists the specific set worth building here.
- A statistically principled way to combine heterogeneous features into one calibrated confidence
  score, validated against a held-out set — Chess.com has years of confirmed closures to validate
  against; this product does not, and needs a substitute calibration source (`design.md` §6).
- An operational routing rule from confidence score to automated-vs-human-reviewed handling, with a
  bounded turnaround time for the human-reviewed tail so that, unlike an indefinite review, money does
  not sit in limbo.
- Whatever independent or third-party statistical review this product wants as its own credibility
  signal — realistically, publishing the method openly for public/academic scrutiny rather than paying
  a named consultant, which is consistent with the product's transparency stance and unlike anything
  Chess.com's proprietary model allows outsiders to do.

## 7. What could break

- **100+ factors is a large maintenance surface.** Chess.com runs a dedicated R&D team against it;
  this product will not have that scale of engineering at launch, and a smaller signal set that is
  well-validated is more defensible than a large one that silently drifts unmonitored.
- **The cost of a false positive is structurally worse here than for Chess.com.** A wrongful flag
  before a Chess.com closure costs a player their ladder account; a wrongful flag before this
  product's payout costs a player real money they were owed. The threshold and review design have to
  be more conservative than Chess.com's own tradeoff, not identical to it.
- **No public benchmark exists comparing any detector to Chess.com's**, so no claim that this
  product's detector is "as good as Chess.com's" can ever be asserted without an independent,
  documented benchmark — doing so without one would itself be exactly the kind of unverified claim
  this project's own standards forbid.
- **The slogan is easy to copy; the substance behind it is not.** Repeating "accuracy is not cheat
  detection" without actually building the multi-signal system and the calibration work behind it
  would be a worse outcome than saying nothing.

## 8. What we can uniquely do because of Nimiq

- **Escrow the specific disputed payout, not the whole account.** Chess.com's only lever is
  account-wide: closure, and prize forfeiture as a threatened remedy after money may already have
  moved. This product can hold just the one contested game's settlement while every other game the
  same player is involved in continues to settle normally.
- **Attach the confidence score to the actual payment transaction as a signed record**, so a third
  party — an arbiter, a future dispute-resolution mechanism, even an independent researcher — can
  verify the flag without having to trust an internal review team the way a Chess.com appellant must.
- **Nimiq's low transaction costs make a "hold small amounts pending review, auto-release after a
  bounded timeout if nobody escalates" pattern cheap to run even for very small prizes.** Chess.com
  has no equivalent low-value money rail and so never had to design for a $3 payout under dispute;
  this product's chit-sized amounts make that the common case, not the edge case.

## 9. Licence and reuse verdict

| Source | Status | What may be reused |
|---|---|---|
| `chess.com/legal/fair-play`, `chess.com/cheating` | Proprietary, © Chess.com; legal/marketing content, not source-licensed | Read, summarise, and cite with attribution; no verbatim reproduction at length; no algorithm or code is published to reuse |
| `chess.com/blog/Jordi641/*` | Community blog on Chess.com's platform, not an official statement of Chess.com policy | Treated here as a secondary, unofficial source; facts drawn from it are flagged as such above |
| `en.wikipedia.org/wiki/Cheating_in_online_chess` | CC BY-SA | Paraphrased into original prose with citation, not copied verbatim |

No Chess.com source code for cheat detection was found to exist publicly; **NOT VERIFIED** whether any
part of their pipeline is open-sourced anywhere. Nothing here is code to reuse — everything reusable
is a disclosed policy or a published statistical fact, both free to describe and build our own
implementation around.
