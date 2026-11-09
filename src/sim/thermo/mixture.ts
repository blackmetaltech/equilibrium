// Stream-level thermodynamics (ideal mixing, ideal gas): everything is a pure function of a StreamState and the level's
// species list; nothing is stored. SI: mol/s, K, Pa, W, W/K, kg/s.
import { brent, dmath } from '@core/numerics';
import type { Diag, SimResult, StreamState } from '../types';
import { failResult, okResult } from '../types';
import { GROUP_GAS, GROUP_LIQUID, GROUP_SOLID, cpOf, extrapolationDiag, hOf, isExtrapolated, sOf, thermoOf, type Thermo } from './species';
import { R_GAS } from './shomate';

/** Standard-state pressure, Pa. */
export const P_STD = 1e5;
export const SOLVE_T_MIN = 50;
export const SOLVE_T_MAX = 3500;

/** Runtime helper (not game state): the level's species list compiled for hot loops. */
export interface Mixture {
  ids: readonly string[];
  /** id -> index. */
  index: Readonly<Record<string, number>>;
  th: readonly Thermo[];
  /** Molar masses, kg/mol. */
  M: readonly number[];
}

/** Build the helper for `ctx.species`. Throws on an unknown species or one without thermo data (a level-authoring error). */
export function makeMixture(ids: readonly string[]): Mixture {
  const index: Record<string, number> = {};
  const th: Thermo[] = [];
  ids.forEach((id, i) => { th.push(thermoOf(id)); index[id] = i; });
  return { ids, index, th, M: th.map((t) => t.M) };
}

/** Index of a species id in the mixture, or -1. */
export function indexOf(mx: Mixture, id: string): number {
  return Object.prototype.hasOwnProperty.call(mx.index, id) ? mx.index[id]! : -1;
}

export function totalFlow(n: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < n.length; i++) s += n[i]!;
  return s;
}

/** Mole fractions (zeros for a zero stream). `out` may be passed to avoid allocation. */
export function moleFractions(n: readonly number[], out?: number[]): number[] {
  const r = out ?? new Array<number>(n.length);
  const t = totalFlow(n);
  for (let i = 0; i < n.length; i++) r[i] = t > 0 ? n[i]! / t : 0;
  return r;
}

/** Mass flow, kg/s. */
export function massFlow(mx: Mixture, n: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < n.length; i++) s += n[i]! * mx.M[i]!;
  return s;
}

/** Mixture molar mass, kg/mol (0 for a zero stream). */
export function molarMass(mx: Mixture, n: readonly number[]): number {
  const t = totalFlow(n);
  return t > 0 ? massFlow(mx, n) / t : 0;
}

/** Enthalpy flow at temperature T, W (ideal mixing, formation basis). */
export function enthalpyFlowAt(mx: Mixture, n: readonly number[], T: number): number {
  let s = 0;
  for (let i = 0; i < n.length; i++) if (n[i]! !== 0) s += n[i]! * hOf(mx.th[i]!, T);
  return s;
}
export function enthalpyFlow(mx: Mixture, s: StreamState): number { return enthalpyFlowAt(mx, s.n, s.T); }

/** Heat-capacity flow, W/K. */
export function cpFlow(mx: Mixture, n: readonly number[], T: number): number {
  let s = 0;
  for (let i = 0; i < n.length; i++) if (n[i]! !== 0) s += n[i]! * cpOf(mx.th[i]!, T);
  return s;
}

/**
 * Entropy of mixing, W/K, >= 0: -R sum n_i ln(x_i) with x_i the fraction inside the species' own phase group
 * (all gases mix ideally with each other, all liquids with each other; solids are pure phases and do not mix).
 */
export function mixingEntropyFlow(mx: Mixture, n: readonly number[]): number {
  let g = 0, l = 0;
  for (let i = 0; i < n.length; i++) {
    const grp = mx.th[i]!.group;
    if (grp === GROUP_GAS) g += n[i]!; else if (grp === GROUP_LIQUID) l += n[i]!;
  }
  let s = 0;
  for (let i = 0; i < n.length; i++) {
    const ni = n[i]!;
    if (ni <= 0) continue;
    const grp = mx.th[i]!.group;
    if (grp === GROUP_GAS) s -= ni * dmath.log(ni / g);
    else if (grp === GROUP_LIQUID) s -= ni * dmath.log(ni / l);
  }
  return R_GAS * s;
}

/**
 * Entropy flow, W/K: S_i = s_i(T) - R ln(y_i P / 1 bar) for gases (y_i = fraction among the gas species), plus the liquid
 * mixing term -R ln x_i for liquids, and s_i(T) alone for pure solids. For an all-gas stream this is exactly the textbook form.
 */
export function entropyFlow(mx: Mixture, st: StreamState): number {
  const n = st.n;
  let g = 0, l = 0;
  for (let i = 0; i < n.length; i++) {
    const grp = mx.th[i]!.group;
    if (grp === GROUP_GAS) g += n[i]!; else if (grp === GROUP_LIQUID) l += n[i]!;
  }
  const lnP = dmath.log(st.P / P_STD);
  let s = 0;
  for (let i = 0; i < n.length; i++) {
    const ni = n[i]!;
    if (ni <= 0) continue;
    const t = mx.th[i]!;
    let si = sOf(t, st.T);
    if (t.group === GROUP_GAS) si -= R_GAS * (dmath.log(ni / g) + lnP);
    else if (t.group === GROUP_LIQUID) si -= R_GAS * dmath.log(ni / l);
    else if (t.group !== GROUP_SOLID) si = Number.NaN;
    s += ni * si;
  }
  return s;
}

/**
 * Temperature at which the stream enthalpy flow equals `Htarget` (W), Brent on [50, 3500] K. H is increasing in T (Cp > 0,
 * also in the extrapolated range). Fails with a code instead of throwing. `P` is accepted for the unit-op signature (ideal
 * mixing: H does not depend on P).
 */
export function solveT(mx: Mixture, Htarget: number, n: readonly number[], P?: number): SimResult<number> {
  void P;
  if (!(totalFlow(n) > 0)) return failResult('ZERO_FLOW', { H: Htarget });
  const f = (T: number): number => enthalpyFlowAt(mx, n, T) - Htarget;
  const flo = f(SOLVE_T_MIN), fhi = f(SOLVE_T_MAX);
  if (!(flo <= 0 && fhi >= 0)) return failResult('T_BRACKET', { H: Htarget, Hlo: flo + Htarget, Hhi: fhi + Htarget });
  const r = brent(f, SOLVE_T_MIN, SOLVE_T_MAX, { tol: 1e-12, maxIter: 500 });
  if (!r.converged) return failResult('NO_CONVERGE', { H: Htarget, T: r.x });
  return okResult(r.x);
}

/** PROPERTY_EXTRAPOLATED (info) for each present species whose valid range does not cover the stream temperature. */
export function extrapolationDiags(mx: Mixture, st: StreamState): Diag[] {
  const out: Diag[] = [];
  for (let i = 0; i < st.n.length; i++) {
    if (st.n[i]! > 0 && isExtrapolated(mx.th[i]!, st.T)) {
      const d = extrapolationDiag(mx.ids[i]!, st.T);
      if (d) out.push(d);
    }
  }
  return out;
}
