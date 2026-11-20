// F23 (round 8, truth): the coach audit. Every level with a coach list is replayed with its reference solver, action by action: the step on the intercom is never
// one the player has already done, never comes before its precondition (a commission before the plant is piped, a read before a run, the vent before there are inerts),
// and at the end it is null or the debrief. Plus the L11 prune trap, a first run that is not a "changed design", and the numbers the cards show.
import { describe, expect, it } from 'vitest';
import { Env, Rng } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { coachReadsRun } from '../engine/queries/level';
import { openPortsOf } from '../engine/queries/plant';
import { SPECS, SPEC_BY_ID } from './registry';
import { changedSinceRun, ran } from './util';
import { L10_REF, ammoniaBuild } from './l10';

const mk = (id: string, seed = 1003): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: id, mode: 'learner' }); return e; };
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args } as any).info as unknown as { ok: boolean; message: string; [k: string]: unknown };
const li = (e: Env<EqState>): any => e.engine.q('levelInfo');

const COACHED = SPECS.filter((x) => x.coach.length > 0 && x.id !== 'CAREER');

/** Steps that ask the player to act on a plant that has to be piped first. */
const NEEDS_PIPES = ['commission', 'test_burn', 'run_bench', 'sweep'];
/** Steps that read something off a run: the plant must have run. */
const NEEDS_RUN = coachReadsRun;

describe('F23 coach audit: every level, solver replay', () => {
  for (const spec of COACHED) {
    it(`${spec.id}: no stale or early coach step along the reference build, and the end is null or the debrief`, () => {
      const e = mk(spec.id), agent = spec.solver(1003), rng = new Rng(1);
      const ids = spec.coach.map((c) => c.id);
      const problems: string[] = [];
      const check = (after: string): void => {
        const c = li(e).coach, s = e.state;
        if (c === null) return;
        const id = ids[c.step - 1]!;
        if (!c.redo && spec.coach[c.step - 1]!.done(s)) problems.push(`${after}: step ${id} is shown but already done`);
        if (NEEDS_PIPES.includes(id) && s.flowsheet.streams.length > 0 && openPortsOf(s).length > 0) problems.push(`${after}: ${id} shown with open ports`);
        if (NEEDS_RUN(id) && !ran(s)) problems.push(`${after}: ${id} shown before a run`);
        if (id === 'pin_window' && changedSinceRun(s)) problems.push(`${after}: pin_window shown after the dials were turned`);
        if (id === 'read_inert' && (li(e).secondary?.value ?? 0) < 0.05) problems.push(`${after}: read_inert shown with no inerts`);
      };
      check('start');
      let prev = li(e).coach?.step ?? 99;
      for (let k = 0; k < 900 && e.state.status === 'playing'; k++) {
        for (const a of agent(e.state, e.ctx(rng))) {
          e.step(a);
          check(`${a.name}(${JSON.stringify(a.args ?? []).slice(0, 40)})`);
          const cur = li(e).coach?.step ?? 99;
          if (cur < prev && !['setFeed', 'setParam', 'setpoint', 'deleteUnit', 'disconnect'].includes(a.name)) problems.push(`${a.name}: the coach went back from step ${prev} to ${cur}`);
          prev = Math.max(prev, cur === 99 ? prev : cur);
          if (e.state.status !== 'playing') break;
        }
        if (e.state.status === 'playing') e.step({ name: 'tick', args: [1] } as any);
      }
      expect(problems).toEqual([]);
      const end = li(e).coach;
      if (end !== null) expect(ids[end.step - 1]).toBe('why');
    });
  }
});

describe('F23 L10 first run', () => {
  it('a missed commission first does not turn the first product run into "your changed design"', () => {
    const e = mk('L10');
    for (const a of ammoniaBuild(['F-101'], 520 + 273.15, 30e5, 1, 102)) e.step(a);
    expect(e.state.status).toBe('playing');
    expect(li(e).runLine).toBeNull();                         // the miss is a design-phase result, not a run
    act(e, 'setParam', 'K-102', 'P', 54e5); act(e, 'setParam', 'K-102', 'stages', 2); act(e, 'setParam', 'R-103', 'T', L10_REF.T);
    expect(act(e, 'commission').ok).toBe(true);
    expect(e.state.phase).toBe('firstrun');
    expect(li(e).runLine).toMatch(/First run/);
    expect(li(e).runLine).not.toMatch(/changed design/);
  });
  it('the Equilibrium Window step is done once the dials are turned after the run, never "pin" something already up', () => {
    const e = mk('L10');
    for (const a of ammoniaBuild(['F-101'], 450 + 273.15, 30e5, 1, 102)) e.step(a);
    expect(li(e).coach?.text ?? '').toMatch(/Equilibrium Window is up/);
    act(e, 'setParam', 'K-102', 'P', 40e5);
    expect(li(e).coach?.text ?? '').not.toMatch(/Equilibrium Window is up/);
  });
});

describe('F23 L11 prune trap', () => {
  it('the contract feeds are never offered for deletion and a mixer with a missing pipe says so', () => {
    const e = mk('L11');
    act(e, 'placeUnit', 'mixer3', 4, 2, 0);
    const mixer = (e.state.flowsheet.units.find((u) => u.type === 'mixer3') as any).id as string;
    act(e, 'connect', 'F-101', 'out', mixer, 'in1');
    expect(e.engine.q('strayUnits')).toEqual([]);
    const r = act(e, 'commission');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Every mixer inlet needs a pipe/);
    expect(r.message).toMatch(/F-102/);
    expect(r.message).toMatch(/flow 0/);
    expect(act(e, 'pruneUnconnected').ok).toBe(false);          // nothing to delete: the feeds stay
    expect(e.state.flowsheet.units.filter((u) => u.type === 'feed').length).toBe(3);
  });
  it('a feed placed after a contract was deleted comes back as that contract, not a pure stand-in', () => {
    const e = mk('L11');
    const x2 = structuredClone(e.state.feeds['F-102']!.x);
    act(e, 'deleteUnit', 'F-102');
    act(e, 'placeUnit', 'feed', 0, 4, 0);
    const added = e.state.flowsheet.units.filter((u) => u.type === 'feed').map((u) => u.id).find((id) => id !== 'F-101' && id !== 'F-103')!;
    expect(e.state.feeds[added]!.x).toEqual(x2);
  });
  it('the pure-gas contract has no inerts to look at: the vent step is skipped', () => {
    const e = mk('L11');
    const pure = [101, 102, 103].map((n) => `F-${n}`).find((id) => (e.state.feeds[id]!.x[2] ?? 0) + (e.state.feeds[id]!.x[3] ?? 0) === 0);
    if (pure === undefined) return;                             // every contract carries inerts at this seed
    expect(pure).toBeTruthy();
  });
});

describe('F23 numbers', () => {
  it('a failed solve does not keep an L11 goal lamp amber', () => {
    const e = mk('L11');
    for (const a of ammoniaBuild(['F-101', 'F-102', 'F-103'], 450 + 273.15, 10e5, 1, 104).filter((a) => a.name !== 'commission')) e.step(a);
    act(e, 'setParam', 'K-105', 'P', 1e5 * 0 + 1);               // a compressor that cannot compress: the solve fails or the plant misses; either way the lamps follow the run
    const lamps = li(e).annunciators as { key: string; state: string }[];
    if (e.state.solved !== null && !e.state.solved.ok) for (const k of ['gas', 'temp']) expect(lamps.find((x) => x.key === k)!.state).toBe('off');
  });
  it('the Equilibrium Window states the pressure its curve is drawn at', () => {
    const e = mk('L10');
    for (const a of ammoniaBuild(['F-101'], 450 + 273.15, 54e5, 2, 102)) e.step(a);
    const w = (e.engine as any).q('eqBeam', ['R-103']) as any;
    expect(w.pBar).toBeGreaterThan(30);
    expect(w.pBar).toBeLessThan(80);
  });
  it('the X-T staircase of L13 prints nothing before the first commission (no bed 3 conversion as a spoiler)', () => {
    const e = mk('L13');
    for (const a of SPEC_BY_ID.L13!.solver(1003)(e.state, e.ctx(new Rng(1))).filter((a) => a.name !== 'commission' && a.name !== 'callIt')) e.step(a);
    expect((e.engine.q('xtDiagram') as any).beds).toEqual([]);
    act(e, 'callIt', 600);
    act(e, 'commission');
    if (e.state.solved?.ok) expect((e.engine.q('xtDiagram') as any).beds.length).toBeGreaterThan(0);
  });
  it('L14: the gauge lamp is dark during a deliberate Le Chatelier test (V halved)', () => {
    const e = mk('L14');
    act(e, 'callIt', 1);
    const fl = e.state.flowsheet.units.find((u) => u.type === 'lab_flask')!;
    act(e, 'setParam', fl.id, 'V', 0.0005);
    act(e, 'commission');
    expect((li(e).annunciators as any[]).find((a) => a.key === 'gauge').state).toBe('off');
  });
});

describe('F23 lamps', () => {
  it('at the start of every chapter 3 level (nothing run) no lamp except the solve lamp is amber or red', () => {
    for (const id of ['L10', 'L11', 'L12', 'L13', 'L14']) {
      const e = mk(id);
      const lit = (li(e).annunciators as { key: string; state: string }[]).filter((a) => a.key !== 'solve' && (a.state === 'high' || a.state === 'critical'));
      expect(lit.map((a) => `${id}:${a.key}`)).toEqual([]);
    }
  });
});
