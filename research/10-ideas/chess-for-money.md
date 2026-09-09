# Chess for money — the existing market, and what actually fails in it

## 1. What they do

**Skillz-platform chess apps** (Chess Payday, Chess for Cash, Real Money Chess Prizes) run
head-to-head or tournament cash matches on top of Skillz's third-party infrastructure: a player
deposits, pays a per-match entry fee, plays, and Skillz settles the pool between the platform, the
game developer, and the winner(s). Entry fees run as low as $0.60, with Skillz historically taking a
cut variously reported between roughly 8–16% and 20–30% of the pool depending on the source — the
range is wide enough that neither figure should be quoted as precise.
[Naavik, "A Look Under the Hood of Skillz"](https://naavik.co/deep-dives/a-look-under-hood-of-skillz/);
[support.skillz.com, "How much does Skillz cost?"](https://support.skillz.com/hc/en-us/articles/203685889-How-much-does-Skillz-cost).
Cash tournaments are disabled in at least Arkansas, Connecticut, Delaware, Louisiana, and South
Dakota. Apple App Store, Chess Payday listing (fetched 2026-09-08): **4.2/5, 204 ratings**.
[Chess Payday](https://apps.apple.com/us/app/chess-payday-win-real-money/id1609406107). Chess for
Cash listing (fetched 2026-09-08): **4.4/5, 87 ratings**, 18+ rated for "gambling and simulated
gambling" content. [Chess for Cash](https://apps.apple.com/us/app/chess-for-cash-online-matches/id1586330040).

**Chess.com and the Champions Chess Tour** run the legitimate, non-Skillz end of paid competitive
chess: Titled Tuesday, twice-weekly, Swiss format, $10,000 total weekly prize fund ($2,500/$1,500/
$1,000/$700 top four, $400 for 5th–6th, $250 for 7th–10th, plus category bonuses — top woman, top
senior, top youth, best debut, and similar, at $100–$250 each).
[Chess.com, "Titled Tuesday"](https://www.chess.com/article/view/titled-tuesday). The Champions Chess
Tour (2025–26 season) runs $250,000 regular-event pools and a $250,000 Speed Chess Championship, with
qualification for a 12-player Esports World Cup slot decided by tour standings rather than pay-to-
enter cash tables. [Wikipedia, Champions Chess Tour 2025–2026](https://en.wikipedia.org/wiki/Champions_Chess_Tour_2025%E2%80%932026);
[Chess.com, CCT 2026–2027 announcement](https://www.chess.com/news/view/announcing-champions-chess-tour-2026-2027).
This is prize money funded by sponsorship and viewership, not by players' own entry fees pooled and
redistributed — a structurally different model from Skillz's.

**Crypto chess** has been tried multiple times and has not produced a surviving, working
skill-competition product. `fiveoutofnine` is a fully on-chain chess *engine* — a player mints moves
as NFTs playing against the contract itself, not against another human for a stake; it remains live
on Ethereum mainnet as of the most recent activity found, but it was never peer-vs-peer money chess.
[fiveoutofnine.com](https://www.fiveoutofnine.com/); [GitHub, fiveoutofnine/fiveoutofnine-chess](https://github.com/fiveoutofnine/fiveoutofnine-chess).
Ultrachess (built on Cartesi Rollups, explicitly pitched as betting on chess games) published
milestone updates through 2022 and no verifiable activity was found after that — its status is
**NOT VERIFIED** as dead versus dormant, but no evidence of it being live or used was found in this
search. [Medium/Cartesi, Ultrachess milestone updates](https://medium.com/cartesi/hello-ultrachess-milestone-updates-5ed3ef52d265).
"Fomo4D Chess" is not real chess at all — it is a Fomo3D-style Ethereum lottery/Ponzi mechanic
wearing a chess skin, catalogued under the "Gambling" dApp category at a low usage rank (#273 in
Gambling, #5733 overall by one tracker) — worth naming specifically because it is the closest thing
to a precedent search engines surface for "crypto chess betting," and it is not a skill product at
all, it is chance-based gambling with chess branding. [DappRadar-style tracker via bitdegree.org](https://www.bitdegree.org/crypto-tracker/top-ethereum-dapps/fomo4d-chess).

## 2. Why it works

Skillz's core mechanic works because it removes the two frictions that keep casual players away from
cash chess: no opponent search of your own (matchmaking is automatic) and no separate escrow
negotiation (the platform holds and settles the pool). The predominance legal test — "does skill
predominate over chance" — is exactly why chess-for-cash is legally viable as a category at all in
most US states, and Skillz leans on this explicitly, describing chess as an example of "pure skill" on
the opposite end of their spectrum from slot machines.
[docs.skillz.com, legal framework](https://docs.skillz.com/docs/legal-skillz/); [general skill-vs-
chance legal summary, LegalMatch](https://www.legalmatch.com/law-library/article/games-of-chance-vs-games-of-skill.html).

Chess.com's Titled Tuesday works for a different reason: it is not peer-funded. The prize pool is
Chess.com's own money, so there is no custody dispute possible between players — the only trust
relationship is "will the sponsor pay," which a company with a public track record and years of
weekly events answers by repetition. It also multiplies payouts across many placements and bonus
categories rather than winner-take-all, which keeps a much larger fraction of entrants motivated to
keep playing.

## 3. What they do badly

Direct evidence, fetched 2026-09-08:

- **Skillz, Inc. — BBB complaints page**: 97 complaints in the last 3 years, not BBB-accredited.
  Breakdown: 70 "service or repair" issues, 14 product issues, 7 billing issues. Representative,
  dated: *"(07/30/2026) Skillz wrongfully merged two distinct family members' profiles... confiscated
  money in my account."* *"(03/13/2026) They took my deposit with no issue, but are withholding my
  $153... suspended with no further update on withdrawal."*
  [BBB, Skillz Inc. complaints](https://www.bbb.org/us/nv/las-vegas/profile/online-gaming/skillz-inc-1086-90090847/complaints).
- **Skillz, Inc. — Trustpilot**: **1.3/5 overall, 221 reviews**, 79% one-star, 15% five-star (a
  strongly bimodal distribution). Representative: *"They're a rip off. I cashed out and I didn't get
  all of my winnings plus the money I spent."* (Jul 2026) *"This game is rigged... they let you win a
  couple games then rig the game against you and take your money."* (Sep 2025) *"I have over $540 in
  my account... $520 is bonus cash and I can withdraw only $18."* (May 2025)
  [Trustpilot, skillz.com](https://www.trustpilot.com/review/skillz.com).
- **App Store review text, both apps checked directly (fetched 2026-09-08)**: Chess Payday — *"Each
  time I log in, the matchmaking system seems to be empty."* Chess for Cash — *"every time I play a GM
  game, it's always an AI and I never win the money despite winning"*; *"To deposit it costs nothing,
  but to withdraw it costs you $$."*; *"They do seem to let you win a lot at first so pull out your
  cash."* One review is literally titled *"It's real, but a scam."*
  [Chess Payday](https://apps.apple.com/us/app/chess-payday-win-real-money/id1609406107);
  [Chess for Cash](https://apps.apple.com/us/app/chess-for-cash-online-matches/id1586330040).
- **Even the legitimate side has an account-ownership problem.** Chess.com's own Fair Play team
  closes roughly 100,000 accounts a month, about 3,500/day in Jan–Mar 2025 — and a closed account's
  entire rating and game history becomes unreachable, whether or not the closure was justified, with
  no independent, portable proof of what was actually played.
  [Chess.com, "Breaking Down 100,000 Closures a Month"](https://www.chess.com/blog/FairPlay/breaking-down-100-000-closures-a-month).
- **Crypto chess's actual track record is thin or fake.** The two closest "on-chain wagered chess"
  attempts found either never shipped peer-vs-peer wagering (fiveoutofnine is player-vs-contract) or
  show no verifiable current activity (Ultrachess, last public update 2022, **NOT VERIFIED** as dead).
  What search engines surface first for "crypto chess betting" is a gambling dApp wearing chess
  branding, not a skill product — the category's public face is bad, not just its execution.

### Failure-mode table

| What people report | Structural cause | Rail/design that causes it |
|---|---|---|
| Withdrawal delayed weeks, or partially denied | **Custody.** The platform holds player funds and controls when/whether they move out | Skillz's centralized wallet + payout-approval pipeline |
| "$520 of $540 is bonus cash, only $18 withdrawable" | **Custody + non-fungible balance.** Bonus credits are a platform IOU, not real money, until the platform decides otherwise | Skillz's promotional-credit mechanic layered on custodial balances |
| Account merged/suspended, money frozen | **Account ownership.** The platform's account, not the player's key, is the thing that holds the funds and the standing to withdraw | Login-based account model, no player-held signing key |
| "They let you win, then rig it" (matchmaking distrust) | **Opacity + fee.** No visible, checkable matching or settlement logic, and a rake that only makes sense if the platform can shift outcomes in its favor | Closed-source matchmaking, take-rate funded by losers |
| "It was always an AI, not a real opponent" | **Opacity.** No way for a player to verify who or what they actually played | No public, checkable game record independent of the platform's own claim |
| Rating and history gone after a ban, justified or not | **Account ownership.** The rating is the platform's database row, not the player's provable artifact | Server-side rating with no player-held signed record |
| Crypto chess wagering dApps never launched or went dark | **No real product underneath the payment rail.** Betting mechanics bolted onto chess with no matchmaking, anti-farming, or UX investment | Speculative token/NFT projects, not chess products |
| "chess betting" search results return gambling-themed dApps, not chess | **Category collision.** Crypto "chess for money" precedent is chance-based gambling wearing chess branding, poisoning the category's reputation | No enforced skill-resolution requirement, chain-agnostic betting wrappers |

## 4. What we should copy conceptually

- **Automatic matchmaking removes the single biggest friction** in getting a casual player from
  "curious" to "playing for something" — Skillz got this right regardless of everything else it gets
  wrong, and Scoresheet's queue-based pairing should hold to the same "no manual opponent hunting"
  standard.
- **Multiplying payouts across placements, not winner-take-all**, keeps far more entrants engaged —
  Titled Tuesday's category bonuses (top woman, top senior, best debut, perfect-score bounty) are
  worth studying as a pattern even though our funding source is completely different (see §5).
- **State the skill-vs-chance legal test out loud, don't leave it implicit.** Skillz's own legal page
  names the predominance test and puts chess at the pure-skill end explicitly — a public, plain-
  language statement of why the product is legal is itself part of trust-building, not just
  compliance paperwork.

## 5. What we can do better

**We fix custody and account ownership structurally, not by promising better behaviour.** Every
complaint quoted in §3 that traces to "custody" or "account ownership" in the table is impossible to
reproduce in a design with no held balance at all: `chess/SPEC.md` P1 states the payment model
directly — a player sends NIM from their own wallet, to another wallet, and the app never holds a
balance to freeze, merge, delay, or partially deny. There is no withdrawal screen because there is no
custody to withdraw from. This isn't a policy promise; it's the absence of the mechanism the
complaints depend on.

**We fix opacity with a receipt that outlives the app.** Every "was that even a real opponent" and
"they rigged it" complaint in §3 is a demand for a checkable record that none of Skillz's apps provide.
`chess/SPEC.md` F1 and F5 (signed, two-party scoresheets; a public recompute page) are exactly that
receipt — not a promise of fairness, a way to check it.

**We cannot fix the fee the way Skillz's critics want, and shouldn't pretend to.** NIM being feeless
removes the "the platform's cut funds the incentive to rig outcomes" suspicion specifically — but a
genuinely fair-matching, zero-fee cash-chess product with custody would still draw complaints about
whatever *else* goes wrong (disputes, disconnects, no-shows). Removing custody removes a whole class of
complaint; it does not remove disputes about the underlying game itself (§7).

## 6. What is technically required

`chess/SPEC.md` P1 already states the binding constraint for this section: **the Nimiq Mini App
framework has no escrow method**, and the competition rules ban games of chance outright, so any
"skill-decided competition paid in NIM" cannot be a pooled-stake-then-payout structure the way
Skillz's or a betting dApp's is — the app can never legally or technically hold a pooled stake and
redistribute it. What is required instead:

- **Peer-to-peer settlement only**, triggered after a skill-determined result — a player who agrees
  they lost sends the agreed amount directly, from their own wallet, with the game id in the memo
  field (`chess/SPEC.md` P2), which is the same discipline chit uses for its own payments. No app-held
  balance, no app-controlled release.
- **A signed, two-party result record before any payment makes sense** — the same scoresheet
  (`F1`) that anchors the rating anchors the "who owes what" question too, so a dispute about a paid
  competition has the same kind of public, checkable evidence a rating dispute does.
- **A resolution path for a loser who doesn't pay.** Peer-to-peer with no escrow means the platform
  cannot force settlement — this has to be designed for honestly (public non-payment record tied to
  the signed scoresheet, reputational cost, rather than a custodial guarantee) rather than glossed
  over. Chit's own bounty-pool design faced the same "who enforces this" question and answered it with
  visibility rather than custody; the same answer applies here.
- **A funded pool (K7 in `chess/SPEC.md`) is the one place the app *can* legitimately hold and
  distribute NIM**, because it pays from staking rewards it owns, not from other players' stakes — a
  structurally different arrangement from a peer-stake escrow, and the only shape of "the app moves
  money to players" this framework and this ruleset actually permit.

## 7. What could break

- **A loser can simply not pay.** With no escrow, "skill-decided competition paid in NIM" is only as
  reliable as social pressure and reputational cost make it — this needs an explicit, honestly-stated
  design (a public record of unpaid results attached to the signed scoresheet) rather than an implied
  guarantee the architecture cannot actually provide.
- **The regulatory line is a state-by-state and country-by-country patchwork, not a single rule.** US
  states split across predominance, material-element, and any-chance tests for what counts as skill;
  the EU has no uniform definition and leaves it to member states, with mixed-skill/chance games (the
  category chess-adjacent products sometimes drift toward if any randomized element is added) drawing
  the most litigation. [Lexology, "Gaming: Gambling activities and EU law"](https://www.lexology.com/library/detail.aspx?g=e7cb4d1f-eac4-41cd-898f-6c97788b8679);
  [ARROWS, "Gambling vs. skill games"](https://arws.cz/en/news-at-arrows/gambling-vs-skill-games).
  Chess itself sits at the safest end of this spectrum precisely because it has no randomized element
  at all — any future feature that introduces chance (a bonus wheel, a random-seed puzzle reward
  mechanic) reopens a question that plain chess closes.
- **Crypto chess's own track record is a headwind, not a blank slate.** The public precedent search
  engines surface for "chess + crypto + money" is either dormant projects or gambling dApps wearing
  chess branding (§1, §3) — a real reviewer or judge searching the space before evaluating Scoresheet
  will likely hit that precedent first, and the product needs to visibly and immediately distinguish
  itself (no pooled stakes, no chance element, no custody) rather than assume the distinction is
  obvious.
- **NIM's price volatility and near-zero unit value cut both ways.** `chess/SPEC.md` notes NIM was
  measured at $0.00034 on 2026-09-07, meaning small payouts round to $0.00 in fiat display — this
  avoids the "gambling with real stakes" optics Skillz apps draw fire for, but it also means a "paid
  competition" needs a stake size a player actually cares about, which for very small amounts of NIM
  may not clear that bar without a fiat-equivalent display the project has deliberately chosen not to
  ship (`chess/SPEC.md`, same note).

## 8. What we can uniquely do because of Nimiq

**No custody is possible to promise because none is architecturally available.** Skillz's entire
complaint surface in §3 — merged accounts, frozen withdrawals, bonus-cash traps, "rigged" suspicion —
depends on the platform being a party that holds money and controls its release. Nimiq's feeless,
instant, wallet-to-wallet sends mean Scoresheet is never in that position: there is no balance to
freeze because there is no balance held. This is not a policy difference from Skillz; it is a
structural one, and it is the single biggest thing this section's research supports as a genuine,
checkable claim: the *category* of complaint that dominates the real market (custody and account
ownership, per the §3 table) is not something Scoresheet's architecture can produce, not something it
promises not to do.

**The memo field turns every paid result into its own audit trail, for free.** A payment carrying the
game id (`chess/SPEC.md` P2) means a stranger with a block explorer — no login, no app, no trust in
Scoresheet's own ledger — can verify that a specific game resolved and a specific payment followed it.
No Skillz app, no Chess.com prize event, and no crypto chess dApp examined here offers that: Skillz's
settlement is internal and opaque; Chess.com's is a sponsor wiring a bank payment; the crypto chess
projects examined either don't wager peer-to-peer at all or show no evidence of a working product to
compare against.

## 9. Licence and reuse verdict

- **Skillz's platform, matchmaking logic, and app code are proprietary** — nothing here is reusable;
  the value of this research is the failure-mode evidence (§3), not any code or design asset.
- **Chess.com's and the Champions Chess Tour's prize-structure format** (placement tiers plus bonus
  categories) is a public format, not proprietary software — the *pattern* is freely reusable as a
  concept (already covered in §4); no code or licensed asset is implicated.
- **fiveoutofnine-chess** is on GitHub; licence was not confirmed in this pass and must be checked
  directly against its `LICENSE` file before any code or pattern is lifted — **NOT VERIFIED** here,
  and irrelevant to this product's payment model regardless (it is player-vs-contract, not a wagering
  or matchmaking pattern this project needs).
- **Ultrachess's app code** (`Ultrachess/app` on GitHub) was not licence-checked in this pass — status
  of the project itself is uncertain (§1) and no reuse is recommended without independent verification
  of both licence and whether the project is even still functional.
- **Nothing in this research recommends porting code from any source examined** — the market research
  here is about failure modes and structural causes, not implementation, and the only technically
  binding artifact is `chess/SPEC.md`'s own already-decided no-escrow, peer-to-peer payment design,
  which is this project's own original work.
