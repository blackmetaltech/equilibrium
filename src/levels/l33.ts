// L33 · The Interlock (DEPTH Ch 8): design the SIS trip for a jacketed CSTR that can run away when its cooling is lost (own rig, src/sim/control/cstr.ts; it does not use L24).
// Choose the sensors (1-3), the voting (k of n), the trip point and the final element (cut feed / full coolant / dump). Five scenarios are replayed: two demands (loss of cooling;
// loss of cooling with one sensor stuck low) that a miss turns into a runaway, and three nuisances (a sensor stuck high, noise spikes, a partial cooling upset) that a spurious trip
// turns into lost production. Dials: sensors, k, trip point (degC), action (1 cut feed, 2 full coolant, 3 dump).
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { ACTIONS, CSTR, SCENARIOS, evaluate, hwCost, runScenario, secondsToCritical, type Design, type Eval } from '../sim/control/cstr';
import type { EqState } from '../state';
import { controlView, dialActions, dialScript, dialValues, goalLamp, lit, none, rigOk, rigSetup, LATE } from './ch8_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, shown } from './util';

type S = Readonly<EqState>;
const C0 = 273.15;
export const L33_BUDGET = 55000;
/** Reference: 3 sensors, 2oo3, trip at 89 degC (362 K), dump. Window of trip points that works with the dump: 82-98 degC (see ch8.test). */
export const L33_REF = { sensors: 3, k: 2, tripC: 89, action: 3 };
export const designOf = (d: number[]): Design => {
  const n = Math.min(3, Math.max(1, Math.round(d[0]!)));
  return { sensors: n, k: Math.min(n, Math.max(1, Math.round(d[1]!))), tripK: d[2]! + C0, action: ACTIONS[Math.min(3, Math.max(1, Math.round(d[3]!))) - 1]! };
};
export const L33_COST_REF = evaluate(designOf([L33_REF.sensors, L33_REF.k, L33_REF.tripC, L33_REF.action])).annualCost;
export const L33_COST_STAR = L33_COST_REF * 1.03;
export const L33_CALL_TOL = 0.1;
export const L33_T_CRIT_C = CSTR.T_CRIT - C0;
const KEYS = ['sensors', 'k', 'tripC', 'action', 'miss', 'spurious', 'cost', 'hw', 'peakLoss', 'tripLoss', 'missLoss', 'missBlind', 'spHigh', 'spSpikes', 'spUpset', 'secs', 'cin', 'dh', 'rhocp', 'adi', 'critC', 'upsetC'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const UNITS: LevelSpec['units'] = { feed: { max: 1, price: 0 }, product: { max: 1, price: 0 } };

function run(s: S): { d: number[]; ev: Eval | null } {
  const d = dialValues(s, 4);
  return { d, ev: rigOk(s, d) ? evaluate(designOf(d)) : null };
}
/** The recorder: reactor temperature (K) in the loss-of-cooling scenario with your trip, and the same plant with no trip at all. */
export function l33Series(s: S): { t: number[]; T: number[]; open: number[]; trip: number; crit: number } | null {
  const d = dialValues(s, 4);
  if (!rigOk(s, d)) return null;
  const des = designOf(d), a = runScenario(SCENARIOS[0]!, des), b = runScenario(SCENARIOS[0]!, null);
  return { t: a.T.map((_, i) => i + 1), T: a.T, open: b.T, trip: des.tripK, crit: CSTR.T_CRIT };
}

function measures(s: S): Measures {
  const { d, ev } = run(s);
  const adi = (CSTR.Cin * CSTR.dH) / CSTR.rhoCp;
  const base = { secs: secondsToCritical(), cin: CSTR.Cin, dh: CSTR.dH, rhocp: CSTR.rhoCp, adi, critC: L33_T_CRIT_C, upsetC: runScenario(SCENARIOS[4]!, null).peak - C0 };
  if (ev === null) return { ok: false, v: { ...none(KEYS).v, ...base } };
  const des = designOf(d), by = (id: string) => ev.scenarios.find((x) => x.id === id)!;
  return { ok: true, v: { sensors: des.sensors, k: des.k, tripC: d[2]!, action: ACTIONS.indexOf(des.action) + 1, miss: ev.misses, spurious: ev.spurious, cost: ev.annualCost, hw: hwCost(des), peakLoss: by('loss').peak - C0, tripLoss: by('loss').trippedAt, missLoss: by('loss').missed ? 1 : 0, missBlind: by('loss_stuck_low').missed ? 1 : 0, spHigh: by('stuck_high').spurious ? 1 : 0, spSpikes: by('spikes').spurious ? 1 : 0, spUpset: by('cooling_upset').spurious ? 1 : 0, ...base } };
}

const VIEW = (s: S) => {
  const r = l33Series(s);
  return controlView({
    s, id: 'L33', dials: [{ key: 'sensors', unit: '', min: 1, max: 3, step: 1 }, { key: 'k', unit: '', min: 1, max: 3, step: 1 }, { key: 'tripC', unit: '°C', min: 60, max: 140, step: 1 }, { key: 'action', unit: '', min: 1, max: 3, step: 1, choices: ['cut_feed', 'full_coolant', 'dump'] }],
    series: r === null ? null : { t: r.t, pv: r.T.map((x) => x - C0), sp: r.T.map(() => r.trip - C0), op: r.open.map((x) => x - C0) },
    metric: { value: measures(s).v.cost!, unit: 'USD/yr', star3: L33_COST_STAR },
  });
};

export const L33: LevelSpec = {
  id: 'L33', firstRun: true, chapter: 8, index: 33, setter: 'safety', budgetUSD: L33_BUDGET, units: UNITS, notes: 2, shiftLen: 0,
  setup: (s) => rigSetup(s, UNITS, [
    { key: 'sensors', def: { learner: 3, engineer: 1 } }, { key: 'k', def: { learner: 1, engineer: 1 } }, { key: 'tripC', def: { learner: 89, engineer: 100 } }, { key: 'action', def: { learner: 1, engineer: 1 } },
  ]),
  actions: dialActions,
  view: (s) => VIEW(s),
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'miss', met: m.ok && m.v.miss! === 0, ...(m.ok ? { value: m.v.miss } : {}), target: 0 },
      { key: 'spurious', met: m.ok && m.v.spurious! === 0, ...(m.ok ? { value: m.v.spurious } : {}), target: 0 },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: !m.ok || m.v.hw! <= L33_BUDGET, value: m.ok ? m.v.hw! : 0, target: L33_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'secs_to_crit') !== null && relErr(predictionOf(s, 'secs_to_crit')!.value, secondsToCritical()) <= L33_CALL_TOL,
    m.ok && m.v.cost! <= L33_COST_STAR,
  ],
  callIt: { key: 'secs_to_crit', unit: 's', tol: L33_CALL_TOL, truth: () => secondsToCritical() },
  hero: (_s, m) => ({ key: 'cost', unit: 'USD/yr', value: m.v.cost!, lo: 0, hi: L33_COST_STAR * 1.5 }),
  secondary: (_s, m) => ({ key: 'peak', unit: '°C', value: m.v.peakLoss!, limit: L33_T_CRIT_C }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'runaway', legend: t('lv.L33.ann.runaway'), state: !m.ok ? 'off' : m.v.miss! > 0 ? 'critical' : 'normal' },
    { key: 'blind', legend: t('lv.L33.ann.blind'), state: lit(m.ok, m.v.missBlind! === 0, 'critical') },
    { key: 'false', legend: t('lv.L33.ann.false'), state: lit(m.ok, m.v.spurious! === 0) },
    { key: 'upset', legend: t('lv.L33.ann.upset'), state: lit(m.ok, m.v.spUpset! === 0) },
    { key: 'budget', legend: t('lv.L33.ann.budget'), state: !m.ok ? 'off' : m.v.hw! > L33_BUDGET ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.L33.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'watch', role: 'safety', done: LATE(['watch', 'design', 'why']) },
    { id: 'design', role: 'safety', done: (s) => commissions(s) >= 1 || LATE(['design', 'why'])(s) },
    { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'safety', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { trip: f(s, m.v.tripC!), peak: f(s, m.v.peakLoss!), crit: f(s, m.v.critC!), n: f(s, m.v.sensors!), k: f(s, m.v.k!), upset: f(s, m.v.upsetC!), secs: f(s, m.v.secs!), cost: f(s, m.v.cost!) };
    if (m.v.missLoss === 1) return { key: 'miss_late', cause: t(m.v.action === 3 ? 'lv.L33.cause.miss_late_dump' : m.v.action === 2 ? 'lv.L33.cause.miss_coolant' : 'lv.L33.cause.miss_late_feed', vars) };
    if (m.v.missBlind === 1) return { key: 'miss_blind', cause: t('lv.L33.cause.miss_blind', vars) };
    if (m.v.spUpset === 1) return { key: 'spurious_low', cause: t('lv.L33.cause.spurious_low', vars) };
    if (m.v.spHigh === 1 || m.v.spSpikes === 1) return { key: 'spurious_vote', cause: t('lv.L33.cause.spurious_vote', vars) };
    return { key: 'budget', cause: t('lv.L33.cause.budget', vars) };
  },
  equation: (s, m) => {
    const cin = shown(m.v.cin!), dh = shown(m.v.dh!), rc = shown(m.v.rhocp!);
    return `${f(s, cin)} × ${f(s, dh)} ÷ ${f(s, rc)} = ${f(s, shown((cin * dh) / rc))} K of adiabatic rise`;
  },
  lessonVars: (s, m) => ({ trip: f(s, m.v.tripC!), peak: f(s, m.v.peakLoss!), crit: f(s, m.v.critC!), secs: f(s, m.v.secs!), adi: f(s, m.v.adi!), n: f(s, m.v.sensors!), k: f(s, m.v.k!), cost: f(s, m.v.cost!), upset: f(s, m.v.upsetC!) }),
  metrics: (_s, m) => [
    { key: 'cost', unit: 'USD/yr', value: m.v.cost! },
    { key: 'peak', unit: '°C', value: m.v.peakLoss! },
    { key: 'hardware', unit: 'USD', value: m.v.hw! },
  ],
  histogram: { metric: 'cost', best: () => L33_COST_REF, spread: 2.5, lowerIsBetter: true },
  solver: dialScript([L33_REF.sensors, L33_REF.k, L33_REF.tripC, L33_REF.action], { v: secondsToCritical() }),
  naive: dialScript([1, 1, 100, 1]),
};
