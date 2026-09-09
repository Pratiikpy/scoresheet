/**
 * Why the move was bad — said only when it can be proved.
 *
 * Game review today reports a number: *Blunder, −2.8*. That tells a player what happened and nothing
 * about why, and the coaching material is unanimous that the number alone teaches nothing. This file
 * is the other half: given the position before a move, the move played, and what the engine
 * preferred, produce **one true sentence** about what changed — or produce nothing.
 *
 * ## The rule the whole file exists to enforce
 *
 * **Detect symbolically, then template. Never generate, never infer, and prefer silence to a guess.**
 *
 * Every claim below comes from a named predicate over the actual position. No language model is
 * anywhere in the truth-bearing path, and that is a measured decision rather than a stylistic one:
 * the published work on this exact task reports ungrounded generation scoring 0.36 on correctness
 * against 0.60 for concept-grounded, and the largest remaining error class even *with* grounding is
 * invented positional judgement at 28%. A review that says something false once is never trusted
 * again, and a chess player checks. So the honest ceiling is a small set of things decidable by
 * geometry and legal-move enumeration, and everything outside it gets the number and no sentence.
 *
 * ## Two mistakes this file made before it worked, both worth keeping written down
 *
 * - **Asking what was hanging *before* the move returned nothing, always.** Captures are generated
 *   for the side to move, and before your own move it is your turn, so the opponent has no captures
 *   to enumerate. The fix is a **null move** — the same position with the turn flipped — which is
 *   exactly the question being asked: *what could they have taken if it were their move?* Without
 *   it, every hanging piece read as newly hung, including ones that had been hanging for ten moves.
 * - **The fork detector asked the same question from the wrong side.** After the opponent's reply it
 *   is your turn again, so enumerating moves from their forking square produced an empty list and
 *   the detector silently never fired.
 * - **The pin detector had the identical bug and it took a third position to notice.** A pin is
 *   "this piece has no legal move", which only means anything for the side whose turn it is — and
 *   after your own move it is not your turn. Same null-move fix, third time.
 * - **A recapture read as a hung pawn.** `exd5` leaves the pawn on d5 to be taken, and saying so is
 *   true and useless: the move *won* a pawn first, so the exchange is even. The gain a capture makes
 *   is now netted off before anything is called hanging.
 * - **"No legal moves" is not a pin.** An undeveloped rook walled in by its own bishop and knight has
 *   no legal move and is pinned by nothing, and the detector announced it as pinned. The definition
 *   is *removing the piece exposes the king*, and that is now what is asked.
 *
 * ## The detector that was built, measured, and deleted
 *
 * **A fork detector existed here and does not any more.** It proposed forks from geometry — one piece
 * attacking two — and confirmed them by trying every defence. Run over 4,000 real positions by
 * `scripts/explain-sanity.mjs`, **all five forks it claimed were false**: the forking move was
 * typically a check that simply lost the forking piece, which geometry has no way to see.
 *
 * The research said this in advance — a fork cannot be confirmed without search, and geometry alone
 * produces false positives whenever a counter-resource exists — and building it anyway was the
 * cheapest way to find out how badly. A fork can come back the moment the caller passes in the
 * opponent's best reply and its evaluation, because then the claim is the search's rather than a
 * guess dressed as one. Until then, silence: this file's own rule is that a wrong sentence costs
 * more than a missing one, and a detector that was wrong every single time is not a close call.
 *
 * Both were found by testing against positions with known answers rather than by reading the code,
 * which is the argument for the regression suite beside this file.
 *
 * ## What is deliberately not attempted
 *
 * - **Anything about the player's mind.** A position and a move cannot diagnose a thought process.
 * - **Free-form positional judgement.** No predicate, no sentence.
 * - **The engine's evaluation as objective truth.** It is one model's opinion and the wording says so.
 */

import { Chess } from 'chess.js';

export type ExplanationBasis =
  /** Geometry and the rules alone. True or false, with no depth to caveat. */
  | 'geometric'
  /** Read straight off search output the caller already had. */
  | 'search'
  /** Proposed by geometry and confirmed by exhaustive legal-move enumeration. */
  | 'confirmed';

export type ExplanationKind =
  | 'missed-mate'
  | 'allows-mate'
  | 'hangs-piece'
  | 'pin'
  | 'passed-pawn-created'
  | 'passed-pawn-conceded';

export interface Explanation {
  kind: ExplanationKind;
  basis: ExplanationBasis;
  /** One sentence, already true. Plain language, no jargon a beginner has not met. */
  text: string;
  /** Squares worth lighting up. Never more than a reader can hold at once. */
  squares: string[];
  /**
   * How much this explains the loss, 0–100. Ordering only, never shown as a number.
   *
   * A missed mate outranks a hung pawn even when the pawn is geometrically neater, because a reader
   * wants the largest thing that went wrong rather than the tidiest.
   */
  weight: number;
}

export interface ExplainInput {
  /** The position before the move, as FEN. */
  fen: string;
  /** The move actually played, in SAN. */
  played: string;
  /** What the engine preferred, in SAN, when that was something else. */
  best?: string | null | undefined;
  /**
   * Mate distance the engine saw from this position, positive for the side to move.
   *
   * Passed in because the search already computed it. Recomputing here would be slower and would be
   * a second opinion, and two opinions about one position is how a review starts contradicting
   * itself.
   */
  mateIn?: number | null | undefined;
  /** Mate the opponent can force after the played move, if the search found one. */
  mateAgainstAfter?: number | null | undefined;
  /** Centipawns this move cost against the best move. A gate, nothing more. */
  lostCentipawns?: number | undefined;
}

/** Below this, a move is not worth explaining: the reader would be told about noise. */
export const MIN_LOSS_TO_EXPLAIN = 90;

/** What a piece is worth, for deciding whether an exchange actually wins anything. */
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000 };
const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';

function nameOf(type: string): string {
  return NAMES[type] ?? 'piece';
}

function sideName(colour: 'w' | 'b'): string {
  return colour === 'w' ? 'White' : 'Black';
}

function fileOf(square: string): number {
  return FILES.indexOf(square[0]!);
}

function rankOf(square: string): number {
  return Number(square[1]) - 1;
}

/**
 * The same position with the turn handed to the other side — a null move.
 *
 * The question "what could they take, if it were their move?" has no other answer available: every
 * move generator only ever speaks for the side to move. Returns null when the flip would produce an
 * impossible position, which happens exactly when the side about to receive the move is giving
 * check, and in that case there is no meaningful question to ask anyway.
 */
function nullMove(fen: string): string | null {
  const parts = fen.split(' ');
  if (parts.length < 6) return null;
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  // En passant rights belong to the move that was just made; after a null move there is no capture
  // to allow, and leaving the square in place would invent a legal move nobody can play.
  parts[3] = '-';
  const flipped = parts.join(' ');
  try {
    const chess = new Chess(flipped);
    // A position where the side *not* to move is in check is unreachable and chess.js will happily
    // hold it. Reject it rather than reason about it.
    const opponentInCheck = new Chess(fen).inCheck();
    return opponentInCheck ? null : chess.fen();
  } catch {
    return null;
  }
}

function pieces(chess: Chess): { square: string; type: string; colour: 'w' | 'b' }[] {
  const out: { square: string; type: string; colour: 'w' | 'b' }[] = [];
  for (const row of chess.board()) {
    for (const cell of row) if (cell) out.push({ square: cell.square, type: cell.type, colour: cell.color });
  }
  return out;
}

/**
 * Is this pawn passed?
 *
 * Textbook and unambiguous: no enemy pawn on its own file or either adjacent file, on any rank ahead
 * of it. There is no judgement in this predicate, which is why it is among the safest things here.
 */
function isPassedPawn(all: ReturnType<typeof pieces>, square: string, colour: 'w' | 'b'): boolean {
  const file = fileOf(square);
  const rank = rankOf(square);
  const ahead = colour === 'w' ? 1 : -1;

  for (const other of all) {
    if (other.type !== 'p' || other.colour === colour) continue;
    if (Math.abs(fileOf(other.square) - file) > 1) continue;
    const otherRank = rankOf(other.square);
    if (ahead === 1 ? otherRank > rank : otherRank < rank) return false;
  }
  return true;
}

function passedPawns(chess: Chess, colour: 'w' | 'b'): Set<string> {
  const all = pieces(chess);
  return new Set(
    all
      .filter((piece) => piece.type === 'p' && piece.colour === colour && isPassedPawn(all, piece.square, colour))
      .map((piece) => piece.square),
  );
}

/**
 * What the side to move wins by capturing on this square, played out best-first.
 *
 * A static exchange evaluation, and the reason counting attackers is not enough: two attackers
 * against one defender does not win a piece when the attackers are a queen and a rook and the
 * defender is a pawn.
 *
 * Built on chess.js's **legal** move generation rather than on ray-casting, which removes the classic
 * trap by construction: a defender pinned to its own king never appears as a legal recapture, so it
 * is never counted as a defender. Every naive implementation of this has that bug and fixes it with
 * a special case; using legality means there is nothing to special-case.
 */
function exchangeOn(fen: string, square: string, depth = 0): number {
  if (depth > 12) return 0;

  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return 0;
  }

  const target = board.get(square as never);
  if (!target) return 0;

  const captures = board.moves({ verbose: true }).filter((move) => move.to === square && move.captured !== undefined);
  if (captures.length === 0) return 0;

  // Cheapest attacker first — that is how the exchange actually goes, and it is what makes the
  // recursion equal to the real result rather than to an optimistic one.
  captures.sort((a, b) => (VALUE[a.piece] ?? 0) - (VALUE[b.piece] ?? 0));
  const capture = captures[0]!;

  const next = new Chess(fen);
  next.move(capture.san);

  // Standard swap-off: taking is only worth it if what you win exceeds what they win back.
  const won = VALUE[capture.captured!] ?? 0;
  return Math.max(0, won - exchangeOn(next.fen(), square, depth + 1));
}

/**
 * Pieces of `colour` the side to move can simply win.
 *
 * "Hanging" means the exchange comes out ahead, not merely that the square is attacked. A defended
 * knight attacked by a queen is attacked and is not hanging, and saying otherwise would be exactly
 * the confident falsehood this file exists to avoid.
 */
function winnable(fen: string, colour: 'w' | 'b'): Map<string, { type: string; gain: number }> {
  const out = new Map<string, { type: string; gain: number }>();
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return out;
  }
  if (board.turn() === colour) return out;

  for (const piece of pieces(board)) {
    if (piece.colour !== colour || piece.type === 'k') continue;
    const gain = exchangeOn(fen, piece.square);
    if (gain >= 100) out.set(piece.square, { type: piece.type, gain });
  }
  return out;
}

/**
 * Absolute pins — a piece that cannot move because moving it would expose its own king.
 *
 * **The first version of this defined a pin as "no legal moves", and that was wrong in a way that
 * would have shipped a false sentence to players.** An undeveloped rook on h8, walled in by its own
 * bishop and knight, has no legal moves and is not pinned by anything — and the detector duly
 * announced "the rook on h8 is pinned". A negative test caught it; nothing about reading the code
 * would have.
 *
 * So this asks the actual question instead of a proxy for it: **take the piece off the board, and
 * see whether the king is attacked.** That is the definition of an absolute pin, it distinguishes a
 * pinned piece from a merely blocked one, and it cannot drift from the rules the rest of the app
 * plays by because chess.js answers it.
 */
function pinned(fen: string, colour: 'w' | 'b'): Map<string, string> {
  const out = new Map<string, string>();
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return out;
  }
  // A king already in check is a different situation, and every piece would look "pinned" in it.
  if (board.turn() !== colour || board.inCheck()) return out;

  const king = pieces(board).find((piece) => piece.type === 'k' && piece.colour === colour);
  if (!king) return out;

  const canMove = new Set<string>(board.moves({ verbose: true }).map((move) => String(move.from)));
  const opponent = colour === 'w' ? 'b' : 'w';

  for (const piece of pieces(board)) {
    if (piece.colour !== colour) continue;
    // The king cannot be pinned, and a pawn with no moves is usually blocked rather than pinned —
    // saying "your pawn is pinned" about a pawn standing behind another pawn would read as nonsense.
    if (piece.type === 'k' || piece.type === 'p') continue;
    if (canMove.has(piece.square)) continue;

    // Lift the piece and ask whether the king is now attacked. If it is, that piece was the only
    // thing standing in the way, which is exactly what a pin is.
    const without = new Chess(fen);
    without.remove(piece.square as never);
    if (without.isAttacked(king.square as never, opponent)) out.set(piece.square, piece.type);
  }
  return out;
}

/** What a move captures, as a piece letter, or an empty string. */
function captureValueOf(fen: string, san: string): string {
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    return move.captured ?? '';
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ the detectors */

/**
 * Explain one move, or decline to.
 *
 * Findings come back strongest first. **An empty array is a good answer and the common one:** most
 * moves are not bad, and most bad moves are bad for reasons no predicate here can establish.
 */
export function explainMove(input: ExplainInput): Explanation[] {
  const found: Explanation[] = [];

  let before: Chess;
  try {
    before = new Chess(input.fen);
  } catch {
    return [];
  }

  const mover = before.turn();
  const opponent = mover === 'w' ? 'b' : 'w';

  const after = new Chess(input.fen);
  let played: { from: string; to: string; san: string };
  try {
    const result = after.move(input.played);
    played = { from: result.from, to: result.to, san: result.san };
  } catch {
    // An illegal or unreadable move is not something to explain; it is something to say nothing about.
    return [];
  }

  /* ---------------------------------------------------- mate, straight off the search. Free, exact. */

  if (typeof input.mateIn === 'number' && input.mateIn > 0 && input.best && input.best !== played.san) {
    found.push({
      kind: 'missed-mate',
      basis: 'search',
      text: `${input.best} was mate in ${input.mateIn}.`,
      squares: [],
      weight: 100,
    });
  }

  if (typeof input.mateAgainstAfter === 'number' && input.mateAgainstAfter > 0) {
    found.push({
      kind: 'allows-mate',
      basis: 'search',
      text: `this lets ${sideName(opponent)} force mate in ${input.mateAgainstAfter}.`,
      squares: [],
      weight: 99,
    });
  }

  /* ---------------------------------------------------- a piece this move left to be taken. */

  const couldHaveTaken = (() => {
    const flipped = nullMove(input.fen);
    return flipped ? winnable(flipped, mover) : new Map<string, { type: string; gain: number }>();
  })();
  const canNowTake = winnable(after.fen(), mover);

  /*
   * What this move captured, if anything — netted off before anything is called hanging.
   *
   * `exd5` leaves the pawn on d5 to be taken, and reporting that as a hung pawn is true and useless:
   * the move won a pawn first, so the exchange is even and no material was lost. A player means "you
   * lost material" when they say hung, so that is what this measures.
   */
  const captured = VALUE[captureValueOf(input.fen, input.played)] ?? 0;

  for (const [square, piece] of [...canNowTake].sort((a, b) => b[1].gain - a[1].gain)) {
    // Only what *this* move caused. A piece that was already there for the taking is an earlier
    // mistake, and blaming this move for it sends the reader to the wrong place. The piece that just
    // moved is always this move's doing, wherever it came from.
    if (square !== played.to && couldHaveTaken.has(square)) continue;
    // An even trade is not a loss, so it is not an explanation of one.
    if (square === played.to && piece.gain - captured <= 0) continue;

    const what = nameOf(piece.type);
    found.push({
      kind: 'hangs-piece',
      basis: 'geometric',
      text:
        square === played.to
          ? `it puts the ${what} on ${square} where it can be taken.`
          : `it leaves the ${what} on ${square} for ${sideName(opponent)} to take.`,
      squares: [square],
      weight: 60 + Math.min(30, Math.round(piece.gain / 40)),
    });
    break;
  }

  /* ---------------------------------------------------- a pin this move created. Exact geometry. */

  /*
   * Asked from the mover's own side of the board, both times.
   *
   * `pinned` is "this piece has no legal move", and a move generator only speaks for the side to
   * move — so after your own move, asking about your own pieces returns nothing at all unless the
   * turn is handed back first.
   */
  const afterFlipped = nullMove(after.fen());
  const pinnedBefore = pinned(input.fen, mover);
  const pinnedAfter = afterFlipped ? pinned(afterFlipped, mover) : new Map<string, string>();
  for (const [square, type] of pinnedAfter) {
    if (pinnedBefore.has(square)) continue;
    found.push({
      kind: 'pin',
      basis: 'geometric',
      text: `the ${nameOf(type)} on ${square} is pinned now and cannot move.`,
      squares: [square],
      weight: 50,
    });
    break;
  }

  /* ---------------------------------------------------- passed pawns, both directions. Free. */

  const minePassedBefore = passedPawns(before, mover);
  for (const square of passedPawns(after, mover)) {
    if (minePassedBefore.has(square)) continue;
    found.push({
      kind: 'passed-pawn-created',
      basis: 'geometric',
      text: `the pawn on ${square} is passed now — no pawn can stop it.`,
      squares: [square],
      weight: 35,
    });
    break;
  }

  const theirsPassedBefore = passedPawns(before, opponent);
  for (const square of passedPawns(after, opponent)) {
    if (theirsPassedBefore.has(square)) continue;
    found.push({
      kind: 'passed-pawn-conceded',
      basis: 'geometric',
      text: `this gives ${sideName(opponent)} a passed pawn on ${square}.`,
      squares: [square],
      weight: 45,
    });
    break;
  }

  return found.sort((a, b) => b.weight - a.weight);
}

/**
 * The single sentence to put in front of a player, or nothing.
 *
 * One, not a list. A reader given four reasons remembers none of them, and the coaching material is
 * consistent that one concrete thing is what changes play. The rest stay available to anyone who
 * wants to open them.
 */
export function bestExplanation(input: ExplainInput): Explanation | null {
  if ((input.lostCentipawns ?? Infinity) < MIN_LOSS_TO_EXPLAIN) return null;
  return explainMove(input)[0] ?? null;
}
