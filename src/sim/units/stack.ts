// Stack + analyser (DESIGN 3.7): sink with raw emission numbers in `info`. Per-tonne figures need the product basis (not known here).
// Keys: y_<id> mole fraction, ppmv_<id>, kg_h_<id>, mg_Nm3_<id> (normal m3 at 273.15 K, 101325 Pa), kg_h_NOx (as NO2), Vdot_Nm3_s.
import { SPECIES } from '../../data/species';
import { massFlow, makeMixture, totalFlow } from '../thermo';
import { R_GAS } from '../thermo/shomate';
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets } from './utilities';

export const NM3_PER_MOL = (R_GAS * 273.15) / 101325;

export const stack: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const mx = makeMixture(ctx.species), tot = totalFlow(s.n), nm3 = tot * NM3_PER_MOL;
  const info: Record<string, number> = { total_mol_s: tot, flow_kg_s: massFlow(mx, s.n), Vdot_Nm3_s: nm3, Vdot_m3_s: (tot * R_GAS * s.T) / s.P, T: s.T, P: s.P };
  ctx.species.forEach((id, i) => {
    const n = s.n[i]!, kg = n * mx.M[i]!;
    info['y_' + id] = tot > 0 ? n / tot : 0; info['ppmv_' + id] = tot > 0 ? (1e6 * n) / tot : 0;
    info['kg_h_' + id] = kg * 3600; info['mg_Nm3_' + id] = nm3 > 0 ? (kg * 1e6) / nm3 : 0;
  });
  const ix = (id: string) => ctx.species.indexOf(id);
  let nox = 0;
  for (const [id, f] of [['NO', 1], ['NO2', 1], ['N2O4', 2]] as const) if (ix(id) >= 0) nox += f * s.n[ix(id)!]!;
  info.nox_mol_s = nox; info.kg_h_NOx = nox * (SPECIES.NO2!.M / 1000) * 3600; // as NO2
  return okResult({ outlets: {}, info });
};
