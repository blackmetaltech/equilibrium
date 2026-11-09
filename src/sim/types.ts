// Shared contracts of the EQUILIBRIUM rule code (director-owned; change only with a note in docs/DECISIONS.md).
// Everything here is plain JSON-able data: state is cloned, hashed and saved by core.
// Units are SI everywhere inside src/sim: mol/s, K, Pa, J, W, kg, s (DESIGN §3.1). Display units live in src/sim/si.ts.

/** Provenance confidence of a catalogue number (DESIGN §4.0). */
export type Conf = 'FETCHED' | 'F2' | 'SNIP' | 'GAME' | 'UNVERIFIED';

/** Thermodynamic detail level (DESIGN §3.3). */
export type ThermoDetail = 'rigorous' | 'textbook' | 'book';

/** A material stream. `n[i]` is the molar flow (mol/s) of `species[i]` of the level's active species list (≤ 12). */
export interface StreamState {
  n: number[];
  /** Temperature, K. */
  T: number;
  /** Pressure, Pa. */
  P: number;
}

/** A unit's port. Port names are fixed per unit type (`in`, `out`, `vap`, `liq`, `purge`, `hot_in`…). */
export interface PortRef { unit: string; port: string }

/** A pipe from an outlet port to an inlet port (DESIGN §8.2 `Stream`). */
export interface Pipe { id: string; from: PortRef; to: PortRef }

/** A placed unit. `params` holds the player knobs and level-fixed parameters (SI). */
export interface UnitInst {
  id: string;
  type: string;
  pos: { x: number; y: number };
  rot: 0 | 1 | 2 | 3;
  params: Record<string, number | string>;
  catalystId?: string;
}

export interface Flowsheet { units: UnitInst[]; streams: Pipe[]; nextId: number }

/** Context every rule function receives: which species the arrays are indexed by, and the thermo detail level. */
export interface SimCtx {
  species: string[];
  thermoDetail: ThermoDetail;
}

/**
 * A coded diagnostic. Rule code never builds sentences (no strings > 3 words in src/sim): the player-facing message is
 * `t('fail.' + code, data)` (or `info.` for severity 'info'), filled with these numbers by the explain layer.
 */
export interface Diag {
  code: string;
  severity: 'info' | 'warn' | 'fail';
  unitId?: string;
  species?: string;
  data: Record<string, number | string>;
}

/** Every solver returns this; nothing throws out of a unit (exceptions are caught at the boundary → NUMERIC_GUARD). */
export type SimResult<T> =
  | { ok: true; value: T; diag: Diag[] }
  | { ok: false; code: string; unitId?: string; species?: string; data: Record<string, number | string>; diag: Diag[] };

export const okResult = <T>(value: T, diag: Diag[] = []): SimResult<T> => ({ ok: true, value, diag });
export const failResult = <T>(code: string, data: Record<string, number | string> = {}, extra: { unitId?: string; species?: string; diag?: Diag[] } = {}): SimResult<T> =>
  ({ ok: false, code, data, unitId: extra.unitId, species: extra.species, diag: extra.diag ?? [] });

/** Result of evaluating one unit operation on its inlet streams. */
export interface UnitOpOut {
  /** Outlet streams by port name. */
  outlets: Record<string, StreamState>;
  /** Heat added to the process, W (negative = heat removed). */
  duty?: number;
  /** Shaft work added to the process, W. */
  work?: number;
  /** Named scalar results for cards, plots and explanations (SI): e.g. X, Xeq, K, QK, Tmax, steam_kg_s. */
  info?: Record<string, number>;
}

/** Signature of every unit operation (one pure function per unit type, DESIGN §3.6/§3.7). */
export type UnitOp = (inlets: Record<string, StreamState>, unit: UnitInst, ctx: SimCtx) => SimResult<UnitOpOut>;
