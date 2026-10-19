import type {Bar,Vec3} from './model';
import type {bsAssessment} from './bs8666';
import {arcGeometry} from './arcGeometry';
type P=[number,number];

export function bsArcEnvelope(b:Bar,assessment:ReturnType<typeof bsAssessment>){
 const arc=arcGeometry(b),a=b.curve!,half=assessment.outsideDiameter/2,sweep=a.sweepDegrees*Math.PI/180,rotation=Math.PI/2-sweep/2;
 const at=(radius:number,t:number):P=>[radius*Math.cos(t+rotation),-radius*Math.sin(t+rotation)];
 const edge=(radius:number)=>Array.from({length:arc.segments+1},(_,i)=>at(radius,sweep*i/arc.segments));
 const centerline=edge(b.radius),left=edge(b.radius+half),right=edge(b.radius-half),outline=[...left,...[...right].reverse(),left[0]];
 const extrema=[0,sweep];
 for(let i=-3;i<=4;i++){const t=i*Math.PI/2-rotation;if(t>0&&t<sweep)extrema.push(t);}
 const all=extrema.flatMap(t=>[at(b.radius+half,t),at(b.radius-half,t)]);
 const lo=[0,1].map(i=>Math.min(...all.map(p=>p[i]))) as P,hi=[0,1].map(i=>Math.max(...all.map(p=>p[i]))) as P;
 const dimensions=[{...assessment.dimensions[0],from:left[0],to:left.at(-1)!,axis:0 as 0|1,u:undefined as P|undefined,modelSpan:arc.length,arcPoints:left,arcCenter:[0,0] as P}];
 return {available:true as const,assessment,points:centerline,centerline,left,right,outline,dimensions,lo,hi,outsideDiameter:assessment.outsideDiameter,innerRadius:assessment.innerRadius,radiusDimension:{center:[0,0] as P,surface:at(assessment.innerRadius,sweep/2)}};
}
