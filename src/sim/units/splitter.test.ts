import { describe, expect, it } from 'vitest';
import type { SimCtx, UnitInst } from '../types';
import { splitter } from './splitter';

const ctx: SimCtx = { species: ['N2', 'H2', 'Ar'], thermoDetail: 'rigorous' };
const U = (frac: number): UnitInst => ({ id: 'S1', type: 'splitter', pos: { x: 0, y: 0 }, rot: 0, params: { frac } });
const IN = { in: { n: [3, 9, 0.4], T: 640, P: 2e7 } };

describe('splitter / purge', () => {
  it('same composition, T and P on both outlets (definition of a splitter)', () => {
    const r = splitter(IN, U(0.05), ctx);
    if (!r.ok) throw new Error('x');
    const { purge, out } = r.value.outlets;
    for (const s of [purge!, out!]) { expect(s.T).toBe(640); expect(s.P).toBe(2e7); }
    const yi = IN.in.n.map((x) => x / 12.4);
    for (const s of [purge!, out!]) { const t = s.n.reduce((a, b) => a + b, 0); s.n.forEach((x, i) => expect(x / t).toBeCloseTo(yi[i]!, 12)); }
  });
  it('fractions sum to one: purge + out = in (mass closes) and purge is frac of the inlet', () => {
    const r = splitter(IN, U(0.37), ctx);
    if (!r.ok) throw new Error('x');
    const { purge, out } = r.value.outlets;
    IN.in.n.forEach((x, i) => { expect(purge!.n[i]! + out!.n[i]!).toBeCloseTo(x, 12); expect(purge!.n[i]!).toBeCloseTo(0.37 * x, 12); });
  });
  it('limits 0 and 1 are legal', () => {
    for (const f of [0, 1]) { const r = splitter(IN, U(f), ctx); expect(r.ok).toBe(true); }
  });
  it('SPLIT_RANGE for 1.2, -0.1 and NaN (with the offending number)', () => {
    for (const f of [1.2, -0.1, NaN]) {
      const r = splitter(IN, U(f), ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.code).toBe('SPLIT_RANGE'); expect(r.unitId).toBe('S1'); if (!Number.isNaN(f)) expect(r.data.frac).toBe(f); }
    }
  });
});
