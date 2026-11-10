// Batch reactor (DESIGN 3.5): ODEs in time by adaptive RK4 (step doubling with local extrapolation), the L18 hydrogen-peroxide rig
// (first order, catalyst choice, ideal-gas burette) and the `batch` unit op (isothermal charge held for `time`).
// Unit params: law (default K6), catalystId (-> K6 variant; 'none' default) or k (1/s at T, overrides the law), T (K, default inlet T),
//   time (s), key (species of the law's role A), dH (J/mol, default catalogue). Info: X, xi, k, T, time, V_O2 (burette, m3, at T and P_in).
import { brent, dmath, rk4Step } from '@core/numerics';
import { findLaw } from '../../data/kinetics';
import { findReaction } from '../../data/reactions';
import { arrheniusK } from '../chem/kinetics';
import { rxnDH } from '../chem/reactions';
import type { Diag, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, num, str } from './utilities';

const R_GAS = 8.314462618;

export type Rhs = (t: number, y: number[]) => number[];
export interface OdeOpts { rtol?: number; atol?: number; maxSteps?: number }

/** One extrapolated step (two half steps against one full step, Richardson): returns the new state and the error estimate. */
function step2(f: Rhs, t: number, y: number[], h: number): { y: number[]; err: number[] } {
  const y1 = rk4Step(f, t, y, h);
  const yh = rk4Step(f, t, y, h / 2);
  const y2 = rk4Step(f, t + h / 2, yh, h / 2);
  return { y: y2.map((v, j) => v + (v - y1[j]!) / 15), err: y2.map((v, j) => Math.abs(v - y1[j]!)) };
}

class Stepper {
  h: number;
  steps = 0;
  constructor(private readonly f: Rhs, private readonly rtol: number, private readonly atol: number, private readonly maxSteps: number, h0: number) { this.h = h0; }
  /** One accepted step of at most hMax from (t, y); null when the budget is exhausted or the state is not finite. */
  next(t: number, y: number[], hMax: number): { t: number; y: number[]; h: number } | null {
    for (;;) {
      if (++this.steps > this.maxSteps) return null;
      const h = Math.min(this.h, hMax);
      const r = step2(this.f, t, y, h);
      let e = 0;
      for (let j = 0; j < y.length; j++) e = Math.max(e, r.err[j]! / (this.rtol * Math.max(Math.abs(r.y[j]!), this.atol) + 1e-300));
      if (!Number.isFinite(e)) return null;
      if (e <= 1 || h < 1e-12 * Math.max(1, Math.abs(t))) {
        this.h = h * Math.min(2, 0.9 * dmath.pow(1 / Math.max(e, 1e-10), 0.2));
        return { t: t + h, y: r.y, h };
      }
      this.h = h * Math.max(0.2, 0.9 * dmath.pow(1 / e, 0.2));
    }
  }
}

/** State at each of the (increasing) `times`, starting from y0 at t = 0. Empty list when the step budget is exhausted. */
export function odeAt(f: Rhs, y0: number[], times: number[], o: OdeOpts = {}): number[][] {
  const st = new Stepper(f, o.rtol ?? 1e-10, o.atol ?? 1e-12, o.maxSteps ?? 200000, (times[times.length - 1] ?? 1) / 50);
  const out: number[][] = [];
  let t = 0, y = y0;
  for (const tt of times) {
    while (t < tt * (1 - 1e-14)) {
      const s = st.next(t, y, tt - t);
      if (s === null) return out;
      t = s.t; y = s.y;
    }
    t = tt;
    out.push(y);
  }
  return out;
}

export interface UntilOut { hit: boolean; t: number; y: number[] }
/** Integrate until g(y) first changes sign (from its value at y0) or tEnd; the crossing time is polished by Brent inside the step. */
export function integrateUntil(f: Rhs, y0: number[], tEnd: number, g: (y: number[]) => number, o: OdeOpts = {}): UntilOut {
  const st = new Stepper(f, o.rtol ?? 1e-10, o.atol ?? 1e-12, o.maxSteps ?? 200000, tEnd / 50);
  let t = 0, y = y0;
  const g0 = g(y0);
  while (t < tEnd * (1 - 1e-14)) {
    const s = st.next(t, y, tEnd - t);
    if (s === null) return { hit: false, t, y };
    const gv = g(s.y);
    if (gv === 0 || Math.sign(gv) !== Math.sign(g0)) {
      const at = (h: number): number => g(step2(f, t, y, h).y);
      const h = at(s.h) === 0 ? s.h : brent(at, 0, s.h, { tol: 1e-13 * Math.max(1, s.h), maxIter: 200 }).x;
      return { hit: true, t: t + h, y: step2(f, t, y, h).y };
    }
    t = s.t; y = s.y;
  }
  return { hit: false, t, y };
}

// ---------------------------------------------------------------------------------------------------- L18 rig
export interface RigK { Ea: number; kref: number; Tref: number; k: (T: number) => number }
/** First-order H2O2 decomposition constant of catalyst variant `cat` (K6: none 75 / iodide 56.5 / catalase 15 kJ/mol, GAME k at 25 C). */
export function rigK(cat = 'none', lawId = 'K6'): RigK {
  const law = findLaw(lawId)!;
  const v = law.variants?.find((x) => x.catalyst === cat) ?? law.variants?.find((x) => x.catalyst === 'none');
  const Ea = v?.Ea ?? law.params['Ea']!, kref = v?.kref ?? law.params['kref']!, Tref = law.params['Tref']!, R = law.params['R']!;
  return { Ea, kref, Tref, k: (T) => arrheniusK(kref, Ea, T, Tref, R) };
}

/** Gas burette: volume of n mol of ideal gas at T, P, m3. */
export const burette = (n: number, T: number, P: number): number => (n * R_GAS * T) / P;

export interface RigSpec { n0: number; T: number; P: number; tEnd: number; k?: number; catalyst?: string }
export interface RigOut { n: number; fraction: number; nO2: number; V_O2: number; k: number }
/** Isothermal first-order batch of the peroxide charge: dn/dt = -k n; O2 = 0.5 (n0 - n); burette volume from the ideal gas law. */
export function h2o2Rig(s: RigSpec): RigOut {
  const k = s.k ?? rigK(s.catalyst ?? 'none').k(s.T);
  const y = odeAt((_t, v) => [-k * v[0]!], [s.n0], [s.tEnd])[0] ?? [Number.NaN];
  const n = y[0]!, nO2 = 0.5 * (s.n0 - n);
  return { n, fraction: n / s.n0, nO2, V_O2: burette(nO2, s.T, s.P), k };
}

/** Time for a first-order species to fall to `fraction` of its start (the exam question: 5 g -> 3 g), s. */
export function timeToFraction(k: number, fraction: number): number {
  return integrateUntil((_t, y) => [-k * y[0]!], [1], 40 / k, (y) => y[0]! - fraction).t;
}

// ---------------------------------------------------------------------------------------------------- batch unit
export const batchUnit: UnitOp = (inlets, u: UnitInst, ctx) => {
  const inn = inlets['in'];
  if (!inn) return failResult('NO_INLET', {}, { unitId: u.id });
  const guard = guardInlets<never>({ in: inn }, u);
  if (guard) return guard;
  const law = findLaw(str(u, 'law', 'K6'));
  if (law === undefined || (law.form !== 'first_order' && law.form !== 'cstr_arrhenius')) return failResult('NOT_BATCH_LAW', {}, { unitId: u.id });
  const rx = findReaction(law.reactions[0]!)!;
  for (const sp of Object.keys(rx.nu)) if (!ctx.species.includes(sp)) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: sp });
  const keyId = str(u, 'key', law.species['A']!);
  const ki = ctx.species.indexOf(keyId);
  if (ki < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: keyId });
  const T = num(u, 'T', inn.T), time = num(u, 'time', 0);
  if (!(T > 0) || !(time >= 0)) return failResult('SPEC_RANGE', { T, time }, { unitId: u.id });
  const k = typeof u.params['k'] === 'number' ? (u.params['k'] as number) : rigK(u.catalystId ?? str(u, 'catalystId', 'none'), law.id).k(T);
  const n0 = inn.n[ki]!;
  const nuK = Math.abs(rx.nu[keyId]!);
  const y = time === 0 ? [n0] : odeAt((_t, v) => [-k * v[0]!], [n0], [time])[0];
  if (y === undefined || !Number.isFinite(y[0]!)) return failResult('NUMERIC_GUARD', { k }, { unitId: u.id });
  const xi = (n0 - y[0]!) / nuK;
  const n = inn.n.map((v, i) => v + (rx.nu[ctx.species[i]!] ?? 0) * xi);
  const dH = typeof u.params['dH'] === 'number' ? (u.params['dH'] as number) : rx.dH298book !== undefined ? rx.dH298book * 1e3 : rxnDH(rx.nu, T, 'rigorous');
  const O2 = ctx.species.indexOf('O2');
  const info: Record<string, number> = { X: n0 > 0 ? 1 - y[0]! / n0 : 0, xi, k, T, time };
  if (O2 >= 0) info['V_O2'] = burette(n[O2]!, T, inn.P);
  const diag: Diag[] = [];
  return okResult({ outlets: { out: { n, T, P: inn.P } }, duty: xi * dH, info }, diag);
};
