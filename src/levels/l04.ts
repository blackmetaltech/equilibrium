// L04 · Exam Bridge: The Lab Notebook (oracle EQ-NC-005, DESIGN 2.6). The notebook's feeds (2.00 t/h N2, 1.00 t/h H2, region pack exam numbers) into the ideal reactor.
// The player Calls it first (NH3 kg/h and the limiting reagent), builds the bench plant and checks the printout against the notebook.
// The book answer (N = 14, H = 1) is printed beside the engine's (IUPAC masses): 2428.6 against 2431.8 kg/h, both inside the 0.5 % tolerance.
import { fmtNumber } from '../engine/solved';
import { REGIONS } from '../regions';
import { t } from '../i18n';
import type { EqState } from '../state';
import { BENCH_BUDGET, BENCH_COACH, BENCH_PRESETS, BENCH_SPECIES, BENCH_UNITS, benchBuild, benchMeasures, scripted } from './bench';
import type { Annunciator, CoachStep, LevelSpec } from './spec';
import { baseSetup, commissions, molarMass, predictionOf, relErr, sealSetup, shown, spentOf, unitsOfType, piped } from './util';

type S = Readonly<EqState>;
export const NH3_TOL = 0.005;

/** The notebook's numbers of the region pack (kg/h: the oracle's grams are a 1 h basis scaled by 1000). */
export function notebook(s: { region: string }): { n2kg: number; h2kg: number } {
  const n = REGIONS.get(s.region).data.examSet.levels.L04!.numbers;
  return { n2kg: n.n2_g!, h2kg: n.h2_g! };
}
/** The oracle answer from the engine's molar masses: limiting reagent, NH3 kg/h, leftover H2 kmol/h. */
export function notebookAnswer(s: { region: string }): { limiting: string; nh3: number; h2left: number; n2kmol: number; h2kmol: number } {
  const nb = notebook(s);
  const n2 = nb.n2kg / molarMass('N2'), h2 = nb.h2kg / molarMass('H2');
  const xi = Math.min(n2, h2 / 3);
  return { limiting: n2 <= h2 / 3 ? 'N2' : 'H2', nh3: 2 * xi * molarMass('NH3'), h2left: h2 - 3 * xi, n2kmol: n2, h2kmol: h2 };
}
/** The same working with the book's whole-number masses (N 14, H 1). */
export function bookAnswer(s: { region: string }): { nh3: number; h2left: number } {
  const nb = notebook(s);
  const n2 = nb.n2kg / 28, h2 = nb.h2kg / 2;
  const xi = Math.min(n2, h2 / 3);
  return { nh3: 2 * xi * 17, h2left: h2 - 3 * xi };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const COACH: CoachStep[] = [
  { id: 'call_first', role: 'mentor', done: (s) => s.prediction !== null },
  { id: 'build_bench', role: 'mentor', focus: 'feed', done: (s) => piped(s, 6) },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },   // the printout does not exist until the bench has run: the step after the call is the key
  { id: 'read_printout', role: 'mentor', done: (s) => ['read_printout', 'why'].includes(s.ui.coachStep ?? '') },
];
void BENCH_COACH;

export const L04: LevelSpec = {
  id: 'L04', firstRun: true, chapter: 1, index: 4, setter: 'mentor', budgetUSD: BENCH_BUDGET, units: BENCH_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, BENCH_SPECIES, BENCH_UNITS, BENCH_PRESETS); sealSetup(s); },
  measures: benchMeasures,
  goals: (s, m) => {
    const a = notebookAnswer(s);
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'nh3', met: m.ok && relErr(m.v.nh3_kg_h!, a.nh3) <= NH3_TOL, ...(m.ok ? { value: m.v.nh3_kg_h, target: a.nh3 } : {}) },
      { key: 'left', met: m.ok && relErr(m.v.vent_h2!, a.h2left) <= NH3_TOL, ...(m.ok ? { value: m.v.vent_h2, target: a.h2left } : {}) },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, BENCH_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= BENCH_BUDGET, value: sp, target: BENCH_BUDGET }); }
    return g;
  },
  extraStars: (s) => {
    const p = predictionOf(s, 'nh3_kg_h'), a = notebookAnswer(s);
    return [p !== null && p.named === a.limiting, p !== null && relErr(p.value, a.nh3) <= NH3_TOL];
  },
  callIt: { key: 'nh3_kg_h', unit: 'kg/h', tol: NH3_TOL, truth: (s) => notebookAnswer(s).nh3, named: (s) => notebookAnswer(s).limiting },
  /** The target band is the answer the player is asked to predict: it is drawn only once the plant has run. */
  hero: (s, m) => { const a = notebookAnswer(s); return { key: 'nh3_kg_h', unit: 'kg/h', value: m.v.nh3_kg_h!, lo: m.ok ? a.nh3 * (1 - NH3_TOL) : 0, hi: m.ok ? a.nh3 * (1 + NH3_TOL) : 0 }; },
  secondary: (s, m) => ({ key: 'left_h2', unit: 'kmol/h', value: m.v.vent_h2!, limit: m.ok ? notebookAnswer(s).h2left * (1 + NH3_TOL) : 0 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const nh3 = g.find((x) => x.key === 'nh3')!, left = g.find((x) => x.key === 'left')!;
    return [
      { key: 'nh3', legend: t('lv.L04.ann.nh3'), state: !m.ok ? 'off' : nh3.met ? 'normal' : 'high' },
      { key: 'left', legend: t('lv.L04.ann.left'), state: !m.ok ? 'off' : left.met ? 'normal' : 'high' },
      { key: 'limit', legend: t('lv.L04.ann.limit'), state: !m.ok ? 'off' : m.v.vent_n2! < 1e-6 ? 'normal' : 'high' },
      { key: 'solve', legend: t('lv.L04.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L04.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH, bankSpecies: ['N2', 'H2'],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const a = notebookAnswer(s);
    return { key: 'off_build', cause: t('lv.L04.cause.off_build', { nh3: f(s, m.v.nh3_kg_h!), want: f(s, a.nh3), n2: f(s, m.v.n2_kg_h!), h2: f(s, m.v.h2_kg_h!), n2want: f(s, notebook(s).n2kg), h2want: f(s, notebook(s).h2kg) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.n2_fed! > 0 || m.v.h2_fed! > 0)) return null;
    const lim = shown(Math.min(m.v.n2_fed!, m.v.h2_fed! / 3));
    const M = shown(molarMass('NH3'));
    return `2 × ${f(s, lim)} × ${f(s, M)} = ${f(s, shown(2 * lim * M))} kg/h of NH₃`;
  },
  lessonVars: (s, m) => {
    const a = notebookAnswer(s), b = bookAnswer(s), dash = '—';
    return { nh3: m.ok ? f(s, m.v.nh3_kg_h!) : dash, left: m.ok ? f(s, m.v.vent_h2!) : dash, book: m.ok ? f(s, b.nh3) : dash, n2: f(s, a.n2kmol), h2: f(s, a.h2kmol), lim: a.limiting };
  },
  metrics: (s, m) => [
    { key: 'nh3_kg_h', unit: 'kg/h', value: m.v.nh3_kg_h! },
    { key: 'left_h2_kg_h', unit: 'kg/h', value: m.v.left_h2_kg_h! },
    { key: 'actions_used', unit: '', value: s.levelActions?.length ?? 0 },
  ],
  histogram: { metric: 'actions_used', best: () => 18, spread: 0.8, lowerIsBetter: true },
  card: (s, m): Record<string, string | number> => { if (!m.ok) return {}; const a = notebookAnswer(s), b = bookAnswer(s); return { book_nh3_kg_h: b.nh3, book_left_h2_kmol_h: b.h2left, oracle_nh3_kg_h: a.nh3, oracle_left_h2_kmol_h: a.h2left, limiting: a.limiting }; },
  solver: () => scripted([{ name: 'callIt', args: [notebookAnswer({ region: 'global' }).nh3, 'N2'] }, ...benchBuild(notebook({ region: 'global' }).n2kg, notebook({ region: 'global' }).h2kg)])(),
  /** The common slip: the notebook's tonnes typed as kmol/h (2000 kmol/h of N2 and 1000 kmol/h of H2). */
  naive: () => scripted(benchBuild(2000 * molarMass('N2'), 1000 * molarMass('H2')))(),
};
void unitsOfType;
