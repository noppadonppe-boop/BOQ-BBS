import type {Member,SnapshotBundle,ExportKind,ExportSize,ExportLayout} from './model';
import {z} from 'zod';

export const scheduleSetupSchema=z.object({drawingNumber:z.string().trim().max(80).refine(v=>!v||/\d{3}$/.test(v),'เลขแบบต้นทางต้องลงท้ายด้วยตัวเลข 3 หลัก'),startNumber:z.number().int().min(1).max(99),revisionLetter:z.string().regex(/^[A-Z]?$/,'อักษรแก้ไขต้องเป็น A-Z หนึ่งตัว')});
export const SCHEDULE_ROWS=10;
// Stored numbering makes a member-only export use the same references as a whole-project export.
export function scheduleReferences(m:Member){
 const setup=m.scheduleSetup;
 if(!setup?.drawingNumber||!setup.revisionLetter)throw Error(`${m.code}: ตั้งเลขแบบต้นทางและอักษรแก้ไขตาราง A4 ก่อนส่งออก`);
 const count=Math.max(1,Math.ceil(m.bars.length/SCHEDULE_ROWS));
 if(setup.startNumber+count-1>99)throw Error(`${m.code}: เลขตาราง A4 เกิน 99 ให้แบ่งชุดแบบ/กำหนดเลขเริ่มใหม่`);
 return Array.from({length:count},(_,i)=>setup.drawingNumber.slice(-3)+String(setup.startNumber+i).padStart(2,'0')+setup.revisionLetter);
}
export function validateScheduleReferences(members:Member[]){
 const used=new Map<string,string>();
 for(const m of members){const refs=scheduleReferences(m);for(const ref of refs){
  // Revision letters cannot make overlapping schedule numbers safe within the same package.
  const key=ref.slice(0,5),previous=used.get(key);
  if(previous)throw Error(`เลขตาราง A4 ${key} ซ้ำระหว่าง ${previous} และ ${m.code}; กำหนดเลขเริ่มที่ไม่ซ้ำ (หรือแยกชุดงาน)`);
  used.set(key,m.code);
 }}
}
export function validateExportFormat(kind:ExportKind,size:ExportSize,layout?:ExportLayout){
 if(kind==='inventory-excel'||kind==='inventory-pdf'){if(size!=='A3')throw Error('ทะเบียนสต็อกใช้ A3');return;}
 if(kind==='schedule'){if(size!=='A4'||layout!=='cutting-a4-v1')throw Error('ตารางตัด/ดัดต้องใช้ A4 / cutting-a4-v1');}
 else if(size==='A4'||(kind==='drawing'&&!['schedule-v1','details-v2','fabrication-v3','general-v4','tangent-v5','spatial-v6','measurements-v7','projections-v8','source-v9'].includes(layout||'schedule-v1')))throw Error('รูปแบบนี้ใช้ A3/A1 เท่านั้น');
}
export function validateScheduleBundle(b:SnapshotBundle){
 if(!b.members.length)throw Error('ไม่มีสมาชิกในชุดตาราง A4');
 validateScheduleReferences(b.members);
 const total=b.members.reduce((n,m)=>n+scheduleReferences(m).length+m.bars.length,0);
 if(total>500)throw Error('ชุดตารางและรายละเอียด A4 เกิน 500 แผ่น ให้เลือกสมาชิกหรือประเภทเพื่อแบ่งชุด');
}
