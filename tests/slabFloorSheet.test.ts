// Slab floor BBS sheet (round S2, docs/SLAB_FLOOR.md “Sheets”): bottom / top plans filtered by layer with grids, beams and
// other marks, extra-top-bar dimensions (L/n), sections through the lowered panel / drop, automatic opening details, paper
// views (schedule, legend, key plan, standard details) in the system layout “พื้น” (views first, BBS after), the two
// presentations (per slab mark / whole floor grouped + summary + SF- Marks), Excel sheets, chairs / spacers, CAD layers, DXF.
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {mkdirSync,writeFileSync} from 'node:fs';
import {blankMember,currentStarterSpec,specSchema,type Member,type Project,type Spec} from '../src/domain/model';
import {applyElementInput,defaultElementInput,type SlabInput} from '../src/domain/elementInput';
import {takeoff} from '../src/domain/engine';
import {autoBeams,autoPanels,newSlabFloor,type Floor} from '../src/domain/slabFloor';
import type {FloorOpening} from '../src/domain/slabFloorSchema';
import {tagSheetSets} from '../src/domain/tagSheets';
import {drawSheetInfo,sheetFormat,sheetPageCount,sheetViews,type SheetData} from '../src/domain/bbsSheet';
import {resolveSheetLayout,sheetSections} from '../src/domain/sheetLayout';
import {expandPrims,type Prim} from '../src/domain/drawingPrims';
import {floorCtx,floorDetails,floorPlanScale,floorRowLayer,floorSchedule,floorSystemLayout,mergeFloorMarks,openingDetailNote} from '../src/domain/slabFloorSheet';
import {sheetLayoutSchema} from '../src/domain/sheetLayoutSchema';
import {buildBbsDxf} from '../src/data/dxf';
import {cadStandardOf,cadStandardSchema,defaultCadStandard} from '../src/domain/cadStandard';
import {detailingFromSpec} from '../src/domain/specDetailing';
import {appendSlabFloorSheets} from '../src/data/slabFloorExcel';

const spec:Spec={...currentStarterSpec,designCode:'ACI',rounding:25} as Spec;
const project={id:'p',code:'J-SF',name:'Slab floor ทดสอบ',location:'',owner:'',notes:'',acl:{},version:1,createdAt:'',spec,titleBlock:{company:'FORM',drawnBy:'',checkedBy:'',drawingPrefix:'',sheetSize:'A3'}} as unknown as Project;
const opening=(o:Partial<FloorOpening>&{id:string;x:number;y:number;w:number;h:number}):FloorOpening=>({label:o.id.toUpperCase(),shape:'rect',trim:{method:'cut',bars:'area',ext:'ld',diagonal:true,layers:'both'},...o});
/** 4 × 3 grid: S1 = 4 panels (L/4 extra top bars), S2 = 2 panels, one lowered −50; one opening in S1 */
function floor(patch:(f:Floor)=>void=()=>{}):Floor{
 const f=newSlabFloor();f.gridsX=[0,6000,12000,16500].map((at,k)=>({label:String.fromCharCode(65+k),at}));f.gridsY=[0,5000,10000].map((at,k)=>({label:String(k+1),at}));
 f.beams=autoBeams(f,{mark:'B1',width:300,depth:600});f.panels=autoPanels(f,'S1');
 f.marks[0]={...f.marks[0],rebar:{...f.marks[0].rebar,topExtra:{diameter:12,spacing:200,length:{mode:'ratio',n:4}}}};
 f.marks.push({...f.marks[0],name:'S2',thickness:120});f.panels[3]={...f.panels[3],mark:'S2',top:-50};f.panels[5]={...f.panels[5],mark:'S2'};
 f.openings=[opening({id:'op1',x:8000,y:2000,w:800,h:600})];patch(f);return f;
}
function member(f=floor(),setup:Partial<NonNullable<Member['drawingSetup']>>={},det=defaultElementInput('Slab','manual',spec).detailing){
 const i={...defaultElementInput('Slab','manual',spec),detailing:det,layout:'floor',floor:f} as SlabInput;
 const m0=applyElementInput({...blankMember('Slab','FL2'),version:1,occurrences:[{id:'o1',zone:'',floor:'2',grid:'',quantity:2}]},i,{rounding:25}).member;
 const m:Member={...m0,drawingSetup:{number:'',revision:'',title:'',...setup}};const q=takeoff(m,spec);
 return {m,i,q,s:{member:m,rows:q.rows as SheetData['rows'],input:i,project,quantity:2,takeoff:q,status:'DRAFT',revision:'D1',date:'2026-11-05',provisional:false} as SheetData};
}
const texts=(ps:Prim[])=>expandPrims(ps).flatMap(p=>p.t==='text'?[p.text]:[]);
const pagesOf=(s:SheetData)=>Array.from({length:sheetPageCount(s)},(_,p)=>drawSheetInfo(s,p));

describe('slab floor sheet: views',()=>{
 it('system layout “พื้น”: A2, drawing sheet first (plans, sections, opening detail, paper views), BBS tables after',()=>{
  const {s}=member();
  expect(sheetFormat(s).size).toBe('A2');expect(sheetFormat(s).layout).toBe('split');
  const r=resolveSheetLayout(s,'A2');expect(r.from).toBe('system');expect(sheetLayoutSchema.safeParse(r.layout).success).toBe(true);
  const p=pagesOf(tagSheetSets(s)[0]);
  expect(p[0].views.map(v=>v.key).sort()).toEqual(['det:op-op1','plan-bottom','plan-top','sec:def-x','sec:def-y']);
  expect(p[0].paper?.map(x=>x.key)).toEqual(['schedule','legend','keyplan','stddet']);
  expect(texts(p[1].prims).some(t=>/BAR BENDING SCHEDULE/.test(t))).toBe(true);
  // boxes inside the drawing area, no overlaps
  const boxes=[...p[0].views.map(v=>v.box),...p[0].paper!.map(x=>x.box)];
  for(const [i,a] of boxes.entries())for(const b of boxes.slice(i+1))expect(a.x+a.w<=b.x+.01||b.x+b.w<=a.x+.01||a.y+a.h<=b.y+.01||b.y+b.h<=a.y+.01).toBe(true);
 });
 it('bottom plan shows only bottom bars, top plan only top bars; one representative bar + label per Mark per panel',()=>{
  const {s,m}=member(),info=drawSheetInfo(tagSheetSets(s)[0],0),bot=info.views.find(v=>v.key==='plan-bottom')!.data!,top=info.views.find(v=>v.key==='plan-top')!.data!;
  expect(bot.bars.length).toBeGreaterThan(0);expect(bot.bars.every(b=>floorRowLayer(b.row)==='bottom')).toBe(true);
  expect(top.bars.every(b=>floorRowLayer(b.row)==='top')).toBe(true);
  // S1-B01 spans several panels → one entry (drawn bar + distribution line) per panel it lies in
  const by=new Map<string,typeof bot.bars>();for(const b of bot.bars)by.set(b.row.id,[...(by.get(b.row.id)||[]),b]);
  const multi=[...by.values()].filter(l=>l.length>1);expect(multi.length).toBeGreaterThan(0);for(const l of multi)expect(new Set(l.map(b=>b.part)).size).toBe(l.length);
  expect(bot.bars.filter(b=>b.dist).every(b=>b.lines.length<=3)).toBe(true);
  // grids with bubbles, beams, the S2 panels faded on the S1 sheet of the per-mark set
  expect(bot.floor!.grids.map(g=>g.label)).toEqual(['A','B','C','D','1','2','3']);expect(bot.floor!.beams).toHaveLength(floorCtx(m)!.beams.length);
  const t=texts(info.prims);expect(t).toEqual(expect.arrayContaining(['A','D','3']));expect(t.some(x=>/^S1-B01 DB12@\d+ \(B[12]\)$/.test(x))).toBe(true);
  // bars on their own CAD layers
  expect(expandPrims(info.prims).some(p=>p.layer==='barTop')).toBe(true);expect(expandPrims(info.prims).some(p=>p.layer==='barBottom')).toBe(true);
 });
 it('extra top bars: real dimensions past the beam faces, L/4 on the projections',()=>{
  const {s}=member(),info=drawSheetInfo(tagSheetSets(s)[0],0),dims=info.prims.filter(p=>p.t==='dim'&&p.key?.startsWith('fdim:'));
  expect(dims.length).toBeGreaterThan(0);
  const l4=dims.filter(p=>p.t==='dim'&&p.text==='<> (L/4)');expect(l4.length).toBeGreaterThan(1);
  // L/4 of the longer clear short span 4,700 = 1,175 (S1 rule)
  expect(l4.some(p=>p.t==='dim'&&Math.abs(p.value-1175)<1)).toBe(true);
 });
 it('default sections pass through the lowered panel (crank shown), cropped around it; a drop wins',()=>{
  const {s}=member(),secs=sheetSections(s,'A2').sections;
  expect(secs.map(x=>x.id)).toEqual(['def-x','def-y']);expect(secs[0].extent).toBeDefined();
  const views=sheetViews(s);expect(views.find(v=>v.key==='sec:def-x')!.title).toMatch(/พื้นลดระดับ/);
  const withDrop=member(floor(f=>{f.drops=[{id:'d1',label:'DP1',kind:'drop',outline:[[1500,1500],[3000,1500],[3000,3000],[1500,3000]],depth:150,rebar:'separate'}];}));
  expect(sheetViews(withDrop.s).find(v=>v.key==='sec:def-y')!.title).toMatch(/Drop DP1/);
  const c=floorCtx(withDrop.m)!,secX=sheetSections(withDrop.s,'A2').sections[0];expect(secX.position).toBeCloseTo(2250+c.shift[1],0);
 });
 it('opening detail: automatic Detail view D1 at 1:20 when it fits, cut / trimmer / diagonal note, D1 bubble on the top plan',()=>{
  const {s,m}=member(),d=floorDetails(m);
  expect(d).toEqual([expect.objectContaining({id:'op-op1',label:'D1',parent:'plan-top',circle:false})]);
  const note=openingDetailNote(m,'op-op1');expect(note[1]).toMatch(/แนว X \d+ เส้น · แนว Y \d+ เส้น/);expect(note[2]).toMatch(/เหล็กเสริมขอบ \d+ เส้น ยื่นเลยมุม Ld \d+ · ทแยง 4 เส้น/);
  const info=drawSheetInfo(tagSheetSets(s)[0],0),t=texts(info.prims);
  expect(t.some(x=>/รูปขยายช่องเปิด OP1/.test(x))).toBe(true);expect(t).toContain('D1');
  const det=info.views.find(v=>v.key==='det:op-op1')!;expect(det.data!.bars.some(b=>b.lines.length>0)).toBe(true);expect(det.n).toBeGreaterThan(0);
 });
 it('slab schedule rows, legend with warnings (a mark without top bars), key plan',()=>{
  const {s,m}=member(floor(f=>{f.marks[1]={...f.marks[1],rebar:{...f.marks[1].rebar,topExtra:undefined}};}));
  const rows=floorSchedule(floorCtx(m)!,['S1','S2']);
  expect(rows[0]).toMatchObject({mark:'S1',thickness:'150',shortBottom:'DB12@200',extra:'DB12@200 L/4'});expect(rows[1].thickness).toBe('120 (−50)');
  const t=texts(drawSheetInfo(tagSheetSets(s)[0],0).prims);
  expect(t).toEqual(expect.arrayContaining(['ตารางพื้น (Slab Schedule)','สัญลักษณ์','Key plan','รายละเอียดมาตรฐาน','• เบอร์พื้น S2: ไม่มีเหล็กบนเลย']));
 });
 it('many openings: details that do not fit sheet 1 go to the next sheets',()=>{
  const f=floor(f=>{f.openings=[600,2600,6600,8600,12600,14600].map((x,k)=>opening({id:`op${k+1}`,x,y:7000,w:400,h:400}));});
  const {m}=member(f),l=floorSystemLayout(m,'A2','def-x','def-y'),dets=l.sheets.flatMap(sh=>sh.views.filter(v=>v.view.startsWith('det:')));
  expect(dets).toHaveLength(6);expect(l.sheets.length).toBeGreaterThan(1);expect(sheetLayoutSchema.safeParse(l).success).toBe(true);
 });
});

describe('slab floor sheet: presentations',()=>{
 it('per slab mark: one set per mark (sheet + BBS) titled “แบบเหล็กเสริมพื้น S1 · ชั้น 2”, other marks faded',()=>{
  const {s}=member(undefined,{partSheets:'tag'}),sets=tagSheetSets(s);
  expect(sets.map(x=>x.floor?.marks.join()||x.scope?.kind)).toEqual(['S1','S2','summary']);
  const p=pagesOf(sets[1]);expect(texts(p[0].prims).some(t=>t.includes('แบบเหล็กเสริมพื้น S2 · ชั้น 2'))).toBe(true);
  const bot=p[0].views.find(v=>v.key==='plan-bottom')!.data!;expect(bot.floor!.faded).toHaveLength(4);expect(bot.bars.every(b=>b.row.mark.startsWith('S2-'))).toBe(true);
 });
 it('whole floor: one set, BBS grouped by slab mark (header rows), steel summary page per mark × size + total',()=>{
  const {s}=member(),sets=tagSheetSets(s);expect(sets).toHaveLength(1);expect(sets[0].floor).toMatchObject({mode:'floor',marks:['S1','S2']});
  const p=pagesOf(sets[0]),all=p.flatMap(x=>texts(x.prims));
  expect(all.some(t=>t==='เบอร์พื้น S1')).toBe(true);expect(all.some(t=>t==='เบอร์พื้น S2')).toBe(true);
  const last=texts(p.at(-1)!.prims);expect(last.some(t=>/สรุปน้ำหนักเหล็ก ต่อเบอร์พื้น × ขนาด/.test(t))).toBe(true);
  const kg=s.rows.reduce((t,r)=>t+r.weight,0)*2;expect(last).toContain(kg.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
 });
 it('whole floor with picked marks: concrete / bars of those marks only',()=>{
  const {s}=member(undefined,{partTags:['S2']}),[set]=tagSheetSets(s);
  expect(set.floor!.marks).toEqual(['S2']);expect(set.rows.every(r=>r.mark.startsWith('S2-'))).toBe(true);
  expect(set.takeoff.concrete).toBeLessThan(s.takeoff.concrete);
 });
 it('merge equal Marks across marks: SF-nn, where used, weights unchanged',()=>{
  const {s}=member(undefined,{floorMerge:true}),[set]=tagSheetSets(s);
  const sf=set.rows.filter(r=>r.mark.startsWith('SF-'));expect(sf.length).toBeGreaterThan(0);
  expect(sf.every(r=>r.uses!.length>=2)).toBe(true);expect(set.rows.reduce((t,r)=>t+r.weight,0)).toBeCloseTo(s.rows.reduce((t,r)=>t+r.weight,0),6);
  expect(mergeFloorMarks(s.rows).map(r=>r.id)).toEqual(s.rows.map(r=>r.id));
  expect(pagesOf(set).flatMap(x=>texts(x.prims)).some(t=>/ใช้ใน S1 × \d+ · S2 × \d+/.test(t))).toBe(true);
 });
 it('a floor whose plans get less than 1:100 on A2 goes on A1 (whole floor and per-mark sets); single slabs keep the project paper',()=>{
  const big=member(floor(f=>{f.gridsX=[0,8000,16000,24000,32000].map((at,k)=>({label:String.fromCharCode(65+k),at}));f.beams=autoBeams(f,{mark:'B1',width:300,depth:600});f.panels=autoPanels(f,'S1');f.openings=[];}));
  expect(sheetFormat(big.s).size).toBe('A1');expect(sheetFormat({...big.s,member:{...big.m,drawingSetup:{number:'',revision:'',title:'',partSheets:'tag'}}}).size).toBe('A1');
  expect(floorPlanScale(big.m,'A2')).toBeGreaterThan(100);expect(floorPlanScale(big.m,'A1')).toBeLessThan(floorPlanScale(big.m,'A2'));expect(sheetFormat(member().s).size).toBe('A2');
  const single={...blankMember('Slab','S9'),elementInput:defaultElementInput('Slab','manual',spec)};expect(sheetFormat({project,member:single}).size).toBe('A3');
 });
});

describe('slab floor sheet: outputs and options',()=>{
 it('DXF A / B / C of every page (B = one viewport per placed view), layers S-REBR-BOTM / S-REBR-TOPP',()=>{
  const {s}=member(),pages=pagesOf(tagSheetSets(s)[0]).map(i=>({prims:i.prims,views:i.views,w:i.w,h:i.h,size:i.size}));
  mkdirSync('output/dxf-verification',{recursive:true});
  for(const mode of ['A','B','C'] as const){const {text,summary}=buildBbsDxf(pages,{mode,cad:defaultCadStandard()});writeFileSync(`output/dxf-verification/slabFloorSheet-${mode}.dxf`,text);
   expect(text.trimEnd().endsWith('EOF')).toBe(true);expect(summary.layers).toEqual(expect.arrayContaining(['S-REBR-BOTM','S-REBR-TOPP']));
   if(mode==='B')expect((text.match(/\nVIEWPORT\r?\n/g)||[]).length).toBeGreaterThanOrEqual(5);}
 });
 it('CAD standard saved before S2 still parses; barBottom / barTop fall back to the barMain layer',()=>{
  const d=defaultCadStandard(),{barBottom:_b,barTop:_t,...old}=d.layers,stored={...d,layers:old};
  expect(cadStandardSchema.safeParse(stored).success).toBe(true);
  const c=cadStandardOf({cadStandard:stored});expect(c.layers.barBottom.name).toBe('S-REBR-MAIN');expect(c.layers.barTop.name).toBe('S-REBR-MAIN');
  expect(cadStandardSchema.safeParse(c).success).toBe(true);expect(cadStandardOf({}).layers.barTop.name).toBe('S-REBR-TOPP');
 });
 it('chairs / spacers: off by default (no items, detailing unchanged); on → BOQ items by panel area, steel unchanged',()=>{
  const base=defaultElementInput('Slab','manual',spec).detailing;expect(base.slabAccessories).toBeUndefined();
  const off=member();expect((off.m.siteWork?.items||[]).some(it=>it.id.startsWith('gen-slab-'))).toBe(false);
  const acc={chair:{enabled:true,diameter:12,shape:'U' as const,perM2:1},spacer:{enabled:true,perM2:4}},sp=specSchema.parse({...spec,slabAccessories:acc});
  const det=detailingFromSpec(sp,base,{category:'Slab'});expect(det.slabAccessories).toEqual(acc);expect(detailingFromSpec(spec,det,{category:'Slab'}).slabAccessories).toBeUndefined();
  const on=member(undefined,{},det),items=on.m.siteWork!.items,area=floorCtx(on.m)!.panels.reduce((t,p)=>t+p.area,0)/1e6;
  expect(items.map(i=>i.id)).toEqual(['gen-slab-chair','gen-slab-chair-kg','gen-slab-spacer']);
  expect(items[0].quantity).toBe(Math.ceil(area));expect(items[2].quantity).toBe(Math.ceil(area*4));
  expect(on.q.rebar).toBeCloseTo(off.q.rebar,6);expect(on.q.concrete).toBeCloseTo(off.q.concrete,6);
 });
 it('Excel: “Slab BBS” grouped by slab mark and “Slab Summary” per mark × size, after the other sheets',async()=>{
  const {m,q}=member(),{default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();wb.addWorksheet('BBS');
  appendSlabFloorSheets(wb,[m],()=>({rows:q.rows as never,quantity:2}));
  expect(wb.worksheets.map(w=>w.name)).toEqual(['BBS','Slab BBS','Slab Summary']);
  const sum=wb.getWorksheet('Slab Summary')!,total=sum.getRow(sum.rowCount).values as unknown[];
  expect(total[2]).toBe('TOTAL');expect(Number(total.at(-1))).toBeCloseTo(q.rows.reduce((t,r)=>t+r.weight,0)*2,6);
  expect(wb.getWorksheet('Slab BBS')!.getColumn(2).values.filter(v=>v==='S2').length).toBeGreaterThan(1);
 });
});
