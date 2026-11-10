// EQ-CE-007..010 (Felder-style VLE) against src/oracle/oracles.json, with the printed Antoine constants (mmHg, deg C).
import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { bubbleT, dewT, flashK } from '../sim/thermo/vle';
import oracles from './oracles.json';

const O = (id: string) => (oracles as any).oracles?.find?.((o: any) => o.id === id) ?? Object.values(oracles as any).flat().find((o: any) => o && o.id === id);
const psat = (c: number[], Tc: number) => dmath.pow(10, c[0]! - c[1]! / (c[2]! + Tc));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('EQ-CE-007 isothermal flash of benzene/toluene/ethylbenzene', () => {
  const o = O('EQ-CE-007'), e = o.expected, A = o.inputs.antoine_log10_mmHg_C;
  it('V/F, K, x, y within the oracle tolerance (0.3 %)', () => {
    const ps = o.inputs.species.map((s: string) => psat(A[s], o.inputs.T_C));
    const K = ps.map((p: number) => p / o.inputs.P_mmHg);
    const f = flashK(o.inputs.z, K);
    expect(f.code).toBe('TWO_PHASE');
    expect(rel(f.beta, e.V_over_F)).toBeLessThan(o.tol.rel);
    K.forEach((k: number, i: number) => { expect(rel(k, e.K[i])).toBeLessThan(1e-6); expect(rel(f.x[i]!, e.x[i])).toBeLessThan(o.tol.rel); expect(rel(f.y[i]!, e.y[i])).toBeLessThan(o.tol.rel); });
  });
});
describe('EQ-CE-008 / 009 bubble and dew point', () => {
  const o8 = O('EQ-CE-008'), o9 = O('EQ-CE-009'), A = o8.inputs.antoine;
  const Kfn = (names: string[]) => (T: number) => names.map((s) => psat(A[s], T - 273.15) / 760);
  it('bubble point of 50/50 benzene-toluene: 92.116 C, y_benzene 0.7136', () => {
    const r = bubbleT(o8.inputs.x, Kfn(o8.inputs.species), 250, 600)!;
    expect(rel(r.T - 273.15, o8.expected.T_bubble_C)).toBeLessThan(o8.tol.rel);
    expect(rel(r.other[0]!, o8.expected.y_benzene)).toBeLessThan(o8.tol.rel);
  });
  it('dew point of 50/50 benzene-toluene: 98.775 C, x_benzene 0.2910', () => {
    const r = dewT(o9.inputs.y, Kfn(o9.inputs.species), 250, 600)!;
    expect(rel(r.T - 273.15, o9.expected.T_dew_C)).toBeLessThan(o9.tol.rel);
    expect(rel(r.other[0]!, o9.expected.x_benzene)).toBeLessThan(o9.tol.rel);
  });
});
describe('EQ-CE-010 condensation of water from air at 40 C', () => {
  const o = O('EQ-CE-010'), e = o.expected, A = o.inputs.antoine_water, P = o.inputs.P_mmHg;
  for (const Kair of [1e12, 1e4]) {
    it(`dew point, condensate and exit composition (air K = ${Kair})`, () => {
      const feed = [o.inputs.feed.H2O, o.inputs.feed.air];
      const dp = dewT([0.2, 0.8], (T) => [psat(A, T - 273.15) / P, Kair], 250, 450)!;
      expect(rel(dp.T - 273.15, e.dewpoint_C)).toBeLessThan(o.tol.rel);
      const K = [psat(A, o.inputs.T_out_C) / P, Kair];
      expect(rel(K[0]! * P, e.p_sat_40C_mmHg)).toBeLessThan(o.tol.rel);
      const f = flashK(feed, K);
      const total = feed[0]! + feed[1]!;
      const vapW = f.beta * total * f.y[0]!;
      expect(rel(feed[0]! - vapW, e.H2O_condensed)).toBeLessThan(o.tol.rel);
      expect(rel(vapW, e.H2O_vapor_out)).toBeLessThan(o.tol.rel);
      expect(rel(f.y[0]!, e.y_H2O_out)).toBeLessThan(o.tol.rel);
    });
  }
});
