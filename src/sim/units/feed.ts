// Feed: source unit (DESIGN 3.7). Params: flow (mol/s total) with y_<species> mole fractions (normalised), or explicit
// n_<species> (mol/s); T (K), P (Pa). Price lives in the region pack, not here.
import type { UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { has, num } from './utilities';

export const feed: UnitOp = (_inlets, u, ctx) => {
  const sp = ctx.species;
  const T = num(u, 'T', 298.15), P = num(u, 'P', 1e5);
  const bad = (): ReturnType<UnitOp> => failResult('FEED_SPEC', { T, P, flow: num(u, 'flow', 0) }, { unitId: u.id });
  if (!(T > 0) || !(P > 0)) return bad();
  const n: number[] = sp.map(() => 0);
  if (sp.some((s) => has(u, 'n_' + s))) {
    for (let i = 0; i < sp.length; i++) { const v = num(u, 'n_' + sp[i]!, 0); if (!(v >= 0)) return bad(); n[i] = v; }
  } else {
    const flow = num(u, 'flow', 0);
    if (!(flow >= 0)) return bad();
    let sy = 0;
    const y = sp.map((s) => num(u, 'y_' + s, 0));
    for (const v of y) { if (!(v >= 0)) return bad(); sy += v; }
    if (flow > 0 && !(sy > 0)) return bad();
    if (flow > 0) for (let i = 0; i < sp.length; i++) n[i] = (flow * y[i]!) / sy;
  }
  return okResult({ outlets: { out: { n, T, P } } });
};
