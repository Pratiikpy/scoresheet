/**
 * Where puzzle claims are kept.
 *
 * Deliberately separate from the game store: a claim is a record about money, it must survive
 * everything, and it is never swept. The game store deletes games after a day; doing that to claims
 * would reset the abuse limits every night and turn the pool into a faucet with no limit at all.
 *
 * The shape mirrors `store.ts` — a memory implementation for a test and a file implementation for a
 * box — for the same reason and with the same per-key serialisation.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Claim, ClaimStore } from './pool.ts';

/** One file per day, which keeps every read small and makes an audit trivial to eyeball. */
function dayFile(directory: string, day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`not a day: ${day}`);
  return join(directory, `claims-${day}.json`);
}

export function createMemoryClaimStore(): ClaimStore {
  const claims: Claim[] = [];
  return {
    async forDay(day) {
      return claims.filter((claim) => claim.day === day);
    },
    async record(claim) {
      // Replaced rather than appended when the same wallet is recorded twice on a day: the second
      // write is the send's result arriving, not a second claim.
      const at = claims.findIndex((existing) => existing.day === claim.day && existing.address === claim.address);
      if (at === -1) claims.push(claim);
      else claims[at] = claim;
    },
  };
}

export function createFileClaimStore(directory: string): ClaimStore {
  let chain: Promise<unknown> = Promise.resolve();
  let ready: Promise<void> | null = null;

  function prepared(): Promise<void> {
    ready ??= mkdir(directory, { recursive: true }).then(() => undefined);
    return ready;
  }

  async function read(day: string): Promise<Claim[]> {
    await prepared();
    try {
      const parsed: unknown = JSON.parse(await readFile(dayFile(directory, day), 'utf8'));
      return Array.isArray(parsed) ? (parsed as Claim[]) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      /*
       * A corrupt claims file is **not** treated as an empty day.
       *
       * Everywhere else in this codebase unreadable storage falls back to a default, because the
       * cost is a lost preference. Here the cost is paying everybody again — the limits live in this
       * file, and reading it as empty removes them. Throwing means claims are refused until somebody
       * looks, which is the right way round for something that spends money.
       */
      throw error;
    }
  }

  return {
    forDay: read,
    record(claim) {
      /*
       * Every write is serialised across *all* days, not per day.
       *
       * A single chain is slower and correct: two claims on the same day must not interleave, and a
       * per-day chain would need the day to be known before the lock is taken, which it is. The
       * simpler thing is safe, and this is not a hot path — the pool pays a bounded number a day.
       */
      chain = chain.then(async () => {
        const existing = await read(claim.day);
        const at = existing.findIndex((other) => other.address === claim.address);
        if (at === -1) existing.push(claim);
        else existing[at] = claim;

        const target = dayFile(directory, claim.day);
        const temporary = `${target}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(existing, null, 2), 'utf8');
        // Renamed rather than written in place: a crash mid-write must not corrupt the file that the
        // abuse limits are read from.
        await rename(temporary, target);
      }, async () => undefined);
      return chain.then(() => undefined);
    },
  };
}
