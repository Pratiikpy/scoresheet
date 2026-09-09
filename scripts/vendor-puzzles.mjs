/**
 * Vendor the puzzle set, once, reproducibly.
 *
 * Source: the **Lichess puzzle database**, `https://database.lichess.org/#puzzles`, **CC0 1.0** — the
 * page's own licence link, verified 6 September 2026 and recorded in `NOTICES.md`. Public domain, so
 * no attribution is required; Lichess is credited anyway, prominently, on the screen that uses it.
 *
 * **Why a bundled subset rather than an API.** Puzzles are the retention loop (`SPEC.md` H1, P4) and
 * the answer to the Tuesday problem: the thing worth opening the app for on a day you do not want a
 * whole game. A loop that needs the network is a loop that fails on a train, and a loop that fails on
 * a train is not a habit. Everything here works offline, forever, with no server of ours involved.
 *
 *   node scripts/vendor-puzzles.mjs
 *
 * ## How the 290 MB becomes 5,000
 *
 * The full database is over five million puzzles in a 290 MB zstd-compressed CSV. It is streamed and
 * decompressed on the fly, and the stream is **abandoned the moment the quotas fill** — so this
 * usually reads a small fraction of the file rather than all of it. Puzzle ids are effectively
 * random, so a prefix of the file is a random sample rather than a biased one.
 *
 * ## What gets in, and why those filters
 *
 * A bad puzzle is worse than no puzzle: a player who cannot see why the "solution" is the solution
 * blames themselves, and a player who meets three of those stops opening the tab. Lichess publishes
 * exactly the columns needed to avoid that, and all three are used:
 *
 *  - **Popularity ≥ 90** — the up/down vote of everyone who played it. This is the single strongest
 *    signal, and it is why the set is not simply "the first 5,000 rows".
 *  - **NbPlays ≥ 1,000** — a puzzle nobody has played has an untested rating and an untested
 *    solution.
 *  - **RatingDeviation ≤ 80** — the rating has settled. A wide deviation means the difficulty shown
 *    to the player would be a guess.
 *
 * And **evenly across rating bands**, which matters more than any of them. Sampling the database as
 * it comes gives a set clustered around 1500, so a beginner meets nothing they can solve and a
 * strong player meets nothing worth solving. Fixed quotas per band make the ladder real at both ends.
 */

import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

const SOURCE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const OUT = 'packages/core/src/puzzles-data.ts';

/** Rating bands, and how many of each. Even quotas are what make the ladder real at both ends. */
const BANDS = [
  [400, 800],
  [800, 1000],
  [1000, 1200],
  [1200, 1400],
  [1400, 1600],
  [1600, 1800],
  [1800, 2000],
  [2000, 2200],
  [2200, 2500],
  [2500, 3000],
];
const PER_BAND = 500;

const MIN_POPULARITY = 90;
const MIN_PLAYS = 1000;
const MAX_DEVIATION = 80;

/**
 * Puzzles longer than this are dropped.
 *
 * The count is *player* moves — the opponent's replies are forced and do not count. Four is already
 * a long puzzle on a phone; beyond it the tab becomes a study session, which is the opposite of what
 * this loop is for. Lichess tags these `veryLong` and they are the most abandoned puzzles it has.
 */
const MAX_PLAYER_MOVES = 4;

/**
 * Themes worth keeping, and nothing else.
 *
 * Lichess ships around sixty, most of which are machine bookkeeping (`long`, `oneMove`, `crushing`)
 * or restate the rating. These are the ones that describe *what the player is being asked to see*,
 * which is the only thing worth a word on screen — and interning them to small integers is most of
 * why the generated file is a fifth of the size of the raw rows.
 */
const KEPT_THEMES = [
  'mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate', 'anastasiaMate', 'arabianMate',
  'hookMate', 'doubleBishopMate', 'bodenMate', 'dovetailMate',
  'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction',
  'clearance', 'interference', 'intermezzo', 'xRayAttack', 'zugzwang', 'sacrifice',
  'quietMove', 'defensiveMove', 'trappedPiece', 'hangingPiece', 'exposedKing', 'capturingDefender',
  'promotion', 'underPromotion', 'enPassant', 'castling',
  'endgame', 'rookEndgame', 'queenEndgame', 'pawnEndgame', 'bishopEndgame', 'knightEndgame',
  'opening', 'middlegame', 'advancedPawn', 'kingsideAttack', 'queensideAttack',
];
const THEME_INDEX = new Map(KEPT_THEMES.map((theme, index) => [theme, index]));

/**
 * Read the header and return a name-to-index map.
 *
 * **Columns are found by name, never by position.** The export grew an eleventh column, `DailyDate`,
 * between one release and the next; a fixed count rejected every row and a fixed index would have
 * been worse — it would have kept working while reading the wrong field. A header that does not
 * carry the names this script needs is a hard failure, which is the only safe response to a schema
 * that moved underneath us.
 */
function headerIndex(line) {
  const names = line.split(',');
  const index = {};
  for (const wanted of ['FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes']) {
    const at = names.indexOf(wanted);
    if (at === -1) throw new Error(`the puzzle export no longer has a "${wanted}" column: ${line}`);
    index[wanted] = at;
  }
  return index;
}

const chosen = BANDS.map(() => []);
let scanned = 0;
let filled = 0;

/*
 * Decompressed by the `zstd` CLI rather than by Node.
 *
 * `node:zlib`'s zstd binding read this file's frames and produced **zero bytes, and no error** — the
 * raw body streamed fine, the decompressor simply emitted nothing, with and without a raised
 * `ZSTD_d_windowLogMax`. A silent empty stream is the worst possible failure here because it looks
 * exactly like "no puzzle matched the filters". The CLI decodes the same bytes correctly, so it does
 * the work, and this script now depends on `zstd` being installed — which is stated when it is not.
 */
console.log(`streaming ${SOURCE}`);
const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`HTTP ${response.status}`);

const zstd = spawn('zstd', ['-d', '--long=31', '-c'], { stdio: ['pipe', 'pipe', 'inherit'] });
zstd.on('error', (error) => {
  console.error(
    error.code === 'ENOENT'
      ? 'zstd is not installed. Install it (winget install Facebook.Zstandard, brew install zstd, apt install zstd) and run this again.'
      : String(error),
  );
  process.exit(1);
});

// The body is piped in, and the pipe is torn down as soon as the quotas fill — which is why this
// reads a fraction of 290 MB rather than all of it.
const body = Readable.fromWeb(response.body);
body.pipe(zstd.stdin);
// The consumer stops reading first, so a broken pipe here is the expected end, not a fault.
zstd.stdin.on('error', () => {});
body.on('error', () => {});

const lines = createInterface({ input: zstd.stdout, crlfDelay: Infinity });

let index = null;

try {
  for await (const line of lines) {
    scanned += 1;
    if (index === null) {
      index = headerIndex(line);
      continue;
    }

    const row = line.split(',');
    const fen = row[index.FEN];
    const moves = row[index.Moves];
    const themes = row[index.Themes];
    if (!fen || !moves) continue;

    if (Number(row[index.Popularity]) < MIN_POPULARITY) continue;
    if (Number(row[index.NbPlays]) < MIN_PLAYS) continue;
    if (Number(row[index.RatingDeviation]) > MAX_DEVIATION) continue;

    const score = Number(row[index.Rating]);
    const band = BANDS.findIndex(([low, high]) => score >= low && score < high);
    if (band === -1 || chosen[band].length >= PER_BAND) continue;

    /*
     * The move list alternates: opponent, player, opponent, player…
     *
     * Lichess states the puzzle from the position *before* the opponent's blunder, so the first move
     * is played for you and the position you actually solve is one ply later. Keeping it that way is
     * deliberate — that move is the story of the puzzle, and animating it is how a solver sees what
     * just changed.
     */
    const uci = moves.split(' ');
    if (uci.length < 2 || uci.length % 2 !== 0) continue;
    if (uci.length / 2 > MAX_PLAYER_MOVES) continue;

    const kept = (themes ?? '')
      .split(' ')
      .map((theme) => THEME_INDEX.get(theme))
      .filter((at) => at !== undefined)
      .sort((a, b) => a - b);

    chosen[band].push({ fen, moves: uci.join(' '), rating: score, themes: kept });
    if (chosen[band].length === PER_BAND) {
      filled += 1;
      console.log(
        `  band ${BANDS[band][0]}–${BANDS[band][1]} full (${filled}/${BANDS.length}) after ${scanned.toLocaleString()} rows`,
      );
      if (filled === BANDS.length) break;
    }
  }
} finally {
  lines.close();
  body.destroy();
  zstd.kill();
}

const puzzles = chosen.flat().sort((a, b) => a.rating - b.rating || (a.fen < b.fen ? -1 : 1));
const short = BANDS.map(([low, high], index) => `${low}–${high}: ${chosen[index].length}`).join(', ');

if (puzzles.length < BANDS.length * PER_BAND) {
  // Not fatal — the top band is genuinely sparse under these filters — but it must be said, not
  // discovered later as "why are there no 2600s".
  console.log(`\nnote: not every band filled. ${short}`);
}

const file = `/**
 * ${puzzles.length.toLocaleString()} chess puzzles, bundled.
 *
 * **Generated by \`scripts/vendor-puzzles.mjs\`. Do not edit by hand.**
 *
 * Public domain (CC0) from the Lichess puzzle database. See \`NOTICES.md\`, and note that Lichess is
 * credited on the puzzle screen itself even though CC0 does not require it.
 *
 * Sampled evenly across rating bands (${short}) from puzzles with popularity ≥ ${MIN_POPULARITY},
 * at least ${MIN_PLAYS.toLocaleString()} plays and a rating deviation ≤ ${MAX_DEVIATION}, so every one has a settled
 * difficulty and a solution thousands of people have agreed with.
 *
 * One puzzle per line, tab-separated: FEN, the solution in UCI, the rating, then theme indices into
 * \`PUZZLE_THEMES\`. The first UCI move is the opponent's — Lichess states a puzzle from the position
 * before the blunder, and that move is the story of the puzzle.
 *
 * Loaded on demand, never in the main bundle — the board must not wait for puzzles it may never show.
 */

/** The themes kept from Lichess's set — the ones that describe what the solver must see. */
export const PUZZLE_THEMES = ${JSON.stringify(KEPT_THEMES)} as const;

export const PUZZLES = \`${puzzles
  .map((puzzle) => `${puzzle.fen}\t${puzzle.moves}\t${puzzle.rating}\t${puzzle.themes.join(',')}`)
  .join('\n')}\`;
`;

writeFileSync(OUT, file);
console.log(`\n${OUT}: ${puzzles.length} puzzles, ${(file.length / 1024).toFixed(0)} KB, from ${scanned.toLocaleString()} rows scanned`);
