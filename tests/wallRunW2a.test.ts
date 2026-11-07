// Wall Run W2a (docs/WALL_RUN.md): labels round openings stay in their own face (leaders never cross an opening outline /
// cross or an opening diagonal bar, opening bars labelled on their side of the opening, short code + “ดูรูปขยายช่องเปิด” when
// crowded) and haunch bar ends `tank.haunch.barEnd` centre | ld (absent = ld: saved members keep their steel).
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {blankMember,currentStarterSpec,type Member,type Project,type Spec} from '../src/domain/model';
import {applyElementInput,defaultElementInput,elementInputProblems,type WallInput} from '../src/domain/elementInput';
import {takeoff,validateMember} from '../src/domain/engine';
import {defaultWallRun,runLevels,wallRunLiftQuantities,wallRunRaw} from '../src/domain/wallRun';
import {wallRunSchema,type WallRun} from '../src/domain/wallRunSchema';
import {BEND_COVER_POLICY} from '../src/domain/bendCover';
import {readFileSync} from 'node:fs';
import {WALL_LABEL_GAP,wallBbsSummary,wallPagesOf,wallSheetLabelViews,type WallRow} from '../src/domain/wallRunSheet';
import {labelIssues,textBox} from '../src/domain/labelQa';
import type {LeaderPrim,Prim} from '../src/domain/drawingPrims';
import {expandPrims} from '../src/domain/drawingPrims';
import type {SheetData} from '../src/domain/bbsSheet';

const spec:Spec={...currentStarterSpec,designCode:'ACI',rounding:25,rebarCoverPolicy:BEND_COVER_POLICY} as Spec;
const runInput=(run:WallRun)=>({...defaultElementInput('Wall','manual',spec),layout:'run',run} as WallInput);
const apply=(run:WallRun,code='W1')=>applyElementInput({...blankMember('Wall',code),version:1},runInput(run),{rounding:25});
const trim={count:2,diameter:12,ext:'ld' as const,diagonal:true};
const withEnd=(r:WallRun,barEnd?:'centre'|'ld'):WallRun=>({...r,tank:{...r.tank!,haunch:{size:r.tank!.haunch!.size,...(barEnd?{barEnd}:{})}}});
const tankDoor=(r:WallRun):WallRun=>({...r,openings:[{id:'O1',label:'O1',segment:'A',face:'through',x:2425,z:275,w:1000,h:2100,level:'L1',trim}]});
const base=JSON.parse(readFileSync('tests/fixtures/wallRun-v0119.json','utf8')) as Record<string,{kg:number;lifts:Record<string,number>;faces:Record<string,number>}>;
const haunch=(what:string)=>/Haunch/.test(what);

describe('haunch bar ends',()=>{
 it('schema: barEnd optional (absent = members saved before W2a), new tanks default to centre',()=>{
  expect(defaultWallRun('tank').tank!.haunch).toEqual({size:150,barEnd:'centre'});
  expect(wallRunSchema.parse(withEnd(defaultWallRun('tank'))).tank!.haunch).toEqual({size:150});
  expect(()=>wallRunSchema.parse({...defaultWallRun('tank'),tank:{...defaultWallRun('tank').tank!,haunch:{size:150,barEnd:'x'}}})).toThrow();
 });
 it('old members (no barEnd) and barEnd ld: same steel as v0.119 (total, per lift, per face) for both tank cases',()=>{
  for(const [t,run] of [['tank',defaultWallRun('tank')],['tankDoor',tankDoor(defaultWallRun('tank'))]] as const)for(const end of [undefined,'ld'] as const){
   const m=apply(withEnd(run,end)).member,q=takeoff(m,spec),b=base[t];expect(validateMember(m,spec)).toEqual([]);
   expect(q.rebar).toBeCloseTo(b.kg,1);
   for(const l of wallRunLiftQuantities(m,q.rows))expect(l.kg).toBeCloseTo(b.lifts[l.id],1);
   for(const g of wallBbsSummary(m,q.rows as unknown as WallRow[],'face').groups)expect(g.total).toBeCloseTo(b.faces[g.name],1);}
 });
 it('ld: Ld cut at the opposite cover → note in the bar + warning; centre: only the haunch bars change, ends by the formula',()=>{
  const run=defaultWallRun('tank'),ld=runInput(withEnd(run,'ld')),ce=runInput(withEnd(run,'centre')),warns:string[]=[];
  const a=wallRunRaw(ld,ld.detailing,25,w=>warns.push(w)),b=wallRunRaw(ce,ce.detailing);
  expect(warns.some(w=>/ระยะฝังไม่ครบ Ld/.test(w))).toBe(true);expect(a.filter(r=>haunch(r.what)).every(r=>/ไม่ครบ Ld/.test(r.what))).toBe(true);
  // every other bar identical
  const key=(r:typeof a[number])=>JSON.stringify([r.kind,r.d,r.lift,r.face,r.what,r.pts.map(p=>p.map(v=>Math.round(v*1000)))]);
  expect(b.filter(r=>!haunch(r.what)).map(key)).toEqual(a.filter(r=>!haunch(r.what)).map(key));
  const ha=a.filter(r=>haunch(r.what)),hb=b.filter(r=>haunch(r.what));expect(hb.length).toBe(ha.length);expect(hb.length).toBeGreaterThan(0);
  // centre: upper end on the wall centre plane, lower end at the slab mid-depth, 45°; length √2 (t/2 + size/2 − cc + h/2)
  const lv=runLevels(run),t=250,size=150,h=run.tank!.bottom.thickness,d=12,cc=Math.SQRT2*(ce.cover.face+d/2)+1,zB=lv.zBase;
  const L=Math.SQRT2*(t/2+size/2-cc+h/2);
  for(const r of hb){const [p,q]=r.pts,len=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);
   expect(len).toBeCloseTo(L,3);expect(Math.min(p[2],q[2])).toBeCloseTo(zB-h/2,3);expect(Math.max(p[2],q[2])).toBeCloseTo(zB+t/2+size/2-cc,3);
   // ≥ 150 past the wall face and past the slab top
   expect((t/2)*Math.SQRT2).toBeGreaterThanOrEqual(150);expect((h/2)*Math.SQRT2).toBeGreaterThanOrEqual(150);}
  const lenOf=(r:typeof a[number])=>Math.hypot(...[0,1,2].map(k=>r.pts[1][k]-r.pts[0][k]) as [number,number,number]);
  expect(Math.max(...hb.map(lenOf))).toBeLessThan(Math.min(...ha.map(lenOf)));
  // steel: centre lighter by the haunch bars only
  const mL=apply(withEnd(run,'ld')).member,mC=apply(withEnd(run,'centre')).member,qL=takeoff(mL,spec),qC=takeoff(mC,spec);
  const hk=(q:typeof qL,m:Member)=>q.rows.filter(r=>haunch(m.bars.find(b=>b.id===r.id)?.note||'')).reduce((n,r)=>n+r.weight,0);
  expect(qC.rebar).toBeLessThan(qL.rebar);expect(qL.rebar-qC.rebar).toBeCloseTo(hk(qL,mL)-hk(qC,mC),6);
  for(const l of wallRunLiftQuantities(mC,qC.rows))if(l.id!=='BASE')expect(l.kg).toBeCloseTo(base.tank.lifts[l.id],1);
  expect(validateMember(mC,spec)).toEqual([]);
 });
 it('short walls / thin slabs: never shorter than 150 past the faces, never past the opposite cover',()=>{
  const r=defaultWallRun('tank'),thin:WallRun={...r,path:{...r.path,segments:r.path.segments.map(s=>({...s,thickness:150}))},tank:{...r.tank!,bottom:{...r.tank!.bottom,thickness:150},haunch:{size:100,barEnd:'centre'}}};
  const i=runInput(thin),hb=wallRunRaw(i,i.detailing).filter(x=>haunch(x.what)),zB=runLevels(thin).zBase;expect(hb.length).toBeGreaterThan(0);
  for(const x of hb){const top=Math.max(x.pts[0][2],x.pts[1][2]),low=Math.min(x.pts[0][2],x.pts[1][2]);expect(zB-low).toBeGreaterThanOrEqual(150/Math.SQRT2-1e-3);expect(low).toBeGreaterThanOrEqual(zB-150+i.cover.face+6-1e-3);void top;}
 });
});

describe('labels round openings (W2a)',()=>{
 const project={id:'p',code:'J-099',name:'Wall Run test',spec,version:1,titleBlock:{}} as unknown as Project;
 const sd=(m:Member)=>{const q=takeoff(m,spec);return {member:m,rows:q.rows,input:m.elementInput,project,quantity:1,takeoff:q,status:'DRAFT',revision:'D1',date:'2026-11-07',provisional:false} as unknown as SheetData;};
 const lift:WallRun={...defaultWallRun('lift'),levels:[1,2,3,4,5].map((n,k)=>({id:`L${n}`,name:`${n}F`,bottom:k*3.2,top:(k+1)*3.2,lifts:2}))};
 lift.openings=[{...lift.openings[0],repeat:{levels:['L2','L3','L4','L5']}}];
 const g=defaultWallRun('general'),general:WallRun={...g,openings:[{id:'O1',label:'D1',segment:'A',face:'through',x:600,z:0,w:1000,h:2100,level:'L1',trim},
  {id:'O2',label:'W1',segment:'A',face:'through',x:2400,z:900,w:1200,h:1000,level:'L1',trim},{id:'O3',label:'W2',segment:'A',face:'through',x:4400,z:900,w:900,h:1000,level:'L1',trim}]};
 const cases:[string,WallRun][]=[['lift (door every storey)',lift],['tank + door',tankDoor(defaultWallRun('tank'))],['general (3 openings)',general],['retaining',defaultWallRun('retaining')]];
 /** labels outside their face although the anchor is in it: only where the face has no room (checked by hand on the sheets in
  * output/wall-run-verification/after-w2a/): lift V04 / H03 / H02 beside the doors at 1:50 and V01 under the pit slab (face A is 52 mm wide), tank H04 / OP3 / S04 next to the door
  * 575 mm from the A–B corner. Corner U-bars / L-bars drawn in the gap between faces are not counted (anchor outside a face). */
 const allowed:Record<string,string[]>={'lift (door every storey)':['W1-V04','W1-H03','W1-H02','W1-V01'],'tank + door':['W1-H04','W1-OP3','W1-S04'],'general (3 openings)':[],'retaining':[]};
 for(const [t,run] of cases)it(t,()=>{
  expect(elementInputProblems(runInput(run))).toEqual([]);const m=apply(run).member;expect(validateMember(m,spec)).toEqual([]);
  const pages=wallPagesOf(sd(m)).filter(p=>p.views.length);let leaders=0,opLabels=0;
  for(const p of pages){
   // 3. label check: no issue of any kind (incl. leaders across an opening / diagonal bar, gap ≥ 1.5 mm), nothing left out
   const views=wallSheetLabelViews(p);expect(views.every(v=>v.minGap===WALL_LABEL_GAP)).toBe(true);
   expect(labelIssues(p.prims,views)).toEqual([]);expect(p.miss||0).toBe(0);
   // opening bars with no spot at all are left to the 1:20 detail: only those of the detailed opening, with the note
   if(p.inDetail){expect(expandPrims(p.prims).some(x=>x.t==='text'&&x.text==='ดูรูปขยายช่องเปิด')).toBe(true);
    expect(pages.flatMap(q=>q.prims).some(x=>x.t==='leader'&&x.view==='wall-op')).toBe(true);}
   const L=p.prims.filter((x):x is LeaderPrim=>x.t==='leader');leaders+=L.length;
   // independent check of the new rules: leaders vs opening outlines / crosses / diagonal bars, label boxes ≥ 1.5 apart
   const obst=expandPrims(p.prims.filter(x=>x.t!=='leader')).filter(x=>x.qa==='opening');
   if(run.openings.length)expect(obst.length).toBeGreaterThan(0);
   const cross=(a:number[],b:number[])=>{const o=(p1:number[],p2:number[],p3:number[])=>Math.sign((p2[0]-p1[0])*(p3[1]-p1[1])-(p2[1]-p1[1])*(p3[0]-p1[0]));return o(a.slice(0,2),a.slice(2),b.slice(0,2))*o(a.slice(0,2),a.slice(2),b.slice(2))<0&&o(b.slice(0,2),b.slice(2),a.slice(0,2))*o(b.slice(0,2),b.slice(2),a.slice(2))<0;};
   const segs=obst.flatMap(x=>x.t==='line'?[[x.x1,x.y1,x.x2,x.y2]]:x.t==='rect'?[[x.x,x.y,x.x+x.w,x.y],[x.x+x.w,x.y,x.x+x.w,x.y+x.h],[x.x+x.w,x.y+x.h,x.x,x.y+x.h],[x.x,x.y+x.h,x.x,x.y]]:x.t==='poly'?x.pts.slice(1).map((q,k)=>[x.pts[k][0],x.pts[k][1],q[0],q[1]]):[]);
   for(const l of L){const ls=[l.pts[0][0],l.pts[0][1],l.pts[1][0],l.pts[1][1]];expect(segs.filter(s=>cross(ls,s)).length).toBe(0);if(/OP\d/.test(l.text[0]))opLabels++;}
   const bx=L.map(l=>textBox(l.at[0],l.at[1],l.text[0],l.size,l.anchor));
   for(let i=0;i<bx.length;i++)for(let j=i+1;j<bx.length;j++)if(L[i].view===L[j].view){const a=bx[i],b=bx[j],dx=Math.max(a.x0-b.x1,b.x0-a.x1),dy=Math.max(a.y0-b.y1,b.y0-a.y1);expect(Math.max(dx,dy)).toBeGreaterThanOrEqual(WALL_LABEL_GAP-1e-9);}
   // 4. labels of each face inside that face's column, except the named no-room cases
   const out=(p.faces||[]).filter(f=>f.anchorIn&&!f.inside);
   for(const f of out)expect(allowed[t],`${f.view} ${f.face}:${f.mark}`).toContain(f.mark);
   for(const f of (p.faces||[]).filter(f=>f.inside))expect(f.label.x0>=f.zone.x0-.01&&f.label.x1<=f.zone.x1+.01).toBe(true);}
  expect(leaders).toBeGreaterThan(5);if(run.openings.length)expect(opLabels).toBeGreaterThan(0);
  // the faces' share of labels inside: ≥ 85 %
  const all=pages.flatMap(p=>p.faces||[]).filter(f=>f.anchorIn);if(all.length)expect(all.filter(f=>f.inside).length/all.length).toBeGreaterThanOrEqual(.85);
 });
 it('opening bars: labelled on their side; crowded → short code + “ดูรูปขยายช่องเปิด” and the full label in the 1:20 detail',()=>{
  const m=apply(lift).member,pages=wallPagesOf(sd(m)),texts=(p:Prim[])=>expandPrims(p).filter(x=>x.t==='text').map(x=>(x as {text:string}).text);
  const drawing=pages.filter(p=>p.views.length),note=drawing.some(p=>texts(p.prims).includes('ดูรูปขยายช่องเปิด'));
  const opShort=drawing.some(p=>p.prims.some(x=>x.t==='leader'&&/^OP\d$/.test(x.text[0])&&/^wall-(out|in)-/.test(x.view||'')));
  expect(opShort).toBe(note);
  const det=drawing.flatMap(p=>p.prims).filter((x):x is LeaderPrim=>x.t==='leader'&&x.view==='wall-op');
  expect(det.length).toBeGreaterThan(0);expect(det.every(l=>/^W1-OP\d+ \d+-DB\d+/.test(l.text[0]))).toBe(true);
  // every OP Mark labelled in the elevations has its full label in the detail
  const inElev=new Set(drawing.flatMap(p=>p.prims).filter((x):x is LeaderPrim=>x.t==='leader'&&/^wall-(out|in)-/.test(x.view||'')&&!!x.mark&&/-OP\d+$/.test(x.mark.mark)).map(l=>l.mark!.mark));
  for(const mk of inElev)expect(det.some(l=>l.mark?.mark===mk),mk).toBe(true);
  // opening trim bars above / below the opening are labelled above / below it (general wall, 1:50)
  const gm=apply(general).member,gp=wallPagesOf(sd(gm)).filter(p=>p.views.length);
  const op=gp.flatMap(p=>p.prims).filter((x):x is LeaderPrim=>x.t==='leader'&&/^wall-out-/.test(x.view||'')&&!!x.mark&&/-OP\d+$/.test(x.mark.mark));
  expect(op.length).toBeGreaterThan(0);
  const holes=expandPrims(gp.flatMap(p=>p.prims).filter(x=>x.t!=='leader')).filter((x):x is Extract<typeof x,{t:'rect'}>=>x.t==='rect'&&x.qa==='opening'&&/^wall-out-/.test(x.view||''));
  const flat=new Set(gm.bars.filter(b=>/-OP\d+$/.test(b.mark)&&b.points.every(p=>Math.abs(p[2]-b.points[0][2])<1)).map(b=>b.mark));expect(flat.size).toBeGreaterThan(0);
  let sided=0;
  for(const l of op){if(!flat.has(l.mark!.mark))continue;const [ax,ay]=l.pts[0],h=holes.find(r=>ax>r.x-.01&&ax<r.x+r.w+.01&&(ay<r.y||ay>r.y+r.h)&&Math.min(Math.abs(ay-r.y),Math.abs(ay-r.y-r.h))<15);if(!h)continue;
   const b=textBox(l.at[0],l.at[1],l.text[0],l.size,l.anchor);if(ay<h.y)expect(b.y1,l.text[0]).toBeLessThanOrEqual(ay+1e-6);else expect(b.y0,l.text[0]).toBeGreaterThanOrEqual(ay-1e-6);sided++;}
  expect(sided).toBeGreaterThan(0);
 });
});

describe('label check rules',()=>{
 const view={id:'v',box:{x:0,y:0,w:200,h:100}};
 const L=(mk:string,a:[number,number],at:[number,number]):Prim=>({t:'leader',pts:[a,[at[0],at[1]-1]],text:[mk],at,anchor:'start',mark:{mark:mk},arrow:'dot',size:2.1,draw:[],view:'v'} as unknown as Prim);
 it('a leader across an opening outline or an opening diagonal = warning “opening”; lines without qa are not',()=>{
  const hole:Prim={t:'rect',x:20,y:20,w:20,h:20,stroke:'#000',width:.3,view:'v',layer:'concrete',qa:'opening'};
  const diag:Prim={t:'line',x1:60,y1:20,x2:80,y2:40,stroke:'#000',width:.3,view:'v',layer:'barMain',qa:'opening'};
  const plain:Prim={t:'line',x1:100,y1:20,x2:120,y2:40,stroke:'#000',width:.3,view:'v',layer:'symbol'};
  const kinds=(p:Prim[])=>labelIssues(p,[view],{enabled:true,minGap:1,maxLeader:75,lines:false}).map(i=>i.kind);
  expect(kinds([hole,L('A',[30,30],[50,30])])).toEqual(['opening']);
  expect(kinds([diag,L('B',[60,40],[80,22])])).toEqual(['opening']);
  expect(kinds([plain,L('C',[100,40],[120,22])])).toEqual([]);
  expect(kinds([hole,L('D',[45,30],[50,30])])).toEqual([]);
 });
 it('a view may ask a larger gap (wall sheets 1.5 mm)',()=>{
  const a=L('A',[10,10],[20,20]),b=L('B',[10,30],[20+textBox(0,0,'A',2.1).x1+1.2,20]);
  expect(labelIssues([a,b],[view]).map(i=>i.kind)).toEqual([]);
  expect(labelIssues([a,b],[{...view,minGap:1.5}]).map(i=>i.kind)).toEqual(['tight']);
 });
});
