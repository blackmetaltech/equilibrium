// P2 (mass), P3 (energy), P24 (no NaN) on random chains of the M1.6 units, built through the registry.
import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { makeMixture, enthalpyFlow, massFlow } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { UNIT_DEFS } from './registry';

const SP = ['N2', 'O2', 'Ar', 'H2O', 'CO2', 'CH4', 'H2', 'CO'];
const mx = makeMixture(SP);
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const U = (type: string, params: Record<string, number | string>): UnitInst => ({ id: 'U', type, pos: { x: 0, y: 0 }, rot: 0, params });
const finite = (s: StreamState): boolean => Number.isFinite(s.T) && Number.isFinite(s.P) && s.n.every((x) => Number.isFinite(x) && x >= 0);

describe('random chains of units (seeded core Rng, 10 000 cases)', () => {
  it('P2 mass closes to 1e-9, P3 energy closes to 1e-6 of the largest term, P24 nothing is NaN', () => {
    const rng = new Rng(2026);
    let ran = 0, units = 0;
    const call = (t: string, inl: Record<string, StreamState>, p: Record<string, number | string>) => {
      const r = UNIT_DEFS[t]!.fn(inl, U(t, p), ctx);
      if (r.ok) { units++; for (const o of Object.values(r.value.outlets)) expect(finite(o)).toBe(true); expect(Number.isFinite(r.value.duty ?? 0) && Number.isFinite(r.value.work ?? 0)).toBe(true); }
      return r;
    };
    const feedS = (): StreamState => {
      const p: Record<string, number | string> = { T: 250 + rng.next() * 500, P: 1e5 * (1 + rng.next() * 30) };
      let any = false;
      SP.forEach((s) => { if (rng.next() < 0.5) { p['n_' + s] = rng.next() * 5; any = true; } });
      if (!any) p.n_N2 = 1;
      const r = call('feed', {}, p); if (!r.ok) throw new Error('feed'); return r.value.outlets.out!;
    };
    for (let c = 0; c < 10000; c++) {
      const feeds: StreamState[] = [];
      const exits: StreamState[] = [];
      let Q = 0, W = 0;
      const nf = (): StreamState => { const f = feedS(); feeds.push(f); return f; };
      let s = nf();
      const len = 1 + Math.floor(rng.next() * 6);
      let dead = false;
      for (let k = 0; k < len && !dead; k++) {
        const pick = Math.floor(rng.next() * 6);
        let r;
        if (pick === 0) { r = call('mixer', { in1: s, in2: nf() }, {}); if (r.ok) s = r.value.outlets.out!; }
        else if (pick === 1) { r = call('splitter', { in: s }, { frac: rng.next() }); if (r.ok) { exits.push(r.value.outlets.purge!); s = r.value.outlets.out!; } }
        else if (pick === 2) {
          const spec: Record<string, number> = rng.next() < 0.5 ? { T: 200 + rng.next() * 900 } : { duty: (rng.next() - 0.5) * 2e4 };
          r = call(rng.next() < 0.5 ? 'heater' : 'cooler', { in: s }, { ...spec, dP: rng.next() * 0.05 * s.P });
          if (r.ok) { Q += r.value.duty!; s = r.value.outlets.out!; }
        } else if (pick === 3) {
          const cold = nf();
          r = call('hx', { hot_in: s, cold_in: cold }, rng.next() < 0.5 ? { area: 0.1 + rng.next() * 50 } : { T_hot_out: s.T - rng.next() * (s.T - cold.T) });
          if (r.ok) { exits.push(r.value.outlets.cold_out!); s = r.value.outlets.hot_out!; }
          else if (r.code === 'TEMPERATURE_CROSS') { feeds.pop(); }
        } else if (pick === 4) {
          r = call('compressor', { in: s }, { P: s.P * (1.05 + rng.next() * 6), stages: 1 + Math.floor(rng.next() * 4) });
          if (r.ok) { Q += r.value.duty ?? 0; W += r.value.work!; s = r.value.outlets.out!; }
        } else {
          r = call('valve', { in: s }, { P: s.P * (0.1 + rng.next() * 0.9) }); if (r.ok) s = r.value.outlets.out!;
        }
        if (!r.ok) { expect(['DISCHARGE_TOO_HOT', 'TEMPERATURE_CROSS', 'T_BRACKET', 'ZERO_FLOW', 'NO_CONVERGE']).toContain(r.code); if (r.code !== 'TEMPERATURE_CROSS') dead = true; }
      }
      if (dead) continue;
      ran++;
      const vent = call('vent', { in: s }, {}); expect(vent.ok).toBe(true);
      exits.push(s);
      const mIn = feeds.reduce((a, f) => a + massFlow(mx, f.n), 0), mOut = exits.reduce((a, f) => a + massFlow(mx, f.n), 0);
      expect(Math.abs(mIn - mOut)).toBeLessThanOrEqual(1e-9 * Math.max(mIn, 1e-30));
      const hin = feeds.map((f) => enthalpyFlow(mx, f)), hout = exits.map((f) => enthalpyFlow(mx, f));
      const lhs = hin.reduce((a, b) => a + b, 0) + Q + W, rhs = hout.reduce((a, b) => a + b, 0);
      const big = Math.max(...hin.map(Math.abs), ...hout.map(Math.abs), Math.abs(Q), Math.abs(W), 1e-30);
      expect(Math.abs(lhs - rhs) / big).toBeLessThanOrEqual(1e-6);
    }
    expect(ran).toBeGreaterThan(4000); expect(units).toBeGreaterThan(20000);
  }, 120000);
});
