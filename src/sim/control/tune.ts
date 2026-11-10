// Tuning rules and the bump-test fit. IMC / lambda for FOPDT: Kc = tau / (K (lambda + theta)), tauI = tau. Ziegler-Nichols from the ultimate gain and period
// (found here by the frequency method: phase of K e^{-j w theta} / (1 + j w tau) is -180 degrees).
import { brent, dmath } from '@core/numerics';
import type { Fopdt } from './process';

export interface Tuning { kc: number; tauI: number; tauD: number }

export const imcPI = (p: Fopdt, lambda: number): Tuning => ({ kc: p.tau / (p.K * (lambda + p.theta)), tauI: p.tau, tauD: 0 });
/** IMC-PID for FOPDT (Rivera, Morari, Skogestad 1986, Pade 1/1 for the dead time). */
export const imcPID = (p: Fopdt, lambda: number): Tuning => {
  const h = p.theta / 2;
  return { kc: (p.tau + h) / (p.K * (lambda + h)), tauI: p.tau + h, tauD: (p.tau * h) / (p.tau + h) };
};

/** Ultimate gain and period of a FOPDT under proportional control (needs theta > 0). */
export function ultimate(p: Fopdt): { ku: number; pu: number; w: number } {
  const f = (w: number): number => dmath.atan(w * p.tau) + w * p.theta - Math.PI;
  const w = brent(f, Math.PI / (2 * p.theta), Math.PI / p.theta, { tol: 1e-12 }).x;
  return { ku: Math.sqrt(1 + w * p.tau * w * p.tau) / p.K, pu: (2 * Math.PI) / w, w };
}
/** Ziegler-Nichols closed-loop rules. */
export function zn(ku: number, pu: number, kind: 'P' | 'PI' | 'PID'): Tuning {
  if (kind === 'P') return { kc: 0.5 * ku, tauI: 0, tauD: 0 };
  if (kind === 'PI') return { kc: 0.45 * ku, tauI: pu / 1.2, tauD: 0 };
  return { kc: 0.6 * ku, tauI: pu / 2, tauD: pu / 8 };
}
/** Offset of a P-only loop on a self-regulating process, as a fraction of the step: 1 / (1 + Kc K). */
export const pOffsetFraction = (kc: number, K: number): number => 1 / (1 + kc * K);

/** Fit K, tau, theta to the open-loop response of a bump (step du at t = 0 from y0) by the two-point method (Smith): t28.3 and t63.2 of the final change. */
export function fitFopdt(t: number[], y: number[], du: number, y0 = 0): Fopdt {
  const yEnd = y[y.length - 1]!, dy = yEnd - y0, K = dy / du;
  const cross = (frac: number): number => {
    const target = y0 + frac * dy;
    for (let k = 0; k < y.length; k++) {
      if ((dy >= 0 && y[k]! >= target) || (dy < 0 && y[k]! <= target)) {
        const ya = k === 0 ? y0 : y[k - 1]!, ta = k === 0 ? 0 : t[k - 1]!;
        return ya === y[k]! ? t[k]! : ta + ((target - ya) / (y[k]! - ya)) * (t[k]! - ta);
      }
    }
    return t[t.length - 1]!;
  };
  const t28 = cross(0.283), t63 = cross(0.632);
  const tau = 1.5 * (t63 - t28);
  return { K, tau: Math.max(tau, 1e-6), theta: Math.max(0, t63 - tau) };
}
