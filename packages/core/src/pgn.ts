/**
 * PGN, so a game can leave.
 *
 * **The point is that it is not ours.** PGN is what every chess program on earth reads — Lichess,
 * Chess.com, SCID, ChessBase, a Stockfish command line — so a game exported here can be analysed
 * anywhere, forever, by tools this project will never write. An app that keeps a person's games in a
 * format only it understands has made those games hostage, and a chess player notices immediately.
 *
 * The export carries the scoresheet's own fields in the header, including the two addresses and the
 * block height, so **the tag pairs alone are enough to find and re-verify the signed record**. A PGN
 * that dropped them would be a game with its provenance cut off — readable everywhere and checkable
 * nowhere, which is the opposite of what this product is for.
 *
 * The format is the PGN export standard: seven required tags in order, then extras, a blank line,
 * then the movetext wrapped at 80 columns and ending with the result token.
 */

import { Chess } from 'chess.js';
import type { Scoresheet } from './scoresheet.ts';

/**
 * Make a string safe to put in a tag value.
 *
 * **Sanitised, not escaped, and that is a deliberate departure from the letter of the standard.**
 * PGN defines `\"` and `\\` escapes, and the first implementation here used them — correctly. It
 * then produced a file `chess.js` refuses to parse at all: its reader has no case for an escaped
 * quote and stops at the tag. Other readers vary in the same way.
 *
 * The whole reason to export PGN is that *every* chess program reads it. A technically-correct file
 * that a major parser rejects fails at the only thing the format is for, so the two characters that
 * cause it are replaced rather than escaped. Nothing this project puts in a tag can contain either —
 * addresses are base-32, ids are hex, terminations come from a fixed list — so the substitution only
 * ever touches a caller-supplied event or site name, where losing a quote costs nothing.
 *
 * Newlines and control characters are stripped for the same reason and a stronger one: a newline in
 * a tag value does not merely confuse a parser, it ends the tag.
 */
function tagValue(value: string): string {
  /*
   * Character by character, and no regular expression.
   *
   * The two characters being removed are a quote and a backslash, and both of them have to be
   * escaped to appear in a regex literal or in a pattern string — which is a place to make a
   * counting mistake, and three attempts here made three different ones, including one that
   * silently replaced every hyphen with a space. A loop over code points cannot be miscounted.
   */
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    // Control characters end a tag rather than confusing it, so they become a space.
    if (code < 0x20 || code === 0x7f) out += " ";
    // A quote or a backslash: chess.js cannot read either, even escaped exactly as PGN defines.
    else if (code === 0x22 || code === 0x5c) out += "'";
    else out += character;
  }
  return out.trim();
}

function tag(name: string, value: string): string {
  return `[${name} "${tagValue(value)}"]`;
}

/**
 * The date, as PGN writes it, from a Nimiq block height.
 *
 * **It does not guess.** PGN's `??.??.????` is the standard's own way of saying "unknown", and it is
 * the honest answer here: the scoresheet records a *block height*, not a timestamp, deliberately —
 * a height is checkable by anyone against the chain and a timestamp is something a server asserts
 * (`SPEC.md` F2). Converting one to the other would mean inventing a date from an assumed block
 * time, printing it with the authority of a fact, and being wrong by minutes or by months depending
 * on how the chain behaved.
 *
 * The height itself goes in its own tag, where it can be checked.
 */
const UNKNOWN_DATE = '????.??.??';

export interface PgnOptions {
  /** Where this game can be re-verified, if the caller knows. */
  site?: string;
  /** An event name. Defaults to something true rather than something impressive. */
  event?: string;
}

/**
 * A finished, signed game as PGN.
 *
 * `moves` is SAN in order — the same array the scoresheet's `movesHash` covers — so a PGN produced
 * here and the signature that attests to it describe the same game by construction.
 */
export function toPgn(
  sheet: Scoresheet,
  moves: readonly string[],
  options: PgnOptions = {},
): string {
  const headers = [
    // The seven tag roster, in the order the standard requires. Order is not decoration: parsers
    // that read positionally exist, and a file that reorders them is a file some tool will misread.
    tag('Event', options.event ?? 'Casual game'),
    tag('Site', options.site ?? 'scoresheet'),
    tag('Date', UNKNOWN_DATE),
    tag('Round', '-'),
    tag('White', sheet.white),
    tag('Black', sheet.black),
    tag('Result', sheet.result),

    // Everything below is what makes this game findable again, and re-checkable.
    tag('Termination', sheet.termination),
    tag('GameId', sheet.gameId),
    tag('NimiqChain', sheet.chain),
    tag('NimiqBlock', String(sheet.endedAtBlock)),
    tag('MovesHash', sheet.movesHash),
    tag('FinalFen', sheet.finalFen),
    // Whether it moved anybody's rating, said in the file rather than inferred from its length.
    tag('Rated', sheet.rated ? 'Yes' : 'No'),
  ];

  return `${headers.join('\n')}\n\n${movetext(moves, sheet.result)}\n`;
}

/**
 * The moves, numbered and wrapped at 80 columns.
 *
 * The standard requires lines under 80 characters, and it matters more than it looks: a long game on
 * one line is unreadable in every text editor and breaks a handful of older parsers outright. The
 * result token is part of the movetext, not a separate line, and a game with no moves is just the
 * token — which is a legal PGN and the right output for a game resigned before a move.
 */
function movetext(moves: readonly string[], result: string): string {
  const tokens: string[] = [];
  for (const [index, san] of moves.entries()) {
    if (index % 2 === 0) tokens.push(`${index / 2 + 1}.`);
    tokens.push(san);
  }
  tokens.push(result);

  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line.length === 0) line = token;
    else if (line.length + 1 + token.length <= 79) line += ` ${token}`;
    else {
      lines.push(line);
      line = token;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join('\n');
}


/**
 * Read a PGN back in.
 *
 * The other half of "this game is not ours". Export without import is a one-way door: it lets a game
 * leave and never lets one arrive, so a game played anywhere else — a club, an over-the-board
 * tournament, another app — cannot be brought here to look at.
 *
 * `chess.js` does the parsing, because it is the same library that validated every move in the first
 * place and a second PGN parser would be a second opinion about what a legal game is. What is added
 * here is the part it does not do: turning a thrown error into something a person can act on, and
 * refusing a file that is enormous before spending a second on it.
 */
export interface ImportedGame {
  /** The moves, in SAN, ready to be replayed. */
  moves: string[];
  /** The tag pairs, so an imported game keeps whatever provenance it arrived with. */
  tags: Record<string, string>;
  /** The final position. */
  fen: string;
}

export type ImportResult =
  | { ok: true; game: ImportedGame }
  | { ok: false; message: string };

/** Bigger than any single game, and small enough that a paste cannot lock up the tab. */
const MAX_PGN_BYTES = 512 * 1024;

export function fromPgn(text: string): ImportResult {
  if (text.trim().length === 0) {
    return { ok: false, message: 'That was empty. Paste a game in PGN and it will be loaded.' };
  }
  if (text.length > MAX_PGN_BYTES) {
    // A whole database rather than a game: refused before parsing rather than after freezing.
    return { ok: false, message: 'That file is too large to be one game. Paste a single game.' };
  }

  const chess = new Chess();
  try {
    chess.loadPgn(text);
  } catch (error) {
    /*
     * `chess.js` explains itself well, and its message is quoted rather than replaced.
     *
     * "Invalid move in PGN: Nf7" tells somebody exactly where their file is wrong, which a friendly
     * sentence of ours would throw away. The sentence around it says whose words they are.
     */
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `That does not read as a chess game: ${detail}` };
  }

  const moves = chess.history();
  if (moves.length === 0) {
    return { ok: false, message: 'That PGN has no moves in it.' };
  }

  return { ok: true, game: { moves, tags: chess.getHeaders() as Record<string, string>, fen: chess.fen() } };
}
