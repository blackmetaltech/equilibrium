// L03 · The Unknown Fuel (DESIGN 2.6). A fuel line of unknown gas (seeded identity: CH4 or C3H8, 10 kmol/h, hidden from the cards) and an air intake feed a boiler
// burner; the flue analyser (the stack) reads CO2, H2O, O2 and CO in kmol/h. The job: 10 +- 1 % excess air and complete combustion, found from a test burn:
// CO2 : H2O = 1 : 2 means CH4, 3 : 4 means C3H8.
// Engine note (reported to the director): the stoichiometric burner is complete-or-clamped, so a rich burn shows as unburnt fuel at the analyser, not as CO.
import type { Action } from '@core/kit';
import { findReaction } from '../data/reactions';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { enthalpyFlowAt, makeMixture } from '../sim/thermo';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fedOf, flowOf, inStream, predictionOf, putFeed, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L03_SPECIES = ['CH4', 'C3H8', 'O2', 'N2', 'CO2', 'H2O', 'CO'];
export const FUELS = ['CH4', 'C3H8'] as const;
/** The seeded identity: an odd seed burns propane (the leaderboard seed 1003 is the DESIGN reference), an even one methane. */
export const fuelOfSeed = (seed: number): (typeof FUELS)[number] => (seed % 2 === 1 ? 'C3H8' : 'CH4');
export const L03_FUEL_KMOL_H = 10;
export const EXCESS_PCT = 10, EXCESS_TOL = 1;
const AIR_O2 = 0.21;
const T_AMB = 298.15;
const P_FEED = 1.1e5;
export const L03_UNITS: LevelSpec['units'] = {
  feed: { max: 2, price: 4000 }, compressor: { max: 1, price: 40000 }, mixer: { max: 1, price: 3000 }, burner: { max: 1, price: 22000 }, boiler: { max: 1, price: 30000 },
  stack: { max: 1, price: 8000 },
};
export const L03_BUDGET = 130000;
const PRESETS = { compressor: { P: P_FEED, stages: 1 }, boiler: { T: 450, steam: 'LP' } };
const START_AIR = 150;
/** Carbon and hydrogen atoms and the O2 a mole of the fuel takes, read from the reaction catalogue (R13 methane, R16 propane). */
function fuelFacts(id: (typeof FUELS)[number]): { c: number; h: number; o2: number } {
  const nu = findReaction(id === 'CH4' ? 'R13' : 'R16')!.nu;
  return { c: nu.CO2!, h: 2 * nu['H2O']!, o2: -nu.O2! };
}
const FUEL_FACTS = { CH4: fuelFacts('CH4'), C3H8: fuelFacts('C3H8') };

/** The fuel the plant is burning (from the feed specs; used by the grader, never shown by a card). */
export function fuelIn(s: S): (typeof FUELS)[number] {
  return fedOf(s, 'C3H8') > fedOf(s, 'CH4') ? 'C3H8' : 'CH4';
}

export function fuelMeasures(s: S): Measures {
  const fuel = fuelIn(s), ff = FUEL_FACTS[fuel];
  const fedFuel = toKmolH(fedOf(s, 'CH4') + fedOf(s, 'C3H8')), o2Fed = toKmolH(fedOf(s, 'O2'));
  const need = fedFuel * ff.o2;
  const v: Record<string, number> = {
    fuel_kmol_h: fedFuel, o2_fed: o2Fed, air: o2Fed / AIR_O2, o2_need: need, test_burns: commissions(s), fuel_c: ff.c,
    co2: 0, h2o: 0, o2: 0, co: 0, slip: 0, slip_pct: 0, excess_air: 0, stack_loss_mw: 0, stack_T: 0, flue_error: 0, o2_burned: 0, c_per_h_ratio: 0,
  };
  if (s.solved === null || !s.solved.ok) return { ok: false, v };
  const stk = unitsOfType(s, 'stack')[0];
  const st = stk ? inStream(s, stk.id) : undefined;
  if (!st) return { ok: false, v };
  v.co2 = toKmolH(flowOf(s, st, 'CO2')); v.h2o = toKmolH(flowOf(s, st, 'H2O')); v.o2 = toKmolH(flowOf(s, st, 'O2')); v.co = toKmolH(flowOf(s, st, 'CO'));
  v.slip = toKmolH(flowOf(s, st, 'CH4') + flowOf(s, st, 'C3H8'));
  v.slip_pct = fedFuel > 0 ? (v.slip / fedFuel) * 100 : 0;
  v.o2_burned = o2Fed - v.o2;
  v.excess_air = v.o2_burned > 0 ? (v.o2 / v.o2_burned) * 100 : 0;
  v.flue_error = Math.abs(v.excess_air - EXCESS_PCT);
  v.stack_T = st.T;
  const mx = makeMixture(s.species);
  v.stack_loss_mw = (enthalpyFlowAt(mx, st.n, st.T) - enthalpyFlowAt(mx, st.n, T_AMB)) / 1e6;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const burn = (s: S): boolean => commissions(s) >= 1;
const COACH: CoachStep[] = [
  { id: 'set_air', role: 'manager', focus: 'compressor', done: (s) => unitsOfType(s, 'compressor').length >= 1 },
  { id: 'place_mixer', role: 'manager', focus: 'mixer', done: (s) => unitsOfType(s, 'mixer').length >= 1 },
  { id: 'place_burner', role: 'manager', focus: 'burner', done: (s) => unitsOfType(s, 'burner').length >= 1 },
  { id: 'place_boiler', role: 'manager', focus: 'boiler', done: (s) => unitsOfType(s, 'boiler').length >= 1 && unitsOfType(s, 'stack').length >= 1 },
  { id: 'pipe_up', role: 'manager', done: (s) => s.flowsheet.streams.length >= 6 },
  { id: 'test_burn', role: 'manager', focus: 'key', done: burn },
  { id: 'read_analyser', role: 'manager', focus: 'stack', done: (s) => ['read_analyser', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'manager', done: (s) => s.ui.coachStep === 'why' },
];

/** Plant ids: F-101 fuel line, F-102 air intake (pre-placed), then K-103 blower, M-104 mixer, R-105 burner, B-106 boiler, Z-107 stack. */
function fuelBuild(air: number, last: Action[]): Action[] {
  return [
    { name: 'placeUnit', args: ['compressor', 4, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 2, 0] }, { name: 'placeUnit', args: ['burner', 14, 0, 0] },
    { name: 'placeUnit', args: ['boiler', 18, 6, 0] }, { name: 'placeUnit', args: ['stack', 22, 10, 0] },
    { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] },
    { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'M-104', 'in2'] }, { name: 'connect', args: ['F-101', 'out', 'M-104', 'in1'] },
    { name: 'connect', args: ['M-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'B-106', 'in'] }, { name: 'connect', args: ['B-106', 'out', 'Z-107', 'in'] },
    ...last,
  ];
}
/** Air for 10 % excess, kmol/h, from a fuel formula: n_fuel (C + H/4) x 1.10 / 0.21. */
export const airFor = (nFuel: number, c: number, h: number): number => (nFuel * (c + h / 4) * (1 + EXCESS_PCT / 100)) / AIR_O2;

/** The expert: one clean test burn at a generous air flow, read the flue (C and H from CO2 and H2O per fuel mole), Call it, set the air, burn. */
const solver = () => {
  let step = 0;
  return (s: S): Action[] => {
    if (step === 0) { step = 1; return fuelBuild(400, [{ name: 'commission' }]); }
    if (step === 1 && s.solved?.ok) {
      step = 2;
      const m = fuelMeasures(s);
      const c = m.v.co2! / m.v.fuel_kmol_h!, h = (2 * m.v.h2o!) / m.v.fuel_kmol_h!;
      return [
        { name: 'callIt', args: [Math.round(c)] },
        { name: 'setFeed', args: ['F-102', { flow: (airFor(m.v.fuel_kmol_h!, c, h) * 1000) / 3600 }] },
        { name: 'commission' },
      ];
    }
    return [];
  };
};
/** The novice guesses the other fuel (a methane man on a propane line, or the reverse) and sets the air for 10 % excess of his guess. */
const naive = () => {
  let done = false;
  return (s: S): Action[] => {
    if (done) return [];
    done = true;
    const wrong = fuelIn(s) === 'C3H8' ? FUEL_FACTS.CH4 : FUEL_FACTS.C3H8;
    return fuelBuild(airFor(L03_FUEL_KMOL_H, wrong.c, wrong.h), [{ name: 'commission' }]);
  };
};

export const L03: LevelSpec = {
  id: 'L03', chapter: 1, index: 3, setter: 'manager', budgetUSD: L03_BUDGET, units: L03_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L03_SPECIES, L03_UNITS, PRESETS);
    putFeed(s, 0, 0, { [fuelOfSeed(s.seed)]: 1 }, L03_FUEL_KMOL_H, T_AMB, P_FEED);
    putFeed(s, 0, 4, { O2: AIR_O2, N2: 1 - AIR_O2 }, START_AIR, T_AMB, 1e5);
    sealSetup(s);
  },
  measures: fuelMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'excess', met: m.ok && m.v.slip! <= 1e-6 && m.v.flue_error! <= EXCESS_TOL, ...(m.ok ? { value: m.v.excess_air } : {}), target: EXCESS_PCT },
      { key: 'clean', met: m.ok && m.v.slip! <= 1e-6 && m.v.co! <= 1e-6, ...(m.ok ? { value: m.v.slip! + m.v.co! } : {}), target: 0 },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L03_UNITS); g.push({ key: 'budget', met: sp <= L03_BUDGET, value: sp, target: L03_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => {
    const p = predictionOf(s, 'fuel_c');
    return [m.ok && m.v.test_burns! <= 3, p !== null && p.value === FUEL_FACTS[fuelIn(s)].c];
  },
  callIt: { key: 'fuel_c', unit: 'C', tol: 0, lateOk: true, truth: (s) => FUEL_FACTS[fuelIn(s)].c },
  hero: (_s, m) => ({ key: 'excess_air', unit: '%', value: m.v.excess_air!, lo: EXCESS_PCT - EXCESS_TOL, hi: EXCESS_PCT + EXCESS_TOL }),
  secondary: (_s, m) => ({ key: 'test_burns', unit: '', value: m.v.test_burns!, limit: 3 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const slip = m.ok && m.v.slip! > 1e-6;
    return [
      { key: 'o2lo', legend: t('lv.L03.ann.o2lo'), state: !m.ok ? 'off' : slip || m.v.excess_air! < EXCESS_PCT - EXCESS_TOL ? 'high' : 'normal' },
      { key: 'o2hi', legend: t('lv.L03.ann.o2hi'), state: !m.ok ? 'off' : m.v.excess_air! > EXCESS_PCT + EXCESS_TOL ? 'high' : 'normal' },
      { key: 'co', legend: t('lv.L03.ann.co'), state: !m.ok ? 'off' : slip ? 'critical' : 'normal' },
      { key: 'soot', legend: t('lv.L03.ann.soot'), state: !m.ok ? 'off' : slip ? 'high' : 'normal' },
      { key: 'solve', legend: t('lv.L03.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L03.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.slip! > 1e-6) return { key: 'rich', cause: t('lv.L03.cause.rich', { air: f(s, m.v.air!), o2: f(s, m.v.o2_fed!), slip: f(s, m.v.slip_pct!) }) };
    if (m.v.excess_air! > EXCESS_PCT + EXCESS_TOL) return { key: 'lean', cause: t('lv.L03.cause.lean', { x: f(s, m.v.excess_air!), loss: f(s, m.v.stack_loss_mw!), T: f(s, m.v.stack_T!) }) };
    return { key: 'tight', cause: t('lv.L03.cause.tight', { x: f(s, m.v.excess_air!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.co2! + m.v.h2o! > 0)) return null;
    const co2 = shown(m.v.co2!), h2o = shown(m.v.h2o!);
    return `${f(s, co2)} + ${f(s, h2o)} ÷ 2 = ${f(s, shown(co2 + h2o / 2))} kmol/h of O₂ burned`;
  },
  lessonVars: (s, m) => ({ co2: f(s, m.v.co2!), h2o: f(s, m.v.h2o!), o2: f(s, m.v.o2!), air: f(s, m.v.air!), x: f(s, m.v.excess_air!), burns: m.v.test_burns! }),
  metrics: (_s, m) => [
    { key: 'test_burns', unit: '', value: m.v.test_burns! },
    { key: 'stack_loss_mw', unit: 'MW', value: m.v.stack_loss_mw! },
    { key: 'flue_error', unit: '%', value: m.v.flue_error! },
  ],
  histogram: { metric: 'test_burns', best: () => 2, spread: 1, lowerIsBetter: true },
  masked: (s) => unitsOfType(s, 'feed').filter((u) => (s.feeds[u.id]?.x ?? []).some((x, i) => x > 0 && (s.species[i] === 'CH4' || s.species[i] === 'C3H8'))).map((u) => u.id),
  solver,
  naive,
};
