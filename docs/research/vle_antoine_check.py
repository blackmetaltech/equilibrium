import sys, os; sys.path.insert(0,''+os.environ.get('PYLIB','')+'')
import CoolProp.CoolProp as CP
# log10(P/bar)=A-B/(T/K+C); NIST WebBook (Stull 1947 etc.) FETCHED
A={ 'NH3':('Ammonia',[(164.0,239.6,3.18757,506.713,-80.78),(239.6,371.5,4.86886,1113.928,-10.409)]),
 'H2O':('Water',[(255.9,373,4.6543,1435.264,-64.848),(344,373,5.08354,1663.125,-45.622),(304,333,5.20389,1733.926,-39.485)]),
 'CH3OH':('Methanol',[(288.1,356.83,5.20409,1581.341,-33.50),(353.5,512.63,5.15853,1569.613,-34.846)]),
 'C2H5OH':('Ethanol',[(292.77,366.63,5.24677,1598.673,-46.424),(364.8,513.91,4.92531,1432.526,-61.819),(273,351.7,5.37229,1670.409,-40.191)]),
 'SO2':('SulfurDioxide',[(177.7,263,3.48586,668.225,-72.252),(263,414.9,4.37798,966.575,-42.071)]),
 'Cl2':('Chlorine',[(155,239.4,3.0213,530.591,-64.639),(239.4,400.3,4.28814,969.992,-12.791)])}
for k,(f,sets) in A.items():
    Tb=CP.PropsSI('T','P',101325,'Q',0,f)
    hv=(CP.PropsSI('H','P',101325,'Q',1,f)-CP.PropsSI('H','P',101325,'Q',0,f))*CP.PropsSI('molar_mass',f)/1000
    print(k,'Tb(CP)=%.2f K  dHvap(Tb)=%.2f kJ/mol'%(Tb,hv))
    for lo,hi,a,b,c in sets:
        for T in (lo+0.1*(hi-lo),(lo+hi)/2,lo+0.9*(hi-lo)):
            pa=10**(a-b/(T+c)); pc=CP.PropsSI('P','T',T,'Q',0,f)/1e5
            print('  %.0f-%.0f K T=%.1f Pant=%.4f Pcp=%.4f err=%+.2f%%'%(lo,hi,T,pa,pc,100*(pa/pc-1)))
