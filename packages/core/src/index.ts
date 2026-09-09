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

/**
 * The engine's own board and search — `SPEC.md` K1.
 *
 * Exported so a worker can drive the search directly without going through `chess.js` at every step,
 * and so the perft tests can hold the generator to the published counts.
 */
export {
  Position,
  perft,
  perftDivide,
  moveFrom,
  moveTo,
  movePromotion,
  moveFlags,
  squareName,
  squareFromName,
} from './position.ts';
export {
  MATE,
  MATE_THRESHOLD,
  createTable,
  findBestMove,
  mateIn,
  evaluate as evaluatePosition,
  type SearchLimits,
  type SearchResult,
  type SearchTable,
} from './search.ts';

export { fromBase64Url, toBase64Url } from './base64.ts';

export {
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  NIMIQ_SIGN_MESSAGE_PREFIX,
  SignatureDeclinedError,
  SignatureShapeError,
  coerceSignatureBytes,
  nimiqSignedMessageDigest,
  normaliseSignature,
  type NormalisedSignature,
} from './signature.ts';

/**
 * The opening book — what the position is called, and what is played from it.
 *
 * `openings-data.ts` is deliberately not re-exported: it is 208 KB of generated string, and nothing
 * outside `openings.ts` has any business reading it.
 */
export { bookMoves, bookSize, chooseBookMove, openingFor, type Opening } from './openings.ts';

/** PGN, so a game can be read by every other chess program on earth. */
export { fromPgn, toPgn, type ImportResult, type ImportedGame, type PgnOptions } from './pgn.ts';

/**
 * Where a game was lost, move by move — the one feature people name when asked why they use a chess
 * site rather than a chess board.
 */
export {
  ANALYSIS_LEVEL,
  BLUNDER_AT,
  INACCURACY_AT,
  MISTAKE_AT,
  acplOf,
  analyseGame,
  gameAccuracy,
  judge,
  moveAccuracy,
  winPercent,
  type AnalyseOptions,
  type AnalysedMove,
  type GameAnalysis,
  type Judgement,
} from './analysis.ts';

export {
  PUZZLE_FLOOR,
  PUZZLE_K,
  PUZZLE_START,
  dailyPuzzle,
  dayKey,
  hashString,
  loadPuzzles,
  nextPuzzleRating,
  parsePuzzles,
  puzzleId,
  puzzleNear,
  shortPuzzleId,
  type Puzzle,
} from './puzzle-set.ts';

export {
  PUZZLE_CARD_VERSION,
  PuzzleCardError,
  canonicalCardOrder,
  canonicalisePuzzleCard,
  computePuzzleRating,
  hashAttempts,
  parsePuzzleCard,
  type PuzzleAttempt,
  type PuzzleCard,
  type PuzzleMode,
  type PuzzleRating,
} from './puzzlecard.ts';

export {
  NNUE_BUCKETS,
  NNUE_HIDDEN,
  NNUE_SOURCE,
  NnueError,
  loadNnue,
  type Nnue,
} from './nnue.ts';

export {
  BUNDLE_VERSION,
  ANCHOR_TAG,
  BundleError,
  merkleRoot,
  inclusionProof,
  verifyInclusion,
  buildBundle,
  anchorData,
  checkBundle,
  type BundleSignature,
  type BundledScoresheet,
  type BundledPuzzleCard,
  type BundleCompleteness,
  type RatingBundle,
  type BundleRejection,
  type RejectedRecord,
  type BundleCheck,
  type BuildBundleOptions,
} from './bundle.ts';

export {
  MIN_LOSS_TO_EXPLAIN,
  explainMove,
  bestExplanation,
  type Explanation,
  type ExplanationBasis,
  type ExplanationKind,
  type ExplainInput,
} from './explain.ts';

export {
  MIN_UNIQUE_MARGIN,
  MIN_MISTAKE_COST,
  MARGIN_CAP,
  considerMistake,
  asPuzzle,
  stillSound,
  alreadyQueued,
  queueOrder,
  type OwnPuzzle,
  type CandidateInput,
  type CandidateResult,
  type RefusalReason,
} from './own-puzzles.ts';

export {
  WIN,
  DRAW,
  LOSS,
  MAX_ROUND_ROBIN,
  TournamentError,
  drawOrder,
  roundRobin,
  scheduleFor,
  standings,
  prizeSplit,
  type Pairing,
  type TournamentResult,
  type Standing,
} from './tournament.ts';

export {
  MAX_SWISS,
  swissRounds,
  swissRound,
  swissBye,
  usesSwiss,
} from './swiss.ts';

export {
  MIN_MOVES,
  MIN_GAMES_FOR_BASELINE,
  FAIR_PLAY_CAVEAT,
  BAND_CONSEQUENCE,
  assess,
  type FairPlayBand,
  type GameSignals,
  type FairPlayAssessment,
} from './fairplay.ts';
