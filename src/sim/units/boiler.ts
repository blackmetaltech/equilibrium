// Waste-heat boiler / steam generator (DESIGN 3.7, L05): gas cooled to outlet T; steam make = duty / (h_g(P) - h_BFW(105 C)).
// Steam is reported in `info` (kg/s), not as a stream. Saturation values from the IF97 points (data/vle.ts).
import { BFW, STEAM } from '../../data/vle';
import { enthalpyFlow, makeMixture, totalFlow } from '../thermo';
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, has, num, str } from './utilities';

/** Minimum gas-to-steam temperature approach at the cold end, K (GAME). */
export const BOILER_DT_MIN = 10;

export const boiler: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const lvl = str(u, 'steam', 'HP');
  if (lvl !== 'LP' && lvl !== 'MP' && lvl !== 'HP') return failResult('SPEC_RANGE', { steam: lvl }, { unitId: u.id });
  if (!has(u, 'T')) return failResult('SPEC_MISSING', {}, { unitId: u.id });
  const st = STEAM[lvl], T = num(u, 'T'), P = s.P - num(u, 'dP', 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  if (T > s.T + 1e-9 || T < st.T + BOILER_DT_MIN) return failResult('TEMPERATURE_CROSS', { T_out: T, T_in: s.T, T_steam: st.T, dT_min: BOILER_DT_MIN }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const out = { n: s.n.slice(), T, P };
  const Q = totalFlow(s.n) > 0 ? enthalpyFlow(mx, out) - enthalpyFlow(mx, s) : 0;
  const dh = st.hg - BFW.h, kg = -Q / dh;
  return okResult({ outlets: { out }, duty: Q, info: { Q, steam_kg_s: kg, steam_t_h: kg * 3.6, steam_P: st.P, steam_T: st.T, dh_steam: dh, T_out: T } });
};
