// F13 (Career, round 6b): +3 MONTHS needs the warning acknowledged after a stop, the inspection strike rule is stated and enforced, one inspection state per plant, BOOK weighs
// cost against risk, one name for the top ending (Flagship), the end slip carries the third flask rule, alerts for the office top, no feed-surge noise.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, careerOf } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { INSPECT_EVERY, INSPECT_STRIKE_OVER, PLANTS, CareerError, ackWarning, advance, alerts, attention, decide, initCareer, inspState, stepMonth, taWeigh } from '../sim/career/model';
import type { EqState } from '../state';
import { en } from '../locales/en';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const L = en as Record<string, string>;
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const act = (e: Env<EqState>, name: string, ...args: unknown[]): void => { e.step({ name: 'levelAct', args: [name, ...args] } as any); };
/** A career advanced until a 3-month advance stops at a fresh warning. */
function stoppedCareer(): ReturnType<typeof initCareer> {
  const c = initCareer(1, 'engineer');
  for (let g = 0; g < 40 && c.ending === ''; g++) {
    try { const n = advance(c, 3); if (n < 3 && c.m % 12 !== 0 && (c.stopped ?? []).length > 0) return c; } catch { ackWarning(c); }
  }
  throw new Error('no stop found');
}

describe('+3 MONTHS after a stop at a warning', () => {
  it('the next multi-month advance is refused until the warning is acknowledged; one month always runs', () => {
    const c = stoppedCareer();
    expect(c.stopped!.length).toBeGreaterThan(0);
    expect(() => advance(c, 3)).toThrow(CareerError);
    const m = c.m; expect(advance(c, 1)).toBe(1); expect(c.m).toBe(m + 1);
    const d = stoppedCareer(); ackWarning(d); expect(d.stopped).toEqual([]);
    expect(advance(d, 3)).toBeGreaterThanOrEqual(1);
  });
  it('through the level actions: the view says what stopped, the refusal changes nothing, ackWarning lets the next +3 run', () => {
    const e = start();
    for (let g = 0; g < 60 && !view(e).dashboard.needsAck; g++) { try { act(e, 'advance', 3); } catch { act(e, 'ackWarning'); } if (e.state.status !== 'playing') break; }
    const d = view(e).dashboard;
    expect(d.needsAck).toBe(true); expect(d.stoppedNotes.length).toBeGreaterThan(0);
    const m = careerOf(e.state)!.m;
    act(e, 'advance', 3);
    expect(careerOf(e.state)!.m).toBe(m);
    act(e, 'ackWarning'); expect(view(e).dashboard.needsAck).toBe(false);
    act(e, 'advance', 3); expect(careerOf(e.state)!.m).toBeGreaterThan(m);
  });
  it('a stop whose warning has since been dealt with needs no acknowledgement', () => {
    const c = stoppedCareer();
    for (const k of attention(c).filter((x) => x.startsWith('insp:'))) { const p = k.split(':')[1] as 'nh3'; if (c.plants[p].insp >= 6) decide(c, 'inspect', p); }
    if (!attention(c).some((k) => c.stopped!.includes(k))) expect(() => advance(c, 3)).not.toThrow();
  });
});

describe('the inspection: one state, one strike rule', () => {
  it('states are locked, ok, due and overdue by the months since the last inspection, and the card text carries the state word', () => {
    const c = initCareer(1, 'engineer');
    const kinds: string[] = [];
    for (let i = 0; i < 20; i++) { kinds.push(inspState(c, 'nh3').kind); stepMonth(c); }
    expect([...new Set(kinds)]).toEqual(['locked', 'ok', 'due', 'overdue']);
    const e = start(); const v = view(e);
    expect(v.plants[0].inspectionState).toBe('locked'); expect(v.plants[0].inspectionNote).toMatch(/^LOCKED/);
    for (let i = 0; i < 8; i++) act(e, 'advance', 1);
    expect(view(e).plants[0].inspectionNote).toMatch(/^OK/);
  });
  it('an inspection more than six months overdue at a year end is a strike, and not otherwise (the rule the card states)', () => {
    expect(INSPECT_STRIKE_OVER).toBe(6);
    expect(L['lv.CAREER.rule.strike']).toContain('{over} months');
    const c = initCareer(1, 'engineer'); for (const p of PLANTS) c.plants[p].insp = INSPECT_EVERY + INSPECT_STRIKE_OVER; c.m = 11; const s0 = c.strikes; stepMonth(c);
    expect(c.strikes - s0).toBeGreaterThanOrEqual(1);
    const d = initCareer(1, 'engineer'); for (const p of PLANTS) d.plants[p].insp = INSPECT_EVERY + INSPECT_STRIKE_OVER - 2; d.m = 11; const s1 = d.strikes; stepMonth(d);
    expect(d.strikes - s1).toBe(0);
  });
  it('the overdue card and the lever name the rule', () => {
    const e = start(); careerOf(e.state)!.plants.nh3.insp = 14;
    const note = view(e).plants[0].inspectionNote as string;
    expect(note).toMatch(/OVERDUE 2 month/); expect(note).toMatch(/strike/); expect(note).toMatch(/6 months/);
    expect(L['lv.CAREER.lever.inspect']).toMatch(/more than 6 months overdue/);
  });
});

describe('BOOK weighs the cost of booking against the expected cost of not booking', () => {
  it('a worn, fouled plant is worth renewing and a fresh one is not; the note says which, with both numbers', () => {
    const c = initCareer(1, 'engineer'); Object.assign(c.plants.nh3, { wear: 0.8, U: 0.6, insp: 18 });
    const worn = taWeigh(c, 'nh3', c.m + 2), fresh = taWeigh(initCareer(1, 'engineer'), 'nh3', 2);
    expect(worn.skipUSD).toBeGreaterThan(fresh.skipUSD);
    expect(fresh.saveUSD).toBeLessThan(fresh.bookUSD);
    expect(worn.skipUSD).toBeGreaterThanOrEqual(worn.afterUSD);
    expect(worn.netUSD).toBeCloseTo(worn.saveUSD - worn.bookUSD, 6);
    const e = start(); const n = (view(e).plants[0].taWeighNote as string[])[2]!;
    expect(n).toMatch(/Not yet worth it/); expect(n).toMatch(/MUSD now/); expect(n).toMatch(/incidents over twelve months/);
    const cc = careerOf(e.state)!; cc.plants.nh3.wear = 0.9; cc.plants.nh3.U = 0.55; cc.plants.nh3.insp = 20;
    expect((view(e).plants[0].taWeighNote as string[])[cc.m + 2]).toMatch(/Worth booking/);
  });
});

describe('names and noise', () => {
  it('the top ending is Flagship everywhere in the Career strings; no above-nominal note on the plant card', () => {
    for (const [k, v] of Object.entries(L).filter(([x]) => x.startsWith('lv.CAREER.'))) expect(v, k).not.toMatch(/Chief Engineer/);
    expect(L['lv.CAREER.end.label.chief']).toBe('Flagship');
    expect(L['lv.CAREER.endlog.end_chief']).toBe('Flagship');
    const e = start(); for (let i = 0; i < 6; i++) act(e, 'advance', 1);
    for (const p of view(e).plants) expect(p.outputNote).toBeUndefined();
  });
  it('the end slip carries the three flask rules, the third one stating the reference-engineer margin', () => {
    const e = start();
    const rules = (e.engine.q('levelInfo') as any).stars.rules as string[];
    expect(rules.length).toBe(3);
    expect(rules[2]).toMatch(/within 3 % of the reference engineer/); expect(rules[1]).toMatch(/^Flagship/);
  });
  it('alerts list each due inspection, worn catalyst and fouled exchanger with its plant', () => {
    const e = start(); const cc = careerOf(e.state)!;
    cc.plants.acid.cat = 0.6; cc.plants.meoh.U = 0.7; cc.plants.etoh.insp = 11;
    const a = view(e).dashboard.alerts as { kind: string; plant: string; text: string }[];
    expect(a.map((x) => `${x.kind}:${x.plant}`).sort()).toEqual(['cat:acid', 'foul:meoh', 'insp:etoh']);
    expect(alerts(cc).length).toBe(3);
    for (const x of a) expect(x.text.length).toBeGreaterThan(10);
  });
});
