import type {Bar,Vec3} from './model';

// A is the outside transverse diameter. u/v define the circular plane and
// axis independently defines positive axial travel (both handednesses work).
export type HelixFrame={center:Vec3;u:Vec3;v:Vec3;axis:Vec3;pitch:number;turns:number};
export const HELIX_LIMITS={turns:1000,radius:1e8,segments:8192,totalStations:200000} as const;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,x,i)=>n+x*b[i],0);
export function helixErrors(b:Pick<Bar,'shape'|'helix'|'radius'|'diameter'|'outsideDiameter'>){
 const a=b.helix;if(b.shape!=='helix'||!a)return ['เกลียวต้องมีศูนย์กลาง ระนาบ แกน ระยะเกลียว และจำนวนรอบ'];
 if([...a.center,...a.u,...a.v,...a.axis,a.pitch,a.turns,b.radius,b.diameter,b.outsideDiameter??b.diameter].some(n=>!Number.isFinite(n)))return ['ข้อมูลเกลียวต้องเป็นตัวเลขที่มีขอบเขต'];
 const errors:string[]=[];
 if([a.u,a.v,a.axis].some(v=>Math.abs(Math.hypot(...v)-1)>1e-12)||[dot(a.u,a.v),dot(a.u,a.axis),dot(a.v,a.axis)].some(n=>Math.abs(n)>1e-12))errors.push('แกน u/v/axis ของเกลียวต้องยาวหนึ่งหน่วยและตั้งฉากกัน');
 if(a.pitch<=0)errors.push('ระยะเกลียว B ต้องเป็นค่าบวก');
 if(a.turns<=0||a.turns>HELIX_LIMITS.turns)errors.push(`จำนวนรอบต้องมากกว่า 0 และไม่เกิน ${HELIX_LIMITS.turns} รอบ (ขอบเขตแอป)`);
 if((b.outsideDiameter??b.diameter)<=0||b.diameter<=0)errors.push('ขนาดเหล็กต้องเป็นค่าบวก');
 if(b.radius<=(b.outsideDiameter??b.diameter)/2||b.radius>HELIX_LIMITS.radius)errors.push('รัศมีศูนย์กลางต้องมากกว่าครึ่งขนาดผิวนอกและไม่เกิน 100 km (ขอบเขตแอป)');
 if(!Number.isFinite(a.pitch*a.turns)||a.pitch*a.turns>1e9)errors.push('ความสูงเกลียวเกินขอบเขตแอป 1000 km');
 return errors;
}
export function helixPoint(a:HelixFrame,radius:number,t:number):Vec3{
 const angle=t*2*Math.PI;
 return a.center.map((n,i)=>n+radius*(a.u[i]*Math.cos(angle)+a.v[i]*Math.sin(angle))+a.axis[i]*a.pitch*t) as Vec3;
}
export function helixTangent(a:HelixFrame,radius:number,t:number):Vec3{
 const angle=t*2*Math.PI,v=a.u.map((n,i)=>radius*2*Math.PI*(-n*Math.sin(angle)+a.v[i]*Math.cos(angle))+a.axis[i]*a.pitch) as Vec3,scale=Math.hypot(...v);
 return v.map(n=>n/scale) as Vec3;
}
export function helixGeometry(b:Pick<Bar,'shape'|'helix'|'radius'|'diameter'|'outsideDiameter'|'count'>){
 const errors=helixErrors(b);if(errors.length)return {points:[] as Vec3[],length:0,height:0,sagitta:0,segments:0,errors};
 const a=b.helix!,length=a.turns*Math.hypot(2*Math.PI*b.radius,a.pitch),height=a.pitch*a.turns,maxAngle=2*Math.acos(Math.max(-1,Math.min(1,1-.1/b.radius)));
 if(!Number.isFinite(b.count)||b.count<1)return {points:[] as Vec3[],length,height,sagitta:0,segments:0,errors:['จำนวนเกลียวต่อชิ้นต้องเป็นค่าบวก']};
 // At least eight segments/turn avoids aliasing even when sampling is capped.
 const budget=Math.min(HELIX_LIMITS.segments,Math.floor(HELIX_LIMITS.totalStations/Math.max(1,b.count))-1),minimum=Math.max(2,Math.ceil(a.turns*8));
 if(budget<minimum)return {points:[] as Vec3[],length,height,sagitta:0,segments:0,errors:['จำนวนจุดแสดงเกลียวต่อ Mark เกินขอบเขต 200000 จุด ให้แบ่งชุดเหล็ก/Mark; ความยาววิเคราะห์ยังคงเดิม']};
 const segments=Math.min(budget,Math.max(minimum,Math.ceil(a.turns*2*Math.PI/Math.max(maxAngle,1e-8))));
 return {points:Array.from({length:segments+1},(_,i)=>helixPoint(a,b.radius,a.turns*i/segments)),length,height,sagitta:b.radius*(1-Math.cos(Math.PI*a.turns/segments)),segments,errors};
}
// For nonlocal points at least half a turn apart, the first possible adjacent
// turn is closest: later periods add axial distance. Find all stationary
// distances in [π, min(2π,total angle)] instead of assuming distance = pitch.
export function helixTurnSeparation(a:HelixFrame,radius:number){
 const end=Math.min(2*Math.PI,a.turns*2*Math.PI);if(end<Math.PI)return undefined;
 const rise=a.pitch/(2*Math.PI),derivative=(t:number)=>radius*radius*Math.sin(t)+rise*rise*t,angles=[Math.PI,end];
 for(let i=0;i<64;i++){
  let left=Math.PI+(end-Math.PI)*i/64,right=Math.PI+(end-Math.PI)*(i+1)/64,fl=derivative(left),fr=derivative(right);
  if(fl*fr>0)continue;
  for(let j=0;j<60;j++){const mid=(left+right)/2,f=derivative(mid);if(fl*f<=0){right=mid;fr=f;}else{left=mid;fl=f;}}
  angles.push((left+right)/2);
 }
 return Math.min(...angles.map(t=>Math.hypot(2*radius*Math.sin(t/2),rise*t)));
}
// Exact extrema of circular + linear coordinates; include partial final turns.
export function helixBounds(a:HelixFrame,radius:number){
 const angles=[0,a.turns*2*Math.PI],end=angles[1];
 for(let k=0;k<3;k++){
  const amplitude=radius*Math.hypot(a.u[k],a.v[k]),slope=a.axis[k]*a.pitch/(2*Math.PI);
  if(amplitude===0||Math.abs(slope)>amplitude)continue;
  const phase=Math.atan2(a.u[k],a.v[k]),t=Math.acos(Math.max(-1,Math.min(1,-slope/amplitude)));
  for(const branch of [t-phase,-t-phase])for(let cycle=Math.ceil(-branch/(2*Math.PI));cycle<=Math.floor((end-branch)/(2*Math.PI));cycle++){const angle=branch+cycle*2*Math.PI;if(angle>0&&angle<end)angles.push(angle);}
 }
 const points=angles.map(angle=>helixPoint(a,radius,angle/(2*Math.PI)));
 return {lo:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))) as Vec3,hi:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))) as Vec3};
}
export function helixAssessment(b:Bar){
 const geometry=helixGeometry(b);if(geometry.errors.length||!b.helix)return undefined;
 const outside=b.outsideDiameter??b.diameter,A=2*b.radius+outside,B=b.helix.pitch,C=b.helix.turns,approximateLength=C*Math.PI*(A-b.diameter),exactRequired=B>A/5;
 return {...geometry,A,B,C,approximateLength,exactLength:geometry.length,exactRequired,selectedLength:exactRequired?geometry.length:approximateLength,formula:exactRequired?'C × sqrt((2πRcentreline)² + B²)':'Cπ(A - d)',innerRadius:b.radius-outside/2,turnSeparation:helixTurnSeparation(b.helix,b.radius),handedness:dot([b.helix.u[1]*b.helix.v[2]-b.helix.u[2]*b.helix.v[1],b.helix.u[2]*b.helix.v[0]-b.helix.u[0]*b.helix.v[2],b.helix.u[0]*b.helix.v[1]-b.helix.u[1]*b.helix.v[0]],b.helix.axis)>0?'Right':'Left'};
}
