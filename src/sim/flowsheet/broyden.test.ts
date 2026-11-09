import { describe, expect, it } from 'vitest';
import { broydenSolve } from './broyden';

const done = (_x: number[], f: number[]) => Math.max(...f.map(Math.abs)) < 1e-12;

describe('broydenSolve (good method, FD start, backtracking)', () => {
  it('solves a linear system in about n + 2 evaluations', () => {
    const A = [[3, 1, 0], [1, 4, 1], [0, 1, 5]], b = [1, 2, 3];
    const F = (x: number[]) => A.map((r, i) => r.reduce((s, a, j) => s + a * x[j]!, 0) - b[i]!);
    const r = broydenSolve(F, [0, 0, 0], { maxEvals: 50, step: [1e-6, 1e-6, 1e-6], done });
    expect(r.ok).toBe(true);
    expect(r.evals).toBeLessThanOrEqual(8);
    expect(Math.max(...F(r.x).map(Math.abs))).toBeLessThan(1e-12);
  });
  it('solves a smooth nonlinear 2-D system', () => {
    const F = (x: number[]) => [x[0]! * x[0]! + x[1]! * x[1]! - 4, x[0]! * x[1]! - 1];
    const r = broydenSolve(F, [2, 0.5], { maxEvals: 60, step: [1e-6, 1e-6], done });
    expect(r.ok).toBe(true);
    expect(Math.abs(F(r.x)[0]!)).toBeLessThan(1e-12);
  });
  it('uses the supplied f0 (no re-evaluation) and honours the eval budget', () => {
    let calls = 0;
    const F = (x: number[]) => { calls++; return [Math.cos(x[0]!) * 10 + 0.001 * x[0]!]; };
    const r = broydenSolve(F, [1], { maxEvals: 5, step: [1e-6], done, f0: F([1]) });
    expect(calls).toBeLessThanOrEqual(7);
    expect(r.evals).toBeLessThanOrEqual(5);
  });
  it('reports a singular Jacobian instead of throwing', () => {
    const F = (x: number[]) => [x[0]! - x[1]! - 1, x[0]! - x[1]! + 2];
    const r = broydenSolve(F, [0, 0], { maxEvals: 30, step: [1e-6, 1e-6], done });
    expect(r.ok).toBe(false);
    expect(['singular', 'stalled', 'maxEvals']).toContain(r.reason);
  });
  it('treats an evaluation failure as a rejected step', () => {
    const F = (x: number[]) => (x[0]! > 3 ? null : [x[0]! * x[0]! - 4]);
    const r = broydenSolve(F, [1], { maxEvals: 40, step: [1e-6], done });
    expect(r.ok).toBe(true);
    expect(Math.abs(r.x[0]! - 2)).toBeLessThan(1e-9);
  });
});
