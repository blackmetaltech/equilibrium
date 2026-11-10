// Lint over every why.* template (DESIGN 9.8): a number placeholder, the knob named, at most three sentences, a hint that names it too, and
// nothing that blames the player.
import { describe, expect, it } from 'vitest';
import { placeholders } from '@core/i18n';
import { why } from '../../locales/en/why';

/** Placeholders that carry a number (see KIND in render.ts). */
const NUMERIC = new Set(['T0', 'T1', 'T', 'Tmin', 'Tpeak', 'Trelief', 'dT', 'dt', 'time', 'P0', 'P1', 'P', 'Xeq0', 'Xeq1', 'X0', 'X1', 'X', 'eta0', 'y0', 'y1', 'f0', 'f1', 'pchg', 'flowdrop', 'xspec', 'xaz', 'gap',
  'K0', 'K1', 'dH', 'dW', 'inflow', 'have', 'need', 'left', 'dn', 'k0', 'k1', 'v0', 'v1', 'pred', 'act', 'iterations', 'residual']);
/** The knob (or quantity) each template must name in its own words. */
const KNOB: Record<string, string> = {
  T_UP_EXO: 'temperature', T_UP_KIN: 'temperature', P_UP_DN: 'pressure', P_UP_NODN: 'pressure', INERT_UP: 'feed', PURGE_DOWN: 'purge', LIGHTOFF: 'inlet temperature',
  RUNAWAY: 'cooling water flow', AZEOTROPE: 'target purity', LIMITING: 'feed flow', GENERIC: '{knob}', PREDICT_GAP: 'Thermo detail', PREDICT_GAP_PLAIN: 'predicted', NO_EXIT: 'purge',
};
const templates = Object.keys(why).filter((k) => /^why\.[A-Z0-9_]+$/.test(k) && k !== 'why.FAILED' && k !== 'why.NOT_CONVERGED');
const sentences = (s: string): number => s.split(/(?<=[.!?])\s+(?=[A-ZΔ\d])/).length;

describe('why.* lint', () => {
  it('every template has a number placeholder and names its knob', () => {
    expect(templates.length).toBeGreaterThanOrEqual(13);
    for (const k of templates) {
      const id = k.slice(4);
      expect(KNOB[id], `${k} has no knob entry in this lint`).toBeDefined();
      expect(placeholders(why[k]!).some((p) => NUMERIC.has(p)), `${k}: no number placeholder`).toBe(true);
      const need = KNOB[id]!;
      expect(need.startsWith('{') ? placeholders(why[k]!).includes(need.slice(1, -1)) : why[k]!.includes(need), `${k}: does not name "${need}"`).toBe(true);
    }
  });
  it('at most three sentences, plain words, no blame', () => {
    for (const k of templates) {
      expect(sentences(why[k]!), k).toBeLessThanOrEqual(3);
      expect(why[k]!, k).not.toMatch(/\b(mistake|wrong|fault|careless|should have|you failed|you forgot)\b/i);
    }
  });
  it('every hint belongs to a template, starts with Hint:, is one sentence and names a knob', () => {
    const hints = Object.keys(why).filter((k) => k.endsWith('.hint'));
    expect(hints.length).toBeGreaterThanOrEqual(10);
    for (const h of hints) {
      expect(templates, h).toContain(h.replace(/\.hint$/, ''));
      expect(why[h]!.startsWith('Hint: '), h).toBe(true);
      expect(sentences(why[h]!), h).toBe(1);
      expect(/temperature|pressure|purge|feed|catalyst|column|trip|power/i.test(why[h]!), h).toBe(true);
    }
  });
  it('every template of the brief exists', () => {
    for (const id of ['T_UP_EXO', 'T_UP_KIN', 'P_UP_DN', 'P_UP_NODN', 'INERT_UP', 'PURGE_DOWN', 'LIGHTOFF', 'RUNAWAY', 'AZEOTROPE', 'LIMITING', 'PREDICT_GAP']) expect(why['why.' + id], id).toBeDefined();
  });
});
