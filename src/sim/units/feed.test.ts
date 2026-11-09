import { describe, expect, it } from 'vitest';
import type { SimCtx, UnitInst } from '../types';
import { feed } from './feed';
import { sink } from './sink';

const ctx: SimCtx = { species: ['N2', 'H2', 'NH3'], thermoDetail: 'rigorous' };
const U = (params: Record<string, number | string>): UnitInst => ({ id: 'F1', type: 'feed', pos: { x: 0, y: 0 }, rot: 0, params });

describe('feed', () => {
  it('flow x mole fractions (y_ params) at T, P: Haber 1:3 feed, sums exactly to flow', () => {
    const r = feed({}, U({ flow: 100, y_N2: 0.25, y_H2: 0.75, T: 300, P: 3e6 }), ctx);
    if (!r.ok) throw new Error('x');
    const o = r.value.outlets.out!;
    expect(o.n[0]).toBeCloseTo(25, 12); expect(o.n[1]).toBeCloseTo(75, 12); expect(o.n[2]).toBe(0);
    expect(o.T).toBe(300); expect(o.P).toBe(3e6);
  });
  it('y_ values are normalised (1:3 given as 1 and 3)', () => {
    const r = feed({}, U({ flow: 8, y_N2: 1, y_H2: 3, T: 300, P: 1e5 }), ctx);
    if (!r.ok) throw new Error('x'); expect(r.value.outlets.out!.n).toEqual([2, 6, 0]);
  });
  it('explicit n_<species> (mol/s) params win', () => {
    const r = feed({}, U({ n_N2: 1.5, n_NH3: 0.5, T: 400, P: 1e5 }), ctx);
    if (!r.ok) throw new Error('x'); expect(r.value.outlets.out!.n).toEqual([1.5, 0, 0.5]);
  });
  it('negative flow / bad T or P -> FEED_SPEC failure; zero flow is legal', () => {
    for (const p of [{ flow: -1, y_N2: 1 }, { flow: 1, y_N2: 1, T: -5 }, { flow: 1, y_N2: 1, P: 0 }]) {
      const r = feed({}, U({ T: 300, P: 1e5, ...p }), ctx);
      expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('FEED_SPEC');
    }
    expect(feed({}, U({ flow: 0, y_N2: 1, T: 300, P: 1e5 }), ctx).ok).toBe(true);
  });
});

describe('sink (product / vent)', () => {
  it('terminal: no outlets, reports what arrived (accumulation is the dynamics lane)', () => {
    const r = sink({ in: { n: [1, 2, 3], T: 300, P: 1e5 } }, U({}), ctx);
    if (!r.ok) throw new Error('x');
    expect(r.value.outlets).toEqual({});
    expect(r.value.info?.n_total).toBe(6);
    expect(r.value.info?.n_N2).toBe(1);
  });
  it('missing inlet is an empty sink, not an error', () => { expect(sink({}, U({}), ctx).ok).toBe(true); });
});
