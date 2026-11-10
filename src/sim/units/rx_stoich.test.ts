import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@core/numerics/test-util';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlow, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { UNIT_DEFS_RX } from './registryRx';
import { engineModel, reactStoich, reactantsOf, stoichReactor } from './rx_stoich';

const mk = (type: string, params: Record<string, number | string> = {}): UnitInst => ({ id: 'R1', type, pos: { x: 0, y: 0 }, rot: 0, params });
const ok = <T,>(r: { ok: boolean } & Record<string, unknown>): T => { if (!r.ok) throw new Error(String(r.code) + JSON.stringify(r.data)); return r.value as T; };
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };

describe('stoichiometric reactor: ammonia (L01 / L04, EQ-NC-005 numbers)', () => {
  const sp = ['N2', 'H2', 'NH3'];
  const ctx: SimCtx = { species: sp, thermoDetail: 'rigorous' };
  it('1:3 feed, X = 1: all converted, NH3 = 2 N2 fed', () => {
    const v = ok<Out>(stoichReactor({ in: { n: [10, 30, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', mode: 'isothermal' }), ctx));
    expect(v.outlets.out!.n[0]).toBe(0); expect(v.outlets.out!.n[1]).toBe(0); expect(v.outlets.out!.n[2]).toBeCloseTo(20, 12);
    expect(v.info.X).toBeCloseTo(1, 12);
  });
  it('1:3 by mass is not 1:3 by moles: N2 is limiting by far, H2 left over (the L04 notebook: 2.00 t N2 + 1.00 t H2)', () => {
    const nN2 = 2e6 / 28.0134, nH2 = 1e6 / 2.01588;
    const v = ok<Out>(stoichReactor({ in: { n: [nN2, nH2, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', mode: 'isothermal' }), ctx));
    expect(v.info.limIdx).toBe(0);
    expect(v.outlets.out!.n[0]).toBe(0);
    expect(v.outlets.out!.n[2]).toBeCloseTo(2 * nN2, 6);
    expect(v.outlets.out!.n[1]).toBeCloseTo(nH2 - 3 * nN2, 6);
  });
  it('a named key that is not the limiting reagent: CONVERSION_EXCEEDS_LIMITING names the true limiting reagent and the maximum', () => {
    const r = stoichReactor({ in: { n: [10, 12, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', key: 'N2', X: 0.9, mode: 'isothermal' }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CONVERSION_EXCEEDS_LIMITING');
    expect(r.data.limiting).toBe('H2'); expect(r.data.max).toBeCloseTo(0.4, 12); expect(r.data.asked).toBe(0.9);
    expect(r.species).toBe('H2');
  });
  it('partial conversion of the limiting reagent: X = 0.5', () => {
    const v = ok<Out>(stoichReactor({ in: { n: [10, 30, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', X: 0.5, mode: 'isothermal' }), ctx));
    expect(v.outlets.out!.n).toEqual([5, 15, 10]);
  });
  it('no reactant: NO_REACTANT (info), stream unchanged; zero flow passes; unknown reaction and missing species are coded', () => {
    const v = stoichReactor({ in: { n: [0, 5, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', mode: 'isothermal' }), ctx);
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.diag.map((d) => d.code)).toContain('NO_REACTANT'); expect(v.value.outlets.out!.n).toEqual([0, 5, 0]); }
    const z = ok<Out>(stoichReactor({ in: { n: [0, 0, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', mode: 'adiabatic' }), ctx));
    expect(z.duty).toBe(0);
    const u = stoichReactor({ in: { n: [1, 1, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R99' }), ctx);
    expect(!u.ok && u.code).toBe('UNKNOWN_REACTION');
    const m = stoichReactor({ in: { n: [1, 1, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R2' }), ctx);
    expect(!m.ok && m.code).toBe('SPECIES_MISSING');
    const none = stoichReactor({ in: { n: [1, 1, 0], T: 300, P: 1e5 } }, mk('stoich_reactor'), ctx);
    expect(!none.ok && none.code).toBe('SPEC_MISSING');
  });
  it('dP lowers the outlet pressure; PRESSURE_NONPOSITIVE when it exceeds P_in; NaN inlet is NUMERIC_GUARD', () => {
    const v = ok<Out>(stoichReactor({ in: { n: [1, 3, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', dP: 2e4, mode: 'isothermal' }), ctx));
    expect(v.outlets.out!.P).toBe(8e4);
    const r = stoichReactor({ in: { n: [1, 3, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1', dP: 2e5 }), ctx);
    expect(!r.ok && r.code).toBe('PRESSURE_NONPOSITIVE');
    const g = stoichReactor({ in: { n: [Number.NaN, 3, 0], T: 300, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R1' }), ctx);
    expect(!g.ok && g.code).toBe('NUMERIC_GUARD');
  });
});

describe('burners and the gasifier (L02, L03, L07)', () => {
  it('L03: the burner finds the fuel in the feed (CH4 or C3H8) and burns it completely; C3H8 10 kmol/h needs 50 kmol/h O2', () => {
    const sp = ['C3H8', 'CH4', 'O2', 'N2', 'CO2', 'H2O'];
    const ctx: SimCtx = { species: sp, thermoDetail: 'rigorous' };
    const o2 = 50 * 1.1;
    const v = ok<Out>(stoichReactor({ in: { n: [10, 0, o2, (o2 * 79) / 21, 0, 0], T: 400, P: 1e5 } }, mk('burner', { mode: 'adiabatic' }), ctx));
    const n = v.outlets.out!.n;
    expect(n[0]).toBe(0); expect(n[4]).toBeCloseTo(30, 9); expect(n[5]).toBeCloseTo(40, 9); expect(n[2]).toBeCloseTo(5, 9);
    const w = ok<Out>(stoichReactor({ in: { n: [0, 10, 25, 94, 0, 0], T: 400, P: 1e5 } }, mk('burner', { mode: 'adiabatic' }), ctx));
    expect(w.outlets.out!.n[4]).toBeCloseTo(10, 9); expect(w.outlets.out!.n[5]).toBeCloseTo(20, 9);
  });
  it('L07 Hess: coke -> CO -> CO2 releases the same heat as coke -> CO2 (isothermal 298.15 K; -110.5 and -283.0 kJ/mol)', () => {
    const sp = ['C', 'O2', 'CO', 'CO2'];
    const ctx: SimCtx = { species: sp, thermoDetail: 'rigorous' };
    const g = ok<Out>(stoichReactor({ in: { n: [1, 0.5, 0, 0], T: 298.15, P: 1e5 } }, mk('gasifier', { mode: 'isothermal' }), ctx));
    expect(g.outlets.out!.n).toEqual([0, 0, 1, 0]);
    const b = ok<Out>(stoichReactor({ in: { n: [0, 0.5, 1, 0], T: 298.15, P: 1e5 } }, mk('co_burner', { mode: 'isothermal' }), ctx));
    expect(b.outlets.out!.n[3]).toBeCloseTo(1, 12);
    expect(g.duty / 1000).toBeCloseTo(-110.5, 0); expect(b.duty / 1000).toBeCloseTo(-283.0, 0);
    const both = ok<Out>(stoichReactor({ in: { n: [1, 1, 0, 0], T: 298.15, P: 1e5 } }, mk('stoich_reactor', { reactions: 'R14,R15', mode: 'isothermal' }), ctx));
    expect(both.outlets.out!.n[3]).toBeCloseTo(1, 12);
    expect(both.duty / 1000).toBeCloseTo(-393.5, 0);
    expect(both.duty).toBeCloseTo(g.duty + b.duty, 3);
  });
  it('burner with no fuel in the feed: stream unchanged, NO_REACTANT info', () => {
    const ctx: SimCtx = { species: ['CH4', 'O2', 'N2', 'CO2', 'H2O'], thermoDetail: 'rigorous' };
    const r = stoichReactor({ in: { n: [0, 1, 4, 0, 0], T: 400, P: 1e5 } }, mk('burner'), ctx);
    expect(r.ok && r.diag[0]!.code).toBe('NO_REACTANT');
  });
});

describe('registry metadata', () => {
  it('reactors have fixed ports, consume their reactants and never let species exit', () => {
    for (const t of ['stoich_reactor', 'burner', 'gasifier', 'co_burner', 'eq_reactor', 'eq_bed', 'packed_bed', 'multibed']) {
      const d = UNIT_DEFS_RX[t]!; expect(d, t).toBeDefined();
      expect(d.outlets).toEqual(['out']); expect(d.inlets[0]).toBe('in'); expect(d.exits).toBeUndefined();
    }
    expect(UNIT_DEFS_RX.multibed!.inlets).toEqual(['in', 'quench']);
    const sp = ['N2', 'H2', 'NH3'];
    const u = mk('eq_reactor', { reactions: 'R1' });
    expect(sp.map((_, i) => UNIT_DEFS_RX.eq_reactor!.consumes!(u, i, sp))).toEqual([true, true, false]);
    expect([...reactantsOf(mk('burner'))].sort()).toEqual(['C3H8', 'CH4', 'O2', 'S']);
    expect(UNIT_DEFS_RX.packed_bed!.consumes!(mk('packed_bed', {}), 0, ['N2'])).toBe(false);
    expect(UNIT_DEFS_RX.packed_bed!.consumes!({ ...mk('packed_bed'), catalystId: 'v2o5' }, 0, ['SO2'])).toBe(true);
  });
});

describe('P1 atom balance and P3 energy closure (fuzz, 10 000 cases)', () => {
  const sp = ['CH4', 'C3H8', 'S', 'O2', 'N2', 'CO2', 'H2O', 'SO2', 'CO', 'C', 'H2', 'NH3'];
  const ctx: SimCtx = { species: sp, thermoDetail: 'rigorous' };
  const mx = makeMixture(sp);
  const sets = ['R13', 'R16', 'R10', 'R14', 'R15', 'R14,R15', 'R1'];
  it('every random reactor: atoms in = atoms out (1e-9 rel), H_in + Q = H_out (1e-6 of the largest term), no negative flow', () => {
    const r = mulberry32(20261110);
    let n = 0;
    for (let c = 0; c < 10000; c++) {
      const reactions = sets[Math.floor(r() * sets.length)]!;
      const feed = sp.map(() => (r() < 0.4 ? 0 : 0.01 + 5 * r()));
      const iso = r() < 0.5;
      // liquid sulfur has latent-heat steps in H(T) below 432 K (1.7 kJ/mol at 388 K): an adiabatic solve inside a step has no root
      const T = !iso && feed[2]! > 0 ? 450 + 450 * r() : 300 + 600 * r();
      const params: Record<string, number | string> = { reactions, X: r() < 0.5 ? 1 : r(), onLimit: 'clamp', mode: iso ? 'isothermal' : 'adiabatic' };
      if (iso) params.T = 300 + 1200 * r();
      const res = stoichReactor({ in: { n: feed, T, P: 1e5 } }, mk('stoich_reactor', params), ctx);
      if (!res.ok) { expect(['T_BRACKET', 'ZERO_FLOW']).toContain(res.code); continue; }
      n++;
      const out = res.value.outlets.out!;
      expect(out.n.every((v) => v >= 0 && Number.isFinite(v))).toBe(true);
      const a = elementTotals(sp, feed), b = elementTotals(sp, out.n);
      for (const e of Object.keys(a)) expect(Math.abs((a[e] ?? 0) - (b[e] ?? 0)), e).toBeLessThanOrEqual(1e-9 * Math.max(a[e]!, 1e-3));
      const Hin = enthalpyFlow(mx, { n: feed, T, P: 1e5 }), Hout = enthalpyFlow(mx, out);
      const big = Math.max(Math.abs(Hin), Math.abs(Hout), Math.abs(res.value.duty!), 1);
      expect(Math.abs(Hin + res.value.duty! - Hout) / big).toBeLessThan(1e-6);
      if (!iso) expect(Math.abs(res.value.duty!) / big).toBeLessThan(1e-6);
    }
    expect(n).toBeGreaterThan(8000);
  });
  it('core reactStoich with the engine model gives the same result as the unit', () => {
    const m = engineModel(['N2', 'H2', 'NH3']);
    const r = reactStoich({ species: ['N2', 'H2', 'NH3'], n0: [1, 3, 0], Tin: 500, nus: [{ N2: -1, H2: -3, NH3: 2 }], X: [1], mode: 'adiabatic', onLimit: 'fail' }, m);
    expect(r.ok && r.value.T).toBeGreaterThan(500);
  });
});
