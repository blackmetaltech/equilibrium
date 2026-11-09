import numpy as np
from scipy.optimize import brentq, fsolve
from scipy.integrate import quad
np.set_printoptions(precision=6)
def recycle(fresh,nu,key,X,pf,inert):
    fresh=np.array(fresh,float);nu=np.array(nu,float)
    # iterate: reactor in = fresh + rec; MeOH/NH3 product index 2
    rec=np.zeros(4)
    for i in range(500):
        fin=fresh+rec
        xi=X*fin[key]/(-nu[key])
        out=fin+nu*xi
        gas=out.copy();prod=gas[2];gas[2]=0
        rec_new=(1-pf)*gas
        if np.max(abs(rec_new-rec))<1e-13: rec=rec_new;break
        rec=rec_new
    purge=pf*gas
    # closed form for limiting reactant
    Fk=fresh[key]/(1-(1-pf)*(1-X))
    print(' iter: inlet',fin,'xi',xi,'prod',prod,'purge',purge,'purge tot',purge.sum(),'iters',i)
    print(' closed F_key',Fk,' overall conv',(fresh[key]-purge[key])/fresh[key],' inert yin',fin[3]/fin.sum(), 'inlet total',fin.sum())
    return
print('CE-005');recycle([33,66,0,1],[-1,-2,1,0],0,0.2,0.1,3)
print('CE-006');recycle([24.9,74.8,0,0.3],[-1,-3,2,0],0,0.25,0.05,3)
# closed form 005: inert: purge N2 = 1 (steady) -> y_N2,purge=1/purge_total
# CE-007
print('CE-007')
A={'b':(6.8927,1203.5,219.89),'t':(6.9581,1346.8,219.69),'e':(6.9565,1423.5,213.21)}
z=np.array([.4,.3,.3]);T=105;P=760
Ps=np.array([10**(a-b/(T+c)) for a,b,c in A.values()]);K=Ps/P;print(' Psat',Ps,'K',K)
rr=lambda v:np.sum(z*(K-1)/(1+v*(K-1)))
print(' rr(0),rr(1)',rr(0),rr(1))
v=brentq(rr,0,1);x=z/(1+v*(K-1));y=K*x;print(' V/F',v,'x',x,'y',y,x.sum(),y.sum())
# CE-011
print('CE-011')
cp={'N2':[0.029,2.199e-06,5.723e-09,-2.871e-12],'O2':[0.0291,1.158e-05,-6.076e-09,1.311e-12],'CO2':[0.03611,4.233e-05,-2.887e-08,7.464e-12],'H2O':[0.03346,6.88e-06,7.604e-09,-3.593e-12],'CO':[0.02895,4.11e-06,3.548e-09,-2.22e-12],'H2':[0.02884,7.65e-08,3.288e-09,-8.698e-13]}
def H(sp,T): # int 25->T
    a,b,c,d=cp[sp];f=lambda t:a*t+b*t**2/2+c*t**3/3+d*t**4/4
    return f(T)-f(25)
dHr=-393.5+2*-241.83+74.85
for ratio,lab in((79/21,'79/21'),(3.76,'3.76')):
    n={'CO2':1,'H2O':2,'O2':0.5,'N2':2.5*ratio}
    T=brentq(lambda T:dHr+sum(v*H(k,T) for k,v in n.items()),25,4000);print(' ',lab,'Tad C',T,'K',T+273.15,'dHr',dHr)
n={'CO2':1,'H2O':2,'O2':0.5,'N2':2.5*79/21}
print(' no-excess-check ok')
# CE-013
print('CE-013')
dHr=-393.5+110.52+241.83
nin={'CO':1,'H2O':2};nout={'CO':.4,'H2O':1.4,'CO2':.6,'H2':.6}
cpall={**cp}
f=lambda T:sum(v*H(k,T) for k,v in nout.items())+0.6*dHr-sum(v*H(k,400) for k,v in nin.items())
T=brentq(f,25,2000);print(' Tout C',T,'dHr',dHr)
# CE-016
print('CE-016')
k,CA0,v0,eps=.5,.2,10.,1.
FA0=CA0*v0
I=quad(lambda X:FA0/(k*CA0**2*(1-X)**2/(1+eps*X)**2),0,.8,epsabs=1e-12,epsrel=1e-13)
u=.2;an=100*(4/u+4*np.log(u)-u-(4/1+0-1))
print(' V',I[0],'analytic',an,'L; FA0',FA0)
# CE-020
print('CE-020')
R=1.9872
Kf=lambda T:1000*np.exp(20000/R*(1/T-1/298))
Xe=lambda T:Kf(T)/(1+Kf(T))
g=lambda T:50*(T-300)/20000-Xe(T)
Ts=np.linspace(300,700,4001);vals=g(Ts);print(' sign changes',[Ts[i] for i in range(len(Ts)-1) if vals[i]*vals[i+1]<0])
T=brentq(g,300,700);print(' Tad',T,'X',Xe(T),50*(T-300)/20000,'K',Kf(T),' Xe300',Xe(300),Kf(300))
R2=1.987
Kf2=lambda T:1000*np.exp(20000/R2*(1/T-1/298));g2=lambda T:50*(T-300)/20000-Kf2(T)/(1+Kf2(T));print(' R=1.987 Tad',brentq(g2,300,700))
# CE-021/022
print('CE-021')
R=1.9872;E=30000
kk=lambda T:np.exp(-E/R*(1/T-1/350))
G=lambda T:20000*kk(T)/(1+kk(T))
Rr=lambda T,Tc=300:160*(T-Tc)
h=lambda T:G(T)-Rr(T)
Ts=np.linspace(250,500,25001);v=h(Ts);roots=[brentq(h,Ts[i],Ts[i+1]) for i in range(len(Ts)-1) if v[i]*v[i+1]<0]
dG=lambda T:(G(T+1e-4)-G(T-1e-4))/2e-4
for r in roots:print(' root',r,'X',kk(r)/(1+kk(r)),'dG',dG(r),'dR',160,'stable' if dG(r)<160 else 'UNSTABLE')
print('CE-022')
Ts=np.linspace(250,600,350001);d=dG(Ts)-160;tp=[brentq(lambda T:dG(T)-160,Ts[i],Ts[i+1]) for i in range(len(Ts)-1) if d[i]*d[i+1]<0];print(' tangent T',tp)
for t in tp:
    Tc=t-G(t)/160;print('  T',t,'Tc',Tc,'X',kk(t)/(1+kk(t)))
# verify with roots count
for Tc in (tp[0]-G(tp[0])/160,tp[1]-G(tp[1])/160):
    for e in(-0.5,0.5):
        hh=lambda T:G(T)-160*(T-(Tc+e));vv=hh(Ts[::100]);print('  Tc',Tc+e,'nroots',sum(vv[:-1]*vv[1:]<0))
# CE-024
print('CE-024')
g0,E,hS,Rg=1e13,80000,50,8.3145
f=lambda T:g0*np.exp(-E/(Rg*T))*E/(Rg*T**2)-hS
Tc=brentq(f,300,600);Ta=Tc-Rg*Tc**2/E;print(' Tcrit',Tc,'Ta_crit',Ta,'G',g0*np.exp(-E/(Rg*Tc)),'hS dT',hS*(Tc-Ta))
print(' Semenov Rg*Ta^2/E',Rg*Ta**2/E,'vs exact',Tc-Ta)
# semenov-estimate Ta from Tcrit-Ta=R Ta^2/E with exact tangency eq: g0 e/(...) approx
g=lambda Ta:g0*np.exp(-E/(Rg*Ta))*E/(Rg*Ta**2)*np.exp(1)**0 
# standard Semenov: g0 exp(-E/R Ta) E/(R Ta^2) = e*hS
Ta_s=brentq(lambda Ta:g0*np.exp(-E/(Rg*Ta))*E/(Rg*Ta**2)-hS/np.e,300,600);print(' Semenov Ta_crit (standard e-form)',Ta_s)
# CE-026
print('CE-026')
for R_ in(8.314,8.3145):
  for T0 in(298.15,298):
    print(' R',R_,'T0',T0,[580970*np.exp(92220/R_*(1/T-1/T0)) for T in(500,700)])
A=-5.871;B=.004181;D=-66100
def dH(T,H0=-92220):
    return H0+8.314*(A*(T-298.15)+B/2*(T**2-298.15**2)-D*(1/T-1/298.15))
def lnK(T,T0=298.15,K0=580970.):
    return np.log(K0)+quad(lambda t:dH(t)/(8.314*t**2),T0,T)[0]
print(' withCp (data from CE-030, dA,dB,dD)',[np.exp(lnK(T)) for T in(500,700)])
print(' dGf-based K298',np.exp(32900/(8.314*298.15)))
# CE-029
print('CE-029')
for Kb in(0.17439,580970*np.exp(92220/8.314*(1/500-1/298.15))):
    n0=np.array([1,3,0,.1]);P=100
    def F(xi):
        n=np.array([1-xi,3-3*xi,2*xi,.1]);y=n/n.sum();return y[2]**2/(y[0]*y[1]**3)/P**2-Kb
    xi=brentq(F,0,1-1e-9);n=np.array([1-xi,3-3*xi,2*xi,.1]);print(' K',Kb,'xi',xi,'yNH3',n[2]/n.sum(),'ntot',n.sum(),'N2 conv',xi)
# CE-030
print('CE-030')
sd={'SO2':(5.699,.000801,-101500.,-296830,-300194),'O2':(3.639,.000506,-22700.,0,0),'SO3':(8.06,.001056,-202800.,-395720,-371060)}
nu={'SO2':-1,'O2':-.5,'SO3':1}
dA=sum(nu[s]*sd[s][0] for s in nu);dB=sum(nu[s]*sd[s][1] for s in nu);dD=sum(nu[s]*sd[s][2] for s in nu)
H0=sum(nu[s]*sd[s][3] for s in nu);G0=sum(nu[s]*sd[s][4] for s in nu);print(' dA,dB,dD,H0,G0',dA,dB,dD,H0,G0)
for R_ in (8.314,):
  T0=298.15
  dHT=lambda T:H0+R_*(dA*(T-T0)+dB/2*(T**2-T0**2)-dD*(1/T-1/T0))
  lnK0=-G0/(R_*T0)
  lk=lnK0+quad(lambda t:dHT(t)/(R_*t**2),T0,800)[0]
  Kv=np.exp(lk);print(' K298',np.exp(lnK0),'K800 (bar^-0.5)',Kv,' dH800',dHT(800))
  # constant dH
  print(' const dH K800',np.exp(lnK0-H0/R_*(1/800-1/T0)))
  P=1.01325
  def F(xi):
    n=np.array([10-xi,10-xi/2,xi,80]);nt=n.sum();y=n/nt
    return y[2]/(y[0]*y[1]**.5)*P**-.5-Kv
  xi=brentq(F,0,10-1e-9);print(' xi',xi,'conv',xi/10)
  P=1.0
  def F2(xi):
    n=np.array([10-xi,10-xi/2,xi,80]);y=n/n.sum();return y[2]/(y[0]*y[1]**.5)*P**-.5-Kv
  print(' if P=1 bar conv',brentq(F2,0,9.99999)/10)
# NC
print('NC-022')
x=brentq(lambda x:(x/10)**2/((1-x)/10)**2-4.24,0,0.999999);print(' x',x,'[CO]',(1-x)/10,'[CO2]',x/10)
print('NC-024')
n0=13.8/92
for R_ in(.083145,.0821,.0831):
  nt=9.15*1/(R_*400);a=nt/n0-1
  pN=n0*(1-a)*R_*400/1;pNO2=2*n0*a*R_*400
  Kp=pNO2**2/pN;Kc=(2*n0*a)**2/(n0*(1-a));print(' R',R_,'alpha',a,'pN2O4',pN,'pNO2',pNO2,'Kp',Kp,'Kc',Kc)
# solve by pressure alt: exact P balance
print('NC-026')
Kd=1/54.8;r=np.sqrt(Kd);x=r*.5/(1+2*r);print(' [H2]',x,'[HI]',.5-2*x,' book-variant (eq [HI]=.5): H2=',.5*r)
print('NC-027')
Kc=4.63e-3;x=(-Kc+np.sqrt(Kc**2+16*.1*Kc))/8;print(' x',x,'[NO2]',2*x,'[N2O4]',.1-x,'alpha',x/.1)
print('NC-037')
for lab,fac in(('s^-1',60.),('min^-1',1.)):
  k=np.log(2)/(256*fac);T=12500/(14.34-np.log10(k));print(' ',lab,'k',k,'T',T)
