// Multi-bed converter (DESIGN 3.7): 2-4 beds in series, each an adiabatic (or isothermal / cooled) bed, with an inter-bed cooler
// (outlet T) and / or cold-gas quench between beds. Two bed models: 'pfr' (kinetic packed bed, per-bed catalyst mass) and 'eq'
// (equilibrium bed on the ideal catalyst's light-off window: the staircase of the contact process).
// Ports: in, quench (optional; the cold stream shared out between the gaps by the weights q1..q3, equal shares by default), out.
// Params: beds (2-4), bedModel ('pfr' if W1 is given, else 'eq'), mode (as the bed model), W1..W4 (kg catalyst, pfr),
//   Tcool1..Tcool3 (K, outlet of the cooler after bed j), q1..q3 (quench weights), reactions / law / catalystId, Tmin, Tmax, dP.
//   The cooler is applied after the quench mix; both are optional per gap (no cooler, no quench: the beds are in direct series).
// Info: beds, X (overall key conversion on the key fed), T_out, Tmax, Q, cool_duty, evals and per bed j: b<j>_Tin, b<j>_Tout,
//   b<j>_Xin, b<j>_Xout (cumulative on the key fed so far: the staircase), b<j>_Q, b<j>_Tmax, b<j>_eta, b<j>_dTad and, for pfr
//   beds, the profile b<j>_np, b<j>_p<i>_W/T/X/QK (<= 30 points each, X cumulative like the staircase; read with `bedProfile(info, 'b<j>_')`).
import type { Diag, SimResult, StreamState, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { enthalpyFlowAt, makeMixture, solveT, totalFlow } from '../thermo';
import { equilibriumStage, keyIndex, bookOf, windowOf } from './rx_equil';
import { bedOptions, simulateBed } from './rx_pfr';
import { reactionIdsOf, resolveReactions } from './rx_stoich';
import { guardInlets, has, num, str } from './utilities';

const NPROF = 30;

export const multibed: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const nb = num(u, 'beds', 0);
  if (!(Number.isInteger(nb) && nb >= 2 && nb <= 4)) return failResult('SPEC_RANGE', { beds: nb, min: 2, max: 4 }, { unitId: u.id });
  const kinetic = str(u, 'bedModel', has(u, 'W1') ? 'pfr' : 'eq') === 'pfr';
  const mx = makeMixture(ctx.species);
  const quench = inlets.quench && totalFlow(inlets.quench.n) > 0 ? inlets.quench : undefined;
  const H = (x: StreamState): number => enthalpyFlowAt(mx, x.n, x.T);
  const diag: Diag[] = [];
  const tag = (d: Diag): Diag => ({ ...d, unitId: u.id });

  // reactions of the key and the options of the bed model
  const rr = resolveReactions(u, ctx.species, reactionIdsOf(u));
  if (!rr.ok) return rr;
  const bedO = kinetic ? bedOptions(u, ctx.species, ctx.thermoDetail) : undefined;
  if (bedO !== undefined && !bedO.ok) return bedO;
  const bedOpts = bedO !== undefined && bedO.ok ? bedO.value : undefined;
  const eqMode = str(u, 'mode', 'adiabatic') === 'isothermal' ? 'isothermal' : 'adiabatic';
  if (kinetic) for (let j = 1; j <= nb; j++) if (!(num(u, 'W' + j, 0) >= 0) || !has(u, 'W' + j)) return failResult('SPEC_MISSING', { param: 'W' + j }, { unitId: u.id });

  const Hin = H(s) + (quench ? H(quench) : 0);
  const key = keyIndex(ctx.species, s.n, rr.value.ids[0]!, str(u, 'key') || undefined);
  let fed = key >= 0 ? s.n[key]! : 0;
  const gaps = nb - 1;
  const weights: number[] = [];
  for (let j = 1; j <= gaps; j++) { const w = has(u, 'q' + j) ? num(u, 'q' + j) : Number.NaN; weights.push(w); }
  // the quench is always shared out in full (no material is lost): without a positive weight the gaps share it equally
  if (!weights.some((w) => w > 0)) for (let j = 0; j < gaps; j++) weights[j] = 1;
  const wTot = weights.reduce((a, w) => a + (w > 0 ? w : 0), 0);

  const info: Record<string, number> = { beds: nb };
  let cur: StreamState = { n: s.n.slice(), T: s.T, P: s.P };
  let coolDuty = 0, evals = 0, Tmax = s.T;
  const Xof = (n: readonly number[]): number => (fed > 0 && key >= 0 ? 1 - n[key]! / fed : 0);
  for (let j = 1; j <= nb; j++) {
    if (j > 1) {
      const w = weights[j - 2]! > 0 && wTot > 0 ? weights[j - 2]! / wTot : 0;
      if (quench && w > 0) {
        const n = cur.n.map((v, i) => v + w * quench.n[i]!);
        const Hm = H(cur) + w * H(quench);
        const t = solveT(mx, Hm, n);
        if (!t.ok) return failResult(t.code, t.data, { unitId: u.id, diag });
        cur = { n, T: t.value, P: Math.min(cur.P, quench.P) };
        if (key >= 0) fed += w * quench.n[key]!;
        Tmax = Math.max(Tmax, cur.T);
      }
      if (has(u, 'Tcool' + (j - 1))) {
        const Tc = num(u, 'Tcool' + (j - 1));
        if (!(Tc > 0)) return failResult('SPEC_RANGE', { T: Tc }, { unitId: u.id });
        const cooled: StreamState = { n: cur.n, T: Tc, P: cur.P };
        coolDuty += totalFlow(cur.n) > 0 ? H(cooled) - H(cur) : 0;
        cur = cooled;
      }
    }
    const pre = 'b' + j + '_';
    info[pre + 'Tin'] = cur.T; info[pre + 'Xin'] = Xof(cur.n);
    let out: StreamState, duty: number, bi: Record<string, number>, dg: readonly Diag[];
    if (kinetic) {
      const r = simulateBed({ ...bedOpts!, inlet: cur, W: num(u, 'W' + j), nprof: NPROF });
      if (!r.ok) return { ...r, unitId: u.id, diag: [...diag, ...r.diag.map(tag)] } as SimResult<never>;
      out = r.value.out; duty = r.value.duty; bi = r.value.info; dg = r.diag;
      evals += r.value.evals;
      // the bed's own X is relative to its inlet key: shown cumulative on the key fed so far, as the staircase is
      const xin = info[pre + 'Xin']!;
      for (const k of Object.keys(bi)) if (/^(np|p\d+_)/.test(k)) info[pre + k] = /_X$/.test(k) ? 1 - (1 - xin) * (1 - bi[k]!) : bi[k]!;
    } else {
      const r = equilibriumStage(cur, { species: ctx.species, reactions: rr.value.ids, mode: eqMode, T: has(u, 'T') ? num(u, 'T') : undefined, dP: num(u, 'dP', 0), key: str(u, 'key') || undefined, ...windowOf(u), detail: ctx.thermoDetail, book: bookOf(u) });
      if (!r.ok) return { ...r, unitId: u.id, diag: [...diag, ...r.diag.map(tag)] } as SimResult<never>;
      out = r.value.out; duty = r.value.duty; bi = r.value.info; dg = r.diag;
    }
    for (const d of dg) diag.push({ ...tag(d), data: { ...d.data, bed: j } });
    info[pre + 'Tout'] = out.T; info[pre + 'Xout'] = Xof(out.n); info[pre + 'Q'] = duty;
    info[pre + 'Tmax'] = bi.Tmax ?? out.T; info[pre + 'eta'] = bi.eta ?? 1; info[pre + 'dTad'] = bi.dTad ?? 0;
    Tmax = Math.max(Tmax, bi.Tmax ?? out.T);
    cur = out;
  }
  const Hout = H(cur);
  const duty = totalFlow(cur.n) > 0 ? Hout - Hin : 0;
  Object.assign(info, { X: Xof(cur.n), T_out: cur.T, T_in: s.T, Tmax, Q: duty, cool_duty: coolDuty, evals });
  return okResult({ outlets: { out: cur }, duty, info }, diag);
};

