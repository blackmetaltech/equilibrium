// Two-stream counter-current heat exchanger (DESIGN 3.7). Spec: `area` (m2) or `T_hot_out` (K).
// Area spec: eps-NTU with mixture Cp evaluated at the mean temperature of each stream (fixed point on the outlets), then the
// outlets come from an enthalpy-exact solve of H_out = H_in -/+ Q, so energy closes to solver tolerance. Q <= Q_max (each stream
// brought to the other's inlet T in true enthalpy), eps <= 1: no temperature cross by construction.
// Hot-outlet spec: Q from the true enthalpy; TEMPERATURE_CROSS if the cold stream would have to leave hotter than the hot inlet
// (or the spec is above the hot inlet / below the cold inlet); the area needed comes from the inverse eps-NTU relation.
import { dmath } from '@core/numerics';
import { makeMixture, cpFlow, enthalpyFlow, solveT, totalFlow, type Mixture } from '../thermo';
import { GROUP_LIQUID } from '../thermo/species';
import type { Conf, Diag, StreamState, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, has, num, str } from './utilities';

/**
 * Overall heat-transfer coefficient by service, W/(m2 K). Typed by hand (DESIGN 4.4 is the catalyst table and holds no U values):
 * mid-range of Towler and Sinnott 2013 Table 12.1 typical coefficients (gas-gas 10-50, gas-water 20-300, organic-water 250-750),
 * recalled not re-read, so conf is UNVERIFIED.
 */
export const U_TABLE: Readonly<Record<string, { U: number; src: string; conf: Conf }>> = {
  gas_gas: { U: 30, src: 'Towler-Sinnott-2013-T12.1', conf: 'UNVERIFIED' },
  gas_liquid: { U: 100, src: 'Towler-Sinnott-2013-T12.1', conf: 'UNVERIFIED' },
  liquid_liquid: { U: 500, src: 'Towler-Sinnott-2013-T12.1', conf: 'UNVERIFIED' },
};

export const DT_MIN_DEFAULT = 10;
const SLACK = 1e-9;

/** Counter-current effectiveness. */
export function effCounter(NTU: number, Cr: number): number {
  const x = NTU * (1 - Cr);
  if (Math.abs(1 - Cr) < 1e-12) return NTU / (1 + NTU);
  const em = -dmath.expm1(-x); // 1 - e^-x
  return em / ((1 - Cr) + Cr * em);
}
/** Inverse of effCounter: NTU for a given effectiveness (eps < 1). */
export function ntuCounter(eps: number, Cr: number): number {
  if (Math.abs(1 - Cr) < 1e-9) return eps / (1 - eps);
  return (dmath.log1p(-eps) - dmath.log1p(-eps * Cr)) / (Cr - 1);
}

const liquidShare = (mx: Mixture, n: readonly number[]): number => {
  let l = 0;
  for (let i = 0; i < n.length; i++) if (mx.th[i]!.group === GROUP_LIQUID) l += n[i]!;
  const t = totalFlow(n);
  return t > 0 ? l / t : 0;
};

export const hx: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const hi = inlets.hot_in, ci = inlets.cold_in;
  if (!hi || !ci) return failResult('NO_INLET', { port: hi ? 1 : 0 }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const Ph = hi.P - num(u, 'dP_hot', 0), Pc = ci.P - num(u, 'dP_cold', 0);
  if (!(Ph > 0) || !(Pc > 0)) return failResult('PRESSURE_NONPOSITIVE', { Ph, Pc }, { unitId: u.id });
  const out = (Th: number, Tc: number): StreamState[] => [{ n: hi.n.slice(), T: Th, P: Ph }, { n: ci.n.slice(), T: Tc, P: Pc }];
  if (!(totalFlow(hi.n) > 0) || !(totalFlow(ci.n) > 0)) {
    const [a, b] = out(hi.T, ci.T);
    return okResult({ outlets: { hot_out: a!, cold_out: b! }, info: { Q: 0, eps: 0, NTU: 0, area: 0 } });
  }
  const Th = hi.T, Tc = ci.T;
  if (!(Th > Tc)) return failResult('TEMPERATURE_CROSS', { T_hot_in: Th, T_cold_in: Tc }, { unitId: u.id });
  const Hh = enthalpyFlow(mx, hi), Hc = enthalpyFlow(mx, ci);
  const Qmax = Math.min(Hh - enthalpyFlow(mx, { n: hi.n, T: Tc, P: 0 }), enthalpyFlow(mx, { n: ci.n, T: Th, P: 0 }) - Hc);
  const service = str(u, 'service') || (() => {
    const lh = liquidShare(mx, hi.n) > 0.5, lc = liquidShare(mx, ci.n) > 0.5;
    return lh && lc ? 'liquid_liquid' : lh || lc ? 'gas_liquid' : 'gas_gas';
  })();
  const row = Object.prototype.hasOwnProperty.call(U_TABLE, service) ? U_TABLE[service]! : undefined;
  if (!row && !has(u, 'U')) return failResult('SERVICE_UNKNOWN', {}, { unitId: u.id });
  const U = has(u, 'U') ? num(u, 'U') : row!.U;
  if (!(U > 0)) return failResult('SPEC_RANGE', { U }, { unitId: u.id });

  let Q: number, Tho: number, Tco: number, Cmin: number, Cmax: number, area: number, eps: number, NTU: number;
  const cold = (q: number): number | undefined => { const r = solveT(mx, Hc + q, ci.n); return r.ok ? r.value : undefined; };
  const hot = (q: number): number | undefined => { const r = solveT(mx, Hh - q, hi.n); return r.ok ? r.value : undefined; };

  if (has(u, 'T_hot_out')) {
    Tho = num(u, 'T_hot_out');
    Q = Hh - enthalpyFlow(mx, { n: hi.n, T: Tho, P: 0 });
    if (!(Tho >= Tc) || !(Q >= 0) || Q > Qmax * (1 + 1e-12)) {
      return failResult('TEMPERATURE_CROSS', { T_hot_out: Tho, T_hot_in: Th, T_cold_in: Tc, Q, Qmax, T_cold_out: cold(Q) ?? -1 }, { unitId: u.id });
    }
    Tco = cold(Q) ?? Th;
    Cmin = cpFlow(mx, hi.n, 0.5 * (Th + Tho)); Cmax = cpFlow(mx, ci.n, 0.5 * (Tc + Tco));
    if (Cmax < Cmin) { const t = Cmin; Cmin = Cmax; Cmax = t; }
    eps = Math.min(Q / (Cmin * (Th - Tc)), 1 - 1e-12);
    NTU = ntuCounter(eps, Cmin / Cmax);
    area = (NTU * Cmin) / U;
  } else if (has(u, 'area')) {
    area = num(u, 'area');
    if (!(area >= 0)) return failResult('SPEC_RANGE', { area }, { unitId: u.id });
    Q = 0.5 * Qmax; Tho = hot(Q) ?? Th; Tco = cold(Q) ?? Tc; Cmin = 1; Cmax = 1; eps = 0; NTU = 0;
    for (let it = 0; it < 12; it++) {
      const Ch = cpFlow(mx, hi.n, 0.5 * (Th + Tho)), Cc = cpFlow(mx, ci.n, 0.5 * (Tc + Tco));
      Cmin = Math.min(Ch, Cc); Cmax = Math.max(Ch, Cc);
      NTU = (U * area) / Cmin;
      eps = effCounter(NTU, Cmin / Cmax);
      const Qn = Math.min(eps * Cmin * (Th - Tc), Qmax);
      const done = Math.abs(Qn - Q) <= 1e-12 * Math.abs(Qn);
      Q = Qn; Tho = hot(Q) ?? Th; Tco = cold(Q) ?? Tc;
      if (done) break;
    }
    eps = Q / (Cmin * (Th - Tc));
  } else return failResult('SPEC_MISSING', {}, { unitId: u.id });

  const dT1 = Th - Tco, dT2 = Tho - Tc, dTmin = Math.min(dT1, dT2);
  if (dTmin < -SLACK) return failResult('TEMPERATURE_CROSS', { T_hot_out: Tho, T_cold_out: Tco, T_hot_in: Th, T_cold_in: Tc }, { unitId: u.id });
  const diag: Diag[] = [];
  const limit = num(u, 'dt_min', DT_MIN_DEFAULT);
  if (dTmin < limit) diag.push({ code: 'DT_MIN_VIOLATED', severity: 'warn', unitId: u.id, data: { dT_min: dTmin, limit } });
  const lm = Math.abs(dT1 - dT2) < 1e-9 * Math.max(dT1, dT2, 1e-300) ? dT1 : dT1 > 0 && dT2 > 0 ? (dT1 - dT2) / dmath.log(dT1 / dT2) : 0;
  const [a, b] = out(Tho, Tco);
  return okResult({
    outlets: { hot_out: a!, cold_out: b! },
    info: { Q, eps, NTU, UA: U * area, U, area, dT_min: dTmin, dT1, dT2, LMTD: lm, Cmin, Cmax, Cr: Cmin / Cmax, Qmax, T_hot_out: Tho, T_cold_out: Tco },
  }, diag);
};
