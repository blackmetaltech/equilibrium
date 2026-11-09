import sys, os,math; sys.path.insert(0,''+os.environ.get('PYLIB','')+'')
import CoolProp.CoolProp as CP
# IAPWS-IF97 via CoolProp backend IF97 (h reference: IAPWS-IF97 triple point liquid u=s=0), cross-check with HEOS
for be in ('IF97::Water','Water'):
    print('backend',be)
    for Pb in (4,10,40):
        P=Pb*1e5; Ts=CP.PropsSI('T','P',P,'Q',0,be)
        hf=CP.PropsSI('H','P',P,'Q',0,be)/1e3; hg=CP.PropsSI('H','P',P,'Q',1,be)/1e3
        print('  P=%2d bar Tsat=%.2f C hf=%.1f hg=%.1f hfg=%.1f kJ/kg'%(Pb,Ts-273.15,hf,hg,hg-hf))
    print('  BFW 105 C (sat liquid h at 105 C, 1 atm/ ~1.2 bar):',CP.PropsSI('H','T',378.15,'Q',0,be)/1e3,'kJ/kg;  at 10 bar compressed:',CP.PropsSI('H','T',378.15,'P',10e5,be)/1e3,' at 40 bar:',CP.PropsSI('H','T',378.15,'P',40e5,be)/1e3)
def C(k): return 0.03948*math.sqrt(k*(2/(k+1))**((k+1)/(k-1)))
def Cus(k): return 520*math.sqrt(k*(2/(k+1))**((k+1)/(k-1)))
print('C_SI(1.4)=%.5f  C_US(1.4)=%.1f  13160 const check 1/C_SI=%.2f'%(C(1.4),Cus(1.4),1/C(1.4)))
for k in (1.1,1.2,1.3,1.4,1.67): print(k,round(C(k),5),round(Cus(k),1))
def area_mm2(W_kgh,P1_kPa_abs,T_K,Z,M,k,Kd=0.975,Kb=1,Kc=1):
    return W_kgh/(C(k)*Kd*P1_kPa_abs*Kb*Kc)*math.sqrt(T_K*Z/M)  # mm2 (API 520-1 SI)
print(area_mm2(10000,1000,400,1,17.03,1.31))
