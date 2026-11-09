#!/usr/bin/env python3
"""EQUILIBRIUM game -- verified thermochemistry + K(T) cross-check.
Run:  python3 thermo.py [JANAF_DIR]   (writes thermo.md next to this file)
Data provenance: see thermo.md.  SH = NIST WebBook Shomate (Chase 1998, NIST-JANAF) fetched 2026-11-09.
NASA = NASA TM-4513 7-coef polynomials as distributed in Cantera nasa_gas.yaml (fetched 2026-11-09).
"""
import math, os, re, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
JANAF_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'janaf')
SH = {'Ar': {'Gas': [[298.0, 6000.0,
                 [20.786, 2.825911e-07, -1.464191e-07, 1.092131e-08, -3.661371e-08, -6.19735, 179.999, 0.0]]]},
 'C2H4': {'Gas': [[298.0, 1200.0, [-6.38788, 184.4019, -112.9718, 28.49593, 0.31554, 48.17332, 163.1568, 52.46694]],
                  [1200.0, 6000.0,
                   [106.5104, 13.7326, -2.628481, 0.174595, -26.14469, -35.36237, 275.0424, 52.46694]]]},
 'C3H8': {},
 'CH4': {'Gas': [[298.0, 1300.0, [-0.703029, 108.4773, -42.52157, 5.862788, 0.678565, -76.84376, 158.7163, -74.8731]],
                 [1300.0, 6000.0, [85.81217, 11.26467, -2.114146, 0.13819, -26.42221, -153.5327, 224.4143, -74.8731]]]},
 'CO': {'Gas': [[298.0, 1300.0, [25.56759, 6.09613, 4.054656, -2.671301, 0.131021, -118.0089, 227.3665, -110.5271]],
                [1300.0, 6000.0, [35.1507, 1.300095, -0.205921, 0.01355, -3.28278, -127.8375, 231.712, -110.5271]]]},
 'CO2': {'Gas': [[298.0, 1200.0, [24.99735, 55.18696, -33.69137, 7.948387, -0.136638, -403.6075, 228.2431, -393.5224]],
                 [1200.0, 6000.0,
                  [58.16639, 2.720074, -0.492289, 0.038844, -6.447293, -425.9186, 263.6125, -393.5224]]]},
 'Cl2': {'Gas': [[298.0, 1000.0, [33.0506, 12.2294, -12.0651, 4.38533, -0.159494, -10.8348, 259.029, 0.0]],
                 [1000.0, 3000.0, [42.6773, -5.00957, 1.904621, -0.165641, -2.09848, -17.2898, 269.84, 0.0]],
                 [3000.0, 6000.0, [-42.5535, 41.6857, -7.12683, 0.387839, 101.144, 132.764, 264.786, 0.0]]]},
 'H2': {'Gas': [[298.0, 1000.0, [33.066178, -11.363417, 11.432816, -2.772874, -0.158558, -9.980797, 172.707974, 0.0]],
                [1000.0, 2500.0, [18.563083, 12.257357, -2.859786, 0.268238, 1.97799, -1.147438, 156.288133, 0.0]],
                [2500.0, 6000.0, [43.41356, -4.293079, 1.272428, -0.096876, -20.533862, -38.515158, 162.081354, 0.0]]]},
 'H2O': {'Gas': [[500.0, 1700.0, [30.092, 6.832514, 6.793435, -2.53448, 0.082139, -250.881, 223.3967, -241.8264]],
                 [1700.0, 6000.0, [41.96426, 8.622053, -1.49978, 0.098119, -11.15764, -272.1797, 219.7809, -241.8264]]],
         'Liquid': [[298.0, 500.0,
                     [-203.606, 1523.29, -3196.413, 2474.455, 3.855326, -256.5478, -488.7163, -285.8304]]]},
 'H2SO4': {'Gas': [[298.0, 1200.0,
                    [47.28924, 190.3314, -148.1299, 43.86631, -0.740016, -758.9525, 301.2961, -735.1288]],
                   [1200.0, 6000.0,
                    [139.2289, 9.513663, -1.795577, 0.118069, -15.61486, -813.0976, 416.1854, -735.1288]]]},
 'HCl': {'Gas': [[298.0, 1200.0, [32.12392, -13.45805, 19.86852, -6.853936, -0.049672, -101.6206, 228.6866, -92.31201]],
                 [1200.0, 6000.0,
                  [31.91923, 3.203184, -0.541539, 0.035925, -3.438525, -108.015, 218.2768, -92.31201]]]},
 'HNO3': {'Gas': [[298.0, 1200.0, [19.63229, 153.9599, -115.8378, 32.87955, -0.249114, -146.8818, 247.7049, -134.306]],
                  [1200.0, 6000.0,
                   [97.45959, 5.429577, -1.029688, 0.06795, -12.29314, -192.4912, 343.8051, -134.306]]]},
 'N2': {'Gas': [[100.0, 500.0, [28.98641, 1.853978, -9.647459, 16.63537, 0.000117, -8.671914, 226.4168, 0.0]],
                [500.0, 2000.0, [19.50583, 19.88705, -8.598535, 1.369784, 0.527601, -4.935202, 212.39, 0.0]],
                [2000.0, 6000.0, [35.51872, 1.128728, -0.196103, 0.014662, -4.55376, -18.97091, 224.981, 0.0]]]},
 'N2O4': {'Gas': [[500.0, 1000.0, [34.05274, 191.9845, -151.0575, 44.3935, -0.158949, -8.893428, 293.7724, 9.078988]],
                  [1000.0, 6000.0, [128.622, 2.524345, -0.520883, 0.03663, -11.55704, -59.22619, 417.0444, 9.078988]]],
          'Liquid': [[298.0, 500.0, [89.16313, 178.9141, 0.929459, 0.0, -0.007107, -54.13217, 263.6757, -19.56401]]]},
 'NH3': {'Gas': [[298.0, 1400.0, [19.99563, 49.77119, -15.37599, 1.921168, 0.189174, -53.30667, 203.8591, -45.89806]],
                 [1400.0, 6000.0,
                  [52.02427, 18.48801, -3.765128, 0.248541, -12.45799, -85.53895, 223.8022, -45.89806]]]},
 'NO': {'Gas': [[298.0, 1200.0, [23.83491, 12.58878, -1.139011, -1.497459, 0.214194, 83.35783, 237.1219, 90.29114]],
                [1200.0, 6000.0, [35.99169, 0.95717, -0.148032, 0.009974, -3.004088, 73.10787, 246.1619, 90.29114]]]},
 'NO2': {'Gas': [[298.0, 1200.0, [16.10857, 75.89525, -54.3874, 14.30777, 0.239423, 26.17464, 240.5386, 33.09502]],
                 [1200.0, 6000.0, [56.82541, 0.738053, -0.144721, 0.009777, -5.459911, 2.846456, 290.5056, 33.09502]]]},
 'NaCl': {'Gas': [[2500.0, 6000.0,
                   [37.29885, 0.792454, -0.027018, 0.002313, -0.157114, -193.1004, 273.8077, -181.4182]]],
          'Liquid': [[1074.0, 2500.0, [-42.4478, 113.526, -43.6466, 5.89663, 39.1386, -305.561, 91.0639, -385.923]]],
          'Solid': [[298.0, 1073.0,
                     [50.72389, 6.672267, -2.517167, 10.15934, -0.200675, -427.2115, 130.3973, -411.1203]]]},
 'NaOH': {'Gas': [[2500.0, 6000.0,
                   [49.46492, 7.000125, -1.391757, 0.095206, -0.256928, -213.6706, 284.8609, -197.7572]]],
          'Liquid': [[596.0, 2500.0,
                      [88.34725, -2.495103, -3.013028, 0.862607, 0.042216, -442.935, 183.932, -416.8783]]],
          'Solid': [[298.0, 572.0,
                     [419.4837, -1717.754, 2953.573, -1597.221, -6.046884, -517.8662, 933.0738, -425.9312]],
                    [572.0, 596.0, [86.02304, 0.0, 0.0, 0.0, 0.0, -448.8512, 169.6281, -425.9312]]]},
 'O2': {'Gas': [[100.0, 700.0, [31.32234, -20.23531, 57.86644, -36.50624, -0.007374, -8.903471, 246.7945, 0.0]],
                [700.0, 2000.0, [30.03235, 8.772972, -3.988133, 0.788313, -0.741599, -11.32468, 236.1663, 0.0]],
                [2000.0, 6000.0, [20.91111, 10.72071, -2.020498, 0.146449, 9.245722, 5.337651, 237.6185, 0.0]]]},
 'S': {'Gas': [[882.117, 1400.0, [27.45968, -13.32784, 10.06574, -2.662381, -0.055851, 269.1149, 204.2955, 276.9804]],
               [1400.0, 6000.0, [16.55345, 2.400266, -0.25576, 0.005821, 3.564793, 278.4356, 194.5447, 276.9804]]],
       'Liquid': [[388.36, 432.0, [-4540.97, 26065.6, -55520.7, 42012.2, 54.5886, 787.807, -10826.3, 1.853781]],
                  [432.0, 882.117, [-37.9335, 133.242, -95.3245, 24.0094, 7.65453, 29.7881, -13.1534, 1.853781]]],
       'Solid': [[298.0, 388.36, [21.21978, 3.865858, 22.27461, -10.31908, -0.122518, -7.085604, 54.99575, 0.0]],
                 [298.0, 388.36, [24.23749, -4.98306, 33.009, -15.29616, -0.182237, -7.516263, 61.49141, 0.360001]]]},
 'SO2': {'Gas': [[298.0, 1200.0, [21.43049, 74.35094, -57.75217, 16.35534, 0.086731, -305.7688, 254.8872, -296.8422]],
                 [1200.0, 6000.0, [57.48188, 1.009328, -0.07629, 0.005174, -4.045401, -324.414, 302.7798, -296.8422]]]},
 'SO3': {'Gas': [[298.0, 1200.0, [24.02503, 119.4607, -94.38686, 26.96237, -0.117517, -407.8526, 253.5186, -395.7654]],
                 [1200.0, 6000.0, [81.99008, 0.622236, -0.12244, 0.008294, -6.703688, -437.659, 330.9264, -395.7654]]]}}
NASA = {'C2H5OH': {'T': [200.0, 1000.0, 6000.0],
            'c': [[4.85868178, -0.0037400674, 6.95550267e-05, -8.86541147e-08, 3.5168443e-11, -29996.1309, 4.80192294],
                  [6.5628977, 0.0152034264, -5.38922247e-06, 8.62150224e-10, -5.12824683e-14, -31525.7984,
                   -9.47557644]],
            'note': 'L 8/88'},
 'C3H8': {'T': [200.0, 1000.0, 6000.0],
          'c': [[4.2110262, 0.00171599803, 7.06183472e-05, -9.19594116e-08, 3.64421372e-11, -14381.2106, 5.60930491],
                [6.66789363, 0.0206120214, -7.36553027e-06, 1.18440761e-09, -7.0695321e-14, -16274.8521, -13.1859503]],
          'note': 'L 6/90'},
 'CH3OH': {'T': [200.0, 1000.0, 6000.0],
           'c': [[5.71539582, -0.0152309129, 6.52441155e-05, -7.10806889e-08, 2.61352698e-11, -25642.7656, -1.50409823],
                 [3.60134486, 0.0102430954, -3.59985517e-06, 5.72505986e-10, -3.3911764e-14, -25997.191, 4.70512253]],
           'note': 'L 8/88'},
 'CH3OH_GRI': {'T': [200.0, 1000.0, 3500.0],
               'c': [[5.71539582, -0.0152309129, 6.52441155e-05, -7.10806889e-08, 2.61352698e-11, -25642.7656,
                      -1.50409823],
                     [1.78970791, 0.0140938292, -6.36500835e-06, 1.38171085e-09, -1.1706022e-13, -25374.8747,
                      14.5023623]],
               'note': 'L8/88'},
 'CH4': {'T': [200.0, 1000.0, 6000.0],
         'c': [[5.14987613, -0.0136709788, 4.91800599e-05, -4.84743026e-08, 1.66693956e-11, -10246.6476, -4.64130376],
               [1.63552643, 0.0100842795, -3.36916254e-06, 5.34958667e-10, -3.15518833e-14, -10005.6455, 9.99313326]],
         'note': 'L 8/88'},
 'CO': {'T': [200.0, 1000.0, 6000.0],
        'c': [[3.57953347, -0.00061035368, 1.01681433e-06, 9.07005884e-10, -9.04424499e-13, -14344.086, 3.50840928],
              [3.04848583, 0.00135172818, -4.85794075e-07, 7.88536486e-11, -4.69807489e-15, -14266.1171, 6.0170979]],
        'note': 'TPIS79'},
 'CO2': {'T': [200.0, 1000.0, 6000.0],
         'c': [[2.35677352, 0.00898459677, -7.12356269e-06, 2.45919022e-09, -1.43699548e-13, -48371.9697, 9.90105222],
               [4.63659493, 0.00274131991, -9.95828531e-07, 1.60373011e-10, -9.16103468e-15, -49024.9341, -1.93534855]],
         'note': 'L 7/88'},
 'H2': {'T': [200.0, 1000.0, 6000.0],
        'c': [[2.34433112, 0.00798052075, -1.9478151e-05, 2.01572094e-08, -7.37611761e-12, -917.935173, 0.683010238],
              [2.93286579, 0.000826607967, -1.46402335e-07, 1.54100359e-11, -6.88804432e-16, -813.065597, -1.02432887]],
        'note': 'TPIS78'},
 'H2O': {'T': [200.0, 1000.0, 6000.0],
         'c': [[4.19864056, -0.0020364341, 6.52040211e-06, -5.48797062e-09, 1.77197817e-12, -30293.7267, -0.849032208],
               [2.67703787, 0.00297318329, -7.7376969e-07, 9.44336689e-11, -4.26900959e-15, -29885.8938, 6.88255571]],
         'note': 'L 8/89'},
 'HNO3': {'T': [200.0, 1000.0, 6000.0],
          'c': [[1.74492946, 0.0188040888, -8.15963597e-06, -5.78584532e-09, 4.43768083e-12, -17380.5296, 16.9545524],
                [8.00379234, 0.00449837533, -1.73648758e-06, 2.93685555e-10, -1.81478673e-14, -19256.3022,
                 -16.0985546]],
          'note': 'L 4/90'},
 'N2': {'T': [200.0, 1000.0, 6000.0],
        'c': [[3.53100528, -0.000123660987, -5.02999437e-07, 2.43530612e-09, -1.40881235e-12, -1046.97628, 2.96747468],
              [2.95257626, 0.00139690057, -4.92631691e-07, 7.86010367e-11, -4.60755321e-15, -923.948645, 5.87189252]],
        'note': 'TPIS78'},
 'N2O4': {'T': [200.0, 1000.0, 6000.0],
          'c': [[3.02002308, 0.0295904321, -3.01342458e-05, 1.42360407e-08, -2.44100049e-12, -640.040162, 11.8059606],
                [11.5752899, 0.00401616086, -1.57178323e-06, 2.68274309e-10, -1.66922019e-14, -2921.91226,
                 -31.9488439]],
          'note': 'TPIS89'},
 'NH3': {'T': [200.0, 1000.0, 6000.0],
         'c': [[4.30177808, -0.0047712733, 2.19341619e-05, -2.29856489e-08, 8.28992268e-12, -6748.06394, -0.690644393],
               [2.71709692, 0.00556856338, -1.76886396e-06, 2.6741726e-10, -1.52731419e-14, -6584.51989, 6.09289837]],
         'note': 'TPIS89'},
 'NO2': {'T': [200.0, 1000.0, 6000.0],
         'c': [[3.94403907, -0.00158547444, 1.66578984e-05, -2.04754478e-08, 7.83503265e-12, 2896.59865, 6.31196225],
               [4.88474429, 0.00217241639, -8.2807902e-07, 1.57477293e-10, -1.05110549e-14, 2316.48462, -0.117357075]],
         'note': 'L 7/88'},
 'O2': {'T': [200.0, 1000.0, 6000.0],
        'c': [[3.78245636, -0.00299673415, 9.847302e-06, -9.68129508e-09, 3.24372836e-12, -1063.94356, 3.65767573],
              [3.66096083, 0.000656365523, -1.41149485e-07, 2.05797658e-11, -1.29913248e-15, -1215.97725, 3.41536184]],
        'note': 'TPIS89'},
 'SO2': {'T': [300.0, 1000.0, 5000.0],
         'c': [[3.2665338, 0.0053237902, 6.8437552e-07, -5.2810047e-09, 2.5590454e-12, -36908.148, 9.66465108],
               [5.2451364, 0.0019704204, -8.0375769e-07, 1.5149969e-10, -1.0558004e-14, -37558.227, -1.07404892]],
         'note': 'J 6/61'},
 'SO3': {'T': [300.0, 1000.0, 5000.0],
         'c': [[2.5780385, 0.014556335, -9.1764173e-06, -7.9203022e-10, 1.9709473e-12, -48931.753, 12.2651384],
               [7.0757376, 0.0031763387, -1.353576e-06, 2.5630912e-10, -1.7936044e-14, -50211.376, -11.1875176]],
         'note': 'J 9/65'}}

# ----------------------------------------------------------------------------
# Core evaluators
# ----------------------------------------------------------------------------
R = 8.314462618          # J/mol/K (CODATA 2018/2019 exact)
T0 = 298.15
ATM = 1.01325            # bar per atm
WARN = set()

def shomate(c, T):
    A,B,C,D,E,F,G,H = c
    t = T/1000.0
    cp = A + B*t + C*t**2 + D*t**3 + E/t**2
    h = A*t + B*t**2/2 + C*t**3/3 + D*t**4/4 - E/t + F      # kJ/mol, absolute (== H_rel + dHf298)
    s = A*math.log(t) + B*t + C*t**2/2 + D*t**3/3 - E/(2*t**2) + G
    return cp, h, s

def nasa7(c, T):
    a1,a2,a3,a4,a5,a6,a7 = c
    cp = R*(a1 + a2*T + a3*T**2 + a4*T**3 + a5*T**4)
    h = R*T*(a1 + a2*T/2 + a3*T**2/3 + a4*T**3/4 + a5*T**4/5 + a6/T)/1000.0
    s = R*(a1*math.log(T) + a2*T + a3*T**2/2 + a4*T**3/3 + a5*T**4/4 + a7)
    return cp, h, s

def constcp(c, T):
    H298, S298, Cp = c
    return Cp, H298 + Cp*(T-T0)/1000.0, S298 + Cp*math.log(T/T0)

def nodes(c, T):
    # tabulated (JANAF) nodes only
    for k,(cp,h,s) in c.items():
        if abs(k-T) < 1e-6: return cp,h,s
    raise ValueError("JANAF node-only species evaluated off-node T=%s" % T)

KIND = {'sh': shomate, 'na': nasa7, 'cc': constcp, 'nd': nodes}

def S_(name, ph, lo=None, hi=None):
    """Shomate segments from NIST for species `name`, phase ph."""
    return [('sh', a, b, c) for a,b,c in SH[name][ph]]

def N_(key, lo, hi, which):
    t = NASA[key]
    return [('na', lo, hi, t['c'][which])]

SP = {}   # key -> list of segments (kind, Tlo, Thi, coef)
SP['N2']   = S_('N2','Gas');  SP['H2'] = S_('H2','Gas'); SP['O2'] = S_('O2','Gas'); SP['Ar'] = S_('Ar','Gas')
SP['CH4']  = S_('CH4','Gas'); SP['NH3'] = S_('NH3','Gas'); SP['CO'] = S_('CO','Gas'); SP['CO2'] = S_('CO2','Gas')
SP['SO2']  = S_('SO2','Gas'); SP['SO3'] = S_('SO3','Gas'); SP['NO'] = S_('NO','Gas'); SP['NO2'] = S_('NO2','Gas')
SP['HNO3'] = S_('HNO3','Gas'); SP['H2SO4g'] = S_('H2SO4','Gas'); SP['Cl2'] = S_('Cl2','Gas'); SP['HCl'] = S_('HCl','Gas')
SP['C2H4'] = S_('C2H4','Gas')
# NIST Shomate for H2O(g) and N2O4(g) start at 500 K -> use NASA TM-4513 7-coef below 500 K
SP['H2O']  = N_('H2O',200,500,0) + S_('H2O','Gas')
SP['N2O4'] = S_('N2O4','Gas')   # low-T part (298.15-500 K) is fitted to NIST-JANAF table N-032 in _install_fits()
# no NIST Shomate: NASA TM-4513 (McBride/Gordon/Reno 1993; Lawrence-Livermore/Burcat-lineage fits)
SP['CH3OH'] = [('na',200,1000,NASA['CH3OH']['c'][0]), ('na',1000,6000,NASA['CH3OH']['c'][1])]
SP['C2H5OH']= [('na',200,1000,NASA['C2H5OH']['c'][0]), ('na',1000,6000,NASA['C2H5OH']['c'][1])]
SP['C3H8']  = [('na',200,1000,NASA['C3H8']['c'][0]), ('na',1000,6000,NASA['C3H8']['c'][1])]
# liquids / solids
SP['H2Ol'] = S_('H2O','Liquid')            # NIST: 298-500 K (physically liquid at 1 bar only to 373.15 K)
SP['NaCl'] = S_('NaCl','Solid'); SP['NaOH'] = S_('NaOH','Solid')
# sulfur: rhombic (col 1), monoclinic (col 2), liquid; NIST lists both solid columns as "298-388.36"
_sol = SH['S']['Solid']
SP['S'] = [('sh',298.0,368.3,_sol[0][2]), ('sh',368.3,388.36,_sol[1][2])] + S_('S','Liquid')
SP['S_rh'] = [('sh',298.0,368.3,_sol[0][2])]
SP['S_l']  = S_('S','Liquid')
# constant-Cp condensed species (H298, S298, Cp) -- see sources in thermo.md
SP['H2SO4l']  = [('cc',250,700,(-813.99, 156.90, 138.9))]       # CRC/Atkins
SP['HNO3l']   = [('cc',250,356,(-174.1, 155.6, 109.87))]         # CRC (Cp UNVERIFIED recall)
SP['CH3OHl']  = [('cc',250,337,(-239.5, 127.19, 81.1))]          # NIST WebBook condensed-phase
SP['C2H5OHl'] = [('cc',250,351,(-276.9, 159.86, 112.4))]         # NIST WebBook (dHf derived from dcH)
SP['C6H12O6'] = [('cc',250,400,(-1273.3, 209.19, 219.19))]       # alpha-D-glucose: NIST S, Cp; dHf CRC-like

def props(key, T, strict=False):
    segs = SP[key]
    for kind, lo, hi, c in segs:
        if lo - 0.2 <= T <= hi + 1e-9:
            return KIND[kind](c, T)
    # out of range: use nearest segment & warn
    WARN.add((key, round(T,1)))
    seg = min(segs, key=lambda s: min(abs(T-s[1]), abs(T-s[2])))
    return KIND[seg[0]](seg[3], T)

def Cp(k,T): return props(k,T)[0]
def H(k,T):  return props(k,T)[1]
def S(k,T):  return props(k,T)[2]

def _install_sulfur_gas():
    _install_fits()
    pass


def _install_fits():
    """N2O4(g): NIST Shomate only 500-1000 K. Fit a Shomate form (E=0) to JANAF table N-032 Cp nodes 298.15-600 K,
    anchored to JANAF dHf298 and S298. (NASA TM-4513 N2O4 differs from JANAF by 2 kJ/mol in dHf, so not used.)"""
    jt = janaf('N-032')
    Ts = [298.15, 300.0, 400.0, 500.0, 600.0]
    t = np.array(Ts)/1000.0
    X = np.vstack([np.ones_like(t), t, t**2, t**3]).T
    y = np.array([jt[T]['cp'] for T in Ts])
    A,B,C,D = np.linalg.lstsq(X, y, rcond=None)[0]
    t0 = T0/1000.0
    h0 = jt[298.15]['dfH']; s0 = jt[298.15]['S']
    F = h0 - (A*t0 + B*t0**2/2 + C*t0**3/3 + D*t0**4/4)
    G = s0 - (A*math.log(t0) + B*t0 + C*t0**2/2 + D*t0**3/3)
    SP['N2O4'] = [('sh', 298.0, 500.0, [A,B,C,D,0.0,F,G,h0])] + SP['N2O4']
    FITS['N2O4'] = [A,B,C,D,0.0,F,G,h0]
FITS = {}

# ----------------------------------------------------------------------------
# NIST-JANAF numeric tables (https://janaf.nist.gov/tables/<id>.html), used as independent check
# ----------------------------------------------------------------------------
JANAF_IDS = {'N2':'N-023','H2':'H-050','O2':'O-029','CO':'C-093','CO2':'C-095','CH4':'C-067','NH3':'H-083',
             'H2O':'H-064','H2Ol':'H-063','SO2':'O-034','SO3':'O-058','NO':'N-005','NO2':'N-007','N2O4':'N-032',
             'C2H4':'C-128','HNO3':'H-030','S':'S-001'}
_JC = {}
def janaf(tid):
    if tid in _JC: return _JC[tid]
    path = os.path.join(JANAF_DIR, tid + '.html')
    txt = open(path, errors='ignore').read()
    out = {}
    for row in re.findall(r'<TR[^>]*>(.*?)</TR>', txt, re.S):
        c = [re.sub(r'<[^>]+>', '', x).replace('&nbsp;', '').strip() for x in re.findall(r'<T[DH][^>]*>(.*?)</T[DH]>', row, re.S)]
        c = [x for x in c if x != '']
        if len(c) < 7: continue
        try: v = [float(x) for x in c[:8]]
        except ValueError:
            try:
                v = [float(x) if x not in ('INFINITE',) else float('nan') for x in c[:8]]
            except ValueError: continue
        if len(v) < 8: continue
        T = v[0]
        if T in out: continue            # keep first occurrence at transition temperatures
        out[T] = dict(cp=v[1], S=v[2], dH=v[4], dfH=v[5], dfG=v[6], logKf=v[7])
    _JC[tid] = out
    return out

def janaf_logK(nus, T):
    """log10 K from JANAF log Kf sums; exact nodes else quadratic interpolation in 1/T on 3 nearest nodes."""
    if any(k not in JANAF_IDS for k in nus): return None, 'n/a'
    nodesT = sorted(set.intersection(*[set(t for t in janaf(JANAF_IDS[k]) if 290 < t <= 1000) for k in nus]))
    def at(Tn): return sum(nu*janaf(JANAF_IDS[k])[Tn]['logKf'] for k,nu in nus.items())
    if T in nodesT: return at(T), 'node'
    near = sorted(nodesT, key=lambda x: abs(x-T))[:3]
    xs = [1/x for x in near]; ys = [at(x) for x in near]
    co = np.polyfit(xs, ys, 2)
    return float(np.polyval(co, 1/T)), 'interp'

# ----------------------------------------------------------------------------
# Reactions (stoichiometric coeffs: products +, reactants -)
# ----------------------------------------------------------------------------
RX = {
 'R1':  ('N2 + 3H2 <=> 2NH3',                {'N2':-1,'H2':-3,'NH3':2}),
 'R2':  ('2SO2 + O2 <=> 2SO3',               {'SO2':-2,'O2':-1,'SO3':2}),
 'R2h': ('SO2 + 1/2 O2 <=> SO3',             {'SO2':-1,'O2':-0.5,'SO3':1}),
 'R3':  ('CO + 2H2 <=> CH3OH(g)',            {'CO':-1,'H2':-2,'CH3OH':1}),
 'R4':  ('CO2 + 3H2 <=> CH3OH(g) + H2O(g)',  {'CO2':-1,'H2':-3,'CH3OH':1,'H2O':1}),
 'R5':  ('CO + H2O(g) <=> CO2 + H2',         {'CO':-1,'H2O':-1,'CO2':1,'H2':1}),
 'R6':  ('CH4 + H2O(g) <=> CO + 3H2',        {'CH4':-1,'H2O':-1,'CO':1,'H2':3}),
 'R7':  ('4NH3 + 5O2 -> 4NO + 6H2O(g)',      {'NH3':-4,'O2':-5,'NO':4,'H2O':6}),
 'R8':  ('2NO + O2 <=> 2NO2',                {'NO':-2,'O2':-1,'NO2':2}),
 'R9':  ('2NO2 <=> N2O4',                    {'NO2':-2,'N2O4':1}),
 'R10': ('S(s/l) + O2 -> SO2',               {'S':-1,'O2':-1,'SO2':1}),
 'R11': ('SO3(g) + H2O(l) -> H2SO4(l)',      {'SO3':-1,'H2Ol':-1,'H2SO4l':1}),
 'R12': ('C6H12O6(s) -> 2C2H5OH(l) + 2CO2(g)', {'C6H12O6':-1,'C2H5OHl':2,'CO2':2}),
 'R13': ('CH4 + 2O2 -> CO2 + 2H2O(g)',       {'CH4':-1,'O2':-2,'CO2':1,'H2O':2}),
}
TLIST = [298.15, 400, 500, 600, 673, 700, 723, 773, 800, 900, 1000]

def rxn(r, T, src='sh'):
    nus = RX[r][1]
    dH = sum(nu*H(k,T) for k,nu in nus.items())                  # kJ/mol
    dS = sum(nu*S(k,T) for k,nu in nus.items())                  # J/mol/K
    dG = dH - T*dS/1000.0
    lnK = -dG*1000.0/(R*T)
    return dH, dS, dG, lnK

def K(r, T): return math.exp(rxn(r,T)[3])
def dn(r): return sum(RX[r][1].values())

def nasa_rxn(r, T):
    """Same reaction using NASA TM-4513 polynomials wherever available (NO -> Shomate)."""
    nus = RX[r][1]
    avail = set(NASA.keys())
    mapk = {'CH3OH':'CH3OH','H2O':'H2O','N2':'N2','H2':'H2','O2':'O2','CH4':'CH4','NH3':'NH3','CO':'CO','CO2':'CO2',
            'SO2':'SO2','SO3':'SO3','NO2':'NO2','N2O4':'N2O4','C2H5OH':'C2H5OH','C3H8':'C3H8','HNO3':'HNO3'}
    dH = dS = 0.0
    for k,nu in nus.items():
        if k in mapk:
            t = NASA[mapk[k]]; Tr = t['T']
            c = t['c'][0] if T <= Tr[1] else t['c'][1]
            _,h,s = nasa7(c, T)
        else:
            _,h,s = props(k,T)
        dH += nu*h; dS += nu*s
    dG = dH - T*dS/1000
    return dH, dS, dG, -dG*1000/(R*T)

def vant_hoff_K(r, T):
    """textbook: constant dH298, dS298 -> lnK = -(dH - T dS)/RT"""
    dH, dS, dG, _ = rxn(r, T0)
    return math.exp(-(dH*1000 - T*dS)/(R*T))

# ----------------------------------------------------------------------------
# Literature K(T) expressions.  All return dimensionless K(1 bar std. state) unless noted
# ----------------------------------------------------------------------------
HABER_WIKI = {573.15:4.34e-3, 673.15:16.4e-5, 723.15:4.51e-5, 773.15:1.45e-5, 823.15:0.538e-5, 873.15:0.225e-5}  # atm^-2 ; K = p_NH3^2/(p_N2 p_H2^3)
def gb_haber(T):    # Gillespie-Beattie 1930 fit for 1/2N2+3/2H2=NH3, atm^-1  (UNVERIFIED recall; self-consistent with Wikipedia table)
    lg = -2.691122*math.log10(T) - 5.519265e-5*T + 1.848863e-7*T**2 + 2001.6/T + 2.6899
    return (10**lg)**2 / ATM**2          # -> N2+3H2=2NH3 in bar^-2
def graaf_K1(T): return 10**(5139/T - 12.621)            # bar^-2  CO+2H2=CH3OH  (verified via UPB Sci Bull 77(4) 2015 quoting Graaf 1986)
def graaf_K2rev(T): return 10**(-2073/T + 2.029)         # CO2+H2=CO+H2O (reverse WGS)
def graaf_K3(T): return graaf_K1(T)*graaf_K2rev(T)       # CO2+3H2=CH3OH+H2O = 10^(3066/T-10.592)
def moe_wgs(T): return math.exp(-4.33 + 4577.8/T)        # Moe 1962 (via Wikipedia WGS article) 600-1200 K
def callaghan_wgs(T): return 10**(-2.4198 + 0.0003855*T + 2180.6/T)  # Callaghan 2006 (via Wikipedia) 600-2000 K
def xf_smr(T): return math.exp(-26830/T + 30.114)        # bar^2 Xu-Froment 1989 K_I (via IJHE 42 (2017) 2889 appendix)
def so2_pf(T): return (10**(4956/T - 4.678))/math.sqrt(ATM)   # SO2+1/2O2=SO3, atm^-1/2 -> bar^-1/2 (physicsforums thread; weak source)

# ----------------------------------------------------------------------------
# Non-ideality: SRK EOS (Graboski-Daubert alpha for H2), indicative only
# ----------------------------------------------------------------------------
EOS = {'N2':(126.192,33.958e5,0.0372),'H2':(33.145,12.964e5,-0.219),'NH3':(405.56,113.634e5,0.2557)}  # CoolProp 6.x reference EOS
def srk_ab(sp, T):
    Tc,Pc,w = EOS[sp]
    Tr = T/Tc
    if sp=='H2': al = 1.202*math.exp(-0.30288*Tr)
    else:
        m = 0.480+1.574*w-0.176*w*w; al = (1+m*(1-math.sqrt(Tr)))**2
    a = 0.42748*R*R*Tc*Tc/Pc*al; b = 0.08664*R*Tc/Pc
    return a,b
def lnphi(y, T, P):     # y dict, P in Pa
    sp = list(y)
    ab = {s:srk_ab(s,T) for s in sp}
    kij = 0.0
    aij = {(i,j):math.sqrt(ab[i][0]*ab[j][0])*(1-kij) for i in sp for j in sp}
    a = sum(y[i]*y[j]*aij[(i,j)] for i in sp for j in sp); b = sum(y[i]*ab[i][1] for i in sp)
    A = a*P/(R*T)**2; B = b*P/(R*T)
    co = [1, -1, A-B-B*B, -A*B]
    z = [x.real for x in np.roots(co) if abs(x.imag)<1e-9 and x.real>B]
    Z = max(z)
    out = {}
    for i in sp:
        s2 = sum(y[j]*aij[(i,j)] for j in sp)
        out[i] = ab[i][1]/b*(Z-1) - math.log(Z-B) - A/B*(2*s2/a - ab[i][1]/b)*math.log(1+B/Z)
    return out

def nh3_eq(T, Pbar, real=False):
    K1 = K('R1', T)
    def f(x):          # x = extent per mol N2 (feed 1 N2 : 3 H2)
        n = {'N2':1-x,'H2':3-3*x,'NH3':2*x}; nt = sum(n.values()); y = {k:v/nt for k,v in n.items()}
        if real:
            lp = lnphi(y, T, Pbar*1e5); Kphi = math.exp(2*lp['NH3'] - lp['N2'] - 3*lp['H2'])
        else: Kphi = 1.0
        Ky = y['NH3']**2/(y['N2']*y['H2']**3)
        return math.log(Ky*Kphi/(K1*Pbar**2)), y['NH3']
    lo, hi = 1e-9, 1-1e-9
    for _ in range(200):
        mid = 0.5*(lo+hi); v,_y = f(mid)
        if v > 0: hi = mid
        else: lo = mid
    return f(0.5*(lo+hi))[1]

def so2_conv(T, Kp, y0=(0.08,0.11,0.81), P=1.0):
    s0,o0,n0 = y0
    def g(x):
        nt = 1 - 0.5*s0*x           # per mol feed, per-SO2 reaction removes 0.5 mol
        pS = s0*(1-x)/nt*P; pO = (o0-0.5*s0*x)/nt*P; pT = s0*x/nt*P
        return math.log(pT/(pS*math.sqrt(pO))) - math.log(Kp)
    lo,hi = 0.0, 1-1e-12
    for _ in range(200):
        mid = 0.5*(lo+hi)
        if g(mid) > 0: hi = mid
        else: lo = mid
    return 0.5*(lo+hi)

_install_sulfur_gas()

# ----------------------------------------------------------------------------
# Species metadata
# ----------------------------------------------------------------------------
AW = {'H':1.008,'C':12.011,'N':14.007,'O':15.999,'S':32.06,'Cl':35.45,'Na':22.990,'Ar':39.95}  # IUPAC 2021 conventional (abridged) atomic weights
def mw(f): return sum(AW[a]*n for a,n in f.items())
SEL = {'H':130.680/2,'N':191.609/2,'O':205.152/2,'Cl':223.081/2,'C':5.740,'S':32.054,'Na':51.30,'Ar':154.846}  # CODATA element S (per atom, std state)

# key: (label, formula dict, phase, NIST-quoted dHf, quoted S298, Tb/K, (Tc,Pc_bar,omega), flags)
M = [
 ('N2','N2',{'N':2},'g','0 (element)','191.61',77.355,(126.192,33.958,0.0372),'CP'),
 ('H2','H2',{'H':2},'g','0 (element)','130.68',20.369,(33.145,12.964,-0.219),'CP'),
 ('O2','O2',{'O':2},'g','0 (element)','205.15',90.188,(154.599,50.464,0.0222),'CP'),
 ('Ar','Ar',{'Ar':1},'g','0 (element)','154.84',87.302,(150.687,48.630,-0.0022),'CP'),
 ('CH4','CH4',{'C':1,'H':4},'g','-74.87 (Chase98); -74.6+-0.3 (Manion02)','186.25',111.667,(190.564,45.992,0.0114),'CP'),
 ('NH3','NH3',{'N':1,'H':3},'g','-45.90 (Chase98); -45.94+-0.35 (CODATA)','192.77',239.834,(405.56,113.634,0.2557),'CP'),
 ('H2O','H2O',{'H':2,'O':1},'g','-241.83 (Chase98); -241.826+-0.04 (CODATA)','188.84',373.124,(647.096,220.64,0.3443),'CP'),
 ('H2Ol','H2O',{'H':2,'O':1},'l','-285.83 (Chase98/CODATA)','69.95',373.124,None,''),
 ('CO','CO',{'C':1,'O':1},'g','-110.53 (Chase98)','197.66',81.638,(132.860,34.982,0.0497),'CP'),
 ('CO2','CO2',{'C':1,'O':2},'g','-393.52 (Chase98); -393.51+-0.13 (CODATA)','213.79',194.69,(304.128,73.773,0.2239),'CP; Tb=sublimation 194.69 K UNVERIFIED'),
 ('SO2','SO2',{'S':1,'O':2},'g','-296.84 (Chase98); -296.81+-0.20 (CODATA)','248.21',263.137,(430.640,78.866,0.2561),'CP'),
 ('SO3','SO3',{'S':1,'O':3},'g','-395.77 (Chase98)','256.77',317.9,(490.85,82.1,0.424),'Tb, Tc, Pc, w UNVERIFIED (memory)'),
 ('S','S (rhombic -> monoclinic 368.3 K -> liquid 388.36 K)',{'S':1},'s/l','0 (element)','32.054 (rhombic, CODATA)',717.76,None,'Tb UNVERIFIED; NIST Tc=1313 K, Pc=182 bar (fetched)'),
 ('H2SO4l','H2SO4',{'H':2,'S':1,'O':4},'l','-813.99 (CRC/Atkins; via search)','156.90',610.0,None,'dHf,S,dGf,Cp from CRC/Atkins table (found via web search, not primary); Tb ~610 K decomposes UNVERIFIED'),
 ('NO','NO',{'N':1,'O':1},'g','90.29 (Chase98)','210.76',121.4,(180.15,64.8,0.583),'Tb,Tc,Pc,w UNVERIFIED (memory)'),
 ('NO2','NO2',{'N':1,'O':2},'g','33.10 (Chase98)','240.04',294.3,(431.35,101.3,0.834),'Tc,Pc,w UNVERIFIED (memory); Tb: NIST 295.08 K (Thorpe 1880, fetched)'),
 ('N2O4','N2O4',{'N':2,'O':4},'g','9.08 (Chase98)','304.38',294.3,(431.35,101.3,0.86),'Tc,Pc,w UNVERIFIED (memory)'),
 ('HNO3l','HNO3',{'H':1,'N':1,'O':3},'l','-174.1 (CRC 100th ed; via search)','155.6 (via search)',356.0,(520.0,68.9,0.714),'Cp=109.87 UNVERIFIED; Tb, Tc, Pc, w UNVERIFIED'),
 ('CH3OH','CH3OH',{'C':1,'H':4,'O':1},'g','-205+-10 (NIST, useless); NASA poly gives ~-201.0','n/a at NIST',337.632,(513.380,82.159,0.5649),'CP; NASA TM-4513 L8/88'),
 ('CH3OHl','CH3OH',{'C':1,'H':4,'O':1},'l','-239.5+-0.2 (Chao&Rossini65); range -238.4..-239.5','127.19 (Carlson&Westrum71)',337.632,None,'Cp=81.1 (NIST compilation 298 K)'),
 ('C2H5OH','C2H5OH',{'C':2,'H':6,'O':1},'g','-234+-2 (NIST); NASA poly gives ~-234.8','n/a at NIST',351.570,(514.709,62.679,0.644),'CP; NASA TM-4513 L8/88'),
 ('C2H5OHl','C2H5OH',{'C':2,'H':6,'O':1},'l','-276+-2 (NIST); -276.9 from dcH=-1367.6 (Chao&Rossini65)','159.86 (Haida77)',351.570,None,'Cp=112.4 (Petrov89, NIST); CRC recall -277.6 UNVERIFIED'),
 ('C6H12O6','C6H12O6',{'C':6,'H':12,'O':6},'s','-1273.3 (range from NIST dcH: -1271.1..-1276.2; dHf -1274.5 Huffman&Fox38)','209.19 (Boerio-Goates91)',None,None,'alpha-D-glucose, NIST C492626; decomposes ~420 K (mp 414-423 K)'),
 ('Cl2','Cl2',{'Cl':2},'g','0 (element)','223.08',239.198,(416.865,76.424,0.07),'CP'),
 ('HCl','HCl',{'H':1,'Cl':1},'g','-92.31 (Chase98)','186.90',188.173,(324.680,83.135,0.1297),'CP'),
 ('NaCl','NaCl',{'Na':1,'Cl':1},'s','-411.12 (Chase98)','72.11',1738.0,None,'Tb UNVERIFIED; mp 1074 K (NIST-JANAF)'),
 ('NaOH','NaOH',{'Na':1,'O':1,'H':1},'s','-425.93 (Chase98)','64.46',1661.0,None,'Tb UNVERIFIED; mp 596 K (NIST-JANAF)'),
 ('C2H4','C2H4',{'C':2,'H':4},'g','52.47 (Chase98); 52.4+-0.5 (Manion02)','219.32',169.379,(282.350,50.417,0.0866),'CP'),
 ('C3H8','C3H8',{'C':3,'H':8},'g','-104.7+-0.5 (Pittam&Pilcher72); -103.8 (Prosen&Rossini45)','n/a at NIST',231.036,(369.890,42.512,0.1521),'CP; NASA TM-4513 L6/90'),
]
SPEC = {m[0]:m for m in M}

def dfG298(key):
    f = SPEC[key][2]
    h = H(key, T0); s = S(key, T0)
    s_el = sum(SEL[a]*n for a,n in f.items())
    return h - T0*(s - s_el)/1000.0

def fmt(x, n=3):
    if x is None: return 'n/a'
    if isinstance(x,str): return x
    if x == 0: return '0'
    if abs(x) >= 1e4 or abs(x) < 1e-2: return ('%.'+str(n-1)+'e') % x
    return ('%.'+str(n)+'g') % x

OUT = []
def P(*a): OUT.append(' '.join(str(x) for x in a))
def table(head, rows):
    P('| ' + ' | '.join(head) + ' |'); P('|' + '|'.join(['---']*len(head)) + '|')
    for r in rows: P('| ' + ' | '.join(str(x) for x in r) + ' |')
    P('')

HEADER = '''# EQUILIBRIUM - verified species thermochemistry and K(T)

Generated by `thermo.py` (same directory). Fetched 2026-11-09. Standard state 1 bar, ideal gas, pure condensed phases. R = 8.314462618 J/mol/K.

## 0. Summary and flags

* Primary data: NIST WebBook Shomate (Chase 1998 = NIST-JANAF). Implementation reproduces NIST-JANAF tables (H, S, Cp) to <=0.01 kJ/mol, <=0.012 J/mol/K, <=0.09 J/mol/K for every gas used (section 3); K(T) from Shomate agrees with K from summed JANAF log Kf to within +-0.3% for R1,R2,R5,R6,R8,R9 over 298-1000 K.
* NIST has NO usable data for CH3OH(g) (dHf given as -205+-10), C2H5OH, HNO3(l), H2SO4(l), NaOH(aq): CH3OH(g) and C2H5OH(g) use NASA TM-4513 7-coef polynomials (Cantera nasa_gas.yaml; Burcat database was unreachable: garfield.chem.elte.hu and burcat.technion.ac.il returned 404); condensed species use constant Cp. GRI-Mech 3.0 CH3OH low-T set is identical to TM-4513.
* NIST Shomate for H2O(g) and N2O4(g) begins at 500 K; H2O(g) <500 K from NASA TM-4513 (matches JANAF), N2O4(g) <500 K from a Shomate-form fit to the JANAF N-032 table. NASA TM-4513 N2O4 is NOT consistent with JANAF (dHf 11.1 vs 9.08 kJ/mol).
* Largest source disagreements found (genuine uncertainty to carry into the game): (a) NO2 dHf: NIST-JANAF 33.10 vs NASA 34.19 kJ/mol -> K(R8) differs by a factor 2.3 at 298 K, 1.6 at 500 K, 1.3 at 800 K. (b) Graaf 1986 K(methanol) is 11-28% below the thermochemical K at 400-600 K (R3) and 17-22% below for R4 at 500-600 K. (c) Old Haber-process K (Wikipedia table / Gillespie-Beattie) is 6-12% below modern thermochemical K at 300-500 C.
* Items recalled from memory and NOT verified against a source are marked UNVERIFIED throughout: Larson-Dodge NH3 values, Gillespie-Beattie fit, Tc/Pc/omega/Tb for NO, NO2, N2O4, SO3, HNO3, H2SO4, S, NaCl, NaOH, HNO3(l) Cp, glucose dHf (taken as -1273.3, NIST range -1271 to -1276).
* Literature K correlations that WERE verified from a document I downloaded: Graaf 1986 K1,K2,K3 (as quoted in UPB Sci. Bull. 77(4) 2015, rezc44_129791.pdf), Xu-Froment K_I (quoted in Int. J. Hydrogen Energy 42 (2017) 2889-2903, eprints.whiterose.ac.uk/108413), Moe 1962 and Callaghan 2006 WGS (as quoted on en.wikipedia.org/wiki/Water-gas_shift_reaction), Haber K table (en.wikipedia.org/wiki/Haber_process, cites ref [36], original author not verified). The SO2 correlation 4956/T-4.678 came from a physicsforums.com thread (weak) and deviates 28% at 600 K: disregard it as a reference; the JANAF and NASA comparisons are the real checks for R2.
* Could NOT retrieve: Larson & Dodge 1923/24 paper text (paywalled), Gillespie & Beattie 1930, original Graaf 1986, Graaf&Winkelman 2016 full text, any published SO2 equilibrium-conversion table.

'''

def gen():
    P(HEADER)
    # ------------------ species table
    P('## 1. Species table (T = 298.15 K, p = 1 bar)\n')
    P('H(298.15), S(298.15) evaluated from the polynomial actually used in the code (so the numbers are self-consistent). '
      'dGf is computed as dHf - T(S - sum S_el) using CODATA element entropies [c], or taken from the NIST-JANAF table [J] when the species has one. '
      'Phase g/l/s. Tb in K at 1 atm (CoolProp/NIST unless flagged). Tc, Pc, w from CoolProp 6.x reference EOS (NIST-derived) unless flagged UNVERIFIED.\n')
    rows = []
    for key,label,f,ph,dh_q,s_q,tb,crit,fl in M:
        h = H(key,T0); s = S(key,T0); g = dfG298(key)
        gj = None
        if key in JANAF_IDS and key != 'S':
            jt = janaf(JANAF_IDS[key])
            if 298.15 in jt: gj = jt[298.15]['dfG']
        gs = ('%.2f [J %.3f]' % (g,gj)) if gj is not None else ('%.2f [c]' % g)
        c = ('%.1f / %.1f / %.3f' % (crit[0],crit[1],crit[2])) if crit else ('-')
        rows.append([key, label, ph, '%.3f' % mw(f), '%.2f' % h, dh_q, '%.2f' % s, s_q, gs, ('%.1f' % tb) if tb else '-', c, fl])
    table(['key','formula','ph','M g/mol','dHf298 used kJ/mol','dHf quoted (source)','S298 used J/mol/K','S quoted','dGf298 kJ/mol','Tb K','Tc K / Pc bar / w','notes/flags'], rows)

    # ------------------ polynomial tables
    P('## 2. Heat-capacity polynomials\n')
    P('Shomate: Cp = A + B t + C t^2 + D t^3 + E/t^2 ; H - H298 = A t + B t^2/2 + C t^3/3 + D t^4/4 - E/t + F - H ; S = A ln t + B t + C t^2/2 + D t^3/3 - E/(2 t^2) + G ; t = T/1000 ; Cp,S in J/mol/K, H in kJ/mol. '
      'Source for all Shomate rows: NIST Chemistry WebBook (https://webbook.nist.gov/cgi/cbook.cgi?ID=<CAS>&Units=SI&Mask=1 or Mask=2), data of Chase 1998 (NIST-JANAF), fetched 2026-11-09 and parsed programmatically (no hand transcription). '
      'NIST CAS IDs: N2 C7727379, H2 C1333740, O2 C7782447, Ar C7440371, CH4 C74828, NH3 C7664417, H2O C7732185, CO C630080, CO2 C124389, SO2 C7446095, SO3 C7446119, S C7704349, H2SO4 C7664939, NO C10102439, NO2 C10102440, N2O4 C10544726, HNO3 C7697372, Cl2 C7782505, HCl C7647010, NaCl C7647145, NaOH C1310732, C2H4 C74851, a-D-glucose C492626.\n')
    rows = []
    for name in ['N2','H2','O2','Ar','CH4','NH3','H2O','CO','CO2','SO2','SO3','S','H2SO4','NO','NO2','N2O4','HNO3','Cl2','HCl','NaCl','NaOH','C2H4']:
        for ph,segs in SH[name].items():
            for i,(lo,hi,c) in enumerate(segs):
                lab = name + (' (g)' if ph=='Gas' else ' (l)' if ph=='Liquid' else ' (s)')
                if name=='S' and ph=='Solid': lab += [' rhombic, valid 298-368.3 K (NIST lists 298-388.36)', ' monoclinic, valid 368.3-388.36 K'][i]
                rows.append([lab, '%g-%g' % (lo,hi)] + ['%.6g' % x for x in c])
    table(['species','T range K','A','B','C','D','E','F','G','H'], rows)
    P('Notes: NIST H2O(g) Shomate starts at 500 K, N2O4(g) at 500 K, S(g) is monatomic S (not used), NaCl/NaOH gas are >2500 K only. x NO at NIST is in the YAML as boolean; NO uses Shomate.\n')
    P('### NASA 7-coefficient polynomials used (NASA TM-4513, McBride/Gordon/Reno 1993, via Cantera data/nasa_gas.yaml fetched from github.com/Cantera/cantera 2026-11-09; the 1000 K split is the low/high set)\n')
    P('Cp/R = a1+a2 T+a3 T^2+a4 T^3+a5 T^4 ; H/RT = a1+a2 T/2+a3 T^2/3+a4 T^3/4+a5 T^4/5+a6/T ; S/R = a1 ln T+a2 T+a3 T^2/2+a4 T^3/3+a5 T^4/4+a7. Ranges 200-1000 / 1000-6000 K. These are Burcat-lineage (Gordon-McBride, original source tags in column "note": L = Lawrence Livermore, TPIS = Thermodynamic Properties of Individual Substances / Gurvich, J = JANAF).\n')
    rows=[]
    for k in ['CH3OH','C2H5OH','C3H8','H2O','N2O4']:
        for i,lab in enumerate(['low','high']):
            rows.append([k, NASA[k]['note'], lab] + ['%.8g' % x for x in NASA[k]['c'][i]])
    table(['species','note','set','a1','a2','a3','a4','a5','a6','a7'], rows)
    P('N2O4(g) JANAF-fit Shomate (298-500 K): A..H = ' + ', '.join('%.6g' % x for x in FITS['N2O4']) + '\n')
    P('GRI-Mech 3.0 CH3OH (thermo L8/88, 200-1000-3500 K) has the SAME low-T set; its high-T set differs from TM-4513 (a1=1.78970791 vs 3.60134486). Both are checked against each other below (section 3b).\n')
    P('Constant-Cp condensed species (no Shomate available at NIST): H(T)=H298+Cp (T-298.15); S(T)=S298+Cp ln(T/298.15). Values: H2SO4(l) dHf -813.99, S 156.90, Cp 138.9 [CRC/Atkins-type table, found via web search]; '
      'HNO3(l) dHf -174.1 [CRC 100th ed. via search], S 155.6 [search], Cp 109.87 [UNVERIFIED]; CH3OH(l) -239.5/127.19/81.1 [NIST WebBook Chao&Rossini 1965; Carlson&Westrum 1971; Cp ~81 compilation]; '
      'C2H5OH(l) -276.9/159.86/112.4 [NIST: dcH Chao&Rossini 1965; Haida 1977; Petrov 1989]; a-D-glucose(s) -1273.3/209.19/219.19 [NIST C492626 Boerio-Goates 1991 for S and Cp; dHf CRC-like value, NIST-derived range -1271..-1276].\n')
    P('NOT FOUND/NOT PROVIDED: NaOH(aq) (needs Pitzer/ionic standard states; game must use a model - e.g. dHsoln(NaOH) = -44.5 kJ/mol [CRC, UNVERIFIED recall]; NaOH(s) is provided), HNO3(aq), H2SO4(aq). Liquid H2SO4 and HNO3 have no temperature-dependent data here beyond constant Cp.\n')

    # ------------------ validation
    P('## 3. Internal validation of the polynomials against NIST-JANAF numeric tables\n')
    P('Max abs deviation between polynomial and the JANAF table (H-H298 + dHf, S, Cp) at table nodes 298.15-1000 K (where both valid). Shows implementation is correct.\n')
    rows=[]
    for k,tid in JANAF_IDS.items():
        if k in ('S',): continue
        jt = janaf(tid); dh=ds=dc=0; n=0
        for T,r in jt.items():
            if not (298.0 < T <= 1000) or T not in (298.15,400,500,600,700,800,900,1000): continue
            if k=='H2Ol' and T>373.2: continue
            cp,h,s = props(k,T)
            dh=max(dh,abs(h-(r['dH']+jt[298.15]['dfH']))); ds=max(ds,abs(s-r['S'])); dc=max(dc,abs(cp-r['cp'])); n+=1
        rows.append([k, tid, n, '%.3f' % dh, '%.3f' % ds, '%.3f' % dc])
    table(['species','JANAF table','nodes','max |dH| kJ/mol','max |dS| J/mol/K','max |dCp| J/mol/K'], rows)
    P('Splice check at 500 K (NASA TM-4513 below, NIST Shomate above):\n')
    rows=[]
    a = nasa7(NASA['H2O']['c'][0],500.0); b = shomate(SH['H2O']['Gas'][0][2],500.0)
    rows.append(['H2O (NASA / NIST Shomate)','%.2f/%.2f' % (a[0],b[0]),'%.3f/%.3f' % (a[1],b[1]),'%.2f/%.2f' % (a[2],b[2])])
    a = shomate(FITS['N2O4'],500.0); b = shomate(SH['N2O4']['Gas'][0][2],500.0)
    rows.append(['N2O4 (JANAF-fit / NIST Shomate)','%.2f/%.2f' % (a[0],b[0]),'%.3f/%.3f' % (a[1],b[1]),'%.2f/%.2f' % (a[2],b[2])])
    a = nasa7(NASA['N2O4']['c'][0],298.15)
    rows.append(['N2O4 NASA TM-4513 at 298.15 K (NOT used): H, S','-','%.3f vs JANAF 9.079' % a[1],'%.2f vs JANAF 304.38' % a[2]])
    table(['species','Cp','H kJ/mol','S'], rows)
    P('### 3b. NASA polynomials vs literature for the species lacking NIST Shomate\n')
    rows=[]
    for k in ['CH3OH','C2H5OH']:
        for T in (298.15,500,1000):
            c = NASA[k]['c'][0] if T<=1000 else NASA[k]['c'][1]
            cp,h,s = nasa7(c,T); rows.append([k,T,'%.2f'%cp,'%.2f'%h,'%.2f'%s])
    table(['species','T','Cp','H(abs=dHf+..) kJ/mol','S'], rows)
    cg = NASA['CH3OH_GRI']; c1=NASA['CH3OH']
    cp_a=nasa7(cg['c'][1],1000.0); cp_b=nasa7(c1['c'][1],1000.0); cp_c=nasa7(c1['c'][0],1000.0)
    P('CH3OH(g) at 1000 K: low-set Cp %.2f, TM-4513 high-set Cp %.2f, GRI high-set Cp %.2f J/mol/K. H298(CH3OH)=%.2f kJ/mol (Gurvich/Chao literature ~-201.0), S298=%.2f (literature 239.9).\n' % (cp_c[0], cp_b[0], cp_a[0], H('CH3OH',T0), S('CH3OH',T0)))

    # ------------------ main tables
    P('## 4. Reaction thermodynamics from NIST Shomate (+NASA below 500 K for H2O(g); JANAF-fit for N2O4 below 500 K; NASA for CH3OH(g))\n')
    P('dH (kJ per mol of reaction as written), dS (J/mol/K), dG (kJ/mol), K dimensionless (std state 1 bar; K = exp(-dG/RT)); Kp in bar^dn = K. Reaction dn = change in mol gas.\n')
    for r in ['R1','R2','R2h','R3','R4','R5','R6','R7','R8','R9','R13']:
        P('**%s  %s**   (dn_gas = %g)\n' % (r, RX[r][0], dn(r) if r not in ('R7',) else dn(r)))
        rows=[]
        for T in TLIST:
            dH,dS,dG,lnK = rxn(r,T)
            if r=='R7': rows.append([T,'%.2f'%dH,'%.1f'%dS,'%.2f'%dG,'%.4g'%(lnK/math.log(10))])
            else: rows.append([T,'%.2f'%dH,'%.2f'%dS,'%.3f'%dG,'%.4e'%math.exp(lnK) if abs(lnK)<600 else 'log10K=%.2f' % (lnK/math.log(10)),'%.3f'%(lnK/math.log(10))])
        table(['T/K','dH kJ','dS J/K','dG kJ','K','log10 K'] if r!='R7' else ['T/K','dH kJ (per 4NH3)','dS','dG','log10K'], rows)
    P('**R10  S + O2 -> SO2, R11 SO3 + H2O(l) -> H2SO4(l), R12 glucose -> 2 EtOH(l) + 2CO2** (condensed phases; only the T range where the phases exist; irreversible in the game)\n')
    rows=[]
    for T in TLIST: 
        dH,dS,dG,lnK = rxn('R10',T)
        note = 'S rhombic' if T<368.3 else ('S monoclinic' if T<388.36 else ('S liquid' if T<=717.8 else ('S(l) above real Tb 717.8 K (liquid Shomate valid to 882 K); real species is S vapour, true dH ~9 kJ more negative (UNVERIFIED)' if T<=882.117 else 'S(l) Shomate EXTRAPOLATED beyond 882 K')))
        rows.append([T,'%.2f'%dH,'%.2f'%dS,'%.2f'%dG,'%.2f'%(lnK/math.log(10)),note])
    P('R10:'); table(['T/K','dH kJ','dS J/K','dG kJ','log10 K','sulfur state'], rows)
    rows=[]
    for T in (298.15,323.15,348.15,373.15):
        dH,dS,dG,lnK = rxn('R11',T); rows.append([T,'%.2f'%dH,'%.1f'%dS,'%.2f'%dG,'%.2f'%(lnK/math.log(10))])
    P('R11 (per SO3; H2SO4(l) constant Cp, H2O(l) Shomate):'); table(['T/K','dH kJ','dS J/K','dG kJ','log10 K'], rows)
    rows=[]
    for T in (298.15,303.15,310.15,323.15):
        dH,dS,dG,lnK = rxn('R12',T); rows.append([T,'%.2f'%dH,'%.1f'%dS,'%.2f'%dG,'%.2f'%(lnK/math.log(10))])
    P('R12 (per mole glucose; literature dH ~ -68 to -72 kJ/mol for fermentation to 2 EtOH + 2 CO2 (UNVERIFIED recall); dHf of glucose uncertain +-2 kJ/mol, EtOH(l) +-0.7):'); table(['T/K','dH kJ','dS J/K','dG kJ','log10 K'], rows)

    # ------------------ comparison
    P('## 5. Comparison with independent literature K(T)\n')
    P('Columns: Shomate = this work (NIST); JANAF = NIST-JANAF table log Kf sums (independent numeric tabulation; exact at 400,500,600,700,800,900,1000 K, quadratic-in-1/T interpolation elsewhere = (i)); '
      'NASA = TM-4513 polynomials; then published correlations. dev% = 100 (K_this - K_lit)/K_lit. Units of correlations converted to bar (1 atm = 1.01325 bar).\n')
    def row_for(r,T,lits):
        k = K(r,T); cells=['%g'%T,'%.4e'%k]
        jl,mode = janaf_logK(RX[r][1],T)
        if jl is None: cells += ['n/a','n/a']
        else:
            kj = 10**jl; cells += ['%.4e%s'%(kj,'' if mode=='node' else ' (i)'), '%+.2f'%(100*(k-kj)/kj)]
        kn = math.exp(nasa_rxn(r,T)[3]); cells += ['%.4e'%kn,'%+.2f'%(100*(k-kn)/kn)]
        for name,fn,Tr in lits:
            if Tr and not (Tr[0]-1e-9 <= T <= Tr[1]+1e-9): cells += ['-','-']; continue
            kl = fn(T); cells += ['%.4e'%kl,'%+.1f'%(100*(k-kl)/kl)]
        return cells
    lit_sets = {
      'R1': [('Gillespie-Beattie fit (UNVERIFIED recall)', gb_haber, (573,1000))],
      'R2h':[('log Kp=4956/T-4.678 (physicsforums thread)', so2_pf, (600,1100))],
      'R3': [('Graaf 1986 K1', graaf_K1, (400,1000))],
      'R4': [('Graaf 1986 K3', graaf_K3, (400,1000))],
      'R5': [('Moe 1962', moe_wgs, (600,1200)), ('Callaghan 2006', callaghan_wgs, (600,1200)), ('1/Graaf K2rev', lambda T: 1/graaf_K2rev(T), (400,1000))],
      'R6': [('Xu-Froment 1989 K_I', xf_smr, (500,1000))],
      'R8': [], 'R9': [],
    }
    for r in ['R1','R2h','R3','R4','R5','R6','R8','R9']:
        P('**%s  %s**\n' % (r, RX[r][0]))
        head=['T/K','K Shomate','K JANAF','dev% vs JANAF','K NASA','dev% vs NASA']
        for name,_,_ in lit_sets[r]: head += ['K '+name,'dev%']
        rows=[row_for(r,T,lit_sets[r]) for T in TLIST]
        table(head, rows)
    P('**R2 (2SO2 + O2 <=> 2SO3)**: K(R2) = K(R2h)^2; deviations vs references double (e.g. 1% in K per-SO2 = 2% in K2).\n')
    P('**R1 vs the Wikipedia/Haber table (cited there as ref [36]; original author not verified)**, K = p_NH3^2/(p_N2 p_H2^3) in atm^-2:\n')
    rows=[]
    for T,kw in HABER_WIKI.items():
        k = K('R1',T)*ATM**2           # convert bar^-2 -> atm^-2 : K_atm = K_bar*(1.01325)^2
        rows.append(['%.2f (%d C)'%(T,round(T-273.15)),'%.3e'%k,'%.3e'%kw,'%+.1f'%(100*(k-kw)/kw)])
    table(['T','K this work (atm^-2)','Wikipedia table (atm^-2)','dev%'], rows)
    P('Graaf 1986 correlation range is 473-543 K (200-270 C); outside it values are extrapolations. Moe correlation range 600-1200 K. '
      'Graaf & Winkelman 2016 (Ind. Eng. Chem. Res.) reassessment reports ideal-gas K(CO+2H2=CH3OH) = 2.07e-3 bar^-2 at 523.15 K (value seen only in a search-result snippet; paper not read): this work K(523.15 K) = %.3e bar^-2, Graaf 1986 = %.3e.\n' % (K('R3',523.15), graaf_K1(523.15)))

    # ------------------ van 't Hoff
    P('## 6. Textbook constant-dH van\'t Hoff (dH298, dS298 only) vs Shomate\n')
    P('K_vH = exp(-(dH298 - T dS298)/RT). dev% = 100 (K_vH - K_Shomate)/K_Shomate.\n')
    rows=[]
    for T in TLIST:
        cells=['%g'%T]
        for r in ['R1','R2','R3']:
            kv=vant_hoff_K(r,T); ks=K(r,T); cells += ['%.3e'%kv,'%.3e'%ks,'%+.1f'%(100*(kv-ks)/ks)]
        rows.append(cells)
    table(['T/K','R1 K_vH','R1 K_Sh','R1 dev%','R2 K_vH','R2 K_Sh','R2 dev%','R3 K_vH','R3 K_Sh','R3 dev%'], rows)
    for r in ['R1','R2','R3']:
        dH298,dS298,_,_ = rxn(r,T0); dH7,dS7,_,_ = rxn(r,700.0)
        P('%s: dH298 = %.2f kJ, dS298 = %.2f J/K ; dH(700 K) = %.2f kJ, dS(700 K) = %.2f J/K' % (r,dH298,dS298,dH7,dS7))
    P('')

    # ------------------ NH3 equilibrium
    P('## 7. NH3 equilibrium, stoichiometric 1:3 N2:H2 feed, no inerts\n')
    P('y_NH3 mole fraction. "ideal" = ideal-gas K from Shomate. "SRK" = Lewis-Randall fugacity correction with SRK EOS (Graboski-Daubert alpha for H2, kij=0; indicative only). '
      'Larson & Dodge (JACS 45, 2918 (1923); 46, 367 (1924)) experimental values below are RECALLED FROM MEMORY and UNVERIFIED (could not retrieve the paper; pubs.acs.org full text is paywalled): '
      '400 C: 100 atm 25.12%, 300 atm 47.00%; 450 C: 100 atm 16.35%, 300 atm 35.5%; 500 C: 100 atm 10.61%, 300 atm 26.44%. '
      'Pressures in L&D are atm, so the comparison rows use P in atm (x1.01325 bar).\n')
    LD10 = {400:3.85,450:2.04,500:1.20}
    LD = {(400,100):25.12,(400,300):47.00,(450,100):16.35,(450,300):35.5,(500,100):10.61,(500,300):26.44}
    rows=[]
    for tc in (400,450,500):
        T = tc+273.15
        for Pb in (100,200,300):
            yi = nh3_eq(T,Pb); yr = nh3_eq(T,Pb,True)
            rows.append([tc,Pb,'bar','%.2f'%(100*yi),'%.2f'%(100*yr),'%+.1f'%(100*(yi-yr)/yr)])
    table(['T C','P','unit','ideal y_NH3 %','SRK real y_NH3 %','ideal-vs-real rel. err %'], rows)
    rows=[]
    for tc in (400,450,500):
        T = tc+273.15
        for Pa in (100,300):
            Pb = Pa*ATM
            yi = nh3_eq(T,Pb); yr = nh3_eq(T,Pb,True); ld = LD[(tc,Pa)]
            rows.append([tc,Pa,'atm','%.2f'%(100*yi),'%.2f'%(100*yr),'%.2f (UNVERIFIED)'%ld,'%+.1f'%(100*(100*yi-ld)/ld),'%+.1f'%(100*(100*yr-ld)/ld)])
    for tc in (400,450,500):
        T = tc+273.15; Pb = 10*ATM
        yi = nh3_eq(T,Pb); yr = nh3_eq(T,Pb,True); ld = LD10[tc]
        rows.append([tc,10,'atm','%.2f'%(100*yi),'%.2f'%(100*yr),'%.2f (UNVERIFIED, weaker recall)'%ld,'%+.1f'%(100*(100*yi-ld)/ld),'%+.1f'%(100*(100*yr-ld)/ld)])
    table(['T C','P','unit','ideal %','SRK real %','L&D measured %','ideal rel. err % vs L&D','SRK rel. err % vs L&D'], rows)
    P('Reading: at 10 atm fugacity effects are <1%, so the 10-atm row tests K itself: NIST/JANAF-based K gives y about 6% (relative) above L&D (i.e. L&D/old-literature K is ~10-12% lower than the modern thermochemical K; same offset seen vs the Wikipedia/Gillespie-Beattie K in section 5). '
      'At 100 atm that K offset partly cancels the fugacity effect; at 300 atm ideal-gas is 9-13% low in y_NH3 relative to L&D, SRK real-gas is within ~0-5%. '
      'Conclusion: fugacity corrections matter for p >= 100 bar (3-4% rel. at 100 bar, 6-8% at 200, 9-11% at 300 per SRK); an ideal-gas game model under-predicts NH3 at 200-300 bar by ~10% relative unless K is tuned. A single lumped correction factor or a cheap EOS (SRK/PR with H2 alpha) is enough; full activity models are not needed.\n')
    P('Also K(T) sensitivity: using a K 10-12% lower (Wikipedia/Gillespie-Beattie level) lowers y_NH3 by ~5% relative.\n')

    # ------------------ SO2 conversion
    P('## 8. SO2 oxidation equilibrium conversion at 1 bar (8% SO2, 11% O2, 81% N2)\n')
    rows=[]
    for tc in (400,450,500,550,600):
        T=tc+273.15; k=K('R2h',T); kj=10**janaf_logK(RX['R2h'][1],T)[0]; kp=so2_pf(T)
        rows.append([tc,'%.1f'%k,'%.1f'%kj,'%.1f'%kp,'%.2f'%(100*so2_conv(T,k)),'%.2f'%(100*so2_conv(T,kj)),'%.2f'%(100*so2_conv(T,kp))])
    table(['T C','K Shomate (bar^-1/2)','K JANAF (interp)','K 4956/T-4.678','conv % (Shomate)','conv % (JANAF)','conv % (4956/T fit)'], rows)
    P('Ideal-gas at 1 bar is accurate (fugacity coefficients within ~0.1%); no fugacity model needed for SO2 at 1 bar. Real converter pressure 1-1.3 bar. '
      'I did not retrieve a published equilibrium-conversion table (e.g. Kirk-Othmer/Duecker&West) to compare against: UNVERIFIED externally; the JANAF-vs-Shomate agreement is the check.\n')
    P('## 9. Reference list\n')
    for l in [
      'NIST Chemistry WebBook, SRD 69, https://webbook.nist.gov/cgi/cbook.cgi?ID=<CAS>&Units=SI&Mask=1|2|4 (Chase, M.W., NIST-JANAF Thermochemical Tables 4th ed., J. Phys. Chem. Ref. Data Monograph 9, 1998; Cox, Wagman, Medvedev CODATA Key Values 1984).',
      'NIST-JANAF tables, https://janaf.nist.gov/tables/{N-023 N2, H-050 H2, O-029 O2, C-093 CO, C-095 CO2, C-067 CH4, H-083 NH3, H-064 H2O(g), H-063 H2O(l), O-034 SO2, O-058 SO3, N-005 NO, N-007 NO2, N-032 N2O4(g), C-128 C2H4, H-030 HNO3(g), S-001 S}.html',
      'McBride, Gordon, Reno, NASA TM-4513 (1993); coefficients via https://raw.githubusercontent.com/Cantera/cantera/main/data/nasa_gas.yaml and gri30.yaml (GRI-Mech 3.0).',
      'CoolProp 6.x (Bell et al. 2014) reference-EOS critical constants/acentric factors, Tb (pip install CoolProp).',
      'Graaf, Sijtsema, Stamhuis, Joosten, Chem. Eng. Sci. 41 (1986) 2883 (correlations as quoted in UPB Sci. Bull. Ser. B 77(4) 2015, https://www.scientificbulletin.upb.ro/static/pdfs/rezc44_129791.pdf).',
      'Xu, Froment, AIChE J. 35 (1989) 88 (correlation as quoted in Int. J. Hydrogen Energy 42 (2017) 2889, https://eprints.whiterose.ac.uk/108413/17/1-s2.0-S0360319916333821-main.pdf).',
      'Moe, Chem. Eng. Prog. 58(3) (1962) 33; Callaghan, PhD thesis WPI (2006): as quoted at https://en.wikipedia.org/wiki/Water-gas_shift_reaction.',
      'Haber K table: https://en.wikipedia.org/wiki/Haber_process (ref [36] there).',
      'Larson & Dodge, J. Am. Chem. Soc. 45 (1923) 2918 and 46 (1924) 367 (paper not accessible; numbers recalled).',
      'Condensed-phase H2SO4/HNO3: CRC Handbook values as seen in web-search snippets (Atkins-type table; ecampusontario.pressbooks.pub Appendix G; edutecnica.it energy-of-formation.PDF).']:
        P('* ' + l)
    P('')
    if WARN: P('Out-of-range polynomial evaluations (extrapolated): %s\n' % sorted(WARN))

if __name__ == '__main__':
    gen()
    open(os.path.join(HERE,'thermo.md'),'w').write('\n'.join(OUT))
    print('\n'.join(OUT))
