"""Methanol synthesis, Vanden Bussche & Froment, J. Catal. 161, 1-10 (1996), Table 2 (FETCHED & read). Cu/ZnO/Al2O3 (commercial), 180-280 C, 15-51 bar,
 pCO/pCO2 0-4.1.  p in bar, rates mol/kgcat/s.
 beta = 1 + (K_H2O/(K8K9K_H2)) pH2O/pH2 + sqrt(K_H2) sqrt(pH2) + K_H2O pH2O
 r_MeOH = k5a' K2' K3 K4 K_H2 pCO2 pH2 [1 - (1/K2*) pH2O pMeOH/(pH2^3 pCO2)] / beta^3
 r_RWGS = k1' pCO2 [1 - K3* (pH2O pCO/(pCO2 pH2))] / beta
 params: sqrtKH2=0.499 exp(17197/RT); KH2O=6.62e-11 exp(124119/RT); KH2O/(K8K9KH2)=3453.38;
         k5a'..=1.07 exp(36696/RT); k1'=1.22e10 exp(-94765/RT)   (R=8.314 J/mol/K)
 Equilibria (Graaf 1986, as quoted in VdB): log10 K2* = 3066/T - 10.592 (CO2+3H2=MeOH+H2O, bar^-2);
   log10(1/K3*) = -2073/T + 2.029 (RWGS)  -> K1 (CO+2H2=MeOH) = K2*K3*... check: = 5139/T - 12.621 (Graaf)
"""
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import fsolve
R=8.314
def K2s(T): return 10**(3066/T-10.592)
def K3s(T): return 10**(2073/T-2.029)   # WGS constant
def rates(T,p):  # p dict bar: CO,CO2,H2,H2O,MeOH
    pCO,pCO2,pH2,pW,pM=[max(p[k],1e-9) for k in ('CO','CO2','H2','H2O','MeOH')]
    sK=0.499*np.exp(17197/(R*T)); KW=6.62e-11*np.exp(124119/(R*T)); KWr=3453.38
    beta=1+KWr*pW/pH2+sK*np.sqrt(pH2)+KW*pW
    k5=1.07*np.exp(36696/(R*T)); k1=1.22e10*np.exp(-94765/(R*T))
    rM=k5*pCO2*pH2*(1-(1/K2s(T))*pW*pM/(pH2**3*pCO2))/beta**3
    rW=k1*pCO2*(1-K3s(T)*(pW*pCO/(pCO2*pH2)))/beta
    return rM,rW
dH={'M':-49.5e3,'W':+41.2e3}   # J/mol, CO2 hydrog. / RWGS at ~ 500K (Graaf-type values; approx, UNVERIFIED)
def state(n,P):
    N=sum(n.values()); return {k:v/N*P for k,v in n.items()}
def pfr(T0=523.15,P=70.,y0=None,rho_b=1100.,cooled=True,Tc=523.15,hw=27.,Wmax=40.,Cpm=34.):
    y0=y0 or {'CO':0.10,'CO2':0.05,'H2':0.70,'H2O':0.0,'MeOH':0.0,'I':0.15}
    keys=list(y0); n0=np.array([y0[k] for k in keys]); s=sum(n0); n0/=s
    idx={k:i for i,k in enumerate(keys)}
    def rhs(W,s):  # W in kg cat per (mol/s total feed); s=[xM,xW,T]  extents per mol feed
        xM,xW,T=s
        n=n0.copy(); n[idx['CO2']]+=-xM-xW; n[idx['H2']]+=-3*xM-xW; n[idx['MeOH']]+=xM; n[idx['H2O']]+=xM+xW; n[idx['CO']]+=xW
        p=state(dict(zip(keys,n)),P)
        rM,rW=rates(T,p)
        # mol/kg/s  -> per mol/s feed: dx/dW = r
        q=(-dH['M']*rM-dH['W']*rW)           # W/kg cat (J/s/kg)
        loss=hw*(T-Tc) if cooled else 0
        dT=(q-loss)/(Cpm*1.0)                 # per (mol/s) feed: Cpm J/mol/K *1 mol/s
        return [rM,rW,dT]
    Ws=np.linspace(0,Wmax,801)
    sol=solve_ivp(rhs,[0,Wmax],[0,0,T0],t_eval=Ws,method='LSODA',rtol=1e-8,atol=1e-12)
    return Ws,sol.y,n0,keys
def equilibrium(T,P,y0):
    keys=list(y0); n0=np.array([y0[k] for k in keys]);n0/=n0.sum(); idx={k:i for i,k in enumerate(keys)}
    K2=K2s(T); K3=1/K3s(T)  # RWGS K
    def f(x):
        xM,xW=x
        n=n0.copy(); n[idx['CO2']]+=-xM-xW; n[idx['H2']]+=-3*xM-xW; n[idx['MeOH']]+=xM; n[idx['H2O']]+=xM+xW; n[idx['CO']]+=xW
        p=n/n.sum()*P; g=dict(zip(keys,p))
        return [g['MeOH']*g['H2O']/(g['CO2']*g['H2']**3)-K2, g['CO']*g['H2O']/(g['CO2']*g['H2'])-K3]
    x=fsolve(f,[0.01,0.01],xtol=1e-13)
    n=n0.copy(); xM,xW=x
    n[idx['CO2']]+=-xM-xW; n[idx['H2']]+=-3*xM-xW; n[idx['MeOH']]+=xM; n[idx['H2O']]+=xM+xW; n[idx['CO']]+=xW
    return x,n/n.sum()
if __name__=='__main__':
    y0={'CO':0.10,'CO2':0.05,'H2':0.70,'H2O':0.0,'MeOH':0.0,'I':0.15}
    print('K1 check log10(K2*/K3rwgs) vs Graaf 5139/T-12.621 at 500K:',np.log10(K2s(500)*K3s(500)),5139/500-12.621)
    print('K2*(523)=%.3g bar^-2 ; K_WGS(523)=%.1f'%(K2s(523.15),K3s(523.15)))
    for T,lab in ((523.15,'isothermal 250C (cooled, hw=1e6)'),):
        Ws,Y,n0,keys=pfr(cooled=True,hw=1e6,Wmax=60.)
        xe,ye=equilibrium(523.15,70.,y0)
        print(lab,'equilibrium: x_MeOH=%.4f x_RWGS=%.4f  y_MeOH=%.4f'%(xe[0],xe[1],ye[keys.index('MeOH')]))
        for w in (0.1,0.5,1,2,5,10,20,40,60):
            i=np.argmin(abs(Ws-w)); xM,xW,T=Y[:,i]
            print(' W=%5.1f kg/(mol/s) xMeOH=%.4f (%.1f%% of eq)  xRWGS=%.4f  T=%.1f C'%(w,xM,100*xM/xe[0],xW,T-273.15))
    print('--- cooled tubular, hw=27 W/kg/K, Tc=250C, T0=250C')
    Ws,Y,n0,keys=pfr(cooled=True,hw=27.,Wmax=60.)
    imax=np.argmax(Y[2]); print('hot spot T=%.1f C at W=%.2f ; exit T=%.1f C'%(Y[2,imax]-273.15,Ws[imax],Y[2,-1]-273.15))
    bad=0
    for i in range(0,len(Ws),5):
        xM,xW,T=Y[:,i]; xe,_=equilibrium(T,70.,y0)
        if xM>xe[0]*(1+1e-3): bad+=1
    print('points with xMeOH > local-T equilibrium:',bad,' final xM=%.4f'%Y[0,-1])
    print('--- adiabatic, T0=250C')
    Ws,Y,n0,keys=pfr(cooled=False,Wmax=60.)
    print('adiabatic: T_exit=%.1f C dT=%.1f K, xM=%.4f'%(Y[2,-1]-273.15,Y[2,-1]-523.15,Y[0,-1]))
    xe,_=equilibrium(Y[2,-1],70.,y0); print('   equilibrium at exit T: xM=%.4f'%xe[0])
    # reaction rate sanity (mol/kg/s) at VdB base case 493 K 50 bar 4%CO 3%CO2 82%H2
    p={'CO':2.0,'CO2':1.5,'H2':41.0,'H2O':0.0,'MeOH':0.0}
    print('VdB bench inlet rate: rMeOH,rRWGS =',rates(493.2,p),' mol/kg/s')
