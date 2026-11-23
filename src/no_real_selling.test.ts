// Owner rule (2026-11-23, factory bible/09): never sell with "real X" (real chemistry, real physics, real data, "where the chemistry is real"). Say what the
// player does, or name the source (NIST-JANAF). This test fails on the word "real" anywhere a player or visitor reads: locale strings (placeholders such as
// {real} are template slots, never shown), quoted strings in the Godot scripts, the site, the wiki, the README and the newest CHANGELOG section (the release notes).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const WORD = /\breal\b/i;   // "really" is an adverb, not the selling phrase
const walk = (d: string, ext: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : []; });
const hits = (file: string, texts: string[]): string[] => texts.filter((x) => WORD.test(x.replace(/\{[a-zA-Z_]+\}/g, ''))).map((x) => `${file.replace(ROOT + '/', '')}: ${x.slice(0, 120)}`);

describe('no "real X" selling in player-facing text (owner, bible/09)', () => {
  it('locale strings', () => {
    const bad = walk(join(ROOT, 'src/locales'), '.ts').flatMap((f) => {
      const s = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      const vals = [...s.matchAll(/:\s*'((?:[^'\\]|\\.)*)'|:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? m[2]);
      return hits(f, vals);
    });
    expect(bad).toEqual([]);
  });
  it('quoted strings in the Godot scripts (comments excluded)', () => {
    const bad = ['godot/ui', 'godot/look2'].flatMap((d) => walk(join(ROOT, d), '.gd')).concat([join(ROOT, 'godot/main.gd')]).flatMap((f) => {
      const code = readFileSync(f, 'utf8').split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
      return hits(f, [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]));
    });
    expect(bad).toEqual([]);
  });
  it('the site, the wiki and the README', () => {
    const text = (f: string) => readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, (m) => m.includes('ld+json') ? m : '').replace(/<[^>]+?(content|alt|title)="([^"]*)"[^>]*>/g, ' $2 ').replace(/<[^>]*>/g, ' ');
    const files = [join(ROOT, 'site/index.html'), ...walk(join(ROOT, 'site/wiki'), '.html')];
    const bad = files.flatMap((f) => hits(f, text(f).split(/(?<=[.!?])\s+|\n/)));
    bad.push(...hits('README.md', readFileSync(join(ROOT, 'README.md'), 'utf8').split('\n')));
    expect(bad).toEqual([]);
  });
  it('the release notes (the newest CHANGELOG section)', () => {
    const c = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'); const i = c.indexOf('\n## ['); const j = c.indexOf('\n## [', i + 5);
    expect(hits('CHANGELOG.md', c.slice(i, j).split('\n'))).toEqual([]);
  });
});
