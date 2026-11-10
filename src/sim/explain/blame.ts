// Blame tree (DESIGN 7.3): headline KPI (or failed goal) -> one-at-a-time sensitivity (<= 8 re-solves through the passed-in resolve) -> a
// template for the top factor. Pure: no state, no clock, no sentences (keys and numbers only; the words live in locales/en/why.ts).
import type { DiagLite, ExplainRecord, Explanation, Factor, ResolveFn, UnitFacts, Vars } from './types';

export const MAX_RESOLVES = 8;
/** A bed at least this close to its equilibrium is limited by the ceiling, not by speed. */
export const ETA_EQ = 0.8;
const HEADLINE = 'product_t_per_h';
const REL_EPS = 1e-9;

const rel = (a: number, b: number): number => (b === 0 ? (a === 0 ? 0 : Number.POSITIVE_INFINITY) : (a - b) / Math.abs(b));
const sgn = (x: number): 1 | -1 => (x >= 0 ? 1 : -1);

/** The setpoints that differ, largest relative change first (at most MAX_RESOLVES). Deterministic order for ties: by unit id, then key. */
export function changedSetpoints(prev: ExplainRecord['setpoints'], cur: ExplainRecord['setpoints']): { unitId: string; key: string; from: number; to: number }[] {
  const out: { unitId: string; key: string; from: number; to: number; size: number }[] = [];
  for (const id of Object.keys(cur).sort()) {
    const a = prev[id] ?? {}, b = cur[id]!;
    for (const key of Object.keys(b).sort()) {
      const from = a[key], to = b[key]!;
      if (from === undefined || Math.abs(to - from) <= REL_EPS * Math.max(1, Math.abs(from))) continue;
      out.push({ unitId: id, key, from, to, size: Math.abs(rel(to, from)) });
    }
  }
  out.sort((x, y) => y.size - x.size);
  return out.slice(0, MAX_RESOLVES).map(({ size: _s, ...r }) => r);
}

/** The KPI to explain: production when it moved by 0.5 % or more, else the largest relative mover (ignoring unsolved 1e9 sentinels). */
export function headlineKpi(prev: ExplainRecord, cur: ExplainRecord): string {
  const moved = (k: string): number => Math.abs(rel(cur.kpis[k]!, prev.kpis[k]!));
  if (HEADLINE in cur.kpis && HEADLINE in prev.kpis && moved(HEADLINE) >= 0.005) return HEADLINE;
  let best = HEADLINE, bestMove = -1;
  for (const k of Object.keys(cur.kpis).sort()) {
    const a = prev.kpis[k], b = cur.kpis[k]!;
    if (a === undefined || Math.abs(a) >= 1e9 || Math.abs(b) >= 1e9) continue;
    const m = moved(k);
    if (Number.isFinite(m) && m > bestMove) { best = k; bestMove = m; }
  }
  return best;
}

/** Rank the changed setpoints by the effect each one has alone on `kpi` (revert only that one in `cur` and re-solve). */
export function rankFactors(prev: ExplainRecord, cur: ExplainRecord, kpi: string, resolve: ResolveFn): Factor[] {
  const base = Math.abs(prev.kpis[kpi] ?? 0) > 0 ? Math.abs(prev.kpis[kpi]!) : 1;
  const factors: Factor[] = changedSetpoints(prev.setpoints, cur.setpoints).map((c) => {
    const sp = structuredClone(cur.setpoints);
    sp[c.unitId]![c.key] = c.from;
    const r = resolve(sp);
    const effect = r && kpi in r.kpis ? (cur.kpis[kpi]! - r.kpis[kpi]!) / base : 0;
    return { ...c, effect: Number.isFinite(effect) ? effect : 0 };
  });
  return factors.map((f, i) => ({ f, i })).sort((a, b) => Math.abs(b.f.effect) - Math.abs(a.f.effect) || a.i - b.i).map((x) => x.f);
}

const reactorIds = (r: ExplainRecord): string[] => Object.keys(r.units).sort().filter((id) => r.units[id]!.rx !== undefined && r.units[id]!.info.Xeq !== undefined);

/** The reactor whose ceiling moved most between the runs (first by id when none moved). */
function mainReactor(prev: ExplainRecord, cur: ExplainRecord): string | null {
  let best: string | null = null, move = -1;
  for (const id of reactorIds(cur)) {
    const a = prev.units[id]?.info.Xeq, b = cur.units[id]!.info.Xeq!;
    const m = a === undefined ? 0 : Math.abs(b - a);
    if (m > move + 1e-12) { best = id; move = m; }
  }
  return best;
}

const sameDiag = (a: DiagLite[], code: string, unitId?: string): boolean => a.some((d) => d.code === code && (unitId === undefined || d.unitId === unitId));
const production = (prev: ExplainRecord, cur: ExplainRecord): { pchg: number; pmove: number } => {
  const c = rel(cur.kpis[HEADLINE] ?? 0, prev.kpis[HEADLINE] ?? 0);
  const v = Number.isFinite(c) ? c : 0;
  return { pchg: Math.abs(v), pmove: sgn(v) };
};
const ex = (key: string, vars: Vars, kpi: string, factors: Factor[], hint = true): Explanation => ({ key: 'why.' + key, vars, hint, kpi, factors });

/** Build the explanation of cur against prev. */
export function explainRun(prev: ExplainRecord, cur: ExplainRecord, resolve: ResolveFn): Explanation {
  const kpi = headlineKpi(prev, cur);
  // 1. a failed run: the coded failure is the goal that failed
  if (cur.failure) return ex(cur.failure.code, { unit: cur.failure.unitId ?? '', species: cur.failure.species ?? String(cur.failure.data.species ?? ''), ...cur.failure.data }, kpi, [], false);
  // 2. dynamic events
  const ev = cur.events.find((e) => e.code === 'RUNAWAY' && !prev.events.some((p) => p.code === 'RUNAWAY'));
  if (ev) return ex('RUNAWAY', { unit: ev.unitId ?? '', ...ev.data, time: ev.data.t ?? 0 }, kpi, []);
  const factors = rankFactors(prev, cur, kpi, resolve);
  const { pchg, pmove } = production(prev, cur);
  // 3. diagnostics that appeared with this run
  for (const d of cur.diag) {
    if (d.code === 'BELOW_LIGHTOFF' && !sameDiag(prev.diag, d.code, d.unitId)) {
      return ex('LIGHTOFF', { unit: d.unitId ?? '', T: Number(d.data.T), Tmin: Number(d.data.Tmin), X: cur.units[d.unitId ?? '']?.info.X ?? 0 }, kpi, factors);
    }
    if (d.code === 'AZEOTROPE_LIMIT' && !sameDiag(prev.diag, d.code, d.unitId)) {
      return ex('AZEOTROPE', { unit: d.unitId ?? '', xspec: Number(d.data.xspec), xaz: Number(d.data.xaz), P: Number(d.data.P) }, kpi, factors);
    }
  }
  // 4. the limiting reagent switched
  for (const id of reactorIds(cur)) {
    const a = prev.units[id]?.lim, b = cur.units[id]!.lim;
    if (a && b && a.species !== b.species) return ex('LIMITING', { unit: id, species: b.species, other: b.other, have: b.have, need: b.need, left: b.left }, kpi, factors);
  }
  // 5. the top changed setpoint, by (knob, physics)
  const top = factors[0];
  if (!top) return { key: '', vars: {}, hint: false, kpi, factors };
  const rid = mainReactor(prev, cur);
  const R: UnitFacts | undefined = rid ? cur.units[rid] : undefined, R0: UnitFacts | undefined = rid ? prev.units[rid] : undefined;
  const dir = sgn(top.to - top.from);
  const common = { unit: top.unitId, dir, pchg, pmove };
  const dW = (cur.kpis.electric_kw ?? 0) - (prev.kpis.electric_kw ?? 0);
  if (top.key === 'T' && R && R0 && R.rx) {
    const eta0 = R0.info.eta ?? 1, ceil = Math.abs(rel(R.info.Xeq!, R0.info.Xeq ?? R.info.Xeq!)) > 0.005;
    if (R.rx.dHkJ < 0 && eta0 >= ETA_EQ && ceil) {
      return ex('T_UP_EXO', { ...common, T0: top.from, T1: top.to, dH: R.rx.dHkJ, kmove: sgn((R.info.K ?? 0) - (R0.info.K ?? 0)), K0: R0.info.K ?? 0, K1: R.info.K ?? 0, xmove: sgn(R.info.Xeq! - (R0.info.Xeq ?? 0)), Xeq0: R0.info.Xeq ?? 0, Xeq1: R.info.Xeq!, eta0 }, kpi, factors);
    }
    if (eta0 < ETA_EQ) {
      return ex('T_UP_KIN', { ...common, T0: top.from, T1: top.to, eta0, xmove: sgn((R.info.X ?? 0) - (R0.info.X ?? 0)), X0: R0.info.X ?? 0, X1: R.info.X ?? 0, Xeq1: R.info.Xeq! }, kpi, factors);
    }
  }
  if (top.key === 'P' && R && R0 && R.rx) {
    const wv = { wmove: sgn(dW), dW: Math.abs(dW) };
    if (R.rx.dnGas === 0) return ex('P_UP_NODN', { ...common, P0: top.from, P1: top.to, eq: R.rx.eq, Xeq1: R.info.Xeq!, ...wv }, kpi, factors);
    return ex('P_UP_DN', { ...common, P0: top.from, P1: top.to, dn: R.rx.dnGas, xmove: sgn(R.info.Xeq! - (R0.info.Xeq ?? 0)), Xeq0: R0.info.Xeq ?? 0, Xeq1: R.info.Xeq!, ...wv }, kpi, factors);
  }
  if (R && R0 && R.inert && R0.inert && R.inert.species === R0.inert.species && Math.abs(R.inert.y - R0.inert.y) > 1e-9) {
    if (top.key === 'frac' && cur.units[top.unitId]?.type === 'splitter') {
      return ex('PURGE_DOWN', { ...common, f0: top.from, f1: top.to, species: R.inert.species, y0: R0.inert.y, y1: R.inert.y }, kpi, factors);
    }
    if (top.key === 'y_' + R.inert.species) {
      return ex('INERT_UP', { ...common, species: R.inert.species, y0: top.from, y1: top.to, xmove: sgn(R.info.Xeq! - (R0.info.Xeq ?? 0)), Xeq0: R0.info.Xeq ?? 0, Xeq1: R.info.Xeq! }, kpi, factors);
    }
  }
  return ex('GENERIC', { ...common, knob: top.key, v0: top.from, v1: top.to, kpi, k0: prev.kpis[kpi] ?? 0, k1: cur.kpis[kpi] ?? 0, kmove: sgn((cur.kpis[kpi] ?? 0) - (prev.kpis[kpi] ?? 0)) }, kpi, factors, false);
}

/** Prediction gap (DESIGN 7.4): null when the prediction is within `tol` (relative) of the engine value. */
export function predictGap(pred: number, actual: number, detail: 'rigorous' | 'textbook' | 'book', tol: number): Explanation | null {
  const gap = Math.abs(rel(pred, actual));
  if (!(gap > tol)) return null;
  return { key: detail === 'rigorous' ? 'why.PREDICT_GAP' : 'why.PREDICT_GAP_PLAIN', vars: { pred, act: actual, gap }, hint: false, kpi: '', factors: [] };
}

/** What a unit lacks to run, from the stored solve and the flowsheet: first open inlet port, else its own failure, else its own warning. */
export function needsOf(unitId: string, openInlets: string[], failure: ExplainRecord['failure'], diag: DiagLite[]): { code: string; vars: Vars } | null {
  if (openInlets.length > 0) return { code: 'INLET', vars: { unit: unitId, port: openInlets[0]! } };
  if (failure && failure.unitId === unitId) return { code: 'FAILED', vars: { unit: unitId, ...failure.data, fcode: failure.code } };
  const d = diag.find((x) => x.unitId === unitId && x.code !== 'PRICE_SKIPPED');
  return d ? { code: 'DIAG', vars: { unit: unitId, ...d.data, dcode: d.code } } : null;
}
