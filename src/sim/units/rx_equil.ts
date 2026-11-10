// Equilibrium reactor (DESIGN 3.4, 3.7): the extent solver of src/sim/chem/equilibrium.ts at a fixed T (isothermal) or from
// H_out = H_in (adiabatic), P from the inlet minus dP. An "ideal catalyst" is active only from its light-off window up:
// below it the stream passes unreacted (BELOW_LIGHTOFF, X = 0); the window is the param Tmin (K) or the catalyst's Tmin.
// Params: reactions (csv) or catalystId/law, mode ('isothermal' default | 'adiabatic'), T (K, isothermal; default inlet T),
//   dP (Pa), key (species; default the limiting reagent of reaction 1), Tmin / Tmax (K), book_K, book_T, book_dH, book_dS.
// Info: X, Xeq (= X), eta, K (reaction 1 at T_out), K2.., QK_in / QK_out (log10 Q/K of reaction 1 at T_out, inlet and outlet
//   composition), dTad (adiabatic-equilibrium rise from the inlet), dT, Tmax, T_in, T_out, Q, active, xi1.., iterations.
import { dmath } from '@core/numerics';
import { findCatalyst } from '../../data/catalysts';
import { reactionOf } from '../../data/reactions';
import { type BookData, lnKOfReaction } from '../chem/reactions';
import { type EqSpec, qOverK, solveEquilibrium } from '../chem/equilibrium';
import { limitingReagent } from '../chem/stoich';
import { enthalpyFlowAt, makeMixture, totalFlow } from '../thermo';
import type { Diag, SimResult, StreamState, ThermoDetail, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { beam, reactionIdsOf, resolveReactions } from './rx_stoich';
import { guardInlets, has, num, str } from './utilities';

const T_FROM_C = 273.15;
const TOL_LIGHT = 1e-6;

export interface StageSpec {
  species: readonly string[];
  /** Catalogue reaction ids. */
  reactions: readonly string[];
  mode: 'isothermal' | 'adiabatic';
  /** Isothermal outlet temperature, K (default: the inlet T). */
  T?: number;
  dP?: number;
  key?: string;
  /** Light-off: the catalyst is asleep for a reactor temperature below this, K. */
  Tmin?: number;
  /** Over-temperature limit, K (CATALYST_OVERTEMP warn when the stage exceeds it). */
  Tmax?: number;
  detail: ThermoDetail;
  book?: BookData;
}

export interface StageOut {
  out: StreamState;
  info: Record<string, number>;
  /** H_out - H_in, W. */
  duty: number;
  /** Extents of the reactions. */
  xi: number[];
  /** Index of the key species (-1 when none). */
  keyIdx: number;
}

/** Key species index of a stream: the named species, else the limiting reagent of the first reaction. */
export function keyIndex(species: readonly string[], n: readonly number[], firstReaction: string, key?: string): number {
  if (key !== undefined && key !== '') return species.indexOf(key);
  const amounts: Record<string, number> = {};
  species.forEach((id, i) => { amounts[id] = n[i]!; });
  return species.indexOf(limitingReagent(amounts, reactionOf(firstReaction).nu).species);
}

/** One equilibrium stage on a stream. Used by the equilibrium reactor and the multi-bed converter. */
export function equilibriumStage(s: StreamState, spec: StageSpec): SimResult<StageOut> {
  const mx = makeMixture(spec.species);
  const P = s.P - (spec.dP ?? 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: spec.dP ?? 0 });
  const diag: Diag[] = [];
  const flows = totalFlow(s.n) > 0;
  const Tr = spec.mode === 'isothermal' ? spec.T ?? s.T : s.T;
  const Hin = enthalpyFlowAt(mx, s.n, s.T);
  const base: Omit<EqSpec, 'T' | 'mode'> = { species: spec.species, n0: s.n, P, reactions: spec.reactions, detail: spec.detail, book: spec.book };
  const key = keyIndex(spec.species, s.n, spec.reactions[0]!, spec.key);
  const active = !(spec.Tmin !== undefined && Tr < spec.Tmin - TOL_LIGHT);
  let n = s.n.slice(), T = Tr;
  let xi: number[] = spec.reactions.map(() => 0);
  const info: Record<string, number> = { T_in: s.T, active: active ? 1 : 0 };
  if (flows && !active) diag.push({ code: 'BELOW_LIGHTOFF', severity: 'info', data: { T: Tr, Tmin: spec.Tmin! } });
  if (flows && active) {
    const r = solveEquilibrium({ ...base, T: Tr, mode: spec.mode });
    if (!r.ok) return r;
    n = r.value.n; T = r.value.T; xi = r.value.xi;
    diag.push(...r.diag);
    info.iterations = r.value.iterations;
  }
  const duty = flows ? enthalpyFlowAt(mx, n, T) - Hin : 0;
  const k0 = key >= 0 ? s.n[key]! : 0;
  const X = k0 > 0 ? (k0 - n[key]!) / k0 : 0;
  Object.assign(info, { X, Xeq: X, eta: 1, T_out: T, dT: T - s.T, Tmax: Math.max(s.T, T), Q: duty });
  xi.forEach((x, j) => { info['xi' + (j + 1)] = x; });
  spec.reactions.forEach((id, j) => {
    info[j === 0 ? 'K' : 'K' + (j + 1)] = dmath.exp(lnKOfReaction(reactionOf(id), T, spec.detail, spec.book));
  });
  // balance-beam numbers at the stage temperature
  const q = (nn: readonly number[]): number => {
    const r = qOverK({ ...base, n0: nn, T, P });
    return r.ok ? beam(r.value[0]!) : 0;
  };
  info.QK_in = q(s.n); info.QK_out = q(n);
  info.dTad = spec.mode === 'adiabatic' ? T - s.T : adiabaticRise(s, base, active && flows);
  if (spec.Tmax !== undefined && info.Tmax! > spec.Tmax) diag.push({ code: 'CATALYST_OVERTEMP', severity: 'warn', data: { Tmax: info.Tmax!, limit: spec.Tmax } });
  return okResult({ out: { n, T, P }, info, duty, xi, keyIdx: key }, diag);
}

/** Adiabatic-equilibrium temperature rise from the inlet state (0 when the stage is asleep or the solve fails). */
function adiabaticRise(s: StreamState, base: Omit<EqSpec, 'T' | 'mode'>, live: boolean): number {
  if (!live) return 0;
  const r = solveEquilibrium({ ...base, T: s.T, mode: 'adiabatic' });
  return r.ok ? r.value.T - s.T : 0;
}

/** Book constants of a unit from its params (one set for every reaction), or undefined. */
export function bookOf(u: UnitInst): BookData | undefined {
  if (!['book_K', 'book_T', 'book_dH', 'book_dS'].some((k) => has(u, k))) return undefined;
  const b: BookData = {};
  if (has(u, 'book_K')) b.K = num(u, 'book_K');
  if (has(u, 'book_T')) b.T = num(u, 'book_T');
  if (has(u, 'book_dH')) b.dH = num(u, 'book_dH');
  if (has(u, 'book_dS')) b.dS = num(u, 'book_dS');
  return b;
}

/** Light-off and over-temperature windows of a unit, K: params first, then the catalyst entry (deg C there). */
export function windowOf(u: UnitInst): { Tmin?: number; Tmax?: number } {
  const cat = u.catalystId !== undefined ? findCatalyst(u.catalystId) : undefined;
  const w: { Tmin?: number; Tmax?: number } = {};
  if (has(u, 'Tmin')) w.Tmin = num(u, 'Tmin'); else if (cat !== undefined) w.Tmin = cat.Tmin + T_FROM_C;
  if (has(u, 'Tmax')) w.Tmax = num(u, 'Tmax'); else if (cat !== undefined) w.Tmax = cat.Tmax + T_FROM_C;
  return w;
}

export const eqReactor: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const rr = resolveReactions(u, ctx.species, reactionIdsOf(u));
  if (!rr.ok) return rr;
  const mode = str(u, 'mode', 'isothermal');
  if (mode !== 'isothermal' && mode !== 'adiabatic') return failResult('SPEC_RANGE', { mode: 0 }, { unitId: u.id });
  if (has(u, 'T') && !(num(u, 'T') > 0)) return failResult('SPEC_RANGE', { T: num(u, 'T') }, { unitId: u.id });
  const stage = equilibriumStage(s, {
    species: ctx.species, reactions: rr.value.ids, mode, T: has(u, 'T') ? num(u, 'T') : undefined, dP: num(u, 'dP', 0),
    key: str(u, 'key') || undefined, ...windowOf(u), detail: ctx.thermoDetail, book: bookOf(u),
  });
  if (!stage.ok) return { ...stage, unitId: u.id };
  const diag = stage.diag.map((d) => ({ ...d, unitId: u.id }));
  return okResult({ outlets: { out: stage.value.out }, duty: stage.value.duty, info: stage.value.info }, diag);
};
