import { describe, expect, it } from 'vitest';
import { classifyLoop } from './diagnose';

const geo = (r: number, k: number) => { let x = 1; for (let i = 0; i < k; i++) x *= r; return x; };
const seqOf = (L: number, f: (k: number) => number[]) => Array.from({ length: L }, (_, k) => f(k));

describe('classifyLoop', () => {
  it('geometric build-up of one species is ACCUMULATION with the extrapolated steady state', () => {
    const s = seqOf(14, (k) => [5 * (1 - geo(0.9, k)), 5, 1]); // ar-like species approaches 5; others constant
    const r = classifyLoop(['X', 'Y', 'Z'], s);
    expect(r.code).toBe('ACCUMULATION');
    expect(r.species).toBe('X');
    expect(Math.abs(Number(r.data.gain) - 0.9)).toBeLessThan(1e-6);
    expect(Math.abs(Number(r.data.extrapolated) - 5 / 11)).toBeLessThan(1e-6);
    expect(Math.abs(Number(r.data.inventory) - 5)).toBeLessThan(1e-6);
  });
  it('linear growth of everything is LOOP_GAIN_GE_1', () => {
    expect(classifyLoop(['X', 'Y'], seqOf(14, (k) => [1 + 2 * k, 1 + 0.5 * k])).code).toBe('LOOP_GAIN_GE_1');
    expect(classifyLoop(['X', 'Y'], seqOf(14, (k) => [geo(1.5, k), 2 * geo(1.5, k)])).code).toBe('LOOP_GAIN_GE_1');
  });
  it('linear growth of one species among settled ones is ACCUMULATION with gain ~ 1', () => {
    const r = classifyLoop(['X', 'Y'], seqOf(14, (k) => [1 + 0.1 * k, 4]));
    expect(r.code).toBe('ACCUMULATION');
    expect(r.species).toBe('X');
    expect(Number(r.data.gain)).toBeGreaterThan(0.99);
  });
  it('alternating iterates are LOOP_OSCILLATING', () => {
    expect(classifyLoop(['X', 'Y'], seqOf(14, (k) => [k % 2 ? 5 : 0.5, 1])).code).toBe('LOOP_OSCILLATING');
    expect(classifyLoop(['X'], seqOf(14, (k) => [3 + (k % 2 ? 1 : -1) * 0.9])).code).toBe('LOOP_OSCILLATING');
  });
  it('always returns one of the three codes, even for noise or short histories', () => {
    expect(['ACCUMULATION', 'LOOP_GAIN_GE_1', 'LOOP_OSCILLATING']).toContain(classifyLoop(['X'], [[1], [1]]).code);
    expect(['ACCUMULATION', 'LOOP_GAIN_GE_1', 'LOOP_OSCILLATING']).toContain(classifyLoop(['X', 'Y'], seqOf(12, () => [2, 3])).code);
  });
});
