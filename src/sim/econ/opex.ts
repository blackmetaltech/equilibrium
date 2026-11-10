// Operating cost (DESIGN §3.8, §4.7). Every function takes a plain `prices` object ({ key: { value } }, the shape of
// pack.data.prices): src/sim never imports src/regions. Numbers are currency-agnostic (US$ in `global`, INR in `in`).
// Rates are currency per hour; duties are W (SI). Small functions throw a code on bad input; opexPerHour catches and returns it.
import { perMmbtuToPerGj } from '../si';
import { failResult, okResult, type SimResult } from '../types';

export type Prices = Readonly<Record<string, { readonly value: number } | undefined>>;

/** DESIGN §3.8: motor 0.95, fired heater (furnace) 0.85, steam boiler 0.90. */
export const EFFICIENCY = { motor: 0.95, furnace: 0.85, boiler: 0.90 } as const;
/** Enthalpy to raise 1 kg of steam from 105 C feed water to saturated 40 bar... as DESIGN L05: 2801 - 440 = 2361 kJ/kg. */
export const STEAM_DH_J_PER_KG = 2361e3;
/** Default heat sink for refrigeration COP, K (GAME: 30 C). */
export const SINK_K = 303.15;

const need = (prices: Prices, key: string): number => {
  const p = prices[key];
  if (p === undefined || !Number.isFinite(p.value)) throw new Error('PRICE_MISSING:' + key);
  return p.value;
};
const nonneg = (x: number): number => { if (!(x >= 0) || !Number.isFinite(x)) throw new Error('DUTY_NEGATIVE'); return x; };

export const shaftToElectricW = (shaftW: number): number => nonneg(shaftW) / EFFICIENCY.motor;

/** Electricity bought: electric power in W, price per kWh. */
export function electricityCostPerH(electricW: number, prices: Prices): number { return (nonneg(electricW) / 1e3) * need(prices, 'electricity'); }

const gasPerGj = (prices: Prices, key: string): number => perMmbtuToPerGj(need(prices, key));

/** Fired heat: fuel energy = duty / 0.85, priced per MMBtu of the chosen contract (`gas_default` or `gas_cheap`). */
export function fuelCostPerH(firedDutyW: number, prices: Prices, gasKey = 'gas_default'): number {
  return ((nonneg(firedDutyW) / EFFICIENCY.furnace) * 3600 / 1e9) * gasPerGj(prices, gasKey);
}

/** Steam price per tonne: fuel for the boiler at 0.90 plus the water-treatment surcharge. */
export function steamPricePerT(prices: Prices, gasKey = 'gas_default'): number {
  return (STEAM_DH_J_PER_KG / 1e6 / EFFICIENCY.boiler) * gasPerGj(prices, gasKey) + need(prices, 'steam_water_treatment');
}
/** Value of steam the plant raises, per hour (a positive number; opexPerHour subtracts it). */
export function steamCreditPerH(steamRaisedW: number, prices: Prices, gasKey = 'gas_default'): number {
  return ((nonneg(steamRaisedW) * 3600) / STEAM_DH_J_PER_KG / 1000) * steamPricePerT(prices, gasKey);
}

/** Cooling water by duty (price per GJ). */
export function coolingWaterCostPerH(dutyW: number, prices: Prices): number { return ((nonneg(dutyW) * 3600) / 1e9) * need(prices, 'cooling_water'); }

/** COP = 0.5 T_cold / (T_hot - T_cold) (DESIGN §3.8). */
export function refrigerationCop(tColdK: number, tHotK: number = SINK_K): number {
  if (!(tHotK > tColdK) || !(tColdK > 0)) throw new Error('COP_BAD');
  return (0.5 * tColdK) / (tHotK - tColdK);
}
export function refrigerationCostPerH(dutyW: number, tColdK: number, tHotK: number, prices: Prices): number {
  return electricityCostPerH(nonneg(dutyW) / refrigerationCop(tColdK, tHotK), prices);
}

/** Price per tonne of a price row ('per t' or 'per kg'; 'per L' needs `densityKgPerL`). */
export function pricePerTonne(prices: Prices, key: string, densityKgPerL?: number): number {
  const p = prices[key] as { value: number; unit?: string } | undefined;
  need(prices, key);
  const u = p!.unit ?? 'per t';
  if (u === 'per t') return p!.value;
  if (u === 'per kg') return p!.value * 1000;
  if (u === 'per L' && densityKgPerL !== undefined) return (p!.value / densityKgPerL) * 1000;
  throw new Error('PRICE_UNIT');
}
export function feedCostPerH(kgPerS: number, key: string, prices: Prices, densityKgPerL?: number): number {
  return ((nonneg(kgPerS) * 3600) / 1000) * pricePerTonne(prices, key, densityKgPerL);
}

export function catalystCostPerH(kgInventory: number, pricePerKg: number, lifeH: number): number {
  if (!(lifeH > 0)) throw new Error('LIFE_BAD');
  return (nonneg(kgInventory) * pricePerKg) / lifeH;
}

/** Carbon price (per t CO2e) times the emission rate in t CO2e/h. */
export function carbonCostPerH(tCo2ePerH: number, prices: Prices, key = 'carbon'): number { return nonneg(tCo2ePerH) * need(prices, key); }

export interface OpexInput {
  shaftW?: number;
  electricW?: number;
  firedDutyW?: number;
  steamRaisedW?: number;
  coolingW?: number;
  refrig?: Array<{ dutyW: number; tColdK: number; tHotK?: number }>;
  feeds?: Array<{ key: string; kgPerS: number }>;
  catalyst?: Array<{ kg: number; pricePerKg: number; lifeH: number }>;
  co2eKgPerH?: number;
  carbonKey?: string;
  gasKey?: string;
}
export interface OpexOut {
  electricity: number; fuel: number; coolingWater: number; refrigeration: number; feeds: number; catalyst: number; carbon: number;
  /** Negative: steam raised is a credit. */
  steamCredit: number;
  total: number;
}

/** All lines in currency per hour; a missing price key or a negative duty is a coded failure. */
export function opexPerHour(inp: OpexInput, prices: Prices): SimResult<OpexOut> {
  try {
    const electricW = (inp.electricW ?? 0) + (inp.shaftW === undefined ? 0 : shaftToElectricW(inp.shaftW));
    const electricity = electricW > 0 ? electricityCostPerH(electricW, prices) : nonneg(electricW);
    const fuel = inp.firedDutyW ? fuelCostPerH(inp.firedDutyW, prices, inp.gasKey) : nonneg(inp.firedDutyW ?? 0);
    const coolingWater = inp.coolingW ? coolingWaterCostPerH(inp.coolingW, prices) : nonneg(inp.coolingW ?? 0);
    let refrigeration = 0; for (const r of inp.refrig ?? []) refrigeration += refrigerationCostPerH(r.dutyW, r.tColdK, r.tHotK ?? SINK_K, prices);
    let feeds = 0; for (const f of inp.feeds ?? []) feeds += feedCostPerH(f.kgPerS, f.key, prices);
    let catalyst = 0; for (const c of inp.catalyst ?? []) catalyst += catalystCostPerH(c.kg, c.pricePerKg, c.lifeH);
    const carbon = inp.co2eKgPerH ? carbonCostPerH(inp.co2eKgPerH / 1000, prices, inp.carbonKey) : nonneg(inp.co2eKgPerH ?? 0);
    const steamCredit = inp.steamRaisedW ? -steamCreditPerH(inp.steamRaisedW, prices, inp.gasKey) : nonneg(inp.steamRaisedW ?? 0);
    const total = electricity + fuel + coolingWater + refrigeration + feeds + catalyst + carbon + steamCredit;
    if (!Number.isFinite(total)) return failResult('OPEX_NAN');
    return okResult({ electricity, fuel, coolingWater, refrigeration, feeds, catalyst, carbon, steamCredit, total });
  } catch (e) {
    const m = String((e as Error).message);
    if (m.startsWith('PRICE_MISSING:')) return failResult('PRICE_MISSING', { key: m.slice(14) });
    if (m === 'DUTY_NEGATIVE' || m === 'COP_BAD' || m === 'LIFE_BAD' || m === 'PRICE_UNIT') return failResult(m);
    return failResult('OPEX_NAN');
  }
}
