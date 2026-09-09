/**
 * The evaluation network — a Stockfish-class judge for Game Review, under a licence we can ship.
 *
 * ## What this is, and why it exists
 *
 * Our own evaluation is hand-written and club strength: enough to find the blunders in an ordinary
 * game, not enough to be trusted about anything subtle. Game Review is exactly the feature where
 * that gap shows, because it is the one place the app tells somebody they were wrong.
 *
 * The obvious fix is Stockfish and it is not available to us — Stockfish is **GPL-3**, this
 * repository is MIT, and shipping it would put GPL code in an MIT bundle. So this reads **akimbo
 * v1.0.0's network** instead: MIT, self-generated training data, 6.3 MB, and around 3500 on CCRL
 * Blitz in its own engine. `scripts/vendor-nnue.mjs` explains the licence reasoning and why the
 * v1.0.0 tag specifically.
 *
 * ## Ported, not invented
 *
 * Every constant, index and rounding step here comes from reading `src/network.rs` and
 * `src/position.rs` at that tag. Nothing is inferred from how NNUE "usually" works, because the
 * details that differ between engines — the king-bucket table, the file mirroring, where the
 * truncating divisions fall — are exactly the ones that produce a plausible number that is wrong.
 *
 * The proof that the port is faithful is not this comment. It is `scripts/nnue-agrees.mjs`, which
 * runs positions through **the real akimbo binary** and this code and requires the two to agree to
 * the centipawn. Integer arithmetic throughout means "close" would be a failure, not a rounding
 * difference.
 *
 * ## The architecture, stated exactly
 *
 * A `(768 × 4 → 1024)×2 → 1` perspective network with SCReLU activation:
 *
 *  - **768 inputs per bucket** — 2 colours × 6 piece types × 64 squares, from the point of view of
 *    the side being accumulated for.
 *  - **4 king buckets**, chosen by the accumulating side's own king square after it is mirrored onto
 *    the queenside. The mirroring is why a table of eight values only ever yields four.
 *  - **1024 hidden neurons**, `i16`, quantised with `QA = 255`.
 *  - **Two output vectors**, one for the side to move and one for its opponent, quantised with
 *    `QB = 64`. The side to move is always read first, which is what makes the evaluation
 *    side-relative rather than absolute.
 *
 * ## How it is made fast, without touching the move generator
 *
 * A from-scratch accumulator costs 32 pieces × 1024 `i16` additions, and it was measured at **77 µs
 * against the hand-written evaluation's 0.76 µs — 101 times slower**. At that handicap the network
 * *lost* on the puzzle suite (89% against 91%), because the depth it gave up was worth more than the
 * judgement it bought.
 *
 * The usual fix is to maintain the accumulator across make and unmake, which means putting mutable
 * state in the middle of the move generator — the most correctness-critical code in the app.
 * **akimbo does something better and this is a port of it**: a small cache of accumulators, keyed by
 * the two king buckets, each remembering the board it was built from. Evaluating diffs the current
 * board against the remembered one and applies only the pieces that moved.
 *
 * It works because consecutive positions in a search differ by two or three pieces, so the update is
 * two or three feature vectors instead of thirty-two. Keying on the buckets is what makes it correct
 * across a king move: a king that crosses a bucket boundary lands on a *different* cache entry, with
 * its own remembered board, so the mirroring and the bucket can never be stale.
 *
 * Nothing in `position.ts` changes. The move generator does not know this exists.
 *
 * The bot does not use it either. A weak opponent that answers instantly is the point of the bot,
 * and a 6.3 MB download to make it stronger is the opposite of what somebody opening a chess app
 * wants.
 */

import { BISHOP, KING, KNIGHT, QUEEN, ROOK, WHITE, colourOf, typeOf } from './position.ts';
import type { Position } from './position.ts';

export const NNUE_HIDDEN = 1024;
export const NNUE_BUCKETS = 4;

/** Quantisation and output scaling, from `network.rs`. Changing one without the net is nonsense. */
const QA = 255;
const QB = 64;
const QAB = QA * QB;
const SCALE = 400;

const FEATURE_VECTORS = 768 * NNUE_BUCKETS;

/**
 * Which bucket a king square selects.
 *
 * Eight distinct values for what is documented as four buckets, and the resolution is the file
 * mirroring: a king on the kingside is folded onto the queenside before this is read, so only
 * columns 0–3 are ever indexed and only 0–3 are ever returned. Columns 4–7 are unreachable, and
 * transcribing the table without them would be a silent change to the network's meaning.
 */
const BUCKET_OF = new Uint8Array([
  0, 0, 1, 1, 5, 5, 4, 4,
  2, 2, 2, 2, 6, 6, 6, 6,
  3, 3, 3, 3, 7, 7, 7, 7,
  3, 3, 3, 3, 7, 7, 7, 7,
  3, 3, 3, 3, 7, 7, 7, 7,
  3, 3, 3, 3, 7, 7, 7, 7,
  3, 3, 3, 3, 7, 7, 7, 7,
  3, 3, 3, 3, 7, 7, 7, 7,
]);

/**
 * Piece values for the material scaling akimbo applies after the network speaks.
 *
 * Indexed by our own piece constants rather than akimbo's, and pawns and kings are zero there too —
 * the scaling is about how much material is left to play with, and neither of those ever leaves.
 */
const SEE_VALUE = new Int32Array(7);
SEE_VALUE[KNIGHT] = 450;
SEE_VALUE[BISHOP] = 450;
SEE_VALUE[ROOK] = 650;
SEE_VALUE[QUEEN] = 1250;

export class NnueError extends Error {
  override readonly name = 'NnueError';
}

/** A loaded network: the weights, and the ability to evaluate a position with them. */
export interface Nnue {
  /**
   * The evaluation in centipawns, **from the side to move's point of view**.
   *
   * Positive means the side to move is better, which is the convention our search already uses, so
   * this drops in where the hand-written evaluation was.
   */
  evaluate(position: Position): number;
}

/**
 * Read a network from the bytes `scripts/vendor-nnue.mjs` produced.
 *
 * The length is checked against what the architecture predicts rather than against a number written
 * down, so a file from a different architecture is refused here instead of producing confident
 * nonsense a thousand positions later. The trailing padding is akimbo's `align(64)` on its
 * accumulator struct, and it is expected rather than tolerated — a file *without* it would mean the
 * layout is not the one this code reads.
 */
export function loadNnue(bytes: ArrayBuffer): Nnue {
  const body = (FEATURE_VECTORS * NNUE_HIDDEN + NNUE_HIDDEN + 2 * NNUE_HIDDEN) * 2 + 2;
  const expected = Math.ceil(body / 64) * 64;
  if (bytes.byteLength !== expected) {
    throw new NnueError(`a network is ${expected} bytes, and this one is ${bytes.byteLength}`);
  }

  /*
   * One `Int16Array` over the whole file, with offsets, rather than four copies.
   *
   * 6.3 MB copied per view is 25 MB of garbage for no benefit, on a phone, at the moment somebody
   * pressed a button and is waiting. The views are read-only by convention; nothing here writes.
   */
  const all = new Int16Array(bytes, 0, body >> 1);
  const featureWeights = all.subarray(0, FEATURE_VECTORS * NNUE_HIDDEN);
  const featureBias = all.subarray(FEATURE_VECTORS * NNUE_HIDDEN, (FEATURE_VECTORS + 1) * NNUE_HIDDEN);
  const outputWeights = all.subarray((FEATURE_VECTORS + 1) * NNUE_HIDDEN, (FEATURE_VECTORS + 3) * NNUE_HIDDEN);
  const outputBias = all[(FEATURE_VECTORS + 3) * NNUE_HIDDEN]!;

  /**
   * One cached accumulator pair per pair of king buckets, each remembering the board it was built
   * from — akimbo's `EvalTable`, ported.
   *
   * Sixty-four entries because the bucket table yields eight distinct values per side before the
   * file mirroring is applied, and the *unfolded* value is what keys this. That is the subtle part
   * and it is what makes the cache correct: every square sharing an unfolded bucket also shares a
   * mirroring, so an entry's remembered board is always one this entry's indexing could have
   * produced. A king crossing a boundary moves to a different entry rather than invalidating one.
   *
   * A fresh entry remembers an empty board and holds the feature bias, which is exactly what an
   * empty board evaluates to — so the first position to land on an entry is a full refresh by the
   * ordinary diffing path, with no special case.
   */
  const CACHE = 8;
  const remembered: Int8Array[] = [];
  const whites: Int16Array[] = [];
  const blacks: Int16Array[] = [];
  for (let i = 0; i < CACHE * CACHE; i++) {
    remembered.push(new Int8Array(128));
    const w = new Int16Array(NNUE_HIDDEN);
    const b = new Int16Array(NNUE_HIDDEN);
    w.set(featureBias);
    b.set(featureBias);
    whites.push(w);
    blacks.push(b);
  }

  /** Where the kings are, in bitboard squares. Read once per evaluation; everything depends on it. */
  function kingsOf(board: Int8Array): { white: number; black: number } {
    let white = -1;
    let black = -1;
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const value = board[square]!;
      if (value === 0 || typeOf(value) !== KING) continue;
      if (colourOf(value) === WHITE) white = toBitboardSquare(square);
      else black = toBitboardSquare(square);
    }
    return { white, black };
  }

  function add(accumulator: Int16Array, feature: number): void {
    const offset = feature * NNUE_HIDDEN;
    for (let i = 0; i < NNUE_HIDDEN; i++) {
      accumulator[i] = (accumulator[i]! + featureWeights[offset + i]!) as number;
    }
  }

  function subtract(accumulator: Int16Array, feature: number): void {
    const offset = feature * NNUE_HIDDEN;
    for (let i = 0; i < NNUE_HIDDEN; i++) {
      accumulator[i] = (accumulator[i]! - featureWeights[offset + i]!) as number;
    }
  }

  /**
   * Bring one cache entry up to date with the position, touching only what changed.
   *
   * The board is compared square by square against the one this entry remembers. A square whose
   * occupant changed contributes a subtraction for what was there and an addition for what is there
   * now — which covers moves, captures, promotions, castling and en passant without any of them
   * being a special case, because all of them are ultimately squares whose contents changed.
   *
   * That is the whole speed argument: two or three squares differ between consecutive positions in a
   * search, so this does two or three feature updates where a refresh would do thirty-two.
   */
  function reconcile(entry: number, position: Position, whiteKing: number, blackKing: number): void {
    const board = position.board;
    const cached = remembered[entry]!;
    const white = whites[entry]!;
    const black = blacks[entry]!;

    const whiteFlip = whiteKing % 8 > 3 ? 7 : 0;
    const blackFlip = (blackKing % 8 > 3 ? 7 : 0) ^ 56;
    const whiteBucket = BUCKET_OF[whiteKing ^ whiteFlip]!;
    const blackBucket = BUCKET_OF[(blackKing ^ (blackKing % 8 > 3 ? 7 : 0)) ^ 56]!;

    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const now = board[square]!;
      const before = cached[square]!;
      if (now === before) continue;

      const at = toBitboardSquare(square);

      if (before !== 0) {
        const side = colourOf(before);
        const kind = typeOf(before) - 1;
        subtract(white, 768 * whiteBucket + (side === WHITE ? 0 : 384) + 64 * kind + (at ^ whiteFlip));
        subtract(black, 768 * blackBucket + (side === WHITE ? 384 : 0) + 64 * kind + (at ^ blackFlip));
      }
      if (now !== 0) {
        const side = colourOf(now);
        const kind = typeOf(now) - 1;
        add(white, 768 * whiteBucket + (side === WHITE ? 0 : 384) + 64 * kind + (at ^ whiteFlip));
        add(black, 768 * blackBucket + (side === WHITE ? 384 : 0) + 64 * kind + (at ^ blackFlip));
      }

      cached[square] = now;
    }
  }

  /**
   * SCReLU, summed against one output vector.
   *
   * `clamp(x, 0, QA)` squared, times the weight. Squaring inside the activation is what "screlu"
   * means and it is why the result is divided by `QA` once at the end rather than twice: the extra
   * factor of `QA` from the squaring is cancelled there, not here.
   */
  function flatten(accumulator: Int16Array, weights: Int16Array, from: number): number {
    let sum = 0;
    for (let i = 0; i < NNUE_HIDDEN; i++) {
      const raw = accumulator[i]!;
      const clamped = raw < 0 ? 0 : raw > QA ? QA : raw;
      sum += clamped * clamped * weights[from + i]!;
    }
    return sum;
  }

  return {
    evaluate(position: Position): number {
      const kings = kingsOf(position.board);
      /*
       * A position without both kings has no bucket and no mirroring, so it is refused rather than
       * indexed off the end of a table. The search never produces one — a king capture is not a legal
       * move — which is precisely why this would otherwise go unnoticed until somebody analysed a
       * position typed in by hand.
       */
      if (kings.white < 0 || kings.black < 0) {
        throw new NnueError('a position without both kings cannot be evaluated');
      }

      // **Unfolded** buckets key the cache, and folded ones index the features. Using the folded
      // value here would merge two entries whose mirroring differs, and the accumulator would be
      // built from squares that had been flipped the other way.
      const entry = BUCKET_OF[kings.white]! * CACHE + BUCKET_OF[kings.black ^ 56]!;
      reconcile(entry, position, kings.white, kings.black);

      const white = whites[entry]!;
      const black = blacks[entry]!;

      // The side to move is read against the first output vector. This is what makes the number
      // side-relative, and swapping the two would produce a sign-correct, magnitude-wrong evaluation.
      const boys = position.turn === WHITE ? white : black;
      const opps = position.turn === WHITE ? black : white;
      const sum = flatten(boys, outputWeights, 0) + flatten(opps, outputWeights, NNUE_HIDDEN);

      /*
       * Two truncating divisions, in this order, because that is what the Rust does.
       *
       * `(sum / QA + bias) * SCALE / QAB` with `i32` arithmetic truncates toward zero twice, and
       * doing the division once at the end — which is algebraically the same thing — gives a
       * different integer. `Math.trunc` matches Rust's rounding for negatives, where `Math.floor`
       * would not.
       */
      const raw = Math.trunc((Math.trunc(sum / QA) + outputBias) * SCALE / QAB);

      return scaleForMaterial(position, raw);
    },
  };
}

/**
 * akimbo's material scaling, applied after the network.
 *
 * The network is trained on positions with pieces on the board, and its output is scaled down as
 * they come off — an evaluation of +200 means less in a bare rook ending than in a middlegame. This
 * is part of the engine's evaluation rather than a nicety, so omitting it would make our numbers
 * disagree with akimbo's in exactly the endgames Game Review is most often asked about.
 */
function scaleForMaterial(position: Position, evaluation: number): number {
  let material = 0;
  const board = position.board;
  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const value = board[square]!;
    if (value === 0) continue;
    material += SEE_VALUE[typeOf(value)]!;
  }
  const factor = 700 + Math.trunc(material / 32);
  return Math.trunc((evaluation * factor) / 1024);
}

/** Our 0x88 square to a bitboard square, which is what every index in the network is written in. */
function toBitboardSquare(square: number): number {
  return (square >> 4) * 8 + (square & 15);
}

/** Exported for the agreement script, which needs to know what it is comparing against. */
export const NNUE_SOURCE = 'akimbo v1.0.0 (MIT)';
