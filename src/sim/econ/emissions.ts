// Emissions (DESIGN §4.8): CO2 from fuel and grid electricity, N2O and CH4 through GWP100, SO2 from stack flow and the
// conversion <-> emission identity of the contact process. Plain numbers in, kg/h out.
import { BENCHMARKS } from '../../data/benchmarks';
import { SPECIES } from '../../data/species';
import { EFFICIENCY } from './opex';

/** IPCC AR6 GWP100 (values and sources live in data/benchmarks.ts). */
export const GWP = { N2O: BENCHMARKS['gwp_n2o']!.value, CH4: BENCHMARKS['gwp_ch4']!.value } as const;

export const co2eFromN2o = (kg: number): number => kg * GWP.N2O;
export const co2eFromCh4 = (kg: number): number => kg * GWP.CH4;

/** Fired heater CO2, kg/h: fuel energy = duty / 0.85 (LHV basis) times the natural-gas factor (kg CO2/GJ). */
export function co2FromFuelKgPerH(firedDutyW: number, kgPerGj: number = BENCHMARKS['ng_co2_kg_gj']!.value): number {
  return ((firedDutyW / EFFICIENCY.furnace) * 3600 / 1e9) * kgPerGj;
}
/** Grid CO2, kg/h; `tPerMwh` is the pack's `limits.grid_t_co2_per_mwh`. */
export function co2FromGridKgPerH(electricW: number, tPerMwh: number): number { return (electricW / 1e6) * tPerMwh * 1000; }

export interface Co2eInput { fuelDutyW?: number; electricW?: number; n2oKgPerH?: number; ch4KgPerH?: number }
export function co2eTotalKgPerH(i: Co2eInput, gridTPerMwh: number): number {
  return co2FromFuelKgPerH(i.fuelDutyW ?? 0) + co2FromGridKgPerH(i.electricW ?? 0, gridTPerMwh) + co2eFromN2o(i.n2oKgPerH ?? 0) + co2eFromCh4(i.ch4KgPerH ?? 0);
}

const M_SO2 = SPECIES['SO2']!.M;
const M_H2SO4 = SPECIES['H2SO4(l)']!.M;
/** SO2 leaving a stack, kg/h: total molar flow (mol/s) times the SO2 mole fraction. */
export function so2KgPerH(stackMolPerS: number, ySo2: number): number { return stackMolPerS * ySo2 * M_SO2 * 3.6; }

/**
 * Sulfur-burning acid plant identity (REVIEW E10): per tonne of 100 % H2SO4, kg SO2 = 1000 M_SO2/M_H2SO4 (1 - X)/X, with X the
 * overall SO2 conversion (acid made = SO2 converted). 97 % -> 20.2, 99.7 % -> 1.97, 99.9 % -> 0.65.
 */
export function so2KgPerTonneAcid(conversion: number): number {
  if (!(conversion > 0 && conversion <= 1)) throw new Error('CONV_BAD');
  return (1000 * M_SO2 / M_H2SO4) * (1 - conversion) / conversion;
}
/** Inverse of the identity: the conversion that emits `kgPerTonne`. */
export function conversionFromSo2KgPerTonne(kgPerTonne: number): number {
  const k = (1000 * M_SO2) / M_H2SO4;
  return k / (k + kgPerTonne);
}
