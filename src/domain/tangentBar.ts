import type {Bar,Member} from './model';
import {supportBar} from './supportBar';
import {barDetail} from './barDetails';
import {generalBar,generalSketch,planarBar} from './generalBar';
export const TANGENT_LAYOUT='tangent-v5' as const;
type P=[number,number];
const add=(a:P,b:P,k=1):P=>[a[0]+b[0]*k,a[1]+b[1]*k];
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1];
const normal=(a:P):P=>[-a[1],a[0]];
const unit=(a:P):P=>a.map(v=>v/Math.hypot(...a)) as P;
export const hasAcuteBend=(member:Member,bar:Bar)=>!['arc','helix'].includes(bar.shape)&&bar.shapeCode.trim()==='99'&&barDetail(member,bar).bends.some(b=>b.angle>90.00001);
export function tangentBar(member:Member,bar:Bar){
 if(bar.pathInput?.basis==='support')return supportBar(member,bar);
 const detail=barDetail(member,bar),fail=(reason:string)=>({available:false as const,reason,detail});
 if(['arc','helix'].includes(bar.shape))return fail('ส่วนโค้งต่อเนื่องไม่ใช่มุมภายในแหลมของ Figure4');
 if(bar.shapeCode.trim()!=='99')return fail('แบบเส้นสัมผัสใช้กับ Code 99 เท่านั้น');
 if(detail.points.length!==3||detail.bends.length!==1)return fail('Figure 4 รุ่นนี้รองรับมุมภายในแหลมหนึ่งจุดและสองช่วงเท่านั้น');
 const theta=detail.bends[0].angle*Math.PI/180;
 if(theta<=Math.PI/2+1e-7||theta>=Math.PI-1e-5)return fail('ต้องมีมุมเปลี่ยนแนวมากกว่า 90° และน้อยกว่า 180°');
 const e=planarBar(member,bar,true);if(!e.available)return e;
 const [p0,p1,p2]=e.points,u=unit(sub(p1,p0)),v=unit(sub(p2,p1)),o=e.centers[1]!,half=e.outsideDiameter/2,ro=bar.radius+half,side=-e.signs[1];
 // Each leg has its own supporting tangent, normal to that leg. Using the
 // incoming tangent for BOTH dimensions would overstate the inclined A span.
 const tc=add(o,u,ro),ta=add(o,v,-ro),start=add(p0,normal(u),side*half),end=add(p2,normal(v),side*half);
 const cEnd=add(start,u,dot(sub(tc,start),u)),aStart=add(end,v,dot(sub(ta,end),v));
 const n=normal(u),low=e.outline.reduce((a,p)=>dot(p,n)<dot(a,n)?p:a),high=e.outline.reduce((a,p)=>dot(p,n)>dot(a,n)?p:a);
 const dimensions=[
  {label:'C',value:dot(sub(cEnd,start),u),from:start,to:cEnd,u,free:bar.freeDimensionLeg===1},
  {label:'A',value:dot(sub(end,aStart),v),from:aStart,to:end,u:v,free:bar.freeDimensionLeg===2},
  {label:'B',value:dot(sub(high,low),n),from:low,to:high,u:n,free:false}
 ];
 if(dimensions.some(d=>!Number.isFinite(d.value)||d.value<=0))return fail('มิติจากเส้นสัมผัสไม่เป็นบวก ต้องแก้รูปและตรวจรัศมี');
 const line=(t:P,axis:P)=>{const nn=normal(axis),values=[...e.outline,...dimensions.flatMap(d=>[d.from,d.to])].map(p=>dot(sub(p,t),nn)),lo=Math.min(...values),hi=Math.max(...values),margin=Math.max(8,(hi-lo)*.05);return {from:add(t,nn,lo-margin),to:add(t,nn,hi+margin),touch:t};};
 const startAngle=Math.atan2(-e.signs[1]*normal(u)[1],-e.signs[1]*normal(u)[0]),mid=startAngle+e.signs[1]*theta/2;
 const innerPoint=add(o,[Math.cos(mid),Math.sin(mid)],e.innerRadius);
 return {...e,dimensions,tangents:[{label:'TC',...line(tc,u)},{label:'TA',...line(ta,v)}],radius:{center:o,surface:innerPoint,text:`R = ${Number(e.innerRadius.toFixed(3))} (inside)`},internalAngle:180-detail.bends[0].angle,
  warnings:[...e.warnings,'Figure 4: มุมแหลมหนึ่งจุด / A,C ใช้เส้นสัมผัสคนละแนว / B คือความสูงผิวนอก','ยังไม่ย้ายปลายเพื่อชดเชย tolerance หรือยาวตัดที่ปัดขึ้น']};
}
export type TangentBar=Extract<ReturnType<typeof tangentBar>,{available:true}>;
export function tangentSketch(e:TangentBar,width=760,height=440,part=0){
 const s=generalSketch(e,part,width,height),p=s.point;
 const tangents=e.tangents.map(t=>({...t,from:p(t.from),to:p(t.to),touch:p(t.touch)}));
 const all=[...s.outline,...tangents.flatMap(t=>[t.from,t.to]),...s.dimensions.flatMap(d=>[d.a,d.b,[d.labelAt[0]-80,d.labelAt[1]-12] as P,[d.labelAt[0]+80,d.labelAt[1]+12] as P])];
 const lo=[0,1].map(i=>Math.min(...all.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...all.map(p=>p[i]))),scale=Math.min(1,(width-40)/(hi[0]-lo[0]),(height-100)/(hi[1]-lo[1]));
 const move=(p:P):P=>[width/2+(p[0]-(lo[0]+hi[0])/2)*scale,(height+40)/2+(p[1]-(lo[1]+hi[1])/2)*scale];
 return {...s,outline:s.outline.map(move),centerline:s.centerline.map(move),vertices:s.vertices.map(v=>({...v,at:move(v.at)})),dimensions:s.dimensions.map(d=>({...d,from:move(d.from),to:move(d.to),a:move(d.a),b:move(d.b),labelAt:move(d.labelAt)})),tangents:tangents.map((t,i)=>{const touch=move(t.touch);return {...t,from:move(t.from),to:move(t.to),touch,labelAt:[Math.min(width-65,touch[0]+40),Math.max(60,Math.min(height-25,touch[1]+(i===0?-20:25)))] as P};}),radius:{...e.radius,center:move(p(e.radius.center)),surface:move(p(e.radius.surface)),labelAt:[width-185,30] as P}};
}
export function specialBar(member:Member,bar:Bar){return bar.pathInput?.basis==='support'||hasAcuteBend(member,bar)?tangentBar(member,bar):generalBar(member,bar);}
