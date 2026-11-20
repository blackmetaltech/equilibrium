// F9b L24: the notebook's start-up recipe, followed LITERALLY through the player's own controls, wins with no trip. The script below sends only what a player can do from the
// text: setpoint values in the dials' units (feed knob kmol/h, coolant °C), at the 1x speed (one tick = one shift second), and reacting to the reactor chart a human reaction
// time after it passes the stated temperature. No solver persona, no sub-second timing. Step 3 (ease the coolant and raise the feed) and step 4 (final coolant and feed) are each
// two edits; the test makes them in BOTH orders, with a gap of up to 8 wall s at 16x (128 plant s) between them and a hand up to 30 wall s (480 plant s) late.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { L24_GUIDE, L24_RECIPE as R, l24RunC } from './l24';
import { buildGuideOf } from './build_guide';
import { L24 } from './l24';

const K = 273.15;
const mk = (mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level: 'L24', mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const KMOL_H_TO_MOL_S = 1 / 3.6; // the faceplate converts the knob's kmol/h to SI exactly so
type Order = 'coolant' | 'feed';
interface Plan { first3: Order; late3: number; gap3: number; first4: Order; gap4: number; settle: number }

/** One player: commission with the notebook's interlock / orifice, then steps 2, 3 and 4 of the recipe. */
function follow(p: Plan, rows?: string[][]): { e: Env<EqState>; litAt: number; peak: number } {
  const e = mk();
  const act = (name: string, args: unknown[] = []): void => { e.step({ name, args } as any); };
  act('setParam', ['I-106', 'setpoint', 125 + K]); act('setParam', ['R-104', 'orifice', 'T']); act('commission'); act('startShift', ['shift']);
  const sh = (): any => e.state.shift!;
  act('setpoint', ['F-101', 'flow', R.feedKmolH * KMOL_H_TO_MOL_S]); act('setpoint', ['R-103', 'Tc', R.warmC + K]);
  const coolant = (c: number) => (): void => act('setpoint', ['R-103', 'Tc', c + K]);
  const feed = (f: number) => (): void => act('setpoint', ['F-101', 'flow', f * KMOL_H_TO_MOL_S]);
  const pair = (first: Order, c: () => void, f: () => void): [() => void, () => void] => (first === 'coolant' ? [c, f] : [f, c]);
  let litAt = -1, peak = 0, stage = 0, at = 0, seq: [() => void, () => void] = [() => undefined, () => undefined];
  const guide = (): string[] => buildGuideOf(e.state, L24)!.map((g) => (g.done ? '1' : '0'));
  while (e.state.status === 'playing') {
    const T = sh().dc['R-103'].T - K, t = sh().t; peak = Math.max(peak, T);
    if (litAt < 0 && T > R.coolAtC) litAt = t;
    if (litAt >= 0) {
      if (stage === 0 && t >= litAt + p.late3) { seq = pair(p.first3, coolant(R.easeC), feed(R.easeKmolH)); seq[0](); stage = 1; at = t; }
      else if (stage === 1 && t >= at + p.gap3) { seq[1](); stage = 2; at = t; }
      else if (stage === 2 && t >= at + p.settle) { seq = pair(p.first4, coolant(R.holdC), feed(R.fullKmolH)); seq[0](); stage = 3; at = t; }
      else if (stage === 3 && t >= at + p.gap4) { seq[1](); stage = 4; if (rows) rows.push(guide()); }
    }
    if (rows && t % 300 === 0) rows.push(guide());
    act('tick', [1]);
  }
  return { e, litAt, peak };
}
const WALL = 16; // the recipe runs at 16x: a human who needs w wall seconds loses 4 w plant seconds

describe('L24 recipe, literally', () => {
  it('F14: slow hands (each step minutes late) still win the safety goal with no trip (round 7: a literal, slow tester made 3.87 kmol)', () => {
    for (const p of [{ first3: 'feed', late3: 480, gap3: 120, first4: 'coolant', gap4: 300, settle: 600 }, { first3: 'coolant', late3: 300, gap3: 200, first4: 'feed', gap4: 400, settle: 900 }] as Plan[]) {
      const { e, peak } = follow(p);
      expect(e.state.status, JSON.stringify(p)).toBe('won');
      expect(peak).toBeLessThan(125);
    }
  });
  it('the notebook text carries the recipe numbers, in the dials units and with the speed, and is short', () => {
    const e = mk(), notes = (info(e).note as string[]);
    // F14: the notebook is the goal plus one paragraph of why; the numbers live in the checklist rows (buildGuide)
    const text = notes.join(' ') + ' ' + (info(e).buildGuide as { text: string }[]).map((r) => r.text).join(' ');
    for (const frag of [`${R.feedKmolH} kmol/h`, `${R.warmC} °C`, `${R.coolAtC} °C`, `${R.easeC} °C`, `${R.easeKmolH} kmol/h`, `${R.holdC} °C`, `${R.fullKmolH} kmol/h`, `${R.gapS} plant seconds`, `/ ${R.settleS} plant s`, 'opens at 16x', '260.6 kmol/h', 'Reset', '125 °C']) expect(text, frag).toContain(frag);
    expect(Math.round(260.57 * 0.7)).toBe(R.feedKmolH);
    expect(R.speed).toBe('16x');
    expect(notes.length).toBeLessThanOrEqual(3);
    expect(notes.join(' ').length).toBeLessThan(1700);
    const rows = (info(e).buildGuide as { id: string; text: string }[]).map((r) => r.id);
    expect(rows).toEqual(L24_GUIDE.map((g) => g.id));
    for (const r of info(e).buildGuide as { text: string }[]) expect(r.text).not.toMatch(/\{[a-zA-Z]+\}/);
  });
  // step 3: both orders x late x gap; step 4: both orders x gap, cycled across the runs (each run goes through the whole recipe, so step 4 is exercised in all of them)
  let i = 0;
  for (const first3 of ['coolant', 'feed'] as Order[]) for (const wall of [0, 15, 30]) for (const gapWall of [0, 4, 8]) {
    const k = i++, late3 = wall * WALL, gap3 = gapWall * WALL;
    const first4: Order = k % 2 === 0 ? 'coolant' : 'feed', gap4 = [0, 60, 120][k % 3]!;
    it(`wins with no trip: ${first3} first, ${wall} wall s late, ${gapWall} wall s between the two edits; step 4 ${first4} first, ${gap4} plant s apart`, () => {
      const { e, litAt, peak } = follow({ first3, late3, gap3, first4, gap4, settle: R.settleS });
      expect(litAt).toBeGreaterThan(0);
      expect(e.state.status).toBe('won');
      expect(e.state.shift!.stat.tripN).toBe(0);
      expect(e.state.shift!.stat.reliefN).toBe(0);
      expect(peak).toBeLessThanOrEqual(R.slowPeakC); // 5 K or more under the 125 C trip: ignition overshoot, the late hand and the transient between the two edits included
      expect(peak).toBeLessThanOrEqual(120);
      expect(e.state.shift!.dc['R-103']!.T - K).toBeGreaterThan(80); // still lit at the end
      expect(info(e).stars.have).toBeGreaterThanOrEqual(1);
    });
  }
  it('a hand 30 wall s (480 plant s) late and a gap of 240 plant s still wins', () => {
    const { e, peak } = follow({ first3: 'feed', late3: 480, gap3: 240, first4: 'coolant', gap4: 240, settle: 240 });
    expect(e.state.status).toBe('won'); expect(e.state.shift!.stat.tripN).toBe(0); expect(peak).toBeLessThanOrEqual(120);
  });
  it('the checklist ticks from the engine state: rows stay ticked once overtaken, in either order', () => {
    const rows: string[][] = [];
    const { e } = follow({ first3: 'feed', late3: 20, gap3: 30, first4: 'feed', gap4: 30, settle: R.settleS }, rows);
    expect(e.state.status).toBe('won');
    const last = rows[rows.length - 1]!;
    expect(last.join('')).toBe('1'.repeat(L24_GUIDE.length));
    expect(rows[0]!.join('')).toMatch(/^1+0+$/); // monotone: the first rows (set at commissioning) are done, the rest are not
    const lines = buildGuideOf(mk().state, L24)!;
    expect(lines.filter((l) => l.next).length).toBe(1);
  });
  it('one steady-state temperature: the notebook, the reactor and the Semenov plot agree with the engine', () => {
    const run = l24RunC(), notes = (info(mk()).note as string[]).join(' ');
    expect(notes).toContain(`${Math.round(run)} °C`);
    expect(notes).not.toMatch(/productive at about 11\d/);
    const e = mk(); const act = (name: string, args: unknown[] = []): void => { e.step({ name, args } as any); };
    act('commission'); act('startShift', ['shift']);
    act('setpoint', ['F-101', 'flow', R.feedKmolH * KMOL_H_TO_MOL_S]); act('setpoint', ['R-103', 'Tc', R.warmC + K]);
    let stage = 0, at = 0;
    while (e.state.status === 'playing' && e.state.shift!.t < 1500) {
      const T = e.state.shift!.dc['R-103']!.T - K, t = e.state.shift!.t;
      if (stage === 0 && T > R.coolAtC) { act('setpoint', ['R-103', 'Tc', R.easeC + K]); act('setpoint', ['F-101', 'flow', R.easeKmolH * KMOL_H_TO_MOL_S]); stage = 1; at = t; }
      if (stage === 1 && t >= at + R.settleS) { act('setpoint', ['R-103', 'Tc', R.holdC + K]); act('setpoint', ['F-101', 'flow', R.fullKmolH * KMOL_H_TO_MOL_S]); stage = 2; }
      act('tick', [1]);
    }
    const sem: any = e.engine.q('semenov', ['R-103']);
    const top = sem.states.filter((x: any) => x.stable).slice(-1)[0].T - K;
    expect(Math.abs(top - run)).toBeLessThan(0.5);
    expect(Math.abs(e.state.shift!.dc['R-103']!.T - K - run)).toBeLessThan(0.5);
  });
});
