# Portable, proof-carrying chess identity

Two questions this note answers:

1. Can a player's **entire** chess history be made cryptographically portable, not just one game?
2. Could a third party import a Scoresheet profile into their own application and verify the rating
   without trusting Scoresheet at all?

Short answers, argued below: **(1) yes, and the missing piece is one thing — a Merkle commitment
over the ordered set of a player's signed scoresheets, not a new signing scheme.** **(2) yes, and it
is already true today for a single game** — `apps/web/src/verify-browser.ts` verifies a scoresheet
with no server, no WASM and two 20-ish-kB MIT libraries. Extending it to a whole history is an export
format and one new primitive (the Merkle root), not a rebuild.

The concrete bundle format and verification algorithm are specified in the companion file,
`proof-carrying-rating.md`. This file is the literature review that justifies the design choices in
it — what the standards actually offer, what they cost, and where they are ceremony we should not
adopt.

---

## 1. What they do

- **W3C Verifiable Credentials Data Model 2.0** (`https://www.w3.org/TR/vc-data-model-2.0/`, W3C
  Recommendation, 2025-05-15) standardises a JSON-LD data model for a signed claim (a "verifiable
  credential": issuer, subject, claims, a proof) and a "verifiable presentation" — a holder-assembled
  bundle of credentials, itself signed by the holder, that a verifier receives. It defines four roles:
  issuer, holder, verifier, and a "verifiable data registry" that mediates identifiers and
  verification material. It explicitly delegates the actual signature mechanism to sibling specs
  (Data Integrity 1.0, JOSE/COSE).
- **W3C Decentralized Identifiers (DID) Core** (`https://www.w3.org/TR/did-core/`, W3C
  Recommendation) standardises the syntax `did:<method>:<method-specific-id>` and a "DID document" —
  a resolvable object naming a controller, one or more `verificationMethod` public keys, and the
  purposes each key is authorised for (authentication, assertion, key agreement, etc.).
- **RFC 9162, Certificate Transparency v2** (`https://www.rfc-editor.org/rfc/rfc9162.html`, IETF
  Proposed Standard, obsoletes the experimental RFC 6962) standardises an append-only Merkle-tree log
  with two proof types — inclusion proofs (a leaf is in the tree) and consistency proofs (an older
  tree state is a strict prefix of a newer one) — plus a Signed Tree Head the log periodically
  commits to, and a gossip/monitoring pattern so that any interested party, not just the log operator,
  can catch a log that lies.
- **ERC-8004, "Trustless Agents"** (`https://eips.ethereum.org/EIPS/eip-8004`, Ethereum draft
  standard, proposed 2026-08-13) standardises three minimal on-chain registries for autonomous
  agents: an identity registry (an ERC-721 NFT per agent), a reputation registry (permanent,
  immutable client feedback), and a validation registry (pluggable independent checks). No VC, no
  DID document, no JSON-LD.
- **Gitcoin Passport / Human Passport** (`https://passport.human.tech/`) ships a portable-reputation
  aggregator: a wallet collects "stamps" — verifiable credentials from third-party verifiers (Google,
  BrightID, etc.) — and a score is computed from which stamps are present. Live since 2022-ish, still
  running, acquired by Holonym for $10M in late 2024 and rebranded.
- **Obscura** (`https://blog.horizen.io/trade-with-proof-not-trust-how-obscura-is-making-reputation-private-and-verifiable`)
  is a shipped-adjacent product that answers exactly the "hiding losing trades" problem this task
  names: a ZK circuit ingests a trader's *entire* trade set for a fixed time window, commits to a hash
  of the full set, and proves aggregate stats (PnL, win rate, trade count) over it. Omitting a trade
  changes the hash, so the proof and the omission cannot both be valid.
- **World Chess × Algorand, "Universal Chess Passport"** (`https://algorand.co/universal-chess-passport`,
  `https://en.chessbase.com/post/the-chess-passport-is-here`, whitepaper published April 2025) is the
  closest prior art to this project's exact subject: a DID-based, verifiable-credential identity for
  chess players, tied to World Chess's FIDE Online Arena rating, pitched as one login and one
  portable identity across chess platforms.
- **Eternal Chess** (Sui + Walrus, `https://medium.com/@jayepaul81/i-built-a-chess-game-where-every-win-lives-forever-on-the-blockchain-heres-how-1b22ea69cb65`)
  ships one game's permanence: a finished game mints an NFT carrying three Walrus blob references —
  full PGN, a board-position PNG, and a structured move/FEN JSON — stored on decentralised storage
  rather than a server.

## 2. Why it works

- **VC/DID's separation of concerns** — what is claimed, who signed it, how it is transported — means
  a verifier never needs a live connection to the issuer. That is the one idea worth keeping, and
  Scoresheet already has it: the scoresheet *is* the credential, the two players are mutual
  co-issuers, and `verifyScoresheetInBrowser` (`apps/web/src/verify-browser.ts:162`) is the verifier
  logic, already built.
- **CT's Merkle construction** works because an inclusion proof is `O(log n)` in tree size
  (`ceil(log2(n)) + 1` nodes, RFC 9162 §2.1.1) and a consistency proof between two tree sizes is the
  same order — so a stranger can check "my game is in this history" or "this history is a superset of
  the one I saw yesterday" in kilobytes, never by re-downloading the whole log. Silent rewriting fails
  a consistency proof deterministically; there is no way to remove a committed leaf without the root
  changing in a way a witness can catch.
- **Gossip/monitoring** is what actually delivers CT's "nobody can silently remove an entry" property
  — not the Merkle tree alone. A tree with no one checking consistency proofs over time is just a
  data structure; the property comes from an ecosystem of independent monitors comparing views. CT
  achieves this with dozens of independently operated logs and browser vendors auditing them.
- **Obscura's "commit to the whole set" trick** works because the circuit's public input is a hash of
  every trade in the window, computed inside the proof — there is no path through the circuit that
  produces a valid proof from a subset. It is the ZK version of the same idea CT uses without ZK: bind
  the claim to a commitment over the complete set, not the individual items.
- **ERC-8004 works by being minimal.** It puts identity and reputation on-chain as plain registries —
  no resolver layer, no credential schema negotiation — which is exactly why agents from different
  operators can read each other's reputation with a single RPC call instead of a DID-resolution round
  trip.

## 3. What they do badly

- **VC/DID is ceremony for this problem, and the spec says so itself.** VC 2.0's own text: *"the
  verifiability of a credential does not imply the truth of claims encoded therein"* and validation —
  deciding whether to trust an issuer — is explicitly *"outside the scope of this specification."*
  DID Core is equally explicit that it does not solve trust establishment or sybil resistance. Neither
  spec adds a cryptographic guarantee beyond "a signature verifies" — which two lines of Ed25519
  already give Scoresheet. What they add is a JSON-LD context, a DID method choice, a resolver
  dependency, and a credential-schema negotiation layer, none of which are needed when the entire
  claim is a fixed 12-line canonical text everyone already agrees on the shape of. Adopting VC/DID
  here would be replacing 200 lines of MIT TypeScript
  (`packages/core/src/scoresheet.ts` + `apps/web/src/verify-browser.ts`) with a JSON-LD processor, a
  DID resolver, and a schema registry, for the same cryptographic guarantee. **This is the sceptical
  conclusion the task asked for, stated plainly: for a single, fixed-shape, two-party-signed record,
  VC/DID is not worth adopting.**
- **DID resolution needs infrastructure DID Core does not provide** — a registry (a chain, a `did:web`
  domain, etc.) and a resolver a verifier must trust or run. Nimiq already has the equivalent for
  free: an address *is* a public-key commitment (Blake2b-256, first 20 bytes), derivable by anyone
  from the same public key the wallet already produces (`apps/web/src/verify-browser.ts:70-72`,
  cross-checked against `@nimiq/core`'s own output per that file's header comment). Standing up a DID
  method to wrap an address that already does this job is inventing a second layer to replace a first
  layer that already works.
- **CT's guarantee does not survive being a single, small operator.** The "nobody can silently remove
  an entry" property is a property of the *ecosystem* (many independent monitors), not of the Merkle
  tree in isolation. A one-project log is its own single point of failure unless someone outside the
  project actually runs consistency checks — this matters directly for Scoresheet's honesty about
  what an anchor can and cannot promise (see file 2, §7).
- **World Chess × Algorand is not evidence of anything operational yet.** As of the April 2025
  whitepaper, it is described as *"in development on a small scale to test its feasibility"* — no
  public source, no measured cost, no user-facing product to read. It validates that a serious chess
  organisation considers this problem worth solving with DIDs/VCs; it does not validate that DIDs/VCs
  are the right tool, and there is nothing shipped to learn operational lessons from.
- **Eternal Chess solves permanence, not portability or completeness.** Minting a game to an NFT is a
  discretionary per-game action the player chooses to take — nothing stops a player minting every win
  and simply never minting a loss. It also computes no rating and has no cross-game aggregation; it is
  a proof of one thing, one time, not the differentiator this project is built on.
- **Obscura is expensive and not open.** The blog post states "up to 10 trades per proof" and
  "2 to 5 seconds of proving time," with recursive aggregation for larger sets described as
  in-progress, not shipped. **NOT VERIFIED:** whether any of Obscura's implementation is open source —
  no repository was found in this research pass, so nothing from it is licence-reusable (see §9).
  Scoresheet does not need this cost at all: the completeness problem here has no privacy requirement
  (everyone's whole history is meant to be public), so a plain Merkle root does the same job as
  Obscura's ZK circuit for zero proving time and zero circuit-size limit.
- **Gitcoin/Human Passport verifies its inputs, not its output.** Each "stamp" is a checkable
  credential, but the score computed from which stamps are present is a server-side weighting that
  can change without an on-chain trace — the composition step is exactly the part Scoresheet's design
  refuses to leave off-chain (`elo.ts`'s own stated goal: *"a stranger's browser and our server cannot
  possibly disagree. If they ever do, ours is wrong."*).

## 4. What we should copy conceptually

- **CT's split between the log (large, off-chain) and the commitment (tiny, on-chain)** is the direct
  template for a "full history" export: keep every scoresheet as plain signed text (already the
  design), and add one 32-byte SHA-256 Merkle root over the ordered set as the thing that gets
  anchored. Nothing about the existing per-game format changes.
- **CT's exact hash construction (RFC 9162 §2.1.1)**, not an ad-hoc one: leaves are
  `HASH(0x00 || d)`, interior nodes are `HASH(0x01 || MTH(left) || MTH(right))`, and an unbalanced
  subtree is handled by splitting at `k`, the largest power of two smaller than `n` — never by
  duplicating a hash to pad an odd level. The domain-separation prefix bytes (`0x00` vs `0x01`) exist
  specifically to stop a second-preimage attack where an interior-node hash is replayed as if it were
  a leaf; skipping them would be exactly the kind of "looks right, isn't" bug this project's own
  canonicalisation discipline (`scoresheet.ts`'s "one text, one meaning") is built to avoid.
- **Obscura's "commit to the whole set, not the items" principle**, applied without the ZK machinery
  it needs for privacy — Scoresheet's version of "prove you didn't hide a losing trade" is "prove you
  didn't hide a losing game," and a public Merkle root gives exactly that guarantee, in plaintext,
  because nothing here needs to stay private.
- **ERC-8004's minimalism** — identity is the thing you already have (an address), reputation is a
  small append-only structure, no resolver, no schema negotiation. This is the register Scoresheet
  should stay in rather than moving toward VC/DID's generality.
- **VC's role vocabulary (issuer / holder / verifier)**, kept as vocabulary only: in a scoresheet both
  players are co-issuers of the same credential; in a puzzle card the witness is issuer-like and the
  solver is holder (`puzzlecard.ts`'s own header already describes the witness this way without using
  the term). Useful for talking about the design, not for adopting the standard.

## 5. What we can do better

- **A single verification function, not a standards stack.** Where VC/DID needs a JSON-LD processor,
  proof-suite plugins, and a DID resolver, Scoresheet needs one already-written 240-line file
  (`apps/web/src/verify-browser.ts`) plus two MIT libraries (`@noble/ed25519`, `@noble/hashes`) —
  confirmed as the deliberate design in that file's own header, which computes the exact cost VC/DID
  would have added ("`@nimiq/core`... roughly 50 MB resident and a fifty-millisecond load" avoided by
  going small). Portability should extend this file, not replace it with a heavier standard.
- **Completeness without privacy machinery.** Obscura needs ZK because a trader's individual trades
  are commercially sensitive and must stay hidden while the aggregate is proven. A chess player's
  individual games are the whole point of the product being public — nothing here needs hiding, so
  the entire ZK-circuit cost Obscura pays buys us nothing. A plain SHA-256 Merkle root gives the same
  "prove you didn't omit anything since the last commitment" property for effectively zero
  computation.
- **Anchor cost that CT itself does not have.** CT logs batch and rate-limit partly because writes to
  their backing infrastructure are not free. A Nimiq transaction with `fee: 0` is valid at consensus
  and was confirmed live on mainnet
  (`C:\Users\prate\nimiq\research\verification\01_nimiq_provider_and_chain.md:720`), with ~1-second
  block times (`C:\Users\prate\nimiq\clones\developer-center\content\protocol\consensus\block-format.md:112`,
  `C:\Users\prate\nimiq\research\verification\05b_backend_sections_3_to_6.md:535`). Scoresheet could
  anchor a Merkle root after literally every game — a throughput CT does not offer and does not need
  to, because certificates are not issued at Nimiq's block cadence.
- **Say the honest limit instead of dressing it up as solved.** Neither VC/DID nor CT nor Obscura
  actually solves "prove a track record is complete before any commitment exists to check it against"
  — none of them claim to. The honest thing to do, matching `SPEC.md` Part F6's existing discipline
  ("Say the limit out loud"), is to say the same about history completeness rather than imply the
  Merkle root solves more than it does. File 2 §7 states this bluntly.

## 6. What is technically required

At the level this file operates (should we build this at all, and with which primitive), the
requirement is narrow:

- A **deterministic leaf order** — already specified and already code: `canonicalOrder()`
  (`elo.ts:107`) for scoresheets, `canonicalCardOrder()` (`puzzlecard.ts:276`) for puzzle cards. Reuse
  both rather than inventing a third ordering rule.
- A **Merkle tree implementation** following RFC 9162 §2.1.1 exactly (domain-separated leaf/interior
  hashing, power-of-two split for unbalanced levels) — new code, roughly 40-60 lines, no dependency
  beyond the `sha256` already vendored (`@noble/hashes`, already MIT, already in the bundle per
  `NOTICES.md`).
- An **anchoring transaction**: `sendBasicTransactionWithData({ data: <root bytes or short encoding> })`
  from the Nimiq Provider API (`C:\Users\prate\nimiq\NIMIQ_DEV_DOCS_FULL_REFERENCE.md:57`). The data
  field is capped at 64 bytes for a basic-account recipient
  (`C:\Users\prate\nimiq\research\verification\01_nimiq_provider_and_chain.md:343-392`, verified
  against `primitives/src/policy.rs:71` and empirically confirmed: 64 bytes OK, 65 throws
  `Overflow`) — a 32-byte SHA-256 root fits with 32 bytes free for a version tag and a leaf count.
- An **export/import bundle format** — this is what file 2 specifies exactly, byte for byte.

## 7. What could break

- **A Merkle root anchored on Nimiq only proves what it proves at that block** — games signed after
  the last anchor are, until the next one, in exactly the same trust position as a lone scoresheet
  today: real, but not yet provably complete. This is not a flaw in the design, it is the same
  property CT's Maximum Merge Delay exists to bound (§4 of RFC 9162) — the honest statement is "as of
  block N, this is the whole history," not "this is always instantaneously complete."
  - **NOT VERIFIED:** whether Nimiq Pay (the closed-source host app) truncates, rejects, or mishandles
    a 64-byte `data` payload differently from the SDK's pass-through behaviour — the SDK itself
    imposes no length check (`NimiqProvider.ts:141-152`, per the same verification file, §3.3). This
    must be settled by an actual testnet send of a 64-byte payload before anchoring is built.
- **A single-project log has no CT-style ecosystem of independent monitors by default.** Unless a
  second party (a player, an opponent, a third-party site) independently keeps and checks consistency
  proofs across anchors, "detectable removal" is a property that exists in principle but nobody is
  exercising in practice. Publishing the verification algorithm (file 2) as something anyone can run
  is what gives this a chance of actually being checked, the same way CT's guarantee depends on
  browser vendors and researchers actually running monitors.
- **Rating comparability does not follow from portability.** Making a full history exportable does
  not make Scoresheet's Elo pool comparable to Lichess's, Chess.com's, or FIDE's — this is
  independently confirmed by the existence of third-party rating-converter tools
  (`https://lichess.org/@/NoseKnowsAll/blog/introducing-a-universal-rating-converter-for-2024/X2QAH27t`)
  whose entire reason to exist is that these numbers are not on the same scale. `SPEC.md` Part F6
  already states this for the single-pool case; portability changes nothing about it.

## 8. What we can uniquely do because of Nimiq

- **Zero-fee, ~1-second-block anchoring** turns "commit a Merkle root periodically" into "commit a
  Merkle root after every game, for free," which is not available to a CT-style log on a fee-charging
  chain and is not something CT's own backing infrastructure offers either (verified: fee 0 is valid
  at consensus and confirmed on mainnet, `01_nimiq_provider_and_chain.md:450-467,720`).
- **A 64-byte data cap that exactly fits a SHA-256 root plus a tag**, with no compression, no L2, no
  batching logic required (`01_nimiq_provider_and_chain.md:343-392`).
- **The wallet's own public key already is the identifier.** A Nimiq address is a 20-byte
  Blake2b-256 digest of the same Ed25519 public key `sign()` already exposes
  (`apps/web/src/verify-browser.ts:71-72`), so there is no DID method to design, no resolver to run,
  and no registry to stand up — the identifier layer DID Core spends an entire specification on is
  already solved by the wallet the player already has.

## 9. Licence and reuse verdict

| Source | Licence | Verdict |
|---|---|---|
| W3C VC Data Model 2.0 | W3C Document Licence (spec text); implementable by anyone, no code shipped | **Not adopted.** Ceremony without an added cryptographic guarantee for a fixed-shape, two-party-signed record — see §3. |
| W3C DID Core | W3C Document Licence | **Not adopted.** The identifier problem it solves is already solved by a Nimiq address; standing up a DID method would duplicate, not add. |
| RFC 9162 (Certificate Transparency v2) | IETF; protocol/algorithm text is free to implement, no code shipped | **Adopt the mechanism, reimplement clean from the RFC's own pseudocode.** ~40-60 lines, MIT, matches this project's existing no-WASM, MIT-only discipline (`NOTICES.md`). |
| ERC-8004 | EIP text, Ethereum's process (EIPs are typically released CC0) | **Pattern only, not code.** Solidity/EVM-specific; Nimiq has no general smart-contract layer, so this informs the *shape* (minimal registries, no resolver) and contributes no reusable code. |
| Obscura (ZK trading track record) | **NOT VERIFIED** — no public repository found in this research pass; blog post only | **Not reusable.** Concept noted in §4; Scoresheet's version of the same problem has no privacy requirement, so the ZK cost this product pays is unnecessary here regardless of its licence. |
| Gitcoin / Human Passport | Historically open-source (Gitcoin Passport was on GitHub under MIT); **NOT VERIFIED** post-acquisition licence under Human Passport/Holonym — check before any reuse | **Pattern only** (stamp aggregation), not adopted — the scoring-composition-off-chain problem described in §3 is exactly what this project's design already refuses to do. |
| World Chess × Algorand "Chess Passport" | Whitepaper, no source published | **Not reusable — nothing shipped to take code or a licence from.** Watch for a future public repository. |
| Eternal Chess (Sui + Walrus) | **NOT VERIFIED** — no repository licence located in this research pass | **Pattern only** (off-server blob storage for large artefacts, e.g. a full history bundle too large to anchor directly) — do not reuse code without first locating and reading its licence. |
