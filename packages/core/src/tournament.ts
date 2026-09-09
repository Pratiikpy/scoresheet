/**
 * A tournament whose pairings and standings a stranger can recompute — no chance, anywhere.
 *
 * This is the one part of the product where a mistake costs somebody money, so it is written as a
 * set of pure functions over signed game records and nothing else: no clock, no database, no "who is
 * online", no random number. Hand the same registered list and the same signed scoresheets to two
 * people and they get the same pairings, the same order, and the same payout — or one of them has a
 * bug, and it can be found.
 *
 * ## The rule that shapes every decision here
 *
 * **Chance-based outcomes are banned by the competition's own rules, and FIDE's are not good enough
 * to copy unmodified.** FIDE decides board-one colour in round one *by lot*, and when its tie-break
 * chain is exhausted it falls back to *drawing of lots* (C.07 Art. 4.2). Both are fine for a club
 * evening and both would disqualify an entry that pays out on them. So:
 *
 * - **The draw comes from a hash of the closed registration list**, which anybody can recompute from
 *   data that existed before the first pairing was published. Not a random seed we chose — a value
 *   derived from the entrants themselves.
 * - **An unbreakable tie splits the prize equally.** Never a decider game, never lots. In a field of
 *   four to sixteen this will actually happen, so it is specified rather than left to be discovered.
 *
 * ## Why round-robin below nine players
 *
 * Because it needs no pairing algorithm at all: the circle method is a fixed rotation of the ordered
 * list, everybody meets everybody exactly once, and there is nothing subtle to get wrong. Swiss is
 * for bigger fields and brings a real correctness question with it — the FIDE Dutch rules are
 * genuinely intricate — so it is a separate, later, cross-validated piece of work rather than
 * something smuggled in beside this.
 *
 * ## What is deliberately absent
 *
 * No streaks, no berserk, no bonus for volume. Every player plays the same number of games, so the
 * final order compares like with like rather than partly measuring stamina.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { toBase64Url } from './base64.ts';
import { normaliseAddress } from './scoresheet.ts';

/** Win, draw, loss — the only scoring there is. */
export const WIN = 1;
export const DRAW = 0.5;
export const LOSS = 0;

/** The largest field this module will pair. Above it, Swiss is required and is not built yet. */
export const MAX_ROUND_ROBIN = 8;

export interface Pairing {
  round: number;
  /** Zero-based board within the round, so a screen can order them stably. */
  board: number;
  white: string;
  black: string;
}

/** One finished game, reduced to what standings actually need. */
export interface TournamentResult {
  round: number;
  white: string;
  black: string;
  /** 1 when white won, 0 when black won, 0.5 for a draw. */
  whiteScore: number;
}

export interface Standing {
  address: string;
  /** Points. */
  score: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Sum of the final scores of everyone they beat, plus half of everyone they drew. */
  sonnebornBerger: number;
  /** Sum of opponents' final scores, dropping the weakest one. */
  buchholzCut1: number;
  /** Running score after each round, added up — rewards leading early over catching up late. */
  progressive: number;
  /**
   * Points scored against the other players on the same score — the direct-encounter tie-break.
   *
   * Computed **within the tied group** rather than pairwise, and that is not a detail. Head-to-head
   * is inherently non-transitive: A beats B, B beats C, C beats A is an ordinary Tuesday in a
   * round-robin, and a sort comparator that consults it directly produces a different order depending
   * on the order the players were handed over. `scripts/tournament-check.mjs` found exactly that.
   * A group-relative score is a number, numbers are transitive, and the sort becomes a real order.
   */
  directScore: number;
  /** Where they finished. Tied players share a place, and the next place skips accordingly. */
  place: number;
}

export class TournamentError extends Error {
  override name = 'TournamentError';
}

/* ------------------------------------------------------------------ the draw */

/**
 * The starting order, derived from the entrants themselves.
 *
 * `sha256(tournamentId ‖ every address, sorted)` — sorted so that the *order somebody registered in*
 * cannot change the draw, which would otherwise hand an advantage to whoever refreshed fastest. The
 * digest then orders the players by their own per-player hash, which is a deterministic shuffle
 * nobody can steer without changing their own address.
 *
 * **The registration list must be closed before this is computed.** If it were still open, a late
 * entrant could try addresses until one produced a draw they liked — the seed is only fair because
 * the input is fixed before anyone sees the output.
 */
export function drawOrder(tournamentId: string, addresses: readonly string[]): string[] {
  const players = [...new Set(addresses.map(normaliseAddress))].sort();
  if (players.length < 2) throw new TournamentError('a tournament needs at least two players');

  const seed = sha256(new TextEncoder().encode(`${tournamentId}\n${players.join('\n')}`));
  const seedHex = toBase64Url(seed);

  return players
    .map((address) => ({
      address,
      // One hash per player, from the shared seed. Sorting on it is a shuffle that is a pure
      // function of the inputs and cannot be nudged by anybody after the fact.
      key: toBase64Url(sha256(new TextEncoder().encode(`${seedHex}\n${address}`))),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.address);
}

/* ------------------------------------------------------------------ the schedule */

/**
 * A single round-robin by the circle method: everybody meets everybody once.
 *
 * One player is held fixed and the rest rotate. With an odd field a `null` is added and whoever is
 * paired against it sits that round out — a bye, which the standings treat as a game not played
 * rather than as a free point. Giving a full point for a bye is the usual convention and it is wrong
 * here: this pays money, and a point nobody earned over the board should not decide who gets it.
 *
 * Colours are balanced rather than alternated by a formula — see the note inside. Measured worst-case
 * imbalance is 1 for an even field and 2 for an odd one, which is the floor: in an odd field somebody
 * sits out each round, so the counts cannot come out level.
 */
export function roundRobin(order: readonly string[]): Pairing[] {
  if (order.length < 2) throw new TournamentError('a tournament needs at least two players');
  if (order.length > MAX_ROUND_ROBIN) {
    throw new TournamentError(`round-robin is only used up to ${MAX_ROUND_ROBIN} players`);
  }

  // An odd field gets a placeholder; whoever meets it has a bye that round.
  const players: (string | null)[] = [...order];
  if (players.length % 2 === 1) players.push(null);

  const rounds = players.length - 1;
  const half = players.length / 2;
  const rotating = players.slice(1);
  const pairings: Pairing[] = [];

  /*
   * **Colours are balanced, not alternated by a formula.**
   *
   * The obvious rule — flip on `(round + board)` — looks right and is badly wrong, because the
   * rotation means a given pair does not sit at a stable board index. Measured on an eight-player
   * field it gave one player **seven Blacks and no Whites**, which is a real and entirely avoidable
   * advantage handed out by arithmetic nobody checked. The test that found it walks every field size
   * from four to eight rather than looking at one example.
   *
   * So the colour goes to whoever has had fewer Whites so far, with the tie broken by address order.
   * That is still a pure function of the schedule — no clock, no randomness, recomputable by anybody
   * holding the same entrant list — and unlike a formula it cannot silently stop balancing when the
   * field size changes.
   */
  const whites = new Map<string, number>(order.map((player) => [player, 0]));
  const blacks = new Map<string, number>(order.map((player) => [player, 0]));

  for (let round = 0; round < rounds; round++) {
    const arrangement = [players[0]!, ...rotating];
    let board = 0;

    for (let i = 0; i < half; i++) {
      const home = arrangement[i]!;
      const away = arrangement[arrangement.length - 1 - i]!;
      if (home === null || away === null) continue;

      const homeDebt = (whites.get(home) ?? 0) - (blacks.get(home) ?? 0);
      const awayDebt = (whites.get(away) ?? 0) - (blacks.get(away) ?? 0);
      // Fewer Whites so far means White now. Level means the lower address takes it, which is
      // arbitrary and deterministic — the two properties this needs.
      const homeIsWhite = homeDebt !== awayDebt ? homeDebt < awayDebt : home < away;

      const white = homeIsWhite ? home : away;
      const black = homeIsWhite ? away : home;
      whites.set(white, (whites.get(white) ?? 0) + 1);
      blacks.set(black, (blacks.get(black) ?? 0) + 1);

      pairings.push({ round, board, white, black });
      board += 1;
    }

    // Rotate everyone except the first player.
    rotating.unshift(rotating.pop()!);
  }

  return pairings;
}

/**
 * The whole schedule for a tournament, from its id and its entrants alone.
 *
 * The one function a stranger runs to check that the pairings they were shown are the pairings the
 * rules produce.
 */
export function scheduleFor(tournamentId: string, addresses: readonly string[]): Pairing[] {
  return roundRobin(drawOrder(tournamentId, addresses));
}

/* ------------------------------------------------------------------ the standings */

function scoreFor(result: TournamentResult, address: string): number | null {
  const who = normaliseAddress(address);
  if (normaliseAddress(result.white) === who) return result.whiteScore;
  if (normaliseAddress(result.black) === who) return 1 - result.whiteScore;
  return null;
}

/**
 * Final standings, from the results and nothing else.
 *
 * The tie-break chain, in order, all of it derived from the games themselves — no ratings, no
 * external oracle, nothing that requires trusting a number we issued:
 *
 * 1. **Score.**
 * 2. **Direct encounter** — among the tied players only, how they did against each other. Computed
 *    as a score *within the group*, because head-to-head is non-transitive and a pairwise comparator
 *    built on it is not an order.
 * 3. **Sonneborn-Berger** — the sum of the final scores of everyone you beat, plus half of everyone
 *    you drew. Beating the eventual winner is worth more than beating whoever finished last.
 * 4. **Buchholz cut-1** — the sum of your opponents' final scores, dropping the weakest, so one
 *    unlucky pairing against somebody who collapsed does not decide a prize.
 * 5. **Number of wins** — decisive results over draws.
 * 6. **Progressive score** — your running total after each round, added up.
 *
 * Anybody still level shares a place, and `prizeSplit` shares the money.
 */
export function standings(addresses: readonly string[], results: readonly TournamentResult[]): Standing[] {
  const players = [...new Set(addresses.map(normaliseAddress))];

  const base = new Map<string, Standing>(
    players.map((address) => [
      address,
      {
        address,
        score: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        sonnebornBerger: 0,
        buchholzCut1: 0,
        progressive: 0,
        directScore: 0,
        place: 0,
      },
    ]),
  );

  // Pass one: the score, and who played whom.
  const opponents = new Map<string, string[]>(players.map((address) => [address, []]));
  const byRound = new Map<string, Map<number, number>>(players.map((address) => [address, new Map()]));

  for (const result of results) {
    for (const address of [normaliseAddress(result.white), normaliseAddress(result.black)]) {
      const standing = base.get(address);
      if (!standing) continue;
      const points = scoreFor(result, address);
      if (points === null) continue;

      standing.score += points;
      standing.played += 1;
      if (points === WIN) standing.wins += 1;
      else if (points === DRAW) standing.draws += 1;
      else standing.losses += 1;

      const other = address === normaliseAddress(result.white) ? result.black : result.white;
      opponents.get(address)!.push(normaliseAddress(other));
      byRound.get(address)!.set(result.round, points);
    }
  }

  // Pass two: the tie-breaks that depend on everybody's final score.
  const finalScore = (address: string): number => base.get(address)?.score ?? 0;

  for (const standing of base.values()) {
    const theirOpponents = opponents.get(standing.address) ?? [];

    for (const result of results) {
      const points = scoreFor(result, standing.address);
      if (points === null) continue;
      const other = normaliseAddress(
        normaliseAddress(result.white) === standing.address ? result.black : result.white,
      );
      if (points === WIN) standing.sonnebornBerger += finalScore(other);
      else if (points === DRAW) standing.sonnebornBerger += finalScore(other) / 2;
    }

    const opponentScores = theirOpponents.map(finalScore).sort((a, b) => a - b);
    // Cut the weakest, but only when there is more than one to cut from — dropping the only opponent
    // in a two-player event would leave a tie-break of zero for everybody, which decides nothing.
    const counted = opponentScores.length > 1 ? opponentScores.slice(1) : opponentScores;
    standing.buchholzCut1 = counted.reduce((sum, value) => sum + value, 0);

    let running = 0;
    for (const round of [...(byRound.get(standing.address) ?? new Map()).keys()].sort((a, b) => a - b)) {
      running += byRound.get(standing.address)!.get(round)!;
      standing.progressive += running;
    }
  }

  /*
   * Direct encounter, computed inside each score group.
   *
   * FIDE applies this tie-break among the players who are actually tied, and there is a hard reason
   * beyond convention: head-to-head is **non-transitive**. A beats B, B beats C, C beats A is an
   * ordinary round-robin, and a comparator that consults it pairwise is not an order at all — the
   * sort then returns whatever the input order happened to make it return. That is precisely what
   * `scripts/tournament-check.mjs` caught, on the 27th of 729 four-player tournaments.
   *
   * Scoring each player against only the others on their own score turns it into a number, and
   * numbers are transitive.
   */
  const byScore = new Map<number, Standing[]>();
  for (const standing of base.values()) {
    const group = byScore.get(standing.score) ?? [];
    group.push(standing);
    byScore.set(standing.score, group);
  }
  for (const group of byScore.values()) {
    if (group.length < 2) continue;
    const inGroup = new Set(group.map((standing) => standing.address));
    for (const standing of group) {
      for (const result of results) {
        const points = scoreFor(result, standing.address);
        if (points === null) continue;
        const other = normaliseAddress(
          normaliseAddress(result.white) === standing.address ? result.black : result.white,
        );
        if (inGroup.has(other)) standing.directScore += points;
      }
    }
  }

  /*
   * And the final fallback is the address.
   *
   * `Array.prototype.sort` is stable, so players level on **every** tie-break would otherwise keep
   * the order they arrived in — the same tournament listing differently depending on how the
   * entrants were handed over. It changes no place and no payout, since genuinely tied players share
   * both; it changes whether two people checking the same tournament see the same table.
   */
  const ordered = [...base.values()].sort(
    (a, b) =>
      compareStandings(a, b) || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0),
  );

  // Places, with ties sharing one. Two players tied for first are both first and the next is third.
  let place = 0;
  let seen = 0;
  let previous: Standing | null = null;
  for (const standing of ordered) {
    seen += 1;
    if (previous === null || compareStandings(previous, standing) !== 0) place = seen;
    standing.place = place;
    previous = standing;
  }

  return ordered;
}

/**
 * The comparison, applied in order. Returns 0 only when every tie-break is exhausted.
 *
 * Direct encounter needs the results, which is why they are threaded through: it asks how these two
 * did against *each other*, which is the one tie-break a player will always check first.
 */
function compareStandings(a: Standing, b: Standing): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.directScore !== b.directScore) return b.directScore - a.directScore;
  if (a.sonnebornBerger !== b.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
  if (a.buchholzCut1 !== b.buchholzCut1) return b.buchholzCut1 - a.buchholzCut1;
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (a.progressive !== b.progressive) return b.progressive - a.progressive;
  return 0;
}

/* ------------------------------------------------------------------ the money */

/**
 * Who gets what, when places can be shared.
 *
 * The prize table is a list of amounts for first, second, third and so on. When players tie for a
 * place, **the amounts for every place they jointly occupy are pooled and split equally.** Two
 * players tied for first share first and second prizes between them; nobody is second.
 *
 * That is the deterministic answer to FIDE's own "drawing of lots", and it is a pure function of the
 * declared table and the computed order — a stranger recomputes it exactly as we do, and there is no
 * step anywhere in it that anybody could have influenced.
 *
 * Any remainder from an uneven division is left unallocated rather than handed to whoever sorts
 * first: allocating it would make the payout depend on address ordering, which is arbitrary, and
 * losing a Luna to arithmetic is better than a payout that cannot be justified.
 */
export function prizeSplit(order: readonly Standing[], prizes: readonly number[]): Map<string, number> {
  const payout = new Map<string, number>();
  if (order.length === 0) return payout;

  const groups = new Map<number, Standing[]>();
  for (const standing of order) {
    const group = groups.get(standing.place) ?? [];
    group.push(standing);
    groups.set(standing.place, group);
  }

  for (const [place, tied] of groups) {
    // Places are one-based; the table is zero-based. A group of two tied for first covers the
    // first and second prizes.
    const pooled = prizes.slice(place - 1, place - 1 + tied.length).reduce((sum, value) => sum + value, 0);
    if (pooled === 0) continue;
    const each = Math.floor(pooled / tied.length);
    if (each === 0) continue;
    for (const standing of tied) payout.set(standing.address, each);
  }

  return payout;
}
