import sys, os, math
sys.argv=[sys.argv[0]]
sys.path.insert(0,os.environ.get('PYLIB',''))  # CoolProp location (pip install CoolProp)
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import thermo as T
import CoolProp.CoolProp as CP
from scipy.optimize import brentq
K=T.K
print("NH3 Psat bar:", {tc: round(CP.PropsSI('P','T',tc+273.15,'Q',0,'Ammonia')/1e5,3) for tc in (-33,-20,-10,0,10,20,30,35)})
def psat(tc): return CP.PropsSI('P','T',tc+273.15,'Q',0,'Ammonia')/1e5
def eq_reactor(n,Tk,P):
    k=K('R1',Tk); inert=n.get('Ar',0)+n.get('CH4',0)
    def f(x):
        n2=n['N2']-x;h2=n['H2']-3*x;a=n['NH3']+2*x;nt=n2+h2+a+inert
        return math.log((a/nt)**2/((n2/nt)*(h2/nt)**3)/P**2)-math.log(k)
    lo=-n['NH3']/2+1e-12 if n['NH3']>0 else 1e-12
    x=brentq(f,lo,min(n['N2'],n['H2']/3)*(1-1e-12))
    m=dict(n); m['N2']-=x; m['H2']-=3*x; m['NH3']+=2*x; return m
def loop(fresh,Tk,P,Tsep,purge,approach=1.0,it=4000):
    rec={k:0.0 for k in fresh}
    for i in range(it):
        feed={k:fresh[k]+rec[k] for k in fresh}
        eq=eq_reactor(feed,Tk,P)
        out={k:feed[k]+approach*(eq[k]-feed[k]) for k in feed}
        # flash: NH3 vapour y = Psat/P (Raoult, non-condensables stay in vapour)
        y=psat(Tsep)/P
        ninert=out['N2']+out['H2']+out.get('Ar',0)+out.get('CH4',0)
        nv_nh3=min(out['NH3'], y/(1-y)*ninert)
        liq=out['NH3']-nv_nh3
        gas={k:out[k] for k in out}; gas['NH3']=nv_nh3
        new={k:gas[k]*(1-purge) for k in gas}
        if max(abs(new[k]-rec[k]) for k in new)<1e-10: break
        rec=new
    pur={k:gas[k]*purge for k in gas}
    ntot=sum(feed.values())
    return dict(it=i,liq=liq,purge=pur,feed=feed,yAr=feed.get('Ar',0)/ntot, yNH3in=feed['NH3']/ntot, yNH3out=out['NH3']/sum(out.values()),loopflow=ntot)
fresh={'N2':250.0,'H2':750.0,'NH3':0.0,'Ar':3.0}
print("== L20/L21: loop 450C 150bar, approach 1 (equilibrium), fresh N2 250 H2 750 Ar 3 kmol/h ==")
for purge in (0.005,0.01,0.02,0.05,0.10):
  for Tsep in (-20,0,20):
    r=loop(fresh,723.15,150,Tsep,purge)
    H2loss=r['purge']['H2']/750
    print(f"purge={purge:.3f} Tsep={Tsep:+3d}C: NH3 prod={r['liq']:7.1f} kmol/h ({r['liq']*17.031/1000:5.2f} t/h) H2 lost={100*H2loss:5.2f}% yAr_in={100*r['yAr']:5.2f}% yNH3 in/out={100*r['yNH3in']:.2f}/{100*r['yNH3out']:.2f}% loop={r['loopflow']:.0f} it={r['it']}")
