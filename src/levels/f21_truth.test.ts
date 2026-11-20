// F21 (round 8, truth): the coach and the boards say what is true now. L00 goal unit and clock, L03 burns count, L04 key step before the printout,
// L06 slip peak, L09 early goal text and one-precision equation.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { t } from '../i18n';
import { benchBuild } from './bench';
import { fuelBuild } from './l03';

const mk = (id: string, seed = 1003): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: id, mode: 'learner' }); return e; };
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args } as any).info as { ok: boolean; message: string };
const li = (e: Env<EqState>): any => e.engine.q('levelInfo');

describe('F21 L00', () => {
  it('the goal carries its unit (s) and the shift clock counts to the night end, not the 600 s timer', () => {
    const e = mk('L00');
    const g = li(e).goals[0];
    expect(g.unit).toBe('s');
    expect(li(e).shiftClock.total).toBeLessThanOrEqual(95);
  });
  it('inlet_down is done the moment the cooler dial is changed, however little', () => {
    const e = mk('L00');
    for (let i = 0; i < 25; i++) act(e, 'tick', 1);
    act(e, 'markCoach', 'tap_converter');
    expect(li(e).coach?.text ?? '').toMatch(/TEMPERATURE dial/);
    const cool = e.state.flowsheet.units.find((u) => u.type === 'cooler')!;
    act(e, 'setpoint', cool.id, 'T', (cool.params.T as number) - 5);
    expect(li(e).coach).toBeNull();
  });
});

describe('F21 L03', () => {
  it('a test burn already made (carried over a Retry) is never asked for again', () => {
    const e = mk('L03');
    for (const a of fuelBuild(400, [])) e.step(a);
    act(e, 'carryBurns', 2);
    expect(li(e).coach?.text ?? '').not.toMatch(/test burn/i);
  });
  it('a lateOk call does not hold the first commission (the console checks callIt.late)', () => {
    expect(li(mk('L03')).callIt.late).toBe(true);
  });
});

describe('F21 L04', () => {
  it('after the call the coach says turn the key, and read-the-printout comes only once the bench has run', () => {
    const e = mk('L04');
    expect(li(e).coach.text).toMatch(/Call it first/);
    act(e, 'callIt', 30, 'N2');
    expect(li(e).coach.text).toMatch(/commission the bench/i);
    expect(li(e).coach.text).not.toMatch(/printout/i);
  });
});

describe('F21 L06 slip', () => {
  it('the temperature metric is the peak and says so', () => {
    expect(t('lv.L06.metric.burner_c')).toMatch(/peak/i);
    expect(t('lv.L06.metric.burner_so2')).toMatch(/shift end/i);
  });
});

describe('F21 L09', () => {
  it('a prediction typed before the run says the target comes after the run', () => {
    const e = mk('L09');
    act(e, 'callIt', 885.3);
    const g = li(e).goals.find((x: any) => x.key === 'du');
    expect(g.text).toMatch(/after the run/);
    expect(g.text).toMatch(/885\.3/);
    expect(g.text).not.toMatch(/: - /);
  });
  it('the equation prints all three heat numbers at two decimals and they add up', () => {
    const e = mk('L09');
    act(e, 'callIt', 885.3); act(e, 'commission');
    for (let i = 0; i < 400 && e.state.status === 'playing'; i++) act(e, 'tick', 1);
    const eq = String((e.engine.q('resultCard') as any).equation);
    const m = eq.match(/(\d+\.\d{2}) − (\d+\.\d{2}) = (\d+\.\d{2})/);
    expect(m, eq).not.toBeNull();
    expect(Math.abs(Number(m![1]) - Number(m![2]) - Number(m![3]))).toBeLessThan(0.0101);
  });
});
void benchBuild;
