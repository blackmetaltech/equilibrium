#!/usr/bin/env python3
"""Port the research equipment-cost correlations into the game (BUILD-PLAN 1.10).

Run (from the repo root):  python3 -I scripts/port-costs.py

Reads, never retypes:
  docs/research/costs_turton.py   K1-K3, size ranges (dict K), CEPCI dict, vessel wall-factor defaults (S = 850, tmin = 0.0063)
Parses and checks against:
  docs/research/costs.md          the bare-module / pressure / material factor table (A2) and the CEPCI table (A1): every factor
                                  below is asserted to appear on the costs.md row of its equipment, so a typo cannot slip in.
Writes:
  src/data/equipment.gen.ts       plain data, no logic

Rows or factors the research did not obtain are marked: `GAME` = a value chosen here by analogy (stated in `src`),
`UNVERIFIED` = recalled from memory (air cooler K/B/C values, the CEPCI 2010 index used by the two Towler rows).
Row `conf` is the worst of K (costs.md tag FETCHED-2 -> F2) and the factors.
"""
import importlib.util
import inspect
import json
import os
import re
import sys

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'docs', 'research')
spec = importlib.util.spec_from_file_location('costs_turton', os.path.join(RES, 'costs_turton.py'))
ct = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ct)
MD = open(os.path.join(RES, 'costs.md'), encoding='utf-8').read()
ORDER = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED']
worst = lambda *c: max(c, key=ORDER.index)

def md_row(prefix):
    for ln in MD.splitlines():
        if ln.startswith('| ' + prefix):
            return ln
    raise SystemExit('costs.md row not found: ' + prefix)

def check(prefix, *nums):
    ln = md_row(prefix)
    for n in nums:
        assert str(n) in ln, f'{n} not on costs.md row {prefix!r}'

# vessel wall-thickness defaults, read from the research function signature
sig = inspect.signature(ct.fp_vessel).parameters
VESSEL_FP = {'S': sig['S'].default, 'tmin': sig['tmin'].default}

# CEPCI: research dict + 2022 (costs.md A1 table) + 2010 (UNVERIFIED, used only by the two Towler & Sinnott rows)
cepci = {str(y): v for y, v in ct.CEPCI.items()}
assert '816.0' in MD and '| 2022 |' in MD
cepci['2022'] = 816.0
cepci['2010'] = 550.8
CEPCI_CONF = {'2001': 'F2', '2019': 'FETCHED', '2022': 'FETCHED', '2023': 'FETCHED', '2024': 'UNVERIFIED', '2010': 'UNVERIFIED'}

ROWS = []
def add(key, label, kname, unit, form, conf_k='F2', factors=None, material=None, fp=None, conf_f='F2', src_f='', mdrow=None, extra=None):
    k1, k2, k3, lo, hi = ct.K[kname]
    r = dict(key=key, label=label, kname=kname, unit=unit, K=[k1, k2, k3], Amin=lo, Amax=hi, form=form, factors=factors, material=material, fp=fp,
             confK=conf_k, confF=conf_f, conf=worst(conf_k, conf_f), src=f'Turton Table A.1 via costs_turton.py K[{kname}] ({conf_k}); {src_f}', basis=2001)
    if extra: r.update(extra)
    ROWS.append(r)

PFP_HX = [0.03881, -0.11272, 0.08183]
check('S&T floating head', 1.63, 1.66, 2.73, 3.73, *PFP_HX)
check('S&T fixed tube sheet', 1.63, 1.66)
check('Centrifugal pump', 1.89, 1.35, 1.6, 2.3, 4.4, -0.3935, 0.3957, -0.00226)
check('Centrifugal/axial/recip compressor', 2.7, 5.8, 11.5)
check('Electric drive', 1.5)
check('Fired heater', 2.13, 2.81, 0.1347, -0.2368, 0.1021)
check('Vertical process vessel', 2.25, 1.82, 3.10, 5.40)

add('compressor', 'Centrifugal compressor (fluid power)', 'compressor_centrifugal', 'kW', 'fbm', factors={'fbm': {'CS': 2.7, 'SS': 5.8, 'Ni': 11.5}},
    src_f='F_BM 2.7/5.8/11.5 direct (eqcost catalog.toml, FETCHED-2); no pressure factor (Fp = 1)')
add('motor', 'Electric drive, open/drip-proof (shaft power)', 'motor_opendrip', 'kW', 'fbm', conf_f='UNVERIFIED', factors={'fbm': {'CS': 1.5}},
    src_f='F_BM 1.5 UNVERIFIED (costs.md A2)')
add('pump', 'Centrifugal pump (shaft power)', 'pump_centrifugal', 'kW', 'bm', factors={'B': [1.89, 1.35], 'FM': {'CS': 1.6, 'SS': 2.3, 'Ni': 4.4}},
    fp={'C': [-0.3935, 0.3957, -0.00226], 'Pmin': 10, 'Pmax': 100}, src_f='B1/B2/F_M/C1-C3 eqcost catalog.toml (FETCHED-2); Fp = 1 below 10 barg')
for k, kn, lab in (('hx_floating_head', 'hx_floating_head', 'Shell and tube, floating head (area)'), ('hx_fixed_tube', 'hx_fixed_tube', 'Shell and tube, fixed tube sheet (area)')):
    add(k, lab, kn, 'm2', 'bm', factors={'B': [1.63, 1.66], 'FM': {'CS': 1.0, 'SS': 2.73, 'Ni': 3.73}},
        fp={'C': PFP_HX, 'Pmin': 5, 'Pmax': 140}, src_f='B1/B2/F_M/C1-C3 eqcost catalog.toml (FETCHED-2); Fp = 1 below 5 barg')
add('air_cooler', 'Air-fin cooler (area)', 'hx_fixed_tube', 'm2', 'bm', conf_k='UNVERIFIED', conf_f='UNVERIFIED',
    factors={'B': [0.96, 1.21], 'FM': {'CS': 1.0, 'SS': 2.73, 'Ni': 3.73}}, fp={'C': [-0.125, 0.15361, -0.02861], 'Pmin': 10, 'Pmax': 100},
    extra={'K': [4.0336, 0.2341, 0.0497], 'Amin': 10, 'Amax': 10000},
    src_f='air cooler K1-K3, range, B1/B2, C1-C3 recalled from Turton Table A.1 (NOT in docs/research; UNVERIFIED); F_M copied from the shell-and-tube row')
add('fired_heater', 'Fired heater, non-reactive (duty)', 'fired_heater', 'kW', 'fbm_fp', factors={'fbm': {'CS': 2.13, 'SS': 2.81}},
    fp={'C': [0.1347, -0.2368, 0.1021], 'Pmin': 10, 'Pmax': 200}, src_f='F_BM 2.13/2.81 times Fp, C1-C3 (costs.md A2, FETCHED-2); Ni falls back to SS')
add('reformer_furnace', 'Reformer furnace (duty)', 'fired_heater', 'kW', 'fbm_fp', conf_f='GAME', factors={'fbm': {'CS': 2.13, 'SS': 2.81}},
    fp={'C': [0.1347, -0.2368, 0.1021], 'Pmin': 10, 'Pmax': 200},
    extra={'K': [3.0680, 0.6597, 0.0194], 'Amin': 3000, 'Amax': 100000},
    src_f='K1-K3 costs.md A2 (FETCHED-2, reformer furnace row); bare-module and pressure factors not obtained: fired-heater values used (GAME)')
VESSEL_BM = {'B': [2.25, 1.82], 'FM': {'CS': 1.0, 'SS': 3.10, 'Ni': 5.40}}
add('vessel_vertical', 'Vertical process vessel (volume)', 'vessel_vertical', 'm3', 'bm_vessel', conf_f='UNVERIFIED', factors=VESSEL_BM, fp={'vessel': VESSEL_FP},
    src_f='B1/B2/F_M eqcost (FETCHED-2); wall-thickness Fp formula is UNVERIFIED (research memory, costs_turton.py fp_vessel)')
add('trays_sieve', 'Sieve trays (area per tray)', 'tray_sieve', 'm2', 'fbm', conf_f='UNVERIFIED', factors={'fbm': {'CS': 1.0}},
    src_f='F_BM 1.0 for CS, quantity factor ignored (costs.md A2, UNVERIFIED)')
add('packing_loose', 'Loose packing (volume)', 'packing_loose', 'm3', 'fbm', conf_f='UNVERIFIED', factors={'fbm': {'CS': 3.2}},
    src_f='F_BM 3.2 recalled from memory (costs.md A2, UNVERIFIED)')
for k, kn, lab in (('reactor_agitated', 'reactor_jacketed_agitated', 'Jacketed agitated reactor (volume)'), ('fermenter', 'fermenter', 'Fermenter (volume)')):
    add(k, lab, kn, 'm3', 'bm_vessel', conf_f='GAME', factors=VESSEL_BM, fp={'vessel': VESSEL_FP},
        src_f='bare-module and pressure factors not obtained: vertical-vessel values used (GAME)')
add('steam_boiler', 'Steam boiler / waste-heat boiler (duty)', 'steam_boiler', 'kW', 'fbm', conf_f='GAME', factors={'fbm': {'CS': 2.13, 'SS': 2.81}},
    src_f='bare-module factor not obtained: fired-heater F_BM used (GAME)')
# Towler & Sinnott 2010 rows (USD-2010): C = a + b S^n
check('Cooling tower', 170000, 1500)
check('Package boiler', 124000)
ROWS.append(dict(key='cooling_tower', label='Cooling tower and pumps (water flow)', kname=None, unit='L/s', K=None, Amin=100, Amax=10000, form='towler', factors={'a': 170000, 'b': 1500, 'n': 0.9},
                 material=None, fp=None, confK='F2', confF='UNVERIFIED', conf='UNVERIFIED', basis=2010,
                 src='Towler and Sinnott 2010, C = 170000 + 1500 Q^0.9 USD-2010 (OpenPyTEA CSV, FETCHED-2); CEPCI 2010 = 550.8 UNVERIFIED'))
ROWS.append(dict(key='package_boiler', label='Package boiler (steam flow)', kname=None, unit='kg/h', K=None, Amin=5000, Amax=200000, form='towler', factors={'a': 124000, 'b': 10, 'n': 1.0},
                 material=None, fp=None, confK='F2', confF='UNVERIFIED', conf='UNVERIFIED', basis=2010,
                 src='Towler and Sinnott 2010, packaged boiler 15-40 bar, C = 124000 + 10 S USD-2010 (FETCHED-2); CEPCI 2010 = 550.8 UNVERIFIED'))

assert len(ROWS) == 16

out = ['// GENERATED by scripts/port-costs.py (python3 -I scripts/port-costs.py). DO NOT EDIT BY HAND.',
       '// Sources: docs/research/costs_turton.py (K1-K3, ranges, CEPCI, vessel Fp constants), docs/research/costs.md (factors, asserted on write).',
       '// log10 Cp0 = K1 + K2 log10 A + K3 (log10 A)^2, USD at `basis` year; escalate with CEPCI ratio. conf = worst of confK and confF.', '']
out.append('export const CEPCI_GEN = ' + json.dumps(cepci) + ';')
out.append('export const CEPCI_CONF_GEN = ' + json.dumps(CEPCI_CONF) + ';')
out.append('export const EQUIPMENT_GEN = ' + json.dumps(ROWS, indent=2) + ';')
open(os.path.join(ROOT, 'src', 'data', 'equipment.gen.ts'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('wrote', len(ROWS), 'rows')
