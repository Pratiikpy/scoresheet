# Accessibility checklist — testable requirements, ordered by cost of absence

Companion to `accessibility.md` (the survey/standard) and `board.md`/`mobile.md` (interaction and
touch mechanics). This file is the specification: every line is written so it can become either an
automated assertion in the project's existing browser-check audit (currently 472 checks, 156
contrast pairs) or a documented manual test procedure. Each item that maps to a WCAG 2.2 success
criterion carries its exact number and level, sourced from `https://www.w3.org/TR/WCAG22/` and the
per-criterion Understanding pages (fetched 2026-09-08, full citations in `accessibility.md` §1).
Items with no WCAG number are project-specific hardening beyond the legal minimum, called out as
such.

## 1. What they do

`accessibility.md` §1 carries the full survey (WCAG 2.2 text, the ARIA Grid pattern, Lichess's
Blind Mode and its GitHub issue history, Chess.com's App-Store-only accessibility declaration,
Okabe–Ito colour guidance, and `prefers-reduced-motion` mechanics including the confirmed gap in
lila's own board-animation code). This file does not re-derive any of it — every checklist item
below traces back to a finding recorded there.

## 2. Why it works

The ordering principle for §6 below is **severity of absence, not ease of implementation**: an
item that fully excludes a class of user from playing at all ranks above an item that merely
degrades their experience, regardless of which is cheaper to build. This mirrors how
`accessibility.md` §3 treats Lichess's own defect history — a silent `aria-live` region (#20435)
and an unconfirmed resign button (#17434) are both worse than a missing colourblind theme, because
the first two can make the product literally unusable or cause real loss, while the third is a
degraded-but-usable experience. Ranking this way also matches this project's own stated
philosophy (`CLAUDE.md`: "never below Lichess," "leave nothing broken") — a partial pass that
skips the highest-severity items first is not a partial pass, it is choosing to ship the exact
defects that generated the real bug reports cited in `accessibility.md` §1.

## 3. What they do badly

The two reference products' concrete, sourced failures each map onto one or more checklist rows
below, so the checklist itself is falsifiable against them:
- Lichess #20435 (silent live region) → row A1/A2.
- Lichess #19691 (confusable feature names, no warning) → row F4.
- Lichess #17434 (no resign/draw/takeback confirmation in NVUI) → row D1/D2.
- Lichess #17791 (regression silently broke NVDA commands) → row H1/H2 (regression coverage).
- Lichess #17019/#20160 (mobile-specific NVUI bugs found late) → row G1–G4.
- Lichess board animation not wired to `reducedMotion()` → row E1.
- Neither product ships a labelled colourblind board theme → row C4.
- Chess.com: no public accessibility documentation beyond two App-Store-declared features → row I1
  (documentation as a checklist item in its own right, not just an implementation one).

## 4. What we should copy conceptually

Nothing new here beyond `accessibility.md` §4 — this file's contribution is turning that section's
concepts into rows B1–B8, C1–C8, D1–D6 below with pass/fail conditions precise enough to automate
or script as a manual test case.

## 5. What we can do better

The single structural difference this checklist enforces that neither reference product's own
process enforces (per §3 above): **every row below is meant to be checked on every release**,
automatically where marked "automatable," and as a scripted manual pass where marked "manual
only" — closing the exact gap that let Lichess's #17791 regression ship unnoticed for about a day
and that let #17019/#20160 exist as separately-discovered, later-filed bugs against a "finished"
desktop feature.

## 6. What is technically required

Format: **[Severity tier] Row-ID — requirement — WCAG ref — automatable / manual-only — pass
condition.**

### Tier 1 — total exclusion if missing (ship-blocking, no exceptions)

- **[T1] A1 — Every move outcome is announced to assistive technology in an `aria-live` region,
  verified on at least one real screen reader per platform (NVDA or JAWS on Windows, VoiceOver on
  iOS/macOS, TalkBack on Android), not just checked in a DOM inspector.** — WCAG 4.1.2 (A), and
  the specific real-world failure mode of "correct markup, silent in practice" documented in
  `accessibility.md` §1/§3 (Lichess #20435). *Manual only* (requires a real device + real screen
  reader per release; a DOM-attribute-presence check is a necessary but explicitly insufficient
  proxy — keep it as an automated smoke check, but never treat it as satisfying this row).
- **[T1] A2 — The live region does not go silent when its new text is identical to its previous
  announcement (e.g. a repeated "your move" or "illegal move" state).** — no direct WCAG number;
  derived from the documented screen-reader suppression behaviour in `accessibility.md` §1. Fix
  pattern: force a distinguishable string on every update (e.g. an invisible incrementing marker
  character) rather than relying on the visible text alone. *Automatable* (assert the live
  region's underlying DOM text/attribute changes on every triggering event, even when the
  human-visible portion repeats).
- **[T1] B1 — Every move can be completed via keyboard alone, start to finish, with no pointer
  input at any step (selection, destination, promotion choice, confirmation).** — WCAG 2.1.1 (A).
  *Automatable* (scripted keyboard-only playthrough of a full game including at least one
  promotion and one castle).
- **[T1] B2 — Every move-capable interaction that supports dragging also has a no-drag,
  single-pointer equivalent (tap-tap / click-click) that reaches full parity, not a reduced
  feature set.** — WCAG 2.5.7 Dragging Movements (AA), exact text: *"can also be operated by
  single pointer activation without dragging, unless dragging is essential."* *Automatable*
  (script a full game using only tap/click events, zero drag/pointer-move sequences).
- **[T1] B3 — The board container and every interactive square expose a programmatically
  determinable role, name, and current state (occupied/empty, piece identity, selected,
  legal-destination, in-check), and state changes are exposed to assistive technology without a
  page reload.** — WCAG 4.1.2 Name, Role, Value (A). *Automatable* (accessibility-tree snapshot
  assertions per square, before/after a move).
- **[T1] C1 — No board or game-state information is conveyed by colour alone: selected square,
  legal-destination indicator, last-move highlight, check highlight, and premove highlight each
  carry a non-colour signal (shape, icon, pattern, text) in addition to colour.** — WCAG 1.4.1 Use
  of Color (A). *Automatable* (render each state with colour removed/greyscaled in a test pass and
  assert the state is still distinguishable in the DOM/accessibility tree, not just visually).
- **[T1] D1 — Resign (and any other action that forfeits a real stake — draw-with-stake-split,
  timeout-forfeit acknowledgement) requires an explicit two-step confirmation in every input
  mode (touch, keyboard, screen reader), with no mode allowed to skip the confirmation step.** —
  no WCAG number; this is the project's own money-grade bar, directly harder than either reference
  product's own (Lichess: the sighted UI confirms, the NVUI historically has not — see
  `accessibility.md` §1, #17434). *Automatable* (assert the confirmation dialog is reachable and
  its DOM/focus state is entered via every supported input path before the resign network call
  fires).
- **[T1] D2 — The confirmation dialog for a stake-forfeiting action states the concrete amount at
  risk in plain, screen-reader-announced text (not a generic "are you sure?"), and is spatially/
  focus-order isolated from the triggering control and from any navigation control.** — extends
  `board.md` §5/`mobile.md` §5's sighted-UI requirement into every input mode. *Automatable*
  (assert the dialog's accessible-name/description text contains the current stake amount, and
  that the confirm control is not the immediately-next focus-order/tab-order stop after the
  trigger without an intervening state change).

### Tier 2 — severely degrades or partially excludes if missing

- **[T2] A3 — Move announcements include, at minimum: piece moved, origin square, destination
  square, capture (if any), check/checkmate (if any), promotion (if any), castling (if any), and
  whose turn is next.** — extends 4.1.2; content completeness derived from Lichess's own shipped
  announcement vocabulary (`accessibility.md` §1/§4, `sanWriter.ts`'s `sanToWords`). *Automatable*
  (assert the announced string for a scripted sequence covering all seven cases contains the
  expected semantic content, allowing for phrasing-style variation).
- **[T2] A4 — Clock state (both players' remaining time) is available on demand to assistive
  technology, not only rendered visually.** — extends 4.1.2. *Automatable* (assert an accessible
  name/value or an on-demand announcement path exists for both clocks).
- **[T2] A5 — Every SAN symbol the app can produce is passed through a TTS-mispronunciation check
  before being spoken: a leading disambiguation letter that could be read as an article or unit
  (e.g. isolated "A"), a rank/file combination that could be misread as scientific notation (e.g.
  a "1E5"-shaped string), and any letter immediately following a digit that a common TTS voice
  reads as a unit (e.g. "C"/"F" as temperature, "H" as hour) are each escaped or reformatted
  before being handed to the announcement string.** — no WCAG number; derived directly from the
  fixes present in Lichess's own shipped `sanWriter.ts` (`accessibility.md` §4). *Automatable*
  (unit-test the announcement-formatting function against a fixed list of known-problematic SAN
  strings, e.g. `a3`, `1...e5`, `R8c3`, `Rh3`, asserting the output no longer contains the
  raw problem substring).
- **[T2] B4 — Every pointer target (square, promotion-picker option, resign/confirm/cancel
  control) is at least 24×24 CSS px, or — where visually smaller — has effective spacing such that
  a 24px-diameter circle centred on it does not intersect any other target.** — WCAG 2.5.8 Target
  Size Minimum (AA). *Automatable* (measure rendered bounding boxes at the project's target
  viewport sizes).
- **[T2] B5 — Every stake-forfeiting or otherwise irreversible control (resign confirm, stake
  amount confirm) is at least 44×44 CSS px.** — WCAG 2.5.5 Target Size Enhanced (AAA), applied
  here as a project floor for money-adjacent controls specifically, matching `board.md`
  §5's promotion-picker sizing rule. *Automatable* (same measurement, higher threshold, scoped to
  the specific control set).
- **[T2] B6 — The currently keyboard/screen-reader-focused square (or control) has a visible focus
  indicator at all times during non-pointer navigation, and that indicator is never fully hidden
  by any other on-screen content (header, footer, promotion picker, toast).** — WCAG 2.4.7 Focus
  Visible (AA) and 2.4.11 Focus Not Obscured Minimum (AA). *Automatable* (assert focus-ring
  presence and unobstructed bounding-box visibility per focus-move step in a scripted keyboard
  walkthrough, including with any overlay open).
- **[T2] B7 — The focus indicator meets a minimum visual weight: at least a 2 CSS pixel thick
  perimeter around the focused element/sub-element, with at least 3:1 contrast between the
  focused and unfocused pixel states.** — WCAG 2.4.13 Focus Appearance (AAA), applied as a project
  floor rather than an AAA aspiration, consistent with this project's "beat the large platforms"
  brief. *Automatable* (measure rendered focus-ring stroke width and compute contrast against the
  adjacent unfocused-state colour).
- **[T2] B8 — Keyboard navigation across the board follows the ARIA Grid pattern exactly: arrow
  keys move one cell in the pressed direction, Home/End move to the first/last cell in the current
  rank, Ctrl+Home/Ctrl+End move to a1/h8 (or the grid's first/last cell for the current
  orientation), and focus movement uses roving tabindex (the previously-focused cell's `tabindex`
  becomes `-1`, the newly-focused cell's becomes `0`, and real DOM focus moves) rather than
  `aria-activedescendant`.** — derived from the APG Grid pattern and keyboard-interface guidance
  (`accessibility.md` §1). *Automatable* (scripted key-sequence assertions against
  `document.activeElement` and each cell's `tabindex` attribute).
- **[T2] C2 — Every colour pair used for a board highlight state (selected, legal-destination,
  last-move, check, premove) against its background meets 3:1 contrast in both the light and dark
  board themes, feeding into the project's existing 156-pair contrast audit rather than a separate
  one-off check.** — WCAG 1.4.11 Non-text Contrast (AA). *Automatable* (already the shape of the
  existing audit; extend its pair list to include every highlight-state/theme combination).
- **[T2] C3 — All in-game text (move list, clock labels, command-field placeholder/help text,
  dialog copy) meets 4.5:1 contrast (3:1 for large text), in both light and dark themes.** — WCAG
  1.4.3 Contrast Minimum (AA). *Automatable* (existing audit shape, extended to any new UI copy
  added alongside the board).
- **[T2] E1 — `prefers-reduced-motion: reduce` collapses the duration of the piece-movement
  animation and the captured-piece fade toward zero, verified against the actual animation code
  path used during real play — not only against a decorative/celebratory animation (the specific
  gap confirmed in Lichess's own source, `accessibility.md` §1).** — WCAG 2.3.3 Animation from
  Interactions (AAA), applied as a project floor. *Automatable* (render a move with the media
  query forced to `reduce` and assert the animation's actual computed duration/timing, not just
  that a class name toggled).
- **[T2] D3 — Any "learn/hint/rules" help affordance appears in the same relative position and
  order across every screen it's present on (lobby, in-game, results).** — WCAG 3.2.6 Consistent
  Help (A). *Automatable* (structural DOM-position assertion across the relevant screens).
- **[T2] D4 — Any value the user has already entered in one step of a wager/entry flow (amount,
  destination) is auto-populated or offered for one-tap re-selection in a later step of the same
  flow, rather than requiring re-entry — except where the re-entry is a genuine security step.** —
  WCAG 3.3.7 Redundant Entry (A). *Automatable* (scripted multi-step flow assertion that a
  previously-entered value appears pre-filled or selectable in the next step).
- **[T2] D5 — Any in-app authentication/confirmation step (PIN, confirmation phrase) offers a
  method that does not rely on a cognitive function test (e.g. remembering/transcribing an
  arbitrary string) without an alternative also being available.** — WCAG 3.3.8 Accessible
  Authentication Minimum (AA). *Manual only* (design review of any such step before it ships; flag
  for automated coverage only once a concrete flow exists).

### Tier 3 — degrades the experience but does not exclude

- **[T3] C4 — A colour-vision-deficiency-labelled board theme (built on the Okabe–Ito 8-colour
  palette principles: no red-green-only distinctions, redundant non-colour coding retained even
  within this theme) is offered as a discoverable, named setting.** — extends 1.4.1's intent
  beyond its literal minimum; neither reference product ships this (`accessibility.md` §1/§3).
  *Automatable for the palette itself* (assert the theme's colour set against a
  protanopia/deuteranopia simulation, e.g. programmatically applying a CBD transform matrix and
  checking the highlight states remain distinguishable) *and manual* (a human check with an actual
  colour-vision-deficiency simulator, e.g. a Coblis-style tool, before shipping the theme).
- **[T3] C5 — At least one alternate, non-SAN pronunciation/notation style (phonetic file letters,
  e.g. Anna/NATO-style) is offered alongside plain algebraic notation for move announcements.** —
  no WCAG number; usability finding from `accessibility.md` §1/§4 (b/d/p/t confusion at TTS
  speed). *Manual only* (design/content review; not a binary pass/fail an automated script can
  assert beyond "the setting exists and changes the announced string").
- **[T3] F4 — Any two accessibility- or difficulty-related features with similar names or
  adjacent toggles (e.g. a future "focus mode" vs. any visually-hiding "practice/hidden-pieces"
  toggle) are checked against user-confusion risk before shipping, and any toggle that can hide
  information from a sighted user who enabled it by mistake carries a visible, undismissable-until-
  acknowledged warning.** — derived directly from Lichess's blind-mode/blindfold-mode collision
  (`accessibility.md` §1/§3, #19691). *Manual only* (naming/IA review checklist item at design
  time, not a runtime assertion).
- **[T3] G1 — The full keyboard/screen-reader move-input flow is separately verified on a real
  mobile device with a real mobile screen reader (VoiceOver on iOS, TalkBack on Android) inside
  the actual Nimiq Pay WebView, not only inside a desktop browser or a generic mobile browser
  tab.** — derived from Lichess's own late-discovered mobile-specific NVUI bugs
  (`accessibility.md` §1/§3, #17019, #20160) and from `mobile.md` §7's own WebView-vs-browser
  safe-area warning. *Manual only* (real-device pass, required before any release, not
  automatable from a desktop CI runner).
- **[T3] G2 — The documented touch-exploration model (explore-by-drag to hear square/piece,
  double-tap to select, explore-then-double-tap to move, double-tap-again to promote to queen with
  an explore-below path to other promotion pieces) is implemented and matches the platform screen
  reader's own touch-exploration gesture rather than requiring a custom gesture the OS
  screen-reader would otherwise intercept.** — derived from Lichess's documented touchscreen model
  (`accessibility.md` §1). *Manual only* (real-device VoiceOver/TalkBack pass).
- **[T3] G3 — Any accessibility-mode toggle button is sized and placed so it does not fall within
  a frequent, low-stakes control's touch-target-collision zone on the smallest supported
  viewport.** — derived from Lichess's #20160 (disable-blind-mode button reported too big/
  colliding on touchscreens). *Automatable* (bounding-box collision check against the project's
  touch-target-collision review already required by `board.md` §5 for resign/confirm controls).
- **[T3] H1 — Every row in this checklist that is marked automatable runs on every release
  (CI-gated), not only at initial build time.** — no WCAG number; process requirement derived
  directly from Lichess's own #17791 regression (core NVDA commands broke silently for about a
  day). *This row's own pass condition*: CI configuration exists and actually blocks/flags a
  release on failure of any automatable row above.
- **[T3] H2 — Every row in this checklist that is marked manual-only has a named owner and a
  required cadence (e.g. every release that touches the board/game screens, at minimum before
  every milestone submission), tracked outside this document.** — process requirement, same
  rationale as H1. *Manual-process check, not a runtime assertion.*
- **[T3] I1 — The product publishes its own accessibility support in-product or in its listing
  text (what is supported, how to enable it), rather than leaving it undiscoverable the way
  Chess.com's public surface was found to be in this research pass (`accessibility.md` §1).** — no
  WCAG number; documentation-completeness item. *Manual only* (content/copy review).

## 7. What could break

- **A row marked "automatable" that is only ever run manually, once, at build time** silently
  degrades to a manual-only row without anyone updating its tier — the H1 process row exists
  specifically to catch this drift; if H1 itself is not enforced, every other "automatable" label
  in this file is aspirational rather than actual.
- **Screen-reader/browser combinations not covered by the manual test matrix** — Lichess's #20435
  is specifically an Orca-on-Fedora bug that may not reproduce on NVDA/JAWS/VoiceOver; a manual
  pass on only one screen reader per platform (as row A1 specifies as the floor) can still miss a
  real defect on a less-common but real combination. Treat A1's "at least one per platform" as a
  floor to exceed opportunistically, not a ceiling.
- **A DOM-attribute-presence proxy check quietly replacing the real manual test** for row A1/A2 —
  because the automated proxy is cheap to run on every CI build and the real manual test is not,
  there is a real risk the team starts trusting the proxy as sufficient over time; the row's own
  text is written to forbid this explicitly, but it needs a process safeguard (H2-style ownership)
  to actually hold.
- **Contrast/target-size measurements taken against design mockups instead of rendered, real
  device output** — CSS px measurement must come from the actual rendered DOM at the actual
  device pixel ratio inside the real WebView, not from a design tool's stated values, which can
  drift from what ships.
- **A colourblind-theme simulation check that only validates the palette in isolation**, without
  re-running the "no colour-alone" (C1) and contrast (C2) rows against that theme specifically —
  a new theme is a new set of colour pairs that must re-clear every colour-dependent row in this
  file, not just its own dedicated C4 row.
- **Tier ordering used to justify skipping lower tiers indefinitely** — the tier system orders
  what ships *first* when time is constrained; it is not licence to treat Tier 3 rows as
  optional forever. Per this project's own standing instruction ("leave nothing broken — fix all
  of it, the proper way"), every row in this file is required before the accessible board is
  considered complete, not only the Tier 1 rows.

## 8. What we can uniquely do because of Nimiq

- **A fixed, single, known WebView viewport class removes the device-matrix excuse** that let
  Lichess's mobile-specific NVUI bugs (G1's citation) go undiscovered until well after the desktop
  mode shipped — this project's G1/G2 real-device passes are against one bounded environment, not
  an open-ended "whatever mobile browser someone happens to use."
- **Real settled money on the resign/forfeit action makes D1/D2 non-negotiable in a way neither
  reference product's own resign action is** — this is the single row this checklist ranks
  strictly higher in practice than either Lichess or Chess.com currently treats their own
  equivalent, and it is a direct, structural product-level consequence of building on Nimiq's
  payment rails rather than a stakes-free game.
- **A server-authoritative, payment-backed move log** (`accessibility.md` §8) gives every
  automated row in this checklist a reliable source of truth to assert against — a test can
  compare the announced/rendered state to the same backend record that settles funds, rather than
  only to the client's own possibly-stale state, closing exactly the kind of visual/announced-
  state drift Lichess's #20435 exhibits.

## 9. Licence and reuse verdict

No new licence question beyond `accessibility.md` §9: every WCAG/ARIA citation in this file is
freely citable published standard text; every Lichess-sourced fact (the `sanWriter.ts` mechanism
underlying row A5, the confirmed `reducedMotion()` gap underlying row E1, the GitHub issue numbers
cited throughout §3) is reference-only under lila's AGPL-3.0 licence — this checklist's own
pass/fail conditions and row text are original, clean-room specification, not copied code or
copied prose, and must stay that way when implemented.
