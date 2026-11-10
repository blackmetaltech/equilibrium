// L30 · Tune It (DEPTH Ch 8): the converter inlet TIC. The plant is a FOPDT (K 1.8 K/%, tau 45 s, theta 12 s) the player does not know: run the bump test, read K, tau, theta
// off the recorder (the level fits them, two-point method), tune the PI by IMC with lambda = theta, and keep the heater out of saturation. Dials: Kc, tauI, tauD.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { bumpL30, L30_PROC, L30_RIG, runL30, type L30Out } from '../sim/control/rigs';
import { fitFopdt, imcPI } from '../sim/control';
import type { EqState } from '../state';
import { dialActions, dialScript, dialValues, goalLamp, lit, rigOk, rigSetup, LATE } from './ch8_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, shown } from './util';

type S = Readonly<EqState>;
export const L30_IAE_MAX = 500, L30_OVER_MAX = 25;
export const L30_HW = 14000, L30_BUDGET = 16000;
/** lambda of the rule given in the setter's note: the dead time (12 s). */
export const L30_LAMBDA = L30_RIG.lambda;
export const L30_REF = imcPI(L30_PROC, L30_LAMBDA);
export const L30_IAE_REF = runL30(L30_REF.kc, L30_REF.tauI, 0).iae;
export const L30_IAE_STAR = L30_IAE_REF * 1.03;
export const L30_CALL_TOL = 0.05;
const KEYS = ['kc', 'tauI', 'tauD', 'iae', 'sat', 'over', 'hw', 'K', 'tau', 'theta', 'lambda', 'kcImc'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const UNITS: LevelSpec['units'] = { feed: { max: 1, price: 0 }, product: { max: 1, price: 0 } };
/** What the recorder shows of the bump test, fitted: always available (the bump is an open-loop test on the same plant). */
export const l30Fit = () => { const b = bumpL30(); return fitFopdt(b.t, b.y, b.du); };
export const l30Bump = bumpL30;

function run(s: S): { d: number[]; out: L30Out | null } {
  const d = dialValues(s, 3);
  return { d, out: rigOk(s, d) ? runL30(d[0]!, d[1]!, d[2]!) : null };
}
export const l30Series = (s: S) => run(s).out?.series ?? null;

function measures(s: S): Measures {
  const { d, out } = run(s), fit = l30Fit(), imc = imcPI(fit, L30_LAMBDA);
  const base = { K: fit.K, tau: fit.tau, theta: fit.theta, lambda: L30_LAMBDA, kcImc: imc.kc };
  if (out === null) return { ok: false, v: { kc: 0, tauI: 0, tauD: 0, iae: 0, sat: 0, over: 0, hw: 0, ...base } };
  return { ok: true, v: { kc: d[0]!, tauI: d[1]!, tauD: d[2]!, iae: out.iae, sat: out.satShare, over: out.overshootPct, hw: L30_HW, ...base } };
}
const truthKc = (): number => imcPI(L30_PROC, L30_LAMBDA).kc;

export const L30: LevelSpec = {
  id: 'L30', firstRun: true, chapter: 8, index: 30, setter: 'mentor', budgetUSD: L30_BUDGET, units: UNITS, notes: 2, shiftLen: 0,
  setup: (s) => rigSetup(s, UNITS, [{ key: 'kc', def: { learner: 0.5, engineer: 1 } }, { key: 'tauI', def: { learner: 45, engineer: 0 } }, { key: 'tauD', def: { learner: 0, engineer: 0 } }]),
  actions: dialActions,
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'iae', met: m.ok && m.v.iae! <= L30_IAE_MAX, ...(m.ok ? { value: m.v.iae } : {}), target: L30_IAE_MAX },
      { key: 'sat', met: m.ok && m.v.sat! === 0, ...(m.ok ? { value: m.v.sat! * 100 } : {}), target: 0 },
      { key: 'over', met: m.ok && m.v.over! <= L30_OVER_MAX, ...(m.ok ? { value: m.v.over } : {}), target: L30_OVER_MAX },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: !m.ok || m.v.hw! <= L30_BUDGET, value: m.ok ? m.v.hw! : 0, target: L30_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'kc_imc') !== null && relErr(predictionOf(s, 'kc_imc')!.value, truthKc()) <= L30_CALL_TOL,
    m.ok && m.v.iae! <= L30_IAE_STAR,
  ],
  callIt: { key: 'kc_imc', unit: '%/K', tol: L30_CALL_TOL, truth: () => truthKc() },
  hero: (_s, m) => ({ key: 'iae', unit: 'K s', value: m.v.iae!, lo: 0, hi: L30_IAE_MAX }),
  secondary: (_s, m) => ({ key: 'over', unit: '%', value: m.v.over!, limit: L30_OVER_MAX }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'iae', legend: t('lv.L30.ann.iae'), state: lit(m.ok, m.v.iae! <= L30_IAE_MAX) },
    { key: 'over', legend: t('lv.L30.ann.over'), state: lit(m.ok, m.v.over! <= L30_OVER_MAX, m.v.over! > 100 ? 'critical' : 'high') },
    { key: 'sat', legend: t('lv.L30.ann.sat'), state: !m.ok ? 'off' : m.v.sat! > 0.2 ? 'critical' : m.v.sat! > 0 ? 'high' : 'normal' },
    { key: 'hunt', legend: t('lv.L30.ann.hunt'), state: !m.ok ? 'off' : m.v.over! > 100 ? 'critical' : 'normal' },
    { key: 'goal', legend: t('lv.L30.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'bump', role: 'mentor', done: LATE(['bump', 'fit', 'tune', 'why']) },
    { id: 'fit', role: 'mentor', done: LATE(['fit', 'tune', 'why']) },
    { id: 'tune', role: 'mentor', done: (s) => commissions(s) >= 1 || LATE(['tune', 'why'])(s) },
    { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'mentor', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { kc: f(s, m.v.kc!), tauI: f(s, m.v.tauI!), iae: f(s, m.v.iae!), over: f(s, m.v.over!), sat: f(s, m.v.sat! * 100), kcImc: f(s, m.v.kcImc!), tau: f(s, m.v.tau!) };
    if (m.v.sat! > 0) return { key: 'saturated', cause: t('lv.L30.cause.saturated', vars) };
    if (m.v.over! > L30_OVER_MAX) return { key: 'overshoot', cause: t('lv.L30.cause.overshoot', vars) };
    if (m.v.iae! > L30_IAE_MAX) return { key: 'slow', cause: t('lv.L30.cause.slow', vars) };
    return { key: 'budget', cause: t('lv.L30.cause.budget', vars) };
  },
  equation: (s, m) => {
    const tau = shown(m.v.tau!), K = shown(m.v.K!), th = shown(m.v.theta!), lam = shown(m.v.lambda!);
    if (!(K > 0)) return null;
    return `${f(s, tau)} ÷ (${f(s, K)} × (${f(s, lam)} + ${f(s, th)})) = ${f(s, shown(tau / (K * (lam + th))))} %/K from your bump test`;
  },
  lessonVars: (s, m) => ({ K: f(s, m.v.K!), tau: f(s, m.v.tau!), theta: f(s, m.v.theta!), lambda: f(s, m.v.lambda!), kcImc: f(s, m.v.kcImc!), kc: f(s, m.v.kc!), tauI: f(s, m.v.tauI!), iae: f(s, m.v.iae!) }),
  metrics: (_s, m) => [
    { key: 'iae', unit: 'K s', value: m.v.iae! },
    { key: 'overshoot', unit: '%', value: m.v.over! },
    { key: 'sat_pct', unit: '%', value: m.v.sat! * 100 },
  ],
  histogram: { metric: 'iae', best: () => L30_IAE_REF, spread: 0.5, lowerIsBetter: true },
  solver: dialScript([L30_REF.kc, L30_REF.tauI, 0], { v: truthKc() }),
  naive: dialScript([1, 0, 0]),
};
