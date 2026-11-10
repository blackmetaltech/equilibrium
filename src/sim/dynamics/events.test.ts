// Event scheduling and effects (DESIGN 2.6, 3.9): deterministic from (seed, level, shift index); gentler in Learner; folded into modifiers.
import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_TABLES, EVENT_TYPES, LEARNER_GENTLE } from '../../data/events';
import { emptyMods, foldMods, scheduleEvents, shiftSeed, stepEvents, targetsOf, type EventsCore, type ScheduleInput } from './events';
import type { UnitInst } from '../types';

const u = (id: string, type: string, params: Record<string, number | string> = {}): UnitInst => ({ id, type, pos: { x: 0, y: 0 }, rot: 0, params });
const PLANT: UnitInst[] = [
  u('F1', 'feed'), u('F2', 'feed'), u('K1', 'compressor'), u('C1', 'cooler', { utility: 'cw' }), u('V1', 'valve'), u('R1', 'packed_bed'), u('R2', 'multibed'),
  u('B1', 'boiler'), u('P1', 'product'), u('S1', 'stack'),
];
const SP = ['N2', 'H2', 'Ar', 'O2'];
const base = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  seed: 7, level: null, idx: 0, mode: 'engineer', enabled: true, species: SP, units: PLANT, feedX: { F1: [0.25, 0.7, 0.05, 0], F2: [0.79, 0, 0, 0.21] }, ...over,
});

describe('schedule', () => {
  it('is a pure function of (seed, level, shift index, plant): the same input gives the same queue', () => {
    expect(scheduleEvents(base())).toEqual(scheduleEvents(base()));
    expect(scheduleEvents(base({ level: 'L13', seed: 99 }))).toEqual(scheduleEvents(base({ level: 'L13', seed: 99 })));
  });
  it('differs between shift indices and seeds', () => {
    const a = JSON.stringify(scheduleEvents(base())), b = JSON.stringify(scheduleEvents(base({ idx: 1 }))), c = JSON.stringify(scheduleEvents(base({ seed: 8 })));
    expect(new Set([a, b, c]).size).toBe(3);
    expect(shiftSeed(1, 'L05', 0)).not.toBe(shiftSeed(1, 'L05', 1));
    expect(shiftSeed(1, 'L05', 0)).not.toBe(shiftSeed(1, 'L06', 0));
  });
  it('draws 2-4 events from the free table, sorted by time, inside the shift, each at most once, all applicable', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { q, lenS } = scheduleEvents(base({ seed }));
      expect(q.length).toBeGreaterThanOrEqual(2); expect(q.length).toBeLessThanOrEqual(4);
      expect(new Set(q.map((e) => e.type)).size).toBe(q.length);
      for (let i = 0; i < q.length; i++) {
        const e = q[i]!;
        expect(e.at).toBeGreaterThanOrEqual(1); expect(e.at).toBeLessThan(lenS);
        if (i > 0) expect(e.at).toBeGreaterThanOrEqual(q[i - 1]!.at);
        expect(targetsOf(e.type, base()).length).toBeGreaterThan(0);
      }
    }
  });
  it('every one of the 14 types can be drawn on a plant that has what it needs', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) for (const e of scheduleEvents(base({ seed })).q) seen.add(e.type);
    expect([...seen].sort()).toEqual([...EVENT_TYPES].sort());
  });
  it('an event that cannot happen here is never drawn (no cooler: no cooling-water events; no inert species: no inerts)', () => {
    const plant = PLANT.filter((x) => x.type !== 'cooler');
    for (let seed = 1; seed <= 100; seed++) for (const e of scheduleEvents(base({ seed, units: plant, species: ['H2', 'O2'] })).q) {
      expect(['cw_pump_trip', 'cw_hot_day', 'feed_inerts']).not.toContain(e.type);
    }
  });
  it('L00: one scripted cooling-water pump trip at 20 s, whatever the game seed (fixed seed)', () => {
    for (const seed of [1, 2, 3, 12345]) {
      const { q, lenS } = scheduleEvents(base({ level: 'L00', seed }));
      expect(q).toHaveLength(1);
      expect(q[0]).toMatchObject({ type: 'cw_pump_trip', at: 20, dur: 0, target: '' });
      expect(lenS).toBe(EVENT_TABLES.L00!.lenS);
    }
  });
  it('L24: the cooling-water pump trip is guaranteed once; L05 draws only surge and blower wear', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const q = scheduleEvents(base({ level: 'L24', seed })).q;
      expect(q.filter((e) => e.type === 'cw_pump_trip')).toHaveLength(1);
      for (const e of scheduleEvents(base({ level: 'L05', seed })).q) expect(['feed_surge', 'blower_wear']).toContain(e.type);
    }
  });
  it('Learner shrinks every deviation by the gentler factor; the draws are the same', () => {
    const e = scheduleEvents(base({ level: 'L00' })).q[0]!, l = scheduleEvents(base({ level: 'L00', mode: 'learner' })).q[0]!;
    expect(e.v).toBeCloseTo(0.3, 12);
    expect(l.v).toBeCloseTo(1 + (0.3 - 1) * LEARNER_GENTLE, 12);
    const a = scheduleEvents(base({ seed: 5 })).q, b = scheduleEvents(base({ seed: 5, mode: 'learner' })).q;
    expect(b.map((x) => [x.type, x.at])).toEqual(a.map((x) => [x.type, x.at]));
  });
  it('sandbox runs without events unless asked', () => {
    expect(scheduleEvents(base({ enabled: false })).q).toEqual([]);
  });
  it('poison and valve events name a unit, inerts name a species', () => {
    expect(targetsOf('catalyst_poison', base())).toEqual(['R1', 'R2']);
    expect(targetsOf('valve_fails_closed', base())).toEqual(['V1']);
    expect(targetsOf('feed_inerts', base())).toEqual(['Ar']);
    expect(targetsOf('blower_wear', base({ feedX: { F1: [0.25, 0.7, 0.05, 0] } }))).toEqual([]);
  });
  it('magnitudes follow DESIGN 2.6', () => {
    expect(EVENTS.cw_pump_trip.mag).toBe(0.3); expect(EVENTS.cw_hot_day.mag).toBe(8); expect(EVENTS.feed_surge.mag).toBe(1.1);
    expect(EVENTS.blower_wear.mag).toBe(0.92); expect(EVENTS.catalyst_age.mag).toBe(0.9); expect(EVENTS.catalyst_poison.mag).toBe(0.6);
    expect(EVENTS.fuel_price.mag).toBe(2); expect(EVENTS.demand_spike.mag).toBe(1.5); expect(EVENTS.power_dip.mag).toBe(0.85); expect(EVENTS.steam_header_low.mag).toBe(0.5);
    expect([EVENTS.feed_inerts.mag, EVENTS.feed_inerts.magHi]).toEqual([0.02, 0.05]);
    expect(EVENTS.compressor_trip.durS).toBe(60); expect(EVENTS.power_dip.durS).toBe(30); expect(EVENTS.demand_spike.durS).toBe(3600);
  });
});

describe('effects', () => {
  it('foldMods combines the active events (products and sums)', () => {
    const m = foldMods([
      { id: 'a', type: 'cw_pump_trip', until: -1, v: 0.3, target: '' }, { id: 'b', type: 'feed_surge', until: -1, v: 1.1, target: '' }, { id: 'c', type: 'feed_surge', until: -1, v: 1.1, target: '' },
      { id: 'd', type: 'catalyst_poison', until: -1, v: 0.6, target: 'R1' }, { id: 'e', type: 'feed_inerts', until: -1, v: 0.03, target: 'Ar' }, { id: 'f', type: 'valve_fails_closed', until: 5, v: 0, target: 'V1' },
    ]);
    expect(m.cwUa).toBeCloseTo(0.3, 12); expect(m.feed).toBeCloseTo(1.21, 12); expect(m.actBed).toEqual({ R1: 0.6 }); expect(m.inerts).toEqual({ Ar: 0.03 }); expect(m.blocked).toEqual(['V1']);
    expect(foldMods([])).toEqual(emptyMods());
  });
  it('stepEvents fires at the scheduled second and retires timed events at their end', () => {
    const core: EventsCore = { t: 0, q: [{ id: 'E1', type: 'power_dip', at: 10, dur: 30, v: 0.85, target: '' }, { id: 'E2', type: 'cw_hot_day', at: 15, dur: 0, v: 8, target: '' }], act: [], mods: emptyMods() };
    const log: string[] = [];
    for (core.t = 0; core.t <= 60; core.t++) {
      const r = stepEvents(core);
      for (const e of r.fired) log.push('fire ' + e.id + '@' + core.t);
      for (const e of r.ended) log.push('end ' + e.id + '@' + core.t);
      if (core.t === 9) expect(core.mods.motors).toBe(1);
      if (core.t === 10) expect(core.mods.motors).toBe(0.85);
      if (core.t === 39) expect(core.mods.motors).toBe(0.85);
      if (core.t === 40) expect(core.mods.motors).toBe(1);
    }
    expect(log).toEqual(['fire E1@10', 'fire E2@15', 'end E1@40']);
    expect(core.mods.cwdT).toBe(8);
  });
});
