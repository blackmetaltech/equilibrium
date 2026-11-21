// All player-facing text is externalised: locales are complete, and the game never asks for a missing key or variable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkLocales } from '@core/i18n';
import { Engine } from '@core/kit';
import { GAME } from './game';
import { LOCALES, i18n } from './i18n';
import { en } from './locales/en';
import { briefs } from './locales/en/briefs';
import { coach } from './locales/en/coach';
import { codex } from './locales/en/codex';
import { errors } from './locales/en/errors';
import { events } from './locales/en/events';
import { levels } from './locales/en/levels';
import { levelsCh2 } from './locales/en/levels_ch2';
import { levelsCh3 } from './locales/en/levels_ch3';
import { levelsCh4 } from './locales/en/levels_ch4';
import { levelsCh5 } from './locales/en/levels_ch5';
import { levelsCh6 } from './locales/en/levels_ch6';
import { levelsCh8 } from './locales/en/levels_ch8';
import { levelsCh9 } from './locales/en/levels_ch9';
import { levelsCh10 } from './locales/en/levels_ch10';
import { levelsCareer } from './locales/en/levels_career';
import { levelsF29 } from './locales/en/levels_f29';
import { ui } from './locales/en/ui';
import { why } from './locales/en/why';
import { REGIONS } from './regions';

describe('locales', () => {
  it('every locale has every key of en with the same placeholders', () => {
    expect(checkLocales(LOCALES, 'en')).toEqual({ missing: [], extra: [], badPlaceholders: [] });
  });
  it('en is the union of the family files, with no key defined twice', () => {
    const parts = [ui, briefs, coach, why, codex, events, errors, levels];
    const chapters = [levelsCh2, levelsCh3, levelsCh4, levelsCh5, levelsCh6, levelsCh8, levelsCh9, levelsCh10, levelsCareer, levelsF29];
    expect(Object.keys(en).length).toBe([...parts, ...chapters].reduce((n, p) => n + Object.keys(p).length, 0));
    for (const p of parts) expect(Object.keys(p).length).toBeGreaterThan(0);
  });
  it('en has no empty strings and no hard-coded currency symbols', () => {
    for (const [k, v] of Object.entries(en)) { expect(v.trim(), k).not.toBe(''); for (const p of REGIONS.list({ includeDrafts: true })) expect(v, k).not.toContain(p.currency.symbol); }
  });
  it('a new game, a save label, a description and init in every region ask for no missing key or variable', () => {
    i18n.clearMissing();
    for (const region of REGIONS.ids()) {
      const e = new Engine(GAME, { region }); e.autosave = false;
      for (const phase of ['design', 'commissioned', 'firstrun', 'shift', 'report'] as const) for (const thermoDetail of ['rigorous', 'textbook', 'book'] as const) {
        const s = { ...structuredClone(e.state), phase, thermoDetail } as any;
        GAME.saveLabel!(s); GAME.describe!(s);
      }
      e.init(); e.q('plant'); e.act('save', ['main']); e.saves.list();
    }
    new Engine(GAME).act('newGame', [1]);
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
  it('every key the engine side uses exists, and every ui and codex key is used by the game source', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const src = ['game.ts', 'levels.ts'].map((f) => readFileSync(dir + f, 'utf8')).join('\n');
    const used = [...src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]!);
    expect(used.filter((k) => !(k in en))).toEqual([]);
    const dynamic = /^(phase|thermo)\./;   // t(`phase.${...}`)
    const orphans = [...Object.keys(ui), ...Object.keys(codex)].filter((k) => !src.includes(`'${k}'`) && !dynamic.test(k));
    expect(orphans).toEqual([]);   // briefs, coach, why, events and errors are consumed by the M1/M2 tasks and are exempt until then
  });
});
