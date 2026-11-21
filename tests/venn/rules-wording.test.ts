// QA 21 Nov: with two voters "majority" means both, so the weakness shown must be the one for
// "everyone", not "more than half can act against the others".
import { expect, it } from 'vitest';
import { presetPlan, WEAKNESS } from '../../src/venn/presets';
import { RULE } from '../../src/venn/layout';
import { summarize } from '../../src/venn/summary';

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, publicKey: '' }));

it('a two-voter majority shows the weakness of needing everyone', () => {
  const plan = presetPlan('shared', people(1)[0], people(2).slice(1));
  const lines = summarize(plan.members as never, plan.settings as never);
  const changes = lines.filter(l => /needs 2 of 2 voters/.test(l.text));
  expect(changes.length).toBeGreaterThan(0);
  for (const l of changes) expect(l.weakness).toBe(WEAKNESS.rule[RULE.EVERYONE]);
  expect(lines.find(l => l.text.startsWith('Payments beyond a budget'))!.weakness).toBe(WEAKNESS.rule[RULE.EVERYONE]);
});

it('with three voters a majority keeps its own weakness', () => {
  const plan = presetPlan('shared', people(1)[0], people(3).slice(1));
  const lines = summarize(plan.members as never, plan.settings as never);
  expect(lines.some(l => /needs 2 of 3 voters/.test(l.text) && l.weakness === WEAKNESS.rule[RULE.MAJORITY])).toBe(true);
});
