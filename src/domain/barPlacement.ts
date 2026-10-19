import {z} from 'zod';
import type {Bar,Spec,Vec3} from './model';

export const BAR_PLACEMENT_POLICY='bar-placement-1.0';
const vector=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
const poseSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),offset:vector,rotation:vector}).strict();
export const barPlacementSchema=z.object({version:z.literal(1),reference:z.string().trim().min(1,'ระบุแบบหรือเหตุผลของตำแหน่งรายแท่ง').max(1000),anchor:vector,pivot:vector,poses:z.array(poseSchema).min(1).max(2000)}).strict().superRefine((layout,ctx)=>{
 if(new Set(layout.poses.map(p=>p.id)).size!==layout.poses.length)ctx.addIssue({code:'custom',path:['poses'],message:'รหัสตำแหน่งรายแท่งซ้ำ'});
 const first=layout.poses[0];if(first.offset.some(v=>v!==0)||matrix(first.rotation).some((v,i)=>Math.abs(v-(i%4===0?1:0))>1e-10))ctx.addIssue({code:'custom',path:['poses',0],message:'แท่งแรกต้องมี offset และมุมหมุนเป็นศูนย์ ใช้ anchor กำหนดตำแหน่งแม่แบบ'});
 const keys=layout.poses.map(p=>JSON.stringify([...p.offset,...matrix(p.rotation).map(v=>Number(v.toFixed(10)))]));
 if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',path:['poses'],message:'ตำแหน่งและทิศทางรายแท่งซ้ำ'});
});
export type BarPlacement=z.infer<typeof barPlacementSchema>;
export type BarPose=z.infer<typeof poseSchema>;

// Active rotations about the member's fixed axes, X then Y then Z. All lengths
// are mm; target-solid origins have already been applied before this transform.
export function matrix(angles:Vec3){
 const [x,y,z]=angles.map(a=>a%360*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];
}
export function posePoint(point:Vec3,pivot:Vec3,pose:BarPose):Vec3{
 const r=matrix(pose.rotation),v=point.map((n,i)=>n-pivot[i]);
 return pivot.map((n,i)=>n+pose.offset[i]+r[i*3]*v[0]+r[i*3+1]*v[1]+r[i*3+2]*v[2]) as Vec3;
}
export function placeTemplate(template:Vec3[],layout:BarPlacement):Vec3[][]{
 if(!template.length)return [];
 const shift=layout.anchor.map((n,i)=>n-template[0][i]),base=template.map(p=>p.map((n,i)=>n+shift[i]) as Vec3);
 return layout.poses.map(pose=>base.map(point=>posePoint(point,layout.pivot,pose)));
}
export function placementProblems(bar:Bar,spec:Spec){
 if(!bar.placementLayout)return [];
 const errors:string[]=[];
 if(spec.barPlacementPolicy!==BAR_PLACEMENT_POLICY)errors.push('เปิดการวางรายแท่งใน General Spec ก่อนใช้ข้อมูลตำแหน่งรายแท่ง');
 if(bar.count!==bar.placementLayout.poses.length)errors.push('จำนวนต่อชิ้นต้องเท่ากับจำนวนตำแหน่งรายแท่ง');
 return errors;
}
export function seedPlacement(paths:Vec3[][],reference:string):BarPlacement{
 if(!paths.length||!paths[0].length)throw Error('สร้างรูปแม่แบบก่อนกำหนดตำแหน่ง');
 const anchor=[...paths[0][0]] as Vec3,pivot=[0,1,2].map(i=>(Math.min(...paths[0].map(p=>p[i]))+Math.max(...paths[0].map(p=>p[i])))/2) as Vec3;
 return {version:1,reference,anchor,pivot,poses:paths.map((p,i)=>({id:'P'+String(i+1).padStart(4,'0'),offset:p[0].map((n,j)=>n-anchor[j]) as Vec3,rotation:[0,0,0]}))};
}
export function parsePoseText(text:string):BarPose[]{
 return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map((line,i)=>{
  const cells=line.split(/[\t,]/).map(v=>v.trim());if(cells.length!==7||cells.slice(1).some(v=>v===''||!Number.isFinite(Number(v))))throw Error(`แถว ${i+1}: ระบุ ID และตัวเลข offset X/Y/Z, มุม X/Y/Z รวม 7 ช่อง`);
  return poseSchema.parse({id:cells[0],offset:cells.slice(1,4).map(Number),rotation:cells.slice(4,7).map(Number)});
 });
}
export function poseText(poses:BarPose[]){return poses.map(p=>[p.id,...p.offset,...p.rotation].join(', ')).join('\n');}
export function placementRange(axis:'X'|'Y'|'Z',start:number,end:number,spacing:number,offset:Vec3,rotation:Vec3,existing:BarPose[]):BarPose[]{
 if(![start,end,spacing,...offset,...rotation].every(Number.isFinite)||spacing<=0||end<start)throw Error('ระบุช่วงและระยะห่างที่ถูกต้อง');
 const intervals=(end-start)/spacing;if(Math.abs(intervals-Math.round(intervals))>1e-7)throw Error('ปลายช่วงต้องตรงกับระยะห่างที่กรอก');
 const count=Math.round(intervals)+1;if(existing.length+count>2000)throw Error('เกิน 2,000 ตำแหน่งต่อ Mark');
 const taken=new Set(existing.map(p=>p.id));let n=1;
 return Array.from({length:count},(_,i)=>{let id:string;do{id='P'+String(n++).padStart(4,'0');}while(taken.has(id));taken.add(id);const at=[...offset] as Vec3;at[{X:0,Y:1,Z:2}[axis]]=start+i*spacing;return {id,offset:at,rotation:[...rotation] as Vec3};});
}
export function coincidentPaths(paths:Vec3[][]){
 const keys=paths.map(path=>{
  const points=path.map(p=>p.map(n=>Number(n.toFixed(6))).join(','));
  return points.slice(1).map((p,i)=>[points[i],p].sort().join(';')).sort().join('|');
 });
 return new Set(keys).size!==keys.length;
}
