// L31 · Ratio (DEPTH Ch 8): H2:N2 ratio control on the feeds of L01 (callback). The N2 header surges (5 -> 3 -> 5 -> 6.5 -> 5 kmol/h); a fixed H2 flow vents H2 when N2 drops.
// A ratio station (follower set point = R x measured N2) on a tuned H2 flow loop keeps the 3 : 1 of moles. Dials: ratio on (0/1), R (mol H2 per mol N2), follower Kc, tauI.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { L31_RIG, runL31, type L31Out } from '../sim/control/rigs';
import type { EqState } from '../state';
import { dialActions, dialScript, dialValues, goalLamp, lit, none, rigOk, rigSetup, LATE } from './ch8_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, shown } from './util';

type S = Readonly<EqState>;
export const L31_H2_MAX = 2, L31_VENT_MAX = 3;
export const L31_HW_FIXED = 6000, L31_HW_RATIO = 13000, L31_BUDGET = 15000;
/** 3 mol of H2 per mol of N2 (the L01 stoichiometry); the Call-it oracle. */
export const L31_R = 3;
export const L31_REF = { on: 1, R: L31_R, kc: 1.5, tauI: 6 };
export const L31_H2_REF = runL31(true, L31_REF.R, L31_REF.kc, L31_REF.tauI).ventH2Pct;
export const L31_H2_STAR = L31_H2_REF * 1.03;
export const L31_CALL_TOL = 0.01;
const KEYS = ['on', 'R', 'kc', 'tauI', 'h2vent', 'vent', 'err', 'hw', 'ventH2', 'ventN2', 'fedH2', 'n2lo', 'h2fixed'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const UNITS: LevelSpec['units'] = { feed: { max: 1, price: 0 }, product: { max: 1, price: 0 } };

function run(s: S): { d: number[]; out: L31Out | null } {
  const d = dialValues(s, 4);
  return { d, out: rigOk(s, d) ? runL31(d[0]! >= 0.5, d[1]!, d[2]!, d[3]!) : null };
}
/** The recorder: H2 flow (pv), its set point (sp), valve (op); plus the N2 header flow. */
export const l31Series = (s: S) => { const r = run(s).out; return r === null ? null : { ...r.series, n2: r.n2 }; };

function measures(s: S): Measures {
  const { d, out } = run(s);
  if (out === null) return none(KEYS);
  const on = d[0]! >= 0.5;
  return { ok: true, v: { on: on ? 1 : 0, R: d[1]!, kc: d[2]!, tauI: d[3]!, h2vent: out.ventH2Pct, vent: out.ventPct, err: out.ratioErrPct, hw: on ? L31_HW_RATIO : L31_HW_FIXED, ventH2: out.ventH2, ventN2: out.ventN2, fedH2: out.fedH2, n2lo: 3, h2fixed: 3 * L31_RIG.n2 } };
}
const truthR = (): number => L31_R;

export const L31: LevelSpec = {
  id: 'L31', firstRun: true, chapter: 8, index: 31, setter: 'mentor', budgetUSD: L31_BUDGET, units: UNITS, notes: 2, shiftLen: 0,
  setup: (s) => rigSetup(s, UNITS, [{ key: 'on', def: { learner: 0, engineer: 0 } }, { key: 'R', def: { learner: 1, engineer: 1 } }, { key: 'kc', def: { learner: 1.5, engineer: 0.3 } }, { key: 'tauI', def: { learner: 6, engineer: 0 } }]),
  actions: dialActions,
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'h2vent', met: m.ok && m.v.h2vent! <= L31_H2_MAX, ...(m.ok ? { value: m.v.h2vent } : {}), target: L31_H2_MAX },
      { key: 'vent', met: m.ok && m.v.vent! <= L31_VENT_MAX, ...(m.ok ? { value: m.v.vent } : {}), target: L31_VENT_MAX },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: !m.ok || m.v.hw! <= L31_BUDGET, value: m.ok ? m.v.hw! : 0, target: L31_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'ratio_h2_n2') !== null && relErr(predictionOf(s, 'ratio_h2_n2')!.value, truthR()) <= L31_CALL_TOL,
    m.ok && m.v.h2vent! <= L31_H2_STAR,
  ],
  callIt: { key: 'ratio_h2_n2', unit: 'mol/mol', tol: L31_CALL_TOL, truth: () => truthR() },
  hero: (_s, m) => ({ key: 'h2vent', unit: '%', value: m.v.h2vent!, lo: 0, hi: L31_H2_MAX }),
  secondary: (_s, m) => ({ key: 'vent', unit: '%', value: m.v.vent!, limit: L31_VENT_MAX }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'h2', legend: t('lv.L31.ann.h2'), state: !m.ok ? 'off' : m.v.h2vent! > 3 * L31_H2_MAX ? 'critical' : m.v.h2vent! > L31_H2_MAX ? 'high' : 'normal' },
    { key: 'n2', legend: t('lv.L31.ann.n2'), state: !m.ok ? 'off' : m.v.ventN2! > m.v.ventH2! && m.v.vent! > L31_VENT_MAX ? 'critical' : m.v.vent! > L31_VENT_MAX ? 'high' : 'normal' },
    { key: 'ratio', legend: t('lv.L31.ann.ratio'), state: !m.ok ? 'off' : m.v.on === 1 ? 'normal' : 'high' },
    { key: 'err', legend: t('lv.L31.ann.err'), state: lit(m.ok, m.v.err! <= 5) },
    { key: 'goal', legend: t('lv.L31.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'ratio_on', role: 'mentor', done: (s) => dialValues(s, 4)[0]! >= 0.5 || commissions(s) >= 1 },
    { id: 'set_ratio', role: 'mentor', done: (s) => Math.abs((dialValues(s, 4)[1] ?? 0) - L31_R) < 0.05 || commissions(s) >= 1 },
    { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'mentor', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { R: f(s, m.v.R!), h2vent: f(s, m.v.h2vent!), vent: f(s, m.v.vent!), ventH2: f(s, m.v.ventH2!), ventN2: f(s, m.v.ventN2!), fixed: f(s, m.v.h2fixed!), lo: f(s, m.v.n2lo!), kc: f(s, m.v.kc!), tauI: f(s, m.v.tauI!) };
    if (m.v.on === 0) return { key: 'fixed', cause: t('lv.L31.cause.fixed', vars) };
    if (relErr(m.v.R!, L31_R) > 0.03) return { key: 'wrong_ratio', cause: t(m.v.R! < L31_R ? 'lv.L31.cause.wrong_low' : 'lv.L31.cause.wrong_high', vars) };
    if (m.v.h2vent! > L31_H2_MAX || m.v.vent! > L31_VENT_MAX) return { key: 'sluggish', cause: t('lv.L31.cause.sluggish', vars) };
    return { key: 'budget', cause: t('lv.L31.cause.budget', vars) };
  },
  equation: (s, m) => {
    if (!m.ok) return null;
    const R = shown(m.v.R!), n2 = L31_RIG.n2;
    return `${f(s, R)} × ${f(s, n2)} = ${f(s, shown(R * n2))} kmol/h of H₂ at the nominal N₂`;
  },
  lessonVars: (s, m) => ({ R: f(s, m.v.R!), h2vent: f(s, m.v.h2vent!), vent: f(s, m.v.vent!), fixed: f(s, 3 * L31_RIG.n2), lo: f(s, 3), kc: f(s, m.v.kc!), tauI: f(s, m.v.tauI!) }),
  metrics: (_s, m) => [
    { key: 'h2vent', unit: '%', value: m.v.h2vent! },
    { key: 'vent', unit: '%', value: m.v.vent! },
    { key: 'ratio_err', unit: '%', value: m.v.err! },
  ],
  histogram: { metric: 'h2vent', best: () => L31_H2_REF, spread: 1.2, lowerIsBetter: true },
  solver: dialScript([L31_REF.on, L31_REF.R, L31_REF.kc, L31_REF.tauI], { v: truthR() }),
  naive: dialScript([0, 1, 0.3, 0]),
};
