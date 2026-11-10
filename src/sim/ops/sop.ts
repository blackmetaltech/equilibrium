// Start-up SOP of the ammonia loop (DEPTH Ch 9, L35): cards with preconditions and effects; an order of cards is simulated and the hazards it causes are derived from the
// plant state (oxygen vs the limiting oxygen concentration of H2, heating rate vs the thermal-shock limit, flare capacity, tightness test, cooling before circulation).
// GAME numbers: LOC of H2 in N2/air about 5 vol % O2 (textbook, Zabetakis; UNVERIFIED for this plant); 50 K/h ramp limit (DEPTH).
import { runSteps, type Rec, type RunOut, type StepDef } from './steps';

export const SOP = { o2Safe: 1, o2Loc: 5, rampMax: 50, tCold: 300, tReduce: 650, tMinH2: 620, pTest: 60, pFlareMax: 60, pFull: 100 };
export const SOP_INIT: Rec = { o2: 21, p: 1, t: SOP.tCold, cool: 0, flare: 0, circ: 0, leak: 0, h2: 0, red: 0 };
const rampMins = (rate: number): number => ((SOP.tReduce - SOP.tCold) / rate) * 60;

export const SOP_CARDS: StepDef[] = [
  { id: 'cool_on', mins: 10, apply: (s) => { s.cool = 1; } },
  { id: 'flare_on', mins: 5, apply: (s) => { s.flare = 1; } },
  { id: 'purge', mins: 40, apply: (s) => { s.o2 = 0.5; s.p = 1.5; } },
  { id: 'circ_on', mins: 10, blocks: (s) => (s.cool === 0 ? 'nocool' : null), apply: (s) => { s.circ = 1; } },
  { id: 'press_test', mins: 30, blocks: (s) => (s.circ === 0 ? 'nocirc' : null), apply: (s) => { s.p = SOP.pTest; s.leak = 1; } },
  { id: 'heat_slow', mins: rampMins(SOP.rampMax), hazards: (s) => (s.circ === 0 ? [{ code: 'hotspot', sev: 3 }] : []), apply: (s) => { s.t = SOP.tReduce; } },
  { id: 'heat_fast', mins: rampMins(150), hazards: (s) => [...(s.circ === 0 ? [{ code: 'hotspot', sev: 3 }] : []), { code: 'shock', sev: 3 }], apply: (s) => { s.t = SOP.tReduce; } },
  {
    id: 'intro_h2', mins: 480, blocks: (s) => (s.circ === 0 ? 'nocirc' : null),
    hazards: (s) => {
      const h = [];
      if (s.o2 >= SOP.o2Loc) h.push({ code: 'explosion', sev: 4 });
      else if (s.o2 >= SOP.o2Safe) h.push({ code: 'nearmiss', sev: 2 });
      if (s.leak === 0) h.push({ code: 'leak', sev: 3 });
      if (s.flare === 0) h.push({ code: 'vent', sev: 3 });
      if (s.p > SOP.pFlareMax) h.push({ code: 'flare', sev: 3 });
      if (s.t < SOP.tMinH2) h.push({ code: 'cold', sev: 3 });
      return h;
    },
    apply: (s) => { s.h2 = 1; s.red = s.t >= SOP.tMinH2 ? 1 : 0; },
  },
  { id: 'press_full', mins: 20, blocks: (s) => (s.circ === 0 ? 'nocirc' : null), apply: (s) => { s.p = SOP.pFull; } },
];
export const SOP_IDS = SOP_CARDS.map((c) => c.id);
export const sopReady = (s: Rec): boolean => s.red === 1 && s.p >= SOP.pFull && s.cool === 1 && s.circ === 1;
export interface SopOut extends RunOut { ready: boolean; safe: boolean }
export function runSop(order: string[]): SopOut {
  const r = runSteps(SOP_CARDS, order, SOP_INIT);
  return { ...r, ready: sopReady(r.state), safe: r.maxSev === 0 };
}
