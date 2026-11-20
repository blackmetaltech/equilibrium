// F17 (round 7, testers d1 / d2 / c2 / c3): L32 chart + dial hints, the 3-star targets of L29 / L32 are reachable from the printed tuning, L38 plan / CPM reveal, L35 card minutes,
// L36 given minutes, no second run on a job without a shift, a commissioned winning plant always rolls its first run.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import type { EqState } from '../state';
import { PERMIT_STEPS } from '../sim/ops/permit';
import { SPEC_BY_ID } from './registry';
import { L29_IAE_STAR, L29_REF } from './l29';
import { L32_IAE_STAR, L32_REF } from './l32';
import { L38_BEST, L38_CRANE_HIRE_USD, L38_RATE_T_PER_D, L38_MARGIN_USD_PER_T, L38_REF_ORDER, L38_START_ORDER } from './l38';

const mk = (id: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const lact = (e: Env<EqState>, ...a: unknown[]): void => { e.step({ name: 'levelAct', args: a } as any); };
const dials = (e: Env<EqState>, keys: string[], vals: number[]): void => keys.forEach((k, i) => lact(e, 'setDial', k, vals[i]));
const L32_KEYS = ['on', 'mKc', 'mTauI', 'sKc', 'sTauI'];

describe('F17 L32 cascade chart and failure advice', () => {
  it('the view puts the flow pen on the percent axis and the dials say integral time, not tauI', () => {
    const e = mk('L32'); dials(e, L32_KEYS, [1, L32_REF.mKc, L32_REF.mTauI, L32_REF.sKc, L32_REF.sTauI]); e.step({ name: 'commission' } as any);
    const v = view(e);
    expect(v.extrasPct).toBe(true);
    expect(Object.keys(v.series)).toContain('flow');
    const labels = v.dials.map((d: any) => d.label as string);
    expect(labels).toContain('Master integral time'); expect(labels).toContain('Slave integral time');
    expect(labels.join(' ')).not.toMatch(/tauI/i);
  });
  it('a failed run names the dial to move, from the player\'s own numbers', () => {
    const e = mk('L32'); dials(e, L32_KEYS, [1, 0.5, 300, 0.5, 20]); e.step({ name: 'commission' } as any);
    expect(card(e).cause).toMatch(/slave Kc dial/i); expect(card(e).cause).toMatch(/0\.5/);
    const e2 = mk('L32'); dials(e2, L32_KEYS, [1, 0.5, 300, 2, 6]); e2.step({ name: 'commission' } as any);
    expect(info(e2).goals.find((g: any) => g.key === 'hdr').met).toBe(true);
    expect(card(e2).cause).toMatch(/master/i); expect(card(e2).cause).toMatch(/dial/i);
    const e3 = mk('L32'); dials(e3, L32_KEYS, [1, 1.5, 400, 2, 6]); e3.step({ name: 'commission' } as any);
    if (!info(e3).goals.every((g: any) => g.met)) expect(card(e3).cause).toMatch(/integral time dial down/i);
  });
});

describe('F17 the 3-star IAE targets are reachable from the printed tuning', () => {
  it('L29: the tuning in the star line (Kc 4, tauI 60 s) meets every goal and the third star', () => {
    expect(en['lv.L29.star.3']).toMatch(/Kc near 4/); expect(en['lv.L29.star.3']).toMatch(/tauI near 60/);
    const e = mk('L29'); dials(e, ['kc', 'tauI'], [4, 60]); e.step({ name: 'commission' } as any);
    expect(info(e).goals.every((g: any) => g.met)).toBe(true);
    expect(view(e).metric.value).toBeLessThanOrEqual(L29_IAE_STAR);
    expect(L29_REF).toEqual({ kc: 4, tauI: 60 });
  });
  it('L32: the tuning in the star line (slave 2 / 6 s, master 1.5 / 150 s) meets every goal and the third star', () => {
    expect(en['lv.L32.star.3']).toMatch(/slave Kc 2 \/ 6 s, master Kc 1\.5 \/ 150 s/);
    const e = mk('L32'); dials(e, L32_KEYS, [1, 1.5, 150, 2, 6]); e.step({ name: 'commission' } as any);
    expect(info(e).goals.every((g: any) => g.met)).toBe(true);
    expect(view(e).metric.value).toBeLessThanOrEqual(L32_IAE_STAR);
    expect(L32_IAE_STAR).toBeLessThan(860);
  });
});

describe('F17 L33 notebook', () => {
  it('goal plus one paragraph of why (two notes), and the given line is the call row\'s, not a second note', () => {
    const e = mk('L33'); const notes = info(e).note as string[];
    expect(notes).toHaveLength(2);
    expect(notes.join(' ')).not.toMatch(/Given for the call-it/);
    expect(notes[0]!.length + notes[1]!.length).toBeLessThan(700);
    expect(info(e).callIt.given).toMatch(/^What you have/);
  });
});

describe('F17 L38 turnaround', () => {
  it('the 16 d plan exists with the UI\'s own reorder (move) and the second crane; one crane tops out at 18 d', () => {
    const e = mk('L38'), cur = L38_START_ORDER.slice();
    for (let i = 0; i < L38_REF_ORDER.length; i++) { const k = cur.indexOf(L38_REF_ORDER[i]!); if (k !== i) { lact(e, 'move', k, i); const [x] = cur.splice(k, 1); cur.splice(i, 0, x!); } }
    expect(view(e).priority).toEqual(L38_REF_ORDER);
    lact(e, 'setCrane', 1); expect(view(e).makespan).toBe(L38_BEST.one);
    lact(e, 'setCrane', 2); expect(view(e).makespan).toBe(L38_BEST.two);
    const net = (L38_BEST.one - L38_BEST.two) * L38_RATE_T_PER_D * L38_MARGIN_USD_PER_T - L38_CRANE_HIRE_USD;
    expect(net).toBe(210000);
    expect(en['lv.L38.note.3']).toContain('210,000'); expect(en['lv.L38.note.3']).toMatch(/only if your plan really reaches 16 days/);
  });
  it('the board prints no critical path (days, critical list, hint) until the call is locked or the plan has run', () => {
    const e = mk('L38');
    let v = view(e);
    expect(v.cpmDays).toBeNull(); expect(v.cpmCritical).toEqual([]); expect(v.hint).not.toMatch(/Critical path/); expect(v.hint).not.toMatch(/\b13\b/);
    expect(v.hint).toMatch(/crew/i);
    e.step({ name: 'callIt', args: [13] } as any);
    v = view(e); expect(v.cpmDays).toBe(13); expect(v.hint).toMatch(/Critical path 13 d/);
    const e2 = mk('L38'); e2.step({ name: 'commission' } as any);
    expect(view(e2).cpmDays).toBe(13);
  });
  it('the board carries the crew use per day against the limit', () => {
    const v = view(mk('L38'));
    expect(v.limits.crew).toBe(8); expect(v.crewByDay.length).toBeGreaterThanOrEqual(20);
    expect(v.hint).toMatch(/limit of 8/);
  });
});

describe('F17 L35 and L36 cards', () => {
  it('L35: the heat-up card minutes (the call-it answer) stay off the cards until the call is locked', () => {
    const e = mk('L35');
    let cards = view(e).cards as { id: string; mins: number }[];
    expect(cards.find((c) => c.id === 'heat_slow')!.mins).toBe(-1); expect(cards.find((c) => c.id === 'heat_fast')!.mins).toBe(-1);
    expect(cards.find((c) => c.id === 'purge')!.mins).toBeGreaterThan(0);
    e.step({ name: 'callIt', args: [420] } as any);
    cards = view(e).cards; expect(cards.find((c) => c.id === 'heat_slow')!.mins).toBe(420);
  });
  it('L36: the call\'s given line lists the card minutes, and they are the engine\'s', () => {
    const g = en['lv.L36.callit.given'] as string;
    const m = (id: string): number => PERMIT_STEPS.find((c) => c.id === id)!.mins;
    expect(g).toContain(`close a block ${m('close_in_1')}`); expect(g).toContain(`bleed and read it ${m('bleed_in')}`); expect(g).toContain(`depressure ${m('depress')}`);
    expect(g).toContain(`blind ${m('blind')}`); expect(g).toContain(`drain ${m('drain')}`); expect(g).toContain(`purge ${m('purge')}`); expect(g).toContain(`gas test ${m('gas_test')}`);
    expect(g).toContain(`lock and tag ${m('lock')}`); expect(g).toContain(`break containment ${m('open_up')}`); expect(g).toContain(`pull and clean ${m('clean')}`); expect(g).toContain(`reinstate ${m('reinstate')}`);
    expect(g).toMatch(/^What you have/);
  });
});

function play(e: Env<EqState>, ticks: number): void {
  const agent = SPEC_BY_ID[e.state.level!]!.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < ticks && e.state.status === 'playing'; t++) {
    for (const a of agent(e.state, e.ctx(rng))) { e.step(a); if (e.state.status !== 'playing') break; }
    if (e.state.status === 'playing') e.step(TICK);
  }
}

describe('F17 first runs always end in the printout', () => {
  it('a "shift" started on a job without one (the key\'s second turn used to) counts as its first run: goals met and 30 s later the level is won and the result card is there', () => {
    for (const id of ['L20', 'L25', 'L26']) {
      const e = mk(id); expect(SPEC_BY_ID[id]!.shiftLen, id).toBe(0);
      play(e, 1);                                   // the solver builds / dials and commissions: the first run starts
      expect(['firstrun', 'commissioned']).toContain(e.state.phase);
      (e.state as any).phase = 'commissioned';      // the plant as the testers left it
      e.step({ name: 'startShift', args: ['shift'] } as any);
      expect(e.state.phase, id).toBe('shift');
      let n = 0;
      while (e.state.status === 'playing' && n++ < 400) e.step(TICK);
      expect(e.state.status, id).toBe('won');
      expect(n, id).toBeLessThan(120);
      expect(card(e).won, id).toBe(true);
    }
  });
  it('a commissioned plant whose goals are all met rolls its first run on the next tick and ends in the printout (won, with a result card)', () => {
    for (const id of ['L20', 'L25', 'L26']) {
      const e = mk(id); play(e, 3);
      // the winning plant is commissioned and in its first run
      expect(['firstrun', 'commissioned'].includes(e.state.phase) || e.state.status === 'won', id).toBe(true);
      if (e.state.status === 'won') { expect(card(e).won, id).toBe(true); continue; }
      // force the odd state the testers hit (all goals met, phase left at 'commissioned'), then let the clock run
      (e.state as any).phase = 'commissioned';
      let n = 0;
      while (e.state.status === 'playing' && n++ < 200) e.step(TICK);
      expect(e.state.status, id).toBe('won');
      expect(card(e).won, id).toBe(true);
      expect(card(e).histogram, id).toBeTruthy();
    }
  });
});
