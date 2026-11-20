// Run actions: predict (locked at commission), commission (steady-state solve with warm start), setThermoDetail.
// commission(): a pipework problem (open port...) is a REJECTED action with a teaching message and nothing changes; a solver or unit failure
// is a RESULT: the coded failure is stored in `solved` (ok false) with the failing units flagged, the phase stays 'design', and the action
// succeeds with { commissioned: false, code, unitId } so the plant can draw it. Success sets phase 'commissioned' and appends a RunRecord.
import { fail, log, need, ok } from '@core/kit';
import type { ActionFn } from '@core/kit';
import { solveFlowsheet, validateTopology } from '../../sim/flowsheet';
import type { Diag, UnitInst } from '../../sim/types';
import { t } from '../../i18n';
import { THERMO_DETAILS, type DiagRec, type EqState, type RunRecord, type SolveResult, type UnitResult } from '../../state';
import { entersFirstRun, specOf } from '../../levels/registry';
import { strayUnitsOf } from '../queries/plant';
import { bindRegistry, phaseHook } from '../registry';
import { ctxOf, economics, messageOf, syncFeed } from '../solved';
import { invalidate, needEditable } from './design';

type Fn = ActionFn<EqState>;
const MAX_RUNS = 10;

const predict: Fn = (s, quantity: unknown, value: unknown) => {
  need(s.phase === 'design', t('err.predict.locked'));
  need(typeof quantity === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(quantity), t('err.predict.quantity'));
  need(typeof value === 'number' && Number.isFinite(value), t('err.predict.value', { value: String(value) }));
  s.prediction = { quantity, value };
};

const setThermoDetail: Fn = (s, d: unknown) => {
  needEditable(s);
  need(typeof d === 'string' && (THERMO_DETAILS as string[]).includes(d), t('err.thermo.unknown', { value: String(d) }));
  if (s.thermoDetail !== d) { s.thermoDetail = d as EqState['thermoDetail']; invalidate(s); }
};

const toRec = (d: Diag): DiagRec => {
  const r: DiagRec = { code: d.code, severity: d.severity, data: d.data };
  if (d.unitId !== undefined) r.unitId = d.unitId;
  if (d.species !== undefined) r.species = d.species;
  return r;
};

const finiteInfo = (info: Record<string, number> | undefined): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(info ?? {})) if (typeof v === 'number' && Number.isFinite(v)) o[k] = v;
  return o;
};

/** The units as the solver sees them: feed units take their params from the FeedSpec. */
export function unitsForSolve(s: EqState): UnitInst[] {
  const units = structuredClone(s.flowsheet.units);
  for (const u of units) if (u.type === 'feed' && s.feeds[u.id]) syncFeed(u, s.feeds[u.id]!, s.species);
  return units;
}

const commission: Fn = (s) => {
  needEditable(s);
  need(s.species.length > 0 && s.flowsheet.units.some((u) => u.type === 'feed'), t('err.commission.empty'));
  specOf(s)?.beforeCommission?.(s);
  const registry = bindRegistry(s.species);
  const units = unitsForSolve(s);
  const strays = strayUnitsOf(s);
  if (strays.length > 0) fail(t('err.commission.stray', { unit: strays.join(', ') }));
  const bad = validateTopology(units, s.flowsheet.streams, registry, phaseHook);
  if (bad) {
    if (bad.code === 'TOPOLOGY_OPEN_PORT') {
      const bu = s.flowsheet.units.find((u) => u.id === bad.unitId);
      const loose = s.flowsheet.units.filter((u) => u.type === 'feed' && !s.flowsheet.streams.some((p) => p.from.unit === u.id)).map((u) => u.id);
      const mixer = bu !== undefined && bu.type.startsWith('mixer');
      if (s.lv.contractFeeds !== undefined && bu !== undefined && (mixer || (bu.type === 'feed' && s.flowsheet.units.some((u) => u.type.startsWith('mixer')))) && loose.length > 0) {
        fail(t('err.commission.mixer_inlet', { unit: mixer ? bu.id : s.flowsheet.units.find((u) => u.type.startsWith('mixer'))!.id, feeds: loose.join(' / ') }));
      }
      if (bad.data.inlet === 0) fail(t('err.commission.open_port', { unit: bad.unitId ?? '', port: String(bad.data.port).toUpperCase() }));
      fail(t('err.commission.open_inlet', { unit: bad.unitId ?? '', port: String(bad.data.port) }));
    }
    fail(t('err.commission.topology', { unit: bad.unitId ?? '', code: bad.code }));
  }
  const r = solveFlowsheet({ species: s.species, units, pipes: s.flowsheet.streams, registry, ctx: ctxOf(s), warm: s.warm ?? undefined, options: { phaseOk: phaseHook } });
  if (!r.ok) {
    const scc = typeof r.data.scc === 'string' ? r.data.scc.split(',') : [];
    const failedUnits = r.unitId !== undefined ? [r.unitId] : scc;
    const f: SolveResult['failure'] = { code: r.code, data: r.data };
    if (r.unitId !== undefined) f.unitId = r.unitId;
    if (r.species !== undefined) f.species = r.species;
    const rec: DiagRec = { code: r.code, severity: 'fail', data: r.data };
    if (r.unitId !== undefined) rec.unitId = r.unitId;
    if (r.species !== undefined) rec.species = r.species;
    s.solved = { ok: false, streams: {}, units: {}, diag: [rec, ...r.diag.map(toRec)], failure: f, failedUnits, iterations: Number(r.data.passes ?? 0), method: 'none', loops: 0, topologyHash: '', kpis: {} };
    s.phase = 'design';
    const message = messageOf({ code: r.code, severity: 'fail', unitId: r.unitId, species: r.species, data: r.data }, s.region);
    log(s, message, 'bad');
    return ok(message, { commissioned: false, code: r.code, unitId: r.unitId ?? '' });
  }
  const sol = r.value;
  const unitRes: Record<string, UnitResult> = {};
  for (const u of s.flowsheet.units) {
    const o = sol.units[u.id];
    if (!o) continue;
    const e: UnitResult = { info: finiteInfo(o.info) };
    if (o.duty !== undefined) e.duty = o.duty;
    if (o.work !== undefined) e.work = o.work;
    unitRes[u.id] = e;
  }
  const streams: SolveResult['streams'] = {};
  for (const p of s.flowsheet.streams) { const st = sol.streams[p.id]; if (st) streams[p.id] = { n: st.n.slice(), T: st.T, P: st.P }; }
  const econ = economics(s, streams, unitRes);
  s.solved = {
    ok: true, streams, units: unitRes, diag: [...r.diag.map(toRec), ...econ.diag], failure: null, failedUnits: [], iterations: sol.passes, method: sol.method,
    loops: sol.loops.length, topologyHash: sol.topologyHash, kpis: econ.kpis,
  };
  s.warm = sol.warm;
  s.phase = 'commissioned';
  const setpoints: RunRecord['setpoints'] = {};
  for (const u of units) {
    const p: Record<string, number> = {};
    for (const [k, v] of Object.entries(u.params)) if (typeof v === 'number') p[k] = v;
    setpoints[u.id] = p;
  }
  s.runs.push({
    tick: s.tick, setpoints,
    key: { product_t_per_h: econ.kpis.product_t_per_h!, electric_kw: econ.kpis.electric_kw!, iterations: sol.passes, loops: sol.loops.length },
    kpis: econ.kpis, prediction: s.prediction ? { ...s.prediction } : null,
  });
  if (s.runs.length > MAX_RUNS) s.runs.splice(0, s.runs.length - MAX_RUNS);
  // L01-L04: a commission that meets every goal first runs the plant for 30 plant seconds; the win comes when it has rolled (levels/registry goal)
  const spec = specOf(s);
  if (spec !== undefined && s.status === 'playing' && entersFirstRun(spec, s)) { s.phase = 'firstrun'; s.lv.firstRuns = ((s.lv.firstRuns as number | undefined) ?? 0) + 1; }
  const message = t('log.commissioned', { units: s.flowsheet.units.length, streams: s.flowsheet.streams.length, passes: sol.passes });
  log(s, message, 'good');
  return ok(message, { commissioned: true });
};

export const runActions: Record<string, Fn> = { predict, commission, setThermoDetail };
