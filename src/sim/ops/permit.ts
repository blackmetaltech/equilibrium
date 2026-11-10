// Permit to work / LOTO on a fouled exchanger (DEPTH Ch 9, L36): isolation (double block and bleed, or a blind), depressure, drain, purge, gas test, lock, break containment, job, reinstate.
// The outlet pair of valves has a passing valve (the bleed reading shows it), so that side needs a blind. While the exchanger is out the plant runs on the bypass at a loss.
import { runSteps, type Hazard, type Rec, type RunOut, type StepDef } from './steps';

export const PERMIT = { lossUsdPerH: 1800, residPass: 10, jobMins: 480 };
export const PERMIT_INIT: Rec = { in1: 0, in2: 0, out1: 0, out2: 0, bleedIn: 0, bleedOut: 0, passOut: 0, blind: 0, dep: 0, drained: 0, resid: 100, gas: 0, lock: 0, open: 0, clean: 0, back: 0 };
const inOk = (s: Rec): boolean => s.bleedIn === 1 && s.in1 === 1 && s.in2 === 1;
const outOk = (s: Rec): boolean => s.blind === 1 || (s.bleedOut === 1 && s.passOut === 0 && s.out1 === 1 && s.out2 === 1);
export const barriersOk = (s: Rec): boolean => inOk(s) && outOk(s);
const closer = (k: string): StepDef => ({ id: `close_${k}`, mins: 3, apply: (s) => { s[k.replace('_', '')] = 1; } });
export const PERMIT_STEPS: StepDef[] = [
  closer('in_1'), closer('in_2'), closer('out_1'), closer('out_2'),
  { id: 'bleed_in', mins: 5, blocks: (s) => (s.in1 && s.in2 ? null : 'notclosed'), apply: (s) => { s.bleedIn = 1; } },
  { id: 'bleed_out', mins: 5, blocks: (s) => (s.out1 && s.out2 ? null : 'notclosed'), apply: (s) => { s.bleedOut = 1; s.passOut = s.blind === 1 ? 0 : 1; } },
  { id: 'depress', mins: 10, hazards: (s) => (s.in1 && s.out1 ? [] : [{ code: 'live', sev: 3 }]), apply: (s) => { s.dep = 1; } },
  { id: 'blind', mins: 90, blocks: (s) => (s.dep ? null : 'pressure'), apply: (s) => { s.blind = 1; s.passOut = 0; } },
  { id: 'drain', mins: 20, blocks: (s) => (s.in1 && s.out1 ? null : 'live'), hazards: (s) => (s.dep ? [] : [{ code: 'spray', sev: 3 }]), apply: (s) => { s.drained = 1; s.resid = 40; } },
  { id: 'purge', mins: 60, apply: (s) => { s.resid = s.resid * (s.drained ? 0.1 : 0.8); } },
  { id: 'gas_test', mins: 15, apply: (s) => { s.gas = s.resid < PERMIT.residPass ? 1 : 0; } },
  { id: 'lock', mins: 10, blocks: (s) => (barriersOk(s) ? null : 'barrier'), apply: (s) => { s.lock = 1; } },
  {
    id: 'open_up', mins: 5,
    hazards: (s) => { const h: Hazard[] = []; if (s.gas === 0) h.push({ code: 'gas', sev: 4 }); if (s.lock === 0) h.push({ code: 'nolock', sev: 4 }); if (!barriersOk(s)) h.push({ code: 'barrier', sev: 4 }); return h; },
    apply: (s) => { s.open = 1; },
  },
  { id: 'clean', mins: PERMIT.jobMins, blocks: (s) => (s.open ? null : 'closed'), apply: (s) => { s.clean = 1; } },
  { id: 'reinstate', mins: 30, blocks: (s) => (s.clean ? null : 'notdone'), apply: (s) => { s.back = 1; } },
];
export const PERMIT_IDS = PERMIT_STEPS.map((c) => c.id);
export interface PermitOut extends RunOut { done: boolean; safe: boolean; hours: number; lossUsd: number }
export function runPermit(order: string[]): PermitOut {
  const r = runSteps(PERMIT_STEPS, order, PERMIT_INIT);
  const hours = r.mins / 60;
  return { ...r, done: r.state.back === 1, safe: r.maxSev === 0, hours, lossUsd: hours * PERMIT.lossUsdPerH };
}
