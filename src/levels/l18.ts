// L18 · Exam Bridge: The Oxygen Rig (DESIGN 2.6 Chapter 4, oracles EQ-NC-038 / 042 / 036 / 037 / 035, Book data). The emergency oxygen generator decomposes peroxide, first
// order (K6). Three rigs stand on the bench, one per catalyst slot (none 75.3 / iodide 56.5 / catalase 15 kJ/mol); the player strips the bench to ONE of them and pipes the charge through it to the
// emergency header and may set the charge temperature (the feed T knob, the rig runs at the charge temperature). Goal: >= 5 L of O2 from the 0.5 mol charge within ten minutes at
// 25 C, without heating. The exam numbers ride on it: the Call-it is the NCERT time for 5 g -> 3 g at k = 1.15e-3 /s (444 s); star 2 is the Arrhenius two-point measurement
// (runs at 293 K and 313 K, Ea from the rate ratio); the card prints the book's other working (EQ-NC-035 / 036 / 037 / 042).
import type { Action } from '@core/kit';
import { dmath } from '@core/numerics';
import oracleFile from '../oracle/oracles.json';
import { fmtNumber, fmtSci, plumbing } from '../engine/solved';
import { findCatalyst } from '../data/catalysts';
import { t } from '../i18n';
import { rigK, timeToFraction } from '../sim/units/rx_batch';
import type { EqState } from '../state';
import { C0, toC } from './ch4_common';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, put, putFeed, sealSetup, shown, spentOf, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L18_SPECIES = ['H2O2(aq)', 'H2O(l)', 'O2'];
/** The charge: 0.5 mol of peroxide (the feed flow reads mol per charge here: the rig runs one batch of `L18_TIME_S`). */
export const L18_N0_MOL = 0.5;
export const L18_TIME_S = 600;
export const L18_P = 1e5, L18_T_FEED = 298.15;
export const L18_O2_L = 5;
export const L18_COLD_K = 298.65;
export const R_GAS = 8.314;
export const L18_CALL_TOL = 0.005;
export const L18_UNITS: LevelSpec['units'] = { feed: { max: 1, price: 4000 }, batch: { max: 3, price: 25000 }, product: { max: 1, price: 3000 } };
export const L18_BUDGET = 120000;
export const SLOTS = ['none', 'iodide', 'catalase'] as const;
export const L18_RUN_T1 = 293.15, L18_RUN_T2 = 313.15, L18_RUN_TOL = 1;

const oracle = (id: string) => (oracleFile.oracles as unknown as { id: string; expected: Record<string, number>; inputs: Record<string, number>; book?: Record<string, number> }[]).find((o) => o.id === id)!;
/** Exam numbers loaded from the oracle file: nothing is typed by hand. */
export const exam = () => ({
  k: oracle('EQ-NC-038').inputs.k!, a0: oracle('EQ-NC-038').inputs.A0!, a: oracle('EQ-NC-038').inputs.A!, t: oracle('EQ-NC-038').expected.t_s!,
  ea: oracle('EQ-NC-042').expected.Ea_kJ_mol!, ratio: oracle('EQ-NC-042').inputs.k2_over_k1!, t1: oracle('EQ-NC-042').inputs.T1!, t2: oracle('EQ-NC-042').inputs.T2!,
  ea36: oracle('EQ-NC-036').expected.Ea_kJ_mol!, t37: oracle('EQ-NC-037').expected.T_K!, ratio35: oracle('EQ-NC-035').expected.k_ratio!,
});
/** Call-it truth: the same engine function the oracle exercises (first-order time to a fraction). */
export const timeTruth = (): number => timeToFraction(exam().k, exam().a / exam().a0);

/** Feed temperatures (K) at each commission, in order, from the solution log (the rig runs at the charge temperature). */
export function runTemps(s: S): number[] {
  const out: number[] = [];
  let T = L18_T_FEED;
  for (const [name, args] of (s.levelActions ?? []) as [string, unknown[]][]) {
    if (name === 'setFeed' && args[1] !== null && typeof args[1] === 'object' && typeof (args[1] as { T?: number }).T === 'number') T = (args[1] as { T: number }).T;
    else if (name === 'setParam' && args[1] === 'T' && typeof args[2] === 'number' && String(args[0]).startsWith('F-')) T = args[2] as number;
    else if (name === 'commission') out.push(T);
  }
  return out;
}
export const ranBoth = (s: S): boolean => runTemps(s).some((x) => Math.abs(x - L18_RUN_T1) <= L18_RUN_TOL) && runTemps(s).some((x) => Math.abs(x - L18_RUN_T2) <= L18_RUN_TOL);

export function rigMeasures(s: S): Measures {
  const feed = unitsOfType(s, 'feed')[0];
  const v: Record<string, number> = { t_k: feed ? s.feeds[feed.id]?.T ?? L18_T_FEED : L18_T_FEED, o2_l: 0, n_o2: 0, x: 0, k: 0, ea: 0, cat: -1, piped: 0, p_kpa: L18_P / 1000, ranboth: ranBoth(s) ? 1 : 0, thalf: 0, kind: 0 };
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const pl = plumbing(s);
  const rig = unitsOfType(s, 'batch').find((u) => pl.inPipe(u.id, 'in') !== undefined && pl.outPipe(u.id, 'out') !== undefined);
  if (!rig) return { ok: false, v };
  const info = s.solved.units[rig.id]?.info;
  if (!info) return { ok: false, v };
  v.piped = 1; v.cat = SLOTS.indexOf((rig.catalystId ?? 'none') as (typeof SLOTS)[number]);
  v.o2_l = (info.V_O2 ?? 0) * 1000; v.x = info.X ?? 0; v.k = info.k ?? 0; v.t_k = info.T ?? v.t_k;
  v.n_o2 = 0.5 * v.x * L18_N0_MOL; v.ea = rigK(rig.catalystId ?? 'none').Ea / 1000;
  v.thalf = v.k > 0 ? Math.LN2 / v.k : 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const catName = (id: string): string => (id === 'none' ? 'no catalyst' : findCatalyst(id)?.name ?? id);
/** The smallest k (1/s) that makes the burette read L18_O2_L in the run time: O2 = 0.5 x N0 R T / P, x = 1 - exp(-k t). */
export const l18KNeeded = (T = L18_T_FEED): number => {
  const xNeed = L18_O2_L / 1000 / (0.5 * L18_N0_MOL * R_GAS * T / L18_P);
  return -dmath.log(1 - xNeed) / L18_TIME_S;
};
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'strip_bench', role: 'safety', focus: 'batch', done: (s) => unitsOfType(s, 'batch').length <= 1 },
  { id: 'pipe_up', role: 'safety', done: (s) => s.flowsheet.streams.length >= 2 },
  { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_burette', role: 'safety', focus: 'batch', done: LATE(['read_burette', 'swap', 'why']) },
  { id: 'swap', role: 'safety', done: (s) => commissions(s) >= 2 || LATE(['why'])(s) },
  { id: 'why', role: 'safety', done: LATE(['why']) },
];

/** The scripted player: strip the bench to rig number `slot` (an unpiped rig cannot be commissioned), pipe the charge through it, then (optionally) the two Arrhenius runs, then back to 25 C. */
export const l18Player = (slot: number, runs: boolean, finalT = L18_T_FEED) => (_seed?: number) => {
  let stage = 0;
  return (s: S, _ctx?: unknown): Action[] => {
    const U = (type: string) => unitsOfType(s, type);
    const feed = U('feed')[0]!, rigs = U('batch'), prod = U('product')[0]!;
    if (stage === 0) {
      stage = 1;
      const rig = rigs[slot]!;
      return [
        { name: 'callIt', args: [timeTruth()] },
        ...rigs.filter((_r, i) => i !== slot).map((r) => ({ name: 'deleteUnit', args: [r.id] })),
        { name: 'connect', args: [feed.id, 'out', rig.id, 'in'] }, { name: 'connect', args: [rig.id, 'out', prod.id, 'in'] },
        ...(runs ? [{ name: 'setFeed', args: [feed.id, { T: L18_RUN_T1 }] }, { name: 'commission' }, { name: 'setFeed', args: [feed.id, { T: L18_RUN_T2 }] }, { name: 'commission' }] : []),
        { name: 'setFeed', args: [feed.id, { T: finalT }] }, { name: 'commission' },
      ];
    }
    return [];
  };
};

export const L18: LevelSpec = {
  id: 'L18', firstRun: true, chapter: 4, index: 18, setter: 'safety', budgetUSD: L18_BUDGET, units: L18_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L18_SPECIES, L18_UNITS, {});
    putFeed(s, 0, 6, { 'H2O2(aq)': 1 }, (L18_N0_MOL * 3600) / 1000, L18_T_FEED, L18_P);
    SLOTS.forEach((cat, i) => { const id = put(s, 'batch', 8, 1 + i * 5, { time: L18_TIME_S, law: 'K6' }); s.flowsheet.units.find((u) => u.id === id)!.catalystId = cat; });
    put(s, 'product', 18, 6);
    sealSetup(s);
  },
  measures: rigMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'o2', met: m.ok && m.v.o2_l! >= L18_O2_L, ...(m.ok ? { value: m.v.o2_l } : {}), target: L18_O2_L },
      { key: 'cold', met: m.v.t_k! <= L18_COLD_K, value: toC(m.v.t_k!), target: 25 },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L18_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L18_BUDGET, value: sp, target: L18_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => {
    const p = s.prediction as { quantity: string; value: number } | null;
    const called = p !== null && p.quantity === 'time_s' && Math.abs(p.value - timeTruth()) / timeTruth() <= L18_CALL_TOL;
    return [m.ok && m.v.ranboth === 1, m.ok && m.v.ranboth === 1 && called];
  },
  callIt: { key: 'time_s', unit: 's', tol: L18_CALL_TOL, truth: () => timeTruth() },
  callIts: [
    { key: 'time_s', unit: 's', tol: L18_CALL_TOL, truth: () => timeTruth() },
    { key: 'ea_kj', unit: 'kJ/mol', tol: 0.01, truth: () => exam().ea },
  ],
  hero: (_s, m) => ({ key: 'o2_l', unit: 'L', value: m.v.o2_l!, lo: L18_O2_L, hi: 6.5 }),
  secondary: (_s, m) => ({ key: 'x_pct', unit: '%', value: m.v.x! * 100, limit: 100 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'warm', legend: t('lv.L18.ann.warm'), state: m.v.t_k! > L18_COLD_K ? 'high' : 'off' },
      { key: 'short', legend: t('lv.L18.ann.short'), state: !m.ok ? 'off' : m.v.o2_l! < L18_O2_L ? 'high' : 'normal' },
      { key: 'slow', legend: t('lv.L18.ann.slow'), state: !m.ok ? 'off' : m.v.thalf! > L18_TIME_S ? 'high' : 'normal' },
      { key: 'cat', legend: t('lv.L18.ann.cat'), state: !m.ok ? 'off' : m.v.cat! > 0 ? 'normal' : 'off' },
      { key: 'solve', legend: t('lv.L18.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L18.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  /** The bench at a glance for the front end: each rig by name with its catalyst, k and Ea (one notation), whether it is piped, and the k a rig needs. */
  view: (s) => ({
    kNeeded: l18KNeeded(), kNeededText: fmtSci(l18KNeeded(), s.region) + ' s⁻¹', examK: exam().k, examKText: fmtSci(exam().k, s.region) + ' s⁻¹',
    rigs: unitsOfType(s, 'batch').map((u) => {
      const cat = u.catalystId ?? 'none', r = rigK(cat), pl = plumbing(s);
      return { id: u.id, catalystId: cat, catalystName: catName(cat), k25: r.k(298.15), kText25: fmtSci(r.k(298.15), s.region) + ' s⁻¹', eaKJ: r.Ea / 1000, piped: pl.inPipe(u.id, 'in') !== undefined && pl.outPipe(u.id, 'out') !== undefined, fastEnough: r.k(298.15) >= l18KNeeded() };
    }),
  }),
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { o2: f(s, m.v.o2_l!), want: f(s, L18_O2_L), thalf: f(s, m.v.thalf!), t: f(s, toC(m.v.t_k!)), ea: f(s, m.v.ea!), x: f(s, m.v.x! * 100) };
    if (m.v.t_k! > L18_COLD_K) return { key: 'heated', cause: t('lv.L18.cause.heated', vars) };
    return { key: 'short', cause: t('lv.L18.cause.short', vars) };
  },
  equation: (s, m) => (m.ok && m.v.o2_l! > 0 ? `${f(s, shown(m.v.n_o2!))} × 8.314 × ${f(s, shown(m.v.t_k!))} ÷ ${f(s, shown(m.v.p_kpa!))} = ${f(s, shown((shown(m.v.n_o2!) * 8.314 * shown(m.v.t_k!)) / shown(m.v.p_kpa!)))}` : null),
  lessonVars: (s, m) => ({ k: fmtSci(m.v.k!, s.region), cat: m.v.cat! >= 0 ? catName(SLOTS[m.v.cat!]!) : '-', thalf: f(s, m.v.thalf!), ea: f(s, m.v.ea!), x: f(s, m.v.x! * 100), o2: f(s, m.v.o2_l!), t: f(s, toC(m.v.t_k!)), runs: commissions(s) }),
  metrics: (s, m) => [
    { key: 'o2_l', unit: 'L', value: m.v.o2_l! },
    { key: 'thalf_s', unit: 's', value: m.v.thalf! },
    { key: 'runs', unit: '', value: commissions(s) },
  ],
  histogram: { metric: 'o2_l', best: () => 6.2, spread: 0.2, lowerIsBetter: false },
  card: () => { const e = exam(); return { book_time_s: e.t, book_ea_kj: e.ea, book_ratio: e.ratio, book_ea36_kj: e.ea36, book_t37_k: e.t37, book_k_ratio: e.ratio35 }; },
  solver: l18Player(2, true),
  naive: l18Player(0, false),
};
export { C0 };
