// F6a: every knob of every unit type reports its numbers in the unit it displays (the round-3 "2,500,000 bar(a)" regression).
import { describe, expect, it } from 'vitest';
import { UNIT_TYPES, metaOf } from './registry';
import { DISPLAY_PAIRS } from '../sim/si';
import { must, newEngine } from './test-helpers';

const PASS = new Set(['', 'm²', 'kg', 's', 'W/(K kg)', 'K', 'mol%']);
describe('F6a unit sweep: displayed value is in the displayed unit', () => {
  it('every num knob: SI value + convertible unit, disp in the label unit and physically plausible', () => {
    let seen = 0, pressures = 0, temps = 0;
    for (const type of UNIT_TYPES) {
      const e = newEngine(); const r = must(e, 'placeUnit', type, 4, 4, 0); const id = r.id as string;
      const card = e.q('unitCard', [id]) as any;
      for (const k of card.knobs.filter((x: any) => x.kind === 'num')) {
        seen++;
        const pair = DISPLAY_PAIRS[k.unit];
        expect(pair !== undefined || PASS.has(k.unit), `${type}.${k.key} unit ${k.unit}`).toBe(true);
        expect(k.disp, `${type}.${k.key} disp`).toBeDefined();
        const d = k.disp; const conv = pair ? pair.fromSI : (x: number) => x;
        expect(d.value).toBeCloseTo(conv(k.value), 9); expect(d.min).toBeCloseTo(conv(k.min), 9); expect(d.max).toBeCloseTo(conv(k.max), 9);
        const label = k.unitLabel ?? k.unit;
        if (label === 'bar(a)' || label === 'bar') {
          pressures++;
          if (label === 'bar(a)') { expect(d.min === 0 || d.min >= 0.01).toBe(true); expect(d.max).toBeLessThanOrEqual(1000); expect(d.value).toBeLessThanOrEqual(1000); }
          else expect(d.max).toBeLessThanOrEqual(1000);
        }
        if (label === 'degC') { temps++; expect(d.min).toBeGreaterThanOrEqual(-200); expect(d.max).toBeLessThanOrEqual(1500); expect(d.value).toBeGreaterThanOrEqual(-200); expect(d.value).toBeLessThanOrEqual(1500); }
      }
    }
    expect(seen).toBeGreaterThan(30); expect(pressures).toBeGreaterThan(6); expect(temps).toBeGreaterThan(8);
  });
  it('compressor 25 bar reads 25 bar(a), not 2,500,000', () => {
    const e = newEngine(); const id = must(e, 'placeUnit', 'compressor', 4, 4, 0).id as string; must(e, 'setParam', id, 'P', 2.5e6);
    const k = (e.q('unitCard', [id]) as any).knobs.find((x: any) => x.key === 'P');
    expect(k.disp.value).toBeCloseTo(25, 9); expect(k.disp.unit).toBe('bar(a)'); expect(metaOf('relief').knobs[0]!.unit).toBe('bar');
  });
});
