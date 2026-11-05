import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import type {Member,Vec3} from './model';
import {bendRadius,gradeFor,groundLayers,lapLength,type Detailing,type GenBar,type SlabInput} from './elementInput';
import {applyShapeModel} from './shapeApply';
import {multiIntervals,normaliseShape} from './shapeGeometry';
import {shapeModelSchema,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {editablePlacementContext,REGION_LIMIT} from './placementContext';
import {emptySiteWork,withSiteWork} from './siteWork';
import {DEFAULT_OPENING_TRIM,DEFAULT_SLAB_REBAR,type FloorBeam,type FloorDrop,type FloorMark,type FloorOpening,type FloorPanel,type SlabFloor,type SlabRebarSpec} from './slabFloorSchema';

// Slab floor (Slab layout 'floor', docs/SLAB_FLOOR.md): a whole floor of slab panels on a grid in one member.
// Floor coordinates: plan mm with the grids at their `at` values, z mm from the floor level (top of slab = 0).
// The floor becomes a shape model (panels = polygon solids tagged by panel, openings = voids, drops / sunken areas,
// reference beams = `reference` + castWith: no quantity, no formwork against them) and generated bars `gen-<owner>-…`
// (owner = the slab-mark bar group `g<mark>` when the mark has ≥ 2 panels, else the panel) named by function:
// <mark>-B01 bottom, <mark>-T01 top / extra top, <mark>-OP1 opening trimmers, <mark>-OD1 opening diagonals.
type P2=[number,number];type V3=[number,number,number];
type Rect={x0:number;y0:number;x1:number;y1:number};
export type Floor=SlabFloor;
const EPS=1e-6;
export const sortGrids=(g:{label:string;at:number}[])=>[...g].sort((a,b)=>a.at-b.at);
export const gridAt=(list:{label:string;at:number}[],label:string)=>list.find(g=>g.label===label)?.at;
const fmt=(v:number)=>Math.round(Math.abs(v)).toLocaleString('en-US');
/** Position as “grid + distance” (nearest grid at or below the value): `B +1,200`; below the first grid `A −300`. */
export function gridRef(list:{label:string;at:number}[],v:number):string{
 const g=sortGrids(list);if(!g.length)return fmt(v);
 const base=[...g].reverse().find(x=>x.at<=v+EPS)||g[0],d=v-base.at;
 return `${base.label} ${d<0?'−':'+'}${fmt(d)}`;
}
/** Parses “B +1,200”, “B+1200”, “B -300” or a plain number (absolute mm); undefined when the grid is unknown. */
export function parseGridRef(list:{label:string;at:number}[],text:string):number|undefined{
 const t=text.trim().replace(/,/g,'').replace(/−/g,'-');if(!t)return;
 if(/^-?\d+(\.\d+)?$/.test(t))return Number(t);
 const m=t.match(/^([A-Za-z0-9.'-]+?)\s*([+-])\s*(\d+(?:\.\d+)?)$/)||t.match(/^([A-Za-z0-9.'-]+)$/);if(!m)return;
 const at=gridAt(list,m[1]);if(at===undefined)return;
 return m[2]?at+(m[2]==='-'?-1:1)*Number(m[3]):at;
}

// ---------- polygons ----------
const ringArea=(r:P2[])=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
export const polyArea=(r:P2[])=>Math.abs(ringArea(r));
const openRing=(r:P2[])=>r.length>1&&r[0][0]===r.at(-1)![0]&&r[0][1]===r.at(-1)![1]?r.slice(0,-1):r;
const mpArea=(mp:MultiPolygon)=>mp.reduce((n,poly)=>n+poly.reduce((a,ring,k)=>a+(k?-1:1)*polyArea(openRing(ring as P2[])),0),0);
const rectRing=(r:Rect):P2[]=>[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
const asPoly=(r:P2[]):Polygon=>[r];
const bboxOf=(r:P2[]):Rect=>({x0:Math.min(...r.map(p=>p[0])),y0:Math.min(...r.map(p=>p[1])),x1:Math.max(...r.map(p=>p[0])),y1:Math.max(...r.map(p=>p[1]))});
export function inRing(p:P2,r:P2[]){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const inRect=(p:P2,r:Rect,t=0)=>p[0]>=r.x0-t&&p[0]<=r.x1+t&&p[1]>=r.y0-t&&p[1]<=r.y1+t;
const overlapArea=(a:P2[],b:P2[])=>{try{return mpArea(polygonClipping.intersection(asPoly(a),asPoly(b)));}catch{return 0;}};
const centroid=(r:P2[]):P2=>{const a=ringArea(r);if(Math.abs(a)<EPS){return [r.reduce((n,p)=>n+p[0],0)/r.length,r.reduce((n,p)=>n+p[1],0)/r.length];}
 let cx=0,cy=0;r.forEach((p,i)=>{const q=r[(i+1)%r.length],f=p[0]*q[1]-q[0]*p[1];cx+=(p[0]+q[0])*f;cy+=(p[1]+q[1])*f;});return [cx/(6*a),cy/(6*a)];};

// ---------- beams / panels / openings ----------
export type BeamRect=Rect&{beam:FloorBeam};
/** Plan rectangle of a reference beam (ends run to the far face of the crossing beams on the end grids). */
export function beamRect(f:Floor,b:FloorBeam):Rect|null{
 const lines=b.along==='X'?f.gridsY:f.gridsX,runs=b.along==='X'?f.gridsX:f.gridsY,c=gridAt(lines,b.line),p=gridAt(runs,b.from),q=gridAt(runs,b.to);
 if(c===undefined||p===undefined||q===undefined||!(b.width>0)||Math.abs(q-p)<EPS)return null;
 const half=(label:string)=>Math.max(0,...f.beams.filter(o=>o.along!==b.along&&o.line===label&&o.width>0).filter(o=>{const r=(b.along==='X'?f.gridsY:f.gridsX),a=gridAt(r,o.from),e=gridAt(r,o.to);return a!==undefined&&e!==undefined&&c>=Math.min(a,e)-EPS&&c<=Math.max(a,e)+EPS;}).map(o=>o.width/2+Math.abs(o.offset||0)));
 const lo=Math.min(p,q),hi=Math.max(p,q),fromLo=p<=q?b.from:b.to,toHi=p<=q?b.to:b.from,mid=c+(b.offset||0),w=b.width/2;
 const u0=lo-half(fromLo),u1=hi+half(toHi);
 return b.along==='X'?{x0:u0,x1:u1,y0:mid-w,y1:mid+w}:{x0:mid-w,x1:mid+w,y0:u0,y1:u1};
}
export const floorBeamRects=(f:Floor):BeamRect[]=>f.beams.flatMap(b=>{const r=beamRect(f,b);return r?[{...r,beam:b}]:[];});
/** One beam per grid line over the whole grid (edit / delete afterwards). */
export function autoBeams(f:Floor,size:{mark:string;width:number;depth:number}):FloorBeam[]{
 const gx=sortGrids(f.gridsX),gy=sortGrids(f.gridsY);if(gx.length<2||gy.length<2)return [];
 return [...gy.map((g,k)=>({id:`bx${k+1}`,mark:size.mark,along:'X' as const,line:g.label,from:gx[0].label,to:gx.at(-1)!.label,width:size.width,depth:size.depth})),
  ...gx.map((g,k)=>({id:`by${k+1}`,mark:size.mark,along:'Y' as const,line:g.label,from:gy[0].label,to:gy.at(-1)!.label,width:size.width,depth:size.depth}))];
}
const nextNo=(used:Set<string>,prefix:string,pad=2)=>{for(let i=1;;i++){const t=`${prefix}${String(i).padStart(pad,'0')}`;if(!used.has(t.toUpperCase()))return t;}};
/** Panels of every grid cell minus the beams (cut at the beam faces), slab mark `mark`. */
export function autoPanels(f:Floor,mark:string):FloorPanel[]{
 const gx=sortGrids(f.gridsX),gy=sortGrids(f.gridsY),beams=floorBeamRects(f).map(r=>asPoly(rectRing(r)));
 const out:FloorPanel[]=[],tags=new Set<string>(),ids=new Set<string>();
 for(let j=0;j+1<gy.length;j++)for(let i=0;i+1<gx.length;i++){
  const cell=rectRing({x0:gx[i].at,y0:gy[j].at,x1:gx[i+1].at,y1:gy[j+1].at});
  let mp:MultiPolygon=[[cell]];try{if(beams.length)mp=polygonClipping.difference(asPoly(cell),...beams);}catch{/* keep the cell */}
  for(const poly of mp){const ring=openRing(poly[0] as P2[]).map(([x,y])=>[Math.round(x*10)/10,Math.round(y*10)/10] as P2);if(polyArea(ring)<1e4)continue;
   const tag=nextNo(tags,`${mark}-`),id=nextNo(ids,'sp',1);tags.add(tag.toUpperCase());ids.add(id.toUpperCase());
   out.push({id,mark,tag,outline:simplify(ring),thickness:0,top:0});}
 }
 return out;
}
/** Tags follow the slab mark (S3 task 0): a panel whose tag is automatic (`<anything>-nn`, not `tagCustom`) but does not start
 * with `<mark>-` gets the next free `<mark>-nn`; typed tags (`tagCustom`, or not of that form) stay. Also the migration of
 * floors saved before (S2 panels re-marked S2 kept `S1-04`). Same object back when nothing changes. */
export function retagPanels(f:Floor):Floor{
 const auto=(p:FloorPanel)=>!p.tagCustom&&/^.+-\d{2,}$/.test(p.tag),wrong=f.panels.filter(p=>auto(p)&&!p.tag.toUpperCase().startsWith(`${p.mark.toUpperCase()}-`));
 if(!wrong.length)return f;const used=new Set(f.panels.filter(p=>!wrong.includes(p)).map(p=>p.tag.toUpperCase()));
 return {...f,panels:f.panels.map(p=>{if(!wrong.includes(p))return p;const tag=nextNo(used,`${p.mark}-`);used.add(tag.toUpperCase());return {...p,tag};})};
}
/** Drops collinear / duplicate vertices. */
export function simplify(r:P2[]):P2[]{
 let pts=r.filter((p,i)=>{const q=r[(i+1)%r.length];return Math.hypot(q[0]-p[0],q[1]-p[1])>0.5;});
 let changed=true;while(changed&&pts.length>3){changed=false;for(let i=0;i<pts.length;i++){const a=pts[(i+pts.length-1)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-3*Math.max(1,Math.hypot(c[0]-a[0],c[1]-a[1]))){pts=pts.filter((_,k)=>k!==i);changed=true;break;}}}
 return pts;
}
/** Two or more touching panels → one (L / polygon) panel with the first panel's id, mark and tag; error text when they do not form one region. */
export function mergePanels(f:Floor,ids:string[]):{floor:Floor}|{error:string}{
 const list=f.panels.filter(p=>ids.includes(p.id));if(list.length<2)return {error:'เลือกแผงอย่างน้อย 2 แผง'};
 let mp:MultiPolygon;try{mp=polygonClipping.union(asPoly(list[0].outline as P2[]),...list.slice(1).map(p=>asPoly(p.outline as P2[])));}catch{return {error:'รวมแผงไม่ได้'};}
 if(mp.length!==1)return {error:'แผงที่เลือกไม่ติดกัน (มีคานคั่น) · ลบ / ย่อคานระหว่างแผงก่อน แล้วสร้างแผงใหม่ หรือรวมเฉพาะแผงที่ติดกัน'};
 if(mp[0].length>1)return {error:'แผงที่รวมแล้วมีรูภายใน · ใช้ช่องเปิดแทน'};
 const outline=simplify(openRing(mp[0][0] as P2[]));if(outline.length>64)return {error:'แผงที่รวมมีจุดยอดเกิน 64 จุด'};
 const first=list[0];return {floor:{...f,panels:f.panels.filter(p=>!ids.includes(p.id)||p.id===first.id).map(p=>p.id===first.id?{...p,outline}:p),openings:f.openings.map(o=>o.panel&&ids.includes(o.panel)?{...o,panel:first.id}:o)}};
}
export function openingRing(o:FloorOpening):P2[]{
 if(o.shape==='rect')return rectRing({x0:o.x,y0:o.y,x1:o.x+o.w,y1:o.y+o.h});
 const r=o.w/2,cx=o.x+r,cy=o.y+r,n=32,k=r*Math.sqrt(2*Math.PI/(n*Math.sin(2*Math.PI/n)));return Array.from({length:n},(_,i)=>[cx+k*Math.cos(2*Math.PI*i/n),cy+k*Math.sin(2*Math.PI*i/n)] as P2);
}
const openingBox=(o:FloorOpening):Rect=>({x0:o.x,y0:o.y,x1:o.x+o.w,y1:o.y+(o.shape==='circle'?o.w:o.h)});
/** Panel holding an opening (stated, else the one with its centre). */
export function openingPanel(f:Floor,o:FloorOpening){const b=openingBox(o),c:P2=[(b.x0+b.x1)/2,(b.y0+b.y1)/2];return f.panels.find(p=>p.id===o.panel)||f.panels.find(p=>inRing(c,p.outline as P2[]));}
export const markOf=(f:Floor,p:FloorPanel)=>f.marks.find(m=>m.name===p.mark);
export function panelSpec(f:Floor,p:FloorPanel):SlabRebarSpec{const m=markOf(f,p);return {...(m?.rebar||DEFAULT_SLAB_REBAR),...(p.rebar||{})} as SlabRebarSpec;}
export const panelThickness=(f:Floor,p:FloorPanel)=>p.thickness>0?p.thickness:markOf(f,p)?.thickness||0;
export const panelSupport=(f:Floor,p:FloorPanel)=>markOf(f,p)?.support||'elevated';
export const groupId=(mark:string)=>`g${mark.replace(/[^a-zA-Z0-9_-]/g,'')}`.slice(0,40);

// ---------- checks ----------
/** Blocking problems of a slab floor (apply is refused while any is listed). */
export function slabFloorProblems(input:SlabInput):string[]{
 const f=input.floor;if(!f)return [];const p:string[]=[],c=input.cover;
 for(const [name,list] of [['X',f.gridsX],['Y',f.gridsY]] as const){
  if(list.length<2)p.push(`กริด ${name}: ต้องมีอย่างน้อย 2 เส้น`);
  const labels=list.map(g=>g.label.toUpperCase()),ats=list.map(g=>Math.round(g.at));
  if(new Set(labels).size!==labels.length)p.push(`กริด ${name}: ชื่อกริดซ้ำ`);if(new Set(ats).size!==ats.length)p.push(`กริด ${name}: ตำแหน่งกริดซ้ำ`);}
 const all=[...f.gridsX,...f.gridsY].map(g=>g.label.toUpperCase());if(new Set(all).size!==all.length)p.push('ชื่อกริด X และ Y ซ้ำกัน (ใช้ A, B… กับ 1, 2…)');
 const ids=[...f.panels.map(x=>x.id),...f.beams.map(x=>x.id),...f.openings.map(x=>x.id),...f.drops.map(x=>x.id)];if(new Set(ids).size!==ids.length)p.push('รหัสรายการซ้ำ (แผง / คาน / ช่องเปิด / Drop)');
 const marks=f.marks.map(m=>m.name.toUpperCase());if(new Set(marks).size!==marks.length)p.push('เบอร์พื้นซ้ำ');
 f.marks.forEach(m=>{if(!(m.thickness>0))p.push(`เบอร์พื้น ${m.name}: ระบุความหนา`);const r=m.rebar;
  for(const [k,l] of [['ล่างด้านสั้น',r.shortBottom],['ล่างด้านยาว',r.longBottom]] as const)if(!(l.diameter>0&&l.spacing>0))p.push(`เบอร์พื้น ${m.name}: ระบุเหล็ก${k}`);
  if(r.topExtra&&r.topExtra.spacing>0&&!(r.topExtra.diameter>0))p.push(`เบอร์พื้น ${m.name}: ระบุขนาดเหล็กบนเสริม`);});
 f.beams.forEach(b=>{const r=beamRect(f,b);if(!r)p.push(`คาน ${b.mark} (${b.line}): กริดอ้างอิงไม่ครบ / ขนาดเป็นศูนย์`);});
 if(!f.panels.length)p.push('ยังไม่มีแผงพื้น');
 const tags=f.panels.map(x=>x.tag.toUpperCase());if(new Set(tags).size!==tags.length)p.push('Tag แผงพื้นซ้ำ');
 if(tags.some(t=>marks.includes(t)))p.push('Tag แผงต้องไม่ซ้ำกับเบอร์พื้น (เช่น S1-01 ในเบอร์ S1)');
 const beams=floorBeamRects(f);
 f.panels.forEach((x,i)=>{const name=`แผง ${x.tag}`,ring=x.outline as P2[];
  if(!markOf(f,x))p.push(`${name}: ไม่พบเบอร์พื้น ${x.mark}`);
  const T=panelThickness(f,x);if(!(T>0))p.push(`${name}: ระบุความหนา`);else if(c.top+c.bottom+24>=T)p.push(`${name}: หนา ${T} ไม่พอสำหรับระยะหุ้มบน ${c.top} + ล่าง ${c.bottom} และเหล็ก 2 ชั้น`);
  if(polyArea(ring)<1e4)p.push(`${name}: พื้นที่แผงเล็กเกินไป`);
  for(let j=i+1;j<f.panels.length;j++)if(overlapArea(ring,f.panels[j].outline as P2[])>100)p.push(`${name} ทับกับแผง ${f.panels[j].tag}`);
  for(const b of beams)if(overlapArea(ring,rectRing(b))>100)p.push(`${name} ทับคาน ${b.beam.mark} แนว ${b.beam.line} · แผงต้องตัดที่หน้าคาน`);});
 f.openings.forEach(o=>{const name=`ช่องเปิด ${o.label||o.id}`;if(!(o.w>0)||o.shape==='rect'&&!(o.h>0)){p.push(`${name}: ระบุขนาด`);return;}
  const ring=openingRing(o),host=openingPanel(f,o);
  if(!host||overlapArea(ring,host.outline as P2[])<polyArea(ring)-1)p.push(`${name}: ออกนอกแผงพื้น`);
  for(const b of beams)if(overlapArea(ring,rectRing(b))>1)p.push(`${name}: ทับคาน ${b.beam.mark} แนว ${b.beam.line}`);});
 f.drops.forEach(d=>{const name=`${d.kind==='drop'?'Drop':'พื้นลดระดับ'} ${d.label||d.id}`,ring=d.outline as P2[],host=f.panels.find(x=>inRing(centroid(ring),x.outline as P2[]));
  if(!(d.depth>0))p.push(`${name}: ระบุความลึก`);if(!host||overlapArea(ring,host.outline as P2[])<polyArea(ring)-1)p.push(`${name}: ต้องอยู่ภายในแผงเดียว`);});
 const parts=f.panels.length+f.beams.length+f.openings.length+f.drops.reduce((n,d)=>n+(d.kind==='sunken'?2:1),0);if(parts>160)p.push(`ชิ้นส่วนรวม ${parts} เกิน 160 (แผง + คาน + ช่องเปิด + Drop)`);
 return [...new Set(p)];
}

// ---------- shape model ----------
/** Shape model of the floor in floor coordinates (not normalised). */
export function floorShapeModel(input:SlabInput):ShapeModel{
 const f=input.floor!,parts:ShapePart[]=[],src='พื้นทั้งชั้น (กริด)';
 const zs:number[]=[];
 for(const p of f.panels){const T=panelThickness(f,p);zs.push(p.top-T,p.top);
  parts.push({id:p.id,label:`พื้น ${p.mark} · ${p.tag}`.slice(0,80),tag:p.tag,role:'solid',stage:1,z0:p.top-T,height:T,formSides:true,formBottom:panelSupport(f,p)==='elevated',source:src,shape:'polygon',points:p.outline as P2[]});}
 for(const d of f.drops){const host=f.panels.find(x=>inRing(centroid(d.outline as P2[]),x.outline as P2[]));if(!host||!(d.depth>0))continue;
  const T=panelThickness(f,host),b=host.top-T,elev=panelSupport(f,host)==='elevated',lab=(d.label||d.id).slice(0,60);
  if(d.kind==='drop'){zs.push(b-d.depth);parts.push({id:d.id,label:`Drop ${lab}`,role:'solid',stage:1,z0:b-d.depth,height:d.depth,formSides:true,formBottom:elev,source:src,shape:'polygon',points:d.outline as P2[]});}
  else{zs.push(b-d.depth);parts.push({id:`${d.id}v`.slice(0,40),label:`พื้นลดระดับ ${lab} (ส่วนที่ลด)`,role:'void',stage:1,z0:host.top-d.depth,height:d.depth,formSides:true,formBottom:false,source:src,shape:'polygon',points:d.outline as P2[]},
   {id:d.id,label:`พื้นลดระดับ ${lab}`,role:'solid',stage:1,z0:b-d.depth,height:Math.min(d.depth,T),formSides:true,formBottom:elev,source:src,shape:'polygon',points:d.outline as P2[]});}}
 const zlo=Math.min(...zs,0)-1,zhi=Math.max(...zs,0)+1;
 for(const o of f.openings){const b=openingBox(o),lab=(o.label||o.id).slice(0,60);
  parts.push(o.shape==='rect'?{id:o.id,label:`ช่องเปิด ${lab}`,role:'void',stage:1,z0:zlo,height:zhi-zlo,formSides:true,formBottom:false,source:src,shape:'box',x:b.x0,y:b.y0,w:o.w,d:o.h}
   :{id:o.id,label:`ช่องเปิด ${lab}`,role:'void',stage:1,z0:zlo,height:zhi-zlo,formSides:true,formBottom:false,source:src,shape:'circle',cx:b.x0+o.w/2,cy:b.y0+o.w/2,diameter:o.w,inner:0});}
 for(const r of floorBeamRects(f)){const b=r.beam;
  parts.push({id:b.id,label:`คาน ${b.mark} แนว ${b.line} (${b.from}–${b.to})`.slice(0,80),role:'reference',castWith:true,stage:1,z0:-b.depth,height:Math.max(1,b.depth),formSides:false,formBottom:false,source:'คานอ้างอิง (ไม่คิดปริมาณในสมาชิกพื้น)',shape:'box',x:r.x0,y:r.y0,w:r.x1-r.x0,d:r.y1-r.y0});}
 const byMark=new Map<string,string[]>();for(const p of f.panels)byMark.set(p.mark,[...(byMark.get(p.mark)||[]),p.id]);
 const groups=[...byMark].filter(([,ids])=>ids.length>=2).slice(0,20).map(([mark,ids])=>({id:groupId(mark),tag:mark,label:`เบอร์พื้น ${mark}`,parts:ids.slice(0,40)}));
 return {version:1,parts,confirmed:true,note:`พื้นทั้งชั้น ระดับ ${f.level>=0?'+':''}${f.level.toFixed(3)} m · สร้างจากแปลนพื้น (แก้ที่แท็บข้อมูลพื้นฐาน)`,...(groups.length?{groups}:{}),...(f.panels.some(p=>panelSupport(f,p)==='elevated')?{soffit:true}:{})};
}

// ---------- bars ----------
type Raw={kind:'B'|'T'|'OP'|'OD';layer:string;d:number;pts:V3[];panels:string[];mark:string;what:string;
 /** design spacing (mm) of the layer the bar comes from (labels of the slab sheet; not stored) */ s?:number};
export type OpeningStat={cut:{X:number;Y:number};trim:number;diag:number;kg:number;deviated:boolean;fallback?:string};
export type FloorBarsResult={raw:Raw[];openings:Map<string,OpeningStat>;warnings:string[]};
const kgOf=(r:Raw)=>{let L=0;for(let i=1;i<r.pts.length;i++){const a=r.pts[i-1],b=r.pts[i];L+=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);}return L/1000*r.d*r.d/162.2;};
/** Development length Ld (straight, tension) ≈ Class B lap / 1.3 (ACI 318 25.5.2), ≥ 300, rounded up to 25 mm. */
export const devLength=(det:Detailing,d:number,top=false)=>Math.ceil(Math.max(300,lapLength(det,d,top)/1.3)/25)*25;
const spreadAt=(lo:number,hi:number,s:number)=>{if(!(s>0)||hi<lo-EPS)return [];const n=hi-lo<EPS?1:Math.ceil((hi-lo)/s-1e-9)+1;return Array.from({length:n},(_,k)=>n===1?lo:lo+(hi-lo)*k/(n-1));};
type Dir='X'|'Y';
const ax=(D:Dir)=>D==='X'?0:1;
const P3=(D:Dir,u:number,v:number,z:number):V3=>D==='X'?[u,v,z]:[v,u,z];
type Ctx={f:Floor;input:SlabInput;det:Detailing;beams:BeamRect[];warn:(s:string)=>void;raw:Raw[];ops:Map<string,OpeningStat>};
/** Panel layer levels: B1 = short-span bottom bars (outer), B2 long; T1 = short-span top (outer), T2 long. */
function levels(c:Ctx,p:FloorPanel){
 const f=c.f,r=panelSpec(f,p),T=panelThickness(f,p),bb=p.top-T,cv=c.input.cover,bx=bboxOf(p.outline as P2[]),shortX=bx.x1-bx.x0<=bx.y1-bx.y0+EPS;
 const d1=r.shortBottom.diameter,d2=r.longBottom.diameter,t1=r.shortTop.spacing>0?r.shortTop.diameter:r.topExtra?.diameter||12,t2=r.longTop.spacing>0?r.longTop.diameter:r.topExtra?.diameter||12;
 const shortD:Dir=shortX?'X':'Y';
 const bottom=(D:Dir)=>D===shortD?{z:bb+cv.bottom+d1/2,bar:r.shortBottom,layer:'B1'}:{z:bb+cv.bottom+d1+d2/2,bar:r.longBottom,layer:'B2'};
 const top=(D:Dir)=>D===shortD?{z:p.top-cv.top-t1/2,bar:r.shortTop,layer:'T1'}:{z:p.top-cv.top-t1-t2/2,bar:r.longTop,layer:'T2'};
 return {r,T,bb,bx,shortD,bottom,top,clearShort:Math.min(bx.x1-bx.x0,bx.y1-bx.y0)};
}
const beamAt=(c:Ctx,pt:P2)=>c.beams.find(b=>inRect(pt,b,.01));
const panelAt=(c:Ctx,pt:P2,not?:string)=>c.f.panels.find(p=>p.id!==not&&inRing(pt,p.outline as P2[]));
/** Openings that cut a bar line (method cut / none, or deviate that fell back) → hole intervals along the line. */
function holes(c:Ctx,D:Dir,v:number,d:number,panel:FloorPanel):[number,number][]{
 const ce=c.input.cover.edge,out:[number,number][]=[];
 for(const o of c.f.openings){if(openingPanel(c.f,o)?.id!==panel.id)continue;if(o.trim.method==='deviate'&&!c.ops.get(o.id)?.fallback)continue;
  const b=openingBox(o),k=ce+d/2;
  if(o.shape==='circle'){const R=o.w/2,cx=b.x0+R,cy=b.y0+R,[cu,cv]=D==='X'?[cx,cy]:[cy,cx],dv=v-cv,RR=R+k;if(Math.abs(dv)<RR){const h=Math.sqrt(RR*RR-dv*dv);out.push([cu-h,cu+h]);}continue;}
  const [u0,u1,v0,v1]=D==='X'?[b.x0,b.x1,b.y0,b.y1]:[b.y0,b.y1,b.x0,b.x1];if(v>v0-k&&v<v1+k)out.push([u0-k,u1+k]);}
 return out;
}
/** Deviate: bar lines passing through a small opening move beside it. */
function deviated(c:Ctx,D:Dir,vs:number[],d:number,panel:FloorPanel){
 const ce=c.input.cover.edge;return vs.map(v=>{for(const o of c.f.openings){if(o.trim.method!=='deviate'||c.ops.get(o.id)?.fallback||openingPanel(c.f,o)?.id!==panel.id)continue;const b=openingBox(o),[v0,v1]=D==='X'?[b.y0,b.y1]:[b.x0,b.x1],k=ce+d/2;
  if(v>v0-k&&v<v1+k){c.ops.get(o.id)!.deviated=true;return v-(v0-k)<(v1+k)-v?v0-k:v1+k;}}return v;});
}
const cutSpan=(lo:number,hi:number,hs:[number,number][],min:number)=>{let parts:[number,number][]=[[lo,hi]];for(const [h0,h1] of hs)parts=parts.flatMap(([p,q])=>h1<=p||h0>=q?[[p,q] as [number,number]]:[...(h0>p?[[p,h0] as [number,number]]:[]),...(h1<q?[[h1,q] as [number,number]]:[])]);return parts.filter(([p,q])=>q-p>=min);};

/** beam = interval ends at a beam face; free = slab edge (bar stops at the edge cover); cut = opening (hole interval already includes the cover) */
type End={kind:'beam';beam:BeamRect;face:number;far:number}|{kind:'free';at:number}|{kind:'cut';at:number};
type Piece={panel:FloorPanel;a:number;b:number;v:number;z:number;d:number;layer:string;sA:End;sB:End;cont:boolean};
/** Classifies the end of a concrete interval: at a beam face (bar may run into it) or a free edge. */
function endAt(c:Ctx,D:Dir,u:number,v:number,dir:-1|1):End{
 const q=P3(D,u+dir*2,v,0),b=beamAt(c,[q[0],q[1]]);if(!b)return {kind:'free',at:u};
 const [lo,hi]=D==='X'?[b.x0,b.x1]:[b.y0,b.y1];return {kind:'beam',beam:b,face:u,far:dir>0?hi:lo};
}
/** Bar pieces of one layer of a panel along D (polygon intervals at each bar line, cut at openings). */
function pieces(c:Ctx,p:FloorPanel,D:Dir,which:'bottom'|'top'):Piece[]{
 const L=levels(c,p),lay=which==='bottom'?L.bottom(D):L.top(D),bar=lay.bar,d=bar.diameter,ce=c.input.cover.edge;if(!(bar.spacing>0&&d>0))return [];
 const o=ax(D)===0?1:0,lo=o===0?L.bx.x0:L.bx.y0,hi=o===0?L.bx.x1:L.bx.y1;
 const vs=deviated(c,D,spreadAt(lo+ce+d/2,hi-ce-d/2,bar.spacing),d,p),out:Piece[]=[],mp:MultiPolygon=[[p.outline as P2[]]];
 for(const v of vs)for(const [a,b] of multiIntervals(mp,ax(D) as 0|1,v)){
  const sA=endAt(c,D,a,v,-1),sB=endAt(c,D,b,v,1);
  for(const [x0,x1] of cutSpan(a,b,holes(c,D,v,d,p),Math.max(12*d,150)))
   out.push({panel:p,a:x0,b:x1,v,z:lay.z,d,layer:lay.layer,sA:Math.abs(x0-a)<EPS?sA:{kind:'cut',at:x0},sB:Math.abs(x1-b)<EPS?sB:{kind:'cut',at:x1},cont:L.r.bottomAtBeam==='continuous'});}
 return out;
}
/** Points (u, z) of a run between two levels: crank 1:6 centred on the beam when the levels differ. */
type Run={items:Piece[];pts:[number,number][];cranks:number};
function chain(list:Piece[],which:'bottom'|'top'):Run[]{
 const sorted=[...list].sort((x,y)=>x.a-y.a),runs:Run[]=[];
 for(const pc of sorted){const last=runs.at(-1),prev=last?.items.at(-1);
  const join=prev&&prev.sB.kind==='beam'&&pc.sA.kind==='beam'&&prev.sB.beam===pc.sA.beam&&prev.d===pc.d&&prev.layer===pc.layer&&Math.abs(prev.z-pc.z)<=75+EPS&&(which==='top'||prev.cont&&pc.cont);
  if(join&&last){const mid=(prev.b+pc.a)/2,dz=pc.z-prev.z;
   // the previous end point is collinear: drop it so a crank wider than the beam keeps the run u-monotone
   last.pts.pop();if(Math.abs(dz)>EPS){last.pts.push([mid-3*Math.abs(dz),prev.z],[mid+3*Math.abs(dz),pc.z]);last.cranks++;}
   last.pts.push([pc.b,pc.z]);last.items.push(pc);}
  else runs.push({items:[pc],pts:[[pc.a,pc.z],[pc.b,pc.z]],cranks:0});}
 return runs;
}
/** Sub-polyline of an (u-monotone) run between u = s and e. */
function clip(pts:[number,number][],s:number,e:number):[number,number][]{
 const at=(u:number):[number,number]=>{for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(u>=a[0]-EPS&&u<=b[0]+EPS){const t=b[0]-a[0]<EPS?0:(u-a[0])/(b[0]-a[0]);return [u,a[1]+(b[1]-a[1])*t];}}return u<pts[0][0]?pts[0]:pts.at(-1)!;};
 return [at(s),...pts.filter(p=>p[0]>s+EPS&&p[0]<e-EPS),at(e)];
}
const leg=(c:Ctx,d:number,room:number)=>Math.max(0,Math.min(c.det.hook90*d+bendRadius(d,c.det),room));
/** Runs of one layer along D for the whole floor → raw bars (laps at beams, ≤ stock length). */
function layerBars(c:Ctx,D:Dir,which:'bottom'|'top'){
 const all=c.f.panels.flatMap(p=>pieces(c,p,D,which)),byLine=new Map<string,Piece[]>(),ce=c.input.cover.edge,cv=c.input.cover;
 for(const pc of all){const k=`${Math.round(pc.v*10)}|${pc.d}`;byLine.set(k,[...(byLine.get(k)||[]),pc]);}
 for(const list of byLine.values())for(const run of chain(list,which)){
  const first=run.items[0],last=run.items.at(-1)!,d=first.d,top=which==='top';
  // run ends: into the beam (bottom ≥ 150 / half the beam, top to the far face) or at the edge cover
  const endInfo=(e:End,dir:-1|1,pc:Piece)=>{
   if(e.kind==='cut')return {u:e.at,down:0,ubar:false};
   if(e.kind==='free')return {u:e.at-dir*(ce+d/2),down:0,ubar:top&&panelSpec(c.f,pc.panel).edge==='ubar'};
   const w=Math.abs(e.far-e.face),edge=!panelAt(c,P3(D,e.far+dir*2,pc.v,0).slice(0,2) as P2),spec=panelSpec(c.f,pc.panel);
   if(!top)return {u:e.face+dir*Math.min(w-ce-d/2,Math.max(150,w/2)),down:0,ubar:false};
   const u=e.far-dir*(ce+d/2);
   if(edge&&spec.edge==='ubar')return {u,down:0,ubar:true};
   const depth=e.beam.beam.depth;return {u,down:leg(c,d,pc.z-(-depth)-cv.bottom-d/2),ubar:false};};
  const s0=endInfo(first.sA,-1,first),s1=endInfo(last.sB,1,last);
  const pts=run.pts.map(p=>[...p] as [number,number]);pts[0][0]=s0.u;pts[pts.length-1][0]=s1.u;
  // split ≤ stock: laps centred on the beams crossed, else mid-span
  const lap=lapLength(c.det,d,top),stock=c.det.stockLength,joints=run.items.slice(1).map((pc,k)=>(run.items[k].b+pc.a)/2);
  const lenOf=(s:number,e:number)=>{const q=clip(pts,s,e);let n=0;for(let i=1;i<q.length;i++)n+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);return n;};
  const cuts:[number,number][]=[];let s=pts[0][0];const end=pts.at(-1)![0];let guard=0;
  while(guard++<200){const extra=(s===pts[0][0]?s0.down:0);
   if(lenOf(s,end)+extra+s1.down<=stock+EPS){cuts.push([s,end]);break;}
   const ok=joints.filter(j=>j-lap/2>s+lap&&lenOf(s,Math.min(end,j+lap/2))+extra<=stock);
   if(ok.length){const j=ok.at(-1)!;cuts.push([s,j+lap/2]);s=j-lap/2;}
   else{let e=s+stock-extra;while(lenOf(s,e)+extra>stock&&e>s+lap)e-=25;cuts.push([s,e]);s=e-lap;}}
  if(cuts.length>1)c.warn(`${first.panel.tag}: เหล็ก${top?'บน':'ล่าง'} DB${d} แนว ${D} ยาวเกินเหล็กเส้น ${stock} mm · แบ่งเป็น ${cuts.length} ท่อน ทาบ ${Math.round(lap)} mm${joints.length?' ที่คาน':''}`);
  cuts.forEach(([a,b],k)=>{
   let q=clip(pts,a,b).map(([u,z])=>P3(D,u,first.v,z));
   if(k===0&&s0.down>0)q=[P3(D,a,first.v,first.z-s0.down),...q];
   if(k===cuts.length-1&&s1.down>0)q=[...q,P3(D,b,first.v,last.z-s1.down)];
   const panels=[...new Set(run.items.filter(pc=>pc.b>a-EPS&&pc.a<b+EPS).map(pc=>pc.panel.id))];
   const ly=which==='bottom'?levels(c,first.panel).bottom(D):levels(c,first.panel).top(D),lay=ly.layer;
   c.raw.push({kind:top?'T':'B',layer:lay,d,s:ly.bar.spacing,pts:q,panels,mark:first.panel.mark,what:`${top?'เหล็กบน':'เหล็กล่าง'} แนว ${D}${run.cranks?` · คอม้า 1:6 ${run.cranks} จุด`:''}${cuts.length>1?` · ท่อน ${k+1}/${cuts.length} ทาบ ${Math.round(lap)}`:''}`});});
  // U bars closing the outer edge (top bars stop straight there)
  for(const [e,dir,pc] of [[s0,-1,first],[s1,1,last]] as const)if(e.ubar)uBar(c,D,pc,e.u,dir,d,(which==='bottom'?levels(c,pc.panel).bottom(D):levels(c,pc.panel).top(D)).bar.spacing);
 }
}
/** U bar at an outer edge: vertical at u (edge − cover), legs into the slab along −dir. */
function uBar(c:Ctx,D:Dir,pc:Piece,u:number,dir:-1|1,d:number,sp?:number){
 const L=levels(c,pc.panel),[zt,zb]=uLevels(c,pc.panel,d),leg=Math.max(lapLength(c.det,d),300);
 c.raw.push({kind:'T',layer:`${L.top(D).layer}/${L.bottom(D).layer}`,d,s:sp,pts:[P3(D,u-dir*leg,pc.v,zt),P3(D,u,pc.v,zt),P3(D,u,pc.v,zb),P3(D,u-dir*leg,pc.v,zb)],panels:[pc.panel.id],mark:pc.panel.mark,what:`เหล็ก U ปิดขอบพื้น แนว ${D}`});
}
/** Extra top bars over each beam (perpendicular to it). */
function extraTop(c:Ctx){
 const ce=c.input.cover.edge,cv=c.input.cover;
 for(const B of c.beams){const along:Dir=B.beam.along,D:Dir=along==='X'?'Y':'X',[a0,a1]=along==='X'?[B.x0,B.x1]:[B.y0,B.y1],[lo,hi]=D==='X'?[B.x0,B.x1]:[B.y0,B.y1];
  // panels touching each face, with their extent along the beam
  const side=(s:-1|1)=>c.f.panels.flatMap(p=>{const L=levels(c,p),e=L.r.topExtra;if(!e||!(e.spacing>0&&e.diameter>0))return [];const face=s<0?lo:hi;
   const iv=multiIntervals([[p.outline as P2[]]],ax(along) as 0|1,face+s*2).map(([x,y])=>[Math.max(x,a0),Math.min(y,a1)] as [number,number]).filter(([x,y])=>y-x>50);return iv.map(iv=>({p,iv,L,e}));});
  const left=side(-1),right=side(1);if(!left.length&&!right.length)continue;
  const len=(L:ReturnType<typeof levels>,e:NonNullable<SlabRebarSpec['topExtra']>,other?:ReturnType<typeof levels>)=>{
   if(e.length.mode==='ratio')return Math.max(L.clearShort,other?.clearShort||0)/e.length.n;
   return e.length.from==='face'?e.length.value:Math.max(0,e.length.value-(hi-lo)/2);};
  for(const l of [...left,...right]){const s=left.includes(l)?-1:1,e=l.e,d=e.diameter,lay=l.L.top(D);
   for(const v of spreadAt(l.iv[0]+ce+d/2,l.iv[1]-ce-d/2,e.spacing)){
    const mate=(s<0?right:left).find(x=>v>=x.iv[0]-EPS&&v<=x.iv[1]+EPS&&x.e.diameter===d),joined=!!mate&&Math.abs(mate.p.top-l.p.top)<=75+EPS;
    // bars across an interior beam are built from the lower side; the other side only adds where it has no mate
    if(joined&&s>0)continue;
    const own=len(l.L,e,mate?.L),start=(s<0?lo:hi)+s*own;
    if(mate&&joined){
     const far=s<0?hi:lo,olen=len(mate.L,mate.e,l.L),end=far-s*olen,dz=mate.p.top-l.p.top,z1=lay.z+dz,mid=(lo+hi)/2;
     let q:[number,number][]=[[start,lay.z],[end,z1]];if(Math.abs(dz)>EPS)q=[[start,lay.z],[mid+s*3*Math.abs(dz),lay.z],[mid-s*3*Math.abs(dz),z1],[end,z1]];
     cutRaw(c,D,v,q,d,l.p,[l.p.id,mate.p.id],`เหล็กบนเสริมที่คาน ${B.beam.mark} แนว ${B.beam.line}${Math.abs(dz)>EPS?' · คอม้า 1:6':''}`,lay.layer,true,0,e.spacing);continue;}
    // edge beam / separate levels: run to the far face, turn down into the beam (or U bar at the edge)
    const farU=(s<0?hi:lo)+s*(ce+d/2),edge=!mate&&!panelAt(c,P3(D,(s<0?hi:lo)-s*2,v,0).slice(0,2) as P2);
    if(edge&&l.L.r.edge==='ubar'){const pc:Piece={panel:l.p,a:start,b:farU,v,z:lay.z,d,layer:lay.layer,sA:{kind:'free',at:start},sB:{kind:'free',at:farU},cont:true};uBarAt(c,D,pc,farU,s as -1|1,d,own+Math.abs(farU-(s<0?lo:hi)),e.spacing);continue;}
    const down=leg(c,d,lay.z+B.beam.depth-cv.bottom-d/2),pts:[number,number][]=[[start,lay.z],[farU,lay.z]];
    cutRaw(c,D,v,pts,d,l.p,[l.p.id],`เหล็กบนเสริมที่คาน${edge?'ริม':''} ${B.beam.mark} แนว ${B.beam.line}${mate?' · แยกต่างระดับ งอฉากยึดในคาน':' · งอฉากลงในคาน'}`,lay.layer,true,down,e.spacing);}}}
}
/** U bars wrap the edge outermost: top / bottom at the covers. */
const uLevels=(c:Ctx,p:FloorPanel,d:number)=>[p.top-c.input.cover.top-d/2,p.top-panelThickness(c.f,p)+c.input.cover.bottom+d/2];
function uBarAt(c:Ctx,D:Dir,pc:Piece,u:number,dir:-1|1,d:number,legLen:number,sp?:number){
 const L=levels(c,pc.panel),[zt,zb]=uLevels(c,pc.panel,d);
 c.raw.push({kind:'T',layer:`${L.top(D).layer}/${L.bottom(D).layer}`,d,s:sp,pts:[P3(D,u+dir*legLen,pc.v,zt),P3(D,u,pc.v,zt),P3(D,u,pc.v,zb),P3(D,u+dir*legLen,pc.v,zb)],panels:[pc.panel.id],mark:pc.panel.mark,what:'เหล็ก U ปิดขอบพื้น (บนเสริมที่คานริม)'});
}
/** Straight-ish bar along D at v (u, z points) cut at openings of the panel; `down` = 90° leg at the end (into the beam). */
function cutRaw(c:Ctx,D:Dir,v:number,pts:[number,number][],d:number,p:FloorPanel,panels:string[],what:string,layer:string,top:boolean,down=0,sp?:number){
 const sorted=pts[0][0]<=pts.at(-1)![0],q=sorted?pts:[...pts].reverse(),hs=c.f.panels.filter(x=>panels.includes(x.id)).flatMap(x=>holes(c,D,v,d,x));
 const parts=cutSpan(q[0][0],q.at(-1)![0],hs,Math.max(12*d,150));
 parts.forEach(([a,b])=>{let r=clip(q,a,b).map(([u,z])=>P3(D,u,v,z));
  // the leg is at the last given point (the beam end)
  if(down>0){const tip=pts.at(-1)!;if(sorted&&Math.abs(b-tip[0])<EPS)r=[...r,P3(D,b,v,tip[1]-down)];else if(!sorted&&Math.abs(a-tip[0])<EPS)r=[P3(D,a,v,tip[1]-down),...r];}
  c.raw.push({kind:top?'T':'B',layer,d,s:sp,pts:r,panels,mark:p.mark,what:parts.length>1?`${what} (ตัดที่ช่องเปิด)`:what});});
}
/** Trimmers / diagonals around each opening; cut statistics for the panel. */
function openingBars(c:Ctx){
 const ce=c.input.cover.edge;
 for(const o of c.f.openings){const p=openingPanel(c.f,o),st=c.ops.get(o.id)!;if(!p)continue;const L=levels(c,p),b=openingBox(o);
  for(const D of ['X','Y'] as Dir[]){
   const [v0,v1,u0,u1]=D==='X'?[b.y0,b.y1,b.x0,b.x1]:[b.x0,b.x1,b.y0,b.y1],o2=D==='X'?1:0,plo=o2===0?L.bx.x0:L.bx.y0,phi=o2===0?L.bx.x1:L.bx.y1;
   const layers=[...(o.trim.layers!=='top'?[L.bottom(D)]:[]),...(o.trim.layers!=='bottom'?[L.top(D)]:[])].filter(l=>l.bar.spacing>0&&l.bar.diameter>0);
   for(const lay of [L.bottom(D),L.top(D)].filter(l=>l.bar.spacing>0)){const d=lay.bar.diameter,k=ce+d/2,vs=spreadAt(plo+ce+d/2,phi-ce-d/2,lay.bar.spacing),n=vs.filter(v=>v>v0-k&&v<v1+k).length;
    if(lay.layer.startsWith('B')){st.cut[D]+=o.trim.method==='deviate'&&!st.fallback?0:n;if(n>vs.length/2&&o.trim.method!=='deviate')c.warn(`ช่องเปิด ${o.label||o.id}: ตัดเหล็ก${lay.layer} ${n} จาก ${vs.length} เส้น (เกินครึ่งแผง ${p.tag}) · ตรวจกับผู้ออกแบบ`);}}
   if(o.trim.method!=='cut'&&!(o.trim.method==='deviate'&&st.fallback))continue;
   for(const lay of layers){const d0=lay.bar.diameter,k=ce+d0/2,n=spreadAt(plo+ce+d0/2,phi-ce-d0/2,lay.bar.spacing).filter(v=>v>v0-k&&v<v1+k).length;if(!n)continue;
    const per=o.trim.bars==='area'?Math.ceil(n/2):o.trim.bars.count,d=o.trim.bars==='area'?d0:o.trim.bars.diameter;
    const ext=o.trim.ext==='ld'?devLength(c.det,d,lay.layer.startsWith('T')):o.trim.ext==='lap'?lapLength(c.det,d,lay.layer.startsWith('T')):o.trim.ext;
    const gap=Math.max(2*d,d+25);
    for(const s of [-1,1] as const)for(let j=0;j<per;j++){const v=s<0?v0-ce-d/2-j*gap:v1+ce+d/2+j*gap;
     // trimmers stay inside the panel (cover)
     const iv=multiIntervals([[p.outline as P2[]]],ax(D) as 0|1,v)[0];if(!iv)continue;const a=Math.max(iv[0]+ce+d/2,u0-ext),e=Math.min(iv[1]-ce-d/2,u1+ext);if(e-a<300)continue;
     c.raw.push({kind:'OP',layer:lay.layer,d,pts:[P3(D,a,v,lay.z),P3(D,e,v,lay.z)],panels:[p.id],mark:p.mark,what:`เหล็กเสริมขอบช่องเปิด ${o.label||o.id} แนว ${D} (${o.trim.bars==='area'?'แทนพื้นที่เหล็กที่ถูกตัด':'กำหนดเอง'}) ยื่นเลยมุม ${Math.round(ext)}`});st.trim++;st.kg+=kgOf(c.raw.at(-1)!);}}
  }
  if(!o.trim.diagonal||o.trim.method==='none'||o.trim.method==='deviate'&&!st.fallback)continue;
  const sets=[...(o.trim.layers!=='top'?[{zl:L.bottom(L.shortD==='X'?'Y':'X'),up:1,top:false}]:[]),...(o.trim.layers!=='bottom'&&(L.r.shortTop.spacing>0||L.r.longTop.spacing>0)?[{zl:L.top(L.shortD==='X'?'Y':'X'),up:-1,top:true}]:[])];
  for(const s of sets){const d=o.trim.bars==='area'?s.zl.bar.diameter||12:o.trim.bars.diameter,z=s.zl.z+s.up*(s.zl.bar.diameter/2+d/2),ext=o.trim.ext==='ld'?devLength(c.det,d,s.top):o.trim.ext==='lap'?lapLength(c.det,d,s.top):o.trim.ext;
   ([[b.x0,b.y0,-1,-1],[b.x1,b.y0,1,-1],[b.x0,b.y1,-1,1],[b.x1,b.y1,1,1]] as const).forEach(([cx,cy,sx,sy])=>{
    const off=(ce+d)/Math.SQRT2,mx=cx+sx*off,my=cy+sy*off,ux=sx/Math.SQRT2,uy=-sy/Math.SQRT2,ring=p.outline as P2[];
    const inside=(t:number)=>{const q:P2=[mx+ux*t,my+uy*t];return inRing(q,ring)&&!c.f.openings.some(x=>inRing(q,openingRing(x)));};
    let h=ext;while(h>150&&!(inside(h+ce)&&inside(-h-ce)))h-=25;if(h<=150)return;
    // drawn left → right: diagonals of opposite corners are the same bar (one Mark, "2-DB12")
    const sg=ux<0?-1:1;c.raw.push({kind:'OD',layer:s.top?'T':'B',d,pts:[[mx-sg*ux*h,my-sg*uy*h,z],[mx+sg*ux*h,my+sg*uy*h,z]],panels:[p.id],mark:p.mark,what:`เหล็กทแยงมุมช่องเปิด ${o.label||o.id} ${s.top?'(บน)':'(ล่าง)'} ยาว ${Math.round(2*h)}`});st.diag++;st.kg+=kgOf(c.raw.at(-1)!);});}
 }
}
/** Drops (extra bottom mesh or cranked bottom bars) and sunken areas (cranked or separate meshes + Ld anchors). */
function dropBars(c:Ctx){
 const ce=c.input.cover.edge,cv=c.input.cover;
 for(const dr of c.f.drops){const ring=dr.outline as P2[],host=c.f.panels.find(x=>inRing(centroid(ring),x.outline as P2[]));if(!host||!(dr.depth>0))continue;
  const L=levels(c,host),crank=dr.rebar==='crank'&&dr.depth<=75+EPS,name=`${dr.kind==='drop'?'Drop':'พื้นลดระดับ'} ${dr.label||dr.id}`,bx=bboxOf(ring);
  if(dr.rebar==='crank'&&!crank)c.warn(`${name}: ต่างระดับ ${dr.depth} mm เกิน 75 · ใช้เหล็กแยก + เหล็กยึด Ld แทนคอม้า`);
  const dip=(r:Raw,D:Dir,top:boolean)=>{
   // bar line crossing the area: cranks 1:6 down by depth inside it (bottom bars after the edge + cover, top bars before it)
   // only bar lines at least cover + d/2 inside the area dip (lines closer to its side faces pass straight above / below)
   const v=D==='X'?r.pts[0][1]:r.pts[0][0],k=ce+r.d/2,hit=(t:number)=>multiIntervals([[ring]],ax(D) as 0|1,t);if(r.pts.length!==2)return;
   const iv=hit(v).flatMap(([s0,e0])=>{const lo=hit(v-k).find(([x,y])=>x<e0&&y>s0),hi=hit(v+k).find(([x,y])=>x<e0&&y>s0);return lo&&hi?[[Math.max(s0,lo[0],hi[0]),Math.min(e0,lo[1],hi[1])] as [number,number]]:[];});if(!iv.length)return;
   const u=(p:V3)=>D==='X'?p[0]:p[1],[a,b]=[u(r.pts[0]),u(r.pts[1])].sort((x,y)=>x-y),z=r.pts[0][2],dz=dr.depth,run=6*dz,pts:[number,number][]=[[a,z]];
   for(const [s,e] of iv){const p0=top?s-k-run:s+k,p1=top?e+k:e-k-run;if(p0<=a||p1+run>=b||p1<=p0+run)continue;pts.push([p0,z],[p0+run,z-dz],[p1,z-dz],[p1+run,z]);}
   if(pts.length===1)return;pts.push([b,z]);r.pts=pts.map(([uu,zz])=>P3(D,uu,v,zz));r.what+=` · คอม้า 1:6 ลง ${dz} ที่${name}`;};
  for(const D of ['X','Y'] as Dir[]){
   const bars=c.raw.filter(r=>r.panels.includes(host.id)&&(r.kind==='B'||r.kind==='T')&&r.pts.length===2&&Math.abs((D==='X'?r.pts[1][1]-r.pts[0][1]:r.pts[1][0]-r.pts[0][0]))<EPS&&Math.abs(D==='X'?r.pts[1][0]-r.pts[0][0]:r.pts[1][1]-r.pts[0][1])>EPS);
   if(crank){for(const r of bars)if(r.kind==='B'||dr.kind==='sunken')dip(r,D,r.kind==='T');continue;}
   const lay=L.bottom(D),d=lay.bar.diameter,o2=D==='X'?1:0,lo=o2===0?bx.x0:bx.y0,hi=o2===0?bx.x1:bx.y1;if(!(lay.bar.spacing>0))continue;
   const zb=L.bb-dr.depth+cv.bottom+(lay.layer==='B1'?d/2:L.r.shortBottom.diameter+d/2);
   for(const v of spreadAt(lo+ce+d/2,hi-ce-d/2,lay.bar.spacing))for(const [a,b] of multiIntervals([[ring]],ax(D) as 0|1,v)){if(b-a-2*(ce+d/2)<300)continue;
    c.raw.push({kind:'B',layer:lay.layer,d,s:lay.bar.spacing,pts:[P3(D,a+ce+d/2,v,zb),P3(D,b-ce-d/2,v,zb)],panels:[host.id],mark:host.mark,what:`เหล็กล่าง${name} แนว ${D} (แยก)`});}
   if(dr.kind==='sunken'){
    // bars of the panel cut around the lowered area; lowered top mesh runs Ld past the edge into the slab (anchor)
    const tl=L.top(D),bar=tl.bar.spacing>0?tl.bar:L.r.topExtra&&L.r.topExtra.spacing>0?L.r.topExtra:lay.bar,dt=bar.diameter,zt=host.top-dr.depth-cv.top-(tl.layer==='T1'?dt/2:dt*1.5);
    // the lowered top bars run Ld into the surrounding slab only where they stay above its bottom bars
    const fits=zt-dt/2>=L.bb+cv.bottom+L.r.shortBottom.diameter+L.r.longBottom.diameter,Ld=fits?devLength(c.det,dt,true):0;
    if(!fits&&D==='X')c.warn(`${name}: ลด ${dr.depth} mm ลึกจนเหล็กบนยึดเข้าแผงรอบข้างไม่ได้ · เหล็กบนอยู่ในพื้นที่ลด (ตรวจเหล็กยึดตามแบบ)`);
    for(const r of bars){if(r.kind!=='T'&&r.pts[0][2]<=host.top-dr.depth-cv.top-r.d/2)continue;const v=D==='X'?r.pts[0][1]:r.pts[0][0],iv=multiIntervals([[ring]],ax(D) as 0|1,v);if(!iv.length)continue;
     const u=(p:V3)=>D==='X'?p[0]:p[1],[a,b]=[u(r.pts[0]),u(r.pts[1])].sort((x,y)=>x-y),z=r.pts[0][2],keep=cutSpan(a,b,iv.map(([s,e])=>[s-ce-r.d/2,e+ce+r.d/2] as [number,number]),Math.max(12*r.d,150));
     c.raw.splice(c.raw.indexOf(r),1,...keep.map(([s,e])=>({...r,pts:[P3(D,s,v,z),P3(D,e,v,z)],what:`${r.what} (ตัดที่${name})`})));}
    for(const v of spreadAt(lo+ce+dt/2,hi-ce-dt/2,bar.spacing))for(const [a,b] of multiIntervals([[ring]],ax(D) as 0|1,v)){const iv=multiIntervals([[host.outline as P2[]]],ax(D) as 0|1,v)[0];if(!iv)continue;
     const s0=Ld?Math.max(iv[0]+ce+dt/2,a-Ld):a+ce+dt/2,s1=Ld?Math.min(iv[1]-ce-dt/2,b+Ld):b-ce-dt/2;if(s1-s0<300)continue;
     c.raw.push({kind:'T',layer:tl.layer,d:dt,s:bar.spacing,pts:[P3(D,s0,v,zt),P3(D,s1,v,zt)],panels:[host.id],mark:host.mark,what:`เหล็กบน${name} แนว ${D} (แยก${Ld?` · ยึด Ld ${Ld}`:''})`});}}
  }}
}
/** Every bar of the floor (floor coordinates) + opening statistics. */
export function floorBars(input:SlabInput,det:Detailing):FloorBarsResult{
 const f=input.floor!,warnings:string[]=[],c:Ctx={f,input,det,beams:floorBeamRects(f),warn:s=>warnings.push(s),raw:[],ops:new Map()};
 for(const o of f.openings)c.ops.set(o.id,{cut:{X:0,Y:0},trim:0,diag:0,kg:0,deviated:false,...(o.trim.method==='deviate'&&Math.max(o.w,o.shape==='rect'?o.h:o.w)>300?{fallback:'ช่องใหญ่กว่า 300 mm ใช้วิธีตัดเหล็ก + เหล็กเสริมขอบ'}:{})});
 for(const [id,s] of c.ops)if(s.fallback)warnings.push(`ช่องเปิด ${f.openings.find(o=>o.id===id)?.label||id}: ${s.fallback}`);
 for(const D of ['X','Y'] as Dir[]){layerBars(c,D,'bottom');layerBars(c,D,'top');}
 extraTop(c);
 dropBars(c);
 openingBars(c);
 return {raw:c.raw,openings:c.ops,warnings:[...new Set(warnings)]};
}
const shapeOf=(pts:V3[]):{code:string;bent:boolean}=>{
 if(pts.length===2)return {code:'00',bent:false};
 const segs=pts.slice(1).map((p,i)=>[p[0]-pts[i][0],p[1]-pts[i][1],p[2]-pts[i][2]]),right=segs.slice(1).every((s,i)=>{const a=segs[i],dot=s[0]*a[0]+s[1]*a[1]+s[2]*a[2];return Math.abs(dot)<1e-6*Math.hypot(...s)*Math.hypot(...a);});
 if(right&&pts.length===3)return {code:'11',bent:true};if(right&&pts.length===4)return {code:'21',bent:true};
 if(pts.length===4&&Math.abs(segs[0][2])<EPS&&Math.abs(segs[2][2])<EPS)return {code:'26',bent:true};
 return {code:'99',bent:true};
};
const kindOrder={B:0,T:1,OP:2,OD:3} as const;
/** Raw bars → Mark sets: equal bars (same shape, size, layer) of one slab mark share a Mark placed by spacing or offsets. */
export function groupFloorBars(input:SlabInput,det:Detailing,raw:Raw[],shift:Vec3,
 /** set id → design spacing of its bars (most common), for the sheet labels */ spacing?:Map<string,number>):GenBar[]{
 const f=input.floor!,count=new Map<string,number>();for(const p of f.panels)count.set(p.mark,(count.get(p.mark)||0)+1);
 const owner=(mark:string,panels:string[])=>(count.get(mark)||0)>=2?groupId(mark):panels[0];
 const keyOf=(r:Raw)=>{const o=r.pts[0];return [r.mark,r.kind,r.layer,r.d,r.pts.map(p=>p.map((v,k)=>Math.round(v-o[k])).join(',')).join(';')].join('|');};
 const groups=new Map<string,Raw[]>();for(const r of raw){const k=keyOf(r);groups.set(k,[...(groups.get(k)||[]),r]);}
 const list=[...groups.values()].sort((a,b)=>a[0].mark.localeCompare(b[0].mark)||kindOrder[a[0].kind]-kindOrder[b[0].kind]||a[0].layer.localeCompare(b[0].layer)||a[0].pts[0][1]-b[0].pts[0][1]||a[0].pts[0][0]-b[0].pts[0][0]);
 const n=new Map<string,number>(),out:GenBar[]=[];
 for(const g0 of list){
  // chunks of ≤ 2000 bars (schema limit of one set)
  for(let at=0;at<g0.length;at+=2000){const g=g0.slice(at,at+2000),r=g[0],k=`${r.mark}|${r.kind}`,no=(n.get(k)||0)+1;n.set(k,no);
   const mark=`${r.mark}-${r.kind}${r.kind==='B'||r.kind==='T'?String(no).padStart(2,'0'):no}`.slice(0,32);
   const sorted=[...g].sort((a,b)=>a.pts[0][0]-b.pts[0][0]||a.pts[0][1]-b.pts[0][1]),o=sorted[0].pts[0],offs=sorted.map(x=>[0,1,2].map(k2=>x.pts[0][k2]-o[k2]) as V3);
   // evenly spaced along one axis → distribution, else offsets
   const axis=[0,1].find(a=>offs.every(v=>Math.abs(v[1-a])<.5&&Math.abs(v[2])<.5)),even=axis!==undefined&&offs.length>1&&offs.every((v,i)=>i===0||Math.abs((v[axis]-offs[i-1][axis])-(offs[1][axis]-offs[0][axis]))<.5);
   const {code,bent}=shapeOf(r.pts),pts=sorted[0].pts.map(p=>[p[0]+shift[0],p[1]+shift[1],p[2]+shift[2]] as V3),panels=[...new Set(g.flatMap(x=>x.panels))],own=owner(r.mark,panels);
   const tags=panels.map(id=>f.panels.find(p=>p.id===id)?.tag).filter(Boolean);
   const base={id:`gen-${own}-${r.kind.toLowerCase()}${String(no).padStart(2,'0')}`,mark,role:`${own}-${r.kind}${no}`,note:`${r.layer} · ${r.what} · ${tags.length>3?`${tags.length} แผง`:tags.join(', ')}`,diameter:r.d,grade:gradeFor(det,r.d,det.mainGrade),count:g.length,points:pts,
    axis:(Math.abs(pts.at(-1)![0]-pts[0][0])>=Math.abs(pts.at(-1)![1]-pts[0][1])?'X':'Y') as 'X'|'Y',face:(r.kind==='T'||r.layer.startsWith('T')?'top':'bottom') as 'top'|'bottom',radius:bent?bendRadius(r.d,det):0,shapeCode:code};
   if(spacing){const by=new Map<number,number>();for(const x of g)if(x.s)by.set(x.s,(by.get(x.s)||0)+1);const best=[...by].sort((p,q)=>q[1]-p[1])[0];if(best)spacing.set(base.id,best[0]);}
   if(g.length===1)out.push({...base,distributionAxis:base.axis==='X'?'Y':'X',from:base.axis==='X'?pts[0][1]:pts[0][0],to:base.axis==='X'?pts[0][1]:pts[0][0]});
   else if(even&&axis!==undefined)out.push({...base,distributionAxis:axis===0?'X':'Y',from:pts[0][axis],to:pts[0][axis]+offs.at(-1)![axis]});
   else out.push({...base,offsets:offs});}
 }
 return out;
}
/** Applies the floor: shape model (normalised), reference-beam placement regions, ground layers, bars. */
export function applySlabFloor(m:Member,input:SlabInput,det:Detailing,warn:(s:string)=>void):{member:Member;bars:GenBar[]}{
 const f=input.floor!,sm0=shapeModelSchema.parse(floorShapeModel(input)),{model,shift}=normaliseShape(sm0);
 let next=applyShapeModel({...m,geometry:undefined,prismGeometry:undefined,beamAssembly:undefined,pedestal:{x:0,y:0,z:0}},model);
 next={...next,cover:Math.min(input.cover.top,input.cover.bottom,input.cover.edge),faces:[true,true,true,true,true,false]};
 // reference beams = placement regions (bars run through / into them); collinear beams merge when there are too many
 const keep=editablePlacementContext(m).regions.filter(r=>!r.id.startsWith('gen'));
 let rects=floorBeamRects(f).map(r=>({x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1,z0:-r.beam.depth,label:`คาน ${r.beam.mark} แนว ${r.beam.line}`}));
 const room=Math.max(0,REGION_LIMIT-keep.length);
 if(rects.length>room){const by=new Map<string,typeof rects>();for(const r of rects){const k=r.x1-r.x0>=r.y1-r.y0?`y${Math.round((r.y0+r.y1)/2)}`:`x${Math.round((r.x0+r.x1)/2)}`;by.set(k,[...(by.get(k)||[]),r]);}
  rects=[...by.values()].map(l=>({x0:Math.min(...l.map(r=>r.x0)),y0:Math.min(...l.map(r=>r.y0)),x1:Math.max(...l.map(r=>r.x1)),y1:Math.max(...l.map(r=>r.y1)),z0:Math.min(...l.map(r=>r.z0)),label:l[0].label}));
  if(rects.length>room){warn(`คานอ้างอิงเกิน ${room} แนว · รวมพื้นที่อ้างอิงบางแนว`);rects=rects.slice(0,room);}}
 const zTop=Math.max(...f.panels.map(p=>p.top),0);
 const regions=rects.map((r,k)=>({id:`genfb${k+1}`,label:`${r.label} (อ้างอิง)`.slice(0,80),origin:[r.x0+shift[0],r.y0+shift[1],r.z0+shift[2]] as Vec3,size:[Math.max(1,r.x1-r.x0),Math.max(1,r.y1-r.y0),Math.max(1,zTop-r.z0)] as Vec3,reference:'คานอ้างอิงของพื้นทั้งชั้น · เหล็กพื้นวิ่งผ่าน / ยึดในคาน · ไม่คิดปริมาณ',cover:0,openings:[]}));
 const all=[...keep,...regions];const {placementContext:_c,...rest}=next;next={...rest,...(all.length?{placementContext:{version:2 as const,regions:all}}:{})} as Member;
 // slab on ground panels: layers under the concrete as an equal-area square (projections not applied per panel)
 const ground=f.panels.filter(p=>panelSupport(f,p)==='ground'),A=ground.reduce((n,p)=>n+polyArea(p.outline as P2[]),0);
 if(A>0&&input.ground.support==='ground'){const s=Math.sqrt(A),g=groundLayers({...input.ground,lean:{...input.ground.lean,projection:0},sand:{...input.ground.sand,projection:0}},s,s);
  next=withSiteWork({...next,lean:g.lean},{...(m.siteWork||emptySiteWork()),sand:g.sand,sheet:g.sheet,compaction:g.compaction});
  if(input.ground.lean.projection>0||input.ground.sand.projection>0)warn('พื้นบนดิน (ทั้งชั้น): ชั้นรองพื้นคิดเท่าพื้นที่แผงบนดิน ไม่รวมระยะยื่น');}
 const r=floorBars(input,det);r.warnings.forEach(warn);
 const bars=groupFloorBars(input,det,r.raw,shift);
 // chairs / spacers (General Spec, default off): site items gen-slab-chair / -chair-kg / -spacer, rebuilt on every apply
 const acc=accessoryItems(f,input,det),old=(next.siteWork?.items||[]).filter(it=>!/^gen-slab-/.test(it.id));
 if(acc.length||(next.siteWork?.items||[]).some(it=>/^gen-slab-/.test(it.id)))next=withSiteWork(next,{...(next.siteWork||emptySiteWork()),items:[...old,...acc].slice(0,30)});
 if(bars.length>300)warn(`ชุดเหล็ก ${bars.length} Mark เกิน 300 ต่อสมาชิก · แบ่งพื้นเป็นหลายสมาชิก`);
 return {member:next,bars};
}
/** Chair / spacer BOQ items: chairs per m² of panels with top bars (count + kg: height = thickness − covers − 2 bottom − 2 top
 * bars, U = 2 legs + 200 top + 2 × 100 feet, Z = leg + 2 × 150, continuous = 1 m per chair), spacers per m² of every panel. */
export function accessoryItems(f:Floor,input:SlabInput,det:Detailing):{id:string;label:string;unit:string;quantity:number}[]{
 const a=det.slabAccessories;if(!a)return [];const out:{id:string;label:string;unit:string;quantity:number}[]=[];
 const area=(ps:FloorPanel[])=>ps.reduce((n,p)=>n+polyArea(p.outline as P2[]),0)/1e6;
 if(a.chair.enabled&&a.chair.perM2>0&&a.chair.diameter>0){
  const top=f.panels.filter(p=>{const r=panelSpec(f,p);return r.shortTop.spacing>0||r.longTop.spacing>0||!!(r.topExtra&&r.topExtra.spacing>0);}),A=area(top);
  if(A>0){const n=Math.ceil(A*a.chair.perM2),d=a.chair.diameter,cv=input.cover,h=Math.max(50,Math.round(Math.max(...top.map(p=>{const r=panelSpec(f,p);return panelThickness(f,p)-cv.top-cv.bottom-2*Math.max(r.shortBottom.diameter,r.longBottom.diameter)-2*Math.max(r.shortTop.diameter,r.longTop.diameter,r.topExtra?.diameter||0);}))));
   const len=a.chair.shape==='U'?2*h+200+200:a.chair.shape==='Z'?h+300:1000,kg=n*len/1000*d*d/162.2,name=`${d<=9?'RB':'DB'}${d}`;
   out.push({id:'gen-slab-chair',label:`เหล็กรองเหล็กบน (Chair) ${name} แบบ ${a.chair.shape==='continuous'?'ต่อเนื่อง':a.chair.shape} สูง ${h} · ${a.chair.perM2} ตัว/m² × ${A.toFixed(2)} m²`.slice(0,120),unit:'ตัว',quantity:n},
    {id:'gen-slab-chair-kg',label:`น้ำหนักเหล็กรองเหล็กบน (Chair) ${name}`,unit:'kg',quantity:Math.round(kg*100)/100});}}
 if(a.spacer.enabled&&a.spacer.perM2>0){const A=area(f.panels);if(A>0)out.push({id:'gen-slab-spacer',label:`ลูกปูนรองเหล็ก · ${a.spacer.perM2} ก้อน/m² × ${A.toFixed(2)} m²`,unit:'ก้อน',quantity:Math.ceil(A*a.spacer.perM2)});}
 return out;
}
/** Summary per slab mark (plan list): panels, area, concrete. */
export function floorMarkSummary(f:Floor){
 return f.marks.map((m:FloorMark)=>{const ps=f.panels.filter(p=>p.mark===m.name);return {mark:m.name,panels:ps.length,area:ps.reduce((n,p)=>n+polyArea(p.outline as P2[]),0)/1e6,volume:ps.reduce((n,p)=>n+polyArea(p.outline as P2[])*panelThickness(f,p),0)/1e9};});
}
/** Empty floor (2 × 2 grid, one mark) for a new layout. */
export function newSlabFloor(mark?:FloorMark):Floor{
 const mk=mark||{name:'S1',thickness:150,support:'elevated' as const,rebar:structuredClone(DEFAULT_SLAB_REBAR)};
 const f:Floor={version:1,level:0,gridsX:[{label:'A',at:0},{label:'B',at:6000}],gridsY:[{label:'1',at:0},{label:'2',at:5000}],beams:[],marks:[mk],panels:[],openings:[],drops:[]};
 f.beams=autoBeams(f,{mark:'B1',width:300,depth:600});f.panels=autoPanels(f,mk.name);return f;
}
/** Grids of a beam group (one direction): labelled grids at the cumulative span lengths; cantilever tips (no label) skipped. */
export function gridsFromBeamGroup(g:{grids:{label:string}[];spans:{length:number}[]}):{label:string;at:number}[]{
 const out:{label:string;at:number}[]=[];let at=0;g.grids.forEach((x,k)=>{if(k>0)at+=g.spans[k-1]?.length||0;const label=x.label.trim();if(label&&!out.some(o=>o.label===label))out.push({label:label.slice(0,12),at});});return out;
}
/** Adds a beam on one grid segment (line, between neighbouring grids a–b) or removes it there (a covering beam is split). */
export function toggleBeamSegment(f:Floor,along:'X'|'Y',line:string,a:string,b:string,size:{mark:string;width:number;depth:number}):Floor{
 const runs=sortGrids(along==='X'?f.gridsX:f.gridsY),ia=runs.findIndex(g=>g.label===a),ib=runs.findIndex(g=>g.label===b);if(ia<0||ib<0)return f;
 const lo=Math.min(ia,ib),hi=Math.max(ia,ib),idx=(l:string)=>runs.findIndex(g=>g.label===l);
 const hit=f.beams.find(x=>x.along===along&&x.line===line&&Math.min(idx(x.from),idx(x.to))<=lo&&Math.max(idx(x.from),idx(x.to))>=hi);
 const used=new Set(f.beams.map(x=>x.id.toUpperCase())),nid=()=>{const id=nextNo(used,'bm',1);used.add(id.toUpperCase());return id;};
 if(!hit)return {...f,beams:[...f.beams,{id:nid(),mark:size.mark,along,line,from:runs[lo].label,to:runs[hi].label,width:size.width,depth:size.depth}]};
 const s0=Math.min(idx(hit.from),idx(hit.to)),s1=Math.max(idx(hit.from),idx(hit.to)),keep=f.beams.filter(x=>x!==hit);
 if(s0<lo)keep.push({...hit,from:runs[s0].label,to:runs[lo].label});if(s1>hi)keep.push({...hit,id:s0<lo?nid():hit.id,from:runs[hi].label,to:runs[s1].label});
 return {...f,beams:keep};
}
/** Free id / tag helpers for the editor. */
export const freeId=(f:Floor,prefix:string)=>nextNo(new Set([...f.panels,...f.beams,...f.openings,...f.drops].map(x=>x.id.toUpperCase())),prefix,1);
export const freeTag=(f:Floor,mark:string)=>nextNo(new Set(f.panels.map(p=>p.tag.toUpperCase())),`${mark}-`);
/** Snap targets along one plan axis: grid lines, beam faces, panel edges. */
export function snapLines(f:Floor,axis:0|1):number[]{
 const g=(axis===0?f.gridsX:f.gridsY).map(x=>x.at),b=floorBeamRects(f).flatMap(r=>axis===0?[r.x0,r.x1]:[r.y0,r.y1]),p=f.panels.flatMap(x=>x.outline.map(q=>q[axis]));
 return [...new Set([...g,...b,...p].map(v=>Math.round(v)))].sort((x,y)=>x-y);
}
/** Floor (S1 bars) of the panel's slab mark → panel colour index. */
export const markIndex=(f:Floor,mark:string)=>Math.max(0,f.marks.findIndex(m=>m.name===mark));
/** Member built from a slab floor (its shape model is derived: edited on the input tab, not in the shape / rebar tabs). */
export const isSlabFloorMember=(m:Pick<Member,'elementInput'|'category'>)=>{const i=m.elementInput as {category?:string;layout?:string}|undefined;return m.category==='Slab'&&i?.category==='Slab'&&i.layout==='floor';};
export {DEFAULT_OPENING_TRIM};
export type {FloorDrop,FloorOpening,FloorPanel,FloorBeam,FloorMark};
