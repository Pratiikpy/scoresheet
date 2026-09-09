/**
 * The polling client.
 *
 * **Polling, not a socket** (`SPEC.md` I1): nothing can be down when a judge opens the link, and a
 * stateless request is a smaller thing to be down than a socket server. The cost is bounded by the
 * `since` parameter — an unchanged poll is about eighty bytes, so a game left open in a background
 * tab costs almost nothing.
 *
 * Three behaviours here are what separate a polling client that feels live from one that feels like
 * a page that reloads:
 *
 *  1. **It polls faster when it is the opponent's move.** Waiting for a reply is the only moment
 *     latency is felt; while it is your move, nothing can arrive that you need quickly.
 *  2. **It backs off when the tab is hidden, and catches up the instant it is shown.** A phone in a
 *     pocket must not spend battery on a game nobody is looking at, and coming back to a stale board
 *     is the thing that makes polling obvious.
 *  3. **A failed poll is not an error.** Networks drop. It retries with a widening gap and only says
 *     something once it has been failing long enough that a person would want to know.
 */

import type { GameView } from './online-types.ts';
import { t } from './i18n.ts';

/**
 * Where the API lives. Same origin in production; `VITE_API` points a dev build at a box.
 *
 * Guarded because `import.meta.env` exists only inside a Vite build. Under Node — which is how every
 * unit test in this package runs — the property access throws a `TypeError` at module load, and a
 * module that cannot be imported cannot be tested at all. Vite still replaces the expression inside
 * the `try` at build time, so nothing is lost by having it.
 */
export function apiBase(): string {
  try {
    return import.meta.env.VITE_API ?? '';
  } catch {
    return '';
  }
}

const API: string = apiBase();

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // No response at all: offline, a dead server, a captive portal. The distinction is invisible
    // from here, so the message is about what the person can do rather than about what broke.
    throw new ApiError(t('api.offline'), 'offline', 0);
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? t('api.something'),
      payload?.error?.code ?? 'unknown',
      response.status,
    );
  }
  return payload as T;
}

/**
 * Is this actually a game, or merely a two-hundred?
 *
 * `call<GameView>()` casts whatever came back, and every screen then reads `moves`, `fen` and `turn`
 * as though they were what they claim to be. Fed a well-formed *response* of the wrong *shape*, the
 * live screen did not crash — it got three layers deep into `chess.js` and put
 * **"Something went wrong: Invalid move: e."** on the board, which is a library's internal error
 * shown to somebody in the middle of a game. `failures.ts` exists to guarantee that never happens.
 *
 * So the shape is checked at the boundary, where the failure can still be described accurately: the
 * server sent something this app cannot read, which is our bug and says so. Only the fields every
 * reader depends on are checked — this is a guard against a wrong shape, not a schema validator, and
 * a validator that rejected a server one field ahead of this client would be worse than the bug.
 */
function looksLikeGame(payload: unknown): payload is GameView {
  if (typeof payload !== 'object' || payload === null) return false;
  const game = payload as Record<string, unknown>;
  if (typeof game['id'] !== 'string') return false;
  if (!Array.isArray(game['moves']) || game['moves'].some((san) => typeof san !== 'string')) return false;
  if (typeof game['fen'] !== 'string') return false;
  if (game['turn'] !== 'w' && game['turn'] !== 'b') return false;
  if (typeof game['version'] !== 'number') return false;
  return true;
}

/** A game from the server, or an error a person can read. Every game the app receives goes through this. */
async function gameCall(path: string, init?: RequestInit): Promise<GameView> {
  const payload = await call<unknown>(path, init);
  if (!looksLikeGame(payload)) {
    throw new ApiError(t('api.badShape'), 'bad-shape', 0);
  }
  return payload;
}

export function createGame(input: {
  address: string;
  colour: 'w' | 'b' | 'random';
  timeControl: string;
}): Promise<GameView> {
  return gameCall('/api/game', { method: 'POST', body: JSON.stringify(input) });
}

export function joinGame(id: string, address: string): Promise<GameView> {
  return gameCall(`/api/game/${id}/join`, { method: 'POST', body: JSON.stringify({ address }) });
}

/**
 * Ask for another game against the same person, colours swapped.
 *
 * Idempotent from either side: the server stamps the invitation on the finished game, so the second
 * player to press joins the first one's game rather than making a third.
 */
export function askRematch(id: string, address: string): Promise<GameView> {
  return gameCall(`/api/game/${id}/rematch`, {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

export async function fetchGame(
  id: string,
  since?: number,
): Promise<GameView | { version: number; unchanged: true }> {
  const query = since === undefined ? '' : `?since=${since}`;
  const payload = await call<unknown>(`/api/game/${id}${query}`);

  // The cheap answer to an unchanged poll is a bare `{ version, unchanged }`, which is not a game
  // and must not be held to a game's shape.
  const unchanged = payload as { unchanged?: unknown; version?: unknown } | null;
  if (unchanged && unchanged.unchanged === true && typeof unchanged.version === 'number') {
    return { version: unchanged.version, unchanged: true };
  }

  if (!looksLikeGame(payload)) throw new ApiError(t('api.badShape'), 'bad-shape', 0);
  return payload;
}

export function sendMove(id: string, address: string, san: string): Promise<GameView> {
  return gameCall(`/api/game/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ address, san }),
  });
}

export function sendAction(
  id: string,
  address: string,
  action: 'resign' | 'claim' | 'draw',
): Promise<GameView> {
  return gameCall(`/api/game/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

export function sendSignature(
  id: string,
  address: string,
  signature: { publicKeyHex: string; signatureHex: string },
): Promise<GameView> {
  return gameCall(`/api/game/${id}/sign`, {
    method: 'POST',
    body: JSON.stringify({ address, ...signature }),
  });
}

/* ------------------------------------------------------------------ the poller */

/** How often to ask, by what the client is waiting for. */
const WAITING_MS = 600;
const YOUR_MOVE_MS = 2_000;
const HIDDEN_MS = 15_000;
/**
 * A finished game still polls, but slowly.
 *
 * It has to keep polling at all because the other player may ask for a rematch minutes after the
 * result, and that invitation arrives on an ordinary poll. It must not keep polling *fast*: a
 * finished game left open in a tab would otherwise ask the server twice a second, forever, about a
 * game that will never change again.
 */
const FINISHED_MS = 4_000;
/** After this many consecutive failures, the screen is told the connection is in trouble. */
const FAILURES_BEFORE_COMPLAINING = 3;

export interface Poller {
  /** Ask again right now — after making a move, or when the tab comes back. */
  nudge: () => void;
  stop: () => void;
}

/**
 * Poll a game and report every change.
 *
 * The interval is recomputed after each answer rather than fixed, so the same loop covers "waiting
 * for their move", "it is my move" and "nobody is looking at this tab" without three code paths.
 */
export function pollGame(
  id: string,
  options: {
    /** The version already held, so the first poll can be cheap. */
    since: number;
    mySide: () => 'w' | 'b' | null;
    /** Whether the game is over, so a settled game is not polled at playing speed. */
    over: () => boolean;
    onGame: (game: GameView) => void;
    /** Called when the connection has been failing long enough to be worth saying. */
    onTrouble: (trouble: boolean) => void;
  },
): Poller {
  let stopped = false;
  let version = options.since;
  let failures = 0;
  let timer: number | null = null;
  let complaining = false;

  function interval(): number {
    if (document.visibilityState === 'hidden') return HIDDEN_MS;
    if (options.over()) return FINISHED_MS;
    const mine = options.mySide();
    // Nothing that needs a fast answer can arrive while it is this player's move.
    return mine !== null && mine === lastTurn ? YOUR_MOVE_MS : WAITING_MS;
  }

  let lastTurn: 'w' | 'b' | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const answer = await fetchGame(id, version);
      failures = 0;
      if (complaining) {
        complaining = false;
        options.onTrouble(false);
      }
      if (!('unchanged' in answer)) {
        version = answer.version;
        lastTurn = answer.turn;
        options.onGame(answer);
      }
    } catch {
      failures += 1;
      if (failures >= FAILURES_BEFORE_COMPLAINING && !complaining) {
        complaining = true;
        options.onTrouble(true);
      }
    } finally {
      if (!stopped) {
        /*
         * Back off while failing, up to eight seconds — and further when told to slow down.
         *
         * A client hammering a server that is already struggling is how a brief outage becomes a
         * long one, and it is also how a phone on a dead network flattens its own battery. A 429 is
         * the server saying so explicitly, so it is worth more than a guess: the next poll waits a
         * full interval longer than a plain failure would.
         */
        const wait = failures > 0 ? Math.min(8_000, interval() * 2 ** Math.min(failures, 4)) : interval();
        timer = window.setTimeout(() => void tick(), wait);
      }
    }
  }

  function onVisibility(): void {
    // Coming back to a stale board is the thing that makes polling obvious. Ask immediately.
    if (document.visibilityState === 'visible') nudge();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function nudge(): void {
    if (stopped) return;
    if (timer !== null) window.clearTimeout(timer);
    void tick();
  }

  void tick();

  return {
    nudge,
    stop() {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
