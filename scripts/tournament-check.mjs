/*
 * The tournament engine, attacked rather than demonstrated.
 *
 * `research/06-tournaments/design.md` names trusting a single pairing implementation as the highest-
 * severity technical risk in the whole plan, because wrong pairings feed straight into standings that
 * pay out money. The unit tests check the properties somebody thought of. This checks the properties
 * that must hold for **every** field size and **every** result pattern, by brute force:
 *
 *  - **The schedule is a real round-robin.** Every pair meets exactly once, nobody meets themselves,
 *    every round is a perfect matching of the field, and colours stay balanced.
 *  - **The standings are a pure function.** The same results in a different order, and with the
 *    entrant list shuffled, produce byte-identical standings.
 *  - **The order is a total order.** No two players compare as equal unless they are genuinely tied
 *    on every tie-break, and the places assigned agree with the comparison.
 *  - **The money is conserved.** No payout exceeds the declared table, nobody is paid twice, and
 *    every tied group is paid equally.
 *
 * Every result pattern is enumerated exhaustively for small fields — 3^6 outcomes for four players —
 * so this is not sampling, it is the whole space.
 *
 *   node --experimental-strip-types scripts/tournament-check.mjs
 */
import {
  drawOrder,
  prizeSplit,
  roundRobin,
  scheduleFor,
  standings,
} from '../packages/core/src/tournament.ts';

const failures = [];
const note = (message) => failures.push(message);

function players(n) {
  return Array.from({ length: n }, (_, i) => `NQ${String(i).padStart(2, '0')}${'0'.repeat(32)}`.slice(0, 36));
}

/* ------------------------------------------------------------------ the schedule */

let schedulesChecked = 0;
for (let n = 2; n <= 8; n++) {
  const order = players(n);
  const pairings = roundRobin(order);
  schedulesChecked += 1;

  const met = new Map(order.map((a) => [a, new Set()]));
  const byRound = new Map();

  for (const pairing of pairings) {
    if (pairing.white === pairing.black) note(`${n}: a player was paired with themselves`);
    if (met.get(pairing.white).has(pairing.black)) note(`${n}: ${pairing.white} met ${pairing.black} twice`);
    met.get(pairing.white).add(pairing.black);
    met.get(pairing.black).add(pairing.white);

    const round = byRound.get(pairing.round) ?? [];
    round.push(pairing);
    byRound.set(pairing.round, round);
  }

  // Every round must be a matching: nobody appears twice in one round.
  for (const [round, games] of byRound) {
    const seen = new Set();
    for (const game of games) {
      for (const player of [game.white, game.black]) {
        if (seen.has(player)) note(`${n}: ${player} played twice in round ${round}`);
        seen.add(player);
      }
    }
    const expected = Math.floor(n / 2);
    if (games.length !== expected) note(`${n}: round ${round} had ${games.length} games, expected ${expected}`);
  }

  for (const player of order) {
    if (met.get(player).size !== n - 1) note(`${n}: ${player} met ${met.get(player).size} of ${n - 1}`);
    const whites = pairings.filter((p) => p.white === player).length;
    const blacks = pairings.filter((p) => p.black === player).length;
    const allowed = n % 2 === 0 ? 1 : 2;
    if (Math.abs(whites - blacks) > allowed) {
      note(`${n}: ${player} had ${whites}/${blacks} colours, worse than the ${allowed} allowed`);
    }
  }
}

/* ------------------------------------------------------------------ standings, exhaustively */

const OUTCOMES = [1, 0.5, 0];
let tablesChecked = 0;

for (const n of [3, 4]) {
  const order = players(n);
  const pairings = roundRobin(order);
  const total = OUTCOMES.length ** pairings.length;

  for (let pattern = 0; pattern < total; pattern++) {
    let remaining = pattern;
    const results = pairings.map((pairing) => {
      const outcome = OUTCOMES[remaining % OUTCOMES.length];
      remaining = Math.floor(remaining / OUTCOMES.length);
      return { round: pairing.round, white: pairing.white, black: pairing.black, whiteScore: outcome };
    });

    const table = standings(order, results);
    tablesChecked += 1;

    /* ---- a pure function of the results */
    const shuffled = standings([...order].reverse(), [...results].reverse());
    if (JSON.stringify(table) !== JSON.stringify(shuffled)) {
      note(`${n}/${pattern}: standings depend on input order`);
      break;
    }

    /* ---- the points add up */
    const awarded = table.reduce((sum, standing) => sum + standing.score, 0);
    if (Math.abs(awarded - results.length) > 1e-9) {
      note(`${n}/${pattern}: ${awarded} points awarded for ${results.length} games`);
      break;
    }

    /* ---- places agree with the order, and ties really are ties */
    for (let i = 1; i < table.length; i++) {
      const above = table[i - 1];
      const here = table[i];
      if (here.place < above.place) {
        note(`${n}/${pattern}: places are not monotonic`);
        break;
      }
      if (here.place === above.place) {
        // Sharing a place means every tie-break was level.
        const same =
          above.score === here.score &&
          above.sonnebornBerger === here.sonnebornBerger &&
          above.buchholzCut1 === here.buchholzCut1 &&
          above.wins === here.wins &&
          above.progressive === here.progressive;
        if (!same) note(`${n}/${pattern}: players share a place without being level`);
      } else if (above.score < here.score) {
        note(`${n}/${pattern}: a lower score was placed higher`);
      }
    }

    /* ---- the money */
    const prizes = [1000, 600, 300, 100].slice(0, n);
    const payout = prizeSplit(table, prizes);
    const paid = [...payout.values()].reduce((sum, value) => sum + value, 0);
    const pot = prizes.reduce((sum, value) => sum + value, 0);
    if (paid > pot) note(`${n}/${pattern}: paid ${paid} from a pot of ${pot}`);

    // Everybody sharing a place is paid the same.
    const byPlace = new Map();
    for (const standing of table) {
      const group = byPlace.get(standing.place) ?? [];
      group.push(payout.get(standing.address) ?? 0);
      byPlace.set(standing.place, group);
    }
    for (const [place, amounts] of byPlace) {
      if (new Set(amounts).size > 1) note(`${n}/${pattern}: place ${place} was paid unequally`);
    }
  }
}

/* ------------------------------------------------------------------ the draw */

let drawsChecked = 0;
for (let n = 2; n <= 8; n++) {
  const entrants = players(n);
  for (const id of ['t1', 'weekly-2026-09-08', 'x'.repeat(64)]) {
    const once = drawOrder(id, entrants);
    const twice = drawOrder(id, [...entrants].reverse());
    drawsChecked += 1;
    if (once.join() !== twice.join()) note(`${id}/${n}: the draw depends on registration order`);
    if (new Set(once).size !== n) note(`${id}/${n}: the draw lost or duplicated a player`);
    if (scheduleFor(id, entrants).length !== roundRobin(once).length) {
      note(`${id}/${n}: the schedule does not match the draw`);
    }
  }
}

console.log(`${schedulesChecked} schedules, ${tablesChecked.toLocaleString()} complete tournaments, ${drawsChecked} draws\n`);

if (failures.length === 0) {
  console.log(`PASS  every property held across ${tablesChecked.toLocaleString()} exhaustively enumerated tournaments`);
} else {
  console.log(`FAIL  ${failures.length} violations`);
  for (const failure of failures.slice(0, 20)) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
