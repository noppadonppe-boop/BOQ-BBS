import type {Attachment,Bar,Member,Spec} from './model';
import {takeoff} from './engine';
import {applySourceBar,type SourceBarDraft} from './sourceBarStarter';
import {compareSourceSchedule} from './sourceSchedule';

// A disposable candidate: never writes mappings, copies a printed cut length,
// changes the source basis or treats numerical agreement as approval.
export function previewSourceBar(member:Member,draft:SourceBarDraft,bar:Bar,pointsText:string,spec:Spec,attachments:Attachment[],pending=false){
 const source=member.sourceSchedule?.rows.find(r=>r.id===draft.rowId),attachment=attachments.find(a=>a.id===member.sourceSchedule?.attachmentId);
 const base={source,attachment,basis:member.sourceSchedule?.basis,canApply:false,problems:[] as string[],standardProblems:[] as string[]};
 if(pending)return {...base,problems:['ยังมีมิติหรือชุดตำแหน่งที่แก้แต่ไม่ได้ใช้ ค่าตรวจเทียบยังไม่พร้อม']};
 try{
  const points=JSON.parse(pointsText||'[]');if(!Array.isArray(points))throw Error('พิกัดต้องเป็น [[x,y,z], …]');
  const candidate=applySourceBar(member,draft,{...bar,points},spec,attachments),rows=takeoff(candidate,spec).rows,barRow=rows.find(r=>r.id===bar.id),comparison=compareSourceSchedule(candidate,rows,attachments)?.rows.find(r=>r.source.id===draft.rowId);
  if(!barRow||!comparison)throw Error('ยังไม่พบรายการคำนวณของชุดเหล็กที่กำลังกรอก');
  return {...base,canApply:true,candidateBar:candidate.bars.find(r=>r.id===bar.id)!,barRow,comparison,standardProblems:barRow.standard.problems};
 }catch(e){return {...base,problems:[e instanceof Error?e.message:'ยังตรวจชุดเหล็กที่กรอกไม่ได้']};}
}
export type SourceBarPreviewResult=ReturnType<typeof previewSourceBar>;
