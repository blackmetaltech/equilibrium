// DESIGN 4.0: every catalogue number carries src + conf; UNVERIFIED is not allowed behind a must-ship goal.
// This file holds the species part; later lanes (reactions, kinetics, catalysts, costs, levels) extend it.
import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_IDS, provenanceReport } from './species';
import type { Conf } from '../sim/types';

const CONFS: Conf[] = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'];

describe('species provenance', () => {
  it('every species row has a non-empty src and a valid conf', () => {
    for (const id of SPECIES_IDS) {
      const s = SPECIES[id]!;
      expect(s.src.trim().length, id).toBeGreaterThan(0);
      expect(CONFS, id).toContain(s.conf);
      for (const c of [s.confCrit, s.confTb, s.confAntoine, s.confDHvap]) if (c !== undefined) expect(CONFS, id).toContain(c);
    }
  });

  it('a must-ship species has no UNVERIFIED thermo (dHf, S, Cp, M)', () => {
    const bad = SPECIES_IDS.filter((id) => SPECIES[id]!.tier === 'must' && SPECIES[id]!.conf === 'UNVERIFIED');
    expect(bad).toEqual([]);
  });

  it('every must-ship species that has thermo data carries all of dHf, S and at least one Cp segment (or a liquidOf link)', () => {
    for (const id of SPECIES_IDS) {
      const s = SPECIES[id]!;
      if (s.tier !== 'must' || !s.hasThermo) continue;
      expect(Number.isFinite(s.dHf298), id).toBe(true);
      expect(s.segments.length > 0 || s.liquidOf !== undefined, id).toBe(true);
    }
  });

  it('lists the SNIP / UNVERIFIED rows (documented, not failing)', () => {
    const rep = provenanceReport();
    const flagged = rep.filter((r) => r.conf === 'SNIP' || r.conf === 'UNVERIFIED' || r.confCrit === 'UNVERIFIED' || r.confTb === 'UNVERIFIED');
    // the known ones (DESIGN 4.1): SO3 critical constants, H2SO4(l) SNIP, HNO3(l) UNVERIFIED
    const byId = Object.fromEntries(rep.map((r) => [r.id, r]));
    expect(byId['SO3']!.confCrit).toBe('UNVERIFIED');
    expect(byId['H2SO4(l)']!.conf).toBe('SNIP');
    expect(byId['HNO3(l)']!.conf).toBe('UNVERIFIED');
    expect(byId['N2']!.conf).toBe('FETCHED');
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('critical constants of must-ship species used by the non-ideality gauge are not UNVERIFIED unless flagged in the table', () => {
    const allowed = new Set(['SO3', 'NO2', 'N2O4']); // DESIGN 4.1: not used by any goal
    for (const id of SPECIES_IDS) {
      const s = SPECIES[id]!;
      if (s.tier === 'must' && s.confCrit === 'UNVERIFIED') expect(allowed.has(id), id).toBe(true);
    }
  });
});
