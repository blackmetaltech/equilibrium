"""HT shift (Fe-Cr), game-friendly power law with approach to equilibrium. FORM (recalled, UNVERIFIED): Hla et al., Appl. Catal. A 353 (2009) 1-?:
 r = k pCO^0.9 pH2O^0.31 pCO2^-0.156 pH2^-0.05 (1-beta) , beta = pCO2 pH2/(Keq pCO pH2O), Ea ~ 111 kJ/mol (recalled).
 Keq (WGS) = 10^(2073/T-2.029)  [Graaf 1986 via Vanden Bussche & Froment 1996, FETCHED]. Prefactor k0 here is CALIBRATED (not literature): chosen so that an
 adiabatic bed at 350 C inlet, 30 bar, dry-gas CO 12%, S/G .. reaches ~90% approach to equilibrium at ~4 kg cat per mol/s CO... see output."""
import numpy as np
from scipy.integrate import solve_ivp
R=8.314; Ea=111e3
Keq=lambda T:10**(2073/T-2.029)
def r(T,p,k0):
    pCO,pW,pC,pH=[max(x,1e-9) for x in p]
    return k0*np.exp(-Ea/(R*T))*pCO**0.9*pW**0.31*pC**-0.156*pH**-0.05*(1-pC*pH/(Keq(T)*pCO*pW))
def bed(k0,T0=623.15,P=30.,y=(0.12,0.30,0.08,0.38),Wmax=3000.):   # CO,H2O,CO2,H2 (+inert rest); W g/(mol/s)
    y=np.array(y); dH=-41.2e3; Cp=34.
    def rhs(W,s):
        x,T=s; n=y+np.array([-x,-x,x,x]); N=1.0   # total moles unchanged
        p=n*P; rr=r(T,p,k0)
        return [rr,-dH*rr/Cp]
    s=solve_ivp(rhs,[0,Wmax],[0,T0],method='LSODA',rtol=1e-9,atol=1e-12,t_eval=np.linspace(0,Wmax,301)); return s,y
if __name__=='__main__':
    # calibrate k0 so that CO conversion is ~ 80% of eq at W=1000 g/(mol/s total)
    from scipy.optimize import brentq
    def xeq(T,y,P=30.):
        from scipy.optimize import brentq
        return brentq(lambda x:(y[2]+x)*(y[3]+x)/((y[0]-x)*(y[1]-x))-Keq(T),0,y[0]-1e-9)
    y=np.array((0.12,0.30,0.08,0.38))
    def f(lk0):
        s,_=bed(np.exp(lk0),Wmax=1000.); return s.y[0,-1]/0.12-0.5   # CO conv 50%
    lk0=brentq(f,-10,20); k0=np.exp(lk0); print('calibrated ln k0 = %.2f (k0=%.3g, Ea=%.0f kJ/mol)'%(lk0,k0,Ea/1e3))
    s,_=bed(k0,Wmax=20000.)
    for w in (100,300,1000,3000,10000,20000):
        i=np.argmin(abs(s.t-w)); x,T=s.y[:,i]; print('W=%6d g/(mol/s): CO conv=%.3f T=%.1f C  CO conv at eq(T)=%.3f'%(w,x/0.12,T-273.15,xeq(T,y)/0.12))
    print('adiabatic rise = %.1f K'%(s.y[1,-1]-623.15))
