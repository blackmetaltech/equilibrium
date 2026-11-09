"""Turton purchased/bare-module cost helper. K1-K3, ranges: Turton Table A.1 via OpenPyTEA cost_correlations.csv
(openpytea.readthedocs.io); C1-C3/B1/B2/F_M/F_BM via eqcost catalog.toml (github Jubel075/eqcost). Base CEPCI 397 (2001)."""
import math
L=math.log10
CEPCI={2001:397.0,2019:607.5,2023:797.9,2024:797.0}  # 2024 UNVERIFIED (CHE: < 2023); 2025 ~ 1.016*2024
K={ # name: (K1,K2,K3,Amin,Amax)
 'compressor_centrifugal':(2.2897,1.3604,-0.1027,450,3000),
 'motor_opendrip':(2.9508,1.0688,-0.1315,75,2600),
 'pump_centrifugal':(3.3892,0.0536,0.1538,1,300),
 'hx_floating_head':(4.8306,-0.8509,0.3187,10,1000),
 'hx_fixed_tube':(4.3247,-0.3030,0.1634,10,1000),
 'fired_heater':(7.3488,-1.1666,0.2028,1000,100000),
 'vessel_vertical':(3.4974,0.4485,0.1074,0.3,520),
 'tray_sieve':(2.9949,0.4465,0.3961,0.07,12.3),
 'packing_loose':(2.4493,0.9744,0.0055,0.03,628),
 'reactor_jacketed_agitated':(4.1052,0.5320,-0.0005,0.1,35),
 'fermenter':(4.1052,0.5320,-0.0005,0.1,35),
 'steam_boiler':(6.9617,-1.4800,0.3161,1200,9400),
 'gas_turbine_axial':(2.7051,1.4398,-0.1776,100,4000),
 'expander_radial':(2.2476,1.4965,-0.1618,100,1500),
 'steam_turbine':(2.6259,1.4398,-0.1776,70,7500),
}
def cp0(name,A):
    k1,k2,k3,lo,hi=K[name]
    if not lo<=A<=hi: print(f'  WARNING {name}: A={A} outside [{lo},{hi}]')
    return 10**(k1+k2*L(A)+k3*L(A)**2)
def fp_log(c,P): return 10**(c[0]+c[1]*L(P)+c[2]*L(P)**2)
def fp_vessel(P,D,S=850.0,tmin=0.0063): # Turton eq. A.2 style (UNVERIFIED memory), P barg, D m
    return max(1.0,((P+1)*D/(2*(S-0.6*(P+1)))+0.00315)/tmin)
def esc(c,year): return c*CEPCI[year]/CEPCI[2001]
if __name__=='__main__':
    y=2024
    # 1) 1 MW CS centrifugal compressor, direct F_BM=2.7 (CS), + open motor F_BM 1.5 (UNVERIFIED)
    c=cp0('compressor_centrifugal',1000); cbm=2.7*c
    m=cp0('motor_opendrip',1000); mbm=1.5*m
    print(f'Compressor 1 MW fluid power: Cp0(2001)=${c:,.0f} CBM=${cbm:,.0f} -> 2024 ${esc(cbm,y):,.0f}')
    print(f'  + 1 MW electric motor: Cp0=${m:,.0f} CBM(F=1.5)=${mbm:,.0f} -> 2024 ${esc(mbm,y):,.0f}; total 2024 ${esc(cbm+mbm,y):,.0f}')
    # 2) 100 m2 floating-head CS HX @10 barg
    c=cp0('hx_floating_head',100); fp=fp_log((0.03881,-0.11272,0.08183),10); cbm=c*(1.63+1.66*1.0*fp)
    print(f'HX 100 m2 FH CS 10 barg: Cp0=${c:,.0f} Fp={fp:.4f} CBM=${cbm:,.0f} -> 2024 ${esc(cbm,y):,.0f} (Cp0 only 2024 ${esc(c,y):,.0f})')
    # 3) vertical vessel 3 m x 15 m @ 20 barg
    D,Hh,P=3.0,15.0,20.0; V=math.pi/4*D*D*Hh; c=cp0('vessel_vertical',V); fp=fp_vessel(P,D); cbm=c*(2.25+1.82*1.0*fp)
    print(f'Vessel V={V:.1f} m3: Cp0=${c:,.0f} Fp={fp:.3f} CBM=${cbm:,.0f} -> 2024 ${esc(cbm,y):,.0f}')
    print('CEPCI ratio 2024/2001 =',CEPCI[2024]/397)
