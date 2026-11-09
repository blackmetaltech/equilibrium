#!/usr/bin/env python3
"""EQUILIBRIUM fixture exporter (BUILD-PLAN M0.3).

Run from the repo root:   PYLIB=<dir containing CoolProp> python3 -I scripts/export-fixtures.py

Writes (deterministic pretty JSON, sorted keys, floats with full repr):
  src/oracle/oracles.json            78 textbook oracles (EQ-NC-001..043, EQ-CE-001..035), DESIGN 9.2.1 + 9.2.1b
  src/oracle/fixtures/*.json         dual-implementation fixtures (DESIGN 9.2.3)
It never writes src/oracle/fixtures/janaf.json (owned by the thermo lane).

Every number is produced by importing/executing the research scripts in docs/research (executed in-process
with stdout captured; side-effect files are redirected to a temp dir). Nothing is typed by hand except
(a) statement text, (b) the field names under which values are published, (c) book constants that the research
scripts hold as literals inside functions (listed in NC_CONST and asserted against the script's own result).
Before anything is written the exporter cross-checks every oracle against the research script's own printed
answer and against docs/research/review_spotcheck.py, and every fixture row against the printed tables of
levels_calc*.py; any disagreement aborts with exit code 1 (nothing is written).

Needs: python3, numpy, scipy, and CoolProp (only for haber_loop.json: levels_calc_loop.py needs it;
`pip install --target DIR CoolProp` then PYLIB=DIR).
"""
import contextlib
import io
import json
import math
import os
import re
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, 'docs', 'research')
OUT = os.path.join(ROOT, 'src', 'oracle')
FIX = os.path.join(OUT, 'fixtures')
sys.path.insert(0, RES)

import numpy as np  # noqa: E402
from scipy.optimize import brentq  # noqa: E402

GEN = 'scripts/export-fixtures.py'
PROBLEMS = []   # fatal disagreements
WARNINGS = []   # non-fatal notes (DESIGN text vs scripts)


def fail(msg):
    PROBLEMS.append(msg)


# ----------------------------------------------------------------------------- helpers
def plain(x):
    """numpy / tuple -> plain JSON types; rejects NaN/inf."""
    if isinstance(x, dict):
        return {str(k): plain(v) for k, v in x.items()}
    if isinstance(x, (list, tuple, np.ndarray)):
        return [plain(v) for v in x]
    if isinstance(x, np.generic):
        x = x.item()
    if isinstance(x, float) and not math.isfinite(x):
        raise ValueError('non-finite number in export')
    return x


def dump(path, obj):
    s = json.dumps(plain(obj), indent=1, sort_keys=True, allow_nan=False, ensure_ascii=False) + '\n'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(s)


def load(fname, fake_dir=None, as_main=False, extra_argv=()):
    """Execute a research script in-process, not as __main__, stdout captured. Returns (namespace, stdout)."""
    path = os.path.join(RES, fname)
    with open(path, encoding='utf-8') as f:
        src = f.read()
    fake = os.path.join(fake_dir, fname) if fake_dir else path
    ns = {'__name__': '__main__' if as_main else 'research_' + fname[:-3], '__file__': fake}
    old_argv = sys.argv
    sys.argv = [path] + list(extra_argv)
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(src, path, 'exec'), ns)
    finally:
        sys.argv = old_argv
    return ns, buf.getvalue()


def flat_numbers(x, out=None):
    out = [] if out is None else out
    if isinstance(x, dict):
        for v in x.values():
            flat_numbers(v, out)
    elif isinstance(x, (list, tuple, np.ndarray)):
        for v in x:
            flat_numbers(v, out)
    elif isinstance(x, (bool, str)) or x is None:
        pass
    elif isinstance(x, (int, float, np.generic)):
        out.append(float(x))
    return out


def close(a, b, rel=1e-9, ab=0.0):
    return abs(a - b) <= max(ab, rel * max(abs(a), abs(b)))


NUM_RE = re.compile(r'(?<![A-Za-z0-9_.])[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?')


def numbers_in(text):
    return [float(m.group(0)) for m in NUM_RE.finditer(text)]


# ----------------------------------------------------------------------------- DESIGN.md table (binding tolerances)
def parse_design_table():
    p = os.path.join(ROOT, 'docs', 'DESIGN.md')
    rows = {}
    with open(p, encoding='utf-8') as f:
        for line in f:
            if not line.startswith('| EQ-'):
                continue
            c = [x.strip() for x in line.strip().strip('|').split('|')]
            if len(c) < 7:
                continue
            rows[c[0]] = dict(status=c[1], source=c[2], problem=c[3], expected=c[4], tol=c[5], fn=c[6])
    return rows


def parse_tol(cell):
    c = cell.strip()
    m = re.match(r'abs\s+([0-9.eE+-]+)', c)
    if m:
        return {'abs': float(m.group(1))}
    if c.startswith('exact'):
        return {'abs': 0.0}
    m = re.match(r'([0-9.]+)\s*%', c)
    if m:
        return {'rel': float(m.group(1)) / 100.0}
    raise ValueError('cannot parse tolerance: ' + cell)


# ----------------------------------------------------------------------------- oracles
def build_oracles():
    tmp = tempfile.mkdtemp(prefix='eqfix_')  # oracles_cheme.py writes oracles_cheme.md next to its __file__
    nc, nc_out = load('oracles_ncert.py', as_main=True, extra_argv=[os.path.join(tmp, 'oracles_ncert.md')])
    ce, ce_out = load('oracles_cheme.py', fake_dir=tmp)
    sc, sc_out = load('review_spotcheck.py')
    table = parse_design_table()
    M = nc['M']
    R_J, RB, RL = nc['R'], nc['RB'], nc['RL']

    ncp = {p['id']: p for p in nc['P']}
    cep = {p['id']: p for p in ce['P']}
    assert len(ncp) == 43 and len(cep) == 35, (len(ncp), len(cep))

    # ---- NC: values straight from the script's compute() lambdas
    v0 = {i: p['compute']() for i, p in ncp.items()}

    def el(*names):
        return {n: M[n] for n in names}

    NC_FIELD = {
        1: 'molar_mass_g_mol', 2: 'atoms', 3: 'molarity_mol_L', 4: 'mass_g', 6: 'mass_H2O_g', 7: 'mass_Cu_g',
        8: 'mass_CO2_g', 10: 'O_per_Fe', 11: 'n_multiplier', 12: 'O_to_C', 13: 'P_total_bar', 14: 'M_B_over_M_A',
        15: 'p_H2_bar', 16: 'heat_kJ', 17: 'dH_kJ_mol', 18: 'dG_kJ', 19: 'dU_kJ_mol', 20: 'dH_kJ', 21: 'T_min_K',
        23: 'Kc_L_mol', 25: 'alpha', 28: 'dG_kJ_mol', 29: 'K', 35: 'k_ratio', 36: 'Ea_kJ_mol', 37: 'T_K',
        38: 't_s', 39: 'age_years', 42: 'Ea_kJ_mol',
    }
    # literals the script keeps inside functions (asserted below against compute())
    NC_CONST = {
        1: {'atomic_masses_g_mol': el('C', 'H', 'O')},
        2: {'atomic_masses_g_mol': el('He')},
        3: {'atomic_masses_g_mol': el('H', 'N', 'O')},
        5: {'molar_masses_g_mol': {'N2': 28.0134, 'H2': 2.016, 'NH3': 17.031}},
        6: {'atomic_masses_g_mol': el('C', 'H', 'O')},
        7: {'atomic_masses_g_mol': el('Cu', 'S', 'O')},
        8: {'atomic_masses_g_mol': el('Ca', 'C', 'O')},
        9: {'atomic_masses_g_mol': el('Mg')},
        10: {'atomic_masses_g_mol': el('Fe', 'O')},
        11: {'atomic_masses_g_mol': el('C', 'H', 'Cl')},
        12: {'atomic_masses_g_mol': el('C', 'H', 'O')},
        15: {'molar_masses_g_mol': {'H2': 2.016, 'O2': 31.998}},
        18: {'R_J_mol_K': R_J}, 19: {'R_J_mol_K': R_J}, 28: {'R_J_mol_K': R_J}, 29: {'R_J_mol_K': R_J},
        33: {'R_J_mol_K': R_J}, 35: {'R_J_mol_K': R_J}, 36: {'R_J_mol_K': R_J}, 42: {'R_J_mol_K': R_J},
        43: {'R_J_mol_K': R_J}, 24: {'R_L_bar_mol_K': RB},
    }
    # assert the literals reproduce the script's own answers
    Nn2, Nh2, Nnh3 = 28.0134, 2.016, 17.031
    ext5 = min(2000 / Nn2, 1000 / Nh2 / 3)
    if not close(ext5 * 2 * Nnh3, v0['EQ-NC-005'], 1e-12):
        fail('NC-005 literal masses disagree with script')
    if not close((20 / Nh2) / ((20 / Nh2) + (80 / 31.998)), v0['EQ-NC-015'], 1e-12):
        fail('NC-015 literal masses disagree with script')

    n24 = nc['n2o4']()
    ea43, A43 = nc['ea2']()
    v_hi = 0.5 / math.sqrt(54.8)  # corrected EQ-NC-026 (script solves a different problem, 9.2.1b)

    def direction(s):
        return {'none': 'none', 'left(reactants)': 'left', 'right(products)': 'right'}[s]

    # book values: the script's recalled, rounded answers (differences are informative, not asserted)
    def book_of(i, field):
        b = ncp[i]['book']
        if isinstance(b, (int, float)) and b != 0:
            return {field: b}
        return None

    exp = {}
    book = {}
    for n in range(1, 44):
        i = 'EQ-NC-%03d' % n
        if n in NC_FIELD:
            exp[i] = {NC_FIELD[n]: v0[i]}
            b = book_of(i, NC_FIELD[n])
            if b and not close(b[NC_FIELD[n]], v0[i], 1e-9):
                book[i] = b
    # special shapes
    exp['EQ-NC-005'] = {'mass_NH3_g': v0['EQ-NC-005'], 'limiting': 'N2' if 2000 / Nn2 < 1000 / Nh2 / 3 else 'H2',
                        'H2_left_mol': 1000 / Nh2 - 3 * 2000 / Nn2}
    book['EQ-NC-005'] = {'mass_NH3_g': min(2000 / 28, 1000 / 2 / 3) * 2 * 17,
                         'note': 'textbook masses N=14 H=1 (engine uses IUPAC masses)'}
    exp['EQ-NC-009'] = {'V_H2_L': v0['EQ-NC-009'], 'limiting': 'HCl' if 0.1 * 2.0 / 2 < 6.0 / M['Mg'] else 'Mg'}
    exp['EQ-NC-022'] = {'CO_mol_L': v0['EQ-NC-022'], 'CO2_mol_L': 0.1 - v0['EQ-NC-022'],
                        'H2_mol_L': 0.1 - v0['EQ-NC-022']}
    exp['EQ-NC-024'] = {'alpha': n24['alpha'], 'Kp_bar': n24['Kp'], 'Kc_mol_L': n24['Kc'],
                        'pN2O4_bar': n24['pN2O4'], 'pNO2_bar': n24['pNO2']}
    exp['EQ-NC-026'] = {'H2_mol_L': v_hi, 'I2_mol_L': v_hi}
    exp['EQ-NC-027'] = {'x_mol_L': v0['EQ-NC-027'], 'NO2_mol_L': 2 * v0['EQ-NC-027']}
    for n in (30, 31, 32):
        exp['EQ-NC-%03d' % n] = {'direction': direction(v0['EQ-NC-%03d' % n])}
    exp['EQ-NC-033'] = {'K_ratio_600_over_500': v0['EQ-NC-033'], 'direction': 'left'}
    exp['EQ-NC-034'] = {'Q_over_K': v0['EQ-NC-034'], 'direction': 'left'}
    ra = json.loads(ncp['EQ-NC-041']['inputs'])
    exp['EQ-NC-040'] = {'order_A': v0['EQ-NC-040'], 'order_B': 0.0}
    exp['EQ-NC-041'] = {'k_L2_mol2_s': v0['EQ-NC-041'],
                        'order_A': math.log(ra['rate'][1] / ra['rate'][0]) / math.log(ra['A'][1] / ra['A'][0]),
                        'order_B': math.log(ra['rate'][2] / ra['rate'][0]) / math.log(ra['B'][2] / ra['B'][0])}
    exp['EQ-NC-043'] = {'Ea_J_mol': ea43, 'A_per_s': A43}
    book['EQ-NC-024'] = {'Kp_bar': ncp['EQ-NC-024']['book']}
    n0_ = 13.8 / 92.0
    p0_ = n0_ * 0.083145 * 400 / 1.0
    a_ = 9.15 / p0_ - 1
    alt24 = {'Kp_bar_if_R_0_083145': (2 * a_ * p0_) ** 2 / (p0_ * (1 - a_))}
    book['EQ-NC-043'] = {'Ea_J_mol': ncp['EQ-NC-043']['book']}
    book.pop('EQ-NC-033', None)
    if set(exp) != set(ncp):
        fail('NC expected shapes missing: %s' % sorted(set(ncp) - set(exp)))

    # ---- statement fixes (DESIGN 9.2.1b); statements are text, numbers inside come from the constants above
    NC_STMT = {
        'EQ-NC-005': ncp['EQ-NC-005']['stmt'].replace(' (also H2 left: 281.7 mol check in script).', '')
        + ' Engine uses IUPAC masses (2431.8 g); the textbook masses N=14, H=1 give 2428.57 g (field `book`).',
        'EQ-NC-018': ncp['EQ-NC-018']['stmt'].replace(' NOTE near-zero result: sensitive to R.', '')
        + ' Use R = %s J/(mol K). Result is near zero, so the tolerance is absolute (0.02 kJ).' % R_J,
        'EQ-NC-023': 'Kp = 2.0e10 bar^-1 at 450 K for 2SO2 + O2 <=> 2SO3. Kc? Use R = %s L bar mol^-1 K^-1.' % json.loads(ncp['EQ-NC-023']['inputs'])['R_L_bar'],
        'EQ-NC-024': 'N2O4 <=> 2NO2; 13.8 g N2O4 (M = 92) in 1.00 L at 400 K; total pressure 9.15 bar. '
                     'Use R = %s L bar mol^-1 K^-1 (book convention; R = 0.083145 gives Kp = 83.71). Find alpha, Kp, Kc.' % RB,
        'EQ-NC-025': 'PCl5 <=> PCl3 + Cl2: 50% dissociated at 1 atm total (Kp = 1/3 atm). Degree of dissociation at 2 atm, '
                     'at constant T.',
        'EQ-NC-026': 'H2 + I2 <=> 2HI, Kc = 54.8 at 700 K. Start from HI only; at equilibrium [HI] = 0.5 mol/L. '
                     'Find [H2] = [I2] = [HI]/sqrt(Kc).',
        'EQ-NC-028': 'Reaction 3/2 O2 -> O3 with Kp = 2.47e-29 bar^-1/2 at 298 K. dG? Use R = %s J/(mol K).' % R_J,
        'EQ-NC-029': 'dG = -20.0 kJ/mol at 300 K. K? Use R = %s J/(mol K).' % R_J,
        'EQ-NC-033': 'N2 + 3H2 <=> 2NH3, dH = -92.4 kJ/mol (constant). Raise T from 500 to 600 K. K600/K500 (van\'t Hoff, '
                     'R = %s J/(mol K)) and direction of shift.' % R_J,
        'EQ-NC-037': 'log10 k = 14.34 - 1.25e4 K / T with k in s^-1. Temperature at which t1/2 = 256 min. '
                     '(Reading k in min^-1 gives 739 K: units must be stated.)',
    }
    # status / citation (DESIGN 9.2.1b)
    VERIFIED_CH1 = {
        'EQ-NC-002': '1.33(iii)', 'EQ-NC-003': '1.6', 'EQ-NC-004': '1.5',
        'EQ-NC-005': '1.24(i)', 'EQ-NC-007': '1.7', 'EQ-NC-010': '1.3',
    }
    TEXTBOOK_STYLE = {'EQ-NC-001': 'glucose molar mass', 'EQ-NC-006': 'water from 16 g CH4',
                      'EQ-NC-011': 'empirical to molecular formula, 71.65% Cl'}

    # ---- topics / lanes
    NC_TOPICS = [('mole-concept', 1, 4, 'chem/basics'), ('stoichiometry', 5, 9, 'chem/stoich'),
                 ('empirical-formula', 10, 12, 'chem/basics'), ('gas-laws', 13, 15, 'chem/basics'),
                 ('thermochemistry', 16, 21, 'thermo'), ('equilibrium', 22, 29, 'chem/equilibrium'),
                 ('le-chatelier', 30, 34, 'chem/equilibrium'), ('kinetics', 35, 43, 'chem/kinetics')]
    CE_TOPIC = {}
    CE_LANE = {}

    def setce(ids, topic, lane):
        for k in ids:
            CE_TOPIC[k] = topic
            CE_LANE[k] = lane
    setce(range(1, 5), 'reactive-material-balances', 'chem/stoich')
    setce((5, 6, 32), 'recycle-purge', 'flowsheet')
    setce(range(7, 11), 'vle-flash', 'units/flash')
    setce(range(11, 15), 'reactive-energy-balances', 'units/energy')
    setce((15, 16, 17, 18, 33, 34, 35), 'reactor-design', 'units/reactors')
    setce((19,), 'reactor-design', 'chem/kinetics')
    setce((20,), 'adiabatic-equilibrium', 'chem/equilibrium')
    setce((21, 22), 'multiple-steady-states', 'units/reactors')
    setce((23, 24), 'runaway', 'units/reactors')
    setce(range(25, 31), 'k-of-t-equilibrium', 'chem/equilibrium')
    setce((31,), 'heat-of-reaction-at-T', 'thermo')

    oracles = []
    for n in range(1, 44):
        i = 'EQ-NC-%03d' % n
        p = ncp[i]
        topic, lane = [(t, l) for (t, a, b, l) in NC_TOPICS if a <= n <= b][0]
        inputs = json.loads(p['inputs'])
        inputs.update(plain(NC_CONST.get(n, {})))
        if i in VERIFIED_CH1:
            status, source = 'V', 'NCERT XI Ch1 Exercise %s (pre-2023 edition, verified via solutions PDF); rationalised numbering unverified' % VERIFIED_CH1[i]
        elif i in TEXTBOOK_STYLE:
            status, source = 'C', 'textbook-style (not found in NCERT XI Ch1): %s' % TEXTBOOK_STYLE[i]
        else:
            tstat = table[i]['status']
            status = 'C' if tstat.startswith('C') else 'R'
            source = p['src'] + ('' if status == 'C' else ' [recalled, not verified]')
        tolcell = table[i]['tol']
        tol = parse_tol(tolcell)
        if i == 'EQ-NC-033':
            tol = {'rel': 0.01}   # 9.2.1b: K ratio +-1 % AND direction = left
            tolcell += ' -> 9.2.1b: K600/K500 = 0.0246 +- 1 % and direction = left'
        o = dict(id=i, source=source, status=status, topic=topic, statement=NC_STMT.get(i, p['stmt']), inputs=inputs,
                 expected=exp[i], unit=p['unit'], tol=tol, tolNote=tolcell, fn=p['fn'], lane=lane)
        if i in book:
            o['book'] = book[i]
        if p['consts'] and i not in ('EQ-NC-026', 'EQ-NC-033'):  # script notes are stale for these two
            o['constants'] = p['consts']
        if i == 'EQ-NC-024':
            o['expectedAlt'] = alt24
        oracles.append(o)

    # ---- CE
    CE_STMT = {
        'EQ-CE-004': cep['EQ-CE-004']['statement'].replace('with 25% excess air', 'with 25% excess air '
                     '(relative to complete combustion of all propane fed)'),
        'EQ-CE-011': cep['EQ-CE-011']['statement'] + ' Air = 21 % O2 / 79 % N2 exactly.',
        'EQ-CE-014': cep['EQ-CE-014']['statement'] + ' Product water is vapour (dHc = -802.3 kJ/mol).',
        'EQ-CE-017': cep['EQ-CE-017']['statement'].replace(
            'also Simpson rule on tabulated FA0/(-rA) at X=0,0.1..0.8 for the PFR part.',
            "also Simpson's rule on tabulated FA0/(-rA) at X = 0.4, 0.5, ... 0.8 only (the PFR part; 0-0.8 gives about 80.5 L)."),
        'EQ-CE-019': cep['EQ-CE-019']['statement'] + ' One R: %.9f J/(mol K).' % ce['R'],
        'EQ-CE-023': cep['EQ-CE-023']['statement'] + ' R = %.9f J/(mol K); k(T) = k0 exp[(E/R)(1/450 - 1/T)] with k0 = k(450 K).' % ce['R'],
        'EQ-CE-025': cep['EQ-CE-025']['statement'] + ' K in bar^-2, standard state 1 bar.',
        'EQ-CE-026': ('Ammonia synthesis, constant dH0 = 2*(-46110) J/mol. K at 500 K and 700 K: row A constant dH (R = 8.314, T0 = 298.15); '
                      'row B with Cp (Smith Table C.1 dA, dB, dD as in EQ-CE-030). Two separate assertions; never mix rows (they differ 43 %).'),
    }
    CE_STMT['EQ-CE-028'] = cep['EQ-CE-028']['statement'] + ' K(1100 K) = %.4f.' % cep['EQ-CE-028']['inputs']['K']
    CE_STMT['EQ-CE-031'] = cep['EQ-CE-031']['statement'].replace('800 C', '1073.15 K')
    CE_INPUT_ADD = {
        'EQ-CE-008': {'antoine_form': 'log10(P_mmHg) = A - B/(C + T_C)'},
        'EQ-CE-009': {'antoine_form': 'log10(P_mmHg) = A - B/(C + T_C)'},
        'EQ-CE-010': {'antoine_form': 'log10(P_mmHg) = A - B/(C + T_C)'},
        'EQ-CE-014': {'product_water_phase': 'vapour'},
        'EQ-CE-017': {'simpson_span_X': [0.4, 0.8]},
        'EQ-CE-019': {'R_J_mol_K': ce['R']},
        'EQ-CE-023': {'R_J_mol_K': ce['R'], 'k_form': 'k0*exp((E/R)*(1/T0 - 1/T))', 'T0_K': 450.0},
        'EQ-CE-025': {'K_unit': 'bar^-2', 'standard_state_bar': 1.0},
        'EQ-CE-026': {'R_J_mol_K': ce['Rs'], 'T0_K': 298.15},
        'EQ-CE-028': {},
        'EQ-CE-031': {},
    }
    DROP_KEYS = {'sequential_substitution_iters', 'iters'}

    def strip(d):
        if isinstance(d, dict):
            return {k: strip(v) for k, v in d.items() if k not in DROP_KEYS}
        return d

    for n in range(1, 36):
        i = 'EQ-CE-%03d' % n
        p = cep[i]
        inputs = plain(p['inputs'])
        inputs.update(plain(CE_INPUT_ADD.get(i, {})))
        tolcell = table[i]['tol']
        o = dict(id=i, source=p['source'].replace('; recalled, not verified', '') + ' [recalled, not verified]',
                 status='R', topic=CE_TOPIC[n], statement=CE_STMT.get(i, p['statement']), inputs=inputs,
                 expected=strip(plain(p['answers'])), unit='see expected keys (suffix gives unit)',
                 tol=parse_tol(tolcell), tolNote=tolcell, fn=p['cap'], lane=CE_LANE[n])
        if p['assum']:
            o['assumptions'] = p['assum']
        if i == 'EQ-CE-026':
            o['assertGroups'] = [['K500', 'K700'], ['with_Cp_K500', 'with_Cp_K700']]
        if i == 'EQ-CE-024':
            o['notes'] = 'dT_semenov_approx_K is reported, never asserted against dT_crit_K (16.46 vs 17.98).'
        oracles.append(o)

    # status/topic counts sanity
    ncount = sum(1 for o in oracles if o['id'].startswith('EQ-NC'))
    if ncount != 43 or len(oracles) != 78:
        fail('oracle count %d/%d' % (ncount, len(oracles)))

    # ================= cross-checks =================
    expflat = {o['id']: flat_numbers(o['expected']) + flat_numbers(o.get('book', {})) + flat_numbers(o.get('expectedAlt', {})) for o in oracles}
    tolof = {o['id']: o['tol'].get('rel', 0.0) for o in oracles}
    report = {o['id']: [] for o in oracles}

    # (1) research script printed answers
    KNOWN = {'EQ-NC-026': 'script solves a different problem (starts from 0.5 M HI); corrected per 9.2.1b'}
    for line in nc_out.splitlines():
        m = re.match(r'^(EQ-NC-\d+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(OK|MISMATCH)$', line)
        if not m:
            continue
        i, _, val, _, st = m.groups()
        if i in KNOWN:
            report[i].append('script-print:CORRECTED')
            continue
        if st != 'OK':
            fail('%s: research script itself prints MISMATCH' % i)
        try:
            pv = float(val)
        except ValueError:
            pv = None
        prim = v0[i]
        if pv is None:
            ok = (str(prim) == val)
        else:
            ok = abs(pv - prim) <= 0.5e-5 + 1e-9 * abs(prim)
        if not ok:
            fail('%s: printed %s vs computed %r' % (i, val, prim))
        report[i].append('script-print')
    for line in ce_out.splitlines():
        m = re.match(r'^(EQ-CE-\d+) (.*)$', line)
        if not m:
            continue
        i, body = m.groups()
        body = re.sub(r'"[^"]*"\s*:\s*\d+,?\s*', lambda mm: '' if re.match(r'"(iters|sequential_substitution_iters)"', mm.group(0)) else mm.group(0), body)
        body = re.sub(r'"[^"]*"', '""', body)   # drop key names so digits inside names are not read as values
        toks = numbers_in(body)
        if len(body) >= 200 and toks:
            toks = toks[:-1]  # the script truncates its print at 230 characters
        for t in toks:
            if not any(close(t, v, 1e-4, 1e-9) for v in expflat[i]):
                fail('%s: printed value %g not in exported expected' % (i, t))
        report[i].append('script-print')
    # (2) review_spotcheck.py
    for line in sc_out.splitlines():
        m = re.match(r'^(EQ-(?:NC|CE)-\d+)\s.*?exp\s+(\S+)\s+got\s+(\S+)\s+(OK|MISMATCH)', line)
        if not m:
            continue
        i, e_, g_, st = m.groups()
        got = float(g_)
        if st != 'OK':
            fail('%s: review_spotcheck prints MISMATCH' % i)
        t = max(tolof[i], 1e-3)
        if not any(close(got, v, t) for v in expflat[i]):
            fail('%s: review_spotcheck got %g not within %.3g of any exported value' % (i, got, t))
        if 'spotcheck' not in ''.join(report[i]):
            report[i].append('spotcheck')
    # (3) DESIGN text: every non-trivial number in the expected cell appears in the exported values
    for o in oracles:
        i = o['id']
        cell = table[i]['expected']
        for t in numbers_in(cell):
            s = ('%r' % t)
            if float(t).is_integer() and abs(t) < 100:
                continue
            if t == 0:
                continue
            ok = any(close(t, v, max(2e-3, 0)) for v in expflat[i]) or any(close(t, v, 2e-3) for v in
                                                                         flat_numbers(o['inputs']))
            if not ok:
                WARNINGS.append('%s: DESIGN expected cell has %g, not in exported expected/book/inputs' % (i, t))
    return oracles, report, dict(nc=nc, ce=ce)


# ----------------------------------------------------------------------------- fixtures
def hdr(source, notes, tol, extra=None):
    h = {'generator': GEN, 'source': source, 'design': 'DESIGN 9.2.3', 'tolerance': tol, 'notes': notes}
    if extra:
        h.update(extra)
    return h


def check_rows(name, printed, mine, tol_abs):
    """printed/mine: lists of floats; printed is rounded text from the research script."""
    if len(printed) != len(mine):
        fail('%s: %d printed values vs %d mine' % (name, len(printed), len(mine)))
        return
    for a, b in zip(printed, mine):
        if abs(a - b) > tol_abs:
            fail('%s: printed %g vs computed %g' % (name, a, b))


def build_fixtures():
    out = {}
    lc, lc_out = load('levels_calc.py')
    nb, nb_out = load('levels_calc_n2o4_beds.py')
    T = lc['T']
    Hf, Hmix, so2_bed, nh3_y = lc['H'], lc['Hmix'], lc['so2_bed'], lc['nh3_y']
    lcl = lc_out.splitlines()

    # ---------- haber_grid
    Tc_l, P_l = (380, 400, 420, 450, 500, 550), (25, 50, 100, 150, 200, 300)
    cases = []
    printed = []
    for ln in lcl:
        m = re.match(r'^(380|400|420|450|500|550) 25bar:', ln)
        if m:
            printed += [float(x) for x in re.findall(r'bar:\s*([0-9.]+)', ln)]
    mine = []
    for tc in Tc_l:
        for P in P_l:
            y = T.nh3_eq(tc + 273.15, P)
            cases.append({'T_C': tc, 'P_bar': P, 'y_NH3': y})
            mine.append(100 * y)
    check_rows('haber_grid', printed, mine, 0.0051)
    out['haber_grid'] = dict(hdr('docs/research/levels_calc.py (thermo.nh3_eq)',
                                 'Ideal-gas equilibrium of N2+3H2<=>2NH3, K from thermo.K(R1) (NIST Shomate), no fugacity '
                                 'correction, feed N2:H2 = 1:3 pure. y_NH3 is a mole fraction.', {'rel': 0.002},
                                 {'inputs': {'feed_mol': {'N2': 1.0, 'H2': 3.0}, 'T_C': list(Tc_l), 'P_bar': list(P_l)}}),
                             cases=cases)

    # ---------- haber_inerts
    cases_r, cases_i, pr = [], [], []
    for r in (2.0, 2.5, 3.0, 3.5, 4.0):
        y, x = nh3_y(723.15, 150, 1, r, 0)
        cases_r.append({'H2_per_N2': r, 'feed_mol': {'N2': 1.0, 'H2': r, 'inert': 0.0}, 'y_NH3': y, 'extent_mol': x})
        pr.append(100 * y)
    ci = []
    for inert in (0.0, 0.02, 0.05, 0.10, 0.15):
        tot = 4 / (1 - inert)
        y, x = nh3_y(723.15, 150, 1, 3, tot * inert)
        cases_i.append({'inert_frac_of_feed': inert, 'feed_mol': {'N2': 1.0, 'H2': 3.0, 'inert': tot * inert},
                        'y_NH3': y, 'extent_mol': x})
        ci.append(100 * y)
    pp = []
    for ln in lcl:
        m = re.match(r'^ H2:N2=([0-9.]+) y=([0-9.]+)%', ln)
        if m:
            pp.append(float(m.group(2)))
    pi = [float(m.group(2)) for ln in lcl for m in [re.match(r'^ inerts ([0-9]+)% feed: y=([0-9.]+)%', ln)] if m]
    check_rows('haber_inerts ratio', pp, pr, 0.0051)
    check_rows('haber_inerts inert', pi, ci, 0.0051)
    out['haber_inerts'] = dict(hdr('docs/research/levels_calc.py (nh3_y)',
                                   'Ideal equilibrium at 450 C (723.15 K), 150 bar. ratio cases: N2 = 1, H2 = r, no inert. '
                                   'inert cases: N2:H2 = 1:3 and inert = 4*f/(1-f) mol per mol N2 (f = inert fraction of '
                                   'the fresh feed).', {'rel': 0.002},
                                   {'inputs': {'T_C': 450, 'P_bar': 150}}),
                               ratio_cases=cases_r, inert_cases=cases_i)

    # ---------- sulfur_burner
    def burner(y):
        air = 100 / y
        O2, N2 = 0.21 * air, 0.79 * air
        Hin = 100 * Hf('S', 413.15) + O2 * Hf('O2', 298.15) + N2 * Hf('N2', 298.15)
        o = {'SO2': 100, 'O2': O2 - 100, 'N2': N2}
        Tad = brentq(lambda t: Hmix(o, t) - Hin, 400, 3000)
        Q = Hmix(o, Tad) - Hmix(o, 693.15)
        return dict(y_SO2=y, air_kmol_h=air, O2_per_SO2=(O2 - 100) / 100, T_ad_C=Tad - 273.15,
                    boiler_duty_MW=Q / 3600, steam_t_h=Q / 2361)
    bc, pb = [], []
    for y in (0.06, 0.08, 0.10, 0.11, 0.12, 0.14, 0.16, 0.18):
        bc.append(burner(y))
    for ln in lcl:
        m = re.match(r'^ySO2=.*air=\s*([0-9.]+) kmol/h.*Tad=\s*([0-9.]+) C\s+boilerQ=\s*([0-9.]+) MW\s+steam40bar=\s*([0-9.]+) t/h', ln)
        if m:
            pb.append([float(x) for x in m.groups()])
    if len(pb) != len(bc):
        fail('sulfur_burner printed rows')
    else:
        for row, c in zip(pb, bc):
            for a, b, t in zip(row, (c['air_kmol_h'], c['T_ad_C'], c['boiler_duty_MW'], c['steam_t_h']),
                               (0.051, 0.051, 0.0051, 0.0051)):
                if abs(a - b) > t:
                    fail('sulfur_burner: printed %g vs computed %g' % (a, b))
    out['sulfur_burner'] = dict(hdr('docs/research/levels_calc.py (sulfur burner section; recomputed here with the same code)',
                                    '100 kmol/h liquid S at 140 C (413.15 K) + dry air (21/79) at 25 C burned completely to SO2; '
                                    'adiabatic flame T; boiler cools gas to 420 C (693.15 K); steam = 40 bar saturated from '
                                    'BFW 105 C, dh = 2361 kJ/kg. Enthalpies from thermo.H (NIST Shomate).',
                                    {'abs_T_K': 0.5, 'rel': 0.003},
                                    {'inputs': {'S_kmol_h': 100, 'S_T_C': 140, 'air_T_C': 25, 'air_O2': 0.21, 'air_N2': 0.79,
                                                'gas_out_T_C': 420, 'steam_dh_kJ_kg': 2361}}),
                                cases=bc)

    # ---------- so2_beds and dcda
    P_BED = 1.2
    sweep = []
    for tc in (360, 370, 380, 390, 400, 410, 420, 430, 440):
        to, X = nb['bed'](tc + 273.15)
        sweep.append({'Tin_C': tc, 'Tout_C': to, 'X': X})
    pr = []
    for ln in nb_out.splitlines():
        m = re.match(r'^(\d{3}) -> out ([0-9.]+) C, X ([0-9.]+)$', ln)
        if m:
            pr += [float(m.group(2)), float(m.group(3))]
    check_rows('so2_beds sweep', pr, [v for s in sweep for v in (s['Tout_C'], s['X'])], 0.051)
    stair = []
    for Tin in (410, 420, 430):
        n = {'SO2': 10., 'O2': 11., 'SO3': 0., 'N2': 79.}
        beds = []
        for b in range(1, 5):
            n, to = so2_bed(n, Tin + 273.15)
            beds.append({'bed': b, 'Tout_C': to - 273.15, 'X_cum': n['SO3'] / 10})
        stair.append({'Tin_C': Tin, 'beds': beds})
    ps = []
    for ln in lcl:
        m = re.match(r'^Tin=(\d+)C:', ln)
        if m:
            ps += [float(x) for x in re.findall(r'Tout=([0-9.]+)C X=([0-9.]+)%', ln) for x in x]
    mine = [v for s in stair for b in s['beds'] for v in (b['Tout_C'], 100 * b['X_cum'])]
    check_rows('so2_beds staircase', ps, mine, 0.51)
    out['so2_beds'] = dict(hdr('docs/research/levels_calc_n2o4_beds.py (bed), levels_calc.py (so2_bed)',
                               'Adiabatic equilibrium beds (outlet on the equilibrium curve), SO2 oxidation K from thermo.K(R2h), '
                               'feed 10 SO2 / 11 O2 / 0 SO3 / 79 N2 kmol, %.1f bar. sweep: single bed 1 for inlet 360-440 C. '
                               'staircases: 4 beds, every bed inlet at the stated T (intermediate cooling, no absorption); '
                               'X_cum = cumulative SO3/SO2 fed.' % P_BED,
                               {'abs_T_K': 0.3, 'abs_X': 0.001},
                               {'inputs': {'feed_kmol': {'SO2': 10, 'O2': 11, 'SO3': 0, 'N2': 79}, 'P_bar': P_BED}}),
                           bed1_sweep=sweep, staircases=stair)
    n = {'SO2': 10., 'O2': 11., 'SO3': 0., 'N2': 79.}
    for b in range(3):
        n, to = so2_bed(n, 693.15)
    x3 = n['SO3']
    n['SO3'] *= 0.001
    n, to4 = so2_bed(n, 693.15)
    overall = (x3 + n['SO3'] - x3 * 0.001) / 10
    pd_ = [float(m.group(2)) for ln in lcl for m in [re.match(r'^DCDA 3\+1: after bed3 ([0-9.]+)%, overall ([0-9.]+)%', ln)] if m]
    if not pd_ or abs(100 * overall - pd_[0]) > 0.0051:
        fail('dcda printed overall %s vs %g' % (pd_, 100 * overall))
    out['dcda'] = dict(hdr('docs/research/levels_calc.py (DCDA section; recomputed here with the same code)',
                           'Double-contact: 3 beds (inlet 420 C each), intermediate absorption removes 99.9 %% of the SO3 '
                           'formed, bed 4 at 420 C; feed 10/11/0/79 kmol, %.1f bar.' % P_BED,
                           {'abs_conv_pct': 0.002}, {'inputs': {'Tin_C': 420, 'absorber_removal': 0.999, 'P_bar': P_BED}}),
                       conv_after_bed3=x3 / 10, conv_overall=overall, conv_overall_pct=100 * overall,
                       SO2_left_kmol_per_10_fed=n['SO2'], bed4_Tout_C=to4 - 273.15)

    # ---------- wgs_grid
    wc, pw = [], []
    for tc in (200, 250, 300, 350, 400, 450):
        k = lc['K']('R5', tc + 273.15)
        for s in (1.0, 1.5, 2.0, 3.0, 4.0):
            x = brentq(lambda x: math.log(x * x / ((1 - x) * (s - x))) - math.log(k), 1e-12, 1 - 1e-12)
            dry = (1 - x) + x + x
            wc.append({'T_C': tc, 'S_per_CO': s, 'K': k, 'X_CO': x, 'CO_dry_pct': 100 * (1 - x) / dry})
    for ln in lcl:
        for m in re.finditer(r'X=([0-9.]+) COdry=([0-9.]+)%', ln):
            pw += [float(m.group(1)), float(m.group(2))]
    check_rows('wgs_grid', pw, [v for c in wc for v in (c['X_CO'], c['CO_dry_pct'])], 0.0051)
    out['wgs_grid'] = dict(hdr('docs/research/levels_calc.py (WGS section; recomputed here with the same code)',
                               'Equilibrium CO + H2O <=> CO2 + H2 (dn = 0, P-independent), K from thermo.K(R5); feed 1 mol CO + '
                               'S mol steam, no products. CO_dry_pct = CO/(CO+CO2+H2) in %.', {'rel': 0.005},
                               {'inputs': {'feed_mol': 'CO = 1, H2O = S/CO'}}), cases=wc)

    # ---------- n2o4
    Kp298 = math.exp(-T.rxn('R9', 298.15)[3])
    Kp400 = math.exp(-T.rxn('R9', 400)[3])
    p0 = 0.15 * 0.0831446 * 400
    x = brentq(lambda x: (2 * x) ** 2 / (p0 - x) - Kp400, 1e-9, p0 - 1e-9)
    dH, dS, _, _ = T.rxn('R9', 298.15)
    textbook = {t: math.exp(-(-dH * 1000 - t * (-dS)) / (8.314 * t)) for t in (298.15, 400)}
    pn = [float(v) for ln in nb_out.splitlines() for v in re.findall(r'rigorous=([0-9.]+) bar', ln)]
    check_rows('n2o4 Kp', pn, [Kp298, Kp400], 0.0011)
    mm = re.search(r'rigorous: P=([0-9.]+) bar, alpha=([0-9.]+)', nb_out)
    check_rows('n2o4 P/alpha', [float(mm.group(1)), float(mm.group(2))], [p0 + x, x / p0], 0.0051)
    out['n2o4'] = dict(hdr('docs/research/levels_calc_n2o4_beds.py (thermo R9)',
                           'Rigorous N2O4 <=> 2NO2 from thermo.rxn(R9): Kp(dissociation, bar) at 298.15 K and 400 K; '
                           'alpha and P for 0.15 mol N2O4 in 1 L at 400 K (R = 0.0831446 L bar/(mol K)). '
                           '`textbook` = constant dH/dS from 298.15 K, R = 8.314.',
                           {'rel': 0.003}, {'inputs': {'n0_mol': 0.15, 'V_L': 1.0, 'T_K': 400.0, 'R_L_bar': 0.0831446}}),
                       Kp_298_15_bar=Kp298, Kp_400_bar=Kp400, alpha=x / p0, P_bar=p0 + x, p0_bar=p0,
                       Kc_400_mol_L=Kp400 / (0.0831446 * 400), textbook_Kp_bar={'298.15': textbook[298.15], '400': textbook[400]})

    # ---------- haber_loop (CoolProp)
    try:
        lp, lp_out = load('levels_calc_loop.py')
    except ModuleNotFoundError as e:
        fail('haber_loop needs CoolProp (set PYLIB=<dir>): %s' % e)
        lp = None
    if lp is not None:
        import CoolProp
        fresh = {'N2': 250.0, 'H2': 750.0, 'NH3': 0.0, 'Ar': 3.0}
        loops = []
        pl = {}
        for ln in lp_out.splitlines():
            m = re.match(r'^purge=([0-9.]+) Tsep=\s*([+-]?\d+)C: NH3 prod=\s*([0-9.]+) kmol/h \(\s*([0-9.]+) t/h\) H2 lost=\s*([0-9.]+)% yAr_in=\s*([0-9.]+)% .*loop=(\d+) it=(\d+)', ln)
            if m:
                pl[(float(m.group(1)), int(m.group(2)))] = [float(m.group(i)) for i in (3, 5, 6, 7)]
        for purge in (0.005, 0.01, 0.02, 0.05, 0.10):
            for Tsep in (-20, 0, 20):
                r4 = lp['loop'](fresh, 723.15, 150, Tsep, purge)             # the script's own settings (4000 its max)
                r = lp['loop'](fresh, 723.15, 150, Tsep, purge, it=400000)   # fully converged
                pr_ = pl[(purge, Tsep)]
                mine = [r['liq'], 100 * r['purge']['H2'] / 750, 100 * r['yAr'], r['loopflow']]
                # printed (4000-iteration) values may differ from converged ones only when the script hit its cap
                capped = r4['it'] >= 3999
                tol_ = (0.2, 0.3, 0.3, 5.0) if capped else (0.051, 0.0051, 0.0051, 0.51)
                for a, b, t in zip(pr_, mine, tol_):
                    if abs(a - b) > t:
                        fail('haber_loop purge %g Tsep %d: printed %g vs converged %g' % (purge, Tsep, a, b))
                loops.append({'purge_frac': purge, 'T_sep_C': Tsep, 'NH3_kmol_h': r['liq'],
                              'NH3_t_h': r['liq'] * 17.031 / 1000, 'y_Ar_in': r['yAr'], 'y_NH3_in': r['yNH3in'],
                              'y_NH3_out': r['yNH3out'], 'loop_flow_kmol_h': r['loopflow'],
                              'H2_lost_frac': r['purge']['H2'] / 750, 'iterations_to_converge': r['it'],
                              'script_default_converged': not capped,
                              'psat_NH3_bar': lp['psat'](Tsep)})
        out['haber_loop'] = dict(hdr('docs/research/levels_calc_loop.py',
                                     'Equilibrium converter (ideal gas, K from thermo.K(R1), outlet at equilibrium, approach = 1) at 450 C, '
                                     '150 bar; separator = Raoult-type flash at T_sep, NOT an ideal splitter: NH3 vapour mole fraction '
                                     'y = Psat(T_sep)/P with Psat from CoolProp (ammonia, HEOS), N2/H2/Ar stay entirely in the vapour '
                                     '(no gas solubility, no non-ideality); purge/recycle split on the gas leaving the separator. '
                                     'Fixed-point iteration to 1e-10 (the script caps at 4000 iterations, which is not converged for '
                                     'purge 0.005; this fixture uses the converged value, see script_default_converged). '
                                     'Fresh feed kmol/h: N2 250, H2 750, Ar 3. H2_lost_frac = H2 in purge / H2 fresh.',
                                     {'rel': 0.003},
                                     {'inputs': {'fresh_kmol_h': fresh, 'T_reactor_C': 450, 'P_bar': 150},
                                      'coolprop_version': CoolProp.__version__}),
                                 cases=loops)

    # ---------- kinetics K1 (Temkin-Pyzhev)
    kh, _ = load('kinetics_haber.py')
    k1 = k1_fixture(kh)
    out['kinetics_k1'] = k1
    # ---------- K2 (Eklund)
    ks, _ = load('kinetics_so2.py')
    out['kinetics_k2'] = k2_fixture(ks, nb)
    # ---------- K3 (Vanden Bussche-Froment)
    km, _ = load('kinetics_methanol.py')
    out['kinetics_k3'] = k3_fixture(km)
    # ---------- K7 (jacketed CSTR)
    kc, _ = load('kinetics_cstr_si.py')
    out['kinetics_k7'] = k7_fixture(kc)
    # ---------- K8 (fermentation)
    kf, _ = load('kinetics_ferment.py')
    out['kinetics_k8'] = k8_fixture(kf)
    return out


def k1_fixture(kh):
    import thermo
    y0 = (0.2328, 0.6984, 0.03, 0.0388)
    s = sum(y0)
    y0n = [v / s for v in y0]
    ATM = 1.01325
    pts_idx = (10, 20, 40, 60, 100)  # on the 1e-5 m3 grid of run(): 0.1, 0.2, 0.4, 0.6, 1.0 L per kmol/h

    def profile(P, eta=0.4, rho_b=2200.0):
        vs, Y, n0 = kh['run'](eta=eta, rho_b=rho_b, P=P)
        pts = []
        for i in pts_idx:
            x, Tk = Y[:, i]
            n = n0 + np.array([-x / 2, -1.5 * x, x, 0])
            xe = kh['eq_conv'](Tk, P, n0)
            ne = n0 + np.array([-xe / 2, -1.5 * xe, xe, 0])
            pts.append({'V_cat_L_per_kmol_h': vs[i] * 1e3, 'cat_kg_per_kmol_h': vs[i] * rho_b, 'T_C': Tk - 273.15,
                        'y_NH3': n[2] / n.sum(), 'N2_conv': x / 2 / n0[0], 'y_NH3_eq_at_T': ne[2] / ne.sum()})
        x, Tk = Y[:, -1]
        n = n0 + np.array([-x / 2, -1.5 * x, x, 0])
        return pts, dict(T_C=Tk - 273.15, y_NH3=n[2] / n.sum(), dT_K=Tk - 673.15,
                         dT_per_mol_pct_NH3=(Tk - 673.15) / (100 * n[2] / n.sum() - 3))

    pts_r, end_r = profile(200.0)
    # variant 2: K_a^2 = engine K_R1(T) (bar^-2 -> atm^-2), P converted to atm (DESIGN 4 K1 spec)
    orig_Ka = kh['Ka']
    kh['Ka'] = lambda Tk: math.sqrt(thermo.K('R1', float(Tk)) * ATM ** 2)
    pts_e, end_e = profile(200.0 / ATM)
    kh['Ka'] = orig_Ka
    return dict(hdr('docs/research/kinetics_haber.py',
                    'Adiabatic PFR, Temkin-Pyzhev r = 2 k eta [Ka^2 pN2 (pH2^3/pNH3^2)^alpha - (pNH3^2/pH2^3)^(1-alpha)] kmol NH3/(m3 cat h), '
                    'alpha = 0.5, eta = 0.4, k = 8.849e14 exp(-170560/RT) (R = 8.314), constant-Cp approximation (Cp N2 31, H2 29.5, '
                    'NH3 45 J/mol/K; dH = -46.1 kJ + dCp (T - 298.15)). Catalyst per (kmol/h) of feed: V_cat (m3) and rho_b = 2200 kg/m3. '
                    'variant_research: Ka = Gillespie-Beattie fit, P = 200 (treated as atm, as the script does) - this is the variant '
                    'behind the DESIGN check (reaches 11.7 mol % at 537.8 C, 15.8 K per mol %). variant_engine_K: Ka^2 = thermo.K(R1) '
                    'converted bar^-2 -> atm^-2, P = 200 bar converted to atm - this is the DESIGN K1 spec. A TS engine with full '
                    'thermo (not constant Cp) will differ in T by a few K; the tolerance below is the DESIGN 9.2.3 one, '
                    'any wider tolerance is the director\'s call.',
                    {'rel': 0.01, 'abs_T_K': 0.3},
                    {'inputs': {'T_in_C': 400, 'P_bar': 200, 'feed_mole_frac': {'N2': y0n[0], 'H2': y0n[1], 'NH3': y0n[2], 'inert': y0n[3]},
                                'eta': 0.4, 'rho_b_kg_m3': 2200.0, 'rate_units': 'kmol NH3/(m3_cat h)',
                                'Cp_J_mol_K': {'N2': 31.0, 'H2': 29.5, 'NH3': 45.0, 'inert': 31.0}}}),
                variant_research={'profile': pts_r, 'outlet': end_r},
                variant_engine_K={'profile': pts_e, 'outlet': end_e, 'P_atm': 200.0 / ATM})


def k2_fixture(ks, nb):
    import thermo
    ATM = 1.01325
    Ws_pts = (500, 1000, 2000, 5000, 10000, 20000)
    lo_T = (360, 380, 400, 420, 440, 460, 500, 550)

    def run():
        Ws, Y, yy = ks['pfr'](Wmax=60000.)
        bed = []
        for w in Ws_pts:
            i = int(np.argmin(abs(Ws - w)))
            X, Tk = Y[:, i]
            bed.append({'W_g_s_per_mol': float(Ws[i]), 'X': X, 'T_C': Tk - 273.15, 'X_eq_at_T': ks['eq_X'](Tk, yy, 1.5)})
        X, Tk = Y[:, -1]
        lo = []
        for tc in lo_T:
            _, Y2, _ = ks['pfr'](T0=tc + 273.15, adiabatic=False, Wmax=20000.)
            lo.append({'T_C': tc, 'X': Y2[0, -1], 'X_eq': ks['eq_X'](tc + 273.15, yy, 1.5)})
        return bed, dict(X=X, T_C=Tk - 273.15), lo

    bed_r, end_r, lo_r = run()
    orig_Kp = ks['Kp']
    ks['Kp'] = lambda Tk: thermo.K('R2h', float(Tk)) * ATM ** 0.5   # bar^-1/2 -> atm^-1/2
    bed_e, end_e, lo_e = run()
    ks['Kp'] = orig_Kp
    eq15 = nb['bed'](693.15, P=1.5)
    return dict(hdr('docs/research/kinetics_so2.py',
                    'Adiabatic PFR (bed 1) and isothermal light-off, Eklund r = k sqrt(pSO2/pSO3)(pO2 - (pSO3/(pSO2 Kp))^2) mol SO2/(s g_cat), '
                    'p in atm, k = exp(-97782.22/T - 110 ln(1.8 T) + 912.8), clamp pSO3 >= 0.02 pSO2, W in g_cat per (mol/s) of total feed. '
                    'Energy balance in the script uses constant Cp (SO2 50.5, O2 32.5, SO3 72.0, N2 30.8 J/mol/K) and dH(T) = -98.35 kJ + '
                    'dCp (T - 700). variant_research: Kp = exp(11829.44/T - 11.24) (paper fit). variant_engine_K: Kp = thermo.K(R2h) '
                    '(bar^-1/2 -> atm^-1/2), the DESIGN K2 spec. equilibrium_endpoint_full_thermo: adiabatic equilibrium from 420 C inlet at '
                    '1.5 bar with full thermo (levels_calc_n2o4_beds.bed) for comparison. Light-off at W = 20000 g s/mol. '
                    'Light-off X is meaningful where kinetic-limited; at >= 550 C the script clips at equilibrium.',
                    {'rel': 0.01, 'abs_T_K': 0.3},
                    {'inputs': {'T_in_C': 420, 'P_bar': 1.5, 'P_note': 'script treats 1.5 as atm', 'feed_mole_frac': {'SO2': 0.10, 'O2': 0.11, 'SO3': 0.0, 'N2': 0.79},
                                'clamp_pSO3_over_pSO2': 0.02, 'W_unit': 'g_cat per (mol/s total feed)',
                                'rho_b_note': 'script has rho_b = 500 kg/m3 as an unused argument', 'lightoff_W': 20000.0}}),
                variant_research={'bed1_profile': bed_r, 'bed1_outlet': end_r, 'lightoff': lo_r},
                variant_engine_K={'bed1_profile': bed_e, 'bed1_outlet': end_e, 'lightoff': lo_e},
                equilibrium_endpoint_full_thermo={'T_C': eq15[0], 'X': eq15[1], 'P_bar': 1.5, 'Tin_C': 420})


def k3_fixture(km):
    y0 = {'CO': 0.10, 'CO2': 0.05, 'H2': 0.70, 'H2O': 0.0, 'MeOH': 0.0, 'I': 0.15}
    Ws, Y, n0, keys = km['pfr'](cooled=True, hw=1e6, Wmax=60.)
    xe, ye = km['equilibrium'](523.15, 70., y0)
    pts = []
    for w in (0.6, 1.5, 7.5, 15.0, 60.0):
        i = int(round(w / (60. / 800)))
        xM, xW, Tk = Y[:, i]
        pts.append({'W_kg_s_per_mol': float(Ws[i]), 'x_MeOH': xM, 'x_RWGS': xW, 'T_C': Tk - 273.15,
                    'frac_of_eq': xM / xe[0]})
    return dict(hdr('docs/research/kinetics_methanol.py',
                    'Vanden Bussche-Froment LHHW (Table 2), isothermal (very strong cooling, hw = 1e6) at 250 C, 70 bar, feed mole fractions '
                    'CO 0.10, CO2 0.05, H2 0.70, inert 0.15; W in kg_cat per (mol/s) of feed; extents per mol feed. Equilibria from Graaf '
                    '(log10 K2* = 3066/T - 10.592). K3 is a post-v0.1 stretch rate law (DESIGN 4.4 not-in-v0.1 list).',
                    {'rel': 0.01}, {'inputs': {'T_C': 250, 'P_bar': 70, 'y0': y0, 'rho_b_kg_m3': 1100.0}}),
                profile=pts, equilibrium={'x_MeOH': xe[0], 'x_RWGS': xe[1], 'y_MeOH': ye[keys.index('MeOH')]})


def k7_fixture(kc):
    V, Q, UA = 0.10, 5.0, 10.0
    c = kc['CSTR'](V, Q, UA, Tc=298.15, T0=298.15)
    st = c.states()
    states = [{'T_C': t - 273.15, 'X': c.X(t), 'stable': bool(c.stab(t))} for t in st]
    ign_coolant = kc['crit_T'](V, Q, UA, 'coolant') - 273.15
    ign_both = kc['crit_T'](V, Q, UA) - 273.15
    up = st[-1]
    CAs = kc['CA0'] * (1 - c.X(up))
    frac = 0.3
    s = kc['dynamic'](c, lambda t: UA if t < 0.1 else frac * UA, [CAs, up], tend=1.0)
    Tt, tt = s.y[1], s.t
    drift = {}
    for dT in (5, 10, 20):
        idx = np.where(Tt > up + dT)[0]
        drift['t_plus_%dK_s' % dT] = (tt[idx[0]] - 0.1) * 3600 if len(idx) else None
    c2 = kc['CSTR'](V, Q, frac * UA, Tc=298.15, T0=298.15)
    st2 = c2.states(lo=270, hi=500)
    return dict(hdr('docs/research/kinetics_cstr_si.py',
                    'Jacketed CSTR, propylene oxide hydrolysis, first order: k = 16.96e12 exp(-E/RT) 1/h with E = 75.36 MJ/kmol EXACTLY '
                    '(75.4 moves the unstable state 63.1 -> 63.45 C), dH = -251.2 MJ/kmol (Fogler x3 variant), CA0 = 2.114 kmol/m3, '
                    'rho cp = 3.57 MJ/(m3 K), R = 8.314e-3 MJ/(kmol K). Steady states G(T) = R(T) with G = -dH CA0 Q X, '
                    'X = (V/Q)k/(1+(V/Q)k), R = Q rho cp (T - T0) + UA (T - Tc). ignition_coolant_only: lowest Tc (feed stays 25 C) with a '
                    'low branch (47.4 C). ignition_feed_and_coolant: lowest T0 = Tc (33.1 C). UA drop: from the hot state at t = 0.1 h '
                    'UA falls to 30 % (-70 %), LSODA dynamics (CA, T), time for T to rise 5/10/20 K above the hot state; the new hot steady '
                    'state is ~152 C. Stability test: d(G-R)/dT < 0.',
                    {'abs_T_K': 0.3, 'rel': 0.01},
                    {'inputs': {'V_m3': V, 'Q_m3_h': Q, 'UA_MJ_h_K': UA, 'T0_C': 25.0, 'Tc_C': 25.0, 'CA0_kmol_m3': kc['CA0'],
                                'rho_cp_MJ_m3_K': kc['rCp'], 'dH_MJ_kmol': kc['dH'], 'A_per_h': kc['A'], 'E_MJ_kmol': kc['E']}}),
                steady_states=states, ignition_coolant_only_C=ign_coolant, ignition_feed_and_coolant_C=ign_both,
                ua_drop={'frac': frac, 'from_T_C': up - 273.15, **drift, 'T_after_1h_C': Tt[-1] - 273.15,
                         'new_states_C': [t - 273.15 for t in st2]})


def k8_fixture(kf):
    P = kf['P']
    s = kf['run'](305.15)
    X, S, Pe = s.y
    pts = []
    for h in (0, 6, 12, 18, 22.5, 24, 36, 48, 72):
        i = int(np.argmin(abs(s.t - h)))
        pts.append({'t_h': float(s.t[i]), 'X_g_L': X[i], 'S_g_L': S[i], 'P_g_L': Pe[i]})
    t90 = float(s.t[np.argmax(S < 0.1 * 150)])
    i90 = int(np.argmin(abs(s.t - 22.5)))
    sweep = []
    for tc in (20, 25, 30, 32, 35, 38, 40, 42, 45):
        r = kf['run'](tc + 273.15)
        Xr, Sr, Pr = r.y
        t90r = float(r.t[np.argmax(Sr < 0.1 * 150)]) if (Sr < 15).any() else None
        sweep.append({'T_C': tc, 'f_T': kf['cardinal'](tc + 273.15, P['Tmin'], P['Topt'], P['Tmax']), 't90_h': t90r,
                      'P_final_g_L': Pr[-1], 'S_final_g_L': Sr[-1], 'X_max_g_L': Xr.max()})
    return dict(hdr('docs/research/kinetics_ferment.py',
                    'Batch ethanol fermentation (Luong x Monod/Haldane x cardinal-T), S0 = 150 g/L glucose, X0 = 1 g/L cells, isothermal 32 C '
                    '(305.15 K), LSODA rtol 1e-8; parameters in `params` (mu_max, Ks, Ki, Pm, Yxs, Yps ... are GAME values within literature '
                    'ranges). t90_h = first time glucose < 10 % of S0 (script grid 0.1 h).',
                    {'rel': 0.01}, {'inputs': {'T_C': 32.0, 'S0_g_L': 150.0, 'X0_g_L': 1.0, 'params': P}}),
                trajectory_32C=pts, t90_32C_h=t90, P_at_22_5h_g_L=Pe[i90], temperature_sweep=sweep)


# ----------------------------------------------------------------------------- main
def main():
    oracles, report, _ = build_oracles()
    fixtures = build_fixtures()

    print('%-10s %-17s %-6s %s' % ('id', 'lane', 'status', 'cross-checks'))
    for o in oracles:
        print('%-10s %-17s %-6s %s' % (o['id'], o['lane'], o['status'], ', '.join(report[o['id']]) or 'NONE'))
    for i, r in report.items():
        if not r:
            fail('%s: no cross-check coverage' % i)
    if WARNINGS:
        print('\nDESIGN-text notes (non-fatal, review):')
        for w in WARNINGS:
            print('  ' + w)
    if PROBLEMS:
        print('\nFAILED: %d disagreement(s), nothing written:' % len(PROBLEMS))
        for p in PROBLEMS:
            print('  ' + p)
        sys.exit(1)

    dump(os.path.join(OUT, 'oracles.json'),
         {'generator': GEN, 'source': 'docs/research/oracles_ncert.py, docs/research/oracles_cheme.py (+ DESIGN 9.2.1/9.2.1b)',
          'design': 'DESIGN 9.2', 'count': len(oracles), 'oracles': oracles})
    for name, obj in sorted(fixtures.items()):
        dump(os.path.join(FIX, name + '.json'), obj)
    print('\nwrote src/oracle/oracles.json (%d oracles) and %d fixtures: %s' % (len(oracles), len(fixtures), ', '.join(sorted(fixtures))))


if __name__ == '__main__':
    main()
