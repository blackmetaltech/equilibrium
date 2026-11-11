// F6a: honest annunciators and level readouts at the solver's design for every level; readouts in the unit they are labelled with.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { SPECS, SPEC_BY_ID } from './registry';
import { l17Player } from './l17';

function atSolver(id: string): Env<any> {
  const sp = SPEC_BY_ID[id]!;
  const env = new Env(GAME); env.reset({ seed: 1003, level: id, mode: 'learner' });
  const agent = sp.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < (id === 'L24' ? 300 : id === 'L00' ? 100 : 40) && env.state.status === 'playing'; t++) { for (const a of agent(env.state, env.ctx(rng))) env.step(a); if (env.state.status === 'playing') env.step(TICK); }
  return env;
}
const RANGE: Record<string, [number, number]> = { bar: [0.001, 1000], 'bar(a)': [0.001, 1000], '°C': [-200, 2500], K: [0, 3500], kW: [0, 1e6], MW: [0, 1000] };
const known = (u: string, x: number, what: string): void => { const r = RANGE[u]; if (r) expect(x >= r[0] && x <= r[1], `${what}: ${x} ${u}`).toBe(true); };

describe('F6a every level at the solver design', () => {
  for (const sp of SPECS) {
    it(`${sp.id}: lit lamps are alarms (or the GOAL window), hero/secondary/metrics/call-it values are in their labelled unit range`, () => {
      const e = atSolver(sp.id);
      const i: any = e.engine.q('levelInfo');
      for (const a of i.annunciators) {
        expect(typeof a.lit, `${sp.id} ${a.key}`).toBe('boolean');
        expect(a.lit, `${sp.id} ${a.key} ${a.state}`).toBe(a.state === 'high' || a.state === 'critical' || (a.state === 'normal' && a.key === 'goal'));
      }
      known(i.hero.unit, i.hero.value, `${sp.id} hero`);
      if (i.secondary) known(i.secondary.unit, i.secondary.value, `${sp.id} secondary`);
      const c: any = e.engine.q('resultCard');
      for (const m of c?.metrics ?? []) known(m.unit, m.value, `${sp.id} metric ${m.key}`);
    });
  }
  it('L12: no compressor in the plant means the COMPRESSOR ON window is dark', () => {
    const i: any = atSolver('L12').engine.q('levelInfo');
    const comp = i.annunciators.find((a: any) => a.key === 'comp');
    expect(comp.state).toBe('off'); expect(comp.lit).toBe(false);
  });
  it('L17: BED ASLEEP and BELOW LIGHTOFF are not lit at a converting design (Cs catalyst at 375 C, about 77 %)', () => {
    const env = new Env(GAME); env.reset({ seed: 1003, level: 'L17', mode: 'learner' });
    const agent = l17Player(375, 'v2o5_cs')(1003), rng = new Rng(1003);
    for (let t = 0; t < 6; t++) { for (const a of agent(env.state, env.ctx(rng))) env.step(a); env.step(TICK); }
    const i: any = env.engine.q('levelInfo');
    const conv = i.goals.find((g: any) => g.key === 'conv').value;
    expect(conv).toBeGreaterThan(70);
    for (const k of ['asleep', 'light']) expect(i.annunciators.find((a: any) => a.key === k).lit, k).toBe(false);
  });
  it('a call-it level says predict before the first commission; others do not carry a predict note', () => {
    const e = new Env(GAME); e.reset({ seed: 1003, level: 'L07', mode: 'learner' });
    const i: any = e.engine.q('levelInfo');
    expect(i.note.join(' ')).toMatch(/predict before your first commission/); expect(i.predictNote).toMatch(/predict before your first commission/);
  });
  it('L29 and L35 end on the same phase (report) so every control level shows its printout', () => {
    for (const id of ['L29', 'L33', 'L35']) { const e = atSolver(id); expect(e.state.status).toBe('won'); expect(e.state.phase, id).toBe('report'); expect(e.engine.q('resultCard')).not.toBeNull(); }
  });
});
