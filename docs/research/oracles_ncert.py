#!/usr/bin/env python3
"""Solver for EQUILIBRIUM textbook oracles. Run: python3 oracles_ncert.py [out.md]
Every answer is recomputed here; 'book' is the published (or recalled) answer; flag shows agreement within tol."""
import math, json, sys
from math import log, exp, sqrt, log10
R=8.314; RL=0.0821; RB=0.083
M=dict(H=1.008,C=12.011,N=14.007,O=15.999,Cl=35.45,Cu=63.546,S=32.06,Ca=40.078,Na=22.990,Fe=55.845,Mg=24.305,Ar=39.948,He=4.0026)
def mm(**k): return sum(M[a]*n for a,n in k.items())
P=[]
def add(id,topic,src,verified,stmt,inputs,fn,ans,unit,book,tol,consts,compute):
    P.append(dict(id=id,topic=topic,src=src,verified=verified,stmt=stmt,inputs=inputs,fn=fn,unit=unit,book=book,tol=tol,consts=consts,compute=compute))
RN="recalled, not verified"
# ---------------- mole concept
add("EQ-NC-001","mole","NCERT XI Ch1 (Eg 1.x, glucose molar mass)",RN,"Molar mass of glucose C6H12O6.",
 '{"formula":{"C":6,"H":12,"O":6}}',"molarMass",0,"g/mol",180.16,0.002,"H1.008 C12.011 O15.999 (NCERT 180.162 u)",
 lambda: mm(C=6,H=12,O=6))
add("EQ-NC-002","mole","NCERT XI Ch1 Exercise 1.x (atoms in 52 mol Ar / 52 u He / 52 g He) - part (iii)",RN,
 "Number of atoms in 52 g of He.",'{"species":"He","mass_g":52,"NA":6.022e23}',"molesFromMass/avogadro",0,"atoms",7.8e24,0.01,"He 4.0026 (book uses 4 u -> 7.83e24)",
 lambda: 52/M['He']*6.022e23)
add("EQ-NC-003","mole","NCERT XI Ch1 Exercise 1.x (HNO3 69%, d=1.41 g/mL)",RN,
 "Molarity of conc. HNO3 of density 1.41 g/mL, 69% by mass.",'{"solute":{"H":1,"N":1,"O":3},"density_g_per_mL":1.41,"mass_pct":69}',"molarityFromMassPercent",0,"mol/L",15.44,0.005,"H1.008 N14.007 O15.999 (book 63 g/mol)",
 lambda: 1.41*1000*0.69/mm(H=1,N=1,O=3))
add("EQ-NC-004","mole","NCERT XI Ch1 Exercise 1.x (sodium acetate 500 mL 0.375 M)",RN,
 "Mass of CH3COONa (M=82.0245) needed for 500 mL of 0.375 M solution.",'{"M":82.0245,"V_L":0.5,"c":0.375}',"massFromMolarity",0,"g",15.4,0.005,"M=82.0245 (book 15.38 g)",
 lambda: 0.375*0.5*82.0245)
# ---------------- stoichiometry
def nh3():
    n_n2=2000/28.0134; n_h2=1000/2.016
    ext=min(n_n2,n_h2/3); return ext*2*17.031
add("EQ-NC-005","stoich","NCERT XI Ch1 Exercise 1.x (2.00e3 g N2 + 1.00e3 g H2 -> NH3)",RN,
 "N2+3H2->2NH3; 2000 g N2 with 1000 g H2. Limiting reagent? Mass NH3? (also H2 left: 281.7 mol check in script).",
 '{"reaction":"N2+3H2->2NH3","reactants_g":{"N2":2000,"H2":1000}}',"limitingReagent+stoichYield",0,"g NH3 (limiting = N2)",2430,0.005,"N2 28.0134 H2 2.016 NH3 17.031; book 2.43e3 g",nh3)
add("EQ-NC-006","stoich","NCERT XI Ch1 Exercise 1.x (water from 16 g CH4)",RN,
 "CH4+2O2->CO2+2H2O; mass of water from complete combustion of 16 g CH4.",'{"reaction":"CH4+2O2->CO2+2H2O","CH4_g":16,"O2":"excess"}',"stoichMass",0,"g H2O",36.0,0.005,"book 36 g (M_H2O=18)",
 lambda: 16/mm(C=1,H=4)*2*mm(H=2,O=1))
add("EQ-NC-007","stoich","NCERT XI Ch1 Exercise 1.x (Cu from 100 g CuSO4)",RN,
 "Mass of Cu obtainable from 100 g CuSO4.",'{"compound":{"Cu":1,"S":1,"O":4},"mass_g":100}',"stoichMass",0,"g Cu",39.8,0.005,"Cu 63.546 (book 63.5/159.5 -> 39.8)",
 lambda: 100*M['Cu']/mm(Cu=1,S=1,O=4))
add("EQ-NC-008","stoich","generic textbook percent-yield (CaCO3 decomposition)",RN,
 "CaCO3 -> CaO + CO2. 50.0 g CaCO3 heated, actual yield 80%. Mass CO2 obtained?",'{"reaction":"CaCO3->CaO+CO2","CaCO3_g":50,"yield_pct":80}',"percentYield/stoichMass",0,"g CO2",17.6,0.01,"Ca 40.078 C12.011 O15.999; theoretical 22.0 g",
 lambda: 50/mm(Ca=1,C=1,O=3)*mm(C=1,O=2)*0.80)
def mgcl():
    nMg=6.0/M['Mg']; nHCl=0.1*2.0
    ext=min(nMg,nHCl/2); return ext*0.0224*1000  # L? 22.4 L/mol
add("EQ-NC-009","stoich","generic textbook limiting reagent (Mg + HCl) [constructed]","constructed",
 "Mg+2HCl->MgCl2+H2. 6.0 g Mg with 100 mL of 2.0 M HCl. Limiting reagent, volume H2 at STP (22.4 L/mol)?",'{"Mg_g":6.0,"HCl":{"V_L":0.1,"c":2.0},"molar_volume_STP":22.4}',"limitingReagent",0,"L H2 (limiting = HCl)",2.24,0.005,"Mg 24.305, Vm 22.4",mgcl)
# ---------------- empirical
def emp(pcts,mass):
    n={k:v/M[k] for k,v in pcts.items()}; mn=min(n.values()); return {k:v/mn for k,v in n.items()}
add("EQ-NC-010","empirical","NCERT XI Ch1 Exercise 1.x (Fe oxide 69.9% Fe, 30.1% O)",RN,
 "Empirical formula of an iron oxide with 69.9% Fe, 30.1% O. Fe:O ratio (x -> Fe2O3 = 1:1.5).",'{"Fe_pct":69.9,"O_pct":30.1}',"empiricalFormula",0,"O per Fe (Fe2O3 => 1.5)",1.5,0.01,"Fe 55.845 O 15.999",
 lambda: (30.1/M['O'])/(69.9/M['Fe']))
def cl():
    n=emp(dict(H=4.07,C=24.27,Cl=71.65),0); emp_mass=M['C']+2*M['H']+M['Cl']; return 98.96/emp_mass
add("EQ-NC-011","empirical","NCERT XI Ch1 Example 1.x (4.07% H, 24.27% C, 71.65% Cl; M=98.96)",RN,
 "Compound has 4.07% H, 24.27% C, 71.65% Cl, molar mass 98.96 g/mol: empirical CH2Cl; ratio M/M_emp = n (molecular formula C2H4Cl2).",
 '{"H_pct":4.07,"C_pct":24.27,"Cl_pct":71.65,"M":98.96}',"empiricalFormula+molecularFormula",0,"multiplier n",2,0.01,"C12.011 H1.008 Cl35.45; n=1.999",cl)
def combust():
    nC=0.44/mm(C=1,O=2); nH=2*0.18/mm(H=2,O=1); mO=0.30-nC*M['C']-nH*M['H']; nO=mO/M['O']; return nO/nC
add("EQ-NC-012","empirical","generic combustion analysis [constructed]","constructed",
 "0.300 g of C,H,O compound burns to 0.440 g CO2 and 0.180 g H2O. O by difference. Empirical formula CH2O (O:C ratio shown).",
 '{"sample_g":0.300,"CO2_g":0.440,"H2O_g":0.180}',"combustionAnalysis",0,"O:C ratio (CH2O => 1)",1.0,0.01,"C12.011 H1.008 O15.999",combust)
# ---------------- gases
add("EQ-NC-013","gas","NCERT XI States of Matter Exercise (0.5 L H2 @0.8 bar + 2 L O2 @0.7 bar into 1 L, 27C) (Ch5 pre-2023; chapter removed from rationalised XI)",RN,
 "Total pressure when 0.5 L H2 at 0.8 bar and 2.0 L O2 at 0.7 bar are put in a 1 L vessel at 27 C.",'{"gases":[{"V":0.5,"p":0.8},{"V":2.0,"p":0.7}],"Vfinal_L":1.0,"T_K":300.15}',"daltonTotalPressure",0,"bar",1.8,0.005,"Boyle's law; no R needed",
 lambda: 0.8*0.5/1+0.7*2.0/1)
add("EQ-NC-014","gas","NCERT XI States of Matter Exercise (1 g A @2 bar; +2 g B -> 3 bar)",RN,
 "1 g gas A gives 2 bar at 27 C; adding 2 g of gas B gives total 3 bar (same V,T). Find M_B/M_A.",'{"gasA_g":1,"pA_bar":2,"gasB_g":2,"ptot_bar":3}',"idealGasMoles/dalton",0,"M_B/M_A",4.0,0.001,"ratio only",
 lambda: (2.0*2.0/(3.0-2.0)) / 1.0)

add("EQ-NC-015","gas","NCERT XI States of Matter Exercise (mixture 20% H2 by weight, 1 bar)",RN,
 "H2/O2 mixture at 1 bar is 20% H2 by weight. Partial pressure of H2.",'{"H2_wt_pct":20,"O2_wt_pct":80,"P_bar":1}',"daltonPartial",0,"bar",0.8,0.01,"H2 2.016 O2 31.998",
 lambda: (20/2.016)/((20/2.016)+(80/31.998)))
# ---------------- thermo
add("EQ-NC-016","thermo","NCERT XI Ch5 (rationalised) / Ch6 (old) Exercise (35.2 g CO2 from C, dHc=-393.5)",RN,
 "dHc(C)=-393.5 kJ/mol. Heat released forming 35.2 g CO2.",'{"dH_kJ_per_mol":-393.5,"mass_g":35.2,"M":44}',"enthalpyFromMoles",0,"kJ",-314.8,0.005,"M_CO2=44.0 (44.01 gives -314.7)",
 lambda: -393.5*35.2/44.0)
add("EQ-NC-017","thermo","standard Hess textbook (C->CO from CO2 and CO combustion)",RN,
 "C+O2->CO2 (-393.5); CO+1/2O2->CO2 (-283.0). dH for C+1/2O2->CO.",'{"steps":[{"dH":-393.5,"coef":1},{"dH":-283.0,"coef":-1}]}',"hessLaw",0,"kJ/mol",-110.5,0.001,"exact arithmetic",
 lambda: -393.5-(-283.0))
def ncert_dg():
    dU=-10.5; dn=-1; dH=dU+dn*R*298/1000; dS=-44.1/1000; return dH-298*dS
add("EQ-NC-018","thermo","NCERT XI Ch5/Ch6 Exercise (2A+B->2D, dU=-10.5 kJ, dS=-44.1 J/K, 298 K)",RN,
 "2A(g)+B(g)->2D(g): dU=-10.5 kJ, dS=-44.1 J/K at 298 K. dG? Spontaneous? (dn_g=-1; dH=-12.98 kJ). NOTE near-zero result: sensitive to R.",
 '{"dU_kJ":-10.5,"dS_J_per_K":-44.1,"T":298,"dn_gas":-1}',"gibbs+deltaHfromDeltaU",0,"kJ",0.16,0.15,"R=8.314; result +0.165 not spontaneous. Use ABSOLUTE tol 0.02 kJ, not relative",ncert_dg)
add("EQ-NC-019","thermo","NCERT XI Ch5/Ch6 Example (dH vap water 40.79 kJ/mol at 373 K -> dU)",RN,
 "Vaporisation H2O(l)->H2O(g), dH=40.79 kJ/mol at 373 K. dU?",'{"dH_kJ":40.79,"T":373,"dn_gas":1}',"deltaUfromDeltaH",0,"kJ/mol",37.7,0.005,"R=8.314",
 lambda: 40.79-1*R*373/1000)
add("EQ-NC-020","thermo","standard bond-enthalpy textbook (H2+Cl2->2HCl)",RN,
 "Bond enthalpies H-H 436, Cl-Cl 242, H-Cl 431 kJ/mol. dH for H2+Cl2->2HCl.",'{"broken":{"H-H":436,"Cl-Cl":242},"formed":{"H-Cl":[431,2]}}',"bondEnthalpyReaction",0,"kJ",-184,0.001,"exact (broken-formed = 678-862 = -184; the often-quoted -183 uses 431.5?)",
 lambda: (436+242)-2*431)
add("EQ-NC-021","thermo","NCERT XI Ch5/Ch6 Example (dH=400 kJ, dS=0.2 kJ/K: spontaneous above T)",RN,
 "dH=400 kJ/mol, dS=0.2 kJ/K/mol. Minimum T for spontaneity.",'{"dH_kJ":400,"dS_kJ_per_K":0.2}',"spontaneityT",0,"K",2000,0.001,"exact",
 lambda: 400/0.2)
# ---------------- equilibrium
def co():
    Kc=4.24; r=sqrt(Kc); x=r*0.1/(1+r); return 0.1-x
add("EQ-NC-022","equil","NCERT XI Ch6 (rationalised) / Ch7 (old) Exercise (CO+H2O, Kc=4.24 at 800 K, 1 mol each in 10 L)",RN,
 "CO+H2O<=>CO2+H2, Kc=4.24 at 800 K; 1.0 mol CO and 1.0 mol H2O in 10 L. Equilibrium [CO].",'{"Kc":4.24,"n0":{"CO":1,"H2O":1,"CO2":0,"H2":0},"V_L":10}',"equilibriumExtent",0,"mol/L [CO]=[H2O] (CO2,H2 = 0.0673)",0.0327,0.01,"dn=0",co)
add("EQ-NC-023","equil","NCERT XI Ch6/Ch7 Example (Kp=2.0e10 /bar at 450 K, 2SO2+O2<=>2SO3 -> Kc)",RN,
 "Kp=2.0e10 bar^-1 at 450 K. Kc?",'{"Kp":2.0e10,"T":450,"dn":-1,"R_L_bar":0.0831}',"Kc_from_Kp",0,"L/mol",7.48e11,0.01,"R=0.0831 L bar/mol K",
 lambda: 2.0e10*0.0831*450)
def n2o4():
    n0=13.8/92.0; p0=n0*RB*400/1.0; a=9.15/p0-1
    return dict(alpha=a,pN2O4=p0*(1-a),pNO2=2*a*p0,Kp=(2*a*p0)**2/(p0*(1-a)),Kc=(2*a*p0)**2/(p0*(1-a))/(RB*400))
add("EQ-NC-024","equil","NCERT XI Ch6/Ch7 Exercise (13.8 g N2O4 in 1 L at 400 K, Ptot=9.15 bar)",RN,
 "N2O4<=>2NO2; 13.8 g N2O4 in 1 L, 400 K, total pressure 9.15 bar. Kp, Kc, partial pressures (alpha shown).",'{"N2O4_g":13.8,"V_L":1,"T":400,"Ptot_bar":9.15,"M":92}',"degreeOfDissociation/Kp,Kc",0,"Kp (bar)",86,0.02,"R=0.083 L bar/mol K (book Kp~86; Kc~2.6)",lambda: n2o4()['Kp'])
def pcl5():
    Kp=0.25/0.75; return sqrt(Kp/(Kp+2.0))
add("EQ-NC-025","equil","JEE-style PCl5 dissociation [constructed]","constructed",
 "PCl5<=>PCl3+Cl2: 50% dissociated at 1 atm total (Kp=1/3 atm). Degree of dissociation at 2 atm.",'{"alpha1":0.5,"P1":1,"P2":2}',"degreeOfDissociation",0,"alpha",0.378,0.005,"exact algebra",pcl5)
def hi():
    r=sqrt(1/54.8); x=r*0.5/(1+2*r); return x
add("EQ-NC-026","equil","NCERT XI Ch6/Ch7 Example (HI, Kc=54.8 at 700 K, [HI]0=0.5 M)",RN,
 "H2+I2<=>2HI, Kc=54.8 (700 K). Start with 0.5 M HI only. Equilibrium [H2]. (book value uncertain; computed 0.0532, [HI]=0.394)",'{"Kc_forward":54.8,"c0":{"HI":0.5}}',"equilibriumExtent",0,"mol/L [H2]=[I2]",0.0532,0.01,"book recall unreliable - trust computed",hi)
def quad():
    Kc=4.63e-3; c=0.1; # 4x^2 = Kc(c-x)
    a=4;b=Kc;cc=-Kc*c; return (-b+sqrt(b*b-4*a*cc))/(2*a)
add("EQ-NC-027","equil","generic quadratic ICE: N2O4<=>2NO2 Kc=4.63e-3 [constructed]","constructed",
 "0.100 M N2O4, Kc=4.63e-3 (25 C). Solve 4x^2=Kc(0.1-x); x = extent (M); [NO2]=2x.",'{"Kc":4.63e-3,"c0":{"N2O4":0.1}}',"equilibriumExtent (quadratic)",0,"mol/L x",0.0102,1e-6,"exact quadratic root x=0.01020 M, [NO2]=0.02039 M; use rel tol 1e-6 vs exact solver",quad)
add("EQ-NC-028","equil","NCERT XI Ch6/Ch7 Example (2/3 O2 -> O3, Kp=2.47e-29, 298 K)",RN,
 "dG for 3/2 O2 -> O3 with Kp=2.47e-29 at 298 K.",'{"Kp":2.47e-29,"T":298}',"gibbsFromK",0,"kJ/mol",163,0.01,"R=8.314",
 lambda: -R*298*log(2.47e-29)/1000)
add("EQ-NC-029","equil","generic dG=-RT lnK [constructed]","constructed",
 "dG=-20.0 kJ/mol at 300 K. K?",'{"dG_kJ":-20,"T":300}',"kFromGibbs",0,"dimensionless",3.04e3,0.01,"R=8.314",
 lambda: exp(20000/(R*300)))
# Le Chatelier numerics
def lc_inert(nu,n,Pt,mode):
    ntot=sum(n); K=1
    for s,x in zip(nu,n): K*=(x*Pt/ntot)**s
    m=1.0
    if mode=="V": Q=K
    else:
        Q=1
        for s,x in zip(nu,n): Q*=(x*Pt/(ntot+m))**s
    return "none" if abs(Q/K-1)<1e-12 else ("left(reactants)" if Q>K else "right(products)")
add("EQ-NC-030","equil-LeChatelier","NCERT XI Ch6/Ch7 text (inert gas, constant V)",RN,
 "N2+3H2<=>2NH3 at equilibrium; inert gas added at constant V. Shift?",'{"nu":[-1,-3,2],"n":[1,3,1],"P":10,"inert":"V"}',"leChatelierDirection",0,"direction","none",0,"",
 lambda: lc_inert([-1,-3,2],[1,3,1],10,"V"))
add("EQ-NC-031","equil-LeChatelier","NCERT XI Ch6/Ch7 text (inert gas, constant P)",RN,
 "Same, but inert gas added at constant total P (volume increases). Shift?",'{"nu":[-1,-3,2],"n":[1,3,1],"P":10,"inert":"P"}',"leChatelierDirection",0,"direction","left(reactants)",0,"",
 lambda: lc_inert([-1,-3,2],[1,3,1],10,"P"))
add("EQ-NC-032","equil-LeChatelier","JEE/NEET-style PCl5 <=> PCl3 + Cl2, inert gas at constant P [constructed]","constructed",
 "PCl5 dissociation at equilibrium, inert gas added at constant P. Shift?",'{"nu":[-1,1,1],"n":[1,1,1],"P":1,"inert":"P"}',"leChatelierDirection",0,"direction","right(products)",0,"",
 lambda: lc_inert([-1,1,1],[1,1,1],1,"P"))
def vh(dH,T1,T2): return exp(-dH*1000/R*(1/T2-1/T1))
add("EQ-NC-033","equil-LeChatelier","NCERT XI Ch6/Ch7 text (exothermic NH3 synthesis, raise T 500->600 K, dH=-92.4)",RN,
 "N2+3H2<=>2NH3, dH=-92.4 kJ. Raise T. K change (K600/K500) and shift?",'{"dH_kJ":-92.4,"T1":500,"T2":600}',"leChatelierDirection/vanHoff",0,"K2/K1 (<1 => left)",0.0,0,"van't Hoff; value is ~0.0.. see output; direction=left",
 lambda: vh(-92.4,500,600))
add("EQ-NC-034","equil-LeChatelier","NCERT XI Ch6/Ch7 text (N2O4<=>2NO2, halve volume at const T)",RN,
 "N2O4<=>2NO2 equilibrium; volume halved at constant T. Q/K = 2^dn = 2 -> shifts left.",'{"dn":1,"V_factor":0.5}',"leChatelierDirection",0,"Q/K",2.0,0.001,"exact",
 lambda: 2.0**1)
# catalyst
add("EQ-NC-035","kinetics/catalyst","JEE/NEET-style catalyst effect [constructed]","constructed",
 "Catalyst lowers Ea from 75 to 50 kJ/mol at 298 K (same A). Rate-constant ratio k_cat/k_uncat. K_eq unchanged (ratio of forward/reverse both scale equally).",
 '{"Ea1":75000,"Ea2":50000,"T":298}',"catalystEffect/arrhenius",0,"k ratio",2.4e4,0.05,"R=8.314",
 lambda: exp(25000/(R*298)))
# ---------------- kinetics
add("EQ-NC-036","kinetics","NCERT XII Ch3 (rationalised) / Ch4 (old) Example (log k=14.34-1.25e4/T) Ea part",RN,
 "H2O2 first order: log k = 14.34 - 1.25e4 K/T. Ea.",'{"slope_log10":-12500,"intercept":14.34}',"arrheniusEa",0,"kJ/mol",239.34,0.002,"R=8.314",
 lambda: 12500*log(10)*R/1000)
add("EQ-NC-037","kinetics","NCERT XII Ch3/Ch4 Exercise (same: T for t1/2=256 min)",RN,
 "Same relation: temperature at which t1/2 = 256 min.",'{"t_half_min":256,"intercept":14.34,"slope":12500}',"firstOrderHalfLife+arrhenius",0,"K",669,0.003,"book ~668.9",
 lambda: 12500/(14.34-log10(log(2)/(256*60))))
add("EQ-NC-038","kinetics","NCERT XII Ch3/Ch4 Exercise (k=1.15e-3 s^-1, 5 g -> 3 g)",RN,
 "First order, k=1.15e-3 s^-1. Time for 5 g to become 3 g.",'{"k":1.15e-3,"A0":5,"A":3}',"firstOrderTime",0,"s",444,0.005,"book 444 s",
 lambda: log(5/3)/1.15e-3)
add("EQ-NC-039","kinetics","NCERT XII Ch3/Ch4 Exercise (14C, t1/2=5730 y, 80% remaining)",RN,
 "14C t1/2=5730 y; sample has 80% of living level. Age.",'{"t_half":5730,"fraction":0.80}',"firstOrderTime",0,"years",1845,0.005,"book 1845 y",
 lambda: 5730/log(2)*log(1/0.8))
add("EQ-NC-040","kinetics","NCERT XII Ch3/Ch4 Exercise (initial rates, 5.07e-5, 5.07e-5, 1.43e-4)",RN,
 "A+B->P: [A]=0.30,0.30,0.60; [B]=0.30,0.60,0.30; rates 5.07e-5,5.07e-5,1.43e-4 mol/L/s. Order in A (B: zero).",
 '{"A":[0.30,0.30,0.60],"B":[0.30,0.60,0.30],"rate":[5.07e-5,5.07e-5,1.43e-4]}',"orderFromInitialRates",0,"order in A",1.5,0.01,"computed 1.496",
 lambda: log(1.43e-4/5.07e-5)/log(2))
add("EQ-NC-041","kinetics","generic JEE-style initial rates, k extraction [constructed]","constructed",
 "[A]=0.1,0.2,0.1; [B]=0.1,0.1,0.2; rate=2e-3,8e-3,4e-3. Order A=2,B=1; k.",'{"A":[0.1,0.2,0.1],"B":[0.1,0.1,0.2],"rate":[2e-3,8e-3,4e-3]}',"orderFromInitialRates+k",0,"k (L^2/mol^2/s)",2.0,0.001,"exact",
 lambda: 2e-3/(0.1**2*0.1))
add("EQ-NC-042","kinetics","NCERT XII Ch3/Ch4 Exercise (rate x4 from 293 to 313 K)",RN,
 "Rate increases 4x from 293 to 313 K. Ea.",'{"k2_over_k1":4,"T1":293,"T2":313}',"arrheniusEa",0,"kJ/mol",52.86,0.005,"R=8.314; book log4=0.6021",
 lambda: R*log(4)*293*313/20/1000)
def ea2():
    k1,k2,T1,T2=0.02,0.07,500,700
    Ea=R*log(k2/k1)*T1*T2/(T2-T1); A=k1/exp(-Ea/(R*T1)); return Ea,A
add("EQ-NC-043","kinetics","NCERT XII Ch3/Ch4 Exercise (k=0.02 s^-1 at 500 K, 0.07 s^-1 at 700 K)",RN,
 "k=0.02 at 500 K, 0.07 at 700 K. Ea (A also printed).",'{"k1":0.02,"k2":0.07,"T1":500,"T2":700}',"arrheniusEa",0,"J/mol",18230.8,0.005,"R=8.314; book 18230.8 J/mol",lambda: ea2()[0])
if __name__=="__main__":
    rows=[];det=[]
    bad=0
    for p in P:
        v=p['compute']()
        if isinstance(v,dict): v=v['Kp'] if p['id']=="EQ-NC-024" else v
        if isinstance(v,str):
            ok=(v==p['book']); val=v
        else:
            val=v; b=p['book']
            if p['id']=="EQ-NC-018": ok=abs(v-0.165)<0.02
            elif p['id']=="EQ-NC-033": ok=v<1; p['book']="<1 (left)"
            elif p['id']=="EQ-NC-027": ok=abs(4*v*v-4.63e-3*(0.1-v))<1e-12; p['book']="x=%.5f"%v
            elif b==0: ok=True
            else: ok=abs(v-b)/abs(b)<=max(p['tol'],1e-9)
        p['val']=val; p['ok']=ok
        if not ok: bad+=1
    extras={"EQ-NC-005":"H2 left = %.1f mol"%(1000/2.016-3*2000/28.0134),
            "EQ-NC-024":"alpha=%.4f pN2O4=%.3f pNO2=%.3f Kc=%.3f"%tuple(n2o4()[k] for k in ('alpha','pN2O4','pNO2','Kc')),
            "EQ-NC-018":"dH=%.3f kJ dG=%.4f kJ (R=8.314)"%(-10.5-R*298/1000,ncert_dg()),
            "EQ-NC-043":"A=%.4g s^-1"%ea2()[1],
            "EQ-NC-027":"[NO2]=%.5f M"%(2*quad()),
            "EQ-NC-026":"[HI]=%.4f"%(0.5-2*hi()),
            "EQ-NC-022":"[CO2]=[H2]=%.4f"%(0.1-co()),
            "EQ-NC-033":"K600/K500=%.3g"%vh(-92.4,500,600)}
    out=["# EQUILIBRIUM textbook oracles (NCERT / JEE / NEET)\n",
     "Numbering used: rationalised NCERT (2023+): XI Ch1 Some Basic Concepts, XI Ch5 Thermodynamics, XI Ch6 Equilibrium, XII Ch3 Chemical Kinetics. Old numbering: XI Ch6 / Ch7, XII Ch4. States of Matter (old XI Ch5) was dropped in rationalised XI. XI Ch5/6/7 numbers in 'src' are given both ways.\n",
     "CITATION STATUS: no source text was fetched from the web in this pass. Items marked 'recalled, not verified' are reconstructed from memory (numbers match published answers as recalled; the computed value is authoritative). Items marked 'constructed' are original problems in textbook style, not real citations - do not present them as NCERT/JEE.\n",
     "'computed' = this script; 'book' = published/recalled answer; tol is relative unless noted.\n",
     "| id | topic | source | citation | computed | unit | book | tol | engine fn | agree |","|---|---|---|---|---|---|---|---|---|---|"]
    for p in P:
        val=p['val']; vs=val if isinstance(val,str) else "%.6g"%val
        out.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |"%(p['id'],p['topic'],p['src'],p['verified'],vs,p['unit'],p['book'],p['tol'],p['fn'],"yes" if p['ok'] else "NO"))
    out.append("\n## Details\n")
    for p in P:
        out.append("### %s (%s)\n- Source: %s [%s]\n- Statement: %s\n- Inputs: `%s`\n- Expected: %s %s (computed %s)\n- Book: %s ; tolerance: %s ; constants: %s\n- Engine fn: %s%s\n"%(
            p['id'],p['topic'],p['src'],p['verified'],p['stmt'],p['inputs'],
            p['val'] if isinstance(p['val'],str) else "%.6g"%p['val'],p['unit'],"ok" if p['ok'] else "MISMATCH",p['book'],p['tol'],p['consts'],p['fn'],
            ("\n- Extra: "+extras[p['id']]) if p['id'] in extras else ""))
    s="\n".join(out)
    open(sys.argv[1] if len(sys.argv)>1 else "oracles_ncert.md","w").write(s)
    for p in P: print(p['id'],p['topic'],p['val'] if isinstance(p['val'],str) else round(p['val'],5),p['book'],"OK" if p['ok'] else "MISMATCH")
    print(len(P),"problems;",bad,"mismatch"); print(extras)
