// fix/hook-cover (v0.114.2): cover policy `rebar-bend-tolerance-1.0`. Generated 135° tie / stirrup hooks (Ø < 10) and corner
// bends sit exactly on the cover line; point rounding put the filleted arc 0.0001–0.0003 mm past it, so the legacy check
// (0.0001 mm) failed RB6 / RB9 under the starter / BS spec. Under the new policy bent paths may be ≤ 0.001 mm short: every
// category passes RB6 / RB9 / DB10 where the cover is really there, and still fails when it is 1 mm short. Legacy specs,
// quantities (cut length, weight, count) and the legacy engine version are unchanged.
import {describe,expect,it} from 'vitest';
import {applyElementInput,defaultElementInput,plainBeamRebar} from '../src/domain/elementInput';
import {blankMember,currentStarterSpec,specSchema,type Member,type Spec} from '../src/domain/model';
import {takeoff,validateMember} from '../src/domain/engine';
import {applyPartPresets,detailingFor} from '../src/domain/partRebar';
import {calculationEngine} from '../src/domain/version';
import {BEND_COVER_POLICY,withNewCoverPolicy} from '../src/domain/bendCover';
import {FLAT_END_COVER_POLICY} from '../src/domain/flatEndCover';
import {starterProfileSpec} from '../src/domain/specProfiles';
import {applyShapeModel} from '../src/domain/shapeApply';
import {defaultPartRebar} from '../src/domain/partRebar';
import type {PartPurpose,ShapePart} from '../src/domain/shapeModelSchema';

const legacy={...currentStarterSpec,rounding:25} as Spec,bend={...legacy,rebarCoverPolicy:BEND_COVER_POLICY} as Spec,bendAci={...bend,designCode:'ACI'} as Spec;
const tieLike=/stirrup|tie|hoop|link/;
const mk=(cat:'Beam'|'Column'|'Foundation',code:string,f:(i:any,d:number)=>void)=>(d:number,s:Spec)=>{const i=defaultElementInput(cat,'manual',s) as any;f(i,d);return applyElementInput({...blankMember(cat,code),id:code,version:1},i,{rounding:25}).member;};
const grid=(label:string)=>({label,support:400,supportY:0,extraTop:{count:0,diameter:16}});
// custom member: column 400 × 400 on a footing, beam 400 × 500 from the column (part presets: ties + stirrups)
const box=(id:string,x:number,y:number,z0:number,w:number,d:number,h:number):ShapePart=>({id,label:id,role:'solid',stage:1,z0,height:h,formSides:true,formBottom:false,source:'',shape:'box',x,y,w,d});
const purposes:Record<string,PartPurpose>={p1:'footing',p4:'column',p5:'beam'};
function custom(d:number,s:Spec):Member{
 const det=detailingFor(s),parts=[box('p1',0,0,0,4000,3000,600),box('p4',100,100,600,400,400,3000),box('p5',500,100,3100,3500,400,500)].map(p=>{const r:any=defaultPartRebar(purposes[p.id],p,det);if(r.tie)r.tie.d=d;if(r.stirrup)r.stirrup.d=d;return {...p,rebar:r};});
 return applyPartPresets(applyShapeModel({...blankMember('Custom','ASM'),cover:50,bars:[]},{version:1,parts,confirmed:true,note:''}),s).member;
}
const cases:[string,(d:number,s:Spec)=>Member][]=[
 ['single beam 250×500',mk('Beam','B',(i,d)=>{i.width=250;i.depth=500;i.rebar.stirrup.diameter=d;})],
 ['beam group 2 spans 300×600',mk('Beam','BG',(i,d)=>{i.layout='group';i.grids=[grid('1'),grid('2'),grid('3')];i.spans=[0,1].map(()=>({mark:'B1',kind:'span',length:6000,width:300,depth:600,top:0,rebar:plainBeamRebar(undefined,undefined,{diameter:d,spacing:200})}));})],
 ['column 600×600 + inner ties',mk('Column','C',(i,d)=>{i.width=600;i.depth=600;i.rebar.main.sideX.count=2;i.rebar.main.sideY.count=2;i.rebar.tie.diameter=d;i.rebar.tie.inner.diameter=d;})],
 ['footing + pedestal ties',mk('Foundation','F',(i,d)=>{i.column={...i.column,type:'pedestal',shape:'rect',columnNo:'C1',width:500,depth:500,height:700,tie:{diameter:d,spacing:200}};})],
 ['footing stirrup band',mk('Foundation','FS',(i,d)=>{i.rebar.stirrups={enabled:true,diameter:d,spacing:200,width:1000,dir:'x',replacesBottom:false};})],
 ['custom parts (column ties + beam stirrups)',custom],
];
/** cover errors of the tie / stirrup Marks of size d */
function tieCoverErrors(m:Member,s:Spec,d:number){
 const marks=new Set(m.bars.filter(b=>tieLike.test(b.id+' '+(b.role||''))&&b.diameter===d).map(b=>b.mark));
 expect(marks.size).toBeGreaterThan(0);
 return validateMember(m,s).filter(e=>e.includes('ระยะหุ้ม')&&marks.has(e.split(':')[0]));
}

describe('hook cover: rebar-bend-tolerance-1.0',()=>{
 for(const [name,make] of cases)it(name,()=>{
  for(const d of [6,9,10]){
   const lg=make(d,legacy),bn=make(d,bend),aci=make(d,bendAci);
   // the new policy: RB6 / RB9 / DB10 pass (starter and ACI)
   expect(tieCoverErrors(bn,bend,d),`RB/DB${d} bend`).toEqual([]);
   expect(tieCoverErrors(aci,bendAci,d),`RB/DB${d} bend ACI`).toEqual([]);
   expect(validateMember(bn,bend).filter(e=>e.includes('ระยะหุ้ม'))).toEqual([]);
   // cover really 1 mm short → still fails
   expect(tieCoverErrors({...bn,cover:bn.cover+1},bend,d).length,`RB/DB${d} short 1 mm`).toBeGreaterThan(0);
   // legacy check unchanged: Ø < 10 hooks still fail on the starter spec except the footing band (as before)
   if(d<10&&name!=='footing stirrup band')expect(tieCoverErrors(lg,legacy,d).length).toBeGreaterThan(0);
   // bars and quantities do not depend on the policy
   expect(JSON.stringify(bn.bars)).toBe(JSON.stringify(lg.bars));
   const q=(m:Member,s:Spec)=>takeoff(m,s).rows.map(r=>[r.mark,r.cutLength,r.count,r.weight]);
   expect(q(bn,bend)).toEqual(q(lg,legacy));
  }
 });
 it('engine version names the policy; legacy / flat-end ids unchanged; schema accepts both policies',()=>{
  expect(calculationEngine(bend)).toBe(`${calculationEngine(legacy)}+${BEND_COVER_POLICY}`);
  expect(calculationEngine(legacy)).not.toContain('rebar-');
  expect(calculationEngine({...legacy,rebarCoverPolicy:FLAT_END_COVER_POLICY})).toBe(`${calculationEngine(legacy)}+${FLAT_END_COVER_POLICY}`);
  expect(specSchema.parse(bend).rebarCoverPolicy).toBe(BEND_COVER_POLICY);
  expect(()=>specSchema.parse({...legacy,rebarCoverPolicy:'rebar-bend-tolerance-0.9'})).toThrow();
 });
 it('new projects / new General Spec profiles default to the policy; an explicit choice is kept',()=>{
  expect(starterProfileSpec().rebarCoverPolicy).toBe(BEND_COVER_POLICY);
  expect(withNewCoverPolicy(legacy).rebarCoverPolicy).toBe(BEND_COVER_POLICY);
  expect(withNewCoverPolicy({...legacy,rebarCoverPolicy:FLAT_END_COVER_POLICY}).rebarCoverPolicy).toBe(FLAT_END_COVER_POLICY);
  expect(currentStarterSpec.rebarCoverPolicy).toBeUndefined();
 });
});
