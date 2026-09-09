# Onboarding — the first 60 seconds

Scope: what Lichess and Chess.com actually show a brand-new user before they've made a single
decision to trust the product, and what a wallet-hosted Mini App must do differently when the
user arrived via a deep link inside their own wallet app and may have zero interest in "crypto"
as a concept — they just tapped a link a friend sent them.

This is a scored dimension for our actual project, not a generic UX nicety: criterion 5 of the
official 21-point rubric is literally **"Onboarding — Can someone go from zero to using the Mini
App in under 60 seconds?"** (`WHAT_NIMIQ_WANTS_VERBATIM.md` §1, restated again verbatim at §7 as
*"Zero to using the Mini App in under 60 seconds."*). Every recommendation below is written
against that exact bar.

## 1. What they do

**Lichess — first 60 seconds**
- The homepage's primary, above-the-fold action is playing chess itself, reachable with
  **zero registration**: a dedicated "play against the computer" path is documented as usable
  with no login and no ads — *"Lichess offers no registration and no ads required to play chess
  with the computer... you can start playing instantly as a guest without any signup needed"*
  (https://lichessguides.com/how-to-play-against-the-computer-without-registration/, corroborated
  by https://lichess.org/forum/lichess-feedback/play-against-computer). The user picks engine
  strength and colour, then the board is immediately interactive.
- Account creation is deferred, not required, for the core "make a move" action — the product
  treats "can this person immediately do the thing" as more important than "is this person
  identified/retained yet."

**Chess.com — first 60 seconds**
- Chess.com's **Guest Play** is the equivalent no-signup path: *"If you haven't created an
  account on Chess.com yet or prefer to play anonymously without attaching an account, you can
  try their Guest Play feature... Click 'Play Online' from the home screen and choose your time
  setting... you'll be matched with someone who also chose that skill level"*
  (https://support.chess.com/article/2804-what-is-guest-play-i-can-play-without-an-account).
  Guest play is explicitly rated/matched against other players choosing their own skill level
  (not just bots), and works identically on desktop and mobile — *"This guest play feature works
  on both desktop and mobile versions of chess.com, allowing you to start playing immediately
  without creating an account or going through any sign-up process."*
- Chess.com layers substantial post-signup onboarding content (lessons, a chess-coach tutor
  guiding fundamentals move-by-move, hint-giving bot opponents) on top of the core guest-play
  path, but that material is explicitly **secondary** to being able to make a move immediately —
  it exists for retention and skill-building after the first session, not as a gate before it.

**Both products, structurally**
- Neither product's core "make a first move" path requires wallet, payment, identity, or any
  concept beyond "here is a board, it's your turn." Any monetisation, ranking, or social layer is
  strictly additive on top of an already-functional, zero-friction first interaction.

**The organiser's own stated bar and warnings, project-primary-source**
(`WHAT_NIMIQ_WANTS_VERBATIM.md`, transcribed directly from the official Cycle 2 Sip & Ship
calls — this is the highest-authority source available for what *our specific judges* will
weigh):
- The scored question is explicit and binary in spirit: *"Can someone go from zero to using the
  Mini App in under 60 seconds?"* (§1, criterion 5).
- Complexity is explicitly named as a scoring cost, not merely a build-time cost: *"Any added
  complexity can make the process of evaluating your Mini App harder, and thus also not result in
  as high of a score... it sounded slightly more complex than it might have to be"* (§4, Call #1
  ~45:00).
- A real Cycle 1 app's judge feedback, quoted directly, names onboarding as one of three
  concrete failure reasons, alongside a second failure this project must not repeat: *"The
  onboarding needed work, error handling wasn't good enough, and the app tried to do too many
  things at once instead of making [one thing] the clear focus. The biggest point for me, though,
  was about reach: [it] only really creates value for people who already have a Nimiq
  address... Ideally, it should help bring new people into the ecosystem, rather than only
  becoming useful once they're already there"* (§4). That builder retired the app and quit Cycle
  2 over exactly this feedback (also corroborated in `SKOOL_FULL_ARCHIVE_FINDINGS.md`, per
  project CLAUDE.md).
- The platform mechanics themselves add real, unavoidable friction at the very first tap: *"If
  the URL is not already in the Nimiq Pay mini app list or has never been accessed before, Nimiq
  Pay shows a warning before proceeding — a real first-tap friction point worth accounting for
  against the '<60 second onboarding' scoring criterion; a brand-new/unlisted app's very first
  open is not frictionless"* (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9).

## 2. Why it works

- Deferring registration until after the user has already experienced the core value (a move on
  a real board) works because it reorders trust-building correctly: a stranger will not commit to
  creating an account for a product they haven't yet verified does the one thing they came for.
  Letting them verify that first, for free, in seconds, is what earns the account creation later.
- Guest play with real matchmaking (Chess.com) rather than only bot play (Lichess's no-login path
  defaults to the computer) demonstrates the *actual social product*, not a stripped-down demo of
  it — the first experience is representative of the real thing, which is why it converts rather
  than merely informs.
- Naming complexity as a direct scoring cost (not just a build-time cost) works as policy because
  it aligns the judge's incentive with the user's: a judge evaluating dozens of Mini Apps in a
  short review window is, structurally, exactly the same "impatient first-time user" the 60-second
  criterion is written for — reducing early friction serves both audiences with the same design
  decisions.

## 3. What they do badly

- Chess.com's own post-signup onboarding, while well-produced (lessons, coach tutorial, hint bots),
  is layered *after* account creation for the full experience — the guest path is real but is a
  reduced preview of the product, not identical to the signed-in one (rating is separate, guest
  games are unrated per the support article's own framing); a user who guest-plays and likes it
  still faces a full second decision (create an account) before getting the "real" product.
  Structurally this is fine for a large multi-purpose platform, but it is a second onboarding
  step our own scored 60-second window does not have room for.
- Lichess's zero-login path defaults to bot play, not human matchmaking — a slightly less
  representative "first taste" of what most users actually want (playing another person), even
  though it is genuinely frictionless.
- Both products' first-60-seconds paths assume the visitor arrived with baseline chess literacy
  (they know what "play against the computer" or "guest play, pick a time control" means) — the
  onboarding is about product friction, not concept friction; neither app spends its first screen
  explaining chess itself, which is correct for a chess-literate audience but is a different
  problem than the one our Nimiq-wallet-arrival user presents (see §5).

## 4. What we should copy conceptually

- **The core interaction must be reachable and genuinely usable before any identity/payment
  gate**, mirroring both products' zero-registration first move — whatever the equivalent "first,
  free, representative taste" of our product is (a practice board, a free puzzle, a spectatable
  live match) must be real, not a stripped demo, and must require no wallet action to reach.
- Treat "does the guest/first-run experience represent the actual product" (Chess.com's real
  matchmaking, not a fake preview) as the bar — our first-60-second flow should show the actual
  mechanic the product is built around, not a simplified stand-in for it.
- Internalise the organiser's own complexity-is-a-scoring-cost framing directly into design
  review: at every point in the onboarding flow, ask "does this step exist because the *user*
  needs it, or because *we* wanted to show something off" — and cut the latter.

## 5. What we can do better

- Our user is structurally different from both reference products' new users in one specific,
  important way: **they already have a wallet open and are already inside it** — they did not
  come from a marketing page, a search result, or an app-store listing; they tapped a deep link
  (a shared match, a challenge, or a listing inside Nimiq Pay's own Mini App directory) and are
  now looking at our app rendered inside their own wallet's chrome. This means:
  - We should **never** ask "do you want to connect your wallet?" as a generic first step the
    way a typical dApp does — the wallet context already exists; the correct first interaction
    is the chess itself, with a wallet-requiring action (starting a paid match, claiming
    winnings) deferred until the user actually chooses to do something that needs it, exactly
    mirroring "defer registration until it's needed," but one level more literal, since the
    "registration" here is real money movement, not a form.
  - We must design explicitly for a user who **may not care about crypto/Nimiq as a concept at
    all** — they came because a friend sent a chess challenge link, not because they wanted a
    "Web3 chess app." The first screen's language and visual framing should read as "a chess
    app that happens to use Nimiq Pay for the money part," not "a crypto app that happens to have
    chess in it" — this is the same lesson the retired Cycle 1 builder's feedback names directly:
    *"it should help bring new people into the ecosystem, rather than only becoming useful once
    they're already there"* (`WHAT_NIMIQ_WANTS_VERBATIM.md` §4) — our onboarding language is the
    literal surface where that principle either holds or fails.
  - We should account for, and actively shorten, the platform-level first-tap friction that is
    unique to us and absent from Lichess/Chess.com entirely: the unlisted-URL warning dialog
    (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9). Since this friction is outside our control on a
    cold, never-opened link, our own in-app screens immediately following it must spend zero
    additional seconds on avoidable friction (no forced tutorial carousel, no forced account
    step) to keep the *total* time-to-first-real-action under the 60-second bar despite that
    unavoidable head start cost.
  - A user arriving via a **challenge/shared-match deep link** specifically should land, within
    that same first screen, already looking at the actual match context (who challenged them,
    the stake if any, the board) — not a generic app home screen they then have to navigate away
    from to find the thing they were sent here for. This directly serves both criterion 3
    ("Can a new user figure out how to use it without instructions?") and criterion 5
    simultaneously, because a deep link that lands exactly on-context removes an entire
    navigation decision from the clock.
- Make the very first payment-requiring moment (if/when the user does start a paid match) show,
  in plain language, exactly what's about to happen and why — reusing the confirmation-quality
  bar this project already holds for resign/forfeit actions (`mobile.md` §5) — since this is very
  possibly the first time this particular user has ever approved an on-chain transaction from
  inside a wallet at all, and a confusing first approval dialog is a worse first impression than
  the honest alternative of a slightly longer, clearer explanation.
- Give the product exactly **one** clear focus in its first screen, not several — directly
  answering the organiser's own named Cycle 1 failure mode (*"the app tried to do too many things
  at once instead of making [one thing] the clear focus,"* `WHAT_NIMIQ_WANTS_VERBATIM.md` §4).

## 6. What is technically required

- [ ] A cold, first-ever open of the app (simulating a brand-new, never-visited deep link) is
  timed end-to-end from tap to the user being able to perform the app's core action, and the
  budget for everything *within our control* (excluding the platform's own unlisted-URL warning,
  which is outside our control) is set well under the 60-second bar, with real margin — the
  criterion is binary at judge-review time, not "close."
  - **Note:** confirm precisely against a real Nimiq Pay build whether the "URL not yet
    accessed" warning (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9) still applies once an app is
    **listed** in the official Mini App directory, or only for raw/unlisted URLs — **NOT VERIFIED
    in this research pass**; this materially changes how much of the 60-second budget is
    "spent" before our own UI even renders, and should be tested directly rather than assumed.
- [ ] No wallet-connection or provider-confirmation call fires automatically on first load — the
  documented hard anti-pattern (*"Do not trigger approval dialogs on page load without user
  interaction,"* `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §12a) applies with extra force to the very
  first screen a brand-new user ever sees of the product.
- [ ] The core interaction (whatever we define as the product's central, representative action —
  making a move, viewing/joining a live match, solving a puzzle) is reachable and fully
  functional with **zero** wallet balance and **zero** prior transactions, using the Device
  Identifier API's no-wallet-needed per-device handle where a persistent-but-anonymous identity
  is useful before any payment step (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §"Device Identifier").
- [ ] Deep-link entry points that carry match/challenge context (a specific opponent, a specific
  stake) render that context immediately on the landing screen — no intermediate "home screen"
  navigation step required to reach the thing the link was for (cross-reference `navigation.md`
  §6).
- [ ] Every first-run screen's copy is written and reviewed for a reader who does not know what
  "Nimiq," "NIM," or "a Mini App" mean, and does not need to know in order to understand what to
  do next — jargon-free framing of the *chess* action, with wallet/payment language introduced
  only at the exact moment it becomes relevant (starting a stake, claiming winnings), never
  earlier.
- [ ] No mandatory tutorial, carousel, or explainer sequence blocks the first real interaction —
  if any explanatory content exists, it must be skippable in one tap and default to skipped/
  collapsed, not force-walked.
- [ ] The product's single clearest "one thing" is identifiable within the first screen without
  scrolling or additional navigation — a direct, testable answer to "does this read as one
  focused product or several stitched together."

## 7. What could break

- Treating "connect wallet" as a generic first-screen call-to-action (the default pattern for
  most dApps, and a pattern our own product must deliberately avoid) would directly contradict
  both the "defer identity/payment until needed" principle borrowed from Lichess/Chess.com and
  the organiser's own retired-builder warning about apps that only create value for people
  already inside the ecosystem.
- The platform-level unlisted-URL warning dialog is a real, documented friction point outside
  our control (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md` §9) — if our own post-warning screens add even
  a small amount of avoidable friction (a slow load, a forced account step, a tutorial), the
  combined total can plausibly cross the 60-second line even though our own code "only" added a
  few seconds, because the platform friction already spent part of the budget before we had any
  control.
- A deep link landing a first-time user on a generic home screen instead of directly on the
  match/context they were invited to strands them one extra, avoidable navigation step into an
  unfamiliar app — exactly the kind of avoidable complexity the organiser explicitly penalises.
- Any confirmation dialog copy that assumes wallet/crypto literacy (technical terms, unexplained
  gas/fee language, chain names) on a user's very first-ever approval risks the same category of
  failure as an unclear resign confirmation, but with higher stakes, since it's a real financial
  approval and the user's very first one in this product.
- Judges reviewing dozens of Cycle 2 submissions in a limited window are, per the organiser's own
  framing, functionally the same time-pressured "zero to sixty seconds" user this criterion is
  written for — an onboarding flow that only works well for a patient, motivated user (rather
  than a skimming judge) will likely score against us even if real end-users would eventually get
  through it.

## 8. What we can uniquely do because of Nimiq

- We can genuinely skip an entire onboarding step neither Lichess nor Chess.com can skip: **user
  identity already exists** by the time our app loads, because Nimiq Pay's WebView has already
  authenticated the person as themself before our page ever renders — there is no equivalent of
  "create an account" or even "guest sign-in" to build at all; the wallet context is simply
  present. The design work is entirely about *not* squandering that head start with an
  unnecessary connect-wallet step of our own invention.
- The Device Identifier API gives us a persistent, anonymous, no-wallet-required handle
  (`NIMIQ_DEV_DOCS_FULL_REFERENCE.md`, "Features → Device Identifier") — something neither
  reference product has an equivalent of in this exact form — letting us give a first-time,
  not-yet-paying user a real, persistent (not session-only) identity and history within the app
  before they ever approve a transaction, which is a strictly better cold-start experience than
  either "fully anonymous, no memory across sessions" or "must create an account."
- Deep links carrying real match/challenge context (§5, §6) mean our product's most natural
  viral-growth mechanic — a friend sending a specific challenge — can be engineered to land the
  recipient exactly inside that context in one tap, with zero of the "open app → find your way to
  what your friend meant" navigation cost either Lichess or Chess.com's own sharing mechanics
  carry, because neither is distributed through a host wallet's own deep-link system the way a
  Mini App is.
- Because the organiser has explicitly said usage is checked by real telemetry against distinct
  wallets, not self-reported numbers (*"The Nimiq team and the Nimiq foundation has the ability to
  check the usage of Nimiq Pay and the Nimiq Pay mini apps framework,"* `WHAT_NIMIQ_WANTS_VERBATIM.md`
  §6), a genuinely frictionless, honest first-60-seconds flow is not just good UX — it is the
  direct lever on the separate, heavily-weighted usage/traction scoring pillar, since every point
  of onboarding friction we remove is a real, measurable improvement in how many of the people who
  tap our link actually convert into one of those counted distinct wallets.

## 9. Licence and reuse verdict

- No code is proposed for reuse in this file. All Lichess/Chess.com claims are drawn from public
  help-center articles, third-party guides, and forum posts describing observed product
  behaviour — safe to describe and design against, not licensed material being copied.
- The Nimiq-specific quotes are drawn from this project's own primary-source transcripts
  (`WHAT_NIMIQ_WANTS_VERBATIM.md`, `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`) — the project's own
  documented source of truth for what our judges and platform actually require, not third-party
  IP.
