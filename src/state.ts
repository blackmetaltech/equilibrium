// Game state of EQUILIBRIUM (DESIGN §8.2). Plain JSON only (no classes, Maps, typed arrays or functions): core clones, hashes and
// saves it. Every number inside is SI (mol/s, K, Pa, J, W, kg, s); display units live in src/sim/si.ts.
// The shared rule-code contracts (StreamState, UnitInst, Pipe, Flowsheet, Diag) come from src/sim/types.ts.
import type { BaseState } from '@core/kit';
import type { Flowsheet, StreamState, ThermoDetail } from './sim/types';

export type Phase = 'design' | 'commissioned' | 'firstrun' | 'shift' | 'report';
export const PHASES: Phase[] = ['design', 'commissioned', 'firstrun', 'shift', 'report'];
export const THERMO_DETAILS: ThermoDetail[] = ['rigorous', 'textbook', 'book'];

/** A feed source's specification. PLACEHOLDER: task 1.9 (feed and flowsheet actions) fills the shape: composition (mol fractions by
 *  active species), total flow (mol/s), T (K), P (Pa) and the price key resolved through the region pack. */
export interface FeedSpec {
  /** Mole fractions, indexed by `EqState.species`. */
  x: number[];
  /** Total molar flow, mol/s. */
  flow: number;
  T: number;
  P: number;
  /** Key into the region pack's prices (EqRegionData.prices). */
  priceKey: string;
}

/** Last steady-state result. PLACEHOLDER: task 1.11 (flowsheet solve and `commission`) fills unit results and diagnostics. */
export interface SolveResult {
  /** Outlet state of every pipe by pipe id. */
  streams: Record<string, StreamState>;
  /** Coded diagnostics, never sentences (message = t('fail.' + code)). */
  diag: { code: string; severity: 'info' | 'warn' | 'fail'; unitId?: string; data: Record<string, number | string> }[];
  /** Tear-loop iterations used (tear histories themselves are a query, never state). */
  iterations: number;
}

/** Shift clock and dynamic state. PLACEHOLDER: task 1.13 (dynamic layer) fills events, alarms, interlocks and accumulators. */
export interface ShiftState {
  /** Plant seconds since the shift started (= core ticks since shift start). */
  t: number;
  speed: number;
}

/** One finished run for the Why / Runs / diff views. PLACEHOLDER: task 1.12 (KPIs, metrics, runs) fills the KPIs. */
export interface RunRecord {
  tick: number;
  kpis: Record<string, number>;
  prediction: { quantity: string; value: number } | null;
}

/** One frame of the near-miss ring (60 frames at 1 Hz). PLACEHOLDER: task 1.13 fills the compact unit T/P and alarm bits. */
export interface ReplayFrame {
  t: number;
  T: number[];
  P: number[];
  alarms: number;
}

export interface Progress {
  stars: Record<string, 0 | 1 | 2 | 3>;
  best: Record<string, Record<string, number>>;
  codex: string[];
  rank: number;
  flags: string[];
  pendingScores: number;
}

export interface EqState extends BaseState {
  phase: Phase;
  thermoDetail: ThermoDetail;
  /** The level's active species (at most 12); every n[] is indexed by it. */
  species: string[];
  flowsheet: Flowsheet;
  /** Per feed unit id. */
  feeds: Record<string, FeedSpec>;
  solved: SolveResult | null;
  shift: ShiftState | null;
  /** At most 3 pinned and 4 fixed series, 1 sample per 30 plant-s, ring of 960. */
  trends: Record<string, number[]>;
  replay: ReplayFrame[];
  /** Last 10 runs. */
  runs: RunRecord[];
  prediction: { quantity: string; value: number } | null;
  progress: Progress;
  /** Only what the coach predicates need. */
  ui: { pinned: string[]; coachStep: string | null };
}

export const MAX_SPECIES = 12;

export const emptyProgress = (): Progress => ({ stars: {}, best: {}, codex: [], rank: 0, flags: [], pendingScores: 0 });
export const emptyFlowsheet = (): Flowsheet => ({ units: [], streams: [], nextId: 1 });
