import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { dmath } from '@core/numerics';
import { makeMixture, enthalpyFlow } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { hx, U_TABLE } from './hx';

const SP = ['N2', 'O2', 'Ar', 'H2O', 'CO2', 'CH4', 'H2'];
const mx = makeMixture(SP);
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'E1', type: 'hx', pos: { x: 0, y: 0 }, rot: 0, params });
const AR = (f: number, T: number): StreamState => ({ n: [0, 0, f, 0, 0, 0, 0], T, P: 1e5 });
const CPAR = 20.786;

describe('heat exchanger (2 streams, counter-current)', () => {
  it('hand-computed eps-NTU (Incropera 11.3, counter-flow): Ar hot 1 mol/s 500 K, cold 2 mol/s 300 K, UA = 1.5 Cmin', () => {
    const Ch = CPAR, Cc = 2 * CPAR, Cmin = Ch, Cr = 0.5, NTU = 1.5, U = 100;
    const e = (1 - dmath.exp(-NTU * (1 - Cr))) / (1 - Cr * dmath.exp(-NTU * (1 - Cr)));
    const Q = e * Cmin * 200;
    const r = hx({ hot_in: AR(1, 500), cold_in: AR(2, 300) }, mk({ area: (NTU * Cmin) / U, U }), ctx);
    if (!r.ok) throw new Error(r.code);
    expect(r.value.info!.Q).toBeCloseTo(Q, 3);
    expect(r.value.outlets.hot_out!.T).toBeCloseTo(500 - Q / Ch, 4);
    expect(r.value.outlets.cold_out!.T).toBeCloseTo(300 + Q / Cc, 4);
    expect(r.value.info!.eps).toBeCloseTo(e, 6);
    expect(r.value.info!.NTU).toBeCloseTo(NTU, 6);
  });
  it('balanced streams Cr = 1: eps = NTU/(1+NTU) (Kays & London limit)', () => {
    const r = hx({ hot_in: AR(1, 600), cold_in: AR(1, 300) }, mk({ area: 2 * CPAR / 50, U: 50 }), ctx);
    if (!r.ok) throw new Error(r.code);
    expect(r.value.info!.eps).toBeCloseTo(2 / 3, 6);
    expect(r.value.info!.Q).toBeCloseTo((2 / 3) * CPAR * 300, 2);
  });
  it('hot-outlet-T spec gives the area needed, and that area reproduces the spec (round trip)', () => {
    const a = hx({ hot_in: AR(1, 500), cold_in: AR(2, 300) }, mk({ T_hot_out: 380, U: 100 }), ctx);
    if (!a.ok) throw new Error(a.code);
    expect(a.value.outlets.hot_out!.T).toBeCloseTo(380, 9);
    const b = hx({ hot_in: AR(1, 500), cold_in: AR(2, 300) }, mk({ area: a.value.info!.area, U: 100 }), ctx);
    if (!b.ok) throw new Error(b.code);
    expect(b.value.outlets.hot_out!.T).toBeCloseTo(380, 5);
  });
  it('energy balance: heat lost by hot = heat gained by cold (1e-6 rel), no external duty or work', () => {
    const hi = { n: [1, 0.2, 0, 1, 0.3, 0, 0], T: 700, P: 2e5 }, ci = { n: [0.5, 0, 0, 0, 0, 2, 1], T: 320, P: 3e5 };
    const r = hx({ hot_in: hi, cold_in: ci }, mk({ area: 12 }), ctx);
    if (!r.ok) throw new Error(r.code);
    const o = r.value.outlets;
    const lost = enthalpyFlow(mx, hi) - enthalpyFlow(mx, o.hot_out!), gain = enthalpyFlow(mx, o.cold_out!) - enthalpyFlow(mx, ci);
    expect(Math.abs(lost - gain) / Math.abs(lost)).toBeLessThan(1e-9);
    expect(r.value.duty ?? 0).toBe(0); expect(r.value.work ?? 0).toBe(0);
    expect(o.hot_out!.P).toBe(2e5); expect(o.cold_out!.P).toBe(3e5);
  });
  it('TEMPERATURE_CROSS when the hot-outlet spec is infeasible (cold would leave hotter than the hot inlet)', () => {
    // hot 1 mol/s Ar 500 K, cold 0.2 mol/s at 300 K: cooling hot to 300.5 K needs the cold stream to exceed 500 K
    const r = hx({ hot_in: AR(1, 500), cold_in: AR(0.2, 300) }, mk({ T_hot_out: 320 }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('TEMPERATURE_CROSS'); expect(r.data.T_cold_out).toBeGreaterThan(500); expect(r.data.T_hot_in).toBe(500); }
    const r2 = hx({ hot_in: AR(1, 500), cold_in: AR(1, 300) }, mk({ T_hot_out: 250 }), ctx); // below the cold inlet
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.code).toBe('TEMPERATURE_CROSS');
    const r3 = hx({ hot_in: AR(1, 500), cold_in: AR(1, 300) }, mk({ T_hot_out: 520 }), ctx); // heating the hot stream
    expect(r3.ok).toBe(false); if (!r3.ok) expect(r3.code).toBe('TEMPERATURE_CROSS');
  });
  it('hot inlet colder than cold inlet: TEMPERATURE_CROSS', () => {
    const r = hx({ hot_in: AR(1, 300), cold_in: AR(1, 400) }, mk({ area: 5 }), ctx);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('TEMPERATURE_CROSS');
  });
  it('DT_MIN_VIOLATED (warn) when the end approach is below dt_min (default 10 K); none when above', () => {
    const tight = hx({ hot_in: AR(1, 500), cold_in: AR(1, 300) }, mk({ area: 1e4, U: 100 }), ctx);
    if (!tight.ok) throw new Error(tight.code);
    const d = tight.diag.find((x) => x.code === 'DT_MIN_VIOLATED');
    expect(d?.severity).toBe('warn'); expect(d?.data.dT_min).toBeLessThan(10); expect(d?.data.limit).toBe(10);
    const loose = hx({ hot_in: AR(1, 500), cold_in: AR(1, 300) }, mk({ area: 0.05, U: 100 }), ctx);
    if (!loose.ok) throw new Error(loose.code);
    expect(loose.diag.find((x) => x.code === 'DT_MIN_VIOLATED')).toBeUndefined();
    expect(loose.value.info!.dT_min).toBeGreaterThan(100);
  });
  it('U by service: table entries carry src and conf; gas-gas < gas-liquid < liquid-liquid; U override wins', () => {
    for (const k of Object.keys(U_TABLE)) { expect(U_TABLE[k]!.src.length).toBeGreaterThan(0); expect(U_TABLE[k]!.conf).toBeTruthy(); }
    expect(U_TABLE.gas_gas!.U).toBeLessThan(U_TABLE.gas_liquid!.U); expect(U_TABLE.gas_liquid!.U).toBeLessThan(U_TABLE.liquid_liquid!.U);
    const a = hx({ hot_in: AR(1, 500), cold_in: AR(1, 300) }, mk({ area: 1 }), ctx);
    const b = hx({ hot_in: AR(1, 500), cold_in: AR(1, 300) }, mk({ area: 1, service: 'liquid_liquid' }), ctx);
    if (!a.ok || !b.ok) throw new Error('x');
    expect(a.value.info!.U).toBe(U_TABLE.gas_gas!.U); expect(b.value.info!.U).toBe(U_TABLE.liquid_liquid!.U);
    expect(b.value.info!.Q).toBeGreaterThan(a.value.info!.Q!);
  });
  it('P15 fuzz (10 000): no temperature cross, Q <= Q_max, eps <= 1, energy closes', () => {
    const rng = new Rng(15);
    let nOk = 0, nCross = 0;
    for (let i = 0; i < 10000; i++) {
      const rs = (): number[] => { const n = SP.map(() => (rng.next() < 0.5 ? 0 : rng.next() * 4)); n[Math.floor(rng.next() * SP.length)]! += 0.05 + rng.next(); return n; };
      const nh = rs(), nc = rs();
      const Tc = 200 + rng.next() * 500, Th = Tc + 1 + rng.next() * 700;
      const hi: StreamState = { n: nh, T: Th, P: 2e5 }, ci: StreamState = { n: nc, T: Tc, P: 2e5 };
      const params: Record<string, number> = rng.next() < 0.5 ? { area: dmath.exp(dmath.log(1e-3) + rng.next() * dmath.log(1e8)) } : { T_hot_out: Tc - 20 + rng.next() * (Th - Tc + 40) };
      const r = hx({ hot_in: hi, cold_in: ci }, mk(params), ctx);
      if (!r.ok) { expect(r.code).toBe('TEMPERATURE_CROSS'); expect(params.T_hot_out).toBeDefined(); nCross++; continue; }
      nOk++;
      const o = r.value.outlets, Q = r.value.info!.Q!;
      expect(o.hot_out!.T).toBeGreaterThanOrEqual(Tc - 1e-6);
      expect(o.cold_out!.T).toBeLessThanOrEqual(Th + 1e-6);
      expect(o.hot_out!.T).toBeLessThanOrEqual(Th + 1e-9); expect(o.cold_out!.T).toBeGreaterThanOrEqual(Tc - 1e-9);
      const Qmax = Math.min(enthalpyFlow(mx, hi) - enthalpyFlow(mx, { ...hi, T: Tc }), enthalpyFlow(mx, { ...ci, T: Th }) - enthalpyFlow(mx, ci));
      expect(Q).toBeLessThanOrEqual(Qmax * (1 + 1e-9) + 1e-9);
      expect(r.value.info!.eps).toBeLessThanOrEqual(1 + 1e-9);
      const lost = enthalpyFlow(mx, hi) - enthalpyFlow(mx, o.hot_out!), gain = enthalpyFlow(mx, o.cold_out!) - enthalpyFlow(mx, ci);
      const big = Math.max(Math.abs(enthalpyFlow(mx, hi)), Math.abs(enthalpyFlow(mx, ci)), Math.abs(lost), 1);
      expect(Math.abs(lost - gain) / big).toBeLessThan(1e-6);
      expect(Number.isFinite(o.hot_out!.T) && Number.isFinite(o.cold_out!.T)).toBe(true);
    }
    expect(nOk).toBeGreaterThan(5000); expect(nCross).toBeGreaterThan(0);
  });
});
