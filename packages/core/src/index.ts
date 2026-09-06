/**
 * @scoresheet/core — the frozen foundation.
 *
 * Everything downstream (the board, the server, the record page, the recompute page) is a claim
 * about the output of this package. It has no dependency on a browser, a server or a wallet, so it
 * can be tested exhaustively and runs identically on both sides of a handshake.
 */

export {
  SCORESHEET_VERSION,
  ScoresheetError,
  canonicaliseScoresheet,
  hashMoves,
  normaliseAddress,
  opponentOf,
  parseScoresheet,
  sameAddress,
  scoreFor,
  sideOf,
  toBase64Url,
  type ChessChain,
  type GameResult,
  type Scoresheet,
  type Termination,
} from './scoresheet.ts';

export {
  DISTINCT_OPPONENTS_FOR_ESTABLISHED,
  K_ESTABLISHED,
  K_FULL_GAMES_PER_OPPONENT,
  K_HALF_GAMES_PER_OPPONENT,
  K_PROVISIONAL,
  MIN_MOVES_TO_RATE,
  PROVISIONAL_GAMES,
  RATING_FLOOR,
  STARTING_RATING,
  canonicalOrder,
  computeRatings,
  counts,
  expectedScore,
  gamesInvolving,
  kForPairing,
  opponentIn,
  ratingFor,
  toRatedGame,
  type RatedGame,
  type Rating,
  type RatingPoint,
} from './elo.ts';

export {
  adjudicateFlag,
  canClaimThreefold,
  canPossiblyMate,
  isFivefoldRepetition,
  outcomeOf,
  type Outcome,
} from './rules.ts';

export {
  DEFAULT_BUDGET_MS,
  LEVELS,
  PAWN,
  chooseMove,
  evaluate,
  type Choice,
  type ChooseOptions,
  type Level,
} from './engine.ts';
