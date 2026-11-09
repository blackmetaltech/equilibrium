import numpy as np
R=8.314
print('--- rate ratio for +10 K, Ea=50 kJ/mol')
for T in (280,300,320,350): print(T, round(np.exp(50e3/R*(1/T-1/(T+10))),3))
print('Ea giving exactly 2.0 per 10K at 300K: %.1f kJ/mol'%(R*np.log(2)/(1/300-1/310)/1e3))
for nm,E in (('H2O2 uncat',75),('H2O2 +I-',56),('catalase 8',8),('catalase 19',19)): print(nm,'Q10 at 300K=%.2f'%np.exp(E*1e3/R*(1/300-1/310)))
print('--- N2O5: textbook A=4.3e13 s-1 (recalled), Ea=103 kJ/mol')
for T in (298.15,308.15,318.15): print(T-273.15, '%.3g'%(4.3e13*np.exp(-103e3/(R*T))))
print('Ea implied by k25=1.7e-5,k35=3.38e-5: %.0f kJ/mol (inconsistent with 103)'%(R*np.log(3.38e-5/1.7e-5)/(1/298.15-1/308.15)/1e3))
print('--- 2NO+O2: k3 = 3.3e-39 exp(530/T) cm6 molec-2 s-1')
NA=6.022e23
for T in (273,298,400,500,600,700,800):
    k=3.3e-39*np.exp(530/T); kM=k*(NA*1e-3)**2
    nt=101325/(1.380649e-23*T)*1e-6; t_half=1/(2*k*0.05*nt*1000e-6*nt)
    print('T=%d K k=%.3g cm6/molec2/s = %.3g L2/mol2/s ; NO half-life (1000ppm NO,5%%O2,1atm)=%.3g s'%(T,k,kM,t_half))
print('1.2e3*exp(530/298)=%.3g L2/mol2/s'%(1.2e3*np.exp(530/298.15)))
print('Ea_app = -530*R = %.1f kJ/mol'%(-530*R/1e3))
