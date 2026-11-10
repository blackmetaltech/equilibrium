// L38 · Turnaround Plan (DEPTH Ch 9): a 20-day window with eight jobs, dependencies, one crane (a second can be hired) and eight crew. The player orders the jobs by priority (the schedule is
// resource-levelled by serial schedule generation, src/sim/ops/turnaround.ts) and decides on the second crane. Lost tonnes = days down x rate; cost = lost margin + crane hire.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { cpm, levelledCritical, schedule, type Job } from '../sim/ops/turnaround';
import type { EqState } from '../state';
import { need } from '@core/kit';
import { CARRIER_UNITS, LATE, act, carrierSetup, edit, goalLamp, listActions, listOf, lit, mNone, playOnce } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, solvedOk } from './util';

type S = Readonly<EqState>;
const J = (id: string, days: number, deps: string[], crew: number, crane: number): Job => ({ id, days, deps, crew, crane });
export const L38_JOBS: Job[] = [J('J1', 2, [], 4, 0), J('J2', 6, ['J1'], 4, 1), J('J3', 5, ['J1'], 3, 1), J('J4', 4, ['J1'], 2, 0), J('J5', 5, ['J1'], 4, 0), J('J6', 3, ['J1'], 2, 0), J('J7', 2, ['J2', 'J3'], 3, 0), J('J8', 3, ['J4', 'J5', 'J6', 'J7'], 4, 0)];
export const L38_LIM = { crew: 8, craneBase: 1 };
export const L38_WINDOW = 20;
export const L38_RATE_T_PER_D = 1500, L38_MARGIN_USD_PER_T = 220, L38_CRANE_HIRE_USD = 450000;
export const L38_START_ORDER = ['J1', 'J5', 'J4', 'J6', 'J2', 'J3', 'J7', 'J8'];
/** Reference: the priority found by exhaustive search over all 8! orders (checked in ch9.test) and the second crane. */
export const L38_REF_ORDER = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'];
export const L38_CPM = cpm(L38_JOBS);
export const cost = (days: number, crane: number): number => days * L38_RATE_T_PER_D * L38_MARGIN_USD_PER_T + (crane > 1 ? L38_CRANE_HIRE_USD : 0);
export const L38_REF = schedule(L38_JOBS, L38_REF_ORDER, { crew: L38_LIM.crew, crane: 2 });
export const L38_COST_REF = cost(L38_REF.makespan, 2);
export const L38_COST_STAR = L38_COST_REF * 1.03;
export const L38_BUDGET = Math.round(cost(18, 1) * 1.01);
export const L38_CALL_TOL = 0.05;
const KEYS = ['days', 'lost', 'cost', 'crane', 'window', 'cpm', 'late', 'hire', 'crewPeak', 'jobs', 'rate', 'margin'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const orderOf = (s: S): string[] => { const l = listOf<string>(s, 'priority'); return l.length ? l : L38_START_ORDER; };
const craneOf = (s: S): number => (s.lv.crane === 2 ? 2 : 1);
const sched = (s: S) => schedule(L38_JOBS, orderOf(s), { crew: L38_LIM.crew, crane: craneOf(s) });

function measures(s: S): Measures {
  const sc = sched(s), crane = craneOf(s), base = { cpm: L38_CPM.length, window: L38_WINDOW, rate: L38_RATE_T_PER_D, margin: L38_MARGIN_USD_PER_T };
  if (!solvedOk(s)) return mNone(KEYS, base);
  return { ok: true, v: { ...base, days: sc.makespan, lost: sc.makespan * L38_RATE_T_PER_D, cost: cost(sc.makespan, crane), crane, late: Math.max(0, sc.makespan - L38_WINDOW), hire: crane > 1 ? L38_CRANE_HIRE_USD : 0, crewPeak: L38_LIM.crew, jobs: L38_JOBS.length } };
}

export const L38: LevelSpec = {
  id: 'L38', chapter: 9, index: 38, setter: 'manager', budgetUSD: L38_BUDGET, units: CARRIER_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { carrierSetup(s); s.lv.priority = L38_START_ORDER.slice(); s.lv.crane = 1; },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [{ key: 'window', met: m.ok && m.v.days! <= L38_WINDOW, ...(m.ok ? { value: m.v.days } : {}), target: L38_WINDOW }];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: !m.ok || m.v.cost! <= L38_BUDGET, value: m.ok ? m.v.cost! : 0, target: L38_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'cpm_days') !== null && relErr(predictionOf(s, 'cpm_days')!.value, L38_CPM.length) <= L38_CALL_TOL,
    m.ok && m.v.cost! <= L38_COST_STAR,
  ],
  callIt: { key: 'cpm_days', unit: 'd', tol: L38_CALL_TOL, truth: () => L38_CPM.length },
  hero: (_s, m) => ({ key: 'days', unit: 'd', value: m.v.days ?? 0, lo: 0, hi: L38_WINDOW * 1.25 }),
  secondary: (_s, m) => ({ key: 'cost', unit: 'USD', value: m.v.cost ?? 0, limit: L38_BUDGET }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'late', legend: t('lv.L38.ann.late'), state: lit(m.ok, m.v.days! <= L38_WINDOW, 'critical') },
    { key: 'idle', legend: t('lv.L38.ann.idle'), state: !m.ok ? 'off' : m.v.days! > L38_CPM.length + 4 ? 'high' : 'normal' },
    { key: 'crane', legend: t('lv.L38.ann.crane'), state: !m.ok ? 'off' : m.v.crane === 2 ? 'high' : 'normal' },
    { key: 'budget', legend: t('lv.L38.ann.budget'), state: !m.ok ? 'off' : m.v.cost! > L38_BUDGET ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.L38.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'path', role: 'manager', done: (s) => commissions(s) >= 1 || orderOf(s).join() !== L38_START_ORDER.join() || craneOf(s) === 2 },
    { id: 'move', role: 'manager', done: (s) => commissions(s) >= 1 || craneOf(s) === 2 },
    { id: 'commission', role: 'manager', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'manager', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { days: f(s, m.v.days!), window: f(s, L38_WINDOW), cpm: f(s, L38_CPM.length), lost: f(s, m.v.lost!), cost: f(s, m.v.cost!), budget: f(s, L38_BUDGET), late: f(s, m.v.late!) };
    if (m.v.days! > L38_WINDOW) return { key: 'late', cause: t('lv.L38.cause.late', vars) };
    return { key: 'budget', cause: t('lv.L38.cause.budget', vars) };
  },
  equation: (s, m) => `${f(s, m.v.days ?? 0)} × ${f(s, m.v.rate!)} = ${f(s, (m.v.days ?? 0) * m.v.rate!)} t of lost production`,
  lessonVars: (s, m) => ({ days: f(s, m.v.days ?? 0), cpm: f(s, m.v.cpm!), lost: f(s, m.v.lost ?? 0), cost: f(s, m.v.cost ?? 0), crane: f(s, m.v.crane ?? 1), window: f(s, L38_WINDOW) }),
  metrics: (_s, m) => [
    { key: 'cost', unit: 'USD', value: m.v.cost ?? 0 },
    { key: 'days', unit: 'd', value: m.v.days ?? 0 },
    { key: 'lost', unit: 't', value: m.v.lost ?? 0 },
  ],
  histogram: { metric: 'cost', best: () => L38_COST_REF, spread: 0.2, lowerIsBetter: true },
  actions: {
    move: (s, from: unknown, to: unknown) => { listActions('priority', L38_JOBS.map((j) => j.id), 12).move!(s, from, to); },
    setCrane: (s, n: unknown) => edit(s, () => { need(n === 1 || n === 2, t('lv.err.ch9_index')); s.lv.crane = n; }),
    reset: (s) => edit(s, () => { s.lv.priority = L38_START_ORDER.slice(); s.lv.crane = 1; }),
  },
  view: (s) => {
    const sc = sched(s), crane = craneOf(s), crit = new Set(levelledCritical(L38_JOBS, sc));
    const horizon = Math.max(sc.makespan, L38_WINDOW);
    const crew: number[] = Array(horizon).fill(0), cr: number[] = Array(horizon).fill(0);
    for (const j of L38_JOBS) for (let d = sc.start[j.id]!; d < sc.finish[j.id]!; d++) { crew[d] = crew[d]! + j.crew; cr[d] = cr[d]! + j.crane; }
    return {
      kind: 'gantt', window: L38_WINDOW, horizon,
      jobs: L38_JOBS.map((j) => ({ id: j.id, label: t(`lv.L38.job.${j.id}`), days: j.days, deps: j.deps.slice(), crew: j.crew, crane: j.crane, start: sc.start[j.id]!, finish: sc.finish[j.id]!, es: L38_CPM.es[j.id]!, ls: L38_CPM.ls[j.id]!, float: L38_CPM.float[j.id]!, cpmCritical: L38_CPM.critical.includes(j.id), critical: crit.has(j.id) })),
      priority: orderOf(s), crane, limits: { crew: L38_LIM.crew, crane }, craneOptions: [1, 2], cpmDays: L38_CPM.length, cpmCritical: L38_CPM.critical.slice(),
      makespan: sc.makespan, lostTonnes: sc.makespan * L38_RATE_T_PER_D, costUSD: cost(sc.makespan, crane), craneHireUSD: L38_CRANE_HIRE_USD, budgetUSD: L38_BUDGET, rateTPerDay: L38_RATE_T_PER_D, marginUsdPerT: L38_MARGIN_USD_PER_T,
      crewByDay: crew, craneByDay: cr,
    };
  },
  solver: playOnce(() => [act('reset'), ...(() => { const a = []; const cur = L38_START_ORDER.slice(); for (let i = 0; i < L38_REF_ORDER.length; i++) { const k = cur.indexOf(L38_REF_ORDER[i]!); if (k !== i) { a.push(act('move', k, i)); const [x] = cur.splice(k, 1); cur.splice(i, 0, x!); } } return a; })(), act('setCrane', 2)], { callIt: () => L38_CPM.length }),
  naive: playOnce(() => []),
};
