# Chess correctness — perft, differential testing, fuzzing, and the rules edge cases

Research date: 2026-09-08. Scope: how the chess world actually verifies a move generator and a
rules engine are correct, checked against what `packages/core/test/position.test.ts` and
`packages/core/test/rules.test.ts` already do — 526 unit tests, run by `npm run counts`
(`scripts/counts.mjs`).

## 1. What they do

**Perft** ("performance test") counts every leaf of the legal-move tree to a fixed depth from a
given position. It is the universal correctness gate for move generators — every serious engine
(Stockfish included) runs it, and the standard results are published and independently reproduced
by decades of implementations. Source: https://www.chessprogramming.org/Perft_Results.

The Chess Programming Wiki's six standard positions, chosen because each breaks a specific class of
naive generator, with their exact published node counts:

| Position | FEN | Published depths (CPW) |
|---|---|---|
| Starting position | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` | d1=20, d2=400, d3=8,902, d4=197,281, d5=4,865,609, d6=119,060,324, d7=3,195,901,860 |
| Kiwipete | `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1` | d1=48, d2=2,039, d3=97,862, d4=4,085,603, d5=193,690,690 |
| Position 3 | `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1` | d1=14, d2=191, d3=2,812, d4=43,238, d5=674,624, d6=11,030,083, d7=178,633,661 |
| Position 4 | `r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1` | d1=6, d2=264, d3=9,467, d4=422,333, d5=15,833,292 |
| Position 5 | `rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8` | d1=44, d2=1,486, d3=62,379, d4=2,103,487, d5=89,941,194 |
| Position 6 | `r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10` | d1=46, d2=2,079, d3=89,890, d4=3,894,594, d5=164,075,551 |

Source: https://www.chessprogramming.org/Perft_Results, which also publishes the starting position
through depth 9 (d8=84,998,978,956, d9=2,439,530,234,167). No further named "Position 7/8/9" exists
on that page — these six ARE the complete standard set every major engine tests against; there is no
separate talkchess-forum set beyond them (searched, none found — **NOT VERIFIED as exhaustive**, but
no evidence of a seventh standard position was found).

**Differential testing** runs an independent, separately-implemented move generator against the one
under test — either over the same random game (comparing the legal-move set at every ply) or piped
to an external UCI engine's own `go perft <n>` command and diffing the reported node count. Source:
UCI protocol spec, https://backscattering.de/chess/uci/, and Stockfish's own documented `perft`
command, https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html.

**Fuzzing / property-based testing** generates many structurally-plausible-but-broken inputs (FEN
strings, PGN text) and asserts a parser never crashes or hangs, and either round-trips a valid input
exactly or rejects an invalid one cleanly. The standard Node/TypeScript tool for this is **fast-check**
(`dubzzz/fast-check`), a QuickCheck-style library with automatic shrinking, 10M+ weekly downloads,
used by Jest and `io-ts`. Source: https://github.com/dubzzz/fast-check.

## 2. Why it works

Perft counts the entire tree exactly, so a wrong node count means a wrong number of legal moves
somewhere in that tree — it cannot be papered over by a plausible-looking single move. Its one real
blind spot is two independent bugs that cancel to the same total, which is precisely why this
project already pairs it with **differential testing against `chess.js`** (BSD-2-Clause) "over
thousands of random positions" (`packages/core/test/position.test.ts`, header comment) — a bug that
survives perft has to also produce the exact same wrong move set as an entirely different
implementation, which is a much harder coincidence.

`perftDivide` — already implemented in `packages/core/src/position.ts` and used on test failure —
turns "the count is off by 137" into "here is the one first move responsible," because it reports
the subtree count per root move rather than only the total. This is the same technique every serious
engine uses to debug a perft failure. Source (general technique):
https://www.chessprogramming.org/Perft_Results#Divide.

Property-based fuzzing works because hand-written test cases only cover the malformed inputs a human
thought of. A generator that mutates valid FENs/PGNs structurally (wrong piece counts, missing
fields, invalid en passant squares, truncated move lists) explores the space a human test author
does not, and fast-check's shrinking turns any failure into a minimal reproducing case automatically.

## 3. What they do badly

No official, single published corpus of "nasty" FEN/PGN test inputs exists anywhere that this
research could find (**NOT VERIFIED as nonexistent — only this search pass found none**). What
exists instead is scattered: individual GitHub issues against `chess.js` covering specific malformed
cases one at a time (missing king → `chess.js` throws "Invalid FEN: missing black king"; the
`SetUp`/`FEN` PGN-tag interaction losing headers, issue #129; lenient "0-0" vs strict "O-O" castling
notation from SCID-style PGNs). Source: https://github.com/jhlywa/chess.js (issues #129, #442, #14,
#87, #153) and https://jhlywa.github.io/chess.js/. Anyone wanting fuzz coverage has to build the
generator themselves — there is no drop-in adversarial-input dataset to import.

Perft alone says nothing about *parsing* correctness (FEN/PGN round-trips) or about the higher-level
game-termination rules (threefold, fifty-move, insufficient material) — it only proves the move
generator itself is right. A project that stops at perft and differential testing, as this repo
currently does for move generation, still needs a separate correctness story for parsers and for
game-ending logic (see §5).

python-chess, the other well-known independent chess implementation with a large and mature test
suite, is **GPL-3.0-or-later** (confirmed at
https://github.com/niklasf/python-chess/blob/master/LICENSE.txt), which rules it out as a dependency
in an MIT project and restricts its use to an unshipped, offline oracle process — never vendored,
imported, or ported from (see §9).

## 4. What we should copy conceptually

- The full six-position perft table, exactly as published, with a source citation next to it — the
  repo already does this (`position.test.ts` lines ~29–55) and it should stay the standard against
  which any future move-generator change is checked.
- `perftDivide`-on-failure, already built — this is precisely what every engine author reaches for
  when a perft count disagrees, and it is the right thing to keep printing rather than only the
  final number.
- Differential testing against an independent, permissively-licensed implementation over random
  play, already built against `chess.js`. The UCI-pipe pattern (spawn an external engine, send
  `position fen <FEN>` then `go perft <n>`, diff the reported count) is the same idea applied to a
  *second*, non-JS implementation, and is worth adding precisely because it is a genuinely
  independent codebase rather than a second JS library that might share a subtle assumption with
  this one.

## 5. What we can do better

- **Extend perft depth where it is cheap.** Per §6's timing math, Position 6 depth 4 (3,894,594
  nodes) and Position 4 depth 5 (15,833,292 nodes) are both well inside a sub-second budget on this
  engine's own measured floor, and are not currently tested (the repo stops at Position 6 depth 3 and
  Position 4 depth 4). Adding them costs nothing and closes the gap to the fullest CPW-published set
  for those two positions.
- **A second, independent differential oracle beyond `chess.js`.** Every current differential check
  compares this engine against exactly one other JS implementation. Piping the same random games (or
  the same perft positions) to `python-chess` as a subprocess — offline, in CI only, never shipped —
  gives a genuinely independent second opinion from a codebase with no shared lineage or assumptions
  with either this project or `chess.js`.
- **Property-based fuzzing of the FEN and PGN parsers**, which does not exist in this repo today
  (confirmed: no `fast-check` or fuzzing dependency in `package.json` at any workspace level). The
  repo's existing parser tests (`pgn.test.ts`: "nonsense is refused with the parser's own words, not
  ours"; "a quote or backslash in a tag cannot break the file") are strong hand-written cases, but a
  fast-check arbitrary that mutates valid FEN/PGN structurally would explore inputs nobody thought to
  write by hand, and would run inside the same `node --test` harness with no new test runner needed.
- **A slow/nightly perft tier**, separate from the fast one the default gate runs, so the deepest
  feasible depths (starting position d6, Kiwipete d5, Position 3 d6–d7, Position 5 d5, Position 6
  d5) can be checked periodically without slowing down every `npm run check`.

## 6. What is technically required

- **Timing feasibility.** The repo's own test asserts a floor of 500,000 nodes/sec and reports the
  actual measured rate (`position.test.ts`, "and it is fast enough to be worth having"); its own
  doc comments claim ~6.1M nodes/sec in practice (`packages/core/src/search.ts` header). At the
  6.1M/s figure, starting-position depth 6 (119,060,324 nodes) is about 20 seconds; at the enforced
  500k/s floor it is about 4 minutes — too slow to add to the default fast gate unconditionally, but
  entirely reasonable as an opt-in slower script (`node scripts/perft-deep.mjs`, say) run less often
  than every commit. Kiwipete depth 5 (193,690,690 nodes) and Position 3 depth 7 (178,633,661 nodes)
  are in the same ballpark. Anything at or above starting-position depth 7 (3.2 billion nodes) is not
  realistic to run routinely in either tier.
- **`fast-check`, MIT-licensed**, as a new devDependency — no build step is needed since this repo
  already runs TypeScript directly via `node --test --experimental-strip-types`
  (`packages/core/package.json`), and fast-check is a pure runtime library that plugs into any test
  function.
- **A `child_process.spawn` harness** to pipe FEN + `go perft <n>` to an external process (a UCI
  engine, or a small Python wrapper around `python-chess`) and parse its stdout for the reported node
  count — a script-level concern, not a dependency, and one that must never run as part of the
  shipped app.

## 7. What could break

- **Timing-based assertions are inherently CI-machine-dependent.** The existing `>500,000 nodes/sec`
  floor could flake on a slow or heavily loaded CI runner; adding a deeper perft tier with its own
  timing assumptions inherits the same risk and should assert node counts only, never wall-clock
  time, for anything beyond the existing speed-floor test.
- **A deeper default-gate perft would slow down every run**, which conflicts with this project's own
  stated design goal in `scripts/counts.mjs` of running the test suite exactly once and keeping it
  fast enough to run on every commit. This is why §5 and §6 recommend a separate, slower tier rather
  than simply raising every existing depth by one.
- **A "two wrongs cancel" bug that also happens to affect `chess.js` identically** would slip past
  today's differential testing even though it is vanishingly unlikely between two unrelated codebases
  — this is exactly the scenario a second, structurally unrelated oracle (python-chess, or a UCI
  engine) is insurance against.
- **A fuzzer that finds a real, previously-unknown parser crash close to a deadline** costs real time
  to triage and fix — worth budgeting for once fast-check fuzzing is added, rather than treating a
  fuzz-only failure as low priority.

## 8. What we can uniquely do because of Nimiq

Every game this product plays that gets signed becomes a **permanent, publicly verifiable record**
(`SPEC.md` Part F) — a move-generator bug that lets an illegal move into a signed scoresheet is not
a bug that can be quietly patched later; the wrong record is on chain forever, and the recompute page
(`SPEC.md` F5) would faithfully reproduce the error rather than catch it. That raises the real stakes
of perft and differential coverage well past "avoid an embarrassing bug" and into "avoid an unfixable
public record" — a framing worth stating explicitly in this project's own test-suite documentation,
since it is the argument for why this area gets more scrutiny here than in a typical hobby chess
app.

The project's own "you do not have to trust us, check it" ethos (`scripts/counts.mjs` header) extends
naturally to correctness testing itself: the exact perft table, its source, and the differential-test
methodology could be published on the same public surface as the rating recompute page, so a
stranger auditing the signed record can also see exactly how the move generator that produced it was
verified — something no closed competitor (Chess.com, Lichess's proprietary parts) does.

## 9. Licence and reuse verdict

- **`chess.js` — BSD-2-Clause, v1.4.0.** Confirmed in this repo's own `LICENCES.md` and
  `NOTICES.md`, and in the package's own `package.json` (`"license": "BSD-2-Clause"`). Already
  depended on directly for differential testing; no licence concern using it as a runtime
  devDependency or even a shipped dependency.
- **`python-chess` — GPL-3.0-or-later.** Confirmed at
  https://github.com/niklasf/python-chess/blob/master/LICENSE.txt. Already listed in this project's
  own `LICENCES.md` as "not usable in an MIT submission." Usable **only** as an external, unshipped,
  offline subprocess oracle invoked over a pipe during CI/dev — never vendored, imported, or ported
  from — consistent with the FSF's own guidance that piping to a separate process is "mere
  aggregation," not a combined work (GPL FAQ, https://www.gnu.org/licenses/gpl-faq.html; see
  `engine-strength.md` §9 for the full citation of this reasoning).
- **`fast-check` — MIT.** Confirmed at https://github.com/dubzzz/fast-check. Free to add directly as
  a devDependency with no separation requirement.
- **Chess Programming Wiki perft numbers and FIDE Laws of Chess article text** are published facts
  and rules, not copyrightable expression (17 U.S.C. §102(b), and this repo's own `LICENCES.md` §3
  makes the same argument for reusing ideas/procedures from any source regardless of its licence).
  Citing article numbers and hardcoding the published node counts as literals, with a source comment,
  carries no licence obligation — exactly the pattern the repo's existing perft table already
  follows.
