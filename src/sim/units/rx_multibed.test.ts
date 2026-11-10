import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@core/numerics/test-util';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlow, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { UNIT_DEFS_RX } from './registryRx';
import { bedProfile, simulateBed } from './rx_pfr';
import { multibed } from './rx_multibed';

const mk = (params: Record<string, number | string> = {}, catalystId?: string): UnitInst => ({ id: 'M1', type: 'multibed', pos: { x: 0, y: 0 }, rot: 0, params, catalystId });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const run = (inl: Record<string, StreamState>, u: UnitInst, ctx: SimCtx) => {
  const r = multibed(inl, u, ctx);
  if (!r.ok) throw new Error(r.code + JSON.stringify(r.data));
  return { ...(r.value as Out), diag: r.diag };
};
const so2: SimCtx = { species: ['SO2', 'O2', 'SO3', 'N2'], thermoDetail: 'rigorous' };
const nh3: SimCtx = { species: ['N2', 'H2', 'NH3', 'Ar'], thermoDetail: 'rigorous' };
const feedS = (Tc: number): StreamState => ({ n: [0.1, 0.11, 0, 0.79], T: Tc + 273.15, P: 1.5 * 101325 });

describe('multi-bed converter: equilibrium beds with inter-bed coolers', () => {
  it('info is the staircase: per bed Tin / Tout / Xin / Xout (cumulative), Q, eta; cool_duty is the sum of the coolers; the ledger closes', () => {
    const v = run({ in: feedS(420) }, mk({ beds: 3, Tcool1: 693.15, Tcool2: 693.15, reactions: 'R2' }), so2);
    expect(v.info.beds).toBe(3);
    for (let j = 1; j <= 3; j++) {
      expect(v.info[`b${j}_Tout`]!).toBeGreaterThan(v.info[`b${j}_Tin`]!); expect(v.info[`b${j}_Xout`]!).toBeGreaterThan(v.info[`b${j}_Xin`]!);
      expect(v.info[`b${j}_eta`]).toBe(1);
    }
    expect(v.info.b2_Xin).toBeCloseTo(v.info.b1_Xout!, 12);
    expect(v.info.X).toBe(v.info.b3_Xout);
    expect(v.info.Tmax).toBe(v.info.b1_Tout);
    expect(v.info.cool_duty!).toBeLessThan(0);
    const mx = makeMixture(so2.species);
    const Hin = enthalpyFlow(mx, feedS(420)), Hout = enthalpyFlow(mx, v.outlets.out!);
    expect(v.duty).toBeCloseTo(Hout - Hin, 6);
    expect(v.duty).toBeCloseTo(v.info.cool_duty!, 3); // adiabatic beds: all the heat leaves through the coolers
  });
  it('no cooler and no quench: the beds are in direct series and the second bed sees an equilibrium feed (no more conversion)', () => {
    const v = run({ in: feedS(420) }, mk({ beds: 2, reactions: 'R2' }), so2);
    expect(v.info.b2_Xout).toBeCloseTo(v.info.b1_Xout!, 9);
  });
  it('2-4 beds only; missing reactions; no inlet; NaN; missing W in kinetic mode', () => {
    const code = (r: { ok: boolean; code?: string }) => (r.ok ? 'ok' : r.code);
    for (const b of [0, 1, 5, 2.5]) expect(code(multibed({ in: feedS(420) }, mk({ beds: b, reactions: 'R2' }), so2))).toBe('SPEC_RANGE');
    expect(code(multibed({ in: feedS(420) }, mk({ beds: 2 }), so2))).toBe('SPEC_MISSING');
    expect(code(multibed({}, mk({ beds: 2, reactions: 'R2' }), so2))).toBe('NO_INLET');
    expect(code(multibed({ in: { ...feedS(420), n: [Number.NaN, 1, 0, 1] } }, mk({ beds: 2, reactions: 'R2' }), so2))).toBe('NUMERIC_GUARD');
    expect(code(multibed({ in: feedS(420) }, mk({ beds: 2, W1: 5, law: 'K2' }), so2))).toBe('SPEC_MISSING');
    expect(code(multibed({ in: feedS(420) }, mk({ beds: 2, reactions: 'R2', Tcool1: -3 }), so2))).toBe('SPEC_RANGE');
  });
  it('per-bed diagnostics carry the bed number; the over-temperature warning names the bed', () => {
    const v = run({ in: feedS(430) }, mk({ beds: 2, Tcool1: 703.15, reactions: 'R2' }, 'v2o5'), so2);
    const d = v.diag.find((x) => x.code === 'CATALYST_OVERTEMP');
    expect(d).toBeDefined(); expect(d!.data.bed).toBe(1);
  });
});

describe('multi-bed converter: kinetic beds (K2, per-bed catalyst mass)', () => {
  it('is exactly three packed beds chained through ideal coolers (same numbers as simulateBed by hand), with bed profiles in info', () => {
    const W = [4, 6, 10], Tc = 693.15;
    const v = run({ in: feedS(420) }, mk({ beds: 3, W1: W[0]!, W2: W[1]!, W3: W[2]!, Tcool1: Tc, Tcool2: Tc }, 'v2o5'), so2);
    let s = feedS(420);
    for (let j = 0; j < 3; j++) {
      if (j > 0) s = { ...s, T: Tc };
      const r = simulateBed({ species: so2.species, inlet: s, lawId: 'K2', catalystId: 'v2o5', W: W[j]!, mode: 'adiabatic', nprof: 30 });
      if (!r.ok) throw new Error(r.code);
      s = r.value.out;
      expect(v.info[`b${j + 1}_Tout`]).toBe(s.T);
    }
    expect(v.outlets.out!.n).toEqual(s.n);
    const p1 = bedProfile(v.info, 'b1_'), p3 = bedProfile(v.info, 'b3_');
    expect(p1.W.length).toBeLessThanOrEqual(30); expect(p3.W[p3.W.length - 1]).toBeCloseTo(10, 9);
    expect(p1.X[0]).toBe(0); expect(p3.X[p3.X.length - 1]).toBeCloseTo(v.info.b3_Xout!, 3);
    expect(v.info.evals).toBeGreaterThan(0);
  });
  it('more catalyst in bed 1 means a higher bed-1 conversion and a hotter exit; a bed that is a kinetic one never beats its equilibrium bed', () => {
    const a = run({ in: feedS(420) }, mk({ beds: 2, W1: 2, W2: 2, Tcool1: 693.15 }, 'v2o5'), so2);
    const b = run({ in: feedS(420) }, mk({ beds: 2, W1: 5, W2: 2, Tcool1: 693.15 }, 'v2o5'), so2);
    expect(b.info.b1_Xout!).toBeGreaterThan(a.info.b1_Xout!); expect(b.info.b1_Tout!).toBeGreaterThan(a.info.b1_Tout!);
    const eq = run({ in: feedS(420) }, mk({ beds: 2, Tcool1: 693.15, reactions: 'R2' }), so2);
    expect(b.info.X!).toBeLessThanOrEqual(eq.info.X! + 1e-4);
  });
});

describe('multi-bed converter: quench (K1 ammonia, cold gas between beds)', () => {
  const feedA = (T: number, scale = 1): StreamState => ({ n: [0.0647, 0.194, 0.0083, 0.0108].map((v) => v * scale), T, P: 200e5 });
  const u = (extra: Record<string, number | string> = {}) => mk({ beds: 3, W1: 0.5, W2: 0.5, W3: 0.5, ...extra }, 'fe_ammonia');
  it('quench cools the stream before the next bed, conserves atoms and energy, and the conversion is on the key fed so far', () => {
    const inl = { in: feedA(673.15, 0.7), quench: feedA(473.15, 0.3) };
    const v = run(inl, u(), nh3);
    const mx = makeMixture(nh3.species);
    const total = nh3.species.map((_, i) => inl.in.n[i]! + inl.quench.n[i]!);
    const a = elementTotals(nh3.species, total), b = elementTotals(nh3.species, v.outlets.out!.n);
    for (const e of Object.keys(a)) expect(Math.abs(a[e]! - b[e]!)).toBeLessThan(1e-12);
    const Hin = enthalpyFlow(mx, inl.in) + enthalpyFlow(mx, inl.quench);
    expect(Math.abs(Hin + v.duty - enthalpyFlow(mx, v.outlets.out!)) / Math.abs(Hin)).toBeLessThan(1e-12);
    expect(Math.abs(v.duty)).toBeLessThan(1e-6 * Math.abs(Hin)); // no coolers, adiabatic beds, quench is an inlet: no duty
    expect(v.info.b2_Tin!).toBeLessThan(v.info.b1_Tout!); expect(v.info.b3_Tin!).toBeLessThan(v.info.b2_Tout!);
    expect(v.info.b2_Xin!).toBeLessThan(v.info.b1_Xout!); // fresh key arrives with the quench
    expect(v.info.X!).toBeGreaterThan(0.05);
  });
  it('quench weights share the cold stream between the gaps (always in full); a weight of 0 skips a gap; a connected but empty quench is ignored', () => {
    const inl = { in: feedA(673.15, 0.6), quench: feedA(473.15, 0.4) };
    const heavy1 = run(inl, u({ q1: 3, q2: 1 }), nh3), heavy2 = run(inl, u({ q1: 1, q2: 3 }), nh3), equal = run(inl, u(), nh3), zeros = run(inl, u({ q1: 0, q2: 0 }), nh3);
    expect(heavy1.info.b2_Tin!).toBeLessThan(heavy2.info.b2_Tin!); // more cold gas before bed 2: colder bed-2 inlet
    expect(zeros.outlets.out!.n).toEqual(equal.outlets.out!.n); // no positive weight: equal shares, nothing is lost
    const all = (v: { outlets: Record<string, StreamState> }) => v.outlets.out!.n.reduce((x, y) => x + y, 0);
    expect(all(heavy1)).toBeGreaterThan(0.2); expect(all(equal)).toBeGreaterThan(0.2);
    const skip = run(inl, u({ q1: 0, q2: 1 }), nh3);
    expect(skip.info.b2_Tin).toBe(run({ in: inl.in }, u(), nh3).info.b2_Tin); // nothing is added before bed 2
    const empty = run({ in: feedA(673.15), quench: feedA(473.15, 0) }, u(), nh3), plain = run({ in: feedA(673.15) }, u(), nh3);
    expect(empty.outlets.out!.n).toEqual(plain.outlets.out!.n);
  });
  it('quench plus an indirect cooler: the quench mixes first, then the cooler brings the stream to Tcool', () => {
    const v = run({ in: feedA(673.15, 0.7), quench: feedA(473.15, 0.3) }, u({ Tcool1: 650, Tcool2: 650 }), nh3);
    expect(v.info.b2_Tin).toBe(650); expect(v.info.b3_Tin).toBe(650); expect(v.info.cool_duty!).toBeLessThan(0);
  });
});

describe('registry: multibed takes an optional quench port', () => {
  it('lists in and quench; the flowsheet may leave quench unconnected', () => {
    expect(UNIT_DEFS_RX.multibed!.inlets).toEqual(['in', 'quench']);
  });
});

describe('P1 atom balance and P3 energy closure on random converters (fuzz, 800 cases)', () => {
  it('equilibrium and kinetic multi-bed converters with random coolers and quench', () => {
    const r = mulberry32(2718);
    let n = 0;
    for (let c = 0; c < 800; c++) {
      const k1 = r() < 0.5, kin = r() < 0.5;
      const ctx = k1 ? nh3 : so2;
      const nb = 2 + Math.floor(r() * 3);
      const feed = ctx.species.map((_, i) => (i === 2 && r() < 0.6 ? 0 : 0.02 + r()));
      const T = k1 ? 650 + 100 * r() : 680 + 60 * r();
      const P = k1 ? (100 + 150 * r()) * 1e5 : (1 + r()) * 1e5;
      const params: Record<string, number | string> = { beds: nb, bedModel: kin ? 'pfr' : 'eq', activity: 0.3 + 0.7 * r() };
      for (let j = 1; j <= nb; j++) { if (kin) params['W' + j] = 0.05 + 4 * r(); if (j < nb && r() < 0.7) params['Tcool' + j] = T - 40 * r(); if (j < nb && r() < 0.5) params['q' + j] = r(); }
      if (!kin) params.reactions = k1 ? 'R1' : 'R2';
      const qs: { quench?: StreamState } = r() < 0.5 ? { quench: { n: ctx.species.map((_, i) => (i === 2 ? 0 : 0.05 + 0.3 * r())), T: 450, P } } : {};
      const inl: Record<string, StreamState> = { in: { n: feed, T, P }, ...qs };
      const res = multibed(inl, mk(params, k1 ? 'fe_ammonia' : 'v2o5'), ctx);
      if (!res.ok) { expect(['T_BRACKET', 'EQUILIBRIUM_NOT_CONVERGED']).toContain(res.code); continue; }
      n++;
      const total = ctx.species.map((_, i) => feed[i]! + (qs.quench ? qs.quench.n[i]! : 0));
      const a = elementTotals(ctx.species, total), b = elementTotals(ctx.species, res.value.outlets.out!.n);
      for (const e of Object.keys(a)) expect(Math.abs(a[e]! - b[e]!), e).toBeLessThanOrEqual(1e-9 * Math.max(a[e]!, 1e-3));
      const mx = makeMixture(ctx.species);
      const Hin = Object.values(inl).reduce((s, x) => s + enthalpyFlow(mx, x), 0), Hout = enthalpyFlow(mx, res.value.outlets.out!);
      expect(Math.abs(Hin + res.value.duty! - Hout) / Math.max(Math.abs(Hin), Math.abs(Hout), 1)).toBeLessThan(1e-9);
      expect(res.value.outlets.out!.n.every((v) => v >= 0 && Number.isFinite(v))).toBe(true);
    }
    expect(n).toBeGreaterThan(700);
  });
});
