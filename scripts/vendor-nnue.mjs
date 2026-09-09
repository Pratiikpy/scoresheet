/**
 * Vendor the evaluation network, once, reproducibly.
 *
 * Source: **`jw1912/akimbo` at tag `v1.0.0`**, MIT, `resources/net.bin`.
 *
 * ## Why this net and not another
 *
 * Game Review is only as good as the engine judging it, and ours is club strength — enough to find
 * the blunders in an ordinary game and not enough to be trusted about anything subtle. The obvious
 * fix is Stockfish, and it is not available to us: Stockfish is **GPL-3** and this repository is MIT,
 * so shipping it would put GPL code in an MIT bundle. That is a licence conflict, not a difficulty.
 *
 * Three engines were checked for a permissive licence *and* a net small enough for a Mini App:
 *
 * | Engine | Licence | Net |
 * |---|---|---|
 * | Stockfish | GPL-3 | — (licence rules it out) |
 * | Caissa | MIT | ~50 MB |
 * | Arasan | MIT | 25 MB |
 * | **akimbo** | **MIT** | **6.3 MB** |
 *
 * ## Why the v1.0.0 tag specifically, and not `main`
 *
 * This matters and it is easy to get wrong. akimbo's README says that after 1.0.0 the nets are
 * trained on **data produced by Leela Chess Zero**, and that "no official release will be made with
 * this". The README *at the v1.0.0 tag* says instead that "all data used is self-generated", and the
 * version table calls 1.0.0 the "Final Original Data Release".
 *
 * So `main`'s net carries provenance we have not established the right to redistribute, and
 * v1.0.0's does not. The repository's MIT licence is repository-wide and the net has no separate
 * licence of its own, so the v1.0.0 file is covered by it. That is why this script pins a tag rather
 * than tracking a branch, and why updating it is a licence decision rather than a version bump.
 *
 * ## What is committed, and what is not
 *
 * **The net is not committed.** It is 6.3 MB of binary that no reviewer can diff, and a repository
 * arguing that you should check things rather than believe them has no business carrying one. This
 * script fetches it, checks its SHA-256 against the constant below, and writes it into
 * `apps/web/public/`, which is `.gitignore`d.
 *
 * That makes the download a build step rather than a clone cost, and it makes the hash the thing
 * under review: anybody can re-run this and confirm they got the same bytes we did.
 *
 *   node scripts/vendor-nnue.mjs
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';

const TAG = 'v1.0.0';
const SOURCE = `https://raw.githubusercontent.com/jw1912/akimbo/${TAG}/resources/net.bin`;
const OUT = 'apps/web/public/nnue-akimbo-1.0.0.bin';

/**
 * The exact bytes we reviewed, so a different file cannot be substituted quietly.
 *
 * A network is not readable, which makes a hash the only review anybody can actually perform on it.
 * If this ever fails, the right response is to look at what changed upstream — never to update the
 * constant so the script passes.
 */
const SHA256 = '427ec8722bbadc8799c0b1d6a9bce725d4fe17df0a706bff17bab067466e4139';

/**
 * The size the architecture predicts, which is a check in its own right.
 *
 * 3072 feature-weight vectors (768 inputs × 4 king buckets) of 1024 `i16`, one bias vector, two
 * output-weight vectors and an `i16` bias — then rounded up to a multiple of 64, because akimbo's
 * accumulator is `#[repr(C, align(64))]` and the struct inherits that alignment.
 *
 * It came out 62 bytes short before the padding was accounted for, which is exactly how a
 * misunderstanding of a binary format announces itself. A size that matches to the byte is strong
 * evidence the reader in `packages/core/src/nnue.ts` is reading the same layout the writer wrote.
 */
const HIDDEN = 1024;
const BUCKETS = 4;
const BODY = (768 * BUCKETS * HIDDEN + HIDDEN + 2 * HIDDEN) * 2 + 2;
const EXPECTED_BYTES = Math.ceil(BODY / 64) * 64;

const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`could not fetch the network: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const bytes = new Uint8Array(await response.arrayBuffer());

if (bytes.length !== EXPECTED_BYTES) {
  console.error(`network is ${bytes.length} bytes, and the architecture predicts ${EXPECTED_BYTES}`);
  process.exit(1);
}

const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== SHA256) {
  console.error(`network hash is ${digest}, and this script expects ${SHA256}`);
  console.error('Do not update the constant to make this pass — find out what changed upstream.');
  process.exit(1);
}

mkdirSync('apps/web/public', { recursive: true });
writeFileSync(OUT, bytes);
console.log(`${OUT} — ${bytes.length} bytes, sha256 ${digest.slice(0, 16)}…`);

if (!existsSync(OUT) || statSync(OUT).size !== bytes.length) {
  console.error('the file did not land');
  process.exit(1);
}
