// Registry of the unit operations of lane M1.7a (flash, ideal NH3 separator, boiler, absorber, stack, relief, interlock, flare).
import type { UnitInst } from '../types';
import { absorber } from './absorber';
import { boiler } from './boiler';
import { column } from './column';
import { fermenter } from './fermenter';
import { flash } from './flash';
import { interlock } from './interlock';
import { relief } from './relief';
import { nh3Sep } from './separator';
import { stack } from './stack';
import type { UnitDefM16 } from './registry';

const isNH3 = (_u: UnitInst, i: number, sp: string[]) => sp[i] === 'NH3' || sp[i] === 'NH3(l)';
export const UNIT_DEFS_B: Record<string, UnitDefM16> = {
  flash: { inlets: ['in'], outlets: ['vap', 'liq'], fn: flash, phaseIn: { in: 'any' } },
  nh3_sep: { inlets: ['in'], outlets: ['vap', 'liq'], fn: nh3Sep, phaseIn: { in: 'V' }, exits: isNH3 },
  boiler: { inlets: ['in'], outlets: ['out'], fn: boiler, phaseIn: { in: 'V' } },
  absorber: { inlets: ['in'], outlets: ['out', 'acid'], fn: absorber, phaseIn: { in: 'V' }, consumes: (_u, i, sp) => sp[i] === 'SO3' },
  stack: { inlets: ['in'], outlets: [], fn: stack, isSink: true, exits: () => true, phaseIn: { in: 'V' } },
  relief: { inlets: ['in'], outlets: [], fn: relief, isSink: true, exits: () => true },
  flare: { inlets: ['in'], outlets: [], fn: relief, isSink: true, exits: () => true },
  interlock: { inlets: [], outlets: [], fn: interlock },
  // M1.20 (full-game night): shortcut column with NRTL (L23) and the yeast fermenter (L23); `vap` is the distillate / the CO2 off-gas
  column: { inlets: ['in'], outlets: ['vap', 'liq'], fn: column, phaseIn: { in: 'L' } },
  fermenter: { inlets: ['in'], outlets: ['out', 'vap'], fn: fermenter, phaseIn: { in: 'L' }, consumes: (_u, i, sp) => sp[i] === 'C6H12O6' },
};
