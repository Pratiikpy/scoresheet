# Chessformer — the architecture paper (ICLR 2026)

Monroe, Eilender, Chalmers, Tang, Anderson — "Chessformer: A Unified Architecture for Chess
Modeling," arXiv:2605.19091, ICLR 2026 poster (https://iclr.cc/virtual/2026/poster/10011702).
Research date: 2026-09-08. Sources cited inline; unconfirmed claims marked **NOT VERIFIED**.

## 1. What they do

Chessformer is a single architecture aimed at three historically separate chess-modeling goals at
once: **playing strength** (as the value/policy net driving Leela Chess Zero's search),
**human move prediction** (powering the Maia-3 model family — see `maia.md`), and
**interpretability**. It is an **encoder-only transformer that tokenizes the 64 board squares**
(not moves, not a flattened bitboard vector), adds a novel dynamic positional-bias mechanism called
**Geometric Attention Bias (GAB)**, and reads moves out through an **attention-based
"source-destination" policy head** that scores every (from-square, to-square) pair via a 64×64
attention-logit matrix. Source: https://arxiv.org/html/2605.19091v1 (WebFetch, 2026-09-08).

## 2. Why it works

- **Square-tokens give every layer a natural per-square residual stream.** That's exactly what the
  source-destination policy head needs — it reads query vectors off "from" tokens and key vectors
  off "to" tokens and takes a dot product — and exactly what makes attention maps directly
  attributable to real board locations, which is the basis of the paper's interpretability claim.
- **GAB's job is to inject actual chess geometry into attention.** Per the fetched technical
  description: a compressed board-state representation is projected through a small
  linear→GELU→layernorm block, then projected again to `h·d₃` (h = number of attention heads) to
  generate a per-head **64×64 bias matrix added to attention logits before softmax**. This gives
  the model access to chess's non-Euclidean move geometry (a bishop's "neighbors" are diagonal, a
  rook's are a full rank/file away) that ordinary sinusoidal/learned positional encodings don't
  encode. The authors' own probe reports GAB is **highly consistent between positions (0.770
  correlation)** but **highly variable within a position (0.005 correlation)** — read as: GAB
  learns square-specific, largely position-*independent* geometric structure, while ordinary
  dot-product attention carries the position-*specific* semantic signal. The architecture cleanly
  splits "where pieces can go" from "what's happening here" into two separate computational paths.
  Source: WebFetch of arxiv.org/html/2605.19091v1, 2026-09-08 — extracted by an automated
  fetch-and-summarize step; treat the qualitative claim as reliable, the exact correlation numbers
  as reported-but-not-hand-checked against the primary PDF.
- **Results, as reported by the same fetch** (Table numbers as labeled in the extraction, not
  necessarily matching the paper's own table numbering — **moderate confidence, not hand-verified**):
  - *Move-matching accuracy*: Maia-3-79M 57.1% / Maia-3-23M 56.6% / Maia-3-5M 55.4%, vs.
    Allie-Adaptive-Search 55.9% (355M, uses search) and Allie-Policy 55.7% (355M, no search) — i.e.
    the 79M Chessformer-based model is reported to beat a 355M-parameter prior best.
  - *Playing strength*: Leela-CF-value reported at 2466±36 Elo / 97.2% puzzle accuracy / 152B FLOPs
    / 191M params, ahead of AC-270M (2299±36) and Leela-CNN-value (2168±36).
  - *Tournament integration*: substituting the Chessformer-based value net into full Leela Chess
    Zero search gave **+105 to +112 Elo** (depending on playout count) over the previous
    Leela-CNN-value network — framed by the authors against "Stockfish versions 16 and 17 showed
    ~46 Elo difference over 14 months development," i.e., more than double a full point-release gap
    in about a week of distillation training.
  - *Training*: human-imitation models trained on 884,049 Lichess blitz positions (2023–2025),
    1,000,000 steps, the 79M model on 8×A100 for ~1 week; the playing-strength model trained via
    supervised distillation from Leela Chess Zero April-2024 self-play games, 6,000,000 steps.

## 3. What they do badly

- The "fewer than a quarter of the parameters" efficiency claim is specifically about the
  **human-prediction** head; the **playing-strength** variant (Leela-CF-value, 191M params) is not
  smaller than its comparison points by nearly as dramatic a margin (AC-270M at 270M,
  Leela-CNN-value at 195M) — so the headline "unified, radically more efficient" claim bundles two
  differently-sized results under one framing.
- The authors state their own limitation plainly: GAB "is currently specialized to chess, and its
  benefits may depend on domains where geometric relations are central" — this is a chess-specific
  design choice with unverified transfer to other structured/spatial domains, not a general
  transformer improvement.
- The interpretability claims are self-described as **preliminary**: "deeper mechanistic analysis
  is needed to understand how the complementary roles of GAB and dot-product attention support
  planning, evaluation, and human-like play." Citing Chessformer as "an interpretable chess model"
  overstates what the paper itself claims.
- The authors' own uncertainty analysis attributes the weak-player accuracy ceiling to **aleatoric**
  (inherent randomness in how weak players decide) rather than **epistemic** (model-capacity)
  uncertainty — meaning a bigger Chessformer will **not** meaningfully close the gap at low rating
  bands specifically; the ceiling is a property of low-rated human play, not of the model.
- Reproducing the headline result requires real compute (8×A100 for ~1 week for the 79M
  human-imitation model, more for the 6M-step value-net distillation) that a small team without
  CSSLab's resources would need to budget for from scratch.

## 4. What we should copy conceptually

- **Separate "where can pieces plausibly go" from "what should happen in THIS position" as two
  distinct signals**, rather than asking one scoring mechanism to encode both at once — this is the
  generalizable idea behind GAB, independent of transformers entirely. Even a classical,
  hand-written evaluation function can adopt the same separation of concerns: score a candidate
  move's *geometric/tactical plausibility to a human* as a distinct term from *is this move
  objectively good*, rather than folding both into one number.
- **A move representation that matches the actual action space** (from-square × to-square, 64×64)
  rather than a flattened move-index vector — smaller output head, and directly legible for
  debugging, which matters for an app whose bot behavior needs to be explainable and testable, not
  a black box that merely "feels right."
- **A single, defended headline number** (57.1% move-matching accuracy) rather than a vague
  strength claim — the same discipline recommended in `maia.md` §4, reinforced by a second paper
  doing exactly this.

## 5. What we can do better

- Chessformer optimizes for *maximum* move-matching accuracy across the entire rating spectrum with
  one trained model; Scoresheet doesn't need a state-of-the-art general chess model — it needs four
  small, well-differentiated *personalities* that are provably distinct from each other and
  internally consistent. That is a narrower, statistically easier target, and doesn't require a
  transformer or A100-weeks of training to approach reasonably well (see `human-like-bots.md` §5
  for the concrete, cheap alternative).
- GAB is heavyweight machinery to earn a geometric prior a hand-written evaluation function already
  gets for free. Scoresheet's own engine (`packages/core/src/search.ts`) already encodes chess
  geometry directly in code — piece-square tables (from the published Simplified Evaluation
  Function), doubled/isolated pawn penalties, a bishop-pair bonus, and an open-file rook bonus,
  confirmed by reading the file directly — which is strictly cheaper for a browser bundle and more
  debuggable than learning the same prior from data, at the cost of never picking up genuinely
  human *idiosyncrasies* the way a data-driven model would.
- Where a learned signal could eventually beat Scoresheet's hand-tuned levers, the honest move is
  not "port Chessformer" but "borrow its evaluation discipline": measure move-match accuracy
  against a real reference population the same way the Chessformer/Maia papers do, rather than
  trusting hand-picked constants to *feel* right (see `human-like-bots.md` §5(c)).

## 6. What is technically required

- To reproduce or fine-tune the Chessformer/Maia-3 line at all: PyTorch, the `CSSLab/maia3`
  training repo, a Lichess blitz PGN dataset comparable in scale to the paper's 884,049-position
  corpus, and meaningful GPU time (8×A100 for ~1 week for the largest human-imitation model in the
  paper).
- To run only **inference** of an already-trained Chessformer-family checkpoint client-side: convert
  the released PyTorch checkpoint to ONNX and load via `onnxruntime-web`. The smallest published
  Maia-3 variant (5M params) is the most plausible browser candidate by parameter count, but **no
  ONNX export or file-size figure for it was found in this research — treat any browser-feasibility
  claim for the transformer-based Maia-3/Chessformer family as NOT VERIFIED**, unlike the older
  Leela-format Maia-1 CNNs, which do have a confirmed ~3.3 MB ONNX precedent (see `maia.md` §6).
- To take only the **idea** (GAB's geometry/semantics split, the source-destination move head): no
  ML framework is required — a hand-written evaluation function can encode an analogous
  "plausibility" term with zero neural-network dependency, as proposed in `human-like-bots.md` §5(b).

## 7. What could break

- Same **AGPL-3.0** licence wall as the rest of the Maia-3 family (see `maia.md` §7/§9) — the
  Chessformer training/inference code at `github.com/CSSLab/maia3` is AGPL-3.0 (GitHub API-confirmed,
  2026-09-08), so under `SPEC.md` Part L2 it sits in **Tier 4** (last resort, clean-room protocol
  only), even though the **paper describing the architecture is CC BY 4.0** and freely readable and
  reimplementable under Tier 2 (published technique).
- The paper's own stated limitation — weak-player accuracy capped by aleatoric noise — directly
  undercuts any plan to "train a bigger/better Chessformer" specifically to nail Scoresheet's
  low-rated bot (Pip): the ceiling is data-inherent, not something more parameters or more compute
  fixes.
- No confirmed ONNX export exists for this architecture family (see §6) — any claim that
  Chessformer/Maia-3 "can obviously run in a browser like the older Maia-1 CNNs" is currently
  unverified and would require real engineering (export, quantization, WASM/WebGPU testing on an
  actual mobile WebView) before it could be trusted or committed to.

## 8. What we can uniquely do because of Nimiq

- Chessformer's headline result depends on a large, curated human-move dataset (884k Lichess blitz
  positions) collected by an academic lab over years. Scoresheet, via Nimiq's Device Identifier API
  (per-device anonymous handle, no wallet required — source: `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`,
  this project) and its own signed scoresheets, can accumulate an analogous first-party,
  cryptographically-attested dataset of "what did a human at rating R actually play here" specific
  to its own audience — smaller, but self-owned, continuously refreshed, and provably real (signed,
  not scraped).
- If a genuinely learned evaluation term is ever worth building (a GAB-inspired geometric prior, or
  something simpler), it could be gated behind a Nimiq NIM micropayment "calibration match" — the
  same mechanism proposed in `human-like-bots.md` §8 — turning data collection into an actively
  funded, incentive-aligned loop the original academic pipeline never had.

## 9. Licence and reuse verdict

- **Paper (arxiv 2605.19091): CC BY 4.0**, stated on the arxiv listing (WebSearch, 2026-09-08) —
  free to read, cite, and reimplement the *described* architecture from, per `SPEC.md` Part L2
  Tier 2 (published technique).
- **Code (`github.com/CSSLab/maia3`): AGPL-3.0**, confirmed via the GitHub API license endpoint —
  do not read this repository in the same context that writes Scoresheet's engine code (`SPEC.md`
  Part L1's clean-room rule: "the person who reads the source must not be the person who writes
  ours"), and never embed any of its code or its released weights directly in the MIT bundle (the
  weight licence itself is internally inconsistent across the Maia3-5M/79M HuggingFace model cards
  — see `maia.md` §7/§9).
- **Verdict**: Chessformer is the strongest *conceptual* source found in this entire research task.
  Read the paper, take GAB's geometry/semantics separation and the source-destination move
  representation as design inspiration, and reimplement from the published description only — never
  by opening the AGPL reference implementation, per `SPEC.md`'s own clean-room protocol.
