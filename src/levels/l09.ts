// L09 · Exam Bridge: Bomb vs Burner (DESIGN 2.6, oracles EQ-NC-016, EQ-NC-019, EQ-NC-021). A lab bench of fixtures: a flow calorimeter (a real isothermal reactor unit running
// CH4 + 2 O2 at 25 C: its duty is the heat at constant pressure, DeltaH), a bomb calorimeter (constant volume: DeltaU = DeltaH - dn_g R T, the 5 kJ gap) and a lab furnace
// whose reaction "switches on" at T = DeltaH / DeltaS. The player Calls it before the run (DeltaU of CH4 to liquid water; then the three NCERT items), commissions to run the
// bench, and the 30 s first run animates the needles and the furnace. The expected numbers are catalogue arithmetic (the CH4 item) or the oracle file (the three items).
//
// Several answers per attempt: the LevelSpec has one Call-it slot (callIt: the CH4 item, key du_ch4); the other three are made with the generic `predict(quantity, value)` action
// (quantities heat_co2, du_vap, tmin_k). `s.prediction` only keeps the last, so grading reads the solution log (s.levelActions): the last answer per quantity made before the first
// commission. Proposed LevelSpec field for the director: `callIts?: CallItSpec[]` with the log read in the query layer.
import type { Action } from '@core/kit';
import oracleFile from '../oracle/oracles.json';
import { findReaction } from '../data/reactions';
import { SPECIES } from '../data/species';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { rxnDH } from '../sim/chem/reactions';
import { R_GAS } from '../sim/thermo/shomate';
import type { EqState } from '../state';
import { FIRSTRUN_S } from '../data/events';
import type { Annunciator, CoachStep, GoalEval, LevelSpec, Measures } from './spec';
import { baseSetup, fromKmolH, link, put, putFeed, relErr, sealSetup, shown, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L09_SPECIES = ['CH4', 'O2', 'CO2', 'H2O'];
export const T_BENCH = 298.15;
/** The tolerances of the oracles (EQ-NC-016 and 019: 0.5 %; EQ-NC-021: 0.1 %); the CH4 item is graded at 0.5 % (the gap is 0.56 % of the answer, so DeltaH is not a pass). */
export const DU_TOL = 0.005, HEAT_TOL = 0.005, VAP_TOL = 0.005, TMIN_TOL = 0.001;
/** The furnace fixture warms from 298 K to this over the 30 s first run (GAME); the reaction switches on when it passes DeltaH / DeltaS. */
export const FURNACE_END_K = 2400;
const oracles = oracleFile.oracles as unknown as { id: string; expected: Record<string, number>; inputs: Record<string, number> }[];
const oracle = (id: string) => oracles.find((o) => o.id === id)!;
/** Truth of the three NCERT items, from the oracle file. */
export const ORACLE = {
  heat_kJ: (): number => Math.abs(oracle('EQ-NC-016').expected.heat_kJ!),
  du_vap_kJ_mol: (): number => oracle('EQ-NC-019').expected.dU_kJ_mol!,
  tmin_K: (): number => oracle('EQ-NC-021').expected.T_min_K!,
  dS_kJ_K: (): number => oracle('EQ-NC-021').inputs.dS_kJ_per_K!,
  dH_kJ: (): number => oracle('EQ-NC-021').inputs.dH_kJ!,
};
export const L09_UNITS: LevelSpec['units'] = {};
const PRESETS = { stoich_reactor: { reactions: 'R13', mode: 'isothermal', T: T_BENCH } };
const CH4_MOL_S = 1;

/** CH4 + 2 O2 -> CO2 + 2 H2O(l): DeltaH298 per mol (kJ, released: positive) from the gas-water reaction of the catalogue plus the condensation of 2 H2O, and dn_g. */
export function ch4Facts(): { gasQ: number; condQ: number; flowQ: number; dnG: number; gap: number; bombQ: number } {
  const rx = findReaction('R13')!;
  const gasQ = -rxnDH(rx.nu, T_BENCH, 'rigorous') / 1000;
  const nW = rx.nu['H2O']!;
  const condQ = nW * (SPECIES['H2O']!.dHf298! - SPECIES['H2O(l)']!.dHf298!);
  const gasMol = Object.keys(rx.nu).reduce((a, k) => a + (SPECIES[k]!.phase === 'g' ? rx.nu[k]! : 0), 0) - nW;
  const flowQ = gasQ + condQ;
  const gap = (-gasMol * R_GAS * T_BENCH) / 1000;
  return { gasQ, condQ, flowQ, dnG: gasMol, gap, bombQ: flowQ - gap };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
/** Plant seconds since the commission that started the first run (the same rule as registry.firstRunT, which this file cannot import: registry imports the chapter files). */
const firstRunT = (s: S): number => (s.phase !== 'firstrun' || s.runs.length === 0 ? 0 : Math.max(0, Math.min(FIRSTRUN_S, s.tick - s.runs[s.runs.length - 1]!.tick)));
const ITEMS = ['du_ch4', 'heat_co2', 'du_vap', 'tmin_k'] as const;
type Item = (typeof ITEMS)[number];
export const truthOf = (k: Item): number => (k === 'du_ch4' ? ch4Facts().bombQ : k === 'heat_co2' ? ORACLE.heat_kJ() : k === 'du_vap' ? ORACLE.du_vap_kJ_mol() : ORACLE.tmin_K());
const TOLS: Record<Item, number> = { du_ch4: DU_TOL, heat_co2: HEAT_TOL, du_vap: VAP_TOL, tmin_k: TMIN_TOL };

/** The last answer per quantity made before the first commission, from the solution log (callIt is the CH4 item; predict names its quantity). */
export function answersOf(s: S): Partial<Record<Item, number>> {
  const out: Partial<Record<Item, number>> = {};
  for (const [name, args] of s.levelActions ?? []) {
    if (name === 'commission') break;
    if (name === 'callIt' && typeof args[0] === 'number') out.du_ch4 = args[0];
    else if (name === 'predict' && typeof args[0] === 'string' && (ITEMS as readonly string[]).includes(args[0]) && typeof args[1] === 'number') out[args[0] as Item] = args[1];
  }
  return out;
}
const okOf = (a: Partial<Record<Item, number>>, k: Item): boolean => a[k] !== undefined && relErr(a[k]!, truthOf(k)) <= TOLS[k];

export function benchMeasures(s: S): Measures {
  const fx = ch4Facts(), a = answersOf(s);
  const t1 = firstRunT(s);
  const furn = s.phase === 'firstrun' || s.status === 'won' ? T_BENCH + ((FURNACE_END_K - T_BENCH) * (s.status === 'won' ? FIRSTRUN_S : t1)) / FIRSTRUN_S : T_BENCH;
  const tmin = ORACLE.dH_kJ() / ORACLE.dS_kJ_K();
  const v: Record<string, number> = {
    flow_q: 0, gas_q: fx.gasQ, cond_q: fx.condQ, bomb_q: 0, gap: 0, gap_theory: fx.gap, dn_g: fx.dnG, furnace_K: furn, furnace_on: furn >= tmin ? 1 : 0, tmin_K: tmin,
    t_du: truthOf('du_ch4'), t_heat: truthOf('heat_co2'), t_vap: truthOf('du_vap'), t_tmin: truthOf('tmin_k'),
    p_du: a.du_ch4 ?? 0, p_heat: a.heat_co2 ?? 0, p_vap: a.du_vap ?? 0, p_tmin: a.tmin_k ?? 0,
    a_du: a.du_ch4 !== undefined ? 1 : 0, ok_du: okOf(a, 'du_ch4') ? 1 : 0, ok_heat: okOf(a, 'heat_co2') ? 1 : 0, ok_vap: okOf(a, 'du_vap') ? 1 : 0, ok_tmin: okOf(a, 'tmin_k') ? 1 : 0,
    n_ncert: 0, progress: s.phase === 'firstrun' || s.status === 'won' ? (s.status === 'won' ? 1 : t1 / FIRSTRUN_S) : 0, heat_oracle: ORACLE.heat_kJ(),
  };
  v.n_ncert = v.ok_heat! + v.ok_vap! + v.ok_tmin!;
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const rx = unitsOfType(s, 'stoich_reactor')[0];
  if (!rx) return { ok: false, v };
  const duty = Math.abs(s.solved.units[rx.id]?.duty ?? 0);
  v.flow_q = duty / CH4_MOL_S / 1000 + fx.condQ;
  v.bomb_q = v.flow_q - fx.gap; v.gap = v.flow_q - v.bomb_q;
  return { ok: true, v };
}

const COACH: CoachStep[] = [
  { id: 'call_first', role: 'mentor', focus: 'key', done: (s) => (s.levelActions ?? []).some((a) => a[0] === 'callIt' || a[0] === 'predict') },
  { id: 'run_bench', role: 'mentor', focus: 'stoich_reactor', done: (s) => (s.levelActions ?? []).some((a) => a[0] === 'commission') },
  { id: 'read_gap', role: 'mentor', done: (s) => ['read_gap', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'mentor', done: (s) => s.ui.coachStep === 'why' },
];

/** Bench ids: F-101 gas feed, R-102 flow calorimeter reactor, Z-103 stack. */
const solver = () => {
  let done = false;
  return (): Action[] => {
    if (done) return [];
    done = true;
    return [
      { name: 'callIt', args: [truthOf('du_ch4')] }, { name: 'predict', args: ['heat_co2', truthOf('heat_co2')] }, { name: 'predict', args: ['du_vap', truthOf('du_vap')] },
      { name: 'predict', args: ['tmin_k', truthOf('tmin_k')] }, { name: 'commission' },
    ];
  };
};
/** The novice answers with DeltaH (the flow calorimeter's number) for the bomb: the 5 kJ gap is the whole point. */
const naive = () => {
  let done = false;
  return (): Action[] => { if (done) return []; done = true; return [{ name: 'callIt', args: [ch4Facts().flowQ] }, { name: 'commission' }]; };
};

export const L09: LevelSpec = {
  id: 'L09', firstRun: true, chapter: 2, index: 9, setter: 'mentor', budgetUSD: 0, units: L09_UNITS, notes: 2, shiftLen: 0,
  madeKgH: () => 0,
  setup: (s) => {
    baseSetup(s, L09_SPECIES, L09_UNITS, PRESETS);
    s.palette = null;
    const feed = putFeed(s, 0, 0, { CH4: 1 / 3, O2: 2 / 3 }, 3 * 3.6, T_BENCH, 1.01325e5);
    const rx = put(s, 'stoich_reactor', 5, 0, { reactions: 'R13', mode: 'isothermal', T: T_BENCH });
    const stk = put(s, 'stack', 11, 0);
    link(s, feed, 'out', rx, 'in'); link(s, rx, 'out', stk, 'in');
    s.palette = [];
    sealSetup(s);
  },
  measures: benchMeasures,
  goals: (_s, m) => [
    { key: 'run', met: m.ok, ...(m.ok ? { value: m.v.flow_q } : {}) },
    { key: 'du', met: m.ok && m.v.ok_du === 1, ...(m.ok && m.v.a_du === 1 ? { value: m.v.p_du } : {}), ...(m.ok ? { target: m.v.t_du } : {}) },
  ],
  extraStars: (_s, m) => [m.ok && m.v.n_ncert! >= 2, m.ok && m.v.n_ncert! >= 3],
  callIt: { key: 'du_ch4', unit: 'kJ/mol', tol: DU_TOL, truth: () => ch4Facts().bombQ },
  callIts: [
    { key: 'du_ch4', unit: 'kJ/mol', tol: DU_TOL, truth: () => truthOf('du_ch4') },
    { key: 'heat_co2', unit: 'kJ', tol: HEAT_TOL, truth: () => truthOf('heat_co2') },
    { key: 'du_vap', unit: 'kJ/mol', tol: VAP_TOL, truth: () => truthOf('du_vap') },
    { key: 'tmin_k', unit: 'K', tol: TMIN_TOL, truth: () => truthOf('tmin_k') },
  ],
  hero: (_s, m) => ({ key: 'gap', unit: 'kJ/mol', value: m.v.gap!, lo: m.v.gap_theory! * 0.99, hi: m.v.gap_theory! * 1.01 }),
  secondary: (_s, m) => ({ key: 'furnace_k', unit: 'K', value: m.v.furnace_K!, limit: m.v.tmin_K! }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'bomb', legend: t('lv.L09.ann.bomb'), state: !m.ok ? 'off' : 'normal' },
      { key: 'flow', legend: t('lv.L09.ann.flow'), state: !m.ok ? 'off' : 'normal' },
      { key: 'gap', legend: t('lv.L09.ann.gap'), state: !m.ok ? 'off' : m.v.gap! > 1 ? 'high' : 'normal' },
      { key: 'furnace', legend: t('lv.L09.ann.furnace'), state: !m.ok ? 'off' : m.v.furnace_on ? 'critical' : 'off' },
      { key: 'call', legend: t('lv.L09.ann.call'), state: !m.ok ? 'off' : m.v.a_du ? (m.v.ok_du ? 'normal' : 'high') : 'off' },
      { key: 'solve', legend: t('lv.L09.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L09.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.a_du !== 1) return { key: 'no_call', cause: t('lv.L09.cause.no_call') };
    const near = Math.abs(m.v.p_du! - m.v.flow_q!) <= Math.abs(m.v.p_du! - m.v.bomb_q!);
    return { key: near ? 'delta_h' : 'off', cause: t(near ? 'lv.L09.cause.delta_h' : 'lv.L09.cause.off', { p: f(s, m.v.p_du!), flow: f(s, m.v.flow_q!), bomb: f(s, m.v.bomb_q!), gap: f(s, m.v.gap!) }) };
  },
  equation: (s, m) => {
    if (!m.ok) return null;
    // the result is the difference of the two numbers as displayed (890.3 − 4.96), not of the unrounded readings (which would print 885.4)
    const a = shown(m.v.flow_q!), b = shown(m.v.gap!);
    return `${f(s, a)} − ${f(s, b)} = ${f(s, Math.round((a - b) * 1000) / 1000)} kJ/mol released at constant volume`;
  },
  lessonVars: (s, m) => ({ flow: f(s, m.v.flow_q!), bomb: f(s, m.v.bomb_q!), gap: f(s, m.v.gap!), dn: f(s, m.v.dn_g!), tmin: f(s, m.v.tmin_K!), n: m.v.n_ncert! }),
  metrics: (_s, m) => [
    { key: 'gap_kj', unit: 'kJ/mol', value: m.v.gap! },
    { key: 'ncert_ok', unit: '', value: m.v.n_ncert! },
    { key: 'furnace_k', unit: 'K', value: m.v.furnace_K! },
  ],
  histogram: null,
  card: (s, m): Record<string, number | string> => (m.ok ? {
    ncert_heat_kj: m.v.heat_oracle!, ncert_vap_kj: m.v.t_vap!, ncert_tmin_k: m.v.t_tmin!, flow_kj: m.v.flow_q!, bomb_kj: m.v.bomb_q!,
    ncert_note: t('lv.L09.card', { heat: f(s, m.v.heat_oracle!), vap: f(s, m.v.t_vap!), tmin: f(s, m.v.t_tmin!) }),
  } : {}),
  solver,
  naive,
};
void fromKmolH;
