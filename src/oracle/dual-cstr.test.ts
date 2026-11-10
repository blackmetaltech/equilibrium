// Dual-implementation check of the K7 jacketed CSTR (DESIGN 9.2.3): the engine's CSTR against the independent Python/scipy numbers of
// docs/research/kinetics_cstr_si.py (src/oracle/fixtures/kinetics_k7.json): steady states, stability, ignition, loss of cooling.
import { describe, expect, it } from 'vitest';
import fx from './fixtures/kinetics_k7.json';
import { cstrCritical, cstrSteadyStates, k7Game } from '../sim/units/rx_cstr';
import { cstrStep, type CstrState } from '../sim/dynamics/reactorODE';

const K = 273.15;
const near = (have: number, want: number, tol: number, label: string) => expect(Math.abs(have - want), `${label}: ${have} vs ${want}`).toBeLessThanOrEqual(tol);

describe('K7 fixture (Fogler propylene oxide hydrolysis, game variant)', () => {
  const i = fx.inputs;
  const g = k7Game({ V: i.V_m3, Q: i.Q_m3_h / 3600, UA: (i.UA_MJ_h_K * 1e6) / 3600, T0: i.T0_C + K, Tc: i.Tc_C + K });
  it('engine law K7 reproduces the fixture inputs: E = 75.36 MJ/kmol exactly, dH, CA0, rho cp', () => {
    expect(g.model.dH).toBeCloseTo(i.dH_MJ_kmol * 1e3, 6);
    expect(g.inputs.C0[0]).toBeCloseTo(i.CA0_kmol_m3 * 1e3, 6);
    expect(g.model.rhoCp).toBeCloseTo(i.rho_cp_MJ_m3_K * 1e6, 3);
    const k = g.model.k(300), A = i.A_per_h / 3600;
    expect(Math.abs(k / (A * Math.exp(-(i.E_MJ_kmol * 1e3) / (8.314 * 300))) - 1)).toBeLessThan(1e-9);
  });
  it('steady states, X and stability match the scipy ones within the fixture tolerance', () => {
    const r = cstrSteadyStates(g.model, g.inputs);
    expect(r.states).toHaveLength(fx.steady_states.length);
    fx.steady_states.forEach((s, j) => {
      near(r.states[j]!.T - K, s.T_C, fx.tolerance.abs_T_K, 'T' + j);
      near(r.states[j]!.X, s.X, 1e-3, 'X' + j);
      expect(r.states[j]!.stable).toBe(s.stable);
    });
  });
  it('ignition by coolant only (feed stays 25 C) at the fixture value', () => {
    const c = cstrCritical(g.model, g.inputs, 'Tc').find((x) => x.kind === 'ignition')!;
    near(c.Tc - K, fx.ignition_coolant_only_C, fx.tolerance.abs_T_K, 'coolant ignition');
    const b = cstrCritical(g.model, g.inputs, 'both').find((x) => x.kind === 'ignition')!;
    near(b.Tc - K, fx.ignition_feed_and_coolant_C, fx.tolerance.abs_T_K, 'feed + coolant ignition');
  });
  it('UA -70 % from the hot state: new states and the +5 / +10 / +20 K times (backward Euler dt = 1 s, +-2 s)', () => {
    const u = { ...g.inputs, UA: fx.ua_drop.frac * g.inputs.UA };
    const ns = cstrSteadyStates(g.model, u).states.map((s) => s.T - K);
    fx.ua_drop.new_states_C.forEach((c, j) => near(ns[j]!, c, fx.tolerance.abs_T_K, 'new state ' + j));
    const hot = cstrSteadyStates(g.model, g.inputs).states[2]!;
    let s: CstrState = { C: g.model.nu.map((v, j) => g.inputs.C0[j]! + v * g.inputs.C0[0]! * hot.X), T: hot.T, Tj: g.inputs.Tc };
    const times: Record<number, number> = {};
    for (let t = 1; t <= 3600; t++) {
      s = cstrStep(g.model, s, u, 1);
      for (const d of [5, 10, 20]) if (times[d] === undefined && s.T >= hot.T + d) times[d] = t;
    }
    near(times[5]!, fx.ua_drop.t_plus_5K_s, 2, '+5 K'); near(times[10]!, fx.ua_drop.t_plus_10K_s, 2, '+10 K'); near(times[20]!, fx.ua_drop.t_plus_20K_s, 3, '+20 K');
    near(s.T - K, fx.ua_drop.T_after_1h_C, 0.3, 'T after 1 h');
  });
});
