// The bench ammonia plant shared by L01 and L04: N2 bank + H2 bank -> mixer -> ideal reactor (100 % of the limiting reagent) -> ideal NH3 separator
// -> product tank (liquid NH3) and vent (the leftover gas). Measures, coach, scripted builds. DESIGN 2.6 L01 / L04, DEPTH "Chapter 1 enrichment".
import type { Action } from '@core/kit';
import type { EqState } from '../state';
import type { CoachStep, LevelSpec, Measures } from './spec';
import { commissions, fedOf, intoType, pricePerKg, toKgH, toKmolH, unitsOfType } from './util';

export const BENCH_SPECIES = ['N2', 'H2', 'NH3'];
/** GAME bench prices, USD per unit (UNVERIFIED: placeholders until calibrated, DESIGN 9.6). */
export const BENCH_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 6000 }, mixer: { max: 1, price: 3000 }, stoich_reactor: { max: 1, price: 18000 }, nh3_sep: { max: 1, price: 12000 },
  product: { max: 1, price: 5000 }, vent: { max: 1, price: 1500 },
};
export const BENCH_BUDGET = 60000;
/** The ideal reactor: R1 to completion at the bench temperature (the unit card says "100 % of the limiting reagent"). */
export const BENCH_PRESETS: Record<string, Record<string, number | string>> = { stoich_reactor: { reactions: 'R1', mode: 'isothermal', T: 298.15 } };

/** Everything the bench levels read off the plant. Fed numbers come from the feed specs (valid before commissioning), results from the solve. */
export function benchMeasures(s: Readonly<EqState>): Measures {
  const n2Fed = toKmolH(fedOf(s, 'N2')), h2Fed = toKmolH(fedOf(s, 'H2'));
  const v: Record<string, number> = {
    n2_fed: n2Fed, h2_fed: h2Fed, ratio: n2Fed > 0 ? h2Fed / n2Fed : 0, n2_kg_h: toKgH(fedOf(s, 'N2'), 'N2'), h2_kg_h: toKgH(fedOf(s, 'H2'), 'H2'),
    feed_cost: toKgH(fedOf(s, 'H2'), 'H2') * pricePerKg(s, 'hydrogen'),
    /** 0 when N2 limits (H2 is in excess), 1 when H2 limits. */
    limiting: n2Fed * 3 <= h2Fed ? 0 : 1,
    nh3_kg_h: 0, nh3_kmol_h: 0, vent_h2: 0, vent_n2: 0, vent_kmol_h: 0, vent_frac: 0, vent_kg_h: 0, left_h2_kg_h: 0,
  };
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const prod = intoType(s, 'product', 'NH3');
  v.nh3_kg_h = toKgH(prod, 'NH3'); v.nh3_kmol_h = toKmolH(prod);
  v.vent_h2 = toKmolH(intoType(s, 'vent', 'H2')); v.vent_n2 = toKmolH(intoType(s, 'vent', 'N2'));
  v.vent_kmol_h = v.vent_h2! + v.vent_n2!;
  v.vent_kg_h = toKgH(intoType(s, 'vent', 'H2'), 'H2') + toKgH(intoType(s, 'vent', 'N2'), 'N2');
  v.left_h2_kg_h = toKgH(intoType(s, 'vent', 'H2'), 'H2');
  v.vent_frac = n2Fed + h2Fed > 0 ? v.vent_kmol_h! / (n2Fed + h2Fed) : 0;
  return { ok: true, v };
}

const LATE = (ids: string[]) => (s: Readonly<EqState>): boolean => ids.includes(s.ui.coachStep ?? '');
/** The eight steps of L01 (the plant-check job of L04 reuses the last three). */
export const BENCH_COACH: CoachStep[] = [
  { id: 'place_feed', role: 'mentor', focus: 'feed', done: (s) => unitsOfType(s, 'feed').length >= 1 },
  { id: 'set_flow', role: 'mentor', focus: 'feed', done: (s) => unitsOfType(s, 'feed').some((u) => (s.feeds[u.id]?.flow ?? 1) !== 1 && (s.feeds[u.id]?.flow ?? 0) > 0) },
  { id: 'place_reactor', role: 'mentor', focus: 'stoich_reactor', done: (s) => unitsOfType(s, 'stoich_reactor').length >= 1 },
  { id: 'pipe_up', role: 'mentor', done: (s) => s.flowsheet.streams.length >= 6 },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_tank', role: 'mentor', focus: 'product', done: LATE(['read_tank', 'open_stream', 'why']) },
  { id: 'open_stream', role: 'mentor', done: LATE(['open_stream', 'why']) },
  { id: 'why', role: 'mentor', done: LATE(['why']) },
];

/** The build of the bench plant as the actions a player makes, in the order the coach teaches (unit ids follow from the placement order). */
export function benchBuild(n2Kg: number, h2Kg: number): Action[] {
  return [
    { name: 'placeUnit', args: ['feed', 0, 0, 0] }, { name: 'placeUnit', args: ['feed', 0, 4, 0] }, { name: 'placeUnit', args: ['mixer', 4, 2, 0] },
    { name: 'placeUnit', args: ['stoich_reactor', 8, 0, 0] }, { name: 'placeUnit', args: ['nh3_sep', 14, 0, 0] }, { name: 'placeUnit', args: ['product', 18, 0, 0] },
    { name: 'placeUnit', args: ['vent', 18, 4, 0] },
    { name: 'setBank', args: ['F-101', 'N2', n2Kg] }, { name: 'setBank', args: ['F-102', 'H2', h2Kg] },
    { name: 'connect', args: ['F-101', 'out', 'M-103', 'in1'] }, { name: 'connect', args: ['F-102', 'out', 'M-103', 'in2'] }, { name: 'connect', args: ['M-103', 'out', 'R-104', 'in'] },
    { name: 'connect', args: ['R-104', 'out', 'D-105', 'in'] }, { name: 'connect', args: ['D-105', 'liq', 'T-106', 'in'] }, { name: 'connect', args: ['D-105', 'vap', 'Y-107', 'in'] },
    { name: 'commission' },
  ];
}

/** A persona that plays a fixed script once (first turn) and then waits. */
export const scripted = (script: Action[]) => () => {
  let done = false;
  return () => { if (done) return []; done = true; return script; };
};

