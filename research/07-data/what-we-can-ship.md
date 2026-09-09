# What we can ship: bundle vs. fetch vs. out of reach

Synthesis of `lichess-db.md`, `openings-names.md`, and `tablebases.md`, reframed around the one
constraint none of those three sources care about but we must: this is a **Nimiq Mini App running
inside a wallet WebView**, where bundle size is a scored, competed-on dimension, not a footnote.
Internal grounding (both read directly, 2026-09-08): `chess/SPEC.md` records that Cycle 1's 3rd-place
entry, NimQuest, shipped at **4.9 MB against two competitors at 78 MB and 89 MB** — i.e. small,
finished, and offline-capable is a demonstrated competitive edge in this exact competition, not a
theoretical nicety. `chess/SPEC.md` §P4 also records a prior near-miss: the team almost shipped a
feature assuming the 304 MB Lichess puzzle file was "free to serve from our own copy," caught only
after measuring its real `Content-Length`. This file exists to make sure the same mistake doesn't
happen again for openings, evals, or tablebases.

No official Nimiq document read for this project states a hard byte cap on Mini App bundles — the
4.9 MB precedent is competitive signal, not a rule. Everything below treats "small" as a design goal
to beat, not a number handed down from outside.

## 1. What they do

Recap of the three source datasets researched, this time sorted by what actually matters for a
bundle decision — **raw source size**, independent of licence (all licences already cleared in the
per-source files):

| Dataset | Raw source size | Source file |
|---|---|---|
| Chess opening names (`lichess-org/chess-openings`) | **~378 KiB** total (5 TSVs) | `openings-names.md` §1 |
| Curated 5,000-puzzle subset (already decided) | **"a few hundred KB"** as compact JSON | `chess/SPEC.md` §P4, internal |
| Full Lichess puzzle CSV | **304.4 MB** compressed (live `HEAD`, 2026-09-08) | `lichess-db.md` §1 |
| Syzygy 3–4–5 man tablebases | **~940 MB** (378 MB WDL + 561 MB DTZ; live-summed 940.4 MB) | `tablebases.md` §1 |
| Full Lichess cloud-eval file | **21.68 GB** compressed (live `HEAD`, 2026-09-08) | `lichess-db.md` §1 |
| Syzygy 6-man tablebases | **~150.1 GB** (68.2 + 81.9 GB) | `tablebases.md` §1 |
| Syzygy 7-man tablebases | **~17.3 TB** | `tablebases.md` §1 |
| Full standard-games archive | **2.54 TB**, 8.04 billion games | `lichess-db.md` §1 |
| Bulk masters-games PGN | **Does not exist as a file.** API-only, and gated (401) as of 2026-09-08 | `lichess-db.md` §3 |

## 2. Why it works

Splitting the landscape this way works because the three failure modes are genuinely different
problems with different fixes:
- **Openings**: too small to ever be a problem. Bundle it, done.
- **Puzzles and evals**: the *source* is huge, but the thing a player actually needs at any moment
  (one puzzle, one position's evaluation) is tiny — the right fix is pre-filtering into a small
  bundled core plus a paginated fetch tier, exactly what `SPEC.md` §P4 already decided for puzzles.
- **Tablebases**: the size itself scales with piece count in a way no filtering trick can shrink
  below a certain floor for full coverage — the right fix is a hard tier cut (3–5 men only, ever),
  not filtering within a tier.

## 3. What they do badly

- **None of the three upstream sources are shaped for mobile consumption.** Lichess ships two of its
  most useful non-game datasets as one undifferentiated blob each (304 MB puzzles, 21.68 GB evals) —
  see `lichess-db.md` §3. Syzygy's size floor is inherent to the format (perfect information for N
  pieces costs what it costs) — see `tablebases.md` §3. Nothing here is a bug we're pointing out;
  it's a mismatch between "how a data publisher wants to publish" and "how a WebView wants to
  consume," and it's on us to bridge it, not on them to have anticipated it.
- **The masters-games gap is the worst of the three**, because it isn't a size problem — a curated
  master-games PGN corpus would likely be on the order of the puzzle file or smaller — it's an
  *access* problem. No bulk file exists, and the API returned 401 in a live test (`lichess-db.md`
  §3/§7). A feature planned around "we'll bundle top master games for opening-repertoire training"
  has no clean, licensed, currently-reachable free source identified in this research pass.

## 4. What we should copy conceptually

- **The `SPEC.md` §P4 puzzle plan is the correct pattern and should be the template for everything
  else in this file, not a one-off**: bundle a small, representative, offline-first core; serve the
  long tail from our own store, paginated by the dimension a player actually needs (rating, theme,
  piece count); never call the upstream provider's API at runtime for a feature the product depends
  on being always-available.
- **Never bundle a source file as-is.** Every dataset in this research pass that's remotely large was
  published as one flat file by its source. Every one of them should be pre-processed (filtered,
  reshaped, re-encoded) by us, offline, before anything reaches the client — the upstream format is a
  build-time input, never a runtime asset.

## 5. What we can do better

Concretely, per dataset:

- **Openings** — bundle the full 378 KiB, or better, our own precomputed FEN→name reverse index
  (still tens of KB), per `openings-names.md` §5. No fetch tier needed at all.
- **Puzzles** — already decided (`SPEC.md` §P4): bundle ~5,000 puzzles (a few hundred KB), fetch the
  rest from our own re-hosted, paginated store — never Lichess's API or raw file at runtime.
- **Evals** — do not bundle or fetch the 21.68 GB file, ever, in any form, at runtime. If evaluation
  data is wanted for a feature (e.g. showing a well-known reference line's evaluation), pre-filter a
  small derived slice offline at build time (e.g. only positions matching our bundled opening book,
  or only famous game moments) and ship that tiny derivative as bundled JSON — a build-time
  transform, not a client-side fetch of anything close to the source size.
- **Tablebases** — 3–5 man only, and even that tier is too big (~940 MB) for the default bundle.
  Two realistic options, not mutually exclusive: (a) a hand-picked micro-subset of pedagogically
  important endgames (K+P v K, K+R v K, a few more) bundled directly — plausibly low single-digit MB
  based on individual file sizes observed in the live directory listing (`tablebases.md` §5,
  estimate, not measured); (b) call the free public API
  (`tablebase.lichess.ovh`) live, per-position, for anything not in the bundled micro-subset — this
  is the same shape as the puzzle plan's fetch tier, and it's free, live-verified, and needs no
  storage budget at all beyond a thin request/response cache.
- **Masters games** — no clean source exists (§3). Do not build a feature that depends on bulk master
  PGN data from Lichess. If master-game-derived content is wanted, the honest options are: (a) our
  own curated set of long-out-of-copyright classical games (individual historical games are not
  copyrightable as facts, though a specific *edition's* annotations can be — the games' raw
  moves themselves are safely reusable, **NOT VERIFIED for any specific published anthology's
  annotation copyright**, only that the raw move sequences of old games are not protectable), or
  (b) periodically re-attempt the Opening Explorer API and treat it as best-effort, never
  load-bearing.

## 6. What is technically required

- **Build-time tooling**: a Zstandard decoder (Node has `zstd` bindings; no need for this in the
  client at all if every large source file is processed entirely in CI/build and only small derived
  artifacts ship to the client), PGN/CSV/JSONL parsers, and a script that re-runs whenever upstream
  data should be refreshed (openings has no fixed schedule per `openings-names.md` §3 — a periodic,
  reviewed re-pull is the right cadence, not an automated blind sync).
- **Client-side runtime**: only what's needed to read our own pre-shaped bundled JSON/binary
  artifacts, plus `fetch()` for the paginated puzzle store and the tablebase API — no zstd decoder,
  no PGN-corpus-scale parser, no Syzygy file-format reader needed on-device *unless* the local-probing
  option from `tablebases.md` §6 is chosen over the API-call option, in which case a WASM Fathom
  build becomes a real client-side dependency, budgeted separately from the data itself.
- **Storage**: `IndexedDB`/Cache Storage for anything fetched-and-cached beyond the initial bundle —
  `SPEC.md` line 590 already commits to "puzzle rows and the bot in a service worker" for offline
  play, so the fetch-tier storage mechanism is already decided at the architecture level; this
  document only adds which datasets flow through it.

## 7. What could break

- **Re-litigating "just bundle the whole puzzle file" (or evals, or a tablebase tier) after this
  document is forgotten** — this is exactly the near-miss `SPEC.md` §P4 already records once. The
  fix is procedural, not technical: any future PR that adds a new upstream dataset must state its
  live-measured size (via `HEAD`, not a remembered or guessed number — sizes drift; the eval file
  and puzzle file both updated between checks) before deciding bundle vs. fetch.
- **The masters API's 401 could resolve itself, tempting a quick fetch-based feature** — re-test
  before relying on it, and even if it opens up again, treat it as best-effort per §5, not
  load-bearing, given Lichess's own explorer service has no published SLA for third-party callers.
- **Upstream file names and monthly paths change every month** (`lichess-db.md` §7) — any build
  script pulling fresh source data must resolve the current filename dynamically, not hardcode one.

## 8. What we can uniquely do because of Nimiq

- The same seam identified in both other files applies system-wide here: **Nimiq payments can gate
  optional, larger, opt-in data packs** (a bigger puzzle pack, the full 3–5-man tablebase set) that
  the free bundle deliberately excludes — monetizing curation, packaging, and offline delivery of
  data that is itself CC0/unrestricted (`lichess-db.md` §9, `tablebases.md` §9), which is a
  legitimate, licence-compatible product lever that a non-payment-enabled web app couldn't use as
  naturally.
- Nimiq's **Device Identifier API** (anonymous per-device handle, no wallet required, per
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`) is a good fit for tracking which optional data packs a given
  device has already fetched/cached, without requiring an account system just to avoid re-downloading
  a 940 MB tablebase pack.

## 9. Licence and reuse verdict

Every dataset surveyed across all three files is either CC0, MIT-derived, or explicitly free of
copyright (tablebase files) **except** broadcast games (CC BY-SA 4.0, `lichess-db.md` §9) — licence
is not the limiting factor anywhere in this research pass. Size and access are.

**Bundle (ships in the package, zero network, always available):**
- Opening names: ~378 KiB raw, or a smaller precomputed index — CC0.
- Curated puzzle subset: a few hundred KB — CC0. *(already decided, `SPEC.md` §P4)*
- Optional: a hand-picked micro-subset of 3–5-man tablebase files (low single-digit MB, **estimate**)
  — free of copyright.
- **Total bundled chess-data footprint: well under ~5 MB**, comfortably inside the competitive
  envelope the 4.9 MB NimQuest precedent suggests for an entire app, leaving the majority of any
  reasonable bundle budget for code, the engine, board assets, fonts, and sounds.

**Fetch (network required, cached client-side after first use):**
- Remaining puzzles beyond the bundled 5,000, paginated from our own re-hosted store — CC0 source,
  self-hosted delivery.
- Tablebase lookups beyond the bundled micro-subset, via the free `tablebase.lichess.ovh` API — free
  of copyright, live-verified working, no documented rate limit (treat conservatively, per-position
  only, never bulk).
- Any future optional larger data packs (bigger puzzle set, full 3–5-man tablebase set), ideally
  behind an explicit user action given the ~940 MB size of the full tablebase tier.

**Out of reach (never bundled, never fetched wholesale, by any mobile product, full stop):**
- Full standard-games archive (2.54 TB), full eval file (21.68 GB) in raw form, 6-man tablebases
  (~150 GB), 7-man tablebases (~17.3 TB). These only become usable through offline, build-time
  distillation into much smaller derived artifacts we control — never as a direct client-side
  download regardless of connection quality.
- Bulk master-games PGN — out of reach for a different reason: it doesn't exist as a licensed bulk
  file, and its only access path is currently gated. Not a size problem; a sourcing problem with no
  clean resolution found in this research pass.
