// Cooled tubular reactor (DESIGN L22, K3 methanol on Cu/ZnO/Al2O3): the packed-bed integrator in its 'cooled' mode, with boiling-water coolant at Tc
// and heat-transfer capacity UaW (W per K per kg of catalyst) along the tube. A hot spot forms where the rate peaks near the inlet; above the
// catalyst window (280 C for the Cu catalyst) the integrator raises CATALYST_OVERTEMP (the copper sinters).
// Params: W (kg catalyst), Tc (K, coolant, default 250 C), UaW (default TUBE_UAW), mode ('cooled' | 'adiabatic' | 'isothermal'), T (isothermal), dP,
//   law (default K3), activity, catalystId (default cu_zn_meoh).
// Info: those of the packed bed plus hot_W (catalyst mass at the hottest point, kg), Tc, UaW, q_cool (W removed into the coolant).
import { okResult, failResult } from '../types';
import type { UnitInst, UnitOp } from '../types';
import { bedOptions, bedProfile, simulateBed } from './rx_pfr';
import { guardInlets, has, num } from './utilities';

/** Heat-transfer capacity of the tube bundle per kg of catalyst, W/(K kg). GAME: calibrated so the default coolant (250 C) gives the DESIGN hot spot of
 *  about 298 C with the engine's rigorous thermo. The research script reaches 298.2 C with hw = 27 W/(K kg), but there it uses a constant Cp of 34 J/(mol K)
 *  and dH(R4) = -49.5 kJ/mol; the engine's rigorous dH(R4) at 520 K is -58.7 kJ/mol, so the same hot spot needs about twice the heat-transfer capacity. */
export const TUBE_UAW = 52;
export const TUBE_TC = 523.15;
const CATALYST = 'cu_zn_meoh';

export const tubular: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  if (!has(u, 'W')) return failResult('SPEC_MISSING', { param: 'W' }, { unitId: u.id });
  const v: UnitInst = { ...u, catalystId: u.catalystId ?? CATALYST, params: { mode: 'cooled', Tc: TUBE_TC, UaW: TUBE_UAW, ...u.params } };
  const o = bedOptions(v, ctx.species, ctx.thermoDetail);
  if (!o.ok) return o;
  const r = simulateBed({ ...o.value, inlet: s, W: num(u, 'W') });
  if (!r.ok) return { ...r, unitId: u.id };
  const prof = bedProfile(r.value.info);
  let iMax = 0;
  prof.T.forEach((t, i) => { if (t > prof.T[iMax]!) iMax = i; });
  const info = { ...r.value.info, hot_W: prof.W[iMax] ?? 0, Tc: num(v, 'Tc'), UaW: num(v, 'UaW'), q_cool: Math.max(0, -r.value.duty) };
  return okResult({ outlets: { out: r.value.out }, duty: r.value.duty, info }, r.diag.map((d) => ({ ...d, unitId: u.id })));
};
