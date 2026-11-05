import type {Member,Vec3} from './model';
import {elementInputSchema,lapLength,type SlabInput} from './elementInput';
import {devLength,floorBars,floorBeamRects,floorShapeModel,groupFloorBars,inRing,panelThickness,polyArea,type Floor,type OpeningStat} from './slabFloor';
import {normaliseShape} from './shapeGeometry';
import {shapeModelSchema} from './shapeModelSchema';
import {sheetSizes,type SheetSize} from './drawingStandard';
import {topExtraText} from './slabWallTemplates';
import type {PlainPrim} from './drawingPrims';
import type {SheetLayout,ViewKey} from './sheetLayoutSchema';
import type {DetailView} from './drawingEdits';

// Slab floor BBS sheet (round S2, docs/SLAB_FLOOR.md “Sheets”): member coordinates of the floor (grids, beams, panels,
// openings, drops), bar roles by layer (B1 / B2 / T / OP / OD from the S1 bar ids and notes), default sections through the
// representative panel / drop, automatic opening details, the paper views (slab schedule, legend, key plan, standard details)
// and the system layout “พื้น (Slab Floor)”. Free of bbsSheet / elementViews imports (both import this module).
type P2=[number,number];
type Box={x:number;y:number;w:number;h:number};
export type FloorPanelView={id:string;mark:string;tag:string;ring:P2[];top:number;thickness:number;box:{x0:number;y0:number;x1:number;y1:number};area:number};
export type FloorCtx={input:SlabInput;f:Floor;shift:Vec3;panels:FloorPanelView[];
 beams:{id:string;mark:string;along:'X'|'Y';x0:number;y0:number;x1:number;y1:number;depth:number}[];
 /** axis 0 = line of constant x (grid X), 1 = constant y */
 grids:{axis:0|1;label:string;at:number}[];
 openings:{id:string;label:string;x0:number;y0:number;x1:number;y1:number;circle:boolean;panel?:string}[];
 drops:{id:string;label:string;kind:'drop'|'sunken';ring:P2[];depth:number;panel?:string}[];
 extent:{x0:number;y0:number;x1:number;y1:number}};
const inputs=new WeakMap<object,SlabInput|null>(),ctxs=new WeakMap<object,FloorCtx|null>(),stats=new WeakMap<object,ReturnType<typeof floorBars>|null>();
/** Parsed slab-floor input of a member (Slab layout floor with panels), cached per elementInput object. */
export function floorInputOf(m:Pick<Member,'elementInput'|'category'>):SlabInput|undefined{
 const raw=m.elementInput as {category?:string;layout?:string;floor?:{panels?:unknown[]}}|undefined;
 if(m.category!=='Slab'||raw?.category!=='Slab'||raw.layout!=='floor'||!raw.floor?.panels?.length)return;
 if(!inputs.has(raw)){const r=elementInputSchema.safeParse(raw);inputs.set(raw,r.success&&r.data.category==='Slab'&&r.data.floor?r.data:null);}
 return inputs.get(raw)||undefined;
}
const boxOf=(r:P2[])=>({x0:Math.min(...r.map(p=>p[0])),y0:Math.min(...r.map(p=>p[1])),x1:Math.max(...r.map(p=>p[0])),y1:Math.max(...r.map(p=>p[1]))});
const centroid=(r:P2[]):P2=>[r.reduce((t,p)=>t+p[0],0)/r.length,r.reduce((t,p)=>t+p[1],0)/r.length];
/** Floor geometry in member coordinates (the shape model is normalised on apply: shift = `normaliseShape().shift`). */
export function floorCtx(m:Pick<Member,'elementInput'|'category'>):FloorCtx|undefined{
 const input=floorInputOf(m);if(!input)return;const raw=m.elementInput as object;
 if(ctxs.has(raw))return ctxs.get(raw)||undefined;
 let ctx:FloorCtx|null=null;
 try{
  const f=input.floor!,{shift}=normaliseShape(shapeModelSchema.parse(floorShapeModel(input))),T=(p:P2):P2=>[p[0]+shift[0],p[1]+shift[1]];
  const panels=f.panels.map(p=>{const ring=(p.outline as P2[]).map(T);return {id:p.id,mark:p.mark,tag:p.tag,ring,top:p.top+shift[2],thickness:panelThickness(f,p),box:boxOf(ring),area:polyArea(ring)};});
  const host=(c:P2)=>panels.find(p=>inRing(c,p.ring))?.id;
  const beams=floorBeamRects(f).map(r=>({id:r.beam.id,mark:r.beam.mark,along:r.beam.along,x0:r.x0+shift[0],y0:r.y0+shift[1],x1:r.x1+shift[0],y1:r.y1+shift[1],depth:r.beam.depth}));
  const openings=f.openings.map(o=>{const x0=o.x+shift[0],y0=o.y+shift[1],x1=x0+o.w,y1=y0+(o.shape==='circle'?o.w:o.h);return {id:o.id,label:o.label||o.id,x0,y0,x1,y1,circle:o.shape==='circle',panel:o.panel||host([(x0+x1)/2,(y0+y1)/2])};});
  const drops=f.drops.map(d=>{const ring=(d.outline as P2[]).map(T);return {id:d.id,label:d.label||d.id,kind:d.kind,ring,depth:d.depth,panel:host(centroid(ring))};});
  const pts=[...panels.flatMap(p=>p.ring),...beams.flatMap(b=>[[b.x0,b.y0],[b.x1,b.y1]] as P2[])];
  const extent=pts.length?{x0:Math.min(...pts.map(p=>p[0])),y0:Math.min(...pts.map(p=>p[1])),x1:Math.max(...pts.map(p=>p[0])),y1:Math.max(...pts.map(p=>p[1]))}:{x0:0,y0:0,x1:1,y1:1};
  const grids=[...f.gridsX.map(g=>({axis:0 as const,label:g.label,at:g.at+shift[0]})),...f.gridsY.map(g=>({axis:1 as const,label:g.label,at:g.at+shift[1]}))];
  ctx={input,f,shift,panels,beams,grids,openings,drops,extent};
 }catch{ctx=null;}
 ctxs.set(raw,ctx);return ctx||undefined;
}
/** Bars + opening statistics of the floor (S1 `floorBars`), cached per input. */
export function floorStats(m:Pick<Member,'elementInput'|'category'>){
 const input=floorInputOf(m);if(!input?.detailing)return;const raw=m.elementInput as object;
 if(!stats.has(raw)){try{stats.set(raw,floorBars(input,input.detailing));}catch{stats.set(raw,null);}}
 return stats.get(raw)||undefined;
}
const spacings=new WeakMap<object,Map<string,number>>();
/** Design spacing (mm, as specified) of each generated floor bar set (id → spacing); the drawn spacing can be smaller
 * (bars spread evenly, count rounded up: the same rule as a single slab). Labels show this value. */
export function floorDesignSpacing(m:Pick<Member,'elementInput'|'category'>):Map<string,number>{
 const raw=m.elementInput as object|undefined,c=floorCtx(m),st=floorStats(m);if(!raw||!c||!st||!c.input.detailing)return new Map();
 if(!spacings.has(raw)){const map=new Map<string,number>();try{groupFloorBars(c.input,c.input.detailing,st.raw,c.shift,map);}catch{/* labels fall back to the drawn spacing */}spacings.set(raw,map);}
 return spacings.get(raw)!;
}
/** Spread spacing of a floor bar set as drawn (evenly spaced bars along one plan axis), else undefined. */
export function floorActualSpacing(r:{paths:Vec3[][]}){
 const pts=r.paths.map(p=>p[0]).filter(Boolean);if(pts.length<2)return;
 const ax=[0,1].map(k=>Math.max(...pts.map(p=>p[k]))-Math.min(...pts.map(p=>p[k]))),k=ax[0]>=ax[1]?0:1,o=1-k;
 if(ax[o]>2)return;const vs=pts.map(p=>p[k]).sort((a,b)=>a-b),s=(vs.at(-1)!-vs[0])/(vs.length-1);
 return vs.every((v,i)=>!i||Math.abs(v-vs[i-1]-s)<2)?s:undefined;
}
/** BBS note when bars are spread closer than designed (count rounded up over the span): “ระยะจริง @195 (แบบ @200)”. */
export function floorSpacingNote(m:Pick<Member,'elementInput'|'category'>,r:{id:string;paths:Vec3[][]}){
 const d=floorDesignSpacing(m).get(r.id),a=floorActualSpacing(r);
 return d&&a&&d-a>=1?`ระยะจริง @${Math.floor(a)} (แบบ @${d})`:undefined;
}
export type FloorKind='B'|'T'|'OP'|'OD';
export type FloorRole='B1'|'B2'|'T'|'OP'|'OD';
/** Kind of a generated floor bar from its id (`gen-<owner>-b01` / `-t01` / `-op01` / `-od01`). */
export const floorKind=(id:string):FloorKind|undefined=>{const k=id.match(/^gen-.+-(b|t|op|od)\d+$/)?.[1];return k?k.toUpperCase() as FloorKind:undefined;};
/** layer token of the bar note (`B1 · …`, `T1/B1 · …` for U bars) */
export const floorLayerToken=(note:string)=>note.split(' · ')[0]||'';
export function floorRole(r:{id:string;note:string}):FloorRole|undefined{
 const k=floorKind(r.id);if(!k)return;
 return k==='B'?floorLayerToken(r.note)==='B2'?'B2':'B1':k;
}
/** Plan of a floor bar: bottom (B, OP / OD in a bottom layer) or top (T incl. extras / U bars, OP / OD in a top layer). */
export function floorRowLayer(r:{id:string;note:string}):'bottom'|'top'|undefined{
 const k=floorKind(r.id);if(!k)return;
 if(k==='B')return 'bottom';if(k==='T')return 'top';
 return floorLayerToken(r.note).startsWith('T')?'top':'bottom';
}
export const isTopExtra=(r:{id:string;note:string})=>floorKind(r.id)==='T'&&/บนเสริมที่คาน/.test(r.note);
/** Colours by layer (legend of the slab sheet). */
export const floorRoleColors:Record<FloorRole,string>={B1:'#1d4ed8',B2:'#0891b2',T:'#c2410c',OP:'#7c3aed',OD:'#db2777'};
export const floorRoleNames:Record<FloorRole,string>={B1:'เหล็กล่าง B1 (ชั้นนอก)',B2:'เหล็กล่าง B2 (ชั้นใน)',T:'เหล็กบน / บนเสริม (T1 / T2)',OP:'เหล็กเสริมขอบช่องเปิด',OD:'เหล็กทแยงมุมช่องเปิด'};
/** Mark colours of a floor sheet: by layer. */
export function floorColors(rows:{id:string;note:string}[]){return new Map(rows.map(r=>[r.id,floorRoleColors[floorRole(r)||'B1']]));}
/** Slab mark (เบอร์พื้น) of a floor bar row (`S1-B01` → S1; merged `SF-…` rows carry `slab`). */
export const slabMarkOf=(r:{mark:string;slab?:string})=>r.slab||r.mark.replace(/-(B|T|OP|OD)\d+$/,'');
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const barText=(b:{diameter:number;spacing:number})=>b.spacing>0&&b.diameter>0?`${barName(b.diameter)}@${b.spacing}`:'–';

/** Slab marks shown on a sheet: panels still solid in the member's shape model (sheet sets per mark turn the others into
 * references), else every mark. */
export function floorFocus(m:Member):string[]{
 const c=floorCtx(m);if(!c)return [];
 const solid=new Set((m.shapeModel?.parts||[]).filter(p=>p.role==='solid').map(p=>p.id)),marks=c.panels.filter(p=>!m.shapeModel||solid.has(p.id)).map(p=>p.mark);
 return [...new Set(marks.length?marks:c.panels.map(p=>p.mark))];
}
/** Representative panel of the sheet (largest focused panel, a panel holding a drop / sunken area first) and the point the
 * default sections X–X / Y–Y pass through (the drop's centre when there is one). */
export function floorSectionCuts(m:Member){
 const c=floorCtx(m);if(!c)return;const focus=new Set(floorFocus(m)),mine=c.panels.filter(p=>focus.has(p.mark));if(!mine.length)return;
 const withDrop=mine.find(p=>c.drops.some(d=>d.panel===p.id)),lowered=mine.filter(p=>Math.abs(p.top-c.shift[2])>.5).sort((a,b)=>b.area-a.area)[0],p=withDrop||lowered||[...mine].sort((a,b)=>b.area-a.area)[0];
 const d=withDrop?c.drops.find(x=>x.panel===p.id):undefined;let at:P2=d?centroid(d.ring):centroid(p.ring);
 if(!inRing(at,p.ring)){const b=p.box;at=[(b.x0+b.x1)/2,(b.y0+b.y1)/2];}
 return {panel:p.tag,x:at[0],y:at[1],extentX:floorSectionExtent(c,p.box,0),extentY:floorSectionExtent(c,p.box,1),through:d?(d.kind==='drop'?`Drop ${d.label}`:`พื้นลดระดับ ${d.label}`):p===lowered?`พื้นลดระดับ ${p.tag}`:`แผง ${p.tag}`};
}
/** Extension of the opening trimmers past the corners (mm). */
function openingExt(c:FloorCtx,o:Floor['openings'][number],d:number){
 const det=c.input.detailing;if(!det)return 600;
 return o.trim.ext==='ld'?devLength(det,d):o.trim.ext==='lap'?lapLength(det,d):o.trim.ext;
}
/** Automatic opening details (one per opening of the focused panels, Detail view mechanism `det:op-<id>`, parent = top plan). */
export function floorDetails(m:Member):DetailView[]{
 const c=floorCtx(m);if(!c)return [];const focus=new Set(floorFocus(m)),out:DetailView[]=[];
 c.openings.forEach(o=>{const p=c.panels.find(x=>x.id===o.panel);if(!p||!focus.has(p.mark))return;const fo=c.f.openings.find(x=>x.id===o.id)!;
  if(fo.trim.method==='none')return;const mk=c.f.marks.find(x=>x.name===p.mark),d=mk?.rebar.shortBottom.diameter||12,ext=openingExt(c,fo,d);
  // window: the opening + Ld (extension) + one bar spacing (focus, `openingDetailFocus`) + one more spacing of faded mesh
  const s=Math.max(mk?.rebar.shortBottom.spacing||0,mk?.rebar.longBottom.spacing||0)||200,r=Math.min(20000,Math.max(o.x1-o.x0,o.y1-o.y0)/2+ext+2*s);
  out.push({id:`op-${o.id}`.slice(0,40),label:`D${out.length+1}`,parent:'plan-top',u:(o.x0+o.x1)/2,v:(o.y0+o.y1)/2,r,circle:false});});
 return out;
}
export const isAutoDetail=(id:string)=>id.startsWith('op-');
/** Note lines of an opening detail: cut bars, trimmers, diagonals, extension. */
export function openingDetailNote(m:Member,detailId:string):string[]{
 const c=floorCtx(m),st=floorStats(m);if(!c)return [];const o=c.f.openings.find(x=>`op-${x.id}`.slice(0,40)===detailId);if(!o)return [];
 const s:OpeningStat|undefined=st?.openings.get(o.id),p=c.panels.find(x=>x.id===(o.panel||c.openings.find(q=>q.id===o.id)?.panel)),mk=p&&c.f.marks.find(x=>x.name===p.mark),d=mk?.rebar.shortBottom.diameter||12;
 const ext=openingExt(c,o,d),extText=o.trim.ext==='ld'?`Ld ${ext}`:o.trim.ext==='lap'?`ระยะทาบ ${ext}`:`${ext}`;
 return [`ช่องเปิด ${o.label||o.id} ${o.shape==='circle'?`Ø${o.w}`:`${o.w} × ${o.h}`} mm${p?` · แผง ${p.tag}`:''}`,
  ...(s?[o.trim.method==='deviate'&&s.deviated?'เหล็กเบี่ยงหลบช่องเปิด (≤ 300 mm)':`เหล็กถูกตัด แนว X ${s.cut.X} เส้น · แนว Y ${s.cut.Y} เส้น`,
   `เหล็กเสริมขอบ ${s.trim} เส้น ยื่นเลยมุม ${extText}${s.diag?` · ทแยง ${s.diag} เส้น`:''} · +${s.kg.toFixed(1)} kg`]:[]),...(s?.fallback?[s.fallback]:[])];
}
/** Focus region of an opening detail (member mm): the opening + Ld (trimmer extension) + one bar spacing; bars outside are faded. */
export function openingDetailFocus(m:Member,detailId:string){
 const c=floorCtx(m);if(!c)return;const o=c.openings.find(x=>`op-${x.id}`.slice(0,40)===detailId),fo=c.f.openings.find(x=>x.id===o?.id);if(!o||!fo)return;
 const p=c.panels.find(x=>x.id===o.panel),mk=p&&c.f.marks.find(x=>x.name===p.mark),d=mk?.rebar.shortBottom.diameter||12;
 const r=openingExt(c,fo,d)+(Math.max(mk?.rebar.shortBottom.spacing||0,mk?.rebar.longBottom.spacing||0)||200);
 return {x0:o.x0-r,y0:o.y0-r,x1:o.x1+r,y1:o.y1+r};
}
/** Paper views of a floor sheet (ViewKeys placed by the Composer, drawn on paper: no model scale). */
export const FLOOR_PAPER=['schedule','legend','keyplan','stddet'] as const;
export type FloorPaperKey=typeof FLOOR_PAPER[number];
export const floorPaperTitles:Record<FloorPaperKey,string>={schedule:'ตารางพื้น (Slab Schedule)',legend:'สัญลักษณ์',keyplan:'Key plan',stddet:'รายละเอียดมาตรฐาน'};
export const isFloorPaper=(k:string):k is FloorPaperKey=>(FLOOR_PAPER as readonly string[]).includes(k);
/** Slab schedule rows of the marks (thickness with the lowered level, bottom / top short / long, extra top bars). */
export function floorSchedule(c:FloorCtx,marks:string[]){
 return c.f.marks.filter(mk=>marks.includes(mk.name)).map(mk=>{const ps=c.panels.filter(p=>p.mark===mk.name),low=[...new Set(c.f.panels.filter(p=>p.mark===mk.name&&p.top<0).map(p=>p.top))];
  const r=mk.rebar;return {mark:mk.name,thickness:`${mk.thickness}${low.length?` (${low.map(t=>`−${Math.abs(t)}`).join(', ')})`:''}${mk.support==='ground'?' S.O.G':''}`,
   shortBottom:barText(r.shortBottom),longBottom:barText(r.longBottom),shortTop:barText(r.shortTop),longTop:barText(r.longTop),extra:topExtraText(r.topExtra),panels:ps.length,
   edge:r.edge==='ubar'?'U':'งอ'};});
}
/** Warnings of a floor sheet: marks without top bars, openings cutting more than half of a panel's bars (S1). */
export function floorSheetWarnings(m:Member,marks:string[]){
 const c=floorCtx(m);if(!c)return [];const out:string[]=[];
 for(const mk of c.f.marks.filter(x=>marks.includes(x.name))){const r=mk.rebar;if(!(r.shortTop.spacing>0)&&!(r.longTop.spacing>0)&&!(r.topExtra?.spacing&&r.topExtra.diameter))out.push(`เบอร์พื้น ${mk.name}: ไม่มีเหล็กบนเลย`);}
 const tags=new Set(c.panels.filter(p=>marks.includes(p.mark)).map(p=>p.tag));
 for(const w of floorStats(m)?.warnings||[])if(/ครึ่ง/.test(w)&&(![...tags].length||[...tags].some(t=>w.includes(t))||!/แผง/.test(w)))out.push(w);
 return out;
}
const PALETTE=[['#99f6e4','#0f766e'],['#fde68a','#b45309'],['#c7d2fe','#4338ca'],['#fbcfe8','#be185d'],['#bbf7d0','#15803d'],['#fed7aa','#c2410c'],['#e9d5ff','#7e22ce'],['#bae6fd','#0369a1']];
/** Key plan colours per slab mark (whole floor sheets). */
export const markFill=(c:FloorCtx,mark:string)=>PALETTE[Math.max(0,c.f.marks.findIndex(x=>x.name===mark))%PALETTE.length];

type TextOpt={size?:number;color?:string;anchor?:'start'|'middle'|'end';bold?:boolean};
/** Drawing of a paper view into its box (sheet mm). `focus` = slab marks of the sheet, `byMark` = key plan coloured per mark. */
export function drawFloorPaper(key:FloorPaperKey,box:Box,m:Member,o:{focus:string[];byMark:boolean;roles:FloorRole[];warnings:string[];lang:string}):PlainPrim[]{
 const c=floorCtx(m),out:PlainPrim[]=[],ink='#22393f';if(!c)return out;
 const tx=(t:string,x:number,y:number,p:TextOpt={})=>out.push({t:'text',x,y,text:t,size:p.size??2.3,color:p.color||ink,anchor:p.anchor,bold:p.bold,layer:'text'});
 const ln=(x1:number,y1:number,x2:number,y2:number,stroke='#9fb2ad',width=.2,dash?:number[],layer:PlainPrim['layer']='titleBlock')=>out.push({t:'line',x1,y1,x2,y2,stroke,width,dash,layer});
 out.push({t:'rect',x:box.x,y:box.y,w:box.w,h:box.h,stroke:'#c8d5d0',width:.2,layer:'titleBlock'});
 tx(floorPaperTitles[key],box.x+2,box.y+4.5,{size:3,bold:true});
 const top=box.y+7;
 if(key==='schedule'){
  const rows=floorSchedule(c,o.focus),cols=[['เบอร์',.09],['หนา',.13],['ล่างสั้น',.13],['ล่างยาว',.13],['บนสั้น',.13],['บนยาว',.13],['บนเสริม',.26]] as const,rh=Math.min(6,Math.max(3.6,(box.h-14)/Math.max(1,rows.length+1)));
  out.push({t:'rect',x:box.x+1,y:top,w:box.w-2,h:rh,fill:'#203940',layer:'titleBlock'});
  let x=box.x+1;const W=box.w-2,fs=Math.min(2.3,rh*.5);for(const [t,f] of cols){tx(t,x+1,top+rh*.68,{size:fs,color:'#ffffff'});x+=W*f;}
  rows.forEach((r,i)=>{const y=top+rh*(i+1);if(y+rh>box.y+box.h-1)return;x=box.x+1;
   [r.mark,r.thickness,r.shortBottom,r.longBottom,r.shortTop,r.longTop,r.extra].forEach((v,j)=>{tx(v,x+1,y+rh*.68,{size:j===6?Math.min(fs,1.9):fs,bold:j===0});x+=W*cols[j][1];});
   ln(box.x+1,y+rh,box.x+box.w-1,y+rh);});
  x=box.x+1;for(const [,f] of cols.slice(0,-1)){x+=W*f;ln(x,top,x,top+rh*(rows.length+1));}
  tx('มิติ mm · หนา (ลดระดับ) · บนเสริม = ขนาด@ระยะ + ความยาว / L/n ของช่วงสั้นที่ยาวกว่า',box.x+2,Math.min(box.y+box.h-1.5,top+rh*(rows.length+1)+3.5),{size:1.8,color:'#4b6166'});
 }
 if(key==='legend'){
  let y=top+3;const item=(draw:()=>void,t:string)=>{if(y>box.y+box.h-2)return;draw();tx(t,box.x+18,y+.8,{size:2.2});y+=4.4;};
  for(const r of o.roles)item(()=>out.push({t:'line',x1:box.x+3,y1:y,x2:box.x+15,y2:y,stroke:floorRoleColors[r],width:.7,layer:r==='T'?'barTop':'barBottom'}),floorRoleNames[r]);
  item(()=>out.push({t:'rect',x:box.x+3,y:y-1.6,w:12,h:3.2,stroke:'#475569',width:.3,dash:[1.2,.8],layer:'concreteHidden'}),'คานอ้างอิง (ไม่คิดปริมาณในสมาชิกพื้น)');
  item(()=>{out.push({t:'line',x1:box.x+3,y1:y,x2:box.x+15,y2:y,stroke:'#7c8b8f',width:.25,dash:[3,1,.6,1],layer:'symbol'});},'แนวกริด');
  item(()=>{out.push({t:'rect',x:box.x+3,y:y-1.6,w:12,h:3.2,fill:'#f1f5f9',stroke:'#cbd5e1',width:.2,layer:'concreteHidden'});},'แผงเบอร์อื่น (แสดงอ้างอิง)');
  item(()=>{out.push({t:'line',x1:box.x+3,y1:y,x2:box.x+15,y2:y,stroke:'#475569',width:.3,layer:'dim'},{t:'circle',cx:box.x+9,cy:y,r:.6,fill:'#475569',layer:'dim'});},'เหล็กตัวแทน + เส้นช่วงกระจาย (1 เส้นต่อ Mark ต่อแผง)');
  if(o.warnings.length){y+=1;tx('ข้อควรตรวจ',box.x+2,y,{size:2.4,bold:true,color:'#b03a2e'});y+=3.6;for(const w of o.warnings){if(y>box.y+box.h-1.5)break;tx(`• ${w}`.slice(0,Math.floor(box.w/1.05)),box.x+2,y,{size:1.9,color:'#b03a2e'});y+=3;}}
 }
 if(key==='keyplan'){
  const e=c.extent,ax=box.x+3,ay=top+1,aw=box.w-6,ah=box.h-14,s=Math.min(aw/Math.max(1,e.x1-e.x0),ah/Math.max(1,e.y1-e.y0)),ox=ax+(aw-(e.x1-e.x0)*s)/2,oy=ay+(ah-(e.y1-e.y0)*s)/2;
  const X=(x:number)=>ox+(x-e.x0)*s,Y=(y:number)=>oy+(e.y1-y)*s,focus=new Set(o.focus);
  for(const b of c.beams)out.push({t:'rect',x:X(b.x0),y:Y(b.y1),w:(b.x1-b.x0)*s,h:(b.y1-b.y0)*s,stroke:'#94a3b8',width:.15,layer:'concreteHidden'});
  for(const p of c.panels){const on=focus.has(p.mark),[fill,stroke]=on?o.byMark?markFill(c,p.mark):['#99f6e4','#0f766e']:['#f1f5f9','#cbd5e1'];
   out.push({t:'poly',pts:p.ring.map(q=>[X(q[0]),Y(q[1])] as P2),closed:true,fill,stroke,width:.25,layer:'concrete'});
   const [cx,cy]=centroid(p.ring),pw=(p.box.x1-p.box.x0)*s;if(pw>6)tx(p.tag,X(cx),Y(cy)+.6,{size:Math.min(2,pw/6),anchor:'middle',color:on?ink:'#94a3b8'});}
  for(const op of c.openings)out.push({t:'rect',x:X(op.x0),y:Y(op.y1),w:(op.x1-op.x0)*s,h:(op.y1-op.y0)*s,fill:'#ffffff',stroke:ink,width:.2,layer:'concrete'});
  const counts=o.focus.map(mk=>`${mk} = ${c.panels.filter(p=>p.mark===mk).length} แผง`).join(' · ');
  tx(`${counts}${c.f.level!==undefined?` · ระดับ ${c.f.level>=0?'+':''}${c.f.level.toFixed(3)}`:''}`.slice(0,140),box.x+2,box.y+box.h-2.5,{size:2,color:'#4b6166'});
 }
 if(key==='stddet')drawStdDetails(out,box,c,o.focus,tx,ln);
 return out;
}
/** Parametric standard details (values of the project: covers, lap, Ld): outer edge (bend / U), laps at the beam, drop, lowered slab. */
function drawStdDetails(out:PlainPrim[],box:Box,c:FloorCtx,focus:string[],tx:(t:string,x:number,y:number,p?:TextOpt)=>void,ln:(x1:number,y1:number,x2:number,y2:number,stroke?:string,width?:number,dash?:number[],layer?:PlainPrim['layer'])=>void){
 const det=c.input.detailing,marks=c.f.marks.filter(x=>focus.includes(x.name)),mk=marks[0]||c.f.marks[0];if(!mk)return;
 const d=mk.rebar.shortBottom.diameter||12,lap=det?lapLength(det,d):40*d,ld=det?devLength(det,d):Math.max(300,30*d),cv=c.input.cover,t=mk.thickness;
 const ubar=marks.some(x=>x.rebar.edge==='ubar'),bend=marks.some(x=>x.rebar.edge!=='ubar');
 const items:{title:string;draw:(b:Box)=>void}[]=[];
 const conc=(x:number,y:number,w:number,h:number)=>out.push({t:'rect',x,y,w,h,fill:'#e9efec',stroke:'#51706a',width:.3,layer:'concrete'});
 const bar=(pts:P2[],color:string,top=false)=>out.push({t:'poly',pts,closed:false,stroke:color,width:.45,layer:top?'barTop':'barBottom'});
 const note=(s:string,x:number,y:number,color='#3b4a55')=>tx(s,x,y,{size:1.8,color});
 items.push({title:`ขอบพื้นริมนอก (${[bend?'งอฉาก':'',ubar?'U':''].filter(Boolean).join(' / ')})`,draw:b=>{
  const sh=b.h*.22,y0=b.y+b.h*.3,bw=b.w*.22,bx=b.x+b.w-bw-3;conc(b.x+3,y0,b.w-6-bw,sh);conc(bx,y0,bw,b.h*.55);
  const yt=y0+sh*.25,yb=y0+sh*.75;bar([[b.x+5,yb],[bx+bw-2,yb]],floorRoleColors.B1);
  if(ubar&&!bend)bar([[bx-b.w*.18,yt],[bx+bw-2,yt],[bx+bw-2,yb],[bx-b.w*.18,yb]],floorRoleColors.T,true);
  else bar([[b.x+5,yt],[bx+bw-2,yt],[bx+bw-2,y0+b.h*.45]],floorRoleColors.T,true);
  note(`C บน ${cv.top} · ล่าง ${cv.bottom} · ขอบ ${cv.edge}`,b.x+3,b.y+b.h-6);note(ubar&&!bend?'U bar ปิดขอบ (Shape 21)':`งอฉากลงคานริม (Shape 11) ขา ≤ 12d = ${12*d}`,b.x+3,b.y+b.h-3);}});
 items.push({title:'ระยะทาบ / ตำแหน่งทาบที่คาน',draw:b=>{
  const sh=b.h*.2,y0=b.y+b.h*.3,bw=b.w*.18,bx=b.x+(b.w-bw)/2;conc(b.x+3,y0,b.w-6,sh);conc(bx,y0+sh,bw,b.h*.3);
  const yb=y0+sh*.72,half=Math.min(b.w*.35,(b.w-10)/2);bar([[b.x+5,yb],[b.x+b.w/2+half*.45,yb]],floorRoleColors.B1);bar([[b.x+b.w/2-half*.45,yb+.9],[b.x+b.w-5,yb+.9]],floorRoleColors.B1);
  ln(b.x+b.w/2-half*.45,yb+3,b.x+b.w/2+half*.45,yb+3,'#3f5459',.2,undefined,'dim');note(`ทาบ ${lap}`,b.x+b.w/2,yb+5.5);
  note(`เหล็กล่างต่อเนื่อง ทาบกึ่งกลางคาน · ยาวไม่เกินเหล็กเส้น · Ld = ${ld}`,b.x+3,b.y+b.h-3);}});
 if(c.drops.some(x=>x.kind==='drop'))items.push({title:'Drop panel',draw:b=>{
  const sh=b.h*.2,y0=b.y+b.h*.28;conc(b.x+3,y0,b.w-6,sh);conc(b.x+b.w*.3,y0+sh,b.w*.4,b.h*.18);
  bar([[b.x+5,y0+sh*.72],[b.x+b.w-5,y0+sh*.72]],floorRoleColors.B1);bar([[b.x+b.w*.3+2,y0+sh+b.h*.13],[b.x+b.w*.7-2,y0+sh+b.h*.13]],floorRoleColors.B2);
  note('Drop: ตะแกรงล่างของ Drop เอง (หรือดัดคอม้า 1:6 ถ้าลึก ≤ 75)',b.x+3,b.y+b.h-3);}});
 if(c.drops.some(x=>x.kind==='sunken')||c.f.panels.some(p=>p.top<0))items.push({title:'พื้นลดระดับ',draw:b=>{
  const sh=b.h*.2,y0=b.y+b.h*.28,step=b.h*.08,xm=b.x+b.w/2;conc(b.x+3,y0,xm-b.x-3,sh);conc(xm,y0+step,b.x+b.w-3-xm,sh);
  bar([[b.x+5,y0+sh*.72],[xm-4,y0+sh*.72],[xm+4,y0+step+sh*.72],[b.x+b.w-5,y0+step+sh*.72]],floorRoleColors.B1);
  note('ต่างระดับ ≤ 75: ดัดคอม้า 1:6 (Shape 26) · > 75: แยกเหล็ก + ยึด Ld',b.x+3,b.y+b.h-6);note(`Ld = ${ld} · หนา ${t}`,b.x+3,b.y+b.h-3);}});
 // grid whose cells come closest to 2 : 1 (sketches are wide)
 const n=items.length,g=2,W=box.w-4,Hh=box.h-9,cols=[...Array(n).keys()].map(k=>k+1).reduce((best,k)=>{const r=Math.ceil(n/k),q=((W-(k-1)*g)/k)/((Hh-(r-1)*g)/r),qb=((W-(best-1)*g)/best)/((Hh-(Math.ceil(n/best)-1)*g)/Math.ceil(n/best));return Math.abs(Math.log(q/2))<Math.abs(Math.log(qb/2))?k:best;},1);
 const rows=Math.ceil(n/cols),cw=(W-(cols-1)*g)/cols,ch=(Hh-(rows-1)*g)/rows;
 items.forEach((it,i)=>{const b={x:box.x+2+(i%cols)*(cw+g),y:box.y+7+Math.floor(i/cols)*(ch+g),w:cw,h:ch};out.push({t:'rect',x:b.x,y:b.y,w:b.w,h:b.h,fill:'#f8fafc',stroke:'#cbd5e1',width:.2,layer:'titleBlock'});tx(it.title,b.x+1.5,b.y+3.5,{size:2,bold:true});it.draw(b);});
}
/** Drawing area of a view sheet of the split layout (title band 15 mm on top, title strip 12 mm at the bottom) — the same
 * frame as `bbsSheet.ts` (left 20, margin 10). */
export function floorDrawArea(size:SheetSize){const p=sheetSizes[size];return {x:22,y:27,w:p.w-10-2-22,h:p.h-10-12-2-27};}
// view box → drawing room: title 4 mm + renderView margins 2 × 12.5 mm (+ 2 mm spare)
const ROOM_W=27,ROOM_H=31;
const PLAN_SCALES=[50,75,100,125,150,200,250,300,400,500,750,1000];
/** Plan span of the floor views (grids run 900 past the outer beams). */
function planSpan(c:FloorCtx){return {u:c.extent.x1-c.extent.x0+1800,v:c.extent.y1-c.extent.y0+1800};}
/** Boxes of the slab floor sheet 1 (artboard 10, S2.1): right column = schedule (rows) + legend (items) + key plan (¼) +
 * standard details (rest); left = bottom | top plan at the largest standard scale that fits (1:100 or better on A2,
 * else A1), sections X–X | Y–Y, opening details at 1:20. */
function floorFrame(m:Member,size:SheetSize){
 const c=floorCtx(m),a=floorDrawArea(size),g=3,colR=Math.round(a.w*.22),wl=a.w-colR-g,pw=(wl-g)/2,sp=c?planSpan(c):{u:10000,v:10000};
 const n=PLAN_SCALES.find(n=>sp.u/n+ROOM_W<=pw&&sp.v/n+ROOM_H<=a.h*.55)??PLAN_SCALES.at(-1)!;
 const h1=Math.round(Math.min(a.h*.55,Math.max(a.h*.3,sp.v/n+ROOM_H+2)));
 return {a,g,colR,wl,pw,n,h1,xr:a.x+wl+g};
}
/** Plan scale of the floor views on a paper size (bottom / top plans side by side, see `floorFrame`). */
export const floorPlanScale=(m:Member,size:SheetSize)=>floorFrame(m,size).n;
/** Size (sheet mm, square) a Detail view needs at 1:n. */
const detailSide=(r:number,n:number)=>Math.ceil(2*r/n+ROOM_W+2);
/** Section crop of the default floor sections: the cut panel + the beams on both sides + 1,200 of the neighbours. */
export function floorSectionExtent(c:FloorCtx,box:{x0:number;y0:number;x1:number;y1:number},axis:0|1):[number,number]{
 const lo=axis===0?box.x0:box.y0,hi=axis===0?box.x1:box.y1,bw=Math.max(0,...c.beams.map(b=>Math.min(b.x1-b.x0,b.y1-b.y0))),pad=bw+1200,e=c.extent;
 return [Math.max(axis===0?e.x0:e.y0,lo-pad),Math.min(axis===0?e.x1:e.y1,hi+pad)];
}
/** System layout “พื้น (Slab Floor)” (artboard 10, S2.1). Sheet 1: plans | right column (schedule sized to its rows, compact
 * legend, key plan ≈ ¼ of the column, standard details in the rest); sections X–X | Y–Y (1:25 when they fit); opening
 * details at 1:20 in the last row — when the row cannot hold them they move to the next sheets at 1:20 (never scaled down). */
export function floorSystemLayout(m:Member,size:SheetSize,secX?:string,secY?:string):SheetLayout{
 const c=floorCtx(m),F=floorFrame(m,size),{a,g,colR,wl,pw,h1,xr}=F,focus=floorFocus(m);
 // right column
 const rows=c?floorSchedule(c,focus).length:1,hs=Math.round(Math.min(a.h*.3,7+6*(rows+1)+7));
 const warn=floorSheetWarnings(m,focus).length,hl=Math.round(Math.min(a.h*.3,12+9*4.4+(warn?6+3*warn:0)+6));
 const hk=Math.round(a.h*.25),hd=a.h-hs-hl-hk-3*g;
 const views:SheetLayout['sheets'][number]['views']=[
  {view:'plan-bottom',x:a.x,y:a.y,w:pw,h:h1,n:'auto'},{view:'plan-top',x:a.x+pw+g,y:a.y,w:pw,h:h1,n:'auto'},
  {view:'schedule',x:xr,y:a.y,w:colR,h:hs,n:'auto'},{view:'legend',x:xr,y:a.y+hs+g,w:colR,h:hl,n:'auto'},
  {view:'keyplan',x:xr,y:a.y+hs+hl+2*g,w:colR,h:hk,n:'auto'}];
 const stdInCol=hd>=60;if(stdInCol)views.push({view:'stddet',x:xr,y:a.y+hs+hl+hk+3*g,w:colR,h:hd,n:'auto'});
 // below the plans: opening details at 1:20 (square, stacked in a column at the right when they fit the height, never
 // scaled down — else on the next sheets) and the sections X–X / Y–Y stacked in the rest (1:25 when the crop fits)
 const dets=floorDetails(m),sides=dets.map(d=>detailSide(d.r,20)),below=a.h-h1-g,y2=a.y+h1+g,first:number[]=[];
 let used=0,colW=0;for(const [i,sd] of sides.entries()){if(used+sd<=below&&Math.max(colW,sd)<=wl*.45){first.push(i);used+=sd+g;colW=Math.max(colW,sd);}}
 let dy=y2;for(const i of first){views.push({view:`det:${dets[i].id}` as ViewKey,x:a.x+wl-colW,y:dy,w:sides[i],h:sides[i],n:20});dy+=sides[i]+g;}
 const rest=dets.filter((_,i)=>!first.includes(i)),sw=wl-(colW?colW+g:0);
 // standard details: in the column when it has room, else under the sections
 const hstd=stdInCol?0:Math.min(80,Math.round(below*.35)),hsec=(below-hstd-(hstd?g:0)-g)/2;
 if(!stdInCol)views.push({view:'stddet',x:a.x,y:y2+2*(hsec+g),w:sw,h:hstd,n:'auto'});
 const fc=c?floorSectionCuts(m):undefined,depth=Math.max(0,...(c?.beams||[]).map(b=>b.depth))+300;
 // + 24 mm: level marks (T.O.S. +3.500) right of the concrete
 const secN=(axis:0|1)=>{if(!fc)return 'auto' as const;const [lo,hi]=axis===0?fc.extentX:fc.extentY;return (hi-lo)/25+ROOM_W+24<=sw&&depth/25+ROOM_H+12<=hsec?25 as const:'auto' as const;};
 if(secX)views.push({view:`sec:${secX}` as ViewKey,x:a.x,y:y2,w:sw,h:hsec,n:secN(0)});
 if(secY)views.push({view:`sec:${secY}` as ViewKey,x:a.x,y:y2+hsec+g,w:sw,h:hsec,n:secN(1)});
 // details that do not fit sheet 1: next sheets, packed in rows at 1:20 (a detail larger than the drawing area: the largest scale that fits)
 const sheets:SheetLayout['sheets']=[{id:'s1',views}];let sh:SheetLayout['sheets'][number]|undefined,cx=0,cy=0,rowH=0;
 for(const d of rest){const n=detailSide(d.r,20)<=Math.min(a.w,a.h)?20 as const:'auto' as const,sd=Math.min(detailSide(d.r,20),a.w,a.h);
  if(!sh||cx+sd>a.x+a.w){cx=a.x;cy+=rowH+(sh?g:0);rowH=0;}
  if(!sh||cy+sd>a.y+a.h){if(sheets.length>=20)break;sh={id:`s${sheets.length+1}`,views:[]};sheets.push(sh);cx=a.x;cy=a.y;rowH=0;}
  sh.views.push({view:`det:${d.id}` as ViewKey,x:cx,y:cy,w:sd,h:sd,n});cx+=sd+g;rowH=Math.max(rowH,sd);}
 return {version:1,sheets,unplaced:[]};
}
/** Paper of a floor sheet when the member does not choose one: A2 when the plans get 1:100 or better there, else A1. */
export function floorPaperSize(m:Member):SheetSize{
 return floorCtx(m)&&floorPlanScale(m,'A2')>100?'A1':'A2';
}

/** Sheet set of a slab floor: one slab mark ('mark', “เฉพาะเบอร์พื้น”) or several / the whole floor ('floor', “รวมทั้งชั้น”);
 * `merged` = equal bars across marks share one Mark `SF-nn`. */
export type FloorSet={mode:'mark'|'floor';marks:string[];merged:boolean};
type BarRow={id:string;mark:string;note:string;diameter:number;count:number;weight:number;cutLength:number;shapeCode:string;grade:string;paths:Vec3[][];slab?:string;uses?:{slab:string;count:number}[]};
const legsOf=(p:Vec3[]|undefined)=>(p||[]).slice(1).map((q,i)=>Math.round(Math.hypot(q[0]-p![i][0],q[1]-p![i][1],q[2]-p![i][2]))).join(',');
/** Equal bars of different slab marks (shape code, Ø, grade, cut length, legs) → one Mark `SF-nn` per group; the rows keep
 * their ids (views and owners unchanged), `slab` = the mark they came from, `uses` = count per slab mark. */
export function mergeFloorMarks<R extends BarRow>(rows:R[]):R[]{
 const key=(r:R)=>[r.shapeCode,r.diameter,r.grade,Math.round(r.cutLength),legsOf(r.paths[0])].join('|'),groups=new Map<string,R[]>();
 for(const r of rows){if(!floorKind(r.id))continue;const k=key(r);groups.set(k,[...(groups.get(k)||[]),r]);}
 const out=new Map<string,R>();let n=0;
 for(const g of groups.values()){const marks=new Set(g.map(r=>slabMarkOf(r)));if(marks.size<2)continue;n++;
  const uses=[...marks].map(s=>({slab:s,count:g.filter(r=>slabMarkOf(r)===s).reduce((t,r)=>t+r.count,0)})),mark=`SF-${String(n).padStart(2,'0')}`;
  for(const r of g)out.set(r.id,{...r,slab:slabMarkOf(r),mark,uses});}
 return rows.map(r=>out.get(r.id)||r);
}
export type FloorTableItem<R>={head:string;sub:string}|{row:R};
/** BBS table of a whole-floor sheet: rows grouped by slab mark (header row per group), merged `SF-` Marks once (counts / weights
 * summed, note = where used) in a last group. */
export function floorTableItems<R extends BarRow>(rows:R[],q:number):FloorTableItem<R>[]{
 const fmt=(v:number)=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const groups=new Map<string,R[]>();
 for(const r of rows){const g=r.uses?'SF':slabMarkOf(r);groups.set(g,[...(groups.get(g)||[]),r]);}
 const out:FloorTableItem<R>[]=[];
 for(const [g,list] of [...groups].sort(([a],[b])=>a==='SF'?1:b==='SF'?-1:a.localeCompare(b,'en',{numeric:true}))){
  let items=list;
  if(g==='SF'){const by=new Map<string,R>();for(const r of list){const o=by.get(r.mark);by.set(r.mark,o?{...o,count:o.count+r.count,weight:o.weight+r.weight}:{...r,note:`ใช้ใน ${r.uses!.map(u=>`${u.slab} × ${u.count}`).join(' · ')}`});}items=[...by.values()];}
  const kg=items.reduce((t,r)=>t+r.weight,0)*q;
  out.push({head:g==='SF'?'Mark รวมข้ามเบอร์ (SF)':`เบอร์พื้น ${g}`,sub:`${items.length} Marks · ${fmt(kg)} kg`},...items.map(row=>({row})));
 }
 return out;
}
/** Steel per slab mark × bar size (kg, × member quantity) + totals; merged rows count where they are used. */
export function floorSteelSummary(rows:BarRow[],q:number){
 const sizes=[...new Set(rows.map(r=>r.diameter))].sort((a,b)=>a-b),marks=[...new Set(rows.map(r=>slabMarkOf(r)))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
 const kg=marks.map(mk=>sizes.map(d=>rows.filter(r=>slabMarkOf(r)===mk&&r.diameter===d).reduce((t,r)=>t+r.weight,0)*q));
 return {sizes,marks,kg,bySize:sizes.map((_,j)=>kg.reduce((t,row)=>t+row[j],0)),byMark:kg.map(row=>row.reduce((t,v)=>t+v,0)),total:kg.flat().reduce((t,v)=>t+v,0)};
}
/** Title of a floor sheet: “แบบเหล็กเสริมพื้น S1 · ชั้น 2”. */
export function floorTitle(m:Member,marks:string[]){
 const c=floorCtx(m),fl=[...new Set(m.occurrences.map(o=>o.floor).filter(Boolean))].join(', ')||(c?`ระดับ ${c.f.level>=0?'+':''}${c.f.level.toFixed(3)}`:'');
 const all=c&&marks.length===new Set(c.panels.map(p=>p.mark)).size&&marks.length>1;
 return `แบบเหล็กเสริมพื้น ${all?'ทั้งชั้น':marks.join(', ')}${fl?` · ชั้น ${fl}`:''}`.slice(0,120);
}
