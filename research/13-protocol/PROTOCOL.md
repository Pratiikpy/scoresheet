# The Scoresheet Protocol

**Status of this document.** This is a description of a shipped, running system, not a proposal.
Every normative statement in this document and in `RECORDS.md` and `RATING.md` is backed by a file
and line number in this repository, current as of 2026-09-08. `PORTABLE-RECORD.md`, `TOURNAMENT.md`
and `FAIR-PLAY.md` are marked **DRAFT** in their own headings because no code in this repository
implements them; they specify a design, not a running system, and MUST NOT be read as describing
current behaviour.

## 1. Introduction

The Scoresheet Protocol is a small set of canonical, line-oriented text formats for chess game and
puzzle results, each co-signed by the parties who produced it, from which a rating can be derived by
independent recomputation with no server and no help from the issuing application. It exists so that
"a rating nobody can revoke" is a property of the bytes, not a claim about who operates the app that
happened to display them.

Three properties hold across every record type this protocol defines, and every rule in `RECORDS.md`
serves one of them (`packages/core/src/scoresheet.ts:9-31`):

1. **One text, one meaning.** Two byte sequences that a human would read as identical must not both
   verify — otherwise a signature stops proving *which* was signed. Enforced by a fixed field order,
   a newline as the only separator, no field permitted to contain one, and a parser that
   re-serialises its own input and rejects anything not byte-identical to what it produced.
2. **One signature proves nothing.** Every record type in this protocol requires signatures from
   every named party — never one signature "standing in" for a mutual claim.
3. **The order is a property of the signatures.** Where a derived number is path-dependent (ratings
   are), the ordering key is inside the signed text and independently checkable — a Nimiq block
   height, never a timestamp asserted by a server.

This document, `RECORDS.md`, and `RATING.md` describe the two record types and the two derivation
functions that exist in code today: the **Scoresheet** (one finished game, signed by both players)
and the **Puzzle Card** (one run of solo puzzles, signed by the solver and a witness), and the
**Game Rating** and **Puzzle Rating** functions computed from ordered sets of them.
`PORTABLE-RECORD.md`, `TOURNAMENT.md` and `FAIR-PLAY.md` specify designs for a multi-record bundle
format, a tournament record, and a fair-play evidence record — none of which exist in code — so that
a design conversation and an implementation description are never confused for one another.

## 2. Requirements language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "MAY", and "OPTIONAL" in this document and the rest of the `research/13-protocol/`
document set are to be interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). In short: **MUST**/**MUST NOT** are absolute;
**SHOULD**/**SHOULD NOT** mean an implementation may deviate only for a reason it has understood and
weighed; **MAY** means a real option that a conformant implementation can take or leave.

Where this document describes what shipped code *does*, the normative keyword records what a
**second, independent implementation** would have to do to interoperate — not a request to the
existing code, which already does it.

## 3. Terminology

| Term | Meaning |
|---|---|
| **Record** | One canonical, signed text produced by this protocol: a Scoresheet or a Puzzle Card |
| **Canonical text** | The exact byte sequence a record's serialisation function produces; the only bytes any signature in this protocol is ever computed over |
| **Player** | A Nimiq address that is `white` or `black` on a Scoresheet |
| **Solver** | The Nimiq address that played a run of puzzles and is named `solver` on a Puzzle Card |
| **Witness** | The Nimiq address that served the puzzles, saw the answers arrive, and co-signs the Puzzle Card as `witness` — see `packages/core/src/puzzlecard.ts:20-30` for why this is not the issuing application acting as an authority |
| **Chain** | `main` or `test` — the Nimiq network the record is bound to; see §7 for why this is signed |
| **Digest** | The 32-byte SHA-256 value a Nimiq wallet actually signs, built from a record's canonical text by `nimiqSignedMessageDigest` (`RECORDS.md` §4) |
| **Verifier** | Any party checking a record's signatures and, optionally, a derived rating — the recompute page in `apps/web` is one verifier; a stranger's own script is another, and this protocol makes no distinction between them |

## 4. Protocol layers

The protocol is layered so that each layer depends only on the one below it, and a verifier can stop
at whichever layer answers the question being asked.

```
Layer 3   Portable Record (bundle+Merkle) · Tournament record · Fair-play record   [ DRAFT — unshipped ]
              |
Layer 2   Rating derivation — pure functions over an ordered set of Layer-1 records  (RATING.md)
              |
Layer 1   Canonical record formats — Scoresheet, Puzzle Card                        (RECORDS.md)
              |
Layer 0   Signature primitive — Ed25519 over a Nimiq-wallet message digest          (RECORDS.md §4)
```

- **Layer 0** is not specific to chess at all: it is the digest construction a Nimiq wallet's
  `sign()` actually produces (`packages/core/src/signature.ts:212-233`,
  `packages/verify/src/index.ts:58-67`, `apps/web/src/verify-browser.ts:58-68` — three independent
  implementations of the same construction, one per package that needs it, deliberately not shared
  as a single dependency so that a bug in one does not silently propagate to the others; pinned
  against Nimiq Keyguard's own published test vectors in
  `packages/verify/test/keyguard-vectors.test.ts`).
- **Layer 1** is `RECORDS.md` in full: the exact serialisation of a Scoresheet and a Puzzle Card.
- **Layer 2** is `RATING.md` in full: `computeRatings` (game rating) and `computePuzzleRating`
  (puzzle rating), both pure functions of an ordered array of Layer-1 records and nothing else.
- **Layer 3** is unshipped. `PORTABLE-RECORD.md` specifies a multi-record export bundle and a Merkle
  completeness commitment over it; `TOURNAMENT.md` and `FAIR-PLAY.md` specify record formats for
  tournament standings and fair-play verdicts. None of the three has a line of implementing code in
  this repository as of 2026-09-08 (verified by repository-wide search for `merkle`, `bundle`,
  `RatingBundle`, `tournament`, and `fair` under `packages/` and `apps/`, excluding build output —
  the only hits are an unrelated Nimiq-internal transaction-proof comment and generated `dist/`
  source maps).

## 5. Version markers

Every record type carries its own version marker as the first line of its canonical text. There is
no single protocol-wide version number — each record type versions independently, because a change
to the Puzzle Card format has no reason to force every already-signed Scoresheet into a new epoch.

| Record type | Version marker (exact string) | Source |
|---|---|---|
| Scoresheet | `chess/1 scoresheet` | `packages/core/src/scoresheet.ts:38` |
| Puzzle Card | `chess/1 puzzle card` | `packages/core/src/puzzlecard.ts:69` |

## 6. Extension and versioning rules

1. A parser MUST reject a record whose first line does not match its record type's version marker
   **exactly** — never a prefix match, never a best-effort fallback. This is enforced today by
   `parseScoresheet` (`scoresheet.ts:206-208`) and `parsePuzzleCard` (`puzzlecard.ts:222-224`), each
   throwing on any other value.
2. Any change to a record type's field set, field order, field encoding, or the meaning of an
   existing field MUST be shipped as a new version marker, never as a silent change under the
   existing one. This is stated as design intent at the point each marker is defined
   (`scoresheet.ts:37`: *"Bumping it is a new format, never a silent change to this one"*;
   `puzzlecard.ts:68`, identical wording) and is exactly what makes an already-signed record
   permanently interpretable: a verifier reading a `chess/1 scoresheet` five years from now MUST be
   able to assume line 6 is still `result` and not something a later change repurposed.
3. A new record type SHOULD adopt the naming convention `chess/<major> <name>` (lowercase, one
   space before the name), matching the two existing markers, so that a generic parser can dispatch
   on the first line alone before knowing which specific type it is reading.
4. A record type's version marker MAY be bumped past `1` in the future; nothing in the shipped code
   defines what a `chess/2 scoresheet` would contain, and this document does not speculate on it.
5. This document set itself (`PROTOCOL.md`, `RECORDS.md`, `RATING.md`, and the rest) is not a
   record type and carries no version marker of its own; it is corrected in place as the code it
   describes changes, and its accuracy is only as good as its last read of the source — restated
   plainly in §1.

## 7. Why `chain` and `rated` are inside the signed bytes

Two structural decisions recur across both record types and are worth stating once, at the protocol
level, rather than repeating per record:

- **`chain` MUST be part of the signed text of any record type this protocol defines**, because a
  Nimiq wallet's `sign()` call has no domain separation of its own: a signature produced on `test`
  verifies byte-for-byte as a signature on `main` unless the record itself says which network it is
  for (`scoresheet.ts:23-25`, `puzzlecard.ts:51`). A verifier that checks a record against an
  `expectedChain` and rejects a mismatch (`packages/verify/src/index.ts:169-178`) is applying this
  rule, not inventing a new one.
- **Any boolean that changes how a record is treated after the fact (e.g. Scoresheet's `rated`) MUST
  be part of the signed text**, so that neither party — nor whoever stores the record — can relabel
  it later. `scoresheet.ts:26-27` states the reasoning directly; `RECORDS.md` §2 gives the field's
  exact position and encoding.

## 8. Conformance

An implementation claiming conformance to Layer 1 (record parsing) for a given record type MUST:

- Accept only the record type's exact version marker on line one (§6.1).
- Reject any input that is not byte-identical to what re-serialising its own parsed fields would
  produce — the "parse, re-serialise, compare" rule specified field-by-field in `RECORDS.md`.
- Reject every malformed-field case enumerated in `RECORDS.md` and demonstrated in
  `TEST-VECTORS.md` §6, not merely the ones convenient to check.

An implementation claiming conformance to Layer 0 (signature verification) MUST implement the exact
digest construction in `RECORDS.md` §4, using the UTF-8 **byte** length of the message, not a
UTF-16 code-unit count or any other character count — the single most consequential implementation
trap in this protocol, documented at length in `packages/verify/src/index.ts:8-20` and pinned by
`TEST-VECTORS.md` §7.

An implementation claiming conformance to Layer 2 (rating derivation) for a given rating function
MUST reproduce `RATING.md`'s ordering rule and arithmetic exactly, including its specific rounding
function — `RATING.md` §4 states, and does not smooth over, that the two rating functions shipped
today use two *different* rounding rules, and a conformant reimplementation of each MUST match the
one that function actually uses.

Layer 3 has no conformance class: it is DRAFT, and `PORTABLE-RECORD.md`, `TOURNAMENT.md` and
`FAIR-PLAY.md` say so in their own status lines.

## 9. Security considerations

This section is a pointer, not a restatement — the substantive analysis lives where the relevant
mechanism is specified:

- Signature and digest construction, and the byte-length trap: `RECORDS.md` §4.
- Both-parties-must-sign, and why one signature is not a weaker version of two:
  `packages/verify/src/index.ts:142-144` (*"deliberately not an 'at least one is valid' check"*).
- Rating-farming resistance (diminishing K per repeated opponent, provisional status, minimum move
  count): `RATING.md` §5, restating `SPEC.md` Part F4 against the actual constants in
  `packages/core/src/elo.ts`.
- What a verified record does, and explicitly does *not*, establish about the humans behind it:
  `RATING.md` §6 and, for the unshipped bundle design, `PORTABLE-RECORD.md` §6.

## 10. Document set

| File | Covers | Status |
|---|---|---|
| `PROTOCOL.md` (this file) | Layers, terminology, versioning, conformance | Shipped |
| `RECORDS.md` | Scoresheet and Puzzle Card, byte-exact | Shipped |
| `RATING.md` | Game Rating and Puzzle Rating functions | Shipped |
| `PORTABLE-RECORD.md` | Multi-record bundle + Merkle completeness proof | **DRAFT — unshipped** |
| `TOURNAMENT.md` | Tournament standings record | **DRAFT — unshipped** |
| `FAIR-PLAY.md` | Fair-play signal and verdict record | **DRAFT — unshipped** |
| `TEST-VECTORS.md` | What a conformance test suite must contain, plus worked examples | Shipped concepts, independently recomputed |

`SPEC.md` Part F is the product specification's own account of the signed rating and predates this
document set; where it and the code disagree, `RECORDS.md` §6 and `RATING.md` §4 say so explicitly
and name which one this document set follows.
