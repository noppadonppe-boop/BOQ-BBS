import {sourceRowPage,sourceScheduleFileProblems} from './sourceSchedule';
import {blankBar,barSchema,type Bar,type Member,type Attachment,type Spec} from './model';
import {validateMember} from './engine';

export interface SourceBarDraft {bar:Bar;rowId:string;fingerprint:string;reference:string}
function fingerprint(member:Member){return JSON.stringify(member);}
export function startSourceBar(member:Member,rowId:string,attachments:Attachment[]):SourceBarDraft{
 const s=member.sourceSchedule,r=s?.rows.find(r=>r.id===rowId),a=attachments.find(a=>a.id===s?.attachmentId);
 if(sourceScheduleFileProblems(member,attachments).length||!s||!r||!a||a.sha256!==s.sha256||a.sourceStatus==='Superseded'||!a.pageCount||s.page<1||s.page>a.pageCount||(a.memberId&&a.memberId!==member.id))throw Error('ตาราง/แบบต้นทางไม่ตรงหรือถูกแทนที่ ตรวจแบบต้นทางก่อนสร้าง BBS');
 if(r.barId||member.bars.some(b=>b.mark.trim()===r.mark.trim()))throw Error('มี Mark หรือการจับคู่อยู่แล้ว ให้ตรวจและจับคู่ BBS เดิมก่อน ไม่สร้างทับ');
 const qty=member.occurrences.reduce((n,o)=>n+o.quantity,0),count=s.basis==='allOccurrences'?r.count/qty:r.count;
 if(!Number.isInteger(qty)||qty<1||!Number.isInteger(count)||count<1||count>2000)throw Error('จำนวนต้นทางหารด้วยจำนวนองค์ประกอบทั้งหมดต้องลงตัวเป็น 1–2000 แท่งต่อองค์ประกอบ แยกสมาชิกหรือทบทวนฐานจำนวน');
 const reference=`${a.name} / Rev ${a.revision} / p${sourceRowPage(s,r)} / Mark ${r.mark}`;
 const bar=barSchema.parse({...blankBar(r.mark),diameter:r.diameter,grade:r.grade,count,shape:'polyline',shapeCode:'99',lengthMethod:'centerline',note:'เริ่มจากตารางต้นทาง ต้องกรอกรูปดัดและตำแหน่ง ตรวจการเทียบชนิดเหล็ก และยาวตัดก่อนส่งงาน'});
 return {bar,rowId,fingerprint:fingerprint(member),reference:reference.slice(0,500)};
}
export function applySourceBar(member:Member,draft:SourceBarDraft,input:Bar,spec:Spec,attachments:Attachment[]):Member{
 if(fingerprint(member)!==draft.fingerprint||input.id!==draft.bar.id)throw Error('ข้อมูลสมาชิก/ตารางต้นทางเปลี่ยนระหว่างกรอก เริ่มสร้าง BBS จากแถวปัจจุบันใหม่');
 if(startSourceBar(member,draft.rowId,attachments).reference!==draft.reference)throw Error('ชื่อ/Revision แบบต้นทางเปลี่ยน เริ่มจากแถวปัจจุบันใหม่');
 const bar=barSchema.parse(input),next={...member,bars:[...member.bars,bar],sourceSchedule:{...member.sourceSchedule!,rows:member.sourceSchedule!.rows.map(r=>r.id===draft.rowId?{...r,barId:bar.id}:r)}};
 const errors=validateMember(next,spec);if(errors.length)throw Error(errors.join(' · '));return next;
}
