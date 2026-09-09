# lichess-org/chess-openings

Live-verified 2026-09-08: repo cloned via raw GitHub file fetches (`a.tsv`–`e.tsv`, `README.md`,
`COPYING.txt`), plus the GitHub REST API for file sizes and repo metadata. Repo:
https://github.com/lichess-org/chess-openings.

## 1. What they do

An aggregated, crowdsourced table mapping chess opening lines to human-readable names and ECO
codes. Data lives in five tab-separated files, one per ECO volume, at the repo root:

| File | ECO volume | Rows (excl. header) | Raw size |
|---|---|---|---|
| `a.tsv` | A | 817 | 66,338 B |
| `b.tsv` | B | 772 | 77,372 B |
| `c.tsv` | C | 1,250 | 132,306 B |
| `d.tsv` | D | 614 | 69,199 B |
| `e.tsv` | E | 357 | 42,837 B |
| **Total** | A–E | **3,810** | **387,052 B ≈ 378 KiB** |

Row/line counts obtained by fetching each raw file and counting lines 2026-09-08; byte sizes read
from the GitHub Contents API (`api.github.com/repos/lichess-org/chess-openings/contents/`),
2026-09-08. The whole git repository (including history) reports as 2,049 KB via the GitHub API
`size` field — irrelevant to us since we'd only ever fetch the raw TSVs or a release artifact, not
clone the repo.

Root-level (`/`) TSV schema, confirmed by fetching `a.tsv` directly:
```
eco	name	pgn
A00	Amar Opening	1. Nh3
A00	Amar Opening: Paris Gambit	1. Nh3 d5 2. g3 e5 3. f4
```
Three columns: `eco` (ECO classification), `name` (English opening name), `pgn` (a well-known move
sequence, or the most common line reaching that position in master games).

A separate `dist/` build target (generated via a documented `make` step requiring Python + the
`chess` package) adds two more derived columns not present in the source TSVs: `uci` (same moves in
UCI notation) and `epd` (Extended Position Description — FEN without move counters, en passant field
only where legal). `dist/` output additionally includes an Apache Parquet build, and the dataset is
mirrored in Parquet on Hugging Face at https://hf.co/datasets/Lichess/chess-openings (linked from
the README, not independently verified here — **NOT VERIFIED** beyond the README's own claim).

Naming convention (from the README, quoted): openings use "Title case," are structured as
`"Opening family: Variation, Subvariation"` (example given: `Sicilian Defense: Najdorf Variation,
English Attack`), and every name has a unique *shortest* line — where two openings could share a
prefix, a distinguishing move is appended.

## 2. Why it works

- **It is tiny.** 3,810 entries in ~378 KiB of plain TSV is small enough to embed in an app bundle
  outright — no fetch, no cache invalidation, no offline-mode fallback logic needed at all.
- **It's the same table that drives lichess.org's own opening names**, so an opening displayed by
  our app will read identically to what a user already sees on Lichess — no naming drift, no
  "why does this app call it something different" confusion.
- **The `eco`+`pgn` pair is unambiguous and directly executable**: apply the `pgn` moves to a fresh
  board with any legal move-generator to recover the exact position, no separate FEN table required
  for the base case.
- **Crowdsourced via ordinary GitHub PRs**, each kept to "one logical change" per the CONTRIBUTING
  convention — low-friction to propose a fix if we ever find a wrong or missing name, unlike a
  closed proprietary opening book.

## 3. What they do badly

- **No fixed update schedule.** The README states plainly: "The changes will be live on lichess.org
  after the next update of scalachess (no fixed schedule) and the opening explorer (daily)." If we
  bundle a snapshot, there is no guaranteed cadence to re-sync against — we would need to poll the
  repo ourselves (e.g. a CI job diffing against `master`) rather than expect a release calendar.
- **Only the root TSVs ship `pgn`; `uci` and `epd` require a local build step** (Python + `pip
  install chess` + `make`) that is not itself hosted as a downloadable artifact on database.lichess.org — we would either run that build ourselves in CI, or parse `pgn` into UCI/EPD using our
  own already-required move generator (redundant work either way).
- **Transposition handling is intentionally lossy-by-name**: the README documents that multiple TSV
  rows can point at the same reachable position (to cover common transpositions), so building a
  reverse lookup ("given this FEN, name it") is not a simple one-to-one map — a real implementation
  needs the recommended "play moves backwards until a named position is found" heuristic (from the
  README), not a naive hash lookup.
- **English only.** There is no localized opening-name data in this repo — matches the fact that
  Nimiq's own localization only covers 5 languages (en/es/de/fr/pt per
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`), so opening names specifically would need either a translation
  layer we build ourselves or would ship English-only regardless of UI locale.

## 4. What we should copy conceptually

- **Ship the whole thing, not a subset.** At 378 KiB this is the one dataset in this research pass
  small enough that "what to bundle vs. fetch" isn't even a real question — bundle it, full stop.
- **Keep the name table separate from the position/move logic.** The repo treats "what is this
  opening called" as a pure lookup table over PGN/FEN, decoupled from move generation or engine
  logic — matches the separation already implied by `packages/core` owning move generation (per
  `chess/SPEC.md`) versus wherever opening names would live.
- **The shortest-unique-line convention** is a genuinely useful design pattern worth reusing verbatim
  if we ever need our own supplementary naming data (e.g. for a variant Lichess doesn't cover):
  define uniqueness by shortest reachable line, append a distinguishing move only when truly needed.

## 5. What we can do better

- Precompute the `uci`/`epd` columns ourselves at build time (from the public `pgn` column, using
  our own move generator) and ship a single flat binary/JSON lookup optimized for our runtime,
  rather than depending on Lichess's Python-based `dist/` pipeline or the separate Parquet mirror.
- Build the reverse (FEN → name) index once, offline, using the README's own recommended
  "play-backwards" algorithm, and ship *that* precomputed index instead of the raw TSVs — turns a
  runtime tree-walk into an O(1) lookup on-device, at the cost of a slightly larger bundled artifact
  (still trivially small relative to 378 KiB of source text; a hashmap of ~3,810 EPDs → names is on
  the order of tens of KB even before compression).

## 6. What is technically required

- A TSV parser (trivial — three tab-separated columns, no quoting complexity observed in the sample
  rows).
- A PGN-to-position applier (move generator) to turn each `pgn` cell into a FEN/EPD if we build our
  own reverse index rather than depending on `dist/epd`.
- Nothing else — no network access, no external service, no runtime dependency beyond what a chess
  engine/move-generator already needs for the rest of the app.

## 7. What could break

- If Nimiq or our own review process ever draws a hard line on "must re-verify licence per file
  before bundling," this repo satisfies that today (see §9) but has no fixed release cadence to
  re-check against — a periodic manual re-pull (e.g. quarterly) is the realistic mitigation, not an
  automated "latest" fetch we can trust to always be safe without review.
- The unresolved multiple-rows-per-position transposition behavior (§3) means a naive "look up this
  FEN, get exactly one name" implementation will occasionally return the wrong (non-shortest) name or
  miss a match entirely if not implemented per the README's documented algorithm.

## 8. What we can uniquely do because of Nimiq

- Nothing about this specific dataset is Nimiq-specific — it is pure reference data with no payment,
  identity, or chain-dependent angle. Its value to the product is entirely as free, bundlable
  infrastructure (opening names shown during play/review), not as a monetizable or on-chain feature
  in its own right.

## 9. Licence and reuse verdict

Exact licence, from `COPYING.txt` at repo root (fetched verbatim, 2026-09-08): the full **CC0 1.0
Universal** legal text (Creative Commons Corporation), matching the README's own Copyright section,
quoted:
> "As a collection of facts, this data set is in the public domain. Considerable effort was spent
> curating and cleaning the data. Insofar as that qualifies for copyright, the work is released
> under the CC0 Public Domain Dedication."
Source: https://github.com/lichess-org/chess-openings README.md and COPYING.txt, fetched 2026-09-08.

**Verdict: unrestricted.** CC0, tiny, English-only, no attribution required, safe to bundle in full
inside an MIT product with zero licence risk. This is the single easiest "yes" of every dataset
covered in this research pass — the only real engineering decision is root TSVs (raw, `pgn`-only,
zero build step) versus a self-built derived index (more useful at runtime, requires one offline
precompute pass we control).
