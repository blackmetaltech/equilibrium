// Plants shared by the bench and the convergence report (tooling, not rule code). Each builder returns a ready Engine in design phase.
import type { Engine } from '@core/kit';
import type { EqState } from '../src/state';
import { buildLoop, must, newEngine } from '../src/engine/test-helpers';

export { buildLoop, must, newEngine };
type E = Engine<EqState>;

/** Haber synthesis loop: feed, mixer, compressor, equilibrium converter, cooler, NH3 separator, purge splitter, valve, vent, product. */
export function haberLoop(purge = 0.05, converterT = 700): { e: E; ids: Record<string, string> } {
  const e = newEngine();
  (e.state as unknown as { presets: Record<string, Record<string, number | string>> }).presets.eq_reactor = { reactions: 'R1' };
  const ids: Record<string, string> = {};
  let i = 0;
  const place = (role: string, type: string): void => { ids[role] = must(e, 'placeUnit', type, (i % 5) * 4, Math.floor(i / 5) * 4, 0).id as string; i++; };
  const pipe = (a: string, ap: string, b: string, bp: string): void => { must(e, 'connect', ids[a], ap, ids[b], bp); };
  for (const [r, t] of [['feed', 'feed'], ['mix', 'mixer'], ['comp', 'compressor'], ['rx', 'eq_reactor'], ['cool', 'cooler'], ['sep', 'nh3_sep'], ['split', 'splitter'], ['valve', 'valve'], ['vent', 'vent'], ['prod', 'product']] as const) place(r, t);
  must(e, 'setFeed', ids.feed, { x: [0.24, 0.73, 0.01, 0.02], flow: 1, T: 300, P: 2e6 });
  must(e, 'setParam', ids.comp, 'P', 1e7); must(e, 'setParam', ids.comp, 'stages', 2);
  must(e, 'setParam', ids.rx, 'T', converterT);
  must(e, 'setParam', ids.cool, 'T', 320); must(e, 'setParam', ids.cool, 'utility', 'cw');
  must(e, 'setParam', ids.split, 'frac', purge); must(e, 'setParam', ids.valve, 'P', 2e6);
  pipe('feed', 'out', 'mix', 'in1'); pipe('mix', 'out', 'comp', 'in'); pipe('comp', 'out', 'rx', 'in'); pipe('rx', 'out', 'cool', 'in'); pipe('cool', 'out', 'sep', 'in');
  pipe('sep', 'vap', 'split', 'in'); pipe('sep', 'liq', 'prod', 'in'); pipe('split', 'purge', 'vent', 'in'); pipe('split', 'out', 'valve', 'in'); pipe('valve', 'out', 'mix', 'in2');
  return { e, ids };
}

/** Contact process, double contact double absorption: 3-bed converter, interpass absorber, reheater, 1-bed converter, tail absorber, stack. */
export function dcda(): { e: E; ids: Record<string, string> } {
  const sp = ['SO2', 'O2', 'SO3', 'N2', 'H2SO4(l)', 'H2O(l)'];
  const e = newEngine(sp);
  const pre = (e.state as unknown as { presets: Record<string, Record<string, number | string>> }).presets;
  pre.multibed = { beds: 3, reactions: 'R2', Tcool1: 693.15, Tcool2: 693.15 };
  const ids: Record<string, string> = {};
  let i = 0;
  const place = (role: string, type: string): void => { ids[role] = must(e, 'placeUnit', type, (i % 5) * 4, Math.floor(i / 5) * 6, 0).id as string; i++; };
  for (const [r, t] of [['feed', 'feed'], ['mb1', 'multibed'], ['abs1', 'absorber'], ['acid1', 'product'], ['heat', 'heater'], ['mb2', 'multibed'], ['abs2', 'absorber'], ['acid2', 'product'], ['stack', 'stack'], ['q1', 'feed'], ['q2', 'feed']] as const) place(r, t);
  must(e, 'setFeed', ids.feed, { x: [0.1, 0.11, 0, 0.79, 0, 0], flow: 1, T: 693.15, P: 1.5 * 101325 });
  must(e, 'setParam', ids.heat, 'T', 693.15);
  for (const q of ['q1', 'q2']) must(e, 'setFeed', ids[q], { x: [0, 0.21, 0, 0.79, 0, 0], flow: 0.001, T: 450, P: 1.5 * 101325 });
  const pipe = (a: string, ap: string, b: string, bp: string): void => { must(e, 'connect', ids[a], ap, ids[b], bp); };
  pipe('feed', 'out', 'mb1', 'in'); pipe('mb1', 'out', 'abs1', 'in'); pipe('abs1', 'acid', 'acid1', 'in'); pipe('abs1', 'out', 'heat', 'in');
  pipe('q1', 'out', 'mb1', 'quench'); pipe('q2', 'out', 'mb2', 'quench');
  pipe('heat', 'out', 'mb2', 'in'); pipe('mb2', 'out', 'abs2', 'in'); pipe('abs2', 'acid', 'acid2', 'in'); pipe('abs2', 'out', 'stack', 'in');
  return { e, ids };
}

/** 12-unit recycle loop (engine test plant with a second feed and a heat exchanger). */
export function loop12(): { e: E } { const e = newEngine(); buildLoop(e, true); return { e }; }

/** 20-unit plant: four feed-heater-cooler-valve branches into a 4-way mixer, a purge splitter, a vent and a product tank. */
export function plant20(): { e: E } {
  const e = newEngine();
  const mix = must(e, 'placeUnit', 'mixer4', 20, 12, 0).id as string;
  const sp = must(e, 'placeUnit', 'splitter', 20, 8, 0).id as string, vent = must(e, 'placeUnit', 'vent', 20, 4, 0).id as string;
  const prod = must(e, 'placeUnit', 'product', 16, 0, 0).id as string;
  for (let b = 0; b < 4; b++) {
    const ids = ['feed', 'heater', 'cooler', 'valve'].map((t, k) => must(e, 'placeUnit', t, k * 4, b * 4, 0).id as string);
    must(e, 'setFeed', ids[0], { x: [0.25, 0.25, 0.25, 0.25], flow: 1, T: 300, P: 5e6 });
    must(e, 'setParam', ids[1], 'T', 420); must(e, 'setParam', ids[2], 'T', 330); must(e, 'setParam', ids[3], 'P', 2e6);
    must(e, 'connect', ids[0], 'out', ids[1], 'in'); must(e, 'connect', ids[1], 'out', ids[2], 'in'); must(e, 'connect', ids[2], 'out', ids[3], 'in');
    must(e, 'connect', ids[3], 'out', mix, 'in' + (b + 1));
  }
  must(e, 'connect', mix, 'out', sp, 'in'); must(e, 'connect', sp, 'purge', vent, 'in'); must(e, 'connect', sp, 'out', prod, 'in');
  return { e };
}
