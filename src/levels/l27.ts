// L27 · Blocked Outlet (DESIGN 2.6 chapter 6). A gas drum at 25 bar(g) receives 20 t/h of natural gas (methane, 40 C); its outlet valve has stuck shut, so the
// whole feed is the credible relieving load. The pre-built plant is feed -> drum -> splitter (all to the relief leg, none to the shut outlet) -> vent (the shut
// outlet) and tank (drum liquid, none). The player places the relief valve on the relief leg, sets its set pressure (at or below the 30 bar(g) design pressure,
// at least 10 % over the operating pressure) and the API 526 orifice letter, and commissions. The unit (API 520 critical-flow gas capacity, 10 % overpressure)
// reports its capacity against the load. Stars: smallest adequate letter; Call it: the required area for this case, within 3 %.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { ORIFICE_LETTERS, ORIFICE_MM2 } from '../data/vle';
import { t } from '../i18n';
import { cpFlow, makeMixture, massFlow, molarMass as mixM } from '../sim/thermo';
import { R_GAS } from '../sim/thermo/shomate';
import { reliefArea, selectOrifice } from '../sim/units/relief';
import type { EqState } from '../state';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, fromKgH, link, put, putFeed, relErr, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';
import { scripted } from './bench';

type S = Readonly<EqState>;
export const L27_SPECIES = ['CH4'];
const BAR = 1e5, ATM = 101325;
/** Design, operating and the 20 t/h of the case, bar(g). */
export const L27_DESIGN_BARG = 30, L27_OPER_BARG = 25, L27_LOAD_T_H = 20, L27_T_K = 313.15;
export const L27_DESIGN_PA = L27_DESIGN_BARG * BAR + ATM, L27_OPER_PA = L27_OPER_BARG * BAR + ATM;
/** The set pressure of the reference: at the design pressure. */
export const L27_PSET_REF = L27_DESIGN_PA;
export const L27_CALL_TOL = 0.03;
/** DESIGN 2.6: the pressure of a drum hit by a closed outlet may not exceed 110 % of design. */
export const L27_ACCUM = 1.1;
/** Containment is lost beyond 1.5 x design (DESIGN 5.5): an undersized valve is shown climbing to there at most. */
const L27_LOSS_PA = 1.5 * L27_DESIGN_PA;
/** 110 % of the design pressure, bar(g) (absolute pressures scaled, as the API accumulation is). */
export const L27_ALLOW_BARG = (L27_DESIGN_PA * 1.1 - ATM) / BAR;
export const L27_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 4000 }, flash: { max: 1, price: 30000 }, splitter: { max: 1, price: 2000 }, relief: { max: 1, price: 9000 }, vent: { max: 1, price: 1500 }, product: { max: 1, price: 4000 },
};
export const L27_BUDGET = 80000;
const HOLDUP_S = 60;
const ids = { feed: 'F-101', drum: 'D-102', split: 'X-103', vent: 'Y-104', tank: 'T-105', relief: 'R-110' };

const feedState = () => ({ n: [fromKgH(L27_LOAD_T_H * 1000, 'CH4')], T: L27_T_K, P: L27_OPER_PA });
/** Required effective area (mm2) for the case at set pressure `Pset`, the engine's API 520 function on the real stream (the Call-it truth and the unit's own number). */
export function l27Required(Pset: number, overpressure = 0.1): number {
  const st = feedState(), mx = makeMixture(L27_SPECIES), tot = st.n[0]!;
  const M = mixM(mx, st.n) * 1000, cp = cpFlow(mx, st.n, st.T) / tot, k = cp / (cp - R_GAS), W = massFlow(mx, st.n) * 3600;
  return reliefArea(W, (Pset * (1 + overpressure)) / 1000, st.T, 1, M, k);
}
export const l27SmallestLetter = (Pset: number): string => selectOrifice(l27Required(Pset)) ?? '-';

export function reliefMeasures(s: S): Measures {
  const rv = unitsOfType(s, 'relief')[0];
  const mol = fromKgH(L27_LOAD_T_H * 1000, 'CH4');
  const V = (mol * R_GAS * L27_T_K * HOLDUP_S) / L27_OPER_PA;
  const v: Record<string, number> = {
    load_kg_h: L27_LOAD_T_H * 1000, cap_kg_h: 0, req_mm2: 0, area_mm2: 0, pset_barg: 0, design_barg: L27_DESIGN_BARG, oper_barg: L27_OPER_BARG, placed: rv ? 1 : 0, ratio: 0, peak_barg: 0,
    letter_ok: 0, smallest_idx: -1, letter_idx: -1, rise_pa_s: (mol * R_GAS * L27_T_K) / V, vol_m3: V, mol_s: mol, ref_mm2: l27Required(L27_PSET_REF), pset_ok: 0, open_leg: 0, tmin_s: 0,
  };
  if (rv) {
    const ps = typeof rv.params.Pset === 'number' ? rv.params.Pset : 2e6;
    v.pset_barg = (ps - ATM) / BAR;
    v.area_mm2 = ORIFICE_MM2[String(rv.params.orifice ?? 'D')] ?? 0;
    v.letter_idx = ORIFICE_LETTERS.indexOf(String(rv.params.orifice ?? 'D'));
    v.pset_ok = ps <= L27_DESIGN_PA + 1 && ps >= L27_OPER_PA * 1.1 - 1 ? 1 : 0;
    v.req_mm2 = l27Required(ps);
    const sm = selectOrifice(v.req_mm2);
    v.smallest_idx = sm === null ? -1 : ORIFICE_LETTERS.indexOf(sm);
    v.tmin_s = Math.max(0, ((ps - L27_OPER_PA) / v.rise_pa_s));
  }
  if (s.solved === null || !s.solved.ok || !rv) return { ok: false, v };
  const info = s.solved.units[rv.id]?.info ?? {};
  v.cap_kg_h = info.capacity_kg_h ?? 0;
  v.req_mm2 = info.required_area_mm2 ?? v.req_mm2;
  v.ratio = v.cap_kg_h / v.load_kg_h;
  v.letter_ok = v.cap_kg_h >= v.load_kg_h ? 1 : 0;
  // pressure the drum climbs to with this valve: capacity short of the load leaves the surplus to build pressure (ideal gas, V = 60 s hold-up): the relieving
  // pressure is Pset x 1.1 when the valve passes the load, and runs past it as the area falls short (capacity is linear in the absolute pressure).
  const pRel = v.letter_ok === 1 ? (rv.params.Pset as number) * 1.1 : Math.min(L27_LOSS_PA, ((rv.params.Pset as number) * 1.1) / Math.max(v.ratio, 0.05));
  v.peak_barg = (pRel - ATM) / BAR;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

export const L27: LevelSpec = {
  id: 'L27', firstRun: false, chapter: 6, index: 27, setter: 'supervisor', budgetUSD: L27_BUDGET, units: L27_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L27_SPECIES, L27_UNITS, {});
    const fd = putFeed(s, 0, 4, { CH4: 1 }, toKmolH(fromKgH(L27_LOAD_T_H * 1000, 'CH4')), L27_T_K, L27_OPER_PA);
    const d = put(s, 'flash', 4, 4, { T: L27_T_K, P: L27_OPER_PA }), x = put(s, 'splitter', 8, 4, { frac: 1 }), y = put(s, 'vent', 12, 8), tk = put(s, 'product', 8, 8);
    if (fd !== ids.feed || d !== ids.drum || x !== ids.split || y !== ids.vent || tk !== ids.tank) throw new Error('level setup: L27 ids moved ' + [fd, d, x, y, tk].join(','));
    link(s, fd, 'out', d, 'in'); link(s, d, 'vap', x, 'in'); link(s, d, 'liq', tk, 'in'); link(s, x, 'out', y, 'in');
    sealSetup(s);
  },
  measures: reliefMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'capacity', met: m.ok && m.v.letter_ok === 1, ...(m.ok ? { value: m.v.cap_kg_h! / 1000 } : {}), target: L27_LOAD_T_H },
      { key: 'pset', met: m.v.placed === 1 && m.v.pset_ok === 1, ...(m.v.placed === 1 ? { value: m.v.pset_barg } : {}), target: L27_DESIGN_BARG },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L27_UNITS); g.push({ key: 'budget', met: sp <= L27_BUDGET, value: sp, target: L27_BUDGET }); }
    return g;
  },
  extraStars: (s, m) => [m.ok && m.v.letter_ok === 1 && m.v.letter_idx === m.v.smallest_idx, m.ok && m.v.letter_ok === 1 && predictionOf27(s)],
  callIt: { key: 'area_mm2', unit: 'mm²', tol: L27_CALL_TOL, truth: () => l27Required(L27_PSET_REF) },
  hero: (_s, m) => ({ key: 'capacity_t_h', unit: 't/h', value: m.v.cap_kg_h! / 1000, lo: L27_LOAD_T_H, hi: L27_LOAD_T_H * 2 }),
  secondary: (_s, m) => ({ key: 'peak_barg', unit: 'bar(g)', value: m.ok ? Math.min(m.v.peak_barg!, 999) : 0, limit: L27_ALLOW_BARG }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    const lit = (cond: boolean, st: Annunciator['state']): Annunciator['state'] => (!m.ok ? 'off' : cond ? st : 'normal');
    return [
      { key: 'under', legend: t('lv.L27.ann.under'), state: lit(m.v.letter_ok === 0, 'critical') },
      { key: 'hi', legend: t('lv.L27.ann.hi'), state: lit(m.v.peak_barg! > L27_ALLOW_BARG + 1e-6, 'critical') },
      { key: 'pset', legend: t('lv.L27.ann.pset'), state: m.v.placed === 1 ? (m.v.pset_ok === 1 ? 'normal' : 'high') : 'off' },
      { key: 'big', legend: t('lv.L27.ann.big'), state: lit(m.v.letter_ok === 1 && m.v.letter_idx! > m.v.smallest_idx!, 'high') },
      { key: 'solve', legend: t('lv.L27.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L27.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: [
    { id: 'place_relief', role: 'supervisor', focus: 'relief', done: (s) => unitsOfType(s, 'relief').length >= 1 },
    { id: 'pipe_relief', role: 'supervisor', done: (s) => s.flowsheet.streams.some((p) => p.to.unit.startsWith('R-')) },
    { id: 'set_pressure', role: 'supervisor', focus: 'relief', done: (s) => unitsOfType(s, 'relief').some((u) => typeof u.params.Pset === 'number' && u.params.Pset !== 2e6) },
    { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'read_capacity', role: 'supervisor', focus: 'relief', done: (s) => ['read_capacity', 'why'].includes(s.ui.coachStep ?? '') },
  ] as CoachStep[],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { letter: String(unitsOfType(s, 'relief')[0]?.params.orifice ?? 'D'), cap: f(s, m.v.cap_kg_h! / 1000), load: f(s, L27_LOAD_T_H), need: f(s, m.v.req_mm2!), have: f(s, m.v.area_mm2!), peak: f(s, Math.min(999, m.v.peak_barg!)), pset: f(s, m.v.pset_barg!), design: f(s, L27_DESIGN_BARG), oper: f(s, L27_OPER_BARG) };
    if (m.v.letter_ok === 0) return { key: 'under', cause: t('lv.L27.cause.under', vars) };
    return { key: 'pset', cause: t('lv.L27.cause.pset', vars) };
  },
  equation: (s, m) => {
    if (!(m.v.rise_pa_s! > 0)) return null;
    const R = shown(R_GAS), T = shown(L27_T_K), n = shown(m.v.mol_s!), V = shown(m.v.vol_m3!);
    return `${f(s, R)} × ${f(s, T)} × ${f(s, n)} ÷ ${f(s, V)} = ${f(s, shown((R * T * n) / V))} Pa/s of pressure rise`;
  },
  lessonVars: (s, m) => ({
    need: f(s, m.v.req_mm2! > 0 ? m.v.req_mm2! : m.v.ref_mm2!), rise: f(s, m.v.rise_pa_s! / 1000), letter: l27SmallestLetter(L27_PSET_REF), load: f(s, L27_LOAD_T_H), design: f(s, L27_DESIGN_BARG),
  }),
  metrics: (s, m) => [
    { key: 'orifice_mm2', unit: 'mm²', value: m.v.area_mm2! },
    { key: 'peak_barg', unit: 'bar(g)', value: Math.min(m.v.peak_barg!, 999) },
    { key: 'flare_t_h', unit: 't/h', value: m.v.letter_ok === 1 ? L27_LOAD_T_H : m.v.cap_kg_h! / 1000 },
  ],
  histogram: { metric: 'orifice_mm2', best: () => ORIFICE_MM2[l27SmallestLetter(L27_PSET_REF)]!, spread: 0.7, lowerIsBetter: true },
  card: (_s, m): Record<string, string | number> => (m.ok ? { required_mm2: m.v.req_mm2!, smallest_letter: l27SmallestLetter(L27_PSET_REF), capacity_t_h: m.v.cap_kg_h! / 1000 } : {}),
  solver: () => scripted(refBuild())(),
  naive: () => scripted(naiveBuild())(),
};
function predictionOf27(s: S): boolean {
  const p = s.prediction as { quantity: string; value: number } | null;
  return p !== null && p.quantity === 'area_mm2' && relErr(p.value, l27Required(L27_PSET_REF)) <= L27_CALL_TOL;
}

const buildRelief = (letter: string, pset: number | null): Action[] => [
  { name: 'placeUnit', args: ['relief', 12, 4, 0] }, { name: 'connect', args: [ids.split, 'purge', ids.relief, 'in'] },
  ...(pset === null ? [] : [{ name: 'setParam', args: [ids.relief, 'Pset', pset] }]), { name: 'setParam', args: [ids.relief, 'orifice', letter] },
  { name: 'commission' },
];
/** Reference: set at design pressure, the smallest adequate API 526 letter for the case. */
export const refBuild = (): Action[] => [{ name: 'callIt', args: [l27Required(L27_PSET_REF)] }, ...buildRelief(l27SmallestLetter(L27_PSET_REF), L27_PSET_REF)];
/** The novice leaves the valve at its defaults: orifice D, 20 bar abs set pressure (below the operating pressure). */
export const naiveBuild = (): Action[] => buildRelief('D', null);
