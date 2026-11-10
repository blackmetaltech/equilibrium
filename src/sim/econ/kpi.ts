// Per-tonne normalisations (DESIGN §2.6 metrics): cost per tonne, GJ/t, t CO2e/t, SO2 per tonne of 100 % acid, steam per tonne.
import { annualisedCapex, type AnnualOpts } from './capex';

/** DESIGN §4.6: 8000 operating hours per year. */
export const OPERATING_HOURS = 8000;

export interface AnnualCost { capital: number; opex: number; total: number }
/** Annualised C_BM plus hourly opex (steam credit already inside it, negative) times 8000 h. */
export function annualCost(cbmTotal: number, opexPerHour: number, o: AnnualOpts = {}): AnnualCost {
  const capital = annualisedCapex(cbmTotal, o), opex = opexPerHour * OPERATING_HOURS;
  return { capital, opex, total: capital + opex };
}
/** Annual cost over annual production (tonnes per hour of product x 8000 h). */
export function costPerTonne(annualTotal: number, productTPerH: number): number {
  if (!(productTPerH > 0)) throw new Error('PROD_BAD');
  return annualTotal / (productTPerH * OPERATING_HOURS);
}
/** Energy rate in W per product rate in kg/s -> GJ per tonne. */
export function gjPerTonne(energyW: number, productKgPerS: number): number {
  if (!(productKgPerS > 0)) throw new Error('PROD_BAD');
  return energyW / productKgPerS / 1e6;
}
export function tco2ePerTonne(co2eKgPerH: number, productTPerH: number): number {
  if (!(productTPerH > 0)) throw new Error('PROD_BAD');
  return co2eKgPerH / 1000 / productTPerH;
}
export function steamPerTonne(steamTPerH: number, productTPerH: number): number {
  if (!(productTPerH > 0)) throw new Error('PROD_BAD');
  return steamTPerH / productTPerH;
}
/** kg SO2 per tonne of 100 % acid from a stack rate (kg/h) and the acid rate (t/h of 100 % H2SO4). */
export function kgSo2PerTonneAcid(so2KgPerH: number, acidTPerH: number): number {
  if (!(acidTPerH > 0)) throw new Error('PROD_BAD');
  return so2KgPerH / acidTPerH;
}
