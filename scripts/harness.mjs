/**
 * The app, actually running: built, served, with its API and a stand-in Nimiq node behind it.
 *
 * Two suites drive the real product in a real browser — `look.mjs`, which examines every screen, and
 * `judge-mode.mjs`, which opens it cold the way it will be scored. Both need the same thing running,
 * and every guard in here was put there by a specific run that lied:
 *
 *  - **The build is not optional.** `vite preview` serves whatever is in `dist/`. Without a build the
 *    suite checks the *previous* one, which happened: a fix was made, the suite re-run, and the same
 *    failure came back from code that no longer existed. A harness that can pass against deleted
 *    source is worse than none, because it is believed.
 *  - **Health answering is not proof the server answering is ours.** A leftover process from an
 *    earlier run held the port; the new one died on `EADDRINUSE`, the health check passed against the
 *    zombie, and the suite ran to a confusing failure twenty lines later. So a bind refusal from
 *    either process is fatal here, and `/api/health` must answer *through the preview's proxy*,
 *    which proves in one check that the preview is ours and the API behind it is up.
 *
 * Extracted from `look.mjs` rather than copied into the second suite: two divergent copies of this
 * would mean one of them quietly loses a guard, and the guards are the reason it is trustworthy.
 */

import { spawn, spawnSync } from 'node:child_process';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The pool's key for a run. Published, worthless, and never used anywhere but a test. */
const POOL_KEY = '7f'.repeat(32);

/**
 * The witness's key for a run. Also published, also worthless, and different from the pool's.
 *
 * In production this key is secret and that is load-bearing — a published witness key would let any
 * solver witness their own puzzle run, which is the whole attack the witness exists to prevent
 * (`packages/server/src/witness.ts`). In a test run there is no rating anybody could gain by forging
 * one, and without a key the rated path would simply not run and the journey would prove nothing.
 */
const WITNESS_KEY = '4c'.repeat(32);

const node = process.platform === 'win32' ? 'node.exe' : 'node';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/**
 * Build, start everything, and wait until the whole stack answers.
 *
 * Resolves to `{ base, shutdown }`. Exits the process rather than resolving if anything failed to
 * come up, because every alternative — resolving with a flag, throwing for a caller to swallow —
 * has a path where a suite runs anyway and reports on nothing.
 */
/**
 * Refuse to start if anybody is already listening on the ports we are about to claim.
 *
 * The guard below this one — treating a child's `EADDRINUSE` as fatal — is necessary and turned out
 * not to be sufficient. A leftover server from an earlier run answers `/api/health` immediately,
 * while the new child's bind failure takes a moment to travel up its stderr. So readiness is reached
 * and the check passes *before* the error arrives, and a suite runs happily against a stale build.
 * That happened twice: once to `judge-mode.mjs`, which reported eight passes against another run's
 * server, and once to a video recording, which filmed a product that was no longer the source.
 *
 * Asking first removes the race entirely. If something is on the port, this is not our stack, and
 * there is no version of that worth proceeding with.
 */
async function portIsFree(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(700),
    });
    void response;
    return false;
  } catch (error) {
    // A refused connection is what we want. A timeout means something is there but slow, which is
    // still something — only an outright refusal counts as free.
    return /ECONNREFUSED|fetch failed/i.test(String(error?.cause?.code ?? error?.message ?? ''));
  }
}

export async function startApp({ port, apiPort, stubNodePort, build = true, log = console.log } = {}) {
  for (const [name, candidate] of [
    ['the preview', port],
    ['the API', apiPort],
    ['the stand-in node', stubNodePort],
  ]) {
    if (!(await portIsFree(candidate))) {
      log(`\nsomething is already listening on ${candidate} (${name}).`);
      log('That is a leftover from an earlier run, and running against it would report on a stack');
      log('this process did not build. Stop it first — nothing has been checked.');
      process.exit(1);
    }
  }

  if (build) {
    log('building…');
    const built = spawnSync(npx, ['vite', 'build'], {
      cwd: 'apps/web',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (built.status !== 0) {
      log('build failed - nothing was checked');
      process.exit(1);
    }
  }

  const base = `http://localhost:${port}`;

  /*
   * A stand-in Nimiq node, so the puzzle pool's money path is exercised for real.
   *
   * The pool's value is that it sends actual NIM with the puzzle's id in the memo. A journey that
   * stopped at the button would be testing a button — this way the transaction is built, signed and
   * *verified* by `@nimiq/core` exactly as a node would verify it, so a signing bug fails in a suite
   * rather than on a chain after a claim has been recorded. The pool's own logic — the limits, the
   * daily ceiling, the ordering — is the real one throughout. Only the chain is a double.
   */
  const stubNode = spawn(node, ['scripts/stub-node.mjs', String(stubNodePort)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  stubNode.stderr.on('data', (chunk) => log(`    [node] ${String(chunk).trim().slice(0, 200)}`));

  const api = spawn(node, ['--experimental-strip-types', 'packages/server/src/node.ts'], {
    env: {
      ...process.env,
      PORT: String(apiPort),
      // In memory, so a run leaves nothing behind on disk.
      GAMES_DIR: '',
      // No chain, and none needed: a fixed height keeps the signing path reachable without depending
      // on somebody else's Nimiq node being up while a suite runs.
      NIMIQ_BLOCK_HEIGHT: '4200123',
      NIMIQ_RPC: `http://127.0.0.1:${stubNodePort}`,
      POOL_PRIVATE_KEY: POOL_KEY,
      POOL_REWARD_NIM: '0.5',
      POOL_DAILY_NIM: '1',
      WITNESS_PRIVATE_KEY: WITNESS_KEY,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  /*
   * The API's own output is surfaced, not swallowed.
   *
   * A 500 reaches the client as "Something went wrong" — deliberately, because a stack trace in a
   * response body helps nobody and leaks paths. That is right for a player and useless for a test
   * run, which then reports a timeout on a selector twenty lines from the actual fault.
   */
  for (const stream of [api.stdout, api.stderr]) {
    stream.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) log(`    [api] ${text.split(String.fromCharCode(10)).slice(0, 6).join(' | ')}`);
    });
  }

  const preview = spawn(npx, ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: 'apps/web',
    // The proxy target, so the app and the API share an origin exactly as they do in production.
    env: { ...process.env, SERVER_ORIGIN: `http://localhost:${apiPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  /**
   * Stop everything, including the children our children started.
   *
   * `child.kill()` on Windows kills only the process it was handed. `vite preview` is started through
   * `npx.cmd`, so killing it kills the shim and leaves the actual server listening — which is where
   * every zombie in this repository's history came from. Two suites and a video recording each ran
   * against a leftover stack before this was understood, and the pre-flight check above exists only
   * because this one was incomplete.
   *
   * `taskkill /T` takes the whole tree. On anything else the ordinary signal already does.
   */
  const shutdown = () => {
    for (const child of [preview, api, stubNode]) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      if (process.platform === 'win32' && child.pid) {
        try {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          child.kill();
        }
      } else {
        child.kill();
      }
    }
  };
  process.on('exit', shutdown);
  // A Ctrl-C leaves the same debris as a clean finish, and is much more likely during development.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      shutdown();
      process.exit(1);
    });
  }

  let failed = null;
  api.on('exit', (code) => {
    if (code !== 0 && code !== null && !failed) failed = `the API exited with code ${code}`;
  });
  for (const stream of [api.stdout, api.stderr]) {
    stream.on('data', (chunk) => {
      if (/EADDRINUSE/i.test(String(chunk))) failed = `the API could not bind port ${apiPort}`;
    });
  }
  for (const stream of [preview.stdout, preview.stderr]) {
    stream.on('data', (chunk) => {
      const text = String(chunk);
      if (/already in use|EADDRINUSE/i.test(text)) failed = text.trim();
    });
  }

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (failed) break;
    try {
      const page = await fetch(base);
      const health = await fetch(`${base}/api/health`);
      if (page.ok && health.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await wait(300);
  }

  /*
   * Readiness is not enough on its own, and a real run proved it.
   *
   * Two judge-mode runs overlapped. The second one's API died on `EADDRINUSE`, but the health check
   * had already answered — from the *first* run's server, still listening on the same port — before
   * the child's error reached this process. `ready` went true, the suite ran to completion against a
   * stack it had not started, and reported eight passes.
   *
   * So a bind failure is fatal whenever it is known, whether it arrived before the health check or
   * after it. `ready` says something answered; `failed` says it was not ours, and that wins.
   */
  if (failed) {
    log(`
could not start the preview: ${failed}`);
    shutdown();
    process.exit(1);
  }

  if (!ready) {
    log(
      failed
        ? `\ncould not start the preview: ${failed}`
        : `\nthe preview or the API never came up on ${base} — nothing was checked`,
    );
    shutdown();
    process.exit(1);
  }

  return { base, shutdown };
}
