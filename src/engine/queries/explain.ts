// explainRun(prevId?, curId?) and needs(unitId): the Why panel and the needs-you chip (DESIGN 7.3). A run id is an index into state.runs
// (negative counts from the end: -1 is the latest); the default is the previous run against the latest. The blame tree re-solves the
// flowsheet with setpoints reverted (src/sim/explain, pure); this file only builds its records from the state and renders the sentences.
import { fail } from '@core/kit';
import type { QueryFn } from '@core/kit';
import { findReaction } from '../../data/reactions';
import { limitingReagent } from '../../sim/chem/stoich';
import { rxnDH } from '../../sim/chem/reactions';
import { explainRun, needsOf, predictGap, renderExplanation } from '../../sim/explain';
import type { ExplainRecord, Fmt, ResolveFn, UnitFacts } from '../../sim/explain';
import { solveFlowsheet } from '../../sim/flowsheet';
import { reactionIdsOf } from '../../sim/units/rx_stoich';
import { t } from '../../i18n';
import type { EqState, SolveResult, UnitResult } from '../../state';
import { unitsForSolve } from '../actions/run';
import { defOf, bindRegistry, hasUnitType, phaseHook } from '../registry';
import { ctxOf, economics, fmtNumber, messageOf, plumbing, speciesName } from '../solved';

const runAt = (s: Readonly<EqState>, id: unknown, dflt: number): number => {
  const n = id === undefined || id === null ? dflt : Number(id);
  const i = n < 0 ? s.runs.length + n : n;
  if (!Number.isInteger(i) || i < 0 || i >= s.runs.length) fail(t('why.err.run', { id: String(id) }));
  return i;
};

const reactorFacts = (s: Readonly<EqState>, u: { id: string; params: Record<string, number | string> } & Parameters<typeof reactionIdsOf>[0], info: Record<string, number>, inlet: { n: number[] } | undefined): UnitFacts['rx'] | undefined => {
  const rec = reactionIdsOf(u).map((id) => findReaction(id)).find((r) => r !== undefined);
  if (!rec) return undefined;
  const dH = rxnDH(rec.nu, info.T_out ?? info.T_in ?? 298.15, s.thermoDetail);
  return { dnGas: rec.dnGas, dHkJ: Number.isFinite(dH) ? dH / 1000 : 0, eq: rec.eq };
};

/** Solve the flowsheet with the given numeric setpoints laid over the current units; null (with the failure) when it does not solve. */
export function recordOf(s: Readonly<EqState>, setpoints: ExplainRecord['setpoints']): ExplainRecord {
  const units = unitsForSolve(s as EqState);
  for (const u of units) for (const [k, v] of Object.entries(setpoints[u.id] ?? {})) u.params[k] = v;
  const registry = bindRegistry(s.species);
  const r = solveFlowsheet({ species: s.species, units, pipes: s.flowsheet.streams, registry, ctx: ctxOf(s), warm: s.warm ?? undefined, options: { phaseOk: phaseHook } });
  const base: ExplainRecord = { setpoints: structuredClone(setpoints), kpis: {}, units: {}, diag: [], failure: null, events: [] };
  if (!r.ok) {
    base.failure = { code: r.code, data: r.data };
    if (r.unitId !== undefined) base.failure.unitId = r.unitId;
    if (r.species !== undefined) base.failure.species = r.species;
    return base;
  }
  const sol = r.value;
  const res: Record<string, UnitResult> = {};
  const streams: SolveResult['streams'] = {};
  for (const p of s.flowsheet.streams) { const st = sol.streams[p.id]; if (st) streams[p.id] = { n: st.n.slice(), T: st.T, P: st.P }; }
  for (const u of units) {
    const o = sol.units[u.id];
    if (!o) continue;
    const info: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.info ?? {})) if (typeof v === 'number' && Number.isFinite(v)) info[k] = v;
    res[u.id] = { info, ...(o.duty !== undefined ? { duty: o.duty } : {}), ...(o.work !== undefined ? { work: o.work } : {}) };
  }
  base.kpis = economics({ ...s, flowsheet: { ...s.flowsheet, units } } as EqState, streams, res).kpis;
  const pl = plumbing(s);
  for (const u of units) {
    const info = res[u.id]?.info ?? {};
    const f: UnitFacts = { type: u.type, params: { ...u.params }, info };
    if (info.K !== undefined && info.Xeq !== undefined) {
      const inId = pl.inPipe(u.id, 'in'), inlet = inId ? streams[inId] : undefined;
      const rx = reactorFacts(s, u, info, inlet);
      if (rx) {
        f.rx = rx;
        const ids = reactionIdsOf(u).filter((id) => findReaction(id));
        const nu = findReaction(ids[0]!)!.nu;
        if (inlet) {
          const tot = inlet.n.reduce((a, b) => a + b, 0);
          const touched = new Set<string>(ids.flatMap((id) => Object.keys(findReaction(id)!.nu)));
          let best = -1;
          s.species.forEach((sp, i) => { const y = tot > 0 ? inlet.n[i]! / tot : 0; if (!touched.has(sp) && y > best) { best = y; f.inert = { species: sp, y }; } });
          const amounts: Record<string, number> = {};
          s.species.forEach((sp, i) => { amounts[sp] = inlet.n[i]!; });
          const lr = limitingReagent(amounts, nu);
          const others = Object.keys(lr.ratios).filter((x) => x !== lr.species).sort((a, b) => lr.ratios[a]! - lr.ratios[b]!);
          if (lr.species && others.length > 0) {
            const o = others[0]!;
            f.lim = { species: lr.species, other: o, have: amounts[lr.species]!, need: lr.ratios[o]! * -nu[lr.species]!, left: (lr.ratios[o]! - lr.xiMax) * -nu[o]! };
          }
        }
      }
    }
    base.units[u.id] = f;
  }
  base.diag = r.diag.concat([]).map((d) => ({ code: d.code, ...(d.unitId !== undefined ? { unitId: d.unitId } : {}), ...(d.species !== undefined ? { species: d.species } : {}), data: d.data }));
  return base;
}

const fmtOf = (s: Readonly<EqState>): Fmt => ({
  num: (x, sig) => fmtNumber(Number(x.toPrecision(sig)), s.region),
  name: (id) => speciesName(id),
});

export const explainQueries: Record<string, QueryFn<EqState>> = {
  /** { sentences, factors, key, kpi }: the Why text of the latest run against the previous one (or any two run indices). */
  explainRun: (s, prevId?: unknown, curId?: unknown) => {
    if (s.runs.length === 0) return { sentences: [], factors: [], key: '', kpi: '' };
    const resolve: ResolveFn = (sp) => { const r = recordOf(s, sp); return r.failure ? null : r; };
    const failedNow = curId === undefined && s.solved && !s.solved.ok && s.solved.failure !== null;
    const pi = runAt(s, prevId, failedNow ? -1 : -2 + (s.runs.length === 1 ? 1 : 0)), ci = failedNow ? pi : runAt(s, curId, -1);
    const prev = recordOf(s, s.runs[pi]!.setpoints);
    let cur: ExplainRecord = ci === pi && !failedNow ? prev : recordOf(s, s.runs[ci]!.setpoints);
    if (failedNow) cur = { ...prev, failure: s.solved!.failure!, diag: [] };
    const e = explainRun(prev, cur, resolve);
    return { sentences: renderExplanation(e, s.mode, fmtOf(s)), factors: e.factors, key: e.key, kpi: e.kpi };
  },
  /** The gap of the locked prediction against the engine value of the latest run ({ sentences: [] } when within tolerance). */
  explainPrediction: (s, tol: unknown = 0.02) => {
    const last = s.runs[s.runs.length - 1];
    const p = last?.prediction;
    if (!last || !p || !(p.quantity in last.kpis)) return { sentences: [] };
    const e = predictGap(p.value, last.kpis[p.quantity]!, s.thermoDetail, Number(tol));
    return { sentences: e ? renderExplanation(e, s.mode, fmtOf(s)) : [] };
  },
  /** What a unit lacks to run: { unit, code, text } or null. At most one line, from the unit's own failure or diag. */
  needs: (s, unitId: unknown) => {
    const u = s.flowsheet.units.find((x) => x.id === unitId);
    if (!u) fail(t('err.unit.unknown', { id: String(unitId) }));
    const pl = plumbing(s);
    const open = hasUnitType(u.type) ? defOf(u.type).inlets.filter((p) => !pl.inPipe(u.id, p)) : [];
    const sol = s.solved;
    const diag = (sol?.diag ?? []).filter((d) => d.severity !== 'info' && d.unitId === u.id);
    const n = needsOf(u.id, open, sol && !sol.ok ? sol.failure : null, diag);
    if (!n) return null;
    if (n.code === 'INLET') return { unit: u.id, code: 'INLET', text: t('why.needs.INLET', { unit: u.id, port: t(`label.port.${n.vars.port}`) }) };
    const rec = n.code === 'FAILED' ? { code: sol!.failure!.code, severity: 'fail' as const, unitId: u.id, data: sol!.failure!.data } : diag[0]!;
    return { unit: u.id, code: n.code === 'FAILED' ? rec.code : rec.code, text: messageOf(rec, s.region) };
  },
};
