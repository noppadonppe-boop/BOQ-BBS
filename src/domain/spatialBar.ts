import type {Bar,Member,Vec3} from './model';
import {barDetail} from './barDetails';
export const SPATIAL_LAYOUT='spatial-v6' as const;
type P=[number,number];
const add=(a:Vec3,b:Vec3,k=1)=>a.map((v,i)=>v+k*b[i]) as Vec3;
const sub=(a:Vec3,b:Vec3)=>add(a,b,-1);
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:Vec3)=>a.map(v=>v/Math.hypot(...a)) as Vec3;
export function isSpatial(member:Member,bar:Bar){
 if(bar.shape==='helix')return true;
 const d=barDetail(member,bar),p=d.points;if(p.length<4)return false;
 const u=p.slice(1).map(v=>sub(v,p[0])).find(v=>Math.hypot(...v)>.001);if(!u)return false;
 const n=p.slice(2).map(v=>cross(unit(u),sub(v,p[0]))).find(v=>Math.hypot(...v)>.001);
 return !!n&&p.some(v=>Math.abs(dot(sub(v,p[0]),unit(n)))>.001);
}
// Drawing adapter only. No BS outside bending dimensions are inferred from
// projected lengths or a virtual centerline vertex in a different bend plane.
export function spatialBar(member:Member,bar:Bar,referenceVectors:Vec3[]=[]){
 const detail=barDetail(member,bar),p=detail.points,half=(bar.outsideDiameter??bar.diameter)/2;
 const fail=(reason:string)=>({available:false as const,reason,detail});
 if(bar.shapeCode.trim()!=='99')return fail('ภาพ Isometric รุ่นนี้ใช้กับ Code 99 เท่านั้น');
 if(p.length<2||detail.legs.some(l=>l.virtualLength<.001))return fail('ต้องมีอย่างน้อยสองจุดและห้ามจุดต่อเนื่องซ้ำ');
 if(p.length>13)return fail('Isometric รุ่นนี้รองรับไม่เกิน 12 ช่วง');
 if(detail.errors.length)return fail(detail.errors.join(' / '));
 if(detail.bends.some(b=>b.angle>90.00001))return fail('มุมภายในแหลมหลายระนาบ / Figure 4 ยังรอแบบเส้นสัมผัสเฉพาะระนาบ');
 if(half*2<bar.diameter||detail.bends.length&&bar.radius<=half)return fail('ตรวจเส้นผ่านศูนย์กลางผิวนอกและรัศมีด้านใน ต้องเป็นค่าบวก');
 const dirs=detail.legs.map(l=>unit(sub(p[l.to],p[l.from])));
 const bends=detail.bends.map(b=>{
  const u=dirs[b.point-1],v=dirs[b.point],incoming=add(p[b.point],u,-b.trim),outgoing=add(p[b.point],v,b.trim);
  const center=add(incoming,cross(b.normal,u),bar.radius),radial=unit(sub(incoming,center)),perp=cross(b.normal,radial);
  return {...b,incoming,outgoing,center,radial,perp};
 });
 const samples:{point:Vec3;tangent:Vec3}[]=[{point:p[0],tangent:dirs[0]}];
 for(let i=1;i<p.length-1;i++){
  const b=bends.find(b=>b.point===i);if(!b){samples.push({point:p[i],tangent:dirs[i-1]});continue;}
  const angle=b.angle*Math.PI/180,steps=Math.max(12,Math.ceil(angle/(Math.PI/96)));
  for(let j=0;j<=steps;j++){const t=angle*j/steps,r=add(b.radial.map(v=>v*Math.cos(t)) as Vec3,b.perp,Math.sin(t));samples.push({point:add(b.center,r,bar.radius),tangent:unit(cross(b.normal,r))});}
 }
 samples.push({point:p.at(-1)!,tangent:dirs.at(-1)!});
 // Every candidate has equal X/Y/Z foreshortening. Select only its viewing
 // octant to avoid looking down a leg; do not substitute an arbitrary axonometric view.
 const candidates=([[1,1,1],[1,-1,1],[-1,1,1],[-1,-1,1]] as Vec3[]).map(unit);
 const score=(v:Vec3)=>{
  const tangent=Math.min(...samples.map(s=>Math.hypot(...cross(v,s.tangent))));if(tangent<.025)return -1;
  const separations=[...p.flatMap((a,i)=>p.slice(i+1).map(b=>sub(b,a))),...referenceVectors].filter(d=>Math.hypot(...d)>.001);
  // A staircase along a viewing diagonal can collapse several different
  // vertices onto one point. Prefer an isometric octant that separates them.
  return Math.min(...separations.map(d=>Math.hypot(...cross(v,unit(d)))))+tangent*.1;
 };
 const view=candidates.sort((a,b)=>score(b)-score(a))[0];
 const axisX=unit(cross([0,0,1],view)),axisY=unit(cross(view,axisX)),origin=p[0];
 const project=(v:Vec3):P=>[dot(sub(v,origin),axisX),-dot(sub(v,origin),axisY)];
 if(samples.some(s=>Math.hypot(...cross(view,s.tangent))<.025))return fail('ภาพ Isometric มีช่วงโค้งตรงแนวมอง ต้องตรวจภาพระนาบประกอบก่อนออกแบบ');
 const surface=(side:number)=>samples.map(s=>project(add(s.point,unit(cross(view,s.tangent)),side*half)));
 const cap=(at:Vec3,tangent:Vec3)=>{const a=unit(cross(view,tangent)),b=cross(tangent,a);return Array.from({length:49},(_,i)=>{const t=i*Math.PI/24;return project(add(add(at,a,half*Math.cos(t)),b,half*Math.sin(t)));});};
 const warnings=['มิติ L คือความยาวช่วงระหว่างจุดตัดแนวศูนย์กลาง ไม่ใช่มิติผิวนอก BS','มิติผิวนอกและมิติอิสระสำหรับดัดหลายระนาบยัง PENDING / ไม่มีการชดเชย tolerance','ภาพแสดงเส้นขอบฉายผิววงกลม ไม่ซ่อนเส้นด้านหลัง / ไม่ใช่การตรวจการชนหรือซี่บั้งจริง','ยังต้องตรวจ BS/ACI / วัสดุ / end preparation / กฎโครงการ / อนุมัติวิศวกรรม'];
 return {available:true as const,detail,bends,samples,multiplePlanes:isSpatial(member,bar),view,axisX,axisY,project,centerline:samples.map(s=>project(s.point)),edges:[surface(1),surface(-1)],caps:[cap(p[0],dirs[0]),cap(p.at(-1)!,dirs.at(-1)!)],outsideDiameter:half*2,innerRadius:detail.bends.length?bar.radius-half:0,selectedLeg:detail.legs.find((_,i)=>i+1===bar.freeDimensionLeg)?.label,warnings};
}
export type SpatialBar=Extract<ReturnType<typeof spatialBar>,{available:true}>;
export function spatialSketch(e:SpatialBar,part=0,width=760,height=440,extra:Vec3[]=[]){
 const geometry=[...e.centerline,...e.edges.flat(),...e.caps.flat(),...e.detail.points.map(e.project),...extra.map(e.project)],lo=[0,1].map(i=>Math.min(...geometry.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...geometry.map(p=>p[i])));
 const scale=Math.min((width-270)/Math.max(1,hi[0]-lo[0]),(height-100)/Math.max(1,hi[1]-lo[1]));
 const at=(p:P):P=>[width/2+(p[0]-(lo[0]+hi[0])/2)*scale,height/2+(p[1]-(lo[1]+hi[1])/2)*scale];
 const rawLabels=[...e.detail.legs.slice(part*6,part*6+6).map(l=>({text:l.label,point:e.detail.points[l.from].map((v,i)=>(v+e.detail.points[l.to][i])/2) as Vec3})),...e.bends.slice(part*6,part*6+6).map(b=>({text:b.label,point:b.center})),...e.detail.points.map((point,i)=>({text:'P'+String(i).padStart(2,'0'),point}))];
 const labels:{text:string;anchor:P;at:P}[]=[];
 for(const raw of rawLabels){const anchor=at(e.project(raw.point)),candidates=Array.from({length:12},(_,i):P=>[Math.max(25,Math.min(width-25,anchor[0]+(i%2?-1:1)*(25+Math.floor(i/4)*25))),Math.max(25,Math.min(height-25,anchor[1]+(i%4<2?-1:1)*(16+Math.floor(i/4)*20)))]);
  const score=(p:P)=>labels.filter(l=>Math.abs(l.at[0]-p[0])<35&&Math.abs(l.at[1]-p[1])<16).length*10000+Math.hypot(p[0]-anchor[0],p[1]-anchor[1]);labels.push({text:raw.text,anchor,at:candidates.sort((a,b)=>score(a)-score(b))[0]});}
 const axes=([[1,0,0],[0,1,0],[0,0,1]] as Vec3[]).map((v,i)=>{const q=e.project(e.detail.points[0].map((n,k)=>n+v[k]) as Vec3);return {label:'XYZ'[i],from:[85,height-60] as P,to:[85+q[0]*38,height-60+q[1]*38] as P};});
 return {width,height,extra:extra.map(p=>at(e.project(p))),edges:e.edges.map(a=>a.map(at)),caps:e.caps.map(a=>a.map(at)),centerline:e.centerline.map(at),virtual:e.detail.points.map(p=>at(e.project(p))),labels,axes,total:Math.max(1,Math.ceil(e.detail.legs.length/6))};
}
