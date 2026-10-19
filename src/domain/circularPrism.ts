import type {Vec3} from './model';
import {prismGeometrySchema,type PrismGeometry} from './prismSchema';
import {circleVertices} from './circularProfile';
export type CircularPrism=Extract<PrismGeometry,{version:4}>;
const axes=(p:CircularPrism)=>{const axis={X:0,Y:1,Z:2}[p.axis];return {axis,uv:[0,1,2].filter(a=>a!==axis)};};
const EPS=1e-6;
export function circularQuantities(p:CircularPrism){const {outerRadius:R,innerRadius:r}=p.circle,area=Math.PI*(R*R-r*r),outerSide=p.profile.formed[0]?2*Math.PI*R*p.depth:0,innerSide=r&&p.holes[0]?.formed[0]?2*Math.PI*r*p.depth:0,ends=p.endFaces.filter(Boolean).length*area;return {area,volume:area*p.depth/1e9,formwork:(outerSide+innerSide+ends)/1e6};}
export function circularContains(p:CircularPrism,point:Vec3){const {axis,uv}=axes(p),R=p.circle.outerRadius,d=Math.hypot(point[uv[0]]-R,point[uv[1]]-R);return point[axis]>=p.start-EPS&&point[axis]<=p.start+p.depth+EPS&&d<=R+EPS&&d>=p.circle.innerRadius-EPS;}
function closestRadial(p:CircularPrism,a:Vec3,b:Vec3){const {uv}=axes(p),R=p.circle.outerRadius,u=a[uv[0]]-R,v=a[uv[1]]-R,du=b[uv[0]]-a[uv[0]],dv=b[uv[1]]-a[uv[1]],square=du*du+dv*dv,t=square?Math.max(0,Math.min(1,-(u*du+v*dv)/square)):0;return Math.hypot(u+t*du,v+t*dv);}
export function circularPathInside(p:CircularPrism,path:Vec3[]){return path.length>=2&&path.every(v=>circularContains(p,v))&&path.slice(1).every((b,i)=>!p.circle.innerRadius||closestRadial(p,path[i],b)>=p.circle.innerRadius-EPS);}
export function circularSection(p:CircularPrism,cutAxis:number,position:number):Vec3[][]{
 const {axis,uv}=axes(p),R=p.circle.outerRadius,r=p.circle.innerRadius;
 if(cutAxis===axis){if(position<p.start-EPS||position>p.start+p.depth+EPS)return [];return [circleVertices(R,R),...(r?[circleVertices(r,R).reverse()]:[])].map(loop=>loop.map(v=>{const point:Vec3=[0,0,0];point[axis]=position;point[uv[0]]=v[0];point[uv[1]]=v[1];return point;}));}
 const other=uv.find(a=>a!==cutAxis)!,offset=position-R;if(Math.abs(offset)>=R-EPS)return [];const outer=Math.sqrt(R*R-offset*offset),inner=r>Math.abs(offset)?Math.sqrt(r*r-offset*offset):0,ranges=inner?[[R-outer,R-inner],[R+inner,R+outer]]:[[R-outer,R+outer]];
 return ranges.map(([lo,hi])=>[[lo,p.start],[hi,p.start],[hi,p.start+p.depth],[lo,p.start+p.depth]].map(([side,along])=>{const point:Vec3=[0,0,0];point[axis]=along;point[other]=side;point[cutAxis]=position;return point;}));
}
// The radial test conservatively contains the bar in circular bounds. Axial
// flat terminal disks use their actual projected width; no radial-end cut
// compensation is inferred when the circular bound fails.
export function circularPathClearance(p:CircularPrism,path:Vec3[],cover:number,radius:number,flatEnds:boolean){
 if(!circularPathInside(p,path))return false;const {axis,uv}=axes(p),R=p.circle.outerRadius,open=Math.hypot(...path[0].map((n,i)=>n-path.at(-1)![i]))>.0001;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(...a.map((n,j)=>b[j]-n));if(length<1e-8)continue;const radialMax=Math.max(Math.hypot(a[uv[0]]-R,a[uv[1]]-R),Math.hypot(b[uv[0]]-R,b[uv[1]]-R));if(radialMax+radius>R-cover+.0001||p.circle.innerRadius&&closestRadial(p,a,b)-radius<p.circle.innerRadius+cover-.0001)return false;
  const axial=(b[axis]-a[axis])/length,flatStart=flatEnds&&open&&i===1&&length>=radius+.0001,flatEnd=flatEnds&&open&&i===path.length-1&&length>=radius+.0001,width=radius*Math.sqrt(Math.max(0,1-axial*axial)),low=axial>=0?a:b,high=axial>=0?b:a,lowFlat=axial>=0?flatStart:flatEnd,highFlat=axial>=0?flatEnd:flatStart;
  if(low[axis]-(lowFlat?width:radius)<p.start+cover-.0001||high[axis]+(highFlat?width:radius)>p.start+p.depth-cover+.0001)return false;
 }return true;
}
export function buildCircularPrism(input:{axis:'X'|'Y'|'Z';start:number;depth:number;outerDiameter:number;innerDiameter:number;outerForm:boolean;innerForm:boolean;endFaces:[boolean,boolean];basis:string}):CircularPrism{
 const R=input.outerDiameter/2,r=input.innerDiameter/2;return prismGeometrySchema.parse({version:4,axis:input.axis,start:input.start,depth:input.depth,basis:input.basis,endFaces:input.endFaces,circle:{outerRadius:R,innerRadius:r},profile:{vertices:circleVertices(R,R),formed:Array(64).fill(input.outerForm)},holes:r?[{id:'circular-hole',label:'ช่องเปิดวงกลมร่วมศูนย์',vertices:circleVertices(r,R),formed:Array(64).fill(input.innerForm)}]:[]}) as CircularPrism;
}
