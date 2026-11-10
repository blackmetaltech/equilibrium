// Ideal NH3 separator (L19): all NH3 leaves as liquid at T; the rest is the gas. Refrigeration duty and electric cost at T (DESIGN 3.8).
import { SPECIES } from '../../data/species';
import { enthalpyFlow, makeMixture, totalFlow } from '../thermo';
import { THERMO, hOf } from '../thermo/species';
import { psatSpecies } from '../thermo/vle';
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { CARNOT_FRACTION, MOTOR_EFF, T_REJECT, UTIL, copAt, guardInlets, num } from './utilities';

export const T_SEP_DEFAULT = 253.15;

export const nh3Sep: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const iG = ctx.species.indexOf('NH3'), iL = ctx.species.indexOf('NH3(l)');
  if (iG < 0 && iL < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: 'NH3' });
  const T = num(u, 'T', T_SEP_DEFAULT), P = s.P - num(u, 'dP', 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  if (T < UTIL.refrig.T - 1e-6) return failResult('UTILITY_CANNOT_REACH', { utility: 'refrig', T_out: T, T_limit: UTIL.refrig.T }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const vap = s.n.slice(), liq = new Array<number>(s.n.length).fill(0);
  const nNH3 = (iG >= 0 ? s.n[iG]! : 0) + (iL >= 0 ? s.n[iL]! : 0);
  if (iG >= 0) vap[iG] = 0;
  if (iL >= 0) vap[iL] = 0;
  liq[iL >= 0 ? iL : iG] = nNH3;
  let Hout = nNH3 * hOf(THERMO['NH3(l)']!, T);
  for (let i = 0; i < vap.length; i++) if (vap[i]! !== 0) Hout += vap[i]! * hOf(mx.th[i]!, T);
  const Q = totalFlow(s.n) > 0 ? Hout - enthalpyFlow(mx, s) : 0;
  const q = Math.max(0, -Q), cop = copAt(T, T_REJECT);
  const info: Record<string, number> = {
    Q, T_sep: T, nh3_mol_s: nNH3, nh3_kg_s: nNH3 * SPECIES.NH3!.M / 1000, nh3_t_h: (nNH3 * SPECIES.NH3!.M * 3.6) / 1000,
    cop, carnot_fraction: CARNOT_FRACTION, refrig_electric_W: cop > 0 ? q / cop : 0, refrig_motor_eff: MOTOR_EFF, psat_nh3: psatSpecies('NH3', T)!.P,
  };
  return okResult({ outlets: { vap: { n: vap, T, P }, liq: { n: liq, T, P } }, duty: Q, info });
};
