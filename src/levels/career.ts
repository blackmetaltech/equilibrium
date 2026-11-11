// CAREER (DEPTH "Career", chapter 10): the integrated Works run for five seeded years, month by month (src/sim/career/model.ts).
// Why `levelAct('advance')` and not `tick`: one action = up to a year of plant months, so a verify/replay is ~60 cheap decisions rather than 6 million ticks, an idle player (ticks only) cannot
// finish the career, and the state is a pure function of the player's decisions and the seed (leaderboard: 5-year margin with zero Critical alarms, replayed by `decide`).
// A carrier plant (feed -> product) is commissioned so the key, the phase machine and the printout behave as in the other chapters; the career itself is the level-local `s.lv.c`.
import { fail } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import {
  CHIEF_MARGIN, CREW_BASE, DEFS, EM_CAP_STEP, INSPECT_EVERY, INVEST_PRICE, MONTHS, PLANTS, RATE_MAX, RATE_MIN, STRIKES_MAX, START_CASH, TA_CRANE_HIRE_USD, TA_CREW_HIRE_USD,
  CareerError, advance, contracted, crewLimit, decide, emCap, gasMul, initCareer, investCost, outputOf, overdue, riskOf, taDays, year, type Career,
} from '../sim/career/model';
import { naiveDecisions, solverDecisions, type Decision } from '../sim/career/policy';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, carrierSetup, goalLamp, lit } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';

type S = Readonly<EqState>;
export const CAREER_ID = 'CAREER';
const END_CODE = { '': 0, chief: 1, steady: 2, sold: 3, shut: 4 } as const;
const KEYS = ['months', 'year', 'margin', 'cash', 'gas', 'criticals', 'strikes', 'end', 'emRatio', 'minCat', 'minU', 'overdue', 'contracts', 'revenue', 'cost', 'penalty', 'ref'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const M = (x: number): number => Math.round(x / 1e6);

export const careerOf = (s: S): Career | null => { const c = s.lv.c as Career | undefined; return c !== undefined && c.v === 1 ? c : null; };
const good = (c: Career): boolean => c.ending === 'chief' || c.ending === 'steady';

/** The reference run: the solver's decisions on this seed and mode (the 5-year margin of the engineer who maintains the Works). Pure; ~60 months. */
export function referenceCareer(seed: number, mode: string): Career {
  const c = initCareer(seed, mode);
  while (c.ending === '') {
    for (const d of solverDecisions(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
    advance(c, 1);
  }
  return c;
}
/** UNVERIFIED (GAME): the three-star threshold is the solver's 5-year margin less 3 %. */
export const starMargin = (seed: number, mode: string): number => referenceCareer(seed, mode).total.margin / 1.03;

function measures(s: S): Measures {
  const c = careerOf(s);
  if (c === null) return { ok: false, v: Object.fromEntries(KEYS.map((k) => [k, 0])) };
  const emRatio = c.ytd.em / (emCap(c) * Math.max(1, c.m % 12 === 0 && c.m > 0 ? 12 : c.m % 12) / 12);
  return {
    ok: true,
    v: {
      months: c.m, year: Math.min(5, year(c) + 1), margin: c.total.margin, cash: c.cash, gas: c.gas, criticals: c.criticals, strikes: c.strikes, end: END_CODE[c.ending], emRatio,
      minCat: Math.min(...PLANTS.map((p) => c.plants[p].cat)), minU: Math.min(...PLANTS.map((p) => c.plants[p].U)), overdue: Math.max(...PLANTS.map((p) => overdue(c, p))),
      contracts: c.contracts.length, revenue: c.total.revenue, cost: c.total.cost, penalty: c.total.penalty, ref: 0,
    },
  };
}

function act(name: string, fn: (c: Career, ...a: unknown[]) => void): (s: EqState, ...a: unknown[]) => void {
  return (s, ...a) => {
    const c = careerOf(s);
    if (c === null) fail(t('lv.err.career_none'));
    try { fn(c!, ...a); } catch (e) { if (e instanceof CareerError) fail(t(`lv.err.career_${e.message}`, { name })); throw e; }
    if (c!.ending === 'sold' || c!.ending === 'shut') { s.status = 'lost'; s.statusReason = `lv.CAREER.end.${c!.ending}`; }
  };
}
const byName = (name: string) => act(name, (c, ...a) => decide(c, name, ...a));

export const CAREER: LevelSpec = {
  id: CAREER_ID, chapter: 10, index: 39, setter: 'manager', budgetUSD: START_CASH, units: CARRIER_UNITS, notes: 2, shiftLen: 0, maxTicks: 600,
  setup: (s) => { carrierSetup(s); s.lv.c = initCareer(s.seed, s.mode); },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'tenure', met: m.ok && m.v.end! >= 1 && m.v.end! <= 2, value: m.v.months, target: MONTHS },
      { key: 'regulator', met: m.ok && m.v.strikes! < STRIKES_MAX, value: m.v.strikes, target: STRIKES_MAX },
    ];
    if (s.mode === 'engineer') g.push({ key: 'clean', met: m.ok && m.v.criticals === 0, value: m.v.criticals, target: 0 });
    return g;
  },
  won: (_s, m, g) => m.ok && g.every((x) => x.met),
  extraStars: (s, m) => {
    const c = careerOf(s);
    if (c === null || !good(c)) return [false, false];
    return [c.ending === 'chief', c.criticals === 0 && c.total.margin >= starMargin(s.seed, s.mode)];
  },
  callIt: null,
  hero: (_s, m) => ({ key: 'margin', unit: 'MUSD', value: (m.v.margin ?? 0) / 1e6, lo: 0, hi: (CHIEF_MARGIN / 1e6) * 1.5 }),
  secondary: (_s, m) => ({ key: 'strikes', unit: '', value: m.v.strikes ?? 0, limit: STRIKES_MAX }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'critical', legend: t('lv.CAREER.ann.critical'), state: lit(m.ok, m.v.criticals === 0, 'critical') },
    { key: 'inspection', legend: t('lv.CAREER.ann.inspection'), state: !m.ok ? 'off' : m.v.overdue! > 6 ? 'critical' : m.v.overdue! > 0 ? 'high' : 'normal' },
    { key: 'catalyst', legend: t('lv.CAREER.ann.catalyst'), state: lit(m.ok, m.v.minCat! >= 0.7) },
    { key: 'fouling', legend: t('lv.CAREER.ann.fouling'), state: lit(m.ok, m.v.minU! >= 0.75) },
    { key: 'emissions', legend: t('lv.CAREER.ann.emissions'), state: lit(m.ok, m.v.emRatio! <= 1) },
    { key: 'cash', legend: t('lv.CAREER.ann.cash'), state: !m.ok ? 'off' : m.v.cash! < 0 ? 'critical' : m.v.cash! < 1e7 ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.CAREER.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'offers', role: 'manager', done: (s) => (careerOf(s)?.contracts.length ?? 0) > 0 || (careerOf(s)?.m ?? 0) > 0 },
    { id: 'maintain', role: 'safety', done: (s) => { const c = careerOf(s); return c !== null && (c.m > 3 || c.invest.heat + c.invest.abate + c.invest.safety > 0 || PLANTS.some((p) => c.plants[p].ta >= 0)); } },
    { id: 'advance', role: 'manager', done: (s) => (careerOf(s)?.m ?? 0) >= 12 },
    { id: 'review', role: 'manager', done: LATE(['review']) },
  ],
  verdict: (s, m) => {
    const c = careerOf(s);
    if (c === null || c.ending === '') return { key: 'not_run', cause: null };
    if (good(c)) return { key: c.ending, cause: null };
    return { key: c.ending, cause: t(`lv.CAREER.cause.${c.ending}`, { months: c.m, strikes: c.strikes, criticals: c.criticals, cash: f(s, M(c.cash)), margin: f(s, M(c.total.margin)) }) };
  },
  equation: (s, m) => {
    const r = M(m.v.revenue ?? 0), co = M(m.v.cost ?? 0), p = M(m.v.penalty ?? 0);
    return `${f(s, r)} − ${f(s, co)} − ${f(s, p)} = ${f(s, r - co - p)} MUSD of margin`;
  },
  lessonVars: (s, m) => ({ margin: f(s, M(m.v.margin ?? 0)), criticals: f(s, m.v.criticals ?? 0), strikes: f(s, m.v.strikes ?? 0), months: f(s, m.v.months ?? 0), cash: f(s, M(m.v.cash ?? 0)), inspect: INSPECT_EVERY }),
  metrics: (_s, m) => [
    { key: 'margin', unit: 'MUSD', value: (m.v.margin ?? 0) / 1e6 },
    { key: 'criticals', unit: '', value: m.v.criticals ?? 0 },
    { key: 'cash', unit: 'MUSD', value: (m.v.cash ?? 0) / 1e6 },
  ],
  histogram: { metric: 'margin', best: (s) => starMargin(s.seed, s.mode) * 1.03 / 1e6, spread: 0.6, lowerIsBetter: false },
  actions: {
    accept: byName('accept'), decline: byName('decline'), setRate: byName('setRate'), inspect: byName('inspect'), buyCatalyst: byName('buyCatalyst'),
    turnaround: byName('turnaround'), cancelTurnaround: byName('cancelTurnaround'), hireCrew: byName('hireCrew'), invest: byName('invest'), advance: byName('advance'),
  },
  view: (s) => {
    const c = careerOf(s);
    if (c === null) return { kind: 'career' };
    const spot = (p: (typeof PLANTS)[number]): number => c.prices[p];
    return {
      kind: 'career',
      dashboard: { month: c.m, /** The month now in progress, 1-based (month = months already run; highlight monthNow, not month). */ monthNow: Math.min(MONTHS, c.m + 1), monthOfYear: (c.m % 12) + 1, months: MONTHS, year: Math.min(5, year(c) + 1), cashUSD: c.cash, marginTotalUSD: c.total.margin, marginYtdUSD: c.ytd.margin, lastMonthUSD: c.last.margin, gasUSDPerGJ: c.gas, criticals: c.criticals, strikes: c.strikes, strikesMax: STRIKES_MAX, ending: c.ending, over: c.ending !== '', lastEvent: c.last.ev, lastEventPlant: c.last.evPlant, emissionsYtdT: c.ytd.em, emissionsCapT: emCap(c), emCapStep: EM_CAP_STEP, chiefMarginUSD: CHIEF_MARGIN, startCashUSD: START_CASH },
      prices: PLANTS.map((p) => ({ plant: p, label: t(`lv.CAREER.plant.${p}`), spotUSDPerT: spot(p) })),
      plants: PLANTS.map((p) => {
        const x = c.plants[p];
        return { id: p, label: t(`lv.CAREER.plant.${p}`), capT: DEFS[p].cap, rate: x.rate, rateMin: RATE_MIN, rateMax: RATE_MAX, catalyst: x.cat, exchangerU: x.U, compressorWear: x.wear, monthsSinceInspection: x.insp, inspectionOverdue: overdue(c, p), catalystStock: x.stock, downDays: x.down, turnaroundMonth: x.ta, turnaroundCrane: x.taCrane, turnaroundCrew: x.taCrew, outputT: x.out > 0 ? x.out : outputOf(c, p), nominalT: outputOf(c, p), risk: riskOf(c, p), gasFactor: gasMul(c, p), contractedT: contracted(c, p), lastMarginUSD: x.margin, catalystPriceUSD: DEFS[p].catUSD, taDaysWithCatalyst: taDays(true, x.taCrane, x.taCrew), taDaysWithout: taDays(false, x.taCrane, x.taCrew) };
      }),
      contracts: c.contracts.map((k) => ({ id: k.id, plant: k.p, tpm: k.tpm, priceUSD: k.price, monthsLeft: k.left, penaltyUSDPerT: k.pen, spotUSD: spot(k.p) })),
      offers: c.offers.map((o) => ({ id: o.id, plant: o.p, tpm: o.tpm, priceUSD: o.price, term: o.term, penaltyUSDPerT: o.pen, spotUSD: spot(o.p), premium: o.price / spot(o.p) - 1, shareOfCap: o.tpm / DEFS[o.p].cap })),
      calendar: PLANTS.map((p) => ({ plant: p, inspectionDueMonth: c.m + Math.max(0, INSPECT_EVERY - c.plants[p].insp), turnaroundMonth: c.plants[p].ta })),
      options: { invest: Object.fromEntries(Object.entries(INVEST_PRICE).map(([k, v]) => [k, { level: c.invest[k as 'heat'], max: 3, nextUSD: investCost(c, k as 'heat'), prices: v.slice() }])), crews: { hired: c.crews, max: 3, limit: crewLimit(c), base: CREW_BASE }, craneHireUSD: TA_CRANE_HIRE_USD, crewHireUSD: TA_CREW_HIRE_USD },
      review: c.years.map((y) => ({ ...y, victorNote: y.victor, noorNote: y.noor, maraNote: y.mara })),
      history: c.hist.map((h) => ({ m: h.m, marginUSD: h.margin, cashUSD: h.cash, gas: h.gas })),
      log: c.log.slice(-40).map((l) => ({ ...l, t: l.m, stamp: `Y${Math.floor(l.m / 12) + 1} M${String((l.m % 12) + 1).padStart(2, '0')}`, label: t(`lv.CAREER.log.${l.kind}`, { code: l.code, plant: l.plant, n: l.n }) })),
    };
  },
  solver: (() => scripted(solverDecisions)) as PersonaFactory<EqState>,
  naive: (() => scripted(naiveDecisions)) as PersonaFactory<EqState>,
};

/** A persona that plays one month per turn: its decisions, then `advance 1`. */
function scripted(policy: (c: Career) => Decision[]) {
  return (s: S): Action[] => {
    const c = careerOf(s);
    if (c === null || c.ending !== '' || s.status !== 'playing') return [];
    return [...policy(c).map((d): Action => ({ name: 'levelAct', args: [d[0], ...d.slice(1)] })), { name: 'levelAct', args: ['advance', 1] }];
  };
}
