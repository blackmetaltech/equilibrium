// Shared helpers of the engine tests (not shipped): build an engine, run actions that must succeed, and lay out the ammonia-style
// recycle loop from real units (feed, mixer, compressor, cooler, NH3 separator, splitter / purge, valve, vent, product).
import { Engine } from '@core/kit';
import type { ActionResult } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';

export const SPECIES = ['N2', 'H2', 'Ar', 'NH3'];

export function newEngine(species: string[] = SPECIES): Engine<EqState> {
  const e = new Engine(GAME);
  e.autosave = false;
  if (species.length) must(e, 'setSpecies', species);
  return e;
}
export function must(e: Engine<EqState>, name: string, ...args: unknown[]): ActionResult {
  const r = e.act(name, args);
  if (!r.ok) throw new Error(`${name}(${JSON.stringify(args)}) rejected: ${r.message}`);
  return r;
}
export const reject = (e: Engine<EqState>, name: string, ...args: unknown[]): string => {
  const r = e.act(name, args);
  if (r.ok) throw new Error(`${name}(${JSON.stringify(args)}) was accepted`);
  return r.message;
};

export interface Loop { ids: Record<string, string>; pipes: Record<string, string> }

/** The recycle loop; `extra` adds a second feed and a heat exchanger (12 units). Returns the unit and pipe ids by role. */
export function buildLoop(e: Engine<EqState>, extra = false): Loop {
  const ids: Record<string, string> = {}, pipes: Record<string, string> = {};
  let i = 0;
  const place = (role: string, type: string): string => {
    const r = must(e, 'placeUnit', type, (i % 5) * 4, Math.floor(i / 5) * 4, 0); i++;
    return (ids[role] = r.id as string);
  };
  const pipe = (role: string, a: string, ap: string, b: string, bp: string): void => { pipes[role] = must(e, 'connect', ids[a], ap, ids[b], bp).id as string; };
  place('feed', 'feed'); place('mix', 'mixer'); place('comp', 'compressor'); place('cool', 'cooler');
  if (extra) { place('feed2', 'feed'); place('hx', 'hx'); }
  place('sep', 'nh3_sep'); place('split', 'splitter'); place('valve', 'valve'); place('vent', 'vent'); place('prod', 'product');
  if (extra) place('sink', 'sink');
  must(e, 'setFeed', ids.feed, { x: [0.24, 0.73, 0.01, 0.02], flow: 1, T: 300, P: 2e6 });
  must(e, 'setParam', ids.comp, 'P', 1e7); must(e, 'setParam', ids.comp, 'stages', 2);
  must(e, 'setParam', ids.cool, 'T', 320); must(e, 'setParam', ids.cool, 'utility', 'cw');
  must(e, 'setParam', ids.split, 'frac', 0.05); must(e, 'setParam', ids.valve, 'P', 2e6);
  pipe('f_m', 'feed', 'out', 'mix', 'in1'); pipe('m_k', 'mix', 'out', 'comp', 'in'); pipe('k_c', 'comp', 'out', 'cool', 'in');
  if (extra) {
    must(e, 'setFeed', ids.feed2, { x: [1, 0, 0, 0], flow: 0.5, T: 300, P: 1e7 }); must(e, 'setParam', ids.hx, 'area', 10);
    pipe('c_h', 'cool', 'out', 'hx', 'hot_in'); pipe('f2_h', 'feed2', 'out', 'hx', 'cold_in'); pipe('h_s', 'hx', 'hot_out', 'sep', 'in'); pipe('h_k', 'hx', 'cold_out', 'sink', 'in');
  } else pipe('c_s', 'cool', 'out', 'sep', 'in');
  pipe('s_x', 'sep', 'vap', 'split', 'in'); pipe('s_p', 'sep', 'liq', 'prod', 'in');
  pipe('x_v', 'split', 'purge', 'vent', 'in'); pipe('x_r', 'split', 'out', 'valve', 'in'); pipe('v_m', 'valve', 'out', 'mix', 'in2');
  return { ids, pipes };
}
