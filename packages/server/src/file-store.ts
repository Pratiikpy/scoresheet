/**
 * The same store, on a disk.
 *
 * One JSON file per game in a directory, which is the right answer at this size and honest about
 * being so. A live chess game is a few kilobytes and lives for minutes; a database would be a
 * dependency, a migration story and an operational surface bought for nothing.
 *
 * **Atomicity is the whole job here.** `update` must be read-modify-write with no interleaving, and
 * a crash mid-write must not leave a half-written game that fails to parse — which would lose a game
 * in progress rather than merely failing a request. Two mechanisms, and both are needed:
 *
 *  1. **A per-id promise chain**, exactly as the memory store does, so concurrent updates in this
 *     process are serialised.
 *  2. **Write to a temporary file, then rename.** `rename` is atomic on every filesystem this will
 *     run on, so a reader sees either the old game or the new one and never a truncated file.
 *
 * What this does *not* survive is two processes writing the same game. That is a real limit and it
 * is stated rather than hidden: this implementation is for a single box, which is what `SPEC.md` I1
 * describes, and the object-store implementation is the one that goes behind more than one.
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expired, type GameStore, type StoredGame } from './store.ts';

export function createFileStore(directory: string): GameStore {
  const queues = new Map<string, Promise<unknown>>();
  let ready: Promise<void> | null = null;

  function prepared(): Promise<void> {
    ready ??= mkdir(directory, { recursive: true }).then(() => undefined);
    return ready;
  }

  /** Ids come from the server and are 32 hex characters; anything else never reaches the disk. */
  function pathFor(id: string): string {
    if (!/^[0-9a-f]{32}$/.test(id)) throw new Error(`refusing a game id that is not 32 hex: ${id}`);
    return join(directory, `${id}.json`);
  }

  async function read(id: string): Promise<StoredGame | null> {
    await prepared();
    try {
      return JSON.parse(await readFile(pathFor(id), 'utf8')) as StoredGame;
    } catch (error) {
      // A missing game is a normal outcome — links outlive games. Anything else is worth knowing
      // about, so it is not swallowed with it.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async function write(game: StoredGame): Promise<void> {
    await prepared();
    const target = pathFor(game.id);
    // The temporary name carries the id, so two writers of *different* games never collide on it.
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(game), 'utf8');
    await rename(temporary, target);
  }

  function serialise<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.then(work, work);
    queues.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  return {
    async create(game) {
      await write(game);
    },
    get: read,
    update(id, change) {
      return serialise(id, async () => {
        const current = await read(id);
        if (!current) return null;
        const next = change(current);
        // Declined: `null` means the change did not apply. See the contract in `store.ts`.
        if (!next) return null;
        await write(next);
        return next;
      });
    },
    async sweep(policy) {
      await prepared();
      let gone = 0;
      for (const name of await readdir(directory)) {
        if (!name.endsWith('.json')) continue;
        const id = name.slice(0, -5);
        // Read rather than stat: the file's mtime is when it was written, but the rule is about when
        // the game was last *played*, and a sweep that used mtime would also count its own rewrites.
        const game = await read(id).catch(() => null);
        // The same predicate the memory store uses, so the rule cannot differ between a box and a
        // test — which is how a signed game passes every test and is deleted in production.
        if (game && expired(game, policy)) {
          await rm(join(directory, name), { force: true });
          queues.delete(id);
          gone += 1;
        }
      }
      return gone;
    },
  };
}
