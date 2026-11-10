// L32 · Cascade (DEPTH Ch 8): bed temperature (master, slow) cascaded onto the quench-valve flow (slave, fast). A header-pressure disturbance cuts the quench flow by 20 % from
// 100 s to 400 s; a single loop only sees it after the bed has warmed (and the dead time), the slave sees it at once. Dials: cascade on, master Kc, tauI, slave Kc, tauI.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { L32_RIG, runL32, type L32Out } from '../sim/control/rigs';
import type { EqState } from '../state';
import { controlView, dialActions, dialScript, dialValues, goalLamp, lit, none, rigOk, rigSetup, LATE } from './ch8_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, shown } from './util';

type S = Readonly<EqState>;
export const L32_HDR_MAX = 3, L32_IAE_MAX = 1500;
export const L32_HW_SINGLE = 6000, L32_HW_CASCADE = 15000, L32_BUDGET = 16000;
export const L32_REF = { on: 1, mKc: 1.5, mTauI: 150, sKc: 2, sTauI: 6 };
export const L32_IAE_REF = runL32(true, L32_REF.mKc, L32_REF.mTauI, L32_REF.sKc, L32_REF.sTauI).iae;
export const L32_IAE_STAR = L32_IAE_REF * 1.03;
export const L32_CALL_TOL = 0.05;
/** Uncontrolled: a 20 % flow loss warms the bed by K x 20 at steady state (K = 1.2 K per % of quench). */
export const l32OpenLoopRise = (): number => L32_RIG.procM.K * -L32_RIG.hdr;
const KEYS = ['on', 'mKc', 'mTauI', 'sKc', 'sTauI', 'hdr', 'peak', 'iae', 'sat', 'hw', 'K', 'dist', 'open'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const UNITS: LevelSpec['units'] = { feed: { max: 1, price: 0 }, product: { max: 1, price: 0 } };

function run(s: S): { d: number[]; out: L32Out | null } {
  const d = dialValues(s, 5);
  return { d, out: rigOk(s, d) ? runL32(d[0]! >= 0.5, d[1]!, d[2]!, d[3]!, d[4]!) : null };
}
export const l32Series = (s: S) => { const r = run(s).out; return r === null ? null : { ...r.series, flow: r.flow }; };

function measures(s: S): Measures {
  const { d, out } = run(s);
  if (out === null) return none(KEYS);
  const on = d[0]! >= 0.5;
  return { ok: true, v: { on: on ? 1 : 0, mKc: d[1]!, mTauI: d[2]!, sKc: d[3]!, sTauI: d[4]!, hdr: out.hdrPeak, peak: out.peakDev, iae: out.iae, sat: out.satShare, hw: on ? L32_HW_CASCADE : L32_HW_SINGLE, K: L32_RIG.procM.K, dist: -L32_RIG.hdr, open: l32OpenLoopRise() } };
}

const VIEW = (s: S) => controlView({
  s, id: 'L32', dials: [{ key: 'on', unit: '', min: 0, max: 1, step: 1, choices: ['off', 'on'] }, { key: 'mKc', unit: '', min: 0, max: 10, step: 0.1 }, { key: 'mTauI', unit: 's', min: 0, max: 600, step: 5 }, { key: 'sKc', unit: '', min: 0, max: 10, step: 0.1 }, { key: 'sTauI', unit: 's', min: 0, max: 60, step: 0.5 }],
  series: l32Series(s), extras: ['flow'], metric: { value: measures(s).v.iae!, unit: 'K s', star3: L32_IAE_STAR },
});

export const L32: LevelSpec = {
  id: 'L32', firstRun: true, chapter: 8, index: 32, setter: 'mentor', budgetUSD: L32_BUDGET, units: UNITS, notes: 2, shiftLen: 0,
  setup: (s) => rigSetup(s, UNITS, [
    { key: 'on', def: { learner: 0, engineer: 0 } }, { key: 'mKc', def: { learner: 1, engineer: 1 } }, { key: 'mTauI', def: { learner: 150, engineer: 100 } },
    { key: 'sKc', def: { learner: 2, engineer: 1 } }, { key: 'sTauI', def: { learner: 6, engineer: 0 } },
  ]),
  actions: dialActions,
  view: (s) => VIEW(s),
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'hdr', met: m.ok && m.v.hdr! <= L32_HDR_MAX, ...(m.ok ? { value: m.v.hdr } : {}), target: L32_HDR_MAX },
      { key: 'iae', met: m.ok && m.v.iae! <= L32_IAE_MAX, ...(m.ok ? { value: m.v.iae } : {}), target: L32_IAE_MAX },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: m.ok && m.v.hw! <= L32_BUDGET, value: m.ok ? m.v.hw! : 0, target: L32_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'open_rise_k') !== null && relErr(predictionOf(s, 'open_rise_k')!.value, l32OpenLoopRise()) <= L32_CALL_TOL,
    m.ok && m.v.iae! <= L32_IAE_STAR,
  ],
  callIt: { key: 'open_rise_k', unit: 'K', tol: L32_CALL_TOL, truth: () => l32OpenLoopRise() },
  hero: (_s, m) => ({ key: 'hdr', unit: 'K', value: m.v.hdr!, lo: 0, hi: L32_HDR_MAX }),
  secondary: (_s, m) => ({ key: 'iae', unit: 'K s', value: m.v.iae!, limit: L32_IAE_MAX }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'hi', legend: t('lv.L32.ann.hi'), state: !m.ok ? 'off' : m.v.hdr! > 3 * L32_HDR_MAX ? 'critical' : m.v.hdr! > L32_HDR_MAX ? 'high' : 'normal' },
    { key: 'casc', legend: t('lv.L32.ann.casc'), state: !m.ok ? 'off' : m.v.on === 1 ? 'normal' : 'high' },
    { key: 'iae', legend: t('lv.L32.ann.iae'), state: lit(m.ok, m.v.iae! <= L32_IAE_MAX) },
    { key: 'sat', legend: t('lv.L32.ann.sat'), state: !m.ok ? 'off' : m.v.sat! > 0.05 ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.L32.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'casc_on', role: 'mentor', done: (s) => dialValues(s, 5)[0]! >= 0.5 || commissions(s) >= 1 },
    { id: 'tune_master', role: 'mentor', done: (s) => commissions(s) >= 1 || LATE(['tune_master', 'why'])(s) },
    { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'mentor', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { hdr: f(s, m.v.hdr!), iae: f(s, m.v.iae!), peak: f(s, m.v.peak!), open: f(s, m.v.open!), dist: f(s, m.v.dist!), sKc: f(s, m.v.sKc!), mKc: f(s, m.v.mKc!) };
    if (m.v.on === 0) return { key: 'single', cause: t('lv.L32.cause.single', vars) };
    if (m.v.hdr! > L32_HDR_MAX) return { key: 'weak_slave', cause: t('lv.L32.cause.weak_slave', vars) };
    if (m.v.iae! > L32_IAE_MAX) return { key: 'slow', cause: t('lv.L32.cause.slow', vars) };
    return { key: 'budget', cause: t('lv.L32.cause.budget', vars) };
  },
  equation: (s, m) => {
    if (!m.ok) return null;
    const K = shown(m.v.K!), d = shown(m.v.dist!);
    return `${f(s, K)} × ${f(s, d)} = ${f(s, shown(K * d))} K warmer with nobody controlling`;
  },
  lessonVars: (s, m) => ({ hdr: f(s, m.v.hdr!), open: f(s, l32OpenLoopRise()), dist: f(s, -L32_RIG.hdr), iae: f(s, m.v.iae!), sKc: f(s, m.v.sKc!), mKc: f(s, m.v.mKc!) }),
  metrics: (_s, m) => [
    { key: 'iae', unit: 'K s', value: m.v.iae! },
    { key: 'hdr_peak', unit: 'K', value: m.v.hdr! },
    { key: 'peak', unit: 'K', value: m.v.peak! },
  ],
  histogram: { metric: 'iae', best: () => L32_IAE_REF, spread: 1.0, lowerIsBetter: true },
  solver: dialScript([L32_REF.on, L32_REF.mKc, L32_REF.mTauI, L32_REF.sKc, L32_REF.sTauI], { v: l32OpenLoopRise() }),
  naive: dialScript([0, 1, 100, 1, 0]),
};
