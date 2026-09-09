# Scoresheet research

Thirty-odd sources, read rather than bookmarked. Every file answers the same nine questions
(`TEMPLATE.md`), so the notes can be compared instead of only read.

**The rule that governs all of it:** every factual claim carries a source URL, or is marked
**NOT VERIFIED**. Licences are recorded exactly as the source states them, because this repository
is MIT and most of the best chess code in the world is GPL or AGPL. A note that says "we could reuse
this" without an SPDX identifier next to it is not a note, it is a liability.

| Folder | Subject |
|---|---|
| `00-current/` | What Scoresheet is today — the honest inventory everything else is measured against |
| `01-platforms/` | Lichess and Chess.com as products, and lila as an architecture |
| `02-engine/` | Stockfish, Fishtest, NNUE training, Lc0, Maia, Chessformer, human-like bots |
| `03-analysis/` | Game review, accuracy scoring, rating systems |
| `04-puzzles/` | Puzzle selection, personalisation, own-blunder training |
| `05-fair-play/` | Cheat detection at Lichess and Chess.com, and the design we should build |
| `06-tournaments/` | FIDE Swiss, Arena, pairing implementations, and our format |
| `07-data/` | The Lichess open database, opening names, the opening explorer, tablebases |
| `08-nimiq/` | The provider surface, Albatross staking, payments, framework gaps |
| `09-ux/` | Board interaction, mobile, navigation, onboarding |
| `10-ideas/` | Chess for money as an existing market, and what we do with all of the above |

## What this is for

Not a reading list. The output is `../PLAN.md`: research that does not change what gets built, or
what gets deliberately refused, was wasted. Several notes below end in "do not build this" — those
are the ones that earned their keep.
