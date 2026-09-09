# ChessFraud — the closest thing to a labelled cheating corpus that exists

Sources read directly: [github.com/artem-lepin-ml/chess-fraud](https://github.com/artem-lepin-ml/chess-fraud)
(raw `README.md`, raw `LICENSE`, full repository tree via the GitHub API, both tutorial notebooks —
`experiments/analisys/tutorial_transfer_synth_to_tournament.ipynb` and
`experiments/move_level/tutorial_reproduce_move_level_experiments.ipynb` — downloaded and parsed cell
by cell for their actual committed output, not just descriptions of them), and
[huggingface.co/datasets/artemlepin/chess-fraud](https://huggingface.co/datasets/artemlepin/chess-fraud)
(raw dataset-card `README.md`, including its YAML licence frontmatter, fetched directly, not inferred
from the rendered page). The accompanying paper, *"ChessFraud: Exploring the Capabilities of
Human-Aligned Models for Cheating Detection in Online Chess,"* accepted to the KDD 2026 Datasets and
Benchmarks Track (DOI [10.1145/3770855.3817587](https://doi.org/10.1145/3770855.3817587)), was not
directly reachable — the ACM DOI page returned HTTP 403 on every fetch attempt — so its abstract is
read here as reproduced verbatim in the repository's own `README.md`, not from the ACM page itself;
flagged as such wherever quoted below.

Our own prior research (`design.md` §3, written before this file) already states plainly: "there is no
labelled dataset of confirmed cheaters on this product to calibrate against" and treats that as an
open gap for the whole field, not just for us. This file's job is to check whether that gap still
holds once ChessFraud is examined directly, not assumed absent.

## 1. What they do

ChessFraud is a **public research benchmark**, not a product and not a service — the README says this
about itself, verbatim: *"This repository provides research datasets and benchmark code. It is **not**
an anti-cheat product and is **not** intended to be used for enforcement decisions without substantial
additional validation."* It ships two datasets, benchmark code, and reproduction notebooks, backed by
a Hugging Face-hosted data release.

- **ChessFraud (the tournament set)** — the genuinely new thing here: **505 real tournament games**
  (represented as 1,010 player-side games, 49 unique players, 38,510 half-moves) played under **a
  controlled protocol in which engine use was explicitly logged**, i.e. real human players were told
  to use (or not use) a monitored assistance mechanism during real games, and that ground truth was
  recorded as it happened — not inferred after the fact by a moderator, and not synthesized. **407
  cheating player-games (40.3%)**, **9,405 cheating half-moves (24.4%)** — an artificially high,
  deliberately-constructed cheat prevalence, not a claim about any live platform's real base rate (see
  §3, §7).
  [github.com/artem-lepin-ml/chess-fraud#-datasets](https://github.com/artem-lepin-ml/chess-fraud)
- **ChessFraud-Synth** — 12,000 real Lichess blitz player-games (1,074,287 half-moves, 417,207 eligible
  focal-player decision points), synthetically perturbed: for each game prefix, the final observed move
  is paired with an alternative sampled from a classical engine (Stockfish, multiple depths) or a
  **human-aligned model** (Maia1, Maia2, LC0, Allie), producing balanced fair/cheating instance pairs
  that isolate the *move choice* from the *positional context* — a genuinely different experimental
  design from anything in `lichess.md` or `chess-com.md`.
- **Human-aligned models used**, per the repo's own pipeline stage names
  (`data_generation/synth/README.md`, stage `03_enrich_dataset`): Maia1, Maia2 (Lichess-trained,
  human-move-prediction nets), LC0 (Leela Chess Zero), and Allie — a newer human-aligned model whose
  frozen embeddings are the strongest single reported signal (§3). Classical Stockfish is run at
  multiple fixed depths (1, 9, 15 recorded in the schema) as the non-human-aligned baseline.
- **Detection experiments, exactly as committed in the repo** (not paraphrased from the paper — pulled
  directly from the notebooks' own output cells):
  - Four trivial/heuristic baselines — All-Cheat, Random, Engine top-1 match, Human accusation (i.e.
    the opponent's own in-game report) — reported at both move level and player-game level.
  - Three trained feed-forward detectors on frozen embeddings — FFN Allie, FFN (nine handcrafted)
    Features, and their concatenation — trained on ChessFraud-Synth and evaluated **both** on a
    synthetic held-out test split **and**, unchanged, transferred to the real tournament set.
- **Licence, read from the files themselves, not inferred**: the code is
  **GPL-3.0** (the raw `LICENSE` file's own header text: "GNU GENERAL PUBLIC LICENSE, Version 3, 29
  June 2007"). The **tournament dataset is CC-BY-4.0** and the **synthetic dataset is CC0**, per the
  Hugging Face dataset card's own YAML frontmatter (`license: cc-by-4.0`) and its prose ("the
  ChessFraud release is CC BY 4.0, ChessFraud-Synth derives from the public Lichess database under
  CC0"). **Model weights and engine binaries "remain under their original licenses"** (dataset card,
  verbatim) — not individually audited here; **NOT VERIFIED** per model.

## 2. Why it works

Three things make this a materially different, and materially better, source than anything our earlier
`lichess.md` and `chess-com.md` research found:

- **It has real, monitored ground truth, not inferred labels.** Lichess's Irwin/Kaladin and Chess.com's
  system both train against internal moderator decisions that are never independently auditable
  (`lichess.md` §3, `chess-com.md` §3). ChessFraud's 505-game tournament set is the first thing this
  research has found where cheating was **logged as it happened**, by design, in a controlled setting
  — categorically stronger evidence than a moderator's after-the-fact call.
- **The synthetic-pair design isolates the actual decision a detector has to make.** By holding the
  position fixed and only swapping the final move between "what the human actually played" and "what
  an engine/human-aligned model would have suggested," ChessFraud-Synth trains and tests exactly the
  move-level judgment our own design's signal 1–2 (`design.md` §1) require, rather than a vaguer
  whole-game statistical fingerprint.
- **It reports the honest transfer gap, not just the flattering number.** The tutorial notebooks
  compute the same models' performance on **both** the synthetic test split and the real tournament
  set, side by side, in the same table (§3) — the single most useful thing in the whole repository for
  a product that plans to lean on synthetic calibration data before real labelled cheaters accumulate
  (`design.md` §6).

## 3. What they do badly — and what the numbers actually say

This is where reading the notebooks directly instead of trusting the abstract matters. Numbers below
are pulled from the committed output cells of
[`experiments/analisys/tutorial_transfer_synth_to_tournament.ipynb`](https://github.com/artem-lepin-ml/chess-fraud/blob/main/experiments/analisys/tutorial_transfer_synth_to_tournament.ipynb)
and
[`experiments/move_level/tutorial_reproduce_move_level_experiments.ipynb`](https://github.com/artem-lepin-ml/chess-fraud/blob/main/experiments/move_level/tutorial_reproduce_move_level_experiments.ipynb),
downloaded and parsed directly — "specificity" is fair-class recall (equivalently, 1 minus the
false-positive rate on innocent play), "recall" is cheat-class recall, "macro-F1" the unweighted mean
of both class F1 scores.

**Move-level baselines (Table 4), real tournament set:**

| Baseline | Specificity | Recall | Macro-F1 |
|---|---:|---:|---:|
| All-Cheat | 0.000 | 1.000 | 0.223 |
| Random | 0.711 | 0.285 | 0.498 |
| Engine top-1 match | 0.579 | 0.629 | 0.570 |
| Human accusation (opponent's own report) | 0.667 | 0.594 | 0.610 |

**Trained detectors, transferred unchanged from synthetic training to the real tournament set** (the
same notebook reports both what the repo's own current code reproduces and what the paper claims,
side by side — both given here because they are not identical):

| Model | Reproduced specificity | Reproduced recall | Reproduced macro-F1 | Paper specificity | Paper recall | Paper macro-F1 |
|---|---:|---:|---:|---:|---:|---:|
| FFN Allie (embeddings only) | 0.572 | 0.543 | 0.534 | 0.59 | 0.52 | 0.53 |
| FFN Features (9 handcrafted) | 0.485 | 0.681 | 0.531 | 0.50 | 0.72 | 0.55 |
| FFN Allie + Features | **0.620** | **0.589** | **0.580** | **0.62** | **0.59** | **0.59** |

The honest reading of this table: **the best model the authors report, transferred to real ground
truth, correctly clears only ~62% of innocent moves (a ~38% false-positive rate on fair play) while
still missing ~41% of actual cheating moves** — and it beats the zero-ML "engine top-1 match" heuristic
(specificity 0.579, macro-F1 0.570 on the same real set) by only a few points of macro-F1. On the
*synthetic* test set the same best model reaches macro-F1 0.664 (reproduced) / 0.71 (paper) — a
12–13-point drop the moment it meets real tournament data instead of the synthetic pairs it was tuned
on. That gap, not the headline synthetic number, is the fact worth carrying forward.

Other honest weaknesses, all visible directly in the repo rather than asserted:

- **Small real-world N.** 505 games, 49 players, one time control (300+0 blitz) — any threshold or
  claim of statistical power derived from the real half of this benchmark is inherently limited by
  that size.
- **Handcrafted features alone are competitive with, and on synth slightly beat, the fancy embeddings
  alone** (FFN Features macro-F1 0.635 vs. FFN Allie 0.575 on synth) — the "human-aligned model
  embedding" story is real but not obviously dominant; only the concatenation of both clearly wins.
- **Artificial, very high base rate (40.3% of player-games cheating).** Any operating threshold
  calibrated against this benchmark and then applied naively to a population with a realistically low
  cheating prevalence would perform far worse in absolute false-positive terms than the specificity
  numbers above suggest — the exact base-rate mechanism `false-positives.md` §3 works through in full.
- **The tournament's actual assistance mechanism (the "cheating plugin") is deliberately not released**
  ("The tournament cheating plugin is not released" — README, Ethics section), so an outside reader
  cannot audit exactly how engine assistance was delivered or how faithfully it was logged; the ground
  truth has to be trusted at the level of the paper's own methodology, not independently re-derived.

## 4. What we should copy conceptually

- **Build a synthetic contrastive-pair calibration set before real labelled cheaters exist**, using our
  own historical games and either classical-engine or human-aligned-model suggestions as the "assisted"
  alternative — this is precisely the calibration substitute `design.md` §6 already proposed
  ("generate a large set of self-play and engine-assisted games at known assistance levels"), and
  ChessFraud is the concrete, citable precedent for exactly that construction, on real Lichess games.
- **Always report a distribution-shift number next to the same-distribution number**, and treat the
  shifted one as the number that counts. Any validation of our own detector must report both a
  held-out-synthetic score and, once any real disputed-and-resolved games exist, a real-transfer score
  — never publish only the flattering one.
- **Publish the trivial baselines alongside the sophisticated model** (All-Cheat, Random, Engine
  top-1 match) so a reader can see exactly how much lift the real system buys over doing nothing — the
  same instinct behind `design.md` §5's call for "a published false-positive/false-negative
  methodology... not an appeal-grant percentage presented as if it were the same statistic."
- **Keep the exploit mechanism unpublished while publishing everything else** — the tournament cheating
  plugin stays private even though data, code, schema, and reproduction notebooks are all public. This
  is the same "publish the architecture, not the exact exploitable operational detail" line
  `design.md` §7 already commits Scoresheet to.
- **Use human-aligned-model agreement (Maia/Allie-style), not just raw-engine agreement, as a first-class
  detection feature.** ChessFraud's own strongest single signal is Allie-embedding agreement, not raw
  Stockfish match rate — independent evidence for `design.md` signal 1's instinct to weight engine
  agreement by how "obvious" a move is, and it cross-validates the Turing-test literature's finding
  (`human-perception.md` §1) that human-aligned models are exactly the right proxy for "does this play
  look human."

## 5. What we can do better

- **We can generate real, monitored ground truth as a byproduct of running the product, not as a
  one-off research tournament.** ChessFraud's authors had to build a dedicated 505-game tournament with
  a custom logging plugin to get real labels. Every game we ever hold in escrow and actually resolve
  (design.md §1's Review/High-risk bands) becomes exactly that kind of labelled example for free, at
  the scale of our real user base rather than one recruited cohort.
- **Our labels can be signed and independently recomputable**, unlike ChessFraud's tournament ground
  truth, which an outside reader has to trust the authors logged correctly (§3). A future Scoresheet
  equivalent of this benchmark, built from our own resolved disputes, would let a third party verify
  the labels cryptographically instead of trusting our word for them — see §8.
- **We are not limited to a fixed 0.5 decision threshold and a binary label.** ChessFraud's own reported
  operating point is a single threshold on one model; our confidence-band design (`design.md` §1)
  carries a graded Normal/Review/High-risk state, which is strictly more informative than the binary
  cheat/fair label this benchmark evaluates against.
- **We could eventually contribute back.** Once enough real, resolved, disputed games accumulate, an
  anonymized/pseudonymous release in ChessFraud's own shape would directly close the "no labelled
  corpus exists for this specific product's population" gap this whole research task was framed around
  — turning the finding of this file from "here is someone else's corpus" into "here is ours too."

## 6. What is technically required

- To use ChessFraud or ChessFraud-Synth as a calibration source: the Hugging Face `datasets` Python
  library; no special hardware for the base tabular tables. The optional Allie-embedding bundle is
  ~9.56 GB and the notebook that reproduces it needs a CUDA GPU with ≥16 GB VRAM (the repo's own stated
  requirement) — not required if we only want the tabular labels and handcrafted-feature-equivalent
  signals.
- **Trained detector weights are not published** — only code, frozen embeddings, and reproduction
  notebooks. Using the FFN Allie/Features/Allie+Features architecture ourselves means retraining it, on
  either their released data or our own, not loading a checkpoint.
- **Any public citation of ChessFraud's own numbers should be reproduced first**, not taken from the
  paper's Table 4/5 on faith — the repo's own reproduced-vs-paper columns (§3) already show small real
  discrepancies (e.g. FFN Features on tournament: reproduced macro-F1 0.531 vs. paper 0.55), so
  "reproduced-by-us" and "paper-reported" are not interchangeable and should be labelled separately if
  we ever cite either externally.
- Stockfish, and optionally Maia1/Maia2/LC0/Allie, if we want to regenerate rather than reuse the
  dataset's precomputed engine/model outputs for our own synthetic pair construction.

## 7. What could break

- **GPL-3.0 on the code is the same copyleft blocker `lichess.md` §7 already names for Irwin/Kaladin.**
  Per this repo's own `LICENCES.md`, distributing (including serving over an API) a derivative of
  GPL-3.0 code obliges offering that derivative under GPL-3.0 too — incompatible with Scoresheet's MIT
  requirement. **No line of ChessFraud's code may be read-and-retyped into this project**, only
  read-and-redescribed, clean-room, per `REFERENCE_APPS_LIFT_PLAN.md` §0's protocol.
- **The data licence is genuinely different from the code licence, and permissive.** CC-BY-4.0
  (tournament set, attribution required) and CC0 (synthetic set, no restriction) are both free to use
  directly — including training our own, independently written detector on them — without triggering
  GPL's copyleft, because we would be consuming *data*, not distributing a derivative of their *code*.
  This is the one clean way to actually use ChessFraud today: take the datasets, write our own pipeline
  around them.
- **"Original licenses" on model weights/engines is a real, unresolved caveat.** Maia, Maia2, LC0,
  Allie, and Stockfish each carry their own separate terms, none individually checked here — **NOT
  VERIFIED**. Before using any of their *pretrained weights* (as opposed to the CC-licensed tabular
  outputs already computed from them), each one's own licence needs its own read, the same way
  `lichess.md` §9 and `chess-com.md` §9 already insist on source-by-source verification rather than
  inference.
- **505 real games / 49 players / one time control is a narrow cohort.** Any threshold derived from it
  risks overfitting to this specific population's behaviour and does not necessarily transfer to a
  different skill distribution, different time controls, or our own real money-stakes population.
- **The authors explicitly disclaim production readiness.** Citing ChessFraud as evidence that "cheat
  detection works" without doing the additional validation the README itself calls for
  ("not intended to be used for enforcement decisions without substantial additional validation") would
  misrepresent what the authors themselves say their own benchmark proves.

## 8. What we can uniquely do because of Nimiq

- **Our own signed, resolved disputes become exactly the controlled-ground-truth dataset ChessFraud had
  to build a dedicated tournament and a custom plugin to create** — every escrowed game that reaches a
  verdict (`design.md` §1, §8) is a labelled example generated as a byproduct of the product actually
  running, not a one-off research exercise.
- **Because every game and verdict is signed and independently recomputable** (`design.md` §8), a
  future Scoresheet-built equivalent of ChessFraud would be auditable in a way even ChessFraud's own
  monitored tournament is not: a third party checking ChessFraud has to trust the authors' logging was
  correct; a third party checking ours only has to trust the signatures.
- **We can eventually publish our own version of this exact kind of benchmark**, closing the very gap
  this research task set out to establish ("our own research previously concluded none existed") not
  just by finding someone else's corpus, but by producing one ourselves that a stranger can verify
  independently — the same "a stranger can recompute it from the signatures alone" property `SPEC.md`
  already commits this product to for game results generally.

## 9. Licence and reuse verdict

| Source | Licence (verified how) | What may be reused |
|---|---|---|
| `github.com/artem-lepin-ml/chess-fraud` — code (pipelines, notebooks, `detection.py`, etc.) | **GPL-3.0** — raw `LICENSE` file text read directly, 2026-09-08 | Architecture/method ideas only, clean-room redescribed per `LICENCES.md` §3 and `REFERENCE_APPS_LIFT_PLAN.md` §0. No code may be read-and-retyped into this MIT project. |
| ChessFraud (tournament) dataset, via Hugging Face | **CC-BY-4.0** — raw dataset-card YAML frontmatter (`license: cc-by-4.0`) read directly, 2026-09-08 | Free to use directly, including training our own independently-written detector on it, with attribution. |
| ChessFraud-Synth dataset, via Hugging Face | **CC0** — dataset-card prose, read directly ("ChessFraud-Synth derives from the public Lichess database under CC0") | Free to use with no restriction, including commercially, with no attribution requirement. |
| Model weights (Maia1, Maia2, LC0, Allie) and engine binaries (Stockfish) referenced by the dataset | **Each under its own original licence** — dataset card states this explicitly but does not enumerate each one here | **NOT VERIFIED** per model/engine. Must be checked individually before using any pretrained weight file directly, even though the CC-licensed tabular outputs computed from them are already free to use. |
| Paper abstract, as reproduced in the GitHub README | Not independently confirmed against the ACM page (403 on every fetch) | Read and cited as reproduced in the repository's own README; treated as the authors' own words, not paraphrased by a third party, but **NOT VERIFIED** against the canonical ACM version. |

**Bottom line on the "no labelled dataset exists" conclusion this project's earlier research reached:**
that conclusion needs updating, not discarding. A labelled dataset now exists — 505 real, monitored
tournament games with move-level and player-game-level ground truth, freely licensed (CC-BY-4.0), with
open reproduction code (GPL-3.0, ideas only) showing that even the best current detector transferred to
that real ground truth reaches only ~58–62% specificity at ~59% recall. What it lets us claim that we
could not before: a citable, independently-reproducible existence proof that (a) a real labelled corpus
for this exact problem exists and is usable as calibration data under a permissive data licence, and
(b) the best published detector on it is nowhere near reliable enough to gate real money on its output
alone — the single strongest piece of concrete evidence yet found for `design.md`'s core design
decision to hold only a specific disputed payout in a disclosed, bounded review band rather than acting
on any one signal as ground truth.
