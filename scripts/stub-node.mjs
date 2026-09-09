/**
 * A stand-in Nimiq node, for the browser journey.
 *
 * The puzzle pool's whole value is that it sends **real NIM** with the puzzle's id in the memo, and
 * a test that skipped the transaction would be testing a button. This answers the three RPC methods
 * a payout makes and — the part that matters — **deserialises and verifies every transaction it is
 * handed** with `@nimiq/core`, exactly as a real node does.
 *
 * So a signing bug fails the run rather than reaching a chain. That is not hypothetical: the first
 * payout assigned a raw signature where Nimiq wants a `SignatureProof`, which serialised without
 * complaint and would have been refused by a node *after* the pool had recorded the claim — the
 * player marked as paid, and nothing sent.
 *
 * It is a test double for the *chain*, and for nothing else: the pool's own logic, its limits and
 * its ceiling are the real ones throughout.
 */

import { createServer } from 'node:http';
import { Transaction } from '@nimiq/core';

const HEIGHT = 4_200_123;
/** Enough that the balance is never the reason a claim fails while the limits are being tested. */
const BALANCE_LUNA = 10_000 * 100_000;

/** Every transaction that got this far, for the journey to read back and check. */
const accepted = [];
/** Anything that failed to deserialise or verify. A non-empty list fails the run. */
const rejected = [];

const port = Number(process.argv[2] ?? 0);

const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    let result = null;
    try {
      const { method, params } = JSON.parse(body || '{}');
      if (method === 'getBlockNumber') {
        result = { data: HEIGHT };
      } else if (method === 'getAccountByAddress') {
        result = { data: { balance: BALANCE_LUNA } };
      } else if (method === 'sendRawTransaction') {
        const raw = Uint8Array.from(Buffer.from(String(params[0]), 'hex'));
        const transaction = Transaction.deserialize(raw);
        // A real node refuses an invalid signature, and so does this one.
        transaction.verify(24);
        accepted.push({
          to: transaction.recipient.toUserFriendlyAddress().replace(/\s/g, ''),
          luna: Number(transaction.value),
          memo: new TextDecoder().decode(transaction.data),
          from: transaction.sender.toUserFriendlyAddress().replace(/\s/g, ''),
        });
        result = { data: `stub-tx-${accepted.length}` };
      } else if (method === 'dump') {
        // Not a Nimiq method: how the journey reads back what reached the chain.
        result = { data: { accepted, rejected } };
      }
    } catch (error) {
      rejected.push(String(error instanceof Error ? error.message : error));
      result = null;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  });
});

server.listen(port, '127.0.0.1', () => {
  // The port is printed because it may have been chosen by the operating system.
  console.log(`stub-node ${server.address().port}`);
});
