// Regional parameters of EQUILIBRIUM (DESIGN §11.1). Physics and chemistry are region-independent: a pack changes prices, limits,
// names, standards labels and the exam problem set, never a law or a constant of nature. src/sim and src/data never import this
// folder (regions.test.ts checks it statically).
import type { RegionPack } from '@core/regions';
import type { Conf } from '../sim/types';

/** The 14 price rows of DESIGN §4.7. Levels reference them by key (`price.gas_default`), never by number. */
export const PRICE_KEYS = [
  'gas_default', 'gas_cheap', 'electricity', 'steam_water_treatment', 'cooling_water', 'carbon', 'carbon_export',
  'ammonia', 'urea', 'sulfur', 'sulfuric_acid', 'methanol', 'ethanol', 'hydrogen',
] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

/** Level ids that carry a leaderboard seed: the prologue L00 and L01..L28 (DESIGN §2.6). */
export const LEVEL_IDS: string[] = Array.from({ length: 29 }, (_, i) => `L${String(i).padStart(2, '0')}`);
/** The exam-bridge levels whose problem set is pack data (DESIGN §7.7). */
export const EXAM_LEVELS = ['L04', 'L09', 'L14', 'L18', 'L20A'] as const;
export type BenchKey = string;
export type CharacterId = string;
export const CAST_ROLES = ['mentor', 'supervisor', 'manager', 'safety'] as const;
export const CONFS: Conf[] = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'];

export interface PriceRow { value: number; unit: string; src: string; conf: Conf }

/** One exam-bridge problem: its id (the oracle id), where it comes from and the problem's own numbers (SI-free, as the book prints them). */
export interface ExamProblem { id: string; citation: string; numbers: Record<string, number> }

export interface EqRegionData {
  /** DESIGN §4.7 rows, in the pack's own currency (no runtime FX anywhere). */
  prices: Record<PriceKey, PriceRow>;
  limits: {
    /** kg SO2 per t of 100 % H2SO4 (level L25): standard, strict and expert. */
    so2_standard: number; so2_strict: number; so2_expert: number;
    /** BAT range for N2O from nitric acid, kg per t of HNO3. */
    n2o_bat: [number, number];
    grid_t_co2_per_mwh: number; carbon_price: number;
    src: Record<string, string>;
  };
  benchmarks: Partial<Record<BenchKey, { value: number; src: string }>>;
  standardsLabels: { relief: string; alarms: string; flammability: string; emissions: string };
  /** Role to character id; `cast.<id>.name` and `cast.<id>.title` must exist in pack.strings. */
  cast: Record<(typeof CAST_ROLES)[number], CharacterId>;
  /** String keys (into pack.strings) of the setting. */
  setting: { worksName: string; coast: string; setDressing: string[] };
  examSet: { id: string; levels: Record<string, ExamProblem> };
  leaderboardSeeds: Record<string, number>;
}

/** Leaderboard seeds default to 1000 + the level number (BUILD-PLAN decisions table). */
export function defaultSeeds(): Record<string, number> {
  const o: Record<string, number> = {};
  LEVEL_IDS.forEach((id, i) => { o[id] = 1000 + i; });
  return o;
}

/** The exam problems' own numbers are chemistry, so they are identical in every pack; only citations and framing are regional. */
export const EXAM_NUMBERS: Record<(typeof EXAM_LEVELS)[number], { id: string; numbers: Record<string, number> }> = {
  L04: { id: 'EQ-NC-005', numbers: { n2_g: 2000, h2_g: 1000, nh3_g: 2431.84 } },
  L09: { id: 'EQ-NC-016/019/021', numbers: { dhc_c_kj_mol: -393.5, co2_g: 35.2, heat_kj: -314.8, dhvap_kj_mol: 40.79, duvap_kj_mol: 37.6889, dh_kj: 400, ds_kj_k: 0.2, t_spont_k: 2000 } },
  L14: { id: 'EQ-NC-024', numbers: { n2o4_g: 13.8, v_l: 1, t_k: 400, p_bar: 9.15, r_book: 0.083, kp_bar: 85.87, alpha: 0.837, kc_mol_l: 2.59 } },
  L18: { id: 'EQ-NC-038/042', numbers: { k_per_s: 1.15e-3, m0_g: 5, m_g: 3, t_s: 444.196, t1_k: 293, t2_k: 313, rate_ratio: 4, ea_kj_mol: 52.8503 } },
  L20A: { id: 'EQ-CE-006', numbers: { n2_kmol_h: 249, h2_kmol_h: 748, ar_kmol_h: 3, conv_n2: 0.25, purge_frac: 0.05, ar_pct_inlet: 1.69 } },
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Every problem with a pack's data, as readable strings (empty = valid). Used as the registry's `validateData`. */
export function validateEqRegion(d: EqRegionData): string[] {
  const e: string[] = [];
  if (!d || typeof d !== 'object') return ['must be an object'];
  const pr: any = d.prices;
  if (!pr || typeof pr !== 'object') e.push('prices is missing');
  else {
    for (const k of PRICE_KEYS) {
      const r = pr[k];
      if (!r || typeof r !== 'object') { e.push(`prices.${k} is missing`); continue; }
      if (!isNum(r.value)) e.push(`prices.${k}.value must be a finite number`);
      else if (r.value < 0) e.push(`prices.${k}.value must not be negative`);
      if (!nonEmpty(r.unit)) e.push(`prices.${k}.unit must be non-empty`);
      if (!nonEmpty(r.src)) e.push(`prices.${k}.src must be a non-empty citation`);
      if (!CONFS.includes(r.conf)) e.push(`prices.${k}.conf must be one of ${CONFS.join('|')} (got ${String(r.conf)})`);
    }
    for (const k of Object.keys(pr)) if (!(PRICE_KEYS as readonly string[]).includes(k)) e.push(`prices.${k} is not a known price key`);
  }
  const l: any = d.limits;
  if (!l || typeof l !== 'object') e.push('limits is missing');
  else {
    for (const k of ['so2_standard', 'so2_strict', 'so2_expert', 'grid_t_co2_per_mwh', 'carbon_price']) if (!isNum(l[k])) e.push(`limits.${k} must be a finite number`);
    if (isNum(l.so2_strict) && isNum(l.so2_standard) && !(l.so2_strict < l.so2_standard)) e.push('limits.so2_strict must be below so2_standard');
    if (isNum(l.so2_expert) && isNum(l.so2_strict) && !(l.so2_expert < l.so2_strict)) e.push('limits.so2_expert must be below so2_strict');
    if (!Array.isArray(l.n2o_bat) || l.n2o_bat.length !== 2 || !l.n2o_bat.every(isNum) || l.n2o_bat[0] > l.n2o_bat[1]) e.push('limits.n2o_bat must be [low, high] finite numbers');
    if (!l.src || typeof l.src !== 'object') e.push('limits.src is missing');
    else for (const k of ['so2_standard', 'so2_strict', 'so2_expert', 'n2o_bat', 'grid_t_co2_per_mwh', 'carbon_price']) if (!nonEmpty(l.src[k])) e.push(`limits.src.${k} must be a non-empty citation`);
  }
  if (d.benchmarks && typeof d.benchmarks === 'object') {
    for (const [k, b] of Object.entries(d.benchmarks)) { if (!b || !isNum(b.value) || !nonEmpty(b.src)) e.push(`benchmarks.${k} needs a finite value and a src`); }
  } else e.push('benchmarks must be an object');
  const sl: any = d.standardsLabels;
  for (const k of ['relief', 'alarms', 'flammability', 'emissions']) if (!nonEmpty(sl?.[k])) e.push(`standardsLabels.${k} must be non-empty`);
  const c: any = d.cast;
  for (const r of CAST_ROLES) if (!nonEmpty(c?.[r])) e.push(`cast.${r} must be a character id`);
  const s: any = d.setting;
  if (!nonEmpty(s?.worksName) || !nonEmpty(s?.coast) || !Array.isArray(s?.setDressing) || s.setDressing.some((x: unknown) => !nonEmpty(x))) e.push('setting needs worksName, coast and setDressing string keys');
  const x: any = d.examSet;
  if (!x || !nonEmpty(x.id) || !x.levels || typeof x.levels !== 'object') e.push('examSet needs an id and levels');
  else for (const lv of EXAM_LEVELS) {
    const p = x.levels[lv];
    if (!p) { e.push(`examSet.levels.${lv} is missing`); continue; }
    if (!nonEmpty(p.id)) e.push(`examSet.levels.${lv}.id must be non-empty`);
    if (!nonEmpty(p.citation)) e.push(`examSet.levels.${lv}.citation must be non-empty`);
    if (!p.numbers || typeof p.numbers !== 'object' || Object.keys(p.numbers).length === 0 || !Object.values(p.numbers).every(isNum)) e.push(`examSet.levels.${lv}.numbers must be finite numbers`);
  }
  const ls: any = d.leaderboardSeeds;
  if (!ls || typeof ls !== 'object') e.push('leaderboardSeeds is missing');
  else for (const id of LEVEL_IDS) if (!Number.isInteger(ls[id])) e.push(`leaderboardSeeds.${id} must be an integer`);
  return e;
}

/** Checks that need the pack's strings: cast ids, setting keys. (The registry's validateData only sees `data`.) */
export function validateEqPackStrings(p: Pick<RegionPack<EqRegionData>, 'id' | 'strings' | 'data'>): string[] {
  const e: string[] = [];
  const at = (m: string) => `region '${p.id}': ${m}`;
  const has = (k: string) => nonEmpty(p.strings[k]);
  for (const role of CAST_ROLES) {
    const id = p.data.cast?.[role];
    if (!id) continue;
    for (const f of ['name', 'title']) if (!has(`cast.${id}.${f}`)) e.push(at(`strings.cast.${id}.${f} is missing (cast.${role})`));
  }
  const s = p.data.setting;
  if (s) for (const k of [s.worksName, s.coast, ...s.setDressing]) if (!has(k)) e.push(at(`strings.${k} is missing (setting)`));
  return e;
}
