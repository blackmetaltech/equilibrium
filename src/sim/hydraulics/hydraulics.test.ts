// Hydraulics oracles: hand-computed and textbook values for velocity, Reynolds number, the friction factor (Moody chart points, Colebrook residual, Haaland and
// Swamee-Jain cross-checks), Darcy-Weisbach with fittings, the operating point against a closed form, shaft power, NPSH available and the affinity laws.
import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { G, areaOf, friction, frictionSwameeJain, lineLoss, npshAvailable, operatingPoint, pumpEta, pumpHead, pumpNpshr, pumpQZero, reynolds, shaftPower, staticHead, systemHead, velocity, type Fluid, type Pump, type System } from './hydraulics';
import { CONDENSATE_90C, EPS_STEEL, PIPES, PUMPS } from './catalogue';

const WATER20: Fluid = { name: 'water', rho: 998.2, mu: 1.002e-3, pVap: 2339 };
const colebrookResidual = (f: number, Re: number, rel: number): number => 1 / dmath.sqrt(f) + 2 * dmath.log10(rel / 3.7 + 2.51 / (Re * dmath.sqrt(f)));
const haaland = (Re: number, rel: number): number => { const x = -1.8 * dmath.log10(dmath.pow(rel / 3.7, 1.11) + 6.9 / Re); return 1 / (x * x); };

describe('velocity and Reynolds number', () => {
  it('60 m3/h in 4-inch schedule 40 (ID 102.3 mm) is 2.028 m/s (hand: A = pi/4 x 0.1023^2 = 8.219e-3 m2)', () => {
    expect(areaOf(0.1023)).toBeCloseTo(8.2194e-3, 6);
    expect(velocity(60 / 3600, 0.1023)).toBeCloseTo(2.0278, 3);
  });
  it('water at 20 °C, 1 m/s in a 0.1 m pipe: Re = 998.2 x 1 x 0.1 / 1.002e-3 = 99 621', () => {
    expect(reynolds(998.2, 1, 0.1, 1.002e-3)).toBeCloseTo(99621, 0);
  });
});

describe('Darcy friction factor', () => {
  it('laminar: 64/Re', () => { expect(friction(1000, 1e-3)).toBeCloseTo(0.064, 10); expect(friction(2000, 0)).toBeCloseTo(0.032, 10); });
  it('Moody chart points: smooth Re 1e5 is 0.0180, Re 1e6 is 0.0117; Re 1e5 at eps/D 1e-4 is 0.0185; fully rough eps/D 0.01 is 0.038', () => {
    expect(friction(1e5, 0)).toBeCloseTo(0.0180, 3);
    expect(friction(1e6, 0)).toBeCloseTo(0.0116, 3);
    expect(friction(1e5, 1e-4)).toBeCloseTo(0.0185, 3);
    expect(friction(1e8, 0.01)).toBeCloseTo(0.0380, 3);
  });
  it('solves Colebrook exactly (residual below 1e-10) across the turbulent range', () => {
    for (const Re of [4e3, 2e4, 1e5, 6e5, 3e6, 5e7]) for (const rel of [0, 1e-5, 4.5e-4, 1e-3, 5e-3, 2e-2]) {
      expect(Math.abs(colebrookResidual(friction(Re, rel), Re, rel)), `${Re} ${rel}`).toBeLessThan(1e-10);
    }
  });
  it('Swamee-Jain and Haaland agree with it within 2 %, and within 2.5 % at the rough low-Re corner (their published accuracy)', () => {
    for (const Re of [1e4, 1e5, 1e6, 1e7]) for (const rel of [1e-5, 1e-4, 1e-3, 1e-2]) {
      const f = friction(Re, rel);
      expect(Math.abs(frictionSwameeJain(Re, rel) / f - 1), `SJ ${Re} ${rel}`).toBeLessThan(Re <= 1e4 && rel >= 1e-2 ? 0.025 : 0.02);
      expect(Math.abs(haaland(Re, rel) / f - 1), `H ${Re} ${rel}`).toBeLessThan(0.02);
    }
  });
});

describe('Darcy-Weisbach with fittings', () => {
  it('hand calculation: 20 °C water, 50 m of 0.1 m steel at 2 m/s plus K = 5', () => {
    // v = 2, v^2/2g = 4 / 19.6133 = 0.20394 m; Re = 998.2 x 2 x 0.1 / 1.002e-3 = 199 242; eps/D = 4.6e-4; Colebrook f = 0.01862 (Moody chart reads about 0.0186)
    // pipe 0.01862 x 500 x 0.20394 = 1.899 m; fittings 5 x 0.20394 = 1.020 m; total 2.918 m
    const r = lineLoss({ D: 0.1, L: 50, K: 5, eps: 0.046e-3 }, 2 * areaOf(0.1), WATER20);
    expect(r.v).toBeCloseTo(2, 10); expect(r.hv).toBeCloseTo(0.20394, 5); expect(r.Re).toBeCloseTo(199242, -1);
    expect(r.f).toBeCloseTo(0.01862, 4);
    expect(r.hPipe).toBeCloseTo(1.899, 2); expect(r.hFit).toBeCloseTo(1.0197, 3); expect(r.h).toBeCloseTo(2.918, 2);
  });
  it('the loss grows a little slower than Q squared in turbulent flow (f falls with Re) and exactly as Q in laminar flow', () => {
    const line = { D: 0.0779, L: 100, K: 0, eps: EPS_STEEL };
    const a = lineLoss(line, 0.01, CONDENSATE_90C).h, b = lineLoss(line, 0.02, CONDENSATE_90C).h;
    expect(b / a).toBeGreaterThan(3.6); expect(b / a).toBeLessThan(4);
    const oil: Fluid = { name: 'oil', rho: 900, mu: 0.5, pVap: 100 };
    expect(lineLoss(line, 0.002, oil).h / lineLoss(line, 0.001, oil).h).toBeCloseTo(2, 8);
  });
});

describe('system, operating point, power, NPSH', () => {
  const sysOf = (fl: Fluid, D: number, L: number): System => ({ fluid: fl, dz: 10, zs: -3, pSuction: 101325, pDischarge: 101325 + 0.5e5, suction: { D, L: 5, K: 0, eps: 0.01 * D }, discharge: { D, L, K: 0, eps: 0.01 * D } });
  it('static head = lift + pressure difference as head: 10 + 50 000 / (998.2 x 9.80665) = 15.108 m', () => {
    expect(staticHead(sysOf(WATER20, 0.1, 100))).toBeCloseTo(15.108, 3);
  });
  it('fully rough flow makes the system curve an exact parabola: the operating point matches the closed form', () => {
    const inviscid: Fluid = { ...WATER20, mu: 1e-12 };   // Re huge: f is the von Karman rough limit 1/sqrt(f) = -2 log10(eps/D / 3.7)
    const sys = sysOf(inviscid, 0.1, 200);
    const fR = 1 / dmath.pow(-2 * dmath.log10(0.01 / 3.7), 2);
    const k = (fR * (205 / 0.1)) / (2 * G * areaOf(0.1) * areaOf(0.1)) / (3600 * 3600);   // m per (m3/h)^2
    const pump: Pump = { id: 'X', h0: 40, h1: 0, h2: 0.004, qBep: 60, etaBep: 0.75, n0: 2, n2: 0.0004, qMin: 10, qMax: 90, priceUsd: 0, motorKw: 0 };
    const q = dmath.sqrt((40 - staticHead(sys)) / (0.004 + k));
    const op = operatingPoint(pump, sys);
    expect(op.ok).toBe(true); expect(op.Qh).toBeCloseTo(q, 6);
    expect(op.H).toBeCloseTo(systemHead(sys, op.Qh / 3600), 8);
  });
  it('a pump whose shut-off head is below the static head gives no flow', () => {
    const op = operatingPoint({ ...PUMPS[0]!, h0: 10, h1: 0 }, sysOf(WATER20, 0.1, 100));
    expect(op.ok).toBe(false); expect(op.reason).toBe('shutoff'); expect(op.Qh).toBe(0);
  });
  it('shaft power: 1000 kg/m3 x 9.80665 x 0.01 m3/s x 30 m / 0.75 = 3922.66 W', () => { expect(shaftPower(1000, 0.01, 30, 0.75)).toBeCloseTo(3922.66, 2); });
  it('NPSHa: open tank at sea level, 20 °C water, 3 m suction lift: (101 325 - 2 339) / (998.2 x 9.80665) - 3 = 7.112 m at no flow, less the suction friction when flowing', () => {
    const sys = sysOf(WATER20, 0.1, 100);
    expect(npshAvailable(sys, 0)).toBeCloseTo(7.112, 3);
    expect(npshAvailable(sys, 0.02)).toBeCloseTo(7.112 - lineLoss(sys.suction, 0.02, WATER20).h, 3);
  });
  it('hot condensate leaves little NPSH: 90 °C water at atmospheric pressure has only 3.29 m of pressure head above its vapour pressure', () => {
    const c = CONDENSATE_90C;
    expect((101325 - c.pVap) / (c.rho * G)).toBeCloseTo(3.290, 3);
  });
});

describe('pump curves and the affinity laws', () => {
  const p = PUMPS[1]!;
  it('a trimmed impeller: shut-off head x t^2, BEP flow x t, efficiency peak kept, NPSHr x t^2 at the matching flow', () => {
    const t = 0.9;
    expect(pumpHead(p, 0, t)).toBeCloseTo(p.h0 * 0.81, 10);
    expect(pumpHead(p, 50 * t, t)).toBeCloseTo(pumpHead(p, 50) * t * t, 10);
    expect(pumpEta(p, p.qBep * t, t)).toBeCloseTo(p.etaBep, 12);
    expect(pumpNpshr(p, 40 * t, t)).toBeCloseTo(pumpNpshr(p, 40) * t * t, 10);
    expect(pumpQZero(p, t)).toBeCloseTo(pumpQZero(p) * t, 8);
    expect(pumpHead(p, pumpQZero(p))).toBeCloseTo(0, 8);
  });
  it('every catalogue pump has a falling curve, a peak efficiency at its BEP and a rising NPSHr; the pipe IDs are schedule 40', () => {
    for (const q of PUMPS) {
      expect(pumpHead(q, q.qMax)).toBeLessThan(pumpHead(q, q.qMin));
      expect(pumpEta(q, q.qBep)).toBeGreaterThan(pumpEta(q, q.qBep * 0.7)); expect(pumpEta(q, q.qBep)).toBeGreaterThan(pumpEta(q, q.qBep * 1.2));
      expect(pumpNpshr(q, q.qMax)).toBeGreaterThan(pumpNpshr(q, q.qMin));
      expect(pumpQZero(q)).toBeGreaterThan(q.qMax);
    }
    expect(PIPES.map((x) => x.idMm)).toEqual([52.5, 77.9, 102.3, 128.2, 154.1, 202.7]);
  });
});
