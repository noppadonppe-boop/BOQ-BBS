// Wall Run (docs/WALL_RUN.md): one Wall member = wall axis on plan (straight / L / U / box / T) over levels and pour lifts,
// 4 wall types (tank / lift / general / retaining). Checks: old straight walls unchanged + conversion, box concrete counted
// once at the corners, corner / T methods, lift core 5 storeys × 2 lifts with a repeated door and a pit, water tank with
// bottom / cover / manhole / sleeve, retaining wall with key + curtailment, thickness steps (crank / new dowels), RB9–DB12
// under the bend-tolerance cover policy, element templates / backup of `run`.
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {blankMember,currentStarterSpec,memberSchema,type Member,type Project,type Spec} from '../src/domain/model';
import {applyElementInput,bendRadius,defaultElementInput,elementInputProblems,elementInputSchema,lapLength,type WallInput} from '../src/domain/elementInput';
import {schedule,takeoff,validateMember} from '../src/domain/engine';
import {axisLength,defaultWallRun,runAxis,runLevels,singleToRun,wallJoints,wallRunLiftQuantities,wallRunProblems,wallRunRaw,wallRunSets} from '../src/domain/wallRun';
import type {WallRun,WallType} from '../src/domain/wallRunSchema';
import {BEND_COVER_POLICY} from '../src/domain/bendCover';
import {memberFromTemplate,templateKey,templatePayload} from '../src/domain/elementTemplates';
import {devLength} from '../src/domain/slabFloor';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {wallBbsItems,wallBbsSummary,wallPagesOf,wallPlanOf,wallSheetLabelViews,type WallRow} from '../src/domain/wallRunSheet';
import {labelIssues} from '../src/domain/labelQa';
import {drawSheetInfo,layoutPage,sheetPageCount,sheetViews,type SheetData} from '../src/domain/bbsSheet';
import {resolveSheetLayout,templateFrom,templateLayout} from '../src/domain/sheetLayout';
import {sheetLayoutSchema,type SheetLayout} from '../src/domain/sheetLayoutSchema';
import {buildBbsDxf} from '../src/data/dxf';
import {defaultCadStandard} from '../src/domain/cadStandard';

const spec:Spec={...currentStarterSpec,designCode:'ACI',rounding:25,rebarCoverPolicy:BEND_COVER_POLICY} as Spec;
const wall=()=>defaultElementInput('Wall','manual',spec) as WallInput;
const runInput=(run:WallRun,patch:Partial<WallInput>={})=>({...wall(),layout:'run',run,...patch} as WallInput);
const apply=(i:WallInput,code='W1')=>applyElementInput({...blankMember('Wall',code),version:1},i,{rounding:25});
const ok=(m:Member)=>expect(validateMember(m,spec)).toEqual([]);
const mesh=(d:number,s:number)=>({diameter:d,spacing:s});
const seg=(id:string,length:number,thickness:number,turn:number)=>({id,length,thickness,turn});
const box=(a:number,b:number,t:number):WallRun['path']=>({closed:true,segments:[seg('A',a,t,90),seg('B',b,t,90),seg('C',a,t,90),seg('D',b,t,90)]});
const len=(p:number[][])=>p.slice(1).reduce((n,q,k)=>n+Math.hypot(q[0]-p[k][0],q[1]-p[k][1],q[2]-p[k][2]),0);
const kg=(m:Member)=>takeoff(m,spec).rebar;

describe('schema / old straight wall',()=>{
 it('old wall input parses unchanged (no layout / run) and gives the same quantities',()=>{
  const i=wall(),p=elementInputSchema.parse(i) as WallInput;expect(p.layout).toBeUndefined();expect(p.run).toBeUndefined();
  const q=takeoff(apply(i).member,spec);expect(q.concrete).toBeCloseTo(3.6,9);expect(q.formwork).toBeCloseTo(37.2,9);
 });
 it('single → run (1 segment): same concrete, formwork and steel (plain wall, lapped, with an opening + trims)',()=>{
  const plain={...wall(),rebar:{...wall().rebar,lap:false}} as WallInput;
  const opening={...wall(),openings:[{label:'D1',x:1500,z:0,width:1000,height:2100}],rebar:{...wall().rebar,opening:{count:2,diameter:12,ext:0,diagonal:true}}} as WallInput;
  for(const s of [wall(),plain,opening]){const a=apply(s).member,{run}=singleToRun(s),b=apply(runInput(run,{cover:s.cover})).member,qa=takeoff(a,spec),qb=takeoff(b,spec);
   expect(qb.concrete).toBeCloseTo(qa.concrete,6);expect(qb.formwork).toBeCloseTo(qa.formwork,6);expect(qb.rebar).toBeCloseTo(qa.rebar,1);ok(b);}
 });
 it('problems: open closed path, lift too high, opening over a corner / outside, tank must be closed',()=>{
  const r=defaultWallRun('general');
  expect(wallRunProblems(runInput({...r,path:{closed:true,segments:[seg('A',3000,200,90),seg('B',3000,200,90),seg('C',3000,200,90),seg('D',2000,200,90)]}})).join()).toMatch(/ไม่ปิด/);
  expect(wallRunProblems(runInput({...r,levels:[{id:'L1',name:'1F',bottom:0,top:5,lifts:1}]})).join()).toMatch(/ช่วงเทสูง/);
  const lift=defaultWallRun('lift');lift.openings[0]={...lift.openings[0],x:50};
  expect(wallRunProblems(runInput(lift)).join()).toMatch(/ทับมุม/);
  expect(wallRunProblems(runInput({...defaultWallRun('tank'),path:{closed:false,segments:[seg('A',4000,250,0)]}})).join()).toMatch(/ต้องปิด/);
  expect(elementInputProblems(runInput(defaultWallRun('general')))).toEqual([]);
 });
});

describe('geometry and corners',()=>{
 it('box 2,600 × 2,400 t 250 H 3 m: concrete counted once at the corners, U bars at 4 corners on both faces, horizontals ≤ 12 m',()=>{
  const run={...defaultWallRun('general'),path:box(2600,2400,250),top:{kind:'straight' as const},base:{kind:'dowel-footing' as const,embed:'ldh' as const,kicker:0}};
  const m=apply(runInput(run)).member,q=takeoff(m,spec);
  // by hand: (2,850 × 2,650 − 2,350 × 2,150) × 3,000 = axis 10,000 × 250 × 3,000 = 7.5 m³
  expect(q.concrete).toBeCloseTo(7.5,6);
  // formwork: outer 2 × (2,850 + 2,650) + inner 2 × (2,350 + 2,150) = 20,000 × 3,000
  expect(q.formwork).toBeCloseTo(60,6);
  const ri=runInput(run),raw=wallRunRaw(ri,ri.detailing),us=raw.filter(r=>/U-bar มุม/.test(r.what));
  expect([...new Set(us.map(r=>r.what.match(/มุม (\w+–\w+)/)![1]))].sort()).toEqual(['A–B','B–C','C–D','D–A']);
  for(const r of us){expect(r.pts).toHaveLength(4);expect(Math.hypot(r.pts[0][0]-r.pts[3][0],r.pts[0][1]-r.pts[3][1])).toBeGreaterThan(100);}
  // every corner U-bar is one Mark (same shape, turned per corner), shape 21
  const uSets=m.bars.filter(b=>/U-bar มุม/.test(b.note));expect(uSets).toHaveLength(1);expect(uSets[0].shapeCode).toBe('21');expect(uSets[0].count).toBe(us.length);
  for(const r of schedule(m,spec).filter(r=>/^W1-H/.test(r.mark)))expect(r.cutLength).toBeLessThanOrEqual(12000);
  ok(m);
  // big box with bars round the corners (lap-l): pieces ≤ stock length, laps between
  const big=apply(runInput({...run,path:box(9000,7000,250),rebar:{...run.rebar,corner:'lap-l'}})).member;
  for(const r of schedule(big,spec).filter(r=>/^W1-H/.test(r.mark)))expect(r.cutLength).toBeLessThanOrEqual(12000);
  expect(big.bars.some(b=>/^W1-H/.test(b.mark)&&/ต่อทาบ/.test(b.note))).toBe(true);ok(big);
 });
 it('L corner: ubar / lap-l / hook90; T junction: l-anchor / ubar',()=>{
  const L=(corner:'ubar'|'lap-l'|'hook90')=>apply(runInput({...defaultWallRun('general'),path:{closed:false,segments:[seg('A',4000,200,90),seg('B',3000,200,0)]},rebar:{...defaultWallRun('general').rebar,corner}})).member;
  const ub=L('ubar'),lp=L('lap-l'),hk=L('hook90');
  expect(ub.bars.some(b=>/U-bar มุม A–B/.test(b.note)&&b.shapeCode==='21')).toBe(true);
  expect(lp.bars.some(b=>/U-bar มุม/.test(b.note))).toBe(false);
  // lap-l: horizontal bars bent round the corner (one bend, legs along A and B)
  expect(lp.bars.some(b=>/^W1-H/.test(b.mark)&&b.points.length===3&&b.shapeCode==='11'&&len(b.points)>4000)).toBe(true);
  // hook90: each wall's bars end with a 90° leg of hook90·d + r into the other wall
  const leg=(b:Member['bars'][number])=>Math.hypot(b.points[2][0]-b.points[1][0],b.points[2][1]-b.points[1][1]);
  const det=wall().detailing;expect(hk.bars.some(b=>/^W1-H/.test(b.mark)&&b.shapeCode==='11'&&Math.abs(leg(b)-(det.hook90*12+bendRadius(12,det)))<1)).toBe(true);
  [ub,lp,hk].forEach(ok);
  const T=(tee:'l-anchor'|'ubar')=>apply(runInput({...defaultWallRun('general'),path:{closed:false,segments:[seg('A',6000,250,0)]},branches:[{id:'T1',fromSegment:'A',at:3000,side:'L',length:2500,thickness:200}],rebar:{...defaultWallRun('general').rebar,tee}})).member;
  const ta=T('l-anchor'),tu=T('ubar');
  expect(ta.bars.some(b=>/^W1-H/.test(b.mark)&&/ผนัง T T1/.test(b.note)&&b.shapeCode==='11')).toBe(true);
  expect(tu.bars.some(b=>/^W1-T/.test(b.mark)&&/จุดต่อ T/.test(b.note))).toBe(true);
  // T concrete: main 6,000 × 250 + branch from the main face 2,375 × 200, × 3 m
  expect(takeoff(ta,spec).concrete).toBeCloseTo((6000*250+(2500-125)*200)*3000/1e9,6);
  [ta,tu].forEach(ok);
 });
});

describe('lift core: 5 storeys × 2 lifts, door repeated, pit',()=>{
 const run:WallRun={...defaultWallRun('lift'),levels:[1,2,3,4,5].map((n,k)=>({id:`L${n}`,name:`${n}F`,bottom:k*3.2,top:(k+1)*3.2,lifts:2}))};
 const i=runInput(run),m=apply(i).member,lv=runLevels(run),raw=wallRunRaw(i,i.detailing);
 it('valid, 10 wall lifts + pit, laps at every lift joint',()=>{
  ok(m);expect(lv.lifts.map(l=>l.id)).toEqual(['PIT','L1-1','L1-2','L2-1','L2-2','L3-1','L3-2','L4-1','L4-2','L5-1','L5-2']);
  const lap=lapLength(i.detailing,12);
  for(const L of lv.lifts.slice(0,-1)){const top=Math.max(...raw.filter(r=>r.kind==='V'&&r.lift===L.id).map(r=>Math.max(...r.pts.map(p=>p[2]))));expect(top).toBeCloseTo(L.z1+lap,3);}
 });
 it('door: one Mark set per bar type × 4 storeys; BBS by lift adds up to the member',()=>{
  const op=wallRunSets(m).filter(s=>s.kind==='OP');expect(op.length).toBeGreaterThan(0);
  for(const s of op){const bar=m.bars.find(b=>b.id===s.id)!;expect(bar.count%4).toBe(0);expect(new Set([...s.lifts.keys()].map(l=>l.split('-')[0])).size).toBe(4);}
  const rows=schedule(m,spec),q=takeoff(m,spec),lifts=wallRunLiftQuantities(m,rows);
  expect(lifts.reduce((n,l)=>n+l.kg,0)).toBeCloseTo(q.rebar,6);
  expect(lifts.reduce((n,l)=>n+l.concrete,0)).toBeCloseTo(q.concrete,6);
  expect(lifts.reduce((n,l)=>n+l.formwork,0)).toBeCloseTo(q.formwork,6);
  expect(lifts.map(l=>l.id)).toEqual(['BASE',...lv.lifts.map(l=>l.id)]);
  // pit: walls down to the pit slab + pit slab (2,850 × 2,650 × 300)
  expect(m.shapeModel!.parts.some(p=>p.id==='pit-slab')).toBe(true);
 });
});

describe('water tank: bottom + cover + manhole + sleeve',()=>{
 const run:WallRun={...defaultWallRun('tank'),tank:{...defaultWallRun('tank').tank!,sleeves:[{segment:'B',x:1500,z:600,dia:150}]}};
 const m=apply(runInput(run)).member,q=takeoff(m,spec);
 it('concrete by hand, waterstop, sleeve item',()=>{
  // bottom 4,850 × 3,850 × 300 + walls 14,000 × 250 × 2,500 + cover (4,250 × 3,250 − 600 × 600) × 200 + haunch band 1,860,000 × 75
  expect(q.concrete).toBeCloseTo((4850*3850*300+14000*250*2500+(4250*3250-600*600)*200+(3750*2750-3450*2450)*75)/1e9,6);
  expect(wallJoints(run).count).toBe(2);expect(axisLength(run)).toBeCloseTo(14,9);
  expect(m.siteWork?.items.find(x=>x.id==='gen-wall-waterstop')?.quantity).toBeCloseTo(28,6);
  expect(m.siteWork?.items.find(x=>x.id==='gen-wall-kicker')?.quantity).toBeCloseTo(14,6);
  expect(m.siteWork?.items.find(x=>x.id==='gen-wall-sleeve-150')?.quantity).toBe(1);
  expect(m.bars.some(b=>/ปลอกท่อ Ø150/.test(b.note))).toBe(true);
 });
 it('L bars wall–bottom slab (both faces) and wall–cover (verticals bent into the cover), all valid',()=>{
  const S=m.bars.filter(b=>/เหล็ก L ผนัง–พื้นบ่อ/.test(b.note)),K=m.bars.filter(b=>/^W1-V/.test(b.mark)&&/งอเข้าฝาบ่อ/.test(b.note));
  expect(S.length).toBeGreaterThan(0);expect(S.every(b=>b.shapeCode==='11')).toBe(true);expect(new Set(S.flatMap(b=>b.note.includes('ผิวนอก')?['out']:[]).concat(S.flatMap(b=>b.note.includes('ผิวใน')?['in']:[]))).size).toBe(2);
  expect(K.length).toBeGreaterThan(0);expect(K.every(b=>b.shapeCode==='11')).toBe(true);
  expect(m.bars.some(b=>/^W1-K/.test(b.mark)&&/ฝาบ่อ/.test(b.note))).toBe(true);
  expect(m.bars.some(b=>/^W1-B/.test(b.mark)&&/Haunch/.test(b.note))).toBe(true);
  ok(m);
 });
});

describe('retaining wall: stem + toe + heel + key',()=>{
 const run:WallRun={...defaultWallRun('retaining'),retaining:{...defaultWallRun('retaining').retaining!,key:{width:400,depth:400}}};
 const i=runInput(run),m=apply(i).member,q=takeoff(m,spec);
 it('concrete by hand, main bars on the soil face, curtailment, stem anchored in the base',()=>{
  // base 2,700 × 10,000 × 400 + stem 300 × 10,000 × 3,500 + key 400 × 400 × 10,000
  expect(q.concrete).toBeCloseTo(22.9,6);
  const raw=wallRunRaw(i,i.detailing),soil=raw.filter(r=>r.kind==='V'&&r.face==='in'),other=raw.filter(r=>r.kind==='V'&&r.face==='out');
  expect(soil.every(r=>r.d===16)).toBe(true);expect(other.every(r=>r.d===12)).toBe(true);
  // soil side = heel side: soil-face bars lie on the side the heel projects to (+Y for soil 'in' on a path along +X)
  expect(soil[0].pts[0][1]).toBeGreaterThan(0);expect(other[0].pts[0][1]).toBeLessThan(0);
  const heel=m.shapeModel!.parts.find(p=>p.id==='base-A')!;expect(heel.shape).toBe('polygon');
  // curtailment at 0.5 × 3,500 + Ld above the stem base (z = 400): every second soil bar stops there
  const stop=400+.5*3500+devLength(i.detailing,16),tops=soil.map(r=>Math.max(...r.pts.map(p=>p[2])));
  expect(tops.filter(z=>Math.abs(z-stop)<1).length).toBe(Math.floor(soil.length/2));
  const anchors=m.bars.filter(b=>/^W1-S/.test(b.mark)&&/stem เข้าฐาน/.test(b.note));
  // member z: key 400 below the base → stem base at 800 after normalising
  expect(anchors.length).toBe(2);expect(anchors.every(b=>b.shapeCode==='11'&&Math.min(...b.points.map(p=>p[2]))<800)).toBe(true);
  expect(m.siteWork?.items.find(x=>x.id==='gen-wall-weep')?.quantity).toBe(5);
  ok(m);
 });
});

describe('thickness steps between levels',()=>{
 const two=(t2:number)=>runInput({...defaultWallRun('general'),path:{closed:false,segments:[seg('A',5000,300,0)]},top:{kind:'straight'},
  levels:[{id:'L1',name:'1F',bottom:0,top:3,lifts:1},{id:'L2',name:'2F',bottom:3,top:6,lifts:1,thickness:t2}]});
 it('50 mm thinner above → cranked bars 1:6; 150 mm → bars stop under the joint + new dowels',()=>{
  const a=apply(two(250)).member,b=apply(two(150)).member;
  const cr=a.bars.filter(x=>/คอม้า/.test(x.note));expect(cr.length).toBeGreaterThan(0);expect(cr.every(x=>x.shapeCode==='26')).toBe(true);
  const ia=two(250);for(const x of wallRunRaw(ia,ia.detailing).filter(r=>/คอม้า/.test(r.what))){const p=x.pts,dz=p[2][2]-p[1][2],doff=Math.hypot(p[2][0]-p[1][0],p[2][1]-p[1][1]);expect(dz/doff).toBeCloseTo(6,6);expect(doff).toBeCloseTo(25,6);}
  expect(b.bars.some(x=>/^W1-S/.test(x.mark)&&/เดือยใหม่/.test(x.note))).toBe(true);
  const ib=two(150);expect(wallRunRaw(ib,ib.detailing).some(x=>/หยุดใต้รอยต่อ/.test(x.what))).toBe(true);
  expect(b.bars.some(x=>/คอม้า/.test(x.note))).toBe(false);
  ok(a);ok(b);
 });
});

describe('cover policy rebar-bend-tolerance-1.0: RB9 / DB10 / DB12 in every case',()=>{
 const sized=(r:WallRun,d:number):WallRun=>({...r,rebar:{...r.rebar,outer:{vertical:mesh(d,200),horizontal:mesh(d,200)},inner:{vertical:mesh(d,200),horizontal:mesh(d,200)},edgeBar:{count:4,diameter:d},
  ...(r.rebar.boundary?{boundary:{...r.rebar.boundary,ties:mesh(9,150),bars:{count:6,diameter:d}}}:{})}});
 const cases:[string,WallRun][]=[
  ['general ucap-edge',defaultWallRun('general')],
  ['general boundary',{...defaultWallRun('general'),rebar:{...defaultWallRun('general').rebar,freeEnd:'boundary',boundary:{length:600,ties:mesh(9,150),bars:{count:6,diameter:12}}}}],
  ['box ubar',{...defaultWallRun('general'),path:box(2600,2400,250)}],
  ['L hook90',{...defaultWallRun('general'),path:{closed:false,segments:[seg('A',4000,200,90),seg('B',3000,200,0)]},rebar:{...defaultWallRun('general').rebar,corner:'hook90'}}],
  ['T ubar',{...defaultWallRun('general'),branches:[{id:'T1',fromSegment:'A',at:3000,side:'R',length:2000,thickness:200}],rebar:{...defaultWallRun('general').rebar,tee:'ubar'}}],
  ['tank',defaultWallRun('tank')],['lift',defaultWallRun('lift')],['retaining',defaultWallRun('retaining')]];
 for(const [name,r] of cases)for(const d of [9,10,12])it(`${name} · Ø${d}`,()=>{const m=apply(runInput(sized(r,d))).member;ok(m);expect(kg(m)).toBeGreaterThan(0);});
});

describe('templates and backup',()=>{
 it('template key per wall type; a Wall Run template creates the same member; backup JSON keeps run',()=>{
  for(const t of ['tank','lift','general','retaining'] as WallType[])expect(templateKey('Wall',runInput(defaultWallRun(t)))).toBe(`Wall:${t}`);
  expect(templateKey('Wall',wall())).toBe('Wall');
  const i=runInput(defaultWallRun('tank')),m=apply(i).member,payload=templatePayload(m,{spec});
  expect(payload.siteItems.some(x=>/^gen-wall-/.test(x.id))).toBe(false);
  const project={id:'p',code:'P1',spec,version:1} as unknown as Project;
  const n=memberFromTemplate({id:'t1',name:'Tank',description:'',category:'Wall',scope:'project',version:1,payload,createdAt:'',updatedAt:'',createdBy:'',updatedBy:''} as never,'W9',project);
  expect((n.elementInput as WallInput).run?.wallType).toBe('tank');
  expect(takeoff(n,spec).concrete).toBeCloseTo(takeoff(m,spec).concrete,9);
  expect(n.siteWork?.items.filter(x=>x.id==='gen-wall-waterstop')).toHaveLength(1);
  const back=memberSchema.parse(JSON.parse(JSON.stringify(m)));expect((back.elementInput as WallInput).run).toEqual(i.run);
 });
});

describe('Wall Run sheet (W1.1): merged Marks, labels in the views, ≥ 1:75 by storey groups, Sheet Composer, DXF',()=>{
 const project={id:'p',code:'J-099',name:'Wall Run test',spec,version:1,titleBlock:{}} as unknown as Project;
 const liftRun:WallRun={...defaultWallRun('lift'),levels:[1,2,3,4,5].map((n,k)=>({id:`L${n}`,name:`${n}F`,bottom:k*3.2,top:(k+1)*3.2,lifts:2}))};
 const tankDoor:WallRun={...defaultWallRun('tank'),openings:[{id:'O1',label:'O1',segment:'A',face:'through',x:2425,z:275,w:1000,h:2100,level:'L1',trim:{count:2,diameter:12,ext:'ld',diagonal:true}}]};
 const cases:[string,WallRun][]=[['general',defaultWallRun('general')],['tank',defaultWallRun('tank')],['tankDoor',tankDoor],['lift',liftRun],['retaining',defaultWallRun('retaining')]];
 const base=JSON.parse(readFileSync('tests/fixtures/wallRun-v0119.json','utf8')) as Record<string,{kg:number;marks:number;lifts:Record<string,number>;faces:Record<string,number>}>;
 const sd=(m:Member,q:ReturnType<typeof takeoff>,extra:Partial<SheetData>={})=>({member:m,rows:q.rows,input:m.elementInput,project,quantity:1,takeoff:q,status:'DRAFT',revision:'D1',date:'2026-11-06',provisional:false,...extra}) as unknown as SheetData;
 mkdirSync('output/dxf-verification',{recursive:true});
 for(const [t,run] of cases)it(t,()=>{
  const m=apply(runInput(run)).member,q=takeoff(m,spec),rows=q.rows as unknown as WallRow[],b=base[t];ok(m);
  // 1. same steel as v0.119.0: total, per lift, per face; fewer Marks where equal bars repeat across lifts / walls
  expect(q.rebar).toBeCloseTo(b.kg,1);
  for(const l of wallRunLiftQuantities(m,q.rows))expect(l.kg).toBeCloseTo(b.lifts[l.id],1);
  for(const g of wallBbsSummary(m,rows,'face').groups)expect(g.total).toBeCloseTo(b.faces[g.name],1);
  expect(m.bars.length).toBeLessThanOrEqual(b.marks);if(['tank','tankDoor','lift'].includes(t))expect(m.bars.length).toBeLessThan(b.marks);
  for(const mode of ['wall','lift','face'] as const){const it2=wallBbsItems(m,rows,mode,2);expect(it2.reduce((n,x)=>n+('row' in x?x.weight:0),0)).toBeCloseTo(q.rebar*2,6);}
  // 2. every drawing page: no label issue of any level, no label left out; 3. elevations at 1:75 or larger
  const s=sd(m,q),pages=wallPagesOf(s);expect(sheetPageCount(s)).toBe(pages.length);
  const drawing=pages.filter(p=>p.views.length);expect(drawing.length).toBeGreaterThan(0);
  for(const p of drawing){expect(labelIssues(p.prims,wallSheetLabelViews(p))).toEqual([]);expect(p.miss||0).toBe(0);
   for(const v of p.views.filter(v=>/^wall-(out|in)-/.test(v.id))){expect(v.n).toBeLessThanOrEqual(75);expect(v.fits).toBe(true);}}
  const elevs=drawing.flatMap(p=>p.views).filter(v=>/^wall-(out|in)-/.test(v.id));
  expect(new Set(elevs.map(v=>v.id.replace(/-\d+$/,''))).size).toBe(2);
  // 4. DXF: B = one viewport per view
  const sheets=pages.map(p=>({prims:p.prims,views:p.views,w:p.w,h:p.h,size:p.size}));
  const dx=buildBbsDxf(sheets,{mode:'B',cad:defaultCadStandard()});expect(dx.summary.viewports).toBe(pages.reduce((n,p)=>n+p.views.length,0));
  writeFileSync(`output/dxf-verification/wallRun-${t}-B.dxf`,dx.text);
  for(const mode of ['A','C'] as const)writeFileSync(`output/dxf-verification/wallRun-${t}-${mode}.dxf`,buildBbsDxf(sheets,{mode,cad:defaultCadStandard()}).text);
 });
 it('lift 5 storeys: elevations split by storey groups on A2 at 1:50, every storey once',()=>{
  const m=apply(runInput(liftRun)).member,q=takeoff(m,spec),plan=wallPlanOf(m,q.rows as never)!;
  expect(plan.size).toBe('A2');expect(plan.n).toBe(50);expect(plan.groups.length).toBeGreaterThanOrEqual(2);
  const lv=runLevels(liftRun);expect(plan.groups[0].z0).toBeLessThanOrEqual(lv.pit![0]);expect(plan.groups[plan.groups.length-1].z1).toBeGreaterThanOrEqual(lv.zTop);
  for(let k=1;k<plan.groups.length;k++)expect(plan.groups[k].z0).toBeLessThan(plan.groups[k-1].z1);
  expect(plan.groups[0].breakHi&&plan.groups[1].breakLo).toBe(true);
  const keys=plan.layout.sheets.flatMap(s=>s.views.map(v=>v.view));
  for(const g of plan.groups)for(const f of ['out','in'])expect(keys).toContain(`sec:wall-${f}-${g.id}`);
  expect(keys).toEqual(expect.arrayContaining(['sec:wall-sec','sec:wall-op','stddet','keyplan','schedule']));
  // no two boxes overlap; the opening detail is 1:20
  for(const sh of plan.layout.sheets){const bs=sh.views;for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i],c=bs[j];expect(a.x+a.w<=c.x+.01||c.x+c.w<=a.x+.01||a.y+a.h<=c.y+.01||c.y+c.h<=a.y+.01).toBe(true);}}
  expect(plan.layout.sheets.flatMap(s=>s.views).find(v=>v.view==='sec:wall-op')!.n).toBe(20);
 });
 it('Sheet Composer: views listed with sizes, a moved view is drawn there, template round trip',()=>{
  const m=apply(runInput(tankDoor)).member,q=takeoff(m,spec),s=sd(m,q),views=sheetViews(s);
  expect(views.map(v=>v.key)).toEqual(expect.arrayContaining(['sec:wall-out-1','sec:wall-in-1','sec:wall-sec','sec:wall-op','stddet','keyplan','schedule']));
  const sys=resolveSheetLayout(s,'A3');expect(sys.from).toBe('system');
  const lay=structuredClone(sys.layout!) as SheetLayout,sh=lay.sheets.findIndex(x=>x.views.some(v=>v.view==='sec:wall-sec')),pv=lay.sheets[sh].views.find(v=>v.view==='sec:wall-sec')!;pv.x+=20;pv.y+=5;
  const moved={...m,sheetLayout:sheetLayoutSchema.parse(lay)},s2=sd(moved,q),info=drawSheetInfo(s2,layoutPage(s2,sh)).views.find(v=>v.key==='sec:wall-sec')!;
  expect(info.box.x).toBeCloseTo(pv.x,6);expect(info.box.y).toBeCloseTo(pv.y,6);expect(resolveSheetLayout(s2,'A3').from).toBe('member');
  const tpl=templateFrom({id:'wall-tpl',name:'ผนัง (Wall Run)',category:'Wall',size:'A3'},moved.sheetLayout!,[],moved);
  expect(tpl.sheets.flatMap(x=>x.views.map(v=>v.view))).toEqual(expect.arrayContaining(['wall-out-1','wall-sec','stddet']));
  const back=templateLayout(tpl,[]);expect(back.sheets.flatMap(x=>x.views.map(v=>v.view)).sort()).toEqual(moved.sheetLayout!.sheets.flatMap(x=>x.views.map(v=>v.view)).sort());
  const p2={...project,sheetTemplates:{version:1,templates:[tpl],defaults:[{category:'Wall',id:'wall-tpl'}]}} as unknown as Project;
  const other=apply(runInput(tankDoor),'W2').member,s3=sd(other,takeoff(other,spec),{project:p2});
  expect(resolveSheetLayout(s3,'A3').from).toBe('template');
  expect(drawSheetInfo(s3,layoutPage(s3,sh)).views.find(v=>v.key==='sec:wall-sec')!.box.x).toBeCloseTo(pv.x,6);
 });
});
