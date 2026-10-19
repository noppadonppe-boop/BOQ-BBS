import type {Bar,Member,Spec,Vec3} from './model';
import {barPaths,roundedPath} from './engine';
import {bsAssessment} from './bs8666';
import {bsObliqueEnvelope} from './bsObliqueEnvelope';
import {bsArcEnvelope} from './bsArcEnvelope';
export const FABRICATION_LAYOUT='fabrication-v3' as const;
type P=[number,number];
const add=(a:P,b:P,n=1):P=>[a[0]+n*b[0],a[1]+n*b[1]];
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
const unit=(a:P):P=>{const n=Math.hypot(...a);return [a[0]/n,a[1]/n];};
const normal=(u:P):P=>[-u[1],u[0]];
const dot3=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const sub3=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const unit3=(a:Vec3)=>a.map(v=>v/Math.hypot(...a)) as Vec3;
const cross3=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Analytical offsets of straight/tangent/circular segments; no visual width exaggeration.
// Cut-end faces are perpendicular to the centreline, not rounded end caps.
export function barEnvelope(m:Member,b:Bar,s:Spec){
 const raw=barPaths(m,b)[0]||[],a=bsAssessment(b,raw,s);
 if(a.arc)return bsArcEnvelope(b,a);
 const rounded=roundedPath(raw,b.radius);
 const failure=(reason:string)=>({available:false as const,reason,assessment:a});
 if(!a.formula||a.formulaLength===undefined||!a.dimensions.length)return failure('ยังไม่มีมิติผิวนอกที่รองรับสำหรับ geometry / Shape code / ชุดกฎนี้ ใช้แบบรายละเอียดแนวศูนย์กลางประกอบการตรวจ');
 if(rounded.errors.length)return failure(rounded.errors.join(' · '));
 if(raw.length<2||raw.slice(1).some((p,i)=>Math.hypot(...sub3(p,raw[i]))<.001))return failure('พิกัดมีช่วงซ้ำหรือสั้นเกินไป');
 if(a.oblique)return bsObliqueEnvelope(m,b,a);
 const half=a.outsideDiameter/2;
 if(half<=0||a.outsideDiameter<b.diameter||(a.hasBends&&b.radius<=half))return failure('ตรวจขนาดผิวนอกและรัศมีด้านในก่อนสร้างผิวเหล็ก');
 const directions=raw.slice(1).map((p,i)=>unit3(sub3(p,raw[i]))),code=b.shapeCode.trim();
 const xAxis=code==='21'?directions[1]:['31','41','44'].includes(code)?directions[2]:directions[0];
 let yAxis:Vec3;
 if(code==='00')yAxis=unit3(cross3(Math.abs(xAxis[2])<.9?[0,0,1]:[0,1,0],xAxis));
 else if(['11','12'].includes(code))yAxis=directions[1];
 else yAxis=(code==='21'?directions[0]:directions[1]).map(v=>-v) as Vec3;
 const origin=raw[0],project=(p:Vec3):P=>{const v=sub3(p,origin);return [dot3(v,xAxis),-dot3(v,yAxis)];};
 // Collinear intermediate vertices in code00 are not extra fabrication dimensions.
 const points=code==='00'?[project(raw[0]),project(raw.at(-1)!)]:raw.map(project);
 const dirs=points.slice(1).map((p,i)=>unit(sub(p,points[i])));
 const edges=(side:number)=>{
  const result:P[]=[add(points[0],normal(dirs[0]),side*half)];
  for(let i=1;i<points.length-1;i++){
   const u=dirs[i-1],v=dirs[i],turn=u[0]*v[1]-u[1]*v[0],sign=Math.sign(turn),radius=b.radius-sign*side*half;
   const start=add(points[i],u,-b.radius),center=add(start,v,b.radius),radial=sub(start,center),angle=Math.atan2(radial[1],radial[0]);
   for(let j=0;j<=24;j++){const t=angle+sign*Math.PI/2*j/24;result.push([center[0]+radius*Math.cos(t),center[1]+radius*Math.sin(t)]);}
  }
  result.push(add(points.at(-1)!,normal(dirs.at(-1)!),side*half));return result;
 };
 const left=edges(1),right=edges(-1),outline=[...left,...[...right].reverse(),left[0]];
 let radiusDimension:{center:P;surface:P}|undefined;
 if(a.hasBends){const u=dirs[0],v=dirs[1],center=add(add(points[1],u,-b.radius),v,b.radius),radial=unit(sub(u,v));radiusDimension={center,surface:add(center,radial,a.innerRadius)};}
 const dimensions=a.dimensions.map((d,i)=>{
  const leg=code==='33'?[2,1,0][i]:code==='51'?[2,3,0,5][i]:['11','12'].includes(code)?1-i:i,u=dirs[leg],first=points[leg],last=points[leg+1];
  const from=code==='00'?first:add(first,u,leg===0?0:-half),to=code==='00'?last:add(last,u,leg===dirs.length-1?0:half);
  return {...d,from,to,u:undefined as P|undefined,axis:(Math.abs(u[0])>.9?0:1) as 0|1,modelSpan:Math.hypot(...sub(to,from))};
 });
 if(dimensions.some(d=>Math.abs(d.modelSpan-d.value)>.001))return failure('แนวมิติผิวนอกไม่ตรงผลคำนวณ ต้องตรวจ geometry');
 const lo=[0,1].map(i=>Math.min(...outline.map(p=>p[i]))) as P,hi=[0,1].map(i=>Math.max(...outline.map(p=>p[i]))) as P;
 return {available:true as const,assessment:a,points,centerline:rounded.points.map(project),left,right,outline,dimensions,lo,hi,outsideDiameter:a.outsideDiameter,innerRadius:a.innerRadius,radiusDimension};
}
export type BarEnvelope=ReturnType<typeof barEnvelope>;
export function envelopeSketch(e:Extract<BarEnvelope,{available:true}>,width=600,height=330){
 const oblique=e.dimensions.some(d=>d.u),marginX=oblique?115:85,marginY=oblique?105:70,scale=Math.min((width-2*marginX)/Math.max(1,e.hi[0]-e.lo[0]),(height-2*marginY)/Math.max(1,e.hi[1]-e.lo[1]));
 const at=(p:P):P=>[width/2+(p[0]-(e.lo[0]+e.hi[0])/2)*scale,height/2+(p[1]-(e.lo[1]+e.hi[1])/2)*scale];
 const lo=at(e.lo),hi=at(e.hi),lanes:Record<string,{low:number;high:number;lane:number}[]>={};
 const dimensions=e.dimensions.map(d=>{
  if('arcPoints' in d){
   const curved=d as typeof d & {arcCenter:P;arcPoints:P[]};
   const center=at(curved.arcCenter),from=at(d.from),to=at(d.to),arcPoints=curved.arcPoints.map((p:P)=>{const q=at(p);return add(q,unit(sub(q,center)),24);}),a=arcPoints[0],b=arcPoints.at(-1)!,mid=arcPoints[Math.floor(arcPoints.length/2)],labelAt=add(mid,unit(sub(mid,center)),12);
   return {...d,a,b,from,to,arcPoints,labelAt,text:`A = ${Number(d.value.toFixed(3))} (arc)`,angle:0};
  }
  if(d.u){
   const from=at(d.from),to=at(d.to),n=normal(d.u),dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1],mid=add(from,to).map(v=>v/2) as P,outline=e.outline.map(at),vals=outline.map(p=>dot(p,n)),low=Math.min(...vals),high=Math.max(...vals),side=dot(mid,n)<(low+high)/2?-1:1,key=d.label;
   const lane=e.dimensions.findIndex(v=>v===d),offset=(side<0?low:high)+side*(24+lane*11),a=add(from,n,offset-dot(from,n)),b=add(to,n,offset-dot(to,n)),labelAt=add(add(a,b).map(v=>v/2) as P,n,side*10),text=`${d.free?'('+key+')':key} = ${Number(d.value.toFixed(3))}`;
   return{...d,a,b,from,to,labelAt,text,angle:0,arcPoints:undefined as P[]|undefined};
  }
  const from=at(d.from),to=at(d.to),axis=d.axis,other=1-axis,mid=(from[other]+to[other])/2,side=mid<(lo[other]+hi[other])/2?-1:1;
  const low=Math.min(from[axis],to[axis]),high=Math.max(from[axis],to[axis]),key=axis+':'+side,used=lanes[key]||[];
  let lane=0;while(used.some(v=>v.lane===lane&&low-32<v.high&&high+32>v.low))lane++;
  used.push({low,high,lane});lanes[key]=used;
  const pos=(side<0?lo[other]:hi[other])+side*(24+lane*19),a=[...from] as P,b=[...to] as P;a[other]=b[other]=pos;
  const text=`${d.free?'('+d.label+')':d.label} = ${Number(d.value.toFixed(3))}`,labelAt=[(a[0]+b[0])/2,(a[1]+b[1])/2] as P;
  if(axis===0)labelAt[1]-=5;else labelAt[0]-=5;
  return {...d,a,b,from,to,labelAt,text,angle:axis===0?0:90,arcPoints:undefined as P[]|undefined};
 });
 const radius=e.radiusDimension?{center:at(e.radiusDimension.center),surface:at(e.radiusDimension.surface),labelAt:[width-165,height-12] as P,text:`r = ${Number(e.innerRadius.toFixed(3))} (inside)`}:undefined;
 // Keep the semicircle radius label in the empty space between its arms;
 // the historical bottom-right leader would cross the free C annotation.
 if(e.assessment.semicircle&&radius)radius.labelAt=[Math.max(25,radius.center[0]-175),radius.center[1]+5];
 if(e.assessment.arc&&radius){const toward=unit(sub(radius.center,radius.surface)),span=Math.min(45,Math.hypot(...sub(radius.center,radius.surface)));radius.center=add(radius.surface,toward,span);radius.labelAt=[radius.center[0]+25,Math.min(height-18,radius.center[1]+12)];radius.text=`R = ${Number(e.innerRadius.toFixed(3))} (inside)`;}
 if(oblique&&radius){const direction=unit(sub(radius.center,radius.surface)),p=add(radius.center,direction,65);radius.labelAt=[Math.max(25,Math.min(width-145,p[0])),Math.max(25,Math.min(height-20,p[1]))];}
 return {outline:e.outline.map(at),centerline:e.centerline.map(at),dimensions,radius,scale,width,height};
}
