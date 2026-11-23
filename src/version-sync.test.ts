// The version lives in several files. GRID once shipped a release as 1.17.0 because two of them were not bumped.
// All of them must agree with the newest CHANGELOG heading (copied from GRID's guard, phase D).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const changelogVersion = /^## \[(\d+\.\d+\.\d+)\]/m.exec(read('CHANGELOG.md'))?.[1];

describe('version sync', () => {
  it('the newest CHANGELOG heading has a version', () => {
    expect(changelogVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('package.json matches the CHANGELOG', () => {
    expect(JSON.parse(read('package.json')).version).toBe(changelogVersion);
  });
  it('godot/project.godot config/version matches the CHANGELOG', () => {
    expect(/^config\/version="([^"]+)"/m.exec(read('godot/project.godot'))?.[1]).toBe(changelogVersion);
  });
  it('the macOS and Android export preset versions match the CHANGELOG', () => {
    const p = read('godot/export_presets.cfg');
    expect(/^application\/short_version="([^"]+)"/m.exec(p)?.[1]).toBe(changelogVersion);
    expect(/^application\/version="([^"]+)"/m.exec(p)?.[1]).toBe(changelogVersion);
    expect(/^version\/name="([^"]+)"/m.exec(p)?.[1]).toBe(changelogVersion);
  });
  it('the README alpha line and the site download label match the CHANGELOG', () => {
    expect(/\*\*Alpha \((\d+\.\d+\.\d+)\)\.\*\*/.exec(read('README.md'))?.[1]).toBe(changelogVersion);
    expect(/id="dl-main-sub">v(\d+\.\d+\.\d+)</.exec(read('site/index.html'))?.[1]).toBe(changelogVersion);
  });
});
