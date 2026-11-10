// HAZOP of the acid plant's waste-heat cooler E-102 (DEPTH Ch 9, L34): node x parameter x guide word. Each deviation is SIMULATED on the node (effectiveness-NTU gas cooler with a
// boiling shell at the drum pressure, tube-cover time from the drum inventory) and the consequence class is derived from the numbers; the player's worksheet is graded against it.
// GAME numbers (UNVERIFIED): UA, drum inventory, limits. Tsat from the Antoine fit of water (VLE data of the repo uses the same form).
import { dmath } from '@core/numerics';

export const NODE = { id: 'E102', gasMolS: 20, cpG: 33, tIn: 700, ntu0: 1.5, pDrum: 6, lambda: 2.09e6, inventoryKg: 200, tDew: 450, dewWet: 60, dewSO3: 20, tAbsMax: 500, tTubeMax: 590, pPsv: 9 };
export const PARAMS = ['flow_gas', 'flow_bfw', 'temp', 'pressure', 'level', 'composition'] as const;
export const GUIDES = ['no', 'more', 'less', 'reverse', 'other'] as const;
export type Param = (typeof PARAMS)[number];
export type Guide = (typeof GUIDES)[number];
export const CLASSES = ['none', 'operability', 'corrosion', 'equipment', 'release'] as const;
export type Cls = (typeof CLASSES)[number];
export const sevOf = (c: Cls): number => CLASSES.indexOf(c);

/** Saturation temperature of water (K) at P bar abs (Antoine, mmHg / degC form). */
export const tSat = (pBar: number): number => 1730.63 / (8.07131 - dmath.log10(pBar * 750.062)) - 233.426 + 273.15;

export interface Perturb { gas: number; bfw: number; dT: number; p: number; phi: number; reverseGas: boolean; reverseBfw: boolean; wet: boolean; so3: boolean }
const BASE: Perturb = { gas: 1, bfw: 1, dT: 0, p: NODE.pDrum, phi: 1, reverseGas: false, reverseBfw: false, wet: false, so3: false };

export interface Sim { tOut: number; dewMargin: number; tubeMetal: number; tUncoverMin: number; pSteam: number; carry: boolean; backflow: boolean; cls: Cls }

/** Re-solve the node with the perturbation and classify. */
export function simulate(pt: Perturb): Sim {
  const cg = NODE.gasMolS * NODE.cpG * pt.gas;
  const ts = tSat(pt.p), tin = NODE.tIn + pt.dT;
  const ua = (NODE.cpG * NODE.gasMolS * NODE.ntu0) * pt.phi;
  const tOut = cg <= 0 ? ts : ts + (tin - ts) * dmath.exp(-ua / cg);
  const q = cg * Math.max(0, tin - tOut), steam = q / NODE.lambda;
  const phiEnd = Math.min(1, pt.bfw * pt.phi);
  const tubeMetal = phiEnd >= 0.9 ? ts + 30 : ts + (1 - phiEnd) * Math.max(0, tin - ts) * 0.9;
  const base = NODE.gasMolS * NODE.cpG * (NODE.tIn - (tSat(NODE.pDrum) + (NODE.tIn - tSat(NODE.pDrum)) * dmath.exp(-NODE.ntu0))) / NODE.lambda;
  const deficit = base * (1 - pt.bfw);
  const tUncoverMin = deficit > 0 ? NODE.inventoryKg / deficit / 60 : 99999;
  void steam;
  const carry = pt.bfw > 1 || pt.phi >= 1 && pt.p < 4 || pt.phi > 1;
  const tDew = NODE.tDew + (pt.wet ? NODE.dewWet : 0) + (pt.so3 ? NODE.dewSO3 : 0);
  const dewMargin = tOut - tDew;
  let cls: Cls = 'none';
  const up = (c: Cls) => { if (sevOf(c) > sevOf(cls)) cls = c; };
  if (tubeMetal > NODE.tTubeMax) up(pt.p >= 5 ? 'release' : 'equipment');
  if (pt.reverseGas || pt.reverseBfw) up('equipment');
  if (dewMargin < 0) up('corrosion');
  if (tOut > NODE.tAbsMax || carry || pt.p > NODE.pDrum) up('operability');
  return { tOut, dewMargin, tubeMetal, tUncoverMin, pSteam: pt.p, carry, backflow: pt.reverseGas || pt.reverseBfw, cls };
}

export interface Dev { param: Param; guide: Guide; pt: Perturb; causes: string[]; safeguards: string[] }
const d = (param: Param, guide: Guide, o: Partial<Perturb>, causes: string[], safeguards: string[]): Dev => ({ param, guide, pt: { ...BASE, ...o }, causes, safeguards });
/** The meaningful cells of the worksheet (the others are 'not meaningful'). */
export const DEVS: Dev[] = [
  d('flow_gas', 'no', { gas: 0 }, ['blower_trip', 'valve_closed'], ['tic_bypass']),
  d('flow_gas', 'more', { gas: 1.3 }, ['blower_speed', 'upstream_upset'], ['tahh']),
  d('flow_gas', 'less', { gas: 0.5 }, ['blower_speed', 'fouling'], ['tic_bypass']),
  d('flow_gas', 'reverse', { reverseGas: true }, ['blower_trip', 'absorber_pressure'], ['check_valve']),
  d('flow_bfw', 'no', { bfw: 0 }, ['bfw_pump_trip', 'valve_closed'], ['lal', 'bfw_standby']),
  d('flow_bfw', 'more', { bfw: 2 }, ['level_ctl_fail', 'operator_error'], ['demister', 'lal']),
  d('flow_bfw', 'less', { bfw: 0.3 }, ['bfw_pump_wear', 'level_ctl_fail'], ['lal', 'bfw_standby']),
  d('flow_bfw', 'reverse', { reverseBfw: true }, ['bfw_pump_trip', 'drum_pressure'], ['check_valve']),
  d('temp', 'more', { dT: 80 }, ['converter_upset', 'upstream_upset'], ['tahh']),
  d('temp', 'less', { dT: -80 }, ['converter_upset', 'blower_speed'], ['none']),
  d('pressure', 'more', { p: NODE.pPsv }, ['steam_header_blocked', 'valve_closed'], ['psv', 'tahh']),
  d('pressure', 'less', { p: 3 }, ['steam_header_trip', 'valve_open'], ['demister']),
  d('level', 'no', { phi: 0, bfw: 0 }, ['bfw_pump_trip', 'level_ctl_fail'], ['lal', 'bfw_standby']),
  d('level', 'less', { phi: 0.4, bfw: 1 }, ['level_ctl_fail', 'bfw_pump_wear'], ['none', 'lal']),
  d('level', 'more', { phi: 1.2 }, ['level_ctl_fail', 'operator_error'], ['demister', 'lal']),
  d('composition', 'other', { wet: true }, ['tube_leak', 'wet_feed_gas'], ['tic_bypass', 'dryer']),
  d('composition', 'more', { so3: true }, ['converter_upset', 'upstream_upset'], ['none']),
];
export const devOf = (p: string, g: string): Dev | undefined => DEVS.find((x) => x.param === p && x.guide === g);
export const CAUSES = [...new Set(DEVS.flatMap((x) => x.causes))].sort();
export const SAFEGUARDS: { id: string; price: number; installed: boolean }[] = [
  { id: 'psv', price: 0, installed: true }, { id: 'check_valve', price: 0, installed: true }, { id: 'tahh', price: 0, installed: true },
  { id: 'lal', price: 40000, installed: false }, { id: 'bfw_standby', price: 60000, installed: false }, { id: 'tic_bypass', price: 35000, installed: false },
  { id: 'demister', price: 25000, installed: false }, { id: 'dryer', price: 50000, installed: false }, { id: 'none', price: 0, installed: true },
];
export const SAFEGUARD_IDS = SAFEGUARDS.map((x) => x.id);

export interface Row { param: string; guide: string; cause: string; cons: string; safe: string }
export interface DevResult extends Sim { param: Param; guide: Guide; sev: number }
/** Every meaningful deviation simulated (deterministic, cheap). */
export const SIMS: DevResult[] = DEVS.map((x) => ({ ...simulate(x.pt), param: x.param, guide: x.guide, sev: 0 })).map((r) => ({ ...r, sev: sevOf(r.cls) }));
export const simOf = (p: string, g: string): DevResult | undefined => SIMS.find((x) => x.param === p && x.guide === g);
/** The deviations the worksheet must cover: consequence class equipment or release, or corrosion (severity >= 2). */
export const SIGNIFICANT = SIMS.filter((x) => x.sev >= 2);

export interface Grade { covered: number; needed: number; wrongClass: number; wrongSafe: number; wrongCause: number; proposalUsd: number; proposals: string[] }
export function gradeRows(rows: Row[]): Grade {
  let covered = 0, wrongClass = 0, wrongSafe = 0, wrongCause = 0;
  const props = new Set<string>();
  for (const x of SIGNIFICANT) if (rows.some((r) => r.param === x.param && r.guide === x.guide)) covered++;
  for (const r of rows) {
    const dv = devOf(r.param, r.guide), sm = simOf(r.param, r.guide);
    if (!dv || !sm) { wrongClass++; continue; }
    if (r.cons !== sm.cls) wrongClass++;
    if (!dv.causes.includes(r.cause)) wrongCause++;
    const eff = dv.safeguards.includes(r.safe) || (r.safe === 'none' && sm.sev <= 1);
    if (!eff) wrongSafe++;
    else { const sg = SAFEGUARDS.find((q) => q.id === r.safe); if (sg && !sg.installed) props.add(sg.id); }
  }
  const proposals = [...props].sort();
  return { covered, needed: SIGNIFICANT.length, wrongClass, wrongSafe, wrongCause, proposalUsd: proposals.reduce((a, id) => a + SAFEGUARDS.find((q) => q.id === id)!.price, 0), proposals };
}
/** Cheapest set of proposed safeguards that gives every significant deviation an effective safeguard (brute force over the few catalogue items). */
export function minProposalUsd(): { usd: number; set: string[] } {
  const cand = SAFEGUARDS.filter((x) => !x.installed);
  let best = { usd: Infinity, set: [] as string[] };
  for (let m = 0; m < 1 << cand.length; m++) {
    const set = cand.filter((_, i) => (m >> i) & 1).map((x) => x.id);
    const have = new Set([...SAFEGUARDS.filter((x) => x.installed).map((x) => x.id), ...set]);
    if (!SIGNIFICANT.every((x) => devOf(x.param, x.guide)!.safeguards.some((g) => have.has(g)))) continue;
    const usd = set.reduce((a, id) => a + SAFEGUARDS.find((q) => q.id === id)!.price, 0);
    if (usd < best.usd) best = { usd, set };
  }
  return best;
}
/** Gas outlet temperature (K) with the water flow cut to `frac` of normal, closed form (the Call-it oracle: the gas side is the limiting stream while shell water exceeds the gas heat capacity rate). */
export const callItTout = (): number => { const ts = tSat(NODE.pDrum); return ts + (NODE.tIn - ts) * dmath.exp(-NODE.ntu0); };
