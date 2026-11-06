import type {Project} from '../domain/model';
import {aiAllowed} from '../domain/aiSlabPlan';
import {command} from '../data/firebase';
import {HelpButton} from './HelpCenter';

// S4b: project switch “อนุญาตส่งแบบให้ AI” (admin only, default off) + the last sends (who, when, file, page, provider).
export function AiConsentSettings({project,canAdmin,run}:{project:Project;canAdmin:boolean;run:(fn:()=>Promise<void>,done?:string)=>void}){
 const on=aiAllowed(project),log=[...(project.aiSendLog||[])].reverse().slice(0,20);
 return <section className="ai-consent"><h4>การส่งแบบให้ AI <HelpButton topic="slab-floor-pdf-ai"/></h4>
  <label className="check"><input type="checkbox" checked={on} disabled={!canAdmin} onChange={e=>{const enabled=e.target.checked;run(async()=>{await command('setAiConsent',project.id,{enabled,version:project.version});},enabled?'อนุญาตส่งแบบให้ AI แล้ว':'ปิดการส่งแบบให้ AI แล้ว');}}/>
   อนุญาตส่งแบบให้ AI (ผู้ให้บริการภายนอกตามหน้า “จัดการ API”)</label>
  <p className="muted">ค่าเริ่มต้นปิด · เปิด / ปิดได้เฉพาะผู้ดูแลโครงการ · ส่งเฉพาะภาพของกรอบที่เลือก + ข้อความที่อ่านได้ ไม่ส่งไฟล์ทั้งไฟล์ · ทุกครั้งต้องกดยืนยันและถูกบันทึกด้านล่าง{project.aiConsent?` · ตั้งค่าล่าสุดโดย ${project.aiConsent.by} ${project.aiConsent.at.slice(0,16).replace('T',' ')}`:''}</p>
  {log.length>0&&<table className="data-table ai-log"><thead><tr><th>เมื่อ</th><th>ผู้ส่ง</th><th>งาน</th><th>ไฟล์ / หน้า</th><th>ผู้ให้บริการ</th></tr></thead>
   <tbody>{log.map((e,i)=><tr key={i}><td>{e.at.slice(0,16).replace('T',' ')}</td><td>{e.email}</td><td>{e.task==='slabSchedule'?'ตาราง':'แปลนพื้น'}</td><td>{e.fileName} · หน้า {e.page} · {e.views} ภาพ</td><td>{e.provider} · {e.model}</td></tr>)}</tbody></table>}
 </section>;
}
