# Chess board interaction — the complete behaviour checklist

Scope: everything a hand-written board component must implement to reach parity with the
reference implementations (chessground, cm-chessboard) and the two major products (Lichess,
Chess.com). Every item is written as a testable requirement, not a description.

## 1. What they do

**Chessground** (`lichess-org/chessground`, v10.1.1, source read directly from
`README.md`, `src/config.ts`, `src/drag.ts`, `src/premove.ts`, `src/wrap.ts`,
2026-09-08 — https://github.com/lichess-org/chessground):

- [x] Dual input: move by click-click (tap-tap) OR drag-and-drop, both live simultaneously —
  `movable.events`/`selectable` vs `draggable.enabled` (`src/config.ts`).
- [x] Drag has a **minimum-distance threshold** before it visually activates:
  `draggable.distance` (default set in `state.ts`), checked as
  `distanceSq(cur.pos, cur.origPos) >= distance²` in `src/drag.ts`. Below the threshold, a
  touch/click that doesn't move is treated as a tap-select, not a drag — this is what stops a
  shaky finger from being read as an accidental drag.
- [x] `draggable.autoDistance`: sets the distance threshold to 0 automatically when the input
  device is touch (mobile) vs mouse, because touch already has enough imprecision that adding a
  deliberate drag threshold on top of it hurts more than it helps.
- [x] Ghost piece: a semi-transparent copy of the dragged piece stays on the origin square while
  a full-opacity piece follows the pointer (`draggable.showGhost`, positioned every frame via
  `requestAnimationFrame` in `src/drag.ts`).
- [x] Piece drop resolution: `touchend`/`mouseup` maps the final pointer position back to a
  board square; if it lands off the board, `draggable.deleteOnDropOff` decides whether the
  piece is deleted or snaps back.
- [x] Only single-touch drags are honoured — the code explicitly checks "support one finger
  touch only" (`src/drag.ts`) and validates `event.isTrusted` unless `trustAllEvents` is set.
- [x] Premove: user can input a full move while it is **not** their turn; it queues and fires
  automatically the instant the position updates in their favour (`premovable.enabled`).
- [x] Premove destination calculation is piece-specific and geometry-only (`src/premove.ts`):
  pawn (`pawnDirAdvance` — forward one/two, diagonal capture geometry, no capture-legality
  check since the target piece is unknown yet), knight/bishop/rook/queen (direction-vector
  functions), king (one square any direction) **plus castling**: king on file e, destination
  file c or g, corresponding rook present on file a/h, both on the home rank.
- [x] Premove castling supports both **king-two-squares** and **king-onto-rook** input styles
  via `movable.rookCastle`.
- [x] Premove is cancelled by: playing a different move, right-click (if the UI wires it, via
  `premovable.events.unset`), or calling `cancelPremove()`; chessground itself does not bind a
  default cancel key — the host app must call the unset event.
- [x] `predroppable` mirrors premove for drop-based variants (Crazyhouse): pre-selecting a
  pocket piece and a destination before it's legal to drop.
- [x] Animation: position diffs animate piece movement and fade-out of captured/removed pieces;
  `animation.duration` is configurable, 0 disables it entirely (used for premove chains where
  animation delay would cost time).
- [x] Board resize is fluid — chessground recomputes bounds and re-renders at any container
  size at any time, no fixed-pixel assumption (README: "Fluid layout: board can be resized at
  any time").
- [x] Coordinates: `coordinates` (rank/file labels on the board edge) and
  `coordinatesOnSquares` (labels printed inside every square, needed for accessibility/high
  zoom) are independent toggles; `ranksPosition` controls which side ranks render on.
- [x] Drawable shapes: circles, arrows, freehand shapes drawn with right-click-drag (or
  configured button); **arrows snap to the nearest valid destination square** while dragging,
  and a **freehand arrow** is drawn by dragging the pointer off the board edge and back
  on — this is how a user draws an arrow that isn't a legal move.
- [x] `drawable.autoShapes` lets the host app inject programmatic shapes (e.g. "best move"
  arrows from an engine) that render like user shapes but aren't erasable by a normal click.
- [x] `disableContextMenu` suppresses the native right-click menu so right-click can be
  repurposed for shape-drawing/premove-cancel.
- [x] Last-move highlight and check highlight are first-class, config-driven
  (`highlight.lastMove`, `highlight.check`, `check: Color|boolean`).
- [x] `viewOnly` mode locks all input while still rendering position/shapes (used for
  spectator/analysis-replay boards).
- [x] No bundled piece or board images — pure CSS-class-driven styling, so re-skinning is a
  stylesheet swap, not a code change.
- [x] Explicitly **no chess logic inside** — legality, check, mate, and all rules are the host
  app's job; chessground only renders and captures gestures. It will happily let you "move" a
  piece to a destination that isn't in `movable.dests` unless you configure `dests` to fence it
  in.
- [x] **No ARIA / screen-reader support of any kind** — confirmed by reading `src/wrap.ts` in
  full: no `role`, no `aria-*`, no `aria-live`. The one thing the README calls "accessibility"
  ("Display last move, check, move destinations, and premove destinations") is a **sighted
  visual affordance**, not assistive-tech support. Lichess's actual screen-reader board is a
  separate system built on top, not part of chessground.

**cm-chessboard** (`shaack/cm-chessboard`, v8.14.0, read directly from README and
`src/extensions/accessibility/Accessibility.js`, 2026-09-08 —
https://github.com/shaack/cm-chessboard):

- [x] Same dual input (click-click and drag), plus a documented **event-based validation
  pipeline**: `moveInputStarted` → `validateMoveInput` → `movingOverSquare` (hover feedback
  during drag) → `moveInputFinished`/`moveInputCanceled`. The host app validates every move by
  returning true/false from `validateMoveInput`, including deciding whether to animate a
  premove differently from a normal move.
- [x] Chess960/Freestyle castling input handled as a first-class case in the input validator,
  not bolted on.
- [x] `responsive: true` makes the board track its **container element's** size continuously
  (ResizeObserver-driven), not just the viewport — important for a board embedded in a
  variable-height card rather than filling the screen.
- [x] Extension architecture: Markers, Arrows, RightClickAnnotator (combines the two with mouse
  bindings), PromotionDialog, and **Accessibility** ship as separate, optional modules rather
  than being baked into the core — a smaller "just the board" bundle is possible by not
  importing extensions you don't need.
- [x] **Accessibility extension is a real, working screen-reader implementation** (not just a
  visual affordance): the SVG board gets `tabindex="0"`, `role="application"`, and a
  descriptive `aria-label`; a live region uses `aria-live="polite"`/`aria-atomic="true"` to
  announce square/piece focus and move results; a parallel `<table>` representation of the
  board and a from/to text-input move form exist as SR-only or visible alternates
  (`visuallyHidden` option); alt text can carry a Braille-compatible piece-position notation
  (`brailleNotationInAlt`); a documented keyboard shortcut (Shift+Option/Alt+E) jumps focus to
  the move-input field from anywhere on the page.
- [x] Animation duration is a plain config number (`moveAnimationMs`, default reported ~300ms;
  0 = instant) and animates via Promises, so the host can `await` a move's animation before
  starting the next one — directly useful for not double-queuing premove animations.

## 2. Why it works

- Dual input (click-click **and** drag) exists because neither is strictly better on touch:
  drag is the more "natural" gesture but is failure-prone with a fat thumb over small squares;
  tap-tap is more forgiving of touch-target imprecision because each tap is a discrete,
  correctable decision (tap wrong square → tap again to re-select) rather than a continuous
  gesture that has already committed once your finger lifts.
- The drag distance threshold exists specifically so a *tap* (finger down, finger up, no
  movement) is never misread as a *drag-to-empty-square*, which is the single most common
  source of "why did my piece disappear" complaints on touch boards.
- The ghost piece (origin square stays dimly occupied during drag) gives constant visual proof
  of what's being moved and from where — without it, a fast drag on a small screen leaves the
  user unsure whether the origin square is still "theirs" if they cancel.
- Premove exists because in fast time controls the network round-trip for the opponent's move
  plus render plus your own decision time is the dominant cost, not thinking time — premove
  removes the "wait for their move, then react" latency entirely for a move you already know
  you want to make regardless of their reply.
- Geometry-only premove destination calculation (ignoring capture legality, since the future
  board state is unknown) is a deliberate simplification: it can't perfectly validate a premove
  in advance, so it doesn't try — it fires the move for real legality-checking only once the
  position actually updates, and silently drops it if illegal. This is simpler and more
  correct than trying to predict opponent replies.
- Snapping arrows to legal destinations while freehand-off-board arrows remain possible
  resolves a real tension: most annotation *is* "this piece should go there" (best served by
  snapping, which also produces cleaner-looking arrows), but some annotation is conceptual
  ("this diagonal is weak") which needs freehand.
- Separating "code" from "extensions" (cm-chessboard) and "core" from "screen-reader layer"
  (both libraries) keeps the default bundle small for the 99% of users who are sighted mouse/
  touch players, while still making a real accessible mode possible for the few who need it.

## 3. What they do badly

- Chessground ships **zero** accessibility support in the piece you'd actually import — every
  chess app built on it (including Lichess's own web client) has to build a parallel
  screen-reader board from scratch. This is a known, cited pain point: a 3D-piece promotion
  hit-area bug (lichess-org/lila#13545 — https://github.com/lichess-org/lila/issues/13545)
  shows the promotion-square hit-testing is fragile even for sighted mouse users under some
  piece-set configurations, which is exactly the kind of edge case that compounds badly for
  anyone relying on assistive tech.
- Chessground's premove cancellation is **not self-contained** — there is no default keybinding
  or UI affordance in the library itself; every consuming app must wire its own cancel
  trigger (Lichess uses a UI element below the board, confirmed only indirectly via forum
  discussion, not verified against source in this pass — **NOT VERIFIED** exactly which UI
  element lila binds to `unset`).
- Resign-button-adjacent-to-navigation is a repeatedly reported Chess.com defect, not a library
  defect, but it's a board-adjacent interaction failure worth recording here: users report the
  "confirm resign" button sitting close enough to a "back" control that double-tapping back
  during review can trigger an accidental resignation
  (https://www.chess.com/forum/view/site-feedback/resigning-by-mistake-bad-site-design,
  https://www.chess.com/forum/view/general/i-accidently-hit-the-resign-button). This is an
  interaction-safety failure of the surrounding chrome, not the board component, but it sits
  directly next to the board in the touch-target sense and is exactly the class of bug this
  checklist exists to prevent.
- cm-chessboard's PromotionDialog is a separate opt-in extension, not core — a board built by
  copying only "the board" and skipping extension review will silently ship without a
  promotion UI at all until someone notices in testing.
- Neither library provides an authoritative, engine-verified answer to "is this move legal" —
  that's explicitly out of scope for both, which is correct architecturally but means an
  integrator who assumes the board component "knows chess" will ship illegal moves that only
  the backend later rejects (bad UX: piece animates, then silently reverts on a rejected
  server response).

## 4. What we should copy conceptually

- Dual input mode (click-click and drag) as parallel, always-available paths — never make drag
  the only way to move on a touch device.
- The drag-distance threshold and `autoDistance`-style device-aware tuning: on touch, treat
  small pointer jitter during a tap as "still a tap," not "started dragging."
- The ghost piece as constant proof-of-origin during a drag.
- Event-driven move validation (cm-chessboard's `moveInputStarted` /`validateMoveInput`
  /`moveInputFinished`/`moveInputCanceled` shape) rather than a single opaque "onMove"
  callback — it gives the host four distinct, testable hook points instead of one, which maps
  cleanly onto our own state machine (optimistic apply → server confirm/reject).
- Geometry-only premove calculation with real-time legality re-check on resolution, rather than
  trying to fully pre-simulate the opponent's reply.
- Arrow-snap-to-legal-move plus freehand-off-board-drag as the two annotation gestures.
- Treating accessibility as an explicit, separately-designed module (cm-chessboard's approach)
  rather than retrofitting ARIA onto a visual-only DOM tree after the fact (chessground's
  gap). Given our own accessibility audit already exists (472 browser checks, 156 contrast
  pairs, per project scope) the board must be designed with a table/live-region fallback from
  day one, not bolted on later.
- Config-first API shape: every interaction knob (`movable`, `premovable`, `draggable`,
  `animation`, `highlight`, `drawable`) is a plain, independently-toggleable object, so a
  single component serves "play mode," "puzzle mode," "analysis mode," and "spectator mode"
  by reconfiguring flags rather than branching component trees.

## 5. What we can do better

- Ship the accessible board (table representation + live region + keyboard move input) as the
  **default rendering path**, not an opt-in extension — cm-chessboard's own README frames it as
  an add-on; given our accessibility audit already covers 156 contrast pairs, treating a11y as
  core rather than bolted-on is cheaper to do correctly once than to retrofit, and it's the
  only path that will actually pass 472 browser checks cleanly.
- Fix the promotion-hit-area class of bug (lila#13545) at the design level: make the promotion
  picker a fixed on-screen overlay sized well above minimum touch-target size (44×44pt per
  Apple HIG / 48×48dp per Material — cross-reference against our own contrast/target-size audit
  requirements) rather than four tiny squares stacked on the promotion file, which is the
  layout that produced the original bug.
- Bind premove cancellation to an explicit, always-visible on-board affordance (not just a
  keyboard shortcut or a separate "unset" call the host has to remember to wire) — a dedicated
  cancel chip/badge next to or on the premove-highlighted square, since our target device is
  touch-only inside a WebView with no keyboard shortcuts available by default.
- Never let two logically distinct actions sit within touch-target-collision distance the way
  Chess.com's resign/back controls reportedly do — build a hard rule into review: any
  irreversible action (resign, pay, confirm wager) must be both (a) not adjacent to a frequent,
  low-stakes control, and (b) behind a confirm step whose confirm button is not vertically
  stacked under the trigger.
- Where chessground and cm-chessboard both leave move legality entirely to the host, make our
  optimistic-move → server-confirm loop visually explicit and fast enough that a rejected
  optimistic move reverts within one animation frame's worth of perceived latency, so it never
  reads as "the board is buggy."

## 6. What is technically required

Each item below is a discrete, testable requirement for the board component.

**Selection & tap-tap input**
- [ ] Tapping a square containing a movable piece selects it (visual highlight on the square).
- [ ] Tapping a second, legal destination square completes the move.
- [ ] Tapping the already-selected square again deselects it (no move).
- [ ] Tapping a different one of the mover's own pieces re-selects (switches selection, doesn't
  attempt an illegal move onto an occupied friendly square).
- [ ] Tapping an illegal destination square either no-ops with a visible rejection cue (shake/
  flash) or deselects, per product decision — must be deterministic and tested both ways.

**Drag input**
- [ ] Drag does not visually start until pointer movement exceeds a minimum-distance threshold
  from the pointer-down origin (prevents a stationary tap from being read as a zero-distance
  drag-drop).
- [ ] The threshold is 0 (or auto-adjusted) for touch pointers where full drag distance already
  costs enough precision that an extra threshold only adds lag — verify against real touch
  input, not mouse-emulated touch in devtools.
- [ ] Only a single active touch point drives the drag; a second finger touching the screen
  during an active drag must not be interpreted as a second drag or cancel the first.
- [ ] `pointercancel`/interruption (e.g. an OS gesture, an incoming call, app backgrounding
  mid-drag inside the WebView) must cleanly abort the drag and restore the piece to its origin
  square — never leave a piece rendered off-grid.
- [ ] The dragged piece renders centered under the finger, not offset to where the pointer-down
  originally landed on the piece sprite.
- [ ] A ghost/placeholder remains on the origin square for the duration of the drag.
- [ ] Dropping on a legal destination completes the move; dropping on an illegal destination
  snaps back to origin; dropping off the board either snaps back or deletes, per configured
  mode (editor vs. play).

**Premove and premove cancellation**
- [ ] A move can be queued while it is not the mover's turn, calculated by piece-geometry only
  (no capture-legality check against a future, unknown position).
- [ ] Castling is a valid premove input in both king-two-squares and king-onto-rook input
  styles.
- [ ] The queued premove is visually distinct from a normal selected/dragged state (its own
  highlight colour/style).
- [ ] The premove fires automatically the instant it becomes the mover's turn, and is
  re-validated for real legality against the actual resulting position — an illegal premove
  (opponent's reply made it illegal) is silently dropped, not force-played.
- [ ] There is an explicit, always-visible on-screen affordance to cancel a pending premove
  before it fires (not solely a keyboard shortcut) — required given the target device is
  touch-only.
- [ ] Making any other explicit action that logically supersedes the premove (e.g. selecting a
  different piece) cancels the previous premove rather than queuing both.

**Promotion**
- [ ] Promotion triggers automatically the instant a pawn move (drag or tap-tap) lands on the
  final rank, without a separate confirmation step for the move itself.
- [ ] The promotion piece picker renders as an overlay with touch targets no smaller than
  44×44pt (iOS HIG) / 48×48dp (Material) each — the original chessground/lila bug
  (lichess-org/lila#13545) was exactly a too-small/misaligned hit area on a specific piece-set
  configuration; the fix is to never let the picker's hit area depend on piece-sprite geometry.
- [ ] The picker must render fully on-screen regardless of board orientation (flipped board,
  promotion on rank 1 vs rank 8) and regardless of where on the viewport the board sits (must
  not be clipped by a fixed header/footer in the wallet WebView chrome).
- [ ] Cancelling the promotion picker (tap outside it, or an explicit cancel control) must
  revert the pawn move entirely, not leave it half-committed.
- [ ] Under-promotion (rook, bishop, knight) must be exactly as reachable as queen promotion —
  no "queen by default, tap-and-hold for others" pattern that biases toward the common case at
  the cost of hiding the rare-but-necessary one.

**Animation**
- [ ] Piece movement animates smoothly between origin and destination square on confirmed
  moves; captured pieces fade/animate out rather than disappearing instantly.
- [ ] Animation duration is configurable and can be set to 0 (used when animation would delay a
  chain of premoves, or under reduced-motion preference).
- [ ] `prefers-reduced-motion` is honoured — animation duration collapses toward 0 for users who
  have that OS/browser setting on (not covered by either reference library's docs; this is our
  own accessibility-audit obligation — **NOT VERIFIED against chessground/cm-chessboard source,
  neither documents reduced-motion support**, treat as a gap to close ourselves).
- [ ] Rapid sequential moves (fast premove chains, fast-forwarding through a replay) do not
  visually queue/stutter — either the animation is interruptible or moves coalesce.

**Resize / responsive**
- [ ] The board re-measures and re-renders correctly at any container size, at any time,
  including mid-drag (though a resize mid-drag should be rare inside a fixed-viewport wallet
  WebView, the code path must not crash if it happens, e.g. a system font-size change firing a
  layout reflow).
- [ ] The board remains a perfect square (no aspect distortion) at every supported size within
  the 390×844-class mobile viewport.
- [ ] Square hit-testing is recalculated from the current rendered bounds every time, never
  cached from a stale layout — a board that resizes without recalculating hit-test math is a
  silent, hard-to-notice bug class.

**Coordinates**
- [ ] Rank/file coordinate labels can render on the board edge, independent of any other
  setting.
- [ ] Coordinates remain correctly oriented (not mirrored) when the board is flipped.
- [ ] Coordinate legibility must clear the project's own 156-contrast-pair accessibility bar
  against both light and dark board themes — verify, don't assume, against actual theme
  colours.

**Arrows / shapes**
- [ ] User can draw an arrow via right-click-drag (desktop) or long-press-drag (touch,
  substituting for the unavailable right-click gesture) from one square to another.
- [ ] An in-progress arrow snaps its head to the nearest legal destination square when dragging
  from a square that has legal moves.
- [ ] A freehand arrow/shape (not aligned to a legal move) is achievable by dragging the pointer
  off the board's edge and back on, or via an explicit "freehand" mode toggle if the off-board
  gesture is impractical on a fixed small viewport.
- [ ] Existing shapes are clearable individually (tap a shape) and in bulk (clear-all control).
- [ ] Programmatically injected shapes (engine hints, puzzle hints) render visually consistent
  with user-drawn shapes but are not user-erasable by a stray tap.

**Ghost piece**
- [ ] A dimmed copy of the piece being dragged remains visible on its origin square for the
  full duration of the drag.
- [ ] The ghost disappears the instant the drag resolves (drop, cancel, or interrupt) — never
  left rendered as an orphaned element.

**Touch handling specifics**
- [ ] `touchstart`/`touchmove`/`touchend` are the primary handled events on touch devices;
  synthetic mouse events that some browsers fire after touch events must not double-trigger the
  same move.
- [ ] `touch-action: none` (or equivalent) is set on the board surface so the browser does not
  hijack a drag gesture as a page-scroll or pinch-zoom gesture.
- [ ] A drag or premove-select gesture must not scroll the surrounding page while in progress.
- [ ] Multi-touch (a second finger landing anywhere on screen during an active single-finger
  drag) must not be interpreted as a competing gesture — reference: chessground's own comment,
  "support one finger touch only," `src/drag.ts`.

**Castling and en passant input**
- [ ] Castling is reachable by at least one of: king-two-squares, or king-onto-rook (Chess960/
  Freestyle-compatible) input; document which one(s) our board supports and why.
- [ ] En passant is offered as a legal destination for a pawn exactly on the turns it is legal,
  and executes the correct capture (removing the passed pawn, not the destination square,
  which is empty).

**Check / last-move highlight, illegal-move feedback**
- [ ] The king's square is visually highlighted the instant its side is in check.
- [ ] The most recently played move's origin and destination squares are visually highlighted
  and remain so until the next move.
- [ ] An attempted illegal move (tap-tap or drag) produces a visible, immediate rejection cue —
  never a silent no-op that leaves the user unsure whether the input registered at all.

**Accessibility (see also the project's own 09-ux research and the 472-check audit)**
- [ ] A non-visual, assistive-tech-usable path to make a move exists (equivalent in spirit to
  cm-chessboard's Accessibility extension: keyboard/focus-based square navigation, or an
  explicit from/to text input, plus an `aria-live` region announcing the result of every move,
  check, and capture).
- [ ] The board container and interactive squares carry meaningful `role`/`aria-label`
  attributes — chessground ships none of this by default, so it must be built, not assumed
  present "because we based the board on a reference implementation."
- [ ] Every colour pairing used for highlight states (selected square, legal-destination dot,
  last-move, check, premove) is verified against the project's own 156 contrast-pair audit in
  both the light and dark board themes — not just checked once against one theme.

## 7. What could break

- **Double-firing on touch**: browsers that still dispatch a synthetic `mousedown`/`mouseup`
  pair after `touchstart`/`touchend` can cause a single physical tap to register as two logical
  inputs if event handling isn't de-duplicated — this is exactly the class of bug chessground's
  code guards against with its trusted-event and single-finger checks (`src/drag.ts`); a
  hand-rolled board that skips this guard will double-move or double-premove intermittently.
- **Promotion hit-area regressions under non-default piece sets/board sizes** — the real,
  filed bug (lichess-org/lila#13545,
  https://github.com/lichess-org/lila/issues/13545) shows this happens even in a mature,
  widely-used codebase; any promotion picker whose hit area is derived from piece-sprite
  geometry rather than a fixed overlay layout is at risk.
- **Interrupted drags inside a WebView**: an incoming system notification, an app-switch
  gesture, or the OS keyboard appearing can fire `touchcancel`/blur mid-drag; unhandled, this
  leaves a piece rendered mid-board, detached from board state.
- **Stale bounds after layout shift**: any late-loading web font, a dynamically-sized clock/
  status bar, or a keyboard opening/closing changes the board's on-screen rect; if hit-testing
  isn't re-derived from a fresh `getBoundingClientRect()` per gesture, taps land on the wrong
  square after such a shift.
- **Premove racing a slow network confirm**: if the optimistic premove-fire and the server's
  authoritative response can arrive out of order, the board can briefly show a move that gets
  silently reverted, or apply the premove twice — needs a monotonic move-sequence guard, not
  just a boolean "premove pending" flag.
- **Zoom/pinch conflicts**: without `touch-action: none` (or the CSS-container equivalent)
  scoped correctly, a drag gesture that starts on a piece can be hijacked by the WebView's
  native pinch-zoom or overscroll-bounce behaviour, especially on iOS WKWebView.
- **Orientation flip mid-drag or mid-premove**: flipping board orientation while an interaction
  is in progress must either be disallowed or must correctly remap in-flight coordinates —
  neither reference library documents this case explicitly; treat as **NOT VERIFIED against
  source**, and write an explicit test for it.
- **Reconnection state mismatch**: if the WebView backgrounds and the app reconnects
  mid-drag/mid-premove, the resumed board state must reconcile against the server's
  authoritative FEN, not trust a stale local optimistic state — a wallet-hosted app is more
  likely than a browser tab to be backgrounded arbitrarily (user switches to approve a payment
  dialog, for instance) and must resume correctly.

## 8. What we can uniquely do because of Nimiq

- The runtime target is a **fixed, known viewport class** (≈390×844, wallet WebView, per
  project scope) rather than "any browser at any size" — unlike chessground and cm-chessboard,
  which both have to support arbitrary desktop containers and 3D-piece rendering, our board
  never needs that generality. We can hard-cut chessground's 3D-piece/Cordova-era code paths
  and cm-chessboard's arbitrary-aspect-ratio config entirely, keeping the bundle smaller and
  the hit-testing math simpler and more reliably correct on the one real device class that
  matters.
- Because every real match is tied to an on-chain or wallet-attributable payment (entry fee,
  wager, tip), a **server-authoritative move log tied to the payment record** is a natural
  fit — every move can be timestamped against the same backend that already settles the money,
  giving free, tamper-evident move history without a separate anti-cheat subsystem bolted on
  later.
- The **Device Identifier API** (anonymous, no-wallet-needed per-device handle, confirmed in
  `NIMIQ_DEV_DOCS_FULL_REFERENCE.md`) lets us offer a genuinely frictionless "play a move right
  now" board interaction before any wallet connection or payment happens — the board itself
  can be fully interactive pre-payment, with the Nimiq/NIM payment step gating only entry to a
  paid match, not gating the interaction the user is evaluating.
- NIM's feeless, sub-second finality (project-established fact) means a premove-adjacent
  feature — instant, on-chain-settled per-move stakes or tips — is viable in a way it would not
  be on a chain with meaningful per-tx fees or multi-second confirmation; neither chessground
  nor cm-chessboard has any equivalent because neither reference product has a native
  feeless settlement rail underneath the board.

## 9. Licence and reuse verdict

- **Chessground — GPL-3.0-or-later.** Verified directly from the package's own
  `package.json` (`"license": "GPL-3.0-or-later"`,
  https://raw.githubusercontent.com/lichess-org/chessground/master/package.json) and restated
  in the README ("Chessground is distributed under the GPL-3.0 license (or any later version,
  at your option)," https://github.com/lichess-org/chessground). **Verdict: reference-only.**
  Chessground's code cannot be copied, adapted, or linked into an MIT-licensed repository
  without relicensing the combined work under GPL — which the project's own MIT commitment
  rules out. Study its architecture and behaviour (this file is exactly that), but every
  interaction must be independently re-implemented from the specification above, not ported.
  Chessground ships no piece/board image assets of its own (pure CSS-class styling), so there
  is no separate asset-licence question for chessground itself.
- **cm-chessboard — code MIT, bundled piece assets differently licensed.** Verified from the
  README's explicit, separated statements: *"License for the code: MIT"*; *"License for the
  Staunty SVG-pieces (chessboard-sprite-staunty.svg): CC BY-NC-SA 4.0"*; *"License for the
  Wikimedia SVG-pieces (chessboard-sprite.svg): CC BY-SA 3.0"*
  (https://github.com/shaack/cm-chessboard). Package registry confirms `"license": "MIT"` at
  the package.json level (https://registry.npmjs.org/cm-chessboard/latest, v8.14.0, 389,336
  bytes unpacked / 77 files). **Verdict: the CODE is portable into our MIT repo** — it can be
  read, adapted, or its patterns ported freely with attribution as good practice (MIT doesn't
  require it, but it's the professional norm). **The bundled Staunty piece set is NOT usable**:
  CC BY-NC-SA 4.0's non-commercial clause is incompatible with a competition product tied to a
  cash prize and real-money wagers. **The bundled Wikimedia piece set is usable but not free of
  obligation**: CC BY-SA 3.0 requires attribution and share-alike licensing of any derivative
  of that specific image asset — acceptable for a placeholder/prototype, but the project should
  commission or select an unambiguously permissive (CC0/MIT/public-domain) or fully
  custom-drawn piece set for the shipped product, to avoid any per-asset attribution/share-alike
  bookkeeping in a codebase that is otherwise cleanly MIT end-to-end.
- **Net recommendation**: build the board component's interaction logic from this checklist
  (clean-room, informed by both libraries' documented and source-read behaviour, copying no
  chessground code), optionally lift small, self-contained utility patterns from cm-chessboard
  under MIT with attribution, and source piece/board art independently of both bundled sets.
