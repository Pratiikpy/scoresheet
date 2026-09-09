/**
 * A chess position built for searching millions of them a second — `SPEC.md` K1.
 *
 * ## Why this exists at all, when `chess.js` is already here and correct
 *
 * `chess.js` is the authority on the *rules* everywhere else in this project, and it stays that way:
 * it parses SAN, writes PGN, decides legality, and it is tested by far more people than this file
 * will ever be. What it is not is fast. Measured, twenty thousand calls on one middlegame position:
 *
 *     moves({ verbose: true })   19418 ms      971 µs each
 *     moves()                     1755 ms       88 µs each
 *     move() + undo()             1663 ms       83 µs each
 *     evaluate()                    37 ms      1.85 µs each
 *
 * A search spends its whole life doing exactly the three expensive things and almost none of the
 * cheap one, and at 170 µs per node the engine reached **depth one** inside a 300 ms budget. Depth
 * one cannot see a two-move tactic, and an analysis built on it called `17...Be6` — the most famous
 * move in Byrne–Fischer 1956 — a blunder. That is not a feature that can ship: a report that
 * slanders good moves is worse than no report.
 *
 * So the search gets its own board. This is the standard **0x88** representation, which is decades
 * old, written up everywhere, and chosen here for one property above all: *it is simple enough to
 * get exactly right*. An engine that is fast and subtly wrong is worse than the slow one it
 * replaced, and the way that failure arrives is always an obscure rule — en passant into check, a
 * castle through an attacked square, a promotion capture that forgets to remove a rook's castling
 * right.
 *
 * ## How it is kept honest
 *
 * **Perft.** Every legal move sequence to a given depth is counted and compared against numbers
 * that have been published and independently reproduced for decades, from positions chosen
 * specifically because they break naive generators. `position.test.ts` runs them, and it also
 * cross-checks the generated move list against `chess.js` on thousands of positions reached by
 * random play, which catches anything perft's totals happen to cancel out.
 *
 * ## The representation
 *
 * The board is 128 squares: an 8×8 board in the low nibble of each rank and eight junk squares
 * beside it. The whole point is the off-board test — `square & 0x88` is non-zero exactly when a
 * square has fallen off the edge, so sliding a piece needs no bounds arithmetic at all. Square 0 is
 * a1 and square 0x77 is h8.
 */

/* ------------------------------------------------------------------ pieces */

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE = 0;
export const BLACK = 1;

/** A piece is its type plus a colour bit, so `piece >> 3` is the colour and `piece & 7` the type. */
export const piece = (colour: number, type: number): number => (colour << 3) | type;
export const colourOf = (value: number): number => value >> 3;
export const typeOf = (value: number): number => value & 7;

/* ------------------------------------------------------------------ castling rights */

export const WHITE_KING_SIDE = 1;
export const WHITE_QUEEN_SIDE = 2;
export const BLACK_KING_SIDE = 4;
export const BLACK_QUEEN_SIDE = 8;

/* ------------------------------------------------------------------ move encoding */

/*
 * One move in one 32-bit integer, so a move list is a plain `Int32Array` and generating one
 * allocates nothing. What is *not* packed in is the captured piece: that lives on the undo stack,
 * because putting it here would mean the same information in two places and one of them going
 * stale.
 */
const FROM_MASK = 0xff;
const TO_SHIFT = 8;
const PROMOTION_SHIFT = 16;
const FLAG_SHIFT = 19;

export const FLAG_CAPTURE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_DOUBLE_PUSH = 4;
export const FLAG_KING_CASTLE = 8;
export const FLAG_QUEEN_CASTLE = 16;

export const encodeMove = (from: number, to: number, promotion: number, flags: number): number =>
  from | (to << TO_SHIFT) | (promotion << PROMOTION_SHIFT) | (flags << FLAG_SHIFT);

export const moveFrom = (move: number): number => move & FROM_MASK;
export const moveTo = (move: number): number => (move >> TO_SHIFT) & 0xff;
export const movePromotion = (move: number): number => (move >> PROMOTION_SHIFT) & 7;
export const moveFlags = (move: number): number => (move >> FLAG_SHIFT) & 31;

/* ------------------------------------------------------------------ geometry */

const KNIGHT_STEPS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_STEPS = [-17, -15, 15, 17];
const ROOK_STEPS = [-16, -1, 1, 16];
const KING_STEPS = [-17, -16, -15, -1, 1, 15, 16, 17];

const onBoard = (square: number): boolean => (square & 0x88) === 0;

/*
 * Hoisted, because these are read on the hottest path in the program.
 *
 * A `for (const side of [-1, 1])` inside `attacked` allocates a two-element array on every call, and
 * `attacked` is called on every move made — tens of millions of times in one search. The arrays
 * below are read, never written.
 */
const PROMOTIONS = [QUEEN, ROOK, BISHOP, KNIGHT];
const SIDES = [-1, 1];

/** `a1` is 0 and `h8` is 0x77. Files run along the low nibble; ranks step by sixteen. */
export const squareOf = (file: number, rank: number): number => rank * 16 + file;
export const fileOf = (square: number): number => square & 15;
export const rankOf = (square: number): number => square >> 4;

const FILES = 'abcdefgh';

export function squareName(square: number): string {
  return `${FILES[fileOf(square)]}${rankOf(square) + 1}`;
}

export function squareFromName(name: string): number {
  const file = FILES.indexOf(name[0] ?? '');
  const rank = Number(name[1]) - 1;
  if (file < 0 || !Number.isInteger(rank) || rank < 0 || rank > 7) return -1;
  return squareOf(file, rank);
}

/**
 * Which castling rights survive a move touching each square.
 *
 * A lookup rather than four comparisons per move, and — more importantly — keyed on the **square**
 * rather than on the piece. A rook *captured* on h8 must cost Black the king-side right just as
 * surely as a rook that moved off it, and a rights update written in terms of the moving piece
 * silently drops exactly that case. It is what the Kiwipete perft position exists to catch.
 */
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[squareOf(4, 0)] = 15 & ~(WHITE_KING_SIDE | WHITE_QUEEN_SIDE);
CASTLE_MASK[squareOf(0, 0)] = 15 & ~WHITE_QUEEN_SIDE;
CASTLE_MASK[squareOf(7, 0)] = 15 & ~WHITE_KING_SIDE;
CASTLE_MASK[squareOf(4, 7)] = 15 & ~(BLACK_KING_SIDE | BLACK_QUEEN_SIDE);
CASTLE_MASK[squareOf(0, 7)] = 15 & ~BLACK_QUEEN_SIDE;
CASTLE_MASK[squareOf(7, 7)] = 15 & ~BLACK_KING_SIDE;


/* ------------------------------------------------------------------ Zobrist hashing */

/**
 * Random numbers for the hash, one per (piece, square), plus side, castling and en passant file.
 *
 * **Seeded, not `Math.random()`.** A transposition table keyed on a hash that changes between runs
 * is a table whose bugs cannot be reproduced, and reproducibility is the only reason a chess engine
 * is debuggable at all. The generator is a plain xorshift — it needs to be well-spread, not
 * cryptographic.
 *
 * Two 32-bit halves rather than a `BigInt`: `BigInt` arithmetic in a hot loop is roughly two orders
 * of magnitude slower than integer XOR, and 64 bits of key is what keeps collisions rare enough to
 * ignore in a table this size.
 */
function randomTable(count: number): Int32Array {
  const values = new Int32Array(count);
  let state = 0x2545f491;
  for (let index = 0; index < count; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    values[index] = state | 0;
  }
  return values;
}

const ZOBRIST_LOW = randomTable(16 * 128);
const ZOBRIST_HIGH = randomTable(16 * 128);
const ZOBRIST_CASTLE_LOW = randomTable(16);
const ZOBRIST_CASTLE_HIGH = randomTable(16);
const ZOBRIST_EP_LOW = randomTable(8);
const ZOBRIST_EP_HIGH = randomTable(8);
const ZOBRIST_SIDE = randomTable(2);
const ZOBRIST_SIDE_LOW = ZOBRIST_SIDE[0]!;
const ZOBRIST_SIDE_HIGH = ZOBRIST_SIDE[1]!;

interface Undo {
  move: number;
  captured: number;
  castling: number;
  enPassant: number;
  halfmove: number;
  hashLow: number;
  hashHigh: number;
}

/**
 * A position, and everything needed to unmake the moves played from it.
 *
 * Mutable on purpose. A search makes and unmakes tens of millions of moves; a representation that
 * copied itself per move would spend all of its time in the garbage collector, which is precisely
 * the cost this file exists to remove.
 */
export class Position {
  /** 128 squares. Index 0 is a1; anything with `square & 0x88` set is off the board. */
  readonly board = new Int8Array(128);
  /** Where each side's king is, tracked rather than searched for — legality asks on every move. */
  readonly kings = [-1, -1];
  turn = WHITE;
  castling = 0;
  /** The square a pawn may capture *onto*, or −1. */
  enPassant = -1;
  halfmove = 0;
  fullmove = 1;
  hashLow = 0;
  hashHigh = 0;

  private readonly undos: Undo[] = [];

  /* ---------------------------------------------------------------- setup */

  static fromFen(fen: string): Position {
    const position = new Position();
    const [placement, side, castling, enPassant, halfmove, fullmove] = fen.trim().split(/\s+/);

    /*
     * File and rank are tracked separately rather than by arithmetic on a 0x88 index.
     *
     * A FEN is written from rank 8 down and from the a-file across, and the obvious "add sixteen,
     * subtract the file" trick to wrap a row is exactly the sort of cleverness that reads a
     * `8/8/8/8/8/8/8/8` correctly and a real position one square out.
     */
    let file = 0;
    let rank = 7;
    for (const character of placement ?? '') {
      if (character === '/') {
        file = 0;
        rank -= 1;
        continue;
      }
      if (character >= '1' && character <= '8') {
        file += Number(character);
        continue;
      }
      const type = 'pnbrqk'.indexOf(character.toLowerCase()) + 1;
      const colour = character === character.toLowerCase() ? BLACK : WHITE;
      const square = squareOf(file, rank);
      position.board[square] = piece(colour, type);
      if (type === KING) position.kings[colour] = square;
      file += 1;
    }

    position.turn = side === 'b' ? BLACK : WHITE;
    if (castling?.includes('K')) position.castling |= WHITE_KING_SIDE;
    if (castling?.includes('Q')) position.castling |= WHITE_QUEEN_SIDE;
    if (castling?.includes('k')) position.castling |= BLACK_KING_SIDE;
    if (castling?.includes('q')) position.castling |= BLACK_QUEEN_SIDE;
    position.enPassant = enPassant && enPassant !== '-' ? squareFromName(enPassant) : -1;
    position.enPassant = position.capturableEnPassant(position.enPassant);
    position.halfmove = Number(halfmove ?? 0) || 0;
    position.fullmove = Number(fullmove ?? 1) || 1;
    position.rehash();
    return position;
  }

  /** The FEN. Written for tests and debugging, never on the search's path. */
  fen(): string {
    let placement = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const value = this.board[squareOf(file, rank)]!;
        if (value === EMPTY) {
          empty += 1;
          continue;
        }
        if (empty > 0) {
          placement += String(empty);
          empty = 0;
        }
        const letter = ' pnbrqk'[typeOf(value)]!;
        placement += colourOf(value) === WHITE ? letter.toUpperCase() : letter;
      }
      if (empty > 0) placement += String(empty);
      if (rank > 0) placement += '/';
    }

    let rights = '';
    if (this.castling & WHITE_KING_SIDE) rights += 'K';
    if (this.castling & WHITE_QUEEN_SIDE) rights += 'Q';
    if (this.castling & BLACK_KING_SIDE) rights += 'k';
    if (this.castling & BLACK_QUEEN_SIDE) rights += 'q';

    return [
      placement,
      this.turn === WHITE ? 'w' : 'b',
      rights || '-',
      this.enPassant >= 0 ? squareName(this.enPassant) : '-',
      String(this.halfmove),
      String(this.fullmove),
    ].join(' ');
  }

  /**
   * The en passant square, but only when somebody can actually take there.
   *
   * A double push always *creates* the square; it does not always create a capture. Recording it
   * regardless gives two different hashes to two positions that are identical in every way that
   * matters, which costs transposition-table hits for nothing — and it disagrees with `chess.js`,
   * which follows the same rule, so the two boards would report different FENs for the same game.
   */
  capturableEnPassant(square: number): number {
    if (square < 0) return -1;
    const them = this.turn;
    const behind = them === WHITE ? -16 : 16;
    for (let index = 0; index < 2; index++) {
      const from = square + behind + SIDES[index]!;
      if (onBoard(from) && this.board[from] === piece(them, PAWN)) return square;
    }
    return -1;
  }

  /** Recompute the hash from scratch. Used at setup and by the test that proves the increments. */
  rehash(): void {
    let low = 0;
    let high = 0;
    for (let square = 0; square < 128; square++) {
      if (!onBoard(square)) continue;
      const value = this.board[square]!;
      if (value === EMPTY) continue;
      low ^= ZOBRIST_LOW[value * 128 + square]!;
      high ^= ZOBRIST_HIGH[value * 128 + square]!;
    }
    low ^= ZOBRIST_CASTLE_LOW[this.castling]!;
    high ^= ZOBRIST_CASTLE_HIGH[this.castling]!;
    if (this.enPassant >= 0) {
      low ^= ZOBRIST_EP_LOW[fileOf(this.enPassant)]!;
      high ^= ZOBRIST_EP_HIGH[fileOf(this.enPassant)]!;
    }
    if (this.turn === BLACK) {
      low ^= ZOBRIST_SIDE_LOW;
      high ^= ZOBRIST_SIDE_HIGH;
    }
    this.hashLow = low | 0;
    this.hashHigh = high | 0;
  }

  /** The transposition table's key: both halves, as one string, cheap to build and never parsed. */
  key(): string {
    return `${this.hashLow},${this.hashHigh}`;
  }

  /* ---------------------------------------------------------------- attacks */

  /**
   * Is `square` attacked by `by`?
   *
   * Walked outward from the square rather than inward from every enemy piece: the cost then depends
   * on the board's geometry rather than on how many pieces are left, and it is the same routine that
   * answers "am I in check", "may I castle through here" and "is this move legal".
   */
  attacked(square: number, by: number): boolean {
    const board = this.board;

    // Pawns. A white pawn attacks *upward*, so a square is attacked by white from below it.
    const pawnStep = by === WHITE ? -16 : 16;
    for (let index = 0; index < 2; index++) {
      const from = square + pawnStep + SIDES[index]!;
      if (onBoard(from) && board[from] === piece(by, PAWN)) return true;
    }

    for (const step of KNIGHT_STEPS) {
      const from = square + step;
      if (onBoard(from) && board[from] === piece(by, KNIGHT)) return true;
    }

    for (const step of KING_STEPS) {
      const from = square + step;
      if (onBoard(from) && board[from] === piece(by, KING)) return true;
    }

    for (const step of BISHOP_STEPS) {
      for (let from = square + step; onBoard(from); from += step) {
        const value = board[from]!;
        if (value === EMPTY) continue;
        if (colourOf(value) === by) {
          const type = typeOf(value);
          if (type === BISHOP || type === QUEEN) return true;
        }
        break;
      }
    }

    for (const step of ROOK_STEPS) {
      for (let from = square + step; onBoard(from); from += step) {
        const value = board[from]!;
        if (value === EMPTY) continue;
        if (colourOf(value) === by) {
          const type = typeOf(value);
          if (type === ROOK || type === QUEEN) return true;
        }
        break;
      }
    }

    return false;
  }

  inCheck(colour: number = this.turn): boolean {
    return this.attacked(this.kings[colour]!, colour ^ 1);
  }

  /* ---------------------------------------------------------------- generation */

  /**
   * Every pseudo-legal move, appended to `into`, returning how many.
   *
   * *Pseudo*-legal: a move that leaves the king in check is generated here and rejected by
   * `makeMove`. Filtering during generation means answering "would this be a pin?" for every move,
   * which costs more than making the handful of illegal moves and taking them back.
   *
   * Castling is the exception, because its legality is not about the king ending in check — a castle
   * through an attacked square is illegal even though the destination is safe — so it is decided
   * here, where the intermediate square is known.
   */
  generate(into: Int32Array, capturesOnly = false): number {
    const board = this.board;
    const us = this.turn;
    const them = us ^ 1;
    let count = 0;

    const add = (from: number, to: number, promotion: number, flags: number): void => {
      into[count++] = encodeMove(from, to, promotion, flags);
    };

    for (let from = 0; from < 128; from++) {
      if (!onBoard(from)) continue;
      const value = board[from]!;
      if (value === EMPTY || colourOf(value) !== us) continue;
      const type = typeOf(value);

      if (type === PAWN) {
        const step = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const lastRank = us === WHITE ? 7 : 0;

        const ahead = from + step;
        if (!capturesOnly && onBoard(ahead) && board[ahead] === EMPTY) {
          if (rankOf(ahead) === lastRank) {
            for (let index = 0; index < 4; index++) add(from, ahead, PROMOTIONS[index]!, 0);
          } else {
            add(from, ahead, 0, 0);
            const twoAhead = ahead + step;
            if (rankOf(from) === startRank && board[twoAhead] === EMPTY) {
              add(from, twoAhead, 0, FLAG_DOUBLE_PUSH);
            }
          }
        }

        for (let index = 0; index < 2; index++) {
          const to = from + step + SIDES[index]!;
          if (!onBoard(to)) continue;
          const target = board[to]!;
          if (target !== EMPTY && colourOf(target) === them) {
            if (rankOf(to) === lastRank) {
              for (let choice = 0; choice < 4; choice++) {
                add(from, to, PROMOTIONS[choice]!, FLAG_CAPTURE);
              }
            } else {
              add(from, to, 0, FLAG_CAPTURE);
            }
          } else if (to === this.enPassant && target === EMPTY) {
            add(from, to, 0, FLAG_CAPTURE | FLAG_EN_PASSANT);
          }
        }
        continue;
      }

      /*
       * Everything else is a set of directions, walked once or walked until something is in the way.
       *
       * Knights and kings take one step; bishops, rooks and queens keep going. A queen is simply a
       * sliding king, which is why the eight king directions serve both.
       */
      const steps =
        type === KNIGHT ? KNIGHT_STEPS
        : type === BISHOP ? BISHOP_STEPS
        : type === ROOK ? ROOK_STEPS
        : KING_STEPS;
      const sliding = type === BISHOP || type === ROOK || type === QUEEN;

      for (let index = 0; index < steps.length; index++) {
        const step = steps[index]!;
        for (let to = from + step; onBoard(to); to += step) {
          const target = board[to]!;
          if (target === EMPTY) {
            if (!capturesOnly) add(from, to, 0, 0);
            if (!sliding) break;
            continue;
          }
          if (colourOf(target) === them) add(from, to, 0, FLAG_CAPTURE);
          break;
        }
      }
    }

    if (!capturesOnly) {
      /*
       * Castling, decided here rather than left to the legality check.
       *
       * Three conditions, and the middle one is the one naive generators drop: the right must still
       * exist, the squares between must be empty, and **the king must not start in, pass through, or
       * land on an attacked square**. A generator that only checks the destination lets a king
       * castle out of check, which perft catches immediately and a game would not.
       */
      const kingSquare = this.kings[us]!;
      const kingSide = us === WHITE ? WHITE_KING_SIDE : BLACK_KING_SIDE;
      const queenSide = us === WHITE ? WHITE_QUEEN_SIDE : BLACK_QUEEN_SIDE;

      if (this.castling & kingSide) {
        const through = kingSquare + 1;
        const to = kingSquare + 2;
        if (
          board[through] === EMPTY &&
          board[to] === EMPTY &&
          !this.attacked(kingSquare, them) &&
          !this.attacked(through, them) &&
          !this.attacked(to, them)
        ) {
          add(kingSquare, to, 0, FLAG_KING_CASTLE);
        }
      }

      if (this.castling & queenSide) {
        const through = kingSquare - 1;
        const to = kingSquare - 2;
        // b1 (or b8) must be empty for the rook to pass, but the king never stands on it, so it is
        // not checked for attacks.
        const rookPath = kingSquare - 3;
        if (
          board[through] === EMPTY &&
          board[to] === EMPTY &&
          board[rookPath] === EMPTY &&
          !this.attacked(kingSquare, them) &&
          !this.attacked(through, them) &&
          !this.attacked(to, them)
        ) {
          add(kingSquare, to, 0, FLAG_QUEEN_CASTLE);
        }
      }
    }

    return count;
  }

  /* ---------------------------------------------------------------- make and unmake */

  private toggle(value: number, square: number): void {
    this.hashLow ^= ZOBRIST_LOW[value * 128 + square]!;
    this.hashHigh ^= ZOBRIST_HIGH[value * 128 + square]!;
  }

  /**
   * Play a pseudo-legal move. Returns `false` — having taken it back — if it left the king in check.
   *
   * The caller therefore never has to think about legality: a move that returns `true` is legal and
   * has been played, and a move that returns `false` has changed nothing.
   */
  makeMove(move: number): boolean {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const promotion = movePromotion(move);
    const moving = board[from]!;
    const us = colourOf(moving);
    const them = us ^ 1;

    const capturedSquare =
      flags & FLAG_EN_PASSANT ? to + (us === WHITE ? -16 : 16) : to;
    const captured = board[capturedSquare]!;

    this.undos.push({
      move,
      captured,
      castling: this.castling,
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      hashLow: this.hashLow,
      hashHigh: this.hashHigh,
    });

    if (captured !== EMPTY) {
      board[capturedSquare] = EMPTY;
      this.toggle(captured, capturedSquare);
    }

    board[from] = EMPTY;
    this.toggle(moving, from);
    const landed = promotion ? piece(us, promotion) : moving;
    board[to] = landed;
    this.toggle(landed, to);

    if (typeOf(moving) === KING) this.kings[us] = to;

    if (flags & FLAG_KING_CASTLE) {
      const rookFrom = to + 1;
      const rookTo = to - 1;
      const rook = board[rookFrom]!;
      board[rookFrom] = EMPTY;
      board[rookTo] = rook;
      this.toggle(rook, rookFrom);
      this.toggle(rook, rookTo);
    } else if (flags & FLAG_QUEEN_CASTLE) {
      const rookFrom = to - 2;
      const rookTo = to + 1;
      const rook = board[rookFrom]!;
      board[rookFrom] = EMPTY;
      board[rookTo] = rook;
      this.toggle(rook, rookFrom);
      this.toggle(rook, rookTo);
    }

    /*
     * Castling rights, revoked by the *squares* involved rather than by the pieces.
     *
     * Keyed on `from` and `to` so a rook being captured on its home square loses the right just as
     * surely as a rook moving off it — the case that a rights table keyed only on the moving piece
     * silently drops, and that perft's Kiwipete position exists to catch.
     */
    this.hashLow ^= ZOBRIST_CASTLE_LOW[this.castling]!;
    this.hashHigh ^= ZOBRIST_CASTLE_HIGH[this.castling]!;
    this.castling &= CASTLE_MASK[from]! & CASTLE_MASK[to]!;
    this.hashLow ^= ZOBRIST_CASTLE_LOW[this.castling]!;
    this.hashHigh ^= ZOBRIST_CASTLE_HIGH[this.castling]!;

    if (this.enPassant >= 0) {
      this.hashLow ^= ZOBRIST_EP_LOW[fileOf(this.enPassant)]!;
      this.hashHigh ^= ZOBRIST_EP_HIGH[fileOf(this.enPassant)]!;
    }
    // `capturableEnPassant` is asked *after* the turn is known to be theirs, so it looks for their
    // pawns — which is why the side is flipped further down rather than here.
    this.turn = them;
    this.enPassant = flags & FLAG_DOUBLE_PUSH ? this.capturableEnPassant((from + to) / 2) : -1;
    this.turn = us;
    if (this.enPassant >= 0) {
      this.hashLow ^= ZOBRIST_EP_LOW[fileOf(this.enPassant)]!;
      this.hashHigh ^= ZOBRIST_EP_HIGH[fileOf(this.enPassant)]!;
    }

    this.halfmove = typeOf(moving) === PAWN || captured !== EMPTY ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove += 1;

    this.turn = them;
    this.hashLow ^= ZOBRIST_SIDE_LOW;
    this.hashHigh ^= ZOBRIST_SIDE_HIGH;

    // The one legality question left: did that leave our own king attacked?
    if (this.attacked(this.kings[us]!, them)) {
      this.unmakeMove();
      return false;
    }
    return true;
  }

  unmakeMove(): void {
    const undo = this.undos.pop();
    if (!undo) return;

    const board = this.board;
    const move = undo.move;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const promotion = movePromotion(move);
    const landed = board[to]!;
    const us = colourOf(landed);

    board[to] = EMPTY;
    board[from] = promotion ? piece(us, PAWN) : landed;
    if (typeOf(board[from]!) === KING) this.kings[us] = from;

    if (undo.captured !== EMPTY) {
      const capturedSquare = flags & FLAG_EN_PASSANT ? to + (us === WHITE ? -16 : 16) : to;
      board[capturedSquare] = undo.captured;
    }

    if (flags & FLAG_KING_CASTLE) {
      const rook = board[to - 1]!;
      board[to - 1] = EMPTY;
      board[to + 1] = rook;
    } else if (flags & FLAG_QUEEN_CASTLE) {
      const rook = board[to + 1]!;
      board[to + 1] = EMPTY;
      board[to - 2] = rook;
    }

    this.castling = undo.castling;
    this.enPassant = undo.enPassant;
    this.halfmove = undo.halfmove;
    this.hashLow = undo.hashLow;
    this.hashHigh = undo.hashHigh;
    if (this.turn === WHITE) this.fullmove -= 1;
    this.turn = us;
  }

  /**
   * A null move: pass the turn without moving anything.
   *
   * Used by null-move pruning in the search — the argument being that if a player can skip a move
   * and *still* be winning, the position is good enough to stop looking at. Nothing else in chess
   * lets a side pass, so it exists only for the search and is never generated as a move.
   */
  makeNull(): void {
    this.undos.push({
      move: 0,
      captured: EMPTY,
      castling: this.castling,
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      hashLow: this.hashLow,
      hashHigh: this.hashHigh,
    });
    if (this.enPassant >= 0) {
      this.hashLow ^= ZOBRIST_EP_LOW[fileOf(this.enPassant)]!;
      this.hashHigh ^= ZOBRIST_EP_HIGH[fileOf(this.enPassant)]!;
    }
    this.enPassant = -1;
    this.turn ^= 1;
    this.hashLow ^= ZOBRIST_SIDE_LOW;
    this.hashHigh ^= ZOBRIST_SIDE_HIGH;
  }

  unmakeNull(): void {
    const undo = this.undos.pop();
    if (!undo) return;
    this.castling = undo.castling;
    this.enPassant = undo.enPassant;
    this.halfmove = undo.halfmove;
    this.hashLow = undo.hashLow;
    this.hashHigh = undo.hashHigh;
    this.turn ^= 1;
  }

  /** Long algebraic — `e2e4`, `e7e8q`. The one move notation this file speaks. */
  static describe(move: number): string {
    const promotion = movePromotion(move);
    return (
      squareName(moveFrom(move)) +
      squareName(moveTo(move)) +
      (promotion ? ' pnbrqk'[promotion]! : '')
    );
  }
}

/**
 * Count every legal move sequence to `depth`.
 *
 * The only test a move generator really has. Published counts exist for a handful of positions
 * chosen precisely because they break naive implementations — en passant that would expose the king,
 * castling rights lost by a captured rook, promotions with check — and a generator that matches them
 * to depth five is a generator that is right.
 */
export function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = new Int32Array(256);
  const count = position.generate(moves);
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (!position.makeMove(moves[index]!)) continue;
    total += depth === 1 ? 1 : perft(position, depth - 1);
    position.unmakeMove();
  }
  return total;
}

/** Perft, split by first move — how anybody has ever found the one move a generator gets wrong. */
export function perftDivide(position: Position, depth: number): Map<string, number> {
  const results = new Map<string, number>();
  const moves = new Int32Array(256);
  const count = position.generate(moves);
  for (let index = 0; index < count; index++) {
    const move = moves[index]!;
    if (!position.makeMove(move)) continue;
    results.set(Position.describe(move), depth === 1 ? 1 : perft(position, depth - 1));
    position.unmakeMove();
  }
  return results;
}
