// Compressor (DESIGN 3.7): ideal-gas isentropic with Shomate S on the actual mixture: T2s from S(T2s, P2) = S(T1, P1) by Brent,
// W = (h2s - h1) / eta, 1-4 stages with equal pressure ratio, intercooled to 40 C. Shaft work is added to the stream (WORK_ADDED);
// intercooler duty is reported as negative `duty`. DISCHARGE_TOO_HOT above 200 C at any stage discharge.
import { brent } from '@core/numerics';
import { dmath } from '@core/numerics';
import { makeMixture, enthalpyFlowAt, entropyFlow, solveT, totalFlow, SOLVE_T_MAX, type Mixture } from '../thermo';
import { GROUP_GAS } from '../thermo/species';
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { MOTOR_EFF, guardInlets, num } from './utilities';

export const T_INTERCOOL = 40 + 273.15;
export const T_DISCHARGE_MAX = 200 + 273.15;
export const ETA_DEFAULT = 0.75;

/** Isentropic outlet temperature (K) of the mixture `n` compressed from (T1, P1) to P2 (ideal gas, Shomate S). NaN if unbracketed. */
export function isentropicT(mx: Mixture, n: readonly number[], T1: number, P1: number, P2: number): number {
  const s1 = entropyFlow(mx, { n: n as number[], T: T1, P: P1 });
  const f = (T: number): number => entropyFlow(mx, { n: n as number[], T, P: P2 }) - s1;
  if (P2 === P1) return T1;
  let lo = T1, hi = Math.min(T1 * 1.5, SOLVE_T_MAX);
  if (P2 < P1) { hi = T1; lo = Math.max(T1 / 1.5, 50); while (f(lo) > 0 && lo > 50) lo = Math.max(lo / 1.5, 50); }
  else while (f(hi) < 0 && hi < SOLVE_T_MAX) hi = Math.min(hi * 1.5, SOLVE_T_MAX);
  if (Math.sign(f(lo)) === Math.sign(f(hi)) && f(lo) !== 0 && f(hi) !== 0) return Number.NaN;
  const r = brent(f, lo, hi, { tol: 1e-12, maxIter: 300 });
  return r.converged ? r.x : Number.NaN;
}

export const compressor: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const P2 = num(u, 'P', s.P), N = num(u, 'stages', 1), eta = num(u, 'eta', ETA_DEFAULT);
  if (!(N >= 1 && N <= 4 && Number.isInteger(N))) return failResult('COMPRESSOR_STAGES', { stages: N }, { unitId: u.id });
  if (!(eta > 0 && eta <= 1)) return failResult('COMPRESSOR_ETA', { eta }, { unitId: u.id });
  if (!(P2 > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pout: P2 }, { unitId: u.id });
  if (P2 < s.P) return failResult('COMPRESSOR_P_FALL', { Pin: s.P, Pout: P2 }, { unitId: u.id });
  let nLiq = 0;
  for (let i = 0; i < s.n.length; i++) if (mx.th[i]!.group !== GROUP_GAS) nLiq += s.n[i]!;
  if (nLiq > 0) return failResult('COMPRESSOR_LIQUID_IN', { n_liquid: nLiq }, { unitId: u.id });
  if (!(totalFlow(s.n) > 0) || P2 === s.P) return okResult({ outlets: { out: { n: s.n.slice(), T: s.T, P: P2 } }, work: 0, info: { shaft_W: 0, shaft_kW: 0, electric_W: 0, electric_kW: 0, stages: N, eta, ratio: 1, W_is: 0, intercool_W: 0 } });

  const r = dmath.pow(P2 / s.P, 1 / N);
  const info: Record<string, number> = {};
  let T = s.T, Pin = s.P, W = 0, Wis = 0, Qic = 0;
  for (let k = 1; k <= N; k++) {
    const Pout = k === N ? P2 : s.P * dmath.pow(r, k);
    const H1 = enthalpyFlowAt(mx, s.n, T);
    const Ts = isentropicT(mx, s.n, T, Pin, Pout);
    if (!Number.isFinite(Ts)) return failResult('NO_CONVERGE', { stage: k, T: T }, { unitId: u.id });
    const dHs = enthalpyFlowAt(mx, s.n, Ts) - H1;
    const w = dHs / eta;
    const t2 = solveT(mx, H1 + w, s.n);
    if (!t2.ok) return failResult(t2.code, { ...t2.data, stage: k }, { unitId: u.id });
    W += w; Wis += dHs;
    info['Ts_' + k] = Ts; info['T_out_' + k] = t2.value;
    if (t2.value > T_DISCHARGE_MAX) return failResult('DISCHARGE_TOO_HOT', { stage: k, T_out: t2.value, T_max: T_DISCHARGE_MAX, ratio: r }, { unitId: u.id });
    T = t2.value; Pin = Pout;
    if (k < N && T > T_INTERCOOL) { Qic += enthalpyFlowAt(mx, s.n, T_INTERCOOL) - enthalpyFlowAt(mx, s.n, T); T = T_INTERCOOL; }
  }
  Object.assign(info, {
    shaft_W: W, shaft_kW: W / 1000, electric_W: W / MOTOR_EFF, electric_kW: W / 1000 / MOTOR_EFF,
    W_is: Wis, stages: N, eta, ratio: r, intercool_W: -Qic, P_ratio_total: P2 / s.P,
  });
  return okResult({ outlets: { out: { n: s.n.slice(), T: info['T_out_' + N]!, P: P2 } }, duty: Qic, work: W, info });
};
