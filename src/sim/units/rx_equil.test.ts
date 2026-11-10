import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@core/numerics/test-util';
import haber from '../../oracle/fixtures/haber_grid.json';
import wgs from '../../oracle/fixtures/wgs_grid.json';
import beds from '../../oracle/fixtures/so2_beds.json';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlow, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { eqReactor, equilibriumStage } from './rx_equil';

const K0 = 273.15;
const mk = (params: Record<string, number | string> = {}, catalystId?: string): UnitInst => ({ id: 'E1', type: 'eq_reactor', pos: { x: 0, y: 0 }, rot: 0, params, catalystId });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const run = (s: StreamState, u: UnitInst, ctx: SimCtx) => {
  const r = eqReactor({ in: s }, u, ctx);
  if (!r.ok) throw new Error(r.code + JSON.stringify(r.data));
  return { ...(r.value as Out), diag: r.diag };
};
const H: SimCtx = { species: ['N2', 'H2', 'NH3'], thermoDetail: 'rigorous' };

describe('equilibrium reactor: isothermal ammonia converter (L10, L11)', () => {
  it('Haber grid fixture: y_NH3 over 6 T x 6 P within 0.2 % rel (ideal catalyst, window from the catalyst entry)', () => {
    for (const c of haber.cases) {
      const v = run({ n: [1, 3, 0], T: c.T_C + K0, P: c.P_bar * 1e5 }, mk({ reactions: 'R1', T: c.T_C + K0 }, 'fe_ammonia'), H);
      const n = v.outlets.out!.n, y = n[2]! / (n[0]! + n[1]! + n[2]!);
      expect(Math.abs(y / c.y_NH3 - 1), `${c.T_C} C ${c.P_bar} bar`).toBeLessThanOrEqual(haber.tolerance.rel);
    }
  });
  it('info carries X = Xeq, eta = 1, K (rigorous: 1.8e-4 -> 5.7e-6 bar^-2 from 400 to 550 C), Q/K at inlet and outlet, dTad', () => {
    const a = run({ n: [1, 3, 0], T: 400 + K0, P: 100e5 }, mk({ reactions: 'R1' }), H);
    expect(a.info.X).toBeGreaterThan(0.3); expect(a.info.X).toBeLessThan(0.4);
    expect(a.info.Xeq).toBe(a.info.X); expect(a.info.eta).toBe(1);
    expect(a.info.K).toBeGreaterThan(1.5e-4); expect(a.info.K).toBeLessThan(2.1e-4);
    const b = run({ n: [1, 3, 0], T: 550 + K0, P: 100e5 }, mk({ reactions: 'R1' }), H);
    expect(a.info.K! / b.info.K!).toBeGreaterThan(25); expect(a.info.K! / b.info.K!).toBeLessThan(40);
    expect(a.info.QK_in).toBe(-30); // no product in the feed: the beam is pinned at its stop, not infinite
    expect(Math.abs(a.info.QK_out!)).toBeLessThan(1e-9);
    expect(a.info.dTad).toBeGreaterThan(0); expect(a.info.Tmax).toBe(400 + K0);
    expect(a.duty).toBeLessThan(0); // exothermic, isothermal: heat removed
    expect(a.outlets.out!.P).toBe(100e5);
  });
  it('light-off window: asleep below 380 C (X = 0, BELOW_LIGHTOFF), awake at 380 C; Tmin param overrides the catalyst', () => {
    const s = (T: number): StreamState => ({ n: [1, 3, 0], T: T + K0, P: 100e5 });
    const cold = run(s(379), mk({ reactions: 'R1' }, 'fe_ammonia'), H);
    expect(cold.info.X).toBe(0); expect(cold.info.active).toBe(0); expect(cold.diag.map((d) => d.code)).toContain('BELOW_LIGHTOFF');
    expect(cold.outlets.out!.n).toEqual([1, 3, 0]);
    expect(run(s(380), mk({ reactions: 'R1' }, 'fe_ammonia'), H).info.X).toBeGreaterThan(0.2);
    expect(run(s(379), mk({ reactions: 'R1', Tmin: 300 + K0 }, 'fe_ammonia'), H).info.X).toBeGreaterThan(0.2);
  });
  it('inerts at constant P dilute (L11): 5 % inert gives less NH3 than pure feed', () => {
    const ctx: SimCtx = { species: ['N2', 'H2', 'NH3', 'Ar'], thermoDetail: 'rigorous' };
    const pure = run({ n: [1, 3, 0, 0], T: 450 + K0, P: 150e5 }, mk({ reactions: 'R1' }), ctx);
    const dil = run({ n: [1, 3, 0, 4 / 19], T: 450 + K0, P: 150e5 }, mk({ reactions: 'R1' }), ctx);
    const y = (v: { outlets: Record<string, StreamState> }) => v.outlets.out!.n[2]! / v.outlets.out!.n.reduce((a, b) => a + b, 0);
    expect(y(pure)).toBeCloseTo(0.212, 2); expect(y(dil)).toBeCloseTo(0.191, 2);
  });
});

describe('equilibrium reactor: water-gas shift (L12)', () => {
  const ctx: SimCtx = { species: ['CO', 'H2O', 'CO2', 'H2'], thermoDetail: 'rigorous' };
  it('WGS grid fixture: CO (dry) within 0.5 % rel; pressure does nothing (dn = 0)', () => {
    for (const c of wgs.cases) {
      const v = run({ n: [1, c.S_per_CO, 0, 0], T: c.T_C + K0, P: 30e5 }, mk({ reactions: 'R5', T: c.T_C + K0 }), ctx);
      const n = v.outlets.out!.n;
      expect(Math.abs((100 * n[0]! / (n[0]! + n[2]! + n[3]!)) / c.CO_dry_pct - 1), `${c.T_C} C S/CO ${c.S_per_CO}`).toBeLessThanOrEqual(wgs.tolerance.rel);
    }
    const a = run({ n: [1, 1.5, 0, 0], T: 250 + K0, P: 1e5 }, mk({ reactions: 'R5', T: 250 + K0 }), ctx).outlets.out!.n;
    const b = run({ n: [1, 1.5, 0, 0], T: 250 + K0, P: 80e5 }, mk({ reactions: 'R5', T: 250 + K0 }), ctx).outlets.out!.n;
    for (let i = 0; i < 4; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-9);
  });
});

describe('adiabatic equilibrium bed: SO2 oxidation (L13, so2_beds fixture)', () => {
  const ctx: SimCtx = { species: ['SO2', 'O2', 'SO3', 'N2'], thermoDetail: 'rigorous' };
  const feed = (T: number): StreamState => ({ n: [10, 11, 0, 79], T: T + K0, P: 1.2e5 });
  it('inlet sweep 360-440 C: exit T within 0.3 K and X within 0.001 abs of the fixture', () => {
    for (const c of beds.bed1_sweep) {
      const v = run(feed(c.Tin_C), mk({ reactions: 'R2', mode: 'adiabatic' }), ctx);
      expect(Math.abs(v.outlets.out!.T - K0 - c.Tout_C), 'T ' + c.Tin_C).toBeLessThanOrEqual(beds.tolerance.abs_T_K);
      expect(Math.abs(v.info.X! - c.X), 'X ' + c.Tin_C).toBeLessThanOrEqual(beds.tolerance.abs_X);
      expect(v.info.dTad).toBeCloseTo(v.outlets.out!.T - feed(c.Tin_C).T, 12);
      expect(Math.abs(v.duty)).toBeLessThan(1e-3); // adiabatic: heat ledger closes
    }
  });
  it('headline: 420 C inlet -> 620.8 C and 0.6908; the bed ends ON the curve (log10 Q/K = 0) and X = Xeq(T_out)', () => {
    const v = run(feed(420), mk({ reactions: 'R2', mode: 'adiabatic' }), ctx);
    expect(v.outlets.out!.T - K0).toBeCloseTo(620.8, 0); expect(v.info.X).toBeCloseTo(0.6908, 3);
    expect(Math.abs(v.info.QK_out!)).toBeLessThan(1e-9);
    const iso = run(feed(420), mk({ reactions: 'R2', T: v.outlets.out!.T }), ctx);
    expect(iso.info.X).toBeCloseTo(v.info.X!, 9);
  });
  it('ideal V2O5: inactive below 410 C inlet (X = 0, T unchanged), active at exactly 410 C; over-temperature warns above the entry Tmax', () => {
    const cold = run(feed(409), mk({ reactions: 'R2', mode: 'adiabatic' }, 'v2o5'), ctx);
    expect(cold.info.X).toBe(0); expect(cold.outlets.out!.T).toBe(409 + K0); expect(cold.diag.map((d) => d.code)).toContain('BELOW_LIGHTOFF');
    expect(run(feed(410), mk({ reactions: 'R2', mode: 'adiabatic' }, 'v2o5'), ctx).info.X).toBeCloseTo(0.706, 3);
    const hot = run(feed(440), mk({ reactions: 'R2', mode: 'adiabatic' }, 'v2o5'), ctx);
    expect(hot.outlets.out!.T - K0).toBeGreaterThan(630);
    expect(hot.diag.map((d) => d.code)).toContain('CATALYST_OVERTEMP');
  });
  it('catalyst id never changes the equilibrium (P19): the same X from fe-free and v2o5 runs above light-off', () => {
    const a = run(feed(450), mk({ reactions: 'R2', mode: 'adiabatic' }), ctx);
    const b = run(feed(450), mk({ reactions: 'R2', mode: 'adiabatic' }, 'v2o5'), ctx);
    const c = run(feed(450), mk({ reactions: 'R2', mode: 'adiabatic' }, 'v2o5_cs'), ctx);
    expect(b.info.X).toBe(a.info.X); expect(c.info.X).toBe(a.info.X);
  });
});

describe('failures are coded', () => {
  it('missing inlet, bad mode, bad T, missing reactions, unknown reaction, missing species, NaN inlet, big dP', () => {
    const code = (r: { ok: boolean; code?: string }) => (r.ok ? 'ok' : r.code);
    expect(code(eqReactor({}, mk({ reactions: 'R1' }), H))).toBe('NO_INLET');
    const s = { n: [1, 3, 0], T: 700, P: 1e7 };
    expect(code(eqReactor({ in: s }, mk({ reactions: 'R1', mode: 'x' }), H))).toBe('SPEC_RANGE');
    expect(code(eqReactor({ in: s }, mk({ reactions: 'R1', T: -5 }), H))).toBe('SPEC_RANGE');
    expect(code(eqReactor({ in: s }, mk({}), H))).toBe('SPEC_MISSING');
    expect(code(eqReactor({ in: s }, mk({ reactions: 'RX' }), H))).toBe('UNKNOWN_REACTION');
    expect(code(eqReactor({ in: s }, mk({ reactions: 'R2' }), H))).toBe('SPECIES_MISSING');
    expect(code(eqReactor({ in: { ...s, n: [Number.NaN, 3, 0] } }, mk({ reactions: 'R1' }), H))).toBe('NUMERIC_GUARD');
    expect(code(eqReactor({ in: s }, mk({ reactions: 'R1', dP: 2e7 }), H))).toBe('PRESSURE_NONPOSITIVE');
  });
  it('no reactant: NO_REACTANT info and the stream passes; zero flow passes with zero duty', () => {
    const v = run({ n: [0, 3, 0], T: 700, P: 1e7 }, mk({ reactions: 'R1' }), H);
    expect(v.diag.map((d) => d.code)).toContain('NO_REACTANT'); expect(v.outlets.out!.n).toEqual([0, 3, 0]);
    const z = run({ n: [0, 0, 0], T: 700, P: 1e7 }, mk({ reactions: 'R1', mode: 'adiabatic' }), H);
    expect(z.duty).toBe(0);
  });
  it('the stage function is the unit core: key by name, textbook detail and book data are honoured', () => {
    const r = equilibriumStage({ n: [1, 3, 0], T: 700, P: 1e7 }, { species: H.species, reactions: ['R1'], mode: 'isothermal', key: 'H2', detail: 'textbook' });
    expect(r.ok).toBe(true);
    const b = eqReactor({ in: { n: [1, 3, 0], T: 700, P: 1e7 } }, mk({ reactions: 'R1', book_K: 1e-30, book_T: 700 }), { ...H, thermoDetail: 'book' });
    expect(b.ok && b.value.info!.X).toBeLessThan(1e-6);
  });
});

describe('P1 atom balance, P3 energy closure, Q/K direction (fuzz, 3 000 cases)', () => {
  const sys = [
    { rx: 'R1', species: ['N2', 'H2', 'NH3', 'Ar'], T: [650, 800] },
    { rx: 'R2', species: ['SO2', 'O2', 'SO3', 'N2'], T: [650, 900] },
    { rx: 'R5', species: ['CO', 'H2O', 'CO2', 'H2'], T: [500, 900] },
  ];
  it('isothermal and adiabatic reactors close atoms and heat; the inlet Q/K points at the outlet; dTad matches the adiabatic outlet', () => {
    const r = mulberry32(777);
    for (let c = 0; c < 3000; c++) {
      const s = sys[Math.floor(r() * sys.length)]!;
      const feed = s.species.map(() => (r() < 0.2 ? 0 : 0.05 + 4 * r()));
      feed[0] = Math.max(feed[0]!, 0.1);
      const T = s.T[0]! + (s.T[1]! - s.T[0]!) * r();
      const P = 1e5 * (1 + 100 * r());
      const ad = r() < 0.5;
      const ctx: SimCtx = { species: s.species, thermoDetail: 'rigorous' };
      const res = eqReactor({ in: { n: feed, T, P } }, mk({ reactions: s.rx, mode: ad ? 'adiabatic' : 'isothermal' }), ctx);
      if (!res.ok) { expect(['T_BRACKET', 'EQUILIBRIUM_NOT_CONVERGED']).toContain(res.code); continue; }
      const out = res.value.outlets.out!;
      const a = elementTotals(s.species, feed), b = elementTotals(s.species, out.n);
      for (const e of Object.keys(a)) expect(Math.abs((a[e] ?? 0) - (b[e] ?? 0)), e).toBeLessThanOrEqual(1e-9 * Math.max(a[e]!, 1e-3));
      const mx = makeMixture(s.species);
      const Hin = enthalpyFlow(mx, { n: feed, T, P }), Hout = enthalpyFlow(mx, out);
      expect(Math.abs(Hin + res.value.duty! - Hout) / Math.max(Math.abs(Hin), Math.abs(Hout), 1)).toBeLessThan(1e-6);
      if (ad) { expect(Math.abs(res.value.duty!) / Math.max(Math.abs(Hin), 1)).toBeLessThan(1e-6); expect(res.value.info!.dTad).toBeCloseTo(out.T - T, 9); }
      const i = res.value.info!;
      expect(Math.abs(i.QK_out!)).toBeLessThan(1e-6);
      // P11: the reaction runs in the direction sign(1 - Q/K) of the inlet beam
      const dir = Math.sign(i.xi1!);
      if (Math.abs(i.xi1!) > 1e-9 && Math.abs(i.QK_in!) < 29) expect(dir).toBe(-Math.sign(i.QK_in!));
    }
  });
});
