// The merchant allowance (template v3): a capped payment to a fixed merchant, at most once per
// interval of blocks, with an exact path selector and a timelocked sponsor refund. Judged by the
// BCH 2025 and 2026 VMs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  createVirtualMachineBch2025, createVirtualMachineBch2026, encodeLockingBytecodeP2sh32,
  hash256, hexToBin,
} from '@bitauth/libauth';
import {compileCashAssemblyString, parseTemplate} from '@xo-cash/utils';

const templatePath = new URL('./venn-merchant-allowance.xo.json', import.meta.url);
const cap = 5_000n;
const refundHeight = 350_000;
const interval = 144;
const category = new Uint8Array(32).fill(3);
const token = amount => ({category, amount});
const merchantLock = hexToBin('76a914111111111111111111111111111111111111111188ac');
const refundLock = hexToBin('76a914222222222222222222222222222222222222222288ac');

function transactionFixture(action) {
  const template = parseTemplate(JSON.parse(readFileSync(templatePath, 'utf8')));
  const compile = cashAssemblyText => hexToBin(compileCashAssemblyString({
    cashAssemblyText,
    templateScripts: template.scripts,
    templateVariables: template.variables,
    evaluationDecodeMode: 'hex',
    variables: {merchantLock, refundLock, refundHeight, paymentCap: cap, paymentInterval: interval},
  }));
  const lock = encodeLockingBytecodeP2sh32(hash256(compile('allowanceRedeem')));
  const source = {lockingBytecode: lock, valueSatoshis: 10_000n, token: token(20_000n)};
  const isPay = action === 'pay';
  const transaction = {
    version: 2,
    locktime: isPay ? 0 : refundHeight,
    inputs: [{
      outpointIndex: 0,
      outpointTransactionHash: new Uint8Array(32).fill(1),
      sequenceNumber: isPay ? interval : 0xfffffffe,
      unlockingBytecode: compile(isPay ? 'unlockPay' : 'unlockRefund'),
    }],
    outputs: isPay
      ? [
          {...source, valueSatoshis: 8_000n, token: token(15_000n)},
          {lockingBytecode: merchantLock, valueSatoshis: 1_000n, token: token(cap)},
        ]
      : [{lockingBytecode: refundLock, valueSatoshis: 9_000n, token: token(20_000n)}],
  };
  return {transaction, sourceOutputs: [source], compile};
}

const pushOf = n => Uint8Array.of(0x50 + n);

for (const [year, vm] of [[2025, createVirtualMachineBch2025()], [2026, createVirtualMachineBch2026()]]) {
  const cases = [
    ['pay', 'pays the exact cap once the interval has passed', null],
    ['pay', 'rejects a payment before the interval has passed', ({transaction: {inputs}}) => {
      inputs[0].sequenceNumber = interval - 1;
    }],
    ['pay', 'rejects a final sequence that skips the interval', ({transaction: {inputs}}) => {
      inputs[0].sequenceNumber = 0xffffffff;
    }],
    ['pay', 'rejects a time-based sequence in place of blocks', ({transaction: {inputs}}) => {
      inputs[0].sequenceNumber = (1 << 22) | interval;
    }],
    ['pay', 'rejects a rewritten path selector', ({transaction: {inputs}, compile}) => {
      inputs[0].unlockingBytecode = Uint8Array.from([...pushOf(2), ...compile('unlockPay').slice(1)]);
    }],
    ['pay', 'rejects one cent over the cap', ({transaction: {outputs}}) => {
      outputs[0].token.amount--;
      outputs[1].token.amount++;
    }],
    ['pay', 'rejects merchant substitution', ({transaction: {outputs}}) => {
      outputs[1].lockingBytecode = refundLock;
    }],
    ['pay', 'rejects an altered continuation script', ({transaction: {outputs}}) => {
      outputs[0].lockingBytecode = refundLock;
    }],
    ['pay', 'rejects a fee above the fixed amount', ({transaction: {outputs}}) => {
      outputs[0].valueSatoshis--;
    }],
    ['pay', 'rejects a second input', ({transaction: {inputs}, sourceOutputs}) => {
      inputs.push({...inputs[0], outpointIndex: 1});
      sourceOutputs.push(sourceOutputs[0]);
    }],
    ['pay', 'rejects another output', ({transaction: {outputs}}) => {
      outputs[0].valueSatoshis -= 1_000n;
      outputs.push({lockingBytecode: refundLock, valueSatoshis: 1_000n});
    }],
    ['pay', 'rejects a token burn', ({transaction: {outputs}}) => {
      outputs[0].token.amount--;
    }],
    ['refund', 'returns the balance to the sponsor after the threshold', null],
    ['refund', 'rejects a height below the threshold', ({transaction}) => {transaction.locktime--; }],
    ['refund', 'rejects payout to the merchant', ({transaction: {outputs}}) => {
      outputs[0].lockingBytecode = merchantLock;
    }],
    ['refund', 'rejects a token burn', ({transaction: {outputs}}) => {
      outputs[0].token.amount--;
    }],
  ];
  for (const [action, name, mutate] of cases) {
    test(`v3 BCH ${year} ${name}`, () => {
      const {compile, ...fixture} = transactionFixture(action);
      mutate?.({...fixture, compile});
      const result = vm.verify(fixture);
      if (mutate) assert.match(String(result), /error in evaluating input index 0/i);
      else assert.equal(result, true);
    });
  }
}

test('v3 advertises both actions on the retained output and carries the interval forward', () => {
  const template = parseTemplate(JSON.parse(readFileSync(templatePath, 'utf8')));
  const {actions, state} = template.outputs.allowance.roles.operator;
  assert.deepEqual(actions.map(({action}) => action), ['pay', 'refund']);
  assert(state.variables.includes('paymentInterval'));
  assert.equal(template.inputs.paymentInput.sequenceNumber, '$(<paymentInterval>)');
});
