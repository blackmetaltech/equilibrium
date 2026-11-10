// Partial oxidation rows: dH298 from the species polynomials against NIST-JANAF heats of formation (kJ/mol, gas):
//   CH4 -74.87, C3H8 -104.7 (NIST webbook; JANAF -104.68), CO -110.53, H2O(g) -241.826.
//   R19: -110.53 + 2(-241.826) - (-74.87) = -519.31;  R20: 3(-110.53) + 4(-241.826) - (-104.7) = -1194.19.
import { describe, expect, it } from 'vitest';
import { reactionOf } from '../../data/reactions';
import { rxnDH } from './reactions';

describe('partial oxidation heats of reaction', () => {
  it('R19 is -519 kJ/mol at 298.15 K', () => { expect(rxnDH(reactionOf('R19').nu, 298.15, 'rigorous') / 1000).toBeCloseTo(-519.3, 0); });
  it('R20 is -1194.2 kJ/mol at 298.15 K', () => { expect(rxnDH(reactionOf('R20').nu, 298.15, 'rigorous') / 1000).toBeCloseTo(-1194.2, 0); });
  it('Hess: R19 + R15 = R13 (-802.3 kJ/mol)', () => {
    const d = (id: string) => rxnDH(reactionOf(id).nu, 298.15, 'rigorous');
    expect(d('R19') + d('R15')).toBeCloseTo(d('R13'), 3);
    expect(d('R13') / 1000).toBeCloseTo(-802.3, 0);
  });
});
