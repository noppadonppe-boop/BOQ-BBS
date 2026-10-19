import type {Bar,Member} from './model';
import {planarBar} from './generalBar';
import {supportExtension} from './planarPathInput';

type P=[number,number];
const add=(a:P,b:P,k=1):P=>[a[0]+b[0]*k,a[1]+b[1]*k];
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1];
const normal=(a:P):P=>[-a[1],a[0]];
const unit=(a:P):P=>a.map(v=>v/Math.hypot(...a)) as P;

// Explicit authoring convention only. Legacy Code99 drawings retain their adapters.
// At an acute internal bend, the two dimensions use DIFFERENT circle supports.
export function supportBar(member:Member,bar:Bar){
 const raw=planarBar(member,bar,true);if(!raw.available)return raw;
 // Draw in the declared input plane BEFORE template/placement rotations.
 // planarBar's legacy frame aligns X with the first leg and chooses its plane
 // handedness from the first bend; restore the user's signed input convention.
 const firstTurn=bar.pathInput?.legs.find(l=>Math.abs(l.turn)>1e-5)?.turn||1;
 const mirror=Math.sign(firstTurn),a=-(bar.pathInput?.startAngle||0)*Math.PI/180;
 const draw=(p:P):P=>[p[0]*Math.cos(a)-mirror*p[1]*Math.sin(a),p[0]*Math.sin(a)+mirror*p[1]*Math.cos(a)];
 const e={...raw,points:raw.points.map(draw),left:raw.left.map(draw),right:raw.right.map(draw),outline:raw.outline.map(draw),centerline:raw.centerline.map(draw),centers:raw.centers.map(c=>c?draw(c):undefined),signs:raw.signs.map(s=>s*mirror)};
 const half=e.outsideDiameter/2,outer=bar.radius+half;
 const dirs=e.points.slice(1).map((p,i)=>unit(sub(p,e.points[i])));
 const dimensions=e.detail.legs.map((leg,i)=>{
  const u=dirs[i],a=supportExtension(e.angles[i],bar.radius,half),b=supportExtension(e.angles[i+1],bar.radius,half);
  const from=add(add(e.points[i],u,-a),normal(u),i?-e.signs[i]*half:0);
  const to=add(add(e.points[i+1],u,b),normal(u),i<dirs.length-1?-e.signs[i+1]*half:0);
  return {label:leg.label,value:dot(sub(to,from),u),from,to,u,free:bar.freeDimensionLeg===i+1};
 });
 if(dimensions.some(d=>!Number.isFinite(d.value)||d.value<=.001))return {available:false as const,detail:e.detail,reason:'มิติเส้นสัมผัสไม่เป็นบวก ตรวจช่วง มุม และรัศมี'};
 const tangents=e.centers.flatMap((center,i)=>{
  if(!center||e.angles[i]<=Math.PI/2+1e-7)return [];
  return [
   {label:`T${String(i).padStart(2,'0')}i`,axis:dirs[i-1],touch:add(center,dirs[i-1],outer)},
   {label:`T${String(i).padStart(2,'0')}o`,axis:dirs[i],touch:add(center,dirs[i],-outer)}
  ].map(({label,axis,touch})=>{
   const n=normal(axis),v=[...e.outline,...dimensions.flatMap(d=>[d.from,d.to])].map(p=>dot(sub(p,touch),n));
   const lo=Math.min(...v),hi=Math.max(...v),margin=Math.max(8,(hi-lo)*.05);
   return {label,touch,from:add(touch,n,lo-margin),to:add(touch,n,hi+margin)};
  });
 });
 const i=e.centers.findIndex((c,i)=>!!c&&e.angles[i]>Math.PI/2+1e-7),center=e.centers[Math.max(1,i)]||e.points[0];
 const u=dirs[Math.max(0,i-1)],theta=e.angles[Math.max(1,i)]||0,sign=e.signs[Math.max(1,i)]||1;
 const start=Math.atan2(-sign*normal(u)[1],-sign*normal(u)[0]),mid=start+sign*theta/2;
 return {...e,chain:true as const,dimensions,tangents,internalAngle:undefined,
  radius:{center,surface:add(center,[Math.cos(mid),Math.sin(mid)],e.innerRadius),text:`r = ${Number(e.innerRadius.toFixed(3))} (all bends)`},
  warnings:[...e.warnings,'ฐานที่เลือก: มุมภายในแหลมวัดถึงเส้นสัมผัสวงโค้งของแต่ละช่วง มุมอื่นวัดถึงจุดตัดเส้นต่อผิวนอก','เป็นการสร้างรูปตามฐานที่ผู้ใช้ระบุ ยังไม่รับรองว่าฐานตรงแบบต้นทางหรือผ่าน BS/การผลิต']};
}
