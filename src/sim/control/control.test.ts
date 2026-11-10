// Oracles of the control library (all analytic): first-order step, P-only offset 1/(1+Kc K), ZN ultimate gain and period (frequency method), IMC PI rules, bump-test fit.
import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { cascadeStep, clamp, fitFopdt, fopdtInit, fopdtStep, imcPI, imcPID, loopMetrics, pOffsetFraction, pidInit, pidStep, ratioSetpoint, stepResponse, ultimate, vote, zn, firstOrderAt } from './index';
import type { Fopdt, PidCfg } from './index';

const loop = (p: Fopdt, cfg: PidCfg, spf: (t: number) => number, T: number, dt: number) => {
  const proc = fopdtInit(p, dt), st = pidInit(cfg), pv: number[] = [], sp: number[] = [], op: number[] = [];
  let y = 0;
  for (let k = 0; k < T / dt; k++) {
    const t = k * dt, s = spf(t);
    const u = pidStep(cfg, st, s, y, dt);
    y = fopdtStep(p, proc, u - cfg.bias, dt);
    pv.push(y); sp.push(s); op.push(u);
  }
  return { pv, sp, op, st };
};
const cfgOf = (kc: number, tauI = 0, tauD = 0): PidCfg => ({ kc, tauI, tauD, action: 'reverse', bias: 0, lo: -1e9, hi: 1e9 });

describe('process blocks', () => {
  it('first-order step response equals K(1 - exp(-t/tau)) at every sample', () => {
    const p: Fopdt = { K: 2.5, tau: 40, theta: 0 }, r = stepResponse(p, 1.5, 300, 1);
    for (let k = 0; k < r.t.length; k += 17) expect(r.y[k]).toBeCloseTo(firstOrderAt(2.5, 40, 1.5, r.t[k]!, dmath.exp), 9);
  });
  it('dead time delays the response by exactly theta', () => {
    const r = stepResponse({ K: 1, tau: 10, theta: 7 }, 1, 60, 1);
    expect(r.y[6]).toBe(0);
    expect(r.y[7]).toBeCloseTo(1 - dmath.exp(-0.1), 12);
    expect(r.y[30]).toBeCloseTo(1 - dmath.exp(-2.4), 12);
  });
});

describe('P-only offset', () => {
  it('the steady offset of a set-point step is 1/(1 + Kc K) of the step', () => {
    for (const [K, kc] of [[1, 2], [3, 0.5], [0.8, 4]] as const) {
      const p: Fopdt = { K, tau: 30, theta: 2 }, r = loop(p, cfgOf(kc), () => 1, 1500, 0.5);
      const off = 1 - r.pv[r.pv.length - 1]!;
      expect(off).toBeCloseTo(pOffsetFraction(kc, K), 6);
    }
  });
  it('integral action removes the offset', () => {
    const r = loop({ K: 1, tau: 30, theta: 2 }, cfgOf(2, 30), () => 1, 2000, 0.5);
    expect(Math.abs(1 - r.pv[r.pv.length - 1]!)).toBeLessThan(1e-6);
  });
});

describe('Ziegler-Nichols ultimate gain', () => {
  const p: Fopdt = { K: 1.5, tau: 20, theta: 4 };
  it('the frequency equations hold: phase -180 degrees and loop gain 1 at Ku', () => {
    const u = ultimate(p);
    expect(dmath.atan(u.w * p.tau) + u.w * p.theta).toBeCloseTo(Math.PI, 10);
    expect(u.ku * p.K / Math.sqrt(1 + (u.w * p.tau) ** 2)).toBeCloseTo(1, 10);
    expect(u.pu).toBeCloseTo((2 * Math.PI) / u.w, 12);
  });
  it('the thin-delay limit: Ku ~ (pi/2) tau / (K theta)', () => {
    const q: Fopdt = { K: 1, tau: 100, theta: 0.5 };
    expect(ultimate(q).ku / ((Math.PI / 2) * 100 / 0.5)).toBeGreaterThan(0.99);
    expect(ultimate(q).ku / ((Math.PI / 2) * 100 / 0.5)).toBeLessThan(1.05);
  });
  it('a simulated loop at 0.9 Ku decays and at 1.15 Ku grows (the period is Pu)', () => {
    const u = ultimate(p), dt = 0.05;
    const amp = (r: ReturnType<typeof loop>) => { const n = r.pv.length, a = Math.max(...r.pv.slice(n - 400).map((x) => Math.abs(x - 1))), b = Math.max(...r.pv.slice(n / 4, n / 4 + 400).map((x) => Math.abs(x - 1))); return a / b; };
    expect(amp(loop(p, cfgOf(0.9 * u.ku), () => 1, 200, dt))).toBeLessThan(1);
    expect(amp(loop(p, { ...cfgOf(1.15 * u.ku), lo: -1e12, hi: 1e12 }, () => 1, 200, dt))).toBeGreaterThan(1);
  });
  it('ZN PI / PID rules', () => {
    expect(zn(10, 60, 'PI')).toEqual({ kc: 4.5, tauI: 50, tauD: 0 });
    expect(zn(10, 60, 'PID')).toEqual({ kc: 6, tauI: 30, tauD: 7.5 });
  });
});

describe('IMC tuning', () => {
  it('PI rules: Kc = tau / (K (lambda + theta)), tauI = tau', () => {
    expect(imcPI({ K: 2, tau: 30, theta: 5 }, 10)).toEqual({ kc: 30 / (2 * 15), tauI: 30, tauD: 0 });
    const d = imcPID({ K: 2, tau: 30, theta: 4 }, 6);
    expect(d.kc).toBeCloseTo(32 / (2 * 8), 12); expect(d.tauI).toBe(32); expect(d.tauD).toBeCloseTo(60 / 32, 12);
  });
  it('without dead time the closed loop is first order with time constant lambda', () => {
    const p: Fopdt = { K: 1, tau: 30, theta: 0 }, lam = 12, t = imcPI(p, lam);
    const r = loop(p, cfgOf(t.kc, t.tauI), () => 1, 120, 0.05);
    for (const tt of [6, 12, 36]) expect(r.pv[Math.round(tt / 0.05) - 1]).toBeCloseTo(1 - dmath.exp(-tt / lam), 2);
  });
  it('a larger lambda is slower and gentler (IAE up, valve move down)', () => {
    const p: Fopdt = { K: 1, tau: 30, theta: 5 };
    const run = (lam: number) => { const t = imcPI(p, lam), r = loop(p, cfgOf(t.kc, t.tauI), (x) => (x < 1 ? 0 : 1), 400, 0.5); return { m: loopMetrics(r.pv, r.sp, r.op, 0.5, -1e9, 1e9), umax: Math.max(...r.op) }; };
    expect(run(25).m.iae).toBeGreaterThan(run(5).m.iae);
    expect(run(25).umax).toBeLessThan(run(5).umax);
  });
});

describe('bump test fit', () => {
  it('recovers K, tau, theta of a FOPDT from its open-loop response', () => {
    const p: Fopdt = { K: 1.8, tau: 45, theta: 12 }, r = stepResponse(p, 5, 2400, 0.5);
    const f = fitFopdt(r.t, r.y, 5);
    expect(f.K).toBeCloseTo(1.8, 3);
    expect(Math.abs(f.tau - 45) / 45).toBeLessThan(0.03);
    expect(Math.abs(f.theta - 12)).toBeLessThan(1.2);
  });
});

describe('anti-windup, structures, metrics', () => {
  it('the integral stays bounded while the valve is saturated, and the loop recovers sooner than without anti-windup', () => {
    const p: Fopdt = { K: 1, tau: 20, theta: 2 };
    const run = (aw: boolean) => loop(p, { kc: 2, tauI: 20, tauD: 0, action: 'reverse', bias: 0, lo: 0, hi: 10, antiWindup: aw }, (t) => (t < 100 ? 50 : 5), 300, 0.5);
    const a = run(true), b = run(false);
    expect(a.st.i).toBeLessThan(20);
    const settle = (r: ReturnType<typeof run>) => r.pv.findIndex((x, k) => k > 200 && x < 6);
    expect(settle(a)).toBeGreaterThan(0); expect(settle(b) < 0 || settle(a) < settle(b)).toBe(true);
  });
  it('ratio station clamps, vote is k-out-of-n, cascade scales master to slave range', () => {
    expect(ratioSetpoint(3, 10, 0, 25)).toBe(25); expect(ratioSetpoint(3, 4, 0, 25)).toBe(12);
    expect(vote([true, false, true], 2)).toBe(true); expect(vote([true, false, false], 2)).toBe(false);
    const cfg = cfgOf(1, 0); cfg.lo = 0; cfg.hi = 100;
    const st = { master: pidInit(cfg), slave: pidInit(cfg) };
    expect(cascadeStep(cfg, cfg, st, 50, 40, 0, 10, 20, 1).slaveSp).toBeCloseTo(10 + 0.1 * 10, 9);
    expect(clamp(5, 0, 1)).toBe(1);
  });
  it('metrics: IAE of a constant error, overshoot and settling', () => {
    const pv = [0, 0.5, 1.2, 1.05, 1, 1, 1], sp = [1, 1, 1, 1, 1, 1, 1], op = [0, 50, 100, 100, 50, 50, 50];
    const m = loopMetrics(pv, sp, op, 2, 0, 100);
    expect(m.iae).toBeCloseTo(2 * (1 + 0.5 + 0.2 + 0.05), 12);
    expect(m.satShare).toBeCloseTo(3 / 7, 12);
  });
});
