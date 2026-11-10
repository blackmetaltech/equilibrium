// Shared helpers of the chapter-1 levels: reading flows off the solved plant, building the pre-placed units of a level's setup, grading a
// prediction. Rule code: SI inside (mol/s), kmol/h and kg/h only at the edges; no sentences (keys only).
import { SPECIES } from '../data/species';
import { designActions } from '../engine/actions/design';
import { plumbing, pricesOf } from '../engine/solved';
import type { PriceKey } from '../regions/data';
import type { EqState, FeedSpec } from '../state';
import type { StreamState, UnitInst } from '../sim/types';
import type { Measures } from './spec';

type S = Readonly<EqState>;

/** mol/s to kmol/h and back. */
export const toKmolH = (molS: number): number => (molS * 3600) / 1000;
export const fromKmolH = (k: number): number => (k * 1000) / 3600;
/** Molar mass in g/mol of a catalogue species (a missing species is a bug in the level, so 0 is not hidden: callers pass level species). */
export const molarMass = (id: string): number => SPECIES[id]!.M;
/** mol/s of species `id` to kg/h. */
export const toKgH = (molS: number, id: string): number => (molS * molarMass(id) * 3600) / 1000;
/** kg/h of species `id` to mol/s. */
export const fromKgH = (kg: number, id: string): number => (kg * 1000) / molarMass(id) / 3600;

export const none = (): Measures => ({ ok: false, v: {} });
export const solvedOk = (s: S): boolean => s.solved !== null && s.solved.ok;

export const unitsOfType = (s: S, type: string): UnitInst[] => s.flowsheet.units.filter((u) => u.type === type);

/** Stream entering `unitId` at `port` (solved), or undefined. */
export function inStream(s: S, unitId: string, port = 'in'): StreamState | undefined {
  if (!s.solved || !s.solved.ok) return undefined;
  const id = plumbing(s).inPipe(unitId, port);
  return id === undefined ? undefined : s.solved.streams[id];
}

/** mol/s of species `id` in a stream (0 when the stream or species is absent). */
export function flowOf(s: S, st: StreamState | undefined, id: string): number {
  const i = s.species.indexOf(id);
  return st !== undefined && i >= 0 ? st.n[i]! : 0;
}

/** mol/s of species `id` entering every unit of `type` (solved). */
export function intoType(s: S, type: string, id: string): number {
  let a = 0;
  for (const u of unitsOfType(s, type)) a += flowOf(s, inStream(s, u.id), id);
  return a;
}

/** mol/s of species `id` fed by every feed unit, from the feed specs (a design-time number: valid before commissioning). */
export function fedOf(s: S, id: string): number {
  const i = s.species.indexOf(id);
  if (i < 0) return 0;
  let a = 0;
  for (const u of unitsOfType(s, 'feed')) { const f = s.feeds[u.id]; if (f) a += f.flow * (f.x[i] ?? 0); }
  return a;
}

/** The species a feed unit mostly carries, '' if it carries nothing. */
export function mainSpecies(s: S, f: FeedSpec): string {
  let best = '', bx = 0;
  s.species.forEach((id, i) => { if ((f.x[i] ?? 0) > bx) { bx = f.x[i]!; best = id; } });
  return best;
}

/** Bench price total of the units in the plant under the level's price list. */
export function spentOf(s: S, prices: Record<string, { price: number }>): number {
  let a = 0;
  for (const u of s.flowsheet.units) a += prices[u.type]?.price ?? 0;
  return a;
}

/** Relative error of a value against a target (0 when both are 0). */
export const relErr = (x: number, target: number): number => (target === 0 ? Math.abs(x) : Math.abs(x - target) / Math.abs(target));

/** The prediction stored for this level (quantity key must match), with the optional named answer. */
export interface Prediction { quantity: string; value: number; named?: string }
export function predictionOf(s: S, key: string): Prediction | null {
  const p = s.prediction as Prediction | null;
  return p !== null && p.quantity === key ? p : null;
}

// ------------------------------------------------------------------------------------------------ setup helpers
/** Common start of a level: species, palette, limits, presets, an empty plot. Counts and presets are the level's. */
export function baseSetup(s: EqState, species: string[], units: Record<string, { max: number }>, presets: Record<string, Record<string, number | string>>): void {
  s.species = species.slice();
  s.palette = Object.keys(units);
  s.limits = Object.fromEntries(Object.entries(units).map(([k, v]) => [k, v.max]));
  s.presets = structuredClone(presets);
}

/** Place a unit with the real action (so ids, names and rules are the player's), return its id. Throws if the level script is wrong. */
export function put(s: EqState, type: string, x: number, y: number, params: Record<string, number | string> = {}): string {
  const r = designActions.placeUnit!(s, type, x, y, 0) as { ok: boolean; id?: string; message: string };
  if (!r.ok || r.id === undefined) throw new Error(`level setup: placeUnit ${type} ${r.message}`);
  const u = s.flowsheet.units.find((q) => q.id === r.id)!;
  for (const [k, v] of Object.entries(params)) u.params[k] = v;
  return r.id;
}

/** Place a feed with a composition by species id (the rest 0), a flow in kmol/h, T in K, P in Pa. */
export function putFeed(s: EqState, x: number, y: number, comp: Record<string, number>, kmolH: number, T: number, P: number, priceKey = ''): string {
  const id = put(s, 'feed', x, y);
  const r = designActions.setFeed!(s, id, { x: s.species.map((sp) => comp[sp] ?? 0), flow: fromKmolH(kmolH), T, P, priceKey }) as { ok?: boolean };
  if (r && r.ok === false) throw new Error('level setup: setFeed');
  return id;
}

export function link(s: EqState, a: string, ap: string, b: string, bp: string): string {
  const r = designActions.connect!(s, a, ap, b, bp) as { ok: boolean; id?: string; message: string };
  if (!r.ok || r.id === undefined) throw new Error(`level setup: connect ${a}.${ap} ${b}.${bp} ${r.message}`);
  return r.id;
}

/** The pre-built plant is the level's starting point, not the player's first edit: nothing to undo. */
export function sealSetup(s: EqState): void {
  s.undo = { past: [], future: [] };
  s.solved = null;
  s.phase = 'design';
}

/** Number of successful commissions this attempt (the solution log is the record). */
export function commissions(s: S): number { return (s.levelActions ?? []).filter((a) => a[0] === 'commission').length; }

/** Region price of a key in USD-equivalent per kg (0 for a row that is not per kg / per t). */
export function pricePerKg(s: S, key: string): number {
  const row = pricesOf(s)[key as PriceKey] as { value: number; unit: string } | undefined;
  if (!row) return 0;
  return row.unit === 'per kg' ? row.value : row.unit === 'per t' ? row.value / 1000 : 0;
}

/** `x` rounded exactly as `fmtNumber` shows it (3-4 significant figures), so an equation can be computed from the numbers the player reads. */
export function shown(x: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) return x;
  const a = Math.abs(x);
  const f = a >= 1000 ? 1 : a >= 100 ? 10 : a >= 1 ? 100 : a >= 0.01 ? 1000 : 100000;
  return Math.round(x * f) / f;
}
