// Contracts of the explain layer (DESIGN 7.3). Everything here is plain JSON. The records are what the blame tree reads: the setpoints, the
// KPIs and, per unit, the solved scalars (K, X, Xeq, eta...) plus the physics facts a template needs. The engine query builds them.

/** Reaction facts of a reactor: change of gas moles and heat of reaction (kJ/mol of reaction as written), the catalogue equation. */
export interface RxFacts { dnGas: number; dHkJ: number; eq: string }

export interface UnitFacts {
  type: string;
  params: Record<string, number | string>;
  /** The unit's solved scalars (SolveResult.units[id].info). */
  info: Record<string, number>;
  rx?: RxFacts;
  /** Largest inert (a species the reaction does not touch) in the reactor inlet: id and mole fraction. */
  inert?: { species: string; y: number };
  /** The limiting reagent at the reactor inlet: have = its flow, need = what consuming all of `other` would take, left = unreacted `other`, all mol/s. */
  lim?: { species: string; other: string; have: number; need: number; left: number };
}

export interface DiagLite { code: string; unitId?: string; species?: string; data: Record<string, number | string> }

export interface ExplainRecord {
  /** Numeric unit params by unit id. */
  setpoints: Record<string, Record<string, number>>;
  kpis: Record<string, number>;
  units: Record<string, UnitFacts>;
  diag: DiagLite[];
  failure: { code: string; unitId?: string; species?: string; data: Record<string, number | string> } | null;
  /** Dynamic events of the run (e.g. RUNAWAY with t, flowDrop, T0, dT, dt, Tpeak, Trelief). */
  events: { code: string; unitId?: string; data: Record<string, number> }[];
}

/** Re-solve the flowsheet with these setpoints; null when it does not solve. Passed in so the blame tree stays pure. */
export type ResolveFn = (setpoints: ExplainRecord['setpoints']) => ExplainRecord | null;

export interface Factor {
  unitId: string;
  key: string;
  from: number;
  to: number;
  /** Change of the headline KPI caused by this setpoint alone (cur minus cur-with-this-one-reverted), relative to the previous KPI value. */
  effect: number;
}

export type Vars = Record<string, number | string>;

export interface Explanation {
  /** i18n key (why.<ID>), or '' when nothing changed. */
  key: string;
  vars: Vars;
  /** The Learner hint (key + '.hint') is appended only in learner mode. */
  hint: boolean;
  /** The KPI the tree was built on. */
  kpi: string;
  factors: Factor[];
}
