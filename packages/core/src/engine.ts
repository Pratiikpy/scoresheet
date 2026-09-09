/**
 * The opponent that is always there — the roster, the opening book, and the deliberate mistakes.
 *
 * The *thinking* lives in `search.ts` on the board in `position.ts`. This file is what turns a
 * search result into an opponent: which level is playing, whether it follows theory, and whether it
 * is going to make a human-looking mistake this move.
 *
 * Every strong engine — Stockfish, Leela, Fairy-Stockfish — is GPL-3.0, and shipping one in the
 * bundle would make the bundle GPL, which disqualifies an MIT submission (`SPEC.md` L2). So the
 * engine is ours, written from published technique rather than from anybody's source.
 *
 * Three levers make a level: **search depth**, a **blunder rate** — how often it deliberately plays
 * something other than its best move — and how bad that blunder is allowed to be. Chess.com's bots
 * are loved precisely because they are weak in human-looking ways, and a bot that plays perfectly
 * and then hangs a queen at random is not human-looking. So a blunder here is the *second* or third
 * best move, not a random legal one.
 *
 * ## The one place chess.js is still spoken
 *
 * A caller hands in a `Chess` and gets SAN back, because SAN is what a game, a scoresheet and a PGN
 * are made of. The conversion happens exactly twice per move — once in, once out — which at 971 µs
 * is nothing beside a search that is now measured in hundreds of thousands of nodes.
 */

import { chooseBookMove } from './openings.ts';
import { Position, moveFrom, movePromotion, moveTo, squareName } from './position.ts';
import {
  MATE,
  createTable,
  evaluate as evaluatePosition,
  findBestMove,
  type SearchTable,
} from './search.ts';
import { Chess } from 'chess.js';

/** Centipawns. The conventional scale: a pawn is 100, so evaluations read like every chess tool. */
export const PAWN = 100;

/**
 * How long the bot may think, in milliseconds, when a level does not say.
 *
 * Iterative deepening inside a budget is a guarantee rather than a hope: the bot returns the best
 * move it *finished*, always, and a shallower answer now beats a deeper one that arrives after the
 * player has put the phone down.
 */
export const DEFAULT_BUDGET_MS = 900;

/** How a level plays. Three numbers, and they are the whole personality. */
export interface Level {
  /** A name, because "level 2" is not an opponent and a name is (`SPEC.md` J2). */
  name: string;
  /**
   * Plies searched, at most. The budget usually stops it first at the higher levels.
   *
   * These numbers changed meaning when the engine got its own board: depth four used to be as far
   * as anything could reach inside a second, and is now reached in single-digit milliseconds. The
   * ladder below was re-cut against the new search rather than left pointing at the old one.
   */
  depth: number;
  /** Milliseconds this level may think for. A weak level should also answer *quickly*. */
  budgetMs?: number;
  /** How often it declines to play its best move, 0–1. */
  blunderRate: number;
  /** How far down the ranked list a blunder may reach. Two means "the second or third best". */
  blunderDepth: number;
  /**
   * How many plies of opening theory this level will follow.
   *
   * Part of the personality, not a performance knob. A beginner who plays eight plies of a sharp
   * Najdorf and then hangs a rook is not a beginner — it is a strong player pretending, and it reads
   * as one. Pip leaves book almost immediately and plays its own bad ideas from move two, which is
   * what a beginner actually does and what makes the level feel like a person rather than a setting.
   */
  bookPlies: number;
}

/**
 * The roster.
 *
 * No ratings on them. A number on a bot this weak would be a lie, and `SPEC.md` P3 says so: real
 * ratings arrive with the real engine, not before.
 */
export const LEVELS: readonly Level[] = [
  { name: 'Pip', depth: 1, budgetMs: 60, blunderRate: 0.35, blunderDepth: 4, bookPlies: 2 },
  { name: 'Nell', depth: 3, budgetMs: 150, blunderRate: 0.15, blunderDepth: 3, bookPlies: 4 },
  { name: 'Vera', depth: 6, budgetMs: 400, blunderRate: 0.05, blunderDepth: 2, bookPlies: 6 },
  { name: 'Oskar', depth: 14, budgetMs: 900, blunderRate: 0, blunderDepth: 1, bookPlies: 8 },
];

export interface Choice {
  /** The move in SAN, ready to be played or recorded. */
  san: string;
  /** From and to, for the board to animate. */
  from: string;
  to: string;
  promotion?: string | undefined;
  /** Centipawns, from the mover's point of view. */
  score: number;
  /** True when the level deliberately declined its best move. */
  blundered: boolean;
  /** How deep the search actually got before the budget ran out. Useful for tuning, and honest. */
  depth: number;
  /** How long it took. */
  ms: number;
  /** True when the move came from the opening book rather than a search. */
  fromBook: boolean;
}

export interface ChooseOptions {
  /** Injected so a test can pin the blunder. A bot whose behaviour cannot be pinned cannot be tuned. */
  random?: () => number;
  /** Milliseconds of thinking time. The bot always answers within it. */
  budgetMs?: number;
  /**
   * Consult the opening book first. On by default.
   *
   * Off for anything measuring the search itself — a strength test that unknowingly compares two
   * book moves has measured the book, and would keep reporting a healthy result through a completely
   * broken evaluation.
   */
  useBook?: boolean;
  /**
   * A transposition table to reuse. One is made per call when this is absent.
   *
   * Only meaningful when consecutive calls are about *related* positions, which is exactly the
   * shape of game analysis and is not the shape of a bot answering one move at a time.
   */
  table?: SearchTable;
  /**
   * An evaluation to use instead of the hand-written one — see `SearchLimits.evaluate`.
   *
   * Passed straight through. It is here so `scripts/strength.mjs` can measure the network against
   * the hand-written evaluation **at the same time budget**, which is the only comparison that means
   * anything: the network is far stronger per call and far slower, and only a measurement can say
   * which way that nets out in a browser.
   */
  evaluate?: ((position: Position) => number) | undefined;
}

/**
 * The book's move for this position, if the game actually reached it from the start.
 *
 * **The origin check is the whole function.** `chess.history()` records only the moves played on
 * *this* instance, so a board constructed from a mid-game FEN reports an empty history — and the
 * book, walked from an empty history, would offer opening replies for a position that is nothing
 * like the opening. Most would be rejected as illegal a moment later, but not all: `e4` is legal in
 * a great many positions, and the bot would have played a book move that meant nothing, occasionally,
 * unreproducibly, in exactly the games that are hardest to debug.
 *
 * Replaying the history from the initial position and comparing the result settles it exactly. It
 * costs at most eight moves, and only while the game is still short enough to be in book at all.
 */
function bookMove(chess: Chess, level: Level, random: () => number): string | null {
  const history = chess.history();
  if (history.length >= level.bookPlies) return null;

  const probe = new Chess();
  for (const san of history) {
    try {
      probe.move(san);
    } catch {
      return null;
    }
  }
  if (probe.fen() !== chess.fen()) return null;

  return chooseBookMove(history, random, { maxPlies: level.bookPlies });
}

/**
 * The engine's own evaluation of a position, in centipawns from the side to move's point of view.
 *
 * A thin bridge over `search.ts`, kept because a `Chess` is what every caller already holds. It
 * costs one FEN parse, which is nothing beside anything that would want to call it.
 */
export function evaluate(chess: Chess): number {
  return evaluatePosition(Position.fromFen(chess.fen()));
}

/**
 * Pick a move.
 *
 * **Iterative deepening inside a budget**: search one ply, then two, then three, up to the level's
 * depth or until the time runs out — whichever comes first. Two things fall out of that, and both
 * matter more than raw strength:
 *
 *  1. **The bot always answers.** There is no position that makes it hang; it returns the deepest
 *     iteration it *finished*, and a shallower answer now beats a deeper one that arrives after the
 *     player has put the phone down.
 *  2. **It is faster than searching the target depth directly**, because each iteration leaves its
 *     best move in the transposition table and the next one tries that first. Alpha-beta with a good
 *     first move cuts almost everything else.
 */
export function chooseMove(chess: Chess, level: Level, options: ChooseOptions = {}): Choice | null {
  const random = options.random ?? Math.random;
  const budgetMs = options.budgetMs ?? level.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = Date.now();

  if (chess.moves().length === 0) return null;

  if (options.useBook ?? true) {
    const book = bookMove(chess, level, random);
    if (book) {
      /*
       * The legality check is not paranoia about the data — every line is played through `chess.js`
       * in `openings.test.ts`. It guards the *position*: a book move is only meaningful for the game
       * the book was walked against, and if that walk were ever wrong the move would be silently
       * illegal here. Falling through to the search is the correct answer to that, not throwing.
       */
      try {
        const played = chess.move(book);
        chess.undo();
        return {
          san: played.san,
          from: played.from,
          to: played.to,
          promotion: played.promotion,
          score: 0,
          blundered: false,
          depth: 0,
          ms: Date.now() - started,
          fromBook: true,
        };
      } catch {
        // Not a legal move here after all. The search answers instead.
      }
    }
  }

  const position = Position.fromFen(chess.fen());
  const result = findBestMove(position, {
    depth: level.depth,
    budgetMs,
    table: options.table ?? createTable(),
    evaluate: options.evaluate,
  });
  if (result.move === 0) return null;

  let chosen = result.ranked[0]!;
  let blundered = false;
  if (level.blunderRate > 0 && result.ranked.length > 1 && random() < level.blunderRate) {
    /*
     * A human-looking mistake is the second or third best move, not a random legal one.
     *
     * Chess.com's bots are loved because they are weak in ways a person is weak. A bot that plays
     * well and then hangs its queen at random reads as broken rather than beatable, and a beginner
     * learns nothing from it.
     */
    const reach = Math.min(level.blunderDepth, result.ranked.length - 1);
    chosen = result.ranked[1 + Math.floor(random() * reach)] ?? chosen;
    blundered = chosen !== result.ranked[0];
  }

  /*
   * Back to SAN, through `chess.js`, because SAN is what a game is made of.
   *
   * Played and immediately taken back: it is the only way to get the notation right, since SAN
   * depends on which *other* moves are legal — the difference between `Nd2` and `Nbd2` is a knight
   * somewhere else on the board.
   */
  const from = squareName(moveFrom(chosen.move));
  const to = squareName(moveTo(chosen.move));
  const promotion = movePromotion(chosen.move) ? ' pnbrqk'[movePromotion(chosen.move)] : undefined;
  const played = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
  chess.undo();

  return {
    san: played.san,
    from: played.from,
    to: played.to,
    promotion: played.promotion,
    // Mate scores are reported as they are: a caller showing an evaluation bar needs to know the
    // difference between "nine pawns up" and "mate in three", and flattening them loses it.
    score: Math.abs(chosen.score) >= MATE - 1000 ? chosen.score : Math.round(chosen.score),
    blundered,
    depth: result.depth,
    ms: Date.now() - started,
    fromBook: false,
  };
}
