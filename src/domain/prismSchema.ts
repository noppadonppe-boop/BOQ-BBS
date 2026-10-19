import {z} from 'zod';
import {CIRCULAR_PRISM_POLICY,circularProfileSchema,circleVertices} from './circularProfile';

export const PRISM_POLICY='concrete-prism-1.0' as const;
export const INCLINED_PRISM_POLICY='concrete-prism-2.0' as const;
export const TAPERED_PRISM_POLICY='concrete-prism-3.0' as const;
export const supportsPrismPolicy=(policy:unknown,version:1|2|3|4)=>[1,2,3,4].includes(version)&&(policy===CIRCULAR_PRISM_POLICY||version===3&&policy===TAPERED_PRISM_POLICY||version===2&&(policy===INCLINED_PRISM_POLICY||policy===TAPERED_PRISM_POLICY)||version===1&&[PRISM_POLICY,INCLINED_PRISM_POLICY,TAPERED_PRISM_POLICY].includes(policy as typeof PRISM_POLICY));
export type Point2=[number,number];
const EPS=1e-6;
export const signedArea=(p:Point2[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
const cross=(a:Point2,b:Point2,c:Point2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function onEdge(p:Point2,a:Point2,b:Point2){const length=Math.hypot(b[0]-a[0],b[1]-a[1]);return Math.abs(cross(a,b,p))<=EPS*Math.max(1,length)&&p.every((v,i)=>v>=Math.min(a[i],b[i])-EPS&&v<=Math.max(a[i],b[i])+EPS);}
export function inPolygon(p:Point2,loop:Point2[],boundary=true){
 let inside=false;
 for(let i=0,j=loop.length-1;i<loop.length;j=i++){
  const a=loop[j],b=loop[i];if(onEdge(p,a,b))return boundary;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function intersects(a:Point2,b:Point2,c:Point2,d:Point2){return onEdge(a,c,d)||onEdge(b,c,d)||onEdge(c,a,b)||onEdge(d,a,b)||(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0);}
const point=z.tuple([z.number().finite().min(0).max(200000),z.number().finite().min(0).max(200000)]);
const loop=z.object({vertices:z.array(point).min(3).max(64),formed:z.array(z.boolean()).min(3).max(64)}).strict();
const prismFields={
 axis:z.enum(['X','Y','Z']),start:z.number().finite().min(0).max(200000),depth:z.number().finite().positive().max(200000),
 profile:loop,holes:z.array(loop.extend({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label:z.string().trim().min(1).max(80)})).max(12),
 endFaces:z.tuple([z.boolean(),z.boolean()]),basis:z.string().trim().min(1).max(500),
};
const prismV1=z.object({version:z.literal(1),...prismFields}).strict();
const offset=z.number().finite().min(-200000).max(200000);
const prismV2=z.object({version:z.literal(2),...prismFields,endOffset:z.tuple([offset,offset])}).strict();
const scale=z.number().finite().min(.001).max(1000);
const prismV3=z.object({version:z.literal(3),...prismFields,endOffset:z.tuple([offset,offset]),endScale:z.tuple([scale,scale])}).strict();
const prismV4=z.object({version:z.literal(4),...prismFields,circle:circularProfileSchema}).strict();
export const prismGeometrySchema=z.discriminatedUnion('version',[prismV1,prismV2,prismV3,prismV4]).superRefine((p,c)=>{
 const fail=(message:string,path:(string|number)[]=[])=>c.addIssue({code:'custom',message,path});
 if(p.start+p.depth>200000)fail('ปลายรูปทรงเกิน 200,000 mm',['depth']);
 if(p.version===2)for(let a=0;a<2;a++)if(Math.max(...p.profile.vertices.map(v=>v[a]))+Math.abs(p.endOffset[a])>200000)fail('กรอบสมาชิกหลังเลื่อนปลายเกิน 200,000 mm',['endOffset',a]);
 const loops=[p.profile,...p.holes];if(loops.reduce((s,l)=>s+l.vertices.length,0)>256)fail('รวมจุดหน้าตัดและช่องเปิดเกิน 256 จุด');
 if(p.version===4){
  const expected=[circleVertices(p.circle.outerRadius,p.circle.outerRadius),...(p.circle.innerRadius?[circleVertices(p.circle.innerRadius,p.circle.outerRadius)]:[])];
  if(loops.length!==expected.length)fail('ช่องเปิดวงกลมต้องตรงกับรัศมีที่ระบุ');
  loops.forEach((l,k)=>{const points=expected[k];if(!points||l.vertices.length!==points.length||l.vertices.some((v,i)=>v.some((n,a)=>Math.abs(n-points[i]?.[a])>1e-6)))fail('แนวแสดงผลวงกลมไม่ตรงกับรัศมี สร้างหน้าตัดวงกลมใหม่');if(l.formed.some(v=>v!==l.formed[0]))fail('หน้าตัดวงกลมเลือกแบบหล่อตลอดผิวแต่ละวง ไม่เลือกเฉพาะช่วงด้วยขอบ polygon');});
 }
 if(p.version===3){
  // Positive affine scales preserve every simple loop, hole and separation
  // throughout the run. Only planar side faces are supported; do not invent a
  // triangulation for a warped quadrilateral.
  for(let a=0;a<2;a++){
   const max=Math.max(...p.profile.vertices.map(v=>v[a])),anchor=Math.max(0,-p.endOffset[a]);
   if(Math.max(max,max*p.endScale[a]+p.endOffset[a])+anchor>200000)fail('กรอบสมาชิกหลังเปลี่ยนหน้าตัดเกิน 200,000 mm',['endScale',a]);
  }
  loops.forEach((l,k)=>{
   const path=k?['holes',k-1]:['profile'];
   if(Math.abs(signedArea(l.vertices))*p.endScale[0]*p.endScale[1]<1)fail('พื้นที่หน้าตัดปลายต้องไม่น้อยกว่า 1 mm²',path);
   l.vertices.forEach((a,i)=>{const b=l.vertices[(i+1)%l.vertices.length],du=b[0]-a[0],dv=b[1]-a[1],startLength=Math.hypot(du,dv),endLength=Math.hypot(du*p.endScale[0],dv*p.endScale[1]);if(Math.abs(du*dv*(p.endScale[1]-p.endScale[0]))>1e-10*startLength*endLength)fail('ผิวด้านข้างบิด: ขอบเฉียงต้องใช้สัดส่วนปลายเท่ากันทั้งสองแกน หรือใช้หน้าตัดขอบขนานแกน',path);});
  });
 }
 if(new Set(p.holes.map(h=>h.id)).size!==p.holes.length)fail('รหัสช่องเปิดหลายเหลี่ยมซ้ำ');
 loops.forEach((l,k)=>{
  const path=k?['holes',k-1]:['profile'],v=l.vertices;
  if(l.formed.length!==v.length)fail('จำนวนผิวแบบหล่อต้องเท่ากับจำนวนขอบ',path);
  if(Math.abs(signedArea(v))<1)fail('พื้นที่หน้าตัดต้องไม่น้อยกว่า 1 mm²',path);
  for(let i=0;i<v.length;i++){
   const a=v[i],b=v[(i+1)%v.length],before=v[(i+v.length-1)%v.length];
   if(Math.hypot(b[0]-a[0],b[1]-a[1])<.001)fail('จุดติดกันซ้ำหรือใกล้กันเกินไป ไม่ต้องกรอกจุดแรกซ้ำท้ายรายการ',path);
   if(Math.abs(cross(before,a,b))<=EPS*Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1])))fail('เอาจุดกลางขอบเส้นตรงออกก่อน',path);
   for(let j=i+1;j<v.length;j++)if(j!==i+1&&!(i===0&&j===v.length-1)&&intersects(a,b,v[j],v[(j+1)%v.length]))fail('ขอบหน้าตัดตัดกันหรือแตะกันเอง',path);
  }
 });
 for(let a=0;a<2;a++)if(Math.abs(Math.min(...p.profile.vertices.map(v=>v[a])))>EPS)fail('หน้าตัดภายนอกต้องเริ่มที่พิกัดต่ำสุด 0 ในทั้งสองแกน',['profile']);
 for(let k=0;k<p.holes.length;k++){
  const h=p.holes[k].vertices;
  if(h.some(v=>!inPolygon(v,p.profile.vertices,false)))fail('ช่องเปิดต้องอยู่ภายในหน้าตัดและไม่แตะขอบ',['holes',k]);
  for(const other of [p.profile,...p.holes.slice(0,k)]){
   const v=other.vertices;
   if(h.some((a,i)=>v.some((b,j)=>intersects(a,h[(i+1)%h.length],b,v[(j+1)%v.length]))))fail('ช่องเปิดตัดหรือแตะขอบอื่น',['holes',k]);
  }
  for(const other of p.holes.slice(0,k))if(inPolygon(h[0],other.vertices)||inPolygon(other.vertices[0],h))fail('ช่องเปิดซ้อนกันหรืออยู่ภายในช่องเปิดอื่น',['holes',k]);
 }
});
export type PrismGeometry=z.infer<typeof prismGeometrySchema>;
