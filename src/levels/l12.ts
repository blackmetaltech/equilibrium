// L12 · Pressure Does Nothing (DESIGN 2.6). CO (100 kmol/h, pre-placed) and a steam feed whose flow is the steam-to-CO knob -> mixer -> optional compressor ->
// isothermal equilibrium shift converter (R5, delta n = 0). Goal: CO at most 1.0 mol % (dry) at the outlet for the least steam + compression + catalyst per hour.
// Catalyst windows are read off the converter temperature (the unit has no catalyst knob): HTS 320-450 C (cheap), LTS 190-250 C (dearer); in between nothing works.
import type { Action } from '@core/kit';
import { fmtNumber, plumbing, pricesOf } from '../engine/solved';
import { t } from '../i18n';
import { OPERATING_HOURS, annualisedCapex, capexItem, steamPricePerT } from '../sim/econ';
import type { EqState } from '../state';
import { scripted } from './bench';
import { kOf, outStream } from './l10';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, flowOf, predictionOf, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L12_SPECIES = ['CO', 'H2O', 'CO2', 'H2'];
export const L12_CO_KMOL_H = 100;
export const L12_CO_MAX = 1.0;
export const L12_FEED_P = 5e5;
export const L12_K400_TOL = 0.02;
/** Catalyst windows (deg C, DESIGN 4.4) and catalyst bills, USD/h (GAME, UNVERIFIED). */
export const HTS = { lo: 320, hi: 450, usdH: 15 };
export const LTS = { lo: 190, hi: 250, usdH: 45 };
export const L12_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 5000 }, mixer: { max: 1, price: 3000 }, compressor: { max: 1, price: 50000 }, eq_reactor: { max: 1, price: 40000 }, product: { max: 1, price: 5000 },
};
export const L12_BUDGET = 130000;
export const L12_PRESETS = { eq_reactor: { reactions: 'R5', mode: 'isothermal', T: 463.15, Tmin: LTS.lo + 273.15 }, compressor: { P: L12_FEED_P, stages: 1 } };
/** Reference design: LTS at 200 C, S/CO 1.25 (this engine: 0.72 % CO). */
export const L12_REF = { T: 200 + 273.15, ratio: 1.25 };
/** The "help" that does nothing: HTS at 350 C, S/CO 3.0 (1.12 % CO, fails) and a 20-bar compressor. */
export const L12_NAIVE = { T: 350 + 273.15, ratio: 3.0, P: 20e5, stages: 4 };

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
export const K400_TRUTH = (): number => kOf('R5', 400 + 273.15);

/** 'hts' | 'lts' | 'none' for a converter temperature in deg C. */
export const catalystAt = (tc: number): 'hts' | 'lts' | 'none' => (tc >= HTS.lo - 1e-9 && tc <= HTS.hi + 1e-9 ? 'hts' : tc >= LTS.lo - 1e-9 && tc <= LTS.hi + 1e-9 ? 'lts' : 'none');
const catUsdH = (c: string): number => (c === 'hts' ? HTS.usdH : c === 'lts' ? LTS.usdH : 0);
/** Hourly bill of the reference design at a state's prices (steam of the reference S/CO, LTS catalyst, no compression). */
export const l12RefCost = (s: S): number => L12_REF.ratio * L12_CO_KMOL_H * 0.018015 * steamPricePerT(pricesOf(s)) + LTS.usdH;

export function shiftMeasures(s: S): Measures {
  const rx = unitsOfType(s, 'eq_reactor')[0], comp = unitsOfType(s, 'compressor')[0];
  const steamFeed = unitsOfType(s, 'feed').find((u) => (s.feeds[u.id]?.x[s.species.indexOf('H2O')] ?? 0) > 0.5);
  const steamKmol = steamFeed ? toKmolH(s.feeds[steamFeed.id]!.flow) : 0;
  const Tk = rx !== undefined && typeof rx.params.T === 'number' ? rx.params.T : 0;
  const tc = Tk > 0 ? Tk - 273.15 : 0;
  const cat = catalystAt(tc);
  const steamUsd = steamKmol * 0.018015 * steamPricePerT(pricesOf(s));
  const v: Record<string, number> = {
    t_c: tc, ratio: steamKmol / L12_CO_KMOL_H, steam_kmol_h: steamKmol, cat: cat === 'hts' ? 1 : cat === 'lts' ? 2 : 0, cat_ok: cat === 'none' ? 0 : 1,
    p_bar: 0, has_comp: comp !== undefined ? 1 : 0, co_dry_pct: 0, h2_kmol_h: 0, comp_kw: 0, steam_usd_h: steamUsd, comp_usd_h: 0, cat_usd_h: catUsdH(cat), cost_usd_h: 0,
    k_now: Tk > 0 ? kOf('R5', Tk) : 0, active: 0,
  };
  if (s.solved === null || !s.solved.ok || rx === undefined) return { ok: false, v };
  const out = outStream(s, rx.id);
  if (out === undefined) return { ok: false, v };
  const dry = out.n.reduce((a, b) => a + b, 0) - flowOf(s, out, 'H2O');
  v.co_dry_pct = dry > 0 ? (flowOf(s, out, 'CO') / dry) * 100 : 0;
  v.h2_kmol_h = toKmolH(flowOf(s, out, 'H2'));
  v.p_bar = out.P / 1e5;
  v.active = (s.solved.units[rx.id]?.info.active ?? 0) > 0.5 ? 1 : 0;
  if (comp !== undefined) {
    const info = s.solved.units[comp.id]?.info ?? {};
    v.comp_kw = info.shaft_kW ?? 0;
    const cap = v.comp_kw > 0 ? capexItem({ type: 'compressor', size: v.comp_kw, pBarg: Math.max(0, v.p_bar - 1.01325) }) : null;
    v.comp_usd_h = (cap !== null && cap.ok ? annualisedCapex(cap.value.cbm) / OPERATING_HOURS : 0) + (info.electric_kW ?? 0) * pricesOf(s).electricity!.value;
  }
  v.cost_usd_h = v.steam_usd_h! + v.comp_usd_h! + v.cat_usd_h!;
  return { ok: true, v };
}

/** Place and wire the shift plant after the two pre-placed feeds (F-101 CO, F-102 steam): mixer, optional compressor, converter, tank. */
export function shiftBuild(T: number, ratio: number, comp?: { P: number; stages: number }): Action[] {
  const a: Action[] = [{ name: 'setFeed', args: ['F-102', { flow: (ratio * L12_CO_KMOL_H * 1000) / 3600 }] }, { name: 'placeUnit', args: ['mixer', 5, 2, 0] }];
  let id = 103;
  const mix = `M-${id++}`;
  let upstream = mix;
  if (comp) { a.push({ name: 'placeUnit', args: ['compressor', 9, 2, 0] }); upstream = `K-${id++}`; }
  const rx = `R-${id++}`, tank = `T-${id++}`;
  a.push({ name: 'placeUnit', args: ['eq_reactor', 14, 0, 0] }, { name: 'placeUnit', args: ['product', 20, 2, 0] });
  if (comp) a.push({ name: 'setParam', args: [upstream, 'P', comp.P] }, { name: 'setParam', args: [upstream, 'stages', comp.stages] });
  a.push({ name: 'setParam', args: [rx, 'T', T] },
    { name: 'connect', args: ['F-101', 'out', mix, 'in1'] }, { name: 'connect', args: ['F-102', 'out', mix, 'in2'] });
  if (comp) a.push({ name: 'connect', args: [mix, 'out', upstream, 'in'] });
  a.push({ name: 'connect', args: [upstream, 'out', rx, 'in'] }, { name: 'connect', args: [rx, 'out', tank, 'in'] }, { name: 'commission' });
  return a;
}

const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const COACH: CoachStep[] = [
  { id: 'try_bigger', role: 'mentor', focus: 'compressor', done: (s) => has(s, 'compressor') || commissions(s) >= 1 },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_co', role: 'mentor', focus: 'product', done: (s) => ['read_co', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'mentor', done: (s) => s.ui.coachStep === 'why' },
];

export const L12: LevelSpec = {
  id: 'L12', firstRun: true, chapter: 3, index: 12, setter: 'mentor', budgetUSD: L12_BUDGET, units: L12_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L12_SPECIES, L12_UNITS, L12_PRESETS);
    putFeed(s, 0, 0, { CO: 1 }, L12_CO_KMOL_H, 298.15, L12_FEED_P);
    putFeed(s, 0, 4, { H2O: 1 }, L12_CO_KMOL_H, 440, L12_FEED_P);
    sealSetup(s);
  },
  measures: shiftMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'co', met: m.ok && m.v.co_dry_pct! <= L12_CO_MAX + 1e-9, ...(m.ok ? { value: m.v.co_dry_pct } : {}), target: L12_CO_MAX },
      { key: 'cat', met: m.v.cat_ok === 1 && (!m.ok || m.v.active === 1), value: m.v.t_c, target: LTS.lo },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L12_UNITS); g.push({ key: 'budget', met: sp <= L12_BUDGET, value: sp, target: L12_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [!has(s, 'compressor'), m.ok && m.v.cost_usd_h! <= l12RefCost(s) * 1.03],
  callIt: { key: 'k400', unit: '', tol: L12_K400_TOL, truth: () => K400_TRUTH() },
  hero: (_s, m) => ({ key: 'co_dry', unit: '%', value: m.v.co_dry_pct!, lo: 0, hi: L12_CO_MAX }),
  secondary: (_s, m) => ({ key: 'comp_kw', unit: 'kW', value: m.v.comp_kw!, limit: 1 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const co = g.find((x) => x.key === 'co')!;
    return [
      { key: 'co', legend: t('lv.L12.ann.co'), state: !m.ok ? 'off' : co.met ? 'normal' : m.v.co_dry_pct! > 3 ? 'critical' : 'high' },
      { key: 'cat', legend: t('lv.L12.ann.cat'), state: m.v.cat_ok ? 'normal' : 'high' },
      { key: 'steam', legend: t('lv.L12.ann.steam'), state: m.v.ratio! > 3.5 ? 'high' : 'normal' },
      { key: 'comp', legend: t('lv.L12.ann.comp'), state: !m.ok ? 'off' : m.v.comp_kw! > 0 ? 'high' : 'normal' },
      { key: 'solve', legend: t('lv.L12.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L12.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (!m.v.cat_ok) return { key: 'window', cause: t('lv.L12.cause.window', { T: f(s, m.v.t_c!), lts: LTS.hi, hts: HTS.lo }) };
    if (!m.v.active) return { key: 'asleep', cause: t('lv.L12.cause.asleep', { T: f(s, m.v.t_c!), min: LTS.lo }) };
    return m.v.comp_kw! > 0
      ? { key: 'push', cause: t('lv.L12.cause.push', { co: f(s, m.v.co_dry_pct!), P: f(s, m.v.p_bar!), kw: f(s, m.v.comp_kw!), ratio: f(s, m.v.ratio!), T: f(s, m.v.t_c!) }) }
      : { key: 'co_high', cause: t('lv.L12.cause.co_high', { co: f(s, m.v.co_dry_pct!), ratio: f(s, m.v.ratio!), T: f(s, m.v.t_c!), K: f(s, m.v.k_now!) }) };
  },
  equation: (s, m) => {
    if (!m.ok) return null;
    const out = outStream(s, unitsOfType(s, 'eq_reactor')[0]!.id)!;
    const fl = (id: string): number => shown(toKmolH(flowOf(s, out, id)));
    const c2 = fl('CO2'), h2 = fl('H2'), co = fl('CO'), w = fl('H2O');
    if (!(co > 0 && w > 0)) return null;
    return `${f(s, c2)} × ${f(s, h2)} ÷ (${f(s, co)} × ${f(s, w)}) = ${f(s, shown((c2 * h2) / (co * w)))} (K, with no pressure in it)`;
  },
  lessonVars: (s, m) => ({ co: f(s, m.v.co_dry_pct!), T: f(s, m.v.t_c!), ratio: f(s, m.v.ratio!), K: f(s, m.v.k_now!), P: f(s, m.v.p_bar!), kw: f(s, m.v.comp_kw!) }),
  metrics: (_s, m) => [
    { key: 'cost_usd_h', unit: 'USD/h', value: m.v.cost_usd_h! },
    { key: 'steam_ratio', unit: '', value: m.v.ratio! },
    { key: 'co_dry', unit: '%', value: m.v.co_dry_pct! },
  ],
  histogram: { metric: 'cost_usd_h', best: (s) => l12RefCost(s), spread: 0.6, lowerIsBetter: true },
  solver: scripted([{ name: 'callIt', args: [K400_TRUTH()] }, ...shiftBuild(L12_REF.T, L12_REF.ratio)]),
  naive: scripted(shiftBuild(L12_NAIVE.T, L12_NAIVE.ratio, { P: L12_NAIVE.P, stages: L12_NAIVE.stages })),
};
void plumbing; void predictionOf; void relErr;
