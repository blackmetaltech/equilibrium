// SO3 absorber (DESIGN 3.7, L13/L25): fixed-recovery unit, SO3 + H2O(l) -> H2SO4(l); product acid at the chosen strength.
// Heat of absorption = H_out - H_in on the formation basis (dHf of H2SO4(l) vs SO3 + H2O(l)); make-up water enters at 298.15 K.
// Choosing water as absorbent raises WATER_ABSORBER_MIST (warn) and sets info.mist = 1; the consequence is the dynamics lane's.
import { enthalpyFlow, makeMixture, totalFlow } from '../thermo';
import { THERMO, hOf } from '../thermo/species';
import type { Diag, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, num, str } from './utilities';

export const ACID_MIN = 0.98, ACID_MAX = 0.985, RECOVERY_MAX = 0.9995, T_ACID_DEFAULT = 353.15, T_MAKEUP = 298.15;

export const absorber: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const iS = ctx.species.indexOf('SO3'), iA = ctx.species.indexOf('H2SO4(l)'), iW = ctx.species.indexOf('H2O(l)');
  for (const [i, id] of [[iS, 'SO3'], [iA, 'H2SO4(l)'], [iW, 'H2O(l)']] as const) if (i < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: id });
  const w = num(u, 'acid', ACID_MAX), rec = num(u, 'recovery', RECOVERY_MAX), T = num(u, 'T', T_ACID_DEFAULT);
  if (!(w >= ACID_MIN - 1e-12 && w <= ACID_MAX + 1e-12)) return failResult('SPEC_RANGE', { acid: w, min: ACID_MIN, max: ACID_MAX }, { unitId: u.id });
  if (!(rec >= 0 && rec <= RECOVERY_MAX + 1e-12)) return failResult('SPEC_RANGE', { recovery: rec, max: RECOVERY_MAX }, { unitId: u.id });
  const P = s.P - num(u, 'dP', 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const Ms = THERMO['H2SO4(l)']!.M, Mw = THERMO['H2O(l)']!.M;
  const nAbs = rec * s.n[iS]!;
  const nWprod = (nAbs * Ms * (1 - w)) / (w * Mw);
  const nWmake = nAbs + nWprod;
  const gas = s.n.slice(); gas[iS] = s.n[iS]! - nAbs;
  const acid = new Array<number>(s.n.length).fill(0); acid[iA] = nAbs; acid[iW] = nWprod;
  const gasOut = { n: gas, T, P }, acidOut = { n: acid, T, P };
  const Hin = enthalpyFlow(mx, s) + nWmake * hOf(THERMO['H2O(l)']!, T_MAKEUP);
  const Q = totalFlow(s.n) > 0 || nWmake > 0 ? enthalpyFlow(mx, gasOut) + enthalpyFlow(mx, acidOut) - Hin : 0;
  const diag: Diag[] = [];
  const water = str(u, 'absorbent', 'acid') === 'water';
  if (water) diag.push({ code: 'WATER_ABSORBER_MIST', severity: 'warn', unitId: u.id, data: { acid: w } });
  const acidKg = nAbs * Ms / w;
  return okResult({ outlets: { out: gasOut, acid: acidOut }, duty: Q, info: {
    absorbed_mol_s: nAbs, so3_out_mol_s: gas[iS]!, recovery: rec, Q, heat_per_mol: nAbs > 0 ? Q / nAbs : 0, water_makeup_kg_s: nWmake * Mw,
    water_makeup_mol_s: nWmake, acid_kg_s: acidKg, acid_t_h: acidKg * 3.6, h2so4_kg_s: nAbs * Ms, mist: water ? 1 : 0, T,
  } }, diag);
};
