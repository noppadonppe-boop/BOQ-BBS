import {z} from 'zod';
import {AI_LOG_KEEP,aiSendLogEntrySchema} from '../../domain/aiSlabPlan';
import {encode,must,now,projectRef,projectTransaction} from './common';

// S4b: project switch “อนุญาตส่งแบบให้ AI” (admin only, default off; project version + 1) and the send log (every send of
// a drawing window to the AI gateway; editors; last 200 kept; no version bump so open project forms stay valid).
export async function setDirectAiConsent(pid:string,data:Record<string,any>,id:string){
 const enabled=z.boolean().parse(data.enabled);
 return projectTransaction('setAiConsent',pid,data,id,['admin'],async(tx,p,u)=>{
  must(p.version===data.version,'ข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก','aborted');
  tx.update(projectRef(pid),encode({aiConsent:{enabled,by:u.email,at:now()},version:p.version+1}));return {version:p.version+1,enabled};
 });
}
export async function logDirectAiSend(pid:string,data:Record<string,any>,id:string){
 const e=aiSendLogEntrySchema.omit({at:true,uid:true,email:true}).parse(data.entry);
 return projectTransaction('logAiSend',pid,data,id,['admin','qs','detailer'],async(tx,p,u)=>{
  must(p.aiConsent?.enabled===true,'โครงการนี้ยังไม่อนุญาตส่งแบบให้ AI (ผู้ดูแลโครงการเปิดได้ที่ ตั้งค่าโครงการ)','permission-denied');
  const entry={...e,at:now(),uid:u.uid,email:u.email};
  tx.update(projectRef(pid),encode({aiSendLog:[...(p.aiSendLog||[]),entry].slice(-AI_LOG_KEEP)}));return {logged:true,at:entry.at};
 });
}
