// Flowsheet solver public API (M1.9). Units/systems lanes call `solveFlowsheet` with a registry of unit definitions.
export { solveFlowsheet } from './solve';
export type { SolveInput, SolveOptions, SolveMethod, FlowsheetSolution, WarmStart, Snapshot, LoopInfo } from './solve';
export { validateTopology, tarjanScc, topoOrder, topologyHash } from './graph';
export type { UnitDef, Registry, PhaseHook, TopoFail, GEdge } from './graph';
export { minTearSet } from './tear';
export type { TearEdge, TearSelection } from './tear';
export { classifyLoop } from './diagnose';
export type { LoopDiagnosis } from './diagnose';
export { broydenSolve } from './broyden';
