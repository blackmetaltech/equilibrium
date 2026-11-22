// F31 (0.8 Career + incident): the round-11 desktop tester's findings that live in the engine.
//  - the incident level's call-it is graded against the design at the FIRST commission (frozen then), not the final purge; the same freeze is generic;
//  - the incident log row names the plant the incident is about; site-wide events name none;
//  - the incident is forewarned a month ahead by a notice NEXT DECISION stops on, from the seeded schedule (no schedule change);
//  - one figure, one source: the card, the plant and the intercom quote the same purge and catalyst;
//  - "N months past due at the check" is the check month less the due month; the yearly card says what an option buys or books.
// (Layout, the confirm keys and the intercom line are Godot-side: godot/tests/fix31_flow.gd.)
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { Env, Rng } from '@core/kit';
import { L02 } from './l02';
import { GAME } from '../game';
import type { EqState } from '../state';
import { CAREER, careerOf, incidentView, logLabel } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { CAREER_FIX_NH3_INERTS, DEFAULT_PRE, FIX_ID } from './career_fix';
import { INERT_STEPS, OLD_PURGE } from '../sim/career/incident';
import { CareerError, MONTHS, pendingDecision, advance, advanceToDecision, decide, eventOf, foreWarn, initCareer, pendingIncident, strikeAhead, type Career } from '../sim/career/model';
import { carefulDecisions } from '../sim/career/policy';
import { followerDecisions } from '../sim/career/human';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const tryDo = (c: Career, d: readonly unknown[]): void => { try { decide(c, d[0] as string, ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } };
const startFix = (): Env<EqState> => {
  const e = new Env(GAME); e.reset({ seed: 1003, level: FIX_ID, mode: 'learner' });
  expect(e.step({ name: 'levelAct', args: ['career', { ...DEFAULT_PRE }] }).info.ok).toBe(true);
  return e;
};
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const arIn = (e: Env<EqState>): number => CAREER_FIX_NH3_INERTS.measures(e.state).v.ar_in_pct!;

describe('F31: the call-it is graded against the first commission', () => {
  it('call, commission, retune, recommission: the truth and the grade stay with the first design', () => {
    const e = startFix();
    expect(e.step({ name: 'callIt', args: [24] }).info.ok).toBe(true);
    e.step({ name: 'setParam', args: ['X-108', 'frac', 0.035] }); e.step({ name: 'commission' });
    const first = arIn(e);
    expect(first).toBeGreaterThan(15);
    expect(info(e).callIt.truth).toBeCloseTo(first, 9);
    e.step({ name: 'setParam', args: ['X-108', 'frac', 0.018] }); e.step({ name: 'commission' });
    const last = arIn(e);
    expect(Math.abs(last - first)).toBeGreaterThan(1);   // the retune really moved the figure
    expect(info(e).callIt.truth).toBeCloseTo(first, 9);
    expect(info(e).callIt.ok).toBe(Math.abs(24 - first) / first <= 0.1);
    expect(info(e).stars.rules.length).toBe(3);
  });
  it('the star for the call uses the frozen truth too', () => {
    const e = startFix();
    e.step({ name: 'setParam', args: ['X-108', 'frac', 0.035] });
    const guess = 24; e.engine.q('levelInfo');
    e.step({ name: 'callIt', args: [guess] }); e.step({ name: 'commission' });
    const first = arIn(e);
    e.step({ name: 'setParam', args: ['X-108', 'frac', 0.03] }); e.step({ name: 'commission' });
    const earned = (info(e).stars.earned as boolean[])[1];
    expect(earned).toBe(Math.abs(guess - first) <= 0.1 * first && info(e).goals.every((g: any) => g.met));
  });
  it('a failed first commission freezes nothing; the first one that solves does', () => {
    const e = startFix();
    expect(((e.state.lv.callTruth as Record<string, number> | undefined) ?? {}).ar_pct).toBeUndefined();
    e.step({ name: 'commission' });
    expect((e.state.lv.callTruth as Record<string, number>).ar_pct).toBeCloseTo(arIn(e), 9);
  });
  it('the plant starts with nothing spent (the loop that stands is the Career\'s own)', () => {
    expect(info(startFix()).spentUSD).toBe(0);
  });
});

function untilIncident(seed: number, careful = true): Career {
  const c = initCareer(seed, 'engineer');
  for (let g = 0; g < MONTHS && c.ending === '' && pendingIncident(c) === null; g++) { if (careful) for (const d of carefulDecisions(c)) tryDo(c, d); advance(c, 1); }
  return c;
}

describe('F31: the freeze is generic (L02: the O2 the burner gas carries depends on the air the player sets)', () => {
  it('a retuned air flow moves the measured O2, never the graded truth of the call', () => {
    const e = new Env(GAME); e.reset({ seed: 7, level: 'L02', mode: 'learner' });
    for (const a of (L02.solver as any)(7)(e.state, e.ctx(new Rng(7)))) e.step(a);
    const t1 = info(e).callIt.truth as number;
    expect(Number.isFinite(t1)).toBe(true);
    const m1 = L02.measures(e.state).v.o2_pct!;
    expect(m1).toBeCloseTo(t1, 9);
    e.step({ name: 'setFeed', args: ['F-102', { flow: 1.6 * (e.state.feeds['F-102']!.flow) }] }); e.step({ name: 'commission' });
    expect(Math.abs(L02.measures(e.state).v.o2_pct! - m1)).toBeGreaterThan(0.5);   // the retune moved the measurement
    expect(info(e).callIt.truth).toBeCloseTo(t1, 9);
  });
});

describe('F31: the incident row names its plant', () => {
  it('feed_inerts is the ammonia loop, whatever plant the draw landed on; site-wide events name none', () => {
    let inerts = 0, site = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const c = initCareer(seed, 'engineer');
      while (c.ending === '' && c.m < 36) advance(c, 1);
      for (const l of c.log) {
        if (l.kind !== 'event') continue;
        if (l.code === 'feed_inerts') { inerts++; expect(l.plant).toBe('nh3'); expect(logLabel(l)).toMatch(/Ammonia/i); expect(logLabel(l)).not.toMatch(/Sulfuric/i); }
        if (l.code === 'cw_hot_day' || l.code === 'fuel_price') { site++; expect(l.plant).toBe(''); expect(logLabel(l)).not.toMatch(/ at /); }
      }
    }
    expect(inerts).toBeGreaterThan(3); expect(site).toBeGreaterThan(3);
  });
});

describe('F31: the incident is announced a month ahead, in one stop', () => {
  it('every incident (but one in the first two months, before the player has played) opens its card the month before the event; its effect starts at least a month after that', () => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const c = initCareer(seed, 'engineer');
      for (let g = 0; g < MONTHS && c.ending === ''; g++) {
        const i = pendingIncident(c);
        if (i !== null) {
          n++;
          if (i.m > 1) { expect(i.ann, `seed ${seed}`).toBe(true); expect(c.m, `seed ${seed}`).toBe(i.m - 1); }
          if (i.ann === true) expect(i.from - c.m, `seed ${seed}: effect starts at least a month after the card`).toBeGreaterThanOrEqual(1);
          expect(eventOf(c.seed, i.m)!.ev).toBe('feed_inerts');
          expect(c.log.some((l) => l.kind === 'fix' && l.code === (i.ann === true ? 'ahead' : 'open') && l.m === (i.ann === true ? c.m : i.m))).toBe(true);
          decide(c, 'incident', 'ignore');
        }
        advance(c, 1);
      }
    }
    expect(n).toBeGreaterThan(10);
  });
  it('the schedule is the seeded one (every event row is eventOf of its month); the answer made at the announcement applies when the event fires, with no second stop', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = initCareer(seed, 'engineer');
      for (let g = 0; g < 40 && c.ending === ''; g++) {
        const i = pendingIncident(c);
        if (i !== null && i.ann === true) {
          decide(c, 'incident', 'contractor');
          const choice = c.inc!;
          advance(c, 1);   // the month before the event runs
          if (c.ending !== '') break;
          expect(pendingIncident(c)).toBeNull();
          advance(c, 1);   // the event month: nothing new opens, the answered incident stands and is in force
          expect(pendingIncident(c)).toBeNull(); expect(c.inc).toBe(choice); expect(c.inc!.choice).toBe('contractor');
          continue;
        }
        if (i !== null) decide(c, 'incident', 'ignore');
        advance(c, 1);
      }
      for (const l of c.log) if (l.kind === 'event') expect(eventOf(c.seed, l.m)!.ev).toBe(l.code);
    }
  });
  it('NEXT DECISION stops once per incident: a skip player meets as many incident stops as incidents', () => {
    for (const seed of [1, 3, 5, 8]) {
      const c = initCareer(seed, 'engineer'); let stops = 0;
      for (let g = 0; g < 100 && c.ending === ''; g++) {
        for (const d of carefulDecisions(c)) tryDo(c, d);
        if ((c.stopped ?? []).length > 0 || pendingDecision(c) !== null) { try { decide(c, 'answer', 1); } catch { /* none */ } decide(c, 'ackWarning'); }
        if (pendingIncident(c) !== null) decide(c, 'incident', 'ignore');
        try { advanceToDecision(c); } catch (e) { if (!(e instanceof CareerError)) throw e; decide(c, 'ackWarning'); continue; }
        if (c.why?.kind === 'inc') stops++;
      }
      const incidents = c.log.filter((l) => l.kind === 'fix' && (l.code === 'ahead' || l.code === 'open')).length;
      expect(stops, `seed ${seed}`).toBeLessThanOrEqual(incidents);
    }
  });
  it('an event that would not open an incident (one is running) is not announced', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const c = initCareer(seed, 'engineer');
      for (let g = 0; g < 48 && c.ending === ''; g++) {
        const fw = foreWarn(c);
        if (fw !== null && c.inc != null) expect(fw.month).toBeGreaterThanOrEqual(c.inc.until);
        if (pendingIncident(c) !== null) decide(c, 'incident', 'ignore');
        advance(c, 1);
      }
    }
  });
});

describe('F31: one figure, one source', () => {
  it('the card, the plant and the log quote the same purge and the same catalyst (and 0.5 % is not 1 %)', () => {
    let k = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const c = untilIncident(seed);
      const i = pendingIncident(c);
      if (i === null) continue;
      k++;
      const v = incidentView(c)!;
      expect(String(v.body)).toContain('old 0.5 %'); expect(String(v.body)).not.toMatch(/old 1 %/);
      const live = Math.round(c.plants.nh3.cat * 100);   // the plant health bar and the plant view
      expect(Math.round(i.cat * 100)).toBe(live); expect(Math.round(i.pre.cat * 100)).toBe(live);
      expect(String(v.body)).toContain(`catalyst is at ${live} %`);
      expect(i.pre.price).toBeCloseTo(c.prices.nh3, 1);
      const e = new Env(GAME); e.reset({ seed: 1003, level: FIX_ID, mode: 'learner' }); e.step({ name: 'levelAct', args: ['career', i.pre] });
      expect(info(e).note[0]).toContain(`catalyst is at ${live} %`); expect(info(e).note[0]).toContain('old 0.5 %');
      expect(String((v.options as any[])[1].text)).toContain('0.5 %');
      expect(INERT_STEPS).toContain(i.y); expect(OLD_PURGE).toBe(0.005);
    }
    expect(k).toBeGreaterThan(2);
  });
});

describe('F31: the strike line counts from the due month', () => {
  it('"N months past due at the check" is the check month less the due month', () => {
    const c = initCareer(1, 'engineer');
    while (c.ending === '' && c.m < 25) { for (const d of followerDecisions(c)) tryDo(c, d); advance(c, 1); }
    c.plants.nh3.insp = 12; c.plants.nh3.ta = -1;
    const a = strikeAhead(c).find((x) => x.plant === 'nh3')!;
    expect(a.dueMonth).toBe(26); expect(a.checkMonth).toBe(36);
    const e = new Env(GAME); e.reset({ seed: 1, level: 'CAREER', mode: 'engineer' });
    (e.state.lv as Record<string, unknown>).c = c;
    const line = (e.engine.q('levelView') as any).dashboard.strikeLines.find((x: string) => x.startsWith('Ammonia'))!;
    expect(line).toContain(`${a.checkMonth - a.dueMonth} months past due at the check`);   // 36 - 26 = 10, the regulator count being 11
    expect(careerOf(e.state)).toBe(c);
  });
});

describe('F31: a yearly card option that buys or books says so', () => {
  it('commitShort names what a choice buys or books; an option that only declines says nothing', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' });
      const c = careerOf(e.state)!;
      for (let y = 0; y < 4 && c.ending === ''; y++) {
        const d = (e.engine.q('levelView') as any).dashboard.decision;
        if (d !== null && d.pending) {
          const opts = d.options as { label: string; commitShort: string; commitText: string }[];
          seen.add(d.kind);
          if (d.kind === 'crew') for (const o of opts) expect(o.commitShort).toMatch(/BOOKS MONTH \d+/);
          if (d.kind === 'turnaround') { expect(opts[0]!.commitShort).toMatch(/BOOKS MONTH \d+/); expect(opts[0]!.commitText).toMatch(/^Choosing this: .*books the /); expect(opts[1]!.commitShort).toBe(''); }
          if (d.kind === 'contract') { expect(opts[0]!.commitShort).toBe('SIGNS THE CONTRACT'); expect(opts[1]!.commitShort).toBe(''); }
          if (d.kind === 'turnaround' || d.kind === 'crew') { const stock0 = c.plants[pendingDecision(c)!.plant as 'nh3'].stock === 0; expect(opts[0]!.commitShort.startsWith('BUYS CATALYST')).toBe(stock0); }
        }
        tryDo(c, ['answer', 1]); advance(c, 1); while (c.ending === '' && c.m % 12 !== 0) advance(c, 1);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
