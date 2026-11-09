"""Xu & Froment AIChE J 35(1):88-96 (1989). Parameter values CONFIRMED indirectly: Korean Chem Eng Res 56(6) 2018 Table 6 quotes X&F column
 (k0: 7.04e14, 3.26e2(? mol/gcat/min/kPa), 1.71e14 ; Ea 240.1, 67.13, 243.9 kJ/mol; K_CO 8.23e-7 kPa^-1 (dH -70.65), K_H2 6.12e-11 (-82.9), K_CH4 6.65e-6 (-38.28), K_H2O 1.77e5 (+88.68)).
 Converting kPa/mol/gcat/min to bar/kmol/kgcat/h reproduces the textbook numbers below exactly (x60/10 etc.).
 Equilibrium constants K1,K2 (bar^2 and -) are RECALLED from memory (UNVERIFIED): K1=exp(-26830/T+30.114), K2=exp(4400/T-4.036), K3=K1K2.
 r1: CH4+H2O=CO+3H2 ; r2: CO+H2O=CO2+H2 ; r3: CH4+2H2O=CO2+4H2   [kmol/kgcat/h, p in bar]"""
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import fsolve
R=8.314
def K(T): K1=np.exp(-26830/T+30.114); K2=np.exp(4400/T-4.036); return K1,K2,K1*K2
def rates(T,p):
    pCH4,pH2O,pCO,pCO2,pH2=[max(x,1e-12) for x in p]; K1,K2,K3=K(T)
    k1=4.225e15*np.exp(-240100/(R*T)); k2=1.955e6*np.exp(-67130/(R*T)); k3=1.020e15*np.exp(-243900/(R*T))
    KCO=8.23e-5*np.exp(70650/(R*T)); KH2=6.12e-9*np.exp(82900/(R*T)); KCH4=6.65e-4*np.exp(38280/(R*T)); KH2O=1.77e5*np.exp(-88680/(R*T))
    DEN=1+KCO*pCO+KH2*pH2+KCH4*pCH4+KH2O*pH2O/pH2
    r1=k1/pH2**2.5*(pCH4*pH2O-pH2**3*pCO/K1)/DEN**2
    r2=k2/pH2*(pCO*pH2O-pH2*pCO2/K2)/DEN**2
    r3=k3/pH2**3.5*(pCH4*pH2O**2-pH2**4*pCO2/K3)/DEN**2
    return r1,r2,r3
def pfr(T=1073.15,P=25.,SC=3.,H2in=0.05,rho_b=1000.,Wmax=3.):  # W kg cat per kmol/s... use kg per (kmol/h feed)
    n0=np.array([1.0,SC,0,0,H2in*(1+SC)*0.5+1e-3])   # CH4,H2O,CO,CO2,H2 per kmol CH4
    def rhs(W,x):
        n=n0+np.array([-x[0]-x[2],-x[0]-x[1]-2*x[2],x[0]-x[1],x[1]+x[2],3*x[0]+x[1]+4*x[2]]); p=n/n.sum()*P
        return rates(T,p)
    s=solve_ivp(rhs,[0,Wmax],[0,0,0],method='LSODA',rtol=1e-9,atol=1e-12,t_eval=np.linspace(0,Wmax,301)); return s,n0
def equil(T,P,n0):
    K1,K2,K3=K(T)
    def f(x):
        n=n0+np.array([-x[0]-x[2],-x[0]-x[1]-2*x[2],x[0]-x[1],x[1]+x[2],3*x[0]+x[1]+4*x[2]]); p=n/n.sum()*P
        return [p[2]*p[4]**3/(p[0]*p[1])-K1, p[3]*p[4]/(p[2]*p[1])-K2, 0 if False else (p[0]*p[1]**2*0)]
    # solve with 2 independent reactions (r1,r2); extent of r3 =0 in the (r1,r2) basis
    g=lambda x:[f([x[0],x[1],0.0])[0],f([x[0],x[1],0.0])[1]]
    return fsolve(g,[0.7,0.3],xtol=1e-13)
if __name__=='__main__':
    K1,K2,K3=K(1073.15); print('K1(800C)=%.1f bar^2 K2=%.3f'%(K1,K2))
    s,n0=pfr(); x=s.y
    xe=equil(1073.15,25.,n0)
    for w in (0.01,0.03,0.1,0.3,1.0,3.0):
        i=np.argmin(abs(s.t-w)); n=n0+np.array([-x[0,i]-x[2,i],-x[0,i]-x[1,i]-2*x[2,i],x[0,i]-x[1,i],x[1,i]+x[2,i],3*x[0,i]+x[1,i]+4*x[2,i]])
        print('W=%.2f kg/(kmol CH4/h): CH4 conv=%.3f  CO/CO2 y=%.3f/%.3f'%(w,(x[0,i]+x[2,i]),n[2]/n.sum(),n[3]/n.sum()))
    print('equilibrium CH4 conv (r1,r2 basis)=%.3f ; PFR end=%.3f'%(xe[0],x[0,-1]+x[2,-1]))
    # rate magnitude check at 500C inlet
    print('r1,r2,r3 @ 773K, 25 bar S/C3 inlet [kmol/kg/h]:',rates(773.15,np.array([0.2,0.6,0.001,0.001,0.05])*25/0.85))
