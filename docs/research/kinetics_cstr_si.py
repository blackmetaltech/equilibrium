"""SI jacketed CSTR for the game. Chemistry = Fogler propylene oxide hydrolysis (A=16.96e12 1/h, E=32400 Btu/lbmol = 75.36 MJ/kmol, dH = -108000 Btu/lbmol = -251.2 MJ/kmol (Fogler Ex.3 multiplicity variant; the real -36000 Btu/lbmol = -83.7 MJ/kmol gives NO multiplicity with these flows, dTad only 50 K),
first order in PO); solution heat capacity rho*Cp = 3.57 MJ/m3/K (from Fogler flows: sum F_i Cp_i / Q = 53.2 Btu/ft3/R); CA0 = 2.114 kmol/m3 (0.132 lbmol/ft3).
Game design chosen here (NOT from Fogler): jacket-dominant cooling so Semenov multiplicity/ignition shows."""
import numpy as np
from scipy.optimize import brentq
from scipy.integrate import solve_ivp
Rg=8.314e-3  # MJ/kmol/K
A=16.96e12; E=75.36    # 1/h, MJ/kmol
dH=-251.2; CA0=2.114; rCp=3.57  # MJ/kmol, kmol/m3, MJ/m3/K
def k(T): return A*np.exp(-E/(Rg*T))
class CSTR:
    def __init__(s,V=1.0,Q=0.25,UA=0.06,Tc=300.,T0=298.15): s.V,s.Q,s.UA,s.Tc,s.T0=V,Q,UA,Tc,T0   # UA in MJ/h/K
    def X(s,T): tk=s.V/s.Q*k(T); return tk/(1+tk)
    def G(s,T): return -dH*CA0*s.Q*s.X(T)               # MJ/h
    def Rm(s,T): return s.Q*rCp*(T-s.T0)+s.UA*(T-s.Tc)  # MJ/h
    def states(s,lo=270,hi=420):
        Ts=np.linspace(lo,hi,6001); f=s.G(Ts)-s.Rm(Ts); r=[]
        for i in range(len(Ts)-1):
            if f[i]*f[i+1]<0: r.append(brentq(lambda T:s.G(T)-s.Rm(T),Ts[i],Ts[i+1]))
        return r
    def stab(s,T): h=1e-3; return (s.G(T+h)-s.Rm(T+h)-(s.G(T-h)-s.Rm(T-h)))/(2*h)<0
def dynamic(c,UAfun,y0,tend=6.,Tstop=None):
    C=rCp*c.V
    def rhs(t,y):
        CA,T=y; return [(CA0-CA)*c.Q/c.V-k(T)*CA, (c.Q*rCp*(c.T0-T)+UAfun(t)*(c.Tc-T)+(-dH)*k(T)*CA*c.V)/C]
    ev=lambda t,y:y[1]-(Tstop or 1e9); ev.terminal=True
    return solve_ivp(rhs,[0,tend],y0,method='LSODA',rtol=1e-9,atol=1e-12,t_eval=np.linspace(0,tend,6001),events=ev)
if __name__=='__main__':
    print('k(300K)=%.3g 1/h  k(320K)=%.3g  ; adiabatic rise = %.1f K'%(k(300),k(320),-dH*CA0/rCp))
    print('--- scan (V=1 m3, T0=298.15, Tc=T0+? ) designs with 3 states')
    for Q in (0.1,0.25,0.5,1.0):
        for UA in (0.05,0.1,0.2,0.4):
            c=CSTR(Q=Q,UA=UA,Tc=298.15,T0=298.15); r=c.states()
            if len(r)==3: print('Q=%.2f m3/h tau=%.1f h UA=%.2f MJ/h/K (%.0f W/K): T=%s C X=%s'%(Q,1/Q,UA,UA/3.6e-3,[round(t-273.15,1) for t in r],[round(c.X(t),3) for t in r]))

def crit_T(V,Q,UA,mode='both'):
    """lowest T (K) of T0=Tc (or Tc only) at which lower steady state vanishes (ignition); bisection"""
    def lower(Tx):
        c=CSTR(V,Q,UA,Tc=Tx,T0=Tx if mode=='both' else 298.15); r=c.states(lo=Tx-5,hi=Tx+190)
        return len(r)>=2   # 3 states
    a,b=285.,360.
    for _ in range(40):
        m=0.5*(a+b); 
        if lower(m): a=m
        else: b=m
    return a
if __name__=='__main__':
    V,Q,UA=0.10,5.0,10.0
    c=CSTR(V,Q,UA,Tc=298.15,T0=298.15)
    print('\n=== GAME CSTR: V=%.2f m3 Q=%.1f m3/h (tau=%.0f s) UA=%.0f MJ/h/K (=%.1f kW/K) T0=Tc=25C CA0=%.3f kmol/m3'%(V,Q,3600*V/Q,UA,UA/3.6,CA0))
    r=c.states(); print('steady states:',[(round(t-273.15,1),'stable' if c.stab(t) else 'UNSTABLE','X=%.3f'%c.X(t)) for t in r])
    Ts=np.arange(290,420,10); print('G,R table T[C]:G[MJ/h]:R[MJ/h]'); print([ (round(t-273.15),round(c.G(t),1),round(c.Rm(t),1)) for t in Ts[::2]])
    print('critical T0=Tc (ignition) = %.1f C ; critical Tc only (T0=25C) = %.1f C'%(crit_T(V,Q,UA)-273.15,crit_T(V,Q,UA,'coolant')-273.15))
    # extinction: at which T0=Tc does upper state vanish (decreasing)
    for Tcx in (20,25,30,35,40):
        cc=CSTR(V,Q,UA,Tc=Tcx+273.15,T0=Tcx+273.15); rr=cc.states(lo=Tcx+273.15-5,hi=Tcx+273.15+190); print(' T0=Tc=%d C -> states C:%s'%(Tcx,[round(t-273.15,1) for t in rr]))
    up=r[-1]; CAs=CA0*(1-c.X(up))
    for frac in (0.3,):
        s=dynamic(c,lambda t:UA if t<0.1 else frac*UA,[CAs,up],tend=1.0)
        T=s.y[1]; t=s.t
        c2=CSTR(V,Q,frac*UA,Tc=298.15,T0=298.15); print('UA drops to %.0f%% at t=0.1 h: new states %s'%(frac*100,[round(x-273.15,1) for x in c2.states()]))
        for dT in (5,10,20):
            i=np.where(T>up+dT)[0]; print('  +%d K after loss: %.1f s'%(dT,(t[i[0]]-0.1)*3600) if len(i) else '  +%d K never'%dT)
        print('  T(1 h)=%.1f C; X(1h)=%.3f'%(T[-1]-273.15,1-s.y[0][-1]/CA0))
    # ignition run: start in lower state, step coolant/feed up by 10 K
    lo=r[0]; CAl=CA0*(1-c.X(lo))
    for Tn in (30,35,40,45):
        c3=CSTR(V,Q,UA,Tc=Tn+273.15,T0=Tn+273.15)
        s=dynamic(c3,lambda t:UA,[CAl,lo],tend=0.5); T=s.y[1]
        print('feed+coolant step 25->%d C from lower state: T(0.5h)=%.1f C, X=%.3f ; states %s'%(Tn,T[-1]-273.15,1-s.y[0][-1]/CA0,[round(x-273.15,1) for x in c3.states(lo=Tn+273.15-5,hi=Tn+273.15+190)]))
    # also: UA lost entirely (0%)
    s=dynamic(c,lambda t:UA if t<0.1 else 0.0,[CAs,up],tend=0.3); print('UA->0: T(0.3h)=%.1f C (adiabatic bound %.1f C)'%(s.y[1][-1]-273.15,25+(-dH*CA0)/rCp))
