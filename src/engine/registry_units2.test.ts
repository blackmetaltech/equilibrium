// Unit registry additions of the full-game night: batch knobs and catalyst choice, the cooled tubular reactor, the fermenter and the column.
import { describe, expect, it } from 'vitest';
import { en } from '../locales/en';
import { META, RAW_DEFS, UNIT_TYPES, bindRegistry, defaultParams, footprint, knobOf, portPhaseOut } from './registry';

describe('registry: new units', () => {
  it('batch exposes T (left unset: the rig follows its charge), time and a catalyst choice; defaults do not override the charge temperature', () => {
    expect(META.batch!.catalyst).toBe(true);
    expect(knobOf('batch', 'T')).toMatchObject({ kind: 'num', unset: true }); expect(knobOf('batch', 'time')).toMatchObject({ kind: 'num', unit: 's' });
    expect(defaultParams('batch')).toEqual({ time: 600 });
  });
  it('column and fermenter are 2 x 2 (the Godot models), the cooled tube 4 x 4; the fermenter dome is a vapour port', () => {
    expect(footprint('column', 0)).toEqual({ w: 2, h: 2 }); expect(footprint('fermenter', 0)).toEqual({ w: 2, h: 2 }); expect(footprint('tubular', 1)).toEqual({ w: 4, h: 4 });
    expect(portPhaseOut('fermenter', 'vap')).toBe('V'); expect(portPhaseOut('fermenter', 'out')).toBe('L');
    expect(RAW_DEFS.column!.outlets).toEqual(['vap', 'liq']); expect(RAW_DEFS.fermenter!.outlets).toEqual(['out', 'vap']);
  });
  it('every registered unit type has a label and every knob key has a label; the solver registry binds them all', () => {
    for (const t of UNIT_TYPES) { expect(en['label.unit.' + t], t).toBeDefined(); for (const k of META[t]?.knobs ?? []) expect(en['label.knob.' + k.key], t + '.' + k.key).toBeDefined(); }
    expect(Object.keys(bindRegistry(['N2'])).sort()).toEqual(UNIT_TYPES);
    expect(META.tubular!.catalyst).toBe(true);
  });
});
