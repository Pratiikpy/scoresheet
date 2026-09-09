/**
 * The shape the server sends, restated for the browser.
 *
 * A structural copy rather than an import from `@scoresheet/server`, and that is deliberate: the
 * server package imports `node:http`, `node:crypto` and `node:fs`, and pulling its types across
 * would put those module specifiers in front of the bundler. A type-only import would be erased by
 * `tsc` but this project runs `verbatimModuleSyntax`, and relying on erasure for a boundary this
 * important is the kind of thing that works until somebody adds one value import.
 *
 * The cost is that the two can drift, and the answer to that is the browser journey in
 * `scripts/look.mjs`, which plays a real two-player game against the real server. A field renamed on
 * one side and not the other fails there rather than in front of somebody.
 */

export interface GameView {
  id: string;
  white: string | null;
  black: string | null;
  moves: string[];
  fen: string;
  turn: 'w' | 'b';
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
  initialMs: number;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  termination: string | null;
  endedAtBlock: number | null;
  /** True when the side to move is out of time and the opponent may claim. */
  claimable: boolean;
  signed: { white: boolean; black: boolean };
  /** The rematch of this game, once either player has asked for one. */
  rematchId: string | null;
  /** Present once the game is over, so a stranger can verify it without a wallet. */
  signatures?: {
    white?: { publicKeyHex: string; signatureHex: string } | undefined;
    black?: { publicKeyHex: string; signatureHex: string } | undefined;
  };
  version: number;
}
