# Syzygy tablebases

Sources: https://github.com/syzygy1/tb (generator + README, fetched raw 2026-09-08),
https://github.com/lichess-org/lila-tablebase (server, fetched 2026-09-08), live HTTP tests against
`https://tablebase.lichess.ovh/` and `https://explorer.lichess.ovh/` (2026-09-08), a live directory
listing at `http://tablebase.sesse.net/syzygy/3-4-5/` (fetched and summed 2026-09-08), and
https://github.com/basil00/Fathom / https://github.com/jdart1/Fathom (probing library, via search,
2026-09-08).

## 1. What they do

Syzygy tablebases are precomputed endgame databases: for every legal position with a small enough
number of pieces on the board, the exact game-theoretic outcome (and, for the harder files, the
exact distance to progress) is stored and can be looked up instead of searched.

Two file types, per the `syzygy1/tb` README (fetched verbatim):
- **WDL (`.rtbw`)** — "win/draw/loss information including, where applicable, information on the
  50-move rule." Two-sided: covers both "white to move" and "black to move" in one file.
- **DTZ (`.rtbz`)** — "distance-to-zero," the number of moves to the next capture or pawn move (i.e.
  to the next unavoidable reset of the 50-move counter). Single-sided; only needed for 6- and
  7-piece endgames per the README.

Generation is done by the `syzygy1/tb` C tools: `rtbgen` (pawnless positions), `rtbgenp` (pawnful),
`rtbver`/`rtbverp` (verification), `tbcheck`. Generating the 7-piece set needs at least 1 TB of RAM
per the README — this is not something we would ever do ourselves; we would only ever consume
already-generated files or a hosted probing API.

Probing (looking up a position, as opposed to generating the tables) is a separate, much lighter
concern, split across two things:
- `syzygy1/probetool` — "Tablebase probing tool and tablebase access code," the reference C probing
  code linked directly from the generator's own README.
- **Fathom** (https://github.com/basil00/Fathom, actively maintained fork at
  https://github.com/jdart1/Fathom) — a small, focused C library specifically for probing (not
  generating) Syzygy tables, derived from Ronald de Man's `tbprobe.c` (originally part of the Cfish
  engine). This is the realistic dependency for an app that only needs to *read* tablebase results,
  not build them.

Piece-count tiers and their real sizes:

| Tier | WDL | DTZ | Combined | Source |
|---|---|---|---|---|
| 3–5 men | 378 MB | 561 MB | **~939 MB** (README figure) / **940.4 MB across 281 files** (live-summed) | `syzygy1/tb` README; independently confirmed by summing the live directory listing at `tablebase.sesse.net/syzygy/3-4-5/`, fetched 2026-09-08 |
| 6 men | 68.2 GB | 81.9 GB | **~150.1 GB** | `syzygy1/tb` README, via search corroboration — **NOT independently re-verified against a live directory** |
| 7 men | ~8,677 GB | ~8,449 GB | **~17.3 TB (17,277 GB)** | Lichess's own blog post "7-piece Syzygy tablebases are complete" and the Sesse mirror figures, found via search — **NOT independently re-verified by direct fetch of the blog post in this pass; treat the split as approximate, the ~17 TB order of magnitude as solid** |

The 3–4–5 man figure is the only one directly re-derived from a live source in this research pass:
fetching `http://tablebase.sesse.net/syzygy/3-4-5/` and summing every listed file's size gives
281 files totalling 940,407,148 bytes ≈ 940.4 MB, matching the README's 378+561=939 MB almost
exactly (the small gap is rounding/formatting in the directory listing's K/M units, and this mirror
may list 281 rather than the commonly cited 290 files — **NOT VERIFIED** which count is authoritative,
but both land at essentially the same total size).

## 2. Why it works

- **Perfect information for small endgames removes an entire class of engine error.** A 3–5-man
  probe is instant, exact, and requires no search — for anything at or below that piece count, "is
  this a win, and in how many moves" is a table lookup, not a heuristic.
- **A public, unauthenticated, live API already exists and needs no self-hosting.** Live-tested
  2026-09-08:
  ```
  GET https://tablebase.lichess.ovh/standard?fen=<FEN>
  → 200 OK, JSON: {checkmate, stalemate, category, dtz, precise_dtz, dtm, moves:[{uci,san,category,dtz,...}], ...}
  ```
  No API key, no auth header, no CORS preflight failure observed. This is backed by
  `lichess-org/lila-tablebase`, which the repo itself states "powers tablebase.lichess.ovh" and,
  separately, `lichess.org/analysis#explorer`.
- **Files themselves are legally unencumbered** (see §9) — unlike almost every other "master
  database" resource surveyed for this research pass (TWIC is personal-use-only, ChessBase databases
  are proprietary), Syzygy tables can be redistributed without restriction.
- **File format is compact by design**: DTZ/WDL encoding plus internal compression is why a
  7-piece win/draw/loss answer for every legal position with ≤7 pieces fits in ~17 TB rather than
  the astronomically larger number of raw positions would suggest.

## 3. What they do badly

- **Size explodes non-linearly with piece count**: 3–5 men ≈ 940 MB, 6 men ≈ 150 GB (~160x bigger),
  7 men ≈ 17.3 TB (~115x bigger again). There is no smooth "just add a bit more" path from a mobile
  budget to full coverage — 6- and 7-piece tables are categorically a server/API concern, never a
  bundle concern, for any foreseeable mobile bundle budget.
- **No documented, stable rate limit on the public API.** Lichess's own API-tips page (fetched
  2026-09-08) states generically: "due to a complex array of separate rate limiting factors that
  protect us from DDOS attacks, we aren't able to specify for each API exactly what limits you will
  hit and when, they are varied and ever changing," with the only concrete guidance being "if you
  receive a 429, wait a full minute." A forum thread on the tablebase endpoint specifically
  ("Does the web tablebase API throttle?") reinforces the recommendation: "if you really need that
  many requests you can download the tables and probe them locally instead" — i.e. the API is
  explicitly positioned as *not* meant for bulk/high-volume use.
- **The server code (`lila-tablebase`) is AGPL-3.0-or-later**, per its `COPYING` file. This does not
  restrict *calling* the public API (using someone else's AGPL web service over HTTP creates no
  obligation on the caller), but it does mean we could not fork/self-host a modified version of that
  exact server without triggering AGPL's network-use disclosure requirements. Not a blocker for us —
  we would either call the public endpoint or write our own probing code against Fathom (MIT-derived,
  see §9) — but worth being precise about which piece of this stack carries which licence.
- **The DTZ/WDL split means a "correct" implementation needs both files for 6/7-piece precision**,
  per the README — WDL alone is not sufficient once the 50-move rule and conversion distance matter
  at that depth, adding real complexity for any use case that goes past 5 men.

## 4. What we should copy conceptually

- **Separate "is this position solved" from "how do I show it to a human."** The API's `category`
  field (win/draw/loss/blessed-loss/cursed-win) plus `dtz`/`dtm` is exactly the right shape: a small,
  precise, machine-answerable core that a UI layer formats however it wants (e.g. "White wins in 9").
- **Recommend local probing over API hammering for anything beyond casual, single-position lookups**
  — Lichess's own guidance (§3) is the right default policy for us too: never build a feature that
  calls the public tablebase API in a loop.

## 5. What we can do better

- **We only need the 3–5-man tier.** At ~940 MB it is still too large to bundle into a Nimiq
  Mini-App WebView outright (see `what-we-can-ship.md` for the actual budget math), but it is small
  enough to consider as an optional, explicit, user-initiated download/cache (e.g. "download endgame
  trainer data, ~940 MB, Wi-Fi recommended") in a way the 150 GB / 17 TB tiers never could be — those
  remain API-only, forever, for any mobile product.
- We can pre-select a much smaller curated slice of the 3–5-man set for the endgames that actually
  matter pedagogically (K+P vs K, K+R vs K, K+Q vs K+P, the handful of famous theoretical draws/wins
  taught in every endgame course) rather than shipping or fetching the full ~940 MB indiscriminately
  — individual `.rtbw`/`.rtbz` files in the live directory listing range from tens of KB
  (`KBBvK.rtbw`, 57 KB) to several MB, so a hand-picked set of a few dozen files could plausibly land
  in the single-digit-MB range. This specific curated-subset size is our own design choice, not
  sourced from Lichess/Syzygy — **estimate, not measured**.

## 6. What is technically required

- To call the public API: nothing beyond `fetch()` and a FEN string — confirmed live, plain JSON
  over HTTPS, no auth, works from a browser context.
- To probe locally (offline mode): a Syzygy-format reader. Fathom (MIT-derived C library) is the
  standard building block; using it in a WebView app means compiling it to WASM (or porting the
  decode logic to TypeScript) — nontrivial but bounded engineering, not a licensing problem (see §9).
- To ship any subset of `.rtbw`/`.rtbz` files at all, a bundler/build step that selects the specific
  endgame files wanted and includes them as binary assets, plus the WASM/TS probing code to read
  them offline.

## 7. What could break

- **The public API has no SLA and no documented rate limit** — a feature built assuming "the
  tablebase API always answers instantly" has no contractual backing; build a timeout + graceful
  degradation (e.g. "can't verify this endgame right now") rather than assuming availability.
- **Fathom's licensing has forked over time** (original de Man code: "redistributed and/or modified
  without restrictions"; the actively maintained `jdart1` fork: MIT, replacing Cfish-derived board
  code with "simpler, MIT-licensed code") — pin to a specific fork/commit and re-read its `LICENSE`
  file directly before vendoring any of it; do not assume "Fathom" is a single, unambiguous licence
  across every fork. **NOT VERIFIED**: whether the exact commit we'd vendor carries any residual
  Cfish-derived code with different terms — check the specific file headers at integration time.
- **7-piece completion is relatively recent Lichess/community history** (their own blog post title,
  "7-piece Syzygy tablebases are complete," implies this wasn't always true) — do not assume older
  third-party tools, mirrors, or cached documentation reflect 7-piece availability; verify against
  current sources at build time, not against this document indefinitely.

## 8. What we can uniquely do because of Nimiq

- A Nimiq micropayment could gate a **one-time, larger, opt-in download** ("unlock the full 3–5-man
  endgame trainer for a small NIM payment, ~940 MB") in a way that's awkward for a typical free web
  app to justify UX-wise but fits naturally into a Mini App's existing pay-for-features pattern — the
  underlying tablebase files remain unrestricted (§9), so this monetizes packaging/curation/offline
  delivery, not the data itself, exactly parallel to the same seam identified for the puzzle/eval
  datasets in `lichess-db.md`.
- Nimiq's instant, feeless NIM rail also makes **micro-charging per "engine-quality endgame check"**
  (a tiny payment per API call, if we ever needed to offer a premium high-volume tablebase feature
  beyond what the free public API's implicit fair-use allows) mechanically cheap in a way it would
  not be over a traditional payment rail — **speculative product idea, not a verified requirement**;
  flagged here only because the licensing research surfaced the underlying constraint (§3's "don't
  hammer the free API") that would motivate it.

## 9. Licence and reuse verdict

**Generator source code** (`src/` in `syzygy1/tb`): mixed — **GPLv2-only** for the bulk of it (exact
quote, README, fetched verbatim 2026-09-08): "All other files in src/ are released under the GNU
Public License, version 2 (only)." Plus BSD-2-Clause (`lz4.c`/`lz4.h`, Yann Collet), a liberal
Google-authored licence (`city-c.c`/`city-c.h`/`citycrc.h`), and public domain
(`c11threads_win32.c`/`c11threads.h`). **Irrelevant to us** — we would never vendor the generator,
only consume already-generated table files or a probing library.

**The tablebase files themselves: unrestricted**, per the README's own "Terms of use" section,
quoted exactly:
> "All tablebase files generated using this generator may be freely redistributed. In fact, those
> files are free of copyright at least under US law (following Feist Publications, Inc., v. Rural
> Telephone Service Co., 499 U.S. 340 (1991)) and under EU law (following Football Dataco and
> Others v. Yahoo! UK Ltd and Others (C-604/10))."
Source: https://github.com/syzygy1/tb/blob/master/README.md, fetched raw 2026-09-08.

**`lila-tablebase` server code: AGPL-3.0-or-later** — governs anyone who forks/modifies/hosts that
specific server, not anyone who merely calls the public HTTP endpoint it exposes at
`tablebase.lichess.ovh`. Safe to call from our app.

**Fathom (probing library): MIT** for the actively-maintained fork, derived from code the original
author released "for unrestricted distribution and use" — verify the exact fork/commit's `LICENSE`
file directly before vendoring (see §7).

**Overall verdict**: this is the cleanest large-scale dataset in the whole research pass on pure
legal terms — data explicitly free of copyright, a working free API to call today, and an MIT
probing library if local/offline probing is ever wanted. The real constraint is not licence, it's
size: 3–5 men is the only tier remotely near mobile-bundle territory, and even that is an opt-in
download, not a default bundle item (see `what-we-can-ship.md`).
