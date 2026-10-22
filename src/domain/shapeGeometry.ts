import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import type {Vec3} from './model';
import type {Surface} from './solids';
import {surface} from './prismGeometry';
import type {ShapeModel,ShapePart} from './shapeModelSchema';

// Geometry of a shape model, cut into horizontal slabs at every part bottom / top level. Inside one
// slab the concrete plan region is union(solid parts) − union(void parts) (polygon boolean), so mixed
// boxes, polygons, cylinders, ring walls and shafts combine exactly. Circles are polygons whose radius is
// scaled so each polygon has the circle's exact area (chord sagitta ≤ ~2 mm).
type P2=[number,number];
const EPS=1e-6;
const ringArea=(r:P2[])=>r.reduce((n,p,i)=>{const q=r[(i+1)%r.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2;
const open=(r:P2[])=>r.length>1&&r[0][0]===r.at(-1)![0]&&r[0][1]===r.at(-1)![1]?r.slice(0,-1):r;
const ccw=(r:P2[])=>ringArea(r)<0?[...r].reverse():r,cw=(r:P2[])=>ringArea(r)>0?[...r].reverse():r;
export const multiArea=(mp:MultiPolygon)=>mp.reduce((n,poly)=>n+poly.reduce((a,ring,k)=>a+(k?-1:1)*Math.abs(ringArea(open(ring as P2[]))),0),0);

/** Segments for a circle of radius r so the chord sagitta stays ≤ 2 mm (24…256). */
export function circleSegments(r:number){return Math.min(256,Math.max(24,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-Math.min(1,2/Math.max(r,1)))))));}
/** Equal-area polygon of a circle. */
export function circlePolygon(cx:number,cy:number,r:number):P2[]{
 const n=circleSegments(r),k=r*Math.sqrt(2*Math.PI/(n*Math.sin(2*Math.PI/n)));
 return Array.from({length:n},(_,i)=>[cx+k*Math.cos(2*Math.PI*i/n),cy+k*Math.sin(2*Math.PI*i/n)] as P2);
}
const rect=(x:number,y:number,w:number,d:number):P2[]=>[[x,y],[x+w,y],[x+w,y+d],[x,y+d]];
/** Plan polygon of a part (outer ring CCW, holes CW). */
export function partPolygon(p:ShapePart):P2[][]{
 switch(p.shape){
  case 'box':return [rect(p.x,p.y,p.w,p.d)];
  case 'polygon':return [ccw(p.points as P2[])];
  case 'circle':return [circlePolygon(p.cx,p.cy,p.diameter/2),...(p.inner>0?[cw(circlePolygon(p.cx,p.cy,p.inner/2))]:[])];
  case 'shaft':return [rect(p.x,p.y,p.w,p.d),cw(rect(p.x+p.wall,p.y+p.wall,p.w-2*p.wall,p.d-2*p.wall))];
 }
}
/** Exact plan extents of a part ([minX,minY,maxX,maxY]); circles use the true radius, not the polygon. */
export function partExtent(p:ShapePart):[number,number,number,number]{
 if(p.shape==='circle'){const r=p.diameter/2;return [p.cx-r,p.cy-r,p.cx+r,p.cy+r];}
 const o=partPolygon(p)[0],xs=o.map(v=>v[0]),ys=o.map(v=>v[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
const union=(polys:Polygon[]):MultiPolygon=>polys.length?polygonClipping.union(polys[0],...polys.slice(1)):[];
const diff=(a:MultiPolygon,b:MultiPolygon):MultiPolygon=>!a.length?[]:!b.length?a:polygonClipping.difference(a,b);
const top=(p:ShapePart)=>p.z0+p.height;

export type ShapeSlab={z0:number;z1:number;region:MultiPolygon;solids:ShapePart[];voids:ShapePart[]};
export type ShapeGeometry={slabs:ShapeSlab[];levels:number[];min:Vec3;max:Vec3;volume:number;formwork:number;surfaces:Surface[];errors:string[];stages:{stage:number;volume:number}[]};

function buildSlabs(sm:ShapeModel):{slabs:ShapeSlab[];levels:number[]}{
 const levels=[...new Set(sm.parts.flatMap(p=>[p.z0,top(p)]))].sort((a,b)=>a-b),slabs:ShapeSlab[]=[];
 for(let i=0;i<levels.length-1;i++){
  const z0=levels[i],z1=levels[i+1],mid=(z0+z1)/2,active=sm.parts.filter(p=>p.z0<mid&&top(p)>mid);
  const solids=active.filter(p=>p.role==='solid'),voids=active.filter(p=>p.role==='void');
  slabs.push({z0,z1,solids,voids,region:diff(union(solids.map(p=>partPolygon(p) as Polygon)),union(voids.map(p=>partPolygon(p) as Polygon)))});
 }
 return {slabs,levels};
}
const segDist=(p:P2,a:P2,b:P2)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const onBoundary=(p:P2,rings:P2[][],tol:number)=>rings.some(r=>r.some((a,i)=>segDist(p,a,r[(i+1)%r.length])<=tol));
function inRing(p:P2,r:P2[]){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function inMulti(p:P2,mp:MultiPolygon,tol=1e-3){
 for(const poly of mp){const rings=poly.map(r=>open(r as P2[]));if(onBoundary(p,rings,tol))return true;if(inRing(p,rings[0])&&!rings.slice(1).some(h=>inRing(p,h)))return true;}
 return false;
}
const inPart=(p:P2,part:ShapePart)=>{const [o,...h]=partPolygon(part);return inRing(p,o)&&!h.some(r=>inRing(p,r));};

function compute(sm:ShapeModel):ShapeGeometry{
 const errors:string[]=[],{slabs,levels}=buildSlabs(sm),solidParts=sm.parts.filter(p=>p.role==='solid');
 const ext=solidParts.map(partExtent),zs=solidParts.flatMap(p=>[p.z0,top(p)]);
 const min:Vec3=[Math.min(...ext.map(e=>e[0])),Math.min(...ext.map(e=>e[1])),Math.min(...zs)],max:Vec3=[Math.max(...ext.map(e=>e[2])),Math.max(...ext.map(e=>e[3])),Math.max(...zs)];
 let volume=0,formwork=0;const surfaces:Surface[]=[];
 for(const s of slabs)volume+=multiArea(s.region)*(s.z1-s.z0);
 // vertical faces: one quad per region edge, merged upward while the same edge continues with the same formwork
 type Open={a:P2;b:P2;z0:number;z1:number;formed:boolean};let running=new Map<string,Open>();
 const flush=(o:Open)=>{const v:Vec3[]=[[o.a[0],o.a[1],o.z0],[o.b[0],o.b[1],o.z0],[o.b[0],o.b[1],o.z1],[o.a[0],o.a[1],o.z1]],dx=o.b[0]-o.a[0],dy=o.b[1]-o.a[1],l=Math.hypot(dx,dy);surfaces.push(surface(v,[dy/l,-dx/l,0],o.formed));if(o.formed)formwork+=l*(o.z1-o.z0);};
 for(const s of slabs){
  const next=new Map<string,Open>();
  const tol=3,attribute=(m:P2)=>{const hits=[...s.voids,...s.solids].filter(p=>onBoundary(m,partPolygon(p),tol));return hits.length?hits.some(p=>p.formSides):true;};
  for(const poly of s.region)for(const raw of poly){const r=open(raw as P2[]);r.forEach((a,i)=>{const b=r[(i+1)%r.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<EPS)return;
   const key=`${a[0].toFixed(3)},${a[1].toFixed(3)},${b[0].toFixed(3)},${b[1].toFixed(3)}`,formed=attribute([(a[0]+b[0])/2,(a[1]+b[1])/2]),prev=running.get(key);
   if(prev&&prev.formed===formed&&Math.abs(prev.z1-s.z0)<EPS){prev.z1=s.z1;next.set(key,prev);running.delete(key);}else next.set(key,{a,b,z0:s.z0,z1:s.z1,formed});});}
  for(const o of running.values())flush(o);running=next;
 }
 for(const o of running.values())flush(o);
 // horizontal faces at every level: top = below − above (never formed); bottom = above − below (soffit, formed above the base)
 levels.forEach((L,i)=>{
  const below=i>0?slabs[i-1].region:[],above=i<slabs.length?slabs[i].region:[];
  for(const [region,up] of [[diff(below,above),true],[diff(above,below),false]] as [MultiPolygon,boolean][])for(const poly of region){
   const rings=poly.map(r=>open(r as P2[])),points=rings.flat(),tris=ShapeUtils.triangulateShape(rings[0].map(v=>new Vector2(...v)),rings.slice(1).map(r=>r.map(v=>new Vector2(...v))));
   for(const t of tris){const tri=t.map(k=>points[k]),c:P2=[(tri[0][0]+tri[1][0]+tri[2][0])/3,(tri[0][1]+tri[1][1]+tri[2][1])/3];
    const formed=!up&&L>min[2]+EPS&&(sm.parts.some(p=>p.role==='solid'&&Math.abs(p.z0-L)<EPS&&p.formBottom&&inPart(c,p))||sm.parts.some(p=>p.role==='void'&&Math.abs(top(p)-L)<EPS&&p.formBottom&&inPart(c,p)));
    surfaces.push(surface(tri.map(v=>[v[0],v[1],L] as Vec3),[0,0,up?1:-1],formed));if(formed)formwork+=Math.abs(ringArea(tri));}
  }
 });
 if(volume<=0)errors.push('ไม่มีปริมาตรคอนกรีตหลังหักช่องเปิด');
 // pour stages: cumulative concrete of stages ≤ s, minus the previous stage
 const stages=[...new Set(solidParts.map(p=>p.stage))].sort((a,b)=>a-b);let before=0;
 const stageVolumes=stages.map(st=>{let v=0;for(const s of slabs){const reg=diff(union(s.solids.filter(p=>p.stage<=st).map(p=>partPolygon(p) as Polygon)),union(s.voids.map(p=>partPolygon(p) as Polygon)));v+=multiArea(reg)*(s.z1-s.z0);}const out={stage:st,volume:(v-before)/1e9};before=v;return out;});
 return {slabs,levels,min,max,volume:volume/1e9,formwork:formwork/1e6,surfaces,errors,stages:stageVolumes};
}
const cache=new Map<string,ShapeGeometry>();
/** Cached geometry (quantities, surfaces, slabs) of a shape model. */
export function shapeGeometry(sm:ShapeModel):ShapeGeometry{
 const key=JSON.stringify(sm.parts);let g=cache.get(key);
 if(!g){try{g=compute(sm);}catch(e){g={slabs:[],levels:[],min:[0,0,0],max:[0,0,0],volume:0,formwork:0,surfaces:[],errors:[`รูปทรงคำนวณไม่ได้: ${e instanceof Error?e.message:String(e)}`],stages:[]};}cache.set(key,g);if(cache.size>24)cache.delete(cache.keys().next().value!);}
 return g;
}
export function shapeContains(sm:ShapeModel,p:Vec3,tol=1e-3){
 const g=shapeGeometry(sm);return g.slabs.some(s=>p[2]>=s.z0-tol&&p[2]<=s.z1+tol&&inMulti([p[0],p[1]],s.region,tol));
}
/** Every point of the path lies in concrete: vertices, slab-level crossings and ≤ 10 mm samples along each segment. */
export function shapePathInside(sm:ShapeModel,path:Vec3[]){
 if(path.some(p=>!shapeContains(sm,p)))return false;
 const levels=shapeGeometry(sm).levels;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],l=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),ts=new Set<number>();
  const n=Math.min(4000,Math.ceil(l/10));for(let k=1;k<n;k++)ts.add(k/n);
  if(Math.abs(b[2]-a[2])>EPS)for(const L of levels){const t=(L-a[2])/(b[2]-a[2]);if(t>0&&t<1){ts.add(Math.max(0,t-1e-6));ts.add(Math.min(1,t+1e-6));}}
  for(const t of ts)if(!shapeContains(sm,[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]))return false;}
 return true;
}
export const shapeBounds=(sm:ShapeModel):Vec3=>shapeGeometry(sm).max;
/** Concrete volume (m³) below level z (buried concrete for backfill). */
export function shapeVolumeBelow(sm:ShapeModel,z:number){return shapeGeometry(sm).slabs.reduce((n,s)=>n+multiArea(s.region)*Math.max(0,Math.min(s.z1,z)-s.z0),0)/1e9;}
/** Plan footprint (union of every slab) — used for excavation and the plan outline. */
export function shapeFootprint(sm:ShapeModel):MultiPolygon{const regs=shapeGeometry(sm).slabs.map(s=>s.region).filter(r=>r.length);return regs.length?polygonClipping.union(regs[0],...regs.slice(1)):[];}
/** Shift so the lowest concrete corner is at 0,0,0 (parts and piles move together). */
export function normaliseShape(sm:ShapeModel):{model:ShapeModel;shift:Vec3}{
 const g=compute({...sm}),[dx,dy,dz]=g.min.map(v=>-v) as Vec3;
 if(!dx&&!dy&&!dz)return {model:sm,shift:[0,0,0]};
 const mv=(p:ShapePart):ShapePart=>{const z0=p.z0+dz;switch(p.shape){case 'box':case 'shaft':return {...p,z0,x:p.x+dx,y:p.y+dy};case 'polygon':return {...p,z0,points:p.points.map(([x,y])=>[x+dx,y+dy] as P2)};case 'circle':return {...p,z0,cx:p.cx+dx,cy:p.cy+dy};}};
 return {model:{...sm,parts:sm.parts.map(mv),...(sm.piles?{piles:{...sm.piles,positions:sm.piles.positions.map(([x,y])=>[x+dx,y+dy] as P2)}}:{})},shift:[dx,dy,dz]};
}
/** Intervals along plan axis `along` where the line (other plan axis = pos) is inside the region. */
export function multiIntervals(mp:MultiPolygon,along:0|1,pos:number):[number,number][]{
 const other=1-along,xs:number[]=[];
 for(const poly of mp)for(const raw of poly){const r=open(raw as P2[]);r.forEach((a,i)=>{const b=r[(i+1)%r.length];if((a[other]>pos)!==(b[other]>pos))xs.push(a[along]+(b[along]-a[along])*(pos-a[other])/(b[other]-a[other]));});}
 xs.sort((p,q)=>p-q);const out:[number,number][]=[];for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>EPS)out.push([xs[i],xs[i+1]]);return out;
}
/** Section through the model: rectangles (u0,u1 along `along`, z0,z1) where the plane `other axis = cut` meets concrete; equal
 * intervals of consecutive slabs are merged. */
export function shapeSectionRects(sm:ShapeModel,along:0|1,cut:number){
 const out:{u0:number;u1:number;z0:number;z1:number}[]=[];let prev:typeof out=[];
 for(const s of shapeGeometry(sm).slabs){const cur:typeof out=[];for(const [u0,u1] of multiIntervals(s.region,along,cut)){const p=prev.find(r=>Math.abs(r.u0-u0)<.01&&Math.abs(r.u1-u1)<.01&&Math.abs(r.z1-s.z0)<EPS);if(p){p.z1=s.z1;cur.push(p);}else{const r={u0,u1,z0:s.z0,z1:s.z1};out.push(r);cur.push(r);}}prev=cur;}
 return out;
}
/** Elevation silhouette per slab along plan axis `along` (outer extents of each region polygon). */
export function shapeElevationRects(sm:ShapeModel,along:0|1){
 const out:{u0:number;u1:number;z0:number;z1:number}[]=[];
 for(const s of shapeGeometry(sm).slabs)for(const poly of s.region){const vs=(poly[0] as P2[]).map(p=>p[along]);out.push({u0:Math.min(...vs),u1:Math.max(...vs),z0:s.z0,z1:s.z1});}
 return out;
}
/** Plan outline rings: footprint outer rings and holes. */
export function shapePlanRings(sm:ShapeModel){const fp=shapeFootprint(sm);return {outer:fp.map(p=>open(p[0] as P2[])),holes:fp.flatMap(p=>p.slice(1).map(r=>open(r as P2[])))};}
export function shapePileQuantities(sm:ShapeModel){
 const p=sm.piles;if(!p)return {count:0,size:0,lengthEach:0,totalLength:0,cutCount:0,cutLengthEach:0,totalCut:0,headVolume:0};
 const count=p.positions.length,area=p.type==='square'?p.size*p.size:Math.PI*p.size*p.size/4;
 return {count,size:p.size,lengthEach:p.length,totalLength:count*p.length,cutCount:p.cutoff>0?count:0,cutLengthEach:p.cutoff/1000,totalCut:p.cutoff>0?count*p.cutoff/1000:0,headVolume:count*area*p.embed/1e9};
}
