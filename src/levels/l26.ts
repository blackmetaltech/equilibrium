// L26 · Inside the Envelope (DESIGN 2.6 chapter 6, stretch). A medium-pressure nitric acid line: NH3 vapour and hot air meet at the gauze burner (K9: NO yield by the BREF band, N2 and N2O
// when the gauze runs cold), a waste-heat boiler, the water cooler, NO -> NO2 (R8) and a fixed-recovery absorber to 60 % acid. The pre-built plant leaves the gauze burner (and the optional
// N2O abater) to the player, who also sets the air flow (the NH3 fraction) and the air preheat. The mixture must stay out of the ICI flammable envelope at its own temperature
// (EXPLOSIVE_MIXTURE is an incident); the design rule is at most 11 % NH3; the gauze must run in its band. Goals: NO yield >= 95 %, NH3 in the mix <= 11 %, N2O <= 2.5 kg per t HNO3
// (it takes the abater). Star 2: N2O inside the BAT band (<= the pack's upper limit, 0.6 kg/t). Star 3: $/t at or under the calibrated best. Call-it: the gauze exit temperature.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { REGIONS } from '../regions';
import type { EqRegionData } from '../regions/data';
import { SPECIES } from '../data/species';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, BuildStep, CoachStep, LevelSpec, Measures } from './spec';
import { fromKmolH, baseSetup, commissions, fedOf, inStream, intoType, link, markPrebuilt, predictionOf, put, putFeed, sealSetup, spentOf, toKgH, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L26_SPECIES = ['NH3', 'O2', 'N2', 'NO', 'NO2', 'N2O', 'H2O', 'HNO3(l)', 'H2O(l)'];
export const L26_P = 4e5, L26_NH3_KMOL_H = 70;
export const L26_YIELD_MIN = 95, L26_NH3_MAX_PCT = 11, L26_N2O_MAX = 2.5, L26_HNO3_MIN_T_H = 3.8;
/** Calibrated reference (GAME, UNVERIFIED, re-derived in ch6.test.ts): air flow (kmol/h), preheat (K), abater fraction, gauze exit (deg C), cost. */
export const L26_REF = { air: 630, preheat: 473.15, X: 0.95, t_c: 860.46, cost: 63.83 };
export const L26_COST_MAX = L26_REF.cost * 1.03;
/** Bench prices (GAME, UNVERIFIED). One rule for the money: the pre-built line (230 000) is already paid for (markPrebuilt) and is not counted as spent; the Engineer budget is what the player adds, the gauze burner (70 000) and the abater (40 000), with head-room. */
export const L26_UNITS: LevelSpec['units'] = {
  gauze_burner: { max: 1, price: 70000 }, n2o_abater: { max: 1, price: 40000 }, feed: { max: 3, price: 4000 }, heater: { max: 1, price: 20000 }, mixer: { max: 2, price: 3000 }, boiler: { max: 1, price: 60000 }, cooler: { max: 1, price: 10000 },
  eq_reactor: { max: 1, price: 30000 }, hno3_absorber: { max: 1, price: 80000 }, product: { max: 1, price: 4000 }, stack: { max: 1, price: 8000 },
};
export const L26_BUDGET = 150000;
const PRESETS = { heater: { T: 473.15, utility: 'fired' }, boiler: { T: 473.15, steam: 'MP' }, cooler: { T: 313.15, utility: 'cw' }, eq_reactor: { reactions: 'R8', mode: 'isothermal', T: 313.15 }, hno3_absorber: { recovery: 0.99, acid: 0.6 } };
export const L26_AIR_DEFAULT = 540;
/** Secondary air added after the boiler (kmol/h): the oxygen the NO -> NO2 -> acid steps still need (the gauze air is fixed by the NH3 fraction). */
export const L26_SEC_AIR = 200;

export function buildNitric(s: EqState): void {
  s.palette = null;
  const nh3 = putFeed(s, 0, 0, { NH3: 1 }, L26_NH3_KMOL_H, 300, L26_P, 'ammonia');
  const air = putFeed(s, 0, 6, { O2: 0.21, N2: 0.79 }, L26_AIR_DEFAULT, 298.15, L26_P);
  const heat = put(s, 'heater', 4, 6, { T: 473.15, utility: 'fired' }), mix = put(s, 'mixer', 7, 3);
  const boil = put(s, 'boiler', 16, 0, { T: 473.15, steam: 'MP' }), cool = put(s, 'cooler', 14, 6, { T: 313.15, utility: 'cw' });
  const rx = put(s, 'eq_reactor', 17, 9, { reactions: 'R8', mode: 'isothermal', T: 313.15 }), abs = put(s, 'hno3_absorber', 17, 2, { recovery: 0.99, acid: 0.6 });
  const sec = putFeed(s, 8, 12, { O2: 0.21, N2: 0.79 }, L26_SEC_AIR, 298.15, L26_P), mix2 = put(s, 'mixer', 11, 9);
  const prod = put(s, 'product', 21, 12), stack = put(s, 'stack', 21, 6);
  link(s, nh3, 'out', mix, 'in1'); link(s, air, 'out', heat, 'in'); link(s, heat, 'out', mix, 'in2');
  link(s, boil, 'out', mix2, 'in1'); link(s, sec, 'out', mix2, 'in2'); link(s, mix2, 'out', cool, 'in'); link(s, cool, 'out', rx, 'in'); link(s, rx, 'out', abs, 'in'); link(s, abs, 'out', stack, 'in'); link(s, abs, 'acid', prod, 'in');
  s.palette = ['gauze_burner', 'n2o_abater'];
  markPrebuilt(s);
  sealSetup(s);
}

const gauze = (s: S) => unitsOfType(s, 'gauze_burner')[0], abater = (s: S) => unitsOfType(s, 'n2o_abater')[0];
export function nitricMeasures(s: S): Measures {
  const g = gauze(s), ab = abater(s), air = unitsOfType(s, 'feed').find((u) => (s.feeds[u.id]?.x[s.species.indexOf('O2')] ?? 0) > 0), heater = unitsOfType(s, 'heater')[0];
  const v: Record<string, number> = {
    placed: g ? 1 : 0, abater: ab ? 1 : 0, x_abate: ab && typeof ab.params.X === 'number' ? (ab.params.X as number) * 100 : 0, air_kmol_h: air ? toKmolH(s.feeds[air.id]!.flow) : 0,
    preheat_c: heater && typeof heater.params.T === 'number' ? (heater.params.T as number) - 273.15 : 0, y_nh3: 0, t_gauze_c: 0, s_no: 0, no_yield: 0, n2o_kg_t: 0, hno3_t_h: 0, acid_t_h: 0, cost_per_t: 0,
    lfl: 0, ufl: 0, mix_c: 0, n2o_raw_kg_t: 0, bat_hi: (REGIONS.get(s.region).data as EqRegionData).limits.n2o_bat[1], steam_t_h: 0, nox_out_pct: 0, wt: 60,
  };
  if (s.solved === null || !s.solved.ok || !g) return { ok: false, v };
  const rg = s.solved.units[g.id];
  v.y_nh3 = rg?.info.y_nh3 ?? 0; v.t_gauze_c = (rg?.info.T_out ?? 0) - 273.15; v.s_no = rg?.info.s_no ?? 0; v.no_yield = v.s_no * 100; v.lfl = rg?.info.lfl ?? 0; v.ufl = rg?.info.ufl ?? 0;
  const gin = inStream(s, g.id); v.mix_c = gin ? gin.T - 273.15 : 0; v.n2o_raw_kg_t = rg?.info.n2o_kg_per_t ?? 0;
  const hno3Kg = (intoType(s, 'product', 'HNO3(l)') * SPECIES['HNO3']!.M) / 1000;
  v.hno3_t_h = hno3Kg * 3.6; v.acid_t_h = (s.solved.kpis.product_t_per_h ?? 0);
  const n2oKg = (intoType(s, 'stack', 'N2O') * SPECIES['N2O']!.M) / 1000;
  v.n2o_kg_t = hno3Kg > 0 ? (n2oKg / hno3Kg) * 1000 : 0;
  v.cost_per_t = s.solved.kpis.cost_usd_per_t ?? 0; v.steam_t_h = s.solved.kpis.steam_raised_t_per_h ?? 0;
  const nox = intoType(s, 'stack', 'NO') + intoType(s, 'stack', 'NO2'), tot = (s.flowsheet.units.find((u) => u.type === 'stack') ? 1 : 0) * 1;
  void tot; v.nox_out_pct = fedOf(s, 'NH3') > 0 ? (nox / fedOf(s, 'NH3')) * 100 : 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const code = (s: S): string => (s.solved !== null && !s.solved.ok ? s.solved.failure?.code ?? '' : '');
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'call_t', role: 'safety', done: (s) => predictionOf(s, 't_gauze_c') !== null || commissions(s) > 0 },
  { id: 'place_gauze', role: 'safety', focus: 'gauze_burner', done: (s) => unitsOfType(s, 'gauze_burner').length >= 1 },
  { id: 'pipe_gauze', role: 'safety', done: (s) => { const g = gauze(s); return g !== undefined && s.flowsheet.streams.some((p) => p.to.unit === g.id) && s.flowsheet.streams.some((p) => p.from.unit === g.id); } },
  { id: 'set_mix', role: 'safety', focus: 'feed', done: (s) => { const m = nitricMeasures(s).v; return m.air_kmol_h! >= 600; } },
  { id: 'place_abater', role: 'safety', focus: 'n2o_abater', done: (s) => unitsOfType(s, 'n2o_abater').length >= 1 },
  { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_gauze', role: 'safety', done: LATE(['read_gauze', 'why']) },
  { id: 'why', role: 'safety', done: LATE(['why']) },
];

const O = (type: string, port: string, n = 1) => ({ type, port, n });
/** The notebook's build order (levelInfo.buildGuide): the gauze and the abater into the pre-built line, three pipes, the three knobs. */
export const L26_GUIDE: BuildStep[] = [
  { id: 'gauze', kind: 'place', slot: { type: 'gauze_burner' }, at: [10, 0] },
  { id: 'abater', kind: 'place', slot: { type: 'n2o_abater' }, at: [4, 9] },
  { id: 'p_mix', kind: 'pipe', from: O('mixer', 'out'), to: O('gauze_burner', 'in') },
  { id: 'p_gauze', kind: 'pipe', from: O('gauze_burner', 'out'), to: O('n2o_abater', 'in') },
  { id: 'p_abater', kind: 'pipe', from: O('n2o_abater', 'out'), to: O('boiler', 'in') },
  { id: 'air', kind: 'set', slot: { type: 'feed', n: 2 }, done: (s) => Math.abs(nitricMeasures(s).v.air_kmol_h! - L26_REF.air) <= 15 },
  { id: 'preheat', kind: 'set', slot: { type: 'heater' }, done: (s) => { const h = unitsOfType(s, 'heater')[0]; return h !== undefined && typeof h.params.T === 'number' && Math.abs((h.params.T as number) - L26_REF.preheat) < 1; } },
  { id: 'abate', kind: 'set', slot: { type: 'n2o_abater' }, done: (s) => { const a = abater(s); return a !== undefined && typeof a.params.X === 'number' && (a.params.X as number) >= L26_REF.X - 1e-9; } },
];

export const L26: LevelSpec = {
  id: 'L26', firstRun: true, chapter: 6, index: 26, setter: 'safety', budgetUSD: L26_BUDGET, units: L26_UNITS, notes: 3, shiftLen: 0,
  setup: (s) => { baseSetup(s, L26_SPECIES, L26_UNITS, PRESETS); buildNitric(s); },
  measures: nitricMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
    { key: 'yield', met: m.ok && m.v.no_yield! >= L26_YIELD_MIN, ...(m.ok ? { value: m.v.no_yield } : {}), target: L26_YIELD_MIN },
    { key: 'nh3', met: m.ok && m.v.y_nh3! <= L26_NH3_MAX_PCT, ...(m.ok ? { value: m.v.y_nh3 } : {}), target: L26_NH3_MAX_PCT },
    { key: 'n2o', met: m.ok && m.v.n2o_kg_t! <= L26_N2O_MAX, ...(m.ok ? { value: m.v.n2o_kg_t } : {}), target: L26_N2O_MAX },
    { key: 'acid', met: m.ok && m.v.hno3_t_h! >= L26_HNO3_MIN_T_H, ...(m.ok ? { value: m.v.hno3_t_h } : {}), target: L26_HNO3_MIN_T_H },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L26_UNITS); g.push({ key: 'budget', met: sp <= L26_BUDGET, value: sp, target: L26_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.n2o_kg_t! <= m.v.bat_hi!, m.ok && m.v.cost_per_t! <= L26_COST_MAX],
  callIt: { key: 't_gauze_c', unit: '°C', tol: 0.03, truth: (_s, m) => (m.ok ? m.v.t_gauze_c! : null) },
  hero: (_s, m) => ({ key: 'no_yield', unit: '%', value: m.v.no_yield!, lo: L26_YIELD_MIN, hi: 98 }),
  secondary: (_s, m) => ({ key: 'y_nh3', unit: '%', value: m.v.y_nh3!, limit: L26_NH3_MAX_PCT }),
  annunciators: (s, m, g): Annunciator[] => [
    { key: 'explosive', legend: t('lv.L26.ann.explosive'), state: code(s) === 'EXPLOSIVE_MIXTURE' ? 'critical' : 'off' },
    { key: 'rich', legend: t('lv.L26.ann.rich'), state: lit(m, m.v.y_nh3! <= L26_NH3_MAX_PCT) },
    { key: 'cold', legend: t('lv.L26.ann.cold'), state: lit(m, g.find((x) => x.key === 'yield')!.met) },
    { key: 'n2o', legend: t('lv.L26.ann.n2o'), state: lit(m, g.find((x) => x.key === 'n2o')!.met) },
    { key: 'solve', legend: t('lv.L26.ann.solve'), state: s.solved !== null && !s.solved.ok && code(s) !== 'EXPLOSIVE_MIXTURE' ? 'critical' : 'off' },
    { key: 'goal', legend: t('lv.L26.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
  ],
  coach: COACH,
  buildGuide: L26_GUIDE,
  verdict: (s, m, g) => {
    if (code(s) === 'EXPLOSIVE_MIXTURE') { const d = s.solved!.failure!.data; return { key: 'explosion', cause: t('lv.L26.cause.explosion', { y: f(s, Number(d.y)), lfl: f(s, Number(d.lfl)), ufl: f(s, Number(d.ufl)), T: f(s, Number(d.T) - 273.15) }) }; }
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.no_yield! < L26_YIELD_MIN) return { key: 'cold', cause: t('lv.L26.cause.cold', { T: f(s, m.v.t_gauze_c!), y: f(s, m.v.no_yield!), nh3: f(s, m.v.y_nh3!) }) };
    if (m.v.y_nh3! > L26_NH3_MAX_PCT) return { key: 'rich', cause: t('lv.L26.cause.rich', { nh3: f(s, m.v.y_nh3!), max: f(s, L26_NH3_MAX_PCT), lfl: f(s, m.v.lfl!), T: f(s, m.v.mix_c!) }) };
    if (m.v.n2o_kg_t! > L26_N2O_MAX) return { key: 'n2o', cause: t('lv.L26.cause.n2o', { n2o: f(s, m.v.n2o_kg_t!), max: f(s, L26_N2O_MAX), raw: f(s, m.v.n2o_raw_kg_t!) }) };
    return { key: 'short', cause: t('lv.L26.cause.short', { acid: f(s, m.v.hno3_t_h!), want: f(s, L26_HNO3_MIN_T_H) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.n2o_raw_kg_t! > 0)) return null;
    const r = Math.round(m.v.n2o_raw_kg_t! * 100) / 100, x = Math.round(m.v.x_abate!) / 100, o = Math.round(r * (1 - x) * 100) / 100;
    return `${f(s, r)} × (1 − ${f(s, x)}) = ${f(s, o)} kg of N₂O per t of HNO₃ after the abater`;
  },
  lessonVars: (s, m) => ({ T: f(s, m.v.t_gauze_c!), y: f(s, m.v.y_nh3!), no: f(s, m.v.no_yield!), lfl: f(s, m.v.lfl!), mix: f(s, m.v.mix_c!), raw: f(s, m.v.n2o_raw_kg_t!), n2o: f(s, m.v.n2o_kg_t!), acid: f(s, m.v.hno3_t_h!) }),
  metrics: (_s, m) => [
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
    { key: 'no_yield', unit: '%', value: m.v.no_yield! },
    { key: 'n2o_kg_t', unit: 'kg/t', value: m.v.n2o_kg_t! },
  ],
  histogram: { metric: 'cost_per_t', best: () => L26_REF.cost, spread: 0.06, lowerIsBetter: true },
  solver: () => scripted(nitricScript(L26_REF.air, L26_REF.preheat, L26_REF.X, L26_REF.t_c, true))(),
  naive: () => scripted(nitricScript(300, 473.15, 0, 0, false))(),
};

/** The player's play: Call it (the gauze exit), place the gauze (R-123) and the abater (R-124), set air flow, preheat and abatement, pipe mixer -> gauze -> abater -> boiler (B-105), commission. */
export function nitricScript(air: number, preheat: number, X: number, callT: number, callIt: boolean): Action[] {
  const a: Action[] = [];
  if (callIt) a.push({ name: 'callIt', args: [callT] });
  a.push({ name: 'placeUnit', args: ['gauze_burner', 10, 0, 0] });
  if (X > 0) a.push({ name: 'placeUnit', args: ['n2o_abater', 4, 9, 0] }, { name: 'setParam', args: ['R-124', 'X', X] });
  a.push({ name: 'setParam', args: ['F-102', 'flow', fromKmolH(air)] }, { name: 'setParam', args: ['H-103', 'T', preheat] }, { name: 'connect', args: ['M-104', 'out', 'R-123', 'in'] });
  if (X > 0) a.push({ name: 'connect', args: ['R-123', 'out', 'R-124', 'in'] }, { name: 'connect', args: ['R-124', 'out', 'B-105', 'in'] });
  else a.push({ name: 'connect', args: ['R-123', 'out', 'B-105', 'in'] });
  a.push({ name: 'commission' });
  return a;
}
void toKgH;
