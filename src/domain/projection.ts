import {placementViewBounds,contextSolids,contextOpenings} from './placementContext';
import {Member,Vec3} from './model';
import {boundsOf,solidQuantities,solidsOf,contains} from './solids';
import {prismAxis,prismBounds,prismSection,inclinedProjectedFaces} from './prismGeometry';
import {axisIndex,drawingSections,sectionAxes,type DrawingSection} from './drawingViews';
export function projection(m:Member,axes:[number,number],box:{x:number;y:number;w:number;h:number}){
 const {min,max,size:dims}=placementViewBounds(m),usableW=box.w*.71,usableH=box.h*.82,s=Math.max(.00001,Math.min(usableW/dims[axes[0]],usableH/dims[axes[1]])),ox=box.x+box.w*.073+(usableW-dims[axes[0]]*s)/2,oy=box.y+box.h*.07+(usableH-dims[axes[1]]*s)/2;
 return {scale:s,x:ox,y:oy,w:dims[axes[0]]*s,h:dims[axes[1]]*s,point:(p:Vec3)=>[ox+(p[axes[0]]-min[axes[0]])*s,oy+(max[axes[1]]-p[axes[1]])*s]};
}
// Visible boundary faces share the occupied cells used by takeoff and the 3D mesh.
export function projectedFaces(m:Member,axes:[number,number]){
 const normal=[0,1,2].find(a=>!axes.includes(a))!;
 if(m.prismGeometry&&m.prismGeometry.version!==1)return inclinedProjectedFaces(m.prismGeometry,axes);
 if(m.prismGeometry){const p=m.prismGeometry,axis=prismAxis(p);if(normal===axis)return prismSection(p,axis,p.start+p.depth);const bounds=prismBounds(p);return [[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{const point=[...bounds] as Vec3;point[axes[0]]=axes[0]===axis?p.start+u*p.depth:u*bounds[axes[0]];point[axes[1]]=axes[1]===axis?p.start+v*p.depth:v*bounds[axes[1]];return point;})];}
 return solidQuantities(m).surfaces.filter(s=>s.axis===normal&&s.positive).map(s=>{
  const a=axes[0],b=axes[1];return [[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{const p=[...s.origin] as Vec3;p[a]+=u*s.size[a];p[b]+=v*s.size[b];return p;});
 });
}
export function sectionY(m:Member){return m.sectionY??boundsOf(m)[1]/2;}
// New polygon views dimension the visible silhouette/cut envelope. Legacy
// drawings keep their original overall-member reference dimensions.
export function viewExtents(m:Member,faces:Vec3[][],axes:[number,number]){
 const points=faces.flat(),bounds=boundsOf(m);
 return axes.map(axis=>{const min=m.prismGeometry&&points.length?Math.min(...points.map(p=>p[axis])):0,max=m.prismGeometry?(points.length?Math.max(...points.map(p=>p[axis])):0):bounds[axis];return {min,max,span:max-min};});
}
export const viewDimension=(m:Member,value:number)=>m.prismGeometry?Number(value.toFixed(6)):value;
export const viewDimensionLabel=(m:Member,value:number)=>`${viewDimension(m,value)} mm${m.prismGeometry&&m.prismGeometry.version!==1?' / view span':''}`;
export function sectionFaces(m:Member,section:DrawingSection=drawingSections(m)[0]){
 if(m.prismGeometry)return prismSection(m.prismGeometry,axisIndex(section.axis),section.position);
 const axes=sectionAxes(section),normal=axisIndex(section.axis),boxes=[...solidsOf(m),...(m.geometry?.voids||[])],edges=axes.map(axis=>[...new Set(boxes.flatMap(s=>[s.origin[axis],s.origin[axis]+s.size[axis]]))].sort((a,b)=>a-b)),faces:Vec3[][]=[];
 for(let i=1;i<edges[0].length;i++)for(let j=1;j<edges[1].length;j++){const u=edges[0][i-1],v=edges[1][j-1],w=edges[0][i]-u,h=edges[1][j]-v,at=(x:number,y:number)=>{const p=[0,0,0] as Vec3;p[normal]=section.position;p[axes[0]]=x;p[axes[1]]=y;return p;};if(contains(m,at(u+w/2,v+h/2)))faces.push([at(u,v),at(u+w,v),at(u+w,v+h),at(u,v+h)]);}
 return faces;
}
export function sectionTrace(path:Vec3[],depth:number,diameter:number,axis:number=1){
 const lines:Vec3[][]=[],points:Vec3[]=[];for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],da=a[axis]-depth,db=b[axis]-depth;if(Math.abs(da)<=diameter/2&&Math.abs(db)<=diameter/2)lines.push([a,b]);else if(da*db<=0&&Math.abs(a[axis]-b[axis])>1e-7){const t=(depth-a[axis])/(b[axis]-a[axis]);points.push(a.map((v,j)=>v+(b[j]-v)*t) as Vec3);}}
 return {lines,points};
}
// A bar parallel to the viewing normal projects to its circular end. Keep one
// dot per physical path, including coincident bars; never change schedule qty.
export function primaryBarTrace(paths:Vec3[][],axes:[number,number]){
 const lines:Vec3[][]=[],points:Vec3[]=[];
 for(const path of paths){if(!path.length)continue;const first=path[0];
  if(path.every(p=>Math.hypot(p[axes[0]]-first[axes[0]],p[axes[1]]-first[axes[1]])<=1e-6))points.push(first);
  else lines.push(path);
 }
 return {lines,points};
}
export function boundaryEdges(faces:Vec3[][]){
 const edges=new Map<string,{a:Vec3;b:Vec3;count:number}>();for(const face of faces)for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],key=[a.join(','),b.join(',')].sort().join('|'),old=edges.get(key);if(old)old.count++;else edges.set(key,{a,b,count:1});}
 return [...edges.values()].filter(e=>e.count===1);
}

export function contextProjectionFaces(m:Member,axes:[number,number]){return contextSolids(m).map(s=>[[0,0],[1,0],[1,1],[0,1]].map(([a,b])=>{const p=[...s.origin] as Vec3;p[axes[0]]+=a*s.size[axes[0]];p[axes[1]]+=b*s.size[axes[1]];return p;}));}
function cutBoxes(boxes:ReturnType<typeof contextSolids>,section:DrawingSection){const axis=axisIndex(section.axis),axes=sectionAxes(section);return boxes.filter(s=>section.position>=s.origin[axis]&&section.position<=s.origin[axis]+s.size[axis]).map(s=>[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{const p=[...s.origin] as Vec3;p[axis]=section.position;p[axes[0]]+=u*s.size[axes[0]];p[axes[1]]+=v*s.size[axes[1]];return p;}));}
export function contextSectionFaces(m:Member,section:DrawingSection=drawingSections(m)[0]){return cutBoxes(contextSolids(m),section);}
export function contextOpeningProjectionFaces(m:Member,axes:[number,number]){return contextOpenings(m).map(s=>[[0,0],[1,0],[1,1],[0,1]].map(([a,b])=>{const p=[...s.origin] as Vec3;p[axes[0]]+=a*s.size[axes[0]];p[axes[1]]+=b*s.size[axes[1]];return p;}));}
export function contextOpeningSectionFaces(m:Member,section:DrawingSection=drawingSections(m)[0]){return cutBoxes(contextOpenings(m),section);}
