// Slab floor (Slab layout 'floor', docs/SLAB_FLOOR.md): grids → reference beams + panels cut at the beam faces, quantities
// (panels only, no formwork against beams), L panels, openings (cut + area-equivalent trimmers, Ld, diagonals / deviate),
// extra top bars (fixed face / centre, L/4, L/3 by the longer short span), continuous bottom bars lapped at beams ≤ stock,
// lowered panels (crank 1:6 ≤ 75, else separate + anchors), Marks merged across panels of one slab mark, sheet sets per
// slab mark + DXF, backup / restore of `floor`, single slabs unchanged.
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {mkdirSync,writeFileSync} from 'node:fs';
import {blankMember,currentStarterSpec,memberSchema,type Member,type Project,type Spec} from '../src/domain/model';
import {applyElementInput,defaultElementInput,elementInputProblems,elementInputSchema,lapLength,type SlabInput} from '../src/domain/elementInput';
import {takeoff,validateMember} from '../src/domain/engine';
import {autoBeams,autoPanels,devLength,floorBars,gridRef,mergePanels,newSlabFloor,parseGridRef,slabFloorProblems,toggleBeamSegment,type Floor} from '../src/domain/slabFloor';
import type {FloorOpening,SlabRebarSpec} from '../src/domain/slabFloorSchema';
import {tagSheetSets} from '../src/domain/tagSheets';
import {drawSheetInfo,sheetPageCount,type SheetData} from '../src/domain/bbsSheet';
import {buildBbsDxf} from '../src/data/dxf';
import {defaultCadStandard} from '../src/domain/cadStandard';
import {floorMarkFromTemplate,slabTemplatesSchema} from '../src/domain/slabWallTemplates';

const spec:Spec={...currentStarterSpec,designCode:'ACI',rounding:25} as Spec;
const base=()=>defaultElementInput('Slab','manual',spec) as SlabInput;
const grid=(xs:number[],ys:number[]):Floor=>{const f=newSlabFloor();f.gridsX=xs.map((at,k)=>({label:String.fromCharCode(65+k),at}));f.gridsY=ys.map((at,k)=>({label:String(k+1),at}));
 f.beams=autoBeams(f,{mark:'B1',width:300,depth:600});f.panels=autoPanels(f,'S1');return f;};
const floorInput=(f:Floor,patch:Partial<SlabInput>={}):SlabInput=>({...base(),layout:'floor',floor:f,...patch} as SlabInput);
const apply=(i:SlabInput)=>applyElementInput({...blankMember('Slab','FL2'),version:1},i,{rounding:25});
const len=(b:Member['bars'][number])=>b.points.slice(1).reduce((n,p,k)=>n+Math.hypot(p[0]-b.points[k][0],p[1]-b.points[k][1],p[2]-b.points[k][2]),0);
const rebar=(f:Floor,patch:Partial<SlabRebarSpec>)=>{f.marks[0]={...f.marks[0],rebar:{...f.marks[0].rebar,...patch}};return f;};
const noExtra=(f:Floor)=>rebar(f,{topExtra:undefined});
const opening=(o:Partial<FloorOpening>&{x:number;y:number;w:number;h:number}):FloorOpening=>({id:'op1',label:'OP-1',shape:'rect',trim:{method:'cut',bars:'area',ext:'ld',diagonal:true,layers:'both'},...o});

describe('slab floor: schema, grid refs, problems',()=>{
 it('old slab input = single layout, no floor; template without the new columns reads',()=>{
  const old={...base()} as Record<string,unknown>;delete old.layout;
  const p=elementInputSchema.parse(old) as SlabInput;expect(p.layout).toBe('single');expect(p.floor).toBeUndefined();
  const t=slabTemplatesSchema.parse([{id:'s1',name:'S1',thickness:150,support:'elevated',rebar:{shortTop:{diameter:12,spacing:0},shortBottom:{diameter:12,spacing:200},longTop:{diameter:12,spacing:0},longBottom:{diameter:10,spacing:200}}}]);
  const m=floorMarkFromTemplate(t[0]);expect(m.rebar.topExtra).toBeUndefined();expect(m.rebar.edge).toBe('bend');expect(m.rebar.longBottom).toEqual({diameter:10,spacing:200});
 });
 it('grid + distance both ways',()=>{
  const g=[{label:'A',at:0},{label:'B',at:6000}];
  expect(gridRef(g,7200)).toBe('B +1,200');expect(gridRef(g,-300)).toBe('A −300');
  expect(parseGridRef(g,'B +1,200')).toBe(7200);expect(parseGridRef(g,'B-300')).toBe(5700);expect(parseGridRef(g,'1500')).toBe(1500);expect(parseGridRef(g,'Z +5')).toBeUndefined();
 });
 it('overlaps, openings outside / on beams, duplicate grids are blockers',()=>{
  const f=grid([0,6000],[0,5000]);
  expect(slabFloorProblems(floorInput(f))).toEqual([]);
  expect(slabFloorProblems(floorInput({...f,gridsX:[...f.gridsX,{label:'A',at:9000}]})).join()).toMatch(/ชื่อกริดซ้ำ/);
  expect(slabFloorProblems(floorInput({...f,panels:[...f.panels,{...f.panels[0],id:'sp9',tag:'S1-09'}]})).join()).toMatch(/ทับกับแผง/);
  expect(slabFloorProblems(floorInput({...f,panels:[{...f.panels[0],outline:[[0,0],[6000,0],[6000,5000],[0,5000]]}]})).join()).toMatch(/ทับคาน/);
  expect(slabFloorProblems(floorInput({...f,openings:[opening({x:5500,y:2000,w:800,h:600})]})).join()).toMatch(/ออกนอกแผง|ทับคาน/);
  expect(elementInputProblems(floorInput({...f,panels:[]})).join()).toMatch(/ยังไม่มีแผงพื้น/);
 });
});

describe('slab floor: geometry and quantities',()=>{
 it('4 × 3 grid + beams → 6 panels cut at the beam faces; concrete = Σ panels (no beams), soffit formwork only',()=>{
  const f=grid([0,6000,12000,16500],[0,5000,10000]);
  expect(f.panels).toHaveLength(6);expect(f.beams).toHaveLength(7);
  expect(f.panels[0].outline).toEqual([[150,150],[5850,150],[5850,4850],[150,4850]]);
  const r=apply(floorInput(f)),q=takeoff(r.member,spec);
  // by hand: X clear 5700 + 5700 + 4200, Y clear 4700 + 4700, t 150
  const area=(5700+5700+4200)*4700*2;expect(q.concrete).toBeCloseTo(area*150/1e9,6);expect(q.formwork).toBeCloseTo(area/1e6,6);
  expect(r.member.shapeModel?.parts.filter(p=>p.role==='reference')).toHaveLength(7);
  expect(validateMember(r.member,spec)).toEqual([]);
 });
 it('L panel (polygon) volume',()=>{
  const f=noExtra(grid([0,6000,12000],[0,5000,10000]));
  // no beam on B between 1–2 or on 2 between A–B: three cells merge into one L
  let g=toggleBeamSegment(f,'Y','B','1','2',{mark:'B1',width:300,depth:600});g=toggleBeamSegment(g,'X','2','A','B',{mark:'B1',width:300,depth:600});
  g={...g,panels:autoPanels(g,'S1')};
  const pick=g.panels.filter(p=>p.outline.some(([x,y])=>x<6000&&y<6000)||p.outline.every(([x,y])=>x>6000&&y<5000)).map(p=>p.id);
  const m=mergePanels(g,pick);if('error' in m)throw new Error(m.error);
  const L=m.floor.panels.find(p=>p.id===pick[0])!;expect(L.outline.length).toBe(6);
  const q=takeoff(apply(floorInput(m.floor)).member,spec);
  const lArea=11850*4850+5850*(9850-4850)-0;// cells A–C × 1–2 to the B/C beam … by hand below
  void lArea;
  // L = (150..11850 × 150..4850) ∪ (150..5850 × 4850..9850); last panel 6150..11850 × 5150..9850
  const byHand=(11700*4700+5700*5000+5700*4700)*150/1e9;expect(q.concrete).toBeCloseTo(byHand,6);
 });
});

describe('slab floor: openings',()=>{
 const cell=()=>noExtra(grid([0,6000],[0,5000]));// panel 150..5850 × 150..4850, DB12@200 both ways, cover 25
 it('800 × 600 cut: bars cut by hand, area-equivalent trimmers past the corners by Ld, 4 diagonals',()=>{
  const f=cell();f.openings=[opening({x:2000,y:2000,w:800,h:600})];
  const i=floorInput(f),r=floorBars(i,i.detailing),st=r.openings.get('op1')!;
  // bars along Y (B1, short span Y?): panel 5700 × 4700 → short span = Y: B1 runs along Y spaced along X from 181 to 5819 (30 bars @194.4)
  // cut where 1969 < x < 2831 → k = 10…13 = 4 bars; bars along X (B2) 25 bars @193.25 from 181: 1969 < y < 2631 → k = 10…12 = 3 bars
  expect(st.cut).toEqual({X:3,Y:4});
  const op=r.raw.filter(b=>b.kind==='OP'),ld=devLength(i.detailing,12);
  // per side ⌈4/2⌉ = 2 along Y, ⌈3/2⌉ = 2 along X → 8 trimmers; along Y: 600 + 2 Ld
  expect(op).toHaveLength(8);
  const alongY=op.filter(b=>Math.abs(b.pts[0][0]-b.pts[1][0])<1e-6);expect(alongY).toHaveLength(4);
  for(const b of alongY)expect(Math.abs(b.pts[1][1]-b.pts[0][1])).toBeCloseTo(600+2*ld,6);
  expect(alongY.map(b=>b.pts[0][0]).sort((a,b)=>a-b)).toEqual([2000-31-37,2000-31,2800+31,2800+31+37]);
  expect(r.raw.filter(b=>b.kind==='OD')).toHaveLength(4);
  // cut bars stop at the opening edge + cover (+ d/2)
  const cutY=r.raw.filter(b=>b.kind==='B'&&Math.abs(b.pts[0][0]-b.pts.at(-1)![0])<1e-6&&b.pts[0][0]>1969&&b.pts[0][0]<2831);
  expect(cutY.length).toBe(8);for(const b of cutY)expect([2000-31,2600+31].some(v=>b.pts.some(p=>Math.abs(p[1]-v)<1e-6))).toBe(true);
  const m=apply(i).member;expect(validateMember(m,spec)).toEqual([]);
  expect(m.bars.filter(b=>/-OP\d$/.test(b.mark)).length).toBeGreaterThan(0);expect(m.bars.some(b=>/^S1-OD1$/.test(b.mark))).toBe(true);
 });
 it('≤ 300 deviate: no bar cut, no trimmers; larger openings fall back to cut',()=>{
  const f=cell();f.openings=[opening({x:2000,y:2000,w:250,h:250,trim:{method:'deviate',bars:'area',ext:'ld',diagonal:true,layers:'both'}})];
  const i=floorInput(f),r=floorBars(i,i.detailing);
  expect(r.openings.get('op1')).toMatchObject({cut:{X:0,Y:0},trim:0,diag:0,deviated:true});
  expect(r.raw.every(b=>b.kind==='B'||b.kind==='T')).toBe(true);
  const f2=cell();f2.openings=[opening({x:2000,y:2000,w:400,h:400,trim:{method:'deviate',bars:'area',ext:'ld',diagonal:false,layers:'both'}})];
  const i2=floorInput(f2),r2=floorBars(i2,i2.detailing);expect(r2.openings.get('op1')!.fallback).toBeTruthy();expect(r2.openings.get('op1')!.trim).toBeGreaterThan(0);
 });
});

describe('slab floor: extra top bars',()=>{
 const two=(L:SlabRebarSpec['topExtra'])=>{const f=rebar(grid([0,6000,10500],[0,5000]),{topExtra:L});return floorInput(f);};
 // panels: 150..5850 (5700 × 4700, short 4700) and 6150..10350 (4200 × 4700, short 4200); interior beam B at 5850..6150
 const across=(i:SlabInput)=>floorBars(i,i.detailing).raw.filter(b=>b.kind==='T'&&b.what.includes('แนว B')&&!b.what.includes('คานริม'));
 it('fixed from the face / from the centre',()=>{
  const a=across(two({diameter:12,spacing:200,length:{mode:'fixed',value:1000,from:'face'}}));
  expect(a.length).toBeGreaterThan(0);for(const b of a){expect(b.pts[0][0]).toBeCloseTo(4850,6);expect(b.pts.at(-1)![0]).toBeCloseTo(7150,6);}
  const c=across(two({diameter:12,spacing:200,length:{mode:'fixed',value:1200,from:'centre'}}));
  for(const b of c){expect(b.pts[0][0]).toBeCloseTo(6000-1200,6);expect(b.pts.at(-1)![0]).toBeCloseTo(6000+1200,6);}
 });
 it('L/4 and L/3 use the longer short span of the two panels (4700)',()=>{
  for(const n of [4,3] as const){const a=across(two({diameter:12,spacing:200,length:{mode:'ratio',n}}));
   for(const b of a){expect(b.pts[0][0]).toBeCloseTo(5850-4700/n,6);expect(b.pts.at(-1)![0]).toBeCloseTo(6150+4700/n,6);}}
 });
 it('outer edge: bend down into the edge beam (Shape 11) or U bars',()=>{
  const i=two({diameter:12,spacing:200,length:{mode:'fixed',value:1000,from:'face'}}),r=floorBars(i,i.detailing).raw.filter(b=>b.what.includes('คานริม')&&b.what.includes('แนว A'));
  expect(r.length).toBeGreaterThan(0);for(const b of r){expect(b.pts).toHaveLength(3);expect(b.pts[0][0]).toBeCloseTo(-150+31,6);expect(b.pts[0][2]).toBeLessThan(b.pts[1][2]);}
  const u=floorInput(rebar(grid([0,6000,10500],[0,5000]),{edge:'ubar'})),ru=floorBars(u,u.detailing).raw.filter(b=>b.what.includes('U ปิดขอบ'));
  expect(ru.length).toBeGreaterThan(0);for(const b of ru)expect(b.pts).toHaveLength(4);
  const m=apply(u).member;expect(m.bars.some(b=>b.shapeCode==='21')).toBe(true);expect(validateMember(m,spec)).toEqual([]);
  expect(apply(i).member.bars.some(b=>b.shapeCode==='11')).toBe(true);
 });
});

describe('slab floor: continuity, levels, Marks',()=>{
 it('continuous bottom bars lap at the beams; no bar longer than the stock length',()=>{
  const f=noExtra(grid([0,6000,12000,18000,24000],[0,4000]));
  const i=floorInput(f),m=apply(i).member,stock=i.detailing.stockLength;
  const along=m.bars.filter(b=>b.face==='bottom'&&b.axis==='X');
  expect(along.length).toBeGreaterThan(1);for(const b of m.bars)expect(len(b)).toBeLessThanOrEqual(stock+1e-6);
  // pieces overlap by the lap, centred on a beam centre (grid)
  const xs=along.map(b=>[Math.min(b.points[0][0],b.points.at(-1)![0]),Math.max(b.points[0][0],b.points.at(-1)![0])]).sort((a,b)=>a[0]-b[0]),lap=lapLength(i.detailing,12);
  const shift=-150;expect(xs[1][0]).toBeLessThan(xs[0][1]);expect(xs[0][1]-xs[1][0]).toBeCloseTo(lap,6);
  expect([6000,12000,18000].map(g=>g+shift)).toContainEqual(expect.closeTo((xs[0][1]+xs[1][0])/2,6));
  expect(validateMember(m,spec)).toEqual([]);
 });
 it('lowered panel −50 → crank 1:6 at the beam; −150 → separate bars + anchors (bent into the beam)',()=>{
  const f=grid([0,6000,12000],[0,5000]);f.panels[1]={...f.panels[1],top:-50};
  const i=floorInput(f),raw=floorBars(i,i.detailing).raw;
  const crank=raw.filter(b=>b.kind==='B'&&b.pts.length===4);expect(crank.length).toBeGreaterThan(0);
  for(const b of crank){const dz=Math.abs(b.pts[2][2]-b.pts[1][2]),dx=Math.hypot(b.pts[2][0]-b.pts[1][0],b.pts[2][1]-b.pts[1][1]);expect(dz).toBeCloseTo(50,6);expect(dx).toBeCloseTo(300,6);}
  const m=apply(i).member;expect(m.bars.some(b=>b.shapeCode==='26')).toBe(true);expect(validateMember(m,spec)).toEqual([]);
  const g=grid([0,6000,12000],[0,5000]);g.panels[1]={...g.panels[1],top:-150};
  const j=floorInput(g),raw2=floorBars(j,j.detailing).raw;
  expect(raw2.filter(b=>(b.kind==='B'||b.kind==='T')&&b.pts.some((p,k)=>k>0&&Math.abs(p[2]-b.pts[k-1][2])>1e-6&&Math.abs(p[0]-b.pts[k-1][0])>1e-6)).length).toBe(0);
  const anchors=raw2.filter(b=>b.what.includes('แยกต่างระดับ'));expect(anchors.length).toBeGreaterThan(0);for(const b of anchors)expect(b.pts).toHaveLength(3);
  expect(validateMember(apply(j).member,spec)).toEqual([]);
 });
 it('equal bars of one slab mark share a Mark across panels; a panel with an opening only splits the bars that differ',()=>{
  const f=noExtra(grid([0,5000,10000,15000,20000],[0,5000]));rebar(f,{bottomAtBeam:'stop'});
  const m=apply(floorInput(f)).member,b=m.bars.filter(x=>x.face==='bottom');
  // 4 equal panels 4700 × 4700: one Mark per direction, count = 4 × bars per panel (25 @ ≤ 200 over 4638)
  expect(b.map(x=>x.mark).sort()).toEqual(['S1-B01','S1-B02']);for(const x of b)expect(x.count).toBe(4*25);
  for(const x of b)expect(x.id.startsWith('gen-gS1-')).toBe(true);
  f.openings=[opening({x:7000,y:2000,w:800,h:600})];
  const m2=apply(floorInput(f)).member,b2=m2.bars.filter(x=>x.face==='bottom'&&!/OP|OD/.test(x.mark));
  expect(b2.reduce((n,x)=>n+x.count,0)).toBeGreaterThan(2*4*25-1);
  const full=b2.filter(x=>Math.abs(len(x)-len(b.find(y=>y.axis===x.axis)!))<1e-6);
  // full-length bars: the untouched ones of every panel (the cut ones become own Marks)
  expect(full.reduce((n,x)=>n+x.count,0)).toBe(2*4*25-(3+4));
  expect(validateMember(m2,spec)).toEqual([]);
 });
});

describe('slab floor: drops and sunken areas',()=>{
 const cell=()=>noExtra(grid([0,6000],[0,5000]));
 const drop=(kind:'drop'|'sunken',depth:number,mode:'crank'|'separate')=>({id:'dp1',label:'D-1',kind,outline:[[2000,1500],[3200,1500],[3200,2700],[2000,2700]] as [number,number][],depth,rebar:mode});
 it('drop 150 adds its concrete and a separate bottom mesh; sunken keeps the volume and moves the bars down',()=>{
  const base=takeoff(apply(floorInput(cell())).member,spec).concrete;
  const f=cell();f.drops=[drop('drop',150,'separate')];const m=apply(floorInput(f)).member;
  expect(takeoff(m,spec).concrete).toBeCloseTo(base+1.2*1.2*.15,6);expect(validateMember(m,spec)).toEqual([]);
  expect(m.bars.some(b=>b.note.includes('Drop D-1'))).toBe(true);
  const g=cell();g.drops=[drop('sunken',100,'separate')];const n=apply(floorInput(g)).member;
  expect(takeoff(n,spec).concrete).toBeCloseTo(base,6);expect(validateMember(n,spec)).toEqual([]);
  expect(n.bars.some(b=>b.note.includes('พื้นลดระดับ D-1'))).toBe(true);
 });
 it('drop / sunken ≤ 75 with crank: bars dip 1:6 inside the area',()=>{
  for(const kind of ['drop','sunken'] as const){const f=cell();f.drops=[drop(kind,50,'crank')];const i=floorInput(f),raw=floorBars(i,i.detailing).raw.filter(b=>b.what.includes('คอม้า'));
   expect(raw.length).toBeGreaterThan(0);for(const b of raw){const dz=Math.min(...b.pts.map(p=>p[2]))-Math.max(...b.pts.map(p=>p[2]));expect(dz).toBeCloseTo(-50,6);}
   expect(validateMember(apply(i).member,spec)).toEqual([]);}
 });
});

describe('slab floor: sheets, DXF, backup',()=>{
 const project={id:'p',code:'J-SF',name:'Slab floor ทดสอบ',location:'',owner:'',notes:'',acl:{},version:1,createdAt:'',spec,titleBlock:{company:'FORM',drawnBy:'',checkedBy:'',drawingPrefix:''}} as unknown as Project;
 const member=()=>{const f=grid([0,6000,12000],[0,5000,10000]);f.marks.push({...f.marks[0],name:'S2',thickness:120});f.panels[3]={...f.panels[3],mark:'S2'};f.openings=[opening({x:8000,y:2000,w:800,h:600})];
  return {i:floorInput(f),m:{...apply(floorInput(f)).member,drawingSetup:{number:'',revision:'',title:'',partSheets:'tag' as const}}};};
 it('one sheet set per slab mark + summary; DXF of every page passes the writer checks',()=>{
  const {i,m}=member(),q=takeoff(m,spec);
  const s:SheetData={member:m,rows:q.rows as SheetData['rows'],input:i,project,quantity:1,takeoff:q,status:'DRAFT',revision:'D1',date:'2026-11-05',provisional:false};
  const sets=tagSheetSets(s);
  expect(sets.map(x=>x.scope?.kind==='tag'?x.scope.tag:x.scope?.kind)).toEqual(['S1','S2','summary']);
  const s1=sets[0],s2=sets[1];
  expect(s1.rows.every(r=>r.mark.startsWith('S1-'))).toBe(true);expect(s2.rows.every(r=>r.mark.startsWith('S2-'))).toBe(true);
  expect(s1.rows.length+s2.rows.length).toBe(s.rows.length);
  expect(s1.takeoff.concrete+s2.takeoff.concrete).toBeCloseTo(q.concrete,6);
  const pages=sets.flatMap(x=>Array.from({length:sheetPageCount(x)},(_,p)=>{const info=drawSheetInfo(x,p);return {prims:info.prims,views:info.views,w:info.w,h:info.h,size:info.size};}));
  expect(pages.length).toBeGreaterThanOrEqual(3);
  mkdirSync('output/dxf-verification',{recursive:true});
  for(const mode of ['A','B','C'] as const){const {text,summary}=buildBbsDxf(pages,{mode,cad:defaultCadStandard()});writeFileSync(`output/dxf-verification/slabFloor-${mode}.dxf`,text);
   expect(text.trimEnd().endsWith('EOF')).toBe(true);expect(summary.layouts).toBe(mode==='B'?pages.length:0);expect(text).toContain('S1-B01');}
 });
 it('backup / restore keeps the floor (member schema round trip)',()=>{
  const {m}=member(),back=memberSchema.parse(JSON.parse(JSON.stringify(m)));
  expect((back.elementInput as SlabInput).floor).toEqual((m.elementInput as SlabInput).floor);
  expect(back.shapeModel).toEqual(m.shapeModel);expect(back.bars).toEqual(m.bars);
 });
 it('single slab unchanged by the new layout field',()=>{
  const i=base(),a=apply(i).member,b=apply({...i,layout:'single'}).member;
  expect(a.bars.map(x=>[x.mark,x.count,x.points])).toEqual(b.bars.map(x=>[x.mark,x.count,x.points]));
  expect(a.shapeModel).toBeUndefined();expect(takeoff(a,spec).concrete).toBeCloseTo(6*4*.15,6);
 });
});
