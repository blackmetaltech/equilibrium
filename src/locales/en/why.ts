// Why-panel templates (DESIGN 7.3): explanations built from the player's own numbers. One key per (knob, physics) pair, at most three
// sentences, every number with its unit, a direction word, never blaming the player. `why.<ID>.hint` is the one actionable hint, shown in
// Learner mode only. `{...}` are filled by src/sim/explain/render.ts (direction words: why.word.*).
export const why: Record<string, string> = {
  'why.word.raised': 'raised', 'why.word.lowered': 'lowered', 'why.word.rose': 'rose', 'why.word.fell': 'fell',

  'why.T_UP_EXO': 'You {dir} the temperature at {unit} from {T0} to {T1}. The reaction is exothermic (ΔH = {dH}), so K {kmove} from {K0} to {K1} and the ceiling on conversion {xmove} from {Xeq0} to {Xeq1}. The bed was already at {eta0} of equilibrium, so speed was not what limited it: production {pmove} {pchg}.',
  'why.T_UP_EXO.hint': 'Hint: keep the temperature just high enough for the catalyst to work and let pressure lift the ceiling instead.',
  'why.T_UP_KIN': 'You {dir} the temperature at {unit} from {T0} to {T1}. The bed was only at {eta0} of equilibrium, so it was limited by speed, not by the ceiling: conversion {xmove} from {X0} to {X1} (the ceiling is {Xeq1}). Production {pmove} {pchg}.',
  'why.T_UP_KIN.hint': 'Hint: while the bed is far from equilibrium, a different temperature or more catalyst changes the conversion most.',
  'why.P_UP_DN': 'You {dir} the pressure at {unit} from {P0} to {P1}. The reaction changes the gas moles by {dn} per reaction, so the ceiling on conversion {xmove} from {Xeq0} to {Xeq1}. Production {pmove} {pchg}, and the electric power {wmove} by {dW}.',
  'why.P_UP_DN.hint': 'Hint: pressure pays when the reaction loses gas moles; compare the extra power with the extra product.',
  'why.P_UP_NODN': 'You {dir} the pressure at {unit} from {P0} to {P1}. {eq} has the same number of gas moles on both sides, so K and the ceiling on conversion did not change (still {Xeq1}). The electric power {wmove} by {dW} for the same production.',
  'why.P_UP_NODN.hint': 'Hint: pressure does not move this equilibrium; change the temperature or the feed instead.',
  'why.INERT_UP': 'You {dir} the {species} in the feed at {unit} from {y0} to {y1}. At constant pressure the inert takes room the reactants had, so their partial pressures fall and the ceiling on conversion {xmove} from {Xeq0} to {Xeq1}. Production {pmove} {pchg}.',
  'why.INERT_UP.hint': 'Hint: keep the inert out of the feed, or give it an exit through the purge.',
  'why.PURGE_DOWN': 'You {dir} the purge fraction at {unit} from {f0} to {f1}. The purge is the only way {species} leaves the loop, so its share of the reactor feed moved from {y0} to {y1} and the reactants are diluted to match. Production {pmove} {pchg}.',
  'why.PURGE_DOWN.hint': 'Hint: set the purge so the inert stops piling up, then check what the lost reactant costs.',
  'why.LIGHTOFF': 'The catalyst at {unit} needs {Tmin} to start, but the inlet temperature is {T}, so the bed passes the feed through unreacted (conversion {X}).',
  'why.LIGHTOFF.hint': 'Hint: raise the inlet temperature above the light-off point of the catalyst.',
  'why.RUNAWAY': 'The cooling water flow fell {flowdrop} at {time}. The reactor was at {T0}; with less cooling it made heat faster than it could lose it, and the temperature climbed {dT} in {dt} toward {Tpeak}, past the {Trelief} relief point.',
  'why.RUNAWAY.hint': 'Hint: a trip that cuts the feed before the relief point would hold the temperature.',
  'why.AZEOTROPE': 'The target purity at {unit} is {xspec}, but the mixture forms an azeotrope at {xaz} at {P}, so no number of stages or reflux can pass it.',
  'why.AZEOTROPE.hint': 'Hint: change the column pressure or add an entrainer to move the azeotrope.',
  'why.LIMITING': 'After the change to the feed flow, {species} is the limiting reagent at {unit}: {have} available, but using all the {other} takes {need}. {left} of {other} is left unreacted.',
  'why.LIMITING.hint': 'Hint: raise the {species} feed or lower the {other} feed to bring them back into balance.',
  'why.GENERIC': 'You {dir} {knob} at {unit} from {v0} to {v1}. The {kpi} {kmove} from {k0} to {k1}.',
  'why.PREDICT_GAP': 'You predicted {pred} and the engine gets {act}, {gap} apart. You assumed a constant ΔH; the engine uses Cp(T). Switch Thermo detail to Textbook to compare.',
  'why.PREDICT_GAP_PLAIN': 'You predicted {pred} and the engine gets {act}, {gap} apart.',

  'why.NO_EXIT': '{species} enters at {inflow} and nothing removes it, so every pass through the loop adds more. A steady state only exists if something lets {species} out: add a purge.',
  'why.NOT_CONVERGED': 'The solver stopped after {iterations} passes with a residual of {residual}.',
  'why.FAILED': 'The run stopped with the failure {code}; the unit is marked on the plant.',

  'why.needs.INLET': '{unit} has nothing connected to its {port} inlet.',
  'why.err.run': 'There is no run {id} to explain; runs are numbered from the oldest, and -1 is the latest.',
};
