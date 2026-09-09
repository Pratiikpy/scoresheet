/**
 * `/coordinates` — the coordinate trainer's screen.
 *
 * The rules and the scoring are in `coordinates.ts`; this is the board, the pad and the clock. Two
 * modes, exactly as Lichess defines them:
 *
 *  - **Find square** — a coordinate is shown, and you tap it. The board is empty, because pieces are
 *    a distraction from the only thing being trained.
 *  - **Name square** — a square is lit, and you name it with two taps: a file, then a rank. Lichess
 *    types the answer; on a phone the keyboard covers the half of the board with the answer on it,
 *    so a pad under the board is the same exercise without the obstruction.
 *
 * Thirty seconds, and the score is how many you got right. The average is kept **per orientation**,
 * because reading a board from behind the black pieces is a different skill and most players are
 * markedly worse at it.
 */

import { squareColour, type Square } from './board.ts';
import { t } from './i18n.ts';
import { haptic, play } from './sound.ts';
import { progress, updateProgress } from './puzzle-progress.ts';
import {
  RUN_SECONDS,
  allSquares,
  averageScore,
  startRun,
  type CoordMode,
  type CoordRun,
  type CoordSide,
} from './coordinates.ts';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface CoordinateScreenOptions {
  onBack: () => void;
}

export function createCoordinateScreen(options: CoordinateScreenOptions): HTMLElement {
  const el = element('div', 'coords');

  el.append(element('h1', 'coords__title', t('coords.title')));
  el.append(element('p', 'coords__note', t('coords.note')));

  /* ------------------------------------------------------------------ the choices */

  let mode: CoordMode = 'find';
  let side: CoordSide = 'random';
  /*
   * Pieces on the board, off by default.
   *
   * Lichess offers this and it is worth having: finding `f6` on an empty board is a different, and
   * easier, exercise than finding it in a position — a real game never presents you with an empty
   * board. Off to begin with, because the empty board is where somebody who does not know the
   * squares at all should start.
   *
   * Lichess also offers *"practice only some files & ranks"*, and this does not. That is sixteen
   * toggles for a drill somebody does for thirty seconds, and the organiser's own warning is that
   * complexity costs points (`../SIP_AND_SHIP_C2_CALL1_FINDINGS.md`). Said here rather than left as
   * a silent omission.
   */
  let pieces = false;

  const chooser = <T extends string>(
    label: string,
    choices: { value: T; name: string }[],
    initial: T,
    onPick: (value: T) => void,
    kind: string,
  ): HTMLElement => {
    const group = element('div', 'coords__group');
    group.append(element('p', 'coords__label', label));
    const row = element('div', 'coords__choices');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', label);

    let chosen = initial;
    const buttons = choices.map((choice) => {
      const node = element('button', 'coords__choice', choice.name);
      node.type = 'button';
      node.setAttribute('role', 'radio');
      node.dataset[kind] = choice.value;
      node.addEventListener('click', () => {
        chosen = choice.value;
        onPick(choice.value);
        mark();
        haptic(6);
      });
      return node;
    });

    function mark(): void {
      for (const [index, node] of buttons.entries()) {
        const isChosen = choices[index]!.value === chosen;
        node.classList.toggle('coords__choice--chosen', isChosen);
        node.setAttribute('aria-checked', String(isChosen));
        node.tabIndex = isChosen ? 0 : -1;
      }
    }
    mark();

    row.append(...buttons);
    group.append(row);
    return group;
  };

  const setup = element('div', 'coords__setup');
  setup.append(
    chooser<CoordMode>(
      t('coords.mode'),
      [
        { value: 'find', name: t('coords.findSquare') },
        { value: 'name', name: t('coords.nameSquare') },
      ],
      mode,
      (value) => (mode = value),
      'mode',
    ),
    chooser<CoordSide>(
      t('coords.playAs'),
      [
        { value: 'random', name: t('colour.random') },
        { value: 'w', name: t('colour.white') },
        { value: 'b', name: t('colour.black') },
      ],
      side,
      (value) => (side = value),
      'side',
    ),
  );

  const showPieces = element('label', 'coords__toggle');
  const piecesInput = document.createElement('input');
  piecesInput.type = 'checkbox';
  piecesInput.className = 'sheet__switch';
  piecesInput.dataset['setting'] = 'coord-pieces';
  piecesInput.addEventListener('change', () => (pieces = piecesInput.checked));
  showPieces.append(element('span', 'coords__label', t('coords.showPieces')), piecesInput);
  setup.append(showPieces);

  const start = element('button', 'btn btn--primary', t('coords.start'));
  start.type = 'button';
  start.dataset['action'] = 'start-coords';
  setup.append(start);
  el.append(setup);

  /* ------------------------------------------------------------------ the run */

  const running = element('div', 'coords__running');
  running.hidden = true;

  const prompt = element('p', 'coords__prompt');
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'assertive');

  const score = element('p', 'coords__score');
  score.setAttribute('role', 'status');

  /*
   * The board is built once and re-labelled, never rebuilt.
   *
   * Sixty-four buttons replaced twice a second would fight the tap that is arriving, and on a phone
   * a rebuilt board loses the touch that started on the old one.
   */
  const board = element('div', 'coords__board');
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', t('board.label'));

  const cells = new Map<string, HTMLButtonElement>();
  for (const square of allSquares()) {
    const cell = element('button', 'coords__sq');
    cell.type = 'button';
    cell.dataset['square'] = square;
    /*
     * The colours come from the real board's own function, not from a second copy of the rule.
     *
     * The copy was written here first and it was **inverted** — `a1` came out light, which is the one
     * thing about a chessboard everybody knows. One rule, one place.
     */
    cell.classList.add(`coords__sq--${squareColour(square as Square)}`);
    cell.addEventListener('click', () => onSquare(square));
    cells.set(square, cell);
    board.append(cell);
  }

  /** The pad for naming a square: eight files, then eight ranks. */
  const pad = element('div', 'coords__pad');
  pad.hidden = true;
  const filePad = element('div', 'coords__pad-row');
  const rankPad = element('div', 'coords__pad-row');
  let pickedFile: string | null = null;

  for (const file of 'abcdefgh') {
    const key = element('button', 'coords__key', file);
    key.type = 'button';
    key.dataset['file'] = file;
    key.addEventListener('click', () => {
      pickedFile = file;
      markPad();
      haptic(4);
    });
    filePad.append(key);
  }
  for (const rank of '12345678') {
    const key = element('button', 'coords__key', rank);
    key.type = 'button';
    key.dataset['rank'] = rank;
    key.addEventListener('click', () => {
      if (!pickedFile) return;
      const given = pickedFile + rank;
      pickedFile = null;
      markPad();
      onSquare(given);
    });
    rankPad.append(key);
  }
  pad.append(filePad, rankPad);

  function markPad(): void {
    for (const key of filePad.children) {
      key.classList.toggle('coords__key--chosen', (key as HTMLElement).dataset['file'] === pickedFile);
    }
    // A rank means nothing until a file has been chosen, and a dead key that looks live is worse
    // than one that says so.
    for (const key of rankPad.children) (key as HTMLButtonElement).disabled = pickedFile === null;
  }
  markPad();

  running.append(prompt, score, board, pad);
  el.append(running);

  /* ------------------------------------------------------------------ the report */

  const report = element('div', 'coords__report');
  report.hidden = true;
  el.append(report);

  /* ------------------------------------------------------------------ state */

  let run: CoordRun | null = null;
  let left = RUN_SECONDS;
  let clock: number | null = null;

  function paintBoard(): void {
    if (!run) return;
    const flipped = run.side === 'b';
    for (const [square, cell] of cells) {
      const file = FILES_INDEX[square[0]!]!;
      const rank = Number(square[1]) - 1;
      // Laid out with `order` rather than by re-appending, so the elements never move in the DOM.
      const column = flipped ? 7 - file : file;
      const row = flipped ? rank : 7 - rank;
      cell.style.order = String(row * 8 + column);

      const lit = mode === 'name' && square === run.square;
      cell.classList.toggle('coords__sq--asked', lit);
      /*
       * In "find", the squares are the answer and must be reachable and unlabelled. In "name" they
       * are not answers at all, so they are not buttons a screen reader should offer.
       */
      cell.disabled = mode !== 'find';
      cell.setAttribute('aria-label', mode === 'find' ? square : lit ? t('coords.thisSquare') : '');
      /*
       * The starting position, when pieces are asked for.
       *
       * The *starting* position rather than a random one: it is the arrangement every player already
       * has in their head, so what is being trained stays the coordinates rather than reading an
       * unfamiliar board.
       */
      cell.textContent = pieces ? (START_PIECES[square] ?? '') : '';
    }
  }

  function paint(): void {
    if (!run) return;
    prompt.textContent =
      mode === 'find' ? t('coords.findThis', { square: run.square }) : t('coords.nameThis');
    prompt.classList.toggle('coords__prompt--big', mode === 'find');
    score.textContent = t('coords.score', { correct: run.correct, left });
    paintBoard();
  }

  function onSquare(given: string): void {
    if (!run) return;
    const right = run.answer(given);
    // 'lowTime' is the app's only 'that was not it' sound; there is no separate error tone, and
    // inventing one for this screen alone would make it the odd screen out.
    play(right ? 'move' : 'lowTime');
    haptic(right ? 6 : 14);
    flash(given, right);
    paint();
  }

  /** A moment of colour on the square that was tapped, so an answer is felt as well as counted. */
  function flash(square: string, right: boolean): void {
    const cell = cells.get(square);
    if (!cell) return;
    const mark = right ? 'coords__sq--right' : 'coords__sq--wrong';
    cell.classList.add(mark);
    window.setTimeout(() => cell.classList.remove(mark), 260);
  }

  function begin(): void {
    run = startRun({ side });
    left = RUN_SECONDS;
    setup.hidden = true;
    report.hidden = true;
    running.hidden = false;
    pad.hidden = mode !== 'name';
    pickedFile = null;
    markPad();
    paint();

    stopClock();
    clock = window.setInterval(() => {
      left -= 1;
      if (left <= 0) finish();
      else paint();
    }, 1000);
  }

  function finish(): void {
    stopClock();
    if (!run) return;
    const scored = run.correct;
    const orientation = run.side;
    run = null;

    running.hidden = true;
    play('end');

    /*
     * Banked per orientation, which is the whole reason the store keeps two of everything.
     *
     * `coordRuns` counts runs and `coordTotal` sums scores, so the average is derived rather than
     * stored — a stored average cannot be corrected and drifts the moment anything about the run
     * changes.
     */
    const saved = progress();
    updateProgress({
      coordRuns: { ...saved.coordRuns, [orientation]: saved.coordRuns[orientation] + 1 },
      coordTotal: { ...saved.coordTotal, [orientation]: saved.coordTotal[orientation] + scored },
      coordBest: {
        ...saved.coordBest,
        [orientation]: Math.max(saved.coordBest[orientation], scored),
      },
    });

    showReport(scored, orientation);
  }

  function showReport(scored: number, orientation: 'w' | 'b'): void {
    const saved = progress();
    report.hidden = false;
    report.replaceChildren();
    report.append(element('p', 'coords__result', t('coords.youScored', { score: scored })));

    for (const which of ['w', 'b'] as const) {
      const average = averageScore(saved.coordTotal[which], saved.coordRuns[which]);
      const row = element('p', 'coords__average');
      row.textContent =
        average === null
          ? t('coords.noAverage', { side: t(which === 'w' ? 'colour.white' : 'colour.black') })
          : t('coords.average', {
              side: t(which === 'w' ? 'colour.white' : 'colour.black'),
              average: average.toFixed(1),
              best: saved.coordBest[which],
            });
      row.classList.toggle('coords__average--just', which === orientation);
      report.append(row);
    }

    const again = element('button', 'btn btn--primary', t('coords.again'));
    again.type = 'button';
    again.dataset['action'] = 'start-coords';
    again.addEventListener('click', begin);

    const back = element('button', 'btn', t('common.backToBoard'));
    back.type = 'button';
    back.addEventListener('click', options.onBack);

    const change = element('button', 'btn', t('coords.change'));
    change.type = 'button';
    change.addEventListener('click', () => {
      report.hidden = true;
      setup.hidden = false;
    });

    report.append(again, change, back);
  }

  function stopClock(): void {
    if (clock !== null) window.clearInterval(clock);
    clock = null;
  }

  start.addEventListener('click', begin);

  /*
   * The clock must not outlive the screen.
   *
   * Routing away from a run would otherwise leave an interval counting down against a detached
   * board for as long as the tab stayed open. `main.ts` calls this when it replaces the screen.
   */
  (el as HTMLElement & { destroy?: () => void }).destroy = stopClock;

  return el;
}

/** File letter to index, built once. */
const FILES_INDEX: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };

/**
 * The starting position, as figurine characters.
 *
 * Glyphs rather than the app's own SVG pieces: this board is sixty-four buttons rather than the real
 * board, the pieces here are scenery for an exercise about squares, and a character costs nothing.
 * Black's are the outlined set and White's the filled — the opposite of what looks right on a light
 * square, which is why they are picked deliberately rather than by symmetry.
 */
const START_PIECES: Record<string, string> = (() => {
  const back = ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'];
  const backWhite = ['♖', '♘', '♗', '♕', '♔', '♗', '♘', '♖'];
  const map: Record<string, string> = {};
  'abcdefgh'.split('').forEach((file, index) => {
    map[`${file}8`] = back[index]!;
    map[`${file}7`] = '♟';
    map[`${file}2`] = '♙';
    map[`${file}1`] = backWhite[index]!;
  });
  return map;
})();
