// L39 catalogues: carbon-steel schedule-40 pipe (ASME B36.10M inside diameters) with an installed cost per metre, the hot-condensate fluid, and five centrifugal
// pumps (quadratic head curves, efficiency and NPSHr curves). Costs are US$ (equipment money; a level converts it once with the region's capexFx).
import type { Fluid, Pump } from './hydraulics';

/** Commercial steel absolute roughness, m (Moody / Crane TP-410: 0.045-0.05 mm). */
export const EPS_STEEL = 0.046e-3;
export interface PipeSize { nps: string; /** inside diameter, mm (schedule 40) */ idMm: number; /** installed cost, US$ per metre (pipe, fittings share, supports, labour) */ usdPerM: number }
/** ASME B36.10M schedule 40 IDs (wall: 2" 3.91 mm, 2.5" 5.16, 3" 5.49, 4" 6.02, 5" 6.55, 6" 7.11, 8" 8.18). Installed cost: GAME numbers in the shape of Peters & Timmerhaus fig. 12-? (cost ~ D^0.9). */
export const PIPES: PipeSize[] = [
  { nps: '2', idMm: 52.5, usdPerM: 160 },
  { nps: '3', idMm: 77.9, usdPerM: 220 },
  { nps: '4', idMm: 102.3, usdPerM: 290 },
  { nps: '5', idMm: 128.2, usdPerM: 360 },
  { nps: '6', idMm: 154.1, usdPerM: 430 },
  { nps: '8', idMm: 202.7, usdPerM: 580 },
];
/** The 2.5-inch line in the rack (not on sale: the Call-it's line). ID 62.7 mm, schedule 40. */
export const OLD_LINE_ID_MM = 62.7;

/** Water at 90 °C (IAPWS-95, NIST Chemistry WebBook saturation table): 965.3 kg/m3, 0.3145 mPa s, vapour pressure 70.18 kPa. */
export const CONDENSATE_90C: Fluid = { name: 'condensate', rho: 965.3, mu: 0.3145e-3, pVap: 70.18e3 };

const P = (id: string, h0: number, h1: number, h2: number, qBep: number, etaBep: number, n0: number, n2: number, priceUsd: number, motorKw: number): Pump =>
  ({ id, h0, h1, h2, qBep, etaBep, n0, n2, qMin: 0.3 * qBep, qMax: 1.25 * qBep, priceUsd, motorKw });
/** Five end-suction pumps at 2900 rpm, curves as maker's catalogue quadratics (Q in m3/h, H and NPSHr in m). GAME numbers in real proportions. */
export const PUMPS: Pump[] = [
  P('P1', 30, 0.05, 0.0035, 40, 0.66, 1.4, 0.00060, 4200, 5.5),
  P('P2', 33, 0.06, 0.0020, 62, 0.74, 1.6, 0.00042, 5600, 11),
  P('P3', 27, 0.05, 0.0012, 85, 0.76, 1.8, 0.00030, 6400, 11),
  P('P4', 56, 0.04, 0.0034, 70, 0.70, 2.0, 0.00045, 7900, 22),
  P('P5', 42, 0.03, 0.0008, 130, 0.80, 2.4, 0.00022, 9800, 22),
];
