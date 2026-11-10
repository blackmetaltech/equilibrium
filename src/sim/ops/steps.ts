// Ordered-step state machine shared by the start-up SOP (L35) and the permit to work (L36). Pure, plain-JSON state. A step may be BLOCKED (its
// precondition is not met: it is not executed, a few minutes are lost) or run with HAZARDS (executed, consequence recorded; severity >= 4 halts the run).
export type Rec = Record<string, number>;
export interface Hazard { code: string; sev: number }
export interface StepDef {
  id: string; mins: number;
  blocks?: (st: Rec, t: number) => string | null;
  hazards?: (st: Rec, t: number) => Hazard[];
  apply: (st: Rec, t: number) => void;
}
export interface StepEvent { i: number; id: string; kind: 'done' | 'blocked' | 'hazard'; code: string; sev: number; t: number }
export interface RunOut { state: Rec; events: StepEvent[]; mins: number; maxSev: number; blocked: number; halted: boolean; worst: string }
export const BLOCK_MINS = 5;

export function runSteps(defs: StepDef[], order: string[], init: Rec): RunOut {
  const st: Rec = { ...init };
  const events: StepEvent[] = [];
  let t = 0, maxSev = 0, blocked = 0, halted = false, worst = '';
  for (let i = 0; i < order.length && !halted; i++) {
    const d = defs.find((x) => x.id === order[i]);
    if (!d) { events.push({ i, id: order[i]!, kind: 'blocked', code: 'unknown', sev: 0, t }); blocked++; t += BLOCK_MINS; continue; }
    const b = d.blocks ? d.blocks(st, t) : null;
    if (b !== null) { events.push({ i, id: d.id, kind: 'blocked', code: b, sev: 0, t }); blocked++; t += BLOCK_MINS; continue; }
    const hz = d.hazards ? d.hazards(st, t) : [];
    for (const h of hz) {
      events.push({ i, id: d.id, kind: 'hazard', code: h.code, sev: h.sev, t });
      if (h.sev > maxSev) { maxSev = h.sev; worst = h.code; }
      if (h.sev >= 4) halted = true;
    }
    d.apply(st, t);
    t += d.mins;
    if (hz.length === 0) events.push({ i, id: d.id, kind: 'done', code: '', sev: 0, t });
  }
  return { state: st, events, mins: t, maxSev, blocked, halted, worst };
}
