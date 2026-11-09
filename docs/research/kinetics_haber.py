"""Haber-Bosch adiabatic PFR: Temkin-Pyzhev / Dyson-Simon form, ideal-gas (fugacity-free) simplification.
Rate (kmol NH3 /m3cat /h), activities ~ partial pressures in atm:
  r = 2 k [ Ka^2 pN2 (pH2^3/pNH3^2)^alpha - (pNH3^2/pH2^3)^(1-alpha) ] * eta
  k = 8.849e14 exp(-170560/(R T))  (R=8.314 J/mol/K)   [source: Hernandez-type paper citing Dyson&Simon 1968, fetched]
  Ka: Gillespie-Beattie, log10 Ka = -2.691122 log10T -5.519265e-5 T +1.848863e-7 T^2 + 2001.6/T + 2.6899 (atm^-1, 1/2N2+3/2H2=NH3)
NB: the fetched paper prints 1.848863e-5 T^2 (typo; e-5 gives absurd Ka). e-7 verified below against dG.
"""
import numpy as np
from scipy.integrate import solve_ivp
R=8.314
def Ka(T): 
    return 10**(-2.691122*np.log10(T)-5.519265e-5*T+1.848863e-7*T**2+2001.6/T+2.6899)
def k_rev(T): return 8.849e14*np.exp(-170560/(R*T))
def rate(T,p,alpha=0.5,eta=1.0):  # p=[pN2,pH2,pNH3,pI] atm ; returns kmol NH3/m3cat/h
    pN,pH,pA=max(p[0],1e-9),max(p[1],1e-9),max(p[2],1e-9)
    return 2*k_rev(T)*(Ka(T)**2*pN*(pH**3/pA**2)**alpha-(pA**2/pH**3)**(1-alpha))*eta
# thermo (approx, constant Cp; flagged)
Cp={'N2':31.0,'H2':29.5,'NH3':45.0,'I':31.0}  # J/mol/K  mean 400-550C approx
def dH(T): return -46.1e3+(45.0-0.5*31.0-1.5*29.5)*(T-298.15)  # J/mol NH3 formed
def eq_conv(T,P,y0):
    """equilibrium NH3 mol fraction (ideal gas) by solving extent; y0=[N2,H2,NH3,I]"""
    from scipy.optimize import brentq
    n0=np.array(y0,float)
    def f(x):  # x = mol NH3 formed per mol feed
        n=n0+np.array([-x/2,-1.5*x,x,0]); N=n.sum(); p=n/N*P
        return p[2]/(p[0]**0.5*p[1]**1.5)-Ka(T)
    xm=min(n0[0]*2,n0[1]/1.5)
    x=brentq(f,0,xm*0.9999); return x
def run(T0=673.15,P=200.0,y0=(0.2328,0.6984,0.03,0.0388),eta=0.4,rho_b=2200.,Fdot_kmol_h=1.0,Amat=1.0,L=None):
    y0=np.array(y0)/sum(y0)
    # basis 1 mol/s feed -> use per unit area: F kmol/h per m2; integrate over catalyst volume per (kmol/h)
    n0=y0.copy()
    def rhs(v,s):  # v = m3 cat per (kmol/h feed)
        x,T=s
        n=n0+np.array([-x/2,-1.5*x,x,0]); N=n.sum(); p=n/N*P
        r=rate(T,p,0.5,eta)             # kmol/m3/h
        dx=r                            # kmol NH3 per kmol feed per (m3/(kmol/h)) 
        Cpm=(n*np.array([Cp['N2'],Cp['H2'],Cp['NH3'],Cp['I']])).sum()  # J/K per mol feed basis
        dT=-dH(T)*r/Cpm
        return [dx,dT]
    vs=np.linspace(0,0.02,2001)
    sol=solve_ivp(rhs,[0,vs[-1]],[0.0,T0],t_eval=vs,rtol=1e-8,atol=1e-10,method='LSODA')
    return vs,sol.y,n0
if __name__=='__main__':
    # Check Ka formula against dG: dGf(NH3)=-16.4 kJ/mol@298 ; Ka(298)
    print('Ka(298)=%.3g atm^-1 (expect ~ exp(16400/(R*298))=%.3g)'%(Ka(298.15),np.exp(16450/(R*298.15))))
    for T in (600,700,800): print('Ka(%d K)=%.4g atm^-1'%(T,Ka(T)))
    print('k_rev(700K)=%.3g'%k_rev(700))
    y0=np.array([0.2328,0.6984,0.03,0.0388]);y0/=y0.sum()
    P=200.0
    print('feed y(N2,H2,NH3,I)=',np.round(y0,4),'P=%g atm(bar~atm)'%P)
    for eta,rho in ((1.0,2200.),(0.4,2200.)):
        vs,Y,n0=run(eta=eta,rho_b=rho,P=P)
        print('--- eta=%.1f  rhoB=%g'%(eta,rho))
        for i in (0,50,100,200,400,800,1200,2000):
            x,T=Y[:,i]; n=n0+np.array([-x/2,-1.5*x,x,0]); yN=n[2]/n.sum()
            xe=eq_conv(T,P,n0); ne=n0+np.array([-xe/2,-1.5*xe,xe,0]); yeq=ne[2]/ne.sum()
            m_cat_per_tNH3d = vs[i]*rho  # kg per (kmol feed/h)
            print('V=%.4f m3/(kmol/h) cat=%.1f kg/(kmol/h)  T=%.1f C  yNH3=%.4f  yNH3,eq(T)=%.4f  margin=%.4f'%(vs[i],m_cat_per_tNH3d,T-273.15,yN,yeq,yeq-yN))
        x,T=Y[:,-1]
        print('adiabatic dT total = %.1f K ; dT per 1 mol%% NH3 formed ~ %.1f K'%(T-673.15,(T-673.15)/((n0+np.array([-x/2,-1.5*x,x,0]))[2]/ (n0+np.array([-x/2,-1.5*x,x,0])).sum()*100-3)))
        # never exceed eq check along whole path
        viol=0
        for i in range(0,len(vs),20):
            x,T=Y[:,i]; n=n0+np.array([-x/2,-1.5*x,x,0]); 
            xe=eq_conv(T,P,n0)
            if x>xe*(1+1e-6): viol+=1
        print('points with extent > local-T equilibrium extent:',viol)
    # per-volume capacity: bed volume giving 90% approach? 
    print('dH(673K)=%.1f kJ/mol NH3'%(dH(673.15)/1e3))

def table():
    import numpy as np
    vs,Y,n0=run(eta=0.4)
    print('V_cat[L per kmol/h]  GHSV[kmol feed/h/m3]  T[C]  yNH3  N2 conv')
    for vl in (0.05,0.1,0.2,0.4,0.6,0.8,1.0,1.5):
        i=np.argmin(abs(vs-vl*1e-3)); x,T=Y[:,i]
        n=n0+np.array([-x/2,-1.5*x,x,0])
        print('%5.2f  %7.0f  %6.1f  %.4f  %.3f'%(vs[i]*1e3,1/vs[i] if vs[i]>0 else 0,T-273.15,n[2]/n.sum(),x/2/n0[0]))
if __name__=='__main__': table()
