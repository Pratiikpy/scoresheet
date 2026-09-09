/**
 * The Node host: a real HTTP server around the pure router.
 *
 * Everything specific to running on a box lives here and nowhere else — reading a body off a socket,
 * CORS, the sweep timer, the block-height fetch. `live.ts` and `http.ts` stay transport-free, so the
 * serverless host is a different file of the same size rather than a second copy of the game.
 *
 *   node --experimental-strip-types packages/server/src/node.ts
 *
 * Environment: `PORT` (default 8787), `GAMES_DIR` (default `.games`, omit for memory only),
 * `NIMIQ_RPC` (default the public Nimiq node), `ALLOW_ORIGIN` (default `*`).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createLive, type Live } from './live.ts';
import { handleRequest } from './http.ts';
import { createFileStore } from './file-store.ts';
import { createMemoryStore } from './store.ts';
import { createPool, LUNA_PER_NIM, type Pool } from './pool.ts';
import {
  createMemoryStore as createTournamentStore,
  createTournaments,
  type Tournaments,
} from './tournaments.ts';
import { createMemorySessions, createWitness, type Witness } from './witness.ts';
import { createFileClaimStore, createMemoryClaimStore } from './claim-store.ts';
import { createNimiqPayout, poolAddress } from './nimiq-payout.ts';
import { createRateLimiter, type RateLimiter } from './limits.ts';

/** 32 hex characters, from a real CSPRNG. `SPEC.md` F1 requires server-issued and unguessable. */
export function newGameId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * The current Nimiq block height, for the scoresheet's ordering key.
 *
 * **Allowed to fail, and a failure is recorded honestly as `null`** rather than filled in with a
 * guess. `endedAtBlock` is signed by two people (`SPEC.md` F2), so a number this server invented
 * would be a lie that two players had put their names to — far worse than an absent one.
 *
 * Cached for a few seconds because a block is a minute long and every ending would otherwise make
 * its own request.
 */
export function createBlockHeight(url: string, fetchImpl: typeof fetch = fetch) {
  let cached: { height: number; at: number } | null = null;

  return async function blockHeight(): Promise<number | null> {
    if (cached && Date.now() - cached.at < 10_000) return cached.height;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockNumber', params: [] }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { result?: { data?: number } | number };
      const height =
        typeof payload.result === 'number' ? payload.result : (payload.result?.data ?? null);
      if (typeof height !== 'number' || !Number.isFinite(height)) return null;
      cached = { height, at: Date.now() };
      return height;
    } catch {
      // Unreachable, slow, or answering something unexpected. A game must still be able to end.
      return null;
    }
  };
}

/** Read and parse a JSON body, with a cap so a request cannot be used to exhaust memory. */
async function readBody(request: IncomingMessage, limitBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    // Malformed JSON is the router's problem to describe, not a crash here.
    return null;
  }
}

export function createNodeServer(
  live: Live,
  options: {
    allowOrigin?: string;
    pool?: Pool;
    limiter?: RateLimiter;
    trustProxy?: boolean;
    witness?: Witness | undefined;
    /**
     * Tournaments, when this host runs them.
     *
     * Optional for the same reason the pool and the witness are: a host without them answers
     * honestly that they are unavailable rather than pretending, and every other route keeps working.
     */
    tournaments?: Tournaments | undefined;
  } = {},
) {
  const allowOrigin = options.allowOrigin ?? '*';

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      /*
       * CORS, because the app and the API may not share an origin.
       *
       * A Mini App runs inside a WebView on Nimiq's origin, and the static app may be on a CDN while
       * this is on a box. Without these headers every request from the real product fails with a
       * message about origins that says nothing about chess.
       */
      response.setHeader('access-control-allow-origin', allowOrigin);
      response.setHeader('access-control-allow-headers', 'content-type');
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      // The API is never cached: a poll that returned a stored answer would freeze the game.
      response.setHeader('cache-control', 'no-store');

      if (request.method === 'OPTIONS') {
        response.writeHead(204).end();
        return;
      }

      const url = new URL(request.url ?? '/', 'http://localhost');
      const query: Record<string, string> = {};
      for (const [key, value] of url.searchParams) query[key] = value;

      let body: unknown = null;
      if (request.method === 'POST') {
        try {
          body = await readBody(request);
        } catch {
          response.writeHead(413, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { code: 'too-large', message: 'That request was too large.' } }));
          return;
        }
      }

      /*
       * Who is asking, for the rate limiter.
       *
       * `x-forwarded-for` is only believed when the host is told to — `TRUST_PROXY=1` — because
       * behind no proxy it is a header anybody can set, and trusting it by default would hand every
       * caller a fresh allowance per request. Without a proxy the socket address is the truth.
       */
      const forwarded = options.trustProxy
        ? String(request.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
        : '';
      const caller = forwarded || request.socket.remoteAddress || 'unknown';

      const result = await handleRequest(
        live,
        { method: request.method ?? 'GET', path: url.pathname, query, body, caller },
        options.pool,
        options.limiter,
        options.witness,
        options.tournaments,
      );

      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result.body));
    })();
  });
}

/** Start a server from the environment. Imported for tests; run directly for a box. */
export function serverFromEnvironment() {
  /*
   * A fixed height, for running without a chain.
   *
   * `NIMIQ_BLOCK_HEIGHT` exists because the whole signing path is unreachable without a height — a
   * game that cannot be ordered cannot be signed, correctly — and a test suite that needs a live
   * Nimiq node to check its own scoresheet flow is a test suite that fails when somebody else's
   * server is down. It is opt-in and absent in production, where the real chain is the only source
   * a signed ordering key may come from.
   */
  const fixed = Number(process.env['NIMIQ_BLOCK_HEIGHT']);
  const fixedHeight =
    Number.isInteger(fixed) && fixed > 0 ? async (): Promise<number | null> => fixed : null;

  const directory = process.env['GAMES_DIR'] ?? '.games';
  const store = directory === '' ? createMemoryStore() : createFileStore(directory);
  const live = createLive({
    store,
    now: Date.now,
    newId: newGameId,
    blockHeight: fixedHeight ?? createBlockHeight(process.env['NIMIQ_RPC'] ?? 'https://rpc.nimiqwatch.com'),
  });

  /*
   * The puzzle pool, which pays real NIM for solving the puzzle of the day.
   *
   * `POOL_PRIVATE_KEY` turns it on. Without it every screen says the pool is not funded and nothing
   * else changes — the whole path exists either way, which is what makes "it works the moment the
   * wallet is funded" a fact rather than a promise.
   *
   * `POOL_DAILY_NIM` is the day's ceiling, and should be set to the staking reward less a margin
   * (`SPEC.md` K7). It is what makes "the principal is never touched" true in code rather than in
   * prose: when the day's budget is spent the pool stops paying until tomorrow.
   *
   * The claims live in their own directory and are **never swept**. The game store deletes games
   * after a day; doing that to claims would reset the abuse limits every night and turn the pool
   * into a faucet with no limit at all.
   */
  const poolKey = process.env['POOL_PRIVATE_KEY'];
  const pool = createPool({
    // Published so the app can offer "add to the pool". A receiving address, derived from a key that
    // never leaves this process.
    address: poolAddress(poolKey),
    store: directory === '' ? createMemoryClaimStore() : createFileClaimStore(join(directory, 'claims')),
    now: Date.now,
    config: {
      rewardLuna: Math.round(Number(process.env['POOL_REWARD_NIM'] ?? 0.5) * LUNA_PER_NIM),
      dailyBudgetLuna: Math.round(Number(process.env['POOL_DAILY_NIM'] ?? 20) * LUNA_PER_NIM),
    },
    payout: createNimiqPayout({
      privateKeyHex: poolKey,
      rpcUrl: process.env['NIMIQ_RPC'] ?? 'https://rpc.nimiqwatch.com',
      network: process.env['NIMIQ_NETWORK'] === 'test' ? 'test' : 'main',
    }),
  });

  // Printed at start-up so an operator can see at a glance which of the two states this is in.
  const where = poolAddress(poolKey);
  console.log(where ? `pool wallet ${where}` : 'pool not funded — set POOL_PRIVATE_KEY to turn it on');

  /*
   * The puzzle witness, which is what makes a rating earnable by one person on their own.
   *
   * `WITNESS_PRIVATE_KEY` turns it on, and unlike the bot's key this one is **secret** — a published
   * witness key would let any solver witness their own run, which is the whole attack the witness
   * exists to stop (`witness.ts`). Without it, puzzles still work exactly as before and the screen
   * says runs are not rated here rather than discovering it after twenty of them.
   *
   * Sessions live in memory on purpose. They are minutes long, and a run lost to a restart costs
   * somebody one run — where persisting them would mean holding a list of what everyone is solving.
   */
  const witnessKey = process.env['WITNESS_PRIVATE_KEY'];
  const witness = witnessKey
    ? createWitness({
        privateKeyHex: witnessKey,
        chain: process.env['NIMIQ_NETWORK'] === 'test' ? 'test' : 'main',
        sessions: createMemorySessions(),
        blockHeight: fixedHeight ?? createBlockHeight(process.env['NIMIQ_RPC'] ?? 'https://rpc.nimiqwatch.com'),
        newSessionId: newGameId,
      })
    : undefined;

  console.log(
    witness
      ? `puzzle witness ${witness.address}`
      : 'puzzles not witnessed — set WITNESS_PRIVATE_KEY to rate them',
  );

  /*
   * Tournaments, always available.
   *
   * Unlike the pool and the witness there is no key to configure: a tournament needs somewhere to
   * remember who registered and nothing else, because every decision it makes is a public function
   * anybody can rerun. That is the difference between a service that holds value and one that holds
   * a list.
   */
  const tournaments = createTournaments({
    store: createTournamentStore(),
    chain: process.env['NIMIQ_NETWORK'] === 'test' ? 'test' : 'main',
    blockHeight: fixedHeight ?? createBlockHeight(process.env['NIMIQ_RPC'] ?? 'https://rpc.nimiqwatch.com'),
  });

  const server = createNodeServer(live, {
    allowOrigin: process.env['ALLOW_ORIGIN'] ?? '*',
    pool,
    witness,
    tournaments,
    limiter: createRateLimiter(),
    trustProxy: process.env['TRUST_PROXY'] === '1',
  });

  /*
   * The sweep runs on a timer and is unref'd.
   *
   * Unref'd so the timer alone never keeps the process alive — a server that will not exit because
   * of its own housekeeping is a server that has to be killed, and it is the sort of thing that
   * makes a deploy script grow a `-9`.
   */
  const sweeping = setInterval(() => void live.sweep().catch(() => undefined), 60 * 60 * 1000);
  sweeping.unref();

  return { server, live, pool };
}

// Run directly, but not when imported by a test.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop() ?? '')) {
  const port = Number(process.env['PORT'] ?? 8787);
  const { server } = serverFromEnvironment();
  server.listen(port, () => console.log(`scoresheet server on :${port}`));
}
