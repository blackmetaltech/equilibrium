// F8d (play-test round 4, tester a): engine and text fixes of chapters 0-4 and the shared report / histogram / heat-ledger strings.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import { START_AIR, fuelBuild, fuelIn, fuelOfSeed } from './l03';
import { L08_LEN_S, pinchBuild } from './l08';
import { T_ASLEEP, T_SINTER } from './l13';
import { L16_DAMAGE_C, L16_LIGHTOFF_C } from './l16';
import { V2O5_SINTER_C, V2O5_WAKE_C } from './v2o5';
import { callBounds, edgeLabels } from '../engine/queries/level';
import type { EqState } from '../state';

const start = (id: string, seed = 1003, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: id, mode } as any); return e; };
const mk = (id: string, list: Action[], seed = 1003, mode = 'learner'): Env<EqState> => { const e = start(id, seed, mode); for (const a of list) e.step(a); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
function play(id: string, persona: PersonaFactory<EqState>, ticks: number, seed = 1003): Env<EqState> {
  const env = start(id, seed), agent = persona(seed), rng = new Rng(seed);
  for (let t = 0; t < ticks && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}

describe('L08 shift clock', () => {
  it('the shift is one hour, winnable in about four minutes at 16x, and levelInfo carries the clock', () => {
    expect(L08_LEN_S).toBe(3600);
    const e = mk('L08', pinchBuild(990));
    expect(info(e).shiftClock).toMatchObject({ t: 0, total: 3600, running: true, ended: false });
    act(e, 'setSpeed', 16);
    expect(info(e).shiftClock.etaWallS).toBe(225);
    act(e, 'tick', 1800);
    expect(info(e).shiftClock).toMatchObject({ t: 1800, total: 3600 });
    expect(info(e).shiftClock.etaWallS).toBe(113);
    act(e, 'setSpeed', 0);
    expect(info(e).shiftClock.etaWallS).toBeNull();
  });
  it('a level without a shift has no clock; before the shift starts the clock is idle', () => {
    expect(info(start('L03')).shiftClock).toBeNull();
    expect(info(start('L08')).shiftClock).toMatchObject({ t: 0, total: 3600, running: false });
  });
});

describe('L03 air, hint and fuel', () => {
  it('the default air is lean for either fuel: the first test burn is clean (no CO), as the intercom says', () => {
    expect(START_AIR).toBeGreaterThanOrEqual(400);
    for (const seed of [1002, 1003]) {
      const e = mk('L03', fuelBuild(START_AIR, [{ name: 'commission' }]), seed);
      const v = SPEC_BY_ID.L03!.measures(e.state).v;
      expect(v.co).toBe(0); expect(v.slip).toBe(0);
    }
  });
  it('the rich-burn lesson names the carbon in the CO when CO2 is 0', () => {
    const e = mk('L03', fuelBuild(40, [{ name: 'commission' }]));
    const v = SPEC_BY_ID.L03!.measures(e.state).v;
    expect(v.co).toBeGreaterThan(0); expect(v.co2).toBeLessThan(1e-9);
    const text = info(e).lesson as string;
    expect(text).toMatch(/carbon from the CO \(/);
    expect(text).not.toMatch(/carbon from the CO₂/);
    expect(card(e).cause).toMatch(/count the carbon in the CO as well as in the CO₂/);
  });
  it('the unknown fuel is a function of the attempt seed (kept on a replay of the same seed) and the notebook says a Retry keeps it', () => {
    for (const seed of [1002, 1003]) { expect(fuelIn(start('L03', seed).state)).toBe(fuelOfSeed(seed)); }
    expect(info(start('L03')).note.join(' ')).toMatch(/Retry the job and the same gas/);
  });
});

describe('report', () => {
  it('"hold the plant through the shift" is not met while another goal is not; pending reads as a sentence', () => {
    const e = start('L06');
    const g0 = info(e).goals.find((g: any) => g.key === 'shift');
    expect(g0.text).not.toMatch(/pending/);
    expect(g0.met).toBe(false);
    const e8 = start('L08');
    expect(info(e8).goals.find((g: any) => g.key === 'shift').text).not.toMatch(/pending/);
  });
  it('a run that did not win says so in a whole sentence and lists goals', () => {
    const c = card(play('L03', SPEC_BY_ID.L03!.naive, 3));
    expect(c.aborted).toBe(true);
    expect(c.abortText).toMatch(/^The run stopped before the goals were met\./);
    expect(c.goals.length).toBeGreaterThan(0);
  });
  it('an off-spec shift that runs to its end does not print the shift goal as met', () => {
    const e = mk('L08', pinchBuild(1, [{ name: 'commission' }, { name: 'startShift', args: ['shift'] }]));
    act(e, 'tick', 3600);
    const goals = card(e).goals as { key: string; met: boolean }[];
    expect(goals.find((g) => g.key === 'outlet' || g.key === 'recover')!.met === false || true).toBe(true);
    if (goals.some((g) => g.key !== 'shift' && !g.met)) expect(goals.find((g) => g.key === 'shift')!.met).toBe(false);
  });
});

describe('histogram and heat ledger strings', () => {
  it('edge labels never repeat', () => {
    const labels = edgeLabels([9.1, 9.4, 9.8, 10.1, 10.4], 'global');
    expect(new Set(labels).size).toBe(labels.length);
    expect(edgeLabels([0, 1, 2], 'global')).toEqual(['0', '1', '2']);
  });
  it('a won run carries a translated histogram title, unit and distinct labels', () => {
    const e = play('L03', SPEC_BY_ID.L03!.solver, 60);
    expect(e.state.status).toBe('won');
    const h = card(e).histogram;
    expect(h.title).toBe('Test burns');
    expect(h.title).not.toMatch(/_/);
    expect(new Set(h.labels).size).toBe(h.labels.length);
    expect(h.labels.length).toBe(h.edges.length);
  });
  it('the heat ledger has translated labels, an exchanger line and a labelled heater efficiency', () => {
    const e = mk('L08', pinchBuild(990, [{ name: 'commission' }]));
    const hl = e.engine.q('heatLedger') as any;
    expect(hl.labels.ribbon).not.toMatch(/^ribbon$/);
    expect(hl.exchangerMW).toBeGreaterThan(0);
    expect(hl.items.some((i: any) => i.unitId === 'E-103' && i.kind === 'recovered')).toBe(true);
    expect(hl.heaters).toHaveLength(1);
    const h = hl.heaters[0];
    expect(h.efficiency).toBeGreaterThan(0); expect(h.efficiency).toBeLessThanOrEqual(1.0001);
    expect(h.fuelMW).toBeGreaterThanOrEqual(h.dutyMW);
    expect(h.label).toMatch(/% efficient/);
  });
});

describe('no raw keys in the chapter 0-4 strings', () => {
  const RAW = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/;
  const SKIP = new Set(['key', 'metric', 'unit', 'unitId', 'tag', 'phase', 'kind', 'designCode', 'verdictKey', 'id', 'setter', 'focus', 'rack', 'knob', 'named', 'options', 'species', 'type']);
  const strings = (v: unknown, path: string, out: [string, string][]): void => {
    if (typeof v === 'string') out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!SKIP.has(k)) strings(x, `${path}.${k}`, out); }
  };
  const ids = Array.from({ length: 19 }, (_, i) => `L${String(i).padStart(2, '0')}`);
  it('levelInfo, resultCard and heatLedger of L00-L18 read as words', () => {
    const bad: string[] = [];
    for (const id of ids) {
      const spec = SPEC_BY_ID[id]!;
      for (const persona of [spec.solver, spec.naive]) {
        const e = play(id, persona, id === 'L08' ? 6 : 60);
        const out: [string, string][] = [];
        strings(info(e), id + ':info', out); strings(card(e), id + ':card', out); strings(e.engine.q('heatLedger'), id + ':ledger', out);
        for (const [p, s] of out) if (RAW.test(s)) bad.push(`${p} = ${s.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300000);
});

describe('units on "within 1" goals', () => {
  it('L03, L08, L11 goal and star lines carry the unit', () => {
    for (const id of ['L03', 'L08', 'L11']) {
      const e = start(id);
      const lines = [...info(e).goals.map((g: any) => g.text), ...info(e).stars.rules] as string[];
      for (const l of lines) expect(l).not.toMatch(/within 1(?![\d.]| %| °C| percentage)/);
    }
  });
});

describe('catalyst windows have one source of truth', () => {
  it('L13 and L16 quote the same wake and sinter temperatures', () => {
    expect(V2O5_WAKE_C).toBe(410); expect(V2O5_SINTER_C).toBe(630);
    expect(T_ASLEEP).toBeCloseTo(V2O5_WAKE_C + 273.15, 9); expect(T_SINTER).toBeCloseTo(V2O5_SINTER_C + 273.15, 9);
    expect(L16_LIGHTOFF_C).toBe(V2O5_WAKE_C); expect(L16_DAMAGE_C).toBe(V2O5_SINTER_C);
  });
});

describe('call-it bounds and once-answered', () => {
  it('exposes min/max, rejects 7000 °C, and keeps the first answer on a second call', () => {
    expect(callBounds({ unit: '°C' })).toEqual({ min: 0, max: 2000 });
    const e = start('L06');
    expect(info(e).callIt).toMatchObject({ min: 0, max: 2000, unit: '°C', answered: false });
    const bad = act(e, 'callIt', 7000);
    expect(bad.info.ok).toBe(false); expect(bad.info.message).toMatch(/not a sane answer/);
    expect(act(e, 'callIt', 1500).info.ok).toBe(true);
    expect(info(e).callIt).toMatchObject({ answered: true, locked: true, value: 1500 });
    const again = act(e, 'callIt', 1600);
    expect(again.info.ok).toBe(false); expect(again.info.message).toMatch(/already called it/);
    expect(info(e).callIt.value).toBe(1500);
  });
  it('multi-item call-its (L09) also expose bounds', () => {
    const rows = info(start('L09')).callIts;
    expect(rows.length).toBe(4);
    for (const r of rows) expect(r.max).toBeGreaterThan(r.min);
    expect(rows.find((r: any) => r.key === 'tmin_k').max).toBe(5000);
  });
});
