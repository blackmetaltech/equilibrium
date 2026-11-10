// Teaching-error tests: every rejection of every design / run / meta action says what rule was broken and what to do about it (DESIGN §8.3).
import { describe, expect, it } from 'vitest';
import { connectProblem } from './actions/design';
import { t } from '../i18n';
import type { EqState } from '../state';
import { buildLoop, must, newEngine, reject } from './test-helpers';

const placeAt = (e: ReturnType<typeof newEngine>, type: string, x: number, y: number) => must(e, 'placeUnit', type, x, y, 0).id as string;
const lockPhase = (e: ReturnType<typeof newEngine>, phase: EqState['phase']) => { const s = structuredClone(e.state) as EqState; s.phase = phase; e.setState(s); };

describe('placeUnit', () => {
  it('rejects an unknown type, bad rotation, fractional tiles, a locked palette, a count limit, bounds, overlap and a running plant', () => {
    const e = newEngine();
    expect(reject(e, 'placeUnit', 'teleporter', 0, 0, 0)).toMatch(/teleporter is not a unit this plant knows/);
    expect(reject(e, 'placeUnit', 'mixer', 0, 0, 5)).toMatch(/quarter turns/);
    expect(reject(e, 'placeUnit', 'mixer', 0.5, 0, 0)).toMatch(/whole tile numbers/);
    expect(reject(e, 'placeUnit', 'mixer', 23, 0, 0)).toMatch(/stick out of the fenced plot \(24 by 16 tiles\)/);
    expect(reject(e, 'placeUnit', 'mixer', -2, 0, 0)).toMatch(/stick out/);
    placeAt(e, 'mixer', 0, 0);
    expect(reject(e, 'placeUnit', 'splitter', 1, 1, 0)).toMatch(/taken by M-101/);
    const s = structuredClone(e.state) as EqState; s.palette = ['mixer']; s.limits = { mixer: 1 }; e.setState(s);
    expect(reject(e, 'placeUnit', 'compressor', 8, 8, 0)).toMatch(/no compressor yet/);
    expect(reject(e, 'placeUnit', 'mixer', 8, 8, 0)).toMatch(/allows 1 of mixer/);
    expect(e.act('placeUnit', ['feed', 8, 8, 0]).ok).toBe(true);   // feeds are always available
    lockPhase(e, 'shift');
    expect(reject(e, 'placeUnit', 'feed', 12, 12, 0)).toMatch(/plant is running/);
  });
  it('rejects the 33rd unit', () => {
    const e = newEngine();
    for (let i = 0; i < 32; i++) must(e, 'placeUnit', 'sink', (i % 12) * 2, Math.floor(i / 12) * 2, 0);
    expect(reject(e, 'placeUnit', 'sink', 0, 10, 0)).toMatch(/at most 32 units/);
  });
});

describe('moveUnit / rotateUnit / deleteUnit', () => {
  it('teach on unknown ids, bounds, overlap and a rotation that does not fit', () => {
    const e = newEngine();
    const a = placeAt(e, 'mixer', 0, 0), c = placeAt(e, 'compressor', 20, 14);
    placeAt(e, 'valve', 6, 6);
    expect(reject(e, 'moveUnit', 'Q-9', 0, 0)).toMatch(/no unit Q-9/);
    expect(reject(e, 'moveUnit', a, 1.5, 0)).toMatch(/whole tile numbers/);
    expect(reject(e, 'moveUnit', a, 30, 0)).toMatch(/stick out/);
    expect(reject(e, 'moveUnit', a, 6, 6)).toMatch(/taken by V-/);
    expect(reject(e, 'rotateUnit', 'Q-9')).toMatch(/no unit Q-9/);
    expect(reject(e, 'rotateUnit', c)).toMatch(/stick out/);   // 4x2 at the bottom edge turns into 2x4
    expect(reject(e, 'deleteUnit', 'Q-9')).toMatch(/no unit Q-9/);
    must(e, 'moveUnit', a, 2, 0); must(e, 'rotateUnit', a); expect(e.state.flowsheet.units[0]!.rot).toBe(1);
  });
  it('deleting a unit removes its pipes and its feed', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    must(e, 'deleteUnit', ids.mix); expect(e.state.flowsheet.streams.some((p) => p.from.unit === ids.mix || p.to.unit === ids.mix)).toBe(false);
    must(e, 'deleteUnit', ids.feed); expect(e.state.feeds[ids.feed!]).toBeUndefined();
  });
});

describe('connect / disconnect', () => {
  it('teach: same unit, missing port, wrong direction, occupied inlet (the §8.3 words), taken outlet, liquid into a compressor', () => {
    const e = newEngine();
    const f = placeAt(e, 'feed', 0, 0), m = placeAt(e, 'mixer', 4, 0), f2 = placeAt(e, 'feed', 0, 4), k = placeAt(e, 'compressor', 8, 0), fl = placeAt(e, 'flash', 8, 4);
    expect(reject(e, 'connect', f, 'out', f, 'out')).toMatch(/same unit/);
    expect(reject(e, 'connect', 'Q-9', 'out', m, 'in1')).toMatch(/no unit Q-9/);
    expect(reject(e, 'connect', f, 'bogus', m, 'in1')).toMatch(/F-\d+ has no port called bogus. Its ports are: out/);
    expect(reject(e, 'connect', m, 'in1', f, 'out')).toMatch(/in1 on M-\d+ is an inlet, and a pipe starts at an outlet/);
    expect(reject(e, 'connect', f, 'out', m, 'out')).toMatch(/out on M-\d+ is an outlet, and a pipe ends at an inlet/);
    expect(reject(e, 'connect', f, 'out', m, 'nope')).toMatch(/has no port called nope/);
    must(e, 'connect', f, 'out', m, 'in1');
    expect(reject(e, 'connect', f2, 'out', m, 'in1')).toBe('That inlet already has a pipe. Mix two streams with a Mixer first.');
    expect(reject(e, 'connect', f, 'out', m, 'in2')).toMatch(/already feeds a pipe. To send one stream two ways, split it/);
    must(e, 'connect', fl, 'vap', k, 'in');   // gas into a compressor is fine
    expect(reject(e, 'disconnect', 'S-999')).toMatch(/no stream S-999/);
    const e2 = newEngine(); const fl2 = placeAt(e2, 'flash', 0, 0), k2 = placeAt(e2, 'compressor', 4, 0);
    expect(reject(e2, 'connect', fl2, 'liq', k2, 'in')).toMatch(/carries liquid but the inlet takes gas only/);
  });
  it('the pump rule has its exact §8.3 words, and the 56-stream cap is enforced by the shared rule set', () => {
    expect(t('err.connect.pump_gas')).toBe('A pump moves liquids. To raise the pressure of a gas, use a compressor.');
    const e = newEngine(); const a = placeAt(e, 'feed', 0, 0), b = placeAt(e, 'sink', 4, 0);
    const s = structuredClone(e.state) as EqState;
    s.flowsheet.streams = Array.from({ length: 56 }, (_, i) => ({ id: 'X' + i, from: { unit: 'n', port: 'p' + i }, to: { unit: 'n', port: 'q' + i } }));
    expect(connectProblem(s, s.flowsheet.units.find((u) => u.id === a)!, 'out', s.flowsheet.units.find((u) => u.id === b)!, 'in')?.key).toBe('err.connect.streams_full');
  });
  it('disconnect removes the pipe', () => {
    const e = newEngine(); const { pipes } = buildLoop(e); const n = e.state.flowsheet.streams.length;
    must(e, 'disconnect', pipes.v_m); expect(e.state.flowsheet.streams.length).toBe(n - 1);
  });
});

describe('setParam', () => {
  it('teaches on unknown units and knobs, non-numbers, ranges (with display units), integers, choices; the splitter fraction has the §8.3 words', () => {
    const e = newEngine(); const x = placeAt(e, 'splitter', 0, 0), h = placeAt(e, 'heater', 4, 0), k = placeAt(e, 'compressor', 8, 0);
    expect(reject(e, 'setParam', 'Q-9', 'T', 1)).toMatch(/no unit Q-9/);
    expect(reject(e, 'setParam', h, 'colour', 1)).toMatch(/H-\d+ has no knob called colour. Its knobs are: T, dP, utility/);
    expect(reject(e, 'setParam', h, 'T', 'hot')).toMatch(/T is a number/);
    expect(reject(e, 'setParam', h, 'T', NaN)).toMatch(/T is a number/);
    expect(reject(e, 'setParam', x, 'purge', 1.2)).toBe('A split fraction is a share of the stream: it must be between 0 and 1.');
    expect(reject(e, 'setParam', x, 'frac', -0.1)).toBe('A split fraction is a share of the stream: it must be between 0 and 1.');
    expect(reject(e, 'setParam', h, 'T', 5000)).toMatch(/T on H-\d+ runs from -123.1 °C to 1,227 °C; 4,727 °C is not possible/);
    expect(reject(e, 'setParam', k, 'stages', 1.5)).toMatch(/counts whole steps/);
    expect(reject(e, 'setParam', k, 'stages', 9)).toMatch(/runs from 1 to 4/);
    expect(reject(e, 'setParam', h, 'utility', 'magic')).toMatch(/can only be one of: -, steam, fired, cw, refrig/);
    must(e, 'setParam', x, 'purge', 0.2); expect(e.state.flowsheet.units[0]!.params.frac).toBe(0.2);
    must(e, 'setParam', h, 'utility', 'steam'); must(e, 'setParam', h, 'utility', ''); expect(e.state.flowsheet.units[1]!.params.utility).toBeUndefined();
    lockPhase(e, 'report'); expect(reject(e, 'setParam', h, 'T', 400)).toMatch(/plant is running/);
  });
  it('feed knobs write through to the FeedSpec', () => {
    const e = newEngine(); const f = placeAt(e, 'feed', 0, 0);
    must(e, 'setParam', f, 'flow', 3); must(e, 'setParam', f, 'T', 350);
    expect(e.state.feeds[f]).toMatchObject({ flow: 3, T: 350 }); expect(e.state.flowsheet.units[0]!.params).toMatchObject({ flow: 3, T: 350, y_N2: 1, y_H2: 0 });
  });
});

describe('setFeed', () => {
  it('teaches on non-feeds, wrong composition length, bad fractions, flow, T, P and price keys', () => {
    const e = newEngine(); const f = placeAt(e, 'feed', 0, 0), m = placeAt(e, 'mixer', 4, 0);
    expect(reject(e, 'setFeed', 'Q-9', {})).toMatch(/no unit Q-9/);
    expect(reject(e, 'setFeed', m, { flow: 1 })).toMatch(/not a feed/);
    expect(reject(e, 'setFeed', f, null)).toMatch(/cannot be negative/);
    expect(reject(e, 'setFeed', f, { x: [1, 0] })).toMatch(/lists 2 fractions but this plant tracks 4 species/);
    expect(reject(e, 'setFeed', f, { x: [1, -1, 0, 0] })).toMatch(/cannot be negative/);
    expect(reject(e, 'setFeed', f, { x: [0, 0, 0, 0] })).toMatch(/add up to something above zero/);
    expect(reject(e, 'setFeed', f, { flow: -1 })).toMatch(/positive amount per second/);
    expect(reject(e, 'setFeed', f, { T: 5 })).toMatch(/temperature must lie between -223.1 °C and 2,727 °C/);
    expect(reject(e, 'setFeed', f, { P: 1 })).toMatch(/pressure must lie between/);
    expect(reject(e, 'setFeed', f, { priceKey: 'gold' })).toMatch(/gold is not a price on this region/);
    must(e, 'setFeed', f, { x: [2, 2, 0, 0], priceKey: 'ammonia' });
    expect(e.state.feeds[f]!.x).toEqual([0.5, 0.5, 0, 0]); expect(e.state.feeds[f]!.priceKey).toBe('ammonia');
  });
});

describe('setCatalyst / setSpecies', () => {
  it('teaches on non-reactors and unknown catalysts; a packed bed accepts a catalogue catalyst', () => {
    const e = newEngine(); const m = placeAt(e, 'mixer', 0, 0), pb = placeAt(e, 'packed_bed', 4, 0);
    expect(reject(e, 'setCatalyst', 'Q-9', 'x')).toMatch(/no unit Q-9/);
    expect(reject(e, 'setCatalyst', m, 'x')).toMatch(/mixer has no catalyst bed/);
    expect(reject(e, 'setCatalyst', pb, 'unobtainium')).toMatch(/unobtainium is not a catalyst in the catalogue/);
    const real = /Choose one of: ([^.]+)\./.exec(reject(e, 'setCatalyst', pb, 'unobtainium'))![1]!.split(', ')[0]!;
    must(e, 'setCatalyst', pb, real); expect(e.state.flowsheet.units[1]!.catalystId).toBe(real);
  });
  it('the species list is a free-play choice made before building', () => {
    const e = newEngine([]);
    expect(reject(e, 'setSpecies', Array(13).fill('N2'))).toMatch(/at most 12 species/);
    expect(reject(e, 'setSpecies', ['N2', 'unobtainium'])).toMatch(/unobtainium is not in the species catalogue/);
    expect(reject(e, 'setSpecies', ['N2', 'N2'])).toMatch(/names N2 twice/);
    must(e, 'setSpecies', ['N2', 'H2']); placeAt(e, 'feed', 0, 0);
    expect(reject(e, 'setSpecies', ['N2'])).toMatch(/fixed by the level/);
  });
});

describe('undo / redo / predict / setThermoDetail', () => {
  it('teach on empty stacks, a locked call, odd quantities and values, unknown thermo detail', () => {
    const e = newEngine();
    expect(reject(e, 'undo')).toMatch(/Nothing to undo/); expect(reject(e, 'redo')).toMatch(/Nothing to redo/);
    expect(reject(e, 'predict', 'Conversion %', 0.5)).toMatch(/lowercase words joined by underscores/);
    expect(reject(e, 'predict', 'conversion', 'half')).toMatch(/A call is a number/);
    expect(reject(e, 'predict', 'conversion', Infinity)).toMatch(/A call is a number/);
    expect(reject(e, 'setThermoDetail', 'vague')).toMatch(/Choose rigorous, textbook or book/);
    must(e, 'setThermoDetail', 'book'); expect(e.state.thermoDetail).toBe('book');
    must(e, 'predict', 'conversion', 0.5); expect(e.state.prediction).toEqual({ quantity: 'conversion', value: 0.5 });
  });
  it('the call is locked once the plant is commissioned', () => {
    const e = newEngine(); buildLoop(e); must(e, 'predict', 'product_t_per_h', 0.001); must(e, 'commission');
    expect(reject(e, 'predict', 'product_t_per_h', 5)).toMatch(/locked once the plant is commissioned/);
    expect(e.state.runs[0]!.prediction).toEqual({ quantity: 'product_t_per_h', value: 0.001 });
  });
});

describe('commission', () => {
  it('rejects an empty plant, an open outlet (the §8.3 words with the unit id) and an open inlet; nothing changes', () => {
    const e = newEngine();
    expect(reject(e, 'commission')).toMatch(/nothing to commission/);
    const f = placeAt(e, 'feed', 0, 0), m = placeAt(e, 'mixer', 4, 0);
    expect(reject(e, 'commission')).toBe(`Stream from ${f} outlet goes nowhere. Every outlet must end in a unit, a product tank or the stack.`);
    must(e, 'connect', f, 'out', m, 'in1');
    expect(reject(e, 'commission')).toMatch(new RegExp(`Nothing arrives at the in2 inlet of ${m}`));
    expect(e.state.phase).toBe('design'); expect(e.state.solved).toBeNull();
  });
  it('a solver failure is stored as a coded result with the failing units flagged and the phase kept at design (NO_EXIT without a purge)', () => {
    const e = newEngine(); const { ids } = buildLoop(e); must(e, 'setParam', ids.split, 'frac', 0);
    const r = e.act('commission', []);
    expect(r.ok).toBe(true); expect(r.commissioned).toBe(false); expect(r.code).toBe('NO_EXIT');
    expect(r.message).toMatch(/nothing removes it/);
    const s = e.state;
    expect(s.phase).toBe('design'); expect(s.solved!.ok).toBe(false); expect(s.solved!.failure!.code).toBe('NO_EXIT'); expect(s.solved!.failedUnits.length).toBeGreaterThan(0);
    expect((e.snapshot() as any).failure).toEqual({ code: 'NO_EXIT', unitId: null, message: expect.any(String) });
    expect(e.act('setParam', [ids.split, 'frac', 0.05]).ok).toBe(true); expect(e.state.solved).toBeNull();
  });
  it('a unit failure names the unit (a valve asked to raise pressure)', () => {
    const e = newEngine(); const { ids } = buildLoop(e); must(e, 'setParam', ids.valve, 'P', 3e7);
    const r = e.act('commission', []);
    expect(r.commissioned).toBe(false); expect(r.code).toBe('VALVE_P_RISE'); expect(r.unitId).toBe(ids.valve);
    expect(r.message).toMatch(/A valve can only lower pressure/); expect(e.state.solved!.failedUnits).toEqual([ids.valve]);
    expect((e.q('unitCard', [ids.valve]) as any).failed).toBe(true);
  });
  it('editing a commissioned plant sends it back to design and drops the stale result', () => {
    const e = newEngine(); const { ids } = buildLoop(e); must(e, 'commission');
    expect(e.state.phase).toBe('commissioned'); must(e, 'setParam', ids.cool, 'T', 330);
    expect(e.state.phase).toBe('design'); expect(e.state.solved).toBeNull();
  });
});

describe('meta actions', () => {
  it('markCoach, pin and claimStars teach', () => {
    const e = newEngine([]);
    expect(reject(e, 'markCoach', 'a b c')).toMatch(/short id/); must(e, 'markCoach', 'step.1'); expect(e.state.ui.coachStep).toBe('step.1');
    expect(reject(e, 'pin', '')).toMatch(/short id/);
    for (const w of ['a', 'b', 'c']) must(e, 'pin', w);
    expect(reject(e, 'pin', 'd')).toMatch(/Three readouts can be pinned/);
    must(e, 'pin', 'a'); expect(e.state.ui.pinned).toEqual(['b', 'c']);
    expect(reject(e, 'claimStars')).toMatch(/Start one first/);
  });
});
