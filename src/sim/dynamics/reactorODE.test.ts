// Backward-Euler CSTR step (DESIGN 3.9): dt-convergence, partition invariance, material / energy closure, isothermal limit.
import { describe, expect, it } from 'vitest';
import { cstrBalance, cstrStep, type CstrInputs, type CstrState } from './reactorODE';
import { cstrSteadyStates, k7Game } from '../units/rx_cstr';

const K = 273.15;
const run = (m: ReturnType<typeof k7Game>['model'], s0: CstrState, u: CstrInputs, steps: number, dt: number): CstrState => {
  let s = s0;
  for (let i = 0; i < steps; i++) s = cstrStep(m, s, u, dt);
  return s;
};
const hot = () => {
  const { model, inputs } = k7Game();
  const st = cstrSteadyStates(model, inputs).states.at(-1)!;
  // outlet concentrations of the reacting species at conversion X: C_i = C0_i + nu_i/|nu_key| C0_key X
  const Ck = model.nu.map((v, i) => inputs.C0[i]! + (v / Math.abs(model.nu[model.key]!)) * inputs.C0[model.key]! * st.X);
  return { model, inputs, s: { C: Ck, T: st.T, Tj: inputs.Tc } as CstrState };
};

describe('cstrStep (backward Euler)', () => {
  it('a steady state is a fixed point of the step (hot branch, 60 s: drift < 1e-6 K)', () => {
    const { model, inputs, s } = hot();
    const e = run(model, s, inputs, 60, 1);
    expect(Math.abs(e.T - s.T)).toBeLessThan(1e-6);
    expect(Math.abs(e.C[0]! / s.C[0]! - 1)).toBeLessThan(1e-9);
  });
  it('dt-convergence: halving dt changes the 60 s loss-of-cooling trajectory by < 0.1 K', () => {
    const { model, inputs, s } = hot();
    const u = { ...inputs, UA: 0.3 * inputs.UA };
    const a = run(model, s, u, 60, 1), b = run(model, s, u, 120, 0.5), c = run(model, s, u, 240, 0.25);
    expect(Math.abs(a.T - b.T)).toBeLessThan(0.1);
    // first order: the finer pair is closer still
    expect(Math.abs(b.T - c.T)).toBeLessThan(Math.abs(a.T - b.T));
  });
  it('partition invariance: 60 steps of 1 s are bit-identical however the caller batches them', () => {
    const { model, inputs, s } = hot();
    const u = { ...inputs, UA: 0.3 * inputs.UA };
    const one = run(model, s, u, 60, 1);
    let two = s;
    for (const n of [7, 13, 1, 39]) two = run(model, two, u, n, 1);
    expect(two.T).toBe(one.T);
    expect(two.Tj).toBe(one.Tj);
    expect(two.C).toEqual(one.C);
  });
  it('the step does not mutate its input state and is deterministic', () => {
    const { model, inputs, s } = hot();
    const snap = JSON.stringify(s);
    const a = cstrStep(model, s, inputs, 1), b = cstrStep(model, s, inputs, 1);
    expect(JSON.stringify(s)).toBe(snap);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('material and energy balance of each step close to 1e-9 (relative to the largest term)', () => {
    const { model, inputs, s } = hot();
    const u = { ...inputs, UA: 0.3 * inputs.UA };
    let cur = s;
    for (let i = 0; i < 80; i++) {
      const nxt = cstrStep(model, cur, u, 1);
      const r = cstrBalance(model, cur, nxt, u, 1);
      for (const m of r.material) expect(Math.abs(m)).toBeLessThan(1e-9);
      expect(Math.abs(r.energy)).toBeLessThan(1e-9);
      cur = nxt;
    }
    expect(cur.T).toBeGreaterThan(s.T + 20); // the trajectory really moved
  });
  it('dynamic jacket: a finite coolant flow lags the jacket temperature, and its steady state matches the effective-UA scan', () => {
    const { model, inputs } = k7Game();
    const mj = { ...model, Cj: 2e6 };
    const u: CstrInputs = { ...inputs, mcpC: 5000 };
    const ss = cstrSteadyStates(mj, u).states;
    expect(ss.length).toBe(3);
    const lo = ss[0]!;
    const C = model.nu.map((v, i) => inputs.C0[i]! + (v / Math.abs(model.nu[model.key]!)) * inputs.C0[model.key]! * lo.X);
    // heat removed = UA (T - Tj) = UAeff (T - Tc): Tj at the steady state
    const UAeff = (inputs.UA * 5000) / (inputs.UA + 5000);
    const Tj = lo.T - (UAeff * (lo.T - inputs.Tc)) / inputs.UA;
    const s = run(mj, { C, T: lo.T, Tj: inputs.Tc }, u, 4000, 1);
    expect(Math.abs(s.T - lo.T)).toBeLessThan(1e-3);
    expect(Math.abs(s.Tj - Tj)).toBeLessThan(1e-3);
    // after the warm-up the jacket really lags: one step after a coolant jump Tj moves less than Tc did
    const j = cstrStep(mj, s, { ...u, Tc: u.Tc + 20 }, 1);
    expect(j.Tj - s.Tj).toBeGreaterThan(0);
    expect(j.Tj - s.Tj).toBeLessThan(20);
  });
  it('isothermal limit (dH = 0): relaxes to the analytic steady conversion X = tau k / (1 + tau k)', () => {
    const { model, inputs } = k7Game();
    const m = { ...model, dH: 0 };
    const T = inputs.T0;
    const s = run(m, { C: [...inputs.C0], T, Tj: T }, inputs, 3000, 1);
    const tau = m.V / inputs.Q, k = m.k(s.T);
    const X = 1 - s.C[0]! / inputs.C0[0]!;
    expect(Math.abs(X - (tau * k) / (1 + tau * k))).toBeLessThan(1e-9);
    expect(s.C.map((c) => Number.isFinite(c))).not.toContain(false);
    void K;
  });
});
