// F14 round-7 (Ch1-2) fixes: L09 exam rows each grade their own item; L09 item 3 gives its data; L04 named call; L05 lesson product agrees.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { truthOf } from './l09';

const mk = (level: string): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode: 'learner' }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');

describe('F14 chapter 1-2', () => {
  it('L09: the bomb row keeps its own answer when the exam rows are typed after it', () => {
    const e = mk('L09');
    e.step({ name: 'callIt', args: [Math.round(truthOf('du_ch4') * 10) / 10, 'du_ch4'] } as any);
    e.step({ name: 'callIt', args: [1000, 'heat_co2'] } as any);
    e.step({ name: 'callIt', args: [37.6, 'du_vap'] } as any);
    const rows = info(e).callIts as any[];
    expect(rows.find((r) => r.key === 'du_ch4').value).toBeCloseTo(truthOf('du_ch4'), 0);
    const g = (info(e).goals as any[]).find((x) => x.key === 'du');
    expect(g.value).toBeCloseTo(truthOf('du_ch4'), 0);
  });
  it('L09: item 3 states its ΔH and ΔS before the run', () => {
    const r = (info(mk('L09')).callIts as any[]).find((x) => x.key === 'tmin_k');
    expect(r.prompt).toMatch(/ΔH = \+\d+/); expect(r.prompt).toMatch(/ΔS = \+0\.2/);
  });
  it('L04: the call offers the limiting-reagent chips and grades the name', () => {
    const e = mk('L04');
    const c = info(e).callIt;
    expect(c.options).toEqual(expect.arrayContaining(['N2', 'H2']));
    e.step({ name: 'callIt', args: [100, 'N2'] } as any);
    expect(info(e).callIt.named).toBe('N2');
  });
  it('L03: the predict note says a call after a test burn is allowed', () => {
    expect(info(mk('L03')).predictNote).toMatch(/after a test burn/);
  });
});

describe('F14 L24 checklist', () => {
  it('the feed row does not tick at the full 260.6 kmol/h charge, only at 182', () => {
    const e = mk('L24');
    e.step({ name: 'commission', args: [] } as any);
    e.step({ name: 'startShift', args: ['shift'] } as any);
    const row = (): any => (info(e).buildGuide as any[]).find((r) => r.id === 'feed');
    expect(row().done).toBe(false);
  });
});

describe('F14 L22 checklist', () => {
  it('the checklist first knob (220 °C, 6000 kg, purge as set) meets the goals but not the calibrated best', async () => {
    const { methanolScript, L22_FIRST } = await import('./l22');
    const { SPEC_BY_ID } = await import('./registry');
    const e = mk('L22');
    for (const a of methanolScript(L22_FIRST.TcC + 273.15, L22_FIRST.W, 0.2, true)) e.step(a as any);
    expect((info(e).buildGuide as any[]).every((r) => r.done)).toBe(true);
    const sp = SPEC_BY_ID.L22!, m = sp.measures(e.state), g = sp.goals(e.state, m);
    expect(g.every((x) => x.met)).toBe(true);
    expect(sp.extraStars(e.state, m, g)[1]).toBe(false);
  });
});

describe('F14 feed knob', () => {
  it('a shift setpoint on a feed moves its card knob (round 7: knob stuck at 260.6 with the feed at 182)', () => {
    const e = mk('L24');
    const act = (name: string, args: unknown[] = []) => e.step({ name, args } as any);
    act('commission'); act('startShift', ['shift']); act('setpoint', ['F-101', 'flow', 182 / 3.6]); act('tick', [600]);
    const k = (e.engine.q('unitCard', ['F-101']) as any).knobs.find((x: any) => x.key === 'flow');
    expect(k.disp.value).toBeCloseTo(182, 3);
  });
});

// R9-a: the star-3 flask states its number (no "calibrated threshold"), in every region.
describe('R9-a: star-3 flasks state their threshold', () => {
  for (const id of ['L05', 'L06', 'L08']) for (const region of ['global', 'in']) it(`${id} (${region})`, () => {
    const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode: 'learner', region } as any);
    const r = (e.engine.q('levelInfo') as any).stars.rules[2] as string;
    expect(r).not.toMatch(/calibrated|\{/);
    expect(r).toMatch(/\d/);
  });
});

// Round-10 screenshot of L39: the call-it prompt showed "{q}" and "{old}", and the note promised a star no rule gives.
import { SPECS } from './registry';
import { callEarnsStar } from '../engine/queries/level';
describe('every level: no raw placeholders in notes, stars or call-its; the predict note matches the stars', () => {
  for (const spec of SPECS.filter((x) => x.id !== 'CAREER')) it(spec.id, () => {
    const e = new Env(GAME); e.reset({ seed: 1003, level: spec.id, mode: 'learner' } as any);
    const li = e.engine.q('levelInfo') as any;
    const texts: string[] = [...(li.note ?? []), ...(li.stars?.rules ?? []), li.predictNote ?? '', li.callIt?.prompt ?? '', ...((li.callIts ?? []) as any[]).map((c) => c.prompt)];
    for (const x of texts) expect(x, x).not.toMatch(/\{[a-zA-Z_]\w*\}/);
    if (spec.callIt) expect(/earns a star/.test(li.predictNote)).toBe(callEarnsStar(spec));
  });
});
