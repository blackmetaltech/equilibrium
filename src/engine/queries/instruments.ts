// Instrument queries of chapters 2-7 (DESIGN 2.7, 5.4): the X-T staircase of adiabatic beds (xtDiagram), the Semenov plot of a jacketed CSTR
// (semenov(unitId)) and the heat ledger of the plant (heatLedger). Read-only and derived from the solved state plus existing sim functions
// (eqCurve, cstrSteadyStates, cstrSetup, enthalpyFlowAt): no physics lives here. Plain JSON, finite numbers, temperatures in K, powers in W / MW.
import { fail } from '@core/kit';
import type { QueryFn } from '@core/kit';
import { eqCurve } from '../../sim/chem';
import { cstrSteadyStates } from '../../sim/units/rx_cstr';
import { cstrSetup, effectiveUnits } from '../../sim/dynamics/shift';
import { keyIndex, windowOf } from '../../sim/units/rx_equil';
import { reactionIdsOf } from '../../sim/units/rx_stoich';
import { enthalpyFlowAt, makeMixture } from '../../sim/thermo';
import { hasThermo } from '../../sim/thermo/species';
import type { StreamState, UnitInst } from '../../sim/types';
import { t } from '../../i18n';
import type { EqState } from '../../state';
import { solveFlowsheet } from '../../sim/flowsheet';
import { unitsForSolve } from '../actions/run';
import { bindRegistry, phaseHook } from '../registry';
import { ctxOf, plumbing } from '../solved';
import { specOf } from '../../levels/registry';
import { commissions } from '../../levels/util';
import { answerOf } from './level';

const BED_TYPES = ['multibed', 'eq_bed', 'eq_reactor', 'packed_bed'];
const REACTOR_TYPES = ['stoich_reactor', 'burner', 'gasifier', 'co_burner', 'eq_reactor', 'eq_bed', 'packed_bed', 'multibed', 'cstr'];
const T_REF = 298.15;
const N_EQ = 90;

interface Live { streams: Record<string, StreamState>; units: Record<string, { info: Record<string, number>; duty?: number; work?: number }> }
/** The plant's solved state: the stored result, or (after a design edit has cleared it) a fresh solve that is never stored, so a knob turn moves the instruments at once. */
function liveOf(s: Readonly<EqState>): Live | null {
  if (s.solved?.ok) return s.solved;
  if (!s.species.length || !s.flowsheet.units.some((u) => u.type === 'feed')) return null;
  const r = solveFlowsheet({ species: s.species, units: unitsForSolve(s), pipes: s.flowsheet.streams, registry: bindRegistry(s.species), ctx: ctxOf(s), options: { phaseOk: phaseHook } });
  if (!r.ok) return null;
  const units: Live['units'] = {};
  for (const [id, o] of Object.entries(r.value.units)) units[id] = { info: o.info ?? {}, ...(o.duty !== undefined ? { duty: o.duty } : {}), ...(o.work !== undefined ? { work: o.work } : {}) };
  return { streams: r.value.streams, units };
}

/** True on a call-it level before its first commission while an answer is still open: an instrument must not print the quantity the player is asked to call (the L05 ledger showed R-105's 8.25 MW). */
export function callWithheld(s: Readonly<EqState>): boolean {
  const spec = specOf(s);
  if (!spec || commissions(s) > 0) return false;
  const items = spec.callIts !== undefined && spec.callIts.length > 0 ? spec.callIts : spec.callIt ? [spec.callIt] : [];
  return items.some((c) => answerOf(s, spec, c.key) === null);
}

const fin = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const isAdiabatic = (u: UnitInst): boolean => (u.type === 'multibed' ? u.params.mode !== 'isothermal' : u.type === 'packed_bed' || u.type === 'eq_bed' || u.type === 'eq_reactor' ? u.params.mode === 'adiabatic' || (u.type === 'packed_bed' && u.params.mode === undefined) : false);

interface Seg { unitId: string; inT: number; outT: number; inN: number[]; outN: number[] }

/** Units in flow order: depth from the feeds along the pipes (ties keep the placement order). */
function flowOrder(s: Readonly<EqState>): Map<string, number> {
  const depth = new Map<string, number>();
  const into = new Map<string, string[]>();
  for (const p of s.flowsheet.streams) { const a = into.get(p.to.unit) ?? []; a.push(p.from.unit); into.set(p.to.unit, a); }
  const walk = (id: string, guard: number): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (guard > 64) return 0;
    const d = Math.max(-1, ...(into.get(id) ?? []).map((x) => walk(x, guard + 1))) + 1;
    depth.set(id, d);
    return d;
  };
  for (const u of s.flowsheet.units) walk(u.id, 0);
  return depth;
}

const EMPTY_XT = { eq: [] as { T: number; X: number }[], beds: [] as unknown[], coolers: [] as unknown[], lightOffT: null as number | null, sinterT: null as number | null };

export const instrumentQueries: Record<string, QueryFn<EqState>> = {
  /** The X-T diagram of the plant's adiabatic beds: equilibrium curve, one entry per bed (inlet / outlet T and cumulative conversion of the key fed to the first bed), the coolers between them and the catalyst window. */
  xtDiagram: (s) => {
    const sol = liveOf(s);
    if (!sol) return EMPTY_XT;
    const order = flowOrder(s);
    const pl = plumbing(s);
    const units = s.flowsheet.units.filter((u) => BED_TYPES.includes(u.type) && isAdiabatic(u));
    const segs: (Seg & { u: UnitInst })[] = [];
    for (const u of units.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
      const r = sol.units[u.id];
      const inId = pl.inPipe(u.id, 'in'), outId = pl.outPipe(u.id, 'out');
      const si = inId ? sol.streams[inId] : undefined, so = outId ? sol.streams[outId] : undefined;
      if (!r || !si || !so) continue;
      if (u.type === 'multibed') {
        const nb = Math.round(fin(r.info.beds));
        for (let j = 1; j <= nb; j++) segs.push({ u, unitId: u.id, inT: fin(r.info[`b${j}_Tin`]), outT: fin(r.info[`b${j}_Tout`]), inN: [fin(r.info[`b${j}_Xin`])], outN: [fin(r.info[`b${j}_Xout`])] });
      } else segs.push({ u, unitId: u.id, inT: si.T, outT: so.T, inN: si.n, outN: so.n });
    }
    if (segs.length === 0) return EMPTY_XT;
    // the reference feed: the inlet of the first bed; X is the conversion of its key reactant on that feed
    const first = segs[0]!.u;
    const firstIn = sol.streams[pl.inPipe(first.id, 'in')!]!;
    const rxns = reactionIdsOf(first);
    const key = keyIndex(s.species, firstIn.n, rxns[0]!, typeof first.params.key === 'string' ? first.params.key : undefined);
    const fed = key >= 0 ? firstIn.n[key]! : 0;
    const Xof = (n: number[]): number => (fed > 0 && key >= 0 ? Math.min(1, Math.max(0, 1 - n[key]! / fed)) : 0);
    const beds = segs.map((g) => (g.u.type === 'multibed'
      ? { unitId: g.unitId, inT: g.inT, outT: g.outT, inX: g.inN[0]!, outX: g.outN[0]! }
      : { unitId: g.unitId, inT: g.inT, outT: g.outT, inX: Xof(g.inN), outX: Xof(g.outN) }));
    const coolers: { fromT: number; toT: number; X: number }[] = [];
    for (let i = 0; i + 1 < beds.length; i++) {
      const a = beds[i]!, b = beds[i + 1]!;
      if (b.inT < a.outT - 0.01) coolers.push({ fromT: a.outT, toT: b.inT, X: a.outX });
    }
    // the equilibrium curve spans the beds' temperatures with a margin
    const lo = Math.max(300, Math.min(...beds.map((b) => b.inT)) - 100), hi = Math.min(1500, Math.max(...beds.map((b) => b.outT)) + 120);
    const grid = Array.from({ length: N_EQ }, (_, i) => lo + (i * (hi - lo)) / (N_EQ - 1));
    const refSp = key >= 0 ? s.species[key]! : undefined;
    const curve = eqCurve({ species: s.species, n0: firstIn.n, P: firstIn.P, reactions: rxns, detail: s.thermoDetail }, grid, refSp);
    const eq = curve.ok ? curve.value.T.map((T, i) => ({ T, X: curve.value.X[i]! })) : [];
    const w = windowOf(first);
    return { eq, beds, coolers, lightOffT: w.Tmin ?? null, sinterT: w.Tmax ?? null };
  },

  /** Semenov plot of a jacketed CSTR: heat generated G(T) and removed R(T) in W, the steady states with stability, and the operating point (under a running shift: live jacket and the vessel's current T). */
  semenov: (s, unitId: unknown) => {
    const u0 = s.flowsheet.units.find((x) => x.id === unitId);
    if (!u0 || u0.type !== 'cstr') fail(t('err.unit.unknown', { id: String(unitId) }));
    const sh = s.shift;
    const u = sh ? (effectiveUnits(s, sh).find((x) => x.id === u0.id) ?? u0) : u0;
    const inId = plumbing(s).inPipe(u.id, 'in');
    const live0 = liveOf(s);
    const st = inId ? live0?.streams[inId] : undefined;
    const empty = { T: [] as number[], G: [] as number[], R: [] as number[], states: [] as { T: number; stable: boolean }[], op: { T: 0 }, reason: 'NOT_SOLVED' };
    if (!st) return empty;
    const cs = cstrSetup(u, st, s.species);
    if (!cs) return { ...empty, reason: 'NO_MODEL' };
    const r = cstrSteadyStates(cs.model, cs.inputs, 120);
    const live = sh?.dc[u.id]?.T;
    const opT = live !== undefined && Number.isFinite(live) ? live : fin(live0?.units[u.id]?.info.T);
    // the steady states belong to the inlet the reactor sees NOW: while the feed ramps they move, so the plot says which feed they are for
    const feedKmolH = fin(st.n.reduce((a, b) => a + b, 0)) * 3.6;
    return { T: r.semenov.T, G: r.semenov.G, R: r.semenov.R, states: r.states.map((x) => ({ T: x.T, stable: x.stable })), op: { T: opT }, feedKmolH };
  },

  /** Equilibrium Window of any reactor with a reaction set: X_eq(T) for the stage's inlet feed and pressure, the operating point (outlet T, key conversion) and the balance beam (log10 Q/K at the outlet and the inlet, clamped to +-3 by the unit). */
  eqBeam: (s, unitId: unknown) => {
    const u = s.flowsheet.units.find((x) => x.id === unitId);
    if (!u) fail(t('err.unit.unknown', { id: String(unitId) }));
    const none = (reason: string) => ({ window: null, reason });
    if (!REACTOR_TYPES.includes(u.type) || u.type === 'cstr') return none('NO_REACTOR');
    const rxns = reactionIdsOf(u);
    if (rxns.length === 0) return none('NO_REACTOR');
    const sol = liveOf(s), pl = plumbing(s);
    const inId = pl.inPipe(u.id, 'in'), st = inId ? sol?.streams[inId] : undefined, info = sol?.units[u.id]?.info;
    if (!sol || !st || !info) return none('NOT_SOLVED');
    const key = keyIndex(s.species, st.n, rxns[0]!, typeof u.params.key === 'string' ? u.params.key : undefined);
    const Tout = fin(info.T_out), Tin = st.T;
    const lo = Math.max(300, Math.min(Tin, Tout) - 250), hi = Math.min(1500, Math.max(Tin, Tout) + 300);
    const grid = Array.from({ length: N_EQ }, (_, i) => lo + (i * (hi - lo)) / (N_EQ - 1));
    const c = eqCurve({ species: s.species, n0: st.n, P: st.P, reactions: rxns, detail: s.thermoDetail }, grid, key >= 0 ? s.species[key] : undefined);
    if (!c.ok) return none(c.code);
    const w = windowOf(u);
    return {
      window: { T: c.value.T, X: c.value.X, ref: c.value.ref }, point: { T: Tout, X: fin(info.X), TIn: Tin },
      beam: { out: fin(info.QK_out), in: fin(info.QK_in) }, lightOffT: w.Tmin ?? null, sinterT: w.Tmax ?? null, reason: null,
    };
  },

  /** Heat per unit from the solved energy balance: reactors release the heat of reaction (formation-basis enthalpy in minus out at 298.15 K), boilers recover heat, coolers / intercoolers / refrigeration lose it, heaters are duty. totalMW = the heat released. */
  heatLedger: (s) => {
    const sol = liveOf(s);
    const labels = { ribbon: t('ledger.ribbon'), release: t('ledger.release'), recovered: t('ledger.recovered'), lost: t('ledger.lost'), duty: t('ledger.duty'), exchanger: t('ledger.exchanger'), efficiency: t('ledger.efficiency'), total: t('ledger.total') };
    if (!sol || !s.species.every(hasThermo) || callWithheld(s)) return { items: [], totalMW: 0, exchangerMW: 0, heaters: [], labels };
    const mx = makeMixture(s.species);
    const H = (n: readonly number[]): number => enthalpyFlowAt(mx, n, T_REF);
    const sum = (ids: string[]): number[] => s.species.map((_, i) => ids.reduce((a, id) => a + (sol.streams[id]?.n[i] ?? 0), 0));
    const items: { unitId: string; tag: string; MW: number; kind: 'release' | 'recovered' | 'lost' | 'duty' }[] = [];
    let total = 0, exchangerMW = 0;
    const heaters: { unitId: string; dutyMW: number; fuelMW: number; efficiency: number; label: string }[] = [];
    for (const u of s.flowsheet.units) {
      const r = sol.units[u.id];
      if (!r) continue;
      const add = (MW: number, kind: 'release' | 'recovered' | 'lost' | 'duty'): void => { if (Math.abs(MW) > 1e-9) items.push({ unitId: u.id, tag: u.id, MW, kind }); };
      if (REACTOR_TYPES.includes(u.type)) {
        const ins = s.flowsheet.streams.filter((p) => p.to.unit === u.id).map((p) => p.id), outs = s.flowsheet.streams.filter((p) => p.from.unit === u.id).map((p) => p.id);
        const rel = (H(sum(ins)) - H(sum(outs))) / 1e6;
        if (rel >= 0) { add(rel, 'release'); total += rel; } else add(-rel, 'duty');
      } else if (u.type === 'boiler') add(-fin(r.duty) / 1e6, 'recovered');
      else if (u.type === 'hx') { const q = Math.abs(fin(r.info.Q)) / 1e6; exchangerMW += q; add(q, 'recovered'); }
      else if (u.type === 'heater') {
        const dutyMW = fin(r.duty) / 1e6, fuelMW = fin(r.info.fuel_W) / 1e6;
        add(dutyMW, 'duty');
        if (fuelMW > 0 && dutyMW > 0) heaters.push({ unitId: u.id, dutyMW, fuelMW, efficiency: dutyMW / fuelMW, label: t('ledger.heater_eff', { id: u.id, duty: dutyMW.toFixed(2), fuel: fuelMW.toFixed(2), eff: (100 * dutyMW / fuelMW).toFixed(0) }) });
      }
      else if (u.type === 'cooler' || u.type === 'compressor' || u.type === 'nh3_sep') add(-fin(r.duty) / 1e6, 'lost');
    }
    /** exchangerMW: heat the exchangers move between process streams (a recovered line of its own); heaters: duty against the fuel burnt, efficiency = duty / fuel; labels: every word the ledger prints. */
    return { items: items.filter((i) => i.MW > 0), totalMW: total, exchangerMW, heaters, labels };
  },
};
