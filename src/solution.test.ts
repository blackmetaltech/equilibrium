// Solution codes on our state shape: a solver run becomes a code; the verifier replays it to the same score; cheats do not verify.
// The game ships no levels in M0.2, so the codes here come from a TEST-LOCAL GameDef with one made-up level (same machinery as game.test.ts).
import { describe, expect, it } from 'vitest';
import { Engine, Env, decodeSolution, encodeSolution, fail, makeVerifier, need, type GameDef, type Level } from '@core/kit';
import { GAME } from './game';
import { verify as realVerify } from './verify';
import type { EqState } from './state';

const WIDGETS = ['a', 'b', 'c', 'd'];
const testLevel: Level<EqState> = {
  id: 'T1', title: 'Test level', brief: 'Pin three widgets.',
  setup: () => {},
  goal: (s) => s.ui.pinned.length >= 3,
  fail: (s) => (s.ui.coachStep === 'trap' ? 'Trap sprung.' : null),
  maxTicks: 40,
  solver: () => (s) => { const w = WIDGETS.find((x) => !s.ui.pinned.includes(x)); return w ? [{ name: 'testPin', args: [w] }] : []; },
};
const TEST: GameDef<EqState> = {
  ...GAME, levels: [testLevel],
  actions: {
    testPin: (s, w: unknown) => { need(typeof w === 'string' && WIDGETS.includes(w), 'Unknown widget.'); if (s.ui.pinned.includes(w as string)) fail('Already pinned.'); s.ui.pinned.push(w as string); },
  },
  metrics: (s) => ({ pinned: s.ui.pinned.length, ticks: s.tick - s.levelStart }),
};
const verify = makeVerifier(TEST);

function solverRun(region?: string): Engine<any> {
  const env = new Env(TEST); env.reset({ seed: 1, level: 'T1', region });
  const agent = testLevel.solver!(1);
  for (let i = 0; i < 40 && env.state.status === 'playing'; i++) {
    for (const a of agent(env.state, env.ctx({} as any))) env.step(a);
    if (env.state.status === 'playing') env.step({ name: 'tick' });
  }
  return env.engine;
}

describe('solution codes', () => {
  it('free play has no code', () => expect(new Engine(GAME).q('solutionCode')).toBeNull());
  it('the solver run verifies, with the metrics the game computes', () => {
    const e = solverRun(); expect(e.state.status).toBe('won');
    const code = e.q('solutionCode') as string;
    const r = verify('T1', code);
    expect(r.ok).toBe(true); expect(r.reason).toBe('won'); expect(r.ruleset).toBe('equilibrium:global@1.1');
    expect(r.ticks).toBe(e.state.tick - e.state.levelStart);
    expect(r.metrics).toEqual({ pinned: 3, ticks: r.ticks });
    expect(verify('T1', code)).toEqual(r);                          // same code, same result
    expect(verify('T1', code, { region: 'global' }).ok).toBe(true);
  });
  it('the same moves give the same code (determinism)', () => expect(solverRun().q('solutionCode')).toBe(solverRun().q('solutionCode')));
  it('a tampered code fails the checksum', () => {
    const code = solverRun().q('solutionCode') as string;
    const parts = code.split('.'); parts[1] = parts[1]!.slice(0, 10) + (parts[1]![10] === 'A' ? 'B' : 'A') + parts[1]!.slice(11);
    const r = verify('T1', parts.join('.')); expect(r.ok).toBe(false); expect(r.reason).toMatch(/checksum/);
  });
  it('a re-encoded edit (valid checksum) is replayed, not trusted: a shorter cheat does not win', () => {
    const d = decodeSolution(solverRun().q('solutionCode') as string) as any;
    const r = verify('T1', encodeSolution({ ...d, actions: d.actions.slice(0, 2) })); expect(r.ok).toBe(false); expect(r.reason).toMatch(/not won/);
    const wrong = encodeSolution({ ...d, actions: [['testPin', ['zzz']], ...d.actions] });
    expect(verify('T1', wrong).reason).toMatch(/Action 1 \(testPin\) rejected: Unknown widget/);
  });
  it('a code from the draft in region is not ok on the global board, but verifies in its own region', () => {
    const code = solverRun('in').q('solutionCode') as string;
    expect((decodeSolution(code) as any).ruleset).toBe('equilibrium:in@1.1');
    const g = verify('T1', code, { region: 'global' }); expect(g.ok).toBe(false); expect(g.reason).toMatch(/Region mismatch/);
    const own = verify('T1', code); expect(own.ok).toBe(true); expect(own.ruleset).toBe('equilibrium:in@1.1');
  });
  it('a code from another ruleset version is a clean not-ok', () => {
    const d = decodeSolution(solverRun().q('solutionCode') as string) as any;
    for (const old of ['equilibrium:global@1.0', 'equilibrium:global@2.1', 'equilibrium:global@1']) {
      const r = verify('T1', encodeSolution({ ...d, ruleset: old })); expect(r.ok, old).toBe(false); expect(r.reason, old).toMatch(/Ruleset mismatch/);
    }
  });
  it('an idle run produces a code that does not verify', () => {
    const env = new Env(TEST); env.reset({ seed: 1, level: 'T1' }); for (let i = 0; i < 60 && env.state.status === 'playing'; i++) env.step({ name: 'tick' });
    const code = env.engine.q('solutionCode') as string; expect(code).toMatch(/^CB1\./);
    const r = verify('T1', code); expect(r.ok).toBe(false); expect(r.reason).toMatch(/not won/);
  });
  it('wrong level / junk input never throw, for the test game and for the real verifier', () => {
    const code = solverRun().q('solutionCode') as string;
    expect(verify('nope', code).ok).toBe(false); expect(realVerify('T1', code).ok).toBe(false);
    for (const junk of ['', 'x', 'CB1.a.b', code.slice(0, 20), '{}']) { expect(verify('T1', junk).ok).toBe(false); expect(realVerify('L01', junk).ok).toBe(false); }
  });
});
