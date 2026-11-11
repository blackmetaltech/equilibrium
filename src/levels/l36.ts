// L36 · Permit to Work (DEPTH Ch 9): maintenance on the fouled exchanger E-103 while the plant runs. The player orders the isolation steps (src/sim/ops/permit.ts): block, bleed, depressure, blind,
// drain, purge, gas test, lock, open up, clean, reinstate. The outlet pair has a passing valve, so the outlet needs a blind. While the exchanger is out the plant runs on the bypass at a loss.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { PERMIT, PERMIT_IDS, PERMIT_STEPS, runPermit, type PermitOut } from '../sim/ops/permit';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, act, carrierSetup, goalLamp, listActions, listOf, lit, mNone, playOnce } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, solvedOk } from './util';

type S = Readonly<EqState>;
export const L36_REF = ['close_in_1', 'close_in_2', 'close_out_1', 'bleed_in', 'depress', 'blind', 'drain', 'purge', 'gas_test', 'lock', 'open_up', 'clean', 'reinstate'];
export const L36_REF_OUT: PermitOut = runPermit(L36_REF);
export const L36_LOSS_REF = L36_REF_OUT.lossUsd;
export const L36_LOSS_STAR = L36_LOSS_REF * 1.03;
export const L36_BUDGET = Math.round(L36_LOSS_REF * 1.15);
export const L36_CALL_TOL = 0.05;
const KEYS = ['mins', 'hours', 'loss', 'sev', 'done', 'blocked', 'gas', 'nolock', 'barrier', 'live', 'steps', 'rate', 'resid'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const orderOf = (s: S): string[] => listOf<string>(s, 'order');
const codes = (r: PermitOut): Set<string> => new Set(r.events.filter((e) => e.kind === 'hazard').map((e) => e.code));

function measures(s: S): Measures {
  const order = orderOf(s), r = runPermit(order), c = codes(r);
  const base = { rate: PERMIT.lossUsdPerH };
  if (!solvedOk(s)) return mNone(KEYS, base);
  return { ok: true, v: { ...base, mins: r.mins, hours: r.hours, loss: r.lossUsd, sev: r.maxSev, done: r.done ? 1 : 0, blocked: r.blocked, gas: c.has('gas') ? 1 : 0, nolock: c.has('nolock') ? 1 : 0, barrier: c.has('barrier') ? 1 : 0, live: c.has('live') || c.has('spray') ? 1 : 0, steps: order.length, resid: r.state.resid! } };
}

export const L36: LevelSpec = {
  id: 'L36', chapter: 9, index: 36, setter: 'safety', budgetUSD: L36_BUDGET, units: CARRIER_UNITS, notes: 3, shiftLen: 0,
  setup: (s) => { carrierSetup(s); s.lv.order = []; },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'safe', met: m.ok && m.v.sev === 0, ...(m.ok ? { value: m.v.sev! } : {}), target: 0 },
      { key: 'done', met: m.ok && m.v.done === 1, ...(m.ok ? { value: m.v.done } : {}), target: 1 },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: m.ok && m.v.loss! <= L36_BUDGET, value: m.ok ? m.v.loss! : 0, target: L36_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'bypass_loss') !== null && relErr(predictionOf(s, 'bypass_loss')!.value, L36_LOSS_REF) <= L36_CALL_TOL,
    m.ok && m.v.loss! <= L36_LOSS_STAR,
  ],
  callIt: { key: 'bypass_loss', unit: 'USD', tol: L36_CALL_TOL, truth: () => L36_LOSS_REF },
  hero: (_s, m) => ({ key: 'loss', unit: 'USD', value: m.v.loss ?? 0, lo: 0, hi: L36_LOSS_STAR * 1.5 }),
  secondary: (_s, m) => ({ key: 'hours', unit: 'h', value: m.v.hours ?? 0, limit: L36_BUDGET / PERMIT.lossUsdPerH }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'gas', legend: t('lv.L36.ann.gas'), state: !m.ok ? 'off' : m.v.gas === 1 ? 'critical' : 'normal' },
    { key: 'lock', legend: t('lv.L36.ann.lock'), state: !m.ok ? 'off' : m.v.nolock === 1 ? 'critical' : 'normal' },
    { key: 'barrier', legend: t('lv.L36.ann.barrier'), state: !m.ok ? 'off' : m.v.barrier === 1 ? 'critical' : 'normal' },
    { key: 'bypass', legend: t('lv.L36.ann.bypass'), state: !m.ok ? 'off' : m.v.loss! > L36_BUDGET ? 'high' : 'normal' },
    { key: 'done', legend: t('lv.L36.ann.done'), state: lit(m.ok, m.v.done === 1) },
    { key: 'goal', legend: t('lv.L36.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'isolate', role: 'safety', done: (s) => orderOf(s).length > 0 },
    { id: 'verify', role: 'safety', done: (s) => { const r = runPermit(orderOf(s)); return r.maxSev === 0 && r.blocked === 0 && orderOf(s).length > 4; } },
    { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'safety', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { hours: f(s, m.v.hours!), loss: f(s, m.v.loss!), budget: f(s, L36_BUDGET), resid: f(s, m.v.resid!), pass: f(s, PERMIT.residPass) };
    if (m.v.gas === 1) return { key: 'gas', cause: t('lv.L36.cause.gas', vars) };
    if (m.v.nolock === 1) return { key: 'nolock', cause: t('lv.L36.cause.nolock', vars) };
    if (m.v.barrier === 1) return { key: 'barrier', cause: t('lv.L36.cause.barrier', vars) };
    if (m.v.live === 1) return { key: 'live', cause: t('lv.L36.cause.live', vars) };
    if (m.v.done !== 1) return { key: 'notdone', cause: t('lv.L36.cause.notdone', vars) };
    return { key: 'budget', cause: t('lv.L36.cause.budget', vars) };
  },
  equation: (s, m) => `${f(s, m.v.mins ?? 0)} ÷ 60 × ${f(s, m.v.rate!)} = ${f(s, ((m.v.mins ?? 0) / 60) * m.v.rate!)} USD of bypass loss`,
  lessonVars: (s, m) => ({ hours: f(s, m.v.hours ?? 0), loss: f(s, m.v.loss ?? 0), rate: f(s, m.v.rate!), pass: f(s, PERMIT.residPass), ref: f(s, L36_LOSS_REF) }),
  metrics: (_s, m) => [
    { key: 'loss', unit: 'USD', value: m.v.loss ?? 0 },
    { key: 'hours', unit: 'h', value: m.v.hours ?? 0 },
    { key: 'steps', unit: '', value: m.v.steps ?? 0 },
  ],
  histogram: { metric: 'loss', best: () => L36_LOSS_REF, spread: 0.5, lowerIsBetter: true },
  actions: listActions('order', PERMIT_IDS, 30, true),
  view: (s) => {
    const order = orderOf(s), r = runPermit(order);
    return {
      kind: 'permit',
      steps: PERMIT_STEPS.map((c) => ({ id: c.id, label: t(`lv.L36.step.${c.id}`), mins: c.mins })),
      order: order.map((id, i) => ({ i, id, label: t(`lv.L36.step.${id}`) })),
      trace: r.events.map((e) => ({ i: e.i, id: e.id, kind: e.kind, code: e.code, text: e.code === '' ? '' : t(`lv.L36.code.${e.code}`), sev: e.sev, t: e.t })),
      state: { ...r.state }, mins: r.mins, hours: r.hours, safe: r.maxSev === 0, done: r.done, halted: r.halted,
      lossUSD: r.lossUsd, lossUsdPerH: PERMIT.lossUsdPerH, refLossUSD: predictionOf(s, 'bypass_loss') !== null ? L36_LOSS_REF : -1, starLossUSD: predictionOf(s, 'bypass_loss') !== null ? Math.round(L36_LOSS_STAR) : -1, starTolPct: 3, budgetUSD: L36_BUDGET, residPass: PERMIT.residPass,
    };
  },
  solver: playOnce(() => L36_REF.map((id) => act('add', id)), { callIt: () => L36_LOSS_REF }),
  naive: playOnce(() => ['close_in_1', 'close_out_1', 'depress', 'drain', 'open_up', 'clean', 'reinstate'].map((id) => act('add', id))),
};
