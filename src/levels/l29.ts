// L29 · Hold the Line (DEPTH Ch 8): the feed drum level on a LIC. A step in the inflow; P-only leaves an offset of dq / Kc (the Call-it); integral action removes it and,
// pushed too hard, rings. Dials (placement order): Kc, tauI (0 = off). The rig is src/sim/control/rigs.ts runL29: tank + outlet valve (direct acting) + valve lag.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { L29_RIG, l29Offset, runL29, type L29Out } from '../sim/control/rigs';
import type { EqState } from '../state';
import { controlView, dialActions, dialScript, dialValues, goalLamp, lit, none, rigOk, rigSetup, LATE } from './ch8_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, shown } from './util';

type S = Readonly<EqState>;
export const L29_OFFSET_MAX = 1, L29_PEAK_MAX = 4, L29_OVER_MAX = 10;
export const L29_HW = 9000, L29_BUDGET = 12000;
/** Reference solution: Kc 4, tauI 60 s. GAME numbers, UNVERIFIED. */
export const L29_REF = { kc: 4, tauI: 60 };
export const L29_IAE_REF = runL29(L29_REF.kc, L29_REF.tauI).m.iae;
export const L29_IAE_STAR = L29_IAE_REF * 1.03;
export const L29_CALL_TOL = 0.05;
const KEYS = ['kc', 'tauI', 'offset', 'peak', 'over', 'iae', 'moves', 'sat', 'hw', 'dq', 'poff'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const UNITS: LevelSpec['units'] = { feed: { max: 1, price: 0 }, product: { max: 1, price: 0 } };

function run(s: S): { d: number[]; out: L29Out | null } {
  const d = dialValues(s, 2);
  return { d, out: rigOk(s, d) ? runL29(d[0]!, d[1]!) : null };
}
/** The recorder: level (pv), set point (sp) and valve (op) every second; null before the first commission. */
export const l29Series = (s: S) => run(s).out?.series ?? null;

function measures(s: S): Measures {
  const { d, out } = run(s);
  if (out === null) return none(KEYS);
  const kc = d[0]!;
  return { ok: true, v: { kc, tauI: d[1]!, offset: out.offsetPct, peak: out.peakDev, over: out.overshootPct, iae: out.m.iae, moves: out.moves, sat: out.m.satShare, hw: L29_HW, dq: L29_RIG.qin1 - L29_RIG.qin0, poff: kc > 0 ? l29Offset(kc) : 0 } };
}

const VIEW = (s: S) => controlView({ s, id: 'L29', dials: [{ key: 'kc', unit: '', min: 0.1, max: 20, step: 0.1 }, { key: 'tauI', unit: 's', min: 0, max: 300, step: 5 }], series: l29Series(s) as Record<string, number[]> | null, metric: { value: measures(s).v.iae!, unit: '% s', star3: L29_IAE_STAR } });

export const L29: LevelSpec = {
  id: 'L29', firstRun: true, chapter: 8, index: 29, setter: 'mentor', budgetUSD: L29_BUDGET, units: UNITS, notes: 3, shiftLen: 0,
  setup: (s) => rigSetup(s, UNITS, [{ key: 'kc', def: { learner: 1, engineer: 1 } }, { key: 'tauI', def: { learner: 0, engineer: 0 } }]),
  actions: dialActions,
  view: (s) => VIEW(s),
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'offset', met: m.ok && m.v.offset! <= L29_OFFSET_MAX, ...(m.ok ? { value: m.v.offset } : {}), target: L29_OFFSET_MAX },
      { key: 'peak', met: m.ok && m.v.peak! <= L29_PEAK_MAX, ...(m.ok ? { value: m.v.peak } : {}), target: L29_PEAK_MAX },
      { key: 'over', met: m.ok && m.v.over! <= L29_OVER_MAX, ...(m.ok ? { value: m.v.over } : {}), target: L29_OVER_MAX },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: m.ok && m.v.hw! <= L29_BUDGET, value: m.ok ? m.v.hw! : 0, target: L29_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'offset_pct') !== null && relErr(predictionOf(s, 'offset_pct')!.value, l29Offset(L29_RIG.callKc)) <= L29_CALL_TOL,
    m.ok && m.v.iae! <= L29_IAE_STAR,
  ],
  callIt: { key: 'offset_pct', unit: '%', tol: L29_CALL_TOL, truth: () => l29Offset(L29_RIG.callKc) },
  hero: (_s, m) => ({ key: 'offset', unit: '%', value: m.v.offset!, lo: 0, hi: L29_OFFSET_MAX }),
  secondary: (_s, m) => ({ key: 'peak', unit: '%', value: m.v.peak!, limit: L29_PEAK_MAX }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'hi', legend: t('lv.L29.ann.hi'), state: !m.ok ? 'off' : m.v.peak! > 2 * L29_PEAK_MAX ? 'critical' : m.v.peak! > L29_PEAK_MAX ? 'high' : 'normal' },
    { key: 'off', legend: t('lv.L29.ann.off'), state: lit(m.ok, m.v.offset! <= L29_OFFSET_MAX) },
    { key: 'over', legend: t('lv.L29.ann.over'), state: lit(m.ok, m.v.over! <= L29_OVER_MAX) },
    { key: 'sat', legend: t('lv.L29.ann.sat'), state: lit(m.ok, m.v.sat! === 0) },
    { key: 'goal', legend: t('lv.L29.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'open_dials', role: 'mentor', done: (s) => dialValues(s, 2)[0] !== 1 || dialValues(s, 2)[1] !== (s.mode === 'learner' ? 60 : 0) || commissions(s) >= 1 },
    { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'read_chart', role: 'mentor', done: LATE(['read_chart', 'integral', 'why']) },
    { id: 'integral', role: 'mentor', done: (s) => (dialValues(s, 2)[1] ?? 0) > 0 && commissions(s) >= 2 || LATE(['integral', 'why'])(s) },
    { id: 'why', role: 'mentor', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { kc: f(s, m.v.kc!), tauI: f(s, m.v.tauI!), offset: f(s, m.v.offset!), peak: f(s, m.v.peak!), over: f(s, m.v.over!), dq: f(s, m.v.dq!), poff: f(s, m.v.poff!) };
    if (m.v.over! > L29_OVER_MAX) return { key: 'overshoot', cause: t('lv.L29.cause.overshoot', vars) };
    if (m.v.offset! > L29_OFFSET_MAX) return m.v.tauI! === 0 ? { key: 'offset', cause: t('lv.L29.cause.offset', vars) } : { key: 'slow', cause: t('lv.L29.cause.slow', vars) };
    if (m.v.peak! > L29_PEAK_MAX) return { key: 'peak', cause: t('lv.L29.cause.peak', vars) };
    return { key: 'budget', cause: t('lv.L29.cause.budget', vars) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.kc! > 0)) return null;
    const kc = shown(m.v.kc!), dq = shown(m.v.dq!);
    return `${f(s, dq)} ÷ ${f(s, kc)} = ${f(s, shown(dq / kc))} % offset with P-only`;
  },
  lessonVars: (s, m) => ({ kc: f(s, m.v.kc!), tauI: f(s, m.v.tauI!), offset: f(s, m.v.offset!), peak: f(s, m.v.peak!), dq: f(s, L29_RIG.qin1 - L29_RIG.qin0), poff: f(s, m.v.kc! > 0 ? l29Offset(m.v.kc!) : 0) }),
  metrics: (_s, m) => [
    { key: 'iae', unit: '% s', value: m.v.iae! },
    { key: 'peak', unit: '%', value: m.v.peak! },
    { key: 'valve_travel', unit: '%', value: m.v.moves! },
  ],
  histogram: { metric: 'iae', best: () => L29_IAE_REF, spread: 0.6, lowerIsBetter: true },
  solver: dialScript([L29_REF.kc, L29_REF.tauI], { v: l29Offset(L29_RIG.callKc) }),
  naive: dialScript([1, 0]),
};
