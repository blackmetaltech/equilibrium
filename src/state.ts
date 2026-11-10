// Game state of EQUILIBRIUM (DESIGN §8.2). Plain JSON only (no classes, Maps, typed arrays or functions): core clones, hashes and
// saves it. Every number inside is SI (mol/s, K, Pa, J, W, kg, s); display units live in src/sim/si.ts.
// The shared rule-code contracts (StreamState, UnitInst, Pipe, Flowsheet, Diag) come from src/sim/types.ts.
import type { BaseState } from '@core/kit';
import type { WarmStart } from './sim/flowsheet';
import type { Flowsheet, Pipe, StreamState, ThermoDetail, UnitInst } from './sim/types';

export type Phase = 'design' | 'commissioned' | 'firstrun' | 'shift' | 'report';
export const PHASES: Phase[] = ['design', 'commissioned', 'firstrun', 'shift', 'report'];
export const THERMO_DETAILS: ThermoDetail[] = ['rigorous', 'textbook', 'book'];

/** A feed source's specification: composition (mol fractions by active species), total flow (mol/s), T (K), P (Pa) and the price key
 *  resolved through the region pack (`''` = free). setFeed keeps the feed unit's params in step with it. */
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

/** A coded diagnostic as stored (message = t('fail.' + code) or t('info.' + code), filled from `data`). */
export interface DiagRec { code: string; severity: 'info' | 'warn' | 'fail'; unitId?: string; species?: string; data: Record<string, number | string> }

/** What one unit reported (numbers only; SI): its `info` scalars, duty (W, + = heat added) and shaft work (W). */
export interface UnitResult { info: Record<string, number>; duty?: number; work?: number }

/** Last steady-state result, stored compactly (no tear histories: those are a query). A failed solve is stored too (ok false). */
export interface SolveResult {
  ok: boolean;
  /** Outlet state of every pipe by pipe id. */
  streams: Record<string, StreamState>;
  units: Record<string, UnitResult>;
  /** Coded diagnostics, never sentences (message = t('fail.' + code)). A failure appears here with severity 'fail'. */
  diag: DiagRec[];
  /** The coded failure when ok is false. */
  failure: { code: string; unitId?: string; species?: string; data: Record<string, number | string> } | null;
  /** Units to draw as failed (the failing unit; empty when ok). */
  failedUnits: string[];
  /** Total unit-network evaluations used. */
  iterations: number;
  method: 'direct' | 'wegstein' | 'broyden' | 'none';
  loops: number;
  topologyHash: string;
  /** Generic KPIs (SI-based keys with units; see engine/solved.ts). Empty when not ok. */
  kpis: Record<string, number>;
}

/** Shift clock and dynamic state. PLACEHOLDER: task 1.13 (dynamic layer) fills events, alarms, interlocks and accumulators. */
export interface ShiftState {
  /** Plant seconds since the shift started (= core ticks since shift start). */
  t: number;
  speed: number;
}

/** One finished run for the Why / Runs / diff views: the setpoints, key results, KPIs and the locked prediction. */
export interface RunRecord {
  tick: number;
  /** Numeric unit params by unit id (the setpoints this run was commissioned with). */
  setpoints: Record<string, Record<string, number>>;
  /** Key results: product_kg_s, electric_kw, iterations, loops... */
  key: Record<string, number>;
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

/** One undoable design step as a compact diff of the flowsheet: per id [before, after] (null = absent). Undo applies the first, redo the second. */
export interface UndoEntry {
  u: Record<string, [UnitInst | null, UnitInst | null]>;
  p: Record<string, [Pipe | null, Pipe | null]>;
  f: Record<string, [FeedSpec | null, FeedSpec | null]>;
  n: [number, number];
}
export const MAX_UNDO = 30;

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
  /** Warm start of the last good solve (tear streams as plain JSON, no history). */
  warm: WarmStart | null;
  shift: ShiftState | null;
  /** At most 3 pinned and 4 fixed series, 1 sample per 30 plant-s, ring of 960. */
  trends: Record<string, number[]>;
  replay: ReplayFrame[];
  /** Last 10 runs. */
  runs: RunRecord[];
  prediction: { quantity: string; value: number } | null;
  progress: Progress;
  /** Units the level offers (null = all of them, sandbox); feeds, product tanks and the stack are always available. */
  palette: string[] | null;
  /** Per-type count limits of the level (a missing type is unlimited up to MAX_UNITS). */
  limits: Record<string, number>;
  /** Level-fixed parameters merged into a unit of that type when it is placed (reactions, rate law, bed count...). */
  presets: Record<string, Record<string, number | string>>;
  /** Plot size in 2 m tiles. */
  plot: { w: number; h: number };
  /** Design-phase undo / redo stacks (each at most MAX_UNDO diffs). */
  undo: { past: UndoEntry[]; future: UndoEntry[] };
  /** Only what the coach predicates need. */
  ui: { pinned: string[]; coachStep: string | null };
}

export const MAX_SPECIES = 12;
/** DESIGN §3.11: units per flowsheet (sandbox desktop) and streams. */
export const MAX_UNITS = 32;
export const MAX_STREAMS = 56;
export const DEFAULT_PLOT = { w: 24, h: 16 };

export const emptyProgress = (): Progress => ({ stars: {}, best: {}, codex: [], rank: 0, flags: [], pendingScores: 0 });
export const emptyFlowsheet = (): Flowsheet => ({ units: [], streams: [], nextId: 1 });
