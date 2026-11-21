// Reference designs of the cost levels as CURRENCY-FREE parts (US$ equipment, hourly quantities): the star line of a cost level is 1.03 x the
// reference design priced in the player's region (`costFromParts`), so one conversion (capexFx) and the region's own price rows decide it, and a
// region never needs a hand-written threshold. Captured from each level's solver run (GAME, UNVERIFIED); refdesigns.test.ts re-captures them in
// every region and fails if a part or a priced cost drifts.
import type { CostParts } from '../engine/solved';
import { costFromParts } from '../engine/solved';
import type { EqState } from '../state';

export const REF_DESIGNS: Readonly<Record<string, CostParts>> = {
  L08: { cbmUsd: 2937864.74296113, productTph: 8.5155, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 0, firedDutyW: 294934.26692840597, steamRaisedW: 0, coolingW: 0, refrig: [], feeds: [] } },
  L16: { cbmUsd: 2155219.0921767135, productTph: 3.205664, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 0, firedDutyW: 2632.9620030634105, steamRaisedW: 0, coolingW: 0, refrig: [], feeds: [] } },
  L17: { cbmUsd: 2021797.0649815479, productTph: 3.205664, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 0, firedDutyW: 304388.58511674067, steamRaisedW: 0, coolingW: 0, refrig: [], feeds: [] } },
  L19: { cbmUsd: 2411576.070451071, productTph: 8.51549999999999, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 31454.997179311817, firedDutyW: 0, steamRaisedW: 0, coolingW: 8758091.844610527, refrig: [{ dutyW: 4341555.903118638, tColdK: 253.15 }], feeds: [{ key: 'hydrogen', kgPerS: 0.42000000000000004 }] } },
  L20: { cbmUsd: 2793383.3226823066, productTph: 8.326938610332585, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 40899.12382989534, firedDutyW: 0, steamRaisedW: 0, coolingW: 10442885.865671605, refrig: [{ dutyW: 1444337.4212817056, tColdK: 240.14999999999998 }, { dutyW: 3069043.363767665, tColdK: 253.15 }], feeds: [{ key: 'hydrogen', kgPerS: 0.42000000000000004 }] } },
  L21: { cbmUsd: 2627696.2425146294, productTph: 8.162897717200876, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 35729.62345117572, firedDutyW: 0, steamRaisedW: 0, coolingW: 9560400.186085545, refrig: [{ dutyW: 1318127.7579644024, tColdK: 240.14999999999998 }, { dutyW: 3008612.110748509, tColdK: 253.15 }], feeds: [{ key: 'hydrogen', kgPerS: 0.42000000000000004 }] } },
  L22: { cbmUsd: 4408738.150097726, productTph: 2.9609001381634164, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 39703.04514540131, firedDutyW: 3398696.943055841, steamRaisedW: 2382417.860946956, coolingW: 2758069.6964656673, refrig: [], feeds: [] } },
  L23: { cbmUsd: 1547157.2256323486, productTph: 0.6646348042539588, steamBoughtTph: 2.830854094184866, opex: { shaftW: 0, electricW: 0, firedDutyW: 0, steamRaisedW: 0, coolingW: 1021790.7203052114, refrig: [], feeds: [] } },
  L25: { cbmUsd: 1657562.7680253703, productTph: 8.956434185353123, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 0, firedDutyW: 0, steamRaisedW: 0, coolingW: 0, refrig: [], feeds: [] } },
  L26: { cbmUsd: 5768457.984183809, productTph: 6.98677056, steamBoughtTph: 0, opex: { shaftW: 0, electricW: 0, firedDutyW: 900628.3759610773, steamRaisedW: 4371814.940035091, coolingW: 935676.8568561375, refrig: [], feeds: [{ key: 'ammonia', kgPerS: 0.3311583333333333 }] } },
};

/** The star factor of the cost levels: the reference cost x 1.03 (GAME). */
export const COST_STAR_FACTOR = 1.03;
/** Reference cost of a level's design in the state's region: per tonne (L16..L26) or per hour (L08, the exchanger level). Currency of the region. */
export const refCostPerT = (s: Pick<EqState, 'region'>, id: string): number => costFromParts(s, REF_DESIGNS[id]!).perT;
export const refCostPerH = (s: Pick<EqState, 'region'>, id: string): number => costFromParts(s, REF_DESIGNS[id]!).perH;
/** The cost-level star line in the state's region. */
export const costStarPerT = (s: Pick<EqState, 'region'>, id: string): number => refCostPerT(s, id) * COST_STAR_FACTOR;
export const costStarPerH = (s: Pick<EqState, 'region'>, id: string): number => refCostPerH(s, id) * COST_STAR_FACTOR;

/** L08 sweep of the feasible exchanger areas (stack at 120 C or more, minimum approach 20 K; physics, so the same in every region): [area m2, US$ equipment, fired duty W]. The star line is 1.03 x the cheapest of these in the player's region, because the cheapest area depends on the region's fuel price against its capexFx (global 990 m2, in about 870 m2). */
export const L08_SWEEP: readonly (readonly [number, number, number])[] = [
  [500, 2495985.5633007823, 807553.6730014784], [510, 2504246.47428396, 789422.4249691488], [520, 2512538.4302348327, 771782.5617042463], [530, 2520861.498587795, 754617.9120032107],
  [540, 2529215.741778642, 737912.9577792566], [550, 2537601.2175646476, 721652.8023296604], [560, 2546017.9793231115, 705823.1404069923], [570, 2554466.0763298245, 690410.2299770457],
  [580, 2562945.55401885, 675400.8655546475], [590, 2571456.4542248985, 660782.3530164813], [600, 2579998.81540953, 646542.4857972949], [610, 2588572.6728723175, 632668.4204112911],
  [620, 2597178.0589480232, 619151.1276055686], [630, 2605815.003190793, 605978.6165409982], [640, 2614483.532546267, 593140.4188138209], [650, 2623183.671512476, 580626.4526418159],
  [660, 2631915.4422903005, 568427.0056941938], [670, 2640678.864924234, 556532.7188130384], [680, 2649473.95743413, 544934.5705734491], [690, 2658300.73593855, 533623.862633991],
  [700, 2667159.21477031, 522592.20582944714], [710, 2676049.406584757, 511831.50696541555], [720, 2684971.322461274, 501333.956272691], [730, 2693924.971998484, 491092.01548446156],
  [740, 2702910.363403568, 481098.4065010166], [750, 2711927.503576114, 471346.1006088727], [760, 2720976.3981868457, 461828.30822347105], [770, 2730057.051751574, 452538.46912632976],
  [780, 2739169.4677007184, 443470.24316952005], [790, 2748313.6484446377, 434617.501421893], [800, 2757489.595435093, 425974.3177330876], [810, 2766697.309223065, 417534.9606927871],
  [820, 2775936.7895131754, 409293.88596406905], [830, 2785208.0352149257, 401245.7289709812], [840, 2794511.0444909534, 393385.2979215733], [850, 2803845.814802508, 385707.56714883354],
  [860, 2813212.3429522905, 378207.67075295], [870, 2822610.6251248703, 370880.8965292671], [880, 2832040.6569247777, 363722.68016727734], [890, 2841502.433412456, 356728.5997067699],
  [900, 2850995.949138178, 349894.3702381002], [910, 2860521.1981740715, 343215.8388344487], [920, 2870078.174144337, 336688.979703275], [930, 2879666.8702538195, 330309.88954892615],
  [940, 2889287.2793149655, 324074.783132209], [950, 2898939.3937733276, 317979.9890199783], [960, 2908623.2057316373, 312021.9455143823], [970, 2918338.7069725967, 306197.19675324624],
  [980, 2928085.888980405, 300502.3889732887], [990, 2937864.74296113, 294934.26692840597],
];
const L08_COMMON = REF_DESIGNS.L08!;
/** Cheapest hourly cost of the feasible L08 designs in the state's region, and the area that gives it. */
export function l08Best(s: Pick<EqState, 'region'>): { perH: number; area: number } {
  let best = { perH: Infinity, area: 0 };
  for (const [area, cbmUsd, firedDutyW] of L08_SWEEP) {
    const perH = costFromParts(s, { ...L08_COMMON, cbmUsd, opex: { ...L08_COMMON.opex, firedDutyW } }).perH;
    if (perH < best.perH) best = { perH, area };
  }
  return best;
}
