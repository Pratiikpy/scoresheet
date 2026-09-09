/**
 * Signing a finished game — the moment the entry rests on.
 *
 * Minute 2:00 of the judge walkthrough (`SPEC.md` Q4): they beat the bot, and one tap turns the
 * result into a signed scoresheet. Minute 3:00 is the recompute page re-deriving a rating from
 * that signature in front of them, and that is the thing nothing else in the catalog can do.
 *
 * **A bot game is signed and never rated.** Both are deliberate. Signing it proves the whole path
 * end to end with no second person, which is what makes the cold open work; not rating it is what
 * stops somebody manufacturing a rating against an opponent they control (`SPEC.md` P3, F4). The
 * `rated` flag is inside the signed bytes, so a casual game cannot be relabelled afterwards by
 * whoever happens to store it.
 *
 * The button says *"sign the result so it counts"* rather than *"connect wallet"*: the judge must
 * not have to be told why signing matters, and a verb about the game explains itself where a noun
 * about infrastructure does not.
 */

import { Chess } from 'chess.js';
import {
  canonicaliseScoresheet,
  hashMoves,
  outcomeOf,
  type GameResult,
  type Scoresheet,
  type Termination,
} from '@scoresheet/core';
import { blockNumber, connect, consensusEstablished, explain, signText, tier } from './wallet.ts';
import { t } from './i18n.ts';

export interface SignedGame {
  sheet: Scoresheet;
  canonical: string;
  /** Whoever signed — one side of a two-signature object. */
  by: string;
  signature: { publicKeyHex: string; signatureHex: string };
  /** The moves, so anyone can re-derive the hash inside the signed text. */
  moves: string[];
}

/**
 * A game id.
 *
 * Server-issued in a real game, because both players must agree on it before either signs. For a
 * bot game there is no server in the loop, so it is generated here — from `crypto.getRandomValues`,
 * never `Math.random`, since a predictable id is a scoresheet somebody else can pre-compute.
 */
export function newGameId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * How a game ended, in the scoresheet's own words.
 *
 * Two of the three endings are invisible in the position and have to be told: a resignation and a
 * flag both leave a perfectly ordinary board behind. A scoresheet that called a timeout an
 * `abandoned` game — or worse, refused to be built because the position is not over — would lose the
 * result somebody actually won.
 */
function terminationOf(
  chess: Chess,
  resigned: 'w' | 'b' | null,
  flagged: 'w' | 'b' | null = null,
): { result: GameResult; termination: Termination } | null {
  if (resigned) {
    return { result: resigned === 'w' ? '0-1' : '1-0', termination: 'resignation' };
  }
  if (flagged) {
    return { result: flagged === 'w' ? '0-1' : '1-0', termination: 'timeout' };
  }
  const outcome = outcomeOf(chess);
  if (!outcome.over || !outcome.result || !outcome.termination) return null;
  return { result: outcome.result, termination: outcome.termination };
}

export interface BuildOptions {
  chess: Chess;
  gameId: string;
  chain: 'main' | 'test';
  white: string;
  black: string;
  /** Bot games are never rated, whoever won. */
  rated: boolean;
  /** Set when somebody resigned, since the position alone cannot say so. */
  resigned?: 'w' | 'b' | null;
  /** Set when somebody ran out of time, for the same reason. */
  flagged?: 'w' | 'b' | null;
  /** The chain height when the game ended. The ordering key for the whole rating chain. */
  endedAtBlock: number;
}

/** Assemble the exact object both players will sign. Throws if the game is not actually over. */
export function buildScoresheet(options: BuildOptions): { sheet: Scoresheet; canonical: string; moves: string[] } {
  const ending = terminationOf(options.chess, options.resigned ?? null, options.flagged ?? null);
  if (!ending) throw new Error(t('sign.notOver'));

  const moves = options.chess.history();
  const sheet: Scoresheet = {
    chain: options.chain,
    gameId: options.gameId,
    white: options.white,
    black: options.black,
    result: ending.result,
    termination: ending.termination,
    // Full moves, which is what a chess player means by "a thirty-move game".
    moveCount: Math.ceil(moves.length / 2),
    finalFen: options.chess.fen(),
    endedAtBlock: options.endedAtBlock,
    movesHash: hashMoves(moves),
    rated: options.rated,
  };

  return { sheet, canonical: canonicaliseScoresheet(sheet), moves };
}

export type SignOutcome =
  | { ok: true; signed: SignedGame }
  | { ok: false; message: string; tone: 'calm' | 'bad' };

/**
 * Connect if needed, build the scoresheet, and sign it.
 *
 * The wallet is asked for an address here rather than on page load, which is the rule the whole
 * app follows: a stranger plays first and connects only when there is something worth signing.
 */
export async function signFinishedGame(options: {
  chess: Chess;
  gameId: string;
  chain: 'main' | 'test';
  /** Which side the person signing played; the other side is filled from `opponent`. */
  playedAs: 'w' | 'b';
  opponent: string;
  rated: boolean;
  resigned?: 'w' | 'b' | null;
  flagged?: 'w' | 'b' | null;
}): Promise<SignOutcome> {
  if (tier() === 'none') {
    return {
      ok: false,
      tone: 'calm',
      message: t('sign.needsNimiqPay'),
    };
  }

  try {
    /*
     * Asked before anything else, because it is the one failure that can be predicted.
     *
     * A wallet that is still syncing cannot give a usable block height and will usually refuse to
     * sign — after a wait. Checking first turns a two-minute dead end into a sentence, and the
     * provider has always been able to answer it.
     *
     * `null` means the question could not be asked at all, which is not "no" and is not a reason to
     * stop.
     */
    if ((await consensusEstablished()) === false) {
      return {
        ok: false,
        tone: 'calm',
        message: t('sign.syncing'),
      };
    }

    const me = await connect();

    /*
     * The height, stamped when the game ended.
     *
     * It is the ordering key for every rating computed from this game, so a game with no height is
     * a game that cannot be ordered against any other. A wallet that cannot answer means the game
     * is recorded unsigned rather than signed with a number nobody can check.
     */
    const height = await blockNumber();
    if (height === null) {
      return {
        ok: false,
        tone: 'calm',
        message: t('sign.noHeight'),
      };
    }

    const white = options.playedAs === 'w' ? me : options.opponent;
    const black = options.playedAs === 'w' ? options.opponent : me;
    const built = buildScoresheet({
      chess: options.chess,
      gameId: options.gameId,
      chain: options.chain,
      white,
      black,
      rated: options.rated,
      resigned: options.resigned ?? null,
      flagged: options.flagged ?? null,
      endedAtBlock: height,
    });

    const signature = await signText(built.canonical);
    return { ok: true, signed: { ...built, by: me, signature } };
  } catch (error) {
    const { message, tone } = explain(error);
    return { ok: false, message, tone };
  }
}

/**
 * Sign a game the server ran, from the server's own record of it.
 *
 * **The difference from `signFinishedGame` is the whole reason this exists: both players must sign
 * exactly the same bytes.** In a bot game there is one device, so it can derive everything —
 * including the block height — for itself. In a live game there are two, and if each asked its own
 * wallet for a height they would get different numbers a few seconds apart, produce two
 * nearly-identical canonical texts, and end up with two signatures that verify against neither.
 *
 * So every field comes from the server's view: the seats, the result, the termination, the move list
 * and `endedAtBlock`. The server is the authority on what happened (`SPEC.md` I1), and this is that
 * principle carried through to the one artefact that outlives the game.
 *
 * The position is rebuilt by replaying the moves rather than trusting the FEN, so a scoresheet can
 * never claim a final position that the move list does not reach.
 */
export async function signServerGame(options: {
  gameId: string;
  chain: 'main' | 'test';
  white: string;
  black: string;
  moves: readonly string[];
  result: '1-0' | '0-1' | '1/2-1/2';
  /** Typed, not a string: the scoresheet's own union, so an unknown reason cannot be signed. */
  termination: Termination;
  endedAtBlock: number;
  rated: boolean;
}): Promise<SignOutcome> {
  if (tier() === 'none') {
    return {
      ok: false,
      tone: 'calm',
      message: t('sign.needsNimiqPay'),
    };
  }

  try {
    /*
     * Asked before anything else, because it is the one failure that can be predicted.
     *
     * A wallet that is still syncing cannot give a usable block height and will usually refuse to
     * sign — after a wait. Checking first turns a two-minute dead end into a sentence, and the
     * provider has always been able to answer it.
     *
     * `null` means the question could not be asked at all, which is not "no" and is not a reason to
     * stop.
     */
    if ((await consensusEstablished()) === false) {
      return {
        ok: false,
        tone: 'calm',
        message: t('sign.syncing'),
      };
    }

    const me = await connect();
    if (me !== options.white && me !== options.black) {
      return {
        ok: false,
        tone: 'calm',
        message: t('sign.notYourGame'),
      };
    }

    const chess = new Chess();
    for (const san of options.moves) chess.move(san);

    const sheet: Scoresheet = {
      chain: options.chain,
      gameId: options.gameId,
      white: options.white,
      black: options.black,
      result: options.result,
      termination: options.termination,
      moveCount: Math.ceil(options.moves.length / 2),
      finalFen: chess.fen(),
      endedAtBlock: options.endedAtBlock,
      movesHash: hashMoves([...options.moves]),
      rated: options.rated,
    };

    const canonical = canonicaliseScoresheet(sheet);
    const signature = await signText(canonical);
    return { ok: true, signed: { sheet, canonical, moves: [...options.moves], by: me, signature } };
  } catch (error) {
    const { message, tone } = explain(error);
    return { ok: false, message, tone };
  }
}
