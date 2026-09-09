# Maia — the whole line (Maia-1, Maia-2, Maia-3)

Research date: 2026-09-08. Sources are cited inline; anything not independently confirmed is marked
**NOT VERIFIED**.

## 1. What they do

- **Maia-1** (KDD 2020, "Aligning Superhuman AI with Human Behavior: Chess as a Model System") is a
  family of **9 separate neural networks**, one per Lichess rating bin (1100–1199 through
  1900–1999), each a customized AlphaZero-style residual CNN trained *supervised* on real human
  games to predict **the move a human at that rating actually played next**, not the objectively
  best move. Source: https://arxiv.org/abs/2006.01855 (WebFetch, 2026-09-08).
- **Maia-2** (NeurIPS 2024, "A Unified Model for Human-AI Alignment in Chess") replaces the
  nine-separate-models design with **one model** that takes rating as a continuous input via a
  "skill-aware attention mechanism," so a single network interpolates across the whole skill range
  instead of switching between nine checkpoints; it can also estimate a player's rating from their
  moves. Source: https://arxiv.org/abs/2409.20553 (WebFetch, 2026-09-08).
- **Maia-3** (2026) is a family of transformer models (**5M, 23M, 79M** parameters, plus a 3M
  ablation) built on the **Chessformer** architecture (see `chessformer.md`). It predicts human
  moves, outputs WDL (win/draw/loss) values, and a derived centipawn "compatibility score" for GUI
  display; it is distributed as a UCI-compatible engine with temperature, nucleus (top-p) sampling,
  MultiPV, and an Elo-selection option. Sources: https://github.com/CSSLab/maia3 (WebFetch,
  2026-09-08), https://arxiv.org/abs/2605.19091, https://huggingface.co/UofTCSSLab/Maia3-79M.
- Common thread across all three: the target label is always **"what did a real human at rating R
  play in this exact position," learned from millions of logged games** — never self-play, never
  engine analysis, never a synthetic weakening of a strong engine.

## 2. Why it works

- Feeding *existing* chess engines the task of predicting human moves fails badly — the Maia-1
  paper states directly: "Applying existing chess engines to this data, including an open-source
  implementation of AlphaZero, we find that they do not predict human moves well" (arxiv 2006.01855
  abstract, WebFetch 2026-09-08). Optimizing for objectively-best play and optimizing for
  human-move-prediction are different objectives, and only the latter produces a humanlike model.
- Rating-conditioning is the actual mechanism, expressed two different ways: Maia-1 hard-codes it
  as nine independently trained networks; Maia-2 soft-codes it as a continuous input. Both produce
  an accuracy curve reported to **peak near each model's own training rating band and fall off in
  both directions** — described in the fetched summary as "unimodal" — unlike Stockfish (accuracy
  rises monotonically with the target's own strength, no band-targeting) or Leela (roughly flat
  across bands). Source: WebFetch summary of arxiv 2006.01855, 2026-09-08 — the summarizer did not
  reproduce the paper's exact numeric table, so treat the *shape* of this claim (unimodal vs.
  monotonic vs. flat) as reliable but individual percentage figures below as indicative, not
  hand-checked against the primary PDF.
  - Reported figures from that fetch: Maia-1100 ranges roughly 46.0–50.8% depending on target
    rating (peaking against 1100-rated players); Maia-1900 peaks around 52.9% against 1900-rated
    players; Stockfish depth-15 ranges roughly 33–41%; Leela variants range roughly 40–46%.
    **Confidence: moderate — extracted by an automated fetch, not independently re-derived from the
    paper's tables.**
- Maia-3 improves the *architecture*, not the imitation-learning objective itself (see
  `chessformer.md`), and reaches **57.1% move-matching accuracy at 79M parameters**, described as
  beating the prior best (Allie-Policy, 355M params, 55.7%) "with fewer than a quarter of the
  parameters." Source: https://arxiv.org/html/2605.19091v1 (WebFetch, 2026-09-08).

## 3. What they do badly

- **The accuracy ceiling is low, and it's not a bug.** Even the best published number (Maia-3-79M)
  is 57.1% — meaning on held-out human games these models still fail to predict the actual human
  move more often than not. The Chessformer authors themselves attribute weak-player prediction
  limits to *aleatoric* uncertainty — genuine randomness in how a weak player decides between
  plausible options — not model capacity, meaning bigger models won't close this gap much further.
  Source: arxiv 2605.19091 (WebFetch, 2026-09-08).
- **Rating band ≠ playing strength.** Maia bots actually deployed on Lichess (`maia1`, `maia5`,
  `maia9`, matching the 1100/1500/1900 nets) play at meaningfully *higher* real Lichess Elo than
  their training band — public discussion cites `maia1`'s Classical rating around 1708 and Rapid
  ratings for maia1/maia5/maia9 around 1564/1679/1855, against training targets of 1100/1500/1900.
  The likely mechanism: the model plays the *average* move for its band while never making the ~20%
  of moves that are outright blunders for a real player at that rating. Sources:
  https://lichess.org/@/maia1, https://lichess.org/forum/general-chess-discussion/maia-bot-rating
  (WebSearch, 2026-09-08 — **not independently fetched; treat exact numbers as indicative, not
  exact**).
- **No explicit time-pressure or personality axis.** Maia-1/2/3's core objective is move prediction
  from a static position; none of them condition on clock state, opponent identity, or a controllable
  "style" parameter. Any apparent aggression/patience in their play is incidental to the training
  distribution, not a designed, adjustable axis. The related project Allie explicitly *adds*
  pondering-time and resignation modeling that plain Maia lacks — arxiv 2410.03893 (WebFetch,
  2026-09-08), which is itself evidence Maia doesn't have this.
- **Search-free = no lookahead.** These are pure policy models; they can walk into one-move tactics
  a real human of that rating would spot "by just looking," and conversely miss a good move a human
  might stumble onto outside the training distribution.
- **Heavy, PyTorch-native distribution for Maia-3.** The only documented ways to run it are the
  CSSLab/maia3 conda/PyTorch pipeline or a UCI engine wrapper; nothing in the primary repo or the
  HuggingFace model cards describes an ONNX export or browser deployment for the *transformer*
  Maia-3 family specifically (the browser precedent that exists, covered in `human-like-bots.md`
  §5(a)/§6, is for the older Leela-format Maia-1 CNNs, not Maia-3).

## 4. What we should copy conceptually

- **Optimize against a measured move-matching statistic, not "beat weaker opponents by feel."**
  The whole line's contribution is treating P(model's move = real human's move | position, rating)
  as the metric to report and defend. Scoresheet's current bot levers (`blunderRate`,
  `blunderDepth` in `packages/core/src/engine.ts`) are currently tuned by feel; nothing in the repo
  currently asks "does this level's move distribution resemble a real human at that band's, over a
  held-out sample?"
- **Unimodal, not monotonic, personality curves.** A bot level should be *most* humanlike at its own
  target band and demonstrably *worse* outside it — a testable, falsifiable design goal, not a vibe.
- **Predict blunder-proneness from the position, not from a flat coin flip.** Maia-1's paper trains
  a *separate* classifier for "will >10% of the population blunder here," reaching 76.9% accuracy —
  i.e., blunder likelihood is itself learnable from the position, distinct from move selection
  overall. This maps directly onto Scoresheet's `blunderRate`/`blunderDepth`: a position-aware
  blunder probability is a strictly better model of human error than one flat rate applied to every
  move.
- **Publish the number, don't just name the personality.** Maia's credibility rests on a reported,
  held-out accuracy percentage per band; "Pip blunders 35% of the time" is a design parameter, not
  evidence Pip *feels* like a beginner.

## 5. What we can do better

- Scoresheet can close a loop Maia's own papers never had: every game is a **signed scoresheet**
  (Ed25519, per `SPEC.md` Part F), so this app can accumulate a live, first-party, labeled dataset
  of "what did a human at rating R actually play here" specific to its own users — smaller than
  Maia's static 2019–2025 Lichess snapshots, but self-owned and continuously refreshed rather than
  frozen at a training cutoff.
- Maia doesn't personalize per-opponent; a Scoresheet bot could in principle drift its behavior
  toward the specific patterns of the human it keeps facing, using the same win/loss signal a
  rematch already produces (see `human-like-bots.md` §8 for how Nimiq micropayments make this a
  fundable, ongoing loop rather than a one-off research script).
- **Ship the honesty the Maia-line's own Lichess deployment demonstrates is easy to get wrong**:
  don't claim "Oskar is 1800" the way Maia's own bots quietly drift 200–400+ points above their
  *stated* band — publish a measured number instead. `SPEC.md` already commits to exactly this
  discipline: bots are "shown without a rating number... a fake rating on a weak bot is a lie the
  engine will later expose" (`SPEC.md` line 1580).

## 6. What is technically required

- To use **Maia-2** as a reference/behavioral target: `pip install maia2`, PyTorch,
  `model.from_pretrained(type="rapid"|"blitz")` — fine as an offline research tool (e.g., "does our
  bot's move distribution resemble Maia-2's at the same rating"), not itself a browser artifact.
  Source: WebFetch of github.com/CSSLab/maia2, 2026-09-08.
- To *run* a Maia-class net client-side: convert weights to ONNX and load via `onnxruntime-web`
  (`wasm` backend for universal CPU support, `webgpu` as an optional accelerated path). This is a
  **confirmed, working precedent for the older Leela-format Maia-1 nets**: CSSLab's own
  `maia-platform-frontend` does exactly this, and the independent `hunterchen7/play-lc0` project
  ships ONNX versions of the Maia series at **~3.3 MB per model**, running fully client-side.
  Sources: WebFetch of https://github.com/CSSLab/maia-platform-frontend and
  https://github.com/hunterchen7/play-lc0, both 2026-09-08.
- **No such precedent was found for Maia-3.** It ships only as PyTorch checkpoints on HuggingFace,
  and its own model card states "This model isn't deployed by any Inference Provider" (HF card for
  UofTCSSLab/Maia3-5M, WebFetch 2026-09-08). Porting it to ONNX/WASM would be new engineering with
  no reference implementation to lean on.
- Full feasibility discussion (bundle-size cost, WASM vs. WebGPU, mobile WebView risk) is in
  `human-like-bots.md` §5(a) and §6.

## 7. What could break

- **License collision with the MIT bundle.** `maia3` (the strongest, newest family) is **AGPL-3.0**
  for the code; `maia-chess` and `maia-platform-frontend` are **GPL-3.0**. `SPEC.md`/the codebase
  itself is explicit and unambiguous: shipping GPL/AGPL code in the bundle "would make the bundle
  GPL, which disqualifies an MIT submission" (`apps/web/src/bot-identity.ts` header comment,
  echoing `SPEC.md` Part L). Any literal reuse of Maia-3/maia-chess/maia-platform-frontend **code**
  is a hard blocker.
- **Maia-3 weight licensing is internally inconsistent across model cards.** The HuggingFace card
  for `UofTCSSLab/Maia3-79M` states "License: AGPLv3"; the card for `UofTCSSLab/Maia3-5M` states
  "CC BY 4.0 (paper); see repo for code/weights license." These disagree in the exact wording
  captured by this research. **NOT VERIFIED**: whether the weights themselves are usable under
  CC BY 4.0 independent of the AGPL training/inference code, or whether AGPL's conveying
  obligations reach a compiled/ported ONNX artifact. Read the actual `github.com/CSSLab/maia3`
  `LICENSE` file directly and get a legal read before embedding any Maia-3 weight in an MIT product.
- **Maia-2 is the one clean exception.** `github.com/CSSLab/maia2` — both the training/inference
  code and the pip-distributed pretrained weights — are stated as **MIT** (confirmed via the
  GitHub API license endpoint, 2026-09-08; README states "Maia-2 is released under the MIT License,"
  WebFetch 2026-09-08). It is the one Maia-line asset that could, in principle, be used with
  attribution and no copyleft entanglement — but it is behind Maia-3 on accuracy, and it still
  needs a from-scratch PyTorch→ONNX conversion to run in a browser.
- **File-size/cold-start risk.** Even the confirmed ~3.3 MB-per-model Leela-format ONNX precedent,
  multiplied across however many rating levels are wanted, adds real weight to a Mini App loading
  inside a mobile in-app WebView on a possibly slow connection — a product-fit question, not just a
  technical one, to weigh against Scoresheet's existing sub-millisecond hand-written engine.

## 8. What we can uniquely do because of Nimiq

- Nimiq's **Device Identifier API** gives an anonymous, walletless per-device handle (source:
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`, this project) — Scoresheet could use it to build the kind of
  large-scale behavioral dataset Maia's authors had to scrape from Lichess, sourced instead from its
  own bot opponents, without requiring login or a wallet just to contribute training signal.
- Nimiq's feeless, instant NIM rail (source: `PLATFORM_SPEC.md` / this project's `CLAUDE.md`) makes
  a "play a short calibration match" loop economically viable at a scale Maia's academic pipeline
  never had to consider — they used a static dataset dump, not a live, incentivized data-collection
  loop.
- A signed scoresheet (Ed25519, `SPEC.md` Part F) is itself a tamper-evident training/eval record —
  every game used to calibrate or retrain a Scoresheet bot carries a cryptographic signature proving
  it was actually played, a stronger provenance guarantee than a scraped PGN dump has.

## 9. Licence and reuse verdict

| Asset | Code licence | Weights | Verdict for this MIT/TypeScript, browser-only app |
|---|---|---|---|
| Maia-1 (`CSSLab/maia-chess`) | **GPL-3.0** (GitHub API-confirmed, 2026-09-08) | Distributed alongside the GPL-3.0 code, no separate statement found | Read the *paper* freely (Tier 2, published technique, `SPEC.md` Part L2); never embed the code or `.pb.gz` weights — GPL-3.0 disqualifies an MIT bundle |
| Maia-2 (`CSSLab/maia2`) | **MIT** (GitHub API-confirmed, 2026-09-08) | Stated MIT; no separate weight licence found | The one licence-clean asset in the line; usable with attribution, but needs a from-scratch PyTorch→ONNX conversion |
| Maia-3 (`CSSLab/maia3`) | **AGPL-3.0** (GitHub API-confirmed, 2026-09-08) | Ambiguous — model cards disagree; **NOT VERIFIED** — read the repo `LICENSE` directly before relying on any weight | Strongest results, but AGPL-3.0 code is disqualifying. Read the *paper* (CC BY 4.0, arxiv 2605.19091) freely for ideas — see `chessformer.md` |
| `maia-platform-frontend` | **GPL-3.0** (GitHub API-confirmed, 2026-09-08) | n/a (consumes `.pb.gz` nets) | Observe the running product only (Tier 3, `SPEC.md` Part L2); do not read/port its ONNX-conversion code without a clean room |
| Chessformer paper (arxiv 2605.19091) | **CC BY 4.0** (arxiv listing, WebSearch 2026-09-08) | n/a | Freely readable/citable; architecture *ideas* are not copyrightable expression — reimplement from the published description (Tier 2), never by porting the AGPL reference implementation |

**Overall: the only literally reusable Maia-line artifact is Maia-2's code and weights (MIT).**
Everything stronger — Maia-1, Maia-3, and the existing browser-conversion precedent — is GPL/AGPL
and must be treated as Tier 2/3 under `SPEC.md` Part L: read the papers, never the repos in the
same context that writes Scoresheet's engine, and never embed a weight file whose licence chain
hasn't been independently confirmed straight from its own `LICENSE` file.
