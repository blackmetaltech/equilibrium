// Stoichiometry (DESIGN 3.4, oracles of lane chem/stoich): atom and stoichiometric matrices, rank, exact atom balance,
// extent <-> moles, limiting reagent and the true limiting reagent when a requested conversion cannot be met, conversion,
// yield, selectivity, combustion air. Reactions are sparse maps {speciesId: nu} (products +, reactants -) or dense rows.
import { solve } from '@core/numerics';
import { findSpecies } from '../../data/species';
import { type SimResult, failResult, okResult } from '../types';
import { type Elements, parseFormula } from './basics';

export type Nu = Readonly<Record<string, number>>;

/** Element vector of a catalogue species or, when the id is not in the catalogue, of the formula it spells. */
export function elementsOf(id: string): Elements { return findSpecies(id)?.elements ?? parseFormula(id); }

/** Atom matrix A[e][i]: atoms of element e in species ids[i]; `elements` lists the rows (sorted). */
export function atomMatrixOf(ids: readonly string[]): { elements: string[]; A: number[][] } {
  const set = new Set<string>();
  const els = ids.map(elementsOf);
  for (const el of els) for (const e of Object.keys(el)) set.add(e);
  const elements = [...set].sort();
  return { elements, A: elements.map((e) => els.map((el) => el[e] ?? 0)) };
}

/** Stoichiometric matrix: one row per reaction, one column per species id. */
export function stoichMatrix(nus: readonly Nu[], ids: readonly string[]): number[][] {
  return nus.map((nu) => ids.map((id) => nu[id] ?? 0));
}

/** Rank by Gaussian elimination with full pivoting; the tolerance is relative to the largest entry. */
export function rank(M: readonly (readonly number[])[]): number {
  const m = M.length;
  if (m === 0) return 0;
  const n = M[0]!.length;
  const A = M.map((r) => [...r]);
  let big = 0;
  for (const r of A) for (const v of r) if (Math.abs(v) > big) big = Math.abs(v);
  if (big === 0) return 0;
  const tol = big * Math.max(m, n) * 1e-12;
  let rk = 0;
  const usedRow = new Array<boolean>(m).fill(false);
  const usedCol = new Array<boolean>(n).fill(false);
  for (let step = 0; step < Math.min(m, n); step++) {
    let pr = -1, pc = -1, pv = tol;
    for (let i = 0; i < m; i++) {
      if (usedRow[i]) continue;
      for (let j = 0; j < n; j++) {
        if (usedCol[j]) continue;
        if (Math.abs(A[i]![j]!) > pv) { pv = Math.abs(A[i]![j]!); pr = i; pc = j; }
      }
    }
    if (pr < 0) break;
    usedRow[pr] = true; usedCol[pc] = true; rk++;
    for (let i = 0; i < m; i++) {
      if (usedRow[i]) continue;
      const f = A[i]![pc]! / A[pr]![pc]!;
      if (f !== 0) for (let j = 0; j < n; j++) A[i]![j]! -= f * A[pr]![j]!;
    }
  }
  return rk;
}

/** Exact atom balance of a reaction: residual per element is sum nu x atoms (a plain sum, no tolerance). */
export function atomBalance(nu: Nu): { ok: boolean; residual: Record<string, number> } {
  const residual: Record<string, number> = {};
  for (const id of Object.keys(nu)) {
    const el = elementsOf(id);
    for (const e of Object.keys(el)) residual[e] = (residual[e] ?? 0) + nu[id]! * el[e]!;
  }
  let ok = true;
  for (const e of Object.keys(residual)) { residual[e] = residual[e]! + 0; if (residual[e] !== 0) ok = false; }
  return { ok, residual };
}

/** Element totals sum n_i x atoms_i of an amount vector over species ids. */
export function elementTotals(ids: readonly string[], n: readonly number[]): Record<string, number> {
  const t: Record<string, number> = {};
  ids.forEach((id, i) => {
    const el = elementsOf(id);
    for (const e of Object.keys(el)) t[e] = (t[e] ?? 0) + n[i]! * el[e]!;
  });
  for (const e of Object.keys(t)) t[e] = t[e]! + 0;
  return t;
}

/** Rank of a reaction set over the union of its species, and which reactions are combinations of the earlier ones. */
export function independentReactions(nus: readonly Nu[]): { rank: number; independent: boolean; dependent: number[] } {
  const ids = [...new Set(nus.flatMap((nu) => Object.keys(nu)))];
  const rows = stoichMatrix(nus, ids);
  const dependent: number[] = [];
  let rk = 0;
  const kept: number[][] = [];
  rows.forEach((row, i) => {
    const r = rank([...kept, row]);
    if (r > rk) { kept.push(row); rk = r; } else dependent.push(i);
  });
  return { rank: rk, independent: dependent.length === 0, dependent };
}
/** Alias used by reactor setup: rank of the reactor's reaction set. */
export const reactionSetRank = independentReactions;

/** Parse `N2+3H2->2NH3`, `SO2 + 1/2 O2 <=> SO3` (arrows `->`, `=>`, `<=>`, `=`) into a sparse nu map. */
export function parseEquation(eq: string): Record<string, number> {
  const m = /^(.*?)(?:<=>|->|=>|=)(.*)$/.exec(eq);
  if (m === null) return {};
  const nu: Record<string, number> = {};
  const side = (s: string, sign: number) => {
    for (const term of s.split('+')) {
      const t = term.trim();
      if (t === '') continue;
      const c = /^(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?\s*(.+)$/.exec(t)!;
      let k = 1;
      if (c[1] !== undefined) { const f = c[1].split('/'); k = f.length === 2 ? Number(f[0]) / Number(f[1]) : Number(f[0]); }
      nu[c[2]!] = (nu[c[2]!] ?? 0) + sign * k;
    }
  };
  side(m[1]!, -1);
  side(m[2]!, 1);
  return nu;
}

// ------------------------------------------------------------------------------------------ extents
/** n_i = n0_i + sum_j nu_ji xi_j (nu rows are reactions). */
export function extentToMoles(n0: readonly number[], nu: readonly (readonly number[])[], xi: readonly number[]): number[] {
  return n0.map((v, i) => {
    let n = v;
    for (let j = 0; j < nu.length; j++) n += nu[j]![i]! * xi[j]!;
    return n;
  });
}
/** Extent of ONE reaction from the change of its first species with nonzero nu. */
export function extentFromMoles(n0: readonly number[], n: readonly number[], nu: readonly number[]): number {
  for (let i = 0; i < nu.length; i++) if (nu[i] !== 0) return (n[i]! - n0[i]!) / nu[i]!;
  return 0;
}

/**
 * Linear specifications on the outlet amounts: each is sum_i coef[i] n_i = rhs (coef keyed by species index). Solves the
 * extents of the reactions `nu` (rows). Throws SingularMatrixError (core) when the specifications do not fix the extents.
 */
export function extentsFromSpecs(
  nu: readonly (readonly number[])[], n0: readonly number[], specs: readonly { coef: Readonly<Record<number, number>>; rhs: number }[],
): number[] {
  const A = specs.map((s) => nu.map((row) => Object.keys(s.coef).reduce((a, k) => a + s.coef[Number(k)]! * row[Number(k)]!, 0)));
  const b = specs.map((s) => s.rhs - Object.keys(s.coef).reduce((a, k) => a + s.coef[Number(k)]! * n0[Number(k)]!, 0));
  return solve(A, b);
}

export interface Limiting { species: string; xiMax: number; ratios: Record<string, number> }
/** Limiting reagent of one reaction: the reactant with the smallest n/|nu|. Reactants missing from `n` count as 0. */
export function limitingReagent(n: Readonly<Record<string, number>>, nu: Nu): Limiting {
  let species = '', xiMax = Infinity;
  const ratios: Record<string, number> = {};
  for (const id of Object.keys(nu)) {
    if (nu[id]! >= 0) continue;
    const r = (n[id] ?? 0) / -nu[id]!;
    ratios[id] = r;
    if (r < xiMax) { xiMax = r; species = id; }
  }
  return { species, xiMax, ratios };
}

/**
 * Extent for a requested fractional conversion X of species `idx` (nu < 0) of ONE reaction. When the limiting reagent
 * cannot supply it: CONVERSION_EXCEEDS_LIMITING {asked, max, limiting, limitingIndex} where max is the largest conversion
 * of that species the feed allows. `ids` only names species in the failure data.
 */
export function conversionToExtent(n0: readonly number[], nu: readonly number[], idx: number, X: number, ids?: readonly string[]): SimResult<number> {
  const name = (i: number) => ids?.[i] ?? String(i);
  if (!(nu[idx]! < 0)) return failResult('NOT_A_REACTANT', { index: idx }, { species: ids?.[idx] });
  if (!(n0[idx]! > 0)) return failResult('NO_REACTANT', { index: idx }, { species: ids?.[idx] });
  if (!(X >= 0)) return failResult('CONVERSION_RANGE', { asked: X });
  let xiMax = Infinity, lim = idx;
  for (let i = 0; i < nu.length; i++) {
    if (!(nu[i]! < 0)) continue;
    const r = n0[i]! / -nu[i]!;
    if (r < xiMax) { xiMax = r; lim = i; }
  }
  const max = (xiMax * -nu[idx]!) / n0[idx]!;
  if (X > max * (1 + 1e-12)) {
    return failResult('CONVERSION_EXCEEDS_LIMITING', { asked: X, max, limiting: name(lim), limitingIndex: lim }, { species: ids?.[lim] });
  }
  return okResult((X * n0[idx]!) / -nu[idx]!);
}

/** Fractional conversion of a reactant. */
export function conversion(n0: number, n: number): number { return (n0 - n) / n0; }
/**
 * Selectivity of reactant r to product d: the fraction of the consumed reactant that ended as d, using the nu of d and r in
 * the reaction that makes d: (dn_d |nu_r| / nu_d) / consumed_r.
 */
export function selectivity(dn_d: number, nu_d: number, nu_r: number, consumed_r: number): number { return (dn_d * Math.abs(nu_r)) / nu_d / consumed_r; }
/** Yield of d on the reactant fed: (dn_d |nu_r| / nu_d) / n0_r (= selectivity x conversion). */
export function yieldOf(dn_d: number, nu_d: number, nu_r: number, n0_r: number): number { return (dn_d * Math.abs(nu_r)) / nu_d / n0_r; }

/** Mass of `to` from a mass of `from`, g, with molar masses from `M(id)` in g/mol. */
export function stoichMass(nu: Nu, from: string, to: string, mass_g: number, M: (id: string) => number): number {
  return (mass_g / M(from)) * Math.abs(nu[to]! / nu[from]!) * M(to);
}

// ------------------------------------------------------------------------------------------ combustion air
/** mol O2 per mol of a fuel burned completely to CO2, H2O and SO2: C + H/4 + S - O/2. */
export function o2Demand(el: Elements): number { return (el['C'] ?? 0) + (el['H'] ?? 0) / 4 + (el['S'] ?? 0) - (el['O'] ?? 0) / 2; }
/** Air for `theoO2` mol of theoretical O2 with an excess fraction; yO2 is the O2 mole fraction of the air. */
export function airFeed(theoO2: number, excess: number, yO2: number): { O2: number; N2: number; air: number } {
  const O2 = theoO2 * (1 + excess);
  const air = O2 / yO2;
  return { O2, N2: air * (1 - yO2), air };
}
