// The device book through real storage reads and writes (AsyncStorage mocked in memory).
import { describe, expect, it, vi } from 'vitest';

const records = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => records.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      records.set(k, v);
    },
    removeItem: async (k: string) => {
      records.delete(k);
    },
  },
}));

const { readBook, updateBook, NAMES_VERSION } = await import('../../src/venn/store');

describe('device book', () => {
  it('an old stored book has its seat names reset, and stays reset after the next write', async () => {
    records.set(
      'venn.book.w1',
      JSON.stringify({
        venns: [{ category: 'aa', name: 'Home', type: 'shared', version: 2, names: { ['11'.repeat(20)]: 'Alice' } }],
        preparing: [],
        joining: [],
      }),
    );
    const read = await readBook('w1');
    expect(read.namesVersion).toBe(NAMES_VERSION);
    expect(read.venns[0].names).toEqual({});
    expect(read.circles).toEqual([]);
    await updateBook('w1', b => b);
    const stored = JSON.parse(records.get('venn.book.w1')!);
    expect(stored.namesVersion).toBe(NAMES_VERSION);
    expect(stored.venns[0].names).toEqual({});
  });

  it('names written after the reset are kept', async () => {
    await updateBook('w2', b => ({ ...b, venns: [{ category: 'bb', name: 'Pot', type: 'pot', version: 2, names: { x: 'Cara' } }] }));
    expect((await readBook('w2')).venns[0].names).toEqual({ x: 'Cara' });
  });
});

describe('device book from the intermediate build', () => {
  it('a book stamped version 2 without a real reset is reset too', async () => {
    records.set('venn.book.w3', JSON.stringify({ namesVersion: 2, venns: [{ category: 'cc', name: 'X', type: 'shared', version: 2, names: { z: 'Mallory' } }] }));
    expect((await readBook('w3')).venns[0].names).toEqual({});
  });
});

describe('Venn v1 entries', () => {
  it('are dropped: the app runs Venn v2 only', async () => {
    records.set('venn.book.w4', JSON.stringify({ namesVersion: 3, venns: [
      { category: 'old', name: 'Old', type: 'shared', names: {} },
      { category: 'new', name: 'New', type: 'shared', version: 2, names: {} },
    ] }));
    expect((await readBook('w4')).venns.map(v => v.category)).toEqual(['new']);
  });
});
