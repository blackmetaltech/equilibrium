// The game's region registry. `global` ships; `in` is a draft that exercises the seam (regions.test.ts runs the whole game in
// every registered pack, drafts included, and checks that no regional token leaks across packs).
//
// Add a region:
//   1. src/regions/<id>/index.ts: `export const XX = defineRegion<EqRegionData>({...}, validateEqRegion)` (copy `in/`)
//   2. register it below. Packs with status 'draft' are playable but not listed by init().
//   3. run `pnpm test`: validation, leak and ruleset tests cover the new pack automatically.
// Bump a pack's `rulesetVersion` whenever a data change can change a level score (it is part of every solution code).
import { RegionRegistry } from '@core/regions';
import { validateEqPackStrings, validateEqRegion, type EqRegionData } from './data';
import { GLOBAL } from './global';
import { IN } from './in';

export const REGIONS = new RegionRegistry<EqRegionData>({ validateData: validateEqRegion, defaultId: 'global' })
  .register(GLOBAL)
  .register(IN);

for (const p of REGIONS.list({ includeDrafts: true })) {
  const errs = validateEqPackStrings(p);
  if (errs.length) throw new Error(`Invalid region pack strings:\n - ${errs.join('\n - ')}`);
}
