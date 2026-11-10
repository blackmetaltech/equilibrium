// Shift events (DESIGN 2.6, 3.9, 8.5 system 1). The schedule is drawn once, at shift start, from a generator seeded by (game seed, level, shift index),
// so a replay reproduces it exactly and no later system consumes randomness. An event is a plain record; its effect on the plant is a set of
// boundary-condition modifiers (`Mods`) folded from the active events, so applying and ending an event is idempotent and partition-invariant.
import { Rng, seedState } from '@core/kit';
import { EVENTS, EVENT_TABLES, FREE_TABLE, INERT_PREF, LEARNER_GENTLE, type EventTable, type EventType } from '../../data/events';
import type { UnitInst } from '../types';

/** A scheduled event: fires at plant second `at`. `v` is the magnitude after the mode's gentler factor, `target` a unit or species id ('' = plant). */
export interface EventInst { id: string; type: EventType; at: number; dur: number; v: number; target: string }
/** A fired event still in force (`until` < 0: for the rest of the shift). */
export interface ActiveEvent { id: string; type: EventType; until: number; v: number; target: string }

/** Boundary-condition modifiers (1 = unchanged). Everything the network or the econ layer reads of the events is here. */
export interface Mods {
  /** Cooling-water heat-transfer multiplier and coolant temperature rise, K. */
  cwUa: number;
  cwdT: number;
  /** Mole fraction added to the feed per inert species. */
  inerts: Record<string, number>;
  feed: number;
  air: number;
  /** Catalyst activity multiplier of every bed, and of single beds by unit id. */
  act: number;
  actBed: Record<string, number>;
  fuel: number;
  product: number;
  motors: number;
  steam: number;
  /** 1 while a compressor trip is in force. */
  comp: number;
  /** Valves stuck closed. */
  blocked: string[];
  /** Species / unit id whose analyser reads zero ('' = none). */
  analyser: string;
}

export const emptyMods = (): Mods => ({
  cwUa: 1, cwdT: 0, inerts: {}, feed: 1, air: 1, act: 1, actBed: {}, fuel: 1, product: 1, motors: 1, steam: 1, comp: 0, blocked: [], analyser: '',
});

/** Fold the active events into modifiers (order-independent: products and sums). */
export function foldMods(active: readonly ActiveEvent[]): Mods {
  const m = emptyMods();
  for (const e of active) {
    switch (e.type) {
      case 'cw_pump_trip': m.cwUa *= e.v; break;
      case 'cw_hot_day': m.cwdT += e.v; break;
      case 'feed_inerts': m.inerts[e.target] = (m.inerts[e.target] ?? 0) + e.v; break;
      case 'feed_surge': m.feed *= e.v; break;
      case 'blower_wear': m.air *= e.v; break;
      case 'compressor_trip': m.comp = 1; break;
      case 'catalyst_age': m.act *= e.v; break;
      case 'catalyst_poison': m.actBed[e.target] = (m.actBed[e.target] ?? 1) * e.v; break;
      case 'fuel_price': m.fuel *= e.v; break;
      case 'demand_spike': m.product *= e.v; break;
      case 'power_dip': m.motors *= e.v; break;
      case 'analyser_fault': m.analyser = e.target; break;
      case 'steam_header_low': m.steam *= e.v; break;
      case 'valve_fails_closed': if (!m.blocked.includes(e.target)) m.blocked.push(e.target); break;
    }
  }
  m.blocked.sort();
  return m;
}

const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
/** The generator seed of a shift: per game seed, level and shift index; a table may pin it (L00). */
export const shiftSeed = (seed: number, level: string | null, idx: number, pinned?: number): number =>
  seedState(pinned !== undefined ? pinned : (seed ^ fnv(level ?? '') ^ Math.imul(idx + 1, 0x9e3779b1)) >>> 0);

export interface ScheduleInput {
  seed: number;
  level: string | null;
  idx: number;
  mode: string;
  /** Sandbox runs without events unless asked. */
  enabled: boolean;
  species: readonly string[];
  units: readonly UnitInst[];
  /** Mole fractions per feed unit id (indexed by species). */
  feedX: Readonly<Record<string, readonly number[]>>;
}

export const tableOf = (level: string | null): EventTable => (level !== null && EVENT_TABLES[level] !== undefined ? EVENT_TABLES[level]! : FREE_TABLE);

const hasType = (units: readonly UnitInst[], t: string): UnitInst[] => units.filter((u) => u.type === t);
/** Targets an event type could hit in this plant ([] = it cannot happen here; [''] = the whole plant). */
export function targetsOf(type: EventType, inp: Pick<ScheduleInput, 'species' | 'units' | 'feedX'>): string[] {
  const { units, species } = inp;
  const cw = units.filter((u) => (u.type === 'cooler' || u.type === 'heater') && u.params.utility === 'cw');
  switch (type) {
    case 'cw_pump_trip': case 'cw_hot_day': return cw.length > 0 ? [''] : [];
    case 'feed_inerts': { const i = INERT_PREF.find((s) => species.includes(s)); return i !== undefined && hasType(units, 'feed').length > 0 ? [i] : []; }
    case 'feed_surge': return hasType(units, 'feed').length > 0 ? [''] : [];
    case 'blower_wear': {
      const o = species.indexOf('O2');
      return o >= 0 && Object.values(inp.feedX).some((x) => (x[o] ?? 0) >= 0.15) ? [''] : [];
    }
    case 'compressor_trip': case 'power_dip': return hasType(units, 'compressor').length > 0 ? [''] : [];
    case 'catalyst_age': return units.some((u) => u.type === 'packed_bed' || u.type === 'multibed') ? [''] : [];
    case 'catalyst_poison': return units.filter((u) => u.type === 'packed_bed' || u.type === 'multibed').map((u) => u.id);
    case 'fuel_price': return [''];
    case 'demand_spike': return hasType(units, 'product').length > 0 ? [''] : [];
    case 'analyser_fault': return units.filter((u) => u.type === 'product' || u.type === 'stack' || u.type === 'vent').map((u) => u.id);
    case 'steam_header_low': return units.some((u) => u.type === 'boiler' || ((u.type === 'heater' || u.type === 'cooler') && u.params.utility === 'steam')) ? [''] : [];
    case 'valve_fails_closed': return hasType(units, 'valve').map((u) => u.id);
  }
}

/** The shift's event queue (sorted by time). Deterministic in the input; draws a fixed pattern from the seeded generator. */
export function scheduleEvents(inp: ScheduleInput): { q: EventInst[]; lenS: number } {
  const table = tableOf(inp.level);
  const lenS = table.lenS;
  if (!inp.enabled) return { q: [], lenS };
  const rng = new Rng(shiftSeed(inp.seed, inp.level, inp.idx, table.seed));
  const g = inp.mode === 'learner' ? LEARNER_GENTLE : 1;
  const chosen: EventType[] = [];
  const ok = (t: EventType): boolean => targetsOf(t, inp).length > 0;
  for (const t of table.guaranteed) if (ok(t) && !chosen.includes(t)) chosen.push(t);
  const want = table.fixed.length > 0 ? 0 : Math.max(chosen.length, rng.int(table.count[0], table.count[1]));
  while (chosen.length < want) {
    const cand = table.pool.filter((t) => !chosen.includes(t) && ok(t));
    if (cand.length === 0) break;
    let tot = 0; for (const t of cand) tot += EVENTS[t].weight;
    let x = rng.next() * tot, pick = cand[cand.length - 1]!;
    for (const t of cand) { x -= EVENTS[t].weight; if (x < 0) { pick = t; break; } }
    chosen.push(pick);
  }
  const make = (type: EventType, at: number, n: number): EventInst => {
    const spec = EVENTS[type], targets = targetsOf(type, inp);
    const target = targets.length > 1 ? targets[Math.min(targets.length - 1, Math.floor(rng.next() * targets.length))]! : (targets[0] ?? '');
    const raw = spec.magHi > spec.mag ? rng.range(spec.mag, spec.magHi) : spec.mag;
    const isAdd = type === 'cw_hot_day' || type === 'feed_inerts';
    const v = type === 'compressor_trip' || type === 'valve_fails_closed' || type === 'analyser_fault' ? 0 : isAdd ? raw * g : 1 + (raw - 1) * g;
    const shortens = type === 'compressor_trip' || type === 'power_dip' || type === 'valve_fails_closed';
    const dur = spec.durS > 0 && shortens ? Math.max(1, Math.round(spec.durS * g)) : spec.durS;
    return { id: 'E' + n, type, at, dur, v, target };
  };
  const q: EventInst[] = [];
  let n = 1;
  for (const f of table.fixed) if (ok(f.type)) q.push(make(f.type, f.at, n++));
  for (const type of chosen) q.push(make(type, Math.max(1, Math.floor(lenS * (0.1 + 0.75 * rng.next()))), n++));
  q.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return { q, lenS };
}

/** The slice of the shift state the events system touches. */
export interface EventsCore { t: number; q: EventInst[]; act: ActiveEvent[]; mods: Mods }

/** Fire the events due at plant second `core.t` and retire the ended ones. Returns the fired / ended events (empty = nothing changed). */
export function stepEvents(core: EventsCore): { fired: EventInst[]; ended: ActiveEvent[] } {
  const fired: EventInst[] = [], ended: ActiveEvent[] = [];
  while (core.q.length > 0 && core.q[0]!.at <= core.t) {
    const e = core.q.shift()!;
    fired.push(e);
    core.act.push({ id: e.id, type: e.type, until: e.dur > 0 ? e.at + e.dur : -1, v: e.v, target: e.target });
  }
  if (core.act.length > 0) {
    const keep: ActiveEvent[] = [];
    for (const a of core.act) { if (a.until >= 0 && a.until <= core.t) ended.push(a); else keep.push(a); }
    if (ended.length > 0) core.act = keep;
  }
  if (fired.length > 0 || ended.length > 0) core.mods = foldMods(core.act);
  return { fired, ended };
}
