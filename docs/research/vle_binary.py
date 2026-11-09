"""Ethanol-water & methanol-water VLE at 1.01325 bar. Parameters: ChemSep/DECHEMA (via thermo 0.6.1 pkg data files).
NRTL: tau_ij = A_ij/(R T), A in cal/mol, G=exp(-alpha tau). Wilson: Lam12=(V2/V1)exp(-(l12-l11)/RT).
Antoine: NIST WebBook, log10 P[bar]=A-B/(T[K]+C)."""
import numpy as np
from scipy.optimize import brentq
R=1.98720
P=1.01325
ANT={'eth':(5.24677,1598.673,-46.424),'eth2':(4.92531,1432.526,-61.819),'wat':(5.08354,1663.125,-45.622),'wat2':(4.6543,1435.264,-64.848),
     'met':(5.20409,1581.341,-33.50)}
def psat(k,T): a,b,c=ANT[k]; return 10**(a-b/(T+c))
def nrtl(x1,T,A12,A21,al):
    t12,t21=A12/(R*T),A21/(R*T); G12,G21=np.exp(-al*t12),np.exp(-al*t21); x2=1-x1
    l1=x2**2*(t21*(G21/(x1+x2*G21))**2+t12*G12/(x2+x1*G12)**2)
    l2=x1**2*(t12*(G12/(x2+x1*G12))**2+t21*G21/(x1+x2*G21)**2)
    return np.exp(l1),np.exp(l2)
def wilson(x1,T,d12,d21,V1,V2):  # d12=l12-l11, d21=l21-l22 cal/mol
    x2=1-x1; L12=V2/V1*np.exp(-d12/(R*T)); L21=V1/V2*np.exp(-d21/(R*T))
    a=x1+L12*x2; b=x2+L21*x1
    l1=-np.log(a)+x2*(L12/a-L21/b); l2=-np.log(b)-x1*(L12/a-L21/b)
    return np.exp(l1),np.exp(l2)
MODELS={
 'EtOH-H2O NRTL (ChemSep/DECHEMA 1atm)':('eth','wat',lambda x,T:nrtl(x,T,-57.9601,1241.7396,0.2937)),
 'EtOH-H2O Wilson (ChemSep/DECHEMA)':('eth','wat',lambda x,T:wilson(x,T,382.3,955.4,58.68,18.07)),
 'MeOH-H2O NRTL (ChemSep/DECHEMA p61)':('met','wat',lambda x,T:nrtl(x,T,-189.0469,792.8020,0.2999)),
 'MeOH-H2O Wilson (ChemSep/DECHEMA)':('met','wat',None),
 'ideal':None}
def bubble(x1,k1,k2,gam):
    f=lambda T: x1*gam(x1,T)[0]*psat(k1,T)+(1-x1)*gam(x1,T)[1]*psat(k2,T)-P
    T=brentq(f,300,400); g=gam(x1,T); return T,x1*g[0]*psat(k1,T)/P
if __name__=='__main__':
    # Wilson MeOH-water dlam from json: bij=-103.311,-242.632 K -> dlam=-bij*R
    MODELS['MeOH-H2O Wilson (ChemSep/DECHEMA)']=('met','wat',lambda x,T:wilson(x,T,103.311*R,242.632*R,40.73,18.07))
    for name,m in MODELS.items():
        if m is None: continue
        k1,k2,g=m
        print('==',name)
        xs=np.linspace(0.02,0.98,49)
        res=[bubble(x,k1,k2,g) for x in xs]
        # azeotrope: y-x sign change
        d=[y-x for x,(T,y) in zip(xs,res)]
        for i in range(len(xs)-1):
            if d[i]*d[i+1]<0:
                xa=brentq(lambda x:bubble(x,k1,k2,g)[1]-x,xs[i],xs[i+1]); Ta=bubble(xa,k1,k2,g)[0]
                M1=46.069 if k1=='eth' else 32.042
                print('  azeotrope x=%.4f mol  (%.2f wt%%)  T=%.2f C'%(xa,100*xa*M1/(xa*M1+(1-xa)*18.015),Ta-273.15))
        for x in (0.05,0.1,0.2,0.4,0.6,0.8,0.9):
            T,y=bubble(x,k1,k2,g); print('  x=%.2f y=%.4f T=%.2f C gam=%s'%(x,y,T-273.15,np.round(g(x,T),3)))
        # gamma infinity at Tb of solvent-ish T
        T0=360.
        print('  gamma_inf(T=360K): 1 in 2: %.2f  2 in 1: %.2f'%(g(1e-9,T0)[0],g(1-1e-9,T0)[1]))
    # ideal MeOH-water
    print('== MeOH-H2O ideal Raoult')
    g=lambda x,T:(1.,1.)
    for x in (0.05,0.1,0.2,0.4,0.6,0.8,0.9):
        T,y=bubble(x,'met','wat',g); print('  x=%.2f y=%.4f T=%.2f C'%(x,y,T-273.15))
