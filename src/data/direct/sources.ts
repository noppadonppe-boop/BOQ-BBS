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
const reset=(m:Member,marks?:Set<string>)=>({...m,noRebar:undefined,status:'Draft',version:m.version+1,inputEpoch:now(),updatedAt:now(),bars:m.bars.map(b=>!marks||marks.has(b.mark)?{...b,placementConfirmed:false}:b)});
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
   must(next.annotations!.every(pt=>pt.page<=(a.pageCount||1)&&!!m?.bars.some(b=>b.mark===pt.mark)),'หน้าแบบหรือ Mark No. ไม่ตรงสมาชิก','invalid-argument');must(Object.keys(next.calibrations||{}).every(page=>Number(page)<=(a.pageCount||1)),'หน้าที่ปรับสเกลเกินจำนวนหน้า');
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
