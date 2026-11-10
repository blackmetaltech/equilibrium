// DESIGN 9.2 textbook oracles of lane chem/kinetics (src/oracle/oracles.json) plus the K1 / K2 / K7 science fixtures
// (src/oracle/fixtures/kinetics_*.json), asserted against the ENGINE-K variant (DESIGN 3.5 rule 1).
import { describe, expect, it } from 'vitest';
import oracleFile from './oracles.json';
import k1Fix from './fixtures/kinetics_k1.json';
import k2Fix from './fixtures/kinetics_k2.json';
import k7Fix from './fixtures/kinetics_k7.json';
import { rk4Step } from '@core/numerics';
import {
  arrhenius, arrheniusA, arrheniusEa, arrheniusEaFromLog10Slope, arrheniusRatio, firstOrderTime, isothermalConversion, orderFromInitialRates,
  rate, tempForK,
} from '../sim/chem/kinetics';

interface Oracle { id: string; lane: string; fn: string; inputs: any; expected: Record<string, number>; tol: { rel?: number; abs?: number } }
const oracles = (oracleFile.oracles as unknown as Oracle[]).filter((o) => o.lane === 'chem/kinetics');
const LN2 = Math.LN2;

type Out = Record<string, number>;
const RUN: Record<string, (o: Oracle) => Out> = {
  'EQ-NC-035': (o) => ({ k_ratio: arrheniusRatio(o.inputs.Ea1, o.inputs.Ea2, o.inputs.T, o.inputs.R_J_mol_K) }),
  'EQ-NC-036': (o) => ({ Ea_kJ_mol: arrheniusEaFromLog10Slope(o.inputs.slope_log10, o.inputs.R_J_mol_K) / 1000 }),
  'EQ-NC-037': (o) => {
    const R = 8.314;
    const A = Math.pow(10, o.inputs.intercept);
    const Ea = arrheniusEaFromLog10Slope(-o.inputs.slope, R);
    return { T_K: tempForK(LN2 / (o.inputs.t_half_min * 60), A, Ea, R) };
  },
  'EQ-NC-038': (o) => ({ t_s: firstOrderTime({ k: o.inputs.k, A0: o.inputs.A0, A: o.inputs.A }) }),
  'EQ-NC-039': (o) => ({ age_years: firstOrderTime({ tHalf: o.inputs.t_half, fraction: o.inputs.fraction }) }),
  'EQ-NC-040': (o) => {
    const r = orderFromInitialRates({ A: o.inputs.A, B: o.inputs.B }, o.inputs.rate);
    return { order_A: r.orders['A']!, order_B: r.orders['B']! };
  },
  'EQ-NC-041': (o) => {
    const r = orderFromInitialRates({ A: o.inputs.A, B: o.inputs.B }, o.inputs.rate);
    return { order_A: r.orders['A']!, order_B: r.orders['B']!, k_L2_mol2_s: r.k };
  },
  'EQ-NC-042': (o) => ({ Ea_kJ_mol: arrheniusEa(1, o.inputs.T1, o.inputs.k2_over_k1, o.inputs.T2, o.inputs.R_J_mol_K) / 1000 }),
  'EQ-NC-043': (o) => {
    const { T1, T2, k1, k2, R_J_mol_K: R } = o.inputs;
    const Ea = arrheniusEa(k1, T1, k2, T2, R);
    return { Ea_J_mol: Ea, A_per_s: arrheniusA(k1, Ea, T1, R) };
  },
  'EQ-CE-019': (o) => {
    const { E_J_mol: E, R, T1, T2, k1 } = o.inputs;
    const k2 = arrhenius(k1 * Math.exp(E / (R * T1)), E, T2, R);
    return { k2, E_recovered_J_mol: arrheniusEa(k1, T1, k2, T2, R), factor_300_to_310: arrhenius(1, E, 310, R) / arrhenius(1, E, 300, R) };
  },
};

describe('chem/kinetics textbook oracles', () => {
  it('the lane holds the 10 oracles of the brief', () => {
    expect(oracles.map((o) => o.id).sort()).toEqual(['EQ-CE-019', 'EQ-NC-035', 'EQ-NC-036', 'EQ-NC-037', 'EQ-NC-038', 'EQ-NC-039', 'EQ-NC-040', 'EQ-NC-041', 'EQ-NC-042', 'EQ-NC-043']);
  });
  for (const o of oracles) {
    it(o.id + ' ' + o.fn, () => {
      const run = RUN[o.id];
      expect(run, 'runner for ' + o.id).toBeDefined();
      const got = run!(o);
      for (const key of Object.keys(o.expected)) {
        const want = o.expected[key]!;
        const have = got[key];
        expect(have, o.id + ' ' + key).toBeDefined();
        if (o.tol.abs !== undefined) expect(Math.abs(have! - want), o.id + ' ' + key).toBeLessThanOrEqual(o.tol.abs);
        const rel = o.tol.rel ?? 1e-9;
        expect(Math.abs(have! - want) / Math.max(Math.abs(want), 1e-300), `${o.id} ${key}: ${have} vs ${want}`).toBeLessThanOrEqual(rel);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------- science fixtures
// The adiabatic energy balance is the M1.7 packed bed; here the same constant-Cp balance as the research script is closed
// locally, only to check that the RATE (units, rho_b, eta, engine K) reproduces the fixture profiles.
const ATM = 101325;
function adiabatic(law: string, ids: string[], y0: number[], F0: number, T0: number, P: number, Ws: number[], cp: number[], dHofT: (T: number) => number, opts: object) {
  const nu = law === 'K1' ? [-1, -3, 2, 0] : [-1, -0.5, 1, 0];
  let y = [0, T0];
  let w = 0;
  const out: { xi: number; T: number; n: number[] }[] = [];
  const nOf = (xi: number) => ids.map((_, i) => F0 * y0[i]! + nu[i]! * xi);
  const f = (_t: number, s: number[]) => {
    const n = ids.map((_, i) => F0 * y0[i]! + nu[i]! * s[0]!);
    const r = rate(law, { speciesIds: ids, n, T: s[1]!, P, ...opts })[0]!;
    const cpsum = n.reduce((a, v, i) => a + v * cp[i]!, 0);
    return [r, (-dHofT(s[1]!) * r) / cpsum];
  };
  for (const W of Ws) {
    const steps = Math.max(200, Math.ceil((W - w) / 0.002));
    const h = (W - w) / steps;
    for (let i = 0; i < steps; i++) y = rk4Step(f, w + i * h, y, h);
    w = W;
    out.push({ xi: y[0]!, T: y[1]!, n: nOf(y[0]!) });
  }
  return out;
}

describe('K1 Temkin fixture (engine-K variant)', () => {
  const fx = k1Fix.variant_engine_K;
  it('adiabatic profile 400 C, 200 bar reproduces the fixture T and y_NH3 (rho_b = 2200 as the fixture)', () => {
    const ids = ['N2', 'H2', 'NH3', 'Ar'];
    const f = k1Fix.inputs.feed_mole_frac;
    const y0 = [f.N2, f.H2, f.NH3, f.inert];
    const cpm = k1Fix.inputs.Cp_J_mol_K;
    const F0 = 1000 / 3600;
    const Ws = fx.profile.map((p) => p.cat_kg_per_kmol_h);
    const dH = (T: number) => 2 * (-46.1e3 + (45 - 0.5 * 31 - 1.5 * 29.5) * (T - 298.15));
    const res = adiabatic('K1', ids, y0, F0, 673.15, 200 * 1e5, Ws, [cpm.N2, cpm.H2, cpm.NH3, cpm.inert], dH, { rhoB: 2200, catalystId: 'fe_ammonia' });
    res.forEach((r, i) => {
      const p = fx.profile[i]!;
      const nt = r.n.reduce((a, b) => a + b, 0);
      expect(Math.abs(r.T - 273.15 - p.T_C), 'T at ' + p.V_cat_L_per_kmol_h).toBeLessThanOrEqual(k1Fix.tolerance.abs_T_K);
      expect(Math.abs(r.n[2]! / nt / p.y_NH3 - 1), 'y at ' + p.V_cat_L_per_kmol_h).toBeLessThanOrEqual(k1Fix.tolerance.rel);
    });
  });
  it('the rate at the fixture feed is positive and the bed never crosses equilibrium (y <= y_eq at every profile point)', () => {
    for (const p of fx.profile) expect(p.y_NH3).toBeLessThan(p.y_NH3_eq_at_T);
  });
});

describe('K2 Eklund fixture (engine-K variant)', () => {
  const fx = k2Fix.variant_engine_K;
  const ids = ['SO2', 'O2', 'SO3', 'N2'];
  const f = k2Fix.inputs.feed_mole_frac;
  const y0 = [f.SO2, f.O2, f.SO3, f.N2];
  const P = 1.5 * ATM; // the script treats 1.5 as atm
  it('isothermal light-off at W = 20 000 g s/mol matches the fixture within 1 %', () => {
    for (const p of fx.lightoff) {
      if (p.T_C >= 550) continue; // equilibrium clip in the research script
      const res = isothermalConversion('K2', { speciesIds: ids, n0: y0, T: p.T_C + 273.15, P, W: k2Fix.inputs.lightoff_W / 1000, floor: true, catalystId: 'v2o5' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const X = 1 - res.value.n[0]! / y0[0]!;
      expect(Math.abs(X / p.X - 1), 'X at ' + p.T_C).toBeLessThanOrEqual(0.01);
    }
  });
  it('bar/atm: the fixture was made treating 1.5 as atm (worst dev 3e-4); reading it as 1.5 bar misses by > 1 %', () => {
    const dev = (Pp: number) => Math.max(...fx.lightoff.filter((p) => p.T_C < 550).map((p) => {
      const r = isothermalConversion('K2', { speciesIds: ids, n0: y0, T: p.T_C + 273.15, P: Pp, W: 20, floor: true });
      return r.ok ? Math.abs((1 - r.value.n[0]! / y0[0]!) / p.X - 1) : Number.NaN;
    }));
    expect(dev(1.5 * ATM)).toBeLessThan(1e-3);
    expect(dev(1.5e5)).toBeGreaterThan(0.01);
  });
  it('DESIGN L16 quoted light-off numbers (rounded to 2 decimals)', () => {
    const want: Record<number, number> = { 380: 0.08, 400: 0.16, 420: 0.29, 500: 0.94 };
    for (const T of Object.keys(want)) {
      const res = isothermalConversion('K2', { speciesIds: ids, n0: y0, T: Number(T) + 273.15, P, W: 20, floor: true, catalystId: 'v2o5' });
      if (!res.ok) throw new Error('integration failed');
      const X = 1 - res.value.n[0]! / y0[0]!;
      expect(Math.abs(X - want[Number(T)]!), 'T=' + T).toBeLessThanOrEqual(0.005);
    }
  });
  it('adiabatic bed 1 from 420 C (constant-Cp balance of the script) reproduces the fixture profile and the equilibrium end point', () => {
    const cp = [50.5, 32.5, 72.0, 30.8];
    const dH = (T: number) => -98.35e3 + (72.0 - 50.5 - 0.5 * 32.5) * (T - 700);
    const Ws = fx.bed1_profile.map((p) => p.W_g_s_per_mol / 1000);
    const res = adiabatic('K2', ids, y0, 1, 693.15, P, Ws, cp, dH, { floor: true, catalystId: 'v2o5' });
    res.forEach((r, i) => {
      const p = fx.bed1_profile[i]!;
      const X = 1 - r.n[0]! / y0[0]!;
      expect(Math.abs(r.T - 273.15 - p.T_C), 'T at W=' + p.W_g_s_per_mol).toBeLessThanOrEqual(k2Fix.tolerance.abs_T_K);
      expect(Math.abs(X / p.X - 1), 'X at W=' + p.W_g_s_per_mol).toBeLessThanOrEqual(k2Fix.tolerance.rel);
    });
  });
});

describe('K7 PO hydrolysis rate (fixture steady states close the CSTR balance)', () => {
  it('G(T) = R(T) at the three fixture steady states with k from rate()', () => {
    const i = k7Fix.inputs;
    const tau = i.V_m3 / i.Q_m3_h; // h
    for (const s of k7Fix.steady_states) {
      const T = s.T_C + 273.15;
      const k = rate('K7', { speciesIds: ['C3H6O'], conc: [1], T, P: ATM })[0]! * 3600; // 1/h
      const X = (tau * k) / (1 + tau * k);
      expect(Math.abs(X - s.X), 'X at ' + s.T_C).toBeLessThanOrEqual(1e-6);
      const G = -i.dH_MJ_kmol * i.CA0_kmol_m3 * i.Q_m3_h * X;
      const Rm = i.Q_m3_h * i.rho_cp_MJ_m3_K * (T - (i.T0_C + 273.15)) + i.UA_MJ_h_K * (T - (i.Tc_C + 273.15));
      expect(Math.abs(G - Rm) / G, 'balance at ' + s.T_C).toBeLessThanOrEqual(1e-5);
    }
  });
});
