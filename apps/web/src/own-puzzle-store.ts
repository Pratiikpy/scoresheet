/**
 * The queue of your own mistakes, kept on this device.
 *
 * `packages/core/src/own-puzzles.ts` decides *which* mistakes are allowed to become puzzles and
 * refuses most of them; this only keeps the survivors. The split is deliberate — the judgement is
 * pure and testable without a browser, and the storage is the boring half.
 *
 * **On this device and nowhere else.** A queue of your own blunders is an unflattering document, and
 * there is no reason for it to leave the phone: nothing here is signed, nothing is sent, and no
 * server is told which positions you got wrong. If that ever changes it has to be a decision
 * somebody takes deliberately, not a default that drifted.
 */

import { alreadyQueued, queueOrder, type OwnPuzzle } from '@scoresheet/core';

const KEY = 'scoresheet:own-puzzles';

/**
 * How many to keep.
 *
 * A queue is only useful if it drains. Two hundred is more than anybody will work through in a
 * sitting and small enough to stay inside a storage quota shared with the games themselves; past
 * that, the cheapest mistakes go first, because the point is to break the expensive habits.
 */
const KEEP = 200;

function read(): OwnPuzzle[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as OwnPuzzle[]) : [];
  } catch {
    // A corrupt store must never stop somebody reviewing a game. This is the least important thing
    // on the device.
    return [];
  }
}

function write(all: readonly OwnPuzzle[]): void {
  try {
    // Trim by keeping the dearest, not the newest: a queue that forgets your worst habit to make
    // room for a small one has the priority backwards.
    localStorage.setItem(KEY, JSON.stringify(queueOrder(all).slice(0, KEEP)));
  } catch {
    // Quota, private mode, or a browser that refuses storage. Losing a training puzzle is not worth
    // an error in front of somebody who is studying.
  }
}

/** Everything queued, dearest mistake first. */
export function ownPuzzles(): OwnPuzzle[] {
  return queueOrder(read());
}

/** How many are waiting. Used to decide whether to offer the mode at all. */
export function ownPuzzleCount(): number {
  return read().length;
}

/** Is this position already waiting? */
export function isQueued(fen: string): boolean {
  return alreadyQueued(read(), fen);
}

/**
 * Add one, unless the same position is already there.
 *
 * Returns whether it was added, so the screen can say "added" or "already in your queue" rather than
 * silently doing nothing — a button that appears to do nothing is a button people press twice.
 */
export function queuePuzzle(puzzle: OwnPuzzle): boolean {
  const all = read();
  if (alreadyQueued(all, puzzle.fen)) return false;
  all.push(puzzle);
  write(all);
  return true;
}

/** Take one out, once it has been solved. */
export function retirePuzzle(fen: string): void {
  const key = (value: string): string => value.split(' ').slice(0, 4).join(' ');
  const wanted = key(fen);
  write(read().filter((puzzle) => key(puzzle.fen) !== wanted));
}

/** Forget the lot. Wired to the same control that forgets games. */
export function forgetOwnPuzzles(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing worth saying.
  }
}
