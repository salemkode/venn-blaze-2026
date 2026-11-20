// A saved WizardConnect pairing: relay credentials and the other wallet's public branch
// keys, never a private key. Stored in that wallet's secure entry instead of a phrase.
import { z } from 'zod';

const PREFIX = 'wizardconnect:';
const hex = z.string().regex(/^[0-9a-f]{64,66}$/i);

const schema = z
  .object({
    privateKey: hex,
    secret: z.string().min(8).max(200),
    walletPublicKey: hex,
    walletName: z
      .string()
      .trim()
      .max(80)
      .transform(value => value || 'Connected wallet')
      .default('Connected wallet'),
    paths: z
      .array(z.object({ name: z.string().min(1).max(40), xpub: z.string().max(200) }).strip())
      .min(1)
      .max(16),
  })
  .strip()
  .refine(c => c.paths.some(p => p.name === 'receive'), 'The other wallet did not share its receive addresses.')
  .refine(c => new Set(c.paths.map(p => p.name)).size === c.paths.length, 'The other wallet shared duplicate address branches.')
  .refine(
    c => c.paths.some(p => p.name === 'receive' && /^(xpub|tpub)/.test(p.xpub)),
    'The receive branch uses an unsupported Bitcoin Cash network.',
  );

export type Connection = z.infer<typeof schema>;

export const parseConnection = (value: unknown): Connection => schema.parse(value);
export const encodeConnection = (value: Connection) => PREFIX + JSON.stringify(parseConnection(value));
export const decodeConnection = (secret: string): Connection | null =>
  secret.startsWith(PREFIX) ? parseConnection(JSON.parse(secret.slice(PREFIX.length))) : null;

export function connectionName(c: Connection) {
  const name = c.walletName;
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

/** Mainnet keys are xpubs; test-network keys are tpubs. */
export const connectionNetwork = (c: Connection) =>
  c.paths.find(p => p.name === 'receive')!.xpub.startsWith('xpub') ? 'mainnet' : 'chipnet';

/**
 * The network to open on. A choice made in Settings wins. Without one, Venn starts on Mainnet,
 * except that a wallet paired before Mainnet became the default stays on its own network.
 */
export function startingNetwork(chosen: 'chipnet' | 'mainnet' | null, secret: string | null) {
  if (chosen) return chosen;
  let connection: Connection | null = null;
  try {
    connection = secret ? decodeConnection(secret) : null;
  } catch {
    connection = null;
  }
  return connection ? connectionNetwork(connection) : 'mainnet';
}

/** WizardConnect's JSON form for bytes and big integers, the same as libauth's. */
export function toRelayJson(value: unknown): unknown {
  if (value instanceof Uint8Array)
    return `<Uint8Array: 0x${Array.from(value, b => b.toString(16).padStart(2, '0')).join('')}>`;
  if (typeof value === 'bigint') return `<bigint: ${value}n>`;
  if (Array.isArray(value)) return value.map(toRelayJson);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toRelayJson(v)]));
  return value;
}
