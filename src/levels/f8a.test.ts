// F8a (round 4 play-test): L18 rig panel, L24 start-up recipe, L25 build walkthrough, L28 first knob, one pre-built-plant rule.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { fmtSci } from '../engine/solved';
import { SPEC_BY_ID } from './registry';
import type { EqState } from '../state';
import { l18KNeeded } from './l18';

const mk = (level: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>, id: string): any => e.engine.q('unitCard', [id]);
const view = (e: Env<EqState>): any => e.engine.q('levelView');
function play(e: Env<EqState>, persona: PersonaFactory<EqState>, ticks: number): Env<EqState> {
  const agent = persona(1003), rng = new Rng(1003);
  for (let t = 0; t < ticks && e.state.status === 'playing'; t++) {
    for (const a of agent(e.state, e.ctx(rng))) { e.step(a); if (e.state.status !== 'playing') break; }
    if (e.state.status === 'playing') e.step(TICK);
  }
  return e;
}

describe('fmtSci', () => {
  it('one notation, never a 0.001 mantissa', () => {
    expect(fmtSci(1e-6, 'global')).toBe('1 × 10⁻⁶');
    expect(fmtSci(1.15e-3, 'global')).toBe('1.15 × 10⁻³');
    expect(fmtSci(0.1, 'global')).toBe('1 × 10⁻¹');
    expect(fmtSci(2.744e-3, 'global')).toBe('2.74 × 10⁻³');
  });
});

describe('L18 rig panel', () => {
  it('every rig names its catalyst and k in one notation; the picker offers only the level catalysts', () => {
    const e = mk('L18');
    const rigs = view(e).rigs as any[];
    expect(rigs.map((r) => r.catalystId)).toEqual(['none', 'iodide', 'catalase']);
    const want = ['1 × 10⁻⁶ s⁻¹', '1 × 10⁻³ s⁻¹', '1 × 10⁻¹ s⁻¹'];
    rigs.forEach((r, i) => {
      const c = card(e, r.id);
      expect(c.rig.kTextNow).toBe(want[i]); expect(c.rig.kText25).toBe(want[i]); expect(c.rig.catalystId).toBe(r.catalystId);
      expect(c.rig.catalystName.length).toBeGreaterThan(0);
      expect(c.catalyst.options.map((o: any) => o.id)).toEqual(['none', 'iodide', 'catalase']);
      expect(c.catalyst.id).toBe(r.catalystId);
    });
    expect(rigs.map((r) => r.fastEnough)).toEqual([false, false, true]);
    expect(l18KNeeded()).toBeGreaterThan(2.6e-3); expect(l18KNeeded()).toBeLessThan(2.8e-3);
    const txt = JSON.stringify(rigs) + info(e).note.join(' ');
    expect(txt).not.toMatch(/0\.001 ×/);
    expect(info(e).note.join(' ')).toContain('2.7 × 10⁻³');
    expect(info(e).note.join(' ')).toMatch(/refund/);
  });
  it('the picker rejects industrial catalysts on a rig and accepts the level ones', () => {
    const e = mk('L18');
    const id = (view(e).rigs as any[])[0].id;
    expect((e.step({ name: 'setCatalyst', args: [id, 'v2o5'] }).info as any).ok).toBe(false);
    expect((e.step({ name: 'setCatalyst', args: [id, 'catalase'] }).info as any).ok).not.toBe(false);
    expect(card(e, id).rig.catalystId).toBe('catalase');
  });
  it('the printout of the no-catalyst rig quotes k in the one notation', () => {
    const e = play(mk('L18'), SPEC_BY_ID.L18!.naive, 5);
    const lesson = (e.engine.q('resultCard') as any).lesson as string;
    expect(lesson).toContain('1 × 10⁻⁶ s⁻¹'); expect(lesson).not.toMatch(/0\.001 ×/);
  });
});
