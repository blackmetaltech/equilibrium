// L37 · The Analyser Lies (DEPTH Ch 9): data reconciliation. Five flow meters on a loop with a purge (src/sim/ops/recon.ts); one reads high (FI-102, +6 % Learner / +5 % Engineer) on top of 1 % noise.
// The player runs the least-squares reconciliation, reads the normalised adjustments, accuses a meter (flag), excludes it and checks the balance closes. Call it: which meter (1-5).
import { need, Rng, seedState } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { LOOP_A, LOOP_TAGS, LOOP_TRUE, reconcile, type ReconOut } from '../sim/ops/recon';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, act, carrierSetup, edit, goalLamp, listOf, lit, mNone, playOnce } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, shown, solvedOk } from './util';

type S = Readonly<EqState>;
export const BIASED = 1;
export const L37_BIAS = { learner: 0.06, engineer: 0.05 };
export const L37_SIGMA = 0.01;
export const L37_CALL_FEE = 2000, L37_BUDGET = 2500;
const KEYS = ['chi2', 'crit', 'err', 'errRef', 'flags', 'excl', 'found', 'wrong', 'consistent', 'truth', 'fee', 'r1', 'y1', 'y2', 'y5', 'z', 'zAccused', 'zTruth', 'bias'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const nums = (s: S, k: string): number[] => listOf<number>(s, k);
const yOf = (s: S): number[] => nums(s, 'y'), sgOf = (s: S): number[] => nums(s, 'sigma');
const run = (s: S, excl: number[]): ReconOut => reconcile(LOOP_A, yOf(s), sgOf(s), excl);
const rms = (x: number[]): number => Math.sqrt(x.reduce((a, v, i) => a + (v - LOOP_TRUE[i]!) * (v - LOOP_TRUE[i]!), 0) / x.length);
const errOf = (s: S, excl: number[]): number => rms(run(s, excl).xhat);
const rawZ = (s: S): ReconOut => run(s, []);

function measures(s: S): Measures {
  if (yOf(s).length !== 5) return mNone(KEYS);
  const raw = rawZ(s), excl = nums(s, 'excluded'), fl = nums(s, 'flagged'), r = run(s, excl);
  const base = { crit: r.chi2Crit, truth: raw.worst + 1, fee: L37_CALL_FEE, bias: s.mode === 'engineer' ? L37_BIAS.engineer : L37_BIAS.learner, y1: shown(yOf(s)[0]!), y2: shown(yOf(s)[1]!), y5: shown(yOf(s)[4]!), r1: shown(shown(yOf(s)[0]!) + shown(yOf(s)[4]!) - shown(yOf(s)[1]!)) };
  if (!solvedOk(s)) return mNone(KEYS, base);
  const found = fl.length === 1 && fl[0] === raw.worst;
  return { ok: true, v: { ...base, chi2: r.chi2, err: rms(r.xhat), errRef: errOf(s, [raw.worst]), flags: fl.length, excl: excl.length, found: found ? 1 : 0, wrong: fl.length > 0 && !found ? 1 : 0, consistent: r.chi2 <= r.chi2Crit ? 1 : 0, z: raw.z[raw.worst]!, zAccused: fl.length ? raw.z[fl[0]!]! : 0, zTruth: raw.z[raw.worst]! } };
}

export const L37: LevelSpec = {
  id: 'L37', chapter: 9, index: 37, setter: 'manager', budgetUSD: L37_BUDGET, units: CARRIER_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    carrierSetup(s);
    const rng = new Rng(seedState(s.seed ^ 0x3737)), bias = s.mode === 'engineer' ? L37_BIAS.engineer : L37_BIAS.learner;
    const sg = LOOP_TRUE.map((x) => L37_SIGMA * x);
    s.lv.sigma = sg;
    s.lv.y = LOOP_TRUE.map((x, i) => x + Math.max(-1.2, Math.min(1.2, rng.normal(0, 1))) * sg[i]! + (i === BIASED ? bias * x : 0));
    s.lv.excluded = []; s.lv.flagged = []; s.lv.shown = 0;
  },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'found', met: m.ok && m.v.found === 1, ...(m.ok ? { value: m.v.found } : {}), target: 1 },
      { key: 'closed', met: m.ok && m.v.consistent === 1, ...(m.ok ? { value: m.v.chi2 } : {}), target: m.v.crit ?? 0 },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: m.ok && m.v.flags! * L37_CALL_FEE <= L37_BUDGET, value: m.ok ? m.v.flags! * L37_CALL_FEE : 0, target: L37_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'biased_meter') !== null && predictionOf(s, 'biased_meter')!.value === m.v.truth,
    m.ok && m.v.err! <= m.v.errRef! * 1.03,
  ],
  callIt: { key: 'biased_meter', unit: '', tol: 0, truth: (s) => (yOf(s).length === 5 ? rawZ(s).worst + 1 : null) },
  hero: (_s, m) => ({ key: 'chi2', unit: '', value: m.v.chi2 ?? 0, lo: 0, hi: Math.max(40, (m.v.crit ?? 8) * 5) }),
  secondary: (_s, m) => ({ key: 'err', unit: 't/h', value: m.v.err ?? 0, limit: 5 }),
  annunciators: (s, m, g): Annunciator[] => {
    const r = yOf(s).length === 5 ? LOOP_A.map((row) => row.reduce((a, c, k) => a + c * yOf(s)[k]!, 0)) : [0, 0, 0];
    const sd = LOOP_A.map((row) => Math.sqrt(row.reduce((a, c, k) => a + c * c * sgOf(s)[k]! * sgOf(s)[k]!, 0)) || 1);
    const off = (i: number): Annunciator['state'] => (Math.abs(r[i]!) > 2 * sd[i]! ? 'high' : 'normal');
    return [
      { key: 'mixer', legend: t('lv.L37.ann.mixer'), state: off(0) },
      { key: 'reactor', legend: t('lv.L37.ann.reactor'), state: off(1) },
      { key: 'split', legend: t('lv.L37.ann.split'), state: off(2) },
      { key: 'chi2', legend: t('lv.L37.ann.chi2'), state: lit(m.ok, m.v.consistent === 1) },
      { key: 'wrong', legend: t('lv.L37.ann.wrong'), state: !m.ok ? 'off' : m.v.wrong === 1 ? 'high' : 'normal' },
      { key: 'goal', legend: t('lv.L37.ann.goal'), state: goalLamp(m.ok, g) },
    ];
  },
  coach: [
    { id: 'imbalance', role: 'manager', done: (s) => s.lv.shown === 1 },
    { id: 'flag', role: 'manager', done: (s) => nums(s, 'flagged').length > 0 },
    { id: 'exclude', role: 'manager', done: (s) => nums(s, 'excluded').length > 0 },
    { id: 'commission', role: 'manager', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'manager', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const fl = nums(s, 'flagged');
    const vars = { tag: LOOP_TAGS[(m.v.truth ?? 1) - 1]!, accused: fl.length ? LOOP_TAGS[fl[0]!]! : '-', z: f(s, m.v.zTruth ?? 0), za: f(s, m.v.zAccused ?? 0), chi2: f(s, m.v.chi2 ?? 0), crit: f(s, m.v.crit ?? 0), bias: f(s, 100 * m.v.bias!) };
    if (fl.length === 0) return { key: 'nofind', cause: t('lv.L37.cause.nofind', vars) };
    if (m.v.wrong === 1) return { key: 'wrong', cause: t('lv.L37.cause.wrong', vars) };
    if (m.v.consistent !== 1) return { key: 'open', cause: t('lv.L37.cause.open', vars) };
    return { key: 'budget', cause: t('lv.L37.cause.budget', vars) };
  },
  equation: (s, m) => `${f(s, m.v.y1!)} + ${f(s, m.v.y5!)} − ${f(s, m.v.y2!)} = ${f(s, m.v.r1!)} t/h of mixer imbalance`,
  lessonVars: (s, m) => ({ tag: LOOP_TAGS[(m.v.truth ?? 1) - 1]!, z: f(s, m.v.z ?? 0), chi2: f(s, m.v.chi2 ?? 0), crit: f(s, m.v.crit ?? 0), r1: f(s, m.v.r1!), bias: f(s, 100 * m.v.bias!) }),
  metrics: (_s, m) => [
    { key: 'err', unit: 't/h', value: m.v.err ?? 0 },
    { key: 'chi2', unit: '', value: m.v.chi2 ?? 0 },
    { key: 'flags', unit: '', value: m.v.flags ?? 0 },
  ],
  histogram: { metric: 'err', best: (_s, m) => m.v.errRef!, spread: 1.5, lowerIsBetter: true },
  actions: {
    reconcile: (s) => { s.lv.shown = 1; },
    exclude: (s, i: unknown) => edit(s, () => { need(typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < 5, t('lv.err.ch9_index')); const l = nums(s, 'excluded'); if (!l.includes(i as number)) s.lv.excluded = [...l, i as number].sort(); }),
    include: (s, i: unknown) => edit(s, () => { s.lv.excluded = nums(s, 'excluded').filter((x) => x !== i); }),
    /** Flagging a meter also takes it out of the balance (one step, not two); unflagging puts it back. */
    flag: (s, i: unknown) => edit(s, () => { need(typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < 5, t('lv.err.ch9_index')); const l = nums(s, 'flagged'); if (!l.includes(i as number)) s.lv.flagged = [...l, i as number].sort(); const x = nums(s, 'excluded'); if (!x.includes(i as number)) s.lv.excluded = [...x, i as number].sort(); }),
    unflag: (s, i: unknown) => edit(s, () => { s.lv.flagged = nums(s, 'flagged').filter((x) => x !== i); s.lv.excluded = nums(s, 'excluded').filter((x) => x !== i); }),
  },
  view: (s) => {
    const y = yOf(s), sg = sgOf(s), shownOn = s.lv.shown === 1 && y.length === 5, excl = nums(s, 'excluded'), fl = nums(s, 'flagged');
    if (y.length !== 5) return { kind: 'reconcile', nodes: [], meters: [], chi2: 0, chi2Crit: 0, shown: false };
    const r = run(s, excl), raw = rawZ(s), ok = solvedOk(s);
    return {
      kind: 'reconcile', shown: shownOn,
      /** `closes`: the node's imbalance (after reconciling, once shown) is inside the 95 % noise band of its meters; the front-end colours N1-N3 by it. */
      nodes: LOOP_A.map((row, i) => {
        const after = shownOn ? row.reduce((a, c, k) => a + c * (excl.includes(k) ? r.xhat[k]! : y[k]!), 0) : raw.resid[i]!;
        const tol = 1.96 * Math.sqrt(row.reduce((a, c, k) => a + c * sg[k]! * c * sg[k]!, 0));
        return { id: `N${i + 1}`, label: t(`lv.L37.node.${i + 1}`), coeffs: row.slice(), imbalance: raw.resid[i]!, imbalanceAfter: after, tol, closes: Math.abs(after) <= tol };
      }),
      meters: y.map((v, i) => ({ i, tag: LOOP_TAGS[i]!, label: t(`lv.L37.meter.${i + 1}`), reading: v, sigma: sg[i]!, excluded: excl.includes(i), flagged: fl.includes(i), recon: shownOn ? r.xhat[i]! : null, adjust: shownOn ? r.eps[i]! : null, z: shownOn ? raw.z[i]! : null })),
      chi2: r.chi2, chi2Crit: r.chi2Crit, dof: LOOP_A.length - excl.length, chi2CritRaw: raw.chi2Crit, dofRaw: LOOP_A.length, rmsErr: ok ? rms(r.xhat) : null, flagFeeUSD: L37_CALL_FEE, budgetUSD: L37_BUDGET, zLimit: 3.29,
    };
  },
  solver: playOnce((s) => { const w = rawZ(s).worst; return [act('reconcile'), act('flag', w), act('exclude', w)]; }, { callIt: (s) => rawZ(s).worst + 1 }),
  naive: playOnce(() => [act('reconcile'), act('flag', 3), act('exclude', 3)]),
};
