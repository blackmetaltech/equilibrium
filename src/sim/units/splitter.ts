// Splitter / purge: same composition, T and P on both outlets; `frac` of the inlet goes to the purge port (DESIGN 3.7).
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, num } from './utilities';

export const splitter: UnitOp = (inlets, u) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  const f = num(u, 'frac', 0);
  if (!(f >= 0 && f <= 1)) return failResult('SPLIT_RANGE', { frac: f }, { unitId: u.id });
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  return okResult({ outlets: {
    purge: { n: s.n.map((x) => x * f), T: s.T, P: s.P },
    out: { n: s.n.map((x) => x * (1 - f)), T: s.T, P: s.P },
  } });
};
