/**
 * The operator's side of the pool — `SPEC.md` K7.
 *
 * Three commands, run by hand, rarely:
 *
 *   node --experimental-strip-types packages/server/src/stake-cli.ts report
 *   node --experimental-strip-types packages/server/src/stake-cli.ts delegate <validator> <nim>
 *   node --experimental-strip-types packages/server/src/stake-cli.ts add <nim>
 *
 * `POOL_PRIVATE_KEY` is required for all three; `POOL_PRINCIPAL_NIM` is what was originally staked,
 * and `report` needs it to tell earnings from principal — the chain does not distinguish them.
 *
 * **It is a command rather than something the server does on its own, deliberately.** Delegating is
 * irreversible on a timescale of days, and a server that could stake by itself is a server that
 * could stake by accident. The daily payouts are automatic; moving the principal is not.
 */

import { budgetFor, createStaking, type StakingRpc } from './staking.ts';
import { LUNA_PER_NIM } from './pool.ts';

const RPC = process.env['NIMIQ_RPC'] ?? 'https://rpc.nimiqwatch.com';

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: { data?: T } | T; error?: { message?: string } };
  if (payload.error) throw new Error(`${method}: ${payload.error.message ?? 'rejected'}`);
  const result = payload.result as { data?: T } | T | undefined;
  if (result && typeof result === 'object' && 'data' in result) return (result as { data: T }).data;
  return result as T;
}

export const rpc: StakingRpc = {
  blockNumber: () => call<number>('getBlockNumber', []),
  staker: async (address) => {
    try {
      const staker = await call<{ balance?: number; delegation?: string | null }>('getStakerByAddress', [address]);
      return staker ? { balance: staker.balance ?? 0, delegation: staker.delegation ?? null } : null;
    } catch {
      // A wallet that has never staked has no staker record, and the node says so by failing.
      return null;
    }
  },
  balance: async (address) => {
    const account = await call<{ balance?: number }>('getAccountByAddress', [address]);
    return typeof account?.balance === 'number' ? account.balance : null;
  },
  send: (raw) => call<string>('sendRawTransaction', [raw]),
};

const nim = (luna: number): string => `${(luna / LUNA_PER_NIM).toLocaleString('en', { maximumFractionDigits: 5 })} NIM`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  const staking = createStaking({
    privateKeyHex: process.env['POOL_PRIVATE_KEY'],
    rpc,
    principalLuna: Math.round(Number(process.env['POOL_PRINCIPAL_NIM'] ?? 0) * LUNA_PER_NIM),
    network: process.env['NIMIQ_NETWORK'] === 'test' ? 'test' : 'main',
  });

  if (!staking) {
    console.error('POOL_PRIVATE_KEY is not set, so there is no pool to stake.');
    process.exit(1);
  }

  if (command === 'report') {
    const report = await staking.report();
    console.log(`pool      ${staking.address}`);
    console.log(`validator ${report.validator ?? '(not delegated)'}`);
    console.log(`staked    ${nim(report.stakedLuna)}`);
    console.log(`liquid    ${nim(report.liquidLuna)}`);
    console.log(`principal ${nim(report.principalLuna)}`);
    console.log(`earned    ${nim(report.earnedLuna)}`);
    console.log(`budget    ${nim(budgetFor(report))} a day`);
    // Printed so the two numbers the server needs can be copied straight into its environment.
    console.log('');
    console.log(`POOL_DAILY_NIM=${(budgetFor(report) / LUNA_PER_NIM).toFixed(5)}`);
    return;
  }

  if (command === 'delegate') {
    const [validator, amount] = rest;
    if (!validator || !amount) {
      console.error('usage: stake-cli delegate <validator-address> <nim>');
      process.exit(1);
    }
    const luna = Math.round(Number(amount) * LUNA_PER_NIM);
    console.log(`delegating ${nim(luna)} from ${staking.address} to ${validator}…`);
    console.log(await staking.delegate(validator, luna));
    return;
  }

  if (command === 'add') {
    const [amount] = rest;
    if (!amount) {
      console.error('usage: stake-cli add <nim>');
      process.exit(1);
    }
    console.log(await staking.addStake(Math.round(Number(amount) * LUNA_PER_NIM)));
    return;
  }

  console.error('usage: stake-cli report | delegate <validator> <nim> | add <nim>');
  process.exit(1);
}

// Run when invoked directly, and stay importable for tests.
if (process.argv[1]?.endsWith('stake-cli.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
