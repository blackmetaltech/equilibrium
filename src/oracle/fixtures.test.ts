// Structural checks on the exported oracle table and dual-implementation fixtures (DESIGN 9.2, 9.2.1b, 9.2.3).
// No engine is involved: these tests guard the data files written by scripts/export-fixtures.py. The engine-facing
// assertions (oracles.test.ts, dual.test.ts) are written by the lanes that own the functions.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Json = number | string | boolean | null | Json[] | { [k: string]: Json };
interface Oracle {
  id: string;
  source: string;
  status: 'R' | 'C' | 'V';
  topic: string;
  statement: string;
  inputs: Record<string, Json>;
  expected: Record<string, Json>;
  unit: string;
  tol: { rel?: number; abs?: number };
  fn: string;
  lane: string;
  book?: Record<string, Json>;
  assertGroups?: string[][];
}
const dir = fileURLToPath(new URL('.', import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(dir + p, 'utf8')) as Record<string, any>;
const file = readJson('oracles.json');
const oracles = file.oracles as Oracle[];
const byId = new Map(oracles.map((o) => [o.id, o]));
const get = (id: string) => {
  const o = byId.get(id);
  if (!o) throw new Error('missing oracle ' + id);
  return o;
};

const leaves = (x: Json, out: Json[] = []): Json[] => {
  if (Array.isArray(x)) x.forEach((v) => leaves(v, out));
  else if (x !== null && typeof x === 'object') Object.values(x).forEach((v) => leaves(v, out));
  else out.push(x);
  return out;
};

const LANES = [
  'chem/basics', 'chem/stoich', 'thermo', 'chem/equilibrium', 'chem/kinetics',
  'units/reactors', 'units/flash', 'units/energy', 'flowsheet',
];

describe('oracles.json (DESIGN 9.2)', () => {
  it('has generator/source headers', () => {
    expect(file.generator).toBe('scripts/export-fixtures.py');
    expect(String(file.source)).toContain('docs/research/oracles_ncert.py');
    expect(String(file.source)).toContain('docs/research/oracles_cheme.py');
  });

  it('holds exactly 78 oracles, 43 NC and 35 CE, with unique sequential ids', () => {
    expect(oracles.length).toBe(78);
    expect(file.count).toBe(78);
    expect(new Set(oracles.map((o) => o.id)).size).toBe(78);
    const nc = oracles.filter((o) => o.id.startsWith('EQ-NC-'));
    const ce = oracles.filter((o) => o.id.startsWith('EQ-CE-'));
    expect(nc.length).toBe(43);
    expect(ce.length).toBe(35);
    nc.forEach((o, i) => expect(o.id).toBe('EQ-NC-' + String(i + 1).padStart(3, '0')));
    ce.forEach((o, i) => expect(o.id).toBe('EQ-CE-' + String(i + 1).padStart(3, '0')));
  });

  it('every oracle has all fields, a finite tolerance and finite expected values', () => {
    for (const o of oracles) {
      expect(['R', 'C', 'V'], o.id).toContain(o.status);
      for (const k of ['source', 'topic', 'statement', 'unit', 'fn', 'lane'] as const) {
        expect(typeof o[k] === 'string' && o[k].length > 0, `${o.id}.${k}`).toBe(true);
      }
      expect(LANES, o.id + ' lane').toContain(o.lane);
      expect(typeof o.inputs === 'object' && Object.keys(o.inputs).length > 0, o.id + ' inputs').toBe(true);
      const hasRel = typeof o.tol.rel === 'number';
      const hasAbs = typeof o.tol.abs === 'number';
      expect(hasRel || hasAbs, o.id + ' tol').toBe(true);
      for (const t of [o.tol.rel, o.tol.abs]) if (t !== undefined) expect(Number.isFinite(t) && t >= 0, o.id + ' tol finite').toBe(true);
      const ls = leaves(o.expected as Json);
      expect(ls.length, o.id + ' expected leaves').toBeGreaterThan(0);
      for (const v of ls) {
        if (typeof v === 'number') expect(Number.isFinite(v), o.id + ' expected finite').toBe(true);
        else expect(['string', 'boolean'], o.id).toContain(typeof v);
      }
    }
  });

  it('coverage counts per topic match DESIGN 9.2', () => {
    const count = (prefix: string) => {
      const m = new Map<string, number>();
      for (const o of oracles.filter((x) => x.id.startsWith(prefix))) m.set(o.topic, (m.get(o.topic) ?? 0) + 1);
      return Object.fromEntries([...m].sort());
    };
    expect(count('EQ-NC-')).toEqual({
      'empirical-formula': 3, equilibrium: 8, 'gas-laws': 3, kinetics: 9, 'le-chatelier': 5,
      'mole-concept': 4, stoichiometry: 5, thermochemistry: 6,
    });
    expect(count('EQ-CE-')).toEqual({
      'adiabatic-equilibrium': 1, 'heat-of-reaction-at-T': 1, 'k-of-t-equilibrium': 6,
      'multiple-steady-states': 2, 'reactive-energy-balances': 4, 'reactive-material-balances': 4,
      'reactor-design': 8, 'recycle-purge': 3, runaway: 2, 'vle-flash': 4,
    });
  });

  it('status labels: six verified chapter-1 items, three relabelled textbook-style', () => {
    const v = oracles.filter((o) => o.status === 'V').map((o) => o.id);
    expect(v).toEqual(['EQ-NC-002', 'EQ-NC-003', 'EQ-NC-004', 'EQ-NC-005', 'EQ-NC-007', 'EQ-NC-010']);
    for (const id of ['EQ-NC-001', 'EQ-NC-006', 'EQ-NC-011']) {
      expect(get(id).source).toContain('textbook-style');
      expect(get(id).status).toBe('C');
    }
    expect(oracles.filter((o) => o.id.startsWith('EQ-CE-')).every((o) => o.status === 'R')).toBe(true);
  });

  it('lanes partition the 78 oracles; every lane is used', () => {
    const lane = new Map<string, string[]>();
    for (const o of oracles) lane.set(o.lane, [...(lane.get(o.lane) ?? []), o.id]);
    expect([...lane.keys()].sort()).toEqual([...LANES].sort());
    expect([...lane.values()].reduce((a, b) => a + b.length, 0)).toBe(78);
  });

  describe('DESIGN 9.2.1b statement corrections are carried', () => {
    it('NC-005: book 2428.57 g, engine 2431.8 g', () => {
      const o = get('EQ-NC-005');
      expect(o.book!.mass_NH3_g as number).toBeCloseTo(2428.57, 2);
      expect(o.expected.mass_NH3_g as number).toBeCloseTo(2431.84, 1);
      expect(o.expected.limiting).toBe('N2');
    });
    it('NC-018 absolute tolerance 0.02 kJ with R = 8.314', () => {
      expect(get('EQ-NC-018').tol).toEqual({ abs: 0.02 });
      expect(get('EQ-NC-018').inputs.R_J_mol_K).toBe(8.314);
    });
    it('NC-023 R = 0.0831; NC-024 R = 0.083 and Kp 85.87', () => {
      expect(get('EQ-NC-023').inputs.R_L_bar).toBe(0.0831);
      expect(get('EQ-NC-023').expected.Kc_L_mol as number).toBeCloseTo(7.479e11, -8);
      expect(get('EQ-NC-024').inputs.R_L_bar_mol_K).toBe(0.083);
      expect(get('EQ-NC-024').expected.Kp_bar as number).toBeCloseTo(85.87, 1);
    });
    it('NC-025 constant T; NC-028 3/2 O2 and bar^-1/2; NC-029 R = 8.314', () => {
      expect(get('EQ-NC-025').statement).toContain('constant T');
      expect(get('EQ-NC-028').statement).toContain('3/2 O2');
      expect(get('EQ-NC-028').statement).toContain('bar^-1/2');
      expect(get('EQ-NC-029').inputs.R_J_mol_K).toBe(8.314);
    });
    it('NC-026 is the corrected HI problem; NC-027 absolute tol; NC-033 ratio 0.0246 +-1 % and direction left', () => {
      expect(get('EQ-NC-026').expected.H2_mol_L as number).toBeCloseTo(0.06754, 4);
      expect(get('EQ-NC-027').tol).toEqual({ abs: 1e-6 });
      const o = get('EQ-NC-033');
      expect(o.tol).toEqual({ rel: 0.01 });
      expect(o.expected.direction).toBe('left');
      expect(o.expected.K_ratio_600_over_500 as number).toBeCloseTo(0.0246, 4);
    });
    it('NC-037 states k in s^-1', () => {
      expect(get('EQ-NC-037').statement).toContain('s^-1');
      expect(get('EQ-NC-037').expected.T_K as number).toBeCloseTo(668.97, 1);
    });
    it('CE-004 excess air basis; CE-011 air composition; CE-014 vapour water', () => {
      expect(get('EQ-CE-004').statement).toContain('complete combustion of all propane fed');
      expect(get('EQ-CE-011').statement).toContain('21 % O2 / 79 % N2 exactly');
      expect(get('EQ-CE-011').tol).toEqual({ abs: 1 });
      expect(get('EQ-CE-014').inputs.product_water_phase).toBe('vapour');
    });
    it('CE-008/009/010 carry full-precision Antoine constants', () => {
      for (const id of ['EQ-CE-008', 'EQ-CE-009']) {
        const ant = get(id).inputs.antoine as Record<string, number[]>;
        expect(ant.benzene).toEqual([6.89272, 1203.531, 219.888]);
        expect(ant.toluene).toEqual([6.95805, 1346.773, 219.693]);
      }
      expect(get('EQ-CE-010').inputs.antoine_water).toEqual([8.07131, 1730.63, 233.426]);
    });
    it('CE-017 Simpson over 0.4-0.8 only', () => {
      const o = get('EQ-CE-017');
      expect(o.inputs.simpson_span_X).toEqual([0.4, 0.8]);
      expect(o.expected.V_PFR_simpson_L as number).toBeCloseTo(55, 1);
    });
    it('CE-019 one R; CE-023 R and k(T) form; CE-025 bar^-2', () => {
      expect(get('EQ-CE-019').inputs.R_J_mol_K).toBe(8.314462618);
      expect(get('EQ-CE-023').inputs.R_J_mol_K).toBe(8.314462618);
      expect(get('EQ-CE-023').inputs.k_form).toContain('exp((E/R)*(1/T0 - 1/T))');
      expect(get('EQ-CE-025').inputs.K_unit).toBe('bar^-2');
    });
    it('CE-026 two separate row groups', () => {
      expect(get('EQ-CE-026').assertGroups).toEqual([['K500', 'K700'], ['with_Cp_K500', 'with_Cp_K700']]);
    });
    it('CE-028 K(1100 K) = 1.0058 in the inputs and statement; CE-031 T = 1073.15', () => {
      const o = get('EQ-CE-028');
      expect(o.inputs.K as number).toBeCloseTo(1.0058, 4);
      expect(o.statement).toContain('1.0058');
      expect(JSON.stringify(get('EQ-CE-031').inputs.T)).toBe('[298.15,1073.15]');
      expect(get('EQ-CE-031').statement).toContain('1073.15');
    });
  });
});

describe('dual-implementation fixtures (DESIGN 9.2.3)', () => {
  const expectedFiles = [
    'dcda', 'haber_grid', 'haber_inerts', 'haber_loop', 'kinetics_k1', 'kinetics_k2', 'kinetics_k3', 'kinetics_k7',
    'kinetics_k8', 'n2o4', 'so2_beds', 'sulfur_burner', 'wgs_grid',
  ];
  const present = readdirSync(dir + 'fixtures').filter((f) => f.endsWith('.json'));

  it('all generated fixture files exist and carry generator/source/tolerance headers', () => {
    for (const n of expectedFiles) {
      expect(present, n).toContain(n + '.json');
      const f = readJson('fixtures/' + n + '.json');
      expect(f.generator, n).toBe('scripts/export-fixtures.py');
      expect(String(f.source), n).toContain('docs/research/');
      expect(typeof f.tolerance, n).toBe('object');
      expect(typeof f.notes, n).toBe('string');
    }
  });

  it('every fixture file parses (janaf.json belongs to the thermo lane)', () => {
    for (const f of present) expect(() => readJson('fixtures/' + f), f).not.toThrow();
  });

  it('no non-finite numbers anywhere in the generated fixtures', () => {
    for (const n of expectedFiles) {
      for (const v of leaves(readJson('fixtures/' + n + '.json') as Json)) {
        if (typeof v === 'number') expect(Number.isFinite(v), n).toBe(true);
      }
    }
  });

  it('haber_grid: 6 T x 6 P, 450 C / 200 bar = 25.34 %', () => {
    const f = readJson('fixtures/haber_grid.json');
    expect(f.cases.length).toBe(36);
    const c = f.cases.find((x: any) => x.T_C === 450 && x.P_bar === 200);
    expect(c.y_NH3).toBeCloseTo(0.2534, 4);
  });

  it('haber_inerts: ratios 2-4, inerts 0-15 %, 5 % inert = 19.13 %', () => {
    const f = readJson('fixtures/haber_inerts.json');
    expect(f.ratio_cases.length).toBe(5);
    expect(f.inert_cases.length).toBe(5);
    expect(f.inert_cases.find((x: any) => x.inert_frac_of_feed === 0.05).y_NH3).toBeCloseTo(0.1913, 4);
  });

  it('sulfur_burner: y_SO2 6-18 %, 10 % -> 931.4 C and 4.93 MW', () => {
    const f = readJson('fixtures/sulfur_burner.json');
    expect(f.cases.length).toBe(8);
    const c = f.cases.find((x: any) => x.y_SO2 === 0.1);
    expect(c.T_ad_C).toBeCloseTo(931.4, 1);
    expect(c.boiler_duty_MW).toBeCloseTo(4.93, 2);
  });

  it('so2_beds and dcda: 420 C -> 620.8 C / 0.6908, three 4-bed staircases, DCDA 99.983 %', () => {
    const f = readJson('fixtures/so2_beds.json');
    expect(f.bed1_sweep.length).toBe(9);
    const b = f.bed1_sweep.find((x: any) => x.Tin_C === 420);
    expect(b.Tout_C).toBeCloseTo(620.8, 1);
    expect(b.X).toBeCloseTo(0.6908, 4);
    expect(f.staircases.map((s: any) => s.Tin_C)).toEqual([410, 420, 430]);
    for (const s of f.staircases) expect(s.beds.length).toBe(4);
    expect(readJson('fixtures/dcda.json').conv_overall_pct).toBeCloseTo(99.983, 3);
  });

  it('wgs_grid: 6 T x 5 S/CO, 250 C and S/CO 1.5 -> CO 1.03 % dry', () => {
    const f = readJson('fixtures/wgs_grid.json');
    expect(f.cases.length).toBe(30);
    expect(f.cases.find((x: any) => x.T_C === 250 && x.S_per_CO === 1.5).CO_dry_pct).toBeCloseTo(1.03, 2);
  });

  it('haber_loop: 5 purge x 3 T_sep, purge 1 % / -20 C -> 489.1 kmol/h and y_Ar,in 8.76 %', () => {
    const f = readJson('fixtures/haber_loop.json');
    expect(f.cases.length).toBe(15);
    const c = f.cases.find((x: any) => x.purge_frac === 0.01 && x.T_sep_C === -20);
    expect(c.NH3_kmol_h).toBeCloseTo(489.1, 1);
    expect(c.y_Ar_in).toBeCloseTo(0.0876, 4);
    expect(String(f.notes)).toContain('Raoult');
  });

  it('n2o4: Kp(400 K) = 51.14 bar, alpha = 0.769, P = 8.83 bar', () => {
    const f = readJson('fixtures/n2o4.json');
    expect(f.Kp_400_bar).toBeCloseTo(51.14, 2);
    expect(f.alpha).toBeCloseTo(0.769, 3);
    expect(f.P_bar).toBeCloseTo(8.83, 2);
  });

  it('kinetics K1/K2: five-point profiles, eight-point light-off, both model variants present', () => {
    const k1 = readJson('fixtures/kinetics_k1.json');
    expect(k1.variant_research.profile.length).toBe(5);
    expect(k1.variant_engine_K.profile.length).toBe(5);
    expect(k1.variant_research.outlet.T_C).toBeCloseTo(537.8, 1);
    expect(k1.variant_research.outlet.dT_per_mol_pct_NH3).toBeCloseTo(15.8, 1);
    expect(k1.inputs.rho_b_kg_m3).toBe(2200);
    const k2 = readJson('fixtures/kinetics_k2.json');
    for (const v of ['variant_research', 'variant_engine_K']) {
      expect(k2[v].lightoff.length).toBe(8);
      expect(k2[v].bed1_profile.length).toBeGreaterThanOrEqual(5);
      expect(k2[v].bed1_outlet.T_C).toBeCloseTo(626.2, 1);
      expect(k2[v].bed1_outlet.X).toBeCloseTo(0.698, 3);
    }
  });

  it('kinetics K7: E = 75.36 exactly; steady states 27.6 / 63.1 / 117.0 C; ignition 47.4 C; -70 % UA drift', () => {
    const k = readJson('fixtures/kinetics_k7.json');
    expect(k.inputs.E_MJ_kmol).toBe(75.36);
    expect(k.steady_states.map((s: any) => s.T_C.toFixed(1))).toEqual(['27.6', '63.1', '117.0']);
    expect(k.steady_states.map((s: any) => s.stable)).toEqual([true, false, true]);
    expect(k.ignition_coolant_only_C).toBeCloseTo(47.4, 1);
    expect(k.ua_drop.t_plus_20K_s).toBeCloseTo(48.6, 0);
    expect(k.ua_drop.T_after_1h_C).toBeCloseTo(151.7, 0);
  });

  it('kinetics K8: 90 % glucose used at 22.5 h, 69 g/L ethanol; K3 profile present', () => {
    const k = readJson('fixtures/kinetics_k8.json');
    expect(k.t90_32C_h).toBeCloseTo(22.5, 1);
    expect(k.temperature_sweep.find((x: any) => x.T_C === 32).P_final_g_L).toBeCloseTo(69.0, 0);
    expect(readJson('fixtures/kinetics_k3.json').profile.length).toBe(5);
  });
});
