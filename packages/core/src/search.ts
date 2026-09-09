/**
 * The search — `SPEC.md` K1, the master unlock.
 *
 * Every "needs an engine, and every strong engine is GPL" in Parts A–J traces to one root, and this
 * is it. Written from published technique (the Chess Programming Wiki and the literature), never
 * from Stockfish, so the whole bundle stays MIT: alpha-beta with iterative deepening, a
 * transposition table on Zobrist keys, killer and history move ordering, null-move pruning, and a
 * quiescence search with delta pruning.
 *
 * ## Why it was worth writing
 *
 * The previous search ran on `chess.js`, whose `moves({ verbose: true })` costs 971 µs a call
 * because it builds a FEN for every move. That capped the engine at **depth one** inside a 300 ms
 * budget, and depth one cannot see a two-move tactic — an analysis built on it called `17...Be6`,
 * the most famous move in Byrne–Fischer 1956, a blunder. On the board in `position.ts` the same
 * machine does **6.1 million nodes a second**, perft-verified, which is about a thousand times
 * faster and is the difference between a report that teaches somebody something and one that lies
 * to them.
 *
 * ## What it is not
 *
 * Not Stockfish, and `SPEC.md` K8 says so plainly rather than implying parity. Stockfish is ~3600
 * Elo because it is correcting grandmasters. Finding the blunders in an amateur game is a bounded,
 * decades-old piece of engineering, and what is here is that engineering.
 *
 * **This file makes no claim about its own Elo, and an earlier version of this comment did.** It said
 * the job "needs about 2000", which reads as a measurement and was never one. An engine has no Elo
 * without an opponent outside itself, and measuring that needs a reference — Stockfish, run as an
 * unshipped oracle, which is licence-clean because the GPL binds on distribution rather than on use.
 * No Stockfish binary is available on the machine this was built on, so the number is simply not
 * known, and saying nothing is the only honest option.
 *
 * What **is** measured is the claim the product actually makes to a player, which is that the four
 * bots are in increasing order of difficulty: `scripts/levels-ordered.mjs` plays each adjacent pair
 * head to head with colours alternating and the book off, and reports the score with a confidence
 * interval. Every pair came out ordered with the whole interval above an even score.
 */

import {
  BISHOP,
  BLACK,
  EMPTY,
  FLAG_CAPTURE,
  FLAG_EN_PASSANT,
  KING,
  KNIGHT,
  PAWN,
  Position,
  QUEEN,
  ROOK,
  WHITE,
  colourOf,
  fileOf,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  typeOf,
} from './position.ts';

/** Centipawns. A pawn is 100, so every number this file produces reads like any other chess tool. */
export const PAWN_VALUE = 100;

/** Material, on the conventional scale. The king's value only has to exceed every other total. */
const VALUE = [0, 100, 320, 330, 500, 900, 20_000];

/** A mate, scored far beyond any material total so it is never traded away for pieces. */
export const MATE = 1_000_000;
/** Anything at least this good is a forced mate, which is how a caller tells one from an advantage. */
export const MATE_THRESHOLD = MATE - 1000;

/**
 * The widest window, and it is a **finite** number on purpose.
 *
 * `Infinity` looks like the natural choice and is a real bug. Null-move pruning searches a null
 * window at `(-beta, -beta + 1)`, and with `beta = Infinity` that is `(-Infinity, -Infinity)` — at
 * which point quiescence's `stand >= beta` is true for every position and returns `-Infinity`, which
 * negates to `+Infinity` and propagates all the way to the root. The engine then reports every
 * opening position as a forced mate and stops searching. Measured, on the first run of this file.
 */
const WIDEST = 4_000_000;

/*
 * Piece-square tables from the Simplified Evaluation Function (Tomasz Michniewski) — the standard
 * published starting point, written from White's point of view with rank 8 first.
 *
 * They are what make an engine *develop* rather than shuffle: knights to the centre, pawns forward,
 * the king behind its pawns until the endgame. Without them a material-only search plays the first
 * six moves like nobody who has ever seen a game.
 *
 * Indexed by `rank * 8 + file` with rank 8 first, so they are flipped once at load into 0x88 order.
 */
const RAW: Record<number, number[]> = {
  [PAWN]: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  [BISHOP]: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  [QUEEN]: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  [KING]: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0, 20, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

/** The king's endgame table: with the queens gone it belongs in the centre, not in the corner. */
const RAW_KING_ENDGAME = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

/**
 * The tables, in 0x88 order, one per (piece, colour).
 *
 * Built once at load. Looking a value up during the search is then a single array read rather than
 * a mirror calculation, and the mirror is the classic place to introduce a bug that only shows up
 * for one colour.
 */
function tableFor(raw: number[], colour: number): Int16Array {
  const table = new Int16Array(128);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      // Rank 8 first in the source; rank 0 is White's back rank on the board.
      const value = raw[(7 - rank) * 8 + file]!;
      table[rank * 16 + file] = colour === WHITE ? value : raw[rank * 8 + file]!;
    }
  }
  return table;
}

const PST: Int16Array[][] = [[], []];
for (const colour of [WHITE, BLACK]) {
  PST[colour]![0] = new Int16Array(128);
  for (const type of [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING]) {
    PST[colour]![type] = tableFor(RAW[type]!, colour);
  }
}
const KING_ENDGAME_PST = [tableFor(RAW_KING_ENDGAME, WHITE), tableFor(RAW_KING_ENDGAME, BLACK)];

/**
 * The position in centipawns, from the side to move's point of view.
 *
 * Material, piece-square tables, and three cheap structural terms that are worth far more than they
 * cost: doubled and isolated pawns, the bishop pair, and rooks on open files. Deliberately no king
 * safety beyond the tables — it is the term most likely to be subtly wrong, and a wrong king-safety
 * term makes an engine play strange sacrifices with great confidence.
 */
export function evaluate(position: Position): number {
  const board = position.board;
  let score = 0;
  let material = 0;
  const bishops = [0, 0];
  const pawnFiles = [new Int8Array(8), new Int8Array(8)];

  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const value = board[square]!;
    if (value === EMPTY) continue;
    const colour = colourOf(value);
    const type = typeOf(value);
    if (type !== KING && type !== PAWN) material += VALUE[type]!;
    if (type === BISHOP) bishops[colour] = bishops[colour]! + 1;
    if (type === PAWN) pawnFiles[colour]![fileOf(square)] = pawnFiles[colour]![fileOf(square)]! + 1;
  }

  // "Endgame" by what is left on the board, which decides which king table applies. Queens gone, or
  // very little else, is the point at which a king should be walking towards the centre.
  const endgame = material <= 2 * VALUE[ROOK]! + VALUE[BISHOP]!;

  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const value = board[square]!;
    if (value === EMPTY) continue;
    const colour = colourOf(value);
    const type = typeOf(value);
    const table = type === KING && endgame ? KING_ENDGAME_PST[colour]! : PST[colour]![type]!;
    const worth = VALUE[type]! + table[square]!;
    score += colour === WHITE ? worth : -worth;
  }

  for (const colour of [WHITE, BLACK]) {
    const sign = colour === WHITE ? 1 : -1;
    // The bishop pair, worth about half a pawn and one of the best-established terms in chess.
    if (bishops[colour]! >= 2) score += sign * 40;

    for (let file = 0; file < 8; file++) {
      const count = pawnFiles[colour]![file]!;
      if (count === 0) continue;
      // Doubled pawns: each extra pawn on a file is worth about a fifth of a pawn less.
      if (count > 1) score -= sign * 20 * (count - 1);
      // Isolated: no friendly pawn on either neighbouring file, so it can never be defended.
      const left = file > 0 ? pawnFiles[colour]![file - 1]! : 0;
      const right = file < 7 ? pawnFiles[colour]![file + 1]! : 0;
      if (left === 0 && right === 0) score -= sign * 15;
    }
  }

  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const value = board[square]!;
    if (value === EMPTY || typeOf(value) !== ROOK) continue;
    const colour = colourOf(value);
    const file = fileOf(square);
    if (pawnFiles[colour]![file] === 0) {
      // A rook on a file with none of its own pawns is worth more; with none of anybody's, more
      // again. This is the one positional idea a club player is always told and always right about.
      score += (colour === WHITE ? 1 : -1) * (pawnFiles[colour ^ 1]![file] === 0 ? 25 : 12);
    }
  }

  return position.turn === WHITE ? score : -score;
}

/* ------------------------------------------------------------------ the table */

interface Entry {
  key: string;
  depth: number;
  score: number;
  flag: 0 | 1 | 2;
  move: number;
}

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

/** A transposition table a caller may keep across searches, which is most of what makes one fast. */
export type SearchTable = Map<string, Entry>;

export function createTable(): SearchTable {
  return new Map();
}

/**
 * Keep the table from growing without bound.
 *
 * A long analysis fills it with positions from moves nobody will ever play again. Halving it when it
 * gets large costs one pass and keeps memory flat; a table that grows forever is how a browser tab
 * analysing a long game runs out of memory on a phone.
 */
const MAX_ENTRIES = 1 << 20;

/* ------------------------------------------------------------------ search state */

export interface SearchLimits {
  /** Plies. Iterative deepening stops here even with time to spare. */
  depth: number;
  /** Milliseconds. The search always returns the deepest iteration it finished inside this. */
  budgetMs: number;
  table?: SearchTable | undefined;
  /** Injected so a test can move time. */
  now?: (() => number) | undefined;
  /**
   * An evaluation to use instead of the hand-written one.
   *
   * The point of the seam is `nnue.ts`, which reads a network far stronger than anything written by
   * hand here — and which costs perhaps two hundred times as much per call. Because every search in
   * this app is **time-budgeted rather than depth-budgeted**, that is not a slowdown but a trade:
   * the same seconds buy fewer nodes and a better opinion of each one.
   *
   * Whether that trade is worth taking is a measurement, not an argument, and `scripts/strength.mjs`
   * makes it. The seam exists so the question can be asked at all.
   */
  evaluate?: ((position: Position) => number) | undefined;
}

export interface SearchResult {
  /** The move, in this file's packed encoding. `0` when the position has no legal move. */
  move: number;
  /** Centipawns from the side to move's point of view, or a mate score. */
  score: number;
  /** How deep the last completed iteration got. Honest: a budget cut is visible here. */
  depth: number;
  nodes: number;
  ms: number;
  /** The line the engine expects, deepest first move onwards. */
  line: number[];
  /**
   * Every root move with its score, best first.
   *
   * Here because the *bot* needs it, not the analysis: a level that plays weakly must play the
   * second or third best move rather than a random legal one — a bot that plays well and then hangs
   * its queen at random reads as broken rather than beatable, and a beginner learns nothing from it.
   * Ranking the root is the only way to know what "second best" is.
   */
  ranked: { move: number; score: number }[];
}

class Searcher {
  private readonly position: Position;
  private readonly table: SearchTable;
  private readonly now: () => number;
  private deadline = Infinity;
  private stopped = false;
  nodes = 0;

  /**
   * Killer moves: two quiet moves per ply that caused a cutoff elsewhere at the same depth.
   *
   * The cheapest large ordering win there is. A quiet move that refuted one line usually refutes its
   * siblings, and trying it before the rest turns a wide node into a narrow one.
   */
  private readonly killers = new Int32Array(128 * 2);
  /** History: how often a quiet move from-to has caused a cutoff, anywhere. Ordering, at no cost. */
  private readonly history = new Int32Array(128 * 128);

  /** One move buffer per ply, allocated once. Generating into a fresh array per node is the cost. */
  /*
   * Three buffers per ply, allocated once at construction.
   *
   * Generating into a fresh array at every node would put an allocation on the hottest path in the
   * program — at six million nodes a second that is the garbage collector's entire day. `buffers`
   * holds the generated moves, `ordered` the same moves sorted, and `scores` the sort keys.
   */
  private readonly buffers: Int32Array[] = [];
  private readonly ordered: Int32Array[] = [];
  private readonly scores: Int32Array[] = [];

  private readonly evaluate: (position: Position) => number;

  constructor(
    position: Position,
    table: SearchTable,
    now: () => number,
    evaluator: (position: Position) => number = evaluate,
  ) {
    this.position = position;
    this.table = table;
    this.now = now;
    this.evaluate = evaluator;
    for (let ply = 0; ply < 128; ply++) {
      this.buffers.push(new Int32Array(256));
      this.ordered.push(new Int32Array(256));
      this.scores.push(new Int32Array(256));
    }
  }

  private outOfTime(): boolean {
    // Checked every 2048 nodes rather than every node: `Date.now()` is not free, and at six million
    // nodes a second the granularity this gives is well under a millisecond.
    if ((this.nodes & 2047) === 0 && this.now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  /**
   * Order the moves at one node.
   *
   * The order matters more than almost anything else: alpha-beta on a perfectly ordered list
   * examines the square root of the nodes an unordered one does. The ranking, in order of how much
   * each is worth:
   *
   *  1. The table's move — the best move found here at a shallower depth, or in another line that
   *     reached the same position. Nothing else comes close.
   *  2. Captures by Most Valuable Victim minus Least Valuable Attacker, so taking a queen with a
   *     pawn is tried before taking a pawn with a queen.
   *  3. Promotions.
   *  4. The two killers for this ply.
   *  5. Everything else by its history score.
   */
  private order(moves: Int32Array, count: number, ply: number, best: number): Int32Array {
    const board = this.position.board;
    const scores = this.scores[ply]!;
    const into = this.ordered[ply]!;

    for (let index = 0; index < count; index++) {
      const move = moves[index]!;
      let score = 0;
      if (move === best) {
        score = 1 << 28;
      } else if (moveFlags(move) & FLAG_CAPTURE) {
        const to = moveTo(move);
        const victim = moveFlags(move) & FLAG_EN_PASSANT ? PAWN : typeOf(board[to]!);
        const attacker = typeOf(board[moveFrom(move)]!);
        score = (1 << 27) + VALUE[victim]! * 16 - VALUE[attacker]!;
      } else if (movePromotion(move)) {
        score = (1 << 26) + VALUE[movePromotion(move)]!;
      } else if (move === this.killers[ply * 2]! || move === this.killers[ply * 2 + 1]!) {
        score = 1 << 25;
      } else {
        score = this.history[moveFrom(move) * 128 + moveTo(move)]!;
      }
      into[index] = move;
      scores[index] = score;
    }

    // Insertion sort: move lists are short (under fifty), and it beats a comparator-based sort at
    // this size while allocating nothing.
    for (let index = 1; index < count; index++) {
      const move = into[index]!;
      const score = scores[index]!;
      let slot = index - 1;
      while (slot >= 0 && scores[slot]! < score) {
        into[slot + 1] = into[slot]!;
        scores[slot + 1] = scores[slot]!;
        slot -= 1;
      }
      into[slot + 1] = move;
      scores[slot + 1] = score;
    }
    return into;
  }

  /**
   * Quiescence — the difference between an engine that plays chess and one that hallucinates.
   *
   * A fixed-depth search that stops in the middle of an exchange scores the position as though the
   * recapture never happens, so it will take a defended pawn with its queen and be delighted. This
   * carries on with captures only until the position is quiet.
   *
   * **Delta pruning** is what keeps it affordable: a capture that could not raise alpha even if it
   * won the piece for nothing is not searched at all.
   */
  private quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes += 1;
    if (this.outOfTime()) return alpha;

    /*
     * **Being in check suspends every shortcut in here, and forgetting that is a real bug.**
     *
     * Standing pat means "I could just stop and take the evaluation" — and when you are in check
     * you could not. You must answer it. So while in check there is no stand-pat cutoff, no delta
     * pruning, and the generator is asked for *every* move rather than captures only: a king step
     * or an interposition is usually the answer to a check and neither is a capture. Without this,
     * a position whose only escapes are quiet moves is scored as though the side to move were free
     * to pass, and a forced mate at the horizon reads as a comfortable evaluation.
     *
     * The mate score at the bottom is the other half of it. If nothing is legal while in check it
     * is mate here, and it has to be reported as mate at *this* ply so that a shorter mate still
     * outranks a longer one.
     */
    const inCheck = this.position.inCheck();
    const stand = this.evaluate(this.position);
    if (!inCheck) {
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
    }
    if (ply >= 96) return stand;

    const moves = this.buffers[ply]!;
    const count = this.position.generate(moves, !inCheck);
    const ordered = this.order(moves, count, ply, 0);

    const board = this.position.board;
    let legal = 0;
    for (let index = 0; index < count; index++) {
      const move = ordered[index]!;
      if (!inCheck) {
        const victim = moveFlags(move) & FLAG_EN_PASSANT ? PAWN : typeOf(board[moveTo(move)]!);
        // Delta pruning: even winning this piece outright would not reach alpha, so skip it. The
        // margin covers a promotion, which is the one capture whose gain is larger than its victim.
        if (stand + VALUE[victim]! + 200 < alpha && !movePromotion(move)) continue;
      }

      if (!this.position.makeMove(move)) continue;
      legal += 1;
      const value = -this.quiesce(-beta, -alpha, ply + 1);
      this.position.unmakeMove();

      if (this.stopped) return alpha;
      if (value >= beta) return beta;
      if (value > alpha) alpha = value;
    }

    if (inCheck && legal === 0) return -(MATE - ply);
    return alpha;
  }

  search(depth: number, alpha: number, beta: number, ply: number, canNull: boolean): number {
    if (depth <= 0) return this.quiesce(alpha, beta, ply);

    this.nodes += 1;
    if (this.outOfTime()) return alpha;

    const alphaOriginal = alpha;
    const key = this.position.key();
    const hit = this.table.get(key);
    let tableMove = 0;
    if (hit && hit.key === key) {
      tableMove = hit.move;
      if (hit.depth >= depth) {
        if (hit.flag === EXACT) return hit.score;
        if (hit.flag === LOWER && hit.score > alpha) alpha = hit.score;
        else if (hit.flag === UPPER && hit.score < beta) beta = hit.score;
        if (alpha >= beta) return hit.score;
      }
    }

    const inCheck = this.position.inCheck();

    /*
     * Null-move pruning: give the opponent a free move, and if we are *still* winning, this line is
     * good enough that it is not worth searching properly.
     *
     * Switched off in check, where passing is not a legal idea at all, and in an endgame thin enough
     * for zugzwang — the one situation where having to move is itself the disadvantage, and where
     * null-move pruning is famously wrong.
     */
    if (canNull && !inCheck && depth >= 3 && this.hasPieces()) {
      this.position.makeNull();
      const value = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
      this.position.unmakeNull();
      if (this.stopped) return alpha;
      if (value >= beta) return beta;
    }

    const moves = this.buffers[ply]!;
    const count = this.position.generate(moves);
    const ordered = this.order(moves, count, ply, tableMove);

    let best = -WIDEST;
    let bestMove = 0;
    let legal = 0;

    for (let index = 0; index < count; index++) {
      const move = ordered[index]!;
      if (!this.position.makeMove(move)) continue;
      legal += 1;

      /*
       * Check extension: a forcing line is followed one ply further.
       *
       * Almost every tactic that matters ends in a check, and stopping the search on the move before
       * the mate is the single most common way an engine misses one.
       */
      const gives = this.position.inCheck();
      const next = depth - 1 + (gives ? 1 : 0);

      let value: number;
      if (legal === 1) {
        value = -this.search(next, -beta, -alpha, ply + 1, true);
      } else {
        /*
         * Late move reductions: after a few moves have been tried in a well-ordered list, the rest
         * are unlikely to be best, so they are searched shallower first and only re-searched in full
         * if they surprise us. This is where most of the depth comes from.
         */
        const quiet = !(moveFlags(move) & FLAG_CAPTURE) && !movePromotion(move) && !gives;
        const reduction = quiet && depth >= 3 && legal > 3 ? 1 + Math.floor(legal / 8) : 0;
        value = -this.search(next - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (value > alpha && (reduction > 0 || value < beta)) {
          value = -this.search(next, -beta, -alpha, ply + 1, true);
        }
      }

      this.position.unmakeMove();
      if (this.stopped) return best === -WIDEST ? alpha : best;

      if (value > best) {
        best = value;
        bestMove = move;
      }
      if (value > alpha) alpha = value;
      if (alpha >= beta) {
        // A cutoff on a quiet move is what the killer and history tables are for.
        if (!(moveFlags(move) & FLAG_CAPTURE)) {
          if (this.killers[ply * 2] !== move) {
            this.killers[ply * 2 + 1] = this.killers[ply * 2]!;
            this.killers[ply * 2] = move;
          }
          const slot = moveFrom(move) * 128 + moveTo(move);
          this.history[slot] = (this.history[slot] ?? 0) + depth * depth;
        }
        break;
      }
    }

    /*
     * No legal move at all: mate or stalemate, and `inCheck` says which.
     *
     * The mate score carries the ply so a mate found sooner scores higher than the same mate found
     * later. Without it the engine rates every forced mate equally and shuffles instead of finishing
     * one — the single most infuriating thing a weak engine does.
     */
    if (legal === 0) return inCheck ? -(MATE - ply) : 0;

    if (this.table.size >= MAX_ENTRIES) this.table.clear();
    this.table.set(key, {
      key,
      depth,
      score: best,
      flag: best <= alphaOriginal ? UPPER : best >= beta ? LOWER : EXACT,
      move: bestMove,
    });
    return best;
  }

  /** Is there anything but pawns and a king? Null-move pruning is unsound when there is not. */
  private hasPieces(): boolean {
    const board = this.position.board;
    const us = this.position.turn;
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const value = board[square]!;
      if (value === EMPTY || colourOf(value) !== us) continue;
      const type = typeOf(value);
      if (type !== PAWN && type !== KING) return true;
    }
    return false;
  }

  /** The line the table believes in, walked from the root. Purely for reporting. */
  private line(limit: number): number[] {
    const moves: number[] = [];
    let played = 0;
    for (let step = 0; step < limit; step++) {
      const hit = this.table.get(this.position.key());
      if (!hit || hit.move === 0) break;
      if (!this.position.makeMove(hit.move)) break;
      moves.push(hit.move);
      played += 1;
    }
    for (let step = 0; step < played; step++) this.position.unmakeMove();
    return moves;
  }

  run(limits: SearchLimits): SearchResult {
    const started = this.now();
    this.deadline = started + limits.budgetMs;

    /*
     * The root is looped here rather than left to `search`.
     *
     * Two things fall out of it and both are needed: every root move keeps its own score, which is
     * what lets a weak level play the *second* best move rather than a random one; and a depth is
     * only accepted once every root move has been searched at it, so a budget that runs out
     * mid-iteration falls back on the last complete one instead of comparing scores from two
     * different depths.
     */
    const buffer = new Int32Array(256);
    const count = this.position.generate(buffer);
    let ranked: { move: number; score: number }[] = [];
    for (let index = 0; index < count; index++) {
      if (!this.position.makeMove(buffer[index]!)) continue;
      this.position.unmakeMove();
      ranked.push({ move: buffer[index]!, score: 0 });
    }

    if (ranked.length === 0) {
      return {
        move: 0,
        score: this.position.inCheck() ? -MATE : 0,
        depth: 0, nodes: 0, ms: this.now() - started, line: [], ranked: [],
      };
    }

    let bestScore = 0;
    let reached = 0;

    for (let depth = 1; depth <= limits.depth; depth++) {
      const scored: { move: number; score: number }[] = [];
      let alpha = -WIDEST;

      for (const entry of ranked) {
        if (!this.position.makeMove(entry.move)) continue;
        const gives = this.position.inCheck();
        const next = depth - 1 + (gives ? 1 : 0);

        let value: number;
        if (scored.length === 0) {
          value = -this.search(next, -WIDEST, WIDEST, 1, true);
        } else {
          // A null window first: most root moves are not better than the best one found so far, and
          // proving that is far cheaper than measuring how much worse they are.
          value = -this.search(next, -alpha - 1, -alpha, 1, true);
          if (value > alpha) value = -this.search(next, -WIDEST, -alpha, 1, true);
        }
        this.position.unmakeMove();

        // A move searched after the budget ran out has a meaningless score, so the whole iteration
        // is abandoned rather than half-accepted.
        if (this.stopped && depth > 1) break;
        scored.push({ move: entry.move, score: value });
        if (value > alpha) alpha = value;
      }

      if (scored.length < ranked.length && depth > 1) break;

      scored.sort((a, b) => b.score - a.score);
      ranked = scored;
      bestScore = scored[0]?.score ?? 0;
      reached = depth;

      // A forced mate ends it: nothing deeper can beat a mate already found.
      if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
      if (this.now() > this.deadline) break;
    }

    const bestMove = ranked[0]?.move ?? 0;
    /*
     * The expected line is read by playing the best move and then following the table.
     *
     * The root's own entry is not in the table — the root loop above never writes one — so it is
     * supplied here rather than looked up.
     */
    let line: number[] = [];
    if (bestMove !== 0 && this.position.makeMove(bestMove)) {
      line = [bestMove, ...this.line(Math.max(0, reached - 1))];
      this.position.unmakeMove();
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: reached,
      nodes: this.nodes,
      ms: this.now() - started,
      line,
      ranked,
    };
  }
}

/**
 * Search a position and return the best move found inside the limits.
 *
 * The position is left exactly as it was found — every move made during the search is unmade, and
 * `position.test.ts` proves it for the generator this depends on.
 */
export function findBestMove(position: Position, limits: SearchLimits): SearchResult {
  const searcher = new Searcher(
    position,
    limits.table ?? createTable(),
    limits.now ?? Date.now,
    limits.evaluate ?? evaluate,
  );
  return searcher.run(limits);
}

/** How many moves until mate, when the score is one. Positive means the side to move delivers it. */
export function mateIn(score: number): number | null {
  if (Math.abs(score) < MATE_THRESHOLD) return null;
  const plies = MATE - Math.abs(score);
  const moves = Math.ceil(plies / 2);
  return score > 0 ? moves : -moves;
}
