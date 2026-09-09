/**
 * Run the unit tests, and hold the README to the number it prints.
 *
 * The README's whole argument is *"you do not have to trust us — check it"*, and a number in it that
 * nobody checks is the one kind of claim that argument cannot survive. Two of the three counts were
 * already enforced by the thing they describe: `look.mjs` fails if the README's browser-check total
 * is wrong, and `design-metrics.mjs` now does the same for the contrast pairs. This is the third.
 *
 * It is worth having for a duller reason too: the unit count changes on almost every commit, so it
 * is the number most likely to go stale, and it went stale twice before this existed.
 *
 * The tests are run **once**, here, and `npm run check` calls this instead of `npm test` — running
 * them twice to count them would double the slowest part of the gate.
 *
 *   node scripts/counts.mjs
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const run = spawnSync('npm', ['test'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  // Inherit nothing: the output is parsed rather than shown, and a failing suite is reported below
  // with its own failures, which is more useful than several thousand lines of TAP.
});

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

/*
 * Summed across workspaces, from the TAP summary each one prints.
 *
 * `# tests N` appears once per workspace, and `# fail N` beside it. Parsing the summary rather than
 * counting `ok` lines is deliberate: a subtest prints `ok` too, and counting those would inflate the
 * number by a factor nobody could explain.
 */
const totals = (name) =>
  [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))].reduce((sum, m) => sum + Number(m[1]), 0);

const tests = totals('tests');
const passed = totals('pass');
const failed = totals('fail');
/*
 * Skipped tests are counted, named, and never folded into the pass line.
 *
 * This script used to print "705 of 715 passed" and then, one line later, "all 715 unit tests pass,
 * and the README says so". Both sentences came from the same run and they could not both be true:
 * ten NNUE tests skip themselves when the network file has not been vendored, and the summary was
 * quietly promoting a skip to a pass. A number nobody can check is the one thing the README's whole
 * argument cannot survive, so the summary now says what actually ran.
 */
const skipped = totals('skipped');

let problems = 0;

console.log('unit tests');
if (run.status !== 0 || failed > 0) {
  problems += 1;
  console.log(`  FAIL  ${failed} of ${tests} failed`);
  // The failing names, so this is a report rather than a verdict.
  for (const line of output.split('\n').filter((line) => line.startsWith('not ok'))) {
    console.log(`        ${line.trim()}`);
  }
} else {
  console.log(`  PASS  ${passed} of ${tests} passed`);
}

if (skipped > 0) {
  // Not a failure — a skip here is deliberate and conditional — but never invisible either.
  console.log(`  NOTE  ${skipped} skipped, so they did not run:`);
  for (const line of output.split('\n').filter((line) => /# SKIP\s*$/.test(line))) {
    console.log(`        ${line.replace(/^ok \d+ - /, '').replace(/# SKIP\s*$/, '').trim()}`);
  }
}

console.log('\nour own documentation');
const readme = readFileSync('README.md', 'utf8');
// Matched on the words rather than on the command name, so renaming the script cannot switch this
// check off quietly — which is precisely what happened the first time it ran.
const claimed = Number(/(\d+) unit tests/.exec(readme)?.[1] ?? 0);
if (claimed === tests) {
  console.log(`  PASS  the README says ${tests} unit tests, and there are ${tests}`);
} else {
  problems += 1;
  console.log(`  FAIL  the README says ${claimed} unit tests, this run has ${tests}`);
}

/*
 * The link-preview card, checked against what `index.html` promises about it rather than trusted.
 *
 * `og:image:width`/`:height` claim 1200×630 and `SUBMISSION.md` describes the file by name and
 * content. Nothing had ever confirmed the file on disk matches either — a stale, resized, or
 * accidentally-deleted `share.png` would have shipped a broken or blank link preview to every judge
 * who pasted the URL, and the first sign of it would have been on their screen, not ours.
 */
console.log('\nthe link-preview card');
const SHARE_IMAGE = 'apps/web/public/share.png';
try {
  const bytes = statSync(SHARE_IMAGE).size;
  // A PNG's width and height sit at fixed offsets in its IHDR chunk — no library needed to read them.
  const header = readFileSync(SHARE_IMAGE);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width === 1200 && height === 630) {
    console.log(`  PASS  ${SHARE_IMAGE} is 1200×630, matching what index.html's og:image tags claim`, `(${bytes} bytes)`);
  } else {
    problems += 1;
    console.log(`  FAIL  ${SHARE_IMAGE} is ${width}×${height}, but index.html claims 1200×630`);
  }
  if (bytes < 5_000) {
    problems += 1;
    console.log(`  FAIL  ${SHARE_IMAGE} is only ${bytes} bytes, which is not a real rendered card`);
  }
} catch {
  problems += 1;
  console.log(`  FAIL  ${SHARE_IMAGE} is missing — every shared link would show a broken image`);
}

/*
 * Every API call has to go through `apiBase()`, or a split deployment breaks in one place only.
 *
 * The app is built to run with its API on another origin — `VITE_API` exists for exactly that, and
 * Azure hosts the static build and the server as two services. A `fetch('/api/...')` written without
 * `apiBase()` still works perfectly in dev, where Vite proxies `/api` to the server, and still works
 * in `npm run look`, which uses that same proxy. It fails only in production, and only for the one
 * feature that has it — which is how four tournament calls came within a deploy of being the single
 * broken screen in an otherwise working app.
 */
console.log('\nthe API base');
const bare = [];
for (const name of readdirSync('apps/web/src').filter((file) => file.endsWith('.ts'))) {
  const text = readFileSync(`apps/web/src/${name}`, 'utf8');
  for (const match of text.matchAll(/fetch\(\s*[`'"]\/api\//g)) {
    void match;
    bare.push(name);
  }
}
if (bare.length === 0) {
  console.log('  PASS  every API call goes through apiBase(), so a split-origin deploy works');
} else {
  problems += 1;
  console.log(`  FAIL  ${bare.length} fetch call(s) hardcode /api and would break in production:`);
  for (const name of [...new Set(bare)]) console.log(`        apps/web/src/${name}`);
}

const ran =
  skipped === 0
    ? `all ${tests} unit tests pass, and the README says so`
    : `${passed} of ${tests} unit tests pass; ${skipped} were skipped and did not run`;
console.log(`\n${problems === 0 ? ran : `${problems} FAILED`}\n`);
process.exit(problems === 0 ? 0 : 1);
