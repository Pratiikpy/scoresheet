/**
 * The opening book: what this position is called, and what is played from it.
 *
 * Two jobs, one data set (`openings-data.ts`, CC0 from `lichess-org/chess-openings`).
 *
 * **Naming.** A chess player reads the opening name constantly — it is how a game is filed in
 * memory, how it is talked about, and how it is looked up afterwards. Lichess and Chess.com both
 * show it under the board from the second move. Its absence is one of those things nobody praises
 * and everybody notices.
 *
 * **Variety.** A fixed-depth search from the start position is deterministic: the same first move,
 * every game, forever. That is the single loudest way a chess app announces itself as a toy, and it
 * shows in the first ten seconds — before anything else this product does has had a chance to
 * matter. The book fixes it at the root rather than by adding noise to the evaluation, which is what
 * a weak engine does and what makes a weak engine feel random rather than human.
 *
 * The trie is built once, lazily, on first use — parsing 2,833 lines costs a few milliseconds and
 * an app that never opens a board should never pay it.
 */

import { OPENINGS } from './openings-data.ts';

/** A named opening, as the book knows it. */
export interface Opening {
  /** The ECO code, e.g. `B90`. Shown beside the name, because players cite it. */
  eco: string;
  /** The full name, e.g. `Sicilian Defense: Najdorf Variation`. */
  name: string;
  /** How many plies of the game the name covers, so a caller can say "still in book". */
  plies: number;
}

interface Node {
  /** Set when a named line ends exactly here. */
  opening?: { eco: string; name: string };
  /** SAN → child. Insertion order is upstream order, which is not meaningful; weights are. */
  children: Map<string, Node>;
  /** How many named lines pass through this node. The book's only notion of popularity. */
  lines: number;
}

let root: Node | undefined;

function build(): Node {
  const built: Node = { children: new Map(), lines: 0 };

  for (const line of OPENINGS.split('\n')) {
    if (!line) continue;
    const [eco, name, moves] = line.split('\t');
    if (!eco || !name || !moves) continue;

    let node = built;
    node.lines += 1;
    for (const san of moves.split(' ')) {
      let child = node.children.get(san);
      if (!child) {
        child = { children: new Map(), lines: 0 };
        node.children.set(san, child);
      }
      child.lines += 1;
      node = child;
    }
    /*
     * First name wins on a collision.
     *
     * Upstream is already deduplicated by line, so this should never fire — but if it ever does,
     * losing silently to whichever row happened to be last would make the displayed name depend on
     * file order, which is exactly the kind of thing that is impossible to notice and impossible to
     * debug.
     */
    node.opening ??= { eco, name };
  }

  return built;
}

function tree(): Node {
  return (root ??= build());
}

/** Walk as far down the book as the moves go. Returns the deepest node reached, and how deep. */
function descend(moves: readonly string[]): { node: Node | undefined; depth: number } {
  let node: Node | undefined = tree();
  let depth = 0;
  for (const san of moves) {
    node = node.children.get(san);
    if (!node) return { node: undefined, depth };
    depth += 1;
  }
  return { node, depth };
}

/**
 * What this game is called, by the deepest named line it has followed.
 *
 * The *deepest* match, not the first: `1. e4 c5` is the Sicilian Defence, and `1. e4 c5 2. Nf3 d6
 * 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6` is still the Sicilian Defence but is more usefully the Najdorf.
 * A game that leaves book keeps the last name it earned — which is what a player means when they say
 * they played a Najdorf, even though the game left theory twenty moves ago.
 */
export function openingFor(moves: readonly string[]): Opening | null {
  let node: Node | undefined = tree();
  let best: Opening | null = null;

  for (const [index, san] of moves.entries()) {
    node = node.children.get(san);
    if (!node) break;
    if (node.opening) best = { ...node.opening, plies: index + 1 };
  }

  return best;
}

/** Every book continuation from here, with the number of named lines behind each. */
export function bookMoves(moves: readonly string[]): { san: string; lines: number }[] {
  const { node } = descend(moves);
  if (!node) return [];
  return [...node.children].map(([san, child]) => ({ san, lines: child.lines }));
}

/**
 * Pick a book move, weighted by how many named lines run through it.
 *
 * Weighting matters more than it looks. Uniformly random book moves would have the bot answer `1. e4`
 * with `1... Na6` as readily as `1... e5`, because both are named lines — the book contains every
 * opening anybody bothered to name, not the good ones. Weighting by line count approximates how much
 * theory exists behind a move, which correlates well enough with how often a human plays it.
 *
 * `random` is injected so the caller owns the source of randomness and tests can be deterministic.
 * A book that cannot be tested reproducibly is a book whose distribution is a guess.
 */
export function chooseBookMove(
  moves: readonly string[],
  random: () => number = Math.random,
  { maxPlies = 8 }: { maxPlies?: number } = {},
): string | null {
  /*
   * The book stops after eight plies on purpose.
   *
   * Its job is to vary the opening and give the position a name, and both are done by move four.
   * Following theory to ply twelve would have the bot play a strong line it cannot then follow up —
   * a beginner bot reaching a sharp Najdorf tabiya and immediately blundering is worse than one that
   * played four sensible moves and thought for itself. The number is the point where the book stops
   * flattering the engine.
   */
  if (moves.length >= maxPlies) return null;

  const options = bookMoves(moves);
  if (options.length === 0) return null;

  const total = options.reduce((sum, option) => sum + option.lines, 0);
  let ticket = random() * total;
  for (const option of options) {
    ticket -= option.lines;
    if (ticket < 0) return option.san;
  }
  // Only reachable through floating-point drift at the very top of the range.
  return options[options.length - 1]!.san;
}

/** How many openings the book holds. Exposed so a test can catch a truncated or empty data file. */
export function bookSize(): number {
  return tree().lines;
}
