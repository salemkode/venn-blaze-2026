import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile, mkdir, mkdtemp, open, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  binToHex, cashAddressToLockingBytecode, createVirtualMachineBch2025,
  createVirtualMachineBch2026, decodeTransaction, encodeLockingBytecodeP2sh32,
  generateBip39Mnemonic, hash256, hashTransaction, hexToBin, lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import {getTransaction} from '@electrum-cash/application';
import {Engine, validateInvitation} from '@xo-cash/engine';
import {compileCashAssemblyString, deserializeInvitation, parseTemplate, serializeInvitation} from '@xo-cash/utils';

const network = 'chipnet';
const fee = 1_000n;
const carrier = 1_000n;
const journalDirectory = fileURLToPath(new URL('../../artifacts/', import.meta.url));
// Template v3: one capped payment per interval of blocks. (v2, behind the first Chipnet evidence, is
// archived in evidence/ and no longer used.)
const template = parseTemplate(JSON.parse(await readFile(new URL('./venn-merchant-allowance.xo.json', import.meta.url), 'utf8')));

function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  assert(/^\d+$/.test(value) && Number.isSafeInteger(number) && number > 0 && number <= maximum, `Invalid ${label}`);
  return number;
}

function chipnetP2pkh(address) {
  const result = cashAddressToLockingBytecode(address);
  assert(typeof result !== 'string' && result.prefix === 'bchtest' && !result.tokenSupport
    && /^76a914[0-9a-f]{40}88ac$/.test(binToHex(result.bytecode)), 'Use a complete Chipnet P2PKH address');
  return result.bytecode;
}

function cashAddress(bytecode, tokenSupport = true) {
  const result = lockingBytecodeToCashAddress({bytecode, prefix: 'bchtest', tokenSupport});
  assert(typeof result !== 'string', result);
  return result.address;
}

function parseTerms({merchant, sponsor, cap, height, interval}) {
  assert(interval !== undefined, 'Add "interval": the blocks that must pass between payments (1-65535)');
  const variables = {
    merchantLock: chipnetP2pkh(merchant),
    refundLock: chipnetP2pkh(sponsor),
    paymentCap: BigInt(positiveInteger(cap, 'payment cap', Number.MAX_SAFE_INTEGER)),
    refundHeight: positiveInteger(height, 'refund block height', 499_999_999),
    // A block-based relative lock fits 16 bits.
    paymentInterval: positiveInteger(String(interval), 'payment interval in blocks', 0xffff),
  };
  const compile = cashAssemblyText => hexToBin(compileCashAssemblyString({
    cashAssemblyText, templateScripts: template.scripts, templateVariables: template.variables,
    evaluationDecodeMode: 'hex', variables,
  }));
  const lockingBytecode = encodeLockingBytecodeP2sh32(hash256(compile('allowanceRedeem')));
  return {variables, lockingBytecode, compile, template};
}

async function readChainTransaction(txid) {
  assert(/^[0-9a-f]{64}$/.test(txid), 'Expected a lowercase transaction ID');
  const raw = await getTransaction(txid);
  assert(typeof raw === 'string' && /^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0, 'Explorer returned invalid transaction bytes');
  const bytes = hexToBin(raw);
  assert.equal(hashTransaction(bytes), txid, 'Source transaction hash mismatch');
  const transaction = decodeTransaction(bytes);
  assert(typeof transaction !== 'string', transaction);
  return transaction;
}

async function withEngine(run) {
  const databasePath = await mkdtemp(join(tmpdir(), 'venn-xo-'));
  let engine;
  try {
    // The ephemeral account signs XO commits. The covenant itself requires no keys.
    engine = await Engine.create(generateBip39Mnemonic(randomBytes), {
      network, storageType: 'indexeddb', databasePath, electrumApplicationIdentifier: 'venn-xo-allowance',
    });
    return await run(engine);
  } finally {
    try {
      await engine?.stop();
    } finally {
      await rm(databasePath, {recursive: true, force: true});
    }
  }
}

async function createAction(engine, {action, terms, txid, vout, amount, destination, parentPath}) {
  const {variables, lockingBytecode, compile, template} = parseTerms(terms);
  const source = (await readChainTransaction(txid)).outputs[vout];
  assert(source?.token?.amount > 0n && !source.token.nft
    && binToHex(source.lockingBytecode) === binToHex(lockingBytecode), 'Source does not match the FT allowance');
  const category = binToHex(source.token.category);
  assert.equal(category, terms.category, 'Source category is not the declared test-dollar asset');
  assert(/^[0-9a-f]{64}$/.test(terms.category), 'Expected a Chipnet token category');
  const genesis = await readChainTransaction(terms.genesisTxid);
  assert(genesis.inputs.some(input => input.outpointIndex === 0 && binToHex(input.outpointTransactionHash) === category),
    'Expected the category’s Chipnet genesis');
  const issuance = genesis.outputs.filter(output => output.token && binToHex(output.token.category) === category);
  assert(issuance.length > 0 && issuance.every(output => output.token.amount > 0n && !output.token.nft),
    'This demo requires FT-only issuance with no minting NFT');
  const isPay = action === 'pay';
  const transfer = isPay ? BigInt(positiveInteger(amount, 'payment in cents')) : source.token.amount;
  const remaining = source.token.amount - transfer;
  const cashChange = source.valueSatoshis - carrier - fee;
  if (isPay) {
    assert(transfer <= variables.paymentCap, 'Payment exceeds the committed cap');
    assert(remaining > 0n, 'Leave a token balance for the successor');
    assert(cashChange >= carrier + fee, 'The allowance must retain its refund reserve');
  } else {
    assert(source.valueSatoshis - fee >= carrier, 'Not enough BCH for a refund');
  }

  const {templateIdentifier} = await engine.importTemplate(template);
  let parent;
  let intents = template.start;
  if (parentPath) {
    parent = deserializeInvitation(await readFile(parentPath, 'utf8'));
    validateInvitation(parent, template, network);
    const result = parent.result?.transactions?.payment;
    assert(parent.templateIdentifier === templateIdentifier && parent.actionIdentifier === 'pay'
      && result?.transactionHash === txid && result.broadcastedAtTimestamp !== undefined && vout === 0,
    'Follow-up must spend output zero of the executed payment invitation');
    intents = template.outputs.allowance.roles.operator.actions;
  }
  const intent = intents.find(entry => entry.action === action);
  assert(intent, 'The template does not offer this action');
  const {invitation: {invitationIdentifier}} = await engine.createInvitation({
    templateIdentifier, actionIdentifier: action, intent,
    variables: Object.entries({
      ...variables, cashBalance: source.valueSatoshis, tokenBalance: source.token.amount, category,
      ...(isPay && {paymentUnits: transfer}),
    }).map(([variableIdentifier, value]) => ({
      variableIdentifier, roleIdentifier: 'operator', value: value instanceof Uint8Array ? binToHex(value) : value,
    })),
  });
  const payout = {
    outputIdentifier: isPay ? 'merchantPayment' : 'sponsorRefund',
    transactionIndex: isPay ? 1 : 0,
    lockingBytecode: isPay ? variables.merchantLock : variables.refundLock,
    valueSatoshis: isPay ? carrier : source.valueSatoshis - fee,
    token: {category: source.token.category, amount: transfer},
  };
  const outputs = isPay ? [{
    outputIdentifier: 'allowance', transactionIndex: 0, roleIdentifier: 'operator',
    lockingBytecode, valueSatoshis: cashChange, token: {category: source.token.category, amount: remaining},
  }, payout] : [payout];
  await engine.appendInvitation(invitationIdentifier, {
    inputs: [{
      inputIdentifier: isPay ? 'paymentInput' : 'refundInput',
      transactionIndex: 0,
      outpointIndex: vout,
      outpointTransactionHash: hexToBin(txid),
      sequenceNumber: isPay ? variables.paymentInterval : 0xfffffffe,
      unlockingBytecode: compile(isPay ? 'unlockPay' : 'unlockRefund'),
    }],
    outputs,
  });

  const result = await engine.executeAction(invitationIdentifier, {broadcastTransaction: false});
  const built = result.builtTransaction;
  const transaction = decodeTransaction(hexToBin(built.serializedTransaction));
  assert(typeof transaction !== 'string', transaction);
  assert.equal(hashTransaction(hexToBin(built.serializedTransaction)), built.transactionHash);
  assert.equal(transaction.inputs.length, 1);
  assert.equal(transaction.outputs.length, outputs.length);
  assert.equal(binToHex(transaction.inputs[0].outpointTransactionHash), txid);
  assert.equal(transaction.inputs[0].outpointIndex, vout);
  for (const [index, expected] of outputs.entries()) {
    const actual = transaction.outputs[index];
    assert.equal(binToHex(actual.lockingBytecode), binToHex(expected.lockingBytecode));
    assert.equal(actual.valueSatoshis, expected.valueSatoshis);
    assert(actual.token && !actual.token.nft, 'Expected an FT output');
    assert.equal(actual.token.amount, expected.token.amount);
    assert.equal(binToHex(actual.token.category), category);
  }
  for (const vm of [createVirtualMachineBch2025(), createVirtualMachineBch2026()]) {
    assert.equal(vm.verify({transaction, sourceOutputs: [source]}), true);
  }
  const review = {
    network, action, invitationIdentifier, templateIdentifier, txid: built.transactionHash,
    source: `${txid}:${vout}`, allowanceAddress: cashAddress(lockingBytecode),
    recipient: cashAddress(payout.lockingBytecode), category, amountCents: transfer.toString(),
    feeSats: Number(fee), payoutCarrierSats: Number(payout.valueSatoshis),
    totalSatsOutOfAllowance: Number(payout.valueSatoshis + fee),
    remainingCents: remaining.toString(), remainingReserveSats: isPay ? Number(cashChange) : 0,
    refundHeight: variables.refundHeight,
    paymentIntervalBlocks: variables.paymentInterval,
    ...(parent ? {parentInvitation: parent.invitationIdentifier} : {}),
  };
  await mkdir(destination, {recursive: true});
  const serialized = serializeInvitation(result.storedInvitation.invitation);
  validateInvitation(deserializeInvitation(serialized), template, network);
  await writeFile(join(destination, 'invitation.json'), serialized);
  await writeFile(join(destination, 'transaction.hex'), built.serializedTransaction + '\n');
  await writeFile(join(destination, 'review.json'), JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review, null, 2));
  return {invitationIdentifier, built, review, template};
}

async function submit(engine, prepared, output, approvedTxid) {
  assert.equal(prepared.review.txid, approvedTxid, 'Approval must match the reviewed transaction ID');
  const journalPath = join(journalDirectory,
    `xo-allowance-${prepared.review.source.replace(':', '-')}.pending.json`);
  await mkdir(journalDirectory, {recursive: true});
  const journal = await open(journalPath, 'wx', 0o600);
  try {
    await journal.writeFile(JSON.stringify({...prepared.review, raw: prepared.built.serializedTransaction}) + '\n');
    await journal.sync();
  } finally {
    await journal.close();
  }
  const directory = await open(journalDirectory, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }

  const result = await engine.executeAction(prepared.invitationIdentifier, {broadcastTransaction: true});
  assert.equal(result.builtTransaction.transactionHash, approvedTxid);
  const serialized = serializeInvitation(result.storedInvitation.invitation);
  validateInvitation(deserializeInvitation(serialized), prepared.template, network);
  await writeFile(join(output, 'invitation.json'), serialized);
  console.log(`Submitted on Chipnet: ${approvedTxid}`);
}

async function main() {
  const args = process.argv.slice(2);
  const from = args.indexOf('--from');
  const parentPath = from < 0 ? undefined : args.splice(from, 2)[1];
  if (from >= 0) assert(parentPath, 'Pass the executed parent invitation JSON after --from');
  const [command, termsPath, txid, index, paymentSats, destination, approvedTxid] = args;
  if (command === 'inspect') {
    await withEngine(async () => {
      const tx = await readChainTransaction(termsPath);
      console.log(JSON.stringify({
        inputs: tx.inputs.map(input => ({txid: binToHex(input.outpointTransactionHash), index: input.outpointIndex})),
        outputs: tx.outputs.map(({valueSatoshis, lockingBytecode, token}, index) => ({
          index, valueSatoshis: Number(valueSatoshis), lockingBytecode: binToHex(lockingBytecode),
          token: token && {category: binToHex(token.category), amount: token.amount.toString(), hasNft: Boolean(token.nft)},
        })),
      }, null, 2));
    });
    return;
  }
  const terms = JSON.parse(await readFile(termsPath, 'utf8'));
  if (command === 'address') {
    console.log(cashAddress(parseTerms(terms).lockingBytecode));
    return;
  }
  assert(['pay', 'refund'].includes(command) && /^(0|[1-9]\d*)$/.test(index) && destination,
    'Usage: allowance.mjs address TERMS.json | inspect TXID | pay|refund TERMS.json TXID VOUT AMOUNT_OR_DASH OUTPUT_DIR [APPROVED_TXID] [--from PARENT_INVITATION]');
  const vout = Number(index);
  assert(vout <= 0xffffffff, 'Invalid output index');
  await withEngine(async engine => {
    const prepared = await createAction(engine, {action: command, terms, txid, vout, amount: paymentSats, destination, parentPath});
    if (approvedTxid) await submit(engine, prepared, destination, approvedTxid);
  });
}

// Electrum may keep network timers active after the engine closes.
try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
