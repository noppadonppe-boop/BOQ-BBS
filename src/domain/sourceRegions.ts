import {z} from 'zod';
import type {Attachment,Member,SnapshotBundle} from './model';
import type {SourceScheduleRow} from './sourceSchedule';

export const sourceShapeReferenceSchema=z.object({
 sha256:z.string().regex(/^[a-f0-9]{64}$/),
 page:z.number().int().min(1).max(9999),
 rect:z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),width:z.number().finite().min(.001).max(1),height:z.number().finite().min(.001).max(1)}).strict(),
}).strict().superRefine((r,c)=>{
 if(r.rect.x+r.rect.width>1+1e-9||r.rect.y+r.rect.height>1+1e-9)c.addIssue({code:'custom',path:['rect'],message:'กรอบรูปต้นทางต้องอยู่ในหน้าที่แสดงทั้งหมด'});
});
export type SourceShapeReference=z.infer<typeof sourceShapeReferenceSchema>;
export function regionFromCorners(sha256:string,page:number,a:number[],b:number[]):SourceShapeReference{
 return sourceShapeReferenceSchema.parse({sha256,page,rect:{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])}});
}
// Coordinates refer to the visible, rotated page. PDF.js renders the rotation;
// applying an additional inverse PDF transform here would select a wrong region.
export function regionPixels(reference:SourceShapeReference,width:number,height:number){
 const r=sourceShapeReferenceSchema.parse(reference).rect;
 if(![width,height].every(v=>Number.isInteger(v)&&v>0))throw Error('ขนาดภาพหน้าต้นทางไม่ถูกต้อง');
 const x=Math.floor(r.x*width),y=Math.floor(r.y*height),right=Math.min(width,Math.ceil((r.x+r.width)*width)),bottom=Math.min(height,Math.ceil((r.y+r.height)*height));
 if(right<=x||bottom<=y)throw Error('กรอบรูปต้นทางไม่มีพื้นที่แสดง');
 return {x,y,width:right-x,height:bottom-y};
}
export function referenceText(r:SourceShapeReference){
 return 'page '+r.page+' / visible page %: left '+(r.rect.x*100).toFixed(4)+', top '+(r.rect.y*100).toFixed(4)+', width '+(r.rect.width*100).toFixed(4)+', height '+(r.rect.height*100).toFixed(4)+' / SHA256 '+r.sha256;
}
export type SourceRegionPlan={member:Member;attachment:Attachment;row:SourceScheduleRow;reference:SourceShapeReference};
export function sourceRegionPlans(bundle:Pick<SnapshotBundle,'members'|'attachments'>){
 const plans:SourceRegionPlan[]=[];
 for(const m of bundle.members){const s=m.sourceSchedule;if(!s)continue;
  for(const row of s.rows){if(!row.shapeReference)continue;
   const r=sourceShapeReferenceSchema.parse(row.shapeReference),a=bundle.attachments.find(a=>a.id===s.attachmentId);
   if(s.version===1||!a||a.memberId&&a.memberId!==m.id||r.sha256!==s.sha256||r.sha256!==a.sha256||!a.pageCount||r.page>a.pageCount||a.contentType!=='application/pdf'&&r.page!==1)throw Error(m.code+' / '+row.mark+': ไฟล์/หน้ารูปดัดต้นทางไม่ตรงข้อมูลที่บันทึก');
   plans.push({member:m,attachment:a,row,reference:r});
  }
 }
 const unique=new Map(plans.map(p=>[p.attachment.id,p.attachment]));
 if(plans.length>300||unique.size>50||[...unique.values()].reduce((n,a)=>n+a.size,0)>90*1024*1024)throw Error('แบ่งชุดรูปดัดต้นทาง: สูงสุด 300 รูป / 50 ไฟล์ / 90 MiB ต่อชุด');
 return plans;
}
