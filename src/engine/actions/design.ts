// Design actions (DESIGN §8.3): placeUnit, moveUnit, rotateUnit, deleteUnit, connect, disconnect, setParam, setFeed, setCatalyst,
// setSpecies (free play), undo, redo. Every rejection is fail(t('err...', vars)): a teaching message, never a code. Each successful edit
// is one undo step; an edit of a commissioned plant sends it back to the design phase (its result is stale).
import { fail, ok, need } from '@core/kit';
import type { ActionFn } from '@core/kit';
import { CATALYST_IDS, findCatalyst } from '../../data/catalysts';
import { hasThermo } from '../../sim/thermo/species';
import { SPECIES } from '../../data/species';
import { PRICE_KEYS } from '../../regions/data';
import { t } from '../../i18n';
import { MAX_SPECIES, MAX_STREAMS, MAX_UNITS, type EqState, type FeedSpec } from '../../state';
import type { Pipe, UnitInst } from '../../sim/types';
import {
  ALWAYS_AVAILABLE, defOf, defaultParams, footprint, hasUnitType, knobOf, metaOf, phaseClash, portPhaseIn, portPhaseOut, type KnobSpec,
} from '../registry';
import { fmtDisplay, syncFeed } from '../solved';
import { flowSnap, recordDiff, redoStep, undoStep } from '../undo';

type Fn = ActionFn<EqState>;

// ---- shared guards ----
/** The level first run (no shift in progress) is a plant on show, not a lock: editing it ends the run. */
const inFirstRun = (s: EqState): boolean => s.phase === 'firstrun' && s.shift === null;
const editable = (s: EqState): boolean => s.phase === 'design' || s.phase === 'commissioned' || inFirstRun(s);
export function needEditable(s: EqState): void { need(editable(s), t('err.design.locked')); }
/** A design change makes the last solve stale. */
export function invalidate(s: EqState): void { s.solved = null; if (s.phase === 'commissioned' || inFirstRun(s)) s.phase = 'design'; }

/** Run a design edit as one undo step. */
export function edit<R>(s: EqState, body: () => R): R {
  needEditable(s);
  const before = flowSnap(s);
  const r = body();
  recordDiff(s, before);
  invalidate(s);
  return r;
}

export const unitOf = (s: EqState, id: unknown): UnitInst => {
  const u = typeof id === 'string' ? s.flowsheet.units.find((x) => x.id === id) : undefined;
  if (!u) fail(t('err.unit.unknown', { id: String(id) }));
  return u;
};

const PREFIX: Record<string, string> = {
  feed: 'F', mixer: 'M', mixer3: 'M', mixer4: 'M', splitter: 'X', purge: 'X', heater: 'H', cooler: 'C', hx: 'E', compressor: 'K', valve: 'V',
  flash: 'D', nh3_sep: 'D', boiler: 'B', absorber: 'A', stack: 'Z', relief: 'R', flare: 'L', interlock: 'I', sink: 'N', product: 'T', vent: 'Y',
  eq_reactor: 'R', eq_bed: 'R', packed_bed: 'R', multibed: 'R', cstr: 'R', stoich_reactor: 'R', burner: 'R', gasifier: 'R', co_burner: 'R',
};
const nextName = (s: EqState, prefix: string): string => `${prefix}-${100 + s.flowsheet.nextId++}`;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Tiles occupied by a unit at (x, y) with rotation rot. */
function rectOf(type: string, x: number, y: number, rot: number): { x: number; y: number; w: number; h: number } { return { x, y, ...footprint(type, rot) }; }
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function checkSpot(s: EqState, type: string, x: number, y: number, rot: number, selfId?: string): void {
  const r = rectOf(type, x, y, rot);
  need(r.x >= 0 && r.y >= 0 && r.x + r.w <= s.plot.w && r.y + r.h <= s.plot.h, t('err.place.bounds', { pw: s.plot.w, ph: s.plot.h }));
  for (const o of s.flowsheet.units) {
    if (o.id === selfId) continue;
    need(!overlap(r, rectOf(o.type, o.pos.x, o.pos.y, o.rot)), t('err.place.occupied', { other: o.id }));
  }
}

export function defaultFeed(s: EqState): FeedSpec {
  return { x: s.species.map((_, i) => (i === 0 ? 1 : 0)), flow: 1, T: 298.15, P: 1e5, priceKey: '' };
}

const placeUnit: Fn = (s, type: unknown, x: unknown, y: unknown, rot: unknown = 0) => {
  needEditable(s);
  need(typeof type === 'string' && hasUnitType(type), t('err.place.unknown_type', { type: String(type) }));
  need(rot === 0 || rot === 1 || rot === 2 || rot === 3, t('err.place.rot'));
  need(isInt(x) && isInt(y), t('err.place.coords'));
  if (s.palette !== null && !s.palette.includes(type) && !ALWAYS_AVAILABLE.includes(type)) fail(t('err.place.locked', { type }));
  const lim = s.limits[type];
  if (lim !== undefined) need(s.flowsheet.units.filter((u) => u.type === type).length < lim, t('err.place.limit', { type, limit: lim }));
  need(s.flowsheet.units.length < MAX_UNITS, t('err.place.full', { max: MAX_UNITS }));
  checkSpot(s, type, x, y, rot);
  return edit(s, () => {
    const id = nextName(s, PREFIX[type] ?? 'U');
    const u: UnitInst = { id, type, pos: { x, y }, rot, params: { ...defaultParams(type), ...(s.presets[type] ?? {}) } };
    s.flowsheet.units.push(u);
    if (type === 'feed') { s.feeds[id] = defaultFeed(s); syncFeed(u, s.feeds[id]!, s.species); }
    return ok('', { id });
  });
};

const moveUnit: Fn = (s, id: unknown, x: unknown, y: unknown) => {
  needEditable(s);
  const u = unitOf(s, id);
  need(isInt(x) && isInt(y), t('err.place.coords'));
  checkSpot(s, u.type, x, y, u.rot, u.id);
  edit(s, () => { u.pos = { x, y }; });
};

const rotateUnit: Fn = (s, id: unknown) => {
  needEditable(s);
  const u = unitOf(s, id);
  const rot = ((u.rot + 1) % 4) as 0 | 1 | 2 | 3;
  checkSpot(s, u.type, u.pos.x, u.pos.y, rot, u.id);
  edit(s, () => { u.rot = rot; });
};

const deleteUnit: Fn = (s, id: unknown) => {
  needEditable(s);
  const u = unitOf(s, id);
  edit(s, () => {
    s.flowsheet.units = s.flowsheet.units.filter((x) => x.id !== u.id);
    s.flowsheet.streams = s.flowsheet.streams.filter((p) => p.from.unit !== u.id && p.to.unit !== u.id);
    delete s.feeds[u.id];
  });
};

export interface Problem { key: string; vars: Record<string, string | number> }

/** First reason a pipe from (a, fp) to (b, tp) is not allowed, or null. Pure; the single rule set behind connect() and the legalPorts query. */
export function connectProblem(s: Readonly<EqState>, a: UnitInst, fp: string, b: UnitInst, tp: string): Problem | null {
  if (a.id === b.id) return { key: 'err.connect.self', vars: {} };
  const da = defOf(a.type), db = defOf(b.type);
  if (!da.outlets.includes(fp)) {
    if (da.inlets.includes(fp)) return { key: 'err.connect.wrong_out', vars: { unit: a.id, port: fp } };
    return { key: 'err.connect.no_port', vars: { unit: a.id, port: fp, ports: [...da.outlets, ...da.inlets].join(', ') } };
  }
  if (!db.inlets.includes(tp)) {
    if (db.outlets.includes(tp)) return { key: 'err.connect.wrong_in', vars: { unit: b.id, port: tp } };
    return { key: 'err.connect.no_port', vars: { unit: b.id, port: tp, ports: [...db.outlets, ...db.inlets].join(', ') } };
  }
  if (s.flowsheet.streams.some((p) => p.to.unit === b.id && p.to.port === tp)) return { key: 'err.connect.occupied', vars: {} };
  if (s.flowsheet.streams.some((p) => p.from.unit === a.id && p.from.port === fp)) return { key: 'err.connect.outlet_taken', vars: { unit: a.id, port: fp } };
  const pf = portPhaseOut(a.type, fp), pt = portPhaseIn(b.type, tp);
  if (phaseClash(pf, pt)) return { key: pf === 'V' ? (b.type === 'pump' ? 'err.connect.pump_gas' : 'err.connect.gas_to_liquid') : 'err.connect.liquid_to_gas', vars: {} };
  if (s.flowsheet.streams.length >= MAX_STREAMS) return { key: 'err.connect.streams_full', vars: { max: MAX_STREAMS } };
  return null;
}

const connect: Fn = (s, fromUnit: unknown, fromPort: unknown, toUnit: unknown, toPort: unknown) => {
  needEditable(s);
  const a = unitOf(s, fromUnit), b = unitOf(s, toUnit);
  const fp = String(fromPort), tp = String(toPort);
  const bad = connectProblem(s, a, fp, b, tp);
  if (bad) fail(t(bad.key, bad.vars));
  return edit(s, () => {
    const id = nextName(s, 'S');
    const p: Pipe = { id, from: { unit: a.id, port: fp }, to: { unit: b.id, port: tp } };
    s.flowsheet.streams.push(p);
    return ok('', { id });
  });
};

const disconnect: Fn = (s, streamId: unknown) => {
  needEditable(s);
  need(typeof streamId === 'string' && s.flowsheet.streams.some((p) => p.id === streamId), t('err.stream.unknown', { id: String(streamId) }));
  edit(s, () => { s.flowsheet.streams = s.flowsheet.streams.filter((p) => p.id !== streamId); });
};

// ---- parameters ----
/** The parameter key a player may type for a unit type (BINDING examples use 'purge' for a splitter's fraction). */
const ALIAS: Record<string, string> = { purge: 'frac' };

function checkKnob(s: EqState, u: UnitInst, k: KnobSpec, value: unknown): number | string {
  if (k.kind === 'choice') {
    need(typeof value === 'string' && k.options!.includes(value), t('err.param.choice', { key: k.key, unit: u.id, options: k.options!.map((o) => o || '-').join(', ') }));
    return value;
  }
  need(typeof value === 'number' && Number.isFinite(value), t('err.param.number', { key: k.key }));
  if (k.key === 'frac' && (u.type === 'splitter' || u.type === 'purge')) need(value >= k.min && value <= k.max, t('err.split.range', { value }));
  need(value >= k.min && value <= k.max, t('err.param.range', {
    key: k.key, unit: u.id, min: fmtDisplay(k.min, k.unit, s.region), max: fmtDisplay(k.max, k.unit, s.region), value: fmtDisplay(value as number, k.unit, s.region),
  }));
  if (k.int) need(Number.isInteger(value), t('err.param.int', { key: k.key, unit: u.id, value: fmtDisplay(value as number, k.unit, s.region) }));
  return value;
}

const setParam: Fn = (s, unitId: unknown, key: unknown, value: unknown) => {
  needEditable(s);
  const u = unitOf(s, unitId);
  const kk = typeof key === 'string' ? (ALIAS[key] !== undefined && knobOf(u.type, ALIAS[key]!) ? ALIAS[key]! : key) : '';
  const k = knobOf(u.type, kk);
  if (!k) fail(t('err.param.unknown', { unit: u.id, key: String(key), keys: metaOf(u.type).knobs.map((x) => x.key).join(', ') || '-' }));
  const v = checkKnob(s, u, k, value);
  edit(s, () => {
    if (u.type === 'feed' && (k.key === 'flow' || k.key === 'T' || k.key === 'P')) {
      const f = s.feeds[u.id] ?? defaultFeed(s);
      (f as unknown as Record<string, number>)[k.key] = v as number;
      s.feeds[u.id] = f; syncFeed(u, f, s.species);
    } else if (v === '' && k.kind === 'choice') delete u.params[k.key];
    else u.params[k.key] = v;
  });
};

const FEED_MAX_FLOW = 1e5;
const FEED_T: [number, number] = [50, 3000], FEED_P: [number, number] = [1e3, 1e9];

const setFeed: Fn = (s, feedId: unknown, spec: unknown) => {
  needEditable(s);
  const u = unitOf(s, feedId);
  need(u.type === 'feed', t('err.feed.not_feed', { id: u.id }));
  need(spec !== null && typeof spec === 'object', t('err.feed.fractions'));
  const sp = spec as Partial<FeedSpec>;
  const f: FeedSpec = structuredClone(s.feeds[u.id] ?? defaultFeed(s));
  if (sp.x !== undefined) {
    need(Array.isArray(sp.x) && sp.x.length === s.species.length, t('err.feed.composition', { given: Array.isArray(sp.x) ? sp.x.length : 0, need: s.species.length }));
    const sum = sp.x.reduce((a: number, b: unknown) => { need(typeof b === 'number' && Number.isFinite(b) && b >= 0, t('err.feed.fractions')); return a + b; }, 0);
    need(sum > 0, t('err.feed.fractions'));
    f.x = sp.x.map((v: number) => v / sum);
  }
  if (sp.flow !== undefined) { need(typeof sp.flow === 'number' && Number.isFinite(sp.flow) && sp.flow >= 0 && sp.flow <= FEED_MAX_FLOW, t('err.feed.flow', { max: FEED_MAX_FLOW })); f.flow = sp.flow; }
  if (sp.T !== undefined) { need(typeof sp.T === 'number' && sp.T >= FEED_T[0] && sp.T <= FEED_T[1], t('err.feed.T', { min: fmtDisplay(FEED_T[0], 'degC', s.region), max: fmtDisplay(FEED_T[1], 'degC', s.region) })); f.T = sp.T; }
  if (sp.P !== undefined) { need(typeof sp.P === 'number' && sp.P >= FEED_P[0] && sp.P <= FEED_P[1], t('err.feed.P', { min: fmtDisplay(FEED_P[0], 'bar', s.region), max: fmtDisplay(FEED_P[1], 'bar', s.region) })); f.P = sp.P; }
  if (sp.priceKey !== undefined) {
    need(typeof sp.priceKey === 'string' && (sp.priceKey === '' || (PRICE_KEYS as readonly string[]).includes(sp.priceKey)), t('err.feed.price', { key: String(sp.priceKey), keys: PRICE_KEYS.join(', ') }));
    f.priceKey = sp.priceKey;
  }
  edit(s, () => { s.feeds[u.id] = f; syncFeed(u, f, s.species); });
};

const setCatalyst: Fn = (s, unitId: unknown, catalystId: unknown) => {
  needEditable(s);
  const u = unitOf(s, unitId);
  need(metaOf(u.type).catalyst === true, t('err.catalyst.not_a_reactor', { type: u.type }));
  need(typeof catalystId === 'string' && findCatalyst(catalystId) !== undefined, t('err.catalyst.unknown', { id: String(catalystId), options: CATALYST_IDS.join(', ') }));
  edit(s, () => { u.catalystId = catalystId as string; });
};

/** Free play only: choose the active species before building (a level fixes them in its setup). */
const setSpecies: Fn = (s, list: unknown) => {
  needEditable(s);
  need(s.level === null && s.flowsheet.units.length === 0, t('err.species.locked'));
  need(Array.isArray(list) && list.length <= MAX_SPECIES, t('err.species.count', { max: MAX_SPECIES }));
  const seen = new Set<string>();
  for (const id of list as unknown[]) {
    need(typeof id === 'string' && Object.prototype.hasOwnProperty.call(SPECIES, id) && hasThermo(id), t('err.species.bad', { id: String(id) }));
    need(!seen.has(id as string), t('err.species.dup', { id: String(id) }));
    seen.add(id as string);
  }
  s.species = (list as string[]).slice();
  invalidate(s);
};

const undo: Fn = (s) => { needEditable(s); need(s.undo.past.length > 0, t('err.undo.empty')); undoStep(s); invalidate(s); };
const redo: Fn = (s) => { needEditable(s); need(s.undo.future.length > 0, t('err.redo.empty')); redoStep(s); invalidate(s); };

export const designActions: Record<string, Fn> = {
  placeUnit, moveUnit, rotateUnit, deleteUnit, connect, disconnect, setParam, setFeed, setCatalyst, setSpecies, undo, redo,
};
