/**
 * `/study` — where a game goes to be understood.
 *
 * Two things happen here, and they belong together because they are the same activity:
 *
 *  1. **A game arrives.** Either handed over from one that just finished, or pasted as PGN from
 *     Lichess, Chess.com, a tournament, anywhere. Export without import is a one-way door: a game
 *     could leave and none could arrive, so a game played at a club could not be looked at here.
 *  2. **It is analysed.** Every move judged, an accuracy for each side, and the engine's move shown
 *     as an arrow when it differs. `SPEC.md` J9 calls Chess.com's Game Review *"the most-loved
 *     feature by a distance"*, and K2 lists it first among the things the engine unlocks.
 *
 * ## What it does not claim
 *
 * The engine is ours and it is about 2000, not 3600 (`SPEC.md` K8). That is enough to review an
 * amateur game and not enough to correct a grandmaster, and the screen says so in one line rather
 * than implying parity with a server running Stockfish. It also **signs nothing**: an imported game
 * has no signatures, no witnesses and no claim on anybody's rating, and saying so plainly is what
 * lets this screen exist without undermining the product's one real claim.
 */

import {
  bestExplanation,
  considerMistake,
  fromPgn,
  stillSound,
  type AnalysedMove,
  type GameAnalysis,
  type Judgement,
} from '@scoresheet/core';
import { isQueued, queuePuzzle } from './own-puzzle-store.ts';
import { Chess } from 'chess.js';
import { createBoard, type Square } from './board.ts';
import { createMoveList } from './movelist.ts';
import { settings } from './settings.ts';
import { takeGame } from './study.ts';
import type { AnalysisMessage, AnalysisRequest } from './analysis-worker.ts';
import { t, type Key } from './i18n.ts';

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

/**
 * What each judgement is called on screen, and the mark that goes beside the move.
 *
 * The plural is spelled out rather than derived. "Inaccuracys" is what an appended `s` produces, and
 * a report that cannot spell is a report nobody trusts with their chess.
 */
const WORDS: Record<Judgement, { label: Key; plural: Key; mark: string }> = {
  best: { label: 'judge.best', plural: 'judge.bests', mark: '★' },
  good: { label: 'judge.good', plural: 'judge.goods', mark: '' },
  inaccuracy: { label: 'judge.inaccuracy', plural: 'judge.inaccuracies', mark: '?!' },
  mistake: { label: 'judge.mistake', plural: 'judge.mistakes', mark: '?' },
  blunder: { label: 'judge.blunder', plural: 'judge.blunders', mark: '??' },
};

/** The three worth counting in a summary. Nobody wants a tally of their good moves. */
const COUNTED: Judgement[] = ['inaccuracy', 'mistake', 'blunder'];

export function createStudyScreen(): HTMLElement {
  const el = element('div', 'study');

  el.append(element('h1', 'study__title', t('study.title')));
  const note = element(
    'p',
    'study__note',
    t('study.note'),
  );
  el.append(note);

  const box = element('textarea', 'study__box');
  box.rows = 5;
  box.placeholder = '[Event "..."]\n\n1. e4 e5 2. Nf3 ...';
  box.setAttribute('aria-label', t('study.pasteLabel'));
  el.append(box);

  const problem = element('p', 'study__problem');
  problem.setAttribute('role', 'status');
  problem.hidden = true;
  el.append(problem);

  const open = element('button', 'btn btn--primary', t('study.open'));
  open.type = 'button';
  open.dataset['action'] = 'open-pgn';
  el.append(open);

  /* ------------------------------------------------------------------ the board */

  const viewer = element('div', 'study__viewer');
  viewer.hidden = true;
  el.append(viewer);

  const heading = element('p', 'study__heading');
  const moves: string[] = [];
  let viewing: number | null = null;
  let analysis: GameAnalysis | null = null;

  /*
   * ⭐ **Try Again — the board stops being a picture.**
   *
   * A review that only shows you the answer teaches very little; the workflow every teaching source
   * in `research/03-analysis/how-players-actually-analyse.md` converges on is **guess first, then
   * let the engine tell you.** Lichess has it inside Studies as gamebook mode and neither platform
   * has it inside review, which is where somebody is actually looking at their own mistake.
   *
   * So on a criticised move the board becomes playable *at the position before it*, and whatever the
   * player finds is judged by the same engine, from the same position, with the same arithmetic that
   * judged the original move. Nothing here is a second opinion.
   */
  let retry: { ply: number; fen: string } | null = null;

  const board = createBoard({
    legalMoves: (from) => {
      if (!retry) return [];
      const position = new Chess(retry.fen);
      return position.moves({ square: from as never, verbose: true }).map((move) => move.to);
    },
    onMove: (move) => {
      if (!retry) return false;
      const position = new Chess(retry.fen);
      try {
        const played = position.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        void judgeAttempt(played.san);
        return true;
      } catch {
        return false;
      }
    },
    playing: null,
  });

  const moveList = createMoveList({
    onScrub(ply) {
      viewing = ply;
      draw();
    },
  });

  /* ------------------------------------------------------------------ the report */

  const report = element('div', 'study__report');

  const analyse = element('button', 'btn btn--primary', t('study.analyse'));
  analyse.type = 'button';
  analyse.dataset['action'] = 'analyse';

  const progress = element('div', 'study__progress');
  progress.hidden = true;
  const bar = element('div', 'study__bar');
  const fill = element('div', 'study__fill');
  bar.append(fill);
  const progressText = element('p', 'study__progress-text', t('study.looking'));
  progressText.setAttribute('role', 'status');
  progress.append(progressText, bar);

  const verdict = element('div', 'study__verdict');
  verdict.hidden = true;

  const detail = element('p', 'study__detail');
  detail.hidden = true;

  const tryBox = element('div', 'study__try');
  tryBox.hidden = true;
  const tryButton = element('button', 'btn', t('study.tryAgain'));
  tryButton.type = 'button';
  tryButton.dataset['action'] = 'try-again';
  const tryResult = element('p', 'study__try-result');
  tryResult.setAttribute('role', 'status');

  /*
   * ⭐ **Train This — the mistake becomes a puzzle you will meet again.**
   *
   * The obvious half of this feature is easy and half a dozen products sell it. The hard half, which
   * none of them publish, is refusing the mistakes that would make **unfair** puzzles: a position
   * whose second-best move is nearly as good marks a player wrong for finding it, and that teaches
   * worse than nothing. `own-puzzles.ts` holds those gates and refuses most candidates —
   * `scripts/own-puzzles-yield.mjs` measures the yield at 5.5% of real mistakes, with every refusal
   * counted by reason, because a generator that quietly drops nine in ten is indistinguishable from
   * a broken one.
   *
   * The ranking comes from the engine in a worker, and the puzzle is re-checked at four times the
   * budget before it is kept. That is not independent verification and does not pretend to be — the
   * research is explicit that engine labels checked by the same engine are circular — but it does
   * catch the shallow search that saw a tactic which is not there.
   */
  const trainButton = element('button', 'btn', t('study.trainThis'));
  trainButton.type = 'button';
  trainButton.dataset['action'] = 'train-this';

  tryBox.append(tryButton, trainButton, tryResult);

  trainButton.addEventListener('click', () => {
    void (async () => {
      const ply = viewing === null ? moves.length - 1 : viewing;
      const move = analysis?.moves[ply];
      if (!move) return;

      /*
       * The position to solve, and the one move before it.
       *
       * A puzzle needs its run-up: the solving screen opens with the opponent's move and hands the
       * board over after it, which is what makes a puzzle feel like a position that arrived rather
       * than one that was set up. So the ply before is captured here, and the very first move of a
       * game — which has no move before it — simply cannot be trained.
       */
      if (ply === 0) {
        tryResult.textContent = t('study.trainNotSuitable');
        return;
      }

      const setup = new Chess();
      for (const san of moves.slice(0, ply - 1)) setup.move(san);
      const setupFen = setup.fen();
      const setupMove = setup.move(moves[ply - 1]!);
      const setupUci = `${setupMove.from}${setupMove.to}${setupMove.promotion ?? ''}`;
      const fen = setup.fen();

      if (isQueued(fen)) {
        tryResult.textContent = t('study.trainAlready');
        return;
      }

      trainButton.disabled = true;
      tryResult.textContent = t('study.trainChecking');

      const prefix = moves.slice(0, ply);
      const ranked = await rankPosition(prefix, 300);
      if (!ranked) {
        tryResult.textContent = t('study.trainUnknown');
        trainButton.disabled = false;
        return;
      }

      const { puzzle, refused } = considerMistake({
        fen,
        setupFen,
        setupUci,
        played: move.san,
        ranked,
        // The gate wants centipawns lost; the review measures winning chance, and the two are not
        // the same scale. The difference between the engine's move and the one played, from the same
        // ranking, is the number the gate was designed around.
        cost: (ranked[0]?.score ?? 0) - (ranked.find((entry) => entry.san === move.san)?.score ?? 0),
        fromBlock: ply,
        gameId: 'review',
      });

      if (!puzzle) {
        tryResult.textContent = t(refused === 'not-unique' ? 'study.trainNotUnique' : 'study.trainNotSuitable');
        trainButton.disabled = false;
        return;
      }

      // The second look, deeper than the one that made it.
      const deeper = await rankPosition(prefix, 1200);
      if (!deeper || !stillSound(puzzle, deeper)) {
        tryResult.textContent = t('study.trainNotSound');
        trainButton.disabled = false;
        return;
      }

      tryResult.textContent = queuePuzzle(puzzle) ? t('study.trainAdded') : t('study.trainAlready');
      trainButton.disabled = false;
    })();
  });

  /** Ask the engine, in a worker, for every root move of a position with its score. */
  async function rankPosition(prefix: string[], budgetMs: number): Promise<{ san: string; score: number }[] | null> {
    const worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve(null);
      }, 30_000);
      worker.addEventListener('message', (event: MessageEvent<AnalysisMessage>) => {
        const message = event.data;
        if (message.type === 'progress') return;
        clearTimeout(timer);
        worker.terminate();
        resolve(message.type === 'ranked' ? message.moves : null);
      });
      worker.postMessage({ moves: prefix, rank: true, budgetMs } satisfies AnalysisRequest);
    });
  }

  report.append(analyse, progress, verdict, detail, tryBox);
  /*
   * ⭐ The evaluation bar — `SPEC.md` K2 calls it *"the screen every chess player expects after a
   * game"*, and it was one of the things the engine unlocked and nothing had built.
   *
   * A vertical strip beside the board, filled from the bottom in proportion to White's winning
   * chances at the position being looked at. It is the fastest possible answer to "who is winning
   * here", and — walked with the arrow keys — it is where somebody *sees* the game turn: the moment
   * the bar lurches is the move that decided it, before any word is read.
   *
   * Deliberately win percentage rather than centipawns. A bar driven by centipawns is nearly full at
   * +3 and full at +9, so the whole interesting range is compressed into a few pixels at one end;
   * win percentage is flat at the extremes and steep in the middle, which is exactly where a bar
   * should have its resolution.
   */
  const withBar = element('div', 'study__board');
  const evalBar = element('div', 'study__eval');
  evalBar.setAttribute('role', 'img');
  const evalFill = element('div', 'study__eval-fill');
  evalBar.append(evalFill);
  withBar.append(evalBar, board.el);

  viewer.append(heading, withBar, report, moveList.el);

  /* ------------------------------------------------------------------ drawing */

  function draw(): void {
    const replay = new Chess();
    const upTo = viewing === null ? moves : moves.slice(0, viewing + 1);
    for (const san of upTo) replay.move(san);

    board.setPosition(replay.fen());
    board.setShowCoords(settings().coordinates);
    const verbose = replay.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    board.setLastMove((last?.from ?? null) as Square | null, (last?.to ?? null) as Square | null);

    paintDetail();
    paintEval();
  }

  /**
   * Fill the bar from what the analysis already knows.
   *
   * `winAfter` is stored from the **mover's** point of view, so it is flipped for Black — a bar that
   * read one side's chances after White's moves and the other's after Black's would swing wildly and
   * mean nothing. Before an analysis exists the bar is hidden rather than sitting at fifty percent,
   * because an even bar is a claim and "not measured" is the truth.
   */
  function paintEval(): void {
    if (!analysis) {
      evalBar.hidden = true;
      return;
    }
    evalBar.hidden = false;

    const ply = viewing === null ? moves.length - 1 : viewing;
    const move = analysis.moves[ply];
    const white = move === undefined ? 50 : move.side === 'w' ? move.winAfter : 100 - move.winAfter;

    evalFill.style.height = `${Math.max(0, Math.min(100, white)).toFixed(1)}%`;
    evalBar.setAttribute(
      'aria-label',
      t(white >= 50 ? 'study.whiteAhead' : 'study.blackAhead', {
        percent: Math.round(white >= 50 ? white : 100 - white),
      }),
    );
    evalBar.title = evalBar.getAttribute('aria-label') ?? '';
  }

  /**
   * What the report says about the move being looked at.
   *
   * The arrow is the whole feature. A player reading "Mistake — Nf3 was better" has to find Nf3 on
   * the board themselves; an arrow from `g1` to `f3` is the same sentence, understood instantly, and
   * it is what both Lichess and Chess.com draw.
   */
  function paintDetail(): void {
    board.clearShapes();
    if (!analysis) {
      detail.hidden = true;
      return;
    }

    const ply = viewing === null ? moves.length - 1 : viewing;
    const move = analysis.moves[ply];
    if (!move) {
      detail.hidden = true;
      tryBox.hidden = true;
      return;
    }

    detail.hidden = false;
    detail.className = `study__detail study__detail--${move.judgement}`;
    const words = WORDS[move.judgement];
    const number = `${Math.floor(move.ply / 2) + 1}${move.side === 'w' ? '.' : '…'}`;

    if (move.best === null) {
      detail.textContent = t(move.judgement === 'best' ? 'study.wasBest' : 'study.wasGood', {
        number,
        san: move.san,
      });
      tryBox.hidden = true;
      return;
    }

    detail.replaceChildren();
    detail.append(
      element(
        'p',
        'study__verdict-line',
        t('study.wasWorse', {
          number,
          san: move.san,
          label: t(words.label),
          better: move.best,
          lost: move.lost.toFixed(0),
        }),
      ),
    );

    /*
     * The better move, drawn on the board *before* it was played.
     *
     * The board is showing the position *after* the move, so the suggestion has to be resolved
     * against the position before it — which is the position the player was actually looking at
     * when they chose.
     */
    const before = new Chess();
    for (const san of moves.slice(0, ply)) before.move(san);
    const positionBefore = before.fen();
    try {
      const suggestion = before.move(move.best);
      board.drawShape({ from: suggestion.from, to: suggestion.to });
    } catch {
      // The engine's move could not be replayed here, which would be our bug. The sentence above
      // still stands on its own, so the arrow is simply not drawn.
    }

    /*
     * ⭐ **And *why*, when it can be proved.**
     *
     * "Blunder, −2.8" tells a player what happened and nothing about what to do differently, and the
     * coaching material is unanimous that the number alone teaches nothing. `explain.ts` produces one
     * true sentence or none — it detects symbolically and templates, with no language model anywhere
     * in the truth-bearing path, because a review that says something false once is never trusted
     * again.
     *
     * **Silence is the common case and it is deliberate.** Measured over 12,000 real positions by
     * `scripts/explain-sanity.mjs`: no false statement, and 44% of real mistakes explained. The other
     * 56% get the number and no sentence, because an invented reason is worse than an absent one.
     */
    // Try Again is offered exactly where it is useful: on a move the engine criticised.
    tryBox.hidden = false;

    const why = bestExplanation({
      fen: positionBefore,
      played: move.san,
      best: move.best,
      lostCentipawns: move.lost,
    });
    if (why) {
      const line = element('p', 'study__why', why.text);
      // Announced as part of the same verdict rather than as a separate alert: a screen-reader user
      // stepping through moves should hear one sentence about the move, not two interruptions.
      detail.append(line);
    }
  }

  /* ------------------------------------------------------------------ try again */

  tryButton.addEventListener('click', () => {
    if (retry) {
      stopRetry();
      return;
    }
    const ply = viewing === null ? moves.length - 1 : viewing;
    const position = new Chess();
    for (const san of moves.slice(0, ply)) position.move(san);

    retry = { ply, fen: position.fen() };
    /*
     * The board has to be told whose turn it is, not merely handed a position.
     *
     * `playing` gates input entirely: a review board is constructed with it `null` because a game
     * that already happened is not playable, and without setting it here the squares take focus and
     * offer no destinations — which is exactly how this shipped for one run, and what the browser
     * check caught.
     */
    board.setPlaying(position.turn() === 'w' ? 'w' : 'b');
    tryButton.textContent = t('study.tryGiveUp');
    tryResult.textContent = t('study.tryPrompt');
    // The board shows the position *before* the mistake, with no arrow: being shown the answer and
    // then asked to find it is not a question.
    board.setPosition(position.fen());
    board.clearShapes();
    board.announce(t('study.tryPrompt'));
  });

  function stopRetry(): void {
    retry = null;
    // Back to a picture of a game that already happened.
    board.setPlaying(null);
    tryButton.textContent = t('study.tryAgain');
    tryResult.textContent = '';
    draw();
  }

  /**
   * Judge what the player just found, with the same engine and the same arithmetic.
   *
   * Three honest outcomes, and the middle one matters most: a move can be **better than what you
   * played and still not the engine's choice**, and a product that only ever says "no, the answer is
   * Nf3" throws that away. Somebody who improves on their own blunder has done the thing the feature
   * exists to teach, and should be told so.
   */
  async function judgeAttempt(san: string): Promise<void> {
    if (!retry) return;
    const originalLoss = analysis?.moves[retry.ply]?.lost ?? 0;
    tryResult.textContent = t('study.tryThinking');

    const attempt = [...moves.slice(0, retry.ply), san];
    const worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });

    const judged = await new Promise<AnalysedMove | null>((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve(null);
      }, 20_000);
      worker.addEventListener('message', (event: MessageEvent<AnalysisMessage>) => {
        const message = event.data;
        if (message.type === 'progress') return;
        clearTimeout(timer);
        worker.terminate();
        resolve(message.type === 'judged' ? message.move : null);
      });
      worker.postMessage({ moves: attempt, lastOnly: true } satisfies AnalysisRequest);
    });

    if (!judged) {
      // The engine did not answer. Say so plainly rather than pretending the move was bad.
      tryResult.textContent = t('study.tryUnknown');
      return;
    }

    board.setPosition(new Chess(retry.fen).fen());
    if (judged.judgement === 'best' || judged.lost < 2) {
      tryResult.textContent = t('study.tryFound', { san });
    } else if (judged.lost < originalLoss) {
      tryResult.textContent = t('study.tryBetter', { san, lost: judged.lost.toFixed(0) });
    } else {
      tryResult.textContent = t('study.tryNo', { san, lost: judged.lost.toFixed(0) });
    }
    board.announce(tryResult.textContent);
  }

  /** The summary: an accuracy for each side, and how many of each kind of mistake. */
  function paintVerdict(): void {
    if (!analysis) return;
    verdict.hidden = false;
    verdict.replaceChildren();

    for (const side of ['w', 'b'] as const) {
      const row = element('div', 'study__side');
      const name = t(side === 'w' ? 'colour.white' : 'colour.black');
      row.append(element('span', 'study__side-name', name));
      row.append(element('span', 'study__accuracy', `${analysis.accuracy[side].toFixed(1)}%`));
      /*
       * And the centipawn loss beside it, which is what a strong player asks for.
       *
       * Lichess reports both, and they answer different questions: accuracy is weighted by winning
       * chance, so a blunder in an already-lost game barely moves it; ACPL is flat and counts every
       * centipawn. One without the other is half an answer.
       */
      row.append(element('span', 'study__acpl', t('study.acpl', { acpl: analysis.acpl[side] })));

      const counts = analysis.counts[side];
      const parts = COUNTED.filter((kind) => counts[kind] > 0).map((kind) => {
        const word = t(counts[kind] === 1 ? WORDS[kind].label : WORDS[kind].plural).toLowerCase();
        return `${counts[kind]} ${word}`;
      });
      row.append(
        element('span', 'study__counts', parts.length > 0 ? parts.join(', ') : t('study.nothingToComplain')),
      );
      verdict.append(row);
    }

    verdict.append(
      element(
        'p',
        'study__caveat',
        t('study.caveat'),
      ),
    );

    moveList.setAnnotations(
      analysis.moves.map((move: AnalysedMove) => ({
        mark: WORDS[move.judgement].mark,
        kind: move.judgement,
      })),
    );
  }

  /* ------------------------------------------------------------------ running it */

  let worker: Worker | null = null;

  analyse.addEventListener('click', () => {
    if (worker) return;
    analyse.hidden = true;
    progress.hidden = false;
    fill.style.width = '0%';

    /*
     * The worker is created from a module URL rather than a blob.
     *
     * It is the form the bundler understands, so the worker gets its own chunk with the engine in
     * it — which also means the engine is not in the main bundle at all and is fetched the first
     * time somebody actually asks for an analysis.
     */
    worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });

    worker.addEventListener('message', (event: MessageEvent<AnalysisMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        const share = Math.round((message.done / Math.max(1, message.total)) * 100);
        fill.style.width = `${share}%`;
        progressText.textContent = t('study.lookingProgress', { done: message.done, total: message.total });
        return;
      }

      stop();
      if (message.type === 'failed') {
        progress.hidden = true;
        analyse.hidden = false;
        problem.hidden = false;
        problem.textContent = t('study.analysisFailed', { detail: message.message });
        return;
      }

      // This listener is the whole-game one. A single-move judgement arrives on its own listener,
      // attached by Try Again, and must not be mistaken for a finished report.
      if (message.type !== 'done') return;

      analysis = message.analysis;
      progress.hidden = true;
      paintVerdict();
      draw();
      board.announce(t('study.reviewed'));
    });

    worker.postMessage({ moves: [...moves] } satisfies { moves: string[] });
  });

  function stop(): void {
    worker?.terminate();
    worker = null;
  }

  /*
   * Nothing outlives the screen.
   *
   * A worker left running against a screen nobody is looking at keeps a core busy and a phone warm.
   * `main.ts` calls this when it routes away.
   */
  (el as HTMLElement & { destroy?: () => void }).destroy = stop;

  /* ------------------------------------------------------------------ opening a game */

  function load(loaded: string[], title: string): void {
    problem.hidden = true;
    moves.length = 0;
    moves.push(...loaded);
    viewing = null;
    analysis = null;
    verdict.hidden = true;
    detail.hidden = true;
    progress.hidden = true;
    evalBar.hidden = true;
    analyse.hidden = false;
    stop();

    heading.textContent = title;
    moveList.setMoves(moves);
    moveList.setAnnotations(null);
    moveList.setViewing(null);
    viewer.hidden = false;
    draw();
  }

  open.addEventListener('click', () => {
    const result = fromPgn(box.value);
    if (!result.ok) {
      problem.hidden = false;
      problem.textContent = result.message;
      viewer.hidden = true;
      return;
    }

    /*
     * Whatever provenance the file arrived with is kept and shown.
     *
     * A game from a real tournament carries the players' names and the event; throwing that away and
     * showing a bare board would make an imported game less than it was when it arrived.
     */
    const tags = result.game.tags;
    const players =
      tags['White'] && tags['Black']
        ? t('study.playersVs', { white: tags['White'], black: tags['Black'] })
        : t('study.animported');
    const where = tags['Event'] && tags['Event'] !== '?' ? ` · ${tags['Event']}` : '';
    const count = Math.ceil(result.game.moves.length / 2);
    load(result.game.moves, t('study.heading', { players: `${players}${where}`, moves: count }));
    board.announce(t('study.loaded', { plies: result.game.moves.length }));
  });

  /*
   * A game handed over from one that just finished skips the paste box entirely.
   *
   * This is the path almost everybody takes: a game ends, they tap "See where it went wrong", and
   * the board they were just looking at is here with a button under it. Making them copy a PGN into
   * their own app would be absurd.
   */
  const handed = takeGame();
  if (handed) {
    box.hidden = true;
    open.hidden = true;
    note.textContent =
      t('study.handedNote');
    load(handed.moves, handed.title);
  }

  return el;
}
