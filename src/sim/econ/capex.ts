// Capital cost (DESIGN §4.6): Turton purchased cost log10 Cp0 = K1 + K2 log10 A + K3 (log10 A)^2, pressure factor, material factor,
// bare module, CEPCI escalation, annualisation. Dollars are US$ of the requested year (default 2023, CEPCI 797.9); there is no FX here:
// a region whose prices are in another currency scales the result in the game layer. SI in, coded diagnostics out (no sentences).
import { dmath } from '@core/numerics';
import { CEPCI, GAME_YEAR, EQUIPMENT_ALIASES, findEquipment, type EquipmentRec, type Material } from '../../data/equipment';
import { failResult, okResult, type Diag, type SimResult } from '../types';

export type { Material };

/** What to price. `size` is in the row's unit (kW, m2, m3, L/s, kg/h); aliases are listed in data/equipment.ts. */
export interface CapexSpec {
  type: string;
  size: number;
  material?: Material;
  /** Design pressure, barg (default 0). */
  pBarg?: number;
  /** Vessel diameter, m (default: L/D = 3 from the volume). */
  diameterM?: number;
  /** Dollar year (default 2023). */
  year?: number;
  /** Pack-supplied multiplier from US$ to the pack currency (default 1). */
  capexCurrencyFactor?: number;
}

export interface CapexOut {
  type: string;
  /** Catalogue row used. */
  row: string;
  units: number;
  /** Size of each of the identical units. */
  sizeEach: number;
  /** Purchased cost of all units at the correlation's own basis year (2001 for Turton), US$. */
  cp0: number;
  fp: number;
  /** Material factor (bm forms) or the direct bare-module factor (fbm forms); 1 for Towler rows. */
  fm: number;
  /** Bare-module cost in US$ of `year`. */
  cbm: number;
  year: number;
  /** Absorber only: shell and packing, US$ of `year`. */
  parts?: { shell: number; packing: number };
}

/** Packed bed: catalyst volume / vessel volume (GAME). Absorber: packed volume / shell volume (GAME). */
export const BED_FILL = 0.6;
export const PACKED_FRACTION = 0.6;
/** Converter pressure classes, barg (the L10 100/200/300 bar steps). */
export const PRESSURE_CLASSES: readonly number[] = [100, 200, 300];
/** Vessel aspect ratio L/D used when no diameter is given (GAME). */
export const VESSEL_LD = 3;

export function escalate(cost: number, fromYear: number, toYear: number): number {
  const a = CEPCI[String(fromYear)], b = CEPCI[String(toYear)];
  if (a === undefined || b === undefined) throw new Error('CEPCI_YEAR');
  return (cost * b) / a;
}

/** Capital recovery factor i (1+i)^n / ((1+i)^n - 1); 10 %/yr over 15 years = 0.13147 (DESIGN §4.6). */
export function crf(rate: number, years: number): number {
  if (rate === 0) return 1 / years;
  const g = dmath.pow(1 + rate, years);
  return (rate * g) / (g - 1);
}
export interface AnnualOpts { rate?: number; years?: number; maintenance?: number }
/** Annualised capital: C_BM x (CRF + maintenance fraction), defaults 10 %, 15 yr, 4 %/yr (DESIGN §4.6). */
export function annualisedCapex(cbm: number, o: AnnualOpts = {}): number {
  return cbm * (crf(o.rate ?? 0.10, o.years ?? 15) + (o.maintenance ?? 0.04));
}

const cp0Of = (K: readonly [number, number, number], A: number): number => { const l = dmath.log10(A); return dmath.pow(10, K[0] + K[1] * l + K[2] * l * l); };
const fpLog = (C: readonly [number, number, number], P: number): number => { const l = dmath.log10(P); return dmath.pow(10, C[0] + C[1] * l + C[2] * l * l); };

interface Unit { cp0: number; fp: number; fm: number; cbm: number }

/** Material lookup with fallback Ni -> SS -> CS, SS -> CS. */
function pick(map: Readonly<Partial<Record<Material, number>>>, m: Material, diag: Diag[]): number {
  const order: Material[] = m === 'Ni' ? ['Ni', 'SS', 'CS'] : m === 'SS' ? ['SS', 'CS'] : ['CS'];
  for (const k of order) { const v = map[k]; if (v !== undefined) { if (k !== m) diag.push({ code: 'MATERIAL_FALLBACK', severity: 'info', data: { from: m, to: k } }); return v; } }
  return 1;
}

/** Price one unit of a row at size A (inside the range). Returns null when the pressure or diameter is unusable. */
function priceUnit(row: EquipmentRec, A: number, mat: Material, P: number, D: number, diag: Diag[]): Unit | null {
  const f = row.factors!;
  if (row.form === 'towler') { const c = f.a! + f.b! * dmath.pow(A, f.n!); return { cp0: c, fp: 1, fm: 1, cbm: c }; }
  const cp0 = cp0Of(row.K!, A);
  let fp = 1;
  if (row.fp?.C !== undefined) {
    if (P >= row.fp.Pmin!) fp = fpLog(row.fp.C, P);
    if (P > row.fp.Pmax!) diag.push({ code: 'PRESSURE_RANGE', severity: 'warn', data: { p: P, max: row.fp.Pmax! } });
  } else if (row.fp?.vessel !== undefined) {
    const { S, tmin } = row.fp.vessel;
    const den = 2 * (S - 0.6 * (P + 1));
    if (!(den > 0)) return null;
    fp = P < -0.5 ? 1 : Math.max(1, (((P + 1) * D) / den + 0.00315) / tmin);
  }
  if (row.form === 'fbm') { const fm = pick(f.fbm!, mat, diag); return { cp0, fp, fm, cbm: cp0 * fm }; }
  if (row.form === 'fbm_fp') { const fm = pick(f.fbm!, mat, diag); return { cp0, fp, fm, cbm: cp0 * fm * fp }; }
  const fm = pick(f.FM!, mat, diag);
  return { cp0, fp, fm, cbm: cp0 * (f.B![0] + f.B![1] * fm * fp) };
}

interface Priced { units: number; each: number; cp0: number; fp: number; fm: number; cbmBasis: number }

/** Size limits: below the range clamp to the smallest unit (info diag), above it several identical units (info diag). */
function priceRow(row: EquipmentRec, size: number, mat: Material, P: number, D: number | undefined, diag: Diag[]): Priced | { fail: string } {
  let n = 1, each = size;
  if (size < row.Amin) { diag.push({ code: 'SIZE_CLAMPED', severity: 'info', data: { size, min: row.Amin } }); each = row.Amin; }
  else if (size > row.Amax) { n = Math.ceil(size / row.Amax); each = size / n; diag.push({ code: 'SIZE_SPLIT', severity: 'info', data: { units: n, size, max: row.Amax } }); }
  let d = 0;
  if (row.fp?.vessel !== undefined) d = D !== undefined ? D / dmath.pow(n, 1 / 3) : dmath.pow((4 * each) / (Math.PI * VESSEL_LD), 1 / 3);
  const u = priceUnit(row, each, mat, P, d, diag);
  if (u === null) return { fail: 'PRESSURE_BAD' };
  return { units: n, each, cp0: u.cp0 * n, fp: u.fp, fm: u.fm, cbmBasis: u.cbm * n };
}

const classOf = (p: number): number | undefined => PRESSURE_CLASSES.find((c) => p <= c);

/** Price one piece of equipment (all identical units it splits into). Never throws. */
export function capexItem(spec: CapexSpec): SimResult<CapexOut> {
  const year = spec.year ?? GAME_YEAR;
  if (CEPCI[String(year)] === undefined) return failResult('CEPCI_YEAR', { year });
  const key = EQUIPMENT_ALIASES[spec.type] ?? spec.type;
  const row = findEquipment(key);
  if (row === undefined) return failResult('EQUIP_UNKNOWN', { type: spec.type });
  const size = spec.size;
  if (!(Number.isFinite(size) && size > 0)) return failResult('SIZE_BAD', { type: spec.type, size: Number.isFinite(size) ? size : 0 });
  const mat: Material = spec.material ?? 'CS';
  let P = spec.pBarg ?? 0;
  if (!Number.isFinite(P)) return failResult('PRESSURE_BAD', { type: spec.type });
  const diag: Diag[] = [];
  let vol = size;
  let packing: Priced | undefined;
  if (spec.type === 'converter' || spec.type === 'packed_bed_converter') {
    const c = classOf(P);
    if (c === undefined) return failResult('PRESSURE_CLASS', { type: spec.type, p: P, max: PRESSURE_CLASSES[PRESSURE_CLASSES.length - 1]! });
    diag.push({ code: 'RATING_CLASS', severity: 'info', data: { class: c, p: P } });
    P = c;
    if (spec.type === 'packed_bed_converter') vol = size / BED_FILL;
  }
  if (spec.type === 'absorber') {
    vol = size / PACKED_FRACTION;
    const pk = findEquipment('packing_loose')!;
    const r = priceRow(pk, size, mat, 0, undefined, diag);
    if ('fail' in r) return failResult(r.fail, { type: spec.type });
    packing = r;
  }
  const r = priceRow(row, vol, mat, P, spec.diameterM, diag);
  if ('fail' in r) return failResult(r.fail, { type: spec.type, p: P });
  const esc = CEPCI[String(year)]! / CEPCI[String(row.basis)]!;
  const fx = spec.capexCurrencyFactor ?? 1;
  const shell = r.cbmBasis * esc * fx;
  const pack = packing === undefined ? 0 : packing.cbmBasis * (CEPCI[String(year)]! / CEPCI['2001']!) * fx;
  const out: CapexOut = { type: spec.type, row: key, units: r.units, sizeEach: r.each, cp0: r.cp0, fp: r.fp, fm: r.fm, cbm: shell + pack, year };
  if (packing !== undefined) { out.parts = { shell, packing: pack }; out.cp0 += packing.cp0; }
  return okResult(out, diag);
}

export interface CapexTotal { total: number; items: CapexOut[] }
/** Sum of several items; the first failing item fails the total with its index. */
export function capexTotal(specs: readonly CapexSpec[]): SimResult<CapexTotal> {
  const items: CapexOut[] = [];
  const diag: Diag[] = [];
  let total = 0;
  for (let i = 0; i < specs.length; i++) {
    const r = capexItem(specs[i]!);
    if (!r.ok) return failResult(r.code, { ...r.data, index: i }, { diag });
    items.push(r.value); diag.push(...r.diag.map((d) => ({ ...d, data: { ...d.data, index: i } }))); total += r.value.cbm;
  }
  return okResult({ total, items }, diag);
}
