#!/usr/bin/env python3
"""Port the research species data into the game (BUILD-PLAN 1.1).

Run (from the repo root):  python3 -I scripts/port-thermo.py

Reads, never retypes:
  docs/research/thermo.py          Shomate / NASA / constant-Cp segments, metadata, JANAF parser (imported by path)
  docs/research/janaf/*.html       NIST-JANAF tables (the 17 oracle species)
  docs/research/vle_safety.md      Antoine refits and dHvap(Tb) (tables parsed by regex)
  scripts/janaf-extra/*.html       NIST-JANAF C-002 (graphite) and N-026 (N2O), fetched 2026-11-10 from
                                   https://janaf.nist.gov/tables/<id>.html (thermo.py has neither species)
Writes:
  src/data/species.gen.ts          plain data, no logic
  src/oracle/fixtures/janaf.json   JANAF rows (300/500/700/1000/1500 K) + log Kf + K(T) checks for the reaction lane
"""
import importlib.util
import json
import math
import os
import re
import sys

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'docs', 'research')
EXTRA = os.path.join(ROOT, 'scripts', 'janaf-extra')
sys.argv = ['thermo.py', os.path.join(RES, 'janaf')]          # thermo.py reads argv[1] as the JANAF dir
_spec = importlib.util.spec_from_file_location('thermo_research', os.path.join(RES, 'thermo.py'))
th = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(th)

T0 = th.T0
R = th.R
WATSON = 0.38
DESIGN_T = [300.0, 500.0, 700.0, 1000.0, 1500.0]

# ---------------------------------------------------------------------------------------------- id mapping
# research key -> game id
IDMAP = {'H2Ol': 'H2O(l)', 'H2SO4l': 'H2SO4(l)', 'HNO3l': 'HNO3(l)', 'CH3OHl': 'CH3OH(l)', 'C2H5OHl': 'C2H5OH(l)'}
gid = lambda k: IDMAP.get(k, k)

MUST = {'N2', 'H2', 'O2', 'Ar', 'CH4', 'NH3', 'NH3(l)', 'H2O', 'H2O(l)', 'CO', 'CO2', 'SO2', 'SO3', 'S', 'H2SO4(l)', 'NO2',
        'N2O4', 'C3H8', 'C', 'H2O2(aq)', 'C3H6O', 'C3H8O2'}

# DESIGN section 5.6 species colours (by gas/formula id; liquids/aliases reuse). Others are GAME picks (flagged).
COLOUR_56 = {'H2': '#E8F1FF', 'N2': '#5B7DB1', 'NH3': '#9D4EDD', 'O2': '#4CC9F0', 'Ar': '#6C757D', 'H2O': '#1D7FD8',
             'CH3OH': '#F15BB5', 'NO': '#C9ADA7', 'C6H12O6': '#C8B88A', 'SO2': '#E9C46A', 'SO3': '#F4A261',
             'H2SO4(l)': '#B5651D', 'CO': '#8D99AE', 'CO2': '#495057', 'CH4': '#2A9D8F', 'C2H5OH': '#FFD166',
             'NO2': '#8B4513', 'Cl2': '#B5E48C'}
COLOUR_ALIAS = {'NH3(l)': 'NH3', 'H2O(l)': 'H2O', 'CH3OH(l)': 'CH3OH', 'C2H5OH(l)': 'C2H5OH', 'broth': 'C6H12O6'}
COLOUR_GAME = {'C3H8': '#E76F51', 'C': '#212529', 'HCl': '#CAFFBF', 'N2O': '#A8DADC', 'HNO3': '#BC6C25', 'HNO3(l)': '#BC6C25',
               'NaCl': '#DEE2E6', 'NaOH': '#ADB5BD', 'C2H4': '#90BE6D', 'S': '#F9C74F', 'N2O4': '#6F2C0D',
               'H2O2(aq)': '#9AD1D4', 'C3H6O': '#F28482', 'C3H8O2': '#F5CAC3', 'biomass': '#84A98C'}

# display names: subscript the digits of the formula
def r3(x):
    return round(x, 3) + 0.0      # +0.0 turns -0.0 (element dHf) into 0.0

SUB = str.maketrans('0123456789', '₀₁₂₃₄₅₆₇₈₉')
def display(formula, phase_tag):
    return formula.translate(SUB) + phase_tag

# ---------------------------------------------------------------------------------------------- parse vle_safety.md
def parse_vle():
    txt = open(os.path.join(RES, 'vle_safety.md'), encoding='utf-8').read()
    ant = {}
    i = txt.index('DERIVED refits to CoolProp')
    for line in txt[i:i + 1500].splitlines():
        m = re.match(r'\|\s*(\w+)\s*\|\s*([\d.]+)-([\d.]+)\s*\|\s*([\d.\-]+)\s*\|\s*([\d.\-]+)\s*\|\s*([\d.\-]+)\s*\|', line)
        if m:
            k = m.group(1)
            ant[k] = dict(A=float(m.group(4)), B=float(m.group(5)), C=float(m.group(6)), Tlo=float(m.group(2)), Thi=float(m.group(3)))
    hv = {}
    i = txt.index('DeltaHvap at normal boiling point')
    for line in txt[i:i + 800].splitlines():
        m = re.match(r'\|\s*(\w+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|', line)
        if m:
            hv[m.group(1)] = dict(Tb=float(m.group(2)), dHvap=float(m.group(3)))
    return ant, hv

ANT, HVAP = parse_vle()

# ---------------------------------------------------------------------------------------------- JANAF fits (graphite, N2O)
import numpy as np

def janaf_extra(tid):
    th.JANAF_DIR = EXTRA
    try:
        return th.janaf(tid)
    finally:
        th.JANAF_DIR = os.path.join(RES, 'janaf')

def fit_shomate(jt, lo, hi, h_lo, s_lo, first):
    """Least-squares Shomate (A..E) to JANAF Cp, H-H(lo), S-S(lo) nodes on [lo,hi]; F,G fixed by continuity with the
    previous segment (or by dHf/S298 for the first). Weights: Cp 0.05, H 0.01 kJ/mol, S 0.01 J/mol/K."""
    Tl = T0 if first else lo
    t0 = Tl / 1000.0
    Ts = [T for T in sorted(jt) if Tl <= T <= hi + 1e-9]
    rows, y = [], []
    for T in Ts:
        t = T / 1000.0
        cp = [1, t, t * t, t ** 3, 1 / t ** 2]
        dh = [t - t0, (t * t - t0 * t0) / 2, (t ** 3 - t0 ** 3) / 3, (t ** 4 - t0 ** 4) / 4, -(1 / t - 1 / t0)]
        ds = [math.log(t / t0), t - t0, (t * t - t0 * t0) / 2, (t ** 3 - t0 ** 3) / 3, -(1 / (2 * t * t) - 1 / (2 * t0 * t0))]
        c = jt[T]
        rows.append([x / 0.05 for x in cp]); y.append(c['cp'] / 0.05)
        if T > Tl:
            rows.append([x / 0.01 for x in dh]); y.append((c['dH'] - jt[Tl]['dH']) / 0.01)
            rows.append([x / 0.01 for x in ds]); y.append((c['S'] - jt[Tl]['S']) / 0.01)
    A, B, C, D, E = np.linalg.lstsq(np.array(rows), np.array(y), rcond=None)[0]
    F = h_lo - (A * t0 + B * t0 ** 2 / 2 + C * t0 ** 3 / 3 + D * t0 ** 4 / 4 - E / t0)
    G = s_lo - (A * math.log(t0) + B * t0 + C * t0 ** 2 / 2 + D * t0 ** 3 / 3 - E / (2 * t0 ** 2))
    return [float(A), float(B), float(C), float(D), float(E), float(F), float(G), 0.0]

def fitted_segments(tid, breaks):
    jt = janaf_extra(tid)
    h, s = jt[T0]['dfH'], jt[T0]['S']
    segs = []
    for i, (lo, hi) in enumerate(breaks):
        c = fit_shomate(jt, lo, hi, h, s, i == 0)
        segs.append(('sh', lo, hi, c))
        _, h, s = th.shomate(c, hi)
    return segs

EXTRA_SEGS = {
    'C': fitted_segments('C-002', [(298.0, 600.0), (600.0, 1200.0), (1200.0, 3000.0)]),
    'N2O': fitted_segments('N-026', [(298.0, 1000.0), (1000.0, 3000.0)]),
}
# sanity: the fits must reproduce their own JANAF tables
for _k, _tid in (('C', 'C-002'), ('N2O', 'N-026')):
    _jt = janaf_extra(_tid)
    _segs = EXTRA_SEGS[_k]
    _dev = [0.0, 0.0, 0.0]
    for _T, _r in _jt.items():
        if 298.15 <= _T <= _segs[-1][2]:
            for _kd, _lo, _hi, _c in _segs:
                if _lo - 0.2 <= _T <= _hi:
                    cp, h, s = th.shomate(_c, _T)
                    _dev = [max(_dev[0], abs(h - _jt[T0]['dfH'] - _r['dH'])), max(_dev[1], abs(s - _r['S'])), max(_dev[2], abs(cp - _r['cp']))]
                    break
    assert _dev[0] < 0.005 and _dev[1] < 0.005 and _dev[2] < 0.02, (_k, _dev)
    EXTRA_SEGS[_k + '_dev'] = _dev

# ---------------------------------------------------------------------------------------------- species catalogue
# research key -> (conf, src, notes) for the THERMO block (dHf, S, Cp, M). Crit/Tb confidence is derived below.
NIST_SH = 'NIST WebBook Shomate (Chase 1998, NIST-JANAF), parsed by docs/research/thermo.py'
CONF = {
    'N2': ('FETCHED', NIST_SH, ''), 'H2': ('FETCHED', NIST_SH, ''), 'O2': ('FETCHED', NIST_SH, ''), 'Ar': ('FETCHED', NIST_SH, ''),
    'CH4': ('FETCHED', NIST_SH, ''), 'NH3': ('FETCHED', NIST_SH, ''), 'CO': ('FETCHED', NIST_SH, ''), 'CO2': ('FETCHED', NIST_SH, ''),
    'SO2': ('FETCHED', NIST_SH, ''), 'NO': ('FETCHED', NIST_SH, ''), 'Cl2': ('FETCHED', NIST_SH, ''), 'HCl': ('FETCHED', NIST_SH, ''),
    'C2H4': ('FETCHED', NIST_SH, ''), 'HNO3': ('FETCHED', NIST_SH, 'gas-phase HNO3 (JANAF H-030)'),
    'H2O': ('FETCHED', NIST_SH + '; NASA TM-4513 (Cantera nasa_gas.yaml) below 500 K', 'NIST Shomate starts at 500 K'),
    'H2Ol': ('FETCHED', NIST_SH + ' (liquid, 298-500 K)', 'physically liquid at 1 bar only to 373.15 K'),
    'SO3': ('FETCHED', NIST_SH, 'critical constants and Tb UNVERIFIED (memory), not used by any goal'),
    'NO2': ('FETCHED', NIST_SH, 'JANAF dHf 33.10; NASA gives 34.19 (K(2NO+O2<=>2NO2) differs x2.3 at 298 K); JANAF used'),
    'N2O4': ('FETCHED', NIST_SH + ' (500-6000 K); Shomate-form fit to NIST-JANAF N-032 below 500 K', 'NASA N2O4 inconsistent with JANAF, not used'),
    'S': ('FETCHED', NIST_SH + ' (rhombic, monoclinic, liquid)', 'vapour above 718 K not modelled; rhombic->monoclinic 368.3 K and fusion 388.36 K are real latent-heat steps'),
    'H2SO4l': ('SNIP', 'CRC/Atkins table value seen in a web-search snippet (dHf -813.99, S 156.90, Cp 138.9); verify against CRC before release', 'constant Cp'),
    'HNO3l': ('UNVERIFIED', 'CRC 100th ed dHf -174.1 and S 155.6 via search snippet; Cp 109.87 recalled', 'constant Cp; stretch species'),
    'CH3OH': ('FETCHED', 'NASA TM-4513 (Cantera nasa_gas.yaml); NIST dHf -205+-10 unusable', ''),
    'CH3OHl': ('FETCHED', 'NIST WebBook condensed phase (Chao & Rossini 1965, Carlson & Westrum 1971); Cp NIST compilation', 'constant Cp'),
    'C2H5OH': ('FETCHED', 'NASA TM-4513 (Cantera nasa_gas.yaml)', ''),
    'C2H5OHl': ('FETCHED', 'NIST WebBook (dHf from dcH, Chao & Rossini 1965; S Haida 1977; Cp Petrov 1989)', 'constant Cp'),
    'C6H12O6': ('F2', 'alpha-D-glucose, NIST C492626 (S, Cp: Boerio-Goates 1991); dHf -1273.3 is CRC-like inside the fetched NIST range -1271..-1276', 'constant Cp; thermo.md flags dHf UNVERIFIED, DESIGN table says FETCHED'),
    'NaCl': ('FETCHED', NIST_SH + ' (solid)', 'sandbox only'), 'NaOH': ('FETCHED', NIST_SH + ' (solid)', 'sandbox only'),
    'C3H8': ('FETCHED', 'NASA TM-4513 L 6/90 (Cantera nasa_gas.yaml)', ''),
}
# critical constants / Tb confidence: FETCHED (CoolProp reference EOS via NIST) unless thermo.py flags them
CRIT_CONF = {'SO3': 'UNVERIFIED', 'NO': 'UNVERIFIED', 'NO2': 'UNVERIFIED', 'N2O4': 'UNVERIFIED', 'HNO3l': 'UNVERIFIED', 'HNO3': 'UNVERIFIED'}
TB_CONF = {'CO2': 'UNVERIFIED', 'SO3': 'UNVERIFIED', 'S': 'UNVERIFIED', 'H2SO4l': 'UNVERIFIED', 'NO': 'UNVERIFIED',
           'N2O4': 'UNVERIFIED', 'HNO3l': 'UNVERIFIED', 'NaCl': 'UNVERIFIED', 'NaOH': 'UNVERIFIED'}
LIQ_OF = {'H2O(l)': 'H2O', 'CH3OH(l)': 'CH3OH', 'C2H5OH(l)': 'C2H5OH'}      # inherit Tc/Tb/dHvap/Antoine from the gas
PHASE_TAG = {'g': '', 'l': '(l)', 's': '', 's/l': '', 'aq': '(aq)'}

def seg_json(segs):
    out = []
    for kind, lo, hi, c in segs:
        k = {'sh': 'shomate', 'na': 'nasa7', 'cc': 'constcp'}[kind]
        out.append({'kind': k, 'Tlo': float(lo), 'Thi': float(hi), 'coef': [float(x) for x in c]})
    return out

def mark_phase_changes(sid, segs):
    """Flag segment starts that are real phase changes (latent-heat steps) rather than polynomial junctions."""
    if sid == 'S':
        for s in segs:
            s['phaseChange'] = s['Tlo'] in (368.3, 388.36)
    if sid == 'NaOH':
        for s in segs:
            s['phaseChange'] = s['Tlo'] == 572.0
    return segs

def watson_dhvap(dh_tb, Tb, Tc, T):
    return 0.0 if T >= Tc else dh_tb * ((Tc - T) / (Tc - Tb)) ** WATSON

SPECIES = {}      # game id -> dict
ORDER = []

def add(sid, rec):
    SPECIES[sid] = rec
    ORDER.append(sid)

def base_from_research(k):
    label, f, ph, dh_q, s_q, tb, crit, flags = [th.SPEC[k][i] for i in (1, 2, 3, 4, 5, 6, 7, 8)]
    sid = gid(k)
    conf, src, notes = CONF[k]
    segs = mark_phase_changes(sid, seg_json(th.SP[k]))
    formula = label.split(' ')[0]
    rec = {
        'id': sid, 'name': display(formula, PHASE_TAG.get(ph if ph in PHASE_TAG else 's', '')),
        'formula': formula, 'elements': {a: float(n) if n != int(n) else int(n) for a, n in f.items()},
        'M': round(th.mw(f), 6), 'phase': ph, 'tier': 'must' if sid in MUST else 'stretch', 'hasThermo': True,
        'dHf298': r3(th.H(k, T0)), 'S298': r3(th.S(k, T0)), 'segments': segs,
        'src': src, 'conf': conf, 'notes': ('; '.join(x for x in (notes, flags.strip(), 'quoted dHf: ' + dh_q) if x)),
        'janaf': None,
    }
    if tb is not None:
        rec['Tb'] = tb; rec['confTb'] = TB_CONF.get(k, 'FETCHED')
    if crit is not None:
        rec['Tc'], rec['Pc_bar'], rec['omega'] = crit
        rec['confCrit'] = CRIT_CONF.get(k, 'FETCHED')
    return rec

# gas / condensed species of thermo.py, in research order
RESEARCH_KEYS = [m[0] for m in th.M]
for k in RESEARCH_KEYS:
    if k == 'HNO3l':
        continue                         # added after HNO3(g)
    add(gid(k), base_from_research(k))
    if k == 'H2O':
        pass
# HNO3 gas (thermo.py SP['HNO3'], JANAF H-030): same metadata row as HNO3(l) for Tb / critical (all UNVERIFIED)
_r = base_from_research('HNO3l')
_r.update(id='HNO3(l)')
_g = dict(_r)
_g.update(id='HNO3', name=display('HNO3', ''), phase='g', tier='stretch', segments=seg_json(th.SP['HNO3']),
          dHf298=r3(th.H('HNO3', T0)), S298=r3(th.S('HNO3', T0)), src=CONF['HNO3'][1], conf=CONF['HNO3'][0],
          notes='gas HNO3 (JANAF H-030); Tb, Tc, Pc, omega UNVERIFIED (memory)')
add('HNO3', _g)
add('HNO3(l)', _r)

# N2O and graphite: fits of the NIST-JANAF tables (scripts/janaf-extra)
_n2o_jt = janaf_extra('N-026'); _c_jt = janaf_extra('C-002')
add('N2O', {'id': 'N2O', 'name': display('N2O', ''), 'formula': 'N2O', 'elements': {'N': 2, 'O': 1}, 'M': round(th.mw({'N': 2, 'O': 1}), 6),
            'phase': 'g', 'tier': 'stretch', 'hasThermo': True, 'dHf298': _n2o_jt[T0]['dfH'],
            'S298': _n2o_jt[T0]['S'], 'segments': seg_json(EXTRA_SEGS['N2O']),
            'Tb': 184.7, 'confTb': 'UNVERIFIED', 'Tc': 309.6, 'Pc_bar': 72.4, 'omega': 0.16, 'confCrit': 'UNVERIFIED',
            'src': 'NIST-JANAF N-026 table (scripts/janaf-extra), Shomate re-fit by scripts/port-thermo.py, max dev vs table H %.4f kJ/mol, S %.4f, Cp %.4f' % tuple(EXTRA_SEGS['N2O_dev']),
            'conf': 'FETCHED', 'notes': 'critical constants and Tb as listed in DESIGN 4.1, not sourced (UNVERIFIED); emission species only', 'janaf': 'N-026'})
add('C', {'id': 'C', 'name': 'C (graphite)', 'formula': 'C', 'elements': {'C': 1}, 'M': round(th.mw({'C': 1}), 6), 'phase': 's',
          'tier': 'must', 'hasThermo': True, 'dHf298': _c_jt[T0]['dfH'], 'S298': _c_jt[T0]['S'],
          'segments': seg_json(EXTRA_SEGS['C']),
          'src': 'NIST-JANAF C-002 (carbon, graphite reference state; scripts/janaf-extra), Shomate re-fit by scripts/port-thermo.py, max dev vs table H %.4f kJ/mol, S %.4f, Cp %.4f' % tuple(EXTRA_SEGS['C_dev']),
          'conf': 'FETCHED', 'notes': 'valid 298-3000 K (fit range); sublimation not modelled', 'janaf': 'C-002'})

# NH3(l): no liquid polynomial -> h_g - dHvap(T) with Watson 0.38 (DESIGN 3.3)
_nh3 = SPECIES['NH3']
_dh298 = watson_dhvap(HVAP['NH3']['dHvap'], _nh3['Tb'], _nh3['Tc'], T0)
add('NH3(l)', {'id': 'NH3(l)', 'name': display('NH3', '(l)'), 'formula': 'NH3', 'elements': dict(_nh3['elements']), 'M': _nh3['M'],
               'phase': 'l', 'tier': 'must', 'hasThermo': True, 'dHf298': _nh3['dHf298'] - _dh298, 'S298': None, 'segments': [],
               'liquidOf': 'NH3', 'Tb': _nh3['Tb'], 'confTb': _nh3['confTb'], 'Tc': _nh3['Tc'], 'Pc_bar': _nh3['Pc_bar'], 'omega': _nh3['omega'],
               'confCrit': _nh3['confCrit'],
               'src': 'NH3(g) NIST Shomate minus Watson dHvap (0.38), dHvap(Tb) 23.33 kJ/mol CoolProp via docs/research/vle_safety.md',
               'conf': 'F2', 'notes': 'DERIVED; S298 filled below from the Watson-consistent entropy integral; Watson overshoots liquid Cp (about 105 vs 80 J/mol/K at 298 K)', 'janaf': None})

# pseudo-species
def pseudo(sid, formula, elements, phase, notes, thermo=None):
    rec = {'id': sid, 'name': display(formula, PHASE_TAG[phase]) if sid not in ('broth', 'biomass') else sid, 'formula': formula,
           'elements': elements, 'M': round(th.mw(elements), 6), 'phase': phase, 'tier': 'must' if sid in MUST else 'stretch',
           'hasThermo': False, 'dHf298': None, 'S298': None, 'segments': [],
           'src': 'pseudo-species (DESIGN 4.1 / 10.1): ' + notes, 'conf': 'GAME', 'notes': notes, 'janaf': None}
    return rec
add('H2O2(aq)', pseudo('H2O2(aq)', 'H2O2', {'H': 2, 'O': 2}, 'aq', 'lab species of L18, molar mass only; the reactor uses lumped rho*cp'))
add('C3H6O', pseudo('C3H6O', 'C3H6O', {'C': 3, 'H': 6, 'O': 1}, 'l', 'propylene oxide, molar mass only; the CSTR uses the lumped rho*cp of K7'))
add('C3H8O2', pseudo('C3H8O2', 'C3H8O2', {'C': 3, 'H': 8, 'O': 2}, 'l', 'propylene glycol, molar mass only; the CSTR uses the lumped rho*cp of K7'))
_w = SPECIES['H2O(l)']
_b = pseudo('broth', 'H2O', {'H': 2, 'O': 1}, 'l', 'fermenter broth = constant Cp of water at 298.15 K (derived from the H2O(l) polynomial); stretch')
_cpw = th.Cp('H2Ol', T0)
_b.update(name='broth', hasThermo=True, dHf298=r3(th.H('H2Ol', T0)), S298=r3(th.S('H2Ol', T0)),
          segments=[{'kind': 'constcp', 'Tlo': 250.0, 'Thi': 400.0, 'coef': [th.H('H2Ol', T0), th.S('H2Ol', T0), _cpw]}])
add('broth', _b)
add('biomass', pseudo('biomass', 'CH1.8O0.5N0.2', {'C': 1, 'H': 1.8, 'O': 0.5, 'N': 0.2}, 's', 'biomass CH1.8O0.5N0.2 per C-mole, M 24.6 g/mol (GAME), molar mass only; stretch'))

# JANAF ids and Antoine / dHvap attachments, colours
JANAF = {gid(k): v for k, v in th.JANAF_IDS.items()}
for sid, tid in JANAF.items():
    SPECIES[sid]['janaf'] = tid
for sid, rec in SPECIES.items():
    base = LIQ_OF.get(sid, 'NH3' if sid == 'NH3(l)' else sid)
    if base in ANT:
        rec['antoine'] = dict(ANT[base]); rec['confAntoine'] = 'F2'
    if base in HVAP:
        rec['dHvapTb_kJ'] = HVAP[base]['dHvap']; rec['confDHvap'] = 'F2'
    if sid in LIQ_OF:
        g = SPECIES[LIQ_OF[sid]]
        for f in ('Tb', 'confTb', 'Tc', 'Pc_bar', 'omega', 'confCrit'):
            if f in g and f not in rec:
                rec[f] = g[f]
    if sid in COLOUR_56:
        rec['colour'] = COLOUR_56[sid]; rec['colourSrc'] = 'DESIGN5.6'
    elif sid in COLOUR_ALIAS:
        rec['colour'] = COLOUR_56[COLOUR_ALIAS[sid]]; rec['colourSrc'] = 'DESIGN5.6'
    elif sid in COLOUR_GAME:
        rec['colour'] = COLOUR_GAME[sid]; rec['colourSrc'] = 'GAME'
    else:
        raise SystemExit('no colour for ' + sid)

# NH3(l) S298: Watson-consistent entropy (kept in the generated file as a documentation value, the TS code recomputes it)
def nh3l_s(T):
    g = SPECIES['NH3']; Tb, Tc, hb = g['Tb'], g['Tc'], HVAP['NH3']['dHvap'] * 1000.0
    s_tb = th.S('NH3', Tb) - R * math.log(1.01325) - hb / Tb
    # integral of cp_l/T from Tb to T with cp_l = cp_g + 0.38 dHvap(T)/(Tc-T)
    n = 4000
    h = (T - Tb) / n
    tot = 0.0
    for i in range(n + 1):
        t = Tb + i * h
        f = (th.Cp('NH3', t) + WATSON * watson_dhvap(hb, Tb, Tc, t) / (Tc - t)) / t
        tot += f * (0.5 if i in (0, n) else 1.0)
    return s_tb + tot * h
SPECIES['NH3(l)']['S298'] = round(nh3l_s(T0), 3)

# ---------------------------------------------------------------------------------------------- invariants
for sid, rec in SPECIES.items():
    assert rec['src'] and rec['conf'] in ('FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'), sid
    segs = rec['segments']
    for a, b in zip(segs, segs[1:]):
        assert abs(a['Thi'] - b['Tlo']) < 1e-9, (sid, a['Thi'], b['Tlo'])

# ---------------------------------------------------------------------------------------------- write TS
def num(x):
    if isinstance(x, bool):
        return 'true' if x else 'false'
    if isinstance(x, int):
        return str(x)
    if x != x:
        raise ValueError('nan')
    return repr(float(x))

def emit(v, ind=0):
    pad = '  ' * ind
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return num(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        if all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v):
            return '[' + ', '.join(num(x) for x in v) + ']'
        return '[\n' + ',\n'.join(pad + '  ' + emit(x, ind + 1) for x in v) + ',\n' + pad + ']'
    if isinstance(v, dict):
        if all(isinstance(x, (int, float, str)) and not isinstance(x, bool) for x in v.values()) and len(v) <= 6 and ind > 1:
            return '{ ' + ', '.join('%s: %s' % (json.dumps(k) if not re.match(r'^[A-Za-z_]\w*$', k) else k, emit(x)) for k, x in v.items()) + ' }'
        return '{\n' + ''.join(pad + '  %s: %s,\n' % (json.dumps(k) if not re.match(r'^[A-Za-z_]\w*$', k) else k, emit(x, ind + 1)) for k, x in v.items()) + pad + '}'
    raise TypeError(type(v))

FIELD_ORDER = ['id', 'name', 'formula', 'elements', 'M', 'phase', 'tier', 'hasThermo', 'dHf298', 'S298', 'segments', 'liquidOf',
               'Tb', 'confTb', 'Tc', 'Pc_bar', 'omega', 'confCrit', 'dHvapTb_kJ', 'confDHvap', 'antoine', 'confAntoine',
               'colour', 'colourSrc', 'janaf', 'src', 'conf', 'notes']

lines = [
    '// GENERATED by scripts/port-thermo.py (python3 -I scripts/port-thermo.py). DO NOT EDIT BY HAND.',
    '// Sources: docs/research/thermo.py (Shomate / NASA / constant-Cp segments, metadata), docs/research/vle_safety.md',
    '// (Antoine refits, dHvap at Tb), scripts/janaf-extra (graphite, N2O). Units: kJ/mol, J/(mol K), g/mol, K, bar (Pc_bar).',
    '// Shomate coef = [A,B,C,D,E,F,G,H] (NIST, t = T/1000); nasa7 coef = [a1..a7]; constcp coef = [H298 kJ/mol, S298, Cp].',
    '',
    'export const SPECIES_GEN = {',
]
for sid in ORDER:
    rec = SPECIES[sid]
    assert set(rec) <= set(FIELD_ORDER), set(rec) - set(FIELD_ORDER)
    body = ''.join('    %s: %s,\n' % (f, emit(rec[f], 2)) for f in FIELD_ORDER if f in rec and rec[f] is not None)
    lines.append('  %s: {\n%s  },' % (json.dumps(sid), body))
lines += ['} as const;', '', 'export const SPECIES_GEN_ORDER = ' + json.dumps(ORDER) + ' as const;', '']
out_ts = os.path.join(ROOT, 'src', 'data', 'species.gen.ts')
os.makedirs(os.path.dirname(out_ts), exist_ok=True)
open(out_ts, 'w', encoding='utf-8').write('\n'.join(lines))

# ---------------------------------------------------------------------------------------------- JANAF fixture
def jrow(tid, T):
    jt = th.janaf(tid) if tid not in ('C-002', 'N-026') else janaf_extra(tid)
    r = jt.get(T)
    return None if r is None else r

fx_species = []
for sid, tid in list(JANAF.items()) + [('C', 'C-002'), ('N2O', 'N-026')]:
    jt = th.janaf(tid) if tid not in ('C-002', 'N-026') else janaf_extra(tid)
    rec = SPECIES[sid]
    Tmax = rec['segments'][-1]['Thi']
    if sid == 'S':
        Tmax = 882.117
    rows = []
    for T in DESIGN_T:
        r = jt.get(T)
        if r is None:
            continue
        rows.append({'T': T, 'Cp': r['cp'], 'S': r['S'], 'dH': r['dH'], 'inRange': T <= Tmax})
    logkf = {('%g' % T): r['logKf'] for T, r in sorted(jt.items()) if 290 < T <= 1000 and r['logKf'] == r['logKf']}
    fx_species.append({'id': sid, 'janaf': tid, 'extra': sid in ('C', 'N2O'),
                       'dHf298': jt[T0]['dfH'], 'S298': jt[T0]['S'], 'Tmodel_max': Tmax, 'rows': rows, 'logKf': logkf})

react = []
for rid in ('R1', 'R2', 'R5', 'R6', 'R8', 'R9'):
    name, nus = th.RX[rid]
    ids = {gid(k): v for k, v in nus.items()}
    Ts = []
    for T in th.TLIST:
        try:
            lj, how = th.janaf_logK(nus, T)
        except Exception:
            continue
        if lj is None:
            continue
        Ts.append({'T': float(T), 'log10K_janaf': lj, 'how': how, 'log10K_py': th.rxn(rid, T)[3] / math.log(10)})
    react.append({'id': rid, 'name': name, 'nu': ids, 'rows': Ts})

fx = {'generatedBy': 'scripts/port-thermo.py', 'refT': DESIGN_T, 'tolerance': {'dH_kJ': 0.02, 'S': 0.02, 'Cp': 0.1},
      'species': fx_species, 'reactions': react}
out_js = os.path.join(ROOT, 'src', 'oracle', 'fixtures', 'janaf.json')
os.makedirs(os.path.dirname(out_js), exist_ok=True)
open(out_js, 'w').write(json.dumps(fx, indent=1) + '\n')
print('wrote', out_ts, len(ORDER), 'species;', out_js, len(fx_species), 'JANAF species')
