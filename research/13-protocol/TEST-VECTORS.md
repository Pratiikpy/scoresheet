# Test vectors

This document specifies what a conformance test-vector suite for the Scoresheet Protocol MUST
contain, and provides one fully worked example of each kind — computed independently of this
repository's own test suite, using Node's built-in `crypto` module plus the vendored `@noble/hashes`
library, so a match against this repository's own tests (`packages/core/test/*.test.ts`,
`packages/verify/test/*.test.ts`) is real cross-implementation evidence, not a comparison of one
implementation against itself. Every value below was generated on 2026-09-08 and is reproducible: the
generation script re-implements exactly the algorithms cited in `RECORDS.md` and `RATING.md`, with a
line-by-line citation at each step.

## 1. What the suite MUST contain

A conformance suite for this protocol MUST include, at minimum, five categories:

1. **Valid records that round-trip.** For each record type: a record built from a value object,
   canonicalised, parsed back, and re-canonicalised, asserting the final text equals the first
   (`RECORDS.md` §1 point 4). §2 and §3 below are worked instances.
2. **Records that MUST be rejected, and why.** Every validation rule in `RECORDS.md` §2.5 and §3.4
   needs at least one input that violates only that rule, so a suite can localise a regression to the
   specific check that stopped catching it. §6 below is the catalogue, drawn from this repository's
   own `packages/core/test/scoresheet.test.ts` and `packages/core/test/puzzlecard.test.ts`.
3. **Encoding edge cases**, independent of any one field's business rule: a non-canonical integer
   representation (leading zero, sign, decimal point, surrounding whitespace — `RECORDS.md` §7); a
   base64url string containing characters outside the RFC 4648 §5 alphabet; an address with display
   spacing or mixed case that must normalise identically to its canonical form; and the UTF-8-byte-
   length trap in the signed-message digest (§7 below).
4. **Signature vectors independent of this repository's own signing code** — at minimum, the two
   published Nimiq Keyguard vectors this repository already pins against
   (`packages/verify/test/keyguard-vectors.test.ts`), restated in §7, plus a real Ed25519
   keypair/signature/verification round trip such as §2 and §3 below.
5. **A worked rating computation**, checkable by hand or by an independent script, for each rating
   function `RATING.md` specifies. §4 and §5 below are worked instances for Game Rating and Puzzle
   Rating respectively.

## 2. Worked example — Scoresheet

Two real Ed25519 keypairs, generated fresh for this document (`crypto.generateKeyPairSync('ed25519')`,
Node.js v22.17.0), with their Nimiq addresses derived by the exact algorithm in `RECORDS.md` §5 (using
`@noble/hashes`'s `blake2b`, the same library `apps/web/src/verify-browser.ts` uses — not Node's own
`blake2b512`, which is the wrong output length for this derivation and was used only as a length
sanity-check during generation, never for the final address bytes).

```
white publicKeyHex : 8042dac7351dc81c68cc6830f67ef3e4fb176e9a4860421355eda7d13f8e155d
white address       : NQ79U2KYPSCBQDQTA1N138XLR8V8B3CF1QM6

black publicKeyHex : 6f5a9bb3ccd0bc0000bedaa797fc5c1e258880eec0ce9ce17ea470510d9aa484
black address       : NQ119BQ9YKHDHTR0PRBGL7XB5B3S5A8X60RB
```

The value object (matching `packages/core/test/scoresheet.test.ts`'s own fixture shape, with the
addresses replaced by the two real ones above so the whole chain — key, address, signature — is
self-consistent end to end):

```
chain        = test
gameId       = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
result       = 0-1
termination  = checkmate
moveCount    = 3
finalFen     = rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3
endedAtBlock = 4100000
moves        = ["f3", "e5", "g4", "Qh4#"]
rated        = true
```

`movesHash = hashMoves(moves)` (`RECORDS.md` §2.4) — SHA-256 of the UTF-8 bytes of `"f3 e5 g4 Qh4#"`,
base64url-encoded:

```
movesHash = 5PYs7TlDwZTibgSarr_tLgWc1VqICmHbu67JAyd9bpE
```

The canonical text (`canonicaliseScoresheet`, `RECORDS.md` §2.1), shown with explicit `\n` and as an
exact JSON string so no whitespace is ambiguous:

```json
"chess/1 scoresheet\ntest\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nNQ79U2KYPSCBQDQTA1N138XLR8V8B3CF1QM6\nNQ119BQ9YKHDHTR0PRBGL7XB5B3S5A8X60RB\n0-1\ncheckmate\n3\nrnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3\n4100000\n5PYs7TlDwZTibgSarr_tLgWc1VqICmHbu67JAyd9bpE\nrated\n"
```

267 UTF-8 bytes. This text MUST parse (`parseScoresheet`) and re-canonicalise to itself unchanged.

The digest (`RECORDS.md` §4.2 — `SHA-256(prefix ‖ decimal(byteLength) ‖ message)`):

```
digest (hex) = f7db2866677e609d55578ebe840a92fc4009dddfa98a0855305613cdddc371b3
```

Both parties' real Ed25519 signatures over that digest:

```
white signatureHex = 7b01bd86afded02022123d7b67c6d73fd22b372838ef8a23122d264b648dd8b2993a6e7b30321bf67f25b6f768e5f77d365db0bddad5050673cf01f43bc24a0e
black signatureHex = 32724e11451a8775321c96ba7be7d62368b745b1ee09269e74174f20370af6bd605de0cd15a51a179fd42af2703b60813dd6174b4d2e476795e37d0770f5170a
```

**Positive result.** Verifying each side's `(publicKeyHex, signatureHex)` against the digest, and
confirming each derived address equals the record's own `white`/`black` field, succeeds for both
sides — `white verify ok = true`, `black verify ok = true`.

**Negative vector.** Presenting white's signature as if it were black's — verifying
`whiteSignatureHex` against black's public key over the same digest — MUST fail:
`swapped-signature verify = false`. A conformance suite MUST include at least this shape of negative
case (a genuine signature, over the right digest, from the wrong party) distinctly from a malformed
or corrupted signature, because the two failure modes are reported differently by this repository's
own verifiers (`not-a-player` vs `bad-signature` / `malformed-signature`,
`packages/verify/src/index.ts:36-42`).

## 3. Worked example — Puzzle Card

Two more real keypairs:

```
solver publicKeyHex : 82773555906f59560e6c8103452fb5ccc2dd83d8972d3a5a3c06207526f1cb2b
solver address       : NQ149QXP0HATL8XP9HH8V2L311ARMCB3CUP0

witness publicKeyHex : c1908800a78c095fa5c992276d77a497f15aa971bd60417795a6f228935de118
witness address       : NQ87UHXSX8BEKHN1EF6NAM4MYE6MVS8A440R
```

Attempts (`RECORDS.md` §3.3 — `id` is `puzzleId()`, `fen|moves`, per `puzzle-set.ts:154-156`):

```json
[
  { "id": "r7/2k3p1/1np1p2p/p3P2P/PbPPB1P1/1P3P2/2N5/2K5 w - - 0 1|e4e5 f3f4", "rating": 1150, "solved": true },
  { "id": "8/8/8/8/8/8/4k3/4K2R b K - 0 1|e2f2 h1h2", "rating": 1240, "solved": false }
]
```

```
resultsHash = hashAttempts(attempts) = d6--XQo6O1bxAG_ZEK1uXrnExbr-ioo6wTW4enAgwQY
```

`ratingBefore = 1200` (`PUZZLE_START`). Replaying the two attempts through `nextPuzzleRating`
(`RATING.md` §3.2) gives `ratingAfter = 1199` (the step-by-step arithmetic is §5 below) — this worked
card uses that value, so its chain is internally consistent (not "broken", see the second vector
below).

Canonical text:

```json
"chess/1 puzzle card\ntest\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\nNQ149QXP0HATL8XP9HH8V2L311ARMCB3CUP0\nNQ87UHXSX8BEKHN1EF6NAM4MYE6MVS8A440R\ntraining\n2\n1\n1200\n1199\n4100000\n4100010\nd6--XQo6O1bxAG_ZEK1uXrnExbr-ioo6wTW4enAgwQY\n"
```

215 UTF-8 bytes.

```
digest (hex) = f1e34bf99e6186d081878414287e441617ee32554726f40a648fd805ffc4c6d0
solver  signatureHex = f5cbc8dd7fb6eef7d21bdfb5fb3835aa4172520d9e6da393bfddc4df208c897a548ccb40c6bb97aa2cecbc2745098cf6e72594f2e3e0cf50c4c82a8d52bed00b
witness signatureHex = 80f4f146988c844545e94b6afd8a00ce46e9abd018748bd4e7821e4ca93696195b64a305da26a304344bf212e34c338ed48cbe883af075823c7c23dea9b96105
```

Both verify (`solver verify ok = true`, `witness verify ok = true`); presenting the solver's signature
against the witness's public key over the same digest fails, the same negative shape as §2's swapped
scoresheet signature.

**A "broken chain" variant, for `computePuzzleRating`'s `brokenAt` behaviour** (`RATING.md` §3.4 step
2): the identical `attempts`/`resultsHash`, but the card instead **claims** `ratingAfter = 1188` (a
value that does not match what replaying `attempts` from `ratingBefore = 1200` actually produces):

```json
"chess/1 puzzle card\ntest\ncccccccccccccccccccccccccccccccc\nNQ149QXP0HATL8XP9HH8V2L311ARMCB3CUP0\nNQ87UHXSX8BEKHN1EF6NAM4MYE6MVS8A440R\ntraining\n2\n1\n1200\n1188\n4100000\n4100010\nd6--XQo6O1bxAG_ZEK1uXrnExbr-ioo6wTW4enAgwQY\n"
```

This card is **still validly signed** — it parses, canonicalises, and both signatures would verify
against it exactly as above, because signature validity and arithmetic consistency are two entirely
different checks. The break is invisible to Layer 1 (record validity, `RECORDS.md`) and visible only
to Layer 2 (`computePuzzleRating`'s replay, `RATING.md` §3.4): replaying `attempts` gives `1199`, not
the card's claimed `1188`, so `computePuzzleRating` MUST set
`brokenAt = "cccccccccccccccccccccccccccccccc"` (this card's `sessionId`) — reported as a finding, not
thrown as a parse error. A conformance suite MUST include at least one vector of exactly this shape:
signature-valid, arithmetic-inconsistent.

## 4. Worked example — Game Rating

Using `RATING.md` §2's exact constants and arithmetic. Two independent one-game computations (a fresh
tournament game each, not a two-game sequence for the same pair, to keep each example isolated and
independently checkable):

**Game A — equal ratings, white wins.** `whiteBefore = blackBefore = 1200` (both fresh, `K = 32`
`K_PROVISIONAL` for both):

```
whiteExpected = 1 / (1 + 10^((1200-1200)/400)) = 0.5
whiteScore = 1, blackScore = 0
whiteAfter = max(100, 1200 + roundHalfAwayFromZero(32 * (1 - 0.5)))  = max(100, 1200 + 16) = 1216
blackAfter = max(100, 1200 + roundHalfAwayFromZero(32 * (0 - 0.5)))  = max(100, 1200 - 16) = 1184
```

**Game B — a 1200 upsets a 1600.** `whiteBefore = 1200`, `blackBefore = 1600` (both fresh, `K = 32`):

```
whiteExpected = 1 / (1 + 10^((1600-1200)/400)) = 1 / (1 + 10^1) = 1/11 = 0.09090909090909091
whiteScore = 1, blackScore = 0
whiteAfter = max(100, 1200 + roundHalfAwayFromZero(32 * (1 - 0.09090909...))) = max(100, 1200 + round(29.0909...)) = 1200 + 29 = 1229
blackAfter = max(100, 1600 + roundHalfAwayFromZero(32 * (0 - (1 - 0.09090909...)))) = max(100, 1600 + roundHalfAwayFromZero(32 * -0.9090909...))
           = 1600 + roundHalfAwayFromZero(-29.0909...) = 1600 - 29 = 1571
```

**The rounding rule itself, demonstrated** (`RATING.md` §2.5):

```
roundHalfAwayFromZero(2.5)  = 3   (same as native Math.round(2.5) = 3)
roundHalfAwayFromZero(-2.5) = -3  (native Math.round(-2.5) = -2 — this is the case the wrapper exists for)
```

A conformance suite for Game Rating MUST include at least one vector where `roundHalfAwayFromZero`
and native `Math.round` (or the reimplementation language's equivalent) disagree — the `-2.5` case
above is the minimal one — because a reimplementation that used its platform's native rounding instead
of the specified half-away-from-zero rule would pass every vector where the two happen to agree and
silently diverge on exactly the inputs where they do not.

## 5. Worked example — Puzzle Rating

Using `RATING.md` §3.2's `nextPuzzleRating`, replaying the two attempts from §3 above, starting from
`PUZZLE_START = 1200`:

```
Step 1: rating=1200, puzzleRating=1150, solved=true
  expected = 1 / (1 + 10^((1150-1200)/400)) = 1 / (1 + 10^-0.125) = 0.5714631174083814
  next     = 1200 + 24 * (1 - 0.5714631174083814) = 1210.2848851821989
  after    = max(400, Math.round(1210.2848851821989)) = 1210

Step 2: rating=1210, puzzleRating=1240, solved=false
  expected = 1 / (1 + 10^((1240-1210)/400)) = 1 / (1 + 10^0.075) = 0.4569335079777882
  next     = 1210 + 24 * (0 - 0.4569335079777882) = 1199.0335958085332
  after    = max(400, Math.round(1199.0335958085332)) = 1199
```

Final puzzle rating after this two-attempt run: **1199** — the same value used as `ratingAfter` in the
non-broken Puzzle Card vector in §3.

## 6. Rejected-input catalogue

Every row MUST throw `ScoresheetError` or `PuzzleCardError` respectively; none of these is a "maybe" —
each is a specific rule in `RECORDS.md` and a specific test in this repository's own suite.

| Input mutated | Expected rejection reason | Source test |
|---|---|---|
| `moveCount: 7` written as `"007"` | non-canonical integer (leading zero) | `scoresheet.test.ts:82-87` |
| `moveCount` written as `"+7"`, `"7.0"`, `" 7"`, `"7 "`, `"0x7"` | non-canonical integer, each form | `scoresheet.test.ts:89-94` |
| `black` set equal to `white` (same wallet) | self-play refused, even with different address spacing | `scoresheet.test.ts:96-100` |
| `white` set to `''`, `'NQ'`, `'not-an-address'`, `'NQ07 0000'`, or a valid address plus one extra char | not a Nimiq address | `scoresheet.test.ts:110-114` |
| `gameId` set to `''`, uppercase hex, 31 or 33 hex chars, or containing `g` | not 32 lowercase hex | `scoresheet.test.ts:116-120` |
| `result: '1-1'` | unknown result | `scoresheet.test.ts:122-124` |
| `termination: 'vibes'` | unknown termination | `scoresheet.test.ts:122-125` |
| `endedAtBlock: 0` | zero block height refused as an ordering key | `scoresheet.test.ts:127-129` |
| `finalFen` set to `''`, `'not a fen'`, or a FEN missing its last two fields | malformed FEN | `scoresheet.test.ts:131-135` |
| version line changed from `chess/1` to `chess/2` | unknown version | `scoresheet.test.ts:138-141` |
| trailing newline stripped (`.trimEnd()`) | missing trailing newline is not canonical | `scoresheet.test.ts:143-145` |
| `witness` set equal to `solver` | a solver cannot witness their own run | `puzzlecard.test.ts:71-73` |
| `attempted: 0, solved: 0` | a run with no puzzles is not a run | `puzzlecard.test.ts:75-77` |
| `attempted: 2, solved: 3` | more solved than attempted | `puzzlecard.test.ts:79-81` |
| `startedAtBlock: 200, endedAtBlock: 100` | a run cannot end before it started | `puzzlecard.test.ts:83-85` |
| `ratingAfter: 399` | below `PUZZLE_FLOOR` (400) | `puzzlecard.test.ts:87-89` |
| `mode: 'blitz'` | unknown mode | `puzzlecard.test.ts:91-93` |
| `startedAtBlock: 0` or `endedAtBlock: 0` | zero block height refused | `puzzlecard.test.ts:95-98` |
| `attempted` field bent from `2` to `02` after canonicalisation | non-canonical integer | `puzzlecard.test.ts:100-106` |
| an extra line (`extra\n`) appended after the canonical text | field-count check fails before per-field validation | `puzzlecard.test.ts:108-110` |
| version line changed to `chess/2 puzzle card` | unknown version | `puzzlecard.test.ts:112-115` |

## 7. Keyguard cross-implementation vectors

From `nimiq/keyguard`'s own `tests/lib/Key.spec.js`, as already pinned in
`packages/verify/test/keyguard-vectors.test.ts` and independently re-verified for this document using
Node's own `crypto.createHash('sha256')` (not `@nimiq/core`'s implementation):

**Vector 1** — the message `"hello"` (5 UTF-8 bytes):

```
SHA-256("\x16Nimiq Signed Message:\n5hello") = fd72a0cd679fd00d472df44647303eadebe81903fe59d5b20e12961b7ea654a1
```
Re-verified independently for this document: **match confirmed.**

**Vector 2** — the six raw bytes `[1,2,3,4,5,6]`:

```
SHA-256("\x16Nimiq Signed Message:\n6" ‖ [0x01,0x02,0x03,0x04,0x05,0x06])
```
matches `nimiqSignedMessageDigest(new Uint8Array([1,2,3,4,5,6]))` exactly
(`packages/verify/test/keyguard-vectors.test.ts:50-59`).

**The byte-length trap, demonstrated** (`RECORDS.md` §4.2): the text `café` is 4 JavaScript UTF-16
code units but 5 UTF-8 bytes (`é` is a 2-byte UTF-8 sequence). A digest built with the **correct**
byte length (`5`) and one built with the **wrong** code-unit count (`4`) are different digests — a
wallet signing with the correct construction and a verifier checking with the wrong one will disagree
on every signature over any non-ASCII text, with no error message pointing at the cause
(`packages/verify/test/keyguard-vectors.test.ts:61-79`). No field in either shipped record type
permits non-ASCII text today (`RECORDS.md` §1 point 1), so this trap cannot currently fire against a
real Scoresheet or Puzzle Card — a conformance suite MUST still include this vector, because it is the
first thing that breaks the moment any future field relaxes that restriction.
