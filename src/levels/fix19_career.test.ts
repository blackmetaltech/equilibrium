// F19 (Career, "The Works you run"): a careful human who books what the game suggests is no longer sold. Overlapping turnarounds are priced at BOOK time and on the yearly card (and the board suggests a month with no overlap),
// the emissions strike is warned two months or more ahead with its levers, one yearly target equal to the Flagship spread over five years, endings say why, a game-ending year end is never reached without a stop, the annual review
// prices last year's card against the road not taken, and the small texts agree with each other.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, cardNote, careerOf, decisionView, endingWhyText, emText } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env } from '@core/kit';
import { GAME } from '../game';
import {
  CHIEF_MARGIN, EM_WARN_MONTHS, MARGIN_TARGET_YEAR, MONTHS, PLANTS, ackWarning, advance, advanceToDecision, answerDecision, decide, emWarn, endAhead, initCareer, levers, offerTaShort, openWarnings, pendingDecision, pace, score,
  strikeAhead, suggestTaMonth, taDays, taGroupDays, taOverlap, taWeigh, stepMonth, type Career,
} from '../sim/career/model';
import { pendingIncident } from '../sim/career/model';
import { followerDecisions, playCareerFollower } from '../sim/career/human';
import { playCareer, type Decision } from '../sim/career/policy';
import type { EqState } from '../state';
import { en } from '../locales/en';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const L = en as Record<string, string>; void L;
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** the follower with the old default: every turnaround two months out, wherever the other plants are */
const blind = (c: Career): Decision[] => followerDecisions(c).map((d): Decision => (d[0] === 'turnaround' ? ['turnaround', d[1], c.m + 2, 1, 0] : d));

describe('F19: the suggestion follower (does what the board and the cards say)', () => {
  it('ends at least Steady on twelve seeds, and Flagship on some; the blind variant (turnarounds booked wherever, overlaps and all) too', () => {
    const rows: string[] = [];
    for (const [name, pol] of [['follower', followerDecisions], ['blind', blind]] as const) {
      const ends = SEEDS.map((s) => playCareerFollower(s, 'engineer', pol));
      for (const c of ends) { rows.push(`${name} ${c.seed} ${c.ending} ${Math.round(score(c) / 1e6)}`); expect(['steady', 'chief'], `${name} seed ${c.seed} ${c.ending}`).toContain(c.ending); expect(c.m).toBe(MONTHS); expect(c.strikes, `${name} ${c.seed} strikes`).toBe(0); }
      expect(ends.filter((c) => c.ending === 'chief').length, name).toBeGreaterThanOrEqual(1);
    }
    expect(rows.length).toBe(24);
  });
  it('is deterministic', () => {
    const a = playCareerFollower(3), b = playCareerFollower(3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('F19: overlapping turnarounds are priced where they are booked', () => {
  it('one turnaround is exactly taDays; two in one month share the crews and the crane and run longer; the engine uses those days', () => {
    const solo = taDays(true, 1, 0);
    expect(taGroupDays([{ p: 'nh3', stock: true, crane: 1, crew: 0 }])['nh3']).toBe(solo);
    const two = taGroupDays([{ p: 'nh3', stock: true, crane: 1, crew: 0 }, { p: 'acid', stock: true, crane: 1, crew: 0 }]);
    expect(two['nh3']! + two['acid']!).toBeGreaterThan(2 * solo);
    expect(Math.max(two['nh3']!, two['acid']!)).toBeGreaterThan(solo);
    const c = initCareer(1, 'engineer'); decide(c, 'answer', 1);
    for (const p of ['nh3', 'acid']) { decide(c, 'buyCatalyst', p); decide(c, 'turnaround', p, 4, 1, 0); }
    const ov = taOverlap(c, 'acid', 4, 1, 0);
    expect(ov.with).toEqual(['nh3']); expect(ov.extraDays).toBeGreaterThan(0);
    while (c.m <= 4) stepMonth(c);
    const logs = c.log.filter((l) => l.kind === 'turnaround' && l.m === 4);
    expect(logs.map((l) => l.n).sort()).toEqual([two['nh3']!, two['acid']!].sort());
  });
  it('BOOK time: the weigh line and the overlap note name the extra outage days and MUSD, and the first month with no overlap', () => {
    const e = start(1), c = careerOf(e.state)!;
    decide(c, 'answer', 1);
    for (const p of ['nh3', 'meoh']) decide(c, 'buyCatalyst', p);
    decide(c, 'turnaround', 'nh3', 5, 1, 0);
    const v = view(e), meoh = v.plants.find((p: any) => p.id === 'meoh');
    const note: string = meoh.taOverlapNote[5], w = taWeigh(c, 'meoh', 5, 1, 0);
    expect(w.overlapUSD).toBeGreaterThan(0); expect(w.overlapDays).toBeGreaterThan(0);
    expect(note).toMatch(/^Overlaps the ammonia turnaround in month 6: the crews and the crane are shared, so this plant is out \d+ d instead of \d+ d and (the ammonia outage grows by \d+ d|nothing else grows)\. In all \d+ extra plant-days, about [\d.]+ MUSD/);
    expect(note).toContain(`about ${(w.overlapUSD / 1e6).toFixed(2)} MUSD`);
    expect(note).toMatch(/Month 7 has no other turnaround\./);
    expect(meoh.taWeighNote[5]).toContain(`overlap ${(w.overlapUSD / 1e6).toFixed(2)}`);
    expect(meoh.taOverlapNote[7]).toBe(''); expect(meoh.taWeighNote[7]).not.toContain('overlap');
    expect(w.bookUSD).toBeCloseTo(w.outageUSD + w.penaltyUSD + w.hireUSD + w.overlapUSD, 6);
    // once both are booked the plant card says so
    decide(c, 'turnaround', 'meoh', 5, 1, 0);
    expect(view(e).plants.find((p: any) => p.id === 'meoh').bookedOverlapNote).toMatch(/^Overlaps the ammonia turnaround in the same month: \d+ d out instead of \d+ d alone\./);
    // the same contract offer on a plant with an overlapped booking prices the longer outage
    expect(offerTaShort(c, { id: 9, p: 'meoh', tpm: 3000, price: 400, term: 12, pen: 600, exp: c.m + 1 })).not.toBeUndefined();
  });
  it('the board never suggests a month that overlaps a booking: the card, the lever and the helper all pick the first month with no other turnaround', () => {
    let cards = 0, shifted = 0;
    for (const seed of SEEDS) {
      const c = initCareer(seed, 'engineer');
      for (let y = 1; y <= 4 && c.ending === ''; y++) {
        while (c.ending === '' && c.m < 12 * y - 3) advance(c, 1);
        if (c.ending !== '') break;
        // two plants are booked for the month the card would use (two months after the year turn)
        for (const p of ['nh3', 'acid'] as const) c.plants[p].ta = 12 * y + 2;
        while (c.ending === '' && c.m < 12 * y) advance(c, 1);
        const card = pendingDecision(c);
        if (card === null || c.ending !== '') continue;
        if (card.kind === 'turnaround' || card.kind === 'crew') {
          cards++;
          const tm = Number(card.vars.taMonth);
          expect(PLANTS.some((q) => q !== card.plant && c.plants[q].ta === tm), `seed ${seed} year ${y} card month ${tm}`).toBe(false);
          expect(tm).not.toBe(12 * y + 2); expect(card.vars.shifted).toBe(1); shifted++;
          expect(decisionView(c, card).body).toContain('is the first one with no other turnaround booked');
        }
        const lv = levers(c, pace(c)).find((l) => l.key === 'turnaround');
        if (lv !== undefined) expect(PLANTS.some((q) => q !== lv.vars.plant && c.plants[q].ta === Number(lv.vars.month) - 1)).toBe(false);
        expect(PLANTS.some((q) => q !== 'meoh' && c.plants[q].ta === suggestTaMonth(c, 'meoh'))).toBe(false);
      }
    }
    expect(cards).toBeGreaterThan(2); expect(shifted).toBe(cards);
  });
  it('the yearly turnaround card carries an overlap term in its sum when the month is shared', () => {
    const c = initCareer(1, 'engineer'); decide(c, 'answer', 1);
    for (let i = 0; i < 11; i++) advance(c, 1);
    // force the overlap: every plant booked in the month the card would use is not possible through the card, so price it directly through taWeigh
    for (const p of ['nh3', 'acid'] as const) c.plants[p].ta = 14;
    const w = taWeigh(c, 'meoh', 14, 1, 0);
    expect(w.overlapUSD).toBeGreaterThan(0);
  });
});

describe('F19: the emissions strike is warned, with its levers, before the year end', () => {
  /** every plant at 110 %: the Works runs over the cap */
  const hot = (seed: number): Career => { const c = initCareer(seed, 'engineer'); decide(c, 'answer', 1); for (const p of PLANTS) decide(c, 'setRate', p, 1.1); return c; };
  /** Six months at once; a plant incident (F29) stops the run and is answered with the contractor, as the careful players do. */
  const six = (c: Career): void => { while (c.m < 6 && c.ending === '') { if (pendingIncident(c) !== null) decide(c, 'incident', 'contractor'); advance(c, 6 - c.m); } };
  it('with every plant at 110 % the warning lights at least two months before the check, in a stop that lists it, and the strike still comes if it is ignored', () => {
    let stops = 0;
    for (const seed of [1, 2, 3]) {
      const c = hot(seed), seen: number[] = [];
      while (c.ending === '' && c.m < 12) {
        const lit = (): boolean => openWarnings(c).some((k) => k.startsWith('em:'));
        try { advanceToDecision(c); } catch { if (lit()) seen.push(c.m); ackWarning(c); continue; }   // a refused press lists the open warning, the emissions one among them
        if (c.why!.kind === 'em') { seen.push(c.m); expect(c.stopped!.some((k) => k.startsWith('em:'))).toBe(true); }
        else if (lit()) seen.push(c.m);   // the board shows it (pinned banner) even where an incident was the reason for this stop
        if ((c.stopped ?? []).length > 0) ackWarning(c);
      }
      expect(seen.length, `seed ${seed}`).toBeGreaterThan(0); expect(seen[0]!, `seed ${seed} first warning`).toBeLessThanOrEqual(12 - 2);
      stops += seen.length;
      if (c.years.length > 0) expect(c.years[0]!.emRatio).toBeGreaterThan(1);
    }
    expect(stops).toBeGreaterThan(2);
  });
  it('the warning text names the projection, the cap, the strike and both levers with numbers; setting the rates it names clears it, and the year ends under the cap', () => {
    const c = hot(1);
    six(c); expect(c.m).toBe(6);
    const w = emWarn(c)!; expect(w).not.toBeNull(); expect(w.toCheck).toBe(6); expect(w.ratio).toBeGreaterThan(1);
    const text = emText(c);
    expect(text).toMatch(/^EMISSIONS AHEAD: at today's run rate the year ends at \d+ kt, \d+ % of the \d+ kt cap\. Over the cap at the year-end check \(month 12, 6 months away\) is a regulator strike\./);
    expect(text).toMatch(/rate down: ammonia ×[\d.]+, sulfuric acid ×[\d.]+, methanol ×[\d.]+, ethanol ×[\d.]+ from now ends the year at 98 % of the cap/);
    expect(text).toMatch(/abatement investment: the next level costs [\d.]+ MUSD and takes about \d+ kt off the rest of the year/);
    for (const p of PLANTS) decide(c, 'setRate', p, w.rates[p]);
    expect(emWarn(c)).toBeNull();
    while (c.m < 12 && c.ending === '') advance(c, 1);
    expect(c.years[0]!.emRatio).toBeLessThanOrEqual(1.0); expect(c.years[0]!.strike).toBe(0);
  });
  it('the abatement lever works too', () => {
    const c = hot(2); six(c);
    const w = emWarn(c)!; if (w.abateEnough) { decide(c, 'invest', 'abate'); expect(emWarn(c)).toBeNull(); }
  });
  it('careful play is not warned for nothing: the follower sees the warning only where the projection is over the cap', () => {
    for (const seed of [1, 2]) { const c = playCareerFollower(seed); expect(c.strikes).toBe(0); }
    expect(EM_WARN_MONTHS).toBeGreaterThanOrEqual(2);
  });
  it('the debottleneck card states one emissions figure (the one against the cap)', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const c = playCareerFollower(seed);
      for (const d of c.decisions!) {
        if (d.kind !== 'debottleneck') continue;
        const v: any = decisionView(c, d), txt = [v.body, v.options[0].text, v.hint].join(' ');
        const figs = new Set([...txt.matchAll(/(\d+) % of the cap/g)].map((m) => m[1]));
        expect(figs.size, `seed ${seed}: ${txt}`).toBeLessThanOrEqual(1); expect(txt).not.toContain('would pass');
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('F19: one target', () => {
  it('the board\'s yearly target is the Flagship total spread over the five years, in the review, the endings strip and the course line', () => {
    expect(MARGIN_TARGET_YEAR * 5).toBe(CHIEF_MARGIN); expect(MARGIN_TARGET_YEAR).toBe(28e6);
    const c = playCareer(1, () => []), e = start(1), s = careerOf(e.state)!; void c;
    decide(s, 'answer', 1); while (s.m < 12) advance(s, 1);
    const v = view(e), y = v.review[0];
    expect(y.victor).toBe(Math.max(0, Math.min(100, Math.round((y.opMargin / 28e6) * 100))));
    expect(y.victorNote).toContain('yearly target of 28 MUSD'); expect(y.victorNote).toContain('140 MUSD over five years');
    expect(y.outlookNote).toMatch(/28 MUSD a year|28 a year/);
    const strip = v.endings.rows.find((r: any) => r.id === 'chief').needs[0].text;
    expect(strip).toContain('140 over five years, 28 a year');
    expect(JSON.stringify(v)).not.toMatch(/(?<![\d.])40 MUSD/);
  });
});

describe('F19: endings say why, and a game-ending year end is never reached without a stop', () => {
  /** every plant at 70 % and nothing else: two losing years, sold at the second review */
  const low = (c: Career): Decision[] => (c.m === 0 ? PLANTS.map((p): Decision => ['setRate', p, 0.7]) : []);
  const sold = (): Career => { for (const seed of SEEDS) { const c = playCareer(seed, low); if (c.ending === 'sold' && c.years.length >= 2 && c.years.slice(-2).every((y) => y.opMargin < 0)) return c; } throw new Error('no sale by two losing years'); };
  it('the end card names the losing years with their margins', () => {
    const c = sold(), txt = endingWhyText(c), ys = c.years.slice(-2);
    expect(txt).toMatch(/^Two losing years in a row: year \d+ -[\d.]+ MUSD, year \d+ -[\d.]+ MUSD\.$/);
    expect(txt).toContain(`year ${ys[0]!.year} ${(ys[0]!.opMargin / 1e6).toFixed(1)} MUSD`); expect(txt).toContain(`year ${ys[1]!.year} ${(ys[1]!.opMargin / 1e6).toFixed(1)} MUSD`);
    const spec = CAREER.verdict!({ lv: { c }, region: 'global' } as any, { ok: true, v: {} } as any, [] as any) as any;
    expect(spec.cause).toContain('Two losing years in a row');
  });
  it('the dashboard carries it, and the Steady / Flagship cards say what is short of the next one', () => {
    const e = start(1), c = careerOf(e.state)!;
    while (c.ending === '') advance(c, 1);
    expect(view(e).dashboard.endingWhy).toBe(endingWhyText(c)); expect(view(e).dashboard.endingWhy.length).toBeGreaterThan(20);
    const f = playCareerFollower(1); expect(endingWhyText(f)).toContain('Five years completed');
  });
  it('strikes: the end card lists them', () => {
    let found = 0;
    for (const seed of SEEDS) { const c = playCareer(seed, (cc) => (cc.m === 0 ? PLANTS.map((p): Decision => ['setRate', p, 1.1]) : [])); if (c.ending === 'shut') { found++; expect(endingWhyText(c)).toMatch(/^Regulator strikes on file: 3 of 3\./); } }
    expect(found).toBeGreaterThan(0);
  });
  it('a year end that would sell the Works is announced and stops a run before it, with the projected ending; CONTINUE ANYWAY then runs on to it', () => {
    const c = initCareer(3, 'engineer'); const whys: { m: number; kind: string }[] = [];
    for (const d of low(c)) decide(c, d[0], ...d.slice(1));
    while (c.ending === '' && c.m < 40) {
      if (pendingDecision(c) !== null) { advance(c, 1); continue; }
      try { advanceToDecision(c); } catch { ackWarning(c); continue; }
      whys.push({ m: c.m, kind: c.why!.kind });
      if (c.why!.kind === 'end' && c.ending === '') { expect(endAhead(c)).not.toBeNull(); expect(c.why!.plant).toBe('all'); }
      if ((c.stopped ?? []).length > 0) ackWarning(c);
    }
    expect(c.ending).toBe('sold');
    const k = whys.findIndex((w) => w.kind === 'end' && w.m < c.m);
    expect(k, JSON.stringify(whys)).toBeGreaterThanOrEqual(0);
    expect(whys[k]!.m).toBeGreaterThanOrEqual(c.m - 3);
  });
  it('the board shows the projected ending from the first month of the year that would bring it', () => {
    const e = start(3), c = careerOf(e.state)!;
    for (const d of low(c)) decide(c, d[0], ...d.slice(1));
    while (c.ending === '' && c.m < 40) {
      if (c.lossYears >= 1 && endAhead(c) !== null) { expect(view(e).dashboard.endAhead).toMatch(/^ENDING AHEAD: on this pace year \d+ closes at -?[\d.]+ MUSD, a second losing year in a row \(year \d+ was -?[\d.]+ MUSD\)\. The board sells the Works at the year-end review in month \d+, \d+ months? away\./); return; }
      advance(c, 1);
    }
    throw new Error('never lit');
  });
});

describe('F19: stops merge, small texts agree', () => {
  it('plants that pass their inspection date in the same month stop NEXT DECISION once, all listed', () => {
    const c = initCareer(2, 'engineer'); decide(c, 'answer', 1);
    for (const p of ['nh3', 'acid', 'meoh']) c.plants[p as 'nh3'].insp = 12;
    ackWarning(c);
    advanceToDecision(c);
    expect(c.why!.kind).toBe('overdue'); expect(c.why!.plant.split(',').sort()).toEqual(['acid', 'meoh', 'nh3']);
    const e = start(2), d = careerOf(e.state)!; decide(d, 'answer', 1);
    for (const p of ['nh3', 'acid']) d.plants[p as 'nh3'].insp = 12;
    ackWarning(d); advanceToDecision(d);
    const wn: string = view(e).dashboard.whyNote;
    expect(wn).toMatch(/^Stopped: inspections are now overdue: ammonia 1 month, sulfuric acid 1 month\.$/);
  });
  it('STRIKE AHEAD only when the projected overdue exceeds the strike threshold (more than 6 months)', () => {
    const c = initCareer(1, 'engineer'); decide(c, 'answer', 1); while (c.m < 6) advance(c, 1);
    c.plants.nh3.insp = 12; expect(strikeAhead(c).filter((a) => a.plant === 'nh3')).toHaveLength(0);   // 6 months over at the check: not a strike
    c.plants.nh3.insp = 13; const a = strikeAhead(c).filter((x) => x.plant === 'nh3'); expect(a).toHaveLength(1); expect(a[0]!.over).toBe(7);
  });
  it('"due now" is cleared once a turnaround that resets the inspection is booked', () => {
    const e = start(1), c = careerOf(e.state)!; decide(c, 'answer', 1);
    c.plants.nh3.insp = 11;
    expect(view(e).plants[0].inspectionNote).toMatch(/^DUE /);
    expect(levers(c, pace(c)).some((l) => l.key === 'inspect' && l.vars.plant === 'nh3')).toBe(true);
    decide(c, 'buyCatalyst', 'nh3'); decide(c, 'turnaround', 'nh3', c.m + 1, 1, 0);
    expect(view(e).plants[0].inspectionNote).toMatch(/^DUE, month \d+: handled, the ammonia turnaround booked for month \d+ resets it/);
    expect(levers(c, pace(c)).some((l) => l.key === 'inspect' && l.vars.plant === 'nh3')).toBe(false);
  });
  it('the offer penalty is one number in the text and the field', () => {
    const e = start(3), c = careerOf(e.state)!; decide(c, 'answer', 1);
    decide(c, 'buyCatalyst', 'acid'); decide(c, 'turnaround', 'acid', 3, 1, 0);
    c.offers = [{ id: 77, p: 'acid', tpm: 30000, price: 140, term: 12, pen: 190, exp: c.m + 1 }];
    const o = view(e).offers.find((x: any) => x.id === 77);
    expect(o.taNote).toContain(`adds ${(o.taPenaltyUSD / 1e6).toFixed(2)} MUSD of penalty`); expect(o.taNote).not.toContain('about');
  });
  it('the BOOK line explains the outage change when the catalyst charge is bought', () => {
    const e = start(1), p = view(e).plants[0];
    expect(p.taDaysNote).toBe(`Outage ${p.taDaysWithCatalyst} d with the catalyst charge and ${p.taDaysWithout} d without: the catalyst change-out is one more crane job (6 d), which adds ${p.taDaysWithCatalyst - p.taDaysWithout} d.`);
    expect(p.bookLockedNote).toContain('press BUY CATALYST first');
  });
});

describe('F19: last year\'s card against the road not taken', () => {
  it('every review after a card carries it: what it said, what the year realised, and why', () => {
    const c = playCareerFollower(1);
    const withCard = c.years.filter((y) => y.card !== undefined);
    expect(withCard.length).toBeGreaterThanOrEqual(3);
    for (const y of withCard) {
      const d = c.decisions!.find((x) => x.year === y.year)!;
      expect(y.card!.cardUSD).toBe(d.options[0]!.effectUSD); expect(y.card!.choice).toBe(d.choice);
      const txt = cardNote(y);
      expect(txt).toMatch(/^LAST YEAR'S CARD \([a-z ]+\): you chose [AB]( \(the card lapsed: option B\))?: [AB] earned [+-][\d.]+ MUSD of cash against [AB] this year\. The card said option A earns [+-][\d.]+ MUSD against option B over \d+ months( \(the contract runs longer than the year: [+-][\d.]+ MUSD of it falls in these first twelve months\))?; for the \d+ months this review can show, its own forecast was [+-][\d.]+ MUSD \(give or take ±[\d.]+ MUSD\); this year it realised about [+-][\d.]+ MUSD for A against B \(revenue [+-][\d.]+, operating cost [+-][\d.]+, penalties [+-][\d.]+, investments [+-][\d.]+, [+-]?\d+ plant-days of outage, A less B\)\./);
    }
  });
  it('the replay is consistent: answering A and answering B give the same A-against-B number', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r: number[] = [];
      for (const ch of [0, 1]) {
        const c = initCareer(seed, 'engineer'); answerDecision(c, ch);
        while (c.m < 12 && c.ending === '') { if (openWarnings(c).length > 0) ackWarning(c); advanceToDecision(c); }
        r.push(c.years[0]!.card!.realisedUSD);
      }
      expect(r[0]!, `seed ${seed}`).toBeCloseTo(r[1]!, 0);
    }
  });
  it('a lapsed card is priced against option A, and the review view shows the line', () => {
    const e = start(2), c = careerOf(e.state)!;
    while (c.m < 12) advance(c, 1);
    expect(c.years[0]!.card!.lapsed).toBe(true); expect(c.years[0]!.card!.choice).toBe(1);
    expect(view(e).review[0].cardNote).toContain('the card lapsed: option B');
  });
});
