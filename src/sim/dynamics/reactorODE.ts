// Pure step functions of the shift's reactor ODEs (DESIGN 3.9): the jacketed liquid CSTR, backward Euler with a Newton solve per step
// (unknowns: the reacting species' concentrations, T, jacket T: <= 5 for the catalogue reactions). The step is a pure function of
// (model, state, inputs, dt): no hidden state, so the result never depends on how the caller batches its plant-seconds (P21).
//   dC_i/dt = (C0_i - C_i) Q / V + nu_i r                      r = k(T) C_key / |nu_key|   (first order in the key species, mol/(m3 s))
//   rhoCp V dT/dt = Q rhoCp (T0 - T) + UA (Tj - T) + (-dH) r V
//   Cj dTj/dt = mcpC (Tc - Tj) + UA (T - Tj)                   (finite coolant flow: Cj > 0 and mcpC given; else Tj = Tc, no lag)
// SI: mol, m3, s, K, J, W. dH is per unit extent (J/mol).
import { newton } from '@core/numerics';

export interface CstrModel {
  /** Liquid holdup volume, m3. */
  V: number;
  /** Volumetric heat capacity of the liquid, J/(m3 K) (constant in v0.1). */
  rhoCp: number;
  /** Heat of reaction per unit extent, J/mol (negative exothermic). */
  dH: number;
  /** Stoichiometry of the reacting species (products +). */
  nu: number[];
  /** Index of the key (rate-controlling) species in `nu`. */
  key: number;
  /** First-order rate constant, 1/s. */
  k: (T: number) => number;
  /** dk/dT; central difference when absent. */
  dk?: (T: number) => number;
  /** Jacket heat capacity, J/K (the jacket lags when this and `mcpC` are given). */
  Cj?: number;
}

export interface CstrInputs {
  /** Feed concentrations of the reacting species, mol/m3. */
  C0: number[];
  /** Feed temperature, K. */
  T0: number;
  /** Volumetric flow, m3/s. */
  Q: number;
  /** Jacket heat transfer capacity U A, W/K. */
  UA: number;
  /** Coolant inlet temperature, K. */
  Tc: number;
  /** Coolant heat-capacity flow m cp, W/K (finite: dynamic jacket with `model.Cj`; absent: Tj = Tc). */
  mcpC?: number;
}

export interface CstrState { C: number[]; T: number; Tj: number }

const T_FLOOR = 50;
const dkOf = (m: CstrModel, T: number): number => {
  if (m.dk) return m.dk(T);
  const h = 1e-3 * Math.max(T, 1);
  return (m.k(T + h) - m.k(T - h)) / (2 * h);
};
const jacketed = (m: CstrModel, u: CstrInputs): boolean => m.Cj !== undefined && m.Cj > 0 && u.mcpC !== undefined && Number.isFinite(u.mcpC);

/** One backward-Euler step of size dt (s). Falls back to two half steps (up to 6 halvings) if Newton stalls; NaN state if it still fails. */
export function cstrStep(m: CstrModel, s: CstrState, u: CstrInputs, dt: number, depth = 0): CstrState {
  const n = s.C.length, nv = n + 2;
  const nuK = Math.abs(m.nu[m.key]!);
  const qv = u.Q / m.V, jk = jacketed(m, u);
  const Cs = Math.max(Math.abs(u.C0[m.key]!), 1e-9), Ts = 300;
  const xs = (j: number): number => (j < n ? Cs : Ts);
  const fs = (j: number): number => (j < n ? Cs : Ts); // residual scales: concentration balances by Cs, the two energy ones by Ts
  const unpack = (y: number[]): number[] => y.map((v, j) => v * xs(j));
  const F = (y: number[]): number[] => {
    const x = unpack(y);
    const T = Math.max(x[n]!, T_FLOOR), Tj = x[n + 1]!;
    const r = (m.k(T) * x[m.key]!) / nuK;
    const f = new Array<number>(nv);
    for (let i = 0; i < n; i++) f[i] = (x[i]! - s.C[i]! - dt * ((u.C0[i]! - x[i]!) * qv + m.nu[i]! * r)) / fs(i);
    f[n] = (T - s.T - (dt * (u.Q * m.rhoCp * (u.T0 - T) + u.UA * (Tj - T) + -m.dH * r * m.V)) / (m.rhoCp * m.V)) / fs(n);
    f[n + 1] = (jk ? Tj - s.Tj - (dt * (u.mcpC! * (u.Tc - Tj) + u.UA * (T - Tj))) / m.Cj! : Tj - u.Tc) / fs(n + 1);
    return f;
  };
  const J = (y: number[]): number[][] => {
    const x = unpack(y);
    const T = Math.max(x[n]!, T_FLOOR);
    const k = m.k(T), dk = dkOf(m, T);
    const drC = k / nuK, drT = (dk * x[m.key]!) / nuK;
    const a = Array.from({ length: nv }, () => new Array<number>(nv).fill(0));
    for (let i = 0; i < n; i++) {
      a[i]![i] = 1 + dt * qv;
      a[i]![m.key] = a[i]![m.key]! - dt * m.nu[i]! * drC;
      a[i]![n] = -dt * m.nu[i]! * drT;
    }
    const hc = -m.dH / m.rhoCp;
    a[n]![m.key] = -dt * hc * drC;
    a[n]![n] = 1 + (dt * (u.Q * m.rhoCp + u.UA)) / (m.rhoCp * m.V) - dt * hc * drT;
    a[n]![n + 1] = (-dt * u.UA) / (m.rhoCp * m.V);
    if (jk) { a[n + 1]![n] = (-dt * u.UA) / m.Cj!; a[n + 1]![n + 1] = 1 + (dt * (u.mcpC! + u.UA)) / m.Cj!; } else a[n + 1]![n + 1] = 1;
    for (let i = 0; i < nv; i++) for (let j = 0; j < nv; j++) a[i]![j] = (a[i]![j]! * xs(j)) / fs(i);
    return a;
  };
  const y0 = [...s.C.map((c) => c / Cs), s.T / Ts, (jk ? s.Tj : u.Tc) / Ts];
  const res = newton(F, y0, { jacobian: J, tol: 1e-13, maxIter: 60 });
  if (!res.converged && !(res.residual <= 1e-11)) {
    if (depth >= 6) return { C: s.C.map(() => Number.NaN), T: Number.NaN, Tj: Number.NaN };
    const h = cstrStep(m, s, u, dt / 2, depth + 1);
    return cstrStep(m, h, u, dt / 2, depth + 1);
  }
  const x = unpack(res.x);
  return { C: x.slice(0, n), T: x[n]!, Tj: x[n + 1]! };
}

/**
 * Residuals of the discrete balances of one step (what the caller can audit): per species, V (C1 - C0) / dt - [Q (C0in - C1) + nu_i r V], and the
 * energy residual, both relative to the largest term of their balance. A converged step closes both to ~1e-12.
 */
export function cstrBalance(m: CstrModel, s0: CstrState, s1: CstrState, u: CstrInputs, dt: number): { material: number[]; energy: number; jacket: number } {
  const nuK = Math.abs(m.nu[m.key]!);
  const r = (m.k(s1.T) * s1.C[m.key]!) / nuK;
  const material = s1.C.map((c, i) => {
    const acc = (m.V * (c - s0.C[i]!)) / dt, inn = u.Q * (u.C0[i]! - c), gen = m.nu[i]! * r * m.V;
    return (acc - inn - gen) / Math.max(Math.abs(acc), Math.abs(inn), Math.abs(gen), 1e-30);
  });
  const acc = (m.rhoCp * m.V * (s1.T - s0.T)) / dt, flow = u.Q * m.rhoCp * (u.T0 - s1.T), jac = u.UA * (s1.Tj - s1.T), gen = -m.dH * r * m.V;
  const energy = (acc - flow - jac - gen) / Math.max(Math.abs(acc), Math.abs(flow), Math.abs(jac), Math.abs(gen), 1e-30);
  let jacket = 0;
  if (jacketed(m, u)) {
    const a = (m.Cj! * (s1.Tj - s0.Tj)) / dt, b = u.mcpC! * (u.Tc - s1.Tj), c = u.UA * (s1.T - s1.Tj);
    jacket = (a - b - c) / Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1e-30);
  }
  return { material, energy, jacket };
}
