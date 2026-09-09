# Accessible chess — the standard, and what beats the large platforms

Scope: non-visual and motor-accessible play (screen readers, keyboard-only, switch/motor
impairment, low vision, colour-blindness, vestibular/motion sensitivity). Complements `board.md`
(interaction mechanics) and `mobile.md` (touch ergonomics); does not repeat their finding that
**chessground ships zero ARIA** and **cm-chessboard's Accessibility extension is the only one of
the two reference libraries with a real screen-reader implementation**. This file starts from
that gap and asks: what does the actual published standard require, what pattern does a
chessboard need to follow, and what do blind/low-vision players say actually works.

## 1. What they do

**WCAG 2.2** (W3C Recommendation, fetched directly from `https://www.w3.org/TR/WCAG22/` and the
per-criterion "Understanding" pages, 2026-09-08). The criteria that bite hardest for a chess board
and a mobile game UI:

- **2.5.7 Dragging Movements — Level AA.** Exact text: *"All functionality that uses a dragging
  movement for operation can be achieved by a single pointer without dragging, unless dragging is
  essential or the functionality is determined by the user agent and not modified by the
  author."* (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). Intent: some
  users (head pointers, eye-gaze systems, tremor) cannot perform precise drags. The Understanding
  page's own worked examples are directly on-point for a board: a sortable list gets up/down
  buttons after tap; a Kanban board that supports drag-drop also offers a pop-up menu after
  tap/click as the single-pointer equivalent. **This is a direct requirement, not a
  nice-to-have**: chessground and cm-chessboard's drag input is not WCAG-conformant on its own —
  conformance is only achieved because both ship tap-tap (click-click) as a parallel, non-dragging
  path. A board that only supported dragging would fail 2.5.7 outright.
- **2.5.8 Target Size (Minimum) — Level AA.** Exact text: *"The size of the target for pointer
  inputs is at least 24 by 24 CSS pixels in size, except where: a larger target or spacing is
  otherwise required by this document; or the target is inline in a sentence or block of
  text"* (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — plus exceptions
  for spacing (an undersized target may pass if a 24px-diameter circle centred on it doesn't
  intersect any other target), equivalent controls, user-agent-controlled targets, and
  "essential" presentations (e.g. dense map pins). **2.5.5 Target Size (Enhanced) — Level AAA**
  raises this to *"at least 44 by 44 CSS pixels"*
  (https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) — the same number
  `board.md` §5 already cites from Apple HIG/Material as the promotion-picker fix; 44×44 is not
  just platform guidance, it is the literal text of a WCAG AAA success criterion.
- **2.4.11 Focus Not Obscured (Minimum) — Level AA.** *"When a user interface component receives
  keyboard focus, the component is not entirely hidden due to author-created content."*
  **2.4.12 Focus Not Obscured (Enhanced) — Level AAA.** *"...no part of the component is hidden by
  author-created content."* **2.4.13 Focus Appearance — Level AAA.** The focus indicator must be
  *"at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component or
  sub-component, and has a contrast ratio of at least 3:1 between the same pixels in the focused
  and unfocused states"* (all three: https://www.w3.org/TR/WCAG22/, cross-checked against the
  per-SC Understanding pages). **2.4.7 Focus Visible — Level AA** is the pre-2.2 baseline both of
  these sharpen: *"Any keyboard operable user interface has a mode of operation where the keyboard
  focus indicator is visible"* (https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).
  For a board where a 64-cell grid gets keyboard focus one square at a time, a sticky header/clock
  bar or a bottom-sheet promotion picker overlapping the focused square is a real, easy way to
  fail 2.4.11.
- **3.2.6 Consistent Help — Level A.** *"If a web page contains any of the following help
  mechanisms, and those mechanisms are repeated on multiple web pages within a set of web pages,
  they occur in the same order relative to other page content, unless a change is initiated by the
  user"* (https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html). Four recognised help
  mechanisms: human contact details, a human contact mechanism (chat/messaging), self-help
  (FAQ/"how do I"), and a fully automated contact mechanism (chatbot). Applies to any rules/help
  affordance the app carries across screens (lobby, in-game, results).
- **3.3.7 Redundant Entry — Level A.** *"Information previously entered by or provided to the user
  that is required to be entered again in the same process is either: auto-populated, or available
  for the user to select"* (https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html),
  with exceptions for security re-entry or genuinely invalidated data. Directly relevant to any
  multi-step wager/entry flow (amount, wallet address) that this product's own spec routes through
  more than one screen.
- **3.3.8 Accessible Authentication (Minimum) — Level AA.** *"A method exists that does not rely
  on cognitive function tests for logging in or submitting forms, unless an alternative or
  additional method is available."* **3.3.9 Accessible Authentication (Enhanced) — Level AAA**
  tightens "cognitive function tests" to also exclude transcription (both:
  https://www.w3.org/TR/WCAG22/). Relevant to any wallet-connect/PIN/seed-adjacent step the app
  ever surfaces directly (most of this should be delegated to the Nimiq Pay wallet chrome, which
  is out of this app's own conformance boundary, but any in-app confirmation step is not).
- Supporting criteria used throughout this file: **1.4.1 Use of Color — Level A** (*"Color is not
  used as the only visual means of conveying information, indicating an action, prompting a
  response, or distinguishing a visual element,"*
  https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html); **1.4.11 Non-text Contrast —
  Level AA** (*"The visual presentation of the following have a contrast ratio of at least 3:1
  against adjacent color(s): User Interface Components [and] Graphical Objects,"*
  https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html — this is the criterion that
  actually governs a selected-square highlight, a legal-move dot, or a focus ring, as distinct from
  1.4.3's text-only 4.5:1); **1.4.3 Contrast (Minimum) — Level AA** (text ≥4.5:1, large text
  ≥3:1, https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html — this is what the
  project's existing 156-contrast-pair audit already targets); **2.3.3 Animation from
  Interactions — Level AAA** (*"Motion animation triggered by interaction can be disabled, unless
  the animation is essential,"*
  https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html, whose own
  sufficient techniques explicitly name `prefers-reduced-motion`); **2.1.1 Keyboard — Level A**
  (*"All functionality of the content is operable through a keyboard interface...,"*
  https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html); **4.1.2 Name, Role, Value — Level
  A** (*"For all user interface components... the name and role can be programmatically
  determined; states, properties, and values that can be set by the user can be programmatically
  set; and notification of changes... is available to... assistive technologies,"*
  https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html — this is the criterion a bare
  `<div>`-based board with no roles/labels fails outright).

**ARIA Authoring Practices Guide** (fetched directly from `https://www.w3.org/WAI/ARIA/apg/` and
its pattern pages, 2026-09-08):

- The APG catalogues 30 patterns (Accordion, Alert, Alert/Message Dialog, Breadcrumb, Button,
  Carousel, Checkbox, Combobox, Dialog Modal, Disclosure, Feed, **Grid**, Landmarks, Link,
  Listbox, Menu/Menubar, Menu Button, Meter, Radio Group, Slider, Slider Multi-Thumb, Spinbutton,
  Switch, **Table**, Tabs, Toolbar, Tooltip, Tree View, Treegrid, Window Splitter). **There is no
  "board" or "game" pattern** — the closest documented fit for an 8×8 grid of interactive,
  simultaneously-data-bearing-and-actionable cells is the **Grid pattern**
  (https://www.w3.org/WAI/ARIA/apg/patterns/grid/), not Table (Table is for static/read-mostly
  tabular data with no per-cell interaction) and not a bare Application role (see below).
- Grid pattern roles: `grid` (container), `row`, `gridcell` (or `columnheader`/`rowheader` where a
  cell is a header). Keyboard interaction is precisely specified: arrow keys move focus one
  cell at a time; Home/End move to the first/last cell in the current row; Ctrl+Home/Ctrl+End move
  to the grid's first/last cell; Page Up/Page Down scroll by a "page" of rows; where selection is
  supported, Ctrl+Space/Shift+Space select a column/row, Ctrl+A selects all, Shift+Arrow extends
  selection; Enter or F2 enter an edit mode on an editable cell, Escape exits it. The worked Data
  Grid example (https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/) implements the pattern on
  a real `<table>` and explicitly states it uses **roving tabindex**, not `aria-activedescendant`,
  for focus management.
- **Roving tabindex vs `aria-activedescendant`**
  (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/): roving tabindex sets
  `tabindex="0"` on the one currently-active cell and `tabindex="-1"` on every other cell,
  updating both on every navigation keypress and calling `.focus()` on the new active cell — DOM
  focus genuinely moves, and the browser auto-scrolls the focused element into view for free.
  `aria-activedescendant` instead keeps DOM focus permanently on the grid container
  (`tabindex="0"`) and points an `aria-activedescendant="id"` attribute at whichever cell is
  "virtually" focused; the referenced cell must be a DOM descendant (or reachable via
  `aria-owns`/`aria-controls`). The APG's own worked examples for Grid use roving tabindex, and it
  is the better fit for a 64-cell board specifically because of the free auto-scroll-into-view
  behaviour when the board itself scrolls (e.g. a zoomed mobile viewport).
- **The `application` role is a documented trap, not a default-safe choice**
  (https://www.w3.org/TR/wai-aria-1.2/#application): it is defined for *"a structure containing
  one or more focusable elements requiring user input... that do not follow a standard interaction
  pattern supported by a widget role,"* and the spec is explicit that assistive technologies
  *"provide special modes of interaction for regions marked with role `application`"* — i.e. it
  switches the screen reader out of its normal document/browse reading mode. cm-chessboard's
  Accessibility extension uses `role="application"` on the SVG board (confirmed in `board.md` §1);
  that is defensible for an SVG-rendered board with no real DOM cell structure underneath, but it
  is **not** the APG-recommended pattern for a board that can instead be built as a real Grid — an
  `application`-rolled board forfeits the screen reader's own navigation commands (headings lists,
  "read next", find-in-page) inside that region, which the Grid pattern does not.

**Screen-reader chess in practice — Lichess** (fetched in full from
`https://lichess.org/page/blind-mode-tutorial`, 2026-09-08): Lichess's **Blind Mode** is a
dedicated, comprehensively documented, second UI (not a CSS/ARIA layer bolted onto the sighted
one) with:
- A **Browse/Focus mode split** matching how screen readers themselves work (NVDA+Space,
  Insert+Z/JAWS, or the VoiceOver QuickNav toggle switch between reading page content and sending
  keystrokes to a focused control) — the tutorial explicitly teaches users which mode to be in for
  which task.
- **Two independent move-input channels that are always both live**: a typed **Command Input
  Field** taking real algebraic notation (`e4`, `Nf3`, `O-O`, `exd5`, `a8=R`), and **direct board
  navigation** — arrow keys move a virtual cursor across the 8×8 grid, spacebar selects a piece,
  a second navigation-plus-spacebar completes the move. These are not alternatives a user picks
  once; both are reachable from either mode via the `i` (jump to input) and `b`/`board [square]`
  (jump to board) commands.
- **Five configurable notation/pronunciation styles**, independently switchable per-account: Anna
  ("knight takes filex3" — Anna/Bella/Caesar-style phonetic file letters), NATO ("knight takes
  foxtrot3"), Literate ("knight takes f6"), SAN ("Nxf3"), UCI ("g1f3") — plus independent settings
  for piece style (letter / white-uppercase-letter / name / white-uppercase-name), colour prefix
  (letter / name / none), and position-announcement order (square-before-piece,
  piece-before-square, or piece-only).
- **Automatic game-event announcements** (colour, casual/rated, time control, opponent) plus
  **on-demand single-letter commands** while the board has focus: `c`/clock reads both clocks,
  `l`/last re-announces the last move, `o` announces the opponent, `m` announces all legal moves
  for the selected piece, Shift+M for captures only, `f` flips the board, `k q r b n p` jump
  between piece types, `1`–`8` jump to a rank, Shift+1–8 jump to a file, `x` reads a diagonal ray,
  Alt+X reads the file/rank rays through the focused square. Command-input equivalents:
  `P [piece]` lists every location of a piece type, `s [rank/file]` reads a whole row/column,
  `abort`/`resign`/`draw`/`takeback` fire those actions directly by typed command.
- A documented **touchscreen model for mobile screen readers** distinct from the desktop keyboard
  model: *explore* (drag a finger across the board to hear square/piece names, matching
  VoiceOver's/TalkBack's own touch-exploration gesture), *select* (double-tap a square with a
  piece), *move* (explore to the destination, double-tap again), *promote* (double-tap a second
  time for queen; explore below the promotion square for the other pieces).
- A documented **quirk that is itself an accessibility lesson**: *"If the text output from Lichess
  is exactly the same as the previous message, it may not be read aloud again"* — screen readers
  routinely suppress a repeated identical `aria-live` announcement, so a UI that re-announces the
  same string (e.g. "your turn" twice in a row) can go silent exactly when the user most needs
  confirmation; the tutorial's own documented workaround is to issue a different command first.
- Real, current, in-progress GitHub issues from actual blind/screen-reader users on
  `lichess-org/lila` (fetched via `gh api search/issues`, 2026-09-08 — the highest-signal source
  in this file, because these are bug reports and feature requests from the people who actually
  depend on this mode daily, not marketing copy):
  - **#20435, "Orca screen reader does not announce move when your opponent moves"** — a Fedora/
    Orca user reports the opponent's move is silent even though the DOM correctly carries
    `<p class="lastMove" aria-live="assertive" aria-atomic="true">bishop f 4&nbsp;</p>`; a second
    user confirms *"When you stay in the Command input form, the opponent moves are not spoken.
    When you have the board focused the moves are sometimes spoken, but are not spoken on
    occasion"* — i.e. **a correctly-coded `aria-live="assertive"` region is not sufficient in
    practice**; announcement reliability depends on which element currently holds focus and on the
    specific screen reader/browser pairing (https://github.com/lichess-org/lila/issues/20435).
  - **#19691, "Blindfold toggle is a sour spot"** — a real, shipped confusion between two
    *differently-named, differently-audienced* features: "blind mode" (for visually-impaired
    users) and "blindfold mode" (a difficulty toggle for sighted users that hides the pieces from
    themselves). A maintainer writes *"Blind mode and zen mode can be triggered by mistake and
    need a visual feedback [warning]. Blind fold has no shortcut and cannot be toggled by
    mistake"* — i.e. the team had to retrofit a warning banner because two features with similar
    names but opposite audiences were being confused
    (https://github.com/lichess-org/lila/issues/19691).
  - **#17434, "Add confirmation dialog for Resign, Offer Draw, and Takeback in NVUI"** — a real
    user-filed request, still open at time of research: *"in NVUI..., when a user clicks on
    critical buttons like Resign, Offer Draw, Request Takeback... the action is executed
    immediately without any confirmation... It's easy to accidentally activate a nearby button
    while navigating or issuing commands"* (https://github.com/lichess-org/lila/issues/17434) —
    this is the exact same class of failure `board.md`/`mobile.md` document for Chess.com's sighted
    resign-button-adjacency bug, independently rediscovered in the non-visual UI, years after
    Chess.com's sighted version was reported.
  - **#17791, "NVDA no longer announces keys L, C, O, P, and S – core functionality broken since
    ~1 day"** — a regression report showing the mode's core commands can silently break for an
    entire screen reader with a routine deploy, with no equivalent sighted-user-facing signal that
    anything changed (https://github.com/lichess-org/lila/issues/17791).
  - **#17019, "Improve Mobile Blind Mode Accessibility: Full-Screen Board Navigation Needed"** and
    **#20160, "nvui - disable blind mode button too big for touchscreens"** — mobile-specific
    accessibility bugs distinct from the desktop-keyboard-tuned core of the mode, confirming that
    "we have a blind mode" and "our blind mode works well on a phone" are two different, separately
    verified claims (https://github.com/lichess-org/lila/issues/17019,
    https://github.com/lichess-org/lila/issues/20160).
  - The sheer count of open/recent NVUI issues (30+ returned by a single `blind` search, spanning
    translation gaps, missing features in Learn/Puzzle/Study/Analysis relative to the main game
    UI, non-English-keyboard-layout shortcut breakage — #17579) is itself a finding: **a
    second, parallel UI surface for accessibility is expensive to keep at feature-parity forever**,
    not a one-time build cost.

**Screen-reader chess in practice — Chess.com**: Chess.com's own iOS App Store listing (fetched
from `https://apps.apple.com/us/app/chess-play-learn/id329218549`, 2026-09-08) declares exactly
two Apple-recognised accessibility features: *"Navigate and explore the app using gestures,
braille, and speech output"* (VoiceOver) and *"Increase the text size in the app to 200% or
more"* (Larger Text). **No dedicated accessibility documentation page, blind-mode tutorial, or
public accessibility statement equivalent to Lichess's was found** after checking Chess.com's own
help-center homepage (`support.chess.com` — its full visible category list is Learn, Billing,
Community, Gameplay, Account, Troubleshooting, Mobile, Sportsmanship, Safety, Variants, Courses;
no Accessibility category appears in it), multiple targeted Bing queries (`chess.com accessibility
screen reader blind mode`, `site:chess.com accessibility`, `site:support.chess.com accessibility
OR "screen reader" OR "colorblind"`), and a guessed-URL sweep of the likely help-article slugs
(all 404). **This is a documented absence of what was searched, not proof that no feature exists
anywhere in the live product** — the searches available in this pass (Bing via WebFetch, GitHub
code/issue search, App Store listings) do not reach Chess.com's in-app settings menus, which are
gated behind an account/session; **NOT VERIFIED beyond what these checked, public sources show**.

**Colour-blindness and board themes**: the canonical published guidance is Masataka Okabe & Kei
Ito's **Color Universal Design** page (fetched directly, `https://jfly.uni-koeln.de/color/`,
2026-09-08), source of the widely-cited 8-colour "Okabe–Ito" palette (black, orange, sky blue,
bluish green, yellow, blue, vermilion, reddish purple) built specifically to remain distinguishable
under protanopia and deuteranopia. Its stated principles: choose colour schemes identifiable under
all common types of colour vision and real lighting conditions; **never encode information in
colour alone — pair it with shape, position, line style, or a label**; maximise
brightness/saturation contrast between figure and ground; make coloured elements thick/large
rather than thin/small; label elements directly rather than relying on a separate colour-coded
key. Checked directly against `lichess-org/lila`'s own source (`gh api search/code`, 2026-09-08):
**zero hits for "colorblind", "color blind", "protanopia", or "deuteranopia"** anywhere in the
repository, and the actual board-theme image set
(`public/images/board/`) is named entirely by material/finish — `blue`, `blue-marble`, `brown`,
`green-plastic`, `grey`, `canvas2`, `leather`, `maple`, `marble`, `metal`, `horsey`, `ic` — with
**no theme labelled for colour-vision deficiency**. Chess.com's board-theme naming could not be
verified from public sources in this pass (same search-exhaustion note as above) —
**NOT VERIFIED**.

**`prefers-reduced-motion` and reduced motion in practice**: the CSS media feature
(https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) takes two values,
`no-preference` and `reduce`, reflecting an OS-level accessibility setting; MDN's own guidance
names scaling and panning animation as the categories to tone down, citing **vestibular motion
disorders** (dizziness, nausea, disorientation) as the harm being prevented. WCAG's own **2.3.3
Animation from Interactions (AAA)** names `prefers-reduced-motion` directly as a sufficient
technique for disabling interaction-triggered motion
(https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). Checked directly
against `lichess-org/lila`'s source: the codebase **does** define a `reducedMotion()` utility
(`ui/lib/src/device.ts`: `export const reducedMotion: () => boolean = memoize(() =>
window.matchMedia('(prefers-reduced-motion: reduce)').matches)`), but a repo-wide usage search
(`gh api search/code?q=reducedMotion+repo:lichess-org/lila`) shows it is **consumed in exactly one
place: `ui/bits/src/bits.confetti.ts`** (the win-celebration confetti animation) — **not** in the
board's own piece-movement animation, which is instead a manual per-account "Animation: None"
preference the community itself recommends toggling for premove chains (see `mobile.md` §1). **The
gap `board.md` §6 flagged as "NOT VERIFIED against chessground/cm-chessboard source, neither
documents reduced-motion support" is now confirmed as a real, current gap in the reference
product's own board animation too, not just in the two rendering libraries.**

## 2. Why it works

- The Grid pattern (not Table, not bare Application) is right for a chessboard specifically
  because a chess square is simultaneously **data** (what occupies it) and a **widget** (a place
  you can act) — the APG's own Grid definition covers exactly this dual nature ("tabular
  information" and "organizing interactive elements" in one pattern), while Table has no
  interaction model and a bare Application role throws away the screen reader's own navigation
  commands for no structural benefit a real Grid doesn't already provide.
- Roving tabindex earns its recommendation for a board specifically through the free
  auto-scroll-into-view side effect of genuine DOM focus movement — on a board that can be
  larger than the viewport (zoomed text, a small phone, a system font-size bump), that's the
  difference between focus silently leaving the visible area and the browser keeping the focused
  square on-screen with zero custom scroll-management code.
- Lichess's Browse/Focus-mode split works because it mirrors the mental model screen-reader users
  already have from every other complex web app they use daily — it does not invent a new
  interaction paradigm just for chess, it maps onto one they've already internalised.
- Two always-live input channels (typed notation and board-cursor navigation) work because they
  serve two different real skill levels and moments: a strong player who already thinks in
  algebraic notation can type `Nf3` faster than any cursor-navigation sequence; a player still
  building a mental board model benefits from physically traversing ranks/files with arrow keys.
  Forcing either group into the other's channel would be a real usability regression for whichever
  group lost their preferred mode.
- Five swappable pronunciation styles work because "the same information, spoken differently" is
  not a cosmetic choice for TTS — Anna/NATO-style phonetic file letters exist because "b" and "d"
  and "p" and "t" are genuinely easy to mishear at TTS speed or over a bad connection, and a
  player who has trained their ear on one scheme for months has a real switching cost if forced
  onto another.
- The Okabe–Ito principle "never colour alone" works for the same underlying reason WCAG 1.4.1
  codifies it: colour perception is not binary present/absent, it is a spectrum of deficiency
  types (protanopia, deuteranopia, tritanopia) each of which breaks a *different* pair of hues, so
  no single "colourblind-safe" hue choice protects everyone — only redundant coding (shape,
  label, pattern) is deficiency-type-agnostic.
- `prefers-reduced-motion` works as a mechanism because it is a single OS-level signal a user sets
  once and every well-behaved site then respects, rather than requiring every vestibular-disorder
  user to hunt down and set a "disable animations" toggle inside every individual product they
  use — which is exactly the failure mode Lichess's own confetti-only wiring falls into for
  everything except confetti.

## 3. What they do badly

- **A correctly-coded `aria-live="assertive"` region is not sufficient in practice** — Lichess's
  own #20435 shows real screen-reader/browser combinations (Orca on Fedora, in this report) simply
  not speaking a technically-correct live-region update, with reliability depending on which
  element currently holds focus. Shipping the markup is necessary but not sufficient; it needs
  real-device, real-screen-reader verification, not just a DOM-inspector check.
- **Two similarly-named, oppositely-audienced features caused real user confusion** — "blind
  mode" (for blind/low-vision players) vs. "blindfold mode" (a self-imposed difficulty toggle for
  sighted players) collided badly enough (#19691) that the team had to retrofit a warning banner,
  and even then a user reported the fix didn't fully land ("I've kept playing games and the
  warning still seems to be in red"). Naming two features this close together, for two audiences
  this different, is a foreseeable trap.
- **The exact resign/draw/takeback-adjacency safety bug `board.md`/`mobile.md` document for
  Chess.com's sighted UI exists independently in Lichess's own non-visual UI** (#17434, still open
  at research time) — years after the sighted-UI version was first reported on Chess.com. The two
  products did not learn the lesson from each other, and neither team applied a fix to the
  non-visual surface just because the sighted surface had already been criticised for the same
  class of bug.
- **Core accessibility commands can regress silently** — #17791 shows a full set of NVUI keyboard
  commands broke for NVDA users specifically, for about a day, with no sighted-user-facing signal
  that anything had changed; a second UI surface built once and left unmonitored is exactly the
  kind of code path a general regression-test suite tuned for the sighted UI will not catch.
- **"Works on desktop" and "works on mobile" are not the same claim for accessibility either** —
  #17019 and #20160 are mobile-specific NVUI bugs (full-screen board navigation, an
  oversized disable-button hitting adjacent touch targets) filed well after the desktop mode was
  mature, showing the same "second surface, second maintenance burden" pattern extends to
  "second viewport, third maintenance burden."
- **Neither reference product's own accessible board animation respects the one CSS mechanism
  built for exactly this purpose** — Lichess's `reducedMotion()` utility exists and is correctly
  implemented, but is wired to confetti only, not to the piece-movement animation a
  vestibular-disorder user would actually want reduced during normal play.
- **Chess.com's accessibility surface is, per what was actually checked (see §1), essentially
  undocumented beyond two App-Store-declared iOS features** — no equivalent of Lichess's dedicated
  tutorial page, notation-style options, or command-input channel was found; if a comparable
  system exists it is not discoverable through the public channels checked in this pass.
- **Neither reference product ships an explicitly colour-vision-deficiency-labelled board theme**
  — verified directly against lila's source (zero code hits for the relevant terms) and its
  theme-image naming (all material/finish names, none accessibility-labelled).

## 4. What we should copy conceptually

- The **Grid pattern with roving tabindex** as the board's actual ARIA shape — not Table (no
  interaction model), not a bare Application role (throws away the screen reader's own navigation
  commands for no benefit a real DOM structure doesn't already give).
- **Two always-live input channels** (typed algebraic-notation command field, and cursor-style
  board navigation) rather than picking one — they serve genuinely different players, not a
  primary-and-fallback pair.
- **Configurable move-announcement phrasing**, at minimum a phonetic-file-letter option
  (Anna/NATO-style) alongside plain SAN — b/d/p/t confusion at TTS speed is a real, solvable
  problem, not a hypothetical one.
- **Character-by-character SAN-to-words expansion with TTS-mispronunciation patches** — read
  directly from lila's own shipped source
  (`ui/lib/src/game/sanWriter.ts`, `gh api` fetch, 2026-09-08): standard algebraic notation is
  walked character-by-character and each symbol is expanded to a spoken word (`x`→"takes",
  `+`→"check", `#`→"checkmate", `=`→"promotes to", `@`→"dropped on", `O-O`/`O-O-O`→"short/long
  castling", file letters a–h uppercased, digits 1–8 left alone, piece letters expanded via
  per-role translation) — and the resulting string then gets a second pass of **real,
  battle-tested TTS-mispronunciation fixes**: a leading "A" is quoted (`"A"`) because "A takes" and
  "A3" get mis-read as the indefinite article; a pattern like `1E5` is comma-inserted
  (`1,E5`) because some TTS engines read it as scientific notation; a capital `C` or `F`
  immediately after a digit is lower-cased because it gets read as "degrees celsius/fahrenheit"
  (e.g. `R8c3`); a capital `H` after a digit-space is closed up because it gets read as "hour."
  **These are not hypothetical edge cases — they are fixes present in Lichess's shipped code today
  for exactly the SAN vocabulary a chess app must speak**, and any move-announcement system this
  product builds will hit the same TTS quirks the first time it announces a move like `Ra1+` or
  `e8=Q#`.
- **A documented mobile screen-reader touch model** (explore-by-drag, double-tap-select,
  explore-then-double-tap-to-move, double-tap-to-promote-queen/explore-below-for-others) that maps
  onto VoiceOver's and TalkBack's own built-in touch-exploration gesture rather than inventing a
  custom one.
- **Redundant, never-colour-alone state coding** (Okabe–Ito's core principle) for every board
  highlight state: selected square, legal-destination dot, last-move, check, premove — each needs
  a non-colour signal (shape, label, pattern, or text) alongside its colour.
- **`prefers-reduced-motion` wired directly into the actual piece-movement/capture-fade animation
  path**, not just decorative animation — this is the one place both reference implementations
  fall short even where the underlying platform mechanism (`reducedMotion()`) already exists in
  their own codebase.

## 5. What we can do better

- **Build one accessible board, not a second parallel UI surface** — Lichess's NVUI is
  comprehensive but its own multi-year issue history (30+ open/recent issues spanning
  translation, feature-parity gaps in Learn/Puzzle/Study, mobile-specific bugs, non-English
  keyboard-layout breakage) shows a bolted-on second surface is a permanent, compounding
  maintenance tax. Given this project's board is being built from a clean-room specification
  anyway (per `board.md` §9's licensing verdict — chessground/cm-chessboard cannot be copied
  wholesale), the Grid-pattern DOM structure, ARIA labels, and live region can be the **one and
  only** rendering path from day one, with visual styling layered on top of accessible markup
  rather than accessible markup retrofitted onto a visual-only tree.
- **Verify `aria-live` announcements against real screen readers on real devices before shipping**,
  not just against a DOM inspector — Lichess's own #20435 proves correct markup and correct
  real-world announcement are two different claims that must be tested separately, and per-focus-
  target reliability (does the announcement fire when the board has focus vs. when the command
  field has focus) needs its own explicit test matrix entry.
- **Never let two visually- or conceptually-similar accessibility features share confusable
  names** — this product's own spec should audit every feature name pair (e.g. any future "focus
  mode" vs. "practice mode," any "hint" vs. "hidden pieces" toggle) against the exact failure
  Lichess had with blind-mode/blindfold-mode before shipping either.
- **Confirm every irreversible, money-adjacent action identically in every input mode** — the
  Lichess NVUI resign/draw/takeback confirmation gap (#17434) is not merely a UX nicety here: this
  product's resign/forfeit action can forfeit a real settled stake (`board.md` §5, `mobile.md`
  §5), so an accessible-mode player must get the *same* two-step, spatially-isolated,
  amount-stating confirmation a sighted player gets — not a lesser one, and not "we'll add it once
  someone reports losing money," which is the order Lichess's own history shows this bug actually
  gets fixed in.
- **Regression-test the accessible board on every release, automatically** — given this project
  already runs 472 automated browser checks including 156 contrast pairs, extend that harness
  (see `accessibility-checklist.md`) rather than relying on a human noticing a screen-reader
  command silently stopped working, which is exactly how Lichess's #17791 regression shipped.
- **Ship an explicit, Okabe–Ito-informed, colour-vision-deficiency board theme as a real, labelled
  option from launch** — neither reference product does this (verified absence in §1/§3), and it
  is a small, well-specified addition (8-colour palette, redundant non-colour coding already
  required by 1.4.1 regardless) relative to the rest of the board-theming work this project is
  already doing.
- **Wire `prefers-reduced-motion` into the actual piece-movement and capture-fade animation**, the
  one place Lichess's own otherwise-correct implementation of the mechanism doesn't reach.

## 6. What is technically required

The exhaustive, testable, WCAG-numbered version of this section is
`accessibility-checklist.md` — that file is the specification to extend the existing audit
script against. Summarised here, grouped by the same shape as `board.md` §6:

- A real Grid-pattern DOM (`role="grid"`/`row`/`gridcell`) with roving-tabindex keyboard
  navigation (arrows, Home/End, Ctrl+Home/End) as the board's actual accessibility tree — not a
  visual-only tree with ARIA sprinkled on after the fact.
- A single-pointer (tap-tap) move-completion path that requires no dragging at all (2.5.7),
  co-existing with drag as `board.md` already specifies.
- Every pointer target — square, promotion-picker option, resign/confirm control — at minimum
  24×24 CSS px (2.5.8), with 44×44 (2.5.5 AAA) as the actual target for anything money-adjacent.
- A visible, sufficiently large and contrasted focus indicator on the currently-focused square at
  all times during keyboard/screen-reader navigation, never obscured by other page content
  (2.4.7, 2.4.11, 2.4.13).
- An `aria-live` region carrying move results (piece, from-square, to-square, capture, check,
  checkmate, promotion, castling, whose turn is next), verified on real screen readers, not just
  markup-checked.
- A typed algebraic-notation command-input channel, live and reachable at all times, independent
  of the board-cursor channel.
- At least one non-SAN, phonetic-file-letter pronunciation option, and the TTS-mispronunciation
  character-level fixes documented in §4, applied to whatever notation the app speaks.
- A documented, tested mobile screen-reader touch-exploration model (VoiceOver/TalkBack rotor/
  swipe patterns), not just a desktop-keyboard-tuned mode assumed to also work on a phone.
- Every board highlight state (selected, legal-destination, last-move, check, premove) coded with
  a non-colour signal in addition to colour (1.4.1), and every such state's colours independently
  contrast-checked (1.4.11) in both light and dark themes, feeding the project's existing 156-pair
  audit rather than a separate one-off check.
- `prefers-reduced-motion: reduce` collapsing piece-movement/capture-fade animation duration
  toward zero, verified against the actual animation code path, not just a decorative element.
- Resign/forfeit (and any wager-cancelling action) requiring the same two-step, amount-stating,
  spatially-isolated confirmation in every input mode — keyboard, screen-reader, and touch alike.
- A colour-vision-deficiency-labelled board theme, built on Okabe–Ito principles, offered as a
  real, discoverable setting.

## 7. What could break

- **Markup that is correct but silent** — an `aria-live` region with the right attributes can
  still fail to announce on a real screen-reader/browser pairing (Lichess's own #20435); this must
  be caught by real-device testing, not a DOM snapshot diff.
- **Repeated-identical-announcement suppression** — if the app's live-region text is byte-identical
  to its previous value (e.g. re-announcing "your turn" after a no-op), many screen readers will
  not re-speak it; any UI path that can legitimately repeat the same announcement needs a
  deliberate cache-buster (a leading invisible counter character, or routing through a
  guaranteed-different intermediate string) or the user gets silence exactly when they need
  confirmation.
- **Focus loss on re-render** — a board that re-creates DOM nodes on every move (rather than
  patching in place) will drop keyboard/screen-reader focus off the board entirely on the
  mover's own move, forcing the user to re-navigate from scratch after every single move they
  make.
- **`aria-activedescendant`-vs-roving-tabindex inconsistency** if the implementation mixes
  patterns (e.g. roving tabindex on desktop, `aria-activedescendant` on mobile "to save DOM
  churn") — screen readers can behave differently under each, and mixing them within one
  component is explicitly the kind of inconsistency the APG's own guidance warns against.
- **`role="application"` creeping in** anywhere near the board (a wrapping container, a modal) can
  silently disable the screen reader's own navigation commands for that whole region, even if the
  grid itself is correctly built — this is an easy regression to introduce during later feature
  work (e.g. wrapping the board in a "game view" component) without anyone noticing until a
  screen-reader user reports it.
- **Hard-coded animation durations anywhere in the codebase** bypass `prefers-reduced-motion`
  entirely if the media query is only checked in one place (Lichess's own confetti-only wiring is
  the cautionary example) — every animation call site needs to route through the same
  reduced-motion-aware helper, not be individually responsible for checking the media query.
  
- **A colourblind theme that only swaps hues without adding redundant non-colour coding** does not
  actually fix anything — Okabe–Ito's own guidance is explicit that colour choice alone protects
  no one against every deficiency type; skipping the redundant-coding half of the fix while
  shipping the palette half is a false sense of having addressed 1.4.1.
- **A second, parallel "accessible mode" UI surface, if built instead of one unified accessible
  board**, inherits Lichess's own multi-year pattern of feature-parity drift (new features shipping
  to the sighted UI first, accessible UI second-or-never) — this is the single biggest structural
  risk this file identifies, and the reason §5's "build one board" recommendation is not
  optional-nice-to-have but the difference between a permanent maintenance liability and a
  one-time build cost.

## 8. What we can uniquely do because of Nimiq

- **A fixed, known WebView viewport (per project scope, ~390×844) removes the "does this also
  work on mobile" second-verification burden** that produced Lichess's own #17019/#20160 — this
  product tests one real device class for its accessible mode, not desktop-first with mobile
  playing catch-up years later.
- **The resign/forfeit confirmation gap Lichess is still fixing in its NVUI (#17434) is a design
  bug there; here it would be a real-money-loss bug**, because this product's resign action can
  forfeit an actual settled NIM/Arc-USDC stake. That reframes "add a confirmation dialog" from a
  UX-polish backlog item (its status on Lichess for years) into a launch-blocking requirement —
  giving this product a real, structural reason to get this right on day one where two mature,
  well-resourced products still have not.
- **No App Store accessibility declaration surface exists for a Mini App** — Chess.com gets a
  visible "Accessibility" section on its own App Store listing (VoiceOver, Larger Text) that
  functions as free, discoverable proof of what it supports; a Nimiq Mini App has no equivalent
  storefront listing. That cuts both ways: this product cannot lean on a platform-level badge to
  advertise its accessibility, but it also means the Mini App's own in-product surface (and any
  listing/description text Nimiq's Mini App directory renders) is the *only* place this claim can
  be made — an explicit reason to state accessibility support in-product rather than assume a
  store listing will carry it, since nothing here currently does.
- **A server-authoritative move log tied to the payment record** (`board.md` §8) also gives an
  accessible client a reliable, replayable source of truth for "what actually happened" — useful
  specifically for the class of bug in Lichess's own #20435, where the *visual* board state and
  the *announced* state can drift apart; this product can always re-derive and re-announce the
  authoritative state from the same backend that settles the money, rather than trusting a
  possibly-stale client-side render the way a purely client-authoritative board must.

## 9. Licence and reuse verdict

- **WCAG 2.2 and the ARIA Authoring Practices Guide are W3C Recommendations/Notes** — freely
  citable, freely implementable; there is no licence question in applying the criteria or pattern
  guidance quoted in this file to original code. The exact criterion numbers, levels, and quoted
  text above are taken directly from `https://www.w3.org/TR/WCAG22/`, the per-criterion
  Understanding pages, and `https://www.w3.org/WAI/ARIA/apg/` and its Grid pattern/keyboard-
  interface pages, all fetched 2026-09-08.
- **`lichess-org/lila` is licensed AGPL-3.0**, confirmed directly from the repository's own
  licence metadata (`gh api repos/lichess-org/lila`, 2026-09-08: `"license": {"spdx_id":
  "AGPL-3.0"}`). AGPL-3.0 is *more* restrictive than chessground's GPL-3.0-or-later verdict
  already recorded in `board.md` §9 — its network-use clause (§13) triggers on making the
  software available over a network at all, not only on distributing it. **Verdict: everything
  read from lila in this file — the blind-mode-tutorial page content, the NVUI source
  (`ui/lib/src/nvui/*`, `ui/lib/src/game/sanWriter.ts`, `ui/lib/src/device.ts`), the GitHub issue
  discussions — is reference-only.** The specific mechanisms described here (SAN-to-words
  character expansion, the TTS-mispronunciation regex fixes, the `reducedMotion()` utility shape,
  the Browse/Focus-mode command vocabulary) must be independently re-implemented from this
  specification, not ported or copied, exactly as `board.md` already requires for chessground.
  The tutorial page's prose and the GitHub issue text are quoted here under fair-use-scale
  citation for research/specification purposes, not reproduced as shipped product copy.
- **cm-chessboard's Accessibility extension is MIT** (licence verdict already established in
  `board.md` §9 for the whole library: *"License for the code: MIT"*). Its concrete accessibility
  patterns — SVG board with `role="application"`/`aria-label`, a live region, a parallel
  `<table>` representation, a from/to text-input move form, Braille-notation alt text, a
  jump-to-move-input keyboard shortcut — remain freely portable with attribution as good practice,
  **with the caveat this file adds**: prefer the Grid pattern over `role="application"` where a
  real DOM cell structure is being built anyway (§1), since `application` is the APG-documented
  trap cm-chessboard's SVG-based approach has a real structural reason to accept that a
  DOM-grid-based board does not.
- **`katietay/Knight-Owl-Chess`** (surfaced via `gh api search/repositories`, description:
  *"An accessible chess app built with Stockfish... screen reader support, colorblind modes, motor
  accessibility options, and adaptive difficulty"*) is GPL-3.0-licensed per its own repository
  metadata, **but the repository contains no source code** — `gh api
  repos/katietay/Knight-Owl-Chess/contents` returns only `LICENSE` and `README.md`, with
  `primaryLanguage: null`. **Verdict: not a usable reference.** Its description is an aspirational
  feature list, not a working, inspectable implementation; it is cited here only to record that it
  was found and checked, not as evidence any of its claimed features actually work or are worth
  studying further.
- Okabe & Ito's Color Universal Design guidance and the underlying published research on colour
  vision deficiency are factual/scientific findings, not licensed code or assets — freely citable
  and freely applicable as a design constraint in original theme work, the same status `mobile.md`
  §9 already gives Hoober's thumb-zone research.
- **Net recommendation**: build the accessible board's Grid-pattern markup, roving-tabindex
  keyboard handling, live-region announcement pipeline, and SAN-to-words/TTS-fix logic from this
  file's specification (clean-room, informed by lila's documented behaviour and source structure,
  copying no AGPL code), optionally lift small, self-contained accessibility-extension patterns
  from cm-chessboard under MIT with attribution, and treat Knight-Owl-Chess as an idea pointer
  only, never as a source of implementation.
