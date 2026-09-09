/**
 * The puzzle screen — daily, training, Storm and Streak.
 *
 * **The retention loop** (`SPEC.md` H1, P4), and the honest answer to the Tuesday problem: nobody
 * wants a twenty-minute game every day, and almost everybody wants one puzzle. Four modes, one
 * screen, because they differ only in what happens when you get one right or wrong:
 *
 *  - **Daily** — the same puzzle for everybody, once a day. It is the one worth mentioning to
 *    somebody else, which is why it is not matched to your rating.
 *  - **Train** — endless, matched to your puzzle rating, which moves as you go.
 *  - **Storm** — three minutes, as many as possible. A wrong move costs time rather than ending it.
 *  - **Streak** — no clock, and it ends the first time you are wrong.
 *
 * Two decisions worth stating, because both were choices rather than defaults:
 *
 * **The opponent's blunder is animated, never pre-applied on screen.** Lichess states a puzzle from
 * the position before the mistake, and seeing that move land is how a solver understands what
 * changed. Showing the position already-moved throws away the most useful half-second in the format.
 *
 * **A wrong move says what was wrong, and offers the answer.** A puzzle trainer that only says "no"
 * teaches nothing, and one that shows the answer immediately teaches nothing either. It says no,
 * lets you try again where the mode allows it, and the answer is always one tap away.
 */

import { createBoard, type Square } from './board.ts';
import { explainFailure } from './failures.ts';
import { ApiError } from './online.ts';
import { claimReward, explainRefusal, formatNim, poolStatus, type PoolStatus } from './pool-client.ts';
import { connect, deviceIdentifier, rememberedAddress, tier } from './wallet.ts';
import { haptic, play, playMoveSound } from './sound.ts';
import { settings } from './settings.ts';
import {
  completeDaily,
  liveStreakDays,
  progress,
  seenSet,
  updateProgress,
} from './puzzle-progress.ts';
import {
  dailyPuzzle,
  dayKey,
  loadPuzzles,
  nextPuzzleRating,
  puzzleId,
  shortPuzzleId,
  puzzleNear,
  TRAINABLE_THEMES,
  startPuzzle,
  type Puzzle,
  type PuzzleRun,
} from './puzzles.ts';
import { t } from './i18n.ts';
import { Chess } from 'chess.js';
import { asPuzzle } from '@scoresheet/core';
import { ownPuzzles, retirePuzzle } from './own-puzzle-store.ts';
import { TIP_AMOUNTS, poolMemo, sendNim } from './send-nim.ts';
import { recordToday } from './today.ts';
import { createWitnessedRun, type WitnessedRun } from './witnessed-run.ts';
import { puzzleRatingFor } from './puzzle-cards.ts';

export type PuzzleMode = 'daily' | 'train' | 'storm' | 'streak' | 'mine';

/** Storm's clock. Three minutes is Lichess's number and it is right: long enough to warm up. */
const STORM_SECONDS = 180;
/** What a wrong move costs in Storm. Losing the run outright would make it Streak with a clock. */
const STORM_PENALTY_SECONDS = 10;

/**
 * How many puzzles one witnessed run covers.
 *
 * One signature pays for all of them, so this is really a question about how often somebody should
 * be asked to sign. Five is a few minutes of training — long enough that signing is rare, short
 * enough that leaving halfway does not throw away much.
 */
const RATED_RUN_LENGTH = 5;

export interface PuzzleScreenOptions {
  mode: PuzzleMode;
  /** Train one idea — a fork, a back-rank mate — rather than whatever comes next. */
  theme?: string | undefined;
  /** Leave the screen. */
  onBack: () => void;
}

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

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', 'btn', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** `backRankMate` → `back rank mate`. The themes are camelCase in the data and prose on screen. */
export function readableTheme(theme: string): string {
  return theme
    .replace(/([A-Z])/g, ' $1')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .toLowerCase()
    .trim();
}

export function createPuzzleScreen(options: PuzzleScreenOptions): HTMLElement {
  const el = element('div', `puzzles puzzles--${options.mode}`);

  /*
   * No Back button: the navigation is global now.
   *
   * Every screen used to carry its own "Back to the board", which was the only way out when the nav
   * lived inside the bot-game screen. With three sections above every screen it is a second control
   * doing the same job in a different place — and two ways to do one thing is how a small app starts
   * feeling like a big one.
   */

  const themeKey = TRAINABLE_THEMES.find((entry) => entry.theme === options.theme)?.key;
  const title = element(
    'h1',
    'puzzles__title',
    // Named on the screen when training one idea, so it is obvious *why* every puzzle looks the same.
    t(
      themeKey ??
        ({
          daily: 'puzzles.daily',
          train: 'puzzles.title',
          storm: 'puzzles.storm',
          streak: 'puzzles.streak',
          mine: 'puzzles.mine',
        } as const)[options.mode],
    ),
  );

  const scoreLine = element('p', 'puzzles__score');
  scoreLine.setAttribute('role', 'status');

  const prompt = element('p', 'puzzles__prompt');
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'polite');

  const themeLine = element('p', 'puzzles__themes');
  const actions = element('div', 'puzzles__actions');

  el.append(title, scoreLine, prompt, themeLine, actions);

  /* ------------------------------------------------------------------ state */

  let puzzles: Puzzle[] = [];
  let puzzle: Puzzle | null = null;
  let run: PuzzleRun | null = null;
  /** Locked while the opponent's move is animating, so a tap cannot land on a stale position. */
  let busy = true;
  let finished = false;

  /*
   * The witnessed run, when there is one.
   *
   * `SPEC.md`'s solo-rating problem in one variable: without this, a puzzle rating is a number this
   * browser keeps about itself (`puzzle-progress.ts` says so on its face), and the only rating the
   * product could actually stand behind needed a second person with a Nimiq wallet. With it, the
   * server chooses the puzzles and countersigns the result, and somebody playing alone holds a
   * rating nobody can revoke.
   *
   * It stays null for Storm and Streak. Those are scores against a clock, not tests of strength at
   * a level — Lichess does not rate them either, and rating them would mean rating speed.
   */
  let witnessed: WitnessedRun | null = null;
  /**
   * The rating from signed cards, when this wallet has any. Null means there are none yet.
   *
   * Read rather than accumulated: `puzzleRatingFor` replays the cards, which is the same thing a
   * stranger's browser does on the record page. A screen that kept a running total would be a second
   * opinion about a number that is supposed to have exactly one source.
   */
  let signedRating: number | null = null;

  let solvedThisRun = 0;
  let stormLeft = STORM_SECONDS;
  let clock: number | null = null;

  const board = createBoard({
    legalMoves(from: Square) {
      if (!run || busy || finished) return [];
      if (run.chess.turn() !== run.side) return [];
      return run.chess.moves({ square: from as never, verbose: true }).map((move) => move.to);
    },
    onMove(move) {
      if (!run || busy || finished) return false;
      return judge(move.from, move.to, move.promotion);
    },
    autoQueen: () => settings().autoQueen,
  });
  // The board goes above everything but the title, and it is inserted rather than appended so the
  // header lines stay in reading order above it.
  el.insertBefore(board.el, prompt);

  /* ------------------------------------------------------------------ rendering */

  function showScore(): void {
    const saved = progress();
    if (options.mode === 'storm') {
      const minutes = Math.floor(stormLeft / 60);
      const seconds = String(Math.max(0, stormLeft % 60)).padStart(2, '0');
      scoreLine.textContent = t('puzzles.stormScore', {
        solved: solvedThisRun,
        left: `${minutes}:${seconds}`,
        best: saved.bestStorm,
      });
    } else if (options.mode === 'streak') {
      scoreLine.textContent = t('puzzles.streakScore', { solved: solvedThisRun, best: saved.bestStreak });
    } else if (options.mode === 'train') {
      /*
       * Two different numbers, and conflating them would be the dishonest thing to do.
       *
       * A witnessed run shows the rating that is actually signed and how far through the run you
       * are. Everything else shows this device's own number, which `puzzle-progress.ts` is explicit
       * about being a difficulty dial rather than a record.
       */
      if (witnessed?.open) {
        scoreLine.textContent = `Rated run · ${witnessed.answered + 1} of ${witnessed.answered + witnessed.remaining} · from ${witnessed.ratingBefore}`;
      } else if (signedRating !== null) {
        /*
         * Once a run is signed the rating is signed, and saying "on this device only" underneath the
         * words "Run signed" is a straight contradiction — which is exactly what it said before this
         * line existed. The device's own number is still kept; it is simply no longer the one worth
         * showing to somebody who now has a better one.
         */
        scoreLine.textContent = `Puzzle rating ${signedRating} · signed`;
      } else {
        scoreLine.textContent = t('puzzles.trainScore', { rating: saved.rating });
      }
    } else {
      const days = liveStreakDays(dayKey());
      scoreLine.textContent =
        days > 0
          ? t(days === 1 ? 'puzzles.oneDayRun' : 'puzzles.dayRun', { days })
          : t('puzzles.startARun');
    }
  }

  function draw(): void {
    if (!run) return;
    board.setPosition(run.chess.fen());
    board.setOrientation(run.side);
    board.setPlaying(busy || finished ? null : run.side);
    board.setCheck(checkSquare());
    showScore();
  }

  function checkSquare(): Square | null {
    if (!run?.chess.isCheck()) return null;
    const turn = run.chess.turn();
    for (const row of run.chess.board()) {
      for (const square of row) {
        if (square?.type === 'k' && square.color === turn) return square.square as Square;
      }
    }
    return null;
  }

  function say(message: string, tone: 'ask' | 'good' | 'bad' = 'ask'): void {
    prompt.textContent = message;
    prompt.className = `puzzles__prompt puzzles__prompt--${tone}`;
    board.announce(message);
  }

  /* ------------------------------------------------------------------ the loop */

  async function nextPuzzle(): Promise<void> {
    busy = true;
    finished = false;
    actions.replaceChildren();

    const saved = progress();
    /*
     * **While a run is witnessed, the puzzles come from the witness and this screen does not choose.**
     *
     * That is the whole mechanism, not a detail: a client that picks its own puzzles picks the
     * easiest in the set, and the rating stops meaning anything. `witnessed-run.ts` holds the served
     * order and `witness.ts` refuses results that are not it, so choosing here would simply fail at
     * the end of the run instead of at the point of the mistake.
     */
    if (witnessed?.open) {
      puzzle = witnessed.next();
      if (!puzzle) {
        await settleRun();
        return;
      }
    } else {
      if (options.mode === 'mine') {
        /*
         * Your own mistakes, dearest first.
         *
         * Shaped by `asPuzzle` into exactly what every other mode plays, so nothing below this line
         * has to know where the position came from — one code path through the solving screen, which
         * is the only way two of them do not drift apart.
         */
        const mine = ownPuzzles();
        puzzle = mine.length > 0 ? asPuzzle(mine[0]!) : null;
      } else {
        puzzle =
          options.mode === 'daily'
            ? dailyPuzzle(puzzles)
            : puzzleNear(puzzles, targetRating(), seenSet(), Math.random, options.theme);
      }
    }

    if (!puzzle) {
      /*
       * Running out of your own mistakes is finishing, not failing.
       *
       * The generic message here reads "No puzzle could be loaded. That is our bug, not yours." —
       * which is right when the bundled set fails to load and exactly wrong when somebody has just
       * worked through every position they got wrong. The browser check caught it saying that to a
       * player who had done everything asked of them.
       */
      if (options.mode === 'mine') {
        say(t('puzzles.mineDone'), 'good');
        return;
      }
      say(t('puzzles.noPuzzle'), 'bad');
      return;
    }

    // Remembered before it is solved, so abandoning one does not bring it straight back.
    if (options.mode !== 'daily') {
      updateProgress({ seen: [...saved.seen, puzzleId(puzzle)] });
    }

    run = startPuzzle(puzzle);
    // Re-offered with each puzzle, because `nextPuzzle` clears the actions row above. Added once at
    // start-up it would be wiped by the first puzzle it was meant to accompany.
    offerToRate();
    themeLine.textContent =
      puzzle.themes.length > 0
        ? t('puzzles.themesAndRating', {
            themes: puzzle.themes.slice(0, 3).map(readableTheme).join(' · '),
            rating: puzzle.rating,
          })
        : t('puzzles.ratingOnly', { rating: puzzle.rating });

    /*
     * The blunder is shown *landing*, from the position before it.
     *
     * `startPuzzle` has already applied it, so the board is briefly rewound to the original FEN, the
     * move is highlighted, and then the real position appears. That half-second is how a solver sees
     * what changed — which is most of what a puzzle is asking about.
     */
    board.setPosition(puzzle.fen);
    board.setOrientation(run.side);
    board.setPlaying(null);
    board.setLastMove(null, null);
    say(t('puzzles.watchTheirMove'));
    showScore();

    await new Promise((resolve) => window.setTimeout(resolve, 450));
    board.setPosition(run.chess.fen());
    board.setLastMove(run.opening.from as Square, run.opening.to as Square);
    playMoveSound('x');

    busy = false;
    draw();
    say(t(run.side === 'w' ? 'puzzles.whiteToPlay' : 'puzzles.blackToPlay'));
  }

  /** The signed puzzle rating for a wallet, or null when it has no cards yet. */
  function ratingOf(address: string): number | null {
    const found = puzzleRatingFor(address);
    return found.runs > 0 ? found.rating : null;
  }

  function targetRating(): number {
    // Storm and Streak are about flow, so they sit a little below the training rating: the format
    // rewards speed and certainty, and a run that stalls on move three is not a run.
    // The signed rating is the better estimate of strength when it exists, and it is the one the
    // witness is told about, so choosing puzzles from a different number would serve the wrong level.
    const rating = signedRating ?? progress().rating;
    return options.mode === 'train' ? rating : Math.max(600, rating - 200);
  }

  function judge(from: string, to: string, promotion?: string): boolean {
    if (!run) return false;
    const verdict = run.attempt(from, to, promotion);

    if (verdict === 'wrong') {
      onWrong();
      return false;
    }

    playMoveSound(verdict === 'solved' ? '#' : 'x');
    const played = run.chess.history({ verbose: true });
    const last = played[played.length - 1];
    board.setLastMove((last?.from ?? null) as Square | null, (last?.to ?? null) as Square | null);
    draw();

    if (verdict === 'solved') {
      if (options.mode === 'mine' && puzzle) {
        /*
         * Solved, so it leaves the queue.
         *
         * A training queue that never drains is a list of reproaches. It is retired on the position
         * the puzzle actually asks about — the one *after* the setup move — because that is the key
         * it was stored under.
         */
        const board = new Chess(puzzle.fen);
        try {
          const setup = puzzle.moves[0]!;
          board.move({
            from: setup.slice(0, 2),
            to: setup.slice(2, 4),
            ...(setup[4] ? { promotion: setup[4] } : {}),
          });
          retirePuzzle(board.fen());
        } catch {
          // The setup move should always replay. If it somehow does not, leaving the puzzle in the
          // queue is the safe failure: it can be solved again, which is far better than losing it.
        }
      }
      recordToday({ puzzles: 1 });
      onSolved();
    }
    else say(t('puzzles.rightKeepGoing'), 'good');
    return true;
  }

  /**
   * Finish a witnessed run: hand the answers back, get both signatures, keep the card.
   *
   * The wallet is asked here and never at the start, which is the rule the whole app follows — solve
   * first, connect only when there is something worth signing. Declining costs the rating for this
   * run and nothing else, and the sentence says exactly that rather than reading as a failure.
   */
  async function settleRun(): Promise<void> {
    if (!witnessed) return;
    const started = witnessed.ratingBefore;

    say(t('puzzles.signing'));
    const outcome = await witnessed.settle();
    witnessed = null;

    if (!outcome) {
      // Nothing was answered. Not worth a sentence — the person simply left.
      finished = true;
      return;
    }

    finished = true;
    board.setPlaying(null);

    if (outcome.ok) {
      // Re-read rather than assumed from the outcome: the record page derives it this way too, so a
      // disagreement between this screen and that one is impossible by construction.
      const me = rememberedAddress();
      if (me) signedRating = ratingOf(me);
      const moved = outcome.rating - started;
      const change = moved === 0 ? 'unchanged' : `${moved > 0 ? '+' : ''}${moved}`;
      say(`Run signed. Your puzzle rating is ${outcome.rating} (${change}).`, 'good');
    } else {
      say(outcome.message, outcome.tone === 'bad' ? 'bad' : 'ask');
    }

    showScore();
    actions.replaceChildren(
      button('Another run', () => {
        solvedThisRun = 0;
        finished = false;
        void beginRun().then(() => nextPuzzle());
      }),
      button(t('puzzles.seeRecord'), () => {
        window.history.pushState({}, '', '/r/' + (rememberedAddress() ?? ''));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }),
    );
  }

  /**
   * Offer to make these runs count, for somebody who has not connected a wallet.
   *
   * Deliberately an offer and not a gate. The puzzles work, the practice is real, and the only thing
   * missing is a rating — so this is one button on a screen that is already useful, rather than a
   * wall in front of it. It appears only where a run *could* be rated: Storm and Streak are scores
   * against a clock and are not rated at all.
   */
  function offerToRate(): void {
    if (options.mode !== 'train' && options.mode !== 'daily') return;
    if (witnessed?.open || rememberedAddress()) return;

    const rate = button(t('puzzles.makeCount'), () => {
      void (async () => {
        await beginRun(true);
        if (witnessed?.open) {
          solvedThisRun = 0;
          finished = false;
          await nextPuzzle();
        }
      })();
    });
    rate.dataset['action'] = 'rate-runs';
    actions.append(rate);
  }

  /**
   * Ask the witness for a run, if one can be had.
   *
   * Every reason it cannot — no wallet, no server, offline, no witness key — lands in the same
   * place, and it is the honest one: the puzzles still work and simply do not rate. Nothing is said
   * about it here, because "this run is not rated" is a fact for the score line, not an error.
   */
  async function beginRun(connectFirst = false): Promise<void> {
    if (options.mode !== 'train' && options.mode !== 'daily') return;

    /*
     * The wallet is *remembered*, never asked for on arrival.
     *
     * The rule the whole app follows is that a stranger plays first and connects only when there is
     * something worth signing, and a puzzle screen that opened a wallet prompt would break it on the
     * one screen most likely to be somebody's first. So a run is rated automatically for anybody who
     * has connected before, and everybody else is offered the choice — see `offerToRate`.
     */
    let me = rememberedAddress();
    if (me) signedRating = ratingOf(me);
    if (!me && connectFirst) {
      try {
        me = await connect();
      } catch {
        return;
      }
    }
    if (!me) return;
    signedRating = ratingOf(me);

    const run = createWitnessedRun({
      address: me,
      mode: options.mode === 'daily' ? 'daily' : options.theme ? 'themed' : 'training',
      count: options.mode === 'daily' ? 1 : RATED_RUN_LENGTH,
      theme: options.theme,
      day: options.mode === 'daily' ? dayKey() : undefined,
      byId: new Map(puzzles.map((one) => [puzzleId(one), one])),
      seen: options.mode === 'daily' ? undefined : progress().seen,
    });

    witnessed = (await run.begin()) ? run : null;
  }

  function onSolved(): void {
    solvedThisRun += 1;
    haptic(12);
    play('end');
    // Recorded before anything else can navigate away: the run is what the witness will sign.
    witnessed?.record(true);

    const saved = progress();
    const changes: Parameters<typeof updateProgress>[0] = { solved: saved.solved + 1 };

    /*
     * The device's own number moves only when the run is *not* witnessed.
     *
     * Otherwise two ratings walk apart: this one counts every retry the screen allows, and the card
     * counts the first answer only. Showing whichever happened to be higher would be the dishonest
     * kind of coincidence — and they agreed by luck the first time this ran, which is how a bug like
     * that survives a test.
     */
    if (options.mode === 'train' && puzzle && !witnessed?.open) {
      changes.rating = nextPuzzleRating(saved.rating, puzzle.rating, true);
    }
    if (options.mode === 'streak') changes.bestStreak = Math.max(saved.bestStreak, solvedThisRun);
    if (options.mode === 'storm') changes.bestStorm = Math.max(saved.bestStorm, solvedThisRun);
    updateProgress(changes);

    if (options.mode === 'daily') {
      completeDaily(dayKey());
      finished = true;
      // A daily is one puzzle, so the run is over the moment it is solved: there is no next puzzle
      // for `nextPuzzle` to run out of, which is what settles a training run.
      if (witnessed?.open) void settleRun();
      say(t('puzzles.solvedToday'), 'good');
      showScore();
      actions.replaceChildren(
        button(t('puzzles.trainOnMore'), () => {
          window.history.pushState({}, '', '/puzzles/train');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }),
        button(t('common.backToBoard'), options.onBack),
      );
      // The one moment in the app where solving a puzzle turns into real money.
      void offerReward();
      return;
    }

    say(t('puzzles.solved'), 'good');
    showScore();
    void nextPuzzle();
  }

  function onWrong(): void {
    if (!run || !puzzle) return;
    haptic([10, 40, 10]);
    /*
     * A wrong move ends the puzzle for the witness even where the screen lets you try again.
     *
     * Retrying is right for learning and wrong for rating — a puzzle you got on the third go is not
     * a puzzle you saw. So the attempt is recorded here, once, and the extra tries that follow are
     * practice rather than evidence.
     */
    witnessed?.record(false);

    const saved = progress();
    const changes: Parameters<typeof updateProgress>[0] = { failed: saved.failed + 1 };
    if (options.mode === 'train' && !witnessed?.open) {
      changes.rating = nextPuzzleRating(saved.rating, puzzle.rating, false);
    }
    updateProgress(changes);

    if (options.mode === 'streak') {
      finished = true;
      board.setPlaying(null);
      say(t('puzzles.runEnds', { solved: solvedThisRun }), 'bad');
      showScore();
      offerAnswer(t('puzzles.anotherRun'), () => {
        solvedThisRun = 0;
        void nextPuzzle();
      });
      return;
    }

    if (options.mode === 'storm') {
      // Time, not the run. Ending it outright would make Storm into Streak with a clock on top.
      stormLeft = Math.max(0, stormLeft - STORM_PENALTY_SECONDS);
      say(t('puzzles.stormPenalty', { seconds: STORM_PENALTY_SECONDS }), 'bad');
      showScore();
      void nextPuzzle();
      return;
    }

    say(t('puzzles.tryAgain'), 'bad');
    offerAnswer(t('puzzles.skip'), () => void nextPuzzle());
  }

  /**
   * Offer the answer, and a way onward.
   *
   * Always available and never automatic. Showing it immediately teaches nothing; withholding it
   * leaves somebody stuck on a puzzle they were never going to get, which is how a session ends.
   */
  function offerAnswer(onwardLabel: string, onward: () => void): void {
    const show = button(t('puzzles.showAnswer'), () => {
      if (!run) return;
      const answer = run.expectedSan();
      run.playExpected();
      busy = true;
      draw();
      say(answer ? t('puzzles.theMoveWas', { move: answer }) : t('puzzles.thatIsTheLine'), 'ask');
      show.disabled = true;
    });
    actions.replaceChildren(show, button(onwardLabel, onward));
  }


  /* ------------------------------------------------------------------ the pool */

  /**
   * Offer the day's NIM, once the daily puzzle is solved.
   *
   * `SPEC.md` K7 and P2. This is the path that puts NIM in the hands of somebody who did not have a
   * wallet, and it is the most persuasive minute in the app: solve a puzzle, and real money arrives
   * with the puzzle's own id written into the transaction.
   *
   * The rules it obeys, in order of how badly each one would hurt to break:
   *
   *  - **Nothing is offered that cannot be delivered.** An unfunded pool, or a day whose budget is
   *    spent, says so instead of showing a button that fails when pressed.
   *  - **A wallet is asked for here and nowhere earlier.** Somebody arrives, solves a puzzle, and is
   *    *then* told there is money in it — which is the order that makes a wallet worth having, and
   *    the opposite of a permission prompt in front of a stranger.
   *  - **"Paid" is never said unless something was sent.** The server distinguishes a recorded claim
   *    from a broadcast transaction, and so does this.
   */
  async function offerReward(): Promise<void> {
    if (options.mode !== 'daily' || !puzzle) return;

    const today = dayKey();
    let status: PoolStatus;
    try {
      status = await poolStatus(today);
    } catch {
      // The pool is a bonus on top of a solved puzzle. If it cannot be reached, the puzzle screen
      // does not become an error screen — it simply says nothing about it.
      return;
    }

    const reward = element('div', 'puzzles__reward');
    const line = element('p', 'puzzles__reward-line');
    reward.append(line);

    if (!status.funded || status.remainingTodayLuna < status.rewardLuna) {
      /*
       * Honest about an empty pool, and specific about why.
       *
       * "The pool refills tomorrow rather than running out" is the whole of K7 in one sentence: the
       * NIM is staked, payouts come from the rewards, and the principal is never touched. Saying it
       * here, at the moment somebody would otherwise be disappointed, is where it lands.
       */
      line.textContent = t(status.funded ? 'pool.allClaimed' : 'pool.notFunded');
      /*
       * And an empty pool is exactly the moment to offer to fill it.
       *
       * Somebody who has just solved the puzzle and been told there is nothing left is the person
       * most likely to put something in — and the pool had no way to receive anything at all until
       * now: every transaction in this app came *from* it.
       */
      reward.append(poolTopUp(status, today));
      actions.append(reward);
      return;
    }

    line.textContent = t('pool.thereIs', { amount: formatNim(status.rewardLuna) });

    const claim = button(t('pool.claim', { amount: formatNim(status.rewardLuna) }), () => void takeIt());
    claim.classList.add('btn--primary');
    claim.dataset['action'] = 'claim-reward';
    reward.append(claim);
    reward.append(poolTopUp(status, today));
    actions.append(reward);

    async function takeIt(): Promise<void> {
      claim.disabled = true;
      claim.textContent = t('pool.claiming');

      const address = rememberedAddress() ?? (tier() === 'none' ? null : await connect().catch(() => null));
      if (!address) {
        claim.remove();
        line.textContent = t('pool.needsWallet');
        return;
      }

      /*
       * The device identifier, which is what the limit actually rests on.
       *
       * Wallets are free and unlimited, so one claim per address is no limit at all. Nimiq's own
       * Device Identifier API returns an anonymous per-device handle — not a person, not an identity,
       * and the same value to everybody sharing a phone, which is a real cost and the right trade for
       * something giving away money.
       */
      const device = await deviceIdentifier(t('pool.deviceReason'));
      if (!device) {
        claim.remove();
        line.textContent = explainRefusal('no-device');
        return;
      }

      try {
        const result = await claimReward({ address, device, day: today, puzzleId: shortPuzzleId(puzzle!) });
        claim.remove();
        play('end');
        haptic(14);
        line.className = 'puzzles__reward-line puzzles__reward-line--paid';
        line.textContent = t(result.hash ? 'pool.sent' : 'pool.recorded', {
          amount: formatNim(result.amount),
        });
      } catch (error) {
        claim.disabled = false;
        claim.textContent = t('pool.claim', { amount: formatNim(status.rewardLuna) });
        line.textContent =
          error instanceof ApiError ? explainRefusal(error.code) : explainFailure(error).message;
        if (error instanceof ApiError && error.code !== 'offline') claim.remove();
      }
    }
  }

  /**
   * Put NIM into the pool, from the player's own wallet.
   *
   * The pool gives money to strangers who solve the daily puzzle, and until now it could only ever
   * be funded by the builder. This is the other direction: a receiving address, published by the
   * server, and a transaction the player's own wallet signs and confirms.
   *
   * Folded closed by default. Somebody who came here to solve a puzzle is not here to be asked for
   * money, and an open donation panel under every puzzle would read as one.
   */
  function poolTopUp(status: PoolStatus, day: string): HTMLElement {
    const box = element('details', 'puzzles__topup');
    if (!status.address || tier() === 'none') return box;

    box.append(element('summary', 'puzzles__topup-summary', t('send.poolTitle')));
    // Its own class, not the reward line's. Sharing one made three elements answer to the same
    // selector and broke the check that reads what the pool is offering today.
    box.append(element('p', 'puzzles__topup-line', t('send.poolNote')));

    const line = element('p', 'puzzles__topup-line');
    line.setAttribute('role', 'status');
    line.hidden = true;

    const buttons = element('div', 'puzzles__topup-amounts');
    for (const amount of TIP_AMOUNTS) {
      const give = button(t('send.poolAdd', { amount }), () => {
        for (const node of buttons.children) (node as HTMLButtonElement).disabled = true;
        give.textContent = t('send.sending');
        line.hidden = true;

        void sendNim({ to: status.address!, nim: amount, memo: poolMemo(day) }).then((outcome) => {
          line.hidden = false;
          if (outcome.ok) {
            play('end');
            haptic(14);
            buttons.remove();
            line.className = 'puzzles__topup-line puzzles__topup-line--paid';
            line.textContent = t('send.poolSent', { amount });
            return;
          }
          for (const node of buttons.children) (node as HTMLButtonElement).disabled = false;
          give.textContent = t('send.poolAdd', { amount });
          line.textContent = outcome.message;
        });
      });
      give.dataset['topup'] = String(amount);
      buttons.append(give);
    }

    box.append(buttons, line);
    return box;
  }

  /* ------------------------------------------------------------------ Storm's clock */

  function startClock(): void {
    if (options.mode !== 'storm') return;
    clock = window.setInterval(() => {
      stormLeft -= 1;
      showScore();
      if (stormLeft <= 0) {
        stopClock();
        finished = true;
        board.setPlaying(null);
        play('end');
        say(t('puzzles.timeUp', { solved: solvedThisRun }), 'good');
        actions.replaceChildren(
          button(t('puzzles.runItAgain'), () => {
            solvedThisRun = 0;
            stormLeft = STORM_SECONDS;
            startClock();
            void nextPuzzle();
          }),
          button(t('common.backToBoard'), options.onBack),
        );
      }
    }, 1000);
  }

  function stopClock(): void {
    if (clock !== null) window.clearInterval(clock);
    clock = null;
  }

  /*
   * The clock must not outlive the screen.
   *
   * A route away from a running Storm would otherwise leave an interval ticking against a detached
   * board forever — the classic leak, invisible until the tab has been open an hour. `main.ts` calls
   * this when it replaces the screen.
   */
  (el as HTMLElement & { destroy?: () => void }).destroy = stopClock;

  /* ------------------------------------------------------------------ start */

  say(t('puzzles.loading'));
  void (async () => {
    try {
      puzzles = await loadPuzzles();
    } catch (error) {
      /*
       * The puzzle file is a separate 442 KB chunk, so this is the one screen where a failed dynamic
       * import is likely — a stale tab after a deploy, or a connection that dropped mid-download.
       * `explainFailure` knows the difference between that and a dead network, and the advice
       * differs: one is fixed by reloading and the other by waiting.
       */
      say(explainFailure(error).message, explainFailure(error).tone === 'bad' ? 'bad' : 'ask');
      return;
    }

    if (options.mode === 'daily' && progress().dailyDone === dayKey()) {
      // Already done today. Say so plainly and offer the thing they probably want instead, rather
      // than serving the same puzzle again as though nothing had happened.
      finished = true;
      const today = dailyPuzzle(puzzles);
      if (today) {
        const shown = startPuzzle(today);
        board.setPosition(shown.chess.fen());
        board.setOrientation(shown.side);
        board.setPlaying(null);
      }
      say(t('puzzles.dailyDoneNote'), 'good');
      showScore();
      actions.replaceChildren(
        button(t('puzzles.trainMore'), () => {
          window.history.pushState({}, '', '/puzzles/train');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }),
        button(t('puzzles.backToBoard'), options.onBack),
      );
      return;
    }

    /*
     * The run is asked for *before* the first puzzle, because a witnessed run decides which puzzle
     * that is. Asking after would mean showing one this screen chose and then replacing it, which
     * looks like a bug and is one.
     */
    await beginRun();

    startClock();
    await nextPuzzle();
  })();

  return el;
}
