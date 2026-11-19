// The wallets on this device: names and colours only. Each wallet's secret (a recovery
// phrase, or a WizardConnect pairing for a connected wallet) has its own secure entry.
import { z } from 'zod';

export const MAX_WALLETS = 8;
export const CARD_COLORS = ['#0B0B0D', '#6A4DF5', '#0A8F6A', '#1F6FEB', '#C97A10', '#D1456B'];

const walletSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{1,16}$/),
  name: z.string().min(1).max(24),
  color: z
    .number()
    .int()
    .min(0)
    .max(CARD_COLORS.length - 1),
  connected: z.boolean().default(false),
});
const registrySchema = z
  .object({ activeId: z.string(), wallets: z.array(walletSchema).min(1).max(MAX_WALLETS) })
  .refine(
    r => new Set(r.wallets.map(w => w.id)).size === r.wallets.length && r.wallets.some(w => w.id === r.activeId),
    'Wallet list is inconsistent.',
  );

export type WalletEntry = z.infer<typeof walletSchema>;
export type Registry = z.infer<typeof registrySchema>;

export const parseRegistry = (value: unknown): Registry => registrySchema.parse(value);

export const activeWallet = (r: Registry) => r.wallets.find(w => w.id === r.activeId)!;

const firstFree = (taken: Set<number>, limit: number) => {
  for (let n = 0; n < limit; n++) if (!taken.has(n)) return n;
  return taken.size % limit;
};

export function newId(r: Registry | null, now = Date.now()) {
  let id = now.toString(36);
  while (r?.wallets.some(w => w.id === id)) id += '0';
  return id;
}

/** Adds a wallet with the next free number and colour, and makes it active. */
export function withWallet(
  r: Registry | null,
  id: string,
  details: { name?: string; connected?: boolean } = {},
): Registry {
  const wallets = r?.wallets ?? [];
  if (wallets.length >= MAX_WALLETS) throw new Error(`This device can hold ${MAX_WALLETS} wallets.`);
  const numbers = new Set(wallets.map(w => Number(/^Wallet (\d+)$/.exec(w.name)?.[1])));
  let number = 1;
  while (numbers.has(number)) number++;
  const color = firstFree(new Set(wallets.map(w => w.color)), CARD_COLORS.length);
  return parseRegistry({
    activeId: id,
    wallets: [
      ...wallets,
      { id, name: details.name ?? `Wallet ${number}`, color, connected: details.connected ?? false },
    ],
  });
}

/** Removes a wallet; the last one cannot be removed. */
export function withoutWallet(r: Registry, id: string): Registry {
  const wallets = r.wallets.filter(w => w.id !== id);
  if (wallets.length === r.wallets.length) throw new Error('Unknown wallet.');
  if (!wallets.length) throw new Error('Keep at least one wallet.');
  return parseRegistry({ activeId: r.activeId === id ? wallets[0].id : r.activeId, wallets });
}

export const withActive = (r: Registry, id: string): Registry => parseRegistry({ ...r, activeId: id });

/** The other wallets, in the order their cards sit behind the active one. */
export function behind(r: Registry) {
  const n = r.wallets.findIndex(w => w.id === r.activeId);
  return [...r.wallets.slice(n + 1), ...r.wallets.slice(0, n)];
}
