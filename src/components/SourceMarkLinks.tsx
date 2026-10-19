import type {Member,Attachment} from '../domain/model';
import {sourceMarkTargets,type SourceMarkTarget} from '../domain/sourceMarkNavigation';
export function SourceMarkLinks({member,barId,files,onOpen}:{member:Member;barId:string;files:Attachment[];onOpen:(t:SourceMarkTarget)=>void}){
 const bar=member.bars.find(b=>b.id===barId);if(!bar)return null;const targets=sourceMarkTargets(member,barId,files);
 return <details className="source-mark-links" data-source-mark-links={bar.id}><summary>ตำแหน่ง Mark {bar.mark} ในแบบ · {targets.length} จุดที่บันทึก</summary>{!targets.length?<p className="muted">ยังไม่มีจุดชี้ฉบับปัจจุบันที่ตรง Mark นี้ เปิดแบบอ้างอิงเพื่อตรวจและบันทึกจุดชี้ ไม่จับคู่จากชื่อที่ใกล้เคียงให้เอง</p>:<><p className="muted">เลือกจุดชี้ที่บันทึกไว้เพื่อเปิดไฟล์/หน้าและเน้นตำแหน่ง · จุดชี้ไม่เพิ่มปริมาณหรือยืนยันตำแหน่งวิศวกรรม</p><div className="source-mark-targets">{targets.map(t=>{const a=files.find(a=>a.id===t.attachmentId)!;return <button type="button" key={t.attachmentId+'/'+t.index} aria-label={`เปิดจุดชี้ ${bar.mark} ${a.name} หน้า ${t.page} #${t.index+1}`} onClick={()=>onOpen(t)}>{a.kind} · {a.name} / Rev {a.revision} · หน้า {t.page} · #{t.index+1}</button>;})}</div></>}
 </details>;
}
