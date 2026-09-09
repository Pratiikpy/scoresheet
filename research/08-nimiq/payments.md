# Sending NIM from a Mini App — payments, limits, and confirmation reality

**Scope:** the two "send NIM" provider methods, the transaction-data/memo limits, what actually happens on screen when a player taps confirm, and a specific, dated, organiser-confirmed instability in Nimiq Pay's own confirmation state. This is the layer both new features sit on top of — a puzzle-pool payout and a tournament entry are both, underneath everything else, a payment.

**Primary sources:**
- `C:\Users\prate\nimiq\research\verification\01_nimiq_provider_and_chain.md` §1–6 (executed tests against `@nimiq/core@2.21.0`, live mainnet reads, real transaction data)
- `npm pack @nimiq/mini-app-sdk@0.1.0` → extracted `provider.d.ts` (published surface, this session)
- `C:\Users\prate\nimiq\SIP_AND_SHIP_C2_CALL1_FINDINGS.md` (official Cycle 2 call transcript, the confirmation-instability finding)
- `C:\Users\prate\nimiq\SKOOL_FULL_ARCHIVE_FINDINGS.md` §7 (the HTLC-custody detail)
- Scoresheet's own code, read directly: `chess/apps/web/src/send-nim.ts`, `wallet.ts`; `chess/packages/server/src/nimiq-payout.ts`, `pool.ts`, `node.ts`
- `C:\Users\prate\nimiq\NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §3, §11 (documented error taxonomy, FAQ)

---

## 1. What they do

### 1.1 The two send methods

| Method | Signature | Data field | Confirmation |
|---|---|---|---|
| `sendBasicTransaction(tx)` | `{recipient, value, fee?, validityStartHeight?}` | none | native Nimiq Pay dialog |
| `sendBasicTransactionWithData(tx)` | `{recipient, value, data, fee?, validityStartHeight?}` | `data: string`, up to 64 bytes | native Nimiq Pay dialog |

Both resolve `Promise<string | ErrorResponse>` — a tx hash string on success, or a resolved (not thrown) `{error:{type,message}}` object. `value` is Luna (1 NIM = 100,000 Luna, `verification/01` §4.1, `primitives/src/coin.rs:26`). Neither method takes positional arguments — one options object each, confirmed against the published `.d.ts` this session and independently re-confirmed against `send-nim.ts`'s own header comment ("checked rather than assumed").

### 1.2 The 64-byte memo cap — executed, not documented-only

`MAX_BASIC_TX_RECIPIENT_DATA_SIZE = 64` (`primitives/src/policy.rs:71`), enforced in `basic_account.rs:27`. **Executed against real mainnet parameters** (`verification/01` §3.2):
```
   63 -> OK   (serializedSize=229)
   64 -> OK   (serializedSize=230)
   65 -> THROW: Overflow
```
64 bytes exactly, not 64 characters — a `data` field is a byte array, and the SDK types it as `string` with no encoding note. One emoji costs 4 bytes; `é` costs 2. **The SDK performs zero client-side validation of this** (confirmed absent from the published `provider.d.ts`'s method body this session) — an app that doesn't self-check discovers the limit only from a chain-level rejection. Scoresheet's own `send-nim.ts:memoFits()` (`new TextEncoder().encode(memo).byteLength <= 64`) and `nimiq-payout.ts`'s equivalent check are both already correct against this exact rule.

An empty `data` field uses the compact "Basic" wire format (139 bytes serialized); **any** non-empty memo forces the larger "Extended" format (up to 230 bytes at the 64-byte cap) — a real but small cost, already accepted by design (`SPEC.md` P2: the memo is what makes every payout independently auditable on a block explorer).

### 1.3 No dust limit, no minimum beyond `value > 0`

`value == 0` throws `ZeroValue` (`lib.rs:367-374`, executed: `value=0 -> THROW`); `value=1` Luna is valid (executed: `OK, size=139`). There is no `MIN_FEE` and no dust constant anywhere in `@nimiq/core`'s source (`verification/01` §4.1, explicit repo-wide grep). At the price checked 2026-09-04 ($0.00039007/NIM, CoinGecko `nimiq-2`), **$0.02 is ~5.1 million Luna** — trivially sendable, nowhere near any protocol floor. This is a real, checked asymmetry against staking, which does carry a protocol-enforced 100 NIM minimum (`staking.md` §1.5) — an ordinary tip or pool contribution has no such floor.

### 1.4 Fees

`fee` is optional on every send method; the documented behaviour, repeated identically eight times across `nimiq-provider.md`'s examples, is *"Nimiq Pay chooses a fee automatically, using 0 if possible."* A zero-fee transaction is protocol-valid (no fee check in `Transaction::verify()`) and was observed confirmed live on mainnet (`verification/01` §5.2). Fee only matters for block-space priority under congestion, which is not today's operating regime at ~1s blocks / 100KB micro-bodies. **Scoresheet's decision, already made and correct: omit `fee` entirely, never surface a fee control.**

### 1.5 What the wallet UI shows the user — the documented error taxonomy

`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §11, verbatim: *"the user cancels the confirmation dialog, the request times out, no accounts are available, the network is unreachable, or the transaction itself is invalid"* — those five, and only those five, named failure modes. `PermissionDeniedError` (rejection) and `InvalidTransactionError` (malformed tx) are the two documented error types on the send methods. **Insufficient-funds behaviour is undocumented and unimplemented in the open SDK** (`verification/01` §2.4 — no `insufficient` string anywhere in the SDK, `ErrorResponse` carries only a free-text `{type, message}`) — it is decided entirely inside the closed-source Nimiq Pay app, with an unknown exact error shape. **NOT VERIFIED**: exact wording/type on an over-balance send; the safe design (already Scoresheet's) is to treat any non-hash outcome as one undifferentiated "not sent" state, never to claim "insufficient funds" specifically.

### 1.6 The HTLC-custody surprise

Relayed on the Sip & Ship call and recorded in `SKOOL_FULL_ARCHIVE_FINDINGS.md` §7: *"Nim is not held in wallet attached to your Nimiq Pay App, it's held in HTLCs. The contracts are not static so you need to ensure you consider a dynamic HTLC tracking."* Raised again, unanswered even by the organiser, in the Cycle 2 Call #1 Q&A (`SIP_AND_SHIP_C2_CALL1_FINDINGS.md`:164) — nobody on the call, including the team, could fully explain the mechanism. **Relevant only if a Mini App reads a player's balance/history via low-level chain queries rather than through the provider** — Scoresheet's current design (never reads a player's balance; `wallet.ts` has no balance-reading path at all) already avoids depending on this. **NOT VERIFIED** whether this interacts with staking specifically — flagged as an open question worth testing on a real device before building any staking flow that assumes the staker's address behaves like a plain externally-owned account.

### 1.7 Transaction-confirmation instability — dated, organiser-confirmed

Verbatim, `SIP_AND_SHIP_C2_CALL1_FINDINGS.md`:162, sourced to Kaichao Sun's report on the call and Martin (the organiser)'s own reply:

> *"a Mini-App-initiated tx sits at 'waiting for consensus' / 'waiting for top up' in Nimiq Pay while the block explorer already shows it confirmed, with long waits."* Martin: **"It is a known issue and it can happen from time to time. We just did a hard fork… and this is part of the reason why we delayed the start of cycle number two — to make sure we were able to update Nimiq Pay and merge everything and work on all the bugs."**

**This is real, dated, and admitted by the team itself** — not a rumour, not an inference. The stated design consequence, also from that source: *"never block your UI on Nimiq Pay's own confirmation state. Confirm against chain/your own backend and show optimistic-but-honest status, or you will look broken to a judge through no fault of your code."*

### 1.8 Scoresheet's own current usage — precisely, as read this session

- **Client-side (`window.nimiq`, player's own wallet):** `sendBasicTransactionWithData` only, via `send-nim.ts:sendNim()`. Used for two things: a fixed-amount tip to an opponent after a game (`TIP_AMOUNTS = [5, 25, 100]` NIM, deliberately not free-text, memo `chess tip <gameId>`), and a voluntary contribution to the puzzle pool (memo `chess pool <day>`). Both memos are asserted `≤64` bytes before the call is ever made. `sendBasicTransaction` (no data) is never called — every player-initiated send always carries a memo.
- **Server-side (`@nimiq/core`, the pool's own key, `nimiq-payout.ts`):** builds a `Transaction` by hand (not `TransactionBuilder.newBasicWithData`, an earlier/equivalent hand-rolled path), signs it offline with `SignatureProof.singleSig`, and broadcasts only the finished bytes via `sendRawTransaction` — the private key never reaches the RPC endpoint. `VALIDITY_WINDOW = 200` blocks (a self-imposed, conservative choice — well inside the protocol's actual 7,200-block `TRANSACTION_VALIDITY_WINDOW_BLOCKS`, `staking.md` §1.7).
- **Confirmation tracking today:** `nimiq-payout.ts:send()` returns the tx hash from `sendRawTransaction` and the flow stops there — there is **no follow-up read** to confirm the payout actually settled. `node.ts:createBlockHeight()` only reads the current chain height (cached 10s) for stamping a finished game, and treats a failed height read as `null` rather than fatal — a good pattern, but it is not a settlement watcher.

---

## 2. Why it works

- **Zero fee by default plus no dust limit makes genuinely small payments practical.** A 2¢ tip or pool contribution costs nothing in fees and is nowhere near any protocol floor — a real, checked property, not marketing.
- **Offline signing, broadcast-only RPC.** `nimiq-payout.ts` signs entirely inside the process holding the key and only ever sends finished, already-signed bytes to a public node — the private key is never exposed to a third party, matching the same trust model Nimiq Pay itself uses for a player's own wallet (`sdk.md` §2).
- **The Extended-format cost only applies when a memo is actually used.** An empty-data basic transaction stays at the smaller 139-byte format; the 64-byte memo, when Scoresheet uses one, is a deliberate, bounded, self-explaining cost (`SPEC.md` P2) rather than a default overhead.

---

## 3. What they do badly

- **The confirmation state Nimiq Pay itself shows the player can lag the real chain — admitted, dated, tied to a recent hard fork.** An app that trusts the host's own UI state as ground truth will occasionally show a payment as unconfirmed or pending for far longer than it actually took to settle.
- **Insufficient-funds behaviour is entirely undocumented and closed-source.** An app cannot distinguish "declined by the user," "insufficient funds," and "malformed transaction" from the error shape alone with any reliability beyond string-matching common words — which is inherently fragile and language-dependent.
- **No client-side memo validation anywhere in the SDK** (§1.2) — the framework does nothing to help a builder discover the 64-byte cap before shipping; it is entirely on the app.
- **The HTLC-custody mechanism is real and unresolved even by the team**, and nothing in the Mini Apps documentation mentions it at all — it only surfaces in community/call transcripts, not in any reference page a builder would normally read.

---

## 4. What we should copy conceptually

- **`send-nim.ts`'s own pattern is already the right one and should be the template for any new send flow**: fixed amounts rather than free text (bounds the fat-finger risk on a payment screen), an explicit `memoFits()` assertion *before* the call rather than discovering the limit from a rejection, and a calm-vs-bad taxonomy that treats a declined dialog as a normal, expected outcome rather than an error.
- **"Confirm against chain/your own backend, never Nimiq Pay's own reported status"** — the organiser's own stated design consequence (§1.7) — should govern every payment-confirmation screen, and (per `staking.md` §8) any future staking-confirmation UI too, not payments alone.
- **Treat every resolved value as possibly-an-error, never rely on truthiness.** `sendNim()`'s own check (`typeof result === 'string' && result.length > 0`) before treating anything as success is the correct pattern and should be copied verbatim wherever a new send call is added.

---

## 5. What we can do better

- **Build an actual settlement watcher, not just a fire-and-forget broadcast.** `verification/01` §6.3 recommends running `@nimiq/core` as a light client server-side, driving settlement off `addTransactionListener` with `getTransactionsByAddress` as a reconciliation sweep, requiring a confirmation depth before anything irreversible happens. Scoresheet's current `nimiq-payout.ts` stops at the broadcast; `node.ts` only reads height. Closing this gap would directly answer §1.7's instability finding by giving the app its own independent source of truth rather than depending on Nimiq Pay's UI state or a bare `sendRawTransaction` return value.
- **Show the exact memo on screen before the tap.** The memo is permanent and public (`SPEC.md` P2) — surfacing it plainly before confirmation, rather than only after, costs nothing and removes any surprise about what will be visible on a block explorer forever. **NOT VERIFIED** whether Scoresheet's current tip/pool-contribution UI already does this — worth checking against the running app.

---

## 6. What is technically required

- `recipient`: a valid `NQ…` address. `value`: Luna, `Math.round`ed, never float. `data`: ≤64 **UTF-8 bytes**, asserted before the call (`memoFits()`), never assumed from character count.
- `fee`: omit.
- Every send call needs a preceding user tap — the same anti-pattern rule as `sdk.md` §4/§6 applies identically here; a tip or a stake are both confirmation-requiring calls.
- Any settlement-dependent logic (crediting a game as tipped, marking a pool contribution as received) should key off an **independently observed** chain event, not off the resolved promise from the send call alone, given §1.7.

---

## 7. What could break

- **The confirmation-instability finding, directly:** a UI that gates a "tip received!" state on Nimiq Pay's own status, rather than an independent chain read, can show "pending" for an already-settled payment — a real, admitted, currently-live behaviour, not a hypothetical edge case.
- **A backgrounded phone during a send.** `sendBasicTransactionWithData` can hang indefinitely if the app loses focus mid-dialog; `send-nim.ts`'s existing 120-second timeout is a reasonable, already-implemented bound, and any new send flow must keep the same discipline.
- **Treating a resolved `ErrorResponse` as a truthy success.** `sendNim()` already guards this correctly (`typeof result === 'string'`) — the thing that would break is a *new* send path that skips this check and reports a declined payment as sent.
- **A memo that silently exceeds 64 bytes because of an emoji or accented character miscounted by JS `.length` instead of UTF-8 byte length** — the exact trap `verification/01` §1.5a documents in a *different* context (message signing) but which applies identically here; `memoFits()` already uses `TextEncoder().byteLength`, the correct measure, and any new memo-constructing code must do the same.

---

## 8. What we can uniquely do because of Nimiq

- **Feeless, dust-free micropayments make stakes and tips economical at amounts no card rail can match.** Card processors floor around 30¢ per transaction (`BRIEF.md`); a $0.02–$2 tip or entry fee is native and free here — the exact range a chess-adjacent gift or small stake would actually want to be.
- **The 64-byte on-chain memo turns every payment into a self-explaining, permanently public receipt with no server trust required** — already Scoresheet's own design for the pool (`SPEC.md` K7/P2) and for tips (`chess tip <gameId>`); worth restating here as the payments-layer capability that makes both existing features and any new staked-tournament settlement independently auditable by a stranger with nothing but a block explorer.

---

## 9. Licence and reuse verdict

Same lineage as `sdk.md` §9: `@nimiq/mini-app-sdk`/`@nimiq/web3-provider-nimiq` MIT, `@nimiq/core` Apache-2.0, `developer-center` docs Apache-2.0 — all safe to depend on and quote/port with attribution. The organiser-call transcript (`SIP_AND_SHIP_C2_CALL1_FINDINGS.md`) and Skool archive are our own transcriptions/notes of a public community call and forum, not third-party code — no licence question applies; quoted here as primary-source evidence, not as reusable material.
