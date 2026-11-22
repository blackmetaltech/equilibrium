// L39 · Size the Line (DEPTH "Hydraulics", chapter 10): the game's first pump-and-line sizing job, the most common junior-engineer task.
//
// DESIGN (F30, 0.8)
// Scenario. 60 m3/h of 90 °C condensate goes from the vented collecting tank T-301 at grade (liquid 2 m above the pump centreline) to the deaerator D-302 on the boiler-house
//   deck, 14 m up, held at 0.35 bar g. Two pump positions: NEAR the tank (6 m suction, 125 m discharge) or FAR, at the foot of the boiler house (115 m suction, 16 m discharge).
//   Fittings as K values per leg (entrance, strainer, gate, elbows / check valve, gate, elbows, exit). The player picks a schedule-40 size for each leg (2"-8"), one of five
//   centrifugal pumps (quadratic H-Q, efficiency and NPSHr curves) and an impeller trim (75-100 %, affinity laws). Physics: src/sim/hydraulics (Colebrook, Darcy-Weisbach).
// Teaching beats. Velocity guide (discharge 1-3 m/s, suction at most 1.5 m/s); a small pipe means high velocity, a steep system curve and a big motor bill. Economic diameter:
//   annualised pipe + pump capital (US$ catalogue x the region's capexFx) against energy at the region's electricity price. The pump runs where the curves cross, not at its
//   nameplate: an over-sized pump over-delivers until it is trimmed. Cavitation: 90 °C condensate is 3.3 m of head from boiling; a long or small suction line eats it.
// Flow. Notes; Call-it: the head a pump would need on the fitter's old 2.5-inch line ("What you have": the data, never the head). Goals: >= 60 m3/h, velocities in the guide,
//   NPSH margin >= 1 m, operating point on the pump's catalogue curve (Engineer: installed cost within the budget). Stars: won; annual cost within 5 % of the economic optimum
//   (exhaustive search over every legal choice, per region); operating point at 70-110 % of the (trimmed) BEP flow. The printout names the failure in plain words.
import { need } from '@core/kit';
import { fmtNumber, pricesOf, toLocal } from '../engine/solved';
import { t } from '../i18n';
import { annualisedCapex } from '../sim/econ/capex';
import { OPERATING_HOURS } from '../sim/econ/kpi';
import { CONDENSATE_90C, EPS_STEEL, OLD_LINE_ID_MM, PIPES, PUMPS, type PipeSize } from '../sim/hydraulics/catalogue';
import { G, lineLoss, operatingPoint, pumpEta, pumpHead, pumpNpshr, pumpQZero, npshAvailable, staticHead, systemHead, velocity, type OperatingPoint, type Pump, type System } from '../sim/hydraulics/hydraulics';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, act, carrierSetup, edit, goalLamp, lit, mNone, playOnce } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, moneyText, predictionOf, solvedOk } from './util';

type S = Readonly<EqState>;
export const L39_Q = 60;                       // design flow, m3/h
export const L39_DZ = 14, L39_ZS = 2;           // lift tank surface -> deaerator, m; tank surface above the pump centreline, m
export const L39_P_ATM = 101325, L39_P_DEA = 101325 + 0.35e5;
export const L39_VD = [1, 3] as const, L39_VS_MAX = 1.5, L39_MARGIN = 1;
export const L39_BEP = [0.7, 1.1] as const;
export const L39_STAR_TOL = 0.05, L39_CALL_TOL = 0.05;
export const L39_MOTOR_ETA = 0.91;              // IE3 11 kW two-pole motor (IEC 60034-30-1: 91.2 %)
export const L39_TRIMS = { min: 75, max: 100 };
export const L39_BUDGET_USD = 70000;            // installed pipe + pump (Engineer), US$ like every level budget; shown in the pack's currency
/** The two pump positions: suction and discharge lengths (m) and K sums. Near: entrance 0.5 + strainer 1.0 + gate 0.17 + 2 elbows x 0.75 | check 2.0 + gate 0.17 + 8 elbows + exit 1.0. */
export const L39_PLACES = {
  near: { Ls: 6, Ks: 3.17, Ld: 125, Kd: 9.17 },
  far: { Ls: 115, Ks: 6.17, Ld: 16, Kd: 6.17 },
} as const;
export type Place = keyof typeof L39_PLACES;
export const L39_START = { suction: '3', discharge: '3', pump: 'P1', trim: 100, place: 'near' as Place };
export const L39_REF = { suction: '5', discharge: '4', pump: 'P2', trim: 93, place: 'near' as Place };

const pipeOf = (nps: string): PipeSize => PIPES.find((p) => p.nps === nps)!;
const pumpOf = (id: string): Pump => PUMPS.find((p) => p.id === id)!;
export interface Choice { suction: string; discharge: string; pump: string; trim: number; place: Place }
export function systemOf(c: Pick<Choice, 'suction' | 'discharge' | 'place'>): System {
  const g = L39_PLACES[c.place];
  return { fluid: CONDENSATE_90C, dz: L39_DZ, zs: L39_ZS, pSuction: L39_P_ATM, pDischarge: L39_P_DEA,
    suction: { D: pipeOf(c.suction).idMm / 1000, L: g.Ls, K: g.Ks, eps: EPS_STEEL }, discharge: { D: pipeOf(c.discharge).idMm / 1000, L: g.Ld, K: g.Kd, eps: EPS_STEEL } };
}
/** The Call-it line: the fitter's 2.5-inch line (ID 62.7 mm) for both legs, pump near the tank. */
export const L39_OLD: System = (() => { const g = L39_PLACES.near, D = OLD_LINE_ID_MM / 1000; return { ...systemOf({ suction: '4', discharge: '4', place: 'near' }), suction: { D, L: g.Ls, K: g.Ks, eps: EPS_STEEL }, discharge: { D, L: g.Ld, K: g.Kd, eps: EPS_STEEL } }; })();
export const L39_CALL_TRUTH = systemHead(L39_OLD, L39_Q / 3600);

export interface Eval {
  c: Choice; op: OperatingPoint; vs: number; vd: number; hfs: number; hfd: number; margin: number; bep: number; capexUsd: number; kWe: number;
  flowOk: boolean; velOk: boolean; npshOk: boolean; curveOk: boolean; feasible: boolean;
}
/** Region-independent physics of one choice. */
export function evaluate(c: Choice): Eval {
  const sys = systemOf(c), p = pumpOf(c.pump), tt = c.trim / 100, g = L39_PLACES[c.place];
  const op = operatingPoint(p, sys, tt), Q = op.Qh / 3600;
  const vs = velocity(Q, sys.suction.D), vd = velocity(Q, sys.discharge.D);
  const hfs = lineLoss(sys.suction, Q, sys.fluid).h, hfd = lineLoss(sys.discharge, Q, sys.fluid).h;
  const margin = op.npsha - op.npshr, bep = op.Qh / (p.qBep * tt);
  const capexUsd = g.Ls * pipeOf(c.suction).usdPerM + g.Ld * pipeOf(c.discharge).usdPerM + p.priceUsd;
  const flowOk = op.ok && op.Qh >= L39_Q, velOk = op.ok && vd >= L39_VD[0] && vd <= L39_VD[1] && vs <= L39_VS_MAX, npshOk = op.ok && margin >= L39_MARGIN, curveOk = op.ok && op.onCurve;
  return { c, op, vs, vd, hfs, hfd, margin, bep, capexUsd, kWe: op.kW / L39_MOTOR_ETA, flowOk, velOk, npshOk, curveOk, feasible: flowOk && velOk && npshOk && curveOk };
}
/** Annual cost in the pack's currency: annualised installed capital (US$ x capexFx) plus electricity for 8000 h. */
export function annualOf(s: { region: string }, e: Eval): { capexAnn: number; energy: number; total: number } {
  const capexAnn = annualisedCapex(toLocal(s, e.capexUsd)), energy = e.kWe * OPERATING_HOURS * pricesOf(s).electricity!.value;
  return { capexAnn, energy, total: capexAnn + energy };
}
/** Every legal choice whose velocity at the design flow can pass (necessary for a pass, since the flow must reach the design flow); physics memoised once. */
let feasibleMemo: Eval[] | null = null;
export function feasibleChoices(): Eval[] {
  if (feasibleMemo) return feasibleMemo;
  const out: Eval[] = [], q = L39_Q / 3600;
  for (const place of Object.keys(L39_PLACES) as Place[]) for (const ps of PIPES) for (const pd of PIPES) {
    if (velocity(q, ps.idMm / 1000) > L39_VS_MAX || velocity(q, pd.idMm / 1000) > L39_VD[1]) continue;
    for (const p of PUMPS) for (let tr = L39_TRIMS.min; tr <= L39_TRIMS.max; tr++) {
      const e = evaluate({ suction: ps.nps, discharge: pd.nps, pump: p.id, trim: tr, place });
      if (e.feasible) out.push(e);
    }
  }
  feasibleMemo = out;
  return out;
}
const optMemo = new Map<string, { e: Eval; total: number }>();
/** The economic optimum in this region (lowest annual cost over every feasible choice). */
export function optimumOf(s: { region: string }): { e: Eval; total: number } {
  const hit = optMemo.get(s.region); if (hit) return hit;
  let best: { e: Eval; total: number } | null = null;
  for (const e of feasibleChoices()) { const a = annualOf(s, e).total; if (best === null || a < best.total) best = { e, total: a }; }
  optMemo.set(s.region, best!);
  return best!;
}

const KEYS = ['q', 'qd', 'h', 'hs', 'vs', 'vd', 'hfs', 'hfd', 'npsha', 'npshr', 'margin', 'eta', 'kw', 'kwe', 'bep', 'annual', 'energy', 'capexAnn', 'capex', 'curve', 'reason', 'ref', 'shutoff', 'qmax', 'pct'];
const REASON = { '': 0, shutoff: 1, runout: 2, mincflow: 3 } as const;
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const choiceOf = (s: S): Choice => {
  const lv = s.lv as Record<string, unknown>;
  const str = (k: string, d: string) => (typeof lv[k] === 'string' ? (lv[k] as string) : d);
  return { suction: str('suction', L39_START.suction), discharge: str('discharge', L39_START.discharge), pump: str('pump', L39_START.pump), trim: typeof lv.trim === 'number' ? (lv.trim as number) : L39_START.trim, place: str('place', L39_START.place) as Place };
};
const evalOf = (s: S): Eval => evaluate(choiceOf(s));

function measures(s: S): Measures {
  const e = evalOf(s), p = pumpOf(e.c.pump), tt = e.c.trim / 100, sys = systemOf(e.c);
  const base = { qd: L39_Q, hs: staticHead(sys), ref: optimumOf(s).total, shutoff: pumpHead(p, 0, tt), qmax: p.qMax * tt };
  if (!solvedOk(s)) return mNone(KEYS, base);
  const a = annualOf(s, e);
  return { ok: true, v: { ...base, q: e.op.Qh, h: e.op.H, vs: e.vs, vd: e.vd, hfs: e.hfs, hfd: e.hfd, npsha: e.op.npsha, npshr: e.op.npshr, margin: e.margin, eta: e.op.eta, kw: e.op.kW, kwe: e.kWe, bep: e.bep,
    annual: a.total, energy: a.energy, capexAnn: a.capexAnn, capex: toLocal(s, e.capexUsd), curve: e.curveOk ? 1 : 0, reason: REASON[e.op.reason], pct: (100 * e.op.Qh) / L39_Q } };
}

const oneOf = <T extends string>(xs: readonly T[], x: unknown, what: string): T => { const v = typeof x === 'number' ? String(x) : x; need(typeof v === 'string' && (xs as readonly string[]).includes(v), t('lv.err.L39_pick', { what, x: String(x) })); return v as T; };   // a number is its name ("4" or 4: a pad or the QA camera sends numbers)

/** "What you have" numbers (textVars): the Call-it data and the scenario, written once. */
function textVars(s: S): Record<string, string | number> {
  const g = L39_PLACES.near, fl = CONDENSATE_90C;
  return {
    q: f(s, L39_Q), dz: f(s, L39_DZ), zs: f(s, L39_ZS), pd: f(s, (L39_P_DEA - L39_P_ATM) / 1e5), rho: f(s, fl.rho), mu: String(fl.mu * 1000), pv: f(s, fl.pVap / 1000),
    old: f(s, OLD_LINE_ID_MM), L: f(s, g.Ls + g.Ld), K: f(s, g.Ks + g.Kd), eps: f(s, EPS_STEEL * 1000), ls: f(s, g.Ls), ld: f(s, g.Ld), lsf: f(s, L39_PLACES.far.Ls), ldf: f(s, L39_PLACES.far.Ld),
    phead: f(s, (L39_P_ATM - fl.pVap) / (fl.rho * G)), elec: moneyText(s, pricesOf(s).electricity!.value),
  };
}

function curvePoints(e: Eval): Record<string, unknown> {
  const p = pumpOf(e.c.pump), tt = e.c.trim / 100, sys = systemOf(e.c);
  const qTop = Math.max(140, Math.ceil(pumpQZero(p) / 20) * 20);
  const qs: number[] = []; for (let i = 0; i <= 28; i++) qs.push((qTop * i) / 28);
  const r1 = (x: number) => Math.round(x * 100) / 100;
  const pumpPts = qs.filter((q) => q <= pumpQZero(p, tt)).map((q) => [r1(q), r1(pumpHead(p, q, tt))]);
  const fullPts = tt < 1 ? qs.filter((q) => q <= pumpQZero(p)).map((q) => [r1(q), r1(pumpHead(p, q))]) : [];
  const sysPts = qs.map((q) => [r1(q), r1(systemHead(sys, q / 3600))]);
  const npshrPts = qs.filter((q) => q <= p.qMax * tt * 1.1).map((q) => [r1(q), r1(pumpNpshr(p, q, tt))]);
  const npshaPts = qs.map((q) => [r1(q), r1(npshAvailable(sys, q / 3600))]);
  const etaPts = qs.filter((q) => q <= 2 * p.qBep * tt).map((q) => [r1(q), r1(pumpEta(p, q, tt))]);
  return { qTop, pump: pumpPts, full: fullPts, system: sysPts, npshr: npshrPts, npsha: npshaPts, eta: etaPts, range: [r1(p.qMin * tt), r1(p.qMax * tt)], bep: [r1(p.qBep * tt), r1(pumpHead(p, p.qBep * tt, tt))] };
}

export const L39: LevelSpec = {
  id: 'L39', chapter: 10, index: 39, setter: 'mentor', budgetUSD: L39_BUDGET_USD, units: CARRIER_UNITS, notes: 3, shiftLen: 0,
  setup: (s) => { carrierSetup(s); Object.assign(s.lv, { ...L39_START }); },
  measures,
  textVars,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'flow', met: m.ok && m.v.q! >= L39_Q, ...(m.ok ? { value: m.v.q } : {}), target: L39_Q },
      { key: 'velocity', met: m.ok && m.v.vd! >= L39_VD[0] && m.v.vd! <= L39_VD[1] && m.v.vs! <= L39_VS_MAX, ...(m.ok ? { value: m.v.vd } : {}), range: [L39_VD[0], L39_VD[1]], unit: 'm/s' },
      { key: 'npsh', met: m.ok && m.v.margin! >= L39_MARGIN, ...(m.ok ? { value: m.v.margin } : {}), target: L39_MARGIN },
      { key: 'curve', met: m.ok && m.v.curve === 1, ...(m.ok ? { value: m.v.q } : {}), target: m.v.qmax },
    ];
    if (s.mode === 'engineer') { const b = toLocal(s, L39_BUDGET_USD); g.push({ key: 'capex', met: m.ok && m.v.capex! <= b, ...(m.ok ? { value: m.v.capex } : {}), target: b }); }
    return g;
  },
  extraStars: (_s, m) => [
    m.ok && m.v.annual! <= m.v.ref! * (1 + L39_STAR_TOL),
    m.ok && m.v.bep! >= L39_BEP[0] && m.v.bep! <= L39_BEP[1],
  ],
  callIt: { key: 'head_old', unit: 'm', tol: L39_CALL_TOL, truth: () => L39_CALL_TRUTH, min: 0, max: 1000 },
  hero: (_s, m) => ({ key: 'q', unit: 'm³/h', value: m.v.q ?? 0, lo: L39_Q, hi: L39_Q * 1.5 }),
  secondary: (_s, m) => ({ key: 'margin', unit: 'm', value: m.v.margin ?? 0, limit: L39_MARGIN }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'flow', legend: t('lv.L39.ann.flow'), state: lit(m.ok, m.v.q! >= L39_Q, 'critical') },
    { key: 'vel', legend: t('lv.L39.ann.vel'), state: lit(m.ok, m.v.vd! >= L39_VD[0] && m.v.vd! <= L39_VD[1] && m.v.vs! <= L39_VS_MAX) },
    { key: 'cav', legend: t('lv.L39.ann.cav'), state: lit(m.ok, m.v.margin! >= L39_MARGIN, 'critical') },
    { key: 'curve', legend: t('lv.L39.ann.curve'), state: lit(m.ok, m.v.curve === 1) },
    { key: 'bep', legend: t('lv.L39.ann.bep'), state: lit(m.ok, m.v.bep! >= L39_BEP[0] && m.v.bep! <= L39_BEP[1]) },
    { key: 'goal', legend: t('lv.L39.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'discharge', role: 'mentor', done: (s) => commissions(s) >= 1 || (() => { const v = velocity(L39_Q / 3600, pipeOf(choiceOf(s).discharge).idMm / 1000); return v >= L39_VD[0] && v <= L39_VD[1]; })() },
    { id: 'suction', role: 'mentor', done: (s) => commissions(s) >= 1 || velocity(L39_Q / 3600, pipeOf(choiceOf(s).suction).idMm / 1000) <= L39_VS_MAX },
    { id: 'pump', role: 'mentor', done: (s) => commissions(s) >= 1 || (() => { const e = evalOf(s); return e.flowOk && e.curveOk; })() },
    { id: 'commission', role: 'mentor', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'mentor', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const e = evalOf(s), p = pumpOf(e.c.pump);
    const vars = { q: f(s, m.v.q!), qd: f(s, L39_Q), pct: f(s, Math.round(m.v.pct!)), vd: f(s, m.v.vd!), vs: f(s, m.v.vs!), hf: f(s, m.v.hfs! + m.v.hfd!), hfs: f(s, m.v.hfs!), h: f(s, m.v.h!), hs: f(s, m.v.hs!),
      shutoff: f(s, m.v.shutoff!), npsha: f(s, m.v.npsha!), npshr: f(s, m.v.npshr!), margin: f(s, m.v.margin!), qmax: f(s, m.v.qmax!), pump: e.c.pump, nps: e.c.suction, ndis: e.c.discharge,
      ls: f(s, L39_PLACES[e.c.place].Ls), phead: f(s, (L39_P_ATM - CONDENSATE_90C.pVap) / (CONDENSATE_90C.rho * G)), kw: f(s, m.v.kw!), capex: moneyText(s, m.v.capex!), budget: moneyText(s, toLocal(s, L39_BUDGET_USD)), bep: f(s, p.qBep * e.c.trim / 100) };
    if (m.v.reason === REASON.shutoff) return { key: 'shutoff', cause: t('lv.L39.cause.shutoff', vars) };
    if (m.v.margin! < L39_MARGIN) return { key: 'cavitation', cause: t('lv.L39.cause.cavitation', vars) };
    if (m.v.q! < L39_Q) return { key: 'lowflow', cause: t('lv.L39.cause.lowflow', vars) };
    if (m.v.reason === REASON.runout) return { key: 'runout', cause: t('lv.L39.cause.runout', vars) };
    if (m.v.vd! > L39_VD[1]) return { key: 'fast', cause: t('lv.L39.cause.fast', vars) };
    if (m.v.vs! > L39_VS_MAX) return { key: 'suction_fast', cause: t('lv.L39.cause.suction_fast', vars) };
    if (m.v.vd! < L39_VD[0]) return { key: 'slow', cause: t('lv.L39.cause.slow', vars) };
    if (m.v.curve !== 1) return { key: 'mincflow', cause: t('lv.L39.cause.mincflow', vars) };
    return { key: 'capex', cause: t('lv.L39.cause.capex', vars) };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.eta! > 0)) return null;
    const num = (x: number) => Number(f(s, x).replace(/,/g, ''));
    const rho = num(CONDENSATE_90C.rho), q = num(m.v.q!), h = num(m.v.h!), eta = num(m.v.eta!);
    return `${f(s, rho)} × 9.807 × ${f(s, q)} ÷ 3600 × ${f(s, h)} ÷ ${f(s, eta)} ÷ 1000 = ${f(s, (rho * 9.807 * q / 3600 * h) / eta / 1000)} kW at the shaft`;
  },
  lessonVars: (s, m) => ({ q: f(s, m.v.q ?? 0), h: f(s, m.v.h ?? 0), hs: f(s, m.v.hs!), vd: f(s, m.v.vd ?? 0), kw: f(s, m.v.kw ?? 0), margin: f(s, m.v.margin ?? 0), bep: f(s, Math.round((m.v.bep ?? 0) * 100)),
    annual: moneyText(s, m.v.annual ?? 0), ref: moneyText(s, m.v.ref!), energy: moneyText(s, m.v.energy ?? 0), capexAnn: moneyText(s, m.v.capexAnn ?? 0) }),
  metrics: (_s, m) => [
    { key: 'annual', unit: 'USD/y', value: m.v.annual ?? 0 },
    { key: 'kw', unit: 'kW', value: m.v.kw ?? 0 },
    { key: 'q', unit: 'm³/h', value: m.v.q ?? 0 },
  ],
  histogram: { metric: 'annual', best: (s) => optimumOf(s).total, spread: 0.3, lowerIsBetter: true },
  actions: {
    setPipe: (s, leg: unknown, nps: unknown) => edit(s, () => { const l = oneOf(['suction', 'discharge'] as const, leg, 'leg'); s.lv[l] = oneOf(PIPES.map((p) => p.nps), nps, 'pipe'); }),
    setPump: (s, id: unknown) => edit(s, () => { s.lv.pump = oneOf(PUMPS.map((p) => p.id), id, 'pump'); }),
    setTrim: (s, pct: unknown) => edit(s, () => { need(typeof pct === 'number' && Number.isInteger(pct) && pct >= L39_TRIMS.min && pct <= L39_TRIMS.max, t('lv.err.L39_trim', { min: L39_TRIMS.min, max: L39_TRIMS.max })); s.lv.trim = pct; }),
    setPlace: (s, pl: unknown) => edit(s, () => { s.lv.place = oneOf(Object.keys(L39_PLACES) as Place[], pl, 'place'); }),
    reset: (s) => edit(s, () => { Object.assign(s.lv, { ...L39_START }); }),
  },
  view: (s) => {
    const e = evalOf(s), c = e.c, p = pumpOf(c.pump), sys = systemOf(c), a = annualOf(s, e), ran = commissions(s) >= 1;
    const fl = CONDENSATE_90C;
    return {
      kind: 'pumps', choice: { ...c }, trimMin: L39_TRIMS.min, trimMax: L39_TRIMS.max, designQ: L39_Q,
      scene: { dz: L39_DZ, zs: L39_ZS, pDeaBarg: (L39_P_DEA - L39_P_ATM) / 1e5, tempC: 90, rho: fl.rho, pVapKpa: fl.pVap / 1000, ls: L39_PLACES[c.place].Ls, ld: L39_PLACES[c.place].Ld, hStatic: staticHead(sys) },
      pipes: PIPES.map((x) => ({ nps: x.nps, idMm: x.idMm, vAtDesign: velocity(L39_Q / 3600, x.idMm / 1000), perM: moneyText(s, toLocal(s, x.usdPerM)) })),
      pumps: PUMPS.map((x) => ({ id: x.id, label: t(`lv.L39.pump.${x.id}`), shutoff: x.h0, qBep: x.qBep, hBep: pumpHead(x, x.qBep), etaBep: x.etaBep, motorKw: x.motorKw, price: moneyText(s, toLocal(s, x.priceUsd)) })),
      places: (Object.keys(L39_PLACES) as Place[]).map((k) => ({ id: k, label: t(`lv.L39.place.${k}`), ls: L39_PLACES[k].Ls, ld: L39_PLACES[k].Ld })),
      guide: { vdLo: L39_VD[0], vdHi: L39_VD[1], vsHi: L39_VS_MAX, margin: L39_MARGIN, bepLo: L39_BEP[0], bepHi: L39_BEP[1] },
      curves: curvePoints(e),
      op: { ok: e.op.ok, q: e.op.Qh, h: e.op.H, eta: e.op.eta, kW: e.op.kW, npsha: e.op.npsha, npshr: e.op.npshr, margin: e.margin, reason: e.op.reason, vs: e.vs, vd: e.vd, hfs: e.hfs, hfd: e.hfd, bepPct: 100 * e.bep,
        flowOk: e.flowOk, velOk: e.velOk, npshOk: e.npshOk, curveOk: e.curveOk },
      money: { annual: moneyText(s, a.total), energy: moneyText(s, a.energy), capexAnn: moneyText(s, a.capexAnn), installed: moneyText(s, toLocal(s, e.capexUsd)), pump: moneyText(s, toLocal(s, p.priceUsd)),
        best: ran ? moneyText(s, optimumOf(s).total) : '', star: ran ? moneyText(s, optimumOf(s).total * (1 + L39_STAR_TOL)) : '', elec: textVars(s).elec },
      ran,
    };
  },
  solver: playOnce(() => [act('setPipe', 'discharge', L39_REF.discharge), act('setPipe', 'suction', L39_REF.suction), act('setPump', L39_REF.pump), act('setTrim', L39_REF.trim), act('setPlace', L39_REF.place)], { callIt: () => L39_CALL_TRUTH }),
  naive: playOnce(() => []),
};
