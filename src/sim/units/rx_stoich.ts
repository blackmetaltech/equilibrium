// Stoichiometric reactor (DESIGN 3.7): key-reactant conversion X per reaction in sequence, xi = X n_key / |nu_key|, with the
// limiting-reagent check, then an outlet temperature (isothermal at a given T, or adiabatic from H_out = H_in).
// Also the burners (sulfur, fuel gas) and the gasifier: the same function with defaults per unit type.
// Params: reactions (csv of catalogue ids), X (default 1) and X1..X3 per reaction, key (species of reaction 1; absent = the
//   limiting reagent of each reaction), mode ('adiabatic' | 'isothermal'), T (K, isothermal), dP (Pa), onLimit ('fail' | 'clamp').
// Info: X, xi1.., T_in, T_out, dT, Q, dH1 (J/mol at T_out), limIdx, K-free: no thermodynamic limit is applied here.
// The reactor core takes an EnergyModel so the textbook oracles (Felder polynomials) run the same code with their own data.
import { enthalpyFlowAt, makeMixture, solveT as solveTMix, totalFlow, cpFlow } from '../thermo';
import { findReaction } from '../../data/reactions';
import { findCatalyst } from '../../data/catalysts';
import { findLaw } from '../../data/kinetics';
import { rxnDH } from '../chem/reactions';
import { limitingReagent, type Nu } from '../chem/stoich';
import type { Diag, SimResult, StreamState, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, has, num, str } from './utilities';

/** Enthalpy data a reactor needs; the engine's own is `engineModel`, tests inject their own (J, W, K). */
export interface EnergyModel {
  /** Enthalpy flow of amounts n at T, heat-of-formation basis. */
  H(n: readonly number[], T: number): number;
  /** Heat-capacity flow, W/K. */
  cp(n: readonly number[], T: number): number;
  /** Heat of reaction per unit extent at T, J. */
  dH(nu: Nu, T: number): number;
  /** Temperature at which the enthalpy flow of n equals Htarget. */
  solveT(Htarget: number, n: readonly number[]): SimResult<number>;
}

/** The catalogue thermo (rigorous Shomate enthalpies) as an EnergyModel for the level's species list. */
export function engineModel(species: readonly string[]): EnergyModel {
  const mx = makeMixture(species);
  return {
    H: (n, T) => enthalpyFlowAt(mx, n, T),
    cp: (n, T) => cpFlow(mx, n, T),
    dH: (nu, T) => rxnDH(nu, T, 'rigorous'),
    solveT: (H, n) => solveTMix(mx, H, n),
  };
}

// ------------------------------------------------------------------------------------------------ parameter helpers
/** Comma-separated ids to a list. */
export const csv = (s: string): string[] => s.split(',').map((x) => x.trim()).filter((x) => x !== '');

/** Burner fuel reactions tried in order when a burner has no `reactions` param (sulfur, methane, propane). */
export const BURNER_REACTIONS: readonly string[] = ['R10', 'R13', 'R16'];
const DEFAULT_BY_TYPE: Readonly<Record<string, string>> = { gasifier: 'R14', co_burner: 'R15' };

/** Reaction ids of a reactor unit: params, else the rate law / catalyst, else the type default; burner = all fuel reactions. */
export function reactionIdsOf(u: UnitInst): string[] {
  const r = str(u, 'reactions');
  if (r !== '') return csv(r);
  const law = findLaw(str(u, 'law'));
  if (law !== undefined) return [...law.reactions];
  const cat = u.catalystId !== undefined ? findCatalyst(u.catalystId) : undefined;
  const lid = cat?.lawIds[0];
  const l2 = lid !== undefined ? findLaw(lid) : undefined;
  if (l2 !== undefined) return [...l2.reactions];
  if (u.type === 'burner') return [...BURNER_REACTIONS];
  const d = DEFAULT_BY_TYPE[u.type];
  return d !== undefined ? [d] : [];
}

/** Reactant species ids (nu < 0) of the unit's reactions, for the flowsheet `consumes` metadata. */
export function reactantsOf(u: UnitInst): Set<string> {
  const out = new Set<string>();
  for (const id of reactionIdsOf(u)) {
    const rx = findReaction(id);
    if (rx === undefined) continue;
    for (const k of Object.keys(rx.nu)) if (rx.nu[k]! < 0) out.add(k);
  }
  return out;
}

export interface ResolvedReactions { ids: string[]; nus: Nu[] }
/** Catalogue reactions with every species present in the level's list, or the failure to return. */
export function resolveReactions(u: UnitInst, species: readonly string[], ids: readonly string[]): SimResult<ResolvedReactions> {
  if (ids.length === 0) return failResult('SPEC_MISSING', { param: 'reactions' }, { unitId: u.id });
  const nus: Nu[] = [];
  for (const id of ids) {
    const rx = findReaction(id);
    if (rx === undefined) return failResult('UNKNOWN_REACTION', {}, { unitId: u.id });
    for (const sp of Object.keys(rx.nu)) if (!species.includes(sp)) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: sp });
    nus.push(rx.nu);
  }
  return okResult({ ids: [...ids], nus });
}

/** Clamp to [-30, 30] and map NaN to 0: log10(Q/K) as shown on the balance beam (infinite when a species is absent). */
export const beam = (v: number): number => (Number.isNaN(v) ? 0 : v > 30 ? 30 : v < -30 ? -30 : v);

// ------------------------------------------------------------------------------------------------ reactor core
export interface StoichSpec {
  species: readonly string[];
  n0: readonly number[];
  Tin: number;
  nus: readonly Nu[];
  /** Key species per reaction (absent or undefined: the limiting reagent on the current amounts). */
  keys?: readonly (string | undefined)[];
  /** Conversion of the key per reaction. */
  X: readonly number[];
  mode: 'adiabatic' | 'isothermal';
  /** Outlet temperature for isothermal mode, K (default: the inlet T). */
  Tout?: number;
  /** 'fail': CONVERSION_EXCEEDS_LIMITING stops the solve; 'clamp': react what the limiting reagent allows and warn. */
  onLimit: 'fail' | 'clamp';
}

export interface StoichOut {
  n: number[];
  xi: number[];
  T: number;
  /** H_out - H_in, W (heat added). */
  duty: number;
  Hin: number;
  Hout: number;
  /** Overall conversion of the key of the first reaction. */
  X: number;
  /** Index of that key species (-1 when absent). */
  keyIdx: number;
  /** Per reaction: index of the true limiting reagent on the amounts the reaction saw (-1 when none). */
  limiting: number[];
}

/** Stoichiometric extents in sequence, then the energy balance. Pure; never throws for domain errors. */
export function reactStoich(spec: StoichSpec, model: EnergyModel): SimResult<StoichOut> {
  const S = spec.species.length;
  const n = spec.n0.slice();
  const xi: number[] = [];
  const limiting: number[] = [];
  const diag: Diag[] = [];
  let keyIdx = -1, key0 = 0;
  for (let j = 0; j < spec.nus.length; j++) {
    const nu = spec.nus[j]!;
    const amounts: Record<string, number> = {};
    spec.species.forEach((id, i) => { amounts[id] = n[i]!; });
    const lim = limitingReagent(amounts, nu);
    const limI = spec.species.indexOf(lim.species);
    limiting.push(lim.xiMax > 0 ? limI : -1);
    const kid = spec.keys?.[j];
    const k = kid !== undefined && kid !== '' ? spec.species.indexOf(kid) : limI;
    if (j === 0) { keyIdx = k; key0 = k >= 0 ? n[k]! : 0; }
    if (k < 0 || !(n[k]! > 0) || !(lim.xiMax > 0)) {
      xi.push(0);
      diag.push({ code: 'NO_REACTANT', severity: 'info', data: { reaction: j, species: k >= 0 ? spec.species[k]! : '' } });
      continue;
    }
    const X = spec.X[j] ?? 1;
    if (!(X >= 0)) return failResult('CONVERSION_RANGE', { asked: X, reaction: j }, { diag });
    const nuK = nu[spec.species[k]!] ?? 0;
    if (!(nuK < 0)) return failResult('NOT_A_REACTANT', { reaction: j }, { species: spec.species[k], diag });
    const asked = (X * n[k]!) / -nuK;
    let x = asked;
    if (asked > lim.xiMax * (1 + 1e-12)) {
      const maxX = (lim.xiMax * -nuK) / n[k]!;
      const data = { asked: X, max: maxX, limiting: lim.species, limitingIndex: limI, reaction: j };
      if (spec.onLimit === 'fail') return failResult('CONVERSION_EXCEEDS_LIMITING', data, { species: lim.species, diag });
      diag.push({ code: 'CONVERSION_EXCEEDS_LIMITING', severity: 'warn', species: lim.species, data });
      x = lim.xiMax;
    } else if (asked > lim.xiMax) x = lim.xiMax;
    xi.push(x);
    for (let i = 0; i < S; i++) {
      const v = nu[spec.species[i]!];
      if (v !== undefined) { n[i] = n[i]! + v * x; if (n[i]! < 0) n[i] = 0; }
    }
    if (k >= 0 && x === lim.xiMax && limI === k) n[k] = 0;
  }
  const Hin = model.H(spec.n0, spec.Tin);
  let T: number;
  if (!(totalFlow(n) > 0)) T = spec.mode === 'isothermal' ? spec.Tout ?? spec.Tin : spec.Tin;
  else if (spec.mode === 'isothermal') {
    T = spec.Tout ?? spec.Tin;
    if (!(T > 0)) return failResult('SPEC_RANGE', { T }, { diag });
  } else {
    const t = model.solveT(Hin, n);
    if (!t.ok) return failResult(t.code, t.data, { diag });
    T = t.value;
  }
  const Hout = model.H(n, T);
  const X = keyIdx >= 0 && key0 > 0 ? (key0 - n[keyIdx]!) / key0 : 0;
  return okResult({ n, xi, T, duty: Hout - Hin, Hin, Hout, X, keyIdx, limiting }, diag);
}

// ------------------------------------------------------------------------------------------------ unit
/** Partial-oxidation step (fuel -> CO) of each fuel burned in two steps; the second step is `CO_BURN` for all of them. */
const PARTIAL_OX: Readonly<Record<string, string>> = { R13: 'R19', R16: 'R20' };
const CO_BURN = 'R15';

/** Burner with no `reactions`: the fuel reactions whose fuel is in the feed, in the catalogue order. With CO in the species list
 *  the hydrocarbons burn in sequence (fuel + O2 -> CO + H2O for every fuel, then CO + 1/2 O2 -> CO2 with the O2 left), so a rich burn
 *  leaves CO and a very rich one leaves fuel; without CO the burn is the single complete step. */
function burnerReactions(u: UnitInst, s: StreamState, species: readonly string[]): string[] {
  const out: string[] = [];
  let partial = false;
  const twoStep = species.includes('CO');
  for (const id of BURNER_REACTIONS) {
    const rx = findReaction(id);
    if (rx === undefined) continue;
    const fuel = Object.keys(rx.nu).find((k) => rx.nu[k]! < 0 && k !== 'O2');
    const i = fuel === undefined ? -1 : species.indexOf(fuel);
    if (i < 0 || !(s.n[i]! > 0)) continue;
    const p = PARTIAL_OX[id];
    if (twoStep && p !== undefined) { out.push(p); partial = true; } else out.push(id);
  }
  if (partial) out.push(CO_BURN);
  void u;
  return out;
}

export const stoichReactor: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const Pout = s.P - num(u, 'dP', 0);
  if (!(Pout > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  const burner = u.type === 'burner' && str(u, 'reactions') === '';
  const ids = burner ? burnerReactions(u, s, ctx.species) : reactionIdsOf(u);
  const model = engineModel(ctx.species);
  if (burner && ids.length === 0) {
    const Q = 0;
    return okResult({ outlets: { out: { n: s.n.slice(), T: s.T, P: Pout } }, duty: Q, info: { X: 0, T_in: s.T, T_out: s.T, dT: 0, Q } }, [{ code: 'NO_REACTANT', severity: 'info', unitId: u.id, data: { reaction: 0 } }]);
  }
  const rr = resolveReactions(u, ctx.species, ids);
  if (!rr.ok) return rr;
  const isoMode = str(u, 'mode', has(u, 'T') ? 'isothermal' : 'adiabatic');
  if (isoMode !== 'adiabatic' && isoMode !== 'isothermal') return failResult('SPEC_RANGE', { mode: 0 }, { unitId: u.id });
  const dflt = u.type === 'burner' || u.type === 'gasifier' || u.type === 'co_burner';
  const onLimit = str(u, 'onLimit', dflt ? 'clamp' : 'fail') === 'clamp' ? 'clamp' : 'fail';
  const keyP = str(u, 'key');
  // burners and the gasifier key on the fuel (first reactant of the reaction), the plain reactor on the limiting reagent
  const keys = rr.value.nus.map((nu, j) => {
    if (j === 0 && keyP !== '') return keyP;
    if (!dflt) return undefined;
    return Object.keys(nu).find((k) => nu[k]! < 0 && k !== 'O2') ?? Object.keys(nu).find((k) => nu[k]! < 0);
  });
  const X = rr.value.nus.map((_, j) => num(u, 'X' + (j + 1), num(u, 'X', 1)));
  const spec: StoichSpec = { species: ctx.species, n0: s.n, Tin: s.T, nus: rr.value.nus, keys, X, mode: isoMode, Tout: has(u, 'T') ? num(u, 'T') : undefined, onLimit };
  const r = reactStoich(spec, model);
  if (!r.ok) return { ...r, unitId: u.id };
  const v = r.value;
  const info: Record<string, number> = { X: v.X, T_in: s.T, T_out: v.T, dT: v.T - s.T, Q: v.duty, limIdx: v.limiting[0] ?? -1, keyIdx: v.keyIdx };
  v.xi.forEach((x, j) => { info['xi' + (j + 1)] = x; });
  info.dH1 = model.dH(rr.value.nus[0]!, v.T);
  const diag = r.diag.map((d) => ({ ...d, unitId: u.id }));
  return okResult({ outlets: { out: { n: v.n, T: v.T, P: Pout } }, duty: v.duty, info }, diag);
};

