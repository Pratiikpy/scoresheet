# The Mini App provider surface — method by method

**Scope:** the injected `window.nimiq` provider, the `@nimiq/mini-app-sdk` npm package, and the separate server-side `@nimiq/core` library Scoresheet already depends on. Every signature below is either read from the **published npm package** (`npm pack @nimiq/mini-app-sdk@0.1.0`, extracted and inspected directly — the exact thing `npm install` gives a real Mini App) or from a **cross-checked local source clone**, or **executed** against the installed `@nimiq/core@2.21.0` in `chess/node_modules`. Nothing here is taken from memory or from a summary of a summary. Anything that could not be pinned to one of those three is marked **NOT VERIFIED**.

**Primary sources:**
- `C:\Users\prate\NIMIQ_DEV_DOCS_FULL_REFERENCE.md` (verbatim capture of `nimiq.dev/mini-apps`, 2026-08-29)
- Published package, fetched and extracted this session: `npm pack @nimiq/mini-app-sdk@0.1.0` → `package/dist/index.d.ts`, `package/dist/provider.d.ts`
- Source clone (ahead of npm by one unreleased commit, see §3): `C:\Users\prate\nimiq\reference-apps\nimiq-provider\packages\{nimiq,mini-app-sdk}\*.ts` (`github.com/nimiq/trust-web3-provider`, branch `nimiq`, pinned at commit `49cfe53`)
- `C:\Users\prate\nimiq\research\verification\01_nimiq_provider_and_chain.md` (executed tests against `@nimiq/core@2.21.0`, live mainnet reads)
- Scoresheet's own code, read directly: `chess/apps/web/src/wallet.ts`, `send-nim.ts`, `i18n.ts`, `demo-wallet.ts`; `chess/packages/server/src/staking.ts`, `nimiq-payout.ts`, `stake-cli.ts`, `node.ts`
- `chess/node_modules/@nimiq/core/package.json` (installed version, license) and executed Policy constants (see `staking.md` §1)

---

## 1. What they do

### 1a. The Nimiq Provider — `window.nimiq` (class `NimiqProvider`, package `@nimiq/web3-provider-nimiq`, bundled into `@nimiq/mini-app-sdk`)

Complete method list — this **is** the whole class, verified against the published `.d.ts` (`npm pack` output, `package/dist/provider.d.ts`), byte-identical to the source clone's `packages/nimiq/NimiqProvider.ts`:

| Method | Exact signature | Returns | Confirmation dialog? | Scoresheet uses it today |
|---|---|---|---|---|
| `listAccounts()` | `(): Promise<string[] \| ErrorResponse>` | array of `NQ…` addresses, or `{error:{type,message}}` | yes | **Yes** — `wallet.ts:connect()`, from a tap only |
| `sign(message)` | `(message: string \| {message: string, isHex?: boolean}): Promise<SignatureResult \| ErrorResponse>` | `{publicKey, signature}` hex | yes | **Yes** — `wallet.ts:signText()`, for the scoresheet |
| `isConsensusEstablished()` | `(): Promise<boolean>` | boolean | no | **Yes** — `wallet.ts:consensusEstablished()`, checked before signing |
| `getBlockNumber()` | `(): Promise<number>` | number | no | **Yes** — `wallet.ts:blockNumber()`, for the ending height |
| `sendBasicTransaction(tx)` | `({recipient: string, value: number, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | No — Scoresheet only ever uses the `WithData` variant below |
| `sendBasicTransactionWithData(tx)` | `({recipient: string, value: number, data: string, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | **Yes** — `send-nim.ts:sendNim()`, tips + pool contributions |
| `sendNewStakerTransaction(tx)` | `({delegation: string, value: number, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | **No, from a player's wallet.** The equivalent is called server-side against the pool's own key via `@nimiq/core`'s `TransactionBuilder.newCreateStaker` (`staking.ts:delegate()`) — a different code path, not this provider method |
| `sendStakeTransaction(tx)` | `({value: number, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | Same as above — server-side equivalent (`TransactionBuilder.newAddStake`) exists; the provider method itself is unused by any player |
| `sendSetActiveStakeTransaction(tx)` | `({newActiveBalance: number, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | No, neither side |
| `sendUpdateStakerTransaction(tx)` | `({newDelegation: string, reactivateAllStake?: boolean, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | No |
| `sendRetireStakeTransaction(tx)` | `({retireStake: number, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | No |
| `sendRemoveStakeTransaction(tx)` | `({value: number, fee?: number, validityStartHeight?: number}): Promise<string \| ErrorResponse>` | tx hash, or `ErrorResponse` | yes | No |
| `request<T>(args)` | `({method: string, params?}): Promise<T>` | routes to the host if `method` is one of the 10 above, otherwise to the configured RPC endpoint | depends | No — Scoresheet always calls typed methods directly |
| `setRPCUrl(url)` / `getRPC()` / `setRPC(rpc)` | RPC endpoint plumbing for `request()`'s fallback path | — | no | No |
| `connect()` / `disconnect()` / `getNetwork()` / `.connected` | provider lifecycle, inherited from `BaseProvider` | — | `connect()` calls `listAccounts()` internally | No — Scoresheet reads `window.nimiq` presence itself (`tier()`) rather than calling the provider's own `connect()` |

All values are **Luna** (1 NIM = 100,000 Luna, confirmed from `@nimiq/core`'s `primitives/src/coin.rs:26`, `verification/01` §4.1). `fee` is optional on every `send*` method and Nimiq Pay is documented to pick `0` when possible (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §3, `nimiq-provider.md` lines 151/190/227/…/404, repeated identically on all eight examples) — Scoresheet's own code never sets it, on either side.

**`WALLET_METHODS`** — the exact allowlist that gets routed to Nimiq Pay rather than to `request()`'s RPC fallback — is precisely these 10 names (`listAccounts, sign, sendBasicTransaction, sendBasicTransactionWithData`, and the 6 `send*Stake*`/`send*Staker*` methods). **`isConsensusEstablished` and `getBlockNumber` are *not* in this set** even though they hit the host directly — a sharp edge in the source itself: calling `nimiq.getBlockNumber()` works, but `nimiq.request({method:'getBlockNumber'})` is routed to the RPC fallback (or throws `No RPC URL configured` if none is set). Always call the typed methods (`verification/01` §2.2, independently re-read this session in the published `provider.d.ts`).

### 1b. `@nimiq/mini-app-sdk` (published npm 0.1.0) — the thin convenience layer on top

```ts
import { init, getHostLanguage, requestDeviceIdentifier } from '@nimiq/mini-app-sdk'
```

| Export | Exact signature (published `index.d.ts`) | What it does | Scoresheet uses it today |
|---|---|---|---|
| `init(options?)` | `(options?: {timeout?: number}): Promise<NimiqProvider>` | Polls `window.nimiq` every 50ms, rejects after `timeout` (default 10,000ms) with `"Nimiq provider was not injected. Are you running inside a Nimiq app?"` | **No.** Scoresheet does not depend on this package at all — it hand-declares its own `window.nimiq`/`window.nimiqPay` types in `wallet.ts` and reads them directly. `apps/web/package.json` lists no `@nimiq/*` provider package; only `@nimiq/core` and `@nimiq/identicons` are dependencies |
| `getHostLanguage()` | `(): string \| undefined` | Reads `window.nimiqPay?.language` | No — `i18n.ts` reads `window.nimiqPay?.language` directly (same effect, no dependency) |
| `requestDeviceIdentifier(options)` | `(options: {reason: string}): Promise<string>` | Reads `window.nimiqPay?.requestDeviceIdentifier(options)`, rejects if absent | No — `wallet.ts:deviceIdentifier()` calls `window.nimiqPay?.requestDeviceIdentifier` directly |
| `NimiqPayHostContext` (type) | `{readonly language?: string; requestDeviceIdentifier: (options:{reason:string}) => Promise<string>}` | The full injected host-context shape, **exactly two fields** | Scoresheet's own `NimiqPayHost` interface in `wallet.ts` matches this exactly, and its own comment records that an earlier draft wrongly added a third field — see §3 |

### 1c. `@nimiq/core` (npm `2.21.0`, Apache-2.0) — the raw library, used **server-side only**

This is a completely different surface from 1a/1b: it is the full Rust→WASM chain library, run in Scoresheet's own Node backend with the **pool's own private key**, never inside a Mini App WebView and never through Nimiq Pay's mediation. Already installed (`chess/node_modules/@nimiq/core`) and already used:

| What Scoresheet calls | Where | What it does |
|---|---|---|
| `KeyPair.derive`, `PrivateKey.fromHex`, `SignatureProof.singleSig` | `staking.ts`, `nimiq-payout.ts` | Sign transactions with the pool's own key, entirely offline |
| `TransactionBuilder.newCreateStaker`, `TransactionBuilder.newAddStake` | `staking.ts` | Build the pool's own staking transactions (see `staking.md` for the full class) |
| `StakingDataBuilder.setProof` | `staking.ts` | Fill the empty inner signature proof that `newCreateStaker`'s data carries (see `staking.md` §1) |
| `Transaction` (constructed by hand), `TransactionFlag` | `nimiq-payout.ts` | Build the pool's outbound puzzle-reward payouts, with a memo |
| Raw JSON-RPC (`getBlockNumber`, `getAccountByAddress`, `getStakerByAddress`, `sendRawTransaction`) | `stake-cli.ts`, `nimiq-payout.ts`, `node.ts` | Broadcast pre-signed bytes and read chain state, against `rpc.nimiqwatch.com` by default |

**Not yet called anywhere in the codebase, client or server:** `TransactionBuilder.newSetActiveStake`, `newUpdateStaker`, `newRetireStake`, `newRemoveStake`, `newCreateValidator`, and any of the validator-management builders. All exist and are documented (`staking.md` §1 has the full class).

### 1d. Ethereum Provider — `window.ethereum` (EIP-1193 + EIP-6963)

Not independently re-verified this session (the chosen features are NIM-only); carried over from `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §4, itself read verbatim from `nimiq.dev/mini-apps/api-reference/ethereum-provider.md`. Wallet-mediated: `eth_requestAccounts`/`requestAccounts`, `personal_sign`/`signPersonalMessage`, `eth_sendTransaction`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `rpcCall({rpcUrl,payload})`. Everything else (`eth_chainId`, `eth_getBalance`, `eth_call`, …) is proxied through `rpcCall` with no confirmation. **Gas is not abstracted for Mini-App-initiated EVM transactions** — the user must hold the chain's native gas token — stated verbatim in the official docs. Not used anywhere in Scoresheet.

---

## 2. Why it works

- **The provider is a thin message-passing shim, not a wallet.** `NimiqProvider.#internalRequest` calls `super.request()` (`BaseProvider`, from `@trustwallet/web3-provider-core`), which hands the call to an adapter that talks to the native host. No cryptography happens in the injected JS; every signature is produced inside Nimiq Pay and the key never crosses into the WebView (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §1, "Every sensitive action requires explicit user approval through native dialogs that mini apps cannot bypass").
- **Typed methods over `request()`.** Because `WALLET_METHODS` is a fixed `Set<string>` checked by name, and only 10 names are in it, the whole security boundary is a single `if (WALLET_METHODS.has(method))` — simple enough to read in thirty seconds and simple enough that Scoresheet's own code never needs the generic `request()` escape hatch at all.
- **The escape hatch exists for a reason.** `request()` falls through to a configured RPC endpoint for anything not in `WALLET_METHODS`, which is how a Mini App can reach ordinary JSON-RPC reads without a second HTTP client — `verification/01` §2.2 confirms this is a real, working path, just one Scoresheet doesn't currently use (it runs its own RPC calls server-side instead).
- **Server-side signing with `@nimiq/core` mirrors the same trust model deliberately.** `nimiq-payout.ts`'s own header comment states it plainly: the transaction is built and signed offline, and only the finished, already-signed bytes are ever sent to a public RPC node — the same "key never leaves the signer" property Nimiq Pay itself enforces for a player's wallet.

---

## 3. What they do badly

- **No `getBalance` on the Nimiq provider.** Confirmed absent from the full class surface, not merely undocumented (`WALLET_METHODS` and the complete method list both checked directly against the published `.d.ts` this session; matches `verification/01` §2.1 and the real Skool complaint it cites). The EVM side has `eth_getBalance`; the Nimiq side has nothing — a real asymmetry.
- **No staking-read method either.** There is no `getStaker`/`getStakerInfo` on the provider. A Mini App cannot ask "what is my own active/inactive/retired balance, or is my validator jailed" through `window.nimiq` at all — the same shape of gap as the missing balance method, and it directly blocks any player-facing staking UI from showing real state without a second, server-side RPC call (see `gaps.md` #2).
- **The documented error contract is wrong.** `nimiq-provider.md` says `sign()`/`listAccounts()` "throw `PermissionDeniedError`". The actual TypeScript signature is `Promise<T | ErrorResponse>` — a **resolved** union, not only a rejection (`provider.d.ts`, confirmed live this session; `listAccounts()`'s own body branches on `if ('error' in accounts)` on a resolved value). Scoresheet's `wallet.ts:unwrap()` exists specifically to paper over this; any new staking call must go through the same helper or it will silently treat a declined dialog as success.
- **`getHostFiat()` / the `Fiat` enum exist in the source repo but are not published.** The clone at `reference-apps/nimiq-provider` is pinned at commit `49cfe53`, titled *"feat(mini-app-sdk): export Fiat enum and getHostFiat helper"* — it declares `window.nimiqPay.userFiat` and a `getHostFiat()` export. **`npm pack @nimiq/mini-app-sdk@0.1.0` and inspection of the extracted `dist/index.d.ts` this session show neither symbol anywhere.** Scoresheet's own `wallet.ts` comment independently reached the same conclusion ("an earlier version of this file also declared `userFiat`, which does not exist and never did") — now cross-confirmed against the actual npm tarball, not just against the repo. This is a real, dated (repo commit 2026-05-26) drift between what the upstream source tree contains and what a real `npm install` gives a builder.
- **No client-side memo-length enforcement.** `sendBasicTransactionWithData` takes `data: string` and forwards it as-is; nothing in the SDK checks the 64-byte cap before the call leaves the browser (`verification/01` §3.3, re-confirmed against the published `provider.d.ts` this session — no validation code exists in the class body at all).
- **The "reporting window"/cooldown concept is buried in one doc-comment and nowhere else in the Mini Apps docs.** `sendUpdateStakerTransaction`'s own JSDoc is the *only* place in the entire `nimiq.dev/mini-apps` tree that mentions a "reporting window" — the concept itself (jailing, inactivation, epoch-gated release) is only explained in the separate `/protocol/` documentation, which nothing in the Mini Apps section links to. See `staking.md`.

---

## 4. What we should copy conceptually

- **Scoresheet's own `wallet.ts`/`send-nim.ts` pattern is already the right one, and should be extended verbatim to any new staking call**: every provider field declared optional (hosts differ), `unwrap()` for the resolved-error union, `withTimeout()` around every call so a dialog nobody answers cannot hang the page forever, and a calm-vs-bad taxonomy in `explain()` that never invents a diagnosis the provider didn't actually give.
- **Typed methods over the generic `request()` escape hatch** — Nimiq's own source draws this line for a reason (§2); Scoresheet already follows it and should keep doing so for `sendNewStakerTransaction`/`sendStakeTransaction`/etc. rather than routing them through `request({method:...})`.
- **Never call a confirmation-requiring method without a preceding tap.** The official skill's own reference file states this as a hard anti-pattern (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §12a: *"Do not fire multiple provider calls that require user confirmation in rapid sequence… Do not trigger approval dialogs on page load without user interaction"*) — this governs every one of the 6 staking calls exactly as it already governs `sign()` and `sendBasicTransactionWithData`.

---

## 5. What we can do better

- **Nobody in the reviewed catalog has called any of the 6 staking methods from a player's own wallet.** `chess/SPEC.md` K7 states this for the pool (server-side); an independent grep of `apps/web/src` for `sendNewStakerTransaction`, `sendStakeTransaction`, etc. this session found zero matches — the client-side surface is completely untouched by anyone, including Scoresheet's own current code. Building (a)/(b) against it is a genuine first, not just relative to competitors.
- **Build the missing staking-read layer ourselves**, mirroring the balance-read workaround already built for `stake-cli.ts`/`nimiq-payout.ts`: query `getStakerByAddress`/`getValidatorByAddress` over JSON-RPC (same pattern, same default endpoint `rpc.nimiqwatch.com`) rather than waiting on a provider method that doesn't exist and isn't coming.
- **Don't add `@nimiq/mini-app-sdk` as a dependency without pinning and re-verifying it.** Given §3's `getHostFiat` drift, Scoresheet's decision to hand-roll the tiny surface it actually needs (2 fields, 3 host calls) rather than depend on a package whose repo is already ahead of its own last publish is the safer choice, and should stay that way unless there's a concrete reason to add the dependency.

---

## 6. What is technically required

- Every `send*` call needs an explicit user tap directly behind it — no batching, no chaining on load.
- `value`/`newActiveBalance`/`retireStake` are all **Luna**, and cross the provider boundary as a plain JS `number`, safe to `2^53−1` Luna ≈ 90 billion NIM (`verification/01` §4.3) — far above anything a tournament stake would need, but round with `Math.round`, not float arithmetic, exactly as `staking.ts`/`send-nim.ts` already do.
- `fee` should be omitted, matching Scoresheet's existing convention, and matching the documented default behaviour ("Nimiq Pay chooses a fee automatically, using 0 if possible").
- Every resolved value must be checked with `typeof result === 'string'` before being treated as a hash — a resolved `ErrorResponse` object is not falsy and will pass a naive `if (result)` check.
- Reading a player's own staking state (for any UI beyond "did the last transaction succeed") requires a **separate RPC call**, `getStakerByAddress(address)` — there is no provider method for it. Same for a chosen validator's jail/inactive status via `getValidatorByAddress`.

---

## 7. What could break

- **Handling only the throw path, not the resolved-error union**, on any new staking call — exactly the bug Scoresheet's own `wallet.ts` comment describes having shipped once already (the `requestDeviceIdentifier` options-shape mismatch that made the puzzle pool unclaimable on a real phone while every test passed).
- **Trusting `@nimiq/mini-app-sdk`'s published `.d.ts` as ground truth for what a specific installed Nimiq Pay build actually injects.** The SDK version and the host app version are not the same artifact and are not guaranteed to move in lockstep — §3's `getHostFiat` gap is direct proof the repo can be ahead of npm; the reverse (a live Nimiq Pay build ahead of, or behind, whatever SDK version a Mini App was written against) is plausible and **NOT VERIFIED** either way.
- **A wallet dialog nobody answers.** Every provider call in this file can hang indefinitely if the user backgrounds the app mid-dialog; Scoresheet's `withTimeout()` wrapper is the only thing standing between that and a permanently stuck screen, and it must wrap every new staking call too.
- **Calling `nimiq.request({method:'getBlockNumber'})` instead of `nimiq.getBlockNumber()`** — the one documented case where the two code paths silently diverge (§1a) — would throw `No RPC URL configured` in an app that never calls `setRPCUrl`.

---

## 8. What we can uniquely do because of Nimiq

- **Full native staking is a first-class, fully-documented capability nobody in the catalog has built a dedicated app around** — verified again this session (zero client-side callers found anywhere), and it is item #2 on a judge's own public wishlist (`CYCLE_2_PRIMARY_SOURCE_INTEL.md` §3). The 6 methods in §1a are the entire, real, already-shipped API surface for it; nothing about building (a) or (b) needs a capability that doesn't already exist today.
- **The Device Identifier + the staking-read workaround together give a fully non-custodial, zero-login way to show "this specific device demonstrably has an active stake"** — no account system, no password, and (per `staking.md` §8) a real on-chain cooldown behind it rather than a client-side flag that means nothing.

---

## 9. Licence and reuse verdict

| Source | Licence | Verified how |
|---|---|---|
| `@nimiq/mini-app-sdk` (npm `0.1.0`) | **MIT** | `package/package.json`, extracted from the actual npm tarball this session (`"license": "MIT"`) |
| `@nimiq/web3-provider-nimiq` (the `NimiqProvider` class, bundled into the SDK) | **MIT** | `reference-apps/nimiq-provider/packages/nimiq/package.json` (`"license": "MIT"`, contributors listed as Trust Wallet + the Nimiq Development Team) |
| `@nimiq/core` (npm `2.21.0`) | **Apache-2.0** | `chess/node_modules/@nimiq/core/package.json` (`"license": "Apache-2.0"`), repo `nimiq/core-rs-albatross` |
| `developer-center` (source of every `nimiq.dev` page quoted above) | **Apache-2.0** | `clones/developer-center/LICENSE.md`, full Apache-2.0 text present, read directly |

All four are safe to depend on directly and safe to port small snippets from with attribution. **Recommendation, given §3/§5: keep not depending on `@nimiq/mini-app-sdk` as an npm package.** Scoresheet's hand-rolled equivalent is smaller, already correct against the real published surface, and isn't exposed to a repo/npm drift that has already been observed once. If it is ever added as a dependency, pin the exact version and treat its `.d.ts` as a claim to verify against a real device, not as ground truth on its own.
