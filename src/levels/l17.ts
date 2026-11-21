// L17 · Faster Road, Same Destination (DESIGN 2.6 Chapter 4, stretch). The L16 bed with a catalyst choice: V2O5-K2SO4 or Cs-promoted V2O5 (lights off 40 K lower,
// twice the price). Goal: bed-1 conversion >= 74 %. A catalyst changes the rate, not K: the lower inlet it allows gives a higher adiabatic-equilibrium conversion
// (DESIGN: 410 C -> 70.6 %, 380 C -> 75.1 %, 370 C -> 76.5 % rigorous; this engine reads 71.9 / 76.2 / 77.6, see the chapter report). Call it: K at 600 C with the new
// catalyst is the same K as before.
import type { Action } from '@core/kit';
import { dmath } from '@core/numerics';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { reactionOf } from '../data/reactions';
import { lnKOfReaction } from '../sim/chem/reactions';
import type { EqState } from '../state';
import { readUnit, convOf, toC, C0, type BedRead } from './ch4_common';
import { L16_FEED_KMOL_H, L16_FEED_X, L16_P, L16_SPECIES, L16_T_FEED, L16_TMAX_C, L16_DAMAGE_C, L16_W_KG } from './l16';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { thermoAt } from './callit_data';
import { baseSetup, commissions, put, putFeed, sealSetup, shown, spentOf, unitsOfType, piped } from './util';
import { costStarPerT, refCostPerT } from './refdesigns';

type S = Readonly<EqState>;
export const L17_CONV = 0.74, L17_CONV2 = 0.75;
export const L17_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 6000 }, heater: { max: 1, price: 20000 }, packed_bed: { max: 1, price: 60000 }, product: { max: 1, price: 5000 },
};
export const L17_BUDGET = 120000;
const PRESETS = { heater: { utility: 'fired', T: 683.15 } };
/** Call it: K of SO2 + 1/2 O2 = SO3 at 600 C, bar^-1/2, from the engine's own equilibrium data (the catalyst never enters it; asserted by a test). */
export const L17_T_CALL_K = 600 + C0;
export const L17_CALL_TOL = 0.01;
export const k600 = (): number => dmath.exp(lnKOfReaction(reactionOf('R2'), L17_T_CALL_K, 'rigorous'));
/** Reference: Cs catalyst at 375 C (15 K above the cold side of its light-off cliff); the old catalyst tried at its best (410 C) is the naive build. */
export const L17_REF_T_C = 375, L17_NAIVE_T_C = 410;
/** GAME: cost per tonne of stream at the reference build x 1.03 (global 17.71 -> 18.24, the fuel of the heater dominates), priced in the player's region (refdesigns.ts). UNVERIFIED. */
export const L17_STAR3_COST = (s: { region: string }): number => costStarPerT(s, 'L17');

export function catMeasures(s: S): Measures {
  const bed = unitsOfType(s, 'packed_bed')[0], heater = unitsOfType(s, 'heater')[0];
  const v: Record<string, number> = {
    w: bed && typeof bed.params.W === 'number' ? (bed.params.W as number) : 0, load_ok: bed && Math.abs((bed.params.W as number) - L16_W_KG) < 1e-6 ? 1 : 0,
    cs: bed?.catalystId === 'v2o5_cs' ? 1 : 0, set_c: heater && typeof heater.params.T === 'number' ? toC(heater.params.T as number) : 0,
    in_c: 0, out_c: 0, tmax_c: 0, conv: 0, xeq: 0, eta: 0, heater_kw: 0, cost_per_t: 0, k600: k600(),
  };
  const rd: BedRead | undefined = readUnit(s, 'packed_bed');
  if (!rd || !rd.outlet || !rd.inlet) return { ok: false, v };
  v.in_c = toC(rd.inlet.T); v.out_c = toC(rd.outlet.T); v.tmax_c = toC(rd.info.Tmax ?? rd.outlet.T);
  v.conv = convOf(s, rd, 'SO2'); v.xeq = rd.info.Xeq ?? 0; v.eta = rd.info.eta ?? 0;
  v.heater_kw = s.solved?.kpis.fired_duty_kw ?? 0;
  const c = s.solved?.kpis.cost_usd_per_t ?? 0; v.cost_per_t = c >= 1e8 ? 0 : c;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'place_heater', role: 'mentor', focus: 'heater', done: (s) => has(s, 'heater') },
  { id: 'pipe_up', role: 'mentor', done: (s) => piped(s, 3) },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'swap_catalyst', role: 'mentor', focus: 'packed_bed:catalyst', done: (s) => unitsOfType(s, 'packed_bed')[0]?.catalystId === 'v2o5_cs' || LATE(['read', 'why'])(s) },
  { id: 'read', role: 'mentor', done: LATE(['read', 'why']) },
  { id: 'why', role: 'mentor', done: LATE(['why']) },
];

export const l17Player = (tC: number, cat: string) => (_seed?: number) => {
  let stage = 0;
  return (s: S, _ctx?: unknown): Action[] => {
    if (stage === 0) { stage = 1; return [{ name: 'placeUnit', args: ['heater', 8, 6, 0] }]; }
    if (stage === 1) {
      stage = 2;
      const U = (type: string) => unitsOfType(s, type)[0]!;
      const feed = U('feed'), heat = U('heater'), bed = U('packed_bed'), prod = U('product');
      return [
        { name: 'setParam', args: [heat.id, 'T', tC + C0] }, { name: 'setCatalyst', args: [bed.id, cat] },
        { name: 'connect', args: [feed.id, 'out', heat.id, 'in'] }, { name: 'connect', args: [heat.id, 'out', bed.id, 'in'] }, { name: 'connect', args: [bed.id, 'out', prod.id, 'in'] },
        { name: 'commission' },
      ];
    }
    return [];
  };
};

export const L17: LevelSpec = {
  id: 'L17', firstRun: true, chapter: 4, index: 17, setter: 'mentor', budgetUSD: L17_BUDGET, units: L17_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L16_SPECIES, L17_UNITS, PRESETS);
    putFeed(s, 0, 6, L16_FEED_X, L16_FEED_KMOL_H, L16_T_FEED, L16_P);
    const bed = put(s, 'packed_bed', 14, 4, { W: L16_W_KG, mode: 'adiabatic' });
    s.flowsheet.units.find((u) => u.id === bed)!.catalystId = 'v2o5';
    put(s, 'product', 22, 6);
    sealSetup(s);
  },
  measures: catMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'conv', met: m.ok && m.v.conv! >= L17_CONV, ...(m.ok ? { value: m.v.conv! * 100 } : {}), target: L17_CONV * 100 },
      { key: 'tmax', met: m.ok && m.v.tmax_c! <= L16_TMAX_C, ...(m.ok ? { value: m.v.tmax_c } : {}), target: L16_TMAX_C },
      { key: 'load', met: m.v.load_ok === 1, value: m.v.w!, target: L16_W_KG },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L17_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L17_BUDGET, value: sp, target: L17_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.conv! >= L17_CONV2, m.ok && m.v.cost_per_t! > 0 && m.v.cost_per_t! <= L17_STAR3_COST(s)],
  textVars: (s) => { const x = thermoAt('R2', L17_T_CALL_K); return { dH: fmtNumber(x.dH, s.region), dS: fmtNumber(x.dS, s.region) }; },
  callIt: { key: 'k600', unit: 'bar⁻½', tol: L17_CALL_TOL, truth: () => k600() },
  hero: (_s, m) => ({ key: 'conv_pct', unit: '%', value: m.v.conv! * 100, lo: L17_CONV * 100, hi: 78 }),
  secondary: (_s, m) => ({ key: 'in_c', unit: '°C', value: m.v.in_c!, limit: 400 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'light', legend: t('lv.L17.ann.light'), state: !m.ok ? 'off' : m.v.in_c! < (m.v.cs === 1 ? 360 : 400) ? 'high' : 'normal' },
      { key: 'asleep', legend: t('lv.L17.ann.asleep'), state: !m.ok ? 'off' : m.v.conv! < 0.3 ? 'critical' : 'normal' },
      { key: 'bedhi', legend: t('lv.L17.ann.bedhi'), state: !m.ok ? 'off' : m.v.tmax_c! > L16_DAMAGE_C ? 'critical' : m.v.tmax_c! > L16_TMAX_C ? 'high' : 'normal' },
      { key: 'cat', legend: t('lv.L17.ann.cat'), state: m.v.cs === 1 ? 'normal' : 'off' },
      { key: 'load', legend: t('lv.L17.ann.load'), state: m.v.load_ok === 1 ? 'off' : 'critical' },
      { key: 'solve', legend: t('lv.L17.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L17.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { tin: f(s, m.v.in_c!), tmax: f(s, m.v.tmax_c!), x: f(s, m.v.conv! * 100), want: f(s, L17_CONV * 100), lim: f(s, L16_TMAX_C), w: f(s, m.v.w!), w0: f(s, L16_W_KG) };
    if (m.v.load_ok !== 1) return { key: 'load', cause: t('lv.L17.cause.load', vars) };
    if (m.v.conv! < 0.3) return { key: 'asleep', cause: t('lv.L17.cause.asleep', vars) };
    if (m.v.conv! < L17_CONV) return { key: m.v.cs === 1 ? 'warm' : 'ceiling', cause: t(m.v.cs === 1 ? 'lv.L17.cause.warm' : 'lv.L17.cause.ceiling', vars) };
    return { key: 'hot', cause: t('lv.L17.cause.hot', vars) };
  },
  equation: (s, m) => (m.ok && m.v.xeq! > 0 ? `${f(s, shown(m.v.conv!))} ÷ ${f(s, shown(m.v.xeq!))} = ${f(s, shown(shown(m.v.conv!) / shown(m.v.xeq!)))}` : null),
  lessonVars: (s, m) => ({ tin: f(s, m.v.in_c!), tout: f(s, m.v.out_c!), x: f(s, m.v.conv! * 100), k: f(s, m.v.k600!), runs: commissions(s) }),
  metrics: (_s, m) => [
    { key: 'conv_pct', unit: '%', value: m.v.conv! * 100 },
    { key: 'in_c', unit: '°C', value: m.v.in_c! },
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
  ],
  histogram: { metric: 'conv_pct', best: () => 77.6, spread: 0.06, lowerIsBetter: false },
  card: (_s, m) => ({ k600_bar: m.v.k600! }),
  solver: l17Player(L17_REF_T_C, 'v2o5_cs'),
  naive: l17Player(L17_NAIVE_T_C, 'v2o5'),
};
