// L10 · The Wall (DESIGN 2.6 chapter 3). Syngas 1:3, 1000 kmol/h at 25 bar (fixed feed) -> compressor -> isothermal equilibrium converter (ideal catalyst, asleep
// below 380 C) -> ideal NH3 separator -> tank + vent. Goal: at least 20 mol % NH3 at the converter outlet for the least cost (compression + vessel, per tonne of NH3).
// The boundary optimum (380 C, the catalyst's lower limit) is the documented calibration exception of DESIGN 9.6: colder is better for equilibrium, which
// L15 then breaks with kinetics. The vessel rating (100 / 200 / 300 bar class) follows the pressure; above 300 bar the relief lifts. This file also holds the
// helpers the other chapter-3 levels share (outlet streams, cost parts, scripted builds).
import type { Action } from '@core/kit';
import { dmath } from '@core/numerics';
import { reactionOf } from '../data/reactions';
import { fmtNumber, plumbing, pricesOf } from '../engine/solved';
import { t } from '../i18n';
import { lnKOfReaction } from '../sim/chem/reactions';
import { OPERATING_HOURS, PRESSURE_CLASSES, annualisedCapex, capexItem } from '../sim/econ';
import type { StreamState } from '../sim/types';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, flowOf, none, predictionOf, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L10_SPECIES = ['N2', 'H2', 'NH3'];
export const L10_FEED_KMOL_H = 1000;
export const L10_FEED_P = 25e5;
export const L10_Y_MIN = 20;
/** The catalyst is asleep below this (K): 380 C. */
export const T_LIGHT_OFF = 653.15;
export const P_VESSEL_LO = 100;
export const P_VESSEL_MAX = 300;
export const K450_TOL = 0.05;
const T_FEED = 298.15;
/** GAME bench prices, USD per unit (UNVERIFIED). */
export const L10_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 6000 }, compressor: { max: 1, price: 60000 }, eq_reactor: { max: 1, price: 50000 }, nh3_sep: { max: 1, price: 12000 }, product: { max: 1, price: 5000 }, vent: { max: 1, price: 1500 },
};
export const L10_BUDGET = 170000;
export const NH3_PRESETS = { eq_reactor: { reactions: 'R1', mode: 'isothermal', T: T_LIGHT_OFF, Tmin: T_LIGHT_OFF }, compressor: { P: L10_FEED_P, stages: 1 } };
/** Reference design (this engine): 380 C, 54 bar (DESIGN says about 53), two stages, 100-bar vessel. */
export const L10_REF = { T: T_LIGHT_OFF, P: 54e5, stages: 2 };
/** Reference cost parts at the reference design (engine numbers, GAME calibration, UNVERIFIED): shaft kW, bare-module USD of compressor and vessel, NH3 t/h. */
export const L10_REF_PARTS: CostParts = { shaftKW: 766.38, electricKW: 806.72, compCbm: 1240952, vesselCbm: 1043489, nh3TperH: 2.8396 };

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const C = (K: number): number => K - 273.15;
/** K(T) of the reaction `id` (rigorous, dimensionless: bar standard state). */
export const kOf = (id: string, T: number): number => dmath.exp(lnKOfReaction(reactionOf(id), T, 'rigorous'));

/** The stream leaving `unitId` at `port` (solved), or undefined. */
export function outStream(s: S, unitId: string, port = 'out'): StreamState | undefined {
  if (!s.solved || !s.solved.ok) return undefined;
  const id = plumbing(s).outPipe(unitId, port);
  return id === undefined ? undefined : s.solved.streams[id];
}

export interface CostParts { shaftKW: number; electricKW: number; compCbm: number; vesselCbm: number; nh3TperH: number }
/** Cost per tonne of NH3: annualised compressor and converter-vessel capital plus the compressor's electricity, over the annual NH3 (8000 h). USD/t. */
export function costPerT(s: S, p: CostParts, extraUsdH = 0): number {
  if (!(p.nh3TperH > 0)) return 1e9;
  const elec = pricesOf(s).electricity!.value;
  const perH = annualisedCapex(p.compCbm + p.vesselCbm) / OPERATING_HOURS + p.electricKW * elec + extraUsdH;
  return perH / p.nh3TperH;
}

/** Everything L10 and L11 read off the plant. `gasUsdH` is the gas bill (0 in L10). Design-time numbers are valid before a commission. */
export function ammoniaMeasures(s: S, gasUsdH: (s: S) => number = () => 0): Measures {
  const rx = unitsOfType(s, 'eq_reactor')[0], comp = unitsOfType(s, 'compressor')[0];
  const Tk = rx !== undefined && typeof rx.params.T === 'number' ? rx.params.T : 0;
  const Pset = comp !== undefined && typeof comp.params.P === 'number' ? comp.params.P : 0;
  const v: Record<string, number> = {
    t_c: Tk > 0 ? C(Tk) : 0, p_bar: Pset / 1e5, y_pct: 0, nh3_formed: 0, active: 0, k_now: Tk > 0 ? kOf('R1', Tk) * 1e5 : 0, k_380: kOf('R1', T_LIGHT_OFF) * 1e5,
    class: 0, shaft_kw: 0, nh3_t_h: 0, cost_usd_t: 0, gas_usd_h: gasUsdH(s), relief: Pset / 1e5 > P_VESSEL_MAX ? 1 : 0, comp_mw: 0, vessel_cbm: 0,
  };
  if (s.solved === null || !s.solved.ok || rx === undefined) return { ok: false, v };
  const out = outStream(s, rx.id);
  if (out === undefined) return { ok: false, v };
  const tot = out.n.reduce((a, b) => a + b, 0), iN = s.species.indexOf('NH3');
  v.y_pct = tot > 0 ? (out.n[iN]! / tot) * 100 : 0;
  v.nh3_formed = toKmolH(out.n[iN]!);
  v.active = (s.solved.units[rx.id]?.info.active ?? 0) > 0.5 ? 1 : 0;
  const barg = Math.max(0, (out.P - 101325) / 1e5);
  v.p_bar = out.P / 1e5;
  v.class = PRESSURE_CLASSES.find((c) => barg <= c) ?? 0;
  v.relief = v.class === 0 ? 1 : 0;
  const cu = comp !== undefined ? s.solved.units[comp.id] : undefined;
  const shaft = cu?.info.shaft_kW ?? 0, elec = cu?.info.electric_kW ?? 0;
  v.shaft_kw = shaft; v.comp_mw = shaft / 1000;
  const prod = unitsOfType(s, 'product')[0];
  const pin = prod !== undefined && plumbing(s).inPipe(prod.id, 'in') !== undefined ? s.solved.streams[plumbing(s).inPipe(prod.id, 'in')!] : undefined;
  // the tank's NH3, or (no tank piped) what the converter makes: a plant with no tank must not divide its cost by zero tonnes ($1,000,000,000/t on the slip, round 7)
  v.nh3_t_h = pin !== undefined ? (flowOf(s, pin, 'NH3') * 17.031 * 3.6) / 1000 : (v.nh3_formed * 17.031) / 1000;
  const compCbm = shaft > 0 ? (() => { const c = capexItem({ type: 'compressor', size: shaft, pBarg: barg }); return c.ok ? c.value.cbm : 0; })() : 0;
  const volM3 = (tot * 8.314 * out.T) / out.P * 60;
  const vesselCbm = v.class > 0 ? (() => { const c = capexItem({ type: 'converter', size: volM3, pBarg: barg }); return c.ok ? c.value.cbm : 0; })() : 0;
  v.vessel_cbm = vesselCbm;
  v.cost_usd_t = costPerT(s, { shaftKW: shaft, electricKW: elec, compCbm, vesselCbm, nh3TperH: v.nh3_t_h }, v.gas_usd_h);
  return { ok: true, v };
}

/** Reference cost (USD/t) of a state's prices from the stored reference parts of a level. */
export const refCost = (s: S, parts: CostParts, extraUsdH = 0): number => costPerT(s, parts, extraUsdH);

// ------------------------------------------------------------------------------------------------ L10
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const COACH: CoachStep[] = [
  { id: 'place_comp', role: 'manager', focus: 'compressor', done: (s) => has(s, 'compressor') },
  { id: 'place_conv', role: 'manager', focus: 'eq_reactor', done: (s) => has(s, 'eq_reactor') },
  { id: 'pipe_up', role: 'manager', done: (s) => s.flowsheet.streams.length >= 5 },
  { id: 'commission', role: 'manager', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'pin_window', role: 'manager', focus: 'eq_reactor', done: (s) => s.ui.pinned.includes('eqwin') || ['pin_window', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'manager', done: (s) => s.ui.coachStep === 'why' },
];

/** Place and wire the NH3 plant (compressor, converter, separator, tank, vent) after `feedIds`; unit ids follow the order of placement. */
export function ammoniaBuild(feedIds: string[], T: number, P: number, stages: number, first: number): Action[] {
  const id = (n: number, ch: string): string => `${ch}-${n}`;
  const nf = feedIds.length;
  const mixer = nf > 1;
  let k = first;   // next id number
  const out: Action[] = [];
  const names: Record<string, string> = {};
  const place = (type: string, ch: string, x: number, y: number): void => { out.push({ name: 'placeUnit', args: [type, x, y, 0] }); names[type] = id(k++, ch); };
  if (mixer) place('mixer3', 'M', 4, 2);
  place('compressor', 'K', 8, 2); place('eq_reactor', 'R', 12, 0); place('nh3_sep', 'D', 17, 0); place('product', 'T', 21, 0); place('vent', 'Y', 21, 4);
  out.push({ name: 'setParam', args: [names.compressor!, 'P', P] }, { name: 'setParam', args: [names.compressor!, 'stages', stages] }, { name: 'setParam', args: [names.eq_reactor!, 'T', T] });
  if (mixer) feedIds.forEach((fid, i) => out.push({ name: 'connect', args: [fid, 'out', names.mixer3!, 'in' + (i + 1)] }), out.push({ name: 'connect', args: [names.mixer3!, 'out', names.compressor!, 'in'] }));
  else out.push({ name: 'connect', args: [feedIds[0]!, 'out', names.compressor!, 'in'] });
  out.push({ name: 'connect', args: [names.compressor!, 'out', names.eq_reactor!, 'in'] }, { name: 'connect', args: [names.eq_reactor!, 'out', names.nh3_sep!, 'in'] },
    { name: 'connect', args: [names.nh3_sep!, 'liq', names.product!, 'in'] }, { name: 'connect', args: [names.nh3_sep!, 'vap', names.vent!, 'in'] }, { name: 'commission' });
  return out;
}

/** Call-it truth: K of N2 + 3H2 = 2NH3 at 450 C (rigorous), in units of 1e-5 bar^-2. */
export const K450_E5 = (): number => kOf('R1', 450 + 273.15) * 1e5;

export const L10: LevelSpec = {
  id: 'L10', firstRun: true, chapter: 3, index: 10, setter: 'manager', budgetUSD: L10_BUDGET, units: L10_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L10_SPECIES, L10_UNITS, NH3_PRESETS);
    putFeed(s, 0, 0, { N2: 0.25, H2: 0.75 }, L10_FEED_KMOL_H, T_FEED, L10_FEED_P);
    sealSetup(s);
  },
  measures: (s) => ammoniaMeasures(s),
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'y', met: m.ok && m.v.y_pct! >= L10_Y_MIN - 1e-9, ...(m.ok ? { value: m.v.y_pct } : {}), target: L10_Y_MIN },
      { key: 'vessel', met: m.ok && m.v.relief === 0, ...(m.ok ? { value: m.v.p_bar } : {}), target: P_VESSEL_MAX },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L10_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L10_BUDGET, value: sp, target: L10_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.class > 0 && m.v.class <= P_VESSEL_LO, m.ok && m.v.cost_usd_t! <= refCost(s, L10_REF_PARTS) * 1.03],
  callIt: { key: 'k450_e5', unit: '1e-5 bar⁻²', tol: K450_TOL, truth: () => K450_E5() },
  hero: (_s, m) => ({ key: 'y_nh3', unit: '%', value: m.v.y_pct!, lo: L10_Y_MIN, hi: 100 }),
  secondary: (_s, m) => ({ key: 'p_bar', unit: 'bar', value: m.v.p_bar!, limit: P_VESSEL_LO }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const y = g.find((x) => x.key === 'y')!;
    return [
      { key: 'y', legend: t('lv.L10.ann.y'), state: !m.ok ? 'off' : y.met ? 'normal' : m.v.y_pct! < 10 ? 'critical' : 'high' },
      { key: 'asleep', legend: t('lv.L10.ann.asleep'), state: !m.ok ? 'off' : m.v.active ? 'normal' : 'high' },
      { key: 'wall', legend: t('lv.L10.ann.wall'), state: !m.ok ? 'off' : m.v.t_c! >= 450 ? 'high' : 'normal' },
      { key: 'vessel', legend: t('lv.L10.ann.vessel'), state: !m.ok ? 'off' : m.v.class === 0 ? 'off' : m.v.class > P_VESSEL_LO ? 'high' : 'normal' },
      { key: 'relief', legend: t('lv.L10.ann.relief'), state: !m.ok ? 'off' : m.v.relief ? 'critical' : 'normal' },
      { key: 'solve', legend: t('lv.L10.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L10.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.relief) return { key: 'relief', cause: t('lv.L10.cause.relief', { P: f(s, m.v.p_bar!), max: P_VESSEL_MAX }) };
    if (!m.v.active) return { key: 'asleep', cause: t('lv.L10.cause.asleep', { T: f(s, m.v.t_c!), min: f(s, C(T_LIGHT_OFF)) }) };
    const vars = { y: f(s, m.v.y_pct!), T: f(s, m.v.t_c!), P: f(s, m.v.p_bar!), K: f(s, m.v.k_now!), K380: f(s, m.v.k_380!), want: L10_Y_MIN };
    return m.v.t_c! >= 450 ? { key: 'wall', cause: t('lv.L10.cause.wall', vars) } : { key: 'low_p', cause: t('lv.L10.cause.low_p', vars) };
  },
  equation: (s, m) => {
    if (!m.ok || !m.v.active) return null;
    const out = outStream(s, unitsOfType(s, 'eq_reactor')[0]!.id)!;
    const tot = out.n.reduce((a, b) => a + b, 0), P = out.P / 1e5;
    const p = (id: string): number => shown((flowOf(s, out, id) / tot) * P);
    const pA = p('NH3'), pN = p('N2'), pH = p('H2');
    if (!(pA > 0 && pN > 0 && pH > 0)) return null;
    return `${f(s, pA)} × ${f(s, pA)} ÷ (${f(s, pN)} × ${f(s, pH)} × ${f(s, pH)} × ${f(s, pH)}) × 100000 = ${f(s, shown(((pA * pA) / (pN * pH * pH * pH)) * 1e5))} (K in 10⁻⁵ bar⁻²)`;
  },
  lessonVars: (s, m) => ({ y: f(s, m.v.y_pct!), T: f(s, m.v.t_c!), P: f(s, m.v.p_bar!), K: f(s, m.v.k_now!), K380: f(s, m.v.k_380!), kw: f(s, m.v.shaft_kw!) }),
  metrics: (_s, m) => [
    { key: 'cost_usd_t', unit: 'USD/t', value: m.v.cost_usd_t! },
    { key: 'comp_mw', unit: 'MW', value: m.v.comp_mw! },
    { key: 'y_pct', unit: '%', value: m.v.y_pct! },
  ],
  histogram: { metric: 'cost_usd_t', best: (s) => refCost(s, L10_REF_PARTS), spread: 0.5, lowerIsBetter: true },
  solver: scripted([{ name: 'callIt', args: [K450_E5()] }, ...ammoniaBuild(['F-101'], L10_REF.T, L10_REF.P, L10_REF.stages, 102)]),
  /** The wall: hot and barely compressed (500 C, 30 bar). */
  naive: scripted(ammoniaBuild(['F-101'], 773.15, 30e5, 1, 102)),
};
void none; void predictionOf; void relErr; void T_LIGHT_OFF;
