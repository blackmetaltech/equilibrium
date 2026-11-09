// Heater / cooler: outlet T (or duty) spec, optional utility with feasibility and consumption (DESIGN 3.7, 3.8).
// Q = H_out - H_in (heat-of-formation basis). Utility limits: cooling water >= 35 C, refrigerant >= -33 C, LP steam <= 140 C,
// fired heater <= 900 C. Consumption goes into `info` (fuel W via LHV / 0.85, steam kg/s, cooling-water duty, refrigeration electric W).
import { makeMixture, enthalpyFlow, solveT, totalFlow } from '../thermo';
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { CARNOT_FRACTION, LHV_CH4, MOTOR_EFF, T_REJECT, UTIL, copAt, guardInlets, has, num, steamLatent, str } from './utilities';

const TOL_T = 1e-6;

export const heater: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const Pout = s.P - num(u, 'dP', 0);
  if (!(Pout > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  if (!has(u, 'T') && !has(u, 'duty')) return failResult('SPEC_MISSING', {}, { unitId: u.id });
  const Hin = enthalpyFlow(mx, s);
  let Tout: number, Q: number;
  if (!(totalFlow(s.n) > 0)) { Tout = has(u, 'T') ? num(u, 'T') : s.T; Q = 0; }
  else if (has(u, 'T')) {
    Tout = num(u, 'T');
    if (!(Tout > 0)) return failResult('SPEC_RANGE', { T: Tout }, { unitId: u.id });
    Q = enthalpyFlow(mx, { n: s.n, T: Tout, P: s.P }) - Hin;
  } else {
    Q = num(u, 'duty');
    const t = solveT(mx, Hin + Q, s.n);
    if (!t.ok) return failResult(t.code, t.data, { unitId: u.id });
    Tout = t.value;
  }
  const info: Record<string, number> = { Q, T_out: Tout, dP: s.P - Pout };
  const name = str(u, 'utility');
  if (name !== '') {
    if (!Object.prototype.hasOwnProperty.call(UTIL, name)) return failResult('UTILITY_UNKNOWN', {}, { unitId: u.id });
    const ut = UTIL[name as keyof typeof UTIL];
    const data = { utility: name, T_out: Tout, T_limit: ut.T, Q };
    const wrongWay = ut.dir === 'heat' ? Q < 0 : Q > 0;
    const beyond = ut.dir === 'heat' ? Tout > ut.T + TOL_T : Tout < ut.T - TOL_T;
    if (wrongWay || beyond) return failResult('UTILITY_CANNOT_REACH', data, { unitId: u.id });
    const q = Math.abs(Q);
    if (name === 'fired') {
      info.fuel_W = q / ut.eff; info.fuel_CH4_mol_s = info.fuel_W / LHV_CH4; info.co2_mol_s = info.fuel_CH4_mol_s;
    } else if (name === 'steam') {
      info.steam_kg_s = q / steamLatent(); info.boiler_fuel_W = q / ut.eff;
    } else if (name === 'cw') {
      info.cw_duty_W = q;
    } else {
      // refrigerant evaporates at its stated level; heat is rejected to the cooling-water floor
      const cop = copAt(ut.T, T_REJECT);
      info.cop = cop; info.carnot_fraction = CARNOT_FRACTION; info.refrig_electric_W = cop > 0 ? q / cop : 0;
      info.refrig_motor_eff = MOTOR_EFF;
    }
    info.T_utility = ut.T;
  }
  return okResult({ outlets: { out: { n: s.n.slice(), T: Tout, P: Pout } }, duty: Q, info });
};
