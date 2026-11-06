import type {Member,Vec3} from './model';
import {bendRadius,closedLink,gradeFor,hookDevLength,lapLength,type Detailing,type GenBar,type WallInput} from './elementInput';
import {applyShapeModel} from './shapeApply';
import {normaliseShape,shapeGeometry,multiIntervals} from './shapeGeometry';
import {shapeModelSchema,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {editablePlacementContext} from './placementContext';
import {emptySiteWork,withSiteWork} from './siteWork';
import {devLength} from './slabFloor';
import {wallTypeLabels,type WallLevel,type WallMesh,type WallOpening,type WallRun,type WallType} from './wallRunSchema';

// Wall Run (docs/WALL_RUN.md): wall axis on plan → shape model (one mitered polygon per segment per level, branches,
// tank / pit slabs, retaining base + key, openings as voids) and generated bars `gen-wr-<kind><nn>` named W1-V01 …
// Plan coordinates = mm from the run origin frame; z = mm from the level datum (levels are m). The applied model is
// normalised (bars, regions shifted with it). Offsets `o` across a segment are measured from its axis toward the outer face.
type P2=[number,number];type V3=Vec3;
const EPS=1e-6,DEG=Math.PI/180;
const add=(a:P2,b:P2,k=1):P2=>[a[0]+b[0]*k,a[1]+b[1]*k];
const cross=(a:P2,b:P2)=>a[0]*b[1]-a[1]*b[0];
const r1=(v:number)=>Math.round(v*1000)/1000;
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
/** Max height of one pour lift (blocker above). */
export const MAX_LIFT=4500;
/** Thickness change between levels handled by cranked bars (1:6); above it new dowels. */
export const CRANK_LIMIT=75;

export type RunSeg={id:string;k:number;a:P2;b:P2;dir:P2;out:P2;len:number;t:number;
 /** branch (T junction): host segment and side */ branch?:{host:number;side:'L'|'R'}};
export type RunAxis={segs:RunSeg[];branches:RunSeg[];closed:boolean;gap:number;turnSum:number;outLeft:boolean};
/** Segment axes from the origin, the outer side (closed: outside of the loop; open: right of the travel direction). */
export function runAxis(run:WallRun):RunAxis{
 let p:P2=[run.origin.x,run.origin.y],h=run.origin.rotation*DEG;
 const raw:{id:string;a:P2;b:P2;dir:P2;len:number;t:number}[]=[];let turnSum=0;
 run.path.segments.forEach((s,k)=>{const dir:P2=[Math.cos(h),Math.sin(h)],b=add(p,dir,s.length);raw.push({id:s.id,a:p,b,dir,len:s.length,t:s.thickness});p=b;h+=s.turn*DEG;if(k<run.path.segments.length-1||run.path.closed)turnSum+=s.turn;});
 const closed=run.path.closed,gap=closed?Math.hypot(p[0]-run.origin.x,p[1]-run.origin.y):0;
 const area=raw.reduce((n,s)=>n+cross(s.a,s.b),0)/2,outLeft=closed&&area<0;
 const outOf=(dir:P2,left:boolean):P2=>left?[-dir[1],dir[0]]:[dir[1],-dir[0]];
 const segs=raw.map((s,k)=>({...s,k,out:outOf(s.dir,outLeft)}));
 const branches=(run.branches||[]).map((b,j)=>{const host=segs.find(s=>s.id===b.fromSegment)||segs[0],left:P2=[-host.dir[1],host.dir[0]],dir:P2=b.side==='L'?left:[-left[0],-left[1]],a=add(host.a,host.dir,b.at);
  return {id:b.id,k:segs.length+j,a,b:add(a,dir,b.length),dir,len:b.length,t:b.thickness,out:outOf(dir,false),branch:{host:host.k,side:b.side}} as RunSeg;});
 return {segs,branches,closed,gap,turnSum,outLeft};
}
const neighbour=(ax:RunAxis,s:RunSeg,side:'start'|'end'):RunSeg|undefined=>{
 if(s.branch)return side==='start'?ax.segs[s.branch.host]:undefined;
 const n=ax.segs.length,k=side==='end'?s.k+1:s.k-1;
 if(k>=0&&k<n)return ax.segs[k];return ax.closed?ax.segs[(k+n)%n]:undefined;};
/** u along s where the line (s, offset o) meets the line (n, offset on); undefined when parallel. */
function meetU(s:RunSeg,o:number,n:RunSeg,on:number):number|undefined{
 const c=cross(s.dir,n.dir);if(Math.abs(c)<1e-9)return;
 const p=add(s.a,s.out,o),q=add(n.a,n.out,on),d:P2=[q[0]-p[0],q[1]-p[1]];return cross(d,n.dir)/c;
}
/** World point of segment s at u along the axis, offset o toward the outer face, level z. */
export const at=(s:RunSeg,u:number,o:number,z:number):V3=>{const p=add(add(s.a,s.dir,u),s.out,o);return [p[0],p[1],z];};
/** Joint at one end of s for a line at offset o: plane-to-plane point (same depth in the neighbour), near / far face of the neighbour. */
function joint(ax:RunAxis,s:RunSeg,side:'start'|'end',o:number,tOf:(s:RunSeg)=>number){
 const n=neighbour(ax,s,side),def=side==='end'?s.len:0;
 if(!n)return {kind:'free' as const,u:def,near:def,far:def,n};
 const tn=tOf(n),f1=meetU(s,o,n,tn/2),f2=meetU(s,o,n,-tn/2);
 if(f1===undefined||f2===undefined)return {kind:'line' as const,u:def,near:def,far:def,n};
 const near=side==='end'?Math.min(f1,f2):Math.max(f1,f2),far=side==='end'?Math.max(f1,f2):Math.min(f1,f2);
 if(s.branch)return {kind:'tee' as const,u:near,near,far,n};
 const depth=tOf(s)/2-o,u=meetU(s,o,n,tn/2-depth)??def;
 return {kind:'corner' as const,u,near,far,n};
}

// ---------- levels and lifts ----------
export type Lift={id:string;name:string;level:number;k:number;z0:number;z1:number;t?:number};
export type RunLevels={lifts:Lift[];zBase:number;zTop:number;bands:{id:string;name:string;z0:number;z1:number}[];
 bottom?:[number,number];cover?:[number,number];pit?:[number,number];base?:[number,number];key?:[number,number]};
const sorted=(run:WallRun)=>[...run.levels].sort((a,b)=>a.bottom-b.bottom);
/** Wall lifts (pour stages) from the levels: tank bottom / cover slabs, lift pit and retaining base taken off the wall height. */
export function runLevels(run:WallRun):RunLevels{
 const lv=sorted(run),b=lv[0].bottom*1000,top=lv[lv.length-1].top*1000,out:RunLevels={lifts:[],zBase:b,zTop:top,bands:[]};
 const tk=run.wallType==='tank'?run.tank:undefined,rt=run.wallType==='retaining'?run.retaining:undefined,pit=run.wallType==='lift'?run.liftPit:undefined;
 if(tk){out.bottom=[b,b+tk.bottom.thickness];out.zBase=b+tk.bottom.thickness;if(tk.cover){out.cover=[top-tk.cover.thickness,top];out.zTop=top-tk.cover.thickness;}}
 if(rt){out.base=[b,b+rt.baseThickness];out.zBase=b+rt.baseThickness;if(rt.key)out.key=[b-rt.key.depth,b];}
 if(pit){out.pit=[b-pit.depth-pit.bottomThickness,b-pit.depth];out.zBase=b-pit.depth;
  out.lifts.push({id:'PIT',name:'PIT',level:-1,k:0,z0:b-pit.depth,z1:b,t:lv[0].thickness||undefined});}
 lv.forEach((l,i)=>{const z0=Math.max(l.bottom*1000,out.zBase),z1=Math.min(l.top*1000,out.zTop);if(z1-z0<1)return;
  for(let k=0;k<l.lifts;k++){const a=Math.round(z0+(z1-z0)*k/l.lifts),c=Math.round(z0+(z1-z0)*(k+1)/l.lifts);
   out.lifts.push({id:l.lifts>1?`${l.id}-${k+1}`:l.id,name:l.lifts>1?`${l.name} ช่วงเท ${k+1}`:l.name,level:i,k,z0:a,z1:c,t:l.thickness||undefined});}});
 const B=out.bottom||out.base||out.pit;
 if(B)out.bands.push({id:'BASE',name:out.pit?'พื้นบ่อลิฟต์':out.bottom?'พื้นบ่อ':'ฐานกันดิน',z0:out.key?out.key[0]:B[0],z1:B[1]});
 for(const l of out.lifts)out.bands.push({id:l.id,name:l.name,z0:l.z0,z1:l.z1});
 if(out.cover)out.bands.push({id:'COVER',name:'ฝาบ่อ',z0:out.cover[0],z1:out.cover[1]});
 return out;
}
/** Thickness of segment s in a lift (level override, else the segment). */
const tIn=(s:RunSeg,l?:{t?:number})=>l?.t&&l.t>0?l.t:s.t;
const levelOfZ=(lv:RunLevels,z:number)=>lv.lifts.find(l=>z>=l.z0-EPS&&z<=l.z1+EPS)||lv.lifts[lv.lifts.length-1];
/** Lift used for a horizontal layer at z: within `m` of a joint where the thickness steps, the thinner one (cover to the step). */
const liftNear=(lv:RunLevels,s:RunSeg,z:number,m:number)=>{const near=lv.lifts.filter(l=>z>=l.z0-m&&z<=l.z1+m);return near.length?near.reduce((a,b)=>tIn(s,b)<tIn(s,a)?b:a):levelOfZ(lv,z);};

// ---------- defaults ----------
const mesh=(d:number,s:number):WallMesh=>({diameter:d,spacing:s});
const seg=(id:string,length:number,thickness:number,turn:number)=>({id,length,thickness,turn});
/** Default run per wall type (shape, levels, ends, bars); everything stays editable. */
export function defaultWallRun(type:WallType):WallRun{
 const trim={count:2,diameter:12,ext:'ld' as const,diagonal:true};
 const base:WallRun={version:1,wallType:type,origin:{x:0,y:0,rotation:0},path:{closed:false,segments:[seg('A',6000,200,0)]},levels:[{id:'L1',name:'1F',bottom:0,top:3,lifts:1}],
  base:{kind:'dowel-footing',embed:'ldh',kicker:0},top:{kind:'bend-into-slab',slab:200},
  rebar:{outer:{vertical:mesh(12,200),horizontal:mesh(12,200)},inner:{vertical:mesh(12,200),horizontal:mesh(12,200)},layers:2,corner:'ubar',tee:'l-anchor',freeEnd:'ucap-edge',edgeBar:{count:4,diameter:12}},openings:[]};
 switch(type){
  case 'tank':return {...base,path:{closed:true,segments:[seg('A',4000,250,90),seg('B',3000,250,90),seg('C',4000,250,90),seg('D',3000,250,90)]},levels:[{id:'L1',name:'TANK',bottom:0,top:3,lifts:1}],
   base:{kind:'dowel-slab',embed:'ldh',kicker:150},top:{kind:'bend-into-slab'},waterstop:{joints:true,material:'PVC waterstop 150 mm'},
   rebar:{...base.rebar,outer:{vertical:mesh(12,150),horizontal:mesh(12,150)},inner:{vertical:mesh(12,150),horizontal:mesh(12,150)}},
   tank:{bottom:{thickness:300,projection:300,rebar:{top:mesh(12,200),bottom:mesh(12,200)}},cover:{thickness:200,rebar:{top:mesh(12,200),bottom:mesh(12,200)},manholes:[{x:1700,y:1200,w:600,h:600}]},haunch:{size:150},sleeves:[]}};
  case 'lift':return {...base,path:{closed:true,segments:[seg('A',2600,250,90),seg('B',2400,250,90),seg('C',2600,250,90),seg('D',2400,250,90)]},
   levels:[1,2,3,4,5].map((n,k)=>({id:`L${n}`,name:`${n}F`,bottom:k*3.2,top:(k+1)*3.2,lifts:1})),base:{kind:'continue',embed:'ldh',kicker:100},top:{kind:'straight'},
   openings:[{id:'D1',label:'ประตูลิฟต์',segment:'A',face:'through',x:700,z:0,w:1200,h:2200,level:'L1',repeat:{levels:['L2','L3','L4']},trim}],
   liftPit:{depth:1500,bottomThickness:300,rebar:{top:mesh(12,200),bottom:mesh(12,200)}}};
  case 'retaining':return {...base,path:{closed:false,segments:[seg('A',10000,300,0)]},levels:[{id:'L1',name:'STEM',bottom:0,top:3.9,lifts:1}],base:{kind:'none',embed:'ldh',kicker:0},top:{kind:'straight'},
   rebar:{...base.rebar,outer:{vertical:mesh(12,200),horizontal:mesh(12,200)},inner:{vertical:mesh(16,150),horizontal:mesh(12,200)},freeEnd:'plain',edgeBar:undefined},
   retaining:{toe:800,heel:1600,baseThickness:400,soilSide:'in',curtail:[{at:.5}],weepHoles:{spacing:2000,dia:75},rebar:{top:mesh(12,200),bottom:mesh(16,150),dist:mesh(12,200)},formSoilFace:true}};
  default:return base;
 }
}
/** Old straight wall → one-segment Wall Run (bars cut like the old wall: lap under the base, plain ends). */
export function singleToRun(i:WallInput):{run:WallRun;notes:string[]}{
 const notes:string[]=[],r=i.rebar,m=(l:{diameter:number;spacing:number})=>mesh(l.diameter,l.spacing);
 if(r.vertical.shape!=='00'||r.horizontal.shape!=='00')notes.push('Shape ของเหล็กตั้ง / นอน ใช้เหล็กตรง (00) ใน Wall Run');
 if(r.ends&&(r.ends.start!=='none'||r.ends.end!=='none'))notes.push('EDGE / CORNER BAR ที่ปลายผนัง: เลือกวิธีปลายอิสระใหม่ใน Wall Run');
 const ob=r.opening,trim=ob&&ob.count>0&&ob.diameter>0?{count:ob.count,diameter:ob.diameter,ext:ob.ext>0?ob.ext:'lap' as const,diagonal:ob.diagonal}:{count:0,diameter:12,ext:'ld' as const,diagonal:false};
 const run:WallRun={version:1,wallType:'general',origin:{x:0,y:0,rotation:0},path:{closed:false,segments:[seg('A',i.length,i.thickness,0)]},
  levels:[{id:'L1',name:'L1',bottom:0,top:i.height/1000,lifts:1}],base:{kind:r.lap?'continue':'none',embed:'ldh'},top:{kind:'straight'},
  rebar:{outer:{vertical:m(r.vertical),horizontal:m(r.horizontal)},inner:{vertical:m(r.vertical),horizontal:m(r.horizontal)},layers:r.layers,corner:'ubar',tee:'l-anchor',freeEnd:'plain'},
  openings:(i.openings||[]).map((o,k)=>({id:`O${k+1}`,label:o.label||`ช่องเปิด ${k+1}`,segment:'A',face:'through' as const,x:o.x,z:o.z,w:Math.max(1,o.width),h:Math.max(1,o.height),level:'L1',trim})),converted:true};
 return {run,notes};
}

// ---------- outlines ----------
/** Mitered quad of segment s between offsets oa / ob (functions of the segment so neighbours of other thickness meet). */
function quad(ax:RunAxis,s:RunSeg,fa:(s:RunSeg)=>number,fb:(s:RunSeg)=>number):P2[]{
 const end=(side:'start'|'end',f:(s:RunSeg)=>number)=>{const n=neighbour(ax,s,side),def=side==='end'?s.len:0;if(!n||s.branch)return def;return meetU(s,f(s),n,f(n))??def;};
 const p=(u:number,o:number):P2=>{const q=at(s,u,o,0);return [q[0],q[1]];};
 return [p(end('start',fa),fa(s)),p(end('end',fa),fa(s)),p(end('end',fb),fb(s)),p(end('start',fb),fb(s))];
}
/** Closed ring of the path at offset f(seg) (outer outline, tank slabs). */
function ring(ax:RunAxis,f:(s:RunSeg)=>number):P2[]{
 return ax.segs.map((s,k)=>{const n=ax.segs[(k+1)%ax.segs.length],u=meetU(s,f(s),n,f(n))??s.len,q=at(s,u,f(s),0);return [q[0],q[1]] as P2;});
}
const ringArea=(r:P2[])=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
const inRing=(p:P2,r:P2[])=>{let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
/** Axis length (m) of the run incl. branches from the main faces (waterstop / kicker). */
export function axisLength(run:WallRun){const ax=runAxis(run);return (ax.segs.reduce((n,s)=>n+s.len,0)+ax.branches.reduce((n,b)=>n+b.len-tIn(ax.segs[b.branch!.host])/2,0))/1000;}

// ---------- problems ----------
/** Blockers of a Wall Run (apply refused): path, levels / lifts, thickness vs cover, openings, type parts. */
export function wallRunProblems(i:WallInput):string[]{
 const run=i.run;if(!run)return ['ยังไม่มีข้อมูล Wall Run'];
 const p:string[]=[],ax=runAxis(run),c=i.cover,lv=runLevels(run),r=run.rebar;
 if(run.path.closed&&ax.gap>1)p.push(`เส้นแกนผนังไม่ปิด (ห่าง ${Math.round(ax.gap)} mm) · ปรับความยาว / มุมเลี้ยว`);
 if(run.path.closed&&Math.abs(Math.abs(ax.turnSum)-360)>.5)p.push(`มุมเลี้ยวรวม ${Math.round(ax.turnSum)}° · เส้นแกนปิดต้องรวม ±360°`);
 const lvs=sorted(run);lvs.forEach((l,k)=>{if(!(l.top>l.bottom))p.push(`ชั้น ${l.name}: ระดับบนต้องสูงกว่าระดับล่าง`);if(k>0&&Math.abs(lvs[k-1].top-l.bottom)>.0005)p.push(`ชั้น ${lvs[k-1].name} → ${l.name}: ระดับไม่ต่อเนื่อง`);});
 for(const l of lv.lifts)if(l.z1-l.z0>MAX_LIFT)p.push(`${l.name}: ช่วงเทสูง ${Math.round(l.z1-l.z0)} mm เกิน ${MAX_LIFT} mm · เพิ่มจำนวนช่วงเท`);
 if(!lv.lifts.length)p.push('ไม่มีช่วงผนัง (ตรวจระดับกับพื้น / ฝา / ฐาน)');
 if(!(c.face>0)||!(c.edge>0))p.push('ระบุ cover ผิวผนังและขอบ');
 const need=r.layers===2?2*c.face+r.outer.vertical.diameter+r.outer.horizontal.diameter+r.inner.vertical.diameter+r.inner.horizontal.diameter+40:2*c.face+r.outer.vertical.diameter+r.outer.horizontal.diameter*2;
 for(const s of [...ax.segs,...ax.branches])for(const l of [undefined,...lv.lifts]){const t=tIn(s,l);if(t<need){p.push(`Segment ${s.id}: หนา ${t} mm ไม่พอสำหรับ cover ${c.face} + เหล็ก ${r.layers} ชั้น (ต้อง ≥ ${Math.ceil(need)})`);break;}}
 for(const [k,l] of [['outer','ผิวนอก'],['inner','ผิวใน']] as const){if(r.layers===1&&k==='inner')continue;for(const d of ['vertical','horizontal'] as const){const m=r[k][d];if(!(m.diameter>0&&m.spacing>0))p.push(`ระบุเหล็ก${d==='vertical'?'ตั้ง':'นอน'}${l}`);}}
 ax.segs.forEach((s,k)=>{if(s.len<300)p.push(`Segment ${s.id}: สั้นเกินไป`);if(run.path.closed||k<ax.segs.length-1){const turn=run.path.segments[k].turn;if(Math.abs(turn)<1&&Math.abs(turn)>EPS)p.push(`Segment ${s.id}: มุมเลี้ยวน้อยเกินไป`);}});
 ax.branches.forEach(b=>{const h=ax.segs[b.branch!.host],o=(run.branches||[]).find(x=>x.id===b.id)!;if(o.at<b.t/2+300||o.at>h.len-b.t/2-300)p.push(`จุดต่อ T ${b.id}: ต้องห่างปลาย segment ${h.id} อย่างน้อย ${Math.round(b.t/2+300)} mm`);if(b.len<=tIn(h)/2+300)p.push(`จุดต่อ T ${b.id}: ยาวไม่พอ`);});
 // openings: inside the segment clear of the corners, inside the level height
 for(const o of run.openings){const s=ax.segs.find(x=>x.id===o.segment)||ax.branches.find(x=>x.id===o.segment);if(!s)continue;
  const name=`ช่องเปิด ${o.label||o.id}`,lo=jointClear(ax,s,'start',c.edge),hi=jointClear(ax,s,'end',c.edge);
  if(o.x<lo-.5||o.x+o.w>hi+.5)p.push(`${name}: ออกนอก segment ${s.id} หรือทับมุม (ช่วงที่ใช้ได้ ${Math.round(lo)}–${Math.round(hi)} mm)`);
  for(const L of openingLevels(run,o)){const range=levelRange(run,lv,L);if(!range){p.push(`${name}: ไม่พบชั้น ${L}`);continue;}if(o.z+o.h>range[1]-range[0]+.5)p.push(`${name}: สูงเกินช่วงผนังของชั้น ${lvs.find(x=>x.id===L)?.name||L}`);}
  if(o.face!=='through'&&!(o.depth&&o.depth>0&&o.depth<tIn(s)-c.face))p.push(`${name}: ระบุความลึกช่องเว้า (น้อยกว่าความหนา − cover)`);}
 if(run.wallType==='tank'){if(!run.path.closed)p.push('ผนังบ่อน้ำ: เส้นแกนต้องปิด (กล่อง / วาดเอง)');if(!run.tank)p.push('ผนังบ่อน้ำ: ระบุพื้นบ่อ');
  const cov=run.tank?.cover;if(cov&&run.path.closed&&ax.gap<=1){const outer=ring(ax,s=>tIn(s)/2);cov.manholes.forEach((h,k)=>{if(![[h.x,h.y],[h.x+h.w,h.y],[h.x+h.w,h.y+h.h],[h.x,h.y+h.h]].every(q=>inRing(q as P2,outer)))p.push(`ช่องเปิดฝาบ่อ ${k+1}: ออกนอกฝา`);});}}
 if(run.wallType==='lift'&&run.liftPit&&!run.path.closed)p.push('บ่อลิฟต์: เส้นแกนต้องปิด');
 if(run.wallType==='retaining'&&!run.retaining)p.push('ผนังกันดิน: ระบุฐาน');
 if(r.freeEnd==='boundary'&&!r.boundary&&hasFreeEnd(ax))p.push('ปลายอิสระแบบ Boundary: ระบุความยาว / เหล็ก / ปลอก');
 return [...new Set(p)];
}
const hasFreeEnd=(ax:RunAxis)=>!ax.closed||ax.branches.length>0;
/** Usable u range of a segment for openings: past the corner zone (neighbour face + cover). */
function jointClear(ax:RunAxis,s:RunSeg,side:'start'|'end',c:number){
 const n=neighbour(ax,s,side);
 const us=n?[s.t/2,-s.t/2].flatMap(o=>[meetU(s,o,n,n.t/2),meetU(s,o,n,-n.t/2)]).filter((u):u is number=>u!==undefined):[];
 if(!us.length)return side==='end'?s.len-c:c;
 return side==='end'?Math.min(s.len,...us)-c:Math.max(0,...us)+c;
}
const openingLevels=(run:WallRun,o:WallOpening)=>[o.level||sorted(run)[0].id,...(o.repeat?.levels||[]).filter(l=>l!==(o.level||sorted(run)[0].id))];
/** Wall z range (mm) of a level after slabs / bases. */
function levelRange(run:WallRun,lv:RunLevels,id:string):[number,number]|undefined{const ls=lv.lifts.filter(l=>l.level>=0&&sorted(run)[l.level].id===id);return ls.length?[ls[0].z0,ls[ls.length-1].z1]:undefined;}

// ---------- shape model ----------
/** Shape model of the run (plan coordinates, not normalised): walls per segment per level, branches, openings, tank /
 * pit slabs, haunch (equal-area band size × size/2), retaining base + key. */
export function wallRunShapeModel(i:WallInput):ShapeModel{
 const run=i.run!,ax=runAxis(run),lv=runLevels(run),parts:ShapePart[]=[],src=`Wall Run · ${wallTypeLabels[run.wallType]}`;
 const poly=(id:string,label:string,pts:P2[],z0:number,h:number,o:Partial<ShapePart>={})=>parts.push({id:id.slice(0,40),label:label.slice(0,80),role:'solid',stage:1,z0,height:Math.max(1,h),formSides:true,formBottom:false,source:src,shape:'polygon',points:pts.map(p=>[r1(p[0]),r1(p[1])] as P2),...o} as ShapePart);
 // wall ranges: consecutive lifts of one level (thickness per level)
 const ranges:{key:string;name:string;z0:number;z1:number;t?:number;stage:number}[]=[];
 for(const l of lv.lifts){const key=l.level<0?'PIT':sorted(run)[l.level].id,last=ranges[ranges.length-1];if(last&&last.key===key){last.z1=l.z1;continue;}ranges.push({key,name:l.level<0?'PIT':sorted(run)[l.level].name,z0:l.z0,z1:l.z1,t:l.t,stage:Math.min(9,ranges.length+1)});}
 for(const rg of ranges){const tOf=(s:RunSeg)=>tIn(s,rg);
  for(const s of [...ax.segs,...ax.branches])poly(`w${s.id}-${rg.key}`,`ผนัง ${s.id} · ${rg.name}`,quad(ax,s,x=>tOf(x)/2,x=>-tOf(x)/2),rg.z0,rg.z1-rg.z0,{stage:rg.stage});}
 // openings (void through / recess) per level
 run.openings.forEach(o=>{const s=[...ax.segs,...ax.branches].find(x=>x.id===o.segment);if(!s)return;
  for(const L of openingLevels(run,o)){const rg=levelRange(run,lv,L);if(!rg)continue;const t=tIn(s,lv.lifts.find(l=>l.z0>=rg[0]-EPS))+2,d=o.depth||0;
   const [oa,ob]=o.face==='through'?[t/2,-t/2]:o.face==='out'?[t/2,t/2-1-d]:[-t/2+1+d,-t/2];
   const pts=[at(s,o.x,oa,0),at(s,o.x+o.w,oa,0),at(s,o.x+o.w,ob,0),at(s,o.x,ob,0)].map(p=>[r1(p[0]),r1(p[1])] as P2);
   parts.push({id:`op${o.id}-${L}`.slice(0,40),label:`ช่องเปิด ${o.label||o.id} · ${L}`.slice(0,80),role:'void',stage:1,z0:rg[0]+o.z,height:o.h,formSides:true,formBottom:true,source:src,shape:'polygon',points:pts} as ShapePart);}});
 const first=lv.lifts[0],last=lv.lifts[lv.lifts.length-1];
 if(lv.bottom&&run.tank){const tk=run.tank;poly('tank-bottom','พื้นบ่อ',ring(ax,s=>tIn(s,first)/2+tk.bottom.projection),lv.bottom[0],tk.bottom.thickness);
  if(tk.haunch&&tk.haunch.size>0)for(const s of ax.segs)poly(`haunch-${s.id}`,`Haunch ${s.id} (เทียบเท่าพื้นที่)`,quad(ax,s,x=>-tIn(x,first)/2,x=>-tIn(x,first)/2-tk.haunch!.size),lv.zBase,tk.haunch.size/2);}
 if(lv.cover&&run.tank?.cover){const cv=run.tank.cover;poly('tank-cover','ฝาบ่อ',ring(ax,s=>tIn(s,last)/2),lv.cover[0],cv.thickness,{formBottom:true,stage:Math.min(9,ranges.length+1)});
  cv.manholes.forEach((h,k)=>parts.push({id:`manhole${k+1}`,label:`ช่องเปิดฝาบ่อ ${k+1}`,role:'void',stage:1,z0:lv.cover![0],height:cv.thickness,formSides:true,formBottom:false,source:src,shape:'box',x:h.x,y:h.y,w:h.w,d:h.h} as ShapePart));}
 if(lv.pit&&run.liftPit)poly('pit-slab','พื้นบ่อลิฟต์',ring(ax,s=>tIn(s,first)/2),lv.pit[0],run.liftPit.bottomThickness);
 if(lv.base&&run.retaining){const rt=run.retaining,sg=rt.soilSide==='out'?1:-1;
  for(const s of ax.segs)poly(`base-${s.id}`,`ฐานกันดิน ${s.id}`,quad(ax,s,x=>sg*(tIn(x,first)/2+rt.heel),x=>-sg*(tIn(x,first)/2+rt.toe)),lv.base[0],rt.baseThickness);
  if(rt.key&&lv.key)for(const s of ax.segs)poly(`key-${s.id}`,`Key ${s.id}`,quad(ax,s,()=>rt.key!.width/2,()=>-rt.key!.width/2),lv.key[0],rt.key.depth,{formSides:false});}
 return {version:1,parts,confirmed:true,note:`Wall Run · ${wallTypeLabels[run.wallType]} · สร้างจากเส้นแกนผนัง (แก้ที่แท็บข้อมูลพื้นฐาน)`};
}

// ---------- bars ----------
export type WallKind='V'|'H'|'C'|'T'|'S'|'OP'|'B'|'K';
export const wallKinds:WallKind[]=['V','H','C','T','S','OP','B','K'];
export const wallKindNames:Record<WallKind,string>={V:'เหล็กตั้ง',H:'เหล็กนอน',C:'เหล็กมุม / ปลายผนัง',T:'เหล็กจุดต่อ T',S:'เหล็กเดือย / ยึดฐาน',OP:'เหล็กเสริมช่องเปิด',B:'เหล็กฐาน / พื้นบ่อ',K:'เหล็กฝาบ่อ'};
export type WallRaw={kind:WallKind;d:number;pts:V3[];lift:string;face:'out'|'in'|'mid'|'';what:string;cut?:number;code?:string;tie?:boolean};
type Plane={face:'out'|'in'|'mid';V:WallMesh;H:WallMesh;ov:(t:number)=>number;oh:(t:number)=>number};
export const faceName:Record<string,string>={out:'ผิวนอก',in:'ผิวใน',mid:'กึ่งกลาง','':''};
function cutSpan(lo:number,hi:number,holes:[number,number][],min:number){let parts:[number,number][]=[[lo,hi]];
 for(const [h0,h1] of holes)parts=parts.flatMap(([p,q])=>h1<=p||h0>=q?[[p,q] as [number,number]]:[...(h0>p?[[p,h0] as [number,number]]:[]),...(h1<q?[[h1,q] as [number,number]]:[])]);
 return parts.filter(([p,q])=>q-p>=min);}
const spreadAt=(lo:number,hi:number,s:number)=>{if(!(s>0)||hi<lo-EPS)return [] as number[];const n=hi-lo<EPS?1:Math.ceil((hi-lo)/s-1e-9)+1;return Array.from({length:n},(_,k)=>n===1?lo:lo+(hi-lo)*k/(n-1));};
const plen=(p:V3[])=>p.slice(1).reduce((n,q,k)=>n+Math.hypot(q[0]-p[k][0],q[1]-p[k][1],q[2]-p[k][2]),0);
const roundUp=(v:number,step:number)=>Math.ceil((v-1e-6)/step)*step;
const dedupe2=(ps:P2[])=>ps.filter((p,k)=>k===0||Math.hypot(p[0]-ps[k-1][0],p[1]-ps[k-1][1])>.5);

/** Raw bars of the run (plan coordinates, not normalised) with the lift each bar belongs to. */
export function wallRunRaw(i:WallInput,det:Detailing,rounding=25,warn:(s:string)=>void=()=>{}):WallRaw[]{
 const run=i.run!,ax=runAxis(run),lv=runLevels(run),c=i.cover,r=run.rebar,two=r.layers===2,out:WallRaw[]=[];
 if(!lv.lifts.length)return out;
 const lap=(d:number)=>lapLength(det,d),hookLeg=(d:number)=>det.hook90*d+bendRadius(d,det),stock=det.stockLength;
 const O=r.outer,I=two?r.inner:r.outer,first=lv.lifts[0],lastLift=lv.lifts[lv.lifts.length-1];
 const planes:Plane[]=two?[{face:'out',V:O.vertical,H:O.horizontal,ov:t=>t/2-c.face-O.vertical.diameter/2,oh:t=>t/2-c.face-O.vertical.diameter-O.horizontal.diameter/2},
  {face:'in',V:I.vertical,H:I.horizontal,ov:t=>-(t/2-c.face-I.vertical.diameter/2),oh:t=>-(t/2-c.face-I.vertical.diameter-I.horizontal.diameter/2)}]
  :[{face:'mid',V:O.vertical,H:O.horizontal,ov:()=>0,oh:()=>-(O.vertical.diameter+O.horizontal.diameter)/2}];
 const segs=[...ax.segs,...ax.branches],dU=Math.max(O.horizontal.diameter,I.horizontal.diameter),dVmax=Math.max(O.vertical.diameter,I.vertical.diameter);
 const tank=run.wallType==='tank'?run.tank:undefined,pit=run.wallType==='lift'?run.liftPit:undefined,rt=run.wallType==='retaining'?run.retaining:undefined;
 const free=r.freeEnd,edge=r.edgeBar&&r.edgeBar.count>0&&r.edgeBar.diameter>0?r.edgeBar:undefined,bd=r.boundary;
 const push=(x:WallRaw)=>{if(x.pts.length>=2&&plen(x.pts)>1)out.push({...x,pts:x.pts.map(p=>p.map(r1) as V3)});};
 const isFreeEnd=(s:RunSeg,side:'start'|'end')=>!neighbour(ax,s,side);
 type Hole={o:WallOpening;u0:number;u1:number;z0:number;z1:number};
 // openings of a segment that cut the bars of one plane (through: every plane, recess: that face)
 const opensOf=(s:RunSeg,face:Plane['face']):Hole[]=>run.openings.filter(o=>o.segment===s.id&&(o.face==='through'||face==='mid'||o.face===face)).flatMap(o=>openingLevels(run,o).map(L=>{const rg=levelRange(run,lv,L);return rg?{o,u0:o.x,u1:o.x+o.w,z0:rg[0]+o.z,z1:rg[0]+o.z+o.h}:null;}).filter((x):x is Hole=>!!x));
 // free-end layouts: first regular vertical from the end, extra EDGE / boundary bars
 const endLayout=(side:'start'|'end',s:RunSeg,P:Plane,pi:number)=>{
  const from=(v:number)=>side==='start'?v:s.len-v,extra:{u:number;d:number;kind:WallKind;what:string}[]=[],dv=P.V.diameter;
  if(free==='ucap-edge'){let u=c.edge+dU+dv/2;
   if(edge){const per=Math.ceil(edge.count/planes.length),n=Math.min(per,edge.count-pi*per),gap=Math.max(edge.diameter+25,Math.min(100,P.V.spacing/2));
    for(let j=0;j<n;j++)extra.push({u:from(c.edge+dU+edge.diameter/2+j*gap),d:edge.diameter,kind:'C',what:`EDGE BAR ${side==='start'?'ต้น':'ปลาย'} ${s.id}`});if(n>0)u=c.edge+dU+edge.diameter/2+(n-1)*gap+P.V.spacing;}
   return {first:from(u),extra};}
  if(free==='boundary'&&bd){const dt=bd.ties.diameter,db=bd.bars.diameter,per=Math.ceil(bd.bars.count/planes.length),n=Math.min(per,bd.bars.count-pi*per),a=c.edge+dt+db/2,b=Math.max(a,bd.length-dt-db/2);
   for(let j=0;j<n;j++)extra.push({u:from(n===1?a:a+(b-a)*j/(n-1)),d:db,kind:'C',what:`Boundary element ${side==='start'?'ต้น':'ปลาย'} ${s.id}`});
   return {first:from((n?b:bd.length)+P.V.spacing*(n?1:.5)),extra};}
  return {first:from(c.edge+dv/2),extra};};
 type Entry={u:number;d:number;kind:WallKind;what:string;j:number};
 const entries=(s:RunSeg,P:Plane,pi:number,L:Lift):Entry[]=>{
  const t=tIn(s,L),o=P.ov(t),tOf=(x:RunSeg)=>tIn(x,L),dv=P.V.diameter,list:Entry[]=[];
  const js=joint(ax,s,'start',o,tOf),je=joint(ax,s,'end',o,tOf);let uA:number,uB:number,skip=false;
  if(js.kind==='free'){const e=endLayout('start',s,P,pi);uA=e.first;e.extra.forEach(x=>list.push({...x,j:-1}));}
  else if(js.kind==='tee')uA=js.near+c.edge+dv/2;else{uA=js.u;skip=true;}
  if(je.kind==='free'){const e=endLayout('end',s,P,pi);uB=e.first;e.extra.forEach(x=>list.push({...x,j:-1}));}else uB=je.u;
  const us=spreadAt(uA,uB,P.V.spacing);if(!us.length)warn(`Segment ${s.id}: วางเหล็กตั้งไม่ได้ ตรวจความยาว / ระยะ`);
  us.forEach((u,j)=>{if(skip&&j===0)return;list.push({u,d:dv,kind:'V',what:`เหล็กตั้ง${s.branch?` ผนัง T ${s.id}`:''}`,j});});
  return list;};
 const lifts=lv.lifts,stagger=!!r.stagger;
 const baseKind=tank?'tank':pit?'pit':rt?'ret':run.base.kind;
 const soil=rt?(rt.soilSide==='out'?'out':'in'):undefined,stem0=lv.zBase,stemH=lv.zTop-lv.zBase;
 const curtail=rt?.curtail?.map(x=>x.at).sort((a,b)=>b-a)||[];
 const kick=run.base.kicker||0;
 // ---- vertical bars per lift (laps at every joint, cranks / new dowels at thickness steps), dowels / starters
 segs.forEach(s=>planes.forEach((P,pi)=>lifts.forEach((L,li)=>{
  const t=tIn(s,L),o=P.ov(t),last=li===lifts.length-1,N=lifts[li+1],holes=opensOf(s,P.face);
  for(const e of entries(s,P,pi,L)){const d=e.d,B=stagger&&e.j>=0&&e.j%2===1,sB=B?lap(d):0;
   let zLo=L.z0,converted=false;
   if(li===0){if(baseKind==='none')zLo=L.z0+c.edge+d/2;else if(baseKind==='continue'){if(run.converted){zLo=L.z0+c.edge+d/2;converted=true;}else zLo=L.z0-lap(d);}}
   else zLo=L.z0+sB;
   let zHi:number,leg=0,crank:{z1:number;doff:number}|undefined,note='';
   if(!last){const tN=tIn(s,N),D=t-tN;
    if(N.level===L.level||Math.abs(D)<.5)zHi=L.z1+lap(d)+sB;
    else if(Math.abs(D)<=CRANK_LIMIT){zHi=L.z1+lap(d)+sB;if(D>0){crank={z1:L.z1-75,doff:D/2};note=' · คอม้า 1:6';}else note=' · ทาบไม่สัมผัส (ผนังชั้นบนหนาขึ้น)';}
    else{zHi=L.z1-c.edge-d/2;note=' · หยุดใต้รอยต่อ (เดือยใหม่)';}}
   else if(tank?.cover&&lv.cover){const K=tank.cover.rebar;zHi=lv.cover[1]-c.face-Math.max(K.top.diameter,K.bottom.diameter)*2-d/2-(P.face==='in'?d:0);leg=lap(d);note=' · งอเข้าฝาบ่อ (L)';}
   else switch(run.top.kind){
    case 'bend-into-slab':zHi=L.z1+(run.top.slab||200)-c.face-24-d/2-(P.face==='in'?d:0);leg=hookLeg(d);note=' · งอเข้าพื้น';break;
    case 'u-cap':zHi=L.z1-c.edge-dU-d/2;break;
    case 'continue':zHi=L.z1+lap(d);note=' · ต่อขึ้นชั้นบน';break;
    default:zHi=L.z1-c.edge-d/2;}
   // retaining: soil-face main bars stop in groups (curtailment) at the given fractions of the stem height + Ld
   if(rt&&P.face===soil&&curtail.length&&e.kind==='V'&&e.j>=0){const g=e.j%(curtail.length+1);if(g>0){const stop=stem0+curtail[g-1]*stemH+devLength(det,d);if(stop<=zLo+12*d)continue;if(stop<zHi){zHi=stop;leg=0;crank=undefined;note=` · ตัดที่ ${Math.round(curtail[g-1]*100)}% ความสูง + Ld`;}}}
   const hs=holes.filter(h=>e.u>h.u0-c.edge-d/2&&e.u<h.u1+c.edge+d/2).map(h=>[h.z0-c.edge-d/2,h.z1+c.edge+d/2] as [number,number]);
   const pieces=cutSpan(zLo,zHi,hs,Math.max(12*d,150));
   for(const [p,q] of pieces){const top=q===zHi,pts:V3[]=[at(s,e.u,o,p)];
    if(top&&crank&&q>crank.z1){const z0=crank.z1-6*crank.doff,o2=o+(o>0?-1:1)*crank.doff;if(z0>p+50)pts.push(at(s,e.u,o,z0),at(s,e.u,o2,crank.z1),at(s,e.u,o2,q));else pts.push(at(s,e.u,o,q));}
    else pts.push(at(s,e.u,o,q));
    if(top&&leg>0){let lg=leg;const holesK=tank?.cover&&lv.cover?tank.cover.manholes:[];
     for(const h of holesK){const a=at(s,e.u,o,0),b=at(s,e.u,o-leg,0),x0=h.x-c.edge-d/2,x1=h.x+h.w+c.edge+d/2,y0=h.y-c.edge-d/2,y1=h.y+h.h+c.edge+d/2;
      for(let k=0;k<=40;k++){const f=k/40,x=a[0]+(b[0]-a[0])*f,y=a[1]+(b[1]-a[1])*f;if(x>x0&&x<x1&&y>y0&&y<y1){lg=Math.min(lg,leg*Math.max(0,(k-1)/40));break;}}}
     if(lg<leg)warn(`เหล็กตั้ง ${barName(d)} งอเข้าฝาบ่อ: ขาสั้นลงเหลือ ${Math.round(lg)} mm เพราะช่องเปิดฝาบ่อ`);
     if(lg>3*d)pts.push(at(s,e.u,o-lg,q));}
    let cut:number|undefined;
    if(converted&&p===zLo)cut=roundUp(plen(pts)+(zLo-L.z0)+lap(d)+(top&&last&&run.top.kind==='straight'?L.z1-zHi:0),rounding);
    push({kind:e.kind,d,pts,lift:L.id,face:P.face,what:`${e.what}${pieces.length>1?' (ตัดที่ช่องเปิด)':''}${top?note:''}${B?' · ชุด B (ทาบเหลื่อม)':''}`,cut});}
  }
  const step=!last&&N&&N.level!==L.level&&tIn(s,N)<t-CRANK_LIMIT;
  for(const mode of [...(li===0?['base' as const]:[]),...(step?['step' as const]:[])]){const target=mode==='base'?L:N,tt=tIn(s,target),oo=P.ov(tt);
   for(const e of entries(s,P,pi,target)){const d=e.d,B=stagger&&e.j>=0&&e.j%2===1,sB=B?lap(d):0;let pts:V3[]|undefined,lift=target.id,what='';
    if(mode==='step'){const zj=L.z1,Ld=devLength(det,d);pts=[at(s,e.u,oo,zj-Ld),at(s,e.u,oo,zj+lap(d)+sB)];what=`เดือยใหม่ (ผนังบางลง ${Math.round(t-tt)} mm)`;}
    else if(baseKind==='dowel-footing'||baseKind==='dowel-slab'){const emb=run.base.embed==='ldh'?hookDevLength(det,d):run.base.embed,z=L.z0,dir=P.face==='in'?-1:1;
     pts=baseKind==='dowel-footing'?[at(s,e.u,oo+dir*hookLeg(d),z-emb),at(s,e.u,oo,z-emb),at(s,e.u,oo,z+kick+lap(d)+sB)]:[at(s,e.u,oo,z-emb),at(s,e.u,oo,z+kick+lap(d)+sB)];
     what=`เหล็กเดือยจาก${baseKind==='dowel-footing'?'ฐานราก':'พื้น'} (ฝัง ${Math.round(emb)} mm)`;}
    else if((baseKind==='tank'&&lv.bottom&&tank)||(baseKind==='pit'&&lv.pit&&pit)){const sl=baseKind==='tank'?lv.bottom!:lv.pit!,m=baseKind==='tank'?tank!.bottom.rebar:pit!.rebar,z=L.z0;
     const zf=P.face==='in'?sl[1]-c.face-m.top.diameter*2-d/2:sl[0]+c.face+m.bottom.diameter*2+d/2;
     pts=[at(s,e.u,oo-lap(d),zf),at(s,e.u,oo,zf),at(s,e.u,oo,z+kick+lap(d)+sB)];lift='BASE';what=`เหล็ก L ผนัง–${baseKind==='tank'?'พื้นบ่อ':'พื้นบ่อลิฟต์'}`;}
    else if(baseKind==='ret'&&lv.base&&rt){const sg=rt.soilSide==='out'?1:-1,dir=P.face===soil?sg:-sg,zf=lv.base[0]+c.face+rt.rebar.bottom.diameter+rt.rebar.dist.diameter+d/2;
     pts=[at(s,e.u,oo+dir*hookLeg(d),zf),at(s,e.u,oo,zf),at(s,e.u,oo,L.z0+kick+lap(d)+sB)];lift='BASE';what=`เหล็กยึด stem เข้าฐาน (งอ L ด้าน${dir===sg?'ส้นหลัง (heel)':'ปลายเท้า (toe)'})`;
     if(lv.base[1]-lv.base[0]-c.face*2<hookDevLength(det,d)*.7)warn(`ฐานกันดินหนา ${Math.round(lv.base[1]-lv.base[0])} mm: ระยะฝังเหล็ก stem ${barName(d)} น้อยกว่า Ldh ${hookDevLength(det,d)} mm`);}
    if(pts)push({kind:'S',d,pts,lift,face:P.face,what:`${what}${B?' · ชุด B':''}`});}}
  if(!last&&N&&N.level!==L.level&&tIn(s,N)>t+CRANK_LIMIT)warn(`Segment ${s.id}: ผนังชั้น ${N.name} หนาขึ้น ${Math.round(tIn(s,N)-t)} mm เกิน ${CRANK_LIMIT} mm · ใส่เดือย / รายละเอียดเองตามแบบ`);
 })));
 // ---- horizontal bars: chains of segments (continuous round the corners for lap-l / one layer), laps ≤ stock
 const continuous=r.corner==='lap-l'||!two;
 const chains:{segs:RunSeg[];closed:boolean}[]=continuous?[{segs:ax.segs,closed:ax.closed},...ax.branches.map(b=>({segs:[b],closed:false}))]:segs.map(s=>({segs:[s],closed:false}));
 planes.forEach(P=>{const dh=P.H.diameter,lapH=lap(dh),hl=hookLeg(dh),zs=spreadAt(lv.zBase+c.edge+dh/2,lv.zTop-c.edge-dh/2,P.H.spacing);
  for(const ch of chains)for(const z of zs){const L=levelOfZ(lv,z),tOf=(x:RunSeg)=>tIn(x,liftNear(lv,x,z,c.edge+dh));
   const S=ch.segs,n=S.length,spans:{s:RunSeg;u0:number;u1:number;a0:number}[]=[];let hookA:P2|undefined,hookB:P2|undefined;
   const endU=(s:RunSeg,side:'start'|'end'):{u:number;hook?:P2}=>{const o=P.oh(tOf(s)),j=joint(ax,s,side,o,tOf),sg=side==='start'?1:-1,base=side==='start'?0:s.len;
    if(j.kind==='free')return {u:base+sg*(free==='ucap-edge'&&two?c.edge+dU+dh/2:free==='boundary'&&bd?c.edge+bd.ties.diameter+dh/2:c.edge+dh/2)};
    if(j.kind==='line')return {u:j.u};
    if(j.kind==='tee'){if(r.tee==='ubar'&&two)return {u:j.near+c.edge+dh/2};const h=j.n!,u=j.far+c.edge+dVmax+dU+dh/2,dir:P2=P.face==='in'?[-h.dir[0],-h.dir[1]]:h.dir;
     if(hookDevLength(det,dh)>tIn(h,L)-c.edge)warn(`จุดต่อ T ${s.id}: ผนังหลักหนา ${tIn(h,L)} mm น้อยกว่า Ldh ${hookDevLength(det,dh)} mm ของ ${barName(dh)}`);return {u,hook:dir};}
    if(r.corner==='ubar')return {u:j.near+sg*(c.edge+dh/2)};
    // hook90: to the far face, 90° leg into the neighbour wall (inner layer one step back so the legs do not overlap)
    const nb=j.n!,u=j.far+sg*(c.edge+dh/2+(P.face==='in'?2*dh:0)),dir:P2=side==='end'?nb.dir:[-nb.dir[0],-nb.dir[1]];return {u,hook:dir};};
   for(let k=0;k<n;k++){const s=S[k],o=P.oh(tOf(s));let u0:number,u1:number;
    if(k>0||ch.closed){const p=ch.closed?S[(k-1+n)%n]:S[k-1];u0=meetU(s,o,p,P.oh(tOf(p)))??0;}else{const e=endU(s,'start');u0=e.u;if(e.hook){const q=at(s,u0,o,0);hookA=[q[0]+e.hook[0]*hl,q[1]+e.hook[1]*hl];}}
    if(k<n-1||ch.closed){const q=ch.closed?S[(k+1)%n]:S[k+1];u1=meetU(s,o,q,P.oh(tOf(q)))??s.len;}else{const e=endU(s,'end');u1=e.u;if(e.hook){const q=at(s,u1,o,0);hookB=[q[0]+e.hook[0]*hl,q[1]+e.hook[1]*hl];}}
    const prev=spans[spans.length-1];spans.push({s,u0,u1,a0:prev?prev.a0+prev.u1-prev.u0:0});}
   const total=spans.reduce((m,x)=>m+x.u1-x.u0,0);if(total<=Math.max(12*dh,150))continue;
   const holes:[number,number][]=[];
   for(const sp of spans)for(const h of opensOf(sp.s,P.face))if(z>h.z0-c.edge-dh/2&&z<h.z1+c.edge+dh/2)holes.push([sp.a0+h.u0-c.edge-dh/2-sp.u0,sp.a0+h.u1+c.edge+dh/2-sp.u0]);
   const base:number[]=[];for(const sp of spans){const lo=sp.a0+lapH/2+300,hi=sp.a0+sp.u1-sp.u0-lapH/2-300;for(let a=lo;a<=hi+EPS;a+=50)if(!holes.some(([h0,h1])=>a>h0-lapH/2-50&&a<h1+lapH/2+50))base.push(a);}
   const cands=ch.closed?[...base,...base.map(x=>x+total)]:base;
   const pointAt=(a:number):P2=>{const w=ch.closed?((a%total)+total)%total:Math.min(total,Math.max(0,a)),sp=spans.find(x=>w<=x.a0+x.u1-x.u0+EPS)||spans[spans.length-1],q=at(sp.s,sp.u0+(w-sp.a0),P.oh(tOf(sp.s)),0);return [q[0],q[1]];};
   const corners=spans.slice(1).map(x=>x.a0).concat(ch.closed?[total]:[]);
   const sub=(a:number,b:number):P2[]=>{const vs:number[]=[];for(let rep=-1;rep<=2;rep++)for(const cA of corners){const v=cA+(ch.closed?rep*total:0);if(v>a+EPS&&v<b-EPS)vs.push(v);if(!ch.closed)break;}
    return dedupe2([pointAt(a),...[...new Set(vs)].sort((x,y)=>x-y).map(pointAt),pointAt(b)]);};
   const emit=(a:number,b:number,ha?:P2,hb?:P2,tag='')=>{const ps=sub(a,b);
    push({kind:'H',d:dh,pts:[...(ha?[[ha[0],ha[1],z] as V3]:[]),...ps.map(p=>[p[0],p[1],z] as V3),...(hb?[[hb[0],hb[1],z] as V3]:[])],lift:L.id,face:P.face,what:`เหล็กนอน${S.length===1&&S[0].branch?` ผนัง T ${S[0].id}`:S.length===1?` ${S[0].id}`:''}${tag}`});};
   const splitOpen=(a:number,b:number,ha?:P2,hb?:P2)=>{let cur=a,first=true,guard=0;
    while(guard++<60){const extraA=first&&ha?hl:0,rest=b-cur+extraA+(hb?hl:0);if(rest<=stock+EPS){emit(cur,b,first?ha:undefined,hb,first?'':' (ต่อทาบ)');return;}
     const lim=cur+stock-extraA-lapH/2,cs=cands.filter(x=>x>cur+lapH/2+300&&x<=lim);let cut:number;
     if(cs.length)cut=Math.max(...cs);else{cut=lim;warn(`เหล็กนอน ${barName(dh)}: หาตำแหน่งทาบนอกมุม / ช่องเปิดไม่ได้ ทาบที่ระยะ ${Math.round(cut-a)} mm`);}
     emit(cur,cut+lapH/2,first?ha:undefined,undefined,' (ต่อทาบ)');cur=cut-lapH/2;first=false;}};
   if(ch.closed&&!holes.length){const mid=spans[0].u1-spans[0].u0,c0=base.length?base.reduce((p,q)=>Math.abs(q-mid/2)<Math.abs(p-mid/2)?q:p):mid/2;
    if(total+lapH<=stock+EPS){const half=c0+total/2,c1=cands.length?cands.reduce((p,q)=>Math.abs(q-half)<Math.abs(p-half)?q:p):half;
     emit(c0-lapH/2,c1+lapH/2,undefined,undefined,' (รอบปิด ทาบ 2 จุด)');emit(c1-lapH/2,c0+total+lapH/2,undefined,undefined,' (รอบปิด ทาบ 2 จุด)');}
    else splitOpen(c0-lapH/2,c0+total+lapH/2);}
   else{let pieces:[number,number][];
    if(ch.closed){const h0=[...holes].sort((p,q)=>p[0]-q[0]),start=h0[0][1],hs=h0.map(([p,q])=>[p<start-EPS?p+total:p,q<start-EPS?q+total:q] as [number,number]);pieces=cutSpan(start,start+total,hs,Math.max(12*dh,150));}
    else pieces=cutSpan(0,total,holes,Math.max(12*dh,150));
    for(const [a,b] of pieces)splitOpen(a,b,!ch.closed&&a<EPS?hookA:undefined,!ch.closed&&b>total-EPS?hookB:undefined);}
  }
 });
 // ---- U bars at corners / T junctions / free ends, boundary ties
 if(two){const P0=planes[0],zs=spreadAt(lv.zBase+c.edge+P0.H.diameter/2,lv.zTop-c.edge-P0.H.diameter/2,P0.H.spacing),lapU=lap(dU);
  const uBar=(s:RunSeg,z:number,kind:WallKind,what:string,base:(o:number)=>number,legEnd:number)=>{const L=levelOfZ(lv,z),t=tIn(s,liftNear(lv,s,z,c.edge+dU)),oo=planes[0].oh(t),oi=planes[1].oh(t);
   if(Math.abs(oo-oi)<2*bendRadius(dU,det)+1){warn(`${what}: ผนังบางเกินไปสำหรับ U ${barName(dU)} (ไม่ใส่)`);return;}
   // legs stop before an opening crossing them (shorter lap, warned)
   const b0=base(oo),dir=Math.sign(legEnd-b0)||1;let end=legEnd;
   for(const h of opensOf(s,'out'))if(z>h.z0-c.edge-dU/2&&z<h.z1+c.edge+dU/2){const lo=h.u0-c.edge-dU/2,hi=h.u1+c.edge+dU/2;if(dir>0&&lo<end&&hi>b0)end=Math.min(end,lo);if(dir<0&&hi>end&&lo<b0)end=Math.max(end,hi);}
   if(Math.abs(end-legEnd)>1){if(Math.abs(end-b0)<Math.abs(legEnd-b0)*.6){warn(`${what}: ช่องเปิดอยู่ในระยะทาบ · ตรวจรายละเอียดเหล็กมุม`);}if(dir*(end-b0)<12*dU)return;}
   push({kind,d:dU,pts:[at(s,end,oo,z),at(s,b0,oo,z),at(s,base(oi),oi,z),at(s,end,oi,z)],lift:L.id,face:'',what});};
  for(const s of segs)for(const side of ['start','end'] as const){const sg=side==='start'?1:-1;
   for(const z0 of zs){const L=liftNear(lv,s,z0,c.edge+dU),tOf=(x:RunSeg)=>tIn(x,L),j=joint(ax,s,side,0,tOf);
    if(j.kind==='corner'&&r.corner==='ubar'){const nb=j.n!,zz=side==='start'?z0+(z0+2*dU<lv.zTop-c.edge?dU:-dU):z0,stop=joint(ax,s,side,planes[0].oh(tIn(s,L)),tOf).near+sg*(c.edge+dU/2);
     uBar(s,zz,'C',`U-bar มุม ${side==='end'?`${s.id}–${nb.id}`:`${nb.id}–${s.id}`}`,o=>joint(ax,s,side,o,tOf).far+sg*(c.edge+dU/2),stop+sg*lapU);}
    else if(j.kind==='tee'&&r.tee==='ubar'){const near=j.near+c.edge+dU/2;uBar(s,z0,'T',`U-bar จุดต่อ T ${s.id}`,o=>joint(ax,s,side,o,tOf).far+c.edge+dVmax+dU/2,near+lapU);}
    else if(j.kind==='free'&&free==='ucap-edge'){const b=side==='start'?c.edge+dU/2:s.len-c.edge-dU/2;uBar(s,z0,'C',`U ปิดปลายผนัง ${s.id}`,()=>b,b+sg*lapU);}}}
  if(free==='boundary'&&bd&&bd.ties.diameter>0&&bd.ties.spacing>0)for(const s of segs)for(const side of ['start','end'] as const){if(!isFreeEnd(s,side))continue;const dt=bd.ties.diameter,rad=bendRadius(dt,det,true);
   for(const z of spreadAt(lv.zBase+c.edge+dt/2,lv.zTop-c.edge-dt/2,bd.ties.spacing)){const L=levelOfZ(lv,z),t=tIn(s,liftNear(lv,s,z,c.edge+dt)),v=t/2-c.face-dt/2,u0=side==='start'?c.edge+dt/2:s.len-bd.length,u1=side==='start'?bd.length:s.len-c.edge-dt/2;
    const pts=closedLink(0,1,2,u0,u1,-v,v,z,det,rad,dt).map(p=>at(s,p[0],p[1],p[2]));push({kind:'C',d:dt,pts,lift:L.id,face:'',what:`ปลอกรัด Boundary element ${s.id}`,code:'51',tie:true});}}
 }
 // ---- opening trims (the old straight-wall rules per segment / level), pipe sleeves
 const trims=(s:RunSeg,box:{u0:number;u1:number;z0:number;z1:number},tr:{count:number;diameter:number;ext:WallOpening['trim']['ext'];diagonal:boolean},faces:Plane['face'][],name:string,lift:string)=>{
  const d=tr.diameter;if(!(tr.count>0&&d>0))return;const L=levelOfZ(lv,(box.z0+box.z1)/2),t=tIn(s,L),ext=tr.ext==='ld'?devLength(det,d):tr.ext==='lap'||!(tr.ext>0)?lap(d):tr.ext,gap=Math.max(2*d,d+25);
  const xl=(isFreeEnd(s,'start')?c.edge:jointClear(ax,s,'start',c.edge))+d/2,xr=(isFreeEnd(s,'end')?s.len-c.edge:jointClear(ax,s,'end',c.edge))-d/2,zl=lv.zBase+c.edge+d/2,zr=lv.zTop-c.edge-d/2;
  const pls=(two?[{face:'out' as const,o:t/2-c.face-O.vertical.diameter-O.horizontal.diameter-d/2,s:-1},{face:'in' as const,o:-(t/2-c.face-I.vertical.diameter-I.horizontal.diameter-d/2),s:1}]:[{face:'mid' as const,o:(O.vertical.diameter+d)/2,s:1}]).filter(p=>faces.includes(p.face));
  if(pls.some(p=>p.s<0?p.o-d*1.5<-(t/2-c.face):p.o+d*1.5>t/2-c.face))warn(`เหล็กเสริมรอบ${name} ${barName(d)}: ความหนาผนังไม่พอ ตรวจระยะหุ้ม`);
  const clip=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v)),rows=(start:number,dir:number,lo:number,hi:number)=>Array.from({length:tr.count},(_,j)=>start+dir*j*gap).filter(v=>v>=lo&&v<=hi);
  for(const pl of pls){const ov=pl.o+pl.s*d,x0=clip(box.u0-ext,xl,xr),x1=clip(box.u1+ext,xl,xr),z0=clip(box.z0-ext,zl,zr),z1=clip(box.z1+ext,zl,zr),tag=`${name} · ${faceName[pl.face]}`;
   if(x1-x0>2*d)for(const z of [...rows(box.z1+c.edge+d/2,1,zl,zr),...rows(box.z0-c.edge-d/2,-1,zl,zr)])push({kind:'OP',d,pts:[at(s,x0,pl.o,z),at(s,x1,pl.o,z)],lift,face:pl.face,what:`เหล็กเสริมรอบ${tag} · แนวนอน`});
   if(z1-z0>2*d)for(const u of [...rows(box.u0-c.edge-d/2,-1,xl,xr),...rows(box.u1+c.edge+d/2,1,xl,xr)])push({kind:'OP',d,pts:[at(s,u,ov,z0),at(s,u,ov,z1)],lift,face:pl.face,what:`เหล็กเสริมรอบ${tag} · แนวตั้ง`});
   if(tr.diagonal)([[box.u0,box.z0,-1,-1],[box.u1,box.z0,1,-1],[box.u0,box.z1,-1,1],[box.u1,box.z1,1,1]] as const).forEach(([cx,cz,sx,sz])=>{
    if(cx<=xl||cx>=xr||cz<=zl||cz>=zr)return;
    for(let j=0;j<tr.count;j++){const off=(c.edge+d+j*gap)/Math.SQRT2,mx=cx+sx*off,mz=cz+sz*off,ux=sx/Math.SQRT2,uz=-sz/Math.SQRT2;
     const lim=(sgn:number)=>{let h=ext;for(const [p,u,lo,hi] of [[mx,ux*sgn,xl,xr],[mz,uz*sgn,zl,zr]] as const){if(u>1e-9)h=Math.min(h,(hi-p)/u);else if(u<-1e-9)h=Math.min(h,(lo-p)/u);}return Math.max(0,h);};
     const h1=lim(1),h0=lim(-1);if(h0+h1<Math.max(12*d,300))continue;const A:[number,number]=[mx-ux*h0,mz-uz*h0],Bq:[number,number]=[mx+ux*h1,mz+uz*h1],[p,q]=A[0]<=Bq[0]?[A,Bq]:[Bq,A];
     push({kind:'OP',d,pts:[at(s,p[0],ov,p[1]),at(s,q[0],ov,q[1])],lift,face:pl.face,what:`เหล็กเสริมรอบ${tag} · ทแยงมุม`});}});}};
 for(const o of run.openings){const s=segs.find(x=>x.id===o.segment);if(!s)continue;
  for(const Lid of openingLevels(run,o)){const rg=levelRange(run,lv,Lid);if(!rg)continue;const box={u0:o.x,u1:o.x+o.w,z0:rg[0]+o.z,z1:rg[0]+o.z+o.h},L=levelOfZ(lv,(box.z0+box.z1)/2);
   trims(s,box,o.trim,o.face==='through'?['out','in','mid']:[o.face,'mid'],`ช่องเปิด ${o.label||o.id}`,L.id);}}
 for(const sl of tank?.sleeves||[]){const s=segs.find(x=>x.id===sl.segment);if(!s)continue;const z=lv.zBase+sl.z,box={u0:sl.x-sl.dia/2,u1:sl.x+sl.dia/2,z0:z-sl.dia/2,z1:z+sl.dia/2};
  trims(s,box,{count:1,diameter:Math.max(12,O.horizontal.diameter),ext:'ld',diagonal:false},['out','in','mid'],`ปลอกท่อ Ø${sl.dia}`,levelOfZ(lv,z).id);
  if(sl.dia>Math.min(O.vertical.spacing,O.horizontal.spacing))warn(`ปลอกท่อ Ø${sl.dia} ใหญ่กว่าระยะเหล็ก · ตรวจการตัดเหล็กผนังที่ปลอกท่อตามแบบ`);}
 // ---- slabs: tank bottom / cover, lift pit (mesh both ways, top + bottom, cut at manholes + trimmers)
 const rot=run.origin.rotation*DEG,cs=Math.cos(rot),sn=Math.sin(rot),toL=(p:P2):P2=>[p[0]*cs+p[1]*sn,-p[0]*sn+p[1]*cs],toW=(u:number,v:number,z:number):V3=>[u*cs-v*sn,u*sn+v*cs,z];
 const slab=(outline:P2[],z0:number,z1:number,m:{top:WallMesh;bottom:WallMesh},holes:{x:number;y:number;w:number;h:number}[],kind:WallKind,lift:string,name:string)=>{
  const loc=outline.map(toL),mp=[[[...loc,loc[0]]]] as unknown as Parameters<typeof multiIntervals>[0],xs=loc.map(p=>p[0]),ys=loc.map(p=>p[1]);
  const hl=holes.map(h=>{const q=[[h.x,h.y],[h.x+h.w,h.y],[h.x+h.w,h.y+h.h],[h.x,h.y+h.h]].map(p=>toL(p as P2));return {x0:Math.min(...q.map(p=>p[0])),x1:Math.max(...q.map(p=>p[0])),y0:Math.min(...q.map(p=>p[1])),y1:Math.max(...q.map(p=>p[1]))};});
  for(const [layer,mesh,zz] of [['ล่าง',m.bottom,(d:number,k:number)=>z0+c.face+(k?m.bottom.diameter:0)+d/2],['บน',m.top,(d:number,k:number)=>z1-c.face-(k?m.top.diameter:0)-d/2]] as const){
   const d=mesh.diameter;if(!(d>0&&mesh.spacing>0))continue;
   for(const along of [0,1] as const){const lo=(along?Math.min(...xs):Math.min(...ys))+c.edge+d/2,hi=(along?Math.max(...xs):Math.max(...ys))-c.edge-d/2,z=zz(d,along);
    for(const pos of spreadAt(lo,hi,mesh.spacing))for(const [a,b] of multiIntervals(mp,along,pos)){
     const hs=hl.filter(h=>along===0?pos>h.y0-c.edge-d/2&&pos<h.y1+c.edge+d/2:pos>h.x0-c.edge-d/2&&pos<h.x1+c.edge+d/2).map(h=>(along===0?[h.x0-c.edge-d/2,h.x1+c.edge+d/2]:[h.y0-c.edge-d/2,h.y1+c.edge+d/2]) as [number,number]);
     for(const [p,q] of cutSpan(a+c.edge+d/2,b-c.edge-d/2,hs,Math.max(12*d,150)))for(const [p2,q2] of straightPieces(p,q,lap(d),stock))
      push({kind,d,pts:along===0?[toW(p2,pos,z),toW(q2,pos,z)]:[toW(pos,p2,z),toW(pos,q2,z)],lift,face:'',what:`${name} · เหล็ก${layer} ${along===0?'แนวแกน':'ตั้งฉากแกน'}${hs.length?' (ตัดที่ช่องเปิด)':''}`});}
    for(const h of hl){const Ld=devLength(det,d);for(const sgn of [-1,1]){const pos=along===0?(sgn<0?h.y0-c.edge-d/2-d:h.y1+c.edge+d/2+d):(sgn<0?h.x0-c.edge-d/2-d:h.x1+c.edge+d/2+d);
     const [a,b]=along===0?[h.x0-Ld,h.x1+Ld]:[h.y0-Ld,h.y1+Ld],iv=multiIntervals(mp,along,pos).find(([p,q])=>p<=(a+b)/2&&q>=(a+b)/2);if(!iv)continue;const p=Math.max(a,iv[0]+c.edge+d/2),q=Math.min(b,iv[1]-c.edge-d/2);if(q-p<300)continue;
     push({kind,d,pts:along===0?[toW(p,pos,z),toW(q,pos,z)]:[toW(pos,p,z),toW(pos,q,z)],lift,face:'',what:`${name} · เหล็กเสริมรอบช่องเปิด${layer}`});}}}}};
 if(tank&&lv.bottom)slab(ring(ax,s=>tIn(s,first)/2+tank.bottom.projection),lv.bottom[0],lv.bottom[1],tank.bottom.rebar,[],'B','BASE','พื้นบ่อ');
 if(tank?.cover&&lv.cover)slab(ring(ax,s=>tIn(s,lastLift)/2),lv.cover[0],lv.cover[1],tank.cover.rebar,tank.cover.manholes,'K','COVER','ฝาบ่อ');
 if(pit&&lv.pit)slab(ring(ax,s=>tIn(s,first)/2),lv.pit[0],lv.pit[1],pit.rebar,[],'B','BASE','พื้นบ่อลิฟต์');
 // haunch diagonals: one per inner vertical position, parallel to the 45° fillet, inside the equal-area band
 if(tank?.haunch&&tank.haunch.size>0&&lv.bottom&&two){const size=tank.haunch.size,d=I.vertical.diameter,Ld=devLength(det,d),zB=lv.zBase;
  for(const s of ax.segs){const t=tIn(s,first),cc=Math.SQRT2*(c.face+d/2)+1,zLo=lv.bottom[0]+c.face+d/2,oMax=t/2-c.face-d/2;
   const zAt=(o:number)=>zB+t/2+size/2-cc+o,oAt=(z:number)=>z-zB-t/2-size/2+cc;
   const oUp=Math.min(-t/2+Ld/Math.SQRT2,oMax),oLo=Math.max(oAt(zB)-Ld/Math.SQRT2,oAt(zLo));
   for(const e of entries(s,planes[1],1,first))if(e.kind==='V')push({kind:'B',d,pts:[at(s,e.u,oLo,zAt(oLo)),at(s,e.u,oUp,zAt(oUp))],lift:'BASE',face:'in',what:'เหล็กทแยง Haunch ผนัง–พื้นบ่อ'});}}
 // ---- retaining base: transverse top / bottom (hooked), distribution, key U bars
 if(rt&&lv.base){const [b0,b1]=lv.base,sg=rt.soilSide==='out'?1:-1,R=rt.rebar,dd=R.dist.diameter;
  for(const s of ax.segs){const t=tIn(s,first),oH=sg*(t/2+rt.heel),oT=-sg*(t/2+rt.toe);
   const ends=(f:(x:RunSeg)=>number)=>{const a=neighbour(ax,s,'start'),b=neighbour(ax,s,'end');return [a?meetU(s,f(s),a,f(a))??0:0,b?meetU(s,f(s),b,f(b))??s.len:s.len];};
   const [hA,hB]=ends(x=>sg*(tIn(x,first)/2+rt.heel)),[tA,tB]=ends(x=>-sg*(tIn(x,first)/2+rt.toe)),uA=Math.max(hA,tA,0)+c.edge,uB=Math.min(hB,tB,s.len)-c.edge;
   for(const [mesh,top] of [[R.bottom,false],[R.top,true]] as const){const d=mesh.diameter;if(!(d>0&&mesh.spacing>0))continue;
    const z=top?b1-c.face-d/2:b0+c.face+d/2,leg=Math.min(hookLeg(d),b1-b0-2*c.face-d),o1=oT+sg*(c.edge+d/2),o2=oH-sg*(c.edge+d/2),dz=top?-leg:leg;
    for(const u of spreadAt(uA+d/2,uB-d/2,mesh.spacing))push({kind:'B',d,pts:[at(s,u,o1,z+dz),at(s,u,o1,z),at(s,u,o2,z),at(s,u,o2,z+dz)],lift:'BASE',face:'',what:`ฐานกันดิน · เหล็ก${top?'บน':'ล่าง'}ตามขวาง (ขอปลาย)`});}
   if(dd>0&&R.dist.spacing>0)for(const top of [false,true]){const z=top?b1-c.face-R.top.diameter-dd/2:b0+c.face+R.bottom.diameter+dd/2;
    for(const w of spreadAt(Math.min(oT,oH)+c.edge+dd/2,Math.max(oT,oH)-c.edge-dd/2,R.dist.spacing)){const [a,b]=ends(()=>w),p=a+(neighbour(ax,s,'start')?0:c.edge+dd/2),q=b-(neighbour(ax,s,'end')?0:c.edge+dd/2);
     for(const [p2,q2] of straightPieces(p,q,lap(dd),stock))push({kind:'B',d:dd,pts:[at(s,p2,w,z),at(s,q2,w,z)],lift:'BASE',face:'',what:`ฐานกันดิน · เหล็กกระจาย${top?'บน':'ล่าง'}`});}}
   if(rt.key&&lv.key){const d=R.bottom.diameter,kw=rt.key.width,o1=-kw/2+c.edge+d/2,o2=kw/2-c.edge-d/2,zl=lv.key[0]+c.face+d/2,zu=b1-c.face-R.top.diameter-dd-d/2;
    if(o2-o1<3*d)warn('Key แคบเกินไปสำหรับเหล็ก U');else for(const u of spreadAt(uA+d/2,uB-d/2,R.bottom.spacing))push({kind:'B',d,pts:[at(s,u,o1,zu),at(s,u,o1,zl),at(s,u,o2,zl),at(s,u,o2,zu)],lift:'BASE',face:'',what:'เหล็ก U ใน Key'});}}}
 return out;
}
/** Straight bar a..b split into equal pieces ≤ stock with laps. */
function straightPieces(a:number,b:number,lap:number,stock:number):[number,number][]{
 const L=b-a;if(L<=stock+EPS)return [[a,b]];const n=Math.ceil((L-lap)/(stock-lap)-1e-9),len=(L+(n-1)*lap)/n;
 return Array.from({length:n},(_,k)=>[a+k*(len-lap),a+k*(len-lap)+len] as [number,number]);
}

// ---------- marks ----------
const shapeOf=(pts:V3[]):{code:string;bent:boolean}=>{
 if(pts.length===2)return {code:'00',bent:false};
 const segs=pts.slice(1).map((p,i)=>[p[0]-pts[i][0],p[1]-pts[i][1],p[2]-pts[i][2]]),right=segs.slice(1).every((s,i)=>{const a=segs[i],dot=s[0]*a[0]+s[1]*a[1]+s[2]*a[2];return Math.abs(dot)<1e-6*Math.hypot(...s)*Math.hypot(...a);});
 if(right&&pts.length===3)return {code:'11',bent:true};if(right&&pts.length===4)return {code:'21',bent:true};
 if(pts.length===4){const a=segs[0],b=segs[2],cr=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);if(cr<1e-6*Math.hypot(...a)*Math.hypot(...b))return {code:'26',bent:true};}
 return {code:'99',bent:true};
};
/** Mark prefix from the member code (letters / digits / -), e.g. W1. */
export const wallMarkPrefix=(code:string)=>(code.replace(/[^A-Za-z0-9-]/g,'')||'W').slice(0,20);
export type WallSet={id:string;mark:string;kind:WallKind;lifts:Map<string,number>;faces:Set<string>;
 /** bars per face ('out' | 'in' | 'mid' | '' = across / slab) */ faceCount:Map<string,number>;what:string;d:number};
/** Raw bars → Mark sets: equal bars (same kind, size, shape) share a Mark placed by spacing or offsets; lifts kept per set. */
export function groupWallRaw(raw:WallRaw[],det:Detailing,code:string,shift:V3=[0,0,0]):{bars:GenBar[];sets:WallSet[]}{
 const keyOf=(r:WallRaw)=>{const o=r.pts[0];return [r.kind,r.d,r.cut||0,r.code||'',r.pts.map(p=>p.map((v,k)=>Math.round(v-o[k])).join(',')).join(';')].join('|');};
 const groups=new Map<string,WallRaw[]>();for(const r of raw){const k=keyOf(r);const g=groups.get(k);if(g)g.push(r);else groups.set(k,[r]);}
 const minZ=(g:WallRaw[])=>Math.min(...g.map(r=>r.pts[0][2]));
 const list=[...groups.values()].sort((a,b)=>wallKinds.indexOf(a[0].kind)-wallKinds.indexOf(b[0].kind)||minZ(a)-minZ(b)||a[0].pts[0][0]-b[0].pts[0][0]||a[0].pts[0][1]-b[0].pts[0][1]||a[0].d-b[0].d);
 const n=new Map<string,number>(),bars:GenBar[]=[],sets:WallSet[]=[],pre=wallMarkPrefix(code);
 for(const g0 of list)for(let atn=0;atn<g0.length;atn+=2000){
  const g=g0.slice(atn,atn+2000),r=g[0],no=(n.get(r.kind)||0)+1;n.set(r.kind,no);
  const tag=r.kind==='OP'?`OP${no}`:`${r.kind}${String(no).padStart(2,'0')}`,mark=`${pre}-${tag}`.slice(0,32),id=`gen-wr-${tag.toLowerCase()}`;
  const sortedG=[...g].sort((a,b)=>a.pts[0][2]-b.pts[0][2]||a.pts[0][0]-b.pts[0][0]||a.pts[0][1]-b.pts[0][1]),o=sortedG[0].pts[0],offs=sortedG.map(x=>[0,1,2].map(k=>x.pts[0][k]-o[k]) as V3);
  const axis=[0,1,2].find(a=>offs.every(v=>[0,1,2].every(k=>k===a||Math.abs(v[k])<.5))),step=axis!==undefined&&offs.length>1?offs[1][axis]-offs[0][axis]:0;
  const even=axis!==undefined&&offs.length>1&&offs.every((v,i)=>i===0||Math.abs(v[axis]-offs[i-1][axis]-step)<.5);
  const sh=r.code?{code:r.code,bent:true}:shapeOf(r.pts),pts=sortedG[0].pts.map(p=>[p[0]+shift[0],p[1]+shift[1],p[2]+shift[2]] as V3);
  const ext=[0,1,2].map(k=>Math.max(...r.pts.map(p=>p[k]))-Math.min(...r.pts.map(p=>p[k]))),bax=(['X','Y','Z'] as const)[ext.indexOf(Math.max(...ext))];
  const lifts=new Map<string,number>();for(const x of g)lifts.set(x.lift,(lifts.get(x.lift)||0)+1);
  const faces=new Set<string>(g.map(x=>x.face).filter(Boolean)),faceCount=new Map<string,number>();for(const x of g)faceCount.set(x.face,(faceCount.get(x.face)||0)+1);
  const fl=[...faces].map(f=>faceName[f]).join(' + '),ll=[...lifts.keys()];
  const flat=pts.every(p=>Math.abs(p[2]-pts[0][2])<1);
  const base:GenBar={id,mark,role:`wr-${tag.toLowerCase()}`,note:`${r.what}${fl?` · ${fl}`:''} · ${ll.length>4?`${ll.length} ช่วงเท`:ll.join(', ')}`,diameter:r.d,grade:gradeFor(det,r.d,r.tie?det.tieGrade:det.mainGrade),count:g.length,points:pts,
   axis:bax,face:(r.kind==='B'||r.kind==='K')&&flat?(/เหล็กบน|บน /.test(r.what)?'top':'bottom'):'side',radius:sh.bent?bendRadius(r.d,det,!!r.tie):0,shapeCode:sh.code,...(r.cut?{cut:r.cut}:{})};
  if(g.length===1){const dax=bax==='Z'?'X':'Z';bars.push({...base,distributionAxis:dax,from:pts[0][dax==='X'?0:2],to:pts[0][dax==='X'?0:2]});}
  else if(even&&axis!==undefined)bars.push({...base,distributionAxis:(['X','Y','Z'] as const)[axis],from:pts[0][axis],to:pts[0][axis]+offs[offs.length-1][axis]});
  else bars.push({...base,offsets:offs});
  sets.push({id,mark,kind:r.kind,lifts,faces,faceCount,what:r.what,d:r.d});
 }
 return {bars,sets};
}

// ---------- apply ----------
/** Applies the run: shape model (normalised), reference regions (footing / slab / wall above), auto deductions, BOQ items, bars. */
export function applyWallRun(m:Member,i:WallInput,det:Detailing,warn:(s:string)=>void,rounding=25):{member:Member;bars:GenBar[]}{
 const run=i.run!,ax=runAxis(run),lv=runLevels(run),c=i.cover,sm0=shapeModelSchema.parse(wallRunShapeModel(i)),{model,shift}=normaliseShape(sm0);
 let next=applyShapeModel({...m,geometry:undefined,prismGeometry:undefined,beamAssembly:undefined,pedestal:{x:0,y:0,z:0}},model);
 next={...next,cover:Math.min(c.face,c.edge),faces:[true,true,true,true,false,false]};
 // reference regions: footing / slab under the dowels, slab or wall above the top (bars run into them; not quantified)
 const g=shapeGeometry(model),pad=1500,mn=g.min,mx=g.max,keep=editablePlacementContext(m).regions.filter(r=>!r.id.startsWith('genwr'));
 const region=(id:string,label:string,z0:number,z1:number,ref:string)=>({id,label,origin:[mn[0]-pad,mn[1]-pad,z0] as Vec3,size:[mx[0]-mn[0]+2*pad,mx[1]-mn[1]+2*pad,Math.max(1,z1-z0)] as Vec3,reference:ref,cover:0,openings:[]});
 const regions:ReturnType<typeof region>[]=[],maxD=Math.max(run.rebar.outer.vertical.diameter,run.rebar.inner.vertical.diameter,run.rebar.edgeBar?.diameter||0,run.rebar.boundary?.bars.diameter||0);
 const zb=lv.zBase+shift[2],zt=lv.zTop+shift[2],ownBase=run.wallType==='tank'||(run.wallType==='lift'&&!!run.liftPit)||run.wallType==='retaining';
 if(!ownBase&&(run.base.kind==='dowel-footing'||run.base.kind==='dowel-slab'))regions.push(region('genwr-base',run.base.kind==='dowel-footing'?'ฐานรากใต้ผนัง (อ้างอิง)':'พื้นใต้ผนัง (อ้างอิง)',zb-(run.base.embed==='ldh'?hookDevLength(det,maxD):run.base.embed)-300,zb,'เหล็กเดือยฝังในฐานราก / พื้นใต้ผนัง · ไม่คิดปริมาณในสมาชิกผนัง'));
 if(!ownBase&&run.base.kind==='continue'&&!run.converted)regions.push(region('genwr-below','ผนังชั้นล่าง (อ้างอิง)',zb-lapLength(det,maxD)-100,zb,'ผนังชั้นล่าง · เหล็กตั้งทาบลงไป · ไม่คิดปริมาณ'));
 if(!(run.wallType==='tank'&&run.tank?.cover)&&(run.top.kind==='bend-into-slab'||run.top.kind==='continue'))regions.push(region('genwr-top',run.top.kind==='continue'?'ผนังชั้นบน (อ้างอิง)':'พื้นบนผนัง (อ้างอิง)',zt,zt+(run.top.kind==='continue'?lapLength(det,maxD)+100:run.top.slab||200),'พื้น / ผนังเหนือผนังนี้ · เหล็กยื่นเข้า · ไม่คิดปริมาณ'));
 const all=[...keep,...regions];const {placementContext:_c,...rest}=next;void _c;next={...rest,...(all.length?{placementContext:{version:2 as const,regions:all}}:{})} as Member;
 // retaining stem soil face without formwork: area off the formwork
 const AUTO='[auto] ',ded=[...next.deductions];
 if(run.wallType==='retaining'&&run.retaining&&run.retaining.formSoilFace===false){const sg=run.retaining.soilSide==='out'?1:-1;let area=0;
  for(const s of ax.segs){const q=quad(ax,s,x=>sg*tIn(x,lv.lifts[0])/2,x=>sg*tIn(x,lv.lifts[0])/2-1),Lf=Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);area+=Lf*(lv.zTop-lv.zBase);}
  if(area>0)ded.push({reason:`${AUTO}ผิวฝั่งดินของผนังกันดิน (ไม่ใช้แบบหล่อ)`,volume:0,formwork:area/1e6,zRange:[zb,zt]});}
 next={...next,deductions:ded};
 // BOQ items: waterstop, kicker, sleeves, weep holes (rebuilt on every apply)
 const L=axisLength(run),items:{id:string;label:string;unit:string;quantity:number}[]=[],joints=wallJoints(run);
 if(run.waterstop?.joints&&joints.count>0)items.push({id:'gen-wall-waterstop',label:`Waterstop${run.waterstop.material?` ${run.waterstop.material}`:''} · ${joints.count} รอยต่อ × ${L.toFixed(2)} m`.slice(0,120),unit:'m',quantity:Math.round(joints.count*L*100)/100});
 if((run.base.kicker||0)>0)items.push({id:'gen-wall-kicker',label:`Kicker สูง ${run.base.kicker} mm`,unit:'m',quantity:Math.round(L*100)/100});
 const sleeves=new Map<number,number>();for(const s of run.wallType==='tank'?run.tank?.sleeves||[]:[])sleeves.set(s.dia,(sleeves.get(s.dia)||0)+1);
 for(const [d,n] of sleeves)items.push({id:`gen-wall-sleeve-${Math.round(d)}`,label:`ปลอกท่อ (Sleeve) Ø${Math.round(d)} mm`,unit:'ชุด',quantity:n});
 const wh=run.wallType==='retaining'?run.retaining?.weepHoles:undefined;if(wh){const n=ax.segs.reduce((k,s)=>k+Math.max(1,Math.floor(s.len/wh.spacing)),0);items.push({id:'gen-wall-weep',label:`ท่อระบายน้ำ (Weep hole) Ø${wh.dia} mm @${wh.spacing}`,unit:'ท่อน',quantity:n});}
 const old=(next.siteWork?.items||[]).filter(it=>!/^gen-wall-/.test(it.id));
 if(items.length||(next.siteWork?.items||[]).some(it=>/^gen-wall-/.test(it.id)))next=withSiteWork(next,{...(next.siteWork||emptySiteWork()),items:[...old,...items].slice(0,30)});
 const raw=wallRunRaw(i,det,rounding,warn),{bars}=groupWallRaw(raw,det,m.code,shift);
 if(bars.length>300)warn(`ชุดเหล็ก ${bars.length} Mark เกิน 300 ต่อสมาชิก · แบ่งผนังเป็นหลายสมาชิก`);
 return {member:next,bars};
}
/** Horizontal construction joints (waterstop): between wall lifts, wall–base (dowels / tank / pit / retaining), wall–cover. */
export function wallJoints(run:WallRun){const lv=runLevels(run),base=run.wallType==='tank'||run.wallType==='retaining'||(run.wallType==='lift'&&!!run.liftPit)||run.base.kind!=='none';
 const count=Math.max(0,lv.lifts.length-1)+(base?1:0)+(lv.cover?1:0);return {count,base,cover:!!lv.cover};}

// ---------- per lift ----------
export type LiftQuantity={id:string;name:string;z0:number;z1:number;concrete:number;formwork:number;kg:number;bySize:Map<number,number>};
const ringArea2=(r:P2[])=>Math.abs(ringArea(r));
/** Concrete / formwork / steel per pour band (base slab, wall lifts, cover). Bar sets are recomputed from the input;
 * `rows` = schedule rows of the member (id, size, weight, count). */
export function wallRunLiftQuantities(m:Member,rows:{id:string;diameter:number;weight:number;count:number}[]):LiftQuantity[]{
 const i=m.elementInput as WallInput|undefined;if(!i||i.category!=='Wall'||i.layout!=='run'||!i.run||!m.shapeModel)return [];
 const lv=runLevels(i.run),sm0=shapeModelSchema.parse(wallRunShapeModel(i)),{shift}=normaliseShape(sm0),dz=shift[2],g=shapeGeometry(m.shapeModel);
 const bands=lv.bands.map(b=>({...b,z0:b.z0+dz,z1:b.z1+dz,concrete:0,formwork:0,kg:0,bySize:new Map<number,number>()}));
 if(!bands.length)return [];
 const pick=(z:number)=>bands.find(b=>z>=b.z0-EPS&&z<b.z1-EPS)||(z<bands[0].z0?bands[0]:bands[bands.length-1]);
 for(const s of g.slabs){const area=s.region.reduce((n,poly)=>n+poly.reduce((a,rg,k)=>a+(k?-1:1)*ringArea2(rg as P2[]),0),0);
  for(const b of bands){const h=Math.max(0,Math.min(s.z1,b.z1)-Math.max(s.z0,b.z0));b.concrete+=area*h/1e9;}}
 for(const f of g.surfaces){if(!f.formed)continue;const v=(f as unknown as {vertices?:V3[]}).vertices;if(!v||v.length<3)continue;const zs=v.map(p=>p[2]),z0=Math.min(...zs),z1=Math.max(...zs);
  if(z1-z0<EPS){pick(z0).formwork+=Math.abs(polyArea3(v))/1e6;continue;}
  const w=Math.hypot(v[1][0]-v[0][0],v[1][1]-v[0][1]);for(const b of bands){const h=Math.max(0,Math.min(z1,b.z1)-Math.max(z0,b.z0));b.formwork+=w*h/1e6;}}
 for(const d of m.deductions){if(d.zRange&&d.zRange[1]>d.zRange[0])for(const b of bands){const f=Math.max(0,Math.min(b.z1,d.zRange[1])-Math.max(b.z0,d.zRange[0]))/(d.zRange[1]-d.zRange[0]);b.concrete-=d.volume*f;b.formwork-=d.formwork*f;}
  else{const tot=bands.reduce((n,b)=>n+b.concrete,0)||1,ftot=bands.reduce((n,b)=>n+b.formwork,0)||1;for(const b of bands){b.concrete-=d.volume*b.concrete/tot;b.formwork-=d.formwork*b.formwork/ftot;}}}
 const sets=wallRunSets(m),byId=new Map(rows.map(r=>[r.id,r]));
 for(const s of sets){const row=byId.get(s.id);if(!row||!row.count)continue;const each=row.weight/row.count;
  for(const [lift,n] of s.lifts){const b=bands.find(x=>x.id===lift)||bands[0];b.kg+=each*n;b.bySize.set(row.diameter,(b.bySize.get(row.diameter)||0)+each*n);}}
 return bands.map(({id,name,z0,z1,concrete,formwork,kg,bySize})=>({id,name,z0,z1,concrete,formwork,kg,bySize}));
}
const polyArea3=(v:V3[])=>v.reduce((n,p,i)=>{const q=v[(i+1)%v.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
const setCache=new WeakMap<object,{code:string;sets:WallSet[]}>();
/** Mark sets of a Wall Run member with the lifts each holds (recomputed from the input; ids match the generated bars). */
export function wallRunSets(m:Pick<Member,'elementInput'|'code'>):WallSet[]{
 const i=m.elementInput as WallInput|undefined;if(!i||i.category!=='Wall'||i.layout!=='run'||!i.run)return [];
 const hit=setCache.get(i);if(hit&&hit.code===m.code)return hit.sets;
 const sets=groupWallRaw(wallRunRaw(i,i.detailing),i.detailing,m.code).sets;setCache.set(i,{code:m.code,sets});return sets;
}
/** Member built from a Wall Run (its shape model is derived: edited on the input tab, not in the shape / rebar tabs). */
export const isWallRunMember=(m:Pick<Member,'elementInput'|'category'>)=>{const i=m.elementInput as {category?:string;layout?:string}|undefined;return m.category==='Wall'&&i?.category==='Wall'&&i.layout==='run';};
/** Wall Run of a member, if any. */
export const wallRunOf=(m:Pick<Member,'elementInput'|'category'>)=>isWallRunMember(m)?(m.elementInput as WallInput):undefined;
