/**
 * The rating, derived — never stored.
 *
 * Nothing here is written to a row anyone controls. Given the set of signed scoresheets, this
 * function produces a number, and it produces the *same* number for anybody who runs it. That is
 * the entire product: a rating nobody issued, and therefore a rating nobody can revoke.
 *
 * Three things have to be right for that to be true rather than a slogan.
 *
 * **The order.** Elo is path-dependent — the same games in a different order give a different
 * number. So the ordering has to be a property of the signatures rather than of our database:
 * `endedAtBlock` ascending, then `gameId` ascending as a tiebreak. Both are inside the signed text,
 * and a block height is checkable against the chain by anyone.
 *
 * **The arithmetic.** Plain Elo, nothing invented. Someone reimplementing this from `SPEC.md` Part F
 * must land on the same integer, so every constant is named and every rounding rule is explicit.
 *
 * **The farming.** Wallets are free, so two of them can play each other forever. This cannot be
 * solved without identity; it can be made worthless, which is what `K_FULL_GAMES_PER_OPPONENT` and
 * the provisional rule do. The honest claim is *not worth doing*, never *impossible* — and the
 * distinct-opponent count travels with the rating everywhere it is shown, so a big number from one
 * opponent advertises itself.
 */

import { opponentOf, normaliseAddress, scoreFor, type Scoresheet } from './scoresheet.ts';

/** Everyone starts here. The conventional Elo starting point, and the one every chess player knows. */
export const STARTING_RATING = 1200;

/** Nobody goes below this. A rating that can fall forever stops meaning anything. */
export const RATING_FLOOR = 100;

/** Provisional K, for a player's first games. High, so a new rating finds its level quickly. */
export const K_PROVISIONAL = 32;

/** Settled K, afterwards. Half, so an established rating stops swinging on one result. */
export const K_ESTABLISHED = 16;

/** How many rated games a player plays before K settles. */
export const PROVISIONAL_GAMES = 20;

/** Full K applies to this many games against any one opponent. */
export const K_FULL_GAMES_PER_OPPONENT = 3;

/** Then half K, up to this many. Beyond it, K is zero and the pair stop moving each other at all. */
export const K_HALF_GAMES_PER_OPPONENT = 10;

/** A rating is provisional until it has met this many different people. */
export const DISTINCT_OPPONENTS_FOR_ESTABLISHED = 10;

/** Below this many full moves, a game is recorded and does not rate. */
export const MIN_MOVES_TO_RATE = 10;

/**
 * One game as the rating chain sees it: the signed facts, and nothing else.
 *
 * Deliberately not the `Scoresheet` type — this is the projection the arithmetic needs, and keeping
 * it separate means a change to the wire format cannot silently change what a rating means.
 */
export interface RatedGame {
  gameId: string;
  endedAtBlock: number;
  white: string;
  black: string;
  /** 1 when white won, 0 when black won, 0.5 for a draw. */
  whiteScore: number;
  moveCount: number;
  rated: boolean;
}

export interface RatingPoint {
  gameId: string;
  endedAtBlock: number;
  opponent: string;
  /** This player's score in that game: 1, 0.5 or 0. */
  score: number;
  /** Their rating before the game and after it. Both, so a page can show the delta. */
  before: number;
  after: number;
  /** The K that was actually applied. Zero means the game was played and did not move the number. */
  k: number;
}

export interface Rating {
  address: string;
  /** The number. */
  rating: number;
  /** Rated games played. */
  games: number;
  /** How many different people they have played. The tell that makes the number readable. */
  distinctOpponents: number;
  /**
   * False until `DISTINCT_OPPONENTS_FOR_ESTABLISHED` different opponents have been met. A rating
   * that has not met ten people is not a rating yet, and every screen must say so.
   */
  established: boolean;
  /** Every rated game in canonical order, with the number before and after. The audit trail. */
  history: RatingPoint[];
}

/**
 * Put games in the one order everybody agrees on.
 *
 * Block height first, `gameId` second. The tiebreak is not cosmetic: two games can end in the same
 * block, and without a deterministic second key two honest implementations would disagree.
 */
export function canonicalOrder<T extends { endedAtBlock: number; gameId: string }>(games: readonly T[]): T[] {
  return [...games].sort((a, b) => {
    if (a.endedAtBlock !== b.endedAtBlock) return a.endedAtBlock - b.endedAtBlock;
    return a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0;
  });
}

/** Project a signed scoresheet into the shape the chain needs. */
export function toRatedGame(sheet: Scoresheet): RatedGame {
  return {
    gameId: sheet.gameId,
    endedAtBlock: sheet.endedAtBlock,
    white: normaliseAddress(sheet.white),
    black: normaliseAddress(sheet.black),
    whiteScore: scoreFor(sheet, sheet.white) ?? 0,
    moveCount: sheet.moveCount,
    rated: sheet.rated,
  };
}

/** Does this game move anybody's number at all? */
export function counts(game: RatedGame): boolean {
  return game.rated && game.moveCount >= MIN_MOVES_TO_RATE;
}

/**
 * The K that applies to the *n*th game against a given opponent.
 *
 * Diminishing returns is the whole anti-farming design: two wallets playing each other converge and
 * then stop moving. `played` is how many rated games the pair had already played before this one.
 */
export function kForPairing(base: number, played: number): number {
  if (played < K_FULL_GAMES_PER_OPPONENT) return base;
  if (played < K_HALF_GAMES_PER_OPPONENT) return base / 2;
  return 0;
}

/** The classic Elo expectation: the share of a point the higher-rated player is expected to take. */
export function expectedScore(mine: number, theirs: number): number {
  return 1 / (1 + 10 ** ((theirs - mine) / 400));
}

/**
 * Round half away from zero.
 *
 * `Math.round` rounds half *up*, so it treats −0.5 and +0.5 differently and two implementations
 * would disagree on a losing player's delta. Ratings are symmetric; the rounding has to be too.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Walk every game in canonical order and produce everybody's rating.
 *
 * One pass over the whole set. It is deliberately a pure function of the games — no clock, no
 * database, no configuration — so that the recompute page in a stranger's browser and our server
 * cannot possibly disagree. If they ever do, ours is wrong.
 */
export function computeRatings(games: readonly RatedGame[]): Map<string, Rating> {
  const ratings = new Map<string, Rating>();
  /** How many rated games each unordered pair has played, keyed by the two addresses sorted. */
  const pairings = new Map<string, number>();

  const record = (address: string): Rating => {
    const key = normaliseAddress(address);
    let existing = ratings.get(key);
    if (!existing) {
      existing = {
        address: key,
        rating: STARTING_RATING,
        games: 0,
        distinctOpponents: 0,
        established: false,
        history: [],
      };
      ratings.set(key, existing);
    }
    return existing;
  };

  const seenOpponents = new Map<string, Set<string>>();

  for (const game of canonicalOrder(games)) {
    if (!counts(game)) continue;

    const white = record(game.white);
    const black = record(game.black);

    const pairKey = [white.address, black.address].sort().join('|');
    const alreadyPlayed = pairings.get(pairKey) ?? 0;

    // Both players' K is decided from the ratings *before* this game, so the pair updates
    // symmetrically and the order the two are written in cannot change the result.
    const whiteBase = white.games < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
    const blackBase = black.games < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
    const whiteK = kForPairing(whiteBase, alreadyPlayed);
    const blackK = kForPairing(blackBase, alreadyPlayed);

    const whiteBefore = white.rating;
    const blackBefore = black.rating;
    const whiteExpected = expectedScore(whiteBefore, blackBefore);
    const blackScore = 1 - game.whiteScore;

    const whiteAfter = Math.max(
      RATING_FLOOR,
      whiteBefore + roundHalfAwayFromZero(whiteK * (game.whiteScore - whiteExpected)),
    );
    const blackAfter = Math.max(
      RATING_FLOOR,
      blackBefore + roundHalfAwayFromZero(blackK * (blackScore - (1 - whiteExpected))),
    );

    white.rating = whiteAfter;
    black.rating = blackAfter;
    white.games += 1;
    black.games += 1;
    pairings.set(pairKey, alreadyPlayed + 1);

    for (const [player, opponent] of [
      [white, black.address],
      [black, white.address],
    ] as const) {
      let seen = seenOpponents.get(player.address);
      if (!seen) {
        seen = new Set();
        seenOpponents.set(player.address, seen);
      }
      seen.add(opponent);
      player.distinctOpponents = seen.size;
      player.established = seen.size >= DISTINCT_OPPONENTS_FOR_ESTABLISHED;
    }

    white.history.push({
      gameId: game.gameId,
      endedAtBlock: game.endedAtBlock,
      opponent: black.address,
      score: game.whiteScore,
      before: whiteBefore,
      after: whiteAfter,
      k: whiteK,
    });
    black.history.push({
      gameId: game.gameId,
      endedAtBlock: game.endedAtBlock,
      opponent: white.address,
      score: blackScore,
      before: blackBefore,
      after: blackAfter,
      k: blackK,
    });
  }

  return ratings;
}

/**
 * One address's rating from a set of games.
 *
 * A wallet that has never played gets a starting rating with no history rather than an error — a
 * new player is new, not missing, and every screen that shows this has to be able to say so.
 */
export function ratingFor(address: string, games: readonly RatedGame[]): Rating {
  const key = normaliseAddress(address);
  return (
    computeRatings(games).get(key) ?? {
      address: key,
      rating: STARTING_RATING,
      games: 0,
      distinctOpponents: 0,
      established: false,
      history: [],
    }
  );
}

/** Only the games one address actually played, for the recompute page's own listing. */
export function gamesInvolving(address: string, games: readonly RatedGame[]): RatedGame[] {
  const key = normaliseAddress(address);
  return canonicalOrder(games.filter((g) => g.white === key || g.black === key));
}

/** Convenience for a page holding scoresheets rather than the projection. */
export function opponentIn(sheet: Scoresheet, address: string): string | null {
  return opponentOf(sheet, address);
}
