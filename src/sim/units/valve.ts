// Valve: isenthalpic throttle to outlet pressure `P`. Ideal gas (and ideal-mixing liquids): h does not depend on P, so T is
// unchanged (Joule-Thomson ignored, DESIGN 3.7).
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, num } from './utilities';

export const valve: UnitOp = (inlets, u) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const P = num(u, 'P', s.P);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pout: P }, { unitId: u.id });
  if (P > s.P) return failResult('VALVE_P_RISE', { Pin: s.P, Pout: P }, { unitId: u.id });
  return okResult({ outlets: { out: { n: s.n.slice(), T: s.T, P } }, info: { dP: s.P - P } });
};
