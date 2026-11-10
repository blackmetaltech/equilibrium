// Saved base plants for the engine-level property tests (P21, P24): built once, saved to a memory store, loaded into a fresh Engine per case.
// Test tooling, not rule code.
import { Engine, MemoryKV } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { buildLoop, must } from '../engine/test-helpers';

export interface Base { name: string; kv: MemoryKV }
type E = Engine<EqState>;

function haber(e: E): void {
  (e.state as unknown as { presets: Record<string, Record<string, number | string>> }).presets.eq_reactor = { reactions: 'R1' };
  const ids: Record<string, string> = {};
  let i = 0;
  const place = (role: string, type: string): void => { ids[role] = must(e, 'placeUnit', type, (i % 5) * 4, Math.floor(i / 5) * 4, 0).id as string; i++; };
  const pipe = (a: string, ap: string, b: string, bp: string): void => { must(e, 'connect', ids[a], ap, ids[b], bp); };
  for (const [r, t] of [['feed', 'feed'], ['mix', 'mixer'], ['comp', 'compressor'], ['rx', 'eq_reactor'], ['cool', 'cooler'], ['sep', 'nh3_sep'], ['split', 'splitter'], ['valve', 'valve'], ['vent', 'vent'], ['prod', 'product']] as const) place(r, t);
  must(e, 'setFeed', ids.feed, { x: [0.24, 0.73, 0.01, 0.02], flow: 1, T: 300, P: 2e6 });
  must(e, 'setParam', ids.comp, 'P', 1e7); must(e, 'setParam', ids.comp, 'stages', 2); must(e, 'setParam', ids.rx, 'T', 700);
  must(e, 'setParam', ids.cool, 'T', 320); must(e, 'setParam', ids.cool, 'utility', 'cw');
  must(e, 'setParam', ids.split, 'frac', 0.05); must(e, 'setParam', ids.valve, 'P', 2e6);
  pipe('feed', 'out', 'mix', 'in1'); pipe('mix', 'out', 'comp', 'in'); pipe('comp', 'out', 'rx', 'in'); pipe('rx', 'out', 'cool', 'in'); pipe('cool', 'out', 'sep', 'in');
  pipe('sep', 'vap', 'split', 'in'); pipe('sep', 'liq', 'prod', 'in'); pipe('split', 'purge', 'vent', 'in'); pipe('split', 'out', 'valve', 'in'); pipe('valve', 'out', 'mix', 'in2');
}

/** Haber loop (commissioned), 12-unit recycle loop (commissioned), 9-unit recycle loop (design phase). */
export function makeBases(): Base[] {
  const out: Base[] = [];
  const add = (name: string, build: (e: E) => void, commission: boolean): void => {
    const kv = new MemoryKV();
    const e = new Engine(GAME, { storage: kv }); e.autosave = false;
    must(e, 'setSpecies', ['N2', 'H2', 'Ar', 'NH3']);
    build(e);
    if (commission) must(e, 'commission');
    must(e, 'save', 'slot2');
    out.push({ name, kv });
  };
  add('haber-commissioned', haber, true);
  add('loop12-commissioned', (e) => { buildLoop(e, true); }, true);
  add('loop9-design', (e) => { buildLoop(e, false); }, false);
  return out;
}

export function fromBase(b: Base): E {
  const e = new Engine(GAME, { storage: b.kv }); e.autosave = false;
  must(e, 'load', 'slot2');
  return e;
}
