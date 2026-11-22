// The player wiki (site/wiki) is generated from the game's own text by scripts/wiki.ts. WIKI_WRITE=1 writes it; otherwise this test fails
// when a committed page is stale (a string changed and the wiki was not regenerated).
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { wikiPages } from '../scripts/wiki';

const DIR = join(__dirname, '..', 'site', 'wiki');

describe('player wiki', () => {
  it('site/wiki matches the game text', () => {
    const pages = wikiPages();
    if (process.env.WIKI_WRITE === '1') { mkdirSync(DIR, { recursive: true }); for (const [f, h] of Object.entries(pages)) writeFileSync(join(DIR, f), h); }
    for (const [f, h] of Object.entries(pages)) {
      expect(existsSync(join(DIR, f)), f).toBe(true);
      expect(readFileSync(join(DIR, f), 'utf8'), f + ' is stale: WIKI_WRITE=1 npx vitest run src/wiki.test.ts').toBe(h);
    }
    expect(Object.keys(pages)).toContain('chapter-3.html');
    expect(pages['chapter-3.html']).toContain('Two Flasks');
  });
});
