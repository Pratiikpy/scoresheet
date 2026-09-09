/**
 * The puzzle set, and everything about it that two parties have to agree on.
 *
 * This lives in `core` rather than in the app for one reason, and it is the reason the whole
 * witness design works: **the server and the browser must be looking at the same 5,000 puzzles.**
 * A puzzle rating the server countersigns is a claim about which puzzle was served and whether the
 * line given solved it, and neither side can check the other's answer against a set only one of
 * them holds. Two copies of a data file drift; one copy imported twice cannot.
 *
 * So the parse, the identity, the daily's selection, the rating-window search and the rating maths
 * all live here, and both sides import them rather than reimplementing them. What stays in the app
 * is only what a server has no opinion about: how a solution is judged move by move on a board, and
 * which themes are worth putting on a menu.
 *
 * The data itself (`puzzles-data.ts`, 442 KB) is reached through a dynamic `import()` and never a
 * static one. That is what makes Vite emit it as its own chunk instead of inlining it into the
 * bundle that draws the board — somebody opening this app came for a chessboard, not for a puzzle
 * database they may never look at.
 *
 * Public domain (CC0) from the Lichess puzzle database. See `NOTICES.md`.
 */

export interface Puzzle {
  /** The position **before** the opponent's blunder. The first move of `moves` is theirs. */
  fen: string;
  /** The whole line in UCI, opponent first, then alternating. */
  moves: string[];
  /** Lichess's rating for it, with a settled deviation. */
  rating: number;
  /** What the solver is being asked to see: `fork`, `backRankMate`, and so on. */
  themes: string[];
}

/**
 * Parse the tab-separated puzzle table.
 *
 * Separated from the loader so a test — or a server that already holds the table — can exercise the
 * parse without going through a dynamic import.
 */
export function parsePuzzles(table: string, themeNames: readonly string[]): Puzzle[] {
  const out: Puzzle[] = [];
  for (const line of table.split('\n')) {
    if (!line) continue;
    const [fen, moves, rating, themes] = line.split('\t');
    if (!fen || !moves || !rating) continue;
    out.push({
      fen,
      moves: moves.split(' '),
      rating: Number(rating),
      themes: (themes ?? '')
        .split(',')
        .filter(Boolean)
        // An index past the end of the table means the data and the table disagree, which would
        // otherwise render as the literal word "undefined" on screen.
        .map((index) => themeNames[Number(index)] as string | undefined)
        .filter((theme): theme is string => theme !== undefined),
    });
  }
  return out;
}

let loaded: Promise<Puzzle[]> | null = null;

/**
 * Every bundled puzzle, parsed once.
 *
 * The promise itself is cached rather than the result, so two screens opening at the same moment
 * share one parse instead of racing to do it twice.
 */
export function loadPuzzles(): Promise<Puzzle[]> {
  loaded ??= (async () => {
    const { PUZZLES, PUZZLE_THEMES } = await import('./puzzles-data.ts');
    return parsePuzzles(PUZZLES, PUZZLE_THEMES);
  })();
  return loaded;
}

/* ------------------------------------------------------------------ choosing one */

/**
 * A small deterministic hash, so "today's puzzle" is the same puzzle for everybody.
 *
 * A daily puzzle people cannot talk about is not a daily puzzle. `Math.random` seeded by the date
 * would drift between engines; FNV-1a is four lines and gives the same answer everywhere, forever.
 */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Today, as `YYYY-MM-DD` in the player's own timezone — the day they are actually living in. */
export function dayKey(when: Date = new Date()): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, '0');
  const day = String(when.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The puzzle of the day.
 *
 * Deliberately **not** matched to the player's rating: the point of a daily is that it is the same
 * one everybody else got, which is what makes it worth mentioning to somebody. It is drawn from the
 * middle of the range so it is solvable by most people and not trivial for the rest.
 */
export function dailyPuzzle(puzzles: readonly Puzzle[], day: string = dayKey()): Puzzle | null {
  const pool = puzzles.filter((puzzle) => puzzle.rating >= 1000 && puzzle.rating < 1800);
  const from = pool.length > 0 ? pool : puzzles;
  if (from.length === 0) return null;
  return from[hashString(day) % from.length]!;
}

/**
 * A puzzle near a rating, avoiding ones already seen.
 *
 * The window widens until something is found rather than failing: a player at 2900 has few puzzles
 * near them, and "no puzzle available" is a worse answer than one a little easier than ideal.
 */
export function puzzleNear(
  puzzles: readonly Puzzle[],
  rating: number,
  seen: ReadonlySet<string>,
  random: () => number = Math.random,
  theme?: string | undefined,
): Puzzle | null {
  /*
   * A theme narrows the pool before the rating window does — `SPEC.md` H1, which called this cheap
   * and meant it: the data has carried `themes` since it was vendored, the puzzle screen has been
   * *displaying* them all along, and nothing let anybody train one.
   *
   * A theme with nothing near your rating widens the window like any other, and a theme with nothing
   * at all falls back to every puzzle rather than to an empty screen.
   */
  const themed = theme ? puzzles.filter((puzzle) => puzzle.themes.includes(theme)) : puzzles;
  const from = themed.length > 0 ? themed : puzzles;

  for (const window of [100, 200, 400, 800, Infinity]) {
    const pool = from.filter(
      (puzzle) => Math.abs(puzzle.rating - rating) <= window && !seen.has(puzzleId(puzzle)),
    );
    if (pool.length > 0) return pool[Math.floor(random() * pool.length)]!;
  }
  // Everything has been seen. Repeating is better than stopping, and 5,000 makes it unlikely.
  return puzzles.length > 0 ? puzzles[Math.floor(random() * puzzles.length)]! : null;
}

/* ------------------------------------------------------------------ naming one */

/** A stable identity for a puzzle. The position plus its line is unique and needs no stored id. */
export function puzzleId(puzzle: Puzzle): string {
  return `${puzzle.fen}|${puzzle.moves.join(' ')}`;
}

/**
 * The same identity, short enough for a transaction memo.
 *
 * Nimiq's data field is 64 bytes and `puzzleId` is a FEN plus a move list — well over it. The first
 * version simply let the memo truncate, which produced `chess puzzle 2026-09-07 r7/2k3p1/1np1p2p…`:
 * a fragment of a position that identifies nothing and cannot be matched against anything.
 *
 * A hash of the full id fits, and it is **auditable** in the way the truncation was not — anybody
 * can hash the bundled puzzle set and find which one a payout was for, which is exactly what
 * `SPEC.md` P2 means by the pool's history being checkable with a block explorer and nothing else.
 */
export function shortPuzzleId(puzzle: Puzzle): string {
  return hashString(puzzleId(puzzle)).toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------------ the rating */

/**
 * The puzzle rating, and why its constants are what they are.
 *
 * K is large because a puzzle rating should find its level in a few dozen puzzles rather than a few
 * hundred. Lichess uses Glicko-2 with a deviation per puzzle; every puzzle in this set was sampled
 * with a **deviation at or below 80**, which is the condition under which a fixed-K Elo update and
 * a Glicko one stay close — so the simpler maths here is a consequence of how the set was built
 * rather than a corner cut.
 *
 * The floor exists because a rating that can fall forever stops choosing sensible puzzles.
 */
export const PUZZLE_K = 24;
export const PUZZLE_START = 1200;
export const PUZZLE_FLOOR = 400;

export function nextPuzzleRating(rating: number, puzzleRating: number, solved: boolean): number {
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
  const next = rating + PUZZLE_K * ((solved ? 1 : 0) - expected);
  return Math.max(PUZZLE_FLOOR, Math.round(next));
}
