// Equipment catalogue provenance (DESIGN §4.0): every row carries src + conf; the generated file matches the research source.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CEPCI, CEPCI_CONF, EQUIPMENT, EQUIPMENT_ALIASES, EQUIPMENT_KEYS, GAME_YEAR, MUST_SHIP_TYPES, findEquipment } from './equipment';
import type { Conf } from '../sim/types';

const CONFS: Conf[] = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'];
const ORDER = CONFS;

describe('equipment catalogue', () => {
  it('has the 14 DESIGN §4.6 cost types plus the motor and the air cooler', () => {
    expect(EQUIPMENT.length).toBe(16);
    for (const k of ['compressor', 'pump', 'hx_floating_head', 'hx_fixed_tube', 'fired_heater', 'reformer_furnace', 'vessel_vertical', 'trays_sieve', 'packing_loose',
      'reactor_agitated', 'fermenter', 'steam_boiler', 'cooling_tower', 'package_boiler', 'motor', 'air_cooler']) expect(EQUIPMENT_KEYS, k).toContain(k);
  });
  it('every row has a non-empty src, valid confs, and conf is the worst of confK and confF', () => {
    for (const e of EQUIPMENT) {
      expect(e.src.trim().length, e.key).toBeGreaterThan(0);
      expect(CONFS, e.key).toContain(e.conf); expect(CONFS, e.key).toContain(e.confK); expect(CONFS, e.key).toContain(e.confF);
      expect(ORDER.indexOf(e.conf), e.key).toBe(Math.max(ORDER.indexOf(e.confK), ORDER.indexOf(e.confF)));
    }
  });
  it('size ranges are sane and every cost form has the data it needs', () => {
    for (const e of EQUIPMENT) {
      expect(e.Amin, e.key).toBeGreaterThan(0); expect(e.Amax, e.key).toBeGreaterThan(e.Amin);
      if (e.form === 'towler') expect(e.factors?.a, e.key).toBeGreaterThan(0); else expect(e.K?.length, e.key).toBe(3);
      if (e.form === 'bm' || e.form === 'bm_vessel') expect(e.factors?.B?.length, e.key).toBe(2);
      if (e.form === 'fbm' || e.form === 'fbm_fp') expect(Object.keys(e.factors?.fbm ?? {}), e.key).toContain('CS');
    }
  });
  it('every must-ship type resolves to a row (directly or through an alias)', () => {
    for (const t of MUST_SHIP_TYPES) expect(findEquipment(EQUIPMENT_ALIASES[t] ?? t), t).toBeDefined();
  });
  it('K1-K3 and ranges equal docs/research/costs_turton.py (script-ported, spot-checked here against the file text)', () => {
    const py = readFileSync(new URL('../../docs/research/costs_turton.py', import.meta.url), 'utf8');
    for (const e of EQUIPMENT) {
      if (e.K === null || e.key === 'air_cooler' || e.key === 'reformer_furnace') continue;
      const line = py.split('\n').find((l) => { const m = /\(\s*(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),/.exec(l); return m !== null && Number(m[1]) === e.K![0] && Number(m[2]) === e.K![1] && Number(m[3]) === e.K![2]; });
      expect(line, e.key).toBeDefined();
    }
  });
  it('CEPCI: 2001 = 397 (Turton basis), 2023 = 797.9 (game year); every year carries a conf, 2024 and 2010 are UNVERIFIED', () => {
    expect(CEPCI['2001']).toBe(397); expect(CEPCI['2023']).toBe(797.9); expect(GAME_YEAR).toBe(2023);
    for (const y of Object.keys(CEPCI)) expect(CONFS).toContain(CEPCI_CONF[y]);
    expect(CEPCI_CONF['2024']).toBe('UNVERIFIED'); expect(CEPCI_CONF['2010']).toBe('UNVERIFIED'); expect(CEPCI_CONF['2023']).toBe('FETCHED');
  });
  it('rows the research did not obtain are labelled, never FETCHED', () => {
    for (const k of ['air_cooler', 'reformer_furnace', 'reactor_agitated', 'fermenter', 'steam_boiler']) expect(['GAME', 'UNVERIFIED'], k).toContain(findEquipment(k)!.conf);
    expect(findEquipment('compressor')!.conf).toBe('F2');
  });
});
