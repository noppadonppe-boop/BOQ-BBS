// S4a: slab-floor underlay — similarity transform source ↔ floor, two-point alignment on grid crossings, snap to the drawing
// (end / middle / intersection / corner / centre / nearest) through a hash-grid index. Pure (docs/SLAB_FLOOR.md “Tracing”).
import {entSegments,SNAP_LIMIT,type CadDoc,type P2} from './cadEntities';
import type {FloorUnderlay,SlabFloor} from './slabFloorSchema';

export type Similarity=FloorUnderlay['transform'];
export const IDENTITY:Similarity={scale:1,rotation:0,tx:0,ty:0};
export function toFloor(t:Similarity,p:P2):P2{const c=Math.cos(t.rotation)*t.scale,s=Math.sin(t.rotation)*t.scale;return [c*p[0]-s*p[1]+t.tx,s*p[0]+c*p[1]+t.ty];}
export function toSource(t:Similarity,p:P2):P2{const x=p[0]-t.tx,y=p[1]-t.ty,c=Math.cos(-t.rotation)/t.scale,s=Math.sin(-t.rotation)/t.scale;return [c*x-s*y,s*x+c*y];}
/** Similarity that maps src[0] → dst[0] and src[1] → dst[1] (scale + rotation + translation). */
export function alignTwoPoints(src:[P2,P2],dst:[P2,P2]):Similarity{
 const ds=[src[1][0]-src[0][0],src[1][1]-src[0][1]],dd=[dst[1][0]-dst[0][0],dst[1][1]-dst[0][1]],ls=Math.hypot(ds[0],ds[1]),ld=Math.hypot(dd[0],dd[1]);
 if(ls<1e-9||ld<1e-9)throw Error('จุดจัดแนวสองจุดต้องไม่ซ้ำกัน');
 const scale=ld/ls;let rotation=Math.atan2(dd[1],dd[0])-Math.atan2(ds[1],ds[0]);while(rotation>Math.PI)rotation-=2*Math.PI;while(rotation<-Math.PI)rotation+=2*Math.PI;
 // snap an almost-square rotation (drawings are axis-parallel): < 0.01° off a multiple of 90°
 const q=Math.round(rotation/(Math.PI/2))*Math.PI/2;if(Math.abs(rotation-q)<1.75e-4)rotation=q;
 const t={scale,rotation,tx:0,ty:0},p=toFloor(t,src[0]);return {scale,rotation,tx:dst[0][0]-p[0],ty:dst[0][1]-p[1]};
}
/** Floor position of a grid crossing (labels X / Y), undefined when a label is unknown. */
export function crossing(f:Pick<SlabFloor,'gridsX'|'gridsY'>,x:string,y:string):P2|undefined{
 const gx=f.gridsX.find(g=>g.label===x)?.at,gy=f.gridsY.find(g=>g.label===y)?.at;return gx===undefined||gy===undefined?undefined:[gx,gy];
}
/** Default transform of a source before alignment: drawing units → mm (DXF) or calibrated / 1:100 points (PDF), the lower-left
 * corner of the drawing at the floor origin. */
export function defaultTransform(d:CadDoc,mmPerUnit:number):Similarity{return {scale:mmPerUnit,rotation:0,tx:-d.bounds[0]*mmPerUnit,ty:-d.bounds[1]*mmPerUnit};}
/** PDF page points at 1:100 → mm. */
export const PDF_1_100=25.4/72*100;

// ---------------------------------------------------------------- snap
export type SnapKind='int'|'end'|'corner'|'centre'|'mid'|'near';
export type SnapHit={p:P2;kind:SnapKind;d:number};
type Seg=[number,number,number,number];
const PRI:Record<SnapKind,number>={int:0,end:0,corner:0,centre:0,mid:1,near:2};
/** Hash-grid index over the segments of a document (optionally only those touching `win`, source units). */
export class SnapIndex{
 readonly segs:Seg[]=[];readonly centres:P2[]=[];readonly cell:number;readonly partial:boolean;
 private grid=new Map<number,number[]>();private x0:number;private y0:number;
 constructor(d:CadDoc,win?:[number,number,number,number]){
  this.partial=!!win;
  const inWin=(s:Seg)=>!win||Math.max(s[0],s[2])>=win[0]&&Math.min(s[0],s[2])<=win[2]&&Math.max(s[1],s[3])>=win[1]&&Math.min(s[1],s[3])<=win[3];
  for(const e of d.ents){if(e.k==='text')continue;if((e.k==='circle'||e.k==='arc')&&(!win||e.c[0]>=win[0]&&e.c[0]<=win[2]&&e.c[1]>=win[1]&&e.c[1]<=win[3]))this.centres.push(e.c);
   for(const s of entSegments(e,[]))if(inWin(s)){this.segs.push(s);if(this.segs.length>=SNAP_LIMIT)break;}if(this.segs.length>=SNAP_LIMIT)break;}
  const b=win||d.bounds,W=Math.max(1e-9,b[2]-b[0]),H=Math.max(1e-9,b[3]-b[1]);
  this.cell=Math.max(W,H)/Math.max(16,Math.min(1024,Math.sqrt(this.segs.length)*2));this.x0=b[0];this.y0=b[1];
  this.segs.forEach((s,i)=>{const L=Math.hypot(s[2]-s[0],s[3]-s[1]),n=Math.min(4096,Math.ceil(L/this.cell)+1),seen=new Set<number>();
   for(let k=0;k<=n;k++){const key=this.key(s[0]+(s[2]-s[0])*k/n,s[1]+(s[3]-s[1])*k/n);if(seen.has(key))continue;seen.add(key);const l=this.grid.get(key);if(l)l.push(i);else this.grid.set(key,[i]);}});
 }
 private key(x:number,y:number){return Math.floor((x-this.x0)/this.cell)*1048576+Math.floor((y-this.y0)/this.cell);}
 /** Segment ids near p (radius r). */
 near(p:P2,r:number):number[]{
  const out=new Set<number>(),i0=Math.floor((p[0]-r-this.x0)/this.cell),i1=Math.floor((p[0]+r-this.x0)/this.cell),j0=Math.floor((p[1]-r-this.y0)/this.cell),j1=Math.floor((p[1]+r-this.y0)/this.cell);
  if((i1-i0+1)*(j1-j0+1)>4096)return [];
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)for(const k of this.grid.get(i*1048576+j)||[])out.add(k);
  return [...out].filter(k=>distSeg(p,this.segs[k])<=r);
 }
 /** Best snap within `tol` (source units): exact points first (intersection, end / corner, centre), then middle, then nearest. */
 /** `long`: intersections of the longest lines near p only (grid crossings — the alignment picks). */
 snap(p:P2,tol:number,kinds:SnapKind[]=['int','end','centre','mid','near'],o:{long?:boolean}={}):SnapHit|undefined{
  // nearest pieces first (a wide tolerance on a dense drawing holds many)
  const ids=this.near(p,tol).map(k=>({k,d:distSeg(p,this.segs[k])})).sort((a,b)=>a.d-b.d).slice(0,60).map(x=>x.k),cands:SnapHit[]=[],want=new Set(kinds);
  const add=(q:P2,kind:SnapKind)=>{const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<=tol)cands.push({p:q,kind,d});};
  for(const k of ids){const s=this.segs[k];if(want.has('end')){add([s[0],s[1]],'end');add([s[2],s[3]],'end');}if(want.has('mid'))add([(s[0]+s[2])/2,(s[1]+s[3])/2],'mid');if(want.has('near'))add(closest(p,s),'near');}
  const len=(k:number)=>{const s=this.segs[k];return Math.hypot(s[2]-s[0],s[3]-s[1]);},longest=Math.max(0,...ids.map(len));
  const pool=o.long?ids.filter(k=>len(k)>=0.5*longest):ids;
  if(want.has('int'))for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++){const q=intersect(this.segs[pool[a]],this.segs[pool[b]]);if(q)add(q,'int');}
  if(want.has('centre'))for(const c of this.centres)add(c,'centre');
  cands.sort((x,y)=>PRI[x.kind]-PRI[y.kind]||x.d-y.d);return cands[0];
 }
 /** Nearest axis-parallel segment within tol: its direction and its coordinate (x of a vertical line, y of a horizontal one). */
 line(p:P2,tol:number):{axis:'x'|'y';at:number}|undefined{
  let best:{axis:'x'|'y';at:number;d:number}|undefined;
  for(const k of this.near(p,tol)){const s=this.segs[k],dx=Math.abs(s[2]-s[0]),dy=Math.abs(s[3]-s[1]),d=distSeg(p,s);
   if(dx<1e-6*Math.max(1,dy)&&dy>0&&(!best||d<best.d))best={axis:'x',at:(s[0]+s[2])/2,d};
   else if(dy<1e-6*Math.max(1,dx)&&dx>0&&(!best||d<best.d))best={axis:'y',at:(s[1]+s[3])/2,d};}
  return best&&{axis:best.axis,at:best.at};
 }
}
function closest(p:P2,s:Seg):P2{const dx=s[2]-s[0],dy=s[3]-s[1],L=dx*dx+dy*dy;const t=L?Math.max(0,Math.min(1,((p[0]-s[0])*dx+(p[1]-s[1])*dy)/L)):0;return [s[0]+dx*t,s[1]+dy*t];}
function distSeg(p:P2,s:Seg){const q=closest(p,s);return Math.hypot(q[0]-p[0],q[1]-p[1]);}
function intersect(a:Seg,b:Seg):P2|undefined{
 const r=[a[2]-a[0],a[3]-a[1]],s=[b[2]-b[0],b[3]-b[1]],den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-12*Math.hypot(...r)*Math.hypot(...s))return;
 const t=((b[0]-a[0])*s[1]-(b[1]-a[1])*s[0])/den,u=((b[0]-a[0])*r[1]-(b[1]-a[1])*r[0])/den,e=1e-9;
 if(t<-e||t>1+e||u<-e||u>1+e)return;return [a[0]+r[0]*t,a[1]+r[1]*t];
}

/** Error of an alignment at the other grid crossings: each crossing mapped into the drawing, the nearest line intersection
 * within `tolMm` (floor mm) taken as the drawn crossing; error = floor distance. Crossings without a drawn intersection
 * near them are left out. */
export function alignResiduals(f:Pick<SlabFloor,'gridsX'|'gridsY'>,t:Similarity,index:SnapIndex,tolMm=300,skip:string[]=[]):{x:string;y:string;err:number}[]{
 const out:{x:string;y:string;err:number}[]=[];
 for(const gx of f.gridsX)for(const gy of f.gridsY){if(skip.includes(`${gx.label}/${gy.label}`))continue;
  const src=toSource(t,[gx.at,gy.at]),hit=index.snap(src,tolMm/t.scale,['int'],{long:true});if(!hit)continue;
  const q=toFloor(t,hit.p);out.push({x:gx.label,y:gy.label,err:Math.hypot(q[0]-gx.at,q[1]-gy.at)});}
 return out;
}

