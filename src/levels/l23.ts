// L23 · Spirits (DESIGN 2.6 chapter 5, stretch; K8 yeast, shortcut column on the ethanol-water NRTL). The distillery ferments a 150 g/L sugar charge (10 m3/h) and sells the spirit to the
// fuel blenders, who want 99.5 %. The player places a fermenter and a column between the pre-built feed, product tank, vinasse sink and CO2 vent, sets the batch temperature and time (the
// yeast is happy near 32 C, stalls at 42 C and dies at 45 C: YEAST_KILLED) and the distillate purity. Part A: 95 % v/v (92.4 wt %) spirit at the target rate. Part B (the naive persona's
// try): 99.5 wt % hits the azeotrope wall (AZEOTROPE_LIMIT at 94.8 wt % in the model; the measured azeotrope is 95.6 wt %). Call-it: the wall, in mass percent. Star 2: a healthy
// batch (the yeast grew). Star 3: $/t at or under the calibrated best.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { SPECIES } from '../data/species';
import { azeotrope } from '../sim/thermo/nrtl';
import { glucoseFeed } from '../sim/units/fermenter';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, inStream, intoType, predictionOf, putFeed, put, sealSetup, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L23_SPECIES = ['C6H12O6', 'H2O(l)', 'C2H5OH(l)', 'CO2'];
/** Charge: 150 g/L glucose, 10 m3/h (509 kmol/h of solution). */
export const L23_GL = 150, L23_M3_H = 10;
const FEED = glucoseFeed(L23_GL);
export const L23_FEED_KMOL_H = (L23_M3_H * 1000 * (1 / 1000)) * (L23_GL / SPECIES['C6H12O6']!.M + (((1 - L23_GL / 1000 / 1.56) * 0.998 * 1000) / SPECIES['H2O']!.M)) ;
export const L23_T_FEED = 298.15, L23_P = 101325;
/** 95 % v/v spirit is 92.4 wt % ethanol (density tables); the fuel blenders want 99.5 wt %. */
export const L23_SPIRIT_WT = 0.924, L23_FUEL_WT = 0.995;
export const wtToMole = (w: number): number => (w / SPECIES['C2H5OH']!.M) / (w / SPECIES['C2H5OH']!.M + (1 - w) / SPECIES['H2O']!.M);
/** Calibrated reference (GAME, UNVERIFIED, re-derived in ch5.test.ts): batch T and time, spirit purity, reflux multiple, rate target in kL/day of spirit, cost per tonne. */
export const L23_REF = { T: 305.15, time: 81000, xD: wtToMole(0.93), rr: 1.3, kl_day: 18, cost: 177.12 };
export const L23_KL_MIN = L23_REF.kl_day;
const L23_NOT_SPIRIT_WT = 50;
export const L23_COST_MAX = L23_REF.cost * 1.03;
export const L23_UNITS: LevelSpec['units'] = { fermenter: { max: 1, price: 60000 }, column: { max: 1, price: 80000 } };
const PRESETS = { fermenter: { T: 305.15, time: 81000 }, column: { xD: 0.8, rec: 0.99, rr: 1.3 } };

/** Density of an ethanol-water mixture of mass fraction w, kg/L (ideal volumes; GAME). */
export const spiritDensity = (w: number): number => 1 / (w / 0.789 + (1 - w) / 0.997);

export function buildDistillery(s: EqState): void {
  s.palette = null;
  putFeed(s, 0, 4, { C6H12O6: FEED.glucose, 'H2O(l)': FEED.water }, L23_FEED_KMOL_H, L23_T_FEED, L23_P);
  put(s, 'product', 21, 1); put(s, 'sink', 21, 6); put(s, 'vent', 12, 12);
  s.palette = ['fermenter', 'column'];
  sealSetup(s);
}

const fer = (s: S) => unitsOfType(s, 'fermenter')[0], col = (s: S) => unitsOfType(s, 'column')[0];
export function spiritsMeasures(s: S): Measures {
  const u = fer(s), c = col(s);
  const v: Record<string, number> = {
    t_c: u && typeof u.params.T === 'number' ? (u.params.T as number) - 273.15 : 0, time_h: u && typeof u.params.time === 'number' ? (u.params.time as number) / 3600 : 0,
    xd_wt: 0, conv: 0, x_gl: 0, p_gl: 0, eth_t_h: 0, spirit_wt: 0, kl_day: 0, recovery: 0, wall_wt: azeotrope('C2H5OH', 'H2O', L23_P)!.wt * 100, trays: 0, steam_kg_per_l: 0, cost_per_t: 0, reflux: 0, placed: (u ? 1 : 0) + (c ? 1 : 0), beer_wt: 0, stall: 0,
    spec_wt: c && typeof c.params.xD === 'number' ? wtOfMole(c.params.xD as number) * 100 : 0,
  };
  if (s.solved === null || !s.solved.ok || !u || !c) return { ok: false, v };
  const ru = s.solved.units[u.id], rc = s.solved.units[c.id];
  v.conv = ru?.info.conv ?? 0; v.x_gl = ru?.info.X_gL ?? 0; v.p_gl = ru?.info.P_gL ?? 0; v.stall = v.conv < 0.85 ? 1 : 0;
  const eth = intoType(s, 'product', 'C2H5OH(l)'), water = intoType(s, 'product', 'H2O(l)');
  const kgEth = (eth * SPECIES['C2H5OH']!.M) / 1000, kgW = (water * SPECIES['H2O']!.M) / 1000;
  v.eth_t_h = (kgEth * 3.6); v.spirit_wt = kgEth + kgW > 0 ? (kgEth / (kgEth + kgW)) * 100 : 0;
  const rho = spiritDensity(v.spirit_wt / 100);
  v.kl_day = kgEth + kgW > 0 ? (((kgEth + kgW) * 3600 * 24) / rho / 1000) : 0;
  /** Spirit is what the blenders buy: a tank that is mostly water (bottoms piped to it) delivers no spirit. */
  if (v.spirit_wt < L23_NOT_SPIRIT_WT) v.kl_day = 0;
  const made = (ru?.info.eth_mol_s ?? 0);
  v.recovery = made > 0 ? (eth / made) * 100 : 0;
  v.trays = rc?.info.N ?? 0; v.reflux = rc?.info.R ?? 0;
  const k = s.solved.kpis; v.cost_per_t = k.cost_usd_per_t ?? 0;
  const spiritL = (kgEth + kgW) * 3600 / rho; v.steam_kg_per_l = spiritL > 0 ? ((k.steam_bought_t_per_h ?? 0) * 1000) / spiritL : 0;
  const bin = inStream(s, c.id); v.beer_wt = bin ? (bin.n[2]! * SPECIES['C2H5OH']!.M) / Math.max(1e-12, bin.n[1]! * SPECIES['H2O']!.M + bin.n[2]! * SPECIES['C2H5OH']!.M) * 100 : 0;
  return { ok: true, v };
}
const wtOfMole = (x: number): number => (x * SPECIES['C2H5OH']!.M) / (x * SPECIES['C2H5OH']!.M + (1 - x) * SPECIES['H2O']!.M);

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const code = (s: S): string => (s.solved !== null && !s.solved.ok ? s.solved.failure?.code ?? '' : '');
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'call_wall', role: 'safety', done: (s) => predictionOf(s, 'wall_wt') !== null || commissions(s) > 0 },
  { id: 'place_fermenter', role: 'safety', focus: 'fermenter', done: (s) => unitsOfType(s, 'fermenter').length >= 1 },
  { id: 'place_column', role: 'safety', focus: 'column', done: (s) => unitsOfType(s, 'column').length >= 1 },
  { id: 'pipe_up', role: 'safety', done: (s) => s.flowsheet.streams.length >= 5 },
  { id: 'set_batch', role: 'safety', focus: 'fermenter', done: (s) => { const u = fer(s), c = col(s); return u !== undefined && c !== undefined && typeof c.params.xD === 'number' && (c.params.xD as number) >= wtToMole(L23_SPIRIT_WT) - 1e-9; } },
  { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_wall', role: 'safety', done: LATE(['read_wall', 'why']) },
  { id: 'why', role: 'safety', done: LATE(['why']) },
];

export const L23: LevelSpec = {
  id: 'L23', firstRun: true, chapter: 5, index: 23, setter: 'safety', budgetUSD: 0, units: L23_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, L23_SPECIES, L23_UNITS, PRESETS); buildDistillery(s); },
  measures: spiritsMeasures,
  goals: (_s, m) => [
    { key: 'kl', met: m.ok && m.v.kl_day! >= L23_KL_MIN, ...(m.ok ? { value: m.v.kl_day } : {}), target: L23_KL_MIN },
    { key: 'purity', met: m.ok && m.v.spirit_wt! >= L23_SPIRIT_WT * 100 - 0.05, ...(m.ok ? { value: m.v.spirit_wt } : {}), target: L23_SPIRIT_WT * 100 },
  ],
  extraStars: (_s, m) => [m.ok && m.v.stall === 0 && m.v.x_gl! >= 5, m.ok && m.v.cost_per_t! <= L23_COST_MAX],
  callIt: { key: 'wall_wt', unit: '%', tol: 0.01, truth: () => azeotrope('C2H5OH', 'H2O', L23_P)!.wt * 100 },
  hero: (_s, m) => ({ key: 'kl_day', unit: 'kL/day', value: m.v.kl_day!, lo: L23_KL_MIN, hi: L23_KL_MIN * 1.3 }),
  secondary: (_s, m) => ({ key: 'spirit_wt', unit: 'wt %', value: m.v.spirit_wt!, limit: L23_SPIRIT_WT * 100 }),
  annunciators: (s, m, g): Annunciator[] => [
    { key: 'wall', legend: t('lv.L23.ann.wall'), state: code(s) === 'AZEOTROPE_LIMIT' ? 'critical' : 'off' },
    { key: 'yeast', legend: t('lv.L23.ann.yeast'), state: code(s) === 'YEAST_KILLED' ? 'critical' : 'off' },
    { key: 'stall', legend: t('lv.L23.ann.stall'), state: lit(m, m.v.stall === 0) },
    { key: 'purity', legend: t('lv.L23.ann.purity'), state: lit(m, g.find((x) => x.key === 'purity')!.met) },
    { key: 'solve', legend: t('lv.L23.ann.solve'), state: s.solved !== null && !s.solved.ok && !['AZEOTROPE_LIMIT', 'YEAST_KILLED'].includes(code(s)) ? 'critical' : 'off' },
    { key: 'goal', legend: t('lv.L23.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
  ],
  coach: COACH,
  verdict: (s, m, g) => {
    const c = code(s);
    if (c === 'AZEOTROPE_LIMIT') return { key: 'wall', cause: t('lv.L23.cause.wall', { wall: f(s, azeotrope('C2H5OH', 'H2O', L23_P)!.wt * 100), wallmol: f(s, wtToMole(azeotrope('C2H5OH', 'H2O', L23_P)!.wt) * 100) }) };
    if (c === 'YEAST_KILLED') return { key: 'dead', cause: t('lv.L23.cause.dead', { T: f(s, (unitsOfType(s, 'fermenter')[0]?.params.T as number ?? 0) - 273.15) }) };
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.stall === 1) return { key: 'stalled', cause: t('lv.L23.cause.stalled', { conv: f(s, m.v.conv! * 100), T: f(s, m.v.t_c!), h: f(s, m.v.time_h!) }) };
    if (m.v.spirit_wt! < L23_SPIRIT_WT * 100 - 0.05) return { key: 'weak', cause: t('lv.L23.cause.weak', { wt: f(s, m.v.spirit_wt!), want: f(s, L23_SPIRIT_WT * 100) }) };
    return { key: 'short', cause: t('lv.L23.cause.short', { kl: f(s, m.v.kl_day!), want: f(s, L23_KL_MIN) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.p_gl! > 0)) return null;
    const p = Math.round(m.v.p_gl! * 10) / 10;
    return `${f(s, p)} ÷ 150 = ${f(s, Math.round((p / 150) * 1000) / 1000)} g of ethanol per g of glucose, against 0.511 at the stoichiometric best`;
  },
  lessonVars: (s, m) => ({ T: f(s, m.v.t_c!), h: f(s, m.v.time_h!), p: f(s, m.v.p_gl!), conv: f(s, m.v.conv! * 100), wall: f(s, m.v.wall_wt!), wt: f(s, m.v.spirit_wt!), trays: f(s, m.v.trays!), steam: f(s, m.v.steam_kg_per_l!) }),
  metrics: (_s, m) => [
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
    { key: 'steam_kg_per_l', unit: 'kg/L', value: m.v.steam_kg_per_l! },
    { key: 'time_h', unit: 'h', value: m.v.time_h! },
  ],
  histogram: { metric: 'cost_per_t', best: () => L23_REF.cost, spread: 0.06, lowerIsBetter: true },
  solver: () => scripted(spiritsScript(L23_REF.T, L23_REF.time, L23_REF.xD, L23_REF.rr, true))(),
  naive: () => scripted(spiritsScript(L23_REF.T, L23_REF.time, wtToMole(L23_FUEL_WT), 3, false))(),
};

/** The player's play: Call it (the wall), place the fermenter (R-105) and the column (D-106), set batch and purity, pipe, commission. F-101 feed, T-102 tank, N-103 vinasse, Y-104 vent. */
export function spiritsScript(T: number, time: number, xD: number, rr: number, callIt: boolean): Action[] {
  const a: Action[] = [];
  if (callIt) a.push({ name: 'callIt', args: [azeotrope('C2H5OH', 'H2O', L23_P)!.wt * 100] });
  a.push(
    { name: 'placeUnit', args: ['fermenter', 6, 3, 0] }, { name: 'placeUnit', args: ['column', 12, 3, 0] },
    { name: 'setParam', args: ['R-105', 'T', T] }, { name: 'setParam', args: ['R-105', 'time', time] }, { name: 'setParam', args: ['D-106', 'xD', xD] }, { name: 'setParam', args: ['D-106', 'rr', rr] },
    { name: 'connect', args: ['F-101', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'D-106', 'in'] }, { name: 'connect', args: ['R-105', 'vap', 'Y-104', 'in'] },
    { name: 'connect', args: ['D-106', 'vap', 'T-102', 'in'] }, { name: 'connect', args: ['D-106', 'liq', 'N-103', 'in'] }, { name: 'commission' },
  );
  return a;
}
void toKmolH;
