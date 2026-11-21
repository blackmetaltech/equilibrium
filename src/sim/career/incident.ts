// Career incidents that open a real plant (F29, 0.8 gate "the plant behind the numbers"). An event in the Career raises an incident on one plant; the board offers three honest
// answers: GO TO THE PLANT (an incident level built with the normal level machinery, pre-loaded with the Career plant's state), CALL THE CONTRACTOR (cash, a stated fix), or
// IGNORE IT (a stated penalty). Whatever is chosen sets the plant's output factor `outF` and its gas-per-tonne factor `gasF` for the incident's months; the month does not advance
// while the player is in the plant. Pure, deterministic, plain JSON; no engine import (the plant result arrives as numbers the incident level measured, and is re-checked here).
//
// The seam: `INCIDENT_DEFS` names each incident (the event that raises it, its plant, the level that fixes it, its months, the contractor's price and what the contractor and
// "ignore" do). One incident is built end to end: inerts in the ammonia loop feed (the L20 purge loop, re-tuned).
// All numbers are GAME rules (conf GAME, UNVERIFIED). The tables are the engine's own L20 loop results, re-derived by src/levels/f29_incident.test.ts.
import type { PlantId } from './model';

export type IncidentId = 'nh3_inerts';
export type IncidentChoice = '' | 'plant' | 'contractor' | 'ignore';

/** One incident as the Career stores it (absent in older saves). `choice` '' = waiting for the manager. Effects run from month `from` to `until` (exclusive). */
export interface Incident {
  id: IncidentId; plant: PlantId; m: number; from: number; until: number;
  /** inert mole fraction of the fresh gas (lumped as argon) and its step index on the table */
  y: number; k: number;
  /** the plant's catalyst activity when the incident opened (it sets the converter's approach to equilibrium in the plant view) */
  cat: number;
  choice: IncidentChoice; lapsed: boolean; outF: number; gasF: number;
  /** what the plant ran at (the player's or the stated fix): purge fraction and argon mol % at the converter inlet */
  purge: number; ar: number;
  /** the Career numbers the plant view prices its fixes with (frozen when the incident opened) */
  pre: IncidentPre;
}
/** The Career state handed to the incident level (GO TO THE PLANT) and used to state each option's effect in USD. */
export interface IncidentPre {
  id: IncidentId; m: number; y: number; k: number; cat: number;
  /** spot price (USD/t), gas (USD/GJ), the plant's nominal output (t/month), gas per tonne at its state (GJ/t), variable cost (USD/t) */
  price: number; gas: number; outT: number; gjT: number; varUSD: number;
  /** the plant's nameplate (t/month: the spot market's depth is read against it) and the tonnes a month already contracted (sold at their own price, so a lost tonne is a spot tonne) */
  capT: number; contractT: number;
  months: number; contractorUSD: number;
}
/** What the plant ran at, as the incident level measured it on a commissioned loop. */
export interface LoopResult { purge: number; conv: number; kw: number; ar: number }

/** The inert steps an event draws from (mole fraction of the fresh gas; DESIGN 2.6 feed_inerts 2-5 %). */
export const INERT_STEPS = [0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05] as const;
/** Months the off-spec gas lasts (the supplier repairs its front end); the effect of the fix runs this long. */
export const INC_MONTHS = 3;
/** The contractor: comes the same day, sets the purge to a safe 4 % (no time to tune), and bills this (operating cost, counted in the score). */
export const CONTRACTOR_USD = 3e5;
export const CONTRACTOR_PURGE = 0.04;
/** "Ignore it": the loop keeps the purge it ran at before the gas changed (trimmed to 0.5 % to save hydrogen on the clean gas). */
export const OLD_PURGE = 0.005;
/** The converter approaches equilibrium less closely as the catalyst ages: it behaves as if this many K hotter at activity 0 (0 K when new). */
export const APPROACH_K = 50;
export const T_RX_K = 723.15;
/** The recycle compressor is rated for this multiple of the clean loop's shaft power: past it the loop chokes and the fresh gas must be cut in proportion. */
export const KW_RATING = 3;
/** Share of the plant's energy bill that is loop circulation (compression) at the clean design: the kW ratio scales this share. */
export const COMP_SHARE = 0.1;

/** The clean loop (3 kmol/h argon in 1003 kmol/h of fresh gas, 1 % purge) at approach 0 K and 40 K: overall N2 conversion (%) and recycle shaft power (kW). */
export const CLEAN = { dT: [0, 40], conv: [97.847, 96.828], kw: [38.85, 54.99] } as const;
/** The loop at the old 0.5 % purge (ignore) and at the contractor's 4 %, per inert step, at approach 0 K and 40 K: conversion (%), shaft power (kW), argon at the converter inlet (mol %). */
export const TABLE = {
  ignore: {
    conv: [[98.048, 97.859, 97.678, 97.503, 97.331, 97.163, 96.997], [97.295, 97.05, 96.813, 96.584, 96.358, 96.137, 95.918]],
    kw: [[127.13, 149.81, 172.42, 195.03, 217.69, 240.44, 263.3], [151.12, 175.6, 199.97, 224.31, 248.68, 273.12, 297.66]],
    ar: [[44.97, 48.77, 51.75, 54.18, 56.21, 57.92, 59.4], [38.53, 42.21, 45.16, 47.59, 49.64, 51.39, 52.9]],
  },
  contractor: {
    conv: [[91.399, 91.117, 90.843, 90.576, 90.315, 90.059, 89.808], [87.807, 87.473, 87.147, 86.828, 86.515, 86.207, 85.904]],
    kw: [[40.87, 43.96, 47.05, 50.13, 53.21, 56.28, 59.37], [54.67, 57.96, 61.24, 64.52, 67.8, 71.08, 74.36]],
    ar: [[14.14, 16.82, 19.28, 21.54, 23.62, 25.55, 27.35], [11.38, 13.65, 15.75, 17.7, 19.53, 21.24, 22.84]],
  },
} as const;
/** The engineer's purge for each inert step (the best of a 0.5 % grid at the default Career prices, approach 10 K, catalyst 80 %): the reference solver's setting. */
export const BEST_PURGE = [0.02, 0.02, 0.025, 0.025, 0.025, 0.03, 0.03] as const;

export interface IncidentDef { id: IncidentId; event: string; plant: PlantId; level: string; months: number; contractorUSD: number }
/** The seam: one entry per incident that opens a plant. A second incident adds a row here, a level, and its mapping in `effectOf`. */
export const INCIDENT_DEFS: Record<IncidentId, IncidentDef> = {
  nh3_inerts: { id: 'nh3_inerts', event: 'feed_inerts', plant: 'nh3', level: 'CAREER_FIX_NH3_INERTS', months: INC_MONTHS, contractorUSD: CONTRACTOR_USD },
};
export const incidentForEvent = (ev: string): IncidentDef | undefined => Object.values(INCIDENT_DEFS).find((d) => d.event === ev);

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** The approach to equilibrium (K) of a catalyst at activity `cat`. */
export const approachK = (cat: number): number => APPROACH_K * (1 - clamp(cat, 0.2, 1));
const lerp2 = (row: readonly [readonly number[], readonly number[]] | readonly (readonly number[])[], k: number, dT: number): number => {
  const w = clamp(dT / 40, 0, 1);
  return row[0]![k]! * (1 - w) + row[1]![k]! * w;
};
const cleanAt = (dT: number): { conv: number; kw: number } => { const w = clamp(dT / 40, 0, 1); return { conv: CLEAN.conv[0] * (1 - w) + CLEAN.conv[1] * w, kw: CLEAN.kw[0] * (1 - w) + CLEAN.kw[1] * w }; };
/** The compressor's rating (kW) at this catalyst. */
export const kwRated = (cat: number): number => KW_RATING * cleanAt(approachK(cat)).kw;

/** The stated loop of the contractor or of "ignore" at this inert step and catalyst (from the table). */
export function statedLoop(kind: 'ignore' | 'contractor', k: number, cat: number): LoopResult {
  const t = TABLE[kind], dT = approachK(cat), kk = clamp(Math.round(k), 0, INERT_STEPS.length - 1);
  return { purge: kind === 'ignore' ? OLD_PURGE : CONTRACTOR_PURGE, conv: lerp2(t.conv, kk, dT), kw: lerp2(t.kw, kk, dT), ar: lerp2(t.ar, kk, dT) };
}

/** THE mapping from the plant to the Career, for a loop result at this catalyst:
 *   outF = min(1, conv / conv_clean) x min(1, kW_rated / kW)            (hydrogen vented in the purge is ammonia not made; a loop past the compressor's rating is cut back)
 *   gasF = (conv_clean / conv) x (1 + COMP_SHARE x max(0, kW / kW_clean - 1))   (the same gas bought per tonne made, plus the extra circulation)
 * conv_clean and kW_clean are the clean loop at the same catalyst, so the catalyst's own cost (already in the Career's output and gas) is not counted twice. */
export function effectOf(r: LoopResult, cat: number): { outF: number; gasF: number } {
  const cl = cleanAt(approachK(cat)), conv = clamp(r.conv, 1, 100), kw = Math.max(1e-6, r.kw);
  const outF = Math.min(1, conv / cl.conv) * Math.min(1, kwRated(cat) / kw);
  const gasF = (cl.conv / conv) * (1 + COMP_SHARE * Math.max(0, kw / cl.kw - 1));
  return { outF, gasF };
}
/** The Career's spot depth: the spot price falls by this share for each nameplate of tonnes sold at spot (model.ts stepMonth). */
export const SPOT_DEPTH = 0.15;
/** USD a month the incident costs the plant against the clean loop at this effect: the spot sales lost (the tonnes above the contracts, at a spot price that rises a little as fewer are sold)
 * less the variable cost saved, plus the extra gas. Positive = a loss. */
export function monthlyLossUSD(pre: IncidentPre, e: { outF: number; gasF: number }): number {
  const s0 = Math.max(0, pre.outT - pre.contractT), s1 = Math.max(0, pre.outT * e.outF - pre.contractT);
  const lost = pre.price * ((s0 - s1) - (SPOT_DEPTH * (s0 * s0 - s1 * s1)) / pre.capT) - pre.varUSD * pre.outT * (1 - e.outF);
  const gas = pre.outT * pre.gjT * pre.gas * (e.outF * e.gasF - 1);
  return lost + gas;
}
/** The whole incident's cost for an option (months x monthly loss, plus the contractor's bill). */
export function optionLossUSD(pre: IncidentPre, e: { outF: number; gasF: number }, kind: IncidentChoice): number {
  return pre.months * monthlyLossUSD(pre, e) + (kind === 'contractor' ? pre.contractorUSD : 0);
}

/** A plant result is sane and belongs to this incident (the level measured it on the same gas and catalyst). Returns null when it does not. */
export function checkResult(inc: Incident, r: unknown): LoopResult | null {
  if (typeof r !== 'object' || r === null) return null;
  const o = r as Record<string, unknown>;
  const num = (k: string): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : NaN);
  const res = { purge: num('purge'), conv: num('conv'), kw: num('kw'), ar: num('ar') };
  if (!(res.purge > 0 && res.purge <= 1 && res.conv > 0 && res.conv <= 100 && res.kw > 0 && res.kw < 1e5 && res.ar >= 0 && res.ar <= 100)) return null;
  if (!(Math.abs(num('y') - inc.y) < 1e-6 && Math.abs(num('cat') - inc.cat) < 1e-6 && num('m') === inc.m)) return null;
  return res;
}
