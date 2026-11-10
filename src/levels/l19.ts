// L19 · Close the Loop (DESIGN 2.6 chapter 5). The fresh gas (250 kmol/h N2 + 750 kmol/h H2, no inerts yet) meets an equilibrium converter at 450 C and 150 bar
// that turns only part of it into NH3 per pass. Build the loop: converter -> cooling water -> ideal NH3 separator -> recycle compressor -> back to the mixer.
// This file also holds the loop measures and helpers L20 and L21 share (the same loop, with argon and a real flash).
import type { Action } from '@core/kit';
import { fmtNumber, plumbing } from '../engine/solved';
import { t } from '../i18n';
import type { StreamState } from '../sim/types';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, flowOf, inStream, intoType, predictionOf, putFeed, relErr, sealSetup, shown, spentOf, toKgH, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L19_SPECIES = ['N2', 'H2', 'NH3'];
export const LOOP_SPECIES = ['N2', 'H2', 'Ar', 'NH3'];
/** Fresh gas of the chapter, kmol/h (DESIGN: 250 N2 + 750 H2; the nitrogen cylinder carries 3 kmol/h of argon from L20 on). */
export const N2_FRESH = 250, H2_FRESH = 750, AR_FRESH = 3;
/** The loop runs at 150 bar; the converter and the separator drop a little, the recycle compressor makes it up. */
export const P_LOOP = 1.5e7, DP_RX = 3e5, T_RX = 723.15, T_CW = 313.15, T_SEP = 253.15;
export const CONV_MIN = 97, NH3_MIN_T_H = 8.0;
const AR_MAX_PCT = 10;
void AR_MAX_PCT;

/** Bench prices (GAME, UNVERIFIED) of the units a loop needs; the chapter's feeds and tank are included so the budget is the whole plant. */
export const LOOP_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 6000 }, mixer: { max: 1, price: 3000 }, mixer3: { max: 1, price: 4000 }, eq_reactor: { max: 1, price: 40000 }, cooler: { max: 1, price: 8000 },
  nh3_sep: { max: 1, price: 12000 }, compressor: { max: 1, price: 30000 }, product: { max: 1, price: 5000 }, vent: { max: 1, price: 1500 },
};
export const L19_BUDGET = 120000;
export const LOOP_PRESETS: Record<string, Record<string, number | string>> = {
  eq_reactor: { reactions: 'R1', mode: 'isothermal', T: T_RX, dP: DP_RX },
  cooler: { T: T_CW, utility: 'cw' }, nh3_sep: { T: T_SEP }, compressor: { P: P_LOOP, stages: 1 },
};

/** Compressor shaft power (kW) and cost per tonne of the reference loop (GAME, calibrated from the solver design, x 1.03 and x 1.05; UNVERIFIED). */
export const L19_REF = { recycle: 1891.83, kw: 29.88, cost: 338.79 };
export const L19_KW_MAX = L19_REF.kw * 1.05, L19_COST_MAX = L19_REF.cost * 1.03;

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

/** A solved stream leaving `unitId` at `port` (undefined before a solve). */
export function outStream(s: S, unitId: string, port: string): StreamState | undefined {
  if (!s.solved || !s.solved.ok) return undefined;
  const id = plumbing(s).outPipe(unitId, port);
  return id === undefined ? undefined : s.solved.streams[id];
}
const total = (st: StreamState | undefined): number => (st === undefined ? 0 : st.n.reduce((a, b) => a + b, 0));

/** Everything the three loop levels read off the plant (kmol/h, t/h, %). Fed numbers come from the feed specs, the rest from the solve. */
export function loopMeasures(s: S): Measures {
  const n2Fed = toKmolH(fedOf(s, 'N2')), h2Fed = toKmolH(fedOf(s, 'H2')), arFed = toKmolH(fedOf(s, 'Ar'));
  const spl = unitsOfType(s, 'splitter')[0];
  const v: Record<string, number> = {
    n2_fed: n2Fed, h2_fed: h2Fed, ar_fed: arFed, purge_pct: spl !== undefined && typeof spl.params.frac === 'number' ? spl.params.frac * 100 : 0,
    nh3_kmol_h: 0, nh3_t_h: 0, conv_pass: 0, conv_overall: 0, loop_kmol_h: 0, recycle_kmol_h: 0, recycle_n2: 0, ar_in_pct: 0, nh3_in_pct: 0, vent_n2: 0, vent_kmol_h: 0, h2_lost_pct: 0,
    purge_kmol_h: 0, ar_purge_pct: 0, nh3_purge_pct: 0, flash_nh3_pct: 0, chiller_c: 0, cost_per_t: 0, shaft_kw: 0, product_t_h: 0, ar_in_kmol_h: 0, closed: 0,
  };
  const flash = unitsOfType(s, 'flash')[0];
  if (flash !== undefined && typeof flash.params.T === 'number') v.chiller_c = flash.params.T - 273.15;
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const rx = unitsOfType(s, 'eq_reactor')[0], comp = unitsOfType(s, 'compressor')[0];
  const rin = rx !== undefined ? inStream(s, rx.id) : undefined, rout = rx !== undefined ? outStream(s, rx.id, 'out') : undefined;
  const nin = flowOf(s, rin, 'N2'), nout = flowOf(s, rout, 'N2');
  v.conv_pass = nin > 0 ? ((nin - nout) / nin) * 100 : 0;
  v.loop_kmol_h = toKmolH(total(rin));
  v.ar_in_pct = total(rin) > 0 ? (flowOf(s, rin, 'Ar') / total(rin)) * 100 : 0;
  v.ar_in_kmol_h = toKmolH(flowOf(s, rin, 'Ar'));
  v.nh3_in_pct = total(rin) > 0 ? (flowOf(s, rin, 'NH3') / total(rin)) * 100 : 0;
  const cin = comp !== undefined ? inStream(s, comp.id) : undefined;
  v.recycle_kmol_h = toKmolH(total(cin)); v.recycle_n2 = toKmolH(flowOf(s, cin, 'N2'));
  v.closed = comp !== undefined && v.recycle_kmol_h > 0 ? 1 : 0;
  v.nh3_kmol_h = toKmolH(intoType(s, 'product', 'NH3')); v.nh3_t_h = toKgH(intoType(s, 'product', 'NH3'), 'NH3') / 1000;
  v.vent_n2 = toKmolH(intoType(s, 'vent', 'N2'));
  const vent = unitsOfType(s, 'vent')[0], vin = vent !== undefined ? inStream(s, vent.id) : undefined;
  v.vent_kmol_h = toKmolH(total(vin));
  v.purge_kmol_h = v.vent_kmol_h;
  v.h2_lost_pct = h2Fed > 0 ? (toKmolH(intoType(s, 'vent', 'H2')) / h2Fed) * 100 : 0;
  v.ar_purge_pct = total(vin) > 0 ? (flowOf(s, vin, 'Ar') / total(vin)) * 100 : 0;
  v.nh3_purge_pct = total(vin) > 0 ? (flowOf(s, vin, 'NH3') / total(vin)) * 100 : 0;
  v.conv_overall = n2Fed > 0 ? Math.max(0, (1 - v.vent_n2 / n2Fed) * 100) : 0;
  if (flash !== undefined) { const fv = outStream(s, flash.id, 'vap'); v.flash_nh3_pct = total(fv) > 0 ? (flowOf(s, fv, 'NH3') / total(fv)) * 100 : 0; }
  const k = s.solved.kpis;
  v.cost_per_t = k.cost_usd_per_t ?? 0; v.shaft_kw = k.shaft_kw ?? 0; v.product_t_h = k.product_t_per_h ?? 0;
  return { ok: true, v };
}

const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'place_reactor', role: 'mentor', focus: 'eq_reactor', done: (s) => unitsOfType(s, 'eq_reactor').length >= 1 },
  { id: 'place_sep', role: 'mentor', focus: 'nh3_sep', done: (s) => unitsOfType(s, 'nh3_sep').length >= 1 },
  { id: 'place_comp', role: 'mentor', focus: 'compressor', done: (s) => unitsOfType(s, 'compressor').length >= 1 },
  { id: 'close_loop', role: 'mentor', done: (s) => { const k = unitsOfType(s, 'compressor')[0]; return k !== undefined && s.flowsheet.streams.some((p) => p.from.unit === k.id); } },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_loop', role: 'mentor', done: LATE(['read_loop', 'why']) },
  { id: 'why', role: 'mentor', done: LATE(['why']) },
];

const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);

export const L19: LevelSpec = {
  id: 'L19', firstRun: true, chapter: 5, index: 19, setter: 'manager', budgetUSD: L19_BUDGET, units: LOOP_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L19_SPECIES, LOOP_UNITS, LOOP_PRESETS);
    putFeed(s, 0, 0, { N2: 1 }, N2_FRESH, 300, P_LOOP);
    putFeed(s, 0, 4, { H2: 1 }, H2_FRESH, 300, P_LOOP, 'hydrogen');
    sealSetup(s);
  },
  measures: loopMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'conv', met: m.ok && m.v.conv_overall! >= CONV_MIN, ...(m.ok ? { value: m.v.conv_overall } : {}), target: CONV_MIN },
      { key: 'nh3', met: m.ok && m.v.nh3_t_h! >= NH3_MIN_T_H, ...(m.ok ? { value: m.v.nh3_t_h } : {}), target: NH3_MIN_T_H },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, LOOP_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L19_BUDGET, value: sp, target: L19_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.shaft_kw! <= L19_KW_MAX, m.ok && m.v.cost_per_t! <= L19_COST_MAX],
  callIt: { key: 'recycle_kmol_h', unit: 'kmol/h', tol: 0.02, truth: (_s, m) => (m.ok ? m.v.recycle_kmol_h! : null) },
  hero: (_s, m) => ({ key: 'nh3_t_h', unit: 't/h', value: m.v.nh3_t_h!, lo: NH3_MIN_T_H, hi: 9 }),
  secondary: (_s, m) => ({ key: 'conv_overall', unit: '%', value: m.v.conv_overall!, limit: CONV_MIN }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'open', legend: t('lv.L19.ann.open'), state: lit(m, m.v.closed === 1, 'critical') },
      { key: 'vent', legend: t('lv.L19.ann.vent'), state: lit(m, m.v.vent_n2! < 1e-6) },
      { key: 'conv', legend: t('lv.L19.ann.conv'), state: lit(m, g.find((x) => x.key === 'conv')!.met) },
      { key: 'nh3', legend: t('lv.L19.ann.nh3'), state: lit(m, g.find((x) => x.key === 'nh3')!.met) },
      { key: 'solve', legend: t('lv.L19.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L19.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.closed !== 1) return { key: 'open_loop', cause: t('lv.L19.cause.open_loop', { x: f(s, m.v.conv_pass!), conv: f(s, m.v.conv_overall!), vent: f(s, m.v.vent_n2!), fed: f(s, m.v.n2_fed!) }) };
    if (m.v.conv_overall! < CONV_MIN) return { key: 'leak', cause: t('lv.L19.cause.leak', { conv: f(s, m.v.conv_overall!), vent: f(s, m.v.vent_n2!) }) };
    return { key: 'short', cause: t('lv.L19.cause.short', { nh3: f(s, m.v.nh3_t_h!), want: f(s, NH3_MIN_T_H) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.conv_pass! > 0) || !(m.v.n2_fed! > 0)) return null;
    const F = shown(m.v.n2_fed!), X = shown(m.v.conv_pass! / 100);
    return `${f(s, F)} × (1 − ${f(s, X)}) ÷ ${f(s, X)} = ${f(s, shown((F * (1 - X)) / X))} kmol/h of N₂ round the loop`;
  },
  lessonVars: (s, m) => ({
    pass: f(s, m.v.conv_pass!), conv: f(s, m.v.conv_overall!), recycle: f(s, m.v.recycle_kmol_h!), n2: f(s, m.v.n2_fed!), loop: f(s, m.v.loop_kmol_h!), nh3: f(s, m.v.nh3_t_h!),
  }),
  metrics: (_s, m) => [
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
    { key: 'recycle_kmol_h', unit: 'kmol/h', value: m.v.recycle_kmol_h! },
    { key: 'conv_overall', unit: '%', value: m.v.conv_overall! },
  ],
  histogram: { metric: 'cost_per_t', best: () => L19_REF.cost, spread: 0.08, lowerIsBetter: true },
  solver: () => scripted(loopBuild(L19_REF.recycle, true))(),
  naive: () => scripted(loopBuild(0, false))(),
};

/** The player's build of the L19 loop as actions (ids follow the placement order after the two pre-placed feeds F-101, F-102). `closed` false is the open-loop
 *  novice: a two-inlet mixer, and the separator gas goes to the vent. */
export function loopBuild(callIt: number, closed: boolean): Action[] {
  const a: Action[] = [];
  if (callIt > 0) a.push({ name: 'callIt', args: [callIt] });
  a.push(
    { name: 'placeUnit', args: [closed ? 'mixer3' : 'mixer', 5, 2, 0] }, { name: 'placeUnit', args: ['eq_reactor', 9, 0, 0] }, { name: 'placeUnit', args: ['cooler', 14, 1, 0] },
    { name: 'placeUnit', args: ['nh3_sep', 17, 1, 0] }, { name: 'placeUnit', args: [closed ? 'compressor' : 'vent', closed ? 9 : 21, closed ? 8 : 6, 0] }, { name: 'placeUnit', args: ['product', 21, 1, 0] },
    { name: 'connect', args: ['F-101', 'out', 'M-103', 'in1'] }, { name: 'connect', args: ['F-102', 'out', 'M-103', 'in2'] }, { name: 'connect', args: ['M-103', 'out', 'R-104', 'in'] },
    { name: 'connect', args: ['R-104', 'out', 'C-105', 'in'] }, { name: 'connect', args: ['C-105', 'out', 'D-106', 'in'] }, { name: 'connect', args: ['D-106', 'liq', 'T-108', 'in'] },
  );
  if (closed) a.push({ name: 'connect', args: ['D-106', 'vap', 'K-107', 'in'] }, { name: 'connect', args: ['K-107', 'out', 'M-103', 'in3'] });
  else a.push({ name: 'connect', args: ['D-106', 'vap', 'Y-107', 'in'] });
  a.push({ name: 'commission' });
  return a;
}
