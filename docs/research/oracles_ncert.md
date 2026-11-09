# EQUILIBRIUM textbook oracles (NCERT / JEE / NEET)

Numbering used: rationalised NCERT (2023+): XI Ch1 Some Basic Concepts, XI Ch5 Thermodynamics, XI Ch6 Equilibrium, XII Ch3 Chemical Kinetics. Old numbering: XI Ch6 / Ch7, XII Ch4. States of Matter (old XI Ch5) was dropped in rationalised XI. XI Ch5/6/7 numbers in 'src' are given both ways.

CITATION STATUS: no source text was fetched from the web in this pass. Items marked 'recalled, not verified' are reconstructed from memory (numbers match published answers as recalled; the computed value is authoritative). Items marked 'constructed' are original problems in textbook style, not real citations - do not present them as NCERT/JEE.

'computed' = this script; 'book' = published/recalled answer; tol is relative unless noted.

| id | topic | source | citation | computed | unit | book | tol | engine fn | agree |
|---|---|---|---|---|---|---|---|---|---|
| EQ-NC-001 | mole | NCERT XI Ch1 (Eg 1.x, glucose molar mass) | recalled, not verified | 180.156 | g/mol | 180.16 | 0.002 | molarMass | yes |
| EQ-NC-002 | mole | NCERT XI Ch1 Exercise 1.x (atoms in 52 mol Ar / 52 u He / 52 g He) - part (iii) | recalled, not verified | 7.82351e+24 | atoms | 7.8e+24 | 0.01 | molesFromMass/avogadro | yes |
| EQ-NC-003 | mole | NCERT XI Ch1 Exercise 1.x (HNO3 69%, d=1.41 g/mL) | recalled, not verified | 15.4399 | mol/L | 15.44 | 0.005 | molarityFromMassPercent | yes |
| EQ-NC-004 | mole | NCERT XI Ch1 Exercise 1.x (sodium acetate 500 mL 0.375 M) | recalled, not verified | 15.3796 | g | 15.4 | 0.005 | massFromMolarity | yes |
| EQ-NC-005 | stoich | NCERT XI Ch1 Exercise 1.x (2.00e3 g N2 + 1.00e3 g H2 -> NH3) | recalled, not verified | 2431.84 | g NH3 (limiting = N2) | 2430 | 0.005 | limitingReagent+stoichYield | yes |
| EQ-NC-006 | stoich | NCERT XI Ch1 Exercise 1.x (water from 16 g CH4) | recalled, not verified | 35.9334 | g H2O | 36.0 | 0.005 | stoichMass | yes |
| EQ-NC-007 | stoich | NCERT XI Ch1 Exercise 1.x (Cu from 100 g CuSO4) | recalled, not verified | 39.8153 | g Cu | 39.8 | 0.005 | stoichMass | yes |
| EQ-NC-008 | stoich | generic textbook percent-yield (CaCO3 decomposition) | recalled, not verified | 17.5885 | g CO2 | 17.6 | 0.01 | percentYield/stoichMass | yes |
| EQ-NC-009 | stoich | generic textbook limiting reagent (Mg + HCl) [constructed] | constructed | 2.24 | L H2 (limiting = HCl) | 2.24 | 0.005 | limitingReagent | yes |
| EQ-NC-010 | empirical | NCERT XI Ch1 Exercise 1.x (Fe oxide 69.9% Fe, 30.1% O) | recalled, not verified | 1.50308 | O per Fe (Fe2O3 => 1.5) | 1.5 | 0.01 | empiricalFormula | yes |
| EQ-NC-011 | empirical | NCERT XI Ch1 Example 1.x (4.07% H, 24.27% C, 71.65% Cl; M=98.96) | recalled, not verified | 2.00012 | multiplier n | 2 | 0.01 | empiricalFormula+molecularFormula | yes |
| EQ-NC-012 | empirical | generic combustion analysis [constructed] | constructed | 0.998838 | O:C ratio (CH2O => 1) | 1.0 | 0.01 | combustionAnalysis | yes |
| EQ-NC-013 | gas | NCERT XI States of Matter Exercise (0.5 L H2 @0.8 bar + 2 L O2 @0.7 bar into 1 L, 27C) (Ch5 pre-2023; chapter removed from rationalised XI) | recalled, not verified | 1.8 | bar | 1.8 | 0.005 | daltonTotalPressure | yes |
| EQ-NC-014 | gas | NCERT XI States of Matter Exercise (1 g A @2 bar; +2 g B -> 3 bar) | recalled, not verified | 4 | M_B/M_A | 4.0 | 0.001 | idealGasMoles/dalton | yes |
| EQ-NC-015 | gas | NCERT XI States of Matter Exercise (mixture 20% H2 by weight, 1 bar) | recalled, not verified | 0.798712 | bar | 0.8 | 0.01 | daltonPartial | yes |
| EQ-NC-016 | thermo | NCERT XI Ch5 (rationalised) / Ch6 (old) Exercise (35.2 g CO2 from C, dHc=-393.5) | recalled, not verified | -314.8 | kJ | -314.8 | 0.005 | enthalpyFromMoles | yes |
| EQ-NC-017 | thermo | standard Hess textbook (C->CO from CO2 and CO combustion) | recalled, not verified | -110.5 | kJ/mol | -110.5 | 0.001 | hessLaw | yes |
| EQ-NC-018 | thermo | NCERT XI Ch5/Ch6 Exercise (2A+B->2D, dU=-10.5 kJ, dS=-44.1 J/K, 298 K) | recalled, not verified | 0.164228 | kJ | 0.16 | 0.15 | gibbs+deltaHfromDeltaU | yes |
| EQ-NC-019 | thermo | NCERT XI Ch5/Ch6 Example (dH vap water 40.79 kJ/mol at 373 K -> dU) | recalled, not verified | 37.6889 | kJ/mol | 37.7 | 0.005 | deltaUfromDeltaH | yes |
| EQ-NC-020 | thermo | standard bond-enthalpy textbook (H2+Cl2->2HCl) | recalled, not verified | -184 | kJ | -184 | 0.001 | bondEnthalpyReaction | yes |
| EQ-NC-021 | thermo | NCERT XI Ch5/Ch6 Example (dH=400 kJ, dS=0.2 kJ/K: spontaneous above T) | recalled, not verified | 2000 | K | 2000 | 0.001 | spontaneityT | yes |
| EQ-NC-022 | equil | NCERT XI Ch6 (rationalised) / Ch7 (old) Exercise (CO+H2O, Kc=4.24 at 800 K, 1 mol each in 10 L) | recalled, not verified | 0.0326891 | mol/L [CO]=[H2O] (CO2,H2 = 0.0673) | 0.0327 | 0.01 | equilibriumExtent | yes |
| EQ-NC-023 | equil | NCERT XI Ch6/Ch7 Example (Kp=2.0e10 /bar at 450 K, 2SO2+O2<=>2SO3 -> Kc) | recalled, not verified | 7.479e+11 | L/mol | 748000000000.0 | 0.01 | Kc_from_Kp | yes |
| EQ-NC-024 | equil | NCERT XI Ch6/Ch7 Exercise (13.8 g N2O4 in 1 L at 400 K, Ptot=9.15 bar) | recalled, not verified | 85.8711 | Kp (bar) | 86 | 0.02 | degreeOfDissociation/Kp,Kc | yes |
| EQ-NC-025 | equil | JEE-style PCl5 dissociation [constructed] | constructed | 0.377964 | alpha | 0.378 | 0.005 | degreeOfDissociation | yes |
| EQ-NC-026 | equil | NCERT XI Ch6/Ch7 Example (HI, Kc=54.8 at 700 K, [HI]0=0.5 M) | recalled, not verified | 0.0531762 | mol/L [H2]=[I2] | 0.0532 | 0.01 | equilibriumExtent | yes |
| EQ-NC-027 | equil | generic quadratic ICE: N2O4<=>2NO2 Kc=4.63e-3 [constructed] | constructed | 0.0101955 | mol/L x | x=0.01020 | 1e-06 | equilibriumExtent (quadratic) | yes |
| EQ-NC-028 | equil | NCERT XI Ch6/Ch7 Example (2/3 O2 -> O3, Kp=2.47e-29, 298 K) | recalled, not verified | 163.2 | kJ/mol | 163 | 0.01 | gibbsFromK | yes |
| EQ-NC-029 | equil | generic dG=-RT lnK [constructed] | constructed | 3036.93 | dimensionless | 3040.0 | 0.01 | kFromGibbs | yes |
| EQ-NC-030 | equil-LeChatelier | NCERT XI Ch6/Ch7 text (inert gas, constant V) | recalled, not verified | none | direction | none | 0 | leChatelierDirection | yes |
| EQ-NC-031 | equil-LeChatelier | NCERT XI Ch6/Ch7 text (inert gas, constant P) | recalled, not verified | left(reactants) | direction | left(reactants) | 0 | leChatelierDirection | yes |
| EQ-NC-032 | equil-LeChatelier | JEE/NEET-style PCl5 <=> PCl3 + Cl2, inert gas at constant P [constructed] | constructed | right(products) | direction | right(products) | 0 | leChatelierDirection | yes |
| EQ-NC-033 | equil-LeChatelier | NCERT XI Ch6/Ch7 text (exothermic NH3 synthesis, raise T 500->600 K, dH=-92.4) | recalled, not verified | 0.0246102 | K2/K1 (<1 => left) | <1 (left) | 0 | leChatelierDirection/vanHoff | yes |
| EQ-NC-034 | equil-LeChatelier | NCERT XI Ch6/Ch7 text (N2O4<=>2NO2, halve volume at const T) | recalled, not verified | 2 | Q/K | 2.0 | 0.001 | leChatelierDirection | yes |
| EQ-NC-035 | kinetics/catalyst | JEE/NEET-style catalyst effect [constructed] | constructed | 24113.4 | k ratio | 24000.0 | 0.05 | catalystEffect/arrhenius | yes |
| EQ-NC-036 | kinetics | NCERT XII Ch3 (rationalised) / Ch4 (old) Example (log k=14.34-1.25e4/T) Ea part | recalled, not verified | 239.296 | kJ/mol | 239.34 | 0.002 | arrheniusEa | yes |
| EQ-NC-037 | kinetics | NCERT XII Ch3/Ch4 Exercise (same: T for t1/2=256 min) | recalled, not verified | 668.966 | K | 669 | 0.003 | firstOrderHalfLife+arrhenius | yes |
| EQ-NC-038 | kinetics | NCERT XII Ch3/Ch4 Exercise (k=1.15e-3 s^-1, 5 g -> 3 g) | recalled, not verified | 444.196 | s | 444 | 0.005 | firstOrderTime | yes |
| EQ-NC-039 | kinetics | NCERT XII Ch3/Ch4 Exercise (14C, t1/2=5730 y, 80% remaining) | recalled, not verified | 1844.65 | years | 1845 | 0.005 | firstOrderTime | yes |
| EQ-NC-040 | kinetics | NCERT XII Ch3/Ch4 Exercise (initial rates, 5.07e-5, 5.07e-5, 1.43e-4) | recalled, not verified | 1.49596 | order in A | 1.5 | 0.01 | orderFromInitialRates | yes |
| EQ-NC-041 | kinetics | generic JEE-style initial rates, k extraction [constructed] | constructed | 2 | k (L^2/mol^2/s) | 2.0 | 0.001 | orderFromInitialRates+k | yes |
| EQ-NC-042 | kinetics | NCERT XII Ch3/Ch4 Exercise (rate x4 from 293 to 313 K) | recalled, not verified | 52.8503 | kJ/mol | 52.86 | 0.005 | arrheniusEa | yes |
| EQ-NC-043 | kinetics | NCERT XII Ch3/Ch4 Exercise (k=0.02 s^-1 at 500 K, 0.07 s^-1 at 700 K) | recalled, not verified | 18227.1 | J/mol | 18230.8 | 0.005 | arrheniusEa | yes |

## Details

### EQ-NC-001 (mole)
- Source: NCERT XI Ch1 (Eg 1.x, glucose molar mass) [recalled, not verified]
- Statement: Molar mass of glucose C6H12O6.
- Inputs: `{"formula":{"C":6,"H":12,"O":6}}`
- Expected: 180.156 g/mol (computed ok)
- Book: 180.16 ; tolerance: 0.002 ; constants: H1.008 C12.011 O15.999 (NCERT 180.162 u)
- Engine fn: molarMass

### EQ-NC-002 (mole)
- Source: NCERT XI Ch1 Exercise 1.x (atoms in 52 mol Ar / 52 u He / 52 g He) - part (iii) [recalled, not verified]
- Statement: Number of atoms in 52 g of He.
- Inputs: `{"species":"He","mass_g":52,"NA":6.022e23}`
- Expected: 7.82351e+24 atoms (computed ok)
- Book: 7.8e+24 ; tolerance: 0.01 ; constants: He 4.0026 (book uses 4 u -> 7.83e24)
- Engine fn: molesFromMass/avogadro

### EQ-NC-003 (mole)
- Source: NCERT XI Ch1 Exercise 1.x (HNO3 69%, d=1.41 g/mL) [recalled, not verified]
- Statement: Molarity of conc. HNO3 of density 1.41 g/mL, 69% by mass.
- Inputs: `{"solute":{"H":1,"N":1,"O":3},"density_g_per_mL":1.41,"mass_pct":69}`
- Expected: 15.4399 mol/L (computed ok)
- Book: 15.44 ; tolerance: 0.005 ; constants: H1.008 N14.007 O15.999 (book 63 g/mol)
- Engine fn: molarityFromMassPercent

### EQ-NC-004 (mole)
- Source: NCERT XI Ch1 Exercise 1.x (sodium acetate 500 mL 0.375 M) [recalled, not verified]
- Statement: Mass of CH3COONa (M=82.0245) needed for 500 mL of 0.375 M solution.
- Inputs: `{"M":82.0245,"V_L":0.5,"c":0.375}`
- Expected: 15.3796 g (computed ok)
- Book: 15.4 ; tolerance: 0.005 ; constants: M=82.0245 (book 15.38 g)
- Engine fn: massFromMolarity

### EQ-NC-005 (stoich)
- Source: NCERT XI Ch1 Exercise 1.x (2.00e3 g N2 + 1.00e3 g H2 -> NH3) [recalled, not verified]
- Statement: N2+3H2->2NH3; 2000 g N2 with 1000 g H2. Limiting reagent? Mass NH3? (also H2 left: 281.7 mol check in script).
- Inputs: `{"reaction":"N2+3H2->2NH3","reactants_g":{"N2":2000,"H2":1000}}`
- Expected: 2431.84 g NH3 (limiting = N2) (computed ok)
- Book: 2430 ; tolerance: 0.005 ; constants: N2 28.0134 H2 2.016 NH3 17.031; book 2.43e3 g
- Engine fn: limitingReagent+stoichYield
- Extra: H2 left = 281.8 mol

### EQ-NC-006 (stoich)
- Source: NCERT XI Ch1 Exercise 1.x (water from 16 g CH4) [recalled, not verified]
- Statement: CH4+2O2->CO2+2H2O; mass of water from complete combustion of 16 g CH4.
- Inputs: `{"reaction":"CH4+2O2->CO2+2H2O","CH4_g":16,"O2":"excess"}`
- Expected: 35.9334 g H2O (computed ok)
- Book: 36.0 ; tolerance: 0.005 ; constants: book 36 g (M_H2O=18)
- Engine fn: stoichMass

### EQ-NC-007 (stoich)
- Source: NCERT XI Ch1 Exercise 1.x (Cu from 100 g CuSO4) [recalled, not verified]
- Statement: Mass of Cu obtainable from 100 g CuSO4.
- Inputs: `{"compound":{"Cu":1,"S":1,"O":4},"mass_g":100}`
- Expected: 39.8153 g Cu (computed ok)
- Book: 39.8 ; tolerance: 0.005 ; constants: Cu 63.546 (book 63.5/159.5 -> 39.8)
- Engine fn: stoichMass

### EQ-NC-008 (stoich)
- Source: generic textbook percent-yield (CaCO3 decomposition) [recalled, not verified]
- Statement: CaCO3 -> CaO + CO2. 50.0 g CaCO3 heated, actual yield 80%. Mass CO2 obtained?
- Inputs: `{"reaction":"CaCO3->CaO+CO2","CaCO3_g":50,"yield_pct":80}`
- Expected: 17.5885 g CO2 (computed ok)
- Book: 17.6 ; tolerance: 0.01 ; constants: Ca 40.078 C12.011 O15.999; theoretical 22.0 g
- Engine fn: percentYield/stoichMass

### EQ-NC-009 (stoich)
- Source: generic textbook limiting reagent (Mg + HCl) [constructed] [constructed]
- Statement: Mg+2HCl->MgCl2+H2. 6.0 g Mg with 100 mL of 2.0 M HCl. Limiting reagent, volume H2 at STP (22.4 L/mol)?
- Inputs: `{"Mg_g":6.0,"HCl":{"V_L":0.1,"c":2.0},"molar_volume_STP":22.4}`
- Expected: 2.24 L H2 (limiting = HCl) (computed ok)
- Book: 2.24 ; tolerance: 0.005 ; constants: Mg 24.305, Vm 22.4
- Engine fn: limitingReagent

### EQ-NC-010 (empirical)
- Source: NCERT XI Ch1 Exercise 1.x (Fe oxide 69.9% Fe, 30.1% O) [recalled, not verified]
- Statement: Empirical formula of an iron oxide with 69.9% Fe, 30.1% O. Fe:O ratio (x -> Fe2O3 = 1:1.5).
- Inputs: `{"Fe_pct":69.9,"O_pct":30.1}`
- Expected: 1.50308 O per Fe (Fe2O3 => 1.5) (computed ok)
- Book: 1.5 ; tolerance: 0.01 ; constants: Fe 55.845 O 15.999
- Engine fn: empiricalFormula

### EQ-NC-011 (empirical)
- Source: NCERT XI Ch1 Example 1.x (4.07% H, 24.27% C, 71.65% Cl; M=98.96) [recalled, not verified]
- Statement: Compound has 4.07% H, 24.27% C, 71.65% Cl, molar mass 98.96 g/mol: empirical CH2Cl; ratio M/M_emp = n (molecular formula C2H4Cl2).
- Inputs: `{"H_pct":4.07,"C_pct":24.27,"Cl_pct":71.65,"M":98.96}`
- Expected: 2.00012 multiplier n (computed ok)
- Book: 2 ; tolerance: 0.01 ; constants: C12.011 H1.008 Cl35.45; n=1.999
- Engine fn: empiricalFormula+molecularFormula

### EQ-NC-012 (empirical)
- Source: generic combustion analysis [constructed] [constructed]
- Statement: 0.300 g of C,H,O compound burns to 0.440 g CO2 and 0.180 g H2O. O by difference. Empirical formula CH2O (O:C ratio shown).
- Inputs: `{"sample_g":0.300,"CO2_g":0.440,"H2O_g":0.180}`
- Expected: 0.998838 O:C ratio (CH2O => 1) (computed ok)
- Book: 1.0 ; tolerance: 0.01 ; constants: C12.011 H1.008 O15.999
- Engine fn: combustionAnalysis

### EQ-NC-013 (gas)
- Source: NCERT XI States of Matter Exercise (0.5 L H2 @0.8 bar + 2 L O2 @0.7 bar into 1 L, 27C) (Ch5 pre-2023; chapter removed from rationalised XI) [recalled, not verified]
- Statement: Total pressure when 0.5 L H2 at 0.8 bar and 2.0 L O2 at 0.7 bar are put in a 1 L vessel at 27 C.
- Inputs: `{"gases":[{"V":0.5,"p":0.8},{"V":2.0,"p":0.7}],"Vfinal_L":1.0,"T_K":300.15}`
- Expected: 1.8 bar (computed ok)
- Book: 1.8 ; tolerance: 0.005 ; constants: Boyle's law; no R needed
- Engine fn: daltonTotalPressure

### EQ-NC-014 (gas)
- Source: NCERT XI States of Matter Exercise (1 g A @2 bar; +2 g B -> 3 bar) [recalled, not verified]
- Statement: 1 g gas A gives 2 bar at 27 C; adding 2 g of gas B gives total 3 bar (same V,T). Find M_B/M_A.
- Inputs: `{"gasA_g":1,"pA_bar":2,"gasB_g":2,"ptot_bar":3}`
- Expected: 4 M_B/M_A (computed ok)
- Book: 4.0 ; tolerance: 0.001 ; constants: ratio only
- Engine fn: idealGasMoles/dalton

### EQ-NC-015 (gas)
- Source: NCERT XI States of Matter Exercise (mixture 20% H2 by weight, 1 bar) [recalled, not verified]
- Statement: H2/O2 mixture at 1 bar is 20% H2 by weight. Partial pressure of H2.
- Inputs: `{"H2_wt_pct":20,"O2_wt_pct":80,"P_bar":1}`
- Expected: 0.798712 bar (computed ok)
- Book: 0.8 ; tolerance: 0.01 ; constants: H2 2.016 O2 31.998
- Engine fn: daltonPartial

### EQ-NC-016 (thermo)
- Source: NCERT XI Ch5 (rationalised) / Ch6 (old) Exercise (35.2 g CO2 from C, dHc=-393.5) [recalled, not verified]
- Statement: dHc(C)=-393.5 kJ/mol. Heat released forming 35.2 g CO2.
- Inputs: `{"dH_kJ_per_mol":-393.5,"mass_g":35.2,"M":44}`
- Expected: -314.8 kJ (computed ok)
- Book: -314.8 ; tolerance: 0.005 ; constants: M_CO2=44.0 (44.01 gives -314.7)
- Engine fn: enthalpyFromMoles

### EQ-NC-017 (thermo)
- Source: standard Hess textbook (C->CO from CO2 and CO combustion) [recalled, not verified]
- Statement: C+O2->CO2 (-393.5); CO+1/2O2->CO2 (-283.0). dH for C+1/2O2->CO.
- Inputs: `{"steps":[{"dH":-393.5,"coef":1},{"dH":-283.0,"coef":-1}]}`
- Expected: -110.5 kJ/mol (computed ok)
- Book: -110.5 ; tolerance: 0.001 ; constants: exact arithmetic
- Engine fn: hessLaw

### EQ-NC-018 (thermo)
- Source: NCERT XI Ch5/Ch6 Exercise (2A+B->2D, dU=-10.5 kJ, dS=-44.1 J/K, 298 K) [recalled, not verified]
- Statement: 2A(g)+B(g)->2D(g): dU=-10.5 kJ, dS=-44.1 J/K at 298 K. dG? Spontaneous? (dn_g=-1; dH=-12.98 kJ). NOTE near-zero result: sensitive to R.
- Inputs: `{"dU_kJ":-10.5,"dS_J_per_K":-44.1,"T":298,"dn_gas":-1}`
- Expected: 0.164228 kJ (computed ok)
- Book: 0.16 ; tolerance: 0.15 ; constants: R=8.314; result +0.165 not spontaneous. Use ABSOLUTE tol 0.02 kJ, not relative
- Engine fn: gibbs+deltaHfromDeltaU
- Extra: dH=-12.978 kJ dG=0.1642 kJ (R=8.314)

### EQ-NC-019 (thermo)
- Source: NCERT XI Ch5/Ch6 Example (dH vap water 40.79 kJ/mol at 373 K -> dU) [recalled, not verified]
- Statement: Vaporisation H2O(l)->H2O(g), dH=40.79 kJ/mol at 373 K. dU?
- Inputs: `{"dH_kJ":40.79,"T":373,"dn_gas":1}`
- Expected: 37.6889 kJ/mol (computed ok)
- Book: 37.7 ; tolerance: 0.005 ; constants: R=8.314
- Engine fn: deltaUfromDeltaH

### EQ-NC-020 (thermo)
- Source: standard bond-enthalpy textbook (H2+Cl2->2HCl) [recalled, not verified]
- Statement: Bond enthalpies H-H 436, Cl-Cl 242, H-Cl 431 kJ/mol. dH for H2+Cl2->2HCl.
- Inputs: `{"broken":{"H-H":436,"Cl-Cl":242},"formed":{"H-Cl":[431,2]}}`
- Expected: -184 kJ (computed ok)
- Book: -184 ; tolerance: 0.001 ; constants: exact (broken-formed = 678-862 = -184; the often-quoted -183 uses 431.5?)
- Engine fn: bondEnthalpyReaction

### EQ-NC-021 (thermo)
- Source: NCERT XI Ch5/Ch6 Example (dH=400 kJ, dS=0.2 kJ/K: spontaneous above T) [recalled, not verified]
- Statement: dH=400 kJ/mol, dS=0.2 kJ/K/mol. Minimum T for spontaneity.
- Inputs: `{"dH_kJ":400,"dS_kJ_per_K":0.2}`
- Expected: 2000 K (computed ok)
- Book: 2000 ; tolerance: 0.001 ; constants: exact
- Engine fn: spontaneityT

### EQ-NC-022 (equil)
- Source: NCERT XI Ch6 (rationalised) / Ch7 (old) Exercise (CO+H2O, Kc=4.24 at 800 K, 1 mol each in 10 L) [recalled, not verified]
- Statement: CO+H2O<=>CO2+H2, Kc=4.24 at 800 K; 1.0 mol CO and 1.0 mol H2O in 10 L. Equilibrium [CO].
- Inputs: `{"Kc":4.24,"n0":{"CO":1,"H2O":1,"CO2":0,"H2":0},"V_L":10}`
- Expected: 0.0326891 mol/L [CO]=[H2O] (CO2,H2 = 0.0673) (computed ok)
- Book: 0.0327 ; tolerance: 0.01 ; constants: dn=0
- Engine fn: equilibriumExtent
- Extra: [CO2]=[H2]=0.0673

### EQ-NC-023 (equil)
- Source: NCERT XI Ch6/Ch7 Example (Kp=2.0e10 /bar at 450 K, 2SO2+O2<=>2SO3 -> Kc) [recalled, not verified]
- Statement: Kp=2.0e10 bar^-1 at 450 K. Kc?
- Inputs: `{"Kp":2.0e10,"T":450,"dn":-1,"R_L_bar":0.0831}`
- Expected: 7.479e+11 L/mol (computed ok)
- Book: 748000000000.0 ; tolerance: 0.01 ; constants: R=0.0831 L bar/mol K
- Engine fn: Kc_from_Kp

### EQ-NC-024 (equil)
- Source: NCERT XI Ch6/Ch7 Exercise (13.8 g N2O4 in 1 L at 400 K, Ptot=9.15 bar) [recalled, not verified]
- Statement: N2O4<=>2NO2; 13.8 g N2O4 in 1 L, 400 K, total pressure 9.15 bar. Kp, Kc, partial pressures (alpha shown).
- Inputs: `{"N2O4_g":13.8,"V_L":1,"T":400,"Ptot_bar":9.15,"M":92}`
- Expected: 85.8711 Kp (bar) (computed ok)
- Book: 86 ; tolerance: 0.02 ; constants: R=0.083 L bar/mol K (book Kp~86; Kc~2.6)
- Engine fn: degreeOfDissociation/Kp,Kc
- Extra: alpha=0.8373 pN2O4=0.810 pNO2=8.340 Kc=2.586

### EQ-NC-025 (equil)
- Source: JEE-style PCl5 dissociation [constructed] [constructed]
- Statement: PCl5<=>PCl3+Cl2: 50% dissociated at 1 atm total (Kp=1/3 atm). Degree of dissociation at 2 atm.
- Inputs: `{"alpha1":0.5,"P1":1,"P2":2}`
- Expected: 0.377964 alpha (computed ok)
- Book: 0.378 ; tolerance: 0.005 ; constants: exact algebra
- Engine fn: degreeOfDissociation

### EQ-NC-026 (equil)
- Source: NCERT XI Ch6/Ch7 Example (HI, Kc=54.8 at 700 K, [HI]0=0.5 M) [recalled, not verified]
- Statement: H2+I2<=>2HI, Kc=54.8 (700 K). Start with 0.5 M HI only. Equilibrium [H2]. (book value uncertain; computed 0.0532, [HI]=0.394)
- Inputs: `{"Kc_forward":54.8,"c0":{"HI":0.5}}`
- Expected: 0.0531762 mol/L [H2]=[I2] (computed ok)
- Book: 0.0532 ; tolerance: 0.01 ; constants: book recall unreliable - trust computed
- Engine fn: equilibriumExtent
- Extra: [HI]=0.3936

### EQ-NC-027 (equil)
- Source: generic quadratic ICE: N2O4<=>2NO2 Kc=4.63e-3 [constructed] [constructed]
- Statement: 0.100 M N2O4, Kc=4.63e-3 (25 C). Solve 4x^2=Kc(0.1-x); x = extent (M); [NO2]=2x.
- Inputs: `{"Kc":4.63e-3,"c0":{"N2O4":0.1}}`
- Expected: 0.0101955 mol/L x (computed ok)
- Book: x=0.01020 ; tolerance: 1e-06 ; constants: exact quadratic root x=0.01020 M, [NO2]=0.02039 M; use rel tol 1e-6 vs exact solver
- Engine fn: equilibriumExtent (quadratic)
- Extra: [NO2]=0.02039 M

### EQ-NC-028 (equil)
- Source: NCERT XI Ch6/Ch7 Example (2/3 O2 -> O3, Kp=2.47e-29, 298 K) [recalled, not verified]
- Statement: dG for 3/2 O2 -> O3 with Kp=2.47e-29 at 298 K.
- Inputs: `{"Kp":2.47e-29,"T":298}`
- Expected: 163.2 kJ/mol (computed ok)
- Book: 163 ; tolerance: 0.01 ; constants: R=8.314
- Engine fn: gibbsFromK

### EQ-NC-029 (equil)
- Source: generic dG=-RT lnK [constructed] [constructed]
- Statement: dG=-20.0 kJ/mol at 300 K. K?
- Inputs: `{"dG_kJ":-20,"T":300}`
- Expected: 3036.93 dimensionless (computed ok)
- Book: 3040.0 ; tolerance: 0.01 ; constants: R=8.314
- Engine fn: kFromGibbs

### EQ-NC-030 (equil-LeChatelier)
- Source: NCERT XI Ch6/Ch7 text (inert gas, constant V) [recalled, not verified]
- Statement: N2+3H2<=>2NH3 at equilibrium; inert gas added at constant V. Shift?
- Inputs: `{"nu":[-1,-3,2],"n":[1,3,1],"P":10,"inert":"V"}`
- Expected: none direction (computed ok)
- Book: none ; tolerance: 0 ; constants: 
- Engine fn: leChatelierDirection

### EQ-NC-031 (equil-LeChatelier)
- Source: NCERT XI Ch6/Ch7 text (inert gas, constant P) [recalled, not verified]
- Statement: Same, but inert gas added at constant total P (volume increases). Shift?
- Inputs: `{"nu":[-1,-3,2],"n":[1,3,1],"P":10,"inert":"P"}`
- Expected: left(reactants) direction (computed ok)
- Book: left(reactants) ; tolerance: 0 ; constants: 
- Engine fn: leChatelierDirection

### EQ-NC-032 (equil-LeChatelier)
- Source: JEE/NEET-style PCl5 <=> PCl3 + Cl2, inert gas at constant P [constructed] [constructed]
- Statement: PCl5 dissociation at equilibrium, inert gas added at constant P. Shift?
- Inputs: `{"nu":[-1,1,1],"n":[1,1,1],"P":1,"inert":"P"}`
- Expected: right(products) direction (computed ok)
- Book: right(products) ; tolerance: 0 ; constants: 
- Engine fn: leChatelierDirection

### EQ-NC-033 (equil-LeChatelier)
- Source: NCERT XI Ch6/Ch7 text (exothermic NH3 synthesis, raise T 500->600 K, dH=-92.4) [recalled, not verified]
- Statement: N2+3H2<=>2NH3, dH=-92.4 kJ. Raise T. K change (K600/K500) and shift?
- Inputs: `{"dH_kJ":-92.4,"T1":500,"T2":600}`
- Expected: 0.0246102 K2/K1 (<1 => left) (computed ok)
- Book: <1 (left) ; tolerance: 0 ; constants: van't Hoff; value is ~0.0.. see output; direction=left
- Engine fn: leChatelierDirection/vanHoff
- Extra: K600/K500=0.0246

### EQ-NC-034 (equil-LeChatelier)
- Source: NCERT XI Ch6/Ch7 text (N2O4<=>2NO2, halve volume at const T) [recalled, not verified]
- Statement: N2O4<=>2NO2 equilibrium; volume halved at constant T. Q/K = 2^dn = 2 -> shifts left.
- Inputs: `{"dn":1,"V_factor":0.5}`
- Expected: 2 Q/K (computed ok)
- Book: 2.0 ; tolerance: 0.001 ; constants: exact
- Engine fn: leChatelierDirection

### EQ-NC-035 (kinetics/catalyst)
- Source: JEE/NEET-style catalyst effect [constructed] [constructed]
- Statement: Catalyst lowers Ea from 75 to 50 kJ/mol at 298 K (same A). Rate-constant ratio k_cat/k_uncat. K_eq unchanged (ratio of forward/reverse both scale equally).
- Inputs: `{"Ea1":75000,"Ea2":50000,"T":298}`
- Expected: 24113.4 k ratio (computed ok)
- Book: 24000.0 ; tolerance: 0.05 ; constants: R=8.314
- Engine fn: catalystEffect/arrhenius

### EQ-NC-036 (kinetics)
- Source: NCERT XII Ch3 (rationalised) / Ch4 (old) Example (log k=14.34-1.25e4/T) Ea part [recalled, not verified]
- Statement: H2O2 first order: log k = 14.34 - 1.25e4 K/T. Ea.
- Inputs: `{"slope_log10":-12500,"intercept":14.34}`
- Expected: 239.296 kJ/mol (computed ok)
- Book: 239.34 ; tolerance: 0.002 ; constants: R=8.314
- Engine fn: arrheniusEa

### EQ-NC-037 (kinetics)
- Source: NCERT XII Ch3/Ch4 Exercise (same: T for t1/2=256 min) [recalled, not verified]
- Statement: Same relation: temperature at which t1/2 = 256 min.
- Inputs: `{"t_half_min":256,"intercept":14.34,"slope":12500}`
- Expected: 668.966 K (computed ok)
- Book: 669 ; tolerance: 0.003 ; constants: book ~668.9
- Engine fn: firstOrderHalfLife+arrhenius

### EQ-NC-038 (kinetics)
- Source: NCERT XII Ch3/Ch4 Exercise (k=1.15e-3 s^-1, 5 g -> 3 g) [recalled, not verified]
- Statement: First order, k=1.15e-3 s^-1. Time for 5 g to become 3 g.
- Inputs: `{"k":1.15e-3,"A0":5,"A":3}`
- Expected: 444.196 s (computed ok)
- Book: 444 ; tolerance: 0.005 ; constants: book 444 s
- Engine fn: firstOrderTime

### EQ-NC-039 (kinetics)
- Source: NCERT XII Ch3/Ch4 Exercise (14C, t1/2=5730 y, 80% remaining) [recalled, not verified]
- Statement: 14C t1/2=5730 y; sample has 80% of living level. Age.
- Inputs: `{"t_half":5730,"fraction":0.80}`
- Expected: 1844.65 years (computed ok)
- Book: 1845 ; tolerance: 0.005 ; constants: book 1845 y
- Engine fn: firstOrderTime

### EQ-NC-040 (kinetics)
- Source: NCERT XII Ch3/Ch4 Exercise (initial rates, 5.07e-5, 5.07e-5, 1.43e-4) [recalled, not verified]
- Statement: A+B->P: [A]=0.30,0.30,0.60; [B]=0.30,0.60,0.30; rates 5.07e-5,5.07e-5,1.43e-4 mol/L/s. Order in A (B: zero).
- Inputs: `{"A":[0.30,0.30,0.60],"B":[0.30,0.60,0.30],"rate":[5.07e-5,5.07e-5,1.43e-4]}`
- Expected: 1.49596 order in A (computed ok)
- Book: 1.5 ; tolerance: 0.01 ; constants: computed 1.496
- Engine fn: orderFromInitialRates

### EQ-NC-041 (kinetics)
- Source: generic JEE-style initial rates, k extraction [constructed] [constructed]
- Statement: [A]=0.1,0.2,0.1; [B]=0.1,0.1,0.2; rate=2e-3,8e-3,4e-3. Order A=2,B=1; k.
- Inputs: `{"A":[0.1,0.2,0.1],"B":[0.1,0.1,0.2],"rate":[2e-3,8e-3,4e-3]}`
- Expected: 2 k (L^2/mol^2/s) (computed ok)
- Book: 2.0 ; tolerance: 0.001 ; constants: exact
- Engine fn: orderFromInitialRates+k

### EQ-NC-042 (kinetics)
- Source: NCERT XII Ch3/Ch4 Exercise (rate x4 from 293 to 313 K) [recalled, not verified]
- Statement: Rate increases 4x from 293 to 313 K. Ea.
- Inputs: `{"k2_over_k1":4,"T1":293,"T2":313}`
- Expected: 52.8503 kJ/mol (computed ok)
- Book: 52.86 ; tolerance: 0.005 ; constants: R=8.314; book log4=0.6021
- Engine fn: arrheniusEa

### EQ-NC-043 (kinetics)
- Source: NCERT XII Ch3/Ch4 Exercise (k=0.02 s^-1 at 500 K, 0.07 s^-1 at 700 K) [recalled, not verified]
- Statement: k=0.02 at 500 K, 0.07 at 700 K. Ea (A also printed).
- Inputs: `{"k1":0.02,"k2":0.07,"T1":500,"T2":700}`
- Expected: 18227.1 J/mol (computed ok)
- Book: 18230.8 ; tolerance: 0.005 ; constants: R=8.314; book 18230.8 J/mol
- Engine fn: arrheniusEa
- Extra: A=1.604 s^-1
