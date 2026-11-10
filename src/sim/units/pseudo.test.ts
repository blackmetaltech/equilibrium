// Pseudo-species (no thermo rows: biomass, lumps) in the heater and the relief valve: molar masses from the catalogue, water-like sensible heat.
import { describe, expect, it } from 'vitest';
import type { SimCtx, UnitInst } from '../types';
import { heater } from './heater';
import { relief } from './relief';

const ctx: SimCtx = { species: ['H2O(l)', 'biomass', 'N2'], thermoDetail: 'rigorous' };
const U = (type: string, params: Record<string, number | string>): UnitInst => ({ id: 'X', type, pos: { x: 0, y: 0 }, rot: 0, params });
describe('pseudo-species without thermo', () => {
  it('heater: heating a biomass slurry by T and by duty agree, and the duty is M x 4.18 J/(g K) for the pseudo part', () => {
    const s = { n: [10, 2, 0], T: 300, P: 1e5 };
    const a = heater({ in: s }, U('heater', { T: 330 }), ctx);
    if (!a.ok) throw new Error(a.code);
    const q = (a.value as { duty: number }).duty;
    expect(q).toBeGreaterThan(2 * 24.6263 * 4.18 * 30 * 0.99); // at least the biomass part: 1.2 kW
    const b = heater({ in: s }, U('heater', { duty: q }), ctx);
    if (!b.ok) throw new Error(b.code);
    expect((b.value as unknown as { outlets: { out: { T: number } } }).outlets.out.T).toBeCloseTo(330, 5);
  });
  it('relief: load in kg/h from the catalogue masses, a finite capacity and the default heat-capacity ratio', () => {
    const r = relief({ in: { n: [0, 5, 5], T: 400, P: 2e6 } }, U('relief', { Pset: 2e6, orifice: 'D' }), ctx);
    if (!r.ok) throw new Error(r.code);
    const i = (r.value as { info: Record<string, number> }).info;
    expect(i.load_kg_h).toBeCloseTo(((5 * 24.6263 + 5 * 28.0134) / 1000) * 3600, 0); expect(i.k).toBeCloseTo(1.3, 6);
    expect(Number.isFinite(i.capacity_kg_h)).toBe(true); expect(i.M).toBeCloseTo((5 * 24.6263 + 5 * 28.0134) / 10, 3);
  });
});
