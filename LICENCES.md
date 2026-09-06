# What AGPL and GPL actually allow — and what we may take

**Why this file exists.** The competition requires the submission to be **MIT**, and nearly the whole
chess ecosystem is GPL or AGPL. Getting this wrong is not a style problem: an MIT repository
containing GPL code is a licence violation, and the fix late in a build is a rewrite.

*Not legal advice.* This is a reading of the licence texts and of settled doctrine, written so the
build does not have to guess. Anything load-bearing should be checked by someone qualified.

Licences below were read from each repository's own metadata on **6 September 2026**.

---

## 1. The three licences, in one line each

| | What it demands |
|---|---|
| **MIT / BSD / ISC / Apache-2.0** | Keep the copyright notice. Do anything else, including shipping it inside a closed or differently-licensed product. Apache additionally asks that modified files be marked and its `NOTICE` be carried. |
| **GPL-3.0** | If you **distribute** a work based on it, that whole work must also be GPL-3.0, with source offered. |
| **AGPL-3.0** | Everything GPL demands, **plus §13**: if users interact with a modified version **over a network**, you must offer them its source — even though you never "distributed" anything. |

**A "work based on" it includes translation.** The GNU FAQ is explicit that translating a program
into another language is a kind of modification, so porting Lichess's Scala or TypeScript into our
TypeScript produces a derivative work even if every line is retyped by hand.

---

## 2. The trap specific to a web app

**Sending JavaScript to a browser is distribution.** A GPL library in the client bundle is GPL code
conveyed to every visitor, which makes the bundle a GPL work. This is why `chessground` — Lichess's
board UI, GPL-3.0 — cannot appear in an MIT submission, even though it is only "front-end".

AGPL goes further and catches the server too: run modified AGPL code behind an HTTP API and §13
obliges you to offer its source to the people using it.

**Neither can be escaped by keeping the repository private.** The obligation attaches to conveying
the work or serving it, not to publishing the source.

---

## 3. What we may take from an AGPL or GPL project anyway

Copyright protects **expression**, never function. So from *any* project, whatever its licence:

- **Ideas, procedures, processes, systems and methods of operation** — excluded from copyright by
  17 U.S.C. §102(b) and by Article 1.2 of the EU Software Directive.
- **API shapes.** *Google v. Oracle* (2021, 6–2) held that reimplementing an interface so people can
  use their existing skills was fair use.
- **Names where only a few sensible ones exist** — the *merger doctrine*. `white / black / draw` and
  `check / checkmate / stalemate` are facts about chess, not Lichess's prose.
- **Behaviour observed from the running product**, and anything in its public documentation.
- **Rules of the game.** Chess itself is not copyrightable, and neither is Elo.

So we may play on lichess.org, read how its board feels, note that a premove is cancelled on an
unexpected reply, write that down, and build our own. We may not open `chessground` and retype it.

**The protocol for doing that safely is already written**, for chit, in
`../REFERENCE_APPS_LIFT_PLAN.md` §0 — three tiers, and a clean-room reader/writer split where one
context reads the source and writes a plain-English spec, and a second context that has never opened
the source implements from the spec alone. Reuse it rather than inventing a new one.

---

## 4. The actual chess landscape, by what it permits

### Usable — permissive

| Repo | ★ | Licence | What it gives us |
|---|---|---|---|
| `jhlywa/chess.js` | 4,396 | **BSD-2-Clause** | Move generation, validation, FEN, PGN, check and mate detection. 165k downloads a week. **The rules engine.** |
| `Clariity/react-chessboard` | 541 | **MIT** | The board component, 42k downloads a week |
| `lichess-org/scalachess` | 782 | **MIT** | Lichess's *own* core chess logic. See §5 |
| `oakmac/chessboardjs` | 2,132 | **MIT** | Classic board — but jQuery, and untouched since April 2024 |

### Not usable in an MIT submission

| Repo | ★ | Licence | Why it is out |
|---|---|---|---|
| `lichess-org/lila` | 18,708 | AGPL-3.0 | The entire Lichess server |
| `official-stockfish/Stockfish` | 16,503 | GPL-3.0 | No linking exception |
| `nmrugg/stockfish.js` | 1,195 | GPL-3.0 | The browser build — would land in our bundle |
| `lichess-org/chessground` | 1,363 | GPL-3.0 | Their board UI |
| `LeelaChessZero/lc0` | 3,201 | GPL-3.0 | |
| `niklasf/python-chess` | 2,872 | GPL-3.0 | |
| `code100x/chess` | 1,717 | **none at all** | No licence means all rights reserved — the same trap that removed `nimiq-css` from chit. Read it; take nothing. |

---

## 5. The useful surprise: Lichess splits its own licences

Lichess publishes the **server** as AGPL and its **core chess logic** as MIT.
`lichess-org/scalachess` — 782★, MIT, pushed 5 Sep 2026 — is the move generation, position handling
and game rules that run lichess.org, and it is permissively licensed.

It is Scala, so it is not a drop-in for a TypeScript app. What it is: **a correct reference to check
our behaviour against**, and one we are free to read closely, port from, and credit — none of the
clean-room ceremony applies to MIT code. Their `lila-db-seed`, `scalalib` and `swiss-maker` are MIT
too; everything else in the organisation is AGPL.

---

## 6. The engine question, decided

**No engine ships in the app.** Every strong one — Stockfish, Leela, Fairy-Stockfish — is GPL, and
the browser build would land in an MIT bundle.

Three ways to live with that:

1. **Ship no engine.** Humans do the analysis. This is the concept anyway: the coaching in
   `BRIEF.md` §3 is a stronger player being paid, not a machine. **Recommended.**
2. **Run Stockfish as a separate service** we call over HTTP, publish that service's source under
   GPL, and keep it out of the app's repository and bundle. Legal, but it is a second deployment,
   a second licence and a second thing to maintain.
3. **Call somebody else's hosted analysis.** No licence obligation, but a dependency on an API and
   on its terms.

Anti-cheat does not need an engine to start. Accuracy that is too *even* across easy and hard
positions is a stronger signal than raw accuracy, and can be computed from move times and outcomes
long before any evaluation is involved.

---

## 7. Rules for this build

1. **Every dependency's licence is checked before it is installed**, from the package's own metadata
   — not from a badge, and not from memory. `nimiq-css` published none at all and reached chit's
   production bundle before anyone looked.
2. **Permissive only in `package.json`.** MIT, BSD, ISC, Apache-2.0.
3. **A `NOTICES.md` at the repository root**, one line per lifted file: origin, commit, path,
   licence, what changed. Judges read the repository.
4. **GPL and AGPL projects are read for behaviour, never for code.** If more than a name or a state
   list is wanted, use the clean-room protocol in `../REFERENCE_APPS_LIFT_PLAN.md` §0 and keep the
   written spec in the repository as the record.
5. **No licence at all means all rights reserved.** Treat an absent licence as more restrictive than
   AGPL, not less.
