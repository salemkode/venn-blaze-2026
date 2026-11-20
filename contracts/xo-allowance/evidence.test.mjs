// The committed Chipnet evidence is v3: every executed invitation validates against the current
// template, every transaction hashes to its reviewed ID and passes the BCH 2025 and 2026 VMs when it
// spends the recorded parent output. No network access.
import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  binToHex, createVirtualMachineBch2025, createVirtualMachineBch2026, decodeTransaction,
  hashTransaction, hexToBin,
} from '@bitauth/libauth';
import {validateInvitation} from '@xo-cash/engine';
import {deserializeInvitation, generateTemplateIdentifier, parseTemplate} from '@xo-cash/utils';

const read = name => readFileSync(new URL(`./evidence/${name}`, import.meta.url), 'utf8');
const template = parseTemplate(JSON.parse(readFileSync(new URL('./venn-merchant-allowance.xo.json', import.meta.url), 'utf8')));
const steps = ['payment', 'follow-up', 'refund'];

const transactions = new Map();
for (const name of ['genesis', 'refund-genesis', ...steps]) {
  const bytes = hexToBin(read(`${name}-transaction.hex`).trim());
  const transaction = decodeTransaction(bytes);
  assert(typeof transaction !== 'string', transaction);
  transactions.set(hashTransaction(bytes), transaction);
}

test('the evidence was made with template v3', () => {
  assert.equal(template.version, '3');
  for (const file of ['terms.json', 'refund-terms.json']) {
    const terms = JSON.parse(read(file));
    assert(Number.isSafeInteger(terms.interval) && terms.interval > 0, 'The evidence terms commit an interval');
  }
});

for (const step of steps) {
  test(`${step}: the executed invitation and its transaction check out`, async () => {
    const review = JSON.parse(read(`${step}-review.json`));
    const invitation = deserializeInvitation(read(`${step}-invitation.json`));
    validateInvitation(invitation, template, 'chipnet');
    assert.equal(invitation.templateIdentifier, await generateTemplateIdentifier(template));
    assert.equal(invitation.templateIdentifier, review.templateIdentifier);
    const executed = Object.values(invitation.result?.transactions ?? {});
    assert.equal(executed.length, 1);
    assert.equal(executed[0].transactionHash, review.txid);
    assert(executed[0].broadcastedAtTimestamp !== undefined, 'The invitation records its broadcast');

    const transaction = transactions.get(review.txid);
    assert(transaction, 'The transaction bytes are committed');
    const [parentTxid, vout] = review.source.split(':');
    assert.equal(binToHex(transaction.inputs[0].outpointTransactionHash), parentTxid);
    assert.equal(transaction.inputs[0].outpointIndex, Number(vout));
    const source = transactions.get(parentTxid).outputs[Number(vout)];
    for (const vm of [createVirtualMachineBch2025(), createVirtualMachineBch2026()])
      assert.equal(vm.verify({transaction, sourceOutputs: [source]}), true);
    if (step !== 'refund') assert.equal(transaction.inputs[0].sequenceNumber, review.paymentIntervalBlocks);
  });
}
