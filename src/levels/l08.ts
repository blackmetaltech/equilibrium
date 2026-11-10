// L08 · Pay Once (DESIGN 2.6, heat integration). Victor's furnace line heats 1000 kmol/h of synthesis gas from 40 to 420 C with a fired heater, and the old furnace's flue
// gas (900 C) goes straight up the stack. A heat exchanger lets the flue pay once: it preheats the synthesis gas and the fired heater only trims the rest. The exchanger's
// area is the one dial with an interior optimum: more area saves fuel but the marginal saving falls as the temperature approach closes, while the exchanger costs per m2.
// Rules stated in the brief (GAME): approach at least 20 K, stack at least 120 C. A shift (fuel_price, cw_hot_day) follows; the area is fixed during it.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import type { EqState } from '../state';
import type { Annunciator, CoachStep, GoalEval, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, inStream, putFeed, sealSetup, shown, spentOf, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L08_SPECIES = ['N2', 'H2', 'O2', 'CO2', 'H2O'];
export const SYN_KMOL_H = 1000, SYN_IN_C = 40, SYN_OUT_C = 420, SYN_TOL_C = 1;
/** The old furnace's flue: composition (CO2 8, H2O 16, N2 72, O2 4 mol %), flow and temperature (GAME). */
export const FLUE_KMOL_H = 380, FLUE_IN_C = 900;
export const DT_MIN_K = 20, STACK_MIN_C = 120;
export const RECOVER_MIN = 0.25;
export const L08_LEN_S = 8 * 3600;
export const L08_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 4000 }, hx: { max: 1, price: 30000 }, heater: { max: 1, price: 40000 }, stack: { max: 1, price: 8000 }, product: { max: 1, price: 5000 },
};
export const L08_BUDGET = 110000;
const PRESETS = { heater: { T: SYN_OUT_C + 273.15, utility: 'fired' }, hx: { area: 50, U: 12 } };
/** The calibrated optimum area, m2 (GAME, UNVERIFIED): the cheapest area that keeps the stack at 120 C or more (the same in both regions; ch2.test.ts re-derives it by sweep). */
export const OPT_AREA = 990;
/** Star-3 cost thresholds per region: the sweep minimum x 1.03, USD/h (GAME, UNVERIFIED; ch2.test.ts re-derives them). */
export const COST_STAR: Readonly<Record<string, number>> = { global: 78.27, in: 763.25 };
const C = (K: number): number => K - 273.15;
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;

export function pinchMeasures(s: S): Measures {
  const v: Record<string, number> = {
    syn_fed: SYN_KMOL_H, area: 0, syn_out_K: 0, flue_out_K: 0, hx_mw: 0, fuel_mw: 0, dt_min: 0, recover: 0, cost_usd_h: 0, fuel_usd_h: 0, capex_usd: 0,
    shift_t: 0, shift_len: L08_LEN_S, ended: 0, fuel_up: 0, duty_mw: 0, cost_ref_star: COST_STAR[s.region] ?? COST_STAR.global!,
  };
  const sh = s.shift;
  if (sh) { v.shift_t = sh.t; v.shift_len = sh.len; v.ended = sh.ended === 'time' ? 1 : 0; v.fuel_up = sh.act.some((e) => e.type === 'fuel_price') ? 1 : 0; }
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const hx = unitsOfType(s, 'hx')[0], hea = unitsOfType(s, 'heater')[0], stk = unitsOfType(s, 'stack')[0], prod = unitsOfType(s, 'product')[0];
  if (!hx || !hea || !stk || !prod) return { ok: false, v };
  const hi = s.solved.units[hx.id]?.info ?? {}, he = s.solved.units[hea.id]?.info ?? {};
  v.area = hi.area ?? 0; v.hx_mw = (hi.Q ?? 0) / 1e6; v.dt_min = hi.dT_min ?? 0;
  const st = inStream(s, stk.id), po = inStream(s, prod.id);
  v.flue_out_K = st?.T ?? 0; v.syn_out_K = po?.T ?? 0;
  v.fuel_mw = (he.fuel_W ?? 0) / 1e6;
  v.duty_mw = v.hx_mw + Math.abs(he.Q ?? 0) / 1e6;
  v.recover = v.duty_mw > 0 ? v.hx_mw / v.duty_mw : 0;
  const k = s.solved.kpis;
  v.cost_usd_h = (k.annual_cost_usd ?? 0) / 8000; v.capex_usd = k.capex_usd ?? 0;
  return { ok: true, v };
}

const COACH: CoachStep[] = [
  { id: 'place_hx', role: 'manager', focus: 'hx', done: (s) => has(s, 'hx') },
  { id: 'pipe_up', role: 'manager', done: (s) => s.flowsheet.streams.length >= 6 },
  { id: 'size_area', role: 'manager', focus: 'hx', done: (s) => commissions(s) >= 1 },
  { id: 'sweep', role: 'manager', focus: 'key', done: (s) => commissions(s) >= 2 },
];

/** Plant ids: F-101 synthesis gas, F-102 flue (pre-placed), E-103 exchanger, H-104 fired heater, Z-105 stack, T-106 product. */
export function pinchBuild(area: number, last: Action[] = [{ name: 'commission' }, { name: 'startShift', args: ['shift'] }]): Action[] {
  return [
    { name: 'placeUnit', args: ['hx', 6, 2, 0] }, { name: 'placeUnit', args: ['heater', 12, 2, 0] }, { name: 'placeUnit', args: ['stack', 12, 8, 0] }, { name: 'placeUnit', args: ['product', 18, 2, 0] },
    { name: 'setParam', args: ['E-103', 'area', area] },
    { name: 'connect', args: ['F-102', 'out', 'E-103', 'hot_in'] }, { name: 'connect', args: ['F-101', 'out', 'E-103', 'cold_in'] },
    { name: 'connect', args: ['E-103', 'hot_out', 'Z-105', 'in'] }, { name: 'connect', args: ['E-103', 'cold_out', 'H-104', 'in'] }, { name: 'connect', args: ['H-104', 'out', 'T-106', 'in'] },
    ...last,
  ];
}
/** The engineer: the cheapest area that keeps the stack at 120 C, a commission, the shift played through in one go. */
const solver = () => {
  let built = false;
  return (s: S): Action[] => {
    if (!built) { built = true; return pinchBuild(OPT_AREA); }
    // 9000-second chunks with a setSpeed between them: the solution log merges neighbouring ticks and a replayed tick is at most 10000 seconds
    return s.shift !== null && s.shift.ended === '' ? [{ name: 'tick', args: [9000] }, { name: 'setSpeed', args: [1] }] : [];
  };
};
/** The novice who sees fuel and nothing else: a token exchanger (1 m2), the fired heater does everything. */
const naive = () => {
  let done = false;
  return (): Action[] => { if (done) return []; done = true; return pinchBuild(1, [{ name: 'commission' }]); };
};

export const L08: LevelSpec = {
  id: 'L08', chapter: 2, index: 8, setter: 'manager', budgetUSD: L08_BUDGET, units: L08_UNITS, notes: 2, shiftLen: L08_LEN_S, maxTicks: L08_LEN_S + 600,
  setup: (s) => {
    baseSetup(s, L08_SPECIES, L08_UNITS, PRESETS);
    putFeed(s, 0, 0, { N2: 0.25, H2: 0.75 }, SYN_KMOL_H, SYN_IN_C + 273.15, 1.5e5);
    putFeed(s, 0, 6, { N2: 0.72, O2: 0.04, CO2: 0.08, H2O: 0.16 }, FLUE_KMOL_H, FLUE_IN_C + 273.15, 1.05e5);
    sealSetup(s);
  },
  measures: pinchMeasures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'outlet', met: m.ok && Math.abs(C(m.v.syn_out_K!) - SYN_OUT_C) <= SYN_TOL_C, ...(m.ok ? { value: C(m.v.syn_out_K!) } : {}), target: SYN_OUT_C },
      { key: 'recover', met: m.ok && m.v.recover! >= RECOVER_MIN, ...(m.ok ? { value: m.v.recover! * 100 } : {}), target: RECOVER_MIN * 100 },
      { key: 'shift', met: m.ok && m.v.ended === 1, value: m.v.shift_t! / 3600, target: m.v.shift_len! / 3600 },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L08_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L08_BUDGET, value: sp, target: L08_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => {
    const rules = m.ok && m.v.ended === 1 && m.v.dt_min! >= DT_MIN_K && C(m.v.flue_out_K!) >= STACK_MIN_C;
    return [rules, rules && m.v.cost_usd_h! <= m.v.cost_ref_star!];
  },
  callIt: null,
  hero: (_s, m) => ({ key: 'cost', unit: 'USD/h', value: m.v.cost_usd_h!, lo: 0, hi: m.v.cost_ref_star! }),
  secondary: (_s, m) => ({ key: 'fuel_mw', unit: 'MW', value: m.v.fuel_mw!, limit: 3.6 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'out', legend: t('lv.L08.ann.out'), state: !m.ok ? 'off' : Math.abs(C(m.v.syn_out_K!) - SYN_OUT_C) > SYN_TOL_C ? 'high' : 'normal' },
      { key: 'dt', legend: t('lv.L08.ann.dt'), state: !m.ok ? 'off' : m.v.dt_min! < DT_MIN_K ? 'high' : 'normal' },
      { key: 'stack', legend: t('lv.L08.ann.stack'), state: !m.ok ? 'off' : C(m.v.flue_out_K!) < STACK_MIN_C ? 'critical' : 'normal' },
      { key: 'recover', legend: t('lv.L08.ann.recover'), state: !m.ok ? 'off' : m.v.recover! < RECOVER_MIN ? 'high' : 'normal' },
      { key: 'fuel', legend: t('lv.L08.ann.fuel'), state: !m.ok ? 'off' : m.v.fuel_up ? 'high' : 'off' },
      { key: 'solve', legend: t('lv.L08.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L08.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (Math.abs(C(m.v.syn_out_K!) - SYN_OUT_C) > SYN_TOL_C) return { key: 'outlet', cause: t('lv.L08.cause.outlet', { c: f(s, C(m.v.syn_out_K!)), want: SYN_OUT_C }) };
    if (C(m.v.flue_out_K!) < STACK_MIN_C) return { key: 'stack', cause: t('lv.L08.cause.stack', { c: f(s, C(m.v.flue_out_K!)), min: STACK_MIN_C }) };
    if (m.v.recover! < RECOVER_MIN) return { key: 'bare', cause: t('lv.L08.cause.bare', { q: f(s, m.v.hx_mw!), fuel: f(s, m.v.fuel_mw!), area: f(s, m.v.area!), stack: f(s, C(m.v.flue_out_K!)) }) };
    return { key: 'unfinished', cause: t('lv.L08.cause.unfinished', { t: f(s, m.v.shift_t! / 3600), len: f(s, m.v.shift_len! / 3600) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.duty_mw! > 0)) return null;
    const a = shown(m.v.hx_mw!), b = shown(m.v.duty_mw! - m.v.hx_mw!);
    return `${f(s, a)} + ${f(s, b)} = ${f(s, shown(a + b))} MW of heat to the synthesis gas`;
  },
  lessonVars: (s, m) => ({ q: f(s, m.v.hx_mw!), fuel: f(s, m.v.fuel_mw!), area: f(s, m.v.area!), dt: f(s, m.v.dt_min!), stack: f(s, C(m.v.flue_out_K!)), cost: f(s, m.v.cost_usd_h!) }),
  metrics: (_s, m) => [
    { key: 'cost_usd_h', unit: 'USD/h', value: m.v.cost_usd_h! },
    { key: 'fuel_mw', unit: 'MW', value: m.v.fuel_mw! },
    { key: 'area_m2', unit: 'm²', value: m.v.area! },
  ],
  histogram: { metric: 'cost_usd_h', best: (_s, m) => m.v.cost_ref_star! / 1.03, spread: 0.35, lowerIsBetter: true },
  solver,
  naive,
};
