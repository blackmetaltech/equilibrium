// Candidate actions for the env, personas and the legal-actions probe (GameDef.legalActions). Deterministic and bounded; the core probes
// every candidate with a dry run. `full` enumerates more variants (every knob extreme, every unit move/delete).
import type { Action } from '@core/kit';
import { SPECIES } from '../data/species';
import type { EqState } from '../state';
import { connectProblem } from './actions/design';
import { ALWAYS_AVAILABLE, UNIT_TYPES, defOf, footprint, hasUnitType, metaOf } from './registry';

const MAX_WINDOW = 6;
const SPECIES_SETS: string[][] = [['N2', 'H2', 'NH3', 'Ar'], ['N2', 'O2', 'Ar', 'H2O', 'CO2']];

function freeSpots(s: Readonly<EqState>, type: string, want: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const f = footprint(type, 0);
  for (let y = 0; y + f.h <= s.plot.h && out.length < want; y += 2) {
    for (let x = 0; x + f.w <= s.plot.w && out.length < want; x += 2) {
      const hit = s.flowsheet.units.some((o) => { const g = footprint(o.type, o.rot); return x < o.pos.x + g.w && o.pos.x < x + f.w && y < o.pos.y + g.h && o.pos.y < y + f.h; });
      if (!hit) out.push({ x, y });
    }
  }
  return out;
}

export function legalActions(s: Readonly<EqState>, full: boolean): Action[] {
  const a: Action[] = [];
  if (s.phase !== 'design' && s.phase !== 'commissioned') return a;
  if (s.level === null && s.flowsheet.units.length === 0) for (const set of SPECIES_SETS.filter((l) => l.every((x) => SPECIES[x]))) a.push({ name: 'setSpecies', args: [set] });
  const types = UNIT_TYPES.filter((t) => s.palette === null || s.palette.includes(t) || ALWAYS_AVAILABLE.includes(t));
  for (const t of types) for (const p of freeSpots(s, t, full ? 3 : 1)) a.push({ name: 'placeUnit', args: [t, p.x, p.y, 0] });
  const units = s.flowsheet.units.filter((u) => hasUnitType(u.type));
  // bounded candidate sets (the core probes each one with a state clone): a rotating window of units, chosen from the id counter
  const win = full || units.length <= MAX_WINDOW ? units : Array.from({ length: MAX_WINDOW }, (_, k) => units[(s.flowsheet.nextId + k * 3) % units.length]!);
  for (const u of win) {
    for (const k of metaOf(u.type).knobs) {
      const v = u.params[k.key] ?? k.def;
      if (k.kind === 'choice') { for (const o of k.options!) a.push({ name: 'setParam', args: [u.id, k.key, o] }); continue; }
      const cur = typeof v === 'number' ? v : Number(k.def);
      const clamp = (x: number): number => Math.min(k.max, Math.max(k.min, k.int ? Math.round(x) : x));
      const vals = [cur + k.coarse, cur - k.coarse, ...(full ? [cur + k.fine, cur - k.fine, k.min, k.max] : [])].map(clamp);
      for (const x of new Set(vals)) a.push({ name: 'setParam', args: [u.id, k.key, x] });
    }
    if (u.type === 'feed') { const n = s.species.length; if (n > 1) a.push({ name: 'setFeed', args: [u.id, { x: s.species.map((_, i) => (i === 0 ? 0.5 : 0.5 / (n - 1))) }] }); }
    if (full || u === win[0]) a.push({ name: 'deleteUnit', args: [u.id] });
    if (full) {
      a.push({ name: 'rotateUnit', args: [u.id] });
      for (const p of freeSpots(s, u.type, 2)) a.push({ name: 'moveUnit', args: [u.id, p.x, p.y] });
    }
  }
  for (const u of win) {
    for (const op of defOf(u.type).outlets) {
      let n = 0;
      for (const v of units) for (const ip of defOf(v.type).inlets) {
        if (!full && n >= 2) continue;
        if (connectProblem(s, u, op, v, ip) === null) { a.push({ name: 'connect', args: [u.id, op, v.id, ip] }); n++; }
      }
    }
  }
  for (const p of s.flowsheet.streams) if (full) a.push({ name: 'disconnect', args: [p.id] });
  if (s.undo.past.length) a.push({ name: 'undo' });
  if (s.undo.future.length) a.push({ name: 'redo' });
  if (units.length) a.push({ name: 'commission' });
  a.push({ name: 'predict', args: ['conversion', 0.5] });
  if (full) for (const d of ['rigorous', 'textbook', 'book']) a.push({ name: 'setThermoDetail', args: [d] });
  return a;
}
