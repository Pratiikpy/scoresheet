/**
 * Does this app only ever call Nimiq provider methods that actually exist?
 *
 * ## Why this is the most useful test we can run without a phone
 *
 * A mini app talks to Nimiq Pay through providers injected into a WebView on somebody's phone. There
 * is no way to reach that host from a build machine: the deep links are `nimiqpay://` and
 * `https://nimpay.app/miniapps/open/<host>`, and the second answers **404 "Unknown mini app host"**
 * to anything that is not a registered app — it is a redirector, not a runtime. So the real
 * environment is genuinely out of reach here, and that is written down rather than glossed.
 *
 * What that absence hides is a specific and nasty bug class: **a call to a method the provider does
 * not have.** It type-checks if the type is `any`, it passes every test that uses a stand-in wallet,
 * and it fails for the first time on a judge's phone. The provider is not hypothetical — Nimiq
 * publishes its declarations in `@nimiq/mini-app-sdk` — so the whole class can be closed statically,
 * today, by refusing to call anything the vendor does not declare.
 *
 * The trap this is aimed at is real and documented: **there is no `getBalance` on the Nimiq
 * provider**, which is a still-open complaint from a builder who assumed there was. An assumption
 * like that survives every local test.
 *
 * `wallet.ts` already claimed its calls were "checked against `@nimiq/mini-app-sdk`'s own
 * `provider.d.ts`, not assumed". That was true when it was written and had quietly become
 * uncheckable: the SDK was not a dependency, so nothing could re-run the check and nothing would
 * notice a drift. A conformance claim nobody can re-run is a comment, not a guarantee. This makes it
 * a gate.
 *
 *   node scripts/provider-conformance.mjs
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';

/**
 * The version this app is written against.
 *
 * Pinned so that upgrading the SDK is a deliberate act with a re-read of what changed, rather than
 * something that happens during an unrelated install and silently widens what we are allowed to call.
 */
const EXPECTED_SDK = '0.1.0';

let problems = 0;
const fail = (message, detail = '') => {
  problems += 1;
  console.log(`  FAIL  ${message}${detail ? `  ${detail}` : ''}`);
};
const pass = (message, detail = '') => console.log(`  PASS  ${message}${detail ? `  ${detail}` : ''}`);

/* ------------------------------------------------------------------ the vendor's own declarations */

/*
 * Found on disk rather than through `require.resolve`.
 *
 * The package's `exports` map does not expose `package.json`, so resolving it throws even when the
 * package is installed and perfectly readable — which this check reported as "not installed", a
 * false failure about the one thing it exists to read. Workspaces hoist to the root; the local copy
 * is the fallback.
 */
const sdkDir = ['node_modules/@nimiq/mini-app-sdk/', 'apps/web/node_modules/@nimiq/mini-app-sdk/'].find(
  (candidate) => existsSync(`${candidate}package.json`),
);

if (!sdkDir) {
  console.log('\nprovider conformance\n');
  console.log('  FAIL  @nimiq/mini-app-sdk is not installed, so nothing could be checked.');
  console.log('        `npm install` — it is a devDependency of the web app for exactly this reason.');
  process.exit(1);
}

const sdkVersion = JSON.parse(readFileSync(`${sdkDir}package.json`, 'utf8')).version;

const declarations = readdirSync(`${sdkDir}dist`)
  .filter((name) => name.endsWith('.d.ts'))
  .map((name) => readFileSync(`${sdkDir}dist/${name}`, 'utf8'))
  .join('\n');

/**
 * Every identifier the SDK declares, as a flat set.
 *
 * Deliberately generous: a member name appearing anywhere in the declarations counts. The question
 * being asked is "could this name possibly be real", and a false *pass* here is far less costly than
 * a false failure that makes somebody delete a working call. Anything we invent — `getBalance`, say
 * — appears nowhere at all, which is the case that matters.
 */
const declared = new Set(
  [...declarations.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(?:\(|\??\s*:)/gm)].map((match) => match[1]),
);

console.log('\nprovider conformance\n');

if (sdkVersion === EXPECTED_SDK) {
  pass(`checked against @nimiq/mini-app-sdk ${sdkVersion}, the version this app was written for`);
} else {
  fail(
    `the SDK is ${sdkVersion}, but this app was written against ${EXPECTED_SDK}`,
    '— read what changed, then update EXPECTED_SDK deliberately',
  );
}

/* ------------------------------------------------------------------ what we actually call */

const sources = readdirSync('apps/web/src')
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, text: readFileSync(`apps/web/src/${name}`, 'utf8') }));

/**
 * Every provider member this app touches, and where.
 *
 * Three shapes, because the app reaches the host three ways: through the injected `window.nimiq`,
 * through `window.nimiqPay` (the host context — language and the device identifier), and through a
 * local `provider` binding taken from the former.
 */
const used = new Map();
const note = (member, file) => {
  if (!used.has(member)) used.set(member, new Set());
  used.get(member).add(file);
};

for (const { name, text } of sources) {
  for (const match of text.matchAll(/window\.nimiqPay\??\.([A-Za-z_$][\w$]*)/g)) note(match[1], name);
  for (const match of text.matchAll(/window\.nimiq\??\.([A-Za-z_$][\w$]*)/g)) note(match[1], name);
  for (const match of text.matchAll(/\bprovider\??\.([A-Za-z_$][\w$]*)\s*\(/g)) note(match[1], name);
}

if (used.size === 0) {
  fail('no provider calls were found at all, which means this check is looking in the wrong place');
} else {
  pass(`${used.size} distinct provider members are used across the app`);
}

const unknown = [...used.entries()].filter(([member]) => !declared.has(member));
for (const [member, files] of unknown) {
  fail(`\`${member}\` is not declared anywhere in the SDK`, `— used in ${[...files].join(', ')}`);
}
if (unknown.length === 0) {
  pass('and every one of them is declared by the SDK', [...used.keys()].sort().join(', '));
}

/* ------------------------------------------------------------------ the named trap */

/*
 * `getBalance` by name, separately from the general rule above.
 *
 * It is the specific method builders assume exists, and the general check would already catch it.
 * Naming it makes the failure message say *why* rather than leaving the next person to rediscover a
 * complaint that is still open on Nimiq's own community.
 */
if (used.has('getBalance')) {
  fail(
    'the Nimiq provider has no `getBalance`',
    '— read a balance from your own RPC or indexer instead',
  );
} else {
  pass('and nothing reaches for `getBalance`, which does not exist however much it ought to');
}

console.log('');
console.log(
  problems === 0
    ? 'every provider call this app makes is one the SDK declares'
    : `${problems} FAILED`,
);
console.log('');

/*
 * What this does NOT prove, stated here so nobody mistakes a green run for device testing.
 *
 * That the names exist. Not that the host accepts our arguments, not that a confirmation dialog
 * reads well, not that the WebView renders this correctly, and not that a service worker's cache
 * survives inside Nimiq Pay specifically. Those need a phone with the app on it, and `SUBMISSION.md`
 * says plainly that it has not happened.
 */
if (problems === 0) {
  console.log('This proves the method names are real. It does not prove the app works inside Nimiq');
  console.log('Pay — that needs a phone with the wallet installed, and has not happened yet.');
  console.log('');
}

process.exit(problems === 0 ? 0 : 1);
