// Flash drum / condenser (DESIGN 3.7): isothermal T, P (or duty), Rachford-Rice with bubble/dew pre-check (thermo/vle.ts).
// Component = gas id; the liquid goes to the liquid-twin slot (NH3(l), H2O(l)...) when the level lists one, else stays in the gas slot.
// Duty = H_out - H_in with liquid enthalpies for the liquid fraction (Watson liquids or catalogue liquids).
import { brent } from '@core/numerics';
import { SPECIES, SPECIES_IDS } from '../../data/species';
import { enthalpyFlow, makeMixture, totalFlow } from '../thermo';
import { THERMO, hOf } from '../thermo/species';
import { componentOf, flashSpecies } from '../thermo/vle';
import type { Diag, SimCtx, StreamState, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, has, num } from './utilities';

export interface Slots { comps: string[]; gasIdx: number[]; liqIdx: number[] }
/** Group the level's species into components with their gas and liquid-twin slots. */
export function slotsOf(species: readonly string[]): Slots {
  const comps: string[] = [], gasIdx: number[] = [], liqIdx: number[] = [];
  species.forEach((id, i) => {
    const c = componentOf(id);
    let k = comps.indexOf(c);
    if (k < 0) { k = comps.length; comps.push(c); gasIdx.push(-1); liqIdx.push(-1); }
    if (id === c) gasIdx[k] = i; else liqIdx[k] = i;
  });
  for (let k = 0; k < comps.length; k++) if (gasIdx[k]! < 0) { gasIdx[k] = liqIdx[k]!; liqIdx[k] = -1; }
  return { comps, gasIdx, liqIdx };
}
/** Component moles from the stream (gas and liquid slots summed). */
export const compMoles = (sl: Slots, n: readonly number[]): number[] => sl.comps.map((_, k) => n[sl.gasIdx[k]!]! + (sl.liqIdx[k]! >= 0 ? n[sl.liqIdx[k]!]! : 0));

const liqId = (c: string): string => {
  if (SPECIES[c]?.phase !== 'g') return c;
  for (const id of SPECIES_IDS) if (SPECIES[id]!.liquidOf === c && THERMO[id]) return id;
  return c;
};
/** Molar enthalpy of the component as gas / as liquid (dissolved gases without a liquid twin use the gas value), J/mol. */
export const hGas = (c: string, T: number): number => hOf(THERMO[c]!, T);
export const hLiq = (c: string, T: number): number => hOf(THERMO[liqId(c)]!, T);

export interface FlashEval { nV: number[]; nL: number[]; Hout: number; code: string; beta: number; extrap: string[] }
export function flashAt(sl: Slots, nc: readonly number[], T: number, P: number): FlashEval {
  const f = flashSpecies(sl.comps, nc, T, P);
  let H = 0;
  for (let k = 0; k < sl.comps.length; k++) {
    if (f.nV[k]! > 0) H += f.nV[k]! * hGas(sl.comps[k]!, T);
    if (f.nL[k]! > 0) H += f.nL[k]! * hLiq(sl.comps[k]!, T);
  }
  return { nV: f.nV, nL: f.nL, Hout: H, code: f.code, beta: f.beta, extrap: f.extrap };
}

export const flash: UnitOp = (inlets, u: UnitInst, ctx: SimCtx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const P = has(u, 'P') ? num(u, 'P') : s.P - num(u, 'dP', 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  const mx = makeMixture(ctx.species), sl = slotsOf(ctx.species);
  const nc = compMoles(sl, s.n);
  const Hin = enthalpyFlow(mx, s);
  let T = has(u, 'T') ? num(u, 'T') : s.T;
  if (!has(u, 'T') && has(u, 'duty') && totalFlow(s.n) > 0) {
    const q = num(u, 'duty');
    const fT = (t: number) => flashAt(sl, nc, t, P).Hout - Hin - q;
    const lo = 150, hi = 900;
    if (!(fT(lo) * fT(hi) < 0)) return failResult('DUTY_UNREACHABLE', { duty: q, Tlo: lo, Thi: hi }, { unitId: u.id });
    T = brent(fT, lo, hi, { tol: 1e-10 }).x;
  }
  if (!(T > 0)) return failResult('SPEC_RANGE', { T }, { unitId: u.id });
  const nS = ctx.species.length;
  const vap = new Array<number>(nS).fill(0), liq = new Array<number>(nS).fill(0);
  if (!(totalFlow(s.n) > 0)) {
    return okResult({ outlets: { vap: { n: vap, T, P }, liq: { n: liq, T, P } }, duty: 0, info: { beta: 0, vap_mol_s: 0, liq_mol_s: 0, T, P, Q: 0 } });
  }
  const ev = flashAt(sl, nc, T, P);
  for (let k = 0; k < sl.comps.length; k++) {
    vap[sl.gasIdx[k]!]! += ev.nV[k]!;
    liq[sl.liqIdx[k]! >= 0 ? sl.liqIdx[k]! : sl.gasIdx[k]!]! += ev.nL[k]!;
  }
  const diag: Diag[] = [];
  if (ev.code === 'ALL_VAPOUR' || ev.code === 'ALL_LIQUID') diag.push({ code: ev.code, severity: 'info', unitId: u.id, data: { T, P } });
  for (const id of ev.extrap) diag.push({ code: 'PROPERTY_EXTRAPOLATED', severity: 'info', unitId: u.id, species: id, data: { T } });
  const Q = ev.Hout - Hin;
  const vs: StreamState = { n: vap, T, P }, ls: StreamState = { n: liq, T, P };
  return okResult({ outlets: { vap: vs, liq: ls }, duty: Q, info: { beta: ev.beta, vap_mol_s: totalFlow(vap), liq_mol_s: totalFlow(liq), T, P, Q } }, diag);
};
