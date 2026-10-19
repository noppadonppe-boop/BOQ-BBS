import {collection,getDoc,getDocs,limit,query,where} from 'firebase/firestore';
import {db} from '../firebase';
import {decodeStorage} from '../../domain/storageCodec';
import {copyMemberInputs,memberCopyRequestSchema} from '../../domain/memberCopy';
import {validateMember} from '../../domain/engine';
import type {Member,Project} from '../../domain/model';
import {allow,encode,must,now,projectRef,projectTransaction,recordRef,writable} from './common';

export async function copyDirectMember(pid:string,data:Record<string,unknown>,requestId:string){
 const input=memberCopyRequestSchema.parse(data),op=await getDoc(recordRef(pid,'operations',requestId));
 // A completed operation can be retried after its source changes or disappears.
 // The transaction still checks the current actor/target permission and hash.
 if(op.exists())return projectTransaction('copyMember',pid,data,requestId,['admin','qs'],async()=>{throw Error('unreachable');});
 const duplicates=await getDocs(query(collection(db,'projects',pid,'members'),where('code','==',input.code),limit(1)));
 if(!duplicates.empty){
  if((await getDoc(recordRef(pid,'operations',requestId))).exists())return projectTransaction('copyMember',pid,data,requestId,['admin','qs'],async()=>{throw Error('unreachable');});
  must(false,'Member no. ซ้ำในโครงการปลายทาง');
 }
 return projectTransaction('copyMember',pid,data,requestId,['admin','qs'],async(tx,target,user)=>{
  must(target.version===input.targetProjectVersion,'ข้อมูลปลายทางเปลี่ยนแล้ว โหลดต้นแบบและปลายทางใหม่','aborted');
  const sourceSnapshot=pid===input.sourceProjectId?undefined:await tx.get(projectRef(input.sourceProjectId));
  const sourceProject=pid===input.sourceProjectId?target:sourceSnapshot?.exists()?decodeStorage(sourceSnapshot.data()) as Project:undefined;
  must(sourceProject,'ไม่พบโครงการต้นทาง','not-found');
  allow(sourceProject,user,['admin','qs','checker','approver','viewer']);writable(sourceProject);
  must(sourceProject.version===input.sourceProjectVersion,'ข้อมูลต้นทางเปลี่ยนแล้ว โหลดต้นแบบและปลายทางใหม่','aborted');
  const sourceDoc=await tx.get(recordRef(input.sourceProjectId,'members',input.sourceMemberId));
  must(sourceDoc.exists(),'ไม่พบสมาชิกต้นทาง','not-found');
  const source=decodeStorage(sourceDoc.data()) as Member;
  must(source.version===input.sourceMemberVersion,'สมาชิกต้นทางเปลี่ยนแล้ว โหลดต้นแบบและปลายทางใหม่','aborted');
  const ref=recordRef(pid,'members',input.memberId);must(!(await tx.get(ref)).exists(),'รหัสสมาชิกใหม่ถูกใช้แล้ว','already-exists');
  const member=copyMemberInputs(source,input);
  const errors=validateMember(member,target.spec);must(!errors.length,'ต้นแบบใช้กับ Spec ปลายทางไม่ได้: '+errors.slice(0,5).join('; '));
  member.version=1;member.updatedAt=now();
  member.copySource={version:1,projectId:sourceProject.id,projectCode:sourceProject.code,memberId:source.id,memberCode:source.code,projectVersion:sourceProject.version,memberVersion:source.version,copiedAt:member.updatedAt,copiedBy:user.uid};
  const saved=encode(member);must(new TextEncoder().encode(JSON.stringify(saved)).length<=700000,'สมาชิกใหญ่เกินกำหนด แยกสมาชิกก่อนบันทึก');
  tx.set(ref,saved);tx.update(projectRef(pid),{version:target.version+1});
  return {id:member.id,version:member.version,projectVersion:target.version+1,copySource:member.copySource};
 });
}
