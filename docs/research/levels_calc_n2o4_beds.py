import sys, os,math
sys.argv=[sys.argv[0]]
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import thermo as T
from scipy.optimize import brentq
# N2O4 <=> 2NO2 dissociation Kp (bar) at 298 and 400 K, rigorous and textbook
for t in (298.15,400):
    lnK9=T.rxn('R9',t)[3]; print(f"T={t}: Kp(N2O4->2NO2) rigorous={math.exp(-lnK9):.3f} bar, Kc={math.exp(-lnK9)/(0.0831446*t):.4g} mol/L")
dH,dS,_,_=T.rxn('R9',298.15)
for t in (298.15,400): print(" textbook", t, math.exp(-(-dH*1000 - t*(-dS))/(8.314*t)))
# alpha at 400 K, 0.15 mol in 1 L rigorous
Kp=math.exp(-T.rxn('R9',400)[3]); p0=0.15*0.0831446*400
x=brentq(lambda x:(2*x)**2/(p0-x)-Kp,1e-9,p0-1e-9); print(f"rigorous: P={p0+x:.2f} bar, alpha={x/p0:.3f}  (book: 9.15 bar)")
# bed1 adiabatic eq from various inlet T
H=T.H
def Hm(n,t): return sum(v*H(k,t) for k,v in n.items() if v)
def bed(Tin,P=1.2):
    n={'SO2':10.,'O2':11.,'SO3':0.,'N2':79.}; Hin=Hm(n,Tin)
    def xeq(t):
        k=T.K('R2h',t)
        return brentq(lambda x: math.log(((x)/(100-0.5*x))/(((10-x)/(100-0.5*x))*math.sqrt((11-0.5*x)/(100-0.5*x)*P)))-math.log(k),1e-12,10-1e-12)
    to=brentq(lambda t: Hm({'SO2':10-xeq(t),'O2':11-0.5*xeq(t),'SO3':xeq(t),'N2':79},t)-Hin,Tin,1500)
    return to-273.15, xeq(to)/10
for tc in (360,370,380,390,400,410,420,430,440): print(tc, "-> out %.1f C, X %.4f"%bed(tc+273.15))
