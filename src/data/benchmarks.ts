// Scoring references and emission factors (DESIGN §4.8). Global defaults; a region pack may override any key through
// `pack.data.benchmarks` (see benchmark()). Every row carries `src` and `conf`. Limits that are regulatory (SO2, N2O BAT,
// grid factor, carbon price) are region-pack data and live in src/regions, not here.
import type { Conf } from '../sim/types';

export interface BenchRow { value: number; unit: string; src: string; conf: Conf }
const r = (value: number, unit: string, conf: Conf, src: string): BenchRow => ({ value, unit, conf, src });

const IFA = 'IFA 2009 Energy efficiency and CO2 emissions in ammonia production';
const IPCC06 = 'IPCC 2006 Guidelines Vol 3 ch 3 Table 3.3';
const BREF = 'LVIC-AAF BREF 2007 Table 3.14';

export const BENCHMARKS: Readonly<Record<string, BenchRow>> = {
  nh3_bat_gj_t: r(28, 'GJ/t NH3', 'FETCHED', `${IFA}, gas SMR BAT`),
  nh3_bat_co2_t_t: r(1.6, 't CO2/t NH3', 'FETCHED', `${IFA}, gas SMR BAT`),
  nh3_survey_avg_gj_t: r(36.6, 'GJ/t NH3', 'FETCHED', `${IFA}, 2008 survey of 93 plants`),
  nh3_survey_min_gj_t: r(27.0, 'GJ/t NH3', 'FETCHED', `${IFA}, 2008 survey of 93 plants`),
  nh3_survey_max_gj_t: r(58.2, 'GJ/t NH3', 'FETCHED', `${IFA}, 2008 survey of 93 plants`),
  nh3_coal_bat_gj_t: r(42, 'GJ/t NH3', 'FETCHED', `${IFA}, coal gasification BAT`),
  nh3_coal_bat_co2_t_t: r(3.8, 't CO2/t NH3', 'FETCHED', `${IFA}, coal gasification BAT`),
  nh3_floor_gj_t: r(20, 'GJ/t NH3', 'FETCHED', `${IFA}, thermodynamic floor (chart label, basis not stated)`),
  h2so4_steam_conv_low: r(1.0, 't steam/t H2SO4', 'SNIP', 'Monsanto/IFA papers, conventional sulfur-burning acid plant'),
  h2so4_steam_conv_high: r(1.2, 't steam/t H2SO4', 'SNIP', 'Monsanto/IFA papers, conventional sulfur-burning acid plant'),
  h2so4_steam_lt_low: r(1.7, 't steam/t H2SO4', 'SNIP', 'Monsanto/IFA papers, with low-temperature heat recovery'),
  h2so4_steam_lt_high: r(1.8, 't steam/t H2SO4', 'SNIP', 'Monsanto/IFA papers, with low-temperature heat recovery'),
  methanol_gj_t_low: r(31, 'GJ/t MeOH', 'SNIP', 'RSC Sust. Energy and Fuels 2025 d5se00165j; hyco1.com'),
  methanol_gj_t_high: r(36, 'GJ/t MeOH', 'SNIP', 'RSC Sust. Energy and Fuels 2025 d5se00165j; hyco1.com'),
  ethanol_steam_low: r(1.7, 'kg steam/L', 'SNIP', 'Praj case study, modern 100 KLPD evaporative'),
  ethanol_steam_high: r(2.8, 'kg steam/L', 'SNIP', 'MPCB/EIA 350 KLPD table, C-heavy'),
  hno3_n2o_atmospheric: r(5, 'kg N2O/t HNO3', 'FETCHED', `${IPCC06}, unabated atmospheric`),
  hno3_n2o_medium: r(7, 'kg N2O/t HNO3', 'FETCHED', `${IPCC06}, unabated medium pressure`),
  hno3_n2o_high: r(9, 'kg N2O/t HNO3', 'FETCHED', `${IPCC06}, unabated high pressure`),
  hno3_n2o_bat_low: r(0.12, 'kg N2O/t HNO3', 'FETCHED', `${BREF}, new plants`),
  hno3_n2o_bat_high: r(0.6, 'kg N2O/t HNO3', 'FETCHED', `${BREF}, new plants`),
  gwp_n2o: r(273, 'GWP100', 'FETCHED', 'IPCC AR6 WG1 Table 7.15'),
  gwp_ch4: r(29.8, 'GWP100', 'FETCHED', 'IPCC AR6 WG1 Table 7.15, fossil methane'),
  grid_world_t_mwh: r(0.47, 't CO2/MWh', 'SNIP', 'Ember 2024 world average'),
  grid_eu_t_mwh: r(0.213, 't CO2/MWh', 'SNIP', 'Ember 2024 EU'),
  ng_co2_kg_gj: r(56.1, 'kg CO2/GJ fuel (LHV)', 'UNVERIFIED', 'IPCC 2006 Vol 2 Table 2.2 natural gas default, recalled from memory; pure methane gives 54.9 (stoichiometry)'),
};
export const BENCH_KEYS: readonly string[] = Object.keys(BENCHMARKS);

/** A benchmark value; a region pack's `benchmarks` entry for the same key overrides the global one. */
export function benchmark(key: string, packBenchmarks?: Readonly<Record<string, { value: number } | undefined>>): number {
  const o = packBenchmarks?.[key];
  if (o !== undefined && Number.isFinite(o.value)) return o.value;
  const b = BENCHMARKS[key];
  if (b === undefined) throw new Error('BENCH_UNKNOWN');
  return b.value;
}
