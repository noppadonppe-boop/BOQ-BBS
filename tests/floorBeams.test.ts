// Beams from the slab floor (round S3, docs/SLAB_FLOOR.md “Beams from the floor”): generator (lines, stations, supports,
// primary / secondary, > 12 spans, Beam Templates, update / edited / removed), quantities (beam + slab = hand total, no
// overlap), panel tags following the slab mark (task 0), backup round trip, and the command syncFloorBeams against an
// in-memory Firestore stand-in (as tests/drawingSave.test.ts): roles, idempotent request id, floor version, foreign members.
import {describe,expect,it,vi} from 'vitest';
const store=new Map<string,unknown>();
const user={current:{uid:'u1',email:'u1@test.local',isAnonymous:false}};
vi.mock('../src/data/firebase',()=>({storage:{},db:{},emulator:true,command:async()=>({}),auth:{get currentUser(){return user.current;},authStateReady:async()=>{}}}));
vi.mock('firebase/storage',()=>({getBlob:async()=>new Blob(),ref:()=>({})}));
vi.mock('firebase/firestore',()=>{
 type Ref={path:string;id:string};type Cons={k:string;f?:string;op?:string;v?:unknown;n?:number;d?:string};
 const clone=<T,>(v:T):T=>v===undefined?v:JSON.parse(JSON.stringify(v));
 const ref=(segs:string[]):Ref=>{const path=segs.join('/');return {path,id:path.split('/').at(-1)!};};
 const snap=(r:Ref)=>({id:r.id,ref:r,exists:()=>store.has(r.path),data:()=>clone(store.get(r.path))});
 const field=(o:unknown,f:string)=>f.split('.').reduce<unknown>((a,k)=>a&&typeof a==='object'?(a as Record<string,unknown>)[k]:undefined,o);
 return {
  doc:(_db:unknown,...segs:string[])=>ref(segs),collection:(_db:unknown,...segs:string[])=>ref(segs),
  query:(c:Ref,...cons:Cons[])=>({c,cons}),where:(f:string,op:string,v:unknown)=>({k:'where',f,op,v}),limit:(n:number)=>({k:'limit',n}),orderBy:(f:string,d='asc')=>({k:'order',f,d}),
  getDoc:async(r:Ref)=>snap(r),
  getDocs:async(q:{c:Ref;cons:Cons[]}|Ref)=>{const c='c' in q?q.c:q,cons='cons' in q?q.cons:[];
   let docs=[...store.keys()].filter(k=>k.startsWith(c.path+'/')&&!k.slice(c.path.length+1).includes('/')).map(k=>snap(ref([k])));
   for(const w of cons.filter(x=>x.k==='where'))docs=docs.filter(d=>w.op==='=='?field(d.data(),w.f!)===w.v:true);
   const l=cons.find(x=>x.k==='limit');if(l)docs=docs.slice(0,l.n);return {docs,empty:!docs.length,size:docs.length};},
  runTransaction:async(_db:unknown,fn:(tx:unknown)=>Promise<unknown>)=>{const writes:(()=>void)[]=[];
   const tx={get:async(r:Ref)=>snap(r),set:(r:Ref,v:unknown)=>{writes.push(()=>store.set(r.path,clone(v)));return tx;},update:(r:Ref,v:Record<string,unknown>)=>{writes.push(()=>store.set(r.path,{...(store.get(r.path) as object),...clone(v)}));return tx;}};
   const out=await fn(tx);writes.forEach(w=>w());return out;},
  Transaction:class{},serverTimestamp:()=>new Date().toISOString(),
 };
});
import {syncFloorBeams} from '../src/data/direct/floorBeams';
import {userDocPath} from '../src/domain/auth';
import {encodeStorage,decodeStorage} from '../src/domain/storageCodec';
import {blankMember,currentStarterSpec,memberSchema,type Member,type Project,type Role,type Spec} from '../src/domain/model';
import {applyElementInput,beamGroupLayout,defaultElementInput,plainBeamRebar,type ElementInput,type SlabInput} from '../src/domain/elementInput';
import {takeoff} from '../src/domain/engine';
import {autoBeams,autoPanels,floorPlanSummary,newSlabFloor,polyArea,type Floor} from '../src/domain/slabFloor';
import {beamGeometryHash,floorBeamGroups,planFloorBeams} from '../src/domain/floorBeams';
import {copyMemberInputs} from '../src/domain/memberCopy';
import {footingData} from './fixtures/sheets';

type BeamIn=Extract<ElementInput,{category:'Beam'}>;
const B1=plainBeamRebar({count:3,diameter:20},{count:3,diameter:20},{diameter:9,spacing:150});
const spec:Spec={...currentStarterSpec,designCode:'ACI',rounding:25,beamTemplates:[{id:'tB1',name:'B1',group:'',note:'',source:'',width:300,depth:600,sections:[{zone:'all',top:'3DB20',bottom:'3DB20',stirrup:'RB9@150'}],rebar:B1}]} as Spec;
/** 4 × 3 grid A–D / 1–3 (6,000 · 6,000 · 4,500 × 5,000 · 5,000), beams 300 × 600 (B1) on every grid line */
function floor(patch:(f:Floor)=>void=()=>{},cols=true):Floor{
 const f=newSlabFloor();f.gridsX=[0,6000,12000,16500].map((at,k)=>({label:String.fromCharCode(65+k),at}));f.gridsY=[0,5000,10000].map((at,k)=>({label:String(k+1),at}));
 f.beams=autoBeams(f,{mark:'B1',width:300,depth:600});
 if(cols)f.columns=f.gridsX.flatMap(x=>f.gridsY.map(y=>({id:`c${x.label}${y.label}`,x:x.label,y:y.label,sx:400,sy:400})));
 patch(f);f.panels=autoPanels(f,'S1');return f;
}
function floorMember(f:Floor,version=1):Member{
 const i={...defaultElementInput('Slab','manual',spec),layout:'floor',floor:f} as SlabInput;
 return {...applyElementInput({...blankMember('Slab','FL2'),id:'fl2',version,occurrences:[{id:'o1',zone:'A',floor:'2',grid:'',quantity:2}]},i,{rounding:25}).member,version};
}
const bin=(m:Member)=>m.elementInput as BeamIn;
const vol=(m:Member)=>takeoff(m,spec).concrete;
type Box={x0:number;x1:number;y0:number;y1:number};
const over=(a:Box,b:Box)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));

describe('beams from the slab floor: generator',()=>{
 it('4 × 3 floor + columns at every crossing → 7 beam groups A, B, C, D, 1, 2, 3; spans grid to grid, supports = column sizes',()=>{
  const fl=floorMember(floor()),{rows}=planFloorBeams(fl,[fl],spec);
  expect(rows.map(r=>[r.code,r.status])).toEqual(['A','B','C','D','1','2','3'].map(l=>[`FL2-B-${l}`,'new']));
  const a=bin(rows[0].member!),x1=bin(rows[4].member!);
  expect(a.spans.map(s=>s.length)).toEqual([5000,5000]);expect(a.grids.map(g=>[g.label,g.support])).toEqual([['1',400],['2',400],['3',400]]);
  expect(x1.spans.map(s=>s.length)).toEqual([6000,6000,4500]);expect(x1.grids.every(g=>g.support===400)).toBe(true);
  expect(x1.placement).toMatchObject({floorMember:'fl2',along:'X',line:'1',from:'A',to:'D',offset:0});expect(x1.floorSource).toMatchObject({kind:'slabFloor',floorMember:'fl2',floorCode:'FL2',floorVersion:1,part:1});
  expect(rows[0].member!.occurrences).toEqual(fl.occurrences);
 });
 it('beam + slab concrete = hand total; beams stop at the column faces, slab between the beam faces, no overlap',()=>{
  const fl=floorMember(floor()),{rows}=planFloorBeams(fl,[fl],spec),beams=rows.map(r=>r.member!);
  const w=.3,d=.6,handBeams=4*2*(5-.4)*w*d+3*((6-.4)+(6-.4)+(4.5-.4))*w*d;
  expect(beams.reduce((t,m)=>t+vol(m),0)).toBeCloseTo(handBeams,6);
  const f=(fl.elementInput as SlabInput).floor!,handSlab=f.panels.reduce((t,p)=>t+polyArea(p.outline as [number,number][])*.15,0)/1e6;
  expect(vol(fl)).toBeCloseTo(handSlab,6);expect(vol(fl)+beams.reduce((t,m)=>t+vol(m),0)).toBeCloseTo(handSlab+handBeams,6);
  // placed span boxes (floor mm): no overlap between beams, nor with the panels
  const boxes=beams.flatMap(m=>{const i=bin(m),p=i.placement!,lay=beamGroupLayout(i),runs=p.along==='X'?f.gridsX:f.gridsY,lines=p.along==='X'?f.gridsY:f.gridsX;
   const start=runs.find(g=>g.label===p.from)!.at-lay.grid[0],c=lines.find(g=>g.label===p.line)!.at+p.offset;
   return lay.spans.map(s=>{const u0=start+s.a,u1=start+s.b,v0=c-s.width/2,v1=c+s.width/2;return p.along==='X'?{x0:u0,x1:u1,y0:v0,y1:v1}:{x0:v0,x1:v1,y0:u0,y1:u1};});});
  expect(boxes).toHaveLength(4*2+3*3);
  for(const [i,a] of boxes.entries())for(const b of boxes.slice(i+1))expect(over(a,b)).toBeLessThan(1);
  for(const a of boxes)for(const p of f.panels){const xs=p.outline.map(q=>q[0]),ys=p.outline.map(q=>q[1]);expect(over(a,{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)})).toBeLessThan(1);}
 });
 it('without columns the secondary beam stops at the primary beam face (support = its width); swapping the ranks swaps the result',()=>{
  const fl=floorMember(floor(()=>{},false)),g=floorBeamGroups(fl,spec).groups,X1=g.find(x=>x.code==='FL2-B-1')!.input,YA=g.find(x=>x.code==='FL2-B-A')!.input;
  // equal depth → along X is primary: one run A–D through the crossings, ends past the end beams' faces
  expect(X1.spans.map(s=>s.length)).toEqual([16500]);expect(X1.placement!.ends).toEqual([150,150]);
  expect(YA.grids.map(x=>x.support)).toEqual([300,300,300]);expect(beamGroupLayout(YA).spans.map(s=>s.clear)).toEqual([4700,4700]);
  const sw=floorMember(floor(f=>{f.beams=f.beams.map(b=>({...b,rank:b.along==='Y'?'primary' as const:'secondary' as const}));},false)),h=floorBeamGroups(sw,spec).groups;
  const X1b=h.find(x=>x.code==='FL2-B-1')!.input,YAb=h.find(x=>x.code==='FL2-B-A')!.input;
  expect(YAb.spans.map(s=>s.length)).toEqual([10000]);expect(X1b.grids.map(x=>x.support)).toEqual([300,300,300,300]);
  // the deeper beam is primary by default
  const deep=floorBeamGroups(floorMember(floor(f=>{f.beams=f.beams.map(b=>b.along==='Y'?{...b,depth:800}:b);},false)),spec).groups;
  expect(deep.find(x=>x.code==='FL2-B-A')!.input.spans).toHaveLength(1);
  // no double count at the crossings: total = hand total
  const all=planFloorBeams(fl,[fl],spec).rows.reduce((t,r)=>t+vol(r.member!),0);expect(all).toBeCloseTo(3*16.8*.3*.6+4*2*4.7*.3*.6,6);
 });
 it('a line of 14 spans becomes 2 groups (≤ 12 spans each)',()=>{
  const f=newSlabFloor();f.gridsX=Array.from({length:15},(_,k)=>({label:`X${k+1}`,at:k*4000}));f.gridsY=[{label:'1',at:0},{label:'2',at:5000}];
  f.beams=[{id:'b1',mark:'B1',along:'X',line:'1',from:'X1',to:'X15',width:300,depth:600}];f.columns=f.gridsX.map(x=>({id:`c${x.label}`,x:x.label,y:'1',sx:400,sy:400}));
  const fl=floorMember(f),g=floorBeamGroups(fl,spec).groups;
  expect(g.map(x=>[x.code,x.spans])).toEqual([['FL2-B-1-1',7],['FL2-B-1-2',7]]);expect(g[0].input.placement!.to).toBe(g[1].input.placement!.from);
 });
 it('Beam Template by mark: bars + template id (size from the plan); no template → group defaults + warning',()=>{
  const fl=floorMember(floor(f=>{f.beams=f.beams.map(b=>b.along==='Y'?{...b,mark:'B2',width:250,depth:500}:b);})),{groups,warnings}=floorBeamGroups(fl,spec);
  const x=groups.find(g=>g.code==='FL2-B-1')!.input,y=groups.find(g=>g.code==='FL2-B-A')!.input;
  expect(x.spans.every(s=>s.template==='tB1'&&JSON.stringify(s.rebar)===JSON.stringify(B1))).toBe(true);
  expect(y.spans.every(s=>!s.template&&s.width===250&&JSON.stringify(s.rebar)===JSON.stringify(plainBeamRebar()))).toBe(true);
  expect(warnings).toContain('คาน B2 ยังไม่มี Template (ใช้เหล็กค่าเริ่มต้นของกลุ่มคาน)');
 });
 it('update: unchanged plan = nothing to write; grid spacing changed → lengths follow, bars by mark kept; hand edit detected; removed lines kept',()=>{
  const fl=floorMember(floor()),made=planFloorBeams(fl,[fl],spec).rows.map(r=>({...r.member!,version:1}));
  expect(planFloorBeams(fl,[fl,...made],spec).rows.every(r=>r.status==='same'&&!r.member)).toBe(true);
  // own bars on FL2-B-1 (4 top bars) survive the update
  const x1=made.find(m=>m.code==='FL2-B-1')!;bin(x1).spans.forEach(s=>{s.rebar.top.count=4;});
  const fl2=floorMember(floor(f=>{f.gridsX=f.gridsX.map(g=>g.label==='D'?{...g,at:17000}:g);}),2);
  const up=planFloorBeams(fl2,[fl2,...made],spec).rows,r1=up.find(r=>r.code==='FL2-B-1')!;
  expect(r1.status).toBe('update');expect(bin(r1.member!).spans.map(s=>s.length)).toEqual([6000,6000,5000]);expect(bin(r1.member!).spans.every(s=>s.rebar.top.count===4)).toBe(true);
  expect(r1.member!.id).toBe(x1.id);expect(bin(r1.member!).floorSource!.floorVersion).toBe(2);
  expect(up.find(r=>r.code==='FL2-B-A')!.status).toBe('same');
  // hand edit of the geometry → edited (written only with overwrite)
  const edited=made.map(m=>m.code==='FL2-B-2'?{...m,elementInput:{...bin(m),spans:bin(m).spans.map(s=>({...s,width:350}))}}:m);
  const e=planFloorBeams(fl2,[fl2,...edited],spec).rows.find(r=>r.code==='FL2-B-2')!;expect(e.status).toBe('edited');expect(e.member).toBeUndefined();
  expect(planFloorBeams(fl2,[fl2,...edited],spec,{overwrite:[e.existing!.id]}).rows.find(r=>r.code==='FL2-B-2')!.member).toBeDefined();
  // a line taken out of the plan: marked, never deleted here
  const fl3=floorMember(floor(f=>{f.beams=f.beams.filter(b=>!(b.along==='Y'&&b.line==='B'));}),3),rm=planFloorBeams(fl3,[fl3,...made],spec).rows.find(r=>r.code==='FL2-B-B')!;
  expect(rm.status).toBe('removed');expect(rm.member).toBeUndefined();expect(rm.existing!.id).toBe(made.find(m=>m.code==='FL2-B-B')!.id);
  // the geometry hash ignores bars
  expect(beamGeometryHash(bin(x1))).toBe(bin(x1).floorSource!.generatedHash);
 });
 it('beam groups made by hand (no placement / floorSource) keep their layout and quantities',()=>{
  const grid=(label:string,support:number)=>({label,support,supportY:0,extraTop:{count:0,diameter:16}});
  const i={...defaultElementInput('Beam','manual',spec),layout:'group',grids:[grid('1',400),grid('2',0)],spans:[{mark:'B1',kind:'span',length:6000,width:300,depth:600,top:0,rebar:B1}]} as BeamIn;
  const lay=beamGroupLayout(i);expect([lay.spans[0].a,lay.spans[0].b,lay.L]).toEqual([400,6200,6200]);
  const m=applyElementInput({...blankMember('Beam','BG1'),occurrences:[{id:'o',zone:'',floor:'',grid:'',quantity:1}]},i,{rounding:25}).member;expect(vol(m)).toBeCloseTo(5.8*.3*.6,6);
 });
 it('task 0: panels re-marked S1 → S2 get S2-nn tags; typed tags stay; bar notes follow',()=>{
  const f=floor();f.marks.push({...f.marks[0],name:'S2'});
  f.panels=f.panels.map((p,k)=>k===3?{...p,mark:'S2'}:k===5?{...p,mark:'S2',tag:'TANK-A',tagCustom:true}:p);
  const m=floorMember(f),panels=(m.elementInput as SlabInput).floor!.panels;
  expect(panels[3].tag).toBe('S2-01');expect(panels[5].tag).toBe('TANK-A');expect(panels[0].tag).toBe('S1-01');
  expect(m.bars.some(b=>b.note.includes('S2-01'))).toBe(true);expect(m.bars.some(b=>b.note.includes('S1-04'))).toBe(false);
 });
 it('3D summary of a floor member: overall plan over the panels + beam faces, panel count, marks and thicknesses (not the single-slab fields)',()=>{
  const f=floor(x=>{x.marks.push({...x.marks[0],name:'S2',thickness:120});});f.panels=f.panels.map((p,k)=>k>3?{...p,mark:'S2'}:p);
  expect(floorPlanSummary(f)).toEqual({w:16800,h:10300,panels:6,marks:['S1','S2'],thicknesses:[150,120]});
 });
 it('backup / restore keeps placement + floorSource (ids kept); a member copy drops the floor link',()=>{
  const fl=floorMember(floor()),beam={...planFloorBeams(fl,[fl],spec).rows[0].member!,version:1};
  const back=memberSchema.parse(decodeStorage(JSON.parse(JSON.stringify(encodeStorage(beam)))));
  expect(bin(back).placement).toEqual(bin(beam).placement);expect(bin(back).floorSource).toEqual(bin(beam).floorSource);expect(bin(back).floorSource!.floorMember).toBe(fl.id);
  const copy=copyMemberInputs(beam,{memberId:'c1',code:'BX',occurrences:[{id:'o',zone:'',floor:'',grid:'',quantity:1}]} as never);
  expect(bin(copy).floorSource).toBeUndefined();expect(bin(copy).placement).toEqual(bin(beam).placement);
 });
});

describe('beams from the slab floor: command syncFloorBeams',()=>{
 const PID='p1',project=footingData(2400,2400).project;
 function seed(role:Role){
  store.clear();user.current={uid:'u1',email:'u1@test.local',isAnonymous:false};
  store.set(userDocPath('u1@test.local'),{uid:'u1',email:'u1@test.local',firstName:'T',lastName:'U',status:'approved',roles:['Staff'],assignedProjects:[PID],projectRoles:{[PID]:[role]},profileVersion:1});
  store.set(`projects/${PID}`,encodeStorage({...project,spec,id:PID,version:7,acl:{u1:role}} as Project));
  const fl=floorMember(floor());store.set(`projects/${PID}/members/${fl.id}`,encodeStorage(fl));return fl;
 }
 const plan=(fl:Member,members:Member[]=[fl])=>planFloorBeams(fl,members,spec).rows.filter(r=>r.member).map(r=>({...r.member!,version:r.existing?.version||0}));
 const doc=(id:string)=>decodeStorage(store.get(`projects/${PID}/members/${id}`)) as Member;
 const writes=()=>JSON.stringify([...store.entries()].filter(([k])=>!k.includes('/operations/')));
 it('writes the planned members (Draft, version 1); the same request id replays without writing; re-plan = nothing to write',async()=>{
  const fl=seed('qs'),ms=plan(fl),rid=crypto.randomUUID(),data={floorId:fl.id,floorVersion:1,members:ms};
  const r=await syncFloorBeams(PID,data,rid);expect(r.members).toHaveLength(7);expect(r.members.every((x:{created:boolean})=>x.created)).toBe(true);
  const m=doc(ms[0].id);expect(m.status).toBe('Draft');expect(m.version).toBe(1);expect(bin(m).floorSource!.floorMember).toBe(fl.id);
  const before=writes();expect(await syncFloorBeams(PID,data,rid)).toEqual(r);expect(writes()).toBe(before);
  const stored=[fl,...ms.map(x=>doc(x.id))];expect(planFloorBeams(fl,stored,spec).rows.every(x=>x.status==='same')).toBe(true);
 });
 it('refuses: viewer role, a changed floor version, overwriting a member of no floor, more than 25 members',async()=>{
  let fl=seed('viewer');await expect(syncFloorBeams(PID,{floorId:fl.id,floorVersion:1,members:plan(fl)},crypto.randomUUID())).rejects.toMatchObject({code:'permission-denied'});
  fl=seed('admin');await expect(syncFloorBeams(PID,{floorId:fl.id,floorVersion:2,members:plan(fl)},crypto.randomUUID())).rejects.toMatchObject({code:'aborted'});
  store.set(`projects/${PID}/members/other`,encodeStorage({...blankMember('Beam','OTHER'),id:'other',version:1}));
  const hijack={...plan(fl)[0],id:'other',version:1};await expect(syncFloorBeams(PID,{floorId:fl.id,floorVersion:1,members:[hijack]},crypto.randomUUID())).rejects.toMatchObject({code:'failed-precondition'});
  await expect(syncFloorBeams(PID,{floorId:fl.id,floorVersion:1,members:Array.from({length:26},()=>plan(fl)[0])},crypto.randomUUID())).rejects.toMatchObject({code:'invalid-argument'});
 });
});
