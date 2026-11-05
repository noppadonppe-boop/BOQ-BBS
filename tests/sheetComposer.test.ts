// Sheet Composer: default sections = old cuts, drawingViews v1 → v2, layout boxes / projection lock, templates
// (proportional cuts, smaller scale + warning), section snaps / depth / look, layout checks, DXF B viewports, restore.
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {mkdirSync,writeFileSync} from 'node:fs';
import {drawSheet,drawSheetInfo,layoutPage,sheetArea,sheetPageCount,sheetViews,type SheetData} from '../src/domain/bbsSheet';
import {buildView,columnSectionCut,defaultCuts} from '../src/domain/elementViews';
import {drawingViewProblems,drawingViewsSchema,migrateDrawingViews,nextSectionLabel,type SheetSection} from '../src/domain/drawingViews';
import {DEFAULT_SECTION_IDS,defaultSections,layoutBoxProblems,resolveSheetLayout,sectionSnaps,sectionSpec,sheetSections,snapModelPoint,templateFrom,templateLayout} from '../src/domain/sheetLayout';
import {sheetLayoutSchema,projectSheetTemplatesSchema,type SheetLayout} from '../src/domain/sheetLayoutSchema';
import {memberSchema} from '../src/domain/model';
import {restoredSheetTemplates} from '../src/domain/restorePreflight';
import {buildBbsDxf} from '../src/data/dxf';
import {expandPrims} from '../src/domain/drawingPrims';
import {footingData,sheetFixtures} from './fixtures/sheets';

const withMember=(s:SheetData,patch:Partial<SheetData['member']>):SheetData=>({...s,member:{...s.member,...patch}});
const v2=(sections:SheetSection[])=>({version:2 as const,primaryPlane:'XY' as const,basis:'test',sections});
const at=(v:{origin:{sheet:[number,number];model:[number,number]};s:number},u:number)=>v.origin.sheet[0]+(u-v.origin.model[0])*v.s;

describe('sections',()=>{
 it('default sections derive the old cuts (X–X / Y–Y / Z–Z)',()=>{
  for(const sets of Object.values(sheetFixtures()))for(const s of sets){const d=defaultSections(s.member,s.input,s.rows),c=defaultCuts(s.member,s.rows),z=columnSectionCut(s.input,s.rows);
   expect(d.find(x=>x.id===DEFAULT_SECTION_IDS.x)).toMatchObject({axis:'Y',position:c.y,label:'X-X'});expect(d.find(x=>x.id===DEFAULT_SECTION_IDS.y)).toMatchObject({axis:'X',position:c.x,label:'Y-Y'});
   expect(d.find(x=>x.id===DEFAULT_SECTION_IDS.z)?.position).toBe(z?.z);
   expect(sheetSections(s,'A3')).toEqual({sections:d,from:'default'});}
 });
 it('a member with v1 drawing views keeps the old sheet; v1 → v2 keeps every cut',()=>{
  const s=footingData(2400,2400),v1={version:1 as const,primaryPlane:'XY' as const,basis:'แบบ S-01',sections:[{id:'a1',label:'A-A',axis:'Y' as const,position:600}]};
  expect(drawingViewsSchema.safeParse(v1).success).toBe(true);
  expect(expandPrims(drawSheet(withMember(s,{drawingViews:v1})))).toEqual(expandPrims(drawSheet(s)));
  const m=migrateDrawingViews(v1,defaultSections(s.member,s.input,s.rows));
  expect(m.version).toBe(2);expect(m.basis).toBe('แบบ S-01');expect(m.sections.find(x=>x.id==='a1')).toMatchObject({label:'A-A',axis:'Y',position:600,source:'user'});
  expect(m.sections.map(x=>x.label)).toEqual(['X-X','Y-Y','Z-Z','A-A']);
  expect(drawingViewsSchema.safeParse(m).success).toBe(true);
 });
 it('schema rejects duplicate labels / planes; positions past the member are problems',()=>{
  const d=defaultSections(footingData(2400,2400).member,undefined,[]);
  expect(drawingViewsSchema.safeParse(v2([...d,{id:'u1',label:'X-X',axis:'Y',position:10}])).success).toBe(false);
  expect(drawingViewsSchema.safeParse(v2([...d,{id:'u1',label:'A-A',axis:'Y',position:d[0].position}])).success).toBe(false);
  expect(drawingViewsSchema.safeParse(v2(Array.from({length:13},(_,i)=>({id:`u${i}`,label:`S${i}`,axis:'Y' as const,position:i*10})))).success).toBe(false);
  const s=footingData(2400,2400);expect(drawingViewProblems({...s.member,drawingViews:v2([{id:'u1',label:'A-A',axis:'X',position:5000}])})).toHaveLength(1);
  expect(nextSectionLabel([{label:'X-X'},{label:'A-A'}])).toBe('B-B');
 });
 it('snap on a bar line gives its exact coordinate; depth filters bars; look mirrors',()=>{
  const s=footingData(2400,2400),snaps=sectionSnaps(s.member,s.rows,[0,1]),bar=snaps.find(x=>x.label.startsWith('แนวเหล็ก')&&x.axis===0)!;
  expect(bar).toBeTruthy();const r=snapModelPoint(snaps,bar.at+3.2,500,10);expect(r.u).toBe(bar.at);expect(r.labelU).toContain('แนวเหล็ก');
  const cut=s.member.y/2,lines=(depth?:number,look?:'+'|'-')=>buildView(s.member,s.rows,s.input,sectionSpec({id:'t',label:'T',axis:'Y',position:cut,look,depth})).bars.reduce((n,b)=>n+b.lines.length,0);
  expect(lines(s.member.y/2+10)).toBeGreaterThan(lines());
  expect(lines(1)).toBeLessThanOrEqual(lines(s.member.y));
  const a=buildView(s.member,s.rows,s.input,sectionSpec({id:'t',label:'T',axis:'Y',position:cut})),b=buildView(s.member,s.rows,s.input,sectionSpec({id:'t',label:'T',axis:'Y',position:cut,look:'-'}));
  expect(b.flip).toBe(true);const dot=a.bars.find(x=>x.dots.length)!.dots[0],mir=b.bars[a.bars.findIndex(x=>x.dots.length)].dots.find(d=>Math.abs(d[1]-dot[1])<1e-6&&Math.abs(d[0]-(a.u[0]+a.u[1]-dot[0]))<1e-6);
  expect(mir).toBeTruthy();
 });
});

const box=(view:string,x:number,y:number,w:number,h:number,n:number|'auto'='auto',more={})=>({view,x,y,w,h,n,...more});
describe('layout',()=>{
 it('projection lock: same model x on the same sheet x as the plan (≤ 0.01 mm), also after dragging',()=>{
  const s=footingData(2400,2400);
  for(const dx of [0,17.3,-9]){const layout:SheetLayout={version:1,unplaced:[],sheets:[{id:'s1',views:[box('plan',30,30,170,120,40),box(`sec:${DEFAULT_SECTION_IDS.x}`,30+dx,155,170,110,40,{lock:{to:'plan',axis:'x'}})]}]};
   expect(sheetLayoutSchema.safeParse(layout).success).toBe(true);
   const i=drawSheetInfo(withMember(s,{sheetLayout:layout}),0),p=i.views.find(v=>v.key==='plan')!,x=i.views.find(v=>v.key===`sec:${DEFAULT_SECTION_IDS.x}`)!;
   expect(x.lockNote).toBeUndefined();for(const u of [0,600,1200,2400])expect(Math.abs(at(p,u)-at(x,u))).toBeLessThan(.01);}
 });
 it('different scales lock the centre lines with a note',()=>{
  const s=footingData(2400,2400),layout:SheetLayout={version:1,unplaced:[],sheets:[{id:'s1',views:[box('plan',30,30,170,120,40),box(`sec:${DEFAULT_SECTION_IDS.x}`,50,155,120,110,50,{lock:{to:'plan',axis:'x'}})]}]};
  const i=drawSheetInfo(withMember(s,{sheetLayout:layout}),0),p=i.views.find(v=>v.key==='plan')!,x=i.views.find(v=>v.key!=='plan')!;
  expect(x.lockNote).toContain('กึ่งกลาง');expect(x.box.x+x.box.w/2).toBeCloseTo(p.box.x+p.box.w/2,6);
 });
 it('overlapping / off-sheet / keep-out boxes are rejected; the schema refuses a view placed twice',()=>{
  const s=footingData(2400,2400),{area,keep}=sheetArea(s);
  expect(layoutBoxProblems([box('plan',30,30,150,100),box('sec:def-x',100,60,100,100)],area,keep).some(p=>p.includes('ซ้อน'))).toBe(true);
  expect(layoutBoxProblems([box('plan',-5,30,150,100)],area,keep).some(p=>p.includes('นอก'))).toBe(true);
  expect(layoutBoxProblems([box('plan',30,30,150,100),box('sec:def-x',300,30,60,60)],area,keep).some(p=>p.includes('ตาราง'))).toBe(true);
  expect(layoutBoxProblems([box('plan',30,30,150,100),box('sec:def-x',30,140,150,100)],area,keep)).toEqual([]);
  expect(sheetLayoutSchema.safeParse({version:1,unplaced:[],sheets:[{id:'s1',views:[box('plan',30,30,50,50)]},{id:'s2',views:[box('plan',30,30,50,50)]}]}).success).toBe(false);
 });
 it('a layout written out from the automatic sheet draws the same views (title, scale, box)',()=>{
  for(const [name,sets] of Object.entries(sheetFixtures())){if(name==='beam'||name==='column')continue;const s=sets[0],sheets:SheetLayout['sheets']=[],keys=new Set<string>();
   for(let p=0;p<sheetPageCount(s);p++){const i=drawSheetInfo(s,p),views=i.views.filter(v=>v.key).map(v=>({view:v.key!,...v.box,n:'auto' as const}));if(i.notes&&!keys.has('notes')&&sheetArea(s).notes)views.push({view:'notes',...i.notes,n:'auto'});if(views.length){views.forEach(v=>keys.add(v.view));sheets.push({id:`s${sheets.length}`,views});}}
   const c=withMember(s,{sheetLayout:{version:1,sheets,unplaced:[]}}),list=(d:SheetData)=>[...Array(sheetPageCount(d)).keys()].flatMap(p=>drawSheetInfo(d,p).views.map(v=>[v.title,v.n,v.box]));
   expect(list(c),name).toEqual(list(s));}
 });
 it('unknown keys are skipped; notes drawn where placed; extra sheets add pages',()=>{
  const s=footingData(2400,2400),layout:SheetLayout={version:1,unplaced:[],sheets:[{id:'s1',views:[box('plan',30,30,170,120),box('notes',30,160,170,120),box('sec:gone',210,30,60,60)]},{id:'s2',views:[box(`sec:${DEFAULT_SECTION_IDS.y}`,30,30,200,150)]}]};
  const d=withMember(s,{sheetLayout:layout});expect(sheetPageCount(d)).toBe(2);
  const i0=drawSheetInfo(d,0),i1=drawSheetInfo(d,1);
  expect(i0.views.map(v=>v.key)).toEqual(['plan']);expect(i0.notes).toMatchObject({x:30,y:160});expect(i1.views.map(v=>v.key)).toEqual([`sec:${DEFAULT_SECTION_IDS.y}`]);expect(i1.notes).toBeUndefined();
  expect(memberSchema.safeParse(d.member).success).toBe(true);
 });
});

describe('templates',()=>{
 it('saved on a 2,100 × 1,050 footing, used on 3,600 × 2,400: cut at the same fraction, smaller scale with a warning',()=>{
  const small=footingData(2100,1050),user:SheetSection={id:'u1',label:'A-A',axis:'X',position:700,look:'-',source:'user'};
  const secs=[...defaultSections(small.member,small.input,small.rows),user];
  const layout:SheetLayout={version:1,unplaced:[],sheets:[{id:'s1',views:[box('plan',25,30,170,110,25),box('sec:def-x',25,150,170,90,25,{lock:{to:'plan',axis:'x'}}),box('sec:u1',200,30,80,110,25),box('notes',200,150,80,135)]}]};
  const smallData=withMember(small,{sheetLayout:layout,drawingViews:v2(secs)});
  expect(drawSheetInfo(smallData,0).views.find(v=>v.key==='plan')!.fits).toBe(true);
  const tpl=templateFrom({id:'t1',name:'ฐานรากมาตรฐาน',category:'Foundation',size:'A3'},layout,secs,small.member);
  expect(tpl.sections).toEqual([{role:'user-1',label:'A-A',axis:'X',at:700/2100,look:'-'}]);expect(tpl.sheets[0].views.map(v=>v.view)).toEqual(['plan','sec-x','user-1','notes']);
  const sheetTemplates=projectSheetTemplatesSchema.parse({version:1,templates:[tpl],defaults:[{category:'Foundation',id:'t1'}]});
  const big=footingData(3600,2400,{project:{sheetTemplates}});
  const secsBig=sheetSections(big,'A3');expect(secsBig.from).toBe('template');expect(secsBig.sections.find(x=>x.id==='tpl-1')).toMatchObject({axis:'X',position:1200,look:'-'});
  const r=resolveSheetLayout(big,'A3');expect(r.from).toBe('template');expect(r.layout!.sheets[0].views.map(v=>v.view)).toEqual(['plan','sec:def-x','sec:tpl-1','notes']);
  const i=drawSheetInfo(big,0),plan=i.views.find(v=>v.key==='plan')!;expect(plan.fits).toBe(false);expect(plan.n).toBeGreaterThan(25);
  expect(i.scales.some(v=>!v.fits)).toBe(true);
  // the plan shows the A–A cut with its sheet number
  expect(expandPrims(i.prims).some(p=>p.t==='text'&&p.text==='A'&&p.view===plan.id)).toBe(true);
  expect(templateLayout(tpl,secsBig.sections)).toEqual(r.layout);
 });
 it('restore keeps project templates; member layout passes the member schema',()=>{
  const sheetTemplates={version:3,templates:[],defaults:[]};
  expect(restoredSheetTemplates({project:{sheetTemplates}} as never)).toEqual({sheetTemplates});
  expect(restoredSheetTemplates({project:{}} as never)).toEqual({});
 });
});

describe('DXF mode B with a composed layout',()=>{
 it('one viewport per placed view at its box',()=>{
  const s=footingData(2400,2400),layout:SheetLayout={version:1,unplaced:[],sheets:[{id:'s1',views:[box('plan',30,30,170,120,40),box('sec:def-x',30,155,170,110,40,{lock:{to:'plan',axis:'x'}}),box('notes',210,30,90,150)]},{id:'s2',views:[box('sec:def-y',30,30,200,150,25),box('sec:def-z',240,30,100,100,15)]}]};
  const d=withMember(s,{sheetLayout:layout}),pages=Array.from({length:sheetPageCount(d)},(_,p)=>drawSheetInfo(d,p)),{text,summary}=buildBbsDxf(pages.map(i=>({prims:i.prims,views:i.views,w:i.w,h:i.h,size:i.size})),{mode:'B'});
  const placed=pages.flatMap(i=>i.views);expect(placed).toHaveLength(4);expect(summary.viewports).toBe(4);
  const l=text.split('\r\n'),vps:number[][]=[];for(let k=0;k<l.length-1;k+=2)if(l[k]==='0'&&l[k+1]==='VIEWPORT'){const get=(c:number)=>{for(let j=k+2;j<l.length-1;j+=2){if(l[j]==='0')break;if(Number(l[j])===c)return Number(l[j+1]);}return NaN;};if(get(69)!==1)vps.push([get(10),get(20),get(40),get(41),get(45)]);}
  // layout 1 = *Paper_Space (ENTITIES), later layouts are blocks written before it: match by the box
  for(const v of placed){const hit=vps.find(([cx,cy,w,h])=>Math.abs(cx-(v.box.x+v.box.w/2))<1e-4&&Math.abs(cy-(297-(v.box.y+v.box.h/2)))<1e-4&&Math.abs(w-v.box.w)<1e-4&&Math.abs(h-v.box.h)<1e-4);
   expect(hit,v.title).toBeTruthy();expect(hit![4]/hit![3]).toBeCloseTo(v.n,6);}
  mkdirSync('output/dxf-verification',{recursive:true});writeFileSync('output/dxf-verification/composed-B.dxf',text);
  expect(layoutPage(d,1)).toBe(1);expect(sheetViews(d).map(v=>v.key)).toEqual(['plan','sec:def-x','sec:def-y','sec:def-z']);
 });
});
