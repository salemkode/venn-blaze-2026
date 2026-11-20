import { describe, expect, it } from 'vitest';
import {
  EXIT_F, KINDS, OPEN_GROW, canCreate, cardPose, compileScene, nodeNumber, sceneAt, seedBox, swapAlpha, unwarp, warp,
} from '../../src/screens/venn-cards/content';

describe('Create a Venn cards', () => {
  it('offers all four kinds, each with four parts ending in its weakness', () => {
    expect(KINDS.map(k => k.id)).toEqual(['personal', 'shared', 'pot', 'circle']);
    for (const kind of KINDS) {
      expect(canCreate(kind.id)).toBe(true);
      expect(kind.parts).toHaveLength(4);
      expect(kind.parts[3].label).toBe('Weakness');
      expect(kind.parts.map(p => p.body).join(' ')).not.toMatch(/later build|coming soon/i);
    }
  });

  it('maps finger space to kind position and back', () => {
    for (const x of [-0.4, 0, 0.2, 0.5, 0.9, 1, 1.37, 2.5, 3, 3.3]) expect(unwarp(warp(x))).toBeCloseTo(x, 10);
    expect(warp(1)).toBe(1);
    // The top card travels for the first EXIT_F of a step, which is most of the finger's travel.
    expect(warp(372 / 416)).toBeCloseTo(EXIT_F, 10);
  });

  it('shows a whole card underneath at mid-swipe while the top card is nearly gone', () => {
    const W = 375;
    const top = cardPose(0.5, W), under = cardPose(-0.5, W);
    expect(top.show).toBe(true);
    expect(W / 2 + top.tx + (W * top.s) / 2).toBeLessThan(40);   // a sliver of the leaving card
    expect(under.show).toBe(true);
    expect(under.s).toBeGreaterThan(0.97);
    expect(cardPose(EXIT_F, W).show).toBe(false);
    // The first card has nothing above it: pulling it right lifts it.
    expect(cardPose(-0.1, W, true).tx).toBeGreaterThan(0);
  });

  it('grows the opening from one pixel to the whole screen', () => {
    const start = seedBox(0, 375, 780, 440), end = seedBox(OPEN_GROW, 375, 780, 440);
    expect(start.w).toBe(1);
    expect(start.h).toBe(1);
    expect(end).toMatchObject({ x: 0, y: 0, w: 375, h: 780, r: 0 });
  });

  it('has a sorted timeline covering every part of every kind', () => {
    for (const kind of KINDS) {
      const scene = compileScene(kind.id);
      const ats = scene.frames.map(f => f[0]);
      expect([...ats].sort((a, b) => a - b)).toEqual(ats);
      expect(ats[0]).toBe(-0.5);
      expect(ats.at(-1)).toBe(3);
      for (const part of [0, 1, 2, 3]) expect(ats).toContain(part);
      expect(new Set(scene.frames.map(f => f.length)).size).toBe(1);
      // Every part ends on a caption explaining it.
      for (const part of [0, 1, 2, 3]) {
        const at = sceneAt(scene.frames, part);
        expect(scene.caps[at.t < 0.5 ? at.capA : at.capB]).not.toBe('');
      }
    }
  });

  it('never shows two captions at once', () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const both = swapAlpha(0, 0, 1, t) > 0 && swapAlpha(1, 0, 1, t) > 0;
      expect(both).toBe(false);
    }
    expect(swapAlpha(2, 2, 2, 0.5)).toBe(1);
  });

  it('counts budgets and names Circle turns', () => {
    expect(nodeNumber('shared', 0, 50)).toBe('50');
    expect(nodeNumber('shared', 0, 30.2)).toBe('30/50');
    expect(nodeNumber('circle', 1, 50)).toBe('2nd');
  });
});
