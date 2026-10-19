import {getDoc} from 'firebase/firestore';
import type {Attachment,Member,Project} from '../../domain/model';
import {decodeStorage} from '../../domain/storageCodec';
import {validateMember,minimumProblems} from '../../domain/engine';
import {CODE99_HOLD,code99ReviewRequestSchema,code99ReviewSchema} from '../../domain/code99ReviewSchema';
import {indexedApprover,reviewDimensions,code99ReviewProblems} from '../../domain/code99Review';
import {code99Bindings} from '../code99Reviews';
import {verifiedAttachment} from './sources';
import {projectTransaction,projectRef,recordRef,must,now} from './common';
import {z} from 'zod';

export async function revokeCode99Detail(pid:string,data:Record<string,unknown>,id:string){
 const request=z.object({reviewId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),projectVersion:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(500)}).strict().parse(data);
 return projectTransaction('revokeCode99Detail',pid,data,id,['approver'],async(tx,p,u)=>{
  must(indexedApprover(p,u.uid),'ต้องเป็นผู้อนุมัติในทีมโครงการ');must(p.version===request.projectVersion,'โครงการเปลี่ยนแล้ว โหลดล่าสุด','aborted');
  const op=await tx.get(recordRef(pid,'operations',request.reviewId));must(op.exists()&&op.data().action==='acceptCode99Detail','ไม่พบรายการตรวจรับ');const accepted=code99ReviewSchema.parse(decodeStorage(op.data()).result);
  const mr=recordRef(pid,'members',accepted.memberId),ms=await tx.get(mr);must(ms.exists(),'ไม่พบสมาชิก');
  tx.update(mr,{status:'Draft',version:ms.data().version+1,updatedAt:now()});tx.update(projectRef(pid),{version:p.version+1});
  return {format:'code99-revoke-1.0',id,projectId:pid,projectVersion:p.version,memberId:accepted.memberId,barId:accepted.barId,reviewId:accepted.id,actorUid:u.uid,revokedAt:now(),reason:request.reason};
 });
}

export async function acceptCode99Detail(pid:string,data:Record<string,unknown>,id:string){
 const request=code99ReviewRequestSchema.parse(data),ps=await getDoc(projectRef(pid)),ms=await getDoc(recordRef(pid,'members',request.memberId)),as=await getDoc(recordRef(pid,'attachments',request.attachmentId));
 must(ps.exists()&&ms.exists()&&as.exists(),'ไม่พบโครงการ สมาชิก หรือหลักฐาน','not-found');
 const p=decodeStorage(ps.data()) as Project,m=decodeStorage(ms.data()) as Member,a=decodeStorage(as.data()) as Attachment,b=m.bars.find(b=>b.id===request.barId);
 must(b&&m.inputEpoch,'บันทึกข้อมูลชุดปัจจุบันก่อนตรวจรับ');must(m.version===request.memberVersion&&p.version===request.projectVersion&&(a.version||1)===request.attachmentVersion,'ข้อมูลเปลี่ยนแล้ว โหลดชุดตรวจล่าสุด','aborted');
 must(a.memberId===''||a.memberId===m.id,'หลักฐานเป็นของสมาชิกอื่น');must(!a.supersededById&&a.sourceStatus!=='Superseded','หลักฐานถูกแทนที่แล้ว');
 const dimensions=reviewDimensions(m,b,request),base=minimumProblems(m,p.spec).filter(s=>s.startsWith(b.mark+': ')&&!s.endsWith(CODE99_HOLD));
 const problems=[...validateMember(m,p.spec),...base,...code99ReviewProblems(m,b,p.spec,request,dimensions)];

 must(!problems.length,problems.join('\n'));await verifiedAttachment(pid,a);const hashes=await code99Bindings(m,p,a);
 return projectTransaction('acceptCode99Detail',pid,data,id,['approver'],async(tx,current,u)=>{
  const liveMember=await tx.get(recordRef(pid,'members',m.id)),liveFile=await tx.get(recordRef(pid,'attachments',a.id));
  must(current.version===p.version&&liveMember.data()?.version===m.version&&(liveFile.data()?.version||1)===(a.version||1),'ข้อมูลเปลี่ยนระหว่างตรวจรับ','aborted');must(indexedApprover(current,u.uid),'ต้องมีบทบาทผู้อนุมัติในบัญชีทีมโครงการ ไม่ใช้สิทธิ์ผู้ดูแลแทน');
  const record=code99ReviewSchema.parse({format:'code99-review-1.0',id,projectId:pid,memberId:m.id,barId:b.id,memberEpoch:m.inputEpoch,...hashes,evidence:{id:a.id,name:a.name,revision:a.revision,sha256:a.sha256,version:a.version||1},actorUid:u.uid,actorName:[u.firstName,u.lastName].filter(Boolean).join(' '),acceptedAt:now(),request,dimensions});
  tx.update(projectRef(pid),{version:current.version+1});return record;
 });
}
