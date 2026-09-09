# Records — canonical serialisation

Normative for the two record types shipped in `packages/core/src/scoresheet.ts` and
`packages/core/src/puzzlecard.ts`. Every claim below cites the line that makes it true; where
`SPEC.md` says something different, §6 says so and states which this document follows.

## 1. Common conventions

These apply to every record type this protocol defines, present and future.

1. **Encoding.** A record's canonical text is a JavaScript string, encoded to bytes as UTF-8 at the
   point a digest is computed (`packages/core/src/signature.ts:225-232`,
   `apps/web/src/verify-browser.ts:60-63`). Field values themselves are, in every record type shipped
   today, restricted by regular expressions to ASCII, so the UTF-8/UTF-16 distinction does not
   currently arise inside a record's own fields — it matters entirely at the digest layer (§4).
2. **Line-oriented, newline-separated, no trailing separator on the last field.** A record is an
   ordered list of *N* fields, joined with `\n`, followed by one **additional** empty field — i.e.
   the produced string ends in a single trailing `\n` and nothing after it. `canonicaliseScoresheet`
   builds its return value as an array of 13 elements (12 fields + a final `''`) joined by `\n`
   (`scoresheet.ts:177-192`); `canonicalisePuzzleCard` does the same with 14 elements (13 fields + a
   final `''`) (`puzzlecard.ts:192-208`).
3. **No field may contain a newline.** Not separately enforced by a dedicated check — it falls out of
   every field's own validation regex, none of which permits `\n`, and the round-trip rule (next
   point) would catch an attempt regardless.
4. **Parse, re-serialise, compare — the rule that makes the format canonical.** `parseScoresheet`
   splits the input on `\n`, builds a `Scoresheet` object from the pieces, then calls
   `canonicaliseScoresheet` on that object and throws unless the result is **byte-identical** to the
   original input (`scoresheet.ts:229-231`). `parsePuzzleCard` does the same
   (`puzzlecard.ts:241-243`). A parser that accepted anything "close enough" — a different number of
   leading zeros, different address spacing, a missing trailing newline — would let two distinct byte
   strings mean the same thing, which is exactly the failure this protocol exists to rule out
   (`PROTOCOL.md` §1, property 1). This is why, for example, `moveCount` written as `007` is refused
   even though a digits-only regex alone would accept it as a valid integer — see §7.
5. **Field count is checked before anything else is parsed.** A Scoresheet's text MUST split into
   exactly 13 lines with the 13th equal to `''` (`scoresheet.ts:203-205`, error text *"a scoresheet is
   twelve lines and a trailing newline"*); a Puzzle Card's text MUST split into exactly 14 lines with
   the 14th equal to `''` (`puzzlecard.ts:219-221`, *"a puzzle card is thirteen lines and a trailing
   newline"*). An extra line appended after the canonical text — even a blank one — fails this check
   and is refused before any field is individually validated
   (`packages/core/test/puzzlecard.test.ts:108-110`).
6. **Addresses are normalised at serialisation time, not at parse time.** `normaliseAddress` strips
   every whitespace character and uppercases the rest (`scoresheet.ts:113-115`). Both
   `canonicaliseScoresheet` and `canonicalisePuzzleCard` call this on every address field before
   writing it out (`scoresheet.ts:150-151`, `puzzlecard.ts:151-152`) — so a canonical text's address
   fields are, by construction, already normalised. A text whose address field is *not* already
   normalised (has display spacing, or lowercase characters) will fail the round-trip check in point
   4, because re-normalising it during re-serialisation changes the bytes. Normalisation is therefore
   not something a verifier does defensively — it is what makes a non-canonical address representation
   fail to parse at all.
7. **Two identical error-message conventions across both record types**, worth naming because a
   reimplementation MUST reproduce the same *rejections*, if not the same message text:
   `ScoresheetError` and `PuzzleCardError` are both thrown for "anything that is not exactly a
   canonical record — never a silent coercion" (`scoresheet.ts:91-94`, `puzzlecard.ts:113-116`).

## 2. The Scoresheet record

Version marker: `chess/1 scoresheet` (`scoresheet.ts:38`). One canonical text per finished game,
signed by both players.

### 2.1 Field table

Zero-indexed line number after `text.split('\n')`. Source: the array literal at
`scoresheet.ts:177-191` and the field assignment at `scoresheet.ts:215-227`.

| Line | Field | Type / encoding | Constraint |
|---|---|---|---|
| 0 | version marker | literal string | MUST equal `chess/1 scoresheet` exactly |
| 1 | `chain` | `'main' \| 'test'` | MUST be exactly one of the two literals |
| 2 | `gameId` | 32 lowercase hex chars | regex `^[0-9a-f]{32}$` (`scoresheet.ts:124`) |
| 3 | `white` | Nimiq address, normalised | regex `^NQ[0-9A-Z]{34}$` after `normaliseAddress` (`scoresheet.ts:123,152`) |
| 4 | `black` | Nimiq address, normalised | same regex; MUST NOT equal `white` after normalisation (`scoresheet.ts:155`) |
| 5 | `result` | literal string | MUST be exactly one of `1-0`, `0-1`, `1/2-1/2` (`scoresheet.ts:157-159`) |
| 6 | `termination` | literal string | MUST be a member of the 9-value set in §2.2 (`scoresheet.ts:160-162`) |
| 7 | `moveCount` | digits-only decimal | see §7 for the exact non-coercion rule |
| 8 | `finalFen` | FEN string | regex in §2.3; shape-checked, not legality-checked |
| 9 | `endedAtBlock` | digits-only decimal | MUST be a positive integer — `0` is explicitly refused (`scoresheet.ts:165`) |
| 10 | `movesHash` | base64url | regex `^[A-Za-z0-9_-]+$` (`scoresheet.ts:125,170-172`); see §2.4 for the preimage |
| 11 | `rated` | literal word | MUST be exactly `rated` or `casual` (`scoresheet.ts:210-213`) |
| 12 | (trailing) | empty string | MUST be `''` — this is what makes the text end in one trailing `\n` |

### 2.2 The nine termination values

`checkmate`, `resignation`, `timeout`, `stalemate`, `agreement`, `insufficient`, `repetition`,
`fifty-move`, `abandoned` — the complete `TERMINATIONS` set (`scoresheet.ts:58-68`). Any other value
on line 6 MUST be rejected. (§6 flags that `SPEC.md`'s own account of this field lists only six of
the nine.)

### 2.3 The FEN field

`finalFen` MUST match:

```
^[1-8pnbrqkPNBRQK/]+ [wb] (-|K?Q?k?q?) (-|[a-h][36]) \d+ \d+$
```
(`scoresheet.ts:132`) — six space-separated fields, matching FEN's own shape: piece placement, side
to move, castling rights, en passant target, halfmove clock, fullmove number. This is a **shape**
check, deliberately not a legality check: *"whether the position is reachable is a question for the
rules engine, and a scoresheet that refused an unreachable position would be refusing to record a bug
rather than preventing one"* (`scoresheet.ts:127-131`).

### 2.4 The moves hash

`movesHash` is the base64url-encoded SHA-256 of the game's SAN move list, computed by `hashMoves`
(`scoresheet.ts:107-110`):

1. Each move string is trimmed of surrounding whitespace.
2. Empty strings are dropped.
3. The remaining moves are joined with a single ASCII space (`0x20`), **no trailing separator**.
4. SHA-256 of the UTF-8 bytes of that joined string.
5. Base64url-encode the 32-byte digest, unpadded (`base64.ts:18-32` — the RFC 4648 §5 alphabet:
   `A-Z a-z 0-9 - _`, no `=` padding).

The moves themselves are **not** part of the signed text — only their hash is. A game is far too long
to sign comfortably; the move list is served alongside the Scoresheet and anyone can recompute
`hashMoves` over it to confirm it matches (`scoresheet.ts:29-31`). Whitespace inside a move string
does not change the hash; move order and move content do
(`packages/core/test/scoresheet.test.ts:149-153`).

### 2.5 Validation summary (`canonicaliseScoresheet`, `scoresheet.ts:142-192`)

In the order the code checks them:

1. `chain ∈ {main, test}`.
2. `gameId` matches the 32-lowercase-hex regex.
3. `white` and `black` are each normalised, then each MUST match the address regex.
4. `white !== black` after normalisation — *"a game against yourself is not a game, and it is the
   cheapest possible way to farm a rating"* (`scoresheet.ts:154`).
5. `result ∈ {1-0, 0-1, 1/2-1/2}`.
6. `termination` ∈ the 9-value set.
7. `moveCount` is a non-negative safe integer (`assertUint`, `scoresheet.ts:248-252`).
8. `endedAtBlock` is a non-negative safe integer, and additionally MUST NOT be `0`.
9. `finalFen` matches the FEN shape regex.
10. `movesHash` matches the base64url regex.
11. `rated` is a JavaScript boolean (this check is on the input object, before serialisation to the
    literal word).

Any failure throws `ScoresheetError` with a message naming the field and the offending value.

## 3. The Puzzle Card record

Version marker: `chess/1 puzzle card` (`puzzlecard.ts:69`). One canonical text per run of puzzles,
signed by the solver and a witness.

### 3.1 Field table

Zero-indexed line number after `text.split('\n')`. Source: `puzzlecard.ts:192-207` and
`puzzlecard.ts:226-239`.

| Line | Field | Type / encoding | Constraint |
|---|---|---|---|
| 0 | version marker | literal string | MUST equal `chess/1 puzzle card` exactly |
| 1 | `chain` | `'main' \| 'test'` | as Scoresheet §2.1 |
| 2 | `sessionId` | 32 lowercase hex chars | regex `^[0-9a-f]{32}$` (`puzzlecard.ts:121`) |
| 3 | `solver` | Nimiq address, normalised | address regex; MUST NOT equal `witness` (`puzzlecard.ts:160`) |
| 4 | `witness` | Nimiq address, normalised | address regex |
| 5 | `mode` | literal string | MUST be a member of `{daily, training, themed, storm, streak}` (`puzzlecard.ts:79,162`) |
| 6 | `attempted` | digits-only decimal | non-negative integer, MUST NOT be `0` (`puzzlecard.ts:171`) |
| 7 | `solved` | digits-only decimal | non-negative integer, MUST be `≤ attempted` (`puzzlecard.ts:172-174`) |
| 8 | `ratingBefore` | digits-only decimal | non-negative integer, MUST be `≥ PUZZLE_FLOOR` (400) (`puzzlecard.ts:175-177`) |
| 9 | `ratingAfter` | digits-only decimal | same floor constraint |
| 10 | `startedAtBlock` | digits-only decimal | positive integer, MUST NOT be `0` (`puzzlecard.ts:178`) |
| 11 | `endedAtBlock` | digits-only decimal | positive integer, MUST NOT be `0`, and MUST be `≥ startedAtBlock` (`puzzlecard.ts:179,184-186`) |
| 12 | `resultsHash` | base64url | regex `^[A-Za-z0-9_-]+$` (`puzzlecard.ts:122,188-190`); see §3.3 for the preimage |
| 13 | (trailing) | empty string | MUST be `''` |

### 3.2 Why `solver !== witness` is enforced in the record format itself

*"Witnessing yourself is the whole attack this design exists to stop, and it is worth refusing here
rather than only in the server: the bundled puzzle set is public, so a solver who is also the witness
can mint any rating they like without solving anything"* (`puzzlecard.ts:155-160`).

### 3.3 The attempts hash

`resultsHash` is the base64url-encoded SHA-256 of the run's attempt list, computed by `hashAttempts`
(`puzzlecard.ts:132-135`):

1. Each `PuzzleAttempt` — `{ id, rating, solved }` — becomes one line: `` `${id}\t${rating}\t${solved
   ? 1 : 0}` `` (tab-separated, `solved` as the literal digit `1` or `0`).
2. The lines are joined with `\n`, **in the order the puzzles were served, with no trailing
   newline**.
3. SHA-256 of the UTF-8 bytes of that string, base64url-encoded, unpadded — same encoding as §2.4.

`id` is `puzzleId()` from `packages/core/src/puzzle-set.ts:154-156` — `` `${fen}|${moves.join(' ')}`
``, i.e. the puzzle's FEN, a literal `|`, and its UCI move line, space-joined. Order is part of the
hash deliberately: *"the same puzzles solved in a different order give a different number, so a hash
that ignored order would let a run be reshuffled into a better result without breaking the signature"*
(`puzzlecard.ts:126-130`).

### 3.4 Validation summary (`canonicalisePuzzleCard`, `puzzlecard.ts:143-208`)

In the order the code checks them:

1. `chain ∈ {main, test}`.
2. `sessionId` matches the 32-lowercase-hex regex.
3. `solver` and `witness` are each normalised, then each MUST match the address regex.
4. `solver !== witness` after normalisation.
5. `mode` ∈ the 5-value set.
6. `attempted`, `solved`, `ratingBefore`, `ratingAfter`, `startedAtBlock`, `endedAtBlock` are each a
   non-negative safe integer (`assertUint`).
7. `attempted !== 0`.
8. `solved ≤ attempted`.
9. `ratingBefore ≥ 400` and `ratingAfter ≥ 400` (`PUZZLE_FLOOR`, `puzzle-set.ts:188`).
10. `startedAtBlock !== 0`, `endedAtBlock !== 0`.
11. `endedAtBlock ≥ startedAtBlock` — *"a run cannot finish before it started... without this a card
    could claim a height far in the past and insert itself anywhere in somebody's history, which is
    the ordering equivalent of a forgery"* (`puzzlecard.ts:180-186`).
12. `resultsHash` matches the base64url regex.

Any failure throws `PuzzleCardError`.

## 4. Signature format and digest construction

Neither record type carries a signature *inside* its canonical text — a record's text is the thing
signed, not a container for the signature. A signed record, wherever it is stored or transmitted, is
the canonical text plus one `{ publicKeyHex, signatureHex }` pair per required signer (two for a
Scoresheet, two for a Puzzle Card).

### 4.1 `NormalisedSignature`

```
publicKeyHex : 64 lowercase hex characters  (32 bytes — an Ed25519 public key)
signatureHex : 128 lowercase hex characters (64 bytes — an Ed25519 signature)
```
(`packages/core/src/signature.ts:31-38`, `ED25519_PUBLIC_KEY_BYTES = 32`,
`ED25519_SIGNATURE_BYTES = 64`.)

A host wallet's `sign()` call MAY return this pair in any of several shapes — a `Uint8Array`, an
`ArrayBuffer`, a plain number array, an index-keyed object (from a value that crossed a serialisation
boundary twice), a hex string, or a base64/base64url string, padded or not. `coerceSignatureBytes`
(`signature.ts:94-156`) accepts all of these and normalises to exactly `expectedBytes`, deciding
between hex and base64 candidates **by length, never by guessing**: hex is tried first because it is
what Nimiq's own documentation specifies, and a base64/base64url candidate is accepted only if its
length matches one of the two possible encoded lengths for the expected byte count
(`signature.ts:137-150`). This coercion happens once, at the point a signature is captured from a
wallet; the wire format this protocol specifies is always the normalised lowercase-hex pair above.

### 4.2 The digest a Nimiq wallet actually signs

A Nimiq wallet does not sign a record's canonical text directly. It signs:

```
digest = SHA-256( prefix ‖ decimal(byteLength(message)) ‖ message )

prefix  = "\x16Nimiq Signed Message:\n"     (23 bytes: one 0x16 byte, then 22 ASCII bytes)
message = the record's canonical text, encoded as UTF-8
```

The leading `\x16` byte is itself the decimal length (22) of the ASCII text that follows it
(`signature.ts:28-29`, `packages/verify/src/index.ts:29-33`). `decimal(byteLength(message))` MUST be
computed from the **UTF-8 byte length** of the message, encoded as ASCII digits — **not** a UTF-16
code-unit count. This is the single most consequential trap in the whole protocol: Nimiq's own
published JS snippet uses `message.length`, which is silently correct for ASCII and wrong for any
accented character, currency symbol, or emoji (`signature.ts:19-22`, `verify/src/index.ts:8-20`).
Every field in both record types is currently ASCII-only by regex, so the bug cannot yet bite a
Scoresheet or a Puzzle Card in production — but any future field, or any future record type, that
permits non-ASCII text MUST get this right from the first line of code, because getting it wrong
produces a symptom ("every signature is suddenly invalid") with no clue to its cause. `TEST-VECTORS.md`
§7 pins this against Nimiq Keyguard's own published test vectors, verified with an independently
implemented SHA-256 (Node's `crypto`, not `@nimiq/core`'s), specifically so the check cannot pass by
both sides sharing the same bug.

This construction is implemented **three separate times** in this repository —
`packages/core/src/signature.ts:224-233` (used where a digest is needed but no real Ed25519 library
is wanted, e.g. before verification), `packages/verify/src/index.ts:58-67` (using `@nimiq/core`'s
`Hash.computeSha256`), and `apps/web/src/verify-browser.ts:59-68` (using `@noble/hashes`'s `sha256`,
for the in-browser verifier that must not ship a 50 MB WASM bundle) — deliberately, so a mistake in
one does not silently propagate into the others.

### 4.3 What is actually Ed25519-signed

The 32-byte `digest` above is the message Ed25519 signs and verifies — not the canonical text
directly, and not a second hash of the digest. `verifyAsync(signatureBytes, digest, publicKeyBytes)`
(`apps/web/src/verify-browser.ts:149`) and the Nimiq-core equivalent
(`publicKey.verify(signature, digest)`, `packages/verify/src/index.ts:116`) both take the digest as
the message argument.

## 5. Address format and derivation

A Nimiq address, as it appears in a record's `white`/`black`/`solver`/`witness` field, is 36
characters: the literal prefix `NQ`, two IBAN-style check digits, and 32 base32 characters encoding
the 20 address bytes — matching `^NQ[0-9A-Z]{34}$` (`scoresheet.ts:123`).

The 20 address bytes are derived from a signer's Ed25519 public key as:

```
addressBytes = Blake2b-256(publicKeyBytes)[0:20]
```

using Nimiq's own 32-character base32 alphabet — `0123456789ABCDEFGHJKLMNPQRSTUVXY`, deliberately
missing `I`, `O`, `U`, `W` so no character can be misread as a digit and no address spells a word by
accident (`apps/web/src/verify-browser.ts:37-43`) — encoding the 20 bytes as exactly 32 base32
characters (160 bits ÷ 5 bits/char), then prefixing two IBAN mod-97 check digits computed over
`` `${base32}NQ00` `` with each letter mapped to `charCode - 55` per the IBAN scheme
(`verify-browser.ts:92-113`). This derivation is verified against `@nimiq/core`'s own output over
many random keys (`verify-browser.ts:16-21`, `apps/web/test/address.test.ts`) — a same-family (but
independently authored) reimplementation, since deriving an address even slightly differently from
the wallet would silently attribute a real signature to the wrong address.

**A record's own address fields are the source of truth for who is allowed to be the signer**: a
verifier MUST derive the address from each supplied public key and confirm it equals the record's
own `white`/`black` (or `solver`/`witness`) field before accepting that side's signature at all
(`verify-browser.ts:144-146`, `packages/verify/src/index.ts:105-112`) — a genuine signature from a
key that is simply not one of the two named parties MUST be reported as such (`not-a-player`), not
silently treated as invalid-signature.

## 6. Where `SPEC.md` and the code disagree

`SPEC.md` Part F1 (lines 389–401) is the product specification's own ASCII sketch of the Scoresheet
format, written before the code below it settled into its final shape. Two discrepancies exist
between that sketch and `packages/core/src/scoresheet.ts` as shipped. **This document follows the
code in both cases**, because the code is what a real signature is computed over and what a real
verifier checks — a specification that does not match the running format is not a specification of
anything.

1. **`SPEC.md`'s field list has no `rated` line at all.** It lists 11 fields ending at `movesHash`;
   the shipped format has a 12th field, `rated` (line 11 in §2.1), literally the word `rated` or
   `casual`. The code's own comment states the reasoning explicitly (`scoresheet.ts:26-27`): without
   it, a casual game could be relabelled rated (or the reverse) after the fact by whoever stores the
   record. **Followed: the code. Flagged: `SPEC.md` Part F1 needs a 12th line added.**
2. **`SPEC.md`'s `termination` list names six values**; `termination` accepts nine
   (`checkmate | resignation | timeout | stalemate | agreement | insufficient | repetition |
   fifty-move | abandoned`, `scoresheet.ts:58-68`). `SPEC.md`'s six omit `repetition`, `fifty-move`,
   and `abandoned`. **Followed: the code's nine-value set. Flagged: `SPEC.md` Part F1's comment needs
   the three missing values added.**

No other line of `SPEC.md` Part F1's sketch (chain, gameId, white/black, result, moveCount, finalFen,
endedAtBlock, movesHash) disagrees with the code — those match field-for-field.

`SPEC.md` Part F does not mention the Puzzle Card record at all; it predates `puzzlecard.ts`
entirely, so there is nothing to reconcile there. This is noted again in `RATING.md` §4, since the
same gap applies to the puzzle rating function.

## 7. The non-coercion rule for integers, precisely

`numberFrom` (`scoresheet.ts:241-246`, `puzzlecard.ts:253-258`) accepts a field only if it matches
`^\d+$` — digits only, no sign, no decimal point, no surrounding whitespace. This alone would still
accept `007` as a valid representation of `7`, because `007` matches `\d+`. What actually refuses
`007` is §1 point 4, the round-trip rule: `numberFrom("007")` parses successfully to `moveCount = 7`,
but `canonicaliseScoresheet` then re-serialises that `7` as the string `"7"`, which does not match the
original `"007"` — so `parseScoresheet` throws on the round-trip comparison, not on the initial
per-field regex (`packages/core/test/scoresheet.test.ts:82-94` demonstrates this for `007`, `+7`,
`7.0`, ` 7`, `7 `, `0x7` — all refused, `puzzlecard.test.ts:100-105` demonstrates the identical
mechanism for `02`). A reimplementation that checked `numberFrom`'s regex alone and skipped the
round-trip step would silently accept non-canonical integers — this is the one place in the whole
format where the two-step design is easy to under-replicate.

## 8. Byte-length reference

For a reimplementation budgeting fixed-size buffers, or checking a length assumption:

| Value | Exact length | Why |
|---|---|---|
| `gameId` / `sessionId` | 32 characters (16 bytes as hex) | fixed regex |
| A Nimiq address field | 36 characters | `NQ` + 2 check digits + 32 base32 chars |
| `movesHash` / `resultsHash` | 43 characters | base64url, unpadded, of a 32-byte SHA-256 digest: `⌈32×8÷6⌉ = 43` |
| `publicKeyHex` | 64 characters | 32-byte Ed25519 public key as hex |
| `signatureHex` | 128 characters | 64-byte Ed25519 signature as hex |
| The digest (§4.2) | 32 bytes / 64 hex characters | SHA-256 output |
| A Scoresheet's canonical text | not fixed — varies with `finalFen`'s length; **267 bytes** for the worked example in `TEST-VECTORS.md` §2 | no field is fixed-width except the ones above |
| A Puzzle Card's canonical text | not fixed — varies with `attempted`/rating digit counts; **215 bytes** for the worked example in `TEST-VECTORS.md` §3 | as above |

**There is no code-enforced maximum length on a record's overall canonical text.** No `MAX_*_BYTES`
constant or length assertion exists in `scoresheet.ts` or `puzzlecard.ts`. This is worth stating
explicitly because a *different* 64-byte cap exists elsewhere in this project's design space — the
Nimiq basic-transaction recipient-data field (`primitives/src/policy.rs:71`,
`MAX_BASIC_TX_RECIPIENT_DATA_SIZE = 64`) — and it is easy to conflate the two. That 64-byte cap
applies only to the **unshipped** Portable Record's on-chain Merkle-root anchor transaction
(`PORTABLE-RECORD.md` §2), which carries a 32-byte SHA-256 root with 32 bytes of headroom for a tag —
it has nothing to do with, and imposes no limit on, a Scoresheet or Puzzle Card's own text length.
The research estimate of "roughly 550-900 bytes per game" for a *signed* Scoresheet (text plus both
signature pairs) in `research/10-ideas/proof-carrying-rating.md` §3 is an external sizing estimate for
that unshipped bundle design, not a protocol requirement on the record format itself.
