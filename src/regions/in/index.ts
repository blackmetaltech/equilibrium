// DRAFT region pack: India (DESIGN §11.3). Not shipping in v0.1 (status 'draft': never offered to players), kept and tested so the
// region seam stays honest. Everything Indian lives here: rupees with lakh/crore grouping, local names, local prices.
// Prices are in rupees, converted ONCE from the global US$ rows at 83 INR per USD (FX is never applied at runtime); the rate is in
// every converted row's src. Rows the design gives natively (APM gas, HT tariff, ethanol price) are entered as given.
import { defineRegion } from '@core/regions';
import { defaultSeeds, EXAM_NUMBERS, EXAM_LEVELS, validateEqRegion, type EqRegionData, type ExamProblem, type PriceKey, type PriceRow } from '../data';

const FX = 83;
const rupees = (usd: number): number => Math.round(usd * FX * 100) / 100;
/** A row converted once from a US$ base value. */
const conv = (usd: number, unit: string, conf: PriceRow['conf'], what: string): PriceRow =>
  ({ value: rupees(usd), unit, conf, src: `${what}; base USD ${usd}, converted once at ${FX} INR per USD` });
const own = (value: number, unit: string, conf: PriceRow['conf'], src: string): PriceRow => ({ value, unit, conf, src });

const exam = (): Record<string, ExamProblem> => {
  const o: Record<string, ExamProblem> = {};
  for (const lv of EXAM_LEVELS) o[lv] = { id: EXAM_NUMBERS[lv].id, numbers: { ...EXAM_NUMBERS[lv].numbers }, citation: 'NCERT and JEE Main style problem (exercise number not yet verified); oracle ' + EXAM_NUMBERS[lv].id };
  return o;
};

const prices: Record<PriceKey, PriceRow> = {
  gas_default: own(rupees(6.9), 'per MMBtu', 'SNIP', `India APM gas 6.9 USD/MMBtu (PPAC 2025), converted once at ${FX} INR per USD`),
  gas_cheap: conv(3.5, 'per MMBtu', 'FETCHED', 'US Henry Hub 2025, 3.53 USD/MMBtu rounded'),
  electricity: own(7, 'per kWh', 'UNVERIFIED', 'India HT industrial tariff, about 6 to 8 INR/kWh, midpoint'),
  steam_water_treatment: conv(2, 'per t', 'GAME', 'Water treatment surcharge on steam'),
  cooling_water: conv(0.40, 'per GJ', 'UNVERIFIED', 'GAME placeholder until sourced'),
  carbon: own(0, 'per t CO₂e', 'SNIP', 'India CCTS does not cover ammonia or urea as of 2025-26'),
  carbon_export: conv(80, 'per t CO₂e', 'GAME', 'Export levels, about EU ETS 2025 average'),
  ammonia: conv(400, 'per t', 'SNIP', 'FOB Middle East 2025'),
  urea: conv(340, 'per t', 'FETCHED', 'World Bank Pink Sheet 2024; flavour only'),
  sulfur: conv(165, 'per t', 'SNIP', 'Qatar QSP early 2025'),
  sulfuric_acid: conv(100, 'per t', 'GAME', 'Mid-range of 2024 observations'),
  methanol: conv(380, 'per t', 'SNIP', 'Methanex APAC 2025; stretch level only'),
  ethanol: own(57.97, 'per L', 'SNIP', 'ESY 2024-25 OMC price, C-heavy molasses (B-heavy 60.73, cane juice 65.61); stretch level only'),
  hydrogen: conv(1.75, 'per kg', 'GAME', 'Midpoint of grey hydrogen 1.0 to 2.5 USD/kg'),
};

export const IN = defineRegion<EqRegionData>({
  id: 'in', name: 'India (draft)', status: 'draft', rulesetVersion: 1,
  currency: { code: 'INR', symbol: '₹', decimals: 2, position: 'prefix' },
  numbers: { grouping: 'indian', decimal: '.', group: ',' },
  standards: { relief: 'API 520/526 (ISO 4126)', alarms: 'IEC 62682 / ISA-18.2', flammability: 'EN 1839 / ISO 10156', emissions: 'CPCB' },
  data: {
    prices,
    limits: {
      so2_standard: 2.0, so2_strict: 1.5, so2_expert: 0.65, n2o_bat: [0.12, 0.6], grid_t_co2_per_mwh: 0.727, carbon_price: 0,
      src: {
        so2_standard: 'CPCB, new units up to 300 t/d 2.0 kg/t (third-party transcription, verify the gazette; UNVERIFIED)',
        so2_strict: 'CPCB, large plants above 300 t/d new units 1.5 kg/t (UNVERIFIED)',
        so2_expert: 'New-plant BAT, about 99.9 % conversion (computed, levels_calc.py)',
        n2o_bat: 'LVIC-AAF BREF 2007 Table 3.14 (FETCHED)',
        grid_t_co2_per_mwh: 'CEA v20, FY2023-24 (SNIP)',
        carbon_price: 'India CCTS does not cover ammonia or urea (SNIP)',
      },
    },
    benchmarks: {},
    standardsLabels: { relief: 'API 520/526 (ISO 4126)', alarms: 'IEC 62682 / ISA-18.2', flammability: 'EN 1839 / ISO 10156', emissions: 'CPCB' },
    cast: { mentor: 'anjali', supervisor: 'bashir', manager: 'desai', safety: 'farida' },
    setting: { worksName: 'works.name', coast: 'works.coast', setDressing: ['works.dress.1', 'works.dress.2', 'works.dress.3'] },
    examSet: { id: 'ncert-jee', levels: exam() },
    leaderboardSeeds: defaultSeeds(),
  },
  strings: {
    'works.name': 'Khambhat Bay Works', 'works.coast': 'a tired stretch of the Gujarat coast',
    'works.dress.1': 'salt pans', 'works.dress.2': 'the Gulf of Khambhat flamingo flats', 'works.dress.3': 'a jetty with a sulfur ship',
    'cast.anjali.name': 'Anjali Rao', 'cast.anjali.title': 'Chief engineer',
    'cast.bashir.name': 'Bashir Khan', 'cast.bashir.title': 'Night-shift supervisor',
    'cast.desai.name': 'Mr. Desai', 'cast.desai.title': 'Plant manager',
    'cast.farida.name': 'Dr. Farida Contractor', 'cast.farida.title': 'Safety and environment officer',
  },
  leakMarkers: ['₹', 'lakh', 'crore', 'Rs', 'CPCB', 'CEA', 'BIS', 'IS ', 'Gujarat', 'Khambhat', 'India', 'Indian', 'APM', 'OMC', 'Sindri', 'Ramagundam'],
}, validateEqRegion);
