// L22 · The Methanol Loop (DESIGN 2.6 chapter 5; K3 Vanden Bussche-Froment on Cu/ZnO/Al2O3). Syngas (H2 70 / CO 10 / CO2 5 / inerts 15 %, 70 bar) goes round a loop: mixer, fired
// heater to 250 C, the COOLED TUBULAR REACTOR the player places, water cooler, crude flash at 40 C, purge, recycle compressor. The reactor is where the level lives: the exotherm
// makes a hot spot near the tube inlet (about 298 C at the default 250 C coolant) and the copper sinters above 280 C. The player sets the coolant (boiling-water) temperature,
// the catalyst load and the purge; the shift (feed_inerts, catalyst_age, cw_hot_day) is the dynamic layer of data/events.ts. Goals: crude methanol at the target rate with a carbon
// efficiency of 85 %; star 2: the catalyst never above 280 C; star 3: $/t at or under the calibrated best. Call-it: the stoichiometric number SN = (H2 - CO2)/(CO + CO2) of the fresh gas.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, flowOf, fedOf, inStream, intoType, link, predictionOf, put, putFeed, markPrebuilt, relErr, sealSetup, shown, spentOf, toKgH, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L22_SPECIES = ['H2', 'CO', 'CO2', 'N2', 'CH3OH', 'H2O'];
export const L22_FEED_X = { H2: 0.7, CO: 0.1, CO2: 0.05, N2: 0.15 };
export const L22_FEED_KMOL_H = 600;
export const P_LOOP = 7e6, P_FLASH = 6.8e6, T_IN = 523.15, T_FLASH = 313.15;
export const L22_SINTER_K = 553.15;
export const L22_CARBON_MIN = 85;
/** Calibrated reference (GAME, UNVERIFIED: the solver's own design, re-derived in ch5.test.ts): coolant, catalyst load, purge, target rate, cost. */
export const L22_REF = { Tc: 493.15, W: 10000, purge: 0.2, meoh: 2.4, cost: 49.27 };
export const L22_MEOH_MIN_T_H = L22_REF.meoh;
export const L22_COST_MAX = L22_REF.cost * 1.03;
export const L22_UNITS: LevelSpec['units'] = { tubular: { max: 1, price: 90000 } };
export const L22_BUDGET = 100000;
const PRESETS = { heater: { T: T_IN, utility: 'fired' }, cooler: { T: T_FLASH, utility: 'cw' }, flash: { T: T_FLASH, P: P_FLASH }, compressor: { P: P_LOOP, stages: 1 }, tubular: { W: 1000, Tc: T_IN, UaW: 12 } };

/** Stoichiometric number of a gas (mole fractions or flows): (H2 - CO2) / (CO + CO2). */
export const stoichNumber = (h2: number, co: number, co2: number): number => (co + co2 > 0 ? (h2 - co2) / (co + co2) : 0);
export const L22_SN = stoichNumber(L22_FEED_X.H2, L22_FEED_X.CO, L22_FEED_X.CO2);

export function buildMethanol(s: EqState, purge: number): void {
  s.palette = null;
  const feed = putFeed(s, 0, 2, L22_FEED_X, L22_FEED_KMOL_H, 298.15, P_LOOP);
  const mix = put(s, 'mixer', 4, 2), heat = put(s, 'heater', 7, 2, { T: T_IN, utility: 'fired' });
  const cool = put(s, 'cooler', 15, 2, { T: T_FLASH, utility: 'cw' }), flash = put(s, 'flash', 18, 2, { T: T_FLASH, P: P_FLASH });
  const split = put(s, 'splitter', 18, 7, { frac: purge }), comp = put(s, 'compressor', 8, 10, { P: P_LOOP, stages: 1 });
  const prod = put(s, 'product', 21, 2), vent = put(s, 'vent', 21, 7);
  link(s, feed, 'out', mix, 'in1'); link(s, mix, 'out', heat, 'in');
  link(s, cool, 'out', flash, 'in'); link(s, flash, 'vap', split, 'in'); link(s, flash, 'liq', prod, 'in');
  link(s, split, 'purge', vent, 'in'); link(s, split, 'out', comp, 'in'); link(s, comp, 'out', mix, 'in2');
  s.palette = ['tubular'];
  markPrebuilt(s);
  sealSetup(s);
}

const tube = (s: S) => unitsOfType(s, 'tubular')[0];
export function methanolMeasures(s: S): Measures {
  const u = tube(s);
  const v: Record<string, number> = {
    tc_c: u && typeof u.params.Tc === 'number' ? (u.params.Tc as number) - 273.15 : 0, w: u && typeof u.params.W === 'number' ? (u.params.W as number) : 0,
    purge_pct: (unitsOfType(s, 'splitter')[0]?.params.frac as number | undefined ?? 0) * 100, sn: L22_SN,
    meoh_t_h: 0, meoh_kmol_h: 0, carbon_eff: 0, hot_c: 0, hot_w: 0, sinter: 0, out_c: 0, x_co2: 0, loop_kmol_h: 0, rx_meoh_pct: 0, cost_per_t: 0, steam_t_h: 0, inert_pct: 0, placed: u ? 1 : 0, sn_in: 0,
  };
  if (s.solved === null || !s.solved.ok || !u) return { ok: false, v };
  const rin = inStream(s, u.id), r = s.solved.units[u.id];
  const tot = (st: { n: number[] } | undefined): number => (st ? st.n.reduce((a, b) => a + b, 0) : 0);
  v.meoh_kmol_h = toKmolH(intoType(s, 'product', 'CH3OH')); v.meoh_t_h = toKgH(intoType(s, 'product', 'CH3OH'), 'CH3OH') / 1000;
  const cFed = fedOf(s, 'CO') + fedOf(s, 'CO2');
  v.carbon_eff = cFed > 0 ? (intoType(s, 'product', 'CH3OH') / cFed) * 100 : 0;
  v.hot_c = (r?.info.Tmax ?? 0) - 273.15; v.hot_w = r?.info.hot_W ?? 0; v.out_c = (r?.info.T_out ?? 0) - 273.15; v.sinter = (r?.info.Tmax ?? 0) > L22_SINTER_K ? 1 : 0;
  v.loop_kmol_h = toKmolH(tot(rin));
  if (rin) {
    const T = tot(rin);
    v.sn_in = stoichNumber(flowOf(s, rin, 'H2'), flowOf(s, rin, 'CO'), flowOf(s, rin, 'CO2'));
    v.inert_pct = T > 0 ? (flowOf(s, rin, 'N2') / T) * 100 : 0;
    const rout = s.solved.streams[Object.keys(s.solved.streams).find((id) => s.flowsheet.streams.find((p) => p.id === id)?.from.unit === u.id) ?? ''];
    v.rx_meoh_pct = rout && tot(rout) > 0 ? (flowOf(s, rout, 'CH3OH') / tot(rout)) * 100 : 0;
  }
  const k = s.solved.kpis; v.cost_per_t = k.cost_usd_per_t ?? 0; v.steam_t_h = k.steam_raised_t_per_h ?? 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const code = (s: S): string => (s.solved !== null && !s.solved.ok ? s.solved.failure?.code ?? '' : '');
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'call_sn', role: 'manager', done: (s) => predictionOf(s, 'sn') !== null || commissions(s) > 0 },
  { id: 'place_tube', role: 'manager', focus: 'tubular', done: (s) => unitsOfType(s, 'tubular').length >= 1 },
  { id: 'pipe_tube', role: 'manager', done: (s) => { const u = tube(s); return u !== undefined && s.flowsheet.streams.some((p) => p.to.unit === u.id) && s.flowsheet.streams.some((p) => p.from.unit === u.id); } },
  { id: 'set_coolant', role: 'manager', focus: 'tubular', done: (s) => { const u = tube(s); return u !== undefined && typeof u.params.W === 'number' && (u.params.W as number) >= 5000 && typeof u.params.Tc === 'number' && (u.params.Tc as number) < T_IN - 0.5; } },
  { id: 'commission', role: 'manager', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_hotspot', role: 'manager', done: LATE(['read_hotspot', 'why']) },
  { id: 'why', role: 'manager', done: LATE(['why']) },
];

export const L22: LevelSpec = {
  id: 'L22', firstRun: true, chapter: 5, index: 22, setter: 'manager', budgetUSD: L22_BUDGET, units: L22_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, L22_SPECIES, L22_UNITS, PRESETS); buildMethanol(s, L22_REF.purge); },
  measures: methanolMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'meoh', met: m.ok && m.v.meoh_t_h! >= L22_MEOH_MIN_T_H, ...(m.ok ? { value: m.v.meoh_t_h } : {}), target: L22_MEOH_MIN_T_H },
      { key: 'carbon', met: m.ok && m.v.carbon_eff! >= L22_CARBON_MIN, ...(m.ok ? { value: m.v.carbon_eff } : {}), target: L22_CARBON_MIN },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L22_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L22_BUDGET, value: sp, target: L22_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.sinter === 0, m.ok && m.v.cost_per_t! <= L22_COST_MAX],
  callIt: { key: 'sn', unit: '', tol: 0.01, truth: () => L22_SN },
  hero: (_s, m) => ({ key: 'meoh_t_h', unit: 't/h', value: m.v.meoh_t_h!, lo: L22_MEOH_MIN_T_H, hi: 3 }),
  secondary: (_s, m) => ({ key: 'hot_c', unit: '°C', value: m.v.hot_c!, limit: L22_SINTER_K - 273.15 }),
  annunciators: (s, m, g): Annunciator[] => [
    { key: 'noexit', legend: t('lv.L22.ann.noexit'), state: code(s) === 'NO_EXIT' ? 'critical' : 'off' },
    { key: 'sinter', legend: t('lv.L22.ann.sinter'), state: lit(m, m.v.sinter === 0, 'critical') },
    { key: 'inerts', legend: t('lv.L22.ann.inerts'), state: lit(m, m.v.inert_pct! <= 40, m.v.inert_pct! > 55 ? 'critical' : 'high') },
    { key: 'carbon', legend: t('lv.L22.ann.carbon'), state: lit(m, g.find((x) => x.key === 'carbon')!.met) },
    { key: 'solve', legend: t('lv.L22.ann.solve'), state: s.solved !== null && !s.solved.ok ? 'critical' : 'off' },
    { key: 'goal', legend: t('lv.L22.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
  ],
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met) && m.v.sinter === 0) return { key: 'pass', cause: null };
    if (m.v.carbon_eff! < L22_CARBON_MIN) return { key: 'leaky', cause: t('lv.L22.cause.leaky', { c: f(s, m.v.carbon_eff!), want: f(s, L22_CARBON_MIN), purge: f(s, m.v.purge_pct!) }) };
    if (m.v.sinter === 1) return { key: 'sintered', cause: t('lv.L22.cause.sintered', { hot: f(s, m.v.hot_c!), lim: f(s, L22_SINTER_K - 273.15), tc: f(s, m.v.tc_c!), w: f(s, m.v.hot_w!) }) };
    return { key: 'short', cause: t('lv.L22.cause.short', { meoh: f(s, m.v.meoh_t_h!), want: f(s, L22_MEOH_MIN_T_H), tc: f(s, m.v.tc_c!) }) };
  },
  equation: (s) => {
    const h = shown(L22_FEED_X.H2 * 100), c = shown(L22_FEED_X.CO * 100), d = shown(L22_FEED_X.CO2 * 100);
    return `(${f(s, h)} − ${f(s, d)}) ÷ (${f(s, c)} + ${f(s, d)}) = ${f(s, shown((h - d) / (c + d)))} stoichiometric number of the fresh gas`;
  },
  lessonVars: (s, m) => ({ hot: f(s, m.v.hot_c!), tc: f(s, m.v.tc_c!), lim: f(s, L22_SINTER_K - 273.15), meoh: f(s, m.v.meoh_t_h!), c: f(s, m.v.carbon_eff!), purge: f(s, m.v.purge_pct!), sn: f(s, L22_SN), loop: f(s, m.v.loop_kmol_h!) }),
  metrics: (_s, m) => [
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
    { key: 'hot_c', unit: '°C', value: m.v.hot_c! },
    { key: 'carbon_eff', unit: '%', value: m.v.carbon_eff! },
  ],
  histogram: { metric: 'cost_per_t', best: () => L22_REF.cost, spread: 0.06, lowerIsBetter: true },
  solver: () => scripted(methanolScript(L22_REF.Tc, L22_REF.W, L22_REF.purge, true))(),
  naive: () => scripted(methanolScript(T_IN, 1000, 0, false))(),
};
void relErr;

/** The player's play: Call it (SN), place the tube between the heater (H-103) and the cooler (C-104), set coolant, load and purge, commission. The tube is R-118. */
export function methanolScript(Tc: number, W: number, purge: number, callIt: boolean): Action[] {
  const a: Action[] = [];
  if (callIt) a.push({ name: 'callIt', args: [L22_SN] });
  a.push({ name: 'placeUnit', args: ['tubular', 10, 0, 0] }, { name: 'setParam', args: ['R-118', 'Tc', Tc] }, { name: 'setParam', args: ['R-118', 'W', W] });
  a.push({ name: 'setParam', args: ['X-106', 'frac', purge] });
  a.push({ name: 'connect', args: ['H-103', 'out', 'R-118', 'in'] }, { name: 'connect', args: ['R-118', 'out', 'C-104', 'in'] }, { name: 'commission' });
  return a;
}
