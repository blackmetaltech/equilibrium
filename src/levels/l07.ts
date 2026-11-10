// L07 · Hess's Road (DESIGN 2.6, oracle EQ-NC-017). The coke furnace is down; a gasifier (C + 1/2 O2 -> CO) and a CO burner (CO + 1/2 O2 -> CO2) are standing, and the
// process heater still needs 10 MW. Hess's law: the heat of the two steps adds up to the heat of C + O2 -> CO2 (-110.5 - 283.0 = -393.5 kJ/mol), whatever the road. The
// process heater is the sink at the end: it cools the final gas to 25 C and its duty is the heat delivered. The trap is the gasifier: it runs near 1000 K and a cooling
// water quench in front of the CO burner (to be kind to the brickwork) throws its 110.5 kJ/mol away. The heat ledger (what each step released, what reached the heater,
// what went elsewhere) is the printout.
import type { Action } from '@core/kit';
import { findReaction } from '../data/reactions';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { rxnDH } from '../sim/chem/reactions';
import type { EqState } from '../state';
import type { Annunciator, CoachStep, GoalEval, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, flowOf, fromKmolH, inStream, intoType, predictionOf, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L07_SPECIES = ['C', 'O2', 'N2', 'CO', 'CO2'];
export const HEAT_MW = 10, HEAT_TOL = 0.2;
export const AIR_O2 = 0.21;
/** Oracle EQ-NC-017 tolerance (0.1 %) is for the Hess sum; the Call-it of the coke flow is graded at 1 % (DESIGN). */
export const COKE_CALL_TOL = 0.01;
export const LOST_MAX_MW = 0.1;
export const SLIP_MAX_KMOL_H = 0.5;
export const L07_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 4000 }, mixer: { max: 1, price: 3000 }, gasifier: { max: 1, price: 40000 }, co_burner: { max: 1, price: 25000 }, heater: { max: 1, price: 18000 },
  cooler: { max: 1, price: 8000 }, stack: { max: 1, price: 8000 },
};
export const L07_BUDGET = 120000;
const PRESETS = { heater: { T: 298.15 }, cooler: { T: 308.15, utility: 'cw' } };
const START_COKE = 60, START_AIR = 300;

/** -dH298 of C + 1/2 O2 -> CO and CO + 1/2 O2 -> CO2, kJ/mol, from the reaction catalogue; their sum is the Hess answer (EQ-NC-017: -110.5 = -393.5 + 283.0). */
export const dhGas = (): number => -rxnDH(findReaction('R14')!.nu, 298.15, 'rigorous') / 1000;
export const dhBurn = (): number => -rxnDH(findReaction('R15')!.nu, 298.15, 'rigorous') / 1000;
/** Coke, kmol/h, that delivers `mw` MW through the two steps. */
export const cokeFor = (mw: number): number => (mw * 3600) / (dhGas() + dhBurn());

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;

export function hessMeasures(s: S): Measures {
  const coke = toKmolH(fedOf(s, 'C')), o2 = toKmolH(fedOf(s, 'O2'));
  const v: Record<string, number> = {
    coke: coke, o2_fed: o2, air: o2 / AIR_O2, o2_need: coke, heat_mw: 0, gas_mw: 0, burn_mw: 0, ledger_mw: 0, lost_mw: 0, quench_mw: 0, co_slip: 0, c_slip: 0, xi_gas: 0, xi_burn: 0, stack_c: 0,
    dh_gas: dhGas(), dh_burn: dhBurn(), dh_sum: dhGas() + dhBurn(), two_step: 0, coke_ref: cokeFor(HEAT_MW), quench_on: 0,
  };
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const gas = unitsOfType(s, 'gasifier')[0], bur = unitsOfType(s, 'co_burner')[0], hea = unitsOfType(s, 'heater')[0], stk = unitsOfType(s, 'stack')[0];
  if (!gas || !bur || !hea || !stk) return { ok: false, v };
  const units = s.solved.units;
  v.xi_gas = toKmolH(units[gas.id]?.info.xi1 ?? 0); v.xi_burn = toKmolH(units[bur.id]?.info.xi1 ?? 0);
  v.gas_mw = (v.xi_gas * dhGas()) / 3600; v.burn_mw = (v.xi_burn * dhBurn()) / 3600;
  v.ledger_mw = v.gas_mw + v.burn_mw;
  v.heat_mw = Math.abs(units[hea.id]?.duty ?? 0) / 1e6;
  const q = unitsOfType(s, 'cooler')[0];
  v.quench_mw = q ? Math.abs(units[q.id]?.duty ?? 0) / 1e6 : 0;
  v.quench_on = q ? 1 : 0;
  v.lost_mw = Math.max(0, v.ledger_mw - v.heat_mw);
  const st = inStream(s, stk.id);
  v.co_slip = toKmolH(flowOf(s, st, 'CO')); v.c_slip = toKmolH(flowOf(s, st, 'C'));
  v.stack_c = st ? st.T - 273.15 : 0;
  v.two_step = v.xi_gas > 1e-6 && v.xi_burn > 1e-6 ? 1 : 0;
  void intoType;
  return { ok: true, v };
}

const COACH: CoachStep[] = [
  { id: 'place_gasifier', role: 'mentor', focus: 'gasifier', done: (s) => has(s, 'gasifier') },
  { id: 'place_burner', role: 'mentor', focus: 'co_burner', done: (s) => has(s, 'co_burner') },
  { id: 'place_heater', role: 'mentor', focus: 'heater', done: (s) => has(s, 'heater') && has(s, 'stack') },
  { id: 'pipe_up', role: 'mentor', done: (s) => s.flowsheet.streams.length >= 6 },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_ledger', role: 'mentor', focus: 'heater', done: (s) => ['read_ledger', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'mentor', done: (s) => s.ui.coachStep === 'why' },
];

/** Plant ids: F-101 coke, F-102 air (pre-placed), M-103 mixer, R-104 gasifier, R-105 CO burner, H-106 process heater, Z-107 stack. */
export function hessBuild(coke: number, air: number, last: Action[] = [{ name: 'commission' }]): Action[] {
  return [
    { name: 'placeUnit', args: ['mixer', 4, 2, 0] }, { name: 'placeUnit', args: ['gasifier', 7, 0, 0] }, { name: 'placeUnit', args: ['co_burner', 12, 0, 0] },
    { name: 'placeUnit', args: ['heater', 17, 2, 0] }, { name: 'placeUnit', args: ['stack', 21, 2, 0] },
    { name: 'setFeed', args: ['F-101', { flow: (coke * 1000) / 3600 }] }, { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] },
    { name: 'connect', args: ['F-101', 'out', 'M-103', 'in1'] }, { name: 'connect', args: ['F-102', 'out', 'M-103', 'in2'] }, { name: 'connect', args: ['M-103', 'out', 'R-104', 'in'] },
    { name: 'connect', args: ['R-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'H-106', 'in'] }, { name: 'connect', args: ['H-106', 'out', 'Z-107', 'in'] },
    ...last,
  ];
}
/** The kind novice: a cooling-water quench between the gasifier and the CO burner, to spare the brickwork (C-105 quench, R-106 burner, H-107 heater, Z-108 stack). */
export function quenchBuild(coke: number, air: number): Action[] {
  return [
    { name: 'placeUnit', args: ['mixer', 4, 2, 0] }, { name: 'placeUnit', args: ['gasifier', 7, 0, 0] }, { name: 'placeUnit', args: ['cooler', 12, 4, 0] }, { name: 'placeUnit', args: ['co_burner', 14, 0, 0] },
    { name: 'placeUnit', args: ['heater', 19, 2, 0] }, { name: 'placeUnit', args: ['stack', 21, 6, 0] },
    { name: 'setFeed', args: ['F-101', { flow: (coke * 1000) / 3600 }] }, { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] },
    { name: 'connect', args: ['F-101', 'out', 'M-103', 'in1'] }, { name: 'connect', args: ['F-102', 'out', 'M-103', 'in2'] }, { name: 'connect', args: ['M-103', 'out', 'R-104', 'in'] },
    { name: 'connect', args: ['R-104', 'out', 'C-105', 'in'] }, { name: 'connect', args: ['C-105', 'out', 'R-106', 'in'] }, { name: 'connect', args: ['R-106', 'out', 'H-107', 'in'] },
    { name: 'connect', args: ['H-107', 'out', 'Z-108', 'in'] }, { name: 'commission' },
  ];
}

const REF_COKE = cokeFor(HEAT_MW);
/** Coke burnt at the reference, t/h. */
export const REF_COKE_T = (REF_COKE * 12.011) / 1000;
/** The expert: Hess adds the steps (110.5 + 283.0 = 393.5 kJ/mol), so 10 MW takes 91.5 kmol/h of coke; one mole of O2 per coke atom, 5 % over, no quench. */
const solver = () => {
  let done = false;
  return (): Action[] => { if (done) return []; done = true; return [{ name: 'callIt', args: [REF_COKE] }, ...hessBuild(REF_COKE, (REF_COKE * 1.05) / AIR_O2)]; };
};
const naive = () => {
  let done = false;
  return (): Action[] => { if (done) return []; done = true; return quenchBuild(REF_COKE, (REF_COKE * 1.05) / AIR_O2); };
};

export const L07: LevelSpec = {
  id: 'L07', firstRun: true, chapter: 2, index: 7, setter: 'mentor', budgetUSD: L07_BUDGET, units: L07_UNITS, notes: 2, shiftLen: 0,
  madeKgH: (_s, m) => m.v.coke! * 12.011,
  setup: (s) => {
    baseSetup(s, L07_SPECIES, L07_UNITS, PRESETS);
    putFeed(s, 0, 0, { C: 1 }, START_COKE, 298.15, 1.1e5);
    putFeed(s, 0, 4, { O2: AIR_O2, N2: 1 - AIR_O2 }, START_AIR, 298.15, 1.1e5);
    sealSetup(s);
  },
  measures: hessMeasures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'heat', met: m.ok && Math.abs(m.v.heat_mw! - HEAT_MW) <= HEAT_TOL, ...(m.ok ? { value: m.v.heat_mw } : {}), target: HEAT_MW },
      { key: 'route', met: m.ok && m.v.two_step === 1 && m.v.co_slip! <= SLIP_MAX_KMOL_H && m.v.c_slip! <= 1e-6, ...(m.ok ? { value: m.v.co_slip } : {}), target: SLIP_MAX_KMOL_H },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L07_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L07_BUDGET, value: sp, target: L07_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => {
    const p = predictionOf(s, 'coke_kmol_h');
    return [m.ok && m.v.lost_mw! <= LOST_MAX_MW, p !== null && relErr(p.value, cokeFor(HEAT_MW)) <= COKE_CALL_TOL];
  },
  callIt: { key: 'coke_kmol_h', unit: 'kmol/h', tol: COKE_CALL_TOL, truth: () => cokeFor(HEAT_MW) },
  hero: (_s, m) => ({ key: 'heat_mw', unit: 'MW', value: m.v.heat_mw!, lo: HEAT_MW - HEAT_TOL, hi: HEAT_MW + HEAT_TOL }),
  secondary: (_s, m) => ({ key: 'lost_mw', unit: 'MW', value: m.v.lost_mw!, limit: LOST_MAX_MW }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'short', legend: t('lv.L07.ann.short'), state: !m.ok ? 'off' : m.v.heat_mw! < HEAT_MW - HEAT_TOL ? 'high' : 'normal' },
      { key: 'over', legend: t('lv.L07.ann.over'), state: !m.ok ? 'off' : m.v.heat_mw! > HEAT_MW + HEAT_TOL ? 'high' : 'normal' },
      { key: 'lost', legend: t('lv.L07.ann.lost'), state: !m.ok ? 'off' : m.v.lost_mw! > LOST_MAX_MW ? 'critical' : 'normal' },
      { key: 'co', legend: t('lv.L07.ann.co'), state: !m.ok ? 'off' : m.v.co_slip! > SLIP_MAX_KMOL_H ? 'critical' : 'normal' },
      { key: 'route', legend: t('lv.L07.ann.route'), state: !m.ok ? 'off' : m.v.two_step === 1 ? 'normal' : 'high' },
      { key: 'solve', legend: t('lv.L07.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L07.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.co_slip! > SLIP_MAX_KMOL_H || m.v.c_slip! > 1e-6) return { key: 'slip', cause: t('lv.L07.cause.slip', { co: f(s, m.v.co_slip!), o2: f(s, m.v.o2_fed!), coke: f(s, m.v.coke!) }) };
    if (m.v.lost_mw! > LOST_MAX_MW) return { key: 'lost', cause: t('lv.L07.cause.lost', { lost: f(s, m.v.lost_mw!), gas: f(s, m.v.gas_mw!), heat: f(s, m.v.heat_mw!), want: HEAT_MW }) };
    if (m.v.heat_mw! < HEAT_MW - HEAT_TOL) return { key: 'short', cause: t('lv.L07.cause.short', { heat: f(s, m.v.heat_mw!), coke: f(s, m.v.coke!), per: f(s, m.v.dh_sum!), want: f(s, m.v.coke_ref!) }) };
    if (m.v.heat_mw! > HEAT_MW + HEAT_TOL) return { key: 'over', cause: t('lv.L07.cause.over', { heat: f(s, m.v.heat_mw!), coke: f(s, m.v.coke!), want: f(s, m.v.coke_ref!) }) };
    return { key: 'route', cause: t('lv.L07.cause.route') };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.coke! > 0)) return null;
    const sum = shown(m.v.dh_sum!), c = shown(m.v.coke!);
    return `${f(s, c)} × ${f(s, sum)} ÷ 3600 = ${f(s, shown((c * sum) / 3600))} MW from the coke`;
  },
  lessonVars: (s, m) => ({ a: f(s, shown(m.v.dh_gas!)), b: f(s, shown(m.v.dh_burn!)), sum: f(s, shown(m.v.dh_sum!)), coke: f(s, m.v.coke!), heat: f(s, m.v.heat_mw!), lost: f(s, m.v.lost_mw!) }),
  metrics: (_s, m) => [
    { key: 'coke_t_h', unit: 't/h', value: (m.v.coke! * 12.011) / 1000 },
    { key: 'capture_pct', unit: '%', value: m.v.ledger_mw! > 0 ? (m.v.heat_mw! / m.v.ledger_mw!) * 100 : 0 },
    { key: 'co_slip', unit: 'kmol/h', value: m.v.co_slip! },
  ],
  histogram: { metric: 'coke_t_h', best: () => REF_COKE_T, spread: 0.25, lowerIsBetter: true },
  solver,
  naive,
};
void fromKmolH;
