// Call-it "given": every call-it level says what the call needs (data, table, formula) before the first commission, without the answer.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import { SPECS } from './registry';
import type { EqState } from '../state';
import { l15CallK } from './l15';

const forms = (x: number): string[] => {
  const out = new Set<string>();
  for (const sig of [3, 4]) { const n = Number(x.toPrecision(sig)); out.add(String(n)); }
  return [...out].filter((f) => f.replace(/[^0-9]/g, '').length >= 3);
};
const has = (text: string, f: string): boolean => new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}($|[^0-9])`).test(text);

describe('Call-it given', () => {
  for (const spec of SPECS) {
    const items = spec.callIts && spec.callIts.length > 0 ? spec.callIts : spec.callIt ? [spec.callIt] : [];
    if (items.length === 0) continue;
    it(`${spec.id}: levelInfo carries a non-empty given with no placeholder and no truth`, () => {
      expect(en[`lv.${spec.id}.callit.given` as keyof typeof en], `${spec.id} has no lv.${spec.id}.callit.given`).toBeTypeOf('string');
      for (const mode of ['learner', 'engineer']) {
        const e = new Env(GAME); e.reset({ seed: 1003, level: spec.id, mode });
        const s = e.state as EqState, info = e.engine.q('levelInfo') as any;
        const rows = [info.callIt, ...(info.callIts ?? [])].filter(Boolean);
        for (const r of rows) {
          expect(typeof r.given, `${spec.id} ${r.key}`).toBe('string');
          expect(r.given.length).toBeGreaterThan(30);
          expect(r.given.startsWith('What you have')).toBe(true);
          expect(r.given, `${spec.id} ${r.key}: placeholder left`).not.toMatch(/\{[A-Za-z0-9_]+\}/);
        }
        // the truth of each item (a player-dependent one is null before the run: the solver's number is checked in callit_leak)
        const m = spec.measures(s);
        for (const c of items) {
          const truth = c.truth(s, m);
          if (truth === null || !Number.isFinite(truth) || truth === 0) continue;
          for (const f of forms(truth)) for (const r of rows) expect(has(r.given, f), `${spec.id} ${r.key}: given shows ${f}`).toBe(false);
        }
      }
    });
  }
  it('L15: the call is fixed at the 400 C preheater, whatever the player sets', () => {
    const e = new Env(GAME); e.reset({ seed: 1003, level: 'L15', mode: 'learner' });
    const spec = SPECS.find((x) => x.id === 'L15')!;
    expect(spec.callIt!.truth(e.state as EqState, spec.measures(e.state as EqState))).toBeCloseTo(l15CallK(), 6);
    expect(l15CallK()).toBeGreaterThan(800); expect(l15CallK()).toBeLessThan(830);
  });
});
