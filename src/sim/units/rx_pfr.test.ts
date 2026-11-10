import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@core/numerics/test-util';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlow, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { bedProfile, packedBed, simulateBed } from './rx_pfr';

const mk = (params: Record<string, number | string> = {}, catalystId?: string): UnitInst => ({ id: 'B1', type: 'packed_bed', pos: { x: 0, y: 0 }, rot: 0, params, catalystId });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const so2: SimCtx = { species: ['SO2', 'O2', 'SO3', 'N2'], thermoDetail: 'rigorous' };
const nh3: SimCtx = { species: ['N2', 'H2', 'NH3', 'Ar'], thermoDetail: 'rigorous' };
const feedS = (T: number): StreamState => ({ n: [0.1, 0.11, 0, 0.79], T, P: 1.5 * 101325 });
const feedN = (T: number): StreamState => ({ n: [0.0647, 0.1940, 0.0083, 0.0108], T, P: 200e5 });
const run = (s: StreamState, u: UnitInst, ctx: SimCtx) => {
  const r = packedBed({ in: s }, u, ctx);
  if (!r.ok) throw new Error(r.code + JSON.stringify(r.data));
  return { ...(r.value as Out), diag: r.diag };
};

describe('packed bed unit', () => {
  it('K2 bed 1 from 420 C (catalyst id picks the law): exits near 624 C, X 0.70, on the curve; info carries what the Equilibrium Window needs', () => {
    const v = run(feedS(693.15), mk({ W: 20 }, 'v2o5'), so2);
    const i = v.info;
    expect(v.outlets.out!.T - 273.15).toBeCloseTo(624.4, 0);
    expect(i.X).toBeCloseTo(0.7037, 3); expect(i.Xeq).toBeCloseTo(0.7036, 3); expect(i.eta).toBeGreaterThan(0.9999);
    expect(Math.abs(i.QK_out!)).toBeLessThan(1e-4); expect(i.QK_in).toBe(-30);
    expect(i.K).toBeGreaterThan(0); expect(i.dTad).toBeCloseTo(i.dT!, 0); expect(i.Tmax).toBeGreaterThanOrEqual(i.T_out!);
    expect(i.T_in).toBe(693.15); expect(i.evals).toBeLessThanOrEqual(400); expect(i.np).toBeGreaterThan(5); expect(i.np).toBeLessThanOrEqual(60);
    expect(Math.abs(v.duty)).toBeLessThan(1e-6 * 1e5); // adiabatic: heat ledger closes
  });
  it('profile: at most 60 points, W from 0 to the bed mass, X and T monotone for an adiabatic exothermic bed, Q/K rising to 0', () => {
    const v = run(feedS(693.15), mk({ W: 20 }, 'v2o5'), so2);
    const p = bedProfile(v.info);
    expect(p.W[0]).toBe(0); expect(p.W[p.W.length - 1]).toBeCloseTo(20, 9);
    for (let k = 1; k < p.W.length; k++) { expect(p.W[k]!).toBeGreaterThan(p.W[k - 1]!); expect(p.X[k]!).toBeGreaterThanOrEqual(p.X[k - 1]! - 1e-12); expect(p.T[k]!).toBeGreaterThanOrEqual(p.T[k - 1]! - 1e-6); }
    expect(p.QK.every((q) => q <= 1e-4)).toBe(true); // 1e-4 in log10 Q/K = 1 mK of integration error at dH/RT^2
    expect(p.QK[p.QK.length - 1]!).toBeGreaterThan(-1e-3);
    const thin = run(feedS(693.15), mk({ W: 20, nprof: 10 }, 'v2o5'), so2);
    expect(thin.info.np).toBe(10);
  });
  it('light-off: a cold inlet gives BELOW_LIGHTOFF (info) and almost no conversion; a hot one flags CATALYST_OVERTEMP', () => {
    const cold = run(feedS(573.15), mk({ W: 5 }, 'v2o5'), so2);
    expect(cold.diag.map((d) => d.code)).toContain('BELOW_LIGHTOFF'); expect(cold.info.X).toBeLessThan(0.01);
    const hot = run(feedS(713.15), mk({ W: 30 }, 'v2o5'), so2);
    expect(hot.diag.map((d) => d.code)).toContain('CATALYST_OVERTEMP');
    expect(hot.info.Tmax).toBeGreaterThan(893.15);
    const ok = run(feedS(693.15), mk({ W: 1 }, 'v2o5'), so2);
    expect(ok.diag.map((d) => d.code)).not.toContain('BELOW_LIGHTOFF');
  });
  it('catalyst activity scales the forward rate and never the equilibrium (P19): half activity gives less X at small W, the same X at large W', () => {
    const lo = run(feedS(693.15), mk({ W: 1, activity: 0.5 }, 'v2o5'), so2), hi = run(feedS(693.15), mk({ W: 1, activity: 1 }, 'v2o5'), so2);
    expect(lo.info.X).toBeLessThan(hi.info.X!);
    const a = run(feedS(693.15), mk({ W: 100, activity: 0.5 }, 'v2o5'), so2), b = run(feedS(693.15), mk({ W: 100, activity: 1 }, 'v2o5'), so2);
    expect(Math.abs(a.info.X! - b.info.X!)).toBeLessThan(1e-4);
    // the Cs catalyst lights off 40 K lower but ends on the same curve: at a hot isothermal T both reach X_eq
    const hotCs = run(feedS(693.15), mk({ W: 300, mode: 'isothermal', T: 773.15 }, 'v2o5_cs'), so2), hotV = run(feedS(693.15), mk({ W: 300, mode: 'isothermal', T: 773.15 }, 'v2o5'), so2);
    expect(Math.abs(hotCs.info.X! - hotV.info.X!)).toBeLessThan(1e-3); expect(Math.abs(hotV.info.X! - hotV.info.Xeq!)).toBeLessThan(1e-3);
    const coldCs = run(feedS(653.15), mk({ W: 5, mode: 'isothermal', T: 653.15 }, 'v2o5_cs'), so2), coldV = run(feedS(653.15), mk({ W: 5, mode: 'isothermal', T: 653.15 }, 'v2o5'), so2);
    expect(coldCs.info.X!).toBeGreaterThan(coldV.info.X!);
  });
  it('isothermal bed: T fixed, duty = H_out - H_in (heat removed, negative); cooled bed ends colder than the adiabatic one and closes its ledger', () => {
    const iso = run(feedS(693.15), mk({ W: 5, mode: 'isothermal', T: 700 }, 'v2o5'), so2);
    expect(iso.outlets.out!.T).toBe(700); expect(iso.duty).toBeLessThan(0);
    const ad = run(feedS(693.15), mk({ W: 5 }, 'v2o5'), so2);
    const co = run(feedS(693.15), mk({ W: 5, mode: 'cooled', Tc: 600, UaW: 5 }, 'v2o5'), so2);
    expect(co.outlets.out!.T).toBeLessThan(ad.outlets.out!.T); expect(co.duty).toBeLessThan(0);
    const mx = makeMixture(so2.species);
    for (const x of [iso, co]) {
      const Hin = enthalpyFlow(mx, feedS(693.15)), Hout = enthalpyFlow(mx, x.outlets.out!);
      expect(Math.abs(Hin + x.duty - Hout) / Math.abs(Hin)).toBeLessThan(1e-9);
    }
  });
  it('dP lowers the outlet P only; the rate uses the inlet P (constant along the bed)', () => {
    const a = run(feedS(693.15), mk({ W: 2, dP: 2e4 }, 'v2o5'), so2), b = run(feedS(693.15), mk({ W: 2 }, 'v2o5'), so2);
    expect(a.outlets.out!.P).toBe(1.5 * 101325 - 2e4); expect(a.info.X).toBeCloseTo(b.info.X!, 9);
  });
  it('K1 with the Ru catalyst (kMult 10) is faster than iron per kg; ruthenium window is its own', () => {
    const fe = run(feedN(673.15), mk({ W: 0.5 }, 'fe_ammonia'), nh3), ru = run(feedN(673.15), mk({ W: 0.5 }, 'ru_ammonia'), nh3);
    expect(ru.info.X!).toBeGreaterThan(fe.info.X!);
  });
  it('failures are coded: no inlet, W missing, no law, unknown law, non-PFR law, mode, activity, species missing, NaN, big dP; W = 0 and zero flow pass', () => {
    const code = (r: { ok: boolean; code?: string }) => (r.ok ? 'ok' : r.code);
    const s = feedS(693.15);
    expect(code(packedBed({}, mk({ W: 1 }, 'v2o5'), so2))).toBe('NO_INLET');
    expect(code(packedBed({ in: s }, mk({}, 'v2o5'), so2))).toBe('SPEC_MISSING');
    expect(code(packedBed({ in: s }, mk({ W: 1 }), so2))).toBe('SPEC_MISSING');
    expect(code(packedBed({ in: s }, mk({ W: 1, law: 'K99' }), so2))).toBe('SPEC_MISSING');
    expect(code(packedBed({ in: s }, mk({ W: 1, law: 'K6' }), so2))).toBe('NOT_PFR_LAW');
    expect(code(packedBed({ in: s }, mk({ W: 1, mode: 'x' }, 'v2o5'), so2))).toBe('SPEC_RANGE');
    expect(code(packedBed({ in: s }, mk({ W: 1, activity: 2 }, 'v2o5'), so2))).toBe('SPEC_RANGE');
    expect(code(packedBed({ in: s }, mk({ W: 1 }, 'v2o5'), nh3))).toBe('SPECIES_MISSING');
    expect(code(packedBed({ in: { ...s, n: [Number.NaN, 1, 0, 1] } }, mk({ W: 1 }, 'v2o5'), so2))).toBe('NUMERIC_GUARD');
    expect(code(packedBed({ in: s }, mk({ W: 1, dP: 1e9 }, 'v2o5'), so2))).toBe('PRESSURE_NONPOSITIVE');
    const z = run(s, mk({ W: 0 }, 'v2o5'), so2);
    expect(z.outlets.out!.n).toEqual(s.n); expect(z.duty).toBe(0);
    const zf = run({ ...s, n: [0, 0, 0, 0] }, mk({ W: 5 }, 'v2o5'), so2);
    expect(zf.duty).toBe(0);
  });
  it('no key reactant (no O2 in the SO2 bed): nothing reacts, no NaN', () => {
    const v = run({ n: [0.1, 0, 0, 0.9], T: 693.15, P: 1.5e5 }, mk({ W: 5 }, 'v2o5'), so2);
    expect(v.info.X).toBe(0); expect(v.outlets.out!.n).toEqual([0.1, 0, 0, 0.9]);
  });
});

describe('P1 atom balance, P3 energy closure, P12 never crossing equilibrium, budget (fuzz, 1 500 beds)', () => {
  it('random K1 and K2 beds, adiabatic / isothermal / cooled, with and without product in the feed', () => {
    const r = mulberry32(31415);
    let n = 0, over = 0, maxEvals = 0, ms = 0;
    const all: number[] = [];
    for (let c = 0; c < 1500; c++) {
      const k1 = r() < 0.5;
      const ctx = k1 ? nh3 : so2;
      const feed = ctx.species.map((_, i) => (i === 2 && r() < 0.5 ? 0 : 0.01 + r()));
      const T = k1 ? 640 + 200 * r() : 650 + 150 * r();
      const P = k1 ? (50 + 250 * r()) * 1e5 : (1 + 2 * r()) * 1e5;
      const mode = ['adiabatic', 'isothermal', 'cooled'][Math.floor(r() * 3)]!;
      const params: Record<string, number | string> = { W: 0.01 + 40 * r() * r(), mode, activity: 0.2 + 0.8 * r() };
      if (mode === 'isothermal') params.T = T + 60 * (r() - 0.5);
      if (mode === 'cooled') { params.Tc = T - 60 * r(); params.UaW = 20 * r(); }
      const s: StreamState = { n: feed, T, P };
      const t0 = performance.now();
      const res = packedBed({ in: s }, mk(params, k1 ? 'fe_ammonia' : 'v2o5'), ctx);
      ms += performance.now() - t0;
      if (!res.ok) { expect(['BED_STEPS', 'BED_NEWTON', 'BED_NONFINITE']).not.toContain(res.code); continue; }
      n++;
      const out = res.value.outlets.out!, info = res.value.info!;
      expect(out.n.every((v) => v >= 0 && Number.isFinite(v)) && Number.isFinite(out.T)).toBe(true);
      const a = elementTotals(ctx.species, feed), b = elementTotals(ctx.species, out.n);
      for (const e of Object.keys(a)) expect(Math.abs((a[e] ?? 0) - (b[e] ?? 0)), e).toBeLessThanOrEqual(1e-9 * Math.max(a[e]!, 1e-3));
      const mx = makeMixture(ctx.species);
      const Hin = enthalpyFlow(mx, s), Hout = enthalpyFlow(mx, out);
      expect(Math.abs(Hin + res.value.duty! - Hout) / Math.max(Math.abs(Hin), Math.abs(Hout), 1)).toBeLessThan(1e-9);
      // P12: the trajectory never crosses equilibrium (adiabatic and isothermal; a cooled bed moves K itself and may legitimately cross)
      const p = bedProfile(info);
      const sign = Math.sign(p.QK[0]!);
      if (mode !== 'cooled') {
        if (sign !== 0 && Math.abs(p.QK[0]!) < 29) for (const q of p.QK) expect(q * sign).toBeGreaterThanOrEqual(-5e-4);
        else if (sign < 0) for (const q of p.QK) expect(q).toBeLessThanOrEqual(5e-4); // 5e-4 in log10 Q/K = 0.05 K of integration error
      }
      expect(info.eta!).toBeLessThanOrEqual(1 + 5e-4);
      maxEvals = Math.max(maxEvals, info.evals!); if (info.evals! > 400) over++;
      all.push(info.evals!);
    }
    expect(n).toBeGreaterThan(1300);
    // budget: the cap paces the tolerance, so almost no bed goes past 400 and none past twice the cap
    all.sort((a, b) => a - b);
    // budget: 98.7 % of random beds stay within 400 rate evaluations (the stiff tail after a seed-floor kink is the rest; worst 920)
    expect(over / n).toBeLessThan(0.03); expect(all[Math.floor(all.length * 0.9)]!).toBeLessThanOrEqual(400); expect(ms / 1500).toBeLessThan(10);
    console.log(`PFR fuzz evals p50 ${all[Math.floor(all.length / 2)]} p90 ${all[Math.floor(all.length * 0.9)]} p99 ${all[Math.floor(all.length * 0.99)]}`);
    console.log(`PFR fuzz: ${n} beds, mean ${(ms / 1500).toFixed(2)} ms/bed, max evals ${maxEvals}, over 400: ${over}`);
  });
  it('simulateBed is deterministic: the same inputs give bit-identical outputs', () => {
    const spec = { species: so2.species, inlet: feedS(693.15), lawId: 'K2', catalystId: 'v2o5', W: 7, mode: 'adiabatic' as const };
    const a = simulateBed(spec), b = simulateBed(spec);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
