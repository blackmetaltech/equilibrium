import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { solveFlowsheet } from './index';
import { consistency, ctxOf, massImbalance, randomLoopSheet, registryFor } from './testunits';

describe('fuzz: 10 000 random loop flowsheets', () => {
  it('>= 99.5 % converge, every other case is diagnosed, <= 300 passes, balances close', () => {
    const rng = new Rng(20261110);
    const N = 10000;
    let converged = 0, maxPasses = 0, worstBal = 0, worstCons = 0, maxTears = 0;
    const codes: Record<string, number> = {};
    const times: number[] = [];
    for (let k = 0; k < N; k++) {
      const sh = randomLoopSheet(rng);
      const reg = registryFor(sh.species);
      const t0 = performance.now();
      const r = solveFlowsheet({ species: sh.species, units: sh.units, pipes: sh.pipes, registry: reg, ctx: ctxOf(sh.species) });
      times.push(performance.now() - t0);
      if (r.ok) {
        converged++;
        maxPasses = Math.max(maxPasses, r.value.passes);
        maxTears = Math.max(maxTears, r.value.tears.length);
        worstBal = Math.max(worstBal, massImbalance(sh.M, sh.units, sh.pipes, r.value.streams));
        if (k % 20 === 0) worstCons = Math.max(worstCons, consistency(sh, reg, r.value.streams));
      } else {
        codes[r.code] = (codes[r.code] ?? 0) + 1;
        expect(['ACCUMULATION', 'LOOP_GAIN_GE_1', 'LOOP_OSCILLATING', 'NO_EXIT']).toContain(r.code);
        expect(r.code).not.toBe('NUMERIC_GUARD');
        maxPasses = Math.max(maxPasses, Number(r.data.passes ?? 0));
      }
    }
    times.sort((a, b) => a - b);
    const p = (q: number) => times[Math.floor(q * (N - 1))]!;
    console.log(`fuzz: converged ${converged}/${N} (${(100 * converged / N).toFixed(2)} %), failures ${JSON.stringify(codes)}, ` +
      `max passes ${maxPasses}, max tears ${maxTears}, worst mass imbalance ${worstBal.toExponential(2)}, worst fixed-point dev ${worstCons.toExponential(2)}, ` +
      `solve ms p50 ${p(0.5).toFixed(3)} p95 ${p(0.95).toFixed(3)} p99 ${p(0.99).toFixed(3)} max ${times[N - 1]!.toFixed(2)}`);
    expect(converged / N).toBeGreaterThanOrEqual(0.995);
    expect(maxPasses).toBeLessThanOrEqual(300);
    expect(maxTears).toBeLessThanOrEqual(3);
    expect(worstBal).toBeLessThan(1e-9);
    expect(worstCons).toBeLessThan(1e-8);
    expect(p(0.95)).toBeLessThan(10);
  }, 300000);
});

describe('fuzz: hostile loop flowsheets (dead purges, gain > 1 units)', () => {
  it('every failure is diagnosed with a loop code, within the pass budget, never NUMERIC_GUARD', () => {
    const rng = new Rng(77);
    const N = 3000;
    const codes: Record<string, number> = {};
    let ok = 0;
    for (let k = 0; k < N; k++) {
      const sh = randomLoopSheet(rng, { hostile: true });
      const r = solveFlowsheet({ species: sh.species, units: sh.units, pipes: sh.pipes, registry: registryFor(sh.species), ctx: ctxOf(sh.species) });
      if (r.ok) { ok++; expect(r.value.passes).toBeLessThanOrEqual(300); continue; }
      codes[r.code] = (codes[r.code] ?? 0) + 1;
      expect(['ACCUMULATION', 'LOOP_GAIN_GE_1', 'LOOP_OSCILLATING', 'NO_EXIT']).toContain(r.code);
      expect(Number(r.data.passes ?? 0)).toBeLessThanOrEqual(300);
    }
    console.log(`hostile fuzz: converged ${ok}/${N}, failures ${JSON.stringify(codes)}`);
    expect(Object.keys(codes).length).toBeGreaterThanOrEqual(2);
  }, 300000);
});
