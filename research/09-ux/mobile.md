# Mobile chess UX — small screens, one-handed use, landscape, haptics, safe areas

Scope: everything specific to playing chess on a phone, inside a fixed ~390×844 wallet WebView
viewport (per project scope), as opposed to general board-interaction mechanics (covered in
`board.md`).

## 1. What they do

**Layout and board sizing**
- Both Lichess and Chess.com mobile apps put the board as the dominant element of the play
  screen: it fills the full device width, with the two players' name/clock/material strips
  stacked directly above and below it, and no other chrome competing for space during an active
  game.
- Chess.com explicitly still lacks a way to reposition the on-screen clock relative to the
  player's hand — a user reported *"their fingers block the clock view while playing on
  mobile, particularly right-handed players,"* with no repositioning option, and only a
  partial fix on desktop Focus Mode ("left-handed players can have the clock on the left side by
  starting a new game from the home page") — https://www.chess.com/forum/view/site-feedback/clock-placement-focus-mode,
  https://www.chess.com/forum/view/site-feedback/position-of-clock-on-mobile.

**Move input methods (Lichess)**
- Lichess exposes an account-level **"how do you move pieces"** setting distinguishing
  click-to-move from drag-and-drop, plus a **"move on release"** behaviour: with it on, the
  move only commits when the finger *lifts*, letting the player slide their finger to correct
  the destination square before release rather than committing the instant they touch a second
  square — this directly targets touch mis-taps
  (https://lichess.org/account/preferences/game-behavior, corroborated via search;
  exact page contents behind login — **NOT VERIFIED against the live page in this session**,
  but the setting's existence is corroborated by GitHub issue titles referencing "how do you
  move pieces" preference and third-party write-ups).
- Lichess supports **multi-premove** input (queueing more than one premove in sequence),
  reachable via an "always multipremove" preference or a dedicated on-board control, and the
  community explicitly recommends **setting piece animation to "None"** when doing this, because
  animation delay stacks up across a premove chain and costs real clock time in bullet/blitz
  (https://lichess.org/forum/lichess-feedback/games-feature-request-multiple-premoves,
  https://github.com/icecream17/Multi-Premoves-Mouse-Keyboard).
- **Zen mode** strips the left sidebar (chat, opponent name/rating) and right sidebar (move
  list, clock detail) down to just board and clock, toggled with the keyboard shortcut `Z` on
  web, and is a per-account preference with an "in-game only" variant reported to have a bug
  where it resets between games (lichess-org/mobile#3226 —
  https://github.com/lichess-org/mobile/issues/3226; conceptual existence of zen mode confirmed
  at https://lichess.org/forum/general-chess-discussion/what-is-zen-mode).
- **Blindfold / blind mode**: a documented, dedicated tutorial and mode exists for screen-reader
  and blind players, with move announcement styles (e.g. the "Anna method" of pronouncing
  moves) and the ability to type moves directly (e.g. typing "e4" submits instantly) rather than
  using the visual board at all (https://lichess.org/page/blind-mode-tutorial).
- Lichess piece sets and board themes/colour schemes are configurable per-account
  (https://lichess.org/forum/lichess-feedback/color-scheme corroborates the existence of a
  colour-scheme preference thread; exact options list on the live settings page is **NOT
  VERIFIED in this session** — the page requires login and could not be fetched directly).

**Haptics**
- Lichess's newer/beta mobile app fires haptic feedback **during** the move gesture (while
  dragging/committing), which a user description calls *"correct... gives a subtle vibration
  while making a move, making the experience feel natural and responsive... smooth, immersive"*
  — contrasted directly against Chess.com, whose haptic fires **after** the move is already
  complete, described as feeling like a delayed, disconnected buzz rather than tactile
  confirmation of the gesture itself
  (https://www.chess.com/forum/view/site-feedback/chess-com-haptic-feedback-on-mobile-app-is-wrong-please-fix-it).
  A separate report notes iOS apps can use the Taptic Engine for differentiated feedback —
  *"a simple tap for an opponent's move or a stronger double tap for a check"* — as a richer
  vocabulary than a single generic vibration
  (same thread; specific per-event mapping in that quote is a description of iOS Taptic Engine
  capability generally, not a confirmed Lichess/Chess.com implementation detail —
  **NOT VERIFIED** which app actually maps check to a distinct pattern).
- Chess.com's Android app has an open, repeated complaint of vibrating on **every** opponent
  move regardless of significance, with users asking for a way to disable it entirely — Chess.com
  does provide a haptics toggle (Settings) per their own help article
  (https://support.chess.com/en/articles/9211337-how-do-i-disable-haptic-feedback), which is
  itself evidence the undifferentiated all-or-nothing vibration was disruptive enough to need a
  global kill switch rather than a smarter per-event design
  (https://www.chess.com/forum/view/help-support/android-app-vibrates-every-time-opponent-moves).

**Resign / irreversible-action safety**
- Chess.com requires confirmation before a resignation completes ("Confirm Resign"), but
  multiple independent user reports describe the confirm control sitting close enough to
  navigation/back controls that a rushed or fat-fingered tap sequence (e.g. tapping back twice
  while reviewing a finished game, or fumbling the phone during an interruption like an
  incoming call) can trigger and then confirm a resignation unintentionally —
  https://www.chess.com/forum/view/site-feedback/resigning-by-mistake-bad-site-design,
  https://www.chess.com/forum/view/general/accidental-resignation-in-daily-chess,
  https://www.chess.com/forum/view/general/i-accidently-hit-the-resign-button. A player
  proposed the fix directly: *"position the resign confirm button in the middle of the
  screen"* / *"move the confirm resign button to somewhere completely different than the
  resign button"* — i.e. break spatial proximity between the trigger and its own confirmation.

**One-handed reach / thumb ergonomics (general mobile UX, not chess-specific)**
- Steven Hoober's original field research (cited across multiple secondary sources,
  UXmatters 2013 — https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
  found roughly half of smartphone users hold and operate the device one-handed, with the thumb
  doing the reaching; Smashing Magazine's treatment
  (https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/) reports
  roughly three-quarters of touch interactions on a phone are thumb-driven, and formalises the
  three-zone reach map: a **green** easy-reach zone (bottom-center, where primary actions
  belong), a **yellow** zone requiring a stretch (mid-screen sides), and a **red** zone that's
  awkward or impossible one-handed (top corners, typically requiring a grip change or the other
  hand).

## 2. Why it works

- Board-dominant layout works because the board **is** the content — every pixel not spent on
  the 8×8 grid on a ~390px-wide screen is a pixel of already-scarce square size given up, and
  square size is what determines mis-tap rate.
- "Move on release" directly targets the actual failure mode of tap-tap on touch: the finger's
  *contact point* is imprecise, but a slide-to-correct-before-release gives the user a second,
  free chance to fix an imprecise initial touch without it costing a move.
- Zen mode and blindfold mode both work by **subtracting**, not adding: they remove sidebar
  noise or remove the visual channel entirely, which is the correct response to a genuinely
  different usage mode (competitive-focus play vs. accessibility-first play) rather than trying
  to make one layout serve every need through more options crammed into the same screen.
- In-gesture haptics (Lichess's fire-during-the-move behaviour) work because they close the
  loop on the *action*, functioning like a spring-loaded physical button click — it confirms
  "the system registered your gesture" at the moment of the gesture, which is the moment the
  user needs reassurance. After-the-fact haptics (Chess.com's reported behaviour) instead
  confirm something the user can already see happened (the piece already moved on screen),
  adding sensory noise without adding information.
- The thumb-zone model works because it's descriptive of anatomy, not opinion: a control placed
  in the red zone will objectively cost more mis-taps and slower reaches regardless of how
  clearly it's labelled, because the muscle mechanics of a one-handed thumb reach don't care
  about visual design.

## 3. What they do badly

- Chess.com's clock placement is a known, acknowledged-but-unfixed one-handed ergonomics
  failure: the player's own gripping hand and thumb obscure the clock for a large share of
  right-handed users, and there is still no user-facing setting to move it
  (https://www.chess.com/forum/view/site-feedback/position-of-clock-on-mobile).
- Chess.com's resign-confirmation flow repeatedly produces real accidental resignations —
  multiple independent forum threads over time report the same root cause (spatial proximity
  between an irreversible action's confirm control and an unrelated, frequently-used
  navigation control), which is exactly the kind of defect a deliberate touch-target-collision
  review (see `board.md` §5) is meant to catch before shipping, not after users complain.
- Chess.com's default per-move haptic (vibrate on every single opponent move, with no severity
  differentiation) was disruptive enough that the only shipped fix was a global on/off toggle
  rather than a smarter per-event design — an all-or-nothing setting is a blunt instrument
  covering for the absence of a better default.
- Neither product's onboarding/settings surface (as documented in what's publicly findable) has
  a first-run "which hand do you play with" or reachability-aware layout — clock/action-button
  placement appears fixed regardless of handedness, despite the underlying one-handed-reach
  research being decades-old and well established.

## 4. What we should copy conceptually

- Board-first layout: on a ~390×844 screen, the board should be the largest possible element,
  with clock/name/material strips minimal and directly adjacent, and nothing else competing for
  vertical space during active play.
- "Move on release" as the default tap-tap commit behaviour — commit on lift, not on second
  touch-down, giving a free correction window.
- A genuine, low-noise "focus" layout mode (Lichess's Zen mode idea) for the in-game screen:
  strip everything that isn't board, clock, and the single next required decision.
- In-gesture haptic confirmation (buzz at the moment of move commit, not after), reserved for
  the mover's own successful input — not blanket-fired for every opponent move, which is the
  behaviour users are asking to disable on Chess.com.
- Explicit spatial separation between any irreversible/high-stakes action's trigger and its own
  confirmation control — never stack them, never place them adjacent to a frequently-tapped
  navigation control.
- Design every primary in-game control (move confirm, resign, offer draw, accept/decline) with
  the thumb-zone map in mind: primary, frequent, low-risk actions in the green zone
  (bottom-center); irreversible, high-stakes actions deliberately placed to require an
  unambiguous, deliberate reach rather than a stray brush.

## 5. What we can do better

- Ship differentiated haptics from day one, not as a later toggle bolted on to quiet
  complaints: a distinct, lighter pattern for "your move landed" vs. a distinct, more assertive
  pattern reserved for "you are in check" or "a payment/wager settled," so the vocabulary
  carries real information rather than being pure noise the user eventually mutes.
- Give the resign/forfeit-equivalent action (and any wager-cancel or fund-forfeiting action, a
  category Lichess/Chess.com don't have at all) a spatially isolated, two-step confirmation
  where the confirm target is not merely "the same button again" or "a button directly below/
  above the trigger" — put it in the visual center of the board area, away from any navigation
  chrome, exactly as Chess.com's own users have publicly requested since at least the forum
  threads cited above.
- Since a wager/paid match ties directly to money, treat the resign confirmation with the same
  rigor as a payment confirmation: show the stake at risk in the confirm dialog itself ("Resign
  and forfeit 5 NIM?"), not a generic "Are you sure?" — this is a place our product has a real
  reason to be stricter than either reference app, because neither of them has real money
  riding on the action.
- Solve Chess.com's unfixed one-handed clock-occlusion problem at the design stage: keep clock/
  status text out of the bottom third of the screen closest to where a right- or left-handed
  grip naturally covers, or offer a lightweight, low-effort handedness toggle at first run
  rather than leaving it as a permanent, unaddressed complaint.
- Default piece-animation duration should shorten automatically in fast time controls or during
  active premove chains (mirroring the community's manual "set animation to None for
  multipremove" workaround on Lichess) rather than requiring the player to discover and set
  this manually.

## 6. What is technically required

- [ ] Board occupies full available width inside the WebView's usable content area (accounting
  for safe-area insets, see below), scaling to whatever height budget remains after clock/name/
  material strips.
- [ ] "Move on release" tap-tap semantics: the destination is committed on pointer-up, not
  pointer-down, with the ability to slide the finger between the two touches to change the
  intended destination square before release.
- [ ] A focus/minimal layout mode that hides secondary chrome (opponent profile links, move
  list detail, extraneous status text) down to board + clock + the single next required
  decision, toggleable and persisted per session at minimum.
- [ ] Haptic feedback fires at gesture-commit time for the mover's own move (not after render),
  using the platform's native haptic API surfaced to the WebView — verify what's actually
  reachable from inside a Nimiq Pay WebView context, since a Mini App is not a native app and
  may not have direct Taptic Engine / Android `Vibrator` access without an explicit bridge;
  **NOT VERIFIED whether Nimiq Pay's WebView exposes any haptic-triggering API to Mini
  Apps** — confirm against the Nimiq Provider API surface before committing to this as a
  planned feature (see `NIMIQ_DEV_DOCS_FULL_REFERENCE.md` for the full provider method list;
  no haptics method was found there in this pass).
- [ ] At least two distinct haptic/visual feedback intensities: a light confirmation for a
  normal move, a distinct pattern for check, and a distinct, more deliberate pattern (or none,
  substituted by an explicit confirm step) for a resign/forfeit action.
- [ ] Resign (and any future forfeit-a-stake action) requires a two-step confirm whose second
  step is spatially isolated from both the trigger and from any navigation control, and states
  the concrete consequence in plain text (what is lost, e.g. the game and/or the stake).
- [ ] All primary controls used during active play (move confirm implicit in tap-tap/drag,
  resign, draw offer, premove cancel) are laid out with the thumb-reach map in mind for a
  right-hand-dominant one-handed hold as the default assumption, since that is the majority
  case per the cited research — with the board itself, which needs both accurate taps and
  visibility, treated as the exception that gets the full width regardless of reach zone.
- [ ] `viewport-fit=cover` plus CSS `env(safe-area-inset-*)` applied to every edge of the
  in-game layout, so no interactive control (clock, resign button, move-confirm affordance)
  renders under a device notch, camera cutout, or the iOS home-indicator bar
  (https://blog.felgo.com/cross-platform-app-development/notch-developer-guide-ios-android,
  https://ruoyusun.com/2020/10/21/webview-fullscreen-notch.html — WebView-specific full-screen/
  notch handling is a known distinct problem from native-app safe-area handling and must be
  tested inside the actual Nimiq Pay WebView, not just Chrome/Safari, since WebView chrome
  insets can differ from the host browser's).
- [ ] Landscape orientation: either explicitly locked to portrait (simplest, matches the
  project's stated 390×844-class viewport target) or, if landscape is supported at all, the
  clock/status strip relocates to the side of the board rather than staying stacked
  above/below and being squeezed vertically — decide and document this explicitly; do not leave
  landscape as an untested, accidentally-reachable orientation.
- [ ] Board and control layout tested with the on-screen keyboard open (for any text-input
  affordance, e.g. typed move entry or chat) to confirm nothing critical is pushed off-screen
  or occluded.

## 7. What could break

- A haptics feature planned against a generic "mobile app" mental model may simply not be
  reachable from a Mini App's WebView sandbox at all — this must be verified against the actual
  Nimiq Provider/Device Identifier API surface before it's promised in a design doc; if
  unavailable, the feedback loop has to be carried entirely by visual + audio cues instead.
- Safe-area insets behave differently inside a WebView than inside the host wallet app's native
  chrome — a layout that tests clean in a normal mobile browser tab can still clip under a
  notch or the home-indicator once actually loaded inside Nimiq Pay's WebView, because the host
  app's own chrome (address-bar-equivalent, if any) consumes part of the viewport differently.
- A rushed one-step resign or wager-forfeit action is a direct money-loss bug class if it isn't
  deliberately hardened — Chess.com's own accidental-resignation reports are a proof-of-concept
  for what happens when a stakes-carrying action isn't spatially isolated; here the cost of the
  same class of bug is a real, non-reversible on-chain-settled loss, which is strictly worse
  than losing a rated game.
- Undifferentiated, always-on haptics (mirroring Chess.com's per-opponent-move buzz complaint)
  risks the same "please let me disable this" backlash if shipped as a blanket vibrate-on-every-
  event default rather than a deliberately scoped, meaningful vocabulary.
- Assuming a fixed portrait viewport without actually locking orientation leaves landscape as
  an untested, reachable state — any layout element positioned with fixed pixel offsets rather
  than responsive/safe-area-aware units will break first here.
- A device or OS with reduced/disabled haptics (accessibility setting, low-power mode) must not
  leave the user with *no* move-confirmation signal at all — the visual feedback (animation,
  highlight) must always be sufficient on its own, with haptics as pure enhancement, never the
  only feedback channel.

## 8. What we can uniquely do because of Nimiq

- Because the target device class is fixed and known (Nimiq Pay's WebView at a
  ~390×844-class viewport, per project scope) rather than "any phone browser at any size," the
  layout and touch-target math can be tuned and tested against one real, bounded viewport
  family instead of the sprawling device matrix Lichess and Chess.com's general-purpose mobile
  apps must support — this directly reduces the safe-area and thumb-reach edge-case surface
  compared to either reference product.
- A resign/forfeit action that risks real settled value (NIM or Arc/USDC stake, per the
  project's rails) can legitimately be held to a stricter, money-grade confirmation bar than
  either Lichess or Chess.com apply to their own (stakes-free) resign action — showing the exact
  amount at risk in the confirm step is a design option neither reference product needs, because
  neither has money on the line.
- If a haptics bridge does turn out to be reachable through the Nimiq Provider surface (must be
  verified, not assumed — see §7), a **payment-settlement haptic** distinct from any move
  haptic (a "your winnings just settled on-chain" tactile confirmation) is a feedback event
  neither reference product can offer, because neither has an underlying instant, feeless
  settlement rail to confirm.

## 9. Licence and reuse verdict

- No code is proposed for reuse in this file — it documents product/UX behaviour and published
  third-party research (Hoober's thumb-zone findings, Smashing Magazine's treatment), not
  library source. Thumb-zone research findings are factual/statistical claims from published
  articles, freely citable; no licence conflict applies to citing UX research findings in our
  own documentation or applying the design principle in our own original code.
- Any specific numeric constants pulled from Apple's Human Interface Guidelines (44×44pt
  minimum touch target) or Google's Material Design (48×48dp) are publicly published design
  guidance, not licensed code — safe to apply as design constraints; **do not** copy Apple's or
  Google's own icon/asset files without checking their respective asset licences separately
  (out of scope for this file; flag before importing any HIG/Material asset directly).
