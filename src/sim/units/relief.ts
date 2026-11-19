// Relief valve (DESIGN 3.7, 4.5.1): API 520 critical-flow gas capacity W = C Kd A P1 sqrt(M/(Z T)) (Kb = Kc = 1) and API 526 letters.
// Pure functions + a static unit: the inlet stream is the credible relieving load; opening logic belongs to the dynamics lane.
import { dmath } from '@core/numerics';
import { API, ORIFICE_LETTERS, ORIFICE_MM2 } from '../../data/vle';
import { cpFlow, makeMixture, massFlow, molarMass, totalFlow } from '../thermo';
import { hasThermo } from '../thermo/species';
import { R_GAS } from '../thermo/shomate';
import type { Diag, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, massFlowAny, num, str } from './utilities';

/** Heat-capacity ratio assumed for a relief load made of pseudo-species (GAME). */
const K_PSEUDO = 1.3;

/** C(k) = 0.03948 sqrt(k (2/(k+1))^((k+1)/(k-1))); k -> 1 limit 0.023946. */
export function coefC(k: number): number {
  if (!(k > 1.001)) return API.C0 * dmath.exp(-0.5);
  return API.C0 * Math.sqrt(k * dmath.pow(2 / (k + 1), (k + 1) / (k - 1)));
}
/** Critical flow when P2/P1 <= (2/(k+1))^(k/(k-1)). */
export const criticalRatio = (k: number): number => dmath.pow(2 / (k + 1), k / (k - 1));
export const isCritical = (P2: number, P1: number, k: number): boolean => P2 / P1 <= criticalRatio(k);
/** Capacity, kg/h: A mm2, P1 kPa abs, T K, M kg/kmol. */
export function reliefCapacity(A_mm2: number, P1_kPa: number, T: number, Z: number, M: number, k: number, Kd = API.Kd): number {
  return A_mm2 * coefC(k) * Kd * P1_kPa * Math.sqrt(M / (Z * T));
}
/** Required effective area, mm2, for load W kg/h. */
export function reliefArea(W_kgh: number, P1_kPa: number, T: number, Z: number, M: number, k: number, Kd = API.Kd): number {
  return (W_kgh / (coefC(k) * Kd * P1_kPa)) * Math.sqrt((T * Z) / M);
}
/** Smallest API 526 letter whose area covers `A_mm2`, or null above T. */
export function selectOrifice(A_mm2: number): string | null {
  for (const l of ORIFICE_LETTERS) if (ORIFICE_MM2[l]! >= A_mm2) return l;
  return null;
}

export const OVERPRESSURE_DEFAULT = 0.1;
/** Relieving pressure P1, kPa abs, of a valve set at `Pset` Pa abs. API 520 accumulation is a share of the GAUGE set pressure: P1 = Pset + overpressure x (Pset - atm),
 *  so a 30 bar(g) set point relieves at 33.0 bar(g) (34.01 bar(a)), not at 1.1 x 31.01 bar(a). */
export const relievingKPa = (Pset: number, overpressure = OVERPRESSURE_DEFAULT): number => (Pset + overpressure * (Pset - 101325)) / 1000;

export const relief: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const letter = str(u, 'orifice', 'D');
  if (!Object.prototype.hasOwnProperty.call(ORIFICE_MM2, letter)) return failResult('SPEC_RANGE', { orifice: letter }, { unitId: u.id });
  const Pset = num(u, 'Pset', s.P);
  if (!(Pset > 0)) return failResult('SPEC_RANGE', { Pset }, { unitId: u.id });
  const P1 = relievingKPa(Pset, num(u, 'overpressure', OVERPRESSURE_DEFAULT)), A = ORIFICE_MM2[letter]!, Z = num(u, 'Z', 1);
  const tot = totalFlow(s.n);
  const info: Record<string, number> = { area_mm2: A, P1_kPa: P1, Pset };
  const diag: Diag[] = [];
  if (tot > 0) {
    // pseudo-species with no thermo rows (biomass, lumps): molar mass from the catalogue and the default heat-capacity ratio of a polyatomic gas
    const rich = ctx.species.every(hasThermo);
    const mx = rich ? makeMixture(ctx.species) : null;
    const W0 = mx ? massFlow(mx, s.n) : massFlowAny(ctx.species, s.n);
    const M = mx ? molarMass(mx, s.n) * 1000 : (W0 * 1000) / tot;
    const cp = mx ? cpFlow(mx, s.n, s.T) / tot : (K_PSEUDO * R_GAS) / (K_PSEUDO - 1), k = cp / (cp - R_GAS);
    const W = W0 * 3600, cap = reliefCapacity(A, P1, s.T, Z, M, k), need = reliefArea(W, P1, s.T, Z, M, k);
    Object.assign(info, { k, M, load_kg_h: W, capacity_kg_h: cap, required_area_mm2: need });
    if (W > cap) diag.push({ code: 'RELIEF_UNDERSIZED', severity: 'warn', unitId: u.id, data: { load: W, capacity: cap, area: A, need } });
  }
  return okResult({ outlets: {}, info }, diag);
};
