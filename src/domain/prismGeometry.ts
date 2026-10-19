import {ShapeUtils,Vector2,Vector3,Triangle,Ray} from 'three';
import type {Member,Vec3} from './model';
import type {Surface} from './solids';
import {prismGeometrySchema,signedArea,inPolygon,type Point2,type PrismGeometry} from './prismSchema';
import {circularContains,circularPathInside,circularQuantities,circularSection} from './circularPrism';
import {clipProfile,polygonViewFaces,unionViewPolygons,sectionViewPolygons} from './polygonViews';
export {PRISM_POLICY,INCLINED_PRISM_POLICY,TAPERED_PRISM_POLICY,prismGeometrySchema,type PrismGeometry} from './prismSchema';
const EPS=1e-6;
export const prismAxis=(p:PrismGeometry)=>({X:0,Y:1,Z:2})[p.axis];
export const profileAxes=(p:PrismGeometry)=>[0,1,2].filter(a=>a!==prismAxis(p)) as [number,number];
export const prismOffset=(p:PrismGeometry):Point2=>p.version===2||p.version===3?p.endOffset:[0,0];
export const prismAnchor=(p:PrismGeometry):Point2=>prismOffset(p).map(v=>Math.max(0,-v)) as Point2;
export const prismRunLength=(p:PrismGeometry)=>Math.hypot(p.depth,...prismOffset(p));
export const prismScaleAt=(p:PrismGeometry,t:number):Point2=>p.version===3?p.endScale.map(s=>1+(s-1)*t) as Point2:[1,1];
export function prismPoint(p:PrismGeometry,v:Point2,along:number):Vec3{const axes=profileAxes(p),r:Vec3=[0,0,0];r[prismAxis(p)]=along;r[axes[0]]=v[0];r[axes[1]]=v[1];if(p.version===2||p.version===3){const anchor=prismAnchor(p),t=(along-p.start)/p.depth,scale=prismScaleAt(p,t);axes.forEach((a,i)=>r[a]=v[i]*scale[i]+anchor[i]+p.endOffset[i]*t);}return r;}
export function prismBounds(p:PrismGeometry):Vec3{const r:Vec3=[0,0,0],axes=profileAxes(p);r[prismAxis(p)]=p.start+p.depth;axes.forEach((a,i)=>{const max=Math.max(...p.profile.vertices.map(v=>v[i]));r[a]=p.version===3?Math.max(max,max*p.endScale[i]+p.endOffset[i])+prismAnchor(p)[i]:max+(p.version===2?Math.abs(p.endOffset[i]):0);});return r;}
function straightInput(p:Exclude<PrismGeometry,{version:3}>):Extract<PrismGeometry,{version:1}>{if(p.version===1)return p;if(p.version===4){const {circle,...base}=p;return {...base,version:1};}const {endOffset,...base}=p;return {...base,version:1};}
function inversePoint(p:PrismGeometry,point:Vec3):Vec3{if(p.version===1||p.version===4)return point;const result=[...point] as Vec3,t=(point[prismAxis(p)]-p.start)/p.depth,anchor=prismAnchor(p),scale=prismScaleAt(p,t);profileAxes(p).forEach((a,i)=>result[a]=(result[a]-anchor[i]-p.endOffset[i]*t)/scale[i]);return result;}
export function prismContains(p:PrismGeometry,point:Vec3){if(p.version===4)return circularContains(p,point);const axis=prismAxis(p),axes=profileAxes(p),local=inversePoint(p,point),v:Point2=[local[axes[0]],local[axes[1]]];return point[axis]>=p.start-EPS&&point[axis]<=p.start+p.depth+EPS&&inPolygon(v,p.profile.vertices)&&!p.holes.some(h=>inPolygon(v,h.vertices,false));}
export function prismPathInside(p:PrismGeometry,path:Vec3[]){
 if(p.version===4)return circularPathInside(p,path);
 if(p.version===3)return taperedPathInside(p,path);
 if(p.version===2)return prismPathInside(straightInput(p),path.map(v=>inversePoint(p,v)));
 if(path.some(v=>!prismContains(p,v)))return false;
 const axes=profileAxes(p),axis=prismAxis(p);
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],d=b.map((v,k)=>v-a[k]),times=[0,1];
  if(Math.abs(d[axis])>EPS)for(const e of [p.start,p.start+p.depth]){const t=(e-a[axis])/d[axis];if(t>0&&t<1)times.push(t);}
  for(const loop of [p.profile,...p.holes])for(let j=0;j<loop.vertices.length;j++){
   const c=loop.vertices[j],e=loop.vertices[(j+1)%loop.vertices.length],u=[e[0]-c[0],e[1]-c[1]],v=[c[0]-a[axes[0]],c[1]-a[axes[1]]],det=d[axes[0]]*u[1]-d[axes[1]]*u[0];
   if(Math.abs(det)>EPS){const t=(v[0]*u[1]-v[1]*u[0])/det,s=(v[0]*d[axes[1]]-v[1]*d[axes[0]])/det;if(t>0&&t<1&&s>=-EPS&&s<=1+EPS)times.push(t);}
  }
  times.sort((a,b)=>a-b);for(let j=1;j<times.length;j++){const t=(times[j-1]+times[j])/2;if(!prismContains(p,a.map((v,k)=>v+d[k]*t) as Vec3))return false;}
 }return true;
}
function surface(vertices:Vec3[],normal:Vec3,formed:boolean):Surface{
 const axis=normal.findIndex(v=>Math.abs(v)>1-EPS),origin=[0,1,2].map(a=>Math.min(...vertices.map(v=>v[a]))) as Vec3,size=[0,1,2].map(a=>Math.max(...vertices.map(v=>v[a]))-origin[a]) as Vec3;
 const actual=new Triangle(...vertices.slice(0,3).map(v=>new Vector3(...v)) as [Vector3,Vector3,Vector3]).getNormal(new Vector3());
 return {origin,size,axis,positive:axis>=0&&normal[axis]>0,formed,vertices:actual.dot(new Vector3(...normal))<0?[...vertices].reverse():vertices,normal};
}
export function prismQuantities(input:PrismGeometry):{volume:number;formwork:number;surfaces:Surface[];errors:string[]}{
 const parsed=prismGeometrySchema.safeParse(input);if(!parsed.success)return {volume:0,formwork:0,surfaces:[] as Surface[],errors:parsed.error.issues.map(i=>i.message)};
 const p=parsed.data;if(p.version===4){const polygon=prismQuantities(straightInput(p)),exact=circularQuantities(p);return {...polygon,volume:exact.volume,formwork:exact.formwork};}if(p.version===3)return taperedQuantities(p);
 const axis=prismAxis(p),axes=profileAxes(p),area=Math.abs(signedArea(p.profile.vertices))-p.holes.reduce((s,h)=>s+Math.abs(signedArea(h.vertices)),0),surfaces:Surface[]=[],points=[p.profile,...p.holes].flatMap(l=>l.vertices);
 const triangles=ShapeUtils.triangulateShape(p.profile.vertices.map(v=>new Vector2(...v)),p.holes.map(h=>h.vertices.map(v=>new Vector2(...v))));
 let triangulatedArea=0;
 for(const indexes of triangles){const tri=indexes.map(i=>points[i]);triangulatedArea+=Math.abs(signedArea(tri));for(const end of [0,1]){const normal:Vec3=[0,0,0];normal[axis]=end?1:-1;surfaces.push(surface(tri.map(v=>prismPoint(p,v,p.start+end*p.depth)),normal,p.endFaces[end]));}}
 let formwork=area*(Number(p.endFaces[0])+Number(p.endFaces[1]));
 for(const [k,loop] of [p.profile,...p.holes].entries()){
  const sign=(signedArea(loop.vertices)>0?1:-1)*(k? -1:1);
  loop.vertices.forEach((a,i)=>{const b=loop.vertices[(i+1)%loop.vertices.length],du=b[0]-a[0],dv=b[1]-a[1],length=Math.hypot(du,dv),normal:Vec3=[0,0,0];normal[axes[0]]=sign*dv/length;normal[axes[1]]=-sign*du/length;
   let sideArea=length*p.depth;
   if(p.version===2){normal[axis]=-(normal[axes[0]]*p.endOffset[0]+normal[axes[1]]*p.endOffset[1])/p.depth;const norm=Math.hypot(...normal);normal.forEach((v,a)=>normal[a]=v/norm);sideArea=Math.hypot(du*p.depth,dv*p.depth,du*p.endOffset[1]-dv*p.endOffset[0]);}
   surfaces.push(surface([prismPoint(p,a,p.start),prismPoint(p,b,p.start),prismPoint(p,b,p.start+p.depth),prismPoint(p,a,p.start+p.depth)],normal,loop.formed[i]));if(loop.formed[i])formwork+=sideArea;
  });
 }
 const errors=area<=0||Math.abs(triangulatedArea-area)>Math.max(.001,area*1e-10)?['พื้นที่จากการแบ่งหน้าตัดไม่ตรงเรขาคณิต ตรวจช่องเปิด']:[];
 return {volume:area*p.depth/1e9,formwork:formwork/1e6,surfaces,errors};
}
export function surfaceVertices(s:Surface):Vec3[]{if(s.vertices)return s.vertices;const axes=[0,1,2].filter(a=>a!==s.axis);return [[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{const p=[...s.origin] as Vec3;p[axes[0]]+=u*s.size[axes[0]];p[axes[1]]+=v*s.size[axes[1]];return p;});}
export function surfaceTriangles(s:Surface):Vec3[][]{const v=surfaceVertices(s);return Array.from({length:v.length-2},(_,i)=>[v[0],v[i+1],v[i+2]]);}
function segmentDistance(a:Vector3,b:Vector3,c:Vector3,d:Vector3){
 const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w),det=aa*cc-bb*bb;
 let s=det>1e-12?Math.max(0,Math.min(1,(bb*ee-cc*dd)/det)):0,t=cc? (bb*s+ee)/cc:0;
 if(t<0){t=0;s=aa?Math.max(0,Math.min(1,-dd/aa)):0;}else if(t>1){t=1;s=aa?Math.max(0,Math.min(1,(bb-dd)/aa)):0;}
 return a.clone().addScaledVector(u,s).distanceTo(c.clone().addScaledVector(v,t));
}
export function polygonFaceDistance(a:Vec3,b:Vec3,s:Surface){
 const from=new Vector3(...a),to=new Vector3(...b),delta=to.clone().sub(from),length=delta.length(),ray=new Ray(from,delta.clone().normalize());let distance=Infinity;
 for(const face of surfaceTriangles(s)){
  const v=face.map(p=>new Vector3(...p)) as [Vector3,Vector3,Vector3],triangle=new Triangle(...v),hit=length?ray.intersectTriangle(...v,false,new Vector3()):null;
  if(hit&&from.distanceTo(hit)<=length+EPS)return 0;
  distance=Math.min(distance,from.distanceTo(triangle.closestPointToPoint(from,new Vector3())),to.distanceTo(triangle.closestPointToPoint(to,new Vector3())));
  for(let i=0;i<3;i++)distance=Math.min(distance,segmentDistance(from,to,v[i],v[(i+1)%3]));
 }return distance;
}
export function prismSection(p:PrismGeometry,axis:number,position:number):Vec3[][]{
 if(p.version===4)return circularSection(p,axis,position);
 if(p.version===3)return taperedSection(p,axis,position);
 if(p.version===2)return inclinedSection(p,axis,position);
 if(axis===prismAxis(p)){if(position<p.start-EPS||position>p.start+p.depth+EPS)return [];return prismQuantities(p).surfaces.filter(s=>s.axis===axis&&s.positive).map(s=>s.vertices!.map(v=>{const r=[...v] as Vec3;r[axis]=position;return r;}));}
 const axes=profileAxes(p),cut=axes.indexOf(axis),other=axes[1-cut],events:number[]=[];
 for(const loop of [p.profile,...p.holes])loop.vertices.forEach((a,i)=>{const b=loop.vertices[(i+1)%loop.vertices.length];if(Math.abs(a[cut]-position)<=EPS)events.push(a[1-cut]);if((a[cut]<position&&b[cut]>position)||(a[cut]>position&&b[cut]<position))events.push(a[1-cut]+(b[1-cut]-a[1-cut])*(position-a[cut])/(b[cut]-a[cut]));});
 const sorted=[...new Set(events)].sort((a,b)=>a-b),faces:Vec3[][]=[],at=(v:number,t:number)=>{const r:Vec3=[0,0,0];r[axis]=position;r[other]=v;r[prismAxis(p)]=t;return r;};
 for(let i=1;i<sorted.length;i++)if(sorted[i]-sorted[i-1]>EPS&&prismContains(p,at((sorted[i-1]+sorted[i])/2,p.start+p.depth/2)))faces.push([at(sorted[i-1],p.start),at(sorted[i],p.start),at(sorted[i],p.start+p.depth),at(sorted[i-1],p.start+p.depth)]);
 return faces;
}
function inclinedSection(p:Extract<PrismGeometry,{version:2}>,axis:number,position:number):Vec3[][]{
 const run=prismAxis(p),axes=profileAxes(p),offset=p.endOffset,anchor=prismAnchor(p);
 if(axis===run){
  if(position<p.start-EPS||position>p.start+p.depth+EPS)return [];
  const loops=[p.profile,...p.holes],points=loops.flatMap(l=>l.vertices),triangles=ShapeUtils.triangulateShape(p.profile.vertices.map(v=>new Vector2(...v)),p.holes.map(h=>h.vertices.map(v=>new Vector2(...v))));
  return triangles.map(tri=>tri.map(i=>prismPoint(p,points[i],position)));
 }
 const cut=axes.indexOf(axis),other=1-cut;
 if(Math.abs(offset[cut])>1e-8){
  const from=position-anchor[cut],to=from-offset[cut],clipped=clipProfile(p.profile.vertices,p.holes.map(h=>h.vertices),cut,Math.min(from,to),Math.max(from,to));
  return polygonViewFaces(clipped,v=>{const t=(position-anchor[cut]-v[cut])/offset[cut],point=prismPoint(p,v,p.start+t*p.depth);point[axis]=position;return point;});
 }
 const localPosition=position-anchor[cut],straight=straightInput(p),faces=prismSection(straight,axis,localPosition);
 return faces.map(face=>face.map(v=>{const point=[...v] as Vec3,t=(point[run]-p.start)/p.depth;point[axis]=position;point[axes[other]]+=anchor[other]+offset[other]*t;return point;}));
}
export function inclinedProjectedFaces(p:Exclude<PrismGeometry,{version:1}>,axes:[number,number]):Vec3[][]{
 const normal=[0,1,2].find(a=>!axes.includes(a))!,q=prismQuantities(p),polygons=unionViewPolygons(q.surfaces.map(s=>s.vertices!.map(v=>[v[axes[0]],v[axes[1]]] as Point2)));
 return polygonViewFaces(polygons,v=>{const point:Vec3=[0,0,0];point[axes[0]]=v[0];point[axes[1]]=v[1];point[normal]=prismBounds(p)[normal];return point;});
}
type Tapered=Extract<PrismGeometry,{version:3}>;
const triangleArea=(v:Vec3[])=>new Triangle(...v.map(p=>new Vector3(...p)) as [Vector3,Vector3,Vector3]).getArea();
export function prismSideArea(p:PrismGeometry,a:Point2,b:Point2){
 if(p.version===1)return Math.hypot(b[0]-a[0],b[1]-a[1])*p.depth;
 if(p.version===2){const du=b[0]-a[0],dv=b[1]-a[1];return Math.hypot(du*p.depth,dv*p.depth,du*p.endOffset[1]-dv*p.endOffset[0]);}
 const v=[prismPoint(p,a,p.start),prismPoint(p,b,p.start),prismPoint(p,b,p.start+p.depth),prismPoint(p,a,p.start+p.depth)];return triangleArea([v[0],v[1],v[2]])+triangleArea([v[0],v[2],v[3]]);
}
function taperedQuantities(p:Tapered){
 const axis=prismAxis(p),axes=profileAxes(p),loops=[p.profile,...p.holes],points=loops.flatMap(l=>l.vertices),area=Math.abs(signedArea(p.profile.vertices))-p.holes.reduce((s,h)=>s+Math.abs(signedArea(h.vertices)),0),surfaces:Surface[]=[],triangles=ShapeUtils.triangulateShape(p.profile.vertices.map(v=>new Vector2(...v)),p.holes.map(h=>h.vertices.map(v=>new Vector2(...v))));
 let capArea=0,formwork=area*(Number(p.endFaces[0])+p.endScale[0]*p.endScale[1]*Number(p.endFaces[1]));
 for(const tri of triangles){const vertices=tri.map(i=>points[i]);capArea+=Math.abs(signedArea(vertices));for(const end of [0,1]){const normal:Vec3=[0,0,0];normal[axis]=end?1:-1;surfaces.push(surface(vertices.map(v=>prismPoint(p,v,p.start+end*p.depth)),normal,p.endFaces[end]));}}
 loops.forEach((loop,k)=>{const sign=(signedArea(loop.vertices)>0?1:-1)*(k?-1:1);loop.vertices.forEach((a,i)=>{
  const b=loop.vertices[(i+1)%loop.vertices.length],v=[prismPoint(p,a,p.start),prismPoint(p,b,p.start),prismPoint(p,b,p.start+p.depth),prismPoint(p,a,p.start+p.depth)],n=new Triangle(...v.slice(0,3).map(v=>new Vector3(...v)) as [Vector3,Vector3,Vector3]).getNormal(new Vector3()),expected:Vec3=[0,0,0];expected[axes[0]]=sign*(b[1]-a[1]);expected[axes[1]]=-sign*(b[0]-a[0]);if(n.dot(new Vector3(...expected))<0)n.negate();surfaces.push(surface(v,n.toArray() as Vec3,loop.formed[i]));if(loop.formed[i])formwork+=prismSideArea(p,a,b);
 });});
 // The section area is quadratic in t; Simpson's prismoidal integral is exact.
 const mid=prismScaleAt(p,.5),volume=area*p.depth*(1+4*mid[0]*mid[1]+p.endScale[0]*p.endScale[1])/6/1e9;
 const errors=area<=0||Math.abs(capArea-area)>Math.max(.001,area*1e-10)?['พื้นที่จากการแบ่งหน้าตัดไม่ตรงเรขาคณิต ตรวจช่องเปิด']:[];
 return {volume,formwork:formwork/1e6,surfaces,errors};
}
function taperedPathInside(p:Tapered,path:Vec3[]){
 if(path.some(v=>!prismContains(p,v)))return false;
 const triangles=prismQuantities(p).surfaces.flatMap(surfaceTriangles);
 for(let i=1;i<path.length;i++){
  const a=new Vector3(...path[i-1]),b=new Vector3(...path[i]),delta=b.clone().sub(a),length=delta.length();if(length<EPS)continue;
  const ray=new Ray(a,delta.clone().normalize()),times=[0,1];
  for(const face of triangles){const hit=ray.intersectTriangle(...face.map(v=>new Vector3(...v)) as [Vector3,Vector3,Vector3],false,new Vector3());if(hit){const t=a.distanceTo(hit)/length;if(t>0&&t<1)times.push(t);}}
  times.sort((a,b)=>a-b);for(let j=1;j<times.length;j++){if((times[j]-times[j-1])*length<EPS)continue;const t=(times[j-1]+times[j])/2;if(!prismContains(p,a.clone().addScaledVector(delta,t).toArray() as Vec3))return false;}
 }return true;
}
function taperedSection(p:Tapered,axis:number,position:number):Vec3[][]{
 const run=prismAxis(p),axes=[0,1,2].filter(a=>a!==axis) as [number,number];
 if(axis===run){if(position<p.start-EPS||position>p.start+p.depth+EPS)return [];const points=[p.profile,...p.holes].flatMap(l=>l.vertices),tri=ShapeUtils.triangulateShape(p.profile.vertices.map(v=>new Vector2(...v)),p.holes.map(h=>h.vertices.map(v=>new Vector2(...v))));return tri.map(face=>face.map(i=>prismPoint(p,points[i],position)));}
 const segments:[Point2,Point2][]=[],coplanar:Point2[][]=[];
 for(const s of prismQuantities(p).surfaces){
  const vertices=s.vertices!,dist=vertices.map(v=>v[axis]-position),at=(v:Vec3):Point2=>[v[axes[0]],v[axes[1]]];
  if(dist.every(d=>Math.abs(d)<EPS)){coplanar.push(vertices.map(at));continue;}
  const hits:Vec3[]=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],da=dist[i],db=dist[(i+1)%vertices.length];if(Math.abs(da)<EPS)hits.push(a);if(da*db<0&&Math.abs(da)>=EPS&&Math.abs(db)>=EPS){const t=da/(da-db);hits.push(a.map((v,k)=>v+(b[k]-v)*t) as Vec3);}}
  const unique=hits.filter((v,i)=>!hits.slice(0,i).some(a=>Math.hypot(...v.map((n,k)=>n-a[k]))<EPS));if(unique.length<2)continue;
  // A planar convex boundary face intersects in a segment; at vertices take
  // its two extreme points, including a coincident triangulation edge.
  let pair=[unique[0],unique[1]],max=0;for(const a of unique)for(const b of unique){const d=Math.hypot(...a.map((n,k)=>n-b[k]));if(d>max){max=d;pair=[a,b];}}
  if(max>EPS){const cutNormal:Vec3=[0,0,0];cutNormal[axis]=1;const direction=new Vector3(...s.normal!).cross(new Vector3(...cutNormal)),delta=new Vector3(...pair[1]).sub(new Vector3(...pair[0]));if(delta.dot(direction)<0)pair.reverse();segments.push([at(pair[0]),at(pair[1])]);}
 }
 return polygonViewFaces(sectionViewPolygons(segments,coplanar),v=>{const point:Vec3=[0,0,0];point[axis]=position;point[axes[0]]=v[0];point[axes[1]]=v[1];return point;});
}
export function applyPrismGeometry(m:Member,input:PrismGeometry):Member{
 if(m.placementContext?.regions.length)throw Error('นำพื้นที่อ้างอิงรอยต่อออกก่อน รุ่นนี้ยังไม่รวมรูปทรงหลายเหลี่ยมกับพื้นที่รอยต่อ');
 const p=prismGeometrySchema.parse(input),[x,y,z]=prismBounds(p);
 return {...m,prismGeometry:p,geometry:undefined,beamAssembly:undefined,pedestal:{x:0,y:0,z:0},x,y,z,status:'Draft',bars:m.bars.map(b=>({...b,targetSolidId:undefined,placementConfirmed:false,bsDimensionsConfirmed:false}))};
}
