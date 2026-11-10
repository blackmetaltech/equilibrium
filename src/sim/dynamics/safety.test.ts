// Safety layer (DESIGN 3.7, 5.5): vessel pressure with a relief valve, interlocks, containment.
import { describe, expect, it } from 'vitest';
import { BLOWDOWN, FULL_COOLANT, LOSS_P_FACTOR } from '../../data/events';
import { containment, designPressure, interlockTrips, jacketWith, liquidReliefOpen, liquidReliefSink, vesselStep, type VesselDyn } from './safety';

const vessel = (over: Partial<VesselDyn> = {}): VesselDyn => ({ P: 1e6, Pss: 1e6, V: 2, Pset: 1.25e6, capKgS: 5, M: 0.028, ...over });

describe('vessel pressure ODE', () => {
  it('balanced flows leave the pressure where it is (outflow scales with P / Pss)', () => {
    const v = vessel();
    const r = vesselStep(v, 400, 1, 1, 0);
    expect(r.P).toBeCloseTo(1e6, 6);
    expect(r.open).toBe(0);
  });
  it('an inflow excess raises P by (R T / V) dn per second and the outflow pushes back toward the steady value', () => {
    const v = vessel();
    const r = vesselStep(v, 400, 1.1, 1, 0);
    expect(r.P).toBeCloseTo(1e6 + (8.314462618 * 400 * 0.1) / 2, -1);
    let P = v.P;
    for (let i = 0; i < 4000; i++) P = vesselStep({ ...v, P }, 400, 1, 1, 0).P;
    expect(Math.abs(P - 1e6)).toBeLessThan(1);
  });
  it('relief lifts above Pset and holds P at Pset while capacity lasts', () => {
    const v = vessel({ P: 1.24e6 });
    let open: 0 | 1 = 0, P = v.P;
    for (let i = 0; i < 200; i++) { const r = vesselStep({ ...v, P }, 400, 3, 1, open); P = r.P; open = r.open; }
    expect(open).toBe(1);
    expect(Math.abs(P - v.Pset)).toBeLessThan(1e-6 * v.Pset);
  });
  it('relief reseats below 93 % of the set pressure once the excess is gone', () => {
    const v = vessel();
    let open: 0 | 1 = 1, P = v.Pset;
    let seated = -1;
    for (let i = 0; i < 400 && seated < 0; i++) { const r = vesselStep({ ...v, P }, 400, 0.2, 1, open); P = r.P; open = r.open; if (open === 0) seated = i; }
    expect(seated).toBeGreaterThan(0);
    expect(P).toBeLessThan(v.Pset * BLOWDOWN);
  });
  it('an undersized relief cannot hold: P keeps climbing past Pset', () => {
    const v = vessel({ capKgS: 0.001, P: 1.25e6 });
    let open: 0 | 1 = 0, P = v.P;
    for (let i = 0; i < 30; i++) { const r = vesselStep({ ...v, P }, 400, 30, 1, open); P = r.P; open = r.open; }
    expect(open).toBe(1);
    expect(P).toBeGreaterThan(1.5e6);
  });
  it('a dump interlock multiplies the relief capacity', () => {
    const v = vessel({ capKgS: 0.001 });
    const slow = vesselStep({ ...v, P: 1.3e6 }, 400, 3, 1, 1, 1).P, fast = vesselStep({ ...v, P: 1.3e6 }, 400, 3, 1, 1, 1000).P;
    expect(fast).toBeLessThan(slow);
  });
});

describe('liquid relief (L24 temperature equivalent)', () => {
  it('lifts at the set temperature and reseats 5 K below', () => {
    expect(liquidReliefOpen(412, 413.15, 0)).toBe(0);
    expect(liquidReliefOpen(413.15, 413.15, 0)).toBe(1);
    expect(liquidReliefOpen(410, 413.15, 1)).toBe(1);
    expect(liquidReliefOpen(407, 413.15, 1)).toBe(0);
  });
  it('its heat sink is capacity x latent heat over the 10 K reference rise and mixes into the jacket', () => {
    const ua = liquidReliefSink(0.2);
    expect(ua).toBeCloseTo((0.2 * 3.7e5) / 10, 6);
    const j = jacketWith(1000, 300, ua, 413.15, false);
    expect(j.UA).toBeCloseTo(1000 + ua, 9);
    expect(j.Tc).toBeGreaterThan(300);
    expect(j.Tc).toBeLessThan(413.15);
    expect(jacketWith(1000, 300, 0, 413, false)).toEqual({ UA: 1000, Tc: 300 });
  });
  it('full coolant: colder and bigger jacket', () => {
    expect(jacketWith(1000, 300, 0, 413, true)).toEqual({ UA: 1000 * FULL_COOLANT.ua, Tc: 300 - FULL_COOLANT.dTc });
  });
});

describe('interlocks and containment', () => {
  it('T, P and level trip high; flow trips low; a zero set point is disarmed', () => {
    expect(interlockTrips('T', 401, 400)).toBe(true);
    expect(interlockTrips('T', 399, 400)).toBe(false);
    expect(interlockTrips('P', 2e6, 1e6)).toBe(true);
    expect(interlockTrips('flow', 0.1, 0.5)).toBe(true);
    expect(interlockTrips('flow', 0.9, 0.5)).toBe(false);
    expect(interlockTrips('T', 1e9, 0)).toBe(false);
  });
  it('containment loss: P above 1.5 x design, or T above the material limit', () => {
    expect(containment(1.49e6, 1e6, 300, 500)).toBe(0);
    expect(containment(LOSS_P_FACTOR * 1e6 + 1, 1e6, 300, 500)).toBe(1);
    expect(containment(1e5, 1e6, 501, 500)).toBe(2);
    expect(designPressure(1e6)).toBe(1.25e6);
  });
});
