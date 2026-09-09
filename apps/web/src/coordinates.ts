/**
 * The coordinate trainer — `SPEC.md` H5.
 *
 * Knowing where `f6` is without counting is the skill every chess book, every video and every
 * conversation about chess assumes you already have, and it is the one thing a beginner can get
 * measurably better at in an afternoon. Lichess has had a trainer for it for years, and this is
 * built to the same definition — taken from `lila/translation/source/coordinates.xml`, which states
 * it in their own words rather than leaving it to be guessed:
 *
 *   - *"A coordinate appears on the board and you must click on the corresponding square."*
 *   - *"A square is highlighted on the board and you must enter its coordinate."*
 *   - *"You have 30 seconds to correctly map as many squares as possible!"*
 *   - *"Go as long as you want, there is no time limit!"*
 *   - **Average score as white**, and **average score as black**, reported separately.
 *
 * ## The two decisions that are ours
 *
 *  1. **Naming a square is two taps, not a keyboard.** Lichess's "name square" mode takes typed
 *     input, which on a phone means the keyboard covering half the board — the half with the answer
 *     on it. A file pad and a rank pad under the board is the same exercise without the obstruction.
 *  2. **The orientation is chosen, and random is the default.** Practising only from White's side is
 *     how a player ends up unable to read a board from Black's, which is precisely the weakness the
 *     separate averages exist to expose.
 */

const FILES = 'abcdefgh';
const RANKS = '12345678';

/** How long a timed run lasts. Lichess's thirty seconds, and it is the right number. */
export const RUN_SECONDS = 30;

export type CoordMode = 'find' | 'name';
export type CoordSide = 'w' | 'b' | 'random';

export interface CoordRun {
  /** The square being asked about, as `e4`. */
  readonly square: string;
  /** Which way the board is facing for this run. `random` is resolved once, at the start. */
  readonly side: 'w' | 'b';
  readonly correct: number;
  readonly wrong: number;
  /** Answer with a square name. Returns whether it was right, and moves on either way. */
  answer: (square: string) => boolean;
}

/** Every square, in order, so a caller can build a board without knowing this file's business. */
export function allSquares(): string[] {
  const squares: string[] = [];
  for (const file of FILES) for (const rank of RANKS) squares.push(file + rank);
  return squares;
}

/**
 * A square that is not the one just asked.
 *
 * Repeating a square immediately makes the next answer free, which is the one way a trainer can
 * flatter somebody: two correct answers for one piece of knowledge.
 */
export function nextSquare(previous: string | null, random: () => number = Math.random): string {
  const squares = allSquares().filter((square) => square !== previous);
  return squares[Math.floor(random() * squares.length)] ?? 'e4';
}

export function startRun(options: { side: CoordSide; random?: () => number }): CoordRun {
  const random = options.random ?? Math.random;
  const side: 'w' | 'b' = options.side === 'random' ? (random() < 0.5 ? 'w' : 'b') : options.side;

  let square = nextSquare(null, random);
  let correct = 0;
  let wrong = 0;

  return {
    get square() {
      return square;
    },
    side,
    get correct() {
      return correct;
    },
    get wrong() {
      return wrong;
    },
    answer(given) {
      const right = given === square;
      if (right) correct += 1;
      else wrong += 1;
      /*
       * The square changes whether the answer was right or wrong.
       *
       * Staying on a square until it is answered correctly turns a timed run into a wall: somebody
       * who cannot find `b7` loses the whole thirty seconds to it and learns nothing about the other
       * sixty-three squares. Moving on is what keeps the exercise a *scan* rather than a puzzle.
       */
      square = nextSquare(square, random);
      return right;
    },
  };
}

/** An average, to one decimal, or `null` when there is nothing to average yet. */
export function averageScore(total: number, runs: number): number | null {
  if (runs <= 0) return null;
  return Math.round((total / runs) * 10) / 10;
}
