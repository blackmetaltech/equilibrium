// Shift event table data (DESIGN 2.6: 14 event types; L00 / L05 / L13 / L24 tables) and the GAME constants of the dynamic layer (DESIGN 3.9, 5.5, 8.5).
// Every number is a game rule, hand-set from the DESIGN text (`src: 'DESIGN-2.6'` or `'GAME'`, conf 'GAME'); none comes from a catalogue. The dynamic layer
// reads this file; the strings of the cards are keys (event.<id>.title / .body) filled by src/locales/en/events.ts.
import type { Conf } from '../sim/types';

export type EventType =
  | 'cw_pump_trip' | 'cw_hot_day' | 'feed_inerts' | 'feed_surge' | 'blower_wear' | 'compressor_trip' | 'catalyst_age' | 'catalyst_poison'
  | 'fuel_price' | 'demand_spike' | 'power_dip' | 'analyser_fault' | 'steam_header_low' | 'valve_fails_closed';

export interface EventSpec {
  id: EventType;
  /** Draw weight in a pool. */
  weight: number;
  /** Nominal magnitude: a multiplier (1 = no change), an added temperature (cw_hot_day, K) or an added mole fraction (feed_inerts, drawn in [lo, hi]). */
  mag: number;
  /** Second bound of a drawn magnitude (feed_inerts only); equal to mag otherwise. */
  magHi: number;
  /** Plant seconds the event lasts (0 = lasts for the rest of the shift). */
  durS: number;
  src: string;
  conf: Conf;
}

const ev = (id: EventType, weight: number, mag: number, durS: number, magHi = mag): EventSpec => ({ id, weight, mag, magHi, durS, src: 'DESIGN-2.6', conf: 'GAME' });

/** The 14 event types of DESIGN 2.6 with their stated magnitudes; durations are GAME choices (the text gives only compressor 60 s and power dip 30 s, demand spike 1 h). */
export const EVENTS: Readonly<Record<EventType, EventSpec>> = {
  cw_pump_trip: ev('cw_pump_trip', 1, 0.3, 0),
  cw_hot_day: ev('cw_hot_day', 2, 8, 0),
  feed_inerts: ev('feed_inerts', 2, 0.02, 0, 0.05),
  feed_surge: ev('feed_surge', 2, 1.1, 1800),
  blower_wear: ev('blower_wear', 1, 0.92, 0),
  compressor_trip: ev('compressor_trip', 1, 0, 60),
  catalyst_age: ev('catalyst_age', 2, 0.9, 0),
  catalyst_poison: ev('catalyst_poison', 1, 0.6, 0),
  fuel_price: ev('fuel_price', 1, 2, 7200),
  demand_spike: ev('demand_spike', 1, 1.5, 3600),
  power_dip: ev('power_dip', 1, 0.85, 30),
  analyser_fault: ev('analyser_fault', 1, 0, 1800),
  steam_header_low: ev('steam_header_low', 1, 0.5, 3600),
  valve_fails_closed: ev('valve_fails_closed', 1, 0, 600),
};
export const EVENT_TYPES: readonly EventType[] = Object.keys(EVENTS) as EventType[];

/** Learner mode shrinks every event's deviation from no change by this factor (DESIGN 7.6: gentler magnitudes). */
export const LEARNER_GENTLE = 0.6;

/** A level's event table: the pool the 2-4 events are drawn from, events that always happen, and fixed-time scripted ones (L00). */
export interface EventTable {
  count: [number, number];
  pool: EventType[];
  guaranteed: EventType[];
  /** Scripted events: fired at `at` plant seconds whatever the seed (type, at). */
  fixed: { type: EventType; at: number }[];
  /** Seed override (L00: the same night every time). */
  seed?: number;
  /** Shift length, plant seconds. */
  lenS: number;
}

export const SHIFT_LEN_S = 8 * 3600;
const all = (): EventType[] => EVENT_TYPES.slice();

/** DESIGN 2.6: L00 one scripted cw_pump_trip at 20 s (fixed seed); L05 feed_surge and blower_wear (3 min shift); L13 / L24 as listed; free play draws from all 14. */
export const EVENT_TABLES: Readonly<Record<string, EventTable>> = {
  L00: { count: [1, 1], pool: ['cw_pump_trip'], guaranteed: [], fixed: [{ type: 'cw_pump_trip', at: 20 }], seed: 4021, lenS: 600 },
  L05: { count: [2, 3], pool: ['feed_surge', 'blower_wear'], guaranteed: [], fixed: [], lenS: 180 },
  L06: { count: [2, 3], pool: ['blower_wear', 'feed_surge'], guaranteed: [], fixed: [], lenS: 600 },
  L08: { count: [2, 2], pool: ['fuel_price', 'cw_hot_day'], guaranteed: [], fixed: [], lenS: SHIFT_LEN_S },
  L13: { count: [2, 4], pool: ['feed_inerts', 'catalyst_age', 'cw_hot_day', 'feed_surge'], guaranteed: [], fixed: [], lenS: SHIFT_LEN_S },
  L15: { count: [2, 3], pool: ['catalyst_age', 'feed_inerts'], guaranteed: [], fixed: [], lenS: SHIFT_LEN_S },
  L16: { count: [2, 3], pool: ['feed_surge', 'catalyst_age'], guaranteed: [], fixed: [], lenS: SHIFT_LEN_S },
  L22: { count: [3, 3], pool: ['feed_inerts', 'catalyst_age', 'cw_hot_day'], guaranteed: [], fixed: [], lenS: SHIFT_LEN_S },
  L24: { count: [3, 4], pool: ['cw_hot_day', 'feed_surge'], guaranteed: ['cw_pump_trip'], fixed: [], lenS: 3600 },
};
export const FREE_TABLE: EventTable = { count: [2, 4], pool: all(), guaranteed: [], fixed: [], lenS: SHIFT_LEN_S };
export const FIRSTRUN_S = 30;

// ---- GAME constants of the dynamic layer ----
/** Debounce of the steady-state re-solve (DESIGN 3.9): at least this many plant seconds apart; during an actuator ramp this many. */
export const RESOLVE_S = 5;
export const RESOLVE_RAMP_S = 30;
/** Display lag clamp, plant s (DESIGN 3.9). */
export const TAU_MIN_S = 5;
export const TAU_MAX_S = 300;
/** Holdup basis of vessels, s of inlet volumetric flow (the sizing time of engine/solved.ts: vessels 60 s, beds 5 s there; reactors 30 s here). */
export const TAU_VESSEL_S = 60;
export const TAU_REACTOR_S = 30;
export const TAU_DEFAULT_S = 5;
/** Catalyst specific heat for the lumped bed temperature (J/(kg K), typical oxide support; UNVERIFIED) and sintering rate (1/(K s)). */
export const CP_CATALYST = 900;
export const SINTER_K = 2e-4;
export const SINTER_AFTER_S = 30;
/** Fraction of nominal flow that still passes when a feed is cut (a degenerate zero-flow solve is avoided). */
export const SAFE_FLOW = 1e-3;
/** Relief: reseat below this fraction of the set point (API 520 style blowdown 7 %); design pressure = this x operating pressure (GAME);
 *  containment loss above 1.5 x design (DESIGN 5.5). */
export const BLOWDOWN = 0.93;
export const DESIGN_P_FACTOR = 1.25;
export const LOSS_P_FACTOR = 1.5;
/** Liquid-full CSTR relief (DESIGN 2.6 L24): temperature-equivalent set point 140 C, containment loss above 160 C, reseat 5 K below the set point. */
export const CSTR_RELIEF_K = 140 + 273.15;
export const CSTR_LOSS_K = 160 + 273.15;
export const RELIEF_RESEAT_K = 5;
/** Heat removed by a lifting liquid relief: orifice vapour capacity x latent heat (GAME stand-in for the charge boiling at 10 bar g; latent heat UNVERIFIED). */
export const RELIEF_LIQ = { Pabs: 1.1e6, M: 58, k: 1.1, latent: 3.7e5, dT: 10 } as const;
/** Material temperature limit by unit type, K (GAME; param `Tlim` overrides). */
export const MATERIAL_T: Readonly<Record<string, number>> = {
  cstr: CSTR_LOSS_K, packed_bed: 1073.15, multibed: 1073.15, eq_reactor: 1273.15, eq_bed: 1273.15, stoich_reactor: 1573.15, burner: 1573.15,
  gasifier: 1573.15, co_burner: 1573.15, flash: 673.15, nh3_sep: 573.15, absorber: 573.15, boiler: 873.15, heater: 1273.15, compressor: 673.15,
};
/** Alarm thresholds as fractions of the margin (limit - nominal): Low advisory, High, Critical; auto interlock at 90 % (DESIGN 3.9: Learner). */
export const ALARM_FRAC: readonly [number, number, number] = [0.1, 0.3, 0.6];
export const AUTO_TRIP_FRAC = 0.9;
/** On-delay (plant s) per tier and deadband as a fraction of the margin (IEC 62682 practice, DESIGN 5.5). */
export const ALARM_DELAY_S: readonly [number, number, number] = [10, 5, 2];
export const ALARM_DEADBAND = 0.02;
export const MIN_MARGIN_K = 5;
export const MIN_MARGIN_REL = 0.05;
/** Time dilation (DESIGN 3.9): a reactor dT/dt above this (K/s) drops the clock to watch. */
export const WATCH_DTDT = 0.2;
/** Ring sizes (DESIGN 8.2). */
export const TREND_EVERY_S = 30;
export const TREND_MAX = 960;
export const REPLAY_FRAMES = 60;
/** Variables an interlock may watch and what it may do (data of the interlock unit, M1.7a). */
export const ILK_ACTIONS: readonly string[] = ['cut_feed', 'full_coolant', 'dump'];
/** Full-coolant safe state of a jacketed reactor: coolant this much colder (K) and jacket UA times this. */
export const FULL_COOLANT = { dTc: 15, ua: 2 } as const;
/** Inert species preference of feed_inerts. */
export const INERT_PREF: readonly string[] = ['Ar', 'N2', 'CO2', 'CH4'];
