// L11 · The Gas You Were Sold (DESIGN 2.6). Three syngas contracts (A pure 1:3, B 5 % argon + methane, C 10 %), each a pre-placed feed whose flow the player
// sets: 1000 kmol/h in total, 450 C converter, pressure free up to 200 bar. Goal: at least 170 kmol/h of NH3 formed in one pass for the least $/t including the gas.
// Inerts at constant P dilute the reactants (the reaction shifts left), so the cheap gas needs more pressure; the 10 % gas only just makes it at the vessel limit.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import type { EqState } from '../state';
import { scripted } from './bench';
import { L10_FEED_P, NH3_PRESETS, ammoniaBuild, ammoniaMeasures, costPerT, outStream, refCost, type CostParts } from './l10';
import type { Annunciator, CoachStep, LevelSpec } from './spec';
import { baseSetup, commissions, flowOf, putFeed, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L11_SPECIES = ['N2', 'H2', 'NH3', 'Ar', 'CH4'];
export const L11_NH3_MIN = 170;
export const L11_GAS_KMOL_H = 1000;
export const L11_GAS_TOL = 0.01;
export const L11_T_K = 723.15;
export const L11_T_TOL = 1;
export const L11_P_MAX = 200;
export const L11_P_STAR = 150;
/** The three contracts: inert fraction (half argon, half methane) and price, USD per kmol (GAME, UNVERIFIED). Order = feed unit order F-101..F-103. */
export const L11_CONTRACTS = [{ id: 'A', inert: 0, price: 1.5 }, { id: 'B', inert: 0.05, price: 1.4 }, { id: 'C', inert: 0.1, price: 1.385 }] as const;
export const L11_UNITS: LevelSpec['units'] = {
  feed: { max: 3, price: 6000 }, mixer3: { max: 1, price: 4000 }, compressor: { max: 1, price: 60000 }, eq_reactor: { max: 1, price: 50000 }, nh3_sep: { max: 1, price: 12000 },
  product: { max: 1, price: 5000 }, vent: { max: 1, price: 1500 },
};
export const L11_BUDGET = 190000;
/** The reference build: contract B at 167 bar, four stages (this engine: 170.0 kmol/h at 166.8 bar; DESIGN says about 175). */
export const L11_REF = { P: 167e5, stages: 4, flows: [0, 1000, 0] };
export const L11_REF_PARTS: CostParts = { shaftKW: 1938.36, electricKW: 2040.37, compCbm: 2435257, vesselCbm: 793937, nh3TperH: 2.8969 };

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

/** Gas bill, USD/h, and the bought gas, kmol/h, and its inert mole % from the three feed units' flows. */
export function gasOf(s: S): { usdH: number; kmolH: number; inertPct: number } {
  let usd = 0, kmol = 0, inert = 0;
  unitsOfType(s, 'feed').forEach((u, i) => {
    const fd = s.feeds[u.id];
    const c = L11_CONTRACTS[i];
    if (!fd || !c) return;
    const k = toKmolH(fd.flow);
    kmol += k; usd += k * c.price; inert += k * c.inert * 100;
  });
  return { usdH: usd, kmolH: kmol, inertPct: kmol > 0 ? inert / kmol : 0 };
}

export function gasMeasures(s: S) {
  const m = ammoniaMeasures(s, (x) => gasOf(x).usdH);
  const g = gasOf(s);
  m.v.gas_kmol_h = g.kmolH; m.v.inert_pct = g.inertPct;
  m.v.gas_share = m.ok && m.v.cost_usd_t! > 0 && m.v.nh3_t_h! > 0 ? (g.usdH / m.v.nh3_t_h! / m.v.cost_usd_t!) * 100 : 0;
  return m;
}

const COACH: CoachStep[] = [
  { id: 'pick_gas', role: 'supervisor', focus: 'feed', done: (s) => s.flowsheet.units.length > 3 },
  { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_inert', role: 'supervisor', focus: 'vent', done: (s) => ['read_inert', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'supervisor', done: (s) => s.ui.coachStep === 'why' },
];

export const L11: LevelSpec = {
  id: 'L11', firstRun: true, chapter: 3, index: 11, setter: 'supervisor', budgetUSD: L11_BUDGET, units: L11_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L11_SPECIES, L11_UNITS, { ...NH3_PRESETS, eq_reactor: { ...NH3_PRESETS.eq_reactor, T: L11_T_K } });
    L11_CONTRACTS.forEach((c, i) => {
      const a = (1 - c.inert) / 4;
      putFeed(s, 0, i * 4, { N2: a, H2: 3 * a, Ar: c.inert / 2, CH4: c.inert / 2 }, i === 0 ? L11_GAS_KMOL_H : 0, 298.15, L10_FEED_P);
    });
    sealSetup(s);
  },
  measures: gasMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'nh3', met: m.ok && m.v.nh3_formed! >= L11_NH3_MIN - 1e-9, ...(m.ok ? { value: m.v.nh3_formed } : {}), target: L11_NH3_MIN },
      { key: 'gas', met: Math.abs(m.v.gas_kmol_h! - L11_GAS_KMOL_H) <= L11_GAS_TOL * L11_GAS_KMOL_H, value: m.v.gas_kmol_h, target: L11_GAS_KMOL_H },
      { key: 'temp', met: Math.abs(m.v.t_c! - (L11_T_K - 273.15)) <= L11_T_TOL, value: m.v.t_c, target: L11_T_K - 273.15 },
      { key: 'press', met: m.v.p_bar! <= L11_P_MAX + 1e-6, value: m.v.p_bar, target: L11_P_MAX },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L11_UNITS); g.push({ key: 'budget', met: sp <= L11_BUDGET, value: sp, target: L11_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.p_bar! <= L11_P_STAR + 1e-6, m.ok && m.v.cost_usd_t! <= refCost(s, L11_REF_PARTS, L11_CONTRACTS[1].price * L11_GAS_KMOL_H) * 1.03],
  callIt: null,
  hero: (_s, m) => ({ key: 'nh3_formed', unit: 'kmol/h', value: m.v.nh3_formed!, lo: L11_NH3_MIN, hi: 400 }),
  secondary: (_s, m) => ({ key: 'inert_pct', unit: '%', value: m.v.inert_pct!, limit: 5 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const nh3 = g.find((x) => x.key === 'nh3')!;
    return [
      { key: 'nh3', legend: t('lv.L11.ann.nh3'), state: !m.ok ? 'off' : nh3.met ? 'normal' : 'high' },
      { key: 'inert', legend: t('lv.L11.ann.inert'), state: m.v.inert_pct! > 7.5 ? 'critical' : m.v.inert_pct! > 0.5 ? 'high' : 'normal' },
      { key: 'gas', legend: t('lv.L11.ann.gas'), state: g.find((x) => x.key === 'gas')!.met ? 'normal' : 'high' },
      { key: 'temp', legend: t('lv.L11.ann.temp'), state: g.find((x) => x.key === 'temp')!.met ? 'normal' : 'high' },
      { key: 'press', legend: t('lv.L11.ann.press'), state: !m.ok ? 'off' : m.v.p_bar! > L11_P_MAX ? 'critical' : m.v.p_bar! > L11_P_STAR ? 'high' : 'normal' },
      { key: 'solve', legend: t('lv.L11.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L11.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (!g.find((x) => x.key === 'gas')!.met) return { key: 'gas', cause: t('lv.L11.cause.gas', { gas: f(s, m.v.gas_kmol_h!), want: L11_GAS_KMOL_H }) };
    if (!g.find((x) => x.key === 'temp')!.met) return { key: 'temp', cause: t('lv.L11.cause.temp', { T: f(s, m.v.t_c!), want: f(s, L11_T_K - 273.15) }) };
    if (!g.find((x) => x.key === 'press')!.met) return { key: 'press', cause: t('lv.L11.cause.press', { P: f(s, m.v.p_bar!), max: L11_P_MAX }) };
    return { key: 'short', cause: t('lv.L11.cause.short', { nh3: f(s, m.v.nh3_formed!), want: L11_NH3_MIN, inert: f(s, m.v.inert_pct!), P: f(s, m.v.p_bar!) }) };
  },
  equation: (s, m) => {
    if (!m.ok) return null;
    const out = outStream(s, unitsOfType(s, 'eq_reactor')[0]!.id)!;
    const tot = out.n.reduce((a, b) => a + b, 0);
    const y = shown((flowOf(s, out, 'NH3') / tot) * 100), n = shown(tot * 3.6);
    return `${f(s, y)} ÷ 100 × ${f(s, n)} = ${f(s, shown((y / 100) * n))} kmol/h of NH₃ leaving the converter`;
  },
  lessonVars: (s, m) => ({ y: f(s, m.v.y_pct!), inert: f(s, m.v.inert_pct!), P: f(s, m.v.p_bar!), nh3: f(s, m.v.nh3_formed!), gas: f(s, m.v.gas_usd_h!) }),
  metrics: (_s, m) => [
    { key: 'cost_usd_t', unit: 'USD/t', value: m.v.cost_usd_t! },
    { key: 'p_bar', unit: 'bar', value: m.v.p_bar! },
    { key: 'gas_share', unit: '%', value: m.v.gas_share! },
  ],
  histogram: { metric: 'cost_usd_t', best: (s) => refCost(s, L11_REF_PARTS, L11_CONTRACTS[1].price * L11_GAS_KMOL_H), spread: 0.15, lowerIsBetter: true },
  solver: scripted([
    ...L11_REF.flows.map((fl, i) => ({ name: 'setFeed', args: [`F-${101 + i}`, { flow: (fl * 1000) / 3600 }] })),
    ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, L11_REF.P, L11_REF.stages, 104),
  ]),
  /** The cheapest gas by its price tag: contract C at the pure-gas pressure (150 bar). */
  naive: scripted([
    { name: 'setFeed', args: ['F-101', { flow: 0 }] }, { name: 'setFeed', args: ['F-103', { flow: (L11_GAS_KMOL_H * 1000) / 3600 }] },
    ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, 150e5, 4, 104),
  ]),
};
void costPerT;
