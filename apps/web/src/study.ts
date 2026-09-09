/**
 * Handing a finished game to the study screen.
 *
 * The commonest path through the analysis is not pasting a PGN — it is a game ending and the player
 * tapping "See where it went wrong". That needs the moves to survive one navigation, and nothing
 * more: not a URL (a forty-move game does not belong in an address bar), not a server round trip
 * (the game may never have touched one), and not a module-level variable (a reload would lose it,
 * and a reload is exactly what somebody does when a screen looks empty).
 *
 * `sessionStorage` is the right size of tool. It survives the navigation and a reload, it is scoped
 * to this tab so two games in two tabs cannot collide, and it disappears when the tab closes —
 * which is correct, because this is a handover, not a library.
 *
 * **It is taken, not read.** The study screen consumes the handover on arrival, so opening `/study`
 * again later shows the paste box rather than resurrecting a game from an hour ago.
 */

const KEY = 'scoresheet.study';

export interface HandedGame {
  moves: string[];
  /** What to call it on screen — the players, or the bot, or how it ended. */
  title: string;
}

/** Put a game in front of the study screen, then navigate there. */
export function handOver(game: HandedGame): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // Storage can be full, or blocked entirely in a private window. The study screen then shows its
    // paste box, which is a worse path but not a broken one — so this is not worth an error.
  }
}

/** Take whatever was handed over, leaving nothing behind. */
export function takeGame(): HandedGame | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { moves, title } = parsed as { moves?: unknown; title?: unknown };
    // Validated rather than trusted: this came out of storage, which anything on this origin could
    // have written, and a bad shape here would break the screen rather than the handover.
    if (!Array.isArray(moves) || !moves.every((san) => typeof san === 'string')) return null;
    return { moves: moves as string[], title: typeof title === 'string' ? title : 'A game' };
  } catch {
    return null;
  }
}
