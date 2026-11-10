#!/usr/bin/env python3
"""Port the research rate laws and catalyst facts into the game (BUILD-PLAN 1.5).

Run (from the repo root):  python3 -I scripts/port-kinetics.py

Reads, never retypes (regex on the research sources):
  docs/research/kinetics_haber.py     K1 Temkin: A, Ea, R, alpha (default arg), eta (default arg)
  docs/research/kinetics_so2.py       K2 Eklund: k(T) coefficients, pSO3 floor
  docs/research/kinetics_cstr_si.py   K7 PO hydrolysis: A (1/h), E (MJ/kmol), R
  docs/research/thermo.py             engine K(R1), K(R2h) for the fit-error report (K_engine / K_paper over the range)
Writes:
  src/data/kinetics.gen.ts, src/data/catalysts.gen.ts   plain data, no logic

Everything marked GAME below is a game choice (DESIGN 4.3 / 4.4 / BUILD-PLAN decisions), not a literature number.
"""
import importlib.util
import math
import os
import re
import sys

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'docs', 'research')
rd = lambda f: open(os.path.join(RES, f), encoding='utf-8').read()

sys.argv = ['thermo.py', os.path.join(RES, 'janaf')]
_spec = importlib.util.spec_from_file_location('thermo_research', os.path.join(RES, 'thermo.py'))
th = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(th)
ATM = 1.01325  # bar per atm

def num(pat, txt, grp=1):
    m = re.search(pat, txt)
    assert m, pat
    return float(m.group(grp))

# ---------------------------------------------------------------- K1
hab = rd('kinetics_haber.py')
R_hab = float(re.search(r'^R=([\d.]+)', hab, re.M).group(1))
A_hab = num(r'return ([\d.e+]+)\*np\.exp\(-(\d+)/\(R\*T\)\)', hab)
Ea_hab = num(r'return ([\d.e+]+)\*np\.exp\(-(\d+)/\(R\*T\)\)', hab, 2)
alpha = num(r'def rate\(T,p,alpha=([\d.]+),eta=', hab)
eta = num(r'def run\(T0=[\d.]+,P=[\d.]+,y0=\([^)]*\),eta=([\d.]+)', hab)
T_ref1 = 673.15
kref1 = A_hab * math.exp(-Ea_hab / (R_hab * T_ref1))
def gb(T):  # Gillespie-Beattie Ka^2 in atm^-2 (text constants read from the script)
    N = r'([-+]?[\d.]+(?:e[-+]?\d+)?)'
    c = re.search(r'return 10\*\*\(' + N + r'\*np\.log10\(T\)' + N + r'\*T' + N + r'\*T\*\*2\+' + N + r'/T\+' + N + r'\)', hab)
    a1, a2, a3, a4, a5 = [float(x) for x in c.groups()]
    return (10 ** (a1 * math.log10(T) + a2 * T + a3 * T * T + a4 / T + a5)) ** 2
ratio1 = [th.K('R1', T) * ATM ** 2 / gb(T) for T in range(653, 794, 5)]  # 380-520 C

# ---------------------------------------------------------------- K2
so2 = rd('kinetics_so2.py')
m = re.search(r'return np\.exp\((-[\d.]+)/T-(\d+)\*np\.log\(1\.8\*T\)\+([\d.]+)\)', so2)
ek_b, ek_c, ek_d = -float(m.group(1)), float(m.group(2)), float(m.group(3))   # k = exp(-b/T - c ln(1.8 T) + d)
floor2 = float(re.search(r'^FLOOR=([\d.]+)', so2, re.M).group(1))
mk = re.search(r'return np\.exp\(([\d.]+)/T-([\d.]+)\)', so2)
kp_a, kp_b = float(mk.group(1)), float(mk.group(2))
ratio2 = [th.K('R2h', T) * ATM ** 0.5 / math.exp(kp_a / T - kp_b) for T in range(693, 824, 5)]  # 420-550 C
# Arrhenius-segment refit of k(T) (research script prints the same two segments): max factor error
def kT(T): return math.exp(-ek_b / T - ek_c * math.log(1.8 * T) + ek_d)

# ---------------------------------------------------------------- K7
cs = rd('kinetics_cstr_si.py')
R_cs = float(re.search(r'^Rg=([\d.e-]+)', cs, re.M).group(1))
A_cs = float(re.search(r'^A=([\d.e+]+); E=([\d.]+)', cs, re.M).group(1))
E_cs = float(re.search(r'^A=([\d.e+]+); E=([\d.]+)', cs, re.M).group(2))   # MJ/kmol == kJ/mol
R_cs_J = R_cs * 1e3  # J/(mol K)  (8.314e-3 MJ/kmol/K)

def f(x):
    return repr(float(x))

laws = []
laws.append(dict(
    id='K1', form='temkin', tier='must', reactions=['R1'], basis='per_m3_cat_kmol_h', catalysts=['fe_ammonia', 'ru_ammonia'],
    species=dict(N2='N2', H2='H2', NH3='NH3'),
    params=dict(R=R_hab, Ea=Ea_hab, Tref=T_ref1, kref=kref1, A=A_hab, alpha=alpha, eta=eta, floor=0.01),
    range='380-520 C, 100-300 bar',
    src='Dyson & Simon, Ind. Eng. Chem. Fundam. 7 (1968) 605 via docs/research/kinetics_haber.py (k, Ea, alpha, eta); K_a^2 = engine K(R1) converted bar^-2 -> atm^-2 (DESIGN 3.5 rule 1)',
    conf='F2',
    fit=dict(note='no pre-exponential refit: forward rate uses engine K; K_engine/K_GillespieBeattie ratio over 380-520 C (rate error of the forward term)',
             ratioMin=min(ratio1), ratioMax=max(ratio1)),
))
laws.append(dict(
    id='K2', form='eklund', tier='must', reactions=['R2'], basis='per_g_cat_mol_s', catalysts=['v2o5', 'v2o5_cs'],
    species=dict(SO2='SO2', O2='O2', SO3='SO3'),
    params=dict(b=ek_b, c=ek_c, d=ek_d, floor=floor2),
    range='420-554 C fit; light-off 380-420; damage > 620 C',
    src='Eklund 1956 via arXiv:1412.6486 as transcribed in docs/research/kinetics_so2.py; K_p = engine K(R2) converted bar^-1/2 -> atm^-1/2',
    conf='F2',
    fit=dict(note='k(T) kept in the closed paper form (not Arrhenius); no refit; K_engine/K_paper(Kp) ratio over 420-550 C',
             ratioMin=min(ratio2), ratioMax=max(ratio2)),
))
laws.append(dict(
    id='K6', form='first_order', tier='must', reactions=['R17'], basis='per_m3_mol_s', catalysts=['iodide', 'catalase'],
    species=dict(A='H2O2(aq)'),
    params=dict(R=8.314, Tref=298.15),
    variants=[
        # Ea in J/mol from DESIGN 4.3 K6 / kinetics.md 9 (uncatalysed 75.3, I- 56.5, catalase 8-19, game window fixed 15); k25 s^-1 GAME
        dict(catalyst='none', Ea=75300.0, kref=1.0e-6, kconf='GAME'),
        dict(catalyst='iodide', Ea=56500.0, kref=1.0e-3, kconf='GAME'),
        dict(catalyst='catalase', Ea=15000.0, kref=1.0e-1, kconf='GAME'),
    ],
    range='10-60 C',
    src='LibreTexts / RSC Ea values (F2) via docs/research/kinetics.md section 9; k at 25 C are GAME (A chosen for the level, DESIGN 4.3)',
    conf='GAME', fit=None,
))
laws.append(dict(
    id='K7', form='cstr_arrhenius', tier='must', reactions=['R18'], basis='per_m3_mol_s', catalysts=[],
    species=dict(A='C3H6O'),
    params=dict(R=R_cs_J, Ea=E_cs * 1e3, Tref=298.15, A=A_cs / 3600.0, kref=A_cs / 3600.0 * math.exp(-E_cs * 1e3 / (R_cs_J * 298.15))),
    range='10-180 C',
    src='Fogler Ex.12-3 via docs/research/kinetics_cstr_si.py: k = 16.96e12 exp(-E/RT) 1/h, E = 75.36 kJ/mol exactly, R = 8.314',
    conf='F2', fit=None,
))
stubs = [
    ('K3', 'vbf', ['R3', 'R4'], ['cu_zn_meoh'], 'J. Catal. 161 (1996) 1-10 (DESIGN 4.3 K3)', 'FETCHED'),
    ('K4', 'power_rev', ['R5'], ['fecr_hts'], 'Hla et al. 2009 form; exponents and k0 UNVERIFIED (DESIGN 4.3 K4)', 'UNVERIFIED'),
    ('K5', 'xf', ['R6', 'R5'], ['ni_smr'], 'Xu & Froment 1989 (DESIGN 4.3 K5)', 'F2'),
    ('K8', 'luong', ['R12'], ['yeast'], 'Luong 1985 (DESIGN 4.3 K8)', 'FETCHED'),
    ('K9', 'gauze_selectivity', ['R7', 'R7b', 'R7c'], ['ptrh_gauze'], 'EU BREF LVIC-AAF 2007 (DESIGN 4.3 K9)', 'FETCHED'),
    ('K10', 'third_order', ['R8'], [], 'review via snippet, IUPAC datasheet to fetch (DESIGN 4.3 K10)', 'F2'),
]
for sid, form, rx, cats, src, conf in stubs:
    laws.append(dict(id=sid, form=form, tier='stretch', reactions=rx, basis='none', catalysts=cats, species={}, params={},
                     range='', src=src + '; stub entry, rate not implemented', conf=conf, fit=None))

def js(o):
    if isinstance(o, dict):
        return '{' + ', '.join('%s: %s' % (k, js(v)) for k, v in o.items()) + '}'
    if isinstance(o, list):
        return '[' + ', '.join(js(v) for v in o) + ']'
    if isinstance(o, str):
        return '"' + o.replace('"', '\\"') + '"'
    if o is None:
        return 'null'
    if isinstance(o, bool):
        return 'true' if o else 'false'
    return repr(float(o)) if isinstance(o, float) else str(o)

hdr = '// GENERATED by scripts/port-kinetics.py (python3 -I scripts/port-kinetics.py). DO NOT EDIT BY HAND.\n'
with open(os.path.join(ROOT, 'src', 'data', 'kinetics.gen.ts'), 'w', encoding='utf-8') as fh:
    fh.write(hdr + '// Sources: docs/research/kinetics_haber.py, kinetics_so2.py, kinetics_cstr_si.py, kinetics.md; engine K from thermo.py (fit report only).\n'
             '// Rates: K1 kmol NH3/(m3_cat h) (state units are converted in src/sim/chem/kinetics.ts), K2 mol SO2/(s g_cat), K6/K7 mol/(m3 s).\n\n')
    fh.write('export const KINETICS_GEN = [\n' + ''.join('  ' + js(l) + ',\n' for l in laws) + '] as const;\n')

# ---------------------------------------------------------------- catalysts (kinetics.md section 8 / DESIGN 4.4)
# rhoB kg/m3: GAME (BUILD-PLAN decisions: fused Fe 2500, V2O5 600; the others are placeholders, same tag).
cats = [
    dict(id='fe_ammonia', name='fused magnetite Fe-K2O-Al2O3', kind='heterogeneous', tier='must', lawIds=['K1'], Tmin=380, Tmax=520, TlightOff=380,
         rhoB=2500, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['O', 'S', 'Cl'], life='10-20 y',
         src='docs/research/kinetics.md section 8 (recalled, UNVERIFIED window; DESIGN 4.4); rho_b GAME per BUILD-PLAN', conf='UNVERIFIED'),
    dict(id='ru_ammonia', name='Ru/C Cs-Ba promoted (KAAP)', kind='heterogeneous', tier='stretch', lawIds=['K1'], Tmin=340, Tmax=440, TlightOff=340,
         rhoB=2000, rhoBConf='GAME', kMult=10.0, dTk=0.0, price=20.0, poisons=['O'], life='',
         src='kinetics.md section 8; k x10 per volume GAME from "~10x Fe activity", price x20 GAME (DESIGN 4.4)', conf='GAME'),
    dict(id='v2o5', name='V2O5-K2SO4/SiO2', kind='heterogeneous', tier='must', lawIds=['K2'], Tmin=410, Tmax=620, TlightOff=400,
         rhoB=600, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['Fe', 'dust', 'moisture'], life='10-20 y',
         src='kinetics.md section 8 / DESIGN 4.4 (light-off 380-420 cross-checked by K2); rho_b GAME per BUILD-PLAN', conf='F2'),
    dict(id='v2o5_cs', name='Cs-promoted V2O5', kind='heterogeneous', tier='stretch', lawIds=['K2'], Tmin=370, Tmax=620, TlightOff=360,
         rhoB=600, rhoBConf='GAME', kMult=1.0, dTk=-40.0, price=2.0, poisons=['Fe', 'dust', 'moisture'], life='',
         src='kinetics.md section 8; light-off shifted -40 K GAME from industry practice, price x2 GAME (DESIGN 4.4)', conf='GAME'),
    dict(id='cu_zn_meoh', name='Cu/ZnO/Al2O3', kind='heterogeneous', tier='stretch', lawIds=['K3'], Tmin=200, Tmax=280, TlightOff=200,
         rhoB=1200, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['S', 'Cl'], life='2-4 y', src='kinetics.md section 8 (UNVERIFIED); rho_b GAME placeholder', conf='UNVERIFIED'),
    dict(id='fecr_hts', name='Fe2O3-Cr2O3 HTS', kind='heterogeneous', tier='stretch', lawIds=['K4'], Tmin=320, Tmax=450, TlightOff=320,
         rhoB=1200, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['S', 'Cl'], life='3-5 y', src='kinetics.md section 8 (UNVERIFIED); rho_b GAME placeholder', conf='UNVERIFIED'),
    dict(id='cuzn_lts', name='Cu-ZnO-Al2O3 LTS', kind='heterogeneous', tier='stretch', lawIds=[], Tmin=190, Tmax=250, TlightOff=190,
         rhoB=1200, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['S', 'Cl'], life='2-4 y', src='kinetics.md section 8 (UNVERIFIED); rho_b GAME placeholder', conf='UNVERIFIED'),
    dict(id='ni_smr', name='Ni/Al2O3', kind='heterogeneous', tier='stretch', lawIds=['K5'], Tmin=500, Tmax=900, TlightOff=500,
         rhoB=1000, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['S', 'As'], life='4-6 y', src='kinetics.md section 8 (UNVERIFIED); rho_b GAME placeholder', conf='UNVERIFIED'),
    dict(id='ptrh_gauze', name='Pt-Rh 90/10 gauze', kind='gauze', tier='stretch', lawIds=['K9'], Tmin=800, Tmax=950, TlightOff=800,
         rhoB=0, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['Fe', 'P', 'S', 'dust'], life='3-12 months', src='kinetics.md section 8 (F2); no bed density (gauze)', conf='F2'),
    dict(id='yeast', name='S. cerevisiae', kind='biological', tier='stretch', lawIds=['K8'], Tmin=28, Tmax=35, TlightOff=28,
         rhoB=0, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=['ethanol'], life='per batch', src='kinetics.md section 8 (window in C); no bed density', conf='F2'),
    dict(id='iodide', name='iodide ion (homogeneous)', kind='homogeneous', tier='must', lawIds=['K6'], Tmin=10, Tmax=60, TlightOff=10,
         rhoB=0, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=[], life='', src='LibreTexts Ea 56.5 kJ/mol (F2); lab rig, no bed', conf='F2'),
    dict(id='catalase', name='catalase (homogeneous)', kind='homogeneous', tier='must', lawIds=['K6'], Tmin=10, Tmax=60, TlightOff=10,
         rhoB=0, rhoBConf='GAME', kMult=1.0, dTk=0.0, price=1.0, poisons=[], life='', src='Ea 8-19 kJ/mol (F2); game fixes 15 (DESIGN 4.3 K6/L18); lab rig, no bed', conf='GAME'),
]
with open(os.path.join(ROOT, 'src', 'data', 'catalysts.gen.ts'), 'w', encoding='utf-8') as fh:
    fh.write(hdr + '// Sources: docs/research/kinetics.md section 8 (windows, UNVERIFIED recalled), DESIGN 4.4 (game effects), BUILD-PLAN decisions (rho_b GAME).\n'
             '// Tmin/Tmax/TlightOff in deg C (window); rhoB in kg/m3; rhoB 0 = no packed bed (gauze, biological, homogeneous).\n\n')
    fh.write('export const CATALYSTS_GEN = [\n' + ''.join('  ' + js(c) + ',\n' for c in cats) + '] as const;\n')

print('K1 kref(673.15)=%.6g  K_engine/K_GB: %.3f..%.3f' % (kref1, min(ratio1), max(ratio1)))
print('K2 floor=%g  K_engine/K_paper: %.4f..%.4f' % (floor2, min(ratio2), max(ratio2)))
print('K7 k(298.15)=%.4g 1/s' % laws[3]['params']['kref'])
