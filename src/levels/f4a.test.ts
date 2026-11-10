// Round-2 playtest fixes (lane F4a): honest boards before the first commission, the missing-unit notice, star bookkeeping, shift end, catalyst knob,
// lamp logic, stray units, L32/L36/L37 rules, L00 coach naming the unit.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { SPECS, NAIVE, SPEC_BY_ID } from './registry';
import { l17Player } from './l17';
import { simulatedHistogram } from '../engine/queries/level';
import type { EqState } from '../state';

const start = (id: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode }); return e; };
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args }).info as { ok: boolean; message: string };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const play = (id: string, persona: PersonaFactory<EqState>, ticks = 5): Env<EqState> => {
  const e = start(id), agent = persona(1003);
  for (let t = 0; t < ticks && e.state.status === 'playing'; t++) { for (const a of agent(e.state, e.ctx(new Rng(1003)))) { e.step(a); if (e.state.status !== 'playing') break; } if (e.state.status === 'playing') e.step(TICK); }
  return e;
};

describe('honest board before the first commission', () => {
  for (const spec of SPECS.filter((x) => x.id !== 'L00' && x.id !== 'CAREER')) {
    it(`${spec.id}: no goal met, no value, no annunciator lit, hero pending`, () => {
      for (const mode of ['learner', 'engineer']) {
        const e = start(spec.id, mode), i = info(e);
        expect(i.goals.every((g: any) => g.met === false && g.pending === true && g.value === undefined), `${spec.id} ${mode} goals`).toBe(true);
        expect(i.annunciators.filter((a: any) => a.state !== 'off').map((a: any) => a.key), `${spec.id} ${mode} lamps`).toEqual([]);
        expect(i.hero.pending).toBe(true);
      }
    });
  }
});

describe('missing unit', () => {
  it('L06 commissioned without the boiler: the notice names it, goals read "needs a ...", nothing is -273', () => {
    const e = start('L06');
    for (const a of [['placeUnit', 'compressor', 3, 4, 0], ['placeUnit', 'mixer', 10, 2, 0], ['placeUnit', 'burner', 12, 0, 0], ['placeUnit', 'stack', 22, 2, 0]] as const) act(e, a[0], ...a.slice(1));
    for (const [a, ap, b, bp] of [['F-102', 'out', 'K-103', 'in'], ['K-103', 'out', 'M-104', 'in2'], ['F-101', 'out', 'M-104', 'in1'], ['M-104', 'out', 'R-105', 'in'], ['R-105', 'out', 'Z-106', 'in']]) act(e, 'connect', a, ap, b, bp);
    act(e, 'commission');
    expect(e.state.solved?.ok).toBe(true);
    const i = info(e);
    expect(i.notice).toMatchObject({ code: 'NEEDS_UNIT', unit: 'boiler' }); expect(i.notice.text).toContain('Waste-heat boiler');
    expect(i.goals.every((g: any) => g.met === false && g.value === undefined && g.readout.includes('Waste-heat boiler'))).toBe(true);
    expect(i.hero.pending).toBe(true); expect(i.hero.value).toBeGreaterThanOrEqual(0); expect(JSON.stringify(i)).not.toContain('-273');
  });
});

describe('stars and the end of a shift', () => {
  it('a win records starsOf().have in the progress, claimStars keeps the best', () => {
    const e = play('L16', SPEC_BY_ID.L16!.solver, 60);
    expect(e.state.status).toBe('won');
    expect(e.state.progress.stars.L16).toBe(info(e).stars.have);
    expect(act(e, 'claimStars').ok).toBe(true); expect(e.state.progress.stars.L16).toBe(info(e).stars.have);
  });
  it('a shift that ends with its goals unmet is lost at once, with a reason', () => {
    const e = play('L05', NAIVE.L05!, 400);
    expect(e.state.shift?.ended).not.toBe(''); expect(e.state.status).toBe('lost');
    expect(e.state.statusReason).toMatch(/goals/);
    expect((e.engine.q('resultCard') as any).verdictKey).not.toBe('pass');
  });
  it('no 0 K trend is recorded on a shift with no temperature monitors', () => {
    const e = play('L05', NAIVE.L05!, 40);
    for (const k of ['tmax_K', 'pmax_Pa']) for (const v of e.state.trends[k] ?? []) expect(v).toBeGreaterThan(0);
  });
});

describe('L16 / L17', () => {
  it('L17 offers the catalyst on the bed card and the coach points at the knob', () => {
    const e = start('L17');
    const bed = e.state.flowsheet.units.find((u) => u.type === 'packed_bed')!;
    const card = e.engine.q('unitCard', [bed.id]) as any;
    expect(card.catalyst.id).toBe('v2o5'); expect(card.catalyst.options.map((o: any) => o.id)).toEqual(['v2o5', 'v2o5_cs']);
    expect(SPEC_BY_ID.L17!.coach.find((c) => c.id === 'swap_catalyst')!.focus).toBe('packed_bed:catalyst');
  });
  it('BED ASLEEP does not light for an awake bed that merely misses the conversion goal', () => {
    const e = play('L17', l17Player(410, 'v2o5'), 5);
    const i = info(e);
    expect(e.state.solved?.ok).toBe(true);
    const x = i.goals.find((g: any) => g.key === 'conv');
    expect(x.met).toBe(false); expect(x.value).toBeGreaterThan(30);
    expect(i.annunciators.find((a: any) => a.key === 'asleep').state).toBe('normal');
  });
});

describe('stray units', () => {
  it('an unpiped extra stack is named, with its open ports as chevron data', () => {
    const e = start('L05');
    for (const a of [['placeUnit', 'compressor', 4, 4, 0], ['placeUnit', 'mixer', 10, 2, 0], ['placeUnit', 'burner', 14, 0, 0], ['placeUnit', 'boiler', 18, 0, 0], ['placeUnit', 'stack', 22, 2, 0]] as const) act(e, a[0], ...a.slice(1));
    for (const [a, ap, b, bp] of [['F-102', 'out', 'K-103', 'in'], ['K-103', 'out', 'M-104', 'in2'], ['F-101', 'out', 'M-104', 'in1'], ['M-104', 'out', 'R-105', 'in'], ['R-105', 'out', 'B-106', 'in'], ['B-106', 'out', 'Z-107', 'in']]) act(e, 'connect', a, ap, b, bp);
    e.engine.state.limits.stack = 2;
    const r = act(e, 'placeUnit', 'stack', 22, 8, 0);
    expect(r.ok).toBe(true);
    const ports = e.engine.q('openPorts') as any[];
    expect(ports).toEqual([{ unit: expect.any(String), port: 'in', dir: 'in', stray: true }]);
    const c = act(e, 'commission');
    expect(c.ok).toBe(false); expect(c.message).toContain(ports[0].unit); expect(c.message).toContain('not piped to anything');
  });
});

describe('chapter 8 / 9 rules', () => {
  it('L32 defaults are sluggish: with the cascade on they still fail, the reference tuning passes', () => {
    const e = start('L32');
    act(e, 'levelAct', 'set', 'on', 1); act(e, 'commission');
    expect(e.state.solved?.ok).toBe(true);
    expect(info(e).goals.some((g: any) => !g.met)).toBe(true);
    const s = play('L32', SPEC_BY_ID.L32!.solver, 40); expect(s.state.status).toBe('won');
  });
  it('L36 refuses a duplicate card', () => {
    const e = start('L36'); expect(act(e, 'levelAct', 'add', 'depress').ok).toBe(true);
    const r = act(e, 'levelAct', 'add', 'depress'); expect(r.ok).toBe(false); expect(r.message).toContain('already');
  });
  it('L37 flag takes the meter out of the balance, both chi-square limits are shown, the imbalance after is recomputed', () => {
    const e = start('L37'); act(e, 'levelAct', 'reconcile');
    const v0 = e.engine.q('levelView') as any;
    expect(v0.dof).toBe(3); expect(v0.chi2CritRaw).toBeCloseTo(7.815, 3);
    const worst = v0.meters.reduce((b: any, m: any) => (Math.abs(m.z) > Math.abs(b.z) ? m : b)).i;
    act(e, 'levelAct', 'flag', worst);
    expect(e.state.lv.excluded).toEqual([worst]);
    const v1 = e.engine.q('levelView') as any;
    expect(v1.dof).toBe(2); expect(v1.chi2Crit).toBeCloseTo(5.991, 3);
    expect(v1.nodes.some((n: any, i: number) => Math.abs(n.imbalanceAfter) < Math.abs(v0.nodes[i].imbalance) - 1e-9)).toBe(true);
    act(e, 'levelAct', 'unflag', worst); expect(e.state.lv.excluded).toEqual([]);
  });
  it('made kg is null on a control level; the histogram carries the player value and its bin', () => {
    const e = play('L31', SPEC_BY_ID.L31!.solver, 3);
    if (e.state.phase === 'firstrun') expect(info(e).firstRun.madeKg).toBeNull();
    const h = simulatedHistogram('L99', 'x', 10, 0.5, true, 12.5);
    expect(h.you).toBe(12.5); expect(h.edges[h.youBin]!).toBeLessThanOrEqual(12.5); expect(h.edges[h.youBin + 1]!).toBeGreaterThanOrEqual(12.5);
  });
});

describe('budget and coach names', () => {
  it('L23 has a budget', () => { expect(SPEC_BY_ID.L23!.budgetUSD).toBeGreaterThan(0); expect(info(start('L23', 'engineer')).goals.some((g: any) => g.key === 'budget')).toBe(true); });
  it('the L00 coach names the unit it points at', () => {
    const e = start('L00'); act(e, 'startShift', 'shift');
    const c = info(e).coach;
    expect(c.focus.unit).toMatch(/^[A-Z]-\d+$/); expect(c.text).toContain(c.focus.unit);
  });
});

describe('teacher round 2', () => {
  it('L24: the goal row shows what the tank holds and is met as soon as it holds the target; the win waits for the shift end', () => {
    const e = play('L24', SPEC_BY_ID.L24!.solver, 3);
    const spec = SPEC_BY_ID.L24!, m = spec.measures(e.state);
    const g = spec.goals(e.state, { ...m, v: { ...m.v, pg_kmol: 5.6, lost: 0, peak_K: 400, ended: 0 } });
    expect(g[0]!.met).toBe(true);
    expect(spec.won!(e.state, { ...m, v: { ...m.v, ended: 0 } }, g)).toBe(false);
  });
  it('streamTable works on a plant with a pseudo-species (L24 reactor)', () => {
    const e = play('L24', SPEC_BY_ID.L24!.solver, 2);
    expect(() => e.engine.q('streamTable')).not.toThrow();
    expect((e.engine.q('streamTable') as any).rows.every((r: any) => Number.isFinite(r.mass))).toBe(true);
  });
  it('L09 reads proper pending sentences, never the raw word, and shows the player prediction', () => {
    const e = start('L09'); let i = info(e);
    for (const g of i.goals) expect(g.text).not.toMatch(/(reads|wrote) pending/);
    act(e, 'callIt', 688); i = info(e);
    const du = i.goals.find((g: any) => g.key === 'du'); expect(du.value).toBe(688); expect(du.met).toBe(false); expect(du.text).toContain('688');
  });
  it('knobs: litres with decimals, absolute pressures, physical temperature ranges', () => {
    const e = start('L14'); const flask = e.state.flowsheet.units.find((u) => u.type === 'lab_flask')!;
    const card = e.engine.q('unitCard', [flask.id]) as any;
    expect(card.knobs.find((k: any) => k.key === 'V')).toMatchObject({ unit: 'L', decimals: 2 });
    expect(card.knobs.find((k: any) => k.key === 'Pfix').unit).toBe('bar(a)'); expect(card.knobs.find((k: any) => k.key === 'Pfix').label).toContain('0 = off');
    const l24 = start('L24'); const ilk = l24.state.flowsheet.units.find((u) => u.type === 'interlock')!;
    const k = (l24.engine.q('unitCard', [ilk.id]) as any).knobs[0]; expect(k.min).toBeGreaterThanOrEqual(273.15);
  });
  it('unitWhy gives what the unit does, its lever and, once commissioned, the numbers', () => {
    const e = play('L16', SPEC_BY_ID.L16!.solver, 2);
    for (const u of e.state.flowsheet.units) { const w = e.engine.q('unitWhy', [u.id]) as any; expect(w.sentences.length).toBeGreaterThanOrEqual(2); expect(w.sentences[0]).not.toBe('Equilibrium reactor'); }
    const hx = e.state.flowsheet.units.find((u) => u.type === 'hx')!;
    expect((e.engine.q('unitWhy', [hx.id]) as any).sentences.join(' ')).toContain('°C');
  });
});

describe('progress and snapshot failure message', () => {
  it('progress query mirrors the stars recorded on a win; L05/L06 have a what-to-build note', () => {
    const e = play('L16', SPEC_BY_ID.L16!.solver, 60);
    expect((e.engine.q('progress') as any).stars.L16).toBe(info(e).stars.have);
    for (const id of ['L05', 'L06']) expect(info(start(id)).note.length).toBe(3);
  });
  it('a failed commission carries its translated message in the snapshot', () => {
    const e = play('L22', NAIVE.L22!, 3);
    if (e.state.solved && !e.state.solved.ok) { const f = (e.engine.snapshot() as any).failure; expect(f.message.length).toBeGreaterThan(10); expect(f.message).not.toContain('{'); }
  });
});
