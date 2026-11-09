"""Batch ethanol fermentation, S. cerevisiae. Structure: Monod(+substrate inhibition) x Luong product inhibition (Luong 1985, Biotechnol Bioeng 27:280):
   mu = mu_max (1-(P/Pm)^alpha) S/(Ks+S)   [Luong form in the paper: (1-(P/Pm)^alpha); the common 'Levenspiel' form is (1-P/Pm)^n]
 VERIFIED from fetched abstract: ATCC 4126, anaerobic batch; growth stops ~112 g/L EtOH, fermentation capacity zero at 115 g/L.
 THE REST ARE GAME-TUNED, in literature ranges (mu_max 0.2-0.5 /h; Ks 1-50 g/L glucose; Yx/s 0.05-0.12; Yp/s 0.43-0.49) - NOT from one paper.
 Temperature: Rosso CTMI cardinal model (Tmin,Topt,Tmax) (form: Rosso 1993, recalled) + death kd(T) Arrhenius-type above ~38 C (Ed weak/game-tuned).
 TUM record (fetched abstract): ethanol formation optimum 32-36 C for S. cerevisiae Sc5, Ea(ethanol formation) 78.5 +/- 2.2 kJ/mol."""
import numpy as np
from scipy.integrate import solve_ivp
R=8.314
P=dict(mu_max=0.15, Ks=5.0, Ki=250.0, Pm=112., Pm2=115., n=0.5, n2=0.5, Yxs=0.05, Yps=0.46, mS=0.06,
       Tmin=278.15, Topt=306.15, Tmax=320.15, kd40=0.03, Ed=280e3)
def cardinal(T,Tmin,Topt,Tmax):
    if T<=Tmin or T>=Tmax: return 0.0
    num=(T-Tmax)*(T-Tmin)**2
    den=(Topt-Tmin)*((Topt-Tmin)*(T-Topt)-(Topt-Tmax)*(Topt+Tmin-2*T))
    return num/den
def kd(T): return P['kd40']*np.exp(P['Ed']/R*(1/313.15-1/T)) if T>305.15 else 0.0
def rhs(t,y,T,p=P):
    X,S,Pe=y; S=max(S,0.0); f=cardinal(T,p['Tmin'],p['Topt'],p['Tmax'])
    mu=p['mu_max']*f*S/(p['Ks']+S+S*S/p['Ki'])*max(1-Pe/p['Pm'],0)**p['n']
    qm=p['mS']*f*S/(p['Ks']+S)*max(1-Pe/p['Pm2'],0)**p['n2']
    rs=(mu/p['Yxs']+qm)*X
    return [(mu-kd(T))*X,-rs,p['Yps']*rs]
def run(T,S0=150.,X0=1.0,tend=120.):
    ev=lambda t,y,T:y[1]-0.5; ev.terminal=True
    sol=solve_ivp(rhs,[0,tend],[X0,S0,0.],args=(T,),t_eval=np.linspace(0,tend,1201),method='LSODA',rtol=1e-8,atol=1e-10)
    return sol
if __name__=='__main__':
    print('Theoretical Yp/s = 2*46.07/180.16 = %.4f g/g (CO2 %.3f)'%(2*46.07/180.16,2*44.01/180.16))
    for Tc in (20,25,30,32,35,38,40,42,45):
        T=Tc+273.15; s=run(T); X,S,Pe=s.y
        t90=s.t[np.argmax(S<0.1*150)] if (S<15).any() else np.nan
        print('T=%2d C f(T)=%.2f  t(90%% glc used)=%5.1f h  final P=%.1f g/L S=%.1f X=%.1f  Yp/s_overall=%.3f'%(Tc,cardinal(T,P['Tmin'],P['Topt'],P['Tmax']),t90,Pe[-1],S[-1],X.max(),Pe[-1]/(150-S[-1])))
    s=run(305.15); X,S,Pe=s.y
    print('32C trajectory (h, X, S, P):')
    for h in (0,6,12,24,36,48,60,72):
        i=np.argmin(abs(s.t-h)); print(h,round(X[i],2),round(S[i],1),round(Pe[i],1))
    print('max P allowed check: P<=0.511*S0=%.1f ; got max %.1f'%(0.511*150,Pe.max()))
