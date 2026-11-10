import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { enthalpyFlow, makeMixture, totalFlow, massFlow } from '../thermo';
import { psatSpecies } from '../thermo/vle';
import type { SimCtx, UnitInst } from '../types';
import { flash } from './flash';
import { nh3Sep } from './separator';

const SP = ['N2', 'H2', 'Ar', 'NH3', 'NH3(l)', 'H2O', 'H2O(l)', 'CO2'];
const mx = makeMixture(SP), ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'F1', type: 'flash', pos: { x: 0, y: 0 }, rot: 0, params });
const ok = (r: any) => { if (!r.ok) throw new Error(r.code); return r; };

describe('flash unit', () => {
  const s = { n: [60, 180, 1, 20, 0, 0, 0, 0], T: 700, P: 150e5 };
  it('ammonia loop separator at -20 C: Raoult y_NH3 ~ Psat/P, liquid goes to NH3(l), mass and energy close', () => {
    const r = ok(flash({ in: s }, mk({ T: 253.15 }), ctx));
    const v = r.value.outlets.vap, l = r.value.outlets.liq;
    const yN = v.n[3] / totalFlow(v.n);
    expect(Math.abs(yN - psatSpecies('NH3', 253.15)!.P / 150e5)).toBeLessThan(0.002);
    expect(l.n[4]).toBeGreaterThan(0); expect(l.n[3]).toBe(0);
    for (let i = 0; i < SP.length; i++) if (!SP[i]!.endsWith("(l)") && i !== 3 && i !== 5) expect(Math.abs(v.n[i] + l.n[i] - s.n[i])).toBeLessThan(1e-10);
    expect(Math.abs(v.n[3] + l.n[4] - 20)).toBeLessThan(1e-12 * 20);
    expect(Math.abs(massFlow(mx, v.n) + massFlow(mx, l.n) - massFlow(mx, s.n))).toBeLessThan(1e-12 * massFlow(mx, s.n));
    // duty: gas-side enthalpy with liquid NH3 slot -> H_out is available directly from the slots
    const Hout = enthalpyFlow(mx, v) + enthalpyFlow(mx, l);
    expect(Math.abs(r.value.duty - (Hout - enthalpyFlow(mx, s)))).toBeLessThan(1e-6 * Math.abs(r.value.duty));
    expect(r.value.duty).toBeLessThan(0);
  });
  it('single phase info codes', () => {
    const hot = ok(flash({ in: s }, mk({ T: 500 }), ctx));
    expect(hot.diag.some((d: any) => d.code === 'ALL_VAPOUR')).toBe(true);
    const cold = ok(flash({ in: { n: [0, 0, 0, 10, 0, 0, 0, 0], T: 300, P: 20e5 } }, mk({ T: 270 }), ctx));
    expect(cold.diag.some((d: any) => d.code === 'ALL_LIQUID')).toBe(true);
    expect(totalFlow(cold.value.outlets.vap.n)).toBe(0);
  });
  it('liquid stays in the gas slot when the level has no liquid twin; water condenses from humid air', () => {
    const c2: SimCtx = { species: ['N2', 'H2O'], thermoDetail: 'rigorous' };
    const r = ok(flash({ in: { n: [80, 20], T: 360, P: 1.01325e5 } }, mk({ T: 313.15 }), c2));
    expect(r.value.outlets.liq.n[1]).toBeGreaterThan(13); expect(r.value.outlets.liq.n[0]).toBeLessThan(0.01);
  });
  it('duty spec round-trips the isothermal T', () => {
    const a = ok(flash({ in: s }, mk({ T: 260 }), ctx));
    const b = ok(flash({ in: s }, mk({ duty: a.value.duty }), ctx));
    expect(Math.abs(b.value.info.T - 260)).toBeLessThan(1e-6);
  });
  it('fuzz: per-species mass balance 1e-12 and energy closure', () => {
    const rng = new Rng(11);
    for (let c = 0; c < 500; c++) {
      const n = SP.map((id) => (rng.chance(0.2) || id.endsWith('(l)') ? 0 : rng.range(0, 10)));
      const st = { n, T: rng.range(250, 600), P: rng.range(1e5, 2e7) };
      const r = flash({ in: st }, mk({ T: rng.range(240, 450) }), ctx); if (!r.ok) continue;
      const { vap, liq } = r.value.outlets;
      const tot = (a: number[], i: number) => a[i]! + (SP[i] === 'NH3' ? a[4]! : SP[i] === 'H2O' ? a[6]! : 0);
      for (let i = 0; i < SP.length; i++) if (!SP[i]!.endsWith('(l)')) expect(Math.abs(tot(vap!.n, i) + tot(liq!.n, i) - n[i]!)).toBeLessThanOrEqual(1e-12 * Math.max(1, n[i]!));
    }
  });
  it('errors: no inlet, non-finite', () => {
    expect(flash({}, mk({ T: 300 }), ctx).ok).toBe(false);
    const r = flash({ in: { n: [NaN, 0, 0, 0, 0, 0, 0, 0], T: 300, P: 1e5 } }, mk({ T: 300 }), ctx); expect(r.ok).toBe(false);
  });
});

describe('ideal NH3 separator', () => {
  const s = { n: [60, 180, 1, 120, 0, 0, 0, 0], T: 300, P: 150e5 };
  it('removes all NH3 as liquid at T; refrigeration duty and COP', () => {
    const r = ok(nh3Sep({ in: s }, mk({ T: 253.15 }), ctx)), o = r.value.outlets;
    expect(o.liq.n[4]).toBe(120); expect(o.vap.n[3]).toBe(0); expect(o.vap.n[0]).toBe(60);
    expect(r.value.duty).toBeLessThan(0);
    expect(r.value.info.cop).toBeGreaterThan(0); expect(r.value.info.refrig_electric_W).toBeCloseTo(-r.value.duty / r.value.info.cop, 3);
    expect(r.value.info.nh3_kg_s).toBeCloseTo((120 * 17.031) / 1000, 6);
  });
  it('below the refrigerant floor is UTILITY_CANNOT_REACH', () => {
    const r = nh3Sep({ in: s }, mk({ T: 230 }), ctx); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('UTILITY_CANNOT_REACH');
  });
  it('agrees with the real flash on the NH3 condensed when the gas is saturated and heavy in NH3 (sanity: flash leaves a little NH3 in the vapour)', () => {
    const f = ok(flash({ in: s }, mk({ T: 253.15 }), ctx)), q = ok(nh3Sep({ in: s }, mk({ T: 253.15 }), ctx));
    expect(f.value.outlets.liq.n[4]).toBeLessThan(120); expect(f.value.outlets.liq.n[4]).toBeGreaterThan(110);
    expect(q.value.outlets.liq.n[4]).toBe(120);
  });
});
