// End to end on a real solved Haber-style loop: raising the converter temperature flips the Why text to the T-up exothermic template, with
// the engine's own K values and ceilings; also the needs chip and the query's argument handling.
import { describe, expect, it } from 'vitest';
import { must, newEngine } from '../../engine/test-helpers';
import { sci } from './index';

function haber() {
  const e = newEngine();
  (e.state as any).presets.eq_reactor = { reactions: 'R1' };
  const ids: Record<string, string> = {};
  let i = 0;
  const place = (role: string, type: string): string => { const r = must(e, 'placeUnit', type, (i % 5) * 4, Math.floor(i / 5) * 4, 0); i++; return (ids[role] = r.id as string); };
  const pipe = (a: string, ap: string, b: string, bp: string): void => { must(e, 'connect', ids[a], ap, ids[b], bp); };
  for (const [r, t] of [['feed', 'feed'], ['mix', 'mixer'], ['comp', 'compressor'], ['rx', 'eq_reactor'], ['cool', 'cooler'], ['sep', 'nh3_sep'], ['split', 'splitter'], ['valve', 'valve'], ['vent', 'vent'], ['prod', 'product']] as const) place(r, t);
  must(e, 'setFeed', ids.feed, { x: [0.24, 0.73, 0.01, 0.02], flow: 1, T: 300, P: 2e6 });
  must(e, 'setParam', ids.comp, 'P', 1e7); must(e, 'setParam', ids.comp, 'stages', 2);
  must(e, 'setParam', ids.rx, 'T', 700);
  must(e, 'setParam', ids.cool, 'T', 320); must(e, 'setParam', ids.cool, 'utility', 'cw');
  must(e, 'setParam', ids.split, 'frac', 0.05); must(e, 'setParam', ids.valve, 'P', 2e6);
  pipe('feed', 'out', 'mix', 'in1'); pipe('mix', 'out', 'comp', 'in'); pipe('comp', 'out', 'rx', 'in'); pipe('rx', 'out', 'cool', 'in'); pipe('cool', 'out', 'sep', 'in');
  pipe('sep', 'vap', 'split', 'in'); pipe('sep', 'liq', 'prod', 'in'); pipe('split', 'purge', 'vent', 'in'); pipe('split', 'out', 'valve', 'in'); pipe('valve', 'out', 'mix', 'in2');
  return { e, ids };
}

describe('explainRun on a real loop', () => {
  it('raising the converter T gives the T-up exothermic sentence with the real K values', () => {
    const { e, ids } = haber();
    must(e, 'commission');
    const k0 = e.state.solved!.units[ids.rx!]!.info;
    must(e, 'setParam', ids.rx, 'T', 800);
    must(e, 'commission');
    const k1 = e.state.solved!.units[ids.rx!]!.info;
    expect(k1.K).toBeLessThan(k0.K!);
    const out = e.q('explainRun') as { sentences: string[]; key: string; factors: { key: string; unitId: string }[] };
    expect(out.key).toBe('why.T_UP_EXO');
    expect(out.factors[0]).toMatchObject({ unitId: ids.rx, key: 'T' });
    const text = out.sentences.join(' ');
    expect(out.sentences[0]).toBe(`You raised the temperature at ${ids.rx} from 427 °C to 527 °C.`);
    expect(text).toContain(`K fell from ${sci(k0.K!)} to ${sci(k1.K!)}`);
    expect(text).toMatch(/exothermic \(ΔH = [−-]\d+(\.\d+)? kJ\/mol\)/);
    expect(text).toMatch(/ceiling on conversion fell from \d+(\.\d+)? % to \d+(\.\d+)? %/);
    expect(text).toMatch(/production (rose|fell) \d+(\.\d+)? %/);
    // determinism: the same state answers the same
    expect(e.q('explainRun')).toEqual(out);
    expect(e.q('explainRun', [-2, -1])).toEqual(out);
  });
  it('learner mode adds one hint; a single run, or no run, explains nothing', () => {
    const { e, ids } = haber();
    expect((e.q('explainRun') as { sentences: string[] }).sentences).toEqual([]);
    must(e, 'commission');
    expect((e.q('explainRun') as { sentences: string[] }).sentences).toEqual([]);
    must(e, 'setParam', ids.rx, 'T', 800); must(e, 'commission');
    (e.state as any).mode = 'engineer';
    const eng = (e.q('explainRun') as { sentences: string[] }).sentences;
    (e.state as any).mode = 'learner';
    const lrn = (e.q('explainRun') as { sentences: string[] }).sentences;
    expect(lrn).toHaveLength(eng.length + 1); expect(lrn[lrn.length - 1]).toMatch(/^Hint: /);
  });
  it('a purge of zero is explained by NO_EXIT through the failed commission', () => {
    const { e, ids } = haber();
    must(e, 'commission');
    must(e, 'setParam', ids.split, 'frac', 0); must(e, 'commission');
    const out = e.q('explainRun') as { sentences: string[]; key: string };
    expect(out.key).toBe('why.NO_EXIT');
    expect(out.sentences.join(' ')).toMatch(/purge/);
  });
  it('needs(unit): an open inlet, a failed unit, nothing for a healthy one', () => {
    const { e, ids } = haber();
    must(e, 'commission');
    const extra = must(e, 'placeUnit', 'cooler', 20, 12, 0).id as string;
    expect((e.q('needs', [extra]) as { code: string; text: string }).code).toBe('INLET');
    expect(e.q('needs', [extra])).toMatchObject({ text: expect.stringContaining('In') });
    expect(e.q('needs', [ids.feed])).toBeNull();
    expect(e.q('needs', [ids.rx])).toBeNull();
    expect(() => e.q('needs', ['nope'])).toThrow();
  });
});
