// L21 · Cold Enough (DESIGN 2.6, stretch). The L20 loop with its purge set, but the separator is not built: the player places the chiller (refrigerated cooler) and the
// flash drum, sets both to one temperature, and finds out what colder buys (Raoult: y_NH3 = P_sat / P) and costs (refrigeration, a bigger loop). The drum
// is the real flash of L20. The converter is the equilibrium converter (the kinetic converter of L15 is not used: engine note in the chapter-5 report).
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { psatSpecies } from '../sim/thermo/vle';
import type { EqState } from '../state';
import { scripted } from './bench';
import { AR_MAX_PCT, NH3_MIN_T_H, P_RX_OUT, buildLoop } from './l20';
import { DP_RX, LOOP_SPECIES, P_LOOP, T_RX, T_SEP, loopMeasures } from './l19';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, markPrebuilt, predictionOf, shown, spentOf, unitsOfType } from './util';

type S = Readonly<EqState>;
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
/** DESIGN: no more than 3 mol % NH3 in the purge for the second star. */
export const NH3_PURGE_MAX = 3;
/** Reference design: chiller and drum at -20 C, purge 2 %. Calibrated cost (GAME, engine at the reference; UNVERIFIED). */
export const L21_REF = { T: T_SEP, purge: 0.02, cost: 356.21 };
export const L21_COST_MAX = L21_REF.cost * 1.03;
const PRESETS = { eq_reactor: { reactions: 'R1', mode: 'isothermal', T: T_RX, dP: DP_RX }, cooler: { T: T_SEP, utility: 'refrig' }, flash: { T: T_SEP, P: P_RX_OUT }, compressor: { P: P_LOOP, stages: 1 } };
const UNITS: LevelSpec['units'] = { cooler: { max: 2, price: 9000 }, flash: { max: 1, price: 14000 }, product: { max: 1, price: 5000 } };
/** The pre-built loop is already paid for (not counted as spent). The reference design buys the chiller, the drum and the tank = 28 000 USD (GAME, UNVERIFIED). */
export const L21_BUDGET = 36000;
/** Raoult's answer the Call-it asks for: NH3 mol % in the vapour leaving a drum at T (K) and the converter-outlet pressure. */
export const raoultPct = (T: number, P: number = P_RX_OUT): number => (psatSpecies('NH3', T)!.P / P) * 100;

const drumT = (s: S): number => (unitsOfType(s, 'flash')[0]?.params.T as number | undefined) ?? 0;
const chillT = (s: S): number => { const c = unitsOfType(s, 'cooler').filter((u) => u.params.utility === 'refrig')[0]; return (c?.params.T as number | undefined) ?? 0; };
const COACH: CoachStep[] = [
  { id: 'place_flash', role: 'mentor', focus: 'flash', done: (s) => unitsOfType(s, 'flash').length >= 1 },
  { id: 'place_chiller', role: 'mentor', done: (s) => unitsOfType(s, 'cooler').length >= 2 },
  { id: 'same_t', role: 'mentor', focus: 'flash', done: (s) => unitsOfType(s, 'flash').length >= 1 && unitsOfType(s, 'cooler').length >= 2 && Math.abs(drumT(s) - chillT(s)) < 0.5 && s.flowsheet.streams.length >= 11 },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_drum', role: 'mentor', done: (s) => ['read_drum', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'mentor', done: (s) => (s.ui.coachStep ?? '') === 'why' },
];
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);

export const L21: LevelSpec = {
  id: 'L21', firstRun: true, chapter: 5, index: 21, setter: 'mentor', budgetUSD: L21_BUDGET, units: UNITS, designLamps: ['tmatch'], notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, LOOP_SPECIES, UNITS, PRESETS); buildLoop(s, true, L21_REF.purge); markPrebuilt(s); s.limits = { cooler: 2, flash: 1, product: 1 }; s.palette = Object.keys(UNITS); },
  measures: loopMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'nh3', met: m.ok && m.v.nh3_t_h! >= NH3_MIN_T_H, ...(m.ok ? { value: m.v.nh3_t_h } : {}), target: NH3_MIN_T_H },
      { key: 'ar', met: m.ok && m.v.ar_in_pct! <= AR_MAX_PCT, ...(m.ok ? { value: m.v.ar_in_pct } : {}), target: AR_MAX_PCT },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L21_BUDGET, value: sp, target: L21_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.nh3_purge_pct! <= NH3_PURGE_MAX, m.ok && m.v.cost_per_t! <= L21_COST_MAX],
  callIt: { key: 'flash_nh3_pct', unit: '%', tol: 0.03, truth: (_s, m) => (m.ok ? m.v.flash_nh3_pct! : null) },
  hero: (_s, m) => ({ key: 'nh3_t_h', unit: 't/h', value: m.v.nh3_t_h!, lo: NH3_MIN_T_H, hi: 9 }),
  secondary: (_s, m) => ({ key: 'nh3_purge_pct', unit: '%', value: m.v.nh3_purge_pct!, limit: NH3_PURGE_MAX }),
  annunciators: (s, m, g): Annunciator[] => {
    const mismatch = unitsOfType(s, 'flash').length > 0 && unitsOfType(s, 'cooler').length > 1 && Math.abs(drumT(s) - chillT(s)) > 1;
    return [
      { key: 'warm', legend: t('lv.L21.ann.warm'), state: lit(m, m.v.nh3_purge_pct! <= NH3_PURGE_MAX) },
      { key: 'nh3', legend: t('lv.L21.ann.nh3'), state: lit(m, g.find((x) => x.key === 'nh3')!.met) },
      { key: 'ar', legend: t('lv.L21.ann.ar'), state: lit(m, m.v.ar_in_pct! <= AR_MAX_PCT, m.v.ar_in_pct! > 15 ? 'critical' : 'high') },
      { key: 'tmatch', legend: t('lv.L21.ann.tmatch'), state: mismatch ? 'high' : 'off' },
      { key: 'solve', legend: t('lv.L21.ann.solve'), state: s.solved !== null && !s.solved.ok ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L21.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.nh3_t_h! < NH3_MIN_T_H) return { key: 'warm', cause: t('lv.L21.cause.warm', { T: f(s, m.v.chiller_c!), y: f(s, m.v.flash_nh3_pct!), nh3: f(s, m.v.nh3_t_h!), want: f(s, NH3_MIN_T_H) }) };
    return { key: 'ar_high', cause: t('lv.L21.cause.ar_high', { ar: f(s, m.v.ar_in_pct!), max: f(s, AR_MAX_PCT), purge: f(s, m.v.purge_pct!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.flash_nh3_pct! > 0)) return null;
    const p = shown(m.v.flash_nh3_pct!), P = shown(P_RX_OUT / 1e5);
    return `${f(s, shown((p * P) / 100))} ÷ ${f(s, P)} × 100 = ${f(s, p)} mol % NH₃ in the drum gas`;
  },
  lessonVars: (s, m) => ({ T: f(s, m.v.chiller_c!), y: f(s, m.v.flash_nh3_pct!), nh3: f(s, m.v.nh3_t_h!), loop: f(s, m.v.loop_kmol_h!), inl: f(s, m.v.nh3_in_pct!), cost: f(s, m.v.cost_per_t!) }),
  metrics: (_s, m) => [
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
    { key: 'chiller_c', unit: '°C', value: m.v.chiller_c! },
    { key: 'nh3_in_pct', unit: '%', value: m.v.nh3_in_pct! },
  ],
  histogram: { metric: 'cost_per_t', best: () => L21_REF.cost, spread: 0.06, lowerIsBetter: true },
  solver: () => scripted(chillScript(L21_REF.T, true))(),
  naive: () => scripted(chillScript(313.15, false))(),
};

/** Place the chiller (C-116) and the drum (D-117) and the tank (T-118) after the pre-built loop (C-105 is the water cooler), set both temperatures, pipe, commission. */
export function chillScript(T: number, callIt: boolean): Action[] {
  const a: Action[] = [];
  if (callIt) a.push({ name: 'callIt', args: [raoultPct(T)] });
  a.push(
    { name: 'placeUnit', args: ['cooler', 16, 1, 0] }, { name: 'placeUnit', args: ['flash', 19, 1, 0] }, { name: 'placeUnit', args: ['product', 22, 1, 0] },
    { name: 'setParam', args: ['C-116', 'T', T] }, { name: 'setParam', args: ['D-117', 'T', T] },
    { name: 'connect', args: ['C-105', 'out', 'C-116', 'in'] }, { name: 'connect', args: ['C-116', 'out', 'D-117', 'in'] },
    { name: 'connect', args: ['D-117', 'vap', 'X-106', 'in'] }, { name: 'connect', args: ['D-117', 'liq', 'T-118', 'in'] }, { name: 'commission' },
  );
  return a;
}
void predictionOf;
