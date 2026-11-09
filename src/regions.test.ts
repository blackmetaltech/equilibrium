// The region seam (DESIGN §11, §9.12): both packs validate; formatting round-trips; the ruleset id carries the pack; no regional
// token leaks between packs; the rule folders never import src/regions. Adding a pack to src/regions/index.ts puts it under all of it.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine, checkAllLevels, play } from '@core/kit';
import { expectNoRegionLeaks, findRegionLeaks, formatMoney, formatNumber, rulesetId, validateRegion } from '@core/regions';
import { GAME } from './game';
import { en } from './locales/en';
import { EXAM_LEVELS, LEVEL_IDS, PRICE_KEYS, validateEqPackStrings, validateEqRegion, type EqRegionData } from './regions/data';
import { REGIONS } from './regions';
import { PERSONAS } from './personas';

const PACKS = REGIONS.list({ includeDrafts: true });
const SRC = fileURLToPath(new URL('.', import.meta.url));
const clone = (d: EqRegionData): any => structuredClone(d);

/** Everything a player can see for one region right now: init data, the region and plant queries, the log, save label, the
 *  English strings, and every pack datum the UI will show (prices formatted in the pack's currency, limits, labels, cast, exam citations). */
function render(pack: { id: string }) {
  const e = new Engine(GAME, { region: pack.id }); e.autosave = false;
  const { regions: _r, drafts: _d, ...init } = e.init() as any;
  const p = REGIONS.get(pack.id);
  const prices = PRICE_KEYS.map((k) => ({ k, text: `${formatMoney(p.data.prices[k].value, p)} ${p.data.prices[k].unit}`, src: p.data.prices[k].src, conf: p.data.prices[k].conf }));
  return {
    init, region: e.q('region'), plant: e.q('plant'), saves: e.saves.list(), log: e.state.log, label: GAME.saveLabel!(e.state), describe: GAME.describe!(e.state),
    en, prices, limits: p.data.limits, standards: p.standards, labels: p.data.standardsLabels, strings: p.strings, exam: p.data.examSet, big: formatMoney(1234567, p),
  };
}

describe('region packs of EQUILIBRIUM', () => {
  it('ships global as the default; in is a draft', () => {
    expect(REGIONS.defaultId).toBe('global');
    expect(REGIONS.get('global').status).toBe('shipping'); expect(REGIONS.get('in').status).toBe('draft');
    const init = new Engine(GAME).init() as any;
    expect(init.regions.map((r: any) => r.id)).toEqual(['global']); expect(init.drafts.map((r: any) => r.id)).toEqual(['in']);
  });
  it.each(PACKS.map((p) => [p.id]))('pack %s validates (core schema, EQUILIBRIUM data, strings of cast and setting)', (id) => {
    const p = REGIONS.get(id!);
    expect(validateRegion(p, validateEqRegion)).toEqual([]);
    expect(validateEqRegion(p.data)).toEqual([]);
    expect(validateEqPackStrings(p)).toEqual([]);
    for (const k of PRICE_KEYS) { const r = p.data.prices[k]; expect(Number.isFinite(r.value), k).toBe(true); expect(r.src.length, k).toBeGreaterThan(5); }
    expect(PRICE_KEYS.length).toBe(14);
    for (const lv of LEVEL_IDS) expect(p.data.leaderboardSeeds[lv], lv).toBe(1000 + Number(lv.slice(1)));
    for (const lv of EXAM_LEVELS) { expect(p.data.examSet.levels[lv]!.citation.length).toBeGreaterThan(5); expect(Object.keys(p.data.examSet.levels[lv]!.numbers).length).toBeGreaterThan(2); }
  });
  it('global: US$ prefix, western grouping, §11.2 standards, §4.7 prices, §4.8 limits, the global cast and works', () => {
    const g = REGIONS.get('global');
    expect(g.currency).toEqual({ code: 'USD', symbol: '$', decimals: 2, position: 'prefix' }); expect(g.numbers.grouping).toBe('western');
    expect(g.standards).toEqual({ relief: 'API 520/526 (ISO 4126)', alarms: 'IEC 62682 / ISA-18.2', flammability: 'EN 1839 / ISO 10156', emissions: 'US NSPS 40 CFR 60 / EU BREF LVIC-AAF' });
    expect(g.data.prices.gas_default).toMatchObject({ value: 11.0, unit: 'per MMBtu', conf: 'FETCHED' });
    expect(g.data.prices.gas_cheap.value).toBe(3.5); expect(g.data.prices.electricity).toMatchObject({ value: 0.10, conf: 'GAME' });
    expect(g.data.prices.cooling_water.conf).toBe('UNVERIFIED'); expect(g.data.prices.ammonia.value).toBe(400); expect(g.data.prices.carbon.value).toBe(0);
    expect(g.data.prices.carbon_export.value).toBe(80); expect(g.data.prices.ethanol).toMatchObject({ value: 0.55, unit: 'per L' });
    expect(g.data.limits).toMatchObject({ so2_standard: 2.0, so2_strict: 1.3, so2_expert: 0.65, n2o_bat: [0.12, 0.6], grid_t_co2_per_mwh: 0.47, carbon_price: 0 });
    const name = (id: string) => g.strings[`cast.${id}.name`];
    expect(Object.values(g.data.cast).map(name)).toEqual(['Dr. Mara Quinn', 'Tomas Brandt', 'Victor Hale', 'Dr. Noor Haddad']);
    expect(g.strings[g.data.setting.worksName]).toBe('Kestrel Bay Works');
    expect(g.leakMarkers ?? []).toEqual([]);
  });
  it('in (draft): rupees, lakh grouping, prices converted once at 83 INR per USD with the rate in src, the in cast, §11.3 leak markers', () => {
    const n = REGIONS.get('in');
    expect(n.currency).toEqual({ code: 'INR', symbol: '₹', decimals: 2, position: 'prefix' }); expect(n.numbers.grouping).toBe('indian');
    expect(n.data.prices.ammonia.value).toBe(400 * 83); expect(n.data.prices.sulfur.value).toBe(165 * 83); expect(n.data.prices.ammonia.src).toContain('83 INR per USD');
    expect(n.data.prices.gas_default.value).toBeCloseTo(6.9 * 83, 6); expect(n.data.prices.ethanol.value).toBe(57.97);
    expect(n.data.limits.grid_t_co2_per_mwh).toBe(0.727);
    expect(Object.values(n.data.cast).map((id) => n.strings[`cast.${id}.name`])).toEqual(['Anjali Rao', 'Bashir Khan', 'Mr. Desai', 'Dr. Farida Contractor']);
    expect(n.strings[n.data.setting.worksName]).toBe('Khambhat Bay Works');
    for (const m of ['₹', 'lakh', 'crore', 'Rs', 'CPCB', 'CEA', 'BIS', 'IS ', 'Gujarat', 'Khambhat', 'India', 'Indian', 'APM', 'OMC', 'Sindri', 'Ramagundam']) expect(n.leakMarkers, m).toContain(m);
  });
  it('physics is region-independent: the exam problems carry the same chemistry numbers in every pack', () => {
    const g = REGIONS.get('global'), n = REGIONS.get('in');
    for (const lv of EXAM_LEVELS) expect(n.data.examSet.levels[lv]!.numbers, lv).toEqual(g.data.examSet.levels[lv]!.numbers);
    expect(g.data.limits.n2o_bat).toEqual(n.data.limits.n2o_bat);
  });
  it('the validator catches every kind of bad pack data', () => {
    const base = REGIONS.get('global').data;
    const bad = (f: (d: any) => void) => { const d = clone(base); f(d); return validateEqRegion(d).join('\n'); };
    expect(bad((d) => delete d.prices.methanol)).toMatch(/prices\.methanol is missing/);
    expect(bad((d) => { d.prices.urea.value = NaN; })).toMatch(/prices\.urea\.value must be a finite number/);
    expect(bad((d) => { d.prices.urea.value = -1; })).toMatch(/must not be negative/);
    expect(bad((d) => { d.prices.sulfur.src = ' '; })).toMatch(/prices\.sulfur\.src/);
    expect(bad((d) => { d.prices.sulfur.conf = 'MAYBE'; })).toMatch(/prices\.sulfur\.conf/);
    expect(bad((d) => { d.prices.extra = d.prices.sulfur; })).toMatch(/not a known price key/);
    expect(bad((d) => { d.limits.so2_strict = 2.5; })).toMatch(/so2_strict must be below so2_standard/);
    expect(bad((d) => { d.limits.so2_expert = 1.3; })).toMatch(/so2_expert must be below so2_strict/);
    expect(bad((d) => { d.limits.grid_t_co2_per_mwh = Infinity; })).toMatch(/limits\.grid_t_co2_per_mwh/);
    expect(bad((d) => { d.limits.n2o_bat = [1, 0.1]; })).toMatch(/n2o_bat/);
    expect(bad((d) => { d.limits.src.so2_standard = ''; })).toMatch(/limits\.src\.so2_standard/);
    expect(bad((d) => delete d.examSet.levels.L14)).toMatch(/examSet\.levels\.L14 is missing/);
    expect(bad((d) => { d.examSet.levels.L04.citation = ''; })).toMatch(/L04\.citation/);
    expect(bad((d) => { d.examSet.levels.L09.numbers = { x: NaN }; })).toMatch(/L09\.numbers/);
    expect(bad((d) => delete d.leaderboardSeeds.L28)).toMatch(/leaderboardSeeds\.L28/);
    expect(bad((d) => { d.cast.mentor = ''; })).toMatch(/cast\.mentor/);
    const p = REGIONS.get('global');
    expect(validateEqPackStrings({ ...p, strings: { ...p.strings, 'cast.mara.name': '' } }).join()).toMatch(/cast\.mara\.name/);
    expect(validateEqPackStrings({ ...p, strings: { ...p.strings, 'works.name': '' } }).join()).toMatch(/works\.name/);
  });
  it('formatting round trip: "$1,234,567" in global, "₹12,34,567" in in', () => {
    const g = REGIONS.get('global'), n = REGIONS.get('in');
    expect(formatMoney(1234567, g, { decimals: 0 })).toBe('$1,234,567'); expect(formatMoney(1234567, n, { decimals: 0 })).toBe('₹12,34,567');
    expect(formatMoney(1234567.5, g)).toBe('$1,234,567.50'); expect(formatMoney(1234567.5, n)).toBe('₹12,34,567.50');
    for (const x of [0, 7, 999, 1000, 12345, 123456, 1234567, 98765432]) for (const p of [g, n]) {
      const back = Number(formatNumber(x, p, 0).split(p.numbers.group).join('')); expect(back, `${p.id}/${x}`).toBe(x);
    }
  });
  it('the ruleset id carries the pack and the game version', () => {
    expect(rulesetId(GAME.id, REGIONS.get('global'), GAME.rulesetVersion)).toBe('equilibrium:global@1.1');
    expect(rulesetId(GAME.id, REGIONS.get('in'), GAME.rulesetVersion)).toBe('equilibrium:in@1.1');
  });
  it.each(PACKS.map((p) => [p.id]))('region %s: the engine starts, plays, and every level (none yet) is solvable', (id) => {
    const e = new Engine(GAME, { region: id! });
    const p = REGIONS.get(id!);
    expect(e.state.region).toBe(id); expect(e.state.ruleset).toBe(rulesetId(GAME.id, p, GAME.rulesetVersion ?? 1));
    expect(e.state.log[0]!.text).toContain(p.strings[p.data.setting.worksName]!);
    expect((e.q('region') as any).id).toBe(id);
    for (const r of checkAllLevels(GAME, { seed: 1, region: id })) expect(r.problems, `${id}/${r.level}`).toEqual([]);
    for (const persona of Object.keys(PERSONAS)) expect(play(GAME, { persona, seed: 2, ticks: 60, region: id }).violations, `${id}/${persona}`).toEqual([]);
  });
  it('no regional token leaks between packs (init, region and plant queries, log, labels, strings, pack data as the UI shows it)', () => {
    expectNoRegionLeaks(PACKS, render);
  });
  it('global holds no India token anywhere (the DESIGN §9.12 denylist over the whole pack)', () => {
    const g = REGIONS.get('global');
    const deny = /₹|\blakh\b|\bcrore\b|\bRs\b|CPCB|\bCEA\b|\bBIS\b|\bIS\b|Gujarat|Khambhat|India|Indian|APM|OMC|Sindri|Ramagundam|Anjali|Bashir|Desai|Farida/;
    expect(JSON.stringify(g)).not.toMatch(deny);
    expect(JSON.stringify(render(g))).not.toMatch(deny);
  });
  it('the leak test is live: it would catch a planted leak, in both directions', () => {
    const hits = findRegionLeaks(PACKS, (p) => (p.id === 'global' ? { ...render(p), oops: `${formatMoney(5, REGIONS.get('in'))} at Khambhat Bay Works` } : { ...render(p), oops2: 'Dr. Mara Quinn says hello' }));
    const k = hits.map((h) => `${h.renderedWith}<-${h.fromPack}:${h.marker}`);
    expect(k).toContain('global<-in:Khambhat Bay Works'); expect(k).toContain('global<-in:₹');
    expect(k).toContain('in<-global:Dr. Mara Quinn');
  });
  it('unknown regions teach', () => {
    expect(() => new Engine(GAME, { region: 'mars' })).toThrow(/Unknown region 'mars'.*global, in/);
    expect(new Engine(GAME).act('newGame', [1, 'learner', 'mars']).message).toMatch(/Available regions: global, in/);
  });
});

describe('static structure', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) ? [p] : []; });
  it('no file under src/sim or src/data imports src/regions (rules never read the region)', () => {
    const offenders: string[] = [];
    for (const dir of ['sim', 'data']) {
      let all: string[] = []; try { all = files(join(SRC, dir)); } catch { /* the folder may not exist yet */ }
      for (const f of all) for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        if (/(^|\/)regions(\/|$)/.test(m[1]!) && !m[1]!.startsWith('@core/')) offenders.push(`${f.replace(SRC, 'src/')}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
