// Gate 0.5: the Career has endings a player can steer toward; every year review announces the course and what would move the Works toward the other ending; the board strip lists all four.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { endingsView, outlookNote } from './career';
import { carefulDecisions, cautiousDecisions, naiveDecisions, playCareer as run } from '../sim/career/policy';
import { initCareer, outlook } from '../sim/career/model';

describe('career endings', () => {
  it('the strip lists Sold, Shut, Steady and Flagship with needs, from month 0, with no raw keys', () => {
    const v = endingsView(initCareer(1, 'engineer'));
    expect(v.rows.map((r) => r.id)).toEqual(['sold', 'shut', 'steady', 'chief']);
    for (const r of v.rows) {
      expect(r.label).not.toMatch(/lv\.CAREER/);
      expect(r.needs.length).toBeGreaterThan(0);
      for (const n of r.needs) expect(n.text).not.toMatch(/lv\.CAREER|\{/);
    }
    expect(v.rows.find((r) => r.id === 'chief')!.needs.map((n) => n.text).join(' ')).toMatch(/Victor/);
  });
  it('a careful run is announced as the flagship course and says what would move it to Steady; a cautious run is announced as Steady and says what would move it to Flagship', () => {
    const a = run(1, carefulDecisions), b = run(1, cautiousDecisions);
    for (const y of a.years) {
      const n = outlookNote(y.outlook!);
      expect(n).toMatch(/^COURSE: /);
      expect(n).toMatch(/What would move/);
      expect(n).not.toMatch(/lv\.CAREER|\{/);
    }
    expect(outlookNote(a.years[a.years.length - 1]!.outlook!)).toMatch(/COURSE: FLAGSHIP.*toward Steady/);
    expect(outlookNote(b.years[b.years.length - 1]!.outlook!)).toMatch(/COURSE: STEADY.*toward Flagship: .*margin/);
    expect(outlook(a).rows.find((r) => r.id === 'chief')!.state).toBe('achieved');
    expect(outlook(b).rows.find((r) => r.id === 'steady')!.state).toBe('achieved');
    expect(outlook(b).rows.find((r) => r.id === 'chief')!.state).toBe('closed');
  });
  it('a naive career ends sold or shut and its reviews warned of it', () => {
    const c = run(2, naiveDecisions);
    expect(['sold', 'shut']).toContain(c.ending);
    expect(c.years.length === 0 || c.years.some((y) => ['sold', 'shut'].includes(y.outlook!.course))).toBe(true);
  });
});
