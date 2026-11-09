// Registry of the unit operations of lane M1.6 (feed, mixer, splitter/purge, heater/cooler, hx, compressor, valve, sinks).
// Other lanes add theirs in their own files; the director merges the registries. Port names are fixed per unit type.
import type { UnitInst, UnitOp } from '../types';
import { compressor } from './compressor';
import { feed } from './feed';
import { heater } from './heater';
import { hx } from './hx';
import { mixer } from './mixer';
import { sink } from './sink';
import { splitter } from './splitter';
import { valve } from './valve';
import { num } from './utilities';

export interface UnitDefM16 {
  inlets: string[];
  outlets: string[];
  fn: UnitOp;
  isSource?: boolean;
  isSink?: boolean;
  /** True when species `i` can leave the flowsheet through this unit (purge, sink). */
  exits?: (u: UnitInst, i: number, species: string[]) => boolean;
  /** True when species `i` is consumed (reactors; none in this lane). */
  consumes?: (u: UnitInst, i: number, species: string[]) => boolean;
  /** Required inlet phase per port (topology hint). */
  phaseIn?: Record<string, 'V' | 'L' | 'any'>;
}

const mix = (k: number): UnitDefM16 => ({ inlets: Array.from({ length: k }, (_, j) => 'in' + (j + 1)), outlets: ['out'], fn: mixer });
const one = (fn: UnitOp, extra: Partial<UnitDefM16> = {}): UnitDefM16 => ({ inlets: ['in'], outlets: ['out'], fn, ...extra });
const sinkDef = (): UnitDefM16 => ({ inlets: ['in'], outlets: [], fn: sink, isSink: true, exits: () => true });
const split = (): UnitDefM16 => ({ inlets: ['in'], outlets: ['purge', 'out'], fn: splitter, exits: (u) => num(u, 'frac', 0) > 0 });

export const UNIT_DEFS: Record<string, UnitDefM16> = {
  feed: { inlets: [], outlets: ['out'], fn: feed, isSource: true },
  mixer: mix(2), mixer3: mix(3), mixer4: mix(4),
  splitter: split(), purge: split(),
  heater: one(heater), cooler: one(heater),
  hx: { inlets: ['hot_in', 'cold_in'], outlets: ['hot_out', 'cold_out'], fn: hx },
  compressor: one(compressor, { phaseIn: { in: 'V' } }),
  valve: one(valve),
  sink: sinkDef(), product: sinkDef(), vent: sinkDef(),
};
