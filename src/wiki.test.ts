// The player wiki (site/wiki) is generated from the game's own text and data by scripts/wiki.ts. WIKI_WRITE=1 writes it; otherwise this test fails
// when a committed page is stale (a string changed and the wiki was not regenerated) or when the wiki says something the build no longer does.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SPECS } from './levels/registry';
import { CHAPTERS, NO_SHOT, PLATFORMS, isNewLook, releaseOf, releasePlatforms, wikiPages, worksMap } from '../scripts/wiki';

const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'site', 'wiki');
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const pages = wikiPages();
const ids = SPECS.map((s) => s.id).filter((i) => /^L\d\d$/.test(i));

describe('player wiki', () => {
  it('site/wiki matches the game text', () => {
    if (process.env.WIKI_WRITE === '1') { mkdirSync(DIR, { recursive: true }); for (const [f, h] of Object.entries(pages)) writeFileSync(join(DIR, f), h); }
    for (const [f, h] of Object.entries(pages)) {
      expect(existsSync(join(DIR, f)), f).toBe(true);
      expect(readFileSync(join(DIR, f), 'utf8'), f + ' is stale: WIKI_WRITE=1 npx vitest run src/wiki.test.ts').toBe(h);
    }
    expect(Object.keys(pages)).toEqual(expect.arrayContaining(['chapter-3.html', 'how.html', 'controls.html', 'career.html', 'codex.html']));
    expect(pages['chapter-3.html']).toContain('Two Flasks');
  });
  it('has a page for every chapter, no unrendered keys, and every image exists with its size, alt text and lazy loading', () => {
    expect(Object.keys(pages).length).toBe(5 + CHAPTERS.length);
    for (const [f, html] of Object.entries(pages)) {
      expect(html, f).not.toMatch(/\{[a-zA-Z_0-9]+\}/);
      expect(html, f).not.toMatch(/>(lv|concept|career)\.[A-Za-z0-9._]+</);
      expect(html, f).not.toContain('undefined');
      expect(html, f).not.toContain('…');   // a placeholder shown as an ellipsis means a number the wiki could not state
      for (const m of html.matchAll(/<img ([^>]*)>/g)) {
        const src = /src="([^"]+)"/.exec(m[1]!)![1]!;
        expect(existsSync(join(DIR, src)), `${f}: ${src}`).toBe(true);
        expect(m[1], `${f}: ${src}`).toMatch(/width="\d+" height="\d+"/);
        expect(m[1], `${f}: ${src}`).toMatch(/alt="[^"]{8,}"/);
        expect(m[1], `${f}: ${src}`).toContain('loading="lazy"');
      }
    }
  });
});

describe('wiki home: what is in the game now', () => {
  const home = text(pages['index.html']!);
  it('names the newest release in the CHANGELOG', () => {
    const rel = releaseOf(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'));
    expect(home).toContain(`${rel.version}, "${rel.name}"`);
  });
  it('counts the levels and the stops on the Works Map', () => {
    const wm = worksMap();
    expect(wm.stops).toBe(CHAPTERS.length + 1);   // the chapters and the Career
    expect(home).toContain(`${ids.length} levels`);
    expect(home).toContain(`on ${wm.stops} stops of the Works Map`);
  });
  it('agrees with works_map.gd on which jobs are in the new look', () => {
    const wm = worksMap();
    expect(wm.newLook.length).toBeGreaterThan(0);
    for (const s of SPECS.filter((x) => /^L\d\d$/.test(x.id))) {
      const card = new RegExp(`<article class="level card" id="${s.id}">\\s*<h3>.*?</h3>`, 's').exec(pages[`chapter-${s.chapter}.html`]!)![0];
      expect(card, s.id).toContain(isNewLook(s.id, s.chapter, wm) ? 'look new">New look' : 'look classic">Classic look');
    }
    for (const c of wm.classicLevels) expect(ids, `${c} is a level`).toContain(c);
  });
  it('lists the platforms the release workflow exports', () => {
    const built = releasePlatforms();
    if (built) expect(built, 'release.yml exports another list: update PLATFORMS in scripts/wiki.ts').toEqual(PLATFORMS);
    expect(home).toContain(`${PLATFORMS.join(' and ')}.`);
  });
  it('says what is planned and not built, and what nobody has checked', () => {
    expect(home).toContain('The campaign is complete. What is not built yet');
    expect(home).toContain('What nobody has checked yet');
  });
});

describe('wiki chapters and jobs', () => {
  it('every chapter says what it teaches, has a screenshot labelled with its look (or says it has none) and a pager', () => {
    for (const c of CHAPTERS) {
      const html = pages[`chapter-${c.n}.html`]!;
      expect(html, `chapter ${c.n}`).toContain('<b>What it teaches.</b>');
      if (NO_SHOT.includes(c.n)) expect(html).toContain('There is no screenshot of this chapter on the wiki yet.');
      else expect(html, `chapter ${c.n}`).toMatch(/<figcaption><b class="look (new|classic)">(New|Classic) look\.<\/b>/);
      expect(html, `chapter ${c.n}`).toContain('class="pager"');
    }
  });
  it('every level has a card with a goal, stars and a failure section', () => {
    for (const s of SPECS.filter((x) => /^L\d\d$/.test(x.id))) {
      const card = new RegExp(`<article class="level card" id="${s.id}">[\\s\\S]*?</article>`).exec(pages[`chapter-${s.chapter}.html`]!)?.[0];
      expect(card, s.id).toBeDefined();
      expect(card, s.id).toContain('<h4>Goal</h4>');
      expect(card, s.id).toContain('<h4>Stars</h4>');
      expect(card, s.id).toContain('<h4>If it fails</h4>');
    }
  });
  it('the Two Flasks job states the six runs and the argon test', () => {
    const card = text(pages['chapter-3.html']!);
    expect(card).toContain('within 6 runs');
    expect(card).toContain('argon');
  });
  it('the controls page names the hall flip on the pad as R3 and on the keyboard as B', () => {
    const c = text(pages['controls.html']!);
    expect(c).toContain('R3');
    expect(readFileSync(join(ROOT, 'godot/look2/look2.gd'), 'utf8')).toContain('JOY_BUTTON_RIGHT_STICK');
    expect(readFileSync(join(ROOT, 'godot/look2/look2.gd'), 'utf8')).toContain('KEY_B: gen_flip');
  });
  it('the wiki style keeps text at 16 px or more', () => {
    const css = readFileSync(join(DIR, 'wiki.css'), 'utf8');
    const small = [...css.matchAll(/font(?:-size)?:[^;}]*?\b(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 16).map((m) => m[0]);
    expect(small).toEqual([]);
  });
});
