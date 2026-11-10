// Design-phase undo / redo as compact diffs of the flowsheet (units, pipes, feeds, id counter): at most MAX_UNDO entries, plain JSON.
// Usage: `const b = flowSnap(s); ...mutate...; recordDiff(s, b)`. Species, region, thermo detail and params outside the flowsheet are not undoable.
import { MAX_UNDO, type EqState, type FeedSpec, type UndoEntry } from '../state';
import type { Pipe, UnitInst } from '../sim/types';

export interface Snap { units: UnitInst[]; pipes: Pipe[]; feeds: Record<string, FeedSpec>; nextId: number }

export const flowSnap = (s: EqState): Snap =>
  structuredClone({ units: s.flowsheet.units, pipes: s.flowsheet.streams, feeds: s.feeds, nextId: s.flowsheet.nextId });

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function diffMap<T extends { id: string }>(a: T[], b: T[]): Record<string, [T | null, T | null]> {
  const out: Record<string, [T | null, T | null]> = {};
  const ma = new Map(a.map((x) => [x.id, x])), mb = new Map(b.map((x) => [x.id, x]));
  for (const [id, x] of ma) { const y = mb.get(id) ?? null; if (y === null || !same(x, y)) out[id] = [x, y]; }
  for (const [id, y] of mb) if (!ma.has(id)) out[id] = [null, y];
  return out;
}

/** Push the diff between `before` and the state as it is now (no-op when nothing changed); clears the redo stack. */
export function recordDiff(s: EqState, before: Snap): void {
  const u = diffMap(before.units, s.flowsheet.units), p = diffMap(before.pipes, s.flowsheet.streams);
  const f: UndoEntry['f'] = {};
  for (const id of Object.keys(before.feeds)) { const y = s.feeds[id] ?? null; if (y === null || !same(before.feeds[id], y)) f[id] = [before.feeds[id]!, y]; }
  for (const id of Object.keys(s.feeds)) if (!(id in before.feeds)) f[id] = [null, s.feeds[id]!];
  if (!Object.keys(u).length && !Object.keys(p).length && !Object.keys(f).length && before.nextId === s.flowsheet.nextId) return;
  s.undo.past.push({ u, p, f, n: [before.nextId, s.flowsheet.nextId] });
  if (s.undo.past.length > MAX_UNDO) s.undo.past.splice(0, s.undo.past.length - MAX_UNDO);
  s.undo.future = [];
}

/** Creation order: the counter inside an id ("K-103" is 103). Restoring by it puts a re-inserted unit back where it was. */
const order = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));

function apply<T extends { id: string }>(list: T[], d: Record<string, [T | null, T | null]>, side: 0 | 1): T[] {
  const out = list.filter((x) => !(x.id in d));
  for (const id of Object.keys(d)) { const v = d[id]![side]; if (v !== null) out.push(structuredClone(v)); }
  return out.sort((a, b) => order(a.id) - order(b.id));
}

function applyEntry(s: EqState, e: UndoEntry, side: 0 | 1): void {
  s.flowsheet.units = apply(s.flowsheet.units, e.u, side);
  s.flowsheet.streams = apply(s.flowsheet.streams, e.p, side);
  for (const id of Object.keys(e.f)) { const v = e.f[id]![side]; if (v === null) delete s.feeds[id]; else s.feeds[id] = structuredClone(v); }
  s.flowsheet.nextId = e.n[side];
}

/** Revert the latest step; false when there is none. */
export function undoStep(s: EqState): boolean {
  const e = s.undo.past.pop();
  if (!e) return false;
  applyEntry(s, e, 0);
  s.undo.future.push(e);
  return true;
}
export function redoStep(s: EqState): boolean {
  const e = s.undo.future.pop();
  if (!e) return false;
  applyEntry(s, e, 1);
  s.undo.past.push(e);
  return true;
}
