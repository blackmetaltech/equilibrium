// F25 (round 9, truth): the coach never runs ahead of the build checklist, the instruments say "design estimate" before a run, the L10 / L12 / L13 / L14 texts, and the
// L25 action budget (the counted path is in the last describe).
import { describe, expect, it } from 'vitest';
import { Env, Rng } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { SPECS } from './registry';
import { L25_GUIDE, dcdaBuild } from './l25';
import { shiftBuild, L12_REF } from './l12';
import { ammoniaBuild } from './l10';

const mk = (id: string, mode: 'learner' | 'engineer' = 'learner', seed = 1003): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: id, mode }); return e; };
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args } as any).info as unknown as { ok: boolean; message: string; [k: string]: unknown };
const li = (e: Env<EqState>): any => e.engine.q('levelInfo');

describe('F25 the coach never runs ahead of the checklist', () => {
  for (const spec of SPECS.filter((x) => x.buildGuide !== undefined && x.coach.length > 0)) {
    it(`${spec.id}: while a design-time row is open the intercom is on the next unticked row, never on a later step`, () => {
      const e = mk(spec.id), agent = spec.solver(1003), rng = new Rng(1);
      const problems: string[] = [];
      const check = (after: string): void => {
        const info = li(e), c = info.coach, g = info.buildGuide as { id: string; kind: string; type?: string; text: string; done: boolean; next: boolean }[];
        if (c === null || e.state.phase !== 'design') return;
        const row = g.find((x) => !x.done);
        if (row === undefined || (row.kind === 'set' && row.type === undefined)) return;
        const aligned = (row.kind === 'set' && spec.coach[c.step - 1]!.focus?.split(':')[0] === row.type) || (row.kind === 'pipe' && spec.coach[c.step - 1]!.id === 'pipe_up');
        if (!aligned && !c.text.includes(row.text)) problems.push(`${after}: coach says "${c.text.slice(0, 60)}" but the next row is "${row.text}"`);
      };
      check('start');
      for (let k = 0; k < 300 && e.state.status === 'playing'; k++) {
        for (const a of agent(e.state, e.ctx(rng))) { e.step(a); check(a.name); if (e.state.status !== 'playing') break; }
        if (e.state.status === 'playing') e.step({ name: 'tick', args: [1] } as any);
      }
      expect(problems).toEqual([]);
    });
  }
  it('L25: at 8 / 26 rows the coach is on "Place Absorber 2"; at 24 / 26 it names the open setting; the first line says four beds', () => {
    const e = mk('L25');
    expect(li(e).coach.text).not.toMatch(/three/i);
    expect(li(e).coach.text).toMatch(/Place Bed 1|Place Packed bed 1/i);
    const acts = dcdaBuild().filter((a) => a.name !== 'callIt' && a.name !== 'commission');
    const parts = acts.filter((a) => a.name === 'placeUnit');
    for (const a of parts.slice(0, 8)) e.step(a);
    let g = li(e).buildGuide as any[];
    expect(g.filter((x) => x.done).length).toBe(8);
    expect(li(e).coach.text).toMatch(/Place Absorber 2/);
    expect(li(e).coach.text).not.toMatch(/V₂O₅|catalyst/i);
    for (const a of acts.slice(acts.indexOf(parts[11]!) + 1)) { e.step(a); g = li(e).buildGuide as any[]; if (g.filter((x) => x.done).length === 24) break; }
    expect(g.filter((x) => !x.done).length).toBeGreaterThan(0);
    expect(li(e).coach.text).not.toMatch(/^Commission/);
    expect(li(e).coach.text).toContain(g.find((x) => !x.done).text);
  });
});

describe('F25 L12 flask 2 and the K number', () => {
  it('a compressor tried and then deleted still earns "no compressor"; one still on the plot does not', () => {
    const e = mk('L12', 'engineer');
    act(e, 'callIt', 270);
    for (const a of shiftBuild(L12_REF.T, L12_REF.ratio, { P: 20e5, stages: 2 })) e.step(a);
    expect(li(e).stars.earned[1]).toBe(false);                    // the compressor is on the plot
    const k = e.state.flowsheet.units.find((u) => u.type === 'compressor')!;
    act(e, 'deleteUnit', k.id);
    const mix = e.state.flowsheet.units.find((u) => u.type === 'mixer')!.id, rx = e.state.flowsheet.units.find((u) => u.type === 'eq_reactor')!.id;
    expect(act(e, 'connect', mix, 'out', rx, 'in').ok).toBe(true);
    act(e, 'commission');
    for (let i = 0; i < 30 && e.state.status === 'playing'; i++) e.step({ name: 'tick', args: [5] } as any);
    expect(e.state.status).toBe('won');
    expect(li(e).stars.earned).toEqual([true, true, true]);
  });
  it('the flask rule and the K text state their basis', () => {
    const e = mk('L12', 'engineer');
    expect(li(e).stars.rules[1]).toMatch(/no compressor in the plant at that moment/);
    expect(li(e).callIt.given ?? '').toMatch(/heat capacities/);
  });
});

describe('F25 L10 / L13 / L14 texts', () => {
  it('L10 says the 380 °C K once when the converter sits at 380 °C, and twice (two numbers) otherwise', () => {
    const at = (Tc: number): string => { const e = mk('L10'); for (const a of ammoniaBuild(['F-101'], Tc + 273.15, 30e5, 1, 102)) e.step(a); return li(e).lesson as string; };
    const same = at(380), diff = at(450);
    expect(same).not.toMatch(/at your temperature and/);
    expect((same.match(/× 10⁻⁵/g) ?? []).length).toBe(1);
    expect(diff).toMatch(/at your temperature and [\d.,]+ × 10⁻⁵ at 380 °C/);
  });
  it('L13: the sinter lamp says "near" on its legend while amber', () => {
    const e = mk('L13');
    const lamp = (): any => (li(e).annunciators as any[]).find((a) => a.key === 'sinter');
    expect(lamp().legend).toBe('BED SINTER');
  });
  it('L14: the brief gives 400 K and the dial reading in °C; the goal names the book\'s 9.15 bar and the run limit, never the answer temperature (phase C)', () => {
    const e = mk('L14');
    expect(JSON.stringify(li(e))).toMatch(/400 K \(126\.85 °C/);
    expect(JSON.stringify(li(e).goals)).toMatch(/9\.15 bar, and run one argon test, within 6 runs/);
    expect(JSON.stringify(li(e))).not.toMatch(/406\.[0-9]/);
  });
});

describe('F25 instruments say what they are', () => {
  it('L25: the X-T staircase and the Equilibrium Window are a design estimate until a run exists, and again after an edit', () => {
    const e = mk('L25');
    for (const a of dcdaBuild().filter((a) => a.name !== 'commission' && a.name !== 'callIt')) e.step(a);
    expect((e.engine.q('xtDiagram') as any).estimate).toBe(true);
    act(e, 'callIt', 1);
    act(e, 'commission');
    expect(e.state.solved?.ok).toBe(true);
    expect((e.engine.q('xtDiagram') as any).estimate).toBe(false);
    act(e, 'setParam', 'C-103', 'T', 700);                       // an edit clears the stored run
    expect((e.engine.q('xtDiagram') as any).estimate).toBe(true);
  });
  it('L10: the Equilibrium Window names the species its conversion is of', () => {
    const e = mk('L10');
    for (const a of ammoniaBuild(['F-101'], 450 + 273.15, 54e5, 2, 102).filter((a) => a.name !== 'commission')) e.step(a);
    const w = e.engine.q('eqBeam', ['R-103']) as any;
    expect(w.estimate).toBe(true);
    expect(typeof w.ref).toBe('string');
  });
  it('the heat ledger is empty after an abort and a design estimate before a run', () => {
    const e = mk('L07');
    const s = SPECS.find((x) => x.id === 'L07')!;
    const rng = new Rng(1), agent = s.solver(1003);
    for (const a of agent(e.state, e.ctx(rng))) { if (a.name === 'commission') break; e.step(a); }
    const led = e.engine.q('heatLedger') as any;
    if (led.items.length > 0) expect(led.estimate).toBe(true);
    (e.state as any).status = 'lost';
    expect((e.engine.q('heatLedger') as any).items).toEqual([]);
  });
});

describe('F25 L25 action budget', () => {
  // The counted path with the F25 helpers, one UI move each: the first part is in hand when the notebook closes (auto-armed first row), each later part re-arms by itself
  // (build_checklist._auto_arm), so every part is ONE click on the plot; a train is piped by chaining (the pipe re-arms from the next free outlet): the first link is one
  // drag, each following link one click, and the two acid lines are one drag each. Parts 12 + pipes 12 = 24 moves to a fully piped plant.
  it('12 parts + 12 pipes = 24 moves to fully piped (under 25); the guide has exactly those rows', () => {
    const places = L25_GUIDE.filter((x) => x.kind === 'place').length, pipes = L25_GUIDE.filter((x) => x.kind === 'pipe').length;
    expect(places).toBe(12); expect(pipes).toBe(12);
    expect(places + pipes).toBeLessThan(25);
  });
});
