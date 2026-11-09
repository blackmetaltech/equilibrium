# Design-review spot check (2026-11-09): independent re-computation of oracle values and level numbers.
# Run: python3 -I review_spotcheck.py   (needs scipy, numpy). tol < 1 is relative, tol >= 1 absolute.
import math
from scipy.optimize import brentq
from scipy.integrate import solve_ivp
R=8.314462618
out=[]
def rec(i,exp,got,tol):
    ok=abs(got-exp)<=tol*abs(exp) if tol<1 else abs(got-exp)<=tol
    out.append((i,exp,got,ok))
# NC-005
nN2=2000/28.0134; nH2=1000/2.01588
lim=min(nN2,nH2/3); rec('EQ-NC-005 NH3 g',2431.84,2*lim*17.0305,0.005)
rec('L04 H2 left kmol/h',281.8,nH2-3*lim,0.005)
# NC-024 N2O4
n0=13.8/92; P=9.15; R2=0.083; T=400
nt=P*1/(R2*T); a=nt/n0-1; Kp=(2*a/(1+a))**2*P/((1-a)/(1+a)); rec('EQ-NC-024 Kp',85.87,Kp,0.005); rec('EQ-NC-024 alpha',0.837,a,0.005)
# NC-023 Kc=Kp/(RT)^dn, dn=-1
rec('EQ-NC-023 Kc',7.479e11,2.0e10*(0.083145*450),0.01)
# NC-035
rec('EQ-NC-035 ratio',24113.4,math.exp(25000/(R*298)),0.05)
# NC-036 Ea = 1.25e4*2.303*R
rec('EQ-NC-036 Ea kJ',239.296,1.25e4*math.log(10)*R/1000,0.002)
# NC-037 t1/2=256 min
k=math.log(2)/(256*60); T=1.25e4/(14.34-math.log10(k)); rec('EQ-NC-037 T K',668.97,T,0.003)
# NC-038
rec('EQ-NC-038 t s',444.196,math.log(5/3)/1.15e-3,0.005)
# NC-042
rec('EQ-NC-042 Ea kJ',52.8503,R*math.log(4)/(1/293-1/313)/1000,0.005)
# NC-043
rec('EQ-NC-043 Ea J',18227.1,R*math.log(3.5)/(1/500-1/700),0.005)
# NC-039
rec('EQ-NC-039 yr',1844.65,5730/math.log(2)*math.log(1/0.8),0.005)
# NC-019 dU=dH-RT
rec('EQ-NC-019 dU',37.6889,40.79-R*373/1000,0.005)
# L09: CH4+2O2->CO2+2H2O(l): dn_g=-2 -> dU=dH+2RT
rec('L09 dU-dH kJ',4.96,2*R*298.15/1000,0.01)
# NC-022 Kc=4.24 CO+H2O 0.1 M each
x=brentq(lambda x:x*x/(0.1-x)**2-4.24,0,0.0999999); rec('EQ-NC-022 [CO]',0.0326891,0.1-x,0.01)
# NC-028 dG = -RT ln K
rec('EQ-NC-028 dG kJ',163.2,-R*298*math.log(2.47e-29)/1000,0.01)
# CE-025
rec('EQ-CE-025 K298',5.8097e5,math.exp(32900/(R*298.15)),0.002)
# CE-026 constant dH
lnK298=32900/(R*298.15); dH=-92220
for T,e in((500,0.17439),(700,0.00030817)):
    rec(f'EQ-CE-026 K{T} constdH',e,math.exp(lnK298-dH/R*(1/T-1/298.15)),0.003)
# CE-006 Ar loop: Ar at reactor inlet = 0.3/0.05=6 mol/h
# solve N2 balance: fresh 24.9 + recycle; reactor inlet N2 F; unreacted 0.75F; recycle 0.95*0.75F
F=24.9/(1-0.95*0.75); rec('EQ-CE-006 N2 in',86.609,F,0.002)
H=74.8+0.95*(F*3*0.75*0 )  # H2 consumed 3*0.25F
Hf=None
# H2: inlet H, out = H-0.75F; recycle 0.95(H-0.75F); H=74.8+0.95(H-0.75F)
Hin=(74.8-0.95*0.75*F)/(1-0.95); rec('EQ-CE-006 H2 in',261.83,Hin,0.002)
xi=0.25*F; purge=(F-xi)*0.05+(Hin-3*xi)*0.05+0.3
rec('EQ-CE-006 yAr purge',0.022403,0.3/purge,0.002)
# L20 part A scaled x10: fresh 249/748/3
F=249/(1-0.95*0.75); Hin=(748-0.95*3*0.25*F)/(0.05); Ar=3/0.05
rec('L20 Ar% inlet',1.69,100*Ar/(F+Hin+Ar),0.005)
# CE-015
rec('EQ-CE-015 Vcstr',200,10*0.8/(0.2*0.2),0.002); rec('EQ-CE-015 Vpfr',80.472,10/0.2*math.log(5),0.002)
# CE-033
rec('EQ-CE-033 ratio',3.9087,(0.9/0.1)/math.log(10),0.002)
# CE-032
rf=100/(1-0.9*0.4); rec('EQ-CE-032 feed',156.25,rf,0.002)
# CE-021 steady states
E=30000;Rc=1.987
k=lambda T:math.exp(-(E/Rc)*(1/T-1/350))
f=lambda T:20000*k(T)/(1+k(T))-100*1.6*(T-300)
import numpy as np
Ts=np.linspace(290,450,20001); v=[f(t) for t in Ts]
roots=[brentq(f,Ts[i],Ts[i+1]) for i in range(len(Ts)-1) if v[i]*v[i+1]<0]
for r,e in zip(roots,[300.1,345.54,424.94]): rec('EQ-CE-021 Tss',e,r,0.002)
# CE-023 adiabatic batch
k450=1e-3;Ea=1e5
def rhs(t,y):
    X=y[0];T=450+100*X; return [k450*math.exp(-Ea/R*(1/T-1/450))*(1-X)]
ev=lambda t,y:y[0]-0.5; ev.terminal=True
s=solve_ivp(rhs,[0,1e4],[0],events=ev,rtol=1e-10,atol=1e-12); rec('EQ-CE-023 t50',201.05,s.t_events[0][0],0.005)
# Game CSTR K7 SI
V=0.1;Q=5;CA0=2.114;rcp=3.57;dHr=251.2;UA=10;T0=Tc=298.15  # E=75.36 per DESIGN fix
kk=lambda T:16.96e12*math.exp(-75.36e3/(R*T))
G=lambda T:dHr*CA0*Q*kk(T)*V/Q/(1+kk(T)*V/Q)   # MJ/h
Rr=lambda T:(Q*rcp+UA)*(T-T0)  # T0=Tc
g=lambda T:G(T)-Rr(T)
Ts=np.linspace(290,460,40001); v=[g(t) for t in Ts]
roots=[brentq(g,Ts[i],Ts[i+1])-273.15 for i in range(len(Ts)-1) if v[i]*v[i+1]<0]
for r,e in zip(roots,[27.6,63.1,117.0]): rec('K7/L24 Tss C',e,r,0.3001+0)  # abs K
# emission identity: per t H2SO4, S moles = 1e6/98.079 mol; SO2 unconverted = (1-X)/X * product moles
X=0.997; rec('kg SO2/t at 99.7%',1.97,(1-X)/X*1e6/98.079*64.066/1000,0.01)
# L27 relief API520
k=1.31; C=0.03948*math.sqrt(k*(2/(k+1))**((k+1)/(k-1)))
A=10000/(C*0.975*1000)*math.sqrt(400/17.031); rec('L27 area mm2',1882,A,0.005)
# L02 air
air=1000;O2=210;N2=790;S=100; tot=S+(O2-S)+N2; rec('L02 SO2%',10.0,100*S/tot,0.005); rec('L02 O2%',11.0,100*(O2-S)/tot,0.005)
# L03 propane: 5 O2 per C3H8
rec('L03 air',261.9,10*5*1.1/0.21,0.002)
# L07
rec('L07 coke kmol/h',91.5,10e3/393.5*3.6,0.002); rec('L07 gasifier MW',2.81,91.48*110.5/3600,0.01)
# L01
rec('L01 H2 kg/h',30.24,15*2.016,0.002); rec('L01 N2 kg/h',140.1,5*28.014,0.002)
for r in out: print(f"{r[0]:28s} exp {r[1]:<12.6g} got {r[2]:<12.6g} {'OK' if r[3] else 'MISMATCH'}")
print(sum(r[3] for r in out),'/',len(out))
