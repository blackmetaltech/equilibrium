import { describe, expect, it } from 'vitest';
import { BENCHMARKS, BENCH_KEYS, benchmark } from './benchmarks';
import type { Conf } from '../sim/types';

const CONFS: Conf[] = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'];
describe('benchmarks', () => {
  it('every row has src, unit, a finite value and a valid conf', () => {
    for (const k of BENCH_KEYS) {
      const b = BENCHMARKS[k]!;
      expect(b.src.trim().length, k).toBeGreaterThan(0); expect(b.unit.length, k).toBeGreaterThan(0);
      expect(Number.isFinite(b.value), k).toBe(true); expect(CONFS, k).toContain(b.conf);
    }
  });
  it('DESIGN §4.8 values', () => {
    expect(benchmark('nh3_bat_gj_t')).toBe(28); expect(benchmark('nh3_bat_co2_t_t')).toBe(1.6); expect(benchmark('nh3_survey_avg_gj_t')).toBe(36.6);
    expect(benchmark('nh3_coal_bat_gj_t')).toBe(42); expect(benchmark('nh3_floor_gj_t')).toBe(20);
    expect(benchmark('gwp_n2o')).toBe(273); expect(benchmark('gwp_ch4')).toBe(29.8);
    expect(benchmark('hno3_n2o_atmospheric')).toBe(5); expect(benchmark('hno3_n2o_high')).toBe(9);
  });
  it('a pack benchmark overrides the global one; an unknown key throws a code', () => {
    expect(benchmark('nh3_bat_gj_t', { nh3_bat_gj_t: { value: 30 } })).toBe(30);
    expect(benchmark('nh3_bat_gj_t', {})).toBe(28);
    expect(() => benchmark('nope')).toThrow('BENCH_UNKNOWN');
  });
  it('the only UNVERIFIED rows are named (so none sits silently behind a goal)', () => {
    expect(BENCH_KEYS.filter((k) => BENCHMARKS[k]!.conf === 'UNVERIFIED')).toEqual(['ng_co2_kg_gj']);
  });
});
