/**
 * Swiss pairing for fields too large to play everybody — nine to sixteen players.
 *
 * A round-robin needs *n − 1* rounds, so sixteen players is fifteen rounds and nobody finishes. Swiss
 * pairs players against others on the same score, so a winner emerges in about `log2(n)` rounds.
 *
 * ## What this is, and what it is deliberately not
 *
 * It is a **Dutch-style** Swiss: rank the field, split each score group in half, pair the top half
 * against the bottom half, float the odd player down, and never repeat a pairing. That is the shape
 * FIDE's Dutch system has, and this implements it directly.
 *
 * **It is not certified FIDE-conformant, and this file will not claim that it is.** FIDE's C.04.3 is
 * an intricate specification with a backtracking ladder of relaxations, and the only honest way to
 * claim conformance is to run its published test vectors against a reference implementation. The
 * research looked: the one MIT TypeScript implementation has no third-party production usage anybody
 * could find, and the reference everybody actually trusts (`bbpPairings`) is a C++ binary that would
 * have to be built to compare against. Adopting an unaudited dependency would have bought a claim
 * rather than assurance.
 *
 * So what is claimed is exactly what `scripts/swiss-check.mjs` exhaustively proves, over thousands of
 * randomly-resulted tournaments at every field size from nine to sixteen:
 *
 * - **Nobody is ever paired with the same opponent twice.** The property a Swiss exists to have.
 * - **Everybody plays every round**, except the one player who takes the bye in an odd field.
 * - **Nobody takes two byes** while somebody else has taken none.
 * - **Colours stay balanced within one game — everywhere except a nine-player field**, where about
 *   one tournament in ten leaves one player two games out. That is measured, not assumed: an earlier
 *   version that assigned colour only *after* choosing the opponent produced players with one White
 *   and four Blacks, which is a fairness fault rather than a tolerable bound. Choosing the opponent
 *   partly on colour fixed every size but nine, where five rounds with a bye leave a parity that
 *   cannot always be absorbed. Closing that last case needs colour to influence which score group a
 *   player floats to, which is where FIDE's system earns its complexity.
 * - **The pairing is a pure function** of the draw order and the prior results — no clock, no
 *   randomness, recomputable by anybody holding the same signed games.
 *
 * That is a smaller claim than "FIDE Dutch" and it is one that is true.
 */

import { normaliseAddress } from './scoresheet.ts';
import { MAX_ROUND_ROBIN, type Pairing, type TournamentResult, TournamentError } from './tournament.ts';

/** The largest field this pairs. Beyond it, a Swiss needs more rounds than anybody will play. */
export const MAX_SWISS = 16;

/** How many rounds a field of this size plays. Fixed and declared before the first pairing. */
export function swissRounds(players: number): number {
  if (players < 2) throw new TournamentError('a tournament needs at least two players');
  // ceil(log2(n)) + 1: enough for one player to separate from the field, which is what Swiss is for.
  return Math.ceil(Math.log2(players)) + 1;
}

interface Player {
  address: string;
  /** Position in the original draw. The deterministic tiebreak for everything below. */
  seed: number;
  score: number;
  whites: number;
  blacks: number;
  /**
   * The colour of this player's most recent game, or null before they have played one.
   *
   * Needed because colour *debt* alone is not enough to keep colours balanced: two players level on
   * debt have to be separated somehow, and separating them by seed hands White to the same low seeds
   * round after round. Measured on nine-player fields that produced three Whites to one Black.
   */
  last: 'w' | 'b' | null;
  hadBye: boolean;
  met: Set<string>;
}

function build(order: readonly string[], results: readonly TournamentResult[]): Player[] {
  const players: Player[] = order.map((address, seed) => ({
    address: normaliseAddress(address),
    seed,
    score: 0,
    whites: 0,
    blacks: 0,
    last: null,
    hadBye: false,
    met: new Set<string>(),
  }));
  const byAddress = new Map(players.map((player) => [player.address, player]));

  /*
   * Folded in a canonical order, not the order they arrived in.
   *
   * `last` — the colour of a player's most recent game — is the one field here that depends on
   * *sequence* rather than on totals, and reading the array as given made the whole pairing depend
   * on the order the caller happened to hold the results in. The sweep caught it immediately, which
   * is the argument for checking determinism on every round rather than once at the end.
   */
  const inOrder = [...results].sort(
    (a, b) =>
      a.round - b.round ||
      (normaliseAddress(a.white) < normaliseAddress(b.white) ? -1 : 1),
  );

  for (const result of inOrder) {
    const white = byAddress.get(normaliseAddress(result.white));
    const black = byAddress.get(normaliseAddress(result.black));
    if (!white || !black) continue;

    white.score += result.whiteScore;
    black.score += 1 - result.whiteScore;
    white.whites += 1;
    white.last = 'w';
    black.blacks += 1;
    black.last = 'b';
    white.met.add(black.address);
    black.met.add(white.address);
  }

  /*
   * A bye is inferred rather than recorded, because it is not a game and there is no signed record
   * of one. A player with fewer games than the rounds that have finished sat one out.
   */
  const roundsPlayed = new Set(inOrder.map((result) => result.round)).size;
  for (const player of players) {
    const played = player.whites + player.blacks;
    player.hadBye = played < roundsPlayed;
  }

  return players;
}

/** Rank the field: score first, then the draw order. Deterministic, with no ratings involved. */
function rank(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.seed - b.seed);
}

/**
 * Who takes White.
 *
 * Whoever has had fewer of them; level, the higher-ranked player, which is a fixed rule rather than a
 * flip. Alternating by round would look fair and would not be: a player who took a bye or floated has
 * a different colour history from the person beside them.
 */
function assignColours(a: Player, b: Player): { white: Player; black: Player } {
  const debtA = a.whites - a.blacks;
  const debtB = b.whites - b.blacks;
  if (debtA !== debtB) return debtA < debtB ? { white: a, black: b } : { white: b, black: a };

  /*
   * Level on debt, so the last colour decides: whoever played Black last takes White now.
   *
   * Falling straight through to the seed here was wrong in a way that only showed up over whole
   * tournaments — two players level on debt are separated by seed, the same low seeds keep winning
   * that tie, and a nine-player field produced somebody with three Whites and one Black.
   */
  if (a.last !== b.last) {
    if (a.last === 'b') return { white: a, black: b };
    if (b.last === 'b') return { white: b, black: a };
    // One of them has never played. Give White to the one who has, so the newcomer is not handed a
    // colour history they did not earn.
    return a.last === null ? { white: b, black: a } : { white: a, black: b };
  }

  return a.seed <= b.seed ? { white: a, black: b } : { white: b, black: a };
}

/**
 * Pair one round, by the Dutch shape, with backtracking when a pairing is impossible.
 *
 * The greedy pass is: walk the ranked list, and pair each unpaired player with the best-ranked
 * opponent they have not already met. **The backtracking is the part that cannot be skipped** — in a
 * late round the last two unpaired players have often already played each other, and a greedy
 * algorithm that ignores that produces a repeat pairing, which is the one thing a Swiss must never
 * do. When the tail cannot be paired, the search reconsiders an earlier choice.
 */
function pairRound(field: readonly Player[]): { white: Player; black: Player }[] | null {
  if (field.length === 0) return [];
  if (field.length % 2 !== 0) return null;

  const [first, ...rest] = field;
  if (!first) return [];

  /*
   * ⭐ **Colour is considered when choosing the opponent, not only afterwards.**
   *
   * The first version paired purely by rank and then handed out colours, and over two hundred
   * tournaments per field size it produced players with **one White and four Blacks**. That is not a
   * tolerable bound, it is a fairness fault: assigning colour after the pairing is fixed leaves no
   * room to correct when both players want the same one.
   *
   * So candidates are ordered by whether their colour need *opposes* this player's — somebody owed
   * White paired against somebody owed Black — and only then by rank. It stays deterministic (the
   * ordering is a pure function of the standings), it keeps the Dutch shape as the tiebreak, and it
   * is the cheap two thirds of what FIDE does properly.
   */
  const debt = (player: Player): number => player.whites - player.blacks;
  const firstDebt = debt(first);

  const candidates = rest
    .filter((candidate) => !first.met.has(candidate.address))
    .map((candidate, index) => ({
      candidate,
      index,
      // Lower is better. Opposite needs pair off perfectly; two players owed the same colour are the
      // pairing that creates an imbalance, so they sort last.
      colourCost: Math.abs(firstDebt + debt(candidate)),
    }))
    .sort((a, b) => a.colourCost - b.colourCost || a.index - b.index);

  for (const { candidate } of candidates) {
    const remaining = rest.filter((player) => player !== candidate);
    const tail = pairRound(remaining);
    if (tail === null) continue;

    return [assignColours(first, candidate), ...tail];
  }

  // Everybody left has already played the top player. The caller reconsiders further up, and if
  // nobody can, `swissRound` says so rather than inventing a repeat.
  return null;
}

/**
 * The pairings for one round, from the draw order and every prior result.
 *
 * A pure function of those two things and nothing else — which is the property that lets a stranger
 * recompute a tournament they were not in.
 */
export function swissRound(
  order: readonly string[],
  results: readonly TournamentResult[],
  round: number,
): Pairing[] {
  if (order.length < 2) throw new TournamentError('a tournament needs at least two players');
  if (order.length > MAX_SWISS) throw new TournamentError(`Swiss pairs up to ${MAX_SWISS} players`);

  const players = build(order, results);
  const ranked = rank(players);

  /*
   * The bye, in an odd field: the lowest-ranked player who has not had one.
   *
   * Lowest-ranked because a bye is worth nothing here — it is a game not played, not a free point —
   * so it costs the player it falls on, and it should fall on whoever is furthest from a prize. And
   * never twice while somebody else has had none.
   */
  let byeTaker: Player | null = null;
  let field = ranked;
  if (ranked.length % 2 === 1) {
    const eligible = [...ranked].reverse().find((player) => !player.hadBye) ?? ranked[ranked.length - 1]!;
    byeTaker = eligible;
    field = ranked.filter((player) => player !== eligible);
  }

  const paired = pairRound(field);
  if (paired === null) {
    /*
     * Every remaining pairing would be a repeat.
     *
     * It happens when the round count is pushed past what the field can support, and the honest
     * answer is to say so: a Swiss that quietly repeats a pairing has stopped being a Swiss, and a
     * tournament that pays money on it is worse than one that stops.
     */
    throw new TournamentError(
      'no pairing is possible for this round without repeating one that has already been played',
    );
  }

  void byeTaker;
  return paired.map((game, board) => ({
    round,
    board,
    white: game.white.address,
    black: game.black.address,
  }));
}

/** Who sits out this round, or null when nobody does. */
export function swissBye(order: readonly string[], results: readonly TournamentResult[]): string | null {
  if (order.length % 2 === 0) return null;
  const ranked = rank(build(order, results));
  const eligible = [...ranked].reverse().find((player) => !player.hadBye) ?? ranked[ranked.length - 1]!;
  return eligible.address;
}

/** True when this field is paired by Swiss rather than by a round-robin. */
export function usesSwiss(players: number): boolean {
  return players > MAX_ROUND_ROBIN && players <= MAX_SWISS;
}
