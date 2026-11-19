// The build checklist (levelInfo.buildGuide): present on the big builds, ticks from the plant, and the notebook's own build order ticks every line.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import type { Action } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { SPECS } from './registry';
import { spiritsScript, L23_REF } from './l23';
import { dcdaBuild } from './l25';
import { nitricScript, L26_REF } from './l26';
import { wtToMole } from './l23';

const mk = (id: string): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 7, level: id, mode: 'engineer' }); return e; };
const lines = (e: Env<EqState>): any[] => (e.engine.q('levelInfo') as any).buildGuide;
const run = (e: Env<EqState>, acts: Action[]): void => { for (const a of acts) if (a.name !== 'commission' && a.name !== 'callIt') e.step(a); };

describe('buildGuide', () => {
  it('L23 / L25 / L26 carry a guide; each has a unique next line and no step is done on a fresh page except settings left at their defaults', () => {
    for (const id of ['L23', 'L25', 'L26']) {
      const g = lines(mk(id));
      expect(g.length, id).toBeGreaterThanOrEqual(8);
      expect(g.filter((x) => x.next).length, id).toBe(1);
      expect(g.filter((x) => x.kind !== 'set').every((x) => !x.done), id).toBe(true);
      expect(new Set(g.map((x) => x.id)).size, id).toBe(g.length);
      for (const x of g) expect(x.text, `${id} ${x.id}`).not.toMatch(/^lv\.|undefined/);
    }
  });
  it('every level with a guide has well-formed steps (settings carry a done predicate)', () => {
    for (const sp of SPECS) for (const b of sp.buildGuide ?? []) { if (b.kind === 'set') expect(b.done, `${sp.id} ${b.id}`).toBeTypeOf('function'); if (b.kind === 'pipe') expect(b.from && b.to, `${sp.id} ${b.id}`).toBeTruthy(); }
  });
  it('the notebook build order of L23 / L25 / L26 ticks every line', () => {
    const cases: [string, Action[]][] = [
      ['L23', spiritsScript(L23_REF.T, L23_REF.time, wtToMole(0.924), L23_REF.rr, false)],
      ['L25', dcdaBuild()],
      ['L26', nitricScript(L26_REF.air, L26_REF.preheat, L26_REF.X, 0, false)],
    ];
    for (const [id, acts] of cases) {
      const e = mk(id);
      const half = Math.floor(acts.length / 2);
      run(e, acts.slice(0, half));
      const mid = lines(e);
      expect(mid.some((x) => x.done), id).toBe(true);
      expect(mid.some((x) => !x.done), id).toBe(true);
      run(e, acts.slice(half));
      const end = lines(e);
      expect(end.filter((x) => !x.done).map((x) => x.id), id).toEqual([]);
      expect(end.filter((x) => x.next).length, id).toBe(0);
    }
  });
  it('a pipe line names the live unit ids and the next line moves on', () => {
    const e = mk('L23');
    e.step({ name: 'placeUnit', args: ['fermenter', 6, 3, 0] } as any);
    const g = lines(e);
    expect(g.find((x) => x.id === 'fer').done).toBe(true);
    expect(g.find((x) => x.next).id).toBe('col');
    expect(g.find((x) => x.id === 'p_feed').text).toBe('Pipe F-101 OUT to R-102 IN'.replace('R-102', g.find((x) => x.id === 'p_feed').to.unit));
  });
});
