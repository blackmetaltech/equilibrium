#!/usr/bin/env python3
"""EQUILIBRIUM textbook oracles. Solves every problem independently and writes oracles_cheme.md.
Run: python3 oracles_cheme.py  (writes md next to this file)"""
import json, math, os
import numpy as np
from scipy.optimize import brentq, fsolve
from scipy.integrate import quad, solve_ivp

R = 8.314462618
P = []
def add(id, topic, source, verified, statement, inputs, answers, tol, why, assum, cap, book="same as computed (book answer not independently verified)"):
    P.append(dict(id=id, topic=topic, source=source, verified=verified, statement=statement, inputs=inputs,
                  answers=answers, book=book, tol=tol, why=why, assum=assum, cap=cap))
def r(x, n=5):
    if isinstance(x, (list, tuple, np.ndarray)): return [r(v, n) for v in x]
    if isinstance(x, dict): return {k: r(v, n) for k, v in x.items()}
    return float(f"{x:.{n}g}") if isinstance(x, (float, np.floating)) else x
RN = "recalled, not verified"

# ---------- Felder Cp (kJ/mol/degC, T in degC) Table B.2 (recalled) ----------
CPF = {  # a, b e-5, c e-8, d e-12  -> Cp = a + bT + cT^2 + dT^3 (a in e-3)
 'N2': (29.00e-3, 0.2199e-5, 0.5723e-8, -2.871e-12),
 'O2': (29.10e-3, 1.158e-5, -0.6076e-8, 1.311e-12),
 'CO2': (36.11e-3, 4.233e-5, -2.887e-8, 7.464e-12),
 'H2O': (33.46e-3, 0.6880e-5, 0.7604e-8, -3.593e-12),
 'CH4': (34.31e-3, 5.469e-5, 0.3661e-8, -11.00e-12),
 'CO': (28.95e-3, 0.4110e-5, 0.3548e-8, -2.220e-12),
 'H2': (28.84e-3, 0.00765e-5, 0.3288e-8, -0.8698e-12),
 'CH3OH': (42.93e-3, 8.301e-5, -1.87e-8, -8.03e-12)}
HFF = {'CH4': -74.85, 'CO2': -393.5, 'H2O': -241.83, 'CO': -110.52, 'CH3OH': -200.7, 'H2': 0, 'O2': 0, 'N2': 0}  # kJ/mol
def HF(sp, T):  # sensible enthalpy from 25C, kJ/mol
    a, b, c, d = CPF[sp]
    f = lambda t: a*t + b*t**2/2 + c*t**3/3 + d*t**4/4
    return f(T) - f(25.0)
def Hsum(flows, T): return sum(n*HF(s, T) for s, n in flows.items())
FELDER_ASSUM = "Felder Table B.2 Cp polynomials (kJ/mol/degC, T in degC; coefficients recalled) and Table B.1 dHf (kJ/mol); reference 25 C, gas phase; engine must use the identical coefficients listed in the problem inputs"
FELDER_CPIN = {k: list(v) for k, v in CPF.items()}

# ===== Felder 1: NH3 oxidation extent
xi = 0.5*100/4
add("EQ-CE-001", "Felder-material", "Felder 4th ed, Ch.4 reactive-system extent-of-reaction (cf. Ex 4.6-x NH3 oxidation); "+RN,
 False, "4NH3+5O2->4NO+6H2O. Feed 100 mol NH3 + 200 mol O2; fractional conversion of NH3 = 0.50. Find product moles and extent.",
 dict(species=["NH3","O2","NO","H2O"], nu=[-4,-5,4,6], feed=[100,200,0,0], conv_NH3=0.5),
 dict(xi=xi, NH3=50, O2=200-5*xi/1, NO=4*xi, H2O=6*xi, total=100+200+xi*1), 0.005, "exact stoichiometry", "none (mass balance only)", "reactorStoich (fractional conversion)")
# fix O2 = 200-5*xi
P[-1]['answers']['O2'] = 200-5*xi; P[-1]['answers']['total'] = 50+200-5*xi+4*xi+6*xi

# ===== 2: ethylene oxide two reactions
A = np.array([[1,1],[-8,1]],float)  # xi1+xi2=25 ; xi1 = 8*xi2 -> -xi1+8xi2=0
A = np.array([[1,1],[1,-8]],float); x1,x2 = np.linalg.solve(A,[25,0])
feed = dict(C2H4=100, O2=100)
out = dict(C2H4=100-x1-x2, O2=100-0.5*x1-3*x2, C2H4O=x1, CO2=2*x2, H2O=2*x2)
add("EQ-CE-002","Felder-material","Felder 4th ed, Ex 4.6-x ethylene oxide w/ side reaction (style); "+RN,False,
 "C2H4+1/2O2->C2H4O (r1); C2H4+3O2->2CO2+2H2O (r2). Feed 100 mol C2H4, 100 mol O2. C2H4 conversion 25%; mole ratio C2H4O:CO2 in product = 4. Find outlet moles.",
 dict(species=["C2H4","O2","C2H4O","CO2","H2O"],nu=[[-1,-.5,1,0,0],[-1,-3,0,2,2]],feed=[100,100,0,0,0],conv_C2H4=0.25,ratio_EO_CO2=4),
 dict(xi1=x1,xi2=x2,**out,selectivity_EO_per_C2H4_reacted=x1/25), 0.005,"exact stoich","none","reactorStoich (multiple reactions, 2 extents)")

# ===== 3 methane 20% excess
n_o2 = 200*1.2; n_n2 = n_o2*79/21; dry = 100+(n_o2-200)+n_n2
add("EQ-CE-003","Felder-material","Felder 4th ed, Ch.4 combustion w/ excess air (style); "+RN,False,
 "100 mol CH4 burned completely in air (21% O2/79% N2) with 20% excess air. Product moles and dry-basis mole fractions.",
 dict(fuel="CH4",basis_mol=100,excess_air=0.2,air=dict(O2=.21,N2=.79),conv=1.0),
 dict(CO2=100,H2O=200,O2=n_o2-200,N2=n_n2,y_dry=dict(CO2=100/dry,O2=(n_o2-200)/dry,N2=n_n2/dry),air_fed=n_o2/.21), 0.005,"exact","air 21/79","combustion complete + excessAir")

# ===== 4 propane 25% excess, CO
nfed = 100*5*1.25; N2 = nfed*79/21
co2_p = 81; co_p = 9
o2_used = 81*5 + 9*3.5
out = dict(C3H8=10, CO2=3*81, CO=3*9, H2O=4*90, O2=nfed-o2_used, N2=N2)
add("EQ-CE-004","Felder-material","Felder 4th ed, Ch.4 combustion w/ incomplete burning (style); "+RN,False,
 "100 mol C3H8 fed with 25% excess air; 90% of the propane burns; of the propane that burns, 10% goes to CO (C3H8+3.5O2->3CO+4H2O) and 90% to CO2. Find outlet composition.",
 dict(fuel="C3H8",basis_mol=100,excess_air=0.25,burned_frac=0.9,frac_burned_to_CO=0.1),
 dict(out=out,total=sum(out.values()),y_wet={k:v/sum(out.values()) for k,v in out.items()}),0.005,"exact","air 21/79; excess air based on complete combustion of all fed fuel","combustion partial + atom balance")

# ===== recycle/purge generic
def recycle_purge(fresh, nu, key, conv_key_sp, X, p, tol=1e-12):
    """Reactor -> condenser(removes products) -> split purge p / recycle 1-p.  fresh: dict species flows (reactants+inert).
    Product species (nu>0) leave in liquid stream. Reactor single-pass conversion X of conv_key_sp."""
    sp = list(nu.keys()); rec = {s:0.0 for s in sp}; hist=[]
    for it in range(1,2000):
        feed = {s: fresh.get(s,0)+rec[s] for s in sp}
        xi_ = X*feed[conv_key_sp]/(-nu[conv_key_sp])
        outg = {s: feed[s]+nu[s]*xi_ for s in sp if nu[s] <= 0}
        outg.update({s: 0.0 for s in sp if nu[s] > 0})
        new = {s:(1-p)*outg[s] for s in sp}
        err = max(abs(new[s]-rec[s]) for s in sp); rec=new; hist.append(err)
        if err < tol: break
    feed = {s: fresh.get(s,0)+rec[s] for s in sp}; xi_ = X*feed[conv_key_sp]/(-nu[conv_key_sp])
    prod = {s: nu[s]*xi_ for s in sp if nu[s]>0}
    purge = {s: p*outg[s] for s in sp if nu[s]<=0}
    return dict(iters=it, feed=feed, xi=xi_, product=prod, purge=purge, recycle=rec, hist=hist)
def rp_alg(fresh, nu, key, X, p):
    # algebraic check via fsolve on reactor feed
    sp=list(nu.keys())
    def f(v):
        feed=dict(zip(sp,v)); xi_=X*feed[key]/(-nu[key]); res=[]
        for s in sp:
            og = feed[s]+nu[s]*xi_ if nu[s]<=0 else 0
            res.append(feed[s]-fresh.get(s,0)-(1-p)*og)
        return res
    return dict(zip(sp,fsolve(f,[max(fresh.get(s,1),1) for s in sp],xtol=1e-13)))

nuM = dict(CO=-1,H2=-2,CH3OH=1,N2=0)
freshM = dict(CO=33.,H2=66.,N2=1.)
res = recycle_purge(freshM,nuM,None,'CO',0.20,0.10); alg = rp_alg(freshM,nuM,'CO',0.20,0.10)
for s in alg: assert abs(alg[s]-res['feed'][s])<1e-8,(s,alg[s],res['feed'][s])
assert abs(res['feed']['CO']-33/0.28)<1e-8 and abs(res['feed']['N2']-10)<1e-8
convCO = 1-res['purge']['CO']/33
add("EQ-CE-005","Felder-recycle-purge","Felder 4th ed, Ch.4.7 recycle & purge, methanol synthesis (cf. Problem 4.4x, with inert); "+RN,False,
 "Fresh feed 100 mol/h: 33 CO, 66 H2, 1 N2 (inert). Reactor CO+2H2->CH3OH, single-pass CO conversion 20% (of CO entering reactor). Condenser removes all CH3OH as liquid; uncondensed gas split: 10% purge, 90% recycle to reactor inlet. Solve to convergence; report reactor inlet, methanol production, purge, overall CO conversion, N2 mole fraction at reactor inlet.",
 dict(species=["CO","H2","CH3OH","N2"],nu=[-1,-2,1,0],fresh=[33,66,0,1],single_pass_conv_CO=0.2,purge_fraction=0.10,separator="all CH3OH to liquid, all others to gas"),
 dict(reactor_feed=res['feed'],xi=res['xi'],CH3OH=res['product']['CH3OH'],purge=res['purge'],recycle=res['recycle'],overall_conv_CO=convCO,y_N2_reactor_inlet=res['feed']['N2']/sum(res['feed'].values()),sequential_substitution_iters=res['iters']),
 0.002,"closed-form solution exists (N2 balance: N2_in = 1/purge_frac = 10); sequential substitution must converge to same value (engine tear tol <=1e-6 rel)","ideal splitter","recyclePurgeTear (inert buildup, tear convergence)")

nuN = dict(N2=-1,H2=-3,NH3=2,Ar=0)
freshN = dict(N2=24.9,H2=74.8,Ar=0.3)
resN = recycle_purge(freshN,nuN,None,'N2',0.25,0.05); algN=rp_alg(freshN,nuN,'N2',0.25,0.05)
for s in algN: assert abs(algN[s]-resN['feed'][s])<1e-7
add("EQ-CE-006","Felder-recycle-purge","Felder 4th ed, Ch.4 ammonia synthesis recycle/purge w/ Ar inert (style, cf. Problem 4.5x); "+RN,False,
 "Fresh feed 100 mol/h: 24.9 N2, 74.8 H2, 0.3 Ar. N2+3H2->2NH3, single-pass N2 conversion 25%. Condenser removes all NH3; remaining gas: 5% purge, 95% recycle. Solve the loop.",
 dict(species=["N2","H2","NH3","Ar"],nu=[-1,-3,2,0],fresh=[24.9,74.8,0,0.3],single_pass_conv_N2=0.25,purge_fraction=0.05),
 dict(reactor_feed=resN['feed'],xi=resN['xi'],NH3=resN['product']['NH3'],purge=resN['purge'],purge_mole_frac_Ar=resN['purge']['Ar']/sum(resN['purge'].values()),y_Ar_reactor_inlet=resN['feed']['Ar']/sum(resN['feed'].values()),iters=resN['iters']),
 0.002,"closed form: Ar_in=0.3/0.05=6","ideal splitter","recyclePurgeTear (inert buildup)")

# ===== Antoine (Felder B.4, mmHg, degC)
ANT = dict(benzene=(6.89272,1203.531,219.888),toluene=(6.95805,1346.773,219.693),ethylbenzene=(6.95650,1423.54,213.21),water=(8.07131,1730.63,233.426))
def psat(s,T): a,b,c=ANT[s]; return 10**(a-b/(c+T))
ANTIN={k:list(v) for k,v in ANT.items()}
sp3=['benzene','toluene','ethylbenzene']; z3=[0.4,0.3,0.3]; Pt=760.; T=105.
K3=[psat(s,T)/Pt for s in sp3]
rr=lambda V: sum(z*(k-1)/(1+V*(k-1)) for z,k in zip(z3,K3))
V=brentq(rr,0,1); x=[z/(1+V*(k-1)) for z,k in zip(z3,K3)]; y=[k*xi for k,xi in zip(K3,x)]
assert abs(sum(x)-1)<1e-9 and abs(sum(y)-1)<1e-9 and rr(0)>0>rr(1)
add("EQ-CE-007","Felder-flash","Felder 4th ed, Ch.6.4-6.5 Raoult's-law flash (Rachford-Rice form, Antoine Table B.4); "+RN,False,
 "Equimolar-ish feed z = benzene 0.4 / toluene 0.3 / ethylbenzene 0.3 flashed at 105 C and 760 mmHg, Raoult's law ideal. Find V/F, x, y.",
 dict(species=sp3,z=z3,T_C=T,P_mmHg=Pt,antoine_log10_mmHg_C=ANTIN),
 dict(Psat_mmHg=[psat(s,T) for s in sp3],K=K3,V_over_F=V,x=x,y=y),0.003,"exact data; V/F root of RR is well conditioned","Raoult's law, ideal vapor","flashRachfordRice")
# ===== 8 bubble pt
def bub(T): return 0.5*psat('benzene',T)+0.5*psat('toluene',T)-760
Tb=brentq(bub,50,150); yb=0.5*psat('benzene',Tb)/760
add("EQ-CE-008","Felder-flash","Felder 4th ed, Ex 6.4-x bubble point of benzene-toluene (style); "+RN,False,
 "Bubble-point temperature and first-vapor composition of liquid x_benzene=0.5 / toluene 0.5 at 760 mmHg.",
 dict(x=[.5,.5],species=['benzene','toluene'],P_mmHg=760,antoine=ANTIN),dict(T_bubble_C=Tb,y_benzene=yb),0.002,"exact data (0.1 C abs. ok)","Raoult","bubblePointT")
def dew(T): return 1/(0.5/psat('benzene',T)+0.5/psat('toluene',T))-760  # sum y/P* ... dew: sum y_i P/P*_i=1
def dewf(T): return 760*(0.5/psat('benzene',T)+0.5/psat('toluene',T))-1
Td=brentq(dewf,50,150); xd=0.5*760/psat('benzene',Td)
add("EQ-CE-009","Felder-flash","Felder 4th ed, Ex 6.4-x dew point (style); "+RN,False,
 "Dew-point temperature and first-liquid composition of vapor y_benzene=0.5 / toluene 0.5 at 760 mmHg.",
 dict(y=[.5,.5],species=['benzene','toluene'],P_mmHg=760,antoine=ANTIN),dict(T_dew_C=Td,x_benzene=xd),0.002,"exact data","Raoult","dewPointT")
# ===== 10 water condensation
Tc=40.; ps=psat('water',Tc); vap=80*ps/(760-ps); cond=20-vap
dewT=brentq(lambda t:psat('water',t)-0.2*760,1,100)
add("EQ-CE-010","Felder-flash","Felder 4th ed, Ch.6.3 single-condensable-component condensation (style, Ex 6.3-x); "+RN,False,
 "100 mol/h gas, 20 mol% water vapor + 80% dry air at 760 mmHg is cooled to 40 C at constant pressure. Find feed dew point, mol/h water condensed and gas-out water mole fraction.",
 dict(feed=dict(H2O=20,air=80),T_out_C=40,P_mmHg=760,antoine_water=ANTIN['water']),
 dict(dewpoint_C=dewT,p_sat_40C_mmHg=ps,H2O_condensed=cond,H2O_vapor_out=vap,y_H2O_out=vap/(80+vap)),0.003,"exact data","air non-condensable, no air dissolves","condensation (single condensable VLE)")

# ===== 11 adiabatic flame
def flame(excess, T0=25.):
    o2=2*(1+excess); n2=o2*79/21
    prod=dict(CO2=1,H2O=2,O2=o2-2,N2=n2)
    dHc=HFF['CO2']+2*HFF['H2O']-HFF['CH4']
    f=lambda T: Hsum(prod,T)+dHc   # reactants at 25C
    return brentq(f,25,4000),prod,dHc
Tf,prodf,dHc=flame(0.25)
add("EQ-CE-011","Felder-energy","Felder 4th ed, Ch.9.5 adiabatic flame temperature (Ex 9.5-x, style); "+RN,False,
 "CH4 burned completely with 25% excess air, both fed at 25 C, adiabatic, 1 atm. Find flame temperature.",
 dict(fuel="CH4",excess_air=.25,T_feed_C=25,cp_poly_kJ_per_mol_C=FELDER_CPIN,dHf_kJ_mol={k:HFF[k] for k in HFF},ref_C=25),
 dict(T_adiabatic_C=Tf,dH_combustion_kJ_mol=dHc,product_moles=prodf),0.005,"exact data, solver tolerance only; vs real flame T differs (no dissociation) - do NOT compare to experiment",FELDER_ASSUM,"adiabaticOutletT (combustion)")
# ===== 12 dHr(T)
def dHr(T):
    nu=dict(CO=-1,H2=-2,CH3OH=1)
    return -200.7+110.52 + sum(n*HF(s,T) for s,n in nu.items())
add("EQ-CE-012","Felder-energy","Felder 4th ed, Ch.9.1-9.2 heat of reaction at T (heat-of-reaction method); "+RN,False,
 "CO+2H2->CH3OH(g): standard dHr at 25 C and dHr(300 C) from sensible-heat correction.",
 dict(nu=dict(CO=-1,H2=-2,CH3OH=1),T_C=[25,300],cp_poly=FELDER_CPIN,dHf=HFF),dict(dHr_25C_kJ=dHr(25),dHr_300C_kJ=dHr(300)),0.005,"exact data",FELDER_ASSUM,"heatOfReactionAtT")
# ===== 13 adiabatic WGS
feedW=dict(CO=1,H2O=2); X=0.6
outW=dict(CO=1-X,H2O=2-X,CO2=X,H2=X); dH25=HFF['CO2']+0-HFF['CO']-HFF['H2O']
Tin=400.
fW=lambda T: Hsum(outW,T)-Hsum(feedW,Tin)+X*dH25
ToutW=brentq(fW,25,1500)
add("EQ-CE-013","Felder-energy","Felder 4th ed, Ch.9.3 adiabatic reactor (heat-of-reaction method) w/ water-gas shift (style); "+RN,False,
 "CO+H2O->CO2+H2 in an adiabatic reactor. Feed 1 mol CO + 2 mol steam at 400 C; CO conversion 60%. Find outlet temperature.",
 dict(feed=feedW,X_CO=X,T_in_C=Tin,cp_poly=FELDER_CPIN,dHf=HFF,ref_C=25),dict(T_out_C=ToutW,dHr25_kJ=dH25,xi=X),0.003,"exact data",FELDER_ASSUM,"adiabaticOutletT (reactor, given conversion)")
# ===== 14 combustion with heat duty, HoF vs HoR methods
prodH=dict(CO2=1,H2O=2,O2=0.2,N2=2.2*79/21); airH=dict(O2=2.2,N2=2.2*79/21)
Q_hor=Hsum(prodH,400)-Hsum(airH,25)+dHc
Q_hof=(sum(n*(HFF[s]+HF(s,400)) for s,n in prodH.items()))-(HFF['CH4']+sum(n*(HFF[s]+HF(s,25)) for s,n in airH.items()))
assert abs(Q_hor-Q_hof)<1e-9
add("EQ-CE-014","Felder-energy","Felder 4th ed, Ch.9.4 heat-of-formation vs heat-of-reaction method, methane combustion; "+RN,False,
 "1 mol CH4 + air (10% excess) at 25 C burned completely; products leave at 400 C. Heat duty Q = dH (negative = heat removed). Both methods must agree.",
 dict(fuel="CH4",excess_air=.1,T_in_C=25,T_out_C=400,cp_poly=FELDER_CPIN,dHf=HFF),dict(Q_kJ_per_mol_CH4=Q_hor,HoF_method=Q_hof,products=prodH),0.003,"exact data",FELDER_ASSUM,"energyBalanceReactive (duty)")

# ===== Fogler
v0=10.;k=0.2;X=0.8;FA0=10.
Vc=v0*X/(k*(1-X)); Vp=v0/k*math.log(1/(1-X))
add("EQ-CE-015","Fogler-reactor","Fogler 5th/6th ed, Ch.2 CSTR/PFR design equations (first-order liquid, style); "+RN,False,
 "A->B first order, k=0.2 1/min, v0=10 L/min, CA0=1 mol/L (FA0=10 mol/min). Volume of CSTR and of PFR for X=0.8.",
 dict(k_per_min=k,v0_L_min=v0,CA0=1,X=X),dict(V_CSTR_L=Vc,V_PFR_L=Vp,ratio=Vc/Vp),0.002,"analytic","isothermal, constant density","cstrVolume, pfrVolume")
# 16 gas-phase 2nd order, eps=1
v0=10.;k=0.5;CA0=0.2;eps=1.;X=0.8;FA0=v0*CA0
rate=lambda x: k*CA0**2*(1-x)**2/(1+eps*x)**2
Vnum=quad(lambda x:FA0/rate(x),0,X,epsabs=1e-12)[0]
Van=(v0/(k*CA0))*(2*eps*(1+eps)*math.log(1-X)+eps**2*X+(1+eps)**2*X/(1-X))
assert abs(Vnum-Van)<1e-6
add("EQ-CE-016","Fogler-reactor","Fogler 5th/6th ed, Ch.4-5 gas-phase PFR with volume change (Ex 4-x/5-x style); "+RN,False,
 "A->2B gas, isothermal isobaric, pure A fed: CA0=0.2 mol/L, v0=10 L/s, -rA=k CA^2, k=0.5 L/mol/s (eps=1). PFR volume for X=0.8 by numerical integration of FA0 dX/(-rA).",
 dict(k=k,CA0=CA0,v0=v0,eps=eps,X=X,rate="k*CA0^2*(1-X)^2/(1+eps*X)^2"),dict(V_L=Vnum,V_analytic_L=Van,V_if_eps_zero_L=(v0/(k*CA0))*X/(1-X)),0.002,"quadrature vs analytic agree 1e-6","ideal gas, no dP","pfrVolume (numerical integration)")
# 17 CSTR->PFR series; Levenspiel table
v0=10;k=.2;FA0=10
Xs=np.linspace(0,0.8,9); inv=FA0/(k*(1-Xs)*1.0)   # CA0=1 -> -rA=k(1-X): FA0/-rA  (L)
from scipy.integrate import simpson
Vs_tab=simpson(inv[4:],x=Xs[4:])  # X=0.4..0.8
Vcs=FA0*0.4/(k*0.6); Vps=v0/k*math.log(0.6/0.2)
add("EQ-CE-017","Fogler-reactor","Fogler 5th/6th ed, Ex 2-x CSTR followed by PFR from Levenspiel plot (style); "+RN,False,
 "First order A->B k=0.2 1/min, FA0=10 mol/min, CA0=1 mol/L. CSTR to X=0.4 then PFR to X=0.8. Volumes; also Simpson rule on tabulated FA0/(-rA) at X=0,0.1..0.8 for the PFR part.",
 dict(k=k,FA0=FA0,CA0=1,v0=10,X_cstr=.4,X_final=.8,table_X=list(Xs),table_FA0_over_rA_L=list(inv)),
 dict(V_CSTR_L=Vcs,V_PFR_analytic_L=Vps,V_PFR_simpson_L=Vs_tab,V_total_L=Vcs+Vps),0.002,"analytic answer; tabular Simpson within 0.3% (use 1% if engine uses trapezoid)","isothermal","cstrVolume+pfrVolume series, Levenspiel integration")
# 18 CSTRs in series
X=0.9;k=.2;v0=10
ktau=math.sqrt(1/(1-X))-1; Vc1=v0*ktau/k
add("EQ-CE-018","Fogler-reactor","Fogler 5th/6th ed, Ch.2.5 CSTRs in series (first order); "+RN,False,
 "First order k=0.2/min, v0=10 L/min. Two equal CSTRs in series for overall X=0.9. Volume of each, and compare with single CSTR and PFR.",
 dict(k=k,v0=v0,X=X,n=2),dict(X_after_first=1-1/(1+ktau),V_each_L=Vc1,V_total_L=2*Vc1,V_single_CSTR_L=v0*X/(k*(1-X)),V_PFR_L=v0/k*math.log(1/(1-X))),0.002,"analytic","isothermal","cstrVolume (series)")
# 19 Arrhenius
E=80e3;k1=0.1;T1=300.;T2=350.
k2=k1*math.exp(E/R*(1/T1-1/T2)); E_back=R*math.log(k2/k1)/(1/T1-1/T2)
add("EQ-CE-019","Fogler-reactor","Fogler 5th/6th ed, Ch.3 Arrhenius k(T); "+RN,False,
 "k=0.1 1/min at 300 K, E=80 kJ/mol. k at 350 K; and recover E from the two k values; also the factor per 10 K near 300 K.",
 dict(k1=k1,T1=T1,T2=T2,E_J_mol=E,R=R),dict(k2=k2,E_recovered_J_mol=E_back,factor_300_to_310=math.exp(E/R*(1/300-1/310))),0.001,"exact","R=8.314462618 J/mol/K","arrhenius")
# 20 adiabatic equilibrium
dH=-20000.;Rc=1.987204;Cp=50.;T0=300.;K298=1000.
Kf=lambda T:K298*math.exp(-dH/Rc*(1/T-1/298.))
XEB=lambda T:Cp*(T-T0)/(-dH); Xe=lambda T:Kf(T)/(1+Kf(T))
Ts=brentq(lambda T:XEB(T)-Xe(T),T0,T0+400)
add("EQ-CE-020","Fogler-equilibrium","Fogler 5th/6th ed, Ch.8/11 adiabatic equilibrium conversion (Ex 8-x/11-x style, A<=>B); "+RN,False,
 "Reversible exothermic A<=>B, dHrx=-20000 cal/mol (dCp=0), K(298)=1000, sum(theta_i Cp_i)=50 cal/mol/K, feed pure A at 300 K, adiabatic. Find adiabatic equilibrium conversion and T (intersection of X_EB=Cp(T-T0)/(-dH) and Xe(T)=K/(1+K)). Also Xe at 300 K isothermal.",
 dict(dH_cal=dH,K298=K298,Cp_cal_mol_K=Cp,T0=T0,Rcal=Rc,vanthoff="K=K298*exp(-dH/R*(1/T-1/298))"),dict(T_ad_K=Ts,X_ad_eq=XEB(Ts),X_eq_isothermal_300K=Xe(300.),K_at_Tad=Kf(Ts)),0.003,"exact","dCp=0 constant dH","adiabaticEquilibriumConversion / KofT_vantHoff")
# 21 CSTR 3 steady states
dHc_=-20000.;Cps=100.;kap=0.6;Tc=300.;E=30000.;tau=1.;Rc=1.987204;T0c=300.
kk=lambda T:1.0*math.exp(-E/Rc*(1/T-1/350.))
G=lambda T:-dHc_*tau*kk(T)/(1+tau*kk(T)); Rm=lambda T:Cps*(1+kap)*(T-Tc)
roots=[]; Tg=np.linspace(300,450,15001); fg=[G(t)-Rm(t) for t in Tg]
for i in range(len(Tg)-1):
    if fg[i]*fg[i+1]<0: roots.append(brentq(lambda t:G(t)-Rm(t),Tg[i],Tg[i+1]))
assert len(roots)==3
dG=lambda T:(G(T+1e-4)-G(T-1e-4))/2e-4
st=["stable" if dG(t)<Cps*(1+kap) else "unstable" for t in roots]
Xr=[tau*kk(t)/(1+tau*kk(t)) for t in roots]
add("EQ-CE-021","Fogler-multiplicity","Fogler 5th/6th ed, Ch.12 multiple steady states G(T) vs R(T) (Ex 12-x style, parameters designed here); "+RN,False,
 "Liquid first-order A->B in a CSTR with cooling. tau=1 min, k(T)=1.0 exp[-(E/R)(1/T-1/350)] 1/min, E=30000 cal/mol, dHrx=-20000 cal/mol, CpSum=100 cal/mol/K (per mol A fed), kappa=UA/(FA0*CpSum)=0.6, T0=Ta=300 K (so Tc=300). Energy balance G(T)=R(T): G=(-dH) tau k/(1+tau k), R=CpSum(1+kappa)(T-Tc). List all steady states.",
 dict(tau=tau,k350=1.0,E_cal=E,dH_cal=dHc_,CpSum=Cps,kappa=kap,T0=T0c,Ta=300,Rcal=Rc),
 dict(T_K=roots,X=Xr,stability=st,G_cal_mol=[G(t) for t in roots]),0.002,"roots of smooth scalar function; tolerance on T 0.2% (about 0.7 K)","dCp=0","multipleSteadyStates (three roots, stability)")
# 22 ignition/extinction by sweeping Tc
sl=Cps*(1+kap); 
dGfun=lambda T:(G(T+1e-3)-G(T-1e-3))/2e-3
Tt=[]; Tgs=np.linspace(300,450,150001); d=[dGfun(t)-sl for t in Tgs]
for i in range(len(Tgs)-1):
    if d[i]*d[i+1]<0: Tt.append(brentq(lambda t:dGfun(t)-sl,Tgs[i],Tgs[i+1]))
Tcs=sorted([t-G(t)/sl for t in Tt])
Tcg_ext,Tcg_ign=Tcs
add("EQ-CE-022","Fogler-multiplicity","Fogler 5th/6th ed, Ch.12.6 ignition-extinction curve; "+RN,False,
 "Same reactor as EQ-CE-021 but vary effective coolant temperature Tc (R(T)=CpSum(1+kappa)(T-Tc)). Find Tc at which the low branch disappears (ignition, heating up) and Tc at which the high branch disappears (extinction, cooling), and the jump temperatures. Valid multiplicity window: extinction<Tc<ignition.",
 dict(same_as="EQ-CE-021",vary="Tc"),dict(Tc_ignition=Tcg_ign,Tc_extinction=Tcg_ext,T_tangent_points=Tt,T_low_branch_at_ignition=Tt[0]if Tcg_ign==Tt[0]-G(Tt[0])/sl else Tt[1]),0.003,"tangency conditions G=R and G'=R'","same","multipleSteadyStates (ignition/extinction)")
# fix labels: ignition is the larger Tc; tangent T of low branch at ignition
Tt_ign=[t for t in Tt if abs(t-G(t)/sl-Tcg_ign)<1e-6][0]; Tt_ext=[t for t in Tt if abs(t-G(t)/sl-Tcg_ext)<1e-6][0]
P[-1]['answers']['T_low_branch_at_ignition']=Tt_ign; P[-1]['answers']['T_high_branch_at_extinction']=Tt_ext
# sanity: count roots at Tc inside and outside window
def nroots(Tc_):
    f=lambda t:G(t)-Cps*(1+kap)*(t-Tc_); Tw=np.linspace(200,500,30001); v=[f(t) for t in Tw]; return sum(1 for i in range(len(Tw)-1) if v[i]*v[i+1]<0)
P[-1]['answers']['n_roots_Tc_ign+2K']=nroots(Tcg_ign+2); P[-1]['answers']['n_roots_Tc_ext-2K']=nroots(Tcg_ext-2); P[-1]['answers']['n_roots_mid']=nroots((Tcg_ign+Tcg_ext)/2)
# 23 batch adiabatic runaway (T2 Labs style)
E=100e3;T0b=450.;k0=1e-3;dTad=100.
kb=lambda T:k0*math.exp(E/R*(1/T0b-1/T))
def rhs(t,y): X=y[0];T=T0b+dTad*X; return [kb(T)*(1-X)]
ev=lambda t,y:y[0]-0.99; ev.terminal=True
s=solve_ivp(rhs,[0,5e4],[0.],events=ev,rtol=1e-10,atol=1e-12,dense_output=True,max_step=1)
t99=s.t_events[0][0]
from scipy.optimize import brentq as bq
t50=bq(lambda t:s.sol(t)[0]-0.5,0,t99); 
tmax=minimize_t=None
ts=np.linspace(0,t99,200001); Xs_=s.sol(ts)[0]; rr_=np.array([kb(T0b+dTad*x)*(1-x) for x in Xs_]); imax=rr_.argmax()
t_iso=-math.log(0.5)/k0
add("EQ-CE-023","Fogler-safety","Fogler 5th/6th ed, Ch.13 runaway / T2 Laboratories (generic adiabatic batch runaway, NOT the T2 numbers); "+RN,False,
 "Adiabatic batch, first-order A->B: dX/dt=k(T)(1-X), T=T0+dTad*X, dTad=100 K, T0=450 K, k(450)=1e-3 1/s, E=100 kJ/mol. Time to X=0.5 and X=0.99, time and value of maximum rate, final T. Compare isothermal t50.",
 dict(T0=T0b,dTad=dTad,k0=k0,E_J_mol=E),dict(t_X50_s=t50,t_X99_s=t99,t_max_rate_s=ts[imax],max_rate_per_s=rr_[imax],X_at_max_rate=Xs_[imax],T_final_K=T0b+dTad*0.99,t50_isothermal_s=t_iso),0.005,"ODE integrated with rtol 1e-10; engine fixed-step RK4 should use dt<=1 s","energy balance exact, constant dTad (no temperature dependence of dH/Cp)","thermalRunaway (adiabatic batch)")
# 24 Semenov critical
E=80e3;g0=1e13;hS=50.
Gs=lambda T:g0*math.exp(-E/(R*T)); 
def crit_Ta():
    # tangent: G(T)=hS(T-Ta); G'(T)=hS ; G'=G*E/(R T^2)
    Tt_=brentq(lambda T:Gs(T)*E/(R*T**2)-hS,200,2000)  # largest-T? G' monotone up to ~E/2R
    return Tt_
# G' = G E/(R T^2) has a maximum then... find the smaller root (stable side) by scan
Tsc=np.linspace(250,1500,125001); dd=[Gs(t)*E/(R*t**2)-hS for t in Tsc]
rts=[brentq(lambda T:Gs(T)*E/(R*T**2)-hS,Tsc[i],Tsc[i+1]) for i in range(len(Tsc)-1) if dd[i]*dd[i+1]<0]
Tcr=rts[0]; Ta_cr=Tcr-Gs(Tcr)/hS
Tsem=Ta_cr+R*Ta_cr**2/E
add("EQ-CE-024","Fogler-safety","Fogler 5th/6th ed Ch.12-13 / Semenov thermal explosion theory (zero-order, heat loss UA(T-Ta)); "+RN,False,
 "Zero-order exothermic reaction in a vessel: heat generation G(T)=g0 exp(-E/RT), g0=1e13 W, E=80 kJ/mol; heat loss hS(T-Ta), hS=50 W/K. Find the critical ambient temperature Ta_crit above which no steady state exists (tangency), the critical (ignition) vessel temperature, and compare Semenov approximation Tcrit-Ta=R*Ta^2/E.",
 dict(g0_W=g0,E_J_mol=E,hS_W_K=hS,R=R),dict(Ta_crit_K=Ta_cr,T_vessel_at_crit_K=Tcr,dT_crit_K=Tcr-Ta_cr,dT_semenov_approx_K=R*Ta_cr**2/E,all_tangent_T=rts),0.002,"tangent conditions exact; Semenov approximation only ~few %","","thermalRunaway (Semenov critical condition)")

# ===== Smith
Rs=8.314
SM=dict(  # A,B,D (Cp/R=A+B T+D/T^2), dHf298, dGf298 J/mol
 CO=(3.376,0.557e-3,-0.031e5,-110525,-137169),H2O=(3.470,1.450e-3,0.121e5,-241818,-228572),CO2=(5.457,1.045e-3,-1.157e5,-393509,-394359),
 H2=(3.249,0.422e-3,0.083e5,0,0),SO2=(5.699,0.801e-3,-1.015e5,-296830,-300194),SO3=(8.060,1.056e-3,-2.028e5,-395720,-371060),
 O2=(3.639,0.506e-3,-0.227e5,0,0),N2=(3.280,0.593e-3,0.040e5,0,0),NH3=(3.578,3.020e-3,-0.186e5,-46110,-16450))
SMIN={k:dict(A=v[0],B=v[1],D=v[2],dHf298=v[3],dGf298=v[4]) for k,v in SM.items()}
def rxn(nu):
    dA=sum(n*SM[s][0] for s,n in nu.items());dB=sum(n*SM[s][1] for s,n in nu.items());dD=sum(n*SM[s][2] for s,n in nu.items())
    dH=sum(n*SM[s][3] for s,n in nu.items());dG=sum(n*SM[s][4] for s,n in nu.items());return dA,dB,dD,dH,dG
def dHT(nu,T):
    dA,dB,dD,dH,_=rxn(nu); T0=298.15
    return dH+Rs*(dA*(T-T0)+dB/2*(T**2-T0**2)-dD*(1/T-1/T0))
def lnK(nu,T):
    dA,dB,dD,dH,dG=rxn(nu); lk0=-dG/(Rs*298.15)
    return lk0+quad(lambda t:dHT(nu,t)/(Rs*t**2),298.15,T,epsabs=1e-12)[0]
def lnK_vh(nu,T):
    dA,dB,dD,dH,dG=rxn(nu); return -dG/(Rs*298.15)-dH/Rs*(1/T-1/298.15)
nuNH3=dict(N2=-1,H2=-3,NH3=2); nuW=dict(CO=-1,H2O=-1,CO2=1,H2=1)
K298=math.exp(-rxn(nuNH3)[4]/(Rs*298.15))
add("EQ-CE-025","Smith-equilibrium","Smith, Van Ness, Abbott & Swihart, Ch.13.2 K from dG0 (ammonia, dGf NH3=-16450 J/mol); "+RN,False,
 "N2+3H2->2NH3 at 298.15 K. K from dG0 = -RT ln K, with dGf(NH3)=-16450 J/mol.",dict(nu=nuNH3,dGf_NH3=-16450,T=298.15,R=Rs),dict(dG0_J=rxn(nuNH3)[4],K298=K298,lnK=math.log(K298)),0.002,"exact","","KofT_vantHoff (K from dG)")
nu_=nuNH3; add("EQ-CE-026","Smith-equilibrium","Smith 13.3 van't Hoff K(T), constant dH (ammonia, dHf=-46110); "+RN,False,
 "Ammonia synthesis, constant dH0=2*(-46110) J/mol. K at 500 K and 700 K using integrated van't Hoff from K298.",dict(nu=nu_,dH298=rxn(nu_)[3],K298=K298,T=[500,700]),
 dict(K500=math.exp(lnK_vh(nu_,500.)),K700=math.exp(lnK_vh(nu_,700.)),with_Cp_K500=math.exp(lnK(nu_,500.)),with_Cp_K700=math.exp(lnK(nu_,700.))),0.003,"exact for given model (constant dH); with-Cp rows are a separate oracle with tol 0.5%","constant dH (row 1) / Cp=A+BT+D/T^2 (row 2)","KofT_vantHoff and KofT_withCp")
K1000=math.exp(lnK(nuW,1000.)); K1100=math.exp(lnK(nuW,1100.))
add("EQ-CE-027","Smith-equilibrium","Smith 13.x water-gas shift K(T) with Cp (cf. Ex 13.4-13.5 style); "+RN,False,
 "CO+H2O(g)->CO2+H2: K at 1000 K and 1100 K from dG298 and ln K integration with dH(T) using Cp/R=A+BT+D/T^2 data (Smith Table C.1/C.4 values recalled).",
 dict(nu=nuW,species_data=SMIN,T=[1000,1100]),dict(K1000=K1000,K1100=K1100,dH298=rxn(nuW)[3],dH1000=dHT(nuW,1000.),K1000_const_dH=math.exp(lnK_vh(nuW,1000.))),0.005,"exact for given data; Smith prints K~1.4 at 1000 K (rounded)","Cp polynomial as given","KofT_withCp")
e=brentq(lambda e:e**2/(1-e)**2-K1100,0,1-1e-12)
add("EQ-CE-028","Smith-equilibrium","Smith Ex 13.x equilibrium conversion of water-gas shift (1 CO + 1 H2O, 1100 K, 1 bar); "+RN,False,
 "1 mol CO + 1 mol H2O(g) at 1100 K, 1 bar, ideal gas. Equilibrium extent/conversion; and with 2 mol steam.",dict(K=K1100,feed=[1,1],T=1100,P_bar=1),
 dict(eps_e=e,conv_CO=e,eps_e_steam2=brentq(lambda e:e**2/((1-e)*(2-e))-K1100,0,1-1e-12)),0.005,"exact; P has no effect (dnu=0)","ideal gas","equilibriumConversion")
KN=math.exp(lnK_vh(nuNH3,500.)); Pb=100.
def fN(ex):
    n=dict(N2=1-ex,H2=3-3*ex,NH3=2*ex,Ar=0.1); tot=sum(n.values())
    return (n['NH3']/tot)**2/((n['N2']/tot)*(n['H2']/tot)**3)/Pb**2-KN
eN=brentq(fN,0,1-1e-9)
add("EQ-CE-029","Smith-equilibrium","Smith Ch.13.4-13.5 ammonia equilibrium with inert, pressure effect (constructed); "+RN,False,
 "Feed 1 N2 + 3 H2 + 0.1 Ar at 500 K, 100 bar, ideal gas (phi=1). K(500) from constant-dH van't Hoff. Equilibrium extent and NH3 mole fraction. (Ignores nonideality; real value higher.)",
 dict(nu=nuNH3,feed=dict(N2=1,H2=3,Ar=.1),T=500,P_bar=Pb,K_bar_m2=KN),dict(eps_e=eN,y_NH3=2*eN/(4.1-2*eN)),0.005,"exact for stated model","ideal gas, constant dH","equilibriumConversion (dn<0, pressure, inert)")
nuS=dict(SO2=-1,O2=-.5,SO3=1); KS=math.exp(lnK(nuS,800.))
def fS(ex):
    n=dict(SO2=10-ex,O2=10-.5*ex,SO3=ex,N2=80); tot=sum(n.values())
    return (n['SO3']/tot)/((n['SO2']/tot)*(n['O2']/tot)**.5)/1.01325**.5-KS
eS=brentq(fS,0,10-1e-9)
add("EQ-CE-030","Smith-equilibrium","Smith Ch.13 SO2 oxidation equilibrium (Prob. 13.x style, constructed); "+RN,False,
 "SO2+1/2O2->SO3, feed (basis 100 mol) 10 SO2, 10 O2, 80 N2 at 800 K and 1 atm; K(800) from full-Cp integration. Equilibrium SO2 conversion.",
 dict(nu=nuS,feed=dict(SO2=10,O2=10,N2=80),T=800,P_atm=1,species_data=SMIN),dict(K800=KS,K800_bar_basis=KS,eps_e=eS,conv_SO2=eS/10),0.005,"exact for stated data","ideal gas; K dimension bar^-0.5, P=1.01325 bar","equilibriumConversion (K(T) with Cp)")
nuM=dict(CO=-1,H2=-2,CH3OH=1)
SM['CH3OH']=(2.211,12.216e-3,0.0,-200660,-161960); SM['CH3OH']=(2.211,12.216e-3,-3.45e-6*0,-200660,-161960)
# CH3OH uses C term (-3.450e-6 T^2): handle separately
def dHT_meoh(T):
    T0=298.15
    # Cp/R = A+BT+CT^2+DT^-2
    A=2.211-3.376-2*3.249; B=(12.216e-3-0.557e-3-2*0.422e-3); C=-3.450e-6; D=0-(-0.031e5)-2*0.083e5
    dH0=-200660+110525
    return dH0+Rs*(A*(T-T0)+B/2*(T**2-T0**2)+C/3*(T**3-T0**3)-D*(1/T-1/T0)),A,B,C,D
add("EQ-CE-031","Smith-thermo","Smith Ex 4.6 standard heat of methanol synthesis at 800 C (CO+2H2->CH3OH(g)); "+RN,False,
 "dH0 of CO+2H2->CH3OH(g) at 298.15 K and at 1073.15 K using Cp/R=A+BT+CT^2+DT^-2 (CH3OH A=2.211,B=12.216e-3,C=-3.450e-6; CO,H2 as Smith table C.1).",
 dict(CH3OH=dict(A=2.211,B=12.216e-3,C=-3.450e-6,D=0,dHf=-200660),CO=SMIN['CO'],H2=SMIN['H2'],T=[298.15,1073.15]),
 dict(dH298_J=dHT_meoh(298.15)[0],dH1073_J=dHT_meoh(1073.15)[0],dA_dB_dC_dD=list(dHT_meoh(298.15)[1:])),0.003,"exact for stated data; recalled Smith Ex 4.6 values: -90135 J at 298 K and about -103,000 J at 1073 K; computed values agree with that recollection","Cp polynomial","heatOfReactionAtT")

# ===== GATE
conv=0.6;p=0.1
Rin=100/(1-0.4*0.9); Aout=0.4*Rin
add("EQ-CE-032","GATE-recycle","GATE CH style recycle/purge (recalled, not verified; reconstructed)",False,
 "Pure A fed 100 mol/h. Reactor A->B, single-pass conversion 60%. Separator sends all B to product, all unreacted A to a splitter: 10% purged, 90% recycled to reactor. Find reactor feed, recycle and overall conversion of A.",
 dict(fresh_A=100,X=0.6,purge=0.1),dict(reactor_feed=Rin,recycle=0.9*Aout,purge=0.1*Aout,B_product=0.6*Rin,overall_conv=1-0.1*Aout/100),0.002,"closed form","ideal separator","recyclePurgeTear")
X=0.9
add("EQ-CE-033","GATE-reactor","GATE CH style CSTR vs PFR volume ratio (recalled, not verified; reconstructed)",False,
 "First-order liquid reaction, same feed and k, X=0.9. Ratio V_CSTR/V_PFR.",dict(X=X,order=1),dict(ratio=X/(1-X)/math.log(1/(1-X))),0.002,"analytic","isothermal","cstrVolume/pfrVolume")
add("EQ-CE-034","GATE-reactor","GATE CH style two CSTRs in series (recalled, not verified; reconstructed)",False,
 "First-order reaction, two equal CSTRs in series, each with k*tau=1. Overall conversion; and for a single CSTR with total tau.",
 dict(k_tau_each=1,n=2),dict(X_overall=1-1/4,X_single_CSTR_same_total_tau=2/3,X_PFR_same_total_tau=1-math.exp(-2)),0.002,"analytic","","cstrVolume (series)")
add("EQ-CE-035","GATE-reactor","GATE CH style second-order CSTR/PFR (recalled, not verified; reconstructed)",False,
 "Second-order irreversible liquid reaction -rA=k CA^2, X=0.5. Space time ratio tau_CSTR/tau_PFR.",dict(X=.5,order=2),dict(ratio=(0.5/(0.5**2))/(0.5/0.5),tau_CSTR_kCA0=2.0,tau_PFR_kCA0=1.0),0.002,"analytic","isothermal","cstrVolume/pfrVolume")

# ---------- write md ----------
d=os.path.dirname(os.path.abspath(__file__))
out=["# EQUILIBRIUM textbook oracles (chemical engineering)\n",
 "Generated by `oracles_cheme.py` (every answer below is computed by that script, not copied from the book).",
 "Citation status: no text was fetched; every statement is reconstructed from memory in the style of the cited example and marked `recalled, not verified`. Inputs and answers are fully self-consistent, so tests are valid regardless of the book numbers. Where the 'book' column says `not independently verified`, do not claim agreement with the printed book answer.\n",
 "Tolerance = relative unless the value is a temperature in C/K where 0.1-0.7 K absolute is meant by the percentage. Every oracle assumes the **data listed in `inputs`** is what the engine uses (Cp polynomials, Antoine constants, dHf, dGf).\n"]
from collections import Counter
cnt=Counter(p['topic'] for p in P)
out.append("## Count by topic\n"+"\n".join(f"- {k}: {v}" for k,v in cnt.items())+f"\n- TOTAL: {len(P)}\n")
for p in P:
    out.append(f"## {p['id']}  ({p['topic']})\n- **Source**: {p['source']}\n- **Statement**: {p['statement']}\n- **Capability**: {p['cap']}\n- **Inputs**:\n```json\n{json.dumps(r(p['inputs']),indent=1,default=float)}\n```\n- **Expected**:\n```json\n{json.dumps(r(p['answers']),indent=1,default=float)}\n```\n- **Book answer**: {p['book']}\n- **Tolerance**: {p['tol']*100:.2g}% ({p['why']})\n- **Thermo/data assumptions**: {p['assum']}\n")
open(os.path.join(d,"oracles_cheme.md"),"w").write("\n".join(out))
for p in P: print(p['id'],json.dumps(r(p['answers']),default=float)[:230])
