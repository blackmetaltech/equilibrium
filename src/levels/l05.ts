// L05 · Heat for Free (DESIGN 2.6, chapter 2) and the burner house it shares with L06. The sulfur pit (fixed, 100 kmol/h) and an air intake feed a blower, a mixer
// and the sulfur burner; the new unit is the waste-heat boiler after the burner: it cools the burner gas to the converter inlet temperature and raises
// 40 bar steam from the heat the burner used to throw away (Q = xi x (-dH), steam = Q / dh with dh = h_g - h_BFW = 2361 kJ/kg). The level is the first player shift:
// 3 minutes with feed_surge and blower_wear (data/events.ts); the player answers with the air flow (a setpoint on the air feed).
import type { Action } from '@core/kit';
import { findReaction } from '../data/reactions';
import { fmtNumber, plumbing, pricesOf } from '../engine/solved';
import { t } from '../i18n';
import { rxnDH } from '../sim/chem/reactions';
import { steamPricePerT } from '../sim/econ';
import type { EqState } from '../state';
import type { Annunciator, CoachStep, GoalEval, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, flowOf, inStream, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const FIRE_SPECIES = ['S', 'O2', 'N2', 'SO2'];
/** DESIGN: 100 kmol/h of liquid sulfur at 140 C (the L02 pit). */
export const FIRE_S_KMOL_H = 100;
export const AIR_O2 = 0.21;
export const T_PIT = 413.15;
const P_FEED = 1.1e5;
/** Gas to the converter: 420 +- 5 C. */
export const CONV_C = 420, CONV_TOL = 5;
export const SO2_LO = 9.5, SO2_HI = 11;
export const STEAM_MIN_TH = 7.0;
export const STEAM_HP_PA = 4e6;
export const HIGH_S_MAX = 60;
export const L05_LEN_S = 180;
/** GAME bench prices, USD per unit (UNVERIFIED). */
export const L05_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 4000 }, compressor: { max: 1, price: 40000 }, mixer: { max: 1, price: 3000 }, burner: { max: 1, price: 22000 }, boiler: { max: 1, price: 45000 },
  stack: { max: 1, price: 8000 },
};
export const L05_BUDGET = 150000;
/** The boiler starts at a gas outlet of 300 C (a dial to set); the converter wants 420. */
const PRESETS = { compressor: { P: P_FEED, stages: 1 }, boiler: { steam: 'HP', T: 573.15 } };
export const START_AIR = 600;
export const REF_AIR = 1000;
/** Reference: 10 % SO2 (DESIGN: burner 931 C, boiler 4.93 MW, 7.52 t/h). */
export const REF_SO2 = 10;
/** The star-3 threshold: net steam value minus blower cost, USD/h. GAME (UNVERIFIED): the reference design's (10 % SO2, 420 C) value x 1.03. The reference
 *  numbers are the engine's at that design (a test asserts them); the prices are the player's region. */
export const REF_STEAM_TH = 7.657, REF_BLOWER_KW = 93.375, STAR_FACTOR = 1.03;
/** Steam value minus blower cost, USD/h, in the player's region prices. */
export function netValue(s: S, steamTh: number, blowerKw: number): number {
  const p = pricesOf(s);
  return steamTh * steamPricePerT(p) - blowerKw * (p.electricity?.value ?? 0);
}
export const netStar = (s: S): number => STAR_FACTOR * netValue(s, REF_STEAM_TH, REF_BLOWER_KW);

/** -dH298 of S + O2 -> SO2, kJ/mol, from the reaction catalogue. */
export const dhSO2 = (): number => -rxnDH(findReaction('R10')!.nu, 298.15, 'rigorous') / 1000;

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const C = (K: number): number => K - 273.15;

/** The stream leaving a unit at `port` (solved), or undefined. */
export function outStream(s: S, unitId: string, port = 'out') {
  if (!s.solved || !s.solved.ok) return undefined;
  const id = plumbing(s).outPipe(unitId, port);
  return id === undefined ? undefined : s.solved.streams[id];
}

/** Everything L05 and L06 read off the burner house: design numbers from the feed specs, results from the (shift-updated) steady state, the shift record. */
export function fireMeasures(s: S, shiftLen = L05_LEN_S): Measures {
  const sFed = toKmolH(fedOf(s, 'S')), o2Fed = toKmolH(fedOf(s, 'O2'));
  const v: Record<string, number> = {
    s_fed: sFed, o2_fed: o2Fed, air: o2Fed / AIR_O2, heat_mw: 0, so2_pct: 0, o2_pct: 0, o2_so2: 0, burner_so2_pct: 0, burner_K: 0, conv_K: 0, steam_th: 0, steam_P: 0, boiler_mw: 0,
    blower_kw: 0, net_usd_h: 0, high_s: 0, crit_s: 0, shift_t: 0, shift_len: shiftLen, ended: 0, wear: 0, surge: 0, burner_tier: 0, tripped: 0, dil_frac: 0,
  };
  const sh = s.shift;
  if (sh) {
    v.high_s = sh.stat.highS; v.crit_s = sh.stat.critS; v.shift_t = sh.t; v.shift_len = sh.len; v.ended = sh.ended === 'time' ? 1 : 0;
    v.wear = sh.act.some((e) => e.type === 'blower_wear') ? 1 : 0; v.surge = sh.act.some((e) => e.type === 'feed_surge') ? 1 : 0;
    v.tripped = Object.keys(sh.trips).length > 0 ? 1 : 0;
  }
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const stk = unitsOfType(s, 'stack')[0], bur = unitsOfType(s, 'burner')[0], boi = unitsOfType(s, 'boiler')[0];
  const st = stk ? inStream(s, stk.id) : undefined;
  if (!st || !bur || !boi) return { ok: false, v };
  const tot = st.n.reduce((a, b) => a + b, 0);
  const so2 = flowOf(s, st, 'SO2'), o2 = flowOf(s, st, 'O2');
  v.so2_pct = tot > 0 ? (so2 / tot) * 100 : 0; v.o2_pct = tot > 0 ? (o2 / tot) * 100 : 0; v.o2_so2 = so2 > 0 ? o2 / so2 : 0;
  v.conv_K = st.T;
  const bo = outStream(s, bur.id), btot = bo ? bo.n.reduce((a, b) => a + b, 0) : 0;
  v.burner_K = bo ? sh?.disp[plumbing(s).outPipe(bur.id, 'out')!]?.T ?? bo.T : 0;
  v.burner_so2_pct = bo && btot > 0 ? (flowOf(s, bo, 'SO2') / btot) * 100 : 0;
  const info = s.solved.units[boi.id]?.info ?? {};
  v.steam_th = info.steam_t_h ?? 0; v.steam_P = info.steam_P ?? 0; v.boiler_mw = Math.abs(info.Q ?? 0) / 1e6;
  const bi = s.solved.units[bur.id]?.info ?? {};
  v.heat_mw = ((bi.xi1 ?? 0) * dhSO2()) / 1000;
  v.blower_kw = s.solved.kpis.electric_kw ?? 0;
  v.net_usd_h = netValue(s, v.steam_th!, v.blower_kw!);
  const dil = unitsOfType(s, 'splitter')[0];
  v.dil_frac = dil !== undefined && typeof dil.params.frac === 'number' ? (dil.params.frac as number) : 0;
  const mons = sh?.mon.find((m) => m.u === bur.id && m.v === 'T');
  v.burner_tier = mons?.tier ?? 0;
  return { ok: true, v };
}

const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const shiftOn = (s: S): boolean => s.shift !== null && s.shift.ended === '' && (s.phase === 'shift' || s.phase === 'firstrun');

/** Plant ids: F-101 sulfur pit, F-102 air intake (pre-placed), then K-103 blower, M-104 mixer, R-105 burner, B-106 boiler, Z-107 stack. */
export function fireBuild(air: number, outletC: number, last: Action[] = [{ name: 'commission' }, { name: 'startShift', args: ['shift'] }]): Action[] {
  return [
    { name: 'placeUnit', args: ['compressor', 4, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 2, 0] }, { name: 'placeUnit', args: ['burner', 14, 0, 0] },
    { name: 'placeUnit', args: ['boiler', 18, 0, 0] }, { name: 'placeUnit', args: ['stack', 22, 2, 0] },
    { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] },
    { name: 'setParam', args: ['B-106', 'T', outletC + 273.15] },
    { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'M-104', 'in2'] }, { name: 'connect', args: ['F-101', 'out', 'M-104', 'in1'] },
    { name: 'connect', args: ['M-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'B-106', 'in'] }, { name: 'connect', args: ['B-106', 'out', 'Z-107', 'in'] },
    ...last,
  ];
}

/** The operator during a shift: when the plant has settled (no ramp running, nothing dirty) and the burner gas SO2 is off its target, scale the air by the ratio. */
export function airTrim(target: (s: S, m: Measures) => number, band: number) {
  return (s: S): Action[] => {
    const sh = s.shift;
    if (!sh || sh.ended !== '' || sh.t < 1 || Object.keys(sh.ramps).length > 0 || sh.dirty === 1) return [];
    const m = fireMeasures(s);
    if (!m.ok) return [];
    const want = target(s, m), y = m.v.burner_so2_pct!;
    if (Math.abs(y - want) <= band) return [];
    const feed = s.feeds['F-102'];
    if (!feed) return [];
    return [{ name: 'setpoint', args: ['F-102', 'flow', feed.flow * (y / want)] }];
  };
}

export const FIRE_COACH = (id: string): CoachStep[] => [
  { id: 'place_blower', role: id === 'L05' ? 'manager' : 'safety', focus: 'compressor', done: (s) => has(s, 'compressor') },
  { id: 'place_mixer', role: id === 'L05' ? 'manager' : 'safety', focus: 'mixer', done: (s) => has(s, 'mixer') },
  { id: 'place_burner', role: id === 'L05' ? 'manager' : 'safety', focus: 'burner', done: (s) => has(s, 'burner') },
  { id: 'place_boiler', role: id === 'L05' ? 'manager' : 'safety', focus: 'boiler', done: (s) => has(s, 'boiler') },
  { id: 'place_stack', role: id === 'L05' ? 'manager' : 'safety', focus: 'stack', done: (s) => has(s, 'stack') },
  { id: 'pipe_up', role: id === 'L05' ? 'manager' : 'safety', done: (s) => s.flowsheet.streams.length >= 6 || commissions(s) >= 1 },
  { id: 'set_outlet', role: id === 'L05' ? 'manager' : 'safety', focus: 'boiler', done: (s) => (unitsOfType(s, 'boiler')[0]?.params.T as number) > 573.15 + 1 || commissions(s) >= 1 },
  { id: 'commission', role: id === 'L05' ? 'manager' : 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'start_shift', role: id === 'L05' ? 'manager' : 'safety', done: (s) => s.shift !== null || s.status !== 'playing' },
  { id: 'answer_event', role: id === 'L05' ? 'manager' : 'safety', focus: 'feed', done: (s) => s.status !== 'playing' || Object.keys(s.shift?.ramps ?? {}).length > 0 || (s.shift?.stat.events ?? 0) > 0 && (s.shift?.ended ?? '') !== '' },
];

/** The expert runs the gas richer than the 10 % reference (10.8 %, still inside 9.5 to 11): less air, less blower, more steam; and answers the shift with the air feed. */
export const BEST_SO2 = 10.8;
const solver = () => {
  let built = false;
  const trim = airTrim(() => BEST_SO2, 0.15);
  return (s: S): Action[] => {
    if (!built) { built = true; return [{ name: 'callIt', args: [(FIRE_S_KMOL_H * dhSO2()) / 3600] }, ...fireBuild((FIRE_S_KMOL_H * 100) / BEST_SO2, CONV_C)]; }
    return trim(s);
  };
};
/** The novice sizes the air right but leaves the boiler outlet at the default (300 C): the gas gets to the converter too cold, the alarm lights. */
const naive = () => {
  let done = false;
  return (): Action[] => { if (done) return []; done = true; return fireBuild(REF_AIR, 300); };
};

export const L05: LevelSpec = {
  id: 'L05', chapter: 2, index: 5, setter: 'manager', budgetUSD: L05_BUDGET, units: L05_UNITS, requires: ['burner', 'boiler', 'stack'], notes: 3, shiftLen: L05_LEN_S, maxTicks: L05_LEN_S + 120,
  setup: (s) => {
    baseSetup(s, FIRE_SPECIES, L05_UNITS, PRESETS);
    putFeed(s, 0, 0, { S: 1 }, FIRE_S_KMOL_H, T_PIT, P_FEED);
    putFeed(s, 0, 4, { O2: AIR_O2, N2: 1 - AIR_O2 }, START_AIR, 298.15, 1e5);
    sealSetup(s);
  },
  measures: fireMeasures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'steam', met: m.ok && m.v.steam_th! >= STEAM_MIN_TH && m.v.steam_P! >= STEAM_HP_PA, ...(m.ok ? { value: m.v.steam_th } : {}), target: STEAM_MIN_TH },
      { key: 'so2', met: m.ok && m.v.so2_pct! >= SO2_LO && m.v.so2_pct! <= SO2_HI, ...(m.ok ? { value: m.v.so2_pct } : {}), target: (SO2_LO + SO2_HI) / 2, range: [SO2_LO, SO2_HI], unit: '%' },
      { key: 'inlet', met: m.ok && Math.abs(C(m.v.conv_K!) - CONV_C) <= CONV_TOL, ...(m.ok ? { value: C(m.v.conv_K!) } : {}), target: CONV_C },
      { key: 'shift', met: m.ok && m.v.ended === 1, value: m.v.shift_t!, target: m.v.shift_len! },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L05_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L05_BUDGET, value: sp, target: L05_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.ended === 1 && m.v.high_s! <= HIGH_S_MAX, m.ok && m.v.ended === 1 && m.v.net_usd_h! >= netStar(s)],
  callIt: { key: 'heat_mw', unit: 'MW', tol: 0.01, truth: (s) => (fedOf(s, 'S') * dhSO2()) / 1000 },
  hero: (_s, m) => ({ key: 'steam_th', unit: 't/h', value: m.v.steam_th!, lo: STEAM_MIN_TH, hi: 9 }),
  secondary: (_s, m) => ({ key: 'high_s', unit: 's', value: m.v.high_s!, limit: HIGH_S_MAX }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const c = m.ok ? C(m.v.conv_K!) : CONV_C;
    return [
      { key: 'cold', legend: t('lv.L05.ann.cold'), state: !m.ok ? 'off' : c < CONV_C - CONV_TOL ? (c < 400 ? 'critical' : 'high') : 'normal' },
      { key: 'hot', legend: t('lv.L05.ann.hot'), state: !m.ok ? 'off' : c > CONV_C + CONV_TOL ? 'high' : 'normal' },
      { key: 'so2', legend: t('lv.L05.ann.so2'), state: !m.ok ? 'off' : m.v.so2_pct! < SO2_LO || m.v.so2_pct! > SO2_HI ? 'high' : 'normal' },
      { key: 'steam', legend: t('lv.L05.ann.steam'), state: !m.ok ? 'off' : m.v.steam_th! < STEAM_MIN_TH ? 'high' : 'normal' },
      { key: 'wear', legend: t('lv.L05.ann.wear'), state: !m.ok ? 'off' : m.v.wear ? 'high' : 'off' },
      { key: 'burner', legend: t('lv.L05.ann.burner'), state: !m.ok ? 'off' : m.v.burner_tier! >= 3 ? 'critical' : m.v.burner_tier! >= 2 ? 'high' : 'normal' },
      { key: 'solve', legend: t('lv.L05.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L05.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: FIRE_COACH('L05'),
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const c = C(m.v.conv_K!);
    if (c < CONV_C - CONV_TOL) return { key: 'cold', cause: t('lv.L05.cause.cold', { c: f(s, c), steam: f(s, m.v.steam_th!), want: CONV_C }) };
    if (c > CONV_C + CONV_TOL) return { key: 'hot', cause: t('lv.L05.cause.hot', { c: f(s, c), want: CONV_C }) };
    if (m.v.so2_pct! < SO2_LO) return { key: 'weak', cause: t('lv.L05.cause.weak', { y: f(s, m.v.so2_pct!), air: f(s, m.v.air!), lo: SO2_LO }) };
    if (m.v.so2_pct! > SO2_HI) return { key: 'rich', cause: t('lv.L05.cause.rich', { y: f(s, m.v.so2_pct!), air: f(s, m.v.air!), hi: SO2_HI, burner: f(s, C(m.v.burner_K!)) }) };
    if (m.v.steam_th! < STEAM_MIN_TH || m.v.steam_P! < STEAM_HP_PA) return { key: 'dry', cause: t('lv.L05.cause.dry', { steam: f(s, m.v.steam_th!), want: STEAM_MIN_TH, mw: f(s, m.v.boiler_mw!) }) };
    return { key: 'unfinished', cause: t('lv.L05.cause.unfinished', { t: f(s, m.v.shift_t!), len: f(s, m.v.shift_len!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.s_fed! > 0)) return null;
    const sFed = shown(m.v.s_fed!), dh = shown(dhSO2());
    return `${f(s, sFed)} × ${f(s, dh)} ÷ 3600 = ${f(s, shown((sFed * dh) / 3600))} MW released`;
  },
  lessonVars: (s, m) => ({ s: f(s, m.v.s_fed!), dh: f(s, shown(dhSO2())), q: f(s, m.v.heat_mw!), steam: f(s, m.v.steam_th!), boiler: f(s, m.v.boiler_mw!), so2: f(s, m.v.so2_pct!), conv: f(s, C(m.v.conv_K!)), burner: f(s, C(m.v.burner_K!)) }),
  metrics: (_s, m) => [
    { key: 'steam_th', unit: 't/h', value: m.v.steam_th! },
    { key: 'net_usd_h', unit: 'USD/h', value: m.v.net_usd_h! },
    { key: 'burner_c', unit: '°C', value: C(m.v.burner_K!) },
  ],
  histogram: { metric: 'steam_th', best: () => 7.52, spread: 0.5, lowerIsBetter: false },
  solver,
  naive,
};
void relErr; void shiftOn;
