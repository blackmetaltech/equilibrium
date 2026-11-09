import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { makeMixture, enthalpyFlow, entropyFlow } from '../thermo';
import { THERMO, cpOf } from '../thermo/species';
import type { SimCtx, UnitInst } from '../types';
import { heater } from './heater';
import { UTIL, copAt, LHV_CH4, steamLatent } from './utilities';

const SP = ['N2', 'O2', 'Ar', 'H2O', 'CO2', 'CH4', 'H2'];
const mx = makeMixture(SP);
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'H1', type: 'heater', pos: { x: 0, y: 0 }, rot: 0, params });
const N2 = (T: number, f = 1) => ({ n: [f, 0, 0, 0, 0, 0, 0], T, P: 1e5 });
const ok = <T,>(r: { ok: boolean } & Record<string, unknown>): T => { if (!r.ok) throw new Error(String(r.code)); return r.value as T; };

describe('heater / cooler', () => {
  it('Q = H_out - H_in exactly (outlet T spec); duty is positive for heating', () => {
    const s = { n: [1, 0.3, 0.1, 0.2, 0, 0, 0], T: 350, P: 5e5 };
    const v = ok<{ outlets: Record<string, any>; duty: number }>(heater({ in: s }, mk({ T: 620 }), ctx));
    const Q = enthalpyFlow(mx, v.outlets.out) - enthalpyFlow(mx, s);
    expect(v.duty).toBe(Q); expect(Q).toBeGreaterThan(0);
    expect(v.outlets.out.T).toBe(620); expect(v.outlets.out.n).toEqual(s.n);
  });
  it('NIST-JANAF N2: H(500)-H(300) = 5.911 - 0.054 = 5.857 kJ/mol within 0.5 %', () => {
    const v = ok<{ duty: number }>(heater({ in: N2(300) }, mk({ T: 500 }), ctx));
    expect(Math.abs(v.duty / 1000 - 5.857) / 5.857).toBeLessThan(0.005);
  });
  it('N2 heated 300 -> 450 K equals the integral of Cp dT from the thermo module (Simpson; 450 K stays inside the 100-500 K Shomate segment, 500 K is a NIST break with a 0.77 J/mol H jump)', () => {
    const v = ok<{ duty: number }>(heater({ in: N2(300, 2) }, mk({ T: 450 }), ctx));
    const nS = 2000, h = 150 / nS, f = (T: number) => cpOf(THERMO.N2!, T);
    let sum = f(300) + f(450);
    for (let i = 1; i < nS; i++) sum += f(300 + i * h) * (i % 2 ? 4 : 2);
    expect(v.duty / 2).toBeCloseTo((sum * h) / 3, 5);
  });
  it('duty spec: outlet T solved from H_in + Q round-trips the T spec', () => {
    const a = ok<{ duty: number }>(heater({ in: N2(300) }, mk({ T: 555 }), ctx));
    const b = ok<{ outlets: Record<string, any> }>(heater({ in: N2(300) }, mk({ duty: a.duty }), ctx));
    expect(b.outlets.out.T).toBeCloseTo(555, 7);
  });
  it('pressure drop dP is applied; a drop larger than P_in is PRESSURE_NONPOSITIVE', () => {
    const v = ok<{ outlets: Record<string, any> }>(heater({ in: N2(300) }, mk({ T: 400, dP: 2e4 }), ctx));
    expect(v.outlets.out.P).toBe(1e5 - 2e4);
    const r = heater({ in: N2(300) }, mk({ T: 400, dP: 2e5 }), ctx);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('PRESSURE_NONPOSITIVE');
  });
  it('no spec -> SPEC_MISSING; zero flow passes through with zero duty', () => {
    const r = heater({ in: N2(300) }, mk({}), ctx); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('SPEC_MISSING');
    const z = ok<{ duty: number; outlets: Record<string, any> }>(heater({ in: N2(300, 0) }, mk({ T: 400 }), ctx));
    expect(z.duty).toBe(0);
  });

  describe('utilities (DESIGN 3.7 / 3.8)', () => {
    it('cooling water cannot cool below 35 C (arrives at 30 C): UTILITY_CANNOT_REACH, with the floor in the data', () => {
      const r = heater({ in: N2(400) }, mk({ T: 293.15, utility: 'cw' }), ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.code).toBe('UTILITY_CANNOT_REACH'); expect(r.data.T_out).toBeCloseTo(293.15, 9); expect(r.data.T_limit).toBeCloseTo(308.15, 9); expect(r.data.utility).toBe('cw'); }
      expect(heater({ in: N2(400) }, mk({ T: 308.15, utility: 'cw' }), ctx).ok).toBe(true);
    });
    it('refrigerant reaches -33 C, not below; LP steam heats to 140 C, not above; fired to 900 C, not above', () => {
      expect(heater({ in: N2(300) }, mk({ T: 240.15, utility: 'refrig' }), ctx).ok).toBe(true);
      expect(heater({ in: N2(300) }, mk({ T: 235, utility: 'refrig' }), ctx).ok).toBe(false);
      expect(heater({ in: N2(300) }, mk({ T: 413.15, utility: 'steam' }), ctx).ok).toBe(true);
      const s = heater({ in: N2(300) }, mk({ T: 430, utility: 'steam' }), ctx);
      expect(s.ok).toBe(false); if (!s.ok) expect(s.code).toBe('UTILITY_CANNOT_REACH');
      expect(heater({ in: N2(300) }, mk({ T: 1173.15, utility: 'fired' }), ctx).ok).toBe(true);
      expect(heater({ in: N2(300) }, mk({ T: 1200, utility: 'fired' }), ctx).ok).toBe(false);
    });
    it('a heating utility cannot cool and a cooling utility cannot heat', () => {
      expect(heater({ in: N2(400) }, mk({ T: 350, utility: 'steam' }), ctx).ok).toBe(false);
      expect(heater({ in: N2(300) }, mk({ T: 350, utility: 'cw' }), ctx).ok).toBe(false);
    });
    it('fired heater: fuel power = Q / 0.85; CH4 fuel flow = fuel / LHV(CH4) (LHV = 802.3 kJ/mol from dHf); CO2 = 1 mol per CH4', () => {
      const v = ok<{ duty: number; info: Record<string, number> }>(heater({ in: N2(300, 10) }, mk({ T: 900, utility: 'fired' }), ctx));
      expect(v.info.fuel_W).toBeCloseTo(v.duty / 0.85, 6);
      expect(LHV_CH4).toBeCloseTo(802.3e3, -2);
      expect(v.info.fuel_CH4_mol_s).toBeCloseTo(v.info.fuel_W / LHV_CH4, 9);
      expect(v.info.co2_mol_s).toBe(v.info.fuel_CH4_mol_s);
      expect(UTIL.fired.eff).toBe(0.85);
    });
    it('LP steam: kg/s = Q / latent heat; boiler fuel = Q / 0.90; latent heat of water at 140 C within 2.5 % of the steam table (2144.7 kJ/kg)', () => {
      const v = ok<{ duty: number; info: Record<string, number> }>(heater({ in: N2(300, 5) }, mk({ T: 400, utility: 'steam' }), ctx));
      expect(v.info.steam_kg_s).toBeCloseTo(v.duty / steamLatent(), 9);
      expect(v.info.boiler_fuel_W).toBeCloseTo(v.duty / 0.9, 6);
      expect(Math.abs(steamLatent() - 2.1447e6) / 2.1447e6).toBeLessThan(0.025);
    });
    it('cooling water: duty reported (positive W removed); no fuel/electric terms', () => {
      const v = ok<{ duty: number; info: Record<string, number> }>(heater({ in: N2(500, 5) }, mk({ T: 330, utility: 'cw' }), ctx));
      expect(v.duty).toBeLessThan(0); expect(v.info.cw_duty_W).toBeCloseTo(-v.duty, 6);
      expect(v.info.fuel_W).toBeUndefined();
    });
    it('refrigeration: electric W = |Q| / COP with COP = 0.5 Tc/(Th-Tc) (Tc = -33 C, Th = 35 C)', () => {
      const v = ok<{ duty: number; info: Record<string, number> }>(heater({ in: N2(300, 5) }, mk({ T: 250, utility: 'refrig' }), ctx));
      const cop = 0.5 * 240.15 / (308.15 - 240.15);
      expect(v.info.cop).toBeCloseTo(cop, 9); expect(v.info.refrig_electric_W).toBeCloseTo(-v.duty / cop, 6);
    });
    it('P17 fuzz: refrigeration COP never exceeds Carnot Tc/(Th-Tc) (10 000 random T_cold, T_hot)', () => {
      const rng = new Rng(17);
      for (let i = 0; i < 10000; i++) {
        const Tc = 150 + rng.next() * 150, Th = Tc + 1 + rng.next() * 200;
        const c = copAt(Tc, Th);
        expect(c).toBeLessThanOrEqual(Tc / (Th - Tc)); expect(c).toBeGreaterThan(0);
        expect(c).toBeCloseTo(0.5 * Tc / (Th - Tc), 12);
      }
    });
    it('P13 fuzz: S_gen = S_out - S_in - Q/T_utility >= -1e-9 kW/K for heaters and coolers at their utility temperatures (3000 cases)', () => {
      const rng = new Rng(13);
      const names = ['steam', 'fired', 'cw', 'refrig'] as const;
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const u = names[Math.floor(rng.next() * 4)]!;
        const n_ = SP.map(() => (rng.next() < 0.4 ? 0 : rng.next() * 5)); n_[0] = 0.1 + rng.next() * 5;
        const Tin = 250 + rng.next() * 700, P = 1e5 * (1 + rng.next() * 50);
        const heating = u === 'steam' || u === 'fired';
        const lim = UTIL[u].T;
        const Tout = heating ? Tin + rng.next() * Math.max(0, lim - Tin) : lim + rng.next() * Math.max(0, Tin - lim);
        if (!(heating ? Tout >= Tin : Tout <= Tin)) continue;
        const s = { n: n_, T: Tin, P };
        const r = heater({ in: s }, mk({ T: Tout, utility: u, dP: rng.next() * 0.1 * P }), ctx);
        if (!r.ok) continue;
        n++;
        const o = r.value.outlets.out!, Q = r.value.duty!;
        const Sgen = entropyFlow(mx, o) - entropyFlow(mx, s) - Q / UTIL[u].T;
        expect(Sgen).toBeGreaterThanOrEqual(-1e-6); // W/K == -1e-9 kW/K
        expect(Number.isFinite(Sgen)).toBe(true);
      }
      expect(n).toBeGreaterThan(1000);
    });
  });
});
