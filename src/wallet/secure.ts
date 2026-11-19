// Secrets live only in Keychain/Keystore: the wallet list in one entry, each wallet's
// recovery phrase (or WizardConnect pairing) in its own. Writes run one at a time.
import * as Keychain from 'react-native-keychain';
import { decodeBip39Mnemonic, generateBip39Mnemonic } from '@bitauth/libauth';
import { initializeLibauth } from 'react-native-libauth';
import { type Registry, newId, parseRegistry, withActive, withWallet, withoutWallet } from './registry';
import { connectionName, decodeConnection, encodeConnection, type Connection } from './connection';

const LIST = 'venn.wallets';
const entry = (id: string) => `venn.wallet.${id}`;
const options = (service: string) => ({
  service,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

async function read(service: string) {
  const found = await Keychain.getGenericPassword(options(service));
  return found ? found.password : null;
}
async function write(service: string, value: string) {
  if (!(await Keychain.setGenericPassword('venn', value, options(service))))
    throw new Error('Secure storage could not save this.');
}

export const readSecret = (id: string) => read(entry(id));

export async function readRegistry(): Promise<Registry | null> {
  const saved = await read(LIST);
  return saved ? parseRegistry(JSON.parse(saved)) : null;
}
async function saveRegistry(r: Registry) {
  await write(LIST, JSON.stringify(r));
  return r;
}

// The secret is written before the list, and the list before an erase, so an
// interrupted write can only leave an unlisted secret, never a listed wallet without one.
async function add(secret: string, details: { name?: string; connected?: boolean }) {
  const current = await readRegistry();
  for (const w of current?.wallets ?? []) {
    const other = await readSecret(w.id);
    if (other === secret || sameConnection(other, secret)) throw new Error(`This wallet is already ${w.name}.`);
  }
  const id = newId(current);
  const next = withWallet(current, id, details);
  await write(entry(id), secret);
  return saveRegistry(next);
}

function sameConnection(a: string | null, b: string) {
  const left = a ? decodeConnection(a) : null;
  const right = decodeConnection(b);
  const receive = (c: Connection) => c.paths.find(p => p.name === 'receive')?.xpub;
  return Boolean(left && right && receive(left) === receive(right));
}

/** A new wallet from a fresh phrase, or from `phrase` when restoring. */
export const addWallet = (phrase?: string) =>
  exclusive(async () => {
    await initializeLibauth();
    const words = phrase ? phrase.trim().normalize('NFKD').split(/\s+/).join(' ') : generateBip39Mnemonic();
    const entropy = decodeBip39Mnemonic(words);
    if (typeof entropy === 'string') throw new Error('Invalid recovery phrase. Check its words and checksum.');
    entropy.fill(0);
    return add(words, {});
  });

/** A wallet whose keys stay in another app, paired over WizardConnect. */
export const addConnectedWallet = (connection: Connection) =>
  exclusive(() => add(encodeConnection(connection), { name: connectionName(connection), connected: true }));

/** Keeps a pairing's relay session current. */
export const saveConnection = (id: string, connection: Connection) =>
  exclusive(async () => {
    if (!decodeConnection((await readSecret(id)) ?? '')) throw new Error('This is not a connected wallet.');
    await write(entry(id), encodeConnection(connection));
  });

export const removeWallet = (id: string) =>
  exclusive(async () => {
    const current = await readRegistry();
    if (!current) throw new Error('Unknown wallet.');
    const next = await saveRegistry(withoutWallet(current, id));
    if (!(await Keychain.resetGenericPassword(options(entry(id)))))
      throw new Error('Secure storage could not erase the wallet.');
    return next;
  });

export const selectWallet = (id: string) =>
  exclusive(async () => {
    const current = await readRegistry();
    if (!current) throw new Error('Unknown wallet.');
    return saveRegistry(withActive(current, id));
  });
