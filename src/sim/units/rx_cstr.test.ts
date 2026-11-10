// Jacketed CSTR (DESIGN 3.5): steady states by scan + Brent, stability, simulated start-up, hysteresis, loss of cooling.
import { describe, expect, it } from 'vitest';
import { cstrStep, type CstrState } from '../dynamics/reactorODE';
import { cstrCritical, cstrDTad, cstrSteadyStates, cstrUnit, k7Game, startUp } from './rx_cstr';
import { UNIT_DEFS_CSTR } from './registryCstr';
import type { SimCtx, UnitInst } from '../types';

const K = 273.15;
const near = (have: number, want: number, tol: number, label: string) => expect(Math.abs(have - want), `${label}: ${have} vs ${want}`).toBeLessThanOrEqual(tol);
const stateAt = (g: ReturnType<typeof k7Game>, X: number): CstrState => ({
  C: g.model.nu.map((v, i) => g.inputs.C0[i]! + (v / Math.abs(g.model.nu[g.model.key]!)) * g.inputs.C0[g.model.key]! * X), T: 0, Tj: g.inputs.Tc,
});

describe('K7 steady states (V 0.10 m3, 5 m3/h, UA 10 MJ/h/K)', () => {
  const g = k7Game();
  const r = cstrSteadyStates(g.model, g.inputs);
  it('three steady states: 27.6 / 63.1 / 117.0 C (0.3 K)', () => {
    expect(r.states).toHaveLength(3);
    [27.55, 63.10, 117.00].forEach((c, i) => near(r.states[i]!.T - K, c, 0.3, 'T' + i));
  });
  it('stability: lower and upper stable, the middle one unstable (slope and trace / determinant)', () => {
    expect(r.states.map((s) => s.stable)).toEqual([true, false, true]);
    expect(r.states[1]!.slope).toBeGreaterThan(0);
    expect(r.states[0]!.det).toBeGreaterThan(0);
    expect(r.states[0]!.trace).toBeLessThan(0);
  });
  it('conversions 3 / 40 / 97 %', () => {
    near(r.states[0]!.X, 0.0268, 1e-3, 'X0'); near(r.states[1]!.X, 0.3996, 1e-3, 'X1'); near(r.states[2]!.X, 0.9650, 1e-3, 'X2');
  });
  it('Semenov plot data: at most 120 points, G - R changes sign at every steady state', () => {
    const s = r.semenov;
    expect(s.T.length).toBeLessThanOrEqual(120);
    expect(s.G.length).toBe(s.T.length); expect(s.R.length).toBe(s.T.length);
    let flips = 0;
    for (let i = 1; i < s.T.length; i++) if (Math.sign(s.G[i]! - s.R[i]!) !== Math.sign(s.G[i - 1]! - s.R[i - 1]!)) flips++;
    expect(flips).toBe(3);
  });
  it('the adiabatic bound T0 + dTad = 173.7 C', () => { near(cstrDTad(g.model, g.inputs) + g.inputs.T0 - K, 173.7, 0.1, 'bound'); });
  it('ignition by warming the coolant (feed stays 25 C): lower branch vanishes at 47.4 C (0.3 K)', () => {
    const c = cstrCritical(g.model, g.inputs, 'Tc');
    near(Math.max(...c.map((x) => x.Tc)) - K, 47.449, 0.3, 'ignition');
    expect(c).toHaveLength(2);
    expect(c.find((x) => x.kind === 'ignition')!.Tc).toBeGreaterThan(c.find((x) => x.kind === 'extinction')!.Tc);
  });
  it('3 states strictly inside the window, 1 outside (just above ignition: only the hot state)', () => {
    const above = cstrSteadyStates(g.model, { ...g.inputs, Tc: 48.5 + K });
    expect(above.states).toHaveLength(1);
    expect(above.states[0]!.T - K).toBeGreaterThan(100);
  });
});

describe('dynamics: start-up branch, hysteresis, loss of cooling', () => {
  const g = k7Game();
  const settle = (s: CstrState, u: typeof g.inputs, n: number) => { let c = s; for (let i = 0; i < n; i++) c = cstrStep(g.model, c, u, 1); return c; };
  const lowS = (): CstrState => ({ ...stateAt(g, 0.0268), T: cstrSteadyStates(g.model, g.inputs).states[0]!.T });
  it('start-up from feed conditions lands on the lazy branch (3 % conversion) at the design coolant temperature', () => {
    const s = startUp(g.model, g.inputs);
    near(s.T - K, 27.55, 0.3, 'start-up T');
  });
  it('hysteresis: coolant above 47.4 C ignites the reactor, cooling back to 25 C keeps the upper branch', () => {
    const warm = settle(lowS(), { ...g.inputs, Tc: 52 + K }, 1500);
    expect(warm.T - K).toBeGreaterThan(110);
    const back = settle(warm, g.inputs, 3000);
    near(back.T - K, 117.0, 0.3, 'still hot');
    // slowly cooling the jacket (0.002 K/s, quasi-static) keeps the upper branch down to the extinction point and loses it just below
    const ext = cstrCritical(g.model, g.inputs, 'Tc').find((x) => x.kind === 'extinction')!;
    expect(ext.Tc - K).toBeLessThan(25 - 30); // a wide hysteresis loop: extinction about -15 C
    const ramp = (to: number): CstrState => {
      let c = warm;
      const n = Math.ceil((g.inputs.Tc - to) / 0.002);
      for (let i = 1; i <= n; i++) c = cstrStep(g.model, c, { ...g.inputs, Tc: g.inputs.Tc - Math.min(0.002 * i, g.inputs.Tc - to) }, 1);
      return settle(c, { ...g.inputs, Tc: to }, 8000);
    };
    expect(ramp(ext.Tc + 3).T - K).toBeGreaterThan(80);
    expect(ramp(ext.Tc - 1).T - K).toBeLessThan(ext.Tc - K + 35);
  });
  it('coolant just below ignition does not ignite', () => {
    const s = settle(lowS(), { ...g.inputs, Tc: 46.5 + K }, 4000);
    expect(s.T - K).toBeLessThan(60);
  });
  it('loss of cooling from the hot state (UA -70 %): +20 K in 49 s (+-3 s) and a new hot state near 152 C', () => {
    const hotT = cstrSteadyStates(g.model, g.inputs).states[2]!;
    const u = { ...g.inputs, UA: 0.3 * g.inputs.UA };
    let s: CstrState = { ...stateAt(g, hotT.X), T: hotT.T };
    let t = 0, t20 = NaN;
    while (t < 3000) { s = cstrStep(g.model, s, u, 1); t++; if (Number.isNaN(t20) && s.T >= hotT.T + 20) t20 = t; }
    near(t20, 48.6, 3, '+20 K time');
    near(s.T - K, 151.66, 0.5, 'new hot state');
  });
  it('total loss of cooling never exceeds the adiabatic bound 173.7 C', () => {
    const hotT = cstrSteadyStates(g.model, g.inputs).states[2]!;
    const u = { ...g.inputs, UA: 0 };
    let s: CstrState = { ...stateAt(g, hotT.X), T: hotT.T };
    let peak = 0;
    for (let i = 0; i < 4000; i++) { s = cstrStep(g.model, s, u, 1); peak = Math.max(peak, s.T); }
    expect(peak - K).toBeLessThanOrEqual(173.7 + 0.05);
    expect(peak - K).toBeGreaterThan(173.0);
  });
});

describe('cstr unit op', () => {
  const ctx: SimCtx = { species: ['C3H6O', 'H2O(l)', 'C3H8O2', 'CH4O'], thermoDetail: 'book' };
  const g = k7Game();
  const Q = g.inputs.Q;
  const feed = { n: [g.inputs.C0[0]! * Q, 55000 * Q, 0, 3], T: 298.15, P: 7e5 };
  const U = (extra: Record<string, number | string> = {}): UnitInst => ({ id: 'R1', type: 'cstr', pos: { x: 0, y: 0 }, rot: 0, params: { law: 'K7', V: 0.1, Q, UA: g.inputs.UA, Tc: 298.15, ...extra } });
  it('registers one inlet / one outlet reactor that consumes the K7 reactants', () => {
    const d = UNIT_DEFS_CSTR.cstr!;
    expect(d.inlets).toEqual(['in']); expect(d.outlets).toEqual(['out']);
    expect(d.consumes!(U(), 0, ctx.species)).toBe(true);
    expect(d.consumes!(U(), 2, ctx.species)).toBe(false);
    expect(d.consumes!(U(), 3, ctx.species)).toBe(false);
  });
  it('runs the start-up, reports the lazy branch, all three states, and a MULTIPLE_STEADY_STATES info diag', () => {
    const r = cstrUnit({ in: feed }, U(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const i = r.value.info!;
    near(i.T! - K, 27.55, 0.3, 'T'); near(i.X!, 0.0268, 1e-3, 'X');
    expect(i.nss).toBe(3); expect(i.branch).toBe(0);
    near(i.ss0_T! - K, 27.55, 0.3, 'ss0'); near(i.ss1_T! - K, 63.1, 0.3, 'ss1'); near(i.ss2_T! - K, 117.0, 0.3, 'ss2');
    expect([i.ss0_stable, i.ss1_stable, i.ss2_stable]).toEqual([1, 0, 1]);
    expect(r.diag.some((d) => d.code === 'MULTIPLE_STEADY_STATES' && d.severity === 'info' && d.data.n === 3)).toBe(true);
  });
  it('material balance: outlet species follow the stoichiometry, inerts untouched, P kept', () => {
    const r = cstrUnit({ in: feed }, U(), ctx);
    if (!r.ok) throw new Error(r.code);
    const o = r.value.outlets.out!;
    const xi = feed.n[0]! - o.n[0]!;
    expect(xi).toBeGreaterThan(0);
    expect(feed.n[1]! - o.n[1]!).toBeCloseTo(xi, 12);
    expect(o.n[2]!).toBeCloseTo(xi, 12);
    expect(o.n[3]).toBe(3);
    expect(o.P).toBe(7e5);
  });
  it('energy: duty removed through the jacket equals the heat generated minus the sensible heat of the stream', () => {
    const r = cstrUnit({ in: feed }, U(), ctx);
    if (!r.ok) throw new Error(r.code);
    const T = r.value.outlets.out!.T, xi = feed.n[0]! - r.value.outlets.out!.n[0]!;
    const gen = -g.model.dH * xi, sens = Q * g.model.rhoCp * (T - 298.15);
    expect(Math.abs(-r.value.duty! - (gen - sens)) / gen).toBeLessThan(1e-6);
  });
  it('warm coolant (52 C) commissions the hot branch', () => {
    const r = cstrUnit({ in: feed }, U({ Tc: 52 + K }), ctx);
    if (!r.ok) throw new Error(r.code);
    expect(r.value.info!.T! - K).toBeGreaterThan(110);
    expect(r.value.info!.branch).toBe(r.value.info!.nss! - 1);
  });
  it('missing species and bad parameters return coded failures, never throw', () => {
    const bad = cstrUnit({ in: feed }, U(), { species: ['C3H6O', 'CH4O'], thermoDetail: 'book' });
    expect(bad.ok).toBe(false);
    const neg = cstrUnit({ in: feed }, U({ V: -1 }), ctx);
    expect(neg.ok).toBe(false);
    const nan = cstrUnit({ in: { ...feed, T: Number.NaN } }, U(), ctx);
    expect(nan.ok === false && nan.code).toBe('NUMERIC_GUARD');
  });
  it('is deterministic', () => {
    expect(JSON.stringify(cstrUnit({ in: feed }, U(), ctx))).toBe(JSON.stringify(cstrUnit({ in: feed }, U(), ctx)));
  });
});
