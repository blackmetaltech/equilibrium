// Catalyst catalogue wrapper (DESIGN 4.4). Data in catalysts.gen.ts (scripts/port-kinetics.py). Temperatures in deg C.
import type { Conf } from '../sim/types';
import { CATALYSTS_GEN } from './catalysts.gen';

export interface CatalystRec {
  id: string;
  name: string;
  kind: 'heterogeneous' | 'homogeneous' | 'gauze' | 'biological';
  tier: 'must' | 'stretch';
  lawIds: readonly string[];
  /** Operating window, deg C: below Tmin the rate is negligible, above Tmax the catalyst is damaged. */
  Tmin: number;
  Tmax: number;
  TlightOff: number;
  /** Bulk density, kg/m3 (0 = no packed bed). Required, provenance-tagged. */
  rhoB: number;
  rhoBConf: Conf;
  /** Multiplier of the forward pre-exponential per catalyst volume (Ru x10), 1 = reference. */
  kMult: number;
  /** Light-off shift, K (negative = lights off colder): the Arrhenius term is evaluated at T - dTk. K is never changed. */
  dTk: number;
  price: number;
  poisons: readonly string[];
  life: string;
  src: string;
  conf: Conf;
}

export const CATALYSTS: readonly CatalystRec[] = CATALYSTS_GEN as unknown as readonly CatalystRec[];
export const CATALYST_IDS: readonly string[] = CATALYSTS.map((c) => c.id);
const BY_ID: Record<string, CatalystRec> = {};
for (const c of CATALYSTS) BY_ID[c.id] = c;

export function findCatalyst(id: string): CatalystRec | undefined { return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : undefined; }
export function catalystOf(id: string): CatalystRec {
  const c = findCatalyst(id);
  if (c === undefined) throw new Error('unknown catalyst: ' + id);
  return c;
}

export interface CatalystProvenanceRow { id: string; src: string; conf: Conf; rhoB: number; rhoBConf: Conf }
export function catalystProvenanceReport(): CatalystProvenanceRow[] {
  return CATALYSTS.map((c) => ({ id: c.id, src: c.src, conf: c.conf, rhoB: c.rhoB, rhoBConf: c.rhoBConf }));
}
