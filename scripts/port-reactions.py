#!/usr/bin/env python3
"""Port the research reaction table into the game (BUILD-PLAN 1.3).

Run (from the repo root):  python3 -I scripts/port-reactions.py

Reads, never retypes:
  docs/research/thermo.py      RX dict (research reaction ids -> stoichiometry; imported by path)
  src/data/species.gen.ts      species phase / thermo flag / confidence (parsed by regex; written by port-thermo.py)
  docs/research/kinetics_cstr.py  dH of propylene oxide hydrolysis (-36000 Btu/lbmol, read from the docstring)
Writes:
  src/data/reactions.gen.ts    plain data, no logic

Rows that the research RX dict does not hold (C -> CO, CO -> CO2, propane combustion, H2O2 decomposition,
propylene oxide hydrolysis, N2 / N2O ammonia-oxidation side reactions) are defined below as stoichiometry only; their
atom balance is asserted here and again by src/sim/chem/stoich.test.ts. Every dH / K number comes from the species
data at run time; the two lab rows (no species thermo, molar mass only) carry a `dH298book` with its own provenance.
"""
import importlib.util
import json
import os
import re
import sys

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'docs', 'research')
sys.argv = ['thermo.py', os.path.join(RES, 'janaf')]
_spec = importlib.util.spec_from_file_location('thermo_research', os.path.join(RES, 'thermo.py'))
th = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(th)

IDMAP = {'H2Ol': 'H2O(l)', 'H2SO4l': 'H2SO4(l)', 'C2H5OHl': 'C2H5OH(l)'}
gid = lambda k: IDMAP.get(k, k)

# ------------------------------------------------------------------------------------------ species catalogue
txt = open(os.path.join(ROOT, 'src', 'data', 'species.gen.ts'), encoding='utf-8').read()
SP = {}
for m in re.finditer(r'^  "([^"]+)": \{\n(.*?)^  \},\n', txt, re.S | re.M):
    body = m.group(2)
    SP[m.group(1)] = dict(
        phase=re.search(r'\n    phase: "([^"]+)"', body).group(1),
        thermo=re.search(r'\n    hasThermo: (\w+)', body).group(1) == 'true',
        conf=re.search(r'\n    conf: "(\w+)"', body).group(1),
        elements=dict((k, float(v)) for k, v in re.findall(r'(\w+): ([\d.]+)', re.search(r'\n    elements: \{([^}]*)\}', body).group(1))),
    )
CONF_ORDER = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED']

# ------------------------------------------------------------------------------------------ reaction rows
def research(rid):
    return {gid(k): v for k, v in th.RX[rid][1].items()}

# id: (nu, reversible, tier, catalysts, used, research key or None)
ROWS = [
    ('R1',  research('R1'),  True,  'must',    ['fe_ammonia', 'ru_ammonia'], 'ch 1, 3-5, 7', 'R1'),
    ('R2',  research('R2h'), True,  'must',    ['v2o5', 'v2o5_cs'], 'ch 3, 4, 6', 'R2h'),
    ('R3',  research('R3'),  True,  'stretch', ['cu_zn_meoh'], 'L22', 'R3'),
    ('R4',  research('R4'),  True,  'stretch', ['cu_zn_meoh'], 'L22', 'R4'),
    ('R5',  research('R5'),  True,  'must',    ['fecr_hts', 'cuzn_lts'], 'L12, L22, L28', 'R5'),
    ('R6',  research('R6'),  True,  'stretch', ['ni_smr'], 'L28', 'R6'),
    ('R7',  research('R7'),  False, 'stretch', ['ptrh_gauze'], 'L26', 'R7'),
    ('R7b', {'NH3': -4, 'O2': -3, 'N2': 2, 'H2O': 6}, False, 'stretch', ['ptrh_gauze'], 'L26', None),
    ('R7c', {'NH3': -4, 'O2': -4, 'N2O': 2, 'H2O': 6}, False, 'stretch', ['ptrh_gauze'], 'L26', None),
    ('R8',  research('R8'),  True,  'stretch', [], 'L26', 'R8'),
    ('R9',  research('R9'),  True,  'must',    [], 'L14', 'R9'),
    ('R10', research('R10'), False, 'must',    [], 'L02, L05-L06', 'R10'),
    ('R11', research('R11'), False, 'must',    [], 'absorber', 'R11'),
    ('R12', research('R12'), False, 'stretch', [], 'L23', 'R12'),
    ('R13', research('R13'), False, 'must',    [], 'furnaces, L07-L08', 'R13'),
    ('R14', {'C': -1, 'O2': -0.5, 'CO': 1}, False, 'must', [], 'L09 (Hess)', None),
    ('R15', {'CO': -1, 'O2': -0.5, 'CO2': 1}, False, 'must', [], 'L09 (Hess)', None),
    ('R16', {'C3H8': -1, 'O2': -5, 'CO2': 3, 'H2O': 4}, False, 'must', [], 'furnaces, L08', None),
    ('R17', {'H2O2(aq)': -1, 'H2O(l)': 1, 'O2': 0.5}, False, 'must', ['iodide', 'catalase'], 'L18', None),
    ('R18', {'C3H6O': -1, 'H2O(l)': -1, 'C3H8O2': 1}, False, 'must', [], 'L24', None),
    # Partial oxidation (rich burns make CO, DESIGN 2.6 L03): step 1 of the sequential burner, then R15 burns the CO with the O2 left.
    ('R19', {'CH4': -1, 'O2': -1.5, 'CO': 1, 'H2O': 2}, False, 'must', [], 'L03 rich burn', None),
    ('R20', {'C3H8': -1, 'O2': -3.5, 'CO': 3, 'H2O': 4}, False, 'must', [], 'L03 rich burn', None),
]

# Lab reactions whose species carry molar mass only: dH298 (kJ/mol) with its own provenance.
kin = open(os.path.join(RES, 'kinetics_cstr.py'), encoding='utf-8').read()
BTU_LBMOL_TO_KJ_MOL = 2.326          # 1 Btu/lbmol = 2.326 kJ/kmol (the factor docs/research/kinetics_cstr_si.py uses)
po_btu = float(re.search(r'dH = (-[\d,]+) Btu/lbmol \(528 R\)', kin).group(1).replace(',', ''))
BOOK = {
    'R18': dict(dH298book=round(po_btu * BTU_LBMOL_TO_KJ_MOL / 1000.0, 3), conf='F2',
                src='Fogler Ex.12-3 dH = -36000 Btu/lbmol via docs/research/kinetics_cstr.py (the x3 multiplicity variant is a level parameter, not this row)'),
    # No source in docs/research: textbook value recalled (about -98 kJ/mol for H2O2(l) -> H2O(l) + 1/2 O2), flagged.
    'R17': dict(dH298book=-98.0, conf='UNVERIFIED', src='recalled textbook value, not fetched; needed only for the L18 lab-rig heat'),
}

def sym(nu):
    reac = ' + '.join(('%g ' % -v if -v != 1 else '') + k for k, v in nu.items() if v < 0)
    prod = ' + '.join(('%g ' % v if v != 1 else '') + k for k, v in nu.items() if v > 0)
    return reac, prod

def balanced(nu):
    tot = {}
    for k, v in nu.items():
        for e, c in SP[k]['elements'].items():
            tot[e] = tot.get(e, 0.0) + v * c
    return all(abs(x) < 1e-12 for x in tot.values())

out = []
for rid, nu, rev, tier, cats, used, rkey in ROWS:
    assert all(k in SP for k in nu), (rid, [k for k in nu if k not in SP])
    assert balanced(nu), rid
    thermo = all(SP[k]['thermo'] for k in nu)
    confs = [SP[k]['conf'] for k in nu if SP[k]['thermo']]
    conf = max(confs, key=CONF_ORDER.index) if thermo else BOOK[rid]['conf']
    if rid in BOOK:
        src = BOOK[rid]['src']
    elif rid in ('R19', 'R20'):
        src = ('partial oxidation to CO + H2O(g), textbook burner step 1 (Felder & Rousseau ch 4 incomplete combustion); dH298 from the species '
               'polynomials = -519.3 (CH4) / -1194.2 (C3H8) kJ/mol, checked against NIST webbook heats of formation in src/sim/chem/partial_ox.test.ts')
    else:
        src = ('docs/research/thermo.py RX[%s] (DESIGN 4.2); K(T) rigorous from the species polynomials, checked against NIST-JANAF log Kf'
               % rkey) if rkey else 'stoichiometry only; dH, dS, K(T) computed from the species data (DESIGN 4.2 extra rows)'
    reac, prod = sym(nu)
    row = dict(
        id=rid, eq='%s %s %s' % (reac, '<=>' if rev else '->', prod), nu=nu,
        phase={k: SP[k]['phase'] for k in nu}, tier=tier, reversible=rev,
        dnGas=sum(v for k, v in nu.items() if SP[k]['phase'] == 'g'), catalysts=cats, thermo=thermo,
        src=src, conf=conf, used=used)
    if rid in BOOK:
        row['dH298book'] = BOOK[rid]['dH298book']
    out.append(row)

SETS = {
    'haber': ['R1'], 'contact': ['R2'], 'shift': ['R5'], 'smr': ['R6', 'R5'], 'methanol': ['R4', 'R5'],
    'ostwald': ['R7', 'R7b', 'R7c'], 'noOx': ['R8', 'R9'], 'sulfurBurner': ['R10'], 'absorber': ['R11'],
    'ferment': ['R12'], 'furnace': ['R13'], 'coke': ['R14', 'R15'], 'propane': ['R16'], 'labRig': ['R17'], 'cstr': ['R18'],
}
ids = {r['id'] for r in out}
assert all(x in ids for v in SETS.values() for x in v)

def ts(v):
    return json.dumps(v, ensure_ascii=False)

lines = ['// GENERATED by scripts/port-reactions.py (python3 -I scripts/port-reactions.py). DO NOT EDIT BY HAND.',
         '// Sources: docs/research/thermo.py RX, src/data/species.gen.ts (phases, flags), docs/research/kinetics_cstr.py (R18 dH).',
         '// nu: products +, reactants -. dnGas = sum of nu over gas species. dH298book (kJ/mol) only where the species carry no thermo.',
         '', 'export const REACTIONS_GEN = [']
for r in out:
    lines.append('  {')
    for k, v in r.items():
        lines.append('    %s: %s,' % (k, ts(v)))
    lines.append('  },')
lines.append('] as const;')
lines.append('')
lines.append('/** Reaction sets of the must-ship reactors (independent by rank; checked by src/sim/chem/stoich.test.ts). */')
lines.append('export const REACTOR_SETS_GEN = %s as const;' % ts(SETS))
lines.append('')
open(os.path.join(ROOT, 'src', 'data', 'reactions.gen.ts'), 'w', encoding='utf-8').write('\n'.join(lines))
print('wrote', len(out), 'reactions,', len(SETS), 'reactor sets')
