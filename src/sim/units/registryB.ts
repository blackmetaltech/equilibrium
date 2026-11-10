// Registry of the unit operations of lane M1.7a (flash, ideal NH3 separator, boiler, absorber, stack, relief, interlock, flare).
import type { UnitInst } from '../types';
import { absorber } from './absorber';
import { boiler } from './boiler';
import { column } from './column';
import { fermenter } from './fermenter';
import { co2Removal, methanator, reformer } from './ammonia_plant';
import { gauzeBurner, hno3Absorber, n2oAbater } from './nitric';
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
  // L26 nitric acid chain and L28 ammonia-plant units
  gauze_burner: { inlets: ['in'], outlets: ['out'], fn: gauzeBurner, phaseIn: { in: 'V' }, consumes: (_u, i, sp) => sp[i] === 'NH3' },
  n2o_abater: { inlets: ['in'], outlets: ['out'], fn: n2oAbater, phaseIn: { in: 'V' }, consumes: (_u, i, sp) => sp[i] === 'N2O' },
  hno3_absorber: { inlets: ['in'], outlets: ['out', 'acid'], fn: hno3Absorber, phaseIn: { in: 'V' }, consumes: (_u, i, sp) => sp[i] === 'NO' || sp[i] === 'NO2' },
  reformer: { inlets: ['in'], outlets: ['out'], fn: reformer, phaseIn: { in: 'V' }, consumes: (_u, i, sp) => sp[i] === 'CH4' || sp[i] === 'H2O' || sp[i] === 'CO' },
  co2_removal: { inlets: ['in'], outlets: ['out', 'co2'], fn: co2Removal, phaseIn: { in: 'V' }, exits: (_u, i, sp) => sp[i] === 'CO2' },
  methanator: { inlets: ['in'], outlets: ['out'], fn: methanator, phaseIn: { in: 'V' }, consumes: (_u, i, sp) => sp[i] === 'CO' || sp[i] === 'CO2' },
  fermenter: { inlets: ['in'], outlets: ['out', 'vap'], fn: fermenter, phaseIn: { in: 'L' }, consumes: (_u, i, sp) => sp[i] === 'C6H12O6' },
};
