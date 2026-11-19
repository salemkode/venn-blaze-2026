import { describe, expect, it } from 'vitest';
import { sampleCard, sampleRules } from './fixtures';
import {
  decodeCardState,
  decodeRulesState,
  encodeCardState,
  encodeRulesState,
} from '../../src/venn/layout';

describe('venn layouts', () => {
  it('reads and writes Venn card commitments', () => {
    const card = sampleCard({ roles: 15, cap: 7n, left: 9n, recovery: 2, newPkh: '22'.repeat(20), waitUnits: 30000 });
    const hex = '11'.repeat(20) + '0f01320000000000000080510100000000000700000000000000090000000000000000f153650000000002'
      + '22'.repeat(20) + '3075';
    expect(encodeCardState(card)).toBe(hex);
    expect(decodeCardState(hex)).toEqual(card);
  });

  it('reads and writes Venn rules commitments', () => {
    const rules = sampleRules();
    const hex = '01030001010101020100000001029d0403023a090200' + '00'.repeat(32);
    expect(encodeRulesState(rules)).toBe(hex);
    expect(decodeRulesState(hex)).toEqual(rules);
  });

  it('decode rejects wrong length', () => {
    expect(() => decodeCardState('00')).toThrow(/card/i);
    expect(() => decodeRulesState('00')).toThrow(/rules/i);
  });
});
