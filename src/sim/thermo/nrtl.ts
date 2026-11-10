// NRTL activity coefficients for the binary pairs the game needs (DESIGN 4.5.1): ethanol-water (azeotrope wall of L23) and methanol-water (L22).
// ln g1 = x2^2 [ tau21 (G21/(x1 + x2 G21))^2 + tau12 G12 / (x2 + x1 G12)^2 ],  tau = A / (R T), G = exp(-alpha tau); parameters generated into
// data/vle.gen.ts by scripts/port-vle.py from docs/research/vle_binary.py. Vapour pressures are the catalogue Antoine rows (thermo/vle.ts).
// Pure functions of numbers; components are gas ids (C2H5OH, H2O, CH3OH).
import { brent, dmath } from '@core/numerics';
import { SPECIES } from '../../data/species';
import { NRTL_PAIRS, NRTL_R } from '../../data/vle';
import { componentOf, psatSpecies } from './vle';

export interface PairParams { A12: number; A21: number; alpha: number; /** true when the caller's (a, b) order is the reverse of the stored one. */ swapped: boolean }
/** Parameters of the pair (either order), or null when the game has none (then gamma = 1). */
export function pairParams(a: string, b: string): PairParams | null {
  const ca = componentOf(a), cb = componentOf(b);
  const f = NRTL_PAIRS[ca + '|' + cb];
  if (f) return { A12: f.A12, A21: f.A21, alpha: f.alpha, swapped: false };
  const r = NRTL_PAIRS[cb + '|' + ca];
  return r ? { A12: r.A12, A21: r.A21, alpha: r.alpha, swapped: true } : null;
}

/** [gamma_a, gamma_b] of the binary a-b at liquid mole fraction xa of a and temperature T (K). Ideal [1, 1] for an unknown pair. */
export function nrtlGamma(a: string, b: string, xa: number, T: number): [number, number] {
  const p = pairParams(a, b);
  if (p === null) return [1, 1];
  const x1 = p.swapped ? 1 - xa : xa, x2 = 1 - x1;
  const t12 = p.A12 / (NRTL_R * T), t21 = p.A21 / (NRTL_R * T);
  const G12 = dmath.exp(-p.alpha * t12), G21 = dmath.exp(-p.alpha * t21);
  const d1 = x1 + x2 * G21, d2 = x2 + x1 * G12;
  const l1 = x2 * x2 * (t21 * (G21 / d1) * (G21 / d1) + (t12 * G12) / (d2 * d2));
  const l2 = x1 * x1 * (t12 * (G12 / d2) * (G12 / d2) + (t21 * G21) / (d1 * d1));
  const g1 = dmath.exp(l1), g2 = dmath.exp(l2);
  return p.swapped ? [g2, g1] : [g1, g2];
}

const pSat = (id: string, T: number): number => psatSpecies(componentOf(id), T)?.P ?? Number.POSITIVE_INFINITY;
const T_LO = 280, T_HI = 420;

export interface BinaryPoint { /** Bubble temperature, K. */ T: number; /** Vapour mole fraction of a. */ y: number; gammaA: number; gammaB: number }
/** Bubble point of the liquid a-b at xa, total pressure P (Pa): sum x_i gamma_i Psat_i = P (modified Raoult). */
export function bubbleBinary(a: string, b: string, xa: number, P: number): BinaryPoint {
  const f = (T: number): number => { const g = nrtlGamma(a, b, xa, T); return xa * g[0] * pSat(a, T) + (1 - xa) * g[1] * pSat(b, T) - P; };
  const T = brent(f, T_LO, T_HI, { tol: 1e-10 }).x;
  const g = nrtlGamma(a, b, xa, T);
  return { T, y: (xa * g[0] * pSat(a, T)) / P, gammaA: g[0], gammaB: g[1] };
}
/** Equilibrium vapour composition of a liquid at xa and the temperature it boils at. */
export const yOfX = (a: string, b: string, xa: number, P: number): BinaryPoint => bubbleBinary(a, b, xa, P);

/** Relative volatility of a to b at the liquid composition xa and temperature T (gamma_a Psat_a / (gamma_b Psat_b)). */
export function alphaAt(a: string, b: string, xa: number, T: number): number {
  const g = nrtlGamma(a, b, xa, T);
  return (g[0] * pSat(a, T)) / (g[1] * pSat(b, T));
}

export interface Azeotrope { x: number; T: number; /** Mass fraction of a. */ wt: number }
/** Azeotrope of the pair at P (y = x at an interior composition) or null. Scans 0.02-0.98 for the sign change of y - x. */
export function azeotrope(a: string, b: string, P: number): Azeotrope | null {
  const d = (x: number): number => yOfX(a, b, x, P).y - x;
  const N = 48;
  let prevX = 0.02, prevD = d(prevX);
  for (let i = 1; i <= N; i++) {
    const x = 0.02 + (0.96 * i) / N, di = d(x);
    if (prevD * di < 0) {
      const xa = brent(d, prevX, x, { tol: 1e-12 }).x;
      const Ma = SPECIES[componentOf(a)]!.M, Mb = SPECIES[componentOf(b)]!.M;
      return { x: xa, T: bubbleBinary(a, b, xa, P).T, wt: (xa * Ma) / (xa * Ma + (1 - xa) * Mb) };
    }
    prevX = x; prevD = di;
  }
  return null;
}
