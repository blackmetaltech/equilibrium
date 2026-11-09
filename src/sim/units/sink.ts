// Product tank / vent / generic sink: terminal; accumulation and on/off-spec belong to the dynamics lane.
import type { UnitOp } from '../types';
import { okResult } from '../types';
import { guardInlets } from './utilities';

export const sink: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  const info: Record<string, number> = { n_total: 0, T: s ? s.T : 0, P: s ? s.P : 0 };
  ctx.species.forEach((id, i) => { const v = s ? s.n[i]! : 0; info['n_' + id] = v; info.n_total! += v; });
  return okResult({ outlets: {}, info });
};
