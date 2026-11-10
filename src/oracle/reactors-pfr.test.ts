// DESIGN 9.2 oracles of lane units/reactors that are plug-flow (design-equation PFR volumes: EQ-CE-015/016/017/018/034/035, only
// their PFR keys; the CSTR keys and the CSTR-only oracles belong to M1.8) and the packed-bed science fixtures: K1 Temkin 400 C /
// 200 bar profile, K2 Eklund bed 1 and light-off (engine-K variants, 1 % / 0.3 K), L15 and L16 numbers, the equilibrium end points.
import { brent } from '@core/numerics';
import { describe, expect, it } from 'vitest';
import oracleFile from './oracles.json';
import k1Fix from './fixtures/kinetics_k1.json';
import k2Fix from './fixtures/kinetics_k2.json';
import { pfrVolume, simpsonTable, simulateBed } from '../sim/units/rx_pfr';
import type { EnergyModel } from '../sim/units/rx_stoich';

interface Oracle { id: string; inputs: any; expected: Record<string, any>; tol: { rel?: number; abs?: number } }
const O = (id: string): Oracle => (oracleFile.oracles as unknown as Oracle[]).find((o) => o.id === id)!;
const near = (have: number, want: number, rel: number, label: string) => expect(Math.abs(have / want - 1), `${label}: ${have} vs ${want}`).toBeLessThanOrEqual(rel);

describe('plug-flow design-equation oracles (PFR keys only)', () => {
  it('EQ-CE-015 / 018: first-order liquid PFR volume (v0 / k) ln(1 / (1 - X))', () => {
    for (const [id, key] of [['EQ-CE-015', 'V_PFR_L'], ['EQ-CE-018', 'V_PFR_L']] as const) {
      const o = O(id), i = o.inputs;
      const k = i.k_per_min ?? i.k, v0 = i.v0_L_min ?? i.v0, CA0 = i.CA0 ?? 1, FA0 = CA0 * v0;
      const V = pfrVolume((X) => FA0 / (k * CA0 * (1 - X)), 0, i.X, 2000);
      near(V, o.expected[key] as number, o.tol.rel!, id);
    }
  });
  it('EQ-CE-016: gas-phase A -> 2B PFR with volume change, numerical integration (also eps = 0 reference)', () => {
    const o = O('EQ-CE-016'), i = o.inputs, FA0 = i.CA0 * i.v0;
    const V = (eps: number) => pfrVolume((X) => FA0 / ((i.k * i.CA0 * i.CA0 * (1 - X) * (1 - X)) / ((1 + eps * X) * (1 + eps * X))), 0, i.X, 2000);
    near(V(i.eps), o.expected.V_L as number, o.tol.rel!, 'V_L');
    near(V(i.eps), o.expected.V_analytic_L as number, o.tol.rel!, 'V_analytic_L');
    near(V(0), o.expected.V_if_eps_zero_L as number, o.tol.rel!, 'V_if_eps_zero_L');
  });
  it('EQ-CE-017: the PFR part after a CSTR to X = 0.4: analytic and Simpson on the table at X = 0.4 ... 0.8 only (55.0 L, not the 0-0.8 span)', () => {
    const o = O('EQ-CE-017'), i = o.inputs;
    const v0 = i.FA0 / i.CA0;
    near(pfrVolume((X) => v0 / (i.k * (1 - X)), i.X_cstr, i.X_final, 2000), o.expected.V_PFR_analytic_L as number, o.tol.rel!, 'analytic');
    const tab: number[] = i.table_FA0_over_rA_L, X: number[] = i.table_X;
    const from = X.findIndex((x: number) => Math.abs(x - i.simpson_span_X[0]) < 1e-9);
    const y = tab.slice(from);
    expect(y).toHaveLength(5);
    near(simpsonTable(y, 0.1), o.expected.V_PFR_simpson_L as number, o.tol.rel!, 'simpson');
    // the 0-0.8 span would be about 80.5 L: the oracle statement warns against it
    near(simpsonTable(tab, 0.1), 80.47, 0.01, 'whole table');
  });
  it('EQ-CE-034: PFR conversion for the same total space time (k tau = 2 -> 1 - e^-2)', () => {
    const o = O('EQ-CE-034');
    const tau = o.inputs.n * o.inputs.k_tau_each; // k tau
    const X = brent((x) => pfrVolume((z) => 1 / (1 - z), 0, x, 2000) - tau, 0, 0.999999, { tol: 1e-13, maxIter: 200 }).x;
    near(X, o.expected.X_PFR_same_total_tau as number, o.tol.rel!, 'X_PFR');
  });
  it('EQ-CE-035: second-order PFR space time k CA0 tau = X / (1 - X) = 1 at X = 0.5', () => {
    const o = O('EQ-CE-035');
    near(pfrVolume((X) => 1 / ((1 - X) * (1 - X)), 0, o.inputs.X, 2000), o.expected.tau_PFR_kCA0 as number, o.tol.rel!, 'tau_PFR');
  });
});

/** Constant-Cp energy model of the research scripts: H = sum n (hf + cp (T - Tref)). */
function constCp(ids: string[], cp: number[], hf: number[], Tref: number): EnergyModel {
  const c = (n: readonly number[]) => n.reduce((s, v, i) => s + v * cp[i]!, 0);
  return {
    H: (n, T) => n.reduce((s, v, i) => s + v * (hf[i]! + cp[i]! * (T - Tref)), 0),
    cp: (n) => c(n),
    dH: (nu, T) => Object.keys(nu).reduce((s, id) => { const i = ids.indexOf(id); return s + nu[id]! * (hf[i]! + cp[i]! * (T - Tref)); }, 0),
    solveT: (Ht, n) => ({ ok: true, value: Tref + (Ht - n.reduce((s, v, i) => s + v * hf[i]!, 0)) / c(n), diag: [] }),
  };
}

describe('K1 Temkin-Pyzhev adiabatic bed, 400 C / 200 bar (fixture, engine-K variant)', () => {
  const ids = ['N2', 'H2', 'NH3', 'Ar'];
  const f = k1Fix.inputs.feed_mole_frac, F0 = 1000 / 3600;
  const n0 = [f.N2 * F0, f.H2 * F0, f.NH3 * F0, f.inert * F0];
  const cpm = k1Fix.inputs.Cp_J_mol_K;
  const model = constCp(ids, [cpm.N2, cpm.H2, cpm.NH3, cpm.inert], [0, 0, -46.1e3, 0], 298.15);
  const fx = k1Fix.variant_engine_K;
  const bed = (W: number, m?: EnergyModel, rhoB = 2200) => {
    const r = simulateBed({ species: ids, inlet: { n: n0, T: 673.15, P: 200e5 }, lawId: 'K1', catalystId: 'fe_ammonia', W, mode: 'adiabatic', rhoB, model: m });
    if (!r.ok) throw new Error(r.code);
    return r.value;
  };
  const yNH3 = (n: number[]) => n[2]! / n.reduce((a, b) => a + b, 0);
  it('with the script\'s constant-Cp balance the five profile points match within 0.3 K and 1 % (rate, rho_b, K, bed integrator)', () => {
    for (const p of fx.profile) {
      const v = bed(p.cat_kg_per_kmol_h, model);
      expect(Math.abs(v.out.T - 273.15 - p.T_C), 'T at ' + p.V_cat_L_per_kmol_h).toBeLessThanOrEqual(k1Fix.tolerance.abs_T_K);
      near(yNH3(v.out.n), p.y_NH3, k1Fix.tolerance.rel, 'y at ' + p.V_cat_L_per_kmol_h);
      expect(v.evals, 'evals ' + p.V_cat_L_per_kmol_h).toBeLessThanOrEqual(400);
    }
  });
  it('the constant-Cp bed never crosses equilibrium and its energy ledger closes (profile Q/K stays on one side)', () => {
    const v = bed(2.2, model);
    expect(v.profile.QK.every((q) => q <= 1e-9)).toBe(true);
    expect(Math.abs(v.info.Tclose!)).toBeLessThan(1e-3);
  });
  it('REPORTED GAP: with the engine\'s full NIST thermo the same bed runs a few K different (constant Cp vs Shomate), pinned', () => {
    const rows = fx.profile.map((p) => { const v = bed(p.cat_kg_per_kmol_h); return { dT: v.out.T - 273.15 - p.T_C, dy: yNH3(v.out.n) / p.y_NH3 - 1 }; });
    const worstT = Math.max(...rows.map((r) => Math.abs(r.dT))), worstY = Math.max(...rows.map((r) => Math.abs(r.dy)));
    // observed: dT 0.5 / 1.0 / 2.1 / 2.8 / 1.0 K along the five points, dy 0.09 / 0.27 / 0.69 / 0.86 / -0.16 % (inside the 1 % band, over the 0.3 K one)
    expect(worstT).toBeGreaterThan(k1Fix.tolerance.abs_T_K);
    expect(worstT).toBeLessThan(4);
    expect(worstY).toBeLessThan(k1Fix.tolerance.rel);
  });
  it('ample catalyst reaches the engine equilibrium at the fixture end point (11.9 mol %, 540.7 C engine-K variant) within 1 K / 0.1 mol %', () => {
    const v = bed(50);
    expect(Math.abs(v.out.T - 273.15 - fx.outlet.T_C)).toBeLessThan(1);
    expect(Math.abs(yNH3(v.out.n) - fx.outlet.y_NH3)).toBeLessThan(1e-3);
    expect(v.info.eta).toBeGreaterThan(0.99999); expect(v.info.eta).toBeLessThan(1.00001);
    expect(v.evals).toBeLessThanOrEqual(400);
  });
  it('L15 hook numbers (catalogue rho_b = 2500, 400 C inlet, 0.8 L per kmol/h): engine vs the constant-Cp literature-K script, reported not tuned', () => {
    const v = bed(0.8 * 2.5, undefined, 2500);
    const y = yNH3(v.out.n) * 100, T = v.out.T - 273.15;
    // script (DESIGN L15): 10.1 % at ~513 C. Engine: higher conversion and a hotter exit because engine K(R1) is ~14-18 % above the
    // Gillespie-Beattie fit the script uses and full Cp is lower than the script's constants.
    expect(y).toBeGreaterThan(10.0); expect(y).toBeLessThan(11.5);
    expect(T).toBeGreaterThan(505); expect(T).toBeLessThan(535);
  });
  it('L15 interior optimum: outlet NH3 versus inlet T has a maximum strictly inside 360-460 C at the fixed load (2.0 kg per kmol/h)', () => {
    const ys = [360, 380, 400, 420, 440, 460].map((Tc) => {
      const r = simulateBed({ species: ids, inlet: { n: n0, T: Tc + 273.15, P: 200e5 }, lawId: 'K1', catalystId: 'fe_ammonia', W: 2.0, mode: 'adiabatic', rhoB: 2500 });
      if (!r.ok) throw new Error(r.code);
      return yNH3(r.value.out.n);
    });
    const iMax = ys.indexOf(Math.max(...ys));
    expect(iMax).toBeGreaterThan(0); expect(iMax).toBeLessThan(ys.length - 1);
    expect(ys[0]!).toBeLessThan(ys[2]!); // a cold inlet makes less (engine: 7.2 % at 360 C vs 10.9 % at 400 C: slow, not asleep)
  });
});

describe('K2 Eklund adiabatic bed and isothermal light-off (fixture, engine-K variant)', () => {
  const ids = ['SO2', 'O2', 'SO3', 'N2'];
  const f = k2Fix.inputs.feed_mole_frac;
  const n0 = [f.SO2, f.O2, f.SO3, f.N2];
  const P = 1.5 * 101325; // the script treats 1.5 as atm
  const fx = k2Fix.variant_engine_K;
  const model = constCp(ids, [50.5, 32.5, 72.0, 30.8], [0, 0, -98.35e3, 0], 700);
  it('bed 1 from 420 C with the script\'s constant-Cp balance: six profile points within 0.3 K and 1 %', () => {
    for (const p of fx.bed1_profile) {
      const r = simulateBed({ species: ids, inlet: { n: n0, T: 693.15, P }, lawId: 'K2', catalystId: 'v2o5', W: p.W_g_s_per_mol / 1000, mode: 'adiabatic', model });
      if (!r.ok) throw new Error(r.code);
      expect(Math.abs(r.value.out.T - 273.15 - p.T_C), 'T at W=' + p.W_g_s_per_mol).toBeLessThanOrEqual(k2Fix.tolerance.abs_T_K);
      near(r.value.X, p.X, k2Fix.tolerance.rel, 'X at W=' + p.W_g_s_per_mol);
      expect(r.value.evals).toBeLessThanOrEqual(400);
    }
  });
  it('isothermal light-off at W = 20 kg per mol/s: X within 1 % of the fixture at 360-550 C (L16: 0.08 / 0.16 / 0.29 / 0.94 at 380 / 400 / 420 / 500)', () => {
    for (const p of fx.lightoff) {
      const r = simulateBed({ species: ids, inlet: { n: n0, T: 300, P }, lawId: 'K2', catalystId: 'v2o5', W: k2Fix.inputs.lightoff_W / 1000, mode: 'isothermal', T: p.T_C + 273.15 });
      if (!r.ok) throw new Error(r.code);
      near(r.value.X, p.X, 0.01, 'X at ' + p.T_C);
      expect(r.value.evals, 'evals at ' + p.T_C).toBeLessThanOrEqual(400);
      expect(r.value.out.T).toBe(p.T_C + 273.15);
    }
  });
  it('adiabatic bed with ample catalyst ends on the equilibrium curve at the full-thermo end point of the fixture (1.5 bar, 420 C: 624.23 C, 0.7029)', () => {
    const e = k2Fix.equilibrium_endpoint_full_thermo;
    const r = simulateBed({ species: ids, inlet: { n: n0, T: e.Tin_C + 273.15, P: e.P_bar * 1e5 }, lawId: 'K2', catalystId: 'v2o5', W: 100, mode: 'adiabatic' });
    if (!r.ok) throw new Error(r.code);
    expect(Math.abs(r.value.out.T - 273.15 - e.T_C)).toBeLessThanOrEqual(k2Fix.tolerance.abs_T_K);
    expect(Math.abs(r.value.X - e.X)).toBeLessThanOrEqual(1e-3);
    expect(r.value.info.eta).toBeGreaterThan(0.9999); expect(Math.abs(r.value.info.QK_out!)).toBeLessThan(1e-4);
    expect(r.value.evals).toBeLessThanOrEqual(400);
  });
});
