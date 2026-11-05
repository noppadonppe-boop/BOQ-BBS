// S4a: slab-floor plan from a DXF (docs/SLAB_FLOOR.md “Import from DXF”). Pure rules: normalized entities (mm, one plan
// window) + layer roles → a FloorProposal (grids, beams, columns, openings, slab-mark labels with confidence and evidence),
// its diff against the current floor (add / edit / remove / same) and the apply of the ticked items (one new floor).
// S4b (AI reading a PDF) fills the same FloorProposal (source.kind 'ai').
import {IMPORT_ROLES,DEFAULT_OPENING_TRIM,DEFAULT_SLAB_REBAR,type FloorBeam,type FloorColumn,type FloorImportMap,type FloorMark,type FloorOpening,type FloorUnderlay,type ImportRole,type SlabFloor} from './slabFloorSchema';
import {entSegments,type CadEnt,type CadLayer,type P2} from './cadEntities';
import {autoPanels,inRing,retagPanels,sortGrids} from './slabFloor';
import {floorMarkFromTemplate,type SlabTemplate} from './slabWallTemplates';

export type Evidence={handles:string[];at?:P2;text?:string};
type Item={id:string;confidence:number;evidence:Evidence};
export type ProposalGrid=Item&{axis:'X'|'Y';label:string;at:number};
export type ProposalBeam=Item&{mark:string;along:'X'|'Y';line:string;from:string;to:string;width:number;depth:number;offset:number};
export type ProposalColumn=Item&{x:string;y:string;sx:number;sy:number;mark?:string};
export type ProposalOpening=Item&{shape:'rect'|'circle';x:number;y:number;w:number;h:number;label:string};
export type ProposalPanelMark=Item&{at:P2;mark:string;thickness?:number};
/** The import contract (also for S4b / AI): every coordinate in floor mm (origin applied), grids by label. */
export type FloorProposal={grids:ProposalGrid[];beams:ProposalBeam[];columns:ProposalColumn[];openings:ProposalOpening[];panelMarks:ProposalPanelMark[];
 warnings:string[];source:{kind:'dxf'|'pdf'|'ai';attachmentId:string;page?:number};
 /** drawing mm of the floor origin (floor = drawing − origin) */ origin:P2};
export type LayerRoles=Partial<Record<ImportRole,string[]>>;

// ---------------------------------------------------------------- layer roles
const TEXTY=/TEXT|TXT|ANNO|NOTE|LABEL|TAG|NAME|MARK|ข้อความ/i;
/** Role guess from a layer name (S-GRID, GRID, BEAM, S-BEAM, COL, OPENING, SLAB, TEXT …). */
export function roleFromName(name:string):ImportRole|undefined{
 const n=name.toUpperCase();
 if(/GRID|AXIS|กริด/.test(n))return /BUBBLE|HEAD|TEXT|TXT|LABEL|NAME|TAG|NO\b/.test(n)?'gridLabel':'grid';
 if(/SLAB|พื้น/.test(n))return 'slabMark';
 if(TEXTY.test(n))return 'text';
 if(/OPEN|HOLE|VOID|ช่องเปิด/.test(n))return 'opening';
 if(/BEAM|(^|[-_ ])BM([-_ ]|$)|คาน/.test(n))return 'beam';
 if(/COL|PIER|เสา/.test(n))return 'column';
 return undefined;
}
/** Roles of the layers of a file: the project's saved mappings first (same layer name), else the name rules. */
export function guessLayerRoles(layers:CadLayer[],saved:FloorImportMap[]=[]):LayerRoles{
 const fromSaved=new Map<string,ImportRole>();
 for(const m of saved)for(const r of IMPORT_ROLES)for(const l of m.layers[r]||[])if(!fromSaved.has(l))fromSaved.set(l,r);
 const out:LayerRoles={};
 for(const l of layers){if(!l.count)continue;const r=fromSaved.get(l.name)??roleFromName(l.name);if(r)(out[r]||=[]).push(l.name);}
 return out;
}
export const roleOfLayer=(roles:LayerRoles,layer:string):ImportRole|undefined=>IMPORT_ROLES.find(r=>roles[r]?.includes(layer));

// ---------------------------------------------------------------- helpers
const ANG=1e-3;// axis-parallel: |sin| below this (0.06°)
type Seg={x0:number;y0:number;x1:number;y1:number;h:string};
const r1=(v:number)=>Math.round(v*10)/10;
/** Text centre (insertion point + half the text box along its direction; character width ≈ 0.7 × height). */
export function textCentre(t:Extract<CadEnt,{k:'text'}>):P2{const w=0.7*t.size*t.text.length,c=Math.cos(t.rot),s=Math.sin(t.rot);return [t.at[0]+c*w/2-s*t.size/2,t.at[1]+s*w/2+c*t.size/2];}
const BEAM_RE=/^(\d+)?\s*([A-Z]*B[A-Z]*\d+[A-Z]?)\s*(?:[(\[]?\s*(\d{2,4})\s*[X×*]\s*(\d{2,4})\s*[)\]]?)?$/;
const COL_RE=/^([A-Z]*C[A-Z]*\d+[A-Z]?)\s*(?:[(\[]?\s*(\d{2,4})\s*[X×*]\s*(\d{2,4})\s*[)\]]?)?$/;
const SLAB_RE=/^(F?S)\s*(-?)\s*(\d+[A-Z]?)\s*(?:[(\[]?\s*T\s*=\s*(\d{2,4})\s*(?:MM)?\s*[)\]]?)?$/;
export const parseBeamText=(t:string)=>{const m=t.trim().toUpperCase().match(BEAM_RE);return m?{mark:m[2],width:m[3]?Number(m[3]):undefined,depth:m[4]?Number(m[4]):undefined}:undefined;};
export const parseSlabText=(t:string)=>{const m=t.trim().toUpperCase().match(SLAB_RE);return m?{mark:`${m[1]}${m[2]}${m[3]}`,thickness:m[4]?Number(m[4]):undefined}:undefined;};
const parseColText=(t:string)=>{const m=t.trim().toUpperCase().match(COL_RE);return m?{mark:m[1],sx:m[2]?Number(m[2]):undefined,sy:m[3]?Number(m[3]):undefined}:undefined;};
const letters=(k:number)=>{let s='';k++;while(k>0){const r=(k-1)%26;s=String.fromCharCode(65+r)+s;k=Math.floor((k-1)/26);}return s;};

// ---------------------------------------------------------------- read
export type ReadOptions={source:FloorProposal['source'];
 /** current floor: its grid labels fix the origin (same label = same place) */ floor?:Pick<SlabFloor,'gridsX'|'gridsY'>;
 /** slab marks of the project (spec.slabTemplates names): a label not among them is warned */ slabMarks?:string[];
 /** beam sizes by mark (Beam Templates) when the drawing gives no size text */ beamSizes?:Record<string,{width:number;depth:number}>};
/** Reads one plan (entities already in mm and inside the chosen window). */
export function readFloorPlan(ents:CadEnt[],roles:LayerRoles,o:ReadOptions):FloorProposal{
 const warnings:string[]=[],role=(l:string)=>roleOfLayer(roles,l);
 const texts=ents.filter((e):e is Extract<CadEnt,{k:'text'}>=>e.k==='text');
 const segsOf=(want:(e:CadEnt)=>boolean):Seg[]=>ents.filter(want).flatMap(e=>entSegments(e,[]).map(s=>({x0:s[0],y0:s[1],x1:s[2],y1:s[3],h:e.h})));
 // ---------- grids
 const gridLayer=(e:CadEnt)=>role(e.layer)==='grid'||(!roles.grid?.length&&(e.k==='line'||e.k==='poly')&&/CENT|DASHDOT/i.test(('lt' in e&&e.lt)||''));
 const gsegs=segsOf(e=>(e.k==='line'||e.k==='poly')&&gridLayer(e)),longest=Math.max(0,...gsegs.map(s=>Math.hypot(s.x1-s.x0,s.y1-s.y0)));
 let oblique=0;const vert:Seg[]=[],hori:Seg[]=[];
 for(const s of gsegs){const L=Math.hypot(s.x1-s.x0,s.y1-s.y0);if(L<Math.max(1000,longest*.25))continue;const sin=Math.abs(s.x1-s.x0)/L,cos=Math.abs(s.y1-s.y0)/L;
  if(sin<ANG)vert.push(s);else if(cos<ANG)hori.push(s);else oblique++;}
 if(oblique)warnings.push(`กริดไม่ขนานแกน ${oblique} เส้น: ยังไม่รองรับ (นำเข้าเฉพาะกริดที่ขนานแกน)`);
 const bubbles=ents.filter((e):e is Extract<CadEnt,{k:'circle'}>=>e.k==='circle'&&(role(e.layer)==='gridLabel'||role(e.layer)==='grid')).map(c=>{
  const t=texts.filter(t=>{const q=textCentre(t);return Math.hypot(q[0]-c.c[0],q[1]-c.c[1])<=c.r*1.1;}).sort((a,b)=>{const p=textCentre(a),q=textCentre(b);return Math.hypot(p[0]-c.c[0],p[1]-c.c[1])-Math.hypot(q[0]-c.c[0],q[1]-c.c[1]);})[0];
  return {c:c.c,r:c.r,label:t?.text.trim(),h:[c.h,...(t?[t.h]:[])]};}).filter(b=>b.label);
 const gridTexts=texts.filter(t=>role(t.layer)==='gridLabel');
 const group=(list:Seg[],axis:'X'|'Y'):ProposalGrid[]=>{
  const key=(s:Seg)=>axis==='X'?(s.x0+s.x1)/2:(s.y0+s.y1)/2,sorted=[...list].sort((a,b)=>key(a)-key(b)),out:{at:number;segs:Seg[]}[]=[];
  for(const s of sorted){const k=key(s),g=out.at(-1);if(g&&Math.abs(k-g.at)<=2){g.segs.push(s);g.at=g.segs.reduce((n,x)=>n+key(x),0)/g.segs.length;}else out.push({at:k,segs:[s]});}
  return out.map(g=>{
   const lo=Math.min(...g.segs.map(s=>axis==='X'?Math.min(s.y0,s.y1):Math.min(s.x0,s.x1))),hi=Math.max(...g.segs.map(s=>axis==='X'?Math.max(s.y0,s.y1):Math.max(s.x0,s.x1)));
   const along=(p:P2)=>axis==='X'?p[1]:p[0],across=(p:P2)=>axis==='X'?p[0]:p[1],endGap=(p:P2)=>Math.max(0,Math.min(Math.abs(along(p)-lo),Math.abs(along(p)-hi)));
   const b=bubbles.filter(b=>Math.abs(across(b.c)-g.at)<=b.r*.6&&(along(b.c)<=lo+b.r*1.5||along(b.c)>=hi-b.r*1.5)&&endGap(b.c)<=b.r*4).sort((p,q)=>endGap(p.c)-endGap(q.c))[0];
   const t=b?undefined:gridTexts.filter(t=>{const q=textCentre(t);return Math.abs(across(q)-g.at)<=t.size*2&&endGap(q)<=t.size*6&&(along(q)<=lo+t.size||along(q)>=hi-t.size);})[0];
   const label=(b?.label||t?.text||'').trim().slice(0,12);
   return {id:'',axis,label,at:r1(g.at),confidence:label?0.95:0.6,evidence:{handles:[...g.segs.map(s=>s.h),...(b?b.h:t?[t.h]:[])],at:(axis==='X'?[g.at,lo]:[lo,g.at]) as P2,...(label?{text:label}:{})}};});
 };
 const gx=group(vert,'X'),gy=group(hori,'Y');
 for(const [list,axis] of [[gx,'X'],[gy,'Y']] as const){const used=new Set(list.map(g=>g.label).filter(Boolean));let k=0;
  const missing=list.filter(g=>!g.label);if(missing.length)warnings.push(`กริด ${axis} ${missing.length} เส้นไม่มีป้ายชื่อ: ตั้งชื่อเรียงให้ (${axis==='X'?'A, B, …':'1, 2, …'}) ตรวจก่อนใช้`);
  for(const g of missing){let l='';do{l=axis==='X'?letters(k++):String(++k);}while(used.has(l));used.add(l);g.label=l;}
  const dup=list.map(g=>g.label).filter((l,i,a)=>a.indexOf(l)!==i);if(dup.length)warnings.push(`ชื่อกริด ${axis} ซ้ำ: ${[...new Set(dup)].join(', ')}`);
  list.forEach(g=>{g.id=`g:${axis}:${g.label}`;});}
 // origin: same labels as the current floor keep their place, else the first grid of each direction = 0
 const shift=(list:ProposalGrid[],cur:{label:string;at:number}[]|undefined)=>{const d=list.flatMap(g=>{const c=cur?.find(x=>x.label===g.label);return c?[g.at-c.at]:[];}).sort((a,b)=>a-b);
  return d.length?d[Math.floor(d.length/2)]:list.length?Math.min(...list.map(g=>g.at)):0;};
 const origin:P2=[shift(gx,o.floor?.gridsX),shift(gy,o.floor?.gridsY)];
 for(const g of gx)g.at=r1(g.at-origin[0]);for(const g of gy)g.at=r1(g.at-origin[1]);
 const F=(p:P2):P2=>[p[0]-origin[0],p[1]-origin[1]];
 const sx=sortGrids(gx),sy=sortGrids(gy),near=(list:{label:string;at:number}[],v:number,tol:number)=>{let b:{label:string;at:number}|undefined,d=tol;for(const g of list){const e=Math.abs(g.at-v);if(e<=d){d=e;b=g;}}return b;};
 // ---------- columns
 const colEnts=ents.filter(e=>role(e.layer)==='column'&&(e.k==='poly'&&e.closed||e.k==='circle'));
 const colTexts=texts.filter(t=>parseColText(t.text)&&['column','text','gridLabel',undefined].includes(role(t.layer)));
 const columns:ProposalColumn[]=[],colBoxes:{x0:number;y0:number;x1:number;y1:number}[]=[];let off=0;
 for(const e of colEnts){
  const b=e.k==='circle'?{x0:e.c[0]-e.r,y0:e.c[1]-e.r,x1:e.c[0]+e.r,y1:e.c[1]+e.r}:bbox((e as Extract<CadEnt,{k:'poly'}>).pts);
  const w=b.x1-b.x0,h=b.y1-b.y0;if(w<100||h<100||w>3000||h>3000)continue;
  const c=F([(b.x0+b.x1)/2,(b.y0+b.y1)/2]),x=near(sx,c[0],w/2),y=near(sy,c[1],h/2);
  colBoxes.push({x0:b.x0-origin[0],y0:b.y0-origin[1],x1:b.x1-origin[0],y1:b.y1-origin[1]});
  if(!x||!y){warnings.push(`เสาที่ (${Math.round(c[0])}, ${Math.round(c[1])}) ไม่อยู่ที่จุดตัดกริด: ข้าม`);continue;}
  if(columns.some(k=>k.x===x.label&&k.y===y.label))continue;
  if(Math.abs(c[0]-x.at)>5||Math.abs(c[1]-y.at)>5)off++;
  const t=colTexts.map(t=>({t,d:dist(F(textCentre(t)),c)})).filter(q=>q.d<=Math.max(1000,w*2)).sort((a,b)=>a.d-b.d)[0];
  columns.push({id:`c:${x.label}/${y.label}`,x:x.label,y:y.label,sx:Math.round(w),sy:Math.round(h),...(t?{mark:parseColText(t.t.text)!.mark}:{}),confidence:e.k==='circle'?0.7:0.95,
   evidence:{handles:[e.h,...(t?[t.t.h]:[])],at:c,...(t?{text:t.t.text}:{})}});
  if(e.k==='circle')warnings.push(`เสากลม ${x.label}/${y.label} Ø${Math.round(w)}: เก็บเป็นสี่เหลี่ยม ${Math.round(w)} × ${Math.round(w)}`);
 }
 if(off)warnings.push(`เสา ${off} ต้นเยื้องจากจุดตัดกริด: แปลนพื้นเก็บเสาที่จุดตัดกริด (ไม่เก็บระยะเยื้อง)`);
 // ---------- beams (pairs of parallel lines 150–1,000 apart, or long closed rectangles)
 const beamEnts=ents.filter(e=>role(e.layer)==='beam');
 const pieces:{along:'X'|'Y';c:number;w:number;u0:number;u1:number;h:string[]}[]=[];
 for(const e of beamEnts)if(e.k==='poly'&&e.closed&&e.pts.length===4){const b=bbox(e.pts),w=b.x1-b.x0,h=b.y1-b.y0,ortho=e.pts.every((p,i)=>{const q=e.pts[(i+1)%4];return Math.abs(p[0]-q[0])<1e-6||Math.abs(p[1]-q[1])<1e-6;});
  if(!ortho)continue;if(w>=2.5*h&&h>=150&&h<=1000)pieces.push({along:'X',c:(b.y0+b.y1)/2,w:h,u0:b.x0,u1:b.x1,h:[e.h]});else if(h>=2.5*w&&w>=150&&w<=1000)pieces.push({along:'Y',c:(b.x0+b.x1)/2,w,u0:b.y0,u1:b.y1,h:[e.h]});}
 const bsegs=segsOf(e=>(e.k==='line'||e.k==='poly'&&!(e.closed&&e.pts.length===4))&&role(e.layer)==='beam');
 for(const along of ['X','Y'] as const){
  const list=bsegs.flatMap(s=>{const L=Math.hypot(s.x1-s.x0,s.y1-s.y0);if(L<100)return [];const par=along==='X'?Math.abs(s.y1-s.y0)/L<ANG:Math.abs(s.x1-s.x0)/L<ANG;if(!par)return [];
   return [{c:along==='X'?(s.y0+s.y1)/2:(s.x0+s.x1)/2,u0:along==='X'?Math.min(s.x0,s.x1):Math.min(s.y0,s.y1),u1:along==='X'?Math.max(s.x0,s.x1):Math.max(s.y0,s.y1),h:s.h}];}).sort((a,b)=>a.c-b.c);
  for(let i=0;i<list.length;i++){const a=list[i];let best:{j:number;g:number}|undefined;
   for(let j=i+1;j<list.length;j++){const b=list[j],g=b.c-a.c;if(g>1000)break;if(g<150)continue;const ov=Math.min(a.u1,b.u1)-Math.max(a.u0,b.u0);if(ov<0.5*Math.min(a.u1-a.u0,b.u1-b.u0))continue;
    // nothing parallel in between (else a and b are faces of different beams)
    if(list.slice(i+1,j).some(m=>m.c-a.c>1&&b.c-m.c>1&&Math.min(m.u1,a.u1,b.u1)-Math.max(m.u0,a.u0,b.u0)>0))continue;
    if(!best||g<best.g)best={j,g};break;}
   if(best){const b=list[best.j];pieces.push({along,c:(a.c+b.c)/2,w:best.g,u0:Math.max(a.u0,b.u0),u1:Math.min(a.u1,b.u1),h:[a.h,b.h]});}}
 }
 // pieces → runs on one line (same centre / width), gaps ≤ 1,200 (columns, crossing beams) bridged
 const beamTexts=texts.filter(t=>parseBeamText(t.text)&&['beam','text',undefined].includes(role(t.layer)));
 type Run={along:'X'|'Y';c:number;w:number;u0:number;u1:number;h:string[];mark?:string;depth?:number;tw?:number;th:string[];tt?:string};
 const runs:Run[]=[];
 for(const p of pieces.sort((a,b)=>a.along.localeCompare(b.along)||a.c-b.c||a.u0-b.u0)){
  const q=F(p.along==='X'?[p.u0,p.c]:[p.c,p.u0]),q1=F(p.along==='X'?[p.u1,p.c]:[p.c,p.u1]),c=p.along==='X'?q[1]:q[0],u0=p.along==='X'?q[0]:q[1],u1=p.along==='X'?q1[0]:q1[1];
  // mark text beside this piece
  const t=beamTexts.map(t=>{const m=F(textCentre(t)),cu=p.along==='X'?m[0]:m[1],cv=p.along==='X'?m[1]:m[0],dv=Math.abs(cv-c)-p.w/2;
   const rotOk=Math.abs(Math.sin(t.rot-(p.along==='X'?0:Math.PI/2)))<0.2;return {t,ok:cu>=u0-300&&cu<=u1+300&&dv<=1200,d:Math.max(0,dv)+(rotOk?0:500)};}).filter(x=>x.ok).sort((a,b)=>a.d-b.d)[0];
  const info=t&&parseBeamText(t.t.text);
  const r:Run={along:p.along,c,w:p.w,u0,u1,h:[...p.h],th:t?[t.t.h]:[],...(info?{mark:info.mark,...(info.depth?{depth:info.depth}:{}),...(info.width?{tw:info.width}:{}),tt:t!.t.text}:{})};
  const prev=runs.at(-1);
  if(prev&&prev.along===r.along&&Math.abs(prev.c-r.c)<=2&&Math.abs(prev.w-r.w)<=2&&r.u0-prev.u1<=1200&&(!prev.mark||!r.mark||prev.mark===r.mark)){
   prev.u0=Math.min(prev.u0,r.u0);prev.u1=Math.max(prev.u1,r.u1);prev.h.push(...r.h);prev.th.push(...r.th);if(!prev.mark&&r.mark){prev.mark=r.mark;prev.depth=r.depth;prev.tw=r.tw;prev.tt=r.tt;}if(!prev.depth&&r.depth)prev.depth=r.depth;}
  else runs.push(r);
 }
 const depthOf=new Map<string,number>();for(const r of runs)if(r.mark&&r.depth&&!depthOf.has(r.mark))depthOf.set(r.mark,r.depth);
 const beams:ProposalBeam[]=[];const seq={X:0,Y:0};
 for(const r of runs){
  const lines=r.along==='X'?sy:sx,ends=r.along==='X'?sx:sy,line=near(lines,r.c,r.w/2+600);
  if(!line){warnings.push(`คาน${r.mark?` ${r.mark}`:''} แนว ${r.along} ที่ ${Math.round(r.c)} ไม่อยู่บนกริด: ข้าม (แปลนพื้นต้องมีกริดใต้คาน)`);continue;}
  const a=near(ends,r.u0,1500),b=near(ends,r.u1,1500);
  if(!a||!b||a===b){warnings.push(`คาน${r.mark?` ${r.mark}`:''} บนกริด ${line.label}: ปลายคานไม่ถึงกริด (${Math.round(r.u0)}–${Math.round(r.u1)}) ข้าม`);continue;}
  const mark=r.mark||'B?',size=o.beamSizes?.[mark];let depth=r.depth||depthOf.get(mark)||size?.depth||0,conf=r.mark?0.9:0.5;
  if(!r.mark)warnings.push(`คานบนกริด ${line.label} (${a.label}–${b.label}) ไม่มีป้าย Mark: ตั้ง “B?” ตรวจก่อนใช้`);
  if(!depth){depth=600;conf=Math.min(conf,0.5);warnings.push(`คาน ${mark} ไม่มีความลึกในแบบหรือ Beam Template: ใช้ 600 ตรวจก่อนใช้`);}
  if(r.tw&&Math.abs(r.tw-r.w)>10)warnings.push(`คาน ${mark}: ป้ายกว้าง ${r.tw} แต่เส้นในแบบกว้าง ${Math.round(r.w)} (ใช้ค่าจากเส้น)`);
  seq[r.along]++;
  beams.push({id:`b:${r.along}:${line.label}:${a.label}-${b.label}`,mark,along:r.along,line:line.label,from:a.label,to:b.label,width:Math.round(r.w),depth,offset:Math.round(r.c-line.at),confidence:conf,
   evidence:{handles:[...r.h,...r.th],at:(r.along==='X'?[(r.u0+r.u1)/2,r.c]:[r.c,(r.u0+r.u1)/2]) as P2,...(r.tt?{text:r.tt}:{})}});
 }
 // ---------- openings: closed outlines on the opening layer, circles there, or rectangles crossed corner to corner
 const lines=segsOf(e=>e.k==='line'||e.k==='poly'&&!e.closed);
 const crossed=(b:{x0:number;y0:number;x1:number;y1:number})=>{const hit=(p:P2,q:P2)=>lines.some(s=>dist([s.x0,s.y0],p)<=2&&dist([s.x1,s.y1],q)<=2||dist([s.x0,s.y0],q)<=2&&dist([s.x1,s.y1],p)<=2);
  return hit([b.x0,b.y0],[b.x1,b.y1])&&hit([b.x1,b.y0],[b.x0,b.y1]);};
 const openTexts=texts.filter(t=>/^(OP|O|H|OPENING)\s*[-.]?\s*\d+/i.test(t.text.trim()));
 const openings:ProposalOpening[]=[];
 for(const e of ents){
  const onLayer=role(e.layer)==='opening';
  if(e.k==='circle'&&onLayer){const c=F(e.c);openings.push({id:'',shape:'circle',x:r1(c[0]-e.r),y:r1(c[1]-e.r),w:r1(2*e.r),h:r1(2*e.r),label:'',confidence:0.9,evidence:{handles:[e.h],at:c}});continue;}
  if(e.k!=='poly'||!e.closed)continue;const rl=role(e.layer);if(rl==='column'||rl==='beam'||rl==='grid')continue;
  const b=bbox(e.pts),rect=e.pts.length===4&&e.pts.every((p,i)=>{const q=e.pts[(i+1)%4];return Math.abs(p[0]-q[0])<1e-6||Math.abs(p[1]-q[1])<1e-6;});
  const isX=rect&&crossed(b);if(!onLayer&&!isX)continue;
  if(b.x1-b.x0<50||b.y1-b.y0<50)continue;
  if(!rect)warnings.push(`ช่องเปิดรูปหลายเหลี่ยม (${e.pts.length} จุด): เก็บเป็นกรอบสี่เหลี่ยมล้อมรอบ`);
  const p=F([b.x0,b.y0]);openings.push({id:'',shape:'rect',x:r1(p[0]),y:r1(p[1]),w:r1(b.x1-b.x0),h:r1(b.y1-b.y0),label:'',confidence:onLayer?(isX?0.95:0.85):0.7,evidence:{handles:[e.h],at:F([(b.x0+b.x1)/2,(b.y0+b.y1)/2])}});
 }
 openings.forEach((op,k)=>{const c:P2=[op.x+op.w/2,op.y+op.h/2],t=openTexts.map(t=>({t,d:dist(F(textCentre(t)),c)})).filter(q=>q.d<=Math.max(op.w,op.h)+1000).sort((a,b)=>a.d-b.d)[0];
  op.id=`o:${k+1}`;op.label=(t?.t.text.trim()||`OP-${k+1}`).slice(0,40);if(t){op.evidence.handles.push(t.t.h);op.evidence.text=t.t.text;}});
 // ---------- slab marks
 const known=new Set((o.slabMarks||[]).map(n=>n.toUpperCase().replace(/-/g,'')));
 const panelMarks:ProposalPanelMark[]=[];const unknown=new Set<string>();
 for(const t of texts){const rl=role(t.layer);if(rl&&rl!=='slabMark'&&rl!=='text')continue;const s=parseSlabText(t.text);if(!s)continue;
  const at=F(textCentre(t));panelMarks.push({id:`m:${panelMarks.length+1}`,at:[r1(at[0]),r1(at[1])],mark:s.mark,...(s.thickness?{thickness:s.thickness}:{}),confidence:rl==='slabMark'?0.9:0.75,evidence:{handles:[t.h],at,text:t.text}});
  if(o.slabMarks&&!known.has(s.mark.toUpperCase().replace(/-/g,'')))unknown.add(s.mark);}
 if(unknown.size)warnings.push(`เบอร์พื้น ${[...unknown].join(', ')} ยังไม่มีในตารางพื้นของโครงการ (General Spec): ใช้เหล็กค่าเริ่มต้น`);
 if(!gx.length||!gy.length)warnings.push('ไม่พบกริดทั้งสองแนว: ตรวจการจับคู่ layer ของกริด');
 return {grids:[...gx,...gy],beams,columns,openings,panelMarks,warnings,source:o.source,origin};
}
const dist=(a:P2,b:P2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function bbox(pts:P2[]){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of pts){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}return {x0,y0,x1,y1};}

// ---------------------------------------------------------------- diff / apply
export type DiffOp='add'|'edit'|'remove'|'same';
export type ProposalKind='grid'|'beam'|'column'|'opening'|'panelMark';
export type DiffItem={id:string;kind:ProposalKind;op:DiffOp;text:string;confidence:number;evidence?:Evidence};
const beamKey=(b:{along:string;line:string})=>`${b.along}|${b.line}`;
const sameBeam=(a:FloorBeam,b:ProposalBeam)=>a.mark===b.mark&&a.from===b.from&&a.to===b.to&&a.width===b.width&&a.depth===b.depth&&(a.offset||0)===b.offset;
const oBox=(o:{x:number;y:number;w:number;h:number;shape:string})=>({x0:o.x,y0:o.y,x1:o.x+o.w,y1:o.y+(o.shape==='circle'?o.w:o.h)});
const iou=(a:ReturnType<typeof oBox>,b:ReturnType<typeof oBox>)=>{const i=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)),u=(a.x1-a.x0)*(a.y1-a.y0)+(b.x1-b.x0)*(b.y1-b.y0)-i;return u>0?i/u:0;};
/** Current beam(s) a proposal beam replaces: same direction and grid line, overlapping grid range. */
function beamMatches(f:SlabFloor,p:ProposalBeam){
 const runs=sortGrids(p.along==='X'?f.gridsX:f.gridsY),ix=(l:string)=>runs.findIndex(g=>g.label===l),span=(a:string,b:string)=>[ix(a),ix(b)].sort((x,y)=>x-y),pa=span(p.from,p.to);
 return f.beams.filter(b=>{if(beamKey(b)!==beamKey(p))return false;const q=span(b.from,b.to);return pa[0]<0||q[0]<0||Math.min(pa[1],q[1])>Math.max(pa[0],q[0]);});
}
/** Proposal vs the current floor: one row per proposal item (add / edit / same) plus current items the drawing does not have
 * (remove; grids, beams, columns, openings). Panel marks: label inside a current panel of another mark = edit. */
export function proposalDiff(f:SlabFloor,p:FloorProposal):DiffItem[]{
 const out:DiffItem[]=[];
 for(const g of p.grids){const cur=(g.axis==='X'?f.gridsX:f.gridsY).find(x=>x.label===g.label);out.push({id:g.id,kind:'grid',op:!cur?'add':Math.abs(cur.at-g.at)>0.5?'edit':'same',text:`กริด ${g.axis} ${g.label} @ ${Math.round(g.at).toLocaleString('en-US')}${cur&&Math.abs(cur.at-g.at)>0.5?` (เดิม ${Math.round(cur.at).toLocaleString('en-US')})`:''}`,confidence:g.confidence,evidence:g.evidence});}
 for(const axis of ['X','Y'] as const)for(const g of axis==='X'?f.gridsX:f.gridsY)if(!p.grids.some(x=>x.axis===axis&&x.label===g.label))out.push({id:`-g:${axis}:${g.label}`,kind:'grid',op:'remove',text:`กริด ${axis} ${g.label} (ไม่มีในแบบ)`,confidence:0.5});
 const matched=new Set<string>();
 for(const b of p.beams){const m=beamMatches(f,b);m.forEach(x=>matched.add(x.id));
  out.push({id:b.id,kind:'beam',op:!m.length?'add':m.length===1&&sameBeam(m[0],b)?'same':'edit',text:`คาน ${b.mark} ${b.width}×${b.depth} บนกริด ${b.line} (${b.from}–${b.to})${b.offset?` เยื้อง ${b.offset}`:''}`,confidence:b.confidence,evidence:b.evidence});}
 for(const b of f.beams)if(!matched.has(b.id))out.push({id:`-b:${b.id}`,kind:'beam',op:'remove',text:`คาน ${b.mark} บนกริด ${b.line} (${b.from}–${b.to}) (ไม่มีในแบบ)`,confidence:0.5});
 for(const c of p.columns){const cur=(f.columns||[]).find(x=>x.x===c.x&&x.y===c.y);out.push({id:c.id,kind:'column',op:!cur?'add':cur.sx===c.sx&&cur.sy===c.sy?'same':'edit',text:`เสา${c.mark?` ${c.mark}`:''} ${c.x}/${c.y} ${c.sx}×${c.sy}`,confidence:c.confidence,evidence:c.evidence});}
 for(const c of f.columns||[])if(!p.columns.some(x=>x.x===c.x&&x.y===c.y))out.push({id:`-c:${c.id}`,kind:'column',op:'remove',text:`เสา ${c.x}/${c.y} (ไม่มีในแบบ)`,confidence:0.5});
 const usedO=new Set<string>();
 for(const o of p.openings){const cur=f.openings.find(x=>!usedO.has(x.id)&&x.shape===o.shape&&iou(oBox(x),oBox(o))>0.5);if(cur)usedO.add(cur.id);
  const same=cur&&Math.abs(cur.x-o.x)<0.5&&Math.abs(cur.y-o.y)<0.5&&Math.abs(cur.w-o.w)<0.5&&(o.shape==='circle'||Math.abs(cur.h-o.h)<0.5);
  out.push({id:o.id,kind:'opening',op:!cur?'add':same?'same':'edit',text:`ช่องเปิด ${o.label} ${o.shape==='circle'?`Ø${o.w}`:`${o.w}×${o.h}`}`,confidence:o.confidence,evidence:o.evidence});}
 for(const o of f.openings)if(!usedO.has(o.id))out.push({id:`-o:${o.id}`,kind:'opening',op:'remove',text:`ช่องเปิด ${o.label||o.id} (ไม่มีในแบบ)`,confidence:0.5});
 for(const m of p.panelMarks){const cur=f.panels.find(x=>inRing(m.at,x.outline as P2[]));out.push({id:m.id,kind:'panelMark',op:!cur?'add':cur.mark===m.mark?'same':'edit',text:`ป้ายเบอร์พื้น ${m.mark}${m.thickness?` t=${m.thickness}`:''}${cur&&cur.mark!==m.mark?` (แผง ${cur.tag} เดิม ${cur.mark})`:''}`,confidence:m.confidence,evidence:m.evidence});}
 return out;
}
/** Rows ticked by default: everything but `same` rows and removals. */
export const defaultPicks=(d:DiffItem[])=>new Set(d.filter(x=>x.op==='add'||x.op==='edit').map(x=>x.id));
export type ApplyOptions={slabTemplates?:SlabTemplate[];underlay?:FloorUnderlay;importMap?:FloorImportMap};
/** Applies the ticked rows to the floor. Grid / beam changes rebuild the panels from the grid cells (marks from the labels,
 * else the first mark); label rows set the mark of the panel they fall in (a new mark comes from the project's slab list, else
 * the default bars, thickness from the label). Nothing ticked → the same floor object. */
export function applyProposal(f:SlabFloor,p:FloorProposal,picked:Set<string>,o:ApplyOptions={}):{floor:SlabFloor;warnings:string[]}{
 const diff=proposalDiff(f,p),on=diff.filter(d=>picked.has(d.id)&&d.op!=='same');
 if(!on.length)return {floor:f,warnings:[]};
 const warnings:string[]=[],has=(id:string)=>on.some(d=>d.id===id);
 let n:SlabFloor=structuredClone(f);
 // grids
 for(const axis of ['X','Y'] as const){const key=axis==='X'?'gridsX':'gridsY';let list=[...n[key]];
  for(const g of p.grids.filter(g=>g.axis===axis&&has(g.id))){const i=list.findIndex(x=>x.label===g.label);if(i>=0)list[i]={...list[i],at:g.at};else list.push({label:g.label,at:g.at});}
  list=list.filter(g=>!has(`-g:${axis}:${g.label}`));n[key]=sortGrids(list).slice(0,30);}
 // beams
 const usedIds=new Set(n.beams.map(b=>b.id));const newId=(b:ProposalBeam)=>{const lines=sortGrids(b.along==='X'?n.gridsY:n.gridsX),k=lines.findIndex(g=>g.label===b.line)+1;let id=`b${b.along.toLowerCase()}${k}`;let j=1;while(usedIds.has(id))id=`b${b.along.toLowerCase()}${k}-${++j}`;usedIds.add(id);return id;};
 const taken=new Set<string>();
 for(const b of p.beams.filter(b=>has(b.id))){const m=beamMatches(f,b).filter(x=>!taken.has(x.id)),keep=m[0];if(keep)taken.add(keep.id);
  n.beams=n.beams.filter(x=>!m.some(y=>y.id===x.id)||x.id===keep?.id);
  const nb:FloorBeam={id:keep?.id||newId(b),mark:b.mark,along:b.along,line:b.line,from:b.from,to:b.to,width:b.width,depth:b.depth,...(b.offset?{offset:b.offset}:{}),...(keep?.rank?{rank:keep.rank}:{})};
  const i=n.beams.findIndex(x=>x.id===nb.id);if(i>=0)n.beams[i]=nb;else n.beams.push(nb);}
 n.beams=n.beams.filter(b=>!has(`-b:${b.id}`));
 {const order=(b:FloorBeam)=>{const l=sortGrids(b.along==='X'?n.gridsY:n.gridsX),r=sortGrids(b.along==='X'?n.gridsX:n.gridsY);return [b.along==='X'?0:1,l.findIndex(g=>g.label===b.line),Math.min(r.findIndex(g=>g.label===b.from),r.findIndex(g=>g.label===b.to))];};
  n.beams=[...n.beams].sort((a,b)=>{const p=order(a),q=order(b);return p[0]-q[0]||p[1]-q[1]||p[2]-q[2];});}
 // columns
 let cols=[...(n.columns||[])];const cid=new Set(cols.map(c=>c.id));
 for(const c of p.columns.filter(c=>has(c.id))){const i=cols.findIndex(x=>x.x===c.x&&x.y===c.y);if(i>=0){const {template:_t,...rest}=cols[i];cols[i]={...rest,sx:c.sx,sy:c.sy};}else{let k=1;while(cid.has(`col${k}`))k++;cid.add(`col${k}`);cols.push({id:`col${k}`,x:c.x,y:c.y,sx:c.sx,sy:c.sy} as FloorColumn);}}
 cols=cols.filter(c=>!has(`-c:${c.id}`));if(cols.length||n.columns)n.columns=cols.slice(0,300);
 // panels: rebuilt when the grids / beams changed
 const geo=on.some(d=>d.kind==='grid'||d.kind==='beam');
 if(geo){const first=n.marks[0]?.name||'S1';n.panels=autoPanels(n,first);n.openings=n.openings.map(({panel:_p,...x})=>x);}
 // openings
 const usedO=new Set<string>();const oid=new Set(n.openings.map(x=>x.id));
 for(const op of p.openings){const cur=f.openings.find(x=>!usedO.has(x.id)&&x.shape===op.shape&&iou(oBox(x),oBox(op))>0.5);if(cur)usedO.add(cur.id);if(!has(op.id))continue;
  if(cur){n.openings=n.openings.map(x=>x.id===cur.id?{...x,x:op.x,y:op.y,w:op.w,h:op.shape==='circle'?op.w:op.h}:x);}
  else{let k=1;while(oid.has(`op${k}`))k++;oid.add(`op${k}`);n.openings.push({id:`op${k}`,label:op.label,shape:op.shape,x:op.x,y:op.y,w:op.w,h:op.shape==='circle'?op.w:op.h,trim:structuredClone(DEFAULT_OPENING_TRIM)} as FloorOpening);}}
 n.openings=n.openings.filter(x=>!has(`-o:${x.id}`)).slice(0,40);
 // slab marks of the labels (all labels when the panels were rebuilt, else the ticked ones)
 const tpl=(name:string)=>o.slabTemplates?.find(t=>t.name.replace(/[^A-Za-z0-9-]/g,'').toUpperCase()===name.toUpperCase()||t.name.replace(/[^A-Za-z0-9]/g,'').toUpperCase()===name.replace(/-/g,'').toUpperCase());
 const markName=(m:string)=>n.marks.find(x=>x.name.toUpperCase()===m.toUpperCase()||x.name.replace(/-/g,'').toUpperCase()===m.replace(/-/g,'').toUpperCase())?.name;
 for(const lab of p.panelMarks.filter(m=>geo?picked.has(m.id)||!diff.some(d=>d.id===m.id&&d.op!=='same'):has(m.id))){
  let name=markName(lab.mark);
  if(!name){const t=tpl(lab.mark);const mk:FloorMark=t?{...floorMarkFromTemplate(t),name:lab.mark}:{name:lab.mark,thickness:lab.thickness||n.marks[0]?.thickness||150,support:n.marks[0]?.support||'elevated',rebar:structuredClone(DEFAULT_SLAB_REBAR)};
   if(n.marks.length>=20){warnings.push(`เบอร์พื้นเกิน 20: ข้าม ${lab.mark}`);continue;}n.marks.push(mk);name=mk.name;}
  const panel=n.panels.find(x=>inRing(lab.at,x.outline as P2[]));if(!panel){warnings.push(`ป้าย ${lab.mark} ไม่อยู่ในแผงพื้นใด`);continue;}
  panel.mark=name;const mk=n.marks.find(x=>x.name===name)!;if(lab.thickness&&lab.thickness!==mk.thickness)panel.thickness=lab.thickness;}
 n=retagPanels(n);
 if(o.underlay)n.underlay=o.underlay;if(o.importMap)n.importMap=o.importMap;
 return {floor:n,warnings};
}
