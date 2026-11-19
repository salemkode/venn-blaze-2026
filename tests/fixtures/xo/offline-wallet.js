// Public, NEVER-FUNDED vector and synthetic prevouts only. No live RPC/broadcast.
import { createWalletSession } from 'react-native-xo/core';
import {
  binToHex,
  cashAddressToLockingBytecode,
  encodeTransaction,
  hashTransaction,
} from '@bitauth/libauth';
import headers from './checkpoint-headers.js';
export function offlineWallet({ uncertain = false, network = 'chipnet' } = {}) {
  const state = {
    unspent: [],
    transactions: new Map(),
    seen: [],
    broadcasts: 0,
    signed: null,
  };
  const client = {
    request: async (method, params) => {
      if (method === 'server.version') return ['offline', '1.4'];
      if (method === 'blockchain.block.header') return headers[network];
      if (method === 'blockchain.scripthash.listunspent') return state.unspent;
      if (method === 'blockchain.scripthash.get_history') return state.seen;
      if (method === 'blockchain.transaction.get')
        return state.transactions.get(params[0]);
      if (method === 'blockchain.transaction.broadcast') {
        state.broadcasts++;
        state.signed = params[0];
        if (uncertain) throw Error('Simulated lost submission response');
        const hash = hashTransaction(Buffer.from(params[0], 'hex'));
        state.transactions.set(hash, params[0]);
        state.seen = [{ tx_hash: hash, height: 0 }];
        state.unspent = [];
        return hash;
      }
      throw Error('Unexpected offline RPC');
    },
    close() {},
  };
  const options = {
    mnemonic:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    network,
    client,
  };
  const wallet = createWalletSession(options);
  const locking = cashAddressToLockingBytecode(wallet.address).bytecode;
  function fund(
    outputs = [{ lockingBytecode: locking, valueSatoshis: 1000000n }],
  ) {
    const bytes = encodeTransaction({
      version: 2,
      locktime: 0,
      inputs: [
        {
          outpointTransactionHash: new Uint8Array(32).fill(71),
          outpointIndex: 0,
          sequenceNumber: 0xffffffff,
          unlockingBytecode: new Uint8Array(),
        },
      ],
      outputs,
    });
    const txid = hashTransaction(bytes);
    state.transactions.set(txid, binToHex(bytes));
    state.unspent = outputs.map((output, index) => ({
      tx_hash: txid,
      tx_pos: index,
      height: 1,
      value: Number(output.valueSatoshis),
    }));
    return { txid, outputs };
  }
  return { wallet, options, client, state, fund, locking };
}
