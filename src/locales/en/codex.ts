// Codex entries: one idea, what it means in the plant, the equation behind it, and the simplification we make. Simplifications are named.
export const codex: Record<string, string> = {
  'concept.extent.name': 'Extent of reaction',
  'concept.extent.what': 'One number ξ says how far a reaction has gone: every species changes by its stoichiometric coefficient times ξ.',
  'concept.extent.why': 'With ξ the atom balance holds by construction, and a reactor with several reactions is one number per reaction instead of one per species.',
  'concept.extent.simplification': 'Each reaction is written with whole-number coefficients; side reactions you do not list do not happen.',
  'concept.equilibrium.name': 'Chemical equilibrium',
  'concept.equilibrium.what': 'A reaction stops changing when the reaction quotient Q equals the equilibrium constant K(T).',
  'concept.equilibrium.why': 'K depends on temperature only: pressure, inerts and concentration move the position (Q), not K.',
  'concept.equilibrium.simplification': 'Ideal-gas activities at the plant pressure; standard state 1 bar.',
};
