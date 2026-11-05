// S4a (docs/SLAB_FLOOR.md “Tracing / Import”): DXF plan import (grids, beams, columns, opening, slab labels → the same floor
// as the hand-made one, S1 bars + S3 beams equal), units m = mm, two plans + window, two-point alignment (turned 90°, scale),
// vector PDF segments + snap at the grid crossings, saved layer roles, nothing ticked = no change, underlay without effect on
// quantities / sheets, backup / restore remaps the underlay attachment.
import {describe,expect,it} from 'vitest';
import DxfParser from 'dxf-parser';
import {dxfDoc,docToMm,insUnits,pdfDoc,type CadDoc} from '../src/domain/cadEntities';
import {applyProposal,defaultPicks,guessLayerRoles,parseBeamText,parseSlabText,proposalDiff,readFloorPlan,roleFromName,type FloorProposal} from '../src/domain/slabPlanImport';
import {alignResiduals,alignTwoPoints,crossing,SnapIndex,toFloor,toSource} from '../src/domain/underlay';
import {newSlabFloor,type Floor} from '../src/domain/slabFloor';
import {handFloor,slabPlanDxf,slabPlanPdf,PDF_ORIGIN_MM,GX,GY} from './fixtures/slabPlan';
import {applyElementInput,defaultElementInput,type SlabInput} from '../src/domain/elementInput';
import {blankMember,currentStarterSpec,type Member,type Spec} from '../src/domain/model';
import {takeoff} from '../src/domain/engine';
import {planFloorBeams} from '../src/domain/floorBeams';
import {tagSheetSets} from '../src/domain/tagSheets';
import {drawSheetInfo,sheetPageCount,type SheetData} from '../src/domain/bbsSheet';
import {expandPrims} from '../src/domain/drawingPrims';
import {buildBbsDxf} from '../src/data/dxf';
import {defaultCadStandard} from '../src/domain/cadStandard';
import {drawingModelHash} from '../src/domain/drawingEdits';
import {buildRestorePlan} from '../src/domain/restorePlan';
import {copyMemberInputs} from '../src/domain/memberCopy';
import {memberSchema,type Attachment,type Project,type SnapshotBundle} from '../src/domain/model';

const spec={...currentStarterSpec,designCode:'ACI',rounding:25} as Spec;
const parse=(text:string):CadDoc=>dxfDoc(new DxfParser().parseSync(text));
const SRC={kind:'dxf' as const,attachmentId:'att1'};
function importInto(base:Floor,text:string,win?:[number,number,number,number]){
 const d=parse(text),units=insUnits(d.insunits)||'mm',roles=guessLayerRoles(d.layers);
 const p=readFloorPlan(docToMm(d,units,win),roles,{source:SRC,floor:base});
 return {doc:d,p,roles,...applyProposal(base,p,defaultPicks(proposalDiff(base,p)))};
}
const strip=(f:Floor)=>{const {underlay:_u,importMap:_i,...rest}=f;return {...rest,columns:(rest.columns||[]).map(({id:_id,...c})=>c)};};
function floorMember(f:Floor):Member{
 const i={...defaultElementInput('Slab','manual',spec),layout:'floor',floor:f} as SlabInput;
 return {...applyElementInput({...blankMember('Slab','FL2'),id:'fl2',version:1,occurrences:[{id:'o1',zone:'A',floor:'2',grid:'',quantity:1}]},i,{rounding:25}).member,version:1};
}
const kg=(m:Member)=>takeoff(m,spec);

describe('S4a DXF plan import',()=>{
 it('layer names → roles; beam / slab texts',()=>{
  expect(['S-GRID','GRID','S-GRID-BUBBLE','BEAM','S-BEAM','S-BEAM-TEXT','COL','S-COL','OPENING','SLAB','S-SLAB-TEXT','TEXT','0'].map(roleFromName))
   .toEqual(['grid','grid','gridLabel','beam','beam','text','column','column','opening','slabMark','slabMark','text',undefined]);
  expect(parseBeamText('B1')).toEqual({mark:'B1'});expect(parseBeamText('B1 (300x600)')).toEqual({mark:'B1',width:300,depth:600});
  expect(parseBeamText('2B3 250x500')).toEqual({mark:'B3',width:250,depth:500});expect(parseBeamText('S1')).toBeUndefined();
  expect(['S1','S-1','FS1','S1 (t=150)','S12A t=200','B1'].map(t=>parseSlabText(t))).toEqual([{mark:'S1'},{mark:'S-1'},{mark:'FS1'},{mark:'S1',thickness:150},{mark:'S12A',thickness:200},undefined]);
 });
 it('fixture (mm) → grids ±1 mm, 7 beam lines with mark / size / offset, 12 columns, 1 opening, S1 × 4 / S2 × 2 = the hand floor',()=>{
  const {p,floor,doc}=importInto(newSlabFloor(),slabPlanDxf());
  expect(doc.insunits).toBe(4);
  expect(p.grids.filter(g=>g.axis==='X').map(g=>[g.label,g.at])).toEqual([['A',0],['B',6000],['C',12000],['D',16500]]);
  expect(p.grids.filter(g=>g.axis==='Y').map(g=>[g.label,g.at])).toEqual([['1',0],['2',5000],['3',10000]]);
  expect(p.beams.map(b=>`${b.along}${b.line} ${b.from}-${b.to} ${b.mark} ${b.width}x${b.depth} ${b.offset}`)).toEqual(['X1 A-D B1 300x600 0','X2 A-D B1 300x600 0','X3 A-D B1 300x600 0','YA 1-3 B2 250x500 0','YB 1-3 B2 250x500 0','YC 1-3 B2 250x500 0','YD 1-3 B2 250x500 -75']);
  expect(p.columns).toHaveLength(12);expect(p.columns.every(c=>c.sx===400&&c.sy===400)).toBe(true);expect(p.columns.find(c=>c.x==='A'&&c.y==='1')?.mark).toBe('C1');
  expect(p.openings.map(o=>[o.label,o.shape,o.x,o.y,o.w,o.h])).toEqual([['OP-1','rect',8000,2000,800,600]]);
  expect(p.panelMarks.map(m=>m.mark).sort()).toEqual(['S1','S1','S1','S1','S2','S2']);
  expect(p.warnings).toEqual([]);
  for(const x of [...p.grids,...p.beams,...p.columns,...p.openings,...p.panelMarks]){expect(x.confidence).toBeGreaterThan(0.5);expect(x.evidence.handles.length).toBeGreaterThan(0);}
  expect(floor.panels.filter(x=>x.mark==='S1')).toHaveLength(4);expect(floor.panels.filter(x=>x.mark==='S2')).toHaveLength(2);
  expect(strip(floor)).toEqual(strip(handFloor()));
  // generators: S1 slab bars / quantities and S3 beam groups equal those of the hand floor
  const a=floorMember(floor),b=floorMember(handFloor());
  expect(a.bars.length).toBe(b.bars.length);expect(kg(a)).toEqual(kg(b));
  const ra=planFloorBeams(a,[a],spec).rows,rb=planFloorBeams(b,[b],spec).rows;
  expect(ra.map(r=>r.code)).toEqual(['FL2-B-A','FL2-B-B','FL2-B-C','FL2-B-D','FL2-B-1','FL2-B-2','FL2-B-3']);
  expect(ra.map(r=>JSON.stringify((r.member!.elementInput as any).spans))).toEqual(rb.map(r=>JSON.stringify((r.member!.elementInput as any).spans)));
  expect(ra.map(r=>kg(r.member!))).toEqual(rb.map(r=>kg(r.member!)));
 });
});

describe('S4a units, windows, layer roles, review',()=>{
 it('the file in m gives the floor of the file in mm; no $INSUNITS → ask (undefined)',()=>{
  const mm=importInto(newSlabFloor(),slabPlanDxf()),m=importInto(newSlabFloor(),slabPlanDxf({units:'m'}));
  expect(m.doc.insunits).toBe(6);expect(insUnits(m.doc.insunits)).toBe('m');
  expect(strip(m.floor)).toEqual(strip(mm.floor));
  expect(insUnits(parse(slabPlanDxf({insunits:false})).insunits)).toBeUndefined();
 });
 it('two plans in one file: only the window is read',()=>{
  const all=importInto(newSlabFloor(),slabPlanDxf({plans:2}));
  expect(all.p.grids.length).toBeGreaterThan(7);// both plans' grids → wrong without a window
  const win:[number,number,number,number]=[5000,14000,32000,34000],one=importInto(newSlabFloor(),slabPlanDxf({plans:2}),win);
  expect(strip(one.floor)).toEqual(strip(handFloor()));
  const two=importInto(newSlabFloor(),slabPlanDxf({plans:2}),[45000,14000,72000,34000]);
  expect(two.p.panelMarks.map(x=>x.mark)).toEqual(Array(6).fill('S3'));expect(two.p.grids.filter(g=>g.axis==='X').map(g=>g.at)).toEqual([0,6000,12000,16500]);
 });
 it('layer roles are saved on the floor and guessed for the next file with other layer names',()=>{
  const rename=(t:string)=>[['S-GRID-BUBBLE','L12'],['S-GRID','L11'],['S-BEAM-TEXT','L22'],['S-BEAM','L21'],['S-COL-TEXT','L32'],['S-COL','L31'],['S-OPENING','L41'],['S-SLAB-TEXT','L52'],['S-TEXT','L61']].reduce((s,[a,b])=>s.replaceAll(`\n${a}\n`,`\n${b}\n`),t);
  const d=parse(rename(slabPlanDxf()));expect(guessLayerRoles(d.layers).grid).toBeUndefined();
  // the user maps the layers once; the import stores the map on the floor
  const map={layers:{grid:['L11'],gridLabel:['L12'],beam:['L21'],text:['L22','L32','L61'],column:['L31'],opening:['L41'],slabMark:['L52']}};
  const p=readFloorPlan(docToMm(d,'mm'),map.layers,{source:SRC,floor:newSlabFloor()}),base=newSlabFloor();
  const {floor}=applyProposal(base,p,defaultPicks(proposalDiff(base,p)),{importMap:map});
  expect(floor.importMap).toEqual(map);
  const guessed=guessLayerRoles(parse(rename(slabPlanDxf({units:'m'}))).layers,[floor.importMap!]);
  for(const [k,v] of Object.entries(map.layers))expect((guessed as any)[k]).toEqual(expect.arrayContaining(v));
  expect(guessed.slabMark).toEqual(['L52','S-SLAB']);// S-SLAB (slab edge, not renamed) by its name
 });
 it('nothing ticked = the same floor; ticked rows only; one new floor for the whole import (one undo step)',()=>{
  const base=handFloor(),d=parse(slabPlanDxf()),moved=structuredClone(base);moved.beams[0]={...moved.beams[0],width:350};moved.gridsX[3]={...moved.gridsX[3],at:16400};
  const p=readFloorPlan(docToMm(d,'mm'),guessLayerRoles(d.layers),{source:SRC,floor:moved}),diff=proposalDiff(moved,p);
  expect(applyProposal(moved,p,new Set()).floor).toBe(moved);
  expect(diff.filter(x=>x.op==='edit').map(x=>x.id).sort()).toEqual(['b:X:1:A-D','g:X:D'].sort());
  expect(diff.filter(x=>x.op==='add'||x.op==='remove')).toEqual([]);
  const onlyBeam=applyProposal(moved,p,new Set(['b:X:1:A-D'])).floor;
  expect(onlyBeam.beams[0].width).toBe(300);expect(onlyBeam.gridsX[3].at).toBe(16400);expect(moved.beams[0].width).toBe(350);
  const all=applyProposal(moved,p,defaultPicks(diff)).floor;expect(strip(all)).toEqual(strip(base));
 });
});

describe('S4a underlay: alignment, PDF vectors, snap',()=>{
 it('two-point alignment of a drawing turned 90° in m: transform exact, < 1 mm at every other crossing',()=>{
  const d=parse(slabPlanDxf({units:'m',turn:true})),index=new SnapIndex(d),f=handFloor();
  // grid A/1 drawn at (10 000, 20 000) mm → turned (−20, 10) m; D/3 at (26 500, 30 000) → (−30, 26.5) m; clicks a little off
  const a=index.snap([-20.04,10.03],0.15,['int'])!,b=index.snap([-29.97,26.46],0.15,['int'])!;
  expect(a.p[0]).toBeCloseTo(-20,9);expect(a.p[1]).toBeCloseTo(10,9);expect(b.p[0]).toBeCloseTo(-30,9);expect(b.p[1]).toBeCloseTo(26.5,9);
  const t=alignTwoPoints([a.p,b.p],[crossing(f,'A','1')!,crossing(f,'D','3')!]);
  expect(t.scale).toBeCloseTo(1000,6);expect(t.rotation).toBeCloseTo(-Math.PI/2,12);
  const r=alignResiduals(f,t,index,300,['A/1','D/3']);expect(r).toHaveLength(10);expect(Math.max(...r.map(x=>x.err))).toBeLessThan(1);
  const back=toSource(t,toFloor(t,[3,4]));expect(back[0]).toBeCloseTo(3,9);expect(back[1]).toBeCloseTo(4,9);
  expect(()=>alignTwoPoints([[0,0],[0,0]],[[0,0],[1,1]])).toThrow();
 });
 it('vector PDF (A3, 1:100): segments read, snap at the grid crossings ≤ 0.5 mm × scale after a two-point alignment',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf=await pdfjs.getDocument({data:slabPlanPdf(),isEvalSupported:false,useSystemFonts:false}).promise,page=await pdf.getPage(1);
  const d=pdfDoc(await page.getOperatorList(),pdfjs.OPS as unknown as Record<string,number>,page.view as [number,number,number,number]);
  expect(d.segCount).toBeGreaterThan(100);expect(d.page!.w).toBeCloseTo(1190.55,1);
  const pt=(mm:number)=>mm*72/25.4,paper=(x:number,y:number):[number,number]=>[pt(PDF_ORIGIN_MM[0]+x/100),pt(297-PDF_ORIGIN_MM[1]+y/100)];
  const index=new SnapIndex(d),f=handFloor(),near=(p:[number,number]):[number,number]=>[p[0]+0.4,p[1]-0.3];
  const a=index.snap(near(paper(0,0)),3,['int'])!,b=index.snap(near(paper(16500,10000)),3,['int'])!;
  const t=alignTwoPoints([a.p,b.p],[crossing(f,'A','1')!,crossing(f,'D','3')!]);
  expect(t.scale).toBeCloseTo(100*25.4/72,1);expect(Math.abs(t.rotation)).toBeLessThan(1e-3);
  const r=alignResiduals(f,t,index,300,['A/1','D/3']);expect(r).toHaveLength(10);expect(Math.max(...r.map(x=>x.err))).toBeLessThanOrEqual(0.5*100);
  // a click near every crossing snaps to it within 0.5 mm × 100
  for(const x of GX)for(const y of GY){const h=index.snap(near(paper(x,y)),3,['int'])!,q=toFloor(t,h.p);expect(Math.hypot(q[0]-x,q[1]-y)).toBeLessThanOrEqual(50);}
  await pdf.destroy();
 },60000);
 it('snap kinds and the visible-window index of a large drawing',()=>{
  const d=parse(slabPlanDxf()),full=new SnapIndex(d);
  expect(full.snap([10000+8400,20000+2300],30)?.kind).toBe('int');// opening cross centre
  expect(full.snap([10000+3500,20000+150+3],10,['end','mid','near'])?.kind).toBe('near');
  expect(full.line([10000+6000+2,20000+2500],10)).toEqual({axis:'x',at:16000});
  const part=new SnapIndex(d,[9000,19000,12000,22000]);expect(part.partial).toBe(true);expect(part.segs.length).toBeLessThan(full.segs.length);
 });
});

describe('S4a underlay is display only',()=>{
 const underlay={attachmentId:'att1',page:1,transform:{scale:1,rotation:0,tx:-10000,ty:-20000},opacity:0.5,locked:true,hidden:false,align:[{src:[10000,20000] as [number,number],x:'A',y:'1'},{src:[26500,30000] as [number,number],x:'D',y:'3'}]};
 const project={id:'p',code:'J-SF',name:'S4a',location:'',owner:'',notes:'',acl:{},version:1,createdAt:'',spec,titleBlock:{company:'FORM',drawnBy:'',checkedBy:'',drawingPrefix:'',sheetSize:'A3'}} as unknown as Project;
 const sheet=(m:Member):SheetData=>{const q=takeoff(m,spec);return {member:m,rows:q.rows as SheetData['rows'],input:m.elementInput,project,quantity:1,takeoff:q,status:'DRAFT',revision:'D1',date:'2026-11-06',provisional:false} as SheetData;};
 it('no effect on bars, quantities, sheets (SVG / PDF prims, DXF) or the drawing status hash',()=>{
  const plain=floorMember(handFloor()),withU=floorMember({...handFloor(),underlay,importMap:{layers:{grid:['S-GRID']},units:'mm'}});
  expect(memberSchema.parse(withU).elementInput).toMatchObject({floor:{underlay}});
  expect(withU.bars).toEqual(plain.bars);expect(kg(withU)).toEqual(kg(plain));
  const pages=(m:Member)=>{const s=tagSheetSets(sheet(m))[0];return Array.from({length:sheetPageCount(s)},(_,k)=>drawSheetInfo(s,k));};
  const a=pages(withU),b=pages(plain);expect(a.map(x=>expandPrims(x.prims))).toEqual(b.map(x=>expandPrims(x.prims)));
  expect(buildBbsDxf(a,{mode:'B',cad:defaultCadStandard()}).text).toEqual(buildBbsDxf(b,{mode:'B',cad:defaultCadStandard()}).text);
  const same=(m:Member)=>({...m,elementInput:{...m.elementInput,appliedAt:'t'}}) as any;// apply time differs between the two builds
  expect(drawingModelHash(same(withU))).toBe(drawingModelHash(same(plain)));expect(drawingModelHash(same({...withU,elementInput:{...withU.elementInput,floor:{...handFloor(),underlay:{...underlay,opacity:1}}}} as Member))).toBe(drawingModelHash(same(withU)));
 });
 it('backup / restore keeps the underlay and points it at the restored file; a member copy drops it',()=>{
  const m={...floorMember({...handFloor(),underlay}),code:'FL2'};
  const att={id:'att1',name:'plan.dxf',path:'projects/p/files/att1/plan.dxf',memberId:'fl2',kind:'Drawing',revision:'',size:1000,contentType:'image/vnd.dxf',page:1} as Attachment;
  const bundle={schemaVersion:2,project:{...project,spec},members:[m],attachments:[att],stock:[],stockLedger:[],cutPlans:[],createdAt:'2026-11-06',status:'DRAFT',version:1,historyIndex:[]} as unknown as SnapshotBundle;
  const restored={...att,id:'new1',path:'projects/q/files/new1/plan.dxf'};
  const plan=buildRestorePlan(bundle,[restored],[],[],'job','2026-11-06T00:00:00Z',{att1:'new1'});
  const back=memberSchema.parse(plan.entries.find(e=>e.collection==='members')!.data);
  expect((back.elementInput as SlabInput).floor!.underlay).toEqual({...underlay,attachmentId:'new1'});
  const copy=copyMemberInputs(m,{memberId:'fl9',code:'FL9',occurrences:m.occurrences});
  expect((copy.elementInput as SlabInput).floor!.underlay).toBeUndefined();expect((copy.elementInput as SlabInput).floor!.panels).toEqual((m.elementInput as SlabInput).floor!.panels);
 });
});
