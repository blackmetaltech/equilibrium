import { describe, expect, it } from 'vitest';
import { atomMatrix } from '../../data/species';
import { makeMixture, massFlow } from '../thermo';
import { THERMO } from '../thermo/species';
import type { SimCtx, UnitInst } from '../types';
import { absorber } from './absorber';

const SP = ['SO2', 'SO3', 'O2', 'N2', 'H2SO4(l)', 'H2O(l)'], mx = makeMixture(SP), ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'A1', type: 'absorber', pos: { x: 0, y: 0 }, rot: 0, params });
const s = { n: [0.2, 9.8, 5, 80, 0, 0], T: 450, P: 1.2e5 };
const run = (p: Record<string, number | string>, st = s) => { const r = absorber({ in: st }, mk(p), ctx); if (!r.ok) throw new Error(r.code); return r; };
const atoms = (n: number[]) => { const { elements, A } = atomMatrix(SP); return elements.map((_, e) => n.reduce((a, v, i) => a + v * A[e]![i]!, 0)); };

describe('SO3 absorber', () => {
  it('recovery 99.95 %, acid at 98.5 wt %: SO3 out = 0.05 % of in; acid composition by mass', () => {
    const r = run({ acid: 0.985, recovery: 0.9995 }), o = r.value.outlets;
    expect(o.out!.n[1]!).toBeCloseTo(9.8 * 0.0005, 12);
    const m = o.acid!.n[4]! * THERMO['H2SO4(l)']!.M, mw = o.acid!.n[5]! * THERMO['H2O(l)']!.M;
    expect(m / (m + mw)).toBeCloseTo(0.985, 12);
  });
  it('atom balance (S, O, H, N) closes with the make-up water, mass to 1e-12', () => {
    const r = run({ acid: 0.98, recovery: 0.999 }), o = r.value.outlets;
    const makeup = new Array<number>(6).fill(0); makeup[5] = r.value.info!.water_makeup_mol_s!;
    const lhs = atoms(s.n.map((v, i) => v + makeup[i]!)), rhs = atoms(o.out!.n.map((v, i) => v + o.acid!.n[i]!));
    lhs.forEach((v, e) => expect(Math.abs(v - rhs[e]!)).toBeLessThan(1e-12 * Math.max(1, v)));
    const mIn = massFlow(mx, s.n) + r.value.info!.water_makeup_kg_s!, mOut = massFlow(mx, o.out!.n) + massFlow(mx, o.acid!.n);
    expect(Math.abs(mIn - mOut)).toBeLessThan(1e-12 * mIn);
  });
  it('energy: at 298.15 K everywhere the duty is n_abs x (dHf H2SO4(l) - dHf SO3 - dHf H2O(l)) = about -132 kJ/mol', () => {
    const r = run({ T: 298.15, acid: 0.98 }, { ...s, T: 298.15 });
    const dH = THERMO['H2SO4(l)']!.dHf - THERMO.SO3!.dHf - THERMO['H2O(l)']!.dHf;
    expect(Math.abs(r.value.duty! / r.value.info!.absorbed_mol_s! - dH)).toBeLessThan(1e-6 * Math.abs(dH));
    expect(dH / 1000).toBeLessThan(-125); expect(dH / 1000).toBeGreaterThan(-140);
    expect(r.value.duty!).toBeLessThan(0);
  });
  it('water as absorbent raises WATER_ABSORBER_MIST (warn); ranges are enforced', () => {
    const r = run({ absorbent: 'water' });
    expect(r.diag.some((d) => d.code === 'WATER_ABSORBER_MIST' && d.severity === 'warn')).toBe(true);
    expect(run({}).diag.length).toBe(0);
    for (const p of [{ acid: 0.9 } as Record<string, number>, { acid: 0.99 }, { recovery: 0.9999 }]) { const x = absorber({ in: s }, mk(p), ctx); expect(x.ok).toBe(false); if (!x.ok) expect(x.code).toBe('SPEC_RANGE'); }
  });
  it('species missing is coded', () => {
    const c2: SimCtx = { species: ['SO3', 'N2'], thermoDetail: 'rigorous' };
    const x = absorber({ in: { n: [1, 1], T: 400, P: 1e5 } }, mk({}), c2); expect(x.ok).toBe(false); if (!x.ok) expect(x.code).toBe('SPECIES_MISSING');
  });
});
