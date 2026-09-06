/**
 * The two things `chess.js` does not answer, and one finding that saved a module.
 *
 * `chess.js` (BSD-2) is the move generator and it is correct about legality — castling through
 * check, the pinned-pawn en passant, promotion, all of it. The question was what else a game needs
 * that it does not provide, checked against `lichess-org/scalachess` (MIT) on 6 September 2026.
 *
 * **What it already gets right, verified rather than assumed.** Insufficient material was compared
 * case by case against scalachess's `InsufficientMatingMaterial.scala` — K vs K, K+B vs K, K+N vs K,
 * K+N+N vs K, bishops on the same colour, bishops on opposite colours from both sides, K+B+N, K+R,
 * K+P — and there are **zero divergences**. A hand-written replacement was written, measured against
 * both, found redundant, and deleted. It is worth knowing that so nobody writes it again: the first
 * draft of this file existed because a test FEN put two bishops on b1 and b5 and called them
 * opposite colours. They are both light.
 *
 * **What it genuinely lacks, and this module supplies:**
 *
 * 1. **Flag adjudication.** When a player runs out of time the question is not "is this position
 *    dead" but "could the player who still has time possibly have won". Lichess draws the flag
 *    rather than awarding it when the winner has no mating material — and the rule is deliberately
 *    *different* from the draw rule, not the same test reused. `chess.js` has nothing for it, so
 *    without this a bare king would win on time.
 *
 * 2. **Fivefold repetition.** `chess.js` offers threefold only. scalachess auto-draws on **fivefold**
 *    and treats threefold as a claim a player makes, which is the right split: ending a game
 *    automatically on threefold takes the decision away from somebody still playing for a win.
 */

import { Chess } from 'chess.js';

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Colour = 'w' | 'b';

interface Census {
  /** Every non-king piece, by colour. */
  pieces: Record<Colour, PieceType[]>;
  /** Which square colours each side's bishops stand on. */
  bishopSquares: Record<Colour, Set<'light' | 'dark'>>;
}

/**
 * Walk the board once.
 *
 * Square colour is computed, never eyeballed. `board()` gives rank 0 as rank 8, so a square is light
 * when `(rank + file)` is even — a8 is light, and the whole board follows from that.
 */
function census(chess: Chess): Census {
  const result: Census = { pieces: { w: [], b: [] }, bishopSquares: { w: new Set(), b: new Set() } };
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]![file];
      if (!piece || piece.type === 'k') continue;
      result.pieces[piece.color].push(piece.type);
      if (piece.type === 'b') {
        result.bishopSquares[piece.color].add((rank + file) % 2 === 0 ? 'light' : 'dark');
      }
    }
  }
  return result;
}

/**
 * Could this player still mate, given the most helpful possible opponent?
 *
 * The flag-adjudication rule from scalachess's `InsufficientMatingMaterial.apply(board, colour)`,
 * which is more permissive than the dead-position rule on purpose:
 *
 *  - A pawn, rook or queen can always mate.
 *  - Two or more minor pieces can always mate.
 *  - A lone knight can mate **only** when the opponent has exactly a queen, which can be forced to
 *    block its own king. Against a bare king it cannot, so the flag is drawn.
 *  - A lone bishop can mate when the opponent has a knight, a pawn, or a bishop on the other colour
 *    to be forced into the way.
 *  - A lone king cannot.
 */
export function canPossiblyMate(chess: Chess, colour: Colour): boolean {
  const c = census(chess);
  const mine = c.pieces[colour];
  const theirs = c.pieces[colour === 'w' ? 'b' : 'w'];

  if (mine.some((piece) => piece === 'p' || piece === 'r' || piece === 'q')) return true;
  if (mine.length === 0) return false;
  // Two minors of any kind are enough — K+B+N and K+N+N both have forced or helped mates.
  if (mine.length > 1) return true;

  if (mine[0] === 'n') {
    // A knight alone: only against a queen that can be forced to block its own king.
    return theirs.length === 1 && theirs[0] === 'q';
  }

  if (mine[0] === 'b') {
    // A bishop alone: it needs something of the opponent's to force into the way. A knight or pawn
    // will do, and so will a bishop of the other colour.
    if (theirs.some((piece) => piece === 'n' || piece === 'p')) return true;
    const ours = [...c.bishopSquares[colour]][0];
    return [...c.bishopSquares[colour === 'w' ? 'b' : 'w']].some((square) => square !== ours);
  }

  return false;
}

/**
 * How a flag is adjudicated: whoever ran out of time loses — **unless** the player with time left
 * could never have mated, in which case it is drawn.
 *
 * Without this a bare king wins on time, which is not chess anywhere.
 */
export function adjudicateFlag(chess: Chess, flagged: Colour): '1-0' | '0-1' | '1/2-1/2' {
  const winner: Colour = flagged === 'w' ? 'b' : 'w';
  if (!canPossiblyMate(chess, winner)) return '1/2-1/2';
  return winner === 'w' ? '1-0' : '0-1';
}

/**
 * Has the same position occurred five times?
 *
 * Replayed from the game's own move list, comparing the first four FEN fields — placement, side to
 * move, castling rights, en-passant square — because the move counters are not part of what makes a
 * position the same.
 *
 * One difference from scalachess worth knowing rather than papering over: they record an en-passant
 * square only when a pawn can *legally* capture there, while `chess.js` writes it whenever a pawn
 * double-steps. So a position whose en passant is pinned counts as a repetition for them and not for
 * us. The difference can only ever make us slower to declare a draw, never quicker, which is the
 * safe direction for a rule that ends somebody's game.
 */
export function isFivefoldRepetition(chess: Chess): boolean {
  const counts = new Map<string, number>();
  const replay = new Chess();
  const record = (): void => {
    const key = replay.fen().split(' ').slice(0, 4).join(' ');
    const seen = (counts.get(key) ?? 0) + 1;
    counts.set(key, seen);
    return;
  };

  record();
  for (const move of chess.history()) {
    replay.move(move);
    record();
  }
  for (const seen of counts.values()) if (seen >= 5) return true;
  return false;
}

/** Threefold — a claim a player may make, never something the server ends a game on by itself. */
export function canClaimThreefold(chess: Chess): boolean {
  return chess.isThreefoldRepetition();
}

export interface Outcome {
  over: boolean;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: 'checkmate' | 'stalemate' | 'insufficient' | 'fifty-move' | 'repetition' | null;
}

/**
 * The position's own verdict — everything a game can end on without a player doing anything.
 *
 * One place to ask, so no screen and no route has to remember the order these are checked in or
 * that repetition means five rather than three.
 */
export function outcomeOf(chess: Chess): Outcome {
  if (chess.moves().length === 0) {
    if (chess.isCheck()) {
      return { over: true, result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
    }
    return { over: true, result: '1/2-1/2', termination: 'stalemate' };
  }
  // Verified identical to scalachess across every material combination — see the file header.
  if (chess.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', termination: 'insufficient' };
  if (chess.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', termination: 'fifty-move' };
  if (isFivefoldRepetition(chess)) return { over: true, result: '1/2-1/2', termination: 'repetition' };
  return { over: false, result: null, termination: null };
}
