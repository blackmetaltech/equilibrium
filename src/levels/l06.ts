// L06 · Too Hot to Hold (DESIGN 2.6). The L05 burner house again, but the job is richer gas: more SO2 per cubic metre means a smaller converter, and the same
// heat in less gas means a hotter gas (adiabatic temperature rise). The burner lining is rated 1100 C (High alarm 1080 C, Critical 1100 C with a damage counter) and
// the converter needs oxygen: O2/SO2 >= 0.8 in the gas it receives. The optional dilution air (a splitter taking air round the burner, a second mixer after it) lets
// the burner run richer and hotter than the converter gas needs to be. A 10-minute shift with blower_wear and feed_surge (data/events.ts): less air makes hotter gas.
import type { Action } from '@core/kit';
import { findReaction } from '../data/reactions';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { engineModel, reactStoich } from '../sim/units/rx_stoich';
import type { EqState } from '../state';
import { AIR_O2, FIRE_S_KMOL_H, FIRE_SPECIES, T_PIT, airTrim, fireMeasures, L05_UNITS } from './l05';
import type { Annunciator, CoachStep, GoalEval, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, putFeed, relErr, sealSetup, shown, spentOf, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L06_LEN_S = 600;
/** Lining: High alarm 1080 C, Critical 1100 C (the rating). */
export const LINING_HI_C = 1080, LINING_C = 1100;
export const O2_SO2_MIN = 0.8;
/** The richer-gas goal: above the 11 % the converter of L05 was specified for (GAME). */
export const RICH_MIN = 11;
export const L06_UNITS: LevelSpec['units'] = { ...L05_UNITS, mixer: { max: 2, price: 3000 }, splitter: { max: 1, price: 5000 } };
export const L06_BUDGET = 190000;
const PRESETS = {
  compressor: { P: 1.1e5, stages: 1 }, boiler: { steam: 'HP', T: 573.15 }, splitter: { frac: 0.1 },
  burner: { T_hi: LINING_HI_C + 273.15, T_crit: LINING_C + 273.15 },
};
/** The reference (DESIGN: 11.5 % SO2 passes without dilution; the optimum without it is where O2/SO2 = 0.8, at 21/1.8 = 11.67 %) and the star-3 threshold x 1.03 (GAME, UNVERIFIED). */
export const REF_SO2 = 11.5, STAR_SO2 = REF_SO2 * 1.03;
const C = (K: number): number => K - 273.15;
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

/** Adiabatic burner outlet T, K, of the pit sulfur (413 K) burned in air at a burner-gas SO2 mole fraction `y` (percent): the same energy balance the burner runs
 *  (S + O2 -> SO2 to completion, H_out = H_in), evaluated with the engine's catalogue thermo. The Call-it truth: no commission needed. */
export function burnerTadK(y: number): number {
  const model = engineModel(FIRE_SPECIES);
  const air = (FIRE_S_KMOL_H * 100) / y;
  const n0 = [FIRE_S_KMOL_H, AIR_O2 * air, (1 - AIR_O2) * air, 0];
  const Hin = model.H([FIRE_S_KMOL_H, 0, 0, 0], T_PIT) + model.H([0, n0[1]!, n0[2]!, 0], 298.15);
  const tm = model.solveT(Hin, n0);
  if (!tm.ok) return Number.NaN;
  const r = reactStoich({ species: FIRE_SPECIES, n0, Tin: tm.value, nus: [findReaction('R10')!.nu], keys: ['S'], X: [1], mode: 'adiabatic', onLimit: 'clamp' }, model);
  return r.ok ? r.value.T : Number.NaN;
}

/** Plant ids without dilution: F-101, F-102 (pre-placed), K-103 blower, M-104 mixer, R-105 burner, B-106 boiler, Z-107 stack. With dilution: K-103, X-104 splitter,
 *  M-105 mixer, R-106 burner, M-107 mixer (dilution air joins the burner gas), B-108 boiler, Z-109 stack. `air` is the TOTAL air, `dil` the fraction taken round the burner. */
export function lineBuild(air: number, dil: number, last: Action[] = [{ name: 'commission' }, { name: 'startShift', args: ['shift'] }]): Action[] {
  const feedAir: Action = { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] };
  if (dil <= 0) {
    return [
      { name: 'placeUnit', args: ['compressor', 3, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 2, 0] }, { name: 'placeUnit', args: ['burner', 12, 0, 0] },
      { name: 'placeUnit', args: ['boiler', 18, 0, 0] }, { name: 'placeUnit', args: ['stack', 22, 2, 0] }, feedAir, { name: 'setParam', args: ['B-106', 'T', 693.15] },
      { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'M-104', 'in2'] }, { name: 'connect', args: ['F-101', 'out', 'M-104', 'in1'] },
      { name: 'connect', args: ['M-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'B-106', 'in'] }, { name: 'connect', args: ['B-106', 'out', 'Z-107', 'in'] },
      ...last,
    ];
  }
  return [
    { name: 'placeUnit', args: ['compressor', 3, 4, 0] }, { name: 'placeUnit', args: ['splitter', 8, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 0, 0] },
    { name: 'placeUnit', args: ['burner', 12, 0, 0] }, { name: 'placeUnit', args: ['mixer', 16, 4, 0] }, { name: 'placeUnit', args: ['boiler', 18, 0, 0] }, { name: 'placeUnit', args: ['stack', 22, 2, 0] },
    feedAir, { name: 'setParam', args: ['X-104', 'frac', dil] }, { name: 'setParam', args: ['B-108', 'T', 693.15] },
    { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'X-104', 'in'] }, { name: 'connect', args: ['X-104', 'out', 'M-105', 'in2'] },
    { name: 'connect', args: ['F-101', 'out', 'M-105', 'in1'] }, { name: 'connect', args: ['M-105', 'out', 'R-106', 'in'] }, { name: 'connect', args: ['R-106', 'out', 'M-107', 'in1'] },
    { name: 'connect', args: ['X-104', 'purge', 'M-107', 'in2'] }, { name: 'connect', args: ['M-107', 'out', 'B-108', 'in'] }, { name: 'connect', args: ['B-108', 'out', 'Z-109', 'in'] },
    ...last,
  ];
}
/** Total air for a burner-gas SO2 of y percent with a fraction `dil` of the air taken round the burner. */
export const airFor = (y: number, dil: number): number => (FIRE_S_KMOL_H * 100) / y / (1 - dil);

export const measures = (s: S): Measures => fireMeasures(s, L06_LEN_S);

const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const COACH: CoachStep[] = [
  { id: 'place_blower', role: 'safety', focus: 'compressor', done: (s) => has(s, 'compressor') },
  { id: 'place_mixer', role: 'safety', focus: 'mixer', done: (s) => has(s, 'mixer') },
  { id: 'place_burner', role: 'safety', focus: 'burner', done: (s) => has(s, 'burner') },
  { id: 'place_boiler', role: 'safety', focus: 'boiler', done: (s) => has(s, 'boiler') },
  { id: 'place_stack', role: 'safety', focus: 'stack', done: (s) => has(s, 'stack') },
  { id: 'pipe_up', role: 'safety', done: (s) => s.flowsheet.streams.length >= 6 || commissions(s) >= 1 },
  { id: 'find_limit', role: 'safety', focus: 'burner', done: (s) => commissions(s) >= 1 },
  { id: 'dilution', role: 'safety', focus: 'splitter', done: (s) => has(s, 'splitter') || s.status !== 'playing' },
  { id: 'start_shift', role: 'safety', done: (s) => s.shift !== null || s.status !== 'playing' },
];

/** The expert: 11.9 % SO2 in the burner (1087 C, inside the 1100 C rating) with 10 % of the air taken round the burner for the converter's oxygen, and the air feed trimmed in the shift. */
export const BEST_SO2 = 11.9, BEST_DIL = 0.1;
const solver = () => {
  let built = false;
  const trim = airTrim(() => BEST_SO2, 0.1);
  return (s: S): Action[] => {
    if (!built) { built = true; return [{ name: 'callIt', args: [C(burnerTadK(10))] }, ...lineBuild(airFor(BEST_SO2, BEST_DIL), BEST_DIL)]; }
    return trim(s);
  };
};
/** The novice goes for 12 % SO2: the lining is within its rating but the converter gas is short of oxygen (O2/SO2 = 0.75). */
const naive = () => {
  let done = false;
  return (): Action[] => { if (done) return []; done = true; return lineBuild(airFor(12, 0), 0, [{ name: 'commission' }]); };
};

export const L06: LevelSpec = {
  id: 'L06', chapter: 2, index: 6, setter: 'safety', budgetUSD: L06_BUDGET, units: L06_UNITS, notes: 2, shiftLen: L06_LEN_S, maxTicks: L06_LEN_S + 120,
  setup: (s) => {
    baseSetup(s, FIRE_SPECIES, L06_UNITS, PRESETS);
    putFeed(s, 0, 0, { S: 1 }, FIRE_S_KMOL_H, T_PIT, 1.1e5);
    putFeed(s, 0, 4, { O2: AIR_O2, N2: 1 - AIR_O2 }, 600, 298.15, 1e5);
    sealSetup(s);
  },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'rich', met: m.ok && m.v.burner_so2_pct! >= RICH_MIN, ...(m.ok ? { value: m.v.burner_so2_pct } : {}), target: RICH_MIN },
      { key: 'lining', met: m.ok && C(m.v.burner_K!) <= LINING_C, ...(m.ok ? { value: C(m.v.burner_K!) } : {}), target: LINING_C },
      { key: 'oxygen', met: m.ok && m.v.o2_so2! >= O2_SO2_MIN, ...(m.ok ? { value: m.v.o2_so2 } : {}), target: O2_SO2_MIN },
      { key: 'shift', met: m.ok && m.v.ended === 1, value: m.v.shift_t!, target: m.v.shift_len! },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L06_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L06_BUDGET, value: sp, target: L06_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.ended === 1 && m.v.crit_s! === 0, m.ok && m.v.ended === 1 && m.v.burner_so2_pct! >= STAR_SO2],
  callIt: { key: 'tad_c', unit: '°C', tol: 0.015, truth: () => { const T = burnerTadK(10); return Number.isFinite(T) ? C(T) : null; } },
  hero: (_s, m) => ({ key: 'burner_so2', unit: '%', value: m.v.burner_so2_pct!, lo: RICH_MIN, hi: 12.3 }),
  secondary: (_s, m) => ({ key: 'burner_c', unit: '°C', value: C(m.v.burner_K!), limit: LINING_C }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const tc = m.ok ? C(m.v.burner_K!) : 0;
    return [
      { key: 'hi', legend: t('lv.L06.ann.hi'), state: !m.ok ? 'off' : tc >= LINING_HI_C ? 'high' : 'normal' },
      { key: 'hh', legend: t('lv.L06.ann.hh'), state: !m.ok ? 'off' : tc >= LINING_C ? 'critical' : 'normal' },
      { key: 'damage', legend: t('lv.L06.ann.damage'), state: !m.ok ? 'off' : m.v.crit_s! > 0 ? 'critical' : 'normal' },
      { key: 'o2', legend: t('lv.L06.ann.o2'), state: !m.ok ? 'off' : m.v.o2_so2! < O2_SO2_MIN ? 'high' : 'normal' },
      { key: 'lean', legend: t('lv.L06.ann.lean'), state: !m.ok ? 'off' : m.v.burner_so2_pct! < RICH_MIN ? 'high' : 'normal' },
      { key: 'wear', legend: t('lv.L06.ann.wear'), state: !m.ok ? 'off' : m.v.wear ? 'high' : 'off' },
      { key: 'solve', legend: t('lv.L06.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L06.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const tc = C(m.v.burner_K!);
    if (tc > LINING_C) return { key: 'hot', cause: t('lv.L06.cause.hot', { c: f(s, tc), y: f(s, m.v.burner_so2_pct!), lim: LINING_C }) };
    if (m.v.o2_so2! < O2_SO2_MIN) return { key: 'starved', cause: t('lv.L06.cause.starved', { r: f(s, m.v.o2_so2!), y: f(s, m.v.so2_pct!), min: O2_SO2_MIN }) };
    if (m.v.burner_so2_pct! < RICH_MIN) return { key: 'lean', cause: t('lv.L06.cause.lean', { y: f(s, m.v.burner_so2_pct!), min: RICH_MIN, air: f(s, m.v.air!) }) };
    return { key: 'unfinished', cause: t('lv.L06.cause.unfinished', { t: f(s, m.v.shift_t!), len: f(s, m.v.shift_len!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.so2_pct! > 0)) return null;
    const o2 = shown(m.v.o2_pct!), so2 = shown(m.v.so2_pct!);
    return `${f(s, o2)} ÷ ${f(s, so2)} = ${f(s, shown(o2 / so2))} mol of O₂ per mol of SO₂`;
  },
  lessonVars: (s, m) => ({ y: f(s, m.v.burner_so2_pct!), burner: f(s, C(m.v.burner_K!)), r: f(s, m.v.o2_so2!), air: f(s, m.v.air!), dil: f(s, m.v.dil_frac! * 100), conv: f(s, m.v.so2_pct!) }),
  metrics: (_s, m) => [
    { key: 'burner_so2', unit: '%', value: m.v.burner_so2_pct! },
    { key: 'burner_c', unit: '°C', value: C(m.v.burner_K!) },
    { key: 'conv_cost_idx', unit: '%', value: m.v.so2_pct! > 0 ? (10 / m.v.so2_pct!) * 100 : 0 },
  ],
  histogram: { metric: 'burner_so2', best: () => 11.85, spread: 0.12, lowerIsBetter: false },
  solver,
  naive,
};
void relErr;
