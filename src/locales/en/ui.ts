// Log lines, phase names and save labels shown by the engine side.
export const ui: Record<string, string> = {
  'log.start': '{works}: the plot is fenced and empty. Place units on the 2 m grid, connect them, then commission the plant.',
  'save.label': '{works} · {phase} · {units} units · tick {tick}',
  'phase.design': 'Design',
  'phase.commissioned': 'Commissioned',
  'phase.firstrun': 'First run',
  'phase.shift': 'Shift',
  'phase.report': 'Report',
  'thermo.rigorous': 'Rigorous',
  'thermo.textbook': 'Textbook',
  'thermo.book': 'Book data',
  'describe.plant': 'Tick {tick}: {works}, phase {phase}, {units} units, {streams} streams, {species} species, thermo {thermo}.',
};
