// F9c: Career review explains revenue, splits capex from operating margin, Victor does not punish investment, Mara sees fouling, one product name, cap notice, gas-price note.
import { describe, expect, it } from 'vitest';
import { en } from '../locales/en';
import { CAREER, referenceCareer, revenueNote } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { advance, decide, initCareer, MARGIN_TARGET_YEAR, previewInvest } from '../sim/career/model';
import { naiveDecisions } from '../sim/career/policy';
import { levelsCareer } from '../locales/en/levels_career';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }

describe('career review (F9c)', () => {
  const c = referenceCareer(1003, 'engineer');
  it('operating margin + investments = net each year; capex is not in the operating margin', () => {
    for (const y of c.years) {
      expect(y.opMargin).toBeCloseTo(y.rev - y.cost - y.pen, 0);
      expect(y.opMargin - y.inv).toBeCloseTo(y.margin, 0);
    }
    expect(c.years[0]!.inv).toBeGreaterThan(0);
  });
  it('following the payback advice (investing in year 1) does not score Victor 0, and Victor ignores the price of investments', () => {
    expect(c.years[0]!.inv).toBeGreaterThan(10e6);
    expect(c.years[0]!.victor).toBeGreaterThan(0);
    const y = c.years[0]!;
    expect(y.victor).toBe(Math.max(0, Math.min(100, Math.round((y.opMargin / MARGIN_TARGET_YEAR) * 100))));
  });
  it('revenue note gives numbers: volume, price, outage, catalyst, U, contracts', () => {
    const y1 = c.years[1]!, note = revenueNote(y1, c.years[0]);
    expect(note).toMatch(/Volume [+-]\d/); expect(note).toMatch(/Price [+-]\d/); expect(note).toMatch(/plant-days/); expect(note).toMatch(/catalyst activity/); expect(note).toMatch(/Contracts took|No contracts were running/);
    expect(revenueNote(c.years[0]!, undefined)).toMatch(/REVENUE: /);
    const p0 = c.years[0]!.rev / c.years[0]!.tonnes, vol = (y1.tonnes - c.years[0]!.tonnes) * p0, pr = (y1.rev / y1.tonnes - p0) * y1.tonnes;
    expect(vol + pr).toBeCloseTo(y1.rev - c.years[0]!.rev, 0);
  });
  it('Mara loses points for a fouled exchanger and worn catalyst', () => {
    const worn = initCareer(3, 'engineer'), fresh = initCareer(3, 'engineer');
    for (const p of ['nh3', 'acid', 'meoh', 'etoh'] as const) { worn.plants[p].U = 0.7; worn.plants[p].cat = 0.74; }
    decide(worn, 'invest', 'heat'); decide(worn, 'invest', 'heat'); decide(worn, 'invest', 'heat');
    for (let i = 0; i < 12; i++) { advance(worn, 1); advance(fresh, 1); }   // one month at a time: a multi-month advance now stops at attention flags
    expect(worn.years[0]!.mara).toBeLessThan(fresh.years[0]!.mara);
    expect(worn.years[0]!.mara).toBeLessThan(90);
  });
  it('the emissions cap tightening is announced in the log at each year end', () => {
    const notes = c.log.filter((l) => l.kind === 'notice');
    expect(notes.length).toBe(4);
    expect(notes[0]!.n).toBe(Math.round((1.65e6 * 0.98) / 1000));
    expect(en['lv.CAREER.log.notice']).toMatch(/cap/);
  });
  it('one name per product, formula in brackets once; heat saving is stated at the current gas price', () => {
    expect(levelsCareer['lv.CAREER.plant.etoh']).toBe('Ethanol (C2H5OH)');
    expect(levelsCareer['lv.CAREER.plant.nh3']).toBe('Ammonia (NH3)');
    expect(levelsCareer['lv.CAREER.plant.acid']).toBe('Sulfuric acid (H2SO4)');
    expect(levelsCareer['lv.CAREER.plant.meoh']).toBe('Methanol (CH3OH)');
    expect(JSON.stringify(levelsCareer)).not.toMatch(/distillery/i);
    expect(levelsCareer['lv.CAREER.invest.heat']).toMatch(/at the current gas price/);
    expect(previewInvest(initCareer(1, 'engineer'), 'heat').saveUSDPerMonth).toBeGreaterThan(0);
  });
  it('a naive career still ends badly (scoring change did not make it easy)', () => {
    const n = initCareer(1003, 'engineer');
    while (n.ending === '') { for (const d of naiveDecisions(n)) { try { decide(n, d[0], ...d.slice(1)); } catch { /* refused */ } } advance(n, 1); }
    expect(['sold', 'shut']).toContain(n.ending);
  });
});
