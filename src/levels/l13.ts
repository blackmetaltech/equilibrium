// L13 · The Staircase (DESIGN 2.6). Burner gas (10 % SO2, 11 % O2, 79 % N2, 1000 kmol/h at 1.2 bar, the pre-placed feed whose T is the first bed inlet) ->
// adiabatic equilibrium beds (ideal V2O5: asleep below a 410 C inlet) with inter-bed boilers (steam credit) -> tank. Goal: 98.0 % overall SO2 conversion with no
// bed above 630 C. One bed stalls on the equilibrium curve at about 70 %; the staircase of beds and coolers climbs it.
import type { Action } from '@core/kit';
import { fmtNumber, plumbing, pricesOf } from '../engine/solved';
import { OPERATING_HOURS, annualisedCapex, steamPricePerT } from '../sim/econ';
import { t } from '../i18n';
import { equilibriumStage } from '../sim/units/rx_equil';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, flowOf, predictionOf, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';
import { V2O5_SINTER_C, V2O5_WAKE_C } from './v2o5';

type S = Readonly<EqState>;
export const L13_SPECIES = ['SO2', 'O2', 'SO3', 'N2'];
export const L13_GAS = { SO2: 0.1, O2: 0.11, N2: 0.79 };
export const L13_KMOL_H = 1000;
export const L13_P = 1.2e5;
export const L13_CONV_MIN = 98;
/** Light-off of the ideal V2O5 and the sintering limit, K (410 C and 630 C). */
export const T_ASLEEP = V2O5_WAKE_C + 273.15;
export const T_SINTER = V2O5_SINTER_C + 273.15;
export const L13_T_CALL = 420 + 273.15;
export const L13_CALL_TOL = 0.01;
/** Catalyst and vessel bill of one bed, USD/h (GAME, UNVERIFIED), and the acid strength the SO3 is sold as. */
export const BED_USD_H = 140;
export const ACID_W = 0.98;
export const L13_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 6000 }, eq_bed: { max: 4, price: 40000 }, boiler: { max: 4, price: 30000 }, product: { max: 1, price: 5000 },
};
export const L13_BUDGET = 290000;
export const L13_PRESETS = { eq_bed: { reactions: 'R2', mode: 'adiabatic', Tmin: T_ASLEEP, Tmax: T_SINTER }, boiler: { T: 683.15, steam: 'LP' } };
/** Reference design: three beds, bed inlets 415 C (this engine: 98.8 % overall), the last gas cooled to 400 C. */
export const L13_REF = { Tin: 415 + 273.15, beds: 3, Tlast: 400 + 273.15 };
/** Reference cost inputs (engine numbers at the reference design, GAME calibration, UNVERIFIED): bare-module USD of the boilers, steam raised and acid made, t/h. */
export const L13_REF_PARTS = { boilerCbm: 4016429.38, steamTperH: 4.462155, acidTperH: 9.886765 };

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const C = (K: number): number => K - 273.15;
const feedStream = () => ({ n: L13_SPECIES.map((id) => (id === 'SO2' ? 0.1 : id === 'O2' ? 0.11 : id === 'N2' ? 0.79 : 0) * L13_KMOL_H * (1000 / 3600)), T: L13_T_CALL, P: L13_P });
/** Call-it truth: bed-1 exit temperature (deg C) of the adiabatic equilibrium bed for the burner gas entering at 420 C. */
export function bed1ExitC(): number {
  const r = equilibriumStage(feedStream(), { species: L13_SPECIES, reactions: ['R2'], mode: 'adiabatic', Tmin: T_ASLEEP, detail: 'rigorous' });
  return r.ok ? C(r.value.out.T) : 0;
}

/** The beds in flow order: follow the first outlet from the feed to the end of the line. */
export function chainOf(s: S): { beds: string[]; boilers: string[]; end: string } {
  const feed = unitsOfType(s, 'feed')[0];
  const beds: string[] = [], boilers: string[] = [];
  let cur = feed?.id ?? '', end = '';
  for (let i = 0; i < 20 && cur !== ''; i++) {
    const p = s.flowsheet.streams.find((q) => q.from.unit === cur);
    if (!p) break;
    cur = p.to.unit;
    const u = s.flowsheet.units.find((q) => q.id === cur);
    if (!u) break;
    if (u.type === 'eq_bed') beds.push(u.id); else if (u.type === 'boiler') boilers.push(u.id); else { end = u.id; break; }
  }
  return { beds, boilers, end };
}

export function stairMeasures(s: S): Measures {
  const feed = unitsOfType(s, 'feed')[0];
  const ch = chainOf(s);
  const beds = unitsOfType(s, 'eq_bed').length;
  const v: Record<string, number> = {
    beds, beds_in_line: ch.beds.length, boilers: unitsOfType(s, 'boiler').length, t_in_c: feed ? C(s.feeds[feed.id]?.T ?? 0) : 0, conv_pct: 0, so2_out_kmol_h: 0, so2_fed: 0.1 * L13_KMOL_H, tmax_c: 0,
    asleep: 0, sinter: 0, steam_t_h: 0, acid_t_h: 0, cost_usd_t: 0, bed1_exit_c: 0, bed1_pct: 0, last_t_c: 0,
  };
  if (s.solved === null || !s.solved.ok || ch.end === '') return { ok: false, v };
  const into = plumbing(s).inPipe(ch.end, 'in');
  const st = into !== undefined ? s.solved.streams[into] : undefined;
  if (!st) return { ok: false, v };
  v.so2_fed = 0.1 * L13_KMOL_H;
  v.so2_out_kmol_h = toKmolH(flowOf(s, st, 'SO2'));
  v.conv_pct = (1 - v.so2_out_kmol_h! / v.so2_fed!) * 100;
  const so3 = toKmolH(flowOf(s, st, 'SO3'));
  v.acid_t_h = (so3 * 98.079) / ACID_W / 1000;
  let tmax = 0, asleep = 0;
  ch.beds.forEach((id, i) => {
    const info = s.solved!.units[id]?.info ?? {};
    tmax = Math.max(tmax, info.Tmax ?? 0);
    if (info.active === 0) asleep++;
    if (i === 0) { v.bed1_exit_c = C(info.T_out ?? 0); v.bed1_pct = (info.X ?? 0) * 100; }
  });
  v.tmax_c = C(tmax); v.asleep = asleep; v.sinter = tmax > T_SINTER + 1e-6 ? 1 : 0;
  v.last_t_c = C(st.T);
  v.steam_t_h = s.solved.kpis.steam_raised_t_per_h ?? 0;
  const hourly = (s.solved.kpis.annual_cost_usd ?? 0) / 8000 + v.beds! * BED_USD_H;
  v.cost_usd_t = v.acid_t_h! > 0 ? hourly / v.acid_t_h! : 1e9;
  return { ok: true, v };
}

/** Build of `nBeds` beds with a boiler after each (the last cools to `Tlast`) on the pre-placed feed F-101. Ids follow the placement order. */
export function stairBuild(nBeds: number, Tin: number, Tgap: number, Tlast: number): Action[] {
  const a: Action[] = [{ name: 'setFeed', args: ['F-101', { T: Tin }] }];
  let id = 102;
  const beds: string[] = [], boil: string[] = [];
  for (let i = 0; i < nBeds; i++) {
    a.push({ name: 'placeUnit', args: ['eq_bed', 3 + 5 * i, 0, 0] }); beds.push(`R-${id++}`);
    a.push({ name: 'placeUnit', args: ['boiler', 3 + 5 * i, 6, 0] }); boil.push(`B-${id++}`);
  }
  const tank = `T-${id}`;
  a.push({ name: 'placeUnit', args: ['product', 22, 2, 0] });
  boil.forEach((b, i) => a.push({ name: 'setParam', args: [b, 'T', i === nBeds - 1 ? Tlast : Tgap] }));
  a.push({ name: 'connect', args: ['F-101', 'out', beds[0]!, 'in'] });
  for (let i = 0; i < nBeds; i++) {
    a.push({ name: 'connect', args: [beds[i]!, 'out', boil[i]!, 'in'] });
    a.push({ name: 'connect', args: [boil[i]!, 'out', i === nBeds - 1 ? tank : beds[i + 1]!, 'in'] });
  }
  a.push({ name: 'commission' });
  return a;
}

const has = (s: S, type: string, n = 1): boolean => unitsOfType(s, type).length >= n;
const COACH: CoachStep[] = [
  { id: 'place_bed', role: 'safety', focus: 'eq_bed', done: (s) => has(s, 'eq_bed') },
  { id: 'place_boiler', role: 'safety', focus: 'boiler', done: (s) => has(s, 'boiler') },
  { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_curve', role: 'safety', focus: 'eq_bed', done: (s) => s.ui.pinned.includes('eqwin') || ['read_curve', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'safety', done: (s) => s.ui.coachStep === 'why' },
];

/** Reference $/t of acid at a state's prices: boilers annualised, minus the steam credit, plus the beds, over the acid. */
export const refAcidCost = (s: S): number => (annualisedCapex(L13_REF_PARTS.boilerCbm) / OPERATING_HOURS - L13_REF_PARTS.steamTperH * steamPricePerT(pricesOf(s)) + L13_REF.beds * BED_USD_H) / L13_REF_PARTS.acidTperH;

export const L13: LevelSpec = {
  id: 'L13', firstRun: true, chapter: 3, index: 13, setter: 'safety', budgetUSD: L13_BUDGET, units: L13_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L13_SPECIES, L13_UNITS, L13_PRESETS);
    putFeed(s, 0, 0, L13_GAS, L13_KMOL_H, 450 + 273.15, L13_P);
    sealSetup(s);
  },
  measures: stairMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'conv', met: m.ok && m.v.conv_pct! >= L13_CONV_MIN - 1e-9, ...(m.ok ? { value: m.v.conv_pct } : {}), target: L13_CONV_MIN },
      { key: 'sinter', met: m.ok && m.v.sinter === 0 && m.v.beds_in_line! >= 1, ...(m.ok ? { value: m.v.tmax_c } : {}), target: C(T_SINTER) },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L13_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L13_BUDGET, value: sp, target: L13_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.beds! <= 3, m.ok && m.v.cost_usd_t! <= refAcidCost(s) + 0.03 * Math.abs(refAcidCost(s))],
  callIt: { key: 'bed1_exit_c', unit: '°C', tol: L13_CALL_TOL, truth: () => bed1ExitC() },
  hero: (_s, m) => ({ key: 'conv', unit: '%', value: m.v.conv_pct!, lo: L13_CONV_MIN, hi: 100 }),
  secondary: (_s, m) => ({ key: 'tmax_c', unit: '°C', value: m.v.tmax_c!, limit: C(T_SINTER) }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const conv = g.find((x) => x.key === 'conv')!;
    return [
      { key: 'conv', legend: t('lv.L13.ann.conv'), state: !m.ok ? 'off' : conv.met ? 'normal' : m.v.conv_pct! < 90 ? 'critical' : 'high' },
      { key: 'sinter', legend: t('lv.L13.ann.sinter'), state: !m.ok ? 'off' : m.v.sinter ? 'critical' : m.v.tmax_c! > C(T_SINTER) - 10 ? 'high' : 'normal' },
      { key: 'asleep', legend: t('lv.L13.ann.asleep'), state: !m.ok ? 'off' : m.v.asleep! > 0 ? 'high' : 'normal' },
      { key: 'stall', legend: t('lv.L13.ann.stall'), state: !m.ok ? 'off' : m.v.beds_in_line! <= 1 && !conv.met ? 'high' : 'normal' },
      { key: 'beds', legend: t('lv.L13.ann.beds'), state: m.v.beds! > 3 ? 'high' : 'normal' },
      { key: 'solve', legend: t('lv.L13.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L13.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.sinter) return { key: 'sinter', cause: t('lv.L13.cause.sinter', { T: f(s, m.v.tmax_c!), max: f(s, C(T_SINTER)), Tin: f(s, m.v.t_in_c!) }) };
    if (m.v.asleep! > 0) return { key: 'asleep', cause: t('lv.L13.cause.asleep', { Tin: f(s, m.v.t_in_c!), min: f(s, C(T_ASLEEP)) }) };
    if (m.v.beds_in_line! <= 1) return { key: 'stall', cause: t('lv.L13.cause.stall', { conv: f(s, m.v.conv_pct!), T: f(s, m.v.bed1_exit_c!), want: L13_CONV_MIN }) };
    return { key: 'short', cause: t('lv.L13.cause.short', { conv: f(s, m.v.conv_pct!), beds: m.v.beds_in_line!, want: L13_CONV_MIN }) };
  },
  equation: (s, m) => {
    if (!m.ok) return null;
    const a = shown(m.v.so2_fed!), b = shown(m.v.so2_out_kmol_h!);
    return `(${f(s, a)} − ${f(s, b)}) ÷ ${f(s, a)} × 100 = ${f(s, shown(((a - b) / a) * 100))} % of the SO₂ converted`;
  },
  lessonVars: (s, m) => ({ conv: f(s, m.v.conv_pct!), beds: m.v.beds_in_line!, bed1: f(s, m.v.bed1_pct!), exit: f(s, m.v.bed1_exit_c!), Tin: f(s, m.v.t_in_c!), tmax: f(s, m.v.tmax_c!) }),
  metrics: (_s, m) => [
    { key: 'conv', unit: '%', value: m.v.conv_pct! },
    { key: 'cost_usd_t', unit: 'USD/t', value: m.v.cost_usd_t! },
    { key: 'steam_t_h', unit: 't/h', value: m.v.steam_t_h! },
  ],
  histogram: { metric: 'cost_usd_t', best: (s) => refAcidCost(s), spread: 0.4, lowerIsBetter: true },
  solver: scripted([{ name: 'callIt', args: [bed1ExitC()] }, ...stairBuild(L13_REF.beds, L13_REF.Tin, L13_REF.Tin, L13_REF.Tlast)]),
  /** One bed, 410 C in: it stalls at the equilibrium curve. */
  naive: scripted(stairBuild(1, 683.15, 683.15, 683.15 - 10)),
};
void predictionOf; void relErr;
