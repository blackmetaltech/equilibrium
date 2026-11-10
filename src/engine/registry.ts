// The unified unit registry (M1.12): every lane's UNIT_DEFS merged into one table, plus what the game layer needs per unit type that the
// rule code does not carry: footprint (tiles), palette category, phase of every port, knob specs (the single source for Inspect, for
// setParam's range checks and for the env's legal actions) and the solver registry bound to the level's species list.
// Adding a lane: import its defs below and add them to RAW_DEFS (reactors: registryRx / registryCstr, owned by M1.7b / M1.8).
import { UNIT_DEFS } from '../sim/units/registry';
import { UNIT_DEFS_B } from '../sim/units/registryB';
import { UNIT_DEFS_RX } from '../sim/units/registryRx';
import { UNIT_DEFS_CSTR } from '../sim/units/registryCstr';
import { labFlask } from '../sim/units/lab_flask';
import type { UnitDefM16 } from '../sim/units/registry';
import type { PhaseHook, Registry, UnitDef } from '../sim/flowsheet';
import type { UnitInst } from '../sim/types';
import { UTIL } from '../sim/units/utilities';
import { ORIFICE_LETTERS } from '../data/vle';

export type Phase = 'V' | 'L' | 'any';
export type PaletteCat = 'source' | 'mix' | 'heat' | 'move' | 'react' | 'separate' | 'safety' | 'sink';
export const PALETTE_CATS: PaletteCat[] = ['source', 'mix', 'heat', 'move', 'react', 'separate', 'safety', 'sink'];

/** One player knob. All numbers SI; `unit` names the display unit (a key of DISPLAY_PAIRS in src/sim/si.ts, or a plain label). */
export interface KnobSpec {
  key: string;
  kind: 'num' | 'choice';
  min: number;
  max: number;
  /** Coarse and fine step, SI. */
  coarse: number;
  fine: number;
  def: number | string;
  unit: string;
  int?: boolean;
  /** Left out of the params of a freshly placed unit (the unit then follows its inlet); `def` is where the knob starts when first touched. */
  unset?: boolean;
  options?: string[];
}

export interface UnitMeta {
  type: string;
  /** Footprint in 2 m tiles at rotation 0 (odd rotations swap w and h). */
  w: number;
  h: number;
  cat: PaletteCat;
  knobs: KnobSpec[];
  /** Phase leaving each outlet port; ports not listed are 'any'. */
  phaseOut: Record<string, Phase>;
  /** A catalyst can be chosen for this unit (reactors: packed_bed, multibed). */
  catalyst?: boolean;
  /** Utility-free label of what the unit's cost is sized from (see solved.ts). */
  alias?: Record<string, string>;
}

/** Lanes still to come (CSTR / batch rig, M1.8) are added here. */
/** M2.1: lab_flask (L14) is the level lane's own unit (src/sim/units/lab_flask.ts). */
const UNIT_DEFS_LAB: Record<string, UnitDefM16> = { lab_flask: { inlets: ['in'], outlets: ['out'], fn: labFlask, phaseIn: { in: 'V' } } };
const EXTRA_DEFS: Record<string, UnitDefM16>[] = [UNIT_DEFS_RX, UNIT_DEFS_CSTR, UNIT_DEFS_LAB];
export const RAW_DEFS: Readonly<Record<string, UnitDefM16>> = Object.assign({}, UNIT_DEFS, UNIT_DEFS_B, ...EXTRA_DEFS);
export const UNIT_TYPES: string[] = Object.keys(RAW_DEFS).sort();

const num = (key: string, min: number, max: number, coarse: number, fine: number, def: number, unit: string, int = false): KnobSpec =>
  ({ key, kind: 'num', min, max, coarse, fine, def, unit, ...(int ? { int: true } : {}) });
const choice = (key: string, options: string[], def: string): KnobSpec => ({ key, kind: 'choice', min: 0, max: options.length - 1, coarse: 1, fine: 1, def, unit: '', options });

const T_K = (def: number): KnobSpec => num('T', 150, 1500, 25, 5, def, 'degC');
const P_PA = (key: string, def: number): KnobSpec => num(key, 1e4, 4e7, 5e5, 1e5, def, 'bar');
const dP = (): KnobSpec => num('dP', 0, 5e6, 1e5, 1e4, 0, 'bar');
const utilities = ['', ...Object.keys(UTIL)];

const m = (type: string, w: number, h: number, cat: PaletteCat, knobs: KnobSpec[] = [], extra: Partial<UnitMeta> = {}): UnitMeta =>
  ({ type, w, h, cat, knobs, phaseOut: {}, ...extra });

const META_LIST: UnitMeta[] = [
  m('feed', 2, 2, 'source', [num('flow', 0, 1e4, 10, 1, 1, 'kmol/h'), T_K(298.15), P_PA('P', 1e5)]),
  m('mixer', 2, 2, 'mix'), m('mixer3', 2, 2, 'mix'), m('mixer4', 2, 2, 'mix'),
  m('splitter', 2, 2, 'mix', [num('frac', 0, 1, 0.05, 0.01, 0.05, 'mol%')]),
  m('purge', 2, 2, 'mix', [num('frac', 0, 1, 0.05, 0.01, 0.05, 'mol%')]),
  m('heater', 2, 2, 'heat', [T_K(450), dP(), choice('utility', utilities, '')]),
  m('cooler', 2, 2, 'heat', [T_K(320), dP(), choice('utility', utilities, '')]),
  m('hx', 4, 2, 'heat', [num('area', 0, 5000, 10, 1, 10, 'm²'), num('dP_hot', 0, 5e6, 1e5, 1e4, 0, 'bar'), num('dP_cold', 0, 5e6, 1e5, 1e4, 0, 'bar')]),
  m('compressor', 4, 2, 'move', [P_PA('P', 2e6), num('stages', 1, 4, 1, 1, 1, '', true)], { phaseOut: {} }),
  m('valve', 2, 2, 'move', [P_PA('P', 5e5)]),
  m('flash', 2, 2, 'separate', [T_K(300), P_PA('P', 1e5)], { phaseOut: { vap: 'V', liq: 'L' } }),
  m('nh3_sep', 2, 2, 'separate', [num('T', UTIL.refrig.T, 320, 5, 1, 253.15, 'degC'), dP()], { phaseOut: { vap: 'V', liq: 'L' } }),
  m('boiler', 4, 2, 'heat', [T_K(450), choice('steam', ['LP', 'MP', 'HP'], 'HP')]),
  m('absorber', 4, 4, 'separate', [num('acid', 0.98, 0.985, 0.002, 0.0005, 0.985, 'mol%'), num('recovery', 0, 0.9995, 0.05, 0.005, 0.9995, 'mol%'), choice('absorbent', ['acid', 'water'], 'acid')], { phaseOut: { acid: 'L' } }),
  m('stack', 2, 2, 'sink'), m('relief', 1, 1, 'safety', [P_PA('Pset', 2e6), choice('orifice', [...ORIFICE_LETTERS], 'D')]), m('flare', 2, 2, 'safety'),
  m('interlock', 1, 1, 'safety', [num('setpoint', 0, 1e8, 1e5, 1e3, 0, '')]),
  m('sink', 2, 2, 'sink'), m('product', 2, 2, 'sink'), m('vent', 2, 2, 'sink'),
  // Reactors (lane M1.7b). Level-fixed parameters (reactions, law, beds) arrive through EqState.presets; the knobs here are the player's.
  m('stoich_reactor', 4, 4, 'react', [num('X', 0, 1, 0.05, 0.01, 1, 'mol%')]), m('burner', 4, 4, 'react', [num('X', 0, 1, 0.05, 0.01, 1, 'mol%')]),
  m('gasifier', 4, 4, 'react'), m('co_burner', 4, 4, 'react', [num('X', 0, 1, 0.05, 0.01, 1, 'mol%')]),
  m('eq_reactor', 4, 4, 'react', [T_K(700), dP()]), m('eq_bed', 4, 4, 'react', [dP()]),
  m('packed_bed', 4, 4, 'react', [num('W', 0, 1e5, 500, 50, 1000, 'kg'), dP()], { catalyst: true }),
  m('multibed', 4, 4, 'react', [dP()], { catalyst: true }), m('cstr', 4, 4, 'react'),
  m('tubular', 4, 4, 'react', [num('W', 0, 1e5, 500, 50, 1000, 'kg'), num('Tc', 483.15, 543.15, 5, 1, 523.15, 'degC'), dP()], { catalyst: true }),
  m('fermenter', 2, 2, 'react', [num('T', 278.15, 328.15, 2, 0.5, 305.15, 'degC'), num('time', 0, 4e5, 3600, 600, 81000, 's')], { phaseOut: { out: 'L', vap: 'V' } }),
  m('column', 2, 2, 'separate', [num('xD', 0.01, 0.999, 0.05, 0.005, 0.8, 'mol%'), num('rec', 0.5, 1, 0.01, 0.001, 0.99, 'mol%'), num('rr', 1, 10, 0.5, 0.1, 1.3, ''), { ...P_PA('P', 101325), unset: true }]),
  m('batch', 2, 2, 'react', [{ ...T_K(298.15), unset: true }, num('time', 0, 1e5, 600, 60, 600, 's')], { catalyst: true }),
  m('lab_flask', 2, 2, 'react', [num('V', 1e-5, 1, 1e-3, 1e-4, 1e-3, 'm³'), num('T', 150, 1500, 25, 5, 400, 'degC'), num('Pfix', 0, 4e7, 5e5, 1e5, 0, 'bar')]),
];
export const META: Readonly<Record<string, UnitMeta>> = Object.fromEntries(META_LIST.map((x) => [x.type, x]));
/** Fallback for a registered type nobody described yet (a new lane): a 2x2 box with no knobs, shown in the palette under 'react'. */
export const metaOf = (type: string): UnitMeta => META[type] ?? m(type, 2, 2, 'react');

/** Types that may always be placed whatever the level palette says (DESIGN §2.6: feeds, product tanks and the stack are always available). */
export const ALWAYS_AVAILABLE: readonly string[] = ['feed', 'product', 'stack'];
/** Units whose duty is measured with liquid-phase enthalpies the plain mixture enthalpy does not know: energy closure is not checked there. */
export const PHASE_CHANGE_TYPES: readonly string[] = ['flash', 'nh3_sep', 'absorber'];

export const hasUnitType = (t: string): boolean => Object.prototype.hasOwnProperty.call(RAW_DEFS, t);
export const defOf = (t: string): UnitDefM16 => RAW_DEFS[t]!;

/** Footprint of an instance (rotation applied). */
export function footprint(type: string, rot: number): { w: number; h: number } {
  const x = metaOf(type);
  return rot % 2 === 1 ? { w: x.h, h: x.w } : { w: x.w, h: x.h };
}

export function knobOf(type: string, key: string): KnobSpec | undefined { return metaOf(type).knobs.find((k) => k.key === key); }

/** Default parameters of a freshly placed unit: every knob at its default (choice knobs left unset when ''). */
export function defaultParams(type: string): Record<string, number | string> {
  const p: Record<string, number | string> = {};
  for (const k of metaOf(type).knobs) if (!(k.kind === 'choice' && k.def === '') && k.unset !== true) p[k.key] = k.def;
  return p;
}

export function portPhaseIn(type: string, port: string): Phase { return RAW_DEFS[type]?.phaseIn?.[port] ?? 'any'; }
export function portPhaseOut(type: string, port: string): Phase { return metaOf(type).phaseOut[port] ?? 'any'; }

/** Solver def with the game-layer extras the phase hook needs. */
export type BoundDef = UnitDef & { type: string; phaseIn?: Record<string, Phase> };

/** Solver registry for one level: exits/consumes are bound to the species list (the lane defs take it as a third argument). */
export function bindRegistry(species: string[]): Registry {
  const r: Registry = {};
  for (const t of UNIT_TYPES) {
    const d = RAW_DEFS[t]!;
    const bound: BoundDef = { type: t, inlets: d.inlets, outlets: d.outlets, fn: d.fn, phaseIn: d.phaseIn };
    if (d.isSource) bound.isSource = true;
    if (d.isSink) bound.isSink = true;
    if (d.optionalInlets) bound.optionalInlets = d.optionalInlets;
    const ex = d.exits, co = d.consumes;
    if (ex) bound.exits = (u: UnitInst, i: number) => ex(u, i, species);
    if (co) bound.consumes = (u: UnitInst, i: number) => co(u, i, species);
    r[t] = bound;
  }
  return r;
}

/** True when a pipe joins ports whose phases clash (gas into a liquid-only port or the reverse). */
export const phaseClash = (pf: Phase, pt: Phase): boolean => pf !== 'any' && pt !== 'any' && pf !== pt;

/** Phase-compatibility hook for the solver (same rule as connect()). */
export const phaseHook: PhaseHook = (pipe, from, to) =>
  !phaseClash(portPhaseOut((from as BoundDef).type, pipe.from.port), (to as BoundDef).phaseIn?.[pipe.to.port] ?? 'any');
