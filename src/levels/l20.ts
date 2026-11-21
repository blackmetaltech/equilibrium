// L20 · The Purge (DESIGN 2.6; exam bridge, oracle EQ-CE-006 x 10). The L19 loop again, now with a real flash at -20 C and a nitrogen cylinder that carries 3 kmol/h of
// argon. The loop is pre-built (like L00's) with the purge splitter shut: commissioning it as it stands gives NO_EXIT before a single pass. The player opens the
// purge and finds the balance: Ar in = Ar out. Part A is the Call-it (the textbook Ar mol % at the reactor inlet with a fixed 25 % conversion and a 5 % purge);
// Part B is the plant. Goals: >= 8.0 t/h of NH3 with at most 10 % argon in the converter feed. The $/t star is the calibrated best.
import type { Action } from '@core/kit';
import oracleFile from '../oracle/oracles.json';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import type { EqState } from '../state';
import { scripted } from './bench';
import { DP_RX, LOOP_SPECIES, N2_FRESH, AR_FRESH, H2_FRESH, P_LOOP, T_CW, T_RX, T_SEP, loopMeasures, outStream } from './l19';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, link, predictionOf, put, putFeed, sealSetup, shown, spentOf, unitsOfType } from './util';
import { costStarPerT, refCostPerT } from './refdesigns';

type S = Readonly<EqState>;
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const oracle = (oracleFile.oracles as unknown as { id: string; expected: Record<string, number> }[]).find((o) => o.id === 'EQ-CE-006')!;
/** Part A answer: Ar mol % at the reactor inlet (oracle EQ-CE-006: 1.69 %, the bridge numbers scaled x 10 change nothing). */
export const L20_PART_A_PCT = oracle.expected.y_Ar_reactor_inlet! * 100;
export const AR_MAX_PCT = 10, NH3_MIN_T_H = 8.0;
/** The reference purge of the solver and its calibrated cost per tonne (GAME, from the engine at 1 % purge; UNVERIFIED). */
export const L20_REF = { purge: 0.01, cost: 350.91 };
/** Star-3 cost line in the player's region: 1.03 x the reference design priced there (refdesigns.ts). L20_REF.cost is its global value, re-checked by tests. */
export const L20_COST_MAX = (s: { region: string }): number => costStarPerT(s, 'L20');
export const P_RX_OUT = P_LOOP - DP_RX;

const PRESETS = { eq_reactor: { reactions: 'R1', mode: 'isothermal', T: T_RX, dP: DP_RX }, cooler: { T: T_SEP, utility: 'refrig' }, flash: { T: T_SEP, P: P_RX_OUT }, compressor: { P: P_LOOP, stages: 1 } };
const UNITS: LevelSpec['units'] = {};
/** Bench prices (GAME, UNVERIFIED) of the pre-built loop: the notebook's budget is the plant the player runs (nothing is bought in this level). */
export const L20_PRICES: LevelSpec['units'] = {
  feed: { max: 2, price: 6000 }, mixer3: { max: 1, price: 4000 }, eq_reactor: { max: 1, price: 40000 }, cooler: { max: 2, price: 8000 }, flash: { max: 1, price: 14000 },
  splitter: { max: 1, price: 2500 }, compressor: { max: 1, price: 30000 }, product: { max: 1, price: 5000 }, vent: { max: 1, price: 1500 },
};
export const L20_BUDGET = 150000;

export interface LoopIds { feedN: string; feedH: string; mix: string; rx: string; cw: string; chill?: string; flash?: string; split: string; comp: string; prod?: string; vent: string }

/** Build the loop with the engine's own actions (so ids and rules are the player's). `open` leaves the chiller, flash and tank for the player (L21). Returns the ids. */
export function buildLoop(s: EqState, open: boolean, purge: number): LoopIds {
  s.palette = null;
  const feedN = putFeed(s, 0, 0, { N2: (N2_FRESH) / (N2_FRESH + AR_FRESH), Ar: AR_FRESH / (N2_FRESH + AR_FRESH) }, N2_FRESH + AR_FRESH, 300, P_LOOP);
  const feedH = putFeed(s, 0, 4, { H2: 1 }, H2_FRESH, 300, P_LOOP, 'hydrogen');
  const mix = put(s, 'mixer3', 4, 2), rx = put(s, 'eq_reactor', 8, 0, {});
  const cw = put(s, 'cooler', 13, 1, { T: T_CW, utility: 'cw' });
  let chill: string | undefined, flash: string | undefined, prod: string | undefined;
  if (!open) { chill = put(s, 'cooler', 16, 1, { T: T_SEP, utility: 'refrig' }); flash = put(s, 'flash', 19, 1, { T: T_SEP, P: P_RX_OUT }); }
  const split = put(s, 'splitter', 19, 6, { frac: purge }), comp = put(s, 'compressor', 12, 8, { P: P_LOOP, stages: 1 });
  if (!open) prod = put(s, 'product', 22, 1);
  const vent = put(s, 'vent', 19, 10);
  link(s, feedN, 'out', mix, 'in1'); link(s, feedH, 'out', mix, 'in2'); link(s, mix, 'out', rx, 'in'); link(s, rx, 'out', cw, 'in');
  if (!open) { link(s, cw, 'out', chill!, 'in'); link(s, chill!, 'out', flash!, 'in'); link(s, flash!, 'vap', split, 'in'); link(s, flash!, 'liq', prod!, 'in'); }
  link(s, split, 'purge', vent, 'in'); link(s, split, 'out', comp, 'in'); link(s, comp, 'out', mix, 'in3');
  s.palette = [];
  sealSetup(s);
  return { feedN, feedH, mix, rx, cw, ...(chill ? { chill } : {}), ...(flash ? { flash } : {}), split, comp, ...(prod ? { prod } : {}), vent };
}

const COACH: CoachStep[] = [
  { id: 'call_first', role: 'supervisor', done: (s) => predictionOf(s, 'ar_pct') !== null || commissions(s) > 0 },
  { id: 'open_purge', role: 'supervisor', focus: 'splitter', done: (s) => (unitsOfType(s, 'splitter')[0]?.params.frac as number) > 0 },
  { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => s.solved !== null && s.solved.ok },
  { id: 'read_ar', role: 'supervisor', done: (s) => ['read_ar', 'why'].includes(s.ui.coachStep ?? '') },
  { id: 'why', role: 'supervisor', done: (s) => (s.ui.coachStep ?? '') === 'why' },
];

const code = (s: S): string => (s.solved !== null && !s.solved.ok ? s.solved.failure?.code ?? '' : '');
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);

export const L20: LevelSpec = {
  id: 'L20', firstRun: true, chapter: 5, index: 20, setter: 'supervisor', budgetUSD: L20_BUDGET, units: L20_PRICES, notes: 2, shiftLen: 0,
  setup: (s) => { baseSetup(s, LOOP_SPECIES, UNITS, PRESETS); buildLoop(s, false, 0); },
  measures: loopMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'nh3', met: m.ok && m.v.nh3_t_h! >= NH3_MIN_T_H, ...(m.ok ? { value: m.v.nh3_t_h } : {}), target: NH3_MIN_T_H },
      { key: 'ar', met: m.ok && m.v.ar_in_pct! <= AR_MAX_PCT, ...(m.ok ? { value: m.v.ar_in_pct } : {}), target: AR_MAX_PCT },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L20_PRICES); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L20_BUDGET, value: sp, target: L20_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => {
    const p = predictionOf(s, 'ar_pct');
    return [p !== null && Math.abs(p.value - L20_PART_A_PCT) / L20_PART_A_PCT <= 0.005, m.ok && m.v.cost_per_t! <= L20_COST_MAX(s)];
  },
  callIt: { key: 'ar_pct', unit: '%', tol: 0.005, truth: () => L20_PART_A_PCT },
  hero: (_s, m) => ({ key: 'nh3_t_h', unit: 't/h', value: m.v.nh3_t_h!, lo: NH3_MIN_T_H, hi: 9 }),
  secondary: (_s, m) => ({ key: 'ar_in_pct', unit: '%', value: m.v.ar_in_pct!, limit: AR_MAX_PCT }),
  annunciators: (s, m, g): Annunciator[] => [
    { key: 'exit', legend: t('lv.L20.ann.exit'), state: code(s) === 'NO_EXIT' ? 'critical' : 'off' },
    { key: 'accum', legend: t('lv.L20.ann.accum'), state: code(s) === 'ACCUMULATION' ? 'critical' : lit(m, m.v.ar_in_pct! <= AR_MAX_PCT, m.v.ar_in_pct! > 15 ? 'critical' : 'high') },
    { key: 'h2', legend: t('lv.L20.ann.h2'), state: lit(m, m.v.h2_lost_pct! <= 5, m.v.h2_lost_pct! > 10 ? 'critical' : 'high') },
    { key: 'nh3', legend: t('lv.L20.ann.nh3'), state: lit(m, g.find((x) => x.key === 'nh3')!.met) },
    { key: 'solve', legend: t('lv.L20.ann.solve'), state: s.solved !== null && !s.solved.ok ? 'critical' : 'off' },
    { key: 'goal', legend: t('lv.L20.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
  ],
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.ar_in_pct! > AR_MAX_PCT) return { key: 'ar_high', cause: t('lv.L20.cause.ar_high', { purge: f(s, m.v.purge_pct!), ar: f(s, m.v.ar_in_pct!), max: f(s, AR_MAX_PCT), loop: f(s, m.v.loop_kmol_h!) }) };
    return { key: 'short', cause: t('lv.L20.cause.short', { purge: f(s, m.v.purge_pct!), nh3: f(s, m.v.nh3_t_h!), want: f(s, NH3_MIN_T_H), h2: f(s, m.v.h2_lost_pct!) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.purge_kmol_h! > 0)) return null;
    const q = shown(m.v.purge_kmol_h!), y = shown(m.v.ar_purge_pct!);
    return `${f(s, q)} × ${f(s, y)} ÷ 100 = ${f(s, shown((q * y) / 100))} kmol/h of Ar out, against ${f(s, m.v.ar_fed!)} in`;
  },
  lessonVars: (s, m) => ({ purge: f(s, m.v.purge_pct!), ar: f(s, m.v.ar_in_pct!), arfed: f(s, m.v.ar_fed!), loop: f(s, m.v.loop_kmol_h!), h2: f(s, m.v.h2_lost_pct!), nh3: f(s, m.v.nh3_t_h!), bridge: f(s, L20_PART_A_PCT) }),
  metrics: (_s, m) => [
    { key: 'cost_per_t', unit: 'USD/t', value: m.v.cost_per_t! },
    { key: 'purge_pct', unit: '%', value: m.v.purge_pct! },
    { key: 'h2_lost_pct', unit: '%', value: m.v.h2_lost_pct! },
  ],
  histogram: { metric: 'cost_per_t', best: (s) => refCostPerT(s, 'L20'), spread: 0.06, lowerIsBetter: true },
  card: (s, m): Record<string, string | number> => (m.ok ? { bridge_ar_pct: L20_PART_A_PCT, ar_in_pct: m.v.ar_in_pct!, loop_kmol_h: m.v.loop_kmol_h! } : {}),
  solver: () => scripted(purgeScript(L20_REF.purge, true))(),
  naive: () => scripted(purgeScript(0, false))(),
};

/** The player's play: Call it (Part A), open the purge, commission. The splitter is X-108 in the pre-built loop (placement order in `buildLoop`). */
export function purgeScript(frac: number, callIt: boolean, split = 'X-108'): Action[] {
  const a: Action[] = [];
  if (callIt) a.push({ name: 'callIt', args: [L20_PART_A_PCT] });
  if (frac > 0) a.push({ name: 'setParam', args: [split, 'frac', frac] });
  a.push({ name: 'commission' });
  return a;
}
void outStream;
