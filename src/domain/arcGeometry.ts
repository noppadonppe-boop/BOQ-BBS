import type {Bar,Vec3} from './model';

export type ArcFrame={center:Vec3;u:Vec3;v:Vec3;sweepDegrees:number};
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,x,i)=>n+x*b[i],0);
export const arcNormal=(a:ArcFrame):Vec3=>[a.u[1]*a.v[2]-a.u[2]*a.v[1],a.u[2]*a.v[0]-a.u[0]*a.v[2],a.u[0]*a.v[1]-a.u[1]*a.v[0]];
export function arcErrors(b:Pick<Bar,'shape'|'curve'|'radius'|'diameter'|'outsideDiameter'>){
 const a=b.curve,errors:string[]=[];
 if(b.shape!=='arc'||!a)return ['ส่วนโค้งต้องมีศูนย์กลาง ระนาบ และมุมกวาด'];
 if([...a.center,...a.u,...a.v,a.sweepDegrees,b.radius,b.diameter,b.outsideDiameter??b.diameter].some(n=>!Number.isFinite(n)))return ['ข้อมูลส่วนโค้งต้องเป็นตัวเลขที่มีขอบเขต'];
 if(Math.abs(Math.hypot(...a.u)-1)>1e-12||Math.abs(Math.hypot(...a.v)-1)>1e-12||Math.abs(dot(a.u,a.v))>1e-12)errors.push('แกน u/v ของส่วนโค้งต้องยาวหนึ่งหน่วยและตั้งฉากกัน');
 if(a.sweepDegrees<=0||a.sweepDegrees>360)errors.push('มุมกวาดของส่วนโค้งต้องมากกว่า 0 และไม่เกิน 360°');
 if((b.outsideDiameter??b.diameter)<=0)errors.push('ขนาดผิวนอกต้องเป็นค่าบวก');
 if(b.radius<=(b.outsideDiameter??b.diameter)/2||b.radius>1e8)errors.push('รัศมีศูนย์กลางต้องมากกว่าครึ่งขนาดผิวนอกและไม่เกิน 100 km');
 return errors;
}
export function arcPoint(a:ArcFrame,radius:number,angle:number):Vec3{
 return a.center.map((n,i)=>n+radius*(a.u[i]*Math.cos(angle)+a.v[i]*Math.sin(angle))) as Vec3;
}
// Sampling is for display/placement only. Quantity always uses the analytic arc.
// A disclosed sagitta bound is added to cover checks, including capped sampling.
export function arcGeometry(b:Pick<Bar,'shape'|'curve'|'radius'|'diameter'|'outsideDiameter'>){
 const errors=arcErrors(b);
 if(errors.length)return {points:[] as Vec3[],length:0,sagitta:0,segments:0,errors};
 const a=b.curve!,sweep=a.sweepDegrees*Math.PI/180;
 const maxAngle=2*Math.acos(Math.max(-1,Math.min(1,1-.1/b.radius)));
 const segments=Math.min(720,Math.max(2,Math.ceil(sweep/Math.max(maxAngle,1e-8))));
 return {points:Array.from({length:segments+1},(_,i)=>arcPoint(a,b.radius,sweep*i/segments)),length:b.radius*sweep,sagitta:b.radius*(1-Math.cos(sweep/(2*segments))),segments,errors};
}
export function arcBounds(a:ArcFrame,radius:number){
 const sweep=a.sweepDegrees*Math.PI/180,angles=[0,sweep];
 for(let k=0;k<3;k++){
  const t=Math.atan2(a.v[k],a.u[k]);
  for(let i=-2;i<=3;i++){const at=t+i*Math.PI;if(at>0&&at<sweep)angles.push(at);}
 }
 const points=angles.map(t=>arcPoint(a,radius,t));
 return {lo:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))) as Vec3,hi:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))) as Vec3};
}

// Table 5, printed p.13 (PDF p.17), in mm. This is a SUPPLY instruction,
// not a lower radius limit, bend deduction, or engineer approval.
const barLimits:Record<number,number>={6:2500,8:2750,10:3500,12:4250,16:7500,20:14000,25:30000,32:43000,40:58000};
const wireLimits:Record<number,number>={5:2400,6:2500,7:2600,8:2750,9:3000,10:3500,11:4250,12:7500};
export function arcSupply(type:string|undefined,diameter:number,innerRadius:number){
 const limit=['R','T','B','S'].includes(type||'')?barLimits[diameter]:['F','D','W'].includes(type||'')?wireLimits[diameter]:undefined;
 return {limit,method:limit===undefined?'Unspecified':innerRadius>limit?'Supply straight / form during placing':'Preformed radius required'} as const;
}
