// Engine-level tests of the EQUILIBRIUM skeleton: empty plant, carry-over, plant query, invariants, determinism, saves, protocol,
// and (through a TEST-LOCAL GameDef with one made-up level) core's solvability, persona and golden machinery on our state shape.
import { describe, expect, it } from 'vitest';
import { Engine, Env, MemoryKV, checkAllLevels, createProtocol, fail, need, play, type GameDef, type Level } from '@core/kit';
import { goldenFile, trajectory } from '@core/kit/golden';
import { GAME } from './game';
import { PERSONAS } from './personas';
import type { EqState } from './state';

/** A level that exists only in this file: pin three of four widgets in time, never touch the trap. */
const WIDGETS = ['a', 'b', 'c', 'd'];
const testLevel: Level<EqState> = {
  id: 'T1', title: 'Test level', brief: 'Pin three widgets.',
  setup: () => {},
  goal: (s) => s.ui.pinned.length >= 3,
  fail: (s) => (s.ui.coachStep === 'trap' ? 'Trap sprung.' : null),
  maxTicks: 40,
  solver: () => (s) => { const w = WIDGETS.find((x) => !s.ui.pinned.includes(x)); return w ? [{ name: 'testPin', args: [w] }] : []; },
};
const TEST: GameDef<EqState> = {
  ...GAME, levels: [testLevel],
  personas: { ...PERSONAS, solver: testLevel.solver! },
  actions: {
    testPin: (s, w: unknown) => { need(typeof w === 'string' && WIDGETS.includes(w), 'Unknown widget.'); if (s.ui.pinned.includes(w as string)) fail('Already pinned.'); s.ui.pinned.push(w as string); },
    testTrap: (s) => { s.ui.coachStep = 'trap'; },
  },
  legalActions: () => [...WIDGETS.map((w) => ({ name: 'testPin', args: [w] })), { name: 'testTrap' }],
  metrics: (s) => ({ pinned: s.ui.pinned.length, ticks: s.tick - s.levelStart }),
};

describe('EquilibriumState skeleton', () => {
  it('a new game is an empty plant in the design phase', () => {
    const s = new Engine(GAME).state;
    expect(GAME.id).toBe('equilibrium'); expect(GAME.title).toBe('EQUILIBRIUM');
    expect(GAME.saveVersion).toBe(1); expect(GAME.rulesetVersion).toBe(1);
    expect(s.phase).toBe('design'); expect(s.thermoDetail).toBe('rigorous'); expect(s.species).toEqual([]);
    expect(s.flowsheet).toEqual({ units: [], streams: [], nextId: 1 });
    expect(s.feeds).toEqual({}); expect(s.solved).toBeNull(); expect(s.shift).toBeNull(); expect(s.prediction).toBeNull();
    expect(s.trends).toEqual({}); expect(s.replay).toEqual([]); expect(s.runs).toEqual([]);
    expect(s.progress).toEqual({ stars: {}, best: {}, codex: [], rank: 0, flags: [], pendingScores: 0 });
    expect(s.ui).toEqual({ pinned: [], coachStep: null });
    // M1.12 fields: warm start, level palette / limits / presets, plot, undo stacks
    expect(s.warm).toBeNull(); expect(s.palette).toBeNull(); expect(s.limits).toEqual({}); expect(s.presets).toEqual({}); expect(s.plot).toEqual({ w: 24, h: 16 }); expect(s.undo).toEqual({ past: [], future: [] });
    expect(s.region).toBe('global'); expect(s.ruleset).toBe('equilibrium:global@1.1'); expect(s.status).toBe('playing');
    expect(s.log[0]!.text).toMatch(/^Kestrel Bay Works: the plot is fenced and empty/);
  });
  it('the plant query answers units, streams, phase, detail and species', () => {
    const e = new Engine(GAME);
    // M1.12 extended the plant query (DESIGN §8.4: units, streams, phase, KPIs) with the plot, the failed units and the undo depth
    expect(e.q('plant')).toEqual({ phase: 'design', thermoDetail: 'rigorous', species: [], units: [], streams: [], plot: { w: 24, h: 16 }, kpis: {}, failed: [], undo: { past: 0, future: 0 } });
    const init = e.init() as any; expect(init.game.id).toBe('equilibrium');
  });
  it('state is plain JSON: a JSON round trip changes nothing', () => {
    const s = new Engine(GAME).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('starting a level keeps the campaign progress and nothing else (carryOver)', () => {
    const e = new Engine(TEST);
    const prev = structuredClone(e.state) as EqState; prev.progress.stars.L01 = 2; prev.progress.codex.push('extent'); prev.phase = 'report'; prev.ui.pinned.push('a');
    e.setState(prev);
    expect(e.act('startLevel', ['T1', 1, 'learner']).ok).toBe(true);
    expect(e.state.progress.stars.L01).toBe(2); expect(e.state.progress.codex).toEqual(['extent']);
    expect(e.state.phase).toBe('design'); expect(e.state.ui.pinned).toEqual([]);
    expect(GAME.carryOver!(prev)).toEqual({ progress: prev.progress });
  });
  it('invariants are real: finite numbers, valid phase, species cap, unique ids', () => {
    const ok = new Engine(GAME).state; expect(GAME.invariants!(ok, null)).toEqual([]);
    const bad = structuredClone(ok) as any;
    bad.flowsheet.units.push({ id: 'U1', type: 'x', pos: { x: NaN, y: 0 }, rot: 0, params: {} }, { id: 'U1', type: 'x', pos: { x: 0, y: 0 }, rot: 0, params: {} });
    bad.phase = 'dreaming'; bad.thermoDetail = 'vague'; bad.species = Array(13).fill('N2'); bad.flowsheet.nextId = 0;
    const rules = GAME.invariants!(bad, null).map((v) => v.rule).sort();
    expect(rules).toEqual(['at most 12 active species', 'next id is a positive integer', 'numbers are finite', 'phase is valid', 'thermo detail is valid', 'unit ids are unique']);
    const crowd = structuredClone(ok) as any; for (let i = 0; i < 33; i++) crowd.flowsheet.units.push({ id: 'U' + i, type: 'sink', pos: { x: 0, y: 0 }, rot: 0, params: {} });
    expect(GAME.invariants!(crowd, null).map((v) => v.rule)).toEqual(['at most 32 units']);
  });
  it('same seed, same game; a tick outside a shift changes nothing but the clock', () => {
    const a = new Env(GAME), b = new Env(GAME); a.reset({ seed: 9 }); b.reset({ seed: 9 });
    for (let i = 0; i < 20; i++) { a.step({ name: 'tick' }); b.step({ name: 'tick' }); }
    expect(a.hash()).toBe(b.hash()); expect(a.state.tick).toBe(20); expect(a.state.flowsheet.units).toEqual([]);
  });
  it('save and load round-trip through storage; the save label names the works and phase', () => {
    const kv = new MemoryKV(); const e = new Engine(GAME, { storage: kv });
    e.act('tick', [5]);
    expect(e.act('save', ['slot2']).ok).toBe(true);
    e.act('tick', [5]); expect(e.state.tick).toBe(10);
    expect(e.act('load', ['slot2']).ok).toBe(true); expect(e.state.tick).toBe(5);
    const e2 = new Engine(GAME, { storage: kv });
    const slot = (e2.q('saves') as any[]).find((x) => x.slot === 'slot2'); expect(slot.label).toBe('Kestrel Bay Works · Design · 0 units · tick 5');
  });
  it('protocol: init lists the concepts and the plant query; unknown queries teach', () => {
    const h = createProtocol(new Engine(GAME));
    const init = h({ id: 1, fn: 'init' }); expect(init.ok).toBe(true);
    expect((init.result as any).concepts.map((c: any) => c.id)).toEqual(['extent', 'equilibrium']);
    expect((h({ id: 2, fn: 'q', name: 'plant' }).result as any).phase).toBe('design');
    expect(h({ id: 3, fn: 'q', name: 'nope' }).error).toMatch(/Unknown query 'nope'/);
  });
  it('the three modes are offered', () => expect(GAME.modes).toEqual(['learner', 'engineer', 'sandbox']));
});

describe('core machinery on our state shape (test-local level T1)', () => {
  it('the level is solvable, not won by idling, not cheesable in two moves, rarely won at random', () => {
    for (const r of checkAllLevels(TEST, { seed: 1 })) expect(r.problems, r.level).toEqual([]);
  });
  it('chapter 1 levels are registered, and checkAllLevels is clean for the puzzle levels (L00 is a cold open that idle play finishes by design)', () => {
    expect(GAME.levels!.map((l) => l.id).slice(0, 5)).toEqual(['L00', 'L01', 'L02', 'L03', 'L04']);
    // Chapters 2-9 and Career run the same checkLevel in their own test files (src/levels/ch*.test.ts, career.test.ts); repeating every
    // shift level's random rollouts here took over an hour.
    const ch1 = new Set(['L01', 'L02', 'L03', 'L04']);
    for (const r of checkAllLevels({ ...GAME, levels: GAME.levels!.filter((l) => ch1.has(l.id)) }, { seed: 1 })) expect(r.problems, r.level).toEqual([]);
  });
  it('personas play without violations, in the real game and the test level', () => {
    for (const p of ['idle', 'random']) for (const seed of [1, 2]) expect(play(GAME, { persona: p, seed, ticks: 80 }).violations, `${p}/${seed}`).toEqual([]);
    expect(play(TEST, { persona: 'solver', seed: 1, ticks: 40, level: 'T1' }).status).toBe('won');
    expect(play(TEST, { persona: 'idle', seed: 1, ticks: 60, level: 'T1' }).status).toBe('lost');
    expect(play(TEST, { persona: 'solver', seed: 1, ticks: 40, level: 'T1' }).violations).toEqual([]);
  });
  it('golden trajectories are unchanged (GOLDEN_UPDATE=1 to regenerate deliberately)', () => {
    const g = goldenFile(new URL('./__golden__/trajectories.json', import.meta.url).pathname);
    g.check('idle-1', trajectory(GAME, { seed: 1, ticks: 30, persona: 'idle' }));
    g.check('random-2', trajectory(TEST, { seed: 2, ticks: 30, persona: 'random' }));
    g.check('level-T1', trajectory(TEST, { seed: 1, ticks: 20, persona: 'solver', level: 'T1' }));
  });
});
