import type {Bar,Member,Vec3} from './model';
import {barDetail} from './barDetails';
export const GENERAL_LAYOUT='general-v4' as const;
type P=[number,number];
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]],add=(a:P,b:P,k=1):P=>[a[0]+b[0]*k,a[1]+b[1]*k];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1],cross=(a:P,b:P)=>a[0]*b[1]-a[1]*b[0];
const normal=(a:P):P=>[-a[1],a[0]],unit=(a:P):P=>a.map(v=>v/Math.hypot(...a)) as P;
const sub3=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot3=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross3=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit3=(a:Vec3)=>a.map(v=>v/Math.hypot(...a)) as Vec3;
const fmt=(n:number)=>Number(n.toFixed(3));
// v4 deliberately retains its original non-acute contract. The v5 adapter opts in
// to acute geometry and exact cardinal samples for tangency constructions.
export function generalBar(member:Member,bar:Bar){return planarBar(member,bar);}
export function planarBar(member:Member,bar:Bar,acute=false){
 const detail=barDetail(member,bar),raw=detail.points,half=(bar.outsideDiameter??bar.diameter)/2;
 const fail=(reason:string)=>({available:false as const,reason,detail});
 if(['arc','helix'].includes(bar.shape))return fail('ส่วนโค้งต่อเนื่องต้องใช้รายละเอียดรูป 67; ห้ามใช้จุดตัวอย่างเป็นมุมของ Code99');
 if(bar.shapeCode.trim()!=='99')return fail('รูปพิเศษนี้ใช้กับ Code 99 เท่านั้น');
 if(raw.length<2||detail.legs.some(l=>l.virtualLength<.001))return fail('ต้องมีอย่างน้อยสองจุดและห้ามจุดต่อเนื่องซ้ำ');
 if(raw.length>13)return fail('รูปสองเส้นรุ่นนี้รองรับไม่เกิน 12 ช่วง ใช้แบบพิกัดพร้อมมิติสำหรับรูปยาว');
 if(detail.errors.length)return fail(detail.errors.join(' / '));
 if(half*2<bar.diameter)return fail('ผิวนอกต้องไม่น้อยกว่าขนาด nominal');
 if(detail.bends.length&&bar.radius<=half)return fail('รัศมีด้านในต้องเป็นค่าบวก');
 // Acute internal bends need Figure 4 tangent constructions, not this projected-leg adapter.
 if(!acute&&detail.bends.some(b=>b.angle>90.00001))return fail('มุมภายในแหลม / Figure 4 ยังไม่รองรับใน v4 ใช้แบบเส้นสัมผัส v5 สำหรับมุมแหลมหนึ่งจุด');
 const x=unit3(sub3(raw[1],raw[0])),n=raw.slice(2).map(p=>cross3(x,sub3(p,raw[0]))).find(v=>Math.hypot(...v)>.001);
 const plane=n?unit3(n):undefined;
 if(plane&&raw.some(p=>Math.abs(dot3(sub3(p,raw[0]),plane))>.001))return fail('bent in two planes / รูปหลายระนาบยังต้องใช้แบบพิกัดและตรวจภาพประกอบ');
 const y=plane?unit3(cross3(plane,x)):unit3(cross3(Math.abs(x[2])<.9?[0,0,1]:[0,1,0],x));
 const project=(p:Vec3):P=>[dot3(sub3(p,raw[0]),x),-dot3(sub3(p,raw[0]),y)],points=raw.map(project);
 const dirs=points.slice(1).map((p,i)=>unit(sub(p,points[i]))),angles=points.map(()=>0),signs=points.map(()=>0),centers:(P|undefined)[]=points.map(()=>undefined);
 for(let i=1;i<points.length-1;i++){
  const u=dirs[i-1],v=dirs[i];angles[i]=Math.acos(Math.max(-1,Math.min(1,dot(u,v))));signs[i]=Math.sign(cross(u,v));
  if(angles[i]>1e-5){const start=add(points[i],u,-bar.radius*Math.tan(angles[i]/2));centers[i]=add(start,normal(u),signs[i]*bar.radius);}
 }
 const edge=(side:number)=>{
  const path:P[]=[add(points[0],normal(dirs[0]),side*half)];
  for(let i=1;i<points.length-1;i++){
   const center=centers[i];if(!center){path.push(add(points[i],normal(dirs[i]),side*half));continue;}
   const radial=normal(dirs[i-1]),start=Math.atan2(-signs[i]*radial[1],-signs[i]*radial[0]),radius=bar.radius-signs[i]*side*half,steps=Math.max(4,Math.ceil(angles[i]/(Math.PI/48)));
   const fractions=Array.from({length:steps+1},(_,j)=>j/steps);
   if(acute)for(let k=-8;k<=8;k++){const f=(k*Math.PI/2-start)/(signs[i]*angles[i]);if(f>1e-8&&f<1-1e-8&&!fractions.some(v=>Math.abs(v-f)<1e-8))fractions.push(f);}
   for(const f of fractions.sort((a,b)=>a-b)){const t=start+signs[i]*angles[i]*f;path.push([center[0]+radius*Math.cos(t),center[1]+radius*Math.sin(t)]);}
  }
  path.push(add(points.at(-1)!,normal(dirs.at(-1)!),side*half));return path;
 };
 const left=edge(1),right=edge(-1),outline=[...left,...[...right].reverse(),left[0]];
 // Conservative planar intersection/touch guard on the sampled envelope; not a full fabrication separation assessment.
 const on=(p:P,a:P,b:P)=>Math.abs(cross(sub(p,a),sub(b,a)))<1e-6&&dot(sub(p,a),sub(p,b))<=1e-6;
 for(let i=1;i<outline.length;i++)for(let j=i+2;j<outline.length;j++){
  if(i===1&&j===outline.length-1)continue;
  const a=outline[i-1],b=outline[i],c=outline[j-1],d=outline[j],ab=sub(b,a),cd=sub(d,c);
  if((cross(ab,sub(c,a))*cross(ab,sub(d,a))< -1e-8&&cross(cd,sub(a,c))*cross(cd,sub(b,c))< -1e-8)||on(a,c,d)||on(b,c,d)||on(c,a,b)||on(d,a,b))return fail('ผิวเหล็กตัดหรือสัมผัสกันในระนาบ ต้องตรวจและแก้รูปก่อนแสดงมิติผิวนอก');
 }
 const dimensions=detail.legs.map((l,i)=>{
  const u=dirs[i],fromExtension=half*Math.tan(angles[i]/2),toExtension=half*Math.tan(angles[i+1]/2);
  const from=i===0?points[0]:add(add(points[i],u,-fromExtension),normal(u),-signs[i]*half);
  const to=i===dirs.length-1?points.at(-1)!:add(add(points[i+1],u,toExtension),normal(u),-signs[i+1]*half);
  return {label:l.label,value:l.virtualLength+fromExtension+toExtension,from,to,u,free:bar.freeDimensionLeg===i+1};
 });
 const warnings:string[]=[];
 if(!bar.freeDimensionLeg||bar.freeDimensionLeg>dimensions.length)warnings.push('ยังไม่ได้เลือกมิติอิสระที่มีอยู่ในรูป');
 if(bar.outsideDiameter===undefined||!bar.bsDimensionsConfirmed)warnings.push('รอยืนยันผิวนอก/ซี่บั้งและมิติเทียบแบบ');
 warnings.push('ยังต้องตรวจ tolerance / end preparation / วัสดุ / กฎโครงการ / อนุมัติวิศวกรรม');
 return {available:true as const,detail,points,left,right,outline,centerline:detail.path.map(project),dimensions,centers,angles,signs,innerRadius:detail.bends.length?bar.radius-half:0,outsideDiameter:half*2,warnings};
}
export type GeneralBar=Extract<ReturnType<typeof generalBar>,{available:true}>;
export function generalSketch(e:GeneralBar,part=0,width=760,height=440){
 const all=e.outline,lo=[0,1].map(i=>Math.min(...all.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...all.map(p=>p[i]))),scale=Math.min((width-260)/Math.max(1,hi[0]-lo[0]),(height-220)/Math.max(1,hi[1]-lo[1]));
 const at=(p:P):P=>[width/2+(p[0]-(lo[0]+hi[0])/2)*scale,height/2+(p[1]-(lo[1]+hi[1])/2)*scale];
 const outline=e.outline.map(at),labels:{text:string;anchor:P;at:P}[]=[];
 const dimensions=e.dimensions.slice(part*6,part*6+6).map((d,i)=>{
  const from=at(d.from),to=at(d.to),n=normal(d.u),mid=add(from,to).map(v=>v/2) as P;
  const vals=outline.map(p=>dot(p,n)),low=Math.min(...vals),high=Math.max(...vals),side=dot(mid,n)<(low+high)/2?-1:1;
  const offset=(side<0?low:high)+side*(22+i*12),a=add(from,n,offset-dot(from,n)),b=add(to,n,offset-dot(to,n));
  const text=`${d.free?'('+d.label+')':d.label} = ${fmt(d.value)}`,labelAt=add(add(a,b).map(v=>v/2) as P,n,side*9);
  // Labels stay horizontal so oblique dimensions remain readable; the table repeats every value.
  for(const previous of labels)if(Math.abs(previous.at[0]-labelAt[0])<130&&Math.abs(previous.at[1]-labelAt[1])<18)labelAt[1]+=side*20;
  labels.push({text,anchor:add(a,b).map(v=>v/2) as P,at:labelAt});return {...d,from,to,a,b,labelAt,text};
 });
 const extra=[...outline,...dimensions.flatMap(d=>[d.a,d.b,[d.labelAt[0]-80,d.labelAt[1]-12] as P,[d.labelAt[0]+80,d.labelAt[1]+12] as P])];
 const min=[0,1].map(i=>Math.min(...extra.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...extra.map(p=>p[i]))),fit=Math.min(1,(width-30)/(max[0]-min[0]),(height-30)/(max[1]-min[1]));
 const move=(p:P):P=>[width/2+(p[0]-(min[0]+max[0])/2)*fit,height/2+(p[1]-(min[1]+max[1])/2)*fit];
 return {width,height,point:(p:P)=>move(at(p)),outline:outline.map(move),centerline:e.centerline.map(p=>move(at(p))),dimensions:dimensions.map(d=>({...d,from:move(d.from),to:move(d.to),a:move(d.a),b:move(d.b),labelAt:move(d.labelAt)})),vertices:e.points.map((p,i)=>({label:'P'+String(i).padStart(2,'0'),at:move(at(p))})),total:Math.ceil(e.dimensions.length/6)};
}
