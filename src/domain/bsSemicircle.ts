import type {Vec3} from './model';

const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Supplied BS 8666:2000 Table 1, printed p.6 (PDF p.10), code 13.
// Two tangent quarter arcs share ONE centre: the middle virtual leg is 2R,
// with no intervening straight. Never classify a generic U by its code alone.
export function semicircleAssessment(points:Vec3[],outside:number,radius:number,nominal:number){
 if(points.length!==4||!Number.isFinite(radius)||radius<=outside/2)return undefined;
 const legs=points.slice(1).map((p,i)=>sub(p,points[i])),lengths=legs.map(v=>Math.hypot(...v));
 if(lengths.some(v=>!Number.isFinite(v)||v<=.001)||Math.abs(lengths[1]-2*radius)>.000001)return undefined;
 const u=legs.map((v,i)=>v.map(n=>n/lengths[i]) as Vec3),n1=cross(u[0],u[1]),n2=cross(u[1],u[2]);
 if(Math.abs(dot(u[0],u[1]))>1e-7||Math.abs(dot(u[1],u[2]))>1e-7||dot(u[0],u[2])>-.9999999||dot(n1,n2)<.9999999)return undefined;
 const [A,B,C]=[lengths[0]+outside/2,lengths[1]+outside,lengths[2]+outside/2];
 const straightLengths=[A-B/2,C-B/2];
 if(straightLengths.some(v=>v<=0))return undefined;
 return {
  dimensions:[{label:'A',value:A,free:false},{label:'B',value:B,free:false},{label:'C',value:C,free:true}],
  formula:'A + 0.57B + (C) - 1.57d',formulaLength:A+.57*B+C-1.57*nominal,
  exactLength:straightLengths[0]+straightLengths[1]+Math.PI*radius,
  straightLengths,centerlineRadius:radius,innerRadius:radius-outside/2,
 };
}
