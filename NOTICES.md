# Notices

Every third-party thing this project uses, with the licence read from its own metadata rather than
from a badge or from memory. Checked on the date shown; re-check before adding anything.

`nimiq-css` published **no licence at all** and reached a sibling project's production bundle before
anyone looked, which is why this file exists and why nothing is installed without a line here first.

## Dependencies in the bundle

| Package | Version | Licence | Verified | What we use it for |
|---|---|---|---|---|
| `chess.js` | 1.4.0 | **BSD-2-Clause** | 2026-09-06, `npm view chess.js license` | Move generation and legality. It is correct about castling through check, the pinned-pawn en passant and promotion, and we lean on it entirely |
| `@noble/hashes` | 1.8.0 | **MIT** | 2026-09-06, package metadata | SHA-256 for the scoresheet's move hash |

## Data

| Source | Licence | Verified | What we use it for |
|---|---|---|---|
| [Lichess puzzle database](https://database.lichess.org/#puzzles) | **CC0-1.0** | 2026-09-06, from the page's own licence link | Puzzles, with their `Rating`, `Themes` and `OpeningTags` columns. Public domain, so no attribution is required — we credit Lichess anyway, prominently |
| [`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings) | **CC0-1.0** | 2026-09-06, GitHub API `spdx_id` | ECO opening names, shown live during a game, and the bot's opening book |
| [`tablebase.lichess.ovh`](https://tablebase.lichess.ovh) | Public API, no authentication | 2026-09-06, live request | Perfect endgame judgement. Called at runtime; their rate limits are respected and they are credited on the screen that uses it |

## Studied, and deliberately not used

| Source | Licence | Why not |
|---|---|---|
| `lichess-org/scalachess` | MIT | **Read and used as a correctness reference**, which its licence permits with no ceremony. `packages/core/src/rules.ts` implements two rules from it — flag adjudication and fivefold repetition — and its header records the case-by-case comparison that proved a third was unnecessary |
| `lichess-org/lila` | AGPL-3.0 | Serving modified AGPL code obliges us to publish it under AGPL. Not read |
| `lichess-org/chessground` | GPL-3.0 | Shipping it to a browser is distribution, which would make the bundle GPL. The board here is ours; its *behaviour* was studied by playing lichess.org, which needs no licence |
| `lichess-org/lila-gif` | AGPL-3.0 | The game-as-a-picture idea is not copyrightable; their implementation is not ours to take |
| `lichess-org/lila-openingexplorer` | AGPL-3.0 | And the dataset is the product |
| `official-stockfish/Stockfish`, `nmrugg/stockfish.js` | GPL-3.0 | No linking exception. The engine here is ours, written from the Chess Programming Wiki and the published literature — deliberately, because reading Stockfish would give the same algorithms plus documented access to GPL expression |
| `code100x/chess` | **none at all** | No licence means all rights reserved. Not read |

## Technique implemented from published sources

Not licensable, but worth crediting.

- **Piece-square tables and the endgame test** — Tomasz Michniewski's *Simplified Evaluation
  Function*, the standard published starting point. `packages/core/src/engine.ts`.
- **Alpha-beta, iterative deepening, quiescence search, transposition tables, MVV-LVA ordering** —
  the Chess Programming Wiki and the standard literature.
- **Elo** — Arpad Elo's rating system, unmodified. `packages/core/src/elo.ts` names every constant so
  the arithmetic can be reproduced from the spec alone.
