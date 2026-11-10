// Shared helpers and utility data for the M1.6 unit operations (DESIGN 3.7, 3.8). SI inside: mol/s, K, Pa, W.
import type { SimResult, StreamState, UnitInst } from '../types';
import { failResult } from '../types';
import { SPECIES } from '../../data/species';
import { THERMO, hOf, hasThermo } from '../thermo/species';

/** Numeric parameter with default. */
export const num = (u: UnitInst, k: string, d = 0): number => { const v = u.params[k]; return typeof v === 'number' ? v : d; };
export const has = (u: UnitInst, k: string): boolean => typeof u.params[k] === 'number';
export const str = (u: UnitInst, k: string, d = ''): string => { const v = u.params[k]; return typeof v === 'string' ? v : d; };

/** True when every number of the stream is finite (and flows non-negative). */
export const finiteStream = (s: StreamState): boolean => {
  if (!Number.isFinite(s.T) || !Number.isFinite(s.P)) return false;
  for (let i = 0; i < s.n.length; i++) if (!Number.isFinite(s.n[i]!) || s.n[i]! < 0) return false;
  return true;
};

/** NUMERIC_GUARD failure when any given inlet is not finite, else null. */
export function guardInlets<T>(inlets: Record<string, StreamState | undefined>, u: UnitInst): SimResult<T> | null {
  for (const k of Object.keys(inlets)) {
    const s = inlets[k];
    if (s && !finiteStream(s)) return failResult<T>('NUMERIC_GUARD', { port: k }, { unitId: u.id });
  }
  return null;
}

export const T_FROM_C = 273.15;

export interface UtilityDef {
  /** Utility temperature at its stated limit, K (used for entropy generation: S_gen = dS - Q/T). */
  T: number;
  /** 'heat' utilities raise the process stream to at most T; 'cool' utilities cool it to at least T. */
  dir: 'heat' | 'cool';
  /** Conversion efficiency (fuel -> heat) where it applies. */
  eff: number;
  src: string;
  conf: 'FETCHED' | 'F2' | 'SNIP' | 'GAME' | 'UNVERIFIED';
}

/** Utility catalogue: limits from DESIGN 3.7 (LP steam to 140 C, fired to 900 C, cooling water floor 35 C, refrigerant -33 C), efficiencies from 3.8. */
export const UTIL: Readonly<Record<'steam' | 'fired' | 'cw' | 'refrig', UtilityDef>> = {
  steam: { T: 140 + T_FROM_C, dir: 'heat', eff: 0.90, src: 'DESIGN-3.7-3.8', conf: 'GAME' },
  fired: { T: 900 + T_FROM_C, dir: 'heat', eff: 0.85, src: 'DESIGN-3.7-3.8', conf: 'GAME' },
  cw: { T: 35 + T_FROM_C, dir: 'cool', eff: 1, src: 'DESIGN-3.7-3.10', conf: 'GAME' },
  refrig: { T: -33 + T_FROM_C, dir: 'cool', eff: 1, src: 'DESIGN-3.7', conf: 'GAME' },
};

/** Motor efficiency (DESIGN 3.8). */
export const MOTOR_EFF = 0.95;
/** Carnot fraction of the refrigeration cycle (DESIGN 3.8: COP = 0.5 Tc/(Th - Tc)). */
export const CARNOT_FRACTION = 0.5;
/** Heat-rejection temperature of the refrigeration cycle: the cooling-water floor, K. */
export const T_REJECT = UTIL.cw.T;

/** Refrigeration COP = 0.5 Tc / (Th - Tc), always below Carnot (DESIGN 3.8). Infinity-free: returns 0 for Th <= Tc. */
export function copAt(Tcold: number, Thot: number = T_REJECT): number {
  const d = Thot - Tcold;
  return d > 0 && Tcold > 0 ? (CARNOT_FRACTION * Tcold) / d : 0;
}

/** Lower heating value of CH4, J/mol, from the catalogue heats of formation (CO2 and H2O(g) products). */
export const LHV_CH4: number = -(THERMO.CO2!.dHf + 2 * THERMO.H2O!.dHf - THERMO.CH4!.dHf);

/** Latent heat of LP steam at its utility temperature, J/kg: h_g - h_l of H2O from the catalogue at 140 C (game steam model). */
export function steamLatent(): number {
  const g = THERMO.H2O!, l = THERMO['H2O(l)']!;
  return (hOf(g, UTIL.steam.T) - hOf(l, UTIL.steam.T)) / g.M;
}

/** Specific heat assumed for a pseudo-species without thermo data (biomass, lumped mixtures), J/(g K): water-like (GAME). */
export const CP_PSEUDO_J_G_K = 4.18;
/** Enthalpy flow of amounts n (mol/s) at T for a species list that may hold pseudo-species with no thermo rows: catalogue enthalpies where they exist,
 *  M x CP_PSEUDO x (T - 298.15) for the others (sensible only). W. */
export function enthalpyFlowAny(species: readonly string[], n: readonly number[], T: number): number {
  let h = 0;
  species.forEach((id, i) => {
    const x = n[i] ?? 0;
    if (!(x > 0)) return;
    h += hasThermo(id) ? x * hOf(THERMO[id]!, T) : x * (SPECIES[id]?.M ?? 0) * CP_PSEUDO_J_G_K * (T - 298.15);
  });
  return h;
}
/** Mass flow, kg/s, of amounts n in mol/s from the catalogue molar masses (needs no thermo). */
export const massFlowAny = (species: readonly string[], n: readonly number[]): number => species.reduce((a, id, i) => a + ((n[i] ?? 0) * (SPECIES[id]?.M ?? 0)) / 1000, 0);
