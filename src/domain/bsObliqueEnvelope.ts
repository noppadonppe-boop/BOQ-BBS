import type {Bar,Member} from './model';
import type {bsAssessment} from './bs8666';
import {planarBar} from './generalBar';
type P=[number,number];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1],sub=(a:P,b:P)=>[a[0]-b[0],a[1]-b[1]] as P,unit=(a:P)=>a.map(v=>v/Math.hypot(...a)) as P;
// Reuse exact planar surface offsets; code99 is an internal geometry adapter, not a user-code substitution.
export function bsObliqueEnvelope(m:Member,b:Bar,assessment:ReturnType<typeof bsAssessment>){
 const fail=(reason:string)=>({available:false as const,reason,assessment});
 const g=planarBar(m,{...b,shapeCode:'99'});if(!g.available)return fail(g.reason);
 if(!assessment.oblique)return fail('รูปเอียงไม่ตรง Table 1');
 const code=b.shapeCode.trim(),half=assessment.outsideDiameter/2,base=code==='15'||code==='25'?1:0;
 const originalDirs=g.points.slice(1).map((p,i)=>unit(sub(p,g.points[i]))),x=originalDirs[base],other=originalDirs[base===1?0:1],component=sub(other,x.map(v=>v*dot(other,x)) as P),up=unit(component).map(v=>v*(code==='26'?1:-1)) as P;
 const at=(p:P)=>[dot(p,x),-dot(p,up)] as P,points=g.points.map(at),left=g.left.map(at),right=g.right.map(at),outline=g.outline.map(at);
 const legs=g.dimensions.map(d=>({...d,from:at(d.from),to:at(d.to),u:unit(at(d.u))}));
 const dimension=(label:string,leg:number)=>{const a=assessment.dimensions.find(d=>d.label===label)!,d=legs[leg];return{...a,from:d.from,to:d.to,u:d.u,axis:(Math.abs(d.u[0])>.9?0:1) as 0|1,modelSpan:Math.abs(dot(sub(d.to,d.from),d.u))};};
 const height=(label:string,top:number,bottom:number,x:number)=>{const a=assessment.dimensions.find(d=>d.label===label)!;return{...a,from:[x,top] as P,to:[x,bottom] as P,u:[0,1] as P,axis:1 as const,modelSpan:Math.abs(bottom-top)};};
 const tipTop=(last=false)=>Math.min(left[last?left.length-1:0][1],right[last?right.length-1:0][1]);
 let dimensions;
 if(code==='15')dimensions=[dimension('A',0),height('B',tipTop(),points[1][1]+half,points[0][0]),dimension('C',1)];
 else if(code==='25')dimensions=[dimension('A',0),dimension('B',2),height('C',tipTop(),points[1][1]+half,points[0][0]),height('D',tipTop(true),points[2][1]+half,points.at(-1)![0]),dimension('E',1)];
 else if(code==='26')dimensions=[dimension('A',0),dimension('B',1),dimension('C',2),height('D',tipTop(true),points[0][1]+half,points.at(-1)![0])];
 else dimensions=[dimension('A',0),dimension('B',1),dimension('C',2),height('D',tipTop(),points[2][1]+half,points[1][0]),dimension('E',4),dimension('B',3)];
 if(dimensions.some(d=>Math.abs(d.modelSpan-d.value)>.001))return fail('มิติผิวเหล็กเอียงไม่ตรงผลคำนวณ ต้องตรวจ geometry');
 const lo=[0,1].map(i=>Math.min(...outline.map(p=>p[i]))) as P,hi=[0,1].map(i=>Math.max(...outline.map(p=>p[i]))) as P;
 const firstCenter=g.centers[1],firstAngle=g.angles[1],sign=g.signs[1],u=originalDirs[0],n=[-u[1],u[0]] as P;
 const angle=Math.atan2(-sign*n[1],-sign*n[0])+sign*firstAngle/2;
 const radiusDimension=firstCenter?{center:at(firstCenter),surface:at([firstCenter[0]+assessment.innerRadius*Math.cos(angle),firstCenter[1]+assessment.innerRadius*Math.sin(angle)])}:undefined;
 return{available:true as const,assessment,points,centerline:g.centerline.map(at),left,right,outline,dimensions,lo,hi,outsideDiameter:assessment.outsideDiameter,innerRadius:assessment.innerRadius,radiusDimension};
}
