// verify.ts must stay importable by the cobanana-scores server (Cloudflare Workers or Node): pure modules only, no node: imports.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskNonCode } from '@core/kit/determinism';
import { Engine, decodeSolution, encodeSolution, makeVerifier, type GameDef, type Level, type Solution } from '@core/kit';
import { GAME, metricsOf } from './game';
import type { EqState } from './state';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const CORE_TS = resolve(SRC, '../core/ts');

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@core/') ? resolve(CORE_TS, spec.slice(6)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  if (/\.json$/.test(base) && existsSync(base)) return '';   // pure data, bundled by the build: nothing to walk
  for (const c of [base + '.ts', resolve(base, 'index.ts'), base]) if (existsSync(c) && /\.ts$/.test(c)) return c;
  throw new Error(`Cannot resolve '${spec}' from ${from}`);
}

/** Every module reachable from `entry`, plus the bare/node imports found on the way. */
function graph(entry: string) {
  const seen = new Set<string>(); const external: { file: string; spec: string }[] = []; const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!; if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const r = resolveImport(f, m[1]!); if (r === '') continue; if (r) todo.push(r); else external.push({ file: f, spec: m[1]! });
    }
    if (/\brequire\s*\(/.test(src)) external.push({ file: f, spec: 'require()' });
  }
  return { files: [...seen], external };
}

describe('verify.ts is server-safe', () => {
  const g = graph(resolve(SRC, 'verify.ts'));
  it('imports no node: modules, bare packages or require() (transitively)', () => {
    expect(g.external).toEqual([]);
  });
  it('reaches only pure core modules (no storage adapters, bridge, golden, determinism scanner, tests)', () => {
    const rel = g.files.map((f) => f.replace(SRC, 'src/').replace(CORE_TS, 'core/ts'));
    for (const banned of ['node-storage', 'bridge.ts', 'golden', 'determinism', '.test.', 'test-toys', 'test-packs']) expect(rel.filter((f) => f.includes(banned)), banned).toEqual([]);
    expect(rel).toContain('core/ts/kit/verify.ts'); expect(rel).toContain('core/ts/kit/solution.ts'); expect(rel).toContain('src/game.ts');
  });
  it('no source in the graph touches Node globals or the clock/entropy', () => {
    const bad = /\b(process\.|Buffer\b|__dirname|Math\.random|Date\.now|new Date\(|btoa\(|atob\()/;
    const hits: string[] = [];
    for (const f of g.files) {
      const src = maskNonCode(readFileSync(f, 'utf8')).split('\n');   // comments and string text ignored
      src.forEach((l, i) => { if (bad.test(l)) hits.push(`${f.replace(SRC, 'src/').replace(CORE_TS, 'core/ts')}:${i + 1}: ${l.trim()}`); });
    }
    // persistence.ts reads the clock to stamp saves (never used by the verifier: autosave off, no save action replayed)
    expect(hits.filter((h) => !h.includes('persistence.ts'))).toEqual([]);
  });
});

// ---- game-specific tamper tests (DESIGN §9.13) on a TEST-LOCAL level: heat a feed and send it to a product tank, offered only a heater ----
const V1: Level<EqState> = {
  id: 'V1', title: 'Test level', brief: 'Heat the feed and tank it.',
  setup: (s) => { s.species = ['N2', 'H2']; s.palette = ['heater', 'vent']; s.limits = { heater: 1 }; },
  goal: (s) => s.phase === 'commissioned' && (s.solved?.kpis.product_t_per_h ?? 0) > 0,
  maxTicks: 20,
};
const VGAME: GameDef<EqState> = { ...GAME, levels: [V1] };
const verifyV = makeVerifier(VGAME);
const SOLUTION: [string, unknown[]][] = [
  ['placeUnit', ['feed', 0, 0, 0]], ['placeUnit', ['heater', 4, 0, 0]], ['placeUnit', ['product', 8, 0, 0]],
  ['setFeed', ['F-101', { x: [0.25, 0.75], flow: 2, T: 300, P: 2e6 }]], ['setParam', ['H-102', 'T', 500]], ['setParam', ['H-102', 'utility', 'fired']],
  ['connect', ['F-101', 'out', 'H-102', 'in']], ['connect', ['H-102', 'out', 'T-103', 'in']], ['commission', []],
];
function solved(actions: [string, unknown[]][] = SOLUTION): { code: string; engine: Engine<EqState> } {
  const engine = new Engine(VGAME); engine.autosave = false;
  expect(engine.act('startLevel', ['V1', 7, 'learner']).ok).toBe(true);
  for (const [n, a] of actions) { const r = engine.act(n, a); if (!r.ok) throw new Error(`${n}: ${r.message}`); }
  return { code: engine.q('solutionCode') as string, engine };
}
const recode = (code: string, edit: (s: Solution) => void): string => { const d = decodeSolution(code) as Solution; edit(d); return encodeSolution(d); };

describe('verify() on the game rules', () => {
  it('a won run verifies to exactly the metrics the engine reports (bit-equal)', () => {
    const { code, engine } = solved();
    expect(engine.state.status).toBe('won');
    const v = verifyV('V1', code);
    expect(v.ok, v.reason).toBe(true); expect(v.metrics).toEqual(metricsOf(engine.state)); expect(v.metrics.product_t_per_h).toBeGreaterThan(0);
    expect(JSON.stringify(v.metrics)).toBe(JSON.stringify(engine.q('metrics')));
  });
  it('a unit the level does not offer is rejected with the palette message, not a crash', () => {
    const code = recode(solved().code, (d) => { d.actions[1] = ['placeUnit', ['compressor', 4, 0, 0]]; });
    const v = verifyV('V1', code);
    expect(v.ok).toBe(false); expect(v.reason).toMatch(/Action 2 \(placeUnit\) rejected: Your plot has no compressor yet/);
  });
  it('a unit over the level count limit is rejected', () => {
    const code = recode(solved().code, (d) => { d.actions.splice(2, 0, ['placeUnit', ['heater', 12, 4, 0]]); });
    expect(verifyV('V1', code)).toMatchObject({ ok: false, reason: expect.stringMatching(/allows 1 of heater/) });
  });
  it('an unknown action name is rejected', () => {
    const code = recode(solved().code, (d) => { d.actions.push(['teleport', [1]]); });
    expect(verifyV('V1', code)).toMatchObject({ ok: false, reason: expect.stringMatching(/Unknown action 'teleport'/) });
  });
  it('edited args with a recomputed crc replay to different metrics (the server trusts only the replayed actions)', () => {
    const base = verifyV('V1', solved().code);
    const hot = verifyV('V1', recode(solved().code, (d) => { d.actions[4] = ['setParam', ['H-102', 'T', 700]]; }));
    expect(base.ok && hot.ok).toBe(true);
    expect(hot.metrics.energy_gj_per_t).toBeGreaterThan(0); expect(hot.metrics.cost_usd_per_t).not.toBe(base.metrics.cost_usd_per_t);
    const more = verifyV('V1', recode(solved().code, (d) => { d.actions[3] = ['setFeed', ['F-101', { x: [0.25, 0.75], flow: 4, T: 300, P: 2e6 }]]; }));
    expect(more.metrics.product_t_per_h).toBeCloseTo(2 * base.metrics.product_t_per_h!, 12);
  });
  it('out-of-range args are rejected where the engine rejects them (T beyond the knob range)', () => {
    const v = verifyV('V1', recode(solved().code, (d) => { d.actions[4] = ['setParam', ['H-102', 'T', 9000]]; }));
    expect(v).toMatchObject({ ok: false, reason: expect.stringMatching(/Action 5 \(setParam\) rejected: T on H-102 runs from/) });
  });
  it('a lost or unfinished run (never commissioned) is not ok', () => {
    const { code } = solved(SOLUTION.slice(0, 8));
    const v = verifyV('V1', code);
    expect(v.ok).toBe(false); expect(v.reason).toMatch(/not won/); expect(v.metrics).toEqual({});
  });
  it('a failed commission (an open outlet) in a code is a rejected action, so the code is not ok', () => {
    const code = recode(solved().code, (d) => { d.actions.splice(7, 1); });
    expect(verifyV('V1', code)).toMatchObject({ ok: false, reason: expect.stringMatching(/Action 8 \(commission\) rejected: (Stream from H-102 outlet goes nowhere|These units are not piped to anything: T-103)/) });
  });
  it('wrong ruleset, wrong level and a flipped payload bit are not ok, never a throw', () => {
    const { code } = solved();
    expect(verifyV('V1', recode(code, (d) => { d.ruleset = 'equilibrium:global@9.9'; })).ok).toBe(false);
    expect(verifyV('V2', code).ok).toBe(false);
    const parts = code.split('.'); const flipped = parts[0] + '.' + (parts[1]!.slice(0, 10) + (parts[1]![10] === 'A' ? 'B' : 'A') + parts[1]!.slice(11)) + '.' + parts[2];
    expect(verifyV('V1', flipped).ok).toBe(false); expect(verifyV('V1', 'not a code').ok).toBe(false);
  });
  it('the replay is deterministic: verifying twice gives identical metrics and ticks', () => {
    const { code } = solved(); const a = verifyV('V1', code), b = verifyV('V1', code);
    expect(a).toEqual(b);
  });
});
