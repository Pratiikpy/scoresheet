# Notices

Every third-party thing this project uses, with the licence read from its own metadata rather than
from a badge or from memory. Checked on the date shown; re-check before adding anything.

`nimiq-css` published **no licence at all** and reached a sibling project's production bundle before
anyone looked, which is why this file exists and why nothing is installed without a line here first.

## Dependencies in the bundle

| Package | Version | Licence | Verified | What we use it for |
|---|---|---|---|---|
| `chess.js` | 1.4.0 | **BSD-2-Clause** | 2026-09-07, package metadata | Move generation and legality. It is correct about castling through check, the pinned-pawn en passant and promotion, and we lean on it entirely |
| `@noble/hashes` | 1.8.0 | **MIT** | 2026-09-07, package metadata | SHA-256 for the signed-message digest and the scoresheet's move hash; Blake2b for deriving a Nimiq address from a public key |
| `@noble/ed25519` | 2.3.0 | **MIT** | 2026-09-07, package metadata | Verifying signatures **in the reader's own browser**. It is what makes the Recompute button possible without a 50 MB WASM download, which is the difference between "you can check this" and "you could check this if you were willing to wait" |

## Dependencies on the server only

Kept out of the browser bundle deliberately — the server package reaches for `node:http`,
`node:crypto` and `node:fs`, and importing its types from the app would put Node built-ins in front
of the bundler.

| Package | Version | Licence | Verified | What we use it for |
|---|---|---|---|---|
| `@nimiq/core` | 2.21.0 | **Apache-2.0** | 2026-09-07, package metadata | Building and signing the puzzle pool's payouts and its staking transactions, offline. The private key never leaves the process; only finished bytes go to a node. Also used in tests to check our own address derivation against Nimiq's, over a hundred random keys |
| `@nimiq/identicons` | 1.6.2 | **ISC** | 2026-09-07, package metadata | Nimiq's own generated faces, beside every address the app shows — the record, the opponent in a live game, and each bot. **We import `dist/identicons.bundle.min.js` by its exact path on purpose:** the package's `browser` entry resolves to a 5 KB build that fetches its 88 KB sprite over the network, which would break offline; the bundle inlines it. Loaded on first use, so the cold open carries none of it |

## Assets

| Source | Licence | Verified | What we use, and what changed |
|---|---|---|---|
| **chessnut** pieces, by **Alexis Luengas** ([`LexLuengas/chessnut-pieces`](https://github.com/LexLuengas/chessnut-pieces)) | **Apache-2.0** | 2026-09-06, the repository's own metadata, cross-checked against Lichess's attribution table in `lichess-org/lila`'s `COPYING.md` | The twelve piece shapes, in `apps/web/src/pieces.ts` and on the certificate. **Changed:** every colour is stripped, so the shapes inherit `fill` and `stroke` from their container — which is what lets both piece colours be measured for contrast against every board colour instead of hoped about. Vendored reproducibly by `scripts/vendor-pieces.mjs` |

Apache-2.0 asks that attribution notices be retained, so: *chessnut pieces © Alexis Luengas,
licensed under the Apache License, Version 2.0.* A copy of that licence is at
<https://www.apache.org/licenses/LICENSE-2.0>.

**cburnett — the set everybody reaches for — is GPLv2+ and cannot be here**, because shipping it to
a browser is distribution and would make this bundle GPL. Most of Lichess's other sets are
CC BY-NC-SA, which is non-commercial and also out. Of the whole roster only chessnut (Apache-2.0),
Maurizio Monge's three (MIT) and rhosgfx (CC0) were usable at all.

## Code lifted from our own other project

| From | Licence | What, and why it was not rewritten |
|---|---|---|
| `chit`, `packages/core/src/signature.ts` and `base64.ts` | **MIT**, same author | Normalising what `nimiq.sign()` returns. It encodes two facts about the platform that were expensive to establish — that the return *shape* varies by host, and that the result is a resolved union rather than only a rejection — and a fresh implementation would have been a worse one. See the file header |

## Data

| Source | Licence | Verified | What we use it for |
|---|---|---|---|
| [Lichess puzzle database](https://database.lichess.org/#puzzles) | **CC0-1.0** | 2026-09-06, from the page's own licence link | Puzzles, with their `Rating`, `Themes` and `OpeningTags` columns. Public domain, so no attribution is required — we credit Lichess anyway, prominently |
| [`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings) | **CC0-1.0** | 2026-09-06, GitHub API `spdx_id` | ECO opening names, shown live during a game, and the bot's opening book |
| [`jw1912/akimbo`](https://github.com/jw1912/akimbo) at tag **`v1.0.0`**, `resources/net.bin` | **MIT** | 2026-09-07, the repository's `LICENSE` read in full and the tag's own README | The inference in `packages/core/src/nnue.ts`, an exact port of `src/network.rs` and `src/position.rs` at that tag. **The network does not ship and Game Review does not use it** — it was measured and it made the review worse; the reasoning is in `apps/web/src/analysis-worker.ts` and the numbers are in `README.md`. `scripts/vendor-nnue.mjs` fetches it hash-pinned, on demand, for the ten tests that check the port; nothing in `npm run build` calls it |

**Why the `v1.0.0` tag and not `main`.** akimbo's README on `main` says its networks are now trained
on data produced by Leela Chess Zero and that "no official release will be made with this". The
README *at v1.0.0* says instead that "all data used is self-generated", and the version table calls
it the "Final Original Data Release". So v1.0.0's net is the one whose provenance is akimbo's own,
and it is the one we ship. The repository licence is MIT and repository-wide; the network file
carries no separate licence, so it is covered by it. Updating this is a licence decision, not a
version bump.

*akimbo © Jamie Whiting, MIT.*

## Studied, and deliberately not used

| Source | Licence | Why not |
|---|---|---|
| `lichess-org/scalachess` | MIT | **Read and used as a correctness reference**, which its licence permits with no ceremony. `packages/core/src/rules.ts` implements two rules from it — flag adjudication and fivefold repetition — and its header records the case-by-case comparison that proved a third was unnecessary |
| `lichess-org/lila` | AGPL-3.0 | Serving modified AGPL code obliges us to publish it under AGPL. Not read |
| `lichess-org/chessground` | GPL-3.0 | Shipping it to a browser is distribution, which would make the bundle GPL. The board here is ours; its *behaviour* was studied by playing lichess.org, which needs no licence |
| `lichess-org/lila-gif` | AGPL-3.0 | The game-as-a-picture idea is not copyrightable; their implementation is not ours to take |
| `lichess-org/lila-openingexplorer` | AGPL-3.0 | And the dataset is the product |
| `official-stockfish/Stockfish`, `nmrugg/stockfish.js` | GPL-3.0 | No linking exception. The engine here is ours, written from the Chess Programming Wiki and the published literature — deliberately, because reading Stockfish would give the same algorithms plus documented access to GPL expression. **This is also why the evaluation network is akimbo's**: a Stockfish net in an MIT bundle is a licence conflict, not a difficulty |
| `Witek902/caissa`, `jdart1/arasan-chess` | MIT — **usable, and not used** | Both are genuinely permissive and both were checked before akimbo was chosen. Ruled out on size rather than licence: Caissa's network is around 50 MB and Arasan's is 25 MB, against akimbo's 6.3 MB. A Mini App cannot ask a phone for 25 MB to grade a game |
| `code100x/chess` | **none at all** | No licence means all rights reserved. Not read |

## Technique implemented from published sources

Not licensable, but worth crediting.

- **Piece-square tables and the endgame test** — Tomasz Michniewski's *Simplified Evaluation
  Function*, the standard published starting point. `packages/core/src/engine.ts`.
- **Alpha-beta, iterative deepening, quiescence search, transposition tables, MVV-LVA ordering** —
  the Chess Programming Wiki and the standard literature.
- **Elo** — Arpad Elo's rating system, unmodified. `packages/core/src/elo.ts` names every constant so
  the arithmetic can be reproduced from the spec alone.
