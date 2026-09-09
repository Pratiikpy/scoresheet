# The Albatross staking lifecycle — in full

**Why this file has to be exact:** both planned features — staking to fund the puzzle pool, and a staked skill tournament on a **player's own** wallet — stand or fall on facts in this document. Getting the reward-distribution mechanism wrong (§1) would mean the pool's `budgetFor()` quietly pays out money that never actually arrived. Getting the "who can move a stake" fact wrong (§7) would mean designing a tournament around a seizure mechanism that does not exist in the protocol. Every numeric constant below was **executed** against the real, installed `@nimiq/core@2.21.0` (not read from a table, not guessed) or is quoted verbatim from Nimiq's own `/protocol/` documentation tree. Anything not pinned to one of those two is marked **NOT VERIFIED**.

**Primary sources:**
- **Executed this session** — `node` script against `chess/node_modules/@nimiq/core@2.21.0`'s `Policy` class (script and raw output kept in the scratchpad; every number below that says "executed" was printed by real code running against the real installed library, not copied from documentation)
- `C:\Users\prate\nimiq\clones\developer-center\content\protocol\validators\stakers.md` (the staker state machine, verbatim)
- `C:\Users\prate\nimiq\clones\developer-center\content\protocol\validators\validators.md` (the validator state machine, verbatim)
- `C:\Users\prate\nimiq\clones\developer-center\content\protocol\validators\staking-contract.md` (the on-chain data structure, verbatim)
- `C:\Users\prate\nimiq\clones\developer-center\content\protocol\economics\rewards.md` (reward mechanism, verbatim)
- `C:\Users\prate\nimiq\clones\developer-center\content\protocol\consensus\punishments.md` (jailing/punishment mechanism, verbatim)
- `C:\Users\prate\nimiq\clones\developer-center\content\nodes\validators\staking-faq.md` and `becoming-a-validator.md` (operator-facing FAQ and CLI walkthrough, verbatim)
- `C:\Users\prate\nimiq\clones\developer-center\content\web-client\reference\classes\{Policy,TransactionBuilder,StakingDataBuilder,StakingContract}.md` and `interfaces\Plain{Staker,StakingContract,Validator,ValidatorData,CreateStakerData,AddStakeData,SetActiveStakeData,UpdateStakerData,RetireStakeData}.md` — the actual generated TypeDoc reference for `@nimiq/core`'s WASM types
- `C:\Users\prate\nimiq\chess\packages\server\src\staking.ts`, `pool.ts`, `stake-cli.ts` (what Scoresheet has built)
- `C:\Users\prate\nimiq\chess\SPEC.md` K7/K8, `BRIEF.md` (Scoresheet's own prior decisions and the HTLC-gap finding)
- Third-party (marked as such): `stakingrewards.com/asset/nimiq`, via web search this session, for a live reward-rate figure Nimiq itself does not publish as a fixed number

---

## 1. What they do

### 1.1 The staking contract — one record per validator, one per staker

`StakingContract` (`protocol/validators/staking-contract.md`) has exactly three fields:
```rust
pub struct StakingContract {
    pub balance: Coin,                             // everything staked, deposits + delegations
    pub active_validators: BTreeMap<Address, Coin>, // validators eligible for the next epoch
    pub punished_slots: PunishedSlots,              // slots currently burning rewards
}
```
Each **validator** and each **staker** additionally has its own account record inside the same sub-trie. A staker is created by delegating to a validator (or to none); a validator is created separately, by anyone willing to lock the deposit (§1.5).

### 1.2 Staker balances and states — verbatim state table (`protocol/validators/stakers.md`)

| Balance | Meaning |
|---|---|
| **Active** | Currently used as stake by the delegated validator |
| **Inactive** | Not currently staking; locked for a cooldown, awaiting reactivation or retirement |
| **Retired** | Permanently marked for withdrawal, no longer staking |
| *(Removed)* | Fully withdrawn from the staking contract — terminal, not a balance field |

| From | To | Condition |
|---|---|---|
| Active | Inactive | Funds locked for the cooldown; accounts for possible validator misbehaviour during the window |
| Inactive | Active | Immediate |
| Inactive | Retired | Can retire a specific amount, leaving ≥ the minimum stake in active+inactive; or retire everything |
| Retired | Removed | Withdraws the **entire** retired balance — no partial removal |

**The cooldown rule, verbatim:** *"Stakers must wait through the reporting window or the remaining jail period of the validator, whichever is longer, to inactivate their funds… If the validator is not jailed, stakers must wait for one epoch of reporting window counting from the next election block."*

### 1.3 The six staker transactions, exact effect

| Transaction | Provider method (`sdk.md` §1a) | `@nimiq/core` builder | Inner staker-signature proof required? | Effect |
|---|---|---|---|---|
| Create Staker | `sendNewStakerTransaction` | `TransactionBuilder.newCreateStaker` / `StakingDataBuilder.createStaker` | **Yes** | First-time only. Places `value` in **active** balance, delegated to `delegation`. Minimum 100 NIM (§1.6) |
| Add Stake | `sendStakeTransaction` | `TransactionBuilder.newAddStake` / `StakingDataBuilder.addStake` | No | Adds `value` to active balance. Works from **any external address**, not only the staker's own |
| Set Active Stake | `sendSetActiveStakeTransaction` | `TransactionBuilder.newSetActiveStake` / `StakingDataBuilder.setActiveStake` | **Yes** | Sets the desired active balance; the difference becomes inactive and starts the cooldown. Example from the docs: 500 NIM staker sets active to 300 → 200 NIM becomes inactive |
| Update Staker | `sendUpdateStakerTransaction` | `TransactionBuilder.newUpdateStaker` / `StakingDataBuilder.updateStaker` | **Yes** | Changes delegation. Forces the **entire** non-retired balance inactive first (protocol requires 100% inactive+released before re-delegating); `reactivateAllStake:true` auto-reactivates once released, otherwise a separate `SetActiveStake` is needed afterward |
| Retire Stake | `sendRetireStakeTransaction` | `TransactionBuilder.newRetireStake` / `StakingDataBuilder.retireStake` | **Yes** | Moves *released* inactive balance into retired. **Signalling transaction — moves no value itself** |
| Remove Stake | `sendRemoveStakeTransaction` | `TransactionBuilder.newRemoveStake` / `StakingDataBuilder.removeStake` | No (staker signs the outer proof as recipient) | Withdraws the **entire** retired balance out of the staking contract, to the staker's spendable balance. No partial removal. If total balance hits zero, the staker record is deleted |

**The two-phase-signature quirk, confirmed independently.** `StakingDataBuilder.createStaker/retireStake/setActiveStake/updateStaker` all carry the identical doc note: *"The created data contains an empty signature proof… 1. Set the data on the transaction… 2. Create a signature proof over the transaction with the staker's keypair 3. Use `StakingDataBuilder.setProof(tx.data, proof)`… 4. Set the updated staking data back on the transaction."* This is exactly what `staking.ts`'s own comment describes ("a staking transaction is signed twice, and missing the first one is a silent failure") — now independently verified against the generated `@nimiq/core` reference docs, not just against Scoresheet's own prior debugging. `AddStake` and `RemoveStake` need no such inner proof.

### 1.4 Validator states and transactions (`protocol/validators/validators.md`)

States: **Active → Inactive → Jailed → Retired → Deleted** (+ **Tombstone** if stakers remain when deleted). Transactions: **Create** (100,000 NIM deposit, `TransactionBuilder.newCreateValidator`), **Update**, **Deactivate** (takes effect at the next election block, triggers the reporting window), **Jail** (immediate, on a submitted equivocation proof), **Reactivate** (must be inactive, not retired, not jailed), **Retire** (irreversible, first step to deletion), **Delete** (returns the deposit, only after the reporting window ends; leaves a tombstone if stakers remain).

Removing a validator entirely: **Deactivate → Retire → Delete**, and the FAQ states this "may take up to 2 days" (`staking-faq.md`) — see §7 for the residual gap between this FAQ figure and the raw block-level numbers in §1.7.

### 1.5 Minimum amounts — protocol-level, not a UI suggestion

Cross-confirmed in two independent places in the developer-center content, both fetched and read directly this session:
- `content/protocol/validators/stakers.md`: minimum stake **100 NIM**, enforced as an invariant on Create Staker / Add Stake / Set Active Stake / Retire Stake (non-retired and total balance must each be ≥ 100 NIM whenever non-zero — a staker cannot leave a dust amount behind).
- `content/nodes/validators/becoming-a-validator.md` and `staking-faq.md`: validator deposit **100,000 NIM**, and any extra above the deposit only counts as stake if it clears the 100 NIM minimum, otherwise **it is burned** — a stated, real footgun for anyone building a validator-creation flow (not directly relevant to Scoresheet, which only delegates).

### 1.6 Reward mechanism — the single fact this whole file exists to nail down

Verbatim, `content/protocol/economics/rewards.md`:

> *"Validators receive rewards to their reward address every batch. However, the distribution of rewards for a batch occurs at the end of the following batch… Validators receive rewards proportional to their total stake… While validators receive their rewards on-chain, they distribute rewards to stakers off-chain. Validators handle the distribution of these rewards according to their arrangements with their stakers."*

And from `content/protocol/validators/becoming-a-validator.md`, even more bluntly: *"all staking rewards are received by the validator's reward address, not the stakers. The arrangement of distributing rewards among a validator's stakers is made off-chain and is usually handled by a pool operator or the people who are operating the validator themselves."*

**Read that twice. It is the load-bearing fact for §7 and for `gaps.md` #10/#11.** A delegator's stake does not earn NIM that lands in the delegator's own wallet by any protocol mechanism. It earns the *validator* NIM, on-chain, every batch — and whether and when any of that ever reaches the delegator is a private arrangement with that specific validator, entirely off-chain, with no protocol enforcement, no standard schedule, and no dispute mechanism.

Reward calculation itself: coinbase (new NIM, per the supply-decay curve `S(t) = S₀ + V₀/β·(1 − 2^(−βt))`, executable as `Policy.supplyAt(genesisSupply, genesisTime, currentTime)`) plus transaction fees from the batch, split evenly per validator **slot** (a validator with 50 slots earns ~3.3× one with 15). `MINIMUM_REWARDS_PERCENTAGE` (executed: **0.5**) is the floor a delayed batch still earns — see `Policy.batchDelayPenalty(delay)`, executed this session:

| Delay | Reward multiplier (executed) |
|---|---|
| 0 ms | 1.0 |
| 1,000 ms | 0.9995 |
| 5,000 ms | 0.9864 |
| 10,000 ms | 0.9479 |
| 30,000 ms | 0.6858 |
| 60,000 ms | 0.5095 (near the 0.5 floor) |

### 1.7 Executed timing constants — real numbers, not documentation prose

Every value below was printed by `Policy.<CONSTANT>` on the installed `@nimiq/core@2.21.0`, this session, no exceptions:

| Constant | Executed value | In human terms |
|---|---|---|
| `BLOCK_SEPARATION_TIME` | 1,000 ms | nominal 1s block time |
| `BLOCKS_PER_BATCH` | 60 | nominal 1-minute batch |
| `BATCHES_PER_EPOCH` | 720 | |
| `BLOCKS_PER_EPOCH` | 43,200 | **nominal 12-hour epoch** (60 × 720 × 1s) |
| `JAIL_EPOCHS` | 8 | **nominal 4-day jail** (8 × 12h) |
| `SLOTS` | 512 | validator slots |
| `F_PLUS_ONE` / `TWO_F_PLUS_ONE` | 171 / 342 | BFT fault-tolerance thresholds out of 512 |
| `MINIMUM_REWARDS_PERCENTAGE` | 0.5 | reward floor under maximal delay |
| `VALIDATOR_DEPOSIT` | 10,000,000,000 Luna | **100,000 NIM** |
| `TOTAL_SUPPLY` | 2,100,000,000,000,000 Luna | **21,000,000,000 NIM** |
| `TRANSACTION_VALIDITY_WINDOW_BLOCKS` | 7,200 | **~2 hours** |
| `MAX_SIZE_MICRO_BODY` | 100,000 bytes | matches `verification/01` §5.3 independently |
| `STAKING_CONTRACT_ADDRESS` | `NQ77 0000 0000 0000 0000 0000 0000 0000 0001` | |
| `GENESIS_BLOCK_NUMBER` | 3,456,000 | height associated with this policy's genesis (context, not independently re-derived here) |

And the derived functions, executed against a real recent mainnet height (60,670,524, the same height `verification/01` §6.1 read live on 2026-09-04):

| Function | Result | Meaning |
|---|---|---|
| `epochAt` / `batchAt` | epoch 1325, batch 953,576 | that height's position |
| `electionBlockAfter − electionBlockBefore` | 43,200 | confirms epoch length exactly |
| `blockAfterCollateralLockup(h) − h` | **+43,201** (1 epoch + 1) | how long a deactivated validator's (and its stakers') funds stay slashable |
| `lastBlockOfEquivocationReportingWindow(h) − h` | **+7,200** (`TRANSACTION_VALIDITY_WINDOW_BLOCKS`) | last block an equivocation at `h` can still be reported |
| `blockAfterJail(h) − h` | **+345,601** (8 epochs + 1) | confirms `JAIL_EPOCHS` × `BLOCKS_PER_EPOCH` exactly |

**So, in plain terms, at nominal block time:** a normal, un-jailed unstake becomes spendable after **up to one epoch (~12h)** from the next election block. A stake delegated to a validator that is *currently jailed* is held until **the longer of** the reporting window or the remaining jail period — up to **8 epochs (~4 days)**, confirmed executed. This matches the staking FAQ's own plain-language answer exactly ("12 hours to 4 days… in rare cases jailed for up to 4 days").

### 1.8 Punishments (`protocol/consensus/punishments.md`)

Two tiers, by severity:
- **Minor — block-production delay.** That slot is deactivated and added to `punished_slots` for the current and next batch; rewards for that one slot are burned; the slot can reactivate itself **one block later**. Not jailing.
- **Severe — fork, double proposal, double vote (equivocation).** Any node can submit a proof; the validator is **jailed immediately** — all slots deactivated, all their rewards burned, for **8 epochs**. The validator must keep producing blocks until the current batch ends and keep voting until the epoch ends (no mid-epoch election to replace it), but earns nothing for that continued work. Burned rewards go to `NQ07 0000 0000 0000 0000 0000 0000 0000 0000` (the burn address), *"no one can or will use the funds sent to this address."*
- **Impact on a staker who did nothing wrong:** *"Punishments also affect the validator's stakers, as the locking period for the staker's stake aligns with the validator's locking period."* A staker's own funds are never taken — only their liquidity is delayed, up to the 4-day jail figure above.

### 1.9 Reward rate — not a fixed protocol number

`@nimiq/utils`'s own `calculateStakingRewards({amount, days, stakedSupplyRatio, fee, autoRestake})` (`content/nimiq-utils/staking-rewards-calculator.md`) takes the staked-supply ratio as an **input**, confirming there is no fixed published APY — actual yield depends on the live supply-decay curve (§1.6) divided across whatever fraction of `TOTAL_SUPPLY` is currently staked, minus whatever cut a validator/pool takes.

**Third-party, not Nimiq-published** (`stakingrewards.com/asset/nimiq`, via web search this session): "current estimated reward rate… 17.06%" (sourced to Coinbase's own display), a separate ~8.5–10.24% range across other providers, staked ratio **≈38.69%** of supply (~5.2B NIM). **Mark this figure NOT VERIFIED against a primary Nimiq source** — it is an aggregator's read of provider-reported numbers, not a protocol constant, and it will drift as the staked ratio changes (§1.6 makes clear why it must).

---

## 2. Why it works

- **Off-chain reward distribution keeps the on-chain state cheap.** If every batch had to individually credit every delegator of every validator, the staking contract's per-block write cost would scale with the number of stakers, not the number of validators (512 slots). Crediting only the validator's reward address keeps the protocol's own bookkeeping at validator-count scale and pushes the fan-out to whoever wants to run it — a real, sound trade-off, not laziness.
- **The collateral lock-up is explicitly reasoned, not arbitrary.** `Policy.md`'s own doc comment: *"kept at one epoch and must always be `>=` the equivocation reporting window… so collateral is always present while an offense is still reportable."* The numbers in §1.7 aren't independent knobs; the lock-up is defined to be at least as long as the window in which a proof against that exact misbehaviour can still be submitted.
- **The two-phase signature on staking data (§1.3) is what stops a third party from forging a `CreateStaker`/`SetActiveStake`/etc. on someone else's behalf.** Because the inner proof is signed with the staker's own key over the transaction's content, and the outer proof is a second, ordinary signature, nobody but the staker can ever produce a valid `data` field for their own staker record — which is exactly the property that makes §7's "no seizure" fact hold up cryptographically, not just by policy.

---

## 3. What they do badly

- **The reward-distribution mechanism is the single most consequential undocumented risk for any app built on "delegate and the pool earns."** It's not hidden — it's stated plainly in `rewards.md` and `becoming-a-validator.md` — but it appears nowhere in the Mini Apps documentation tree at all, and nothing in the provider API (`sdk.md` §1a) surfaces it. A builder who reads only `nimiq.dev/mini-apps` and the 6 method signatures would have no way to know that delegating does not, by itself, make NIM appear in the delegator's wallet.
- **"Up to 2 days" for full validator removal doesn't cleanly reconcile with the executed block numbers.** §1.7's `blockAfterCollateralLockup` gives +1 epoch (~12h) from the point of deactivation; deactivation itself only takes effect at the *next* election block (up to another ~12h wait to even start). That's a ceiling of roughly 1 day by direct computation, not 2. **NOT VERIFIED** exactly what accounts for the FAQ's stated second day — possibly operational margin, possibly a step not captured by the two Policy functions checked. Flagged rather than silently rounded.
- **Minimum stake (100 NIM) is a hard protocol floor with no soft-fail.** Unlike an ordinary payment (no dust limit at all, `verification/01` §4), a staking transaction that would leave a non-zero balance below 100 NIM in *any* non-retired state fails outright — worth knowing before designing an entry-fee amount for anything staking-based.

---

## 4. What we should copy conceptually

- **Track principal separately from earned, the way `staking.ts` already does — this generalises correctly.** Because the chain itself does not distinguish "what I put in" from "what accrued" (a staker's balance is just a number), any design that needs to answer "how much of this is winnings" must record the starting point itself, exactly as `principalLuna` already does for the pool.
- **The protocol's own "only the owner's signature moves the owner's funds" invariant is precisely the property to build a trust-minimized commitment device on** — not by inventing a new mechanism, but by using the existing cooldown (§1.2, §1.7) as a natural, already-audited delay. See §8.

---

## 5. What we can do better

- **Build the missing staking-observability layer ourselves.** Neither the provider (`sdk.md` §1a) nor the SDK exposes a way to read a staker's or validator's state. `getStakerByAddress`/`getValidatorByAddress` are real, working JSON-RPC methods (confirmed present in `developer-center/data/openrpc-document.json`, and `stake-cli.ts` already calls the first one) — extend the same RPC pattern to surface `inactiveBalance`, `inactiveRelease`, `retiredBalance`, and the delegated validator's `jailedFrom`/`jailedRelease` to a player, since the provider itself cannot.
- **Treat "which validator" as a stated trust decision, not an invisible default.** Because §1.6 means the entire pool economics depend on a specific validator's own off-chain payout behaviour, `staking.ts`'s current `report()` — which silently assumes `liquidLuna` will organically grow — should be paired with operational monitoring (does the balance actually move on the schedule the chosen validator claims?) rather than trusted blind. Document, in whatever validator is chosen, what its own stated payout policy is, and treat a validator with no public policy as a red flag.
- **Design the tournament mechanic around the cooldown as a signal, never as custody** (§8) — this is a genuinely better answer to "staked skill tournament" than trying to route around the protocol's total absence of a third-party-seizure mechanism.

---

## 6. What is technically required

**For the existing pool (server-side, already built):** `POOL_PRIVATE_KEY` → `TransactionBuilder.newCreateStaker` once, `newAddStake` thereafter, both signed twice per §1.3, broadcast via `sendRawTransaction`. Already correct.

**For a player-side staking flow (new, for feature (b)):**
1. First stake: `sendNewStakerTransaction({delegation, value})` — one tap, one confirmation dialog. `value` ≥ 100 NIM (10,000,000 Luna) or the transaction fails at the invariant, not gracefully.
2. Additional stake: `sendStakeTransaction({value})`.
3. To change validator: `sendUpdateStakerTransaction({newDelegation, reactivateAllStake})` — this makes the **entire** non-retired balance inactive first; there is no partial-delegation-change.
4. To fully exit: `sendSetActiveStakeTransaction({newActiveBalance: 0})` → wait for `inactiveRelease` (read via RPC, §5) → `sendRetireStakeTransaction({retireStake: <released amount>})` → `sendRemoveStakeTransaction({value: <retired amount>})`. Four separate taps, four separate confirmation dialogs, none of which may be chained without a user action behind each one (`sdk.md` §4).
5. Reading state at any point: `getStakerByAddress(address)` over RPC — not available through the provider.

---

## 7. What could break

- **The central risk, restated precisely for this file: a pool or a tournament built on the assumption that a third-party validator will reliably forward earned rewards has no protocol guarantee behind that assumption at all.** §1.6's quote is unambiguous — distribution to stakers is "off-chain," "according to their arrangements," with no stated timing anywhere in the protocol docs. `budgetFor()`'s hard ceiling (never pay more than the observed `earnedLuna` allows) is the right defensive design *given* this risk, but it does not remove the risk that `earnedLuna` sits at zero indefinitely if the chosen validator simply never forwards anything.
- **A player staked to a validator that gets jailed mid-tournament is locked for up to 8 epochs (~4 days) through no fault of their own** (§1.7, §1.8) — a real, executed number, not a hypothetical. Any tournament design that assumes a player can always exit on demand is wrong the moment their validator misbehaves.
- **The reporting-window reset edge case** (`stakers.md`, "Edge Cases"): *"When a staker updates their inactive stake, the reporting window counter resets… if there were 5 blocks left, it would reset at the next election block plus one epoch."* A player who taps "change validator" mid-cooldown restarts their own wait, which is a genuine UX foot-gun if not explained before the tap.
- **These are today's numbers, not eternal ones.** §1.7's constants are `@nimiq/core@2.21.0`'s current values, executed against a live mainnet-configured client. **NOT VERIFIED** whether or how these are versioned across protocol upgrades — anything hard-coded around today's 12h/4-day/100-NIM figures should re-read `Policy` after any `@nimiq/core` upgrade rather than assume it still holds.

---

## 8. What we can uniquely do because of Nimiq

- **The epoch-boundary cooldown is a free, protocol-enforced, non-custodial *soft timelock* for anything shorter than one epoch (~12h nominal).** A player who has staked an entry cannot fully liquidate it mid-tournament without first broadcasting a visible `SetActiveStake`/`UpdateStaker` transaction — one that Scoresheet's own backend (or any spectator, via the open `getStakerByAddress` RPC read) can observe on-chain in real time. That turns "did they try to bail mid-game" from an unenforceable promise into a **publicly checkable fact**, with zero custody anywhere and zero new cryptography — it is the existing protocol, used as-is.
- **This must be paired, explicitly, with the fact in §7/`gaps.md` #11: it is a commitment *signal*, not seizable collateral.** Nobody — not Scoresheet, not the winner, not the protocol — can move a loser's staked funds without the loser's own signature. Any actual prize redistribution between players still has to happen through an ordinary payment (custodial pool, or player-to-player tip), exactly as `SPEC.md` K8 already concluded for wagers generally. The unique thing Nimiq offers here is the *proof of commitment*, not a payout mechanism — and describing it any other way to a player would be dishonest about what is actually enforced on-chain.
- **Both the pool's and a player's stake history are independently auditable by anyone with a URL** (`getStakerByAddress`/`getValidatorByAddress` are open, unauthenticated RPC reads) — no dashboard Scoresheet builds has to be trusted; a skeptical judge or player can check the raw chain state directly.

---

## 9. Licence and reuse verdict

Every protocol document quoted in this file is from `developer-center`, confirmed **Apache-2.0** (`clones/developer-center/LICENSE.md`, full text present, read directly) — safe to quote at length and adapt, with attribution retained. The executed `Policy`/`TransactionBuilder`/`StakingDataBuilder` behaviour is from `@nimiq/core@2.21.0`, **Apache-2.0** (`chess/node_modules/@nimiq/core/package.json`), already a direct dependency and already used correctly by `staking.ts` for the two builders it calls.
