import type {Attachment} from './model';
import {sourceScheduleSchema,sourceRowPage,sourceSchedulePages,type SourceSchedule} from './sourceSchedule';
import {acceptSourceTable,type SourceTableCandidate} from './sourceTableIntake';
export function appendSourcePage(existing:SourceSchedule,candidate:SourceTableCandidate,file:Attachment,review:{basis:SourceSchedule['basis'];note:string;reviewed:boolean;unitsConfirmed:boolean}){
 const old=sourceScheduleSchema.parse(existing),next=acceptSourceTable(candidate,file,review);
 if(old.attachmentId!==file.id||old.sha256!==file.sha256)throw Error('เพิ่มหน้าได้เฉพาะไฟล์ต้นฉบับและSHA256เดียวกัน');
 if(old.basis!==review.basis)throw Error('ฐานจำนวนของหน้าเพิ่มต้องตรงตารางเดิม ตรวจฐานทั้งชุดก่อน');
 const tables=sourceSchedulePages(old);if(tables.some(t=>!file.pageCount||t.page>file.pageCount)||old.rows.some(r=>r.shapeReference&&(!file.pageCount||r.shapeReference.page>file.pageCount)))throw Error('หน้าตารางหรือรูปดัดเดิมเกินไฟล์ที่ตรวจแล้ว');if(tables.some(t=>t.page===candidate.page))throw Error('หน้านี้อยู่ในตารางแล้ว ห้ามรับซ้ำหรือนับซ้ำ');
 if(old.rows.length+next.rows.length>300||tables.length>=20)throw Error('แบ่งชุด: ตารางรวมสูงสุด300รายการ/20หน้า');
 const used=new Set(old.rows.map(r=>r.mark.toUpperCase())),duplicate=next.rows.filter(r=>used.has(r.mark.toUpperCase()));if(duplicate.length)throw Error('Mark ซ้ำข้ามหน้า: '+duplicate.map(r=>r.mark).join(', ')+' · ไม่รวมจำนวนอัตโนมัติ ให้ตรวจขอบเขตหรือแยกสมาชิก');
 const {statedTotalWeight,...base}=old;
 return sourceScheduleSchema.parse({...base,version:3,page:tables[0].page,pageTables:[...tables,{page:candidate.page,statedTotalWeight:candidate.statedTotalWeight,note:review.note}],rows:[...old.rows.map(r=>({...r,sourcePage:sourceRowPage(old,r),barId:undefined})),...next.rows.map(r=>({...r,sourcePage:candidate.page,barId:undefined}))]});
}
