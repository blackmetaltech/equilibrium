// Mixer: sum of flows, adiabatic (T from the enthalpy balance via solveT), outlet P = min(P_in) of the streams that carry flow.
import { makeMixture, enthalpyFlow, solveT, totalFlow } from '../thermo';
import type { Diag, StreamState, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets } from './utilities';

export const mixer: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const mx = makeMixture(ctx.species);
  const n = ctx.species.map(() => 0);
  const streams: StreamState[] = [];
  let H = 0, first: StreamState | undefined;
  for (const k of Object.keys(inlets).sort()) {
    const s = inlets[k];
    if (!s) continue;
    first ??= s;
    if (!(totalFlow(s.n) > 0)) continue;
    streams.push(s);
    for (let i = 0; i < n.length; i++) n[i]! += s.n[i]!;
    H += enthalpyFlow(mx, s);
  }
  if (streams.length === 0) return okResult({ outlets: { out: { n, T: first ? first.T : 298.15, P: first ? first.P : 1e5 } } });
  let Pmin = Infinity, Pmax = 0;
  for (const s of streams) { if (s.P < Pmin) Pmin = s.P; if (s.P > Pmax) Pmax = s.P; }
  const diag: Diag[] = [];
  if (Pmax > Pmin * (1 + 1e-9)) diag.push({ code: 'MIXER_PRESSURE_MISMATCH', severity: 'info', unitId: u.id, data: { Pmax, Pmin } });
  const t = solveT(mx, H, n);
  if (!t.ok) return failResult(t.code, t.data, { unitId: u.id, diag });
  return okResult({ outlets: { out: { n, T: t.value, P: Pmin } }, info: { n_total: totalFlow(n) } }, diag);
};
