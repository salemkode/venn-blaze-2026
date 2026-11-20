// Chain reads and writes for Venns and Circles, through the servers in core/electrum (Chipnet or Mainnet).
import { type Bytes, binToHex, equal, hexToBin } from '../core/bytes';
import type { Network } from '../core/cashaddr';
import { ElectrumClient, SERVERS, scriptHash as scriptHashOf } from '../core/electrum';
import { decodeTransaction, encodeTransaction, txidOf, type Transaction } from '../core/tx';
import { p2pkhForPublicKey } from '../core/draft';
import { MARKER } from './build';
import { type CircleParams, circleLocking, circleMoneyLocking, readCircleGenesis } from './circle';
import { circleCoins, circleOfficial } from './circleBuild';
import { vennCoins } from './coins';
import { type VennParams, moneyLocking, vennLocking } from './contract';
import { officialCheck } from './verify';

const clients: Partial<Record<Network, ElectrumClient>> = {};
/** One shared client per network. Every caller names the network: nothing defaults to one. */
export const chain = (network: Network) => (clients[network] ??= new ElectrumClient(network));

/** The time a new Venn transaction may claim: just before the chain's median time. */
export const chainNow = async (network: Network) =>
  BigInt((await chain(network).medianTimePast(await chain(network).tipHeight())) - 1);

export const keyCoins = (publicKey: Bytes, network: Network) => chain(network).utxos(p2pkhForPublicKey(publicKey));

export async function readVenn(params: VennParams) {
  const net = chain(params.network);
  const [cards, money] = await Promise.all([net.utxos(vennLocking(params)), net.utxos(moneyLocking(params))]);
  const utxos = [...cards, ...money];
  const genesis = decodeTransaction(hexToBin(await net.transactionHex(await genesisTxid(params))));
  const official = officialCheck({ params, genesis, utxos });
  return { official, coins: vennCoins(params, utxos), genesis };
}

const genesisCache = new Map<string, string>();
async function genesisTxid(params: VennParams) {
  const cacheKey = `${params.network}:${params.vaultCategory}`;
  const hit = genesisCache.get(cacheKey);
  if (hit) return hit;
  const net = chain(params.network);
  // The rules NFT's first transaction is the genesis: find it in the Venn address history.
  const history: { tx_hash: string }[] = await net.request('blockchain.scripthash.get_history', [
    scriptHashOf(vennLocking(params)),
  ]);
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await net.transactionHex(h.tx_hash)));
    if (tx.inputs[0]?.txid === params.vaultCategory && tx.inputs[0].vout === 0) {
      genesisCache.set(cacheKey, h.tx_hash);
      return h.tx_hash;
    }
  }
  throw new Error('The transaction that created this Venn was not found.');
}

/** Reads a Circle: its state and money, and whether its creation makes it official. */
export async function readCircle(params: CircleParams) {
  const net = chain(params.network);
  const [state, money] = await Promise.all([net.utxos(circleLocking(params)), net.utxos(circleMoneyLocking(params))]);
  const genesis = decodeTransaction(hexToBin(await net.transactionHex(await circleGenesisTxid(params))));
  const coins = circleCoins(params, [...state, ...money]);
  return { official: circleOfficial(params, genesis, coins), coins, genesis };
}

async function circleGenesisTxid(params: CircleParams) {
  const cacheKey = `${params.network}:${params.circleCategory}`;
  const hit = genesisCache.get(cacheKey);
  if (hit) return hit;
  const net = chain(params.network);
  const history: { tx_hash: string }[] = await net.request('blockchain.scripthash.get_history', [
    scriptHashOf(circleLocking(params)),
  ]);
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await net.transactionHex(h.tx_hash)));
    if (tx.inputs[0]?.txid === params.circleCategory && tx.inputs[0].vout === 0) {
      genesisCache.set(cacheKey, h.tx_hash);
      return h.tx_hash;
    }
  }
  throw new Error('The transaction that created this Circle was not found.');
}

/**
 * Venns and Circles this key was given a seat in: creation transactions that paid it and
 * carry a marker.
 */
export async function findVenns(publicKey: Bytes, network: Network) {
  const locking = p2pkhForPublicKey(publicKey);
  const net = chain(network);
  const history: { tx_hash: string }[] = await net.request('blockchain.scripthash.get_history', [
    scriptHashOf(locking),
  ]);
  const found: { params: VennParams; plan?: string; txid: string; genesis: Transaction }[] = [];
  const circles: { params: CircleParams; plan?: string; txid: string }[] = [];
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await net.transactionHex(h.tx_hash)));
    const circle = readCircleGenesis(tx, network);
    if (circle && equal(tx.outputs[0].lockingBytecode, circleLocking(circle.params))) {
      circles.push({ ...circle, txid: h.tx_hash });
      continue;
    }
    const marker = readMarker(tx);
    if (!marker) continue;
    const params = {
      network, vaultCategory: marker.category,
      ...(marker.assetCategory ? { assetCategory: marker.assetCategory } : {}),
    };
    const locking = vennLocking(params);
    if (tx.outputs.some(o => o.token?.category === marker.category && o.token.nft?.capability === 'minting'
      && equal(o.lockingBytecode, locking))) {
      found.push({ params, plan: marker.plan, txid: h.tx_hash, genesis: tx });
    }
  }
  return { venns: found, circles };
}

/** OP_RETURN <'VEN2'> <vault category> [<plan or empty> [<asset category>]]. */
export function readMarker(tx: Transaction) {
  if (tx.inputs[0]?.vout !== 0) return null;
  for (const output of tx.outputs) {
    const bytes = output.lockingBytecode;
    if (bytes[0] !== 0x6a || bytes[1] !== 4 || new TextDecoder().decode(bytes.slice(2, 6)) !== MARKER
      || bytes[6] !== 32) continue;
    const category = binToHex(bytes.slice(7, 39));
    if (category !== tx.inputs[0].txid) continue;
    if (bytes.length === 39) return { category, plan: undefined };
    const plan = bytes[39] === 32 && bytes.length >= 72 ? binToHex(bytes.slice(40, 72)) : undefined;
    if (plan && bytes.length === 72) return { category, plan };
    const assetOffset = plan ? 72 : bytes[39] === 0 ? 40 : -1;
    if (assetOffset >= 0 && bytes[assetOffset] === 32 && bytes.length === assetOffset + 33) {
      return { category, plan, assetCategory: binToHex(bytes.slice(assetOffset + 1)) };
    }
  }
  return null;
}

/**
 * Broadcasts once; an unclear answer is reported, never retried. After the primary server
 * accepts it, the same bytes also go to every other server of that network: on 19 November one
 * Chipnet server kept a long unconfirmed chain to itself, and nothing confirmed until another node
 * saw it. Sending identical bytes again is safe (same txid, no new spend) and its outcome is ignored.
 */
export async function broadcast(tx: Transaction, network: Network) {
  const raw = binToHex(encodeTransaction(tx));
  const txid = txidOf(tx);
  const primary = chain(network);
  const result = await primary.broadcast(raw, txid);
  // Every other server, whichever one the client actually used (it may have failed over).
  for (const url of SERVERS[network] ?? []) if (url !== primary.server) relay(network, url, raw, txid);
  return result;
}

const relay = (network: Network, url: string, raw: string, txid: string) => {
  const extra = new ElectrumClient(network, 10_000, url);
  extra
    .broadcast(raw, txid)
    .catch(() => undefined)
    .finally(() => extra.close());
};
