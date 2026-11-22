import { it, expect } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { catalystLit } from './l00';
it('L00 (Mateo, phase B): a set point below light-off loses the catalyst star even when turned back', () => {
  const e = new Env(GAME); e.reset({ seed: 1003, level: 'L00', mode: 'learner' } as any);
  const cool = e.state.flowsheet.units.find((u) => u.type === 'cooler')!;
  e.step({ name: 'setpoint', args: [cool.id, 'T', 600] } as any); e.step({ name: 'setpoint', args: [cool.id, 'T', 660] } as any);
  for (let t = 0; t < 30; t++) e.step({ name: 'tick', args: [1] } as any);
  expect(catalystLit(e.state)).toBe(false);
});
