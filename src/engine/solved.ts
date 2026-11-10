// Derived data of a solved plant (never stored except the compact KPIs): feed sync, generic KPIs from the econ modules, the atom / energy /
// cost ledger, and the coded-message layer (diag -> t('fail.CODE' | 'info.CODE') with pack-formatted numbers).
import { formatNumber } from '@core/regions';
import { SPECIES } from '../data/species';
import { REGIONS } from '../regions';
import type { EqRegionData } from '../regions/data';
import { DISPLAY_PAIRS } from '../sim/si';
import { capexItem, annualCost, co2eTotalKgPerH, costPerTonne, gjPerTonne, opexPerHour, steamPricePerT, type CapexSpec, type Prices } from '../sim/econ';
import { enthalpyFlow, makeMixture, massFlow, totalFlow } from '../sim/thermo';
import { hasThermo } from '../sim/thermo/species';
import { R_GAS } from '../sim/thermo/shomate';
import type { Diag, SimCtx, StreamState, UnitInst } from '../sim/types';
import { t } from '../i18n';
import { en } from '../locales/en';
import type { DiagRec, EqState, FeedSpec, SolveResult } from '../state';
import { PHASE_CHANGE_TYPES } from './registry';
import { T_REJECT } from '../sim/units/utilities';

export const ctxOf = (s: Pick<EqState, 'species' | 'thermoDetail'>): SimCtx => ({ species: s.species.slice(), thermoDetail: s.thermoDetail });

/** Write a FeedSpec into the feed unit's params the way the feed unit operation reads them (flow, T, P, y_<species>). */
export function syncFeed(u: UnitInst, f: FeedSpec, species: string[]): void {
  const p: Record<string, number | string> = { flow: f.flow, T: f.T, P: f.P };
  species.forEach((id, i) => { p['y_' + id] = f.x[i] ?? 0; });
  u.params = p;
}

export const pricesOf = (s: Pick<EqState, 'region'>): Prices => REGIONS.get(s.region).data.prices;
const packOf = (region: string) => REGIONS.get(region);

// ---- unit helpers ----
interface Plumbing { inPipe: (u: string, port: string) => string | undefined; outPipe: (u: string, port: string) => string | undefined }
export function plumbing(s: Readonly<Pick<EqState, 'flowsheet'>>): Plumbing {
  const into = new Map<string, string>(), outOf = new Map<string, string>();
  for (const p of s.flowsheet.streams) { into.set(p.to.unit + '\u0001' + p.to.port, p.id); outOf.set(p.from.unit + '\u0001' + p.from.port, p.id); }
  return { inPipe: (u, port) => into.get(u + '\u0001' + port), outPipe: (u, port) => outOf.get(u + '\u0001' + port) };
}

/** Mass flow of a stream, kg/s. */
export const massOf = (species: string[], st: StreamState): number => species.every(hasThermo) ? massFlow(makeMixture(species), st.n) : st.n.reduce((a, n, i) => a + (n * (SPECIES[species[i]!]?.M ?? 0)) / 1000, 0);

// ---- KPIs ----
/** GAME sizing constants for equipment the unit operations do not size themselves. */
const U_HEAT = 500, DT_HEAT = 25, TAU_VESSEL = 60, TAU_BED = 5;
const gasVolFlow = (st: StreamState): number => (totalFlow(st.n) * R_GAS * st.T) / st.P;

export interface Economics { kpis: Record<string, number>; diag: DiagRec[]; capexItems: { unit: string; type: string; cbm: number }[]; opex: Record<string, number> }

/** Generic plant KPIs from the solved streams and unit results; always finite. Per-tonne figures are 1e9 when no product tank receives anything. */
export function economics(s: Readonly<EqState>, streams: Record<string, StreamState>, results: SolveResult['units']): Economics {
  const prices = pricesOf(s);
  const pl = plumbing(s);
  const diag: DiagRec[] = [];
  const sp = s.species;
  let shaftW = 0, electricW = 0, fuelDutyW = 0, steamBoughtKgS = 0, steamRaisedKgS = 0, coolingW = 0, productKgS = 0, feedKgS = 0;
  const refrig: { dutyW: number; tColdK: number }[] = [];
  const feeds: { key: string; kgPerS: number }[] = [];
  const specs: { unit: string; spec: CapexSpec }[] = [];
  const barg = (st: StreamState | undefined): number => (st ? Math.max(0, (st.P - 101325) / 1e5) : 0);
  const sized = (unit: string, spec: CapexSpec): void => { if (spec.size > 0 && Number.isFinite(spec.size)) specs.push({ unit, spec }); };
  for (const u of s.flowsheet.units) {
    const r = results[u.id];
    if (!r) continue;
    const info = r.info, inlet = (port: string): StreamState | undefined => { const id = pl.inPipe(u.id, port); return id ? streams[id] : undefined; };
    const outlet = (port: string): StreamState | undefined => { const id = pl.outPipe(u.id, port); return id ? streams[id] : undefined; };
    const q = Math.abs(r.duty ?? 0);
    switch (u.type) {
      case 'feed': {
        const st = outlet('out'); if (!st) break;
        const kg = massOf(sp, st); feedKgS += kg;
        const key = s.feeds[u.id]?.priceKey ?? '';
        if (key !== '') { const un = (prices[key] as { unit?: string } | undefined)?.unit; if (prices[key] && (un === 'per t' || un === 'per kg')) feeds.push({ key, kgPerS: kg }); else diag.push({ code: 'PRICE_SKIPPED', severity: 'info', unitId: u.id, data: { key } }); }
        break;
      }
      case 'compressor': {
        shaftW += r.work ?? 0; electricW += info.electric_W ?? 0;
        sized(u.id, { type: 'compressor', size: info.shaft_kW ?? 0, pBarg: barg(outlet('out')) });
        break;
      }
      case 'heater': case 'cooler': {
        const util = String(u.params.utility ?? '');
        if (util === 'fired') { fuelDutyW += q; sized(u.id, { type: 'furnace', size: q / 1000, pBarg: barg(inlet('in')) }); }
        else {
          if (util === 'steam') { steamBoughtKgS += info.steam_kg_s ?? 0; fuelDutyW += 0; }
          else if (util === 'cw') coolingW += info.cw_duty_W ?? 0;
          else if (util === 'refrig') refrig.push({ dutyW: q, tColdK: info.T_utility ?? 240 });
          sized(u.id, { type: 'hx', size: q / (U_HEAT * DT_HEAT), pBarg: barg(inlet('in')) });
        }
        break;
      }
      case 'hx': sized(u.id, { type: 'hx', size: info.area ?? 0, pBarg: Math.max(barg(inlet('hot_in')), barg(inlet('cold_in'))) }); break;
      case 'flash': {
        const st = inlet('in'); if (st) sized(u.id, { type: 'flash_drum', size: gasVolFlow(st) * TAU_VESSEL, pBarg: barg(st) });
        // a drum held below cooling-water temperature that has to pull heat out (latent heat of the condensate) is a refrigeration load, priced on the COP path like the NH3 separator
        const Tdrum = info.T ?? Number.POSITIVE_INFINITY, Qd = r.duty ?? 0;
        if (Qd < 0 && Tdrum < T_REJECT) refrig.push({ dutyW: -Qd, tColdK: Tdrum });
        break;
      }
      case 'nh3_sep': {
        const st = inlet('in'); if (st) sized(u.id, { type: 'flash_drum', size: gasVolFlow(st) * TAU_VESSEL, pBarg: barg(st) });
        if ((info.refrig_electric_W ?? 0) > 0) refrig.push({ dutyW: Math.max(0, -(r.duty ?? 0)), tColdK: info.T_sep ?? 253.15 });
        break;
      }
      case 'boiler': steamRaisedKgS += info.steam_kg_s ?? 0; sized(u.id, { type: 'boiler', size: (info.steam_kg_s ?? 0) * 3600, pBarg: barg(inlet('in')) }); break;
      case 'absorber': { const st = inlet('in'); if (st) sized(u.id, { type: 'absorber', size: gasVolFlow(st) * TAU_BED, pBarg: barg(st) }); break; }
      case 'column': {
        steamBoughtKgS += info.steam_kg_s ?? 0; coolingW += info.cw_duty_W ?? 0;
        const st = inlet('in'); sized(u.id, { type: 'vessel_vertical', size: info.vol_m3 ?? 0, pBarg: barg(st) });
        break;
      }
      case 'fermenter': { coolingW += info.cw_duty_W ?? 0; const st = inlet('in'); sized(u.id, { type: 'reactor', size: info.vol_m3 ?? 0, pBarg: barg(st) }); break; }
      case 'tubular': steamRaisedKgS += (info.q_cool ?? 0) / 2361e3; break; // the boiling-water coolant raises steam (credited at the plant's steam latent heat constant)
      case 'product': { const st = inlet('in'); if (st) productKgS += massOf(sp, st); break; }
      default: break;
    }
  }
  let cbm = 0; const capexItems: Economics['capexItems'] = [];
  for (const { unit, spec } of specs) {
    const c = capexItem(spec);
    if (c.ok) { cbm += c.value.cbm; capexItems.push({ unit, type: spec.type, cbm: c.value.cbm }); for (const d of c.diag) diag.push({ ...d, unitId: unit, data: d.data }); }
    else diag.push({ code: c.code, severity: 'warn', unitId: unit, data: c.data });
  }
  const steamRaisedW = steamRaisedKgS * 2361e3;
  const ox = opexPerHour({ shaftW: 0, electricW, firedDutyW: fuelDutyW, steamRaisedW, coolingW, refrig, feeds }, prices);
  const grid = (packOf(s.region).data as EqRegionData).limits.grid_t_co2_per_mwh;
  const steamCost = (steamBoughtKgS * 3.6) * (prices.steam_water_treatment ? steamPricePerT(prices) : 0);
  const opexTotal = (ox.ok ? ox.value.total : 0) + steamCost;
  if (!ox.ok) diag.push({ code: ox.code, severity: 'warn', data: ox.data });
  const co2e = co2eTotalKgPerH({ fuelDutyW, electricW }, grid);
  const productTph = productKgS * 3.6;
  const prod = productTph > 0;
  const annual = annualCost(cbm, opexTotal);
  const energyW = electricW + fuelDutyW / 0.85;
  const kpis: Record<string, number> = {
    product_t_per_h: productTph, feed_t_per_h: feedKgS * 3.6, electric_kw: electricW / 1e3, shaft_kw: shaftW / 1e3, fired_duty_kw: fuelDutyW / 1e3,
    cooling_kw: coolingW / 1e3, steam_bought_t_per_h: steamBoughtKgS * 3.6, steam_raised_t_per_h: steamRaisedKgS * 3.6,
    capex_usd: cbm, opex_usd_per_h: opexTotal, annual_cost_usd: annual.total, co2e_kg_per_h: co2e,
    cost_usd_per_t: prod ? costPerTonne(annual.total, productTph) : 1e9,
    energy_gj_per_t: prod ? gjPerTonne(energyW, productKgS) : 1e9,
    co2e_t_per_t: prod ? co2e / 1000 / productTph : 1e9,
  };
  if (!prod) diag.push({ code: 'NO_PRODUCT', severity: 'info', data: {} });
  for (const k of Object.keys(kpis)) if (!Number.isFinite(kpis[k]!)) kpis[k] = 1e9;
  return { kpis, diag, capexItems, opex: ox.ok ? { ...ox.value, steam: steamCost } : {} };
}

// ---- ledger ----
/** Per-element relative imbalance is taken against max(element flow, 1e-6 of the plant's atom throughput, 1e-6 mol/s): trace elements are not
 *  held to 1e-9 of their own dust (warm-started loops leave 1e-17 mol/s residues), while a real leak of a trace element still shows. */
const ATOM_TRACE = 1e-6, ATOM_FLOOR = 1e-6;
export interface Ledger {
  atoms: { element: string; in: number; out: number; rel: number }[];
  /** Largest relative atom imbalance. */
  atomRel: number;
  energy: { in: Record<string, number>; out: Record<string, number>; closure: number | null };
  cost: { capex: { unit: string; type: string; cbm: number }[]; opex: Record<string, number>; annual: number } | null;
}

/** Atom balance per element (feeds + make-up water in, sinks out), energy by category (W) and the cost breakdown, from the stored solve. */
export function ledgerOf(s: Readonly<EqState>, withCost = true): Ledger | null {
  const sol = s.solved;
  if (!sol || !sol.ok) return null;
  const pl = plumbing(s), sp = s.species;
  const atomsOf = (n: number[]): Record<string, number> => {
    const o: Record<string, number> = {};
    sp.forEach((id, i) => { const el = SPECIES[id]?.elements ?? {}; for (const [e, c] of Object.entries(el)) o[e] = (o[e] ?? 0) + c * n[i]!; });
    return o;
  };
  const inA: Record<string, number> = {}, outA: Record<string, number> = {};
  const add = (to: Record<string, number>, from: Record<string, number>): void => { for (const [k, v] of Object.entries(from)) to[k] = (to[k] ?? 0) + v; };
  const canE = sp.every((id) => hasThermo(id));
  const mx = canE ? makeMixture(sp) : null;
  const eIn: Record<string, number> = { feeds: 0, heat: 0, shaft: 0, makeup: 0 }, eOut: Record<string, number> = { products: 0 };
  const bump = (o: Record<string, number>, k: string, v: number): void => { o[k] = (o[k] ?? 0) + v; };
  let phaseChange = false;
  for (const u of s.flowsheet.units) {
    const r = sol.units[u.id];
    if (PHASE_CHANGE_TYPES.includes(u.type)) phaseChange = true;
    if (u.type === 'feed') { const id = pl.outPipe(u.id, 'out'); if (id && sol.streams[id]) { add(inA, atomsOf(sol.streams[id]!.n)); if (mx) eIn.feeds! += enthalpyFlow(mx, sol.streams[id]!); } }
    const mk = r?.info.water_makeup_mol_s ?? 0;
    if (mk > 0) {
      const w = sp.indexOf('H2O(l)') >= 0 ? 'H2O(l)' : sp.indexOf('H2O') >= 0 ? 'H2O' : '';
      const el = SPECIES[w]?.elements ?? { H: 2, O: 1 };
      for (const [e, c] of Object.entries(el)) bump(inA, e, c * mk);
    }
    if (u.type === 'absorber' && mx && (r?.info.water_makeup_mol_s ?? 0) > 0) { /* make-up enthalpy is inside the unit's duty basis */ }
    if (r?.duty !== undefined && r.duty !== 0) {
      const cat = u.type === 'heater' || u.type === 'cooler' ? (String(u.params.utility ?? '') || 'process') : u.type === 'boiler' ? 'steam_raised' : u.type === 'compressor' ? 'intercooling' : u.type === 'nh3_sep' ? 'refrigeration' : u.type;
      if (r.duty > 0) bump(eIn, 'heat', r.duty); else bump(eOut, 'heat_' + cat, -r.duty);
    }
    if (r?.work) bump(eIn, 'shaft', r.work);
    if (u.type === 'product' || u.type === 'sink' || u.type === 'vent' || u.type === 'stack' || u.type === 'relief' || u.type === 'flare') {
      const id = pl.inPipe(u.id, 'in');
      if (id && sol.streams[id]) { add(outA, atomsOf(sol.streams[id]!.n)); if (mx) eOut.products! += enthalpyFlow(mx, sol.streams[id]!); }
    }
  }
  const throughput = Math.max(...Object.values(inA), ...Object.values(outA), 0);
  const atoms = Object.keys({ ...inA, ...outA }).sort().map((e) => {
    const a = inA[e] ?? 0, b = outA[e] ?? 0;
    return { element: e, in: a, out: b, rel: Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), ATOM_TRACE * throughput, ATOM_FLOOR) };
  });
  let closure: number | null = null;
  if (mx && !phaseChange) {
    const tin = Object.values(eIn).reduce((a, b) => a + b, 0), tout = Object.values(eOut).reduce((a, b) => a + b, 0);
    const big = Math.max(Math.abs(tin), Math.abs(tout), ...Object.values(eIn).map(Math.abs), ...Object.values(eOut).map(Math.abs), 1e-30);
    closure = Math.abs(tin - tout) / big;
  }
  const ec = withCost ? economics(s, sol.streams, sol.units) : null;
  return { atoms, atomRel: atoms.reduce((m, a) => Math.max(m, a.rel), 0), energy: { in: eIn, out: eOut, closure }, cost: ec ? { capex: ec.capexItems, opex: ec.opex, annual: ec.kpis.annual_cost_usd ?? 0 } : null };
}

// ---- messages ----
const TEMP = new Set(['T', 'T_out', 'T_in', 'T_limit', 'T_hot_in', 'T_cold_in', 'T_hot_out', 'T_cold_out', 'T_steam', 'T_max', 'Tlo', 'Thi', 'T_sep']);
const PRESS = new Set(['P', 'Pin', 'Pout', 'Pmax', 'Pmin', 'Ph', 'Pc', 'Pset']);
const FRACTION = new Set(['frac', 'acid', 'recovery', 'extrapolated', 'gain', 'xD', 'x_az', 'wt_az']);

/** Number with 3-4 significant digits, pack grouping. */
export function fmtNumber(x: number, region: string): string {
  if (!Number.isFinite(x)) return formatNumber(x, packOf(region));
  const a = Math.abs(x);
  const d = Number.isInteger(x) ? 0 : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : a === 0 ? 0 : 5;
  const pack = packOf(region), txt = formatNumber(x, pack, d), dec = pack.numbers.decimal;
  return d > 0 && txt.includes(dec) ? txt.replace(new RegExp(`0+$`), '').replace(new RegExp(`\\${dec}$`), '') : txt;
}
/** Display text of an SI value in the knob's display unit (for range messages). */
export function fmtDisplay(x: number, unit: string, region: string): string {
  const pair = DISPLAY_PAIRS[unit];
  return fmtNumber(pair ? pair.fromSI(x) : x, region) + (unit === '' ? '' : ' ' + (unit === 'degC' ? '°C' : unit === 'mol%' ? '%' : unit));
}

export function speciesName(id: string): string { return SPECIES[id]?.name ?? id; }

/** Template variables of a coded diag: unit, species name and every data field, formatted for the player. */
export function messageVars(d: { code: string; unitId?: string; species?: string; data: Record<string, number | string> }, region: string): Record<string, string | number> {
  const v: Record<string, string | number> = { unit: d.unitId ?? '', species: speciesName(d.species ?? String(d.data.species ?? '')), code: d.code };
  const pct = d.code === 'CONVERSION_EXCEEDS_LIMITING' || d.code === 'CONVERSION_RANGE';
  for (const [k, x] of Object.entries(d.data)) {
    if (typeof x === 'string') { v[k] = k === 'species' || k === 'limiting' ? speciesName(x) : x; continue; }
    if (TEMP.has(k)) v[k] = fmtDisplay(x, 'degC', region);
    else if (PRESS.has(k)) v[k] = fmtDisplay(x, 'bar', region);
    else if (FRACTION.has(k) || (pct && (k === 'asked' || k === 'max'))) v[k] = fmtNumber(x * 100, region) + ' %';
    else if (k === 'inflow') v[k] = fmtDisplay(x, 'kmol/h', region);
    else v[k] = fmtNumber(x, region);
  }
  return v;
}

/** The player-facing message of a coded diag: fail.CODE for failures, info.CODE for info and warn (falling back to fail.CODE, then fail.UNKNOWN). */
export function messageOf(d: Pick<Diag, 'code' | 'severity' | 'unitId' | 'species' | 'data'>, region: string): string {
  const order = d.severity === 'fail' ? ['fail.', 'info.'] : ['info.', 'fail.'];
  const key = order.map((p) => p + d.code).find((k) => k in en) ?? 'fail.UNKNOWN';
  return t(key, messageVars(d, region));
}

/** Largest-remainder rounding of fractions to `n` whole counts (ties broken by lower index): counts always sum to n. */
export function largestRemainder(weights: number[], n: number): number[] {
  const tot = weights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (!(tot > 0) || n <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => ((w > 0 ? w : 0) / tot) * n);
  const out = raw.map((x) => Math.floor(x));
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k]!.i]!++;
  return out;
}
