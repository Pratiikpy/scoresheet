# Proof-carrying rating: the concrete bundle a third party would need

The literature review is `portable-identity.md`. This file is the specification: the exact bundle
format, the verification algorithm a third party runs, what a verified bundle proves, and — bluntly,
because the task demands it and `SPEC.md` Part F6 already sets the precedent for saying limits out
loud — what it does not prove.

Nothing here requires a new signing scheme. `packages/core/src/scoresheet.ts`,
`packages/core/src/puzzlecard.ts`, `packages/core/src/elo.ts` and `apps/web/src/verify-browser.ts`
already specify and implement everything needed for **one** game or **one** puzzle run to be verified
by a stranger with no server. What is missing, and what this file adds, is (a) a container format for
**many** signed records at once, and (b) one new primitive — a Merkle root over that container — so a
third party can tell whether the set they were handed is the same set the player has ever presented,
not a hand-picked subset of it.

## 1. What they do

**"They" here is the proposed Portable Rating Bundle** — the artefact a Scoresheet player would
export and a third party would import. It does three things:

1. Packages every scoresheet and puzzle card an address has ever signed into one file, each entry
   carrying its exact canonical text plus both signatures, unchanged from the wire format
   `scoresheet.ts` and `puzzlecard.ts` already define.
2. Adds a Merkle root over the ordered set, using the ordering `elo.ts` and `puzzlecard.ts` already
   specify (`canonicalOrder`, `canonicalCardOrder`), so the commitment is over the same sequence the
   rating arithmetic itself depends on.
3. Optionally names a Nimiq transaction where that root was published on-chain, turning "trust that
   this bundle is complete" into "check one transaction's data field against a number you compute
   yourself."

## 2. Why it works

It works because verification, ordering and arithmetic are **already** specified as pure functions
with no dependency on Scoresheet's own server:

- **Authenticity** — `verifyScoresheetInBrowser` / `verifyPuzzleCardInBrowser`
  (`apps/web/src/verify-browser.ts:162,212`) check that both named addresses actually signed the
  exact canonical text, using `@noble/ed25519` and `@noble/hashes` (both MIT) and the address
  derivation the file's own header states was cross-checked against `@nimiq/core`'s output over many
  random keys.
- **Ordering** — `canonicalOrder` (`elo.ts:107`) and `canonicalCardOrder` (`puzzlecard.ts:276`) fix
  the one sequence every honest recomputation must use, because Elo (and the puzzle chain) is
  path-dependent.
- **Arithmetic** — `computeRatings` (`elo.ts:166`) and `computePuzzleRating` (`puzzlecard.ts:314`) are
  pure functions of exactly this data, deliberately: *"a pure function of the games — no clock, no
  database, no configuration — so that the recompute page in a stranger's browser and our server
  cannot possibly disagree. If they ever do, ours is wrong"* (`elo.ts:160-164`).
- **Completeness (new)** — a Merkle root binds the whole ordered set into one 32-byte number, the way
  Certificate Transparency binds a whole log (`portable-identity.md` §2). Any entry added, removed, or
  reordered changes the root, so a bundle cannot be silently trimmed after the root was published
  without the mismatch being visible to anyone who recomputes it.

Composed, these four layers answer the task's second question directly: **yes**, a third party can
import a bundle and verify the rating without trusting Scoresheet, because every step from raw bytes
to a final number is already a public, dependency-light, MIT-licensed pure function.

## 3. What they do badly

- **A bundle proves nothing about freshness.** A player can hand out a bundle from three months ago
  and it will verify perfectly — nothing in the format states "this is current." A verifier who cares
  about recency has to also check the most recent `endedAtBlock` against the current chain height
  themselves.
- **No amount of Merkle-rooting proves the *set itself* is everything the player ever played.** It
  proves the set matches a specific prior commitment, if one exists and the verifier has it. Before
  any commitment exists, or between commitments, a bundle is exactly as trustworthy as the individual
  signatures in it — no more. This is restated bluntly in §7.
- **Size is linear in games played, and 64 bytes is nowhere near enough to carry it on-chain.** One
  scoresheet's canonical text is roughly 200-260 bytes (12 lines: a 32-char version string, `main`/
  `test`, a 32-hex gameId, two 44-char addresses, a short result/termination word, small integers, a
  FEN of ~60-90 chars, a base64url hash); two signatures add `2 × (64 hex publicKey + 128 hex
  signature)` ≈ 384 bytes of hex, or materially less if the bundle uses raw base64 instead of hex.
  Call it roughly 550-900 bytes per game depending on encoding. At 10,000 games that is 5.5-9 MB —
  fine as a downloadable file, confirming exactly why the on-chain artefact has to be a 32-byte root
  and never the data itself.
- **Puzzle cards and scoresheets are two different chains with two different starting points**
  (`STARTING_RATING = 1200` vs `PUZZLE_START`, `elo.ts:28` and `puzzlecard.ts` referencing
  `puzzle-set.ts`) — a bundle has to keep them as two Merkle trees (or two clearly labelled subtrees),
  never one merged list, or the ordering rule that makes either rating recomputable breaks silently.

## 4. What we should copy conceptually

- **Certificate Transparency's split between the log and the commitment** (`portable-identity.md`
  §4): the bundle *is* the log (large, exportable, off-chain), the Merkle root *is* the Signed Tree
  Head equivalent (tiny, on-chain, the thing a stranger actually checks).
- **The RFC 9162 §2.1.1 hash construction exactly**, not a simplified version: leaves are
  `HASH(0x00 ‖ d)`, interior nodes are `HASH(0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n]))` with `k` the largest
  power of two smaller than `n` (never pairwise duplication of an odd trailing node — that is the
  well-known class of bug that lets a duplicated final transaction be replayed as if it were two
  distinct ones in naive Merkle-tree implementations). The domain-separation prefix bytes exist
  specifically so an interior-node hash can never be replayed as a valid leaf.
- **`elo.ts`'s own rule that a broken chain is a finding to display, not a crash**
  (`computePuzzleRating`'s `brokenAt`, `puzzlecard.ts:293-300`): a bundle whose recomputed root
  disagrees with its claimed root, or whose on-chain anchor disagrees with the bundle, should report
  *which* check failed and let the verifier decide what to trust — never throw and stop, and never
  silently prefer one number over the other.
- **The "re-serialise and compare" discipline** already used everywhere in `scoresheet.ts` and
  `puzzlecard.ts`: a bundle entry is accepted only if `canonicaliseScoresheet(parseScoresheet(text))
  === text`, exactly as those files already require for a lone scoresheet. A "close enough" bundle
  entry must be refused the same way a "close enough" scoresheet already is.

## 5. What we can do better

- **No proving time, no circuit-size limit.** Obscura's ZK approach cost 2-5 seconds per proof and
  capped at 10 trades because it also has to hide the individual trades. A Merkle root over
  plaintext, public scoresheets costs one SHA-256 pass over the whole set — milliseconds for
  thousands of games, no size ceiling, because there is nothing to hide (`portable-identity.md` §5).
- **No resolver, no schema registry, no external library.** A VC/DID-based version of this bundle
  would need a JSON-LD processor and (for DID-based addressing) a resolver; this version needs the
  same two MIT libraries already in the browser bundle (`@noble/ed25519`, `@noble/hashes`) plus this
  project's own MIT `@scoresheet/core`, all already documented in `NOTICES.md`.
- **Anchor as often as the chain allows, because the chain allows it for free.** Zero-fee transactions
  are valid at consensus and confirmed live on mainnet
  (`C:\Users\prate\nimiq\research\verification\01_nimiq_provider_and_chain.md:450-467,720`) with
  ~1-second blocks. A per-game anchor (root recomputed and republished after every single signed
  game) is affordable in a way it would not be on a fee-charging chain — closing the "unanchored gap"
  in §7 to the width of one game rather than a batching window, if the product chooses to spend the
  UX cost of an extra confirmation per game.

## 6. What is technically required

### 6.1 Bundle format

```json
{
  "version": "chess/1 rating-bundle",
  "chain": "main",
  "address": "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
  "generatedAtBlock": 1234567,
  "scoresheets": [
    {
      "text": "chess/1 scoresheet\nmain\n<32-hex gameId>\n<white NQ...>\n<black NQ...>\n1-0\ncheckmate\n41\n<finalFen>\n1234500\n<movesHash base64url>\nrated\n",
      "white": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" },
      "black": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" }
    }
  ],
  "puzzleCards": [
    {
      "text": "chess/1 puzzle card\nmain\n<32-hex sessionId>\n<solver NQ...>\n<witness NQ...>\ntraining\n20\n17\n1200\n1231\n1234400\n1234480\n<resultsHash base64url>\n",
      "solver": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" },
      "witness": { "publicKeyHex": "<64-hex>", "signatureHex": "<128-hex>" }
    }
  ],
  "completeness": {
    "scoresheetRoot": "<base64url, 32 bytes>",
    "puzzleCardRoot": "<base64url, 32 bytes>",
    "leafOrder": "endedAtBlock asc, gameId|sessionId asc — canonicalOrder() / canonicalCardOrder()",
    "anchorTxHash": "<Nimiq tx hash, optional>",
    "anchoredAtBlock": 1234550
  }
}
```

Every field maps directly onto an existing type: `text` is exactly what `parseScoresheet` /
`parsePuzzleCard` accept unmodified; `white`/`black`/`solver`/`witness` are exactly
`signature.ts`'s `NormalisedSignature` shape. Nothing about `scoresheet.ts` or `puzzlecard.ts` needs
to change — the bundle is purely a container around records those files already fully define.

**Two roots, not one**, because scoresheets and puzzle cards start their respective ratings from
different constants (`STARTING_RATING` vs `PUZZLE_START`) and must never be merged into one ordered
sequence — merging them would silently corrupt whichever rating happened to be interleaved wrong.

### 6.2 Merkle construction

Leaves, in `canonicalOrder()` / `canonicalCardOrder()`:

```
leaf[i] = SHA-256(0x00 ‖ utf8(bundle.scoresheets[i].text))
```

Interior nodes, RFC 9162 §2.1.1 exactly:

```
MTH(D[0:1]) = leaf[0]
MTH(D_n)    = SHA-256(0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n])),  k = largest power of two < n
```

`scoresheetRoot = MTH(all scoresheet leaves)`, `puzzleCardRoot = MTH(all puzzle-card leaves)`,
each base64url-encoded with the project's existing `toBase64Url` (`base64.ts`) so the encoding is
the one implementation already used for `movesHash` and `resultsHash` — no second base64
implementation introduced.

### 6.3 Verification algorithm — step by step

A third party, holding nothing but this JSON file and access to any public Nimiq node, does:

1. **Parse the envelope.** Reject anything not exactly this shape — same discipline as
   `parseScoresheet`'s "twelve lines and a trailing newline" (`scoresheet.ts:203`): no coercion, no
   "close enough."
2. **For every entry in `scoresheets`:** call `parseScoresheet(entry.text)` (throws on anything
   non-canonical — reject the entry, don't guess at it), then verify both signatures over that exact
   text using the same digest construction `verify-browser.ts` already implements
   (`signedMessageDigest`, `verifyOne`): derive each side's address from `publicKeyHex` via
   Blake2b-256 (`addressFromPublicKey`), confirm it equals the sheet's own `white`/`black` field, and
   `verifyAsync` the Ed25519 signature over `signedMessageDigest(text)`. Discard any entry that fails
   either check — do not include it in the recomputation, and record it in a "rejected" list so the
   verifier can see what was thrown out and why.
3. **Same for `puzzleCards`**, using `parsePuzzleCard` and `verifyPuzzleCardInBrowser`'s per-side
   logic, checking `solver` and `witness` against the card's own named addresses.
4. **Filter to games this address actually played** — `sideOf(sheet, address) !== null`
   (`scoresheet.ts:257`) — so a bundle cannot smuggle in someone else's games to pad the total, and
   confirm `bundle.address` itself is one of the two signers on every retained entry (a bundle
   claiming to be Alice's history must not contain a scoresheet Alice never signed at all).
5. **Recompute both Merkle roots** from the *verified* leaf set, in the same canonical order, and
   compare each to `completeness.scoresheetRoot` / `puzzleCardRoot`. A mismatch is not fatal — it is a
   finding: report it plainly (mirroring `computePuzzleRating`'s `brokenAt` pattern, §4), because a
   bundle whose signatures are all genuine but whose declared root does not match its own contents is
   a different, specific kind of untrustworthy than one with a forged signature, and a verifier should
   be told which.
6. **If `anchorTxHash` is present:** fetch that transaction from any public Nimiq node (a light
   client suffices — no full node, and certainly no Scoresheet server, required) and compare its
   `data` field to the recomputed root (or the root's short encoding, if a version tag/leaf-count
   prefix is used within the 64-byte budget). This is the step that removes Scoresheet from the trust
   path entirely: the verifier is now checking a public chain, not a claim from this project.
   **Also check `anchoredAtBlock` is greater than or equal to every included entry's `endedAtBlock`** —
   without this, a bundle could claim an anchor that predates some of the games it contains, which
   would be internally inconsistent and should be flagged, not silently accepted.
7. **Recompute the rating.** Run `toRatedGame` + `computeRatings` (`elo.ts:115,166`) over the verified,
   filtered scoresheet set, and `computePuzzleRating` (`puzzlecard.ts:314`) over the verified puzzle
   cards. Compare the resulting number(s) to whatever the bundle or its holder separately claims.
   **Agreement is the proof — there is no privileged number.** If the third party's own recomputation
   disagrees with what the player claims, the player's claim is wrong, full stop; nothing in this
   design asks the verifier to trust Scoresheet's arithmetic over their own.

### 6.4 Dependencies, exactly

`@noble/ed25519` (MIT, ~23 kB) and `@noble/hashes` (MIT) for SHA-256, Blake2b and the Merkle tree;
this project's own MIT `@scoresheet/core` for `parseScoresheet`, `parsePuzzleCard`,
`canonicalOrder`, `canonicalCardOrder`, `computeRatings`, `computePuzzleRating`. No Scoresheet server.
No DID resolver. No JSON-LD processor. No WASM. This is the same dependency set
`apps/web/src/verify-browser.ts` already ships, documented already in `NOTICES.md`.

## 7. What could break

### What a verified bundle proves

- Every retained scoresheet/puzzle-card was genuinely signed by exactly the two addresses it names,
  independently re-derived from the public keys, not merely asserted.
- The rating number is exactly what plain Elo (or the puzzle chain), applied in the one specified
  canonical order, produces from exactly this verified game set — because the verifier ran the same
  pure function the app runs, not a description of it.
- **If, and only if,** an anchor transaction is present and its on-chain `data` matches the recomputed
  root: the exact set of games/puzzle-runs in this bundle is the exact set that was publicly
  committed to at `anchoredAtBlock` — so a bundle handed to a verifier *after* that point cannot have
  had entries quietly removed since, or the recomputed root would visibly disagree with what is
  permanently on-chain.

### What this bundle does NOT prove — stated bluntly

- **Completeness before the first anchor, or of anything signed after the last one, is not provable
  by this design, or by any design in this research pass.** A player can withhold any number of
  losses from a bundle handed to a verifier, and unless the verifier already holds an earlier anchor
  to compare the recomputed root against, nothing detects the omission. This is not a gap specific to
  Scoresheet — Certificate Transparency states the identical limit about its own logs: an anchor
  makes *removal after publication* detectable; it does not, and cannot, make *non-publication*
  provable (`portable-identity.md` §3, §7). The correct way to state this product's claim is: "no game
  this bundle includes can be silently un-included after the date shown," never "this is every game
  this player has ever played."
- **It does not prove a human played the moves.** Unchanged from `SPEC.md` Part F6 — the move-time
  variance signal is a signal, not a verdict, and nothing about bundling many games changes that per
  game.
- **It does not make the rating comparable to any other pool.** Bundling and anchoring a Scoresheet
  history does not make its number comparable to a Lichess, Chess.com, or FIDE rating — those pools
  remain disjoint, exactly as `SPEC.md` Part F6 already states for the single-pool case, and as
  independently evidenced by the existence of third-party rating-converter tools whose entire purpose
  is bridging incomparable scales
  (`https://lichess.org/@/NoseKnowsAll/blog/introducing-a-universal-rating-converter-for-2024/X2QAH27t`).
- **It does not survive key loss for anything never distributed.** A scoresheet that exists only on
  two now-inaccessible devices and was never shared into any bundle or anchor is gone — unchanged from
  `SPEC.md` Part F6 ("It does not survive both players losing their keys. Nothing signed does.").
  Distribution (handing the bundle to a third party, or anchoring it) is what makes a record survive
  key loss going forward; nothing does so retroactively.
- **A verified bundle full of one opponent still verifies perfectly and still means nothing about
  skill.** Portability and completeness-proving do not touch the farming problem `SPEC.md` Part F4
  already names — `distinctOpponents` (`elo.ts`'s `Rating.distinctOpponents`) has to travel with any
  rating claim and be checked by the verifier, exactly as it must be checked today. A bundle format
  that displayed the rating without also surfacing this field would be a strictly worse claim than
  the one the app already makes.
- **An anchor transaction proves inclusion in what was submitted at that block; it does not
  independently prove the root was generated honestly "as of" the claimed time** beyond the
  `anchoredAtBlock ≥ every endedAtBlock` consistency check named in §6.3 step 6 — a check a naive
  implementation could easily skip, which is exactly why it is called out here rather than left
  implicit.
- **NOT VERIFIED:** whether Nimiq Pay itself (closed-source) passes a 64-byte `data` payload through
  unmodified, truncates it, or rejects it — the SDK imposes no client-side check
  (`01_nimiq_provider_and_chain.md:383-388`), but the host app was not independently confirmed in this
  research pass. Settle this with an actual 64-byte testnet send and a read-back before relying on
  the anchor step in production.

## 8. What we can uniquely do because of Nimiq

- **Anchor after every game, not on a batching schedule**, because a zero-fee transaction is valid at
  consensus and confirmed on mainnet, and blocks land roughly every second
  (`01_nimiq_provider_and_chain.md:450-467,720`; block time per
  `C:\Users\prate\nimiq\clones\developer-center\content\protocol\consensus\block-format.md:112` and
  `C:\Users\prate\nimiq\research\verification\05b_backend_sections_3_to_6.md:535`). This shrinks the
  "unanchored gap" named in §7 to the width of a single game if the product is willing to spend one
  extra confirmation per game, a trade-off no fee-charging chain offers for free.
- **A 64-byte data cap that fits a 32-byte SHA-256 root plus 32 bytes of headroom** for a version tag
  and leaf count, with no compression scheme, no calldata-optimisation trick, and no L2 required
  (`01_nimiq_provider_and_chain.md:343-392`, `MAX_BASIC_TX_RECIPIENT_DATA_SIZE = 64`,
  `primitives/src/policy.rs:71`).
- **The identifier a third party checks against is the wallet's own address** — no DID method, no
  resolver, no registry — because a Nimiq address is already a 20-byte Blake2b-256 digest of the same
  Ed25519 public key `sign()` exposes, verified byte-for-byte against `@nimiq/core`'s own derivation
  (`apps/web/src/verify-browser.ts:16-21,70-72`). The identity layer VC/DID spend two whole
  specifications standardising is, for this product, already solved by the object the player already
  holds.

## 9. Licence and reuse verdict

Every dependency this design needs is already MIT and already vendored in this project:
`@noble/ed25519` and `@noble/hashes` (both MIT, `NOTICES.md`), plus this project's own MIT
`@scoresheet/core`. The one new piece of code — the RFC 9162 Merkle construction — should be written
clean-room from the RFC's own published pseudocode (IETF Proposed Standard; algorithms are free to
implement, no licence encumbrance, no code copied from any implementation) and shipped under the same
MIT licence as the rest of `packages/core`. **No new dependency, no WASM, no VC/DID library, no
external log-operator relationship is required to ship this.** The verdict from `portable-identity.md`
§9 stands: adopt the Merkle mechanism, reimplemented from the standard; do not adopt VC or DID for
this bundle, because nothing in either standard adds a guarantee this design does not already have
from the signatures, the ordering rule, and the root.
