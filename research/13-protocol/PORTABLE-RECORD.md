# Portable Record bundle — **DRAFT, NOT IMPLEMENTED**

**Status: DRAFT.** No file in this repository implements a bundle format, a Merkle tree, or an
anchoring transaction for one. Verified by a repository-wide search on 2026-09-08 for `merkle`,
`bundle`, `RatingBundle`, and `PortableRecord` under `packages/` and `apps/`, excluding build output —
the only hits are an unrelated comment in `packages/server/src/nimiq-payout.ts` about Nimiq's own
internal transaction-proof format, and generated source maps that happen to contain the word "merkle"
because `@nimiq/core` itself uses one internally for its own transactions. **Every statement in this
file describes a design, not running code.** It is a normative rewrite of
`research/10-ideas/proof-carrying-rating.md` (the concrete specification) and
`research/10-ideas/portable-identity.md` (the literature review that justifies it), so that if this
is built, there is a single normative document to build against — nothing here should be read as a
claim about what Scoresheet does today.

## 1. Scope

A **Portable Rating Bundle** is a proposed export format: one file, produced by a player, containing
every Scoresheet and Puzzle Card that address has ever signed, plus a Merkle commitment over the
ordered set, so that a third party who receives the bundle can verify both (a) that every record in it
is genuinely signed, and (b) that the set has not been silently trimmed since a given commitment was
made — without trusting the Scoresheet application at all. Nothing in this design requires a new
signing scheme: `RECORDS.md` and `RATING.md` already specify everything needed to verify **one**
record. What this design would add is a container for **many** at once, plus one new primitive (a
Merkle root) to make the container's completeness checkable.

## 2. Bundle format

```json
{
  "version": "chess/1 rating-bundle",
  "chain": "main",
  "address": "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
  "generatedAtBlock": 1234567,
  "scoresheets": [
    {
      "text": "<a Scoresheet's exact canonical text, RECORDS.md §2>",
      "white": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" },
      "black": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" }
    }
  ],
  "puzzleCards": [
    {
      "text": "<a Puzzle Card's exact canonical text, RECORDS.md §3>",
      "solver": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" },
      "witness": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" }
    }
  ],
  "completeness": {
    "scoresheetRoot": "<base64url, 32 bytes>",
    "puzzleCardRoot": "<base64url, 32 bytes>",
    "leafOrder": "endedAtBlock asc, gameId|sessionId asc — RATING.md §1",
    "anchorTxHash": "<Nimiq tx hash, OPTIONAL>",
    "anchoredAtBlock": 1234550
  }
}
```

Every entry's `text` field MUST be exactly what `RECORDS.md` §1 point 4 defines as canonical — the
same bytes `parseScoresheet` / `parsePuzzleCard` would accept unmodified. Every signature pair MUST
be exactly the `NormalisedSignature` shape from `RECORDS.md` §4.1. **Two Merkle roots, never one**,
because Scoresheets and Puzzle Cards start their respective ratings from different constants
(`STARTING_RATING = 1200` vs `PUZZLE_START = 1200` — coincidentally equal today, but the two rating
chains MUST NOT be merged into a single ordered sequence regardless, since merging would silently
corrupt whichever rating happened to be interleaved wrong; `RATING.md` §1–3 specifies the two orderings
as separate functions for exactly this reason).

## 3. Merkle construction

Leaves, in the order `RATING.md` §1 already specifies (`canonicalOrder` for scoresheets,
`canonicalCardOrder` for puzzle cards):

```
leaf[i]  = SHA-256( 0x00 ‖ utf8(bundle.scoresheets[i].text) )
```

Interior nodes, per RFC 9162 §2.1.1 — the Certificate Transparency Merkle Tree Hash construction —
**exactly**, not a simplified variant:

```
MTH(D[0:1]) = leaf[0]
MTH(D_n)    = SHA-256( 0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n]) ),   k = largest power of two < n
```

`scoresheetRoot = MTH(all scoresheet leaves)`; `puzzleCardRoot = MTH(all puzzle-card leaves)`; each
base64url-encoded with the encoding `RECORDS.md` §2.4 already specifies (`toBase64Url`,
`base64.ts:18-32`) — no second encoding introduced. An unbalanced level (odd node count) MUST be split
at `k`, the largest power of two strictly less than the level's size — **never** handled by
duplicating a trailing node to pad to an even count. Duplicating a trailing node is a well-known class
of Merkle-tree bug that lets a duplicated leaf be replayed as if it were two distinct entries; the
`0x00`/`0x01` domain-separation prefix bytes on leaves versus interior nodes exist specifically so an
interior-node hash can never be replayed as a valid leaf, and MUST be present on every hash computed
at either level.

## 4. Verifier algorithm

A verifier holding nothing but this JSON file and access to any public Nimiq node:

1. **Parse the envelope strictly.** Reject anything not exactly this shape — same discipline
   `RECORDS.md` §1 requires of a single record: no coercion, no "close enough."
2. **For every entry in `scoresheets`:** MUST call `parseScoresheet(entry.text)` (reject the entry on
   any parse failure — do not attempt to interpret a non-canonical text), then verify both signatures
   over that exact text using the digest construction in `RECORDS.md` §4: derive each side's address
   from its `publicKeyHex` (`RECORDS.md` §5), confirm it equals the sheet's own `white`/`black` field,
   and verify the Ed25519 signature over the digest. An entry failing either check MUST be discarded
   from the recomputation and MAY be recorded in a "rejected" list so the verifier can see what was
   thrown out and why.
3. **For every entry in `puzzleCards`:** the same, using `parsePuzzleCard` and checking `solver` /
   `witness` against the card's own named addresses.
4. **Filter to games this bundle's own `address` actually played.** A verifier MUST discard any
   retained scoresheet where `bundle.address` is neither the `white` nor `black` signer, and any
   puzzle card where it is neither `solver` nor `witness` — otherwise a bundle could smuggle in someone
   else's genuine, validly-signed records to pad its own totals.
5. **Recompute both Merkle roots** (§3) from the *verified, filtered* leaf set, in the canonical
   order, and compare each to `completeness.scoresheetRoot` / `puzzleCardRoot`. A mismatch MUST be
   reported as a finding, not treated as fatal — mirroring `RATING.md` §3.4's `brokenAt` pattern: a
   bundle whose signatures are all genuine but whose declared root does not match its own contents is a
   different, specific kind of untrustworthy than one containing a forged signature, and a verifier
   SHOULD be told which.
6. **If `anchorTxHash` is present**, a verifier MAY fetch that transaction from any public Nimiq node
   and compare its `data` field to the recomputed root (or a short encoding of it, if a version tag or
   leaf count is packed alongside within the 64-byte transaction-data budget). A verifier performing
   this step MUST also check `completeness.anchoredAtBlock >= every included entry's endedAtBlock` —
   without this check, a bundle could claim an anchor that predates some of the games it contains,
   which is internally inconsistent and MUST be flagged rather than silently accepted.
7. **Recompute the rating(s).** Run `RATING.md` §2's `computeRatings` over the verified, filtered
   scoresheet set, and §3's `computePuzzleRating` over the verified, filtered puzzle-card set. Compare
   the result to whatever number the bundle or its holder separately claims. **Agreement is the proof —
   there is no privileged number.** A verifier's own recomputation disagreeing with the holder's claim
   means the holder's claim is wrong; nothing in this design asks a verifier to trust the bundle's own
   arithmetic over its own.

## 5. What a verified bundle MUST be understood to prove

- Every retained record was genuinely co-signed by exactly the two addresses it names, independently
  re-derived from the supplied public keys — not merely asserted by the bundle.
- The rating number(s) are exactly what `RATING.md`'s functions, applied in the specified canonical
  order, produce from exactly this verified record set — because the verifier ran the same pure
  function the application would run, not a description of it.
- **If, and only if,** an anchor transaction is present and its on-chain `data` field matches the
  recomputed root: the exact set of records in this bundle is the exact set that was publicly
  committed to at `anchoredAtBlock` — so a bundle handed to a verifier *after* that point cannot have
  had entries quietly removed since without the recomputed root visibly disagreeing with what is
  permanently on-chain.

## 6. What this design does NOT establish — stated bluntly

- **Completeness before the first anchor, or of anything signed after the most recent one, is not
  provable by this design.** A player can withhold any number of records from a bundle, and unless a
  verifier already holds an earlier anchor to compare the recomputed root against, nothing detects the
  omission. This is not a gap specific to this design — Certificate Transparency states the identical
  limit about its own logs: an anchor makes *removal after publication* detectable; it does not, and
  cannot, make *non-publication* provable
  (`research/10-ideas/portable-identity.md` §3, §7). The honest claim this design would support is "no
  record this bundle includes can be silently un-included after the date shown," never "this is every
  game this player has ever played."
- **Does not prove a human played the moves.** Unchanged from `RATING.md` §6 — bundling many records
  does not add anything to this per-record limit.
- **Does not make the rating comparable to any other pool.** Unchanged from `RATING.md` §6.
- **Does not survive key loss for anything never distributed.** A record that exists only on two
  now-inaccessible devices and was never shared into any bundle or anchor is gone; distributing a
  bundle (or anchoring it) is what would make a record survive key loss **going forward**, never
  retroactively.
- **A bundle full of one repeated opponent verifies perfectly and still means nothing about skill.**
  Portability does not touch `RATING.md` §5's farming problem — `distinctOpponents` MUST travel with
  any rating claim surfaced from a verified bundle, exactly as it must today.
- **An anchor transaction proves inclusion in what was submitted at that block; it does not
  independently prove the root was generated honestly "as of" the claimed time** beyond the
  `anchoredAtBlock ≥ every endedAtBlock` consistency check in §4 step 6 — a check a naive
  implementation could skip, which is why it is called out as a MUST rather than left implicit.
- **NOT VERIFIED:** whether the closed-source Nimiq Pay host app passes a 64-byte transaction `data`
  payload through unmodified, truncates it, or rejects it. The SDK itself imposes no client-side length
  check (`research/verification/01_nimiq_provider_and_chain.md:383-388`), but the host app's actual
  behaviour was not independently confirmed in the research this design is based on. This MUST be
  settled with a real 64-byte testnet send and read-back before any implementation of §4 step 6 is
  relied on.

## 7. Dependencies, if built

`@noble/ed25519` and `@noble/hashes` — both already MIT-licensed dependencies of this repository
(`NOTICES.md`) — for signature verification, SHA-256, and the Merkle tree; this repository's own
`@scoresheet/core` for `parseScoresheet`, `parsePuzzleCard`, `canonicalOrder`, `canonicalCardOrder`,
`computeRatings`, `computePuzzleRating`. No Scoresheet server, no DID resolver, no JSON-LD processor,
no WASM — the same dependency set `apps/web/src/verify-browser.ts` already ships. The one genuinely
new piece of code this design would need is the RFC 9162 §2.1.1 Merkle construction itself (§3),
roughly 40–60 lines, to be written clean-room from the RFC's own published pseudocode and shipped
under this repository's existing MIT licence
(`research/10-ideas/proof-carrying-rating.md` §9, `research/10-ideas/portable-identity.md` §9).

---

**Restated:** every section above describes a design. Nothing in this file is implemented. Before any
part of it is treated as a claim about the running product, it MUST first be built, and this file's
own status line updated to reflect that.
