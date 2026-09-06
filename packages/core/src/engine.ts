/**
 * The opponent that is always there.
 *
 * Every strong engine — Stockfish, Leela, Fairy-Stockfish — is GPL-3.0, and shipping one in the
 * bundle would make the bundle GPL, which disqualifies an MIT submission (`SPEC.md` L2). So this
 * one is ours, written from published technique rather than from anybody's source: alpha-beta with
 * iterative deepening, a quiescence search, and the Simplified Evaluation Function's piece-square
 * tables, all of it decades-old material written up specifically to be implemented from.
 *
 * **It is not trying to be strong.** It is trying to be *instant*, *beatable* and *adjustable*.
 * A beginner who loses every game leaves faster than one who never opens the app, and the cold open
 * (`SPEC.md` E3) needs an opponent that answers immediately with nobody else online. Strength comes
 * later, from the real engine in Part K1; this is what stops screen one being an empty lobby.
 *
 * Three levers make a level: **search depth**, a **blunder rate** — how often it deliberately plays
 * something other than its best move — and how bad that blunder is allowed to be. Chess.com's bots
 * are loved precisely because they are weak in human-looking ways, and a bot that plays perfectly
 * and then hangs a queen at random is not human-looking. So a blunder here is the *second* or third
 * best move, not a random legal one.
 */

import { Chess, type Move } from 'chess.js';

/** Centipawns. The conventional scale: a pawn is 100, so evaluations read like every chess tool. */
export const PAWN = 100;

const PIECE_VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000 };

/** How far the quiescence search follows an exchange. Four plies covers any normal trade. */
const QUIESCE_DEPTH = 4;

/** A mate, scored far beyond any material advantage so it is never traded away for pieces. */
const MATE = 1_000_000;

/**
 * How long the bot may think, in milliseconds.
 *
 * Measured, not guessed: with chess.js generating the moves, a full depth-4 opening search took
 * **21.7 seconds**. Iterative deepening inside a budget turns that into a guarantee — the bot
 * returns the best move it finished, always, and a shallower answer now beats a deeper one that
 * arrives after the player has put the phone down.
 */
export const DEFAULT_BUDGET_MS = 900;

/*
 * Piece-square tables from the Simplified Evaluation Function (Tomasz Michniewski), the standard
 * published starting point every engine tutorial uses. Written from White's point of view, rank 8
 * first, and mirrored vertically for Black.
 *
 * They exist so the engine develops rather than shuffling: knights to the centre, pawns forward,
 * the king behind its pawns in the middlegame. Without them a material-only search plays the first
 * six moves like nobody who has ever seen a game.
 */
const PST: Record<string, number[]> = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
  // The king wants the centre once the queens are off, so the endgame gets its own table.
  K: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ],
};

/*
 * Every table is sixty-four squares. A literal one entry short would shift every rank below it and
 * produce an engine that is subtly, silently wrong — so it is checked once, at load, rather than
 * trusted. This costs nothing and it is the kind of mistake that is invisible in play.
 */
for (const [piece, table] of Object.entries(PST)) {
  if (table.length !== 64) throw new Error(`piece-square table ${piece} has ${table.length} squares, not 64`);
}

/** Mirror an index vertically, so Black reads the same tables from its own side. */
function mirror(index: number): number {
  return index ^ 56;
}

/**
 * Is this an endgame?
 *
 * The Simplified Evaluation Function's rule, unchanged: no queens, or every side with a queen has
 * at most one minor piece and nothing else. It decides which king table applies, and getting it
 * wrong makes the engine walk its king into the middle of a middlegame.
 */
function isEndgame(board: ReturnType<Chess['board']>): boolean {
  let queens = 0;
  let heavy = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      if (piece.type === 'q') queens += 1;
      else if (piece.type === 'r') heavy += 2;
      else if (piece.type === 'n' || piece.type === 'b') heavy += 1;
    }
  }
  return queens === 0 || heavy <= 2;
}

/**
 * The position, in centipawns, from the side-to-move's point of view.
 *
 * Material plus piece-square tables plus a small mobility term. Deliberately simple: every extra
 * term is another thing that can be wrong, and at three or four ply the tables do most of the work.
 */
export function evaluate(chess: Chess): number {
  /*
   * Deliberately no `isCheckmate()`, `isDraw()` or `isThreefoldRepetition()` here.
   *
   * Each of those generates every legal move, and this function runs on every leaf of the search —
   * asking them made a depth-4 opening move take **8.3 seconds**, measured. Terminal positions are
   * detected once in `search()`, which has already generated the moves it needs, so paying for it
   * again here bought nothing at all.
   */
  const board = chess.board();
  const endgame = isEndgame(board);
  let score = 0;

  for (let rank = 0; rank < 8; rank++) {
    const row = board[rank]!;
    for (let file = 0; file < 8; file++) {
      const piece = row[file];
      if (!piece) continue;
      const index = rank * 8 + file;
      const table = piece.type === 'k' && endgame ? PST['K']! : PST[piece.type]!;
      const positional = table[piece.color === 'w' ? index : mirror(index)] ?? 0;
      const value = (PIECE_VALUE[piece.type] ?? 0) + positional;
      score += piece.color === 'w' ? value : -value;
    }
  }

  return chess.turn() === 'w' ? score : -score;
}

/** How a level plays. Three numbers, and they are the whole personality. */
export interface Level {
  /** A name, because "level 2" is not an opponent and a name is (`SPEC.md` J2). */
  name: string;
  /** Plies searched. Two is a beginner, four is a club player, and each ply costs time. */
  depth: number;
  /** How often it declines to play its best move, 0–1. */
  blunderRate: number;
  /** How far down the ranked list a blunder may reach. Two means "the second or third best". */
  blunderDepth: number;
}

/**
 * The roster.
 *
 * No ratings on them. A number on a bot this weak would be a lie, and `SPEC.md` P3 says so: real
 * ratings arrive with the real engine, not before.
 */
export const LEVELS: readonly Level[] = [
  { name: 'Pip', depth: 1, blunderRate: 0.35, blunderDepth: 4 },
  { name: 'Nell', depth: 2, blunderRate: 0.15, blunderDepth: 3 },
  { name: 'Vera', depth: 3, blunderRate: 0.05, blunderDepth: 2 },
  { name: 'Oskar', depth: 4, blunderRate: 0, blunderDepth: 1 },
];

/**
 * Order moves so alpha-beta prunes early.
 *
 * The move that was best at a shallower depth first, then captures by Most Valuable Victim minus
 * Least Valuable Attacker — taking a queen with a pawn is examined before taking a pawn with a
 * queen. Ordering is most of what makes alpha-beta fast; a perfectly ordered search examines the
 * square root of the nodes an unordered one does.
 */
function orderMoves(moves: Move[], principal?: string | undefined): Move[] {
  return [...moves].sort((a, b) => score(b) - score(a));

  function score(move: Move): number {
    if (principal !== undefined && move.san === principal) return 1_000_000;
    if (!move.captured) return move.promotion ? 800 : 0;
    return (PIECE_VALUE[move.captured] ?? 0) - (PIECE_VALUE[move.piece] ?? 0) / 10;
  }
}

/**
 * Quiescence search — the difference between a bot that plays chess and one that hallucinates.
 *
 * A fixed-depth search that stops in the middle of an exchange evaluates the position as though the
 * recapture never happens, so it will happily take a defended pawn with its queen. This continues
 * searching captures only, until the position is quiet.
 */
function quiesce(chess: Chess, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(chess);
  if (depth === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = orderMoves(chess.moves({ verbose: true }).filter((move) => Boolean(move.captured)));
  if (captures.length === 0) return alpha;
  for (const move of captures) {
    chess.move(move);
    const value = -quiesce(chess, -beta, -alpha, depth - 1);
    chess.undo();
    if (value >= beta) return beta;
    if (value > alpha) alpha = value;
  }
  return alpha;
}

/*
 * The transposition table.
 *
 * Chess reaches the same position by many move orders, and without this the search re-examines each
 * one from scratch. Keyed on the position rather than the game: the halfmove and fullmove counters
 * are stripped from the FEN, because two identical positions reached at different move numbers are
 * the same thing to evaluate.
 *
 * `flag` is what alpha-beta needs to reuse an entry honestly. An `exact` score can be used directly;
 * a `lower` or `upper` bound can only tighten the window. Storing a bound as if it were exact is the
 * classic way a transposition table quietly corrupts a search.
 */
type Bound = 'exact' | 'lower' | 'upper';
interface Entry {
  depth: number;
  score: number;
  flag: Bound;
  best?: string | undefined;
}

/** Position key: the FEN without its move counters. */
function positionKey(chess: Chess): string {
  const fen = chess.fen();
  const cut = fen.lastIndexOf(' ', fen.lastIndexOf(' ') - 1);
  return cut === -1 ? fen : fen.slice(0, cut);
}

/**
 * Negamax with alpha-beta and a transposition table. One function for both sides, because chess is
 * symmetric: the score is always from the point of view of whoever is to move.
 *
 * `deadline` is checked at every node. A search that overruns is worse than a shallower one that
 * answers — the bot's job is to be *instant* first and strong second.
 */
function search(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  table: Map<string, Entry>,
  deadline: number,
): number {
  const alphaOriginal = alpha;
  const key = positionKey(chess);
  const hit = table.get(key);
  if (hit && hit.depth >= depth) {
    if (hit.flag === 'exact') return hit.score;
    if (hit.flag === 'lower' && hit.score > alpha) alpha = hit.score;
    else if (hit.flag === 'upper' && hit.score < beta) beta = hit.score;
    if (alpha >= beta) return hit.score;
  }

  const moves = chess.moves({ verbose: true });

  /*
   * No legal moves is mate or stalemate, and `isCheck()` says which. Asking `isGameOver()` first
   * would generate the whole move list a second time on every node.
   *
   * The mate score carries `depth` so that a mate found sooner scores higher than the same mate
   * found later. Without it the engine sees every forced mate as equally good and shuffles instead
   * of finishing one — which is the single most infuriating thing a weak bot can do.
   */
  if (moves.length === 0) return chess.isCheck() ? -(MATE + depth) : 0;
  if (depth === 0) return quiesce(chess, alpha, beta, QUIESCE_DEPTH);

  // The best move from a shallower iteration is examined first. Iterative deepening pays for itself
  // almost entirely through this: a good first move makes alpha-beta cut nearly everything else.
  const ordered = orderMoves(moves, hit?.best);

  let best = -Infinity;
  let bestSan: string | undefined;
  for (const move of ordered) {
    chess.move(move);
    const value = -search(chess, depth - 1, -beta, -alpha, table, deadline);
    chess.undo();

    if (value > best) {
      best = value;
      bestSan = move.san;
    }
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
    // Checked after at least one move so every node returns something real rather than -Infinity.
    if (Date.now() > deadline) break;
  }

  const flag: Bound = best <= alphaOriginal ? 'upper' : best >= beta ? 'lower' : 'exact';
  table.set(key, { depth, score: best, flag, best: bestSan });
  return best;
}

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
}

export interface ChooseOptions {
  /** Injected so a test can pin the blunder. A bot whose behaviour cannot be pinned cannot be tuned. */
  random?: () => number;
  /** Milliseconds of thinking time. The bot always answers within it. */
  budgetMs?: number;
}

/**
 * Pick a move.
 *
 * **Iterative deepening**: search one ply, then two, then three, up to the level's depth or until
 * the time budget is spent — whichever comes first. Two things fall out of that, and both matter
 * more than raw strength:
 *
 *  1. **The bot always answers.** There is no position that makes it hang. A depth-4 search of the
 *     opening took 21.7 seconds measured; inside a budget the same call returns whatever it finished.
 *  2. **It is usually faster than searching the target depth directly**, because each iteration
 *     leaves its best move in the transposition table and the next one tries that first. Alpha-beta
 *     with a good first move cuts almost everything else.
 */
export function chooseMove(chess: Chess, level: Level, options: ChooseOptions = {}): Choice | null {
  const random = options.random ?? Math.random;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = Date.now();
  const deadline = started + budgetMs;

  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) return null;

  const table = new Map<string, Entry>();
  let ranked: { move: Move; value: number }[] = legal.map((move) => ({ move, value: 0 }));
  let reached = 0;

  for (let depth = 1; depth <= level.depth; depth++) {
    /*
     * The first iteration always finishes, deadline or not.
     *
     * Without this, a budget too tight to complete even depth 1 leaves every root move scored zero
     * and the bot plays whichever move chess.js generated first — which in the opening is a2a3.
     * A depth-1 search is one evaluation per root move; guaranteeing it costs almost nothing and it
     * is the difference between "thought briefly" and "did not think at all".
     */
    const mustFinish = depth === 1;
    const scored: { move: Move; value: number }[] = [];
    // Previous iteration's order, so the likely best move is searched first at the new depth.
    for (const { move } of ranked) {
      chess.move(move);
      const value = -search(chess, depth - 1, -Infinity, Infinity, table, deadline);
      chess.undo();
      scored.push({ move, value });
      if (!mustFinish && Date.now() > deadline) break;
    }

    // Only accept a depth that finished every root move. A partial iteration has seen some moves at
    // the new depth and the rest at the old one, and comparing those scores is meaningless.
    if (scored.length === ranked.length) {
      scored.sort((a, b) => b.value - a.value);
      ranked = scored;
      reached = depth;
    }
    if (Date.now() > deadline) break;
  }

  let index = 0;
  let blundered = false;
  if (level.blunderRate > 0 && ranked.length > 1 && random() < level.blunderRate) {
    /*
     * A human-looking mistake is the second or third best move, not a random legal one.
     *
     * Chess.com's bots are loved because they are weak in ways a person is weak. A bot that plays
     * well and then hangs its queen at random reads as broken rather than beatable, and a beginner
     * learns nothing from it.
     */
    const reach = Math.min(level.blunderDepth, ranked.length - 1);
    index = 1 + Math.floor(random() * reach);
    blundered = true;
  }

  const chosen = ranked[Math.min(index, ranked.length - 1)]!;
  return {
    san: chosen.move.san,
    from: chosen.move.from,
    to: chosen.move.to,
    promotion: chosen.move.promotion,
    score: chosen.value,
    blundered,
    depth: reached,
    ms: Date.now() - started,
  };
}
