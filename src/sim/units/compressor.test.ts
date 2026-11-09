import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { dmath } from '@core/numerics';
import { makeMixture, enthalpyFlow } from '../thermo';
import { THERMO, cpOf } from '../thermo/species';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { compressor, isentropicT } from './compressor';

const R = 8.314462618;
const SP = ['N2', 'O2', 'Ar', 'H2O(l)', 'CO2', 'CH4', 'H2'];
const mx = makeMixture(SP);
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'K1', type: 'compressor', pos: { x: 0, y: 0 }, rot: 0, params });
const AR = (f: number, T: number, P = 1e5): StreamState => ({ n: [0, 0, f, 0, 0, 0, 0], T, P });
const AIR = (f: number, T: number, P = 1e5): StreamState => ({ n: [0.79 * f, 0.21 * f, 0, 0, 0, 0, 0], T, P });
type V = { outlets: Record<string, StreamState>; duty?: number; work?: number; info?: Record<string, number> };
const val = (r: any): V => { if (!r.ok) throw new Error(r.code); return r.value; };

describe('compressor (ideal-gas isentropic with Shomate S)', () => {
  it('argon (monatomic, Cp = 5/2 R): T2s = T1 (P2/P1)^(R/Cp) = T1 r^0.4 to 1e-6 relative; eta = 1 gives T_out = T2s', () => {
    const v = val(compressor({ in: AR(1, 300) }, mk({ P: 2e5, eta: 1 }), ctx));
    // NIST Ar Cp = 20.786 vs 5/2 R = 20.78616 (7.5e-6 apart): exact exponent R/Cp at 1e-6, the textbook 0.4 at 5e-6
    expect(Math.abs(v.outlets.out!.T - 300 * dmath.pow(2, R / 20.786)) / 395.8).toBeLessThan(1e-6);
    expect(Math.abs(v.outlets.out!.T - 300 * dmath.pow(2, 0.4)) / 395.8).toBeLessThan(5e-6);
    expect(v.info!.Ts_1).toBeCloseTo(v.outlets.out!.T, 9);
    expect(Math.abs(v.work! - 20.786 * (v.outlets.out!.T - 300)) / v.work!).toBeLessThan(1e-6);
  });
  it('isentropicT: N2 1 -> 3 bar from 300 K matches the integral of Cp/T dT = R ln r (Simpson on thermo Cp, 1e-7; stays inside one Shomate segment)', () => {
    const T2s = isentropicT(mx, [1, 0, 0, 0, 0, 0, 0], 300, 1e5, 3e5);
    expect(T2s).toBeLessThan(500);
    const f = (T: number) => cpOf(THERMO.N2!, T) / T;
    const N = 4000, h = (T2s - 300) / N;
    let s = f(300) + f(T2s);
    for (let i = 1; i < N; i++) s += f(300 + i * h) * (i % 2 ? 4 : 2);
    expect((s * h) / 3).toBeCloseTo(R * dmath.log(3), 7);
  });
  it('isentropicT: air 1 -> 10 bar from 300 K: R ln r = integral of Cp/T within the NIST segment-break jumps (0.01 J/mol/K) and textbook gamma = 1.4 within 1.5 %', () => {
    const n = [0.79, 0.21, 0, 0, 0, 0, 0];
    const T2s = isentropicT(mx, n, 300, 1e5, 1e6);
    const f = (T: number) => (0.79 * cpOf(THERMO.N2!, T) + 0.21 * cpOf(THERMO.O2!, T)) / T;
    const N = 4000, h = (T2s - 300) / N;
    let s = f(300) + f(T2s);
    for (let i = 1; i < N; i++) s += f(300 + i * h) * (i % 2 ? 4 : 2);
    expect(Math.abs((s * h) / 3 - R * dmath.log(10))).toBeLessThan(0.01);
    expect(Math.abs(T2s - 300 * dmath.pow(10, 0.4 / 1.4)) / T2s).toBeLessThan(0.015);
    expect(T2s).toBeGreaterThan(560); expect(T2s).toBeLessThan(590);
  });
  it('air 1 -> 10 bar in 3 intercooled stages: W vs hand calc W = n Cp T1 (r^(R/Cp) - 1)/eta per stage (Cp at mean T) within 1.5 %', () => {
    const v = val(compressor({ in: AIR(1, 300) }, mk({ P: 1e6, stages: 3, eta: 0.75 }), ctx));
    expect(v.info!.ratio).toBeCloseTo(dmath.pow(10, 1 / 3), 12);
    const Cp = 29.2, r = dmath.pow(10, 1 / 3);
    // stage 1 inlet 300 K, stages 2-3 inlet 313.15 K (intercooled to 40 C)
    const w = (T1: number) => (Cp * T1 * (dmath.pow(r, R / Cp) - 1)) / 0.75;
    const want = w(300) + 2 * w(313.15);
    expect(Math.abs(v.work! - want) / want).toBeLessThan(0.015);
    expect(v.outlets.out!.P).toBeCloseTo(1e6, 6);
  });
  it('energy closes: H_in + intercooler duty + shaft work = H_out (1e-9 relative of the largest term)', () => {
    const s = AIR(2.5, 310);
    const v = val(compressor({ in: s }, mk({ P: 8e5, stages: 2 }), ctx));
    const lhs = enthalpyFlow(mx, s) + v.duty! + v.work!, rhs = enthalpyFlow(mx, v.outlets.out!);
    expect(Math.abs(lhs - rhs) / Math.max(Math.abs(lhs), Math.abs(v.work!))).toBeLessThan(1e-9);
    expect(v.duty!).toBeLessThan(0); expect(v.work!).toBeGreaterThan(0);
    expect(v.info!.intercool_W).toBeCloseTo(-v.duty!, 6);
  });
  it('single stage has no intercooler duty; info carries kW shaft, kW electric (/0.95) and T_out per stage', () => {
    const v = val(compressor({ in: AIR(1, 300) }, mk({ P: 2e5 }), ctx));
    expect(v.duty ?? 0).toBe(0);
    expect(v.info!.shaft_kW).toBeCloseTo(v.work! / 1000, 9);
    expect(v.info!.electric_kW).toBeCloseTo(v.work! / 1000 / 0.95, 9);
    expect(v.info!.T_out_1).toBe(v.outlets.out!.T);
    expect(v.info!.stages).toBe(1); expect(v.info!.eta).toBe(0.75);
  });
  it('a ~1 MW compressor (BUILD-PLAN 1.10 costing case): shaft kW in info is within the 450-3000 kW correlation range', () => {
    // find flow giving 1 MW: W is linear in flow
    const w1 = val(compressor({ in: AIR(1, 300) }, mk({ P: 3e5, stages: 1 }), ctx)).work!;
    const v = val(compressor({ in: AIR(1e6 / w1, 300) }, mk({ P: 3e5, stages: 1 }), ctx));
    expect(v.info!.shaft_kW).toBeCloseTo(1000, 6);
  });
  it('multistage with intercooling uses less shaft work than a single stage (same eta, same ratio)', () => {
    const w = (st: number) => val(compressor({ in: AIR(1, 313.15) }, mk({ P: 3e5, stages: st }), ctx)).work!;
    expect(w(2)).toBeLessThan(w(1)); expect(w(3)).toBeLessThan(w(2)); expect(w(4)).toBeLessThan(w(3));
  });
  it('DISCHARGE_TOO_HOT (> 200 C per stage): air 1 -> 10 bar single stage names stage, T and the limit', () => {
    const r = compressor({ in: AIR(1, 300) }, mk({ P: 1e6, stages: 1 }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('DISCHARGE_TOO_HOT'); expect(r.data.stage).toBe(1); expect(r.data.T_out).toBeGreaterThan(473.15); expect(r.data.T_max).toBeCloseTo(473.15, 9); }
  });
  it('COMPRESSOR_LIQUID_IN when a liquid species is in the feed; P_out < P_in is COMPRESSOR_P_FALL; stages outside 1-4 rejected', () => {
    const liq: StreamState = { n: [1, 0, 0, 0.1, 0, 0, 0], T: 300, P: 1e5 };
    const a = compressor({ in: liq }, mk({ P: 2e5 }), ctx); expect(a.ok).toBe(false); if (!a.ok) { expect(a.code).toBe('COMPRESSOR_LIQUID_IN'); expect(a.data.n_liquid).toBeCloseTo(0.1, 12); }
    const b = compressor({ in: AIR(1, 300) }, mk({ P: 5e4 }), ctx); expect(b.ok).toBe(false); if (!b.ok) expect(b.code).toBe('COMPRESSOR_P_FALL');
    const c = compressor({ in: AIR(1, 300) }, mk({ P: 2e5, stages: 5 }), ctx); expect(c.ok).toBe(false); if (!c.ok) expect(c.code).toBe('COMPRESSOR_STAGES');
  });
  it('P16 fuzz (10 000): W >= isentropic work and T_out >= T_s,out for random ratios, stages, etas, mixtures', () => {
    const rng = new Rng(16);
    let nOk = 0;
    for (let i = 0; i < 10000; i++) {
      const gas = [0, 1, 2, 4, 5, 6];
      const n = SP.map(() => 0); for (const g of gas) if (rng.next() < 0.5) n[g] = rng.next() * 3; n[gas[Math.floor(rng.next() * gas.length)]!]! += 0.1;
      const T1 = 250 + rng.next() * 150, P1 = 1e5 * (0.5 + rng.next() * 20);
      const P2 = P1 * (1.01 + rng.next() * 30), stages = 1 + Math.floor(rng.next() * 4), eta = 0.4 + rng.next() * 0.6;
      const r = compressor({ in: { n, T: T1, P: P1 } }, mk({ P: P2, stages, eta }), ctx);
      if (!r.ok) { expect(['DISCHARGE_TOO_HOT']).toContain(r.code); continue; }
      nOk++;
      const info = r.value.info!;
      expect(r.value.work!).toBeGreaterThanOrEqual(info.W_is! * (1 - 1e-12));
      expect(r.value.work!).toBeGreaterThan(0);
      expect(info.T_out_1!).toBeGreaterThanOrEqual(info.Ts_1! - 1e-9);
      expect(r.value.outlets.out!.T).toBeGreaterThanOrEqual(info[`Ts_${stages}`]! - 1e-9);
      expect(Number.isFinite(r.value.outlets.out!.T)).toBe(true);
    }
    expect(nOk).toBeGreaterThan(2000);
  });
});
