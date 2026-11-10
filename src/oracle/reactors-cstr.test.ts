// DESIGN 9.2 oracles of lane units/reactors that are CSTR / batch: EQ-CE-015/018/033/034/035 (CSTR design keys), EQ-CE-021/022
// (multiple steady states, ignition / extinction), EQ-CE-023 (adiabatic batch runaway), EQ-CE-024 (Semenov), L18 rig numbers.
import { describe, expect, it } from 'vitest';
import oracleFile from './oracles.json';
import { cstrCritical, cstrSteadyStates, cstrVolume, semenovCritical } from '../sim/units/rx_cstr';
import { cstrStep } from '../sim/dynamics/reactorODE';
import { integrateUntil } from '../sim/units/rx_batch';
import { pfrVolume } from '../sim/units/rx_pfr';
import type { CstrInputs, CstrModel } from '../sim/dynamics/reactorODE';

interface Oracle { id: string; inputs: any; expected: Record<string, any>; tol: { rel?: number; abs?: number } }
const O = (id: string): Oracle => (oracleFile.oracles as unknown as Oracle[]).find((o) => o.id === id)!;
const near = (have: number, want: number, rel: number, label: string) => expect(Math.abs(have / want - 1), `${label}: ${have} vs ${want}`).toBeLessThanOrEqual(rel);

describe('CSTR design equations', () => {
  it('EQ-CE-015: first-order CSTR volume for X = 0.8 (200 L) and the ratio to the PFR (2.485)', () => {
    const o = O('EQ-CE-015'), i = o.inputs, FA0 = i.CA0 * i.v0_L_min;
    const V = cstrVolume((X) => FA0 / (i.k_per_min * i.CA0 * (1 - X)), i.X);
    near(V, o.expected.V_CSTR_L as number, o.tol.rel!, 'V_CSTR');
    near(V / pfrVolume((X) => FA0 / (i.k_per_min * i.CA0 * (1 - X)), 0, i.X, 2000), o.expected.ratio as number, o.tol.rel!, 'ratio');
  });
  it('EQ-CE-015 through the dynamic model: the isothermal CSTR relaxes to X = 0.8 at V = 200 L', () => {
    const k = 0.2; // 1/min, time in minutes
    const m: CstrModel = { V: 0.2, rhoCp: 1, dH: 0, nu: [-1, 1], key: 0, k: () => k };
    const u: CstrInputs = { C0: [1000, 0], T0: 300, Q: 0.01, UA: 0, Tc: 300 };
    let s = { C: [1000, 0], T: 300, Tj: 300 };
    for (let i = 0; i < 4000; i++) s = cstrStep(m, s, u, 0.1);
    near(1 - s.C[0]! / 1000, 0.8, 1e-6, 'X');
  });
  it('EQ-CE-017 / 018: the CSTR first stage (33.33 L at X = 0.4) and two equal stages (108.11 L each, 450 L single)', () => {
    const o17 = O('EQ-CE-017'), i17 = o17.inputs;
    near(cstrVolume((X) => (i17.v0 ?? i17.FA0 / i17.CA0) / (i17.k * (1 - X)), i17.X_cstr), o17.expected.V_CSTR_L as number, o17.tol.rel!, 'CE-017');
    const o = O('EQ-CE-018'), i = o.inputs;
    near(cstrVolume((X) => i.v0 / (i.k * (1 - X)), i.X), o.expected.V_single_CSTR_L as number, o.tol.rel!, 'single');
    const X1 = o.expected.X_after_first as number;
    const V1 = cstrVolume((X) => i.v0 / (i.k * (1 - X)), X1);
    near(V1, o.expected.V_each_L as number, o.tol.rel!, 'each');
    // second stage works between X1 and 0.9 on a CSTR: V2 = v0 (X - X1) / (k (1 - X))
    near((i.v0 * (i.X - X1)) / (i.k * (1 - i.X)), o.expected.V_each_L as number, o.tol.rel!, 'second');
  });
  it('EQ-CE-033: CSTR / PFR volume ratio 3.9087 at X = 0.9', () => {
    const o = O('EQ-CE-033');
    const f = (X: number) => 1 / (1 - X);
    near(cstrVolume(f, o.inputs.X) / pfrVolume(f, 0, o.inputs.X, 4000), o.expected.ratio as number, o.tol.rel!, 'ratio');
  });
  it('EQ-CE-034: two equal CSTRs with k tau = 1 each reach X = 0.75 (single CSTR 2/3)', () => {
    const o = O('EQ-CE-034');
    const kt = o.inputs.k_tau_each;
    const stage = (X: number) => 1 - (1 - X) / (1 + kt);
    near(stage(stage(0)), o.expected.X_overall as number, o.tol.rel!, 'X_overall');
    near(1 - 1 / (1 + 2 * kt), o.expected.X_single_CSTR_same_total_tau as number, o.tol.rel!, 'X_single');
  });
  it('EQ-CE-035: second-order CSTR space time k CA0 tau = X / (1 - X)^2 = 2 at X = 0.5, ratio 2', () => {
    const o = O('EQ-CE-035');
    const c = cstrVolume((X) => 1 / ((1 - X) * (1 - X)), o.inputs.X);
    near(c, o.expected.tau_CSTR_kCA0 as number, o.tol.rel!, 'tau_CSTR');
    near(c / pfrVolume((X) => 1 / ((1 - X) * (1 - X)), 0, o.inputs.X, 2000), o.expected.ratio as number, o.tol.rel!, 'ratio');
  });
});

/** The Fogler-style liquid CSTR of EQ-CE-021 / 022 in the engine's CSTR model (time in minutes; per mol A fed, CA0 = 1, Q = 1). */
function ce021() {
  const o = O('EQ-CE-021'), i = o.inputs;
  const k = (T: number) => i.k350 * Math.exp(-(i.E_cal / i.Rcal) * (1 / T - 1 / 350));
  const model: CstrModel = { V: i.tau, rhoCp: i.CpSum, dH: i.dH_cal, nu: [-1, 1], key: 0, k };
  const inputs: CstrInputs = { C0: [1, 0], T0: i.T0, Q: 1, UA: i.kappa * i.CpSum, Tc: i.Ta };
  return { o, model, inputs };
}
describe('multiple steady states (L24 teaching oracles)', () => {
  it('EQ-CE-021: three steady states 300.10 / 345.54 / 424.94 K, X 0.00077 / 0.364 / 0.9995, stable / unstable / stable (0.2 %)', () => {
    const { o, model, inputs } = ce021();
    const r = cstrSteadyStates(model, inputs);
    expect(r.states).toHaveLength(3);
    const want = o.expected.T_K as number[], X = o.expected.X as number[];
    r.states.forEach((s, j) => { near(s.T, want[j]!, o.tol.rel!, 'T' + j); near(s.X, X[j]!, 1e-3, 'X' + j); });
    expect(r.states.map((s) => (s.stable ? 'stable' : 'unstable'))).toEqual(o.expected.stability);
  });
  it('EQ-CE-022: ignition Tc 321.51 K, extinction Tc 256.01 K, tangent temperatures 329.16 / 371.10 K, 3 roots between, 1 outside (0.3 %)', () => {
    const { model, inputs } = ce021();
    const e = O('EQ-CE-022').expected;
    const c = cstrCritical(model, inputs, 'both');
    const ign = c.find((x) => x.kind === 'ignition')!, ext = c.find((x) => x.kind === 'extinction')!;
    near(ign.Tc, e.Tc_ignition as number, 0.003, 'Tc_ign'); near(ext.Tc, e.Tc_extinction as number, 0.003, 'Tc_ext');
    near(ign.T, e.T_low_branch_at_ignition as number, 0.003, 'T_ign'); near(ext.T, e.T_high_branch_at_extinction as number, 0.003, 'T_ext');
    const n = (Tc: number) => cstrSteadyStates(model, { ...inputs, Tc, T0: Tc }).states.length;
    expect(n(300)).toBe(e.n_roots_mid);
    expect(n(ext.Tc - 2)).toBe(e['n_roots_Tc_ext-2K']);
    expect(n(ign.Tc + 2)).toBe(e['n_roots_Tc_ign+2K']);
  });
});

describe('runaway oracles (batch / vessel)', () => {
  it('EQ-CE-023: adiabatic first-order batch: t(X = 0.5) 201.05 s, t(X = 0.99) 262.68 s, max rate 0.01142 1/s at 229.2 s, T_final 549 K (0.5 %)', () => {
    const o = O('EQ-CE-023'), i = o.inputs, e = o.expected;
    const kT = (T: number) => i.k0 * Math.exp((i.E_J_mol / i.R_J_mol_K) * (1 / i.T0_K - 1 / T));
    const f = (_t: number, y: number[]) => [kT(i.T0_K + i.dTad * y[0]!) * (1 - y[0]!)];
    const hit = (X: number) => integrateUntil(f, [0], 2000, (y) => y[0]! - X);
    near(hit(0.5).t, e.t_X50_s as number, o.tol.rel!, 't50');
    near(hit(0.99).t, e.t_X99_s as number, o.tol.rel!, 't99');
    const rate = (y: number[]) => f(0, y)[0]!;
    // maximum rate: the rate's own time derivative changes sign (central difference on the right-hand side)
    const ddt = (y: number[]) => { const h = 1e-6, y1 = [y[0]! + h], y0 = [y[0]! - h]; return (rate(y1) - rate(y0)) / (2 * h); };
    const mx = integrateUntil(f, [0], 2000, (y) => ddt(y));
    near(mx.t, e.t_max_rate_s as number, o.tol.rel!, 't_max'); near(rate(mx.y), e.max_rate_per_s as number, o.tol.rel!, 'rate_max');
    near(mx.y[0]!, e.X_at_max_rate as number, o.tol.rel!, 'X_max');
    // T_final_K = 549 K is the temperature at the X = 0.99 end point (T0 + 0.99 dTad); full conversion would be T0 + dTad = 550 K
    near(i.T0_K + i.dTad * 0.99, e.T_final_K as number, 1e-12, 'T_final');
    near(i.T0_K + i.dTad * hit(0.99).y[0]!, e.T_final_K as number, 1e-6, 'T at X99 from the integration');
    near(Math.log(2) / i.k0, e.t50_isothermal_s as number, o.tol.rel!, 'isothermal t50');
  });
  it('EQ-CE-024: Semenov tangency: Ta_crit 397.97 K, vessel 415.95 K, dT 17.98 K; the approximation R Ta^2/E = 16.46 K is reported, not asserted equal', () => {
    const o = O('EQ-CE-024'), i = o.inputs, e = o.expected;
    const r = semenovCritical({ g0: i.g0_W, E: i.E_J_mol, R: i.R, hS: i.hS_W_K });
    near(r.Ta, e.Ta_crit_K as number, o.tol.rel!, 'Ta'); near(r.T, e.T_vessel_at_crit_K as number, o.tol.rel!, 'T');
    near(r.dT, e.dT_crit_K as number, o.tol.rel!, 'dT');
    near(r.dTapprox, e.dT_semenov_approx_K as number, 0.002, 'approx');
    expect(Math.abs(r.dT - r.dTapprox)).toBeGreaterThan(1);
    expect(r.all).toHaveLength(1);
  });
});
