// L35 · Start-up (DEPTH Ch 9): write the ammonia loop start-up SOP from cards. The order is simulated (src/sim/ops/sop.ts): oxygen against the limiting oxygen concentration of H2, heating ramp against
// the thermal-shock limit, flare capacity, the tightness test, cooling before circulation. Grade: safe and ready, then time. Engineer: the lost production while starting up is the budget.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { SOP, SOP_CARDS, SOP_IDS, SOP_INIT, runSop, type SopOut } from '../sim/ops/sop';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, act, carrierSetup, goalLamp, listActions, listOf, lit, mNone, playOnce } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, solvedOk } from './util';

type S = Readonly<EqState>;
export const L35_REF = ['cool_on', 'flare_on', 'purge', 'circ_on', 'press_test', 'heat_slow', 'intro_h2', 'press_full'];
export const L35_LOSS_PER_H = 2500;
export const L35_MINS_REF = runSop(L35_REF).mins;
export const L35_MINS_STAR = L35_MINS_REF * 1.03;
export const L35_BUDGET = Math.round((L35_MINS_REF / 60) * L35_LOSS_PER_H * 1.1);
export const L35_CALL_TOL = 0.05;
export const L35_HEAT_MIN = ((SOP.tReduce - SOP.tCold) / SOP.rampMax) * 60;
const KEYS = ['mins', 'sev', 'ready', 'blocked', 'cards', 'loss', 'explosion', 'shock', 'release', 'o2', 'p', 't', 'ramp', 'rampMax', 'rise', 'hours'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const orderOf = (s: S): string[] => listOf<string>(s, 'order');
const codes = (r: SopOut): Set<string> => new Set(r.events.filter((e) => e.kind === 'hazard').map((e) => e.code));
const RELEASE = ['leak', 'vent', 'flare', 'cold', 'hotspot', 'nearmiss'];

const card = (id: string): string => t(`lv.L35.card.${id}`);
/** What stops the loop being READY, named: each requirement, the card that provides it, and whether that card is missing from the sequence or in it but without effect. */
export function missingList(order: string[], st: Record<string, number>): string[] {
  const need: Array<[boolean, string, string]> = [
    [st.cool === 1, 'cool_on', 'cooling'], [st.circ === 1, 'circ_on', 'circ'], [st.red === 1, 'intro_h2', 'red'], [st.p! >= SOP.pFull, 'press_full', 'press'],
  ];
  const out: string[] = [];
  for (const [ok, id, k] of need) {
    if (ok) continue;
    const nm = t(`lv.L35.need.${k}`);
    if (!order.includes(id)) out.push(t('lv.L35.miss.add', { card: card(id), need: nm }));
    else if (k === 'red' && st.t! < SOP.tMinH2) out.push(t('lv.L35.miss.heat', { card: card(id), tK: f({ region: 'en' }, st.t!), tmin: f({ region: 'en' }, SOP.tMinH2), need: nm }));
    else out.push(t('lv.L35.miss.fail', { card: card(id), need: nm }));
  }
  return out;
}
function measures(s: S): Measures {
  const order = orderOf(s), r = runSop(order), c = codes(r);
  const base = { rampMax: SOP.rampMax, rise: SOP.tReduce - SOP.tCold, ramp: SOP.rampMax };
  if (!solvedOk(s)) return mNone(KEYS, base);
  const loss = (r.mins / 60) * L35_LOSS_PER_H;
  return { ok: true, v: { ...base, mins: r.mins, hours: r.mins / 60, sev: r.maxSev, ready: r.ready ? 1 : 0, blocked: r.blocked, cards: order.length, loss, explosion: c.has('explosion') ? 1 : 0, shock: c.has('shock') ? 1 : 0, release: RELEASE.some((k) => c.has(k)) ? 1 : 0, o2: r.state.o2!, p: r.state.p!, t: r.state.t! } };
}

export const L35: LevelSpec = {
  id: 'L35', chapter: 9, index: 35, setter: 'supervisor', budgetUSD: L35_BUDGET, units: CARRIER_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { carrierSetup(s); s.lv.order = []; },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'safe', met: m.ok && m.v.sev === 0 && m.v.blocked === 0, ...(m.ok ? { value: m.v.sev! } : {}), target: 0 },
      { key: 'ready', met: m.ok && m.v.ready === 1, ...(m.ok ? { value: m.v.ready } : {}), target: 1 },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: m.ok && m.v.loss! <= L35_BUDGET, value: m.ok ? m.v.loss! : 0, target: L35_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'heat_min') !== null && relErr(predictionOf(s, 'heat_min')!.value, L35_HEAT_MIN) <= L35_CALL_TOL,
    m.ok && m.v.mins! <= L35_MINS_STAR,
  ],
  callIt: { key: 'heat_min', unit: 'min', tol: L35_CALL_TOL, truth: () => L35_HEAT_MIN },
  hero: (_s, m) => ({ key: 'hours', unit: 'h', value: m.v.hours ?? 0, lo: 0, hi: (L35_MINS_STAR / 60) * 1.5 }),
  secondary: (_s, m) => ({ key: 'loss', unit: 'USD', value: m.v.loss ?? 0, limit: L35_BUDGET }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'o2', legend: t('lv.L35.ann.o2'), state: !m.ok ? 'off' : m.v.explosion === 1 ? 'critical' : 'normal' },
    { key: 'shock', legend: t('lv.L35.ann.shock'), state: lit(m.ok, m.v.shock === 0) },
    { key: 'release', legend: t('lv.L35.ann.release'), state: lit(m.ok, m.v.release === 0, 'critical') },
    { key: 'ready', legend: t('lv.L35.ann.ready'), state: lit(m.ok, m.v.ready === 1) },
    { key: 'budget', legend: t('lv.L35.ann.budget'), state: !m.ok ? 'off' : m.v.loss! > L35_BUDGET ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.L35.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'cards', role: 'supervisor', done: (s) => orderOf(s).length > 0 },
    { id: 'order', role: 'supervisor', done: (s) => runSop(orderOf(s)).maxSev === 0 && runSop(orderOf(s)).blocked === 0 && orderOf(s).length > 2 },
    { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'supervisor', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { o2: f(s, m.v.o2!), loc: f(s, SOP.o2Loc), safe: f(s, SOP.o2Safe), ramp: f(s, 150), rampMax: f(s, SOP.rampMax), mins: f(s, m.v.mins!), loss: f(s, m.v.loss ?? 0), budget: f(s, L35_BUDGET), pmax: f(s, SOP.pFlareMax), p: f(s, m.v.p!) };
    if (m.v.explosion === 1) return { key: 'explosion', cause: t('lv.L35.cause.explosion', vars) };
    if (m.v.shock === 1) return { key: 'shock', cause: t('lv.L35.cause.shock', vars) };
    if (m.v.release === 1) return { key: 'release', cause: t('lv.L35.cause.release', vars) };
    if (m.v.blocked! > 0) return { key: 'blocked', cause: t('lv.L35.cause.blocked', vars) };
    if (m.v.ready !== 1) return { key: 'notready', cause: t('lv.L35.cause.notready', { ...vars, missing: missingList(orderOf(s), runSop(orderOf(s)).state as Record<string, number>).join('; ') }) };
    return { key: 'budget', cause: t('lv.L35.cause.budget', vars) };
  },
  equation: (s, m) => `${f(s, m.v.rise!)} ÷ ${f(s, m.v.ramp!)} × 60 = ${f(s, (m.v.rise! / m.v.ramp!) * 60)} min of heating`,
  lessonVars: (s, m) => ({ o2: f(s, SOP.o2Safe), loc: f(s, SOP.o2Loc), ramp: f(s, m.v.ramp!), rise: f(s, m.v.rise!), heat: f(s, L35_HEAT_MIN), mins: f(s, m.v.mins ?? 0), pmax: f(s, SOP.pFlareMax) }),
  metrics: (_s, m) => [
    { key: 'mins', unit: 'min', value: m.v.mins ?? 0 },
    { key: 'loss', unit: 'USD', value: m.v.loss ?? 0 },
    { key: 'cards', unit: '', value: m.v.cards ?? 0 },
  ],
  histogram: { metric: 'mins', best: () => L35_MINS_REF, spread: 0.6, lowerIsBetter: true },
  actions: listActions('order', SOP_IDS, 24, true, (id) => t(`lv.L35.card.${id}`)),
  view: (s) => {
    const order = orderOf(s), r = runSop(order);
    return {
      kind: 'sop',
      // the heat-up cards' minutes ARE the call-it (350 K at 50 K/h): they stay off the card until the call is locked (mins -1 = not shown)
      cards: SOP_CARDS.map((c) => ({ id: c.id, label: t(`lv.L35.card.${c.id}`), pre: t(`lv.L35.pre.${c.id}`), mins: predictionOf(s, 'heat_min') === null && (c.id === 'heat_slow' || c.id === 'heat_fast') ? -1 : c.mins })),
      order: order.map((id, i) => ({ i, id, label: t(`lv.L35.card.${id}`) })),
      trace: r.events.map((e) => ({ i: e.i, id: e.id, kind: e.kind, code: e.code, text: e.code === '' ? '' : t(`lv.L35.code.${e.code}`), sev: e.sev, t: e.t })),
      state: { o2: r.state.o2!, p: r.state.p!, t: r.state.t!, cool: r.state.cool!, flare: r.state.flare!, circ: r.state.circ!, leak: r.state.leak!, h2: r.state.h2!, red: r.state.red! },
      initial: { ...SOP_INIT }, limits: { o2Safe: SOP.o2Safe, o2Loc: SOP.o2Loc, rampMax: SOP.rampMax, pFlareMax: SOP.pFlareMax },
      cardCount: SOP_CARDS.length, missing: r.ready ? [] : missingList(order, r.state as Record<string, number>), mins: r.mins, safe: r.maxSev === 0 && r.blocked === 0, ready: r.ready, halted: r.halted, refMins: L35_MINS_REF, lossUSD: (r.mins / 60) * L35_LOSS_PER_H, budgetUSD: L35_BUDGET,
    };
  },
  solver: playOnce(() => L35_REF.map((id) => act('add', id)), { callIt: () => L35_HEAT_MIN }),
  naive: playOnce(() => ['cool_on', 'circ_on', 'heat_fast', 'intro_h2', 'press_full'].map((id) => act('add', id))),
};
