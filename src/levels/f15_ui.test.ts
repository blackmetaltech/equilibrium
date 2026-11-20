// F15 (round 7 UI findings, engine side): L00's "tap the converter" step is done by the card opening (markCoach), the heat ledger does not print the Call-it answer before
// the first commission, L03's test burns survive a Retry (carryBurns), a keyed call-it answer is accepted again after a restart.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import type { Action } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { fireBuild } from './l05';
import { en } from '../locales/en';

const mk = (id: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const run = (e: Env<EqState>, list: Action[]): void => { for (const a of list) e.step(a); };

describe('L00 coach: tapping the converter', () => {
  it('the step is open until the card opens, then the cooler step takes over', () => {
    const e = mk('L00');
    expect(info(e).coach.step).toBe(1);
    expect(info(e).coach.text).toContain('Tap the converter');
    e.step({ name: 'markCoach', args: ['tap_converter'] });
    expect(info(e).coach.step).toBe(2);
    expect(info(e).coach.text).toContain('TEMPERATURE dial');
    expect(info(e).coach.text).not.toContain('setpoint');
  });
});

describe('heat ledger and the Call it', () => {
  it('L05: the ledger is empty before the first commission while the call is open, and shows the plant once the call is in', () => {
    const e = mk('L05');
    run(e, fireBuild(860, 420, []));
    const open = e.engine.q('heatLedger') as any;
    expect(open.items).toEqual([]);
    expect(open.totalMW).toBe(0);
    e.step({ name: 'callIt', args: [8.2] });
    const shown = e.engine.q('heatLedger') as any;
    expect(shown.items.length).toBeGreaterThan(0);
    expect(shown.totalMW).toBeGreaterThan(8);
  });
  it('a level without a Call it keeps its ledger (L08 has none before commission, but no call either)', () => {
    const e = mk('L08');
    expect((e.engine.q('heatLedger') as any).items).toEqual([]);   // nothing built yet: empty for the usual reason
  });
});

describe('a keyed call-it is accepted again after a restart', () => {
  for (const [id, key] of [['L05', 'heat_mw'], ['L06', 'tad_c'], ['L07', 'coke_kmol_h']] as const) {
    it(`${id}: callIt(value, "${key}") answers the one call; a second is refused`, () => {
      const e = mk(id);
      expect(info(e).callIt.key).toBe(key);
      const r = e.step({ name: 'callIt', args: [1000, key] });
      expect((r as any).info.ok).toBe(true);
      expect(info(e).callIt.answered).toBe(true);
      expect(info(e).callIt.value).toBe(1000);
      const again = e.step({ name: 'callIt', args: [900, key] }) as any;
      expect(again.info.ok).toBe(false);
      expect(info(e).callIt.value).toBe(1000);
    });
  }
  it('predict(key, value) is read as the answer too (the front end falls back to it)', () => {
    const e = mk('L06');
    e.step({ name: 'predict', args: ['tad_c', 1111] });
    expect(info(e).callIt.answered).toBe(true);
    expect(info(e).callIt.value).toBe(1111);
  });
});

describe('L03 test burns across a Retry', () => {
  it('carryBurns hands the earlier burns to the fresh attempt once, before the first commission', () => {
    const e = mk('L03');
    expect(info(e).burns).toBe(0);
    expect((e.step({ name: 'carryBurns', args: [2] }) as any).info.ok).toBe(true);
    expect(info(e).burns).toBe(2);
    expect((e.step({ name: 'carryBurns', args: [1] }) as any).info.ok).toBe(false);
    expect(info(e).burns).toBe(2);
    expect((mk('L03').step({ name: 'carryBurns', args: [0] }) as any).info.ok).toBe(false);
  });
  it('other levels do not report burns', () => {
    expect(info(mk('L01')).burns).toBeUndefined();
  });
});

describe('F15 wording', () => {
  it('goal tolerances carry units', () => {
    expect(en['lv.L02.goal.so2']).toContain('percentage points');
    expect(en['lv.L07.goal.heat']).toContain('0.2 MW');
    expect(en['lv.L01.star.2']).toContain('3 mol of H₂');
  });
});
