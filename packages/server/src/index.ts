/**
 * The live-game server, as a library.
 *
 * Deliberately transport-free: `live.ts` is a state machine and `store.ts` is an interface, so the
 * same code runs behind a Node HTTP server on a box, behind a serverless function, or inside a test
 * with no network at all. `SPEC.md` I1 asked for exactly this shape, and it is the reason choosing a
 * host later is a deployment decision rather than a rewrite.
 */

export {
  ABANDON_AFTER_MS,
  KEEP_SIGNED_MS,
  LAG_GRACE_MS,
  MIN_FULL_MOVES_TO_RATE,
  TIME_CONTROLS,
  LiveError,
  clocksAt,
  createLive,
  isFlagged,
  positionOf,
  rates,
  seatOf,
  viewOf,
  type Dependencies,
  type GameView,
  type Live,
  type TimeControlName,
} from './live.ts';

export { createMemoryStore, expired, type GameStore, type StoredGame } from './store.ts';
export { createFileStore } from './file-store.ts';
export {
  LUNA_PER_NIM,
  createPool,
  memoFor,
  type Claim,
  type ClaimStore,
  type ClaimOutcome,
  type Payout,
  type Pool,
  type PoolConfig,
  type RefusalReason,
} from './pool.ts';
export { createFileClaimStore, createMemoryClaimStore } from './claim-store.ts';
export {
  budgetFor,
  createStaking,
  type StakeReport,
  type Staking,
  type StakingRpc,
} from './staking.ts';
export { handleRequest, type RequestLike, type ResponseLike } from './http.ts';
export { LIMITS, createRateLimiter, limitFor, type LimitKind, type RateLimiter } from './limits.ts';

/*
 * The Node host is exported separately.
 *
 * It is the one file that touches `node:http` and `node:crypto`, so importing it from a bundler
 * target would drag Node built-ins into a browser build. Anything running on a box imports it by
 * name; nothing else does.
 */
export { createBlockHeight, createNodeServer, newGameId, serverFromEnvironment } from './node.ts';
export { createNimiqPayout, poolAddress } from './nimiq-payout.ts';

export {
  MAX_CLAIMABLE_RATING,
  MAX_RUN,
  MIN_MS_PER_PUZZLE,
  SESSION_TTL_MS,
  WitnessError,
  createMemorySessions,
  createWitness,
  witnessAddress,
  type FinishRequest,
  type IssueRequest,
  type IssuedSession,
  type Session,
  type SessionStore,
  type Witness,
  type WitnessOptions,
  type WitnessedRun,
} from './witness.ts';
