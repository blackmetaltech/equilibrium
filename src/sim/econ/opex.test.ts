// Opex unit tests: utilities from duties priced by a plain `prices` object (the game layer passes pack.data.prices).
// Expected numbers computed by hand / python3 -I from DESIGN §3.8 and §4.7 (1 MMBtu = 1.05505585262 GJ).
import { describe, expect, it } from 'vitest';
import { carbonCostPerH, catalystCostPerH, coolingWaterCostPerH, electricityCostPerH, EFFICIENCY, feedCostPerH, fuelCostPerH, opexPerHour,
  refrigerationCop, refrigerationCostPerH, shaftToElectricW, steamCreditPerH, steamPricePerT } from './opex';

const P = (v: number, unit?: string) => ({ value: v, unit });
const prices = { gas_default: P(11), gas_cheap: P(3.5), electricity: P(0.10), steam_water_treatment: P(2), cooling_water: P(0.40), carbon: P(0), carbon_export: P(80),
  ammonia: P(400, 'per t'), sulfuric_acid: P(100, 'per t'), hydrogen: P(1.75, 'per kg'), sulfur: P(165, 'per t') };
const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('efficiencies (DESIGN §3.8)', () => { it('motor 0.95, furnace 0.85, boiler 0.90', () => { expect(EFFICIENCY).toEqual({ motor: 0.95, furnace: 0.85, boiler: 0.90 }); }); });

describe('electricity', () => {
  it('1 MW electric for 1 h at $0.10/kWh is $100', () => { near(electricityCostPerH(1e6, prices), 100); });
  it('shaft work goes through the motor efficiency: 950 kW shaft = 1 MW electric', () => { near(shaftToElectricW(950000), 1e6); });
  it('zero power costs nothing; the price scales the cost linearly', () => { expect(electricityCostPerH(0, prices)).toBe(0); near(electricityCostPerH(1e6, { ...prices, electricity: P(0.2) }), 200); });
});

describe('fuel and steam', () => {
  it('10 MW fired duty: fuel energy = duty / 0.85, gas $11/MMBtu = $10.426/GJ -> $441.57/h', () => { near(fuelCostPerH(10e6, prices), 441.57127016949835); });
  it('the cheap gas contract is selected by key', () => { near(fuelCostPerH(10e6, prices, 'gas_cheap'), 441.57127016949835 * 3.5 / 11); });
  it('steam price per t = fuel / 0.90 on 2361 kJ/kg + $2/t water treatment = $29.35/t (DESIGN §4.7: about $29)', () => { near(steamPricePerT(prices), 29.35084270184129); });
  it('steam raised is a credit: 5 MW of steam = 7.62 t/h worth $223.77/h (positive number, subtracted in the total)', () => { near(steamCreditPerH(5e6, prices), 223.76754283487642); });
});

describe('cooling and refrigeration', () => {
  it('cooling water by duty: 10 MW = 36 GJ/h at $0.40/GJ = $14.40/h', () => { near(coolingWaterCostPerH(10e6, prices), 14.4); });
  it('COP = 0.5 * Tc / (Th - Tc): -20 C chiller against 30 C sink is 2.5315', () => { near(refrigerationCop(253.15, 303.15), 2.5315000000000016); });
  it('1 MW of refrigeration at -20 C costs electricity / COP = 395 kW -> $39.50/h', () => { near(refrigerationCostPerH(1e6, 253.15, 303.15, prices), 39.502271380604384); });
  it('a cold side warmer than the sink is not refrigeration: cost is a code failure', () => { expect(() => refrigerationCop(310, 300)).toThrow('COP_BAD'); });
});

describe('feeds, catalyst, carbon', () => {
  it('feed per t: 10 kg/s ammonia at $400/t = 36 t/h -> $14 400/h', () => { near(feedCostPerH(10, 'ammonia', prices), 14400); });
  it('feed per kg: 1 kg/s hydrogen at $1.75/kg -> $6300/h', () => { near(feedCostPerH(1, 'hydrogen', prices), 6300); });
  it('catalyst: 1000 kg at $20/kg replaced every 8000 h costs $2.50/h', () => { near(catalystCostPerH(1000, 20, 8000), 2.5); });
  it('carbon: 2 t CO2e/h at the export price $80/t is $160/h; the default price is zero', () => { near(carbonCostPerH(2, prices, 'carbon_export'), 160); expect(carbonCostPerH(2, prices)).toBe(0); });
  it('a missing price key is a coded failure through opexPerHour', () => {
    const r = opexPerHour({ firedDutyW: 1e6 }, { electricity: P(0.1) }); expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe('PRICE_MISSING'); expect(r.data).toMatchObject({ key: 'gas_default' }); }
  });
});

describe('opexPerHour totals', () => {
  it('sums the lines and subtracts the steam credit', () => {
    const r = opexPerHour({ shaftW: 950000, firedDutyW: 10e6, steamRaisedW: 5e6, coolingW: 10e6, feeds: [{ key: 'sulfur', kgPerS: 1 }], co2eKgPerH: 2000, carbonKey: 'carbon_export' }, prices);
    if (!r.ok) throw new Error(r.code);
    const o = r.value;
    near(o.electricity, 100); near(o.fuel, 441.57127016949835); near(o.coolingWater, 14.4); near(o.feeds, 3.6 * 165); near(o.carbon, 160);
    near(o.steamCredit, -223.76754283487642);
    near(o.total, o.electricity + o.fuel + o.coolingWater + o.feeds + o.carbon + o.steamCredit, 1e-12);
  });
  it('an empty plant costs nothing', () => { const r = opexPerHour({}, prices); if (!r.ok) throw new Error(r.code); expect(r.value.total).toBe(0); });
  it('negative duties are rejected with a code', () => { const r = opexPerHour({ firedDutyW: -1 }, prices); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('DUTY_NEGATIVE'); });
});

describe('pack switch with two plain price objects (no src/regions import)', () => {
  const inLike = { ...prices, electricity: P(7), gas_default: P(574.9), cooling_water: P(33.2), steam_water_treatment: P(166), ammonia: P(33200) };
  const duties = { shaftW: 950000, firedDutyW: 10e6, coolingW: 10e6, feeds: [{ key: 'ammonia', kgPerS: 1 }] };
  it('same duties, costs scale with each line price, duties and physics inputs untouched', () => {
    const a = opexPerHour(duties, prices), b = opexPerHour(duties, inLike);
    if (!a.ok || !b.ok) throw new Error('opex');
    near(b.value.electricity / a.value.electricity, 70); near(b.value.fuel / a.value.fuel, 574.9 / 11); near(b.value.coolingWater / a.value.coolingWater, 83);
    near(b.value.feeds / a.value.feeds, 83); expect(b.value.total).toBeGreaterThan(a.value.total);
    expect(duties).toEqual({ shaftW: 950000, firedDutyW: 10e6, coolingW: 10e6, feeds: [{ key: 'ammonia', kgPerS: 1 }] });
  });
});
