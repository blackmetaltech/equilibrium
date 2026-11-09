// The default region: a neutral, fictional setting (Kestrel Bay Works), US$, international standards. Ships in v0.1.
// Prices are DESIGN §4.7 (global column), limits §4.8, standards §11.2. Every row carries its source and confidence.
import { defineRegion } from '@core/regions';
import { defaultSeeds, EXAM_NUMBERS, EXAM_LEVELS, validateEqRegion, type EqRegionData, type ExamProblem, type PriceRow } from '../data';

const row = (value: number, unit: string, conf: PriceRow['conf'], src: string): PriceRow => ({ value, unit, conf, src });

const exam = (): Record<string, ExamProblem> => {
  const o: Record<string, ExamProblem> = {};
  for (const lv of EXAM_LEVELS) o[lv] = { id: EXAM_NUMBERS[lv].id, numbers: { ...EXAM_NUMBERS[lv].numbers }, citation: 'NCERT-style problem (exercise number not yet verified); oracle ' + EXAM_NUMBERS[lv].id };
  return o;
};

export const GLOBAL = defineRegion<EqRegionData>({
  id: 'global', name: 'Global', status: 'shipping', rulesetVersion: 1,
  currency: { code: 'USD', symbol: '$', decimals: 2, position: 'prefix' },
  numbers: { grouping: 'western', decimal: '.', group: ',' },
  standards: { relief: 'API 520/526 (ISO 4126)', alarms: 'IEC 62682 / ISA-18.2', flammability: 'EN 1839 / ISO 10156', emissions: 'US NSPS 40 CFR 60 / EU BREF LVIC-AAF' },
  data: {
    prices: {
      gas_default: row(11.0, 'per MMBtu', 'FETCHED', 'World Bank Pink Sheet, Natural gas Europe, 2024 annual 10.96 USD/MMBtu, rounded (LNG Japan 2024: 12.85)'),
      gas_cheap: row(3.5, 'per MMBtu', 'FETCHED', 'World Bank Pink Sheet, US Henry Hub 2025 = 3.53 USD/MMBtu, rounded'),
      electricity: row(0.10, 'per kWh', 'GAME', 'Between US industrial 2024 8.13 c/kWh (EIA-861 Table 4) and EU27 non-household band ID 2024 about 0.142 EUR/kWh (Eurostat nrg_pc_205)'),
      steam_water_treatment: row(2, 'per t', 'GAME', 'DESIGN §4.7: steam = fuel cost / 0.90 boiler efficiency + 2 USD/t water treatment'),
      cooling_water: row(0.40, 'per GJ', 'UNVERIFIED', 'Turton ch 8 order of magnitude; GAME placeholder until sourced'),
      carbon: row(0, 'per t CO₂e', 'GAME', 'Default levels carry no carbon price'),
      carbon_export: row(80, 'per t CO₂e', 'GAME', 'Export levels; about EU ETS 2025 average 74 EUR/t (SNIP), rounded'),
      ammonia: row(400, 'per t', 'SNIP', 'FOB Middle East swung 315 to 530 USD/t in 2025'),
      urea: row(340, 'per t', 'FETCHED', 'World Bank Pink Sheet 2024 = 338 USD/t; flavour only in v0.1'),
      sulfur: row(165, 'per t', 'SNIP', 'Early 2025 Qatar QSP, derived'),
      sulfuric_acid: row(100, 'per t', 'GAME', 'Mid-range of 2024 observations 64 to 140 USD/t (SNIP)'),
      methanol: row(380, 'per t', 'SNIP', 'Methanex APAC 2025 posted; stretch level only'),
      ethanol: row(0.55, 'per L', 'F2', 'US rack, Omaha FOB about 2.07 USD/gal Oct 2025; Brazil hydrous about 0.48 USD/L (SNIP); stretch level only'),
      hydrogen: row(1.75, 'per kg', 'GAME', 'Midpoint of grey hydrogen 1.0 to 2.5 USD/kg (IEA via SNIP); L28 derives it from SMR instead'),
    },
    limits: {
      so2_standard: 2.0, so2_strict: 1.3, so2_expert: 0.65, n2o_bat: [0.12, 0.6], grid_t_co2_per_mwh: 0.47, carbon_price: 0,
      src: {
        so2_standard: 'US NSPS 40 CFR 60.82(a), 2.0 kg SO₂ per t of 100 % H₂SO₄ (FETCHED)',
        so2_strict: 'LVIC-AAF BREF 2007 Table 4.24, lower end of BAT for sulfur-burning DCDA (FETCHED)',
        so2_expert: 'New-plant BAT, about 99.9 % conversion (computed, levels_calc.py)',
        n2o_bat: 'LVIC-AAF BREF 2007 Table 3.14, new plants 0.12 to 0.6 kg per t HNO₃ (FETCHED)',
        grid_t_co2_per_mwh: 'Ember 2024 world average (SNIP)',
        carbon_price: 'GAME default; export levels use the carbon_export price',
      },
    },
    benchmarks: {},
    standardsLabels: { relief: 'API 520/526 (ISO 4126)', alarms: 'IEC 62682 / ISA-18.2', flammability: 'EN 1839 / ISO 10156', emissions: 'US NSPS 40 CFR 60 / EU BREF LVIC-AAF' },
    cast: { mentor: 'mara', supervisor: 'tomas', manager: 'victor', safety: 'noor' },
    setting: { worksName: 'works.name', coast: 'works.coast', setDressing: ['works.dress.1', 'works.dress.2', 'works.dress.3'] },
    examSet: { id: 'ncert-jee-style', levels: exam() },
    leaderboardSeeds: defaultSeeds(),
  },
  strings: {
    'works.name': 'Kestrel Bay Works', 'works.coast': 'a salt-flat coast',
    'works.dress.1': 'salt pans', 'works.dress.2': 'the bay', 'works.dress.3': 'a jetty with a sulfur ship',
    'cast.mara.name': 'Dr. Mara Quinn', 'cast.mara.title': 'Chief engineer',
    'cast.tomas.name': 'Tomas Brandt', 'cast.tomas.title': 'Night-shift supervisor',
    'cast.victor.name': 'Victor Hale', 'cast.victor.title': 'Plant manager',
    'cast.noor.name': 'Dr. Noor Haddad', 'cast.noor.title': 'Safety and environment officer',
  },
}, validateEqRegion);
