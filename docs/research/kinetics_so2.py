"""SO2 + 1/2 O2 = SO3 over V2O5-K2SO4/SiO2, Eklund form as transcribed in arXiv:1412.6486 (citing Eklund 1956 via refs [5],[8],[10]).
 r = k sqrt(pSO2/pSO3) ( pO2 - (pSO3/(pSO2 Kp))^2 )   [mol SO2 / s / g cat], p in atm
 k = exp(-97782.22/T - 110 ln(1.8 T) + 912.8)  ; Kp = exp(11829.44/T - 11.24) [atm^-0.5]
Kp cross-check: dH=-98.35 kJ, dS=-93.4 J/K  vs formation data (dH298 -98.9, dS298 -94.0)  -> consistent.
The sqrt(pSO2/pSO3) factor is singular at pSO3=0 -> floor pSO3 >= FLOOR*pSO2 (game: seed with small SO3).
Also fits a 'LHHW-lite' form that is finite at pSO3=0."""
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares
R=8.314
FLOOR=0.02
def Kp(T): return np.exp(11829.44/T-11.24)
def k_ek(T): return np.exp(-97782.22/T-110*np.log(1.8*T)+912.8)
def r_ek(T,pS,pO,pT,floor=FLOOR):
    pT=max(pT,floor*pS)
    return k_ek(T)*np.sqrt(pS/pT)*(pO-(pT/(pS*Kp(T)))**2)
# heat: dH(T) approx const -98.35 kJ/mol + dCp*(T-700) ; Cp (J/mol/K) at ~ 600-800K
CpS={'SO2':50.5,'O2':32.5,'SO3':72.0,'N2':30.8}
dH=lambda T: -98.35e3+ (72.0-50.5-0.5*32.5)*(T-700.)
def eq_X(T,y0,P):
    from scipy.optimize import brentq
    S0,O0,T0,N0=y0
    def f(X):
        n=np.array([S0*(1-X),O0-0.5*S0*X,T0+S0*X,N0]);N=n.sum();p=n/N*P
        return p[2]/(p[0]*p[1]**0.5)-Kp(T)
    return brentq(f,0,0.99999)
def pfr(T0=693.15,P=1.5,y0=(0.10,0.11,0.0,0.79),rho_b=500.,Wmax=1.0,adiabatic=True,r=r_ek):
    """W in g cat per (mol/s total feed). X=SO2 conv"""
    y0=np.array(y0)/sum(y0); S0,O0,T3,N0=y0
    nC=np.array([CpS['SO2'],CpS['O2'],CpS['SO3'],CpS['N2']])
    def rhs(W,s):
        X,T=s
        n=np.array([S0*(1-X),O0-0.5*S0*X,T3+S0*X,N0]);N=n.sum();p=n/N*P
        rr=r(T,p[0],p[1],p[2])      # mol/s/g
        dX=rr/S0
        dT=(-dH(T))*rr/ (n*nC).sum() if adiabatic else 0
        return [dX,dT]
    Ws=np.linspace(0,Wmax,2001)
    sol=solve_ivp(rhs,[0,Wmax],[0,T0],t_eval=Ws,method='LSODA',rtol=1e-8,atol=1e-11)
    return Ws,sol.y,y0
if __name__=='__main__':
    print('Kp(700)=%.2f atm^-.5  k(700)=%.3g  k(693)=%.3g k(800)=%.3g'%(Kp(700),k_ek(700),k_ek(693),k_ek(800)))
    for T in (693,760,830):
        Ea=-(-97782.22+110*T)*-1*R*-1  # Ea = R*(97782 - 110 T)
        print('apparent Ea(%d K)=%.0f kJ/mol'%(T,R*(97782.22-110*T)/1e3))
    # thermodynamic cross-check of Kp
    dG=lambda T:(-98.9e3)-T*(-94.0)  # crude
    print('Kp thermo(700)=%.2f vs fit %.2f'%(np.exp(-dG(700)/(R*700)/1.0)**1.0,Kp(700)))
    y0=(0.10,0.11,0.0,0.79)
    for floor in (0.01,0.02,0.05):
        FLOOR_=floor
        Ws,Y,yy=pfr(r=lambda T,a,b,c,fl=floor:r_ek(T,a,b,c,fl),Wmax=60000.)
        print('floor',floor,'X at W=[5000,20000,60000] g/(mol/s):',[round(Y[0,np.argmin(abs(Ws-w))],3) for w in (5000,20000,60000)])
    Ws,Y,yy=pfr(Wmax=60000.)
    print('Bed1 (floor=%.2f) adiabatic: W[g/(mol/s)] X T[C] Xeq(T)'%FLOOR)
    for w in (0,500,1000,2000,5000,10000,20000,30000,45000,60000):
        i=np.argmin(abs(Ws-w)); X,T=Y[:,i]; print('%6d %.4f %.1f %.4f'%(w,X,T-273.15,eq_X(T,yy,1.5)))
    X,T=Y[:,-1]; print('final dT=%.1f K; adiabatic eq intersection check: Xeq(T_end)=%.4f X=%.4f'%(T-693.15,eq_X(T,yy,1.5),X))
    viol=sum(Y[0,i]>eq_X(Y[1,i],yy,1.5)+1e-6 for i in range(0,len(Ws),10)); print('violations',viol)
    # 'light-off': isothermal conversion at W=500 vs T
    print('isothermal X at W=20000 (g/(mol/s)), floor .02:')
    for Tc in (340,360,380,400,420,440,460,500,550,600,650):
        Ws2,Y2,_=pfr(T0=Tc+273.15,adiabatic=False,Wmax=20000.); print(Tc,round(Y2[0,-1],3),'Xeq=%.3f'%eq_X(Tc+273.15,yy,1.5))
    # ---- simplification: keep Eklund structure, replace k(T) by Arrhenius segments (k(T) closed form is already cheap)
    Ts=np.linspace(660,850,200); lk=np.log(k_ek(Ts))
    for lo,hi in ((660,850),(660,760),(760,850)):
        m=(Ts>=lo)&(Ts<=hi); c=np.polyfit(1/Ts[m],lk[m],1); err=np.exp(np.abs(np.polyval(c,1/Ts[m])-lk[m]).max())
        print('Arrhenius fit k(T) %d-%d K: Ea=%.1f kJ/mol lnA=%.2f  max factor error=%.3f'%(lo,hi,-c[0]*R/1e3,c[1],err))
