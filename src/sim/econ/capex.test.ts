// Capex oracles. Expected numbers were computed independently with docs/research/costs_turton.py (cp0, fp_log, fp_vessel) and the
// costs.md factors, escalated 397 -> 797.9, e.g.  python3 -I: 2.7 * cp0('compressor_centrifugal', 1000) * 797.9/397 = 1 517 475.62.
import { describe, expect, it } from 'vitest';
import { annualisedCapex, capexItem, capexTotal, crf, escalate, type CapexSpec } from './capex';

const val = (s: CapexSpec) => { const r = capexItem(s); if (!r.ok) throw new Error(r.code); return r.value; };
const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b) / b).toBeLessThan(rel);

describe('BUILD-PLAN worked checks (2023 dollars)', () => {
  it('1 MW centrifugal compressor (1000 kW fluid power, CS) is about $1.52 M bare module', () => {
    const v = val({ type: 'compressor', size: 1000 });
    near(v.cbm, 1517475.620379101); expect(v.cbm).toBeGreaterThan(1.51e6); expect(v.cbm).toBeLessThan(1.53e6);
    near(v.cp0, 279640, 2e-3);
    expect(v.fp).toBe(1); expect(v.units).toBe(1);
  });
  it('100 m2 floating-head HX, CS, 10 barg is about $169 k bare module (Fp 1.0184)', () => {
    const v = val({ type: 'hx_floating_head', size: 100, pBarg: 10 });
    near(v.cbm, 169031.64462615133); expect(v.cbm).toBeGreaterThan(168e3); expect(v.cbm).toBeLessThan(170e3);
    near(v.fp, 1.0184, 1e-3);
  });
});

describe('hand-computed capex cases, three or more per must-ship type', () => {
  const cases: Array<[string, CapexSpec, number]> = [
    ['compressor 2000 kW', { type: 'compressor', size: 2000 }, 2487950.1134725832],
    ['compressor 1000 kW stainless', { type: 'compressor', size: 1000, material: 'SS' }, 3259762.4437773284],
    ['hx 50 m2 SS 30 barg', { type: 'hx_floating_head', size: 50, material: 'SS', pBarg: 30 }, 272714.49347239983],
    ['fixed-tube hx 500 m2 CS 0 barg (Fp = 1)', { type: 'hx_fixed_tube', size: 500, pBarg: 0 }, 329263.2733033749],
    ['fired heater 10 MW CS 20 barg', { type: 'fired_heater', size: 10000, pBarg: 20 }, 3615565.134288944],
    ['fired heater 5 MW SS 0 barg', { type: 'fired_heater', size: 5000, material: 'SS' }, 3632723.565650651],
    ['vessel 106 m3 D 3 m 20 barg', { type: 'vessel_vertical', size: 106, diameterM: 3, pBarg: 20 }, 1978844.45928354],
    ['vessel 10 m3 D 1.5 m 5 barg', { type: 'vessel_vertical', size: 10, diameterM: 1.5, pBarg: 5 }, 106703.42364023378],
    ['flash drum 5 m3 D 1.2 m SS 0 barg', { type: 'flash_drum', size: 5, diameterM: 1.2, material: 'SS', pBarg: 0 }, 115798.87111715862],
    ['converter 10 m3 D 2 m, 200 bar class', { type: 'converter', size: 10, diameterM: 2, pBarg: 200 }, 1880722.300616377],
    ['pump 10 kW CS 50 barg', { type: 'pump', size: 10, pBarg: 50 }, 47101.897969838166],
    ['pump 50 kW SS 5 barg (Fp = 1)', { type: 'pump', size: 50, material: 'SS', pBarg: 5 }, 84314.40914660999],
    ['boiler 5 MW', { type: 'steam_boiler', size: 5000 }, 2778190.2742367503],
    ['whb alias 5 MW', { type: 'whb', size: 5000 }, 2778190.2742367503],
    ['air cooler 200 m2 10 barg', { type: 'air_cooler', size: 200, pBarg: 10 }, 298563.93395416875],
    ['sieve trays 2 m2', { type: 'trays_sieve', size: 2 }, 2940.0997175646967],
    ['electric drive 1 MW', { type: 'motor', size: 1000 }, 283758.7206176308],
    ['cooling tower 1000 L/s (Towler, USD-2010 escalated)', { type: 'cooling_tower', size: 1000 }, 1335310.3496129285],
    ['package boiler 20 t/h steam (Towler)', { type: 'package_boiler', size: 20000 }, 469352.9411764706],
  ];
  for (const [name, spec, expected] of cases) it(name, () => near(val(spec).cbm, expected, 1e-9));

  it('absorber = shell vessel (packed volume / 0.6, wall-thickness Fp) + packing at F_BM 3.2', () => {
    const v = val({ type: 'absorber', size: 10, diameterM: 2, pBarg: 0 });
    // packing: 3.2 * Cp0 packing(10 m3) * 797.9/397 = 17278.5756 ; shell: vessel(16.667 m3, D 2 m, Fp = max(1, .)) CS
    near(v.parts!.packing, 17278.575564112427, 1e-9);
    expect(v.parts!.shell).toBeGreaterThan(0);
    near(v.cbm, v.parts!.packing + v.parts!.shell, 1e-12);
  });
  it('packed-bed converter is sized by catalyst volume (bed fill 0.6) and rated to the pressure class', () => {
    const v = val({ type: 'packed_bed_converter', size: 6, diameterM: 2, pBarg: 190 });
    const direct = val({ type: 'vessel_vertical', size: 10, diameterM: 2, pBarg: 200 });
    near(v.cbm, direct.cbm, 1e-12);
  });
});

describe('size limits', () => {
  it('above the range: several identical units (compressor 6000 kW = 2 x 3000 kW)', () => {
    const r = capexItem({ type: 'compressor', size: 6000 });
    if (!r.ok) throw new Error(r.code);
    expect(r.value.units).toBe(2); near(r.value.cbm, 6513977.378913061);
    expect(r.diag.map((d) => d.code)).toContain('SIZE_SPLIT');
    expect(r.diag.find((d) => d.code === 'SIZE_SPLIT')!.data).toMatchObject({ units: 2 });
  });
  it('above the range: hx 2000 m2 = 2 x 1000 m2', () => near(val({ type: 'hx_floating_head', size: 2000, pBarg: 10 }).cbm, 1868951.419462107));
  it('below the range: clamp to the smallest unit with an info diag (fired heater 400 kW costs the 1000 kW heater)', () => {
    const r = capexItem({ type: 'fired_heater', size: 400 });
    if (!r.ok) throw new Error(r.code);
    near(r.value.cbm, 2021797.0649815479); expect(r.value.units).toBe(1);
    const d = r.diag.find((x) => x.code === 'SIZE_CLAMPED')!; expect(d.severity).toBe('info'); expect(d.data).toMatchObject({ size: 400, min: 1000 });
  });
  it('inside the range: no size diag', () => { expect(capexItem({ type: 'compressor', size: 1000 }).diag).toEqual([]); });
  it('pressure beyond a correlation range warns but still prices (extrapolated Fp)', () => {
    const r = capexItem({ type: 'hx_floating_head', size: 100, pBarg: 200 });
    if (!r.ok) throw new Error(r.code);
    expect(r.diag.map((d) => d.code)).toContain('PRESSURE_RANGE');
    expect(r.value.cbm).toBeGreaterThan(val({ type: 'hx_floating_head', size: 100, pBarg: 100 }).cbm);
  });
  it('a converter above the 300 bar class fails with a code; between classes it rounds up and says so', () => {
    const f = capexItem({ type: 'converter', size: 10, pBarg: 350 }); expect(f.ok).toBe(false); if (!f.ok) expect(f.code).toBe('PRESSURE_CLASS');
    const r = capexItem({ type: 'converter', size: 10, diameterM: 2, pBarg: 150 }); if (!r.ok) throw new Error(r.code);
    expect(r.diag.find((d) => d.code === 'RATING_CLASS')!.data).toMatchObject({ class: 200 });
  });
});

describe('monotonic and robust', () => {
  it('cost rises with size for every sizable type and with pressure for vessels', () => {
    for (const t of ['compressor', 'hx_floating_head', 'fired_heater', 'vessel_vertical', 'pump', 'steam_boiler', 'air_cooler']) {
      const lo = { compressor: 500, hx_floating_head: 20, fired_heater: 2000, vessel_vertical: 1, pump: 2, steam_boiler: 2000, air_cooler: 20 }[t]!;
      let prev = 0;
      for (const f of [1, 2, 4, 8]) { const c = val({ type: t, size: lo * f, pBarg: 5 }).cbm; expect(c, `${t} x${f}`).toBeGreaterThan(prev); prev = c; }
    }
    expect(val({ type: 'vessel_vertical', size: 10, diameterM: 2, pBarg: 50 }).cbm).toBeGreaterThan(val({ type: 'vessel_vertical', size: 10, diameterM: 2, pBarg: 10 }).cbm);
  });
  it('unknown type, non-positive or NaN size, unknown year fail with codes (never throw)', () => {
    const code = (s: CapexSpec) => { const r = capexItem(s); return r.ok ? 'ok' : r.code; };
    expect(code({ type: 'warp_core', size: 1 })).toBe('EQUIP_UNKNOWN');
    expect(code({ type: 'pump', size: 0 })).toBe('SIZE_BAD'); expect(code({ type: 'pump', size: -3 })).toBe('SIZE_BAD'); expect(code({ type: 'pump', size: NaN })).toBe('SIZE_BAD');
    expect(code({ type: 'pump', size: 10, year: 1850 })).toBe('CEPCI_YEAR');
  });
  it('a material the row lacks falls back (Ni heater -> SS) with an info diag', () => {
    const r = capexItem({ type: 'fired_heater', size: 5000, material: 'Ni' }); if (!r.ok) throw new Error(r.code);
    near(r.value.cbm, 3632723.565650651); expect(r.diag.map((d) => d.code)).toContain('MATERIAL_FALLBACK');
  });
  it('deterministic: same spec, bit-identical result', () => {
    const a = JSON.stringify(capexItem({ type: 'vessel_vertical', size: 33, pBarg: 12 })); expect(JSON.stringify(capexItem({ type: 'vessel_vertical', size: 33, pBarg: 12 }))).toBe(a);
  });
});

describe('escalation and annualisation', () => {
  it('capexCurrencyFactor scales cost and defaults to 1', () => { near(val({ type: 'compressor', size: 1000, capexCurrencyFactor: 83 }).cbm, 83 * 1517475.620379101); });
  it('escalate scales by the CEPCI ratio; 2001 -> 2023 is 797.9 / 397', () => {
    near(escalate(100, 2001, 2023), 100 * 797.9 / 397); near(escalate(escalate(100, 2001, 2023), 2023, 2001), 100, 1e-12);
    near(val({ type: 'compressor', size: 1000, year: 2001 }).cbm, 755029, 2e-3);
  });
  it('capital recovery factor at 10 %/yr over 15 years is 0.13147 (DESIGN §4.6)', () => { near(crf(0.10, 15), 0.13147377688737216, 1e-12); });
  it('annualised capex = C_BM (CRF + 4 % maintenance); default 0.17147', () => {
    near(annualisedCapex(1e6), 1e6 * (0.13147377688737216 + 0.04), 1e-12);
    near(annualisedCapex(1e6, { rate: 0.08, years: 20, maintenance: 0 }), 1e6 * crf(0.08, 20), 1e-12);
    expect(annualisedCapex(0)).toBe(0);
  });
  it('capexTotal sums items and merges diags; one failing item fails the total with the item index', () => {
    const t = capexTotal([{ type: 'compressor', size: 1000 }, { type: 'hx_floating_head', size: 100, pBarg: 10 }]);
    if (!t.ok) throw new Error(t.code);
    near(t.value.total, 1517475.620379101 + 169031.64462615133); expect(t.value.items.length).toBe(2);
    const bad = capexTotal([{ type: 'compressor', size: 1000 }, { type: 'nope', size: 1 }]); expect(bad.ok).toBe(false);
    if (!bad.ok) { expect(bad.code).toBe('EQUIP_UNKNOWN'); expect(bad.data).toMatchObject({ index: 1 }); }
  });
});
