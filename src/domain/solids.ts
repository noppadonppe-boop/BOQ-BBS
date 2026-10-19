import {Member,Solid,Vec3} from './model';
import {prismBounds,prismContains,prismPathInside,prismQuantities,polygonFaceDistance} from './prismGeometry';
export function solidsOf(m:Member):Solid[]{
 if(m.prismGeometry)return [];
 if(m.geometry)return m.geometry.solids;
 const solids:Solid[]=[{id:'main',label:m.code,origin:[0,0,0],size:[m.x,m.y,m.z],faces:m.faces}];
 const p=m.pedestal;if(p.x>0&&p.y>0&&p.z>0)solids.push({id:'pedestal',label:'Pedestal',origin:[(m.x-p.x)/2,(m.y-p.y)/2,m.z],size:[p.x,p.y,p.z],faces:[true,true,true,true,false,false]});
 return solids;
}
export function boundsOf(m:Member):Vec3{if(m.prismGeometry)return prismBounds(m.prismGeometry);return [0,1,2].map(i=>Math.max(...solidsOf(m).map(s=>s.origin[i]+s.size[i]))) as Vec3;}
export const insideBox=(p:Vec3,b:Solid,tol=1e-6)=>p.every((v,i)=>v>=b.origin[i]-tol&&v<=b.origin[i]+b.size[i]+tol);
const interior=(p:Vec3,b:Solid)=>p.every((v,i)=>v>b.origin[i]+1e-6&&v<b.origin[i]+b.size[i]-1e-6);
export function contains(m:Member,p:Vec3){if(m.prismGeometry)return prismContains(m.prismGeometry,p);return solidsOf(m).some(s=>insideBox(p,s))&&!(m.geometry?.voids||[]).some(s=>interior(p,s));}
export function pathInside(m:Member,path:Vec3[]){
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
export function pathClearance(path:Vec3[],surfaces:Surface[],required:number){
 for(let i=1;i<path.length;i++)for(const surface of surfaces)if(segmentFaceDistance(path[i-1],path[i],surface)<required-.0001)return false;return true;
}
export function solidQuantities(m:Member):{volume:number;formwork:number;surfaces:Surface[];errors:string[]}{
 if(m.prismGeometry)return prismQuantities(m.prismGeometry);
 const solids=solidsOf(m),voids=m.geometry?.voids||[],boxes=[...solids,...voids],errors:string[]=[];
 const edges=[0,1,2].map(axis=>[...new Set(boxes.flatMap(s=>[s.origin[axis],s.origin[axis]+s.size[axis]]))].sort((a,b)=>a-b));
 const [nx,ny,nz]=edges.map(e=>e.length-1);if(nx*ny*nz>100000)return {volume:0,formwork:0,surfaces:[],errors:['เรขาคณิตซับซ้อนเกิน 100,000 cells แยกสมาชิกก่อน']};
 const cells=new Map<string,{origin:Vec3;size:Vec3;mid:Vec3}>();
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
  const ijk=[i,j,k],origin=ijk.map((n,a)=>edges[a][n]) as Vec3,size=ijk.map((n,a)=>edges[a][n+1]-edges[a][n]) as Vec3,mid=origin.map((v,a)=>v+size[a]/2) as Vec3;
  if(solids.some(s=>interior(mid,s))&&!voids.some(s=>interior(mid,s)))cells.set(`${i},${j},${k}`,{origin,size,mid});
 }
 let volume=0,formwork=0;const surfaces:Surface[]=[];
 for(const [key,cell] of cells){volume+=cell.size[0]*cell.size[1]*cell.size[2];const ijk=key.split(',').map(Number);
  for(let axis=0;axis<3;axis++)for(const positive of [false,true]){const next=[...ijk];next[axis]+=positive?1:-1;if(cells.has(next.join(',')))continue;
   const point=[...cell.mid] as Vec3;point[axis]=cell.origin[axis]+(positive?cell.size[axis]:0);const face=axis*2+(positive?1:0);
   const exteriorForm=solids.some(s=>insideBox(point,s)&&Math.abs(point[axis]-(s.origin[axis]+(positive?s.size[axis]:0)))<1e-6&&s.faces[face]);
   const openingForm=voids.some(v=>insideBox(point,v)&&Math.abs(point[axis]-(v.origin[axis]+(positive?0:v.size[axis])))<1e-6&&v.faces[axis*2+(positive?0:1)]);
   const size=[...cell.size] as Vec3;size[axis]=0;const origin=[...cell.origin] as Vec3;origin[axis]=point[axis];const formed=exteriorForm||openingForm;
   surfaces.push({origin,size,axis,positive,formed});if(formed)formwork+=cell.size[(axis+1)%3]*cell.size[(axis+2)%3];
  }
 }
 if(!cells.size)errors.push('ไม่มีปริมาตรคอนกรีตหลังหักช่องเปิด');
 return {volume:volume/1e9,formwork:formwork/1e6,surfaces,errors};
}
