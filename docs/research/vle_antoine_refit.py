"""DERIVED: refit log10(P/bar)=A-B/(T/K+C) to CoolProp (reference EOS) saturation pressure over game-relevant ranges."""
import sys, os; sys.path.insert(0,''+os.environ.get('PYLIB','')+'')
import numpy as np, CoolProp.CoolProp as CP
from scipy.optimize import least_squares
R={'NH3':('Ammonia',230,370),'H2O':('Water',300,520),'CH3OH':('Methanol',290,460),'C2H5OH':('Ethanol',290,460),'SO2':('SulfurDioxide',250,400),'Cl2':('Chlorine',230,380)}
for k,(f,lo,hi) in R.items():
    T=np.linspace(lo,hi,40); P=np.array([CP.PropsSI('P','T',t,'Q',0,f)/1e5 for t in T]); y=np.log10(P)
    s=least_squares(lambda p:p[0]-p[1]/(T+p[2])-y,[5,1500,-40]); A,B,C=s.x
    e=100*(10**(A-B/(T+C))/P-1)
    print('%-7s %d-%d K  A=%.5f B=%.3f C=%.3f  max|err|=%.2f%%'%(k,lo,hi,A,B,C,abs(e).max()))
