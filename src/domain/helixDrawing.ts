import type {Bar,Vec3} from './model';
import {helixGeometry,helixTangent,helixAssessment} from './helixGeometry';
type P=[number,number];
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,x,i)=>n+x*b[i],0),cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=(a:Vec3)=>a.map(n=>n/Math.hypot(...a)) as Vec3;
export function helixDrawing(b:Bar){
 const h=b.helix,g=helixGeometry(b),a=helixAssessment(b);if(!h||g.errors.length||!a)return {available:false as const,reason:g.errors.join(' · ')||'ข้อมูลเกลียวยังไม่ถูกต้อง'};
 const half=(b.outsideDiameter??b.diameter)/2,v=unit(cross(h.axis,h.u)),relative=(p:Vec3)=>p.map((n,i)=>n-h.center[i]) as Vec3,local=(p:Vec3):Vec3=>[dot(relative(p),h.u),dot(relative(p),v),dot(relative(p),h.axis)];
 const labels:{text:string;at:P}[]=[],lines:[P,P][]=[],paths:P[][]=[],centrelines:P[][]=[];
 const endScale=90/(b.radius+half),endAt=(p:P):P=>[155+p[0]*endScale,190-p[1]*endScale],circle=(r:number)=>Array.from({length:97},(_,i)=>endAt([r*Math.cos(i*2*Math.PI/96),r*Math.sin(i*2*Math.PI/96)]));
 paths.push(circle(b.radius+half),circle(b.radius-half));centrelines.push(circle(b.radius));labels.push({text:'Circular A reference / NTS',at:[155,50]},{text:`A = ${a.A.toLocaleString('en-US')} mm`,at:[155,328]});const left=endAt([-b.radius-half,0]),right=endAt([b.radius+half,0]);lines.push([left,[left[0],306]],[right,[right[0],306]],[[left[0],306],[right[0],306]]);
 const extent=Math.max(g.height,h.pitch),frontScale=Math.min(190/(a.A+80),240/(extent+(b.outsideDiameter??b.diameter))),frontAt=(p:Vec3):P=>[430+p[0]*frontScale,300-p[2]*frontScale],isoProject=(p:Vec3):P=>[(p[0]-p[1])/Math.sqrt(2),-(p[0]+p[1]-2*p[2])/Math.sqrt(6)],iso=g.points.map(p=>isoProject(local(p))),lo=[0,1].map(i=>Math.min(...iso.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...iso.map(p=>p[i]))),isoScale=Math.min(250/Math.max(1,hi[0]-lo[0]+2*half),240/Math.max(1,hi[1]-lo[1]+2*half)),isoAt=(p:Vec3):P=>{const at=isoProject(p);return [765+(at[0]-(lo[0]+hi[0])/2)*isoScale,180-(at[1]-(lo[1]+hi[1])/2)*isoScale];};
 for(const [project,view] of [[frontAt,[0,1,0] as Vec3],[isoAt,unit([1,1,1])]] as const){
  const sides=[-1,1].map(sign=>g.points.map((p,i)=>{const point=local(p),world=helixTangent(h,b.radius,h.turns*i/g.segments),tangent:[number,number,number]=[dot(world,h.u),dot(world,v),dot(world,h.axis)],edge=cross(tangent,view),n=Math.hypot(...edge);return project(point.map((x,k)=>x+(n>1e-10?edge[k]/n:0)*half*sign) as Vec3);}));paths.push(...sides);lines.push([sides[0][0],sides[1][0]],[sides[0].at(-1)!,sides[1].at(-1)!]);centrelines.push(g.points.map(p=>project(local(p))));
 }
 const pitchX=frontAt([b.radius+half+45,0,0])[0],y0=frontAt([0,0,0])[1],y1=frontAt([0,0,h.pitch])[1];lines.push([[pitchX,y0],[pitchX,y1]],[[pitchX-8,y0],[pitchX+8,y0]],[[pitchX-8,y1],[pitchX+8,y1]]);labels.push({text:`B = ${a.B} mm / turn`,at:[430,338]},{text:'Axial elevation / NTS',at:[430,50]},{text:`C = ${a.C} turns / ${a.handedness}`,at:[765,338]},{text:'Isometric reference / NTS',at:[765,50]});
 return {available:true as const,width:960,height:380,paths,centrelines,lines,labels,assessment:a,notes:h.turns<1?'B leader is one-turn pitch reference; this bar contains a partial turn.':'C is number of turns; A/B are mm. Silhouette generators do not certify occlusion/fabrication.'};
}
