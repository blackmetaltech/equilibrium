// L25 · The Last 0.3 Percent (DESIGN 2.6 chapter 6). Sulfur-burner gas (1000 kmol/h, 9.5 % SO2 in air, pre-placed) -> the player builds the contact plant: kinetic
// beds (K2, V2O5), coolers, an intermediate absorber, a reheat, a final bed and absorber, the stack analyser and acid tanks. Goal: at most the regional SO2
// limit (global 2.0 kg per tonne of 100 % H2SO4), with 98 % acid and no water absorber. The reference is double contact (3 beds, absorb, reheat, 1 bed, absorb).
// The emission / conversion identity (kg/t = (1 - c) 64.06 / (c 98.08) 1000) is the Call-it and the printout equation.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { REGIONS } from '../regions';
import { t } from '../i18n';
import type { EqState } from '../state';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, flowOf, inStream, link, molarMass, none, predictionOf, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';
import { scripted } from './bench';

type S = Readonly<EqState>;
export const L25_SPECIES = ['N2', 'O2', 'SO2', 'SO3', 'H2SO4(l)', 'H2O(l)'];
export const L25_FEED_KMOL_H = 1000;
export const L25_SO2_FRAC = 0.09;
export const L25_T_K = 693.15;
export const L25_W_KG = 8000;
/** The identity of the Call-it: 99.7 % overall conversion. */
export const L25_CONV_CALL = 0.997;
export const L25_CALL_TOL = 0.01;
export const L25_UNITS: LevelSpec['units'] = {
  packed_bed: { max: 4, price: 50000 }, cooler: { max: 4, price: 12000 }, heater: { max: 2, price: 15000 }, absorber: { max: 2, price: 45000 }, stack: { max: 1, price: 8000 },
  product: { max: 2, price: 4000 }, feed: { max: 1, price: 4000 },
};
export const L25_BUDGET = 450000;
/** GAME: the star cost line is the solver's cost per tonne x 1.03 (UNVERIFIED, pinned by ch6.test.ts). */
export const L25_COST_STAR = 4.09;
const PRESETS = { packed_bed: { mode: 'adiabatic', W: 1000 } };

/** kg of SO2 per tonne of 100 % acid at an overall conversion c. */
export const so2PerTonne = (c: number): number => (((1 - c) * molarMass('SO2')) / (c * molarMass('H2SO4(l)'))) * 1000;

const limitsOf = (s: S) => REGIONS.get(s.region).data.limits;

export function dcdaMeasures(s: S): Measures {
  const lim = limitsOf(s);
  const v: Record<string, number> = {
    so2_fed: toKmolH(fedOf(s, 'SO2')),
    kg_t: 0, conv: 0, acid_t_h: 0, so2_kg_h: 0, mist: 0, absorbers: unitsOfType(s, 'absorber').length, beds: unitsOfType(s, 'packed_bed').length, overtemp: 0, cost: 0, acid_pct: 0,
    limit: lim.so2_standard, strict: lim.so2_strict, expert: lim.so2_expert, w_total: 0, steam: 0, tmax_c: 0,
  };
  v.w_total = unitsOfType(s, 'packed_bed').reduce((a, u) => a + (typeof u.params.W === 'number' ? u.params.W : 0), 0);
  v.mist = unitsOfType(s, 'absorber').some((u) => u.params.absorbent === 'water') ? 1 : 0;
  v.acid_pct = Math.min(100, ...unitsOfType(s, 'absorber').map((u) => (typeof u.params.acid === 'number' ? u.params.acid : 0.985) * 100));
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const stk = unitsOfType(s, 'stack')[0];
  if (!stk) return { ok: false, v };
  const st = inStream(s, stk.id);
  if (!st) return { ok: false, v };
  let acidKgS = 0;
  for (const a of unitsOfType(s, 'absorber')) acidKgS += s.solved.units[a.id]?.info.h2so4_kg_s ?? 0;
  v.acid_t_h = acidKgS * 3.6;
  // the regulator counts the sulfur that leaves by the stack as SO2, whichever oxide it is in: the identity with the conversion is then exact
  v.so2_kg_h = (flowOf(s, st, 'SO2') + flowOf(s, st, 'SO3')) * molarMass('SO2') * 3.6;
  const fedSo2 = v.so2_fed > 0 ? v.so2_fed : 1;
  v.conv = Math.max(0, 1 - toKmolH(flowOf(s, st, 'SO2') + flowOf(s, st, 'SO3')) / fedSo2);
  v.kg_t = v.acid_t_h > 1e-9 ? v.so2_kg_h / v.acid_t_h : 1e9;
  v.overtemp = s.solved.diag.filter((d) => d.code === 'CATALYST_OVERTEMP').length;
  v.cost = s.solved.kpis.cost_usd_per_t ?? 0;
  v.steam = s.solved.kpis.steam_raised_t_per_h ?? 0;
  v.tmax_c = Math.max(0, ...unitsOfType(s, 'packed_bed').map((u) => (s.solved!.units[u.id]?.info.T_out ?? 273.15) - 273.15));
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

export const L25: LevelSpec = {
  id: 'L25', firstRun: true, chapter: 6, index: 25, setter: 'safety', budgetUSD: L25_BUDGET, units: L25_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L25_SPECIES, L25_UNITS, PRESETS);
    putFeed(s, 0, 0, { N2: 0.79, O2: 0.21 - L25_SO2_FRAC, SO2: L25_SO2_FRAC }, L25_FEED_KMOL_H, L25_T_K, 1.5e5);
    sealSetup(s);
  },
  measures: dcdaMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'so2', met: m.ok && m.v.kg_t! <= m.v.limit!, ...(m.ok ? { value: m.v.kg_t } : {}), target: m.v.limit! },
      { key: 'mist', met: m.v.mist === 0 && m.v.absorbers! > 0, value: m.v.mist! },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L25_UNITS); g.push({ key: 'budget', met: sp <= L25_BUDGET, value: sp, target: L25_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.kg_t! <= m.v.strict!, m.ok && m.v.kg_t! <= m.v.strict! && m.v.cost! <= L25_COST_STAR],
  callIt: { key: 'so2_kg_t', unit: 'kg/t', tol: L25_CALL_TOL, truth: () => so2PerTonne(L25_CONV_CALL) },
  hero: (_s, m) => ({ key: 'so2_kg_t', unit: 'kg/t', value: m.ok ? Math.min(m.v.kg_t!, 99) : 0, lo: 0, hi: m.v.limit! }),
  secondary: (_s, m) => ({ key: 'conv_pct', unit: '%', value: m.v.conv! * 100, limit: (1 - 0.003) * 100 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const lit = (cond: boolean, st: Annunciator['state']): Annunciator['state'] => (!m.ok ? 'off' : cond ? st : 'normal');
    return [
      { key: 'so2', legend: t('lv.L25.ann.so2'), state: lit(m.v.kg_t! > m.v.limit!, m.v.kg_t! > 5 * m.v.limit! ? 'critical' : 'high') },
      { key: 'mist', legend: t('lv.L25.ann.mist'), state: m.v.absorbers! > 0 ? (m.v.mist ? 'critical' : 'normal') : 'off' },
      { key: 'hot', legend: t('lv.L25.ann.hot'), state: lit(m.v.overtemp! > 0, 'high') },
      { key: 'one', legend: t('lv.L25.ann.one'), state: lit(m.v.absorbers! < 2, 'high') },
      { key: 'solve', legend: t('lv.L25.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L25.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: [
    { id: 'place_beds', role: 'safety', focus: 'packed_bed', done: (s) => unitsOfType(s, 'packed_bed').length >= 3 },
    { id: 'catalyst', role: 'safety', focus: 'packed_bed', done: (s) => unitsOfType(s, 'packed_bed').length > 0 && unitsOfType(s, 'packed_bed').every((u) => u.catalystId !== undefined) },
    { id: 'absorber', role: 'safety', focus: 'absorber', done: (s) => unitsOfType(s, 'absorber').length >= 2 },
    { id: 'pipe_up', role: 'safety', done: (s) => s.flowsheet.streams.length >= 12 },
    { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'read_stack', role: 'safety', focus: 'stack', done: (s) => ['read_stack', 'why'].includes(s.ui.coachStep ?? '') },
  ] as CoachStep[],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.mist === 1) return { key: 'mist', cause: t('lv.L25.cause.mist', {}) };
    if (m.v.kg_t! > m.v.limit!) {
      const vars = { conv: f(s, m.v.conv! * 100), kgt: f(s, Math.min(m.v.kg_t!, 9999)), limit: f(s, m.v.limit!), n: m.v.absorbers! };
      return m.v.absorbers! < 2 ? { key: 'single', cause: t('lv.L25.cause.single', vars) } : { key: 'weak', cause: t('lv.L25.cause.weak', vars) };
    }
    return { key: 'budget', cause: t('lv.L25.cause.budget', {}) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.acid_t_h! > 0) || !(m.v.kg_t! < 1e8)) return null;
    const a = shown(m.v.so2_kg_h!), b = shown(m.v.acid_t_h!);
    return `${f(s, a)} ÷ ${f(s, b)} = ${f(s, shown(a / b))} kg of SO₂ per t of acid`;
  },
  lessonVars: (s, m) => ({
    conv: m.ok ? f(s, m.v.conv! * 100) : '-', kgt: m.ok && m.v.kg_t! < 1e8 ? f(s, m.v.kg_t!) : '-', limit: f(s, m.v.limit!), c97: f(s, so2PerTonne(0.97)), c997: f(s, so2PerTonne(0.997)),
  }),
  metrics: (_s, m) => [
    { key: 'cost_usd_t', unit: 'USD/t', value: m.v.cost! },
    { key: 'so2_kg_t', unit: 'kg/t', value: Math.min(m.v.kg_t!, 1e6) },
    { key: 'steam_t_t', unit: 't/t', value: m.v.acid_t_h! > 0 ? m.v.steam! / m.v.acid_t_h! : 0 },
  ],
  histogram: { metric: 'cost_usd_t', best: () => L25_COST_STAR / 1.03, spread: 0.4, lowerIsBetter: true },
  solver: () => scripted(dcdaBuild())(),
  naive: () => scripted(singleBuild())(),
};
void none; void relErr; void link; void predictionOf;

// -------------------------------------------------------------------------------------------------------- scripted builds
const P = (type: string, x: number, y: number): Action => ({ name: 'placeUnit', args: [type, x, y, 0] });
const C = (a: string, ap: string, b: string, bp: string): Action => ({ name: 'connect', args: [a, ap, b, bp] });
const SP = (u: string, k: string, v: number | string): Action => ({ name: 'setParam', args: [u, k, v] });

/** Double contact 3 + 1: ids follow the placement order (the pre-placed feed is F-101; pipes and units share the counter, so all units come first). */
export function dcdaBuild(W = L25_W_KG): Action[] {
  const beds = ['R-102', 'R-104', 'R-106', 'R-109'];
  return [
    { name: 'callIt', args: [so2PerTonne(L25_CONV_CALL)] },
    P('packed_bed', 2, 0), P('cooler', 6, 0), P('packed_bed', 8, 0), P('cooler', 12, 0), P('packed_bed', 14, 0), P('absorber', 18, 0), P('heater', 22, 0), P('packed_bed', 2, 5),
    P('absorber', 6, 5), P('stack', 11, 5), P('product', 14, 5), P('product', 16, 5),
    ...beds.flatMap((b): Action[] => [{ name: 'setCatalyst', args: [b, 'v2o5'] }, SP(b, 'W', W)]),
    SP('C-103', 'T', L25_T_K), SP('C-105', 'T', L25_T_K), SP('H-108', 'T', L25_T_K),
    C('F-101', 'out', 'R-102', 'in'), C('R-102', 'out', 'C-103', 'in'), C('C-103', 'out', 'R-104', 'in'), C('R-104', 'out', 'C-105', 'in'), C('C-105', 'out', 'R-106', 'in'),
    C('R-106', 'out', 'A-107', 'in'), C('A-107', 'out', 'H-108', 'in'), C('A-107', 'acid', 'T-112', 'in'), C('H-108', 'out', 'R-109', 'in'), C('R-109', 'out', 'A-110', 'in'),
    C('A-110', 'out', 'Z-111', 'in'), C('A-110', 'acid', 'T-113', 'in'),
    { name: 'commission' },
  ];
}
/** The novice: single contact (three beds at the default catalyst mass, one absorber with water). */
export function singleBuild(): Action[] {
  const beds = ['R-102', 'R-104', 'R-106'];
  return [
    P('packed_bed', 2, 0), P('cooler', 6, 0), P('packed_bed', 8, 0), P('cooler', 12, 0), P('packed_bed', 14, 0), P('absorber', 18, 0), P('stack', 11, 5), P('product', 14, 5),
    ...beds.flatMap((b): Action[] => [{ name: 'setCatalyst', args: [b, 'v2o5'] }]),
    SP('C-103', 'T', L25_T_K), SP('C-105', 'T', L25_T_K), SP('A-107', 'absorbent', 'water'),
    C('F-101', 'out', 'R-102', 'in'), C('R-102', 'out', 'C-103', 'in'), C('C-103', 'out', 'R-104', 'in'), C('R-104', 'out', 'C-105', 'in'), C('C-105', 'out', 'R-106', 'in'),
    C('R-106', 'out', 'A-107', 'in'), C('A-107', 'out', 'Z-108', 'in'), C('A-107', 'acid', 'T-109', 'in'),
    { name: 'commission' },
  ];
}
