// Alarms (DESIGN 5.5, IEC 62682): tiers, on-delay, deadband, latching until acknowledged, no chatter.
import { describe, expect, it } from 'vitest';
import { ALARM_DELAY_S } from '../../data/events';
import { ackMon, alarmBits, criticalOpen, makeMon, scaleOf, stepMon, thresholds, type Mon } from './alarms';

const mon = (nom = 800, lim = 1100): Mon => makeMon('R.T', 'R', 'T', 'pipe', 'S1', nom, lim, 1200, 5);
const hold = (m: Mon, v: number, secs: number, t0 = 0): void => { for (let i = 0; i < secs; i++) stepMon(m, v, t0 + i); };

describe('thresholds', () => {
  it('Low 10 %, High 30 %, Critical 60 % of the margin; level pins override', () => {
    const t = thresholds(800, 1100, 5);
    expect(t.thr.map((x) => Math.round(x))).toEqual([830, 890, 980]);
    expect(t.db).toBeCloseTo(6, 9);
    expect(thresholds(800, 1100, 5, { hi: 1080 + 273 - 273, crit: 1100 }).thr.slice(1)).toEqual([1080, 1100]);
  });
  it('a nominal at or beyond the limit still gets a margin', () => {
    const t = thresholds(1100, 1000, 5);
    expect(t.margin).toBe(5);
  });
});

describe('alarm states', () => {
  it('on-delay: a value must stay beyond the threshold for the tier delay (High 5 s, Critical 2 s)', () => {
    const m = mon();
    hold(m, 900, ALARM_DELAY_S[1] - 1);
    expect(m.tier).toBe(0);
    hold(m, 900, 1, 10);
    expect(m.tier).toBe(2);
    expect(m.ack).toBe(0);
    const c = mon();
    hold(c, 1000, ALARM_DELAY_S[2]);
    expect(c.tier).toBe(3);
  });
  it('chatter test: a value oscillating +-0.5 % around a threshold never chatters (fast and slow)', () => {
    for (const period of [2, 4, 8, 20]) {
      const m = mon();
      const lim = m.thr[1]!;
      let changes = 0, last: number = m.tier;
      for (let t = 0; t < 2000; t++) {
        const v = lim * (1 + (Math.floor(t / (period / 2)) % 2 === 0 ? 0.005 : -0.005));
        stepMon(m, v, t);
        if (m.tier !== last) { changes++; last = m.tier; }
      }
      expect(changes, 'period ' + period).toBeLessThanOrEqual(1);
    }
  });
  it('clears only below threshold minus deadband, then latches until acknowledged', () => {
    const m = mon();
    hold(m, 900, 6);
    expect(m.tier).toBe(2);
    hold(m, m.thr[1]! - m.db / 2, 10, 10);
    expect(m.tier).toBe(2);
    hold(m, 800, 1, 30);
    expect(m.tier).toBe(0);
    expect(m.rtn).toBe(1);
    expect(ackMon(m)).toBe(true);
    expect(m.rtn).toBe(0);
    expect(ackMon(m)).toBe(false);
  });
  it('an acknowledged alarm leaves with no latch; escalation re-annunciates', () => {
    const m = mon();
    hold(m, 900, 6);
    ackMon(m);
    expect(m.ack).toBe(1);
    hold(m, 1000, 3, 10);
    expect(m.tier).toBe(3);
    expect(m.ack).toBe(0);
    ackMon(m);
    hold(m, 800, 1, 20);
    expect(m.tier).toBe(0);
    expect(m.rtn).toBe(0);
  });
  it('Low is advisory: no acknowledgement needed, no latch', () => {
    const m = mon();
    hold(m, 840, 11);
    expect(m.tier).toBe(1);
    expect(m.ack).toBe(1);
    hold(m, 800, 1, 20);
    expect(m.tier).toBe(0);
    expect(m.rtn).toBe(0);
  });
});

describe('time dilation and pause flags', () => {
  it('scale: cruise when quiet, watch on High, real time on an unacknowledged Critical, watch again once acknowledged', () => {
    const m = mon();
    expect(scaleOf([m])).toBe(0);
    hold(m, 900, 6);
    expect(scaleOf([m])).toBe(1);
    hold(m, 1000, 3, 10);
    expect(scaleOf([m])).toBe(2);
    expect(criticalOpen([m])).toBe(true);
    ackMon(m);
    expect(scaleOf([m])).toBe(1);
    expect(criticalOpen([m])).toBe(false);
  });
  it('a reactor warming faster than 0.2 K/s drops to watch with no alarm', () => {
    const m = makeMon('B.T', 'B', 'T', 'bed', '', 800, 1100, 1200, 5);
    stepMon(m, 800.5, 0);
    expect(scaleOf([m])).toBe(1);
    stepMon(m, 800.6, 1);
    expect(scaleOf([m])).toBe(0);
    const p = makeMon('H.T', 'H', 'T', 'pipe', 'S', 800, 1100, 1200, 5);
    stepMon(p, 805, 0);
    expect(scaleOf([p])).toBe(0);
  });
  it('alarm bits flag the monitors in High or Critical', () => {
    const a = mon(), b = mon();
    hold(b, 900, 6);
    expect(alarmBits([a, b])).toBe(2);
  });
});
