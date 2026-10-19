import type {Vec3} from './model';
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3)=>Math.hypot(...a);
export const OVAL_CLOSURE_PENDING='Code33: แนวฉายส่วนโค้งปิดปลายซ้อนกัน ต้องตรวจระนาบปิดปลายจริง การคืนมิติอิสระ C และการผลิตก่อนใช้ก่อสร้าง';

// Supplied Table1, printed p7/PDF p11; Note2 printed p8/PDF p12.
// Scheduling projection: three semicircles represented by paired tangent
// quarter arcs. The two right returns coincide deliberately. No invented lift,
// physical separation, material mapping or fabrication acceptance is inferred.
export function ovalLinkAssessment(points:Vec3[],outside:number,radius:number,nominal:number){
 if(points.length!==8||!points.every(p=>p.every(Number.isFinite))||![outside,radius,nominal].every(n=>Number.isFinite(n)&&n>0)||radius<=outside/2)return undefined;
 const lengths=points.slice(1).map((p,i)=>norm(sub(p,points[i])));if(lengths.some(v=>v<.001))return undefined;
 const u=points.slice(1).map((p,i)=>sub(p,points[i]).map(n=>n/lengths[i]) as Vec3),normal=cross(u[0],u[1]);
 if(u.slice(1).some((v,i)=>Math.abs(dot(u[i],v))>1e-7||dot(cross(u[i],v),normal)<.9999999)||u.some(v=>Math.abs(dot(normal,v))>1e-7))return undefined;
 if(norm(sub(points[1],points[5]))>1e-6||norm(sub(points[2],points[6]))>1e-6||Math.abs(lengths[2]-lengths[4])>1e-6)return undefined;
 if([1,3,5].some(i=>Math.abs(lengths[i]-2*radius)>1e-6))return undefined;
 const A=lengths[2]+outside,B=2*radius+outside,C=lengths[0]+outside/2,otherEnd=lengths[6]+outside/2,mainStraight=A-B,endStraight=C-B/2,otherEndStraight=otherEnd-B/2;
 if(mainStraight<=0||endStraight<=0||otherEndStraight<=0)return undefined;
 return {dimensions:[{label:'A',value:A,free:false},{label:'B',value:B,free:false},{label:'C',value:C,free:true}],
  formula:'2A + 3B + 17d',formulaLength:2*A+3*B+17*nominal,
  projectedLength:2*mainStraight+endStraight+otherEndStraight+3*Math.PI*radius,
  mainStraight,endStraight,otherEnd,otherEndStraight,centerlineRadius:radius,innerRadius:radius-outside/2,
  semicirclePairs:[[1,2],[3,4],[5,6]],coincidentCorners:[[1,5],[2,6]],closurePending:OVAL_CLOSURE_PENDING};
}
