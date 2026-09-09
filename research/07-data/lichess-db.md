# Lichess open database (database.lichess.org)

Live-verified 2026-09-08 by fetching https://database.lichess.org/ directly (curl, raw HTML — the
page is a static server-rendered table, not a SPA) and by issuing `HEAD` requests against the two
largest single-file downloads to read their real `Content-Length`.

## 1. What they do

Lichess publishes the entire operational output of lichess.org as flat-file exports at
https://database.lichess.org/, one section per dataset, all switchable via in-page anchors
(`#standard_games`, `#variant_games`, `#broadcasts`, `#puzzles`, `#evals`, `#openings`).

Site-wide licence banner, quoted verbatim:
> "Database exports are released under the Creative Commons CC0 license. Use them for research,
> commercial purpose, publication, anything you like. You can download, modify and redistribute
> them, without asking for permission."
Source: https://database.lichess.org/ (page header), linked to
https://tldrlegal.com/license/creative-commons-cc0-1.0-universal — verified 2026-09-08.

Datasets, with numbers read directly off the live page (2026-09-08) plus `HEAD`-verified byte
counts for the two monolithic files:

| Dataset | Content | Format | Size | Files | Update | Licence |
|---|---|---|---|---|---|---|
| Standard games | 8,038,784,095 rated games | `.pgn.zst`, monthly, non-cumulative | 2.54 TB total | 163 | monthly | CC0 |
| Antichess | 37,027,397 rated games | `.pgn.zst` | 7.59 GB | 140 | monthly | CC0 |
| Atomic | 28,859,338 rated games | `.pgn.zst` | 3.69 GB | 139 | monthly | CC0 |
| Chess960 | 29,128,874 rated games | `.pgn.zst` | 9.54 GB | 156 | monthly | CC0 |
| Crazyhouse | 30,102,397 rated games | `.pgn.zst` | 7.34 GB | 127 | monthly | CC0 |
| Horde | 7,292,365 rated games | `.pgn.zst` | 2.78 GB | 136 | monthly | CC0 |
| King of the Hill | 8,439,263 rated games | `.pgn.zst` | 1.73 GB | 145 | monthly | CC0 |
| Racing Kings | 6,483,572 rated games | `.pgn.zst` | 807 MB | 127 | monthly | CC0 |
| Three-check | 10,711,597 rated games | `.pgn.zst` | 1.57 GB | 145 | monthly | CC0 |
| Broadcasts | 1,186,335 games, official Lichess broadcasts | `.pgn.zst` | 695 MB | 79 | monthly | **CC BY-SA 4.0**, not CC0 |
| Puzzles | 6,057,356 rated, tagged puzzles | single `.csv.zst` | 304,384,407 B = **304.4 MB** (live `HEAD`, `lichess_db_puzzle.csv.zst`) | 1 | last updated 2026-08-02 | CC0 |
| Evaluations (cloud evals) | 394,669,566 Stockfish-evaluated positions | single `.jsonl.zst` | 21,681,515,630 B = **21.68 GB** (live `HEAD`, `lichess_db_eval.jsonl.zst`) | 1 | last updated 2026-08-02 | CC0 |
| Openings | crowdsourced ECO name/PGN/UCI/EPD table | links out to a separate GitHub repo, no bulk file here | — | — | no fixed schedule | CC0 (see `openings-names.md`) |

Source for every row: https://database.lichess.org/ live HTML, saved and grepped 2026-09-08; the two
`HEAD` checks were run directly against
`https://database.lichess.org/lichess_db_puzzle.csv.zst` and
`https://database.lichess.org/lichess_db_eval.jsonl.zst`.

Note the one licence exception on the page: broadcast games (official tournament coverage relayed
by Lichess) are **CC BY-SA 4.0**, not CC0 — attribution and share-alike apply, and this is the only
dataset on the page carrying that restriction. Confirmed by fetching the raw HTML section
(`<div id="broadcasts">`) directly.

**There is no bulk "masters" PGN download on this page.** Grepping the full page source for
"master" turns up nothing but puzzle theme tags and GitHub `/master` branch URLs — no dataset
section, no download link. Master games are served exclusively through the separate Opening
Explorer API (`lila-openingexplorer`), not as a flat file. See §9 for what that means for licensing
and reuse.

Puzzle CSV schema (from the page): `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity,
NbPlays, Themes, GameUrl, OpeningTags, DailyDate`. `Moves` are UCI. `OpeningTags` only set for
puzzles starting before move 20, drawn from the `chess-openings` name list.

Eval JSONL schema (from the page): one JSON object per line — `fen` (pieces/side/castling/en
passant only, no move counters), `evals[]` each with `knodes`, `depth`, and `pvs[]` of
`{cp | mate, line}` in UCI (Chess960-compatible) format.

## 2. Why it works

- **CC0 on almost everything removes the single biggest blocker** a mobile Mini App would otherwise
  face: no attribution burden, no share-alike propagation into our MIT codebase, no permission
  request, explicitly "commercial purpose... anything you like." (quoted above).
- **Monthly, non-cumulative files** mean nobody has to reprocess history to add October — you fetch
  one new file and append. Good shape for an incremental worker/cron job, bad shape for "give me
  everything since 2013" (that's the 2.54 TB standard-games column).
- **Torrents for every monthly file** shift bandwidth cost off Lichess's own servers onto the swarm
  — irrelevant to a WebView client, but signals the maintainers designed for third parties
  re-distributing at scale, which is exactly our use case.
- **SHA256 checksums and plain-text download lists** (`standard/sha256sums.txt`,
  `standard/list.txt`) exist for every dataset family, so an automated pipeline can verify integrity
  without parsing HTML.
- **A worked sample is published for every format** (puzzle CSV row, eval JSON object, PGN game with
  `%eval`/`%clk` annotations) — you can write a parser against the docs before downloading anything.

## 3. What they do badly

- **The two most useful non-game datasets (puzzles, evals) ship as a single monolithic file each**,
  not pre-sharded by rating, theme, or piece count. To get "just the 5,000 easiest puzzles" you must
  download and filter the full 304 MB yourself — there is no server-side query, no partial range
  offered as a curated subset. Same problem at 65x the size for the 21.68 GB eval file: there is no
  "just the endgame positions" or "just depth ≥ 40" cut.
  - `Scoresheet` has already worked around exactly this: `SPEC.md` records "the puzzle database is
    304 MB compressed. Measured 6 September 2026" and ships a bundled 5,000-puzzle subset rather than
    the full file — confirming this is a real, previously-hit constraint, not a hypothetical one
    (internal source: `chess/SPEC.md`, read 2026-09-08).
- **No masters bulk download**, discussed above — anyone wanting the curated master-games corpus
  that powers lichess.org's own opening explorer must go through the rate-limited HTTP API, one FEN
  at a time, which is unusable for building an offline dataset at scale.
- **No API for the flat files themselves** — this is a directory of static files plus one HTML page,
  not a queryable database despite the URL. Filtering by rating, time control, or result requires
  downloading whole files and parsing PGN client-side.
- **Update cadence for the openings/master data is explicitly "no fixed schedule"** for the
  `scalachess` propagation path (see `openings-names.md`) — freshness is not guaranteed on any cycle
  we could depend on for a release calendar.
- Direct probe of the Opening Explorer's public masters endpoint
  (`https://explorer.lichess.ovh/masters?fen=...`) returned **HTTP 401 Authorization Required** when
  tested 2026-09-08 — live-tested, not assumed. The Lichess-hosted tablebase endpoint
  (`https://tablebase.lichess.ovh/standard?fen=...`) answered the same style of request with a clean
  200 and JSON body in the same session, so this isn't a general outage — the masters explorer
  specifically appears to be access-gated now in a way older forum threads and blog posts don't
  describe. **NOT VERIFIED** whether this is IP-based, referrer-based, or a genuine policy change;
  only the fact of the 401 on this date is confirmed.

## 4. What we should copy conceptually

- **One licence banner at the top of the page that covers everything by default**, with named
  exceptions (broadcasts) called out inline where they diverge — do the same in our own
  `LICENCES.md`/`NOTICES.md`: state the default, then flag every deviation explicitly rather than
  making a reader infer it.
- **Publish a worked sample next to every schema.** Every dataset on this page shows one real row.
  If we ever expose any exported data (e.g. a puzzle-performance CSV, a game-history export), ship
  the same: schema doc plus one real example object.
- **Non-cumulative, dated files with checksums** is the right shape for anything we cache and refresh
  client-side — never re-fetch what already validated.

## 5. What we can do better

- We are not a data publisher, so this section is about *consumption*, not competing with Lichess:
  we can pre-shard what Lichess ships as one blob. Nothing stops us from taking the 304 MB puzzle
  CSV, filtering server-side (or at build time) into rating/theme buckets, and shipping only the
  slice a WebView actually needs — which is exactly the `chess/SPEC.md` "bundled 5,000-puzzle
  subset" decision already taken (internal source, read 2026-09-08).
- We can do the same for evals: nobody needs 394.7 million Stockfish evaluations in a phone's
  WebView storage. A filtered slice (e.g. only positions matching a curated opening/tactics set, or
  only mate-in-N lines) would need to be built offline from the 21.68 GB file and republished as our
  own small artifact — Lichess's CC0 licence explicitly permits redistributing modified/derived
  extracts ("you can download, modify and redistribute them").

## 6. What is technically required

- A `.pgn.zst` / `.csv.zst` / `.jsonl.zst` decoder — Zstandard, not gzip. In a browser/WebView
  context this means a WASM zstd decoder (or decompressing entirely at build time in Node/CI and
  shipping already-decoded, pre-filtered JSON/binary — the only realistic option for a bundle-size
  constrained app; do not ship a zstd decoder plus a 21 GB source file to a phone).
- PGN parsing for anything drawn from the games datasets (standard or variant) — needed regardless
  of source, since even a filtered slice starts as PGN.
- For puzzles: straightforward CSV parsing, UCI move application against `chess.js`/our own move
  generator to render each puzzle's starting position and solution.
- For evals: `fen` field omits move counters (only pieces/side/castling/en-passant) — a consumer
  must be prepared to look up or default the halfmove/fullmove counters if it needs a complete FEN.

## 7. What could break

- **Any assumption that the masters explorer is a free, unauthenticated public API** — it returned
  401 in a live test on 2026-09-08 (see §3). Build no feature around it without re-testing at
  implementation time, and have a fallback (e.g. our own curated opening book) ready.
- **Dataset URLs and filenames are versioned by month** (`lichess_db_antichess_rated_2026-07.pgn.zst`
  etc.) — any hardcoded URL goes stale next month by construction. A fetch pipeline must compute the
  current month or read `standard/list.txt` rather than hardcoding a filename.
- **CC BY-SA 4.0 on broadcasts is a real trap**: if a future feature pulls from the broadcast dataset
  specifically (e.g. "watch this live tournament"), the CC0 default does not apply and share-alike
  obligations would attach to anything built directly from that data — verify per-dataset licence
  before use, never assume CC0 blanket coverage.
- **The evals dataset is "produced by, and for, the Lichess analysis board, running various flavours
  of Stockfish within user browsers"** (page text) — Stockfish itself is GPL-3.0
  (`chess/SPEC.md` records this as the reason the project's own analysis engine is not Stockfish).
  The CC0 *data* (positions + centipawn scores) is not GPL-tainted merely by having been produced
  with a GPL engine — copyright does not attach to the numeric outputs of running software — but this
  reasoning is our own, **NOT VERIFIED** against a lawyer or an explicit Lichess/Stockfish statement
  addressing evaluation-output licensing specifically. Treat as a defensible working assumption where
  Lichess itself already ships this exact data as CC0, not as settled law.

## 8. What we can uniquely do because of Nimiq

- Nimiq's payment rail lets us attach a **real, tiny, instant NIM micropayment** to something
  Lichess's own CC0 data cannot itself gate: a curated, hand-verified slice of these open datasets
  (e.g. "unlock the next 5,000-puzzle pack") — the underlying data stays free per its licence, the
  product sells curation, packaging, and offline delivery, not the data itself. This is a legitimate
  monetization seam precisely because CC0 forbids restricting the *data* but says nothing about
  charging for a value-added, packaged artifact.
- A Nimiq Mini App's WebView is disposable/ephemeral by design — this argues for **fetch-then-cache
  small slices via the Device Identifier API's anonymous per-device handle** rather than a user
  account, matching how these datasets are meant to be consumed (stateless downloads) rather than
  queried live.

## 9. Licence and reuse verdict

- **Standard games, all variant games, puzzles, evaluations: CC0 1.0 Universal.** Verified verbatim
  from the live page banner, 2026-09-08. Free to bundle, filter, modify, and redistribute inside an
  MIT-licensed product with zero attribution or share-alike obligation. This is the strongest
  possible licence for our purposes.
- **Broadcast games: CC BY-SA 4.0**, confirmed from the page's dedicated broadcast-section banner.
  Attribution and share-alike required if used — avoid this dataset unless a feature specifically
  needs live-tournament coverage, and if used, satisfy CC BY-SA obligations explicitly (attribution
  + any derivative distributed under the same licence).
- **Masters database: no bulk file exists to license.** It is only reachable through the Opening
  Explorer API, which is not a data export and (per live test) is not even reliably open right now.
  No redistribution-rights question arises because there is nothing to redistribute — only an API
  call to make, if and when it is confirmed reachable again.
- Overall verdict for this dataset family: **safe, best-in-class, and already the correct default**
  for anything game/puzzle/eval-shaped in this product — the only per-dataset check needed before
  use is confirming which of the two licences (CC0 vs CC BY-SA) applies, which the table in §1 makes
  explicit.
