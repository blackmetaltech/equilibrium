// Registry of the unit operations of lane M1.8: the jacketed CSTR (`cstr`, K7 propylene oxide hydrolysis) and the batch rig (`batch`, K6
// peroxide). Ports: in, out. `consumes` marks the reactants of the unit's first law reaction for the flowsheet's no-leak check.
import { findLaw } from '../../data/kinetics';
import { findReaction } from '../../data/reactions';
import type { UnitInst } from '../types';
import type { UnitDefM16 } from './registry';
import { batchUnit } from './rx_batch';
import { cstrUnit } from './rx_cstr';
import { str } from './utilities';

const consumesReactants = (u: UnitInst, i: number, sp: string[]): boolean => {
  const law = findLaw(str(u, 'law', u.type === 'batch' ? 'K6' : 'K7'));
  const rx = law === undefined ? undefined : findReaction(law.reactions[0]!);
  return rx !== undefined && (rx.nu[sp[i]!] ?? 0) < 0;
};

export const UNIT_DEFS_CSTR: Record<string, UnitDefM16> = {
  cstr: { inlets: ['in'], outlets: ['out'], fn: cstrUnit, consumes: consumesReactants, phaseIn: { in: 'L' } },
  batch: { inlets: ['in'], outlets: ['out'], fn: batchUnit, consumes: consumesReactants, phaseIn: { in: 'any' } },
};
