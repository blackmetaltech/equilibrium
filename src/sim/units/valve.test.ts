import { describe, expect, it } from 'vitest';
import { makeMixture, enthalpyFlow } from '../thermo';
import type { SimCtx, UnitInst } from '../types';
import { valve } from './valve';

const SP = ['N2', 'H2', 'H2O(l)'];
const mx = makeMixture(SP);
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const U = (P: number): UnitInst => ({ id: 'V1', type: 'valve', pos: { x: 0, y: 0 }, rot: 0, params: { P } });

describe('valve', () => {
  it('isenthalpic: ideal gas leaves at the inlet T (Joule-Thomson ignored, DESIGN 3.7) and H_out = H_in', () => {
    const s = { n: [1, 3, 0], T: 450, P: 2e7 };
    const r = valve({ in: s }, U(2e6), ctx);
    if (!r.ok) throw new Error('x');
    const o = r.value.outlets.out!;
    expect(o.P).toBe(2e6); expect(o.T).toBeCloseTo(450, 9); expect(o.n).toEqual([1, 3, 0]);
    expect(enthalpyFlow(mx, o)).toBeCloseTo(enthalpyFlow(mx, s), 3);
    expect(r.value.duty ?? 0).toBe(0); expect(r.value.work ?? 0).toBe(0);
  });
  it('liquid (incompressible-ideal enthalpy independent of P) also unchanged in T', () => {
    const r = valve({ in: { n: [0, 0, 5], T: 350, P: 5e5 } }, U(1e5), ctx);
    if (!r.ok) throw new Error('x'); expect(r.value.outlets.out!.T).toBeCloseTo(350, 9);
  });
  it('outlet P equal to the inlet P is a legal fully-open valve', () => {
    expect(valve({ in: { n: [1, 0, 0], T: 300, P: 1e5 } }, U(1e5), ctx).ok).toBe(true);
  });
  it('VALVE_P_RISE when the outlet pressure exceeds the inlet pressure', () => {
    const r = valve({ in: { n: [1, 0, 0], T: 300, P: 1e5 } }, U(2e5), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('VALVE_P_RISE'); expect(r.data).toMatchObject({ Pin: 1e5, Pout: 2e5 }); }
  });
  it('non-positive outlet P is rejected (code, not exception)', () => {
    const r = valve({ in: { n: [1, 0, 0], T: 300, P: 1e5 } }, U(0), ctx);
    expect(r.ok).toBe(false);
  });
});
