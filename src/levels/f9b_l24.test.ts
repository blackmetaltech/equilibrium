// F9b L24: the notebook's start-up recipe, followed LITERALLY through the player's own controls, wins with no trip. The script below sends only what a player can do from the
// text: setpoint values in the dials' units (feed knob kmol/h, coolant °C), at the 1x speed (one tick = one shift second), and reacting to the
// reactor chart a human reaction time after it passes the stated temperatures. No solver persona, no sub-second timing.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { L24_RECIPE as R } from './l24';

const K = 273.15;
const mk = (mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level: 'L24', mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const KMOL_H_TO_MOL_S = 1 / 3.6; // the faceplate converts the knob's kmol/h to SI exactly so

/** One player: commission with the notebook's interlock / orifice, then step 2, 3 and 4 of the recipe. `react` = shift seconds between seeing the chart pass 85 °C and clicking (step 4 is clicked as soon as the chart passes 100 °C). */
function follow(react: number): { e: Env<EqState>; litAt: number; peak: number } {
  const e = mk();
  const act = (name: string, args: unknown[] = []): void => { e.step({ name, args } as any); };
  act('setParam', ['I-106', 'setpoint', 125 + K]); act('setParam', ['R-104', 'orifice', 'T']); act('commission'); act('startShift', ['shift']);
  const sh = (): any => e.state.shift!;
  act('setpoint', ['F-101', 'flow', R.feedKmolH * KMOL_H_TO_MOL_S]); act('setpoint', ['R-103', 'Tc', R.warmC + K]);
  let litAt = -1, cooledAt = -1, fed = false, peak = 0;
  while (e.state.status === 'playing') {
    const T = sh().dc['R-103'].T - K; peak = Math.max(peak, T);
    if (litAt < 0 && T > R.coolAtC) litAt = sh().t;
    if (litAt >= 0 && cooledAt < 0 && sh().t >= litAt + react) { act('setpoint', ['R-103', 'Tc', R.holdC + K]); cooledAt = sh().t; }
    if (cooledAt >= 0 && !fed && T > R.feedAtC) { act('setpoint', ['F-101', 'flow', R.fullKmolH * KMOL_H_TO_MOL_S]); fed = true; }
    act('tick', [1]);
  }
  return { e, litAt, peak };
}

describe('L24 recipe, literally', () => {
  it('the notebook text carries the recipe numbers, in the dials units and with the speed', () => {
    const notes = (info(mk()).note as string[]).join(' ');
    for (const frag of [`${R.feedKmolH} kmol/h`, `${R.warmC} °C`, `${R.coolAtC} °C`, `${R.holdC} °C`, `${R.feedAtC} °C`, 'speed key to 16x', 'within 15 seconds', `${R.fullKmolH} kmol/h`, `speed key on ${R.speed}`, '260.6 kmol/h', 'about three minutes', 'Reset', '125 °C']) expect(notes, frag).toContain(frag);
    expect(Math.round(260.57 * 0.7)).toBe(R.feedKmolH);
    // after step 4 the script sends no further action, so the remaining ~3000 s run at 16x: wall clock about (3600 - 500) / 16 s
    expect((3600 - 500) / 16 / 60).toBeLessThan(4);
  });
  for (const react of [0, 5, 10, 15]) {
    it(`wins with no trip when the player clicks ${react} s after the chart passes ${R.coolAtC} °C`, () => {
      const { e, litAt, peak } = follow(react);
      expect(litAt).toBeGreaterThan(0);
      expect(e.state.status).toBe('won');
      expect(e.state.shift!.stat.tripN).toBe(0);
      expect(peak).toBeLessThanOrEqual(120); // 5 K or more under the 125 C trip: ignition overshoot and the late feed surge included
      expect(info(e).stars.have).toBeGreaterThanOrEqual(1);
    });
  }
});
