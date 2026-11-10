// DESIGN 9.2 oracles of lane units/energy (EQ-CE-011 ... EQ-CE-014, Felder style reactive energy balances) run through the
// stoichiometric reactor core with the problem's OWN Cp polynomials and heats of formation (the oracle's `assumptions` demand
// the identical coefficients), plus the engine-thermo variants: burner T_ad fixture (10 % SO2 -> 931.4 C) and the gap between the
// Felder polynomials and the NIST-JANAF Shomate data, reported and pinned, not tuned.
import { brent } from '@core/numerics';
import { describe, expect, it } from 'vitest';
import oracleFile from './oracles.json';
import burnerFix from './fixtures/sulfur_burner.json';
import { reactionOf } from '../data/reactions';
import { type EnergyModel, reactStoich, stoichReactor } from '../sim/units/rx_stoich';
import { mixer } from '../sim/units/mixer';
import type { Nu } from '../sim/chem/stoich';
import type { SimCtx, UnitInst } from '../sim/types';

interface Oracle { id: string; inputs: any; expected: any; tol: { rel?: number; abs?: number } }
const O = (id: string): Oracle => (oracleFile.oracles as unknown as Oracle[]).find((o) => o.id === id)!;
const K0 = 273.15;

/** Felder model: cp(T_C) = a + b T + c T^2 + d T^3 kJ/(mol C), formation basis at 25 C. Units J, K. */
function felder(poly: Record<string, number[]>, dHf: Record<string, number>, species: string[]): EnergyModel {
  const hOne = (id: string, T: number): number => {
    const [a, b, c, d] = poly[id]!, t = T - K0;
    const integ = (x: number) => a! * x + (b! * x * x) / 2 + (c! * x ** 3) / 3 + (d! * x ** 4) / 4;
    return 1000 * (dHf[id]! + integ(t) - integ(25));
  };
  const cpOne = (id: string, T: number): number => { const [a, b, c, d] = poly[id]!, t = T - K0; return 1000 * (a! + b! * t + c! * t * t + d! * t ** 3); };
  const H = (n: readonly number[], T: number): number => n.reduce((s, v, i) => s + v * hOne(species[i]!, T), 0);
  return {
    H, cp: (n, T) => n.reduce((s, v, i) => s + v * cpOne(species[i]!, T), 0),
    dH: (nu: Nu, T) => Object.keys(nu).reduce((s, id) => s + nu[id]! * hOne(id, T), 0),
    solveT: (Ht, n) => {
      const r = brent((T) => H(n, T) - Ht, 200, 5000, { tol: 1e-12, maxIter: 300 });
      return r.converged ? { ok: true, value: r.x, diag: [] } : { ok: false, code: 'NO_CONVERGE', data: {}, diag: [] };
    },
  };
}
const SP = ['CH4', 'O2', 'N2', 'CO2', 'H2O', 'CO', 'H2', 'CH3OH'];
const fx = (id: string) => { const o = O(id); return felder(o.inputs.cp_poly ?? o.inputs.cp_poly_kJ_per_mol_C, o.inputs.dHf ?? o.inputs.dHf_kJ_mol, SP); };
const vec = (m: Record<string, number>) => SP.map((s) => m[s] ?? 0);
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const nuCH4 = reactionOf('R13').nu;
const air = (o2: number) => ({ O2: o2, N2: (o2 * 79) / 21 });

describe('EQ-CE-011 adiabatic flame temperature (Felder data)', () => {
  const o = O('EQ-CE-011');
  it('CH4 with 25 % excess air at 25 C: T_ad within 1 K, product moles exact', () => {
    const feed = vec({ CH4: 1, ...air(2 * 1.25) });
    const r = reactStoich({ species: SP, n0: feed, Tin: 25 + K0, nus: [nuCH4], keys: ['CH4'], X: [1], mode: 'adiabatic', onLimit: 'fail' }, fx('EQ-CE-011'));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(Math.abs(r.value.T - K0 - o.expected.T_adiabatic_C)).toBeLessThanOrEqual(o.tol.abs!);
    SP.forEach((s, i) => { const want = o.expected.product_moles[s] ?? 0; expect(Math.abs(r.value.n[i]! - want), s).toBeLessThan(1e-9); });
    expect(r.value.duty).toBeCloseTo(0, 6);
  });
  it('dHc of CH4 (to vapour water) is -802.31 kJ/mol at 25 C: duty of the isothermal reactor per extent', () => {
    const m = fx('EQ-CE-011');
    const r = reactStoich({ species: SP, n0: vec({ CH4: 1, O2: 2 }), Tin: 25 + K0, nus: [nuCH4], keys: ['CH4'], X: [1], mode: 'isothermal', onLimit: 'fail' }, m);
    if (!r.ok) throw new Error(r.code);
    expect(r.value.duty / 1000).toBeCloseTo(o.expected.dH_combustion_kJ_mol, 6);
  });
});

describe('EQ-CE-012 heat of reaction at T (Felder data)', () => {
  const o = O('EQ-CE-012');
  const nu = { CO: -1, H2: -2, CH3OH: 1 };
  it('dHr(25 C) and dHr(300 C) from the isothermal reactor duty per extent', () => {
    const m = fx('EQ-CE-012');
    for (const [T, want] of [[25, o.expected.dHr_25C_kJ], [300, o.expected.dHr_300C_kJ]] as const) {
      const r = reactStoich({ species: SP, n0: vec({ CO: 1, H2: 2 }), Tin: T + K0, nus: [nu], keys: ['CO'], X: [1], mode: 'isothermal', onLimit: 'fail' }, m);
      if (!r.ok) throw new Error(r.code);
      expect(rel(r.value.duty / 1000 / r.value.xi[0]!, want), 'T=' + T).toBeLessThanOrEqual(o.tol.rel!);
      expect(rel(m.dH(nu, T + K0) / 1000, want), 'dH(T) T=' + T).toBeLessThanOrEqual(o.tol.rel!);
    }
  });
});

describe('EQ-CE-013 adiabatic reactor with a given conversion (Felder data)', () => {
  const o = O('EQ-CE-013');
  it('water-gas shift, X_CO = 0.6 from 400 C: outlet T, extent and dHr(25 C)', () => {
    const nu = { CO: -1, H2O: -1, CO2: 1, H2: 1 };
    const m = fx('EQ-CE-013');
    const r = reactStoich({ species: SP, n0: vec({ CO: 1, H2O: 2 }), Tin: 400 + K0, nus: [nu], keys: ['CO'], X: [0.6], mode: 'adiabatic', onLimit: 'fail' }, m);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(rel(r.value.T - K0, o.expected.T_out_C)).toBeLessThanOrEqual(o.tol.rel!);
    expect(r.value.xi[0]).toBeCloseTo(o.expected.xi, 12);
    expect(m.dH(nu, 25 + K0) / 1000).toBeCloseTo(o.expected.dHr25_kJ, 9);
  });
});

describe('EQ-CE-014 heat of formation vs heat of reaction method (Felder data)', () => {
  const o = O('EQ-CE-014');
  it('1 mol CH4 + 10 % excess air at 25 C, products at 400 C: Q = -664.84 kJ both ways', () => {
    const m = fx('EQ-CE-014');
    const feed = vec({ CH4: 1, ...air(2 * 1.1) });
    const r = reactStoich({ species: SP, n0: feed, Tin: 25 + K0, nus: [nuCH4], keys: ['CH4'], X: [1], mode: 'isothermal', Tout: 400 + K0, onLimit: 'fail' }, m);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(rel(r.value.duty / 1000, o.expected.Q_kJ_per_mol_CH4)).toBeLessThanOrEqual(o.tol.rel!);
    SP.forEach((s, i) => { const want = o.expected.products[s] ?? 0; expect(Math.abs(r.value.n[i]! - want), s).toBeLessThan(1e-9); });
    // heat-of-reaction method: dHr(25 C) + sensible heat of the products from 25 C to 400 C - sensible heat of the feed (0 at 25 C)
    const sens = r.value.n.reduce((s, v, i) => s + v * (m.H(vec(Object.fromEntries(SP.map((x, k) => [x, k === i ? 1 : 0]))), 400 + K0) - m.H(vec(Object.fromEntries(SP.map((x, k) => [x, k === i ? 1 : 0]))), 25 + K0)), 0);
    expect(rel((m.dH(nuCH4, 25 + K0) + sens) / 1000, o.expected.HoF_method)).toBeLessThanOrEqual(o.tol.rel!);
  });
});

describe('sulfur burner T_ad (fixture, engine thermo) through the burner unit', () => {
  const sp = ['S', 'O2', 'N2', 'SO2'];
  const ctx: SimCtx = { species: sp, thermoDetail: 'rigorous' };
  const mk = (type: string, params: Record<string, number | string> = {}): UnitInst => ({ id: 'B', type, pos: { x: 0, y: 0 }, rot: 0, params });
  const run = (ySO2: number) => {
    const airK = 100 / ySO2;
    const m = mixer({ in1: { n: [100, 0, 0, 0], T: 413.15, P: 1.2e5 }, in2: { n: [0, 0.21 * airK, 0.79 * airK, 0], T: 298.15, P: 1.2e5 } }, mk('mixer'), ctx);
    if (!m.ok) throw new Error(m.code);
    const b = stoichReactor({ in: m.value.outlets.out! }, mk('burner', { mode: 'adiabatic' }), ctx);
    if (!b.ok) throw new Error(b.code);
    return b.value;
  };
  for (const c of burnerFix.cases) {
    it('y_SO2 = ' + c.y_SO2 + ' -> ' + c.T_ad_C.toFixed(1) + ' C within 0.5 K', () => {
      const v = run(c.y_SO2);
      expect(Math.abs(v.outlets.out!.T - K0 - c.T_ad_C)).toBeLessThanOrEqual(burnerFix.tolerance.abs_T_K);
      expect(v.info!.X).toBeCloseTo(1, 12);
    });
  }
  it('10 % SO2 headline: 931.4 C; S is consumed and the SO2 equals the sulfur fed (atoms)', () => {
    const v = run(0.1);
    expect(v.outlets.out!.T - K0).toBeCloseTo(931.4, 0);
    expect(v.outlets.out!.n[3]).toBeCloseTo(100, 9);
    expect(v.outlets.out!.n[0]).toBe(0);
  });
  it('too little air: the burner clamps at the limiting reagent (O2), warns and leaves sulfur', () => {
    const v = stoichReactor({ in: { n: [100, 60, 0, 0], T: 500, P: 1e5 } }, mk('burner', { mode: 'isothermal', T: 700 }), ctx);
    expect(v.ok).toBe(true); if (!v.ok) return;
    expect(v.value.outlets.out!.n[3]).toBeCloseTo(60, 9); expect(v.value.outlets.out!.n[0]).toBeCloseTo(40, 9);
    expect(v.diag.map((d) => d.code)).toContain('CONVERSION_EXCEEDS_LIMITING');
  });
});

describe('Felder polynomials vs the NIST-JANAF Shomate engine thermo (reported gap, pinned)', () => {
  it('CH4 flame (EQ-CE-011): the engine T_ad is 3.2 K below the oracle (1741.7 vs 1744.9 C), beyond its 1 K band, so the oracle must use its own data', () => {
    const o = O('EQ-CE-011');
    const ctx: SimCtx = { species: ['CH4', 'O2', 'N2', 'CO2', 'H2O'], thermoDetail: 'rigorous' };
    const a = air(2.5);
    const r = stoichReactor({ in: { n: [1, a.O2, a.N2, 0, 0], T: 298.15, P: 1e5 } }, { id: 'B', type: 'stoich_reactor', pos: { x: 0, y: 0 }, rot: 0, params: { reactions: 'R13', mode: 'adiabatic' } }, ctx);
    if (!r.ok) throw new Error(r.code);
    const gap = r.value.outlets.out!.T - K0 - o.expected.T_adiabatic_C;
    expect(Math.abs(gap)).toBeLessThan(5);
    expect(Math.abs(gap)).toBeGreaterThan(o.tol.abs!);
  });
});

