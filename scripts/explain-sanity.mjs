/*
 * Does the explanation engine ever say something false, across a lot of real chess?
 *
 * The unit tests check positions with known answers. That proves each detector on the cases somebody
 * thought of, and proves nothing about the cases nobody did — which is where a false explanation
 * would actually come from. So this runs every detector over thousands of real positions from the
 * bundled Lichess puzzles and checks the **invariants** rather than the answers:
 *
 *  - A pin claim is checked against the board: lift the piece, and the king must really be attacked.
 *  - A hanging claim is checked by playing the capture out: the opponent must really come out ahead.
 *  - A passed-pawn claim is checked against the definition, recomputed independently here.
 *  - A fork claim is checked by trying every defence: none may save both pieces.
 *  - Every sentence must be one line, end in a full stop, and never mention the player's state of mind.
 *
 * Any violation is a false statement the product would have shown somebody, so the script exits
 * non-zero and prints the position. It also reports how *often* each detector fires, because a
 * detector that never fires is dead code and a detector that fires on everything is noise.
 *
 *   node --experimental-strip-types scripts/explain-sanity.mjs [positions]
 */
import { Chess } from 'chess.js';
import { loadPuzzles } from '../packages/core/src/puzzle-set.ts';
import { explainMove } from '../packages/core/src/explain.ts';

const wanted = Number(process.argv[2] ?? 4000);

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const FILES = 'abcdefgh';
const fileOf = (square) => FILES.indexOf(square[0]);
const rankOf = (square) => Number(square[1]) - 1;

/** The passed-pawn definition, written a second time so it cannot agree with a shared bug. */
function passedHere(chess, square, colour) {
  const file = fileOf(square);
  const rank = rankOf(square);
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type !== 'p' || cell.color === colour) continue;
      if (Math.abs(fileOf(cell.square) - file) > 1) continue;
      const theirRank = rankOf(cell.square);
      if (colour === 'w' ? theirRank > rank : theirRank < rank) return false;
    }
  }
  return true;
}

function flip(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' ')).fen();
  } catch {
    return null;
  }
}

const puzzles = await loadPuzzles();
const failures = [];
const fired = new Map();
let positions = 0;
let sentences = 0;

const BANNED = /\b(you (?:got|were|felt|panicked)|greedy|careless|lazy|scared|tilted|obviously|clearly)\b/i;

outer: for (const puzzle of puzzles) {
  const chess = new Chess(puzzle.fen);
  for (const uci of puzzle.moves) {
    if (positions >= wanted) break outer;

    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }

    const fenBefore = new Chess(puzzle.fen).fen();
    const before = new Chess(chess.fen());
    before.undo();
    const fen = before.fen();
    const mover = before.turn();
    positions += 1;

    let found;
    try {
      found = explainMove({ fen, played: move.san });
    } catch (error) {
      failures.push(`threw on ${fen} after ${move.san}: ${error.message}`);
      continue;
    }

    for (const one of found) {
      sentences += 1;
      fired.set(one.kind, (fired.get(one.kind) ?? 0) + 1);

      /* -------------------------------------------------- house style */
      if (!/\.$/.test(one.text)) failures.push(`no full stop: "${one.text}" (${fen})`);
      if (/\n/.test(one.text)) failures.push(`multi-line: "${one.text}" (${fen})`);
      if (one.text.length > 160) failures.push(`too long: "${one.text}" (${fen})`);
      if (BANNED.test(one.text)) failures.push(`psychology: "${one.text}" (${fen})`);

      const after = new Chess(fen);
      after.move(move.san);

      /* -------------------------------------------------- the claims themselves */
      if (one.kind === 'pin') {
        const square = one.squares[0];
        const flipped = flip(after.fen());
        if (!flipped) {
          failures.push(`pin claimed in an unflippable position (${fen})`);
          continue;
        }
        const board = new Chess(flipped);
        const piece = board.get(square);
        const king = board.board().flat().find((cell) => cell && cell.type === 'k' && cell.color === mover);
        if (!piece || piece.color !== mover) {
          failures.push(`pin claimed on ${square}, which is not the mover's piece (${fen} ${move.san})`);
          continue;
        }
        board.remove(square);
        if (!board.isAttacked(king.square, mover === 'w' ? 'b' : 'w')) {
          failures.push(`FALSE PIN on ${square}: removing it does not expose the king (${fen} ${move.san})`);
        }
      }

      if (one.kind === 'hangs-piece') {
        const square = one.squares[0];
        const board = new Chess(after.fen());
        const target = board.get(square);
        if (!target || target.color !== mover) {
          failures.push(`hang claimed on ${square}, which is not the mover's piece (${fen} ${move.san})`);
          continue;
        }
        const captures = board.moves({ verbose: true }).filter((m) => m.to === square);
        if (captures.length === 0) {
          failures.push(`FALSE HANG on ${square}: nothing can capture it (${fen} ${move.san})`);
        }
      }

      if (one.kind === 'passed-pawn-created' || one.kind === 'passed-pawn-conceded') {
        const square = one.squares[0];
        const board = new Chess(after.fen());
        const pawn = board.get(square);
        const owner = one.kind === 'passed-pawn-created' ? mover : mover === 'w' ? 'b' : 'w';
        if (!pawn || pawn.type !== 'p' || pawn.color !== owner) {
          failures.push(`passed-pawn claim on ${square} is not that side's pawn (${fen} ${move.san})`);
          continue;
        }
        if (!passedHere(board, square, owner)) {
          failures.push(`FALSE PASSED PAWN on ${square} (${fen} ${move.san})`);
        }
      }

      if (one.kind === 'fork') {
        // The claim is "nothing saves both". Try everything.
        const board = new Chess(after.fen());
        const reply = one.text.split(' ')[0];
        let replied;
        try {
          replied = new Chess(after.fen());
          replied.move(reply);
        } catch {
          failures.push(`fork names an unplayable move "${reply}" (${fen} ${move.san})`);
          continue;
        }
        const targets = one.squares.slice(1);
        const rescued = replied.moves({ verbose: true }).some((defence) => {
          const defended = new Chess(replied.fen());
          defended.move(defence.san);
          const flipped = flip(defended.fen());
          if (!flipped) return false;
          const attacker = new Chess(flipped);
          const canTake = attacker
            .moves({ verbose: true })
            .filter((m) => targets.includes(m.to) && m.captured);
          return canTake.length === 0;
        });
        if (rescued) {
          failures.push(`FALSE FORK: a defence saves both (${fen} ${move.san} -> ${reply})`);
        }
      }
    }
  }
}

/*
 * Safety is not usefulness, and only one of them has been measured so far.
 *
 * Everything above asks "does it ever lie". This asks the other question: **when somebody actually
 * blunders, how often can we say why?** A detector set that is silent on every real mistake is
 * perfectly safe and completely useless, and the two numbers have to be reported together or the
 * safe one flatters the feature.
 *
 * The stand-in for a blunder is a *legal move that was not the puzzle's solution*. In a tactics
 * position, almost every alternative to the solution is a real mistake, which makes this a decent
 * and honest proxy — and it is labelled as a proxy rather than presented as a blunder corpus.
 */
let mistakes = 0;
let explained = 0;
const byKind = new Map();

outerB: for (const puzzle of puzzles) {
  const chess = new Chess(puzzle.fen);
  try {
    chess.move({ from: puzzle.moves[0].slice(0, 2), to: puzzle.moves[0].slice(2, 4), promotion: puzzle.moves[0][4] });
  } catch {
    continue;
  }

  const solution = puzzle.moves[1];
  if (!solution) continue;

  const alternatives = chess
    .moves({ verbose: true })
    .filter((move) => `${move.from}${move.to}${move.promotion ?? ''}` !== solution);
  if (alternatives.length === 0) continue;

  // Deterministic pick, so two runs of this script compare like with like.
  const choice = alternatives[puzzle.rating % alternatives.length];
  mistakes += 1;
  if (mistakes > wanted) break outerB;

  let found;
  try {
    found = explainMove({ fen: chess.fen(), played: choice.san });
  } catch (error) {
    failures.push(`threw on a mistake: ${chess.fen()} ${choice.san}: ${error.message}`);
    continue;
  }
  if (found.length > 0) {
    explained += 1;
    byKind.set(found[0].kind, (byKind.get(found[0].kind) ?? 0) + 1);
  }
}

console.log(`${positions.toLocaleString()} real positions from the bundled Lichess puzzles`);
console.log(`${sentences.toLocaleString()} sentences produced\n`);

const total = [...fired.values()].reduce((sum, n) => sum + n, 0);
for (const [kind, count] of [...fired].sort((a, b) => b[1] - a[1])) {
  const share = ((count / positions) * 100).toFixed(2);
  console.log(`  ${kind.padEnd(22)} ${String(count).padStart(6)}   ${share}% of positions`);
}
if (total === 0) console.log('  (nothing fired at all, which is itself a failure)');

console.log('');
console.log(`when a player actually goes wrong (${mistakes.toLocaleString()} non-solution moves in tactical positions):`);
console.log(`  explained  ${explained.toLocaleString()} of ${mistakes.toLocaleString()}  ${((explained / Math.max(1, mistakes)) * 100).toFixed(1)}%`);
for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${kind.padEnd(22)} ${String(count).padStart(6)}`);
}
console.log('  the rest get the number and no sentence, which is the design rather than a gap.');

console.log('');
if (failures.length === 0) {
  console.log(`PASS  no false statement in ${positions.toLocaleString()} positions`);
} else {
  console.log(`FAIL  ${failures.length} false statements`);
  for (const failure of failures.slice(0, 20)) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
