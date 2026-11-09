import { describe, expect, it } from 'vitest';
import { makeMixture, enthalpyFlow, solveT } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { mixer } from './mixer';

const SP = ['N2', 'O2', 'Ar', 'H2O', 'CO2'];
const mx = makeMixture(SP);
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const U: UnitInst = { id: 'M1', type: 'mixer', pos: { x: 0, y: 0 }, rot: 0, params: {} };
const S = (n: number[], T: number, P = 1e5): StreamState => ({ n, T, P });

describe('mixer', () => {
  it('Felder 8.3 adiabatic mixing: sum H_in = H_out (energy closes to 1e-12) and T lies between the inlets', () => {
    const a = S([1, 0.2, 0, 0, 0], 300), b = S([0, 0, 0.5, 2, 0.1], 800);
    const r = mixer({ in1: a, in2: b }, U, ctx);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const o = r.value.outlets.out!;
    const Hin = enthalpyFlow(mx, a) + enthalpyFlow(mx, b);
    expect(Math.abs(enthalpyFlow(mx, o) - Hin) / Math.abs(Hin)).toBeLessThan(1e-12);
    expect(o.T).toBeGreaterThan(300); expect(o.T).toBeLessThan(800);
    expect(o.n).toEqual([1, 0.2, 0.5, 2, 0.1]);
    expect(r.value.duty ?? 0).toBe(0); expect(r.value.work ?? 0).toBe(0);
  });
  it('N2 + N2 equal flows: outlet T is the enthalpy-mean (just above the arithmetic mean, Cp rising)', () => {
    const r = mixer({ in1: S([1, 0, 0, 0, 0], 300), in2: S([1, 0, 0, 0, 0], 500) }, U, ctx);
    if (!r.ok) throw new Error('x');
    // H(T) is convex (Cp of N2 rises with T): H(T_mix) = mean of H(300), H(500) puts T_mix a little ABOVE the arithmetic mean 400
    expect(r.value.outlets.out!.T).toBeGreaterThan(400); expect(r.value.outlets.out!.T).toBeLessThan(401);
    const sol = solveT(mx, (enthalpyFlow(mx, S([1, 0, 0, 0, 0], 300)) + enthalpyFlow(mx, S([1, 0, 0, 0, 0], 500))), [2, 0, 0, 0, 0]);
    expect(r.value.outlets.out!.T).toBeCloseTo(sol.ok ? sol.value : NaN, 9);
  });
  it('streams at equal T keep that T whatever the composition (H is linear in n at fixed T)', () => {
    const r = mixer({ in1: S([1, 0, 0, 3, 0], 350), in2: S([0, 2, 1, 0, 4], 350) }, U, ctx);
    if (!r.ok) throw new Error('x');
    expect(r.value.outlets.out!.T).toBeCloseTo(350, 7);
  });
  it('MIXER_PRESSURE_MISMATCH info when pressures differ; outlet P = min(P_in)', () => {
    const r = mixer({ in1: S([1, 0, 0, 0, 0], 300, 5e5), in2: S([1, 0, 0, 0, 0], 300, 2e5) }, U, ctx);
    if (!r.ok) throw new Error('x');
    expect(r.value.outlets.out!.P).toBe(2e5);
    const d = r.diag.find((x) => x.code === 'MIXER_PRESSURE_MISMATCH');
    expect(d?.severity).toBe('info'); expect(d?.data).toMatchObject({ Pmax: 5e5, Pmin: 2e5 }); expect(d?.unitId).toBe('M1');
    const r2 = mixer({ in1: S([1, 0, 0, 0, 0], 300, 2e5), in2: S([1, 0, 0, 0, 0], 300, 2e5) }, U, ctx);
    if (!r2.ok) throw new Error('x'); expect(r2.diag.find((x) => x.code === 'MIXER_PRESSURE_MISMATCH')).toBeUndefined();
  });
  it('tolerates unconnected inlets (3-port mixer fed by two) and zero-flow streams', () => {
    const r = mixer({ in1: S([1, 0, 0, 0, 0], 300), in3: S([0, 0, 0, 0, 0], 900) }, U, ctx);
    if (!r.ok) throw new Error('x');
    expect(r.value.outlets.out!.T).toBeCloseTo(300, 7);
    const z = mixer({}, U, ctx);
    expect(z.ok).toBe(true);
  });
  it('non-finite inlet -> NUMERIC_GUARD failure', () => {
    const r = mixer({ in1: S([NaN, 0, 0, 0, 0], 300) }, U, ctx);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('NUMERIC_GUARD');
  });
});
