// F9b L24: the notebook's start-up recipe, followed LITERALLY through the player's own controls, wins with no trip. The script below sends only what a player can do from the
// text: setpoint values in the dials' units (feed knob kmol/h, coolant °C), at the 1x speed (one tick = one shift second), and reacting to the
// reactor chart a human reaction time after it passes the stated temperatures. No solver persona, no sub-second timing.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { L24_RECIPE as R, l24RunC } from './l24';

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
    if (litAt >= 0 && cooledAt < 0 && sh().t >= litAt + react) { act('setpoint', ['R-103', 'Tc', R.holdC + K]); act('setpoint', ['F-101', 'flow', R.fullKmolH * KMOL_H_TO_MOL_S]); cooledAt = sh().t; fed = true; }
    act('tick', [1]);
  }
  return { e, litAt, peak };
}

describe('L24 recipe, literally', () => {
  it('the notebook text carries the recipe numbers, in the dials units and with the speed', () => {
    const notes = (info(mk()).note as string[]).join(' ');
    for (const frag of [`${R.feedKmolH} kmol/h`, `${R.warmC} °C`, `${R.coolAtC} °C`, `${R.holdC} °C`, 'speed key to 16x', `within ${R.lateS} plant seconds`, `${R.fullKmolH} kmol/h`, `speed key on ${R.speed}`, '260.6 kmol/h', 'two and a half minutes', 'Reset', '125 °C', 'Step 1.', 'Step 5.']) expect(notes, frag).toContain(frag);
    expect(Math.round(260.57 * 0.7)).toBe(R.feedKmolH);
    expect(R.speed).toBe('4x');
  });
  // the recipe runs at 4x: a human who needs w wall seconds loses 4 w plant seconds, so wall delays 0-60 s are 0-240 plant seconds
  for (const wall of [0, 2, 5, 10, 15, 20, 30, 45, 60]) {
    const react = wall * 4;
    it(`wins with no trip when the player clicks ${wall} wall s (${react} plant s at 4x) after the chart passes ${R.coolAtC} °C`, () => {
      const { e, litAt, peak } = follow(react);
      expect(litAt).toBeGreaterThan(0);
      expect(e.state.status).toBe('won');
      expect(e.state.shift!.stat.tripN).toBe(0);
      expect(peak).toBeLessThanOrEqual(R.slowPeakC); // 5 K or more under the 125 C trip: ignition overshoot, a hand up to 60 wall s late and the late feed surge included
      expect(peak).toBeLessThanOrEqual(120);
      expect(info(e).stars.have).toBeGreaterThanOrEqual(1);
    });
  }
  it('one steady-state temperature: the notebook, the reactor and the Semenov plot agree with the engine', () => {
    const run = l24RunC(), notes = (info(mk()).note as string[]).join(' ');
    expect(notes).toContain(`${Math.round(run)} °C`);
    expect(notes).not.toMatch(/productive at about 11\d/);
    const e = mk(); const act = (name: string, args: unknown[] = []): void => { e.step({ name, args } as any); };
    act('commission'); act('startShift', ['shift']);
    act('setpoint', ['F-101', 'flow', R.feedKmolH * KMOL_H_TO_MOL_S]); act('setpoint', ['R-103', 'Tc', R.warmC + K]);
    let cooled = false, fed = false;
    while (e.state.status === 'playing' && e.state.shift!.t < 1500) {
      const T = e.state.shift!.dc['R-103']!.T - K;
      if (!cooled && T > R.coolAtC) { act('setpoint', ['R-103', 'Tc', R.holdC + K]); act('setpoint', ['F-101', 'flow', R.fullKmolH * KMOL_H_TO_MOL_S]); cooled = true; fed = true; }
      act('tick', [1]);
    }
    const sem: any = e.engine.q('semenov', ['R-103']);
    const top = sem.states.filter((x: any) => x.stable).slice(-1)[0].T - K;
    expect(Math.abs(top - run)).toBeLessThan(0.5);
    expect(Math.abs(e.state.shift!.dc['R-103']!.T - K - run)).toBeLessThan(0.5);
  });
});
