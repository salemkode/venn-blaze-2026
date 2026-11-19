// Chain reads and writes for Venns, through the Chipnet servers in core/electrum.
import { type Bytes, binToHex, equal, hexToBin } from '../core/bytes';
import { ElectrumClient, SERVERS, scriptHash as scriptHashOf } from '../core/electrum';
import { decodeTransaction, encodeTransaction, txidOf, type Transaction } from '../core/tx';
import { p2pkhForPublicKey } from '../core/draft';
import { MARKER } from './build';
import { type CircleParams, circleLocking, circleMoneyLocking, readCircleGenesis } from './circle';
import { circleCoins, circleOfficial } from './circleBuild';
import { vennCoins } from './coins';
import { type VennParams, moneyLocking, vennLocking } from './contract';
import { officialCheck } from './verify';

let client: ElectrumClient | null = null;
export const chain = () => (client ??= new ElectrumClient('chipnet'));

/** The time a new Venn transaction may claim: just before the chain's median time. */
export const chainNow = async () => BigInt((await chain().medianTimePast(await chain().tipHeight())) - 1);

export const keyCoins = (publicKey: Bytes) => chain().utxos(p2pkhForPublicKey(publicKey));

export async function readVenn(params: VennParams) {
  const [cards, money] = await Promise.all([chain().utxos(vennLocking(params)), chain().utxos(moneyLocking(params))]);
  const utxos = [...cards, ...money];
  const genesis = decodeTransaction(hexToBin(await chain().transactionHex(await genesisTxid(params))));
  const official = officialCheck({ params, genesis, utxos });
  return { official, coins: vennCoins(params, utxos), genesis };
}

const genesisCache = new Map<string, string>();
async function genesisTxid(params: VennParams) {
  const hit = genesisCache.get(params.vaultCategory);
  if (hit) return hit;
  // The rules NFT's first transaction is the genesis: find it in the Venn address history.
  const history: { tx_hash: string }[] = await chain().request('blockchain.scripthash.get_history', [
    scriptHashOf(vennLocking(params)),
  ]);
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await chain().transactionHex(h.tx_hash)));
    if (tx.inputs[0]?.txid === params.vaultCategory && tx.inputs[0].vout === 0) {
      genesisCache.set(params.vaultCategory, h.tx_hash);
      return h.tx_hash;
    }
  }
  throw new Error('The transaction that created this Venn was not found.');
}

/** Reads a Circle: its state and money, and whether its creation makes it official. */
export async function readCircle(params: CircleParams) {
  const [state, money] = await Promise.all([
    chain().utxos(circleLocking(params)),
    chain().utxos(circleMoneyLocking(params)),
  ]);
  const genesis = decodeTransaction(hexToBin(await chain().transactionHex(await circleGenesisTxid(params))));
  const coins = circleCoins(params, [...state, ...money]);
  return { official: circleOfficial(params, genesis, coins), coins, genesis };
}

async function circleGenesisTxid(params: CircleParams) {
  const hit = genesisCache.get(params.circleCategory);
  if (hit) return hit;
  const history: { tx_hash: string }[] = await chain().request('blockchain.scripthash.get_history', [
    scriptHashOf(circleLocking(params)),
  ]);
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await chain().transactionHex(h.tx_hash)));
    if (tx.inputs[0]?.txid === params.circleCategory && tx.inputs[0].vout === 0) {
      genesisCache.set(params.circleCategory, h.tx_hash);
      return h.tx_hash;
    }
  }
  throw new Error('The transaction that created this Circle was not found.');
}

/**
 * Venns and Circles this key was given a seat in: creation transactions that paid it and
 * carry a marker.
 */
export async function findVenns(publicKey: Bytes, network: 'chipnet') {
  const locking = p2pkhForPublicKey(publicKey);
  const history: { tx_hash: string }[] = await chain().request('blockchain.scripthash.get_history', [
    scriptHashOf(locking),
  ]);
  const found: { params: VennParams; plan?: string; txid: string; genesis: Transaction }[] = [];
  const circles: { params: CircleParams; plan?: string; txid: string }[] = [];
  for (const h of history) {
    const tx = decodeTransaction(hexToBin(await chain().transactionHex(h.tx_hash)));
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
 * accepts it, the same bytes also go to every other Chipnet server: on 19 November one server
 * kept a long unconfirmed chain to itself, and nothing confirmed until another node saw it.
 * Sending identical bytes again is safe (same txid, no new spend) and its outcome is ignored.
 */
export async function broadcast(tx: Transaction) {
  const raw = binToHex(encodeTransaction(tx));
  const txid = txidOf(tx);
  const primary = chain();
  const result = await primary.broadcast(raw, txid);
  // Every other server, whichever one the client actually used (it may have failed over).
  for (const url of SERVERS.chipnet ?? []) if (url !== primary.server) relay(url, raw, txid);
  return result;
}

const relay = (url: string, raw: string, txid: string) => {
  const extra = new ElectrumClient('chipnet', 10_000, url);
  extra
    .broadcast(raw, txid)
    .catch(() => undefined)
    .finally(() => extra.close());
};
