import type {Vec3} from './model';
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((v,n,i)=>v+n*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3)=>Math.hypot(...a);
export const LINK_CLOSURE_PENDING='Code51: รูปนี้เป็นแนวฉายการปิดปลายที่ซ้อนกัน ต้องตรวจรายละเอียดปิดปลาย/ระนาบจริงและการผลิตก่อนใช้ก่อสร้าง';

// Supplied Table1 printed p8/PDF p12. Recognize the five-bend rectangular
// scheduling topology, not any bar whose code string happens to be51.
// The coincident closing corner is explicit. No invented physical offset/lift.
export function rectLinkAssessment(points:Vec3[],outside:number,radius:number,nominal:number){
 if(points.length!==7||!points.every(p=>p.every(Number.isFinite))||![outside,radius,nominal].every(n=>Number.isFinite(n)&&n>0)||radius<=outside/2)return undefined;
 const lengths=points.slice(1).map((p,i)=>norm(sub(p,points[i])));
 if(lengths.some(n=>n<.001))return undefined;
 const u=points.slice(1).map((p,i)=>sub(p,points[i]).map(n=>n/lengths[i]) as Vec3),n=cross(u[0],u[1]);
 if(u.slice(1).some((v,i)=>Math.abs(dot(u[i],v))>1e-7||dot(cross(u[i],v),n)<.9999999)||u.some(v=>Math.abs(dot(n,v))>1e-7))return undefined;
 if(dot(u[0],u[4])<.9999999||dot(u[1],u[5])<.9999999||dot(u[0],u[2])>-.9999999||dot(u[1],u[3])>-.9999999||norm(sub(points[1],points[5]))>1e-6)return undefined;
 const A=lengths[2]+outside,B=lengths[3]+outside,C=lengths[0]+outside/2,D=lengths[5]+outside/2;
 if(Math.abs(lengths[2]-lengths[4])>1e-6||Math.abs(lengths[1]-lengths[3])>1e-6)return undefined;
 const equalEnds=Math.abs(C-D)<=1e-6,innerRadius=radius-outside/2;
 return {dimensions:[{label:'A',value:A,free:false},{label:'B',value:B,free:false},{label:'C',value:C,free:false},{label:'D',value:D,free:true}],equalEnds,
  formula:'2(A + B + C) - 2.5r - 5d',formulaLength:equalEnds?2*(A+B+C)-2.5*innerRadius-5*nominal:undefined,
  projectedLength:lengths.reduce((s,v)=>s+v,0)-5*radius*(2-Math.PI/2),
  endStraights:[lengths[0]-radius,lengths[5]-radius],betweenStraights:lengths.slice(1,-1).map(v=>v-2*radius),
  closingCorner:points[1],closurePending:LINK_CLOSURE_PENDING,
 };
}
