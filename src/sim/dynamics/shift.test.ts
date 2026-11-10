// The shift pipeline end to end (DESIGN 2.1, 3.9, 8.5): events -> boundary conditions -> debounced re-solve -> lagged display, ramps, interlocks,
// relief, containment loss, alarms and time dilation, records and budgets. Engine tests run the real ammonia loop; the L24 reactor tests run the systems
// on a hand-built plant (the lab pseudo-species cannot be commissioned through the engine yet).
import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../../engine/snapshot';
import { hashOf } from '@core/kit';
import { must, reject } from '../../engine/test-helpers';
import { SAFE_FLOW } from '../../data/events';
import { alphaOf } from './lags';
import { cstrShift, loopShift, queueEvent, run, TdegC } from './testplants';
import { effectiveUnits, feedMult } from './shift';
import type { EqState } from '../../state';

const prodKgS = (s: EqState): number => {
  const sh = s.shift!;
  let kg = 0;
  for (const p of sh.prod) { const st = sh.disp[p.pipe]!; st.n.forEach((n, i) => { kg += n * sh.mw[i]!; }); }
  return kg;
};

describe('starting and ending a shift', () => {
  it('needs a commissioned plant; starts the shift phase with the first state at the commissioned steady state', () => {
    const { e, S } = loopShift({ start: false });
    expect(S().phase).toBe('commissioned');
    must(e, 'startShift', 'shift', false);
    expect(S().phase).toBe('shift');
    const sh = S().shift!;
    expect(sh.t).toBe(0); expect(sh.scale).toBe(0); expect(sh.paused).toBe(0); expect(sh.ended).toBe('');
    for (const id of Object.keys(sh.disp)) expect(sh.disp[id]).toEqual(S().solved!.streams[id]);
    expect(reject(e, 'startShift')).toMatch(/commission/i);
  });
  it('is rejected from the design phase and with a wrong kind', () => {
    const { e } = loopShift({ start: false });
    expect(reject(e, 'startShift', 'banana')).toMatch(/first run/);
    must(e, 'undo');
    expect(reject(e, 'startShift')).toMatch(/commission/i);
  });
  it('sandbox runs without events unless asked; learner and engineer draw 2-4 from the free table', () => {
    expect(loopShift({ mode: 'sandbox', events: 'default' }).S().shift!.q).toHaveLength(0);
    expect(loopShift({ mode: 'sandbox', events: true }).S().shift!.q.length).toBeGreaterThanOrEqual(2);
    for (const mode of ['learner', 'engineer']) for (const seed of [3, 4, 5]) { const n = loopShift({ mode, seed, events: 'default' }).S().shift!.q.length; expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(4); }
  });
  it('the first run is 30 plant seconds with no events and ends back in the commissioned phase', () => {
    const { e, S } = loopShift({ start: false });
    must(e, 'startShift', 'firstrun');
    expect(S().phase).toBe('firstrun'); expect(S().shift!.q).toHaveLength(0);
    must(e, 'tick', 29); expect(S().phase).toBe('firstrun');
    must(e, 'tick', 1); expect(S().phase).toBe('commissioned'); expect(S().shift!.ended).toBe('time');
  });
  it('the shift ends after its length: report phase, clock stops', () => {
    const { e, S } = loopShift();
    S().shift!.len = 100;
    must(e, 'tick', 99); expect(S().phase).toBe('shift');
    must(e, 'tick', 1); expect(S().phase).toBe('report'); expect(S().shift!.ended).toBe('time'); expect(S().shift!.t).toBe(100);
    must(e, 'tick', 50); expect(S().shift!.t).toBe(100);
  });
  it('design actions are refused while running; shift actions are refused outside a shift', () => {
    const { e, S } = loopShift();
    expect(reject(e, 'placeUnit', 'vent', 30, 30, 0)).toMatch(/running/i);
    const d = loopShift({ start: false });
    expect(reject(d.e, 'setSpeed', 4)).toMatch(/No shift/);
    expect(S().phase).toBe('shift');
  });
  it('tick outside a shift only advances the clock', () => {
    const { e, S } = loopShift({ start: false });
    const before = JSON.stringify(S().solved);
    must(e, 'tick', 50);
    expect(S().tick).toBeGreaterThanOrEqual(50); expect(JSON.stringify(S().solved)).toBe(before); expect(S().shift).toBeNull();
  });
});

describe('actuators and the debounced re-solve', () => {
  it('a compressor set point ramps at 2 %/s of its range and lands exactly on the goal', () => {
    const { e, L, S } = loopShift();
    const P = (): number => S().flowsheet.units.find((u) => u.id === L.ids.comp)!.params.P as number;
    must(e, 'setpoint', L.ids.comp, 'P', 1.5e7);
    const rate = 0.02 * (4e7 - 1e4);
    must(e, 'tick', 1); expect(P()).toBe(1e7 + rate);
    must(e, 'tick', 5); expect(P()).toBe(1e7 + 6 * rate);
    must(e, 'tick', 1); expect(P()).toBe(1.5e7);
    expect(Object.keys(S().shift!.ramps)).toEqual([]);
  });
  it('no re-solve while the ramp runs; one at its end; none without a boundary change', () => {
    const { e, L, S } = loopShift();
    must(e, 'setpoint', L.ids.comp, 'P', 1.5e7);
    must(e, 'tick', 6); expect(S().shift!.stat.solves).toBe(0);
    must(e, 'tick', 2); expect(S().shift!.stat.solves).toBe(1); expect(S().shift!.dirty).toBe(0);
    expect(S().shift!.solveFail).toBe('');
    must(e, 'tick', 500); expect(S().shift!.stat.solves).toBe(1);
    expect(S().solved!.streams[L.pipes.k_c!]!.P).toBe(1.5e7);
  });
  it('at most one re-solve per 30 plant seconds while a ramp is running, one per 5 otherwise', () => {
    const { e, L, S } = loopShift();
    // a slow ramp (100 Pa/s) stays alive for the whole 300 s: the network is re-solved at most every 30 s, and no more than a dozen times
    S().shift!.ramps['slow'] = { u: L.ids.comp!, k: 'P', to: 1.5e7, rate: 100 }; S().shift!.dirty = 1;
    for (let i = 0; i < 300; i++) must(e, 'tick', 1);
    expect(S().shift!.stat.solves).toBeLessThanOrEqual(11);
    expect(S().shift!.stat.solves).toBeGreaterThanOrEqual(9);
    // once the ramp is gone a boundary change is re-solved 5 s later, and a burst of changes cannot beat the 5 s debounce
    delete S().shift!.ramps['slow']; S().shift!.dirty = 0;
    const n0 = S().shift!.stat.solves;
    for (let i = 0; i < 100; i++) { if (i % 2 === 0) must(e, 'setpoint', L.ids.cool, 'utility', i % 4 === 0 ? 'cw' : 'refrig'); must(e, 'tick', 1); }
    expect(S().shift!.stat.solves - n0).toBeLessThanOrEqual(20);
  });
  it('set points are range-checked and teach; a choice set point is instant', () => {
    const { e, L, S } = loopShift();
    expect(reject(e, 'setpoint', L.ids.comp, 'P', 9e9)).toMatch(/runs from/);
    expect(reject(e, 'setpoint', L.ids.comp, 'nonsense', 1)).toMatch(/no knob/);
    expect(reject(e, 'setpoint', 'Z-999', 'P', 1)).toMatch(/no unit/i);
    must(e, 'setpoint', L.ids.cool, 'utility', 'refrig');
    expect(S().flowsheet.units.find((u) => u.id === L.ids.cool)!.params.utility).toBe('refrig');
    expect(S().shift!.dirty).toBe(1);
  });
  it('a feed flow ramps by a tenth of itself per second and updates the feed spec', () => {
    const { e, L, S } = loopShift();
    must(e, 'setpoint', L.ids.feed, 'flow', 2);
    must(e, 'tick', 1); expect(S().feeds[L.ids.feed!]!.flow).toBeCloseTo(1.2, 12);
    must(e, 'tick', 20); expect(S().feeds[L.ids.feed!]!.flow).toBe(2);
  });
});

describe('display lags', () => {
  it('every pipe lag weight is between the tau = 300 s and tau = 5 s weights', () => {
    const { S } = loopShift();
    for (const a of Object.values(S().shift!.al)) { expect(a).toBeGreaterThanOrEqual(alphaOf(300) - 1e-15); expect(a).toBeLessThanOrEqual(alphaOf(5) + 1e-15); }
  });
  it('after a feed surge the shown product rate rises monotonically toward the new steady state, never jumping', () => {
    const { e, S } = loopShift();
    queueEvent(S(), 'feed_surge', 10, 1.1);
    must(e, 'tick', 30);
    const t0 = prodKgS(S()), target = (): number => { let k = 0; for (const p of S().shift!.prod) S().solved!.streams[p.pipe]!.n.forEach((n, i) => { k += n * S().shift!.mw[i]!; }); return k; };
    expect(target()).toBeGreaterThan(t0 * 1.05);
    let last = t0;
    for (let i = 0; i < 3000; i++) { must(e, 'tick', 1); const v = prodKgS(S()); expect(v).toBeGreaterThanOrEqual(last - 1e-15); last = v; }
    expect(Math.abs(last - target()) / target()).toBeLessThan(5e-3);
  });
});

describe('events change the plant through its boundary conditions', () => {
  it('cw_pump_trip: the water-cooled cooler leaves hotter; cw_hot_day: about 8 K hotter', () => {
    const a = loopShift(), b = loopShift();
    const Tc = (s: EqState, id: string): number => s.solved!.streams[a.L.pipes.c_h!]!.T + 0 * id.length;
    const T0 = Tc(a.S(), '');
    queueEvent(a.S(), 'cw_pump_trip', 5, 0.3); queueEvent(b.S(), 'cw_hot_day', 5, 8);
    must(a.e, 'tick', 600); must(b.e, 'tick', 600);
    expect(T0).toBeCloseTo(320, 6);
    expect(Tc(a.S(), '')).toBeGreaterThan(345);
    const dT = Tc(b.S(), '') - T0;
    expect(dT).toBeGreaterThan(6); expect(dT).toBeLessThan(8.5);
  });
  it('feed_surge: +10 % feed gives about +10 % product; it ends and the plant returns to its old state', () => {
    const { e, S } = loopShift();
    const p0 = prodKgS(S());
    queueEvent(S(), 'feed_surge', 5, 1.1, 600);
    must(e, 'tick', 500); expect(prodKgS(S()) / p0).toBeGreaterThan(1.05); expect(prodKgS(S()) / p0).toBeLessThan(1.15);
    must(e, 'tick', 2000); expect(Math.abs(prodKgS(S()) / p0 - 1)).toBeLessThan(5e-3);
  });
  it('compressor_trip: flow collapses for a minute and recovers', () => {
    const { e, S } = loopShift();
    const p0 = prodKgS(S());
    queueEvent(S(), 'compressor_trip', 5, 0, 60);
    must(e, 'tick', 65); expect(S().shift!.mods.comp).toBe(1);
    must(e, 'tick', 5); expect(S().shift!.mods.comp).toBe(0);
    expect(feedMult(S().shift!)).toBe(1);
    must(e, 'tick', 1500); expect(Math.abs(prodKgS(S()) / p0 - 1)).toBeLessThan(5e-3);
    expect(S().shift!.stat.solves).toBeGreaterThanOrEqual(2);
  });
  it('valve_fails_closed: the stuck valve passes nothing, the recycle is gone, and the plant still solves', () => {
    const { e, L, S } = loopShift();
    queueEvent(S(), 'valve_fails_closed', 5, 0, 0, L.ids.valve!);
    must(e, 'tick', 30);
    expect(S().shift!.solveFail).toBe('');
    expect(S().solved!.streams[L.pipes.v_m!]!.n.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it('feed_inerts: the main feed carries the added argon (mole fractions still sum to 1)', () => {
    const { e, L, S } = loopShift();
    const ar = S().species.indexOf('Ar');
    const f0 = S().solved!.streams[L.pipes.f_m!]!, x0 = f0.n[ar]! / f0.n.reduce((a, b) => a + b, 0);
    queueEvent(S(), 'feed_inerts', 5, 0.04, 0, 'Ar');
    must(e, 'tick', 30);
    const f1 = S().solved!.streams[L.pipes.f_m!]!, tot = f1.n.reduce((a, b) => a + b, 0);
    expect(f1.n[ar]! / tot).toBeCloseTo((x0 + 0.04) / 1.04, 9);
    expect(tot).toBeCloseTo(f0.n.reduce((a, b) => a + b, 0), 9);
  });
  it('effective units: blocked valve flag, bed activity = base x age x poison x sintering, cw cooler formula', () => {
    const s = cstrShift();
    const sh = s.shift!;
    s.flowsheet.units.push({ id: 'B-1', type: 'packed_bed', pos: { x: 20, y: 20 }, rot: 0, params: { activity: 0.8 } }, { id: 'V-9', type: 'valve', pos: { x: 24, y: 20 }, rot: 0, params: { P: 1e5 } });
    sh.io['B-1'] = ['', '', s.flowsheet.units.length - 2]; sh.io['V-9'] = ['', '', s.flowsheet.units.length - 1];
    sh.db['B-1'] = { T: 700, a: 0.9, over: 0, Tss: 700, Tpk: 700, alpha: 0.1, Tm: 1e9, as: 0.9 };
    sh.mods.act = 0.9; sh.mods.actBed['B-1'] = 0.6; sh.mods.blocked = ['V-9'];
    const u = effectiveUnits(s, sh);
    expect(u.find((x) => x.id === 'B-1')!.params.activity).toBeCloseTo(0.8 * 0.9 * 0.6 * 0.9, 4);
    expect(u.find((x) => x.id === 'V-9')!.params.blocked).toBe(1);
    expect(s.flowsheet.units.find((x) => x.id === 'B-1')!.params.activity).toBe(0.8);
  });
});

describe('interlocks, trips and the safe state', () => {
  it('L00 shape: the pump trips at 20 s, the interlock on the cooler outlet trips within seconds, the feed is cut, an incident is captured', () => {
    const { e, S, il } = loopShift({ ilk: 340 });
    const p0 = prodKgS(S());
    queueEvent(S(), 'cw_pump_trip', 20, 0.3);
    must(e, 'tick', 19); expect(Object.keys(S().shift!.trips)).toEqual([]);
    must(e, 'tick', 40);
    const sh = S().shift!;
    expect(Object.keys(sh.trips)).toEqual([il]);
    expect(sh.trips[il]!.act).toBe('cut_feed'); expect(sh.trips[il]!.by).toBe(il);
    expect(sh.trips[il]!.t).toBeGreaterThanOrEqual(20); expect(sh.trips[il]!.t).toBeLessThan(40);
    expect(sh.incident?.kind).toBe('trip'); expect(sh.incident!.frames.length).toBeGreaterThan(0); expect(sh.stat.tripN).toBe(1);
    expect(feedMult(sh)).toBeCloseTo(0.6 * 0 + SAFE_FLOW * sh.mods.feed * sh.mods.motors, 12);
    must(e, 'tick', 2400);
    expect(prodKgS(S())).toBeLessThan(0.02 * p0);   // safe state: almost nothing leaves
    expect(S().log.some((l) => /Trip/.test(l.text))).toBe(true);
    expect(S().status).toBe('playing');
  });
  it('resetTrip is refused while the cause is still there and allowed once it is gone', () => {
    const { e, S, il } = loopShift({ ilk: 340 });
    const p0 = prodKgS(S());
    queueEvent(S(), 'cw_pump_trip', 5, 0.3);
    must(e, 'tick', 60);
    expect(reject(e, 'resetTrip', il)).toMatch(/cause is still there/);
    must(e, 'setpoint', il, 'setpoint', 600); must(e, 'tick', 1);
    must(e, 'resetTrip', il);
    expect(S().shift!.trips[il]).toBeUndefined();
    expect(S().shift!.dirty).toBe(1);
    expect(reject(e, 'resetTrip', il)).toMatch(/not tripped/);
    must(e, 'tick', 2000);
    expect(prodKgS(S())).toBeGreaterThan(0.5 * p0);   // production is back (the cooling trip is still on: less than before)
  });
  it('a disarmed interlock (set point 0) never trips', () => {
    const { e, S } = loopShift({ ilk: 0 });
    queueEvent(S(), 'cw_pump_trip', 5, 0.3);
    must(e, 'tick', 300);
    expect(Object.keys(S().shift!.trips)).toEqual([]);
  });
  it('manual trip of a compressor cuts the flow; of a unit with no trip is refused; double trips are refused', () => {
    const { e, L, S } = loopShift();
    const p0 = prodKgS(S());
    expect(reject(e, 'trip', L.ids.mix)).toMatch(/no trip/);
    must(e, 'trip', L.ids.comp);
    expect(reject(e, 'trip', L.ids.comp)).toMatch(/already tripped/);
    must(e, 'tick', 2400);
    expect(prodKgS(S())).toBeLessThan(0.02 * p0);
    must(e, 'resetTrip', L.ids.comp);
    must(e, 'tick', 2500);
    expect(Math.abs(prodKgS(S()) / p0 - 1)).toBeLessThan(0.01);
  });
  it('a tripped feed unit stops only that feed', () => {
    const { e, L, S } = loopShift();
    must(e, 'trip', L.ids.feed2);
    must(e, 'tick', 20);
    const eff = effectiveUnits(S(), S().shift!);
    expect(eff.find((u) => u.id === L.ids.feed2)!.params.flow).toBeCloseTo(0.5 * SAFE_FLOW, 12);
    expect(eff.find((u) => u.id === L.ids.feed)!.params.flow).toBeCloseTo(1, 12);
  });
});

describe('the L24 reactor: runaway, relief, trip', () => {
  const trip = (s: EqState): void => queueEvent(s, 'cw_pump_trip', s.shift!.t + 1, 0.3);
  it('a plant on the upper branch sits still: 117 C, no alarm, cruise clock', () => {
    const s = cstrShift({ hot: true });
    run(s, 600);
    expect(Math.abs(TdegC(s) - 117.004)).toBeLessThan(0.05);
    expect(s.shift!.mon.every((m) => m.tier === 0)).toBe(true); expect(s.shift!.scale).toBe(0);
  });
  it('cooling-water trip: the reactor climbs, High then Critical alarms, the clock drops to watch then real time, the relief lifts at 140 C and holds it', () => {
    const s = cstrShift({ hot: true, orifice: 'T' });
    const sh = s.shift!;
    run(s, 50); trip(s);
    const seen = new Set<number>();
    let peak = 0;
    run(s, 600, () => { seen.add(sh.scale); peak = Math.max(peak, TdegC(s)); });
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(sh.stat.reliefN).toBe(1); expect(sh.rv['V-1']!.open).toBe(1);
    expect(peak).toBeLessThan(140.5); expect(TdegC(s)).toBeGreaterThan(139.5);
    expect(sh.incident?.kind === 'relief' || sh.incident?.kind === 'critical').toBe(true);
    expect(s.status).toBe('playing');
  });
  it('the relief reseats 5 K below its set point once the cooling is back', () => {
    const s = cstrShift({ hot: true, orifice: 'T' });
    const sh = s.shift!;
    run(s, 50); trip(s);
    run(s, 300);
    expect(sh.rv['V-1']!.open).toBe(1);
    sh.act = []; sh.mods.cwUa = 1; sh.dirty = 1;       // the pump is back
    run(s, 900);
    expect(sh.rv['V-1']!.open).toBe(0); expect(TdegC(s)).toBeLessThan(140 - 5 + 0.5);
  });
  it('an undersized relief cannot hold it: the material limit is crossed, containment is lost, the shift ends with a reason key', () => {
    const s = cstrShift({ hot: true, orifice: 'D', Tlim: 415 });
    const sh = s.shift!;
    run(s, 50); trip(s);
    run(s, 900);
    expect(s.status).toBe('lost'); expect(s.statusReason).toBe('shift.loss.temperature');
    expect(s.phase).toBe('report'); expect(sh.ended).toBe('loss'); expect(sh.incident?.kind).toBe('loss'); expect(sh.incident!.unit).toBe('R-1');
    const t = s.tick;
    run(s, 10); expect(s.tick).toBe(t);
  });
  it('a trip at 125 C that cuts the feed holds it (relief never lifts, peak below 126 C)', () => {
    const s = cstrShift({ hot: true, orifice: 'D', ilk: { setpoint: 398.15 } });
    const sh = s.shift!;
    run(s, 50); trip(s);
    let peak = 0;
    run(s, 600, () => { peak = Math.max(peak, TdegC(s)); });
    expect(peak).toBeLessThan(126.5); expect(sh.stat.reliefN).toBe(0); expect(sh.stat.tripN).toBe(1); expect(s.status).toBe('playing');
    expect(TdegC(s)).toBeLessThan(60);
  });
  it('Learner: an unacknowledged Critical raises the auto-pause flag and the real-time clock; acknowledging drops both', () => {
    const s = cstrShift({ hot: true, orifice: 'T', mode: 'learner' });
    const sh = s.shift!;
    run(s, 50); trip(s);
    let step = 0;
    while (sh.paused === 0 && step++ < 600) run(s, 1);
    expect(sh.paused).toBe(1); expect(sh.scale).toBe(2);
    for (const m of sh.mon) m.ack = 1;
    run(s, 1);
    expect(sh.paused).toBe(0); expect(sh.scale).toBe(1);
  });
  it('Learner: an automatic interlock cuts the feed at 90 % of the margin (before the relief point)', () => {
    const s = cstrShift({ hot: true, orifice: 'D', mode: 'learner' });
    const sh = s.shift!;
    run(s, 50); trip(s);
    run(s, 600);
    expect(Object.keys(sh.trips)).toEqual(['auto.R-1']); expect(sh.trips['auto.R-1']!.by).toBe('auto');
    expect(sh.stat.reliefN).toBe(0); expect(s.status).toBe('playing');
  });
  it('an engineer-mode plant has no automatic interlock: the same trip reaches the relief', () => {
    const s = cstrShift({ hot: true, orifice: 'T', mode: 'engineer' });
    run(s, 50); trip(s); run(s, 600);
    expect(Object.keys(s.shift!.trips)).toEqual([]); expect(s.shift!.stat.reliefN).toBe(1);
  });
});

describe('relief valve on a gas vessel', () => {
  it('lifts at its set pressure, holds the vessel there, releases mass, reseats 7 % below once the set pressure is raised, and the pressure recovers', () => {
    const { e, L, S } = loopShift({ relief: 9e6 });
    const sep = L.ids.sep!, rv = L.ids.relief!;
    expect(S().shift!.dv[sep]).toBeDefined();
    must(e, 'tick', 200);
    const sh = S().shift!;
    expect(sh.rv[rv]!.open).toBe(1); expect(sh.stat.reliefN).toBe(1); expect(sh.incident?.kind === 'relief' || sh.incident?.kind === 'critical').toBe(true);
    expect(Math.abs(sh.dv[sep]!.P - 9e6)).toBeLessThan(1e3);
    expect(sh.rv[rv]!.kg).toBeGreaterThan(0);
    must(e, 'setpoint', rv, 'Pset', 1.2e7);
    must(e, 'tick', 5);
    expect(S().shift!.rv[rv]!.open).toBe(0);
    must(e, 'tick', 2000);
    const v = S().shift!.dv[sep]!;
    expect(Math.abs(v.P - v.Pss) / v.Pss).toBeLessThan(5e-3);
    expect(S().status).toBe('playing');
  });
  it('a relief set above the operating pressure stays shut through a feed surge', () => {
    const { e, L, S } = loopShift({ relief: 1.25e7 });
    queueEvent(S(), 'feed_surge', 5, 1.1);
    must(e, 'tick', 1500);
    expect(S().shift!.rv[L.ids.relief!]!.open).toBe(0);
    expect(S().shift!.stat.reliefN).toBe(0);
  });
});

describe('interlock safe states', () => {
  it('full coolant: the trip stronger-cools the reactor jacket (colder, bigger), so the peak is lower than without it', () => {
    const peak = (ilk?: { setpoint: number; action: string }): { peak: number; act: string } => {
      const s = cstrShift({ hot: true, orifice: 'D', ...(ilk ? { ilk } : {}) });
      run(s, 50); queueEvent(s, 'cw_pump_trip', s.shift!.t + 1, 0.3);
      let p = 0; run(s, 150, () => { p = Math.max(p, TdegC(s)); });
      return { peak: p, act: s.shift!.trips['I-1']?.act ?? '' };
    };
    const with_ = peak({ setpoint: 398.15, action: 'full_coolant' }), without = peak();
    expect(with_.act).toBe('full_coolant');
    expect(with_.peak).toBeLessThan(without.peak - 3);
  });
  it('dump and cut-feed both put every feed at the safe flow fraction', () => {
    const s = cstrShift();
    const sh = s.shift!;
    sh.trips.a = { act: 'dump', t: 0, by: 'a' };
    expect(feedMult(sh)).toBe(SAFE_FLOW);
    sh.trips = { b: { act: 'cut_feed', t: 0, by: 'b' } };
    expect(feedMult(sh)).toBe(SAFE_FLOW);
    sh.trips = { c: { act: 'full_coolant', t: 0, by: 'c' } };
    expect(feedMult(sh)).toBe(1);
  });
});

describe('containment', () => {
  it('pressure above 1.5 x design ends the shift (status lost, reason key, report phase); later ticks are refused', () => {
    const { e, S } = loopShift({ pdes: 4e6 });
    must(e, 'tick', 5);
    expect(S().status).toBe('lost'); expect(S().statusReason).toBe('shift.loss.pressure');
    expect(S().phase).toBe('report'); expect(S().shift!.ended).toBe('loss'); expect(S().shift!.incident?.kind).toBe('loss');
    expect(S().tick).toBeLessThanOrEqual(2);
    expect(reject(e, 'tick', 5)).toMatch(/over/);
  });
  it('a plant inside its design pressure runs a whole quiet shift without loss', () => {
    const { e, S } = loopShift({ events: false });
    must(e, 'tick', 5000);
    expect(S().status).toBe('playing');
  });
});

describe('persistence', () => {
  it('the shift state is plain JSON: every number finite, a JSON round trip changes nothing, mid-incident too', () => {
    const { e, S } = loopShift({ events: true, ilk: 340, seed: 5 });
    queueEvent(S(), 'cw_pump_trip', 20, 0.3);
    must(e, 'tick', 300);
    expect(S().shift!.incident).not.toBeNull();
    const back = JSON.parse(JSON.stringify(S())) as EqState;
    expect(hashOf(back)).toBe(hashOf(S()));
    const bad: string[] = [];
    const walk = (v: unknown, p: string): void => { if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(p); } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p + '.' + k); };
    walk(S().shift, 'shift'); expect(bad).toEqual([]);
  });
  it('save then load mid-shift continues bit-identically to a run that never stopped', () => {
    const a = loopShift({ events: true, ilk: 340, seed: 9 }), b = loopShift({ events: true, ilk: 340, seed: 9 });
    for (const x of [a, b]) queueEvent(x.S(), 'cw_pump_trip', 50, 0.3);
    must(a.e, 'tick', 70); must(b.e, 'tick', 70);
    must(b.e, 'save', 'slot2');
    must(a.e, 'tick', 200);
    must(b.e, 'tick', 5); must(b.e, 'load', 'slot2'); must(b.e, 'tick', 200);
    expect(hashOf(b.S())).toBe(hashOf(a.S()));
  });
});

describe('records, accumulators and budgets', () => {
  it('econ accumulates per plant second: product mass equals rate x time on a quiet plant', () => {
    const { e, S } = loopShift();
    const rate = prodKgS(S());
    must(e, 'tick', 1000);
    expect(S().shift!.acc.prodKg).toBeCloseTo(rate * 1000, 6);
    expect(S().shift!.acc.offKg).toBe(0);
    expect(S().shift!.acc.cost).toBeCloseTo((S().shift!.rates.opex * 1000) / 3600, 6);
    expect(S().shift!.acc.co2Kg).toBeCloseTo((S().shift!.rates.co2 * 1000) / 3600, 6);
  });
  it('a product below its spec is off-spec production', () => {
    const strict = loopShift({ start: false }), lax = loopShift({ start: false });
    for (const [x, min] of [[strict, 1.5], [lax, 0.5]] as const) {
      x.S().flowsheet.units.find((u) => u.id === x.L.ids.prod)!.params.spec = 'NH3';
      x.S().flowsheet.units.find((u) => u.id === x.L.ids.prod)!.params.specMin = min;
      must(x.e, 'startShift', 'shift', false); must(x.e, 'tick', 300);
    }
    expect(strict.S().shift!.acc.prodKg).toBe(0); expect(strict.S().shift!.acc.offKg).toBeGreaterThan(0);
    expect(lax.S().shift!.acc.offKg).toBe(0); expect(lax.S().shift!.acc.prodKg).toBeGreaterThan(0);
    expect(strict.S().shift!.acc.offKg).toBeCloseTo(lax.S().shift!.acc.prodKg, 12);
  });
  it('replay ring keeps the last 60 s; trends sample every 30 s; both bounded', () => {
    const { e, S } = loopShift();
    must(e, 'tick', 100);
    expect(S().replay).toHaveLength(60); expect(S().replay[59]!.t).toBe(100); expect(S().replay[0]!.t).toBe(41);
    expect(S().trends.product_kg_s).toHaveLength(3);
    for (const f of S().replay) { expect(f.T).toHaveLength(S().flowsheet.units.length); expect(f.P).toHaveLength(S().flowsheet.units.length); }
  });
  it('a full 8-hour shift: trends capped at 960 samples, replay at 60, state under 256 KB, no events needed', () => {
    const { e, S } = loopShift({ events: false });
    for (let i = 0; i < 3; i++) must(e, 'tick', 9600);
    expect(S().phase).toBe('report');
    for (const k of Object.keys(S().trends)) expect(S().trends[k]!.length).toBeLessThanOrEqual(960);
    expect(S().trends.tmax_K).toHaveLength(960); expect(S().replay).toHaveLength(60);
    expect(JSON.stringify(S()).length).toBeLessThan(256 * 1024);
  });
  it('a full shift with events and an incident stays under 256 KB too', () => {
    const { e, S } = loopShift({ events: true, ilk: 340, seed: 11 });
    queueEvent(S(), 'cw_pump_trip', 100, 0.3);
    for (let i = 0; i < 3; i++) must(e, 'tick', 9600);
    expect(S().shift!.incident).not.toBeNull();
    expect(JSON.stringify(S()).length).toBeLessThan(256 * 1024);
  });
  it('pinned readouts add trend series (at most 3)', () => {
    const { e, S, L } = loopShift();
    for (const w of [`P:${L.ids.comp}`, `P:${L.ids.sep}`, 'T:nothing']) must(e, 'pin', w);
    must(e, 'tick', 60);
    expect(S().trends[`P:${L.ids.comp}`]).toHaveLength(2);
    expect(Object.keys(S().trends).filter((k) => /^[TP]:/.test(k)).length).toBeLessThanOrEqual(3);
  });
  it('tick cost: under 0.1 ms per plant second (quiet 12-unit plant, 8-hour shift, re-solves excluded: none are needed)', () => {
    const { e, S } = loopShift({ events: false });
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) must(e, 'tick', 9600);
    const per = (performance.now() - t0) / 28800;
    expect(S().shift!.stat.solves).toBe(0);
    expect(per).toBeLessThan(0.1);
  });
  it('the snapshot carries alarms, the clock with its scale, lagged unit values and stays small', () => {
    const { e, S, il } = loopShift({ ilk: 340 });
    queueEvent(S(), 'cw_pump_trip', 5, 0.3);
    must(e, 'tick', 120);
    const snap = snapshotOf(S()) as { clock: { t: number; scale: number }; alarms: unknown[]; shift: { trips: string[] }; units: { id: string; T: number }[] };
    expect(snap.clock.t).toBe(120);
    expect(snap.shift.trips).toEqual([il]);
    expect(JSON.stringify(snap).length).toBeLessThan(8 * 1024);
    const cool = snap.units.find((u) => u.T > 330 && u.T < 380);
    expect(cool).toBeDefined();
  });
});
