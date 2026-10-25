import {Member,Solid,Vec3} from './model';
import {prismBounds,prismContains,prismPathInside,prismQuantities,polygonFaceDistance} from './prismGeometry';
import {shapeBounds,shapeContains,shapeGeometry,shapePathInside} from './shapeGeometry';
export function solidsOf(m:Member):Solid[]{
 if(m.prismGeometry||m.shapeModel)return [];
 if(m.geometry)return m.geometry.solids;
 const solids:Solid[]=[{id:'main',label:m.code,origin:[0,0,0],size:[m.x,m.y,m.z],faces:m.faces}];
 const p=m.pedestal;if(p.x>0&&p.y>0&&p.z>0)solids.push({id:'pedestal',label:'Pedestal',origin:[(m.x-p.x)/2,(m.y-p.y)/2,m.z],size:[p.x,p.y,p.z],faces:[true,true,true,true,false,false]});
 return solids;
}
export function boundsOf(m:Member):Vec3{if(m.shapeModel)return shapeBounds(m.shapeModel);if(m.prismGeometry)return prismBounds(m.prismGeometry);return [0,1,2].map(i=>Math.max(...solidsOf(m).map(s=>s.origin[i]+s.size[i]))) as Vec3;}
export const insideBox=(p:Vec3,b:Solid,tol=1e-6)=>p.every((v,i)=>v>=b.origin[i]-tol&&v<=b.origin[i]+b.size[i]+tol);
const interior=(p:Vec3,b:Solid)=>p.every((v,i)=>v>b.origin[i]+1e-6&&v<b.origin[i]+b.size[i]-1e-6);
export function contains(m:Member,p:Vec3){if(m.shapeModel)return shapeContains(m.shapeModel,p);if(m.prismGeometry)return prismContains(m.prismGeometry,p);return solidsOf(m).some(s=>insideBox(p,s))&&!(m.geometry?.voids||[]).some(s=>interior(p,s));}
export function pathInside(m:Member,path:Vec3[]){
 if(m.shapeModel)return shapePathInside(m.shapeModel,path);
 if(m.prismGeometry)return prismPathInside(m.prismGeometry,path);
 const boxes=[...solidsOf(m),...(m.geometry?.voids||[])];
 if(path.some(p=>!contains(m,p)))return false;
 for(let n=1;n<path.length;n++){
  const a=path[n-1],b=path[n],t=[0,1];
  for(const box of boxes)for(let axis=0;axis<3;axis++)if(Math.abs(b[axis]-a[axis])>1e-8)for(const edge of [box.origin[axis],box.origin[axis]+box.size[axis]]){const v=(edge-a[axis])/(b[axis]-a[axis]);if(v>0&&v<1)t.push(v);}
  t.sort((x,y)=>x-y);for(let i=1;i<t.length;i++){const v=(t[i]+t[i-1])/2,p=a.map((x,j)=>x+(b[j]-x)*v) as Vec3;if(!contains(m,p))return false;}
 }return true;
}
export type Surface={origin:Vec3;size:Vec3;axis:number;positive:boolean;formed:boolean;vertices?:Vec3[];normal?:Vec3};
export function segmentFaceDistance(a:Vec3,b:Vec3,s:Surface){
 if(s.vertices)return polygonFaceDistance(a,b,s);
 const delta=b.map((v,i)=>v-a[i]),times=[0,1];for(let i=0;i<3;i++)if(Math.abs(delta[i])>1e-9)for(const edge of [s.origin[i],s.origin[i]+s.size[i]]){const t=(edge-a[i])/delta[i];if(t>0&&t<1)times.push(t);}times.sort((x,y)=>x-y);
 let min=Infinity;for(let i=1;i<times.length;i++){const lo=times[i-1],hi=times[i],mid=(lo+hi)/2,k:number[]=[],c:number[]=[];
  for(let axis=0;axis<3;axis++){const v=a[axis]+delta[axis]*mid,lower=s.origin[axis],upper=lower+s.size[axis];if(v<lower||axis===s.axis){k.push(delta[axis]);c.push(a[axis]-lower);}else if(v>upper){k.push(delta[axis]);c.push(a[axis]-upper);}}
  const denom=k.reduce((n,v)=>n+v*v,0),t=denom?Math.max(lo,Math.min(hi,-k.reduce((n,v,j)=>n+v*c[j],0)/denom)):lo;min=Math.min(min,k.reduce((n,v,j)=>n+(v*t+c[j])**2,0));
 }return Math.sqrt(min);
}
const surfaceBoxes=new WeakMap<Surface,[Vec3,Vec3]>();
function surfaceBox(s:Surface):[Vec3,Vec3]{
 let box=surfaceBoxes.get(s);
 if(!box){const pts=s.vertices?.length?s.vertices:[s.origin,s.origin.map((v,i)=>v+s.size[i]) as Vec3];box=[[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))) as Vec3,[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))) as Vec3];surfaceBoxes.set(s,box);}
 return box;
}
/** Surfaces that can lie within `reach(s)` of the path (bounding boxes): the rest are too far to matter for cover. */
export function surfacesNear(path:Vec3[],surfaces:Surface[],reach:(s:Surface)=>number){
 if(!path.length)return [];
 const lo=[0,1,2].map(i=>Math.min(...path.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...path.map(p=>p[i])));
 return surfaces.filter(s=>{const [a,b]=surfaceBox(s),r=reach(s);let d=0;for(let i=0;i<3;i++){const g=Math.max(0,a[i]-hi[i],lo[i]-b[i]);d+=g*g;}return Math.sqrt(d)<r+1;});
}
/** Lower bound of the distance between segment a–b and a surface (bounding boxes, no allocation). */
export function segmentFaceGap(a:Vec3,b:Vec3,s:Surface){
 const [lo,hi]=surfaceBox(s);let d=0;
 for(let i=0;i<3;i++){const g=Math.max(0,lo[i]-Math.max(a[i],b[i]),Math.min(a[i],b[i])-hi[i]);d+=g*g;}
 return Math.sqrt(d);
}
export function pathClearance(path:Vec3[],surfaces:Surface[],required:number){
 const near=surfacesNear(path,surfaces,()=>required);
 for(let i=1;i<path.length;i++)for(const surface of near)if(segmentFaceGap(path[i-1],path[i],surface)<required&&segmentFaceDistance(path[i-1],path[i],surface)<required-.0001)return false;return true;
}
export function solidQuantities(m:Member):{volume:number;formwork:number;surfaces:Surface[];errors:string[]}{
 if(m.shapeModel){const g=shapeGeometry(m.shapeModel);return {volume:g.volume,formwork:g.formwork,surfaces:g.surfaces,errors:g.errors};}
 if(m.prismGeometry)return prismQuantities(m.prismGeometry);
 const {cells:_,...q}=boxCells(m);return q;
}
type Cell={origin:Vec3;size:Vec3;mid:Vec3;formwork:number};
/** Box members as a grid of cells (solid edges + `extraZ` levels): volume, formed faces, each cell's own formwork. */
function boxCells(m:Member,extraZ:number[]=[]):{volume:number;formwork:number;surfaces:Surface[];errors:string[];cells:Map<string,Cell>;edges:number[][]}{
 const solids=solidsOf(m),voids=m.geometry?.voids||[],boxes=[...solids,...voids],errors:string[]=[];
 const edges=[0,1,2].map(axis=>[...new Set([...boxes.flatMap(s=>[s.origin[axis],s.origin[axis]+s.size[axis]]),...(axis===2?extraZ:[])])].sort((a,b)=>a-b));
 const [nx,ny,nz]=edges.map(e=>e.length-1);if(nx*ny*nz>100000)return {volume:0,formwork:0,surfaces:[],errors:['เรขาคณิตซับซ้อนเกิน 100,000 cells แยกสมาชิกก่อน'],cells:new Map(),edges};
 const cells=new Map<string,Cell>();
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
  const ijk=[i,j,k],origin=ijk.map((n,a)=>edges[a][n]) as Vec3,size=ijk.map((n,a)=>edges[a][n+1]-edges[a][n]) as Vec3,mid=origin.map((v,a)=>v+size[a]/2) as Vec3;
  if(solids.some(s=>interior(mid,s))&&!voids.some(s=>interior(mid,s)))cells.set(`${i},${j},${k}`,{origin,size,mid,formwork:0});
 }
 let volume=0,formwork=0;const surfaces:Surface[]=[];
 for(const [key,cell] of cells){volume+=cell.size[0]*cell.size[1]*cell.size[2];const ijk=key.split(',').map(Number);
  for(let axis=0;axis<3;axis++)for(const positive of [false,true]){const next=[...ijk];next[axis]+=positive?1:-1;if(cells.has(next.join(',')))continue;
   const point=[...cell.mid] as Vec3;point[axis]=cell.origin[axis]+(positive?cell.size[axis]:0);const face=axis*2+(positive?1:0);
   const exteriorForm=solids.some(s=>insideBox(point,s)&&Math.abs(point[axis]-(s.origin[axis]+(positive?s.size[axis]:0)))<1e-6&&s.faces[face]);
   const openingForm=voids.some(v=>insideBox(point,v)&&Math.abs(point[axis]-(v.origin[axis]+(positive?0:v.size[axis])))<1e-6&&v.faces[axis*2+(positive?0:1)]);
   const size=[...cell.size] as Vec3;size[axis]=0;const origin=[...cell.origin] as Vec3;origin[axis]=point[axis];const formed=exteriorForm||openingForm;
   surfaces.push({origin,size,axis,positive,formed});if(formed){const f=cell.size[(axis+1)%3]*cell.size[(axis+2)%3];formwork+=f;cell.formwork+=f;}
  }
 }
 if(!cells.size)errors.push('ไม่มีปริมาตรคอนกรีตหลังหักช่องเปิด');
 return {volume:volume/1e9,formwork:formwork/1e6,surfaces,errors,cells,edges};
}
export type PourStage={stage:number;z0:number;z1:number;concrete:number;formwork:number;joint:number};
/** Pour stages of a box member (`m.pourStages.levels` = top of each stage but the last, mm from the member bottom):
 * net concrete and formwork per stage and the construction-joint area at the top of each stage (m²).
 * Deductions with `zRange` are spread over that height; others in proportion to each stage's gross amount. */
export function pourStageQuantities(m:Member):PourStage[]{
 if(m.shapeModel||m.prismGeometry||!m.pourStages?.levels.length)return [];
 const zMax=boundsOf(m)[2],zMin=Math.min(...solidsOf(m).map(s=>s.origin[2]));
 const levels=[...new Set(m.pourStages.levels)].filter(z=>z>zMin+1e-6&&z<zMax-1e-6).sort((a,b)=>a-b);if(!levels.length)return [];
 const {cells,edges}=boxCells(m,levels),bounds=[zMin,...levels,zMax];
 const out:PourStage[]=bounds.slice(1).map((z1,k)=>({stage:k+1,z0:bounds[k],z1,concrete:0,formwork:0,joint:0}));
 const band=(z:number)=>Math.max(0,bounds.findIndex((b,k)=>k>0&&z<b)-1);
 for(const [key,c] of cells){const st=out[band(c.mid[2])];st.concrete+=c.size[0]*c.size[1]*c.size[2]/1e9;st.formwork+=c.formwork/1e6;
  // joint: the cell above belongs to the next stage
  const [i,j,k]=key.split(',').map(Number),top=edges[2][k+1];if(levels.some(z=>Math.abs(z-top)<1e-6)&&cells.has(`${i},${j},${k+1}`))st.joint+=c.size[0]*c.size[1]/1e6;}
 const gross={v:out.reduce((n,s)=>n+s.concrete,0),f:out.reduce((n,s)=>n+s.formwork,0)},share=out.map(s=>({v:gross.v?s.concrete/gross.v:0,f:gross.f?s.formwork/gross.f:0}));
 for(const d of m.deductions)out.forEach((s,k)=>{let w:{v:number;f:number};
  if(d.zRange&&d.zRange[1]>d.zRange[0]){const f=Math.max(0,Math.min(s.z1,d.zRange[1])-Math.max(s.z0,d.zRange[0]))/(d.zRange[1]-d.zRange[0]);w={v:f,f};}else w=share[k];
  s.concrete-=d.volume*w.v;s.formwork-=d.formwork*w.f;
  // a deduction through the stage top (cut-off corners of round footings …) also takes its plan area off the joint
  if(d.zRange&&k<out.length-1&&d.zRange[0]<s.z1-1e-6&&d.zRange[1]>s.z1+1e-6)s.joint=Math.max(0,s.joint-d.volume/((d.zRange[1]-d.zRange[0])/1000));});
 return out;
}
