"""Jacketed CSTR, propylene oxide (A) + water -> propylene glycol, Fogler (Elements of CRE) Example 12-3-type data
as scraped from jqbond CEN587 L43 (fetched): k = 16.96e12 exp(-32400/(R T)) h^-1 with E = 32,400 BTU/lbmol (NOT cal/mol), R=1.987 Btu/lbmol/R,
dH = -36,000 Btu/lbmol (528 R) [Ex.1,2]; multiplicity variant dH = -108,000 Btu/lbmol [Ex.3]; CpA=35,CpB=18,CpC=46(45 in code),CpM=19.5 Btu/lbmol/R;
FA0=43.04, FB0=802.8, FM0=71.87 lbmol/h, Q0=326.34 ft3/h (CA0=0.132 lbmol/ft3), V=300 gal(40.1 ft3), T0=75F, UA=4000 Btu/h/R, Ta=85F.
First order in A (water in huge excess)."""
import numpy as np
from scipy.optimize import brentq
from scipy.integrate import solve_ivp
Rg=1.987
A=16.96e12; E=32400.
FA,FB,FM=43.04,802.8,71.87; Q=326.34; CA0=FA/Q
SumFCp=FA*35+FB*18+FM*19.5
rhoCpV=lambda V: (Q and (FA*35+FB*18+FM*19.5)/Q*V)   # Btu/R : sum_i C_i Cp_i V
def k(T): return A*np.exp(-E/(Rg*T))
def G(T,V,dH): tau=V/Q; X=tau*k(T)/(1+tau*k(T)); return -dH*FA*X
def Rm(T,UA,Ta,T0): return SumFCp*(T-T0)+UA*(T-Ta)
def steady(V,dH,UA,Ta,T0,Trange=(500,800)):
    Ts=np.linspace(*Trange,3001); f=np.array([G(T,V,dH)-Rm(T,UA,Ta,T0) for T in Ts])
    roots=[]
    for i in range(len(Ts)-1):
        if f[i]*f[i+1]<0: roots.append(brentq(lambda T:G(T,V,dH)-Rm(T,UA,Ta,T0),Ts[i],Ts[i+1]))
    return roots
def stability(T,V,dH,UA,Ta,T0):
    h=0.01; d=((G(T+h,V,dH)-Rm(T+h,UA,Ta,T0))-(G(T-h,V,dH)-Rm(T-h,UA,Ta,T0)))/(2*h); return 'stable' if d<0 else 'UNSTABLE'
F=lambda T:(T-459.67)
V0=300/7.481; T0=535.; Ta=544.67; UA=4000.
if __name__=='__main__':
    for lab,dH,V in (('Fogler Ex12-3 as given',-36000,V0),('x3 exotherm, V=300 gal',-108000,V0),('x3 exotherm, V=10 gal',-108000,10/7.481)):
        r=steady(V,dH,UA,Ta,T0); print(lab,'steady T[F]:',[(round(F(t),1),stability(t,V,dH,UA,Ta,T0),'X=%.3f'%(G(t,V,dH)/(-dH*FA))) for t in r])
    # design a game CSTR: scan dH,V,UA
    best=None
    print('--- scan for 3 steady states (dH=-108000)')
    for V in (V0,V0/2,V0/4,10/7.481):
        for UA_ in (1000,2000,4000,8000):
            r=steady(V,-108000,UA_,Ta,T0); print('V=%.1f ft3 UA=%d -> n=%d'%(V,UA_,len(r)),[round(F(t),0) for t in r])

# ------------------------------------------------------------------ game design + ignition + cooling loss
def dyn(UAfun,V,dH,Ta,T0,y0,tend=3.0):
    C=SumFCp/Q*V
    def rhs(t,y):
        CA,T=y; tau=V/Q; UAt=UAfun(t)
        dCA=(CA0-CA)/tau-k(T)*CA
        dT=(SumFCp*(T0-T)+UAt*(Ta-T)+(-dH)*k(T)*CA*V)/C
        return [dCA,dT]
    ev=lambda t,y: y[1]-(459.67+400); ev.terminal=True
    s=solve_ivp(rhs,[0,tend],y0,method='LSODA',rtol=1e-9,atol=1e-12,t_eval=np.linspace(0,tend,3001),events=ev)
    return s
def design_scan():
    dH=-108000.
    print('--- design scan: want lower state X~0.4-0.7, 3 states, loses ignition when UA*0.3')
    out=[]
    for V in np.linspace(2,12,21):
        for UA_ in (2000,3000,4000,5000,6000,8000):
            for Ta_ in (500+  (t) for t in (0,)) :
                pass
    return out
if __name__=='__main__':
    dH=-108000.
    for V in (1.34,2.0,3.0,4.0,5.0,6.0,8.0):
        for UA_ in (4000,6000,8000):
            r=steady(V,dH,UA_,Ta,T0); rl=steady(V,dH,0.3*UA_,Ta,T0)
            print('V=%.2f ft3 UA=%d: states F=%s X=%s | UA*0.3: %s'%(V,UA_,[round(F(t)) for t in r],[round(G(t,V,dH)/(-dH*FA),2) for t in r],[round(F(t)) for t in rl]))

def crit(V,dH,UA,mode='both',lo=60.,hi=200.):
    """lowest Ta(F) (T0=Ta if both; T0 fixed 75F if coolant) above which only upper state exists (ignition); bisection on number of states with lower-branch tracking"""
    def lower_exists(Tf):
        Tk=Tf+459.67
        t0=Tk if mode=='both' else 535.; ta=Tk
        r=steady(V,dH,UA,ta,t0,Trange=(480,900)); return len(r)>=2 or (len(r)==1 and r[0]<ta+60)  # 1 root only counts if cold
    a,b=lo,hi
    for _ in range(40):
        m=0.5*(a+b)
        if lower_exists(m): a=m
        else: b=m
    return a
if __name__=='__main__':
    print('=== ignition scan (T0=Ta moved together, F)')
    for V in (2.,4.,8.,16.):
        for UA_ in (4000,):
            Tc=crit(V,dH,UA_)
            r=steady(V,dH,UA_,Tc-3+459.67,Tc-3+459.67)
            print('V=%.0f ft3: critical T0=Ta ~ %.1f F ; just below: states F=%s X=%s'%(V,Tc,[round(F(t),1) for t in r],[round(G(t,V,dH)/(-dH*FA),2) for t in r]))

if __name__=='__main__':
    print('=== runaway on cooling loss; game reactor V=4 ft3 (0.113 m3), dH=-108000 Btu/lbmol (-251 MJ/kmol), UA=4000 Btu/h/R (=7.6 kW/K), T0=Ta')
    V=4.0
    for UA_ in (4000,1200):
        print(' UA=%d critical T0=Ta = %.1f F'%(UA_,crit(V,dH,UA_)))
    for Top in (80.,85.,90.):
        Tk=Top+459.67
        r=steady(V,dH,4000,Tk,Tk,Trange=(480,900)); r2=steady(V,dH,1200,Tk,Tk,Trange=(480,900))
        print(' T0=Ta=%.0f F: UA=4000 states F=%s X=%s | UA=1200 states F=%s'%(Top,[round(F(t),1) for t in r],[round(G(t,V,dH)/(-dH*FA),2) for t in r],[round(F(t),1) for t in r2]))
        lo=r[0]; X=G(lo,V,dH)/(-dH*FA); CAs=CA0*(1-X)
        s=dyn(lambda t:1200. if t>=0.2 else 4000.,V,dH,Tk,Tk,[CAs,lo],tend=4.0)
        T=s.y[1]; t=s.t
        def tcross(Tf):
            i=np.where(T>Tf+459.67)[0]; return (t[i[0]]-0.2)*60 if len(i) else None
        print('   cooling loss at t=0.2 h: time to +10F above start: %s min; to 125F: %s min; to 200F: %s min; T(4h)=%.0f F'%(tcross(lo-459.67+10),tcross(125),tcross(200),T[-1]-459.67))
    # sensitivity: partial: UA -30% only
    print('thermal mass C = %.0f Btu/R (=%.0f kJ/K); residence time tau=%.3f h'%(SumFCp/Q*V,SumFCp/Q*V*1.0551/0.5556,V/Q))
