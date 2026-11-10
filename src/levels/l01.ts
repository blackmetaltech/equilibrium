// L01 · Moles, Not Kilograms (DESIGN 2.6; DEPTH "Chapter 1 enrichment": the feeds are cylinder banks metered in kg/h, the card also shows kmol/h).
// The bench ammonia plant of bench.ts; the player builds it. Goal: 10 kmol/h of NH3 (170.3 kg/h, 1 %) with at most 1 % of the feed vented.
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { BENCH_BUDGET, BENCH_COACH, BENCH_PRESETS, BENCH_SPECIES, BENCH_UNITS, benchBuild, benchMeasures, scripted } from './bench';
import type { Annunciator, LevelSpec } from './spec';
import { baseSetup, molarMass, predictionOf, pricePerKg, relErr, sealSetup, shown, spentOf } from './util';

/** DESIGN: 10 kmol/h of NH3. Everything else follows from it and the catalogue molar masses. */
export const L01_NH3_KMOL_H = 10;
export const L01_NH3_KG_H = L01_NH3_KMOL_H * molarMass('NH3');
/** H2 the job needs, kg/h: 3 H2 per 2 NH3 (the Call-it oracle, 30.24). */
export const L01_H2_KG_H = 1.5 * L01_NH3_KMOL_H * molarMass('H2');
export const L01_N2_KG_H = 0.5 * L01_NH3_KMOL_H * molarMass('N2');
export const NH3_TOL = 0.01;
export const VENT_TOL = 0.01;
export const VENT_TOL_STAR = 0.001;
/** The reference build (DESIGN: N2 140.1 kg/h, H2 30.24 kg/h). */
const REF_N2 = 140.1, REF_H2 = 30.24;
/** The mistake DESIGN names: 1:3 by MASS (42.6 kg/h of N2 and 127.7 kg/h of H2). */
const MASS_N2 = 42.6, MASS_H2 = 127.7;

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

export const L01: LevelSpec = {
  id: 'L01', chapter: 1, index: 1, setter: 'mentor', budgetUSD: BENCH_BUDGET, units: BENCH_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, BENCH_SPECIES, BENCH_UNITS, BENCH_PRESETS); sealSetup(s); },
  measures: benchMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'nh3', met: m.ok && relErr(m.v.nh3_kg_h!, L01_NH3_KG_H) <= NH3_TOL, ...(m.ok ? { value: m.v.nh3_kg_h } : {}), target: L01_NH3_KG_H },
      { key: 'vent', met: m.ok && m.v.vent_frac! <= VENT_TOL, ...(m.ok ? { value: m.v.vent_frac! * 100 } : {}), target: VENT_TOL * 100 },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, BENCH_UNITS); g.push({ key: 'budget', met: sp <= BENCH_BUDGET, value: sp, target: BENCH_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.vent_frac! <= VENT_TOL_STAR, predictionOf(s, 'h2_kg_h') !== null && relErr(predictionOf(s, 'h2_kg_h')!.value, L01_H2_KG_H) <= NH3_TOL],
  callIt: { key: 'h2_kg_h', unit: 'kg/h', tol: NH3_TOL, truth: () => L01_H2_KG_H },
  hero: (_s, m) => ({ key: 'nh3_kmol_h', unit: 'kmol/h', value: m.v.nh3_kmol_h!, lo: L01_NH3_KMOL_H * (1 - NH3_TOL), hi: L01_NH3_KMOL_H * (1 + NH3_TOL) }),
  secondary: (_s, m) => ({ key: 'vent_pct', unit: '%', value: m.v.vent_frac! * 100, limit: VENT_TOL * 100 }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const lit = (met: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : met ? 'normal' : bad);
    const nh3 = g.find((x) => x.key === 'nh3')!, vent = g.find((x) => x.key === 'vent')!;
    const ratioOk = m.v.n2_fed! > 0 && relErr(m.v.ratio!, 3) <= 0.01;
    return [
      { key: 'vent', legend: t('lv.L01.ann.vent'), state: lit(vent.met, m.v.vent_frac! > 0.1 ? 'critical' : 'high') },
      { key: 'nh3', legend: t('lv.L01.ann.nh3'), state: lit(nh3.met) },
      { key: 'ratio', legend: t('lv.L01.ann.ratio'), state: m.v.n2_fed! + m.v.h2_fed! > 0 ? (ratioOk ? 'normal' : 'high') : 'off' },
      { key: 'solve', legend: t('lv.L01.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L01.ann.goal'), state: m.ok ? (g.every((x) => x.met) ? 'normal' : 'off') : 'off' },
    ];
  },
  coach: BENCH_COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    const need = shown(3 * shown(m.v.n2_fed!));
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.vent_frac! > VENT_TOL) {
      return m.v.limiting === 0
        ? { key: 'vent_h2', cause: t('lv.L01.cause.vent_h2', { h2: f(s, m.v.h2_fed!), n2: f(s, m.v.n2_fed!), need: f(s, need), left: f(s, m.v.vent_h2!) }) }
        : { key: 'vent_n2', cause: t('lv.L01.cause.vent_n2', { h2: f(s, m.v.h2_fed!), n2: f(s, m.v.n2_fed!), left: f(s, m.v.vent_n2!) }) };
    }
    return { key: 'off_target', cause: t('lv.L01.cause.off_target', { nh3: f(s, m.v.nh3_kmol_h!), want: f(s, L01_NH3_KMOL_H) }) };
  },
  equation: (s, m) => {
    if (!(m.v.n2_fed! > 0)) return null;
    const n2 = shown(m.v.n2_fed!);
    return `3 × ${f(s, n2)} = ${f(s, shown(3 * n2))} kmol/h of H₂`;
  },
  lessonVars: (s, m) => ({ n2: f(s, m.v.n2_fed!), h2: f(s, m.v.h2_fed!), ratio: f(s, m.v.ratio!), n2kg: f(s, m.v.n2_kg_h!), h2kg: f(s, m.v.h2_kg_h!), nh3: f(s, m.v.nh3_kmol_h!) }),
  metrics: (s, m) => [
    { key: 'feed_cost', unit: 'USD/h', value: m.v.feed_cost! },
    { key: 'vented_kg_h', unit: 'kg/h', value: m.v.vent_kg_h! },
    { key: 'actions_used', unit: '', value: s.levelActions?.length ?? 0 },
  ],
  histogram: { metric: 'feed_cost', best: (s) => L01_H2_KG_H * pricePerKg(s, 'hydrogen'), spread: 0.6, lowerIsBetter: true },
  solver: scripted([{ name: 'callIt', args: [L01_H2_KG_H] }, ...benchBuild(REF_N2, REF_H2)]),
  naive: scripted(benchBuild(MASS_N2, MASS_H2)),
};
