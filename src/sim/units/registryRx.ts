// Registry of the unit operations of lane M1.7b (stoichiometric reactor and burners, equilibrium reactor / adiabatic equilibrium
// bed, packed bed, multi-bed converter). `consumes` marks the reactants of the unit's reaction set for the flowsheet's
// no-leak check; reactors have no `exits`. Port names: in, out (multibed also takes an optional `quench`).
import type { UnitInst } from '../types';
import type { UnitDefM16 } from './registry';
import { eqReactor } from './rx_equil';
import { multibed } from './rx_multibed';
import { packedBed } from './rx_pfr';
import { reactantsOf, stoichReactor } from './rx_stoich';

const consumesReactants = (u: UnitInst, i: number, sp: string[]): boolean => reactantsOf(u).has(sp[i]!);
const rx = (fn: UnitDefM16['fn'], extra: Partial<UnitDefM16> = {}): UnitDefM16 => ({
  inlets: ['in'], outlets: ['out'], fn, consumes: consumesReactants, phaseIn: { in: 'V' }, ...extra,
});

export const UNIT_DEFS_RX: Record<string, UnitDefM16> = {
  stoich_reactor: rx(stoichReactor, { phaseIn: { in: 'any' } }),
  burner: rx(stoichReactor, { phaseIn: { in: 'any' } }),
  gasifier: rx(stoichReactor, { phaseIn: { in: 'any' } }),
  co_burner: rx(stoichReactor),
  eq_reactor: rx(eqReactor),
  eq_bed: rx(eqReactor),
  packed_bed: rx(packedBed),
  multibed: rx(multibed, { inlets: ['in', 'quench'] }),
};
