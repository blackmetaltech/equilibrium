// L14 · Exam Bridge: The Brown Gas (oracles EQ-NC-024, -030, -031, -034; DESIGN 2.6, Book data). A pre-built lab bench: N2O4 feed (13.8 g = 0.15 mol, read as mol) and an argon
// feed (closed) -> mixer -> lab flask (V knob, T knob, constant-P switch Pfix) -> vent. The flask runs on the book's own K (Kp = 85.87 bar at 400 K, R = 0.083 L bar / (mol K)),
// so the gauge reads the book's 9.15 bar. The player Calls it Kp, reproduces the gauge, and runs the three Le Chatelier tests by doing (halve V, argon at constant V,
// argon at constant P); the run record (the last ten setpoint sets) is the proof that the tests were done.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { solveEquilibrium } from '../sim/chem/equilibrium';
import { R_GAS } from '../sim/thermo/shomate';
import { REGIONS } from '../regions';
import type { EqState } from '../state';
import { scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, link, predictionOf, put, putFeed, relErr, sealSetup, shown } from './util';

type S = Readonly<EqState>;
export const L14_SPECIES = ['N2O4', 'NO2', 'Ar'];
export const L14_GAUGE_TOL = 0.005;
export const L14_KP_TOL = 0.005;
/** The flask volume of the notebook problem, m3. */
export const V_BOOK = 1e-3;
const UNITS: LevelSpec['units'] = {};
const ALL = { feed: { max: 9 }, mixer: { max: 1 }, lab_flask: { max: 1 }, vent: { max: 1 } };

/** The notebook's numbers of the region pack (EQ-NC-024: grams, litres, K, bar, the book's R). */
export function problem(s: { region: string }): { n0: number; V_L: number; T: number; P: number; R: number } {
  const n = REGIONS.get(s.region).data.examSet.levels.L14!.numbers;
  return { n0: n.n2o4_g! / 92, V_L: n.v_l!, T: n.t_k!, P: n.p_bar!, R: n.r_book! };
}
/** The book's working: alpha from P V = n0 (1 + alpha) R T, then Kp = 4 alpha^2 P / (1 - alpha^2) (bar). */
export function bookWorking(s: { region: string }): { alpha: number; kp: number } {
  const p = problem(s);
  const alpha = (p.P * p.V_L) / (p.n0 * p.R * p.T) - 1;
  return { alpha, kp: (4 * alpha * alpha * p.P) / (1 - alpha * alpha) };
}
/** What a real N2O4 flask (NIST-JANAF K) would read: Kp and the gauge, bar. */
export function realFlask(s: { region: string }): { kp: number; P: number } {
  const p = problem(s);
  const r = solveEquilibrium({ species: L14_SPECIES, n0: [p.n0, 0, 0], T: p.T, reactions: [{ N2O4: -1, NO2: 2 }], detail: 'rigorous', V: p.V_L * 1e-3, R: R_GAS, mode: 'constV' });
  if (!r.ok) return { kp: 0, P: 0 };
  const n = r.value.n, tot = n[0]! + n[1]! + n[2]!, P = r.value.P / 1e5;
  const pa = (n[0]! / tot) * P, pb = (n[1]! / tot) * P;
  return { kp: pa > 0 ? (pb * pb) / pa : 0, P };
}

const flaskOf = (s: S) => s.flowsheet.units.find((u) => u.type === 'lab_flask');
const argonFeed = (s: S) => s.flowsheet.units.find((u) => u.type === 'feed' && (s.feeds[u.id]?.x[s.species.indexOf('Ar')] ?? 0) > 0.5);

/** Which of the three tests the run record shows: halved volume, argon at constant V, argon at constant P. */
export function testsDone(s: S): [boolean, boolean, boolean] {
  const fl = flaskOf(s), ar = argonFeed(s);
  if (!fl || !ar) return [false, false, false];
  let a = false, b = false, c = false;
  for (const r of s.runs) {
    const f = r.setpoints[fl.id] ?? {}, argon = (r.setpoints[ar.id]?.flow ?? 0) > 0;
    const V = f.V ?? V_BOOK, P = f.Pfix ?? 0;
    if (!argon && P === 0 && V <= 0.55 * V_BOOK) a = true;
    if (argon && P === 0 && V >= 0.95 * V_BOOK) b = true;
    if (argon && P > 0) c = true;
  }
  return [a, b, c];
}

export function flaskMeasures(s: S): Measures {
  const fl = flaskOf(s);
  const [a, b, c] = testsDone(s);
  const v: Record<string, number> = {
    v_l: fl && typeof fl.params.V === 'number' ? fl.params.V * 1000 : 0, t_k: fl && typeof fl.params.T === 'number' ? fl.params.T : 0, p_fix_bar: fl && typeof fl.params.Pfix === 'number' ? fl.params.Pfix / 1e5 : 0,
    p_bar: 0, alpha: 0, kp_bar: 0, no2: 0, book: 0, t_halve: a ? 1 : 0, t_inert_v: b ? 1 : 0, t_inert_p: c ? 1 : 0, tests: Number(a) + Number(b) + Number(c), runs: commissions(s), argon: 0,
  };
  const ar = argonFeed(s);
  v.argon = ar ? (s.feeds[ar.id]?.flow ?? 0) : 0;
  if (!fl || s.solved === null || !s.solved.ok) return { ok: false, v };
  const info = s.solved.units[fl.id]?.info;
  if (!info) return { ok: false, v };
  v.book = Math.abs(v.v_l! - 1) <= 0.005 && Math.abs(v.t_k! - problem(s).T) <= 0.5 && v.p_fix_bar === 0 && v.argon === 0 ? 1 : 0;
  v.p_bar = info.P_bar ?? 0; v.alpha = info.alpha ?? 0; v.kp_bar = info.Kp_bar ?? 0; v.no2 = info.no2_mol_m3 ?? 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const has = (s: S, type: string): boolean => s.flowsheet.units.some((u) => u.type === type);
const COACH: CoachStep[] = [
  { id: 'call_kp', role: 'mentor', done: (s) => s.prediction !== null },
  { id: 'turn_volume', role: 'mentor', focus: 'lab_flask', done: (s) => { const fl = flaskOf(s); return commissions(s) >= 1 || (fl !== undefined && fl.params.V !== V_BOOK); } },
  { id: 'read_colour', role: 'mentor', focus: 'lab_flask', done: (s) => ['read_colour', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'mentor', done: (s) => s.ui.coachStep === 'why' },
];

export const L14: LevelSpec = {
  id: 'L14', firstRun: true, chapter: 3, index: 14, setter: 'mentor', budgetUSD: 0, units: UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L14_SPECIES, ALL, { lab_flask: { V: V_BOOK, T: problem(s).T, Pfix: 0, book_K: bookWorking(s).kp } });
    const p = problem(s);
    const brown = putFeed(s, 0, 0, { N2O4: 1 }, (p.n0 * 3600) / 1000, p.T, 2e5);
    const argon = putFeed(s, 0, 4, { Ar: 1 }, 0, p.T, 2e5);
    const mix = put(s, 'mixer', 5, 2), flask = put(s, 'lab_flask', 10, 2), vent = put(s, 'vent', 16, 2);
    link(s, brown, 'out', mix, 'in1'); link(s, argon, 'out', mix, 'in2'); link(s, mix, 'out', flask, 'in'); link(s, flask, 'out', vent, 'in');
    s.palette = []; s.limits = {};
    sealSetup(s);
  },
  measures: flaskMeasures,
  goals: (s, m) => [{ key: 'gauge', met: m.ok && m.v.book === 1 && relErr(m.v.p_bar!, problem(s).P) <= L14_GAUGE_TOL, ...(m.ok ? { value: m.v.p_bar } : {}), target: problem(s).P }],
  extraStars: (s, m) => [m.v.tests === 3, predictionOf(s, 'kp_bar') !== null && relErr(predictionOf(s, 'kp_bar')!.value, bookWorking(s).kp) <= L14_KP_TOL],
  callIt: { key: 'kp_bar', unit: 'bar', tol: L14_KP_TOL, truth: (s) => bookWorking(s).kp },
  hero: (s, m) => ({ key: 'gauge', unit: 'bar', value: m.v.p_bar!, lo: m.ok ? problem(s).P * (1 - L14_GAUGE_TOL) : 0, hi: m.ok ? problem(s).P * (1 + L14_GAUGE_TOL) : 0 }),
  secondary: (_s, m) => ({ key: 'alpha', unit: '', value: m.v.alpha!, limit: 1 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const lamp = (done: number): Annunciator['state'] => (done ? 'normal' : 'off');
    return [
      { key: 'gauge', legend: t('lv.L14.ann.gauge'), state: !m.ok ? 'off' : g[0]!.met ? 'normal' : 'high' },
      { key: 'halve', legend: t('lv.L14.ann.halve'), state: lamp(m.v.t_halve!) },
      { key: 'inert_v', legend: t('lv.L14.ann.inert_v'), state: lamp(m.v.t_inert_v!) },
      { key: 'inert_p', legend: t('lv.L14.ann.inert_p'), state: lamp(m.v.t_inert_p!) },
      { key: 'called', legend: t('lv.L14.ann.called'), state: s.prediction !== null ? 'normal' : 'off' },
      { key: 'solve', legend: t('lv.L14.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L14.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    return { key: 'off_gauge', cause: t('lv.L14.cause.off_gauge', { P: f(s, m.v.p_bar!), want: f(s, problem(s).P), V: f(s, m.v.v_l!), T: f(s, m.v.t_k!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || m.v.argon! > 0 || m.v.alpha! <= 0 || m.v.alpha! >= 0.999) return null;
    const a = shown(m.v.alpha!), P = shown(m.v.p_bar!);
    return `4 × ${f(s, a)} × ${f(s, a)} × ${f(s, P)} ÷ (1 − ${f(s, a)} × ${f(s, a)}) = ${f(s, shown((4 * a * a * P) / (1 - a * a)))} bar (Kp)`;
  },
  lessonVars: (s, m) => {
    const w = bookWorking(s), real = realFlask(s);
    return { alpha: f(s, m.ok ? m.v.alpha! : w.alpha), P: f(s, m.v.p_bar!), kp: f(s, w.kp), real: f(s, real.kp), realP: f(s, real.P), tests: m.v.tests! };
  },
  metrics: (_s, m) => [
    { key: 'kp_bar', unit: 'bar', value: m.v.kp_bar! },
    { key: 'alpha', unit: '', value: m.v.alpha! },
    { key: 'runs', unit: '', value: m.v.runs! },
  ],
  histogram: { metric: 'runs', best: () => 4, spread: 0.6, lowerIsBetter: true },
  card: (s, m): Record<string, string | number> => {
    if (!m.ok) return {};
    const w = bookWorking(s), real = realFlask(s);
    return { book_kp_bar: w.kp, book_p_bar: problem(s).P, book_alpha: w.alpha, real_kp_bar: real.kp, real_p_bar: real.P };
  },
  solver: () => scripted([
    { name: 'callIt', args: [bookWorking({ region: 'global' }).kp] },
    { name: 'setParam', args: ['U-104', 'V', 0.5 * V_BOOK] }, { name: 'commission' },
    { name: 'setParam', args: ['U-104', 'V', V_BOOK] }, { name: 'setFeed', args: ['F-102', { flow: 0.15 }] }, { name: 'commission' },
    { name: 'setParam', args: ['U-104', 'Pfix', 9.15e5] }, { name: 'commission' },
    { name: 'setParam', args: ['U-104', 'Pfix', 0] }, { name: 'setFeed', args: ['F-102', { flow: 0 }] }, { name: 'commission' },
  ])(),
  /** The slip: the flask volume typed as litres (1 m3). */
  naive: () => scripted([{ name: 'setParam', args: ['U-104', 'V', 1] }, { name: 'commission' }])(),
};
void has;
