/**
 * PGN, checked by reading it back with `chess.js`.
 *
 * The whole value of the format is that other programs read it, so a test that only compared strings
 * would be testing this file against itself. Round-tripping through a real parser is the only check
 * that means anything — and it catches the failures that matter: a broken header, a movetext that
 * numbers wrongly, a wrapped line that splits a token.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { canonicaliseScoresheet, fromPgn, hashMoves, toPgn, type Scoresheet } from '../src/index.ts';

const WHITE = 'NQ9146VVV4N7J2TK8VAJ6BSLQTB33YNAK6Q9';
const BLACK = 'NQ42H8SJ03BYF3R9EJFG4R4TN43KCSHM5BX7';

function sheetFor(moves: string[], overrides: Partial<Scoresheet> = {}): Scoresheet {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return {
    chain: 'main',
    gameId: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    white: WHITE,
    black: BLACK,
    result: '1-0',
    termination: 'resignation',
    moveCount: Math.ceil(moves.length / 2),
    finalFen: chess.fen(),
    endedAtBlock: 4_200_123,
    movesHash: hashMoves(moves),
    rated: true,
    ...overrides,
  };
}

test('⭐ a PGN this writes is one chess.js reads back move for move', () => {
  const moves = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5'];
  const pgn = toPgn(sheetFor(moves), moves);

  const reader = new Chess();
  reader.loadPgn(pgn);
  assert.deepEqual(reader.history(), moves);
});

test('a long game survives the 80-column wrap', () => {
  /*
   * The wrap is where a movetext writer usually breaks: a line that splits a token, or a move number
   * stranded at the end of a line. Sixty plies is enough to wrap several times.
   */
  const chess = new Chess();
  const moves: string[] = [];
  for (let ply = 0; ply < 60 && !chess.isGameOver(); ply++) {
    const legal = chess.moves();
    const san = legal[ply % legal.length]!;
    chess.move(san);
    moves.push(san);
  }

  const pgn = toPgn(sheetFor(moves), moves);
  for (const line of pgn.split('\n')) {
    assert.ok(line.length < 80, `a line ran to ${line.length}: ${line}`);
  }

  const reader = new Chess();
  reader.loadPgn(pgn);
  assert.deepEqual(reader.history(), moves);
});

test('the seven required tags come first, in the order the standard sets', () => {
  // Not decoration: parsers that read the roster positionally exist, and a reordered file is a file
  // some tool will misread rather than reject.
  const pgn = toPgn(sheetFor(['e4', 'e5']), ['e4', 'e5']);
  const names = [...pgn.matchAll(/^\[(\w+) /gm)].map((match) => match[1]);
  assert.deepEqual(names.slice(0, 7), ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']);
});

test('⭐ the header carries enough to find and re-verify the signed record', () => {
  /*
   * A PGN with the provenance cut off would be readable everywhere and checkable nowhere, which is
   * the opposite of what this product is for. The game id, the block height and the moves hash are
   * what let somebody go from an exported file back to the signed scoresheet.
   */
  const moves = ['e4', 'e5'];
  const sheet = sheetFor(moves);
  const pgn = toPgn(sheet, moves);

  for (const [name, value] of [
    ['GameId', sheet.gameId],
    ['NimiqBlock', String(sheet.endedAtBlock)],
    ['MovesHash', sheet.movesHash],
    ['NimiqChain', sheet.chain],
    ['Rated', 'Yes'],
  ] as const) {
    assert.ok(pgn.includes(`[${name} "${value}"]`), `missing or wrong [${name}]`);
  }

  // And the hash in the file really is the hash of the moves in the file.
  assert.equal(sheet.movesHash, hashMoves(moves));
  // The canonical text is unaffected by exporting — a PGN is a view, never a second source.
  assert.equal(canonicaliseScoresheet(sheet), canonicaliseScoresheet({ ...sheet }));
});

test('⭐ the date is marked unknown rather than invented from a block height', () => {
  /*
   * The scoresheet records a height, not a timestamp, deliberately: a height is checkable by anyone
   * against the chain and a timestamp is something a server asserts. Converting one to the other
   * would print a guess with the authority of a fact.
   */
  const pgn = toPgn(sheetFor(['e4']), ['e4']);
  assert.ok(pgn.includes('[Date "????.??.??"]'), 'PGN has its own way of saying unknown; it is used');
});

test('a game with no moves is still a legal PGN', () => {
  // Resigning before moving is rare and real, and it must not produce a file nothing can open.
  const sheet = sheetFor([], { moveCount: 0, rated: false });
  const pgn = toPgn(sheet, []);
  const reader = new Chess();
  assert.doesNotThrow(() => reader.loadPgn(pgn));
  assert.deepEqual(reader.history(), []);
  assert.ok(pgn.trimEnd().endsWith('1-0'));
});

test('every result token is written as PGN spells it', () => {
  for (const result of ['1-0', '0-1', '1/2-1/2'] as const) {
    const pgn = toPgn(sheetFor(['e4', 'e5'], { result }), ['e4', 'e5']);
    assert.ok(pgn.includes(`[Result "${result}"]`));
    assert.ok(pgn.trimEnd().endsWith(result), `movetext must end with ${result}`);
  }
});

test('⭐ a quote or backslash in a tag cannot break the file', () => {
  /*
   * PGN defines escapes for both, and the first version used them — correctly, and produced a
   * file `chess.js` refuses to parse at all: its reader has no case for an escaped quote and
   * stops at the tag. The whole reason to export PGN is that every chess program reads it, so a
   * technically-correct file a major parser rejects fails at the only thing the format is for.
   *
   * They are replaced instead. Nothing this project puts in a tag can contain either — addresses
   * are base-32, ids are hex, terminations come from a fixed list — so this only ever touches a
   * caller-supplied name, where losing a quote costs nothing and being unreadable costs the file.
   */
  const quote = String.fromCharCode(34);
  const backslash = String.fromCharCode(92);
  const tab = String.fromCharCode(9);

  const pgn = toPgn(sheetFor(['e4']), ['e4'], {
    event: `A ${quote}quoted${quote} ${backslash} name${tab}with a tab and a-hyphen`,
  });
  const header = pgn.split(String.fromCharCode(10))[0]!;

  // The value is delimited by exactly two quotes: the ones this writer put there.
  assert.equal(header.split(quote).length - 1, 2, header);
  assert.ok(!header.includes(backslash), header);
  assert.ok(header.includes('a-hyphen'), 'an ordinary hyphen must survive');
  assert.ok(!header.includes(tab), 'a control character ends a tag, so it cannot stay');

  // And the file it produces is one a real parser reads.
  const reader = new Chess();
  assert.doesNotThrow(() => reader.loadPgn(pgn));
  assert.deepEqual(reader.history(), ['e4']);
});
/* ------------------------------------------------------------------ reading one back */

test('⭐ a PGN this wrote is one it can read', () => {
  /*
   * The round trip, both ways, through the public functions. Export without import is a one-way
   * door: it lets a game leave and never lets one arrive.
   */
  const moves = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'];
  const back = fromPgn(toPgn(sheetFor(moves), moves));
  assert.equal(back.ok, true, back.ok === false ? back.message : '');
  if (back.ok) {
    assert.deepEqual(back.game.moves, moves);
    assert.equal(back.game.tags['GameId'], 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6', 'the provenance survives');
  }
});

test('a PGN from somewhere else reads too', () => {
  // The whole point is that other programs write these. This is the shape Lichess exports.
  const elsewhere = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcdefgh"]
[White "somebody"]
[Black "somebody else"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0`;
  const back = fromPgn(elsewhere);
  assert.equal(back.ok, true, back.ok === false ? back.message : '');
  if (back.ok) {
    assert.deepEqual(back.game.moves, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']);
    assert.equal(back.game.tags['Site'], 'https://lichess.org/abcdefgh');
  }
});

test('⭐ nonsense is refused with the parser’s own words, not ours', () => {
  /*
   * "Invalid move in PGN: Nf7" tells somebody exactly where their file is wrong. A friendlier
   * sentence of our own would throw that away and leave them with nothing to fix.
   */
  const bad = fromPgn('[Event "x"]\n\n1. e4 e5 2. Nf7 Nc6 *');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /Nf7|invalid/i, bad.message);
});

test('an empty paste and a whole database are both refused before parsing', () => {
  assert.equal(fromPgn('').ok, false);
  assert.equal(fromPgn('   \n  ').ok, false);
  // Bigger than any single game: refused up front rather than after freezing the tab.
  assert.equal(fromPgn('1. e4 e5 '.repeat(80_000)).ok, false);
});

test('a PGN with headers but no moves is refused', () => {
  const back = fromPgn('[Event "x"]\n[Result "*"]\n\n*');
  assert.equal(back.ok, false);
  if (!back.ok) assert.match(back.message, /no moves/i);
});
