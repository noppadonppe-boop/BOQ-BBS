import {getDoc} from 'firebase/firestore';
import {getBlob,getMetadata,ref} from 'firebase/storage';
import {storage} from '../firebase';
import {sha256} from '../snapshots';
import {inspectAttachmentDocument} from '../documentInspection';
import {readCollectionPages} from '../collections';
import {Attachment,Member,attachmentSchema} from '../../domain/model';
import {decodeStorage} from '../../domain/storageCodec';
import {canonical} from '../../domain/canonical';
import {declaredNoRebar} from '../../domain/reinforcementScopeSchema';
import {sourceCurrent,sourceReconciliation,memberSourceInfo,generalSourceInfo,sourceBarNames} from '../../domain/sourceRevisions';
import {projectRef,recordRef,projectTransaction,encode,must,now} from './common';

export async function verifiedAttachment(pid:string,input:Attachment){
 const a=attachmentSchema.parse(input);must(a.path.startsWith(`projects/${pid}/files/${a.id}/`),'ไฟล์ไม่ตรงรหัสหรือโครงการ');
 const sr=ref(storage,a.path),meta=await getMetadata(sr),blob=await getBlob(sr),hash=await sha256(await blob.arrayBuffer());must(a.size===blob.size&&a.contentType===meta.contentType&&(!a.sha256||a.sha256===hash),'แบบต้นทาง checksum ขนาดหรือชนิดไฟล์ไม่ตรง');
 const pageCount=await inspectAttachmentDocument(a,blob);return {...a,sha256:hash,pageCount};
}
// Upload registration must not read the object back or parse its contents. The
// file is checked when a workflow actually needs a hash/page count (review,
// release, export, etc.). Keep only the path/metadata guard here so the upload
// can be recorded even when Storage readback is slow or unavailable.
export function unverifiedAttachment(pid:string,input:Attachment){
 const a=attachmentSchema.parse(input);must(a.path.startsWith(`projects/${pid}/files/${a.id}/`),'ไฟล์ไม่ตรงรหัสหรือโครงการ');return a;
}
const reset=(m:Member,marks?:Set<string>)=>{const at=now();return {...m,noRebar:undefined,status:'Draft',version:m.version+1,inputEpoch:at,updatedAt:at,bars:m.bars.map(b=>!marks||marks.has(b.mark)?{...b,placementConfirmed:false}:b)};};

/**
 * Fast path for the normal member-detail upload. It records the attachment
 * and resets that one member in one transaction, without creating a job that
 * re-downloads and inspects the uploaded object first.
 */
export async function directMemberSource(action:string,pid:string,data:Record<string,any>,id:string){
 must(['attach','replaceSource'].includes(action),'ไม่รองรับคำสั่งรับแบบสมาชิก','invalid-argument');
 const candidate=unverifiedAttachment(pid,data.attachment),memberId=candidate.memberId;
 must(!!memberId,'การรับแบบทันทีต้องเป็นแบบของสมาชิก','invalid-argument');
 const note=String(data.note||'').trim();must(note.length>0&&note.length<=500,'ระบุเหตุผลรับหรือเปลี่ยนแบบ','invalid-argument');
 return projectTransaction(action,pid,data,id,['admin','qs'],async(tx,p,u)=>{
  must(p.version===data.projectVersion,'ข้อมูลโครงการเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนเริ่ม','aborted');
  const mr=recordRef(pid,'members',memberId),ms=await tx.get(mr);must(ms.exists(),'ไม่พบสมาชิกเจ้าของแบบ','not-found');
  const m=decodeStorage(ms.data()) as Member;must(m.version===data.memberVersion,'ข้อมูลสมาชิกเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนรับแบบ','aborted');
  const ar=recordRef(pid,'attachments',candidate.id),existing=await tx.get(ar);must(!existing.exists(),'แบบนี้มีในโครงการแล้ว','aborted');
  const at=now();let old:Attachment|undefined,next:Attachment;
  if(action==='replaceSource'){
   const oldRef=recordRef(pid,'attachments',String(data.previousAttachmentId)),oldSnap=await tx.get(oldRef);must(oldSnap.exists(),'ไม่พบแบบฉบับเดิม','not-found');
   old=decodeStorage(oldSnap.data()) as Attachment;must(sourceCurrent(old)&&(old.version||1)===data.previousVersion,'แบบฉบับเดิมเปลี่ยนแล้ว โหลดรายการล่าสุดก่อนแทน revision','aborted');
   must(old.memberId===candidate.memberId&&old.kind===candidate.kind&&old.revision!==candidate.revision,'Revision หรือประเภทไม่ตรงสายเดิม','invalid-argument');
   next={...candidate,version:1,sourceStatus:'Current',annotations:[],calibrations:{},sourceRevision:{previousAttachmentId:old.id,previousRevision:old.revision,note,changedAt:at,changedBy:u.uid,baselineBars:sourceBarNames(m.bars),scope:'Member',specChangeJobId:id,affectedMemberCount:1}};
  }else{
   next={...candidate,version:1,sourceStatus:'Current',annotations:[],calibrations:{},sourceIntake:{scope:'Member',note,receivedAt:at,receivedBy:u.uid,specChangeJobId:id,affectedMemberCount:1,baselineBars:sourceBarNames(m.bars)}};
  }
  const summary=(a:Attachment)=>({id:a.id,name:a.name,revision:a.revision,memberId:a.memberId,kind:a.kind});
  const member=reset(m),state={id,status:'Complete' as const,completed:1,total:1},job={...state,sourceVersion:p.version,createdBy:u.uid,createdAt:at,targetSpec:p.spec,sourceScope:'Member' as const,sourceIntakes:action==='attach'?[summary(next)]:[],sourceChanges:old?[{before:summary(old),next:summary(next)}]:[],sourceAdoptions:[],sourceIntakeCount:action==='attach'?1:0,sourceChangeCount:old?1:0,sourceAdoptionCount:0,memberIds:[member.id],sourceIds:old?[old.id,next.id]:[next.id]};
  if(old)tx.set(recordRef(pid,'attachments',old.id),encode({...old,version:(old.version||1)+1,sourceStatus:'Superseded',supersededById:next.id,supersededAt:at}));
  tx.set(ar,encode(next));tx.set(mr,encode(member));tx.set(recordRef(pid,'specChangeJobs',id),encode(job));
  tx.update(projectRef(pid),encode({version:p.version+1,specChangeState:state,historyEpoch:id}));
  return {id:next.id,jobId:id,status:state.status,completed:1,total:1};
 });
}
export async function directSource(action:string,pid:string,data:Record<string,any>,id:string){
 must(['annotate','reviewSource','reviewGeneralSource'].includes(action),'ไม่รองรับคำสั่งแบบอ้างอิง','invalid-argument');
 const ar=recordRef(pid,'attachments',data.attachmentId),s=await getDoc(ar);must(s.exists(),'ไม่พบแบบ','not-found');const initial=decodeStorage(s.data()) as Attachment;
 const anchor=await getDoc(projectRef(pid));
 const peers=action==='reviewSource'?(await readCollectionPages(pid,'attachments')).filter((a:Attachment)=>a.memberId===initial.memberId):[];
 return projectTransaction(action,pid,data,id,action==='annotate'?['admin','qs']:['admin','qs','checker','approver'],async(tx,p,u)=>{
  const s=await tx.get(ar);must(s.exists(),'ไม่พบแบบ');const a=decodeStorage(s.data()) as Attachment;must((a.version||1)===data.version,'แบบหรือจุดชี้ Mark เปลี่ยนแล้ว โหลดล่าสุดก่อนบันทึก','aborted');must(sourceCurrent(a),'แก้หรือทบทวนได้เฉพาะแบบฉบับปัจจุบัน');
  const mr=a.memberId?recordRef(pid,'members',a.memberId):undefined,ms=mr?await tx.get(mr):undefined,m=ms?.exists()?decodeStorage(ms.data()) as Member:undefined;
  if(action==='annotate'){
   const next=attachmentSchema.parse({...a,annotations:data.annotations||[],calibrations:data.calibrations||{},version:(a.version||1)+1});
   // Newly uploaded files intentionally have no persisted page count yet.
   // The viewer knows the real page count while rendering; when it is absent
   // here, accept positive page references and defer content verification to
   // the workflows that require a verified source.
   must(next.annotations!.every(pt=>pt.page>=1&&(!a.pageCount||pt.page<=a.pageCount)&&!!m?.bars.some(b=>b.mark===pt.mark)),'หน้าแบบหรือ Mark No. ไม่ตรงสมาชิก','invalid-argument');must(Object.keys(next.calibrations||{}).every(page=>Number(page)>=1&&(!a.pageCount||Number(page)<=a.pageCount)),'หน้าที่ปรับสเกลเกินจำนวนหน้า');
   const affected=new Set([...a.annotations||[],...next.annotations||[]].filter(pt=>canonical((a.annotations||[]).filter(x=>x.mark===pt.mark))!==canonical((next.annotations||[]).filter(x=>x.mark===pt.mark))).map(pt=>pt.mark));
   if(canonical(a.calibrations||{})!==canonical(next.calibrations||{}))for(const pt of [...a.annotations||[],...next.annotations||[]])affected.add(pt.mark);
   tx.update(ar,encode({annotations:next.annotations,calibrations:next.calibrations,version:next.version}));if(m&&mr)tx.set(mr,encode(reset(m,affected)));tx.update(projectRef(pid),{version:p.version+1});return {version:next.version};
  }
  must(p.version===anchor.data()?.version,'ข้อมูลแบบหรือสมาชิกเปลี่ยนระหว่างทบทวน กรุณาลองใหม่','aborted');
  const note=String(data.note||'').trim();must(note.length>0&&note.length<=500,'ระบุบันทึกการทบทวน','invalid-argument');
  const info=action==='reviewGeneralSource'?generalSourceInfo(a):memberSourceInfo(a);must(info,'ไฟล์นี้ยังไม่อยู่ในทะเบียนรับแบบ');
  const noRebarBasis=m&&declaredNoRebar(m)?m.noRebar!.basis:undefined;
  if(action==='reviewSource'){must(m&&m.version===data.memberVersion,'สมาชิกเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนทบทวน','aborted');must(sourceReconciliation(a,m.bars,peers,noRebarBasis).ready,'ตรวจจุดชี้ Mark หรือขอบเขตไม่มีเหล็กให้ครบก่อนทบทวน');}
  const version=(a.version||1)+1,review={annotationVersion:version,bars:m?sourceBarNames(m.bars):[],note,reviewedAt:now(),reviewedBy:u.uid,...(noRebarBasis?{noRebarBasis}:{})};
  const key=a.sourceRevision?'sourceRevision':'sourceIntake';tx.update(ar,encode({[key]:{...info,review},version}));tx.update(projectRef(pid),{version:p.version+1});return {version};
 });
}
