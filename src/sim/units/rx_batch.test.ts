// Batch rig (L18) and the adaptive batch integrator.
import { describe, expect, it } from 'vitest';
import { arrheniusEa } from '../chem/kinetics';
import { burette, h2o2Rig, integrateUntil, odeAt, rigK, timeToFraction } from './rx_batch';
import { UNIT_DEFS_CSTR } from './registryCstr';
import type { SimCtx, UnitInst } from '../types';

describe('adaptive RK4 batch integrator', () => {
  it('first order decay hits exp(-k t) to 1e-9 (step doubling)', () => {
    const y = odeAt((_t, y) => [-0.37 * y[0]!], [2], [1, 5, 10]);
    for (const [i, t] of [1, 5, 10].entries()) expect(Math.abs(y[i]![0]! / (2 * Math.exp(-0.37 * t)) - 1)).toBeLessThan(1e-9);
  });
  it('integrateUntil polishes the crossing time inside the step', () => {
    const r = integrateUntil((_t, y) => [-0.5 * y[0]!], [1], 100, (y) => y[0]! - 0.25);
    expect(r.hit).toBe(true);
    expect(Math.abs(r.t / (Math.log(4) / 0.5) - 1)).toBeLessThan(1e-9);
  });
  it('reports no crossing when the event never fires', () => {
    expect(integrateUntil((_t, y) => [-0.5 * y[0]!], [1], 1, (y) => y[0]! - 0.25).hit).toBe(false);
  });
});

describe('L18 oxygen rig', () => {
  it('5 g -> 3 g of H2O2 at k = 1.15e-3 1/s takes 444 s (0.5 %)', () => {
    const t = timeToFraction(1.15e-3, 3 / 5);
    expect(Math.abs(t / 444 - 1)).toBeLessThan(0.005);
    expect(Math.abs(t / (Math.log(5 / 3) / 1.15e-3) - 1)).toBeLessThan(1e-9);
  });
  it('two-point Ea: a rate that quadruples between 293 K and 313 K gives 52.9 kJ/mol (the rig runs measure the rates)', () => {
    const k293 = 1e-3, k313 = 4e-3;
    const rate = (k: number) => -Math.log(h2o2Rig({ n0: 1, T: 300, P: 101325, k, tEnd: 1 }).fraction); // measured first-order rate of a 1 s run
    const Ea = arrheniusEa(rate(k293), 293, rate(k313), 313, 8.314);
    expect(Math.abs(Ea / 52.9e3 - 1)).toBeLessThan(0.002);
  });
  it('catalysts lower Ea: K6 variants none 75 / iodide 56.5 / catalase 15 kJ/mol and the 25 C rates are ordered', () => {
    const none = rigK('none'), iod = rigK('iodide'), cat = rigK('catalase');
    expect(none.Ea).toBeCloseTo(75300, 0);
    expect(iod.Ea).toBeCloseTo(56500, 0);
    expect(cat.Ea).toBeCloseTo(15000, 0);
    expect(none.k(298.15)).toBeLessThan(iod.k(298.15));
    expect(iod.k(298.15)).toBeLessThan(cat.k(298.15));
  });
  it('burette volume is the ideal gas n R T / P and O2 follows the stoichiometry 0.5 per H2O2', () => {
    expect(burette(1, 273.15, 101325)).toBeCloseTo(0.022414, 5);
    const r = h2o2Rig({ n0: 0.2, T: 298.15, P: 101325, k: 1.15e-3, tEnd: 444.2 });
    expect(Math.abs(r.nO2 - 0.5 * 0.2 * (1 - r.fraction))).toBeLessThan(1e-12);
    expect(Math.abs(r.fraction - 0.6)).toBeLessThan(1e-3);
    expect(Math.abs(r.V_O2 - burette(r.nO2, 298.15, 101325))).toBeLessThan(1e-15);
  });
  it('P12: a reversible first-order batch never crosses its equilibrium conversion', () => {
    const Kc = 3, kf = 0.4; // A <-> B, X_eq = K/(1+K)
    const f = (_t: number, y: number[]) => { const r = kf * (y[0]! - y[1]! / Kc); return [-r, r]; };
    const ts = [0.1, 1, 3, 10, 40, 200];
    for (const y of odeAt(f, [1, 0], ts)) expect(y[1]!).toBeLessThanOrEqual(Kc / (1 + Kc) + 1e-12);
    const last = odeAt(f, [1, 0], [200])[0]!;
    expect(Math.abs(last[1]! - 0.75)).toBeLessThan(1e-6);
  });
  it('batch unit: outlet holds the charge after the batch time, mass conserved, duty from the reaction heat', () => {
    const ctx: SimCtx = { species: ['H2O2(aq)', 'H2O(l)', 'O2'], thermoDetail: 'book' };
    const u: UnitInst = { id: 'B', type: 'batch', pos: { x: 0, y: 0 }, rot: 0, params: { law: 'K6', k: 1.15e-3, T: 298.15, time: 444.2 } };
    const r = UNIT_DEFS_CSTR.batch!.fn({ in: { n: [0.1, 5, 0], T: 298.15, P: 101325 } }, u, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = r.value.outlets.out!;
    expect(Math.abs(o.n[0]! / 0.1 - 0.6)).toBeLessThan(1e-3);
    expect(o.n[2]!).toBeCloseTo(0.5 * (0.1 - o.n[0]!), 12);
    expect(o.n[1]! - 5).toBeCloseTo(0.1 - o.n[0]!, 12);
    expect(r.value.duty!).toBeLessThan(0);
  });
});
