/**
 * NIM's units, in one place.
 *
 * Duplicated from the server rather than imported, and deliberately: `@scoresheet/server` reaches
 * for `node:http`, `node:crypto` and `node:fs`, so importing anything from it here would put Node
 * built-ins in front of the bundler. One number is a smaller cost than that, and it is a number that
 * cannot change — it is Nimiq's, not ours.
 */

/** 1 NIM = 100,000 luna. Luna is Nimiq's smallest unit, and every amount on the wire is in luna. */
export const LUNA_PER_NIM = 100_000;
