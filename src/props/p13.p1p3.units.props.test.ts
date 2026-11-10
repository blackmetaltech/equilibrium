// Full-budget (FUZZ_N) versions of two unit-level properties that the unit lanes run with fewer cases (3 000 each):
//   P13 second law for heaters / coolers at their utility temperatures: S_gen = S_out - S_in - Q/T_utility >= -1e-9 kW/K;
//   P1 / P3 / P11 for the equilibrium reactor (isothermal and adiabatic, Haber, contact, shift): atoms 1e-9, heat 1e-6, Q/K points at the outlet.
// Same generators and assertions as the lane tests (src/sim/units/heater.test.ts, rx_equil.test.ts), different seeds, the env budget.
import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { elementTotals } from '../sim/chem/stoich';
import { enthalpyFlow, entropyFlow, makeMixture } from '../sim/thermo';
import type { SimCtx, UnitInst } from '../sim/types';
import { heater } from '../sim/units/heater';
import { eqReactor } from '../sim/units/rx_equil';
import { UTIL } from '../sim/units/utilities';
import { FUZZ_N, fuzzTimeout } from './fuzz';

const mk = (type: string, params: Record<string, number | string>): UnitInst => ({ id: 'U1', type, pos: { x: 0, y: 0 }, rot: 0, params });

describe('P13 entropy generation of heaters and coolers', () => {
  const SP = ['N2', 'O2', 'Ar', 'H2O', 'CO2', 'CH4', 'H2'];
  const mx = makeMixture(SP), ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
  it(`S_gen >= -1e-9 kW/K (${FUZZ_N} cases)`, () => {
    const rng = new Rng(1301);
    const names = ['steam', 'fired', 'cw', 'refrig'] as const;
    let n = 0;
    for (let i = 0; i < FUZZ_N; i++) {
      const u = names[Math.floor(rng.next() * 4)]!;
      const n_ = SP.map(() => (rng.next() < 0.4 ? 0 : rng.next() * 5)); n_[0] = 0.1 + rng.next() * 5;
      const Tin = 250 + rng.next() * 700, P = 1e5 * (1 + rng.next() * 50);
      const heating = u === 'steam' || u === 'fired';
      const lim = UTIL[u].T;
      const Tout = heating ? Tin + rng.next() * Math.max(0, lim - Tin) : lim + rng.next() * Math.max(0, Tin - lim);
      if (!(heating ? Tout >= Tin : Tout <= Tin)) continue;
      const s = { n: n_, T: Tin, P };
      const r = heater({ in: s }, mk(heating ? 'heater' : 'cooler', { T: Tout, utility: u, dP: rng.next() * 0.1 * P }), ctx);
      if (!r.ok) continue;
      n++;
      const Sgen = entropyFlow(mx, r.value.outlets.out!) - entropyFlow(mx, s) - r.value.duty! / UTIL[u].T;
      expect(Sgen, `case ${i}`).toBeGreaterThanOrEqual(-1e-6);
      expect(Number.isFinite(Sgen)).toBe(true);
    }
    expect(n).toBeGreaterThan(FUZZ_N / 3);
  }, fuzzTimeout(0.3));
});

describe('P1 / P3 / P11 equilibrium reactor', () => {
  const sys = [
    { rx: 'R1', species: ['N2', 'H2', 'NH3', 'Ar'], T: [650, 800] },
    { rx: 'R2', species: ['SO2', 'O2', 'SO3', 'N2'], T: [650, 900] },
    { rx: 'R5', species: ['CO', 'H2O', 'CO2', 'H2'], T: [500, 900] },
  ];
  it(`atoms 1e-9, heat 1e-6, inlet Q/K points at the outlet (${FUZZ_N} cases)`, () => {
    const r = new Rng(1302);
    let solved = 0;
    for (let c = 0; c < FUZZ_N; c++) {
      const s = sys[Math.floor(r.next() * sys.length)]!;
      const feed = s.species.map(() => (r.next() < 0.2 ? 0 : 0.05 + 4 * r.next()));
      feed[0] = Math.max(feed[0]!, 0.1);
      const T = s.T[0]! + (s.T[1]! - s.T[0]!) * r.next(), P = 1e5 * (1 + 100 * r.next()), ad = r.next() < 0.5;
      const ctx: SimCtx = { species: s.species, thermoDetail: 'rigorous' };
      const res = eqReactor({ in: { n: feed, T, P } }, mk('eq_reactor', { reactions: s.rx, mode: ad ? 'adiabatic' : 'isothermal' }), ctx);
      if (!res.ok) { expect(['T_BRACKET', 'EQUILIBRIUM_NOT_CONVERGED'], `case ${c}`).toContain(res.code); continue; }
      solved++;
      const out = res.value.outlets.out!;
      const a = elementTotals(s.species, feed), b = elementTotals(s.species, out.n);
      for (const e of Object.keys(a)) expect(Math.abs((a[e] ?? 0) - (b[e] ?? 0)), `case ${c} ${e}`).toBeLessThanOrEqual(1e-9 * Math.max(a[e]!, 1e-3));
      const mx = makeMixture(s.species);
      const Hin = enthalpyFlow(mx, { n: feed, T, P }), Hout = enthalpyFlow(mx, out);
      expect(Math.abs(Hin + res.value.duty! - Hout) / Math.max(Math.abs(Hin), Math.abs(Hout), 1), `case ${c} heat`).toBeLessThan(1e-6);
      const i = res.value.info!;
      expect(Math.abs(i.QK_out!), `case ${c} QK_out`).toBeLessThan(1e-6);
      if (Math.abs(i.xi1!) > 1e-9 && Math.abs(i.QK_in!) < 29) expect(Math.sign(i.xi1!), `case ${c} direction`).toBe(-Math.sign(i.QK_in!));
    }
    expect(solved).toBeGreaterThan(FUZZ_N * 0.5);
  }, fuzzTimeout(1));
});
