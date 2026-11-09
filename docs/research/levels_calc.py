import sys, os, math
sys.argv=[sys.argv[0]]
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import thermo as T
from scipy.optimize import brentq
H=T.H; K=T.K
def Hmix(n,Tk): return sum(v*H(k,Tk) for k,v in n.items() if v)  # kJ
# ---- L05/L06 sulfur burner: 100 kmol/h S (liquid 140C) + air 25C, complete combustion
print("== Sulfur burner T_ad and steam ==")
for ySO2 in (0.06,0.08,0.10,0.11,0.12,0.14,0.16,0.18):
    air=100/ySO2; O2=0.21*air; N2=0.79*air
    Hin=100*H('S',413.15)+O2*H('O2',298.15)+N2*H('N2',298.15)
    out={'SO2':100,'O2':O2-100,'N2':N2}
    Tad=brentq(lambda t:Hmix(out,t)-Hin,400,3000)
    # boiler cools gas to 420C; steam 40 bar sat from BFW 105C: dh=2801-440=2361 kJ/kg
    Q=Hmix(out,Tad)-Hmix(out,693.15)  # kJ/h *1000 (kmol)
    steam=Q*1000/2361/1000  # t/h  (Q in kJ per kmol-basis => MJ/h)
    print(f"ySO2={ySO2:.2f} air={air:7.1f} kmol/h  O2/SO2={(O2-100)/100:5.2f}  Tad={Tad-273.15:7.1f} C  boilerQ={Q/3600:6.2f} MW  steam40bar={steam:5.2f} t/h  ({steam/ (100*0.098072):4.2f} t/t acid)")
print("dH R10 298:",T.rxn('R10',298.15)[0])
# ---- L10 Haber equilibrium y_NH3 ideal
print("== Haber ideal y_NH3 % (1:3) ==")
for tc in (380,400,420,450,500,550):
    print(tc, ' '.join(f"{P}bar:{100*T.nh3_eq(tc+273.15,P):5.2f}" for P in (25,50,100,150,200,300)))
# with inerts / ratio (L11) general eq solver
def nh3_y(Tk,P,nN2,nH2,ninert):
    k=K('R1',Tk)
    def f(x):
        n2=nN2-x;h2=nH2-3*x;a=2*x;nt=n2+h2+a+ninert
        return math.log((a/nt)**2/((n2/nt)*(h2/nt)**3)/P**2)-math.log(k)
    x=brentq(f,1e-12,min(nN2,nH2/3)*(1-1e-12))
    nt=nN2+nH2+ninert-2*x
    return 2*x/nt, x
print("== L11: 450C 150bar ratio & inerts ==")
for r in (2.0,2.5,3.0,3.5,4.0):
    y,_=nh3_y(723.15,150,1,r,0); print(f" H2:N2={r} y={100*y:.2f}%")
for inert in (0,0.02,0.05,0.10,0.15):
    tot=4/(1-inert); y,_=nh3_y(723.15,150,1,3,tot*inert); print(f" inerts {inert*100:.0f}% feed: y={100*y:.2f}%")
# ---- L12 WGS: CO+H2O, find steam ratio for CO slip
print("== WGS equilibrium ==")
for tc in (200,250,300,350,400,450):
    k=K('R5',tc+273.15); out=[]
    for s in (1.0,1.5,2.0,3.0,4.0):
        x=brentq(lambda x: math.log(x*x/((1-x)*(s-x)))-math.log(k),1e-12,1-1e-12)
        dry=(1-x)+x+x  # CO+CO2+H2
        out.append(f"S/CO={s}: X={x:.4f} COdry={100*(1-x)/dry:.2f}%")
    print(tc, f"K={k:.3g}", '; '.join(out))
# ---- L13 staircase: adiabatic equilibrium beds, 10% SO2, 11% O2, 79% N2, 1.2 bar, inlet 420 C each bed
print("== SO2 staircase ==")
def so2_bed(n,Tin,P=1.2):
    Hin=Hmix(n,Tin)
    def Xeq_at(t):
        k=K('R2h',t)
        s0,o0,t0,n0=n['SO2'],n['O2'],n['SO3'],n['N2']
        def g(x):
            s=s0-x;o=o0-0.5*x;so3=t0+x;nt=s+o+so3+n0
            return math.log((so3/nt)/((s/nt)*math.sqrt(o/nt*P)))-math.log(k)
        return brentq(g,-t0+1e-12 if t0>0 else 1e-12, s0*(1-1e-12))
    def resid(t):
        x=Xeq_at(t); m={'SO2':n['SO2']-x,'O2':n['O2']-0.5*x,'SO3':n['SO3']+x,'N2':n['N2']}
        return Hmix(m,t)-Hin
    tout=brentq(resid,Tin,1500); x=Xeq_at(tout)
    return {'SO2':n['SO2']-x,'O2':n['O2']-0.5*x,'SO3':n['SO3']+x,'N2':n['N2']}, tout
for Tin in (410,420,430):
  n={'SO2':10.,'O2':11.,'SO3':0.,'N2':79.}; s=f"Tin={Tin}C:"
  for b in range(1,5):
    n,to=so2_bed(n,Tin+273.15); s+=f" bed{b}: Tout={to-273.15:.0f}C X={100*n['SO3']/10:.2f}%"
  print(s)
# DCDA: after bed3 (Tin 420), absorb SO3 (99.9%), bed4 at 420
n={'SO2':10.,'O2':11.,'SO3':0.,'N2':79.}
for b in range(3): n,to=so2_bed(n,693.15)
x3=n['SO3']; n['SO3']*=0.001
n,to=so2_bed(n,693.15)
tot=(x3+n['SO3']-x3*0.001)/10
print(f"DCDA 3+1: after bed3 {100*x3/10:.2f}%, overall {100*tot:.3f}%  SO2 left {n['SO2']:.4f} kmol/10 fed")
# SO2 emission kg per t H2SO4: per 10 kmol SO2 fed -> acid 10*tot kmol*98.07 kg
for conv in (0.97,0.98,0.995,0.997,0.998):
    print(f" conv {conv}: kg SO2/t acid = {(1-conv)*64.06/(conv*98.07)*1000:.2f}")


