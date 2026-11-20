// The "given" lines are only honest if a student can reach the graded number from them. Each case does the hand calculation the line describes (plain arithmetic, no engine
// call for the answer) and checks it lands inside the level's tolerance of the engine truth.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import type { EqState } from '../state';
import { l24AtFeed } from './l24';

const within = (hand: number, truth: number, tol: number, what: string): void => { expect(Math.abs(hand - truth) / Math.abs(truth), `${what}: hand ${hand} vs ${truth}`).toBeLessThanOrEqual(tol); };
function solved(id: string): { s: EqState; truth: number } {
  const spec = SPEC_BY_ID[id]!, env = new Env(GAME); env.reset({ seed: 1003, level: id, mode: 'learner' });
  const agent = spec.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < 40 && env.state.status === 'playing'; t++) { for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; } if (env.state.status === 'playing') env.step(TICK); }
  const s = env.state as EqState;
  return { s, truth: spec.callIt!.truth(s, spec.measures(s))! };
}
const tolOf = (id: string): number => SPEC_BY_ID[id]!.callIt!.tol;

describe('Call-it by hand', () => {
  it('L06: adiabatic flame from the given heat capacities', () => {
    const q = 100 * 296.84 + 100 * 5.1, cp = 100 * 50.4 + 110 * 33.0 + 790 * 31.2;
    within(25 + (q / cp) * 1000, SPEC_BY_ID.L06!.callIt!.truth({} as EqState, {} as never)!, tolOf('L06'), 'L06');
  });
  it('L19: recycle from the 20.9 mol % exit gas', () => {
    const y = 0.209, x = (4 * y) / (2 + 2 * y);   // 2x / (4 - 2x) = y
    within(1000 / x - 1000, solved('L19').truth, tolOf('L19'), 'L19');
  });
  it('L21: Raoult with the printed fit at the chiller temperature', () => {
    const { s, truth } = solved('L21'); void s;
    const T = 273.15 - 20, y = (Math.exp(11.787 - 2823.4 / T) / 147) * 100;
    within(y, truth, tolOf('L21'), 'L21');
  });
  it('L24: tangent (ignition) from the printed Fogler constants, full charge and the 70 % check', () => {
    const ign = (frac: number): number => {
      const k = (T: number): number => (16.96e12 / 3600) * Math.exp(-75360 / (8.314 * T)), Q = 5 / 3600, tau = 0.1 / Q, UA = 10e6 / 3600;
      const tc = (T: number): number => { const X = (k(T) * tau) / (1 + k(T) * tau); return T - (251200 * 2114 * frac * X * Q - Q * 3.57e6 * (T - 298.15)) / UA; };
      let best = -1e9; for (let T = 298.15; T < 420; T += 0.005) { const v = tc(T); if (v < best) break; best = v; }
      return best - 273.15;
    };
    within(ign(1), l24AtFeed(1).ignitionC, 0.02, 'L24 full');
    within(ign(182.4 / 260.6), 61.4, 0.005, 'L24 starved check');
  });
  it('L25: kg SO2 per tonne of acid', () => {
    within((0.003 * 64.06) / (0.997 * 98.08) * 1000, SPEC_BY_ID.L25!.callIt!.truth({} as EqState, {} as never)!, tolOf('L25'), 'L25');
  });
  it('L26: gauze exit from the printed heats and heat capacity', () => {
    const { s, truth } = solved('L26'); void s;
    const q = 0.1 * (0.96 * (905.2 / 4) + 0.04 * (1267.2 / 4)) * 1000;   // J per mol of gas
    within(178.44 + q / 33.7, truth, tolOf('L26'), 'L26');
  });
  it('L27: API 520 area from the printed formula', () => {
    const k = 1.3, C = 0.03948 * Math.sqrt(k * Math.pow(2 / (k + 1), (k + 1) / (k - 1))), P1 = 3101.325 + 0.1 * 3000;
    within((20000 / (C * 0.975 * P1)) * Math.sqrt(313 / 16.04), SPEC_BY_ID.L27!.callIt!.truth({} as EqState, {} as never)!, tolOf('L27'), 'L27');
  });
  it('L28: the printed conversion table, read at the solver exit temperature', () => {
    const { truth } = solved('L28');
    within(77.2 + ((85.1 - 77.2) * 20) / 40, truth, tolOf('L28'), 'L28');
  });
  it('L23: literature azeotrope converted to mass %', () => {
    const w = (89.4 * 46.07) / (89.4 * 46.07 + 10.6 * 18.02) * 100;
    within(w, SPEC_BY_ID.L23!.callIt!.truth({} as EqState, {} as never)!, tolOf('L23'), 'L23');
  });
  it('L09: ΔU of the bomb and of vaporisation from the printed constants', () => {
    const calls = SPEC_BY_ID.L09!.callIts!;
    within(890.3 - 2 * 8.314 * 298 / 1000, calls[0]!.truth({} as EqState, {} as never)!, calls[0]!.tol, 'L09 bomb');
    within(40.79 - 8.314 * 373 / 1000, calls[2]!.truth({} as EqState, {} as never)!, calls[2]!.tol, 'L09 vap');
  });
});
