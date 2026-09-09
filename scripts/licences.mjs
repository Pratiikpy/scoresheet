/**
 * Every dependency is in `NOTICES.md`, with the licence its own metadata reports.
 *
 * `LICENCES.md` §7 requires a line per third-party thing, and this is what keeps that true after the
 * day it was written. Licence compliance is the kind of thing that rots silently: a package is added
 * for one function, nobody updates the notices, and a year later the repository is distributing
 * something it never named.
 *
 * It already happened here. `@noble/ed25519` and `@nimiq/core` became real runtime dependencies and
 * neither reached `NOTICES.md`; the **chessnut** piece set — Apache-2.0, which asks that attribution
 * notices be retained — was not mentioned at all, while its shapes were on every screen.
 *
 *   node scripts/licences.mjs
 *
 * The licence is read from each package's own `package.json`, never from a badge, a README or
 * memory. A package that declares none at all is a hard failure: `nimiq-css` published no licence and
 * reached a sibling project's production bundle before anybody looked, which is why this exists.
 */

import { readFileSync } from 'node:fs';

const WORKSPACES = ['apps/web', 'packages/core', 'packages/verify', 'packages/server'];

/** Licences this project can ship. Anything else needs a decision, not a default. */
const ALLOWED = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'CC0-1.0', 'ISC', '0BSD']);

const notices = readFileSync('NOTICES.md', 'utf8');
let failures = 0;

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

console.log('');
console.log('licences');

/** Every third-party runtime dependency, across every workspace. Our own packages are not third party. */
const dependencies = new Map();
for (const workspace of WORKSPACES) {
  const manifest = JSON.parse(readFileSync(`${workspace}/package.json`, 'utf8'));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (name.startsWith('@scoresheet/')) continue;
    dependencies.set(name, (dependencies.get(name) ?? []).concat(workspace));
  }
}

for (const [name, users] of [...dependencies].sort()) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
  } catch {
    check(`${name} is installed`, false, 'run npm install');
    continue;
  }

  const licence = manifest.license ?? null;
  check(`${name} declares a licence`, typeof licence === 'string' && licence.length > 0, String(licence));
  check(`${name} is a licence this project can ship`, ALLOWED.has(licence), String(licence));

  // Named in the notices, with the version that is actually installed.
  check(`${name} is named in NOTICES.md`, notices.includes(name), users.join(', '));
  check(
    `${name}'s version in NOTICES.md is the installed one`,
    notices.includes(`| ${manifest.version} |`) || !notices.includes(name),
    manifest.version,
  );
}

/*
 * Assets are not packages, so nothing can enumerate them — they are listed by hand, and checked by
 * hand-written expectations. The list is short and changes rarely, and the cost of forgetting one is
 * shipping somebody's work without their name on it.
 */
for (const [what, why] of [
  ['chessnut', 'the piece set on every screen, Apache-2.0, which asks that attribution be retained'],
  ['Alexis Luengas', 'who made the pieces'],
  ['Lichess', 'the puzzles and the opening names'],
  ['CC0', 'the licence both Lichess data sets are under'],
]) {
  check(`NOTICES.md credits ${what}`, notices.includes(what), why);
}

console.log('');
console.log(failures === 0 ? 'every dependency is declared, allowed and credited' : `${failures} LICENCE PROBLEMS`);
process.exit(failures === 0 ? 0 : 1);
