# Lichess Opening Explorer — data architecture

Research date: 2026-09-08. Sources: `gh api repos/lichess-org/lila-openingexplorer` (repo file listing + README content, fetched directly via the GitHub REST API — this is the primary source for this file, quoted/paraphrased faithfully below), the public API reference at https://lichess.org/api#tag/Opening-Explorer (attempted via WebFetch, page did not render usable content for the fetcher — marked below), and https://lichess.org/features for the headline scale figure.

## 1. What they do

`lila-openingexplorer` is a standalone Rust service, separate from the main `lila` application, whose job is: given a position (FEN) and optionally a sequence of moves from it, return aggregate statistics — how often each candidate move was played from that position, and with what result (white win / draw / black win) — across one of three distinct game populations.

**Three independent data sources / endpoints**, confirmed via the README (`gh api repos/lichess-org/lila-openingexplorer/contents/README.md`):
- **`/masters`** — a curated database of master-level games.
- **`/lichess`** — all rated games played on Lichess itself, imported from the public game dumps at https://database.lichess.org/.
- **`/player`** — an *on-demand*, per-player database: "an on-demand database of openings by player" (README, linking to Lichess's own blog post "Announcing the personal opening explorer"). This is populated lazily per query rather than pre-built for every user.

**Opening names**: positions are annotated with ECO code + opening name from a fourth, separate data source — `lichess-org/chess-openings`, described in the README as "Curated opening names," and confirmed independently (§9 of `01-platforms/lichess.md`) to be CC0-licensed, i.e. public-domain-equivalent TSV files (`a.tsv` through presumably `e.tsv`, one per ECO volume).

**Scale**: the README's own description is "capable of handling trillions of positions." The features page separately advertises "6,000,000,000 games" for the global explorer (source: https://lichess.org/features). Production load as of the README's own snapshot (dated within the doc as "February 2023," **not re-verified against current-day numbers, treat as a point-in-time figure**): ~12,000 requests/minute, served from 4 spinning disks in RAID10 + 128 GiB RAM (100 GiB reserved for block cache).

**Query semantics** (`/player` endpoint, the only one with fully-documented parameters in the README — confirmed exact table via `gh api`):

| param | type | default | meaning |
|---|---|---|---|
| `variant` | string | `chess` | one of `antichess`, `atomic`, `chess` (aliases `standard`, `chess960`, `fromPosition`), `crazyhouse`, `horde`, `kingOfTheHill`, `racingKings`, `threeCheck` |
| `fen` | string | starting position of variant | root position |
| `play` | string | empty | comma-separated UCI moves played from `fen`; required to resolve an opening name if `fen` isn't an exact named-position match |
| `player` | string | **required** | username to filter for |
| `color` | string | **required** | `white` or `black` — which side `player` played |
| `modes` | string | all | comma-separated `rated`/`casual` filter |
| `speeds` | string | all | comma-separated `ultraBullet`, `bullet`, `blitz`, `rapid`, `classical`, `correspondence` |
| `since` / `until` | string (`YYYY-MM`) | `0000-01` / `3000-12` | date-range filter |

**Response shape**: streamed as `application/x-ndjson` (newline-delimited JSON), not a single JSON blob. Top-level fields per the README's own example: `white`/`draws`/`black` (aggregate result counts from the queried position), `moves[]` (each candidate move with its own `uci`, `san`, `white`/`draws`/`black` counts, `averageOpponentRating`, and — only for moves backed by a single game — a `game` object with id/winner/speed/mode/players/year/month), `recentGames[]` (up to 15 recent games touching this position), `opening` (`eco` + `name`, from the chess-openings dataset), and `queuePosition` (an integer — position in an indexing queue if the requested player/position hasn't been fully indexed yet).

**Live indexing on query, not purely batch**: the README states the server "will start indexing, immediately respond with the current results, and stream more updates until indexing is complete. The stream is throttled and deduplicated." This is the defining behavior of the `/player` endpoint specifically — it is not a static pre-built index like `/masters` and `/lichess`, it computes on first request and caches/streams as it goes.

**Monitoring**: a `/monitor` endpoint exposes metrics in InfluxDB line-protocol format (cache hit/miss counts per data source, indexing queue depth, per-source game counts), and `/monitor/db/<prop>` / `/monitor/cf/<cf>/<prop>` expose raw RocksDB internals (compaction stats, block cache occupancy, per-column-family stats) — confirmed via a live example in the README showing multi-terabyte compaction stats for the `lichess` column family (Sum row: 2.90 TB across levels).

## 2. Why it works

- **Three data sources cleanly separated by trust/scale/freshness profile, not merged into one index.** Masters games are small, curated, high-signal, and rarely change. Lichess games are enormous, arrive continuously, and are queried by anyone. Player games are tiny per-user but need to be computed on demand for an unbounded number of usernames — trying to serve all three from one schema/index would force worst-case tradeoffs on all of them. Separate RocksDB column families let each be tuned independently.
- **Streaming NDJSON responses that start immediately and improve over time** is the right shape for a query that can be expensive (especially `/player`, which may need to index from scratch) — the client gets a usable partial answer in milliseconds instead of waiting for a worst-case-latency complete answer.
- **An embedded LSM-tree store (RocksDB) rather than a general-purpose database** is the correct choice for this workload: read-heavy, append-mostly, keyed by position (effectively a giant sorted key-value problem), and the README's own operational guidance (SSD strongly preferred, large block cache, RAID10 for the spinning-disk deployment) shows the team engineered specifically around RocksDB's compaction/read-latency characteristics rather than fighting a generic RDBMS.
- **The opening-name dataset is decoupled and CC0**, so anyone (Lichess or a third party) can update/curate opening names independently of the positional-statistics index, and use it without any licensing friction.
- **Public metrics endpoint (`/monitor`) in an open, ingestable format (InfluxDB line protocol)** means operators (Lichess or anyone self-hosting this open-source service) get production-grade observability for free, not bolted on later.

## 3. What they do badly

- **The README documents `/player`'s parameters in full but does not document `/masters`' or `/lichess`'ers parameters in the fetched content** — the README's public-API section literally just headers `### /masters` and `### /lichess` with no parameter table under either, deferring instead to "See https://lichess.org/api#tag/Opening-Explorer" for the full reference. That external page did not return usable structured content to WebFetch during this research (returned only a header with no body — likely JS-rendered Swagger/Redoc UI). **The exact parameter set for `/masters` and `/lichess` (e.g. whether they support rating-range filtering, which the FAQ/community commonly references) is NOT VERIFIED from primary source in this research pass** — treat any claim about those two endpoints' full parameter lists as unconfirmed until read directly from the rendered API docs or OpenAPI spec.
- **`/player` is a live-indexing, potentially slow path with no documented rate-limit/backpressure contract visible in the README excerpt fetched** — a client querying an unindexed or rarely-queried player has to handle an open-ended "still indexing, queuePosition: N" response, which pushes complexity onto every consumer.
- **Operationally heavy to self-host at Lichess's scale**: 128 GiB RAM, RAID10 spinning disks (or SSDs strongly recommended), multi-terabyte compacted size for the `lichess` column family alone (2.90 TB per the example stats) — this is not a "spin up a small service" proposition if you actually want Lichess-scale coverage; it is a serious infrastructure commitment even before considering ongoing import cost from ~12k req/min production traffic.
- **Import is comparatively slow**: the README states "importing is currently very slow, but good enough to index faster than games are played," with offline bulk-import speed averaging ~1 MiB/s compressed (~7 MiB/s uncompressed) historically, and live-system paced import throttled to ~100 KiB/s "paused at peak hours" — i.e. the team deliberately trades import throughput for not degrading query latency during peak load, which is the right tradeoff but means bulk re-indexing from scratch is a multi-week-class operation at Lichess's total game volume, **NOT VERIFIED** with an exact duration figure (not stated in the README).

## 4. What we should copy conceptually

- **Separate storage/index per data population with genuinely different characteristics** (curated/small vs. bulk/continuous vs. on-demand/per-user) rather than one schema trying to serve all three.
- **Stream partial results immediately, backfill via a visible progress signal** (`queuePosition`) rather than making the client block on a complete answer — directly applicable to any "compute this the first time it's asked for" feature we might build (e.g., a personal stats page that isn't pre-materialized).
- **Decouple reference/lookup data (opening names) from the statistical index**, and license it permissively/openly if we ever publish anything comparable — it costs us nothing and multiplies reuse.
- **Design the storage engine choice around the actual access pattern** (LSM-tree/RocksDB for append-heavy, position-keyed, read-heavy data) rather than reflexively picking a general-purpose relational or document store.
- **Expose operational metrics in an open, standard format from day one**, even at small scale — cheap now, expensive to retrofit.

## 5. What we can do better

- **We do not need Lichess's scale, so we don't need Lichess's infrastructure commitment.** A small app's "opening book" or "position stats" feature can be orders of magnitude smaller in scope (e.g., stats only over games actually played inside our own app, or a bundled static reference table) — RocksDB-at-terabyte-scale is Lichess's answer to a problem (billions of historical games) we will not have for a long time, if ever. Building toward that scale prematurely would be pure waste.
- **Consuming the existing Lichess opening explorer over its public API is almost certainly better than building our own for anything beyond our own app's game history**, because the `/masters` and `/lichess` endpoints already give any client global opening statistics for free, without us hosting a multi-terabyte dataset at all — see §6.
- **If we ever do want stats over *our own* app's games, an on-demand-computed, cached-on-first-request pattern (like `/player`) is the right shape at small scale too**, and is trivially cheaper to implement without RocksDB — a simple materialized cache keyed by (position, filters) backed by whatever primary store we already use is sufficient until volume says otherwise.

## 6. What is technically required

For a small app, two realistic technical paths, not one:

**Path A — consume, don't host.** Call the existing public Lichess endpoints (`https://explorer.lichess.ovh/masters`, `/lichess`, `/player` — the README's own curl example targets `explorer.lichess.ovh`, i.e. Lichess's own production instance, reachable over plain HTTPS) directly from our client or a thin backend proxy. This requires: an HTTP client capable of consuming a streamed NDJSON response (most fetch/HTTP libraries handle this natively via a readable stream), and UI that can render an incrementally-arriving move list (matches the `/player` endpoint's own "start indexing, stream updates" contract). No database, no indexing pipeline, no infrastructure — this is by far the lowest-cost, highest-leverage option and should be the default unless a concrete reason rules it out.

**Path B — build a small, self-scoped explorer over our own app's games only.** If we want opening stats specifically over games played inside our own app (not global Lichess data), the minimum viable version is: a position-keyed store (any key-value or document store our stack already has is sufficient at our volume — RocksDB is not required), a write path that, at the end of every completed game, walks the move list and increments per-position, per-move-from-that-position counters (white/draw/black), and a read path that looks up a FEN (+ optional move-sequence continuation) and returns the aggregate. This is architecturally the same idea as lila-openingexplorer's `/lichess` index, just at a scale where a purpose-built LSM-tree store is unnecessary engineering.

Either path benefits from the CC0 `chess-openings` dataset (ECO code + name lookup by position) — freely embeddable with no licensing concern, per §9.

## 7. What could break

- **Path A (consuming Lichess's own API) creates a runtime dependency on a third party we don't control.** If `explorer.lichess.ovh` rate-limits, changes its response shape, or has downtime, any feature built on it degrades or breaks. This should be treated as a real external dependency (with a fallback/cache layer, not a blind pass-through) if it becomes load-bearing for the product rather than a nice-to-have.
- **The exact rate limits and terms of use for the public opening-explorer API were not found/verified in this research pass** — before depending on it for anything beyond casual/low-volume lookups, the actual API terms need to be read directly (not inferred from the README, which documents the self-hostable service, not Lichess's own usage policy for its hosted instance). **NOT VERIFIED.**
- **Path B's write-on-every-game-end pattern only stays cheap if our own game volume stays small.** If our app ever reaches a scale where per-position counters become a hot-write bottleneck, we'd face the same scaling pressure that pushed Lichess toward RocksDB — worth knowing that's the escape hatch, not something to build preemptively.
- **The `/masters` and `/lichess` endpoints' full parameter set is unverified (§3)** — any integration plan that assumes specific filtering capability (e.g., rating-range filtering) on those two endpoints needs that confirmed against the live OpenAPI spec before being relied on, not assumed from the `/player` table by analogy.

## 8. What we can uniquely do because of Nimiq

- **A per-position, per-user "opening performance" stat that's tied to a signed, verifiable game record** rather than a server-asserted aggregate — if we build Path B, the same signed-move-history infrastructure that backs our recomputable rating can back opening statistics too: anyone could independently recompute "how does this wallet perform after 1.e4" from the public signed game log, the same way they could recompute the rating itself. Lichess's opening explorer has no equivalent verifiability story — its per-move win/draw/loss counts are simply asserted by lila's index.
- **No incentive to inflate or game engagement metrics silently**, because if opening/position statistics are derived from the same signed record used for ratings and (potentially) payouts, any manipulation attempt is visible in the same audit trail — a structural integrity property Lichess's centrally-asserted index doesn't need (and doesn't have) because nothing financial rides on it.

## 9. Licence and reuse verdict

| Component | License | Verdict |
|---|---|---|
| `lichess-org/lila-openingexplorer` (the Rust/RocksDB service itself) | **AGPL-3.0** (README: "Licensed under the GNU Affero General Public License v3. See the `LICENSE` file for details" — confirmed via `gh api repos/lichess-org/lila-openingexplorer/contents/README.md`) | **Reference-only for architecture** (data model, column-family split, streaming-response design, on-demand-indexing pattern — all documented at the observed-behavior level in this file). No code may be ported into our MIT repo. The service's **public HTTP API may be called** as an external network dependency (Path A above) without any AGPL obligation attaching to our own code, since we would not be linking against or distributing its source — but see §7 for the real operational risk of depending on a third-party service regardless of license. |
| `lichess-org/chess-openings` (opening name / ECO dataset) | **CC0 1.0 Universal** (confirmed via `gh api repos/lichess-org/chess-openings/contents/COPYING.txt`) | **Freely reusable, including verbatim, with no attribution obligation.** This is the one artifact in the opening-explorer stack we can embed directly and without qualification — a strong candidate to bundle into a small, self-scoped explorer (Path B) or even just to label positions client-side. |

**Bottom line**: the opening explorer's *value to us* is almost entirely available without touching any AGPL code — either by calling Lichess's own public API (Path A, zero infrastructure, real third-party-dependency risk) or by building a much smaller purpose-built index over our own app's data using only the CC0 opening-name dataset and a conventional store, applying the architectural lessons above (separate populations, stream partial results, pick storage for the access pattern) without needing RocksDB or Lichess's operational scale at all.
