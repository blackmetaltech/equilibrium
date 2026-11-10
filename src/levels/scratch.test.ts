import { it } from 'vitest';
import { newEngine, must } from '../engine/test-helpers';
function run(T:number,P:number){
  const e = newEngine(['N2','H2','NH3']);
  const st:any = structuredClone(e.state); st.presets={eq_reactor:{reactions:'R1',Tmin:653.15,mode:'isothermal'}}; e.setState(st);
  const f = must(e,'placeUnit','feed',0,0,0).id as string;
  const c = must(e,'placeUnit','compressor',4,0,0).id as string;
  const r = must(e,'placeUnit','eq_reactor',10,0,0).id as string;
  const p = must(e,'placeUnit','product',16,0,0).id as string;
  must(e,'setFeed',f,{x:[0.25,0.75,0],flow:1000/3.6,T:298.15,P:25e5});
  must(e,'setParam',c,'P',P*1e5); must(e,'setParam',r,'T',T+273.15);
  must(e,'connect',f,'out',c,'in'); must(e,'connect',c,'out',r,'in'); must(e,'connect',r,'out',p,'in');
  const x = e.act("commission",[]); if(!e.state.solved?.ok) return {y:"FAIL "+x.message};
  const s = e.state; const out = s.solved!.streams[s.flowsheet.streams[2]!.id]!;
  const tot = out.n.reduce((a,b)=>a+b,0);
  return {ok:x.ok, y:(100*out.n[2]!/tot).toFixed(2), kpi:s.solved!.kpis, ru:s.solved!.units[r]};
}
it('l10', () => {
  console.log(JSON.stringify(run(380,53)));
  for (const [T,P] of [[380,50],[380,100],[400,50],[400,100],[450,100],[450,200],[500,200],[500,300],[550,300]]) console.log(T,P,run(T!,P!).y);
});
