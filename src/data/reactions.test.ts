import { describe, expect, it } from 'vitest';
import { REACTIONS, REACTION_IDS, REACTOR_SETS, MUST_SHIP_REACTIONS, findReaction, reactionOf, reactionProvenanceReport } from './reactions';
import { SPECIES } from './species';
import type { Conf } from '../sim/types';

const CONFS: Conf[] = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'];
const MUST = ['R1', 'R2', 'R5', 'R9', 'R10', 'R11', 'R13'];

describe('reaction catalogue (DESIGN 4.2)', () => {
  it('ships the must-ship set from the brief plus the extra rows', () => {
    for (const id of [...MUST, 'R14', 'R15', 'R16', 'R17', 'R18']) expect(findReaction(id)?.tier, id).toBe('must');
    expect(new Set(REACTION_IDS).size).toBe(REACTION_IDS.length);
    expect(MUST_SHIP_REACTIONS.length).toBeGreaterThanOrEqual(12);
    expect(() => reactionOf('nope')).toThrow();
  });

  it('every reaction carries a non-empty src, a valid conf, species that exist, and the right phases and dn_gas', () => {
    for (const r of REACTIONS) {
      expect(r.src.trim().length, r.id).toBeGreaterThan(0);
      expect(CONFS, r.id).toContain(r.conf);
      let dn = 0;
      for (const id of Object.keys(r.nu)) {
        const sp = SPECIES[id];
        expect(sp, `${r.id} species ${id}`).toBeDefined();
        expect(r.phase[id], `${r.id} phase ${id}`).toBe(sp!.phase);
        if (sp!.phase === 'g') dn += r.nu[id]!;
      }
      expect(r.dnGas, r.id).toBe(dn);
    }
  });

  it('DESIGN 4.2 dn_gas column: R1 -2, R2 -1/2, R5 0, R6 +2, R9 -1, R10 0, R13 0', () => {
    const dn = (id: string) => reactionOf(id).dnGas;
    expect([dn('R1'), dn('R2'), dn('R5'), dn('R6'), dn('R9'), dn('R10'), dn('R13')]).toEqual([-2, -0.5, 0, 2, -1, 0, 0]);
  });

  it('products positive, reactants negative: every reaction has both', () => {
    for (const r of REACTIONS) {
      const v = Object.values(r.nu);
      expect(v.some((x) => x < 0) && v.some((x) => x > 0), r.id).toBe(true);
    }
  });

  it('a row without species thermo carries its own dH298 with a conf; UNVERIFIED only for the lab H2O2 row (no goal)', () => {
    for (const r of REACTIONS) {
      if (r.thermo) expect(r.dH298book, r.id).toBeUndefined();
      else expect(Number.isFinite(r.dH298book), r.id).toBe(true);
    }
    const bad = REACTIONS.filter((r) => r.tier === 'must' && r.conf === 'UNVERIFIED').map((r) => r.id);
    expect(bad).toEqual(['R17']);
    expect(reactionProvenanceReport()).toHaveLength(REACTIONS.length);
  });

  it('catalysts are ids only, and the reactor sets refer to catalogue reactions', () => {
    for (const r of REACTIONS) for (const c of r.catalysts) expect(/^[a-z0-9_]+$/.test(c), c).toBe(true);
    expect(reactionOf('R1').catalysts).toContain('fe_ammonia');
    for (const [name, ids] of Object.entries(REACTOR_SETS)) for (const id of ids) expect(findReaction(id), `${name}:${id}`).toBeDefined();
  });
});

describe('partial oxidation rows (rich burns, L03)', () => {
  it('R19 CH4 + 3/2 O2 -> CO + 2 H2O and R20 C3H8 + 7/2 O2 -> 3 CO + 4 H2O are catalogued as must rows with provenance', () => {
    expect(reactionOf('R19').nu).toEqual({ CH4: -1, O2: -1.5, CO: 1, H2O: 2 });
    expect(reactionOf('R20').nu).toEqual({ C3H8: -1, O2: -3.5, CO: 3, H2O: 4 });
    for (const id of ['R19', 'R20']) { expect(reactionOf(id).tier).toBe('must'); expect(reactionOf(id).reversible).toBe(false); expect(reactionOf(id).conf).not.toBe('UNVERIFIED'); expect(reactionOf(id).src.length).toBeGreaterThan(10); }
  });
});
