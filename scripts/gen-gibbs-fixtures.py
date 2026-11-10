#!/usr/bin/env python3
"""P23 fixtures (DESIGN 9.3): 200 random multi-reaction gas-phase equilibria solved by direct Gibbs minimisation (scipy), independent of
the extent / K(T) solver. Species chemical potentials mu0 = H(T) - T S(T) (absolute, formation basis) come from docs/research/thermo.py
(the same research source the TS data are ported from); the minimisation is over mole numbers n >= 0 subject to the element balance
A n = b, ideal gas, standard pressure 1 bar, then polished by Newton on the KKT conditions (mu_i/RT + lambda . a_i = 0).

Run:  python3 -I scripts/gen-gibbs-fixtures.py        writes src/props/fixtures/gibbs_min.json (deterministic, seed fixed)
"""
import importlib.util, json, math, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, 'docs', 'research')
sys.argv = [sys.argv[0]]
spec = importlib.util.spec_from_file_location('thermo_research', os.path.join(RES, 'thermo.py'))
th = importlib.util.module_from_spec(spec); sys.modules['thermo_research'] = th; spec.loader.exec_module(th)
import re
import numpy as np
from scipy.optimize import minimize, fsolve

R = th.R; P0 = 1e5
ATOMS = {'CH4': {'C': 1, 'H': 4}, 'H2O': {'H': 2, 'O': 1}, 'CO': {'C': 1, 'O': 1}, 'CO2': {'C': 1, 'O': 2}, 'H2': {'H': 2},
         'CH3OH': {'C': 1, 'H': 4, 'O': 1}, 'NO': {'N': 1, 'O': 1}, 'O2': {'O': 2}, 'NO2': {'N': 1, 'O': 2}, 'N2O4': {'N': 2, 'O': 4},
         'N2': {'N2inert': 1},  # inert: its own element so N2 + O2 -> 2NO (not in the reaction set) cannot happen
          'NH3': {'N': 1, 'H': 3}, 'Ar': {'Ar': 1}, 'SO2': {'S': 1, 'O': 2}, 'SO3': {'S': 1, 'O': 3}}
# (name, species, T range K inside the polynomial ranges, P range bar, reactant species that must be present, TS reaction ids)
SYSTEMS = [
    ('smr', ['CH4', 'H2O', 'CO', 'CO2', 'H2'], (650, 1100), (1, 30), ['CH4', 'H2O'], ['R6', 'R5']),
    ('methanol', ['CO', 'CO2', 'H2', 'CH3OH', 'H2O'], (450, 650), (10, 100), ['H2'], ['R4', 'R5']),
    ('reforming3', ['CH4', 'H2O', 'CO', 'CO2', 'H2', 'CH3OH'], (500, 900), (1, 60), ['CH4', 'H2O'], ['R6', 'R5', 'R4']),
    ('noOx', ['NO', 'O2', 'NO2', 'N2O4', 'N2'], (300, 500), (1, 10), ['NO', 'O2'], ['R8', 'R9']),
]

# The game's species data carry dHf298 explicitly and build h(T) = dHf298 + [H_poly(T) - H_poly(298.15)] (src/sim/thermo/species.ts); use the
# same basis here (dHf298 read from the generated catalogue) so the comparison tests the solver, not a 1e-5 offset between thermo bases.
_TXT = open(os.path.join(ROOT, 'src', 'data', 'species.gen.ts')).read()
DHF = {m.group(1): float(m.group(2)) for m in re.finditer(r'id: "([^"]+)",.*?dHf298: ([-0-9.e+]+),', _TXT, re.S)}
def mu0(sp, T):
    h = DHF[sp] + (th.H(sp, T) - th.H(sp, 298.15))   # kJ/mol
    return h * 1000.0 - T * th.S(sp, T)                # J/mol

def solve(species, T, P, n0):
    ns = len(species)
    els = sorted({e for s in species for e in ATOMS[s]})
    A = np.array([[ATOMS[s].get(e, 0) for s in species] for e in els], float)
    b = A @ n0
    mu = np.array([mu0(s, T) for s in species]) / (R * T)
    lp = math.log(P / P0)
    def G(n):
        n = np.maximum(n, 1e-300); nt = n.sum()
        return float(np.sum(n * (mu + np.log(n / nt) + lp)))
    def dG(n):
        n = np.maximum(n, 1e-300); nt = n.sum()
        return mu + np.log(n / nt) + lp
    scale = n0.sum()
    x0 = n0 + 1e-3 * scale
    # project the start onto A n = b
    cons = {'type': 'eq', 'fun': lambda n: (A @ n - b) / scale, 'jac': lambda n: A / scale}
    r = minimize(lambda n: G(n / scale) * 1.0, x0, jac=None, constraints=[cons], bounds=[(1e-15, None)] * ns, method='SLSQP', options={'maxiter': 500, 'ftol': 1e-14})
    n = np.maximum(r.x, 1e-15)
    # KKT polish in (ln n, lambda)
    def kkt(z):
        ln, lam = z[:ns], z[ns:]
        nn = np.exp(ln); nt = nn.sum()
        return np.concatenate([mu + ln - math.log(nt) + lp + A.T @ lam, (A @ nn - b) / scale])
    lam0 = -np.linalg.lstsq(A.T, mu + np.log(n / n.sum()) + lp, rcond=None)[0]
    z, info, ier, _ = fsolve(kkt, np.concatenate([np.log(n), lam0]), xtol=1e-14, full_output=True)
    nn = np.exp(z[:ns]); res = float(np.max(np.abs(kkt(z))))
    return nn, res, G(nn / scale)

def main():
    rng = np.random.default_rng(23)
    cases = []
    while len(cases) < 200:
        name, species, (T0, T1), (P0b, P1b), reactants, rids = SYSTEMS[len(cases) % len(SYSTEMS)]
        T = float(round(rng.uniform(T0, T1), 3)); P = float(round(math.exp(rng.uniform(math.log(P0b), math.log(P1b))), 4)) * 1e5
        n0 = np.array([0.0 if (s not in reactants and rng.random() < 0.5) else math.exp(rng.uniform(math.log(0.05), math.log(5))) for s in species])
        for s in reactants: n0[species.index(s)] = math.exp(rng.uniform(math.log(0.2), math.log(5)))
        try:
            n, res, g = solve(species, T, P, n0)
        except Exception:
            continue
        if res > 1e-9 or not np.all(np.isfinite(n)): continue
        cases.append({'system': name, 'species': species, 'reactions': rids, 'T': T, 'P': P, 'n0': [float(x) for x in n0], 'n': [float(x) for x in n], 'kkt_residual': res,
                      # methanol {R4, R5} with neither CO2 nor H2O in the feed: CO + 2H2 <=> CH3OH needs xi4 = xi5, a line with empty interior in extent space
                      'degenerate': bool(name == 'methanol' and n0[species.index('CO2')] == 0 and n0[species.index('H2O')] == 0)})
    out = {'_generator': 'scripts/gen-gibbs-fixtures.py', 'source': 'docs/research/thermo.py (Shomate/NASA H, S), scipy SLSQP + KKT Newton', 'detail': 'rigorous', 'standard_pressure_Pa': P0, 'cases': cases}
    with open(os.path.join(ROOT, 'src', 'props', 'fixtures', 'gibbs_min.json'), 'w') as f: json.dump(out, f, indent=1, sort_keys=True); f.write('\n')
    print('cases', len(cases), 'max kkt', max(c['kkt_residual'] for c in cases), 'out-of-range warnings', sorted(th.WARN)[:5])
main()
