// CAREER_FIX_NH3_INERTS (F29, 0.8 "the plant behind the numbers"): the Career's "inerts in the ammonia loop feed" incident as a real plant. The L20 purge loop, pre-built and
// running at its old 1 % purge, now fed the Career's off-spec gas (inerts lumped as argon, the fraction the event drew) with the converter at the Career catalyst's approach to
// equilibrium (an aged catalyst behaves as if hotter: src/sim/career/incident.ts). The player re-tunes the purge and commissions. Too little purge and the argon swells the loop past
// the recycle compressor's rating (the loop chokes and the fresh gas is cut); too much and the purge vents hydrogen that would have been ammonia. The commissioned loop maps back
// to the Career as an output factor and a gas-per-tonne factor for the incident's months (`effectOf`), and the board's log says what was done.
// GO TO THE PLANT pre-loads the Career state with `levelAct('career', pre)` before the first commission; without it the level runs the default incident (3.5 % inerts, catalyst 80 %).
import type { Action, PersonaFactory } from '@core/kit';
import { fail } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { designActions } from '../engine/actions/design';
import { t } from '../i18n';
import {
  BEST_PURGE, CONTRACTOR_PURGE, INC_MONTHS, CONTRACTOR_USD, INERT_STEPS, OLD_PURGE, T_RX_K, approachK, effectOf, kwRated, optionLossUSD, statedLoop, type IncidentPre, type LoopResult,
} from '../sim/career/incident';
import type { EqState } from '../state';
import { DP_RX, LOOP_SPECIES, N2_FRESH, H2_FRESH, P_LOOP, T_RX, T_SEP, loopMeasures } from './l19';
import { L20_PRICES, buildLoop, type LoopIds } from './l20';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { commissions, frozenTruth, markPrebuilt, predictionOf, sealSetup, shown, unitsOfType } from './util';

type S = Readonly<EqState>;
export const FIX_ID = 'CAREER_FIX_NH3_INERTS';
/** The fix must bring the loop back to at least this share of the clean loop's ammonia (a purge wide open is not a fix). */
export const FIX_OUT_MIN = 0.85;
/** The default incident (no Career pre-load): 3.5 % inerts, catalyst at 80 %, the Career's opening prices for the ammonia plant. */
export const DEFAULT_PRE: IncidentPre = { id: 'nh3_inerts', m: 0, y: INERT_STEPS[3], k: 3, cat: 0.8, price: 480, gas: 6, outT: 25080, gjT: 33.6, varUSD: 15, capT: 30000, contractT: 0, months: INC_MONTHS, contractorUSD: CONTRACTOR_USD };
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const PRESETS = { eq_reactor: { reactions: 'R1', mode: 'isothermal', T: T_RX, dP: DP_RX }, cooler: { T: T_SEP, utility: 'refrig' }, flash: { T: T_SEP, P: P_LOOP - DP_RX }, compressor: { P: P_LOOP, stages: 1 } };

export const preOf = (s: S): IncidentPre => (s.lv.pre as IncidentPre | undefined) ?? DEFAULT_PRE;
const idsOf = (s: S): LoopIds | undefined => s.lv.ids as LoopIds | undefined;
/** Argon in the fresh gas (kmol/h) for an inert fraction `y` of the 1000 kmol/h of N2 + H2. */
export const arFresh = (y: number): number => (y * (N2_FRESH + H2_FRESH)) / (1 - y);

/** Put the incident on the plant: the nitrogen stream carries the argon, the converter sits at the catalyst's approach temperature. Also run before every commission, so the gas and the catalyst are the Career's whatever was edited. */
function applyPre(s: EqState): void {
  const pre = preOf(s), ids = idsOf(s);
  if (ids === undefined) return;
  const ar = arFresh(pre.y), tot = N2_FRESH + ar, x = s.species.map((sp) => (sp === 'N2' ? N2_FRESH / tot : sp === 'Ar' ? ar / tot : 0)), flow = (tot * 1000) / 3600;
  const fd = s.feeds[ids.feedN];
  if (fd !== undefined && (Math.abs(fd.flow - flow) > 1e-12 || fd.x.some((v, i) => Math.abs(v - x[i]!) > 1e-12) || fd.T !== 300 || fd.P !== P_LOOP)) designActions.setFeed!(s, ids.feedN, { x, flow, T: 300, P: P_LOOP });
  const rx = s.flowsheet.units.find((u) => u.id === ids.rx);
  if (rx !== undefined) rx.params.T = T_RX_K + approachK(pre.cat);
}
function validPre(p: unknown): IncidentPre | null {
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>, n = (k: string): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : NaN);
  const k = n('k');
  if (o.id !== 'nh3_inerts' || !Number.isInteger(k) || k < 0 || k >= INERT_STEPS.length || Math.abs(n('y') - INERT_STEPS[k]!) > 1e-9) return null;
  if (!(n('cat') >= 0.2 && n('cat') <= 1 && n('price') > 0 && n('gas') > 0 && n('outT') > 0 && n('gjT') > 0 && n('varUSD') >= 0 && n('capT') > 0 && n('contractT') >= 0 && n('months') >= 1 && n('contractorUSD') >= 0 && n('m') >= 0)) return null;
  return { id: 'nh3_inerts', m: n('m'), y: n('y'), k, cat: n('cat'), price: n('price'), gas: n('gas'), outT: n('outT'), gjT: n('gjT'), varUSD: n('varUSD'), capT: n('capT'), contractT: n('contractT'), months: n('months'), contractorUSD: n('contractorUSD') };
}

/** The commissioned loop as the Career reads it (null before a successful commission). */
export function loopResult(s: S, m: Measures = loopMeasures(s)): LoopResult | null {
  if (!m.ok) return null;
  return { purge: m.v.purge_pct! / 100, conv: m.v.conv_overall!, kw: m.v.shaft_kw!, ar: m.v.ar_in_pct! };
}
function measures(s: S): Measures {
  const m = loopMeasures(s), pre = preOf(s), r = loopResult(s, m);
  const con = effectOf(statedLoop('contractor', pre.k, pre.cat), pre.cat), ign = effectOf(statedLoop('ignore', pre.k, pre.cat), pre.cat);
  const e = r !== null ? effectOf(r, pre.cat) : { outF: 0, gasF: 0 };
  m.v.y_pct = pre.y * 100; m.v.cat_pct = pre.cat * 100; m.v.approach_k = approachK(pre.cat); m.v.kw_rated = kwRated(pre.cat); m.v.ar_fresh = arFresh(pre.y);
  m.v.out_pct = e.outF * 100; m.v.gas_pct = e.gasF * 100;
  m.v.loss_musd = r !== null ? optionLossUSD(pre, e, 'plant') / 1e6 : 0;
  m.v.contractor_musd = optionLossUSD(pre, con, 'contractor') / 1e6; m.v.ignore_musd = optionLossUSD(pre, ign, 'ignore') / 1e6;
  m.v.contractor_out = con.outF * 100; m.v.ignore_out = ign.outF * 100;
  return m;
}

const COACH: CoachStep[] = [
  { id: 'read', role: 'supervisor', done: (s) => predictionOf(s, 'ar_pct') !== null || commissions(s) > 0 || (unitsOfType(s, 'splitter')[0]?.params.frac as number | undefined) !== OLD_PURGE },
  { id: 'purge', role: 'supervisor', focus: 'splitter', done: (s) => (unitsOfType(s, 'splitter')[0]?.params.frac as number | undefined) !== OLD_PURGE || commissions(s) > 0 },
  { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => s.solved !== null && s.solved.ok },
  { id: 'compare', role: 'manager', done: (s) => ['compare', 'back'].includes(s.ui.coachStep ?? '') },
  { id: 'back', role: 'manager', done: (s) => (s.ui.coachStep ?? '') === 'back' },
];
const lit = (m: Measures, ok: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!m.ok ? 'off' : ok ? 'normal' : bad);
const code = (s: S): string => (s.solved !== null && !s.solved.ok ? s.solved.failure?.code ?? '' : '');
const m2 = (x: number): string => x.toFixed(2);

export const CAREER_FIX_NH3_INERTS: LevelSpec = {
  id: FIX_ID, firstRun: true, chapter: 11, index: 41, setter: 'supervisor', budgetUSD: 0, units: L20_PRICES, notes: 3, shiftLen: 0,
  setup: (s) => {
    baseLoop(s);
  },
  textVars: (s) => {
    const m = measures(s), pre = preOf(s);
    return { y: f(s, shown(pre.y * 100)), ar: f(s, shown(arFresh(pre.y))), cat: Math.round(pre.cat * 100), dT: f(s, shown(approachK(pre.cat))), rated: f(s, shown(kwRated(pre.cat))), old: f(s, OLD_PURGE * 100), months: pre.months,
      con: m2(m.v.contractor_musd!), conp: f(s, CONTRACTOR_PURGE * 100), cono: Math.round(m.v.contractor_out!), conusd: m2(pre.contractorUSD / 1e6), ign: m2(m.v.ignore_musd!), igno: Math.round(m.v.ignore_out!), month: Math.max(1, pre.m), price: Math.round(pre.price), gas: pre.gas.toFixed(2), min: Math.round(FIX_OUT_MIN * 100) };
  },
  measures,
  goals: (_s, m) => [
    { key: 'rating', met: m.ok && m.v.shaft_kw! <= m.v.kw_rated!, ...(m.ok ? { value: m.v.shaft_kw } : {}), target: m.v.kw_rated },
    { key: 'output', met: m.ok && m.v.out_pct! >= FIX_OUT_MIN * 100 - 1e-9, ...(m.ok ? { value: m.v.out_pct } : {}), target: FIX_OUT_MIN * 100 },
  ],
  extraStars: (s, m) => {
    const p = predictionOf(s, 'ar_pct');
    return [p !== null && m.ok && Math.abs(p.value - (frozenTruth(s, 'ar_pct') ?? m.v.ar_in_pct!)) <= 0.1 * Math.max(1e-9, frozenTruth(s, 'ar_pct') ?? m.v.ar_in_pct!), m.ok && m.v.loss_musd! < m.v.contractor_musd!];
  },
  callIt: { key: 'ar_pct', unit: '%', tol: 0.1, truth: (_s, m) => (m.ok ? m.v.ar_in_pct! : null), min: 0, max: 100 },
  hero: (_s, m) => ({ key: 'out_pct', unit: '%', value: m.v.out_pct!, lo: FIX_OUT_MIN * 100, hi: 100 }),
  secondary: (_s, m) => ({ key: 'shaft_kw', unit: 'kW', value: m.v.shaft_kw!, limit: m.v.kw_rated! }),
  annunciators: (s, m, g): Annunciator[] => [
    { key: 'choke', legend: t('lv.CAREER_FIX_NH3_INERTS.ann.choke'), state: code(s) === 'ACCUMULATION' ? 'critical' : lit(m, m.v.shaft_kw! <= m.v.kw_rated!, 'critical') },
    { key: 'ar', legend: t('lv.CAREER_FIX_NH3_INERTS.ann.ar'), state: lit(m, m.v.ar_in_pct! <= 30) },
    { key: 'h2', legend: t('lv.CAREER_FIX_NH3_INERTS.ann.h2'), state: lit(m, m.v.h2_lost_pct! <= 8) },
    { key: 'out', legend: t('lv.CAREER_FIX_NH3_INERTS.ann.out'), state: lit(m, g.find((x) => x.key === 'output')!.met) },
    { key: 'solve', legend: t('lv.CAREER_FIX_NH3_INERTS.ann.solve'), state: s.solved !== null && !s.solved.ok ? 'critical' : 'off' },
    { key: 'goal', legend: t('lv.CAREER_FIX_NH3_INERTS.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
  ],
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    if (m.v.shaft_kw! > m.v.kw_rated!) return { key: 'choke', cause: t('lv.CAREER_FIX_NH3_INERTS.cause.choke', { purge: f(s, m.v.purge_pct!), ar: f(s, m.v.ar_in_pct!), kw: f(s, m.v.shaft_kw!), rated: f(s, m.v.kw_rated!), loop: f(s, m.v.loop_kmol_h!) }) };
    return { key: 'vent', cause: t('lv.CAREER_FIX_NH3_INERTS.cause.vent', { purge: f(s, m.v.purge_pct!), h2: f(s, m.v.h2_lost_pct!), out: f(s, m.v.out_pct!), min: Math.round(FIX_OUT_MIN * 100) }) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.purge_kmol_h! > 0)) return null;
    const q = shown(m.v.purge_kmol_h!), y = shown(m.v.ar_purge_pct!);
    return `${f(s, q)} × ${f(s, y)} ÷ 100 = ${f(s, shown((q * y) / 100))} kmol/h of Ar out, against ${f(s, shown(m.v.ar_fed!))} in`;
  },
  lessonVars: (s, m) => ({ purge: f(s, m.v.purge_pct!), ar: f(s, m.v.ar_in_pct!), out: f(s, m.v.out_pct!), gas: f(s, m.v.gas_pct!), h2: f(s, m.v.h2_lost_pct!), kw: f(s, m.v.shaft_kw!), rated: f(s, m.v.kw_rated!), loss: m2(m.v.loss_musd!), con: m2(m.v.contractor_musd!), ign: m2(m.v.ignore_musd!), months: preOf(s).months }),
  metrics: (_s, m) => [
    { key: 'loss_musd', unit: 'MUSD', value: m.v.loss_musd! },
    { key: 'out_pct', unit: '%', value: m.v.out_pct! },
    { key: 'purge_pct', unit: '%', value: m.v.purge_pct! },
  ],
  histogram: null,
  card: (_s, m): Record<string, string | number> => (m.ok ? { contractor_musd: m.v.contractor_musd!, ignore_musd: m.v.ignore_musd!, ar_in_pct: m.v.ar_in_pct! } : {}),
  beforeCommission: (s) => applyPre(s),
  actions: {
    /** GO TO THE PLANT: the Career's incident state (inerts, catalyst, prices). Only on a fresh plant, before the first commission. */
    career: (s, pre) => {
      if (commissions(s) > 0 || s.phase !== 'design') fail(t('lv.err.fix_loaded'));
      const p = validPre(pre);
      if (p === null) fail(t('lv.err.fix_pre'));
      s.lv.pre = p; s.lv.fromCareer = 1; applyPre(s); sealSetup(s);
    },
  },
  view: (s) => {
    const pre = preOf(s), r = loopResult(s), m = measures(s);
    return {
      kind: '', incident: pre.id, fromCareer: s.lv.fromCareer === 1, pre,
      /** what GO BACK TO THE CAREER hands to the Career (`incidentFix`): the loop as commissioned, with the gas, catalyst and month it was run for */
      fix: r !== null && s.status === 'won' ? { ...r, y: pre.y, cat: pre.cat, m: pre.m } : null,
      result: r !== null ? { ...r, outPct: m.v.out_pct, gasPct: m.v.gas_pct, lossMUSD: m.v.loss_musd } : null,
      options: { contractorMUSD: m.v.contractor_musd, ignoreMUSD: m.v.ignore_musd, contractorOut: m.v.contractor_out, ignoreOut: m.v.ignore_out },
    };
  },
  solver: ((): (s: S) => Action[] => { let done = false; return (s: S) => { if (done || s.status !== 'playing') return []; done = true; return fixScript(BEST_PURGE[preOf(s).k]!); }; }) as unknown as PersonaFactory<EqState>,
  naive: ((): (s: S) => Action[] => { let done = false; return () => { if (done) return []; done = true; return fixScript(OLD_PURGE); }; }) as unknown as PersonaFactory<EqState>,
};
function baseLoop(s: EqState): void {
  s.species = LOOP_SPECIES.slice(); s.palette = []; s.limits = {}; s.presets = structuredClone(PRESETS);
  s.lv.ids = buildLoop(s, false, OLD_PURGE);
  markPrebuilt(s);   // the loop that stands at the start is the Career's own plant: nothing is spent until the player adds a part
  applyPre(s); sealSetup(s);
}
/** The player's play on the pre-built loop: set the purge (the splitter is X-108, as in L20), commission. */
export function fixScript(purge: number, split = 'X-108'): Action[] {
  return [{ name: 'setParam', args: [split, 'frac', purge] }, { name: 'commission' }];
}
