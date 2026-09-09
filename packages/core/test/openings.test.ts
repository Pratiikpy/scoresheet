/**
 * The opening book, checked against chess itself rather than against itself.
 *
 * A book is data, and data is where a quiet corruption does the most damage: a truncated file, a
 * misparsed column, an off-by-one in the ply cap. None of those throw. They produce a book that is
 * simply smaller or subtly wrong, the bot keeps playing, the name under the board keeps appearing,
 * and nothing looks broken. So the checks here are about *content* — real openings by name, real
 * legality by `chess.js` — not about the loader running.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { OPENINGS } from '../src/openings-data.ts';
import { bookMoves, bookSize, chooseBookMove, openingFor } from '../src/openings.ts';

test('⭐ the book is whole — a truncated data file would silently shrink it', () => {
  // 2,833 lines survived the 12-ply cap when vendored. A large drop means the file was cut or the
  // parser lost a column; nothing else about the app would look different.
  assert.ok(bookSize() > 2500, `only ${bookSize()} openings`);
  assert.equal(bookSize(), OPENINGS.split('\n').filter(Boolean).length);
});

test('⭐ every line in the book is legal chess', () => {
  /*
   * This is the check that matters. A mangled SAN token — from a bad split, a stray move number, a
   * misencoded character — produces a book move the game will refuse, and the bot would appear to
   * freeze on move two for that one line only. Playing all 2,833 lines through `chess.js` costs a
   * second and makes that class of bug impossible.
   */
  const board = new Chess();
  for (const line of OPENINGS.split('\n')) {
    if (!line) continue;
    const [eco, name, moves] = line.split('\t');
    assert.ok(eco && name && moves, `a row lost a column: ${line}`);
    assert.match(eco, /^[A-E]\d{2}$/, `bad ECO in: ${line}`);

    board.reset();
    for (const san of moves.split(' ')) {
      assert.doesNotThrow(() => board.move(san), `illegal move ${san} in "${name}": ${moves}`);
    }
  }
});

test('the names are the ones players actually use', () => {
  // Spot-checked against openings anybody who plays would recognise, so a wholesale column swap or
  // an encoding fault shows up as a wrong name rather than as nothing.
  const cases: [string[], RegExp][] = [
    [['e4', 'c5'], /sicilian/i],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], /ruy lopez|spanish/i],
    [['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], /king's indian/i],
    [['e4', 'e6'], /french/i],
    [['d4', 'd5', 'c4'], /queen's gambit/i],
  ];
  for (const [moves, pattern] of cases) {
    const opening = openingFor(moves);
    assert.ok(opening, `no name for ${moves.join(' ')}`);
    assert.match(opening!.name, pattern, `${moves.join(' ')} → ${opening!.name}`);
  }
});

test('⭐ the deepest name wins, and it survives leaving the book', () => {
  const najdorf = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
  const named = openingFor(najdorf)!;
  assert.match(named.name, /najdorf/i, 'the deepest match, not the first');
  assert.equal(named.plies, 10);

  /*
   * A player who plays a Najdorf and then goes their own way still played a Najdorf.
   *
   * The continuation has to actually leave the book for this to test anything, and the first one
   * written here did not — `11. h3` is the Adams Attack, a named line, so the name deepened instead
   * of persisting and the test failed against correct code. `11. Qe2` is not in the book.
   */
  const wandered = openingFor([...najdorf, 'Qe2', 'g6', 'Bg2', 'Bg7'])!;
  assert.equal(wandered.name, named.name);
  assert.equal(wandered.plies, 10, 'the name keeps the depth it was earned at');
});

test('⭐ every legal first move is named, so the board is never nameless after move one', () => {
  /*
   * Worth pinning rather than assuming: the book names all twenty opening moves, including 1. a3 and
   * 1. Na3. That is what lets the interface show an opening name from the first move without ever
   * having an empty slot to design around — and if upstream ever thinned the obscure end, this says
   * so instead of the label quietly vanishing on `1. h3`.
   */
  const board = new Chess();
  for (const san of board.moves()) {
    const opening = openingFor([san]);
    assert.ok(opening, `1. ${san} has no name`);
    assert.equal(opening!.plies, 1);
  }
});

test('an empty game has no opening, rather than a wrong one', () => {
  assert.equal(openingFor([]), null);
  assert.equal(openingFor(['e4', 'not-a-move'])!.plies, 1, 'nonsense stops the walk, it does not throw');
});

test('⭐ book moves are legal in the position they are offered for', () => {
  const board = new Chess();
  const played = [];
  for (let ply = 0; ply < 8; ply++) {
    const options = bookMoves(played);
    if (options.length === 0) break;
    for (const { san } of options) {
      assert.ok(
        board.moves().includes(san),
        `book offers ${san} after ${played.join(' ') || 'the start'}, which is not legal there`,
      );
    }
    const chosen = options[0]!.san;
    board.move(chosen);
    played.push(chosen);
  }
  assert.ok(played.length >= 4, 'the book should reach at least four plies from the start');
});

test('⭐ weighting favours real openings over merely named ones', () => {
  /*
   * Uniform choice would answer 1. e4 with 1... Na6 as often as 1... e5, because the book contains
   * every line anybody bothered to name rather than the ones people play. Weighting by how much
   * theory sits behind a move is the whole reason the bot's openings look human.
   */
  let sequence = 0;
  const deterministic = () => (sequence = (sequence + 0.101) % 1);
  const counts = new Map();
  for (let i = 0; i < 2000; i++) {
    const move = chooseBookMove(['e4'], deterministic);
    counts.set(move, (counts.get(move) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([san]) => san);
  assert.ok(ranked.slice(0, 4).includes('c5'), `the Sicilian should be common, got ${ranked.slice(0, 4)}`);
  assert.ok((counts.get('c5') ?? 0) > (counts.get('Na6') ?? 0), 'c5 more often than Na6');
});

test('the book stops where it is told to', () => {
  const line = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'];
  assert.equal(chooseBookMove(line, () => 0.5), null, 'eight plies is the cap');
  assert.ok(chooseBookMove(line.slice(0, 7), () => 0.5), 'and seven is not');
});

test('choosing never returns a move the book does not have', () => {
  // Exercises both ends of the weighted pick, including the floating-point tail.
  for (const random of [() => 0, () => 0.999999999, () => 0.5]) {
    const chosen = chooseBookMove(['d4'], random);
    assert.ok(bookMoves(['d4']).some((option) => option.san === chosen), `${chosen} is not a book move`);
  }
});
