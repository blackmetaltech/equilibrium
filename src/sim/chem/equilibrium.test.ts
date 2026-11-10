// Unit tests of the extent equilibrium solver (DESIGN 3.4): closed forms, edge cases, modes, the Equilibrium Window curve.
import { describe, expect, it } from 'vitest';
import { eqCurve, qOverK, solveEquilibrium, type EqSpec } from './equilibrium';
import { REACTOR_SETS } from '../../data/reactions';

const BAR = 1e5;
const ok = <T>(r: any): T => {
  expect(r.ok, r.code).toBe(true);
  return r.value as T;
};

describe('single reaction (Brent on the feasible bracket)', () => {
  it('A <=> 2B closed form', () => {
    // K = (2x)^2 / (1-x) / (1+x) ... isobaric at P = 1 bar: y_B^2 / y_A with n_tot = 1 + x
    const K = 0.7;
    const r = ok<any>(solveEquilibrium({ species: ['A', 'B'], n0: [1, 0], T: 400, P: BAR, reactions: [{ A: -1, B: 2 }], detail: 'book', book: { K } }));
    const x = r.xi[0];
    const lhs = ((2 * x) * (2 * x)) / ((1 + x) * (1 - x));
    expect(lhs).toBeCloseTo(K, 10);
    expect(r.method).toBe('brent');
    expect(Math.abs(r.lnQminusLnK[0])).toBeLessThan(1e-10);
  });
  it('catalogue id R1 at 450 C, 150 bar (rigorous) is in the Haber window', () => {
    const r = ok<any>(solveEquilibrium({ species: ['N2', 'H2', 'NH3'], n0: [1, 3, 0], T: 723.15, P: 150 * BAR, reactions: ['R1'], detail: 'rigorous' }));
    const y = r.n[2] / (r.n[0] + r.n[1] + r.n[2]);
    expect(y).toBeGreaterThan(0.15);
    expect(y).toBeLessThan(0.3);
  });
  it('reactant absent: no reaction and a NO_REACTANT info diag', () => {
    const res = solveEquilibrium({ species: ['N2', 'H2', 'NH3'], n0: [0, 3, 0], T: 700, P: 100 * BAR, reactions: ['R1'], detail: 'rigorous' });
    const r = ok<any>(res);
    expect(r.xi[0]).toBe(0);
    expect(r.n).toEqual([0, 3, 0]);
    expect((res as any).diag.some((d: any) => d.code === 'NO_REACTANT')).toBe(true);
  });
  it('product only: the reaction runs backwards', () => {
    const r = ok<any>(solveEquilibrium({ species: ['N2', 'H2', 'NH3'], n0: [0, 0, 2], T: 700, P: 100 * BAR, reactions: ['R1'], detail: 'rigorous' }));
    expect(r.xi[0]).toBeLessThan(0);
    expect(Math.abs(r.lnQminusLnK[0])).toBeLessThan(1e-10);
  });
  it('huge K with the product absent stays in log space', () => {
    const r = ok<any>(solveEquilibrium({ species: ['A', 'B'], n0: [1, 0], T: 400, P: BAR, reactions: [{ A: -1, B: 1 }], detail: 'book', book: { lnK: 69 } }));
    expect(r.n[0]).toBeGreaterThan(0);
    expect(r.n[0]).toBeLessThan(1e-29);
    expect(Math.abs(r.lnQminusLnK[0])).toBeLessThan(1e-10);
  });
  it('a condensed phase has a = 1 and does not enter Q', () => {
    // C(s) + CO2 <=> 2 CO: with the solid in excess, K = y_CO^2 P / y_CO2
    const r = ok<any>(solveEquilibrium({ species: ['C', 'CO2', 'CO'], n0: [5, 1, 0], T: 1000, P: BAR, reactions: [{ C: -1, CO2: -1, CO: 2 }], detail: 'book', book: { K: 2 }, condensed: ['C'] }));
    const ng = r.n[1] + r.n[2];
    expect(((r.n[2] / ng) ** 2) / (r.n[1] / ng)).toBeCloseTo(2, 9);
  });
  it('failure paths are coded', () => {
    expect(solveEquilibrium({ species: ['A'], n0: [1], T: 400, P: BAR, reactions: ['NOPE'], detail: 'book' }).ok).toBe(false);
    expect(solveEquilibrium({ species: ['A'], n0: [1], T: -1, P: BAR, reactions: [], detail: 'book' }).ok).toBe(false);
  });
});

describe('modes', () => {
  it('constant volume N2O4 reports the vessel pressure', () => {
    const spec: EqSpec = { species: ['N2O4', 'NO2'], n0: [0.15, 0], T: 400, V: 1e-3, R: 8.31446, mode: 'constV', reactions: [{ N2O4: -1, NO2: 2 }], detail: 'rigorous' };
    const r = ok<any>(solveEquilibrium(spec));
    expect(r.P / BAR).toBeGreaterThan(0.15 * 0.0831446 * 400);
    expect(Math.abs(r.lnQminusLnK[0])).toBeLessThan(1e-10);
  });
  it('adiabatic SO2 bed: exothermic, T_out above T_in, on the equilibrium curve', () => {
    const r = ok<any>(solveEquilibrium({ species: ['SO2', 'O2', 'SO3', 'N2'], n0: [10, 11, 0, 79], T: 683.15, P: 1.2 * BAR, reactions: ['R2'], detail: 'rigorous', mode: 'adiabatic' }));
    expect(r.T).toBeGreaterThan(683.15 + 100);
    expect(Math.abs(r.lnQminusLnK[0])).toBeLessThan(1e-9);
    expect(Math.abs(r.duty)).toBeLessThan(1e-3 * 10e3); // adiabatic: H_out = H_in to the Brent tolerance
  });
  it('isothermal duty is H_out - H_in (exothermic < 0)', () => {
    const r = ok<any>(solveEquilibrium({ species: ['N2', 'H2', 'NH3'], n0: [1, 3, 0], T: 700, P: 100 * BAR, reactions: ['R1'], detail: 'rigorous' }));
    expect(r.duty).toBeLessThan(0);
  });
  it('qOverK is the log10 of Q/K, zero at equilibrium', () => {
    const base = { species: ['N2', 'H2', 'NH3'], T: 700, P: 100 * BAR, reactions: ['R1'], detail: 'rigorous' as const };
    const r = ok<any>(solveEquilibrium({ ...base, n0: [1, 3, 0] }));
    expect(Math.abs(ok<number[]>(qOverK({ ...base, n0: r.n }))[0]!)).toBeLessThan(1e-10);
    expect(ok<number[]>(qOverK({ ...base, n0: [1, 3, 0.0001] }))[0]!).toBeLessThan(0);
    expect(ok<number[]>(qOverK({ ...base, n0: [1, 3, 5] }))[0]!).toBeGreaterThan(0);
  });
});

describe('multiple reactions (damped Newton)', () => {
  it('methanol set R4 + R5 satisfies both residuals', () => {
    const sp = ['CO2', 'H2', 'CH3OH', 'H2O', 'CO'];
    const r = ok<any>(solveEquilibrium({ species: sp, n0: [1, 3, 0, 0, 0.1], T: 520, P: 50 * BAR, reactions: [...REACTOR_SETS['methanol']!], detail: 'rigorous' }));
    for (const v of r.lnQminusLnK) expect(Math.abs(v)).toBeLessThan(1e-9);
    expect(r.method).toBe('newton');
    expect(r.n.every((v: number) => v >= 0)).toBe(true);
  });
  it('steam reforming set R6 + R5', () => {
    const sp = ['CH4', 'H2O', 'CO', 'CO2', 'H2'];
    const r = ok<any>(solveEquilibrium({ species: sp, n0: [1, 3, 0, 0, 0], T: 1100, P: 20 * BAR, reactions: [...REACTOR_SETS['smr']!], detail: 'rigorous' }));
    for (const v of r.lnQminusLnK) expect(Math.abs(v)).toBeLessThan(1e-9);
    expect(r.n[0]).toBeGreaterThan(0.1);
    expect(r.n[0]).toBeLessThan(0.4);
  });
});

describe('eqCurve (Equilibrium Window)', () => {
  const grid = Array.from({ length: 120 }, (_, i) => 500 + (i * 500) / 119);
  const feed = { species: ['N2', 'H2', 'NH3'], n0: [1, 3, 0], P: 150 * BAR, reactions: ['R1'], detail: 'rigorous' as const };
  it('X_eq(T) falls with T for an exothermic reaction', () => {
    const c = ok<any>(eqCurve(feed, grid));
    expect(c.ref).toBe('N2');
    for (let i = 1; i < c.X.length; i++) expect(c.X[i]).toBeLessThan(c.X[i - 1]);
  });
  it('120 points on the Haber feed (timing reported)', () => {
    eqCurve(feed, grid);
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) eqCurve(feed, grid);
    const ms = (performance.now() - t0) / 5;
    console.log(`eqCurve 120 points Haber: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(100);
  });
});
