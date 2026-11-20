// L02 · Air Is Mostly Nitrogen (DESIGN 2.6). Sulfur pit (fixed, 100 kmol/h = 3.21 t/h) + air intake -> blower -> mixer -> sulfur burner -> stack.
// Goal: burn 99.9 % of the sulfur, burner gas 10.0 +- 0.5 mol % SO2. Air is 21 % O2 / 79 % N2 (Ar lumped with N2: a Codex note).
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, flowOf, inStream, link, none, predictionOf, put, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType, piped } from './util';

export const L02_SPECIES = ['S', 'O2', 'N2', 'SO2'];
/** DESIGN: 100 kmol/h of liquid sulfur (3.21 t/h). */
export const L02_S_KMOL_H = 100;
export const AIR_O2 = 0.21;
export const BURN_MIN = 0.999;
export const SO2_PCT = 10, SO2_TOL = 0.5;
export const O2_CALL_TOL = 0.02;
const T_PIT = 413.15, P_FEED = 1.1e5;
/** GAME bench prices, USD per unit (UNVERIFIED). */
export const L02_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 4000 }, compressor: { max: 1, price: 40000 }, mixer: { max: 1, price: 3000 }, burner: { max: 1, price: 22000 }, stack: { max: 1, price: 8000 }, product: { max: 0, price: 1 },
};
export const L02_BUDGET = 100000;
const PRESETS = { compressor: { P: P_FEED, stages: 1 } };
const START_AIR = 600;
const REF_AIR = 1000;
const NAIVE_AIR = 400;

export function sulfurMeasures(s: Readonly<import('../state').EqState>): Measures {
  const sFed = toKmolH(fedOf(s, 'S')), o2Fed = toKmolH(fedOf(s, 'O2'));
  const v: Record<string, number> = {
    s_fed: sFed, o2_fed: o2Fed, air: o2Fed / AIR_O2, excess_air: sFed > 0 ? ((o2Fed - sFed) / sFed) * 100 : 0, o2_short: o2Fed < sFed ? 1 : 0,
    s_burned: 0, burn_frac: 0, s_out: 0, fume_pct: 0, so2_pct: 0, o2_pct: 0, blower_kw: 0, total_out: 0,
  };
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const stk = unitsOfType(s, 'stack')[0];
  const st = stk ? inStream(s, stk.id) : undefined;
  if (!st) return { ok: false, v };
  const tot = st.n.reduce((a, b) => a + b, 0);
  v.s_out = toKmolH(flowOf(s, st, 'S'));
  v.s_burned = Math.max(0, sFed - v.s_out);
  v.burn_frac = sFed > 0 ? v.s_burned / sFed : 0;
  v.fume_pct = sFed > 0 ? (v.s_out / sFed) * 100 : 0;
  v.so2_pct = tot > 0 ? (flowOf(s, st, 'SO2') / tot) * 100 : 0;
  v.o2_pct = tot > 0 ? (flowOf(s, st, 'O2') / tot) * 100 : 0;
  v.total_out = toKmolH(tot);
  v.blower_kw = s.solved.kpis.electric_kw ?? 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
type S = Readonly<import('../state').EqState>;
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const COACH: CoachStep[] = [
  { id: 'set_air', role: 'supervisor', focus: 'compressor', done: (s) => has(s, 'compressor') },
  { id: 'place_mixer', role: 'supervisor', focus: 'mixer', done: (s) => has(s, 'mixer') },
  { id: 'place_burner', role: 'supervisor', focus: 'burner', done: (s) => has(s, 'burner') },
  { id: 'place_stack', role: 'supervisor', focus: 'stack', done: (s) => has(s, 'stack') },
  { id: 'pipe_up', role: 'supervisor', done: (s) => piped(s, 5) },
  { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_stack', role: 'supervisor', focus: 'stack', done: (s) => ['read_stack', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'supervisor', done: (s) => s.ui.coachStep === 'why' },
];

/** The scripted build: ids follow from the two pre-placed feeds (F-101 sulfur pit, F-102 air intake). */
function sulfurBuild(air: number): Action[] {
  return [
    { name: 'placeUnit', args: ['compressor', 4, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 2, 0] }, { name: 'placeUnit', args: ['burner', 14, 0, 0] },
    { name: 'placeUnit', args: ['stack', 20, 2, 0] },
    { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] },
    { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'M-104', 'in2'] }, { name: 'connect', args: ['F-101', 'out', 'M-104', 'in1'] },
    { name: 'connect', args: ['M-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'Z-106', 'in'] },
    { name: 'commission' },
  ];
}
/** What the ★★★ answer is for an air flow: O2 mol % in the burner gas (S + O2 -> SO2 keeps the mole count, so the gas is the air). */
const o2PctAt = (air: number): number => ((AIR_O2 * air - L02_S_KMOL_H) / air) * 100;

export const L02: LevelSpec = {
  id: 'L02', firstRun: true, chapter: 1, index: 2, setter: 'supervisor', budgetUSD: L02_BUDGET, units: L02_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L02_SPECIES, L02_UNITS, PRESETS);
    putFeed(s, 0, 0, { S: 1 }, L02_S_KMOL_H, T_PIT, P_FEED, 'sulfur');
    putFeed(s, 0, 4, { O2: AIR_O2, N2: 1 - AIR_O2 }, START_AIR, 298.15, 1e5);
    sealSetup(s);
  },
  measures: sulfurMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'burn', met: m.ok && m.v.s_burned! >= BURN_MIN * L02_S_KMOL_H, ...(m.ok ? { value: m.v.s_burned } : {}), target: BURN_MIN * L02_S_KMOL_H },
      { key: 'so2', met: m.ok && Math.abs(m.v.so2_pct! - SO2_PCT) <= SO2_TOL, ...(m.ok ? { value: m.v.so2_pct } : {}), target: SO2_PCT },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L02_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L02_BUDGET, value: sp, target: L02_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => {
    const p = predictionOf(s, 'o2_pct');
    return [m.ok && m.v.so2_pct! >= SO2_PCT - 1e-6, p !== null && m.ok && relErr(p.value, m.v.o2_pct!) <= O2_CALL_TOL];
  },
  callIt: { key: 'o2_pct', unit: '%', tol: O2_CALL_TOL, truth: (_s, m) => (m.ok ? m.v.o2_pct! : null) },
  hero: (_s, m) => ({ key: 'so2_pct', unit: '%', value: m.v.so2_pct!, lo: SO2_PCT - SO2_TOL, hi: SO2_PCT + SO2_TOL }),
  secondary: (_s, m) => ({ key: 'fume_pct', unit: '%', value: m.v.fume_pct!, limit: (1 - BURN_MIN) * 100 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const so2 = g.find((x) => x.key === 'so2')!;
    return [
      { key: 'fume', legend: t('lv.L02.ann.fume'), state: !m.ok ? 'off' : m.v.fume_pct! <= (1 - BURN_MIN) * 100 ? 'normal' : m.v.fume_pct! > 1 ? 'critical' : 'high' },
      { key: 'so2', legend: t('lv.L02.ann.so2'), state: !m.ok ? 'off' : so2.met ? 'normal' : 'high' },
      { key: 'air', legend: t('lv.L02.ann.air'), state: !m.ok ? 'off' : m.v.o2_short ? 'high' : 'normal' },
      { key: 'solve', legend: t('lv.L02.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L02.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.s_burned! < BURN_MIN * L02_S_KMOL_H) {
      if (m.v.s_fed! < BURN_MIN * L02_S_KMOL_H) return { key: 'short_feed', cause: t('lv.L02.cause.short_feed', { s: f(s, m.v.s_fed!), want: f(s, L02_S_KMOL_H) }) };
      return { key: 'fume', cause: t('lv.L02.cause.fume', { air: f(s, m.v.air!), o2: f(s, m.v.o2_fed!), s: f(s, m.v.s_fed!), left: f(s, m.v.s_out!) }) };
    }
    return m.v.so2_pct! < SO2_PCT
      ? { key: 'so2_low', cause: t('lv.L02.cause.so2_low', { y: f(s, m.v.so2_pct!), air: f(s, m.v.air!), excess: f(s, m.v.excess_air!), kw: f(s, m.v.blower_kw!) }) }
      : { key: 'so2_high', cause: t('lv.L02.cause.so2_high', { y: f(s, m.v.so2_pct!), air: f(s, m.v.air!), excess: f(s, m.v.excess_air!) }) };
  },
  equation: (s, m) => (m.v.s_fed! > 0 ? `${f(s, shown(m.v.s_fed!))} ÷ ${AIR_O2} = ${f(s, shown(shown(m.v.s_fed!) / AIR_O2))} kmol/h of air at the least` : null),
  lessonVars: (s, m) => ({ air: f(s, m.v.air!), o2: f(s, m.v.o2_fed!), s: f(s, m.v.s_fed!), min: f(s, shown(m.v.s_fed! / AIR_O2)), y: f(s, m.v.so2_pct!), excess: f(s, m.v.excess_air!) }),
  metrics: (_s, m) => [
    { key: 'blower_kw', unit: 'kW', value: m.v.blower_kw! },
    { key: 'so2_pct', unit: '%', value: m.v.so2_pct! },
    { key: 'excess_air', unit: '%', value: m.v.excess_air! },
  ],
  histogram: { metric: 'blower_kw', best: (_s, m) => (m.ok && m.v.air! > 0 ? (m.v.blower_kw! / m.v.air!) * (L02_S_KMOL_H / ((SO2_PCT + SO2_TOL) / 100)) : 80), spread: 0.8, lowerIsBetter: true },
  solver: scripted([{ name: 'callIt', args: [o2PctAt(REF_AIR)] }, ...sulfurBuild(REF_AIR)]),
  naive: scripted(sulfurBuild(NAIVE_AIR)),
};
void none; void link; void put;
