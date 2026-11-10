// L15 · Rate vs Ceiling (DESIGN 2.6 Chapter 4, the hook level). One adiabatic bed of promoted iron (K1 Temkin-Pyzhev, 200 bar), a fixed catalyst load, a feed
// preheater the player places. Goal: 10.0 mol % NH3 at the bed outlet with no catalyst above 550 C. The inlet temperature has an INTERIOR optimum: cold and the iron
// is too slow (rate-limited), hot and the equilibrium ceiling falls (equilibrium-limited). The shift (catalyst_age) moves that optimum up (tests sweep it).
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import type { EqState } from '../state';
import { readUnit, molPct, toC, C0, type BedRead } from './ch4_common';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, link, none, predictionOf, put, putFeed, relErr, sealSetup, shown, spentOf, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L15_SPECIES = ['N2', 'H2', 'NH3', 'Ar'];
/** Feed of the research script (docs/research/kinetics_haber.py, Dyson-Simon check), 100 kmol/h at 200 bar, 27 C. */
export const L15_FEED_X = { N2: 0.2328, H2: 0.6984, NH3: 0.03, Ar: 0.0388 };
export const L15_FEED_KMOL_H = 100;
export const L15_P = 2e7, L15_T_FEED = 300;
/** DESIGN: 0.8 L of catalyst per kmol/h of feed; the catalogue bulk density of fe_ammonia is 2500 kg/m3 (GAME), so 0.8 L = 2 kg per kmol/h. */
export const L15_RHO_B = 2500;
export const L15_W_KG = 0.8 * 1e-3 * L15_RHO_B * L15_FEED_KMOL_H;
export const L15_NH3_PCT = 10;
export const L15_TMAX_C = 550;
/** The catalyst window top of the catalogue (fe_ammonia): the over-temperature flag of the bed, deg C. */
export const L15_WINDOW_C = 520;
export const L15_LIGHTOFF_C = 380;
/** GAME: the third star needs this much NH3 at the outlet (about 95 % of the unconstrained best the research sweep finds, 11.13 % at 410 C). UNVERIFIED. */
export const L15_STAR3_PCT = 10.6;
export const L15_CALL_TOL = 0.003;   // EQ-CE-020 tolerance
export const L15_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 6000 }, heater: { max: 1, price: 18000 }, packed_bed: { max: 1, price: 90000 }, product: { max: 1, price: 5000 },
};
export const L15_BUDGET = 150000;
const PRESETS = { heater: { utility: 'fired', T: 673.15 } };
/** Reference inlet (the solver): deg C. Interior best of the sweep is 410 C; this one also keeps the bed inside the catalyst window. */
export const L15_REF_T_C = 395;
export const L15_NAIVE_T_C = 340;

export function bedMeasures(s: S): Measures {
  const bed = unitsOfType(s, 'packed_bed')[0];
  const w = bed && typeof bed.params.W === 'number' ? (bed.params.W as number) : 0;
  const heater = unitsOfType(s, 'heater')[0];
  const set = heater && typeof heater.params.T === 'number' ? (heater.params.T as number) : 0;
  const v: Record<string, number> = { w: w, w0: L15_W_KG, load_ok: Math.abs(w - L15_W_KG) < 1e-6 ? 1 : 0, set_c: set > 0 ? toC(set) : 0, in_c: 0, out_c: 0, tmax_c: 0, nh3_pct: 0, eta: 0, x: 0, xeq: 0, tad_k: 0, heater_kw: 0 };
  const rd: BedRead | undefined = readUnit(s, 'packed_bed');
  if (!rd || !rd.outlet || !rd.inlet) return { ok: false, v };
  v.in_c = toC(rd.inlet.T); v.out_c = toC(rd.outlet.T); v.tmax_c = toC(rd.info.Tmax ?? rd.outlet.T);
  v.nh3_pct = molPct(s, rd.outlet, 'NH3');
  v.eta = rd.info.eta ?? 0; v.x = rd.info.X ?? 0; v.xeq = rd.info.Xeq ?? 0;
  v.tad_k = rd.inlet.T + (rd.info.dTad ?? 0);
  v.heater_kw = (s.solved?.kpis.fired_duty_kw ?? 0);
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'place_heater', role: 'mentor', focus: 'heater', done: (s) => has(s, 'heater') },
  { id: 'pipe_up', role: 'mentor', done: (s) => s.flowsheet.streams.length >= 3 },
  { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_window', role: 'mentor', focus: 'packed_bed', done: LATE(['read_window', 'sweep', 'why']) },
  { id: 'sweep', role: 'mentor', done: (s) => commissions(s) >= 3 || LATE(['why'])(s) },
  { id: 'why', role: 'mentor', done: LATE(['why']) },
];

export function l15Build(s: S): Action[] {
  const heater = unitsOfType(s, 'heater')[0];
  return heater ? [] : [{ name: 'placeUnit', args: ['heater', 8, 6, 0] }];
}
/** The scripted player: place the preheater, pipe the line, set the inlet temperature, commission. */
export const l15Player = (tC: number) => (_seed?: number) => {
  let stage = 0;
  return (s: S, _ctx?: unknown): Action[] => {
    if (stage === 0) { stage = 1; return l15Build(s); }
    if (stage === 1) {
      stage = 2;
      const feed = unitsOfType(s, 'feed')[0]!, heat = unitsOfType(s, 'heater')[0]!, bed = unitsOfType(s, 'packed_bed')[0]!, prod = unitsOfType(s, 'product')[0]!;
      return [
        { name: 'setParam', args: [heat.id, 'T', tC + C0] },
        { name: 'connect', args: [feed.id, 'out', heat.id, 'in'] }, { name: 'connect', args: [heat.id, 'out', bed.id, 'in'] }, { name: 'connect', args: [bed.id, 'out', prod.id, 'in'] },
        { name: 'commission' },
      ];
    }
    return [];
  };
};

export const L15: LevelSpec = {
  id: 'L15', firstRun: true, chapter: 4, index: 15, setter: 'mentor', budgetUSD: L15_BUDGET, units: L15_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L15_SPECIES, L15_UNITS, PRESETS);
    putFeed(s, 0, 6, L15_FEED_X, L15_FEED_KMOL_H, L15_T_FEED, L15_P);
    const bed = put(s, 'packed_bed', 12, 4, { W: L15_W_KG, mode: 'adiabatic' });
    s.flowsheet.units.find((u) => u.id === bed)!.catalystId = 'fe_ammonia';
    put(s, 'product', 20, 6);
    sealSetup(s);
  },
  measures: bedMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'nh3', met: m.ok && m.v.nh3_pct! >= L15_NH3_PCT, ...(m.ok ? { value: m.v.nh3_pct } : {}), target: L15_NH3_PCT },
      { key: 'tmax', met: m.ok && m.v.tmax_c! <= L15_TMAX_C, ...(m.ok ? { value: m.v.tmax_c } : {}), target: L15_TMAX_C },
      { key: 'load', met: m.v.load_ok === 1, value: m.v.w!, target: L15_W_KG },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L15_UNITS); g.push({ key: 'budget', met: sp <= L15_BUDGET, value: sp, target: L15_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.tmax_c! <= L15_WINDOW_C, m.ok && m.v.nh3_pct! >= L15_STAR3_PCT],
  callIt: { key: 'tad_k', unit: 'K', tol: L15_CALL_TOL, truth: (_s, m) => (m.ok ? m.v.tad_k! : null) },
  hero: (_s, m) => ({ key: 'nh3_pct', unit: '%', value: m.v.nh3_pct!, lo: L15_NH3_PCT, hi: 11.7 }),
  secondary: (_s, m) => ({ key: 'tmax_c', unit: '°C', value: m.v.tmax_c!, limit: L15_TMAX_C }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'light', legend: t('lv.L15.ann.light'), state: !m.ok ? 'off' : m.v.in_c! < L15_LIGHTOFF_C ? 'high' : 'normal' },
      { key: 'bedhi', legend: t('lv.L15.ann.bedhi'), state: !m.ok ? 'off' : m.v.tmax_c! > L15_TMAX_C ? 'critical' : m.v.tmax_c! > L15_WINDOW_C ? 'high' : 'normal' },
      { key: 'ceil', legend: t('lv.L15.ann.ceil'), state: !m.ok ? 'off' : m.v.eta! >= 0.98 ? 'high' : 'normal' },
      { key: 'nh3', legend: t('lv.L15.ann.nh3'), state: !m.ok ? 'off' : m.v.nh3_pct! < L15_NH3_PCT ? 'high' : 'normal' },
      { key: 'load', legend: t('lv.L15.ann.load'), state: m.v.load_ok === 1 ? 'off' : 'critical' },
      { key: 'solve', legend: t('lv.L15.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L15.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { tin: f(s, m.v.in_c!), tout: f(s, m.v.out_c!), tmax: f(s, m.v.tmax_c!), y: f(s, m.v.nh3_pct!), want: f(s, L15_NH3_PCT), eta: f(s, m.v.eta! * 100), w: f(s, m.v.w!), w0: f(s, L15_W_KG), lim: f(s, L15_TMAX_C) };
    if (m.v.load_ok !== 1) return { key: 'load', cause: t('lv.L15.cause.load', vars) };
    if (m.v.nh3_pct! >= L15_NH3_PCT) return { key: 'over', cause: t('lv.L15.cause.over', vars) };
    return m.v.eta! < 0.9 ? { key: 'cold', cause: t('lv.L15.cause.cold', vars) } : { key: 'hot', cause: t('lv.L15.cause.hot', vars) };
  },
  equation: (s, m) => (m.ok && m.v.xeq! > 0 ? `${f(s, shown(m.v.x!))} ÷ ${f(s, shown(m.v.xeq!))} = ${f(s, shown(shown(m.v.x!) / shown(m.v.xeq!)))}` : null),
  lessonVars: (s, m) => ({ tin: f(s, m.v.in_c!), tout: f(s, m.v.out_c!), y: f(s, m.v.nh3_pct!), eta: f(s, m.v.eta! * 100), x: f(s, m.v.x!), xeq: f(s, m.v.xeq!), runs: commissions(s) }),
  metrics: (_s, m) => [
    { key: 'nh3_pct', unit: '%', value: m.v.nh3_pct! },
    { key: 'tmax_c', unit: '°C', value: m.v.tmax_c! },
    { key: 'eta_pct', unit: '%', value: m.v.eta! * 100 },
  ],
  histogram: { metric: 'nh3_pct', best: () => 11.13, spread: 0.06, lowerIsBetter: false },
  solver: l15Player(L15_REF_T_C),
  naive: l15Player(L15_NAIVE_T_C),
};
void none; void link; void predictionOf; void relErr;
