// Packed-bed dynamics (DESIGN 3.9): a lumped bed temperature per bed,
//   rho_cat cp_cat dT_bed/dt = (T_ss(W) - T_bed) (m cp)/(m_cat cp_cat)    i.e.   dT_bed/dt = (T_ss - T_bed)/tau_bed,
// whose steady state is the mean of the bed's steady-state profile (the PFR profile mean), so the bed has a thermal inertia of minutes during events.
// The step is the exact one for a 1 s step (alpha = 1 - exp(-1/tau_bed), set once per steady-state solve). Catalyst sintering: if the hot-spot
// temperature (steady peak + the lag offset of the bed) stays above the catalyst's T_max for more than 30 s, the activity falls,
//   a <- a exp(-k_s (T - T_max) dt)        (permanent within the level).
import { dmath } from '@core/numerics';
import { CP_CATALYST, SINTER_AFTER_S, SINTER_K } from '../../data/events';

/** Dynamic state of one bed (plain JSON). `Tss` and `Tpk` are the steady mean and peak of the latest solve, `a` the sintering activity factor. */
export interface BedDyn { T: number; a: number; over: number; Tss: number; Tpk: number; alpha: number; Tm: number; as: number }

/** Bed thermal time-constant limits, s (GAME: the formula m_cat cp_cat/(m cp) is hours for a lab-size flow). */
export const BED_TAU_MIN = 20;
export const BED_TAU_MAX = 900;

/** tau_bed = m_cat cp_cat / (m cp), W kg catalyst, `mcp` the gas heat-capacity flow in W/K. */
export function bedTau(W: number, mcp: number, cpCat: number = CP_CATALYST): number {
  const t = mcp > 0 ? (W * cpCat) / mcp : BED_TAU_MAX;
  return Math.min(BED_TAU_MAX, Math.max(BED_TAU_MIN, t));
}

/** Mean of the steady-state temperature profile along the bed (W-weighted trapezoid over the `p<i>_W/_T` entries of the bed's info; `T_out` when there is none). */
export function bedMeanT(info: Readonly<Record<string, number>>, prefix = ''): number {
  const np = info[prefix + 'np'] ?? 0;
  if (np < 2) return info[prefix + 'T_out'] ?? info['T_out'] ?? info['T'] ?? 0;
  let s = 0, w = 0;
  for (let i = 1; i < np; i++) {
    const dw = info[prefix + 'p' + i + '_W']! - info[prefix + 'p' + (i - 1) + '_W']!;
    s += 0.5 * (info[prefix + 'p' + i + '_T']! + info[prefix + 'p' + (i - 1) + '_T']!) * dw; w += dw;
  }
  return w > 0 ? s / w : (info[prefix + 'T_out'] ?? 0);
}

/** Hot-spot temperature of the bed now: the steady peak moved by how far the lagged bed temperature is from its steady mean. */
export const bedPeak = (d: BedDyn): number => d.Tpk + (d.T - d.Tss);

/** One plant second: lag the bed temperature, then integrate sintering. The limit `Tm` in K (`Tm` in the state; 1e9 = the catalyst has no limit). */
export function bedStep(d: BedDyn): void {
  d.T += (d.Tss - d.T) * d.alpha;
  const pk = bedPeak(d);
  if (pk > d.Tm) {
    d.over += 1;
    if (d.over > SINTER_AFTER_S) d.a *= dmath.exp(-SINTER_K * (pk - d.Tm));
  } else d.over = 0;
}

/** Point the bed at a new steady state (after a solve): the lagged temperature is kept, so the bed visibly takes minutes to follow. */
export function bedRetarget(d: BedDyn, Tss: number, Tpk: number, tau: number): void {
  d.Tss = Tss; d.Tpk = Tpk; d.alpha = 1 - dmath.exp(-1 / tau);
}
