// unitCard(id) and legalPorts(unit, port): everything Inspect shows about a unit, and where a pipe from/to a port may go.
import { fail } from '@core/kit';
import type { QueryFn } from '@core/kit';
import { t } from '../../i18n';
import { en } from '../../locales/en';
import type { EqState } from '../../state';
import { connectProblem } from '../actions/design';
import { defOf, footprint, hasUnitType, metaOf } from '../registry';
import type { KnobSpec } from '../registry';
import { DISPLAY_PAIRS } from '../../sim/si';
import { messageOf } from '../solved';
import { CATALYSTS, findCatalyst } from '../../data/catalysts';

const find = (s: Readonly<EqState>, id: unknown) => {
  const u = s.flowsheet.units.find((x) => x.id === id);
  if (!u) fail(t('err.unit.unknown', { id: String(id) }));
  return u;
};

function catalystKnob(current: string | undefined) {
  const laws = current !== undefined ? findCatalyst(current)?.lawIds ?? [] : [];
  const options = CATALYSTS.filter((c) => c.rhoB > 0 && c.lawIds.length > 0 && (laws.length === 0 || c.lawIds.some((l) => laws.includes(l))))
    .map((c) => ({ id: c.id, name: c.name, price: c.price, lightOffC: c.TlightOff, dTk: c.dTk, tmin: c.Tmin, tmax: c.Tmax }));
  return { id: current ?? null, options };
}

/** The knob's numbers in the unit the player reads (`unitLabel ?? unit`): `disp` = {value, min, max, coarse, fine, unit}. */
function dispOf(k: KnobSpec, v: number | string): { disp?: { value: number; min: number; max: number; coarse: number; fine: number; unit: string } } {
  const pair = DISPLAY_PAIRS[k.unit];
  if (k.kind !== 'num' || typeof v !== 'number') return {};
  const f = pair ? pair.fromSI : (x: number): number => x;
  const step = (x: number): number => (k.unit === 'degC' ? x : f(x));
  return { disp: { value: f(v), min: f(k.min), max: f(k.max), coarse: step(k.coarse), fine: step(k.fine), unit: k.unitLabel ?? k.unit } };
}

/** The steady-solve temperatures with the live dynamic T replacing the unit's own T / T_out while a shift runs. */
function liveT(s: Readonly<EqState>, id: string, c: Record<string, number> | null): Record<string, number> | null {
  const lv = liveOf(s, id);
  if (lv === null || c === null) return c;
  const o = { ...c };
  for (const k of ['T', 'T_out', 'Tout', 'T_c']) if (k in o) o[k] = lv.C;
  return o;
}
function liveOf(s: Readonly<EqState>, id: string): { T: number; C: number } | null {
  const sh = s.shift;
  if (!sh || sh.ended !== '') return null;
  const dc = sh.dc[id];
  const out = s.flowsheet.streams.find((p) => p.from.unit === id);
  const T = dc !== undefined ? dc.T : out !== undefined ? sh.disp[out.id]?.T : undefined;
  return T !== undefined && Number.isFinite(T) && T > 0 ? { T, C: T - 273.15 } : null;
}

export const unitQueries: Record<string, QueryFn<EqState>> = {
  unitCard: (s, id: unknown) => {
    const u = find(s, id);
    const def = hasUnitType(u.type) ? defOf(u.type) : { inlets: [], outlets: [] };
    const m = metaOf(u.type);
    const sol = s.solved;
    const pipe = (port: string, inlet: boolean) => s.flowsheet.streams.find((p) => (inlet ? p.to : p.from).unit === u.id && (inlet ? p.to : p.from).port === port)?.id ?? null;
    const diags = (sol?.diag ?? []).filter((d) => d.unitId === u.id).map((d) => ({ code: d.code, severity: d.severity, data: d.data, message: messageOf(d, s.region) }));
    return {
      id: u.id, type: u.type, label: t(`label.unit.${('label.unit.' + u.type) in en ? u.type : 'other'}`), pos: u.pos, rot: u.rot, footprint: footprint(u.type, u.rot), cat: m.cat,
      params: u.params, catalystId: u.catalystId ?? null,
      /** The catalyst choice knob of a reactor: the current id and the catalysts that run the same law (all packed-bed catalysts when none is set). Act with setCatalyst(unit, id). */
      catalyst: m.catalyst === true ? catalystKnob(u.catalystId) : null,
      knobs: m.knobs.filter((k) => !(k.key === 'utility' && s.presets[u.type]?.process === 1)).map((k) => ({ ...k, label: t(`label.knob.${k.key}`), value: u.params[k.key] ?? (k.kind === 'choice' && k.def === '' ? '' : k.def), isDefault: (u.params[k.key] ?? k.def) === k.def, ...dispOf(k, u.params[k.key] ?? k.def) })),
      inlets: def.inlets.map((port) => ({ port, label: t(`label.port.${port}`), stream: pipe(port, true) })),
      outlets: def.outlets.map((port) => ({ port, label: t(`label.port.${port}`), stream: pipe(port, false) })),
      feed: s.feeds[u.id] ?? null,
      results: sol?.ok ? sol.units[u.id] ?? null : null,
      /** The temperatures of the unit's results in degC (the panel shows these, not the K the solver keeps). */
      resultsC: liveT(s, u.id, sol?.ok && sol.units[u.id] ? Object.fromEntries(Object.entries(sol.units[u.id]!.info).filter(([k, v]) => /^T(_?(max|min|in|out|hot|cold|c))?$/i.test(k) && Number.isFinite(v)).map(([k, v]) => [k, v - 273.15])) : null),
      /** During a shift: the live dynamic temperature (K) of the unit, not the steady solve (the reactor's own state, or the stream leaving it); null otherwise. */
      live: liveOf(s, u.id),
      diags, failed: sol?.failedUnits.includes(u.id) ?? false,
    };
  },
  /** Ports a pipe at (unit, port) may legally go to right now: an outlet lists free inlets, an inlet lists free outlets. */
  legalPorts: (s, unitId: unknown, port: unknown) => {
    const u = find(s, unitId);
    const p = String(port);
    const d = defOf(u.type);
    const isOut = d.outlets.includes(p);
    if (!isOut && !d.inlets.includes(p)) fail(t('err.connect.no_port', { unit: u.id, port: p, ports: [...d.outlets, ...d.inlets].join(', ') }));
    const out: { unit: string; port: string }[] = [];
    for (const o of s.flowsheet.units) {
      if (!hasUnitType(o.type)) continue;
      const od = defOf(o.type);
      for (const q of isOut ? od.inlets : od.outlets) {
        const bad = isOut ? connectProblem(s, u, p, o, q) : connectProblem(s, o, q, u, p);
        if (!bad) out.push({ unit: o.id, port: q });
      }
    }
    return { unit: u.id, port: p, direction: isOut ? 'out' : 'in', targets: out };
  },
};
