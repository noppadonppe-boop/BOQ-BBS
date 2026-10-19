import {z} from 'zod';
import type {Vec3} from './model';
import {barPlacementSchema,type BarPlacement} from './barPlacement';
import {pathPlaneAxes} from './planarPathInput';
const finite=z.number().finite(),angle=finite.min(-360).max(360),four=z.tuple([angle,angle,angle,angle]);
export const perimeterInputSchema=z.object({plane:z.enum(['XY','XZ','YZ']),start:z.tuple([finite,finite,finite]),endU:finite,endV:finite,countU:z.number().int().min(2).max(1000),countV:z.number().int().min(2).max(1000),edgeAngles:four,cornerAngles:four,stagger:finite,reference:z.string().trim().min(1).max(650)}).strict().superRefine((d,c)=>{const [u,v]=pathPlaneAxes[d.plane];if(d.endU<=d.start[u]||d.endV<=d.start[v])c.addIssue({code:'custom',message:'ปลายกรอบต้องมากกว่าจุดเริ่มทั้งสองแกน'});if(2*(d.countU+d.countV)-4>2000)c.addIssue({code:'custom',message:'รอบหน้าตัดรวมเกิน 2000 แท่ง'});if(d.cornerAngles[0]!==0)c.addIssue({code:'custom',message:'มุมกรอบจุดแรกต้องเป็น0 ใช้รูปแม่แบบกำหนดทิศของแท่งแรก'});});
export type PerimeterInput=z.infer<typeof perimeterInputSchema>;
export function perimeterPlacement(input:PerimeterInput):BarPlacement{
 const d=perimeterInputSchema.parse(input),[u,v,n]=pathPlaneAxes[d.plane],stations:{u:number;v:number;side:number;corner?:number}[]=[];
 for(let i=0;i<d.countU;i++)stations.push({u:d.start[u]+(d.endU-d.start[u])*i/(d.countU-1),v:d.start[v],side:0,...(i===0?{corner:0}:i===d.countU-1?{corner:1}:{})});
 for(let i=1;i<d.countV;i++)stations.push({u:d.endU,v:d.start[v]+(d.endV-d.start[v])*i/(d.countV-1),side:1,...(i===d.countV-1?{corner:2}:{})});
 for(let i=1;i<d.countU;i++)stations.push({u:d.endU-(d.endU-d.start[u])*i/(d.countU-1),v:d.endV,side:2,...(i===d.countU-1?{corner:3}:{})});
 for(let i=1;i<d.countV-1;i++)stations.push({u:d.start[u],v:d.endV-(d.endV-d.start[v])*i/(d.countV-1),side:3});
 const angles=(a:number[])=>a.join('/'),definition=`Rect ${d.plane}: ${'XYZ'[u]} ${d.start[u]}..${d.endU} (${d.countU}); ${'XYZ'[v]} ${d.start[v]}..${d.endV} (${d.countV}); ${'XYZ'[n]} ${d.start[n]}; alternate offset ${d.stagger}; edges ${angles(d.edgeAngles)}; corners ${angles(d.cornerAngles)} degrees. Corners once; input is not placement approval.`;
 return barPlacementSchema.parse({version:1,reference:d.reference+'\n'+definition,anchor:d.start,pivot:d.start,poses:stations.map((s,i)=>{const offset=[0,0,0] as Vec3,rotation=[0,0,0] as Vec3;offset[u]=s.u-d.start[u];offset[v]=s.v-d.start[v];offset[n]=i%2*d.stagger;rotation[n]=s.corner===undefined?d.edgeAngles[s.side]:d.cornerAngles[s.corner];return {id:'P'+String(i+1).padStart(4,'0'),offset,rotation};})});
}
