// L28 · Feed the World (DESIGN 2.6 chapter 7, capstone). Natural gas and steam in, ammonia out: feed-effluent exchanger, steam reformer (R6 + R5 equilibrium, fired), waste-heat boiler,
// shift converter, cooler and condensate drum, CO2 removal (fixed recovery, GAME regeneration energy), methanator, syngas compressor, the synthesis loop (L19 pattern: converter,
// cooler, ideal NH3 separator, purge, recycle compressor) with the purge burned as reformer fuel. The whole works is pre-built; the player's levers are the reformer exit temperature,
// the steam (the S/C ratio), the exchanger area, the shift temperature, the CO2 recovery and the purge. Goal: pilot-scale ammonia at or under the IFA 2008 survey average of 36.6 GJ/t;
// star 2: the top quartile (33 GJ/t); star 3: the calibrated best. The benchmarks (IFA 36.6, top quartile 33, best practice 28) ride on the printout. Energy = natural gas fed
// (LHV) + fuel gas for the furnace (fired duty / 0.85 minus the purge LHV) + steam raised for the reformer (liquid water to steam) - steam credited by the boiler + shaft work and
// refrigeration electricity (1:1) + CO2 regeneration steam + the air-separation energy of the nitrogen (GAME 28 kJ/mol, labelled).
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { REGIONS } from '../regions';
import { SPECIES } from '../data/species';
import { LHV_CH4, steamLatent } from '../sim/units/utilities';
import { THERMO, hOf } from '../sim/thermo/species';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, fromKmolH, link, predictionOf, put, putFeed, sealSetup, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L28_SPECIES = ['CH4', 'H2O', 'CO', 'CO2', 'H2', 'N2', 'NH3'];
export const P_REF = 25e5, P_LOOP = 1.5e7, DP_RX = 3e5, T_SYN = 723.15, T_CW = 313.15;
export const L28_NG_KMOL_H = 120, L28_STEAM_T = 673.15;
/** IFA 2008 survey average, top quartile and best practice, GJ per tonne NH3 (DESIGN 2.6 / 4.7). */
export const BENCH_GJ = { avg: 36.6, top: 33, best: 28 };
export const L28_NH3_MIN_T_D = 95;
/** Reference design (GAME, calibrated by ch6.test.ts): reformer exit, S/C, exchanger area, shift T, CO2 recovery, purge, N2 flow, best GJ/t. */
export const L28_REF = { T: 1153.15, sc: 2.5, area: 800, shift: 473.15, co2: 0.99, purge: 0.01, n2: 126, gj: 31.92 };
/** Star 3 line: the solver's own GJ/t + 1 % (GAME, pinned by ch6.test.ts). */
export const L28_STAR3_GJ = L28_REF.gj * 1.01;
/** Bench prices (GAME, UNVERIFIED) of the whole Works, so the Engineer budget is the plant. */
export const L28_UNITS: LevelSpec['units'] = {
  feed: { max: 3, price: 5000 }, mixer: { max: 1, price: 3000 }, mixer3: { max: 1, price: 4000 }, hx: { max: 1, price: 60000 }, reformer: { max: 1, price: 300000 }, boiler: { max: 1, price: 80000 }, eq_reactor: { max: 2, price: 50000 },
  cooler: { max: 2, price: 10000 }, flash: { max: 1, price: 20000 }, co2_removal: { max: 1, price: 90000 }, methanator: { max: 1, price: 30000 }, compressor: { max: 2, price: 150000 }, nh3_sep: { max: 1, price: 15000 },
  splitter: { max: 1, price: 2000 }, product: { max: 1, price: 5000 }, vent: { max: 2, price: 1500 }, sink: { max: 1, price: 1500 },
};
export const L28_BUDGET = 1100000;
const PRESETS = {
  reformer: { T: 1073.15 }, hx: { area: 400 }, boiler: { T: 543.15, steam: 'HP' }, eq_reactor: { reactions: 'R5', mode: 'isothermal', T: 473.15, Tmin: 463.15 }, cooler: { T: T_CW, utility: 'cw' }, flash: { T: T_CW, P: P_REF - 2e5 },
  co2_removal: { recovery: 0.99 }, compressor: { P: P_LOOP, stages: 3 }, splitter: { frac: 0.02 }, nh3_sep: { T: 253.15 },
};

/** Air-separation energy per mole of nitrogen fed, J/mol (GAME: about 0.35 kWh per Nm3 of cryogenic N2, labelled). */
export const ASU_J_MOL = 28e3;
const LHV_J_MOL: Record<string, number> = { H2: 241.83e3, CO: 283.0e3, NH3: 316.8e3 };
export const lhvOf = (id: string): number => (id === 'CH4' ? LHV_CH4 : LHV_J_MOL[id] ?? 0);

export const L28_IDS = { ng: 'F-101', steam: 'F-102', mix: 'M-103', hx: 'E-104', ref: 'R-105', boil: 'B-106', shift: 'R-107', cool: 'C-108', flash: 'D-109', co2: 'A-110', meth: 'R-111', comp: 'K-112', n2: 'F-113', mix3: 'M-114', syn: 'R-115', cool2: 'C-116', sep: 'D-117', split: 'X-118', comp2: 'K-119', prod: 'T-120', fuel: 'Y-121', co2vent: 'Y-122', cond: 'N-123' };

export function buildWorks(s: EqState): void {
  s.palette = null;
  const ng = putFeed(s, 0, 0, { CH4: 1 }, L28_NG_KMOL_H, 300, P_REF), st = putFeed(s, 0, 3, { H2O: 1 }, L28_REF.sc * L28_NG_KMOL_H, L28_STEAM_T, P_REF);
  const mix = put(s, 'mixer', 3, 1), hx = put(s, 'hx', 5, 6), ref = put(s, 'reformer', 7, 0, { T: 1073.15 }), boil = put(s, 'boiler', 12, 1, { T: 543.15, steam: 'HP' });
  const shift = put(s, 'eq_reactor', 16, 0, { reactions: 'R5', mode: 'isothermal', T: 473.15, Tmin: 463.15 }), cool = put(s, 'cooler', 21, 1, { T: T_CW, utility: 'cw' });
  const flash = put(s, 'flash', 21, 5, { T: T_CW, P: P_REF - 2e5 }), co2 = put(s, 'co2_removal', 18, 5, { recovery: 0.99 }), meth = put(s, 'methanator', 15, 5), comp = put(s, 'compressor', 10, 5, { P: P_LOOP, stages: 3 });
  const n2 = putFeed(s, 0, 12, { N2: 1 }, L28_REF.n2, 300, P_LOOP), mix3 = put(s, 'mixer3', 3, 9), syn = put(s, 'eq_reactor', 5, 10, { reactions: 'R1', mode: 'isothermal', T: T_SYN, dP: DP_RX });
  const cool2 = put(s, 'cooler', 10, 10, { T: T_CW, utility: 'cw' }), sep = put(s, 'nh3_sep', 13, 10, { T: 253.15 }), split = put(s, 'splitter', 16, 10, { frac: 0.02 }), comp2 = put(s, 'compressor', 9, 14, { P: P_LOOP, stages: 1 });
  const prod = put(s, 'product', 21, 10), fuel = put(s, 'vent', 18, 13), co2v = put(s, 'vent', 18, 8), cond = put(s, 'sink', 22, 8);
  void [ng, st];
  link(s, ng, 'out', mix, 'in1'); link(s, st, 'out', mix, 'in2'); link(s, mix, 'out', hx, 'cold_in'); link(s, hx, 'cold_out', ref, 'in'); link(s, ref, 'out', hx, 'hot_in'); link(s, hx, 'hot_out', boil, 'in');
  link(s, boil, 'out', shift, 'in'); link(s, shift, 'out', cool, 'in'); link(s, cool, 'out', flash, 'in'); link(s, flash, 'vap', co2, 'in'); link(s, flash, 'liq', cond, 'in');
  link(s, co2, 'out', meth, 'in'); link(s, co2, 'co2', co2v, 'in'); link(s, meth, 'out', comp, 'in'); link(s, comp, 'out', mix3, 'in1'); link(s, n2, 'out', mix3, 'in2');
  link(s, mix3, 'out', syn, 'in'); link(s, syn, 'out', cool2, 'in'); link(s, cool2, 'out', sep, 'in'); link(s, sep, 'vap', split, 'in'); link(s, sep, 'liq', prod, 'in');
  link(s, split, 'purge', fuel, 'in'); link(s, split, 'out', comp2, 'in'); link(s, comp2, 'out', mix3, 'in3');
  s.palette = [];
  sealSetup(s);
}

const un = (s: S, type: string) => unitsOfType(s, type);
const id = (s: S, key: keyof typeof L28_IDS) => s.flowsheet.units.find((u) => u.id === L28_IDS[key]);
const kg = (molS: number, sp: string): number => (molS * SPECIES[sp]!.M) / 1000;

export function worksMeasures(s: S): Measures {
  const ref = id(s, 'ref'), shift = id(s, 'shift'), sp = id(s, 'split'), hx = id(s, 'hx');
  const v: Record<string, number> = {
    ref_c: ref && typeof ref.params.T === 'number' ? (ref.params.T as number) - 273.15 : 0, sc: 0, area: hx && typeof hx.params.area === 'number' ? (hx.params.area as number) : 0,
    shift_c: shift && typeof shift.params.T === 'number' ? (shift.params.T as number) - 273.15 : 0, co2_rec: 0, purge_pct: sp && typeof sp.params.frac === 'number' ? (sp.params.frac as number) * 100 : 0,
    nh3_t_d: 0, gj_per_t: 0, co2_t_per_t: 0, cost_per_t: 0, x_ch4: 0, ch4_slip_pct: 0, co_slip_pct: 0, h2_n2: 0, loop_kmol_h: 0, fuel_gj_h: 0, purge_lhv_gj_h: 0, fired_gj_h: 0, e_gj_h: 0, nh3_t_h: 0,
    steam_credit_gj_h: 0, feed_gj_h: 0, el_gj_h: 0, regen_gj_h: 0, steam_gen_gj_h: 0, bench_avg: BENCH_GJ.avg, bench_top: BENCH_GJ.top, bench_best: BENCH_GJ.best, bat_co2: 1.6,
  };
  const ch4 = fedOf(s, 'CH4'), h2o = fedOf(s, 'H2O');
  v.sc = ch4 > 0 ? h2o / ch4 : 0;
  const co2u = id(s, 'co2'); v.co2_rec = co2u && typeof co2u.params.recovery === 'number' ? (co2u.params.recovery as number) * 100 : 0;
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const so = s.solved.units, k = s.solved.kpis, streams = s.solved.streams;
  const into = (uid: string, port = 'in') => { const p = s.flowsheet.streams.find((q) => q.to.unit === uid && q.to.port === port); return p ? streams[p.id] : undefined; };
  const prod = into(L28_IDS.prod), fuel = into(L28_IDS.fuel), co2v = into(L28_IDS.co2vent), loopIn = into(L28_IDS.syn);
  const iN = (st: { n: number[] } | undefined, spc: string): number => (st ? st.n[s.species.indexOf(spc)] ?? 0 : 0);
  const nh3MolS = iN(prod, 'NH3'), nh3Kg = kg(nh3MolS, 'NH3');
  v.nh3_t_h = nh3Kg * 3.6; v.nh3_t_d = nh3Kg * 86.4;
  v.x_ch4 = so[L28_IDS.ref]?.info.x_ch4 ?? 0;
  const methIn = into(L28_IDS.meth);
  const tot = (st: { n: number[] } | undefined): number => (st ? st.n.reduce((a, b) => a + b, 0) : 0);
  const dry = tot(methIn) - iN(methIn, 'H2O');
  v.ch4_slip_pct = dry > 0 ? (iN(methIn, 'CH4') / dry) * 100 : 0; v.co_slip_pct = dry > 0 ? ((iN(methIn, 'CO') + iN(methIn, 'CO2')) / dry) * 100 : 0;
  const fresh = into(L28_IDS.mix3, 'in1'), nit = into(L28_IDS.mix3, 'in2');
  v.h2_n2 = iN(nit, 'N2') > 0 ? iN(fresh, 'H2') / iN(nit, 'N2') : 0; v.loop_kmol_h = toKmolH(tot(loopIn));
  // energy
  const steamFeed = s.flowsheet.units.find((u) => u.id === L28_IDS.steam), Ts = steamFeed ? s.feeds[steamFeed.id]?.T ?? L28_STEAM_T : L28_STEAM_T;
  const eSteamGen = h2o * (hOf(THERMO.H2O!, Ts) - hOf(THERMO['H2O(l)']!, 298.15));
  const eFeed = ch4 * LHV_CH4;
  const fired = (k.fired_duty_kw ?? 0) * 1000, fuelNeed = fired / 0.85;
  const purgeLhv = fuel ? s.species.reduce((a, spc, i) => a + (fuel.n[i] ?? 0) * lhvOf(spc), 0) : 0;
  const eFuel = Math.max(0, fuelNeed - purgeLhv);
  const credit = (k.steam_raised_t_per_h ?? 0) / 3.6 * 2361e3;
  const refrig = so[L28_IDS.sep]?.info.refrig_electric_W ?? 0, el = (k.electric_kw ?? 0) * 1000 + refrig;
  const regen = so[L28_IDS.co2]?.info.regen_W ?? 0;
  const eAsu = fedOf(s, 'N2') * ASU_J_MOL;
  const E = eFeed + eFuel + eSteamGen - credit + el + regen + eAsu;
  const gj = nh3Kg > 0 ? (E / nh3Kg) * 1e-6 : 0;
  Object.assign(v, { gj_per_t: gj, e_gj_h: (E * 3.6) / 1e6, fuel_gj_h: (eFuel * 3.6) / 1e6, purge_lhv_gj_h: (purgeLhv * 3.6) / 1e6, fired_gj_h: (fired * 3.6) / 1e6, steam_credit_gj_h: (credit * 3.6) / 1e6, feed_gj_h: (eFeed * 3.6) / 1e6, el_gj_h: (el * 3.6) / 1e6, regen_gj_h: (regen * 3.6) / 1e6, steam_gen_gj_h: (eSteamGen * 3.6) / 1e6, asu_gj_h: (eAsu * 3.6) / 1e6 });
  // CO2: vented process CO2 + the carbon burnt in the furnace (fuel gas) + the carbon in the purge
  const cMolS = iN(co2v, 'CO2') + eFuel / LHV_CH4 + iN(fuel, 'CH4') + iN(fuel, 'CO') + iN(fuel, 'CO2');
  v.co2_t_per_t = nh3Kg > 0 ? kg(cMolS, 'CO2') / nh3Kg : 0;
  v.cost_per_t = k.cost_usd_per_t ?? 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const code = (s: S): string => (s.solved !== null && !s.solved.ok ? s.solved.failure?.code ?? '' : '');
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'call_x', role: 'manager', done: (s) => predictionOf(s, 'x_ch4') !== null || commissions(s) > 0 },
  { id: 'set_reformer', role: 'manager', focus: 'reformer', done: (s) => { const r = id(s, 'ref'); return r !== undefined && typeof r.params.T === 'number' && (r.params.T as number) !== 1073.15; } },
  { id: 'open_purge', role: 'manager', focus: 'splitter', done: (s) => { const p = id(s, 'split'); return p !== undefined && typeof p.params.frac === 'number' && (p.params.frac as number) > 0; } },
  { id: 'commission', role: 'manager', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_energy', role: 'manager', done: LATE(['read_energy', 'why']) },
  { id: 'why', role: 'manager', done: LATE(['why']) },
];

export const L28: LevelSpec = {
  id: 'L28', firstRun: true, chapter: 7, index: 28, setter: 'manager', budgetUSD: L28_BUDGET, units: L28_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, L28_SPECIES, L28_UNITS, PRESETS); buildWorks(s); },
  measures: worksMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
    { key: 'nh3', met: m.ok && m.v.nh3_t_d! >= L28_NH3_MIN_T_D, ...(m.ok ? { value: m.v.nh3_t_d } : {}), target: L28_NH3_MIN_T_D },
    { key: 'gj', met: m.ok && m.v.gj_per_t! > 0 && m.v.gj_per_t! <= BENCH_GJ.avg, ...(m.ok ? { value: m.v.gj_per_t } : {}), target: BENCH_GJ.avg },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L28_UNITS); g.push({ key: 'budget', met: sp <= L28_BUDGET, value: sp, target: L28_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.gj_per_t! > 0 && m.v.gj_per_t! <= BENCH_GJ.top, m.ok && m.v.gj_per_t! > 0 && m.v.gj_per_t! <= L28_STAR3_GJ],
  callIt: { key: 'x_ch4', unit: '%', tol: 0.02, truth: (_s, m) => (m.ok ? m.v.x_ch4! * 100 : null) },
  hero: (_s, m) => ({ key: 'gj_per_t', unit: 'GJ/t', value: m.v.gj_per_t!, lo: BENCH_GJ.best, hi: BENCH_GJ.avg * 1.2 }),
  secondary: (_s, m) => ({ key: 'nh3_t_d', unit: 't/d', value: m.v.nh3_t_d!, limit: L28_NH3_MIN_T_D }),
  annunciators: (s, m, g): Annunciator[] => [
    { key: 'noexit', legend: t('lv.L28.ann.noexit'), state: code(s) === 'NO_EXIT' ? 'critical' : 'off' },
    { key: 'slip', legend: t('lv.L28.ann.slip'), state: lit(m, m.v.ch4_slip_pct! <= 3) },
    { key: 'stoich', legend: t('lv.L28.ann.stoich'), state: lit(m, Math.abs(m.v.h2_n2! - 3) <= 0.5) },
    { key: 'energy', legend: t('lv.L28.ann.energy'), state: lit(m, g.find((x) => x.key === 'gj')!.met) },
    { key: 'solve', legend: t('lv.L28.ann.solve'), state: s.solved !== null && !s.solved.ok ? 'critical' : 'off' },
    { key: 'goal', legend: t('lv.L28.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
  ],
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.nh3_t_d! < L28_NH3_MIN_T_D) return { key: 'short', cause: t('lv.L28.cause.short', { nh3: f(s, m.v.nh3_t_d!), want: f(s, L28_NH3_MIN_T_D), ratio: f(s, m.v.h2_n2!), slip: f(s, m.v.ch4_slip_pct!) }) };
    return { key: 'energy', cause: t('lv.L28.cause.energy', { gj: f(s, m.v.gj_per_t!), avg: f(s, BENCH_GJ.avg), fuel: f(s, m.v.fuel_gj_h!), feed: f(s, m.v.feed_gj_h!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.nh3_t_h! > 0)) return null;
    const e = Math.round(m.v.e_gj_h! * 10) / 10, q = Math.round(m.v.nh3_t_h! * 1000) / 1000;
    return `${f(s, e)} ÷ ${f(s, q)} = ${f(s, Math.round((e / q) * 10) / 10)} GJ per tonne of NH₃`;
  },
  lessonVars: (s, m) => ({ gj: f(s, m.v.gj_per_t!), nh3: f(s, m.v.nh3_t_d!), x: f(s, m.v.x_ch4! * 100), t: f(s, m.v.ref_c!), sc: f(s, m.v.sc), co2: f(s, m.v.co2_t_per_t!), avg: f(s, BENCH_GJ.avg), top: f(s, BENCH_GJ.top), best: f(s, BENCH_GJ.best), purge: f(s, m.v.purge_pct!) }),
  metrics: (_s, m) => [
    { key: 'gj_per_t', unit: 'GJ/t', value: m.v.gj_per_t! },
    { key: 'co2_t_per_t', unit: 't/t', value: m.v.co2_t_per_t! },
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
  ],
  histogram: { metric: 'gj_per_t', best: () => L28_REF.gj, spread: 0.08, lowerIsBetter: true },
  card: (_s, m): Record<string, number | string> => (m.ok ? { gj_per_t: m.v.gj_per_t!, ifa_avg: BENCH_GJ.avg, ifa_top: BENCH_GJ.top, best: BENCH_GJ.best, co2_t_per_t: m.v.co2_t_per_t!, bat_co2: 1.6 } : {}),
  solver: () => scripted(worksScript(L28_REF.T, L28_REF.sc, L28_REF.area, L28_REF.shift, L28_REF.co2, L28_REF.purge, L28_REF.n2, true))(),
  naive: () => scripted(worksScript(1073.15, 3, 400, 473.15, 0.99, 0, 125, false))(),
};

/** The player's play: Call it (SMR conversion), set the reformer exit, the steam, the exchanger, the shift, the CO2 recovery, the purge and the nitrogen, commission. */
export function worksScript(T: number, sc: number, area: number, shift: number, co2: number, purge: number, n2: number, callIt: boolean, callX = 68.5): Action[] {
  const a: Action[] = [];
  if (callIt) a.push({ name: 'callIt', args: [callX] });
  a.push(
    { name: 'setParam', args: [L28_IDS.ref, 'T', T] }, { name: 'setParam', args: [L28_IDS.steam, 'flow', fromKmolH(sc * L28_NG_KMOL_H)] }, { name: 'setParam', args: [L28_IDS.hx, 'area', area] },
    { name: 'setParam', args: [L28_IDS.shift, 'T', shift] }, { name: 'setParam', args: [L28_IDS.co2, 'recovery', co2] }, { name: 'setParam', args: [L28_IDS.split, 'frac', purge] },
    { name: 'setParam', args: [L28_IDS.n2, 'flow', fromKmolH(n2)] }, { name: 'commission' },
  );
  return a;
}
void REGIONS; void steamLatent; void un;
