import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { dmath } from '@core/numerics';
import { THERMO, hOf, sOf, cpOf } from './species';
import {
  makeMixture, indexOf, totalFlow, moleFractions, massFlow, molarMass, enthalpyFlow, enthalpyFlowAt, entropyFlow,
  mixingEntropyFlow, cpFlow, solveT, extrapolationDiags,
} from './mixture';

const R = 8.314462618;
const IDS = ['N2', 'H2', 'NH3', 'Ar', 'CH4', 'H2O', 'CO2', 'SO2', 'O2'];
const mx = makeMixture(IDS);

describe('mixture helpers', () => {
  it('id -> index, totals, fractions, mass flow in kg/s', () => {
    expect(indexOf(mx, 'NH3')).toBe(2);
    expect(indexOf(mx, 'XX')).toBe(-1);
    const n = [1, 3, 0, 0, 0, 0, 0, 0, 0];
    expect(totalFlow(n)).toBe(4);
    expect(moleFractions(n)).toEqual([0.25, 0.75, 0, 0, 0, 0, 0, 0, 0]);
    expect(massFlow(mx, n)).toBeCloseTo((28.014 + 3 * 2.016) / 1000, 12);
    expect(molarMass(mx, n)).toBeCloseTo((28.014 + 3 * 2.016) / 4 / 1000, 12);
  });

  it('refuses species without thermo data and unknown ids', () => {
    expect(() => makeMixture(['N2', 'H2O2(aq)'])).toThrow();
    expect(() => makeMixture(['N2', 'nope'])).toThrow();
  });

  it('enthalpy flow is the sum of n_i h_i(T) (ideal mixing), in W', () => {
    const n = [0.5, 1.5, 0.25, 0.1, 0, 0.3, 0, 0, 0.2];
    const T = 640;
    let want = 0;
    for (let i = 0; i < IDS.length; i++) want += n[i]! * hOf(THERMO[IDS[i]!]!, T);
    expect(enthalpyFlow(mx, { n, T, P: 2e7 })).toBe(want);
    expect(enthalpyFlowAt(mx, n, T)).toBe(want);
    let cp = 0;
    for (let i = 0; i < IDS.length; i++) cp += n[i]! * cpOf(THERMO[IDS[i]!]!, T);
    expect(cpFlow(mx, n, T)).toBe(cp);
  });

  it('ideal-mixing additivity: H(a + b) = H(a) + H(b) at the same T', () => {
    const a = [1, 2, 0, 0, 0, 0, 0, 0, 0], b = [0, 1, 0.5, 0, 0.2, 0, 0, 0, 0.1];
    const ab = a.map((v, i) => v + b[i]!);
    expect(enthalpyFlowAt(mx, ab, 555)).toBeCloseTo(enthalpyFlowAt(mx, a, 555) + enthalpyFlowAt(mx, b, 555), 8);
  });

  it('entropy: S_i = s_i(T) - R ln(y_i P / 1 bar) for an all-gas stream', () => {
    const n = [1, 3, 0.5, 0, 0, 0, 0, 0, 0];
    const T = 700, P = 1.5e7, nt = 4.5;
    let want = 0;
    for (let i = 0; i < 3; i++) want += n[i]! * (sOf(THERMO[IDS[i]!]!, T) - R * dmath.log(((n[i]! / nt) * P) / 1e5));
    expect(entropyFlow(mx, { n, T, P })).toBeCloseTo(want, 9);
  });

  it('entropy of mixing is >= 0 (strictly > 0 for two or more species, 0 for a pure stream); P3-style sanity', () => {
    expect(mixingEntropyFlow(mx, [2, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(mixingEntropyFlow(mx, [1, 1, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(2 * R * dmath.log(2), 12);
    const r = new Rng(7);
    for (let k = 0; k < 2000; k++) {
      const n = IDS.map(() => (r.chance(0.4) ? 0 : r.range(0, 5)));
      if (totalFlow(n) === 0) continue;
      expect(mixingEntropyFlow(mx, n)).toBeGreaterThanOrEqual(0);
    }
    // mixing two streams at fixed T, P: S_out >= S_in_a + S_in_b (second law, adiabatic mixing of equal-T streams)
    const a = [1, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 1, 0, 0, 0, 0, 0, 0, 0];
    const s = (n: number[]) => entropyFlow(mx, { n, T: 500, P: 1e6 });
    expect(s([1, 1, 0, 0, 0, 0, 0, 0, 0])).toBeGreaterThan(s(a) + s(b));
  });

  it('condensed species: pure solid carries s(T) only; liquids mix ideally among themselves', () => {
    const m2 = makeMixture(['H2O(l)', 'N2', 'C']);
    const s = entropyFlow(m2, { n: [1, 0, 2], T: 350, P: 5e6 });
    expect(s).toBeCloseTo(sOf(THERMO['H2O(l)']!, 350) + 2 * sOf(THERMO['C']!, 350), 9);
  });

  it('zero flow gives zero extensive quantities', () => {
    const z = IDS.map(() => 0);
    expect(enthalpyFlowAt(mx, z, 500)).toBe(0);
    expect(entropyFlow(mx, { n: z, T: 500, P: 1e5 })).toBe(0);
    expect(massFlow(mx, z)).toBe(0);
  });
});

describe('solveT (Brent on [50, 3500] K)', () => {
  it('round trip on 10 000 random mixtures to 1e-9 K', () => {
    const r = new Rng(20261110);
    let worst = 0;
    for (let k = 0; k < 10000; k++) {
      const n = IDS.map(() => (r.chance(0.35) ? 0 : r.range(1e-3, 20)));
      if (totalFlow(n) === 0) n[0] = 1;
      const T = r.range(200, 3000);
      const P = r.range(1e5, 3e7);
      const H = enthalpyFlow(mx, { n, T, P });
      const res = solveT(mx, H, n);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      worst = Math.max(worst, Math.abs(res.value - T));
      expect(Math.abs(res.value - T)).toBeLessThan(1e-9);
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('adiabatic sulfur-burner style check: mixture heated by a known duty', () => {
    const n = [4, 0, 0, 0, 0, 0, 0, 0, 1];
    const H0 = enthalpyFlowAt(mx, n, 298.15);
    const duty = 1.0e5;
    const res = solveT(mx, H0 + duty, n);
    expect(res.ok && res.value).toBeGreaterThan(298.15);
    if (res.ok) expect(enthalpyFlowAt(mx, n, res.value)).toBeCloseTo(H0 + duty, 4);
  });

  it('fails with a code when the target is outside [50, 3500] K or the flow is zero', () => {
    const n = [1, 0, 0, 0, 0, 0, 0, 0, 0];
    const lo = solveT(mx, enthalpyFlowAt(mx, n, 50) - 1e4, n);
    const hi = solveT(mx, enthalpyFlowAt(mx, n, 3500) + 1e4, n);
    expect(lo.ok).toBe(false);
    expect(hi.ok).toBe(false);
    if (!lo.ok) expect(lo.code).toBe('T_BRACKET');
    const z = solveT(mx, 0, IDS.map(() => 0));
    expect(z.ok).toBe(false);
    if (!z.ok) expect(z.code).toBe('ZERO_FLOW');
  });
});

describe('extrapolation diagnostics', () => {
  it('lists each species whose polynomial range does not cover T, once, as info', () => {
    const d = extrapolationDiags(mx, { n: [1, 1, 1, 1, 1, 1, 1, 1, 1], T: 60, P: 1e5 });
    expect(d.length).toBeGreaterThan(0);
    for (const x of d) { expect(x.code).toBe('PROPERTY_EXTRAPOLATED'); expect(x.severity).toBe('info'); }
    expect(d.map((x) => x.species).sort()).toEqual([...new Set(d.map((x) => x.species))].sort());
    expect(extrapolationDiags(mx, { n: [1, 1, 1, 1, 1, 1, 1, 1, 1], T: 600, P: 1e5 })).toEqual([]);
    // absent species (n = 0) raise nothing
    expect(extrapolationDiags(mx, { n: [1, 0, 0, 0, 0, 0, 0, 0, 0], T: 150, P: 1e5 }).map((x) => x.species)).toEqual([]);
  });
});

