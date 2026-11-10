// Vapour-liquid equilibrium (DESIGN 3.3): modified Raoult y P = x gamma Psat with gamma = 1, Antoine Psat from the species
// rows (log10 P/bar = A - B/(T/K + C)); Henry gases K = H/P (water solvent, Sander constants) or the default K = 1e4;
// non-volatile species (acids, solids) K = 0. Rachford-Rice with a bubble/dew pre-check and a bracketed Newton.
// Pure functions of arrays; the flash unit maps stream slots to components. SI: Pa, K.
import { brent, dmath } from '@core/numerics';
import { SPECIES } from '../../data/species';
import { C_WATER, HENRY, K_HENRY_DEFAULT } from '../../data/vle';

/** Component (gas) id of a species id: NH3(l) -> NH3, others map to themselves. */
export const componentOf = (id: string): string => SPECIES[id]?.liquidOf ?? id;

const EXP_MAX = 12;
/** log10 of the vapour pressure from Antoine constants; the denominator is floored so it can never pass its pole. */
export function antoineLog10P(A: number, B: number, C: number, T: number): number {
  const d = T + C;
  return A - B / (d > 1 ? d : 1);
}

export interface PsatResult { /** Pa. */ P: number; extrapolated: boolean }
/** Saturation pressure from the species Antoine row, or null when the species has none (Henry / non-volatile). */
export function psatSpecies(id: string, T: number): PsatResult | null {
  const s = SPECIES[componentOf(id)] ?? SPECIES[id];
  const a = s?.antoine;
  if (!a) return null;
  let e = antoineLog10P(a.A, a.B, a.C, T);
  if (e > EXP_MAX) e = EXP_MAX;
  return { P: dmath.pow(10, e) * 1e5, extrapolated: T < a.Tlo || T > a.Thi };
}

/** Condensable here = has Antoine data and lies below its critical temperature. */
export function isCondensable(id: string, T: number): boolean {
  const c = componentOf(id), s = SPECIES[c];
  if (!s || !s.antoine) return false;
  return !(typeof s.Tc === 'number' && T >= s.Tc);
}
/** Volatile = a gas-phase species (or the liquid twin of one). Everything else (acids, solids, aqueous) is non-volatile. */
const isVolatile = (id: string): boolean => { const s = SPECIES[componentOf(id)]; return !!s && s.phase === 'g'; };

/** Henry K = y/x = H/P, H = c_w / Hcp(T) (Pa per mole fraction) in a water solvent; default 1e4 otherwise or without data. */
export function henryK(id: string, T: number, P: number, solvent: 'water' | 'other'): number {
  const h = solvent === 'water' ? HENRY[componentOf(id)] : undefined;
  if (!h) return K_HENRY_DEFAULT;
  const Hcp = h.Hcp * dmath.exp(h.C * (1 / T - 1 / 298.15));
  return C_WATER / Hcp / P;
}

export interface KResult { K: number[]; /** ids whose Antoine range was exceeded. */ extrap: string[]; solvent: 'water' | 'other' }
/** K values for components `ids` at T, P; `z` (any scale) decides the solvent: water when H2O is the largest condensable. */
export function kValues(ids: readonly string[], z: readonly number[], T: number, P: number): KResult {
  let best = -1, bestN = 0;
  ids.forEach((id, i) => { if (isCondensable(id, T) && z[i]! > bestN) { bestN = z[i]!; best = i; } });
  const solvent: 'water' | 'other' = best >= 0 && componentOf(ids[best]!) === 'H2O' ? 'water' : 'other';
  const extrap: string[] = [];
  const K = ids.map((id) => {
    if (isCondensable(id, T)) {
      const p = psatSpecies(id, T)!;
      if (p.extrapolated) extrap.push(id);
      return p.P / P;
    }
    return isVolatile(id) ? henryK(id, T, P, solvent) : 0;
  });
  return { K, extrap, solvent };
}

// ------------------------------------------------------------------------------------------ Rachford-Rice
export type FlashCode = 'TWO_PHASE' | 'ALL_VAPOUR' | 'ALL_LIQUID';
export interface RRResult { beta: number; code: FlashCode; iter: number; residual: number }

function rrF(z: readonly number[], K: readonly number[], b: number, d: { f: number; fp: number }): void {
  let f = 0, fp = 0;
  for (let i = 0; i < z.length; i++) {
    if (z[i]! === 0) continue;
    const k1 = K[i]! - 1, den = 1 + b * k1;
    if (den <= 0) { d.f = -Infinity; d.fp = 0; return; }
    const t = (z[i]! * k1) / den;
    f += t; fp -= t * (k1 / den);
  }
  d.f = f; d.fp = fp;
}

/** Solve sum z (K-1)/(1 + beta (K-1)) = 0 on beta in [0, 1] (z normalised inside). Single-phase cases by the bubble/dew test. */
export function rachfordRice(z0: readonly number[], K: readonly number[]): RRResult {
  const tot = z0.reduce((a, b) => a + b, 0);
  if (!(tot > 0)) return { beta: 0, code: 'ALL_LIQUID', iter: 0, residual: 0 };
  const z = z0.map((v) => v / tot);
  let s0 = 0, s1 = 0, zeroK = false;
  for (let i = 0; i < z.length; i++) {
    if (z[i]! === 0) continue;
    s0 += z[i]! * K[i]!;
    if (K[i]! > 0) s1 += z[i]! / K[i]!; else zeroK = true;
  }
  if (s0 <= 1) return { beta: 0, code: 'ALL_LIQUID', iter: 0, residual: 0 };
  if (!zeroK && s1 <= 1) return { beta: 1, code: 'ALL_VAPOUR', iter: 0, residual: 0 };
  let lo = 0, hi = 1;
  const d = { f: 0, fp: 0 };
  const f0 = s0 - 1, f1 = zeroK ? -Infinity : 1 - s1;
  let b = Number.isFinite(f1) ? f0 / (f0 - f1) : 0.5;
  if (!(b > 0 && b < 1)) b = 0.5;
  let iter = 0, best = b, bestF = Infinity;
  for (; iter < 300; iter++) {
    rrF(z, K, b, d);
    if (Math.abs(d.f) < bestF) { bestF = Math.abs(d.f); best = b; }
    if (Math.abs(d.f) <= 1e-15) break;
    if (d.f > 0) lo = b; else hi = b;
    if (hi - lo <= 2.3e-16 * Math.max(hi, 1e-300) + 1e-300) break;
    let nb = d.fp < 0 && Number.isFinite(d.f) ? b - d.f / d.fp : NaN;
    if (!(nb > lo && nb < hi)) nb = 0.5 * (lo + hi);
    b = nb;
  }
  rrF(z, K, best, d);
  return { beta: best, code: 'TWO_PHASE', iter, residual: Math.abs(d.f) };
}

export interface FlashResult { beta: number; code: FlashCode; x: number[]; y: number[]; iter: number; residual: number }
/** Flash of feed `z` (any scale) with given K: phase compositions normalised to 1. */
export function flashK(z0: readonly number[], K: readonly number[]): FlashResult {
  const rr = rachfordRice(z0, K);
  const tot = z0.reduce((a, b) => a + b, 0);
  const z = z0.map((v) => (tot > 0 ? v / tot : 0));
  const x = new Array<number>(z.length).fill(0), y = new Array<number>(z.length).fill(0);
  const b = rr.beta;
  let sx = 0, sy = 0;
  for (let i = 0; i < z.length; i++) {
    const den = (1 - b) + b * K[i]!;
    let xi = 0;
    if (rr.code === 'ALL_LIQUID') xi = z[i]!;
    else if (rr.code === 'ALL_VAPOUR') xi = K[i]! > 0 ? z[i]! / K[i]! : 0;
    else xi = den > 0 ? z[i]! / den : 0;
    x[i] = xi; y[i] = rr.code === 'ALL_VAPOUR' ? z[i]! : K[i]! * xi;
    sx += x[i]!; sy += y[i]!;
  }
  if (rr.code === 'ALL_LIQUID') { /* x = z already, y is the incipient vapour */ }
  for (let i = 0; i < z.length; i++) { if (sx > 0) x[i] = x[i]! / sx; if (sy > 0) y[i] = y[i]! / sy; }
  return { beta: b, code: rr.code, x, y, iter: rr.iter, residual: rr.residual };
}

// ------------------------------------------------------------------------------------------ bubble / dew
export interface PointResult { T: number; /** Incipient phase composition (vapour at a bubble point, liquid at a dew point). */ other: number[] }
function root(g: (T: number) => number, Tlo: number, Thi: number): number | null {
  try {
    const a = g(Tlo), b = g(Thi);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a * b > 0) return null;
    return brent(g, Tlo, Thi, { tol: 1e-12 }).x;
  } catch { return null; }
}
/** Bubble temperature: sum x K(T) = 1 on [Tlo, Thi]; null when there is no root in the range. */
export function bubbleT(x0: readonly number[], Kfn: (T: number) => number[], Tlo: number, Thi: number): PointResult | null {
  const tot = x0.reduce((a, b) => a + b, 0), x = x0.map((v) => v / tot);
  const T = root((t) => { const K = Kfn(t); return x.reduce((a, v, i) => a + v * K[i]!, 0) - 1; }, Tlo, Thi);
  if (T === null) return null;
  const K = Kfn(T), y = x.map((v, i) => v * K[i]!), s = y.reduce((a, b) => a + b, 0);
  return { T, other: y.map((v) => v / s) };
}
/** Dew temperature: sum y / K(T) = 1; null when no root (or a non-volatile species is present). */
export function dewT(y0: readonly number[], Kfn: (T: number) => number[], Tlo: number, Thi: number): PointResult | null {
  const tot = y0.reduce((a, b) => a + b, 0), y = y0.map((v) => v / tot);
  const g = (t: number) => { const K = Kfn(t); let s = 0; for (let i = 0; i < y.length; i++) { if (y[i]! === 0) continue; if (!(K[i]! > 0)) return NaN; s += y[i]! / K[i]!; } return s - 1; };
  const T = root(g, Tlo, Thi);
  if (T === null) return null;
  const K = Kfn(T), x = y.map((v, i) => (K[i]! > 0 ? v / K[i]! : 0)), s = x.reduce((a, b) => a + b, 0);
  return { T, other: x.map((v) => v / s) };
}

// ------------------------------------------------------------------------------------------ species-level flash
export interface SpeciesFlash {
  beta: number; code: FlashCode | 'EMPTY'; nV: number[]; nL: number[]; K: number[]; x: number[]; y: number[];
  residual: number; extrap: string[]; solvent: 'water' | 'other';
}
/** Isothermal flash of component moles `n` (ids must be distinct components, see componentOf). nV + nL = n exactly. */
export function flashSpecies(ids: readonly string[], n: readonly number[], T: number, P: number): SpeciesFlash {
  const tot = n.reduce((a, b) => a + b, 0);
  const kr = kValues(ids, n, T, P);
  if (!(tot > 0)) {
    const zeros = n.map(() => 0);
    return { beta: 0, code: 'EMPTY', nV: zeros.slice(), nL: zeros.slice(), K: kr.K, x: zeros.slice(), y: zeros.slice(), residual: 0, extrap: kr.extrap, solvent: kr.solvent };
  }
  const f = flashK(n, kr.K);
  const nL = n.map((v, i) => {
    if (f.code === 'ALL_LIQUID') return v;
    if (f.code === 'ALL_VAPOUR') return 0;
    const den = (1 - f.beta) + f.beta * kr.K[i]!;
    const l = den > 0 ? (v * (1 - f.beta)) / den : v;
    return l < 0 ? 0 : l > v ? v : l;
  });
  const nV = n.map((v, i) => v - nL[i]!);
  return { beta: f.beta, code: f.code, nV, nL, K: kr.K, x: f.x, y: f.y, residual: f.residual, extrap: kr.extrap, solvent: kr.solvent };
}
