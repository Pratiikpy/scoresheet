/**
 * Running a tournament — deliberately the least important part of it.
 *
 * Every decision that matters is already a pure function in `@scoresheet/core`: the draw, the
 * pairings, the standings, the tie-breaks and the payout. This file does the three things those
 * functions cannot: it remembers who registered, it holds the registration open until it closes, and
 * it hands out the signed scoresheets afterwards.
 *
 * **That thinness is the design, not a shortcut.** A tournament server that computed the standings
 * would be a server somebody has to trust, and the whole argument of `/t/<id>` is that nobody does:
 * a stranger takes the entrant list and the signed games, runs the same public function, and gets the
 * same table. If this file disappeared, every finished tournament would remain checkable.
 *
 * ## What it deliberately does not do
 *
 * - **It never decides a result.** Results arrive as ordinary signed scoresheets from the live-game
 *   server, exactly like every other game. A tournament adds no new evidence format.
 * - **It never breaks a tie.** `standings` does that, publicly, and an unbreakable tie splits the
 *   prize rather than going to a decider or a draw.
 * - **It never holds money.** The payout is computed from the declared prize table and paid to the
 *   winners' own wallets; there is no balance here and no withdrawal to request.
 */

import {
  MAX_ROUND_ROBIN,
  MAX_SWISS,
  drawOrder,
  normaliseAddress,
  scheduleFor,
  standings,
  swissRound,
  swissRounds,
  usesSwiss,
  type BundledScoresheet,
  type Pairing,
  type Standing,
  type TournamentResult,
} from '@scoresheet/core';
import { verifyScoresheet, type SignaturePair } from '@scoresheet/verify';

export type TournamentState = 'open' | 'running' | 'finished';

/**
 * ⭐ What a caller may present as a result: a game, not a claim.
 *
 * The distinction is the whole point. A caller cannot say who won — they can only hand over a
 * scoresheet that **both players signed**, and the server reads the winner out of it. There is
 * deliberately no field here for a score.
 */
export interface SignedResult {
  round: number;
  /** The canonical scoresheet text, exactly as it was signed. */
  scoresheet: string;
  signatures: { white: SignaturePair; black: SignaturePair };
}

export interface Tournament {
  id: string;
  name: string;
  state: TournamentState;
  /** Everybody who registered, in the order they arrived. The draw sorts them itself. */
  entrants: string[];
  /** How many the field can hold. Reaching it closes registration. */
  seats: number;
  /** What each place is worth, in Luna. Declared before anybody registers. */
  prizes: number[];
  /** Fixed when registration closed, and never recomputed afterwards. */
  order: string[];
  pairings: Pairing[];
  results: TournamentResult[];
  /**
   * The signed games the results were read from, kept so a stranger never has to take our word.
   *
   * `/t/<id>` recomputes the standings in the reader's own browser; without the games it would be
   * recomputing from a table this server typed out, which is exactly the kind of trust the design
   * refuses. With them, the table and its evidence travel together.
   */
  games: BundledScoresheet[];
  createdAtBlock: number;
}

export interface TournamentView {
  id: string;
  name: string;
  state: TournamentState;
  entrants: string[];
  seats: number;
  prizes: number[];
  order: string[];
  pairings: Pairing[];
  results: TournamentResult[];
  games: BundledScoresheet[];
  standings: Standing[];
  createdAtBlock: number;
}

export class TournamentServerError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'TournamentServerError';
    this.status = status;
    this.code = code;
  }
}

export interface TournamentStore {
  all: () => Tournament[];
  get: (id: string) => Tournament | undefined;
  put: (tournament: Tournament) => void;
}

/** An in-memory store. The file-backed one is the same shape. */
export function createMemoryStore(): TournamentStore {
  const rows = new Map<string, Tournament>();
  return {
    all: () => [...rows.values()],
    get: (id) => rows.get(id),
    put: (tournament) => {
      rows.set(tournament.id, tournament);
    },
  };
}

export interface TournamentsOptions {
  store: TournamentStore;
  /**
   * Block height, for stamping. Never used for ordering — that is the scoresheets' job.
   *
   * Allowed to answer `null`, because the node it asks can be unreachable and a tournament is not
   * worth refusing over a decorative field. A missing height records zero, which is visibly a
   * non-answer rather than a plausible wrong one.
   */
  blockHeight: () => Promise<number | null>;
  /**
   * Which chain this tournament's games must be on.
   *
   * Not decoration, and not only tidiness. A scoresheet's `chain` is part of the signed text, and
   * without pinning it a player could sign a **testnet** sheet with the same key and report it here:
   * the signatures verify, the pairing matches, and the block height it carries comes from a
   * different chain entirely — which would walk straight through the "played after the tournament
   * started" check, since heights on two chains have nothing to say to each other.
   *
   * The witness already pins its chain for the same reason. Defaults to mainnet, because a server
   * that has not been told is a production one.
   */
  chain?: 'main' | 'test';
  /** Injected so tests can produce a known id. */
  newId?: () => string;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface Tournaments {
  create: (input: { name: string; seats: number; prizes: number[]; creator: string }) => Promise<TournamentView>;
  join: (id: string, address: string) => TournamentView;
  view: (id: string) => TournamentView;
  list: () => TournamentView[];
  record: (id: string, result: SignedResult) => TournamentView;
}

export function createTournaments(options: TournamentsOptions): Tournaments {
  const newId = options.newId ?? randomId;

  function viewOf(tournament: Tournament): TournamentView {
    return {
      ...tournament,
      // Computed on every read rather than stored. A stored table is a table that can drift from the
      // games it claims to summarise, and this one is cheap enough that there is no reason to.
      standings: standings(tournament.entrants, tournament.results),
    };
  }

  function found(id: string): Tournament {
    const tournament = options.store.get(id);
    if (!tournament) throw new TournamentServerError(404, 'no-tournament', 'There is no tournament with that id.');
    return tournament;
  }

  /**
   * Close registration and fix the draw.
   *
   * Called the moment the last seat is taken, and never again. **The draw is computed exactly once**,
   * because the whole fairness argument is that the entrant list was closed before anybody saw the
   * result — recomputing it later, after somebody withdrew, would let the order change under a player
   * who had already seen it.
   */
  function close(tournament: Tournament): void {
    tournament.order = drawOrder(tournament.id, tournament.entrants);
    /*
     * Up to eight players everybody plays everybody, and the whole schedule is known at once.
     *
     * Above that a round-robin is fifteen rounds and nobody finishes, so it is Swiss — and Swiss can
     * only pair the round about to be played, because who you meet depends on how you have done. The
     * first round is published here; each later one is paired when the round before it is complete.
     */
    tournament.pairings = usesSwiss(tournament.entrants.length)
      ? swissRound(tournament.order, [], 0)
      : scheduleFor(tournament.id, tournament.entrants);
    tournament.state = 'running';
  }

  /**
   * Publish the next Swiss round, once every game of the current one has a result.
   *
   * Not called for a round-robin, whose whole schedule was fixed at the draw. For Swiss it is the
   * mechanism: the pairings are a pure function of the draw order and the results so far, so this
   * computes exactly what a stranger recomputing the tournament would compute, and never anything
   * a stranger could not.
   */
  function advance(tournament: Tournament): void {
    if (!usesSwiss(tournament.entrants.length)) return;

    const total = swissRounds(tournament.entrants.length);
    const round = Math.max(0, ...tournament.pairings.map((pairing) => pairing.round));
    const thisRound = tournament.pairings.filter((pairing) => pairing.round === round);
    const done = thisRound.every((pairing) =>
      tournament.results.some(
        (result) =>
          result.round === round &&
          ((result.white === pairing.white && result.black === pairing.black) ||
            (result.white === pairing.black && result.black === pairing.white)),
      ),
    );
    if (!done) return;

    if (round + 1 >= total) {
      tournament.state = 'finished';
      return;
    }

    try {
      tournament.pairings.push(...swissRound(tournament.order, tournament.results, round + 1));
    } catch {
      /*
       * No legal pairing remains — every possible opponent has already been played.
       *
       * A real outcome in a small field, and the honest response is to end the tournament on the
       * rounds that were played rather than to repeat a pairing to fill the schedule.
       */
      tournament.state = 'finished';
    }
  }

  return {
    async create(input) {
      const name = input.name.trim();
      if (name.length === 0 || name.length > 60) {
        throw new TournamentServerError(400, 'bad-name', 'A tournament needs a name, and a short one.');
      }
      if (!Number.isInteger(input.seats) || input.seats < 2 || input.seats > MAX_SWISS) {
        throw new TournamentServerError(
          400,
          'bad-seats',
          `A tournament holds between 2 and ${MAX_SWISS} players.`,
        );
      }
      if (input.prizes.some((prize) => !Number.isInteger(prize) || prize < 0)) {
        throw new TournamentServerError(400, 'bad-prizes', 'Every prize must be a whole number of Luna.');
      }

      const tournament: Tournament = {
        id: newId(),
        name,
        state: 'open',
        entrants: [normaliseAddress(input.creator)],
        seats: input.seats,
        prizes: [...input.prizes],
        order: [],
        pairings: [],
        results: [],
        games: [],
        createdAtBlock: (await options.blockHeight()) ?? 0,
      };

      // A tournament for two is full the moment its second player joins, never on creation.
      options.store.put(tournament);
      return viewOf(tournament);
    },

    join(id, address) {
      const tournament = found(id);
      if (tournament.state !== 'open') {
        throw new TournamentServerError(409, 'not-open', 'That tournament has already started.');
      }

      const who = normaliseAddress(address);
      if (tournament.entrants.includes(who)) {
        // Not an error: somebody pressing join twice has done nothing wrong, and the honest answer is
        // the tournament they are already in.
        return viewOf(tournament);
      }
      if (tournament.entrants.length >= tournament.seats) {
        throw new TournamentServerError(409, 'full', 'That tournament is full.');
      }

      tournament.entrants.push(who);
      if (tournament.entrants.length === tournament.seats) close(tournament);

      options.store.put(tournament);
      return viewOf(tournament);
    },

    record(id, submitted) {
      const tournament = found(id);
      if (tournament.state === 'open') {
        throw new TournamentServerError(409, 'not-started', 'That tournament has not started.');
      }

      /*
       * ⭐ The result is read out of a signed game, never taken from the caller.
       *
       * This module's own header has always said results "arrive as ordinary signed scoresheets" —
       * and for a while the code did not check one. It accepted `{ round, white, black, whiteScore }`
       * from the request body, verified only that such a pairing existed, and wrote it into the
       * standings. `/t/<id>` is public by design, so the pairings are public too: anybody could post
       * a result for a game they were not in, and `already-recorded` then made it permanent. In a
       * tournament with a declared prize table, that decided money.
       *
       * So there is no longer any way to *state* a result. A caller presents a scoresheet two people
       * signed, and both signatures are checked against the addresses named inside it. Who played and
       * who won are read from the verified sheet; nothing the caller said about either is consulted.
       */
      const chain = options.chain ?? 'main';
      const checked = verifyScoresheet(submitted.scoresheet, submitted.signatures, chain);
      if (!checked.ok || !checked.sheet) {
        // A chain mismatch is its own answer. Reporting it as a signature failure would send somebody
        // looking at their wallet for a problem that is in the network they played on.
        if (checked.failure === 'wrong-chain') {
          throw new TournamentServerError(
            409,
            'wrong-chain',
            `That game was played on a different network; this tournament is on ${chain}net.`,
          );
        }
        throw new TournamentServerError(
          403,
          'unsigned-result',
          'A tournament result has to be a game both players signed.',
        );
      }

      const sheet = checked.sheet;

      /*
       * ⭐ And it has to be a game played *for this tournament*, not one dug out of the drawer.
       *
       * Every other check passes for an old game between the right two people: two real signatures,
       * a pairing the draw actually made, a round that exists, no result yet. So a pair who had ever
       * played each other could enter any future tournament and report a finished result the moment
       * the draw came out — winning a prize for a game played weeks earlier, possibly before the
       * prize existed. Found by attacking this endpoint rather than by reading it.
       *
       * The block height is part of the signed text, so this costs nothing and cannot be forged
       * without breaking the signatures it is checked alongside. `createdAtBlock` rather than the
       * moment registration closed, because it is the conservative of the two: it never rejects a
       * game somebody genuinely played for this tournament.
       */
      if (sheet.endedAtBlock < tournament.createdAtBlock) {
        throw new TournamentServerError(
          409,
          'game-too-old',
          'That game was played before this tournament existed.',
        );
      }

      const white = normaliseAddress(sheet.white);
      const black = normaliseAddress(sheet.black);
      const whiteScore = sheet.result === '1-0' ? 1 : sheet.result === '0-1' ? 0 : 0.5;
      const result = { round: submitted.round, white, black, whiteScore };

      // The pairing must be one this tournament actually made. Without this a player could report a
      // game against anybody, including one they invented, and the standings would count it.
      const paired = tournament.pairings.some(
        (pairing) =>
          pairing.round === result.round &&
          ((pairing.white === white && pairing.black === black) ||
            (pairing.white === black && pairing.black === white)),
      );
      if (!paired) {
        throw new TournamentServerError(409, 'not-paired', 'Those two were not paired in that round.');
      }

      const already = tournament.results.some(
        (existing) =>
          existing.round === result.round &&
          ((normaliseAddress(existing.white) === white && normaliseAddress(existing.black) === black) ||
            (normaliseAddress(existing.white) === black && normaliseAddress(existing.black) === white)),
      );
      if (already) {
        throw new TournamentServerError(409, 'already-recorded', 'That game already has a result.');
      }

      /*
       * ⭐ The same game cannot be presented twice under two different rounds.
       *
       * The duplicate check above is per pairing, and a pairing is (round, two players). Without
       * this, a player paired with the same opponent in two Swiss rounds — which the pairing rules
       * do not allow, but which a bug or a future format might — could submit one signed game for
       * both. Games are identified by their own id, which is in the signed text.
       */
      if (tournament.games.some((game) => game.text === submitted.scoresheet)) {
        throw new TournamentServerError(409, 'already-recorded', 'That game already has a result.');
      }

      tournament.results.push(result);
      tournament.games.push({
        text: submitted.scoresheet,
        white: submitted.signatures.white,
        black: submitted.signatures.black,
      });

      if (usesSwiss(tournament.entrants.length)) {
        advance(tournament);
      } else if (tournament.results.length === tournament.pairings.length) {
        tournament.state = 'finished';
      }

      options.store.put(tournament);
      return viewOf(tournament);
    },

    view(id) {
      return viewOf(found(id));
    },

    list() {
      return options.store
        .all()
        .sort((a, b) => b.createdAtBlock - a.createdAtBlock || (a.id < b.id ? -1 : 1))
        .map(viewOf);
    },
  };
}
