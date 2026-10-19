import type {Attachment} from './model';
import {sourceRowPage,sourceSchedulePages,sourceScheduleSchema,type SourceSchedule} from './sourceSchedule';
import {acceptSourceTable,type SourceTableCandidate} from './sourceTableIntake';

function assemble(old:SourceSchedule,tables:ReturnType<typeof sourceSchedulePages>,rows:SourceSchedule['rows']):SourceSchedule{
 const {pageTables,statedTotalWeight,...base}=old;
 const clean=rows.map(r=>({...r,barId:undefined}));
 if(tables.length===1){const t=tables[0];return sourceScheduleSchema.parse({...base,version:2,page:t.page,note:t.note,statedTotalWeight:t.statedTotalWeight,rows:clean.map(({sourcePage,...r})=>r)});}
 return sourceScheduleSchema.parse({...base,version:3,page:tables[0].page,pageTables:tables,rows:clean});
}
export function removeSourcePage(source:SourceSchedule,page:number,reviewed:boolean):SourceSchedule{
 const old=sourceScheduleSchema.parse(source),tables=sourceSchedulePages(old);
 if(!reviewed)throw Error('ยืนยันหน้าที่ลบและการล้างการจับคู่ BBS ก่อน');
 if(!tables.some(t=>t.page===page)||tables.length<2)throw Error('หน้าที่เลือกไม่อยู่ในชุดหรือเป็นหน้าสุดท้าย ใช้ลบตารางทั้งชุดแทน');
 return assemble(old,tables.filter(t=>t.page!==page),old.rows.filter(r=>sourceRowPage(old,r)!==page));
}
export function editSourcePage(source:SourceSchedule,page:number,patch:{note:string;statedTotalWeight?:number},reviewed:boolean):SourceSchedule{
 const old=sourceScheduleSchema.parse(source),tables=sourceSchedulePages(old);
 if(!reviewed)throw Error('ตรวจ Total และบันทึกต้นทางก่อนยืนยันแก้หน้า');
 if(!tables.some(t=>t.page===page))throw Error('หน้าที่เลือกไม่อยู่ในตาราง');
 try{return assemble(old,tables.map(t=>t.page===page?{page,...patch}:t),old.rows);}catch{throw Error('บันทึกต้องมี1–500ตัวอักษร และ Total ต้องเป็นจำนวนมากกว่า0ไม่เกิน1e17 kg หรือเว้นว่างถ้าไม่ทราบ');}
}
export function replaceSourcePage(source:SourceSchedule,candidate:SourceTableCandidate,file:Attachment,review:Parameters<typeof acceptSourceTable>[2]):SourceSchedule{
 const old=sourceScheduleSchema.parse(source),next=acceptSourceTable(candidate,file,review),tables=sourceSchedulePages(old);
 if(old.attachmentId!==file.id||old.sha256!==file.sha256||old.basis!==review.basis)throw Error('รับหน้าใหม่ได้เฉพาะไฟล์/SHA256และฐานจำนวนเดียวกับชุดเดิม');
 if(!tables.some(t=>t.page===candidate.page))throw Error('หน้านี้ยังไม่อยู่ในชุด ใช้เพิ่มหน้าใหม่แทน');
 if(tables.some(t=>!file.pageCount||t.page>file.pageCount)||old.rows.some(r=>r.shapeReference&&(!file.pageCount||r.shapeReference.page>file.pageCount)))throw Error('หน้าตารางหรือรูปดัดเดิมเกินไฟล์ที่ตรวจแล้ว');
 const retained=old.rows.filter(r=>sourceRowPage(old,r)!==candidate.page),used=new Set(retained.map(r=>r.mark.toUpperCase()));
 if(next.rows.some(r=>used.has(r.mark.toUpperCase())))throw Error('Mark ซ้ำกับหน้าที่เก็บไว้ ห้ามรวมจำนวนอัตโนมัติ');
 if(retained.length+next.rows.length>300)throw Error('แบ่งชุด: ตารางรวมสูงสุด300รายการ');
 const rows:SourceSchedule['rows']=[];for(const t of tables){if(t.page===candidate.page)rows.push(...next.rows.map(r=>({...r,sourcePage:t.page})));else rows.push(...old.rows.filter(r=>sourceRowPage(old,r)===t.page).map(r=>({...r,sourcePage:t.page})));}
 return assemble(old,tables.map(t=>t.page===candidate.page?{page:t.page,note:review.note,statedTotalWeight:candidate.statedTotalWeight}:t),rows);
}
