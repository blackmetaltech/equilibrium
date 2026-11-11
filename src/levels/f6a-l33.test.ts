// F6a L33: view.scenarios per scenario, teaching causes for each failure family, the trip at 75 + full coolant case.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';

function runDesign(d: number[]): Env<EqState> {
  const e = new Env(GAME); e.reset({ seed: 1003, level: 'L33', mode: 'learner' });
  ['sensors', 'k', 'tripC', 'action'].forEach((k, i) => e.step({ name: 'levelAct', args: ['setDial', k, d[i]] }));
  e.step({ name: 'commission' });
  return e;
}
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');

describe('L33 F6a', () => {
  it('view.scenarios: five named scenarios with sensors, votes, trip and an outcome', () => {
    const v = view(runDesign([3, 2, 89, 3]));
    expect(v.scenarios).toHaveLength(5);
    for (const sc of v.scenarios) {
      expect(sc.name.length).toBeGreaterThan(3); expect(sc.sensors).toHaveLength(3); expect(typeof sc.votes).toBe('number'); expect(typeof sc.tripped).toBe('boolean'); expect(sc.outcome.length).toBeGreaterThan(3);
      for (const x of sc.sensors) { expect(x.id).toMatch(/^S[1-3]$/); expect(Number.isFinite(x.reading)).toBe(true); expect(typeof x.failed).toBe('boolean'); }
    }
    const by = (id: string) => v.scenarios.find((x: any) => x.id === id);
    expect(by('loss').tripped).toBe(true); expect(by('loss').outcomeKey).toBe('caught');
    expect(by('loss_stuck_low').sensors.some((x: any) => x.failed)).toBe(true); expect(by('loss_stuck_low').outcomeKey).toBe('caught');
    expect(by('stuck_high').sensors.some((x: any) => x.failed && x.reading > 150)).toBe(true); expect(by('stuck_high').outcomeKey).toBe('ignored');
    expect(by('spikes').outcomeKey).toBe('ignored'); expect(by('cooling_upset').outcomeKey).toBe('ignored');
  });
  it('1oo1 and 2oo2 are blinded by a stuck sensor and the cause says why; 1oo2 trips on noise and the cause says why', () => {
    for (const d of [[1, 1, 89, 3], [2, 2, 89, 3]]) { const e = runDesign(d); const c = card(e); expect(c.verdictKey).toBe('miss_blind'); expect(c.cause).toMatch(/stuck low/); expect(c.cause).toMatch(/blinded|blocks the trip/); }
    const e = runDesign([2, 1, 89, 3]); const c = card(e); expect(['spurious_vote']).toContain(c.verdictKey); expect(c.cause).toMatch(/single stuck-high or spiking sensor/);
  });
  it('cut feed and full coolant fail when cooling is lost, with their reasons', () => {
    expect(card(runDesign([3, 2, 89, 1])).cause).toMatch(/still holds reactant/);
    expect(card(runDesign([3, 2, 89, 2])).cause).toMatch(/Full coolant does nothing when the cooling itself is lost/);
  });
  it('trip at 75 with full coolant: the trip fires in the loss-of-cooling scenario and the view says so (the chart marks the trip second)', () => {
    const e = runDesign([3, 2, 75, 2]); const v = view(e);
    expect(v.tripAt).toBeGreaterThan(0);
    const loss = v.scenarios.find((x: any) => x.id === 'loss');
    expect(loss.tripped).toBe(true); expect(loss.outcomeKey).toBe('missed');
  });
});
