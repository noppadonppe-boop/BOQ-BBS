import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import {blankBar,type Bar,type Member,type Vec3} from './model';
import {inMulti,multiIntervals,shapeGeometry,shapeSectionRects} from './shapeGeometry';

// Rebar sketching on a 2D view of a shape-model member (Revit-like “Sketch Rebar”).
// A view is a plane: section X–X (plane Y = at, draws X/Z), section Y–Y (plane X = at, draws Y/Z) or plan
// (plane Z = at, draws X/Y). Sketched points are view (u,v) coordinates; the bar is laid out along the view normal.
export type P2=[number,number];
export type SketchView={kind:'sx'|'sy'|'plan';at:number};
export const viewAxes=(v:SketchView):{u:0|1|2;v:0|1|2;n:0|1|2}=>v.kind==='sx'?{u:0,v:2,n:1}:v.kind==='sy'?{u:1,v:2,n:0}:{u:0,v:1,n:2};
const axisName=['X','Y','Z'] as const;
const open=(r:P2[])=>r.length>1&&r[0][0]===r.at(-1)![0]&&r[0][1]===r.at(-1)![1]?r.slice(0,-1):r;

/** Concrete region cut by the view plane, in view coordinates (outer rings CCW, holes CW). */
export function viewRegion(m:Member,view:SketchView):MultiPolygon{
 const sm=m.shapeModel;if(!sm)return [];
 if(view.kind==='plan'){const s=shapeGeometry(sm).slabs.find(s=>view.at>=s.z0-1e-6&&view.at<=s.z1+1e-6);return s?s.region:[];}
 const along=(view.kind==='sx'?0:1) as 0|1,rects=shapeSectionRects(sm,along,view.at).map(r=>[[[r.u0,r.z0],[r.u1,r.z0],[r.u1,r.z1],[r.u0,r.z1]]] as Polygon);
 return rects.length?polygonClipping.union(rects[0],...rects.slice(1)):[];
}
export type Seg={a:P2;b:P2};
/** Region edges moved inward by `off` (cover + bar radius): the lines a bar centre snaps to. */
export function offsetSegments(mp:MultiPolygon,off:number):Seg[]{
 const out:Seg[]=[];
 for(const poly of mp)for(const raw of poly){const r=open(raw as P2[]);r.forEach((a,i)=>{const b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-6)return;const n:P2=[-dy/l*off,dx/l*off];out.push({a:[a[0]+n[0],a[1]+n[1]],b:[b[0]+n[0],b[1]+n[1]]});});}
 return out;
}
export const edgeSegments=(mp:MultiPolygon)=>offsetSegments(mp,0);
/** Cover outline: every ring of the region offset inward by `off` with mitred corners (the line bar centres must follow). */
export function coverRings(mp:MultiPolygon,off:number):P2[][]{
 const out:P2[][]=[];
 for(const poly of mp)for(const raw of poly){const r=open(raw as P2[]).filter((p,i,a)=>{const q=a[(i+1)%a.length];return Math.hypot(q[0]-p[0],q[1]-p[1])>1e-6;});if(r.length<3)continue;
  const segs=r.map((a,i)=>{const b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),n:P2=[-dy/l*off,dx/l*off];return {a:[a[0]+n[0],a[1]+n[1]] as P2,b:[b[0]+n[0],b[1]+n[1]] as P2};});
  const ring=segs.map((sg,i)=>lineHit(segs[(i+segs.length-1)%segs.length],sg)||sg.a);
  // drop rings that collapsed (offset larger than the feature)
  if(Math.abs(ringArea(ring))>1&&Math.sign(ringArea(ring))===Math.sign(ringArea(r)))out.push(ring);}
 return out;
}
const ringArea=(r:P2[])=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
export type CoverHit={p:P2;ring:number;seg:number;corner:boolean};
/** Forced snap: the nearest point on the cover outline (a cover corner wins inside `tol`). */
export function snapToCover(p:P2,rings:P2[][],tol:number,grid=0):CoverHit|undefined{
 let best:CoverHit&{d:number}|undefined;
 rings.forEach((r,ri)=>r.forEach((a,si)=>{const b=r[(si+1)%r.length],h=near(p,{a,b}),t=Math.max(0,Math.min(1,h.t));
  let q:P2=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  // grid along the segment (keeps round dimensions without leaving the cover line)
  if(grid>0){const L=Math.hypot(b[0]-a[0],b[1]-a[1]),s=Math.round(t*L/grid)*grid/L;if(s>0&&s<1)q=[a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s];}
  const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(!best||d<best.d)best={p:q,ring:ri,seg:si,corner:false,d};}));
 if(!best)return;
 const r=rings[best.ring];for(const k of [best.seg,(best.seg+1)%r.length]){const c=r[k];if(Math.hypot(p[0]-c[0],p[1]-c[1])<=tol)return {p:c,ring:best.ring,seg:k===best.seg?best.seg:k,corner:true};}
 return {p:best.p,ring:best.ring,seg:best.seg,corner:false};
}
/** Cover corners walked between two hits on the same ring (shorter way round), so the bar follows the outline. */
export function traceCover(rings:P2[][],from:CoverHit,to:CoverHit):P2[]{
 if(from.ring!==to.ring)return [];const r=rings[from.ring],n=r.length;
 const segOf=(h:CoverHit)=>h.corner?h.seg:h.seg; // a corner hit k is the start of segment k
 const a=segOf(from),b=segOf(to);if(a===b)return [];
 const fwd=(b-a+n)%n,back=(a-b+n)%n,out:P2[]=[];
 if(fwd<=back){for(let k=1;k<=fwd;k++){const v=r[(a+k)%n];out.push(v);}}else{for(let k=0;k<back;k++){const v=r[(a-k+n)%n];out.push(v);}}
 // drop the corner equal to either end point
 return out.filter(v=>Math.hypot(v[0]-from.p[0],v[1]-from.p[1])>1e-6&&Math.hypot(v[0]-to.p[0],v[1]-to.p[1])>1e-6);
}
const inRing=(p:P2,r:P2[])=>{let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
/** Inside the cover outline (outer rings minus hole rings). */
export function insideCover(p:P2,rings:P2[][]){let inside=false;for(const r of rings){if(ringArea(r)>0){if(inRing(p,r))inside=true;}else if(inRing(p,r))return false;}return inside;}
export type HookEnd={kind:'none'|'std90'|'std180'|'custom';leg:number};
/** Standard hook data per bar size (from the spec's hook table): A/G of 90° hooks and the 180° extension. */
export type HookTable={bar:number;a90:number}[];
/** Adds end hooks: 90° (standard = table A/G, or a user leg) or 180° (standard), turned into the concrete and clipped
 * at the cover outline. Returns the new points and notes about clipped hooks. */
export function addHooks(points:P2[],ends:{start:HookEnd;end:HookEnd},d:number,rings:P2[][],table:HookTable):{points:P2[];notes:string[]}{
 if(points.length<2)return {points,notes:[]};
 const notes:string[]=[],r=sketchRadius(d),row=table.find(t=>t.bar===d)||table.filter(t=>t.bar>=d).sort((x,y)=>x.bar-y.bar)[0];
 const hook=(tip:P2,next:P2,e:HookEnd,label:string):P2[]=>{
  if(e.kind==='none')return [];
  const dx=tip[0]-next[0],dy=tip[1]-next[1],l=Math.hypot(dx,dy)||1,u:P2=[dx/l,dy/l],perp:P2[]=[[-u[1],u[0]],[u[1],-u[0]]];
  // turn toward the concrete: the perpendicular whose short step stays inside the cover outline
  const step=Math.max(5,d),side=perp.find(n=>insideCover([tip[0]+n[0]*step-u[0]*step,tip[1]+n[1]*step-u[1]*step],rings))||perp[0];
  const ok=(from:P2,dir:P2,t:number)=>{const q:P2=[from[0]+dir[0]*t,from[1]+dir[1]*t];return insideCover(q,rings)||onCover(q,rings);};
  // coarse 5 mm march, then bisection to < 0.1 mm so clipped hooks end exactly on the cover line
  const room=(from:P2,dir:P2)=>{let t=0;for(let k=1;k<=4000;k++){if(!ok(from,dir,k*5))break;t=k*5;}let lo=t,hi=t+5;if(t<20000){for(let i=0;i<8;i++){const mid=(lo+hi)/2;if(ok(from,dir,mid))lo=mid;else hi=mid;}}return lo;};
  // 180°: semicircle (two corners 2r apart) + straight extension 4d ≥ 65 mm (ACI 318 / วสท. standard hook)
  if(e.kind==='std180'){const h=2*r,tail=Math.max(4*d,65),avail=room(tip,side);
   if(avail+1e-6<h){notes.push(`${label}: ที่ไม่พอสำหรับขอ 180° ใช้ขอ 90° แทน`);return hook(tip,next,{kind:'std90',leg:0},label);}
   const c:P2=[tip[0]+side[0]*h,tip[1]+side[1]*h];return [c,[c[0]-u[0]*(r+tail),c[1]-u[1]*(r+tail)]];}
  const want=e.kind==='custom'?e.leg:row?row.a90-d/2:12*d+r,avail=room(tip,side),leg=Math.min(want,avail);
  if(leg<want-.5)notes.push(`${label}: ขอยาว ${Math.round(want)} ถูกจำกัดเป็น ${Math.round(leg)} mm ตามแนว cover`);
  if(leg<=r*1.5){notes.push(`${label}: ที่ไม่พอสำหรับขอ ใช้ปลายตรง`);return [];}
  return [[tip[0]+side[0]*leg,tip[1]+side[1]*leg]];
 };
 const s=hook(points[0],points[1],ends.start,'ปลายต้น'),e=hook(points.at(-1)!,points.at(-2)!,ends.end,'ปลายท้าย');
 return {points:[...s.reverse(),...points,...e],notes};
}
const onCover=(p:P2,rings:P2[][])=>rings.some(r=>r.some((a,i)=>near(p,{a,b:r[(i+1)%r.length]}).d<1&&near(p,{a,b:r[(i+1)%r.length]}).t>=-1e-6&&near(p,{a,b:r[(i+1)%r.length]}).t<=1+1e-6));
const near=(p:P2,s:Seg):{q:P2;d:number;t:number}=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],l=dx*dx+dy*dy,t=l?((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/l:0,q:P2=[s.a[0]+t*dx,s.a[1]+t*dy];return {q,d:Math.hypot(p[0]-q[0],p[1]-q[1]),t};};
function lineHit(s1:Seg,s2:Seg):P2|undefined{const d1=[s1.b[0]-s1.a[0],s1.b[1]-s1.a[1]],d2=[s2.b[0]-s2.a[0],s2.b[1]-s2.a[1]],den=d1[0]*d2[1]-d1[1]*d2[0];if(Math.abs(den)<1e-9)return;const t=((s2.a[0]-s1.a[0])*d2[1]-(s2.a[1]-s1.a[1])*d2[0])/den;return [s1.a[0]+t*d1[0],s1.a[1]+t*d1[1]];}
export type Snap={p:P2;kind:'corner'|'cover'|'edge'|'ortho'|'grid'|'free'};
/** Snap a cursor point: cover corner > cover line > concrete edge > orthogonal to the previous point > grid. */
export function snapPoint(p:P2,opts:{cover:Seg[];edges:Seg[];prev?:P2;tol:number;grid:number;ortho:boolean}):Snap{
 const extend=(s:Seg,k=.25):Seg=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];return {a:[s.a[0]-dx*k,s.a[1]-dy*k],b:[s.b[0]+dx*k,s.b[1]+dy*k]};};
 const cov=opts.cover.map(s=>({s,...near(p,s)})).filter(h=>h.d<=opts.tol&&h.t>-.25&&h.t<1.25).sort((a,b)=>a.d-b.d);
 // corners: intersection of the two nearest non-parallel cover lines
 for(let i=0;i<cov.length;i++)for(let j=i+1;j<cov.length;j++){const x=lineHit(extend(cov[i].s),extend(cov[j].s));if(x&&Math.hypot(x[0]-p[0],x[1]-p[1])<=opts.tol*1.5)return {p:x,kind:'corner'};}
 if(cov.length){let q=cov[0].q;if(opts.ortho&&opts.prev){const s=cov[0].s,horizontal=Math.abs(s.b[1]-s.a[1])<Math.abs(s.b[0]-s.a[0]);
   // keep the segment orthogonal when the cover line allows it
   if(horizontal&&Math.abs(q[0]-opts.prev[0])<opts.tol)q=[opts.prev[0],q[1]];if(!horizontal&&Math.abs(q[1]-opts.prev[1])<opts.tol)q=[q[0],opts.prev[1]];}
  return {p:q,kind:'cover'};}
 const e=opts.edges.map(s=>near(p,s)).filter(h=>h.d<=opts.tol&&h.t>=0&&h.t<=1).sort((a,b)=>a.d-b.d)[0];if(e)return {p:e.q,kind:'edge'};
 const g=(v:number)=>opts.grid>0?Math.round(v/opts.grid)*opts.grid:v;
 if(opts.ortho&&opts.prev){const dx=p[0]-opts.prev[0],dy=p[1]-opts.prev[1];if(Math.abs(dy)<Math.abs(dx)*.18)return {p:[g(p[0]),opts.prev[1]],kind:'ortho'};if(Math.abs(dx)<Math.abs(dy)*.18)return {p:[opts.prev[0],g(p[1])],kind:'ortho'};}
 return {p:[g(p[0]),g(p[1])],kind:opts.grid>0?'grid':'free'};
}
/** World point of a view point at distribution coordinate `n`. */
export function toWorld(view:SketchView,p:P2,n:number):Vec3{const a=viewAxes(view),w:Vec3=[0,0,0];w[a.u]=p[0];w[a.v]=p[1];w[a.n]=n;return w;}
export const toView=(view:SketchView,w:Vec3):P2=>{const a=viewAxes(view);return [w[a.u],w[a.v]];};

const turn=(a:P2,b:P2,c:P2)=>{const u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]],lu=Math.hypot(u[0],u[1]),lv=Math.hypot(v[0],v[1]);const cos=(u[0]*v[0]+u[1]*v[1])/(lu*lv||1),cross=u[0]*v[1]-u[1]*v[0];return {deg:Math.acos(Math.max(-1,Math.min(1,cos)))*180/Math.PI,side:Math.sign(cross)};};
/** BS 8666 code from the sketched polyline (closed loops / anything else → 99). */
export function detectShapeCode(pts:P2[]):string{
 if(pts.length<2)return '';if(pts.length===2)return '00';
 const t=pts.slice(1,-1).map((b,i)=>turn(pts[i],b,pts[i+2])),right=t.every(x=>Math.abs(x.deg-90)<1);
 if(pts.length===3)return right?'11':'99';
 if(pts.length===4&&right)return t[0].side===t[1].side?'21':'99';
 if(pts.length===6&&right&&t.every(x=>x.side===t[0].side))return '41';
 if(pts.length===5&&right&&t.every(x=>x.side===t[0].side))return '99';
 return '99';
}
export const polyLength=(pts:P2[])=>pts.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1]),0);

export type LayoutRule={rule:'spacing'|'count'|'single';spacing:number;count:number;from:number;to:number};
/** Number of bars and their range along the distribution axis (spacing = maximum spacing, like Revit). */
export function layoutOf(l:LayoutRule){
 if(l.rule==='single')return {count:1,from:l.from,to:l.from};
 const len=Math.max(0,l.to-l.from);
 if(l.rule==='count'){const n=Math.max(1,Math.trunc(l.count));return {count:n,from:l.from,to:n===1?l.from:l.to};}
 const n=len<1e-6?1:Math.ceil(len/Math.max(1,l.spacing)-1e-9)+1;return {count:n,from:l.from,to:n===1?l.from:l.to};
}
/** Default distribution range: concrete extent along the view normal, minus cover + d/2 at both ends. */
export function defaultRange(m:Member,view:SketchView,cover:number,d:number):[number,number]{
 const a=viewAxes(view),size=[m.x,m.y,m.z][a.n];return [cover+d/2,Math.max(cover+d/2,size-cover-d/2)];
}
/** Centreline bend radius for a bar size: BS 8666 minimum scheduling radius r (2d ≤ 16, 3.5d ≥ 20) + d/2. */
export const sketchRadius=(d:number)=>(d<=16?2:3.5)*d+d/2;

export const SKETCH_PREFIX='sk-';
export const isSketchBar=(b:Bar)=>b.id.startsWith(SKETCH_PREFIX);
/** Bar from a sketch: template drawn at `layout.from` on the normal axis, distributed to `layout.to`. */
export function sketchBar(o:{mark:string;view:SketchView;points:P2[];diameter:number;grade:string;layout:LayoutRule;note?:string;id?:string}):Bar{
 const l=layoutOf(o.layout),a=viewAxes(o.view),pts=o.points.map(p=>toWorld(o.view,p,l.from)),code=detectShapeCode(o.points);
 const longest=o.points.slice(1).map((p,i)=>({i,l:Math.hypot(p[0]-o.points[i][0],p[1]-o.points[i][1])})).sort((x,y)=>y.l-x.l)[0]?.i??0;
 const d=[0,1,2].map(k=>Math.abs(pts[longest+1][k]-pts[longest][k])),axis=axisName[d.indexOf(Math.max(...d))];
 const radius=o.points.length>2?sketchRadius(o.diameter):0;
 return {...blankBar(o.mark),id:o.id||`${SKETCH_PREFIX}${crypto.randomUUID().slice(0,12)}`,diameter:o.diameter,grade:o.grade,count:l.count,shape:'polyline',shapeCode:code,axis,face:'side',radius:Number(radius.toFixed(3)),
  points:pts.map(p=>p.map(v=>Number(v.toFixed(3))) as Vec3),distributionAxis:axisName[a.n],distributionStart:l.from,distributionEnd:l.to,
  ...(['00','11','21'].includes(code)?{lengthMethod:'bs8666' as const}:{}),note:(o.note||`วาดบน${o.view.kind==='plan'?`แปลน Z ${Math.round(o.view.at)}`:`รูปตัด ${o.view.kind==='sx'?'X–X':'Y–Y'} @${Math.round(o.view.at)}`} · ${o.layout.rule==='spacing'?`@${o.layout.spacing}`:o.layout.rule==='count'?`${l.count} เส้น`:'เดี่ยว'}`).slice(0,500)};
}

/** Area reinforcement on a plan level: straight bars along X and/or Y inside the region (cover + d/2 from every edge).
 * Bars of equal length are one Mark (offsets for unequal positions). `legs`: end bends up (+) / down (−) mm. */
export function meshBars(m:Member,o:{z:number;diameter:number;grade:string;spacing:number;cover:number;dirs:('X'|'Y')[];leg:number;note:string}):Bar[]{
 const sm=m.shapeModel;if(!sm)return [];const s=shapeGeometry(sm).slabs.find(s=>o.z>=s.z0-1e-6&&o.z<=s.z1+1e-6);if(!s)return [];
 const out:Bar[]=[],c=o.cover+o.diameter/2;let work=m;const mark=()=>{const k=nextMark(work);work={...work,bars:[...work.bars,{...blankBar(k)}]};return k;};
 for(const dir of o.dirs){
  const along=(dir==='X'?0:1) as 0|1,across=1-along,vals=s.region.flatMap(p=>(p[0] as P2[]).map(q=>q[across])),lo=Math.min(...vals)+c,hi=Math.max(...vals)-c;if(!(hi>lo))continue;
  const n=Math.ceil((hi-lo)/o.spacing-1e-9)+1,segs:{a:number;b:number;at:number}[]=[];
  for(let k=0;k<n;k++){const at=n===1?lo:lo+(hi-lo)*k/(n-1);for(const [a,b] of multiIntervals(s.region,along,at))if(b-a>2*c+2*o.diameter)segs.push({a:a+c,b:b-c,at});}
  const groups=new Map<number,typeof segs>();for(const sg of segs){const key=Math.round(sg.b-sg.a);groups.set(key,[...(groups.get(key)||[]),sg]);}
  for(const [len,list] of [...groups.entries()].sort((x,y)=>y[0]-x[0])){
   const f=list[0],pt=(u:number,w:number,z:number):Vec3=>along===0?[u,w,z]:[w,u,z],z=o.z;
   const pts:Vec3[]=o.leg?[pt(f.a,f.at,z+o.leg),pt(f.a,f.at,z),pt(f.b,f.at,z),pt(f.b,f.at,z+o.leg)]:[pt(f.a,f.at,z),pt(f.b,f.at,z)];
   const offsets=list.map(sg=>pt(sg.a-f.a,sg.at-f.at,0));
   const uniform=list.every(sg=>Math.abs(sg.a-f.a)<.5);
   out.push({...blankBar(mark()),id:`${SKETCH_PREFIX}${crypto.randomUUID().slice(0,12)}`,diameter:o.diameter,grade:o.grade,count:list.length,shape:'polyline',shapeCode:o.leg?'21':'00',axis:dir,face:o.leg>0?'bottom':o.leg<0?'top':'side',
    radius:o.leg?Number(sketchRadius(o.diameter).toFixed(3)):0,points:pts.map(p=>p.map(v=>Number(v.toFixed(3))) as Vec3),lengthMethod:'bs8666',
    ...(uniform?{distributionAxis:(dir==='X'?'Y':'X') as Bar['axis'],distributionStart:f.at,distributionEnd:list.at(-1)!.at}:{offsets}),note:`${o.note} · ทิศ ${dir} @${o.spacing} · ช่วง ${len} mm`.slice(0,500)});
  }
 }
 return out;
}
/** Horizontal closed loops just inside the outer edge of the plan region at `z`, stacked from z to zTop at ≤ spacing; lap overlap on the first side. */
export function loopBars(m:Member,o:{z:number;zTop:number;diameter:number;grade:string;spacing:number;cover:number;lap:number;mark:string;note:string}):Bar[]{
 const sm=m.shapeModel;if(!sm)return [];const s=shapeGeometry(sm).slabs.find(s=>o.z>=s.z0-1e-6&&o.z<=s.z1+1e-6);if(!s||!s.region.length)return [];
 const outer=open(s.region.reduce((a,b)=>Math.abs(area(a[0] as P2[]))>=Math.abs(area(b[0] as P2[]))?a:b)[0] as P2[]),off=o.cover+o.diameter/2;
 const segs=outer.map((a,i)=>{const b=outer[(i+1)%outer.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);return {a:[a[0]-dy/l*off,a[1]+dx/l*off] as P2,b:[b[0]-dy/l*off,b[1]+dx/l*off] as P2};});
 const ring=segs.map((sg,i)=>lineHit(segs[(i+segs.length-1)%segs.length],sg)||sg.a);
 if(ring.length+2>100)return [];
 const first=ring[0],second=ring[1],l=Math.hypot(second[0]-first[0],second[1]-first[1]),k=Math.min(1,o.lap/(l||1)),lapEnd:P2=[first[0]+(second[0]-first[0])*k,first[1]+(second[1]-first[1])*k];
 const pts=[...ring,first,lapEnd].map(p=>[Number(p[0].toFixed(3)),Number(p[1].toFixed(3)),o.z] as Vec3);
 const limit=stackTop(m,ring,o.z)-o.cover-o.diameter/2,zTop=Math.min(o.zTop,limit),clipped=zTop<o.zTop-.5;
 const lay=layoutOf({rule:'spacing',spacing:o.spacing,count:0,from:o.z,to:Math.max(o.z,zTop)});
 return [{...blankBar(o.mark),id:`${SKETCH_PREFIX}${crypto.randomUUID().slice(0,12)}`,diameter:o.diameter,grade:o.grade,count:lay.count,shape:'polyline',shapeCode:'99',axis:'X',face:'side',radius:Number(sketchRadius(o.diameter).toFixed(3)),
  points:pts,distributionAxis:'Z',distributionStart:lay.from,distributionEnd:lay.to,note:`${o.note} · ${lay.count} ชั้น @ ≤ ${o.spacing} · ทาบ ${o.lap} mm${clipped?` · จำกัดถึง Z ${Math.round(zTop)} (เหนือนั้นแปลนเปลี่ยน)`:''}`.slice(0,500)}];
}
/** Vertical face bars round the outer edge of the plan region at z0 (cover + d/2 inside), from z0 to z1 at ≤ spacing
 * along every side; optional inward legs at both ends. One Mark: template copied by offsets and turned per side. */
export function verticalFaceBars(m:Member,o:{z0:number;z1:number;diameter:number;grade:string;spacing:number;cover:number;leg:number;mark:string;note:string}):Bar[]{
 const sm=m.shapeModel;if(!sm||o.z1-o.z0<=2*o.diameter)return [];
 const s=shapeGeometry(sm).slabs.find(s=>o.z0>=s.z0-1e-6&&o.z0<=s.z1+1e-6);if(!s||!s.region.length)return [];
 const outerPoly=s.region.reduce((a,b)=>Math.abs(area(a[0] as P2[]))>=Math.abs(area(b[0] as P2[]))?a:b),ring=coverRings([[outerPoly[0]]],o.cover+o.diameter/2)[0];if(!ring)return [];
 const pos:{p:P2;n:P2}[]=[];
 ring.forEach((a,k)=>{const b=ring[(k+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1)return;const u:P2=[(b[0]-a[0])/len,(b[1]-a[1])/len],n:P2=[-u[1],u[0]],cnt=Math.ceil(len/o.spacing-1e-9)+1;
  for(let j=0;j<cnt-1;j++)pos.push({p:[a[0]+u[0]*len*j/(cnt-1),a[1]+u[1]*len*j/(cnt-1)],n});});
 if(!pos.length||pos.length>2000)return [];
 const limit=stackTop(m,ring,o.z0)-o.cover-o.diameter/2,z1=Math.min(o.z1,limit),clipped=z1<o.z1-.5;if(z1-o.z0<=2*o.diameter)return [];
 const leg=o.leg>0?o.leg:0,tpl=({p,n}:{p:P2;n:P2}):Vec3[]=>[...(leg?[[p[0]+n[0]*leg,p[1]+n[1]*leg,o.z0] as Vec3]:[]),[p[0],p[1],o.z0],[p[0],p[1],z1],...(leg?[[p[0]+n[0]*leg,p[1]+n[1]*leg,z1] as Vec3]:[])];
 const first=pos[0],points=tpl(first),pivot=points.at(-1)!,ang=(n:P2)=>Math.atan2(n[1],n[0]);
 const turns=pos.map(q=>{let t=(ang(q.n)-ang(first.n))*180/Math.PI;if(t>180)t-=360;if(t<-180)t+=360;return Math.round(t*1000)/1000;});
 // barPaths turns the template about its last point, then translates it: offset = last point of the target − pivot
 const offsets=pos.map(q=>{const last=tpl(q).at(-1)!;return [last[0]-pivot[0],last[1]-pivot[1],0] as Vec3;});
 return [{...blankBar(o.mark),id:`${SKETCH_PREFIX}${crypto.randomUUID().slice(0,12)}`,diameter:o.diameter,grade:o.grade,count:pos.length,shape:'polyline',shapeCode:leg?'21':'00',axis:'Z',face:'side',radius:leg?Number(sketchRadius(o.diameter).toFixed(3)):0,
  points:points.map(p=>p.map(v=>Number(v.toFixed(3))) as Vec3),offsets:offsets.map(p=>p.map(v=>Number(v.toFixed(3))) as Vec3),offsetTurns:turns,...(leg?{}:{lengthMethod:'bs8666' as const}),note:`${o.note} · แนวตั้งรอบผิว ${pos.length} ตำแหน่ง @ ≤ ${o.spacing}${clipped?` · จำกัดถึง Z ${Math.round(z1)}`:''}`.slice(0,500)}];
}
/** Highest level up to which every point of `ring` stays inside the concrete, starting in the slab at z0
 * (the stack of loops / vertical face bars must not run into a recess or past a step). */
export function stackTop(m:Member,ring:P2[],z0:number){
 const sm=m.shapeModel;if(!sm)return z0;const slabs=shapeGeometry(sm).slabs;let top=z0;
 for(const s of slabs){if(s.z1<=z0+1e-6)continue;if(!ring.every(p=>inMulti(p,s.region,1)))break;top=s.z1;}
 return top;
}
const area=(r:P2[])=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
/** Next free Mark with a prefix (C01, C02 …). */
export function nextMark(m:Member,prefix='C'){const used=new Set(m.bars.map(b=>b.mark));for(let i=1;i<1000;i++){const k=`${prefix}${String(i).padStart(2,'0')}`;if(!used.has(k))return k;}return `${prefix}${Date.now()%1000}`;}
