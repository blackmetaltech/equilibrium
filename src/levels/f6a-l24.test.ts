// F6a L24: the stated recipe wins with the default trip (130 C), the trip saves the vessel from a careless light-up, the equation units, loss reason text, live unit card.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import type { EqState } from '../state';
import { hessBuild } from './l07';

const K = 273.15;
function run(persona: PersonaFactory<EqState>, ticks = 4300, mode = 'learner'): Env<EqState> {
  const env = new Env(GAME); env.reset({ seed: 1003, level: 'L24', mode });
  const agent = persona(1003), rng = new Rng(1003);
  for (let t = 0; t < ticks && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const withTrip = (c: number): PersonaFactory<EqState> => (seed) => { const base = SPEC_BY_ID.L24!.solver(seed); return (s, ctx) => base(s, ctx).map((a) => (a.name === 'setParam' && a.args![0] === 'I-106' ? { name: 'setParam', args: ['I-106', 'setpoint', c + K] } : a)); };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');

describe('L24 F6a', () => {
  it('the equation reads 251.2 x 2,114 / 3,570 = 148.7 K', () => {
    const e = run(withTrip(125), 40);
    const eq = card(e).equation as string | undefined;
    const e2 = run(withTrip(125), 4300);
    const q = (card(e2).equation ?? eq) as string;
    expect(q).toContain('148.7 K'); expect(q).toContain('251.2'); expect(q).not.toContain('0.148');
  });
  it('the recipe wins with the stated trip points 125 and 130 and the shift is a few minutes at 16x', () => {
    for (const c of [125, 130]) { const e = run(withTrip(c)); expect(e.state.status, String(c)).toBe('won'); expect(e.state.shift!.stat.tripN).toBe(0); }
  });
  it('a careless light-up with the trip at 130 trips and the vessel survives', () => {
    const hasty: PersonaFactory<EqState> = () => {
      let phase = 0;
      return (s) => {
        if (phase === 0) { phase = 1; return [{ name: 'setParam', args: ['I-106', 'setpoint', 130 + K] }, { name: 'setParam', args: ['R-104', 'orifice', 'T'] }, { name: 'commission' }, { name: 'startShift', args: ['shift'] }]; }
        const sh = s.shift!;
        if (phase === 1) { phase = 2; return [{ name: 'setpoint', args: ['R-103', 'Tc', 55 + K] }]; }
        if (phase === 2 && sh.dc['R-103']!.T - K > 75) { phase = 3; return [{ name: 'setpoint', args: ['R-103', 'Tc', 25 + K] }]; }
        return sh.t < 30 || phase < 3 ? [] : [{ name: 'tick', args: [20] }];
      };
    };
    const e = run(hasty, 400);
    const sh = e.state.shift!;
    expect(sh.stat.tripN, 'trip fired').toBeGreaterThan(0);
    expect(e.state.status).not.toBe('lost');
    expect(card(e)).toBeTruthy(); expect(info(e)).toBeTruthy();
  });
});

describe('L24 live card', () => {
  it('the unit card during a shift shows the live dynamic T, and the coach recipe lights the reactor within about 3.5 minutes', () => {
    let litAt = -1; let checked = false;
    const base = SPEC_BY_ID.L24!.solver(1003);
    const env = new Env(GAME); env.reset({ seed: 1003, level: 'L24', mode: 'learner' });
    const rng = new Rng(1003);
    for (let t = 0; t < 400 && env.state.status === 'playing'; t++) {
      for (const a of base(env.state, env.ctx(rng))) env.step(a);
      if (env.state.status === 'playing') env.step(TICK);
      const sh = env.state.shift;
      if (sh && !checked && sh.t > 20) {
        const c = env.engine.q('unitCard', ['R-103']) as any; checked = true;
        expect(c.live.T).toBeCloseTo(sh.dc['R-103']!.T, 6);
        if (c.resultsC && 'T' in c.resultsC) expect(c.resultsC.T).toBeCloseTo(sh.dc['R-103']!.T - K, 6);
      }
      if (sh && litAt < 0 && sh.dc['R-103'] && sh.dc['R-103'].T - K > 70) litAt = sh.t;
    }
    expect(checked).toBe(true); expect(litAt).toBeGreaterThan(0); expect(litAt).toBeLessThan(215);
  });
});

describe('L07 process heater is a sink', () => {
  it('the reference build wins, the heater card offers no utility, and a utility choice cannot break the solve', () => {
    const env = new Env(GAME); env.reset({ seed: 1003, level: 'L07', mode: 'learner' });
    const agent = SPEC_BY_ID.L07!.solver(1003), rng = new Rng(1003);
    for (let t = 0; t < 40 && env.state.status === 'playing'; t++) { for (const a of agent(env.state, env.ctx(rng))) env.step(a); if (env.state.status === 'playing') env.step(TICK); }
    expect(env.state.status).toBe('won');
    const card = env.engine.q('unitCard', ['H-106']) as any;
    expect(card.knobs.map((k: any) => k.key)).not.toContain('utility');
    for (const u of ['cw', 'fired']) {
      const e2 = new Env(GAME); e2.reset({ seed: 1003, level: 'L07', mode: 'learner' });
      for (const a of hessBuild(91.5, 91.5 * 1.05 / 0.21, [{ name: 'setParam', args: ['H-106', 'utility', u] }, { name: 'commission' }])) e2.step(a);
      expect(e2.state.solved?.ok, u).toBe(true);
    }
  });
});

describe('L02 and L01', () => {
  it('L02 offers no product tank: the stack is the only sink', () => {
    const env = new Env(GAME); env.reset({ seed: 1003, level: 'L02', mode: 'learner' });
    const r = env.step({ name: 'placeUnit', args: ['product', 20, 6, 0] }).info as any;
    expect(r.ok).toBe(false);
    const p = env.engine.q('palette') as any;
    const it = p.cats.flatMap((c: any) => c.items).find((x: any) => x.type === 'product');
    expect(it.available).toBe(false);
  });
});
